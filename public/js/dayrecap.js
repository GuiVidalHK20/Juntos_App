/* Cronômetro > "seu dia até agora" — mini-resumo do dia, num cartão próprio, separado de
   tudo que já existia no Cronômetro (não altera nenhum elemento/estilo dele). Só lê dados
   que já existiam (store.profile.daily, o mesmo usado em Estatísticas) — nenhuma coleção
   nova, nenhuma escrita nova no Firestore. */
import { store, on } from "./store.js";
import { $, esc, fmtMin, normDay, dateKey, lastNDaysTotal, computeStreak, subjectById, subjectsWithArchive } from "./utils.js";
import { GERAL } from "./constants.js";
import { setText, setHTML } from "./dom.js";

// as minhas matérias + as que já apaguei (com o nome guardado), pra o resumo do dia não virar "Matéria removida"
function allSubjects() { return [GERAL, ...subjectsWithArchive({ subjects: store.subjects, removedSubjects: store.profile?.removedSubjects })]; }

let lastRenderAt = 0;

// enquanto uma sessão de foco está rodando, soma o tempo já decorrido (ainda não gravado no
// Firestore, que só grava ao concluir um ciclo) pra o resumo não parecer "travado" durante o
// estudo
function liveExtraMin(snap) {
  return snap && snap.phase === "work" ? snap.elapsed / 60 : 0;
}

export function renderDayRecap(snap) {
  const now = Date.now();
  // o tick do cronômetro dispara a cada 250ms; só o resumo não precisa atualizar tão rápido
  if (snap && now - lastRenderAt < 3000) return;
  lastRenderAt = now;

  const body = $("dayRecapBody"), empty = $("dayRecapEmpty");
  if (!body || !store.profile) return;

  const daily = store.profile.daily || {};
  const today = normDay(daily[dateKey()]);
  const live = liveExtraMin(snap);
  const totalToday = today.total + live;

  if (totalToday < 0.5) {
    body.classList.add("hide");
    if (empty) empty.classList.remove("hide");
    return;
  }
  if (empty) empty.classList.add("hide");
  body.classList.remove("hide");

  setText($("dayRecapTotal"), fmtMin(totalToday));

  const avg7 = lastNDaysTotal(daily, 7) / 7;
  const vsEl = $("dayRecapVsAvg");
  if (vsEl) {
    if (avg7 < 1) { setText(vsEl, "–"); vsEl.style.color = ""; }
    else {
      const pct = Math.round(((totalToday - avg7) / avg7) * 100);
      setText(vsEl, (pct >= 0 ? "+" : "") + pct + "%");
      vsEl.style.color = pct >= 0 ? "#8FAE6B" : "var(--muted)";
    }
  }

  const streakEl = $("dayRecapStreak");
  if (streakEl) setText(streakEl, String(computeStreak(daily).days));

  const bySubj = { ...(today.bySubject || {}) };
  if (live > 0) {
    const sid = store.currentSubjectId || "geral";
    bySubj[sid] = (bySubj[sid] || 0) + live;
  }
  const entries = Object.entries(bySubj).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const max = Math.max(1, ...entries.map(([, m]) => m));
  const bars = $("dayRecapBars");
  if (bars) {
    setHTML(bars, entries.map(([sid, m]) => {
      const s = subjectById(sid, allSubjects());
      return `<div class="insightRow">
        <span class="insightLbl"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span>
        <div class="insightTrack"><i style="width:${(m / max) * 100}%;background:${s.color}"></i></div>
        <span class="insightVal">${fmtMin(m)}</span>
      </div>`;
    }).join(""));
  }
}

export function initDayRecap() {
  on("timer:tick", (snap) => renderDayRecap(snap));
}
