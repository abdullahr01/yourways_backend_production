-- ============================================================
-- YourWays Logistics — Supabase / Postgres schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================
-- Matches YourWays.docx workflow + existing Express models:
--   Booking (quote) → Order (fulfillment)
--   Status: pending → confirmed → outForPickup → pickupCompleted
--           → outForDropOff → completed | cancelled
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE driver_status AS ENUM ('active', 'inactive', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('draft', 'submitted', 'converted_to_order');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'pending',
    'confirmed',
    'pickupScheduled',
    'outForPickup',
    'pickupCompleted',
    'outForDropOff',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE date_flexibility AS ENUM (
    'Exact Date Only',
    'Within 3 Days',
    'Within a Week',
    'Flexible'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE property_type AS ENUM (
    'House',
    'Flat',
    'Studio',
    'Storage Unit',
    'Office',
    'Flatshare'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE floor_level AS ENUM (
    'Ground Floor',
    '1st Floor',
    '2nd Floor',
    '3rd Floor+',
    'Basement'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE parking_access AS ENUM (
    'Easy Access (Driveway/Loading Bay)',
    'Difficult Access (Permits/Long Carry)',
    'Street Parking',
    'Restricted Access',
    'No Parking Nearby'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE manpower_required AS ENUM (
    '1 Man (Driver Assisted)',
    '2 Man Team',
    '3 Man Team',
    '4+ Man Team'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE packing_service AS ENUM (
    'None',
    'Materials Only',
    'Fragile Items Only',
    'Full Packing Service'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- Helper: auto-update updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 1) USERS (customers)
-- Doc 6.1: register/login by phone (OTP later via Firebase)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT NOT NULL,
  address       TEXT,
  dob           DATE,
  status        user_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_phone_unique UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 2) DRIVERS
-- Doc 4.2 / 6.4: login, assigned orders, location, images/signatures on order
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  email                 TEXT NOT NULL,
  phone                 TEXT NOT NULL,
  address               TEXT,
  dob                   DATE,
  license_number        TEXT,
  vehicle_type          TEXT,
  vehicle_number        TEXT,
  is_approved_by_admin  BOOLEAN NOT NULL DEFAULT FALSE,
  status                driver_status NOT NULL DEFAULT 'inactive',
  is_online             BOOLEAN NOT NULL DEFAULT FALSE,
  last_online_at        TIMESTAMPTZ,
  -- live tracking (Doc 6.6)
  current_latitude      DOUBLE PRECISION,
  current_longitude     DOUBLE PRECISION,
  location_updated_at   TIMESTAMPTZ,
  completed_orders      INTEGER NOT NULL DEFAULT 0,
  rating                NUMERIC(3,2) NOT NULL DEFAULT 0,
  total_ratings         INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT drivers_email_unique UNIQUE (email),
  CONSTRAINT drivers_phone_unique UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS idx_drivers_phone ON drivers (phone);
CREATE INDEX IF NOT EXISTS idx_drivers_online ON drivers (is_online);
CREATE INDEX IF NOT EXISTS idx_drivers_approved ON drivers (is_approved_by_admin);

DROP TRIGGER IF EXISTS trg_drivers_updated_at ON drivers;
CREATE TRIGGER trg_drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 3) BOOKINGS (quotation / draft before order)
-- Doc 6.2 Steps 1–4: goods, locations, quotation, confirm
-- App statuses: draft → submitted → converted_to_order
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Route & timing
  collection_postcode       TEXT NOT NULL,
  delivery_postcode         TEXT NOT NULL,
  move_date                 TIMESTAMPTZ,
  date_flexibility          date_flexibility NOT NULL DEFAULT 'Exact Date Only',

  -- Property details
  collection_property_type  property_type NOT NULL DEFAULT 'House',
  delivery_property_type    property_type NOT NULL DEFAULT 'House',
  collection_floor_level    floor_level NOT NULL DEFAULT 'Ground Floor',
  delivery_floor_level      floor_level NOT NULL DEFAULT 'Ground Floor',
  collection_lift_access    BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_lift_access      BOOLEAN NOT NULL DEFAULT FALSE,
  parking_access            parking_access NOT NULL DEFAULT 'Easy Access (Driveway/Loading Bay)',

  -- Service level
  manpower_required         manpower_required NOT NULL DEFAULT '2 Man Team',
  dismantling_required      BOOLEAN NOT NULL DEFAULT FALSE,
  packing_service           packing_service NOT NULL DEFAULT 'None',
  insurance_value           NUMERIC(12,2) NOT NULL DEFAULT 0,
  job_notes                 TEXT NOT NULL DEFAULT '',

  -- Contact
  full_name                 TEXT NOT NULL,
  email                     TEXT NOT NULL,
  mobile_number             TEXT NOT NULL,
  accept_terms              BOOLEAN NOT NULL,

  -- Items: [{ itemId, category, itemName, quantity, modifiers }]
  items                     JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Quotation (Doc 6.2 Step 3)
  calculated_price          NUMERIC(12,2),
  price_breakdown           JSONB,

  -- Lifecycle
  status                    booking_status NOT NULL DEFAULT 'draft',
  submitted_at              TIMESTAMPTZ,
  converted_order_id        UUID, -- filled after order created (FK added below)

  meta                      JSONB DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_user_status_created
  ON bookings (user_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON bookings;
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 4) ORDERS (fulfillment — Doc sections 6.3, 6.4, 7)
-- Pending → Confirmed → Out for Pickup → Pickup Completed
-- → Out for Dropoff → Order Completed | cancelled
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code              TEXT NOT NULL, -- e.g. ORD-20260722-120000-1234 (API "orderId")
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  booking_id              UUID REFERENCES bookings(id) ON DELETE SET NULL,
  driver_id               UUID REFERENCES drivers(id) ON DELETE SET NULL,

  service_name            TEXT NOT NULL,
  status                  order_status NOT NULL DEFAULT 'pending',

  -- Locations
  pickup_location         TEXT NOT NULL,
  delivery_location       TEXT NOT NULL,

  -- Dates
  pickup_datetime         TIMESTAMPTZ,
  delivery_datetime       TIMESTAMPTZ,
  pickup_completed_at     TIMESTAMPTZ,
  delivery_completed_at   TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,

  -- Property details
  pickup_property_type    TEXT NOT NULL,
  delivery_property_type  TEXT NOT NULL,
  pickup_floor_level      TEXT NOT NULL,
  delivery_floor_level    TEXT NOT NULL,
  pickup_lift_access      BOOLEAN NOT NULL,
  delivery_lift_access    BOOLEAN NOT NULL,

  -- Service details
  manpower_required       TEXT NOT NULL,
  packing_service         TEXT NOT NULL,
  dismantling_required    BOOLEAN NOT NULL,
  parking_access          TEXT NOT NULL,
  insurance_value         NUMERIC(12,2) NOT NULL DEFAULT 0,
  job_notes               TEXT NOT NULL DEFAULT '',

  -- Customer contact snapshot
  customer_name           TEXT NOT NULL,
  customer_email          TEXT NOT NULL,
  customer_phone          TEXT NOT NULL,

  -- Items + extras collected by driver
  items                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  additional_items        JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Photos & signatures (Doc 6.4)
  pickup_photos           JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_photos         JSONB NOT NULL DEFAULT '[]'::jsonb,
  pickup_signature        TEXT,
  delivery_signature      TEXT,
  driver_comment          TEXT,

  -- Pricing
  total_price             NUMERIC(12,2) NOT NULL DEFAULT 0,
  quoted_price            NUMERIC(12,2),

  cancellation_reason     TEXT,
  meta                    JSONB DEFAULT '{}'::jsonb,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT orders_order_code_unique UNIQUE (order_code)
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders (driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_booking_id ON orders (booking_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_status_created
  ON orders (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_driver_status
  ON orders (driver_id, status);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Link booking → order (after orders table exists)
DO $$ BEGIN
  ALTER TABLE bookings
    ADD CONSTRAINT bookings_converted_order_id_fkey
    FOREIGN KEY (converted_order_id) REFERENCES orders(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- RLS: lock tables from public/anon; backend uses SECRET key (bypasses RLS)
-- ------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- No public policies = only service role (your Express SUPABASE_SECRET_KEY) can access.
-- Add Flutter/user policies later if you call Supabase directly from the app.

-- ------------------------------------------------------------
-- Done. Verify in Table Editor: users, drivers, bookings, orders
-- ------------------------------------------------------------
