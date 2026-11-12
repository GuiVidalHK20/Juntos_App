/* "Importar meus dados" — o caminho de VOLTA do "Baixar meus dados" (exportData.js).
   Seus dados são seus: quem pode levar uma cópia embora também precisa poder trazê-la de volta
   (para outro aparelho, outra conta Google ou depois de excluir a conta).

   Princípios (nada aqui é irreversível nem surpreendente):
   1) NÃO DESTRUTIVO. Nunca apaga nem sobrescreve nada que já existe na conta. Só entra o que ainda
      não existe: ciclos do diário com id novo, matérias/tarefas/categorias com id novo, totais de
      dias que ainda estão em branco. Importar o mesmo arquivo duas vezes não duplica nada.
   2) VOCÊ VÊ ANTES. Mostra um resumo do que vai entrar e do que será ignorado, e só segue se
      você confirmar.
   3) NUNCA importa o que é de segurança ou de outras pessoas: códigos de sala, quem pode ver seu
      diário/planejamento, aceite dos Termos, nome/foto (vêm da sua conta Google) e mensagens
      (pertencem às salas). Isso evita que um arquivo editado dê acesso a alguém sem você saber.
   4) DESCONFIA DO ARQUIVO. Valida formato, tamanho, tipos e limites de cada campo antes de gravar;
      o que não passa na validação é descartado e contado no resumo.
   Só lê o arquivo no navegador; nada é enviado a lugar nenhum além das gravações normais na sua conta. */
import { db, doc, getDoc, collection, getDocs, writeBatch, updateDoc, privateRef, PRIVATE_DOCS, Timestamp } from "./firebase.js";
import { store } from "./store.js";
import { toast, safeColor, fmtMin } from "./utils.js";
import { invalidateHistory } from "./studylog.js";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_SESSIONS = 20000;
const MAX_LIST = 5000;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHUNK = 400; // gravações por lote (limite do Firestore: 500)

/* ---------- validação ---------- */
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const str = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max) : "");
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null; };

/* Copia só dados "simples" (texto, número, sim/não, listas e objetos), com limite de profundidade
   e tamanho. Descarta funções, chaves esquisitas e listas dentro de listas (o Firestore não aceita). */
