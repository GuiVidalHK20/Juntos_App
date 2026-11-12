/* Análise detalhada de UMA semana (abre ao tocar numa semana do "Catálogo semanal", em
   Estatísticas → Resumo). Carregado sob demanda (import() dinâmico em stats.js).
   - Tudo que vem de store.profile.daily é calculado na hora, sem dado novo. As conquistas/gratidões da
     semana (Ta-da) são lidas das subcoleções tada/gratitude, junto com os ciclos.
   - Os ciclos da semana (nº de ciclos, duração média, horários, anotações) vêm da subcoleção
     users/{uid}/sessions — a mesma do Diário de estudos, só que filtrada por data. Se essa
     leitura falhar, o resto da análise continua aparecendo normalmente. */
import { db, collection, query, where, getDocs } from "./firebase.js";
import { store } from "./store.js";
import { esc, fmtMin, fmtMinStacked, dateKey, normDay, subjectById, sessionSubject, weekStartKey, getAppTimeZone } from "./utils.js";
import { WEEKDAYS, WEEKDAYS_FULL, MONTHS, PERIODS } from "./constants.js";
import { loadRange } from "./tada-data.js";

let wrap = null, curWk = null, reqId = 0;

const keyToDate = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dateKey(d); };
const rangeLbl = (a, b) => `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;

function delta(cur, prev) {
  if (!cur && !prev) return "";
  if (!prev) return `<span class="dl up">novo</span>`;
  const p = Math.round(((cur - prev) / prev) * 100);
  if (p === 0) return `<span class="dl">igual</span>`;
  return `<span class="dl ${p > 0 ? "up" : "down"}">${p > 0 ? "▲" : "▼"} ${Math.abs(p)}%</span>`;
}

function build() {
  wrap = document.createElement("div");
  wrap.className = "modalWrap hide";
  wrap.innerHTML = `<div class="modalBox wkBox">
    <div class="wkNav">
      <button type="button" class="wkArrow" data-nav="-1" aria-label="Semana anterior">‹</button>
      <div class="wkTitle"><p class="wkRange"></p><p class="wkSub"></p></div>
      <button type="button" class="wkArrow" data-nav="1" aria-label="Próxima semana">›</button>
      <button type="button" class="wkClose" aria-label="Fechar">✕</button>
    </div>
    <div class="wkBody"></div></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) wrap.classList.add("hide"); });
  wrap.querySelector(".wkClose").addEventListener("click", () => wrap.classList.add("hide"));
  wrap.querySelectorAll(".wkArrow").forEach((b) => b.addEventListener("click", () => {
    curWk = addDays(curWk, 7 * Number(b.dataset.nav)); render();
  }));
}

export function openWeekDetail(wkKey) {
  curWk = wkKey;
  if (!wrap) build();
  wrap.classList.remove("hide");
  render();
}

function weekData(startKey, daily) {
  const today = dateKey();
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(startKey, i), e = normDay(daily[key]);
    return { key, dow: keyToDate(key).getDay(), total: e.total, bySubject: e.bySubject, future: key > today };
  });
  const bySubj = {};
  days.forEach((d) => Object.entries(d.bySubject).forEach(([sid, m]) => {
    if (!bySubj[sid]) bySubj[sid] = { min: 0, days: 0 };
    bySubj[sid].min += m; if (m > 0) bySubj[sid].days++;
  }));
  const total = days.reduce((a, d) => a + d.total, 0);
  return { days, bySubj, total, studied: days.filter((d) => d.total > 0).length, elapsed: days.filter((d) => !d.future).length };
}

