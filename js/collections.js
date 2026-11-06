// Canonical collection names, exactly as in the live Firestore export. Do not add parallel names.
export const COL = Object.freeze({
  users: "users",
  products: "products",
  categories: "categories",
  orders: "orders",
  reviews: "reviews",
  wishlists: "wishlists",
  siteSettings: "siteSettings",
  banners: "banners",
  highlights: "highlights",
  highlightItems: "highlightItems",
  paymentTransactions: "paymentTransactions",
  shipments: "shipments",
  customOrderRequests: "customOrderRequests",
  adminActivityLogs: "adminActivityLogs"
});
export const SUB = Object.freeze({ userAddresses: "addresses" }); // users/{uid}/addresses/{id}
export const SITE_SETTINGS_DOC_ID = "public";

// Mirrors validOrderTransition() in docs/firestore.rules.updated (the supplied rules plus ONE added step, confirmed -> shipped).
// The four working statuses are pending, confirmed, shipped, delivered; "processing" is kept only so older orders can still be moved on.
export const ORDER_TRANSITIONS = Object.freeze({
  pending: ["pending", "confirmed", "cancelled"],
  confirmed: ["confirmed", "processing", "shipped", "cancelled"],
  processing: ["processing", "shipped", "cancelled"],
  shipped: ["shipped", "delivered"],
  delivered: ["delivered"],
  cancelled: ["cancelled"]
});
// Orders: admin may change only these keys (rules: changedOnly). paymentStatus is allowed only as pending -> verified
// together with pending -> confirmed (rules: validPaymentStatusChange in docs/firestore.rules.updated).
export const ORDER_ADMIN_WRITABLE = Object.freeze(["status", "paymentStatus", "updatedAt", "adminNote"]);
export const PAYMENT_STATUS = Object.freeze({ pending: "pending", verified: "verified" });
export const CONTACT_METHODS = Object.freeze(["whatsapp", "instagram", "phone"]);
export const PRODUCT_TYPES = Object.freeze(["fixed", "customizable"]);
