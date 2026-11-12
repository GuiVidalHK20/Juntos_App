/* ============================================================
   Cronômetro — baseado no relógio, persistido, à prova de fechar o app.
   Nada aqui depende do app estar aberto: guardamos o INSTANTE em que a
   fase começou. Ao voltar (tela ligada, app reaberto, celular reiniciado),
   recalculamos tudo a partir do relógio; se ciclos inteiros passaram nesse
   meio tempo, eles são contabilizados retroativamente.
============================================================ */
import { db, doc, updateDoc, serverTimestamp, increment } from "./firebase.js";
import { store, emit, on } from "./store.js";
import { $, fmtClock, fmtMin, dateKey, subjectById, toast, brNow, splitAtMidnight } from "./utils.js";
import { TIMER_LS_KEY } from "./constants.js";
import { renderSubjectChips } from "./subjects.js";
import { recordCompletedWork, invalidateHistory } from "./studylog.js";
import { reviewPatch } from "./spaced.js";
import { announce } from "./a11y.js";
import { getUx } from "./ux.js";
import { syncBreathing, initBreathing } from "./breathe.js";
import { setText, setAttr } from "./dom.js";

export let mode = "pomodoro";
export let phase = "idle";      // idle | work | break | longBreak
export let running = false;
let cycles = 0;
let phaseStartedAt = 0;
let accumulated = 0;
let freeBanked = 0;
let tickHandle = null;
let syncCfg = null;             // durações da sessão coletiva (sala), se estiver numa
// 2.20.1 — o estado salvo é lido NA HORA em que o app abre (hydrateTimer), sem esperar login/Firestore.
// Antes, a leitura só acontecia depois da resposta do servidor; nesse intervalo a tela mostrava "parado" e o
// `beforeunload` gravava esse "parado" por cima do ciclo em andamento — era assim que o progresso se perdia.
let hydrated = false;           // estado do aparelho já lido
let resumed = false;            // já sabemos quem é a pessoa: agora pode concluir fases e gravar minutos
let timerUid = null;            // de quem é o ciclo salvo (nunca credita minutos à conta errada)
let wiped = false;              // "Sair" apagou tudo: nada pode ser regravado
const canFinish = () => !!store.me && resumed;
const RING_LEN = 2 * Math.PI * 45;

const elapsedSec = () => accumulated + (running ? (Date.now() - phaseStartedAt) / 1000 : 0);
function targetSec() {
  if (mode === "livre") return null;
  const c = syncCfg || store.cfg;
  if (phase === "work" || phase === "idle") return c.workMin * 60;
  if (phase === "break") return c.breakMin * 60;
  return c.longBreakMin * 60;
}
export function inSyncedSession() { return !!syncCfg; }

/* usado pela Sessão Coletiva da sala: adota o ciclo que o dono da sala
   iniciou, sem depender da configuração pessoal (que continua intacta). */
export function joinSyncedSession({ cfg, phase: p, phaseStartedAt: startedAt, cycles: c }) {
  ensureAudioCtx();
  mode = "pomodoro"; syncCfg = { ...cfg };
  phase = p; cycles = c || 0; accumulated = 0; phaseStartedAt = startedAt; running = true;
  clearInterval(tickHandle); tickHandle = setInterval(tick, 250);
  renderSubjectChips(true);
  saveTimerState(); publishStatus(); pushTimerToSW(); acquireWakeLock();
  paintClock();
  toast("Você entrou na sessão coletiva da sala.");
}
export function leaveSyncedSession() { if (syncCfg) stopAndSave(); }
export function timerSnapshot() { return { mode, phase, running, elapsed: elapsedSec(), target: targetSec(), cycles }; }

