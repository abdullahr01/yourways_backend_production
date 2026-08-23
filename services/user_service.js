const User = require('../models/user_model');
const logger = require('../utils/logger');

class UserService {
  async registerUser(data) {
    try {
      logger.info('[USER SVC] Starting registration...');
      logger.info(`[USER SVC] phone=${data.phone} email=${data.email ? '***' : 'n/a'}`);

      if (!data.name || !data.email || !data.phone) {
        throw new Error('name, email and phone are required');
      }

      const existing = await User.findByEmailOrPhone({
        email: data.email.toLowerCase(),
        phone: data.phone,
      });
      if (existing) {
        logger.warn(`[USER SVC] Duplicate user phone/email → id=${existing.id}`);
        throw new Error('User already registered with this phone or email.');
      }

      const user = await User.create(data);
      const token = User.generateAuthToken(user);

      logger.success(`[USER SVC] Registered user id=${user.id}`);
      return { user, token };
    } catch (err) {
      logger.error(`[USER SVC] Register failed: ${err.message}`);
      throw err;
    }
  }

  async loginUser(phone) {
    try {
      logger.info(`[USER SVC] Login attempt phone=${phone}`);

      const user = await User.findByPhone(phone);
      if (!user) {
        logger.warn(`[USER SVC] Login — user not found phone=${phone}`);
        const err = new Error('No account exists for this phone number. Please sign up first.');
        err.statusCode = 404;
        throw err;
      }

      if (user.status === 'inactive') {
        logger.warn(`[USER SVC] Login blocked — inactive user id=${user.id}`);
        const err = new Error('User account is inactive. Please contact support.');
        err.statusCode = 403;
        throw err;
      }

      const token = User.generateAuthToken(user);
      logger.success(`[USER SVC] Login OK id=${user.id}`);
      return { user, token };
    } catch (err) {
      logger.error(`[USER SVC] Login failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Public existence check used by login *before* Firebase sends an SMS.
   * Does not issue a JWT — it only answers whether this phone is registered.
   */
  async checkPhone(phone) {
    logger.info(`[USER SVC] Check phone=${phone}`);
    const user = await User.findByPhone(phone);
    const exists = !!user;
    logger.info(`[USER SVC] Check phone exists=${exists}`);
    return { exists };
  }

  async getAll() {
    try {
      logger.info('[USER SVC] Fetch all users');
      const users = await User.findAll();
      logger.success(`[USER SVC] Returned ${users.length} users`);
      return users;
    } catch (err) {
      logger.error(`[USER SVC] getAll failed: ${err.message}`);
      throw err;
    }
  }

  async verifyToken(token) {
    try {
      logger.info('[USER SVC] Verifying JWT...');
      const decoded = await User.verifyToken(token);
      logger.info(`[USER SVC] Token payload id=${decoded._id || decoded.id} role=${decoded.role}`);

      const user = await User.findById(decoded._id || decoded.id);
      if (!user) {
        throw new Error('User not found');
      }
      if (user.status === 'inactive') {
        throw new Error('User account is inactive');
      }

      logger.success(`[USER SVC] Token valid for user id=${user.id}`);
      return user;
    } catch (err) {
      logger.error(`[USER SVC] verifyToken failed: ${err.message}`);
      throw err;
    }
  }

  async getUserById(userId) {
    try {
      logger.info(`[USER SVC] getUserById=${userId}`);
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');
      return user;
    } catch (err) {
      logger.error(`[USER SVC] getUserById failed: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new UserService();
