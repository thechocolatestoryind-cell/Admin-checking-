// Pure validation for banners, highlights and slides (no Firebase import).
export const isHttps = u => { try { return new URL(String(u)).protocol === "https:"; } catch (_) { return false; } };
// Links may be a site path ("/products", as in the sample banner) or a full http(s) address. Anything else (javascript:, data:, //host) is refused.
export function normalizeLink(raw) {
  const s = String(raw == null ? "" : raw).trim(); if (!s) return "";
  if (/^\/(?!\/)[^\s\\]*$/.test(s)) return s;
  try { const u = new URL(s); if ((u.protocol === "https:" || u.protocol === "http:") && !/\s/.test(s)) return s; } catch (_) {}
  return null;
}
const toInt = v => { const s = String(v == null ? "" : v).trim(); return s === "" ? 0 : Number(s); };
const okInt = n => Number.isInteger(n) && n >= -9999 && n <= 9999;
function imageRule(add, field, url, { required = false, label = "Image" } = {}) {
  const u = String(url || "").trim();
  if (u && !isHttps(u)) { add(field, label + " must be a secure https link."); return ""; }
  if (!u && required) add(field, "Add an image before making this active.");
  return u;
}
export function validateBanner(v) {
  const errors = [], add = (field, msg) => errors.push({ field, msg });
  const title = String(v.title || "").trim(), subtitle = String(v.subtitle || "").trim(), buttonText = String(v.buttonText || "").trim();
  if (!title) add("title", "Enter a banner title."); else if (title.length > 100) add("title", "Up to 100 characters.");
  if (subtitle.length > 200) add("subtitle", "Up to 200 characters.");
  if (buttonText.length > 40) add("buttonText", "Up to 40 characters.");
  const isActive = !!v.isActive;
  const imageURL = imageRule(add, "imageURL", v.imageURL, { required: isActive, label: "Image" });
  const mobileImageURL = imageRule(add, "mobileImageURL", v.mobileImageURL, { label: "Mobile image" });
  const link = normalizeLink(v.buttonLink); if (link === null) add("buttonLink", "Use a site path like /products or a full https:// link.");
  if (buttonText && !link && link !== null) add("buttonLink", "Add a link for the button, or clear the button text.");
  if (link && !buttonText) add("buttonText", "Add button text, or clear the link.");
  const sortOrder = toInt(v.sortOrder); if (!okInt(sortOrder)) add("sortOrder", "Use a whole number.");
  return { errors, data: { title, subtitle, imageURL, mobileImageURL, buttonText, buttonLink: link || "", isActive, sortOrder } };
}
export function validateHighlight(v) {
  const errors = [], add = (field, msg) => errors.push({ field, msg });
  const title = String(v.title || "").trim(); if (!title) add("title", "Enter a title."); else if (title.length > 60) add("title", "Up to 60 characters.");
  const isActive = !!v.isActive, coverImageURL = imageRule(add, "coverImageURL", v.coverImageURL, { required: isActive, label: "Cover image" });
  const sortOrder = toInt(v.sortOrder); if (!okInt(sortOrder)) add("sortOrder", "Use a whole number.");
  return { errors, data: { title, coverImageURL, isActive, sortOrder } };
}
export function validateSlide(v) {
  const errors = [], add = (field, msg) => errors.push({ field, msg });
  if (!String(v.highlightId || "").trim()) add("highlightId", "A slide must belong to a highlight.");
  const isActive = !!v.isActive, imageURL = imageRule(add, "imageURL", v.imageURL, { required: isActive, label: "Slide image" });
  const caption = String(v.caption || "").trim(); if (caption.length > 100) add("caption", "Up to 100 characters.");
  const linkURL = normalizeLink(v.linkURL); if (linkURL === null) add("linkURL", "Use a site path like /products or a full https:// link.");
  const sortOrder = toInt(v.sortOrder); if (!okInt(sortOrder)) add("sortOrder", "Use a whole number.");
  return { errors, data: { highlightId: String(v.highlightId || "").trim(), imageURL, caption, linkURL: linkURL || "", isActive, sortOrder } };
}
// Slides whose highlightId matches no existing highlight.
export const orphanSlides = (slides, highlights) => { const ids = new Set(highlights.map(h => h.id)); return slides.filter(s => !ids.has(s.highlightId)); };
