# Storefront compatibility checklist (for later)

Do this only when the customer storefront source is available. Nothing here has been verified against it.

1. **Firebase:** same project id `the-chocolate-story`; the storefront must not initialise a second app.
2. **Collections and fields:** compare every collection path and field name the storefront reads or writes with `docs/FIREBASE_DATA_CONTRACT.md` (14 collections plus `users/{uid}/addresses`).
3. **Products:** `slug`, `primaryImage`/`images`, `basePrice`, `deliveryCharge`, `isActive`/`isAvailable`, `trackInventory`/`stockQuantity`/`allowBackorder`. **Options shape:** confirm the storefront understands `{id,name,type:"choice"|"text",required,choices[{label,priceAdjustment}],maxLength,priceAdjustment}` or change one side.
4. **Orders:** shape of `items[]` (the admin reads `selections:[{group,label,text}]`), `shippingAddress`, `orderNumber`; new orders must be `status: pending`, `paymentStatus: pending`, a UPI `paymentMethod`, with `customerEmail`, `customerPhone` and `userId`. The storefront (or a backend) creates orders, since the admin and the rules do not allow it. Its status text should read Pending Payment Verification / Order Confirmed / Shipped / Delivered and its payment label needs a `verified` entry.
5. **Shipments:** the admin writes `shipped` and `delivered` (plus `orderId`, `userId`, `shippedAt`, `deliveredAt`, tracking fields). Confirm the customer page reads exactly these and handles blank tracking.
6. **Custom requests:** whether the storefront writes the status words this panel uses (`new` is required by the rules) and reads `adminNote`.
7. **Reviews:** only `isApproved == true` is public; decide on a rejected state and rating aggregation (backend).
8. **Content:** banners (`imageURL`, optional `mobileImageURL`, `buttonLink` as a site path or https), highlights/slides (`coverImageURL`, `highlightId`), ordering by `sortOrder`.
9. **Settings:** which `siteSettings/public` fields it reads (`logoURL`, `faviconURL`, `maintenanceMode`, announcement); whether to add delivery-estimate fields (needs a shared schema and rules change).
10. **Images:** the storefront must accept Cloudinary `res.cloudinary.com` URLs.
11. **Rules and backend:** publish `docs/firestore.rules.updated`. Order creation, customer cancellation, stock handling and audit logging need a trusted backend. Decide where stock is reduced in the manual flow (nothing does it now). Remove Razorpay code and wording from the storefront.
