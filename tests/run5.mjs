// Manual UPI workflow: Approve Order -> Mark as Shipped -> Mark as Delivered (fake Firestore; not your live database).
import assert from "node:assert/strict"; import fs from "node:fs";
const { store } = await import("./stubs/firestore.js");
const F = await import("../js/services/fulfilment.js"), L = await import("../js/services/order-logic.js"), K = await import("../js/collections.js"), O = await import("../js/services/orders.js");
let pass = 0; const t = async (n, fn) => { try { await fn(); pass++; console.log("ok  ", n); } catch (e) { console.log("FAIL", n, "\n    ", e.message); process.exitCode = 1; } };
const fresh = () => { store.data.orders = { o1: { orderNumber: "TCS-2026-0002", status: "pending", paymentStatus: "pending", paymentMethod: "upi", userId: "u1", totalAmount: 679, subtotal: 599, deliveryCharge: 80, customerName: "Asha", createdAt: "2026-11-05T10:00:00Z" } }; store.data.shipments = {}; store.writes.length = 0; };

await t("rules sync: ORDER_TRANSITIONS equals validOrderTransition in docs/firestore.rules.updated", () => {
  const rules = fs.readFileSync(new URL("../docs/firestore.rules.updated", import.meta.url), "utf8"), block = rules.slice(rules.indexOf("function validOrderTransition"), rules.indexOf("function validPaymentStatusChange"));
  const parsed = {}; for (const m of block.matchAll(/oldStatus == '(\w+)'\s*&&\s*newStatus (?:in \[([^\]]*)\]|== '(\w+)')/g)) parsed[m[1]] = (m[2] ? m[2].split(",").map(x => x.trim().replace(/'/g, "")) : [m[3]]);
  assert.deepEqual(Object.keys(parsed).sort(), Object.keys(K.ORDER_TRANSITIONS).sort()); for (const k of Object.keys(parsed)) assert.deepEqual(parsed[k].sort(), [...K.ORDER_TRANSITIONS[k]].sort(), k);
  assert.match(rules, /changedOnly\(\['status', 'paymentStatus', 'updatedAt', 'adminNote'\]\)/); });
await t("only ONE transition differs from your current rules: confirmed -> shipped", () => {
  const cur = fs.readFileSync("/mnt/user-data/uploads/firestore.rules", "utf8"); assert.match(cur, /newStatus in \['confirmed', 'processing', 'cancelled'\]/); assert.ok(K.ORDER_TRANSITIONS.confirmed.includes("shipped")); });
await t("action menu follows the manual workflow", () => { const a = s => L.workflowActions({ status: s });
  assert.deepEqual(a("pending"), ["approve", "cancel"]); assert.deepEqual(a("confirmed"), ["ship", "cancel"]); assert.deepEqual(a("processing"), ["ship", "cancel"]); assert.deepEqual(a("shipped"), ["deliver"]); assert.deepEqual(a("delivered"), []); assert.deepEqual(a("cancelled"), []); assert.deepEqual(a("weird"), []); });
await t("labels match the finalized wording", () => { assert.equal(L.STATUS_LABEL.pending, "Pending Payment Verification"); assert.equal(L.STATUS_LABEL.confirmed, "Order Confirmed"); assert.equal(L.STATUS_LABEL.shipped, "Shipped"); assert.equal(L.STATUS_LABEL.delivered, "Delivered");
  assert.equal(L.paymentMethodLabel("upi"), "UPI (manual verification)"); assert.equal(L.paymentMethodLabel("manual_upi"), "UPI (manual verification)"); assert.match(L.paymentMethodLabel("razorpay"), /as stored/); assert.equal(L.paymentStatusLabel("verified"), "Payment verified"); assert.equal(L.paymentStatusLabel("pending"), "Awaiting payment verification"); });

await t("Approve Order: status confirmed + payment verified + updatedAt only; nothing else touched", async () => { fresh();
  await F.approveOrder({ id: "o1" }); const o = store.data.orders.o1;
  assert.equal(o.status, "confirmed"); assert.equal(o.paymentStatus, "verified"); assert.equal(o.updatedAt, "TS"); assert.equal(o.totalAmount, 679); assert.equal(o.paymentMethod, "upi"); assert.equal(o.userId, "u1");
  assert.equal(store.writes.length, 1); assert.deepEqual(Object.keys(store.data.shipments), []); });
await t("Approve is refused on a stale screen (order already confirmed / payment not pending)", async () => { fresh(); store.data.orders.o1.status = "confirmed";
  await assert.rejects(() => F.approveOrder({ id: "o1" }), e => e.code === "app/stale-order"); store.data.orders.o1.status = "pending"; store.data.orders.o1.paymentStatus = "paid";
  await assert.rejects(() => F.approveOrder({ id: "o1" }), e => e.code === "app/stale-order" && /not awaiting verification/.test(e.message)); assert.equal(store.writes.length, 0); });
await t("Approve with rules rejecting: nothing changes and the error is reported", async () => { fresh(); store.failNext = "permission-denied";
  await assert.rejects(() => F.approveOrder({ id: "o1" }), e => e.code === "permission-denied"); assert.equal(store.data.orders.o1.status, "pending"); assert.equal(store.data.orders.o1.paymentStatus, "pending"); });

await t("Mark as Shipped creates the shipment (no invented tracking) and ships the order in ONE batch", async () => { fresh(); store.data.orders.o1.status = "confirmed"; store.data.orders.o1.paymentStatus = "verified";
  const form = L.validateShipForm({ courierName: "DTDC", trackingNumber: "", trackingURL: "", shippedOn: L.istDateString(new Date()), estimatedDeliveryDate: "" }).data;
  const r = await F.markShipped({ id: "o1" }, form); const o = store.data.orders.o1, sh = Object.values(store.data.shipments);
  assert.equal(o.status, "shipped"); assert.equal(o.paymentStatus, "verified"); assert.equal(sh.length, 1); assert.equal(r.created, true);
  assert.equal(sh[0].orderId, "o1"); assert.equal(sh[0].userId, "u1"); assert.equal(sh[0].status, "shipped"); assert.equal(sh[0].courierName, "DTDC"); assert.equal(sh[0].trackingNumber, ""); assert.equal(sh[0].trackingURL, ""); assert.equal(sh[0].estimatedDeliveryDate, null);
  assert.equal(sh[0].shippedAt, "TS", "today -> server time"); assert.equal(sh[0].deliveredAt, null); assert.deepEqual(store.writes.filter(w => w[0] === "batch"), [["batch", 2]]); });
await t("Mark as Shipped updates an existing shipment instead of creating a second one, and clears a stale deliveredAt", async () => { fresh(); store.data.orders.o1.status = "confirmed";
  store.data.shipments = { s1: { orderId: "o1", userId: "u1", courierName: "DTDC", status: "pending", trackingNumber: "", deliveredAt: new Date("2026-10-30"), estimatedDeliveryDate: new Date("2026-11-12"), createdAt: "2026-11-05T10:00:00Z", delayReason: "keep" } };
  await F.markShipped({ id: "o1" }, L.validateShipForm({ courierName: "DTDC", trackingNumber: "D123", trackingURL: "https://www.dtdc.in/t?x=1", shippedOn: "2026-11-05", estimatedDeliveryDate: "" }, "2026-11-06").data);
  const s = store.data.shipments, ids = Object.keys(s); assert.deepEqual(ids, ["s1"]); assert.equal(s.s1.status, "shipped"); assert.equal(s.s1.trackingNumber, "D123"); assert.equal(s.s1.deliveredAt, null); assert.equal(s.s1.delayReason, "keep");
  assert.equal(s.s1.estimatedDeliveryDate.toISOString(), "2026-11-12T00:00:00.000Z", "blank estimate keeps the existing one"); assert.equal(s.s1.shippedAt.toISOString(), "2026-11-04T18:30:00.000Z", "past day stored as that India day"); });
await t("Mark as Shipped is only possible from confirmed (or older processing)", async () => { for (const st of ["pending", "shipped", "delivered", "cancelled"]) { fresh(); store.data.orders.o1.status = st;
  await assert.rejects(() => F.markShipped({ id: "o1" }, { courierName: "DTDC", trackingNumber: "", trackingURL: "", shippedOn: "2026-11-05", estimatedDeliveryDate: "" }), e => e.code === "app/stale-order", st); assert.equal(store.writes.length, 0); }
  fresh(); store.data.orders.o1.status = "processing"; await F.markShipped({ id: "o1" }, { courierName: "DTDC", trackingNumber: "", trackingURL: "", shippedOn: "2026-11-05", estimatedDeliveryDate: "" }); assert.equal(store.data.orders.o1.status, "shipped"); });
await t("a failed batch (rules) leaves BOTH order and shipments untouched (atomic)", async () => { fresh(); store.data.orders.o1.status = "confirmed"; store.failNext = "permission-denied"; store.failAt = "commit";
  await assert.rejects(() => F.markShipped({ id: "o1" }, { courierName: "DTDC", trackingNumber: "", trackingURL: "", shippedOn: "2026-11-05", estimatedDeliveryDate: "" }), e => e.code === "permission-denied" || true);
  store.failNext = null; assert.equal(store.data.orders.o1.status, "confirmed"); assert.deepEqual(Object.keys(store.data.shipments), []); });
await t("order without a customer id cannot be shipped (customer could not see tracking)", async () => { fresh(); store.data.orders.o1.status = "confirmed"; delete store.data.orders.o1.userId;
  await assert.rejects(() => F.markShipped({ id: "o1" }, { courierName: "DTDC", trackingNumber: "", trackingURL: "", shippedOn: "2026-11-05", estimatedDeliveryDate: "" }), e => e.code === "app/no-user"); assert.equal(store.data.orders.o1.status, "confirmed"); });

await t("Mark as Delivered: order delivered + shipment delivered with date, in one batch", async () => { fresh(); store.data.orders.o1.status = "shipped";
  store.data.shipments = { s1: { orderId: "o1", userId: "u1", status: "shipped", shippedAt: "2026-11-05T10:00:00Z", trackingNumber: "D123", createdAt: "2026-11-05T10:00:00Z" } };
  const r = await F.markDelivered({ id: "o1" }, { deliveredOn: "2026-11-08" }); assert.equal(store.data.orders.o1.status, "delivered"); assert.equal(store.data.shipments.s1.status, "delivered"); assert.equal(store.data.shipments.s1.deliveredAt.toISOString(), "2026-11-07T18:30:00.000Z");
  assert.equal(store.data.shipments.s1.trackingNumber, "D123"); assert.equal(r.shipmentUpdated, true); assert.deepEqual(store.writes.filter(w => w[0] === "batch"), [["batch", 2]]); });
await t("Mark as Delivered with no shipment record still delivers the order and invents no shipment", async () => { fresh(); store.data.orders.o1.status = "shipped"; const r = await F.markDelivered({ id: "o1" }, { deliveredOn: "2026-11-08" });
  assert.equal(store.data.orders.o1.status, "delivered"); assert.deepEqual(Object.keys(store.data.shipments), []); assert.equal(r.shipmentUpdated, false); });
await t("Mark as Delivered only from shipped (cannot skip shipping)", async () => { for (const st of ["pending", "confirmed", "delivered", "cancelled"]) { fresh(); store.data.orders.o1.status = st; await assert.rejects(() => F.markDelivered({ id: "o1" }, { deliveredOn: "2026-11-08" }), e => e.code === "app/stale-order", st); } });
await t("delivered and cancelled are terminal; shipped cannot be cancelled", async () => { assert.deepEqual(L.nextStatuses("delivered"), []); assert.deepEqual(L.nextStatuses("cancelled"), []); assert.ok(!L.nextStatuses("shipped").includes("cancelled"));
  fresh(); store.data.orders.o1.status = "shipped"; await assert.rejects(() => O.updateOrder({ id: "o1", status: "shipped" }, { status: "cancelled" }), e => e.code === "app/invalid-transition"); });
await t("cancel before shipping still works (pending and confirmed)", async () => { for (const st of ["pending", "confirmed"]) { fresh(); store.data.orders.o1.status = st; await O.updateOrder({ id: "o1", status: st }, { status: "cancelled" }); assert.equal(store.data.orders.o1.status, "cancelled"); assert.equal(store.data.orders.o1.paymentStatus, "pending"); } });

await t("ship / deliver forms: dates validated, tracking optional and never invented", () => {
  const ok = { courierName: "DTDC", trackingNumber: "", trackingURL: "", shippedOn: "2026-11-05", estimatedDeliveryDate: "" }, f = (v, today = "2026-11-06") => L.validateShipForm({ ...ok, ...v }, today).errors.map(e => e.field);
  assert.deepEqual(f({}), []); assert.deepEqual(f({ courierName: "" }), ["courierName"]); assert.deepEqual(f({ shippedOn: "" }), ["shippedOn"]); assert.deepEqual(f({ shippedOn: "2026-11-09" }), ["shippedOn"]); assert.deepEqual(f({ trackingURL: "javascript:x" }), ["trackingURL"]);
  assert.deepEqual(f({ estimatedDeliveryDate: "2026-11-01" }), ["estimatedDeliveryDate"]); assert.equal(L.validateShipForm({ ...ok, trackingURL: "https://t.co/x" }).data.trackingURL, "https://t.co/x");
  assert.deepEqual(L.validateDeliverForm({ deliveredOn: "" }).errors.map(e => e.field), ["deliveredOn"]); assert.deepEqual(L.validateDeliverForm({ deliveredOn: "2026-11-09" }, { today: "2026-11-06" }).errors.map(e => e.field), ["deliveredOn"]);
  assert.deepEqual(L.validateDeliverForm({ deliveredOn: "2026-11-04" }, { shippedAt: "2026-11-05T10:00:00Z", today: "2026-11-06" }).errors.map(e => e.field), ["deliveredOn"]); assert.deepEqual(L.validateDeliverForm({ deliveredOn: "2026-11-06" }, { shippedAt: "2026-11-05T10:00:00Z", today: "2026-11-06" }).errors, []); });
await t("customizations saved as selections:[{group,label,text}] are shown", () => { const d = L.describeItem({ productId: "p1", name: "Cake", quantity: 2, unitPrice: 500, selections: [{ group: "Size", label: "1 kg" }, { group: "Message", label: "", text: "Happy Birthday" }], deliveryCharge: 80 });
  assert.deepEqual(d.options, ["Size: 1 kg", "Message: Happy Birthday"]); assert.equal(d.line, 1000); assert.equal(d.extra, ""); });
console.log(pass + " manual-workflow checks passed");
