/* Ta-da → 📊 Histórico (2.21): reencontrar o que você fez em QUALQUER semana, mês ou ano.
   Ideia de fundo (do livro "Hackeando Tudo", de Raiam Santos): trocar a lista do que falta (to-do) pela
   lista do que JÁ foi feito (done-list) — olhar para as próprias vitórias dá combustível para continuar.
   Por isso este painel só mostra o que foi feito: não há "dias perdidos", metas não cumpridas nem
   comparação que desanime (a comparação com o período anterior só aparece quando é para comemorar).

   DE ONDE VÊM OS NÚMEROS
   - Semana e mês: lidos dos documentos por dia (users/{uid}/tada e /gratitude) do período — a fonte da verdade,
     que NUNCA é apagada. Os dias dos últimos ~45 registros já estão ao vivo em `mine` (tada-data.js) e vencem o que veio da consulta.
   - Ano: lido das estatísticas SALVAS por mês (users/{uid}/tadaStats/{AAAA-MM}) — 12 leituras em vez de centenas.
     Mês sem estatística completa (conta antiga, ou regras novas ainda não publicadas) é calculado dos documentos
     por dia e salvo na hora (`full: true`). Dias recentes são conferidos com o que está ao vivo e reparados.
   - Estudo: sempre de profile.daily (já guardado para sempre; nada é duplicado).
   Se o Firestore recusar (regras antigas) ou estiver offline, nada quebra: o painel calcula com o que conseguir ler. */
import { db, collection, getDoc, getDocs, query, orderBy, limit, where, setDoc, serverTimestamp } from "./firebase.js";
import { store } from "./store.js";
import { $, esc, pad, todayKey, shiftDateKey, daysBetweenKeys, parseDateKey, weekdayOfKey, brNow, fmtHM, fmtMin, safeColor, normDay, subjectById } from "./utils.js";
import { WEEKDAYS, WEEKDAYS_FULL, MONTHS } from "./constants.js";
import {
  weightOf, mine, watchReady, WATCH_WINDOW_DAYS, sanitizeDay, summarizeDay, sameSummary, cleanSummary,
  statsRef, writeStats, studyRows, studyRowHTML, gratRowHTML
} from "./tada-data.js";
import { openSheet, goToDay } from "./tada.js";
import { setHTML } from "./dom.js";
import { count } from "./motion.js";

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ---------- estado só de interface ---------- */
const view = { mode: "week", anchor: null, showAll: {} };   // anchor null = hoje (acompanha a virada do dia)
let reqId = 0;            // descarta respostas atrasadas quando a pessoa já mudou de período
let shownKey = "";        // período que está na tela (evita piscar "Carregando…" a cada atualização)
let earliestCache;        // undefined = ainda não sabemos · null = sem nenhum dado · "AAAA-MM-DD"
let earliestUid = null;
const rawCache = new Map();   // "uid|de|ate" -> { at, ok, tada, grat }
const RAW_TTL = 60 * 1000;

export function resetHistory() {
  reqId++; shownKey = ""; earliestCache = undefined; earliestUid = null;
  view.mode = "week"; view.anchor = null; view.showAll = {};
  rawCache.clear();
  const box = $("tdHistBody");
  if (box) { box.innerHTML = ""; delete box.dataset.built; }
}

/* ============================================================
   períodos
============================================================ */
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

function periodOf(mode, anchor) {
  if (mode === "week") {
    const first = shiftDateKey(anchor, -((weekdayOfKey(anchor) + 6) % 7));   // semana de segunda a domingo, como no resto do app
    return { mode, first, last: shiftDateKey(first, 6) };
  }
  const [y, m] = parseDateKey(anchor);
  if (mode === "month") return { mode, first: `${y}-${pad(m)}-01`, last: `${y}-${pad(m)}-${pad(daysInMonth(y, m))}` };
  return { mode: "year", first: `${y}-01-01`, last: `${y}-12-31` };
}
const prevPeriod = (p) => periodOf(p.mode, shiftDateKey(p.first, -1));
const nextPeriod = (p) => periodOf(p.mode, shiftDateKey(p.last, 1));
const includes = (p, key) => key >= p.first && key <= p.last;

