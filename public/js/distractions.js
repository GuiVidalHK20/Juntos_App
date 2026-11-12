/* "Despejo mental": anotar rapidinho um pensamento intruso sem parar o
   cronômetro. Fica guardado como uma lista simples no próprio documento do
   usuário — sem coleção nova, sem leituras extras. */
import { db, doc, updateDoc, arrayUnion, arrayRemove } from "./firebase.js";
import { store } from "./store.js";
import { $, esc, toast, openModal } from "./utils.js";

export function renderDistractions() {
  const list = (store.profile?.distractions || []).slice().sort((a, b) => b.ts - a.ts);
  $("dumpCount").textContent = list.filter((d) => !d.done).length;
  $("dumpToggle").classList.toggle("hide", list.length === 0);
  $("dumpList").innerHTML = list.length === 0
    ? `<p class="muted">Nada anotado por aqui.</p>`
    : list.map((d) => `
      <div class="dumpRow ${d.done ? "done" : ""}">
        <button class="dumpCheck" data-id="${d.id}">${d.done ? "☑" : "☐"}</button>
        <span class="dumpText">${esc(d.text)}</span>
        <button class="dumpX" data-del="${d.id}">✕</button>
      </div>`).join("");
  $("dumpList").querySelectorAll(".dumpCheck").forEach((b) =>
    b.addEventListener("click", () => toggleDone(b.dataset.id)));
  $("dumpList").querySelectorAll(".dumpX").forEach((b) =>
    b.addEventListener("click", () => removeItem(b.dataset.del)));
}

async function toggleDone(id) {
  const list = store.profile.distractions || [];
  const item = list.find((d) => d.id === id);
  if (!item) return;
  const next = list.map((d) => d.id === id ? { ...d, done: !d.done } : d);
  store.profile = { ...store.profile, distractions: next };  // otimista
  renderDistractions();
  await updateDoc(doc(db, "users", store.me.uid), { distractions: next }).catch(() => {});
}
async function removeItem(id) {
  const list = store.profile.distractions || [];
  const item = list.find((d) => d.id === id);
  const next = list.filter((d) => d.id !== id);
  store.profile = { ...store.profile, distractions: next };  // otimista
  renderDistractions();
  if (item) await updateDoc(doc(db, "users", store.me.uid), { distractions: arrayRemove(item) }).catch(() => {});
}

export function initDistractions() {
  $("dumpBtn").addEventListener("click", async () => {
    const text = await openModal({
      title: "Anotar rapidinho — o cronômetro continua rodando",
      placeholder: "Ex: pagar a conta de luz…",
      confirmLabel: "Guardar", allowSkip: true, skipLabel: "Cancelar"
    });
    if (!text) return;
    const item = { id: "d" + Math.random().toString(36).slice(2, 8), text, ts: Date.now(), done: false };
    store.profile = { ...store.profile, distractions: [...(store.profile.distractions || []), item] }; // otimista
    renderDistractions();
    toast("Anotado. Interrupções acontecem — volte ao que estava fazendo quando quiser. 💭");
    await updateDoc(doc(db, "users", store.me.uid), { distractions: arrayUnion(item) }).catch(() => {});
  });
  $("dumpToggle").addEventListener("click", () => $("dumpList").classList.toggle("hide"));
}
