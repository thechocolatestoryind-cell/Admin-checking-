import { db, collection, doc, getDoc, getDocs, updateDoc, query, where, limit, serverTimestamp } from "../firebase.js";
import { COL, ORDER_TRANSITIONS } from "../collections.js";
import { assertOnline } from "./util.js";
import { byNewest } from "./order-logic.js";

const withId = d => ({ id: d.id, ...d.data() });
export async function listOrders() { return (await getDocs(collection(db, COL.orders))).docs.map(withId).sort(byNewest); }
export async function getOrder(id) { const s = await getDoc(doc(db, COL.orders, id)); return s.exists() ? withId(s) : null; }
export async function ordersForUser(uid) { return (await getDocs(query(collection(db, COL.orders), where("userId", "==", uid), limit(100)))).docs.map(withId).sort(byNewest); }

// Notes and cancellation. (Approve / Ship / Deliver live in fulfilment.js and also write the shipment.) Only status / adminNote + updatedAt.
export async function updateOrder(order, { status, adminNote }) {
  assertOnline();
  const patch = { updatedAt: serverTimestamp() };
  if (status !== undefined) {
    if (!(ORDER_TRANSITIONS[order.status] || []).includes(status)) throw Object.assign(new Error("Not an allowed status change"), { code: "app/invalid-transition" });
    patch.status = status;
  }
  if (adminNote !== undefined) patch.adminNote = String(adminNote).slice(0, 1000);
  await updateDoc(doc(db, COL.orders, order.id), patch);
  return patch;
}
