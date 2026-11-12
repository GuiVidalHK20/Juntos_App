import { isQuiet } from "./quiet.js";
import { db, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot, serverTimestamp } from "./firebase.js";
import { store, emit } from "./store.js";
import { $, esc, fmtMin, genCode, weekStartKey, sumDaily, avatarHTML, computeStreak, toast, safeColor, safeNum } from "./utils.js";
import { ONLINE_WINDOW_MS, DEFAULT_CFG } from "./constants.js";
import { watchMessages, stopMessages, clearUnread, setDmTarget } from "./messages.js";
import { joinSyncedSession, leaveSyncedSession, inSyncedSession } from "./timer.js";

let unsubRoom = null;
let memberUnsubs = {}, memberData = {};
let memberRenderInterval = null;
let roomSync = null; // último "sync" visto no doc da sala
let roomOwner = null; // uid de quem criou a sala atual (só essa pessoa inicia sessão coletiva e remove participantes)
let wasStudying = {}; // uid -> bool, pra perceber a TRANSIÇÃO pra "estudando agora"
let studyingReady = {}; // uid -> true depois do primeiro snapshot (evita pop-up ao entrar na sala)

// lista atual de membros da sala (usada pelo perfil de amigo e pelos Ajustes,
// que precisam saber quem está na sala sem importar este módulo inteiro)
export function getMembers() { return Object.values(memberData); }
export function getMember(id) { return memberData[id] || null; }

export function stopRoomWatchers() {
  if (unsubRoom) { unsubRoom(); unsubRoom = null; }
  stopMessages();
  Object.values(memberUnsubs).forEach((u) => u());
  memberUnsubs = {}; memberData = {}; wasStudying = {}; studyingReady = {};
  clearInterval(memberRenderInterval); memberRenderInterval = null;
}

export function watchRoom(code) {
  stopRoomWatchers();
  if (!code) { renderRoom(); return; }
  unsubRoom = onSnapshot(doc(db, "rooms", code), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const ids = Array.isArray(data.members) ? data.members : [];
    roomSync = data.sync || null;
    roomOwner = data.owner || null;
    // fui removido da sala por quem a criou: limpa do meu perfil, senão ela ficaria "fantasma" na lista
    if (!snap.metadata.fromCache && store.me && !ids.includes(store.me.uid)) { leaveRemovedRoom(code); return; }
    Object.keys(memberUnsubs).forEach((id) => {
      if (!ids.includes(id)) { memberUnsubs[id](); delete memberUnsubs[id]; delete memberData[id]; }
    });
    ids.forEach((id) => {
      if (memberUnsubs[id]) return;
      memberUnsubs[id] = onSnapshot(doc(db, "users", id), (d) => {
        if (!d.exists()) return;
        memberData[id] = { id, ...d.data() };
        checkStudyingTransition(memberData[id]);
        renderMemberList();
      });
    });
    renderMemberList();
    renderSyncPanel(data.owner);
  });
  watchMessages(code);
  clearInterval(memberRenderInterval);
  memberRenderInterval = setInterval(renderMemberList, 15000);
}

async function leaveRemovedRoom(code) {
  const remaining = (Array.isArray(store.profile?.roomCodes) ? store.profile.roomCodes : []).filter((c) => c !== code);
  toast("Você não faz mais parte da sala " + code + ".");
  await updateDoc(doc(db, "users", store.me.uid), { roomCode: remaining[0] || null, roomCodes: arrayRemove(code) }).catch(() => {});
}

export function renderRoom() {
  if (!store.profile) return;
  const has = !!store.profile.roomCode;
  $("noRoom").classList.toggle("hide", has);
  $("inRoom").classList.toggle("hide", !has);
  renderRoomSwitcher();
  if (!has) return;
  $("roomCode").textContent = store.profile.roomCode;
  renderMemberList();
}

