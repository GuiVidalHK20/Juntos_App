/* Aba "Ta-da": substitui a antiga aba Planejar.
   Em vez de listar o que você VAI fazer, ela registra o que você JÁ fez e o que te tocou — mesmo o mínimo.
   Três partes (sub-abas):
     ✨ Done-list   — a lista do que foi feito, em 3 estilos sobre os MESMOS dados:
                       ✍️ Corrida (digitar quando acontece) · ☑️ Marcar (um toque, sem escrever) · ⭐ Top 3 (fecho do dia)
     🙏 Gratidão    — pelo que sou grato e COMO isso afeta a minha vida (também perguntado depois de estudar)
     👥 Amigos      — o que quem da sala liberou fez hoje
   Dados e regras de privacidade: ver o topo de js/tada-data.js.
   O texto que está sendo digitado vive no próprio campo, que NÃO é redesenhado a cada atualização
   (só a lista embaixo é) — senão o que a pessoa escreve sumiria quando um dado chegasse do servidor. */
import { db, doc, updateDoc, arrayUnion, arrayRemove } from "./firebase.js";
import { store, on, emit } from "./store.js";
import {
  $, esc, toast, pad, todayKey, shiftDateKey, daysBetweenKeys, parseDateKey, weekdayOfKey, brNow, fmtHM,
  safeColor, avatarHTML, debounce
} from "./utils.js";
import { announce } from "./a11y.js";
import { morph, setText } from "./dom.js";
import { pop, grow, twirl } from "./motion.js";
import { GERAL, WEEKDAYS, WEEKDAYS_FULL, MONTHS } from "./constants.js";
import {
  WEIGHTS, weightOf, PRESET_GROUPS, MAX_ITEM, MAX_WRAP, MAX_WHAT, MAX_HOW,
  mine, startWatching, stopWatching, dayItems, dayWrap, dayGrat,
  addWin, removeWin, updateWin, toggleStar, toggleQuick, setWrap,
  addGratitude, removeGratitude, updateGratitude,
  studyRows, tadaStreak, iCanSee, fetchFriendTada,
  winRowHTML, studyRowHTML
} from "./tada-data.js";

/* ============================================================
   estado só de interface (nada disso vai para o Firestore)
============================================================ */
let sub = "done";            // "done" | "grat" | "hist" | "friends"
let histMod = null;          // js/tada-history.js, carregado só quando a pessoa abre o Histórico
let style = "corrida";       // "corrida" | "marcar" | "top3"
let selKey = null;           // dia visto na done-list (null = hoje)
let gratShowAll = false;
let slotStyle = null;        // qual estilo está montado em #tdBody (evita redesenhar o campo de texto)
let lastMembers = [];
const draft = { w: 1, s: null };   // peso e matéria da próxima conquista
const curKey = () => selKey || todayKey();
const isViewOpen = () => !$("view-tada")?.classList.contains("hide");

const STYLES = [
  { id: "corrida", ico: "✍️", name: "Corrida", hint: "Anote cada coisa quando acontecer, do jeito que vier. Pequeno também conta." },
  { id: "marcar", ico: "☑️", name: "Marcar", hint: "Sem escrever: toque no que você fez. O estudo do Cronômetro já entra sozinho." },
  { id: "top3", ico: "⭐", name: "Top 3", hint: "Fim do dia: escolha até 3 coisas que mais pesaram e feche com uma frase." }
];

/* ============================================================
   datas
============================================================ */
function dayLabel(k) {
  const d = daysBetweenKeys(todayKey(), k);
  if (d === 0) return "Hoje";
  if (d === -1) return "Ontem";
  const p = parseDateKey(k);
  return p ? `${WEEKDAYS[weekdayOfKey(k)]} ${pad(p[2])}/${pad(p[1])}` : k;
}
function dayLong(k) {
  const p = parseDateKey(k);
  return p ? `${WEEKDAYS_FULL[weekdayOfKey(k)]}, ${p[2]} de ${MONTHS[p[1] - 1]}` : k;
}
const timeOf = (ts) => (ts ? fmtHM(brNow(new Date(ts))) : "");
const allSubjects = () => [GERAL, ...store.subjects];

