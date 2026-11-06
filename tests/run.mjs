import assert from "node:assert/strict";
const fs = await import("./stubs/firestore.js"); const store = fs.store;
const P = await import("../js/services/products.js"), C = await import("../js/services/categories.js");
const L = await import("../js/services/product-logic.js"), U = await import("../js/services/util.js"), UP = await import("../js/services/upload.js");
let pass = 0; const t = async (name, fn) => { try { await fn(); pass++; console.log("ok  ", name); } catch (e) { console.log("FAIL", name, "\n    ", e.message); process.exitCode = 1; } };
const base = () => ({ name: "Truffle Cake", slug: "truffle-cake", description: "d", shortDescription: "s", seoTitle: "", seoDescription: "", categoryId: "",
  productType: "fixed", basePrice: "599", deliveryCharge: "80", images: ["https://res.cloudinary.com/x/a.jpg"], primaryImage: "", options: [],
  tags: "a, b, a", searchKeywords: "Cake, CHOC", trackInventory: true, stockQuantity: "12", lowStockThreshold: "3", allowBackorder: false,
  isAvailable: true, isActive: true, isFeatured: false, sortOrder: "1" });

await t("slugify", () => { assert.equal(L.slugify("  Choc & Caf\u00e9 Box! "), "choc-and-cafe-box"); assert.equal(L.slugify("###"), ""); });
await t("valid product normalises", () => { const r = L.validateProduct(base()); assert.deepEqual(r.errors, []); assert.equal(r.data.basePrice, 599); assert.equal(r.data.primaryImage, base().images[0]);
  assert.deepEqual(r.data.tags, ["a", "b"]); assert.deepEqual(r.data.searchKeywords, ["cake", "choc"]); });
await t("rejects bad money/ints/slug/type", () => { const v = base(); Object.assign(v, { basePrice: "-1", deliveryCharge: "", stockQuantity: "1.5", slug: "Bad Slug", productType: "bespoke", name: "  " });
  const f = L.validateProduct(v).errors.map(e => e.field).sort(); assert.deepEqual(f, ["basePrice", "deliveryCharge", "name", "productType", "slug", "stockQuantity"]); });
await t("rejects 3 decimals and huge price", () => { for (const x of ["10.123", "99999999"]) { const v = base(); v.basePrice = x; assert.equal(L.validateProduct(v).errors[0].field, "basePrice"); } });
await t("non-https image rejected", () => { const v = base(); v.images = ["http://x/a.jpg"]; assert.ok(L.validateProduct(v).errors.some(e => e.field === "images")); });
await t("stock off: blank stock allowed", () => { const v = base(); v.trackInventory = false; v.stockQuantity = ""; assert.deepEqual(L.validateProduct(v).errors, []); });
await t("stock status", () => { assert.equal(L.stockStatus({ trackInventory: true, stockQuantity: 0 }), "out"); assert.equal(L.stockStatus({ trackInventory: true, stockQuantity: 0, allowBackorder: true }), "backorder");
  assert.equal(L.stockStatus({ trackInventory: true, stockQuantity: 3, lowStockThreshold: 3 }), "low"); assert.equal(L.stockStatus({ trackInventory: true, stockQuantity: 12, lowStockThreshold: 3 }), "in"); assert.equal(L.stockStatus({ trackInventory: false }), "untracked"); });
await t("options: normalised, ids unique, unknown preserved", () => { const raw = { weird: true };
  const { options, errors } = L.normalizeOptions([{ name: "Size", type: "choice", required: true, choices: [{ label: "500g", priceAdjustment: "0" }, { label: "1kg", priceAdjustment: "300" }] },
    { name: "Message", type: "text", required: false, maxLength: "", priceAdjustment: "" }, raw]);
  assert.deepEqual(errors, []); assert.equal(options[0].id, "size"); assert.equal(options[0].choices[1].priceAdjustment, 300); assert.equal(options[1].maxLength, 100); assert.strictEqual(options[2], raw); });
