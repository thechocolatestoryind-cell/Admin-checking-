import assert from "node:assert/strict";
const { store } = await import("./stubs/firestore.js");
const C = await import("../js/services/content.js"), CL = await import("../js/services/content-logic.js"), A = await import("../js/services/admin-logic.js");
const R = await import("../js/services/reviews.js"), Q = await import("../js/services/requests.js"), S = await import("../js/services/settings.js"), G = await import("../js/services/logs.js");
const K = await import("../js/collections.js");
let pass = 0; const t = async (n, fn) => { try { await fn(); pass++; console.log("ok  ", n); } catch (e) { console.log("FAIL", n, "\n    ", e.message); process.exitCode = 1; } };
const f = r => r.errors.map(e => e.field).sort();

await t("links: site paths and https ok; script/protocol-relative refused", () => { assert.equal(CL.normalizeLink("/products"), "/products"); assert.equal(CL.normalizeLink(" https://x.com/a "), "https://x.com/a"); assert.equal(CL.normalizeLink(""), "");
  for (const bad of ["javascript:alert(1)", "//evil.com", "data:text/html,x", "/a b", "ftp://x"]) assert.equal(CL.normalizeLink(bad), null, bad); });
await t("banner validation", () => { const ok = { title: "Gifts", subtitle: "", imageURL: "https://res.cloudinary.com/x.jpg", mobileImageURL: "", buttonText: "Shop", buttonLink: "/products", isActive: true, sortOrder: "1" };
  assert.deepEqual(CL.validateBanner(ok).errors, []); assert.deepEqual(f(CL.validateBanner({ ...ok, imageURL: "" })), ["imageURL"]); assert.deepEqual(CL.validateBanner({ ...ok, imageURL: "", isActive: false }).errors, []);
  assert.deepEqual(f(CL.validateBanner({ ...ok, buttonLink: "" })), ["buttonLink"]); assert.deepEqual(f(CL.validateBanner({ ...ok, buttonText: "" })), ["buttonText"]); assert.deepEqual(f(CL.validateBanner({ ...ok, buttonLink: "javascript:x" })), ["buttonLink"]);
  assert.deepEqual(f(CL.validateBanner({ ...ok, title: " ", mobileImageURL: "http://x/a.jpg", sortOrder: "1.5" })), ["mobileImageURL", "sortOrder", "title"]); });
await t("highlight + slide validation", () => { assert.deepEqual(f(CL.validateHighlight({ title: "", isActive: true, coverImageURL: "" })), ["coverImageURL", "title"]); assert.deepEqual(CL.validateHighlight({ title: "Best", isActive: false, coverImageURL: "" }).errors, []);
  assert.deepEqual(f(CL.validateSlide({ highlightId: "", isActive: true, imageURL: "" })), ["highlightId", "imageURL"]); assert.equal(CL.validateSlide({ highlightId: "h1", imageURL: "https://a.b/c.jpg", linkURL: "/x", caption: "c", isActive: true }).errors.length, 0); });
await t("orphan slides detected", () => { assert.deepEqual(CL.orphanSlides([{ id: "s1", highlightId: "h1" }, { id: "s2", highlightId: "gone" }], [{ id: "h1" }]).map(s => s.id), ["s2"]); });

store.data.banners = { b1: { title: "A", sortOrder: 1, isActive: true, legacy: "keep" }, b2: { title: "B", sortOrder: 2 }, b3: { title: "C", sortOrder: 3 } };
store.data.highlights = { h1: { title: "Best", sortOrder: 1 } }; store.data.highlightItems = { i1: { highlightId: "h1", sortOrder: 1 }, i2: { highlightId: "h1", sortOrder: 2 }, i3: { highlightId: "other", sortOrder: 1 } };
await t("content create/update keep unknown fields; timestamps", async () => { const id = await C.createItem(K.COL.banners, { title: "D", sortOrder: 4 }); assert.equal(store.data.banners[id].createdAt, "TS");
  await C.updateItem(K.COL.banners, "b1", { title: "A2" }); assert.equal(store.data.banners.b1.legacy, "keep"); assert.equal(store.data.banners.b1.title, "A2"); await assert.rejects(() => C.createItem("orders", {}), /Unsupported/); });
