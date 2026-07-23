const logger = require('./logger');

/**
 * Handle Supabase { data, error } responses with diagnostic logs.
 */
const handleSupabase = (label, { data, error }, { allowNull = false } = {}) => {
  if (error) {
    logger.error(`[SUPABASE] ${label} FAILED`);
    logger.error(`[SUPABASE] code=${error.code || 'n/a'} | message=${error.message}`);
    if (error.details) logger.error(`[SUPABASE] details=${error.details}`);
    if (error.hint) logger.warn(`[SUPABASE] hint=${error.hint}`);
    throw new Error(error.message || `${label} failed`);
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

module.exports = { handleSupabase, logPayload };
