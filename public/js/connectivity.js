/* Indicador de conectividade e confirmação de sincronização (2.13).
   Antes este arquivo existia mas NUNCA era carregado pelo app (faltava o import em main.js), então
   a pessoa nunca era avisada de que estava offline.
   O que faz agora:
   - Offline: mostra uma faixa no topo ("Você está offline… fica guardado neste aparelho") e avisa
     leitores de tela. O app continua funcionando: o Firestore guarda as gravações no IndexedDB
     do aparelho e as envia sozinho quando a internet volta.
   - Volta a conexão: "Sincronizando…" e, quando o Firestore confirma que TUDO foi enviado
     (waitForPendingWrites), "Tudo sincronizado". Se houve ciclos de estudo feitos offline, diz
     quantos (o diário fica em IndexedDB, em offlineStore.js, e sobrevive a fechar o app).
   Não lê nem grava dados de estudo por conta própria. */
import { toast } from "./utils.js";
import { announce } from "./a11y.js";
import { db, waitForPendingWrites } from "./firebase.js";
import { journalTake, journalPeek } from "./offlineStore.js";
import { fmtMin } from "./utils.js";

let banner = null;
let wasOffline = false;
let syncing = false;

function ensureBanner() {
  if (banner && document.body.contains(banner)) return banner;
  banner = document.getElementById("offlineBanner");
  if (banner) return banner;
  banner = document.createElement("div");
  banner.id = "offlineBanner";
  // não é uma região "viva": o aviso falado é feito por announce() uma única vez
  banner.setAttribute("role", "group");
  banner.setAttribute("aria-label", "Estado da conexão");
  banner.textContent = "📡 Você está offline — o que você fizer fica guardado neste aparelho e é enviado quando a internet voltar.";
  banner.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:120;padding:calc(8px + env(safe-area-inset-top)) 16px 8px;" +
    "background:#E0A62B;color:#11141C;font-size:13px;text-align:center;font-weight:600;" +
    "transform:translateY(-110%);transition:transform .25s ease;box-sizing:border-box;visibility:hidden";
  document.body.appendChild(banner);
  return banner;
}

function showBanner(show) {
  const el = ensureBanner();
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce) el.style.transition = "none";
  if (show) { el.style.visibility = "visible"; el.style.transform = "translateY(0)"; }
  else {
    el.style.transform = "translateY(-110%)";
    setTimeout(() => { if (navigator.onLine) el.style.visibility = "hidden"; }, reduce ? 0 : 300);
  }
}

async function confirmSync() {
  if (syncing) return;
  syncing = true;
  try {
    // resolve quando o servidor confirmou todas as gravações que estavam na fila (inclusive as de
    // antes de fechar o app). Limite de 60 s: se a rede estiver ruim, tenta de novo na próxima volta.
    await Promise.race([waitForPendingWrites(db), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 60000))]);
    const done = await journalTake();
    if (done.length) {
      const min = done.reduce((a, e) => a + (Number(e.minutes) || 0), 0);
      toast(`Tudo sincronizado. ${done.length} ${done.length === 1 ? "ciclo feito" : "ciclos feitos"} offline (${fmtMin(min)}) já ${done.length === 1 ? "está" : "estão"} na sua conta.`);
    } else {
      toast("Tudo sincronizado.");
    }
  } catch { /* sem confirmação ainda: a fila continua guardada e tenta de novo sozinha */ }
  finally { syncing = false; }
}

function setOnline(isOnline, { initial = false } = {}) {
  if (!isOnline) {
    wasOffline = true;
    showBanner(true);
    if (!initial) announce("Você está offline. O que você fizer fica guardado neste aparelho e é enviado quando a internet voltar.");
    else announce("Você está offline. O app continua funcionando.");
    return;
  }
  showBanner(false);
  if (wasOffline || initial) {
    if (wasOffline) toast("Conexão restabelecida. Sincronizando…");
    wasOffline = false;
    confirmSync();
  }
}

export function initConnectivity() {
  ensureBanner();
  window.addEventListener("online", () => setOnline(true));
  window.addEventListener("offline", () => setOnline(false));
  if (!navigator.onLine) setOnline(false, { initial: true });
  else journalPeek().then((l) => { if (l.length) confirmSync(); }); // sobrou algo de um uso offline anterior
}
