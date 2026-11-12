# Resumo em linguagem simples (leia isto primeiro)

**O que guardamos:** seu nome e foto (vindos do Google), suas horas de estudo, matérias, tarefas, anotações e,
se você usar salas, mensagens (cifradas) e o que você liberar para a sala ver.

**Quem vê o quê:** suas anotações, tarefas e metas ficam em uma área privada; só você as lê. Quem está na sua sala
vê apenas o que é público na sala (nome, foto, tempo estudado, se está estudando agora). Seu diário e seu
planejamento só são vistos por quem você liberar, uma pessoa por vez, em Ajustes. Ninguém consegue "listar"
todos os usuários ou salas.

**As "chaves" no código são públicas?** Sim, e isso é normal: todo site com Firebase precisa delas para abrir.
Elas funcionam como o endereço do banco, não como senha. A proteção são (1) as regras do banco e (2) a restrição
da chave aos seus sites (um passo manual, descrito no cabeçalho de `public/firebase-config.js`).

**Seus dados são seus:** em Ajustes → Conta você pode baixar tudo, trazer de volta com "Importar dados" (nada é
apagado nem duplicado e você vê um resumo antes) e excluir sua conta e seus dados. Ao sair da conta, o aparelho é
limpo, inclusive o que ficou guardado para uso offline.

**Sem internet:** o app abre e funciona. O que você faz fica guardado no aparelho e é enviado quando a conexão
volta; o app avisa quando terminou de sincronizar.

**Limites honestos:** a cifragem das mensagens usa uma chave ligada ao código da sala. Ela protege contra leitura
casual do banco, mas não é "ponta a ponta": quem está na sala consegue ler. Nenhum sistema é 100% seguro; se algo
grave acontecer, avisamos as pessoas afetadas.

## Atualização 2.15.0 — o que mudou

| Tema | Situação | Passo seu (manual)? |
|---|---|---|
| Chave no `firebase-config.js` | Continua pública (inevitável). Passo a passo reescrito + `tools/verificar-restricao-chave.mjs` para testar se a restrição por site vale | **Sim:** restringir a chave no Google Cloud, domínios autorizados, alerta de orçamento |
| Regras do Firestore | Campos de `private/*` limitados, código de sala validado, `sync` validado, tipos no perfil, apagar mensagem só por membro | **Sim:** colar e publicar `regras-firestore.txt`; rodar o Simulador de regras |
| Criptografia | Já usava Web Crypto (sem algoritmo próprio). Formato `enc2:` com sal por sala, 600 mil iterações e AAD. Nada de lib externa (sem build + CSP). **Não é ponta a ponta:** quem tem o código da sala lê | Não |
| Fuso e sequência | Datas por aritmética de calendário; testado em 8 fusos de aparelho (Chile, Cuba, Nova Zelândia…) | Não |
| Sessão (XSS) | Token em IndexedDB (não localStorage); CSP sem script inline; sem HttpOnly possível sem servidor | Não |
| Offline | Causa provável corrigida (resposta redirecionada), cache completo, auth não trava | Abrir 1x com internet |

## Atualização 2.13.0 — o que mudou

| Tema | O que foi feito | Passo seu (manual)? |
|---|---|---|
| Chave do Firebase | Documentado o passo a passo; regras do banco ganharam validação dos ciclos do diário | **Sim:** restringir a chave no Google Cloud e republicar as regras no console |
| Dados portáteis | Novo "Importar dados" com validação, resumo e sem sobrescrever | Não |
| Fuso horário | Cálculo de dia/hora com `Intl`, igual em qualquer lugar do mundo | Não |
| Offline | Service worker guarda o código do Firebase; gravações não travam mais o cronômetro; aviso de sincronização | Não (ao publicar, o navegador atualiza o cache sozinho) |
| Acessibilidade | Leitores de tela, teclado, movimento reduzido, marcos semânticos | Não |
| Frases e textos | Revisão ética e de linguagem (critérios abaixo) | Não |

### Curadoria de frases (critérios)
Saíram: (1) linguagem capacitista ou depreciativa ("rasteje", "tolo/tolos"); (2) tom de culpa por tempo ou
produtividade ("tempo perdido", "enquanto a vida é adiada"), que pesa sobre quem tem TDAH ou rotina instável;
(3) apologia de violência ou "vencer inimigos"; (4) vozes com defesa ou prática documentada de escravidão,
colonialismo, racismo ou misoginia (Churchill, T. Roosevelt, F. Roosevelt, Aristóteles, Kant, Voltaire, Franklin,
Nietzsche, S. B. Anthony, Euclides da Cunha) e figuras de controvérsia pública recente (Jobs, Eminem).
Adaptadas para linguagem inclusiva (traduções livres): Freire, Bacon, Cajal, Einstein, Donne. Acrescentadas 9 vozes
diversas. **Limite:** é um julgamento humano e discutível; novas frases devem ter fonte conferida.

---

# Auditoria de segurança e privacidade — Juntos (versão auditada: 2.8.0 → corrigida na 2.9.0)

Duas leituras do mesmo código: (A) atacante tentando invadir; (B) advogado procurando motivo para processar.
Gravidade: 🔴 alta · 🟠 média · 🟡 baixa. "Manual" = depende de um passo seu fora do código (ver `LEIA-ME.md`).

## A. Visão do atacante