/* ============================================================
   folha (bottom sheet) — mesmo visual que o app já usa nos seletores
============================================================ */
export function openSheet(title) {
  const wrap = document.createElement("div");
  wrap.className = "modalWrap sheetWrap";
  wrap.innerHTML = `<div class="sheetBox" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheetGrip"></div>
    <div class="sheetHead"><p class="sheetTitle">${esc(title)}</p><button class="sheetClose" type="button" aria-label="Fechar">✕</button></div>
    <div class="sheetBody"></div></div>`;
  wrap.style.zIndex = 81;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  wrap.querySelector(".sheetClose").addEventListener("click", close);
  wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  return { body: wrap.querySelector(".sheetBody"), close };
}
const weightPills = (cur) => WEIGHTS.map((o) =>
  `<button type="button" class="pill ${o.w === cur ? "on" : ""}" data-w="${o.w}">${o.ico} ${o.name}<span class="pillSub"> · ${o.hint}</span></button>`).join("");

function pickSubject(cur, cb) {
  const sh = openSheet("Foi sobre alguma matéria?");
  sh.body.innerHTML = `<div class="pillGrid">
    <button type="button" class="pill ${cur ? "" : "on"}" data-id="">Nenhuma</button>
    ${allSubjects().map((s) => `<button type="button" class="pill ${cur === s.id ? "on" : ""}" data-id="${esc(s.id)}" style="--pc:${safeColor(s.color)}"><span class="dot"></span>${esc(s.name)}</button>`).join("")}</div>`;
  sh.body.querySelectorAll(".pill").forEach((b) => b.addEventListener("click", () => { cb(b.dataset.id || null); sh.close(); }));
}

function editWin(key, id) {
  const it = dayItems(key).find((x) => x.id === id);
  if (!it) return;
  let w = it.w || 1, armed = false;
  const sh = openSheet("Editar conquista");
  const draw = () => {
    sh.body.innerHTML = `
      <input class="f bigInput" maxlength="${MAX_ITEM}" value="${esc(it.t)}" aria-label="Texto da conquista">
      <p class="sheetLbl">O quanto isso te tocou</p>
      <div class="pillGrid">${weightPills(w)}</div>
      <div class="dActions">
        <button type="button" class="act danger" data-a="del">${armed ? "Toque de novo para excluir" : "🗑 Excluir"}</button>
        <button type="button" class="act" data-a="save">✓ Salvar</button>
      </div>`;
    sh.body.querySelectorAll("[data-w]").forEach((b) => b.addEventListener("click", () => { w = Number(b.dataset.w); const v = sh.body.querySelector("input").value; draw(); sh.body.querySelector("input").value = v; }));
    sh.body.querySelector('[data-a="del"]').addEventListener("click", () => {
      if (!armed) { armed = true; const v = sh.body.querySelector("input").value; draw(); sh.body.querySelector("input").value = v; return; }
      removeWin(key, id); sh.close(); toast("Removido.");
    });
    sh.body.querySelector('[data-a="save"]').addEventListener("click", () => {
      const t = sh.body.querySelector("input").value.trim();
      if (!t) { toast("A conquista precisa de um texto."); return; }
      updateWin(key, id, { t, w }); sh.close(); toast("Atualizado.");
    });
  };
  draw();
}

function editGrat(key, id) {
  const it = dayGrat(key).find((x) => x.id === id);
  if (!it) return;
  let armed = false;
  const sh = openSheet("Editar gratidão");
  const draw = (what = it.what, how = it.how || "") => {
    sh.body.innerHTML = `
      <label class="grLbl" for="egWhat">Sou grato por…</label>
      <textarea class="f modalInput" id="egWhat" rows="2" maxlength="${MAX_WHAT}">${esc(what)}</textarea>
      <label class="grLbl" for="egHow">Isso afeta a minha vida porque…</label>
      <textarea class="f modalInput" id="egHow" rows="3" maxlength="${MAX_HOW}">${esc(how)}</textarea>
      <div class="dActions">
        <button type="button" class="act danger" data-a="del">${armed ? "Toque de novo para excluir" : "🗑 Excluir"}</button>
        <button type="button" class="act" data-a="save">✓ Salvar</button>
      </div>`;
    const vals = () => [sh.body.querySelector("#egWhat").value, sh.body.querySelector("#egHow").value];
    sh.body.querySelector('[data-a="del"]').addEventListener("click", () => {
      if (!armed) { armed = true; draw(...vals()); return; }
      removeGratitude(key, id); sh.close(); toast("Removido.");
    });
    sh.body.querySelector('[data-a="save"]').addEventListener("click", () => {
      const [a, b] = vals();
      if (!a.trim()) { toast("Escreva pelo que você é grato."); return; }
      updateGratitude(key, id, { what: a, how: b }); sh.close(); toast("Atualizado.");
    });
  };
  draw();
}

