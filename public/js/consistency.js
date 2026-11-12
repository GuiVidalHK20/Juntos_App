/* Painel de constância (2.14) — Estatísticas → Resumo.
   Em vez de só somar horas, celebra PRESENÇA: em quantos dias você apareceu, mesmo que por pouco.
   Princípios: (1) um ciclo curto conta tanto quanto um longo na grade de dias; (2) nunca mostra
   "falta", "meta não batida" nem compara com outras pessoas; (3) semana mais leve é tratada como
   parte do caminho; (4) recomeços são contados e celebrados. Só lê os totais diários já carregados. */
import { store } from "./store.js";
import { $, fmtMin, dateKey, normDay, brNow } from "./utils.js";
import { WEEKDAYS } from "./constants.js";
import { icon } from "./icons.js";

const DAYS = 28, WEEKS = 8;

function lastDays(daily, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = brNow(); dt.setDate(dt.getDate() - i);
    const k = dateKey(dt);
    out.push({ key: k, day: dt.getDate(), wd: WEEKDAYS[dt.getDay()], min: normDay(daily[k]).total, today: i === 0 });
  }
  return out;
}
const level = (m) => (m <= 0 ? "" : m < 25 ? "l1" : m < 60 ? "l2" : "l3");

export function renderConsistency() {
  const box = $("consistencyPanel");
  if (!box || !store.profile) return;
  const daily = store.profile.daily || {};
  const cal = lastDays(daily, DAYS);
  const presence = cal.filter((d) => d.min > 0).length;
  const total = cal.reduce((a, d) => a + d.min, 0);

  // presença por bloco de 7 dias (o último bloco termina hoje)
  const long = lastDays(daily, WEEKS * 7);
  const weeks = [];
  for (let w = 0; w < WEEKS; w++) weeks.push(long.slice(w * 7, w * 7 + 7).filter((d) => d.min > 0).length);
  const cur = weeks[WEEKS - 1], prev = weeks[WEEKS - 2];

  // retomadas: voltou a estudar depois de 2+ dias sem aparecer
  let restarts = 0, gap = 0, seen = false;
  long.forEach((d) => {
    if (d.min > 0) { if (seen && gap >= 2) restarts++; seen = true; gap = 0; } else gap++;
  });

  let headline, sub;
  if (presence === 0) {
    headline = "Aqui cabe um recomeço.";
    sub = "Quando fizer sentido para você, um ciclo curto já conta. Sem pressa.";
  } else {
    headline = `Você apareceu em <b>${presence}</b> de ${DAYS} dias.`;
    sub = cur > prev ? "Nesta semana você veio mais do que na anterior. É assim que a constância se constrói."
      : cur === prev && cur > 0 ? "Seu ritmo se manteve. Isso é constância."
      : "Semana mais leve. Descansar também faz parte, e você pode voltar quando quiser.";
  }
  const today = cal[cal.length - 1].min;
  const notes = [];
  if (today > 0) notes.push(`Hoje: ${fmtMin(today)} de dedicação. Cada ciclo conta. 🌱`);
  if (restarts > 0) notes.push(`Você recomeçou ${restarts} ${restarts === 1 ? "vez" : "vezes"} nos últimos 2 meses. Recomeçar também é disciplina.`);
  if (total > 0) notes.push(`Total dos últimos ${DAYS} dias: ${fmtMin(total)}.`);

  // cada dia é um botão: tocar mostra o dia e o tempo logo abaixo (antes isso só aparecia ao passar o mouse)
  const grid = cal.map((d, i) => `<button type="button" class="consDay ${level(d.min)} ${d.today ? "today" : ""}" data-i="${i}" aria-label="${d.wd}, dia ${d.day}: ${d.min > 0 ? fmtMin(d.min) : "descanso"}">${d.day}</button>`).join("");
  const spoken = `Calendário dos últimos ${DAYS} dias: você estudou em ${presence} deles. Quanto mais forte a cor, mais tempo no dia; dias sem cor foram descanso.`;

  box.innerHTML = `
    <div class="consTop">
      <div class="gHead"><span class="gIco">${icon("check")}</span><div><h3 class="gTitle" id="consTitle">Sua constância</h3><p class="gSub">Últimos ${DAYS} dias</p></div></div>
      <div class="consNum" aria-label="${presence} de ${DAYS} dias"><b>${presence}</b><span> / ${DAYS}</span><small>${presence === 1 ? "dia" : "dias"} com estudo</small></div>
    </div>
    <p class="consSub">${presence === 0 ? headline + " " : ""}${sub}</p>
    <div class="consGrid" role="group" aria-label="${spoken}">${grid}</div>
    <p class="gReadout" id="consReadout" aria-live="polite">Toque num dia para ver o tempo estudado.</p>
    <div class="consLegend" aria-hidden="true"><span>menos</span><i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><span>mais</span></div>
    ${notes.map((n) => `<p class="consNote">${n}</p>`).join("")}`;

  box.querySelector(".consGrid").addEventListener("click", (e) => {
    const b = e.target.closest(".consDay"); if (!b) return;
    box.querySelectorAll(".consDay.sel").forEach((x) => x.classList.remove("sel"));
    b.classList.add("sel");
    const d = cal[Number(b.dataset.i)];
    $("consReadout").innerHTML = `<b>${d.today ? "Hoje" : `${d.wd}, dia ${d.day}`}</b> · ${d.min > 0 ? fmtMin(d.min) : "descanso — também faz parte"}`;
  });
}
