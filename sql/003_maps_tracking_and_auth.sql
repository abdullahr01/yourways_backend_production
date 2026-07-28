-- ============================================================
-- YourWays Logistics — Maps/Tracking coordinates + token revocation
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================
-- Adds:
--   1) Lat/lng columns on bookings + orders (Google Geocoding API results),
--      used for map pins and as the destination reference for live ETA
--      calculations on the order tracking endpoint.
--   2) `revoked_tokens` table — enables real JWT logout (Section: Security).
--      Every JWT issued now carries a unique `jti`; logging out inserts that
--      jti here so `middleware/auth.js` rejects the token on every future
--      request even though the JWT signature itself is still valid.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Bookings — pickup/delivery coordinates
-- ------------------------------------------------------------
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS collection_latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS collection_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_latitude    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_longitude   DOUBLE PRECISION;

-- ------------------------------------------------------------
-- 2) Orders — pickup/delivery coordinates (copied from booking at
--    conversion time, or geocoded directly for orders created without one)
-- ------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pickup_latitude    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pickup_longitude   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_orders_pickup_coords ON orders (pickup_latitude, pickup_longitude);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_coords ON orders (delivery_latitude, delivery_longitude);

-- ------------------------------------------------------------
-- 3) Revoked tokens (JWT logout / blacklist)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti         UUID PRIMARY KEY,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at ON revoked_tokens (expires_at);

ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;
-- No public policies = only the backend's SUPABASE_SECRET_KEY (service role) can read/write.

-- Note on Realtime: driver location + order status updates are pushed via
-- Supabase Realtime "Broadcast" (services/realtime_service.js), which does
-- NOT require enabling the `supabase_realtime` publication or any RLS
-- policies — broadcast channels are independent of Postgres change
-- replication. No further Realtime setup is required in this migration.

-- ------------------------------------------------------------
-- Done. Verify new columns on bookings/orders and the revoked_tokens table.
-- ------------------------------------------------------------
