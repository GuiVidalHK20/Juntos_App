/* Juntos — Worker de lembretes (Web Push com VAPID), plano GRATUITO da Cloudflare.
   O app (public/js/pushsub.js) registra o aparelho aqui; a cada minuto o Cron deste Worker procura quem tem
   lembrete marcado para agora e manda um push SEM conteúdo (o service worker do app mostra a frase).
   Sem conteúdo = sem criptografia de mensagem, menos CPU (o plano gratuito dá só 10 ms) e nada de pessoal viaja.

   Limites do plano gratuito que moldam o código (developers.cloudflare.com/workers/platform/limits):
   - 50 subrequisições por execução (cada push e cada consulta ao D1 contam) → no máximo 44 pushes por minuto;
   - 100 mil requisições/dia (o cron usa 1.440; o resto é folga para o app);
   - 10 ms de CPU por execução (assinar o token VAPID é nativo e leve; nada pesado aqui);
   - D1: 100 mil linhas gravadas/dia → por isso "tocar" o registro grava 1 linha só (campo `cfg`).
   Capacidade honesta: ~2.600 lembretes/hora. Quem ficar além da fila por mais de GRACE_MIN minutos não recebe
   naquele horário (melhor perder um convite do que mandar um lembrete atrasado demais). */

const MAX_PER_RUN = 44;
const GRACE_MIN = 30;              // quanto tempo depois do horário ainda vale enviar
const MIN_GAP_MS = 40 * 60000;     // nunca 2 pushes para o mesmo aparelho em menos de 40 min
const MAX_SUBS = 20000;            // trava contra encher o banco com cadastros falsos
const MAX_FAILS = 8;               // falhas temporárias seguidas antes de esquecer o aparelho
const STALE_DAYS = 90;             // aparelho que não abre o app há 90 dias é esquecido
const MOW = 10080;

// Só serviços de push reais (evita que alguém use o Worker para chamar endereços quaisquer — SSRF)
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

export function validEndpoint(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && !x.port && !x.username && u.length <= 700 && PUSH_HOSTS.some((r) => r.test(x.hostname));
  } catch { return false; }
}
const validTime = (t) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/* minutos da semana em UTC para cada (dia, horário) LOCAL do aparelho. offset = minutos a leste do UTC. */
export function slotsFor(times, days, offset) {
  const out = new Set();
  for (const d of days) for (const t of times) {
    const [h, m] = t.split(":").map(Number);
    out.add((((d * 1440 + h * 60 + m - offset) % MOW) + MOW) % MOW);
  }
  return [...out];
}
export const mowOf = (ms) => { const d = new Date(ms); return d.getUTCDay() * 1440 + d.getUTCHours() * 60 + d.getUTCMinutes(); };

const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
let keyPromise = null;
function signingKey(env) {
  keyPromise ||= crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return keyPromise;
}
export async function vapidJwt(env, aud, nowMs = Date.now()) {
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const head = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT })}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await signingKey(env), new TextEncoder().encode(head));
  return `${head}.${b64u(sig)}`;           // WebCrypto já devolve r||s, o formato que o JWT ES256 pede
}

/* ---------------------------- HTTP (chamado pelo app) ---------------------------- */
const text = (t, status = 200) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
const PLACEHOLDER = /SEU-SITE|COLE_AQUI|voce@exemplo/;