await t("reorder renumbers with one batch, changed docs only", async () => { const list = await C.listAll(K.COL.banners); store.writes.length = 0; const n = await C.reorder(K.COL.banners, [list[1], list[0], list[2], list[3]]);
  assert.equal(n, 2); assert.deepEqual(store.writes.filter(w => w[0] === "batch"), [["batch", 2]]); });
await t("slides are scoped to their highlight; cascade removes only them", async () => { assert.equal((await C.slidesOf("h1")).length, 2); await C.deleteHighlightCascade("h1", ["i1", "i2"]);
  assert.equal(store.data.highlights.h1, undefined); assert.equal(store.data.highlightItems.i1, undefined); assert.ok(store.data.highlightItems.i3, "other highlight's slide untouched"); });

await t("review moderation writes only isApproved+updatedAt; text untouched", async () => { store.data.reviews = { r1: { reviewText: "Great", rating: 5, isApproved: false, imageURLs: ["https://a/b.jpg"], createdAt: "2026-10-19T00:00:00Z" }, r2: { isApproved: true, createdAt: "2026-10-20T00:00:00Z" }, r3: { isApproved: false, createdAt: "2026-10-21T00:00:00Z" } };
  store.writes.length = 0; await R.setApproved("r1", true); const d = store.data.reviews.r1; assert.equal(d.isApproved, true); assert.equal(d.reviewText, "Great"); assert.deepEqual(d.imageURLs, ["https://a/b.jpg"]); assert.equal(d.rating, 5);
  await R.setApproved("r1", false); assert.equal(store.data.reviews.r1.isApproved, false); });
await t("pending reviews sort first, newest first", async () => { assert.deepEqual((await R.listReviews()).map(r => r.id), ["r3", "r1", "r2"]); });
await t("review filters", () => { const r = { isApproved: false, rating: 4, reviewText: "Lovely box" };
  assert.ok(A.reviewMatches(r, { state: "pending" })); assert.ok(!A.reviewMatches(r, { state: "approved" })); assert.ok(A.reviewMatches(r, { state: "all", text: "lovely" })); assert.ok(!A.reviewMatches(r, { state: "all", rating: "5" })); assert.ok(A.reviewMatches(r, { state: "all", text: "dark" }, { product: "Dark Box" })); });
await t("review service has no text/image edit function", async () => { assert.deepEqual(Object.keys(R).sort(), ["deleteReview", "listReviews", "setApproved"]); });

store.data.customOrderRequests = { q1: { customerName: "A", phoneNumber: "9876543210", contactMethod: "whatsapp", productDescription: "Cake", status: "new", adminNote: "", budget: 500, requestedDate: new Date("2026-11-01"), referenceImageURLs: [], userId: "u1", createdAt: "2026-10-19T00:00:00Z" } };
await t("request update changes only status/adminNote/updatedAt", async () => { await Q.updateRequest("q1", { status: "contacted", adminNote: "Called" }); const d = store.data.customOrderRequests.q1;
  assert.equal(d.status, "contacted"); assert.equal(d.adminNote, "Called"); assert.equal(d.productDescription, "Cake"); assert.equal(d.userId, "u1"); assert.equal(d.budget, 500); assert.equal(d.updatedAt, "TS"); });
await t("request validation keeps unknown stored status selectable", () => { assert.equal(A.validateRequestUpdate({ status: "weird", adminNote: "" }, "weird").errors.length, 0); assert.equal(A.validateRequestUpdate({ status: "weird", adminNote: "" }, "new").errors.length, 1);
  assert.equal(A.validateRequestUpdate({ status: "new", adminNote: "x".repeat(1001) }, "new").errors.length, 1); });
await t("request contact links built only from typed number; instagram has none", () => { const c = A.requestContact({ phoneNumber: "98765 43210", contactMethod: "whatsapp" }); assert.equal(c.whatsapp, "https://wa.me/919876543210"); assert.equal(c.tel, "tel:+919876543210");
  const i = A.requestContact({ phoneNumber: "", contactMethod: "instagram" }); assert.equal(i.whatsapp, ""); assert.equal(i.tel, ""); assert.equal(i.instagramNoHandle, true); });
await t("request filters", () => { const r = { customerName: "Anita", phoneNumber: "999", productDescription: "Wedding hamper", status: "new", contactMethod: "phone", createdAt: "2026-10-19T11:00:00Z" };
  assert.ok(A.requestMatches(r, { text: "hamper", status: "new", method: "phone", from: "2026-10-19", to: "2026-10-19" })); assert.ok(!A.requestMatches(r, { method: "whatsapp" })); assert.ok(!A.requestMatches(r, { status: "quoted" })); });

