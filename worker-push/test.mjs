// Testes do Worker sem internet: D1 simulado com SQLite de verdade e push simulado. Rode: node worker-push/test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { sendDue, slotsFor, mowOf, validEndpoint, vapidJwt } from "./src/index.js";

function makeD1() {
  const db = new DatabaseSync(":memory:"); db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args), _run: () => db.prepare(sql).run(...args) });
  return { db, prepare: (sql) => stmt(sql), batch: async (list) => { db.exec("BEGIN"); try { list.forEach((s) => s._run()); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
let pass = 0, fail = 0;
const ok = (n, c, i = "") => { c ? pass++ : fail++; console.log(c ? "  ✓" : "  ✗", n, c ? "" : i); };

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pubB64 = Buffer.from(await crypto.subtle.exportKey("raw", publicKey)).toString("base64url");
const env = { DB: makeD1(), ALLOWED_ORIGIN: "https://app.pages.dev", VAPID_PUBLIC_KEY: pubB64, VAPID_SUBJECT: "mailto:a@b.c", VAPID_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey("jwk", privateKey)) };
const EP = (n) => `https://fcm.googleapis.com/fcm/send/dev${n}`;
const call = (path, body, origin = env.ALLOWED_ORIGIN, method = "POST") =>
  worker.fetch(new Request("https://w.dev" + path, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined }), env);

console.log("validação");
ok("aceita FCM/Mozilla/Apple/WNS", ["https://fcm.googleapis.com/x", "https://updates.push.services.mozilla.com/x", "https://web.push.apple.com/x", "https://wns2.notify.windows.com/x"].every(validEndpoint));
ok("recusa host qualquer, http, porta e localhost (SSRF)", !["https://evil.com/x", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://127.0.0.1/x", "https://fcm.googleapis.com.evil.com/x"].some(validEndpoint));
ok("recusa outra origem (403)", (await call("/sub", {}, "https://evil.com")).status === 403);
ok("preflight CORS", (await call("/sub", null, env.ALLOWED_ORIGIN, "OPTIONS")).status === 204);
ok("corpo grande recusado", (await call("/sub", { endpoint: EP(1), x: "a".repeat(3000) })).status === 413);
ok("horário inválido recusado", (await call("/sub", { endpoint: EP(1), times: ["25:00"], days: [1], offset: -180 })).status === 400);
ok("fuso absurdo recusado", (await call("/sub", { endpoint: EP(1), times: ["19:00"], days: [1], offset: 5000 })).status === 400);

console.log("horários");
// 19:00 local no Brasil (UTC-3 → offset -180) numa segunda (1) = 22:00 UTC de segunda
ok("19:00 BRT segunda = 22:00 UTC", slotsFor(["19:00"], [1], -180)[0] === 1 * 1440 + 22 * 60);
ok("22:00 BRT domingo vira segunda 01:00 UTC", slotsFor(["22:00"], [0], -180)[0] === 1 * 1440 + 60);
ok("00:30 em UTC+9 segunda vira domingo 15:30 UTC", slotsFor(["00:30"], [1], 540)[0] === 0 * 1440 + 15 * 60 + 30);
ok("domingo 23:00 em UTC-3 atravessa a semana", slotsFor(["23:00"], [6], -180)[0] === ((6 * 1440 + 23 * 60 + 180) % 10080));
ok("mowOf coerente", mowOf(Date.UTC(2026, 10, 2, 22, 0)) === 1 * 1440 + 22 * 60); // 2/nov/2026 é segunda

console.log("cadastro");
const base = Date.UTC(2026, 10, 2, 22, 0);        // segunda 22:00 UTC = 19:00 em São Paulo
let r = await call("/sub", { endpoint: EP(1), times: ["19:00"], days: [1, 2], offset: -180 });
ok("cadastra", r.status === 200);
const n1 = env.DB.db.prepare("SELECT COUNT(*) n FROM slots").get().n; ok("2 dias × 1 horário = 2 slots", n1 === 2, n1);
r = await (await call("/sub", { endpoint: EP(1), times: ["19:00"], days: [1, 2], offset: -180 })).json();
ok("mesmo cadastro só 'toca' (1 linha, sem refazer slots)", r.touched === true);
await call("/sub", { endpoint: EP(1), times: ["19:00", "08:00"], days: [1, 2], offset: -180 });
ok("mudança refaz os slots (4)", env.DB.db.prepare("SELECT COUNT(*) n FROM slots").get().n === 4);

console.log("envio");
const calls = []; const fakeFetch = async (url, init) => { calls.push({ url, init }); return { status: 201 }; };
let o = await sendDue(env, base, fakeFetch);
ok("envia no horário", o.sent === 1 && calls.length === 1);
const h = calls[0].init.headers.Authorization;
ok("push sem corpo, TTL e urgência baixa", calls[0].init.body === undefined && calls[0].init.headers.TTL === "1800" && calls[0].init.headers.Urgency === "low");
const [, jwt] = /t=([^,]+),/.exec(h); const [a, b, c] = jwt.split(".");
const sigOk = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, Buffer.from(c, "base64url"), new TextEncoder().encode(`${a}.${b}`));
ok("token VAPID tem assinatura válida", sigOk);
const claims = JSON.parse(Buffer.from(b, "base64url")); ok("aud = origem do serviço de push, sub e exp presentes", claims.aud === "https://fcm.googleapis.com" && claims.sub === "mailto:a@b.c" && claims.exp > base / 1000);
ok("cabeçalho leva a chave pública (k=)", h.endsWith(`k=${pubB64}`));
o = await sendDue(env, base + 60000, fakeFetch); ok("não repete no minuto seguinte", o.sent === 0);
o = await sendDue(env, base + 10 * 60000, fakeFetch); ok("nem 10 min depois (intervalo mínimo)", o.sent === 0);
o = await sendDue(env, base - 3 * 3600e3, fakeFetch); ok("fora do horário: nada", o.sent === 0);
const late = Date.UTC(2026, 10, 3, 22, 31); // terça 22:31 UTC = 31 min depois do horário de terça
o = await sendDue(env, late, fakeFetch); ok("passou da tolerância (30 min): nada", o.sent === 0);
const ok2 = Date.UTC(2026, 10, 3, 22, 20); o = await sendDue(env, ok2, fakeFetch); ok("20 min atrasado ainda vale (fila)", o.sent === 1);

console.log("silêncio e limpeza");
await call("/sub", { endpoint: EP(2), times: ["19:00"], days: [1], offset: -180 });
await call("/skip", { endpoint: EP(2), until: base + 3600e3 });
const wk = base + 7 * 864e5;
await call("/skip", { endpoint: EP(2), until: wk + 3600e3 }); calls.length = 0; env.DB.db.prepare("UPDATE subs SET last_sent=0").run();
o = await sendDue(env, wk, fakeFetch); ok("silenciado (skip_until no futuro): não recebe", !calls.some((x) => x.url === EP(2)) && calls.some((x) => x.url === EP(1)), JSON.stringify(calls.map((x) => x.url)));
env.DB.db.prepare("UPDATE subs SET last_sent=0").run();
const gone = async () => ({ status: 410 }); await sendDue(env, wk, gone);
ok("410 (aparelho revogou) apaga o cadastro e os slots", env.DB.db.prepare("SELECT COUNT(*) n FROM subs WHERE endpoint=?").get(EP(1)).n === 0 && env.DB.db.prepare("SELECT COUNT(*) n FROM slots WHERE endpoint=?").get(EP(1)).n === 0);
await call("/unsub", { endpoint: EP(2) }); ok("/unsub apaga tudo do aparelho", env.DB.db.prepare("SELECT COUNT(*) n FROM subs").get().n === 0 && env.DB.db.prepare("SELECT COUNT(*) n FROM slots").get().n === 0);

console.log("limite do plano gratuito");
for (let i = 0; i < 100; i++) env.DB.db.prepare("INSERT INTO subs (endpoint,cfg,updated) VALUES (?,?,0)").run(EP(1000 + i), "x");
for (let i = 0; i < 100; i++) env.DB.db.prepare("INSERT INTO slots VALUES (?,?)").run(EP(1000 + i), mowOf(base));
calls.length = 0; o = await sendDue(env, base, fakeFetch);
ok("no máximo 44 pushes por execução (50 subrequisições no plano gratuito)", calls.length === 44, calls.length);
o = await sendDue(env, base + 60000, fakeFetch); ok("a fila continua no minuto seguinte", o.sent === 44);
o = await sendDue(env, base + 120000, fakeFetch); ok("e termina (100 no total)", o.sent === 12);
const fl = async () => { throw new Error("rede"); }; env.DB.db.prepare("UPDATE subs SET last_sent=0, fails=0").run();
await sendDue(env, base, fl); ok("falha temporária só conta falha (não apaga)", env.DB.db.prepare("SELECT COUNT(*) n FROM subs").get().n === 100 && env.DB.db.prepare("SELECT MAX(fails) f FROM subs").get().f === 1);

console.log(`\n${pass} ok · ${fail} falhas`); process.exit(fail ? 1 : 0);
