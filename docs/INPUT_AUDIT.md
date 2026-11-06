# Input audit

## Files actually opened
| File | Result |
|---|---|
| `The_Chocolate_Story_Admin_Panel_Master_Prompt.txt` | Read in full |
| `firestore.rules` | Read in full |
| `the_chocolate_story_firestore.json` | Read in full (exported 2026-10-19, project `the-chocolate-story`) |
| `132840.jpg` (logo, 1536x1024) | Opened and viewed; copied unchanged to `assets/logo.jpg` |

## Collections found (14, one sample document each)
`adminActivityLogs`, `banners`, `categories`, `customOrderRequests`, `highlightItems`, `highlights`, `orders`, `paymentTransactions`, `products`, `reviews`, `shipments`, `siteSettings` (document id `public`), `users`, `wishlists`. Nested `users/{uid}/addresses` exists in the rules but has no sample data in the export. No document carries an `isDemo` flag.

## Key permission restrictions (from the supplied rules)
- Admin = verified Google sign-in with email exactly `thechocolatestory.ind@gmail.com`.
- `orders`: no browser create/delete. Admin update may change only `status`, `updatedAt`, `adminNote`; `updatedAt` must equal the server time and the status must follow `validOrderTransition`.
- `paymentTransactions` and `adminActivityLogs`: admin read only; all browser writes denied.
- `shipments`, `products`, `categories`, `banners`, `highlights`, `highlightItems`, `reviews`, `siteSettings`: admin full write.
- `customOrderRequests`: admin read/update/delete; the rules do not validate the `status` values on admin update.
- `users`: admin get/list and unrestricted update by the rules (this app will not edit customers). Addresses: admin read only.
- Everything not listed is denied.

## Sample-data inconsistencies (not "fixed", not imported)
- The export converts timestamps to ISO strings; real Firestore types were not verified.
- `paymentTransactions`: status `created`, `signatureVerified: false`, yet `verifiedAt` is set (2026-10-18, earlier than `createdAt`).
- `shipments`: status `pending` but `shippedAt` and `deliveredAt` are filled; `shippedAt` is earlier than `createdAt`; the linked order is still `pending`; `trackingNumber` and `trackingURL` are empty.
- `orders`: `items` is empty, `customerEmail`/`customerPhone` empty; subtotal 599 + delivery 80 = total 679 is consistent. Its `userId` is the admin's own uid, so it looks like a test order.
- `reviews`, `wishlists`, `adminActivityLogs`: contain placeholder ids (`PRODUCT_DOCUMENT_ID`, `ORDER_DOCUMENT_ID`, `FIREBASE_USER_UID`).
- `customOrderRequests`: blank name, phone, description and `userId`; this could not have been created through the customer create rule.
- `products.categoryId` is empty; all image fields are empty.
- `siteSettings.public.instagramURL` in the export uses a `?xtok=` parameter, while the master prompt uses `?vrfl=`. Stage 4 will show the stored value and will not overwrite it silently.
- `highlightItems.highlightId` correctly points to the existing highlight.

## Update (manual UPI workflow)
The sample order `1PMQeBcjsRZwDCoq8cvg` and payment record `O1wB4kEtebwB4or9tXk9` listed below were deleted from the live database by the owner; they are history only and were never imported. The findings above describe the first export. See `docs/MANUAL_UPI_WORKFLOW.md` for the current workflow.

## Integration limits
No trusted backend is supplied: no Razorpay verification, no reliable audit logging, no safe stock reservation, no courier API. The storefront source was not provided, so storefront compatibility is not claimed.
