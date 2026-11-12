import { db, doc, updateDoc, arrayUnion, arrayRemove } from "./firebase.js";
import { playViewIntro } from "./fx.js";
import { store, on } from "./store.js";
import { $, esc, avatarHTML, toast } from "./utils.js";
import { AVATAR_COLORS, APP_VERSION, THEME_LS_KEY } from "./constants.js";
import { refreshNotifSetting, requestNotifPermission } from "./timer.js";
import { renderStats } from "./stats.js";
import { renderRoom, clearUnread } from "./room.js";
import { renderDistractions } from "./distractions.js";
import { renderTada, renderTadaSharing } from "./tada.js";

export function renderMe() {
  const p = store.profile;
  $("meAvatarWrap").outerHTML = avatarHTML(p).replace('<span class="avatarWrap">', '<span class="avatarWrap" id="meAvatarWrap">');
  $("meName").textContent = p.name;
  $("setName").value = p.name;
  $("cfgWork").value = store.cfg.workMin; $("cfgBreak").value = store.cfg.breakMin;
  $("cfgLong").value = store.cfg.longBreakMin; $("cfgCycles").value = store.cfg.cyclesBeforeLong;
  $("swatches").innerHTML = AVATAR_COLORS.map(
    (c) => `<button data-color="${c}" style="background:${c}" class="${p.color === c ? "on" : ""}"></button>`).join("");
  const hb = $("headerStreak");
  import("./utils.js").then(({ computeStreak }) => {
    const st = computeStreak(p.daily);
    hb.classList.toggle("hide", st.days === 0);
    hb.textContent = `🔥 ${st.days}`;
  });
}

export function syncToggles() {
  const p = store.profile;
  $("soundToggle").checked = p.soundOn !== false;
  $("notifToggle").checked = !!p.notifOn;
  $("msgNotifToggle").checked = p.msgNotifOn !== false;
  $("studyNotifToggle").checked = p.studyNotifOn !== false;
  syncThemeButtons();
}

/* ---------- Ajustes > Diário de estudos: quem pode ver o meu ---------- */
let lastMembersSeen = [];
export function renderDiarySharing(members) {
  if (members) lastMembersSeen = members;
  const box = $("diaryShareList");
  if (!box) return;
  const others = lastMembersSeen.filter((m) => m.id !== store.me?.uid);
  if (!store.profile?.roomCode) {
    box.innerHTML = `<p class="muted">Entre numa sala para poder liberar seu diário para alguém.</p>`;
    return;
  }
  if (others.length === 0) { box.innerHTML = `<p class="muted">Ainda não tem mais ninguém na sua sala.</p>`; return; }
  const shared = store.profile?.diarySharedWith || [];
  box.innerHTML = others.map((m) => `
    <div class="notifBox" style="margin-top:10px">
      <label class="switch"><input type="checkbox" class="diaryShareToggle" data-id="${esc(m.id)}" ${shared.includes(m.id) ? "checked" : ""}><span class="slider"></span></label>
      <div><p style="margin:0;font-size:13px">${esc(m.name)} pode ver meu diário de estudos</p></div>
    </div>`).join("");
  document.querySelectorAll(".diaryShareToggle").forEach((cb) => cb.addEventListener("change", async (e) => {
    const id = e.target.dataset.id;
    const on = e.target.checked;
    const cur = store.profile.diarySharedWith || [];
    store.profile = { ...store.profile, diarySharedWith: on ? [...cur, id] : cur.filter((x) => x !== id) }; // otimista
    await updateDoc(doc(db, "users", store.me.uid), { diarySharedWith: on ? arrayUnion(id) : arrayRemove(id) }).catch(() => {});
    toast(on ? "Diário liberado." : "Diário não é mais compartilhado.");
  }));
}

/* ---------- Ajustes > Aparência: claro / escuro / automático ---------- */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme; // "light" | "dark" | "system"
  try { localStorage.setItem(THEME_LS_KEY, theme); } catch {}
}
function syncThemeButtons() {
  const theme = store.profile?.theme || localStorage.getItem(THEME_LS_KEY) || "dark";
  applyTheme(theme);
  document.querySelectorAll(".themeBtn").forEach((b) => b.classList.toggle("on", b.dataset.theme === theme));
}

const VIEWS = ["timer", "stats", "tada", "quotes", "room", "settings"];
let currentView = "timer";
let lastTab = "timer"; // última aba da navegação (pra onde "Voltar"/engrenagem retornam)

