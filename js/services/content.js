// Banners, highlights and slides. All writes are admin-only under the current rules.
import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp, writeBatch } from "../firebase.js";
import { COL } from "../collections.js";
import { assertOnline } from "./util.js";
import { bySort } from "./categories.js";

const ALLOWED = new Set([COL.banners, COL.highlights, COL.highlightItems]);
const guard = c => { if (!ALLOWED.has(c)) throw new Error("Unsupported collection"); };
const withId = d => ({ id: d.id, ...d.data() });
export async function listAll(c) { guard(c); return (await getDocs(collection(db, c))).docs.map(withId).sort(bySort); }
export async function createItem(c, data) { guard(c); assertOnline(); return (await addDoc(collection(db, c), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })).id; }
export async function updateItem(c, id, patch) { guard(c); assertOnline(); await updateDoc(doc(db, c, id), { ...patch, updatedAt: serverTimestamp() }); }
export async function deleteItem(c, id) { guard(c); assertOnline(); await deleteDoc(doc(db, c, id)); }
// Renumber 1..n in the given order; one atomic batch of only the changed documents.
export async function reorder(c, list) {
  guard(c); assertOnline(); const b = writeBatch(db); let n = 0;
  list.forEach((x, i) => { if (x.sortOrder !== i + 1) { b.update(doc(db, c, x.id), { sortOrder: i + 1, updatedAt: serverTimestamp() }); n++; } });
  if (n) await b.commit(); return n;
}
export async function slidesOf(highlightId) { return (await getDocs(query(collection(db, COL.highlightItems), where("highlightId", "==", highlightId)))).docs.map(withId).sort(bySort); }
// Deletes the highlight AND its slides in one atomic batch, so no hidden orphans are left behind.
export async function deleteHighlightCascade(highlightId, slideIds) {
  assertOnline(); if (slideIds.length > 450) throw Object.assign(new Error("Too many slides"), { code: "app/too-many" });
  const b = writeBatch(db); slideIds.forEach(id => b.delete(doc(db, COL.highlightItems, id))); b.delete(doc(db, COL.highlights, highlightId)); await b.commit();
}