function titleOf(p, today) {
  const a = parseDateKey(p.first), b = parseDateKey(p.last);
  if (p.mode === "year") return { t: String(a[0]), s: includes(p, today) ? "este ano" : "" };
  if (p.mode === "month") return { t: `${MONTHS_FULL[a[1] - 1][0].toUpperCase()}${MONTHS_FULL[a[1] - 1].slice(1)} de ${a[0]}`, s: includes(p, today) ? "este mês" : "" };
  const t = a[1] === b[1] ? `${a[2]} a ${b[2]} de ${MONTHS_FULL[b[1] - 1]}` : `${a[2]} de ${MONTHS[a[1] - 1]} a ${b[2]} de ${MONTHS[b[1] - 1]}`;
  return { t, s: includes(p, today) ? "esta semana" : String(b[0]) };
}
function dayLong(k) {
  const p = parseDateKey(k);
  if (!p) return k;
  const w = WEEKDAYS_FULL[weekdayOfKey(k)];
  return `${w[0].toUpperCase()}${w.slice(1)}, ${p[2]} de ${MONTHS_FULL[p[1] - 1]} de ${p[0]}`;
}
const dayShort = (k) => { const p = parseDateKey(k); return p ? `${pad(p[2])}/${pad(p[1])}` : ""; };
const timeOf = (ts) => (ts ? fmtHM(brNow(new Date(ts))) : "");

/* ============================================================
   leitura dos dados
============================================================ */
async function ensureEarliest() {
  const uid = store.me?.uid;
  if (!uid) return null;
  if (earliestCache !== undefined && earliestUid === uid) return earliestCache;
  const study = Object.keys(store.profile?.daily || {}).filter((k) => KEY_RE.test(k) && normDay(store.profile.daily[k]).total > 0);
  try {
    const rs = await Promise.all(["tada", "gratitude"].map((sub) =>
      getDocs(query(collection(db, "users", uid, sub), orderBy("date", "asc"), limit(1)))));
    const keys = rs.map((r) => r.docs[0]?.data()?.date).filter((k) => KEY_RE.test(String(k)));
    // os dias ao vivo também contam (um dia recém-criado ainda pode não ter chegado à consulta)
    const live = [...Object.keys(mine.tada), ...Object.keys(mine.grat)].filter((k) => KEY_RE.test(k));
    earliestCache = [...keys, ...live, ...study].sort()[0] ?? null;
    earliestUid = uid;
  } catch {
    // sem rede/permissão: não guarda o resultado (tenta de novo depois) e usa o que já está na memória
    return [...Object.keys(mine.tada), ...Object.keys(mine.grat), ...study].filter((k) => KEY_RE.test(k)).sort()[0] ?? null;
  }
  return earliestCache;
}

// Documentos por dia de um período (consulta ao servidor/cache do Firestore, guardada 1 min na memória)
async function fetchRange(first, last) {
  const uid = store.me?.uid;
  const out = { at: Date.now(), ok: false, tada: {}, grat: {} };
  if (!uid) return out;
  const ck = `${uid}|${first}|${last}`;
  const hit = rawCache.get(ck);
  if (hit && Date.now() - hit.at < RAW_TTL) return hit;
  try {
    const rs = await Promise.all(["tada", "gratitude"].map((sub) => getDocs(query(collection(db, "users", uid, sub),
      where("date", ">=", first), where("date", "<=", last)))));
    rs[0].docs.forEach((d) => { if (KEY_RE.test(d.id)) out.tada[d.id] = sanitizeDay(d.data()); });
    rs[1].docs.forEach((d) => { if (KEY_RE.test(d.id)) out.grat[d.id] = sanitizeDay(d.data()); });
    out.ok = true;
    if (rawCache.size >= 40) rawCache.delete(rawCache.keys().next().value);
    rawCache.set(ck, out);
  } catch { /* offline ou regras: o chamador usa só o que está ao vivo */ }
  return out;
}

