# Firestore rules update required for the manual UPI workflow

**Your current rules (the `firestore.rules` you supplied) were used as the baseline. Nothing else in them is changed.**
Two things the finalized workflow needs are blocked by those rules, so the admin panel cannot do them until the rules below are published. This is the only Firebase configuration change required.

## What the current rules block
1. **Payment status cannot be changed.** An order update may change only `status`, `updatedAt` and `adminNote`. "Approve Order" must also set `paymentStatus` from `pending` to `verified`.
2. **`confirmed -> shipped` is not a valid transition.** The current chain is `confirmed -> processing -> shipped`. The finalized workflow has no "processing" step: Mark as Shipped happens straight from Order Confirmed.

(Writing the shipment record, `shippedAt` and `deliveredAt` already works: admins can write `shipments` under your current rules. Orders and payment records cannot take new timestamp fields, so the order's own `updatedAt` plus the shipment's dates are used. No new fields were invented.)

## The exact change (three small edits)
The full result is in **`docs/firestore.rules.updated`**, and the line-by-line difference is in **`docs/firestore.rules.diff`**.

1. In `validOrderTransition`, allow `shipped` after `confirmed`:
   `newStatus in ['confirmed', 'processing', 'shipped', 'cancelled']` (was `['confirmed', 'processing', 'cancelled']`). `processing` is kept so older orders can still be moved on.
2. Add a helper that lets `paymentStatus` change **only** from `pending` to `verified`, and **only** in the same write that approves the order (`pending -> confirmed`); in every other write it must stay unchanged:
   ```
   function validPaymentStatusChange() {
     return request.resource.data.get('paymentStatus', null) == resource.data.get('paymentStatus', null)
       || (resource.data.status == 'pending'
         && request.resource.data.status == 'confirmed'
         && resource.data.get('paymentStatus', null) == 'pending'
         && request.resource.data.paymentStatus == 'verified');
   }
   ```
3. In `match /orders/{orderId}`, add `'paymentStatus'` to `changedOnly([...])` and append `&& validPaymentStatusChange()` to the update rule.

## What this does and does not allow
- Still admin-only (verified Google sign-in as `thechocolatestory.ind@gmail.com`).
- Still no browser create or delete of orders; prices, totals, items and addresses still cannot be changed.
- Payment can become `verified` **only** as part of approving a pending order. It cannot be set on a shipped, delivered or cancelled order, cannot go back, and cannot be set to any other value.
- Delivered and cancelled orders stay terminal; a shipped order still cannot be cancelled.
- `paymentTransactions`, `adminActivityLogs` and everything else are untouched.

## How to apply it
1. Firebase Console, project **the-chocolate-story**, then **Firestore Database -> Rules**.
2. Open `docs/firestore.rules.updated`, copy its whole contents, paste over the existing rules, and press **Publish**.
3. Optional check in the Console's *Rules Playground*: as the admin account, an update of an order from `pending` to `confirmed` with `paymentStatus` `verified` should be allowed; changing `paymentStatus` on its own should be denied.
4. To roll back, republish your previous rules.

## If you use the panel before publishing
Approve Order and Mark as Shipped will be refused by Firebase. The panel then says so plainly ("Firebase refused this change, so nothing was saved...") and changes nothing. It never shows success when Firestore refuses. Mark as Delivered, Cancel and notes keep working under the old rules.

## A reminder about the storefront
Your rules also say customers cannot create or cancel orders from the browser. Whatever creates new UPI orders and handles customer cancellation must therefore still be a trusted server (as the storefront's own README describes), or the rules must be changed deliberately. That is outside this admin panel.
