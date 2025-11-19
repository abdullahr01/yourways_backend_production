const UserService = require('../services/user_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class UserController {
  async register(req, res) {
    try {
      logger.info('=== USER REGISTRATION REQUEST ===');
      logger.info(`[INFO] Request received at: ${new Date().toISOString()}`);
      logger.info(`[INFO] Request IP: ${req.ip}`);
      logger.info(`[INFO] Request body: ${JSON.stringify({ ...req.body, email: '***' })}`);
      
      const { user, token } = await UserService.registerUser(req.body);
      
      logger.info('[INFO] Preparing success response...');
      logger.success(`[SUCCESS] Registration complete for user: ${user._id}`);
      logger.info('=== REGISTRATION REQUEST COMPLETE ===\n');
      
      successResponse(res, 201, 'User registered successfully', {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          dob: user.dob,
          status: user.status,
          createdAt: user.createdAt,
        },
        token,
        tokenExpiry: '7 days'
      });
    } catch (err) {
      logger.error(`[ERROR] Registration request failed: ${err.message}`);
      logger.info('=== REGISTRATION REQUEST FAILED ===\n');
      errorResponse(res, 400, 'User registration failed', err);
    }
  }

  async login(req, res) {
    try {
      const { phone } = req.body;
      
      logger.info('=== USER LOGIN REQUEST ===');
      logger.info(`[INFO] Request received at: ${new Date().toISOString()}`);
      logger.info(`[INFO] Request IP: ${req.ip}`);
      logger.info(`[INFO] Login attempt for phone: ${phone}`);
      
      if (!phone) {
        logger.warn('[WARN] Login failed: Phone number not provided');
        logger.info('=== LOGIN REQUEST FAILED ===\n');
        return errorResponse(res, 400, 'Phone number is required', new Error('Phone number missing'));
      }

      const { user, token } = await UserService.loginUser(phone);
      
      logger.info('[INFO] Preparing success response...');
      logger.success(`[SUCCESS] Login complete for user: ${user._id}`);
      logger.info('=== LOGIN REQUEST COMPLETE ===\n');
      
      successResponse(res, 200, 'Login successful', {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          dob: user.dob,
          status: user.status,
          createdAt: user.createdAt,
        },
        token,
        tokenExpiry: '7 days'
      });
    } catch (err) {
      logger.error(`[ERROR] Login request failed: ${err.message}`);
      logger.info('=== LOGIN REQUEST FAILED ===\n');
      errorResponse(res, 400, 'User login failed', err);
    }
  }

  async getAll(req, res) {
    try {
      logger.info('=== FETCH ALL USERS REQUEST ===');
      logger.info(`[INFO] Request received at: ${new Date().toISOString()}`);
      logger.info(`[INFO] Request IP: ${req.ip}`);
      
      const users = await UserService.getAll();
      
      logger.info('[INFO] Preparing success response...');
      logger.success('[SUCCESS] Users fetched successfully');
      logger.info('=== FETCH USERS REQUEST COMPLETE ===\n');
      
      successResponse(res, 200, 'Users fetched successfully', users);
    } catch (err) {
      logger.error(`[ERROR] Fetch users request failed: ${err.message}`);
      logger.info('=== FETCH USERS REQUEST FAILED ===\n');
      errorResponse(res, 500, 'Failed to fetch users', err);
    }
  }

  async verifyToken(req, res) {
    try {
      logger.info('=== TOKEN VERIFICATION REQUEST ===');
      logger.info(`[INFO] Request received at: ${new Date().toISOString()}`);
      logger.info(`[INFO] Request IP: ${req.ip}`);
      
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        logger.warn('[WARN] Token verification failed: No token provided');
        logger.info('=== TOKEN VERIFICATION FAILED ===\n');
        return errorResponse(res, 401, 'No token provided', new Error('Authorization token missing'));
      }

      logger.info('[INFO] Token received, verifying...');
      const user = await UserService.verifyToken(token);
      
      logger.info('[INFO] Preparing success response...');
      logger.success(`[SUCCESS] Token verified for user: ${user._id}`);
      logger.info('=== TOKEN VERIFICATION COMPLETE ===\n');
      
      successResponse(res, 200, 'Token is valid', {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          dob: user.dob,
          status: user.status,
          createdAt: user.createdAt,
        }
      });
    } catch (err) {
      logger.error(`[ERROR] Token verification failed: ${err.message}`);
      logger.info('=== TOKEN VERIFICATION FAILED ===\n');
      errorResponse(res, 401, 'Invalid or expired token', err);
    }
  }

  async getProfile(req, res) {
    try {
      logger.info('=== GET PROFILE REQUEST ===');
      logger.info(`[INFO] Request received at: ${new Date().toISOString()}`);
      logger.info(`[INFO] Request IP: ${req.ip}`);
      
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        logger.warn('[WARN] Get profile failed: No token provided');
        logger.info('=== GET PROFILE FAILED ===\n');
        return errorResponse(res, 401, 'No token provided', new Error('Authorization token missing'));
      }

      const user = await UserService.verifyToken(token);
      
      logger.info('[INFO] Preparing success response...');
      logger.success(`[SUCCESS] Profile fetched for user: ${user._id}`);
      logger.info('=== GET PROFILE COMPLETE ===\n');
      
      successResponse(res, 200, 'Profile fetched successfully', {
        _id: user._id,
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
      logger.error(`[ERROR] Get profile failed: ${err.message}`);
      logger.info('=== GET PROFILE FAILED ===\n');
      errorResponse(res, 401, 'Failed to fetch profile', err);
    }
  }
}

module.exports = new UserController();