/* ============================================================
   DONE-LIST — cabeçalho, faixa de dias, estilos
============================================================ */
function renderDayStrip() {
  const box = $("tdDays");
  if (!box || !store.profile) return;
  const cur = curKey(), today = todayKey();
  const keys = Array.from({ length: 7 }, (_, i) => shiftDateKey(today, i - 6));
  morph(box, keys.map((k) => {
    const n = dayItems(k).length + studyRows(store.profile, k, true).length;
    return `<button type="button" class="dayBtn ${k === cur ? "on" : ""}" data-k="${k}" aria-label="${esc(dayLong(k))}${n ? `, ${n} registros` : ""}">
      <span class="dW">${k === today ? "hoje" : WEEKDAYS[weekdayOfKey(k)]}</span>
      <span class="dN">${parseDateKey(k)[2]}</span>
      <span class="dC ${n ? "has" : ""}">${n || ""}</span></button>`;
  }).join(""), { animate: false });
  if (!box.__wired) {   // um único ouvinte (delegação): os botões continuam os mesmos entre atualizações
    box.__wired = true;
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".dayBtn");
      if (!b || !box.contains(b)) return;
      selKey = b.dataset.k === todayKey() ? null : b.dataset.k;
      renderDone();
    });
  }
  const on = box.querySelector(".dayBtn.on");
  if (on && !box.dataset.scrolled) { box.dataset.scrolled = "1"; on.scrollIntoView({ inline: "center", block: "nearest" }); }
}

function renderDayHead() {
  const el = $("tdHead");
  if (!el || !store.profile) return;
  const k = curKey();
  const wins = dayItems(k), study = studyRows(store.profile, k, true);
  const n = wins.length + study.length;
  const stk = tadaStreak();
  const parts = [n === 0 ? "Nada registrado ainda" : `${n} ${n === 1 ? "registro" : "registros"}`];
  if (k === todayKey() && stk > 1) parts.push(`🔥 ${stk} dias seguidos`);
  const tier = n === 0 ? 0 : n < 4 ? 1 : n < 8 ? 2 : 3;
  morph(el, `<div class="dayHeadTxt">
      <p class="dayTitle">${esc(["Hoje", "Ontem"].includes(dayLabel(k)) ? dayLabel(k) : WEEKDAYS_FULL[weekdayOfKey(k)])}</p>
      <p class="daySub">${esc(dayLong(k))}</p>
      <p class="daySub">${esc(parts.join(" · "))}</p></div>
    <div class="tdBig" aria-hidden="true">${["🌤️", "🌱", "🌿", "🌳"][tier]}</div>`, { animate: false });
  // subiu de nível (🌱→🌿→🌳)? o emoji cresce com uma mola; trocar de dia só atualiza, sem festa
  if (el.__tier !== undefined && el.__day === k && tier > el.__tier) grow(el.querySelector(".tdBig"), tier);
  el.__tier = tier; el.__day = k;
}

function renderStyleTabs() {
  const box = $("tdStyles");
  if (!box) return;
  morph(box, STYLES.map((s) => `<button type="button" class="tdStyleBtn ${s.id === style ? "on" : ""}" data-s="${s.id}">
    <span class="tdStyleIco">${s.ico}</span><span class="tdStyleName">${s.name}</span></button>`).join(""), { animate: false });
  if (!box.__wired) {
    box.__wired = true;
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".tdStyleBtn");
      if (!b || !box.contains(b)) return;
      style = b.dataset.s; renderDone();
    });
  }
  setText($("tdStyleHint"), STYLES.find((s) => s.id === style).hint);
}

export function renderDone() {
  if (!store.profile) return;
  renderDayStrip();
  renderDayHead();
  renderStyleTabs();
  if (slotStyle !== style) { buildStyleSkeleton(); slotStyle = style; }
  renderStyleList();
}