// chips com todas as salas de que a pessoa faz parte — clicar troca qual sala fica
// ativa (mensagens/membros exibidos) sem sair de nenhuma delas
function renderRoomSwitcher() {
  const box = $("roomSwitcher");
  if (!box) return;
  const active = store.profile.roomCode;
  const codes = Array.isArray(store.profile.roomCodes) && store.profile.roomCodes.length
    ? store.profile.roomCodes
    : (active ? [active] : []);
  if (codes.length < 2) { box.classList.add("hide"); box.innerHTML = ""; return; }
  box.classList.remove("hide");
  box.innerHTML = codes.map((c) =>
    `<button class="roomChip ${c === active ? "on" : ""}" data-switchroom="${esc(c)}">${esc(c)}</button>`).join("");
  box.querySelectorAll("[data-switchroom]").forEach((b) =>
    b.addEventListener("click", () => switchRoom(b.dataset.switchroom)));
}

// troca a sala ativa sem sair das outras — só muda o ponteiro roomCode; a pessoa
// continua sendo membro de todas as salas em profile.roomCodes. Quem realmente troca
// as mensagens/membros exibidos é o main.js, que reage à mudança de roomCode e chama
// watchRoom() de novo assim que o snapshot do perfil voltar do Firestore.
async function switchRoom(code) {
  if (!code || !store.me || code === store.profile.roomCode) return;
  store.profile = { ...store.profile, roomCode: code }; // otimista, pra o chip já reagir na hora
  renderRoomSwitcher();
  await updateDoc(doc(db, "users", store.me.uid), { roomCode: code }).catch(() => {});
}

