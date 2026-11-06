import { el, toast, confirmDialog, safeUrl, formatDateTime } from "../common.js";
import { field, input, textarea, check, showErrors, stateBox } from "../ui/forms.js";
import { createUploader } from "../ui/uploader.js";
import { listCategories, createCategory, updateCategory, deleteCategory, productsInCategory, saveOrder } from "../services/categories.js";
import { slugify, SLUG_RE, toNumber } from "../services/product-logic.js";
import { describeError } from "../services/util.js";

export async function render(body) {
  let cats = [], editing = null, busy = false;
  const listBox = el("div", { id: "cat-list" }), formBox = el("section", { class: "card", "aria-labelledby": "cat-form-title" });
  body.append(el("div", { class: "toolbar" }, el("button", { class: "btn", type: "button", text: "Add category", onclick: () => openForm(null) }),
    el("button", { class: "btn btn-quiet", type: "button", text: "Refresh", onclick: () => load() })), formBox, listBox);
  formBox.hidden = true;

  async function load() {
    listBox.replaceChildren(el("p", { class: "muted", role: "status", text: "Loading categories\u2026" }));
    try { cats = await listCategories(); draw(); }
    catch (e) { listBox.replaceChildren(stateBox("Could not load categories", describeError(e), el("button", { class: "btn", type: "button", text: "Try again", onclick: load }))); }
  }
  function draw() {
    if (!cats.length) { listBox.replaceChildren(stateBox("No categories yet", "Add your first category to group products.", el("button", { class: "btn", type: "button", text: "Add category", onclick: () => openForm(null) }))); return; }
    listBox.replaceChildren(el("ul", { class: "rows" }, cats.map((c, i) => {
      const img = safeUrl(c.imageURL);
      const bAct = el("button", { class: "btn btn-quiet btn-small", type: "button", text: c.isActive ? "Deactivate" : "Activate", onclick: () => toggle(c) });
      return el("li", { class: "row-card" },
        img ? el("img", { class: "thumb", src: img, alt: "", loading: "lazy", width: 64, height: 64 }) : el("span", { class: "thumb thumb-empty", "aria-hidden": "true", text: "No image" }),
        el("div", { class: "grow" }, el("p", { class: "row-title wrap", text: c.name || "(unnamed)" }),
          el("p", { class: "small muted wrap", text: "/" + (c.slug || "") + (c.description ? " \u2013 " + c.description : "") }),
          el("p", { class: "small" }, el("span", { class: "badge " + (c.isActive ? "badge-ok" : "badge-off"), text: c.isActive ? "Active" : "Inactive" }), " Order " + (c.sortOrder ?? "\u2014"), " \u2013 updated " + formatDateTime(c.updatedAt))),
        el("div", { class: "row actions" },
          el("button", { class: "btn btn-quiet btn-small", type: "button", "aria-label": "Move " + c.name + " up", text: "Up", disabled: i === 0 || busy, onclick: () => move(i, -1) }),
          el("button", { class: "btn btn-quiet btn-small", type: "button", "aria-label": "Move " + c.name + " down", text: "Down", disabled: i === cats.length - 1 || busy, onclick: () => move(i, 1) }),
          el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Edit", onclick: () => openForm(c) }), bAct,
          el("button", { class: "btn btn-quiet btn-small danger-text", type: "button", text: "Delete", onclick: () => remove(c) })));
    })));
  }
  async function guarded(fn) {
    if (busy) return; busy = true; draw();
    try { await fn(); } catch (e) { toast(describeError(e), "error"); } finally { busy = false; draw(); }
  }
  const move = (i, d) => guarded(async () => {
    const next = cats.slice(); [next[i], next[i + d]] = [next[i + d], next[i]];
    await saveOrder(next); toast("Order saved.", "success"); cats = await listCategories();
  });
  const toggle = c => guarded(async () => {
    if (c.isActive && !await confirmDialog({ title: "Deactivate " + c.name + "?", message: "Inactive categories are hidden from the public store. Products stay as they are.", confirmText: "Deactivate" })) return;
    await updateCategory(c.id, { isActive: !c.isActive }); toast(c.name + (c.isActive ? " deactivated." : " activated."), "success"); cats = await listCategories();
  });
  const remove = c => guarded(async () => {
    let used = [];
    try { used = await productsInCategory(c.id); }
    catch (e) { toast("Could not check which products use this category, so it was not deleted. " + describeError(e), "error"); return; }
    if (used.length) {
      await confirmDialog({ title: "Category is in use", confirmText: "OK",
        message: used.length + (used.length >= 50 ? "+" : "") + " product(s) use \u201C" + c.name + "\u201D (" + used.slice(0, 5).map(p => p.name || p.id).join(", ") + (used.length > 5 ? ", \u2026" : "") + "). Move them to another category first, or deactivate this category instead." });
      return;
    }
    if (!await confirmDialog({ title: "Delete " + c.name + "?", message: "No products use this category. This cannot be undone.", confirmText: "Delete", danger: true })) return;
    await deleteCategory(c.id); toast("Category deleted.", "success"); cats = await listCategories();
    if (editing && editing.id === c.id) formBox.hidden = true;
  });

  function openForm(c) {
    editing = c; formBox.hidden = false; let imageURL = c ? (c.imageURL || "") : "", slugTouched = !!c;
    const name = input({ value: c ? c.name || "" : "", maxlength: 80, required: true }), slug = input({ value: c ? c.slug || "" : "", maxlength: 100 });
    const desc = textarea({ rows: 2, maxlength: 300 }); desc.value = c ? c.description || "" : "";
    const order = input({ type: "number", inputmode: "numeric", step: 1, value: c ? String(c.sortOrder ?? 0) : String(cats.length + 1) });
    const active = check("Active (visible on the public store)", c ? c.isActive : true);
    const prev = el("div", { class: "img-preview" }), draw2 = () => {
      const u = safeUrl(imageURL); prev.replaceChildren(...[u ? el("img", { src: u, alt: "Category image preview", width: 96, height: 96 }) : el("span", { class: "muted small", text: "No image" }),
        u ? el("button", { type: "button", class: "btn btn-quiet btn-small", text: "Remove image", onclick: () => { imageURL = ""; draw2(); } }) : null].filter(Boolean));}; draw2();
    const up = createUploader({ multiple: false, onUploaded: u => { imageURL = u; draw2(); } });
    name.addEventListener("input", () => { if (!slugTouched) slug.value = slugify(name.value); });
    slug.addEventListener("input", () => { slugTouched = true; });
    const save = el("button", { class: "btn", type: "submit", text: c ? "Save changes" : "Create category" });
    const form = el("form", { novalidate: true }, field("Name", name, { name: "name" }), field("Slug", slug, { name: "slug", hint: "Used in the web address. Lowercase letters, numbers, hyphens." }),
      field("Description", desc, { name: "description" }), field("Display order", order, { name: "sortOrder", hint: "Lower numbers appear first." }),
      el("div", { class: "field" }, el("span", { class: "label-like", text: "Image" }), prev, up.element), el("div", { class: "field" }, active.node),
      el("div", { class: "row" }, save, el("button", { class: "btn btn-quiet", type: "button", text: "Cancel", onclick: () => { formBox.hidden = true; } })));
    form.addEventListener("submit", async ev => {
      ev.preventDefault(); if (busy) return;
      const errs = [], n = name.value.trim(), s = slug.value.trim(), so = order.value.trim() === "" ? 0 : toNumber(order.value);
      if (!n) errs.push({ field: "name", msg: "Enter a category name." });
      if (!SLUG_RE.test(s)) errs.push({ field: "slug", msg: "Use lowercase letters, numbers and single hyphens." });
      if (!Number.isInteger(so)) errs.push({ field: "sortOrder", msg: "Use a whole number." });
      if (s && cats.some(x => x.slug === s && (!c || x.id !== c.id))) errs.push({ field: "slug", msg: "Another category already uses this slug." });
      showErrors(form, errs); if (errs.length) return;
      const dup = cats.find(x => (x.name || "").trim().toLowerCase() === n.toLowerCase() && (!c || x.id !== c.id));
      if (dup && !await confirmDialog({ title: "Similar name exists", message: "A category named \u201C" + dup.name + "\u201D already exists. Save anyway?", confirmText: "Save anyway" })) return;
      busy = true; save.disabled = true; save.textContent = "Saving\u2026";
      const data = { name: n, slug: s, description: desc.value.trim(), imageURL, sortOrder: so, isActive: active.input.checked };
      try {
        if (c) await updateCategory(c.id, data); else await createCategory({ ...data });
        toast("Category saved.", "success"); formBox.hidden = true; cats = await listCategories();
      } catch (e) {
        toast((imageURL && imageURL !== (c && c.imageURL) ? "The image is uploaded to Cloudinary but the category was NOT saved. " : "") + describeError(e), "error");
      } finally { busy = false; save.disabled = false; save.textContent = c ? "Save changes" : "Create category"; draw(); }
    });
    formBox.replaceChildren(el("h2", { id: "cat-form-title", text: c ? "Edit category" : "New category" }), form); name.focus();
    formBox.scrollIntoView({ block: "nearest" });
  }
  await load();
}
