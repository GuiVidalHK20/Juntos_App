/* Ta-da (done-list) e Diário de gratidão — camada de dados.
   Substitui a antiga aba Planejar (js/planner.js).

   ONDE FICA CADA COISA (Firestore) — um documento por DIA, em duas subcoleções:
     users/{uid}/tada/{AAAA-MM-DD}      → conquistas do dia: { date, items:[…], wrap, upd }
     users/{uid}/gratitude/{AAAA-MM-DD} → gratidões do dia:  { date, items:[…], upd }
   Por que um documento por dia (e não uma lista única no perfil, como o Planejar fazia): o limite de
   um documento do Firestore é 1 MB; uma lista única cresceria até estourar em cerca de um ano de uso.
   Por dia, cada documento tem poucos KB para sempre e só os últimos dias são lidos.

   ESTATÍSTICAS SALVAS (2.21) — users/{uid}/tadaStats/{AAAA-MM}: { month, days:{ "DD": resumo }, full?, upd }.
   Um documento por MÊS com o resumo numérico de cada dia (summarizeDay). É derivado dos documentos por dia
   (que continuam sendo a fonte da verdade) e serve para ver o ano inteiro lendo só 12 documentos. Só o dono lê.
   Gravado junto de cada alteração (writeDay → scheduleStats); js/tada-history.js completa/repara quando precisa.

   QUEM VÊ: só o dono, e quem ele liberar — `tadaSharedWith` (done-list) e `gratSharedWith`
   (gratidão) no perfil, listas separadas porque a gratidão é mais íntima. Regras em
   regras-firestore.txt (passo manual: colar no console do Firebase).

   O que o app já sabe NÃO é gravado de novo: o estudo do dia ("Estudei Matemática · 50 min")
   vem de `profile.daily` (derivado na hora, ver studyRows) e entra na done-list sozinho. */
import { db, doc, collection, setDoc, getDoc, getDocs, onSnapshot, query, orderBy, limit, where, arrayUnion, serverTimestamp, deleteField } from "./firebase.js";
import { store, emit } from "./store.js";
import { esc, safeColor, safeNum, todayKey, normDay, subjectById, subjectsWithArchive, fmtMin } from "./utils.js";
import { GERAL } from "./constants.js";

/* ---------- limites (as regras do Firestore conferem os mesmos números) ---------- */
export const MAX_ITEM = 140;       // texto de uma conquista
export const MAX_WRAP = 240;       // frase de fim de dia
export const MAX_WHAT = 200;       // "sou grato por…"
export const MAX_HOW = 300;        // "isso afeta minha vida porque…"
export const MAX_ITEMS_DAY = 60;   // conquistas por dia
export const MAX_GRAT_DAY = 30;    // gratidões por dia

/* ---------- peso: o quanto aquilo te tocou (nada é pequeno demais para entrar) ---------- */
export const WEIGHTS = [
  { w: 1, ico: "🌱", name: "Pequeno", hint: "mínimo, mas contou" },
  { w: 2, ico: "🌿", name: "Médio", hint: "fez diferença no dia" },
  { w: 3, ico: "🌳", name: "Grande", hint: "marcou o dia" }
];
export const weightOf = (w) => WEIGHTS.find((x) => x.w === Number(w)) || WEIGHTS[0];

/* ---------- estilo 2 ("Marcar"): vitórias miúdas prontas, um toque cada ---------- */
export const PRESET_GROUPS = [
  { id: "corpo", name: "Corpo", ico: "💧", items: [
    { id: "agua", ico: "💧", t: "Bebi água" }, { id: "mexi", ico: "🚶", t: "Me movimentei" },
    { id: "dormi", ico: "😴", t: "Descansei de verdade" }, { id: "comi", ico: "🥗", t: "Comi algo que me fez bem" } ] },
  { id: "mente", name: "Mente", ico: "🧠", items: [
    { id: "respirei", ico: "🌬️", t: "Respirei fundo" }, { id: "comecei", ico: "🚀", t: "Comecei mesmo sem vontade" },
    { id: "pausa", ico: "☕", t: "Fiz uma pausa sem culpa" }, { id: "gentil", ico: "💛", t: "Fui gentil comigo" } ] },
  { id: "estudo", name: "Estudo", ico: "📚", items: [
    { id: "revisei", ico: "🔁", t: "Revisei uma matéria" }, { id: "duvida", ico: "❓", t: "Tirei uma dúvida" },
    { id: "organizei", ico: "🗂️", t: "Organizei meus materiais" }, { id: "entendi", ico: "💡", t: "Finalmente entendi algo" } ] },
  { id: "pessoas", name: "Pessoas e casa", ico: "🤝", items: [
    { id: "ajudei", ico: "🤝", t: "Ajudei alguém" }, { id: "pedi", ico: "🙋", t: "Pedi ajuda" },
    { id: "conversei", ico: "💬", t: "Conversei com alguém querido" }, { id: "arrumei", ico: "🧹", t: "Arrumei algo" } ] }
];
const PRESET_BY_ID = Object.fromEntries(PRESET_GROUPS.flatMap((g) => g.items.map((i) => [i.id, i])));
export const presetById = (id) => PRESET_BY_ID[id] || null;

