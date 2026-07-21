require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/database');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    logger.info('[MAIN] Starting YourWays Logistics server...');
    logger.info(`[MAIN] Port: ${PORT} | NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

    await connectDB();

    app.listen(PORT, () => {
      logger.success(`[MAIN] Server running on http://localhost:${PORT}`);
      logger.info('[MAIN] Ready to accept requests');
    });
  } catch (error) {
    logger.error(`[MAIN] Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();