const lastActiveMs = (p) => p?.lastActive?.toMillis ? p.lastActive.toMillis() : null;
const isOnline = (p) => { const t = lastActiveMs(p); return t != null && Date.now() - t < ONLINE_WINDOW_MS; };
// "ativo agora" cobre os dois jeitos de status ao vivo: estudando uma matéria (status.studying,
// publicado pelo Cronômetro) ou fazendo uma tarefa de rotina (status.doingTask, publicado pelo
// botão "fazer agora" do Planejar) — mesma regra de expiração pros dois
function isActive(p) {
  const s = p?.status;
  if (!s?.studying && !s?.doingTask) return false;
  if (s.until && Date.now() > s.until + 5 * 60000) return false;
  if (!s.until && lastActiveMs(p) && Date.now() - lastActiveMs(p) > 15 * 60000) return false;
  return true;
}
function lastSeenLabel(p) {
  const t = lastActiveMs(p); if (t == null) return "offline";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 2) return "online agora";
  if (min < 60) return `visto há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `visto há ${h} h`;
  return `visto há ${Math.round(h / 24)} d`;
}

/* ---------- pop-up "amigo estudando/fazendo uma tarefa agora" ---------- */
let studyPopTimer;
function checkStudyingTransition(p) {
  if (p.id === store.me?.uid) return; // não avisa de mim mesmo
  const active = isActive(p);
  const first = !studyingReady[p.id];
  studyingReady[p.id] = true;
  const before = wasStudying[p.id];
  wasStudying[p.id] = active;
  if (first || !active || before) return; // só dispara na TRANSIÇÃO pra "ativo"
  if (store.profile?.studyNotifOn === false || isQuiet()) return;   // 2.25: "Silenciar avisos"

  const doingTask = !!p.status?.doingTask;
  const what = doingTask ? (p.status?.taskName ? ` · ${p.status.taskName}` : "") : (p.status?.subjectName ? ` · ${p.status.subjectName}` : "");
  const title = doingTask ? `${p.name} está fazendo uma tarefa` : `${p.name} está estudando`;
  const body = `Começou agora${what}. Bora fazer companhia?`;

  const onRoomTab = !$("view-room")?.classList.contains("hide");
  if (document.hidden) {
    if ("Notification" in window && Notification.permission === "granted") {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, {
        body, tag: "juntos-study-" + p.id, icon: "icons/icon-192.png", badge: "icons/badge-96.png", vibrate: [120, 60, 120]
      })).catch(() => {});
    }
    return;
  }
  if (onRoomTab) return; // já tá vendo o status na lista, não precisa de pop-up
  $("msgPopFrom").textContent = title;
  $("msgPopBody").textContent = body;
  $("msgPop").dataset.openFriend = p.id;
  $("msgPop").classList.add("on");
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  clearTimeout(studyPopTimer);
  studyPopTimer = setTimeout(() => { $("msgPop").classList.remove("on"); delete $("msgPop").dataset.openFriend; }, 6000);
}

function renderMemberList() {
  if (!store.profile?.roomCode) return;
  emit("members:update", Object.values(memberData));
  const ws = weekStartKey();
  const rows = Object.values(memberData).map((p) => {
    const active = isActive(p);
    const doingTask = active && !!p.status?.doingTask;
    return {
      id: p.id, name: p.name, photo: p.photo, color: p.color,
      week: sumDaily(p.daily, (k) => k >= ws),
      streak: computeStreak(p.daily).days,
      online: isOnline(p) || active, active, doingTask, onBreak: !!p.status?.onBreak,
      subjectName: p.status?.subjectName, subjectColor: p.status?.subjectColor,
      taskName: p.status?.taskName, taskColor: p.status?.taskColor,
      since: p.status?.since, seen: lastSeenLabel(p)
    };
  }).sort((a, b) => (b.active - a.active) || (b.week - a.week));

  const max = Math.max(1, ...rows.map((r) => r.week));
  $("members").innerHTML = rows.length === 0 ? `<p class="muted">Carregando…</p>` : rows.map((r, i) => {
    let status;
    if (r.active) {
      const mins = r.since ? Math.max(0, Math.round((Date.now() - r.since) / 60000)) : null;
      const timeLbl = mins != null ? ` <span style="font-weight:400;color:var(--muted)">há ${mins} min</span>` : "";
      if (r.doingTask) {
        const pill = r.taskName
          ? `<span class="subjpill"><span class="d" style="background:${r.taskColor ? safeColor(r.taskColor) : "var(--c-planner)"}"></span>${esc(r.taskName)}</span>` : "";
        status = `<p class="status doingTask">🧹 fazendo tarefa ${pill}${timeLbl}</p>`;
      } else {
        const pill = r.subjectName
          ? `<span class="subjpill"><span class="d" style="background:${r.subjectColor ? safeColor(r.subjectColor) : "var(--c-timer)"}"></span>${esc(r.subjectName)}</span>` : "";
        status = `<p class="status studying">📖 estudando ${pill}${timeLbl}</p>`;
      }
    } else if (r.onBreak) status = `<p class="status online">☕ em pausa</p>`;
    else if (r.online) status = `<p class="status online">online no app</p>`;
    else status = `<p class="status">${esc(r.seen)}</p>`;
    const badge = r.active ? (r.doingTask ? "task" : "studying") : (r.online ? "online" : null);
    return `<div class="member" ${r.id !== store.me.uid ? `data-open-friend="${esc(r.id)}"` : ""}>
      <span class="rank" style="${i === 0 && r.week > 0 ? "color:var(--i-stats)" : ""}">${i === 0 && r.week > 0 ? "★" : i + 1}</span>
      ${avatarHTML(r, { badge })}
      <div class="who">
        <p class="nm">${esc(r.name)}${r.id === store.me.uid ? " (você)" : ""}${r.streak > 0 ? ` <span class="streak">🔥${r.streak}</span>` : ""}</p>
        ${status}
        <div class="track"><i style="width:${Math.max(4, (r.week / max) * 100)}%;background:${r.color ? safeColor(r.color) : "var(--c-room)"}"></i></div>
      </div>
      <div class="right">
        <span class="amt">${fmtMin(r.week)}</span>
        ${r.id !== store.me.uid ? `<button class="msgbtn" data-dm="${esc(r.id)}" data-nm="${esc(r.name)}">mensagem</button>` : ""}
        ${(roomOwner === store.me.uid && r.id !== store.me.uid) ? `<button class="msgbtn" data-kick="${esc(r.id)}" data-nm="${esc(r.name)}" style="color:var(--danger)">remover</button>` : ""}
      </div>
    </div>`;
  }).join("");

  document.querySelectorAll("#members .msgbtn[data-dm]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); setDmTarget({ id: b.dataset.dm, name: b.dataset.nm }); }));
  document.querySelectorAll("#members .msgbtn[data-kick]").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Remover ${b.dataset.nm} da sala? A pessoa só volta se entrar de novo com o código.`)) return;
      try {
        await updateDoc(doc(db, "rooms", store.profile.roomCode), { members: arrayRemove(b.dataset.kick) });
        toast("Participante removido.");
      } catch { toast("Não consegui remover essa pessoa."); }
    }));
  document.querySelectorAll("#members .member[data-open-friend]").forEach((el) =>
    el.addEventListener("click", () => emit("openFriend", el.dataset.openFriend)));
}

