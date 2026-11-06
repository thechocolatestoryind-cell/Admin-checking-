import { el, formatDateTime, formatINR } from "../common.js";
import { stateBox } from "../ui/forms.js";
import { orderBadge, note, badge } from "../ui/bits.js";
import { listOrders } from "../services/orders.js";
import { listProducts } from "../services/products.js";
import { listReviews } from "../services/reviews.js";
import { listRequests } from "../services/requests.js";
import { summarizeOrders, summarizeProducts, summarizeReviews, summarizeRequests } from "../services/admin-logic.js";
import { REQUEST_LABEL } from "../services/admin-logic.js";
import { describeError } from "../services/util.js";

const tile = (n, label, href, tone = "") => el("a", { class: "stat " + tone, href }, el("strong", { text: String(n) }), el("span", { text: label }));
const failed = (title, e, retry) => el("section", { class: "card" }, el("h2", { text: title }), el("p", { class: "error-text", role: "alert", text: describeError(e && e.reason ? e.reason : e) }), el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Retry", onclick: retry }));

export async function render(body) {
  const host = el("div"), when = el("p", { class: "small muted", role: "status" });
  body.append(el("div", { class: "toolbar" }, el("button", { class: "btn btn-quiet", type: "button", text: "Refresh", onclick: load }), when), host);
  async function load() {
    host.replaceChildren(el("p", { class: "muted", role: "status", text: "Loading summaries\u2026" })); when.textContent = "";
    const [o, p, r, q] = await Promise.allSettled([listOrders(), listProducts(), listReviews(), listRequests()]);
    const parts = [];
    if (o.status === "fulfilled") {
      const s = summarizeOrders(o.value), act = s.pending + s.confirmed + s.processing;
      parts.push(el("section", { class: "card" }, el("h2", { text: "Orders" }),
        !s.total ? stateBox("No orders yet", "New orders will appear here after customers check out.") : el("div", { class: "stats" },
          tile(act, "Need your attention", "orders.html", act ? "stat-alert" : ""), tile(s.pending, "Awaiting payment verification", "orders.html?status=pending", s.pending ? "stat-alert" : ""),
          tile(s.confirmed, "Confirmed, ready to ship", "orders.html?status=confirmed"), tile(s.shipped, "Shipped", "orders.html?status=shipped"), tile(s.delivered, "Delivered", "orders.html?status=delivered"),
          tile(s.total, "All orders", "orders.html"), s.cancelled ? tile(s.cancelled, "Cancelled", "orders.html?status=cancelled") : null, s.processing ? tile(s.processing, "Processing (older orders)", "orders.html?status=processing") : null, s.other ? tile(s.other, "Unrecognised status", "orders.html") : null),
        el("p", { class: "small muted", text: "Needs attention = orders awaiting payment verification + confirmed orders not yet shipped." })));
    } else parts.push(failed("Orders", o, load));
    if (p.status === "fulfilled") {
      const s = summarizeProducts(p.value);
      parts.push(el("section", { class: "card" }, el("h2", { text: "Catalogue" }),
        !s.total ? stateBox("No products yet", "Add your first product to start selling.", el("a", { class: "btn", href: "product-edit.html", text: "New product" })) : el("div", { class: "stats" },
          tile(s.active, "Active products", "products.html?status=active"), tile(s.low, "Low stock", "products.html?stock=low", s.low ? "stat-alert" : ""), tile(s.out, "Out of stock", "products.html?stock=out", s.out ? "stat-alert" : ""),
          tile(s.unavailable, "Marked unavailable", "products.html?status=unavailable"), tile(s.inactive, "Inactive", "products.html?status=inactive")),
        el("p", { class: "small muted", text: "Stock figures count active products that track stock. They are the numbers you typed; they are not live inventory." })));
    } else parts.push(failed("Catalogue", p, load));
    const mod = [];
    if (r.status === "fulfilled") { const s = summarizeReviews(r.value); mod.push(tile(s.pending, "Reviews waiting", "reviews.html?state=pending", s.pending ? "stat-alert" : "")); } else mod.push(el("p", { class: "error-text", role: "alert", text: "Reviews: " + describeError(r.reason) }));
    if (q.status === "fulfilled") { const s = summarizeRequests(q.value); mod.push(tile(s.fresh, "New custom requests", "custom-orders.html?status=new", s.fresh ? "stat-alert" : "")); } else mod.push(el("p", { class: "error-text", role: "alert", text: "Requests: " + describeError(q.reason) }));
    parts.push(el("section", { class: "card" }, el("h2", { text: "Waiting for you" }), el("div", { class: "stats" }, mod), (r.status !== "fulfilled" || q.status !== "fulfilled") ? el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Retry", onclick: load }) : null));
    const rec = [];
    if (o.status === "fulfilled" && o.value.length) rec.push(el("section", { class: "card" }, el("h2", { text: "Recent orders" }), el("ul", { class: "plain" }, o.value.slice(0, 5).map(x => el("li", { class: "row between" },
      el("span", { class: "wrap" }, el("a", { href: "order-detail.html?id=" + encodeURIComponent(x.id), text: x.orderNumber || x.id }), " \u2013 " + (x.customerName || "customer"), el("span", { class: "small muted", text: "  " + formatDateTime(x.createdAt) })), el("span", { class: "row" }, orderBadge(x.status), el("strong", { text: formatINR(x.totalAmount) })))))));
    if (q.status === "fulfilled" && q.value.length) rec.push(el("section", { class: "card" }, el("h2", { text: "Recent custom requests" }), el("ul", { class: "plain" }, q.value.slice(0, 5).map(x => el("li", { class: "row between" },
      el("span", { class: "wrap" }, el("a", { href: "custom-orders.html?id=" + encodeURIComponent(x.id), text: (x.customerName || "").trim() || "Unnamed customer" }), el("span", { class: "small muted", text: "  " + formatDateTime(x.createdAt) })), badge(REQUEST_LABEL[x.status] || x.status || "No status", x.status === "new" ? "badge-warn" : "badge-info"))))));
    parts.push(...rec, el("section", { class: "card" }, el("h2", { text: "Go to" }), el("div", { class: "row" }, [["products.html", "Products"], ["orders.html", "Orders"], ["content.html", "Banners & highlights"], ["reviews.html", "Reviews"], ["customers.html", "Customers"], ["settings.html", "Store settings"]].map(([h, t]) => el("a", { class: "btn btn-quiet", href: h, text: t })))),
      note("Figures come from a fresh read when this page opened or when you pressed Refresh; they do not update by themselves. No revenue totals are shown. Times are India Standard Time."));
    host.replaceChildren(...parts); when.textContent = "Loaded " + formatDateTime(new Date());
  }
  await load();
}
