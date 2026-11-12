/* Conforto (2.14): tema escuro rápido, paletas suaves, tamanho do texto e "sem animações".
   2.16: a barra sobre o cronômetro ficou só com tema e cores. Tamanho do texto e animações
   ficam só em Ajustes → Aparência.
   Tudo fica só neste aparelho (localStorage) e é aplicado antes de a tela pintar, pelo script do
   <head> do index.html. Nada vai para o servidor. */
import { toast } from "./utils.js";
import { HC_LS_KEY } from "./constants.js";

export const PALETTE_KEY = "juntos.palette.v1";
export const TSCALE_KEY = "juntos.tscale.v1";
export const PALETTES = [
  { id: "padrao", name: "Padrão" }, { id: "bruma", name: "Bruma" }, { id: "musgo", name: "Musgo" },
  { id: "areia", name: "Areia" }, { id: "lavanda", name: "Lavanda" }
];
const MAX_STEP = 4;
const SIZE_LABEL = ["normal", "110%", "120%", "135%", "150%"];

const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

const getPalette = () => PALETTES.some((p) => p.id === root.dataset.palette) ? root.dataset.palette : "padrao";
const getStep = () => Math.min(MAX_STEP, Math.max(0, parseInt(root.dataset.tscale || "0", 10) || 0));

function effectiveTheme() {
  const t = root.dataset.theme || "dark";
  if (t === "system") return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  return t;
}

export function applyPalette(id) {
  const pal = PALETTES.some((p) => p.id === id) ? id : "padrao";
  if (pal === "padrao") { delete root.dataset.palette; save(PALETTE_KEY, "padrao"); } // "padrao" explícito = sem override
  else { root.dataset.palette = pal; save(PALETTE_KEY, pal); }
  paint();
}

export function applyTextStep(step) {
  const n = Math.min(MAX_STEP, Math.max(0, step | 0));
  if (n === 0) delete root.dataset.tscale; else root.dataset.tscale = String(n);
  save(TSCALE_KEY, String(n));
  paint();
}

function paint() {
  const pal = getPalette(), step = getStep(), dark = effectiveTheme() === "dark";
  const th = $("qbTheme");
  if (th) {
    th.setAttribute("aria-pressed", dark ? "true" : "false");
    th.innerHTML = dark ? "🌙 <span>Escuro</span>" : "☀️ <span>Claro</span>";
    th.setAttribute("aria-label", dark ? "Modo escuro ligado. Tocar para usar o modo claro" : "Modo claro ligado. Tocar para usar o modo escuro");
  }
  const pn = $("qbPaletteName"); if (pn) pn.textContent = PALETTES.find((p) => p.id === pal).name;
  $("qbPalette")?.setAttribute("aria-label", `Paleta de cores: ${PALETTES.find((p) => p.id === pal).name}. Tocar para trocar`);
  const dn = [$("tsDown")], up = [$("tsUp")];
  dn.forEach((b) => b && (b.disabled = step <= 0)); up.forEach((b) => b && (b.disabled = step >= MAX_STEP));
  const reset = $("tsReset"); if (reset) reset.textContent = step === 0 ? "Normal" : SIZE_LABEL[step];
  document.querySelectorAll(".palBtn").forEach((b) => b.classList.toggle("on", b.dataset.pal === pal));
}

// 2.25 — alto contraste: "1"/"0" salvo; sem escolha, o script do <head> já seguiu o sistema (prefers-contrast)
export const hcOn = () => root.dataset.hc === "on";
export function applyHighContrast(on) {
  if (on) root.dataset.hc = "on"; else delete root.dataset.hc;
  save(HC_LS_KEY, on ? "1" : "0");
  const t = $("hcToggle"); if (t) t.checked = on;
}

export function initComfort() {
  const hcT = $("hcToggle");
  if (hcT) { hcT.checked = hcOn(); hcT.addEventListener("change", () => { applyHighContrast(hcT.checked); toast(hcT.checked ? "Alto contraste ligado." : "Alto contraste desligado."); }); }
  // sem escolha salva, acompanha o sistema se ele mudar com o app aberto
  window.matchMedia?.("(prefers-contrast: more)").addEventListener?.("change", (e) => {
    if (read(HC_LS_KEY) !== null) return;
    if (e.matches) root.dataset.hc = "on"; else delete root.dataset.hc;
    if (hcT) hcT.checked = hcOn();
  });
  // valores salvos (o script do <head> já aplicou; aqui só garante o estado e valida)
  const pal = read(PALETTE_KEY);
  if (pal && pal !== "padrao" && PALETTES.some((p) => p.id === pal)) root.dataset.palette = pal; else delete root.dataset.palette;

  // modo escuro/claro rápido: reaproveita os botões de Ajustes (que também salvam no perfil)
  $("qbTheme")?.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    document.querySelector(`.themeBtn[data-theme="${next}"]`)?.click();
    paint();
    toast(next === "dark" ? "Modo escuro." : "Modo claro.");
  });
  $("qbPalette")?.addEventListener("click", () => {
    const i = PALETTES.findIndex((p) => p.id === getPalette());
    const next = PALETTES[(i + 1) % PALETTES.length];
    applyPalette(next.id);
    toast(`Cores: ${next.name}.`);
  });
  document.querySelectorAll(".palBtn").forEach((b) => b.addEventListener("click", () => {
    applyPalette(b.dataset.pal); toast(`Cores: ${PALETTES.find((p) => p.id === b.dataset.pal).name}.`);
  }));
  const down = () => { applyTextStep(getStep() - 1); toast(`Texto: ${SIZE_LABEL[getStep()]}.`); };
  const up = () => { applyTextStep(getStep() + 1); toast(`Texto: ${SIZE_LABEL[getStep()]}.`); };
  $("tsDown")?.addEventListener("click", down);
  $("tsUp")?.addEventListener("click", up);
  $("tsReset")?.addEventListener("click", () => { applyTextStep(0); toast("Texto: tamanho normal."); });

  // mantém a barra em dia quando algo muda por outro caminho (Ajustes, perfil, sistema)
  document.addEventListener("juntos:fxmode", paint);
  new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", paint);
  paint();
}
