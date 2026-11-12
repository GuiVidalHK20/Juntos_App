import { isQuiet } from "./quiet.js";
import { db, doc, deleteDoc, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, writeBatch } from "./firebase.js";
import { store, on, emit } from "./store.js";
import { $, esc, avatarHTML, toast, safeColor, safeUrl, getAppTimeZone } from "./utils.js";
import { announce } from "./a11y.js";
import { encryptText, decryptText } from "./crypto.js";

let unsubMsgs = null;
let unsubInbox = null;
let dmTarget = null;
let msgsReady = false;
let lastSeenMsgTs = Number(localStorage.getItem("juntos.lastMsgTs") || 0);
let unreadCount = 0;
let pubMsgs = [], dmMsgs = [];     // mensagens públicas da sala / mensagens diretas recebidas (e cópias das enviadas)
let memberMap = {};                // uid -> perfil (preenchido pelo evento members:update da sala)

/* O nome, a cor e a foto de quem enviou NÃO são lidos da mensagem: o campo "fromName" é
   escrito pelo próprio remetente e dava para se passar por outra pessoa da sala. Quem manda
   é identificado pelo uid (que as regras do Firestore garantem ser de verdade) e o resto vem
   do perfil real dessa pessoa. */
on("members:update", (members) => { memberMap = Object.fromEntries((members || []).map((m) => [m.id, m])); });
function author(m) {
  const real = m.from === store.me?.uid ? store.profile : memberMap[m.from];
  if (real) return { name: String(real.name || "Alguém").slice(0, 60), color: safeColor(real.color, "#D8AD4E"), photo: safeUrl(real.photo) };
  return { name: "Ex-membro", color: "#9AA6B5", photo: null };
}

export function stopMessages() {
  if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
  if (unsubInbox) { unsubInbox(); unsubInbox = null; }
  pubMsgs = []; dmMsgs = [];
  msgsReady = false;
}

async function decryptAll(snap, code, source) {
  const raw = snap.docs.map((d) => ({ id: d.id, src: source, ...d.data() }))
    .filter((m) => typeof m.text === "string" && typeof m.from === "string");
  return Promise.all(raw.map(async (m) => ({ ...m, text: String(await decryptText(m.text, code, m.from)).slice(0, 2000) })));
}

function refresh(code) {
  // mensagens "só para alguém" antigas (de antes desta versão) ficavam na lista pública da sala: continuam
  // filtradas aqui por compatibilidade, mas a proteção de verdade das novas está nas regras (caixa de entrada)
  const legacyVisible = pubMsgs.filter((m) => !m.to || m.to === store.me.uid || m.from === store.me.uid);
  const msgs = [...legacyVisible, ...dmMsgs].sort((a, b) => (a.ts?.toMillis?.() || 0) - (b.ts?.toMillis?.() || 0)).slice(-60);
  renderMessages(msgs);
  const newest = msgs[msgs.length - 1];
  const newestTs = newest?.ts?.toMillis?.() || 0;
  if (msgsReady && newest && newest.from !== store.me.uid && newestTs > lastSeenMsgTs) announceMessage(newest);
  if (newestTs) lastSeenMsgTs = Math.max(lastSeenMsgTs, newestTs);
  msgsReady = true;
}

export function watchMessages(code) {
  stopMessages();
  if (!code) return;
  unsubMsgs = onSnapshot(query(collection(db, "rooms", code, "messages"), orderBy("ts", "desc"), limit(40)), async (snap) => {
    pubMsgs = await decryptAll(snap, code, "pub");
    refresh(code);
  });
  // caixa de entrada: só ESTA pessoa consegue ler (regra do Firestore), então mensagem direta
  // não fica mais visível para o resto da sala
  unsubInbox = onSnapshot(query(collection(db, "rooms", code, "inbox", store.me.uid, "msgs"), orderBy("ts", "desc"), limit(40)), async (snap) => {
    dmMsgs = await decryptAll(snap, code, "inbox");
    refresh(code);
  }, () => { /* regras antigas ainda sem a caixa de entrada: segue só com as mensagens da sala */ });
}

