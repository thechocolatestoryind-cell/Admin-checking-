import { el, toast, confirmDialog, formatDate, formatDateTime, safeUrl } from "../common.js";
import { field, input, textarea, select, showErrors, stateBox } from "../ui/forms.js";
import { shipBadge, flags, note, pager } from "../ui/bits.js";
import { listShipments, createShipment, updateShipment, deleteShipment } from "../services/shipments.js";
import { listOrders } from "../services/orders.js";
import { validateShipment, shipmentWarnings, istDateString, deliveryWindow, SHIPMENT_STATUSES, SHIPMENT_LABEL, COURIERS } from "../services/order-logic.js";
import { describeError } from "../services/util.js";
import { BRAND } from "../config.js";

export async function render(body) {
  let ships = [], orders = [], orderErr = "", busy = false, editing = null;
  const q = new URLSearchParams(location.search).get("order"), preset = q && /^[A-Za-z0-9_-]{1,64}$/.test(q) ? q : null;
  const formBox = el("section", { class: "card" }), list = el("div"), fStatus = select([["", "Any status"], ...SHIPMENT_STATUSES.map(s => [s, SHIPMENT_LABEL[s]])], "");
  fStatus.addEventListener("input", draw);
  formBox.hidden = true;
  body.append(note("Tracking details are exactly what you type. No courier account is connected, so this app cannot book a pickup or check live courier status. To ship an order or confirm delivery, use Mark as Shipped / Mark as Delivered on the order page; that updates the order and its shipment together so the customer's tracking page stays correct."),
    el("div", { class: "toolbar" }, el("button", { class: "btn", type: "button", text: "New shipment", onclick: () => openForm(null, null) }), el("button", { class: "btn btn-quiet", type: "button", text: "Refresh", onclick: load }), fStatus), formBox, list);

  const orderOf = id => orders.find(o => o.id === id);
  async function load() {
    list.replaceChildren(el("p", { class: "muted", role: "status", text: "Loading shipments\u2026" }));
    try {
      ships = await listShipments();
      try { orders = await listOrders(); orderErr = ""; } catch (e) { orders = []; orderErr = "Orders could not be loaded, so order numbers and consistency warnings are unavailable. " + describeError(e); }
      draw(); if (preset && !editing && formBox.hidden) { const o = orderOf(preset); if (o) openForm(null, o); else toast("The order from the link was not found.", "error"); }
    } catch (e) { list.replaceChildren(stateBox("Could not load shipments", describeError(e), el("button", { class: "btn", type: "button", text: "Try again", onclick: load }))); }
  }
  function draw() {
    const shown = ships.filter(s => !fStatus.value || s.status === fStatus.value);
    if (!ships.length) { list.replaceChildren(stateBox("No shipments yet", "Add a shipment once an order is handed to the courier.", el("button", { class: "btn", type: "button", text: "New shipment", onclick: () => openForm(null, null) }))); return; }
    if (!shown.length) { list.replaceChildren(stateBox("No shipments match", "Try another status.")); return; }
    const host = el("div"); list.replaceChildren(orderErr ? el("p", { class: "error-text small", text: orderErr }) : "", host);
    pager(shown, 30, s => {
      const o = orderOf(s.orderId), url = safeUrl(s.trackingURL), warn = o ? shipmentWarnings(o, ships.filter(x => x.orderId === s.orderId)) : [];
      return el("li", { class: "row-card" }, el("div", { class: "grow" },
        el("p", { class: "row-title wrap" }, el("a", { href: "order-detail.html?id=" + encodeURIComponent(s.orderId || ""), text: o ? (o.orderNumber || s.orderId) : "Order " + (s.orderId || "(none)") })),
        el("p", { class: "small wrap", text: (s.courierName || "Courier not set") + " \u2013 " + (s.trackingNumber || "no tracking number yet") }),
        url ? el("a", { class: "small", href: url, target: "_blank", rel: "noopener noreferrer", text: "Open tracking link" }) : el("p", { class: "small muted", text: "No tracking link" }),
        el("p", { class: "small muted", text: "Shipped " + formatDate(s.shippedAt) + " \u2013 est. " + formatDate(s.estimatedDeliveryDate) + " \u2013 delivered " + formatDate(s.deliveredAt) }),
        s.delayReason ? el("p", { class: "small wrap", text: "Delay: " + s.delayReason }) : null, el("p", { class: "badges" }, shipBadge(s.status)), flags(warn)),
        el("div", { class: "row actions" }, el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Edit", onclick: () => openForm(s, o) }),
          el("button", { class: "btn btn-quiet btn-small danger-text", type: "button", text: "Delete", onclick: () => remove(s) })));
    }, host);
  }
  async function remove(s) {
    if (busy || !await confirmDialog({ title: "Delete this shipment record?", message: "Only the tracking record is deleted. The order itself is not changed.", confirmText: "Delete", danger: true })) return;
    busy = true;
    try { await deleteShipment(s.id); ships = ships.filter(x => x.id !== s.id); toast("Shipment deleted.", "success"); } catch (e) { toast(describeError(e), "error"); } finally { busy = false; draw(); }
  }
  function openForm(s, o) {
    editing = s; formBox.hidden = false;
    const usable = orders.filter(x => x.status !== "cancelled" || (s && x.id === s.orderId));
    const orderSel = select([["", "Choose an order\u2026"], ...usable.map(x => [x.id, (x.orderNumber || x.id) + " \u2013 " + (x.customerName || "customer") + " (" + x.status + ")"]),
      ...(s && !orderOf(s.orderId) ? [[s.orderId, "Order " + s.orderId + " (not loaded)"]] : [])], s ? s.orderId : (o ? o.id : ""));
    orderSel.disabled = !!s;
    const known = s && COURIERS.includes(s.courierName) ? s.courierName : (s ? "Other" : "DTDC");
    const courier = select(COURIERS.map(c => [c, c]), known), other = input({ value: s && !COURIERS.includes(s.courierName) ? s.courierName || "" : "", maxlength: 60, placeholder: "Courier name" });
    const syncOther = () => { other.closest(".field").hidden = courier.value !== "Other"; }; 
    const tn = input({ value: s ? s.trackingNumber || "" : "", maxlength: 60 }), tu = input({ type: "url", value: s ? s.trackingURL || "" : "", placeholder: "https://\u2026" });
    const st = select(SHIPMENT_STATUSES.map(x => [x, SHIPMENT_LABEL[x]]), s ? s.status : "pending");
    const est = input({ type: "date", value: s ? istDateString(s.estimatedDeliveryDate) : "" }), shp = input({ type: "date", value: s ? istDateString(s.shippedAt) : "" }), dlv = input({ type: "date", value: s ? istDateString(s.deliveredAt) : "" });
    const dr = textarea({ rows: 2, maxlength: 300 }); dr.value = s ? s.delayReason || "" : "";
    const hint = el("p", { class: "hint small" });
    const showHint = () => { const w = deliveryWindow((orderOf(orderSel.value) || {}).createdAt, BRAND.deliveryEstimateDays); hint.textContent = w ? "Typical window for this order: " + formatDate(w.from) + " to " + formatDate(w.to) + " (6\u20138 days after the order date; an estimate, not a promise)." : ""; };
    orderSel.addEventListener("input", showHint); courier.addEventListener("input", syncOther);
    const save = el("button", { class: "btn", type: "submit", text: s ? "Save shipment" : "Create shipment" });
    const form = el("form", { novalidate: true }, field("Order", orderSel, { name: "orderId" }), field("Courier", courier, { name: "courierName", hint: "DTDC is the default." }), field("Courier name", other, { name: "courierName" }),
      field("Tracking number", tn, { name: "trackingNumber", hint: "Leave empty until the courier gives you one." }), field("Tracking link", tu, { name: "trackingURL" }), field("Status", st, { name: "status" }),
      el("div", { class: "grid-2" }, field("Shipped on", shp, { name: "shippedAt" }), field("Estimated delivery", est, { name: "estimatedDeliveryDate" })), hint,
      field("Delivered on", dlv, { name: "deliveredAt" }), field("Delay reason", dr, { name: "delayReason", hint: "Only if the shipment is delayed." }),
      el("div", { class: "row" }, save, el("button", { class: "btn btn-quiet", type: "button", text: "Cancel", onclick: () => { formBox.hidden = true; editing = null; } })));
    syncOther(); showHint();
    form.addEventListener("submit", async ev => {
      ev.preventDefault(); if (busy) return;
      const ord = orderOf(orderSel.value);
      const { errors, data } = validateShipment({ orderId: orderSel.value, userId: ord ? ord.userId : (s ? s.userId : ""), courierName: courier.value === "Other" ? other.value : courier.value,
        trackingNumber: tn.value, trackingURL: tu.value, status: st.value, estimatedDeliveryDate: est.value, shippedAt: shp.value, deliveredAt: dlv.value, delayReason: dr.value });
      if (!s && !data.userId && !errors.length) errors.push({ field: "orderId", msg: "This order has no customer id, so the customer could not see the tracking. Pick another order." });
      showErrors(form, errors); if (errors.length) return;
      if (ord && ord.status === "cancelled" && !await confirmDialog({ title: "Order is cancelled", message: "This order is cancelled. Save a shipment anyway?", confirmText: "Save anyway" })) return;
      busy = true; save.disabled = true; save.textContent = "Saving\u2026";
      try {
        if (s) { const { orderId, userId, ...patch } = data; await updateShipment(s.id, patch); } else await createShipment(data);
        toast("Shipment saved.", "success"); formBox.hidden = true; editing = null; ships = await listShipments();
      } catch (e) { toast("Nothing was saved. " + describeError(e), "error"); } finally { busy = false; save.disabled = false; save.textContent = s ? "Save shipment" : "Create shipment"; draw(); }
    });
    formBox.replaceChildren(el("h2", { text: s ? "Edit shipment" : "New shipment" }), form); formBox.scrollIntoView({ block: "nearest" });
  }
  await load();
}
