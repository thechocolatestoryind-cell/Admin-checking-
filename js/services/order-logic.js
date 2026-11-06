// Pure order/shipment/payment helpers (no Firebase import, testable in Node).
import { ORDER_TRANSITIONS } from "../collections.js";

export const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
export const STATUS_LABEL = { pending: "Pending Payment Verification", confirmed: "Order Confirmed", processing: "Processing (older orders)", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" };
const humanize = v => (v ? String(v).replace(/_/g, " ").replace(/^./, c => c.toUpperCase()) : "Unknown");
export const PAYMENT_LABEL = { pending: "Awaiting payment verification", verified: "Payment verified" };
export const paymentStatusLabel = s => PAYMENT_LABEL[String(s || "").toLowerCase()] || humanize(s);
// New orders use manual UPI. Older orders keep whatever method they were saved with, shown as stored.
export const paymentMethodLabel = m => /upi/i.test(String(m || "")) ? "UPI (manual verification)" : (m ? humanize(m) + " (as stored)" : "Not recorded");
// Shipment status words are chosen by this admin (the export only shows "pending"); documented in the data contract.
export const SHIPMENT_STATUSES = ["pending", "shipped", "in_transit", "delayed", "delivered"];
export const SHIPMENT_LABEL = { pending: "Not shipped yet", shipped: "Shipped", in_transit: "In transit", delayed: "Delayed", delivered: "Delivered" };
export const COURIERS = ["DTDC", "Other"];

export const nextStatuses = s => (ORDER_TRANSITIONS[s] || []).filter(x => x !== s);
export const ms = v => { if (!v) return NaN; const d = typeof v.toDate === "function" ? v.toDate() : new Date(v); return d.getTime(); };
export const byNewest = (a, b) => (ms(b.createdAt) || 0) - (ms(a.createdAt) || 0);

// India local calendar date helpers (IST has no daylight saving: fixed +05:30).
const ist = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
export const istDateString = v => { const t = ms(v); return Number.isFinite(t) ? ist.format(new Date(t)) : ""; };
export const dateFromIstString = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(new Date(s + "T00:00:00+05:30")) ? new Date(s + "T00:00:00+05:30") : null;
export function deliveryWindow(orderDate, { min, max }) {
  const t = ms(orderDate); if (!Number.isFinite(t)) return null;
  return { from: new Date(t + min * 86400000), to: new Date(t + max * 86400000) };
}

export function phoneDigits(raw) { return String(raw || "").replace(/\D/g, ""); }
// 10-digit numbers are treated as Indian mobiles (all addresses are India-only); anything else is used as given.
export function whatsappDigits(raw) { const d = phoneDigits(raw); return d.length === 10 ? "91" + d : (d.length >= 11 && d.length <= 15 ? d : ""); }

export function orderMatches(o, { text = "", status = "", pay = "", from = "", to = "" } = {}) {
  const t = text.trim().toLowerCase();
  if (t) {
    const hay = [o.orderNumber, o.customerName, o.customerEmail, o.customerPhone, o.shippingAddress && o.shippingAddress.phone, o.shippingAddress && o.shippingAddress.fullName, o.id];
    if (!hay.some(x => String(x || "").toLowerCase().includes(t))) return false;
  }
  if (status && o.status !== status) return false;
  if (pay && o.paymentStatus !== pay) return false;
  const c = ms(o.createdAt), f = dateFromIstString(from), e = dateFromIstString(to);
  if (f && !(c >= f.getTime())) return false;
  if (e && !(c < e.getTime() + 86400000)) return false;
  return true;
}

// Order items have no confirmed shape yet, so this reads common key names and keeps unknown keys visible.
export function describeItem(it) {
  if (!it || typeof it !== "object") return { name: String(it ?? ""), qty: null, unit: null, line: null, options: [], extra: "" };
  const known = new Set(["name", "productName", "title", "quantity", "qty", "price", "unitPrice", "basePrice", "lineTotal", "total", "selections", "selectedOptions", "options", "productId", "image", "imageURL", "primaryImage", "key", "deliveryCharge"]);
  const qty = Number(it.quantity ?? it.qty), unit = Number(it.unitPrice ?? it.price ?? it.basePrice);
  // The storefront saves customizations as selections:[{ group, label, text? }]; older/other shapes are read too.
  const opts = it.selections ?? it.selectedOptions ?? it.options; let options = [];
  const one = o => { if (o == null) return ""; if (typeof o !== "object") return String(o); const g = o.group ?? o.name ?? o.option ?? "", v = o.text || o.label || o.value || o.choice || ""; return [g, v].filter(Boolean).join(": "); };
  if (Array.isArray(opts)) options = opts.map(one);
  else if (opts && typeof opts === "object") options = Object.entries(opts).map(([k, v]) => k + ": " + (typeof v === "object" ? JSON.stringify(v) : v));
  const extraObj = Object.fromEntries(Object.entries(it).filter(([k]) => !known.has(k)));
  const line = Number(it.lineTotal ?? it.total);
  return { name: String(it.name ?? it.productName ?? it.title ?? "Item"), qty: Number.isFinite(qty) ? qty : null, unit: Number.isFinite(unit) ? unit : null,
    line: Number.isFinite(line) ? line : (Number.isFinite(qty) && Number.isFinite(unit) ? qty * unit : null), options: options.filter(Boolean),
    extra: Object.keys(extraObj).length ? JSON.stringify(extraObj).slice(0, 200) : "" };
}

export function safeTrackingUrl(u) {
  const s = String(u || "").trim(); if (!s) return "";
  try { const x = new URL(s); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch (_) { return null; }
}

// v: raw form values. Returns {errors:[{field,msg}], data}. Dates are "YYYY-MM-DD" strings (India calendar day).
export function validateShipment(v) {
  const errors = [], add = (field, msg) => errors.push({ field, msg });
  const orderId = String(v.orderId || "").trim(); if (!orderId) add("orderId", "Choose the order this shipment belongs to.");
  const courierName = String(v.courierName || "").trim(); if (!courierName || courierName.length > 60) add("courierName", "Enter the courier name (up to 60 characters).");
  const trackingNumber = String(v.trackingNumber || "").trim(); if (trackingNumber.length > 60) add("trackingNumber", "Tracking number is too long.");
  const rawUrl = String(v.trackingURL || "").trim(), trackingURL = safeTrackingUrl(rawUrl);
  if (trackingURL === null || rawUrl.length > 500) add("trackingURL", "Enter a full link starting with https:// (or leave it empty).");
  if (!SHIPMENT_STATUSES.includes(v.status)) add("status", "Choose a status.");
  const d = k => { const s = String(v[k] || "").trim(); if (!s) return null; const x = dateFromIstString(s); if (!x) add(k, "Enter a valid date."); return x; };
  const estimatedDeliveryDate = d("estimatedDeliveryDate"), shippedAt = d("shippedAt"), deliveredAt = d("deliveredAt");
  if (["shipped", "in_transit", "delayed", "delivered"].includes(v.status) && !shippedAt && !errors.some(e => e.field === "shippedAt")) add("shippedAt", "Enter the date it was handed to the courier.");
  if (v.status === "delivered" && !deliveredAt && !errors.some(e => e.field === "deliveredAt")) add("deliveredAt", "Enter the delivery date.");
  if (v.status !== "delivered" && deliveredAt) add("deliveredAt", "Only set a delivery date when the status is Delivered.");
  if (shippedAt && deliveredAt && deliveredAt < shippedAt) add("deliveredAt", "Delivery cannot be before the shipped date.");
  const delayReason = String(v.delayReason || "").trim(); if (delayReason.length > 300) add("delayReason", "Up to 300 characters.");
  return { errors, data: { orderId, userId: String(v.userId || ""), courierName, trackingNumber, trackingURL: trackingURL || "", status: v.status, estimatedDeliveryDate, shippedAt, deliveredAt, delayReason } };
}

// Warnings only: nothing here changes any other record.
export function shipmentWarnings(order, shipments) {
  const w = [], list = shipments || [];
  if (list.some(s => s.status === "pending" && (s.shippedAt || s.deliveredAt))) w.push("A shipment says it is not shipped yet but has a shipped or delivered date stored.");
  if (!order) return w;
  const live = list.filter(s => s.status !== "pending");
  if (order.status === "cancelled" && list.length) w.push("This order is cancelled but has a shipment record.");
  if (["shipped", "delivered"].includes(order.status) && !list.length) w.push("The order is " + order.status + " but no shipment record exists.");
  if (order.status === "shipped" && list.length && !live.length) w.push("The order is shipped but its shipment still says not shipped.");
  if (["pending", "confirmed", "processing"].includes(order.status) && live.length) w.push("A shipment says it has shipped, but the order is still \u201C" + (STATUS_LABEL[order.status] || order.status) + "\u201D. Use Mark as Shipped on the order page so the customer's tracking page updates.");
  if (order.status === "delivered" && list.length && !list.some(s => s.status === "delivered")) w.push("The order is delivered but no shipment is marked Delivered.");
  if (list.some(s => s.userId && order.userId && s.userId !== order.userId)) w.push("A shipment's customer id differs from the order's.");
  return w;
}

/* ---------- manual workflow: which actions an order offers ---------- */
// Approve Order -> Mark as Shipped -> Mark as Delivered, plus Cancel while nothing has shipped.
// "processing" only exists on older orders; it can still be shipped (allowed by the rules).
export function workflowActions(order) {
  const st = order && order.status, a = [];
  if (st === "pending") a.push("approve");
  if (st === "confirmed" || st === "processing") a.push("ship");
  if (st === "shipped") a.push("deliver");
  if (["pending", "confirmed", "processing"].includes(st)) a.push("cancel");
  return a;
}
export const isTodayIst = s => s === istDateString(new Date());

// Forms for Mark as Shipped / Mark as Delivered. Dates are India calendar days ("YYYY-MM-DD"); future dates are refused.
export function validateShipForm(v, today = istDateString(new Date())) {
  const errors = [], add = (field, msg) => errors.push({ field, msg });
  const courierName = String(v.courierName || "").trim(); if (!courierName || courierName.length > 60) add("courierName", "Enter the courier name (up to 60 characters).");
  const trackingNumber = String(v.trackingNumber || "").trim(); if (trackingNumber.length > 60) add("trackingNumber", "Tracking number is too long.");
  const rawUrl = String(v.trackingURL || "").trim(), trackingURL = safeTrackingUrl(rawUrl);
  if (trackingURL === null || rawUrl.length > 500) add("trackingURL", "Enter a full link starting with https:// (or leave it empty).");
  const shippedOn = String(v.shippedOn || "").trim();
  if (!dateFromIstString(shippedOn)) add("shippedOn", "Enter the date it was handed to the courier.");
  else if (shippedOn > today) add("shippedOn", "The shipped date cannot be in the future.");
  const est = String(v.estimatedDeliveryDate || "").trim();
  if (est && !dateFromIstString(est)) add("estimatedDeliveryDate", "Enter a valid date or leave it empty.");
  else if (est && dateFromIstString(shippedOn) && est < shippedOn) add("estimatedDeliveryDate", "The estimate cannot be before the shipped date.");
  return { errors, data: { courierName, trackingNumber, trackingURL: trackingURL || "", shippedOn, estimatedDeliveryDate: est } };
}
export function validateDeliverForm(v, { shippedAt = null, today = istDateString(new Date()) } = {}) {
  const errors = [], deliveredOn = String(v.deliveredOn || "").trim();
  if (!dateFromIstString(deliveredOn)) errors.push({ field: "deliveredOn", msg: "Enter the delivery date." });
  else if (deliveredOn > today) errors.push({ field: "deliveredOn", msg: "The delivery date cannot be in the future." });
  else { const sh = istDateString(shippedAt); if (sh && deliveredOn < sh) errors.push({ field: "deliveredOn", msg: "Delivery cannot be before the shipped date (" + sh + ")." }); }
  return { errors, data: { deliveredOn } };
}
