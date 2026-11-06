import { el, toast, confirmDialog, safeUrl } from "../common.js";
import { field, input, check, showErrors, stateBox } from "../ui/forms.js";
import { createImageField } from "../ui/imagefield.js";
import { listAll, createItem, updateItem, deleteItem, reorder, deleteHighlightCascade } from "../services/content.js";
import { validateHighlight, validateSlide, orphanSlides } from "../services/content-logic.js";
import { COL } from "../collections.js";
import { describeError } from "../services/util.js";

export async function render(host) {
  let hs = [], slides = [], busy = false, openId = null;
  const formBox = el("section", { class: "card" }), list = el("div"), orphanBox = el("div"); formBox.hidden = true;
  host.append(el("div", { class: "toolbar" }, el("button", { class: "btn", type: "button", text: "Add highlight", onclick: () => openForm(null) }), el("button", { class: "btn btn-quiet", type: "button", text: "Refresh", onclick: load })), formBox, list, orphanBox);
  const slidesOf = id => slides.filter(s => s.highlightId === id);

  async function load() {
    list.replaceChildren(el("p", { class: "muted", role: "status", text: "Loading highlights\u2026" }));
    try { [hs, slides] = await Promise.all([listAll(COL.highlights), listAll(COL.highlightItems)]); draw(); }
    catch (e) { list.replaceChildren(stateBox("Could not load highlights", describeError(e), el("button", { class: "btn", type: "button", text: "Try again", onclick: load }))); orphanBox.replaceChildren(); }
  }
  const thumb = u => safeUrl(u) ? el("img", { class: "thumb", src: safeUrl(u), alt: "", loading: "lazy", width: 64, height: 64 }) : el("span", { class: "thumb thumb-empty", "aria-hidden": "true", text: "No image" });
  const badgeA = a => el("span", { class: "badge " + (a ? "badge-ok" : "badge-off"), text: a ? "Active" : "Inactive" });
  function draw() {
    const orph = orphanSlides(slides, hs);
    orphanBox.replaceChildren(...(orph.length ? [el("section", { class: "card warn-card" }, el("h2", { text: "Slides without a highlight" }),
      el("p", { class: "small", text: orph.length + " slide(s) point to a highlight that does not exist, so they are invisible on the storefront. Delete them to tidy up." }),
      el("ul", { class: "plain" }, orph.map(s => el("li", { class: "row" }, el("span", { class: "grow wrap", text: (s.caption || "(no caption)") + " \u2013 highlight id " + s.highlightId }),
        el("button", { class: "btn btn-quiet btn-small danger-text", type: "button", disabled: busy, text: "Delete slide", onclick: () => delSlide(s) })))))] : []));
    if (!hs.length) { list.replaceChildren(stateBox("No highlights yet", "A highlight is a circular story on the home page with its own slides.", el("button", { class: "btn", type: "button", text: "Add highlight", onclick: () => openForm(null) }))); return; }
    list.replaceChildren(el("ul", { class: "rows" }, hs.map((h, i) => el("li", { class: "stack" }, el("div", { class: "row-card" }, thumb(h.coverImageURL),
      el("div", { class: "grow" }, el("p", { class: "row-title wrap", text: h.title || "(untitled)" }), el("p", { class: "badges" }, badgeA(h.isActive), el("span", { class: "badge badge-off", text: slidesOf(h.id).length + " slide(s)" }), el("span", { class: "badge badge-off", text: "Order " + (h.sortOrder ?? "\u2014") }))),
      el("div", { class: "row actions" },
        el("button", { class: "btn btn-quiet btn-small", type: "button", "aria-expanded": String(openId === h.id), text: openId === h.id ? "Hide slides" : "Slides", onclick: () => { openId = openId === h.id ? null : h.id; draw(); } }),
        el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Up", "aria-label": "Move " + h.title + " up", disabled: i === 0 || busy, onclick: () => move(COL.highlights, hs, i, -1) }),
        el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Down", "aria-label": "Move " + h.title + " down", disabled: i === hs.length - 1 || busy, onclick: () => move(COL.highlights, hs, i, 1) }),
        el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Edit", onclick: () => openForm(h) }),
        el("button", { class: "btn btn-quiet btn-small", type: "button", disabled: busy, text: h.isActive ? "Deactivate" : "Activate", onclick: () => toggle(COL.highlights, h, h.coverImageURL, "cover image") }),
        el("button", { class: "btn btn-quiet btn-small danger-text", type: "button", disabled: busy, text: "Delete", onclick: () => removeHighlight(h) }))),
      openId === h.id ? slidePanel(h) : null))));
  }
  async function run(fn) { if (busy) return; busy = true; draw(); try { await fn(); } catch (e) { toast(describeError(e), "error"); } finally { busy = false; draw(); } }
  const reload = async () => { [hs, slides] = await Promise.all([listAll(COL.highlights), listAll(COL.highlightItems)]); };
  const move = (c, arr, i, d) => run(async () => { const n = arr.slice(); [n[i], n[i + d]] = [n[i + d], n[i]]; await reorder(c, n); toast("Order saved.", "success"); await reload(); });
  const toggle = (c, x, img, what) => run(async () => { if (!x.isActive && !img) { toast("Add a " + what + " (Edit) before activating.", "error"); return; } await updateItem(c, x.id, { isActive: !x.isActive }); toast("Saved.", "success"); await reload(); });
  const removeHighlight = h => run(async () => {
    const own = slidesOf(h.id);
    if (!await confirmDialog({ title: "Delete \u201C" + h.title + "\u201D?", danger: true, confirmText: own.length ? "Delete highlight and " + own.length + " slide(s)" : "Delete highlight",
      message: own.length ? "This also deletes its " + own.length + " slide(s), so nothing is left behind. It all happens together or not at all. This cannot be undone." : "This highlight has no slides. This cannot be undone." })) return;
    await deleteHighlightCascade(h.id, own.map(s => s.id)); if (openId === h.id) openId = null; toast("Highlight deleted.", "success"); await reload(); });
  const delSlide = s => run(async () => { if (!await confirmDialog({ title: "Delete this slide?", message: "This cannot be undone.", confirmText: "Delete slide", danger: true })) return; await deleteItem(COL.highlightItems, s.id); toast("Slide deleted.", "success"); await reload(); });

  function slidePanel(h) {
    const own = slidesOf(h.id), box = el("div", { class: "slides-panel" }), formHost = el("div");
    box.append(el("div", { class: "row between" }, el("h3", { text: "Slides in \u201C" + h.title + "\u201D" }), el("button", { class: "btn btn-small", type: "button", text: "Add slide", onclick: () => slideForm(formHost, h, null) })), formHost,
      own.length ? el("ul", { class: "rows" }, own.map((s, i) => el("li", { class: "row-card" }, thumb(s.imageURL),
        el("div", { class: "grow" }, el("p", { class: "wrap", text: s.caption || "(no caption)" }), el("p", { class: "small muted wrap", text: s.linkURL ? "Links to " + s.linkURL : "No link" }), el("p", { class: "badges" }, badgeA(s.isActive), el("span", { class: "badge badge-off", text: "Order " + (s.sortOrder ?? "\u2014") }))),
        el("div", { class: "row actions" },
          el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Up", "aria-label": "Move slide " + (i + 1) + " up", disabled: i === 0 || busy, onclick: () => move(COL.highlightItems, own, i, -1) }),
          el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Down", "aria-label": "Move slide " + (i + 1) + " down", disabled: i === own.length - 1 || busy, onclick: () => move(COL.highlightItems, own, i, 1) }),
          el("button", { class: "btn btn-quiet btn-small", type: "button", text: "Edit", onclick: () => slideForm(formHost, h, s) }),
          el("button", { class: "btn btn-quiet btn-small", type: "button", disabled: busy, text: s.isActive ? "Deactivate" : "Activate", onclick: () => toggle(COL.highlightItems, s, s.imageURL, "slide image") }),
          el("button", { class: "btn btn-quiet btn-small danger-text", type: "button", disabled: busy, text: "Delete", onclick: () => delSlide(s) }))))) : el("p", { class: "muted small", text: "No slides yet." }));
    return box;
  }
  function slideForm(hostEl, h, s) {
    const cap = input({ value: s ? s.caption || "" : "", maxlength: 100 }), link = input({ value: s ? s.linkURL || "" : "", placeholder: "/products or https://\u2026" });
    const order = input({ type: "number", step: 1, value: String(s ? s.sortOrder ?? 0 : slidesOf(h.id).length + 1) }), active = check("Active", s ? s.isActive : false);
    const img = createImageField({ label: "Slide image", name: "imageURL", value: s ? s.imageURL : "" });
    const save = el("button", { class: "btn", type: "submit", text: s ? "Save slide" : "Add slide" });
    const form = el("form", { novalidate: true, class: "card" }, el("h3", { text: s ? "Edit slide" : "New slide" }), img.element, field("Caption", cap, { name: "caption" }), field("Link (optional)", link, { name: "linkURL" }), field("Display order", order, { name: "sortOrder" }), el("div", { class: "field" }, active.node),
      el("div", { class: "row" }, save, el("button", { class: "btn btn-quiet", type: "button", text: "Cancel", onclick: () => hostEl.replaceChildren() })));
    form.addEventListener("submit", async ev => {
      ev.preventDefault(); if (busy) return;
      const { errors, data } = validateSlide({ highlightId: h.id, imageURL: img.get(), caption: cap.value, linkURL: link.value, isActive: active.input.checked, sortOrder: order.value });
      showErrors(form, errors); if (errors.length) return;
      busy = true; save.disabled = true; save.textContent = "Saving\u2026";
      try { if (s) { const { highlightId, ...patch } = data; await updateItem(COL.highlightItems, s.id, patch); } else await createItem(COL.highlightItems, data); toast("Slide saved.", "success"); await reload(); hostEl.replaceChildren(); }
      catch (e) { toast((img.uploadedThisSession() ? "The image is uploaded to Cloudinary but the slide was NOT saved. " : "Nothing was saved. ") + describeError(e), "error"); }
      finally { busy = false; save.disabled = false; save.textContent = s ? "Save slide" : "Add slide"; draw(); }
    });
    hostEl.replaceChildren(form); cap.focus();
  }
  function openForm(h) {
    formBox.hidden = false;
    const title = input({ value: h ? h.title || "" : "", maxlength: 60 }), order = input({ type: "number", step: 1, value: String(h ? h.sortOrder ?? 0 : hs.length + 1) }), active = check("Active (visible on the public store)", h ? h.isActive : false);
    const cover = createImageField({ label: "Cover image (circle)", name: "coverImageURL", value: h ? h.coverImageURL : "", hint: "Shown cropped into a circle, so keep the subject in the middle." });
    const save = el("button", { class: "btn", type: "submit", text: h ? "Save changes" : "Create highlight" });
    const form = el("form", { novalidate: true }, field("Title", title, { name: "title" }), cover.element, field("Display order", order, { name: "sortOrder" }), el("div", { class: "field" }, active.node),
      el("div", { class: "row" }, save, el("button", { class: "btn btn-quiet", type: "button", text: "Cancel", onclick: () => { formBox.hidden = true; } })));
    form.addEventListener("submit", async ev => {
      ev.preventDefault(); if (busy) return;
      const { errors, data } = validateHighlight({ title: title.value, coverImageURL: cover.get(), isActive: active.input.checked, sortOrder: order.value });
      showErrors(form, errors); if (errors.length) return;
      busy = true; save.disabled = true; save.textContent = "Saving\u2026";
      try { if (h) await updateItem(COL.highlights, h.id, data); else await createItem(COL.highlights, data); toast("Highlight saved.", "success"); formBox.hidden = true; await reload(); }
      catch (e) { toast((cover.uploadedThisSession() ? "The image is uploaded to Cloudinary but the highlight was NOT saved. " : "Nothing was saved. ") + describeError(e), "error"); }
      finally { busy = false; save.disabled = false; save.textContent = h ? "Save changes" : "Create highlight"; draw(); }
    });
    formBox.replaceChildren(el("h2", { text: h ? "Edit highlight" : "New highlight" }), form); title.focus(); formBox.scrollIntoView({ block: "nearest" });
  }
  await load();
}
