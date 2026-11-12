/* Aba "Frases": uma frase por vez, sorteada. Não existe lista com todas as frases — de propósito,
   para a pessoa descobrir uma de cada vez. Frase do dia ao abrir; "Outra frase" sorteia dentro
   do tema escolhido, sem repetir até todas as do tema terem aparecido (sistema de "sacola").
   Única lista visível: as ♥ Favoritas da própria pessoa.
   Carregada sob demanda (import() em ui.js). Dados em quotes-data.js.
   Favoritas ficam só neste aparelho (localStorage): conveniência pessoal, sem regra no Firestore;
   em contrapartida, não sincronizam entre aparelhos. */
import { $, esc, brNow, toast } from "./utils.js";
import { QUOTES, QUOTE_CATS } from "./quotes-data.js";
import { QUOTES_FAV_LS_KEY } from "./constants.js";

let started = false;
let filter = "todas";      // "todas" | id de categoria | "favoritas"
let hero = null;           // índice (em QUOTES) da frase em destaque
let heroIsDaily = true;    // true = frase do dia; false = sorteada
let bag = [];              // índices ainda não sorteados neste tema (embaralhados)

/* ---------- favoritas (neste aparelho) ---------- */
const qkey = (q) => `${q.a}|${q.t.slice(0, 28)}`; // chave estável mesmo se a ordem do banco mudar
function readFavs() {
  try { const v = JSON.parse(localStorage.getItem(QUOTES_FAV_LS_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function writeFavs(list) { try { localStorage.setItem(QUOTES_FAV_LS_KEY, JSON.stringify(list)); } catch {} }
const isFav = (i) => readFavs().includes(qkey(QUOTES[i]));
function toggleFav(i) {
  const k = qkey(QUOTES[i]); const favs = readFavs();
  const on = !favs.includes(k);
  writeFavs(on ? [...favs, k] : favs.filter((x) => x !== k));
  toast(on ? "Frase salva nas favoritas." : "Frase removida das favoritas.");
}

/* ---------- escolha da frase ---------- */
// mesma frase para todo mundo no mesmo dia (dia de Brasília, igual ao resto do app)
function dailyIndex() {
  const d = brNow();
  const days = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  return days % QUOTES.length;
}
// índices do tema atual (as favoritas não sorteiam: são mostradas como lista)
function themePool() {
  return QUOTES.map((q, i) => i).filter((i) => filter === "todas" || QUOTES[i].cat === filter);
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function drawRandom() {
  if (!bag.length) {
    bag = shuffle(themePool().filter((i) => i !== hero)); // recarrega sem repetir a que está na tela
    if (!bag.length) return;
  }
  hero = bag.pop();
  heroIsDaily = false;
}

// frases de música são resumos da mensagem (sem letra, por direitos autorais): sem aspas
const isTema = (q) => q.tipo === "tema";
const quoted = (q) => (isTema(q) ? esc(q.t) : `“${esc(q.t)}”`);

/* ---------- compartilhar ---------- */
async function shareQuote(i) {
  const q = QUOTES[i];
  const text = (isTema(q) ? `${q.a}, em ${q.src}: ${q.t}` : `“${q.t}” — ${q.a}`) + `\n\nvia Juntos`;
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; } // pessoa fechou a folha de compartilhar
  try { await navigator.clipboard.writeText(text); toast("Frase copiada."); }
  catch { toast("Não consegui copiar. Tente selecionar o texto."); }
}

/* ---------- desenho da tela ---------- */
function actionsHTML(i, withDraw) {
  return `<div class="qActions">
    <button class="qBtn ${isFav(i) ? "on" : ""}" data-act="fav" data-i="${i}" aria-label="Favoritar" aria-pressed="${isFav(i) ? "true" : "false"}">${isFav(i) ? "♥" : "♡"}</button>
    <button class="qBtn" data-act="share" data-i="${i}" aria-label="Compartilhar">↗ Compartilhar</button>
    ${withDraw ? `<button class="qBtn" data-act="draw">🔀 Outra frase</button>` : ""}
  </div>`;
}
function metaHTML(q) {
  const bits = [q.quem, q.src].filter(Boolean).map(esc);
  return bits.length ? `<p class="qMeta">${bits.join(" · ")}</p>` : "";
}

export function renderQuotes() {
  if (!started) { started = true; hero = dailyIndex(); bind(); }
  const root = $("quotesRoot"); if (!root) return;

  const favCount = readFavs().length;
  const chips = [{ id: "todas", label: "Todas" }, ...QUOTE_CATS, { id: "favoritas", label: `♥ Favoritas${favCount ? ` (${favCount})` : ""}` }]
    .map((c) => `<button class="qChip ${filter === c.id ? "on" : ""}" data-act="filter" data-id="${esc(c.id)}">${esc(c.label)}</button>`).join("");

  let body;
  if (filter === "favoritas") {
    const favs = readFavs();
    const idxs = QUOTES.map((q, i) => i).filter((i) => favs.includes(qkey(QUOTES[i])));
    body = idxs.length
      ? idxs.map((i) => `<article class="qCard">
          <p class="qCardText">${quoted(QUOTES[i])}</p>
          <p class="qAuthor sm">— ${esc(QUOTES[i].a)}</p>
          ${metaHTML(QUOTES[i])}
          ${actionsHTML(i, false)}
        </article>`).join("")
      : `<p class="muted" style="text-align:center;margin-top:24px">Você ainda não favoritou nenhuma frase. Quando uma frase te tocar, toque no ♡ para guardá-la aqui.</p>`;
  } else {
    const q = QUOTES[hero];
    body = `<div class="qHero">
      <p class="qKicker">${isTema(q) ? "a mensagem da música" : heroIsDaily ? "frase do dia" : "uma frase para você"}</p>
      <blockquote class="qText">${quoted(q)}</blockquote>
      <p class="qAuthor">— ${esc(q.a)}</p>
      ${metaHTML(q)}
      ${actionsHTML(hero, true)}
    </div>`;
  }

  root.innerHTML = `<div class="qChips">${chips}</div>${body}
    <p class="fineprint" style="margin-top:22px">Frases de pessoas reais, com a fonte quando é conhecida. As traduções são livres. Nas músicas, mostramos a mensagem da canção com nossas palavras — as letras são protegidas por direitos autorais.</p>`;
}

function bind() {
  $("quotesRoot").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const act = b.dataset.act, i = Number(b.dataset.i);
    if (act === "fav" && Number.isInteger(i)) { toggleFav(i); renderQuotes(); }
    else if (act === "share" && Number.isInteger(i)) shareQuote(i);
    else if (act === "draw") { drawRandom(); renderQuotes(); }
    else if (act === "filter") {
      filter = b.dataset.id;
      bag = [];
      if (filter !== "favoritas") {
        // trocar de tema já mostra uma frase daquele tema (se a atual não for dele)
        if (!themePool().includes(hero)) drawRandom();
      }
      renderQuotes();
    }
  });
}
