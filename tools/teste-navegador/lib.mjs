import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/json" };
export function serve(root) {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      let p = decodeURIComponent(new URL(q.url, "http://x").pathname); if (p === "/") p = "/index.html";
      const f = path.join(root, p);
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(f).pipe(r);
    }).listen(0, () => res({ s, port: s.address().port }));
  });
}
const SDK_DIR = new URL("./sdk/", import.meta.url);
// 2.27: só o SDK do Google é simulado; o firebase.js REAL do app roda por cima (inclui a separação dos campos privados)
export async function openApp(root, seed, { width = 390, height = 800, dpr = 2 } = {}) {
  const { s, port } = await serve(root);
  const browser = await puppeteer.launch({ args: [...chromium.args, "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await page.setBypassServiceWorker(true);
  const errors = []; page.on("pageerror", (e) => errors.push("pageerror: " + e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.setRequestInterception(true);
  page.on("request", (rq) => {
    const u = rq.url();
    const sdk = u.match(/\/firebasejs\/10\.12\.2\/(firebase-(app|auth|firestore)\.js)$/);
    if (sdk) return rq.respond({ status: 200, contentType: "text/javascript", body: fs.readFileSync(new URL(sdk[1], SDK_DIR), "utf8") });
    if (!u.startsWith(`http://localhost:${port}`) && !u.startsWith("data:")) return rq.abort();
    rq.continue();
  });
  await page.evaluateOnNewDocument((sd) => { globalThis.__SEED = sd; localStorage.setItem("juntos.consent", "x"); }, seed);
  await page.goto(`http://localhost:${port}/`, { waitUntil: "load" });
  return { page, browser, errors, close: async () => { await browser.close(); s.close(); } };
}
