import { el, formatDateTime, formatINR } from "../common.js";
import { select, stateBox } from "../ui/forms.js";
import { orderBadge, payBadge, pager, tabsBar } from "../ui/bits.js";
import { listOrders } from "../services/orders.js";
import { orderMatches, STATUS_LABEL, paymentStatusLabel } from "../services/order-logic.js";
import { describeError } from "../services/util.js";

export async function render(body) {
  let orders = [];
  const search = el("input", { type: "search", placeholder: "Order number, name, email or phone", "aria-label": "Search orders", autocomplete: "off" });
  const SECTIONS = ["pending", "confirmed", "shipped", "delivered", "cancelled", "processing", "all"];
  const wantStatus = new URLSearchParams(location.search).get("status"); let tab = SECTIONS.includes(wantStatus) ? wantStatus : "pending", tabHost = el("div");
  const fPay = select([["", "Any payment status"]], "");
  const from = el("input", { type: "date", "aria-label": "From date" }), to = el("input", { type: "date", "aria-label": "To date" });
  for (const c of [search, fPay, from, to]) c.addEventListener("input", draw);
  const count = el("p", { class: "small muted", role: "status", "aria-live": "polite" }), list = el("div");
  body.append(el("div", { class: "toolbar" }, el("button", { class: "btn btn-quiet", type: "button", text: "Refresh", onclick: load })), tabHost,
    el("div", { class: "filters" }, search, fPay, el("label", { class: "inline-label" }, "From", from), el("label", { class: "inline-label" }, "To", to)), count, list);

  async function load() {
    list.replaceChildren(el("p", { class: "muted", role: "status", text: "Loading orders\u2026" })); count.textContent = "";
    try {
      orders = await listOrders();
      const pays = [...new Set(orders.map(o => o.paymentStatus).filter(Boolean))].sort(), keep = fPay.value;
      fPay.replaceChildren(el("option", { value: "", text: "Any payment status" }), ...pays.map(p => el("option", { value: p, text: paymentStatusLabel(p) }))); fPay.value = pays.includes(keep) ? keep : "";
      drawTabs(); draw();
    } catch (e) { list.replaceChildren(stateBox("Could not load orders", describeError(e), el("button", { class: "btn", type: "button", text: "Try again", onclick: load }))); }
  }
  function drawTabs() {
    const n = k => orders.filter(o => o.status === k).length, defs = [["pending", STATUS_LABEL.pending, n("pending")], ["confirmed", STATUS_LABEL.confirmed, n("confirmed")], ["shipped", STATUS_LABEL.shipped, n("shipped")],
      ["delivered", STATUS_LABEL.delivered, n("delivered")], ["cancelled", STATUS_LABEL.cancelled, n("cancelled")], ...(n("processing") ? [["processing", STATUS_LABEL.processing, n("processing")]] : []), ["all", "All orders", orders.length]];
    if (!defs.some(d => d[0] === tab)) tab = "all";
    tabHost.replaceChildren(tabsBar(defs, tab, k => { tab = k; draw(); }, "Order sections"));
  }
  function draw() {
    const shown = orders.filter(o => orderMatches(o, { text: search.value, status: tab === "all" ? "" : tab, pay: fPay.value, from: from.value, to: to.value }));
    count.textContent = "Showing " + shown.length + " of " + orders.length + " orders" + (tab === "all" ? "." : " (" + (STATUS_LABEL[tab] || tab) + " and the filters above).");
    if (!orders.length) { list.replaceChildren(stateBox("No orders yet", "Orders appear here after customers check out on the storefront. Orders cannot be created from the admin panel.")); return; }
    if (!shown.length) { list.replaceChildren(stateBox(tab === "pending" && !search.value && !from.value && !to.value && !fPay.value ? "No orders are waiting for payment verification" : "No orders match", tab === "pending" ? "New orders appear here as soon as customers place them." : "Try another section, or clear a filter or the search.")); return; }
    pager(shown, 30, o => {
      const a = o.shippingAddress || {};
      return el("li", { class: "row-card" }, el("div", { class: "grow" },
        el("p", { class: "row-title wrap" }, el("a", { href: "order-detail.html?id=" + encodeURIComponent(o.id), text: o.orderNumber || o.id })),
        el("p", { class: "small wrap", text: (o.customerName || a.fullName || "Unnamed customer") + (a.city ? " \u2013 " + a.city : "") }),
        el("p", { class: "small muted", text: formatDateTime(o.createdAt) }),
        el("p", { class: "badges" }, orderBadge(o.status), payBadge(o.paymentStatus))),
        el("div", { class: "amount" }, el("strong", { text: formatINR(o.totalAmount) }), el("a", { class: "btn btn-quiet btn-small", href: "order-detail.html?id=" + encodeURIComponent(o.id), text: "Open" })));
    }, list);
  }
  await load();
}