// o que está ao vivo (`mine`) é sempre mais novo que a consulta
function overlay(first, last, raw) {
  const tada = { ...raw.tada }, grat = { ...raw.grat };
  for (const k of Object.keys(mine.tada)) if (k >= first && k <= last) tada[k] = mine.tada[k];
  for (const k of Object.keys(mine.grat)) if (k >= first && k <= last) grat[k] = mine.grat[k];
  return { tada, grat };
}

// A partir de que dia `mine` é COMPLETO (o ouvinte lê os 45 documentos mais recentes: com menos que isso, tem tudo)
function liveFrom() {
  if (!watchReady.tada || !watchReady.grat) return null;
  const from = (bucket) => {
    const ks = Object.keys(mine[bucket]).sort();
    return ks.length >= WATCH_WINDOW_DAYS ? ks[0] : "0000-00-00";
  };
  return [from("tada"), from("grat")].sort().pop();
}

/* ============================================================
   contas
============================================================ */
function aggregate(first, last, data) {
  const daily = store.profile?.daily || {};
  const A = { first, last, days: [], n: 0, sc: 0, w: [0, 0, 0], st: 0, q: 0, g: 0, active: 0, withN: 0, study: 0, studyDays: 0,
    best: null, streak: 0, subjects: {}, stars: [], big: [], wraps: [], grats: [] };
  let run = 0;
  for (let k = first, i = 0; k <= last && i < 400; k = shiftDateKey(k, 1), i++) {
    const t = data.tada[k], g = data.grat[k];
    const sum = summarizeDay(t, g);
    const study = Math.round(normDay(daily[k]).total);
    const active = !!sum || study > 0;
    A.days.push({ k, sum, study, active });
    if (sum) {
      A.n += sum.n; A.sc += sum.sc; A.w[0] += sum.w1; A.w[1] += sum.w2; A.w[2] += sum.w3; A.st += sum.st; A.q += sum.q; A.g += sum.g;
      if (sum.n > 0) { A.withN++; if (!A.best || sum.n >= A.best.n) A.best = { k, n: sum.n }; }
    }
    if (study > 0) { A.study += study; A.studyDays++; }
    if (active) { A.active++; run++; A.streak = Math.max(A.streak, run); } else run = 0;
    for (const x of t?.items || []) {
      if (x.s) A.subjects[x.s] = (A.subjects[x.s] || 0) + 1;
      const row = { k, t: String(x.t || ""), w: weightOf(x.w).w, ts: x.ts || 0 };
      if (x.star) A.stars.push(row); else if (row.w === 3) A.big.push(row);
    }
    if (String(t?.wrap || "").trim()) A.wraps.push({ k, wrap: String(t.wrap) });
    for (const x of g?.items || []) A.grats.push({ k, what: String(x.what || ""), how: String(x.how || ""), ts: x.ts || 0 });
  }
  const newest = (a, b) => (a.k === b.k ? (b.ts || 0) - (a.ts || 0) : a.k < b.k ? 1 : -1);
  A.stars.sort(newest); A.big.sort(newest); A.grats.sort(newest);
  A.wraps.sort((a, b) => (a.k < b.k ? 1 : -1));
  return A;
}

const TIERS = { week: [7, 21], month: [25, 80], year: [250, 800] };
const tierIco = (n, mode) => (n === 0 ? "🌤️" : n < TIERS[mode][0] ? "🌱" : n < TIERS[mode][1] ? "🌿" : "🌳");
const HERO_LINES = [
  "Cada linha aqui é prova do que você fez. Isso conta.",
  "Pequeno também conta — e agora você tem a prova.",
  "Olhar para o que já foi feito dá fôlego para o que vem."
];
const heroLine = (n) => (n === 0
  ? "Nada registrado neste período — e tudo bem. A lista começa com uma pequena vitória."
  : HERO_LINES[n % HERO_LINES.length]);
const per = { week: "na semana", month: "no mês", year: "no ano" };

