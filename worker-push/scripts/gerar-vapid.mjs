// Gera o par de chaves VAPID (identifica o seu servidor perante os serviços de push). Rode UMA vez:
//   node worker-push/scripts/gerar-vapid.mjs
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = b64u(await crypto.subtle.exportKey("raw", publicKey));
const jwk = await crypto.subtle.exportKey("jwk", privateKey);
console.log("\n1) CHAVE PÚBLICA (vai em wrangler.toml → VAPID_PUBLIC_KEY e em public/firebase-config.js → pushPublicKey):\n" + pub);
console.log("\n2) CHAVE PRIVADA (SEGREDO — não commite, não mande a ninguém). Rode  npx wrangler secret put VAPID_PRIVATE_JWK  e cole esta linha:\n" + JSON.stringify(jwk));
console.log("\nGuarde a privada num gerenciador de senhas: se perder, gere outro par e todos precisarão reativar o lembrete.\n");
