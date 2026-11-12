/* Gratidão depois do estudo: um momento curto, opcional, que aparece logo após a reflexão do ciclo
   (js/studylog.js). Duas perguntas — pelo que sou grato e COMO isso afeta a minha vida — e vai para
   o Diário de gratidão (aba Ta-da). Pode ser pulado sem custo; desligável em Ajustes → Experiência. */
import { esc, toast } from "./utils.js";
import { addGratitude, MAX_WHAT, MAX_HOW } from "./tada-data.js";

const STARTERS = ["Uma pessoa", "Algo que aprendi", "Meu corpo", "Um momento de hoje", "Uma oportunidade"];

export function askGratitudeAfterStudy(subject) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modalWrap";
    wrap.innerHTML = `
      <div class="modalBox" role="dialog" aria-modal="true" aria-label="Gratidão depois de estudar">
        <p class="modalTitle">🙏 Gratidão · ${esc(subject?.subjectName || "estudo")}</p>
        <p class="reflHint">Terminou de estudar. Antes de seguir: pelo que você é grato agora, e como isso toca a sua vida?</p>
        <div class="reflChips" role="group" aria-label="Ideias para começar">${STARTERS.map((s, i) => `<button type="button" data-st="${i}">${esc(s)}</button>`).join("")}</div>
        <label class="grLbl" for="grWhatIn">Sou grato por…</label>
        <textarea class="f modalInput" id="grWhatIn" rows="2" maxlength="${MAX_WHAT}" placeholder="Ex: ter conseguido entender o conteúdo hoje"></textarea>
        <label class="grLbl" for="grHowIn">Isso afeta a minha vida porque…</label>
        <textarea class="f modalInput" id="grHowIn" rows="3" maxlength="${MAX_HOW}" placeholder="Ex: me deixa mais perto da prova que quero fazer e mais calmo"></textarea>
        <div class="modalBtns">
          <button class="ghost" data-act="skip" type="button">Agora não</button>
          <button class="primary" data-act="ok" type="button">Guardar gratidão</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const what = wrap.querySelector("#grWhatIn"), how = wrap.querySelector("#grHowIn");
    setTimeout(() => what.focus(), 30);
    wrap.querySelectorAll("[data-st]").forEach((b) => b.addEventListener("click", () => {
      what.value = `${STARTERS[Number(b.dataset.st)].toLowerCase()}: `;
      what.focus(); what.setSelectionRange(what.value.length, what.value.length);
    }));
    const close = (saved) => { wrap.remove(); resolve(saved); };
    wrap.querySelector('[data-act="skip"]').addEventListener("click", () => close(false));
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(false); });
    wrap.querySelector('[data-act="ok"]').addEventListener("click", () => {
      const a = what.value.trim();
      if (!a) { toast("Escreva pelo que você é grato, ou toque em “Agora não”."); what.focus(); return; }
      // sem await: offline a gravação fica na fila do aparelho e sobe sozinha (ver CLAUDE.md)
      addGratitude({
        what: a, how: how.value, src: "study",
        subjectId: subject?.subjectId || null, subjectName: subject?.subjectName || null, subjectColor: subject?.subjectColor || null
      });
      toast("Gratidão guardada. 🙏");
      close(true);
    });
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) wrap.querySelector('[data-act="ok"]').click();
    });
  });
}