/* ============================================================
   HTML
============================================================ */
function cardHTML(k, v, s = "") {
  return `<div class="thCard"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span>${s ? `<span class="s">${esc(s)}</span>` : ""}</div>`;
}
function listSection(id, title, rows, limitN) {
  if (!rows.length) return "";
  const all = !!view.showAll[id];
  const shown = all ? rows : rows.slice(0, limitN);
  return `<p class="thSec">${esc(title)}</p><div class="tSec">${shown.join("")}</div>
    ${rows.length > limitN ? `<button type="button" class="linkish" data-more="${id}">${all ? "Mostrar menos" : `Mostrar todos (${rows.length})`}</button>` : ""}`;
}
const thRow = (d, main, sub = "") => `<div class="thRow"><span class="d">${esc(d)}</span><span class="t">${esc(main)}${sub ? `<em>${esc(sub)}</em>` : ""}</span></div>`;

function calendarHTML(A, mode) {
  const today = todayKey();
  const lead = mode === "month" ? (weekdayOfKey(A.first) + 6) % 7 : 0;
  const heads = [1, 2, 3, 4, 5, 6, 0].map((d) => `<span class="wd">${WEEKDAYS[d]}</span>`).join("");
  const blanks = Array.from({ length: lead }, () => `<span class="thCell blank" aria-hidden="true"></span>`).join("");
  const cells = A.days.map((d, idx) => {
    const n = d.sum?.n || 0, lvl = n + (d.study > 0 ? 1 : 0);
    const cls = lvl >= 6 ? "l3" : lvl >= 3 ? "l2" : lvl >= 1 ? "l1" : "";
    const future = d.k > today;
    const label = `${dayLong(d.k)}${n ? `, ${pl(n, "conquista", "conquistas")}` : ""}${d.study ? `, estudo ${fmtMin(d.study)}` : ""}`;
    return `<button type="button" class="thCell ${cls} ${d.k === today ? "today" : ""} ${future ? "off" : ""}" style="--i:${idx}" data-day="${d.k}" ${future ? "disabled" : ""} aria-label="${esc(label)}">
      ${parseDateKey(d.k)[2]}<small>${n ? n : d.study > 0 ? "📚" : ""}</small></button>`;
  }).join("");
  return `<div class="thCal">${heads}${blanks}${cells}</div>`;
}

