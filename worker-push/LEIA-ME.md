# Worker de lembretes (push com o app fechado) — 100% gratuito

Sem isto, o lembrete gentil só dispara com o app aberto ou minimizado. Com isto, o navegador recebe o aviso mesmo
com o app fechado (Chrome/Edge/Firefox no computador e no Android; no iPhone/iPad só com o app instalado na tela
de início, iOS 16.4 ou mais novo). **É opcional**: sem os passos abaixo, o app funciona igual e o botão nem aparece.

## O que é e o que NÃO é
- Usa **Web Push (VAPID)** direto — não precisa de FCM, Firebase Admin, conta de serviço nem cartão de crédito.
- O push vai **sem conteúdo**; a frase acolhedora mora no `sw.js`. Nada pessoal viaja pelo serviço de push.
- O servidor guarda só: endereço de notificação do aparelho, horários, dias, fuso, "silenciado até" e data do
  último envio. **Sem uid, nome ou e-mail.** (Ainda é dado pessoal pseudonimizado: a Política de Privacidade 1.2 já diz isso.)

## Limites do plano gratuito (e o que fazem)
| Limite (Cloudflare Workers/D1 grátis) | Efeito aqui |
|---|---|
| 50 subrequisições por execução | máx. **44 lembretes por minuto** (≈ 2.600/hora). Quem ficar mais de 30 min na fila perde aquele horário |
| 100 mil requisições/dia | o cron usa 1.440; sobra para o app cadastrar/atualizar |
| 10 ms de CPU | por isso o push é vazio (sem criptografia de mensagem) |
| D1: 100 mil linhas gravadas/dia | atualizar sem mudança grava 1 linha; mudar horários ~5–23 |
| 20.000 aparelhos (trava `MAX_SUBS` no código) | evita encher o banco com cadastros falsos |
Se um dia passar disso, o plano pago da Cloudflare (US$ 5/mês) tira o limite de 50 — o código não muda.

## Passo a passo (cerca de 15 min, no terminal do seu computador)
1. Crie uma conta grátis em cloudflare.com (a mesma do Pages serve). Instale o Node 20+.
2. `cd worker-push` e `npm i -g wrangler` (ou use `npx wrangler …`). Entre: `npx wrangler login`.
3. Crie o banco: `npx wrangler d1 create juntos-push` → copie o `database_id` mostrado para `wrangler.toml`.
4. Crie as tabelas: `npx wrangler d1 execute juntos-push --remote --file=schema.sql`
5. Gere as chaves VAPID: `node scripts/gerar-vapid.mjs` (na raiz do projeto: `node worker-push/scripts/gerar-vapid.mjs`).
   - Cole a **pública** em `wrangler.toml` (`VAPID_PUBLIC_KEY`).
   - Rode `npx wrangler secret put VAPID_PRIVATE_JWK` e cole a linha JSON da **privada** (segredo!).
6. Edite em `wrangler.toml`: `ALLOWED_ORIGIN` (o endereço exato do seu app, ex. `https://seu-site.pages.dev`, sem barra
   no fim) e `VAPID_SUBJECT` (`mailto:` do responsável).
7. Publique: `npx wrangler deploy`. Anote o endereço (`https://juntos-push.SEU-USUARIO.workers.dev`).
   Teste: abra `https://juntos-push.SEU-USUARIO.workers.dev/status` no navegador (o guia de problemas está logo abaixo).
8. No app, em `public/firebase-config.js` acrescente:
   `pushWorkerUrl: "https://juntos-push.SEU-USUARIO.workers.dev", pushPublicKey: "A_CHAVE_PUBLICA"`.
9. Em `public/_headers`, na linha `Content-Security-Policy`, em `connect-src`, acrescente o endereço **exato** do Worker
   (sem curinga). Sem isso o navegador bloqueia o cadastro.
10. Publique o app. Em Ajustes → Som e notificações, ligue o lembrete e depois "Receber mesmo com o app fechado".

## Como conferir
- `npx wrangler tail` mostra o Worker trabalhando em tempo real.
- Cloudflare → Workers → juntos-push → Métricas: requisições e erros. Cloudflare → D1 → uso: linhas lidas/gravadas.
- Teste de ponta a ponta: marque o lembrete para 2 min à frente, feche o app e espere.
- Testes locais do código do Worker (sem internet): `node worker-push/test.mjs`.

## Segurança embutida
- Só aceita chamadas vindas de `ALLOWED_ORIGIN` e só endereços de serviços de push reais (Google, Mozilla, Apple,
  Microsoft) — o Worker não pode ser usado para chamar sites quaisquer.
- Corpo ≤ 2 KB; horários, dias e fuso validados; trava de 20.000 cadastros.
- A chave privada VAPID fica só como *secret* da Cloudflare. Se vazar: gere outro par, atualize o secret e a
  `pushPublicKey`; todos precisarão religar o lembrete.
