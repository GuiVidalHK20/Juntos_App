/* Pausas conscientes (2.14): respiração guiada nas pausas do cronômetro.
   DESLIGADA POR PADRÃO — só aparece se a pessoa ligar em Ajustes → Pausas conscientes
   (preferência só deste aparelho). Quando ligada, durante uma pausa (curta, longa ou livre) aparece
   um cartão com um círculo que guia a respiração (inspire 4 s, solte 6 s) e uma pergunta curta
   sobre propósito/autocuidado. Pode ser dispensada a qualquer momento e volta na próxima pausa.
   Movimento: o círculo só se mexe se as animações estiverem ligadas (Cinema) e o sistema não pedir
   "reduzir movimento"; senão ele fica parado e o texto ("Inspire… / Solte o ar…") faz o guia.
   Leitores de tela: o cartão não "fala" a cada segundo (o texto animado é aria-hidden);
   há uma instrução única e uma só mensagem ao aparecer. */
import { toast } from "./utils.js";
import { announce } from "./a11y.js";

const KEY = "juntos.breath.v1";
const INHALE_MS = 4000, EXHALE_MS = 6000;
const PROMPTS = [
  "Para quê você está estudando isso hoje?",
  "O que você aprendeu neste ciclo, mesmo que seja pouco?",
  "Do que você pode se orgulhar neste esforço?",
  "Como está o seu corpo agora? Solte os ombros e a mandíbula.",
  "Quem ou o que inspira você a continuar?",
  "Que pequena coisa boa aconteceu hoje?",
  "Que tipo de estudante você quer ser: paciente, curiosa(o), gentil consigo?"
];

const $ = (id) => document.getElementById(id);
let shown = false, dismissed = false, cueTimer = null, askIdx = Math.floor(Math.random() * PROMPTS.length);

export const breathEnabled = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

function setCue(text) { const c = $("breathCue"); if (c) c.textContent = text; }
function loop() {
  clearTimeout(cueTimer);
  setCue("Inspire…");
  cueTimer = setTimeout(() => { setCue("Solte o ar devagar…"); cueTimer = setTimeout(loop, EXHALE_MS); }, INHALE_MS);
}
function nextAsk() { askIdx = (askIdx + 1) % PROMPTS.length; const a = $("breathAsk"); if (a) a.textContent = PROMPTS[askIdx]; }

function show() {
  const card = $("breathCard"); if (!card) return;
  shown = true;
  const a = $("breathAsk"); if (a) a.textContent = PROMPTS[askIdx];
  card.classList.remove("hide");
  loop();
  announce("Pausa consciente: respiração guiada disponível na tela do cronômetro.");
}
function hide() {
  shown = false; clearTimeout(cueTimer);
  $("breathCard")?.classList.add("hide");
}

// chamado por timer.js a cada atualização do relógio (barato: só compara estados)
export function syncBreathing(phase) {
  const onBreak = phase === "break" || phase === "longBreak";
  if (!onBreak) dismissed = false;               // saiu da pausa: na próxima ela volta
  const want = onBreak && breathEnabled() && !dismissed;
  if (want && !shown) show(); else if (!want && shown) hide();
}

export function initBreathing() {
  const t = $("breathToggle");
  if (t) {
    t.checked = breathEnabled();
    t.addEventListener("change", () => {
      try { localStorage.setItem(KEY, t.checked ? "1" : "0"); } catch {}
      toast(t.checked ? "Pausas conscientes ligadas. Elas aparecem nas pausas do cronômetro." : "Pausas conscientes desligadas.");
      if (!t.checked) hide();
    });
  }
  $("breathOther")?.addEventListener("click", nextAsk);
  $("breathSkip")?.addEventListener("click", () => { dismissed = true; hide(); });
}
