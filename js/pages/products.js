import { el, toast, confirmDialog, safeUrl, formatINR } from "../common.js";
import { select, stateBox } from "../ui/forms.js";
import { listProducts, updateProduct, deleteProduct, productUsage } from "../services/products.js";
import { listCategories } from "../services/categories.js";
import { stockStatus } from "../services/product-logic.js";
import { describeError } from "../services/util.js";

const STOCK_LABEL = { in: "In stock", low: "Low stock", out: "Out of stock", backorder: "Backorder", untracked: "Stock not tracked" };
const STOCK_CLASS = { in: "badge-ok", low: "badge-warn", out: "badge-bad", backorder: "badge-warn", untracked: "badge-off" };

export async function render(body) {
  let products = [], cats = [], busy = new Set(), catWarn = "";
  const q = new URLSearchParams(location.search);
  const search = el("input", { type: "search", id: "p-search", placeholder: "Search name, slug or keyword", "aria-label": "Search products", autocomplete: "off" });
  const fCat = select([["", "All categories"]], q.get("category") || ""), fType = select([["", "All types"], ["fixed", "Fixed"], ["customizable", "Customizable"]], "");
  const fStatus = select([["", "Any visibility"], ["active", "Active"], ["inactive", "Inactive"], ["unavailable", "Marked unavailable"]], ["active", "inactive", "unavailable"].includes(q.get("status")) ? q.get("status") : "");
  const fStock = select([["", "Any stock"], ["in", "In stock"], ["low", "Low stock"], ["out", "Out of stock"], ["backorder", "Backorder"], ["untracked", "Not tracked"]], ["in", "low", "out", "backorder", "untracked"].includes(q.get("stock")) ? q.get("stock") : "");
  const fFeat = select([["", "Featured or not"], ["yes", "Featured"], ["no", "Not featured"]], "");
  for (const c of [search, fCat, fType, fStatus, fStock, fFeat]) c.addEventListener("input", draw);
  const count = el("p", { class: "small muted", role: "status", "aria-live": "polite" }), list = el("div");
  body.append(el("div", { class: "toolbar" }, el("a", { class: "btn", href: "product-edit.html", text: "New product" }), el("button", { class: "btn btn-quiet", type: "button", text: "Refresh", onclick: load })),
    el("div", { class: "filters" }, search, fCat, fType, fStatus, fStock, fFeat), count, list);

  async function load() {
    list.replaceChildren(el("p", { class: "muted", role: "status", text: "Loading products\u2026" })); count.textContent = "";
    try {
      products = await listProducts();
      try { cats = await listCategories(); catWarn = ""; } catch (e) { cats = []; catWarn = "Categories could not be loaded, so category names are not shown. " + describeError(e); }
      fCat.replaceChildren(el("option", { value: "", text: "All categories" }), ...cats.map(c => el("option", { value: c.id, text: c.name })));
      fCat.value = q.get("category") && cats.some(c => c.id === q.get("category")) ? q.get("category") : "";
      draw();
    } catch (e) { list.replaceChildren(stateBox("Could not load products", describeError(e), el("button", { class: "btn", type: "button", text: "Try again", onclick: load }))); }
  }
  const catName = id => (cats.find(c => c.id === id) || {}).name || (id ? "Unknown category" : "No category");
  function matches(p) {
    const t = search.value.trim().toLowerCase();
    if (t && ![p.name, p.slug, ...(p.searchKeywords || []), ...(p.tags || [])].some(x => String(x || "").toLowerCase().includes(t))) return false;
    if (fCat.value && p.categoryId !== fCat.value) return false;
    if (fType.value && p.productType !== fType.value) return false;
    if (fStatus.value === "active" && !p.isActive) return false;
    if (fStatus.value === "inactive" && p.isActive) return false;
    if (fStatus.value === "unavailable" && p.isAvailable !== false) return false;
    if (fStock.value && stockStatus(p) !== fStock.value) return false;
    if (fFeat.value === "yes" && !p.isFeatured) return false;
    if (fFeat.value === "no" && p.isFeatured) return false;
    return true;
  }
  function draw() {
    const shown = products.filter(matches).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name)));
    count.textContent = "Showing " + shown.length + " of " + products.length + " products." + (catWarn ? " " + catWarn : "");
    if (!products.length) { list.replaceChildren(stateBox("No products yet", "Add your first product to start building the catalogue.", el("a", { class: "btn", href: "product-edit.html", text: "New product" }))); return; }
    if (!shown.length) { list.replaceChildren(stateBox("No products match", "Try clearing a filter or the search.")); return; }
    list.replaceChildren(el("ul", { class: "rows" }, shown.map(p => {
      const img = safeUrl(p.primaryImage || (p.images || [])[0]), st = stockStatus(p), b = busy.has(p.id);
      return el("li", { class: "row-card" },
        img ? el("img", { class: "thumb", src: img, alt: "", loading: "lazy", width: 64, height: 64 }) : el("span", { class: "thumb thumb-empty", "aria-hidden": "true", text: "No image" }),
        el("div", { class: "grow" },
          el("p", { class: "row-title wrap" }, el("a", { href: "product-edit.html?id=" + encodeURIComponent(p.id), text: p.name || "(unnamed)" })),
          el("p", { class: "small muted wrap", text: catName(p.categoryId) + " \u2013 " + (p.productType || "fixed") }),
          el("p", { class: "small" }, formatINR(p.basePrice) + " + delivery " + formatINR(p.deliveryCharge) + (p.trackInventory ? " \u2013 stock " + (p.stockQuantity ?? 0) : "")),
          el("p", { class: "badges" },
            el("span", { class: "badge " + (p.isActive ? "badge-ok" : "badge-off"), text: p.isActive ? "Active" : "Inactive" }),
            p.isAvailable === false ? el("span", { class: "badge badge-bad", text: "Unavailable" }) : null,
            el("span", { class: "badge " + STOCK_CLASS[st], text: STOCK_LABEL[st] }),
            p.isFeatured ? el("span", { class: "badge badge-info", text: "Featured" }) : null)),
        el("div", { class: "row actions" },
          el("a", { class: "btn btn-quiet btn-small", href: "product-edit.html?id=" + encodeURIComponent(p.id), text: "Edit" }),
          el("button", { class: "btn btn-quiet btn-small", type: "button", disabled: b, text: p.isActive ? "Deactivate" : "Activate", onclick: () => flag(p, { isActive: !p.isActive }, p.isActive ? "deactivated" : "activated") }),
          el("button", { class: "btn btn-quiet btn-small", type: "button", disabled: b, text: p.isAvailable === false ? "Mark available" : "Mark unavailable", onclick: () => flag(p, { isAvailable: p.isAvailable === false }, p.isAvailable === false ? "marked available" : "marked unavailable") }),
          el("button", { class: "btn btn-quiet btn-small danger-text", type: "button", disabled: b, text: "Delete", onclick: () => remove(p) })));
    })));
  }
  async function run(p, fn) {
    if (busy.has(p.id)) return; busy.add(p.id); draw();
    try { await fn(); } catch (e) { toast(describeError(e), "error"); } finally { busy.delete(p.id); draw(); }
  }
  const flag = (p, patch, word) => run(p, async () => {
    if ("isActive" in patch && !patch.isActive && !await confirmDialog({ title: "Deactivate " + p.name + "?", message: "It will be hidden from the public store until you activate it again.", confirmText: "Deactivate" })) return;
    await updateProduct(p.id, patch); Object.assign(p, patch); toast(p.name + " " + word + ".", "success");
  });
  const remove = p => run(p, async () => {
    const u = await productUsage(p.id), notes = [];
    if (u.reviews) notes.push("it has reviews"); if (u.wishlists) notes.push("it is on customer wishlists");
    if (u.reviews === null || u.wishlists === null) notes.push("usage could not be fully checked");
    if (!await confirmDialog({ title: "Delete " + p.name + "?", danger: true, confirmText: "Delete product",
      message: "Past orders keep their own copy of this product, so they are not changed. " + (notes.length ? "Note: " + notes.join(", ") + ". " : "") + "Deactivating is safer if you may sell it again. Deleting cannot be undone." })) return;
    await deleteProduct(p.id); products = products.filter(x => x.id !== p.id); toast("Product deleted.", "success");
  });
  await load();
}
