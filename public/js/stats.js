import { store } from "./store.js";
import { $, esc, fmtMin, fmtMinRich, fmtMinStacked, dateKey, weekStartKey, weekStartDate, normDay, sumDaily, subjectById, computeStreak, brNow } from "./utils.js";
import { WEEKDAYS, MONTHS, PERIODS, periodOfHour } from "./constants.js";
import { renderHistory } from "./studylog.js";
import { renderConsistency } from "./consistency.js";
import { hydrateIcons } from "./icons.js";

export function renderStats() {
  if (!store.profile) return;
  const d = store.profile.daily || {}, today = dateKey(), ws = weekStartKey();
  // valores com unidades menores e mais claras ("4h 35min"); o texto continua legível por leitor de tela
  const setStat = (id, min) => { const el = $(id); const html = fmtMinRich(min); if (el.__html !== html) { el.innerHTML = html; el.__html = html; } };
  setStat("stToday", normDay(d[today]).total);
  setStat("stWeek", sumDaily(d, (k) => k >= ws));
  setStat("stMonth", sumDaily(d, (k) => k.startsWith(today.slice(0, 7))));
  setStat("stYear", sumDaily(d, (k) => k.startsWith(today.slice(0, 4))));

  const st = computeStreak(d);
  $("streakBig").textContent = st.days;
  $("streakLine").textContent = st.days === 1 ? "dia seguido estudando" : "dias seguidos estudando";
  $("streakSub").textContent = st.days === 0
    ? "Um ciclo hoje começa uma sequência — no seu ritmo."
    : st.studiedToday ? "Sequência mantida hoje. 🔥"
    : "Hoje ainda está aberto. Se couber um ciclo, a sequência continua; se não, tudo bem — recomeçar também conta.";

  renderBars(d);
  renderInsights(store.profile.periodTotals || {});
  renderWeekCatalog(d);
  renderConsistency();
}

let barDays = [];       // dados dos 7 dias mostrados (para a leitura ao tocar numa coluna)
let selBar = 6;         // coluna selecionada (6 = hoje)
const WD_LONG = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function renderBars(d) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dt = brNow(); dt.setDate(dt.getDate() - i);
    const k = dateKey(dt);
    days.push({ label: WEEKDAYS[dt.getDay()], today: i === 0, entry: normDay(d[k]), dt });
  }
  barDays = days;
  const max = Math.max(30, ...days.map((x) => x.entry.total));
  const seen = new Map();
  // cada coluna é um botão: tocar mostra o dia por extenso e o tempo por matéria logo abaixo (os mesmos dados do gráfico)
  $("bars").innerHTML = days.map((x, i) => {
    const segs = Object.entries(x.entry.bySubject || {}).sort((a, b) => b[1] - a[1]);
    segs.forEach(([sid]) => { if (!seen.has(sid)) seen.set(sid, subjectById(sid)); });
    const inner = segs.map(([sid, min]) => {
      const s = subjectById(sid);
      return `<div class="seg" style="height:${x.entry.total ? (min / x.entry.total) * 100 : 0}%;background:${s.color}"></div>`;
    }).join("");
    return `<button type="button" class="col ${i === selBar ? "on" : ""}" data-i="${i}" aria-pressed="${i === selBar}" aria-label="${x.label}: ${x.entry.total ? fmtMin(x.entry.total) : "sem estudo"}"><span class="val">${x.entry.total ? fmtMinStacked(x.entry.total) : ""}</span>
      <div class="stack" style="height:${(x.entry.total / max) * 100}%">${inner}</div>
      <span class="lbl ${x.today ? "today" : ""}">${x.label}</span></button>`;
  }).join("");
  $("legend").innerHTML = [...seen.values()].map((s) =>
    `<span class="item"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span>`).join("");
  const total = Object.values(d).reduce((a, v) => a + normDay(v).total, 0);
  $("statsEmpty").textContent = total === 0 ? "Nenhuma sessão registrada ainda. Vá até o Cronômetro para começar a contar." : "";
  renderBarsReadout();
}

