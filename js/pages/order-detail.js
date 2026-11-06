import { el, toast, confirmDialog, formatDateTime, formatDate, formatINR, safeUrl } from "../common.js";
import { textarea, check, stateBox } from "../ui/forms.js";
import { orderBadge, payBadge, shipBadge, kv, flags, note, badge } from "../ui/bits.js";
import { shipDialog, deliverDialog } from "../ui/fulfil-dialogs.js";
import { getOrder, updateOrder } from "../services/orders.js";
import { shipmentsForOrder } from "../services/shipments.js";
import { transactionsForOrder } from "../services/payments.js";
import { approveOrder, markShipped, markDelivered } from "../services/fulfilment.js";
import { workflowActions, STATUS_LABEL, describeItem, whatsappDigits, phoneDigits, shipmentWarnings, paymentStatusLabel, paymentMethodLabel } from "../services/order-logic.js";
import { describeError } from "../services/util.js";
import { BRAND, PAYMENT } from "../config.js";

function failMessage(e) {
  if (["app/stale-order", "app/no-user", "app/not-found", "app/invalid-transition"].includes(e.code)) return e.message;
  if (e.code === "permission-denied") return "Firebase refused this change, so nothing was saved. If the updated Firestore rules (docs/FIRESTORE_RULES_UPDATE.md) are not published yet, Approve Order and Mark as Shipped cannot work. Otherwise the order may have changed since this page opened; reload and check its status.";
  return describeError(e);
}