/* ---------- som + vibração ---------- */
let audioCtx = null;
function ensureAudioCtx() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
}
// toca uma nota "tipo sino": fundamental + harmônicos levemente desafinados
// (soa mais como um sino de verdade do que um bipe puro de seno)
function playTone(freqs, { dur = 160, gap = 60, gain = 0.09, repeats = 1 } = {}) {
  if (!audioCtx) return;
  const partials = [1, 2.01, 3.03];
  const seqLen = freqs.length * (dur + gap) / 1000;
  for (let r = 0; r < repeats; r++) {
    freqs.forEach((f, i) => {
      const t0 = audioCtx.currentTime + r * (seqLen + 0.35) + i * (dur + gap) / 1000;
      partials.forEach((mult, pi) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine"; o.frequency.value = f * mult;
        o.connect(g); g.connect(audioCtx.destination);
        const pg = gain / (pi + 1.6);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(pg, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur / 1000);
        o.start(t0); o.stop(t0 + dur / 1000 + 0.05);
      });
    });
  }
}
// alarme de fim de pausa: beeps curtos, secos (onda quadrada) e insistentes —
// bem diferente do sino do fim do foco, pra chamar atenção de volta ao estudo
function playAlarm({ beeps = 3, freq = 880, dur = 140, gap = 90, gain = 0.28, repeats = 2 } = {}) {
  if (!audioCtx) return;
  const seqLen = (beeps * (dur + gap)) / 1000;
  for (let r = 0; r < repeats; r++) {
    for (let i = 0; i < beeps; i++) {
      const t0 = audioCtx.currentTime + r * (seqLen + 0.28) + (i * (dur + gap)) / 1000;
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "square"; o.frequency.value = freq;
      o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur / 1000);
      o.start(t0); o.stop(t0 + dur / 1000 + 0.03);
    }
  }
}
// 2.17 — tom suave de conclusão: três notas de um acorde (G4, C5, E5) entrando devagar, com cauda longa
// e sem harmônicos agudos. Substitui o sino e o alarme quando "Conclusão suave" está ligada (padrão).
function softChime() {
  if (!audioCtx) return;
  [392.0, 523.25, 659.25].forEach((f, i) => {
    const t0 = audioCtx.currentTime + i * 0.22;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = "sine"; o.frequency.value = f;
    o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.07, t0 + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
    o.start(t0); o.stop(t0 + 2.7);
  });
}
function celebrate(kind) {
  emit("fx:celebrate", kind); // luz/confete (js/fx.js) — visual, independe de o som estar ligado
  if (store.profile?.soundOn === false) return;
  if (getUx().soft) softChime();
  // sem a opção suave: fim do foco = acorde maior alto; fim da pausa = alarme de beeps
  else if (kind === "work") playTone([523.25, 659.25, 783.99, 1046.5], { dur: 950, gap: 70, gain: 0.3, repeats: 2 });
  else playAlarm();
  if (navigator.vibrate) navigator.vibrate(getUx().soft ? [120] : kind === "work" ? [180, 80, 180] : [150, 90, 150, 90, 150]);
}

/* ---------- notificações em segundo plano ---------- */
function notifGranted() { return "Notification" in window && Notification.permission === "granted"; }
export function notifEnabled() { return !!store.profile?.notifOn && notifGranted(); }
export async function requestNotifPermission() {
  if (!("Notification" in window)) { toast("Este navegador não tem suporte a notificações."); return false; }
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}
async function swPost(msg) {
  try { const reg = await navigator.serviceWorker.ready; reg.active?.postMessage(msg); } catch {}
}
function pushTimerToSW() {
  if (!notifEnabled() || !running) return;
  const onBreak = phase === "break" || phase === "longBreak";
  const t = targetSec();
  swPost({
    type: "start",
    deadline: mode === "pomodoro" ? Date.now() + (t - elapsedSec()) * 1000 : null,
    startedAt: Date.now() - elapsedSec() * 1000,
    countUp: mode === "livre", phase,
    label: onBreak ? (phase === "longBreak" ? "Pausa longa" : "Pausa curta") : "Estudando",
    subject: subjectById(store.currentSubjectId).name,
    finishTitle: onBreak ? "Pausa concluída" : "Sessão de foco concluída",
    finishBody: onBreak ? "Quando se sentir pronto, seu espaço de foco está disponível." : "Você merece uma pausa. Respire um pouco."
  });
}

