const UserService = require('../services/user_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class UserController {
  async registerUser(req, res) {
    try {
      logger.info('User registration request received');
      const user = await UserService.createUser(req.body);
      successResponse(res, 201, 'User registered successfully', user);
    } catch (error) {
      logger.error(`User registration error: ${error.message}`);
      errorResponse(res, 400, 'User registration failed', error);
    }
  }

  async getUser(req, res) {
    try {
      logger.info(`Fetching user with ID: ${req.params.id}`);
      const user = await UserService.getUserById(req.params.id);
      successResponse(res, 200, 'User fetched successfully', user);
    } catch (error) {
      logger.error(`Error fetching user: ${error.message}`);
      errorResponse(res, 404, 'User not found', error);
    }
  }

  async getAllUsers(req, res) {
    try {
      logger.info('Fetching all users');
      const users = await UserService.getAllUsers();
      successResponse(res, 200, 'Users fetched successfully', users);
    } catch (error) {
      logger.error(`Error fetching users: ${error.message}`);
      errorResponse(res, 500, 'Failed to fetch users', error);
    }
  }

  async updateUser(req, res) {
    try {
      logger.info(`Updating user with ID: ${req.params.id}`);
      const user = await UserService.updateUser(req.params.id, req.body);
      successResponse(res, 200, 'User updated successfully', user);
    } catch (error) {
      logger.error(`Error updating user: ${error.message}`);
      errorResponse(res, 400, 'User update failed', error);
    }
  }
}

module.exports = new UserController();