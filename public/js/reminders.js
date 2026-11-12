/* Lembrete gentil de estudo (2.25) — custo zero: nada vai para o servidor.
   Como funciona: enquanto o app está aberto (na tela ou em segundo plano), uma checagem leve a cada
   30 s vê se chegou um dos horários que a pessoa escolheu. Aberto na tela → um aviso suave dentro do app
   (não exige permissão nenhuma). Em segundo plano e com a permissão já concedida → notificação do sistema.
   LIMITE HONESTO: sem um servidor de push, o navegador não acorda um app totalmente fechado; se o
   aparelho encerrou o app, o lembrete não chega (a Ajustes diz isso). Detalhes e o caminho com servidor:
   leia-me.md → "Notificações sem servidor".
   Tom: convite, nunca cobrança. No máximo 1 aviso por horário/dia, nada depois de 20 min do horário, nada se
   o cronômetro está rodando, se a pessoa já estudou hoje, ou se os avisos estão silenciados (js/quiet.js).
   Preferências só neste aparelho (a permissão de notificação também é por aparelho). */
import { store } from "./store.js";
import { REMINDERS_LS_KEY } from "./constants.js";
import { toast, dateKey } from "./utils.js";
import { isQuiet, quietLabel, quietForToday, quietForDays, quietOff } from "./quiet.js";
import { running } from "./timer.js";
import { pushConfigured, pushSupported, pushOn, pushActive, enablePush, disablePush, syncPushSoon, initPush } from "./pushsub.js";

const MAX_TIMES = 3, GRACE_MIN = 20, CHECK_MS = 30000;
export const DEFAULTS = { on: false, times: ["19:00"], days: [0, 1, 2, 3, 4, 5, 6], fired: {} };
const DAY_LABEL = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// frases acolhedoras (sem culpa, sem prazo, sem urgência) — uma por dia, em rodízio
const MESSAGES = [
  "Quando se sentir pronto, seu espaço de foco está disponível.",
  "Seu espaço de estudo está aberto, sem pressa. Um ciclo curto já conta.",
  "Que tal um ciclo leve agora? Só se fizer sentido para você.",
  "Se hoje for um bom momento, o cronômetro espera por você."
];

const $ = (id) => document.getElementById(id);
const validTime = (t) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export function getReminders() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(REMINDERS_LS_KEY) || "null"); } catch {}
  const r = { ...DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  r.on = r.on === true;
  r.times = (Array.isArray(r.times) ? r.times : DEFAULTS.times).filter(validTime).slice(0, MAX_TIMES);
  if (!r.times.length) r.times = [...DEFAULTS.times];
  r.days = (Array.isArray(r.days) ? r.days : DEFAULTS.days).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  r.fired = r.fired && typeof r.fired === "object" ? r.fired : {};
  return r;
}
function save(r) {
  // guarda só os registros dos últimos dias (a lista não cresce para sempre)
  const keep = Object.keys(r.fired).sort().slice(-12);
  r.fired = Object.fromEntries(keep.map((k) => [k, 1]));
  try { localStorage.setItem(REMINDERS_LS_KEY, JSON.stringify(r)); } catch {}
  syncPushSoon();   // 2.26: se o lembrete com o app fechado está ligado, o servidor recebe a mudança
}

const localKey = (d) => d.toLocaleDateString("sv-SE"); // AAAA-MM-DD no relógio do aparelho

function studiedToday() {
  const day = store.profile?.daily?.[dateKey()];
  const total = typeof day === "number" ? day : day?.total;
  return (total || 0) > 0;
}
const canSystemNotify = () => "Notification" in window && Notification.permission === "granted";

function deliver(msg) {
  // 2.26: com o lembrete "app fechado" ligado, o servidor já avisa em segundo plano — não duplica aqui
  if (document.hidden && pushActive()) return;
  if (document.hidden && canSystemNotify()) {
    navigator.serviceWorker?.ready.then((reg) => reg.showNotification("Juntos", {
      body: msg, tag: "juntos-reminder", icon: "icons/icon-192.png", badge: "icons/badge-96.png",
      data: { kind: "reminder" }          // sem vibração insistente, sem "requireInteraction"
    })).catch(() => {});
    return;
  }
  if (!document.hidden) toast(msg);
}

export function checkReminders(now = new Date()) {
  if (!store.me) return;
  const r = getReminders();
  if (!r.on || isQuiet() || running) return;
  if (!r.days.includes(now.getDay())) return;
  const cur = now.getHours() * 60 + now.getMinutes();
  const today = localKey(now);
  for (const t of r.times) {
    const [h, m] = t.split(":").map(Number);
    const late = cur - (h * 60 + m);
    const id = `${today} ${t}`;
    if (late < 0 || late > GRACE_MIN || r.fired[id]) continue;
    r.fired[id] = 1; save(r);                       // marca antes: nunca avisa duas vezes
    if (studiedToday()) return;                     // já estudou hoje: sem cobrança
    deliver(MESSAGES[Number(today.slice(-2)) % MESSAGES.length]);
    return;                                         // no máximo um aviso por checagem
  }
}