/* /status: diz o que falta configurar, SEM mostrar nenhum segredo. Pensado para quem está configurando. */
async function status(env) {
  const lines = []; let bad = 0;
  const check = (okFlag, good, fix) => { if (okFlag) lines.push("✅ " + good); else { bad++; lines.push("❌ " + fix); } };
  const origin = env.ALLOWED_ORIGIN || "";
  check(/^https:\/\/[a-z0-9.-]+(\/)?$/i.test(origin) && !/\/$/.test(origin) && !PLACEHOLDER.test(origin),
    `Endereço do app liberado: ${origin}`,
    "ALLOWED_ORIGIN em wrangler.toml ainda está com o texto de exemplo (ou tem barra no fim). Use só https://seu-site.pages.dev");
  check(!!env.DB, "Banco D1 ligado ao Worker", "Banco D1 não encontrado: confira o database_id em wrangler.toml e rode o deploy de novo");
  if (env.DB) {
    try {
      const t = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('subs','slots')").all();
      const n = (t.results || []).length;
      check(n === 2, "Tabelas do banco criadas (subs e slots)", "Faltam as tabelas do banco: rode  npx wrangler d1 execute juntos-push --remote --file=schema.sql");
    } catch { check(false, "", "Não consegui falar com o banco D1: confira o nome e o database_id"); }
  }
  check(!!env.VAPID_PUBLIC_KEY && !PLACEHOLDER.test(env.VAPID_PUBLIC_KEY) && env.VAPID_PUBLIC_KEY.length > 40,
    "Chave pública VAPID configurada", "VAPID_PUBLIC_KEY em wrangler.toml ainda está vazia ou com o texto de exemplo (rode scripts/gerar-vapid.mjs)");
  let privOk = false;
  try { const j = JSON.parse(env.VAPID_PRIVATE_JWK || "null"); privOk = !!(j && j.d && j.kty === "EC"); } catch {}
  check(privOk, "Chave privada VAPID (segredo) configurada", "Chave privada não encontrada: rode  npx wrangler secret put VAPID_PRIVATE_JWK  e cole a linha JSON gerada");
  check(/^mailto:[^@\s]+@[^@\s]+$/.test(env.VAPID_SUBJECT || "") && !PLACEHOLDER.test(env.VAPID_SUBJECT || ""),
    "Contato (VAPID_SUBJECT) configurado", "VAPID_SUBJECT em wrangler.toml ainda está com o texto de exemplo: use mailto:seu-email");
  const head = bad ? "Ainda faltam ajustes (veja os ❌ abaixo):" : "Tudo certo: o servidor está pronto. Falta só ligar no app (firebase-config.js e _headers).";
  return text(head + "\n\n" + lines.join("\n"), bad ? 503 : 200);
}
const json = (o, status, cors) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...cors } });

