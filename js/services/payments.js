// READ-ONLY: the rules deny every browser write to paymentTransactions. No write function exists on purpose.
import { db, collection, getDocs, query, where, limit } from "../firebase.js";
import { COL } from "../collections.js";
import { byNewest } from "./order-logic.js";

const withId = d => ({ id: d.id, ...d.data() });
export async function listTransactions() { return (await getDocs(collection(db, COL.paymentTransactions))).docs.map(withId).sort(byNewest); }
export async function transactionsForOrder(orderId) { return (await getDocs(query(collection(db, COL.paymentTransactions), where("orderId", "==", orderId), limit(20)))).docs.map(withId).sort(byNewest); }
