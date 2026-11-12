# CLAUDE.md

Contexto do projeto para o Claude Code. Leia isto antes de propor mudanças.

## O que é

"Juntos" — PWA de acompanhamento de tempo de estudo (pomodoro + cronômetro livre), com
estatísticas e salas de estudo em grupo em tempo real. Documentação completa para humanos:
`README.md` (visão geral), `GUIA-DO-CODIGO.md` (arquitetura, arquivo por arquivo),
`FLUXO-DE-TRABALHO.md` (branches, deploy, releases), `LEIA-ME.md` (setup do zero no Firebase/Cloudflare Pages).
**Leia `GUIA-DO-CODIGO.md` antes de editar qualquer módulo que você não conhece ainda** — ele
documenta a responsabilidade de cada arquivo e onde ficam as configurações comuns.

## Stack e restrições importantes

- **JavaScript puro, ES Modules nativos. Sem build step, sem bundler, sem TypeScript, sem
  framework.** Não sugira adicionar webpack/vite/React/etc. — é uma escolha deliberada para manter
  o projeto editável por upload direto no GitHub, sem CI de build.
- Import de bibliotecas externas (Firebase) é feito direto de URL do CDN (`gstatic.com`) dentro dos
  próprios arquivos `.js` — não há `package.json` nem `node_modules` em produção.
- O app roda inteiramente no cliente. Não existe backend próprio: Firebase Auth + Firestore fazem
  esse papel. Regras de segurança ficam em `regras-firestore.txt` (arquivo de referência; precisa
  ser colado manualmente no console do Firebase — não é aplicado automaticamente no deploy).
- **O app em si (tudo que vai pro navegador de quem usa) mora dentro de `public/`** —
  `public/index.html`, `public/main.js`, `public/js/`, `public/sw.js`,
  `public/firebase-config.js`, `public/manifest.json`, `public/icons/`,
  `public/_headers`. É essa pasta (só ela) que é publicada como site — o resto do
  repositório (`CLAUDE.md`, `GUIA-DO-CODIGO.md`, `LEIA-ME.md`, `regras-firestore.txt`,
  `CHANGELOG.md` etc.) fica de fora do site publicado de propósito (documentação interna
  não tem por que ficar acessível publicamente). Ao criar ou mover um arquivo, confirme
  se ele é parte do app (vai para dentro de `public/`) ou documentação (fica na raiz).
- `index.html` contém toda a estrutura E todo o CSS (dentro de `<style>`). Não crie arquivos `.css`
  separados a menos que peçam explicitamente — mantenha o padrão atual.
- Mudanças em `sw.js` (service worker) exigem subir o número de `CACHE` no topo do arquivo, ou o
  navegador pode continuar servindo a versão antiga em cache.
- Ao adicionar/alterar campos no Firestore, verifique se `regras-firestore.txt` precisa de uma
  regra nova — e avise isso claramente, já que é um passo manual do usuário.

## Arquitetura em uma frase

`index.html` define a interface; `main.js` inicializa e liga os módulos de `js/`; cada módulo tem
uma responsabilidade única e todos compartilham estado através do objeto `store` (`js/store.js`),
importado por referência — sem gerenciador de estado externo.

## Convenções deste projeto

- Nomes de variáveis, comentários e toda a UI ficam em **português (pt-BR)** — é o público do app.
  Código e nomes de função seguem o inglês comum de JS (`function`, `const`, etc.), só os
  comentários/strings de interface são em português.
- Escritas no Firestore feitas a partir de interação contínua do usuário (sliders, campos de texto)
  devem ser **debounced** com o helper `debounce()` de `js/utils.js` — não grave a cada evento.
- Ações que o usuário espera ver refletidas na hora (salvar perfil, adicionar matéria, enviar
  mensagem) devem atualizar `store`/a tela **otimisticamente** antes de aguardar a resposta do
  Firestore, seguindo o padrão já usado em `js/subjects.js` e `js/messages.js`.
- Módulos usados raramente (`js/wrapped.js`, `js/pip.js`) são carregados via `import()` dinâmico
  dentro da função que os aciona — não os importe estaticamente no topo de outro módulo.
- Ao tocar no cronômetro (`js/timer.js`), lembre que ele precisa continuar correto mesmo se o app
  for fechado e reaberto — a lógica é baseada em timestamps (`Date.now()`), nunca em contadores de
  `setInterval` sozinhos. Teste mentalmente o cenário "o que acontece se isso rodar depois de o app
  ficar 10 minutos fechado".

## Fluxo de trabalho esperado

- Este repositório usa um branch `dev` para testar antes de publicar em `main` — veja
  `FLUXO-DE-TRABALHO.md`. Ao terminar uma mudança, faça commit com uma mensagem clara
  (`feat: `, `fix: `, `refactor: `, `docs: `, `chore: ` como prefixo) e pergunte antes de dar merge
  em `main` sozinho.
