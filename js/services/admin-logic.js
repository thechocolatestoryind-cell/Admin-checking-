// Pure logic for reviews, custom requests, settings and dashboard summaries (no Firebase import).
import { ms, dateFromIstString, whatsappDigits, phoneDigits } from "./order-logic.js";
import { stockStatus } from "./product-logic.js";
import { isHttps } from "./content-logic.js";

/* ---------- reviews (schema: isApproved boolean only) ---------- */
export const sortReviews = list => list.slice().sort((a, b) => (a.isApproved === true) - (b.isApproved === true) || (ms(b.createdAt) || 0) - (ms(a.createdAt) || 0));
export function reviewMatches(r, { text = "", state = "pending", rating = "" } = {}, names = {}) {
  if (state === "pending" && r.isApproved === true) return false;
  if (state === "approved" && r.isApproved !== true) return false;
  if (rating && String(r.rating) !== String(rating)) return false;
  const t = text.trim().toLowerCase();
  return !t || [r.reviewText, names.product, names.customer, r.orderId, r.productId, r.userId].some(x => String(x || "").toLowerCase().includes(t));
}

/* ---------- custom order requests ---------- */
// Status words are chosen by this admin; the export only shows "new" and the rules do not validate them.
export const REQUEST_STATUSES = ["new", "contacted", "quoted", "accepted", "in_progress", "completed", "declined"];
export const REQUEST_LABEL = { new: "New", contacted: "Contacted", quoted: "Quoted", accepted: "Accepted", in_progress: "In progress", completed: "Completed", declined: "Declined" };
export function validateRequestUpdate({ status, adminNote }, existingStatus) {
  const errors = [], note = String(adminNote || "").trim();
  if (!REQUEST_STATUSES.includes(status) && status !== existingStatus) errors.push({ field: "status", msg: "Choose a status." });
  if (note.length > 1000) errors.push({ field: "adminNote", msg: "Up to 1000 characters." });
  return { errors, data: { status, adminNote: note } };
}
export function requestMatches(r, { text = "", status = "", method = "", from = "", to = "" } = {}) {
  const t = text.trim().toLowerCase();
  if (t && ![r.customerName, r.phoneNumber, r.productDescription, r.id].some(x => String(x || "").toLowerCase().includes(t))) return false;
  if (status && r.status !== status) return false;
  if (method && r.contactMethod !== method) return false;
  const c = ms(r.createdAt), f = dateFromIstString(from), e = dateFromIstString(to);
  if (f && !(c >= f.getTime())) return false;
  if (e && !(c < e.getTime() + 86400000)) return false;
  return true;
}
// Only builds links from the number the customer typed. Instagram requests carry no handle, so no link is invented.
export function requestContact(r) {
  const wa = whatsappDigits(r.phoneNumber), tel = phoneDigits(r.phoneNumber);
  return { whatsapp: wa ? "https://wa.me/" + wa : "", tel: tel.length >= 10 ? "tel:+" + (tel.length === 10 ? "91" + tel : tel) : "", instagramNoHandle: r.contactMethod === "instagram" };
}

/* ---------- siteSettings/public (known fields only) ---------- */
export const SETTINGS_FIELDS = ["siteName", "contactEmail", "whatsappNumber", "instagramURL", "currency", "currencySymbol", "maintenanceMode", "faviconURL", "logoURL", "announcementEnabled", "announcementText"];
export function validateSettings(v) {
  const errors = [], add = (field, msg) => errors.push({ field, msg });
  const t = k => String(v[k] == null ? "" : v[k]).trim();
  const siteName = t("siteName"); if (!siteName || siteName.length > 80) add("siteName", "Enter the store name (up to 80 characters).");
  const contactEmail = t("contactEmail"); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || contactEmail.length > 120) add("contactEmail", "Enter a valid email address.");
  let wa = t("whatsappNumber").replace(/[\s\-()]/g, ""); if (/^\d{10}$/.test(wa)) wa = "+91" + wa; else if (/^\d{11,15}$/.test(wa)) wa = "+" + wa;
  if (!/^\+\d{10,15}$/.test(wa)) add("whatsappNumber", "Enter the number with country code, like +91 88470 50895.");
  const instagramURL = t("instagramURL"); let igOk = !instagramURL;
  if (instagramURL) { try { const u = new URL(instagramURL); igOk = u.protocol === "https:" && /^(www\.)?instagram\.com$/.test(u.hostname); } catch (_) {} }
  if (!igOk) add("instagramURL", "Use a full https://www.instagram.com/\u2026 link, or leave it empty.");
  const currency = t("currency").toUpperCase(); if (!/^[A-Z]{3}$/.test(currency)) add("currency", "Use a 3-letter code such as INR.");
  const currencySymbol = t("currencySymbol"); if (!currencySymbol || currencySymbol.length > 3) add("currencySymbol", "Enter the symbol (1 to 3 characters).");
  for (const k of ["faviconURL", "logoURL"]) if (t(k) && !isHttps(t(k))) add(k, "Use a secure https link, or leave it empty.");
  const announcementEnabled = !!v.announcementEnabled, announcementText = t("announcementText");
  if (announcementText.length > 200) add("announcementText", "Up to 200 characters.");
  if (announcementEnabled && !announcementText) add("announcementText", "Enter the announcement text, or turn the announcement off.");
  return { errors, data: { siteName, contactEmail, whatsappNumber: wa, instagramURL, currency, currencySymbol, maintenanceMode: !!v.maintenanceMode, faviconURL: t("faviconURL"), logoURL: t("logoURL"), announcementEnabled, announcementText } };
}
export function changedFields(original, data) {
  const o = original || {}, patch = {};
  for (const k of Object.keys(data)) if (o[k] !== data[k]) patch[k] = data[k];
  return patch;
}

/* ---------- dashboard summaries (computed only from records actually read) ---------- */
export function summarizeOrders(orders) {
  const c = { total: orders.length, pending: 0, confirmed: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0, other: 0 };
  const known = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
  for (const o of orders) { if (known.includes(o.status)) c[o.status]++; else c.other++; }
  c.toShip = c.confirmed + c.processing; return c;
}
export function summarizeProducts(products) {
  const s = { total: products.length, active: 0, inactive: 0, unavailable: 0, low: 0, out: 0 };
  for (const p of products) {
    if (!p.isActive) { s.inactive++; continue; }
    s.active++; if (p.isAvailable === false) s.unavailable++;
    const st = stockStatus(p); if (st === "low") s.low++; if (st === "out") s.out++;
  }
  return s;
}
export const summarizeReviews = rs => ({ total: rs.length, pending: rs.filter(r => r.isApproved !== true).length });
export const summarizeRequests = rs => ({ total: rs.length, fresh: rs.filter(r => r.status === "new").length });
