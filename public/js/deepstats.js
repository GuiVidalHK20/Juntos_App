/* Estatísticas aprofundadas: tudo aqui é derivado do que já existe em
   store.profile.daily — nenhum dado novo precisa ser salvo no Firestore.
   Fica na 3ª sub-aba de Estatísticas, ao lado de "Resumo" e "Diário". */
import { store } from "./store.js";
import {
  $, esc, fmtMin, fmtMinRich, dateKey, sumDaily, normDay, subjectById, brNow,
  longestStreakEver, bestDayEver, lastNDaysTotal, weekdayTotals, monthlyTotals, weekStartKey
} from "./utils.js";
import { WEEKDAYS, MONTHS } from "./constants.js";
import { icon } from "./icons.js";
import { getMembers } from "./room.js";

export function renderDeepStats() {
  if (!store.profile) return;
  const d = store.profile.daily || {};
  renderHeatmap(d);
  renderMonthly(d);
  renderRecords(d);
  renderWeekdayPattern(d);
  renderRoomCompare(d);
}

/* ---------- mapa de calor estilo GitHub ---------- */
function renderHeatmap(daily) {
  const today = brNow(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - 370);
  // alinha ao domingo pra formar colunas certinhas
  start.setDate(start.getDate() - start.getDay());

  const cells = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const k = dateKey(cursor);
    cells.push({ key: k, dow: cursor.getDay(), month: cursor.getMonth(), total: normDay(daily[k]).total, future: cursor > today });
    cursor.setDate(cursor.getDate() + 1);
  }
  const max = Math.max(1, ...cells.map((c) => c.total));
  const level = (t) => t === 0 ? 0 : t < max * .25 ? 1 : t < max * .5 ? 2 : t < max * .75 ? 3 : 4;

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // rótulos de mês: só no início de cada mês novo, alinhado à coluna certa
  let lastMonth = -1;
  const monthLabels = weeks.map((wk) => {
    const first = wk.find((c) => !c.future) || wk[0];
    if (first.month !== lastMonth) { lastMonth = first.month; return MONTHS[first.month]; }
    return "";
  });

  $("heatmapMonths").innerHTML = monthLabels.map((m) => `<span>${m}</span>`).join("");
  $("heatmap").innerHTML = weeks.map((wk) => `<div class="hmCol">${wk.map((c) =>
    c.future ? `<span class="hmCell hmFuture"></span>`
      : `<span class="hmCell" data-lv="${level(c.total)}" title="${new Date(c.key + "T00:00:00").toLocaleDateString("pt-BR")} · ${fmtMin(c.total)}"></span>`
  ).join("")}</div>`).join("");
}

/* ---------- evolução por matéria, mês a mês ---------- */
function renderMonthly(daily) {
  const months = monthlyTotals(daily, 6);
  const max = Math.max(1, ...months.map((m) => m.total));
  const seen = new Map();
  $("monthlyBars").innerHTML = months.map((m) => {
    const segs = Object.entries(m.bySubject).sort((a, b) => b[1] - a[1]);
    segs.forEach(([sid]) => { if (!seen.has(sid)) seen.set(sid, subjectById(sid)); });
    const inner = segs.map(([sid, min]) => {
      const s = subjectById(sid);
      return `<div class="seg" style="height:${m.total ? (min / m.total) * 100 : 0}%;background:${s.color}"></div>`;
    }).join("");
    return `<div class="col"><span class="val">${m.total ? fmtMin(m.total) : ""}</span>
      <div class="stack" style="height:${(m.total / max) * 100}%">${inner}</div>
      <span class="lbl">${MONTHS[m.month]}</span></div>`;
  }).join("");
  $("monthlyLegend").innerHTML = [...seen.values()].map((s) =>
    `<span class="item"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span>`).join("");
  $("monthlyEmpty").textContent = months.every((m) => m.total === 0) ? "Sem dados suficientes ainda — volte aqui daqui a algumas semanas." : "";
}

