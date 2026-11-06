// Real-Chromium smoke test. Firebase SDK URLs are routed to in-memory stubs; data is seeded from the uploaded export.
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../.."), OUT = process.env.SHOTS || "/tmp/shots"; fs.mkdirSync(OUT, { recursive: true });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html"; const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": mime[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); });
const exp = JSON.parse(fs.readFileSync(process.env.EXPORT, "utf8"))._collections;
const seed = {}; for (const [c, list] of Object.entries(exp)) { seed[c] = {}; list.forEach((d, i) => { const { _documentId, ...rest } = d; seed[c][_documentId || c + (i + 1)] = rest; }); }
const oid = Object.keys(seed.orders)[0], UID = Object.keys(seed.users)[0]; for (const c of ["shipments", "paymentTransactions"]) for (const k in seed[c]) seed[c][k].orderId = oid;
seed["users/" + UID + "/addresses"] = { a1: { fullName: "Rahul Sharma", phone: "9876543210", addressLine1: "House 1", city: "Kolkata", state: "West Bengal", pincode: "700001", isDefault: true } };
const HID = Object.keys(seed.highlights)[0], RID = Object.keys(seed.reviews)[0], QID = Object.keys(seed.customOrderRequests)[0];
const OWNER = { email: "thechocolatestory.ind@gmail.com", emailVerified: true, photoURL: null, providerData: [{ providerId: "google.com" }] };
const fail = []; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fail.push(m); };