/* ---------- esqueleto de cada estilo (montado UMA vez; o campo de texto não é redesenhado) ---------- */
function buildStyleSkeleton() {
  const body = $("tdBody");
  if (style === "corrida") {
    body.innerHTML = `
      <div class="planComposer">
        <div class="composerRow">
          <input class="composerInput" id="tdText" maxlength="${MAX_ITEM}" autocomplete="off" placeholder="O que você fez? Mesmo pequeno conta." aria-label="Adicionar o que você fez">
          <button class="composerAdd" id="tdAdd" type="button" aria-label="Adicionar">＋</button>
        </div>
        <div class="chipRow" id="tdChips"></div>
      </div>
      <div id="tdList"></div>`;
    $("tdAdd").addEventListener("click", addFromComposer);
    $("tdText").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addFromComposer(); } });
    renderComposerChips();
  } else if (style === "marcar") {
    body.innerHTML = `<div id="tdList"></div>`;
  } else {
    body.innerHTML = `<div id="tdList"></div>
      <div class="tdWrap">
        <label class="tdWrapLbl" for="tdWrapIn">Em uma frase: como foi este dia?</label>
        <textarea class="f modalInput" id="tdWrapIn" rows="2" maxlength="${MAX_WRAP}" placeholder="Ex: cansado, mas cumpri o que importava."></textarea>
        <p class="fineprint" id="tdWrapCount" style="margin:4px 2px 0"></p>
      </div>`;
    const inp = $("tdWrapIn");
    inp.value = dayWrap(curKey());
    inp.dataset.key = curKey();
    // a chave do dia vai junto: se a pessoa trocar de dia antes de gravar, o texto vai para o dia certo
    const save = debounce((k, v) => setWrap(k, v), 700);
    inp.addEventListener("input", () => { $("tdWrapCount").textContent = `${inp.value.length}/${MAX_WRAP}`; save(inp.dataset.key, inp.value); });
  }
}
function renderComposerChips() {
  const box = $("tdChips");
  if (!box) return;
  const s = draft.s ? allSubjects().find((x) => x.id === draft.s) : null;
  morph(box, WEIGHTS.map((o) =>
    `<button type="button" class="cChip wChip ${o.w === draft.w ? "set" : ""}" data-w="${o.w}" title="${esc(o.hint)}"><span class="wIco">${o.ico}</span> ${o.name}</button>`).join("")
    + `<button type="button" class="cChip ${s ? "ref" : ""}" data-c="subj" ${s ? `style="--pc:${safeColor(s.color)}"` : ""}>${s ? `<span class="dot"></span>📚 ${esc(s.name)}` : "📚 Matéria (opcional)"}</button>`, { animate: false });
  if (!box.__wired) {
    box.__wired = true;
    box.addEventListener("click", (e) => {
      const w = e.target.closest("[data-w]");
      if (w && box.contains(w)) {
        const changed = draft.w !== Number(w.dataset.w);
        draft.w = Number(w.dataset.w); renderComposerChips();
        if (changed) grow(box.querySelector(".wChip.set .wIco"), draft.w);   // o emoji cresce junto com o peso
        return;
      }
      if (e.target.closest('[data-c="subj"]')) pickSubject(draft.s, (id) => { draft.s = id; renderComposerChips(); });
    });
  }
}

function addFromComposer() {
  const inp = $("tdText");
  const text = inp.value.trim();
  if (!text) { toast("Escreva o que você fez — pode ser bem pequeno."); inp.focus(); return; }
  const item = addWin({ text, w: draft.w, s: draft.s }, curKey());
  if (!item) { toast("Limite de registros do dia atingido."); return; }
  inp.value = ""; draft.w = 1;
  renderComposerChips();
  announce(`Registrado: ${text}.`);
  toast("Ta-da! ✨", { silent: true });
  inp.focus();
}

/* ---------- lista de cada estilo ---------- */
function sectionStudy(k) {
  const rows = studyRows(store.profile, k, true);
  return rows.length
    ? `<div class="tSec"><div class="tSecHead"><span>📚 Seu estudo · automático</span></div>${rows.map(studyRowHTML).join("")}</div>` : "";
}

function renderStyleList() {
  const box = $("tdList");
  if (!box) return;
  const k = curKey();
  const html = style === "corrida" ? corridaHTML(k) : style === "marcar" ? marcarHTML(k) : top3HTML(k);
  // mesma tela (mesmo dia e estilo) → só o que mudou é atualizado, e o que é novo entra animado;
  // tela diferente → monta de uma vez, sem animar cada linha
  const sig = `${style}|${k}`;
  morph(box, html, { animate: box.__sig === sig });
  box.__sig = sig;
  if (!box.__wired) { box.__wired = true; wireList(box); }
  if (style === "top3") {
    const inp = $("tdWrapIn");
    // só troca o texto se a pessoa mudou de dia ou não está digitando agora
    if (inp && (inp.dataset.key !== k || document.activeElement !== inp)) { inp.value = dayWrap(k); inp.dataset.key = k; }
    if (inp) $("tdWrapCount").textContent = inp.value ? `${inp.value.length}/${MAX_WRAP}` : "";
  }
}

