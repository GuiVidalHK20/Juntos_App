// Testes da 2.25: lembrete gentil, silêncio, alto contraste e presença com menos gravações.
import { openApp } from "./lib.mjs"; import { makeSeed } from "./seed.mjs";
const root = process.argv[2];
const br = new Date(Date.now() - 3 * 3600e3); const today = br.toISOString().slice(0, 10);
const shift = (k, n) => new Date(Date.parse(k + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const { page, errors, close } = await openApp(root, makeSeed(today, shift));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, i = "") => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗", n, i); } };
const ev = (f, ...a) => page.evaluate(f, ...a);
await sleep(1500);

console.log("silenciar avisos");
await ev(() => document.getElementById("soundSheetBtn").click()); await sleep(200);
ok("painel de lembrete existe", await ev(() => !!document.getElementById("remBox")));
await ev(() => document.getElementById("quietToday").click()); await sleep(100);
ok("silencia hoje e mostra o estado", (await ev(() => document.getElementById("quietState").textContent)).includes("silenciados"));
ok("botão Reativar aparece", await ev(() => !document.getElementById("quietOff").classList.contains("hide")));
const q = await ev(async () => (await import("/js/quiet.js")).isQuiet()); ok("isQuiet() verdadeiro", q === true);
await ev(() => document.getElementById("quietOff").click()); await sleep(100);
ok("reativa", (await ev(async () => (await import("/js/quiet.js")).isQuiet())) === false);

console.log("lembrete gentil");
await ev(() => { const t = document.getElementById("remToggle"); t.checked = true; t.dispatchEvent(new Event("change")); }); await sleep(100);
ok("detalhes aparecem ao ligar", await ev(() => !document.getElementById("remDetails").classList.contains("hide")));
await ev(() => document.getElementById("remAdd").click()); await sleep(50);
ok("adiciona 2º horário", (await ev(() => document.querySelectorAll("#remTimes input").length)) === 2);
ok("7 chips de dia", (await ev(() => document.querySelectorAll("#remDays .chip").length)) === 7);
const run = (setup) => ev(async (setup) => {
  const rem = await import("/js/reminders.js"), { store } = await import("/js/store.js");
  const now = new Date(); const hh = String(now.getHours()).padStart(2, "0"), mm = String(now.getMinutes()).padStart(2, "0");
  localStorage.setItem("juntos.reminders.v1", JSON.stringify({ on: true, times: [`${hh}:${mm}`], days: [0,1,2,3,4,5,6], fired: {} }));
  if (setup.notStudied) store.profile = { ...store.profile, daily: {} };
  if (setup.quiet) localStorage.setItem("juntos.quiet.v1", String(Date.now() + 3600e3)); else localStorage.removeItem("juntos.quiet.v1");
  document.getElementById("toast").classList.remove("on"); document.getElementById("toast").textContent = "";
  rem.checkReminders(setup.late ? new Date(now.getTime() + 45 * 60000) : now);
  const first = document.getElementById("toast").textContent;
  document.getElementById("toast").textContent = ""; rem.checkReminders(now);
  return { first, second: document.getElementById("toast").textContent };
}, setup);
const a = await run({ notStudied: true });
ok("avisa no horário (texto acolhedor)", a.first.length > 10 && !/atras|perdeu|culpa|tarde demais/i.test(a.first), a.first);
ok("não repete o mesmo horário no dia", a.second === "");
await ev(async () => { const { store } = await import("/js/store.js"); const { dateKey } = await import("/js/utils.js"); store.profile = { ...store.profile, daily: { [dateKey()]: { total: 25, bySubject: {} } } }; });
ok("não avisa se já estudou hoje", (await run({ notStudied: false })).first === "");
const d = await run({ notStudied: true, quiet: true }); ok("silenciado: nada", d.first === "");
const l = await run({ notStudied: true, late: true }); ok("passou 20 min do horário: nada", l.first === "");


console.log("lembrete com o app fechado (push)");
ok("sem servidor configurado: bloco escondido", await ev(() => document.getElementById("pushBox").classList.contains("hide")));
await ev(async () => {
  window.__posts = [];
  const cfg = (await import("/firebase-config.js")).firebaseConfig; cfg.pushWorkerUrl = "https://w.dev"; cfg.pushPublicKey = "BAQ" + "A".repeat(84);
  const fake = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", unsubscribe: async () => { window.__unsubscribed = true; return true; } };
  let has = false;
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => (has ? fake : null), subscribe: async () => { has = true; return fake; } } }), addEventListener() {}, register: async () => ({}) } });
  Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" });
  window.fetch = new Proxy(window.fetch, { apply: (t, th, a) => { if (String(a[0]).startsWith("https://w.dev")) { window.__posts.push({ path: new URL(a[0]).pathname, body: JSON.parse(a[1].body) }); return Promise.resolve(new Response("{}", { status: 200 })); } return Reflect.apply(t, th, a); } });
  const t = document.getElementById("remToggle"); t.checked = false; t.dispatchEvent(new Event("change")); t.checked = true; t.dispatchEvent(new Event("change"));
});
await sleep(300);
ok("servidor configurado: bloco aparece", await ev(() => !document.getElementById("pushBox").classList.contains("hide")));
ok("aviso de privacidade visível no painel", await ev(() => /identificador do seu aparelho/.test(document.getElementById("pushBox").textContent)));
await ev(() => { const t = document.getElementById("pushToggle"); t.checked = true; t.dispatchEvent(new Event("change")); }); await sleep(600);
let posts = await ev(() => window.__posts);
const sub = posts.find((p) => p.path === "/sub");
ok("cadastra no servidor", !!sub);
ok("só endereço, horários, dias e fuso (nada de uid/nome/e-mail)", sub && Object.keys(sub.body).sort().join() === "days,endpoint,offset,skipUntil,times", sub && Object.keys(sub.body).join());
ok("fuso em minutos a leste do UTC", sub && sub.body.offset === await ev(() => -new Date().getTimezoneOffset()));
ok("marcado como ligado neste aparelho", await ev(() => JSON.parse(localStorage.getItem("juntos.push.v1")).on === true));
await ev(() => { window.__posts.length = 0; const i = document.querySelector("#remTimes input"); i.value = "07:30"; i.dispatchEvent(new Event("change", { bubbles: true })); }); await sleep(1300);
posts = await ev(() => window.__posts);
ok("mudar horário reenvia (1 vez, mesmo com várias mudanças)", posts.filter((p) => p.path === "/sub").length === 1 && posts[0].body.times.includes("07:30"), JSON.stringify(posts.map((p) => p.path)));
await ev(() => { window.__posts.length = 0; document.getElementById("quietToday").click(); }); await sleep(300);
posts = await ev(() => window.__posts); const sk = posts.find((p) => p.path === "/skip");
ok("silenciar hoje avisa o servidor (não enviar até meia-noite)", sk && sk.body.until > Date.now());
await ev(() => { window.__posts.length = 0; document.getElementById("quietOff").click(); }); await sleep(300);
ok("reativar libera (until = 0)", (await ev(() => window.__posts)).some((p) => p.path === "/skip" && p.body.until === 0));
await ev(() => { window.__posts.length = 0; document.dispatchEvent(new Event("juntos:studied")); }); await sleep(300);
ok("estudou hoje: servidor pula o resto do dia", (await ev(() => window.__posts)).some((p) => p.path === "/skip" && p.body.until > Date.now()));
await ev(() => { window.__posts.length = 0; const t = document.getElementById("remToggle"); t.checked = false; t.dispatchEvent(new Event("change")); }); await sleep(1300);
ok("desligar o lembrete apaga o cadastro no servidor", (await ev(() => window.__posts)).some((p) => p.path === "/unsub"));
await ev(() => { const t = document.getElementById("remToggle"); t.checked = true; t.dispatchEvent(new Event("change")); window.__posts.length = 0; const p = document.getElementById("pushToggle"); p.checked = false; p.dispatchEvent(new Event("change")); }); await sleep(600);
ok("desligar o push: apaga no servidor, cancela no navegador e limpa a marca", (await ev(() => window.__posts)).some((p) => p.path === "/unsub") && await ev(() => window.__unsubscribed === true && localStorage.getItem("juntos.push.v1") === null));

