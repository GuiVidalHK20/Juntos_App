/* Diário de estudos: cada ciclo de foco concluído vira um registro na
   subcoleção users/{uid}/sessions, com uma nota opcional do que foi feito.
   Ficam separados dos totais agregados (users/{uid}.daily) para não pesar
   a leitura do perfil — o histórico só é buscado quando a aba é aberta. */
import { db, doc, collection, setDoc, updateDoc, query, orderBy, limit, getDocs, serverTimestamp } from "./firebase.js";
import { store } from "./store.js";
import { $, esc, fmtMin, fmtHM, sessionSpan, dateKey, subjectById, sessionSubject, openModal, toast } from "./utils.js";
import { openCardMaker } from "./flashcards.js";
import { getUx } from "./ux.js";
import { askGratitudeAfterStudy } from "./gratitude-prompt.js";
import { journalAdd } from "./offlineStore.js";

export async function recordCompletedWork(minutes, subjectId) {
  if (!store.me) return;
  // nome e cor da matéria ficam gravados junto do ciclo: se a matéria for apagada depois, o diário
  // (inclusive o do amigo, que vê o ciclo) ainda mostra o nome certo
  const cur = subjectById(subjectId);
  // O id do ciclo é criado AQUI (doc(collection)) e a gravação é só enfileirada, sem esperar o
  // servidor (2.13). Antes, "await addDoc" travava sem internet: a nota do ciclo nunca abria e o
  // ciclo só era gravado na volta da conexão. Agora o Firestore guarda no aparelho e sincroniza sozinho.
  const ref = doc(collection(db, "users", store.me.uid, "sessions"));
  setDoc(ref, {
    date: dateKey(), minutes: Math.round(minutes * 10) / 10, subjectId: subjectId || "geral",
    subjectName: cur.name, subjectColor: cur.color,
    note: null, split: true, ts: serverTimestamp()
  }).catch(() => {});
  // sem internet: anota no diário local (IndexedDB) só para avisar "tudo sincronizado" depois
  if (typeof navigator !== "undefined" && navigator.onLine === false) journalAdd({ kind: "cycle", minutes: Math.round(minutes * 10) / 10, subjectId: subjectId || "geral" });
  // a revisão espaçada é agendada junto do total do dia, em timer.js → logMinutes (2.26: 1 gravação a menos por ciclo)
  const s = subjectById(subjectId);
  // Diário de reflexão: um momento opcional depois do ciclo para anotar o que fez e o que aprendeu.
  // Vai para a nota do ciclo (aparece no Diário de estudos) e pode ser pulado sem nenhum custo.
  // A gratidão tem passo próprio logo depois (Ta-da → Gratidão); se ele estiver desligado em
  // Ajustes → Experiência, o atalho "Gratidão por…" volta para esta nota.
  const gratStep = getUx().grat !== false;
  const note = await openModal({
    title: `Ciclo concluído · ${s.name}`,
    hint: gratStep ? "Um instante para você, se quiser: o que fez e o que aprendeu." : "Um instante para você, se quiser: o que fez, o que aprendeu ou algo pelo qual é grata(o).",
    chips: gratStep ? ["📘 Hoje eu fiz…", "💡 Aprendi que…", "🌱 Me senti…", "🎯 Amanhã quero…"] : ["📘 Hoje eu fiz…", "💡 Aprendi que…", "🙏 Gratidão por…", "🌱 Me senti…", "🎯 Amanhã quero…"],
    placeholder: "Escreva livremente. Só você vê (e quem você liberar no Diário).",
    confirmLabel: "Guardar reflexão", allowSkip: true, skipLabel: "Agora não"
  });
  if (note) updateDoc(ref, { note }).catch(() => {}); // enfileirada: funciona offline também
  // gratidão depois de estudar: pelo que sou grato e como isso afeta a minha vida (js/gratitude-prompt.js)
  if (gratStep) await askGratitudeAfterStudy({ subjectId: subjectId || "geral", subjectName: s.name, subjectColor: s.color });
  // 2.17 — perguntas rápidas para lembrar (revisão ativa). Só em ciclos de 5 min ou mais e se estiver ligado.
  if (getUx().cards && minutes >= 5) await openCardMaker({ subjectId: subjectId || "geral", subjectName: s.name });
}

