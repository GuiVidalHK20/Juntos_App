// ============================================================
//  MODELO — copie este arquivo para "firebase-config.js" (sem ".example")
//  e cole aí as chaves do SEU projeto Firebase.
//  (Console do Firebase > ícone de engrenagem > Configurações do projeto
//   > role até "Seus apps" > ícone </> > copie o objeto firebaseConfig)
//
//  "firebase-config.js" fica de fora do git (veja .gitignore) — assim cada
//  pessoa que clona o projeto usa o SEU PRÓPRIO Firebase, sem risco de
//  publicar sem querer as chaves de outra pessoa num commit.
//
//  Estas chaves NÃO são secretas — elas podem ficar públicas no site (é
//  assim que todo app Firebase do lado do cliente funciona; o navegador de
//  quem usa o app PRECISA conseguir lê-las pra iniciar o Firebase). Quem
//  protege seus dados de verdade são as regras do Firestore
//  (regras-firestore.txt) e, complementando, restringir esta chave por
//  domínio no Google Cloud Console — veja "Segurança das chaves do
//  Firebase" no LEIA-ME.md (passo a passo das restrições de domínio e de API no Google Cloud
//  está no cabeçalho de public/firebase-config.js).
// ============================================================

export const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
  // OPCIONAL (2.25) — Firebase App Check com reCAPTCHA Enterprise. Deixe fora até ler leia-me.md → "App Check":
  // , appCheckSiteKey: "CHAVE_DO_SITE_RECAPTCHA"
  // OPCIONAL (2.26) — lembrete com o app fechado (Worker da Cloudflare; passo a passo em worker-push/LEIA-ME.md):
  // , pushWorkerUrl: "https://juntos-push.SEU-USUARIO.workers.dev", pushPublicKey: "CHAVE_PUBLICA_VAPID"
};
