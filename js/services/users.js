// READ-ONLY customer access (admin may get/list users and read addresses under the current rules).
import { db, collection, doc, getDoc, getDocs } from "../firebase.js";
import { COL, SUB } from "../collections.js";
import { byNewest } from "./order-logic.js";

const withId = d => ({ id: d.id, ...d.data() });
export async function listUsers() { return (await getDocs(collection(db, COL.users))).docs.map(withId).sort(byNewest); }
export async function getUser(uid) { const s = await getDoc(doc(db, COL.users, uid)); return s.exists() ? withId(s) : null; }
export async function addressesFor(uid) { return (await getDocs(collection(db, COL.users, uid, SUB.userAddresses))).docs.map(withId); }
