/* Movimento e reações do Juntos (v2.12) — a parte JS do "visual cinematográfico".
   O resto fica no CSS do index.html (bloco "MOVIMENTO CINEMATOGRÁFICO"). Aqui moram só as coisas
   que CSS puro não faz: onda no ponto exato do toque, confete, entrada em cascata das telas,
   contagem dos números e o estado visual do cronômetro.

   Regras deste módulo:
   - Nada aqui mexe em dado, Firestore ou lógica do app: é só camada visual por cima.
   - Tudo desliga com "reduzir movimento" do sistema OU com Ajustes → Aparência → Animações: Suave.
     A preferência é só do aparelho (localStorage), por isso não vai pro Firestore.
   - Só anima transform/opacity (e cor via CSS): nada que force o navegador a recalcular layout.
   - Sem dependências: usa Web Animations API, que já vem no navegador. */
import { on } from "./store.js";
import { toast } from "./utils.js";
import { getUx } from "./ux.js";

const FX_KEY = "juntos.fx.v1";
const reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

let mode = "full";
try { const v = localStorage.getItem(FX_KEY); mode = v === "lite" || v === "off" ? v : "full"; } catch {}
let lastOn = mode === "off" ? "full" : mode; // para onde voltar ao religar as animações

const motionOK = () => mode === "full" && !(reduceMQ && reduceMQ.matches);
// 2.22 — outros módulos (motion.js, dom.js) só animam no modo completo; "Suave" e "reduzir movimento" ficam como estão
export const fxFull = motionOK;
// "off" = a pessoa desligou TODAS as animações (botão rápido na tela principal ou Ajustes)
export const getFxMode = () => mode;
// usado por outros módulos (ex.: wallpaper.js) para também respeitarem "reduzir movimento"
export const motionAllowed = () => mode !== "off" && !(reduceMQ && reduceMQ.matches);

/* ---------- modo (Cinema / Suave) ---------- */
function paintFxButtons() {
  document.querySelectorAll(".fxBtn").forEach((b) => b.classList.toggle("on", b.dataset.fx === mode));
}
export function applyFx(next) {
  const prev = mode;
  mode = next === "lite" ? "lite" : next === "off" ? "off" : "full";
  if (prev !== "off") lastOn = prev;
  document.documentElement.dataset.fx = mode === "off" ? "lite" : mode;
  syncMotionPreference();
  document.dispatchEvent(new CustomEvent("juntos:fxmode", { detail: { mode } }));
  try { localStorage.setItem(FX_KEY, mode); } catch {}
  paintFxButtons();
}

/* ---------- conclusão suave (2.17): luz quente que sobe e some em ~3 s ---------- */
function warmGlow() {
  if (!motionOK()) return;   // com animações desligadas, o tom de conclusão (timer.js) já avisa
  const el = document.createElement("i");
  el.className = "fx-glow";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:300;" +
    "background:radial-gradient(ellipse at 50% 42%,rgba(255,184,112,.30),rgba(255,160,90,.08) 55%,transparent 80%)";
  document.body.appendChild(el);
  const a = el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }],
    { duration: 3200, easing: "ease-in-out", fill: "forwards" });
  a.onfinish = a.oncancel = () => el.remove();
}

/* ---------- partículas (confete) ---------- */
const PALETTE = ["#2FD9EE", "#A78BFA", "#22D3A6", "#F5B93D", "#F4608C", "#FF9A4D"];
let alive = 0;            // teto de partículas na tela ao mesmo tempo (protege aparelho fraco)
const MAX_ALIVE = 90;

