/* Aba "Horários" das Estatísticas.
   Lê os ciclos salvos em users/{uid}/sessions (os mesmos do Diário de estudos) e mostra
   em que horas do dia você estuda. Carregada sob demanda, como o deepstats.js.

   Sobre o horário: o app grava o instante em que o ciclo TERMINOU (ts). O início é calculado
   subtraindo a duração, e o tempo do ciclo é distribuído nas horas que ele atravessa
   (um ciclo de 13:40 a 14:20 conta 20 min na faixa das 13h e 20 min na das 14h). */
import { db, collection, query, orderBy, limit, getDocs } from "./firebase.js";
import { store } from "./store.js";
import { $, esc, fmtMin, fmtHM, sessionSpan, subjectById, sessionSubject, dateKey } from "./utils.js";
import { PERIODS } from "./constants.js";
import { icon } from "./icons.js";

const FETCH_LIMIT = 500;   // ciclos mais recentes lidos do Firestore
const CACHE_MS = 20000;    // reabrir a aba logo em seguida não relê tudo

let cache = null, cacheAt = 0, skipped = 0;
const st = { period: "all", subject: "all", hour: null, day: null };
let view = { days: [] };   // lista de dias navegáveis da última renderização

const PERIOD_OPTS = [["all", "Tudo"], ["30", "30 dias"], ["7", "7 dias"]];
const SAYS = { madrugada: "de madrugada", manha: "de manhã", tarde: "à tarde", noite: "à noite" };

export function invalidateHours() { cache = null; }

export async function renderHoursTab(force = false) {
  const box = $("statsHours");
  if (!box || !store.me) return;
  wire(box);
  if (!cache || force || Date.now() - cacheAt > CACHE_MS) {
    box.innerHTML = `<p class="muted">Carregando horários…</p>`;
    try {
      const snap = await getDocs(query(collection(db, "users", store.me.uid, "sessions"), orderBy("ts", "desc"), limit(FETCH_LIMIT)));
      cache = []; skipped = 0;
      for (const d of snap.docs) {
        const r = { id: d.id, ...d.data() };
        const sp = sessionSpan(r);
        if (!sp || !(r.minutes > 0)) { skipped++; continue; } // ciclos antigos, gravados sem horário
        cache.push({ ...r, subjectId: r.subjectId || "geral", start: sp.start, end: sp.end, date: r.date || dateKey(sp.end) });
      }
      cacheAt = Date.now();
    } catch {
      box.innerHTML = `<p class="muted">Não consegui carregar os horários.</p>`;
      return;
    }
  }
  draw();
}

