/* Conquistas: nada aqui é salvo no Firestore — tudo é derivado de
   store.profile.daily / periodTotals, mesmo espírito do deepstats.js.
   Botão flutuante "🏆" abre um painel com a grade de badges. */
import { addToDock } from "./ux.js";
import { store, on } from "./store.js";
import { $, esc, dateKey, normDay, weekStartKey, sumDaily, computeStreak, longestStreakEver, brNow } from "./utils.js";

function totalMinutesEver(daily) {
  return Object.values(daily || {}).reduce((a, v) => a + normDay(v).total, 0);
}
function distinctSubjectsThisWeek(daily) {
  const ws = weekStartKey();
  const set = new Set();
  Object.entries(daily || {}).forEach(([k, v]) => {
    if (k < ws) return;
    Object.keys(normDay(v).bySubject || {}).forEach((sid) => set.add(sid));
  });
  return set.size;
}
function daysStudiedThisWeek(daily) {
  const wsDate = new Date(weekStartKey() + "T00:00:00");
  const today = brNow(); today.setHours(0, 0, 0, 0);
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const dt = new Date(wsDate); dt.setDate(dt.getDate() + i);
    if (dt > today) break;
    if (normDay(daily[dateKey(dt)]).total > 0) count++;
  }
  return count;
}

function buildBadges() {
  const daily = store.profile?.daily || {};
  const periods = store.profile?.periodTotals || {};
  const streak = computeStreak(daily).days;
  const longest = longestStreakEver(daily);
  const bestStreak = Math.max(streak, longest);
  const total = totalMinutesEver(daily);
  const week = sumDaily(daily, (k) => k >= weekStartKey());
  const subjectsThisWeek = distinctSubjectsThisWeek(daily);
  const perfect = daysStudiedThisWeek(daily);

  return [
    { icon: "🌱", title: "Primeiros passos", desc: "Registre sua primeira sessão de estudo.",
      unlocked: total > 0 },
    { icon: "🔥", title: "Pegando ritmo", desc: "3 dias seguidos estudando.",
      unlocked: bestStreak >= 3, progress: [Math.min(bestStreak, 3), 3] },
    { icon: "🔥", title: "Uma semana seguida", desc: "7 dias seguidos estudando.",
      unlocked: bestStreak >= 7, progress: [Math.min(bestStreak, 7), 7] },
    { icon: "🔥", title: "Hábito formado", desc: "30 dias seguidos estudando.",
      unlocked: bestStreak >= 30, progress: [Math.min(bestStreak, 30), 30] },
    { icon: "⏱️", title: "10 horas no total", desc: "Acumule 10h de estudo.",
      unlocked: total >= 600, progress: [Math.min(total, 600), 600] },
    { icon: "⏱️", title: "50 horas no total", desc: "Acumule 50h de estudo.",
      unlocked: total >= 3000, progress: [Math.min(total, 3000), 3000] },
    { icon: "🏆", title: "Maratona de estudo", desc: "Acumule 100h de estudo.",
      unlocked: total >= 6000, progress: [Math.min(total, 6000), 6000] },
    { icon: "📅", title: "Semana presente", desc: "Estude todos os dias já passados desta semana (pausas fazem parte: nenhuma conquista é obrigatória).",
      unlocked: perfect >= 7, progress: [perfect, 7] },
    { icon: "🎨", title: "Variedade", desc: "Estude 3 matérias diferentes na mesma semana.",
      unlocked: subjectsThisWeek >= 3, progress: [Math.min(subjectsThisWeek, 3), 3] },
    { icon: "🌅", title: "Estudo de madrugada", desc: "Estude de madrugada (0h–6h).",
      unlocked: (periods.madrugada || 0) > 0 },
    { icon: "🌙", title: "Coruja", desc: "Acumule 5h estudando à noite (18h–24h).",
      unlocked: (periods.noite || 0) >= 300, progress: [Math.min(periods.noite || 0, 300), 300] },
    { icon: "💪", title: "Semana intensa", desc: "Estude 10h ou mais em uma única semana.",
      unlocked: week >= 600, progress: [Math.min(week, 600), 600] },
  ];
}

function renderGrid() {
  const box = $("achievementsGrid");
  if (!box) return;
  const badges = buildBadges();
  const unlockedCount = badges.filter((b) => b.unlocked).length;
  $("achievementsCount").textContent = `${unlockedCount} de ${badges.length} desbloqueadas`;
  box.innerHTML = badges.map((b) => `
    <div class="row" style="opacity:${b.unlocked ? 1 : .45};gap:12px;align-items:flex-start">
      <span style="font-size:26px;line-height:1">${b.icon}</span>
      <div style="flex:1">
        <p class="name" style="margin:0;font-weight:700">${esc(b.title)}</p>
        <p class="muted" style="margin:2px 0 0;font-size:12.5px">${esc(b.desc)}</p>
        ${(!b.unlocked && b.progress) ? `<div class="insightTrack" style="margin-top:6px">
          <i style="width:${Math.round((b.progress[0] / b.progress[1]) * 100)}%"></i></div>` : ""}
      </div>
    </div>`).join("");
}

let panelEl = null;
function buildPanel() {
  const wrap = document.createElement("div");
  wrap.className = "modalWrap hide";
  wrap.id = "achievementsWrap";
  wrap.innerHTML = `
    <div class="modalBox" style="max-width:440px;width:100%;max-height:86vh;overflow:auto;box-sizing:border-box;">
      <p class="modalTitle">🏆 Conquistas</p>
      <p class="muted" id="achievementsCount" style="margin-top:-6px"></p>
      <div id="achievementsGrid" style="display:flex;flex-direction:column;gap:14px;margin:16px 0"></div>
      <div class="modalBtns"><button class="primary" data-act="close">Fechar</button></div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('[data-act="close"]').addEventListener("click", () => wrap.classList.add("hide"));
  wrap.addEventListener("click", (e) => { if (e.target === wrap) wrap.classList.add("hide"); });
  return wrap;
}
export function openAchievementsPanel() {
  if (!panelEl) panelEl = buildPanel();
  panelEl.classList.remove("hide");
  renderGrid();
}
function ensureButton() {
  if ($("achievementsFab")) return;
  const btn = document.createElement("button");
  btn.id = "achievementsFab";
  btn.textContent = "🏆";
  btn.title = "Conquistas";
  btn.className = "fabItem fabAch";
  btn.addEventListener("click", openAchievementsPanel);
  addToDock(btn);
}
export function initAchievements() {
  ensureButton();
  on("auth:ready", () => { if (panelEl && !panelEl.classList.contains("hide")) renderGrid(); });
}