/* ---------- Sessão Coletiva (pomodoro sincronizado da sala) ---------- */
let syncTickHandle = null;
function renderSyncPanel(ownerId) {
  const iAmOwner = ownerId === store.me?.uid;
  const box = $("syncPanel");
  clearInterval(syncTickHandle);

  if (!roomSync || !roomSync.active) {
    box.innerHTML = iAmOwner
      ? `<button class="rowbtn" id="startSyncBtn" style="margin:0 0 4px">🚀 Iniciar sessão coletiva</button>
         <p class="muted" style="margin:0">Todos na sala entram no mesmo ciclo de foco e pausa, usando seu ciclo padrão (${store.cfg.workMin}min foco / ${store.cfg.breakMin}min pausa).</p>`
      : `<p class="muted" style="margin:0">Nenhuma sessão coletiva agora. Só quem criou a sala pode iniciar uma.</p>`;
    if (iAmOwner) $("startSyncBtn").addEventListener("click", startGroupSession);
    return;
  }

  const paintSync = () => {
    const now = Date.now();
    const c = roomSync.cfg || {};
    const target = safeNum(roomSync.phase === "work" ? c.workMin : roomSync.phase === "break" ? c.breakMin : c.longBreakMin, 1, 600) * 60;
    const remaining = Math.max(0, target - (now - safeNum(roomSync.phaseStartedAt, 0, 9e15)) / 1000);
    const m = Math.floor(remaining / 60), s = Math.floor(remaining % 60);
    const label = roomSync.phase === "work" ? "Foco" : roomSync.phase === "break" ? "Pausa curta" : "Pausa longa";
    const joined = inSyncedSession();
    box.innerHTML = `
      <div class="syncActive">
        <div>
          <p class="syncLabel">🚀 Sessão coletiva · ${label}</p>
          <p class="syncClock">${m}:${String(s).padStart(2, "0")}</p>
        </div>
        <div class="syncBtns">
          ${joined ? "" : `<button class="primary" id="joinSyncBtn">Entrar</button>`}
          ${iAmOwner ? `<button class="ghost" id="endSyncBtn">Encerrar para todos</button>` : ""}
        </div>
      </div>`;
    const j = $("joinSyncBtn"); if (j) j.addEventListener("click", () => {
      joinSyncedSession({ cfg: roomSync.cfg, phase: roomSync.phase, phaseStartedAt: roomSync.phaseStartedAt, cycles: roomSync.cycle || 0 });
      document.querySelector('nav button[data-tab="timer"]').click();
    });
    const e = $("endSyncBtn"); if (e) e.addEventListener("click", endGroupSession);
  };
  paintSync();
  syncTickHandle = setInterval(paintSync, 1000);
}
async function startGroupSession() {
  if (!store.profile?.roomCode) return;
  await updateDoc(doc(db, "rooms", store.profile.roomCode), {
    sync: { active: true, phase: "work", phaseStartedAt: Date.now(), cycle: 0,
      cfg: { workMin: store.cfg.workMin, breakMin: store.cfg.breakMin, longBreakMin: store.cfg.longBreakMin, cyclesBeforeLong: store.cfg.cyclesBeforeLong } }
  });
  toast("Sessão coletiva iniciada. Convide a sala a entrar!");
}
async function endGroupSession() {
  if (!store.profile?.roomCode) return;
  await updateDoc(doc(db, "rooms", store.profile.roomCode), { sync: { active: false } });
  leaveSyncedSession();
}

