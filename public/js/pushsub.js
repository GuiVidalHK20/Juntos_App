/* Lembrete com o app FECHADO (2.26) — o lado do aparelho. Opt-in, desligado até haver servidor configurado.
   Como funciona: o navegador gera um "endereço de notificação" deste aparelho (Web Push). Mandamos esse
   endereço + os horários escolhidos ao Worker da Cloudflare (worker-push/), que a cada minuto avisa o
   aparelho na hora marcada; o service worker (sw.js, evento `push`) mostra a frase acolhedora.
   Privacidade: NÃO vai uid, nome, e-mail nem nada do Firestore; só endereço, horários, fuso e "silenciado até".
   Desligar, silenciar a conta ou sair da conta apaga o cadastro no servidor. Sem `pushWorkerUrl` e
   `pushPublicKey` em firebase-config.js, nada disto aparece nem roda. Passo a passo: worker-push/LEIA-ME.md.
   Módulo-folha de propósito (só lê localStorage): auth.js o importa para limpar ao sair da conta. */
import { firebaseConfig } from "../firebase-config.js";
import { PUSH_LS_KEY, REMINDERS_LS_KEY, QUIET_LS_KEY } from "./constants.js";

const SYNC_EVERY_MS = 24 * 3600 * 1000;   // reavisa o servidor 1x/dia no máximo (a linha "toca", 1 gravação)
const cfg = () => firebaseConfig || {};
const rd = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const wr = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const pushConfigured = () => !!(cfg().pushWorkerUrl && cfg().pushPublicKey);
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const pushOn = () => rd(PUSH_LS_KEY)?.on === true;
/** push ligado e com permissão: nesse caso o servidor cuida do aviso com o app fechado/em segundo plano */
export const pushActive = () => pushOn() && pushSupported() && Notification.permission === "granted";

const b64uToBytes = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const endOfLocalDay = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); };
const quietUntil = () => { const t = Number(localStorage.getItem(QUIET_LS_KEY)) || 0; return t > Date.now() ? t : 0; };

async function post(path, body) {
  try {
    const r = await fetch(cfg().pushWorkerUrl.replace(/\/+$/, "") + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
    return r.ok;
  } catch { return false; }
}
async function currentSub() {
  try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { return null; }
}

/* envia ao servidor o que ele precisa para avisar: horários/dias do lembrete, fuso e "silenciado até" */
export async function syncPush(force = false) {
  if (!pushConfigured() || !pushSupported() || !pushOn()) return;
  const sub = await currentSub();
  if (!sub) { wr(PUSH_LS_KEY, null); return; }          // a pessoa revogou nas configurações do navegador
  const r = rd(REMINDERS_LS_KEY);
  if (!r || r.on !== true) { await post("/unsub", { endpoint: sub.endpoint }); wr(PUSH_LS_KEY, { on: true, h: "", t: 0 }); return; }
  const times = (Array.isArray(r.times) ? r.times : []).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)).slice(0, 3);
  const days = Array.isArray(r.days) ? r.days : [0, 1, 2, 3, 4, 5, 6];
  const offset = -new Date().getTimezoneOffset();       // minutos a leste do UTC
  const h = JSON.stringify([times, days, offset]);
  const st = rd(PUSH_LS_KEY) || {};
  if (!force && st.h === h && Date.now() - (st.t || 0) < SYNC_EVERY_MS) return;
  if (await post("/sub", { endpoint: sub.endpoint, times, days, offset, skipUntil: quietUntil() })) wr(PUSH_LS_KEY, { on: true, h, t: Date.now() });
}
let timer = null;
export function syncPushSoon() { clearTimeout(timer); timer = setTimeout(() => syncPush(), 800); }  // várias mudanças seguidas = 1 envio

/** liga: pede a permissão (aqui, depois de a pessoa ler o aviso e tocar), cria o endereço e cadastra */
export async function enablePush() {
  if (!pushConfigured() || !pushSupported()) return { ok: false, reason: "unsupported" };
  const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (perm !== "granted") return { ok: false, reason: "denied" };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(cfg().pushPublicKey) });
    wr(PUSH_LS_KEY, { on: true, h: "", t: 0 });
    await syncPush(true);
    return { ok: !!sub };
  } catch { wr(PUSH_LS_KEY, null); return { ok: false, reason: "error" }; }
}
/** desliga: apaga o cadastro no servidor e o endereço no navegador */
export async function disablePush() {
  const was = pushOn();
  wr(PUSH_LS_KEY, null);
  if (!was || !pushConfigured() || !pushSupported()) return;
  const sub = await currentSub();
  if (!sub) return;
  await post("/unsub", { endpoint: sub.endpoint });
  try { await sub.unsubscribe(); } catch {}
}

/* silêncio e "já estudou hoje" viram "não enviar até…" no servidor (1 requisição, sem Firestore) */
async function skipTo(until) { if (!pushConfigured() || !pushSupported()) return; const sub = pushOn() && await currentSub(); if (sub) post("/skip", { endpoint: sub.endpoint, until }); }
export function initPush() {
  // ouve sempre; skipTo()/syncPush() só agem se o lembrete com o app fechado estiver ligado neste aparelho
  document.addEventListener("juntos:quiet", () => skipTo(quietUntil()));
  document.addEventListener("juntos:studied", () => { const r = rd(REMINDERS_LS_KEY); if (r?.on) skipTo(Math.max(endOfLocalDay(), quietUntil())); });
  syncPush();    // ao abrir: refaz o cadastro se mudou o fuso/horário de verão ou se passou 1 dia
}
