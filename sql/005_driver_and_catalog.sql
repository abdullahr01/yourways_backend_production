-- ============================================================
-- 005 — Driver profile picture + lifecycle status + service catalog
-- Run in: Supabase Dashboard → SQL Editor → New query
--
-- IMPORTANT: After this succeeds, ALSO run:
--   sql/005b_migrate_suspended_drivers.sql
-- Then: node scripts/seed_catalog.js
-- ============================================================

-- ------------------------------------------------------------
-- 1) Drivers: profile picture URL
-- ------------------------------------------------------------
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

-- ------------------------------------------------------------
-- 2) Driver status lifecycle
--    Was: active | inactive | suspended
--    Now: active | inactive | deactivated | blocked
--
--    Postgres rule: a newly ADD VALUE'd enum label cannot be USED
--    (e.g. in UPDATE) until the transaction that added it COMMITS.
--    Supabase runs this whole file as ONE transaction — so we do NOT
--    UPDATE ... SET status = 'blocked' in this file.
--
--    Preferred path: RENAME the old label in place (rows keep working,
--    no "use new value" problem).
-- ------------------------------------------------------------
ALTER TYPE driver_status ADD VALUE IF NOT EXISTS 'deactivated';

-- Rename suspended → blocked only when 'blocked' is not already present
-- (e.g. from a previous partial run of this migration).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'driver_status' AND e.enumlabel = 'suspended'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'driver_status' AND e.enumlabel = 'blocked'
  )   THEN
    ALTER TYPE driver_status RENAME VALUE 'suspended' TO 'blocked';
  END IF;
END $$;

-- Ensure 'blocked' exists even if there was never a 'suspended' label
-- to rename (or a prior partial run already created it). Safe no-op
-- when the RENAME above already produced 'blocked'. We still do NOT
-- UPDATE rows to 'blocked' in this file — that is 005b.
ALTER TYPE driver_status ADD VALUE IF NOT EXISTS 'blocked';

CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers (status);

-- ------------------------------------------------------------
-- 3) Service catalog tables (admin-managed, replaces static-only reads)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service_types (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id                TEXT NOT NULL,
  name                      TEXT NOT NULL,
  description               TEXT NOT NULL DEFAULT '',
  required_logistics        JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_dropoff_location BOOLEAN NOT NULL DEFAULT TRUE,
  pricing_model             TEXT NOT NULL DEFAULT 'instant',
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order                INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT service_types_service_id_unique UNIQUE (service_id)
);

CREATE INDEX IF NOT EXISTS idx_service_types_active_sort
  ON service_types (is_active, sort_order);

DROP TRIGGER IF EXISTS trg_service_types_updated_at ON service_types;
CREATE TRIGGER trg_service_types_updated_at
  BEFORE UPDATE ON service_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS service_categories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  pricing_multiplier  NUMERIC(8,3) NOT NULL DEFAULT 1,
  note                TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT service_categories_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_service_categories_active_sort
  ON service_categories (is_active, sort_order);

DROP TRIGGER IF EXISTS trg_service_categories_updated_at ON service_categories;
CREATE TRIGGER trg_service_categories_updated_at
  BEFORE UPDATE ON service_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Many-to-many: shared categories (Custom Item, Boxes & Packaging) attach to many service types
CREATE TABLE IF NOT EXISTS service_type_categories (
  service_type_id UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (service_type_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_stc_category_id ON service_type_categories (category_id);

CREATE TABLE IF NOT EXISTS service_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id             UUID NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  default_weight_kg       NUMERIC(10,2) NOT NULL DEFAULT 15,
  base_price              NUMERIC(12,2), -- optional admin override; NULL = use weight formula
  fragile_default         BOOLEAN NOT NULL DEFAULT FALSE,
  insurance_recommended   BOOLEAN NOT NULL DEFAULT FALSE,
  modifiers               JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT service_items_category_name_unique UNIQUE (category_id, name)
);

CREATE INDEX IF NOT EXISTS idx_service_items_category_active_sort
  ON service_items (category_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_service_items_name_lower
  ON service_items (lower(name));

DROP TRIGGER IF EXISTS trg_service_items_updated_at ON service_items;
CREATE TRIGGER trg_service_items_updated_at
  BEFORE UPDATE ON service_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: backend uses service role (bypasses RLS); lock public/anon
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_type_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_items ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Done with 005.
-- Next (separate query in SQL Editor):
--   1) sql/005b_migrate_suspended_drivers.sql
--   2) node scripts/seed_catalog.js
-- ------------------------------------------------------------
