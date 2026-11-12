/* Privacidade e direitos da pessoa usuária (LGPD):
   - tela de aceite dos Termos/Política (e da declaração de idade/autorização do responsável),
     exibida no primeiro acesso e sempre que a versão dos documentos mudar;
   - "Baixar meus dados" e "Excluir minha conta e meus dados" nos Ajustes. */
import { db, auth, provider, doc, getDoc, deleteDoc, collection, getDocs, query, where, updateDoc,
  arrayRemove, writeBatch, deleteUser, reauthenticateWithPopup, privateRef, PRIVATE_DOCS } from "./firebase.js";
import { store } from "./store.js";
import { $, toast, openModal } from "./utils.js";
import { CONSENT_VERSION } from "./constants.js";
import { signOutAndWipe, wipeLocalData } from "./auth.js";

/* ---------- aceite dos termos ---------- */
let gate = null;
export function checkConsent(profile) {
  if (!profile) return;
  const ok = profile.consent && profile.consent.v === CONSENT_VERSION;
  if (ok) { if (gate) { gate.remove(); gate = null; } return; }
  if (gate) return;
  gate = document.createElement("div");
  gate.className = "modalWrap";
  gate.style.cssText = "z-index:300;background:var(--panel,#161C28);align-items:center;overflow:auto";
  gate.innerHTML = `
    <div class="modalBox" style="max-width:460px;max-height:96vh;overflow:auto">
      <p class="modalTitle" style="font-size:20px">Antes de começar</p>
      <p class="muted" style="margin:0 0 14px">O Juntos é gratuito e não vende seus dados. Para usar, precisamos do seu aceite:</p>
      <label style="display:flex;gap:10px;align-items:flex-start;margin:0 0 12px;font-size:14px;line-height:1.45">
        <input type="checkbox" id="consentTerms" style="margin-top:3px">
        <span>Li e concordo com os <a href="termos.html" target="_blank" rel="noopener noreferrer">Termos de Serviço</a>
        e com a <a href="privacidade.html" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.</span>
      </label>
      <label style="display:flex;gap:10px;align-items:flex-start;margin:0 0 18px;font-size:14px;line-height:1.45">
        <input type="checkbox" id="consentAge" style="margin-top:3px">
        <span>Tenho 18 anos ou mais — <b>ou</b> sou menor de idade e um responsável legal sabe que uso o Juntos e concordou.</span>
      </label>
      <div class="modalBtns">
        <button class="ghost" id="consentOut">Sair</button>
        <button class="primary" id="consentOk" disabled style="opacity:.5">Continuar</button>
      </div>
    </div>`;
  document.body.appendChild(gate);
  const t = gate.querySelector("#consentTerms"), a = gate.querySelector("#consentAge"), ok2 = gate.querySelector("#consentOk");
  const sync = () => { ok2.disabled = !(t.checked && a.checked); ok2.style.opacity = ok2.disabled ? ".5" : "1"; };
  t.addEventListener("change", sync); a.addEventListener("change", sync);
  gate.querySelector("#consentOut").addEventListener("click", () => signOutAndWipe());
  ok2.addEventListener("click", async () => {
    ok2.disabled = true;
    try {
      await updateDoc(doc(db, "users", store.me.uid), { consent: { v: CONSENT_VERSION, at: new Date().toISOString(), ageOrGuardian: true } });
      store.profile = { ...store.profile, consent: { v: CONSENT_VERSION } };
      gate.remove(); gate = null;
    } catch { toast("Não consegui salvar o aceite. Verifique a conexão."); sync(); }
  });
}

/* ---------- excluir conta ---------- */
async function deleteAll(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const b = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => b.delete(r));
    await b.commit();
  }
}

async function deleteMyAccount() {
  const user = auth.currentUser;
  if (!user) return;
  const typed = await openModal({
    title: "Excluir conta e dados",
    placeholder: "Digite EXCLUIR para confirmar",
    confirmLabel: "Excluir para sempre",
    skipLabel: "Cancelar"
  });
  if (typed !== "EXCLUIR") { if (typed !== null) toast("Nada foi apagado: você precisa digitar EXCLUIR."); return; }

  // pede o login do Google de novo ANTES de apagar qualquer coisa: se isso falhar, nada foi perdido
  try { await reauthenticateWithPopup(user, provider); }
  catch { toast("Não consegui confirmar a sua identidade. Nada foi apagado."); return; }

  toast("Apagando seus dados…");
  const uid = user.uid;
  try {
    const codes = new Set([...(store.profile?.roomCodes || []), ...(store.profile?.roomCode ? [store.profile.roomCode] : [])]);
    for (const code of codes) {
      // mensagens públicas minhas, caixa de entrada, e saída da sala (nessa ordem: depois de sair, não dá mais pra ler a sala)
      try {
        const mine = await getDocs(query(collection(db, "rooms", code, "messages"), where("from", "==", uid)));
        await deleteAll(mine.docs.map((d) => d.ref));
        const inbox = await getDocs(collection(db, "rooms", code, "inbox", uid, "msgs"));
        await deleteAll(inbox.docs.map((d) => d.ref));
        await updateDoc(doc(db, "rooms", code), { members: arrayRemove(uid) });
      } catch { /* sala sem acesso (já removido): segue */ }
    }
    const sessions = await getDocs(collection(db, "users", uid, "sessions"));
    await deleteAll(sessions.docs.map((d) => d.ref));
    // Ta-da: conquistas e gratidões (um documento por dia, em duas subcoleções) + estatísticas salvas por mês
    for (const sub of ["tada", "gratitude", "tadaStats"]) {
      const days = await getDocs(collection(db, "users", uid, sub));
      await deleteAll(days.docs.map((d) => d.ref));
    }
    for (const name of PRIVATE_DOCS) await deleteDoc(privateRef(uid, name)).catch(() => {});
    await deleteDoc(doc(db, "wallpapers", uid)).catch(() => {});
    await deleteDoc(doc(db, "users", uid));
    await deleteUser(user);
  } catch {
    toast("Não consegui apagar tudo. Tente de novo; se persistir, fale com o contato da Política de Privacidade.");
    return;
  }
  await wipeLocalData();
  alert("Sua conta e seus dados foram excluídos.");
  location.reload();
}

export function initPrivacy() {
  $("exportMyData")?.addEventListener("click", async () => (await import("./exportData.js")).exportMyData());
  // importar: o botão abre o seletor de arquivo; o módulo só é baixado quando a pessoa escolhe um arquivo
  $("importMyData")?.addEventListener("click", () => $("importFile")?.click());
  $("importFile")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois
    if (file) (await import("./importData.js")).importMyData(file);
  });
  $("deleteAccount")?.addEventListener("click", deleteMyAccount);
}
