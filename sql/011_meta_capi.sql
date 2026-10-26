-- ============================================================
-- 011 — Meta Conversions API outbox
-- Run AFTER sql/010_notifications.sql in each target database.
-- Do not run on production until the server and website changes are ready.
-- ============================================================

-- Private context captured from the browser on payment-intent creation. It is
-- intentionally not included in the Payment model's public response shape.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS meta_capi_context JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS meta_capi_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          TEXT NOT NULL UNIQUE,
  event_name        TEXT NOT NULL CHECK (event_name IN ('Lead', 'Purchase')),
  payload           JSONB,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts          INTEGER NOT NULL DEFAULT 0,
  next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at         TIMESTAMPTZ,
  last_error_code   TEXT,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_capi_events_due
  ON meta_capi_events (next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing');

DROP TRIGGER IF EXISTS trg_meta_capi_events_updated_at ON meta_capi_events;
CREATE TRIGGER trg_meta_capi_events_updated_at
  BEFORE UPDATE ON meta_capi_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE meta_capi_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE meta_capi_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE meta_capi_events TO service_role;

-- Atomically lease due rows so multiple app instances do not send a row at
-- the same time. A process crash releases its lease after five minutes.
CREATE OR REPLACE FUNCTION claim_meta_capi_events(p_limit INTEGER DEFAULT 10)
RETURNS SETOF meta_capi_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT id
    FROM meta_capi_events
    WHERE (status = 'pending' AND next_attempt_at <= NOW())
       OR (status = 'processing' AND locked_at < NOW() - INTERVAL '5 minutes')
    ORDER BY created_at
    LIMIT GREATEST(1, LEAST(p_limit, 50))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE meta_capi_events AS event
  SET status = 'processing',
      attempts = event.attempts + 1,
      locked_at = NOW()
  FROM due
  WHERE event.id = due.id
  RETURNING event.*;
END;
$$;

REVOKE ALL ON FUNCTION claim_meta_capi_events(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_meta_capi_events(INTEGER) TO service_role;

-- ============================================================
-- Done. Verify payments.meta_capi_context and meta_capi_events exist.
-- ============================================================
