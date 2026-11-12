/* O caminho de volta é importData.js ("Importar dados de um arquivo"): este arquivo é feito para
   ser levado embora E trazido de volta — JSON aberto, legível, sem formato proprietário.
   "Baixar meus dados" (LGPD, art. 18): monta UM arquivo JSON legível com tudo o que o app guarda
   sobre a pessoa — perfil (incluindo as partes privadas), diário de sessões, done-list e gratidão (Ta-da) com as estatísticas salvas por mês, totais por dia,
   salas de que participa e as mensagens públicas que ela mesma enviou. Só lê o que já existe e
   monta o arquivo no navegador; nada é enviado a lugar nenhum. */
import { db, doc, getDoc, collection, getDocs, query, orderBy, where, privateRef, PRIVATE_DOCS } from "./firebase.js";
import { store } from "./store.js";
import { toast, dateKey, downloadFile } from "./utils.js";
import { decryptText } from "./crypto.js";
import { APP_VERSION } from "./constants.js";

const plain = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (x && typeof x.toDate === "function" ? x.toDate().toISOString() : x)));

export async function exportMyData() {
  if (!store.me) return;
  const uid = store.me.uid;
  toast("Preparando seus dados…");
  const out = {
    // "formato" permite ao importData.js (e a qualquer outro programa) reconhecer o arquivo
    formato: "juntos-dados", formatoVersao: 1, versaoDoApp: APP_VERSION,
    geradoEm: new Date().toISOString(),
    conta: { uid, email: store.me.email || null, nome: store.me.displayName || null },
    perfil: {}, sessoes: [], tada: [], gratidao: [], estatisticasTada: [], mensagensEnviadas: []
  };
  try {
    const main = await getDoc(doc(db, "users", uid));
    out.perfil = main.exists() ? main.data() : {};
    for (const name of PRIVATE_DOCS) {
      const d = await getDoc(privateRef(uid, name));
      if (d.exists()) Object.assign(out.perfil, d.data());
    }
    const s = await getDocs(query(collection(db, "users", uid, "sessions"), orderBy("ts", "asc")));
    out.sessoes = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Ta-da: done-list e diário de gratidão (um registro por dia)
    const t = await getDocs(collection(db, "users", uid, "tada"));
    out.tada = t.docs.map((d) => ({ dia: d.id, ...d.data() }));
    const g = await getDocs(collection(db, "users", uid, "gratitude"));
    out.gratidao = g.docs.map((d) => ({ dia: d.id, ...d.data() }));
    // estatísticas do Ta-da salvas por mês (derivadas dos registros acima; incluídas para o arquivo ser completo)
    const e = await getDocs(collection(db, "users", uid, "tadaStats"));
    out.estatisticasTada = e.docs.map((d) => ({ mes: d.id, ...d.data() }));
    const w = await getDoc(doc(db, "wallpapers", uid));
    out.perfil.papelDeParede = w.exists() && w.data().image ? "(imagem salva na sua conta — não incluída neste arquivo)" : null;
  } catch { toast("Não consegui ler tudo. Tente de novo."); return; }

  const codes = new Set([...(out.perfil.roomCodes || []), ...(out.perfil.roomCode ? [out.perfil.roomCode] : [])]);
  for (const code of codes) {
    try {
      const m = await getDocs(query(collection(db, "rooms", code, "messages"), where("from", "==", uid)));
      for (const d of m.docs) {
        const x = d.data();
        out.mensagensEnviadas.push({ sala: code, quando: x.ts, texto: await decryptText(x.text, code, x.from || uid) });
      }
    } catch { /* sem acesso a essa sala agora */ }
  }
  downloadFile(`juntos-meus-dados-${dateKey()}.json`, JSON.stringify(plain(out), null, 2), "application/json");
  toast("Pronto: arquivo com os seus dados baixado.");
}
