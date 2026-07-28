require('dotenv').config();
const app = require('./app');
require('./config/database');
const logger = require('./utils/logger');
const RevokedToken = require('./models/revoked_token_model');

const PORT = process.env.PORT || 5000;

logger.info('[MAIN] Starting YourWays Logistics server (Supabase)...');
logger.info(`[MAIN] Port: ${PORT} | NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

if (!process.env.GOOGLE_MAPS_API_KEY) {
  logger.warn('[MAIN] GOOGLE_MAPS_API_KEY not set — pricing/tracking will use offline heuristic distance only');
}

app.listen(PORT, () => {
  logger.success(`[MAIN] Server running on http://localhost:${PORT}`);
  logger.success(`[MAIN] API Docs (Swagger): http://localhost:${PORT}/docs`);
  logger.info('[MAIN] Auth: JWT Bearer tokens (role=user|driver|admin)');
  logger.info('[MAIN] DB: Supabase Postgres');
  logger.info('[MAIN] Maps: Google Distance Matrix + Geocoding API');
  logger.info('[MAIN] Realtime: Supabase Broadcast (driver-<id>, order-<id> channels)');
  logger.info('[MAIN] Ready to accept requests');

  // House-keeping: drop revoked-token rows that are already past their
  // natural JWT expiry so the table doesn't grow forever.
  RevokedToken.cleanupExpired().catch((err) =>
    logger.warn(`[MAIN] Startup revoked-token cleanup skipped: ${err.message}`)
  );
});
