# Manual UPI order workflow: change report

## 1. What was found
- **Admin ZIP:** the existing panel (HTML, CSS, vanilla JS, Firebase Auth and Firestore, Cloudinary, PWA). Google-only sign-in for `thechocolatestory.ind@gmail.com`; pages for dashboard, products, categories, orders, shipments, payments, customers, custom requests, reviews, banners/highlights, settings and activity log. Folders `js/`, `js/pages`, `js/services`, `js/ui`, `css`, `assets`, `docs`, `tests`. The empty files named `Assets`, `Css`, `Docs`, `Js`, `Ui`, `Services`, `Page`, `Test`, `Stubs`, `Bro` are leftovers from creating folders on GitHub and were left alone.
- **Old order flow in the admin:** statuses pending, confirmed, processing, shipped, delivered, cancelled; buttons offered whatever the rules allowed; a read-only Payments page built around Razorpay transaction records and their "signature" flags; a payment-records card on each order.
- **Storefront ZIP (compatibility reference only, not modified):** still the earlier Razorpay version. Orders are created by a trusted backend (customers cannot create them under the rules), the order page shows status steps pending, confirmed, processing, shipped, delivered, reads the customer's shipment with `orderId` + `userId`, and sends cancellation to a backend endpoint (allowed only before shipping). The updated UPI storefront was not supplied.
- **Firestore JSON:** the sample order `1PMQeBcjsRZwDCoq8cvg` and payment record `O1wB4kEtebwB4or9tXk9` are deleted in the live database per your note. Nothing from the JSON was imported or recreated, and no collection was deleted.
- **Rules:** your supplied `firestore.rules`, used as the baseline (see section 6).

## 2. Final statuses and labels
| Database status | Label in the admin |
|---|---|
| `pending` (with `paymentStatus` `pending`) | **Pending Payment Verification** |
| `confirmed` (with `paymentStatus` `verified`) | **Order Confirmed** |
| `shipped` | **Shipped** |
| `delivered` | **Delivered** |
`cancelled` keeps working as before, and `processing` is shown only for older orders ("Processing (older orders)"). No duplicate status fields and no new status values were introduced.

## 3. The workflow (all manual, no timers)
1. **New order** arrives from the storefront as `pending` / `pending` with a UPI payment method. It appears under **Pending Payment Verification** in Orders and on the Payments page.
2. **Verify payment (you, outside the panel).** The customer pays to `kirti07kkapoor@okhdfcbank` and sends a screenshot on WhatsApp (+91 88470 50895) to your phone. The panel does not receive or store screenshots and says so. A screenshot alone is not proof: you check your bank/UPI app for the real credit.
3. **Approve Order.** On the order page tick "I have checked my bank/UPI account...", then press Approve Order and confirm. The order becomes `confirmed`, payment becomes `verified`, `updatedAt` is saved. The button stays locked until the box is ticked. Nothing approves automatically.
4. **Mark as Shipped.** Once you hand the parcel to the courier: a form asks for courier (default DTDC), tracking number and link (both optional, never invented), the handed-over date and an optional estimated delivery date. One atomic save sets the order to `shipped` and creates (or updates) its `shipments` record with `status: shipped`, `shippedAt`, `orderId` and the order's `userId`, so the customer's tracking page works. If the save fails, nothing changes.
5. **Mark as Delivered.** After delivery is confirmed: pick the date; one atomic save sets the order to `delivered` and the shipment to `delivered` with `deliveredAt`. Final.
6. **Cancel** remains available only before shipping (pending or confirmed). No refund system exists: if a customer already paid, you return the money yourself.
Every action first re-reads the order, so a stale screen cannot overwrite a newer state, and success is shown only after Firestore accepts the write.

