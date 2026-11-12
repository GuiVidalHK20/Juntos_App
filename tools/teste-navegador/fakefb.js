// Firebase falso para rodar o app de verdade no Chromium de teste (nada de rede)
const SEED = globalThis.__SEED || {};
export const DB = new Map(Object.entries(SEED));
const DEL = { __del: 1 }, listeners = new Set();
class TS { constructor(ms) { this.ms = ms; this.seconds = Math.floor(ms / 1000); this.nanoseconds = 0; } toMillis() { return this.ms; } toDate() { return new Date(this.ms); } }
export const Timestamp = { now: () => new TS(Date.now()), fromMillis: (m) => new TS(m) };
const SRV = { __srv: 1 };
export const serverTimestamp = () => SRV; export const deleteField = () => DEL;
export const arrayUnion = (...v) => ({ __un: v }); export const arrayRemove = (...v) => ({ __rm: v }); export const increment = (n) => ({ __inc: n });
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function setPath(o, path, v) { const p = path.split("."); let c = o; for (let i = 0; i < p.length - 1; i++) { if (typeof c[p[i]] !== "object" || c[p[i]] === null) c[p[i]] = {}; c = c[p[i]]; } c[p[p.length - 1]] = v; }
function applyVal(cur, v) {
  if (v === DEL) return undefined;
  if (v === SRV) return Date.now();
  if (v && v.__un) return [...(Array.isArray(cur) ? cur : []), ...v.__un.filter((x) => !(Array.isArray(cur) ? cur : []).some((y) => eq(x, y)))];
  if (v && v.__rm) return (Array.isArray(cur) ? cur : []).filter((y) => !v.__rm.some((x) => eq(x, y)));
  if (v && v.__inc !== undefined) return (Number(cur) || 0) + v.__inc;
  return v;
}
function merge(dst, src, deep) {
  for (const [k, v] of Object.entries(src)) {
    const isMap = v && typeof v === "object" && !Array.isArray(v) && !v.__del && !v.__srv && !v.__un && !v.__rm && v.__inc === undefined && !(v instanceof TS);
    if (k.includes(".") ) { const cur = k.split(".").reduce((a, p) => (a ? a[p] : undefined), dst); const nv = applyVal(cur, v); if (nv === undefined) { const p = k.split("."); let c = dst; for (let i = 0; i < p.length - 1; i++) c = c?.[p[i]]; if (c) delete c[p[p.length - 1]]; } else setPath(dst, k, nv); }
    else if (deep && isMap) { if (typeof dst[k] !== "object" || dst[k] === null || Array.isArray(dst[k])) dst[k] = {}; merge(dst[k], v, true); }
    else { const nv = applyVal(dst[k], v); if (nv === undefined) delete dst[k]; else dst[k] = nv; }
  }
}
const notify = () => setTimeout(() => listeners.forEach((f) => f()), 0);
export const db = { fake: 1 }; export const app = {};
export const doc = (_d, ...p) => ({ path: p.join("/"), id: p[p.length - 1], __doc: 1 });
export const collection = (_d, ...p) => ({ coll: p.join("/") });
export const where = (f, op, v) => ({ t: "w", f, op, v }); export const orderBy = (f, dir = "asc") => ({ t: "o", f, dir }); export const limit = (n) => ({ t: "l", n });
export const query = (c, ...cs) => ({ ...c, cs });
function runQ(q) {
  let rows = [...DB.entries()].filter(([p]) => p.startsWith(q.coll + "/") && !p.slice(q.coll.length + 1).includes("/")).map(([p, d]) => ({ id: p.split("/").pop(), d }));
  for (const c of q.cs || []) if (c.t === "w") rows = rows.filter(({ d }) => ({ ">=": d[c.f] >= c.v, "<=": d[c.f] <= c.v, "==": d[c.f] === c.v, ">": d[c.f] > c.v, "<": d[c.f] < c.v, "array-contains": (d[c.f] || []).includes?.(c.v) }[c.op]));
  const o = (q.cs || []).find((c) => c.t === "o"); if (o) rows = rows.filter(({ d }) => d[o.f] !== undefined).sort((a, b) => (a.d[o.f] < b.d[o.f] ? -1 : a.d[o.f] > b.d[o.f] ? 1 : 0) * (o.dir === "desc" ? -1 : 1));
  const l = (q.cs || []).find((c) => c.t === "l"); if (l) rows = rows.slice(0, l.n);
  const docs = rows.map(({ id, d }) => ({ id, data: () => clone(d), exists: () => true, metadata: { fromCache: false } }));
  return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f), docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
}
const snapDoc = (ref) => { const d = DB.get(ref.path); return { id: ref.id, exists: () => d !== undefined, data: () => clone(d), metadata: { fromCache: false, hasPendingWrites: false } }; };
export const getDoc = async (r) => snapDoc(r); export const getDocs = async (q) => runQ(q);
export function onSnapshot(ref, cb) {
  let last = "";
  const fire = () => { const s = ref.__doc ? snapDoc(ref) : runQ(ref); const sig = JSON.stringify(ref.__doc ? s.data() : s.docs.map((d) => [d.id, d.data()])); if (sig === last) return; last = sig; cb(s); };
  listeners.add(fire); setTimeout(fire, 0); return () => listeners.delete(fire);
}
export async function setDoc(ref, data, opt = {}) { const cur = DB.get(ref.path); const n = opt.merge && cur ? clone(cur) : {}; merge(n, data, !!opt.merge); DB.set(ref.path, n); window.__writes = (window.__writes || 0) + 1; notify(); }
export async function updateDoc(ref, data) { const cur = DB.get(ref.path) || {}; const n = clone(cur); merge(n, data, false); DB.set(ref.path, n); window.__writes = (window.__writes || 0) + 1; notify(); }
export const rawUpdateDoc = updateDoc;
export const deleteDoc = async (r) => { DB.delete(r.path); notify(); };
export const addDoc = async (c, data) => { const id = "a" + Math.random().toString(36).slice(2, 9); DB.set(c.coll + "/" + id, applyDeep(data)); notify(); return { id }; };
const applyDeep = (d) => { const n = {}; merge(n, d, true); return n; };
export const writeBatch = () => { const ops = []; return { set: (r, d, o) => ops.push(() => setDoc(r, d, o)), update: (r, d) => ops.push(() => updateDoc(r, d)), delete: (r) => ops.push(() => deleteDoc(r)), commit: async () => { for (const f of ops) await f(); } }; };
export const waitForPendingWrites = async () => {}; export const terminate = async () => {}; export const clearIndexedDbPersistence = async () => {};
export const PRIVATE_DOCS = ["mind", "planner"]; export const PRIVATE_FIELDS = {};
export const privateRef = (uid, name) => doc(db, "users", uid, "private", name);
export const provider = {}; export const persistenceMode = "fake";
export const auth = { currentUser: { uid: "u1", displayName: "Teste", email: "t@t.com", photoURL: null } };
export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb(auth.currentUser), 30); return () => {}; };
export const signInWithPopup = async () => {}; export const signInWithRedirect = async () => {}; export const getRedirectResult = async () => null;
export const signOut = async () => {}; export const deleteUser = async () => {}; export const reauthenticateWithPopup = async () => {};

globalThis.__DBPEEK = (k) => ((DB.get("users/u1/tada/" + k) || {}).items || []).map((x) => x.t);
