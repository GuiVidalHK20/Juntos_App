/* Movimento "de verdade" (2.22) — sem biblioteca: mola, FLIP, contagem e entradas.
   (Sem View Transitions: testadas e retiradas — a foto da tela antiga aparecia por cima da nova e custava caro em aparelho fraco.)
   REGRAS (valem para tudo aqui):
   - Só anima no modo de animação COMPLETO e sem "reduzir movimento" (fxFull). No "Suave"/desligado, nada se mexe:
     as funções devolvem na hora e o app se comporta exatamente como antes.
   - Só usa `transform` e `opacity` (rodam na GPU, sem recalcular layout a cada quadro).
   - Nunca lança erro: se o navegador não suporta algo (easing linear()), cai para o jeito antigo.
   - Leituras de layout em LOTE, antes das escritas (FLIP lê tudo, muda tudo, lê tudo, anima tudo). */
import { fxFull, countUp } from "./fx.js";

/* ---------- mola física (amostrada para o easing linear() do CSS) ---------- */
function buildSpring(zeta = 0.5, freq = 2.1, n = 34) {
  const wn = 2 * Math.PI * freq, wd = wn * Math.sqrt(1 - zeta * zeta), pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const v = 1 - Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
    pts.push(i === n ? 1 : Math.round(v * 1000) / 1000);
  }
  return `linear(${pts.join(", ")})`;
}
const SPRING_FALLBACK = "cubic-bezier(.34, 1.56, .64, 1)";
export const SPRING = (typeof CSS !== "undefined" && CSS.supports && CSS.supports("animation-timing-function", "linear(0, 1)")) ? buildSpring() : SPRING_FALLBACK;
export const EASE_OUT = "cubic-bezier(.2, .8, .2, 1)";

// el.animate sem nunca quebrar o fluxo (elemento desconectado, easing inválido, etc.)
export function anim(el, frames, opts) {
  if (!el || !el.isConnected || !fxFull() || typeof el.animate !== "function") return null;
  try { return el.animate(frames, { fill: "backwards", ...opts }); }
  catch { try { return el.animate(frames, { fill: "backwards", ...opts, easing: EASE_OUT }); } catch { return null; } }
}

/* ---------- microinterações ---------- */
// "estalo" de mola: usado ao marcar uma conquista
export function pop(el, from = 0.82, dur = 520) {
  anim(el, [{ transform: `scale(${from})` }, { transform: "scale(1)" }], { duration: dur, easing: SPRING });
}
// o emoji cresce conforme o peso (🌱 pequeno → 🌳 grande), com mais "energia" nos pesos maiores
export function grow(el, w = 1) {
  const from = [0.45, 0.35, 0.2][Math.min(Math.max(w, 1), 3) - 1];
  anim(el, [{ transform: `translateY(${4 + w * 3}px) scale(${from})`, opacity: 0.4 }, { transform: "translateY(0) scale(1)", opacity: 1 }], { duration: 480 + w * 90, easing: SPRING });
}
// a estrela gira ao entrar
export function twirl(el) {
  anim(el, [{ transform: "rotate(-70deg) scale(.3)" }, { transform: "rotate(0) scale(1)" }], { duration: 620, easing: SPRING });
}
// linha nova que entra na lista
export function enter(el) {
  anim(el, [{ opacity: 0, transform: "translateY(-12px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: SPRING });
}
// números "contando" até o valor (reaproveita a contagem do fx.js)
export function count(root, sel) { if (root && fxFull()) countUp(root, sel); }

/* ---------- FLIP: a lista desliza para o novo lugar em vez de pular ----------
   mutate() faz a mudança no DOM; as linhas com data-k que continuam existindo animam da posição antiga para a nova. */
export function flip(container, mutate, sel = "[data-k]") {
  if (!container || !fxFull() || !container.offsetParent) { mutate(); return; }
  const before = new Map();
  const els = Array.from(container.querySelectorAll(sel)).slice(0, 80);
  const rects = els.map((el) => el.getBoundingClientRect());           // 1) lê tudo
  els.forEach((el, i) => before.set(el, rects[i]));
  mutate();                                                            // 2) escreve
  const moved = Array.from(before.keys()).filter((el) => el.isConnected);
  const after = moved.map((el) => el.getBoundingClientRect());         // 3) lê tudo de novo (um único layout)
  const vh = window.innerHeight || 800;
  moved.forEach((el, i) => {                                           // 4) anima
    const dy = before.get(el).top - after[i].top;
    if (Math.abs(dy) < 1 || after[i].bottom < -80 || after[i].top > vh + 80) return;
    anim(el, [{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 340, easing: EASE_OUT });
  });
}
