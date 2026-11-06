import { el, toast, confirmDialog, formatDateTime, safeUrl } from "../common.js";
import { input, select, stateBox } from "../ui/forms.js";
import { badge, note, pager } from "../ui/bits.js";
import { openImage } from "../ui/lightbox.js";
import { listReviews, setApproved, deleteReview } from "../services/reviews.js";
import { listProducts } from "../services/products.js";
import { listUsers } from "../services/users.js";
import { listOrders } from "../services/orders.js";
import { reviewMatches } from "../services/admin-logic.js";
import { describeError } from "../services/util.js";

export async function render(body) {
  let reviews = [], products = new Map(), users = new Map(), orders = new Set(), warn = [], busy = new Set();
  const want = new URLSearchParams(location.search).get("state");
  const search = input({ type: "search", placeholder: "Review text, product or customer", "aria-label": "Search reviews" });
  const fState = select([["pending", "Waiting for approval"], ["approved", "Approved"], ["all", "All reviews"]], ["pending", "approved", "all"].includes(want) ? want : "pending");
  const fRate = select([["", "Any rating"], ...[5, 4, 3, 2, 1].map(n => [String(n), n + " star" + (n > 1 ? "s" : "")])], "");
  for (const c of [search, fState, fRate]) c.addEventListener("input", draw);
  const count = el("p", { class: "small muted", role: "status", "aria-live": "polite" }), list = el("div");
  body.append(note("Approving sets only the review's isApproved flag. Review text and photos are never edited. Product ratings and review counts are not recalculated by this app (that needs a trusted backend). Because the schema has only isApproved, a review you hide looks the same as one still waiting; this app cannot record a rejection reason."),
    el("div", { class: "toolbar" }, el("button", { class: "btn btn-quiet", type: "button", text: "Refresh", onclick: load })), el("div", { class: "filters" }, search, fState, fRate), count, list);

  async function load() {
    list.replaceChildren(el("p", { class: "muted", role: "status", text: "Loading reviews\u2026" })); warn = [];
    try {
      reviews = await listReviews();
      const [p, u, o] = await Promise.allSettled([listProducts(), listUsers(), listOrders()]);
      products = p.status === "fulfilled" ? new Map(p.value.map(x => [x.id, x.name])) : (warn.push("Product names could not be loaded."), new Map());
      users = u.status === "fulfilled" ? new Map(u.value.map(x => [x.id, x.displayName || x.email])) : (warn.push("Customer names could not be loaded."), new Map());
      orders = o.status === "fulfilled" ? new Set(o.value.map(x => x.id)) : (warn.push("Order links could not be checked."), new Set());
      draw();
    } catch (e) { list.replaceChildren(stateBox("Could not load reviews", describeError(e), el("button", { class: "btn", type: "button", text: "Try again", onclick: load }))); }
  }
  const names = r => ({ product: products.get(r.productId), customer: users.get(r.userId) });
  function draw() {
    const shown = reviews.filter(r => reviewMatches(r, { text: search.value, state: fState.value, rating: fRate.value }, names(r)));
    const pend = reviews.filter(r => r.isApproved !== true).length;
    count.textContent = "Showing " + shown.length + " of " + reviews.length + " reviews. " + pend + " waiting for approval." + (warn.length ? " " + warn.join(" ") : "");
    if (!reviews.length) { list.replaceChildren(stateBox("No reviews yet", "Customer reviews appear here once they are submitted. Reviews cannot be created from the admin panel.")); return; }
    if (!shown.length) { list.replaceChildren(stateBox(fState.value === "pending" ? "Nothing waiting for approval" : "No reviews match", fState.value === "pending" ? "Every review has been handled." : "Try clearing a filter or the search.")); return; }
    pager(shown, 25, r => {
      const urls = (Array.isArray(r.imageURLs) ? r.imageURLs : []).filter(u => safeUrl(u)), b = busy.has(r.id), nm = names(r);
      return el("li", { class: "row-card" }, el("div", { class: "grow" },
        el("p", { class: "badges" }, badge(r.isApproved === true ? "Approved" : "Waiting / hidden", r.isApproved === true ? "badge-ok" : "badge-warn"), badge("\u2605".repeat(Math.max(0, Math.min(5, Number(r.rating) || 0))) + " " + (r.rating ?? "?") + "/5", "badge-info"), r.isVerifiedPurchase ? badge("Marked verified purchase (stored value)", "badge-off") : null),
        el("p", { class: "review-text wrap", text: r.reviewText || "(no text)" }),
        el("p", { class: "small muted wrap", text: "Product: " + (nm.product || (r.productId ? "not found (" + r.productId + ")" : "none")) + " \u2013 Customer: " + (nm.customer || (r.userId ? "unknown (" + r.userId + ")" : "none")) }),
        el("p", { class: "small muted" }, "Order: ", r.orderId && orders.has(r.orderId) ? el("a", { href: "order-detail.html?id=" + encodeURIComponent(r.orderId), text: r.orderId }) : (r.orderId || "none") + (r.orderId ? " (not found)" : ""), " \u2013 " + formatDateTime(r.createdAt)),
        urls.length ? el("div", { class: "row" }, urls.map((u, i) => el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Photo " + (i + 1), "aria-label": "View review photo " + (i + 1), onclick: () => openImage(u, "Review photo " + (i + 1)) }))) : null),
        el("div", { class: "row actions" },
          r.isApproved === true ? el("button", { class: "btn btn-quiet btn-small", type: "button", disabled: b, text: "Hide (unapprove)", onclick: () => set(r, false) }) : el("button", { class: "btn btn-small", type: "button", disabled: b, text: "Approve", onclick: () => set(r, true) }),
          el("button", { class: "btn btn-quiet btn-small danger-text", type: "button", disabled: b, text: "Delete", onclick: () => remove(r) })));
    }, list);
  }
  async function run(r, fn) { if (busy.has(r.id)) return; busy.add(r.id); draw(); try { await fn(); } catch (e) { toast(describeError(e), "error"); } finally { busy.delete(r.id); draw(); } }
  const set = (r, v) => run(r, async () => {
    if (!await confirmDialog({ title: v ? "Approve this review?" : "Hide this review?", message: v ? "It can then be shown publicly by a compatible storefront." : "It will no longer be public. It will look the same as a review that is still waiting.", confirmText: v ? "Approve" : "Hide" })) return;
    await setApproved(r.id, v); r.isApproved = v; toast(v ? "Review approved." : "Review hidden.", "success"); });
  const remove = r => run(r, async () => {
    if (!await confirmDialog({ title: "Delete this review?", message: "Use this only for spam or abuse. It cannot be undone, and the review text and photos are lost.", confirmText: "Delete review", danger: true })) return;
    await deleteReview(r.id); reviews = reviews.filter(x => x.id !== r.id); toast("Review deleted.", "success"); });
  await load();
}
