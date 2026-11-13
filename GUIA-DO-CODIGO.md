# Como o código do Juntos funciona

Este guia é pra você conseguir abrir um arquivo, entender o que ele faz, e mudar uma coisa pequena
sozinho — sem precisar me chamar toda vez. Não pressupõe que você já programou.

---

## 1. A ideia geral, em uma imagem mental

Pense em três camadas:

```
index.html   →  a "planta da casa": todo o texto/botões que aparecem na tela, e o estilo (cores,
                 tamanhos, espaçamentos) dentro da tag <style>. Não tem lógica — só aparência.

main.js      →  o "maestro": liga tudo, decide a ordem de inicialização, e conecta os módulos
                 entre si. É o primeiro arquivo que roda.

js/*.js      →  os "trabalhadores especializados": cada arquivo cuida de UMA responsabilidade
                 (o cronômetro, o papel de parede, a sala, etc.) e não se mistura com as outras.
```

Quando o navegador abre `index.html`, ele lê o HTML/CSS e no final encontra
`<script type="module" src="main.js">`. Isso dispara `main.js`, que importa e liga os módulos de
`js/`. Cada módulo, por sua vez, manipula pedaços específicos do HTML (por `id`) e conversa com o
Firebase quando precisa salvar ou ler algo.

---

## 2. O "quadro compartilhado": `js/store.js`

A maior dúvida de quem nunca viu um app dividido em módulos costuma ser: *"se cada arquivo é
separado, como um sabe o que o outro está fazendo?"*

A resposta é o arquivo `js/store.js`. Ele exporta um único objeto chamado `store`:

```js
export const store = {
  me: null,            // quem está logado
  profile: null,        // os dados da pessoa (nome, cor, matérias, config do ciclo…)
  cfg: {...},            // config atual do cronômetro
  subjects: [],           // lista de matérias
  currentSubjectId: "geral",
  ...
};
```

Todo módulo que precisa saber "quem é o usuário atual" ou "qual matéria está selecionada" importa
esse mesmo `store` (`import { store } from "./store.js"`) e lê direto dele — é sempre o mesmo
objeto na memória, então uma mudança feita por um módulo é vista por todos os outros na hora,
sem precisar avisar ninguém explicitamente.

---

## 3. Mapa dos arquivos

> Todos os caminhos abaixo (`index.html`, `main.js`, `js/...`) ficam dentro da pasta
> `public/` do projeto — é a pasta que vai pro ar como site (veja o quadro "por que
> public/" no `LEIA-ME.md`). Os outros arquivos citados aqui, fora da tabela (este
> guia, `LEIA-ME.md`, `regras-firestore.txt` etc.), ficam na raiz do projeto, fora de
> `public/`.

