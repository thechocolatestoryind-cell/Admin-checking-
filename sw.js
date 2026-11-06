// Service worker: caches ONLY the static app shell. It never touches Firebase, Cloudinary or any
// other-origin request, and never caches POST/PUT or anything outside the list below.
const VERSION = "tcs-admin-v5";
const CACHE = VERSION + "-shell";
const SHELL = [
  "./", "index.html", "login.html", "dashboard.html", "products.html", "product-edit.html", "categories.html",
  "orders.html", "order-detail.html", "shipments.html", "payments.html", "customers.html", "custom-orders.html",
  "reviews.html", "content.html", "activity-logs.html", "settings.html", "offline.html", "manifest.webmanifest",
  "css/base.css", "css/app.css",
  "js/config.js", "js/firebase.js", "js/collections.js", "js/pages.js", "js/auth.js", "js/common.js",
  "js/page.js", "js/login.js", "js/index.js",
  "js/services/util.js", "js/services/product-logic.js", "js/services/upload.js", "js/services/products.js", "js/services/categories.js",
  "js/services/order-logic.js", "js/services/fulfilment.js", "js/services/orders.js", "js/services/shipments.js", "js/services/payments.js", "js/services/users.js",
  "js/services/content-logic.js", "js/services/admin-logic.js", "js/services/content.js", "js/services/reviews.js", "js/services/requests.js", "js/services/settings.js", "js/services/logs.js",
  "js/ui/forms.js", "js/ui/uploader.js", "js/ui/bits.js", "js/ui/fulfil-dialogs.js", "js/ui/lightbox.js", "js/ui/imagefield.js",
  "js/pages/dashboard.js", "js/pages/content.js", "js/pages/content-banners.js", "js/pages/content-highlights.js", "js/pages/reviews.js", "js/pages/custom-orders.js", "js/pages/settings.js", "js/pages/activity-logs.js",
  "js/pages/orders.js", "js/pages/order-detail.js", "js/pages/shipments.js", "js/pages/payments.js", "js/pages/customers.js", "js/pages/products.js", "js/pages/product-edit.js", "js/pages/categories.js",
  "assets/logo.jpg", "assets/icon-192.png", "assets/icon-512.png", "assets/icon-maskable-512.png",
  "assets/apple-touch-icon.png", "assets/favicon-48.png"
];
const shellPaths = new Set(SHELL.map(p => new URL(p, self.location).pathname));

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));   // no skipWaiting: the page offers the update
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("message", e => { if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;   // leave everything else alone
  e.respondWith((async () => {
    try {
      const res = await fetch(req);                                          // network first so updates apply
      if (res.ok && shellPaths.has(url.pathname)) (await caches.open(CACHE)).put(url.pathname, res.clone());
      return res;
    } catch (_) {
      const hit = await caches.match(url.pathname, { cacheName: CACHE });
      if (hit) return hit;
      if (req.mode === "navigate") return (await caches.match(new URL("offline.html", self.location).pathname, { cacheName: CACHE })) || Response.error();
      return Response.error();
    }
  })());
});
