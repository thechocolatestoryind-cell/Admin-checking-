// Pure validation/normalisation for products (no Firebase import, so it can be tested in Node).
import { PRODUCT_TYPES } from "../collections.js";

export const LIMITS = { name: 120, slug: 100, description: 5000, shortDescription: 200, seoTitle: 120,
  seoDescription: 300, maxImages: 10, maxOptions: 10, maxChoices: 20, maxList: 30 };
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, LIMITS.slug).replace(/-+$/g, "");
}
export function toNumber(v) {
  if (typeof v === "number") return v;
  const s = String(v == null ? "" : v).trim();
  return s === "" ? NaN : Number(s);
}
const isMoney = n => Number.isFinite(n) && n >= 0 && n <= 1000000 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
export function parseList(text, { lower = false } = {}) {
  const seen = new Set(), out = [];
  for (let t of String(text || "").split(/[,\n]/)) {
    t = t.trim(); if (lower) t = t.toLowerCase();
    if (t && t.length <= 40 && !seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out.slice(0, LIMITS.maxList);
}
export function stockStatus(p) {
  if (!p.trackInventory) return "untracked";
  const q = Number(p.stockQuantity) || 0;
  if (q <= 0) return p.allowBackorder ? "backorder" : "out";
  return q <= (Number(p.lowStockThreshold) || 0) ? "low" : "in";
}
export function isHttpsUrl(u) {
  try { return new URL(String(u)).protocol === "https:"; } catch (_) { return false; }
}

/* Option shape used for NEW records (documented in docs/FIREBASE_DATA_CONTRACT.md):
   choice: { id, name, type:"choice", required, choices:[{ label, priceAdjustment }] }
   text:   { id, name, type:"text", required, maxLength, priceAdjustment }
   Anything else already in the database is "unrecognised" and is passed through untouched. */
export function isRecognizedOption(o) {
  if (!o || typeof o !== "object" || Array.isArray(o) || typeof o.name !== "string") return false;
  if (o.type === "text") return true;
  return o.type === "choice" && Array.isArray(o.choices) && o.choices.every(c => c && typeof c.label === "string");
}
export function normalizeOptions(list) {
  const errors = [], out = [], names = new Set(), ids = new Set();
  if (list.length > LIMITS.maxOptions) errors.push("Use at most " + LIMITS.maxOptions + " options per product.");
  list.forEach((o, i) => {
    if (!isRecognizedOption(o)) { out.push(o); return; }   // preserved as-is
    const n = i + 1, name = String(o.name).trim();
    if (!name || name.length > 60) { errors.push("Option " + n + ": enter a name (up to 60 characters)."); return; }
    if (names.has(name.toLowerCase())) { errors.push("Option names must be different (\u201C" + name + "\u201D repeats)."); return; }
    names.add(name.toLowerCase());
    let id = slugify(name) || "option", k = 2; const base = id;
    while (ids.has(id)) id = base + "-" + k++;
    ids.add(id);
    const adj = toNumber(o.type === "text" ? o.priceAdjustment : 0);
    if (o.type === "text") {
      const ml = o.maxLength === "" || o.maxLength == null ? 100 : toNumber(o.maxLength);
      const pa = o.priceAdjustment === "" || o.priceAdjustment == null ? 0 : adj;
      if (!isInt(ml, 1, 500)) { errors.push("Option \u201C" + name + "\u201D: maximum length must be a whole number from 1 to 500."); return; }
      if (!Number.isFinite(pa) || Math.abs(pa) > 100000) { errors.push("Option \u201C" + name + "\u201D: price adjustment must be a number."); return; }
      out.push({ id, name, type: "text", required: !!o.required, maxLength: ml, priceAdjustment: pa });
    } else {
      if (!o.choices.length) { errors.push("Option \u201C" + name + "\u201D needs at least one choice."); return; }
      if (o.choices.length > LIMITS.maxChoices) { errors.push("Option \u201C" + name + "\u201D: at most " + LIMITS.maxChoices + " choices."); return; }
      const labels = new Set(), choices = [];
      for (const c of o.choices) {
        const label = String(c.label).trim();
        const pa = c.priceAdjustment === "" || c.priceAdjustment == null ? 0 : toNumber(c.priceAdjustment);
        if (!label || label.length > 60) { errors.push("Option \u201C" + name + "\u201D: every choice needs a name (up to 60 characters)."); return; }
        if (labels.has(label.toLowerCase())) { errors.push("Option \u201C" + name + "\u201D: choice \u201C" + label + "\u201D repeats."); return; }
        if (!Number.isFinite(pa) || Math.abs(pa) > 100000) { errors.push("Option \u201C" + name + "\u201D: price adjustment for \u201C" + label + "\u201D must be a number."); return; }
        labels.add(label.toLowerCase()); choices.push({ label, priceAdjustment: pa });
      }
      out.push({ id, name, type: "choice", required: !!o.required, choices });
    }
  });
  return { options: out, errors };
}

// v = raw form values. Returns { errors:[{field,msg}], data }.
export function validateProduct(v) {
  const errors = [], add = (field, msg) => errors.push({ field, msg });
  const name = String(v.name || "").trim(), slug = String(v.slug || "").trim();
  if (!name) add("name", "Enter a product name."); else if (name.length > LIMITS.name) add("name", "Name can be up to " + LIMITS.name + " characters.");
  if (!slug) add("slug", "Enter a slug (lowercase letters, numbers and hyphens).");
  else if (!SLUG_RE.test(slug) || slug.length > LIMITS.slug) add("slug", "Use only lowercase letters, numbers and single hyphens, up to " + LIMITS.slug + " characters.");
  const text = (k, max) => { const t = String(v[k] || "").trim(); if (t.length > max) add(k, "Up to " + max + " characters."); return t; };
  const description = text("description", LIMITS.description), shortDescription = text("shortDescription", LIMITS.shortDescription);
  const seoTitle = text("seoTitle", LIMITS.seoTitle), seoDescription = text("seoDescription", LIMITS.seoDescription);
  if (!PRODUCT_TYPES.includes(v.productType)) add("productType", "Choose Fixed or Customizable.");
  const basePrice = toNumber(v.basePrice), deliveryCharge = toNumber(v.deliveryCharge);
  if (!isMoney(basePrice)) add("basePrice", "Enter a price from 0 to 10,00,000 with at most 2 decimals.");
  if (!isMoney(deliveryCharge)) add("deliveryCharge", "Enter a delivery charge (use 0 for free delivery).");
  const sortRaw = String(v.sortOrder == null ? "" : v.sortOrder).trim(), sortOrder = sortRaw === "" ? 0 : toNumber(sortRaw);
  if (!isInt(sortOrder, -9999, 9999)) add("sortOrder", "Display order must be a whole number.");
  const trackInventory = !!v.trackInventory;
  const sq = String(v.stockQuantity == null ? "" : v.stockQuantity).trim(), lt = String(v.lowStockThreshold == null ? "" : v.lowStockThreshold).trim();
  const stockQuantity = sq === "" ? (trackInventory ? NaN : 0) : toNumber(sq), lowStockThreshold = lt === "" ? 0 : toNumber(lt);
  if (!isInt(stockQuantity, 0, 1000000)) add("stockQuantity", "Enter stock as a whole number (0 or more).");
  if (!isInt(lowStockThreshold, 0, 1000000)) add("lowStockThreshold", "Enter the low-stock level as a whole number (0 or more).");
  const images = Array.isArray(v.images) ? v.images.slice() : [];
  if (images.length > LIMITS.maxImages) add("images", "Use at most " + LIMITS.maxImages + " images.");
  if (images.some(u => !isHttpsUrl(u))) add("images", "Every image must be a secure https link.");
  const primaryImage = images.includes(v.primaryImage) ? v.primaryImage : (images[0] || "");
  const { options, errors: optErrors } = normalizeOptions(Array.isArray(v.options) ? v.options : []);
  optErrors.forEach(m => add("options", m));
  const data = { name, slug, description, shortDescription, seoTitle, seoDescription, categoryId: String(v.categoryId || ""),
    productType: v.productType, basePrice, deliveryCharge, images, primaryImage, options,
    tags: parseList(v.tags), searchKeywords: parseList(v.searchKeywords, { lower: true }),
    trackInventory, stockQuantity, lowStockThreshold, allowBackorder: !!v.allowBackorder, isAvailable: !!v.isAvailable,
    isActive: !!v.isActive, isFeatured: !!v.isFeatured, sortOrder };
  return { errors, data };
}
