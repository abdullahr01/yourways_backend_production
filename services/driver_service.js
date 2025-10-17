const Driver = require('../models/driver_model');
const logger = require('../utils/logger');

class DriverService {
  async registerDriver(data) {
    try {
      logger.info('[INFO] Checking for existing driver...');
      const existing = await Driver.findOne({ phone: data.phone });
      if (existing) throw new Error('Driver already exists.');

      const driver = new Driver(data);
      await driver.save();

      logger.success(`[SUCCESS] Driver registered (pending approval) ID: ${driver._id}`);
      return driver;
    } catch (err) {
      logger.error(`[ERROR] Register Driver: ${err.message}`);
      throw err;
    }
  }

  async loginDriver(phone) {
    try {
      logger.info(`[INFO] Logging in driver: ${phone}`);
      const driver = await Driver.findOne({ phone });
      if (!driver) throw new Error('Driver not found');

      if (!driver.isApprovedByAdmin) {
        logger.info('[INFO] Driver not yet approved by admin');
        return { requiresAdminApproval: true };
      }

      logger.success(`[SUCCESS] Driver login successful: ${phone}`);
      return driver;
    } catch (err) {
      logger.error(`[ERROR] Login Driver: ${err.message}`);
      throw err;
    }
  }

  async approveDriver(driverId) {
    try {
      const driver = await Driver.findByIdAndUpdate(
        driverId,
        { isApprovedByAdmin: true },
        { new: true }
      );
      if (!driver) throw new Error('Driver not found');
      logger.success(`[SUCCESS] Driver approved: ${driverId}`);
      return driver;
    } catch (err) {
      logger.error(`[ERROR] Approve Driver: ${err.message}`);
      throw err;
    }
  }

  async getAll() {
    try {
      const drivers = await Driver.find({});
      logger.info(`[INFO] Fetched ${drivers.length} drivers`);
      return drivers;
    } catch (err) {
      logger.error(`[ERROR] Fetch Drivers: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new DriverService();
