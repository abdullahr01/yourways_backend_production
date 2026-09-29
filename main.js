require('dotenv').config();
const app = require('./app');
require('./config/database');
const { isConfigured: isFirebaseConfigured } = require('./config/firebase');
const logger = require('./utils/logger');
const RevokedToken = require('./models/revoked_token_model');

const PORT = process.env.PORT || 5000;

//latest changes pushed 12:40
logger.info('[MAIN] Starting YourWays Logistics server (Supabase)...');
logger.info(`[MAIN] Port: ${PORT} | NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

if (!process.env.GOOGLE_MAPS_API_KEY) {
  logger.warn('[MAIN] GOOGLE_MAPS_API_KEY not set — pricing/tracking will use offline heuristic distance only');
}

if (!process.env.STRIPE_SECRET_KEY) {
  logger.warn('[MAIN] STRIPE_SECRET_KEY not set — /api/payments/* will return 503 and no booking can be paid');
} else if (!process.env.STRIPE_WEBHOOK_SECRET) {
  // Without the signing secret we cannot tell a real Stripe event from a
  // forged one, so the webhook refuses everything. Payments still work end to
  // end via POST /api/payments/confirm, which asks Stripe directly.
  logger.warn(
    '[MAIN] STRIPE_WEBHOOK_SECRET not set — webhook disabled. For local dev run: ' +
      'stripe listen --forward-to localhost:' + PORT + '/api/payments/webhook'
  );
}

app.listen(PORT, () => {
  logger.success(`[MAIN] Server running on http://localhost:${PORT}`);
  logger.success(`[MAIN] API Docs (Swagger): http://localhost:${PORT}/docs`);
  logger.info('[MAIN] Auth: JWT Bearer tokens (role=user|driver|admin)');
  logger.info('[MAIN] DB: Supabase Postgres');
  logger.info('[MAIN] Maps: Google Distance Matrix + Geocoding API');
  logger.info(
    `[MAIN] Payments: Stripe ${process.env.STRIPE_SECRET_KEY ? 'enabled' : 'DISABLED (no key)'} — bookings must be paid before becoming orders`
  );
  logger.info('[MAIN] Realtime: Supabase Broadcast (driver-<id>, order-<id> channels)');
  logger.info(
    `[MAIN] Push notifications: FCM ${isFirebaseConfigured() ? 'enabled' : 'DISABLED (FIREBASE_SERVICE_ACCOUNT missing or invalid)'}`
  );
  logger.info('[MAIN] Ready to accept requests');

  // House-keeping: drop revoked-token rows that are already past their
  // natural JWT expiry so the table doesn't grow forever.
  RevokedToken.cleanupExpired().catch((err) =>
    logger.warn(`[MAIN] Startup revoked-token cleanup skipped: ${err.message}`)
  );
});