/* ---------- Wake Lock: impede a tela de apagar sozinha ---------- */
let wakeLock = null;
async function acquireWakeLock() {
  try {
    if ("wakeLock" in navigator && document.visibilityState === "visible" && running) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener?.("release", () => { wakeLock = null; });
    }
  } catch {}
}
function releaseWakeLock() { try { wakeLock && wakeLock.release(); } catch {} wakeLock = null; }

/* ---------- persistência local (sobrevive a fechar o app) ---------- */
function saveTimerState() {
  if (!hydrated || wiped) return;   // nunca grava antes de ler o que já estava salvo
  timerUid = store.me?.uid || timerUid;
  const st = { mode, phase, running, cycles, phaseStartedAt, accumulated, freeBanked, syncCfg, subject: store.currentSubjectId, uid: timerUid, savedAt: Date.now() };
  try { localStorage.setItem(TIMER_LS_KEY, JSON.stringify(st)); } catch {}
}
function clearTimerState() { try { localStorage.removeItem(TIMER_LS_KEY); } catch {} }
// ao sair do app/aba: regrava só se houver ciclo (o estado "parado" nunca é gravado por cima de nada)
function persistIfActive() { if (phase !== "idle") saveTimerState(); }

/* Lê o ciclo salvo e já o coloca na tela — síncrono, no instante em que o app abre. Não conclui fases
   nem grava minutos (isso exige saber quem é a pessoa): quem faz isso é restoreTimer(). */
function hydrateTimer() {
  hydrated = true;
  let st;
  try { st = JSON.parse(localStorage.getItem(TIMER_LS_KEY) || "null"); } catch { st = null; }
  if (!st || !st.phase || st.phase === "idle") return;
  mode = st.mode === "livre" ? "livre" : "pomodoro";
  phase = st.phase; cycles = st.cycles || 0;
  accumulated = Number(st.accumulated) || 0; freeBanked = Number(st.freeBanked) || 0;
  phaseStartedAt = Number(st.phaseStartedAt) || Date.now();
  running = !!st.running;
  syncCfg = st.syncCfg || null;
  timerUid = st.uid || null;
  store.currentSubjectId = st.subject || "geral";
  document.querySelectorAll(".modes button[data-mode]").forEach((x) => x.classList.toggle("on", x.dataset.mode === mode));
  if (running) { clearInterval(tickHandle); tickHandle = setInterval(tick, 250); }
}

// descarta o ciclo salvo sem registrar minutos (ex.: era de outra conta neste aparelho)
function dropTimer() {
  clearInterval(tickHandle); running = false; phase = "idle"; accumulated = 0; cycles = 0; freeBanked = 0; syncCfg = null; timerUid = null;
  clearTimerState(); swPost({ type: "stop" }); releaseWakeLock();
  renderSubjectChips(false); paintClock();
}

/* Chamado quando o app já sabe quem é a pessoa (perfil do aparelho ou do servidor, o que vier primeiro).
   Conclui o que terminou enquanto o app estava fechado e religa notificação/tela acesa. Roda uma vez só. */
export async function restoreTimer() {
  if (resumed) return;
  resumed = true;
  if (timerUid && store.me && timerUid !== store.me.uid) { dropTimer(); return; }
  timerUid = store.me?.uid || timerUid;
  if (phase === "idle") { paintClock(); return; }
  renderSubjectChips(true);
  if (running) {
    await catchUp();
    if (running) {
      pushTimerToSW(); acquireWakeLock();
      toast("Cronômetro retomado de onde parou.");
    } else {
      toast("Uma fase terminou enquanto o app estava fechado. Toque em continuar quando quiser seguir.", { silent: true });
      announce("Uma fase terminou enquanto o app estava fechado. Toque em continuar quando quiser seguir.", { urgent: true });
    }
  }
  paintClock();
}

// repinta o relógio quando o perfil (durações do ciclo) chega ou muda
export function refreshTimer() { paintClock(); }

