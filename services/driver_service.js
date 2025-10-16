const Driver = require('../models/driver_model');
const logger = require('../utils/logger');

class DriverService {
  async createDriver(driverData) {
    try {
      const existingDriver = await Driver.findOne({ email: driverData.email });
      if (existingDriver) {
        throw new Error('Driver with this email already exists');
      }

      const driver = new Driver(driverData);
      await driver.save();
      logger.success(`Driver created with ID: ${driver._id}`);
      return driver;
    } catch (error) {
      logger.error(`Error creating driver: ${error.message}`);
      throw error;
    }
  }

  async getDriverById(driverId) {
    try {
      const driver = await Driver.findById(driverId);
      if (!driver) {
        throw new Error('Driver not found');
      }
      return driver;
    } catch (error) {
      logger.error(`Error fetching driver: ${error.message}`);
      throw error;
    }
  }

  async getAvailableDrivers() {
    try {
      const drivers = await Driver.find({ status: 'available' });
      logger.info(`Fetched ${drivers.length} available drivers`);
      return drivers;
    } catch (error) {
      logger.error(`Error fetching available drivers: ${error.message}`);
      throw error;
    }
  }

  async updateDriver(driverId, updateData) {
    try {
      const driver = await Driver.findByIdAndUpdate(driverId, updateData, { new: true });
      if (!driver) {
        throw new Error('Driver not found');
      }
      logger.success(`Driver updated: ${driverId}`);
      return driver;
    } catch (error) {
      logger.error(`Error updating driver: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new DriverService();