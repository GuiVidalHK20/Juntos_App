import { openApp } from "./lib.mjs"; import { makeSeed } from "./seed.mjs";
const root = process.argv[2], label = process.argv[3];
const br = new Date(Date.now() - 3 * 3600e3); const today = br.toISOString().slice(0, 10);
const shift = (k, n) => new Date(Date.parse(k + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const { page, close } = await openApp(root, makeSeed(today, shift), { height: 800 });
const cdp = await page.createCDPSession(); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
async function pace(name, action, ms = 1200) {
  await sleep(500);
  const r = await page.evaluate(async (ms, actionSrc) => {
    const ts = []; let on = true; const loop = (t) => { ts.push(t); if (on) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    await new Promise((r) => setTimeout(r, 150));
    const a = performance.now(); window.__act && window.__act(); 
    await new Promise((r) => setTimeout(r, ms)); on = false;
    const d = ts.slice(1).map((t, i) => t - ts[i]).filter((_, i) => ts[i] >= a);
    d.sort((x, y) => x - y);
    return { frames: d.length, p50: Math.round(d[Math.floor(d.length * .5)] || 0), p95: Math.round(d[Math.floor(d.length * .95)] || 0), max: Math.round(d[d.length - 1] || 0), longs: d.filter((x) => x > 50).length };
  }, ms);
  console.log(label.padEnd(9), name.padEnd(26), JSON.stringify(r));
}
async function run(name, act, ms) { await page.evaluate((src) => { window.__act = new Function(src); }, act); await pace(name, act, ms); }
await run("stats → tada", `document.querySelector('nav button[data-tab="stats"]').click(); setTimeout(()=>document.querySelector('nav button[data-tab="tada"]').click(), 5)`, 1500);
await sleep(800);
await run("tada → timer", `document.querySelector('nav button[data-tab="timer"]').click()`, 1200);
await run("timer → stats", `document.querySelector('nav button[data-tab="stats"]').click()`, 1400);
await run("stats → room", `document.querySelector('nav button[data-tab="room"]').click()`, 1400);
await run("room → tada", `document.querySelector('nav button[data-tab="tada"]').click()`, 1400);
await click('.tdStyleBtn[data-s="marcar"]'); await sleep(900);
await run("marcar (1 toque)", `document.querySelectorAll('.qkBtn')[1].click()`, 1000);
await run("marcar (desmarcar)", `document.querySelectorAll('.qkBtn')[1].click()`, 1000);
await click('.tdStyleBtn[data-s="corrida"]'); await sleep(900);
await run("corrida (+1 registro)", `document.getElementById('tdText').value='teste';document.getElementById('tdAdd').click()`, 1200);
await run("peso 3", `document.querySelector('.wChip[data-w="3"]').click()`, 900);
await click(".tdSubTab[data-tsub=\"hist\"]").catch(()=>{}); await sleep(100); await run("histórico abrir", `document.querySelector('.tdSubTab[data-tsub="hist"]').click()`, 2500);
await run("histórico → mês", `document.querySelector('.thSeg [data-mode="month"]').click()`, 2500);
await close();
