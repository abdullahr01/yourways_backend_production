-- ============================================================
-- 005b — Migrate remaining drivers.status = 'suspended' → 'blocked'
--
-- Run this ONLY AFTER sql/005_driver_and_catalog.sql has finished
-- successfully (new query / second Run in Supabase SQL Editor).
--
-- Safe to re-run: if no 'suspended' rows remain, this updates 0 rows.
-- Do NOT paste this into the same Run as 005.
-- ============================================================

UPDATE drivers
SET status = 'blocked'
WHERE status::text = 'suspended';