function renderBarsReadout() {
  const box = $("barsReadout"), x = barDays[selBar];
  if (!box || !x) return;
  const when = x.today ? "Hoje" : `${WD_LONG[x.dt.getDay()][0].toUpperCase()}${WD_LONG[x.dt.getDay()].slice(1)}, ${x.dt.getDate()} ${MONTHS[x.dt.getMonth()]}`;
  if (!x.entry.total) { box.innerHTML = `<b>${when}</b> · sem estudo registrado`; return; }
  const pills = Object.entries(x.entry.bySubject || {}).sort((a, b) => b[1] - a[1]).map(([sid, m]) => {
    const s = subjectById(sid);
    return `<span class="pill"><i style="background:${s.color}"></i>${esc(s.name)} · ${fmtMin(m)}</span>`;
  }).join("");
  box.innerHTML = `<b>${when}</b> · ${fmtMin(x.entry.total)}<br>${pills}`;
}

/* ---------- indicador de horário mais produtivo ---------- */
function renderInsights(periodTotals) {
  const max = Math.max(1, ...PERIODS.map((p) => periodTotals[p.id] || 0));
  const total = PERIODS.reduce((a, p) => a + (periodTotals[p.id] || 0), 0);
  $("insightBars").innerHTML = PERIODS.map((p) => {
    const v = periodTotals[p.id] || 0;
    return `<div class="insightRow">
      <span class="insightLbl">${p.label}<span class="muted"> · ${p.range}</span></span>
      <div class="insightTrack"><i style="width:${(v / max) * 100}%"></i></div>
      <span class="insightVal">${fmtMin(v)}</span>
    </div>`;
  }).join("");

  const top = PERIODS.reduce((best, p) => (periodTotals[p.id] || 0) > (periodTotals[best.id] || 0) ? p : best, PERIODS[0]);
  const nowPeriod = periodOfHour(brNow().getHours());
  const box = $("insightSuggestion");
  if (total < 30) {
    box.textContent = "Continue registrando ciclos — em breve mostramos seu horário mais produtivo.";
  } else if (nowPeriod.id === top.id) {
    box.textContent = `Você está no seu horário mais produtivo (${top.label.toLowerCase()}) — que tal começar um ciclo agora?`;
  } else {
    box.textContent = `Você costuma render mais à ${top.label.toLowerCase() === "manhã" ? "manhã" : top.label.toLowerCase()}. Se puder escolher, guarde os assuntos mais difíceis pra esse horário.`;
  }
}