function emptyHTML(msg) {
  return `<div class="tEmpty"><p class="tEmptyIco">🌤️</p><p class="tEmptyT">${msg}</p>
    <p class="muted">Tudo que você faz e que te toca, mesmo de leve, entra aqui.</p></div>`;
}

function winRowInteractive(x, { star = false } = {}) {
  const wt = weightOf(x.w), s = x.s ? allSubjects().find((y) => y.id === x.s) : null;
  return `<div class="tdRow ${x.star ? "star" : ""}" data-k="${esc(x.id)}">
    <button type="button" class="tdBody" data-edit="${esc(x.id)}" aria-label="Editar: ${esc(x.t)}">
      <span class="tdW" title="${esc(wt.name)}">${wt.ico}</span>
      <span class="tdMain"><span class="tdT">${esc(x.t)}</span>
        <span class="tdMeta">${x.ts ? `<span class="mTime">${esc(timeOf(x.ts))}</span>` : ""}${s ? `<span class="tdTag"><i style="background:${safeColor(s.color)}"></i>${esc(s.name)}</span>` : ""}</span></span>
    </button>
    ${star ? `<button type="button" class="tdStarBtn ${x.star ? "on" : ""}" data-star="${esc(x.id)}" aria-pressed="${!!x.star}" aria-label="${x.star ? "Tirar dos destaques" : "Marcar como destaque do dia"}">${x.star ? "⭐" : "☆"}</button>` : ""}
  </div>`;
}

function corridaHTML(k) {
  const wins = dayItems(k);
  const study = sectionStudy(k);
  if (!wins.length && !study) return emptyHTML(k === todayKey() ? "Seu dia ainda está em branco." : "Nada registrado neste dia.");
  return study + (wins.length ? `<div class="tSec">${wins.slice().reverse().map((x) => winRowInteractive(x)).join("")}</div>` : "");
}

function marcarHTML(k) {
  const wins = dayItems(k);
  const quick = new Set(wins.filter((x) => x.k === "quick").map((x) => x.q));
  const free = wins.filter((x) => x.k !== "quick");
  return sectionStudy(k)
    + PRESET_GROUPS.map((g) => `<div class="qkGroup"><p class="qkHead">${g.ico} ${esc(g.name)}</p>
        <div class="qkGrid">${g.items.map((i) => `<button type="button" class="qkBtn ${quick.has(i.id) ? "on" : ""}" data-q="${i.id}" aria-pressed="${quick.has(i.id)}"><span class="qkIco">${i.ico}</span><span>${esc(i.t)}</span><span class="qkTick">✓</span></button>`).join("")}</div></div>`).join("")
    + (free.length ? `<p class="muted" style="margin:14px 2px 0">＋ ${free.length} ${free.length === 1 ? "registro escrito" : "registros escritos"} neste dia (veja em ✍️ Corrida).</p>` : "");
}

function top3HTML(k) {
  const wins = dayItems(k);
  const stars = wins.filter((x) => x.star);
  const hero = `<div class="tdHero"><p class="tdHeroK">⭐ O que mais pesou ${k === todayKey() ? "hoje" : "neste dia"}</p>
    ${stars.length ? stars.map((x) => `<p class="tdHeroItem">${weightOf(x.w).ico} ${esc(x.t)}</p>`).join("") : `<p class="muted" style="margin:0">Toque na ☆ ao lado de até 3 registros abaixo.</p>`}
    <p class="fineprint" style="margin:8px 0 0">${stars.length}/3 destaques</p></div>`;
  const list = wins.length
    ? `<div class="tSec">${wins.slice().reverse().map((x) => winRowInteractive(x, { star: true })).join("")}</div>`
    : `<p class="muted" style="margin:10px 2px">Ainda não há registros neste dia — comece por ✍️ Corrida ou ☑️ Marcar.</p>`;
  return hero + sectionStudy(k) + list;
}

