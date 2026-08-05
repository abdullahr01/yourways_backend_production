/**
 * Admin-controlled driver lifecycle states (driver_status Postgres enum,
 * sql/005_driver_and_catalog.sql). Centralized here so the exact string
 * values are never re-typed/mistyped across driver_service.js and
 * admin_service.js.
 *
 * - ACTIVE:      can log in, can go online and work normally.
 * - DEACTIVATED: can still log in, but attempting to go online is rejected
 *                with a "contact admin" error (driver app shows a popup).
 * - BLOCKED:     cannot log in at all (renamed from the old 'suspended'
 *                value — same underlying behavior, clearer name).
 */
module.exports = {
  ACTIVE: 'active',
  DEACTIVATED: 'deactivated',
  BLOCKED: 'blocked',
  INACTIVE: 'inactive', // default before first approval; not admin-selectable
};
