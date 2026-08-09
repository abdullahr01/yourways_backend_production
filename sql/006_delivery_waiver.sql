-- ============================================================
-- 006 — Delivery waiver acceptance flag on orders
-- Run AFTER sql/005 (+ 005b if needed).
-- ============================================================
-- Before completing delivery, the driver shows a waiver / T&Cs form
-- on their screen; the customer checks it. Backend stores that the
-- waiver was accepted (true) along with the order.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_waiver_accepted BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN orders.delivery_waiver_accepted IS
  'Customer accepted the delivery waiver / T&Cs on the driver device before order completion';