function piece(x, y, color, frames, duration) {
  if (alive >= MAX_ALIVE || !motionOK()) return;
  const el = document.createElement("i");
  el.className = "fx-p";
  const size = 5 + Math.random() * 6;
  el.style.cssText =
    `left:${x}px;top:${y}px;width:${size}px;height:${size * (Math.random() < 0.4 ? 2.2 : 1)}px;` +
    `background:${color};border-radius:${Math.random() < 0.5 ? "50%" : "2px"}`;
  document.body.appendChild(el);
  alive++;
  const anim = el.animate(frames, { duration, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
  const done = () => { el.remove(); alive = Math.max(0, alive - 1); };
  anim.onfinish = done; anim.oncancel = done;
}

/* explosão curta a partir de um ponto (botões principais, tarefa concluída) */
export function burst(x, y, { colors = PALETTE, count = 12, spread = 60 } = {}) {
  if (!motionOK()) return;
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = spread * (0.5 + Math.random() * 0.8);
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 14;
    const rot = (Math.random() - 0.5) * 540;
    piece(x, y, colors[i % colors.length], [
      { transform: "translate(-50%,-50%) scale(.2)", opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(calc(-50% + ${dx * 1.1}px),calc(-50% + ${dy + 34}px)) rotate(${rot * 1.3}deg) scale(.6)`, opacity: 0 }
    ], 650 + Math.random() * 350);
  }
}

/* chuva de confete de cima da tela (fim de um ciclo de foco) */
function confettiRain(n = 44) {
  if (!motionOK()) return;
  const w = window.innerWidth, h = window.innerHeight;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w;
    const sway = (Math.random() - 0.5) * 140;
    const rot = (Math.random() - 0.5) * 900;
    setTimeout(() => piece(x, -12, PALETTE[i % PALETTE.length], [
      { transform: "translate(-50%,0) rotate(0deg)", opacity: 1 },
      { transform: `translate(calc(-50% + ${sway}px),${h * 0.55}px) rotate(${rot}deg)`, opacity: 1, offset: 0.7 },
      { transform: `translate(calc(-50% + ${sway * 1.4}px),${h * 0.8}px) rotate(${rot * 1.3}deg)`, opacity: 0 }
    ], 1700 + Math.random() * 900), Math.random() * 450);
  }
}

/* ---------- onda no ponto do toque ---------- */
// lista explícita (e não "todo button") de propósito: botões minúsculos de ícone, de
// fechar e de editar ficam sem onda, pra não parecer exagero.
const RIPPLE_SEL = [
  ".primary", ".ghost", ".round", ".save", ".chip", ".microBtn", ".qBtn", ".qChip", ".cChip", ".pill", ".act",
  ".rowBtn", ".qkBtn", ".tdStyleBtn", ".btnOutline", ".gearBtn", ".quotesBtn", ".composerAdd",
  ".dayBtn", ".bigSave", ".roomChip", ".rowbtn", ".backBtn", ".sheetClose",
  ".wkArrow", ".wkClose", ".statsSubTab", ".gbtn", "nav button", ".modes button",
  ".tdSubTabs button", ".hxSeg button", ".composer button", ".quickmsgs button", ".yearNav button",
  ".joinrow button", ".go", ".wrappedRow button", "button.weekrow"
].join(",");

function onPointerDown(e) {
  if (!motionOK() || e.button > 0) return;
  const host = e.target.closest ? e.target.closest(RIPPLE_SEL) : null;
  if (!host || host.disabled) return;
  const r = host.getBoundingClientRect();
  if (!r.width || !r.height) return;
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.style.overflow = "hidden"; // a onda não pode vazar pra fora da forma do botão
  const size = Math.max(r.width, r.height) * 2.2;
  const span = document.createElement("span");
  span.className = "fx-rip";
  span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
  host.appendChild(span);
  span.addEventListener("animationend", () => span.remove(), { once: true });
  setTimeout(() => span.remove(), 1000); // rede de segurança se a animação for cancelada
}

/* ---------- confete nos botões que "valem a comemoração" ---------- */
function onClick(e) {
  if (!motionOK() || !e.target.closest) return;
  const t = e.target.closest("button.qkBtn,.primary,.composerAdd,.bigSave,.save,.go,.rowbtn");
  if (!t || t.disabled) return;
  const isCheck = t.classList.contains("qkBtn");
  if (isCheck && t.classList.contains("on")) return; // desmarcando uma vitória: sem festa
  // este listener roda antes do do app (fase de captura): "on" ainda é o estado ANTERIOR
  const r = t.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  if (isCheck) {
    const c = getComputedStyle(t).getPropertyValue("--rc").trim();
    burst(x, y, { colors: c ? [c, c, "#FFFFFF", "#F5B93D"] : PALETTE, count: 18, spread: 72 });
  } else if (t.classList.contains("primary")) {
    burst(x, y, { count: 12, spread: 64 });
  } else {
    burst(x, y, { count: 8, spread: 44 });
  }
}

/* ---------- entrada cinematográfica das telas ---------- */
const COUNT_SEL = ".stat .v b,.streakCard .big,.dayRecapStat .v,.hxKpi .v,.wkV,.recordCard .rv b,.consNum b";

/* "2h 30min" → anima só os números (0→2, 0→30) e termina exatamente no texto original,
   então formato, unidade e acentos nunca mudam — só a contagem aparece. */
export function countUp(root, sel = COUNT_SEL) {
  let k = 0;
  root.querySelectorAll(sel).forEach((el) => {
    if (el.children.length) return;
    const original = el.textContent;
    if (!/\d/.test(original)) return;
    const parts = original.split(/(\d+)/);
    const start = performance.now() + 120 + k++ * 70;
    const total = 950;
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / total));
      if (!el.isConnected) return;
      if (t >= 1) { el.textContent = original; return; }
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = parts.map((p, i) => (i % 2 ? String(Math.round(Number(p) * eased)) : p)).join("");
      requestAnimationFrame(step);
    };
    el.textContent = parts.map((p, i) => (i % 2 ? "0" : p)).join("");
    requestAnimationFrame(step);
  });
}

export function playViewIntro(view, restart = false) {
  if (!view || !motionOK()) return;
  let n = 0;
  for (const c of view.children) {
    if (c.classList.contains("hide")) continue;
    c.style.setProperty("--n", String(Math.min(n++, 9)));
  }
  // Tela que acabou de sair de display:none já recomeça a animação sozinha. O reflow forçado (offsetWidth) custava
  // ~50 ms por troca e só é necessário ao reabrir a MESMA tela, que não passou por display:none.
  if (restart) { view.classList.remove("cine-stage"); void view.offsetWidth; }
  view.classList.add("cine-stage");
  clearTimeout(view._cineT);
  view._cineT = setTimeout(() => view.classList.remove("cine-stage"), 1700);
  countUp(view);
}

/* ---------- init ---------- */
// "Reduzir movimento" (iOS/Android/Windows/macOS) vale ao vivo: se a pessoa ligar com o app aberto,
// o que estiver se mexendo para na hora (confete, ondas) e nada novo começa. Interfaces com
// movimento podem causar tontura, náusea e fadiga em quem tem distúrbios vestibulares ou enxaqueca.
function syncMotionPreference() {
  const reduced = !!(reduceMQ && reduceMQ.matches);
  document.documentElement.dataset.motion = mode === "off" ? "off" : reduced ? "reduced" : "full";
  if (reduced || mode === "off") {
    document.querySelectorAll(".fx-p,.fx-rip").forEach((el) => el.remove());
    document.body.classList.remove("timerRunning");
    alive = 0;
  }
}

// alterna "sem animações" ↔ o modo anterior (usado pelo botão rápido da tela principal)
export function toggleMotionOff() { applyFx(mode === "off" ? lastOn : "off"); return mode; }

export function initFx() {
  document.documentElement.dataset.fx = mode === "off" ? "lite" : mode;
  syncMotionPreference();
  if (reduceMQ) {
    if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", syncMotionPreference);
    else if (reduceMQ.addListener) reduceMQ.addListener(syncMotionPreference); // Safari antigo
  }
  paintFxButtons();

  document.querySelectorAll(".fxBtn").forEach((b) => b.addEventListener("click", () => {
    applyFx(b.dataset.fx);
    toast(mode === "full" ? "Animações: Cinema ligado." : mode === "off" ? "Animações desligadas." : "Animações: modo Suave.");
    if (mode === "full") playViewIntro(document.getElementById("view-settings"));
  }));

  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("click", onClick, true);

  // cronômetro rodando → anel respira e um brilho percorre o círculo (CSS, por classe no body)
  on("timer:tick", (s) => {
    document.body.classList.toggle("timerRunning", !!s.running && motionOK());
    document.body.classList.toggle("onBreak", s.phase === "break" || s.phase === "longBreak");
  });
  // fim de um ciclo (emitido por timer.js → celebrate)
  // 2.17: "Conclusão suave" (padrão): só uma luz quente que aparece e some, sem confete. Desligada: o confete de antes.
  on("fx:celebrate", (kind) => {
    if (getUx().soft) { warmGlow(); return; }
    if (kind === "work") confettiRain(); else burst(window.innerWidth / 2, window.innerHeight * 0.4, { count: 22, spread: 110 });
  });

  // primeira vez que o app aparece (depois do login/splash): entrada da tela atual
  const app = document.getElementById("app");
  if (app) {
    new MutationObserver(() => {
      if (!app.classList.contains("hide")) playViewIntro(app.querySelector('section[id^="view-"]:not(.hide)'));
    }).observe(app, { attributes: true, attributeFilter: ["class"] });
  }
}
