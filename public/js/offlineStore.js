/* Armazenamento local em IndexedDB (2.13) — um "caderninho" minúsculo, chave → valor.
   Por que existe: o localStorage é pequeno (~5 MB), síncrono e some com facilidade; o IndexedDB é o
   lugar certo para guardar o que precisa sobreviver a fechar o app com a internet fora do ar.
   (O Firestore já usa o IndexedDB por conta própria para a fila de gravações — veja firebase.js. Este
   módulo guarda só o que é nosso: o diário de "o que foi feito offline", para a pessoa ver depois
   que ficou tudo sincronizado.)
   Regras: nunca lança erro (se o navegador não tiver IndexedDB, as funções simplesmente não fazem
   nada e o app segue normal) e é apagado ao sair da conta (wipeStore, chamado por auth.js). */
const DB_NAME = "juntos-offline";
const STORE = "kv";
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!("indexedDB" in window)) return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

function run(mode, fn) {
  return open().then((db) => new Promise((resolve) => {
    if (!db) return resolve(undefined);
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = tx.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

export const idbGet = (key) => run("readonly", (s) => s.get(key));
export const idbSet = (key, value) => run("readwrite", (s) => s.put(value, key));
export const idbDel = (key) => run("readwrite", (s) => s.delete(key));

// diário do que aconteceu offline (lista simples, mais antigo primeiro, no máximo 200 itens)
const JOURNAL = "offlineJournal";
export async function journalAdd(entry) {
  const list = (await idbGet(JOURNAL)) || [];
  list.push({ ...entry, at: Date.now() });
  await idbSet(JOURNAL, list.slice(-200));
}
export async function journalTake() {          // lê e esvazia
  const list = (await idbGet(JOURNAL)) || [];
  if (list.length) await idbDel(JOURNAL);
  return list;
}
export async function journalPeek() { return (await idbGet(JOURNAL)) || []; }

// apaga tudo (usado ao "Sair da conta": aparelho compartilhado não herda nada)
export async function wipeStore() {
  await run("readwrite", (s) => s.clear());
}