console.log("alto contraste");
await ev(() => document.getElementById("soundSheetClose").click());
await ev(() => { const t = document.getElementById("hcToggle"); t.checked = true; t.dispatchEvent(new Event("change")); }); await sleep(150);
ok("ligado no <html>", await ev(() => document.documentElement.dataset.hc === "on"));
ok("fundo sólido preto e texto branco", await ev(() => { const c = getComputedStyle(document.body); return getComputedStyle(document.documentElement).getPropertyValue("--text").trim().toLowerCase() === "#ffffff" && getComputedStyle(document.documentElement).getPropertyValue("--bg-grad").trim() === "#000"; }));
ok("sem desfoque de vidro", await ev(() => { const g = document.querySelector(".gCard,.ghost"); return !g || getComputedStyle(g).backdropFilter === "none"; }));
ok("escolha salva", await ev(() => localStorage.getItem("juntos.hc.v1") === "1"));
await ev(() => { const t = document.getElementById("hcToggle"); t.checked = false; t.dispatchEvent(new Event("change")); });
ok("desligado remove o atributo", await ev(() => !document.documentElement.dataset.hc && localStorage.getItem("juntos.hc.v1") === "0"));

console.log("presença (gravações)");
const w0 = await ev(() => window.__writes || 0);
await ev(async () => { const { store } = await import("/js/store.js"); store.profile = { ...store.profile, roomCode: null }; document.dispatchEvent(new Event("visibilitychange")); });
await sleep(200);
ok("sem sala: nenhuma gravação de presença", (await ev(() => window.__writes || 0)) === w0);
await ev(async () => { const { store } = await import("/js/store.js"); store.profile = { ...store.profile, roomCode: "ABC123" }; document.dispatchEvent(new Event("visibilitychange")); });
await sleep(300);
ok("com sala e aba visível: 1 gravação", (await ev(() => window.__writes || 0)) === w0 + 1, String((await ev(() => window.__writes || 0)) - w0));

const real = errors.filter((e) => !e.includes("ERR_FAILED")); ok("sem erros no console", real.length === 0, real.slice(0, 3).join(" | "));
console.log(`\n${pass} ok · ${fail} falhas`); await close(); process.exit(fail ? 1 : 0);