/* ---------- identificadores ---------- */
const rid = (p) => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

const tadaRef = (uid, key) => doc(db, "users", uid, "tada", key);
const gratRef = (uid, key) => doc(db, "users", uid, "gratitude", key);

/* ============================================================
   MEUS DADOS — ouvintes em tempo real (últimos 45 dias) + cache em memória
   Os ouvintes dão sincronia entre aparelhos e funcionam offline (cache do Firestore).
============================================================ */
const WATCH_DAYS = 45;
export const mine = { tada: {}, grat: {} };   // { "AAAA-MM-DD": doc }
export const WATCH_WINDOW_DAYS = WATCH_DAYS;
let unsubs = [];
// true depois que o servidor/cache respondeu pela primeira vez (até lá `mine` está vazio por falta de dados, não por não haver dias)
export const watchReady = { tada: false, grat: false };

export function sanitizeDay(d) {
  const items = Array.isArray(d?.items) ? d.items : [];
  return { ...d, items: items.filter((x) => x && typeof x === "object" && typeof x.id === "string") };
}

export function startWatching() {
  stopWatching();
  const uid = store.me?.uid;
  if (!uid) return;
  const mk = (sub, bucket) => onSnapshot(
    query(collection(db, "users", uid, sub), orderBy("date", "desc"), limit(WATCH_DAYS)),
    (snap) => {
      const next = {};
      snap.docs.forEach((d) => { next[d.id] = sanitizeDay(d.data()); });
      mine[bucket] = next;
      watchReady[bucket] = true;
      emit("tada:changed", bucket);
    },
    () => { /* sem acesso (regras antigas ainda publicadas): a aba mostra vazio, sem quebrar */ }
  );
  unsubs = [mk("tada", "tada"), mk("gratitude", "grat")];
}
export function stopWatching() {
  flushAllStats();   // grava os resumos que ainda esperavam o atraso (só se a mesma pessoa continua logada)
  unsubs.forEach((u) => { try { u(); } catch {} });
  unsubs = [];
  mine.tada = {}; mine.grat = {};
  watchReady.tada = false; watchReady.grat = false;
  statTimers.forEach((t) => clearTimeout(t.id)); statTimers.clear();
}

export const dayItems = (key) => (mine.tada[key]?.items || []).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
export const dayWrap = (key) => String(mine.tada[key]?.wrap || "");
export const dayGrat = (key) => (mine.grat[key]?.items || []).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));

/* ============================================================
   ESCRITA — sempre otimista (atualiza `mine` antes) e SEM await em quem chama:
   offline a promessa só resolve na volta da internet (ver CLAUDE.md).
============================================================ */
function writeDay(sub, key, patch) {
  const uid = store.me?.uid;
  if (!uid || !KEY_RE.test(key)) return Promise.resolve();
  const ref = sub === "tada" ? tadaRef(uid, key) : gratRef(uid, key);
  scheduleStats(uid, key);   // `mine` já foi atualizado por quem chamou: o resumo do mês acompanha
  return setDoc(ref, { date: key, ...patch, upd: serverTimestamp() }, { merge: true }).catch(() => {});
}