// UM ouvinte por lista (delegação): as linhas são atualizadas no lugar (morph), então ouvintes por botão se perderiam/duplicariam
function wireList(box) {
  box.addEventListener("click", (e) => {
    const k = curKey();
    const ed = e.target.closest("[data-edit]");
    if (ed && box.contains(ed)) { editWin(k, ed.dataset.edit); return; }
    const q = e.target.closest("[data-q]");
    if (q && box.contains(q)) {
      const id = q.dataset.q, wasOn = q.classList.contains("on");
      toggleQuick(k, id);
      announce(wasOn ? "Desmarcado." : "Marcado.");
      const nb = box.querySelector(`.qkBtn[data-q="${id}"]`);   // o MESMO botão (o morph não o recria): a mola roda nele
      if (nb && !wasOn) { pop(nb, 0.9, 480); pop(nb.querySelector(".qkTick"), 0.1, 620); grow(nb.querySelector(".qkIco"), 2); }
      return;
    }
    const st = e.target.closest("[data-star]");
    if (st && box.contains(st)) {
      const id = st.dataset.star;
      if (!toggleStar(k, id)) { toast("Você já tem 3 destaques. Tire um para escolher outro."); return; }
      const nb = box.querySelector(`[data-star="${id}"]`);
      if (nb?.classList.contains("on")) twirl(nb);
    }
  });
}

/* ============================================================
   GRATIDÃO
============================================================ */
const GRAT_STARTERS = ["Uma pessoa", "Algo que aprendi", "Meu corpo", "Um momento de hoje", "Uma oportunidade"];

function buildGratComposer() {
  const box = $("tdGratComposer");
  if (!box || box.dataset.built) return;
  box.dataset.built = "1";
  box.innerHTML = `
    <div class="planComposer grBox">
      <div class="reflChips" role="group" aria-label="Ideias para começar">${GRAT_STARTERS.map((s, i) => `<button type="button" data-st="${i}">${esc(s)}</button>`).join("")}</div>
      <label class="grLbl" for="tdGrWhat">Sou grato por…</label>
      <textarea class="f modalInput" id="tdGrWhat" rows="2" maxlength="${MAX_WHAT}" placeholder="Ex: a conversa que tive com minha mãe hoje"></textarea>
      <label class="grLbl" for="tdGrHow">Isso afeta a minha vida porque…</label>
      <textarea class="f modalInput" id="tdGrHow" rows="3" maxlength="${MAX_HOW}" placeholder="Ex: me lembra que não estou sozinho e me dá força para continuar"></textarea>
      <button type="button" class="save bigSave grSave" id="tdGrSave">🙏 Guardar gratidão</button>
    </div>`;
  box.querySelectorAll("[data-st]").forEach((b) => b.addEventListener("click", () => {
    const w = $("tdGrWhat"); w.value = `${GRAT_STARTERS[Number(b.dataset.st)].toLowerCase()}: `;
    w.focus(); w.setSelectionRange(w.value.length, w.value.length);
  }));
  $("tdGrSave").addEventListener("click", () => {
    const what = $("tdGrWhat").value.trim();
    if (!what) { toast("Escreva pelo que você é grato."); $("tdGrWhat").focus(); return; }
    const it = addGratitude({ what, how: $("tdGrHow").value, src: "free" }, todayKey());
    if (!it) { toast("Limite de gratidões do dia atingido."); return; }
    $("tdGrWhat").value = ""; $("tdGrHow").value = "";
    toast("Gratidão guardada. 🙏");
  });
}

export function renderGrat() {
  if (!store.profile) return;
  buildGratComposer();
  const list = $("tdGratList");
  if (!list) return;
  const today = todayKey();
  const keys = Object.keys(mine.grat).filter((k) => mine.grat[k].items?.length).sort().reverse();
  const todayItems = dayGrat(today);
  const past = keys.filter((k) => k !== today);
  const shown = gratShowAll ? past : past.slice(0, 7);
  const row = (k, g) => `<button type="button" class="grRowBtn" data-ge="${esc(k)}|${esc(g.id)}" aria-label="Editar gratidão">
      <span class="grWhat">🙏 ${esc(g.what)}</span>${g.how ? `<span class="grHow">${esc(g.how)}</span>` : ""}
      <span class="grMeta">${g.ts ? esc(timeOf(g.ts)) : ""}${g.src === "study" && g.sn ? ` <span class="tdTag"><i style="background:${safeColor(g.sc)}"></i>depois de estudar ${esc(g.sn)}</span>` : ""}</span></button>`;
  list.innerHTML = `
    <p class="sechead">hoje</p>
    ${todayItems.length ? `<div class="tSec">${todayItems.slice().reverse().map((g) => row(today, g)).join("")}</div>`
      : `<p class="muted" style="margin:0 2px 14px">Nenhuma gratidão hoje ainda. Uma só já muda o clima do dia.</p>`}
    ${shown.length ? `<p class="sechead" style="margin-top:22px">dias anteriores</p>` : ""}
    ${shown.map((k) => `<p class="grDay">${esc(dayLabel(k))} · ${esc(dayLong(k))}</p><div class="tSec">${dayGrat(k).slice().reverse().map((g) => row(k, g)).join("")}</div>`).join("")}
    ${!gratShowAll && past.length > 7 ? `<button type="button" class="linkish" id="tdGratMore">Mostrar mais dias</button>` : ""}`;
  list.querySelectorAll("[data-ge]").forEach((b) => b.addEventListener("click", () => { const [k, id] = b.dataset.ge.split("|"); editGrat(k, id); }));
  $("tdGratMore")?.addEventListener("click", () => { gratShowAll = true; renderGrat(); });
}

