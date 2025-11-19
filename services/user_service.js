const User = require('../models/user_model');
const logger = require('../utils/logger');

class UserService {
  async registerUser(data) {
    try {
      logger.info('[INFO] Starting user registration process...');
      logger.info(`[INFO] Checking for existing user with phone: ${data.phone}`);
      
      const existing = await User.findOne({ phone: data.phone });
      if (existing) {
        logger.warn(`[WARN] Registration failed: User with phone ${data.phone} already exists`);
        throw new Error('User already registered with this phone number.');
      }

      logger.info('[INFO] Creating new user document...');
      const user = new User(data);
      await user.save();
      logger.success(`[SUCCESS] User document saved to database with ID: ${user._id}`);

      logger.info('[INFO] Generating JWT token for new user...');
      const token = user.generateAuthToken();
      logger.success(`[SUCCESS] JWT token generated successfully for user: ${user._id}`);
      logger.info(`[INFO] Token expiry: 7 days from now`);

      return { user, token };
    } catch (err) {
      logger.error(`[ERROR] Register User Failed: ${err.message}`);
      logger.error(`[ERROR] Stack trace: ${err.stack}`);
      throw err;
    }
  }

  async loginUser(phone) {
    try {
      logger.info(`[INFO] Login attempt initiated for phone: ${phone}`);
      logger.info('[INFO] Searching user in database...');
      
      const user = await User.findOne({ phone });
      
      if (!user) {
        logger.warn(`[WARN] Login failed: No user found with phone: ${phone}`);
        throw new Error('User not found. Please register first.');
      }

      logger.info(`[INFO] User found: ${user._id}`);
      
      if (user.status === 'inactive') {
        logger.warn(`[WARN] Login blocked: User ${user._id} has inactive status`);
        throw new Error('User account is inactive. Please contact support.');
      }

      logger.info('[INFO] Generating JWT token for login...');
      const token = user.generateAuthToken();
      logger.success(`[SUCCESS] JWT token generated for user: ${user._id}`);
      logger.success(`[SUCCESS] User login successful: ${phone}`);
      logger.info(`[INFO] Token will expire in 7 days`);

      return { user, token };
    } catch (err) {
      logger.error(`[ERROR] Login User Failed: ${err.message}`);
      logger.error(`[ERROR] Stack trace: ${err.stack}`);
      throw err;
    }
  }

  async getAll() {
    try {
      logger.info('[INFO] Fetching all users from database...');
      const users = await User.find({});
      logger.success(`[SUCCESS] Fetched ${users.length} users from database`);
      logger.info(`[INFO] Active users: ${users.filter(u => u.status === 'active').length}`);
      logger.info(`[INFO] Inactive users: ${users.filter(u => u.status === 'inactive').length}`);
      return users;
    } catch (err) {
      logger.error(`[ERROR] Fetch Users Failed: ${err.message}`);
      logger.error(`[ERROR] Stack trace: ${err.stack}`);
      throw err;
    }
  }

  async verifyToken(token) {
    try {
      logger.info('[INFO] Verifying JWT token...');
      const decoded = User.verifyToken(token);
      logger.success(`[SUCCESS] Token verified successfully for user: ${decoded._id}`);
      logger.info(`[INFO] Token belongs to: ${decoded.name} (${decoded.phone})`);
      
      logger.info('[INFO] Fetching user details from database...');
      const user = await User.findById(decoded._id);
      
      if (!user) {
        logger.warn(`[WARN] Token valid but user ${decoded._id} not found in database`);
        throw new Error('User not found');
      }

      if (user.status === 'inactive') {
        logger.warn(`[WARN] Token valid but user ${decoded._id} is inactive`);
        throw new Error('User account is inactive');
      }

      logger.success(`[SUCCESS] Token verification complete for user: ${user._id}`);
      return user;
    } catch (err) {
      logger.error(`[ERROR] Token Verification Failed: ${err.message}`);
      logger.error(`[ERROR] Stack trace: ${err.stack}`);
      throw err;
    }
  }

  async getUserById(userId) {
    try {
      logger.info(`[INFO] Fetching user by ID: ${userId}`);
      const user = await User.findById(userId);
      
      if (!user) {
        logger.warn(`[WARN] User not found with ID: ${userId}`);
        throw new Error('User not found');
      }

      logger.success(`[SUCCESS] User fetched: ${user.name} (${user.phone})`);
      return user;
    } catch (err) {
      logger.error(`[ERROR] Get User By ID Failed: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new UserService();