(async () => {
  await new Promise(r => server.listen(0, r)); const base = "http://localhost:" + server.address().port + "/";
  const browser = await chromium.launch();
  async function open(user, vp, label) {
    const ctx = await browser.newContext({ viewport: vp, serviceWorkers: "block" }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push("pageerror: " + e.message)); page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
    await page.route("https://www.gstatic.com/firebasejs/**", route => { const n = route.request().url().split("/").pop(); const f = { "firebase-app.js": "app.js", "firebase-auth.js": "auth.js", "firebase-firestore.js": "firestore.js" }[n];
      route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(path.join(ROOT, "tests/stubs", f)) }); });
    await page.route(u => !u.href.startsWith(base) && !u.href.includes("gstatic.com"), r => r.abort());
    await page.addInitScript(([s, u]) => { globalThis.__SEED__ = s; globalThis.__USER__ = u; globalThis.__PERSIST__ = true; }, [seed, user]);
    return { ctx, page, errs, label };
  }
  const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const junkText = async page => /\[object|\bnull\b|\bundefined\b|\bNaN\b/.test(await page.locator("body").innerText());
  const settle = async page => { await page.waitForLoadState("networkidle"); await page.waitForTimeout(300); };

  // 1. access control
  let t = await open(null, { width: 390, height: 844 });
  await t.page.goto(base + "dashboard.html"); await t.page.waitForURL(/login\.html/); ok(/next=dashboard\.html/.test(t.page.url()), "signed-out dashboard -> login with next"); ok(await t.page.locator(".sidebar, #main").count() === 0, "no private UI rendered while signed out");
  await t.page.locator("#btn-signin").waitFor(); await t.page.screenshot({ path: OUT + "/login-mobile.png" }); await t.ctx.close();
  t = await open({ ...OWNER, email: "someone@else.com" }, { width: 390, height: 844 }); await t.page.goto(base + "orders.html"); await t.page.waitForURL(/login\.html/);
  await t.page.locator("#state-denied").waitFor({ state: "visible" }); ok(true, "wrong account sees Access denied"); await t.page.screenshot({ path: OUT + "/denied-mobile.png" }); ok(!(await t.page.content()).includes("TCS-2026"), "no order data leaked to wrong account"); await t.ctx.close();
  t = await open({ ...OWNER, emailVerified: false }, { width: 390, height: 844 }); await t.page.goto(base + "orders.html"); await t.page.waitForURL(/login\.html/); await t.page.locator("#state-denied").waitFor({ state: "visible" }); ok(true, "unverified email denied"); await t.ctx.close();

  // 2. every page renders for the owner on mobile and desktop
  const url = p => base + (p.includes("?") ? p.replace("?", ".html?") : p + ".html");
  const pages = ["dashboard", "products", "product-edit", "categories", "orders", "order-detail?id=" + oid, "shipments", "payments", "customers", "customers?id=" + UID, "custom-orders", "custom-orders?id=" + QID, "reviews", "content", "content?tab=highlights", "activity-logs", "settings"];
  for (const vp of [{ width: 390, height: 844, n: "mobile" }, { width: 1280, height: 800, n: "desktop" }]) {
    t = await open(OWNER, vp);
    for (const p of pages) {
      const before = t.errs.length; await t.page.goto(url(p)); await t.page.locator("#main h1").waitFor(); await settle(t.page);
      const ov = await overflow(t.page), junk = /\[object|\bnull\b|\bundefined\b|\bNaN\b/.test(await t.page.locator("body").innerText()); ok(t.errs.length === before && ov <= 0 && !junk, vp.n + " " + p + " renders (js errors: " + (t.errs.length - before) + ", horizontal overflow: " + ov + "px, stray [object] text: " + junk + ")");
      if (t.errs.length > before) console.log("   ", t.errs.slice(before).join(" | "));
      if (["dashboard", "orders", "order-detail?id=" + oid, "products", "shipments", "payments", "customers?id=" + UID, "categories", "product-edit"].includes(p)) await t.page.screenshot({ path: OUT + "/" + vp.n + "-" + p.split("?")[0] + ".png", fullPage: true });
    }
    await t.ctx.close();
  }

  // 3. interactions (desktop)
  t = await open(OWNER, { width: 1280, height: 900 }); const P = t.page; const store = () => P.evaluate(() => globalThis.__STORE__.data);
  await P.goto(url("order-detail?id=" + oid)); await P.locator("h3", { hasText: "Verify the payment first" }).waitFor();
  ok(await P.locator("button", { hasText: "Approve Order" }).isDisabled() && await P.locator("button", { hasText: "Cancel order" }).count() === 1, "pending order: Approve is locked until you tick the bank-check box; Cancel is offered");
  ok(await P.locator("button", { hasText: /Mark as (Shipped|Delivered)/ }).count() === 0, "no shipping buttons on an unapproved order");
  ok(await P.locator("text=kirti07kkapoor@okhdfcbank").count() >= 1 && await P.locator("text=not this panel").count() === 1, "UPI ID shown and the panel does not pretend to receive WhatsApp screenshots");
  await P.locator("label.check", { hasText: "I have checked my bank" }).locator("input").check(); await P.locator("button", { hasText: "Approve Order" }).first().click(); await P.locator("dialog button", { hasText: "Approve Order" }).click(); await P.locator("#toasts .toast-success").waitFor();
  let o = (await store()).orders[oid]; ok(o.status === "confirmed" && o.paymentStatus === "verified" && o.totalAmount === 679 && o.subtotal === 599, "Approve Order: confirmed + payment verified, amounts untouched");
  await P.locator("textarea[aria-label='Internal note']").fill("Call before delivery"); await P.locator("button", { hasText: "Save note" }).click(); await P.waitForFunction(id => globalThis.__STORE__.data.orders[id].adminNote === "Call before delivery", oid);
  ok((await store()).orders[oid].status === "confirmed", "note saved without touching status");
  ok(await P.locator("button", { hasText: "Mark as Shipped" }).count() === 1 && await P.locator("button", { hasText: "Approve Order" }).count() === 0, "after approval the next action is Mark as Shipped");
  await P.locator("button", { hasText: "Cancel order" }).click(); ok(await P.locator("dialog", { hasText: "does not refund" }).count() === 1, "cancel dialog warns that no refund is made"); await P.locator("dialog button", { hasText: "Cancel" }).first().click();
  ok((await store()).orders[oid].status === "confirmed", "dismissing the dialog changes nothing");
  ok(await P.locator("text=Earlier payment records").count() === 1, "older payment records shown only as read-only history");

  // rules refusing a write is reported truthfully
  await P.evaluate(() => { globalThis.__STORE__.failNext = "permission-denied"; }); await P.locator("textarea[aria-label='Internal note']").fill("another note"); await P.locator("button", { hasText: "Save note" }).click();
  await P.locator("#toasts .toast-error").waitFor(); ok(/Firebase refused this change/.test(await P.locator("#toasts .toast-error").first().innerText()) && (await store()).orders[oid].adminNote === "Call before delivery", "permission-denied shown truthfully, nothing changed");

  // Mark as Shipped: one action creates the shipment and ships the order
  await P.locator("button", { hasText: "Mark as Shipped" }).click(); await P.locator("dialog form").waitFor(); await P.locator("dialog button[type=submit]").click();
  await P.waitForFunction(id => globalThis.__STORE__.data.orders[id].status === "shipped", oid); const shp = Object.values((await store()).shipments).find(x => x.orderId === oid && x.status === "shipped");
  ok(shp && shp.courierName === "DTDC" && shp.trackingNumber === "" && shp.userId === UID && (await store()).orders[oid].status === "shipped", "Mark as Shipped: order shipped, shipment saved with no invented tracking, customer id copied");
  await P.locator("button", { hasText: "Mark as Delivered" }).waitFor(); await P.locator("button", { hasText: "Mark as Delivered" }).click(); await P.locator("dialog form").waitFor(); await P.locator("dialog button[type=submit]").click();
  await P.waitForFunction(id => globalThis.__STORE__.data.orders[id].status === "delivered", oid); ok(Object.values((await store()).shipments).some(x => x.orderId === oid && x.status === "delivered"), "Mark as Delivered: order and shipment both delivered");
  ok(await P.locator("button", { hasText: /Mark as|Approve|Cancel order/ }).count() === 0, "delivered order is final: no actions offered");

  // shipments: create from order link
  await P.goto(url("shipments?order=" + oid)); await P.locator("form").waitFor(); ok((await P.locator("form select").first().inputValue()) === oid, "order preselected from link");
  await P.locator("form select").nth(2).selectOption("shipped"); await P.locator("button[type=submit]").click(); ok(await P.locator("form .field-error:not([hidden])", { hasText: "handed to the courier" }).count() === 1, "manual shipment form: shipped without a date is rejected inline");

  // products + categories
  await P.goto(url("categories")); await P.locator("text=Add category").first().click(); await P.locator("form input").first().fill("Gift Boxes"); ok(!(await junkText(P)), "category form shows no stray null/undefined text"); ok((await P.locator("form input").nth(1).inputValue()) === "gift-boxes", "category slug auto-filled");
  await P.locator("button[type=submit]").click(); await P.waitForFunction(() => Object.keys(globalThis.__STORE__.data.categories).length === 2); ok(true, "category created");
  await P.goto(url("product-edit")); await P.locator("form").waitFor(); await P.locator("button[type=submit]").click(); ok(await P.locator(".field-error:not([hidden])").count() >= 2 && await P.locator(".form-banner:not([hidden])").count() === 1, "empty product shows inline errors and banner");
  await P.locator("input").first().fill("Dark Truffle Box"); await P.locator("[data-field=basePrice] input").fill("799"); await P.locator("button[type=submit]").click();
  await P.waitForURL(/product-edit\.html\?id=/); await P.locator("form").waitFor(); ok(Object.values((await store()).products).some(p => p.name === "Dark Truffle Box" && p.basePrice === 799 && p.slug === "dark-truffle-box" && p.reviewCount === 0), "product created with slug, price and defaults");
  await P.screenshot({ path: OUT + "/desktop-product-saved.png", fullPage: true });
  await t.ctx.close(); ok(t.errs.length === 0, "no JS errors during interactions" + (t.errs.length ? ": " + t.errs.join(" | ") : ""));

  // 4. Stage 4 flows
  t = await open(OWNER, { width: 1280, height: 900 }); const Q = t.page; const st = () => Q.evaluate(() => globalThis.__STORE__.data);
  await Q.goto(url("dashboard")); await Q.locator(".stat").first().waitFor();
  const tileText = async l => (await Q.locator(".stat", { hasText: l }).first().innerText()).replace(/\s+/g, " ");
  ok(/^1 All orders/.test(await tileText("All orders")) && /^1 Awaiting payment verification/.test(await tileText("Awaiting payment verification")) && /^1 Need your attention/.test(await tileText("Need your attention")), "dashboard order counts come from the records read");
  ok(/^1 Reviews waiting/.test(await tileText("Reviews waiting")) && /^1 New custom requests/.test(await tileText("New custom requests")) && /^1 Active products/.test(await tileText("Active products")), "dashboard review/request/product counts");
  ok(await Q.locator("text=No revenue is shown").count() === 1 && await Q.locator("h2", { hasText: "Recent orders" }).count() === 1, "dashboard states it shows no revenue; recent orders listed");
  await Q.evaluate(() => { globalThis.__STORE__.failNext = "permission-denied"; }); await Q.locator("button", { hasText: "Refresh" }).click(); await Q.locator("section:has(h2:text-is('Orders')) .error-text").waitFor();
  ok(/blocked by current Firebase permissions/.test(await Q.locator("section:has(h2:text-is('Orders')) .error-text").innerText()) && await Q.locator("section:has(h2:text-is('Orders')) .stat").count() === 0 && await Q.locator(".stat", { hasText: "Active products" }).count() === 1, "failed read shows an error + retry, not fake zeros; other cards still load");
  await Q.locator("section:has(h2:text-is('Orders')) button", { hasText: "Retry" }).click(); await Q.locator(".stat", { hasText: "All orders" }).waitFor(); ok(true, "retry recovers");
  await Q.goto(url("orders?status=pending")); await Q.locator(".row-card").first().waitFor(); ok(/^Pending Payment Verification/.test(await Q.locator(".tab[aria-selected=true]").innerText()), "dashboard link opens the Pending Payment Verification section");

  // banners
  await Q.goto(url("content")); await Q.locator("text=Banners").first().waitFor(); await Q.locator("li.row-card", { hasText: "Chocolate Gift Collection" }).waitFor(); ok(true, "existing banner listed");
  await Q.locator("button", { hasText: "Add banner" }).click(); await Q.locator("form input").first().fill("Diwali Box"); ok(!(await junkText(Q)), "banner form + preview show no stray null/undefined text"); await Q.locator("[data-field=buttonText] input").fill("Shop"); await Q.locator("[data-field=buttonLink] input").fill("javascript:alert(1)");
  await Q.locator("form [type=checkbox]").check(); await Q.locator("button[type=submit]").click();
  const errTxt = await Q.locator("form .field-error:not([hidden])").allInnerTexts(); ok(errTxt.some(x => /Add an image/.test(x)) && errTxt.some(x => /site path/.test(x)), "active banner without image and javascript: link are both rejected");
  await Q.locator("form [type=checkbox]").uncheck(); await Q.locator("[data-field=buttonLink] input").fill("/products"); await Q.locator("button[type=submit]").click(); await Q.waitForFunction(() => Object.keys(globalThis.__STORE__.data.banners).length === 2);
  const nb = Object.values((await st()).banners).find(b => b.title === "Diwali Box"); ok(nb && nb.buttonLink === "/products" && nb.isActive === false && nb.sortOrder === 2, "banner saved (inactive, order 2)");
  await Q.locator("li.row-card", { hasText: "Diwali Box" }).locator("button", { hasText: "Up" }).click(); await Q.waitForFunction(() => Object.values(globalThis.__STORE__.data.banners).find(b => b.title === "Diwali Box").sortOrder === 1);
  ok(Object.values((await st()).banners).find(b => b.title === "Chocolate Gift Collection").sortOrder === 2, "reorder swaps the two sort orders");
  await Q.locator("li.row-card", { hasText: "Diwali Box" }).locator("button", { hasText: "Activate" }).click(); await Q.locator("#toasts .toast-error", { hasText: "Add an image" }).waitFor(); ok(true, "cannot activate a banner that has no image");
  await Q.locator("li.row-card", { hasText: "Diwali Box" }).locator("button", { hasText: "Delete" }).click(); await Q.locator("dialog button", { hasText: "Delete banner" }).click(); await Q.waitForFunction(() => Object.keys(globalThis.__STORE__.data.banners).length === 1); ok(true, "banner deleted after confirmation");
  await Q.screenshot({ path: OUT + "/desktop-content-banners.png", fullPage: true });

  // highlights + slides
  await Q.locator("#tab-highlights").click(); await Q.locator("li.stack", { hasText: "Best Sellers" }).waitFor(); await Q.locator("li.stack", { hasText: "Best Sellers" }).locator("button", { hasText: "Slides" }).click();
  await Q.locator(".slides-panel", { hasText: "Freshly made chocolates" }).waitFor(); ok(true, "slides are listed under their own highlight");
  await Q.locator(".slides-panel button", { hasText: "Add slide" }).first().click(); await Q.locator(".slides-panel form [data-field=caption] input").fill("Gift boxes"); ok(!(await junkText(Q)), "slide form shows no stray text"); await Q.locator(".slides-panel button[type=submit]").click(); await Q.waitForFunction(() => Object.keys(globalThis.__STORE__.data.highlightItems).length === 2);
  ok(Object.values((await st()).highlightItems).some(i => i.caption === "Gift boxes" && i.highlightId === HID && i.sortOrder === 2 && i.isActive === false), "new slide carries the correct highlightId and next order");
  await Q.screenshot({ path: OUT + "/desktop-content-highlights.png", fullPage: true });
  await Q.locator("li.stack", { hasText: "Best Sellers" }).locator("button", { hasText: /^Delete$/ }).first().click(); ok(await Q.locator("dialog", { hasText: "also deletes its 2 slide(s)" }).count() === 1, "deleting a highlight warns it also deletes its slides");
  await Q.locator("dialog button", { hasText: /Delete highlight and 2/ }).click(); await Q.waitForFunction(() => !Object.keys(globalThis.__STORE__.data.highlights).length && !Object.keys(globalThis.__STORE__.data.highlightItems).length); ok(true, "highlight and its slides removed together, no orphans");

  // reviews
  await Q.goto(url("reviews")); await Q.locator("li.row-card", { hasText: "Excellent quality!" }).waitFor(); ok(await Q.locator("text=never edited").count() === 1 && await Q.locator("li.row-card button", { hasText: "Approve" }).count() === 1, "pending review listed first with moderation note");
  await Q.screenshot({ path: OUT + "/desktop-reviews.png", fullPage: true });
  await Q.locator("li.row-card button", { hasText: "Approve" }).click(); await Q.locator("dialog button", { hasText: /^Approve$/ }).click(); await Q.waitForFunction(id => globalThis.__STORE__.data.reviews[id].isApproved === true, RID);
  const rv = (await st()).reviews[RID]; ok(rv.reviewText === "Excellent quality!" && rv.rating === 5 && Array.isArray(rv.imageURLs) && rv.productId === "PRODUCT_DOCUMENT_ID", "approve changed isApproved only");
  await Q.locator("text=Nothing waiting for approval").waitFor(); ok(true, "empty pending state shown after approving");

  // custom requests
  await Q.goto(url("custom-orders")); await Q.locator("li.row-card", { hasText: "Unnamed customer" }).waitFor(); ok(true, "blank sample request shown honestly as unnamed");
  await Q.goto(url("custom-orders?id=" + QID)); await Q.locator("form").waitFor(); ok(await Q.locator("text=No usable phone number").count() === 1 && await Q.locator("a", { hasText: "Open WhatsApp" }).count() === 0, "no WhatsApp link invented when no phone number is stored");
  await Q.locator("form select").selectOption("contacted"); await Q.locator("form textarea").fill("Will call on Monday"); await Q.locator("button[type=submit]").click(); await Q.waitForFunction(id => globalThis.__STORE__.data.customOrderRequests[id].status === "contacted", QID);
  const cr = (await st()).customOrderRequests[QID]; ok(cr.adminNote === "Will call on Monday" && cr.contactMethod === "whatsapp" && cr.budget === 0 && Array.isArray(cr.referenceImageURLs), "request: only status/note changed, customer fields intact");
  await Q.screenshot({ path: OUT + "/desktop-custom-request.png", fullPage: true });

  // settings
  await Q.goto(url("settings")); await Q.locator("form").waitFor(); ok((await Q.locator("[data-field=siteName] input").inputValue()) === "The Chocolate Story" && !(await junkText(Q)) && (await Q.locator("[data-field=whatsappNumber] input").inputValue()) === "+918847050895", "settings prefilled from siteSettings/public");
  await Q.locator("button[type=submit]").click(); await Q.locator("#toasts .toast", { hasText: "No changes" }).waitFor(); ok(true, "saving without changes writes nothing");
  await Q.locator("[data-field=contactEmail] input").fill("nope"); await Q.locator("button[type=submit]").click(); ok(await Q.locator("[data-field=contactEmail] .field-error:not([hidden])").count() === 1, "invalid email rejected inline");
  await Q.locator("[data-field=contactEmail] input").fill("thechocolatestory.ind@gmail.com"); await Q.locator("[data-field=siteName] input").fill("The Chocolate Story Co"); await Q.evaluate(() => { globalThis.__STORE__.writes.length = 0; });
  await Q.locator("button[type=submit]").click(); await Q.waitForFunction(() => globalThis.__STORE__.data.siteSettings.public.siteName === "The Chocolate Story Co"); const ss = (await st()).siteSettings.public, wr = await Q.evaluate(() => globalThis.__STORE__.writes);
  ok(ss.instagramURL.includes("instagram.com") && ss.currency === "INR" && wr.length === 1 && wr[0][1] === "siteSettings" && wr[0][2] === "public", "only siteSettings/public written; other fields kept");
  await Q.locator("label.check", { hasText: "Maintenance mode on" }).locator("input").check(); await Q.locator("button[type=submit]").click(); ok(await Q.locator("dialog", { hasText: "maintenance mode" }).count() === 1, "maintenance mode asks for confirmation"); await Q.locator("dialog button", { hasText: "Cancel" }).click(); ok((await st()).siteSettings.public.maintenanceMode === false, "cancelled: maintenance mode unchanged");
  await Q.screenshot({ path: OUT + "/desktop-settings.png", fullPage: true });

  // sidebar logo must keep its size even on a short window
  await Q.setViewportSize({ width: 1280, height: 520 }); await Q.goto(url("dashboard")); await Q.locator(".brand img").waitFor(); const bb = await Q.locator(".brand").boundingBox(); ok(bb && bb.height >= 100 && bb.width >= 200, "sidebar logo keeps its size on a short window (" + Math.round(bb.width) + "x" + Math.round(bb.height) + ")");

  // activity log
  await Q.goto(url("activity-logs")); await Q.locator("li.row-card", { hasText: "New product created" }).waitFor(); ok(await Q.locator("text=Read-only").count() >= 1 && await Q.locator("main button:not(:has-text('Refresh')):not(:has-text('Show more'))").count() === 0, "activity log is read-only (no write controls)");
  await t.ctx.close(); ok(t.errs.length === 0, "no JS errors during Stage 4 flows" + (t.errs.length ? ": " + t.errs.join(" | ") : ""));
  await browser.close(); server.close(); console.log(fail.length ? fail.length + " FAILED" : "ALL OK"); process.exit(fail.length ? 1 : 0);
})();
