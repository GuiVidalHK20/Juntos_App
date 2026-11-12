# Teste e medição em navegador de verdade

Roda o app num Chromium (sem rede: o Firebase é trocado por um falso, em memória) e faz duas coisas:

- `e2e.mjs` — bateria funcional: cronômetro, trocar de abas (com e sem View Transition), Done-list (Marcar, Corrida, Top 3, dias),
  Histórico (semana/mês/ano), modo Suave. Sai com código 1 se algo falhar.
- `novos.mjs` — bateria da 2.25 (lembrete gentil, silêncio, alto contraste, presença com menos gravações, push com o app fechado). O Worker tem o próprio teste: `node worker-push/test.mjs`.
- `pace.mjs` — mede a fluidez (tempo entre quadros) em cada interação; `prof.mjs` — perfil do que mais gasta tempo.
- `bench.mjs` — mede o custo de trocar de aba, marcar 24 vezes, adicionar 15 registros e deixar o cronômetro rodando 6 s,
  com a CPU 4x mais lenta (parecido com um celular de entrada): layouts, recálculos de estilo, tempo de tarefa e nós criados.

## Como usar
```
cd tools/teste-navegador
npm init -y && npm i @sparticuz/chromium puppeteer-core
node e2e.mjs   ../../public
node bench.mjs ../../public NOVO
```
Para comparar com uma versão antiga, extraia o zip antigo e passe a pasta `public` dele no lugar de `../../public`.

Observação: o Chromium de teste desenha por software (sem GPU), então números de animação e de View Transition
são mais lentos que num celular de verdade. Compare sempre ANTES × DEPOIS na mesma máquina.
`seed.mjs` cria ~70 dias de dados de exemplo; `fakefb.js` é o Firestore falso (só para teste; nunca vai para o app).
