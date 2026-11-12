# Juntos — como colocar seu app no ar

Tempo estimado: **30 a 45 minutos**. Não precisa instalar nada nem usar terminal.
Custo: **zero**. O plano gratuito do Firebase (Spark) não pede cartão de crédito.

---

## Parte 1 — Criar o projeto no Firebase (15 min)

1. Acesse **console.firebase.google.com** e entre com sua conta Google.
2. Clique em **Criar um projeto**. Nome: `juntos-estudo` (ou o que quiser).
3. Na tela do Google Analytics, pode **desativar** — não é necessário. Clique em **Criar projeto**.

### 1.1 Ativar o login com Google
4. No menu da esquerda: **Criação → Authentication → Comecar**.
5. Aba **Sign-in method** → clique em **Google** → ative a chavinha.
6. Preencha o e-mail de suporte (o seu) e clique em **Salvar**.

### 1.2 Criar o banco de dados
7. Menu da esquerda: **Criação → Firestore Database → Criar banco de dados**.
8. Escolha **Iniciar no modo de produção**.
9. Local: `southamerica-east1` (São Paulo). Clique em **Ativar**.

### 1.3 Colar as regras de segurança
10. Ainda no Firestore, abra a aba **Regras**.
11. Apague tudo que estiver lá e cole o conteúdo do arquivo **`regras-firestore.txt`** desta pasta.
12. Clique em **Publicar**.

### 1.4 Pegar suas chaves
13. Clique na **engrenagem** (canto superior esquerdo) → **Configurações do projeto**.
14. Role até **Seus apps** → clique no ícone **`</>`** (Web).
15. Apelido do app: `Juntos`. **Não** marque "Firebase Hosting". Clique em **Registrar app**.
16. Aparecerá um bloco de código com `const firebaseConfig = { ... }`. **Copie os valores.**
17. Abra o arquivo **`public/firebase-config.js`** desta pasta em qualquer editor de texto (Bloco de Notas serve) e substitua cada `"COLE_AQUI"` pelo valor correspondente. Salve.

> Essas chaves não são secretas — elas ficam visíveis no site de qualquer app web. Quem protege seus dados são as regras do passo 11.

### 1.5 Segurança das chaves do Firebase (recomendado, 5 min)

> Na 2.13 o passo a passo completo (domínios, APIs permitidas e domínios autorizados do login) também está no cabeçalho de `public/firebase-config.js`. Lembre de **republicar `regras-firestore.txt`** no console: ele ganhou validação nova.

A frase acima é verdade — mas "não são secretas" não é a mesma coisa que "não vale a pena
proteger". Reduzir quem pode *usar* essas chaves, mesmo sendo públicas, é uma camada extra
de segurança que vale a pena configurar:

1. No **Google Cloud Console** (não é o Firebase — é `console.cloud.google.com`, o mesmo
   projeto por trás do seu Firebase), vá em **APIs e serviços → Credenciais**.
2. Clique na chave de API que aparece na lista (é a mesma `apiKey` que você colou no passo
   1.4).
3. Em **Restrições de aplicativo**, escolha **Sites (referenciadores HTTP)** e adicione o
   endereço do seu site (ex.: `juntos-familia.pages.dev/*`) — e `localhost/*` se você
   também testa local. Salve.
4. A partir daí, mesmo que alguém copie sua `apiKey` de algum lugar, ela **não funciona**
   fora dos endereços que você autorizou.

Isso soma com o passo **2.1** logo abaixo (Domínios autorizados do Firebase Auth) — os
dois juntos fecham as duas portas: uma restringe onde a chave funciona, a outra restringe
de onde o login consegue completar.

Se você já tiver enviado este projeto pro GitHub (ou qualquer lugar público) **antes** de
fazer essa restrição, considere a chave já exposta publicamente — recomenda-se então
**apagar essa chave no Google Cloud Console e gerar uma nova** já com a restrição
configurada, em vez de só restringir a antiga.

> A partir desta versão, `firebase-config.js` (o arquivo com suas chaves) está no
> `.gitignore` — commits novos não vão mais incluí-lo. Isso **não** remove o arquivo de
> commits antigos que já existiam antes dessa mudança; se seu repositório for público e
> isso te preocupar, o caminho mais simples é gerar uma chave nova (parágrafo acima) em
> vez de tentar apagar histórico do git.

---

## Parte 2 — Publicar o site (10 min)