async function handle(req, env) {
  const url = new URL(req.url);
  const origin = req.headers.get("Origin");
  const cors = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN, "Vary": "Origin" };
  // Abrir o endereço no navegador (sem o app) NÃO é erro: é só este Worker recusando quem não é o app.
  if (req.method === "GET" && url.pathname === "/health") return new Response("ok", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (req.method === "GET" && url.pathname === "/status") return status(env);
  if (req.method === "GET" && url.pathname === "/") return text("Servidor de lembretes do Juntos.\n\nEste endereço não tem página: é um serviço que o app usa.\nPara conferir se está tudo certo, abra /status (ex.: https://…workers.dev/status).", 200);
  if (origin !== env.ALLOWED_ORIGIN) return new Response("forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" } });
  if (req.method !== "POST") return json({ error: "method" }, 405, cors);
  const raw = await req.text();
  if (raw.length > 2048) return json({ error: "size" }, 413, cors);
  let b; try { b = JSON.parse(raw); } catch { return json({ error: "json" }, 400, cors); }
  if (!b || !validEndpoint(b.endpoint)) return json({ error: "endpoint" }, 400, cors);
  const now = Date.now();

  if (url.pathname === "/unsub") {
    await env.DB.batch([env.DB.prepare("DELETE FROM slots WHERE endpoint = ?").bind(b.endpoint), env.DB.prepare("DELETE FROM subs WHERE endpoint = ?").bind(b.endpoint)]);
    return json({ ok: true }, 200, cors);
  }
  if (url.pathname === "/skip") {   // silêncio ou "já estudou hoje": until em ms (0 = liberar)
    const until = Number.isFinite(b.until) ? Math.max(0, Math.min(b.until, now + 8 * 864e5)) : 0;
    await env.DB.prepare("UPDATE subs SET skip_until = ?, updated = ? WHERE endpoint = ?").bind(until, now, b.endpoint).run();
    return json({ ok: true }, 200, cors);
  }
  if (url.pathname === "/sub") {
    const times = Array.isArray(b.times) ? [...new Set(b.times.filter(validTime))].slice(0, 3) : [];
    const days = Array.isArray(b.days) ? [...new Set(b.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
    const offset = b.offset;
    if (!times.length || !days.length || !Number.isInteger(offset) || offset < -840 || offset > 840) return json({ error: "dados" }, 400, cors);
    const cfg = `${times.sort().join(",")}|${days.sort().join("")}|${offset}`;
    const skip = Number.isFinite(b.skipUntil) ? Math.max(0, Math.min(b.skipUntil, now + 8 * 864e5)) : 0;
    const row = await env.DB.prepare("SELECT cfg FROM subs WHERE endpoint = ?").bind(b.endpoint).first();
    if (row && row.cfg === cfg) {   // nada mudou: só avisa que o aparelho segue em uso (1 linha gravada)
      await env.DB.prepare("UPDATE subs SET updated = ?, skip_until = MAX(skip_until, ?) WHERE endpoint = ?").bind(now, skip, b.endpoint).run();
      return json({ ok: true, touched: true }, 200, cors);
    }
    if (!row) {
      const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM subs").first();
      if (c && c.n >= MAX_SUBS) return json({ error: "cheio" }, 503, cors);
    }
    const stmts = [
      env.DB.prepare("INSERT INTO subs (endpoint, cfg, skip_until, updated) VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET cfg = excluded.cfg, skip_until = MAX(skip_until, excluded.skip_until), updated = excluded.updated, fails = 0").bind(b.endpoint, cfg, skip, now),
      env.DB.prepare("DELETE FROM slots WHERE endpoint = ?").bind(b.endpoint),
      ...slotsFor(times, days, offset).map((m) => env.DB.prepare("INSERT INTO slots (endpoint, mow) VALUES (?, ?)").bind(b.endpoint, m))
    ];
    await env.DB.batch(stmts);
    return json({ ok: true }, 200, cors);
  }
  return json({ error: "rota" }, 404, cors);
}

/* ---------------------------- Cron (a cada minuto) ---------------------------- */
export async function sendDue(env, nowMs = Date.now(), doFetch = fetch) {
  const mows = [];
  for (let i = 0; i <= GRACE_MIN; i++) mows.push((((mowOf(nowMs) - i) % MOW) + MOW) % MOW);
  const { results } = await env.DB.prepare(
    `SELECT s.endpoint FROM subs s WHERE s.skip_until <= ? AND s.last_sent <= ? AND EXISTS
       (SELECT 1 FROM slots k WHERE k.endpoint = s.endpoint AND k.mow IN (${mows.map(() => "?").join(",")}))
     ORDER BY s.last_sent ASC LIMIT ${MAX_PER_RUN}`
  ).bind(nowMs, nowMs - MIN_GAP_MS, ...mows).all();
  if (!results.length) return { sent: 0 };

  const jwts = new Map();
  const outcomes = await Promise.all(results.map(async ({ endpoint }) => {
    try {
      const aud = new URL(endpoint).origin;
      if (!jwts.has(aud)) jwts.set(aud, vapidJwt(env, aud, nowMs));
      const res = await doFetch(endpoint, { method: "POST", headers: { Authorization: `vapid t=${await jwts.get(aud)}, k=${env.VAPID_PUBLIC_KEY}`, TTL: "1800", Urgency: "low" } });
      return { endpoint, status: res.status };
    } catch { return { endpoint, status: 0 }; }
  }));

  const stmts = [];
  let sent = 0;
  for (const o of outcomes) {
    if (o.status >= 200 && o.status < 300) { sent++; stmts.push(env.DB.prepare("UPDATE subs SET last_sent = ?, fails = 0 WHERE endpoint = ?").bind(nowMs, o.endpoint)); }
    else if (o.status === 404 || o.status === 410) { // aparelho desinstalou/revogou: esquece
      stmts.push(env.DB.prepare("DELETE FROM slots WHERE endpoint = ?").bind(o.endpoint), env.DB.prepare("DELETE FROM subs WHERE endpoint = ?").bind(o.endpoint));
    } else stmts.push(env.DB.prepare("UPDATE subs SET fails = fails + 1, last_sent = ? WHERE endpoint = ?").bind(nowMs - MIN_GAP_MS + 5 * 60000, o.endpoint)); // tenta de novo em ~5 min
  }
  // faxina diária (uma vez por dia, às 03:00 UTC): esquece aparelhos sumidos
  if (mowOf(nowMs) % 1440 === 180) {
    const old = nowMs - STALE_DAYS * 864e5;
    stmts.push(env.DB.prepare("DELETE FROM slots WHERE endpoint IN (SELECT endpoint FROM subs WHERE updated < ? OR fails >= ?)").bind(old, MAX_FAILS),
               env.DB.prepare("DELETE FROM subs WHERE updated < ? OR fails >= ?").bind(old, MAX_FAILS));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { sent, total: outcomes.length };
}

export default {
  fetch: (req, env) => handle(req, env).catch(() => new Response("erro", { status: 500 })),
  scheduled: (event, env, ctx) => { ctx.waitUntil(sendDue(env, event.scheduledTime)); }
};
