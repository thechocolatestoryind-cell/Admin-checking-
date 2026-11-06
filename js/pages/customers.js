import { el, formatDateTime, formatINR } from "../common.js";
import { input, select, stateBox } from "../ui/forms.js";
import { badge, kv, orderBadge, note, pager } from "../ui/bits.js";
import { listUsers, getUser, addressesFor } from "../services/users.js";
import { ordersForUser } from "../services/orders.js";
import { describeError } from "../services/util.js";

export async function render(body) {
  const raw = new URLSearchParams(location.search).get("id");
  if (raw) return detail(body, /^[A-Za-z0-9_-]{1,128}$/.test(raw) ? raw : null);
  let users = [];
  const search = input({ type: "search", placeholder: "Name, email or phone", "aria-label": "Search customers" }), fAct = select([["", "Any status"], ["active", "Active"], ["inactive", "Inactive"]], "");
  for (const c of [search, fAct]) c.addEventListener("input", draw);
  const count = el("p", { class: "small muted", role: "status", "aria-live": "polite" }), list = el("div");
  body.append(note("Customer profiles are read-only here. Only the details needed to support orders are shown."), el("div", { class: "toolbar" }, el("button", { class: "btn btn-quiet", type: "button", text: "Refresh", onclick: load })), el("div", { class: "filters" }, search, fAct), count, list);
  async function load() {
    list.replaceChildren(el("p", { class: "muted", role: "status", text: "Loading customers\u2026" }));
    try { users = await listUsers(); draw(); } catch (e) { list.replaceChildren(stateBox("Could not load customers", describeError(e), el("button", { class: "btn", type: "button", text: "Try again", onclick: load }))); }
  }
  function draw() {
    const t = search.value.trim().toLowerCase();
    const rows = users.filter(u => (!t || [u.displayName, u.email, u.phoneNumber].some(v => String(v || "").toLowerCase().includes(t))) && (!fAct.value || (fAct.value === "active") === (u.isActive !== false)));
    count.textContent = "Showing " + rows.length + " of " + users.length + " customers.";
    if (!users.length) { list.replaceChildren(stateBox("No customers yet", "Profiles appear after people sign in on the storefront.")); return; }
    if (!rows.length) { list.replaceChildren(stateBox("No customers match", "Try clearing a filter or the search.")); return; }
    pager(rows, 30, u => el("li", { class: "row-card" }, el("div", { class: "grow" },
      el("p", { class: "row-title wrap" }, el("a", { href: "customers.html?id=" + encodeURIComponent(u.id), text: (u.displayName || "").trim() || u.email || u.id })),
      el("p", { class: "small wrap muted", text: [u.email, u.phoneNumber].filter(Boolean).join(" \u2013 ") }), el("p", { class: "small muted", text: "Joined " + formatDateTime(u.createdAt) }),
      el("p", { class: "badges" }, badge(u.isActive === false ? "Inactive" : "Active", u.isActive === false ? "badge-off" : "badge-ok"))),
      el("a", { class: "btn btn-quiet btn-small", href: "customers.html?id=" + encodeURIComponent(u.id), text: "Open" })), list);
  }
  await load();
}

async function detail(body, uid) {
  const back = el("a", { class: "btn", href: "customers.html", text: "Back to customers" });
  if (!uid) { body.append(stateBox("Invalid customer link", "", back)); return; }
  let user; body.append(el("p", { class: "muted", role: "status", text: "Loading customer\u2026" }));
  try { user = await getUser(uid); } catch (e) { body.replaceChildren(stateBox("Could not load this customer", describeError(e), back)); return; }
  if (!user) { body.replaceChildren(stateBox("Customer not found", "", back)); return; }
  const addrBox = el("section", { class: "card" }, el("h2", { text: "Saved addresses" }), el("p", { class: "muted", text: "Loading\u2026" }));
  const ordBox = el("section", { class: "card" }, el("h2", { text: "Orders" }), el("p", { class: "muted", text: "Loading\u2026" }));
  body.replaceChildren(el("div", { class: "toolbar" }, back), el("div", { class: "detail-grid" },
    el("div", { class: "col" }, el("section", { class: "card" }, el("h2", { text: (user.displayName || "").trim() || "Customer" }),
      kv([["Email", user.email], ["Phone", user.phoneNumber], ["Status", user.isActive === false ? "Inactive" : "Active"], ["Joined", formatDateTime(user.createdAt)]])), addrBox), el("div", { class: "col" }, ordBox)));
  addressesFor(uid).then(list => addrBox.replaceChildren(el("h2", { text: "Saved addresses" }), list.length ? el("ul", { class: "plain" }, list.map(a => el("li", {},
    el("p", { class: "wrap", text: [a.fullName, a.phone].filter(Boolean).join(" \u2013 ") }), el("p", { class: "small wrap", text: [a.addressLine1, a.addressLine2, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(", ") }), a.isDefault ? badge("Default", "badge-info") : null))) : el("p", { class: "muted", text: "No saved addresses." })))
    .catch(e => addrBox.replaceChildren(el("h2", { text: "Saved addresses" }), el("p", { class: "error-text", text: "Could not load addresses. " + describeError(e) })));
  ordersForUser(uid).then(list => ordBox.replaceChildren(el("h2", { text: "Orders" }), list.length ? el("ul", { class: "plain" }, list.map(o => el("li", {},
    el("a", { href: "order-detail.html?id=" + encodeURIComponent(o.id), text: o.orderNumber || o.id }), " ", orderBadge(o.status), el("p", { class: "small muted", text: formatDateTime(o.createdAt) + " \u2013 " + formatINR(o.totalAmount) })))) : el("p", { class: "muted", text: "No orders for this customer." })))
    .catch(e => ordBox.replaceChildren(el("h2", { text: "Orders" }), el("p", { class: "error-text", text: "Could not load orders. " + describeError(e) })));
}
