-- ============================================================
-- 007 — Stripe payments
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Run AFTER sql/006_delivery_waiver.sql
-- ============================================================
-- A booking must be PAID before it becomes an order. The customer pays
-- while the booking is still a `draft`; the Stripe webhook is what flips
-- the booking to `submitted` and creates the order (see
-- services/payment_service.js + services/booking_service.js#submitBooking).
--
-- Money is stored twice on purpose:
--   amount        NUMERIC(12,2) — GBP major units, matches bookings.calculated_price
--   amount_minor  INTEGER       — pence, the exact integer sent to Stripe
-- Reading a report should never require dividing by 100, and reconciling
-- against Stripe should never require multiplying by 100.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Payment status
--    Shared by payments.status and the payment_status columns added to
--    bookings/orders below. 'unpaid' is only ever used by those two
--    columns (a payments row exists only once payment was attempted).
--    Safe to create + use in the same transaction because this is a NEW
--    type — unlike ALTER TYPE ... ADD VALUE, which is what forced the
--    two-file split in 005/005b.
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM (
    'unpaid',
    'pending',
    'processing',
    'succeeded',
    'failed',
    'cancelled',
    'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- 2) PAYMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CASCADE: a draft booking can still be deleted by the customer, and a
  -- never-confirmed PaymentIntent row has no value once it's gone.
  -- Deleting a booking that has a SUCCEEDED payment is blocked in
  -- services/booking_service.js#deleteBooking, so real money is never
  -- cascaded away.
  booking_id                UUID REFERENCES bookings(id) ON DELETE CASCADE,
  order_id                  UUID REFERENCES orders(id) ON DELETE SET NULL,
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Stripe references
  stripe_payment_intent_id  TEXT NOT NULL,
  stripe_client_secret      TEXT,
  stripe_charge_id          TEXT,

  amount                    NUMERIC(12,2) NOT NULL,
  amount_minor              INTEGER NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'gbp',
  status                    payment_status NOT NULL DEFAULT 'pending',

  payment_method_type       TEXT,
  receipt_url               TEXT,
  failure_message           TEXT,
  refunded_amount           NUMERIC(12,2) NOT NULL DEFAULT 0,

  paid_at                   TIMESTAMPTZ,
  refunded_at               TIMESTAMPTZ,

  -- Last Stripe event applied (event id + type), for webhook traceability.
  meta                      JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per PaymentIntent. This is the constraint that makes webhook
  -- replays and double "confirm" calls harmless.
  CONSTRAINT payments_intent_unique UNIQUE (stripe_payment_intent_id)
);

CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Only the backend's SUPABASE_SECRET_KEY (service role) may touch payments.
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3) Bookings — payment state
--    Denormalized from payments so the booking list/detail screens don't
--    need a join just to show a "Paid" badge.
-- ------------------------------------------------------------
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_status payment_status NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_at        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings (payment_status);

-- ------------------------------------------------------------
-- 4) Orders — payment state
--    Existing orders are backfilled as 'unpaid' because they predate the
--    pay-before-order rule; that is accurate, not a bug.
-- ------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status payment_status NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_id     UUID REFERENCES payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status);

COMMENT ON COLUMN orders.paid_amount IS
  'Amount actually captured by Stripe (amount_received), not the quoted price';

-- ------------------------------------------------------------
-- Done. Verify: payments table exists; bookings/orders have payment_status.
-- ------------------------------------------------------------
