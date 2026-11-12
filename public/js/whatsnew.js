/* "Novidades": um resumo do CHANGELOG.md escrito pra quem USA o app, não pra quem
   programa — frases curtas, sem nome de arquivo/função/termo técnico. Mostra sozinho, na
   primeira vez que a pessoa abre uma versão nova, SÓ o resumo da versão mais recente (compara com a
   última vista, guardada neste aparelho). O histórico completo fica no botão de Ajustes → Sobre.
   Cada versão nova ganha uma entrada curta aqui à mão — de propósito NÃO é gerado
   automaticamente a partir do changelog.md, que é técnico demais pra esse fim. */
import { $, esc } from "./utils.js";
import { APP_VERSION } from "./constants.js";

const SEEN_KEY = "juntos.lastSeenVersion";

const RELEASES = [
  {
    version: "2.26.0", date: "novembro de 2026",
    items: [
      "🔔 Lembrete mesmo com o app fechado (opcional): em Ajustes → Som e notificações, quando o servidor de lembretes estiver ativo. É a sua escolha e dá para desligar a qualquer momento.",
      "🔒 A Política de Privacidade foi atualizada (versão 1.2) para explicar esse recurso: você verá o aceite uma vez.",
      "⚡ Cada ciclo de estudo agora grava menos dados no servidor, deixando o app mais leve e econômico.",
    ]
  },
  {
    version: "2.25.0", date: "novembro de 2026",
    items: [
      "🔔 Lembrete gentil para estudar: escolha até 3 horários e os dias da semana em Ajustes → Som e notificações. É um convite, sem cobrança, e não aparece se você já estudou hoje.",
      "🔕 Silenciar avisos com um toque (hoje ou 7 dias): vale para lembretes, mensagens e avisos da sala.",
      "◐ Alto contraste: fundo sólido e bordas bem marcadas, em Ajustes → Aparência. O app também segue a configuração do seu aparelho.",
      "⚡ Mais leve: o app grava menos dados para avisar que você está online (e só quando você está numa sala).",
    ]
  },
  {
    version: "2.24.0", date: "novembro de 2026",
    items: [
      "🎨 Estatísticas com visual novo: cartões de vidro coloridos, cada um com seu ícone, deixando o fundo aparecer por baixo. Mais limpo e minimalista.",
      "👆 Mais interativo: toque numa coluna dos últimos 7 dias ou num dia da constância para ver o tempo estudado ali, e as abas e cartões entram com uma animação suave.",
      "🧹 Removemos o gráfico de tendência. Todas as outras estatísticas continuam, só com o visual novo.",
    ]
  },
  {
    version: "2.23.0", date: "novembro de 2026",
    items: [
      "📸 Resumo do mês renovado: visual novo, com o mês em destaque, o tempo de estudo, dias ativos, média, sequência e um gráfico dos seus dias.",
      "🗓️ Agora você escolhe qualquer mês anterior para compartilhar — é só tocar no mês na faixa de cima. No começo do mês, ele já abre no mês que acabou de fechar.",
      "🎨 Três temas para a imagem: Noite, Aurora e Papel (o escolhido fica salvo).",
      "✨ Se você usa o Ta-da, as conquistas e gratidões do mês também entram no cartão. A imagem sai em JPEG, leve para enviar.",
    ]
  },
  {
    version: "2.22.1", date: "outubro de 2026",
    items: [
      "🧼 Corrigido o \"flash\" da tela anterior ao trocar de aba: a transição foi retirada e a troca voltou a ser limpa.",
      "🚀 Trocar de aba, abrir as Estatísticas e registrar conquistas ficou mais fluido (menos travadinhas), principalmente em aparelhos mais simples.",
      "🌿 No Histórico, as barras e o calendário agora aparecem com uma animação mais leve.",
    ]
  },
  {
    version: "2.22.0", date: "outubro de 2026",
    items: [
      "✨ Mais vida nos toques: ao marcar uma conquista o botão \"quica\" como uma mola, o emoji 🌱 cresce quando o peso sobe e a ⭐ gira ao entrar.",
      "🎞️ A lista da done-list agora desliza para o novo lugar quando algo entra ou sai, em vez de pular. No Histórico os números contam até o valor e as barras sobem.",
      "🔀 Ao trocar de aba, a tela antiga some suavemente enquanto a nova chega (se o aparelho aguentar; se ficar pesado, o app desliga o efeito sozinho).",
      "⚡ Mais leve: marcar uma conquista e adicionar registros ficou bem mais rápido, e o cronômetro gasta menos bateria. Tudo respeita \"Animações: Suave\" e \"reduzir movimento\".",
    ]
  },
  {
    version: "2.21.0", date: "outubro de 2026",
    items: [
      "📊 Novo no Ta-da: o Histórico. Veja o que você fez em qualquer semana, mês ou ano — inclusive de meses atrás. Nada se perde: tudo fica guardado na sua conta.",
      "🌱 As estatísticas mostram só o que você conquistou: quantas vitórias, dias com registro, estudo, gratidões, seus destaques ⭐ e as frases com que você fechou os dias. Sem cobrança, sem \"dias perdidos\".",
      "🔎 Toque em qualquer dia do calendário para rever tudo o que aconteceu nele.",
      "💾 O resumo de cada mês fica salvo automaticamente. Os registros que você já tinha entram sozinhos na primeira vez que abrir o Histórico.",
    ]
  },
  {
    version: "2.20.1", date: "outubro de 2026",
    items: [
      "⏱️ Corrigido: ao puxar a tela para atualizar (ou sair e voltar ao app), o cronômetro em andamento não se perde mais — ele continua de onde estava.",
      "🚀 O app abre mais rápido e já aparece na versão mais nova, sem mostrar a versão antiga quebrada. Não precisa mais puxar para atualizar.",
      "✨ Daqui para frente, ao abrir uma versão nova só aparece o resumo dela. As anteriores ficam em Ajustes → Novidades.",
    ]
  },
  {
    version: "2.20.0", date: "outubro de 2026",
    items: [
      "✨ A aba Planejar virou Ta-da: em vez do que você vai fazer, ela guarda o que você JÁ fez e que te tocou no dia — mesmo o mínimo.",
      "✍️ ☑️ ⭐ A done-list tem 3 estilos: Corrida (anote quando acontecer), Marcar (um toque, sem escrever) e Top 3 (no fim do dia, escolha o que mais pesou). O estudo do Cronômetro entra sozinho.",
      "🙏 Novo Diário de gratidão: pelo que você é grato e como isso afeta a sua vida. Escreva quando quiser — e o app também pergunta logo depois de você estudar uma matéria (dá para desligar em Ajustes → Experiência).",
      "👥 Veja os amigos: em Ajustes você libera, pessoa por pessoa, quem pode ver a sua done-list e quem pode ver a sua gratidão (são liberações separadas). Eles aparecem em Ta-da → Amigos e no perfil.",
      "🔒 As tarefas que você tinha no Planejar continuam guardadas na sua conta e podem ser baixadas em Ajustes → Baixar meus dados, mas deixam de ser exibidas e de ser compartilhadas.",
    ]
  },
  {
    version: "2.19.0", date: "outubro de 2026",
    items: [
      "🗑️ Novo em Ajustes → Remover ciclos: contou um ciclo de estudo por engano? Marque os que quiser tirar. Eles saem do Diário e o tempo é descontado dos gráficos, da sequência e dos recordes.",
      "💾 Antes de remover, o app baixa uma cópia do que vai sair, caso você mude de ideia.",
    ]
  },
  {
    version: "2.18.0", date: "outubro de 2026",
    items: [
      "🛠️ Corrigido: o botão \"Mais\" não cobre mais os botões do topo. Agora o ✕ para fechar fica dentro do cabeçalho.",
      "🧭 A tela de foco vale só no cronômetro e a barra de abas fica sempre visível. Nas outras abas, tudo aparece normalmente.",
      "🎯 Na tela de foco agora aparecem a tarefa atual, o cronômetro e o próximo passo.",
      "＋ Revisão, conquistas e sons ficam num único atalho pequeno, recolhido, em vez de três botões soltos por cima do conteúdo.",
      "📐 Visual: o seletor virou uma grade 2×2 e os modos Celular, Tablet e Computador ficaram mais bem alinhados.",
    ]
  },
  {
    version: "2.17.0", date: "outubro de 2026",
    items: [
      "🧠 Ao concluir um ciclo de 5 min ou mais, o app pede 1 a 3 perguntas para lembrar. Elas voltam em 📌 Revisão espaçada.",
      "⏳ Nova opção: ampulheta fluida. A água sobe no lugar dos números (desligada por padrão, em Ajustes → Experiência).",
      "🎯 Tela de foco minimalista (ligada por padrão): tarefa atual, cronômetro e próximo passo. Os menus ficam no botão \"⋯ Mais\".",
      "🌿 Sons da natureza para foco (chuva, vento, ruído rosa e castanho), gerados no aparelho, no botão no canto da tela.",
      "🌅 Conclusão suave: uma luz quente e um tom calmo no lugar do confete.",
      "📱 Escolha o visual em Ajustes → Experiência: Atual, Celular, Tablet ou Computador.",
    ]
  },
  {
    version: "2.16.0", date: "outubro de 2026",
    items: [
      "⚡ Mais rápido: o app abre mais depressa e rola com mais fluidez, sobretudo no celular.",
      "🧹 Mais limpo: a barra no topo do cronômetro ficou só com tema e cores. Tamanho do texto e animações continuam em Ajustes → Aparência.",
      "🌱 Em \"Sua constância\" saiu o gráfico de semanas; o calendário dos últimos 28 dias continua.",
    ]
  },
  {
    version: "2.15.0", date: "outubro de 2026",
    items: [
      "📴 Corrigido: o app agora abre e funciona sem internet, no celular e no computador. Abra uma vez com internet e instale o app (ou só use pelo navegador): depois disso ele abre mesmo offline.",
      "🔐 Mais segurança: sua sessão fica guardada de um jeito mais protegido no aparelho e as mensagens da sala usam uma cifragem mais forte.",
      "🗓️ Corrigido: a sua sequência de dias não se perde mais por causa de fuso ou horário de verão do aparelho.",
    ]
  },
  {
    version: "2.14.0", date: "outubro de 2026",
    items: [
      "🌙 Novo: barra de conforto na tela do cronômetro com modo escuro/claro, cores suaves, tamanho do texto (A− / A+) e botão para desligar as animações.",
      "🎨 Novo: paletas suaves (Bruma, Musgo, Areia e Lavanda) em Ajustes → Aparência, para cansar menos a vista.",
      "🌱 Novo: \"Sua constância\" em Estatísticas. Mostra em quantos dias você apareceu (mesmo por pouco), semana a semana, e celebra os recomeços.",
      "📝 Novo: depois de cada ciclo, um espaço opcional de reflexão (o que fez, o que aprendeu, gratidão). Dá para pular sem nenhum custo.",
      "🫧 Novo, desligado por padrão: pausas conscientes com respiração guiada. Ligue em Ajustes → Pausas conscientes.",
      "🔧 Corrigido: clicar nas opções de tema em Ajustes não mexe mais no modo do cronômetro.",
    ]
  },
  {
    version: "2.13.0", date: "outubro de 2026",
    items: [
      "🧭 Corrigido: o topo da tela (nome, 💡 e ⚙️) não se mistura mais com as abas Tarefas e Progresso ao rolar a página.",
      "⬆️ Novo: em Ajustes → Conta você pode importar um arquivo baixado em \"Baixar meus dados\". Antes de importar você vê um resumo e pode cancelar; nada que já existe é apagado nem repetido.",
      "📡 Sem internet? O app avisa, continua funcionando e confirma quando tudo foi enviado. Os ciclos feitos offline não travam mais o cronômetro.",
      "🔊 Mais acessível: leitores de tela agora anunciam o fim do cronômetro, mensagens novas, tarefas concluídas e lembretes. Dá para usar tudo pelo teclado.",
      "🍃 As animações respeitam o \"reduzir movimento\" do seu aparelho.",
      "💬 Textos mais acolhedores e frases revisadas, com mais vozes diversas. Pausas e recomeços fazem parte do caminho — sem culpa.",
      "🌍 O horário dos dias é calculado de forma mais confiável, esteja você onde estiver.",
    ]
  },
  {
    version: "2.12.0", date: "outubro de 2026",
    items: [
      "🎨 Letras bem mais fáceis de ler: no modo claro as cores ficaram fortes e vivas, no escuro ficaram brilhantes, e com foto de fundo os textos soltos ganharam uma placa de vidro atrás.",
      "🎬 App com cara de cinema: fundo colorido que se move devagar, telas que entram em cascata, números que contam até o valor e botões que reagem ao toque com ondas e confete.",
      "⏱ Com o cronômetro rodando, o anel respira e um brilho percorre o círculo. Ao terminar um foco, chove confete.",
      "🍃 Prefere algo mais calmo ou quer poupar bateria? Em Ajustes → Animações escolha \"Suave\".",
    ]
  },
  {
    version: "2.11.2", date: "outubro de 2026",
    items: [
      "💡 Frases saiu da barra de baixo: agora é o botão 💡 no topo, ao lado da engrenagem. Toque de novo para voltar.",
      "🌄 Com foto de fundo, os textos e botões ficam bem mais legíveis no modo claro e no escuro, e os botões principais ganharam um brilho que pulsa de leve.",
    ]
  },
  {
    version: "2.11.1", date: "outubro de 2026",
    items: [
      "🐞 Corrigido: no perfil de alguém da sala, as matérias já apagadas voltavam como \"Matéria removida\" nas estatísticas e no diário. Agora continuam com o nome certo.",
    ]
  },
  {
    version: "2.11.0", date: "outubro de 2026",
    items: [
      "📱 Menu de baixo renovado: botões maiores e mais fáceis de tocar, com o ícone em destaque na aba que você está.",
      "⚙️ Ajustes agora fica na engrenagem, no topo da tela. Toque nela para abrir e use \"Voltar\" para retornar de onde estava.",
      "🔔 Som e notificações ficam guardados num botão só: toque nele para ligar ou desligar tudo em um lugar.",
      "⏳ No perfil de quem está na sua sala, o gráfico dos 7 dias também mostra o tempo como \"2h e 20 min\".",
      "🎵 A aba Frases ganhou Músicas, Filmes e Livros — com mensagens de artistas como Drake, Emicida e Raul Seixas, falas de filmes famosos e trechos de obras brasileiras.",
    ]
  },
  {
    version: "2.10.0", date: "outubro de 2026",
    items: [
      "💡 Nova aba Frases: toda vez que você abrir, uma frase de uma pessoa real que fez história — cientistas, filósofos, escritores e líderes.",
      "🔀 Toque em \"Outra frase\" para ser surpreendido, ou escolha um tema: Estudo, Persistência, Coragem, Foco e hábito, Juntos. Elas só aparecem uma de cada vez!",
      "♥ Guarde as suas favoritas e compartilhe com quem estuda com você. Cada frase mostra de onde ela veio.",
    ]
  },
  {
    version: "2.9.0", date: "outubro de 2026",
    items: [
      "🔒 Mais privacidade: suas anotações de distração e seus planos agora ficam guardados numa área só sua. Só quem você liberar em Ajustes consegue ver o planejamento.",
      "✉️ Mensagem \"só para alguém\" agora é privada de verdade: só você e quem recebeu conseguem ler.",
      "⬇️ Em Ajustes → Conta, você pode baixar uma cópia dos seus dados ou excluir sua conta e tudo o que está nela.",
      "📄 Termos de Serviço e Política de Privacidade atualizados, com um aceite rápido na primeira vez que você abrir.",
      "🚪 Quem criou a sala agora pode remover participantes. Sair da conta também apaga do aparelho o que ficou guardado nele.",
      "🔑 Salas novas têm código maior (8 caracteres). As antigas continuam funcionando."
    ]
  },
  {
    version: "2.8.0", date: "outubro de 2026",
    items: [
      "🕐 Nova aba Horários em Estatísticas: veja em que horas do dia você mais estuda, com um gráfico colorido por matéria.",
      "⏱️ Toque numa hora para ver os horários exatos dos seus ciclos, ou navegue dia a dia para ver quando começou e terminou cada um.",
      "🔎 No Diário de estudos, escolha a matéria que quer ver e confira o horário de cada ciclo.",
      "⏳ O tempo agora aparece como \"1h e 20 min\", inclusive no gráfico dos últimos 7 dias.",
      "📱 As abas de Estatísticas se ajustam melhor a qualquer tamanho de tela.",
      "🌙 Estudou passando da meia-noite? Agora o tempo é dividido entre os dois dias. Em Ajustes → Corrigir histórico, você acerta também os ciclos antigos.",
    ]
  },
  {
    version: "2.7.0", date: "outubro de 2026",
    items: [
      "📝 A aba Planejar foi refeita do zero, no estilo dos apps de lista de tarefas: é só digitar o que precisa fazer e apertar Enter.",
      "👆 Botões maiores e mais fáceis de tocar. Matéria, dia, horário, prioridade e duração agora são escolhidos por toques, sem formulário comprido.",
      "📅 Uma faixa de dias no topo mostra a semana e quantas tarefas pendentes cada dia tem. O horário ficou opcional.",
      "✏️ Toque numa tarefa para editar, adicionar subtarefas, adiar ou excluir. Tarefas atrasadas aparecem em \"Hoje\", com um botão para movê-las de uma vez.",
      "📊 O planejamento saiu das Estatísticas e agora fica na aba Progresso, dentro do Planejar, com um gráfico dos últimos 7 dias.",
      "🔍 Em Estatísticas, toque numa semana do catálogo semanal para ver a análise dela: matérias estudadas, comparação com a semana anterior, dias, horários e anotações.",
      "🐞 Corrigido: a matéria escolhida na tarefa voltava para a primeira da lista quando você preenchia outro campo.",
    ]
  },
  {
    version: "2.6.0", date: "setembro de 2026",
    items: [
      "🔔 A notificação de pausa e do cronômetro agora aparece direitinho no celular — antes ela simplesmente não estava funcionando.",
      "📚 Matérias que você removeu continuam aparecendo com o nome certo nas estatísticas antigas, em vez de virar \"matéria removida\".",
      "👥 O perfil de quem está na sala agora mostra também quanto foi estudado no mês e no ano, além de hoje e da semana.",
      "📈 Novo gráfico de tendência dos últimos 30 dias em Estatísticas.",
      "🗓️ Catálogo semanal com visual novo, e o botão de resumo agora gera o resumo do mês, não só da semana.",
      "🏠 Já dá pra entrar em mais de uma sala e trocar entre elas sem sair de nenhuma.",
      "📝 Dá pra editar a anotação de um ciclo já salvo no Diário de estudos.",
      "✨ Esta tela aqui é nova: um resumo simples do que muda em cada atualização, sem economês.",
      "🔒 Atualização de segurança: documentos internos do projeto não ficam mais publicados no site.",
    ]
  },
  {
    version: "2.5.1", date: "setembro de 2026",
    items: [
      "⏸️ O cronômetro não emenda mais pausa e foco sozinho — ele espera você tocar em \"Continuar\".",
      "🔔 Som diferente avisando quando a pausa termina, mais fácil de perceber.",
    ]
  },
  {
    version: "2.5.0", date: "setembro de 2026",
    items: [
      "🗓️ Planejar ganhou visual novo: linha do tempo do dia, barra de progresso, prioridade, subtarefas e repetição automática de tarefas.",
      "📤 Dá pra exportar a semana planejada pra qualquer app de calendário.",
      "⏰ Aviso 10 minutos antes de um horário planejado.",
      "📊 O Cronômetro ganhou um cartão \"seu dia até agora\", com sequência de dias e comparação com a média.",
    ]
  },
];

