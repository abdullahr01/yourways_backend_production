const supabase = require('../config/database');
const logger = require('../utils/logger');

const TABLE = 'revoked_tokens';

/**
 * Record a token as revoked (logout). Idempotent — if the same jti is
 * revoked twice (e.g. double-tap logout) the duplicate-key error is ignored.
 */
const create = async (jti, expiresAt) => {
  logger.info(`[REVOKED TOKEN] INSERT jti=${jti} expiresAt=${expiresAt}`);
  const { error } = await supabase.from(TABLE).insert({ jti, expires_at: expiresAt });
  if (error && error.code !== '23505') {
    logger.error(`[REVOKED TOKEN] insert failed: ${error.message}`);
    throw new Error(error.message);
  }
  logger.success(`[REVOKED TOKEN] Revoked jti=${jti}`);
  return true;
};

/**
 * Check whether a token has been revoked. Fails OPEN (returns false) on a
 * transient DB error so a Supabase blip never locks every user out of the
 * whole API — the error is still logged loudly for investigation.
 */
const exists = async (jti) => {
  if (!jti) return false;
  const { data, error } = await supabase.from(TABLE).select('jti').eq('jti', jti).maybeSingle();
  if (error) {
    logger.error(`[REVOKED TOKEN] lookup failed (failing open): ${error.message}`);
    return false;
  }
  return Boolean(data);
};

/** Housekeeping: delete rows past their natural JWT expiry (called at startup). */
const cleanupExpired = async () => {
  const { error, count } = await supabase
    .from(TABLE)
    .delete({ count: 'exact' })
    .lt('expires_at', new Date().toISOString());
  if (error) {
    logger.warn(`[REVOKED TOKEN] cleanup failed: ${error.message}`);
  } else {
    logger.info(`[REVOKED TOKEN] Cleanup removed ${count ?? 0} expired row(s)`);
  }
};

module.exports = { create, exists, cleanupExpired };
