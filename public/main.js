import { store, on } from "./js/store.js";
import { initAuth } from "./js/auth.js";
import { initWallpaper, syncWallpaperUI, loadWallpaperFromCloud } from "./js/wallpaper.js";
import { renderSubjectChips, renderSettingsSubjects, renderQuickSettings, initSubjects } from "./js/subjects.js";
import { initDistractions, renderDistractions } from "./js/distractions.js";
import { initTada, renderTada, renderTadaSharing } from "./js/tada.js";
import { initTimer, restoreTimer, refreshTimer, phase, running as timerRunning, syncStatusToRoom } from "./js/timer.js";
import { initUpdates } from "./js/updates.js";
import { initDayRecap, renderDayRecap } from "./js/dayrecap.js";
import { initStats, renderStats } from "./js/stats.js";
import { initRoom, watchRoom, renderRoom } from "./js/room.js";
import { initMessages } from "./js/messages.js";
import { renderMe, syncToggles, initUI, renderDiarySharing } from "./js/ui.js";
import { initWhatsNew, maybeAutoShowWhatsNew } from "./js/whatsnew.js";
import { initPrivacy, checkConsent } from "./js/privacy.js";
import { db, doc, updateDoc, serverTimestamp } from "./js/firebase.js";
import { HEARTBEAT_MS } from "./js/constants.js";
import { initFx } from "./js/fx.js";
import { initA11y } from "./js/a11y.js";
import { initComfort } from "./js/comfort.js";
import { initUx } from "./js/ux.js";
import { initAmbient } from "./js/ambient.js";
import { initConnectivity } from "./js/connectivity.js";
import { initReminders } from "./js/reminders.js";

// service worker + atualização sem mostrar a versão antiga (js/updates.js). O registro começa assim que o
// módulo carrega; a splash só sai depois da checagem de versão (js/auth.js).
initUpdates();

// liga toda a interface (não depende dos dados do usuário)
initA11y();          // anúncios para leitores de tela, teclado e estados ARIA (js/a11y.js)
initReminders();     // lembrete gentil de estudo, só neste aparelho (js/reminders.js)
initConnectivity();  // faixa de "offline" e confirmação de sincronização (js/connectivity.js)
initFx();
initComfort();
initUx();              // visual, tela de foco, ampulheta (js/ux.js)
initAmbient();         // sons da natureza no canto (js/ambient.js)       // barra de conforto, paletas suaves e tamanho do texto (js/comfort.js)
initUI();
initWallpaper();
initSubjects();
initDistractions();
initTada();
initTimer();
initDayRecap();
initStats();
initRoom();
initMessages();
initWhatsNew();
initPrivacy();

// perfil de amigo: módulo usado só ocasionalmente (quando alguém toca num
// membro da sala), então carrega sob demanda — mesmo padrão de wrapped.js/pip.js
let friendMod = null;
on("openFriend", async (id) => {
  if (!friendMod) { friendMod = await import("./js/friend.js"); friendMod.initFriendProfile(); }
  friendMod.openFriendProfile(id);
});

let heartbeatInterval = null;
let lastRoomCode = undefined;
let enteredRoom = false;

initAuth({
  onProfileUpdate(profile, fromCache, isFirstLive) {
    if (!fromCache) checkConsent(profile); // aceite dos Termos/Política (primeiro acesso ou versão nova)
    renderMe();
    renderSubjectChips(phase !== "idle");
    syncWallpaperUI(profile);
    syncToggles();
    renderSettingsSubjects();
    renderQuickSettings();
    renderDistractions();
    renderDiarySharing();
    renderTadaSharing();
    renderDayRecap();
    if (!$view("stats").classList.contains("hide")) renderStats();
    if (!$view("tada").classList.contains("hide")) renderTada();
    if (!$view("room").classList.contains("hide")) renderRoom();

    if (lastRoomCode !== profile.roomCode) {
      lastRoomCode = profile.roomCode; watchRoom(profile.roomCode);
      enteredRoom = !!profile.roomCode;
    }

    // 2.20.1 — o cronômetro é retomado assim que o app sabe quem é a pessoa (perfil do aparelho ou do
    // servidor, o que vier primeiro) — antes esperava o servidor e a tela ficava "parada" nesse intervalo.
    // restoreTimer() roda uma vez só; refreshTimer() acerta o relógio parado com as durações do perfil.
    restoreTimer();
    refreshTimer();
    // entrou numa sala (ou abriu o app já numa): mostra "online" e o estado real do cronômetro na hora
    if (enteredRoom) { enteredRoom = false; beat(); syncStatusToRoom(); }

    // só roda uma vez por login (não a cada snapshot) — evita recarregar o papel de parede repetidamente
    if (!fromCache && isFirstLive) {
      loadWallpaperFromCloud();
      startHeartbeat();
      maybeAutoShowWhatsNew();
    }
  }
});

function $view(tab) { return document.getElementById("view-" + tab); }

/* Presença ("online agora") — 2.25: só grava quando alguém pode mesmo ver.
   O perfil só é legível por quem está na MESMA sala ativa (regras do Firestore); sem sala, o batimento
   antigo gastava ~3.400 gravações/dia por pessoa com o app aberto sem servir a ninguém. Agora:
   - sem sala → nenhuma gravação;
   - aba escondida → não grava, exceto com o cronômetro rodando (aí a sala precisa ver que a pessoa segue ativa);
   - cronômetro rodando → timer.js já grava `lastActive` junto do status a cada 60 s, então não duplica aqui;
   - ao voltar para a aba, grava na hora (a presença não "demora" a aparecer). */
function beat() {
  if (!store.me || !store.profile?.roomCode) return;
  if (timerRunning) return;               // publishStatus() (timer.js) já cobre
  if (document.hidden) return;
  updateDoc(doc(db, "users", store.me.uid), { lastActive: serverTimestamp() }).catch(() => {});
}
function startHeartbeat() {
  clearInterval(heartbeatInterval);
  beat();
  heartbeatInterval = setInterval(beat, HEARTBEAT_MS);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) beat(); });
