import { db, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, limit, serverTimestamp } from "../firebase.js";
import { COL } from "../collections.js";
import { assertOnline } from "./util.js";

const col = () => collection(db, COL.products);
const withId = d => ({ id: d.id, ...d.data() });

export async function listProducts() { return (await getDocs(col())).docs.map(withId); }
export async function getProduct(id) { const s = await getDoc(doc(db, COL.products, id)); return s.exists() ? withId(s) : null; }
export async function slugTaken(slug, exceptId) {
  const s = await getDocs(query(col(), where("slug", "==", slug), limit(5)));
  return s.docs.some(d => d.id !== exceptId);
}
export async function createProduct(data) {
  assertOnline();
  const ref = await addDoc(col(), { ...data, reviewCount: 0, averageRating: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}
// Targeted update: only the given fields change, so unknown existing fields are preserved.
export async function updateProduct(id, patch) {
  assertOnline();
  await updateDoc(doc(db, COL.products, id), { ...patch, updatedAt: serverTimestamp() });
}
export async function productUsage(id) {
  const out = { reviews: null, wishlists: null };
  try { out.reviews = (await getDocs(query(collection(db, COL.reviews), where("productId", "==", id), limit(1)))).size; } catch (_) {}
  try { out.wishlists = (await getDocs(query(collection(db, COL.wishlists), where("productIds", "array-contains", id), limit(1)))).size; } catch (_) {}
  return out;
}
export async function deleteProduct(id) { assertOnline(); await deleteDoc(doc(db, COL.products, id)); }