| Arquivo | O que ele faz | Quando abrir |
|---|---|---|
| `index.html` | Estrutura da tela + todo o CSS (cores, fontes, espaçamentos) | Mudar aparência, textos fixos, cores |
| `main.js` | Liga os módulos entre si na ordem certa | Quase nunca — só se for adicionar um módulo novo |
| `js/store.js` | O estado compartilhado (perfil, config, matérias…) | Raramente |
| `js/constants.js` | Números e listas fixas: cores padrão, duração padrão do ciclo, mensagens rápidas padrão, versão do app | Mudar um valor padrão |
| `js/firebase.js` | Liga o app ao Firebase (login, banco de dados) | Quase nunca |
| `js/utils.js` | Funções pequenas usadas em vários lugares: formatar tempo, formatar data, gerar código de sala, o "modal" genérico | Raramente |
| `js/auth.js` | Login com Google, manter sessão salva, cache local do perfil | Mudar o texto/fluxo de login |
| `js/timer.js` | **O cronômetro inteiro**: pomodoro, modo livre, pausas, retomar depois de fechar o app, som, vibração, notificação, modo leitura | Qualquer coisa do cronômetro |
| `js/subjects.js` | Matérias e mensagens rápidas (criar, listar, remover) | Mexer nas matérias |
| `js/distractions.js` | O "anotar distração" / lista "para fazer depois" | Mexer nesse recurso |
| `js/tada.js` | A aba **Ta-da** (substitui o antigo Planejar): done-list em 3 estilos (Corrida, Marcar, Top 3), Diário de gratidão, aba Amigos e os interruptores de Ajustes → quem pode ver | Mexer na tela do Ta-da |
| `js/tada-data.js` | Dados do Ta-da (e o resumo diário que alimenta as estatísticas salvas): limites, atalhos do estilo "Marcar", ouvintes do Firestore (`users/{uid}/tada` e `/gratitude`, um documento por dia), gravação otimista, estudo do dia derivado de `daily`, resumos e HTML só-leitura de amigos | Mexer em dados, limites, atalhos prontos |
| `js/icons.js` | Ícones de traço (SVG) da aba Estatísticas: `icon(nome)` e `hydrateIcons()` | Trocar/adicionar um ícone |
| `js/dom.js` | Atualização pontual do DOM: `morph` (só muda o que mudou), `setText`/`setAttr`/`setHTML` | Redesenhar uma lista sem recriar tudo |
| `js/motion.js` | Movimento: mola, FLIP, entrada de linha, contagem (sem View Transitions) | Mudar/adicionar uma animação |
| `tools/teste-navegador/` | Testes e medição num Chromium real (Firebase falso): `e2e.mjs`, `bench.mjs` | Conferir que nada quebrou / medir desempenho |
| `js/tada-history.js` | Ta-da → **📊 Histórico**: semana/mês/ano, calendário, destaques, frases de fecho e gratidões; detalhe somente leitura de qualquer dia; estatísticas salvas por mês (`users/{uid}/tadaStats`). Carregado sob demanda | Mexer nas estatísticas do Ta-da |
| `js/gratitude-prompt.js` | O momento de gratidão logo depois de estudar (chamado por `studylog.js`) | Mexer nesse pop-up |
| `js/crypto.js` | Cifra/decifra o texto das mensagens da sala (AES-GCM, chave derivada do código da sala) | Mexer na criptografia das mensagens |
| `js/studylog.js` | A nota de fim de ciclo + o histórico ("Diário de estudos"), com filtro por matéria e horário de cada ciclo | Mexer no diário |
| `js/removecycles.js` | Ajustes → Remover ciclos: lista os ciclos do Diário e remove os escolhidos (apaga o registro e desconta dos totais por dia e por período, num lote só). Carrega sob demanda | Mexer na remoção de ciclos |
| `js/fixmidnight.js` | Correção única do histórico: divide na meia-noite os ciclos gravados antes de `logMinutes()` fazer isso (botão em Ajustes). Carrega sob demanda | Mexer na correção do histórico |
| `js/studylog-hours.js` | Aba "Horários" de Estatísticas (gráfico por hora do dia, detalhe por hora, linha do tempo por dia). Carregado sob demanda | Mexer nos horários |
| `js/stats.js` | A aba Estatísticas: totais, gráfico de 7 dias, tendência de 30 dias, streak, indicador de horário produtivo e catálogo semanal (cada semana abre a análise detalhada) | Mexer em estatísticas |
| `js/weekdetail.js` | Análise detalhada de uma semana (abre ao tocar numa semana do catálogo): comparação com a anterior, por matéria, dias, ciclos, horários, anotações. Carrega sob demanda | Mexer na análise semanal |
| `js/quotes.js` + `js/quotes-data.js` | Aba **Frases**: frase do dia, sorteio, filtros, favoritas (só neste aparelho) e compartilhar. As frases ficam em `quotes-data.js` (só dados). Carrega sob demanda | Adicionar/trocar frases, mudar a aba |
| `js/wrapped.js` | "Resumo do mês" para compartilhar: janela com escolha de mês/tema e o cartão 1080×1350 desenhado em canvas (só carrega quando usado) | Mexer no design do resumo ou nos meses disponíveis |
| `js/room.js` | Criar/entrar/sair da sala, presença online, ranking, sessão coletiva | Mexer na sala |
| `js/messages.js` | Mensagens dentro da sala | Mexer nas mensagens |
| `js/friend.js` | Perfil de amigo (estatísticas, diário, done-list e gratidão, quando liberados) | Mexer no perfil de amigo |
| `js/wallpaper.js` | Papel de parede + contraste automático | Mexer no papel de parede |
| `js/fx.js` | Efeitos de movimento: onda no toque, confete, entrada em cascata das telas, contagem de números, estado do cronômetro rodando; modo Cinema/Suave (só CSS+JS visual, sem dados) | Mexer em animações/reações de botão |
| `js/pip.js` | O mini player (só carrega quando usado) | Mexer no mini player |
| `js/ui.js` | Liga as abas, o botão de salvar perfil, os interruptores de som/notificação | Mexer nesses controles |
| `js/whatsnew.js` | Painel "✨ Novidades" (resumo do changelog em linguagem simples, mostrado sozinho após uma atualização e reaberto em Ajustes → Sobre) | Adicionar a entrada de uma versão nova |
| `js/a11y.js` | Acessibilidade: avisos para leitores de tela, estados ARIA, teclado, janelas com foco preso, "Pular para o conteúdo" | Mexer em acessibilidade |
| `js/reminders.js` | Lembrete gentil de estudo (horários, dias, só neste aparelho) e o painel em Ajustes → Som e notificações | Mudar textos/regras do lembrete |
| `js/pushsub.js` | Lembrete com o app fechado, lado do aparelho (permissão, cadastro/descadastro no Worker, silêncio) | Mudar o que é enviado ao servidor |
| `worker-push/` | Worker da Cloudflare (Web Push + D1 + cron), com `LEIA-ME.md` de deploy e `test.mjs` | Mudar horários/limites do envio |
| `js/quiet.js` | "Silenciar avisos" (hoje/7 dias); `isQuiet()` é consultado por lembretes, mensagens e avisos da sala | Mexer no silêncio |
| `js/connectivity.js` | Faixa de offline e confirmação "tudo sincronizado" | Mexer nos avisos de conexão |
| `js/offlineStore.js` | Caderninho em IndexedDB (diário do que foi feito offline) | Raramente |
| `js/comfort.js` | Barra de conforto, paletas suaves, tamanho do texto, tema rápido | Mexer em conforto/aparência |
| `js/breathe.js` | Pausa consciente (respiração guiada), desligada por padrão | Mexer na pausa consciente |
| `js/consistency.js` | Painel "Sua constância" em Estatísticas | Mexer nos gráficos de presença |
| `js/importData.js` + `js/exportData.js` | "Baixar" e "Importar" meus dados (JSON, não destrutivo, com resumo) | Mexer na portabilidade |
| `js/updates.js` | Registra o service worker, confere se há versão nova antes de mostrar a tela e recarrega sem exibir a antiga | Raramente — cuidado extra aqui |
| `sw.js` | O "service worker": deixa o app instalável, cacheia arquivos, mantém a notificação viva em segundo plano | Raramente — cuidado extra aqui |
| `firebase-config.js` | Suas chaves do Firebase (fora do git — veja `.gitignore`) | Só uma vez, na configuração |
| `firebase-config.example.js` | Modelo em branco de `firebase-config.js`, pra quem clona o projeto do zero | Praticamente nunca |
| `regras-firestore.txt` | As regras de segurança do banco (não roda no app — você cola no console do Firebase) | Quando eu avisar que mudou |
| `_headers` | Configuração de segurança da Cloudflare Pages (cabeçalhos HTTP: CSP, anti-clickjacking etc.) — lido automaticamente, sem passo manual | Raramente — cuidado extra aqui |

