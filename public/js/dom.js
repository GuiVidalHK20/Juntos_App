/* Atualização pontual do DOM (2.22) — no lugar de apagar e refazer uma lista inteira a cada toque.
   - setText/setAttr: só escrevem se o valor mudou (escrever o mesmo texto ainda invalida o layout).
   - setHTML: pula quando o HTML é idêntico ao da última vez (devolve true se mexeu).
   - morph: compara o HTML novo com o que já está na tela e muda SÓ o que mudou. Quem não mudou continua o mesmo
     elemento (mantém foco, animação em curso e ouvintes de clique). Linhas novas entram animadas; as que mudaram de
     lugar deslizam (FLIP). Elementos com data-k ou data-q têm "identidade": é assim que o morph sabe quem é quem. */
import { enter, flip } from "./motion.js";

export function setText(el, v) { if (el && el.textContent !== v) el.textContent = v; }
export function setAttr(el, name, v) { const s = String(v); if (el && el.getAttribute(name) !== s) el.setAttribute(name, s); }
export function setHTML(el, html) {
  if (!el || el.__html === html) return false;
  el.innerHTML = html; el.__html = html;
  return true;
}

const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute("data-k") || n.getAttribute("data-q") : null);
const sameKind = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName;
// o ripple do fx.js põe um <span class="fx-rip"> dentro dos botões: não é do HTML, então não pode ser apagado pelo morph
const foreign = (n) => n.nodeType === 1 && n.classList.contains("fx-rip");

function syncAttrs(o, n) {
  for (const a of Array.from(o.attributes)) if (a.name !== "style" && !n.hasAttribute(a.name)) o.removeAttribute(a.name);
  for (const a of Array.from(n.attributes)) if (a.name !== "style" && o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
  // style: aplica o que o HTML novo define e remove só as variáveis (--x) que ele deixou de definir;
  // o resto (position/overflow do ripple, translate de animações) não é do HTML e fica quieto
  const os = o.style, ns = n.style;
  for (let i = os.length - 1; i >= 0; i--) { const p = os[i]; if (p.startsWith("--") && !ns.getPropertyValue(p)) os.removeProperty(p); }
  for (let i = 0; i < ns.length; i++) { const p = ns[i], v = ns.getPropertyValue(p); if (os.getPropertyValue(p) !== v) os.setProperty(p, v, ns.getPropertyPriority(p)); }
}

function patch(o, n, animate) {
  if (o.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return; }
  if (o.isEqualNode(n)) return;               // nada mudou aqui dentro: o elemento nem é tocado
  syncAttrs(o, n);
  reconcile(o, n, animate);
}

function reconcile(oldP, newP, animate) {
  const newKids = Array.from(newP.childNodes);
  const keyed = new Map();
  for (const c of oldP.childNodes) { const k = keyOf(c); if (k) keyed.set(k, c); }
  const used = new Set();
  const live = (c) => { while (c && foreign(c)) c = c.nextSibling; return c; };
  let ref = live(oldP.firstChild);
  for (const nn of newKids) {
    const k = keyOf(nn);
    let match = null;
    if (k) { const m = keyed.get(k); if (m && m.nodeName === nn.nodeName) { match = m; keyed.delete(k); } }
    else if (ref && !keyOf(ref) && sameKind(ref, nn)) match = ref;
    if (match) {
      if (match === ref) ref = live(ref.nextSibling); else oldP.insertBefore(match, ref);
      used.add(match);
      patch(match, nn, animate);
    } else {
      oldP.insertBefore(nn, ref);           // tira o nó novo do <template> e o põe no lugar
      used.add(nn);
      if (animate && nn.nodeType === 1 && keyOf(nn)) enter(nn);
    }
  }
  for (const c of Array.from(oldP.childNodes)) if (!used.has(c) && !foreign(c)) oldP.removeChild(c);
}

/* animate=false na primeira montagem (trocar de dia/estilo): nada de 20 linhas "entrando" de uma vez */
export function morph(parent, html, { animate = true } = {}) {
  if (!parent) return;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const run = () => reconcile(parent, tpl.content, animate);
  // FLIP lê o layout de todas as linhas (força cálculo): só vale a pena se alguma linha entrou, saiu ou trocou de lugar
  const ids = (root) => Array.from(root.querySelectorAll("[data-k]"), (n) => n.getAttribute("data-k")).join("\u0001");
  if (animate && ids(parent) !== ids(tpl.content)) flip(parent, run); else run();
  parent.__html = html;
}
