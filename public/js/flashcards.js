/* Perguntas para lembrar (2.17): ao concluir um ciclo de estudo (5 min ou mais), o app pergunta 1 a 3
   perguntas simples sobre o tema. Elas voltam nos dias seguintes (1, 3, 7, 16, 35 dias) para a pessoa
   responder de cabeça — recordar ativamente fixa mais do que só reler. Guardadas em users/{uid}/cards
   (só o dono lê e escreve). Cada cartão: { q, a, subjectId, subjectName, level, next }. */
import { db, doc, collection, setDoc, updateDoc, getDocs, query, where, serverTimestamp } from "./firebase.js";
import { store } from "./store.js";
import { esc, dateKey, dateKeyOffset, shiftDateKey } from "./utils.js";

export const INTERVALS = [1, 3, 7, 16, 35]; // dias até a próxima revisão, conforme o nível

/* Pergunta 1 é a principal; 2 e 3 são opcionais. Devolve quantas perguntas foram guardadas. */
export function openCardMaker({ subjectId, subjectName }) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modalWrap";
    wrap.innerHTML = `
      <div class="modalBox" style="max-width:440px;width:100%;max-height:88vh;overflow:auto;box-sizing:border-box">
        <p class="modalTitle">🧠 Perguntas para lembrar</p>
        <p class="muted" style="margin-top:-6px">1 a 3 perguntas simples sobre ${esc(subjectName)}. Elas voltam daqui a 1, 3 e 7 dias para você responder de cabeça. Se preferir, pule.</p>
        ${[0, 1, 2].map((i) => `
          <div style="margin:14px 0 0">
            <label class="f" for="fcQ${i}">Pergunta ${i + 1}${i === 0 ? "" : " (opcional)"}</label>
            <input class="f" id="fcQ${i}" maxlength="300" placeholder="Ex.: Qual é a ideia central do que li?" style="margin-bottom:6px" aria-label="Pergunta ${i + 1}">
            <input class="f" id="fcA${i}" maxlength="300" placeholder="Resposta (pode completar depois)" aria-label="Resposta da pergunta ${i + 1}">
          </div>`).join("")}
        <div class="modalBtns" style="margin-top:18px">
          <button class="ghost" data-act="skip">Agora não</button>
          <button class="primary" data-act="save">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const close = (n) => { wrap.remove(); resolve(n); };
    wrap.querySelector('[data-act="skip"]').addEventListener("click", () => close(0));
    wrap.querySelector('[data-act="save"]').addEventListener("click", () => {
      let saved = 0;
      const col = collection(db, "users", store.me.uid, "cards");
      for (let i = 0; i < 3; i++) {
        const q = wrap.querySelector(`#fcQ${i}`).value.trim();
        if (!q) continue;
        const a = wrap.querySelector(`#fcA${i}`).value.trim();
        // enfileirado (funciona sem internet); o Firestore sincroniza quando voltar
        setDoc(doc(col), {
          q: q.slice(0, 300), a: a.slice(0, 300), subjectId: subjectId || "geral", subjectName: String(subjectName || "Geral").slice(0, 200),
          level: 0, next: dateKeyOffset(1), ts: serverTimestamp()
        }).catch(() => {});
        saved++;
      }
      close(saved);
    });
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(0); });
    wrap.querySelector("#fcQ0")?.focus();
  });
}

/* Lista as perguntas de hoje (ou vencidas) dentro de `box` e registra as respostas. */
export async function renderDueCards(box) {
  box.innerHTML = `<p class="muted">Carregando perguntas…</p>`;
  let cards = [];
  try {
    const snap = await getDocs(query(collection(db, "users", store.me.uid, "cards"), where("next", "<=", dateKey())));
    cards = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.next.localeCompare(b.next)).slice(0, 25);
  } catch {
    box.innerHTML = `<p class="muted">Não consegui carregar as perguntas agora.</p>`;
    return;
  }
  if (cards.length === 0) {
    box.innerHTML = `<p class="muted">Nenhuma pergunta para hoje. ✨</p>`;
    return;
  }
  const byId = new Map(cards.map((c) => [c.id, c]));
  box.innerHTML = cards.map((c) => `
    <div class="fcCard" data-id="${esc(c.id)}" style="border:1px solid var(--border);border-radius:14px;padding:12px 14px;background:var(--surface)">
      <p style="margin:0 0 4px;font-size:11px;color:var(--muted)">${esc(c.subjectName || "Geral")}</p>
      <p style="margin:0 0 8px;font-weight:600;font-size:14px">${esc(c.q)}</p>
      <p class="fcAns muted hide" style="margin:0 0 10px;font-size:13px">${esc(c.a || "—")}</p>
      <div class="fcBtns" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="ghost" data-act="show" style="padding:8px 14px;font-size:13px">Mostrar resposta</button>
      </div>
    </div>`).join("");

  box.onclick = (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const card = btn.closest(".fcCard");
    const c = byId.get(card?.dataset.id);
    if (!c) return;
    const row = card.querySelector(".fcBtns");
    if (btn.dataset.act === "show") {
      card.querySelector(".fcAns").classList.remove("hide");
      row.innerHTML = `
        <button class="primary" data-act="ok" style="padding:8px 14px;font-size:13px">Lembrei</button>
        <button class="ghost" data-act="again" style="padding:8px 14px;font-size:13px">Revisar de novo</button>`;
      return;
    }
    // "Lembrei" sobe um nível (intervalo maior); "Revisar de novo" volta ao começo (amanhã)
    const level = btn.dataset.act === "ok" ? Math.min(c.level + 1, INTERVALS.length - 1) : 0;
    const next = btn.dataset.act === "ok" ? shiftDateKey(dateKey(), INTERVALS[level]) : dateKeyOffset(1);
    Object.assign(c, { level, next });
    updateDoc(doc(db, "users", store.me.uid, "cards", c.id), { level, next }).catch(() => {});
    card.style.opacity = ".55";
    row.innerHTML = `<span class="muted" style="font-size:12px">${btn.dataset.act === "ok" ? `Próxima vez: ${next}` : "Amanhã de novo."}</span>`;
  };
}
