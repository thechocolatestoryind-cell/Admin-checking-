// Dialogs for the two shipping actions. Both resolve with validated form data, or null if the admin cancels.
import { el, formatDate } from "../common.js";
import { field, input, showErrors } from "./forms.js";
import { validateShipForm, validateDeliverForm, istDateString, deliveryWindow } from "../services/order-logic.js";
import { BRAND } from "../config.js";

function shell(title, intro, body, submitText, validate, resolve) {
  const err = el("p", { class: "form-banner", role: "alert", hidden: true });
  const submit = el("button", { class: "btn", type: "submit", text: submitText });
  const form = el("form", { novalidate: true, method: "dialog" }, el("h2", { id: "ful-title", text: title }), el("p", { text: intro }), err, body,
    el("div", { class: "row end" }, el("button", { class: "btn btn-quiet", type: "button", text: "Cancel", onclick: () => d.close("no") }), submit));
  const d = el("dialog", { class: "dialog dialog-wide", "aria-labelledby": "ful-title" }, form);
  form.addEventListener("submit", ev => { ev.preventDefault(); const { errors, data } = validate(); showErrors(form, errors); err.hidden = !errors.length; err.textContent = errors.length ? "Please fix the highlighted fields." : ""; if (errors.length) return; d.returnValue = "yes"; d.dataset.result = JSON.stringify(data); d.close("yes"); });
  d.addEventListener("close", () => { resolve(d.returnValue === "yes" ? JSON.parse(d.dataset.result) : null); d.remove(); });
  document.body.append(d); d.showModal();
}

export function shipDialog(order, existing) {
  return new Promise(resolve => {
    const today = istDateString(new Date()), win = deliveryWindow(order.createdAt, BRAND.deliveryEstimateDays);
    const courier = input({ value: (existing && existing.courierName) || "DTDC", maxlength: 60 }), tn = input({ value: (existing && existing.trackingNumber) || "", maxlength: 60 });
    const tu = input({ type: "url", value: (existing && existing.trackingURL) || "", placeholder: "https://\u2026" });
    const on = input({ type: "date", value: today, max: today }), est = input({ type: "date", value: existing && existing.estimatedDeliveryDate ? istDateString(existing.estimatedDeliveryDate) : "" });
    const body = el("div", {}, field("Courier", courier, { name: "courierName" }), field("Tracking number (optional)", tn, { name: "trackingNumber", hint: "Leave empty if the courier has not given you one yet. You can add it later in Shipments." }),
      field("Tracking link (optional)", tu, { name: "trackingURL", hint: "Only a real link from the courier. Nothing is made up for you." }),
      el("div", { class: "grid-2" }, field("Handed to courier on", on, { name: "shippedOn" }), field("Estimated delivery (optional)", est, { name: "estimatedDeliveryDate", hint: win ? "Usual window: " + formatDate(win.from) + " to " + formatDate(win.to) + " (6\u20138 days, an estimate)." : "An estimate only." })));
    shell("Mark as Shipped", "Only do this once the parcel has really been handed to the courier. The customer's tracking page will show \u201CShipped\u201D, and the order can no longer be cancelled.", body, "Mark as Shipped",
      () => validateShipForm({ courierName: courier.value, trackingNumber: tn.value, trackingURL: tu.value, shippedOn: on.value, estimatedDeliveryDate: est.value }), resolve);
  });
}

export function deliverDialog(order, shipment) {
  return new Promise(resolve => {
    const today = istDateString(new Date()), on = input({ type: "date", value: today, max: today });
    shell("Mark as Delivered", "Only do this once delivery has actually been confirmed. This is final: a delivered order cannot be changed again.", field("Delivered on", on, { name: "deliveredOn" }), "Mark as Delivered",
      () => validateDeliverForm({ deliveredOn: on.value }, { shippedAt: shipment && shipment.shippedAt }), resolve);
  });
}
