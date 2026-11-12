export const APP_VERSION = "2.26.0";
// versão dos Termos de Serviço e da Política de Privacidade que a pessoa aceitou (perfil.consent.v).
// Mude este valor quando os documentos mudarem de forma relevante: todo mundo verá o aceite de novo.
export const CONSENT_VERSION = "1.2";   // 1.2 (2.26): lembrete com o app fechado — endereço de push guardado no Worker da Cloudflare (opt-in)

export const AVATAR_COLORS = ["#D8AD4E", "#4FA79A", "#C87A63", "#7C8FD4", "#8FAE6B", "#A16BC8"];
// paleta curada de matérias/categorias — variada o bastante pra distinguir muitos itens sem
// virar um arco-íris na tela. Quem quiser uma cor fora daqui pode usar o seletor "outra cor"
// (input nativo de cor) ao lado dos círculos, em Ajustes → Matérias e nas categorias de tarefa.
export const SUBJECT_COLORS = [
  "#FF6A45", "#F4608C", "#E6408F", "#D64571",
  "#A16BC8", "#7C5CFA", "#6B7FD7", "#2B9CE0",
  "#3FB6D3", "#5CC8C1", "#0FB88A", "#4CAF6D",
  "#8FAE6B", "#E0A62B", "#D68A3B", "#C87A63",
  "#9C6B4F", "#8D93A6"
];
export const GERAL = { id: "geral", name: "Geral", color: "#9AA6B5" };
export const DEFAULT_CFG = { workMin: 25, breakMin: 5, longBreakMin: 20, cyclesBeforeLong: 4 };
export const DEFAULT_QUICK = ["Bora estudar! 📚", "Já terminei meu ciclo ✅", "Alguém estudando agora?", "Foco! 💪"];
export const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
// nomes por extenso (índice = Date.getDay()) — usado no cabeçalho do dia da aba Ta-da
export const WEEKDAYS_FULL = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
// 2.25 — presença com custo de cota menor: cada batimento é 1 gravação sua + 1 leitura para CADA pessoa da
// sala (o plano gratuito do Firestore tem 20 mil gravações e 50 mil leituras por dia). 60 s em vez de 25 s
// corta isso em ~58%; a janela de "online" (150 s) segue com folga de 2 batimentos.
export const ONLINE_WINDOW_MS = 150 * 1000;
export const HEARTBEAT_MS = 60 * 1000;

// fuso horário padrão do app: Brasília/São Paulo, sempre — não importa o fuso configurado no
// aparelho de quem está usando. É essa referência que decide o que é "hoje" e "amanhã" (no
// cronômetro, nas estatísticas e na aba Ta-da), pra ficar consistente entre pessoas da
// mesma sala mesmo que uma esteja viajando ou com o relógio do aparelho errado.
export const BR_TZ = "America/Sao_Paulo";

export const TIMER_LS_KEY = "juntos.timer.v1";
export const WALL_LS_KEY = "juntos.wallpaper.v1";
export const PROFILE_CACHE_KEY = "juntos.profileCache.v1";
// frases favoritas da aba "Frases" — só neste aparelho (conveniência; apagado ao sair da conta)
export const QUOTES_FAV_LS_KEY = "juntos.quotes.fav.v1";
// cache só de conveniência (pinta o tema certo já na primeira carga da
// página, antes do Firestore responder) — a fonte da verdade é o campo
// "theme" salvo no perfil, sincronizado entre aparelhos.
export const THEME_LS_KEY = "juntos.theme.v1";
// 2.25 — só neste aparelho (a permissão de notificação também é por aparelho); apagados ao sair da conta
export const REMINDERS_LS_KEY = "juntos.reminders.v1";
export const QUIET_LS_KEY = "juntos.quiet.v1";
export const HC_LS_KEY = "juntos.hc.v1";
export const PUSH_LS_KEY = "juntos.push.v1";   // {on, h, t}: lembrete com o app fechado ligado neste aparelho, impressão e hora da última sincronização

// períodos do dia usados no indicador de produtividade
export const PERIODS = [
  { id: "madrugada", label: "Madrugada", range: "0h–6h", from: 0, to: 6 },
  { id: "manha", label: "Manhã", range: "6h–12h", from: 6, to: 12 },
  { id: "tarde", label: "Tarde", range: "12h–18h", from: 12, to: 18 },
  { id: "noite", label: "Noite", range: "18h–24h", from: 18, to: 24 }
];
export function periodOfHour(hour) {
  return PERIODS.find((p) => hour >= p.from && hour < p.to) || PERIODS[0];
}
