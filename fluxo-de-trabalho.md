# Fluxo de trabalho: testar antes de lançar

Hoje, qualquer arquivo que sobe pro branch `main` no GitHub vai direto para o site que sua família
usa. Este guia configura um segundo endereço — só seu, para testes — antes disso.

## A ideia

```
branch "dev"   →  site de teste (só você acessa o link)   →  você mexe e experimenta aqui
      │
      │  quando estiver satisfeito, "Pull Request" → "Merge"
      ▼
branch "main"  →  site de verdade (sua família usa)         →  só recebe o que já foi testado
```

## Passo 1 — criar o branch de testes

No site do GitHub, dentro do repositório:
1. Clique no seletor de branch (onde está escrito "main", perto dos arquivos).
2. Digite `dev` na caixa e clique em **Create branch: dev from main**.

Pronto — agora existem duas cópias paralelas do código. Editar uma não afeta a outra até você
decidir juntar (merge) as duas.

## Passo 2 — as prévias automáticas da Cloudflare Pages

Diferente do Netlify, a Cloudflare Pages já publica uma prévia de **qualquer branch**
automaticamente, sem precisar ativar nada — só funciona se você publicou pelo jeito
"Connect to Git" do `LEIA-ME.md` (não vale pro jeito de arrastar o zip manualmente).

A cada push no branch `dev`, a Cloudflare gera um site separado, com um endereço tipo
`373f31e2.juntos-familia.pages.dev` (um código aleatório na frente do seu domínio — não
é previsível, muda a cada branch). Pra achar o link: **Workers & Pages → seu projeto →
aba Deployments** → procure o deploy do branch `dev` e clique nele.
O endereço principal (`juntos-familia.pages.dev`) continua mostrando só o que está em `main`.

## Passo 3 — o dia a dia

**Se você estiver usando o site do GitHub (upload manual):**
1. No seletor de branch, troque para `dev` antes de subir os arquivos atualizados.
2. Espere 1–2 minutos, ache o link da prévia em **Workers & Pages → seu projeto →
   Deployments** (veja o Passo 2 acima) e confira se está tudo certo.
3. Satisfeito? No GitHub, clique em **Pull requests → New pull request**, base `main` ← compare
   `dev`, depois **Create pull request** e **Merge pull request**. Isso copia as mudanças
   testadas para `main`, e o site de verdade atualiza sozinho em seguida.

**Se você estiver usando o Claude Code** (veja `CLAUDE.md`): peça para ele trabalhar no branch
`dev`, testar, e só abrir o Pull Request para `main` quando você confirmar que está tudo certo.
Isso já é o comportamento esperado descrito lá.

## Passo 4 — lançando uma versão "oficial"

Quando um conjunto de mudanças em `dev` for para `main` e você quiser marcar isso como uma versão
de verdade (útil pro currículo — mostra organização e disciplina de release):

1. Confirme que `js/constants.js` → `APP_VERSION` foi atualizado (ex: `"2.1.0"`).
2. Mova a seção **[Não lançado]** do `CHANGELOG.md` para uma seção nova com o número da versão e a
   data de hoje, ex: `## [2.1.0] — 2026-10-02`.
3. No GitHub, vá em **Releases → Draft a new release**. Em "Choose a tag", digite `v2.1.0` e
   escolha **Create new tag on publish**. Cole no corpo da release o texto que você acabou de
   colocar no CHANGELOG. Clique em **Publish release**.

Isso cria uma "foto" permanente e rotulada daquele ponto do código — dá pra sempre voltar a ela, e
no seu perfil do GitHub aparece como um lançamento de verdade, com data e descrição, exatamente o
tipo de organização que passa profissionalismo num currículo.

## Quando algo dá errado em produção

Se um merge para `main` quebrar alguma coisa:
- **Rápido (site no ar):** no painel da Cloudflare, **Workers & Pages → seu projeto →
  Deployments**, ache um deploy anterior (antes do problema), abra o menu **⋯** e escolha
  **Rollback to this deployment**. O site volta ao normal na hora.
- **No código:** no GitHub, abra o commit problemático, clique em **Revert** — isso cria um novo
  commit que desfaz exatamente aquela mudança, sem apagar o histórico (importante: reverter,
  não apagar — manter o registro de que aconteceu é parte de um histórico profissional honesto).

## Resumo do que cada arquivo deste projeto documenta

| Pergunta | Onde está a resposta |
|---|---|
| "Como configuro o Firebase/Cloudflare Pages do zero?" | `LEIA-ME.md` |
| "O que cada arquivo de código faz?" | `GUIA-DO-CODIGO.md` |
| "Como testo antes de publicar de verdade?" | Este arquivo |
| "O que já mudou em cada versão?" | `CHANGELOG.md` |
| "Contexto para o Claude Code" | `CLAUDE.md` |