function render() {
  const daily = store.profile?.daily || {};
  const w = weekData(curWk, daily), pw = weekData(addDays(curWk, -7), daily);
  const start = keyToDate(curWk), end = keyToDate(addDays(curWk, 6));
  const isCurrent = curWk === weekStartKey();
  wrap.querySelector(".wkRange").textContent = rangeLbl(start, end) + (start.getFullYear() !== new Date().getFullYear() ? ` · ${start.getFullYear()}` : "");
  wrap.querySelector(".wkSub").textContent = isCurrent ? "esta semana (em andamento)" : "semana";
  wrap.querySelector('[data-nav="1"]').disabled = isCurrent || curWk > weekStartKey();

  const best = w.days.reduce((b, d) => (d.total > b.total ? d : b), w.days[0]);
  const avgStudied = w.studied ? w.total / w.studied : 0;
  const cards = [
    { l: "Total da semana", v: fmtMin(w.total), s: `${delta(w.total, pw.total)} <span class="muted">vs. anterior (${fmtMin(pw.total)})</span>` },
    { l: "Dias estudados", v: `${w.studied}/${isCurrent ? w.elapsed : 7}`, s: `<span class="muted">${isCurrent ? "dos dias até agora" : w.studied === 7 ? "semana perfeita 🔥" : `${7 - w.studied} sem estudo`}</span>` },
    { l: "Média por dia estudado", v: fmtMin(avgStudied), s: delta(avgStudied, pw.studied ? pw.total / pw.studied : 0) },
    { l: "Melhor dia", v: best.total ? WEEKDAYS_FULL[best.dow].split("-")[0] : "—", s: best.total ? `<span class="muted">${fmtMin(best.total)}</span>` : "" }
  ];

  const max = Math.max(30, ...w.days.map((d) => d.total));
  const bars = w.days.map((d) => {
    const segs = Object.entries(d.bySubject).sort((a, b) => b[1] - a[1]);
    const inner = segs.map(([sid, m]) => `<div class="seg" style="height:${d.total ? (m / d.total) * 100 : 0}%;background:${subjectById(sid).color}"></div>`).join("");
    return `<div class="col"><span class="val">${d.total ? fmtMinStacked(d.total) : ""}</span>
      <div class="stack" style="height:${(d.total / max) * 100}%">${inner}</div>
      <span class="lbl ${d === best && d.total ? "today" : ""}">${WEEKDAYS[d.dow]}<br>${keyToDate(d.key).getDate()}</span></div>`;
  }).join("");

  // matérias: esta semana + as que sumiram em relação à anterior
  const subjRows = Object.entries(w.bySubj).sort((a, b) => b[1].min - a[1].min);
  const dropped = Object.entries(pw.bySubj).filter(([sid]) => !w.bySubj[sid]).sort((a, b) => b[1].min - a[1].min);
  const shareBar = subjRows.map(([sid, v]) => `<span style="width:${(v.min / w.total) * 100}%;background:${subjectById(sid).color}"></span>`).join("");
  const top = subjRows[0];
  const insight = !top ? "" : subjRows.length === 1
    ? `Foco total em <b>${esc(subjectById(top[0]).name)}</b> nesta semana.`
    : `<b>${esc(subjectById(top[0]).name)}</b> foi a mais estudada: ${Math.round((top[1].min / w.total) * 100)}% do tempo, em ${top[1].days} ${top[1].days === 1 ? "dia" : "dias"}.`;

  wrap.querySelector(".wkBody").innerHTML = w.total === 0
    ? `<p class="muted" style="text-align:center;padding:30px 0">Nenhum estudo registrado nessa semana.</p><div id="wkTada"></div>`
    : `
    <div class="wkGrid">${cards.map((c) => `<div class="wkCard"><p class="wkV">${c.v}</p><p class="wkL">${c.l}</p><p class="wkS">${c.s}</p></div>`).join("")}</div>

    <p class="sechead">dia a dia</p>
    <div class="bars wkBars">${bars}</div>

    ${subjRows.length ? `
    <p class="sechead" style="margin-top:26px">por matéria</p>
    <div class="wkShare">${shareBar}</div>
    <p class="wkInsight">${insight}</p>
    ${subjRows.map(([sid, v]) => {
      const s = subjectById(sid), pv = pw.bySubj[sid]?.min || 0;
      return `<div class="wkSubj">
        <div class="wkSubjTop"><span class="wkSubjName"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span>
          <span class="wkSubjVal">${fmtMin(v.min)} <span class="muted">· ${Math.round((v.min / w.total) * 100)}%</span></span></div>
        <div class="insightTrack"><i style="width:${(v.min / subjRows[0][1].min) * 100}%;background:${s.color}"></i></div>
        <p class="wkSubjSub">${v.days} ${v.days === 1 ? "dia" : "dias"} · ${fmtMin(v.min / v.days)} por dia · ${delta(v.min, pv)} <span class="muted">vs. anterior</span></p>
      </div>`;
    }).join("")}` : ""}
    ${dropped.length ? `<p class="wkDropped">Ficaram de fora esta semana: ${dropped.map(([sid, v]) => `<span class="wkDropChip"><i style="background:${subjectById(sid).color}"></i>${esc(subjectById(sid).name)} <span class="muted">(${fmtMin(v.min)} na anterior)</span></span>`).join(" ")}</p>` : ""}

    <div id="wkTada"></div>

    <div id="wkSessions"><p class="muted" style="margin-top:26px">Carregando ciclos da semana…</p></div>`;

  loadSessions(++reqId, w);
  loadTada(reqId, w);
}

