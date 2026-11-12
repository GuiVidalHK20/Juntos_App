/* Corrige o histórico de ciclos que atravessaram a meia-noite.
   Antes, logMinutes() somava o ciclo INTEIRO no dia em que ele terminou (um estudo de 22h à 1h
   caía todo no dia seguinte). Agora a gravação já divide em 00:00; este módulo ajusta os ciclos
   gravados antes disso.

   Fuso horário (2.15): o "dia anterior" agora é calculado por aritmética de calendário sobre a chave
   "AAAA-MM-DD" (shiftDateKey em utils.js), sem `new Date()` no relógio do aparelho — então a correção dá o
   MESMO resultado em qualquer fuso e em qualquer horário de verão, e não há como uma viagem ou troca de
   fuso do aparelho deslocar um minuto para o dia errado nem quebrar a sequência (streak).
   Segurança dos dados (2.15): antes de gravar, baixa automaticamente uma cópia do que vai mudar (ciclos
   afetados + totais dos dias envolvidos), para dar para desfazer à mão se algo surpreender.

   Fuso horário (2.13): a decisão "este ciclo passou da meia-noite?" usa splitAtMidnight() de
   utils.js, que agora pergunta o dia/hora direto ao Intl (formatToParts) no fuso de referência do
   app — em vez de montar e reler texto de data à mão, o que errava em alguns navegadores e em
   dias de horário de verão. O resultado é o mesmo em qualquer aparelho, em qualquer lugar do mundo.

   Segurança:
   - só mexe em ciclos sem a marca `split` e cuja data bate com o dia em que o total foi creditado;
   - usa increment() (move minutos de um dia para o outro) — nunca sobrescreve o total do dia;
   - cada lote é atômico (writeBatch): os totais e a marca `split` dos ciclos mudam juntos, então
     rodar de novo (ou depois de uma falha no meio) não aplica a correção duas vezes. */
import { db, doc, collection, query, orderBy, getDocs, increment, writeBatch } from "./firebase.js";
import { store } from "./store.js";
import { fmtMin, splitAtMidnight, toast, downloadFile, todayKey } from "./utils.js";
import { invalidateHistory } from "./studylog.js";

const CHUNK = 200; // ciclos por lote (limite do Firestore: 500 operações)
const r1 = (n) => Math.round(n * 10) / 10;

export async function fixMidnightHistory() {
  if (!store.me) return;
  // esta correção grava vários documentos de uma vez (lote atômico) e só termina quando o servidor
  // confirma — sem internet ela ficaria "pendurada". Melhor avisar antes do que deixar a pessoa esperando.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    toast("Sem internet agora. Conecte-se e tente de novo — nada foi alterado.");
    return;
  }
  const uid = store.me.uid;
  toast("Procurando ciclos antigos…");
  let snap;
  try { snap = await getDocs(query(collection(db, "users", uid, "sessions"), orderBy("ts", "asc"))); }
  catch { toast("Não consegui ler o histórico. Tente de novo."); return; }

  const daily = store.profile?.daily || {};
  const todo = [];
  snap.forEach((d) => {
    const r = d.data();
    if (r.split || !r.ts?.toDate || !(r.minutes > 0)) return;
    const cut = splitAtMidnight(r.ts.toDate(), r.minutes);
    if (!cut) return;
    if (r.date && r.date !== cut.endKey) return;                                    // data não bate: não mexe
    if (typeof daily[cut.prevKey] === "number" || typeof daily[cut.endKey] === "number") return; // formato antigo do daily
    todo.push({ id: d.id, sid: r.subjectId || "geral", cut });
  });

  if (!todo.length) { toast("Nenhum ciclo antigo precisa de correção."); return; }
  const moved = r1(todo.reduce((a, t) => a + t.cut.prevMin, 0));
  const ok = confirm(
    `Encontrei ${todo.length} ciclo${todo.length > 1 ? "s" : ""} que ${todo.length > 1 ? "passaram" : "passou"} da meia-noite.\n\n` +
    `Vou mover ${fmtMin(moved)} para o dia anterior nos seus totais (gráfico de 7 dias, sequência, recordes).\n\n` +
    `Isso altera seus dados. Vou baixar uma cópia do que será mudado antes de começar. Continuar?`);
  if (!ok) return;

  // cópia de segurança (arquivo .json) do que está prestes a mudar
  try {
    const dias = new Set(todo.flatMap((t) => [t.cut.prevKey, t.cut.endKey]));
    downloadFile(`juntos-copia-antes-da-correcao-${todayKey()}.json`, JSON.stringify({
      geradoEm: new Date().toISOString(),
      ciclosAfetados: todo.map((t) => ({ id: t.id, materia: t.sid, ...t.cut })),
      totaisDosDiasAntes: Object.fromEntries([...dias].map((k) => [k, daily[k] ?? null]))
    }, null, 2), "application/json");
  } catch { /* a cópia é uma cortesia: se o navegador bloquear o download, a correção segue (continua atômica) */ }

  try {
    for (let i = 0; i < todo.length; i += CHUNK) {
      const chunk = todo.slice(i, i + CHUNK);
      const sums = {};
      const add = (k, v) => { sums[k] = (sums[k] || 0) + v; };
      chunk.forEach(({ sid, cut }) => {
        add(`daily.${cut.endKey}.total`, -cut.prevMin);
        add(`daily.${cut.endKey}.bySubject.${sid}`, -cut.prevMin);
        add(`daily.${cut.prevKey}.total`, cut.prevMin);
        add(`daily.${cut.prevKey}.bySubject.${sid}`, cut.prevMin);
      });
      const batch = writeBatch(db);
      batch.update(doc(db, "users", uid), Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, increment(r1(v))])));
      chunk.forEach(({ id }) => batch.update(doc(db, "users", uid, "sessions", id), { split: true }));
      await Promise.race([batch.commit(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 45000))]);
    }
  } catch {
    // o lote é atômico e leva a marca `split`: se ele chegar ao servidor depois, vale uma vez só; ao tocar de
    // novo, os ciclos já marcados são ignorados e nada é aplicado em dobro
    toast("A correção demorou ou parou. Nada é aplicado em dobro: toque de novo quando a internet estiver estável.");
    return;
  }
  invalidateHistory();
  const done = `Pronto: ${todo.length} ciclo${todo.length > 1 ? "s" : ""} corrigido${todo.length > 1 ? "s" : ""}.`;
  toast(done);
}
