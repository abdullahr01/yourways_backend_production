const logger = require('./logger');

/** Postgres unique_violation — two inserts raced for the same key. */
const isUniqueViolation = (error) =>
  error?.code === '23505' ||
  error?.name === 'UniqueViolationError' ||
  /duplicate key value/i.test(error?.message || '');

/**
 * Handle Supabase { data, error } responses with diagnostic logs.
 */
const handleSupabase = (label, { data, error }, { allowNull = false } = {}) => {
  if (error) {
    logger.error(`[SUPABASE] ${label} FAILED`);
    logger.error(`[SUPABASE] code=${error.code || 'n/a'} | message=${error.message}`);
    if (error.details) logger.error(`[SUPABASE] details=${error.details}`);
    if (error.hint) logger.warn(`[SUPABASE] hint=${error.hint}`);
    const err = new Error(error.message || `${label} failed`);
    err.code = error.code;
    if (error.code === '23505') err.name = 'UniqueViolationError';
    throw err;
  }

  if (!allowNull && (data === null || data === undefined)) {
    logger.warn(`[SUPABASE] ${label} returned empty result`);
    throw new Error('Record not found');
  }

  logger.info(`[SUPABASE] ${label} OK`);
  return data;
};

const logPayload = (label, payload) => {
  try {
    const safe = JSON.parse(JSON.stringify(payload ?? {}));
    if (safe.email) safe.email = '***';
    if (safe.password) safe.password = '***';
    if (safe.token) safe.token = '***';
    logger.info(`[DATA OUT] ${label}: ${JSON.stringify(safe)}`);
  } catch {
    logger.info(`[DATA OUT] ${label}: [unserializable]`);
  }
};

module.exports = { handleSupabase, logPayload, isUniqueViolation };
