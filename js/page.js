// Entry point for every private page: guard first, render only after the admin is confirmed.
import { requireAdmin } from "./auth.js";
import { renderShell, registerServiceWorker, el } from "./common.js";
import { PAGES } from "./pages.js";
import { BRAND } from "./config.js";

registerServiceWorker();
const key = document.body.dataset.page;
const page = PAGES[key];
const user = await requireAdmin();           // redirects (and never resolves) unless allowed
const { body, projectId } = renderShell(user, key);

function kv(rows) {
  return el("dl", { class: "kv" }, rows.map(([k, v]) => [el("dt", { text: k }), el("dd", { class: "wrap", text: v })]));
}

const MODULES = { products: "./pages/products.js", "product-edit": "./pages/product-edit.js", categories: "./pages/categories.js",
  orders: "./pages/orders.js", "order-detail": "./pages/order-detail.js", shipments: "./pages/shipments.js", payments: "./pages/payments.js", customers: "./pages/customers.js",
  dashboard: "./pages/dashboard.js", content: "./pages/content.js", reviews: "./pages/reviews.js", "custom-orders": "./pages/custom-orders.js", settings: "./pages/settings.js", "activity-logs": "./pages/activity-logs.js" };

if (MODULES[key]) {
  try { await (await import(MODULES[key])).render(body); }
  catch (e) {
    console.error("Page failed to load", e && e.code);
    body.replaceChildren(el("section", { class: "card" }, el("h2", { text: "This page could not load" }),
      el("p", { text: "Something went wrong while building the page. Reload to try again." }),
      el("button", { class: "btn", type: "button", text: "Reload", onclick: () => location.reload() })));
  }
} else if (key === "dashboard") {
  body.append(
    el("section", { class: "card" }, el("h2", { text: "Foundation is in place" }),
      el("p", { text: "You are signed in and the panel is connected to the Firebase project below. No store data is read yet, so there are no totals to show. Live summaries arrive in Stage 4." }),
      kv([["Signed in as", user.email], ["Firebase project", projectId], ["Currency", BRAND.currency + " (" + BRAND.currencySymbol + ")"], ["Time zone shown", "India Standard Time"]])),
    el("section", { class: "card" }, el("h2", { text: "Build stages" }),
      el("ol", { class: "stages" }, [
        ["Stage 1", "Foundation, sign-in, navigation, installable app", true],
        ["Stage 2", "Products, categories, stock, image upload", false],
        ["Stage 3", "Orders, shipments, payments, customers", false],
        ["Stage 4", "Banners, highlights, reviews, requests, settings, dashboard", false],
        ["Stage 5", "Final checks and ZIP", false]
      ].map(([s, t, done]) => el("li", { class: done ? "done" : "" }, el("strong", { text: s + (done ? " (done)" : "") }), el("span", { text: t }))))));
} else {
  const cols = page.collections || [];
  body.append(el("section", { class: "card" }, el("h2", { text: "Coming in Stage " + page.stage }),
    el("p", { text: "This section is not built yet. Nothing on this page reads or writes data." }),
    cols.length ? el("div", {}, el("h3", { text: "Data it will use" }),
      el("ul", { class: "plain" }, cols.map(([n, a]) => el("li", {}, el("code", { text: n }), " \u2013 " + a)))) : null,
    (page.limits || []).length ? el("div", {}, el("h3", { text: "Limits to expect" }),
      el("ul", { class: "plain" }, page.limits.map(t => el("li", { text: t })))) : null));
}
