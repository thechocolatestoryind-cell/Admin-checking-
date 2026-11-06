import { el } from "../common.js";
import { STATUS_LABEL, SHIPMENT_LABEL, paymentStatusLabel } from "../services/order-logic.js";

export const badge = (text, cls = "badge-off") => el("span", { class: "badge " + cls, text });
const ORDER_CLS = { pending: "badge-warn", confirmed: "badge-info", processing: "badge-info", shipped: "badge-info", delivered: "badge-ok", cancelled: "badge-bad" };
export const orderBadge = s => badge(STATUS_LABEL[s] || (s ? String(s) : "Unknown"), ORDER_CLS[s] || "badge-off");
export const payBadge = s => badge(paymentStatusLabel(s), /^(verified|paid|captured|success)/i.test(s || "") ? "badge-ok" : /fail|refund/i.test(s || "") ? "badge-bad" : "badge-warn");
const SHIP_CLS = { pending: "badge-off", shipped: "badge-info", in_transit: "badge-info", delayed: "badge-warn", delivered: "badge-ok" };
export const shipBadge = s => badge(SHIPMENT_LABEL[s] || String(s || "Unknown"), SHIP_CLS[s] || "badge-off");
export const kv = rows => el("dl", { class: "kv" }, rows.filter(Boolean).map(([k, v]) => [el("dt", { text: k }), el("dd", { class: "wrap" }, v == null || v === "" ? "\u2014" : v)]));
export const flags = list => list.length ? el("ul", { class: "flags", role: "note" }, list.map(t => el("li", { text: t }))) : null;
export const note = text => el("p", { class: "notice-box small", text });
// "Show more" paging for long lists
export function pager(items, per, renderItem, host) {
  let shown = 0;
  const more = el("button", { class: "btn btn-quiet", type: "button", onclick: add }), ul = el("ul", { class: "rows" });
  function add() { items.slice(shown, shown + per).forEach(i => ul.append(renderItem(i))); shown = Math.min(items.length, shown + per); more.hidden = shown >= items.length; more.textContent = "Show more (" + (items.length - shown) + " left)"; }
  add(); host.replaceChildren(ul, more);
}
// Section tabs with counts (used for the order and payment queues). defs: [[key, label, count]]
export function tabsBar(defs, current, onSelect, label) {
  const bar = el("div", { class: "tabs", role: "tablist", "aria-label": label || "Sections" });
  const paint = k => { for (const b of bar.children) { const on = b.dataset.key === k; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; } };
  defs.forEach(([k, t, n]) => bar.append(el("button", { type: "button", role: "tab", class: "tab", "data-key": k, text: t + (n == null ? "" : " (" + n + ")"), onclick: () => { paint(k); onSelect(k); } })));
  bar.addEventListener("keydown", e => { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; const ks = defs.map(d => d[0]), i = ks.indexOf(bar.querySelector("[aria-selected=true]").dataset.key), n = ks[(i + (e.key === "ArrowRight" ? 1 : ks.length - 1)) % ks.length]; paint(n); onSelect(n); bar.querySelector('[data-key="' + n + '"]').focus(); });
  paint(current); return bar;
}