- Limite conhecido: a origem (`Origin`) pode ser forjada fora do navegador; um abusador ainda poderia cadastrar
  endereços falsos até a trava de 20.000. Não expõe dados de ninguém; no pior caso, interrompe novos cadastros até
  você rodar `DELETE FROM subs WHERE updated < …` no D1.

## Desligar / apagar tudo
- Pessoa: desligar o botão, sair da conta ou excluir a conta apaga o cadastro dela no servidor.
- Você: `npx wrangler delete` remove o Worker; `npx wrangler d1 delete juntos-push` remove o banco. Tire as duas chaves
  do `firebase-config.js` e o app volta ao lembrete só-dentro-do-app.
- Se NÃO for usar o servidor, pode voltar `CONSENT_VERSION` para "1.1" e tirar a linha do servidor da Política
  (privacidade.html, linhas "Lembrete com o app fechado" e "Cloudflare Workers e D1") para não pedir novo aceite.


---

## Guia para quem é iniciante: o que fazer se der erro

**Primeiro, uma coisa que confunde muita gente:** se você abrir o endereço do Worker no navegador e aparecer a palavra
`forbidden`, isso **não é um erro**. É o Worker recusando quem não é o seu app, que é exatamente o que deve fazer.
Use estes dois endereços para testar:

| Endereço (troque pelo seu) | O que deve aparecer |
|---|---|
| `https://juntos-push.SEU-USUARIO.workers.dev/health` | a palavra `ok` |
| `https://juntos-push.SEU-USUARIO.workers.dev/status` | a lista de verificações: ✅ = certo, ❌ = falta fazer |

Se `/health` mostrar `ok`, o Worker está no ar. O `/status` diz o que falta, sem mostrar nenhum segredo.

### Quais ❌ aparecem e o que fazer
| Mensagem no /status | Solução |
|---|---|
| `ALLOWED_ORIGIN ... texto de exemplo` | Abra `worker-push/wrangler.toml` e troque `https://SEU-SITE.pages.dev` pelo endereço real do seu app (o que aparece na barra do navegador ao usar o app). Sem barra no fim. Depois rode `npx wrangler deploy` de novo. |
| `Banco D1 não encontrado` | O `database_id` em `wrangler.toml` está errado ou faltando. Rode `npx wrangler d1 list`, copie o ID do `juntos-push` e cole. Depois `npx wrangler deploy`. |
| `Faltam as tabelas do banco` | Rode no terminal, dentro da pasta `worker-push`: `npx wrangler d1 execute juntos-push --remote --file=schema.sql` |
| `VAPID_PUBLIC_KEY ... vazia` | Rode `node scripts/gerar-vapid.mjs`, copie a linha 1 (pública) para `VAPID_PUBLIC_KEY` no `wrangler.toml` e faça `npx wrangler deploy`. |
| `Chave privada não encontrada` | Rode `npx wrangler secret put VAPID_PRIVATE_JWK`, cole a linha 2 (a que começa com `{`) e aperte Enter. Não é preciso `deploy` de novo. |
| `VAPID_SUBJECT ... exemplo` | Em `wrangler.toml`, troque `mailto:voce@exemplo.com` pelo seu e-mail, no formato `mailto:seu@email.com`. |

### Erros comuns no terminal (CMD / PowerShell)
- **`'npx' não é reconhecido`**: o Node.js não está instalado. Baixe a versão LTS em nodejs.org, feche e abra o terminal de novo.
- **`wrangler.toml not found` ou `Missing entry-point`**: o terminal não está na pasta certa. Digite `cd` seguido do caminho da pasta `worker-push` (ex.: `cd C:\Users\VOCE\Downloads\Juntos\worker-push`) e confira com `dir`: precisa aparecer o arquivo `wrangler.toml`.
- **`Could not find a database with name` ou `database_id`**: o banco não foi criado ou o ID está errado. Veja a linha de `d1 list` acima.
- **`Authentication error` / `Not logged in`**: rode `npx wrangler login` e autorize no navegador que abrir.
- **Ao colar a chave privada, o terminal "come" caracteres**: não cole no meio de outro comando. Rode `npx wrangler secret put VAPID_PRIVATE_JWK` sozinho, espere o pedido e cole a linha inteira, depois Enter.
- **`Code: 1042` ou página de erro da Cloudflare**: o endereço do Worker está errado. Use o que aparece depois do `deploy` (linha que começa com `https://juntos-push`).

### Depois que o /status estiver todo ✅
1. Em `public/firebase-config.js`, acrescente a linha com o endereço do Worker (sem a barra no fim) e a chave pública.
2. Em `public/_headers`, em `connect-src`, acrescente o endereço exato do Worker. Sem isso o navegador bloqueia o cadastro.
3. Publique o app de novo (Cloudflare Pages).
4. No app: Ajustes → Som e notificações → ligue o lembrete → ligue "Receber mesmo com o app fechado" e aceite a permissão.
Se o botão não aparecer, é porque o passo 1 não foi feito; se aparecer mas não ligar, é o passo 2.
