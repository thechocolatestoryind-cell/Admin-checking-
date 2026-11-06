// Custom order requests: admin may change only status + adminNote (+ updatedAt). Customer-submitted fields are never touched.
import { db, collection, doc, getDoc, getDocs, updateDoc, serverTimestamp } from "../firebase.js";
import { COL } from "../collections.js";
import { assertOnline } from "./util.js";
import { byNewest } from "./order-logic.js";

const withId = d => ({ id: d.id, ...d.data() });
export async function listRequests() { return (await getDocs(collection(db, COL.customOrderRequests))).docs.map(withId).sort(byNewest); }
export async function getRequest(id) { const s = await getDoc(doc(db, COL.customOrderRequests, id)); return s.exists() ? withId(s) : null; }
export async function updateRequest(id, { status, adminNote }) { assertOnline(); await updateDoc(doc(db, COL.customOrderRequests, id), { status, adminNote, updatedAt: serverTimestamp() }); }
