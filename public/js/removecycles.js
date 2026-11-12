/* Remover ciclos contados por engano (Ajustes → "Remover ciclos").
   Cada ciclo concluído existe em TRÊS lugares (ver logMinutes() em timer.js e recordCompletedWork() em studylog.js):
     1) users/{uid}/sessions/{id}      → o registro do Diário de estudos
     2) users/{uid}.daily.AAAA-MM-DD   → total do dia e total por matéria (gráficos, sequência, recordes)
     3) users/{uid}.periodTotals       → minutos por período do dia (madrugada/manhã/tarde/noite)
   Para o ciclo "deixar de existir" de verdade, este módulo desfaz os três de uma vez, num lote atômico
   (writeBatch): ou tudo muda junto, ou nada muda.

   Segurança dos dados:
   - os totais são DESCONTADOS com increment() negativo (nunca sobrescritos), então um ciclo que o
     cronômetro gravar no mesmo instante não se perde;
   - nunca desconta mais do que o total que existe (não deixa dia negativo); quando um dia/matéria chega a
     zero, a entrada é apagada (senão contaria como "matéria estudada" nas conquistas);
   - um ciclo que atravessou a meia-noite é devolvido aos DOIS dias, do mesmo jeito que foi dividido ao gravar
     (splitAtMidnight, o mesmo cálculo de fixmidnight.js);
   - antes de remover, baixa uma cópia (.json) do que vai sair, para dar para restaurar com "Importar dados";
   - sem internet: o lote fica na fila do Firestore e é aplicado na volta (a tela não fica travada). Os ciclos
     já enviados somem da lista na hora e não podem ser enviados duas vezes.
   Não mexe: lembretes de revisão espaçada, perguntas (flashcards), conquistas já abertas. */
import { db, doc, collection, query, orderBy, limit, getDocs, increment, deleteField, writeBatch } from "./firebase.js";
import { store } from "./store.js";
import { esc, fmtMin, fmtHM, sessionSpan, sessionSubject, splitAtMidnight, zonedParts, normDay, downloadFile, todayKey, toast } from "./utils.js";
import { invalidateHistory } from "./studylog.js";

const PAGE = 100;     // quantos ciclos mostrar por vez
const MAX = 500;      // teto de ciclos carregados (o lote do Firestore aceita 500 operações)
const EPS = 0.05;     // abaixo disso, o total é considerado zerado
const r1 = (n) => Math.round(n * 10) / 10;

let overlay = null;   // a janela aberta (só uma por vez)
let rows = [];        // ciclos carregados
let shown = PAGE;     // quantos buscar (cresce com "Mostrar mais")
let filter = "all";   // "all" ou id de matéria
let busy = false;
const selected = new Set();
const pending = new Set(); // ids já enviados para remoção (ainda não confirmados): ficam fora da lista

// mesmas faixas de periodIdOfNow() em timer.js — o período é o do instante em que o ciclo terminou
function periodOf(date) {
  const h = zonedParts(date).hour;
  return h < 6 ? "madrugada" : h < 12 ? "manha" : h < 18 ? "tarde" : "noite";
}

// em quais dias, e quantos minutos em cada um, este ciclo foi creditado nos totais
function daysOf(r) {
  const minutes = Number(r.minutes) || 0;
  const end = r.ts?.toDate ? r.ts.toDate() : null;
  if (r.split && end) {
    const cut = splitAtMidnight(end, minutes);
    if (cut && (!r.date || r.date === cut.endKey)) return [[cut.prevKey, cut.prevMin], [cut.endKey, cut.endMin]];
  }
  return r.date ? [[r.date, minutes]] : [];
}

