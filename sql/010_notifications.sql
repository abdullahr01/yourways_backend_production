-- ============================================================
-- 010 — Push notifications (Firebase Cloud Messaging)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Run AFTER sql/009_one_order_per_booking.sql
-- ============================================================
-- The backend sends pushes with firebase-admin (services/notification_service.js);
-- the Flutter apps register their FCM device tokens with
-- POST /api/notifications/device-token.
--
--   device_tokens   one row per app install; a person can have several
--   notifications   one row per push we attempted — the duplicate guard and
--                   the delivery log
--   orders          pickup/dropoff arrival times, set by the driver's
--                   "I've arrived" button
-- ============================================================

-- ------------------------------------------------------------
-- 1) DEVICE TOKENS
--    owner_id is a users / drivers / admins id depending on owner_type, so
--    there is no foreign key. The token itself is unique: when someone else
--    logs in on the same phone, the row is re-pointed at the new owner.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT NOT NULL,
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('user', 'driver', 'admin')),
  owner_id      UUID NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  app           TEXT NOT NULL CHECK (app IN ('customer', 'driver', 'admin')),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT device_tokens_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_owner ON device_tokens (owner_type, owner_id);

DROP TRIGGER IF EXISTS trg_device_tokens_updated_at ON device_tokens;
CREATE TRIGGER trg_device_tokens_updated_at
  BEFORE UPDATE ON device_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2) NOTIFICATIONS
--    A row is inserted BEFORE sending. dedupe_key is unique, so a second
--    attempt for the same event (double tap, retried request) fails the
--    insert and is skipped. The key is built by the service, e.g.
--    '<orderId>:arrived_pickup:user:<userId>'; for driver_assigned it also
--    carries the driver id so a re-assignment notifies the customer again.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type    TEXT NOT NULL CHECK (recipient_type IN ('user', 'driver', 'admin')),
  recipient_id      UUID NOT NULL,
  order_id          UUID REFERENCES orders(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  dedupe_key        TEXT,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  data              JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  tokens_targeted   INTEGER NOT NULL DEFAULT 0,
  tokens_succeeded  INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT notifications_dedupe_key_unique UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications (recipient_type, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_order_id ON notifications (order_id);

DROP TRIGGER IF EXISTS trg_notifications_updated_at ON notifications;
CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3) ORDERS — driver arrival times
-- ------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pickup_arrived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dropoff_arrived_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- Done. Verify: device_tokens and notifications tables exist;
-- orders has pickup_arrived_at / dropoff_arrived_at.
-- ------------------------------------------------------------
