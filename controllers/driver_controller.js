const DriverService = require('../services/driver_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class DriverController {
  async registerDriver(req, res) {
    try {
      logger.info('Driver registration request received');
      const driver = await DriverService.createDriver(req.body);
      successResponse(res, 201, 'Driver registered successfully', driver);
    } catch (error) {
      logger.error(`Driver registration error: ${error.message}`);
      errorResponse(res, 400, 'Driver registration failed', error);
    }
  }

  async getDriver(req, res) {
    try {
      logger.info(`Fetching driver with ID: ${req.params.id}`);
      const driver = await DriverService.getDriverById(req.params.id);
      successResponse(res, 200, 'Driver fetched successfully', driver);
    } catch (error) {
      logger.error(`Error fetching driver: ${error.message}`);
      errorResponse(res, 404, 'Driver not found', error);
    }
  }

  async getAvailableDrivers(req, res) {
    try {
      logger.info('Fetching available drivers');
      const drivers = await DriverService.getAvailableDrivers();
      successResponse(res, 200, 'Available drivers fetched successfully', drivers);
    } catch (error) {
      logger.error(`Error fetching available drivers: ${error.message}`);
      errorResponse(res, 500, 'Failed to fetch drivers', error);
    }
  }

  async updateDriver(req, res) {
    try {
      logger.info(`Updating driver with ID: ${req.params.id}`);
      const driver = await DriverService.updateDriver(req.params.id, req.body);
      successResponse(res, 200, 'Driver updated successfully', driver);
    } catch (error) {
      logger.error(`Error updating driver: ${error.message}`);
      errorResponse(res, 400, 'Driver update failed', error);
    }
  }
}

module.exports = new DriverController();