> **Por que existe uma pasta `public/`?** É a única pasta que deve ir para o ar — tem
> só o que o app precisa pra funcionar. Tudo que fica fora dela (este arquivo, o
> `regras-firestore.txt`, etc.) é documentação pra quem mantém o projeto, sem motivo pra
> ficar acessível publicamente. É por isso que o passo 1 abaixo pede pra zipar **o
> conteúdo de `public/`**, e não a pasta inteira do projeto.

1. Abra a pasta **`public/`**, selecione **todos os arquivos de dentro dela** (não a
   pasta em si) e crie um `.zip` — lembre de refazer o zip **depois** de editar o
   `firebase-config.js`.
2. Acesse **dash.cloudflare.com**, crie uma conta gratuita se ainda não tiver, e entre.
3. No menu da esquerda: **Workers & Pages → Create → Pages → Upload assets**.
4. Dê um nome ao projeto (ex.: `juntos-familia`) e clique em **Create project**.
5. **Arraste o `.zip`** (ou a pasta `public/` inteira) para a área indicada e clique em
   **Deploy site**. Em segundos o site estará no ar.
6. Você receberá um endereço tipo `juntos-familia.pages.dev`.

### 2.1 Autorizar o endereço no Firebase
7. Volte ao Firebase: **Authentication → Settings → Domínios autorizados → Adicionar domínio**.
8. Cole seu endereço, **sem `https://`** — exemplo: `juntos-familia.pages.dev`.
9. Salve. **Sem este passo o login com Google não funciona.**

### 2.2 Arquivo de segurança que já vem pronto
`public/_headers` é lido pela Cloudflare Pages sozinho, sem precisar configurar nada no
painel — define cabeçalhos de segurança HTTP, incluindo uma política que restringe de
onde o app pode carregar script/imagem/conexão. Ele é só arrastar junto com o resto (já
está dentro de `public/`) — mas **teste o login com Google logo depois de publicar**; se
ele parar de funcionar, apague ou renomeie `_headers` e publique de novo (veja o
comentário no topo do próprio arquivo).

### 2.3 Atualizando o site depois
Sempre que eu te mandar uma pasta nova com correções: refaça o zip **do conteúdo de
`public/`** (lembrando de colar de novo suas chaves em `firebase-config.js`, já que ele
não vem preenchido) e, no seu projeto em **Workers & Pages**, vá em **Deployments →
Create deployment** e arraste o novo zip. O endereço do site continua o mesmo.

---

## Parte 3 — Instalar no celular (2 min por pessoa)

Mande o link para sua família. Cada pessoa abre no celular e:

- **Android (Chrome):** menu ⋮ → **Instalar app** / **Adicionar à tela inicial**.
- **iPhone (Safari):** botão de compartilhar → **Adicionar à Tela de Início**.

O app passa a abrir em tela cheia, com ícone próprio, como qualquer outro aplicativo.

---

## Parte 4 — Estudar junto

1. Cada pessoa entra com a própria conta Google.
2. Uma delas vai em **Sala → Criar uma sala nova** e recebe um código de 6 letras.
3. As outras vão em **Sala**, digitam o código e clicam em **Entrar**.
4. Pronto: todos aparecem na lista, com o total estudado na semana, atualizando em tempo real.

---

---

## Parte 5 — Como continuar melhorando o app

### As pessoas precisam baixar o app de novo a cada mudança?
**Não.** O app usa a estratégia "rede primeiro": toda vez que alguém abre o Juntos com internet,
ele busca os arquivos mais recentes direto do site antes de qualquer coisa. Assim que você publica
uma mudança, o próximo "abrir o app" de cada pessoa já traz a versão nova — sem reinstalar, sem
tirar da tela inicial. Se a pessoa abrir sem internet, ela vê a última versão que ficou salva no
aparelho, e assim que a internet voltar, atualiza sozinha.

Pra confirmar que uma mudança chegou a um celular específico, veja o número em **Ajustes → Versão**
— é por isso que esse número existe.