/* Monta as alterações do documento do perfil para desfazer os ciclos escolhidos. */
function buildProfileUpdate(list) {
  const daily = store.profile?.daily || {};
  const periods = store.profile?.periodTotals || {};
  const perDay = {};     // dia → { total, subj: { matéria → minutos } }
  const perPeriod = {};  // período → minutos
  list.forEach((r) => {
    const sid = r.subjectId || "geral";
    daysOf(r).forEach(([k, m]) => {
      const d = perDay[k] || (perDay[k] = { total: 0, subj: {} });
      d.total += m; d.subj[sid] = (d.subj[sid] || 0) + m;
    });
    if (r.ts?.toDate) { const p = periodOf(r.ts.toDate()); perPeriod[p] = (perPeriod[p] || 0) + (Number(r.minutes) || 0); }
  });

  const upd = {};
  Object.entries(perDay).forEach(([k, d]) => {
    if (daily[k] == null) return; // o dia não tem total nenhum: não há o que descontar
    const cur = normDay(daily[k]);
    const newTotal = r1(cur.total - d.total);
    if (newTotal <= EPS) { upd[`daily.${k}`] = deleteField(); return; }
    if (typeof daily[k] === "number") { // formato muito antigo (só um número): reescreve já no formato atual
      upd[`daily.${k}`] = { total: newTotal, bySubject: { geral: newTotal } };
      return;
    }
    upd[`daily.${k}.total`] = increment(-r1(Math.min(d.total, cur.total)));
    Object.entries(d.subj).forEach(([sid, m]) => {
      const have = cur.bySubject[sid] || 0;
      if (have <= 0) return;
      if (have - m <= EPS) upd[`daily.${k}.bySubject.${sid}`] = deleteField();
      else upd[`daily.${k}.bySubject.${sid}`] = increment(-r1(m));
    });
  });
  Object.entries(perPeriod).forEach(([p, m]) => {
    const have = Number(periods[p]) || 0;
    const amt = r1(Math.min(m, have));
    if (amt > 0) upd[`periodTotals.${p}`] = increment(-amt);
  });
  return upd;
}

