/* Resumo do mês para compartilhar (2.23).
   - Qualquer mês com estudo registrado pode ser escolhido (não só o atual): é só tocar no mês na faixa de cima.
   - A imagem (1080×1350, formato de post/story) é desenhada num <canvas> e sai como JPEG (qualidade 0,93), com 3 temas.
   - Tudo vem de dados que o app já guarda: `profile.daily` (estudo) e, se houver, as estatísticas do Ta-da
     (tada-history.js → monthTotals). Se o Ta-da não responder em alguns segundos, o cartão sai sem essa linha.
   - Tom: só o que foi conquistado. Comparar com o mês anterior só aparece quando foi para melhor. */
import { store } from "./store.js";
import { esc, fmtMin, brNow, normDay, subjectById, toast, safeColor } from "./utils.js";
import { MONTHS } from "./constants.js";

const pad2 = (n) => String(n).padStart(2, "0");
const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const YM_RE = /^(\d{4})-(\d{2})$/;
const THEME_LS = "juntos.wrappedTheme";

/* ============================================================
   dados do mês
============================================================ */
function daysIn(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
const prevYm = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`; };

// meses que podem ser escolhidos: todos os que têm estudo + o mês atual (mais recente primeiro)
export function availableMonths() {
  const now = brNow();
  const cur = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const set = new Set([cur]);
  for (const [k, v] of Object.entries(store.profile?.daily || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && normDay(v).total > 0) set.add(k.slice(0, 7));
  }
  return [...set].filter((x) => YM_RE.test(x)).sort().reverse();
}

export function collectMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const dim = daysIn(y, m);
  const daily = store.profile?.daily || {};
  const mins = new Array(dim).fill(0);
  const bySubj = {};
  for (let d = 1; d <= dim; d++) {
    const e = normDay(daily[`${ym}-${pad2(d)}`]);
    mins[d - 1] = Math.round(e.total);
    for (const [sid, v] of Object.entries(e.bySubject || {})) bySubj[sid] = (bySubj[sid] || 0) + (Number(v) || 0);
  }
  const total = mins.reduce((a, b) => a + b, 0);
  const active = mins.filter((x) => x > 0).length;
  let best = null, run = 0, streak = 0;
  mins.forEach((v, i) => {
    if (v > 0 && (!best || v >= best.min)) best = { day: i + 1, min: v };
    if (v > 0) { run++; streak = Math.max(streak, run); } else run = 0;
  });
  const now = brNow();
  const isCurrent = now.getFullYear() === y && now.getMonth() + 1 === m;
  const elapsed = isCurrent ? now.getDate() : dim;
  const pym = prevYm(ym);
  const prevTotal = Object.entries(daily).filter(([k]) => k.startsWith(pym + "-")).reduce((a, [, v]) => a + normDay(v).total, 0);
  const subjSum = Object.values(bySubj).reduce((a, b) => a + b, 0);
  const subjects = Object.entries(bySubj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([sid, v]) => { const s = subjectById(sid); return { name: s.name, color: safeColor(s.color), min: v, pct: subjSum ? v / subjSum : 0 }; });
  return { ym, y, m, dim, mins, total, active, avg: active ? Math.round(total / active) : 0, best, streak, isCurrent, elapsed, prevTotal, prevYm: pym, subjects };
}

/* ============================================================
   temas
============================================================ */
const THEMES = {
  noite: {
    name: "Noite",
    bg: ["#0B0F18", "#141A2A", "#1B2133"], glowA: "rgba(47,217,238,.22)", glowB: "rgba(167,139,250,.20)", glowC: "rgba(255,154,77,.10)",
    text: "#F3F0E7", muted: "#93A0B5", faint: "rgba(255,255,255,.07)", line: "rgba(255,255,255,.12)", card: "rgba(255,255,255,.055)",
    a1: "#2FD9EE", a2: "#A78BFA", a3: "#FFB454", good: "#7EE0A6", dot: "rgba(255,255,255,.035)"
  },
  aurora: {
    name: "Aurora",
    bg: ["#1A0F3D", "#0F3F63", "#0E6B5C"], glowA: "rgba(255,120,190,.28)", glowB: "rgba(120,240,220,.24)", glowC: "rgba(255,214,120,.14)",
    text: "#FFFFFF", muted: "#C9D8EE", faint: "rgba(255,255,255,.10)", line: "rgba(255,255,255,.18)", card: "rgba(255,255,255,.10)",
    a1: "#8FF5E2", a2: "#FF9AD0", a3: "#FFD27A", good: "#9CFFCB", dot: "rgba(255,255,255,.05)"
  },
  papel: {
    name: "Papel",
    bg: ["#FBF7EE", "#F3ECDC", "#EADFC8"], glowA: "rgba(226,87,59,.16)", glowB: "rgba(42,127,142,.16)", glowC: "rgba(197,139,27,.12)",
    text: "#26211B", muted: "#7A7164", faint: "rgba(38,33,27,.07)", line: "rgba(38,33,27,.14)", card: "rgba(255,255,255,.65)",
    a1: "#2A7F8E", a2: "#E2573B", a3: "#C58B1B", good: "#2E8B57", dot: "rgba(38,33,27,.05)"
  }
};
const themeIds = Object.keys(THEMES);

/* ============================================================
   desenho
============================================================ */
const cssVar = (n, fb) => { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb; } catch { return fb; } };

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// texto com espaçamento entre letras (rótulos em caixa-alta); devolve a largura
function spaced(ctx, text, x, y, spacing, align = "left") {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  let cx = align === "right" ? x - total : align === "center" ? x - total / 2 : x;
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i]; });
  return total;
}
function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}
const shortMin = (min) => { min = Math.round(min || 0); const h = Math.floor(min / 60), m = min % 60; return h === 0 ? `${m} min` : m === 0 ? `${h}h` : `${h}h ${m}min`; };
const durParts = (min) => {
  min = Math.round(min || 0); const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return [{ n: String(m), u: "min" }];
  return m === 0 ? [{ n: String(h), u: "h" }] : [{ n: String(h), u: "h" }, { n: String(m), u: "min" }];
};

function drawBackground(ctx, W, H, T) {
  const g = ctx.createLinearGradient(0, 0, W * 0.6, H);
  g.addColorStop(0, T.bg[0]); g.addColorStop(0.55, T.bg[1]); g.addColorStop(1, T.bg[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const glow = (x, y, r, c) => { const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c); rg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); };
  glow(120, 140, 760, T.glowA); glow(W - 60, H - 260, 820, T.glowB); glow(W * 0.62, 520, 520, T.glowC);
  ctx.fillStyle = T.dot;   // trama de pontos bem suave, dá textura sem pesar
  for (let y = 36; y < H; y += 54) for (let x = 36; x < W; x += 54) { ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }
}

function drawCard(ctx, x, y, w, h, T, r = 34) {
  rr(ctx, x, y, w, h, r); ctx.fillStyle = T.card; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = T.line; ctx.stroke();
}

export function drawCardImage(canvas, D, tada, themeId) {
  const T = THEMES[themeId] || THEMES.noite;
  const HEAD = cssVar("--head", "Georgia, serif"), BODY = cssVar("--body", "system-ui, sans-serif");
  const W = 1080, H = 1350, M = 72, CW = W - M * 2;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });   // imagem estática que será lida de volta (toBlob): evita a ida e volta pela GPU
  ctx.textBaseline = "alphabetic";
  drawBackground(ctx, W, H, T);

  // topo: marca + rótulo
  ctx.fillStyle = T.text; ctx.font = `500 56px ${HEAD}`; ctx.fillText("Juntos", M, 118);
  ctx.fillStyle = T.muted; ctx.font = `600 24px ${BODY}`; spaced(ctx, "RESUMO DO MÊS", W - M, 112, 5, "right");

  // mês (grande, com gradiente) e ano
  const monthName = cap(MONTH_NAMES[D.m - 1]);
  ctx.font = `500 168px ${HEAD}`;
  const mw = ctx.measureText(monthName).width;
  const mg = ctx.createLinearGradient(M, 0, M + Math.max(mw, 400), 0);
  mg.addColorStop(0, T.a1); mg.addColorStop(1, T.a2);
  ctx.fillStyle = mg; ctx.fillText(monthName, M, 300);
  ctx.fillStyle = T.muted; ctx.font = `400 44px ${BODY}`; ctx.fillText(String(D.y), M + 4, 360);

  // tempo total (destaque)
  ctx.fillStyle = T.muted; ctx.font = `600 24px ${BODY}`; spaced(ctx, "TEMPO DE ESTUDO", M, 440, 5);
  let x = M;
  const big = 150, unit = 56, base = 580;
  for (const p of durParts(D.total)) {
    ctx.font = `700 ${big}px ${BODY}`; ctx.fillStyle = T.text; ctx.fillText(p.n, x, base); x += ctx.measureText(p.n).width + 8;
    ctx.font = `500 ${unit}px ${BODY}`; ctx.fillStyle = T.muted; ctx.fillText(p.u, x, base); x += ctx.measureText(p.u).width + 30;
  }

  // faixa de incentivo (só o que é bom de ouvir)
  const pct = D.prevTotal > 0 ? Math.round(((D.total - D.prevTotal) / D.prevTotal) * 100) : 0;
  let pill = null, pillColor = T.a3;
  if (D.total === 0) pill = "🌱  Seu mês começa agora";
  else if (D.prevTotal > 0 && D.total > D.prevTotal) { pill = `↑ ${pct}% a mais que em ${MONTH_NAMES[Number(D.prevYm.slice(5)) - 1]}`; pillColor = T.good; }
  else if (D.prevTotal === 0) pill = "🎉  Primeiro mês com registros";
  else if (D.streak >= 2) pill = `🔥  ${D.streak} dias seguidos estudando`;
  else pill = "🌱  Cada mês tem o seu ritmo";
  ctx.font = `600 32px ${BODY}`;
  const pw = ctx.measureText(pill).width + 64;
  rr(ctx, M, 604, pw, 66, 33); ctx.fillStyle = T.faint; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = pillColor; ctx.stroke();
  ctx.fillStyle = pillColor; ctx.fillText(pill, M + 32, 647);

  // 3 números
  const tileW = (CW - 2 * 24) / 3, tileY = 702, tileH = 142;
  const tiles = [
    { k: "DIAS ATIVOS", v: String(D.active), s: `/ ${D.elapsed}` },
    { k: "MÉDIA POR DIA", v: D.active ? shortMin(D.avg) : "—", s: "" },
    { k: "SEQUÊNCIA", v: String(D.streak), s: D.streak === 1 ? "dia" : "dias" }
  ];
  tiles.forEach((t, i) => {
    const tx = M + i * (tileW + 24);
    drawCard(ctx, tx, tileY, tileW, tileH, T, 30);
    ctx.fillStyle = T.muted; ctx.font = `600 21px ${BODY}`; spaced(ctx, t.k, tx + 28, tileY + 42, 3);
    // o número encolhe até caber (nunca é cortado); o complemento ("/ 31", "dias") vai ao lado se couber
    let fs = 58;
    ctx.fillStyle = T.text;
    do { ctx.font = `700 ${fs}px ${BODY}`; fs -= 2; } while (ctx.measureText(t.v).width > tileW - 56 && fs > 30);
    ctx.fillText(t.v, tx + 28, tileY + 102);
    if (t.s) { const w0 = ctx.measureText(t.v).width; ctx.font = `500 28px ${BODY}`; if (w0 + 10 + ctx.measureText(t.s).width <= tileW - 56) { ctx.fillStyle = T.muted; ctx.fillText(t.s, tx + 28 + w0 + 10, tileY + 102); } }
  });

  // estudo por dia (barras)
  const cy = 868, ch = 262;
  drawCard(ctx, M, cy, CW, ch, T, 34);
  ctx.fillStyle = T.muted; ctx.font = `600 21px ${BODY}`; spaced(ctx, "ESTUDO POR DIA", M + 32, cy + 50, 3);
  if (D.best) {
    ctx.textAlign = "right"; ctx.font = `500 24px ${BODY}`; ctx.fillStyle = T.a3;
    ctx.fillText(`★ melhor dia: ${D.best.day} ${MONTHS[D.m - 1]} · ${shortMin(D.best.min)}`, M + CW - 32, cy + 50);
    ctx.textAlign = "left";
  }
  const px = M + 40, pw2 = CW - 80, baseY = cy + ch - 52, maxH = 138, gap = 6;
  const bw = (pw2 - (D.dim - 1) * gap) / D.dim;
  const maxMin = Math.max(1, ...D.mins);
  D.mins.forEach((v, i) => {
    const bx = px + i * (bw + gap), future = D.isCurrent && i + 1 > D.elapsed;
    const h = v > 0 ? Math.max(10, Math.round((v / maxMin) * maxH)) : 6;
    if (v > 0) {
      const isBest = D.best && i + 1 === D.best.day;
      const g = ctx.createLinearGradient(0, baseY - h, 0, baseY);
      if (isBest) { g.addColorStop(0, T.a3); g.addColorStop(1, T.a3); } else { g.addColorStop(0, T.a2); g.addColorStop(1, T.a1); }
      ctx.fillStyle = g; rr(ctx, bx, baseY - h, bw, h, Math.min(bw / 2, 9)); ctx.fill();
    } else {
      ctx.fillStyle = future ? "rgba(128,128,128,.10)" : T.line; rr(ctx, bx, baseY - h, bw, h, 3); ctx.fill();
    }
  });
  ctx.fillStyle = T.muted; ctx.font = `500 22px ${BODY}`; ctx.textAlign = "center";
  const ticks = [1, 8, 15, 22];
  if (D.dim - 22 >= 4) ticks.push(D.dim);
  ticks.forEach((d) => ctx.fillText(String(d), px + (d - 1) * (bw + gap) + bw / 2, baseY + 36));
  ctx.textAlign = "left";
  if (D.total === 0) { ctx.fillStyle = T.muted; ctx.font = `400 28px ${BODY}`; ctx.textAlign = "center"; ctx.fillText("Os dias aparecem aqui conforme você estuda", W / 2, baseY - 60); ctx.textAlign = "left"; }

  // matérias (barra segmentada + legenda)
  let ny = 1164;
  if (D.subjects.length) {
    const by = ny, bh = 22; let sx = M;
    ctx.save(); rr(ctx, M, by, CW, bh, 11); ctx.clip();
    D.subjects.forEach((s, i) => { const w = i === D.subjects.length - 1 ? M + CW - sx : Math.max(8, CW * s.pct); ctx.fillStyle = s.color; ctx.fillRect(sx, by, w, bh); sx += w; });
    ctx.restore();
    const colW = CW / D.subjects.length;
    D.subjects.forEach((s, i) => {
      const lx = M + i * colW;
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(lx + 9, by + 52, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = T.text; ctx.font = `600 26px ${BODY}`;
      const label = `${Math.round(s.pct * 100)}% `;
      ctx.fillText(label, lx + 28, by + 61);
      const lw = ctx.measureText(label).width;
      ctx.fillStyle = T.muted; ctx.font = `400 26px ${BODY}`;
      ctx.fillText(fit(ctx, s.name, colW - 28 - lw - 14), lx + 28 + lw, by + 61);
    });
  }

  // Ta-da (opcional)
  if (tada && (tada.n > 0 || tada.g > 0)) {
    ctx.fillStyle = T.text; ctx.font = `500 28px ${BODY}`; ctx.textAlign = "center";
    const parts = [];
    if (tada.n) parts.push(`✨ ${tada.n} ${tada.n === 1 ? "conquista" : "conquistas"}`);
    if (tada.g) parts.push(`🙏 ${tada.g} ${tada.g === 1 ? "gratidão" : "gratidões"}`);
    ctx.fillText(parts.join("     "), W / 2, D.subjects.length ? 1276 : 1236);
    ctx.textAlign = "left";
  }

  ctx.fillStyle = T.muted; ctx.font = `400 24px ${BODY}`; ctx.textAlign = "center";
  ctx.fillText("feito com Juntos · um lugar para estudar", W / 2, H - 30);
  ctx.textAlign = "left";
}

/* ============================================================
   janela: escolher o mês e o tema, ver, baixar e compartilhar
============================================================ */
const tadaCache = new Map();
async function loadTada(ym) {
  if (tadaCache.has(ym)) return tadaCache.get(ym);
  let out = null;
  try {
    const mod = await import("./tada-history.js");
    out = await Promise.race([mod.monthTotals(ym), new Promise((r) => setTimeout(() => r(null), 5000))]);
  } catch { out = null; }
  if (out) tadaCache.set(ym, out);   // só guarda resposta de verdade (um "null" por demora não impede tentar de novo)
  return out;
}

function chipLabel(ym, cur) {
  const [y, m] = ym.split("-").map(Number);
  return ym === cur ? "Este mês" : `${cap(MONTHS[m - 1])} ${y}`;
}

export async function generateWrapped() {
  if (!store.profile) return;
  try { await document.fonts.ready; } catch {}   // não desenhar com a fonte reserva na primeira vez
  const months = availableMonths();
  const now = brNow(), cur = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  let saved = null; try { saved = localStorage.getItem(THEME_LS); } catch {}
  const curD = collectMonth(cur);
  const lastWithData = months.find((ym) => ym !== cur && collectMonth(ym).total > 0);
  // mês atual só vira o padrão depois da primeira semana: antes disso o que se quer mandar é o mês que acabou de fechar
  const st = { ym: curD.total > 0 && (curD.elapsed >= 8 || !lastWithData) ? cur : (lastWithData || cur), theme: THEMES[saved] ? saved : "noite", url: null, blob: null, req: 0, total: 0 };

  const wrap = document.createElement("div");
  wrap.className = "modalWrap wrWrap";
  wrap.innerHTML = `
    <div class="modalBox wrBox" role="dialog" aria-modal="true" aria-label="Resumo do mês para compartilhar">
      <div class="wrHead"><h3 class="modalTitle">Resumo do mês</h3><button type="button" class="wrX" data-close aria-label="Fechar">✕</button></div>
      <div class="wrChips" role="group" aria-label="Escolher o mês">${months.map((ym) =>
        `<button type="button" class="wrChip" data-ym="${ym}" aria-pressed="false">${esc(chipLabel(ym, cur))}</button>`).join("")}</div>
      <div class="wrPrev"><img class="wrImg" alt="" hidden><div class="wrBusy"><span class="spinner" aria-hidden="true"></span><span>Montando…</span></div></div>
      <div class="wrThemes" role="group" aria-label="Tema da imagem">${themeIds.map((id) =>
        `<button type="button" class="wrTheme" data-theme="${id}" aria-pressed="false"><i class="wrDot ${id}"></i>${THEMES[id].name}</button>`).join("")}</div>
      <div class="wrBtns">
        <button type="button" class="primary" data-act="save">Baixar imagem</button>
        <button type="button" class="primary roomtone hide" data-act="share">Compartilhar</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const img = wrap.querySelector(".wrImg"), busy = wrap.querySelector(".wrBusy");
  const saveBtn = wrap.querySelector('[data-act="save"]'), shareBtn = wrap.querySelector('[data-act="share"]');
  const closeWrap = () => { if (st.url) URL.revokeObjectURL(st.url); st.req++; wrap.remove(); };
  wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeWrap));
  wrap.addEventListener("click", (e) => { if (e.target === wrap) closeWrap(); });

  const syncChecked = () => {
    wrap.querySelectorAll(".wrChip").forEach((b) => { const on = b.dataset.ym === st.ym; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    wrap.querySelectorAll(".wrTheme").forEach((b) => { const on = b.dataset.theme === st.theme; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
  };

  async function render() {
    const my = ++st.req;
    syncChecked();
    busy.hidden = false; saveBtn.disabled = true; shareBtn.disabled = true;
    const D = collectMonth(st.ym);
    const canvas = document.createElement("canvas");
    // desenha já com o que há; o Ta-da (leitura no servidor) entra logo que chegar
    const paint = async (tada) => {
      drawCardImage(canvas, D, tada, st.theme);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.93));   // JPEG: ~10× menor e bem mais rápido que PNG (degradês quase não comprimem)
      if (my !== st.req) return false;             // a pessoa já escolheu outro mês/tema
      if (!blob) { toast("Não foi possível gerar a imagem. Tente novamente."); return false; }
      if (st.url) URL.revokeObjectURL(st.url);
      st.url = URL.createObjectURL(blob); st.blob = blob; st.total = D.total;
      img.src = st.url; img.hidden = false; img.alt = `Resumo de ${MONTH_NAMES[D.m - 1]} de ${D.y}: ${fmtMin(D.total)} de estudo`;
      busy.hidden = true; saveBtn.disabled = false; shareBtn.disabled = false;
      return true;
    };
    const cached = tadaCache.get(st.ym) || null;
    if (!(await paint(cached))) return;
    if (!cached) {
      const t = await loadTada(st.ym);
      if (my === st.req && t && (t.n > 0 || t.g > 0)) await paint(t);
    }
  }

  wrap.querySelector(".wrChips").addEventListener("click", (e) => {
    const b = e.target.closest(".wrChip"); if (!b || b.dataset.ym === st.ym) return;
    st.ym = b.dataset.ym; render();
  });
  wrap.querySelector(".wrThemes").addEventListener("click", (e) => {
    const b = e.target.closest(".wrTheme"); if (!b || b.dataset.theme === st.theme) return;
    st.theme = b.dataset.theme; try { localStorage.setItem(THEME_LS, st.theme); } catch {}
    render();
  });
  saveBtn.addEventListener("click", () => {
    if (!st.url) return;
    const a = document.createElement("a"); a.href = st.url; a.download = `juntos-resumo-${st.ym}.jpg`; a.click();
  });
  shareBtn.addEventListener("click", () => {
    if (!st.blob) return;
    const [y, m] = st.ym.split("-").map(Number);
    const file = new File([st.blob], `juntos-resumo-${st.ym}.jpg`, { type: "image/jpeg" });
    const text = `Meu ${MONTH_NAMES[m - 1]} de ${y} no Juntos: ${fmtMin(st.total)} de estudo 📚`;
    navigator.share({ files: [file], title: `Meu resumo de ${MONTH_NAMES[m - 1]} no Juntos`, text }).catch(() => {});
  });
  try {
    const probe = new File([new Blob(["x"])], "x.jpg", { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [probe] })) shareBtn.classList.remove("hide");
  } catch {}

  syncChecked();
  wrap.querySelector(`.wrChip[data-ym="${st.ym}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
  render();
}
