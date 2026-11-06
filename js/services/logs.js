// READ-ONLY on purpose: the rules deny every browser write to adminActivityLogs. No write function exists.
import { db, collection, getDocs } from "../firebase.js";
import { COL } from "../collections.js";
import { byNewest } from "./order-logic.js";
export async function listLogs() { return (await getDocs(collection(db, COL.adminActivityLogs))).docs.map(d => ({ id: d.id, ...d.data() })).sort(byNewest); }