/* conclui a fase se ela já tiver terminado enquanto o app esteve fora do ar.
   Como nenhuma fase mais começa sozinha (o usuário precisa tocar em "continuar"),
   nunca há mais de uma fase pra recuperar de uma vez: assim que a fase corrente
   termina, o cronômetro já para — então nunca sobra tempo "rodando" pra uma
   segunda fase ter passado do tempo dela também. */
async function catchUp() {
  if (mode !== "pomodoro" || !running || !canFinish()) return;
  if (elapsedSec() >= targetSec()) await finishPhase();
}

/* ---------- pintura ---------- */
function paintClock() {
  const t = targetSec(), e = elapsedSec();
  let displaySec;
  if (mode === "livre") displaySec = phase === "break" ? e : freeBanked + e;
  else displaySec = phase === "idle" ? t : Math.max(t - e, 0);
  setText($("clock"), fmtClock(displaySec));
  // 2.17 — ampulheta fluida: a água sobe conforme o tempo passa (só o nível; os números ficam ocultos pela CSS)
  const fillEl = document.getElementById("hgFill");
  if (fillEl) {
    let frac = 0;
    if (phase !== "idle") frac = mode === "livre" ? (e % 3600) / 3600 : (t ? Math.min(e / t, 1) : 0);
    fillEl.style.setProperty("--hg", Math.max(0, Math.min(1, frac)).toFixed(4));
  }

  const ring = $("progressRing");
  const onBreak = phase === "break" || phase === "longBreak";
  setAttr(ring, "stroke", onBreak ? "var(--i-room)" : "var(--i-timer)");
  // meio ponto de precisão basta (o anel tem ~283): evita redesenhar o SVG a cada 250 ms sem diferença visível
  setAttr(ring, "stroke-dashoffset",
    (mode === "livre" || phase === "idle") ? RING_LEN : Math.round(RING_LEN * (1 - Math.min(e / t, 1)) * 2) / 2);

  const subjName = subjectById(store.currentSubjectId).name;
  const labels = {
    idle: "Pronto para começar",
    work: mode === "livre" ? `Estudando${subjName !== "Geral" ? " · " + subjName : ""}` : `Foco · ${subjName}`,
    break: mode === "livre" ? "Pausa" : "Pausa curta",
    longBreak: "Pausa longa"
  };
  setText($("phaseLabel"), labels[phase] + (mode === "pomodoro" && phase !== "idle" ? ` · ciclo ${cycles + 1}` : ""));

  // 2.18 — tela de foco: "tarefa atual" e "próximo passo" (só aparecem com a tela de foco ligada)
  const taskEl = document.getElementById("focusTask"), nextEl = document.getElementById("focusNext");
  if (taskEl && nextEl) {
    const c = syncCfg || store.cfg;
    setText(taskEl, phase === "break" || phase === "longBreak" ? "☕ Pausa" : `📚 ${subjName}`);
    let next;
    if (mode === "livre") next = phase === "idle" ? "Próximo: estudar sem limite de tempo" : phase === "work" ? "Próximo: pausa quando você quiser" : "Próximo: voltar a estudar";
    else if (phase === "idle") next = `Próximo: foco de ${c.workMin} min`;
    else if (phase === "work") next = `Próximo: ${(cycles + 1) % c.cyclesBeforeLong === 0 ? `pausa longa de ${c.longBreakMin}` : `pausa de ${c.breakMin}`} min`;
    else next = `Próximo: voltar ao foco de ${c.workMin} min`;
    setText(nextEl, next);
  }

  $("startBtn").classList.toggle("hide", running || (mode === "livre" && phase === "break"));
  $("pauseBtn").classList.toggle("hide", !running || (mode === "livre" && phase === "break"));
  $("stopBtn").classList.toggle("hide", phase === "idle");
  $("skipBtn").classList.toggle("hide", !(mode === "pomodoro" && (phase === "break" || phase === "longBreak")));
  $("breakBtn").classList.toggle("hide", !(mode === "livre" && phase === "work"));
  $("resumeBtn").classList.toggle("hide", !(mode === "livre" && phase === "break"));
  setText($("startBtn"), phase === "idle" ? "▶ Iniciar" : "▶ Continuar");

  syncBreathing(phase);
  emit("timer:tick", timerSnapshot());
}
function tick() {
  paintClock();
  // sem a pessoa identificada ainda, espera (o relógio é de parede: nada se perde, só é contado um instante depois)
  if (mode === "pomodoro" && running && canFinish() && elapsedSec() >= targetSec()) finishPhase();
}

