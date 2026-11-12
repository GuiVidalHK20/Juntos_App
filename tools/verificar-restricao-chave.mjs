// Testa se a RESTRIÇÃO DE DOMÍNIO da chave de API (Google Cloud) está valendo.
// Uso (Node 18+):  node tools/verificar-restricao-chave.mjs https://SEU-SITE.pages.dev
// Faz duas chamadas simples com a sua chave: uma dizendo vir do SEU site (deve ser aceita) e outra
// dizendo vir de um site qualquer (deve ser BLOQUEADA). Se as duas passarem, a chave está sem restrição.
import { readFileSync } from "node:fs";
const site = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https:\/\//.test(site)) { console.error("Informe o seu site, ex.: node tools/verificar-restricao-chave.mjs https://juntos.pages.dev"); process.exit(2); }
const cfg = readFileSync(new URL("../public/firebase-config.js", import.meta.url), "utf8");
const key = /apiKey:\s*"([^"]+)"/.exec(cfg)?.[1];
if (!key || key === "COLE_AQUI") { console.error("apiKey não encontrada em public/firebase-config.js"); process.exit(2); }

async function tenta(referer) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json", Referer: referer + "/" }, body: JSON.stringify({ idToken: "teste" })
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, motivo: j?.error?.details?.[0]?.reason || j?.error?.status || j?.error?.message || "" };
}
const dentro = await tenta(site), fora = await tenta("https://site-de-teste-invasor.example");
console.log("Do seu site      →", dentro.status, dentro.motivo, dentro.status === 400 ? "(aceita ✔)" : "");
console.log("De outro site    →", fora.status, fora.motivo, fora.status === 403 ? "(bloqueada ✔)" : "");
if (dentro.status === 403) { console.log("\n⚠ Seu próprio site foi bloqueado: confira o endereço em 'Restrições de aplicativos' (use https://SEU-SITE/*)."); process.exit(1); }
if (fora.status !== 403) { console.log("\n✖ A chave NÃO está restrita por site. Siga o passo a passo no cabeçalho de public/firebase-config.js."); process.exit(1); }
console.log("\n✔ Restrição de domínio ativa. Teste também o login e o cronômetro no app.");
