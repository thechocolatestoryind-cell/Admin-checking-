import { el, toast, confirmDialog, safeUrl } from "../common.js";
import { field, input, check, showErrors, stateBox } from "../ui/forms.js";
import { createImageField } from "../ui/imagefield.js";
import { listAll, createItem, updateItem, deleteItem, reorder } from "../services/content.js";
import { validateBanner } from "../services/content-logic.js";
import { COL } from "../collections.js";
import { describeError } from "../services/util.js";

export async function render(host) {
  let items = [], busy = false;
  const formBox = el("section", { class: "card" }), list = el("div"); formBox.hidden = true;
  host.append(el("div", { class: "toolbar" }, el("button", { class: "btn", type: "button", text: "Add banner", onclick: () => openForm(null) }), el("button", { class: "btn btn-quiet", type: "button", text: "Refresh", onclick: load })), formBox, list);

  async function load() {
    list.replaceChildren(el("p", { class: "muted", role: "status", text: "Loading banners\u2026" }));
    try { items = await listAll(COL.banners); draw(); } catch (e) { list.replaceChildren(stateBox("Could not load banners", describeError(e), el("button", { class: "btn", type: "button", text: "Try again", onclick: load }))); }
  }
  function draw() {
    if (!items.length) { list.replaceChildren(stateBox("No banners yet", "Add a banner for the storefront's home page.", el("button", { class: "btn", type: "button", text: "Add banner", onclick: () => openForm(null) }))); return; }
    list.replaceChildren(el("ul", { class: "rows" }, items.map((b, i) => { const img = safeUrl(b.imageURL);
      return el("li", { class: "row-card" }, img ? el("img", { class: "thumb thumb-wide", src: img, alt: "", loading: "lazy", width: 112, height: 64 }) : el("span", { class: "thumb thumb-wide thumb-empty", "aria-hidden": "true", text: "No image" }),
        el("div", { class: "grow" }, el("p", { class: "row-title wrap", text: b.title || "(untitled)" }), el("p", { class: "small muted wrap", text: b.subtitle || "" }),
          el("p", { class: "small wrap muted", text: b.buttonText ? "Button \u201C" + b.buttonText + "\u201D \u2192 " + (b.buttonLink || "no link") : "No button" }),
          el("p", { class: "badges" }, el("span", { class: "badge " + (b.isActive ? "badge-ok" : "badge-off"), text: b.isActive ? "Active" : "Inactive" }), b.mobileImageURL ? el("span", { class: "badge badge-info", text: "Has mobile image" }) : null, el("span", { class: "badge badge-off", text: "Order " + (b.sortOrder ?? "\u2014") }))),
        el("div", { class: "row actions" },
          el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Up", "aria-label": "Move " + b.title + " up", disabled: i === 0 || busy, onclick: () => move(i, -1) }),
          el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Down", "aria-label": "Move " + b.title + " down", disabled: i === items.length - 1 || busy, onclick: () => move(i, 1) }),
          el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Edit", onclick: () => openForm(b) }),
          el("button", { class: "btn btn-quiet btn-small", type: "button", text: b.isActive ? "Deactivate" : "Activate", disabled: busy, onclick: () => toggle(b) }),
          el("button", { class: "btn btn-quiet btn-small danger-text", type: "button", text: "Delete", disabled: busy, onclick: () => remove(b) })));
    })));
  }
  async function run(fn) { if (busy) return; busy = true; draw(); try { await fn(); } catch (e) { toast(describeError(e), "error"); } finally { busy = false; draw(); } }
  const move = (i, d) => run(async () => { const n = items.slice(); [n[i], n[i + d]] = [n[i + d], n[i]]; await reorder(COL.banners, n); toast("Order saved.", "success"); items = await listAll(COL.banners); });
  const toggle = b => run(async () => {
    if (!b.isActive && !b.imageURL) { toast("Add an image (Edit) before activating this banner.", "error"); return; }
    await updateItem(COL.banners, b.id, { isActive: !b.isActive }); toast("Banner " + (b.isActive ? "deactivated." : "activated."), "success"); items = await listAll(COL.banners); });
  const remove = b => run(async () => {
    if (!await confirmDialog({ title: "Delete \u201C" + b.title + "\u201D?", message: "This removes the banner for good. Deactivate it instead if you may use it again.", confirmText: "Delete banner", danger: true })) return;
    await deleteItem(COL.banners, b.id); items = items.filter(x => x.id !== b.id); toast("Banner deleted.", "success"); });

  function openForm(b) {
    formBox.hidden = false;
    const title = input({ value: b ? b.title || "" : "", maxlength: 100 }), sub = input({ value: b ? b.subtitle || "" : "", maxlength: 200 }), bt = input({ value: b ? b.buttonText || "" : "", maxlength: 40 }), bl = input({ value: b ? b.buttonLink || "" : "", placeholder: "/products or https://\u2026" });
    const order = input({ type: "number", step: 1, value: String(b ? b.sortOrder ?? 0 : items.length + 1) }), active = check("Active (visible on the public store)", b ? b.isActive : false);
    const desk = createImageField({ label: "Banner image", name: "imageURL", value: b ? b.imageURL : "", hint: "Wide image shown on desktop and, if no mobile image is set, on phones.", onChange: preview });
    const mob = createImageField({ label: "Mobile image (optional)", name: "mobileImageURL", value: b ? b.mobileImageURL : "", hint: "Tall or square image for phones.", onChange: preview });
    const pv = el("div", { class: "banner-preview", "aria-label": "Banner preview" });
    function preview() { const u = safeUrl(desk.get()), m = safeUrl(mob.get());
      pv.replaceChildren(...[el("p", { class: "small muted", text: "Preview (desktop)" }), el("div", { class: "bp-stage" }, u ? el("img", { src: u, alt: "" }) : el("span", { class: "muted small", text: "No image yet" }),
        el("div", { class: "bp-text" }, el("strong", { text: title.value || "Banner title" }), el("span", { text: sub.value }), bt.value ? el("span", { class: "bp-btn", text: bt.value }) : null)),
        m ? el("div", {}, el("p", { class: "small muted", text: "Mobile image" }), el("img", { class: "bp-mobile", src: m, alt: "" })) : null].filter(Boolean)); }
    for (const x of [title, sub, bt]) x.addEventListener("input", preview); preview();
    const save = el("button", { class: "btn", type: "submit", text: b ? "Save changes" : "Create banner" });
    const form = el("form", { novalidate: true }, field("Title", title, { name: "title" }), field("Subtitle", sub, { name: "subtitle" }), desk.element, mob.element,
      el("div", { class: "grid-2" }, field("Button text", bt, { name: "buttonText" }), field("Button link", bl, { name: "buttonLink", hint: "A site path such as /products, or a full https:// link." })),
      field("Display order", order, { name: "sortOrder", hint: "Lower numbers first." }), el("div", { class: "field" }, active.node), pv,
      el("div", { class: "row" }, save, el("button", { class: "btn btn-quiet", type: "button", text: "Cancel", onclick: () => { formBox.hidden = true; } })));
    form.addEventListener("submit", async ev => {
      ev.preventDefault(); if (busy) return;
      const { errors, data } = validateBanner({ title: title.value, subtitle: sub.value, imageURL: desk.get(), mobileImageURL: mob.get(), buttonText: bt.value, buttonLink: bl.value, isActive: active.input.checked, sortOrder: order.value });
      showErrors(form, errors); if (errors.length) return;
      busy = true; save.disabled = true; save.textContent = "Saving\u2026";
      try { if (b) await updateItem(COL.banners, b.id, data); else await createItem(COL.banners, data); toast("Banner saved.", "success"); formBox.hidden = true; items = await listAll(COL.banners); }
      catch (e) { toast((desk.uploadedThisSession() || mob.uploadedThisSession() ? "The image is uploaded to Cloudinary but the banner was NOT saved. " : "Nothing was saved. ") + describeError(e), "error"); }
      finally { busy = false; save.disabled = false; save.textContent = b ? "Save changes" : "Create banner"; draw(); }
    });
    formBox.replaceChildren(el("h2", { text: b ? "Edit banner" : "New banner" }), form); title.focus(); formBox.scrollIntoView({ block: "nearest" });
  }
  await load();
}