---

## 4. Receitas rápidas — mudanças comuns e onde mexer

**Mudar a cor de destaque do Cronômetro (hoje é um coral/laranja)**
→ `index.html`, procure por `--c-timer:#FF6A45;` no `:root{...}` dentro de `<style>`. Troque o
código de cor (mantenha o formato `#RRGGBB`). As outras três — `--c-stats`, `--c-room`,
`--c-settings` — seguem a mesma lógica para as outras abas.

**Mudar a duração padrão do ciclo (hoje 25/5/20 min)**
→ `js/constants.js`, procure por `DEFAULT_CFG`. É o valor que uma conta nova recebe; quem já usa o
app e já salvou um ajuste próprio em Ajustes não é afetado.

**Mudar as cores disponíveis pro avatar ou pras matérias**
→ `js/constants.js`, `AVATAR_COLORS` e `SUBJECT_COLORS`.

**Mudar o som ao terminar um ciclo**
→ `js/timer.js`, procure por `function celebrate(kind)`. As duas chamadas de `playTone([...])`
definem as notas (em Hz) tocadas — números mais altos soam mais agudos.

**Mudar o que o Histórico considera "muito"/"pouco" (emoji 🌱🌿🌳 do período)**
→ `js/tada-history.js`, `TIERS` (limites de conquistas para semana, mês e ano) e `HERO_LINES` (frases de incentivo).

**Mudar/adicionar atalhos prontos do estilo "Marcar" (done-list)**
→ `js/tada-data.js`, `PRESET_GROUPS`: cada item tem `id` (único, não mude os existentes), `ico` e `t` (texto).

**Adicionar uma frase na aba Frases**
→ `js/quotes-data.js`, array `QUOTES`: copie um item e preencha `t` (frase), `a` (autor), `quem`, `src` (fonte)
e `cat`. Só inclua frases com fonte conhecida — muita frase famosa da internet tem autoria falsa.

**Mudar as mensagens rápidas padrão da sala**
→ `js/constants.js`, `DEFAULT_QUICK`.

**Mudar o texto de alguma tela (ex: a frase da tela de login)**
→ Está direto no `index.html`, dentro da tag correspondente. Procure (Ctrl+F) por um trecho do
texto atual pra achar o lugar certo.

**Mudar depois de quanto tempo alguém "sai de online" na Sala**
→ `js/constants.js`, `ONLINE_WINDOW_MS` (em milissegundos; 90 * 1000 = 90 segundos).

