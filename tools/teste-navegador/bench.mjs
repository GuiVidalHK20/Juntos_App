import { openApp } from "./lib.mjs"; import { makeSeed } from "./seed.mjs";
const root = process.argv[2], label = process.argv[3] || "app";
const br = new Date(Date.now() - 3 * 3600e3); const today = br.toISOString().slice(0, 10);
const shift = (k, n) => new Date(Date.parse(k + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const { page, errors, close } = await openApp(root, makeSeed(today, shift));
const cdp = await page.createCDPSession();
await new Promise((r) => setTimeout(r, 1500));
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });   // ~aparelho de entrada
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const M = async () => Object.fromEntries((await page.metrics() && (await cdp.send("Performance.getMetrics")).metrics).map((m) => [m.name, m.value]));
await cdp.send("Performance.enable");
const out = {};
async function scenario(name, fn) {
  await sleep(300);
  const a = await M(); const t0 = Date.now();
  const extra = await fn();
  const b = await M();
  out[name] = {
    ms: Math.round(Date.now() - t0),
    scriptMs: Math.round((b.ScriptDuration - a.ScriptDuration) * 1000),
    layoutMs: Math.round((b.LayoutDuration - a.LayoutDuration) * 1000), layouts: b.LayoutCount - a.LayoutCount,
    styleMs: Math.round((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000), styles: b.RecalcStyleCount - a.RecalcStyleCount,
    taskMs: Math.round((b.TaskDuration - a.TaskDuration) * 1000), ...(extra || {})
  };
}
const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);

// 1) abas: tempo até a tela nova estar visível e pintada
await scenario("trocar 8 abas", async () => {
  const r = await page.evaluate(async () => {
    const tabs = ["stats", "tada", "room", "timer", "stats", "tada", "room", "timer"]; const t = [];
    for (const tab of tabs) { const s = performance.now(); document.querySelector(`nav button[data-tab="${tab}"]`).click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); t.push(performance.now() - s); }
    return t.reduce((a, b) => a + b, 0) / t.length;
  });
  return { mediaPorTrocaMs: Math.round(r) };
});
await click('nav button[data-tab="tada"]'); await sleep(1500);

// 2) Done-list "Marcar": 24 toques alternando marcar/desmarcar
await click('.tdStyleBtn[data-s="marcar"]'); await sleep(600);
await scenario("marcar 24 toques", async () => {
  return page.evaluate(async () => {
    const btns = [...document.querySelectorAll(".qkBtn")].slice(0, 6); let nodesAdded = 0;
    const mo = new MutationObserver((ms) => ms.forEach((m) => { nodesAdded += m.addedNodes.length; })); mo.observe(document.getElementById("tdList"), { childList: true, subtree: true });
    const times = [];
    for (let i = 0; i < 24; i++) { const b = document.querySelector(`.qkBtn[data-q="${btns[i % 6].dataset.q}"]`); const s = performance.now(); b.click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); times.push(performance.now() - s); }
    mo.disconnect();
    return { mediaPorToqueMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length), nosCriadosPorToque: +(nodesAdded / 24).toFixed(1) };
  });
});

// 3) Corrida: adicionar 15 registros
await click('.tdStyleBtn[data-s="corrida"]'); await sleep(600);
await scenario("corrida +15 registros", async () => {
  return page.evaluate(async () => {
    let nodesAdded = 0; const mo = new MutationObserver((ms) => ms.forEach((m) => { nodesAdded += m.addedNodes.length; })); mo.observe(document.getElementById("tdList"), { childList: true, subtree: true });
    const times = [];
    for (let i = 0; i < 15; i++) { const inp = document.getElementById("tdText"); inp.value = "Registro de teste " + i; const s = performance.now(); document.getElementById("tdAdd").click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); times.push(performance.now() - s); }
    mo.disconnect();
    return { mediaPorRegistroMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length), nosCriadosPorRegistro: +(nodesAdded / 15).toFixed(1), linhas: document.querySelectorAll("#tdList .tdRow").length };
  });
});

// 4) cronômetro rodando 6 s (custo do tick)
await click('nav button[data-tab="timer"]'); await sleep(800);
await scenario("cronômetro 6 s rodando", async () => { await click("#startBtn"); await sleep(6000); await click("#startBtn").catch(() => {}); });
console.log(JSON.stringify({ label, out, erros: errors.filter((e) => !e.includes("ERR_FAILED")).slice(0, 5) }, null, 1));
await close();
