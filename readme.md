# Juntos — um lugar para estudar

Progressive Web App para acompanhar tempo de estudo (pomodoro e cronômetro livre), com estatísticas
detalhadas e salas de estudo em grupo com amigos e família em tempo real.

**[Ver demo ao vivo →](https://SEU-SITE.pages.dev)** _(troque pelo seu link depois do deploy)_

---

## Funcionalidades

**Cronômetro**
- Modo pomodoro (ciclos de foco/pausa configuráveis) e modo livre (cronômetro aberto)
- Sobrevive a fechar o app, apagar a tela ou reiniciar o aparelho — o tempo é sempre recalculado
  pelo relógio do sistema, nunca por um contador em memória
- Notificação com contagem regressiva ao vivo em segundo plano, com vibração ao concluir
- Modo Leitura (tela escurecida, para quem estuda por material físico) e Mini Player
  (Picture-in-Picture nativo no desktop, cartão flutuante no mobile)
- Anotação rápida de distrações ("mental dump") sem interromper o ciclo

**Estatísticas**
- Totais por dia, semana, mês e ano, com detalhamento por matéria
- Indicador de horário mais produtivo (madrugada/manhã/tarde/noite)
- Catálogo semanal navegável por ano
- Streak de dias consecutivos estudando
- Diário de estudos: nota opcional do que foi feito em cada ciclo
- Resumo semanal exportável como imagem, para compartilhar

**Salas de estudo (social)**
- Criação de salas por código, com presença online em tempo real
- Ranking semanal e status ao vivo ("estudando agora", "em pausa", matéria atual)
- Sessão coletiva: pomodoro sincronizado entre todos os membros da sala
- Mensagens dentro da sala, com aviso instantâneo (e notificação, se minimizado)

**Personalização**
- Papel de parede próprio, com contraste de texto ajustado automaticamente ao brilho da imagem
- Matérias e cores personalizáveis

---

## Stack técnica

- **Vanilla JavaScript (ES Modules)** — sem framework, sem build step. `import`/`export` nativos do
  navegador, carregados diretamente como `<script type="module">`.
- **Firebase** — Authentication (Google), Firestore (banco de dados em tempo real).
- **Service Worker** próprio — cache offline, notificações em segundo plano.
- **Web APIs modernas** — Wake Lock, Web Share, Document Picture-in-Picture, Vibration, Canvas.
- **Hospedagem** — Cloudflare Pages (deploy contínuo a partir do GitHub).

Sem dependências de build (webpack/vite/etc.): qualquer editor de texto e um navegador bastam para
rodar o projeto localmente.

## Arquitetura

O código é dividido em módulos com responsabilidade única, conectados por um estado compartilhado
simples (sem Redux/Context — apenas um objeto JS importado por referência). Veja o detalhamento
completo, arquivo por arquivo, em **[`GUIA-DO-CODIGO.md`](./GUIA-DO-CODIGO.md)**.

Todo este código mora em `public/` (a pasta publicada como site — veja "por que public/" no
`LEIA-ME.md`):

```
index.html      → estrutura + design system (CSS)
main.js         → ponto de entrada, liga os módulos
js/store.js     → estado compartilhado entre módulos
js/constants.js → configuração e valores padrão
js/firebase.js  → inicialização do Firebase
js/auth.js      → login e sessão
js/timer.js     → motor do cronômetro
js/stats.js     → estatísticas e insights
js/room.js      → salas, presença, ranking, sessão coletiva
js/messages.js  → mensagens da sala
js/wallpaper.js → papel de parede + contraste automático
js/subjects.js  → matérias e mensagens rápidas
js/studylog.js  → diário de estudos
js/distractions.js → anotações rápidas de distração
js/ui.js        → abas e controles gerais
js/whatsnew.js  → painel "Novidades" (resumo do changelog em linguagem simples)
js/wrapped.js   → resumo do mês em imagem (carregado sob demanda)
js/pip.js       → mini player (carregado sob demanda)
sw.js           → service worker (cache + notificações)
```

## Rodando localmente

Não há passo de build. O app em si mora em `public/` — rode o servidor estático a partir de lá:

```bash
cd public

# com o Python já instalado na maioria dos sistemas
python3 -m http.server 8080

# ou, com Node instalado
npx serve .
```

Depois abra `http://localhost:8080`. Você vai precisar preencher `public/firebase-config.js` com as
chaves do seu próprio projeto Firebase — veja o passo a passo completo em **[`LEIA-ME.md`](./LEIA-ME.md)**.

## Deploy e fluxo de trabalho

Deploy contínuo via Cloudflare Pages a partir deste repositório (apontando para a pasta `public/`
como saída), com um branch de testes (`dev`) separado do
branch de produção (`main`) para validar mudanças antes de publicá-las. Detalhes em
**[`FLUXO-DE-TRABALHO.md`](./FLUXO-DE-TRABALHO.md)**.

## Histórico de versões

Ver [`CHANGELOG.md`](./CHANGELOG.md).

## Licença

[MIT](./LICENSE).
