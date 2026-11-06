import { el, formatDateTime, formatINR } from "../common.js";
import { input, stateBox } from "../ui/forms.js";
import { badge, note, pager, tabsBar, orderBadge, payBadge } from "../ui/bits.js";
import { listTransactions } from "../services/payments.js";
import { listOrders } from "../services/orders.js";
import { paymentMethodLabel } from "../services/order-logic.js";
import { describeError } from "../services/util.js";
import { BRAND, PAYMENT } from "../config.js";

export async function render(body) {
  let orders = [], txs = [], ordersErr = "", txErr = "", tab = new URLSearchParams(location.search).get("view") === "verified" ? "verified" : "awaiting";
  const search = input({ type: "search", placeholder: "Order number, customer name or phone", "aria-label": "Search payments" });
  search.addEventListener("input", draw);
  const count = el("p", { class: "small muted", role: "status", "aria-live": "polite" }), list = el("div"), tabHost = el("div");
  body.append(note("Payments are verified by you, by hand. Customers pay by UPI to " + PAYMENT.merchantUpiId + " and send a screenshot on WhatsApp (" + BRAND.whatsappDisplay + "); that message reaches your phone, not this panel. A screenshot alone is not proof: check your bank or UPI app for the real credit, then open the order and press Approve Order."),
    el("div", { class: "toolbar" }, el("button", { class: "btn btn-quiet", type: "button", text: "Refresh", onclick: load })), tabHost, el("div", { class: "filters" }, search), count, list);

  async function load() {
    list.replaceChildren(el("p", { class: "muted", role: "status", text: "Loading payments\u2026" })); count.textContent = "";
    const [o, t] = await Promise.allSettled([listOrders(), listTransactions()]);
    orders = o.status === "fulfilled" ? o.value : []; ordersErr = o.status === "fulfilled" ? "" : "Orders could not be loaded. " + describeError(o.reason);
    txs = t.status === "fulfilled" ? t.value : []; txErr = t.status === "fulfilled" ? "" : "Older payment records could not be loaded. " + describeError(t.reason);
    drawTabs(); draw();
  }
  const awaiting = () => orders.filter(o => o.status === "pending" && o.paymentStatus === "pending");
  const verified = () => orders.filter(o => o.paymentStatus === "verified");
  function drawTabs() { tabHost.replaceChildren(tabsBar([["awaiting", "Awaiting verification", awaiting().length], ["verified", "Verified", verified().length], ["older", "Older records", txs.length]], tab, k => { tab = k; draw(); }, "Payment sections")); }

  function orderRows(rows, emptyTitle, emptyText) {
    const t = search.value.trim().toLowerCase(), shown = rows.filter(o => !t || [o.orderNumber, o.customerName, o.customerPhone, o.shippingAddress && o.shippingAddress.phone, o.id].some(v => String(v || "").toLowerCase().includes(t)));
    count.textContent = "Showing " + shown.length + " of " + rows.length + ".";
    if (!rows.length) { list.replaceChildren(stateBox(emptyTitle, emptyText)); return; }
    if (!shown.length) { list.replaceChildren(stateBox("Nothing matches", "Try another search.")); return; }
    pager(shown, 30, o => el("li", { class: "row-card" }, el("div", { class: "grow" },
      el("p", { class: "row-title wrap" }, el("a", { href: "order-detail.html?id=" + encodeURIComponent(o.id), text: o.orderNumber || o.id })),
      el("p", { class: "small wrap", text: (o.customerName || "Unnamed customer") + " \u2013 " + paymentMethodLabel(o.paymentMethod) }), el("p", { class: "small muted", text: "Placed " + formatDateTime(o.createdAt) }),
      el("p", { class: "badges" }, orderBadge(o.status), payBadge(o.paymentStatus))),
      el("div", { class: "amount" }, el("strong", { text: formatINR(o.totalAmount) }), el("a", { class: "btn btn-quiet btn-small", href: "order-detail.html?id=" + encodeURIComponent(o.id), text: tab === "awaiting" ? "Verify and approve" : "Open" }))), list);
  }
  function draw() {
    if (tab === "older") {
      if (txErr) { list.replaceChildren(stateBox("Could not load older records", txErr, el("button", { class: "btn", type: "button", text: "Try again", onclick: load }))); count.textContent = ""; return; }
      const t = search.value.trim().toLowerCase(), rows = txs.filter(x => !t || [x.orderId, x.userId, x.id, x.provider, x.status].some(v => String(v || "").toLowerCase().includes(t)));
      count.textContent = "Showing " + rows.length + " of " + txs.length + " older records.";
      if (!txs.length) { list.replaceChildren(stateBox("No older records", "Nothing was kept from the earlier online-payment setup.")); return; }
      if (!rows.length) { list.replaceChildren(stateBox("Nothing matches", "Try another search.")); return; }
      list.replaceChildren(note("History from the earlier online-payment setup. Read-only and shown exactly as stored. They play no part in approving orders, and nothing here is deleted."), el("div"));
      pager(rows, 30, x => el("li", { class: "row-card" }, el("div", { class: "grow" }, el("p", { class: "row-title" }, formatINR(x.amount)), el("p", { class: "badges" }, badge("Status: " + (x.status || "unknown")), badge(x.provider || "provider not recorded")),
        el("p", { class: "small muted", text: "Recorded " + formatDateTime(x.createdAt) }), el("p", { class: "small" }, "Order: ", x.orderId ? el("a", { href: "order-detail.html?id=" + encodeURIComponent(x.orderId), text: x.orderId }) : "none"))), list.lastChild);
      return;
    }
    if (ordersErr) { list.replaceChildren(stateBox("Could not load orders", ordersErr, el("button", { class: "btn", type: "button", text: "Try again", onclick: load }))); count.textContent = ""; return; }
    if (tab === "awaiting") orderRows(awaiting(), "No payments are waiting for verification", "When a customer places an order it shows up here until you approve it.");
    else orderRows(verified(), "No verified payments yet", "Orders appear here after you approve them.");
  }
  await load();
}