export function startTimer() {
  ensureAudioCtx();
  if (phase === "idle") { phase = "work"; accumulated = 0; freeBanked = 0; }
  phaseStartedAt = Date.now();
  running = true;
  clearInterval(tickHandle);
  tickHandle = setInterval(tick, 250);
  renderSubjectChips(true);
  saveTimerState(); publishStatus(); pushTimerToSW(); acquireWakeLock();
  paintClock();
  announce(phase === "work" ? "Cronômetro em andamento." : "Pausa em andamento.");
}
export function pauseTimer(opts) {
  if (!running) return;
  // opts.skipPublish: stopAndSave() publica o status final logo depois — evita 1 gravação repetida na sala
  // (os botões chamam pauseTimer(evento), por isso a checagem é por propriedade, não por "truthy")
  const skipPublish = opts?.skipPublish === true;
  accumulated = elapsedSec();
  running = false;
  clearInterval(tickHandle);
  swPost({ type: "stop" });
  releaseWakeLock(); saveTimerState(); if (!skipPublish) publishStatus();
  paintClock();
  announce("Cronômetro pausado.");
}
async function finishPhase() {
  const t = targetSec();
  running = false;
  clearInterval(tickHandle);
  if (phase === "work") {
    await logMinutes(t / 60, store.currentSubjectId);
    recordCompletedWork(t / 60, store.currentSubjectId); // não bloqueia: abre a nota em paralelo
    cycles++;
    phase = cycles % store.cfg.cyclesBeforeLong === 0 ? "longBreak" : "break";
    const nextMin = phase === "longBreak" ? store.cfg.longBreakMin : store.cfg.breakMin;
    toast("Foco concluído. Toque em continuar quando quiser começar a pausa.", { silent: true });
    // aviso para leitores de tela (VoiceOver, TalkBack, NVDA): o som e o confete não chegam a todo mundo
    announce(`Foco concluído: ${fmtMin(t / 60)} registrados. Quando quiser, toque em continuar para começar a pausa de ${nextMin} minutos.`, { urgent: true });
    celebrate("work");
  } else {
    phase = "work";
    toast("Pausa encerrada. Toque em continuar pra voltar ao foco.", { silent: true });
    announce("Pausa encerrada. Quando estiver pronta ou pronto, toque em continuar para voltar ao foco.", { urgent: true });
    celebrate("break");
  }
  accumulated = 0;
  // a fase seguinte fica pronta, mas parada — o usuário decide quando tocar em
  // "▶ Continuar"; nada aqui chama startTimer() automaticamente.
  swPost({ type: "stop" });
  releaseWakeLock();
  saveTimerState();
  publishStatus();
  paintClock();
}
export async function stopAndSave() {
  const e = elapsedSec(), wasWork = phase === "work";
  pauseTimer({ skipPublish: true });
  if (mode === "livre") {
    const min = (freeBanked + (wasWork ? e : 0)) / 60;
    if (min >= 0.2) { await logMinutes(min, store.currentSubjectId); recordCompletedWork(min, store.currentSubjectId); toast(`${fmtMin(min)} registrados.`); }
  } else if (wasWork) {
    const min = e / 60;
    if (min >= 0.2) { await logMinutes(min, store.currentSubjectId); recordCompletedWork(min, store.currentSubjectId); toast(`${fmtMin(min)} registrados.`); }
  }
  phase = "idle"; accumulated = 0; cycles = 0; running = false; freeBanked = 0; syncCfg = null;
  swPost({ type: "stop" }); releaseWakeLock(); clearTimerState(); publishStatus();
  renderSubjectChips(false);
  paintClock();
}
function skipBreak() { pauseTimer(); phase = "work"; accumulated = 0; startTimer(); }
function startBreakLivre() {
  if (mode !== "livre" || phase !== "work") return;
  const studied = elapsedSec();
  pauseTimer(); freeBanked += studied; phase = "break"; accumulated = 0; startTimer();
}
function resumeStudyLivre() {
  if (mode !== "livre" || phase !== "break") return;
  pauseTimer(); phase = "work"; accumulated = 0; startTimer();
}

