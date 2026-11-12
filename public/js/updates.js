/* ============================================================
   Atualização do app SEM mostrar a versão antiga (2.20.1)

   Como funciona (ver também a nota no topo de sw.js):
   - O service worker guarda UMA "geração" completa do app e serve tudo dela (abre na hora e nunca mistura
     arquivo novo com antigo). Uma versão nova é baixada por inteiro em segundo plano e fica esperando.
   - Ao abrir, a splash continua na tela por no máximo GATE_CAP_MS enquanto perguntamos ao servidor se há
     versão nova. Se houver, ela é ativada e o app recarrega ANTES de a tela aparecer.
   - Se a rede estiver lenta demais e a splash sair, a atualização é aplicada quando o app for para segundo
     plano (ou ao voltar, se a pessoa não estiver digitando). O cronômetro é salvo por horário, então
     recarregar nunca perde o ciclo (ver js/timer.js).
============================================================ */
const GATE_CAP_MS = 1500;        // tempo máximo que a splash espera a checagem
const FAILSAFE_MS = 4000;        // se a troca de versão travar, libera a tela mesmo assim
const RESUME_MIN_MS = 30000;     // só confere de novo ao voltar depois de ficar fora ao menos isso
const LOOP_KEY = "juntos.reloadGuard";

const sw = "serviceWorker" in navigator ? navigator.serviceWorker : null;
let hadController = !!sw?.controller;   // false = primeira instalação: não existe versão antiga para trocar
let reloading = false;
let gateIsOpen = false;
let openGate;
let regRef = null;
let pending = null;                     // versão nova pronta, esperando um bom momento
let hiddenAt = 0;

// resolve quando já é seguro mostrar o app (sem versão nova pendente)
export const updateGate = new Promise((r) => { openGate = r; });
const open = () => { gateIsOpen = true; openGate(); };

// trava contra laço de recarregamento (no máximo 2 em 20 s por aba)
function reloadAllowed() {
  try {
    const now = Date.now();
    const list = JSON.parse(sessionStorage.getItem(LOOP_KEY) || "[]").filter((t) => now - t < 20000);
    if (list.length >= 2) return false;
    list.push(now);
    sessionStorage.setItem(LOOP_KEY, JSON.stringify(list));
  } catch { /* sem sessionStorage: segue */ }
  return true;
}
function reloadNow() {
  if (reloading) return;
  if (!reloadAllowed()) { open(); return; }
  reloading = true;
  location.reload();
}

const waitInstalled = (w) => new Promise((resolve) => {
  if (!w) return resolve(null);
  if (w.state === "installed") return resolve(w);
  w.addEventListener("statechange", () => {
    if (w.state === "installed") resolve(w);
    else if (w.state === "redundant" || w.state === "activated") resolve(null);
  });
});

// pergunta ao servidor se há versão nova; devolve o worker pronto (instalado) ou null
async function findUpdate(reg) {
  if (reg.waiting) return reg.waiting;
  if (navigator.onLine === false) return null;
  try { await reg.update(); } catch { return null; }
  return reg.waiting || (await waitInstalled(reg.installing));
}

// pede ao worker novo que assuma; o "controllerchange" abaixo recarrega a página
function activate(w) {
  pending = null;
  try { w.postMessage({ type: "skip-waiting" }); } catch { return; }
  setTimeout(() => { if (!reloading) open(); }, FAILSAFE_MS);
}

const isEditing = () => {
  const a = document.activeElement;
  return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
};

async function boot() {
  if (!sw) return open();
  let reg;
  try { reg = await sw.register("./sw.js", { updateViaCache: "none" }); } catch { return open(); }
  regRef = reg;
  if (!hadController && !sw.controller) return open();   // primeira instalação

  const cap = setTimeout(() => { if (!reloading) open(); }, GATE_CAP_MS);
  const w = await findUpdate(reg).catch(() => null);
  clearTimeout(cap);
  if (!w) { open(); return; }
  if (!gateIsOpen) activate(w);   // ainda na splash: troca já, a tela só aparece na versão nova
  else pending = w;               // splash já saiu (rede lenta): troca quando for seguro
}

export function initUpdates() {
  if (!sw) return;
  // quando um worker novo assume, a página aberta é da versão antiga: recarrega para ficar tudo igual
  sw.addEventListener("controllerchange", () => {
    if (!hadController) { hadController = true; return; }   // primeira instalação assumindo: nada a trocar
    reloadNow();
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      if (pending) activate(pending);     // app fora de vista: troca sem ninguém ver
      return;
    }
    if (!regRef || !hiddenAt || Date.now() - hiddenAt < RESUME_MIN_MS) return;
    hiddenAt = 0;
    const t0 = Date.now();
    const w = await findUpdate(regRef).catch(() => null);
    if (!w) return;
    // voltou de segundo plano e há versão nova: troca já, a menos que a pessoa esteja digitando ou a rede demorou
    if (isEditing() || Date.now() - t0 > 4000) pending = w; else activate(w);
  });

  // com internet, completa o que faltar no cache (ex.: arquivos do SDK) sem atrasar a abertura
  window.addEventListener("load", () => {
    setTimeout(() => {
      if (navigator.onLine !== false) sw.ready.then((r) => r.active?.postMessage({ type: "precache" })).catch(() => {});
    }, 3000);
  });
}

boot();
