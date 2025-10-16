const User = require('../models/user_model');
const logger = require('../utils/logger');

class UserService {
  async createUser(userData) {
    try {
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      const user = new User(userData);
      await user.save();
      logger.success(`User created with ID: ${user._id}`);
      return user;
    } catch (error) {
      logger.error(`Error creating user: ${error.message}`);
      throw error;
    }
  }

  async getUserById(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      return user;
    } catch (error) {
      logger.error(`Error fetching user: ${error.message}`);
      throw error;
    }
  }

  async getAllUsers() {
    try {
      const users = await User.find({});
      logger.info(`Fetched ${users.length} users`);
      return users;
    } catch (error) {
      logger.error(`Error fetching users: ${error.message}`);
      throw error;
    }
  }

  async updateUser(userId, updateData) {
    try {
      const user = await User.findByIdAndUpdate(userId, updateData, { new: true });
      if (!user) {
        throw new Error('User not found');
      }
      logger.success(`User updated: ${userId}`);
      return user;
    } catch (error) {
      logger.error(`Error updating user: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new UserService();