export function setDmTarget(t) {
  dmTarget = t;
  const el = $("msgTo");
  if (t) {
    el.classList.remove("hide");
    el.innerHTML = `Mensagem só para <b>${esc(t.name)}</b> <button id="clearDm">enviar para todos</button>`;
    $("clearDm").addEventListener("click", () => setDmTarget(null));
    $("msgInput").placeholder = `Escreva para ${t.name}…`;
    $("msgInput").focus();
  } else {
    el.classList.add("hide");
    $("msgInput").placeholder = "Escreva para a sala…";
  }
}

async function sendMessage(textArg) {
  const text = (textArg ?? $("msgInput").value).trim();
  const code = store.profile?.roomCode;
  if (!text || !code) return;
  if (textArg == null) $("msgInput").value = "";
  const plain = text.slice(0, 240);
  const target = dmTarget ? { ...dmTarget } : null;
  // UI otimista: mostra a bolha na hora, antes de o Firestore confirmar
  renderOptimistic({ from: store.me.uid, fromName: store.profile.name, fromColor: store.profile.color, fromPhoto: store.profile.photo, to: target?.id || null, toName: target?.name || null, text: plain });
  try {
    // cifra o texto antes de gravar — o que fica salvo no Firestore é ilegível sem a chave
    // derivada do código da sala (ver js/crypto.js). Se não der pra cifrar, NÃO envia.
    const encrypted = await encryptText(plain, code, store.me.uid);
    if (target) {
      // mensagem direta: uma cópia na caixa de entrada de quem recebe e outra na minha
      const batch = writeBatch(db);
      const base = { from: store.me.uid, to: target.id, text: encrypted, ts: serverTimestamp() };
      batch.set(doc(collection(db, "rooms", code, "inbox", target.id, "msgs")), base);
      batch.set(doc(collection(db, "rooms", code, "inbox", store.me.uid, "msgs")), base);
      await batch.commit();
    } else {
      // só o necessário: nome/cor/foto de quem enviou são lidos do perfil real na hora de mostrar
      await addDoc(collection(db, "rooms", code, "messages"), { from: store.me.uid, text: encrypted, ts: serverTimestamp() });
    }
    if (navigator.vibrate) navigator.vibrate(20);
  } catch (err) {
    toast(err?.message === "sem-criptografia"
      ? "Este navegador não consegue cifrar a mensagem, então ela não foi enviada."
      : "Não consegui enviar. Tente de novo.");
  }
}

