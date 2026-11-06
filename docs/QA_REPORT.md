# QA report

## Update: manual UPI workflow (latest change)
**Checked:** syntax of every module; every one of the 46 non-entry modules imports cleanly under stubs (no missing exports); the order status transitions in code equal `validOrderTransition` in `docs/firestore.rules.updated`, and that file differs from your supplied rules in exactly three places (a test confirms this); 19 new Node checks against a fake Firestore cover Approve Order (status + payment verified + updatedAt only), refusal on stale screens, Mark as Shipped (creates or updates the shipment in one atomic batch, never invents tracking, clears a stale delivery date), Mark as Delivered (with and without a shipment), terminal states, cancellation before shipping, date validation, labels and the `selections` customisation shape. The older logic tests still pass.
**Not run in any browser:** the rewritten order page, the Pending/Confirmed/Shipped section tabs, the new Payments page, the two shipping dialogs, the dashboard labels. They follow the same patterns as the earlier, browser-tested screens, but treat your own first click-through as the real test. `tests/browser/smoke.cjs` was edited for the new flow and **has not been re-run**; it also still expects the first export's format.
**Never testable here:** real Firestore rules (the updated rules were only compared by text), real Google sign-in, real UPI/WhatsApp behaviour, the updated storefront.

# Earlier QA report (before the manual UPI change)

## Live tests (against the real Firebase / Cloudinary / a real phone)
**None were possible.** No credentials, sign-in or network access to your project were available. Nothing below should be read as a live result.

## Checks that were run
**Static review (every stage and again at the end)**
- Syntax of every JS module and the service worker.
- Every internal link, nav target, `<script>`/`<link>` reference, module import and service-worker file entry resolves to a real file.
- `assets/logo.jpg` is byte-identical to the uploaded `132840.jpg`; the three manifest icons exist at their declared sizes and were produced from the logo by resizing/padding only.
- Firebase config and `initializeApp` exist once (`js/firebase.js`); no secret, key or service-account text anywhere; the 14 collection names equal the export's; no `innerHTML`/`eval`, no localStorage/sessionStorage, no root-absolute URLs, no coupon/COD UI.
- The order status transitions in code were compared with the rules' `validOrderTransition` for every status pair (no mismatches).

**Logic and service tests (Node, in-memory fake Firestore): 56 checks**
Validation of products, options, shipments, settings, banners, highlights, slides; order status writes limited to `status`/`adminNote`/`updatedAt`; targeted updates keep unknown fields; review moderation writes only `isApproved`; request updates write only `status`/`adminNote`; settings write only changed fields to `siteSettings/public`; read-only services expose no write functions; cascade delete removes only a highlight's own slides.

**Headless Chromium with Firebase replaced by stubs, seeded from your export: 91 checks (last run after the final code change)**
Signed-out, wrong-account and unverified-email access; all 15 screens at phone (390 px) and desktop (1280 px) width with no JavaScript errors, no page-level horizontal scroll and no stray `null`/`undefined`/`NaN`/`[object]` text; main flows of products, categories, orders, shipments, banners, highlights, reviews, custom requests, settings and dashboard (including a failed read with Retry); the sidebar logo keeping its size on a short window.

## Not tested
- Real Google sign-in and your authorised-domain setup.
- Your actual Firestore rules against these queries and writes (for example whether `request.time` comparisons pass with the SDK's server timestamp, or whether list queries need indexes).
- Real Cloudinary uploads and your preset's restrictions.
- The service worker, caching, update bar and offline page **in a real browser** (they were reviewed in code; browser tests ran with the service worker blocked).
- Installing on a real Android phone and the Chrome install prompt.
- Tablet widths, other browsers, screen readers.
- Behaviour with a large amount of real data (lists load everything and filter in the browser, which suits a small shop).

## Findings fixed along the way (real bugs found by testing)
Private pages stayed hidden after sign-in; key-value lists printed "[object HTMLElement]"; a stray "null" appeared next to image fields and the shipments button; the sidebar logo collapsed on short windows.

## Known issues / limits
See README section 8 and `docs/FIREBASE_DATA_CONTRACT.md`. The placeholder fallback in `js/page.js` is unused now that every page has a screen.