export function addWin({ text, w = 1, kind = "free", q = null, s = null }, key = todayKey()) {
  const t = clip(text, MAX_ITEM);
  if (!t) return null;
  if (dayItems(key).length >= MAX_ITEMS_DAY) return null;
  const item = { id: rid("w"), t, ts: Date.now(), w: Math.min(3, Math.max(1, Number(w) || 1)), k: kind === "quick" ? "quick" : "free" };
  if (q) item.q = String(q).slice(0, 24);
  if (s) item.s = String(s).slice(0, 64);
  const cur = mine.tada[key] || { date: key, items: [] };
  mine.tada = { ...mine.tada, [key]: { ...cur, items: [...cur.items, item] } };
  emit("tada:changed", "tada");
  writeDay("tada", key, { items: arrayUnion(item) });   // arrayUnion: dois aparelhos adicionando ao mesmo tempo não se atropelam
  return item;
}
function rewriteWins(key, items) {
  const cur = mine.tada[key] || { date: key };
  mine.tada = { ...mine.tada, [key]: { ...cur, items } };
  emit("tada:changed", "tada");
  return writeDay("tada", key, { items });
}
export function removeWin(key, id) { return rewriteWins(key, dayItems(key).filter((x) => x.id !== id)); }
export function updateWin(key, id, patch) {
  const next = dayItems(key).map((x) => (x.id === id ? { ...x, ...patch, t: patch.t != null ? clip(patch.t, MAX_ITEM) || x.t : x.t } : x));
  return rewriteWins(key, next);
}
// estilo 3: no máximo 3 destaques por dia
export function toggleStar(key, id) {
  const items = dayItems(key);
  const it = items.find((x) => x.id === id);
  if (!it) return false;
  if (!it.star && items.filter((x) => x.star).length >= 3) return false;
  rewriteWins(key, items.map((x) => (x.id === id ? (x.star ? (({ star, ...r }) => r)(x) : { ...x, star: true }) : x)));
  return true;
}
// estilo 2: tocar de novo no atalho desfaz
export function toggleQuick(key, presetId) {
  const p = presetById(presetId);
  if (!p) return;
  const have = dayItems(key).find((x) => x.k === "quick" && x.q === presetId);
  if (have) removeWin(key, have.id);
  else addWin({ text: p.t, w: 1, kind: "quick", q: presetId }, key);
}
export function setWrap(key, text) {
  const wrap = clip(text, MAX_WRAP);
  const cur = mine.tada[key] || { date: key, items: [] };
  mine.tada = { ...mine.tada, [key]: { ...cur, wrap } };
  emit("tada:changed", "tada");
  return writeDay("tada", key, { wrap });
}

export function addGratitude({ what, how, src = "free", subjectId = null, subjectName = null, subjectColor = null }, key = todayKey()) {
  const a = clip(what, MAX_WHAT), b = clip(how, MAX_HOW);
  if (!a) return null;
  if (dayGrat(key).length >= MAX_GRAT_DAY) return null;
  const item = { id: rid("g"), what: a, how: b, ts: Date.now(), src: src === "study" ? "study" : "free" };
  if (subjectId) { item.s = String(subjectId).slice(0, 64); item.sn = clip(subjectName, 60); item.sc = String(subjectColor || "").slice(0, 16); }
  const cur = mine.grat[key] || { date: key, items: [] };
  mine.grat = { ...mine.grat, [key]: { ...cur, items: [...cur.items, item] } };
  emit("tada:changed", "grat");
  writeDay("grat", key, { items: arrayUnion(item) });
  return item;
}
function rewriteGrat(key, items) {
  const cur = mine.grat[key] || { date: key };
  mine.grat = { ...mine.grat, [key]: { ...cur, items } };
  emit("tada:changed", "grat");
  return writeDay("grat", key, { items });
}
export function removeGratitude(key, id) { return rewriteGrat(key, dayGrat(key).filter((x) => x.id !== id)); }
export function updateGratitude(key, id, { what, how }) {
  const a = clip(what, MAX_WHAT);
  if (!a) return null;
  return rewriteGrat(key, dayGrat(key).map((x) => (x.id === id ? { ...x, what: a, how: clip(how, MAX_HOW) } : x)));
}

/* ============================================================
   ESTATÍSTICAS SALVAS — resumo numérico de cada dia, guardado por mês (2.21)
   Campos do resumo (nomes curtos de propósito; o limite de 1 MB do documento nunca é problema):
     n conquistas escritas · sc soma dos pesos · w1/w2/w3 quantas por peso · st destaques ⭐ ·
     q vitórias do estilo "Marcar" · g gratidões · wr 1 se há frase de fecho
   O estudo do dia NÃO entra aqui: já vive para sempre em profile.daily.
============================================================ */
export const STAT_KEYS = ["n", "sc", "w1", "w2", "w3", "st", "q", "g", "wr"];
export const statsRef = (uid, ym) => doc(db, "users", uid, "tadaStats", ym);