**Adicionar um novo período pro indicador de horário produtivo (ex: separar "fim de tarde")**
→ `js/constants.js`, array `PERIODS` — cada item tem `from`/`to` em horas (0–24).

**Mudar o fuso horário padrão do app (hoje é Brasília/São Paulo)**
→ `js/constants.js`, `BR_TZ`. É essa referência que decide o que é "hoje"/"amanhã" no app inteiro
(cronômetro, estatísticas, aba Ta-da), não o fuso do aparelho de quem está usando — veja
`brNow()` em `js/utils.js`.

Se a mudança que você quer não está nessa lista, é normal — me chame e eu faço, ou tente localizar
pelo nome do recurso na tabela da seção 3 e procurar (Ctrl+F) por palavras relacionadas dentro do
arquivo.

---

## 5. Git e GitHub em português simples

Você não precisa saber isso pra usar o "jeito rápido" (arrastar o zip na Cloudflare Pages). Mas se
for pelo caminho do GitHub, esses termos vão aparecer:

- **Repositório ("repo")** — a pasta do projeto, guardada no GitHub, com histórico de tudo que já
  mudou nela.
- **Commit** — um "salvamento com etiqueta": um conjunto de mudanças, com uma mensagem explicando o
  que mudou (ex: "som novo no cronômetro"). Cada commit fica guardado pra sempre no histórico —
  nada se perde.
- **Push** — enviar commits feitos no seu computador para o GitHub. (Pelo site do GitHub, isso
  acontece sozinho quando você clica em "Commit changes" no upload.)
- **Deploy** — a publicação de uma versão específica do código no ar (no seu caso, feita pela
  Cloudflare Pages). Cada commit novo no GitHub gera um deploy novo.
- **Rollback (voltar uma versão)** — se um deploy quebrar alguma coisa, no painel da Cloudflare,
  **Workers & Pages → seu projeto → Deployments**, ache um deploy anterior que funcionava, abra o
  menu **⋯** e escolha **Rollback to this deployment**. Isso não apaga o código quebrado do
  GitHub, só volta o que está no ar — dá pra corrigir com calma depois.
- **Branch** — uma "versão paralela" do código, útil pra testar algo arriscado sem afetar o site no
  ar. Pra o seu uso (app pessoal/família), não é necessário — trabalhar direto na branch principal
  (`main`) é suficiente.

---

## 6. O próximo nível: Claude Code

Hoje, cada mudança passa por mim gerando os arquivos aqui no chat. Quando o repositório estiver no
GitHub, existe um caminho mais direto: o **Claude Code**, um app da Anthropic que edita o código no
seu computador (ou celular) com apoio de IA, e já sabe puxar e enviar mudanças pro GitHub sozinho —
sem você precisar copiar e colar arquivo por arquivo. Nesse ponto, pedir "muda a cor do cronômetro
pra azul" ou "adiciona um botão X" vira uma conversa direta com o código do seu projeto, com as
mudanças aparecendo no ar em minutos.

Não é necessário agora — o fluxo atual (me pedir aqui, eu devolver os arquivos, você subir no
GitHub) funciona bem para ajustes pontuais. Mas se algum dia você quiser esse nível de autonomia,
é só avisar que a gente configura.

## Segurança e privacidade — o que mudou na 2.9.0 (leia antes de mexer em dados do usuário)

- **Nunca grave dado sensível em `users/{uid}`.** Esse documento é legível por toda a sala. Dados
  privados vão para `users/{uid}/private/mind` (só o dono) ou `private/planner` (legado, só o dono). Para
  isso basta usar `updateDoc(doc(db,"users",uid), {...})` de `js/firebase.js` — ele separa os campos
  conforme `PRIVATE_FIELDS`. **Campo novo e sensível? Adicione-o em `PRIVATE_FIELDS`.**
- **Tudo que vem de outra pessoa é hostil.** Cor → `safeColor()`, URL → `safeUrl()`, número → `safeNum()`,
  texto → `esc()`. Nunca interpole campo de outro usuário direto em `style=""`/atributo.
- **Mensagem direta** → `rooms/{code}/inbox/{uid}/msgs`; pública → `rooms/{code}/messages`. O nome de
  quem enviou vem do perfil real do `uid`, nunca de campo da mensagem.
- `js/privacy.js` — aceite dos Termos (versão em `CONSENT_VERSION`), excluir conta. `js/exportData.js` —
  baixar dados (JSON). `auth.js` → `signOutAndWipe()` limpa o aparelho ao sair.
- Se editar o `<script>` embutido do `index.html`, recalcule o hash SHA-256 no CSP de `public/_headers`.
- Mudou Termos/Política de forma relevante? Suba `CONSENT_VERSION` em `constants.js` e a versão/data nos HTMLs.