/* ---------- criar / entrar / sair ---------- */
export function initRoom() {
  $("createRoom").addEventListener("click", async () => {
    let code = genCode(), tries = 0;
    while ((await getDoc(doc(db, "rooms", code))).exists() && tries++ < 5) code = genCode();
    await setDoc(doc(db, "rooms", code), { members: [store.me.uid], owner: store.me.uid, createdAt: serverTimestamp() });
    // roomCode = sala ativa (a que fica visível agora); roomCodes = todas as salas de que
    // a pessoa faz parte, pra poder entrar em outras sem sair desta
    await updateDoc(doc(db, "users", store.me.uid), { roomCode: code, roomCodes: arrayUnion(code) });
    toast("Sala criada. Compartilhe o código.");
  });
  $("joinRoom").addEventListener("click", () => joinRoomByCode($("codeInput").value, $("roomErr"), $("codeInput")));
  $("leaveRoom").addEventListener("click", async () => {
    const code = store.profile.roomCode; if (!code) return;
    await updateDoc(doc(db, "rooms", code), { members: arrayRemove(store.me.uid) });
    // sair só desta sala: escolhe outra das salas restantes pra ficar ativa (se houver
    // alguma) — as demais continuam intactas, ninguém é removido delas
    const remaining = (Array.isArray(store.profile.roomCodes) ? store.profile.roomCodes : [code]).filter((c) => c !== code);
    await updateDoc(doc(db, "users", store.me.uid), { roomCode: remaining[0] || null, roomCodes: arrayRemove(code) });
    toast(remaining.length ? "Você saiu da sala. Mostrando outra sala sua." : "Você saiu da sala.");
  });
  $("copyCode").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(store.profile.roomCode); toast("Código copiado."); }
    catch { toast("Copie manualmente: " + store.profile.roomCode); }
  });

  // "+ entrar em outra sala": mesmo fluxo de entrar, só que disparado de dentro de uma
  // sala já ativa, sem afetar as salas em que a pessoa já está
  $("joinMoreToggle")?.addEventListener("click", () => $("joinMoreBox")?.classList.toggle("hide"));
  $("joinMoreGo")?.addEventListener("click", async () => {
    const ok = await joinRoomByCode($("joinMoreInput")?.value, $("joinMoreErr"), $("joinMoreInput"));
    if (ok) { $("joinMoreInput").value = ""; $("joinMoreBox")?.classList.add("hide"); }
  });
}

// entra numa sala pelo código e a torna a sala ativa, sem tirar a pessoa de nenhuma
// sala em que ela já estava. Usado tanto na tela de "sem sala" quanto no atalho
// "+ entrar em outra sala" de dentro de uma sala já ativa.
async function joinRoomByCode(rawCode, errEl, inputEl) {
  const code = (rawCode || "").trim().toUpperCase();
  if (!code) return false;
  if (!/^[A-Z0-9]{6,8}$/.test(code)) {
    if (errEl) { errEl.textContent = "Código inválido. Ele tem de 6 a 8 letras e números."; errEl.classList.remove("hide"); }
    return false;
  }
  if (Array.isArray(store.profile.roomCodes) && store.profile.roomCodes.includes(code)) {
    errEl?.classList.add("hide");
    await updateDoc(doc(db, "users", store.me.uid), { roomCode: code });
    toast("Você já está nessa sala.");
    return true;
  }
  const snap = await getDoc(doc(db, "rooms", code));
  if (!snap.exists()) {
    if (errEl) { errEl.textContent = "Não encontramos essa sala. Confira o código."; errEl.classList.remove("hide"); }
    return false;
  }
  errEl?.classList.add("hide");
  await updateDoc(doc(db, "rooms", code), { members: arrayUnion(store.me.uid) });
  await updateDoc(doc(db, "users", store.me.uid), { roomCode: code, roomCodes: arrayUnion(code) });
  if (inputEl) inputEl.value = "";
  toast("Você entrou na sala.");
  return true;
}
export { clearUnread };