- Depois de qualquer mudança visível ao usuário, suba o número em `APP_VERSION`
  (`js/constants.js`) e adicione uma entrada em `CHANGELOG.md`, seção **[Não lançado]**.
  Se a mudança for algo que a pessoa que usa o app perceberia (não só um ajuste interno),
  adicione também uma entrada correspondente, em linguagem simples e sem jargão técnico,
  no topo do array `RELEASES` de `js/whatsnew.js` — é o que aparece no painel "✨
  Novidades" dentro do próprio app. Nem toda entrada do changelog técnico vira uma
  entrada lá (ex.: refatoração interna, correção de lint) — só o que muda a experiência
  de quem usa.
- Não há testes automatizados no projeto ainda. Ao alterar `js/timer.js` ou `js/room.js`
  (os módulos com mais estado), descreva no resumo da mudança quais cenários você verificou
  manualmente (ex: "testei pausar/retomar, fechar a aba com o ciclo rodando e reabrir").

## O que evitar

- Não reintroduza um `app.js` monolítico — a divisão em módulos foi intencional (ver
  `GUIA-DO-CODIGO.md`, seção 1).
- Não adicione `localStorage`/`sessionStorage` como fonte da verdade para dados que precisam
  sincronizar entre pessoas (isso é sempre Firestore); local storage aqui é só para
  cache/conveniência do próprio aparelho.
- Não assuma que o usuário lerá mensagens de erro técnicas — qualquer `toast()` ou texto de erro
  voltado à interface deve ser em português simples, como já é em todo o app.
- **Segurança/privacidade (2.9.0):** nunca grave dado sensível em `users/{uid}` (legível pela sala) — use os
  campos de `PRIVATE_FIELDS` em `js/firebase.js`. Todo campo vindo de outro usuário passa por `esc()`,
  `safeColor()`, `safeUrl()` ou `safeNum()` antes de entrar em HTML. Mudou regra/campo? Atualize
  `regras-firestore.txt` e avise que é passo manual. Mudou Termos/Política? Suba `CONSENT_VERSION`.


- **Acessibilidade/offline (2.13):** `toast()` já fala para leitores de tela (use `{ silent: true }` se fizer o próprio `announce()` de `js/a11y.js`). Gravações no Firestore feitas no fim de ciclo **não** devem usar `await` (offline a promessa só resolve na volta da internet); use `.catch(() => {})`. O dia/hora do app vem de `zonedParts()`/`brNow()` (Intl) — não reintroduza `new Date(texto)`. Ao editar o `<script>` inline do `index.html`, recalcule o hash na CSP (`_headers`). Novos módulos estáticos entram em `SHELL` no `sw.js` (e suba `CACHE`).

- **Offline/segurança (2.15):** `sw.js` — toda resposta guardada/entregue passa por `cleanResponse()` (nunca guarde uma resposta `redirected`). Arquivo novo em `public/` → entra em `SHELL` e suba `CACHE`; rode `node tools/verificar-offline.mjs`. Não use `await` em gravação do Firestore na abertura do app (`auth.js`). Datas: some/subtraia dias só com `shiftDateKey`/`daysBetweenKeys`/`todayKey` (nunca `new Date()` local + `setDate`). Token do Firebase: persistência IndexedDB, nunca force `browserLocalPersistence`. Cifragem: só `crypto.subtle` em `js/crypto.js`; formato novo = novo prefixo, mantendo a leitura dos antigos.

- **Ta-da (2.20):** done-list e gratidão vivem em subcoleções `users/{uid}/tada/{dia}` e `gratitude/{dia}` (um documento por dia — nunca uma lista única no perfil, por causa do limite de 1 MB). Liberação para amigos: `tadaSharedWith` e `gratSharedWith`, listas separadas. Limites em `js/tada-data.js` devem bater com `regras-firestore.txt`. O estudo do dia na done-list é derivado de `daily`, não gravado. `private/planner` é legado (só leitura do dono).

