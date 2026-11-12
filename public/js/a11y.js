/* Acessibilidade do Juntos (v2.13) — camada por cima da interface, sem mexer em dados.
   O que este módulo faz:
   1) announce(): fala uma mensagem para leitores de tela (VoiceOver, TalkBack, NVDA, JAWS)
      por duas "regiões vivas" invisíveis (#srPolite e #srAlert). É o que avisa o fim do
      cronômetro, uma mensagem nova na sala, uma tarefa concluída etc.
   2) Mantém os atributos ARIA dos botões que funcionam como "ligado/desligado" ou "aba atual"
      (aria-pressed / aria-current), lendo a classe visual "on" que o app já usa. Assim nenhum
      outro módulo precisou mudar.
   3) Dá suporte a teclado (Enter/Espaço) em elementos clicáveis que não são <button>.
   4) Faz as janelas (modais) se comportarem como janelas de verdade: foco entra, Tab fica
      dentro, Esc fecha e o foco volta pra quem abriu.
   5) Link "Pular para o conteúdo" e foco na tela nova quando a pessoa troca de aba. */

let polite = null, alertEl = null;

function ensureRegions() {
  if (polite && alertEl && document.body.contains(polite)) return;
  const make = (id, live, role) => {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.className = "sr-only";
      document.body.appendChild(el);
    }
    el.setAttribute("aria-live", live);
    el.setAttribute("role", role);
    el.setAttribute("aria-atomic", "true");
    return el;
  };
  polite = make("srPolite", "polite", "status");
  alertEl = make("srAlert", "assertive", "alert");
}

/* Fala `msg` para leitores de tela. { urgent: true } interrompe o que estiver sendo lido
   (use só para fim de cronômetro). O texto é limpo e recolocado em duas etapas porque,
   se a mesma frase for repetida, vários leitores de tela ignoram a segunda vez. */
export function announce(msg, { urgent = false } = {}) {
  const text = String(msg ?? "").replace(/\s+/g, " ").trim();
  if (!text) return;
  ensureRegions();
  const el = urgent ? alertEl : polite;
  el.textContent = "";
  setTimeout(() => { el.textContent = text; }, 60);
  setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 8000);
}

/* ---------- estados ARIA a partir da classe visual "on" ---------- */
// botões que trocam de estado e ficam "marcados": aria-pressed
const PRESSED_SEL = [
  ".modes button", ".themeBtn", ".palBtn", ".fxBtn", ".chip", ".statsSubTab", ".hxSeg button",
  ".dayBtn", ".roomChip", ".tdSubTabs button", ".tdStyleBtn", ".qChip", ".cChip"
].join(",");
// botões de navegação: aria-current
const CURRENT_SEL = "nav button[data-tab]";

function syncAria() {
  document.querySelectorAll(PRESSED_SEL).forEach((b) => {
    if (b.closest("nav")) return;
    const pressed = b.classList.contains("on") ? "true" : "false";
    if (b.getAttribute("aria-pressed") !== pressed) b.setAttribute("aria-pressed", pressed);
  });
  document.querySelectorAll(CURRENT_SEL).forEach((b) => {
    if (b.classList.contains("on")) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  // elementos clicáveis que não são <button>: viram "botão" para o teclado e para leitores de tela
  document.querySelectorAll(".tBody, .member[data-open-friend]").forEach((el) => {
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    if (!el.hasAttribute("role")) el.setAttribute("role", "button");
  });
  // botões que só têm emoji/símbolo precisam de um nome falado
  document.querySelectorAll("button").forEach((b) => {
    if (b.hasAttribute("aria-label") || b.hasAttribute("aria-labelledby")) return;
    const txt = (b.textContent || "").trim();
    const title = b.getAttribute("title");
    if (title) { b.setAttribute("aria-label", title); return; }
    if (/^[✕✖×✎🗑⏭⏸▶‹›←→↑↓+−\-…⋯⋮]+$/u.test(txt)) {
      const names = { "✕": "Fechar", "✖": "Fechar", "×": "Fechar", "✎": "Editar", "🗑": "Apagar", "⏭": "Pular", "‹": "Voltar", "›": "Avançar", "←": "Anterior", "→": "Próximo" };
      if (names[txt]) b.setAttribute("aria-label", names[txt]);
    }
  });
}

let syncQueued = false;
function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => { syncQueued = false; syncAria(); });
}

/* ---------- teclado em elementos clicáveis que não são <button> ---------- */
function onKeydown(e) {
  if (e.key !== "Enter" && e.key !== " ") return;
  const el = e.target;
  if (!el || !el.matches || !el.matches('[role="button"]:not(button)')) return;
  if (el.matches("input,textarea,select,a")) return;
  e.preventDefault();
  el.click();
}