export function showView(tab) {
  if (!VIEWS.includes(tab)) return;
  const same = tab === currentView;
  currentView = tab;
  document.documentElement.dataset.view = tab;   // a tela de foco só vale no cronômetro (ver CSS em index.html)
  if (tab !== "settings" && tab !== "quotes") lastTab = tab;
  document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("on", x.dataset.tab === tab));
  $("gearBtn").classList.toggle("on", tab === "settings");
  $("quotesBtn").classList.toggle("on", tab === "quotes");
  VIEWS.forEach((v) => $("view-" + v).classList.toggle("hide", v !== tab));
  if (tab === "settings") window.scrollTo(0, 0);
  if (tab === "stats") renderStats();
  if (tab === "tada") renderTada();
  if (tab === "quotes") import("./quotes.js").then((m) => m.renderQuotes()).catch(() => toast("Não foi possível abrir as frases agora. Tente de novo."));
  if (tab === "room") { renderRoom(); clearUnread(); }
  playViewIntro($("view-" + tab), same); // entrada em cascata (js/fx.js); sem efeito no modo Suave
}

export function initUI() {
  // abas da navegação inferior (as demais telas continuam chamando .click() nestes botões)
  document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.tab)));
  // Ajustes: engrenagem no cabeçalho (abre/fecha) e botão "Voltar" dentro da tela
  $("gearBtn").addEventListener("click", () => showView(currentView === "settings" ? lastTab : "settings"));
  $("settingsBack").addEventListener("click", () => showView(lastTab));
  // Frases: botão 💡 no cabeçalho (abre e, tocando de novo, volta pra tela anterior)
  $("quotesBtn").addEventListener("click", () => showView(currentView === "quotes" ? lastTab : "quotes"));

  // Ajustes → "Remover ciclos": módulo usado raramente, carrega só quando o botão é tocado
  $("removeCycles")?.addEventListener("click", async () => {
    try { (await import("./removecycles.js")).openRemoveCycles(); }
    catch { toast("Não foi possível abrir agora. Tente de novo."); }
  });

  // folha "Som e notificações": todos os interruptores ficam escondidos até a pessoa abrir
  const sheet = $("soundSheet");
  const openSheet = () => { sheet.classList.remove("hide"); $("soundSheetClose").focus(); };
  const closeSheet = () => sheet.classList.add("hide");
  $("soundSheetBtn").addEventListener("click", openSheet);
  $("soundSheetBtn2").addEventListener("click", openSheet);
  $("soundSheetClose").addEventListener("click", closeSheet);
  sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.classList.contains("hide")) closeSheet(); });

  $("swatches").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll("#swatches button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
  });
  $("saveProfile").addEventListener("click", async () => {
    const name = $("setName").value.trim() || store.profile.name;
    const picked = document.querySelector("#swatches button.on");
    const color = picked ? picked.dataset.color : store.profile.color;
    store.profile = { ...store.profile, name, color };  // otimista
    renderMe();
    toast("Perfil salvo.");
    await updateDoc(doc(db, "users", store.me.uid), { name, color }).catch(() => {});
  });

  async function setNotifPref(on) {
    if (on) {
      const ok = await requestNotifPermission();
      if (!ok) { toast("Permissão de notificação negada pelo navegador."); on = false; }
    }
    store.profile = { ...store.profile, notifOn: on }; syncToggles();  // otimista
    refreshNotifSetting();
    await updateDoc(doc(db, "users", store.me.uid), { notifOn: on }).catch(() => {});
  }
  $("notifToggle").addEventListener("change", (e) => setNotifPref(e.target.checked));
  $("soundToggle").addEventListener("change", (e) => {
    store.profile = { ...store.profile, soundOn: e.target.checked };
    updateDoc(doc(db, "users", store.me.uid), { soundOn: e.target.checked }).catch(() => {});
  });
  $("msgNotifToggle").addEventListener("change", (e) => {
    store.profile = { ...store.profile, msgNotifOn: e.target.checked };
    updateDoc(doc(db, "users", store.me.uid), { msgNotifOn: e.target.checked }).catch(() => {});
  });
  $("studyNotifToggle").addEventListener("change", (e) => {
    store.profile = { ...store.profile, studyNotifOn: e.target.checked };
    updateDoc(doc(db, "users", store.me.uid), { studyNotifOn: e.target.checked }).catch(() => {});
  });

  document.querySelectorAll(".themeBtn").forEach((b) => {
    b.addEventListener("click", () => {
      const theme = b.dataset.theme;
      applyTheme(theme);
      syncThemeButtons();
      if (store.me) {
        store.profile = { ...store.profile, theme };
        updateDoc(doc(db, "users", store.me.uid), { theme }).catch(() => {});
      }
    });
  });

  on("members:update", (members) => { renderDiarySharing(members); });   // a aba Ta-da ouve o mesmo evento (js/tada.js)

  $("versionTag").textContent = `Versão ${APP_VERSION}`;
}

export function renderAll() {
  renderStats();
  renderRoom();
  renderDistractions();
  renderTada();
}