/* ============================================================
   AMIGOS — o que quem liberou fez hoje
============================================================ */
const friendCache = {};   // id -> { at, day }
const FRIEND_TTL = 60 * 1000;
let friendsReq = 0;

function memberCardHTML(m, state) {
  const first = String(m.name || "Amigo").split(" ")[0];
  const study = studyRows({ ...m }, todayKey(), false);
  let body;
  if (!iCanSee(m, "tadaSharedWith")) {
    body = `<p class="muted" style="margin:6px 0 0">${esc(first)} ainda não liberou a done-list para você.</p>`;
  } else if (!state) {
    body = `<p class="muted" style="margin:6px 0 0">Carregando…</p>`;
  } else if (state.error) {
    body = `<p class="muted" style="margin:6px 0 0">Não consegui carregar agora.</p>`;
  } else {
    const items = state.items.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const stars = items.filter((x) => x.star);
    const top = (stars.length ? stars : items).slice(0, 4);
    body = `${study.map(studyRowHTML).join("")}${top.map(winRowHTML).join("")}
      ${!study.length && !top.length ? `<p class="muted" style="margin:6px 0 0">Nada registrado hoje ainda.</p>` : ""}
      ${items.length > top.length ? `<p class="fineprint" style="margin:6px 0 0">+ ${items.length - top.length} no perfil</p>` : ""}
      ${state.wrap ? `<p class="tdFriendWrap">“${esc(state.wrap)}”</p>` : ""}`;
  }
  const grat = iCanSee(m, "gratSharedWith") ? ` <span class="tdTag">🙏 gratidão liberada</span>` : "";
  return `<button type="button" class="tdFriend" data-fid="${esc(m.id)}" aria-label="Abrir perfil de ${esc(m.name || "amigo")}">
    <span class="tdFriendHead">${avatarHTML(m, { size: 34 })}<span class="tdFriendName">${esc(m.name || "Amigo")}${grat}</span><span class="chev">›</span></span>
    <span class="tdFriendBody">${body}</span></button>`;
}

export async function renderFriends(force = false) {
  const box = $("tdFriendsList");
  if (!box || !store.profile) return;
  if (!store.profile.roomCode) {
    box.innerHTML = `<div class="tEmpty"><p class="tEmptyIco">👥</p><p class="tEmptyT">Entre numa sala para ver seus amigos.</p>
      <p class="muted">Aqui aparece o que cada pessoa da sua sala liberou para você.</p></div>`;
    return;
  }
  const others = lastMembers.filter((m) => m.id !== store.me?.uid);
  if (!others.length) { box.innerHTML = `<p class="muted">Ainda não tem mais ninguém na sua sala.</p>`; return; }
  const today = todayKey();
  const draw = () => {
    box.innerHTML = others.map((m) => memberCardHTML(m, friendCache[m.id]?.day)).join("");
    box.querySelectorAll("[data-fid]").forEach((b) => b.addEventListener("click", () => emit("openFriend", b.dataset.fid)));
  };
  draw();
  const req = ++friendsReq;
  const stale = others.filter((m) => iCanSee(m, "tadaSharedWith") && (force || !friendCache[m.id] || Date.now() - friendCache[m.id].at > FRIEND_TTL));
  if (!stale.length) return;
  await Promise.all(stale.map(async (m) => {
    try { friendCache[m.id] = { at: Date.now(), day: await fetchFriendTada(m.id, today) }; }
    catch { friendCache[m.id] = { at: Date.now(), day: { error: true, items: [] } }; }
  }));
  if (req === friendsReq && sub === "friends" && isViewOpen()) draw();
}

