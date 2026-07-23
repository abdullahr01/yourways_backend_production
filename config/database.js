const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  logger.error('[DB] Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env');
  throw new Error('Supabase configuration missing');
}

logger.info(`[DB] Initializing Supabase client → ${url}`);

const supabase = createClient(url, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

logger.success('[DB] Supabase client ready (service role — RLS bypassed)');

module.exports = supabase;
