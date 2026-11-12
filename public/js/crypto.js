/* Cifragem das mensagens da sala — SÓ com a Web Crypto API do navegador (AES-256-GCM + PBKDF2-SHA-256).

   O que mudou na 2.15 (e por quê):
   - Este arquivo NÃO implementa nenhum algoritmo de criptografia: ele só chama `crypto.subtle`, a
     biblioteca padrão e auditada que o próprio navegador/sistema fornece (a mesma que as bibliotecas
     populares usam por baixo). Não há cifra, modo de operação ou gerador de números aleatórios feitos
     à mão. O que continua sendo "nosso" é só a COLA entre as peças (como a chave é derivada).
   - Não trocamos por uma biblioteca externa de propósito: o app não tem build (CLAUDE.md) e a CSP só
     libera scripts do próprio site e do Firebase; uma lib a mais seria código de terceiros rodando
     com acesso à sessão, sem ganho de algoritmo (seria AES-GCM de qualquer forma).
   - Formato novo "enc2:": sal próprio por sala (antes um sal fixo igual para todas), 600.000
     iterações de PBKDF2 (recomendação OWASP 2023; antes 100.000), fim da "pimenta" fixa (ela fingia
     ser um segredo, mas está no código-fonte público) e AAD: o texto cifrado fica amarrado à sala E
     a quem enviou. Mover a mensagem para outra sala ou trocar o campo `from` faz a abertura falhar.
   - Mensagens "enc1:" (formato antigo) e sem prefixo (mais antigas) continuam abrindo normalmente.

   LIMITES HONESTOS (não são "ponta a ponta"):
   - A chave vem do CÓDIGO DA SALA, que todo membro conhece. Quem está na sala lê as mensagens — como
     sempre pôde. O ganho é que o banco (console do Firebase, backup, vazamento) guarda só bytes
     ilegíveis. Cifragem de verdade ponta a ponta exigiria uma chave por pessoa e troca de chaves entre
     aparelhos: é outro projeto, e prometer isso agora seria enganar quem usa.
   - O código tem 8 caracteres sorteados (≈40 bits). As 600.000 iterações encarecem cada tentativa de
     um atacante que tenha roubado o banco, mas não substituem um código longo: não compartilhe o
     código em público. */

const ITER_V2 = 600000;
const ITER_V1 = 100000;
const V1 = "enc1:";
const V2 = "enc2:";
const enc = new TextEncoder();

const keyCacheV1 = new Map(); // roomCode -> Promise<CryptoKey>
const keyCacheV2 = new Map();

function hasWebCrypto() {
  return typeof crypto !== "undefined" && !!crypto.subtle && typeof crypto.getRandomValues === "function";
}

/* ---------- derivação de chave ---------- */
async function deriveKeyV2(roomCode) {
  // sal exclusivo da sala: SHA-256 de um texto fixo + o código (separação de domínio)
  const salt = await crypto.subtle.digest("SHA-256", enc.encode("juntos|msg|v2|salt|" + roomCode));
  const material = await crypto.subtle.importKey("raw", enc.encode(roomCode), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITER_V2, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}
// formato antigo, só para ABRIR mensagens já gravadas — nunca usado para gravar
async function deriveKeyV1(roomCode) {
  const material = await crypto.subtle.importKey("raw", enc.encode(roomCode + "juntos-app-msg-v1"), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("juntos-salt-v1"), iterations: ITER_V1, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
}
function cached(map, roomCode, make) {
  if (!map.has(roomCode)) {
    const p = make(roomCode);
    p.catch(() => map.delete(roomCode)); // não "gruda" uma falha passageira
    map.set(roomCode, p);
  }
  return map.get(roomCode);
}

/* ---------- base64 ---------- */
function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64ToBuf(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// dados autenticados (AAD): amarra o texto cifrado à sala e ao remetente
const aad = (roomCode, sender) => enc.encode(`juntos|msg|v2|${roomCode}|${sender || ""}`);

/* Devolve o texto cifrado, pronto para o Firestore. `sender` = uid de quem envia (entra no AAD; quem
   abrir precisa informar o mesmo). Se não der para cifrar, LANÇA erro: o app nunca cai de volta para
   texto puro em silêncio. */
export async function encryptText(text, roomCode, sender = "") {
  if (!roomCode || !hasWebCrypto()) throw new Error("sem-criptografia");
  const key = await cached(keyCacheV2, roomCode, deriveKeyV2);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96 bits aleatórios por mensagem (padrão do GCM)
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(roomCode, sender), tagLength: 128 }, key, enc.encode(String(text))
  );
  return V2 + bufToB64(iv) + ":" + bufToB64(cipher);
}

// Devolve o texto legível. Mensagens sem prefixo (anteriores à cifragem) voltam como estão.
export async function decryptText(payload, roomCode, sender = "") {
  if (typeof payload !== "string" || !roomCode || !hasWebCrypto()) return payload;
  const isV2 = payload.startsWith(V2), isV1 = payload.startsWith(V1);
  if (!isV2 && !isV1) return payload;
  try {
    const [ivB64, cipherB64] = payload.slice(5).split(":");
    const iv = b64ToBuf(ivB64);
    if (iv.length !== 12 || !cipherB64) throw new Error("formato");
    const data = b64ToBuf(cipherB64);
    const plain = isV2
      ? await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad(roomCode, sender), tagLength: 128 }, await cached(keyCacheV2, roomCode, deriveKeyV2), data)
      : await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await cached(keyCacheV1, roomCode, deriveKeyV1), data);
    return new TextDecoder().decode(plain);
  } catch {
    return "🔒 mensagem cifrada (não foi possível abrir)";
  }
}