- **Estatísticas em vidro tingido (2.24):** todo bloco da aba é um `.gCard` com um tom (`t-cyan|violet|green|gold|rose|orange|blue`), cabeçalho `.gHead` (selo `.gIco` + `.gTitle` + `.gSub`) e ícones de `js/icons.js`. Cartão novo = classe + tom + ícone; não crie cor nova solta. Valores de tempo em cartões usam `fmtMinRich` (números em `<b>` para a contagem animada). A tendência foi removida de propósito — não recoloque.
- **Movimento e DOM pontual (2.22):** listas do Ta-da são atualizadas com `morph` (`js/dom.js`), **não** com `innerHTML`. Regras: (1) NUNCA ligue `addEventListener` em botões dentro de uma lista que passa pelo `morph` — use **delegação** num pai estável, ligada uma vez (`if (!box.__wired)`); (2) o que precisa ser reconhecido entre atualizações leva `data-k` (ou `data-q`); (3) `animate:false` na primeira montagem/troca de dia ou estilo; (4) animações só via `js/motion.js` (respeita Completo/Suave/reduzir movimento; só `transform`/`opacity`); para muitos itens de uma vez (calendário, barras) use animação CSS com `--i`, não dezenas de `element.animate()`; **não use View Transitions na troca de aba** (testado em 2.22.0 e retirado: flash da tela antiga + custo); (5) no cronômetro, no `tick` use `setText`/`setAttr`, nunca `textContent =` direto (escrever o mesmo texto ainda invalida o layout). `tools/teste-navegador` roda o app num Chromium de verdade — rode `e2e.mjs` antes de mexer em listas.
- **Histórico do Ta-da (2.21):** `js/tada-history.js` (carregado sob demanda por `tada.js`) lê semana/mês dos documentos por dia (fonte da verdade, nunca apagados) e o ano das estatísticas salvas `users/{uid}/tadaStats/{AAAA-MM}` (só números; só o dono lê). Toda gravação de dia passa por `writeDay`, que agenda o resumo (`scheduleStats`) — não grave em `tada`/`gratitude` por outro caminho. `mine` só tem os ~45 registros mais recentes: dia antigo é **somente leitura** (nunca edite um dia que não está em `mine`, senão `rewriteWins` sobrescreve com lista vazia). `full: true` só pode ser gravado a partir do mês inteiro lido dos documentos por dia. Tom do painel: só conquistas, nada de "dias perdidos". Mudou campo do resumo? Atualize `STAT_KEYS`, `validTadaStats` e o `changelog`.
- **Cronômetro e atualização (2.20.1):** o estado do cronômetro é lido de forma síncrona em `initTimer` (`hydrateTimer`) — nunca grave `TIMER_LS_KEY` antes disso, nunca grave estado "parado" por cima de um ciclo (use `clearTimerState` só ao encerrar), e não conclua fase sem `store.me`. Salvar ao sair: `pagehide`/`visibilitychange`, não `beforeunload`. `sw.js` serve o app como uma **geração atômica** do cache (instala tudo ou nada, sem `skipWaiting` automático); `js/updates.js` ativa a versão nova e recarrega antes de a tela aparecer. Não reintroduza "rede primeiro com timeout" por arquivo (mistura versões) nem runtime-cache de arquivos do app. Arquivo novo em `public/` → `SHELL` + subir `CACHE`. O painel de Novidades abre sozinho só com a versão mais recente.

- **Cota e avisos (2.25):** o plano gratuito do Firestore tem 20 mil gravações/50 mil leituras por dia e `writeBatch` NÃO reduz a cobrança (conta por documento). Antes de acrescentar gravação periódica, pergunte "quem lê isso?" — presença/status só valem com sala (`main.js → beat`). Avisos novos devem consultar `isQuiet()` de `js/quiet.js` (exceto o do cronômetro iniciado pela pessoa), nunca pedir permissão na abertura, e usar texto de convite (sem culpa/prazo). Lembretes e alto contraste são por aparelho (localStorage; chaves em `constants.js`, apagadas em `wipeLocalData`). Alto contraste: use as variáveis de cor, nunca cor fixa nova. App Check é opcional (`appCheckSiteKey`); mexeu no script do `<head>`? Recalcule o hash na CSP.
- **Push com o app fechado (2.26):** `worker-push/` é um projeto SEPARADO (deploy com wrangler, fora do `public/`). Plano grátis = 50 subrequisições/execução: nunca aumente `MAX_PER_RUN` (44) sem trocar de plano. O push é vazio (sem criptografia, sem dado pessoal); a frase vive no `sw.js`. O app só manda ao servidor endereço, horários, dias, fuso e "silenciado até" — nada de uid/nome/e-mail; manter assim, e qualquer campo novo exige atualizar a Política e `CONSENT_VERSION`. `pushsub.js` é módulo-folha (auth.js o importa). Gravação nova por ciclo? Junte-a ao documento que já é gravado (ver `reviewPatch`).
- **Testes do app (2.27):** o harness `tools/teste-navegador` simula só o SDK do Google (pasta `sdk/`); o `firebase.js` real roda por cima, então a separação de campos privados (`PRIVATE_FIELDS`) é testada de verdade. Nunca volte a substituir o `firebase.js` inteiro no teste: isso escondeu gravações reais. Para contar gravações, use `window.__wlog` (lista de caminhos) e não só `__writes`.