/* status compartilhado com a sala: estudando agora? qual matéria? */
// 2.25.1 — sem sala ninguém lê este documento (regras do Firestore): não grava. `force` = acabou de entrar numa sala.
export function syncStatusToRoom() { publishStatus(true); }
function publishStatus(force = false) {
  if (!store.me || (!force && !store.profile?.roomCode)) return;
  const studying = running && phase === "work";
  const subj = subjectById(store.currentSubjectId);
  updateDoc(doc(db, "users", store.me.uid), {
    status: {
      studying,
      onBreak: running && (phase === "break" || phase === "longBreak"),
      subjectName: studying ? subj.name : null,
      subjectColor: studying ? subj.color : null,
      // estudar e "fazer uma tarefa" são estados ao vivo mutuamente exclusivos: ao
      // publicar que está estudando, garante que nenhuma tarefa fique marcada como ativa
      doingTask: false, taskName: null, taskColor: null,
      since: studying ? Date.now() : null,
      until: (studying && mode === "pomodoro") ? Date.now() + (targetSec() - elapsedSec()) * 1000 : null
    },
    lastActive: serverTimestamp()
  }).catch(() => {});
}
// 2.25: só renova o status a cada 60 s quando há sala — sem sala ninguém lê esse documento (ver main.js → beat)
setInterval(() => { if (store.me && running && store.profile?.roomCode) publishStatus(); }, 60000);

/* período do dia, pra alimentar o indicador de produtividade, gravado
   junto com o total diário (mesma escrita, sem custo extra de leitura) */
function periodIdOfNow() {
  const h = brNow().getHours();
  if (h < 6) return "madrugada"; if (h < 12) return "manha"; if (h < 18) return "tarde"; return "noite";
}
async function logMinutes(min, subjectId) {
  if (!store.me) return;
  const rounded = Math.round(min * 10) / 10;
  const key = dateKey(), sid = subjectId || "geral", period = periodIdOfNow();
  invalidateHistory();
  document.dispatchEvent(new CustomEvent("juntos:studied"));   // 2.26: o lembrete com o app fechado se cala pelo resto do dia (pushsub.js)
  // ciclo que atravessou a meia-noite: a parte de antes de 00:00 conta no dia anterior,
  // o resto no dia de hoje (antes, tudo caía no dia em que o ciclo terminava)
  const cut = splitAtMidnight(new Date(), rounded);
  const days = cut ? [[cut.prevKey, cut.prevMin], [cut.endKey, cut.endMin]] : [[key, rounded]];
  const dailyInc = {};
  days.forEach(([k, m]) => {
    dailyInc[`daily.${k}.total`] = increment(m);
    dailyInc[`daily.${k}.bySubject.${sid}`] = increment(m);
  });
  // SEM await de propósito (2.13): offline, o Firestore guarda a escrita no aparelho (IndexedDB) e a
  // promessa só se resolve quando o servidor confirma — ou seja, só quando a internet volta.
  // Esperar aqui deixava o cronômetro "travado" em 00:00 até reconectar. Como as escritas são
  // incrementos, a fila local soma tudo certo na volta; nada é perdido nem contado duas vezes.
  updateDoc(doc(db, "users", store.me.uid), {
    ...dailyInc,
    ...reviewPatch(sid),   // 2.26: revisão espaçada no mesmo documento (antes era uma 2ª gravação)
    [`periodTotals.${period}`]: increment(rounded),
    lastStudiedAt: serverTimestamp(), lastActive: serverTimestamp()
  }).catch(() => {});
}

