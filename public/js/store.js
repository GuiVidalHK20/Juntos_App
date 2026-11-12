// Estado compartilhado entre módulos. É um objeto simples (não um framework):
// cada módulo importa "store" e lê/grava direto nele. Como é a MESMA
// referência em todo lugar (ligação viva do ES module), qualquer módulo que
// mude um campo é visto por todos os outros na hora.
import { DEFAULT_CFG, DEFAULT_QUICK } from "./constants.js";

export const store = {
  me: null,           // usuário do Firebase Auth
  profile: null,       // documento users/{uid}
  cfg: { ...DEFAULT_CFG },
  subjects: [],
  quickMsgs: [...DEFAULT_QUICK],
  currentSubjectId: "geral",
  statsYear: new Date().getFullYear(),
};

// pequeno barramento de eventos para os módulos avisarem uns aos outros
// sem precisar se importar diretamente (evita dependência circular)
const bus = new EventTarget();
export function emit(name, detail) { bus.dispatchEvent(new CustomEvent(name, { detail })); }
export function on(name, fn) { bus.addEventListener(name, (e) => fn(e.detail)); }
