import { db, doc, updateDoc, arrayUnion, arrayRemove } from "./firebase.js";
import { store, emit } from "./store.js";
import { $, esc, toast, renderColorPicker } from "./utils.js";
import { SUBJECT_COLORS, GERAL } from "./constants.js";

export function renderSubjectChips(locked) {
  const all = [GERAL, ...store.subjects];
  if (!all.find((s) => s.id === store.currentSubjectId)) store.currentSubjectId = "geral";
  $("subjectChips").innerHTML = all.map((s) => `
    <button class="chip ${s.id === store.currentSubjectId ? "on" : ""}" data-subj="${esc(s.id)}" ${locked ? "disabled" : ""}
      style="${s.id === store.currentSubjectId ? `border-color:${s.color};background:${s.color}22` : ""}">
      <span class="dot" style="background:${s.color}"></span>${esc(s.name)}
    </button>`).join("");
  document.querySelectorAll("#subjectChips .chip").forEach((b) =>
    b.addEventListener("click", () => {
      if (locked) return;
      store.currentSubjectId = b.dataset.subj;
      renderSubjectChips(locked);
      emit("subject:changed");
    }));
}

export function renderSettingsSubjects() {
  $("subjList").innerHTML = store.subjects.length === 0
    ? `<p class="muted">Nenhuma matéria ainda. Adicione abaixo.</p>`
    : store.subjects.map((s) => `<div class="row"><span class="dot" style="background:${s.color}"></span>
        <span class="name">${esc(s.name)}</span><button class="x" data-del="${esc(s.id)}">✕</button></div>`).join("");
  document.querySelectorAll("#subjList .x").forEach((b) =>
    b.addEventListener("click", () => removeSubject(b.dataset.del)));
  const sw = $("subjSwatches");
  if (!sw.dataset.picked) sw.dataset.picked = SUBJECT_COLORS[store.subjects.length % SUBJECT_COLORS.length];
  renderColorPicker(sw, SUBJECT_COLORS, sw.dataset.picked, (c) => {
    sw.dataset.picked = c;
    renderSettingsSubjects();
  });
}
async function removeSubject(id) {
  const s = store.subjects.find((x) => x.id === id);
  if (!s) return;
  // otimista: some da lista na hora, sem esperar o Firestore confirmar
  store.subjects = store.subjects.filter((x) => x.id !== id);
  // guarda nome e cor num "arquivo" (removedSubjects) antes de tirar da lista viva —
  // é isso que deixa os gráficos (7 dias, catálogo semanal, aprofundado…) continuarem
  // mostrando o nome certo da matéria em vez de "Matéria removida" (ver subjectById em utils.js)
  store.profile = { ...store.profile, removedSubjects: { ...(store.profile.removedSubjects || {}), [id]: { name: s.name, color: s.color } } };
  renderSettingsSubjects();
  if (store.currentSubjectId === id) { store.currentSubjectId = "geral"; emit("subject:changed"); }
  await updateDoc(doc(db, "users", store.me.uid), {
    subjects: arrayRemove(s),
    [`removedSubjects.${id}`]: { name: s.name, color: s.color }
  }).catch(() => {});
  toast("Matéria removida. As horas já estudadas continuam nas estatísticas, com o nome certo.");
}

export function renderQuickSettings() {
  $("quickList").innerHTML = store.quickMsgs.map((m) =>
    `<div class="row"><span class="name">${esc(m)}</span><button class="x" data-delq="${esc(m)}">✕</button></div>`).join("");
  document.querySelectorAll("#quickList .x").forEach((b) => b.addEventListener("click", async () => {
    store.quickMsgs = store.quickMsgs.filter((m) => m !== b.dataset.delq);
    renderQuickSettings();
    await updateDoc(doc(db, "users", store.me.uid), { quickMsgs: arrayRemove(b.dataset.delq) }).catch(() => {});
  }));
  $("quickMsgs").innerHTML = store.quickMsgs.map((m) => `<button data-q="${esc(m)}">${esc(m)}</button>`).join("");
  document.querySelectorAll("#quickMsgs button").forEach((b) =>
    b.addEventListener("click", () => emit("message:quicksend", b.dataset.q)));
}

export function initSubjects() {
  $("addSubj").addEventListener("click", async () => {
    const name = $("subjName").value.trim();
    if (!name) return;
    const s = { id: "s" + Math.random().toString(36).slice(2, 8), name, color: $("subjSwatches").dataset.picked || SUBJECT_COLORS[0] };
    store.subjects = [...store.subjects, s];   // otimista
    renderSettingsSubjects(); renderSubjectChips(false);
    $("subjName").value = "";
    await updateDoc(doc(db, "users", store.me.uid), { subjects: arrayUnion(s) }).catch(() => {});
    toast("Matéria adicionada.");
  });
  $("addQuick").addEventListener("click", async () => {
    const t = $("quickText").value.trim();
    if (!t) return;
    store.quickMsgs = [...store.quickMsgs, t];  // otimista
    renderQuickSettings();
    $("quickText").value = "";
    await updateDoc(doc(db, "users", store.me.uid), { quickMsgs: arrayUnion(t) }).catch(() => {});
    toast("Atalho adicionado.");
  });
}
