-- ============================================================
-- YourWays Logistics — Full street address capture for pickup/delivery
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================
-- WHY THIS MIGRATION EXISTS:
-- Bookings only ever captured a POSTCODE (e.g. "SW1A 1AA") for collection/
-- delivery. A postcode is not a usable location for a driver — it does not
-- identify the house/flat number, street, or building. When a booking was
-- converted into an order, `orders.pickup_location` / `delivery_location`
-- (the fields shown to the driver) ended up containing *just the postcode*,
-- which is not enough information to actually find the address.
--
-- This migration adds:
--   1) `collection_address` / `delivery_address` on `bookings` — the actual
--      street address text typed/picked by the customer (house number,
--      street, flat/unit, etc.), required going forward at the app layer.
--   2) `collection_formatted_address` / `delivery_formatted_address` on
--      `bookings` — Google's canonical formatted address from the Geocoding
--      API response. This was already being returned by
--      `services/maps_service.js#geocode()` but was previously discarded;
--      it's now stored and preferred (when available) as the authoritative,
--      cleaned-up address shown to the driver.
--   3) Structured `pickup_address_line` / `pickup_postcode` /
--      `delivery_address_line` / `delivery_postcode` on `orders` — so the
--      driver app can render address + postcode separately if it wants to,
--      in addition to the combined `pickup_location` / `delivery_location`
--      string (which now contains the FULL address, not just a postcode).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Bookings — real street address + Google's formatted address
-- ------------------------------------------------------------
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS collection_address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_address   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS collection_formatted_address TEXT,
  ADD COLUMN IF NOT EXISTS delivery_formatted_address   TEXT;

-- Drop the '' default after backfilling existing rows so that, going
-- forward, the DB doesn't silently accept a missing address either
-- (the app layer already rejects it, this is defense-in-depth).
ALTER TABLE bookings ALTER COLUMN collection_address DROP DEFAULT;
ALTER TABLE bookings ALTER COLUMN delivery_address DROP DEFAULT;

-- ------------------------------------------------------------
-- 2) Orders — structured address components (copied from the booking at
--    conversion time, alongside the existing pickup_location/delivery_location
--    which now carries the full human-readable address instead of a bare postcode)
-- ------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pickup_address_line   TEXT,
  ADD COLUMN IF NOT EXISTS pickup_postcode       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address_line TEXT,
  ADD COLUMN IF NOT EXISTS delivery_postcode     TEXT;

-- ------------------------------------------------------------
-- Done. Existing rows get collection_address/delivery_address = '' (visible,
-- obviously-incomplete data you can spot and backfill manually if needed).
-- New bookings created after this migration REQUIRE a real address — see
-- services/booking_service.js#createBooking.
-- ------------------------------------------------------------
