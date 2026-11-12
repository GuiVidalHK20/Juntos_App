/* Metas semanais por matéria. Guardadas em store.profile.subjectGoals
   ({ [subjectId]: minutosPorSemana }) — mesmo padrão de escrita otimista +
   updateDoc usado em subjects.js e distractions.js. Nenhuma coleção nova.

   Como não depende de nenhum elemento do HTML original (cria seu próprio
   botão flutuante e modal, reaproveitando as classes .modalWrap/.modalBox/
   .insightRow/.insightTrack já usadas em stats.js e deepstats.js), isso
   funciona mesmo sem eu conhecer a estrutura completa da página. */
import { db, doc, updateDoc } from "./firebase.js";
import { store, on } from "./store.js";
import { $, esc, fmtMin, weekStartKey, normDay } from "./utils.js";
import { GERAL } from "./constants.js";

function allSubjects() { return [GERAL, ...store.subjects]; }

function weekSubjectMinutes(subjectId) {
  const d = store.profile?.daily || {};
  const ws = weekStartKey();
  let total = 0;
  Object.entries(d).forEach(([k, v]) => {
    if (k < ws) return;
    const e = normDay(v);
    total += e.bySubject?.[subjectId] || 0;
  });
  return total;
}

async function saveGoal(subjectId, minutes) {
  const goals = { ...(store.profile.subjectGoals || {}) };
  if (minutes > 0) goals[subjectId] = minutes; else delete goals[subjectId];
  store.profile = { ...store.profile, subjectGoals: goals }; // otimista
  renderGoalsList();
  await updateDoc(doc(db, "users", store.me.uid), { subjectGoals: goals }).catch(() => {});
}

let panelEl = null;

function buildPanel() {
  const wrap = document.createElement("div");
  wrap.className = "modalWrap hide";
  wrap.id = "goalsWrap";
  wrap.innerHTML = `
    <div class="modalBox" style="max-width:420px;width:100%;max-height:86vh;overflow:auto;box-sizing:border-box;">
      <p class="modalTitle">🎯 Metas da semana</p>
      <p class="muted" style="margin-top:-6px">Defina quantos minutos quer estudar de cada matéria por semana. Deixe em branco para não ter meta.</p>
      <div id="goalsList" style="display:flex;flex-direction:column;gap:16px;margin:16px 0"></div>
      <div class="modalBtns"><button class="primary" data-act="close">Fechar</button></div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('[data-act="close"]').addEventListener("click", closeGoalsPanel);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) closeGoalsPanel(); });
  return wrap;
}

function renderGoalsList() {
  const box = $("goalsList");
  if (!box || !store.profile) return;
  const goals = store.profile.subjectGoals || {};
  box.innerHTML = allSubjects().map((s) => {
    const goal = goals[s.id] || 0;
    const cur = weekSubjectMinutes(s.id);
    const pct = goal > 0 ? Math.min(100, Math.round((cur / goal) * 100)) : 0;
    const hit = goal > 0 && cur >= goal;
    return `
      <div class="goalRow">
        <div class="insightRow">
          <span class="insightLbl"><span class="dot" style="background:${s.color}"></span> ${esc(s.name)}</span>
          <div class="insightTrack"><i style="width:${pct}%;background:${s.color}"></i></div>
          <span class="insightVal">${fmtMin(cur)}${goal ? ` / ${fmtMin(goal)}` : ""}</span>
        </div>
        <div class="row" style="margin-top:6px;gap:10px;align-items:center">
          <input type="number" min="0" step="15" class="f goalInput" data-id="${esc(s.id)}"
            value="${goal || ""}" placeholder="minutos/semana" style="max-width:150px">
          ${hit ? `<span style="color:var(--i-good);font-size:13px">✓ meta batida</span>` : ""}
        </div>
      </div>`;
  }).join("");
  box.querySelectorAll(".goalInput").forEach((inp) => {
    inp.addEventListener("change", () => saveGoal(inp.dataset.id, Math.max(0, Number(inp.value) || 0)));
  });
}

export function openGoalsPanel() {
  if (!panelEl) panelEl = buildPanel();
  panelEl.classList.remove("hide");
  renderGoalsList();
}
function closeGoalsPanel() { if (panelEl) panelEl.classList.add("hide"); }

function ensureButton() {
  if ($("goalsFab")) return;
  const btn = document.createElement("button");
  btn.id = "goalsFab";
  btn.textContent = "🎯";
  btn.title = "Metas da semana";
  btn.style.cssText = "position:fixed;left:16px;bottom:86px;z-index:40;width:48px;height:48px;" +
    "border-radius:50%;border:none;background:#E0A62B;color:#11141C;font-size:20px;" +
    "box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer;";
  btn.addEventListener("click", openGoalsPanel);
  document.body.appendChild(btn);
}

export function initGoals() {
  ensureButton();
  // refaz a lista quando o perfil muda (ex: outro aparelho editou uma meta)
  on("auth:changed", () => { if (panelEl && !panelEl.classList.contains("hide")) renderGoalsList(); });
}