// `t` e `g` são os documentos do dia (já passados por sanitizeDay); devolve null se o dia não tem nada
export function summarizeDay(t, g) {
  const items = Array.isArray(t?.items) ? t.items.filter((x) => x && typeof x === "object") : [];
  const gn = Array.isArray(g?.items) ? g.items.filter((x) => x && typeof x === "object").length : 0;
  const wr = String(t?.wrap || "").trim() ? 1 : 0;
  if (!items.length && !gn && !wr) return null;
  const s = { n: items.length, sc: 0, w1: 0, w2: 0, w3: 0, st: 0, q: 0, g: gn, wr };
  for (const x of items) {
    const w = weightOf(x.w).w;
    s.sc += w; s["w" + w]++;
    if (x.star) s.st++;
    if (x.k === "quick") s.q++;
  }
  return s;
}
export function sameSummary(a, b) {
  if (!a || !b) return !a && !b;
  return STAT_KEYS.every((k) => (Number(a[k]) || 0) === (Number(b[k]) || 0));
}
// resumo vindo do Firestore: só números inteiros, nos campos conhecidos (nada de fora entra nas contas)
export function cleanSummary(raw) {
  if (!raw || typeof raw !== "object") return null;
  const s = {};
  STAT_KEYS.forEach((k) => { s[k] = Math.round(safeNum(raw[k], 0, 100000)); });
  return s.n || s.g || s.wr ? s : null;
}

// grava (ou apaga) o resumo de UM dia dentro do documento do mês; merge: dois aparelhos em dias diferentes não se atropelam
export function writeStats(uid, key, sum) {
  const ym = key.slice(0, 7), dd = key.slice(8, 10);
  return setDoc(statsRef(uid, ym), { month: ym, days: { [dd]: sum || deleteField() }, upd: serverTimestamp() }, { merge: true }).catch(() => {});
}

const STATS_DELAY = 1200;
const statTimers = new Map();   // "uid|dia" -> { id, uid, key }
function scheduleStats(uid, key) {
  const id0 = `${uid}|${key}`;
  const old = statTimers.get(id0);
  if (old) clearTimeout(old.id);
  const id = setTimeout(() => { statTimers.delete(id0); flushStat(uid, key); }, STATS_DELAY);
  statTimers.set(id0, { id, uid, key });
}
function flushStat(uid, key) {
  if (store.me?.uid !== uid) return;   // saiu da conta (ou trocou de pessoa) no meio do atraso: não grava nada
  writeStats(uid, key, summarizeDay(mine.tada[key], mine.grat[key]));
}
export function flushAllStats() {
  const pend = [...statTimers.values()];
  statTimers.forEach((t) => clearTimeout(t.id)); statTimers.clear();
  pend.forEach((t) => flushStat(t.uid, t.key));
}
// fechar/esconder o app não pode perder o último resumo (mesmo padrão do cronômetro: pagehide/visibilitychange)
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushAllStats);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAllStats(); });
}

/* ============================================================
   ESTUDO DO DIA — derivado de profile.daily (nada novo gravado)
   Serve para o meu perfil E para o de um amigo (`profile` é o dele; o `daily` já é público na sala).
============================================================ */
export function studyRows(profile, key = todayKey(), isMine = false) {
  const day = normDay((profile?.daily || {})[key]);
  const list = [GERAL, ...subjectsWithArchive(profile)];
  return Object.entries(day.bySubject || {})
    .filter(([, m]) => Number(m) >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([sid, min]) => {
      const s = isMine ? subjectById(sid) : subjectById(sid, list); // as matérias do amigo vêm da lista DELE
      return { sid, name: s.name, color: safeColor(s.color), min: Math.round(safeNum(min, 0, 1440)) };
    });
}