| # | Sev. | Falha | Como seria explorada | Correção |
|---|---|---|---|---|
| A1 | 🔴 | `sameRoom()` confiava em `roomCodes` do próprio perfil | Gravar em `users/eu` o código de uma sala alheia e ler o perfil de todos os membros (nome, horas, tarefas, anotações) | Regra confere na lista oficial `rooms/{c}.members` (`sharesMyActiveRoom`) |
| A2 | 🔴 | Perfil legível pela sala continha dados privados (despejo mental, tarefas, metas) | Qualquer membro lia o documento inteiro pelo SDK; "só você vê" era só visual; liberação de planejamento só no cliente | Subdocumentos `private/mind` e `private/planner` com regras próprias |
| A3 | 🔴 | `roomCode`/`roomCodes` no perfil público | Membro da sala A lia o código das outras salas do colega e entrava nelas | Movidos para `private/mind` |
| A4 | 🔴 | Injeção de HTML/CSS: cor, `estMin`, `id`, cor de matéria/categoria de outros usuários entravam crus em `style=""` e atributos | Membro mal-intencionado gravava `red"><a href=…>` no próprio perfil/mensagem e isso era renderizado na tela dos outros (a CSP barrava script, mas não conteúdo falso/phishing) | `safeColor/safeUrl/safeNum`, `esc()` em ids, aplicado em avatar, sala, planner e buscas |
| A5 | 🟠 | Remetente falsificável (`fromName`/`fromColor`/`fromPhoto` dentro da mensagem) | Enviar mensagem "como" outro membro | Identidade vem do perfil do `uid`; regra aceita só `from/text/ts` |
| A6 | 🟠 | Mensagens diretas legíveis por todo membro | Ler `rooms/{c}/messages` e filtrar `to` | Caixa de entrada por usuário (`inbox/{uid}/msgs`) |
| A7 | 🟠 | Qualquer membro escrevia qualquer campo da sala, inclusive `sync` | Iniciar/encerrar sessão coletiva dos outros; lixo no documento; sala sem limite | Só dono altera `sync`; `affectedKeys()`; máx. 30 membros; chaves validadas |
| A8 | 🟠 | Perfil sem validação | Nomes gigantes, cores/fotos maliciosas, estouro de tamanho | `validProfile()` nas regras |
| A9 | 🟠 | Código de sala com 6 caracteres de `Math.random()` | Adivinhação/força bruta (uma conta Google = um atacante) e previsibilidade | 8 caracteres via `crypto.getRandomValues`; App Check (manual) |
| A10 | 🟠 | Cache local sobrevivia ao logout (perfil, papel de parede, IndexedDB do Firestore) | Próxima pessoa no aparelho compartilhado via dados da anterior | `signOutAndWipe()` |
| A11 | 🟡 | Cifragem caía em texto puro sem avisar | Mensagem "🔒" saía legível | Recusa enviar |
| A12 | 🟡 | Faltavam HSTS, COOP, X-Frame-Options, `Cache-Control` do SW; `blob:` bloqueado | Downgrade, correção demorando a chegar, recurso quebrado | `_headers` revisado |
| A13 | 🟡 | SW cacheava respostas de erro; aceitava mensagens de qualquer cliente | Página de erro virava "versão offline" | Só GET/200/same-origin |
| A14 | 🟡 | Sala sem moderação (não dava para remover ninguém) | Pessoa abusiva permanecia | Dono remove participantes |

**Não é falha (por projeto):** `firebaseConfig` público — é assim em todo app Firebase; a defesa são as regras (+ restrição de chave, manual).
**Risco residual, ciente:** (1) a cifragem usa chave derivada do código da sala — protege contra leitura casual do banco, não contra membros nem contra quem administra o banco (agora descrito com honestidade nos documentos). Ponta a ponta de verdade exigiria chaves por pessoa. (2) `rooms/{código}` pode ser lido por quem souber o código (é como se entra). (3) `style-src 'unsafe-inline'` continua, por causa dos `style=""` do HTML. (4) mensagens diretas antigas (ver `LEIA-ME.md`). (5) `apis.google.com` no `script-src` é exigência do login com popup do Firebase.

## B. Visão do advogado

| # | Risco | Fundamento | Correção |
|---|---|---|---|
| B1 | Política prometia botões que não existiam (excluir conta, baixar dados) | LGPD art. 18 e 6º (transparência); publicidade enganosa (CDC art. 37) | Implementados (`privacy.js`, `exportData.js`) |
| B2 | Promessa "só você vê" falsa para despejo mental/planejamento | LGPD art. 6º (adequação, transparência), CDC | Dados realmente privados (A2) |
| B3 | Mensagem "só para fulano" com 🔒 não era privada | idem | Corrigido (A6) + texto do cadeado honesto |
| B4 | Sem registro de consentimento; "revogar o consentimento dado no primeiro acesso" não existia | LGPD art. 7º I, 8º §2º | Tela de aceite versionada com registro (`consent`) |
| B5 | Menores sem declaração de responsável; política inconsistente | LGPD art. 14; ECA Digital (Lei 15.211/2025) | Declaração de idade/autorização, texto de menores, remoção de participantes, canal de denúncia |
| B6 | Termos/Política sem link no app | LGPD art. 9º (acesso facilitado) | Links no login e em Ajustes |
| B7 | Faltavam base legal, operadores, transferência internacional, retenção, incidentes, encarregado | LGPD art. 7º, 9º, 33, 41, 48 | Política reescrita |
| B8 | Placeholders amarelos no documento publicado | Credibilidade/contestação | Removidos |
| B9 | Mensagens de usuário excluído continuavam na sala | LGPD art. 18 VI | Exclusão apaga mensagens e presença |
| B10 | "Sem garantia nenhuma" amplo demais para consumidores | CDC art. 51 (cláusula abusiva) | Limitação dentro do que a lei permite |

⚠️ Isto é uma análise técnica, não parecer jurídico. Peça a revisão de um(a) advogado(a) antes de abrir o app para o público (principalmente os itens B5 e B7).
