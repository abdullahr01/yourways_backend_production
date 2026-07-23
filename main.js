require('dotenv').config();
const app = require('./app');
require('./config/database');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

logger.info('[MAIN] Starting YourWays Logistics server (Supabase)...');
logger.info(`[MAIN] Port: ${PORT} | NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

app.listen(PORT, () => {
  logger.success(`[MAIN] Server running on http://localhost:${PORT}`);
  logger.success(`[MAIN] API Docs (Swagger): http://localhost:${PORT}/docs`);
  logger.info('[MAIN] Auth: JWT Bearer tokens (role=user|driver)');
  logger.info('[MAIN] DB: Supabase Postgres');
  logger.info('[MAIN] Ready to accept requests');
});