/* ============================================================
   RESUMOS — para a aba, para a semana detalhada e para o perfil do amigo
============================================================ */
export function dayScore(items) {
  return items.reduce((a, x) => a + weightOf(x.w).w, 0);
}
// dias seguidos (terminando hoje ou ontem) com pelo menos 1 conquista OU 1 gratidão OU estudo
export function tadaStreak(profile = store.profile) {
  const has = (k) => dayItems(k).length > 0 || dayGrat(k).length > 0 || normDay((profile?.daily || {})[k]).total > 0;
  let cur = todayKey(), n = 0;
  const shift = (k, d) => { const [y, m, dd] = k.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, dd + d)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`; };
  if (!has(cur)) cur = shift(cur, -1);
  while (has(cur) && n < WATCH_DAYS) { n++; cur = shift(cur, -1); }
  return n;
}

// leitura de um período (semana detalhada em Estatísticas): usa o cache e completa com uma consulta
export async function loadRange(firstKey, lastKey) {
  const uid = store.me?.uid;
  const out = { wins: 0, days: 0, grat: 0, stars: [] };
  if (!uid) return out;
  const pick = async (sub, bucket) => {
    const cached = Object.keys(mine[bucket]).filter((k) => k >= firstKey && k <= lastKey);
    if (cached.length && firstKey >= shiftKeyBack(WATCH_DAYS - 2)) return cached.map((k) => mine[bucket][k]);
    try {
      const snap = await getDocs(query(collection(db, "users", uid, sub), where("date", ">=", firstKey), where("date", "<=", lastKey)));
      return snap.docs.map((d) => sanitizeDay(d.data()));
    } catch { return cached.map((k) => mine[bucket][k]); }
  };
  const [t, g] = await Promise.all([pick("tada", "tada"), pick("gratitude", "grat")]);
  t.forEach((d) => { if (d.items.length) { out.wins += d.items.length; out.days++; d.items.filter((x) => x.star).forEach((x) => out.stars.push(clip(x.t, MAX_ITEM))); } });
  g.forEach((d) => { out.grat += d.items.length; });
  return out;
}
function shiftKeyBack(n) {
  const [y, m, d] = todayKey().split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/* ============================================================
   AMIGOS — leitura (só funciona se a pessoa liberou; as regras do Firestore são quem decide)
============================================================ */
export const iCanSee = (p, field) => Array.isArray(p?.[field]) && p[field].includes(store.me?.uid);

export async function fetchFriendTada(uid, key) {
  const snap = await getDoc(tadaRef(uid, key));
  return snap.exists() ? sanitizeDay(snap.data()) : { date: key, items: [], wrap: "" };
}
export async function fetchFriendTadaRecent(uid, n = 7) {
  const snap = await getDocs(query(collection(db, "users", uid, "tada"), orderBy("date", "desc"), limit(n)));
  return snap.docs.map((d) => sanitizeDay(d.data())).filter((d) => d.items.length || d.wrap);
}
export async function fetchFriendGratitude(uid, n = 14) {
  const snap = await getDocs(query(collection(db, "users", uid, "gratitude"), orderBy("date", "desc"), limit(n)));
  return snap.docs.map((d) => sanitizeDay(d.data())).filter((d) => d.items.length);
}

/* ============================================================
   HTML só-leitura (perfil do amigo e aba Amigos). TUDO que vem de outra pessoa passa por
   esc()/safeColor()/safeNum() — nunca direto no HTML (veja CLAUDE.md, segurança).
============================================================ */
export function dayLabelShort(key) {
  if (!KEY_RE.test(String(key))) return "";
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
}
export function winRowHTML(x) {
  const wt = weightOf(safeNum(x.w, 1, 3));
  return `<div class="tdRow ${x.star ? "star" : ""}">
    <span class="tdW" title="${esc(wt.name)}">${wt.ico}</span>
    <span class="tdT">${esc(clip(x.t, MAX_ITEM))}</span>${x.star ? `<span class="tdStar" aria-label="destaque do dia">⭐</span>` : ""}
  </div>`;
}
export function studyRowHTML(r) {
  return `<div class="tdRow auto"><span class="tdW">📚</span>
    <span class="tdT">Estudei <b>${esc(r.name)}</b> <span class="muted">· ${esc(fmtMin(r.min))}</span></span>
    <i class="tdDot" style="background:${safeColor(r.color)}"></i></div>`;
}
export function gratRowHTML(g) {
  const how = clip(g.how, MAX_HOW);
  const subj = g.src === "study" && g.sn ? `<span class="tdTag"><i style="background:${safeColor(g.sc)}"></i>depois de estudar ${esc(clip(g.sn, 60))}</span>` : "";
  return `<div class="grRow">
    <p class="grWhat">🙏 ${esc(clip(g.what, MAX_WHAT))}</p>
    ${how ? `<p class="grHow">${esc(how)}</p>` : ""}${subj}
  </div>`;
}
