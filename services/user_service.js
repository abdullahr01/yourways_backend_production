const User = require('../models/user_model');
const logger = require('../utils/logger');

class UserService {
  async registerUser(data) {
    try {
      logger.info('[INFO] Checking for existing user...');
      const existing = await User.findOne({ phone: data.phone });
      if (existing) throw new Error('User already registered.');

      const user = new User(data);
      await user.save();

      logger.success(`[SUCCESS] User registered with ID: ${user._id}`);
      return user;
    } catch (err) {
      logger.error(`[ERROR] Register User: ${err.message}`);
      throw err;
    }
  }

  async loginUser(phone) {
    try {
      logger.info(`[INFO] Logging in user: ${phone}`);
      const user = await User.findOne({ phone });
      if (!user) throw new Error('User not found');
      logger.success(`[SUCCESS] User login successful: ${phone}`);
      return user;
    } catch (err) {
      logger.error(`[ERROR] Login User: ${err.message}`);
      throw err;
    }
  }

  async getAll() {
    try {
      const users = await User.find({});
      logger.info(`[INFO] Fetched ${users.length} users`);
      return users;
    } catch (err) {
      logger.error(`[ERROR] Fetch Users: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new UserService();