function clean(v, depth = 0) {
  if (v === null) return null;
  if (typeof v === "string") return str(v, 600);
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (depth >= 4) return undefined;
  if (Array.isArray(v)) {
    return v.slice(0, 200).map((x) => (Array.isArray(x) ? undefined : clean(x, depth + 1))).filter((x) => x !== undefined);
  }
  if (isObj(v)) {
    const out = {};
    for (const [k, x] of Object.entries(v).slice(0, 60)) {
      if (!/^[A-Za-z0-9_\-À-ÿ ]{1,60}$/.test(k) || k.startsWith("__")) continue;
      const c = clean(x, depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return undefined;
}

function cleanSession(r) {
  if (!isObj(r)) return null;
  const minutes = num(r.minutes, 0, 1440);
  if (!(minutes > 0) || !DATE_RE.test(String(r.date || ""))) return null;
  let when = r.ts ? new Date(r.ts) : null;
  if (!when || isNaN(when)) when = new Date(`${r.date}T15:00:00Z`); // sem horário: meio-dia de Brasília
  if (isNaN(when)) return null;
  const note = r.note == null ? null : str(r.note, 500) || null;
  return {
    date: r.date, minutes: Math.round(minutes * 10) / 10,
    subjectId: ID_RE.test(String(r.subjectId || "")) ? r.subjectId : "geral",
    subjectName: str(r.subjectName, 80) || "Matéria", subjectColor: safeColor(r.subjectColor),
    note,
    // split:true = "já foi tratado": os totais importados já vêm corretos do arquivo, então a correção
    // de meia-noite (fixmidnight.js) não deve mexer de novo nestes ciclos
    split: true, ts: Timestamp.fromDate(when)
  };
}

function cleanDay(v) {
  if (typeof v === "number") { const t = num(v, 0, 1440); return t > 0 ? { total: t, bySubject: { geral: t } } : null; }
  if (!isObj(v)) return null;
  const total = num(v.total, 0, 1440);
  if (!(total > 0)) return null;
  const bySubject = {};
  if (isObj(v.bySubject)) {
    for (const [sid, m] of Object.entries(v.bySubject).slice(0, 100)) {
      const n = num(m, 0, 1440);
      if (ID_RE.test(sid) && n > 0) bySubject[sid] = Math.round(n * 10) / 10;
    }
  }
  return { total: Math.round(total * 10) / 10, bySubject };
}

/* mescla listas de itens com "id": só entram os ids que ainda não existem */
function mergeById(current, incoming, label, report, extra = (x) => x) {
  const cur = Array.isArray(current) ? current : [];
  const have = new Set(cur.map((x) => x?.id));
  const add = [];
  let dropped = 0;
  for (const raw of (Array.isArray(incoming) ? incoming : []).slice(0, MAX_LIST)) {
    const it = clean(raw);
    if (!isObj(it) || !ID_RE.test(String(it.id || ""))) { dropped++; continue; }
    if (have.has(it.id)) continue;
    have.add(it.id);
    add.push(extra(it));
  }
  report[label] = { novos: add.length, descartados: dropped };
  return add.length ? [...cur, ...add] : null;
}

function mergeKeys(current, incoming, label, report, valid = () => true) {
  const cur = isObj(current) ? current : {};
  const add = {};
  if (isObj(incoming)) {
    for (const [k, v] of Object.entries(incoming).slice(0, 500)) {
      if (!ID_RE.test(k) || k in cur) continue;
      const c = clean(v);
      if (c !== undefined && valid(c)) add[k] = c;
    }
  }
  report[label] = { novos: Object.keys(add).length, descartados: 0 };
  return Object.keys(add).length ? { ...cur, ...add } : null;
}

async function readFullProfile(uid) {
  const main = await getDoc(doc(db, "users", uid));
  const out = main.exists() ? { ...main.data() } : {};
  for (const name of PRIVATE_DOCS) {
    const d = await getDoc(privateRef(uid, name));
    if (d.exists()) Object.assign(out, d.data());
  }
  return out;
}

/* ---------- plano: calcula o que entraria, sem gravar nada ---------- */
export async function planImport(data, uid) {
  if (!isObj(data) || !isObj(data.perfil) || !Array.isArray(data.sessoes)) {
    throw new Error("formato");
  }
  if (data.formato && data.formato !== "juntos-dados") throw new Error("formato");
  if (data.sessoes.length > MAX_SESSIONS) throw new Error("grande");

  const report = {};
  const cur = await readFullProfile(uid);
  const p = data.perfil;
  const profileWrites = {};

  // 1) ciclos do diário
  const existing = new Set();
  const snap = await getDocs(collection(db, "users", uid, "sessions"));
  snap.forEach((d) => existing.add(d.id));
  const sessions = [];
  let badSessions = 0, dupSessions = 0;
  for (const s of data.sessoes) {
    const id = String(s?.id || "");
    const c = cleanSession(s);
    if (!ID_RE.test(id) || !c) { badSessions++; continue; }
    if (existing.has(id)) { dupSessions++; continue; }
    existing.add(id);
    sessions.push({ id, data: c });
  }
  report.ciclos = { novos: sessions.length, jaExistem: dupSessions, descartados: badSessions };

  // 2) totais por dia: só dias que ainda não existem (somar duplicaria o que já está lá)
  const curDaily = isObj(cur.daily) ? cur.daily : {};
  let daysNew = 0, daysKept = 0, daysBad = 0;
  if (isObj(p.daily)) {
    for (const [k, v] of Object.entries(p.daily).slice(0, 4000)) {
      if (!DATE_RE.test(k)) { daysBad++; continue; }
      if (k in curDaily) { daysKept++; continue; }
      const day = cleanDay(v);
      if (!day) { daysBad++; continue; }
      profileWrites[`daily.${k}`] = day; daysNew++;
    }
  }
  report.dias = { novos: daysNew, jaExistem: daysKept, descartados: daysBad };

  // totais por período do dia: só se ainda estiver em branco
  if (isObj(p.periodTotals) && !Object.values(cur.periodTotals || {}).some((x) => x > 0)) {
    const pt = {};
    for (const k of ["madrugada", "manha", "tarde", "noite"]) { const n = num(p.periodTotals[k], 0, 1e7); if (n > 0) pt[k] = n; }
    if (Object.keys(pt).length) profileWrites.periodTotals = pt;
  }

  // 3) listas e mapas (mescla por id)
  const lists = [
    ["subjects", "matérias", (x) => ({ ...x, name: str(x.name, 60) || "Matéria", color: safeColor(x.color) })],
    ["taskCategories", "categorias de tarefa", (x) => ({ ...x, name: str(x.name, 60) || "Categoria", color: safeColor(x.color) })],
    ["plannedTasks", "tarefas planejadas", (x) => x],
    ["dayTemplates", "modelos de dia", (x) => x],
    ["distractions", "anotações de distração", (x) => x]
  ];
  for (const [key, label, fix] of lists) {
    const merged = mergeById(cur[key], p[key], label, report, fix);
    if (merged) profileWrites[key] = merged;
  }
  const mq = mergeKeys(cur.removedSubjects, p.removedSubjects, "matérias arquivadas", report, (v) => isObj(v) && typeof v.name === "string");
  if (mq) profileWrites.removedSubjects = mq;
  const mg = mergeKeys(cur.subjectGoals, p.subjectGoals, "metas por matéria", report);
  if (mg) profileWrites.subjectGoals = mg;
  const mr = mergeKeys(cur.reviewSchedule, p.reviewSchedule, "revisões agendadas", report);
  if (mr) profileWrites.reviewSchedule = mr;

  // mensagens rápidas: só textos novos (a interface limita a 60 caracteres)
  if (Array.isArray(p.quickMsgs)) {
    const have = new Set(Array.isArray(cur.quickMsgs) ? cur.quickMsgs : []);
    const add = p.quickMsgs.slice(0, 40).map((t) => str(t, 60).trim()).filter((t) => t && !have.has(t));
    if (add.length) profileWrites.quickMsgs = [...(Array.isArray(cur.quickMsgs) ? cur.quickMsgs : []), ...add].slice(0, 40);
    report["mensagens rápidas"] = { novos: add.length, descartados: 0 };
  }

  const total = sessions.length + Object.keys(profileWrites).length;
  return { sessions, profileWrites, report, total, ignoredMessages: Array.isArray(data.mensagensEnviadas) ? data.mensagensEnviadas.length : 0 };
}

function summaryText(plan, data) {
  const when = data.geradoEm ? new Date(data.geradoEm) : null;
  const lines = [];
  if (when && !isNaN(when)) lines.push(`Arquivo gerado em ${when.toLocaleString("pt-BR")}.`);
  lines.push("", "O que vai ENTRAR na sua conta:");
  const r = plan.report;
  lines.push(`• ${r.ciclos.novos} ciclo(s) do diário de estudos`);
  lines.push(`• ${r.dias.novos} dia(s) de totais que ainda estavam em branco`);
  for (const [k, v] of Object.entries(r)) {
    if (["ciclos", "dias"].includes(k) || !v.novos) continue;
    lines.push(`• ${v.novos} em ${k}`);
  }
  lines.push("", "O que será IGNORADO (para não duplicar nem mexer no que já existe):");
  lines.push(`• ${r.ciclos.jaExistem} ciclo(s) e ${r.dias.jaExistem} dia(s) que você já tem`);
  const bad = r.ciclos.descartados + r.dias.descartados;
  if (bad) lines.push(`• ${bad} item(ns) com formato inválido`);
  lines.push("• Códigos de sala, quem pode ver seu diário, aceite dos Termos, nome/foto e mensagens: por segurança, nunca são importados");
  lines.push("", "Nada será apagado nem sobrescrito. Continuar?");
  return lines.join("\n");
}

/* ---------- gravação ---------- */
async function applyImport(plan, uid) {
  // 1) ciclos do diário (lotes atômicos). Se parar no meio, é só importar de novo: o que já entrou é ignorado.
  for (let i = 0; i < plan.sessions.length; i += CHUNK) {
    const batch = writeBatch(db);
    plan.sessions.slice(i, i + CHUNK).forEach(({ id, data }) => batch.set(doc(db, "users", uid, "sessions", id), data));
    await batch.commit();
  }
  // 2) perfil: updateDoc() de firebase.js separa sozinho os campos privados (planejador, metas…)
  const entries = Object.entries(plan.profileWrites);
  for (let i = 0; i < entries.length; i += 150) {
    await updateDoc(doc(db, "users", uid), Object.fromEntries(entries.slice(i, i + 150)));
  }
}

export async function importMyData(file) {
  if (!store.me || !file) return;
  const uid = store.me.uid;
  // as gravações são em lote e só terminam quando o servidor confirma: sem internet ficariam "penduradas"
  if (navigator.onLine === false) { toast("Sem internet agora. Conecte-se e tente de novo — nada foi alterado."); return; }
  if (file.size > MAX_BYTES) { toast("Esse arquivo é grande demais para ser um arquivo do Juntos."); return; }

  let data;
  try { data = JSON.parse(await file.text()); }
  catch { toast("Não consegui ler o arquivo. Ele precisa ser o .json baixado em \"Baixar meus dados\"."); return; }

  toast("Conferindo o arquivo…");
  let plan;
  try { plan = await planImport(data, uid); }
  catch (e) {
    toast(e?.message === "grande" ? "Esse arquivo tem registros demais para importar de uma vez."
      : e?.message === "formato" ? "Esse arquivo não parece ser um arquivo de dados do Juntos."
      : "Não consegui conferir o arquivo agora. Tente de novo.");
    return;
  }
  if (plan.total === 0) { toast("Nada novo para importar: tudo o que está no arquivo já existe na sua conta."); return; }

  if (!confirm(summaryText(plan, data))) { toast("Importação cancelada. Nada foi alterado."); return; }

  toast("Importando…");
  try { await applyImport(plan, uid); }
  catch {
    toast("A importação parou no meio. Escolha o mesmo arquivo de novo: o que já entrou não é repetido.");
    return;
  }
  invalidateHistory();
  const min = plan.sessions.reduce((a, s) => a + s.data.minutes, 0);
  toast(`Pronto: ${plan.sessions.length} ciclo(s) (${fmtMin(min)}) e ${Object.keys(plan.profileWrites).length} grupo(s) de dados importados.`);
}