function markSeen() { try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { /* localStorage indisponível: sem problema, só mostra de novo na próxima */ } }
function lastSeen() { try { return localStorage.getItem(SEEN_KEY); } catch { return APP_VERSION; } }

function renderList(onlyLatest = false) {
  const box = $("whatsnewBody");
  if (!box) return;
  const list = onlyLatest ? RELEASES.slice(0, 1) : RELEASES;
  box.innerHTML = list.map((r, i) => `
    <div class="whatsnewRelease">
      <p class="whatsnewVersion">Versão ${esc(r.version)} <span class="muted" style="font-weight:400">· ${esc(r.date)}</span>${i === 0 ? ' <span class="whatsnewNewTag">mais recente</span>' : ""}</p>
      <ul class="whatsnewList">${r.items.map((it) => `<li>${esc(it)}</li>`).join("")}</ul>
    </div>`).join("");
}

let panelEl = null;
function buildPanel() {
  const wrap = document.createElement("div");
  wrap.className = "modalWrap hide";
  wrap.id = "whatsnewWrap";
  wrap.innerHTML = `
    <div class="modalBox" style="max-width:440px;width:100%;max-height:86vh;overflow:auto;box-sizing:border-box;">
      <p class="modalTitle">✨ Novidades</p>
      <div id="whatsnewBody"></div>
      <div class="modalBtns"><button class="primary" data-act="close">Entendi</button></div>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => { wrap.classList.add("hide"); markSeen(); updateBadge(); };
  wrap.querySelector('[data-act="close"]').addEventListener("click", close);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  return wrap;
}

// onlyLatest: abertura automática após atualizar → só o resumo da versão nova.
// O botão em Ajustes chama sem argumento (o clique passa o evento, por isso o === true) → histórico completo.
export function openWhatsNew(onlyLatest = false) {
  if (!panelEl) panelEl = buildPanel();
  renderList(onlyLatest === true);
  panelEl.classList.remove("hide");
}

// bolinha discreta no botão de Ajustes → Sobre avisando que tem novidade não vista
function updateBadge() {
  $("settingsWhatsNewDot")?.classList.toggle("hide", lastSeen() === APP_VERSION);
}

// mostra sozinho, uma vez, quando a pessoa abre uma versão mais nova do app do que a
// última que ela viu essa tela. Na primeiríssima vez que o app roda neste aparelho
// (nunca viu nenhuma tela de novidades ainda) só grava a versão atual e não mostra nada
// — não faz sentido dar "boas-vindas com novidades" pra quem está conhecendo o app agora.
export function maybeAutoShowWhatsNew() {
  const seen = lastSeen();
  if (seen === null) { markSeen(); updateBadge(); return; }
  updateBadge();
  if (seen === APP_VERSION) return;
  setTimeout(() => openWhatsNew(true), 500); // pequeno atraso pra não brigar com a animação de entrada da tela
}

export function initWhatsNew() {
  $("openWhatsNew")?.addEventListener("click", openWhatsNew);
  updateBadge();
}
