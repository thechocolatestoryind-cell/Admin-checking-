import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, where, limit, serverTimestamp, writeBatch } from "../firebase.js";
import { COL } from "../collections.js";
import { assertOnline } from "./util.js";

const col = () => collection(db, COL.categories);
const withId = d => ({ id: d.id, ...d.data() });
export const bySort = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name || "").localeCompare(String(b.name || ""));

export async function listCategories() { return (await getDocs(col())).docs.map(withId).sort(bySort); }
export async function createCategory(data) {
  assertOnline();
  return (await addDoc(col(), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })).id;
}
export async function updateCategory(id, patch) {
  assertOnline();
  await updateDoc(doc(db, COL.categories, id), { ...patch, updatedAt: serverTimestamp() });
}
export async function productsInCategory(id) {
  return (await getDocs(query(collection(db, COL.products), where("categoryId", "==", id), limit(50)))).docs.map(withId);
}
export async function deleteCategory(id) { assertOnline(); await deleteDoc(doc(db, COL.categories, id)); }
// Renumber 1..n in the given order; only documents whose sortOrder changes are written (one atomic batch).
export async function saveOrder(orderedList) {
  assertOnline();
  const batch = writeBatch(db); let n = 0;
  orderedList.forEach((c, i) => { if (c.sortOrder !== i + 1) { batch.update(doc(db, COL.categories, c.id), { sortOrder: i + 1, updatedAt: serverTimestamp() }); n++; } });
  if (n) await batch.commit();
  return n;
}
