// The three manual order actions: Approve Order, Mark as Shipped, Mark as Delivered.
// Each one re-reads the order first (so a stale screen cannot overwrite a newer state), then writes in ONE atomic batch:
// the order and its shipment record change together or not at all. Nothing here is automatic: every function runs only
// from a button press by the admin. No tracking number, link or scan is ever invented; blank stays blank.
import { db, collection, doc, getDoc, getDocs, updateDoc, query, where, limit, writeBatch, serverTimestamp } from "../firebase.js";
import { COL, PAYMENT_STATUS } from "../collections.js";
import { assertOnline } from "./util.js";
import { dateFromIstString, isTodayIst, byNewest, STATUS_LABEL, paymentStatusLabel } from "./order-logic.js";

const staleError = msg => Object.assign(new Error(msg), { code: "app/stale-order" });
async function freshOrder(id) {
  const s = await getDoc(doc(db, COL.orders, id));
  if (!s.exists()) throw Object.assign(new Error("This order no longer exists."), { code: "app/not-found" });
  return { id: s.id, ...s.data() };
}
// "Today" gets the server's exact time; any other chosen day is stored as that India calendar day (midnight IST).
const stampFor = day => isTodayIst(day) ? serverTimestamp() : dateFromIstString(day);

export async function latestShipment(orderId) {
  const snap = await getDocs(query(collection(db, COL.shipments), where("orderId", "==", orderId), limit(20)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byNewest)[0] || null;
}

// pending + payment pending  ->  confirmed + payment verified   (admin has checked the real bank/UPI credit)
export async function approveOrder(order) {
  assertOnline();
  const cur = await freshOrder(order.id);
  if (cur.status !== "pending") throw staleError("This order is now \u201C" + (STATUS_LABEL[cur.status] || cur.status) + "\u201D, so it cannot be approved. Reload the page.");
  if (cur.paymentStatus !== PAYMENT_STATUS.pending) throw staleError("This order's payment status is \u201C" + paymentStatusLabel(cur.paymentStatus) + "\u201D, not awaiting verification, so it was not approved.");
  await updateDoc(doc(db, COL.orders, cur.id), { status: "confirmed", paymentStatus: PAYMENT_STATUS.verified, updatedAt: serverTimestamp() });
}

// confirmed (or older "processing")  ->  shipped, plus the shipment record (created if none exists, otherwise updated)
export async function markShipped(order, form) {
  assertOnline();
  const cur = await freshOrder(order.id);
  if (!["confirmed", "processing"].includes(cur.status)) throw staleError("This order is now \u201C" + (STATUS_LABEL[cur.status] || cur.status) + "\u201D, so it cannot be marked as shipped. Reload the page.");
  if (!cur.userId) throw Object.assign(new Error("This order has no customer id, so the customer's tracking page could not show the shipment."), { code: "app/no-user" });
  const existing = await latestShipment(cur.id);
  const batch = writeBatch(db), orderRef = doc(db, COL.orders, cur.id);
  batch.update(orderRef, { status: "shipped", updatedAt: serverTimestamp() });
  const est = form.estimatedDeliveryDate ? dateFromIstString(form.estimatedDeliveryDate) : null;
  const common = { courierName: form.courierName, trackingNumber: form.trackingNumber, trackingURL: form.trackingURL, status: "shipped", shippedAt: stampFor(form.shippedOn), deliveredAt: null };
  let shipmentId;
  if (existing) {
    shipmentId = existing.id;
    batch.update(doc(db, COL.shipments, existing.id), { ...common, ...(est ? { estimatedDeliveryDate: est } : {}), updatedAt: serverTimestamp() });
  } else {
    const ref = doc(collection(db, COL.shipments)); shipmentId = ref.id;
    batch.set(ref, { orderId: cur.id, userId: cur.userId, ...common, estimatedDeliveryDate: est, delayReason: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  await batch.commit();
  return { shipmentId, created: !existing };
}

// shipped  ->  delivered, and the shipment (if there is one) becomes delivered with its delivery date
export async function markDelivered(order, form) {
  assertOnline();
  const cur = await freshOrder(order.id);
  if (cur.status !== "shipped") throw staleError("This order is now \u201C" + (STATUS_LABEL[cur.status] || cur.status) + "\u201D, so it cannot be marked as delivered. Reload the page.");
  const existing = await latestShipment(cur.id);
  const batch = writeBatch(db);
  batch.update(doc(db, COL.orders, cur.id), { status: "delivered", updatedAt: serverTimestamp() });
  if (existing) batch.update(doc(db, COL.shipments, existing.id), { status: "delivered", deliveredAt: stampFor(form.deliveredOn), updatedAt: serverTimestamp() });
  await batch.commit();
  return { shipmentUpdated: !!existing };
}
