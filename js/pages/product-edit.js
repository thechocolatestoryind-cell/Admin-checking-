import { el, toast, safeUrl } from "../common.js";
import { field, input, textarea, select, check, showErrors, stateBox } from "../ui/forms.js";
import { createUploader } from "../ui/uploader.js";
import { getProduct, createProduct, updateProduct, slugTaken } from "../services/products.js";
import { listCategories } from "../services/categories.js";
import { validateProduct, slugify, isRecognizedOption, isHttpsUrl, LIMITS } from "../services/product-logic.js";
import { describeError } from "../services/util.js";

export async function render(body) {
  const idParam = new URLSearchParams(location.search).get("id");
  const id = idParam && /^[A-Za-z0-9_-]{1,64}$/.test(idParam) ? idParam : null;
  if (idParam && !id) { body.append(stateBox("Invalid product link", "The product id in the address is not valid.", el("a", { class: "btn", href: "products.html", text: "Back to products" }))); return; }
  body.append(el("p", { class: "muted", role: "status", text: "Loading\u2026" }));
  let product = null, cats = [], catWarn = "";
  try {
    if (id) { product = await getProduct(id); if (!product) { body.replaceChildren(stateBox("Product not found", "It may have been deleted.", el("a", { class: "btn", href: "products.html", text: "Back to products" }))); return; } }
    try { cats = await listCategories(); } catch (e) { catWarn = "Categories could not be loaded. " + describeError(e); }
  } catch (e) { body.replaceChildren(stateBox("Could not load this product", describeError(e), el("button", { class: "btn", type: "button", text: "Try again", onclick: () => location.reload() }))); return; }
  body.replaceChildren();

  const p = product || { isActive: true, isAvailable: true, isFeatured: false, productType: "fixed", trackInventory: true, allowBackorder: false, stockQuantity: 0, lowStockThreshold: 3, deliveryCharge: 0, sortOrder: 0, images: [], options: [], tags: [], searchKeywords: [] };
  let images = (p.images || []).filter(x => typeof x === "string"), primary = p.primaryImage || "", options = (p.options || []).map(o => isRecognizedOption(o) ? structuredClone(o) : o);
  let dirty = false, saving = false, slugTouched = !!product; const sessionUploads = new Set();
  const mark = () => { dirty = true; }; addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  const f = {};
  f.name = input({ value: p.name || "", maxlength: LIMITS.name, required: true });
  f.slug = input({ value: p.slug || "", maxlength: LIMITS.slug });
  f.shortDescription = input({ value: p.shortDescription || "", maxlength: LIMITS.shortDescription });
  f.description = textarea({ rows: 6 }); f.description.value = p.description || "";
  f.categoryId = select([["", "No category"], ...cats.map(c => [c.id, c.name + (c.isActive ? "" : " (inactive)")]),
    ...(p.categoryId && !cats.some(c => c.id === p.categoryId) ? [[p.categoryId, "Unknown category (kept)"]] : [])], p.categoryId || "");
  f.productType = select([["fixed", "Fixed (ready-made)"], ["customizable", "Customizable (customer picks options)"]], p.productType || "fixed");
  f.basePrice = input({ type: "number", inputmode: "decimal", step: "0.01", min: 0, value: p.basePrice == null ? "" : String(p.basePrice) });
  f.deliveryCharge = input({ type: "number", inputmode: "decimal", step: "0.01", min: 0, value: p.deliveryCharge == null ? "" : String(p.deliveryCharge) });
  f.stockQuantity = input({ type: "number", inputmode: "numeric", step: 1, min: 0, value: p.stockQuantity == null ? "" : String(p.stockQuantity) });
  f.lowStockThreshold = input({ type: "number", inputmode: "numeric", step: 1, min: 0, value: p.lowStockThreshold == null ? "" : String(p.lowStockThreshold) });
  f.sortOrder = input({ type: "number", inputmode: "numeric", step: 1, value: String(p.sortOrder ?? 0) });
  f.tags = input({ value: (p.tags || []).join(", ") }); f.searchKeywords = input({ value: (p.searchKeywords || []).join(", ") });
  f.seoTitle = input({ value: p.seoTitle || "", maxlength: LIMITS.seoTitle }); f.seoDescription = textarea({ rows: 2, maxlength: LIMITS.seoDescription }); f.seoDescription.value = p.seoDescription || "";
  const c = { trackInventory: check("Track stock for this product", p.trackInventory), allowBackorder: check("Allow orders when out of stock", p.allowBackorder),
    isAvailable: check("Available to order", p.isAvailable !== false), isActive: check("Active (visible on the public store)", p.isActive), isFeatured: check("Featured", p.isFeatured) };
  f.name.addEventListener("input", () => { if (!slugTouched) f.slug.value = slugify(f.name.value); });
  f.slug.addEventListener("input", () => { slugTouched = true; });

  /* images */
  const gallery = el("ul", { class: "gallery" }), imgErr = el("p", { class: "field-error", "data-err-for": "images", role: "alert", hidden: true });
  const urlIn = input({ placeholder: "https://\u2026", "aria-label": "Add image by link", type: "url" });
  function drawImages() {
    gallery.replaceChildren(...images.map((u, i) => el("li", { class: "gal-item" },
      el("img", { src: safeUrl(u) || "", alt: "Product image " + (i + 1), width: 96, height: 96, loading: "lazy" }),
      el("div", { class: "row" },
        el("button", { type: "button", class: "btn btn-small " + (u === (images.includes(primary) ? primary : images[0]) ? "" : "btn-quiet"), text: u === (images.includes(primary) ? primary : images[0]) ? "Main image" : "Make main", onclick: () => { primary = u; mark(); drawImages(); } }),
        el("button", { type: "button", class: "btn btn-quiet btn-small", text: "Left", disabled: i === 0, "aria-label": "Move image " + (i + 1) + " left", onclick: () => { [images[i - 1], images[i]] = [images[i], images[i - 1]]; mark(); drawImages(); } }),
        el("button", { type: "button", class: "btn btn-quiet btn-small", text: "Right", disabled: i === images.length - 1, "aria-label": "Move image " + (i + 1) + " right", onclick: () => { [images[i + 1], images[i]] = [images[i], images[i + 1]]; mark(); drawImages(); } }),
        el("button", { type: "button", class: "btn btn-quiet btn-small danger-text", text: "Remove", onclick: () => { images.splice(i, 1); mark(); drawImages(); } })))));
    if (!images.length) gallery.replaceChildren(el("li", { class: "muted small", text: "No images yet." }));
  }
  const uploader = createUploader({ remaining: () => LIMITS.maxImages - images.length, onUploaded: u => { images.push(u); sessionUploads.add(u); mark(); drawImages(); } });

  /* options */
  const optBox = el("div", { class: "options" }), optErr = el("p", { class: "field-error", "data-err-for": "options", role: "alert", hidden: true });
  function drawOptions() {
    optBox.replaceChildren(...options.map((o, i) => {
      if (!isRecognizedOption(o)) return el("div", { class: "option-card" }, el("p", { class: "small" }, "Existing option in an unrecognised format. It is kept unchanged when you save."),
        el("pre", { class: "raw", text: JSON.stringify(o).slice(0, 300) }), el("button", { type: "button", class: "btn btn-quiet btn-small danger-text", text: "Remove option", onclick: () => { options.splice(i, 1); mark(); drawOptions(); } }));
      const nm = input({ value: o.name, maxlength: 60, "aria-label": "Option name" }); nm.addEventListener("input", () => { o.name = nm.value; mark(); });
      const ty = select([["choice", "Choose from a list"], ["text", "Customer types text"]], o.type, { "aria-label": "Option type" });
      ty.addEventListener("change", () => { o.type = ty.value; if (o.type === "choice" && !Array.isArray(o.choices)) o.choices = [{ label: "", priceAdjustment: 0 }]; mark(); drawOptions(); });
      const rq = check("Required", o.required); rq.input.addEventListener("change", () => { o.required = rq.input.checked; mark(); });
      let inner;
      if (o.type === "text") {
        const ml = input({ type: "number", inputmode: "numeric", value: String(o.maxLength ?? 100), "aria-label": "Maximum characters" }); ml.addEventListener("input", () => { o.maxLength = ml.value; mark(); });
        const pa = input({ type: "number", inputmode: "decimal", step: "0.01", value: String(o.priceAdjustment ?? 0), "aria-label": "Extra price" }); pa.addEventListener("input", () => { o.priceAdjustment = pa.value; mark(); });
        inner = el("div", { class: "grid-2" }, field("Maximum characters", ml), field("Extra price (\u20B9)", pa));
      } else {
        inner = el("div", {}, ...o.choices.map((ch, j) => {
          const lb = input({ value: ch.label, maxlength: 60, "aria-label": "Choice name" }), pa = input({ type: "number", inputmode: "decimal", step: "0.01", value: String(ch.priceAdjustment ?? 0), "aria-label": "Extra price for choice" });
          lb.addEventListener("input", () => { ch.label = lb.value; mark(); }); pa.addEventListener("input", () => { ch.priceAdjustment = pa.value; mark(); });
          return el("div", { class: "choice-row" }, lb, pa, el("button", { type: "button", class: "btn btn-quiet btn-small", text: "Remove", "aria-label": "Remove choice " + (j + 1), onclick: () => { o.choices.splice(j, 1); mark(); drawOptions(); } }));
        }), el("button", { type: "button", class: "btn btn-quiet btn-small", text: "Add choice", onclick: () => { o.choices.push({ label: "", priceAdjustment: 0 }); mark(); drawOptions(); } }),
          el("p", { class: "hint small", text: "Choice price columns: name, then extra price in \u20B9 (0 for none)." }));
      }
      return el("div", { class: "option-card" }, el("div", { class: "grid-2" }, field("Option name", nm), field("Type", ty)), rq.node, inner,
        el("button", { type: "button", class: "btn btn-quiet btn-small danger-text", text: "Remove option", onclick: () => { options.splice(i, 1); mark(); drawOptions(); } }));
    }), options.length ? "" : el("p", { class: "muted small", text: "No options. Add one for sizes, flavours or custom text." }));
  }

  const section = (title, ...kids) => el("section", { class: "card" }, el("h2", { text: title }), ...kids);
  const save = el("button", { class: "btn", type: "submit", text: product ? "Save changes" : "Create product" });
  const banner = el("div", { class: "form-banner", role: "alert", hidden: true });
  const stockNote = el("p", { class: "hint small", text: "Stock numbers here are for your own tracking. Changes made in the browser are not safe against two customers checking out at once; reliable stock holds need a trusted backend." });
  const form = el("form", { novalidate: true }, banner,
    section("Basics", field("Name", f.name, { name: "name" }), field("Slug", f.slug, { name: "slug", hint: "Part of the product's web address. Must be unique." }),
      field("Short description", f.shortDescription, { name: "shortDescription" }), field("Description", f.description, { name: "description" }),
      field("Category", f.categoryId, { name: "categoryId", hint: catWarn || undefined }), field("Type", f.productType, { name: "productType", hint: "Anything fully bespoke belongs in Custom requests, not here." })),
    section("Price and delivery", el("div", { class: "grid-2" }, field("Price (\u20B9)", f.basePrice, { name: "basePrice" }), field("Delivery charge (\u20B9)", f.deliveryCharge, { name: "deliveryCharge", hint: "Charged for this product. 0 means free." }))),
    section("Images", el("div", { class: "field" }, el("span", { class: "label-like", text: "Product images (JPG, PNG or WebP, up to 8 MB each)" }), gallery, imgErr),
      uploader.element, el("div", { class: "field" }, el("label", { for: "add-url", text: "Or add an image by link" }), el("div", { class: "row nowrap" }, Object.assign(urlIn, { id: "add-url" }),
        el("button", { type: "button", class: "btn btn-quiet", text: "Add", onclick: () => { const u = urlIn.value.trim(); if (!isHttpsUrl(u)) { toast("Enter a secure https link.", "error"); return; } if (images.length >= LIMITS.maxImages) { toast("Image limit reached.", "error"); return; } images.push(u); urlIn.value = ""; mark(); drawImages(); } })))),
    section("Options", el("p", { class: "muted small", text: "Sizes, flavours or custom text. Each product has its own options." }), optBox, optErr,
      el("button", { type: "button", class: "btn btn-quiet", text: "Add option", onclick: () => { if (options.length >= LIMITS.maxOptions) { toast("Option limit reached.", "error"); return; } options.push({ name: "", type: "choice", required: false, choices: [{ label: "", priceAdjustment: 0 }] }); mark(); drawOptions(); } })),
    section("Stock", c.trackInventory.node, el("div", { class: "grid-2" }, field("Stock quantity", f.stockQuantity, { name: "stockQuantity" }), field("Low-stock level", f.lowStockThreshold, { name: "lowStockThreshold", hint: "Flagged as low at or below this number." })), c.allowBackorder.node, stockNote),
    section("Visibility", c.isActive.node, c.isAvailable.node, c.isFeatured.node, field("Display order", f.sortOrder, { name: "sortOrder", hint: "Lower numbers first." })),
    section("Search and SEO", field("Tags", f.tags, { name: "tags", hint: "Comma separated." }), field("Search keywords", f.searchKeywords, { name: "searchKeywords", hint: "Comma separated, saved in lowercase." }),
      field("SEO title", f.seoTitle, { name: "seoTitle" }), field("SEO description", f.seoDescription, { name: "seoDescription" })),
    el("div", { class: "sticky-actions" }, save, el("a", { class: "btn btn-quiet", href: "products.html", text: "Back to products" })));
  form.addEventListener("input", mark);
  body.append(form); drawImages(); drawOptions();

  const syncStock = () => { const on = c.trackInventory.input.checked; f.stockQuantity.disabled = f.lowStockThreshold.disabled = c.allowBackorder.input.disabled = !on; };
  c.trackInventory.input.addEventListener("change", syncStock); syncStock();

  form.addEventListener("submit", async ev => {
    ev.preventDefault(); if (saving) return;
    banner.hidden = true;
    const v = { name: f.name.value, slug: f.slug.value, shortDescription: f.shortDescription.value, description: f.description.value, categoryId: f.categoryId.value,
      productType: f.productType.value, basePrice: f.basePrice.value, deliveryCharge: f.deliveryCharge.value, images, primaryImage: primary, options,
      tags: f.tags.value, searchKeywords: f.searchKeywords.value, trackInventory: c.trackInventory.input.checked, stockQuantity: f.stockQuantity.value,
      lowStockThreshold: f.lowStockThreshold.value, allowBackorder: c.allowBackorder.input.checked, isAvailable: c.isAvailable.input.checked,
      isActive: c.isActive.input.checked, isFeatured: c.isFeatured.input.checked, sortOrder: f.sortOrder.value, seoTitle: f.seoTitle.value, seoDescription: f.seoDescription.value };
    const { errors, data } = validateProduct(v);
    if (!c.trackInventory.input.checked && product) { delete data.stockQuantity; delete data.lowStockThreshold; delete data.allowBackorder; } // untouched while tracking is off
    showErrors(form, errors); if (errors.length) { banner.textContent = "Please fix the highlighted fields."; banner.hidden = false; return; }
    saving = true; save.disabled = true; const label = save.textContent; save.textContent = "Saving\u2026";
    try {
      if (await slugTaken(data.slug, id)) { showErrors(form, [{ field: "slug", msg: "Another product already uses this slug." }]); return; }
      if (product) { await updateProduct(id, data); dirty = false; toast("Product saved.", "success"); Object.assign(product, data); }
      else { const newId = await createProduct(data); dirty = false; toast("Product created.", "success"); location.replace("product-edit.html?id=" + encodeURIComponent(newId)); }
    } catch (e) {
      const unsaved = images.filter(u => sessionUploads.has(u)).length;
      banner.textContent = describeError(e) + (unsaved ? " Your " + unsaved + " uploaded image(s) are safe on Cloudinary and still in this form, but the product was NOT saved. Press Save again to retry." : " Nothing was saved.");
      banner.hidden = false; banner.scrollIntoView({ block: "center" });
    } finally { saving = false; save.disabled = false; save.textContent = label; }
  });
}