let historyLoaded = false;
let historyRows = [];       // ciclos já carregados; o filtro de matéria trabalha em cima deles, sem nova leitura
let historyFilter = "all";  // "all" ou o id de uma matéria
export async function renderHistory(force = false) {
  const box = $("historyList");
  if (historyLoaded && !force) return;
  box.innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const snap = await getDocs(query(collection(db, "users", store.me.uid, "sessions"), orderBy("ts", "desc"), limit(100)));
    // guarda o id do documento junto (antes só a data() era usada) — é o que permite
    // editar a anotação depois de salva, sabendo em qual sessão gravar a mudança
    historyRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    historyLoaded = true;
    drawHistory();
  } catch {
    box.innerHTML = `<p class="muted">Não consegui carregar o histórico.</p>`;
  }
}

function drawHistory() {
  const bar = $("historyFilterBox"), box = $("historyList");
  const sid = (r) => r.subjectId || "geral";

  // filtro por matéria: só aparece se houver mais de uma; ordenado da mais estudada para a menos
  const minutesBy = {};
  historyRows.forEach((r) => { minutesBy[sid(r)] = (minutesBy[sid(r)] || 0) + (r.minutes || 0); });
  const ids = Object.keys(minutesBy).sort((a, b) => minutesBy[b] - minutesBy[a]);
  if (historyFilter !== "all" && !ids.includes(historyFilter)) historyFilter = "all";
  bar.innerHTML = ids.length < 2 ? "" : `<div class="hxScroll">
    <button class="chip ${historyFilter === "all" ? "on" : ""}" data-subj="all">Todas</button>
    ${ids.map((id) => {
      const s = sessionSubject(historyRows.find((r) => sid(r) === id) || { subjectId: id });
      return `<button class="chip ${historyFilter === id ? "on" : ""}" data-subj="${esc(id)}"
        style="${historyFilter === id ? `border-color:${s.color}` : ""}"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</button>`;
    }).join("")}</div>`;
  bar.querySelectorAll("[data-subj]").forEach((b) =>
    b.addEventListener("click", () => { historyFilter = b.dataset.subj; drawHistory(); }));

  const rows = historyFilter === "all" ? historyRows : historyRows.filter((r) => sid(r) === historyFilter);
  box.innerHTML = rows.length === 0
    ? `<p class="muted">Nenhum ciclo registrado ainda.</p>`
    : rows.map((r) => {
      const s = sessionSubject(r);
      const dt = new Date(r.date + "T00:00:00");
      const dateLbl = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
      const sp = sessionSpan(r); // início e fim reais do ciclo (ciclos antigos sem horário ficam sem essa linha)
      return `<div class="logRow">
        <span class="dot" style="background:${s.color}"></span>
        <div class="logBody">
          <p class="logHead">${dateLbl} · ${esc(s.name)} · ${fmtMin(r.minutes)}</p>
          ${sp ? `<p class="logTime">${fmtHM(sp.start)} – ${fmtHM(sp.end)}</p>` : ""}
          ${r.note ? `<p class="logNote">${esc(r.note)}</p>` : `<p class="logNote muted">sem anotação</p>`}
        </div>
        <button class="logEdit" data-editnote="${esc(r.id)}" title="Editar anotação">✎</button>
      </div>`;
    }).join("");
  document.querySelectorAll("#historyList .logEdit").forEach((b) =>
    b.addEventListener("click", () => editNote(b.dataset.editnote, historyRows.find((r) => r.id === b.dataset.editnote)?.note || "")));
}
export function invalidateHistory() { historyLoaded = false; }

/* ---------- editar a anotação de um ciclo já salvo (Diário de estudos) ---------- */
async function editNote(sessionId, currentNote) {
  if (!store.me) return;
  const note = await openModal({
    title: "Editar anotação", value: currentNote, placeholder: 'O que você fez? Ex: "página 12 a 25"',
    confirmLabel: "Salvar", allowSkip: true, skipLabel: "Cancelar"
  });
  if (note == null) return; // cancelou
  try {
    await updateDoc(doc(db, "users", store.me.uid, "sessions", sessionId), { note: note || null });
    invalidateHistory();
    await renderHistory(true);
    toast("Anotação atualizada.");
  } catch { toast("Não consegui salvar a anotação."); }
}