/* ---------- painel em Ajustes → Som e notificações ---------- */
function paint() {
  const box = $("remBox"); if (!box) return;
  const r = getReminders();
  $("remToggle").checked = r.on;
  $("remDetails").classList.toggle("hide", !r.on);
  $("remTimes").innerHTML = r.times.map((t, i) =>
    `<span class="remTime"><input type="time" class="f" value="${t}" data-i="${i}" aria-label="Horário do lembrete ${i + 1}">` +
    (r.times.length > 1 ? `<button type="button" class="ghost remDel" data-del="${i}" aria-label="Remover o horário ${t}">✕</button>` : "") + `</span>`).join("");
  $("remAdd").classList.toggle("hide", r.times.length >= MAX_TIMES);
  $("remDays").innerHTML = DAY_LABEL.map((l, d) =>
    `<button type="button" class="chip ${r.days.includes(d) ? "on" : ""}" data-day="${d}" aria-pressed="${r.days.includes(d)}">${l}</button>`).join("");
  const q = quietLabel();
  $("quietState").textContent = q || "Os avisos estão ativos.";
  $("quietOff").classList.toggle("hide", !q);
  // pedido de permissão só aparece aqui, depois de a pessoa entender o que é — nunca na abertura do app
  const needPerm = "Notification" in window && Notification.permission === "default";
  $("remPerm").classList.toggle("hide", !(r.on && needPerm));
  // lembrete com o app fechado: só aparece se o servidor foi configurado (firebase-config.js)
  const pb = $("pushBox");
  if (pb) {
    pb.classList.toggle("hide", !pushConfigured());
    const sup = pushSupported();
    $("pushToggle").disabled = !sup;
    $("pushToggle").checked = sup && pushOn() && Notification.permission === "granted";
    $("pushUnsupported").classList.toggle("hide", sup);
  }
}

export function initReminders() {
  initPush();
  document.addEventListener("juntos:quiet", paint);
  setInterval(() => checkReminders(), CHECK_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkReminders(); });

  const box = $("remBox"); if (!box) return;
  const edit = (fn) => { const r = getReminders(); fn(r); save(r); paint(); };
  $("remToggle").addEventListener("change", (e) => edit((r) => { r.on = e.target.checked; }));
  $("remTimes").addEventListener("change", (e) => {
    const i = Number(e.target.dataset.i); if (!validTime(e.target.value)) return;
    edit((r) => { r.times[i] = e.target.value; r.times = [...new Set(r.times)].sort(); });
  });
  $("remTimes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]"); if (b) edit((r) => { r.times.splice(Number(b.dataset.del), 1); });
  });
  $("remAdd").addEventListener("click", () => edit((r) => {
    const free = ["12:00", "15:00", "21:00", "08:00"].find((t) => !r.times.includes(t));
    if (free && r.times.length < MAX_TIMES) r.times = [...r.times, free].sort();
  }));
  $("remDays").addEventListener("click", (e) => {
    const b = e.target.closest("[data-day]"); if (!b) return;
    edit((r) => { const d = Number(b.dataset.day); r.days = r.days.includes(d) ? r.days.filter((x) => x !== d) : [...r.days, d]; });
  });
  $("remPerm").addEventListener("click", async () => {
    try {
      const res = await Notification.requestPermission();
      toast(res === "granted" ? "Combinado. Os lembretes também chegam como notificação." : "Tudo bem: os lembretes aparecem dentro do app.");
    } catch {}
    paint();
  });
  $("pushToggle")?.addEventListener("change", async (e) => {
    if (e.target.checked) {
      const res = await enablePush();
      toast(res.ok ? "Pronto. O lembrete chega mesmo com o app fechado." : res.reason === "denied" ? "Sem permissão de notificação, não dá para avisar com o app fechado. Tudo bem: o lembrete segue dentro do app." : "Não consegui ligar agora. Tente de novo mais tarde.");
    } else { await disablePush(); toast("Desligado. O cadastro deste aparelho foi apagado do servidor."); }
    paint();
  });
  $("quietToday").addEventListener("click", () => { quietForToday(); toast("Avisos silenciados até o fim de hoje."); });
  $("quiet7").addEventListener("click", () => { quietForDays(7); toast("Avisos silenciados por 7 dias."); });
  $("quietOff").addEventListener("click", () => { quietOff(); toast("Avisos ativos de novo."); });
  paint();
}