/* ============================================================
   Ajustes → quem pode ver (done-list e gratidão, listas separadas)
============================================================ */
export function renderTadaSharing(members) {
  if (members) lastMembers = members;
  const make = (boxId, field, label, onMsg, offMsg) => {
    const box = $(boxId);
    if (!box || !store.profile) return;
    if (!store.profile.roomCode) { box.innerHTML = `<p class="muted">Entre numa sala para poder liberar para alguém.</p>`; return; }
    const others = lastMembers.filter((m) => m.id !== store.me?.uid);
    if (!others.length) { box.innerHTML = `<p class="muted">Ainda não tem mais ninguém na sua sala.</p>`; return; }
    const shared = store.profile[field] || [];
    box.innerHTML = others.map((m) => `
      <div class="notifBox" style="margin-top:10px">
        <label class="switch"><input type="checkbox" class="shareTgl" data-f="${field}" data-id="${esc(m.id)}" ${shared.includes(m.id) ? "checked" : ""} aria-label="${esc(m.name)} ${label}"><span class="slider"></span></label>
        <div><p style="margin:0;font-size:13px">${esc(m.name)} ${label}</p></div>
      </div>`).join("");
    box.querySelectorAll(".shareTgl").forEach((cb) => cb.addEventListener("change", async (e) => {
      const id = e.target.dataset.id, f = e.target.dataset.f, onNow = e.target.checked;
      const cur = store.profile[f] || [];
      store.profile = { ...store.profile, [f]: onNow ? [...cur, id] : cur.filter((x) => x !== id) };   // otimista
      toast(onNow ? onMsg : offMsg);
      delete friendCache[id];
      await updateDoc(doc(db, "users", store.me.uid), { [f]: onNow ? arrayUnion(id) : arrayRemove(id) }).catch(() => {});
    }));
  };
  make("tadaShareList", "tadaSharedWith", "pode ver minha done-list", "Done-list liberada.", "Done-list não é mais compartilhada.");
  make("gratShareList", "gratSharedWith", "pode ver minha gratidão", "Gratidão liberada.", "Gratidão não é mais compartilhada.");
  if (sub === "friends" && isViewOpen()) renderFriends();
}

/* ============================================================
   render geral + sub-abas
============================================================ */
export function renderTada() {
  if (!store.profile) return;
  if (sub === "done") renderDone();
  else if (sub === "grat") renderGrat();
  else if (sub === "hist") histMod?.renderHistory();
  else renderFriends();
}

// abre a done-list em um dia (usado pelo Histórico: "Abrir na Done-list"); só vale para os dias da faixa de 7 dias
export function goToDay(key) {
  const today = todayKey();
  const d = daysBetweenKeys(key, today);
  selKey = key === today || !(d >= 0 && d <= 6) ? null : key;
  setSub("done");
}

async function openHistory() {
  try {
    if (!histMod) histMod = await import("./tada-history.js");
    if (sub === "hist") histMod.renderHistory();
  } catch {
    toast("Não consegui abrir o histórico agora. Tente de novo.");
  }
}

function setSub(v) {
  sub = v;
  document.querySelectorAll(".tdSubTab").forEach((b) => b.classList.toggle("on", b.dataset.tsub === v));
  $("tdDone").classList.toggle("hide", v !== "done");
  $("tdGrat").classList.toggle("hide", v !== "grat");
  $("tdFriends").classList.toggle("hide", v !== "friends");
  $("tdHist")?.classList.toggle("hide", v !== "hist");
  if (v === "friends") renderFriends(true);
  else if (v === "hist") { if (histMod) histMod.renderHistory(); else openHistory(); }
  else renderTada();
}

export function initTada() {
  document.querySelectorAll(".tdSubTab").forEach((b) => b.addEventListener("click", () => setSub(b.dataset.tsub)));
  $("tdFriendsRefresh")?.addEventListener("click", () => renderFriends(true));
  $("tdFriendsSettings")?.addEventListener("click", () => $("gearBtn")?.click());

  on("members:update", (members) => { lastMembers = members; renderTadaSharing(members); });
  // os dados que chegam do servidor redesenham a aba (menos "Amigos", que só depende dos dados dos amigos)
  on("tada:changed", () => { if (isViewOpen() && sub !== "friends") renderTada(); });
  // os ouvintes do Firestore sobem quando o login termina e descem quando a pessoa sai
  on("auth:ready", () => startWatching());
  on("auth:changed", ({ user }) => { if (!user) { stopWatching(); slotStyle = null; histMod?.resetHistory(); } });
  // virou o dia com o app aberto: volta para "hoje"
  let lastDay = todayKey();
  setInterval(() => { const t = todayKey(); if (t !== lastDay) { lastDay = t; selKey = null; if (isViewOpen()) renderTada(); } }, 60000);
}