## 4. Files
**Modified (16 code/test files and the docs listed below)**
`js/collections.js`, `js/config.js`, `js/pages.js`, `js/pages/dashboard.js`, `js/pages/order-detail.js`, `js/pages/orders.js`, `js/pages/payments.js`, `js/pages/shipments.js`, `js/services/order-logic.js`, `js/services/orders.js`, `js/ui/bits.js`, `css/base.css`, `sw.js` (new files added to the cache list, cache version raised), `tests/run3.mjs`, `tests/stubs/firestore.js`, `tests/browser/smoke.cjs`; documentation: `README.md`, `docs/ADMIN_SECURITY_NOTES.md`, `docs/FIREBASE_DATA_CONTRACT.md`, `docs/QA_REPORT.md`, `docs/STOREFRONT_COMPATIBILITY_CHECKLIST.md`, `docs/INPUT_AUDIT.md`.

**New**
`js/services/fulfilment.js` (Approve / Ship / Deliver, atomic and re-checked), `js/ui/fulfil-dialogs.js` (the two shipping forms), `docs/FIRESTORE_RULES_UPDATE.md`, `docs/firestore.rules.updated`, `docs/firestore.rules.diff`, `docs/MANUAL_UPI_WORKFLOW.md`, `tests/run5.mjs`.

**Deliberately unchanged**
Sign-in and the access guard (`js/auth.js`, `js/firebase.js`, `login.html`, `index.html`), products and categories (all pages and services), inventory, customers, reviews, custom requests, banners, highlights, settings, activity log, image upload and Cloudinary settings, navigation, all page HTML files, `css/app.css`, icons and logo, `manifest.webmanifest`, `offline.html`, and the product, category and customer logic tests.

## 5. What was removed or replaced (only the old payment workflow)
- The Razorpay-centred Payments page and its "signature verified" flags; the payment-record flags on the order page; the "processing" step as a button; the old status buttons.
- **Not removed:** historical database fields, the `paymentTransactions` and `shipments` collections, or any document. Older payment records are still listed, read-only and as stored, under Payments, then Older records.
- There never was, and still is not, any payment gateway, COD, automatic shipping timer, scheduled status change, fake courier scan or simulated parcel location in the admin.

## 6. Security and rules
See `docs/FIRESTORE_RULES_UPDATE.md`. In short: your current rules block writing `paymentStatus` and the direct `confirmed -> shipped` step, so a **small, admin-only rules update is required** (three edits, provided ready to paste). The panel never weakens rules, never puts a secret in the browser, and reports refusals honestly. No backend, scheduler or service account was added.

## 7. Coordination needed with the storefront (not done here)
- **Order creation:** the storefront must create orders as `status: pending`, `paymentStatus: pending`, with a UPI payment method value (any value containing "upi" is labelled "UPI (manual verification)"; other values are shown as stored), plus `customerEmail`, `customerPhone`, the item snapshot and `userId`. Under the current rules this needs a trusted server, because customers cannot write orders.
- **Customer-facing labels:** its status text should read Pending Payment Verification / Order Confirmed / Shipped / Delivered, and its payment label needs a `verified` entry (today an unknown value is shown in plain capitals, "Verified"). Its `processing` step can be dropped.
- **Shipment tracking:** the admin writes `status` `shipped` / `delivered`, `shippedAt`, `deliveredAt`, `courierName`, `trackingNumber`, `trackingURL`, `estimatedDeliveryDate`, `orderId`, `userId`, matching what the storefront already reads.
- **Customer cancellation:** unchanged and still only before shipping; it must keep working through its own trusted endpoint.
- **Stock:** in the old flow the backend reduced stock when a payment was verified. Nothing in the manual flow does that, and the admin does not change stock on approval. Decide where stock is reduced (at order creation by the storefront server, or by hand in Products).
- Remove the Razorpay code/text from the storefront checkout and its "online payment only" wording.

## 8. Deployment
1. Publish `docs/firestore.rules.updated` in the Firebase Console (section 6). Do this **before** using Approve Order or Mark as Shipped.
2. Upload the updated admin files to your host (replace the old ones; `sw.js` changed, so installed copies show an "Update now" bar).
3. Sign in as the owner and run the checks in the README.
