/* Perfil de amigo: uma tela isolada (não é uma aba da navegação) que abre
   por cima da Sala quando você toca em alguém da lista, ou quando toca no
   pop-up de "amigo estudando agora". Mostra estatísticas do amigo e, se ele
   te deu acesso (Ajustes → Diário de estudos), o diário dele também. */
import { db, collection, query, orderBy, limit, getDocs } from "./firebase.js";
import { store } from "./store.js";
import { $, esc, fmtMin, fmtMinStacked, dateKey, weekStartKey, sumDaily, normDay, subjectById, subjectsWithArchive, sessionSubject, computeStreak, avatarHTML, brNow, safeColor } from "./utils.js";
import { WEEKDAYS } from "./constants.js";
import { getMember } from "./room.js";
import {
  iCanSee, studyRows, fetchFriendTadaRecent, fetchFriendGratitude, winRowHTML, studyRowHTML, gratRowHTML, dayLabelShort
} from "./tada-data.js";

let diaryCache = {}; // uid -> sessões já buscadas nesta sessão do app (evita rebuscar toda hora)
let wired = false;
const first = (p) => String(p.name || "Essa pessoa").split(" ")[0];

export function initFriendProfile() {
  if (wired) return;
  wired = true;
  $("friendClose").addEventListener("click", closeFriendProfile);
}

function closeFriendProfile() {
  $("friendWrap").classList.add("hide");
}

export async function openFriendProfile(id) {
  const p = getMember(id);
  if (!p) return;
  $("friendWrap").classList.remove("hide");

  $("friendAvatar").outerHTML = avatarHTML(p, { size: 52 }).replace('<span class="avatarWrap">', '<span class="avatarWrap" id="friendAvatar">');
  $("friendName").textContent = String(p.name || "");
  const st = computeStreak(p.daily);
  $("friendSeen").textContent = st.days > 0 ? `🔥 ${st.days} ${st.days === 1 ? "dia" : "dias"} seguidos estudando` : "ainda sem sequência ativa";

  const d = p.daily || {}, today = dateKey(), ws = weekStartKey();
  $("frToday").textContent = fmtMin(normDay(d[today]).total);
  $("frWeek").textContent = fmtMin(sumDaily(d, (k) => k >= ws));
  $("frMonth").textContent = fmtMin(sumDaily(d, (k) => k.startsWith(today.slice(0, 7))));
  $("frYear").textContent = fmtMin(sumDaily(d, (k) => k.startsWith(today.slice(0, 4))));

  // matérias do amigo (incluindo as que ele já removeu): é daqui que sai o nome/cor de cada
  // matéria nos gráficos, no diário e no planejamento dele — nunca da lista das minhas
  const subjList = subjectsWithArchive(p);
  renderFriendBars(d, subjList);
  renderDiarySection(p, subjList);
  renderFriendTada(p);
  renderFriendGrat(p);
}

function renderFriendBars(d, subjList) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dt = brNow(); dt.setDate(dt.getDate() - i);
    const k = dateKey(dt);
    days.push({ label: WEEKDAYS[dt.getDay()], today: i === 0, entry: normDay(d[k]) });
  }
  const max = Math.max(30, ...days.map((x) => x.entry.total));
  const seen = new Map();
  $("friendBars").innerHTML = days.map((x) => {
    const segs = Object.entries(x.entry.bySubject || {}).sort((a, b) => b[1] - a[1]);
    segs.forEach(([sid]) => { if (!seen.has(sid)) seen.set(sid, subjectById(sid, subjList)); });
    const inner = segs.map(([sid, min]) => {
      const s = subjectById(sid, subjList);
      return `<div class="seg" style="height:${x.entry.total ? (min / x.entry.total) * 100 : 0}%;background:${safeColor(s.color)}"></div>`;
    }).join("");
    return `<div class="col"><span class="val">${x.entry.total ? fmtMinStacked(x.entry.total) : ""}</span>
      <div class="stack" style="height:${(x.entry.total / max) * 100}%">${inner}</div>
      <span class="lbl ${x.today ? "today" : ""}">${x.label}</span></div>`;
  }).join("");
  $("friendLegend").innerHTML = [...seen.values()].map((s) =>
    `<span class="item"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span>`).join("");
}