/* ---------- recordes pessoais ---------- */
function renderRecords(daily) {
  const best = bestDayEver(daily);
  const bestDateLbl = best.key ? new Date(best.key + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—";
  const longest = longestStreakEver(daily);
  const avg30 = lastNDaysTotal(daily, 30) / 30;

  const ws = weekStartKey();
  // maior semana: agrupa os últimos ~2 anos por semana e pega o total máximo
  const weekTotals = {};
  Object.keys(daily).forEach((k) => {
    const dt = new Date(k + "T00:00:00"); if (isNaN(dt)) return;
    const day = (dt.getDay() + 6) % 7;
    const mon = new Date(dt); mon.setDate(dt.getDate() - day);
    const wk = dateKey(mon);
    weekTotals[wk] = (weekTotals[wk] || 0) + normDay(daily[k]).total;
  });
  const bestWeek = Object.values(weekTotals).reduce((a, b) => Math.max(a, b), 0);

  // mesmos 4 recordes de sempre; só o visual mudou (cartão tingido + selo de ícone, valor com unidades menores)
  const cards = [
    { label: "Melhor dia", value: fmtMinRich(best.minutes), sub: bestDateLbl, ico: "trophy", tone: "gold" },
    { label: "Melhor semana", value: fmtMinRich(bestWeek), sub: weekTotals[ws] ? "esta semana em andamento" : "", ico: "star", tone: "violet" },
    { label: "Maior sequência já feita", value: `<b>${longest}</b><i>${longest === 1 ? "dia" : "dias"}</i>`, sub: "", ico: "flame", tone: "orange" },
    { label: "Média diária (30 dias)", value: fmtMinRich(avg30), sub: "", ico: "pulse", tone: "cyan" }
  ];
  $("recordCards").innerHTML = cards.map((c) =>
    `<div class="recordCard gCard t-${c.tone}"><div class="gTop"><span class="gIco">${icon(c.ico)}</span><p class="rl">${esc(c.label)}</p></div><p class="rv">${c.value}</p>${c.sub ? `<p class="rs">${esc(c.sub)}</p>` : ""}</div>`).join("");
}

/* ---------- em qual dia da semana você mais estuda ---------- */
function renderWeekdayPattern(daily) {
  const totals = weekdayTotals(daily); // 0=dom..6=sáb
  const order = [1, 2, 3, 4, 5, 6, 0]; // mostra seg→dom
  const max = Math.max(1, ...totals);
  $("weekdayBars").innerHTML = order.map((dow) => {
    const v = totals[dow];
    return `<div class="insightRow">
      <span class="insightLbl">${WEEKDAYS[dow]}</span>
      <div class="insightTrack"><i style="width:${(v / max) * 100}%"></i></div>
      <span class="insightVal">${fmtMin(v)}</span>
    </div>`;
  }).join("");
  const topIdx = totals.indexOf(Math.max(...totals));
  const totalAll = totals.reduce((a, b) => a + b, 0);
  $("weekdaySuggestion").textContent = totalAll < 60
    ? "Continue registrando ciclos pra descobrir seu melhor dia da semana."
    : `Seu dia mais forte costuma ser ${WEEKDAYS[topIdx]}. Bom dia pra encaixar as matérias mais pesadas.`;
}

/* ---------- comparação com a sala ---------- */
function renderRoomCompare(daily) {
  const box = $("roomCompareBox");
  if (!store.profile?.roomCode) {
    box.innerHTML = `<p class="muted">Entre numa sala para comparar seu desempenho com o da sua sala.</p>`;
    return;
  }
  const ws = weekStartKey();
  const myWeek = sumDaily(daily, (k) => k >= ws);
  const members = getMembers();
  if (members.length === 0) { box.innerHTML = `<p class="muted">Carregando dados da sala…</p>`; return; }

  const rows = members.map((m) => ({
    id: m.id, name: m.id === store.me?.uid ? "Você" : m.name,
    week: sumDaily(m.daily, (k) => k >= ws), color: m.color, me: m.id === store.me?.uid
  })).sort((a, b) => b.week - a.week);
  const max = Math.max(1, ...rows.map((r) => r.week));
  const avg = rows.reduce((a, r) => a + r.week, 0) / rows.length;

  box.innerHTML = `
    <p class="muted" style="margin:0 0 14px">Você está ${myWeek >= avg ? "acima" : "abaixo"} da média da sala esta semana (${fmtMin(avg)}).</p>
    ${rows.map((r, i) => `<div class="insightRow">
      <span class="insightLbl" style="width:96px;${r.me ? "font-weight:700" : ""}">${i + 1}º · ${esc(r.name)}</span>
      <div class="insightTrack"><i style="width:${(r.week / max) * 100}%;${r.me ? "background:var(--c-timer)" : ""}"></i></div>
      <span class="insightVal">${fmtMin(r.week)}</span>
    </div>`).join("")}`;
}