### Como pedir uma mudança
Me diga o que você quer (ex: "quero um som diferente ao terminar o ciclo", "quero mostrar o total
do mês na Sala também", "quero mudar a cor dourada por um azul"). Eu edito o(s) arquivo(s) certo(s)
dentro de `/js` e te devolvo o pacote atualizado — você só precisa publicar de novo (veja abaixo).
Antes de cada entrega, eu subo o número em **Ajustes → Versão** (arquivo `js/constants.js`), pra
você confirmar que pegou. Veja o **`GUIA-DO-CODIGO.md`** para entender qual arquivo faz o quê e
conseguir fazer pequenos ajustes você mesmo.

### Jeito rápido: arrastar de novo (bom para poucas mudanças)
1. Baixe o pacote atualizado que eu te enviar.
2. Abra a pasta **`public/`** dele, cole de novo suas chaves em `firebase-config.js` (o
   pacote que eu te mando não vem com elas preenchidas) e crie um `.zip` **do conteúdo
   de `public/`**.
3. Acesse o painel do seu projeto em **dash.cloudflare.com → Workers & Pages** → clique
   no seu projeto → aba **Deployments**.
4. Clique em **Create deployment** e arraste o novo zip (ou a pasta `public/`).
5. Pronto — em segundos a versão nova está no ar, no mesmo endereço de sempre.

### Jeito bom: publicação automática via GitHub (recomendado se você for mexer com frequência)
Assim, toda vez que os arquivos mudarem, o site se atualiza sozinho — sem você arrastar nada. Essa
é a base para tudo que o **`GUIA-DO-CODIGO.md`** ensina depois.

1. Crie uma conta gratuita em **github.com**, se ainda não tiver.
2. Clique em **New repository**, dê o nome `juntos-app`, marque **Private** (só você e quem convidar
   acessam o código) e clique em **Create repository**.
3. Na página do repositório vazio, clique em **uploading an existing file**. Arraste a **pasta
   inteira** do projeto (não os arquivos um por um) para a área de upload — os navegadores atuais
   (Chrome, Edge, Firefox) recriam as subpastas sozinhos, então `public/js/timer.js`,
   `public/js/stats.js` etc. chegam no lugar certo. Clique em **Commit changes**.
   - Se o navegador não aceitar arrastar a pasta (só os arquivos soltos), envie os arquivos da raiz
     primeiro, depois clique em **Add file → Create new file** dentro do repositório e digite
     `public/js/timer.js` como nome — o GitHub cria as pastas sozinho ao ver a barra `/` no nome, e
     você cola o conteúdo daquele arquivo. Repita para os outros arquivos. Dá mais trabalho, mas
     só precisa ser feito uma vez.
   - `public/firebase-config.js` **não deve ir para o GitHub** (está no `.gitignore` por isso) — só
     precisa existir no zip que você sobe na Cloudflare, não no repositório.
4. No **dash.cloudflare.com**, vá em **Workers & Pages → Create → Pages → Connect to Git**.
5. Autorize a Cloudflare a acessar sua conta GitHub e escolha o repositório `juntos-app`.
6. Em **Build settings**: deixe o comando de build em branco (é um site estático, não precisa) e
   em **Build output directory** digite `public` — é essa a configuração que faz só o conteúdo de
   `public/` ir para o site, sem a documentação interna. Clique em **Save and Deploy**.

> ⚠️ **Atenção com este jeito específico:** como a Cloudflare publica direto do que está no
> GitHub, e `public/firebase-config.js` está no `.gitignore` (passo 1.5), ele **não vai
> existir no repositório** — e sem ele o site não consegue nem iniciar o Firebase. Se for
> usar este jeito de publicar (GitHub automático), a solução mais simples é **não deixar
> esse arquivo de fora**: remova a linha `public/firebase-config.js` do `.gitignore` e
> garanta que o repositório está marcado **Private** no passo 2 acima (só você e quem
> convidar acessam o código) — a proteção real continua sendo a restrição da chave por
> domínio do passo 1.5, não o repositório estar público ou privado.

A partir daqui, sempre que você (ou eu, te passando os arquivos) atualizar algo no GitHub — direto
pelo site do GitHub, em **Add file → Upload files**, ou editando um arquivo existente clicando no
ícone de lápis — a Cloudflare Pages percebe a mudança e publica automaticamente em 1 a 2 minutos.
Você acompanha o progresso na aba **Deployments** do seu projeto.

> Dica: se no futuro você quiser editar direto com apoio de um assistente de código (em vez de colar
> arquivo por arquivo), o repositório no GitHub também é o que permite isso — é só avisar quando
> chegar nesse ponto. O **`GUIA-DO-CODIGO.md`** explica como isso funcionaria.

### Ideias de próximos passos
- Metas semanais/mensais de horas, com barra de progresso.
- Notificação quando alguém da sala bate uma meta.
- Histórico detalhado (lista de sessões, não só o total do dia).
- Exportar os dados em CSV.

---

## Novidades desta versão (2.0.0)

> **Passo obrigatório:** as regras do Firestore ganharam a coleção do diário de estudos. Cole de
> novo o `regras-firestore.txt` em Firebase → Firestore Database → Regras → Publicar.

### Adições
- **Diário de estudos** — ao concluir um ciclo de foco, aparece um campo opcional para anotar o que
  foi feito ("página 12 a 25", "15 exercícios"). Tudo fica listado na aba **Diário de estudos**,
  dentro de Estatísticas (alterna com "Resumo" no topo da tela).
- **Ranking semanal da sala** — a lista de membros da Sala já mostrava o total da semana; agora está
  rotulada como ranking e continua ordenada do maior para o menor.
- **Sessão coletiva (pomodoro sincronizado)** — quem criou a sala pode tocar em "Iniciar sessão
  coletiva": todos que entrarem seguem o mesmo relógio de foco e pausa, cada um contabilizando o
  próprio tempo normalmente.
- **Indicador de horário mais produtivo** — em Estatísticas, um gráfico mostra quanto você
  acumulou em cada período do dia (madrugada/manhã/tarde/noite) e uma sugestão do tipo "você rende
  mais à tarde, que tal começar agora?".
- **Anotar distração** — botão discreto no Cronômetro; abre um campo rápido, guarda a ideia numa
  lista "Para fazer depois" e o cronômetro nunca para.
- **Modo Leitura** — escurece quase toda a tela, deixando só um relógio bem discreto, pensado pra
  quem estuda por livro/apostila física. Toque em qualquer lugar pra sair.
- **Resumo da semana pra compartilhar** — botão "Gerar resumo da semana" em Estatísticas cria uma
  imagem (estilo card de rede social) com o total da semana, a matéria mais estudada e a streak.
  Dá pra baixar ou, em celulares com suporte, compartilhar direto.

### Melhorias de interface
- **Contraste automático no papel de parede** — o app mede o brilho médio da foto escolhida e troca
  sozinho entre texto claro/escuro para manter tudo legível, mesmo em fotos escuras.
- **Modo Compacto (mini player)** — no computador com Chrome/Edge, abre uma janelinha de verdade
  que fica por cima de qualquer outro programa; no celular, um cartão flutuante no canto da tela.
  Bom para deixar visível enquanto se lê um PDF ou assiste a uma aula ao lado.
- Transição suave do círculo de progresso, em vez de saltos a cada segundo.
- Botões com resposta visual instantânea ao tocar/passar o mouse.
- Ações como salvar perfil, matéria, mensagem e ajustes do ciclo agora atualizam a tela **na hora**,
  sem esperar a confirmação do servidor (e desfazem sozinhas se algo falhar).

### Otimizações (sem tirar nenhuma funcionalidade)
- **Código modularizado**: o antigo `app.js` único virou vários arquivos pequenos em `/js`
  (`auth.js`, `timer.js`, `stats.js`, `room.js`, `wallpaper.js`, etc.), cada um com uma
  responsabilidade — mais fácil de ler, testar e pedir ajustes específicos no futuro.
- **Carregamento sob demanda**: o gerador do resumo da semana (`wrapped.js`) e o modo compacto
  (`pip.js`) só são baixados quando a pessoa realmente usa esses botões, então o app abre mais leve.
- **Cache local do perfil**: nome, foto, cor, matérias e ajustes ficam salvos no aparelho e aparecem
  na tela imediatamente ao abrir o app — o Firestore só é consultado para atualizar o que mudou
  desde a última vez, em vez de esperar uma resposta completa toda hora.
- **Escritas agrupadas**: o controle de brilho do papel de parede só grava no banco depois que você
  solta o dedo (esperando alguns milissegundos de silêncio), em vez de gravar a cada pixel arrastado.

---

## Novidades desta versão (1.2.0)

> **Atenção — passo obrigatório nesta atualização:** as regras do Firestore mudaram (por causa das
> mensagens e do papel de parede privado). Abra o Firebase → Firestore Database → aba **Regras**,
> apague o conteúdo e cole de novo o arquivo `regras-firestore.txt` atualizado, e clique em
> **Publicar**. Sem isso, as mensagens não enviam e o papel de parede não sincroniza.

- **Abre direto, sem passar pelo login** — a sessão agora fica salva no aparelho e uma tela de
  abertura curta aparece enquanto o app confere quem está logado, em vez de mostrar a tela do Google
  por um instante. O login só reaparece se você tocar em "Sair da conta".
- **O cronômetro não para mais por nada** — ele passou a registrar o *instante* em que a fase
  começou, não um contador em memória. Se a tela apagar, se você trocar de app, fechar o navegador
  ou até reiniciar o celular, ao reabrir o app ele volta contando do ponto certo, e os ciclos que
  terminaram nesse meio-tempo são contabilizados retroativamente. Só o botão ■ encerra de verdade.
  Enquanto o app está aberto, ele também pede ao sistema para não apagar a tela sozinha.
- **Notificação com contagem regressiva ao vivo** — o service worker atualiza a notificação a cada
  segundo, acompanhando o app. O texto também traz o horário exato de término ("termina às 14:35"),
  que continua correto mesmo se o sistema reduzir a frequência de atualização para poupar bateria.
  Ao terminar, vibra e avisa.
- **Papel de parede próprio** — em Ajustes, escolha uma foto da sua galeria. A imagem é reduzida e
  comprimida automaticamente, fica salva na sua conta (e sincroniza entre seus aparelhos) e é
  **privada**: ninguém da sala consegue vê-la. Há também um controle para clarear o fundo e manter
  os textos legíveis.
- **Streak (dias seguidos)** — contador de dias consecutivos com estudo, mostrado no topo do app
  (🔥), no cartão das Estatísticas e ao lado do nome de cada pessoa na Sala. Se passar um dia inteiro
  sem estudar, volta a zero.
- **Mensagens na sala** — mural de conversa dentro da Sala, com mensagens para todos ou só para uma
  pessoa (botão "mensagem" ao lado do nome). Quem recebe vê um aviso no visor na hora, com vibração
  e som; se o app estiver minimizado, chega como notificação. Os atalhos rápidos ("Bora estudar!")
  são configuráveis em Ajustes.
- **Ver o que o amigo está estudando** — a Sala agora distingue três situações: *estudando agora*
  (com a matéria e há quanto tempo), *em pausa*, e *online no app*. Quem está estudando aparece no
  topo da lista, com o ponto colorido no avatar.

### Sobre "nunca parar" — o que é garantido e o que não é
A contagem do **tempo** é garantida em qualquer situação, porque é calculada pelo relógio do
aparelho: mesmo que o sistema congele ou feche o app, ao reabrir o tempo estará certo e os ciclos
perdidos entram na conta. O que o sistema operacional pode limitar é a **notificação** enquanto o
app está fechado: o número pode parar de atualizar a cada segundo se o celular entrar em economia
de bateria (mais comum no iPhone). Por isso a notificação sempre mostra também o horário de término,
e o aviso final com vibração é disparado de qualquer forma. Se o app for fechado à força (removido
da lista de recentes) a notificação some, mas o tempo continua correto ao reabrir.

---

## Novidades da versão 1.1.0

- **Quem está online** — cada pessoa "avisa" o app a cada ~25s enquanto o app está aberto e visível.
  Na Sala, um ponto verde aparece no avatar de quem esteve ativo nos últimos 90 segundos; sem o ponto,
  aparece "visto há X min/h". Isso não é uma presença instantânea como um app de chat (exigiria um
  serviço extra, o Realtime Database) — é uma aproximação por atividade recente, sem custo e sem
  configuração adicional.
- **Catálogo semanal nas Estatísticas** — abaixo do gráfico de 7 dias, uma lista de todas as semanas
  com estudo registrado, navegável por ano (setas `‹ ›`), com o total de cada semana e uma
  mini-barrinha mostrando a proporção entre matérias.
- **Som e vibração ao concluir** — tom ascendente ao terminar o foco, tom único ao terminar a pausa;
  pode ser desligado em Ajustes → Som e notificações.
- **Matérias** — cadastre matérias em Ajustes, escolha uma antes de começar a estudar (no
  Cronômetro), e cada uma ganha sua própria cor nas barras e no catálogo semanal.
- **Cronômetro de pausa no modo Livre** — o botão "☕ Fazer pausa" congela a contagem de estudo e
  passa a contar a pausa separadamente; "▶ Retomar estudo" volta a somar no total, sem contar o
  tempo da pausa. No modo Ciclos com pausas, a pausa já era cronometrada automaticamente.
- **Avisos em segundo plano** — ligue em Ajustes → "Avisar em segundo plano" (o navegador vai pedir
  permissão de notificação). Com isso ativado:
  - o app agenda, assim que um ciclo começa, uma notificação com vibração para o momento exato em
    que ele deve terminar — ela dispara mesmo com o app minimizado;
  - enquanto o cronômetro roda em segundo plano, a notificação é atualizada a cada ~45s mostrando
    quanto falta;
  - ao voltar para o app, o tempo é recalculado pelo relógio do aparelho, então ele nunca fica
    "atrasado" mesmo que o sistema operacional tenha pausado a aba por um tempo;
  - enquanto a tela está ligada e visível, o app pede ao navegador para não deixá-la apagar
    sozinha durante uma sessão (Wake Lock).

  **Limite real, sem enrolação:** nenhum app instalado como PWA consegue garantir execução contínua
  em segundo plano — isso é uma regra do sistema operacional (o iPhone é o mais rígido nisso), não
  uma falha deste app. Os três mecanismos acima cobrem bem o caso comum (minimizar, trocar de app,
  tela apagar), mas se o telefone for reiniciado ou o app for fechado à força (removido da lista de
  recentes), a contagem para de verdade, como aconteceria com qualquer cronômetro de navegador.
  No iPhone, as notificações em segundo plano só funcionam depois que o app foi adicionado à Tela de
  Início (Parte 3 deste guia) — abrir pelo Safari normal não recebe notificações.

---

## Perguntas comuns

**Isso vai me cobrar alguma coisa?**
Não. O plano Spark do Firebase é gratuito e não aceita cartão. Ele oferece 50 mil leituras e 20 mil escritas por dia — uma família estudando o dia inteiro usa uma fração mínima disso. Se o limite fosse atingido, o app simplesmente pararia de gravar até o dia seguinte; não há cobrança.

**Preciso mexer em código para mudar o app?**
Para mudar cores, textos e tempos padrão, sim, mas são edições simples no `index.html` e no `main.js`. Depois de editar, refaça o zip do conteúdo de `public/` e arraste de novo (Workers & Pages → seu projeto → aba **Deployments** → **Create deployment**).

**Meus dados ficam públicos?**
As regras liberam a leitura do perfil e do total de horas apenas para pessoas logadas no seu app — é o que permite ver quanto o outro estudou. Ninguém consegue alterar os dados de outra pessoa. Se quiser um bloqueio mais rígido (só quem está na mesma sala), me peça a versão avançada das regras.

**Quero publicar na Play Store / App Store.**
Dá para empacotar este mesmo PWA depois, sem reescrever nada. Só vale a pena quando o app já estiver estável e em uso.

---

## Publicar a atualização 2.9.0 (segurança e privacidade) — passo a passo

Faça nesta ordem. Os passos 1 a 3 são **manuais** (o deploy não os aplica sozinho).

1. **Regras primeiro.** Firebase → Firestore Database → aba **Regras** → apague tudo, cole o novo
   `regras-firestore.txt` → **Publicar**. (Se publicar o código antes, o app continua funcionando — ele
   cai de volta para o jeito antigo —, mas as proteções novas só valem depois das regras.)
2. **Restrinja a chave de API do Firebase.** Google Cloud Console → *APIs e serviços → Credenciais* →
   a chave do navegador do projeto `juntos-app-2420` → **Restrições de aplicativo: Sites (HTTP referrers)**
   → adicione só o seu domínio (`https://SEU-SITE.pages.dev/*`, mais o domínio próprio se houver) e
   `https://juntos-app-2420.firebaseapp.com/*`. Em **Restrições de API**, deixe só Identity Toolkit,
   Token Service e Cloud Firestore. A chave continua pública (é assim em todo app Firebase), mas deixa de
   servir em sites de terceiros.
3. **Ative o Firebase App Check** (Console → App Check → Web → reCAPTCHA Enterprise/v3) e, depois de
   uma semana sem erros no painel, mude o Firestore para **Aplicar (enforce)**. Isso reduz muito
   robôs tentando adivinhar códigos de sala. (Exige colocar o `site key` no código — não foi feito
   aqui porque depende de chaves da sua conta.)
4. Em Authentication → Configurações → **Domínios autorizados**, mantenha só os seus domínios.
5. Suba os arquivos (branch `dev` primeiro, como em `FLUXO-DE-TRABALHO.md`), **teste o login com o
   Google** (o `_headers` mudou) e depois faça o merge em `main`.
6. Preencha/confirme em `public/privacidade.html` e `public/termos.html` seu nome e e-mail (já estão
   com os dados que estavam no projeto) e peça a revisão de um advogado antes de divulgar para além
   de familiares — a Política cita a LGPD e o ECA Digital (Lei 15.211/2025).

**Mensagens diretas antigas:** as enviadas antes da 2.9.0 ficam na lista da sala e, no banco, podem ser
lidas por membros daquela sala (regra do Firestore não consegue filtrar por campo numa lista). As novas
são privadas. Para limpar as antigas, apague `rooms/{código}/messages` que tenham o campo `to` no
console do Firebase, ou peça a cada pessoa que as apague (🗑).

**Teste rápido depois de publicar (2 contas Google):**
- A cria sala, B entra pelo código → B vê o nome/horas de A; **B não vê** o despejo mental de A.
- A libera a done-list (Ta-da) para B → B vê as conquistas de A em Ta-da → Amigos e no perfil. A desliga → B deixa de ver.
- A libera a gratidão para B (liberação separada da done-list) → B lê as gratidões de A no perfil. Liberar uma não libera a outra.
- B manda mensagem "só para A" → C (terceira conta na sala) não vê.
- Ajustes → Baixar meus dados gera o JSON; Sair da conta volta ao login sem restos do papel de parede.
- Excluir minha conta (use uma conta de teste!) apaga tudo e some das salas.

---

## Custo zero em escala (2.25)

**Cotas diárias do Firestore (plano gratuito/Spark):** 50 mil leituras, 20 mil gravações, 20 mil exclusões, 1 GiB. Elas zeram por volta da meia-noite do Pacífico. Cada documento lido ou gravado conta 1, inclusive dentro de `writeBatch` (o lote só garante "tudo ou nada"). As regras que usam `get()` também contam leituras.

**Onde o app gasta:** (1) gravar o resumo ao concluir cada ciclo (poucas por pessoa/dia); (2) presença na sala: cada batimento é 1 gravação sua e 1 leitura para cada colega com o app aberto. Por isso a presença só roda com sala, a cada 60 s e com a aba visível. Conta aproximada: sala de 10 pessoas, 4 h de estudo cada ≈ 10×4×(60 batimentos/h)×9 colegas ≈ 21,6 mil leituras/dia só de presença — uma sala grande e muito ativa ainda pode encostar na cota. Acompanhe em Firebase → Firestore → Uso e crie **alerta de orçamento** no Google Cloud.

**Notificações:** por padrão o lembrete gentil roda no próprio aparelho e só dispara com o app aberto ou minimizado. **Para chegar com o app fechado, use o Worker gratuito em `worker-push/` (passo a passo em `worker-push/LEIA-ME.md`).** Por que precisa de servidor: um app totalmente fechado só é acordado por *push* vindo de um servidor (FCM/Web Push), o que exigiria: um servidor de envio (por exemplo um Cloudflare Worker agendado, que tem cota gratuita) ou Cloud Functions (plano Blaze, com cartão), guardar o token de cada aparelho (novo dado pessoal → atualizar Política e `CONSENT_VERSION`) e o passo da chave VAPID no console. Isso foi feito na 2.26 com Web Push direto (sem FCM nem cartão); é opcional.

**App Check (opcional, desligado):** barra tráfego que não vem do seu site. Cuidados: (1) a reCAPTCHA Enterprise é grátis só até 10 mil avaliações/mês e cobra acima disso; cada aparelho gera avaliações ao renovar o token, então no console (App Check → seu app → "Duração do token") use 7 dias; (2) acima da cota sem faturamento o site fica sem proteção e, com a imposição ligada, pode bloquear usuários — por isso acompanhe as métricas por alguns dias **antes** de clicar em "Impor"; (3) crie a chave reCAPTCHA Enterprise (tipo site, domínios do seu site), registre o app em Firebase → App Check, coloque `appCheckSiteKey: "..."` em `public/firebase-config.js` e aplique as duas mudanças de CSP descritas em `public/_headers`; (4) teste login e cronômetro. Para voltar atrás: apague a linha da chave.
