# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui. O formato segue
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/), e o projeto usa
[Versionamento Semântico](https://semver.org/lang/pt-BR/) (`MAIOR.MENOR.CORREÇÃO`).

A partir da versão 2.0.0, cada mudança publicada ganha uma entrada nova aqui — nesta ordem:
adicione em **Não lançado**, e quando for publicar de verdade, renomeie a seção para o número da
versão e a data (veja `FLUXO-DE-TRABALHO.md` para o processo completo de lançamento).

## [Não lançado]
### Lembrete com o app fechado (Worker gratuito) e menos gravações por ciclo (2.27.0)
**Em palavras simples:** (1) o lembrete de estudo pode chegar com o app fechado, usando um servidor gratuito da Cloudflare (opcional, desligado até você configurar); (2) cada ciclo grava menos no banco. **A Política subiu para 1.2: todos verão o aceite uma vez.** Nenhuma regra do Firestore mudou.
**Ponto 2 — gravações (medido com o Firebase falso)**
- Medido com o `firebase.js` REAL do app (só o SDK do Google é simulado; ver `tools/teste-navegador/sdk/`): um ciclo sem sala passou de **6 → 3 gravações** e com sala de **7 → 4**. Mudanças: o status da sala só grava com sala; `stopAndSave` não publica o status duas vezes (`pauseTimer({ skipPublish: true })`); a revisão espaçada sai do `scheduleReview` separado e vai no mesmo `updateDoc` do total (`spaced.js → reviewPatch`). **Atenção:** `reviewSchedule` fica em `users/{uid}/private/mind` (`PRIVATE_FIELDS`), então é uma gravação separada; a economia da revisão foi de 1 gravação, não zero. Os números acima são os corretos. Uma versão anterior deste changelog dizia 6 → 2, mas aquele número saiu de um simulador que não separava os campos privados e estava errado.
- Continuam gravando por serem conteúdo da pessoa: a nota do ciclo, a gratidão e os cartões.
- Ficou de fora de propósito: "1 documento por dia / à meia-noite" (o app pode estar fechado à meia-noite; os totais são incrementos atômicos que já funcionam offline) e atrasar a gravação do ciclo até a nota (perderia o ciclo se o app fechasse com a janela aberta).
**Ponto 1 — push com o app fechado**
- `worker-push/` (Cloudflare Worker + D1 + Cron por minuto; **Web Push com VAPID, sem FCM**): push sem conteúdo, 44 envios por minuto (limite de 50 subrequisições do plano grátis), tolerância de 30 min, mínimo de 40 min entre envios, recusa endereços que não sejam de serviços de push (SSRF), CORS só da origem do app, trava de 20.000 cadastros, faxina diária. Guia de deploy: `worker-push/LEIA-ME.md`. Testes: `node worker-push/test.mjs` (33 verificações, D1 simulado com SQLite e token VAPID verificado). Testes do app agora rodam o `firebase.js` real (64 + 34 passando).
- `js/pushsub.js` (app): liga/desliga, cadastra só endereço+horários+dias+fuso+"silenciado até" (sem uid/nome/e-mail), reenvia 1x/dia ou ao mudar, e avisa o servidor ao silenciar ou ao estudar (pula o resto do dia). Sair da conta/excluir conta apaga o cadastro no servidor. Só aparece se `pushWorkerUrl` e `pushPublicKey` estiverem em `firebase-config.js`.
- `sw.js` (`juntos-v35`): evento `push` mostra a frase acolhedora (não mostra se o app está visível); `reminders.js` não duplica o aviso em segundo plano quando o push está ligado.
- Privacidade: `CONSENT_VERSION` 1.2; `privacidade.html`/`termos.html` 1.2 (nova linha na tabela de dados, Cloudflare Workers/D1 em "operadores", e correção do texto de presença: "~60 s, só numa sala"). Aviso no próprio painel antes de ligar (LGPD, consentimento específico).
- **Passos manuais seus:** deploy do Worker, chaves em `firebase-config.js`, endereço do Worker em `connect-src` do `_headers` (comentado ali).
### Custo zero em escala, lembrete gentil e alto contraste (2.25.0)
**Em palavras simples:** o app passou a gravar bem menos no banco (importante para continuar no plano gratuito com muita gente), ganhou um lembrete de estudo acolhedor, um botão de silenciar avisos e um modo de alto contraste. **Nenhuma regra do Firestore mudou: não há passo manual.**
**Cota do Firestore (20 mil gravações e 50 mil leituras/dia no plano gratuito)**
- Presença (`main.js → beat`): antes gravava `lastActive` a cada 25 s com o app aberto, mesmo sem sala (~3.400 gravações/dia/pessoa) — e cada batimento virava 1 leitura para cada pessoa da sala. Agora: sem sala não grava; aba escondida não grava (exceto cronômetro rodando); cronômetro rodando não duplica o que `publishStatus` já grava; grava ao voltar para a aba e ao entrar numa sala. Intervalo 25 s → 60 s (`HEARTBEAT_MS`) e janela de "online" 90 s → 150 s (`ONLINE_WINDOW_MS`).
- `timer.js`: o status da sala (`publishStatus`) só é gravado com sala — ao iniciar, pausar e encerrar ele gravava mesmo sem sala (medido com o Firebase falso: **6 → 3 gravações por ciclo** para quem não usa sala). Ao entrar numa sala, `syncStatusToRoom()` publica o estado real na hora.
- Nota de engenharia: `writeBatch` **não** reduz a cobrança (cada documento do lote conta como 1 gravação); ele só dá atomicidade. A economia vem de gravar menos documentos. Os ciclos já gravam só o resumo ao concluir (`logMinutes`).
**Novo**
- `js/reminders.js`: lembrete gentil (até 3 horários, dias da semana, só neste aparelho, sem Firestore). Não avisa durante um ciclo, se já estudou hoje, passados 20 min do horário ou com avisos silenciados; no máximo 1 aviso por horário/dia; textos sem culpa. Dentro do app não exige permissão; em segundo plano usa a notificação do sistema se já concedida. Permissão pedida só por botão, depois de explicar.
- `js/quiet.js`: "Silenciar avisos" (hoje / 7 dias). Vale para lembrete, mensagens e "começou a estudar" da sala (`messages.js`, `room.js` só consultam `isQuiet()`); não silencia o cronômetro iniciado pela pessoa.
- Alto contraste (`html[data-hc="on"]`, Ajustes → Aparência): tema escuro e claro, sem vidro/papel de parede/fundo animado, foco grosso. Sem escolha salva, segue `prefers-contrast: more`. Aplicado antes da primeira pintura (script do `<head>`; hash da CSP recalculado).
- Firebase App Check **opcional** (`firebase.js`): só liga com `appCheckSiteKey` em `firebase-config.js`. Desligado por padrão. Veja `leia-me.md → App Check` (limite de 10 mil avaliações/mês grátis e 2 ajustes de CSP).
**Tom das notificações:** fim da pausa agora diz "Quando se sentir pronto, seu espaço de foco está disponível."
**Técnico:** `sw.js` `juntos-v34` (+`quiet.js`, `reminders.js`); `_headers`: novo hash do script embutido e, comentado, o ajuste de CSP do App Check; chaves `REMINDERS_LS_KEY`, `QUIET_LS_KEY`, `HC_LS_KEY` (apagadas ao sair da conta). Testes: `tools/teste-navegador/novos.mjs` (21 verificações) + `e2e.mjs` (64) passando.
**Não feito de propósito:** FCM/push com app fechado (exige servidor e novo dado pessoal), cifra de ponta a ponta do diário (quebraria compartilhar com amigos e sincronizar entre aparelhos) e salas/mural novos (pedido do dono do projeto).
### Estatísticas em cartões de vidro tingidos (2.24.0)
**Em palavras simples:** a aba Estatísticas ganhou um visual novo, minimalista e mais interativo. Nenhuma estatística foi acrescentada; só a **tendência dos últimos 30 dias** foi removida, como pedido.
**Visual** (referência: app de foco com cartões coloridos translúcidos)
- Sistema `.gCard` + `.t-cyan/.t-violet/.t-green/.t-gold/.t-rose/.t-orange/.t-blue`: fundo = tinta da cor (`--t`) por cima de `var(--surface)` com desfoque, borda na cor e **selo de ícone** (`.gIco`). Funciona no tema escuro, no claro e com papel de parede (testado nos três, com foto escura e clara). `.gLong` (diário) não usa desfoque por ser uma lista longa.
- Números grandes com a unidade menor ("4h 35min", via `fmtMinRich`); abas internas viram uma cápsula de vidro; "Resumo" vira uma coluna de cartões: sequência, constância, 4 totais (2×2), últimos 7 dias, horários mais produtivos, catálogo semanal (com seletor de ano em pílulas). Diário, Horários e Aprofundado (recordes, frequência, evolução, melhor dia, sala) seguem o mesmo padrão.
- Constância: o "19 de 28 dias" virou número grande ao lado do título; a grade usa a escala de ciano com legenda "menos → mais".
- Entrada em cascata dos cartões por CSS puro (recomeça ao abrir a aba ou a sub-aba; só no modo de animação completo).
**Interativo (mesmos dados que já estavam nos gráficos)**
- Colunas dos 7 dias são botões: tocar destaca a coluna e mostra "dia · tempo" com o tempo por matéria. Dias da constância também: tocar mostra o tempo do dia (antes só aparecia ao passar o mouse). Ambos com `aria-pressed`/`aria-label`.
**Removido**
- Tendência dos últimos 30 dias (`renderTrend`, o HTML `trendChart/trendStart/trendAvg/trendEnd` e o CSS `.trend*`).
**Técnico**
- Novo `js/icons.js` (ícones de traço, sem biblioteca; `hydrateIcons()` preenche `[data-ico]`), no cache offline (`juntos-v33`). `fx.js`: a contagem animada agora age nos `<b>` dos cartões (`.stat .v b`, `.recordCard .rv b`, `.consNum b`).
- Markup de `#view-stats` reescrito (todos os `id` mantidos). Sem CSS de tema novo além de `--c-blue/--i-blue`. Script embutido e CSP inalterados.
### Resumo do mês: novo visual e meses anteriores (2.23.0)
**Em palavras simples:** o resumo do mês para compartilhar ficou mais bonito e agora dá para escolher qualquer mês que já teve estudo.
**Novo**
- `js/wrapped.js` reescrito: botão "✨ Resumo do mês para compartilhar" (Estatísticas → Resumo) abre uma janela com **faixa de meses** (todos com estudo + o atual), **prévia da imagem**, **3 temas** (Noite/Aurora/Papel, salvo em `localStorage` `juntos.wrappedTheme`) e botões Baixar/Compartilhar.
- Cartão 1080×1350: mês em destaque (gradiente), tempo total grande, faixa de incentivo, 3 números (dias ativos, média por dia, **maior sequência do mês**), gráfico de barras por dia com o melhor dia destacado, barra das 3 matérias mais estudadas e, se houver, ✨ conquistas e 🙏 gratidões do Ta-da (`tada-history.js → monthTotals`, 5 s de limite; sem resposta o cartão sai sem essa linha).
- **Mês padrão inteligente:** mês atual só abre selecionado depois de 8 dias do mês (ou se não há mês anterior com estudo); antes disso abre o último mês fechado.
- Mês passado conta os dias do mês inteiro ("21 / 31"); mês atual conta até hoje. Antes a sequência mostrada era a global do momento — agora é a maior do mês escolhido.
- Tom: só o que foi conquistado — "↑ X% a mais que em <mês>" só aparece quando melhorou; senão "🔥 N dias seguidos", "🎉 Primeiro mês com registros" ou "🌱 Cada mês tem o seu ritmo" (antes aparecia "↓ X%" em rosa).
**Corrigido/otimizado**
- Imagem passa de PNG (~1,5 MB, ~1,2 s para gerar) para **JPEG 0,93** (~150–180 KB) e o canvas usa `willReadFrequently` (`toBlob` de ~1200 ms para ~35 ms no Chromium de teste).
- Valores longos nos cartões (ex.: "1h 45min") encolhem em vez de serem cortados; nomes de matérias longos são truncados com reticências.
- Acessibilidade: janela com `role="dialog"`, Esc fecha, botões de mês/tema com `aria-pressed`.
**Técnico**
- `sw.js`: cache `juntos-v32`. `index.html`: CSS `.wr*` novo (os `.wrappedBox/.wrappedImg` antigos saíram). Script embutido e CSP inalterados.
- Testes: bateria no navegador (`tools/teste-navegador/e2e.mjs`) ganhou a parte "Resumo do mês" (55 verificações no total).
### Correção: flash na troca de aba e fluidez (2.22.1)
**Em palavras simples:** tirei a transição entre abas que causava o "flash" da tela anterior e corrigi o que deixava as trocas pesadas.
**Corrigido**
- **Removidas as View Transitions** (`ui.js`, `motion.js`, CSS `::view-transition-*`). A foto da tela antiga ficava por cima enquanto a nova ainda aparecia do zero (a tela nova já tem fade/cascata próprios), e a troca era adiada um quadro. `showView` volta a trocar de forma síncrona. Teste: 0 transições, nenhum quadro com a tela antiga depois do clique.
- `utils.js → isValidTimeZone`: memoriza o resultado (criava um `Intl.DateTimeFormat` a cada chamada; era a maior fatia do custo, ~450 ms por 8 trocas de aba com CPU 4× mais lenta). `zonedParts`: lembra o último cálculo (mesmo segundo + fuso), já que as Estatísticas chamam `brNow()` ~85 vezes seguidas.
- `fx.js → playViewIntro`: só força reflow (`offsetWidth`) ao reabrir a MESMA tela; tela que acabou de sair de `display:none` já reinicia a animação sozinha (~50 ms por troca a menos).
- `a11y.js`: o foco da tela nova espera a primeira pintura (antes forçava o layout inteiro antes de pintar).
- `dom.js → morph`: o FLIP só roda se alguma linha entrou, saiu ou mudou de lugar (antes lia o layout de todas as linhas a cada redesenho).
- Histórico: entrada de barras e calendário por **CSS** (`#thContent.enter`, `--i` por item) em vez de dezenas de `element.animate()` no mesmo quadro; só liga no modo completo.
- Removido `content-visibility` (não medi ganho e podia piscar junto do `scrollReveal`) e código de animação que ficou sem uso (`rise`, `cascade`, `slideIn`).
**Medido** (Chromium real, CPU 4× mais lenta): script ao trocar para Estatísticas 1561 → 571 ms (8 trocas); tempo médio por troca de aba ≈ 261 → 169 ms; quadros longos ao registrar: pior quadro 767 ms → 83–530 ms (varia por rodada); marcar: pior quadro 117 → 50 ms.
**Ainda é pesado:** abrir Estatísticas (layout de uma tela grande) — igual ao app original; fica para uma próxima rodada.

### Movimento e desempenho (2.22.0)
**Em palavras simples:** o app ficou mais "vivo" nos toques e mais leve; nada de biblioteca nova (sem React).
**Novo — movimento (só no modo Animações: Completo e sem "reduzir movimento")**
- `js/motion.js`: mola física (`linear()` amostrado, com `cubic-bezier` de reserva), `pop`/`grow`/`twirl`/`enter`, `rise` (barras), `cascade` (calendário), `count` (reaproveita o `countUp` do `fx.js`), **FLIP** em lote (lê tudo → muda → lê tudo → anima) e `viewTransition`.
- **View Transitions** na troca de aba (`ui.js → showView`): fade da tela antiga/nova; direção segue a barra de baixo. Roda o `update` exatamente uma vez, com ou sem animação. **Trava automática:** se 2 trocas demorarem > 220 ms para começar, desliga até fechar o app (`sessionStorage`); aparelhos com ≤ 2 GB/≤ 2 núcleos nem tentam. Sem suporte → troca instantânea como antes.
- Done-list: botão "Marcar" faz mola (botão, ✓ e emoji); chip de peso faz o emoji crescer; ⭐ gira; o emoji do dia (🌱→🌿→🌳) cresce ao subir de nível; linha nova entra e as outras deslizam.
- Histórico: números contam, barras do peso/ano sobem, dias do calendário entram em cascata (só ao trocar de período, não a cada atualização ao vivo).
**Novo — desempenho**
- `js/dom.js`: `morph` (atualiza só o que mudou; elementos com `data-k`/`data-q` têm identidade; não recria nem apaga o ripple do `fx.js`), `setText`/`setAttr`/`setHTML` (só escrevem se mudou).
- Done-list (faixa de dias, cabeçalho, abas de estilo, chips, lista) agora usa `morph` + **delegação de eventos** (um ouvinte por lista; antes cada botão ganhava ouvinte a cada redesenho). Linhas ganharam `data-k` (id do registro).
- Cronômetro: o `tick` (250 ms) só escreve no DOM o que mudou (texto, rótulos, anel com precisão de 0,5); o "seu dia até agora" só redesenha as barras se o HTML mudou.
- `content-visibility:auto` em `.logRow` e `.thRow` (listas longas).
**Medido** (Chromium real, CPU 4× mais lenta, 2 execuções do original × 2 do novo; veja `tools/teste-navegador`)
- Marcar 24 vezes: nós criados por toque 12 → 0; tempo de layout 315–460 ms → 128–160 ms; por toque ≈ 124–146 ms → 108–113 ms.
- Adicionar 15 registros: por registro ≈ 282–564 ms → 121–124 ms; layout 203–332 ms → 86–120 ms.
- Cronômetro 6 s: tempo de tarefa 1,47–1,58 s → 0,86–0,91 s; recálculos de estilo 199–260 → 100–114; layouts 28–30 → 15–18.
- Troca de aba: **sem ganho mensurável** (≈ igual); a View Transition tem custo no Chromium de teste (renderização por software) — por isso a trava automática.
**Técnico**
- `sw.js`: cache `juntos-v30`; `dom.js` e `motion.js` em `SHELL`. Script embutido do `index.html` inalterado (hash da CSP igual).
- CSS novo em `index.html`: `html[data-vt]::view-transition-*` (só opacidade) e `content-visibility`. Corrigido o título do Histórico ("De Out A 1 De Nov" → só a primeira letra maiúscula).
- Testes: 48 verificações no navegador (`tools/teste-navegador/e2e.mjs`) + 44 de lógica em Node; inclui "um clique = uma troca" (sem ouvinte duplicado), identidade dos elementos após o morph, Suave e reduzir movimento.

### Ta-da: Histórico e estatísticas salvas por mês (2.21.0)
**Em palavras simples:** agora dá para rever o que você fez em qualquer semana, mês ou ano, e as estatísticas da done-list ficam guardadas na conta.
**Novo**
- Sub-aba **📊 Histórico** em Ta-da (`js/tada-history.js`, carregado sob demanda): períodos **Semana / Mês / Ano**, com setas para navegar até o primeiro dia com registro e "Voltar para hoje".
- Semana e mês: conquistas, dias com vitórias, média por dia, estudo (de `profile.daily`), gratidões, melhor dia, maior sequência, distribuição por peso 🌱🌿🌳, calendário por intensidade (toque abre o dia), matérias mais citadas, ⭐ destaques (ou 🌳 vitórias grandes), frases de fecho e gratidões. Comparação com o período anterior **só aparece quando o resultado foi maior** (sem desanimar).
- Ano: barras mês a mês lidas das estatísticas salvas; tocar num mês abre o detalhe.
- Detalhe de **qualquer dia**, somente leitura (a lista de edição só carregava ~45 registros; dias antigos ficavam inacessíveis). Dias dos últimos 7 dias têm o atalho "Abrir na Done-list para editar".
- **Estatísticas salvas:** `users/{uid}/tadaStats/{AAAA-MM}` = `{ month, days:{ "DD": { n, sc, w1, w2, w3, st, q, g, wr } }, full?, upd }`. Gravadas junto de cada alteração (`writeDay` → `scheduleStats`, com atraso de 1,2 s e descarga em `pagehide`/`visibilitychange`). Mês sem `full: true` é calculado dos documentos por dia e salvo na primeira visita (contas antigas entram sozinhas). Dias recentes são conferidos com os dados ao vivo e reparados se divergirem.
- Baixar meus dados inclui `estatisticasTada`; Excluir conta apaga `tadaStats`.
**Dados e privacidade (⚠️ passo manual: colar `regras-firestore.txt` no console do Firebase)**
- Regra nova `match /tadaStats/{month}` (só o dono lê/escreve; `validTadaStats`: `month`, `days` ≤ 31, `full` booleano). Amigos **nunca** leem as estatísticas.
- Sem as regras novas nada quebra: o Histórico calcula tudo dos documentos por dia (só não persiste o resumo mensal).
- `privacidade.html`: nova linha na tabela de dados (só números, só o dono). Texto relevante? Não: nenhum dado novo de conteúdo; `CONSENT_VERSION` não mudou.
**Técnico**
- `tada-data.js`: `summarizeDay`, `sameSummary`, `cleanSummary`, `writeStats`, `flushAllStats`, `watchReady`; o ouvinte agora marca quando os dados chegaram. A gravação de estatística é descartada se a pessoa trocou de conta durante o atraso.
- `sw.js`: cache `juntos-v29`; `tada-history.js` em `SHELL` (`tools/verificar-offline.mjs` passa). Script embutido do `index.html` inalterado (hash da CSP igual).
- Testado em Node com Firestore simulado: contas do resumo, gravação com atraso, troca de conta, mês antigo sem estatística (calcula e salva), reparo de resumo divergente, regras antigas (permissão negada), offline, conta nova vazia, escape de HTML.

### Cronômetro não se perde mais + atualização sem versão antiga + abertura mais rápida (2.20.1)
**Corrigido**
- **Progresso do estudo perdido ao puxar para atualizar / sair e voltar.** O ciclo salvo só era lido depois da resposta do Firestore e o `beforeunload` gravava o estado "parado" por cima dele. Agora `js/timer.js` lê o estado na hora (`hydrateTimer`, síncrono em `initTimer`), nunca grava antes de ler, grava ao sair por `pagehide`/`visibilitychange` (só se houver ciclo) e guarda o `uid` do dono do ciclo. Fases só são concluídas/minutos só são gravados quando `store.me` existe (`canFinish`). `restoreTimer()` roda na primeira atualização de perfil (do aparelho ou do servidor).
- "Sair da conta" não deixa mais o ciclo ser regravado na saída da página (evento `auth:wipe`).
- Relógio parado agora mostra as durações do perfil assim que ele chega (`refreshTimer`).
- **Versão anterior "deteriorada" na abertura.** `sw.js` buscava cada arquivo na rede com limite de 4 s e caía no cache: em rede lenta misturava arquivos novos e antigos. Agora é uma geração única e atômica (instala todos os arquivos ou nenhum), servida do cache.
**Novo**
- `js/updates.js`: a splash espera até ~1,5 s a checagem de versão; se houver versão nova, ela é ativada e o app recarrega antes de a tela aparecer. Com rede lenta, a troca acontece quando o app vai para segundo plano (ou ao voltar, se não estiver digitando). Trava contra laço de recarregamento.
- Novidades: ao abrir uma versão nova aparece **só o resumo da mais recente**; o histórico completo fica em Ajustes → Novidades.
**Técnico**
- `sw.js`: cache `juntos-v28`, instalação atômica, sem `skipWaiting` automático (a página envia `skip-waiting`), arquivos do app servidos do cache sem rede em cascata; `updates.js` entra em `SHELL`. Registro com `updateViaCache: "none"`.
- `_headers`: `Cache-Control: no-cache` para `main.js`, `js/*`, `firebase-config.js`, `manifest.json`.
- Animações de abertura mais curtas (splash 1,5 s → 0,6 s; barra e cabeçalho ~0,5 s). Hash da CSP inalterado (script inline não mudou).

### Ta-da: done-list e diário de gratidão no lugar do Planejar (2.20.0)
**Novo**
- Aba **Ta-da** (`js/tada.js`, `js/tada-data.js`, `js/gratitude-prompt.js`) substitui totalmente o Planejar (`js/planner.js` removido). Sub-abas: **✨ Done-list**, **🙏 Gratidão**, **👥 Amigos**.
- Done-list em 3 estilos sobre os mesmos dados: **✍️ Corrida** (texto + peso 🌱🌿🌳 + matéria opcional), **☑️ Marcar** (16 vitórias prontas, um toque liga/desliga) e **⭐ Top 3** (até 3 destaques do dia + frase de fecho). Faixa dos últimos 7 dias para registrar/ver dias recentes.
- O estudo do dia aparece sozinho na done-list, **derivado de `profile.daily`** (nada novo é gravado).
- Diário de gratidão: "Sou grato por…" + "Isso afeta a minha vida porque…". Também é perguntado **depois de cada ciclo de estudo** (`studylog.js` → `askGratitudeAfterStudy`), logo após a reflexão; ligado por padrão, desligável em Ajustes → Experiência (`ux.grat`). Com o passo desligado, o atalho "Gratidão por…" volta para a nota do ciclo.
- Amigos: aba **Ta-da → Amigos** (o que cada pessoa liberou hoje) e novas seções no perfil do amigo (done-list dos últimos 7 dias e gratidão dos últimos 14).
- Estatísticas → análise da semana: bloco "ta-da da semana" (conquistas, dias, gratidões e destaques) no lugar do "planejamento da semana".
- Baixar meus dados inclui `tada` e `gratidao`; Excluir conta apaga as duas subcoleções.
**Dados e privacidade (⚠️ passo manual: colar `regras-firestore.txt` no console do Firebase)**
- Novas subcoleções, **um documento por dia**: `users/{uid}/tada/{AAAA-MM-DD}` e `users/{uid}/gratitude/{AAAA-MM-DD}` (evita o limite de 1 MB de um documento único, que uma lista no perfil estouraria em ~1 ano).
- Novos campos no perfil: `tadaSharedWith` e `gratSharedWith` (listas **separadas**; a gratidão tem liberação própria). Padrão: ninguém vê.
- Regras novas: `validTadaDay`/`validGratDay`, `match /tada` e `match /gratitude` (leitura: dono ou liberado + mesma sala).
- `private/planner` agora é **legível só pelo dono** (antes, também por quem estava em `planningSharedWith`). Os dados antigos (`plannedTasks`, `taskCategories`, `dayTemplates`) **não foram apagados**: continuam exportáveis/importáveis.
**Removido**
- Planejar: tarefas, categorias, modelos de dia, exportar .ics, lembretes de horário, "fazer agora" na Sala, aba Progresso. `store.taskCategories`, `taskCatById`, `TASK_INBOX` e CSS exclusivo.
- `room.js` ainda sabe exibir `status.doingTask` (status antigo); nada mais o publica.
**Técnico**
- `sw.js`: cache `juntos-v27`; entram `tada.js`, `tada-data.js`, `gratitude-prompt.js`; sai `planner.js` (`tools/verificar-offline.mjs` passa).
- Escritas otimistas e sem `await` (offline na fila do Firestore); adição com `arrayUnion` (dois aparelhos não se atropelam); frase do Top 3 com `debounce`. Tudo que vem de amigo passa por `esc()`/`safeColor()`/`safeNum()`.
- Limites iguais no app e nas regras: item 140, frase 240, "por quê" 200, "como afeta" 300; 60 conquistas e 30 gratidões por dia.

### Remover ciclos contados por engano (2.19.0)
**Novo**
- Ajustes → **Remover ciclos** (`js/removecycles.js`, carregado sob demanda): lista os ciclos do Diário (filtro por matéria, "Mostrar mais"), a pessoa marca os que quer tirar e confirma.
- A remoção desfaz os três lugares onde o ciclo existe, num único `writeBatch` atômico: apaga `users/{uid}/sessions/{id}`, desconta `daily.{dia}.total` e `daily.{dia}.bySubject.{matéria}` e desconta `periodTotals.{período}`.
- Totais descontados com `increment()` negativo (nunca sobrescreve) e limitados ao que existe (nunca ficam negativos); dia ou matéria que chega a zero é apagado (senão contaria em "matérias da semana" nas conquistas). Ciclo que passou da meia-noite devolve minutos aos dois dias (`splitAtMidnight`, igual a `fixmidnight.js`).
- Baixa uma cópia `.json` dos ciclos removidos antes de aplicar. Sem internet o lote entra na fila do Firestore; os ciclos enviados somem da lista e não podem ser enviados duas vezes.
- Não mexe em revisão espaçada, perguntas (flashcards) nem conquistas já abertas. Nenhuma regra nova no Firestore (já existia `delete` em `sessions` e `update` do perfil).
- `sw.js`: cache `juntos-v26` e `removecycles.js` em `SHELL`.

### Correção visual da 2.17 (2.18.0)
Revisado com um navegador real (Chromium) em celular, tablet e computador.
**Corrigido**
- "Ocultar" (botão fixo no canto) cobria 💡 e ⚙️ do cabeçalho e bloqueava o toque: agora o ✕ é um botão **dentro** do cabeçalho (`#focusLessBtn`) e o "⋯ Mais" só existe com os menus fechados.
- Tela de foco escondia cabeçalho **e abas em todas as telas**: agora só vale no cronômetro (`html[data-view="timer"]`, definido em `ui.js`) e a barra de abas nunca some.
- 📌, 🏆 e 🌿 eram três botões fixos em lugares diferentes, cobrindo texto e botões: agora ficam num dock recolhido (`#fabDock`, `ux.js`), escondido em Ajustes e Frases. O painel de sons abre ao lado do dock e fecha ao tocar fora.
- Fundos transparentes: `--solid` só existe com papel de parede; elementos novos usam `--panel`.
- Removido `content-visibility:auto` das seções (recortava e mudava a posição de itens fixos).
- Visual "Celular": o `min-height:44px` valia para todo botão e desalinhava chips e barras; agora só `.primary`/`.ghost`. Removido o `max-width` da barra de abas. "Computador" centraliza o cronômetro em 760 px.
**Novo**
- Tela de foco mostra a **tarefa atual** (matéria) e o **próximo passo** (`#focusTask`, `#focusNext`, `timer.js`).
- Seletor de visual em grade 2×2.
- `sw.js`: cache `juntos-v25`.

### Experiência: foco, visuais e retenção (2.17.0)
**Novo**
- `js/ux.js`: preferências deste aparelho (visual, tela de foco, ampulheta, conclusão suave, perguntas). Aplicadas pelo `<head>` antes da primeira pintura.
- `js/flashcards.js`: ao concluir um ciclo de 5 min ou mais, 1 a 3 perguntas para lembrar (`users/{uid}/cards`), revisadas em 1, 3, 7, 16 e 35 dias dentro do painel 📌 Revisão espaçada. Botão "Lembrei" / "Revisar de novo".
- `js/ambient.js`: sons da natureza gerados no navegador (ruído branco/rosa/castanho filtrado, chuva, vento), sem arquivos e sem internet. Botão 🌿 no canto.
- Ajustes → Experiência: **Visual** (Atual, Celular, Tablet, Computador), **Tela de foco minimalista** (padrão: ligada), **Ampulheta fluida** (padrão: desligada), **Conclusão suave** (padrão: ligada), **Perguntas para lembrar** (padrão: ligada).
- Tela de foco: no cronômetro ficam só tarefa atual, cronômetro e botões de ação. O botão "⋯ Mais" mostra o resto (Esc fecha).
- Ampulheta fluida (`timer.js` → `#hgFill`): a água sobe com o tempo; os números ficam ocultos mas continuam para leitores de tela.

**Alterado**
- Conclusão: sem a opção suave, continua como antes (confete e sino/alarme). Com ela: luz quente (`fx.js`) e acorde suave (`timer.js` → `softChime`).
- `spaced.js`: intervalos por aritmética de calendário (`shiftDateKey`), igual ao resto do app.
- `regras-firestore.txt`: regra para `users/{uid}/cards` (só o dono; textos até 300 caracteres). **Passo manual: publicar no console.**
- `sw.js`: cache `juntos-v24`, com os novos módulos na lista offline.

### Mais rápido e mais simples (2.16.0)
**Alterado**
- Barra de conforto sobre o cronômetro: saíram "Sem animações" e A−/A+ (continuam em Ajustes → Aparência). Ficam tema e cores.
- `js/consistency.js` ("Sua constância"): saiu o gráfico "Dias com presença por semana" (barras -5, -4…). Calendário de 28 dias e frases mantidos.

**Desempenho**
- `index.html`: `preconnect` para Google/Firebase e `modulepreload` de todos os módulos e do SDK — o navegador baixa a cadeia de módulos em paralelo, em vez de uma etapa por vez.
- Desfoque (`backdrop-filter`) removido dos cartões quando não há papel de parede, e nos cartões que mais se repetem em telas pequenas. Cabeçalho, abas e janelas mantêm o desfoque.
- Seções fora da tela usam `content-visibility:auto`, então a rolagem calcula só o que aparece.
- `sw.js`: cache `juntos-v23`.

### Offline de verdade, sessão mais segura e datas à prova de fuso (2.15.0)
**Em palavras simples:** o app passa a abrir sem internet (celular e computador); a sessão e as mensagens ficam
mais bem protegidas; a sequência de dias não depende mais do fuso do aparelho.

**Corrigido — offline (`sw.js`, `main.js`, `manifest.json`, `auth.js`)**
- Causa provável do "erro de página da web": respostas **redirecionadas** (`/index.html` → `/` na Cloudflare Pages)
  eram guardadas e entregues como estavam, e o navegador recusa isso numa navegação. Agora passam por `cleanResponse()`.
- Todos os arquivos do app (inclusive os carregados sob demanda: amigo, frases, correção da meia-noite, resumo
  anual, exportar/importar, miniplayer…) entram em `SHELL`; o instalador também guarda os `import` internos do SDK
  do Firebase; abrir o app com internet completa instalações interrompidas (mensagem `precache`).
- `start_url`/`id` do manifest agora `./`; abrir offline por qualquer endereço do app cai no app guardado.
- `auth.js`: sem internet, `getDoc`/gravações não travam mais a abertura (antes ficava só a tela de carregamento);
  migração de campos privados roda em segundo plano; erros de login em português simples (sem código técnico).
- `tools/verificar-offline.mjs`: confere se todo arquivo novo de `public/` está no cache offline.

**Segurança**
- `firebase.js`: o token de acesso passa a ser guardado em **IndexedDB** (`indexedDBLocalPersistence`), não em
  localStorage (que um XSS lê de forma síncrona). Quem já estava logado é migrado pelo SDK.
- `crypto.js`: só Web Crypto (nenhuma primitiva própria). Formato `enc2:` — sal por sala, PBKDF2 600.000 iterações,
  AAD (sala + remetente). `enc1:` e mensagens antigas continuam abrindo. **Aparelhos ainda na versão antiga não abrem
  `enc2:`** até atualizar (o service worker atualiza na próxima abertura com internet).
- `regras-firestore.txt` (**passo manual: colar e publicar no console**): campos permitidos em `private/*`, formato do
  código da sala, `createdAt` do servidor, `sync` validado, tipos/tamanhos extras no perfil, apagar mensagem só se for membro.
- `firebase-config.js`: passo a passo da restrição por site + `tools/verificar-restricao-chave.mjs` para conferir.

**Datas e fuso**
- `utils.js`: soma de dias, sequência (`computeStreak`, `longestStreakEver`), `lastNDaysTotal`, `weekdayTotals`
  e `splitAtMidnight` usam aritmética de calendário sobre a chave `AAAA-MM-DD` (`shiftDateKey`, `daysBetweenKeys`),
  sem `new Date()` local — mesmo resultado em qualquer fuso/horário de verão do aparelho.
- `fixmidnight.js`: baixa uma cópia do que vai mudar antes de gravar e não fica pendurado se a internet cair.

### Conforto, constância e pausas conscientes (2.14.0)
**Em palavras simples:** mais controle sobre como o app parece e soa (tema escuro, cores calmas, texto maior,
animações desligáveis), um painel que celebra presença em vez de só somar horas, um espaço de reflexão depois
de cada ciclo e, se a pessoa quiser, respiração guiada nas pausas.

**Adicionado**
- `js/comfort.js` + barra de conforto na tela do cronômetro: modo escuro/claro rápido, paleta, A−/A+, sem animações.
- Paletas suaves (`data-palette`: Bruma, Musgo, Areia, Lavanda): mudam só fundo e preenchimentos; o contraste do
  texto (WCAG AA, v2.12) não muda. Tamanho do texto em 5 passos (até 150%) e animações "Nenhuma" (`data-motion="off"`).
  Tudo só neste aparelho; o script do `<head>` aplica antes de pintar (hash da CSP atualizado em `_headers`).
- `js/consistency.js`: "Sua constância" (grade de 28 dias, presença por semana, recomeços). Sem metas, sem "faltas".
- `js/breathe.js`: respiração guiada (4 s inspira, 6 s solta) + pergunta de propósito nas pausas. **Desligada por
  padrão**; liga em Ajustes → Pausas conscientes. Sem animação, só o texto guia.
- Reflexão pós-ciclo: o modal ganhou começos de frase (fiz / aprendi / gratidão / me senti / amanhã) e texto acolhedor.

**Corrigido**
- `timer.js` tratava como "modo do cronômetro" todos os botões `.modes` (incluindo tema e animações em Ajustes).
  Agora só os dois botões com `data-mode`.

### Acessibilidade, offline, portabilidade e cuidado com as pessoas (2.13.0)
**Em palavras simples:** o app ficou mais fácil de usar por teclado e leitor de tela, passou a funcionar melhor
sem internet, ganhou o "Importar dados" (a volta do "Baixar meus dados"), e os textos e frases ficaram mais
acolhedores. Um defeito visual no topo da tela também foi corrigido.

**Corrigido**
- Topo da tela: o cabeçalho "grudado" tinha fundo transparente, então ao rolar o conteúdo (abas Tarefas/Progresso,
  botões ⋯) aparecia misturado ao título, ao nome e aos botões 💡/⚙️. Agora tem fundo próprio, respeita a área segura
  do celular e o texto não quebra por cima do título.
- Sem internet, o cronômetro ficava parado em 00:00 e a nota do ciclo não abria até a conexão voltar (o app esperava
  o servidor confirmar). Agora grava na fila local e segue; nada se perde nem é contado duas vezes.
- `connectivity.js` existia mas nunca era carregado: agora é ligado em `main.js`.
- Service worker: o código do Firebase (CDN do Google) não era guardado, então o app não abria offline; um arquivo
  faltando cancelava a instalação inteira; pedidos de scripts recebiam `index.html` no lugar. Cache v20.
- Horário: "agora" no fuso do app deixou de ser montado lendo texto de data; usa `Intl.DateTimeFormat.formatToParts`
  (`utils.js`: `zonedParts`, `brNow`, `splitAtMidnight`). Resultado idêntico em qualquer fuso do aparelho (testado).

**Adicionado**
- `js/importData.js`: importar o `.json` do "Baixar meus dados". Não destrutivo, mostra resumo antes, ignora o que
  já existe, nunca importa códigos de sala, compartilhamentos, aceite, identidade nem mensagens; valida tudo.
- `js/a11y.js`: avisos falados (fim do timer, mensagens, tarefas, lembretes, toasts), `aria-pressed/current`, teclado
  em itens clicáveis, janelas com foco preso e Esc, link "Pular para o conteúdo".
- `js/offlineStore.js` (IndexedDB) + faixa de offline e "Tudo sincronizado" em `connectivity.js`; Firestore em modo
  multi-aba.
- `privacidade.html` / `termos.html`: `<nav>`, `<main>`, índice, link de pular, modo escuro, `scope` nas tabelas.
- `regras-firestore.txt`: validação de ciclos do diário (`validSession`) e limite de campos do perfil.
- `firebase-config.js`: passo a passo das restrições de domínio e de API da chave (passo **manual** no Google Cloud).

**Alterado**
- `fx.js`/`wallpaper.js`: "reduzir movimento" vale ao vivo e também desliga confete, ondas e transições.
- Textos: linguagem neutra e sem culpa (sequência, "Para retomar" no lugar de "Atrasadas", aviso de duração do
  ciclo, conquistas renomeadas, "amigo" → "pessoa da sala").
- `quotes-data.js`: 28 frases removidas, 5 adaptadas e 9 acrescentadas (critérios em `auditoria-seguranca.md`).
- `_headers`: `connect-src` inclui `https://www.gstatic.com` (necessário para o service worker guardar o SDK).

### Contraste reforçado e visual cinematográfico (2.12.0)
**Adicionado**
- `js/fx.js` (novo): onda no ponto do toque, confete (botões principais, tarefa concluída, fim de ciclo),
  entrada em cascata das telas, contagem dos números das estatísticas e estado do cronômetro rodando.
- Fundo vivo (aurora) que se move devagar sem papel de parede; câmera lenta (Ken Burns) com papel de parede.
- Ajustes → Aparência → **Animações** (Cinema / Suave), só neste aparelho (`localStorage` `juntos.fx.v1`).
- Revelar ao rolar via `animation-timeline: view()` (progressivo: navegadores sem suporte mantêm o visual anterior).

**Alterado**
- Cores de destaque agora têm duas versões: `--c-*` (preenchimento) e `--i-*` (tinta para texto, ≥ 4,5:1 em
  tema escuro, claro, foto escura e foto clara), mais `--on-fill` para texto sobre preenchimento. Antes o destaque
  usado como texto tinha 1,5–2,7:1 no tema claro.
- Texto e `--muted` mais fortes nos dois temas; vidro com foto mais firme; interruptor desligado visível no claro.
- Com papel de parede: cabeçalho, títulos de seção, código da sala, fase do timer e avisos ganham placa de vidro;
  foto escura recebe um leve `brightness(.74)` (só filtro).
- Foco de teclado visível (`:focus-visible`). Regra de "reduzir movimento" agora também cobre `::before/::after`.
- `timer.js`: `celebrate()` emite `fx:celebrate` (1 linha) antes do retorno por som desligado.

**Verificação**: 504 textos medidos em 6 cenários (escuro, claro, foto escura/clara × tema) contra o fundo
renderizado: reprovados no WCAG AA caíram de 38% para <1%. Hash da CSP do script inline conferido (não mudou).
`sw.js`: `CACHE` → v19 e `fx.js` no `SHELL`.

### Frases no topo e legibilidade com foto de fundo (2.11.2)
**Alterado**
- A aba **Frases** saiu da barra inferior (que volta a ter 4 abas). Agora o botão 💡 no cabeçalho, ao lado da engrenagem,
  abre a área; tocando de novo, volta para a tela anterior (`js/ui.js`, `index.html`).

**Corrigido**
- Com foto de fundo, o texto seguia o tema claro/escuro e podia ficar ilegível (ex.: tema claro sobre foto escura).
  Agora, com foto, o contraste depende só do brilho da foto (`data-contrast`), e os textos e a barra ganharam sombra.
- Botões, abas e o emoji do relógio com foto de fundo ganharam fundo quase opaco, borda nítida e um brilho que pulsa
  nos botões principais. A animação é desligada para quem tem "reduzir movimento" ativo no sistema.

### Correção: matérias removidas no perfil do amigo (2.11.1)
**Corrigido**
- Perfil do amigo (`js/friend.js`): gráfico dos 7 dias, legenda, diário e planejamento buscavam o nome das matérias
  na lista **do próprio usuário** (e no arquivo `removedSubjects` dele), então matérias do amigo que ele já removeu
  aparecíam como "Matéria removida". Agora usam as matérias do próprio amigo.
- Novo helper `subjectsWithArchive(profile)` em `js/utils.js`: junta as matérias ativas de um perfil com as removidas
  (nome/cor do `removedSubjects`).
- Resumo do dia (`js/dayrecap.js`): as próprias matérias removidas também mantêm o nome.
- Cada ciclo novo (`users/{uid}/sessions`) passa a guardar `subjectName` e `subjectColor` junto com o id da matéria
  (`recordCompletedWork` em `js/studylog.js`). Diário, horários e notas leem esse nome via `sessionSubject()` (`js/utils.js`)
  quando a matéria não existe mais — inclusive no perfil do amigo. Não exige mudança em `regras-firestore.txt`.
- Limitação: ciclos salvos **antes** desta versão e matérias apagadas antes dela não têm o nome guardado e continuam
  como "Matéria removida". Os totais por dia (`users/{uid}.daily`, usados nos gráficos) ainda guardam só o id.

### Navegação remodelada, ajustes na engrenagem e novas frases (2.11.0)
**Alterado**
- Menu inferior com 5 abas (Cronômetro, Estatísticas, Planejar, Frases, Sala): botões de 62px de altura, ícone de 24px,
  estado ativo mais marcado. **Ajustes saiu do menu** e virou uma engrenagem (`#gearBtn`) no cabeçalho; dentro de
  Ajustes há botão "Voltar" (volta para a última aba). Troca de tela centralizada em `showView()` (`js/ui.js`);
  os `.click()` em `nav button[data-tab=...]` de `room.js`/`messages.js`/`planner.js` continuam funcionando.
- Interruptores de som e notificações (som, contagem regressiva, mensagem de amigo, amigo começou a estudar) agora ficam
  numa folha "Som e notificações", aberta por um botão na tela do Cronômetro e por uma linha em Ajustes. Removido o
  `notifToggle2` duplicado (um único `notifToggle`).
- `main` e o mini-player ganharam mais folga inferior (116px) por causa do menu maior.
**Corrigido**
- Perfil do amigo: o gráfico dos 7 dias mostrava minutos brutos (ex.: "140"); agora usa `fmtMinStacked` ("2h / 20 min").
  Mesmo ajuste no gráfico semanal de `weekdetail.js`.
**Adicionado**
- Frases: categorias **Músicas**, **Filmes** e **Livros** (+19 itens). Letras de música não são copiadas (direitos
  autorais): itens com `tipo: "tema"` trazem um resumo da mensagem da canção, exibido sem aspas.
- `sw.js`: `CACHE` → `juntos-v18`. O `<script>` embutido não mudou, então o hash do CSP **não muda**. Sem campos novos
  no Firestore, **sem passo manual** nas regras.

### Nova aba Frases (2.10.0)
**Adicionado**
- Aba **Frases** no menu (entre Planejar e Sala): frase do dia (mesma para todos, calculada pelo dia de
  Brasília), botão "Outra frase" e filtros por tema (Estudo, Persistência, Coragem, Foco e hábito, Juntos).
  O sorteio usa uma "sacola" embaralhada: não repete até todas do tema terem saído. **Não existe lista com
  todas as frases, de propósito** — só se vê uma por vez. A única lista é a de ♥ Favoritas da própria pessoa.
  Compartilhar usa a Web Share API, com cópia para a área de transferência como alternativa.
- 143 frases em `js/quotes-data.js`, todas de pessoas reais e com fonte (obra, carta ou discurso). Frases de
  autoria falsa ou duvidosa foram deixadas de fora de propósito (critério documentado no topo do arquivo).
- `js/quotes.js` carrega sob demanda (`import()` em `ui.js`), seguindo o padrão de `wrapped.js`/`pip.js`.
**Observações**
- Favoritas ficam só no aparelho (`QUOTES_FAV_LS_KEY` em `localStorage`) e são apagadas em `wipeLocalData()`.
  Não há campo novo no Firestore, então **não há passo manual** nas regras.
- Menu passou a ter 6 abas: abaixo de 420px de largura o espaçamento e a fonte dos botões diminuem um pouco.
- `sw.js`: `CACHE` subiu para `juntos-v17`. O hash do CSP em `_headers` **não muda** (o `<script>` embutido
  do `index.html` não foi alterado).

### Segurança e privacidade (2.9.0) — auditoria como atacante e como advogado
**Corrigido — falhas que um atacante podia explorar**
- **Regras do Firestore: leitura de perfis forjável.** `sameRoom()` confiava em `roomCodes`, campo que a
  própria pessoa escreve: bastava copiar o código de uma sala para o seu perfil para ler o perfil de
  todos os membros. Agora a regra confere na lista oficial de membros da sala (`sharesMyActiveRoom`).
- **Códigos das outras salas vazavam pelo perfil.** `roomCode`/`roomCodes` (o único segredo de acesso a
  uma sala) ficavam no perfil legível por toda a sala. Foram para `users/{uid}/private/mind`.
- **Dados privados legíveis por toda a sala.** Despejo mental (`distractions`), tarefas, categorias,
  modelos, metas e revisões estavam no perfil; "só você vê" era só da interface. Agora vivem em
  `users/{uid}/private/{mind,planner}` com regra própria (`planner` abre só para `planningSharedWith`).
  `firebase.js` separa os campos sozinho (`updateDoc` customizado) e `auth.js` junta tudo em
  `store.profile` e migra contas antigas no primeiro login.
- **Injeção de HTML/CSS por membro da sala.** `p.color`, `subjectColor`, `taskColor`, `estMin`, `t.id`
  e cor de matéria/categoria de OUTRAS pessoas entravam sem validação em `style=""`/atributos. Novos
  `safeColor()`, `safeUrl()` e `safeNum()` em `utils.js`, aplicados em avatar, sala, planner e lookups.
- **Falsificação de remetente.** O nome/cor/foto vinham dentro da mensagem (`fromName`) e qualquer
  membro podia se passar por outro. Agora vêm do perfil real do `uid`; a regra só aceita `from/text/ts`.
- **Mensagens diretas não eram privadas** (todo membro lia todas pelo banco; o filtro era só no
  navegador). Agora vão para `rooms/{code}/inbox/{uid}/msgs`, legível só pelo dono da caixa.
- **Qualquer membro podia iniciar/encerrar a sessão coletiva** e gravar campos arbitrários na sala.
  Agora só o dono, só o campo `sync`; sala limitada a 30 membros e chaves validadas.
- **Validação do perfil** (nome, cor `#RRGGBB`, foto `https://`, tamanhos) nas regras.
- **Código de sala previsível** (`Math.random`, 6 caracteres) → `crypto.getRandomValues`, 8 caracteres.
- **Cifragem com queda silenciosa para texto puro** → agora recusa enviar se não conseguir cifrar.
- **Cache local sobrevivia ao logout** (papel de parede, perfil, cache offline do Firestore com perfis e
  mensagens da sala) → `signOutAndWipe()` apaga tudo e recarrega.
- **Cabeçalhos:** HSTS, COOP, X-Frame-Options, `Cache-Control: no-cache` em `sw.js`/HTML, `blob:` em
  `img-src` (a prévia do Resumo mensal estava bloqueada), `apis.google.com` (login), `upgrade-insecure-requests`.
- **Service worker:** só GET, só respostas 200 do próprio site entram no cache; comandos só de janelas do app.
**Corrigido — pontos que gerariam risco jurídico**
- A Política prometia "Excluir minha conta" e "Baixar meus dados" que **não existiam** e um
  "consentimento no primeiro acesso" que não havia. Agora existem (`js/privacy.js`, `js/exportData.js`).
- Termos e Política não estavam linkados no app → links no login e em Ajustes; novo aceite versionado
  (`CONSENT_VERSION`) com declaração de idade/autorização do responsável.
- Política e Termos reescritos: base legal, quem vê o quê (tabela), transferência internacional,
  operadores (Google/Cloudflare), retenção, menores (LGPD art. 14 / ECA Digital), canal do titular,
  incidentes, honestidade sobre a cifragem (não é ponta a ponta). Placeholders amarelos removidos.
- Moderação: dono da sala pode remover participantes; canal de denúncia nos Termos.
### Adicionado
- **Aba "Horários" em Estatísticas** (`js/studylog-hours.js`, carregado sob demanda como o
  `deepstats.js`): resumo (horas ativas, horário de pico, tempo no pico, total), gráfico de 24
  colunas empilhadas pela cor de cada matéria, filtros por período (tudo/30/7 dias) e por matéria,
  toque numa hora para ver os ciclos que passaram por ela, e navegação dia a dia com linha do tempo
  e horário exato de início e fim. O app só grava o instante em que o ciclo termina (`ts`); o início
  é calculado subtraindo a duração (`sessionSpan()` em `utils.js`), e o tempo é repartido entre as
  horas que o ciclo atravessa. Ciclos que passam da meia-noite são cortados em 00:00 no "dia a dia"
  (22:00–01:00 = 2h num dia e 1h no seguinte). Ciclos antigos sem `ts` são ignorados (a tela avisa quantos).
- **Diário de estudos: filtro por matéria** (chips com rolagem horizontal, só aparecem com 2+
  matérias) e **horário de início e fim** em cada ciclo. A leitura subiu de 40 para 100 ciclos.
### Alterado
- **Sub-abas de Estatísticas** viraram um controle segmentado de 4 colunas que se ajusta à largura
  da tela (rótulo "Diário de estudos" encurta para "Diário" em telas estreitas).
- **`fmtMin()` agora escreve "1h e 20 min"** (antes "1 h 20 min"). O gráfico dos últimos 7 dias
  mostrava só o número de minutos; agora usa `fmtMinStacked()` (duas linhas, cabe nas colunas).
### Corrigido
- **Ciclo que passava da meia-noite contava inteiro no dia seguinte** nos totais (hoje, semana,
  gráfico de 7 dias, sequência, recordes). `logMinutes()` (`timer.js`) agora divide o tempo em 00:00,
  horário de Brasília, usando `splitAtMidnight()` (`utils.js`). Sessões novas ganham `split: true`.
  Para o histórico já gravado, Ajustes → **Corrigir histórico** (`js/fixmidnight.js`, sob demanda)
  move os minutos para o dia anterior com `increment()`, só depois de confirmação, em lotes
  atômicos e marcando cada ciclo tratado (não aplica duas vezes). Sem mudança em
  `regras-firestore.txt`: o dono já escreve em `sessions` e em `daily`. Limitação conhecida:
  `periodTotals` (indicador de horário produtivo) continua creditando o ciclo todo ao período em
  que ele termina.
- **Notificações no celular mostravam um quadrado branco** em vez da logo na barra de status. No
  Android, o `badge` da notificação é só uma máscara de transparência (o sistema pinta tudo de
  branco onde há pixel opaco), e estávamos usando o `icon-192.png`, que é opaco. Criado
  `icons/badge-96.png` (silhueta branca do anel + "J" com fundo transparente) e usado no `badge` de
  todas as notificações (`sw.js`, `messages.js`, `planner.js`, `room.js`). O `icon` colorido
  continua sendo o `icon-192.png`. Cache do service worker subiu para `juntos-v14`.

## [2.7.0]
### Corrigido
- **Cronômetro ficava pequeno**: o anel de progresso do dia no Planejar usava a classe `.ring`, a
  mesma do relógio do Cronômetro, e encolhia o relógio para 64 px. Renomeado para `.dayRing`.
- **Planejar: a matéria escolhida voltava para a primeira da lista** ao preencher outro campo.
  Causa: `main.js` chama `renderPlannerSubjects()` a cada atualização do perfil (inclusive o
  heartbeat de 25 s), e essa função reconstruía o `<select>` inteiro, perdendo a seleção. Agora
  a escolha vive numa variável (`draft`, em `planner.js`) e a interface só é redesenhada a
  partir dela — nada mais depende do valor de um `<select>` reconstruído.
- **Excluir um item recorrente**: apagar só uma ocorrência fazia o app recriá-la na hora. Agora
  "excluir" pede confirmação e encerra a série daqui pra frente (o que já passou/foi feito fica).
### Alterado
- **Aba Planejar totalmente remodelada** (estilo Todoist/TickTick/Microsoft To Do, sem
  burocracia): campo de adicionar rápido no topo (digitou + Enter), chips grandes para
  matéria/categoria, dia, horário e "mais" (prioridade, duração, repetição) que abrem
  seletores em folha (bottom sheet); faixa de dias com contagem de pendências; cabeçalho do
  dia com anel de progresso; seções "Atrasadas" (com "mover tudo pra hoje") e "Concluídas";
  toque numa linha abre o editor (texto, matéria, dia, horário, prioridade, duração,
  subtarefas, adiar, excluir). Botões e áreas de toque bem maiores.
- **Horário passou a ser opcional** (antes vinha 08:00 por padrão). Itens sem horário viram
  eventos de dia inteiro no `.ics`.
- **Categoria de tarefa padrão embutida ("Tarefa", id `inbox`)**: tarefas não exigem mais criar
  uma categoria antes. Criar categoria nova ficou a um toque, dentro do seletor.
- **Planejamento saiu de Estatísticas → Resumo** e foi para Planejar → **Progresso** (itens
  concluídos, taxa, sequência, gráfico planejado x concluído dos últimos 7 dias e detalhamento
  por matéria/tarefa).
- Busca/filtro, modelos de dia, exportar `.ics` e categorias foram para o menu ⋯. Modelos agora
  são salvos a partir do dia selecionado, e podem ser aplicados em hoje, amanhã ou no dia aberto.
- As sub-abas Planos/Planejar/Tarefas e o calendário de 24 horas foram unificados: a lista do
  dia já vem ordenada por horário.
### Adicionado
- **Análise detalhada de cada semana** (Estatísticas → Resumo → catálogo semanal, toque numa
  semana): total e comparação com a semana anterior, dias estudados, média por dia estudado,
  melhor dia, gráfico dia a dia, ranking por matéria (% do tempo, dias, média por dia, variação
  vs. semana anterior, matérias que ficaram de fora), planejamento da semana e — via subcoleção
  `sessions` — nº de ciclos, duração média/maior ciclo, horários do dia e anotações. Setas
  navegam entre semanas. Novo módulo `js/weekdetail.js` (carregado sob demanda).
- `where` reexportado em `js/firebase.js`.

## [2.6.0]
### Corrigido
- **Notificação de pausa/cronômetro não aparecia no celular**: a causa era que o
  `sw.js` (service worker), responsável por mostrar essa notificação em segundo plano,
  **nunca era registrado** em lugar nenhum do código. Adicionado
  `navigator.serviceWorker.register()` em `main.js`. Isso também corrige, de quebra, as
  notificações de mensagem e de "amigo estudando agora", que dependem do mesmo service
  worker.
- **Matéria removida virava "Matéria removida" nos gráficos**: agora, ao remover uma
  matéria, o nome e a cor dela ficam guardados (`profile.removedSubjects`) e continuam
  aparecendo certos nos últimos 7 dias, no catálogo semanal e no aprofundado — só a
  matéria em si some da lista de escolha para novos ciclos.
- **Duração estimada de tarefa "sumia" ao digitar 0**: `Math.max(0, Number(x)) || null`
  tratava `0` como falso e descartava o valor; corrigido para checar vazio/NaN
  explicitamente.
- **Planejar: "Quando" vinha em "Amanhã" por padrão**: quem criava uma tarefa/ciclo sem
  reparar no seletor acabava agendando pra amanhã sem querer. "Hoje" agora é a opção
  padrão.
### Adicionado
- **Diário de estudos**: agora dá pra editar a anotação de um ciclo já salvo (botão ✎ em
  cada linha do histórico).
- **Perfil do amigo**: além de hoje/semana, agora mostra também quanto o amigo estudou
  **neste mês** e **neste ano**.
- **Novo gráfico em Estatísticas**: linha/área de tendência dos últimos 30 dias, ao lado
  das barras dos últimos 7 dias (sem usar gráfico de pizza).
- **Salas múltiplas**: agora é possível entrar em mais de uma sala de amigos ao mesmo
  tempo e alternar entre elas (chips no topo da aba Sala) sem sair de nenhuma. "Sair da
  sala" agora sai só da sala ativa — as outras continuam.
- **Painel "✨ Novidades"**: resumo do changelog em linguagem simples (sem termo
  técnico), mostrado sozinho depois de uma atualização e reaberto quando quiser em
  Ajustes → Sobre (`js/whatsnew.js`).
### Segurança
- **Documentação interna deixou de ser publicada no site**: o app agora vive dentro de
  uma pasta `public/` própria — só o que está lá vai para o ar. Arquivos internos
  (`claude.md`, `guia-do-codigo.md`, `fluxo-de-trabalho.md`, `leia-me.md`,
  `regras-firestore.txt`, `changelog.md`) ficam fora dela e nunca são publicados, sem
  depender de nenhum truque de redirecionamento específico de um provedor de
  hospedagem.
- **Cabeçalhos de segurança HTTP** (`public/_headers`): Content-Security-Policy (script
  liberado por hash em vez de `unsafe-inline`), `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy` e `frame-ancestors: none` (anti-clickjacking).
- **Hygiene das chaves do Firebase**: `firebase-config.js` foi movido para o
  `.gitignore` e ganhou um modelo (`firebase-config.example.js`) sem chaves reais, para
  quem clonar o projeto do zero. As chaves em si continuam necessariamente visíveis no
  navegador de quem usa o app (inerente a qualquer app Firebase sem backend) — a
  proteção real passou a ser documentada no `LEIA-ME.md`: restringir a `apiKey` por
  domínio no Google Cloud Console.
### Alterado
- **Hospedagem migrada de Netlify para Cloudflare Pages**: todas as instruções de
  deploy (`LEIA-ME.md`, `FLUXO-DE-TRABALHO.md`) e o texto dos Termos de Uso foram
  reescritos para o novo provedor. Reflexo direto da reestruturação em `public/` acima —
  as prévias por branch, inclusive, ficaram mais simples (a Cloudflare já publica uma
  prévia de qualquer branch automaticamente, sem precisar ativar nada).
- **Catálogo semanal**: visual reformulado (cards arredondados, semana atual em
  destaque).
- **"Resumo da semana" → "Resumo do mês"**: o botão de gerar imagem-resumo em
  Estatísticas agora calcula o mês corrente (total, matéria principal, dias ativos,
  melhor dia, comparação com o mês anterior) em vez da semana.
### Atenção — passos manuais necessários
- `regras-firestore.txt` foi atualizado (função `sameRoom`, agora compara listas de
  salas em vez de um código único) para as salas múltiplas funcionarem de verdade —
  **copie o conteúdo atualizado desse arquivo para as regras do seu projeto no console
  do Firebase**. Contas antigas migram sozinhas no próximo login (compatibilidade
  mantida enquanto isso).
- **O app agora precisa ser publicado a partir da pasta `public/`, não da raiz do
  projeto** — veja o `LEIA-ME.md` atualizado (seção "Publicar o site") para o novo passo
  a passo na Cloudflare Pages. Se você publicar a raiz inteira por engano, o site
  continua funcionando, mas a documentação interna volta a ficar exposta.
- Recomendado (não obrigatório): restrinja a `apiKey` do Firebase por domínio no Google
  Cloud Console — passo a passo em "Segurança das chaves do Firebase" no `LEIA-ME.md`.
  Se este repositório já foi público em algum momento, prefira gerar uma chave nova já
  restrita em vez de só restringir a antiga.
- Teste o login com Google logo depois do primeiro deploy com o `_headers` novo — é a
  única regra desta atualização com alguma chance de interferir em algo; se quebrar, é
  só apagar/renomear `public/_headers` e publicar de novo.

## [2.5.1]
### Corrigido — Cronômetro
- **Pausa e foco não começam mais sozinhos**: ao terminar uma fase (foco ou pausa), o
  cronômetro agora **para** e mostra "▶ Continuar", esperando o toque da pessoa — antes a
  próxima fase começava a contar sozinha. Vale também pra quando o app estava fechado/em
  segundo plano e a fase terminou nesse meio tempo: ao reabrir, ele fica parado esperando o
  toque em continuar, em vez de já emendar a próxima fase (e, se várias fases tivessem
  passado do tempo, só a primeira é contabilizada — as demais dependem da pessoa continuar).
- **Alarme diferente no fim da pausa**: agora toca um som de bipes curtos e insistentes
  (bem diferente do sino que toca no fim do foco), pra chamar mais atenção na hora de voltar
  a estudar.
### Conferido
- Notificação em segundo plano do cronômetro (já existente) continua funcionando
  normalmente com o novo fluxo — ela só aparece quando a fase está de fato rodando (ou seja,
  depois que a pessoa toca em "Continuar" pra começar a pausa), com o rótulo certo ("Pausa
  curta"/"Pausa longa") contando o tempo restante.

## [2.5.0]
### Adicionado — Planejar (design, fluxo e funcionalidade)
- **Timeline visual** na aba Planos: cada item ganha uma bolinha na cor da matéria/categoria,
  ligada por uma linha, tipo linha do tempo do dia.
- **Barra de progresso** de hoje no topo da aba Planos ("hoje: 3/7 · 43%").
- **Aviso de sobrecarga**: se o total de duração estimada planejada pra hoje passar de 8h,
  aparece um aviso sugerindo adiar algo.
- **Busca e filtro** (por texto e por Matérias/Tarefas) na aba Planos.
- **Ver a semana toda**: além de hoje/amanhã, um botão expande mais 5 dias.
- **Prioridade** (alta/média/baixa) e **duração estimada** por item, com etiquetas na linha.
- **Subtarefas**: cada item pode ter um checklist próprio, recolhível.
- **Repetição**: um item pode repetir todo dia ou toda semana; as próximas ocorrências (7
  dias) são criadas sozinhas.
- **Adiar 1 dia**: botão "↷" move um item pendente pro dia seguinte, sem recriar.
- **Sugerir horário livre**: preenche o horário automaticamente com base no que já foi
  planejado pro dia escolhido.
- **Modelos de dia**: salve a rotina de hoje com um nome e reaplique em qualquer dia com um
  toque ("💾 salvar hoje como modelo" / "📋 usar modelo").
- **Estudar agora**: itens de matéria ganham um botão que leva direto ao Cronômetro com a
  matéria já selecionada (mesma ideia do "fazer agora" das tarefas).
- **Exportar semana (.ics)**: baixa os próximos 7 dias do plano num arquivo importável em
  qualquer app de calendário.
- **Lembrete de horário**: um aviso (10 min antes) quando o app está aberto ou em segundo
  plano, usando a mesma permissão de notificação do Cronômetro — não é um alarme do sistema,
  então não dispara com o app totalmente fechado.
- Aba **Tarefas**: por padrão agora só mostra as horas que têm algo (menos rolagem), com um
  botão pra ver as 24 horas completas de novo.
- Estados vazios com frases mais simpáticas em vez do texto seco de antes.

### Adicionado — Cronômetro
- Novo cartão **"seu dia até agora"**, abaixo do cronômetro, num espaço totalmente separado —
  nada do cronômetro em si (design, botões, ciclos) foi alterado. Mostra o tempo estudado
  hoje (ao vivo, mesmo com uma sessão em andamento), a comparação com a média dos últimos 7
  dias, a sequência de dias 🔥 e um mini-detalhamento por matéria.

## [2.4.1]
### Adicionado
- Amigos da sala agora veem em tempo real quando você está **fazendo uma tarefa** (ex: "🧹
  fazendo tarefa · limpar a casa"), do mesmo jeito que já viam "📖 estudando · [matéria]". Basta
  tocar em "▶ fazer agora" numa tarefa (Planejar → Planos ou Tarefas); some sozinho quando você
  marca a tarefa como feita, toca em "■ parar", ou fica muito tempo sem usar o app.
- O aviso pop-up de "fulano começou agora" e a notificação também avisam quando é uma tarefa,
  não só quando é uma matéria.
- Estatísticas → Resumo → "planejamento" agora tem sub-abas separadas — **Matérias estudadas** e
  **Tarefas** — em vez de uma lista só misturando as duas.

## [2.4.0]
### Adicionado
- Aba **Planejar** agora tem sub-abas — **Planos**, **Planejar** e **Tarefas** — no mesmo padrão
  visual das sub-abas de Estatísticas (Resumo / Diário de estudos / Aprofundado). "Planos" mostra
  a lista de hoje e amanhã; "Planejar" é o formulário de adicionar; "Tarefas" é a novidade abaixo.
- Nova sub-aba **Tarefas**: mostra só os itens do tipo tarefa (ex: "limpar a casa") como um
  calendário de horas de hoje ou amanhã, com um alternador Hoje/Amanhã e o dia da semana escrito
  por extenso (ex: "Amanhã é sexta-feira.").

## [2.3.0]
### Adicionado
- Aba **Planejar** redesenhada em dois painéis: um pra **adicionar** rápido (matéria ou tarefa,
  horário, "hoje" ou "amanhã") e outro só pra **ver o plano de hoje e amanhã juntos**, ordenado por
  horário, com contador de pendências por dia.
- Planejar agora aceita **tarefas** além de matérias — categorias livres (Casa, Trabalho, Pessoal…)
  criadas e coloridas por você em "🎨 categorias de tarefa", direto na própria aba.
- Nova seção **Planejamento** na aba Estatísticas: tarefas concluídas, taxa de conclusão, sequência
  de dias cumprindo o plano, e um detalhamento colorido por matéria/categoria.
- Compartilhamento do planejamento com a sala (Ajustes → Planejamento), do mesmo jeito que já
  existia pro Diário de estudos — cada pessoa decide, uma a uma, quem vê o quê. O perfil de amigo
  agora mostra o plano de hoje/amanhã de quem liberou.
- Paleta de cores de matérias/categorias mais que dobrou (de 8 para 18 tons curados) e ganhou um
  seletor de **cor personalizada** (escolha livre, qualquer cor) ao lado das bolinhas — tanto em
  Ajustes → Matérias quanto nas categorias de tarefa.
### Modificado
- **Horário padrão do app agora é Brasília/São Paulo**, sempre — não depende mais do fuso
  configurado no aparelho de quem está usando. Afeta o que conta como "hoje" no cronômetro, nas
  estatísticas (sequência, totais diários/semanais/mensais, gráfico de 7 dias, mapa de calor,
  conquistas) e na aba Planejar, além dos horários mostrados nas mensagens da sala e nas
  notificações. Ver `BR_TZ`/`brNow()`.
- Seletor de matéria/categoria em formulários (`select.f`) ganhou o mesmo visual dos campos de
  texto — antes ficava com a aparência padrão do navegador.

## [2.2.0]
### Adicionado
- Nova aba **Planejar**: monte a lista do que estudar/fazer amanhã (ou hoje), escolhendo horário e
  matéria de cada item; marque como feito ou remova. Guardado no próprio perfil (`plannedTasks`),
  sem coleção nova no Firestore.
- Mensagens da sala agora são **cifradas** (AES-256-GCM, Web Crypto nativa do navegador) antes de
  serem salvas no Firestore — a chave é derivada do código da sala e nunca sai do aparelho. Ver
  `js/crypto.js` para os detalhes e limites dessa proteção.
- Ícone de cadeado 🔒 nas mensagens da sala, indicando que estão cifradas.
### Modificado
- Nav (abas) e o container principal ganharam ajustes de responsividade: nav não estoura em telas
  muito estreitas (< 370px) e o conteúdo fica um pouco mais largo e centralizado em telas
  grandes (≥ 860px).
- Transições de aba, listas (planejamento, distrações, mensagens, membros da sala) e modais
  ganharam animações de entrada mais fluidas (respeitando `prefers-reduced-motion`, como já era o
  caso antes).
### Segurança
- **Ação manual necessária**: o limite de tamanho do campo `text` em `rooms/{code}/messages` subiu
  de 240 para 2000 caracteres nas regras do Firestore (o texto cifrado em base64 é maior que o
  texto puro). Cole o conteúdo atualizado de `regras-firestore.txt` no console do Firebase, ou o
  envio de mensagens vai passar a falhar.

## [2.1.0] — 2026-09-23
### Adicionado
- Perfil de amigo: tela isolada, aberta ao tocar em alguém da sala, com estatísticas do dia/semana
  e gráfico por matéria dos últimos 7 dias.
- Compartilhamento do diário de estudos: cada pessoa libera, individualmente e sem precisar de
  aprovação, quem da sala pode ver as anotações do seu diário.
- Aviso de "amigo estudando agora" (o quê e desde quando), com o mesmo alcance das notificações de
  mensagem — funciona com o app aberto ou minimizado, não com o app totalmente fechado.
- Opção de apagar as próprias mensagens da sala.
- Nova aba "Aprofundado" em Estatísticas: recordes pessoais (melhor dia, melhor semana, maior
  sequência já feita, média dos últimos 30 dias), mapa de calor de frequência no último ano,
  evolução por matéria mês a mês, melhor dia da semana pra estudar, e comparação com a sala.
- Modo claro/escuro/automático (segue o sistema) em Ajustes → Aparência, salvo no perfil e
  sincronizado entre aparelhos.
### Modificado
- `friend.js` e `deepstats.js` (novos módulos) são carregados sob demanda, seguindo o mesmo padrão
  de `wrapped.js`/`pip.js`.
### Segurança
- Regras do Firestore atualizadas: leitura do diário liberada para quem está na lista
  `diarySharedWith` do dono; exclusão de mensagem liberada só para o próprio autor.

## [2.0.0] — 2026-09-16
### Adicionado
- Diário de estudos: nota opcional ao concluir cada ciclo de foco, com histórico navegável.
- Ranking semanal da sala, com destaque para quem está estudando agora.
- Sessão coletiva: pomodoro sincronizado entre todos os membros de uma sala.
- Indicador de horário mais produtivo (madrugada/manhã/tarde/noite) com sugestão personalizada.
- Anotação rápida de distrações ("mental dump"), sem interromper o ciclo em andamento.
- Modo Leitura (tela escurecida) para quem estuda por material físico.
- Resumo semanal exportável como imagem, com opção de compartilhar.
- Mini player com Picture-in-Picture nativo (desktop) e cartão flutuante (mobile).
- Contraste de texto automático no papel de parede, calculado a partir do brilho da imagem.
### Modificado
- Código reorganizado de um único arquivo (`app.js`) para módulos ES (`js/*.js`) com
  responsabilidade única cada.
- `wrapped.js` e `pip.js` agora são carregados sob demanda (só quando usados), reduzindo o peso
  inicial do app.
- Perfil do usuário fica em cache local e aparece imediatamente ao abrir o app.
- Ações de UI (salvar perfil, matéria, mensagem, ajustes) atualizam a tela otimisticamente, antes
  da confirmação do servidor.
- Controle de brilho do papel de parede agrupa gravações no banco (só grava após o usuário parar
  de interagir).

## [1.2.0] — 2026-09-15
### Adicionado
- Sessão salva no aparelho: o app abre direto, sem repetir o login do Google.
- Cronômetro à prova de fechar o app: baseado no relógio do sistema, recupera ciclos perdidos
  automaticamente ao reabrir.
- Notificação em segundo plano com contagem regressiva atualizada a cada segundo.
- Papel de parede personalizável (foto da galeria), privado por padrão.
- Contador de streak (dias consecutivos estudando).
- Mensagens dentro da sala, com envio para todos ou só para uma pessoa.
- Exibição do que cada amigo está estudando no momento (matéria e status ao vivo).

## [1.1.0] — 2026-09-15
### Adicionado
- Indicador de presença online dos membros da sala.
- Catálogo semanal nas estatísticas, navegável por ano.
- Som e vibração ao concluir um ciclo.
- Matérias com cor própria, refletidas no gráfico de estudo.
- Cronômetro de pausa também no modo livre.
### Modificado
- Paleta de cores: fundo azul claro, com uma cor de destaque própria para cada aba.

## [1.0.0] — 2026-09-15
### Adicionado
- Lançamento inicial: login com Google, cronômetro pomodoro/livre, estatísticas por
  dia/semana/mês/ano, salas de estudo por código, instalável como PWA.
