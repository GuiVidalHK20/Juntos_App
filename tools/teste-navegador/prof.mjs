import { openApp } from "./lib.mjs"; import { makeSeed } from "./seed.mjs";
const root = process.argv[2];
const br = new Date(Date.now() - 3 * 3600e3); const today = br.toISOString().slice(0, 10);
const shift = (k, n) => new Date(Date.parse(k + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const { page, close } = await openApp(root, makeSeed(today, shift));
const cdp = await page.createCDPSession(); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
// aquece (carrega módulos lazy) sem medir
for (const t of ["stats", "tada", "room", "timer"]) { await page.evaluate((t) => document.querySelector(`nav button[data-tab="${t}"]`).click(), t); await sleep(900); }
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
await cdp.send("Performance.enable");
for (const [name, seq] of [["stats", ["stats", "timer"]]]) {
  await cdp.send("Profiler.start");
  const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  for (let i = 0; i < 4; i++) for (const t of seq) { await page.evaluate((t) => document.querySelector(`nav button[data-tab="${t}"]`).click(), t); await sleep(700); }
  const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const { profile } = await cdp.send("Profiler.stop");
  const self = new Map(); const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const key = `${f.functionName || "(anon)"} ${f.url.split("/").slice(-1)[0]}:${f.lineNumber}`; self.set(key, (self.get(key) || 0) + dt[i] / 1000); });
  const top = [...self.entries()].filter(([k]) => !k.startsWith("(idle)") && !k.startsWith("(program)")).sort((a, b) => b[1] - a[1]).slice(0, 7);
  console.log(`\n== ${name} (8 trocas) script=${Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000)}ms layout=${Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000)}ms/${m1.LayoutCount - m0.LayoutCount} style=${Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000)}ms/${m1.RecalcStyleCount - m0.RecalcStyleCount}`);
  top.forEach(([k, v]) => console.log("  ", Math.round(v) + "ms", k));
}

// Histórico (abrir + alternar semana/mês) e Corrida (+registros)
await page.evaluate(() => document.querySelector('nav button[data-tab="tada"]').click()); await sleep(1200);
async function prof(name, fn) {
  await cdp.send("Profiler.start"); const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  await fn();
  const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value])); const { profile } = await cdp.send("Profiler.stop");
  const self = new Map(); const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  profile.samples.forEach((id, i) => { const f = byId.get(id).callFrame; const key = `${f.functionName || "(anon)"} ${f.url.split("/").slice(-1)[0]}:${f.lineNumber}`; self.set(key, (self.get(key) || 0) + dt[i] / 1000); });
  console.log(`\n== ${name} script=${Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000)}ms layout=${Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000)}ms/${m1.LayoutCount - m0.LayoutCount} style=${Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000)}ms/${m1.RecalcStyleCount - m0.RecalcStyleCount}`);
  [...self.entries()].filter(([k]) => !/^\((idle|program)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 7).forEach(([k, v]) => console.log("  ", Math.round(v) + "ms", k));
}
await page.evaluate(() => document.querySelector('.tdStyleBtn[data-s="corrida"]').click()); await sleep(800);
await prof("corrida +6 registros", async () => { for (let i = 0; i < 6; i++) { await page.evaluate((i) => { document.getElementById("tdText").value = "r" + i; document.getElementById("tdAdd").click(); }, i); await sleep(600); } });
await prof("histórico abrir+mês+ano", async () => { for (const s of ['.tdSubTab[data-tsub="hist"]', '.thSeg [data-mode="month"]', '.thSeg [data-mode="year"]', '.thSeg [data-mode="week"]']) { await page.evaluate((s) => document.querySelector(s).click(), s); await sleep(1800); } });
await close();