const okS = () => ({ siteName: "The Chocolate Story", contactEmail: "a@b.co", whatsappNumber: "+91 88470 50895", instagramURL: "https://www.instagram.com/_x_/", currency: "inr", currencySymbol: "\u20B9", maintenanceMode: false, faviconURL: "", logoURL: "", announcementEnabled: false, announcementText: "" });
await t("settings validation + normalisation", () => { const r = A.validateSettings(okS()); assert.deepEqual(r.errors, []); assert.equal(r.data.whatsappNumber, "+918847050895"); assert.equal(r.data.currency, "INR");
  assert.equal(A.validateSettings({ ...okS(), whatsappNumber: "9876543210" }).data.whatsappNumber, "+919876543210");
  assert.deepEqual(f(A.validateSettings({ ...okS(), contactEmail: "nope", instagramURL: "https://evil.com/x", whatsappNumber: "12", currency: "RUPEE", logoURL: "http://x/a.png" })), ["contactEmail", "currency", "instagramURL", "logoURL", "whatsappNumber"]);
  assert.deepEqual(f(A.validateSettings({ ...okS(), announcementEnabled: true })), ["announcementText"]); });
await t("settings: only known fields, only changed ones written, unknown preserved", async () => { assert.deepEqual(Object.keys(A.validateSettings(okS()).data).sort(), [...A.SETTINGS_FIELDS].sort());
  store.data.siteSettings = { public: { ...okS(), whatsappNumber: "+918847050895", currency: "INR", extraUnknown: 1 } }; const patch = A.changedFields(store.data.siteSettings.public, { ...A.validateSettings(okS()).data, siteName: "New Name" });
  assert.deepEqual(Object.keys(patch), ["siteName"]); store.writes.length = 0; await S.saveSettings(patch, true); const d = store.data.siteSettings.public; assert.equal(d.siteName, "New Name"); assert.equal(d.extraUnknown, 1); assert.equal(d.contactEmail, "a@b.co"); assert.deepEqual(store.writes.map(w => w[1] + "/" + w[2]), ["siteSettings/public"]); });
await t("settings: missing doc is created as siteSettings/public (no other collection)", async () => { delete store.data.siteSettings.public; assert.deepEqual(await S.getSettings(), { exists: false, data: {} }); await S.saveSettings({ siteName: "X" }, false); assert.equal(store.data.siteSettings.public.siteName, "X"); assert.deepEqual(Object.keys(store.data).filter(k => /setting/i.test(k)), ["siteSettings"]); });
await t("activity log service is read-only", async () => { assert.deepEqual(Object.keys(G), ["listLogs"]); store.data.adminActivityLogs = { l1: { action: "x", createdAt: "2026-10-19T00:00:00Z" } }; assert.equal((await G.listLogs()).length, 1); });

await t("dashboard summaries come only from the records given", () => {
  const o = A.summarizeOrders([{ status: "pending" }, { status: "confirmed" }, { status: "processing" }, { status: "shipped" }, { status: "delivered" }, { status: "cancelled" }, { status: "weird" }]); assert.equal(o.total, 7); assert.equal(o.toShip, 2); assert.equal(o.other, 1);
  assert.deepEqual(A.summarizeOrders([]).total, 0);
  const p = A.summarizeProducts([{ isActive: true, trackInventory: true, stockQuantity: 0 }, { isActive: true, trackInventory: true, stockQuantity: 2, lowStockThreshold: 3 }, { isActive: true, trackInventory: false }, { isActive: false, trackInventory: true, stockQuantity: 0 }, { isActive: true, isAvailable: false, trackInventory: true, stockQuantity: 50, lowStockThreshold: 3 }]);
  assert.deepEqual(p, { total: 5, active: 4, inactive: 1, unavailable: 1, low: 1, out: 1 });
  assert.equal(A.summarizeReviews([{ isApproved: false }, { isApproved: true }, {}]).pending, 2); assert.deepEqual(A.summarizeRequests([{ status: "new" }, { status: "quoted" }]), { total: 2, fresh: 1 }); });
console.log(pass + " stage-4 checks passed");