/* ---------- janelas (modais): foco preso, Esc fecha, foco volta ---------- */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
const openers = new WeakMap();

function watchDialog(wrap) {
  if (wrap.dataset.a11y) return;
  wrap.dataset.a11y = "1";
  const box = wrap.querySelector(".modalBox, .sheetBox") || wrap;
  if (!wrap.hasAttribute("role")) wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  const title = box.querySelector(".modalTitle, .sheetTitle, h2, h3");
  if (title) {
    if (!title.id) title.id = "dlg" + Math.random().toString(36).slice(2, 8);
    if (!wrap.hasAttribute("aria-labelledby")) wrap.setAttribute("aria-labelledby", title.id);
  } else if (!wrap.hasAttribute("aria-label")) {
    wrap.setAttribute("aria-label", "Janela");
  }
  openers.set(wrap, document.activeElement);
}

function onModalKeydown(e) {
  const wrap = e.target.closest ? e.target.closest(".modalWrap:not(.hide)") : null;
  if (!wrap) return;
  if (e.key === "Escape") {
    // só fecha janelas que têm um botão explícito de "Pular/Cancelar/Fechar" — nunca aciona
    // outros botões (ex.: o "Sair" da tela de aceite dos Termos não pode ser disparado por Esc)
    const cancel = wrap.querySelector('[data-act="skip"], .sheetClose, [data-close]');
    if (cancel) { e.preventDefault(); cancel.click(); }
    return;
  }
  if (e.key !== "Tab") return;
  const items = [...wrap.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function scanDialogs(nodes) {
  nodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.classList?.contains("modalWrap")) watchDialog(n);
    n.querySelectorAll?.(".modalWrap").forEach(watchDialog);
  });
}

function onDialogRemoved(nodes) {
  nodes.forEach((n) => {
    if (n.nodeType !== 1 || !n.classList?.contains("modalWrap")) return;
    const back = openers.get(n);
    if (back && back.focus && document.contains(back)) setTimeout(() => back.focus(), 0);
  });
}

/* ---------- troca de aba: avisa e leva o foco ao começo da tela nova ---------- */
const VIEW_NAMES = {
  "view-timer": "Cronômetro", "view-stats": "Estatísticas", "view-tada": "Ta-da",
  "view-room": "Sala", "view-quotes": "Frases", "view-settings": "Ajustes"
};
let lastView = null;
function watchViews() {
  const app = document.getElementById("app");
  if (!app) return;
  const check = () => {
    const open = app.querySelector('section[id^="view-"]:not(.hide)');
    if (!open || open.id === lastView) return;
    const first = lastView === null;
    lastView = open.id;
    if (first) return; // primeira pintura: não fala nada
    announce(`Tela ${VIEW_NAMES[open.id] || ""}`);
    open.setAttribute("tabindex", "-1");
    // focar força o navegador a calcular o layout da tela inteira; deixa a primeira pintura sair antes (e só foca se ainda for a tela aberta)
    requestAnimationFrame(() => { if (!open.classList.contains("hide")) open.focus({ preventScroll: true }); });
  };
  new MutationObserver(check).observe(app, { subtree: true, attributes: true, attributeFilter: ["class"] });
}

export function initA11y() {
  ensureRegions();

  // link "Pular para o conteúdo" (aparece só quando recebe foco pelo teclado)
  if (!document.getElementById("skipLink")) {
    const a = document.createElement("a");
    a.id = "skipLink"; a.className = "skipLink"; a.href = "#app"; a.textContent = "Pular para o conteúdo";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const main = document.getElementById("app");
      if (main) { main.setAttribute("tabindex", "-1"); main.focus(); }
    });
    document.body.prepend(a);
  }

  // marcos e nomes que não dependem de dados
  document.getElementById("tabs")?.setAttribute("aria-label", "Navegação principal");
  document.getElementById("appHeader")?.setAttribute("role", "banner");
  Object.entries(VIEW_NAMES).forEach(([id, name]) => {
    const el = document.getElementById(id);
    if (el && !el.hasAttribute("aria-label")) el.setAttribute("aria-label", name);
  });

  document.addEventListener("keydown", onKeydown);
  document.addEventListener("keydown", onModalKeydown);

  new MutationObserver((muts) => {
    muts.forEach((m) => {
      if (m.addedNodes.length) scanDialogs(m.addedNodes);
      if (m.removedNodes.length) onDialogRemoved(m.removedNodes);
    });
    queueSync();
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });

  watchViews();
  syncAria();
}
