import { auth, provider, db, doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, deleteField,
  signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
  terminate, clearIndexedDbPersistence, rawUpdateDoc, PRIVATE_FIELDS, PRIVATE_DOCS, privateRef
} from "./firebase.js";
import { store, emit } from "./store.js";
import { $, toast } from "./utils.js";
import { wipeStore } from "./offlineStore.js";
import { updateGate } from "./updates.js";
import { AVATAR_COLORS, DEFAULT_CFG, DEFAULT_QUICK, PROFILE_CACHE_KEY, TIMER_LS_KEY, WALL_LS_KEY, QUOTES_FAV_LS_KEY, REMINDERS_LS_KEY, QUIET_LS_KEY, PUSH_LS_KEY } from "./constants.js";
import { disablePush } from "./pushsub.js";

// Espera uma promessa, mas desiste depois de `ms` (gravações do Firestore só "terminam" quando o servidor
// responde: sem internet ficariam pendentes para sempre e travariam a abertura do app).
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

// texto simples para quem usa (nunca o código técnico do erro)
function loginErrorText(err) {
  const code = err?.code || "";
  if (code === "auth/network-request-failed" || navigator.onLine === false)
    return "Sem internet agora. Para entrar pela primeira vez no aparelho é preciso estar conectado; depois disso o app abre sem internet.";
  if (code === "auth/unauthorized-domain")
    return "Este endereço do site ainda não foi autorizado no login. Quem cuida do app precisa liberá-lo no Firebase.";
  if (code === "auth/too-many-requests") return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if (code === "auth/user-disabled") return "Esta conta foi desativada.";
  return "Não foi possível entrar agora. Tente de novo em instantes.";
}

/* 2.20.1 — a splash fica na tela até a checagem de versão terminar (no máximo ~1,5 s, geralmente bem menos).
   Se existir versão nova, o app se atualiza ANTES de aparecer: ninguém vê a versão antiga. */
let gateOpen = false, pendingScreen = null;
updateGate.then(() => { gateOpen = true; if (pendingScreen) { const w = pendingScreen; pendingScreen = null; showScreen(w); } });

function showScreen(which) {
  if (!gateOpen && which !== "splash") { pendingScreen = which; return; }
  $("splash").classList.toggle("hide", which !== "splash");
  $("login").classList.toggle("hide", which !== "login");
  ["appHeader", "tabs", "app"].forEach((i) => $(i).classList.toggle("hide", which !== "app"));
}

/* cache local do perfil: deixa a primeira tela já nascer com os dados certos
   (nome, foto, cor, matérias…) em vez de esperar a resposta do Firestore
   toda vez que o app abre — só o necessário troca quando a resposta chega. */
function readProfileCache(uid) {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || "null");
    return raw && raw.uid === uid ? raw.profile : null;
  } catch { return null; }
}
function writeProfileCache(uid, profile) {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ uid, profile, ts: Date.now() })); } catch {}
}

/* Sair da conta de verdade: além de encerrar a sessão, apaga tudo o que ficou guardado neste
   aparelho (cópia do perfil, papel de parede, cronômetro e o cache offline do Firestore, que
   guarda perfis e mensagens da sala). Em aparelho compartilhado, a próxima pessoa não herda nada. */
export async function wipeLocalData() {
  // 2.26: apaga o cadastro deste aparelho no servidor de lembretes (se estava ligado); no máximo 1,5 s, offline não trava a saída
  try { await Promise.race([disablePush(), new Promise((r) => setTimeout(r, 1500))]); } catch {}
  emit("auth:wipe");   // o cronômetro para de se regravar (senão o ciclo reapareceria na próxima pessoa)
  [TIMER_LS_KEY, PROFILE_CACHE_KEY, WALL_LS_KEY, WALL_LS_KEY + ".lum", WALL_LS_KEY + ".shade", "juntos.lastMsgTs", QUOTES_FAV_LS_KEY, REMINDERS_LS_KEY, QUIET_LS_KEY, PUSH_LS_KEY]
    .forEach((k) => { try { localStorage.removeItem(k); } catch {} });
  try { await terminate(db); await clearIndexedDbPersistence(db); } catch {}
  try { await wipeStore(); } catch {}
}
export async function signOutAndWipe() {
  try { await signOut(auth); } catch {}
  await wipeLocalData();
  location.reload();
}

/* Garante os subdocumentos privados (veja firebase.js) e, na primeira vez após a atualização,
   move para lá os campos privados que ainda estavam dentro do perfil — que é legível por toda
   a sala. Só apaga do perfil depois de confirmar que a cópia foi gravada. */
async function ensurePrivateDocs(uid, mainData) {
  const legacy = { mind: {}, planner: {} };
  for (const [k, group] of Object.entries(PRIVATE_FIELDS)) {
    if (mainData && mainData[k] !== undefined) legacy[group][k] = mainData[k];
  }
  const moved = [];
  for (const name of PRIVATE_DOCS) {
    try {
      const pref = privateRef(uid, name);
      const snap = await getDoc(pref);
      if (!snap.exists()) await withTimeout(setDoc(pref, legacy[name]), 15000);
      else if (Object.keys(legacy[name]).length) {
        // já existia (outro aparelho migrou antes): só completa o que faltar
        const have = snap.data();
        const missing = Object.fromEntries(Object.entries(legacy[name]).filter(([k]) => have[k] === undefined));
        if (Object.keys(missing).length) await withTimeout(setDoc(pref, missing, { merge: true }), 15000);
      }
      moved.push(...Object.keys(legacy[name]));
    } catch { /* regras antigas: mantém tudo no perfil, como antes */ }
  }
  if (moved.length) {
    try { await withTimeout(rawUpdateDoc(doc(db, "users", uid), Object.fromEntries(moved.map((k) => [k, deleteField()]))), 15000); } catch {}
  }
}