function renderOptimistic(m) {
  const list = $("msgList");
  const div = document.createElement("div");
  div.className = "msg mine";
  div.style.opacity = ".6";
  const a = author({ from: store.me.uid });
  div.innerHTML = `${avatarHTML(a, { size: 26 })}
    <div class="bubble"><p class="who">${esc(a.name)}${m.to ? ` · só para ${esc(m.toName || "")}` : ""}</p>
    <p class="body">${esc(m.text)}</p><p class="when">enviando…</p></div>`;
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

function renderMessages(msgs) {
  const list = $("msgList");
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  list.innerHTML = msgs.length === 0
    ? `<p class="muted">Nenhuma mensagem ainda. Mande a primeira!</p>`
    : msgs.map((m) => {
      const mine = m.from === store.me.uid;
      const t = m.ts?.toMillis?.();
      const when = t ? new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: getAppTimeZone() }) : "";
      const toName = m.to ? (memberMap[m.to]?.name || m.toName || "") : "";
      const priv = m.to ? (mine ? ` · só para ${esc(String(toName).slice(0, 60))}` : " · só para você") : "";
      const a = author(m);
      const lockTip = m.to
        ? "Mensagem direta: só você e quem recebeu conseguem ler. Cifrada com uma chave ligada ao código da sala (não é criptografia ponta a ponta)."
        : "Cifrada com uma chave ligada ao código da sala: quem está na sala consegue ler. Não é criptografia ponta a ponta.";
      return `<div class="msg ${mine ? "mine" : ""}">
        ${avatarHTML(a, { size: 26 })}
        <div class="bubble"><p class="who">${esc(a.name)}${priv}</p><p class="body">${esc(m.text)}</p>
        <p class="when">${when}<span class="lock" title="${esc(lockTip)}">🔒</span>${mine ? ` <button class="delMsg" data-id="${esc(m.id)}" data-src="${esc(m.src)}" title="Apagar mensagem">🗑</button>` : ""}</p></div></div>`;
    }).join("");
  if (nearBottom) list.scrollTop = list.scrollHeight;
  document.querySelectorAll("#msgList .delMsg").forEach((b) => b.addEventListener("click", async () => {
    const code = store.profile?.roomCode;
    if (!code) return;
    try {
      if (b.dataset.src === "inbox") await deleteDoc(doc(db, "rooms", code, "inbox", store.me.uid, "msgs", b.dataset.id));
      else await deleteDoc(doc(db, "rooms", code, "messages", b.dataset.id));
    } catch { toast("Não consegui apagar a mensagem."); }
  }));
}

let popTimer;
function announceMessage(m) {
  // aviso inclusivo: quem usa leitor de tela é avisado mesmo com a aba da sala aberta ou fechada
  // (a bolha visual e a vibração não chegam a todo mundo). Texto no formato "Nova mensagem de Ana: …".
  const spoken = `Nova mensagem${m.to ? " só para você" : ""} de ${author(m).name}: ${m.text}`;
  if (store.profile?.msgNotifOn === false || isQuiet()) return;   // 2.25: "Silenciar avisos" (js/quiet.js)
  announce(spoken);
  const onRoomTab = !$("view-room").classList.contains("hide");
  if (!onRoomTab) bumpUnread();
  if (document.hidden) {
    if ("Notification" in window && Notification.permission === "granted") {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(
        `${author(m).name}${m.to ? " (só para você)" : ""}`,
        { body: m.text, tag: "juntos-msg-" + m.id, icon: "icons/icon-192.png", badge: "icons/badge-96.png", vibrate: [120, 60, 120] }
      )).catch(() => {});
    }
    return;
  }
  $("msgPopFrom").textContent = `${author(m).name}${m.to ? " · só para você" : ""}`;
  $("msgPopBody").textContent = m.text;
  $("msgPop").classList.add("on");
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  clearTimeout(popTimer);
  popTimer = setTimeout(() => $("msgPop").classList.remove("on"), 6000);
}
function bumpUnread() {
  unreadCount++;
  const b = $("msgBadge");
  b.textContent = unreadCount > 9 ? "9+" : unreadCount;
  b.setAttribute("aria-label", `${unreadCount} ${unreadCount === 1 ? "mensagem não lida" : "mensagens não lidas"}`);
  b.classList.remove("hide");
}
export function clearUnread() {
  unreadCount = 0;
  $("msgBadge").classList.add("hide");
  localStorage.setItem("juntos.lastMsgTs", String(lastSeenMsgTs));
}

export function initMessages() {
  $("sendMsg").addEventListener("click", () => sendMessage());
  $("msgInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  $("msgPopClose").addEventListener("click", () => { $("msgPop").classList.remove("on"); delete $("msgPop").dataset.openFriend; });
  $("msgPop").addEventListener("click", (e) => {
    if (e.target.id === "msgPopClose") return;
    const friendId = $("msgPop").dataset.openFriend;
    if (friendId) { emit("openFriend", friendId); }
    else document.querySelector('nav button[data-tab="room"]').click();
    $("msgPop").classList.remove("on");
    delete $("msgPop").dataset.openFriend;
  });
  on("message:quicksend", (text) => sendMessage(text));
}