async function renderDiarySection(p, subjList) {
  const allowed = Array.isArray(p.diarySharedWith) && p.diarySharedWith.includes(store.me?.uid);
  $("friendDiarySection").classList.toggle("hide", !allowed);
  $("friendNoDiary").textContent = allowed ? "" : `${first(p)} não liberou o diário de estudos para você.`;
  if (!allowed) return;

  const box = $("friendDiaryList");
  if (diaryCache[p.id]) { box.innerHTML = diaryCache[p.id]; return; }
  box.innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const snap = await getDocs(query(collection(db, "users", p.id, "sessions"), orderBy("ts", "desc"), limit(30)));
    const rows = snap.docs.map((d) => d.data());
    const html = rows.length === 0
      ? `<p class="muted">Nenhum ciclo registrado ainda.</p>`
      : rows.map((r) => {
        const s = sessionSubject(r, subjList);
        const dt = new Date(r.date + "T00:00:00");
        const dateLbl = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
        return `<div class="logRow">
          <span class="dot" style="background:${s.color}"></span>
          <div class="logBody">
            <p class="logHead">${dateLbl} · ${esc(s.name)} · ${fmtMin(r.minutes)}</p>
            ${r.note ? `<p class="logNote">${esc(r.note)}</p>` : `<p class="logNote muted">sem anotação</p>`}
          </div>
        </div>`;
      }).join("");
    diaryCache[p.id] = html;
    box.innerHTML = html;
  } catch {
    box.innerHTML = `<p class="muted">Não consegui carregar o diário.</p>`;
  }
}

/* ---------- done-list do amigo (hoje + dias recentes), só se ele liberar ---------- */
// cada perfil abre com a leitura mais nova; o número de pedido descarta respostas que chegam atrasadas
let tadaReq = 0;
async function renderFriendTada(p) {
  const allowed = iCanSee(p, "tadaSharedWith");
  $("friendTadaSection").classList.toggle("hide", !allowed);
  $("friendNoTada").textContent = allowed ? "" : `${first(p)} não liberou a done-list para você.`;
  if (!allowed) return;
  const box = $("friendTadaList");
  box.innerHTML = `<p class="muted">Carregando…</p>`;
  const req = ++tadaReq;
  try {
    const days = await fetchFriendTadaRecent(p.id, 7);
    if (req !== tadaReq) return;
    const today = dateKey();
    const study = studyRows(p, today, false);          // o estudo do dia vem do perfil público dele (nada a mais)
    const hasToday = days.some((d) => d.date === today);
    const groups = [...(hasToday || !study.length ? [] : [{ date: today, items: [], wrap: "" }]), ...days];
    box.innerHTML = groups.length === 0
      ? `<p class="muted">Nada registrado nos últimos dias.</p>`
      : groups.map((d) => {
        const items = d.items.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
        const st = d.date === today ? study : [];
        return `<p class="grDay">${d.date === today ? "Hoje" : esc(dayLabelShort(d.date))}</p>
          <div class="tSec">${st.map(studyRowHTML).join("")}${items.map(winRowHTML).join("")}
          ${d.wrap ? `<p class="tdFriendWrap" style="padding:6px 0">“${esc(d.wrap)}”</p>` : ""}</div>`;
      }).join("");
  } catch {
    if (req === tadaReq) box.innerHTML = `<p class="muted">Não consegui carregar a done-list.</p>`;
  }
}

/* ---------- gratidão do amigo (liberação própria, separada da done-list) ---------- */
let gratReq = 0;
async function renderFriendGrat(p) {
  const allowed = iCanSee(p, "gratSharedWith");
  $("friendGratSection").classList.toggle("hide", !allowed);
  $("friendNoGrat").textContent = allowed ? "" : `${first(p)} não liberou o diário de gratidão para você.`;
  if (!allowed) return;
  const box = $("friendGratList");
  box.innerHTML = `<p class="muted">Carregando…</p>`;
  const req = ++gratReq;
  try {
    const days = await fetchFriendGratitude(p.id, 14);
    if (req !== gratReq) return;
    box.innerHTML = days.length === 0
      ? `<p class="muted">Nenhuma gratidão registrada ainda.</p>`
      : days.map((d) => `<p class="grDay">${esc(dayLabelShort(d.date))}</p>
          <div class="tSec">${d.items.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).map(gratRowHTML).join("")}</div>`).join("");
  } catch {
    if (req === gratReq) box.innerHTML = `<p class="muted">Não consegui carregar o diário de gratidão.</p>`;
  }
}
