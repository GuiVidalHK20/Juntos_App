import { firebaseConfig } from "../firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, setPersistence, indexedDBLocalPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, enableMultiTabIndexedDbPersistence, enableIndexedDbPersistence, doc, setDoc, updateDoc as rawUpdateDoc, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const app = initializeApp(firebaseConfig);

/* Firebase App Check (2.25) — OPCIONAL: só liga se `appCheckSiteKey` estiver em firebase-config.js.
   Barra tráfego que não vem do seu app (scripts/bots que gastariam a cota gratuita). Sem a chave, nada muda.
   Se ligar, leia leia-me.md → "App Check" ANTES: tem custo/limite do reCAPTCHA, a CSP do _headers precisa de
   2 linhas a mais e só se deve "Impor" no console depois de acompanhar as métricas. Falhar aqui nunca
   derruba o app (offline, bloqueador de anúncios…): ele segue sem token e o Firestore decide. */
if (firebaseConfig.appCheckSiteKey) {
  try {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    const ac = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js");
    ac.initializeAppCheck(app, { provider: new ac.ReCaptchaEnterpriseProvider(firebaseConfig.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  } catch (err) { console.warn("App Check não iniciou; o app segue sem ele.", err?.code || ""); }
}
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// Modo offline: o SDK guarda leituras em cache e enfileira gravações no IndexedDB do aparelho
// enquanto não há conexão, e envia tudo sozinho quando a internet volta — sem fila própria.
// (O cache local é apagado ao sair da conta — veja signOutAndWipe() em auth.js.)
// 2.13: usa a versão MULTI-ABA. A versão antiga só funcionava numa aba por vez: numa segunda aba (ou
// no app instalado + navegador) a persistência falhava em silêncio e o que fosse feito offline ali
// se perdia ao fechar. Se o navegador não suportar multi-aba, cai para o modo de uma aba só.
export let persistenceMode = "none";   // "multi" | "single" | "none" — só informativo (ex.: diagnóstico)
enableMultiTabIndexedDbPersistence(db).then(() => { persistenceMode = "multi"; }).catch((err) => {
  if (err.code === "unimplemented") {
    console.warn("Este navegador não suporta persistência offline em várias abas; tentando uma aba só.");
    enableIndexedDbPersistence(db).then(() => { persistenceMode = "single"; }).catch(() => {});
  } else if (err.code === "failed-precondition") {
    console.warn("Persistência offline desativada: outra aba já está usando em modo incompatível.");
  }
});

// Mantém a sessão salva neste aparelho até "Sair da conta" — é isso que faz o app abrir direto, sem
// passar pela tela do Google de novo (e, offline, sem precisar de internet para "entrar").
// 2.15 — ONDE o token fica guardado: antes era forçado `browserLocalPersistence`, que grava o token
// de acesso no localStorage (texto simples, legível de forma síncrona por qualquer script que
// rodasse na página — o alvo número 1 de um XSS). Agora usamos IndexedDB (`indexedDBLocalPersistence`,
// o padrão recomendado do Firebase), com localStorage só como último recurso em navegadores sem
// IndexedDB. Quem já estava logado é migrado sozinho pelo SDK na próxima abertura.
// Honesto: sem um servidor próprio não dá para usar cookie HttpOnly (a única forma de o JavaScript
// NUNCA enxergar o token). A defesa contra XSS aqui são camadas: CSP sem 'unsafe-inline' em scripts
// (public/_headers), todo dado de outra pessoa passa por esc()/safeColor()/safeUrl() e o token
// nunca é copiado para outro lugar (nem localStorage, nem logs, nem URL).
setPersistence(auth, indexedDBLocalPersistence).catch(() => setPersistence(auth, browserLocalPersistence).catch(() => {}));

/* ============================================================
   DADOS PRIVADOS FORA DO PERFIL
   O documento users/{uid} é legível por TODOS da sua sala (é dele que saem nome, foto,
   status e total da semana). Campos sensíveis NÃO podem morar nele, porque as regras do
   Firestore liberam o documento inteiro, não campo a campo. Por isso eles vivem em
   subdocumentos com regra própria:
     users/{uid}/private/mind    → só o dono (anotações de distração, metas, revisões, códigos de sala)
     users/{uid}/private/planner → só o dono (LEGADO da antiga aba Planejar; mantido para não perder dados
                                   e para exportar/importar). Done-list e gratidão ficam em subcoleções: js/tada-data.js
   O resto do app não precisa saber disso: este updateDoc() separa os campos sozinho, e
   auth.js junta tudo de volta em store.profile.
============================================================ */
export const PRIVATE_FIELDS = {
  distractions: "mind", subjectGoals: "mind", reviewSchedule: "mind",
  // os códigos das salas são o ÚNICO segredo que dá acesso a elas: no perfil público, quem
  // dividisse UMA sala com você leria o código de todas as outras em que você está
  roomCode: "mind", roomCodes: "mind",
  plannedTasks: "planner", taskCategories: "planner", dayTemplates: "planner"
};
export const PRIVATE_DOCS = ["mind", "planner"];
export const privateRef = (uid, name) => doc(db, "users", uid, "private", name);

export async function updateDoc(ref, data) {
  const uid = auth.currentUser?.uid;
  if (!uid || ref.path !== `users/${uid}`) return rawUpdateDoc(ref, data);

  const main = {}, priv = { mind: {}, planner: {} };
  for (const [k, v] of Object.entries(data)) {
    const group = PRIVATE_FIELDS[k.split(".")[0]];
    if (group) priv[group][k] = v; else main[k] = v;
  }
  const jobs = [];
  if (Object.keys(main).length) jobs.push(rawUpdateDoc(ref, main));
  for (const name of PRIVATE_DOCS) {
    if (!Object.keys(priv[name]).length) continue;
    const pref = privateRef(uid, name);
    jobs.push(
      rawUpdateDoc(pref, priv[name]).catch(async (err) => {
        if (err?.code === "not-found") { await setDoc(pref, {}); return rawUpdateDoc(pref, priv[name]); }
        // regras antigas ainda publicadas (sem a pasta /private): grava no perfil, como era antes,
        // pra nada se perder — o auth.js move esses campos pra pasta privada depois
        if (err?.code === "permission-denied") return rawUpdateDoc(ref, priv[name]);
        throw err;
      })
    );
  }
  await Promise.all(jobs);
}

// reexporta os métodos do SDK usados pelos outros módulos, para eles não
// precisarem apontar pra CDN de novo em cada arquivo
// rawUpdateDoc: escreve direto no perfil, SEM separar campos privados (só a migração do auth.js usa)
export { doc, setDoc, deleteField, rawUpdateDoc };
export {
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
export {
  getDoc, increment, arrayUnion, arrayRemove,
  onSnapshot, serverTimestamp, collection, addDoc, query, orderBy, limit,
  getDocs, deleteDoc, where, writeBatch, terminate, clearIndexedDbPersistence, waitForPendingWrites, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
export {
  signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
  deleteUser, reauthenticateWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