/* ---------- modo leitura (tela quase apagada) ---------- */
function toggleReadMode(on) {
  document.body.classList.toggle("readMode", on ?? !document.body.classList.contains("readMode"));
  if (document.body.classList.contains("readMode")) syncReadOverlay();
}
function syncReadOverlay() {
  if (!document.body.classList.contains("readMode")) return;
  $("readClock").textContent = $("clock").textContent;
  requestAnimationFrame(() => setTimeout(syncReadOverlay, 1000));
}

/* ---------- inicialização e ligação com o HTML ---------- */
export function initTimer() {
  hydrateTimer();    // ciclo em andamento já aparece na primeira pintura, antes do login/Firestore
  initBreathing();
  // só os dois botões de modo do cronômetro (data-mode). Antes o seletor era ".modes button" e pegava
  // também os botões de tema/animações/paleta em Ajustes, que bagunçavam o modo do cronômetro.
  document.querySelectorAll(".modes button[data-mode]").forEach((b) => {
    b.addEventListener("click", () => {
      if (running || phase !== "idle") return;
      mode = b.dataset.mode; freeBanked = 0;
      document.querySelectorAll(".modes button[data-mode]").forEach((x) => x.classList.remove("on"));
      b.classList.add("on"); paintClock();
    });
  });
  $("startBtn").addEventListener("click", startTimer);
  $("pauseBtn").addEventListener("click", pauseTimer);
  $("stopBtn").addEventListener("click", stopAndSave);
  $("skipBtn").addEventListener("click", skipBreak);
  $("breakBtn").addEventListener("click", startBreakLivre);
  $("resumeBtn").addEventListener("click", resumeStudyLivre);

  $("toggleCfg").addEventListener("click", () => {
    const box = $("cfgBox"); box.classList.toggle("hide");
    $("toggleCfg").textContent = box.classList.contains("hide")
      ? "ajustar duração do foco e das pausas" : "ocultar ajustes do ciclo";
  });
  $("saveCfg").addEventListener("click", async () => {
    if (phase !== "idle") { toast("Para mudar as durações, pause e encerre o ciclo atual quando for um bom momento. Nada foi perdido."); return; }
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || lo));
    const next = {
      workMin: clamp($("cfgWork").value, 1, 600), breakMin: clamp($("cfgBreak").value, 1, 120),
      longBreakMin: clamp($("cfgLong").value, 1, 120), cyclesBeforeLong: clamp($("cfgCycles").value, 1, 12)
    };
    store.cfg = next; paintClock();               // otimista
    $("cfgBox").classList.add("hide");
    $("toggleCfg").textContent = "ajustar duração do foco e das pausas";
    toast("Ajustes salvos.");
    await updateDoc(doc(db, "users", store.me.uid), { cfg: next }).catch(() => {});
  });

  $("readModeBtn").addEventListener("click", () => toggleReadMode(true));
  $("readOverlay").addEventListener("click", () => toggleReadMode(false));

  $("miniPlayerBtn").addEventListener("click", async () => {
    const { openMiniPlayer } = await import("./pip.js");   // só baixa esse código quando é usado
    openMiniPlayer({ getSnapshot: timerSnapshot, onPause: pauseTimer, onStart: startTimer });
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
      releaseWakeLock();
      if (running) pushTimerToSW();
    } else {
      if (running) { await catchUp(); if (running) { acquireWakeLock(); pushTimerToSW(); } }
      tick();
    }
  });
  window.addEventListener("pageshow", async () => { if (running) { await catchUp(); tick(); } });
  // salvar ao sair: celulares nem sempre disparam "beforeunload"; pagehide/hidden cobrem puxar-para-atualizar e fechar o app
  window.addEventListener("pagehide", persistIfActive);
  document.addEventListener("visibilitychange", () => { if (document.hidden) persistIfActive(); });
  // "Sair da conta" apaga tudo: impede que o ciclo seja regravado na saída da página
  on("auth:wipe", () => { wiped = true; clearTimerState(); });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", async (e) => {
      if (e.data?.type === "phase-finished" && running) { await catchUp(); tick(); }
    });
  }

  on("subject:changed", () => paintClock());
  paintClock();
}

export function refreshNotifSetting() { if (running) pushTimerToSW(); }