await t("options: errors", () => { const e = L.normalizeOptions([{ name: "A", type: "choice", choices: [] }, { name: "a", type: "text" }, { name: "B", type: "choice", choices: [{ label: "x", priceAdjustment: "abc" }] }]).errors; assert.equal(e.length, 3); });

await t("create product writes defaults + timestamps", async () => { const id = await P.createProduct(L.validateProduct(base()).data); const d = store.data.products[id];
  assert.equal(d.reviewCount, 0); assert.equal(d.createdAt, "TS"); assert.equal(d.updatedAt, "TS"); assert.equal(d.name, "Truffle Cake"); });
await t("update keeps unknown fields (targeted update)", async () => { const id = Object.keys(store.data.products)[0]; store.data.products[id].legacyField = "keep";
  await P.updateProduct(id, { basePrice: 650 }); assert.equal(store.data.products[id].legacyField, "keep"); assert.equal(store.data.products[id].basePrice, 650); });
await t("slugTaken excludes self", async () => { const id = Object.keys(store.data.products)[0]; assert.equal(await P.slugTaken("truffle-cake"), true); assert.equal(await P.slugTaken("truffle-cake", id), false); assert.equal(await P.slugTaken("nope"), false); });
await t("product usage + delete", async () => { const id = Object.keys(store.data.products)[0]; store.data.reviews = { r1: { productId: id } }; store.data.wishlists = { w1: { productIds: [id] } };
  assert.deepEqual(await P.productUsage(id), { reviews: 1, wishlists: 1 }); await P.deleteProduct(id); assert.equal(store.data.products[id], undefined); });

await t("category create/list sorted", async () => { await C.createCategory({ name: "B", slug: "b", sortOrder: 2, isActive: true }); await C.createCategory({ name: "A", slug: "a", sortOrder: 1, isActive: true });
  await C.createCategory({ name: "C", slug: "c", sortOrder: 3, isActive: false }); assert.deepEqual((await C.listCategories()).map(c => c.name), ["A", "B", "C"]); });
await t("reorder renumbers and writes only changes (one batch)", async () => { const l = await C.listCategories(); store.writes.length = 0;
  const n = await C.saveOrder([l[1], l[0], l[2]]); assert.equal(n, 2); assert.deepEqual(store.writes.filter(w => w[0] === "batch"), [["batch", 2]]); assert.deepEqual((await C.listCategories()).map(c => c.name), ["B", "A", "C"]); });
await t("category in use is detected", async () => { const cat = (await C.listCategories())[0]; store.data.products = { p9: { name: "X", categoryId: cat.id } };
  assert.equal((await C.productsInCategory(cat.id)).length, 1); assert.equal((await C.productsInCategory("zzz")).length, 0); });

await t("permission-denied surfaces truthfully and writes nothing", async () => { const before = JSON.stringify(store.data.products); store.failNext = "permission-denied";
  await assert.rejects(() => P.createProduct(L.validateProduct(base()).data), e => /blocked by current Firebase permissions/.test(U.describeError(e))); assert.equal(JSON.stringify(store.data.products), before); });
await t("error wording", () => { assert.match(U.describeError({ code: "unavailable" }), /Network/); assert.match(U.describeError({ code: "unauthenticated" }), /sign-in/); assert.match(U.describeError({}), /unknown/); });
await t("upload file validation", () => { assert.match(UP.validateImageFile({ type: "image/gif", size: 5 }), /JPG/); assert.match(UP.validateImageFile({ type: "image/png", size: 9 * 1024 * 1024 }), /8 MB/);
  assert.match(UP.validateImageFile({ type: "image/png", size: 0 }), /empty/); assert.equal(UP.validateImageFile({ type: "image/webp", size: 1000 }), null);
  assert.equal(UP.isCloudinaryUrl("https://res.cloudinary.com/a/b.jpg"), true); assert.equal(UP.isCloudinaryUrl("blob:https://x/1"), false); assert.equal(UP.isCloudinaryUrl("https://evilcloudinary.com/a"), false); });
console.log(pass + " checks passed");