function periodBody(p, A, prevA, partial) {
  const mode = p.mode;
  const cmp = prevA && prevA.n > 0 && A.n > prevA.n
    ? `<p class="thHeroUp">▲ ${A.n - prevA.n} a mais que ${mode === "week" ? "na semana" : "no mês"} anterior</p>` : "";
  const hero = `<div class="thHero"><div class="thHeroIco" aria-hidden="true">${tierIco(A.n, mode)}</div><div>
    <p class="thHeroN"><span class="thN">${A.n}</span> <small>${A.n === 1 ? "conquista" : "conquistas"} ${per[mode]}</small></p>
    <p class="thHeroTxt">${esc(heroLine(A.n))}</p>${cmp}</div></div>`;

  const avg = A.withN ? (A.n / A.withN).toFixed(1).replace(".", ",") : "0";
  const cards = `<div class="thGrid">
    ${cardHTML("Dias com vitórias", String(A.active), A.active === 1 ? "dia" : "dias")}
    ${cardHTML("Média por dia", avg, "conquistas nos dias com registro")}
    ${cardHTML("Estudo", A.study ? fmtMin(A.study) : "—", A.studyDays ? pl(A.studyDays, "dia", "dias") : "")}
    ${cardHTML("Gratidões", String(A.g), A.g ? "momentos de gratidão" : "")}
    ${cardHTML("Melhor dia", A.best ? pl(A.best.n, "conquista", "conquistas") : "—", A.best ? dayShort(A.best.k) : "")}
    ${cardHTML("Maior sequência", A.streak ? pl(A.streak, "dia", "dias") : "—", A.streak ? "seguidos com vitórias" : "")}
  </div>`;

  let weights = "";
  if (A.n > 0) {
    const pct = A.w.map((c) => (c / A.n) * 100);
    weights = `<p class="thSec">O quanto cada coisa te tocou</p>
      <div class="thBar" role="img" aria-label="${A.w[0]} pequenas, ${A.w[1]} médias, ${A.w[2]} grandes">
        <i class="b1" style="width:${pct[0].toFixed(2)}%;--i:0"></i><i class="b2" style="width:${pct[1].toFixed(2)}%;--i:1"></i><i class="b3" style="width:${pct[2].toFixed(2)}%;--i:2"></i></div>
      <div class="thLegend"><span>🌱 ${A.w[0]} pequenas</span><span>🌿 ${A.w[1]} médias</span><span>🌳 ${A.w[2]} grandes</span>
        ${A.st ? `<span>⭐ ${A.st} destaques</span>` : ""}${A.q ? `<span>☑️ ${A.q} rápidas</span>` : ""}</div>`;
  }

  const cal = `<p class="thSec">Seus dias — toque para rever</p>${calendarHTML(A, mode)}`;

  const subj = Object.entries(A.subjects).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([sid, c]) => {
    const s = subjectById(sid);
    return `<div class="thRow"><span class="d"><i class="tdDot" style="background:${safeColor(s.color)}"></i></span><span class="t">${esc(s.name)}<em>${pl(c, "conquista", "conquistas")}</em></span></div>`;
  });
  const heroRows = (A.stars.length ? A.stars : A.big).map((x) => thRow(dayShort(x.k), `${weightOf(x.w).ico} ${x.t}`));
  const wraps = A.wraps.map((x) => thRow(dayShort(x.k), `“${x.wrap}”`));
  const grats = A.grats.map((x) => thRow(dayShort(x.k), `🙏 ${x.what}`, x.how));

  return hero + cards + weights + cal
    + (subj.length ? `<p class="thSec">📚 Do que você falou mais</p><div class="tSec">${subj.join("")}</div>` : "")
    + listSection("hero", A.stars.length ? "⭐ Seus destaques" : "🌳 Vitórias que marcaram", heroRows, 6)
    + listSection("wrap", "💬 Como foram seus dias", wraps, 5)
    + listSection("grat", "🙏 Pelo que você foi grato", grats, 5)
    + (partial ? `<p class="thNote">Sem conexão agora: mostrando só o que está neste aparelho. Ao voltar a internet, abra de novo para ver tudo.</p>` : "")
    + footNote();
}

const footNote = () => `<p class="thNote">Tudo isso fica guardado na sua conta — daqui a um mês, um ano, é só voltar aqui. Ideia de fundo: a done-list do livro <i>Hackeando Tudo</i> (Raiam Santos), que troca a lista do que falta pela lista do que você já fez.</p>`;

/* ============================================================
   Ano: estatísticas salvas por mês
============================================================ */
// resumos (por dia) de um mês: lê o salvo; se não estiver completo, calcula dos documentos por dia e salva
async function monthSummaries(ym) {
  const uid = store.me?.uid;
  const [y, m] = ym.split("-").map(Number);
  const first = `${ym}-01`, last = `${ym}-${pad(daysInMonth(y, m))}`;
  let stored = null, readOk = true;
  try { const snap = await getDoc(statsRef(uid, ym)); if (snap.exists()) stored = snap.data(); } catch { readOk = false; }
  const days = {};
  if (stored && stored.full === true && stored.days && typeof stored.days === "object") {
    for (const dd of Object.keys(stored.days)) {
      const c = /^\d{2}$/.test(dd) ? cleanSummary(stored.days[dd]) : null;
      if (c) days[dd] = c;
    }
    // confere os dias que estão ao vivo e repara o salvo se divergir (ex.: o app fechou antes de gravar o último resumo)
    const from = liveFrom();
    if (from) {
      const today = todayKey();
      for (let k = first; k <= last && k <= today; k = shiftDateKey(k, 1)) {
        if (k < from) continue;
        const live = summarizeDay(mine.tada[k], mine.grat[k]);
        const dd = k.slice(8, 10);
        if (sameSummary(live, days[dd] || null)) continue;
        if (live) days[dd] = live; else delete days[dd];
        if (readOk && store.me?.uid === uid) writeStats(uid, k, live);
      }
    }
    return days;
  }
  const raw = await fetchRange(first, last);
  const data = overlay(first, last, raw);
  for (const k of new Set([...Object.keys(data.tada), ...Object.keys(data.grat)])) {
    const s = k.startsWith(ym) ? summarizeDay(data.tada[k], data.grat[k]) : null;
    if (s) days[k.slice(8, 10)] = s;
  }
  // só grava como "completo" se a consulta funcionou (senão salvaria um mês vazio por engano)
  if (raw.ok && readOk && store.me?.uid === uid) {
    setDoc(statsRef(uid, ym), { month: ym, days, full: true, upd: serverTimestamp() }).catch(() => {});
  }
  return days;
}

