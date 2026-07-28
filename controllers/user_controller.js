const UserService = require('../services/user_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { revokeToken } = require('../middleware/auth');
const logger = require('../utils/logger');

class UserController {
  async register(req, res) {
    try {
      logger.info('[USER CTRL] === REGISTER ===');
      logger.info(`[USER CTRL] IP=${req.ip}`);
      logger.info(`[USER CTRL] body keys=${Object.keys(req.body || {}).join(',')}`);

      const { user, token } = await UserService.registerUser(req.body);

      logger.success(`[USER CTRL] Registered id=${user.id}`);
      return successResponse(res, 201, 'User registered successfully', {
        user: {
          _id: user.id,
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          dob: user.dob,
          status: user.status,
          createdAt: user.createdAt,
        },
        token,
        tokenExpiry: '7 days',
      });
    } catch (err) {
      logger.error(`[USER CTRL] Register failed: ${err.message}`);
      return errorResponse(res, 400, 'User registration failed', err);
    }
  }

  async login(req, res) {
    try {
      const { phone } = req.body;
      logger.info('[USER CTRL] === LOGIN ===');
      logger.info(`[USER CTRL] phone=${phone} IP=${req.ip}`);

      if (!phone) {
        return errorResponse(res, 400, 'Phone number is required', new Error('Phone number missing'));
      }

      const { user, token } = await UserService.loginUser(phone);

      logger.success(`[USER CTRL] Login OK id=${user.id}`);
      return successResponse(res, 200, 'Login successful', {
        user: {
          _id: user.id,
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          dob: user.dob,
          status: user.status,
          createdAt: user.createdAt,
        },
        token,
        tokenExpiry: '7 days',
      });
    } catch (err) {
      logger.error(`[USER CTRL] Login failed: ${err.message}`);
      return errorResponse(res, 400, 'User login failed', err);
    }
  }

  async getAll(req, res) {
    try {
      logger.info('[USER CTRL] === GET ALL ===');
      const users = await UserService.getAll();
      logger.success(`[USER CTRL] Returned ${users.length} users`);
      return successResponse(res, 200, 'Users fetched successfully', users);
    } catch (err) {
      logger.error(`[USER CTRL] getAll failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch users', err);
    }
  }

  async verifyToken(req, res) {
    try {
      logger.info('[USER CTRL] === VERIFY TOKEN ===');
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return errorResponse(res, 401, 'No token provided', new Error('Authorization token missing'));
      }

      const user = await UserService.verifyToken(token);
      logger.success(`[USER CTRL] Token valid id=${user.id}`);

      return successResponse(res, 200, 'Token is valid', {
        user: {
          _id: user.id,
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          dob: user.dob,
          status: user.status,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      logger.error(`[USER CTRL] verifyToken failed: ${err.message}`);
      return errorResponse(res, 401, 'Invalid or expired token', err);
    }
  }

  async getProfile(req, res) {
    try {
      logger.info('[USER CTRL] === GET PROFILE ===');
      // Prefer middleware auth, fall back to header
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token && !req.auth) {
        return errorResponse(res, 401, 'No token provided', new Error('Authorization token missing'));
      }

      const user = req.auth
        ? await UserService.getUserById(req.auth._id || req.auth.id)
        : await UserService.verifyToken(token);

      logger.success(`[USER CTRL] Profile id=${user.id}`);
      return successResponse(res, 200, 'Profile fetched successfully', {
        _id: user.id,
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        dob: user.dob,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (err) {
      logger.error(`[USER CTRL] getProfile failed: ${err.message}`);
      return errorResponse(res, 401, 'Failed to fetch profile', err);
    }
  }

  async logout(req, res) {
    try {
      logger.info(`[USER CTRL] === LOGOUT === id=${req.auth?.id || req.auth?._id}`);
      await revokeToken(req.auth);
      logger.success(`[USER CTRL] Logged out id=${req.auth?.id || req.auth?._id}`);
      return successResponse(res, 200, 'Logged out successfully');
    } catch (err) {
      logger.error(`[USER CTRL] logout failed: ${err.message}`);
      return errorResponse(res, 400, 'Logout failed', err);
    }
  }
}

module.exports = new UserController();