export function initAuth({ onProfileUpdate }) {
  $("googleBtn").addEventListener("click", async () => {
    $("loginNote").textContent = "";
    if (navigator.onLine === false) { $("loginNote").textContent = loginErrorText(); return; }
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(err.code)) {
        try { await signInWithRedirect(auth, provider); } catch (e2) { $("loginNote").textContent = loginErrorText(e2); }
      } else if (err.code !== "auth/popup-closed-by-user") {
        $("loginNote").textContent = loginErrorText(err);   // textContent: nunca interpreta HTML
      }
    }
  });
  getRedirectResult(auth).catch(() => {});
  $("signOut").addEventListener("click", () => signOutAndWipe());

  let unsubProfile = null;

  onAuthStateChanged(auth, async (user) => {
    if (unsubProfile) { unsubProfile(); unsubProfile = null; }
    emit("auth:changed", { user });

    if (!user) { store.me = null; store.profile = null; showScreen("login"); return; }
    store.me = user;

    // 1) se tiver cache deste usuário, mostra o app JÁ com esses dados —
    //    evita a tela de carregamento na maioria das aberturas do app.
    const cached = readProfileCache(user.uid);
    if (cached) {
      store.profile = cached;
      store.cfg = { ...DEFAULT_CFG, ...(cached.cfg || {}) };
      store.subjects = cached.subjects || [];
      store.quickMsgs = cached.quickMsgs || DEFAULT_QUICK;
      showScreen("app");
      onProfileUpdate(cached, true);
    }

    const ref = doc(db, "users", user.uid);
    // Sem internet (e sem cópia do perfil neste aparelho) o getDoc FALHA — antes isso derrubava toda a
    // abertura do app e ficava só a tela de carregamento. Agora a falha é esperada: seguimos para os
    // ouvintes abaixo, que leem do cache local do Firestore e atualizam quando a internet voltar.
    let snap = null;
    try { snap = await getDoc(ref); } catch { /* offline: segue com o que houver no aparelho */ }
    if (snap && !snap.exists() && !snap.metadata.fromCache) {
      // primeira vez desta conta: cria o perfil (sem await — o ouvinte recebe a gravação local na hora)
      setDoc(ref, {
        name: String(user.displayName || "Estudante").slice(0, 80),
        photo: (typeof user.photoURL === "string" && user.photoURL.startsWith("https://")) ? user.photoURL : null,
        color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        roomCode: null, roomCodes: [], daily: {}, cfg: DEFAULT_CFG, subjects: [], quickMsgs: DEFAULT_QUICK,
        soundOn: true, notifOn: false, msgNotifOn: true, studyNotifOn: true, theme: "dark",
        diarySharedWith: [], periodTotals: {}, removedSubjects: {},
        tadaSharedWith: [], gratSharedWith: [],
        lastActive: serverTimestamp(), createdAt: serverTimestamp()
      }).then(() => ensurePrivateDocs(user.uid, {})).catch(() => {});   // cria também os subdocumentos privados vazios
    }

    if (!cached) showScreen("app");
    $("accountLine").textContent = user.email || "";

    let firstLiveSnapshot = true;
    let migratedRoomCodes = false;
    // o perfil que o resto do app enxerga é a soma do documento público (users/{uid}) com os
    // dois privados (users/{uid}/private/*) — assim nenhum outro módulo precisou mudar.
    let mainData = null, priv = { mind: undefined, planner: undefined };
    const publish = () => {
      if (!mainData || priv.mind === undefined || priv.planner === undefined) return; // espera as 3 partes
      const p = { ...mainData, ...priv.mind, ...priv.planner };
      store.profile = p;
      store.cfg = { ...DEFAULT_CFG, ...(p.cfg || {}) };
      store.subjects = p.subjects || [];
      store.quickMsgs = p.quickMsgs || DEFAULT_QUICK;
      writeProfileCache(user.uid, p);
      onProfileUpdate(p, false, firstLiveSnapshot);
      firstLiveSnapshot = false;

      // migração de contas antigas (só tinham "roomCode" único) pra "roomCodes" (lista de
      // salas de que a pessoa faz parte) — necessário pra poder entrar em mais de uma sala
      // sem sair das outras. Roda uma vez só, na primeira vez que aparece sem "roomCodes".
      if (!migratedRoomCodes && p.roomCode && !Array.isArray(p.roomCodes)) {
        migratedRoomCodes = true;
        updateDoc(ref, { roomCodes: [p.roomCode] }).catch(() => {});
      }
    };
    const unsubs = [
      onSnapshot(ref, (d) => { if (!d.exists()) return; mainData = d.data(); publish(); }),
      ...PRIVATE_DOCS.map((name) => onSnapshot(privateRef(user.uid, name),
        (d) => { priv[name] = d.exists() ? d.data() : {}; publish(); },
        () => { priv[name] = {}; publish(); }))   // sem acesso (regras antigas): usa o que está no perfil
    ];
    unsubProfile = () => unsubs.forEach((u) => u());

    // Rede de segurança: offline e sem cópia de um subdocumento privado, o ouvinte pode demorar a
    // responder. Depois de 5 s tratamos como "vazio" para o app não ficar esperando.
    setTimeout(() => {
      let changed = false;
      for (const n of PRIVATE_DOCS) if (priv[n] === undefined) { priv[n] = {}; changed = true; }
      if (changed) publish();
    }, 5000);

    // Migração de campos privados antigos: em segundo plano (não atrasa a abertura) e só com internet.
    if (snap && !snap.metadata.fromCache && navigator.onLine !== false) {
      ensurePrivateDocs(user.uid, snap.data()).catch(() => {});
    }

    emit("auth:ready", { user });
  });
}
