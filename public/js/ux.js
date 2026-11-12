/* Experiência (2.17): visual do app, tela de foco minimalista, ampulheta fluida, conclusão suave e
   perguntas para lembrar. Tudo é preferência DESTE aparelho (localStorage, nunca vai para o servidor).
   O script do <head> do index.html aplica estas mesmas preferências antes da primeira pintura, para
   não piscar o visual errado na abertura. Se mudar um padrão aqui, mude também lá. */
const KEY = "juntos.ux.v1";
export const UX_DEFAULTS = { layout: "atual", focus: true, hourglass: false, soft: true, cards: true, grat: true, volume: 0.3 };
const LAYOUTS = ["atual", "celular", "tablet", "computador"];

function load() {
  try { return { ...UX_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { ...UX_DEFAULTS }; }
}
let state = load();
const $ = (id) => document.getElementById(id);

export const getUx = () => state;

export function setUx(patch) {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  applyUx();
  document.dispatchEvent(new CustomEvent("juntos:ux", { detail: state }));
}

export function applyUx() {
  const r = document.documentElement;
  if (LAYOUTS.includes(state.layout) && state.layout !== "atual") r.dataset.layout = state.layout;
  else delete r.dataset.layout;
  if (state.focus) r.dataset.focus = "min";
  else { delete r.dataset.focus; delete r.dataset.more; }
  if (state.hourglass) r.dataset.hourglass = "on";
  else delete r.dataset.hourglass;
  paint();
}

// "⋯ Mais" mostra os menus e botões secundários enquanto a tela de foco estiver ligada
export function toggleMore(force) {
  const r = document.documentElement;
  const on = typeof force === "boolean" ? force : !r.hasAttribute("data-more");
  if (on) r.dataset.more = "1"; else delete r.dataset.more;
  paint();
}

/* Dock dos botões flutuantes (🧰): revisão 📌, conquistas 🏆 e sons 🌿 ficavam soltos em posições fixas
   diferentes e cobriam botões e textos. Agora ficam num só lugar, recolhidos por padrão (um único botão
   pequeno acima da barra de abas) e abrem para cima só quando a pessoa toca. */
export function fabDock() {
  let d = document.getElementById("fabDock");
  if (d) return d;
  d = document.createElement("div");
  d.id = "fabDock";
  d.innerHTML = `<div class="fabList" id="fabList" hidden></div>
    <button type="button" id="fabToggle" aria-expanded="false" aria-controls="fabList" aria-label="Atalhos: revisão, conquistas e sons" title="Atalhos">＋</button>`;
  document.body.appendChild(d);
  const list = d.querySelector("#fabList"), tg = d.querySelector("#fabToggle");
  const set = (open) => { list.hidden = !open; tg.setAttribute("aria-expanded", open ? "true" : "false"); tg.textContent = open ? "✕" : "＋"; };
  tg.addEventListener("click", () => set(list.hidden));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
  document.addEventListener("click", (e) => { if (!list.hidden && !d.contains(e.target) && !e.target.closest("#ambientPanel")) set(false); });
  return d;
}
export function addToDock(btn) { fabDock().querySelector("#fabList").appendChild(btn); }

function paint() {
  document.querySelectorAll(".uxLayout").forEach((b) => {
    const on = b.dataset.layout === (state.layout || "atual");
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const checks = { uxFocus: state.focus, uxHourglass: state.hourglass, uxSoft: state.soft, uxCards: state.cards, uxGrat: state.grat };
  for (const [id, v] of Object.entries(checks)) { const el = $(id); if (el) el.checked = !!v; }
  const open = document.documentElement.hasAttribute("data-more");
  ["focusMoreBtn", "focusLessBtn"].forEach((id) => $(id)?.setAttribute("aria-expanded", open ? "true" : "false"));
}

export function initUx() {
  document.querySelectorAll(".uxLayout").forEach((b) =>
    b.addEventListener("click", () => setUx({ layout: b.dataset.layout })));
  $("uxFocus")?.addEventListener("change", (e) => setUx({ focus: e.target.checked }));
  $("uxHourglass")?.addEventListener("change", (e) => setUx({ hourglass: e.target.checked }));
  $("uxSoft")?.addEventListener("change", (e) => setUx({ soft: e.target.checked }));
  $("uxCards")?.addEventListener("change", (e) => setUx({ cards: e.target.checked }));
  $("uxGrat")?.addEventListener("change", (e) => setUx({ grat: e.target.checked }));
  $("focusMoreBtn")?.addEventListener("click", () => toggleMore(true));
  $("focusLessBtn")?.addEventListener("click", () => toggleMore(false));
  fabDock();
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.documentElement.hasAttribute("data-more")) toggleMore(false);
  });
  applyUx();
}
