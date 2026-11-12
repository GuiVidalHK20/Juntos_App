/* Revisão espaçada simples, por matéria (sem cartões — o "conteúdo" é a
   própria matéria). Guardada em store.profile.reviewSchedule =
   { [subjectId]: { level, next } }. Cada vez que uma sessão de foco é
   concluída para uma matéria (chamado a partir de studylog.js), o
   intervalo avança; o painel mostra o que está "vencido" para revisão. */
import { db, doc, updateDoc } from "./firebase.js";
import { store, on } from "./store.js";
import { $, esc, dateKey, toast, subjectById, shiftDateKey } from "./utils.js";
import { INTERVALS, renderDueCards } from "./flashcards.js";
import { addToDock } from "./ux.js";

/* 2.26 — a revisão agendada vai JUNTO da gravação do ciclo (timer.js → logMinutes), no mesmo documento
   users/{uid}: uma gravação em vez de duas. Aplica o estado otimista no store e devolve o pedaço a gravar. */
export function reviewPatch(subjectId) {
  if (!store.me || !subjectId) return {};
  const sched = { ...(store.profile.reviewSchedule || {}) };
  const cur = sched[subjectId];
  const level = cur ? Math.min(cur.level + 1, INTERVALS.length - 1) : 0;
  const next = shiftDateKey(dateKey(), INTERVALS[level]);
  sched[subjectId] = { level, next };
  store.profile = { ...store.profile, reviewSchedule: sched }; // otimista
  return { [`reviewSchedule.${subjectId}`]: sched[subjectId] };
}

function dueSubjects() {
  const sched = store.profile?.reviewSchedule || {};
  const today = dateKey();
  return Object.entries(sched).filter(([, v]) => v.next <= today).map(([sid]) => subjectById(sid));
}

let notifiedToday = null;
function maybeNotify() {
  const today = dateKey();
  if (notifiedToday === today) return;
  const due = dueSubjects();
  if (due.length === 0) return;
  notifiedToday = today;
  toast(`📌 Que tal revisar: ${due.map((s) => s.name).join(", ")}`);
}

let panelEl = null;
function buildPanel() {
  const wrap = document.createElement("div");
  wrap.className = "modalWrap hide";
  wrap.id = "reviewWrap";
  wrap.innerHTML = `
    <div class="modalBox" style="max-width:420px;width:100%;max-height:86vh;overflow:auto;box-sizing:border-box;">
      <p class="modalTitle">📌 Revisão espaçada</p>
      <p class="muted" style="margin-top:-6px">Sugestões de revisão com base no que você já estudou.</p>
      <p class="sechead" style="margin:14px 0 8px">Perguntas de hoje</p>
      <div id="reviewCards" style="display:flex;flex-direction:column;gap:10px;margin:0 0 14px"></div>
      <p class="sechead" style="margin:14px 0 8px">Matérias</p>
      <div id="reviewList" style="display:flex;flex-direction:column;gap:10px;margin:0 0 16px"></div>
      <div class="modalBtns"><button class="primary" data-act="close">Fechar</button></div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('[data-act="close"]').addEventListener("click", () => wrap.classList.add("hide"));
  wrap.addEventListener("click", (e) => { if (e.target === wrap) wrap.classList.add("hide"); });
  return wrap;
}
function renderList() {
  const box = $("reviewList");
  if (!box) return;
  const sched = store.profile?.reviewSchedule || {};
  const today = dateKey();
  const rows = Object.entries(sched).map(([sid, v]) => ({ s: subjectById(sid), ...v }))
    .sort((a, b) => a.next.localeCompare(b.next));
  const cardsBox = $("reviewCards");
  if (cardsBox) renderDueCards(cardsBox);
  box.innerHTML = rows.length === 0
    ? `<p class="muted">Nenhuma matéria com revisão agendada ainda — estude alguma para começar.</p>`
    : rows.map((r) => {
      const due = r.next <= today;
      return `<div class="row" style="justify-content:space-between">
        <span class="name"><span class="dot" style="background:${r.s.color}"></span> ${esc(r.s.name)}</span>
        <span style="font-size:13px;${due ? "color:var(--i-danger);font-weight:700" : "color:var(--muted)"}">${due ? "vencida hoje" : `revisar em ${r.next}`}</span>
      </div>`;
    }).join("");
}
export function openReviewPanel() {
  if (!panelEl) panelEl = buildPanel();
  panelEl.classList.remove("hide");
  renderList();
}
function ensureButton() {
  if ($("reviewFab")) return;
  const btn = document.createElement("button");
  btn.id = "reviewFab";
  btn.textContent = "📌";
  btn.title = "Revisão espaçada";
  btn.className = "fabItem fabReview";
  btn.addEventListener("click", openReviewPanel);
  addToDock(btn);
}
export function initSpacedRepetition() {
  ensureButton();
  on("auth:ready", () => setTimeout(maybeNotify, 1500));
}
