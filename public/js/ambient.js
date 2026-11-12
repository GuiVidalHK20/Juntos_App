/* Sons da natureza (2.17): um leitor discreto no canto da tela (🌿). Os sons são GERADOS no próprio
   navegador (ruído branco/rosa/castanho filtrado), sem baixar arquivos e sem internet — por isso nada
   sai do aparelho. Só toca quando a pessoa escolhe; nunca começa sozinho (os navegadores exigem um toque). */
import { getUx, setUx, addToDock } from "./ux.js";
import { on } from "./store.js";

const OPTIONS = [
  ["off", "Silêncio"], ["chuva", "Chuva"], ["vento", "Vento"],
  ["rosa", "Ruído rosa"], ["castanho", "Ruído castanho"]
];
let ctx = null, master = null, node = null, lfo = null, current = "off";
const cache = {};

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

// gera 4 s de ruído em memória (sem arquivo): branco → rosa (filtro de Paul Kellet) ou castanho (integração)
function noise(kind) {
  if (cache[kind]) return cache[kind];
  const sr = ctx.sampleRate, len = sr * 4;
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "rosa") {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return (cache[kind] = buf);
}

function stopNodes() {
  try { node?.stop(); } catch {}
  try { lfo?.stop(); } catch {}
  node?.disconnect(); lfo?.disconnect();
  node = null; lfo = null;
}

function level() { return Math.max(0, Math.min(1, getUx().volume ?? 0.3)) * 0.6; }

export function setNature(name) {
  stopNodes();
  current = name;
  if (name !== "off") {
    ensureCtx();
    const src = ctx.createBufferSource();
    src.loop = true;
    src.buffer = noise(name === "rosa" || name === "chuva" ? "rosa" : "castanho");
    let out = src;
    if (name === "chuva") {                         // chuva: ruído rosa sem graves nem agudos duros
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 400;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5000;
      src.connect(hp); hp.connect(lp); out = lp;
    } else if (name === "vento") {                  // vento: castanho passando por um filtro que "sopra" devagar
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 450; bp.Q.value = 0.6;
      src.connect(bp); out = bp;
      lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const depth = ctx.createGain(); depth.gain.value = 260;
      lfo.connect(depth); depth.connect(bp.frequency); lfo.start();
    }
    out.connect(master);
    src.start();
    node = src;
    master.gain.setTargetAtTime(level(), ctx.currentTime, 0.4);   // entra suave, sem estalo
  } else if (master) {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  }
  paint();
}

function paint() {
  document.querySelectorAll(".ambOpt").forEach((b) => {
    const on = b.dataset.nature === current;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

export function initAmbient() {
  const btn = document.createElement("button");
  btn.id = "ambientBtn";
  btn.type = "button";
  btn.textContent = "🌿";
  btn.title = "Sons da natureza";
  btn.setAttribute("aria-label", "Abrir sons da natureza para foco");
  btn.setAttribute("aria-expanded", "false");
  btn.className = "fabItem fabAmb";

  const panel = document.createElement("div");
  panel.id = "ambientPanel";
  panel.className = "hide";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Sons da natureza");
  panel.innerHTML = `
    <p style="margin:0 0 8px;font-weight:600;font-size:14px">🌿 Sons para foco</p>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${OPTIONS.map(([k, label]) => `<button type="button" class="ambOpt" data-nature="${k}" aria-pressed="false"
        style="text-align:left;padding:9px 12px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;cursor:pointer">${label}</button>`).join("")}
    </div>
    <label for="ambVolume" style="display:block;margin:12px 0 4px;font-size:12px;color:var(--muted)">Volume</label>
    <input type="range" id="ambVolume" min="0" max="100" step="1" style="width:100%" aria-label="Volume dos sons">
    <p style="margin:10px 0 0;font-size:11px;color:var(--muted)">Gerados neste aparelho. Nada é enviado.</p>`;

  addToDock(btn);
  document.body.appendChild(panel);

  const toggle = (force) => {
    const open = typeof force === "boolean" ? force : panel.classList.contains("hide");
    panel.classList.toggle("hide", !open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  };
  btn.addEventListener("click", () => toggle());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggle(false); });
  // tocar em qualquer outro lugar (trocar de aba, abrir Ajustes…) fecha o painel: nunca fica por cima do conteúdo
  document.addEventListener("click", (e) => {
    if (!panel.classList.contains("hide") && !panel.contains(e.target) && !btn.contains(e.target)) toggle(false);
  });

  panel.querySelectorAll(".ambOpt").forEach((b) => b.addEventListener("click", () => setNature(b.dataset.nature)));
  const vol = panel.querySelector("#ambVolume");
  vol.value = String(Math.round((getUx().volume ?? 0.3) * 100));
  vol.addEventListener("input", () => {
    setUx({ volume: Number(vol.value) / 100 });
    if (master && ctx) master.gain.setTargetAtTime(current === "off" ? 0 : level(), ctx.currentTime, 0.1);
  });
  paint();
}