/* ---------- cálculo ---------- */
function bucketByHour(rows) {
  const hours = Array.from({ length: 24 }, () => ({ total: 0, by: {}, rows: new Set() }));
  for (const r of rows) {
    let t = r.start.getTime();
    const end = r.end.getTime();
    while (t < end) {
      const d = new Date(t);
      const next = new Date(t); next.setHours(d.getHours() + 1, 0, 0, 0);
      const seg = Math.min(next.getTime(), end) - t;
      const h = d.getHours(), m = seg / 60000;
      hours[h].total += m;
      hours[h].by[r.subjectId] = (hours[h].by[r.subjectId] || 0) + m;
      hours[h].rows.add(r);
      t += seg;
    }
  }
  return hours;
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Um ciclo que atravessa a meia-noite vira um pedaço em cada dia (22:00–01:00 = 2h num dia + 1h no outro).
function splitByDay(r) {
  const out = [];
  const first = r.start.getTime(), end = r.end.getTime();
  let t = first;
  while (t < end) {
    const d = new Date(t);
    const stop = Math.min(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(), end);
    out.push({ ...r, start: new Date(t), end: new Date(stop), minutes: (stop - t) / 60000, date: ymd(d), cameFromPrev: t > first, goesOn: stop < end });
    t = stop;
  }
  return out;
}
const niceMax = (m) => [20, 40, 60, 120, 180, 240, 360, 480, 600].find((v) => v >= m) || Math.ceil(m / 120) * 120;
const hourRange = (h) => `${h}h–${(h + 1) % 24}h`;
const shortDate = (r) => new Date(r.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

/* ---------- desenho ---------- */
function draw() {
  const box = $("statsHours");
  if (!cache.length) {
    box.innerHTML = `<p class="muted">Nenhum ciclo com horário registrado ainda. Conclua um ciclo no cronômetro e ele aparece aqui.</p>`;
    return;
  }
  const keepScroll = box.querySelector(".hxChips")?.scrollLeft || 0;

  const cutoff = st.period === "all" ? 0 : Date.now() - Number(st.period) * 86400000;
  const inPeriod = cache.filter((r) => r.end.getTime() >= cutoff);
  const subjTotals = {};
  inPeriod.forEach((r) => { subjTotals[r.subjectId] = (subjTotals[r.subjectId] || 0) + r.minutes; });
  const subjIds = Object.keys(subjTotals).sort((a, b) => subjTotals[b] - subjTotals[a]);
  if (st.subject !== "all" && !subjIds.includes(st.subject)) st.subject = "all";
  const rows = st.subject === "all" ? inPeriod : inPeriod.filter((r) => r.subjectId === st.subject);

  const hours = bucketByHour(rows);
  const total = rows.reduce((a, r) => a + r.minutes, 0);
  const peak = hours.reduce((best, h, i) => (h.total > hours[best].total ? i : best), 0);
  const active = hours.filter((h) => h.total >= 1).length;
  // a faixa selecionada precisa ter estudo; se o filtro mudou e ela esvaziou, volta para o pico
  if (st.hour == null || !(hours[st.hour].total > 0)) st.hour = hours[peak].total > 0 ? peak : null;

  // [valor, rótulo, ícone, tom] — os mesmos 4 indicadores de antes; só ganharam selo de ícone e cor
  const kpis = [
    [`${active} de 24`, "horas ativas", "clock", "cyan"],
    [rows.length ? hourRange(peak) : "–", "horário de pico", "sun", "orange"],
    [rows.length ? fmtMin(hours[peak].total) : "–", "tempo no pico", "target", "violet"],
    [fmtMin(total), "total registrado", "hourglass", "green"]
  ];

  box.innerHTML = `<div class="hx">
    <div class="hxKpis">${kpis.map(([v, l, ic, tone]) => `<div class="hxKpi gCard t-${tone}"><div class="gTop"><span class="gIco">${icon(ic)}</span><p class="l">${l}</p></div><p class="v">${v}</p></div>`).join("")}</div>

    <div class="hxCard gCard t-blue">
      <div class="hxCardHead">
        <div class="gHead" style="margin:0"><span class="gIco">${icon("pulse")}</span><div><h3 class="gTitle">Hora a hora</h3><p class="gSub">quando você estuda</p></div></div>
        <div class="hxSeg" role="group" aria-label="Período">
          ${PERIOD_OPTS.map(([id, lbl]) => `<button class="${st.period === id ? "on" : ""}" data-period="${id}">${lbl}</button>`).join("")}
        </div>
      </div>
      ${subjIds.length > 1 ? `<div class="hxScroll hxChips">
        <button class="chip ${st.subject === "all" ? "on" : ""}" data-subj="all">Todas</button>
        ${subjIds.map((id) => {
          const s = subjectById(id);
          return `<button class="chip ${st.subject === id ? "on" : ""}" data-subj="${esc(id)}"
            style="${st.subject === id ? `border-color:${s.color}` : ""}"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</button>`;
        }).join("")}</div>` : ""}
      ${rows.length ? chartHTML(hours, total) : `<p class="muted" style="margin:18px 0 6px">Nenhum ciclo nesse filtro.</p>`}
    </div>

    ${daysHTML(rows)}
    ${skipped ? `<p class="fineprint" style="margin:0">${skipped} ciclo${skipped > 1 ? "s" : ""} antigo${skipped > 1 ? "s" : ""} sem horário gravado não entra${skipped > 1 ? "m" : ""} nesta tela.</p>` : ""}
  </div>`;

  const chips = box.querySelector(".hxChips");
  if (chips) chips.scrollLeft = keepScroll;
}

function chartHTML(hours, total) {
  const max = niceMax(Math.max(...hours.map((h) => h.total)));
  const cols = hours.map((h, i) => {
    const on = st.hour === i ? " on" : "";
    if (h.total < 0.5) return `<button class="hxCol${on}" data-h="${i}" aria-label="${i}h: sem estudo"><span class="hxBar empty"></span></button>`;
    const segs = Object.entries(h.by).sort((a, b) => b[1] - a[1])
      .map(([id, m]) => `<span style="height:${(m / h.total) * 100}%;background:${subjectById(id).color}"></span>`).join("");
    return `<button class="hxCol${on}" data-h="${i}" aria-label="${hourRange(i)}: ${fmtMin(h.total)}">
      <span class="hxBar" style="height:${Math.max((h.total / max) * 100, 3)}%">${segs}</span></button>`;
  }).join("");

  // em que parte do dia está a maior fatia do tempo
  const per = PERIODS.map((p) => ({ p, m: hours.slice(p.from, p.to).reduce((a, h) => a + h.total, 0) })).sort((a, b) => b.m - a.m)[0];
  const insight = `Você estuda mais ${SAYS[per.p.id]} (${per.p.range}) — ${Math.round((per.m / total) * 100)}% do seu tempo.`;

  return `<div class="hxPlot hasSel">
      <div class="hxGrid" style="top:0"><span>${fmtMin(max)}</span></div>
      <div class="hxGrid" style="top:50%"><span>${fmtMin(max / 2)}</span></div>
      <div class="hxCols">${cols}</div>
    </div>
    <div class="hxAxis">${hours.map((_, i) => `<span>${i % 3 === 0 ? i + "h" : ""}</span>`).join("")}</div>
    <p class="hxInsight">${insight}</p>
    ${st.hour != null ? detailHTML(st.hour, hours[st.hour]) : ""}`;
}

function detailHTML(h, d) {
  const bySubj = Object.entries(d.by).sort((a, b) => b[1] - a[1]);
  const list = [...d.rows].sort((a, b) => b.end - a.end).slice(0, 30);
  return `<div class="hxDetail">
    <div class="hxDetailHead"><p class="hxDetailTitle">${hourRange(h)}</p><p class="hxDetailSum">${fmtMin(d.total)} no total</p></div>
    <div class="hxPills">${bySubj.map(([id, m]) => {
      const s = subjectById(id);
      return `<span class="hxPill"><span class="dot" style="background:${s.color}"></span>${esc(s.name)} · ${fmtMin(m)}</span>`;
    }).join("")}</div>
    <p class="hxHint">Horários exatos dos ciclos que passaram por essa faixa:</p>
    <div class="hxList">${list.map(rowHTML).join("")}</div>
    ${d.rows.size > list.length ? `<p class="fineprint" style="margin:8px 0 0">Mostrando os ${list.length} mais recentes de ${d.rows.size}.</p>` : ""}
  </div>`;
}

function rowHTML(r) {
  const s = sessionSubject(r);
  return `<div class="hxRow"><span class="dot" style="background:${s.color}"></span>
    <div class="hxRowBody">
      <p class="hxRowTop"><b>${fmtHM(r.start)} – ${fmtHM(r.end)}</b><span>${fmtMin(r.minutes)}</span></p>
      <p class="hxRowSub">${esc(s.name)} · ${shortDate(r)}${r.goesOn ? " · continua depois das 00:00" : ""}${r.cameFromPrev ? " · começou no dia anterior" : ""}</p>
      ${r.note ? `<p class="hxRowNote">${esc(r.note)}</p>` : ""}
    </div></div>`;
}

function daysHTML(rows) {
  const parts = rows.flatMap(splitByDay); // cada pedaço já pertence a um único dia
  view.days = [...new Set(parts.map((r) => r.date))].sort().reverse();
  if (!view.days.length) return "";
  if (!view.days.includes(st.day)) st.day = view.days[0];
  const idx = view.days.indexOf(st.day);
  const list = parts.filter((r) => r.date === st.day).sort((a, b) => a.start - b.start);
  const dayTotal = list.reduce((a, r) => a + r.minutes, 0);
  const base = new Date(st.day + "T00:00:00").getTime();
  const clamp = (v) => Math.min(Math.max(v, 0), 1440);
  const blocks = list.map((r) => {
    const a = clamp((r.start.getTime() - base) / 60000), b = clamp((r.end.getTime() - base) / 60000);
    return `<span class="hxBlock" style="left:${a / 14.4}%;width:${Math.max((b - a) / 14.4, 0.8)}%;background:${subjectById(r.subjectId).color}"
      title="${fmtHM(r.start)} – ${fmtHM(r.end)}"></span>`;
  }).join("");
  const label = new Date(st.day + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return `<div class="hxCard gCard t-violet">
    <div class="gHead"><span class="gIco">${icon("calendar")}</span><div><h3 class="gTitle">Dia a dia</h3><p class="gSub">horário exato de cada ciclo</p></div></div>
    <div class="hxDayNav">
      <button data-daynav="1" ${idx >= view.days.length - 1 ? "disabled" : ""} aria-label="Dia anterior">‹</button>
      <div class="hxDayLbl"><p>${label}</p><p class="s">${fmtMin(dayTotal)} · ${list.length} ciclo${list.length > 1 ? "s" : ""}</p></div>
      <button data-daynav="-1" ${idx <= 0 ? "disabled" : ""} aria-label="Próximo dia">›</button>
    </div>
    <div class="hxStrip"><i style="left:25%"></i><i style="left:50%"></i><i style="left:75%"></i>${blocks}</div>
    <div class="hxStripAxis"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>
    <div class="hxList">${list.map(rowHTML).join("")}</div>
  </div>`;
}

/* ---------- interações (um único listener no contêiner) ---------- */
function wire(box) {
  if (box.dataset.wired) return;
  box.dataset.wired = "1";
  box.addEventListener("click", (e) => {
    const t = e.target.closest("[data-period],[data-subj],[data-h],[data-daynav]");
    if (!t || !box.contains(t) || t.disabled) return;
    if (t.dataset.period) st.period = t.dataset.period;
    else if (t.dataset.subj) st.subject = t.dataset.subj;
    else if (t.dataset.h) st.hour = Number(t.dataset.h);
    else if (t.dataset.daynav) {
      const i = view.days.indexOf(st.day) + Number(t.dataset.daynav);
      if (view.days[i]) st.day = view.days[i];
    }
    draw();
  });
}