/* ---------- a janela ---------- */
export async function openRemoveCycles() {
  if (!store.me || overlay) return;
  filter = "all"; shown = PAGE; selected.clear();
  overlay = document.createElement("div");
  overlay.className = "modalWrap";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "rmcTitle");
  overlay.innerHTML = `
    <div class="modalBox soundSheetBox" style="max-width:520px">
      <p class="modalTitle" id="rmcTitle">🗑 Remover ciclos</p>
      <p class="muted" style="margin:0 0 10px">Marque os ciclos que foram contados por engano. Eles saem do Diário e o tempo é descontado dos seus totais (gráficos, sequência e recordes).</p>
      <div id="rmcFilter"></div>
      <div id="rmcList" aria-live="polite"><p class="muted">Carregando…</p></div>
      <div class="modalBtns" style="flex-wrap:wrap">
        <button class="ghost" id="rmcClose">Fechar</button>
        <button class="primary" id="rmcDo" disabled>Remover selecionados</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => { overlay?.remove(); overlay = null; document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape" && !busy) close(); };
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => { if (e.target === overlay && !busy) close(); });
  overlay.querySelector("#rmcClose").addEventListener("click", () => { if (!busy) close(); });
  overlay.querySelector("#rmcDo").addEventListener("click", removeSelected);
  await load();
}

async function load() {
  const box = overlay?.querySelector("#rmcList");
  if (!box) return;
  try {
    const snap = await getDocs(query(collection(db, "users", store.me.uid, "sessions"), orderBy("ts", "desc"), limit(shown)));
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => !pending.has(r.id));
    for (const id of [...selected]) if (!rows.some((r) => r.id === id)) selected.delete(id);
    draw(snap.size >= shown && shown < MAX);
  } catch {
    box.innerHTML = `<p class="muted">Não consegui carregar os ciclos. Tente de novo.</p>`;
  }
}

function draw(canMore) {
  if (!overlay) return;
  const sid = (r) => r.subjectId || "geral";
  const bar = overlay.querySelector("#rmcFilter"), box = overlay.querySelector("#rmcList");
  const minutesBy = {};
  rows.forEach((r) => { minutesBy[sid(r)] = (minutesBy[sid(r)] || 0) + (r.minutes || 0); });
  const ids = Object.keys(minutesBy).sort((a, b) => minutesBy[b] - minutesBy[a]);
  if (filter !== "all" && !ids.includes(filter)) filter = "all";
  bar.innerHTML = ids.length < 2 ? "" : `<div class="hxScroll">
    <button class="chip ${filter === "all" ? "on" : ""}" data-f="all">Todas</button>
    ${ids.map((id) => {
      const s = sessionSubject(rows.find((r) => sid(r) === id) || { subjectId: id });
      return `<button class="chip ${filter === id ? "on" : ""}" data-f="${esc(id)}"><span class="dot" style="background:${esc(s.color)}"></span>${esc(s.name)}</button>`;
    }).join("")}</div>`;
  bar.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; draw(canMore); }));

  const list = filter === "all" ? rows : rows.filter((r) => sid(r) === filter);
  box.innerHTML = (list.length === 0 ? `<p class="muted">Nenhum ciclo registrado ainda.</p>` : list.map((r) => {
    const s = sessionSubject(r);
    const dt = new Date(r.date + "T00:00:00");
    const lbl = isNaN(dt) ? esc(r.date || "") : dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    const sp = sessionSpan(r);
    return `<label class="logRow" style="cursor:pointer">
      <input type="checkbox" data-id="${esc(r.id)}" ${selected.has(r.id) ? "checked" : ""} style="margin-top:3px;flex:0 0 auto" aria-label="Selecionar ciclo de ${esc(s.name)}, ${esc(lbl)}, ${esc(fmtMin(r.minutes))}">
      <span class="dot" style="background:${esc(s.color)}"></span>
      <div class="logBody">
        <p class="logHead">${lbl} · ${esc(s.name)} · ${fmtMin(r.minutes)}</p>
        ${sp ? `<p class="logTime">${fmtHM(sp.start)} – ${fmtHM(sp.end)}</p>` : ""}
        ${r.note ? `<p class="logNote">${esc(r.note)}</p>` : ""}
      </div></label>`;
  }).join("")) + (canMore ? `<button class="btnOutline" id="rmcMore" style="margin-top:12px">Mostrar mais ciclos</button>` : "");

  box.querySelectorAll('input[type="checkbox"][data-id]').forEach((cb) => cb.addEventListener("change", () => {
    if (cb.checked) selected.add(cb.dataset.id); else selected.delete(cb.dataset.id);
    paintButton();
  }));
  box.querySelector("#rmcMore")?.addEventListener("click", async () => { shown = Math.min(MAX, shown + PAGE); await load(); });
  paintButton();
}

function paintButton() {
  const btn = overlay?.querySelector("#rmcDo");
  if (!btn) return;
  const pick = rows.filter((r) => selected.has(r.id));
  const min = pick.reduce((a, r) => a + (r.minutes || 0), 0);
  btn.disabled = busy || pick.length === 0;
  btn.textContent = pick.length ? `Remover ${pick.length} (${fmtMin(min)})` : "Remover selecionados";
}

async function removeSelected() {
  if (busy || !store.me) return;
  const pick = rows.filter((r) => selected.has(r.id));
  if (!pick.length) return;
  const min = pick.reduce((a, r) => a + (r.minutes || 0), 0);
  const ok = confirm(
    `Remover ${pick.length} ciclo${pick.length > 1 ? "s" : ""} (${fmtMin(min)})?\n\n` +
    `Eles saem do Diário e esse tempo é descontado dos seus totais.\n` +
    `Vou baixar uma cópia antes (dá para restaurar em "Importar dados"). Continuar?`);
  if (!ok) return;

  busy = true; paintButton();
  const uid = store.me.uid;
  // cópia de segurança: os ciclos como estão no banco (mesmo formato do "Baixar meus dados")
  try {
    downloadFile(`juntos-copia-ciclos-removidos-${todayKey()}.json`, JSON.stringify({
      geradoEm: new Date().toISOString(),
      ciclosRemovidos: pick.map((r) => ({ id: r.id, date: r.date, minutes: r.minutes, subjectId: r.subjectId || "geral",
        subjectName: r.subjectName || null, note: r.note || null, ts: r.ts?.toDate ? r.ts.toDate().toISOString() : null }))
    }, null, 2), "application/json");
  } catch { /* a cópia é uma cortesia: se o navegador bloquear, a remoção segue */ }

  try {
    const batch = writeBatch(db);
    const upd = buildProfileUpdate(pick);
    if (Object.keys(upd).length) batch.update(doc(db, "users", uid), upd);
    pick.forEach((r) => batch.delete(doc(db, "users", uid, "sessions", r.id)));
    pick.forEach((r) => pending.add(r.id)); // já some da lista; impede mandar o mesmo ciclo duas vezes
    // sem internet o commit só termina na volta: espera pouco e deixa o Firestore terminar sozinho depois
    const commit = batch.commit().then(() => "ok");
    commit.catch(() => pick.forEach((r) => pending.delete(r.id))); // falha tardia (depois do aviso "enviado"): o ciclo volta para a lista
    const result = await Promise.race([commit, new Promise((res) => setTimeout(() => res("fila"), 12000))]);
    selected.clear();
    invalidateHistory();
    import("./studylog-hours.js").then((m) => m.invalidateHours?.()).catch(() => {});
    toast(result === "ok"
      ? `${pick.length} ciclo${pick.length > 1 ? "s removidos" : " removido"}.`
      : "Enviado. Termina assim que a conexão estiver estável — nada é removido duas vezes.");
  } catch {
    pick.forEach((r) => pending.delete(r.id)); // falhou de verdade: volta para a lista
    toast("Não consegui remover agora. Nada foi alterado.");
  }
  busy = false;
  await load();
}