export async function render(body) {
  const raw = new URLSearchParams(location.search).get("id"), id = raw && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : null;
  const back = el("a", { class: "btn", href: "orders.html", text: "Back to orders" });
  if (!id) { body.append(stateBox("No order selected", "Open an order from the orders list.", back)); return; }
  body.append(el("p", { class: "muted", role: "status", text: "Loading order\u2026" }));
  let order;
  try { order = await getOrder(id); } catch (e) { body.replaceChildren(stateBox("Could not load this order", describeError(e), el("button", { class: "btn", type: "button", text: "Try again", onclick: () => location.reload() }), back)); return; }
  if (!order) { body.replaceChildren(stateBox("Order not found", "It may not exist or the link is wrong.", back)); return; }
  let busy = false, paidChecked = false, ships = null; const root = el("div", { class: "detail-grid" }); body.replaceChildren(root);
  const shipBox = el("section", { class: "card" }, el("h2", { text: "Shipments" }), el("p", { class: "muted", text: "Loading\u2026" }));
  const payBox = el("section", { class: "card" }, el("h2", { text: "Earlier payment records" }), el("p", { class: "muted", text: "Loading\u2026" }));
  const latestShip = () => (ships && ships.list && ships.list[0]) || null;

  async function act(fn, okMsg) {
    if (busy) return; busy = true; draw(); let reload = true;
    try { await fn(); toast(okMsg, "success"); }
    catch (e) { if (e.code === "app/cancelled") reload = false; else toast(failMessage(e), "error"); }   // closing a dialog is not an error
    finally { if (reload) { try { order = (await getOrder(id)) || order; } catch (_) {} paidChecked = false; } busy = false; draw(); if (reload) await loadShips(); }
  }
  async function loadShips() { try { ships = { list: await shipmentsForOrder(id) }; } catch (e) { ships = { list: [], error: "Could not load shipments. " + describeError(e) }; } drawShip(); }

  const approve = () => act(async () => {
    if (!await confirmDialog({ title: "Approve this order?", confirmText: "Approve Order", message: "You are confirming that the full " + formatINR(order.totalAmount) + " has really reached your bank/UPI account. The order becomes Confirmed and payment is recorded as verified. The customer sees the update." })) throw Object.assign(new Error("cancelled"), { code: "app/cancelled" });
    await approveOrder(order);
  }, "Order approved. Payment recorded as verified.");
  const ship = () => act(async () => { const form = await shipDialog(order, latestShip()); if (!form) throw Object.assign(new Error("cancelled"), { code: "app/cancelled" }); await markShipped(order, form); }, "Order marked as shipped.");
  const deliver = () => act(async () => { const form = await deliverDialog(order, latestShip()); if (!form) throw Object.assign(new Error("cancelled"), { code: "app/cancelled" }); await markDelivered(order, form); }, "Order marked as delivered.");
  const cancel = () => act(async () => {
    if (!await confirmDialog({ title: "Cancel this order?", danger: true, confirmText: "Cancel order", message: "This cannot be undone. This app does not refund anything: if the customer already paid, return the money yourself through UPI." })) throw Object.assign(new Error("cancelled"), { code: "app/cancelled" });
    await updateOrder(order, { status: "cancelled" });
  }, "Order cancelled.");

  function copyUpi() { (navigator.clipboard ? navigator.clipboard.writeText(PAYMENT.merchantUpiId) : Promise.reject()).then(() => toast("UPI ID copied.", "success"), () => toast("Could not copy. Select the UPI ID and copy it by hand.", "error")); }

  function draw() {
    const a = order.shippingAddress || {}, items = Array.isArray(order.items) ? order.items : [], acts = workflowActions(order);
    const phone = order.customerPhone || a.phone, email = order.customerEmail, wa = whatsappDigits(phone), tel = phoneDigits(phone);
    const noteBox = textarea({ rows: 3, maxlength: 1000, "aria-label": "Internal note" }); noteBox.value = order.adminNote || "";
    const saveNote = el("button", { class: "btn btn-quiet", type: "button", text: "Save note", disabled: busy, onclick: () => act(() => updateOrder(order, { adminNote: noteBox.value.trim() }), "Note saved.") });
    const buttons = [];
    let verifyBox = null;
    if (acts.includes("approve")) {
      const box = check("I have checked my bank/UPI account and the full amount of " + formatINR(order.totalAmount) + " for this order has been received.", paidChecked); box.input.addEventListener("change", () => { paidChecked = box.input.checked; approveBtn.disabled = busy || !paidChecked; });
      const approveBtn = el("button", { class: "btn", type: "button", text: "Approve Order", disabled: busy || !paidChecked, onclick: approve });
      verifyBox = el("div", { class: "verify-box" }, el("h3", { text: "Verify the payment first" }),
        el("p", { class: "small", text: "The customer was asked to pay by UPI and to send you a payment screenshot and the order details on WhatsApp (" + BRAND.whatsappDisplay + "). That message reaches your phone, not this panel. A screenshot alone is not proof: check the real credit." }),
        el("ol", { class: "small" }, el("li", { text: "Open your bank or UPI app and find the credit of " + formatINR(order.totalAmount) + "." }), el("li", { text: "Check that it matches this order (" + (order.orderNumber || order.id) + ") and the customer's payment." }), el("li", { text: "Tick the box below, then press Approve Order." })),
        el("p", { class: "small" }, "Payee UPI ID: ", el("span", { class: "upi-id", text: PAYMENT.merchantUpiId }), " ", el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Copy", onclick: copyUpi })),
        box.node, approveBtn);
    }
    if (acts.includes("ship")) buttons.push(el("button", { class: "btn", type: "button", disabled: busy, text: "Mark as Shipped", onclick: ship }));
    if (acts.includes("deliver")) buttons.push(el("button", { class: "btn", type: "button", disabled: busy, text: "Mark as Delivered", onclick: deliver }));
    if (acts.includes("cancel")) buttons.push(el("button", { class: "btn btn-danger", type: "button", disabled: busy, text: "Cancel order", onclick: cancel }));
    const sentence = { pending: "Awaiting payment verification. Approve it only after you have confirmed the money arrived.", confirmed: "Payment verified. Mark it as shipped once it has been handed to the courier.", processing: "An older order in the Processing step. It can be marked as shipped.",
      shipped: "On its way. Mark it as delivered once delivery is confirmed.", delivered: "Delivered. No further changes are possible.", cancelled: "Cancelled. No further changes are possible." }[order.status];
    const statusCard = el("section", { class: "card" }, el("h2", { text: "Status" }),
      el("p", { class: "badges" }, orderBadge(order.status), payBadge(order.paymentStatus)),
      el("p", { class: "small muted", text: sentence || "This order has an unrecognised status, so no actions are offered." }),
      verifyBox, buttons.filter(Boolean).length ? el("div", { class: "row" }, buttons.filter(Boolean)) : null,
      note("Nothing here is automatic: every status change happens only when you press a button. Refunds are never issued by this app."),
      el("h3", { text: "Internal note" }), noteBox, saveNote);
    const itemsCard = el("section", { class: "card" }, el("h2", { text: "Items" }),
      items.length ? el("ul", { class: "plain" }, items.map(it => { const d = describeItem(it);
        return el("li", {}, el("strong", { class: "wrap", text: d.name }), el("span", { text: d.qty != null ? "  \u00D7 " + d.qty : "" }),
          d.unit != null ? el("p", { class: "small muted", text: formatINR(d.unit) + " each" + (d.line != null ? " \u2013 line " + formatINR(d.line) : "") }) : null,
          d.options.length ? el("p", { class: "small wrap", text: "Customisation: " + d.options.join(" \u2022 ") }) : null, d.extra ? el("p", { class: "small muted wrap", text: d.extra }) : null); }))
        : el("p", { class: "muted", text: "No item snapshot is stored on this order." }),
      kv([["Subtotal", formatINR(order.subtotal)], ["Delivery", formatINR(order.deliveryCharge)], ["Total payable", formatINR(order.totalAmount)], ["Currency", order.currency]]),
      note("These are the amounts saved when the order was placed. They are never recalculated from today's prices."));
    const custCard = el("section", { class: "card" }, el("h2", { text: "Customer and delivery" }),
      kv([["Name", order.customerName || a.fullName], ["Phone", phone], ["Email", email],
        ["Address", [a.addressLine1, a.addressLine2, a.landmark, a.city, a.state, a.pincode, a.country].filter(Boolean).join(", ")], ["Customer note", order.customerNote]]),
      el("div", { class: "row" },
        wa ? el("a", { class: "btn btn-quiet btn-small", href: "https://wa.me/" + wa, target: "_blank", rel: "noopener noreferrer", text: "Open WhatsApp" }) : null,
        tel.length >= 10 ? el("a", { class: "btn btn-quiet btn-small", href: "tel:+" + (tel.length === 10 ? "91" + tel : tel), text: "Call" }) : null,
        order.userId ? el("a", { class: "btn btn-quiet btn-small", href: "customers.html?id=" + encodeURIComponent(order.userId), text: "Customer profile" }) : null),
      el("p", { class: "small muted", text: "Delivery is estimated at about " + BRAND.deliveryEstimateDays.min + "\u2013" + BRAND.deliveryEstimateDays.max + " days from the order date. It is an estimate, not a guarantee." }));
    const meta = kv([["Order number", order.orderNumber], ["Order ID", order.id], ["Placed", formatDateTime(order.createdAt)], ["Last updated", formatDateTime(order.updatedAt)],
      ["Payment method", paymentMethodLabel(order.paymentMethod)], ["Payment status", paymentStatusLabel(order.paymentStatus)]]);
    root.replaceChildren(el("div", { class: "col" }, statusCard, itemsCard), el("div", { class: "col" }, el("section", { class: "card" }, el("h2", { text: order.orderNumber || "Order" }), meta), custCard, shipBox, payBox));
  }
  function drawShip() {
    if (!ships) return;
    const warn = shipmentWarnings(order, ships.list || []);
    shipBox.replaceChildren(...[el("h2", { text: "Shipments" }),
      ships.error ? el("p", { class: "error-text", text: ships.error }) : (ships.list.length ? el("ul", { class: "plain" }, ships.list.map(s => el("li", {}, el("p", { class: "badges" }, shipBadge(s.status)),
        el("p", { class: "small wrap", text: (s.courierName || "Courier") + (s.trackingNumber ? " \u2013 " + s.trackingNumber : " \u2013 no tracking number yet") }),
        safeUrl(s.trackingURL) ? el("a", { class: "small", href: safeUrl(s.trackingURL), target: "_blank", rel: "noopener noreferrer", text: "Open tracking link" }) : null,
        el("p", { class: "small muted", text: "Shipped " + formatDate(s.shippedAt) + " \u2013 estimated " + formatDate(s.estimatedDeliveryDate) + (s.status === "delivered" ? " \u2013 delivered " + formatDate(s.deliveredAt) : "") })))) : el("p", { class: "muted", text: "No shipment recorded." })),
      flags(warn), el("a", { class: "btn btn-quiet btn-small", href: "shipments.html?order=" + encodeURIComponent(id), text: ships.list && ships.list.length ? "Edit tracking details" : "Add shipment" })].filter(Boolean));
  }
  draw(); loadShips();
  transactionsForOrder(id).then(list => {
    payBox.replaceChildren(...[el("h2", { text: "Earlier payment records" }), note("History from the earlier online-payment setup. Read-only and kept as stored; they play no part in approving an order."),
      list.length ? el("ul", { class: "plain" }, list.map(t => el("li", {}, el("p", { class: "badges" }, badge("Status: " + (t.status || "unknown"))), el("p", { class: "small wrap", text: formatINR(t.amount) + " \u2013 " + (t.provider || "provider not recorded") + " \u2013 " + formatDateTime(t.createdAt) })))) : el("p", { class: "muted", text: "None for this order." })]);
  }).catch(e => payBox.replaceChildren(el("h2", { text: "Earlier payment records" }), el("p", { class: "error-text", text: "Could not load payment records. " + describeError(e) })));
}
