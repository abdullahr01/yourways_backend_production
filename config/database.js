const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/logistics-app';
    logger.info(`[DB] Connecting to MongoDB: ${mongoURI.replace(/\/\/.*@/, '//***@')}`);

    await mongoose.connect(mongoURI);

    logger.success('[DB] Connected to MongoDB successfully');
    logger.info(`[DB] Database: ${mongoose.connection.name}`);
  } catch (error) {
    logger.error(`[DB] MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('[DB] MongoDB disconnected');
});

module.exports = connectDB;