const DriverService = require('../services/driver_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class DriverController {
  async register(req, res) {
    try {
      logger.info('[INFO] Driver registration request received');
      const driver = await DriverService.registerDriver(req.body);
      successResponse(res, 201, 'Driver registered successfully (pending approval)', driver);
    } catch (err) {
      errorResponse(res, 400, 'Driver registration failed', err);
    }
  }

  async login(req, res) {
    try {
      const { phone } = req.body;
      logger.info(`[INFO] Driver login attempt: ${phone}`);
      const result = await DriverService.loginDriver(phone);

      if (result.requiresAdminApproval) {
        return errorResponse(res, 403, 'Contact admin for driver approval');
      }

      successResponse(res, 200, 'Driver login successful', result);
    } catch (err) {
      errorResponse(res, 400, 'Driver login failed', err);
    }
  }

  async approve(req, res) {
    try {
      logger.info(`[INFO] Approving driver ID: ${req.params.id}`);
      const driver = await DriverService.approveDriver(req.params.id);
      successResponse(res, 200, 'Driver approved successfully', driver);
    } catch (err) {
      errorResponse(res, 400, 'Driver approval failed', err);
    }
  }

  async getAll(req, res) {
    try {
      const drivers = await DriverService.getAll();
      successResponse(res, 200, 'Drivers fetched successfully', drivers);
    } catch (err) {
      errorResponse(res, 500, 'Failed to fetch drivers', err);
    }
  }
}

module.exports = new DriverController();
