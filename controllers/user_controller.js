const UserService = require('../services/user_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class UserController {
  async register(req, res) {
    try {
      logger.info('[INFO] User registration request received');
      const user = await UserService.registerUser(req.body);
      successResponse(res, 201, 'User registered successfully', user);
    } catch (err) {
      errorResponse(res, 400, 'User registration failed', err);
    }
  }

  async login(req, res) {
    try {
      const { phone } = req.body;
      logger.info(`[INFO] User login attempt: ${phone}`);
      const user = await UserService.loginUser(phone);
      successResponse(res, 200, 'Login successful', user);
    } catch (err) {
      errorResponse(res, 400, 'User login failed', err);
    }
  }

  async getAll(req, res) {
    try {
      const users = await UserService.getAll();
      successResponse(res, 200, 'Users fetched successfully', users);
    } catch (err) {
      errorResponse(res, 500, 'Failed to fetch users', err);
    }
  }
}

module.exports = new UserController();