/* ---------- catálogo semanal ---------- */
function renderWeekCatalog(daily) {
  $("yearLabel").textContent = store.statsYear;
  const thisWeek = weekStartKey();
  const weeks = [];
  const cursor = weekStartDate(new Date(store.statsYear, 0, 1));
  for (let i = 0; i < 54; i++) {
    const wk = new Date(cursor);
    const end = new Date(wk); end.setDate(end.getDate() + 6);
    if (wk.getFullYear() === store.statsYear || end.getFullYear() === store.statsYear) weeks.push(wk);
    cursor.setDate(cursor.getDate() + 7);
  }
  const rows = weeks.map((wk) => {
    const wkKey = dateKey(wk);
    const end = new Date(wk); end.setDate(end.getDate() + 6);
    const bySubj = {}; let total = 0;
    for (let i = 0; i < 7; i++) {
      const dt = new Date(wk); dt.setDate(dt.getDate() + i);
      const entry = normDay(daily[dateKey(dt)]);
      total += entry.total;
      Object.entries(entry.bySubject || {}).forEach(([sid, m]) => { bySubj[sid] = (bySubj[sid] || 0) + m; });
    }
    return { wkKey, wk, end, total, bySubj };
  }).filter((r) => r.total > 0 || r.wkKey === thisWeek).sort((a, b) => b.wkKey.localeCompare(a.wkKey));

  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  $("weekList").innerHTML = rows.length === 0
    ? `<p class="muted">Nenhuma semana com estudo registrado em ${store.statsYear}.</p>`
    : rows.map((r) => {
      const range = `${r.wk.getDate()} ${MONTHS[r.wk.getMonth()]} – ${r.end.getDate()} ${MONTHS[r.end.getMonth()]}`;
      const segs = Object.entries(r.bySubj).sort((a, b) => b[1] - a[1]).map(([sid, m]) =>
        `<span style="width:${(m / maxTotal) * 100}%;background:${subjectById(sid).color}"></span>`).join("");
      return `<button type="button" class="weekrow ${r.wkKey === thisWeek ? "current" : ""}" data-wk="${r.wkKey}" title="Ver detalhes desta semana">
        <span class="range">${range}${r.wkKey === thisWeek ? " · esta semana" : ""}</span>
        <span class="mini">${segs}</span><span class="total">${fmtMin(r.total)}</span><span class="chev">›</span></button>`;
    }).join("");
  $("weekList").querySelectorAll(".weekrow[data-wk]").forEach((b) => b.addEventListener("click", async () => {
    // análise detalhada da semana: módulo usado só ocasionalmente, carrega sob demanda
    if (!weekMod) weekMod = await import("./weekdetail.js");
    weekMod.openWeekDetail(b.dataset.wk);
  }));
}
let weekMod = null;

export function initStats() {
  hydrateIcons();   // selos de ícone dos cartões escritos no HTML
  $("bars").addEventListener("click", (e) => {
    const b = e.target.closest(".col[data-i]");
    if (!b) return;
    selBar = Number(b.dataset.i);
    $("bars").querySelectorAll(".col").forEach((c) => { const on = c === b; c.classList.toggle("on", on); c.setAttribute("aria-pressed", String(on)); });
    renderBarsReadout();
  });
  $("yearPrev").addEventListener("click", () => { store.statsYear--; renderStats(); });
  $("yearNext").addEventListener("click", () => {
    if (store.statsYear < brNow().getFullYear()) { store.statsYear++; renderStats(); }
  });

  // Ajustes → "Corrigir histórico": módulo usado uma vez na vida, carrega só quando o botão é tocado
  $("fixMidnight")?.addEventListener("click", async () => {
    const m = await import("./fixmidnight.js");
    m.fixMidnightHistory();
  });

  // sub-abas "Resumo" / "Diário" / "Horários" / "Aprofundado" dentro de Estatísticas
  let deepMod = null, hoursMod = null;
  document.querySelectorAll(".statsSubTab").forEach((b) => {
    b.addEventListener("click", async () => {
      document.querySelectorAll(".statsSubTab").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      $("statsSummary").classList.toggle("hide", b.dataset.sub !== "resumo");
      $("statsHistory").classList.toggle("hide", b.dataset.sub !== "diario");
      $("statsHours").classList.toggle("hide", b.dataset.sub !== "horarios");
      $("statsDeep").classList.toggle("hide", b.dataset.sub !== "aprofundado");
      if (b.dataset.sub === "diario") renderHistory();
      if (b.dataset.sub === "horarios") {
        // aba de horários: também carregada sob demanda
        if (!hoursMod) hoursMod = await import("./studylog-hours.js");
        hoursMod.renderHoursTab();
      }
      if (b.dataset.sub === "aprofundado") {
        // estatísticas aprofundadas: módulo usado só ocasionalmente, carrega sob demanda
        if (!deepMod) deepMod = await import("./deepstats.js");
        deepMod.renderDeepStats();
      }
    });
  });

  $("wrappedBtn").addEventListener("click", async () => {
    const { generateWrapped } = await import("./wrapped.js"); // só baixa quando clicado
    generateWrapped();
  });
}