// Totais do Ta-da de UM mês, para o cartão "Resumo do mês" (wrapped.js). null = sem dados/sem conexão (o cartão sai sem essa linha).
export async function monthTotals(ym) {
  if (!store.me?.uid || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const earliest = await ensureEarliest();
  if (!earliest || ym < earliest.slice(0, 7) || ym > todayKey().slice(0, 7)) return null;
  const days = await monthSummaries(ym);
  const t = { n: 0, g: 0, w3: 0, st: 0, days: 0 };
  for (const s of Object.values(days)) { t.n += s.n; t.g += s.g; t.w3 += s.w3; t.st += s.st; if (s.n || s.g) t.days++; }
  return t;
}

async function yearBody(p, earliest) {
  const y = Number(p.first.slice(0, 4));
  const today = todayKey(), curYm = today.slice(0, 7), eYm = earliest ? earliest.slice(0, 7) : null;
  const yms = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`);
  const valid = yms.filter((ym) => eYm && ym >= eYm && ym <= curYm);
  const res = await Promise.all(valid.map((ym) => monthSummaries(ym).catch(() => ({}))));
  const byYm = Object.fromEntries(valid.map((ym, i) => [ym, res[i]]));

  const tot = { n: 0, g: 0, w3: 0, st: 0 };
  const activeDays = new Set();
  const per12 = yms.map((ym) => {
    const days = byYm[ym] || {};
    let n = 0;
    for (const [dd, s] of Object.entries(days)) { n += s.n; tot.n += s.n; tot.g += s.g; tot.w3 += s.w3; tot.st += s.st; activeDays.add(`${ym}-${dd}`); }
    return { ym, n, valid: valid.includes(ym) };
  });
  const daily = store.profile?.daily || {};
  let study = 0;
  for (const k of Object.keys(daily)) {
    if (!k.startsWith(`${y}-`) || !KEY_RE.test(k)) continue;
    const t = normDay(daily[k]).total;
    if (t > 0) { study += t; activeDays.add(k); }
  }
  const max = Math.max(1, ...per12.map((m) => m.n));
  const bestM = per12.reduce((a, b) => (b.n > a.n ? b : a), { n: 0 });
  const bars = per12.map((m, i) => `<button type="button" class="${m.n ? "" : "empty"}" data-ym="${m.ym}" ${m.valid ? "" : "disabled"} aria-label="${esc(MONTHS_FULL[i])}: ${pl(m.n, "conquista", "conquistas")}">
      <b>${m.n || ""}</b><i style="height:${m.n ? Math.max(6, Math.round((m.n / max) * 100)) : 4}px;--i:${i}"></i><span>${MONTHS[i]}</span></button>`).join("");

  const hero = `<div class="thHero"><div class="thHeroIco" aria-hidden="true">${tierIco(tot.n, "year")}</div><div>
    <p class="thHeroN"><span class="thN">${tot.n}</span> <small>${tot.n === 1 ? "conquista" : "conquistas"} ${per.year}</small></p>
    <p class="thHeroTxt">${esc(heroLine(tot.n))}</p></div></div>`;
  const cards = `<div class="thGrid">
    ${cardHTML("Dias com vitórias", String(activeDays.size), activeDays.size === 1 ? "dia" : "dias")}
    ${cardHTML("Estudo", study ? fmtMin(study) : "—")}
    ${cardHTML("Gratidões", String(tot.g))}
    ${cardHTML("Vitórias grandes", `🌳 ${tot.w3}`, tot.st ? `${tot.st} destaques ⭐` : "")}
    ${cardHTML("Melhor mês", bestM.n ? MONTHS_FULL[Number(bestM.ym.slice(5)) - 1] : "—", bestM.n ? pl(bestM.n, "conquista", "conquistas") : "")}
  </div>`;
  return hero + cards
    + `<p class="thSec">Mês a mês — toque para ver os detalhes</p><div class="thYear">${bars}</div>`
    + `<p class="thNote">As estatísticas de cada mês ficam salvas na sua conta (um resumo por dia), então o ano inteiro abre rápido.</p>` + footNote();
}

/* ============================================================
   Detalhe de um dia (somente leitura) — vale para QUALQUER dia, antigo ou não
============================================================ */
async function openDay(k) {
  const sh = openSheet(dayLong(k));
  sh.body.innerHTML = `<p class="thLoading">Carregando…</p>`;
  const raw = await fetchRange(k, k);
  if (!sh.body.isConnected) return;   // a folha foi fechada enquanto carregava
  const data = overlay(k, k, raw);
  const wins = (data.tada[k]?.items || []).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const wrap = String(data.tada[k]?.wrap || "").trim();
  const grat = (data.grat[k]?.items || []).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const study = studyRows(store.profile, k, true);
  const winRow = (x) => {
    const wt = weightOf(x.w), s = x.s ? subjectById(x.s) : null;
    return `<div class="tdRow ${x.star ? "star" : ""}"><span class="tdW" title="${esc(wt.name)}">${wt.ico}</span>
      <span class="tdMain"><span class="tdT">${esc(x.t)}</span><span class="tdMeta">${x.ts ? `<span class="mTime">${esc(timeOf(x.ts))}</span>` : ""}${s ? `<span class="tdTag"><i style="background:${safeColor(s.color)}"></i>${esc(s.name)}</span>` : ""}</span></span>
      ${x.star ? `<span class="tdStar" aria-label="destaque do dia">⭐</span>` : ""}</div>`;
  };
  const today = todayKey(), d = daysBetweenKeys(k, today);
  const editable = d >= 0 && d <= 6;
  const empty = !wins.length && !wrap && !grat.length && !study.length;
  sh.body.innerHTML = `
    ${study.length ? `<div class="tSec"><div class="tSecHead"><span>📚 Seu estudo</span></div>${study.map(studyRowHTML).join("")}</div>` : ""}
    ${wins.length ? `<div class="tSec"><div class="tSecHead"><span>✨ O que você fez</span></div>${wins.map(winRow).join("")}</div>` : ""}
    ${wrap ? `<p class="tdFriendWrap">“${esc(wrap)}”</p>` : ""}
    ${grat.length ? `<div class="tSec"><div class="tSecHead"><span>🙏 Gratidão</span></div>${grat.map(gratRowHTML).join("")}</div>` : ""}
    ${empty ? `<p class="muted" style="text-align:center;margin:18px 0">${raw.ok ? "Nada registrado neste dia." : "Não consegui carregar este dia agora (sem conexão?)."}</p>` : ""}
    ${editable ? `<button type="button" class="act" id="thEdit" style="width:100%;margin-top:14px">✍️ Abrir na Done-list para editar</button>` : ""}`;
  sh.body.querySelector("#thEdit")?.addEventListener("click", () => { sh.close(); goToDay(k); });
}

/* ============================================================
   tela
============================================================ */
function headerHTML(p, earliest, today) {
  const t = titleOf(p, today);
  const canPrev = !!earliest && p.first > earliest;
  const canNext = p.last < today;
  const seg = [["week", "Semana"], ["month", "Mês"], ["year", "Ano"]]
    .map(([id, name]) => `<button type="button" class="${view.mode === id ? "on" : ""}" data-mode="${id}" aria-pressed="${view.mode === id}">${name}</button>`).join("");
  return `<div class="thSeg" role="group" aria-label="Período">${seg}</div>
    <div class="thNav">
      <button type="button" class="thArrow" data-nav="-1" ${canPrev ? "" : "disabled"} aria-label="Período anterior">‹</button>
      <div class="thTitle"><b>${esc(t.t)}</b>${t.s ? `<span>${esc(t.s)}</span>` : ""}</div>
      <button type="button" class="thArrow" data-nav="1" ${canNext ? "" : "disabled"} aria-label="Próximo período">›</button>
    </div>
    ${includes(p, today) ? "" : `<div style="text-align:center;margin:-6px 0 10px"><button type="button" class="linkish thToday" data-nav="today">Voltar para hoje</button></div>`}`;
}

export async function renderHistory() {
  const box = $("tdHistBody");
  if (!box || !store.profile || !store.me) return;
  const req = ++reqId;
  const earliest = await ensureEarliest();
  if (req !== reqId) return;

  const today = todayKey();
  const p = periodOf(view.mode, view.anchor || today);
  if (!box.dataset.built) {
    box.dataset.built = "1";
    box.innerHTML = `<div id="thHead"></div><div id="thContent"></div>`;
    box.addEventListener("click", onClick);
  }
  setHTML($("thHead"), headerHTML(p, earliest, today));

  const key = `${p.mode}|${p.first}`;
  const fresh = shownKey !== key;   // período novo (não é só uma atualização ao vivo): vale animar a chegada dos números
  if (fresh) { view.showAll = {}; setHTML($("thContent"), `<p class="thLoading">Carregando…</p>`); }

  let html;
  try {
    if (p.mode === "year") html = await yearBody(p, earliest);
    else {
      const prev = prevPeriod(p);
      const hasPrev = !!earliest && prev.last >= earliest;
      const [raw, rawPrev] = await Promise.all([fetchRange(p.first, p.last), hasPrev ? fetchRange(prev.first, prev.last) : null]);
      const A = aggregate(p.first, p.last, overlay(p.first, p.last, raw));
      const B = rawPrev && rawPrev.ok ? aggregate(prev.first, prev.last, overlay(prev.first, prev.last, rawPrev)) : null;
      html = periodBody(p, A, B, !raw.ok);
    }
  } catch {
    html = `<div class="tEmpty"><p class="tEmptyIco">🌤️</p><p class="tEmptyT">Não consegui carregar agora.</p>
      <button type="button" class="linkish" data-nav="retry">Tentar de novo</button></div>`;
  }
  if (req !== reqId) return;
  const box2 = $("thContent");
  const changed = setHTML(box2, html);   // idêntico ao que já está na tela: não mexe em nada
  shownKey = key;
  if (changed && fresh) {
    // números contam (JS, poucos elementos); barras e calendário entram por CSS (class "enter" → index.html), que é bem
    // mais barato que criar dezenas de animações em JavaScript no mesmo quadro. Suave/reduzir movimento: o CSS nem liga.
    count(box2, ".thN,.thCard .v");
    box2.classList.add("enter");
    clearTimeout(box2.__enterT);
    box2.__enterT = setTimeout(() => box2.classList.remove("enter"), 1500);
  }
}

function onClick(e) {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  const today = todayKey();
  if (b.dataset.mode) {
    view.mode = b.dataset.mode; shownKey = "";
    renderHistory();
  } else if (b.dataset.nav) {
    const p = periodOf(view.mode, view.anchor || today);
    if (b.dataset.nav === "today") view.anchor = null;
    else if (b.dataset.nav !== "retry") {
      const np = b.dataset.nav === "1" ? nextPeriod(p) : prevPeriod(p);
      view.anchor = includes(np, today) ? null : np.first;
    }
    shownKey = "";
    renderHistory();
  } else if (b.dataset.day) {
    openDay(b.dataset.day);
  } else if (b.dataset.ym) {
    view.mode = "month"; view.anchor = `${b.dataset.ym}-01`;
    if (includes(periodOf("month", view.anchor), today)) view.anchor = null;
    shownKey = "";
    renderHistory();
  } else if (b.dataset.more) {
    view.showAll[b.dataset.more] = !view.showAll[b.dataset.more];
    renderHistory();
  }
}
