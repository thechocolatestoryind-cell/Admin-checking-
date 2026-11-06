// Moderation only: the only field ever changed is isApproved (+ updatedAt). Review text/images are never edited.
import { db, collection, doc, getDocs, updateDoc, deleteDoc, serverTimestamp } from "../firebase.js";
import { COL } from "../collections.js";
import { assertOnline } from "./util.js";
import { sortReviews } from "./admin-logic.js";

export async function listReviews() { return sortReviews((await getDocs(collection(db, COL.reviews))).docs.map(d => ({ id: d.id, ...d.data() }))); }
export async function setApproved(id, approved) { assertOnline(); await updateDoc(doc(db, COL.reviews, id), { isApproved: !!approved, updatedAt: serverTimestamp() }); }
export async function deleteReview(id) { assertOnline(); await deleteDoc(doc(db, COL.reviews, id)); }