// Ta-da da semana: quantas conquistas e gratidões, e os destaques (⭐) que a pessoa escolheu
async function loadTada(id, w) {
  const box = wrap.querySelector("#wkTada");
  if (!box || !store.me) return;
  const r = await loadRange(w.days[0].key, w.days[6].key);
  if (id !== reqId || !r || (!r.wins && !r.grat)) return;   // trocou de semana, ou não registrou nada nela
  box.innerHTML = `
    <p class="sechead" style="margin-top:26px">ta-da da semana</p>
    <div class="insightRow"><span class="insightLbl" style="width:auto">✨ ${r.wins} ${r.wins === 1 ? "conquista" : "conquistas"} em ${r.days} ${r.days === 1 ? "dia" : "dias"}</span></div>
    <div class="insightRow"><span class="insightLbl" style="width:auto">🙏 ${r.grat} ${r.grat === 1 ? "gratidão" : "gratidões"}</span></div>
    ${r.stars.length ? `<p class="wkInsight">${r.stars.slice(0, 5).map((t) => `⭐ ${esc(t)}`).join("<br>")}</p>` : ""}`;
}

async function loadSessions(id, w) {
  const box = wrap.querySelector("#wkSessions");
  if (!box || !store.me) return;
  try {
    const a = w.days[0].key, b = w.days[6].key;
    const snap = await getDocs(query(collection(db, "users", store.me.uid, "sessions"), where("date", ">=", a), where("date", "<=", b)));
    if (id !== reqId) return; // a pessoa já trocou de semana
    const rows = snap.docs.map((d) => d.data());
    if (!rows.length) { box.innerHTML = ""; return; }

    const mins = rows.map((r) => r.minutes || 0);
    const longest = Math.max(...mins), avg = mins.reduce((x, y) => x + y, 0) / rows.length;

    const perP = {}; PERIODS.forEach((p) => (perP[p.id] = 0));
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: getAppTimeZone(), hour: "numeric", hourCycle: "h23" });
    rows.forEach((r) => {
      const d = r.ts?.toDate?.(); if (!d) return;
      const h = Number(fmt.format(d)) % 24;
      const p = PERIODS.find((x) => h >= x.from && h < x.to);
      if (p) perP[p.id] += r.minutes || 0;
    });
    const pMax = Math.max(1, ...Object.values(perP)), pSum = Object.values(perP).reduce((x, y) => x + y, 0);

    const notes = rows.filter((r) => r.note).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 8);
    box.innerHTML = `
      <p class="sechead" style="margin-top:26px">ciclos da semana</p>
      <div class="wkGrid three">
        <div class="wkCard"><p class="wkV">${rows.length}</p><p class="wkL">ciclos</p></div>
        <div class="wkCard"><p class="wkV">${fmtMin(avg)}</p><p class="wkL">duração média</p></div>
        <div class="wkCard"><p class="wkV">${fmtMin(longest)}</p><p class="wkL">ciclo mais longo</p></div>
      </div>
      ${pSum > 0 ? `<p class="sechead" style="margin-top:26px">em que horário você estudou</p>
        ${PERIODS.map((p) => `<div class="insightRow"><span class="insightLbl">${p.label}<span class="muted"> · ${p.range}</span></span>
          <div class="insightTrack"><i style="width:${(perP[p.id] / pMax) * 100}%"></i></div><span class="insightVal">${fmtMin(perP[p.id])}</span></div>`).join("")}` : ""}
      ${notes.length ? `<p class="sechead" style="margin-top:26px">o que você anotou</p>
        ${notes.map((r) => { const s = sessionSubject(r), d = keyToDate(r.date);
          return `<div class="logRow"><span class="dot" style="background:${s.color}"></span><div class="logBody">
            <p class="logHead">${WEEKDAYS[d.getDay()]} ${d.getDate()} · ${esc(s.name)} · ${fmtMin(r.minutes)}</p>
            <p class="logNote">${esc(r.note)}</p></div></div>`; }).join("")}` : ""}`;
  } catch {
    if (id === reqId) box.innerHTML = "";  // sem os ciclos, o resto da análise continua valendo
  }
}
