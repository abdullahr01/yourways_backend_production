-- ============================================================
-- 009 — One order per paid booking
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Run AFTER sql/008_storage_buckets.sql (order only matters for docs)
-- ============================================================
-- The app confirm call and the Stripe webhook can both try to turn a paid
-- booking into an order at the same instant. Without a unique constraint,
-- both succeed and ops sees two jobs for one Stripe charge.
--
-- This script:
--   1. Cancels the extra order(s) for any booking that already has more than
--      one (keeps the row bookings.converted_order_id points at, else the
--      oldest). Detaches extras so they no longer share booking_id.
--   2. Adds a unique index so that race can never insert a second order.
--
-- Admin-created jobs with no booking (booking_id IS NULL) are unchanged.
-- There is no refund here — the customer was charged once.

-- 1) Cancel duplicates
WITH ranked AS (
  SELECT
    o.id,
    o.booking_id,
    ROW_NUMBER() OVER (
      PARTITION BY o.booking_id
      ORDER BY
        CASE WHEN o.id = b.converted_order_id THEN 0 ELSE 1 END,
        o.created_at ASC
    ) AS rn,
    FIRST_VALUE(o.id) OVER (
      PARTITION BY o.booking_id
      ORDER BY
        CASE WHEN o.id = b.converted_order_id THEN 0 ELSE 1 END,
        o.created_at ASC
    ) AS keeper_id
  FROM orders o
  JOIN bookings b ON b.id = o.booking_id
  WHERE o.booking_id IS NOT NULL
)
UPDATE orders o
SET
  status = 'cancelled',
  cancellation_reason =
    'Duplicate order from concurrent payment confirmation (webhook + /confirm). Same booking already has an order. Customer was charged once — this is not a refund.',
  booking_id = NULL,
  meta = COALESCE(o.meta, '{}'::jsonb) || jsonb_build_object(
    'duplicateOfBookingId', r.booking_id,
    'keeperOrderId', r.keeper_id
  )
FROM ranked r
WHERE o.id = r.id
  AND r.rn > 1;

-- 2) One booking → one order (admin jobs with no booking are excluded)
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_per_booking
  ON orders (booking_id)
  WHERE booking_id IS NOT NULL;
