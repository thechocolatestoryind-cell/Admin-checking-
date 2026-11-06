// Minimal in-memory Firestore: enough for collection/doc CRUD, where(==, array-contains), limit, batches.
const saved = globalThis.__PERSIST__ && globalThis.sessionStorage && sessionStorage.getItem("__TCS_STORE__");
export const store = { data: saved ? JSON.parse(saved) : structuredClone(globalThis.__SEED__ || {}), failNext: null, writes: [] };
const persist = () => { if (globalThis.__PERSIST__ && globalThis.sessionStorage) sessionStorage.setItem("__TCS_STORE__", JSON.stringify(store.data)); };
globalThis.__STORE__ = store;
let n = 0; const SERVER = { __serverTimestamp: true };
export const serverTimestamp = () => SERVER;
export const getFirestore = () => ({});
const colData = name => (store.data[name] ||= {});
export const collection = (_db, ...segs) => ({ kind: "col", name: segs.join("/") });
export const doc = (_db, col, id) => (_db && _db.kind === "col") ? { kind: "doc", col: _db.name, id: "auto" + (++n) } : { kind: "doc", col, id };
const maybeFail = () => { if (store.failNext) { const code = store.failNext; store.failNext = null; throw Object.assign(new Error(code), { code }); } };
const snapDoc = (col, id) => ({ id, exists: () => true, data: () => structuredClone(colData(col)[id]) });
export const where = (field, op, value) => ({ t: "where", field, op, value });
export const limit = n => ({ t: "limit", n });
export const query = (c, ...cons) => ({ ...c, cons });
export async function getDocs(q) {
  maybeFail();
  let ids = Object.keys(colData(q.name)).filter(id => (q.cons || []).filter(c => c.t === "where").every(c => {
    const v = colData(q.name)[id][c.field]; return c.op === "==" ? v === c.value : Array.isArray(v) && v.includes(c.value); }));
  const lim = (q.cons || []).find(c => c.t === "limit"); if (lim) ids = ids.slice(0, lim.n);
  const docs = ids.map(id => snapDoc(q.name, id)); return { docs, size: docs.length };
}
export async function getDoc(r) { maybeFail(); return colData(r.col)[r.id] ? snapDoc(r.col, r.id) : { exists: () => false }; }
const stamp = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && v.__serverTimestamp ? "TS" : v]));
export async function addDoc(c, data) { maybeFail(); const id = "id" + (++n); colData(c.name)[id] = stamp(structuredClone(data)); store.writes.push(["add", c.name, id]); persist(); return { id }; }
export async function setDoc(r, data) { maybeFail(); colData(r.col)[r.id] = stamp(structuredClone(data)); store.writes.push(["set", r.col, r.id]); persist(); }
export async function updateDoc(r, patch) { maybeFail(); if (!colData(r.col)[r.id]) throw Object.assign(new Error("nf"), { code: "not-found" }); Object.assign(colData(r.col)[r.id], stamp(structuredClone(patch))); store.writes.push(["update", r.col, r.id]); persist(); }
export async function deleteDoc(r) { maybeFail(); delete colData(r.col)[r.id]; store.writes.push(["delete", r.col, r.id]); persist(); }
export const writeBatch = () => { const ops = []; return { update: (r, p) => ops.push(["u", r, p]), set: (r, d) => ops.push(["s", r, d]), delete: r => ops.push(["d", r]), commit: async () => { maybeFail(); for (const [k, r, p] of ops) { if (k === "u") await updateDoc(r, p); else if (k === "s") await setDoc(r, p); else await deleteDoc(r); } store.writes.push(["batch", ops.length]); } }; };
