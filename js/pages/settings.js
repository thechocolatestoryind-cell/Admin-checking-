import { el, toast, confirmDialog, safeUrl } from "../common.js";
import { field, input, textarea, check, showErrors, stateBox } from "../ui/forms.js";
import { createImageField } from "../ui/imagefield.js";
import { note } from "../ui/bits.js";
import { getSettings, saveSettings } from "../services/settings.js";
import { validateSettings, changedFields } from "../services/admin-logic.js";
import { describeError } from "../services/util.js";
import { BRAND } from "../config.js";

export async function render(body) {
  body.append(el("p", { class: "muted", role: "status", text: "Loading settings\u2026" })); let cur;
  try { cur = await getSettings(); } catch (e) { body.replaceChildren(stateBox("Could not load settings", describeError(e), el("button", { class: "btn", type: "button", text: "Try again", onclick: () => location.reload() }))); return; }
  const d = cur.data; let busy = false;
  const f = { siteName: input({ value: d.siteName || "", maxlength: 80 }), contactEmail: input({ type: "email", value: d.contactEmail || "" }), whatsappNumber: input({ type: "tel", value: d.whatsappNumber || "" }),
    instagramURL: input({ type: "url", value: d.instagramURL || "" }), currency: input({ value: d.currency || "INR", maxlength: 3 }), currencySymbol: input({ value: d.currencySymbol || "\u20B9", maxlength: 3 }), announcementText: textarea({ rows: 2, maxlength: 200 }) };
  f.announcementText.value = d.announcementText || "";
  const maint = check("Maintenance mode on", d.maintenanceMode === true), ann = check("Show the announcement", d.announcementEnabled === true);
  const logo = createImageField({ label: "Logo (optional)", name: "logoURL", value: d.logoURL || "", hint: "The panel always uses its own bundled logo. This only sets the logoURL field for the storefront to read." });
  const fav = createImageField({ label: "Favicon (optional)", name: "faviconURL", value: d.faviconURL || "" });
  const save = el("button", { class: "btn", type: "submit", text: "Save settings" });
  const form = el("form", { novalidate: true, class: "card" }, el("h2", { text: "Public store settings" }),
    cur.exists ? null : note("No settings document exists yet. Saving will create siteSettings/public."),
    field("Store name", f.siteName, { name: "siteName" }), field("Contact email", f.contactEmail, { name: "contactEmail" }), field("WhatsApp number", f.whatsappNumber, { name: "whatsappNumber", hint: "With country code, for example +91 88470 50895." }),
    field("Instagram link", f.instagramURL, { name: "instagramURL" }), el("div", { class: "grid-2" }, field("Currency code", f.currency, { name: "currency" }), field("Currency symbol", f.currencySymbol, { name: "currencySymbol" })),
    logo.element, fav.element, el("div", { class: "field" }, ann.node), field("Announcement text", f.announcementText, { name: "announcementText" }),
    el("div", { class: "field" }, maint.node, el("p", { class: "hint small", text: "What maintenance mode does on the public site depends on the storefront; this app only stores the setting." })), save);
  form.addEventListener("submit", async ev => {
    ev.preventDefault(); if (busy) return;
    const { errors, data } = validateSettings({ siteName: f.siteName.value, contactEmail: f.contactEmail.value, whatsappNumber: f.whatsappNumber.value, instagramURL: f.instagramURL.value, currency: f.currency.value, currencySymbol: f.currencySymbol.value,
      maintenanceMode: maint.input.checked, faviconURL: fav.get(), logoURL: logo.get(), announcementEnabled: ann.input.checked, announcementText: f.announcementText.value });
    showErrors(form, errors); if (errors.length) return;
    const patch = changedFields(cur.data, data); if (!Object.keys(patch).length && cur.exists) { toast("No changes to save.", "info"); return; }
    if (patch.maintenanceMode === true && !await confirmDialog({ title: "Turn maintenance mode on?", message: "A compatible storefront may stop taking visitors while this is on.", confirmText: "Turn on" })) return;
    busy = true; save.disabled = true; save.textContent = "Saving\u2026";
    try { await saveSettings(cur.exists ? patch : data, cur.exists); cur = await getSettings(); toast("Settings saved.", "success"); }
    catch (e) { toast("Nothing was saved. " + describeError(e), "error"); } finally { busy = false; save.disabled = false; save.textContent = "Save settings"; }
  });
  const igOk = safeUrl(d.instagramURL);
  body.replaceChildren(form, el("section", { class: "card" }, el("h2", { text: "Business policies" }),
    el("p", { text: "Delivery is estimated at about " + BRAND.deliveryEstimateDays.min + "\u2013" + BRAND.deliveryEstimateDays.max + " days from the order date. This is an estimate, not a guarantee." }),
    note("The 6\u20138 day figure is an application default. siteSettings/public has no field for it, so making it editable for the storefront needs a shared schema change that both apps agree on."),
    el("p", { text: "Genuine damaged or wrong-item cases are referred to the owner on WhatsApp (" + BRAND.whatsappDisplay + ") with photo proof. This app has no refund, return or coupon features." }),
    igOk ? el("p", { class: "small" }, el("a", { href: igOk, target: "_blank", rel: "noopener noreferrer", text: "Open the saved Instagram page" })) : null));
}
