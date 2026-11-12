/* Silêncio (2.25): "silenciar avisos com um clique". Só neste aparelho (localStorage), sem Firestore.
   Vale para os avisos que NÃO foram pedidos agora: lembrete de estudo, "fulano começou a estudar" e
   mensagens da sala. NÃO silencia o cronômetro que a própria pessoa iniciou (esse aviso ela pediu).
   Sem imports além das constantes, para qualquer módulo poder consultar sem criar dependência circular. */
import { QUIET_LS_KEY } from "./constants.js";

const read = () => { try { return Number(localStorage.getItem(QUIET_LS_KEY)) || 0; } catch { return 0; } };

export const quietUntil = () => { const t = read(); return t > Date.now() ? t : 0; };
export const isQuiet = () => quietUntil() > 0;

export function quietForToday() {          // até a meia-noite do relógio do aparelho
  const d = new Date(); d.setHours(24, 0, 0, 0);
  setQuiet(d.getTime());
}
export function quietForDays(n) { setQuiet(Date.now() + n * 24 * 3600 * 1000); }
export function quietOff() { setQuiet(0); }

function setQuiet(ms) {
  try { ms ? localStorage.setItem(QUIET_LS_KEY, String(ms)) : localStorage.removeItem(QUIET_LS_KEY); } catch {}
  document.dispatchEvent(new CustomEvent("juntos:quiet"));
}

export function quietLabel() {
  const t = quietUntil();
  if (!t) return "";
  const d = new Date(t);
  const sameDay = t - Date.now() < 24 * 3600 * 1000 && d.getHours() === 0 && d.getMinutes() === 0;
  return sameDay ? "Avisos silenciados até o fim de hoje."
    : `Avisos silenciados até ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}.`;
}
