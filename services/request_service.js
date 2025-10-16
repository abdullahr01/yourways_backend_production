const Request = require('../models/request_model');
const logger = require('../utils/logger');

class RequestService {
  async createRequest(requestData) {
    try {
      const request = new Request(requestData);
      await request.save();
      logger.success(`Request created with code: ${request.requestCode}`);
      return request;
    } catch (error) {
      logger.error(`Error creating request: ${error.message}`);
      throw error;
    }
  }

  async getRequestById(requestId) {
    try {
      const request = await Request.findById(requestId)
        .populate('userId', 'name email phone')
        .populate('driverId', 'name email phone vehicleType')
        .populate('categoryId', 'name basePrice');
      if (!request) {
        throw new Error('Request not found');
      }
      return request;
    } catch (error) {
      logger.error(`Error fetching request: ${error.message}`);
      throw error;
    }
  }

  async getAllRequests() {
    try {
      const requests = await Request.find({})
        .populate('userId', 'name email phone')
        .populate('driverId', 'name email phone vehicleType')
        .populate('categoryId', 'name basePrice');
      logger.info(`Fetched ${requests.length} requests`);
      return requests;
    } catch (error) {
      logger.error(`Error fetching requests: ${error.message}`);
      throw error;
    }
  }

  async updateRequest(requestId, updateData) {
    try {
      const request = await Request.findByIdAndUpdate(requestId, updateData, { new: true })
        .populate('userId', 'name email phone')
        .populate('driverId', 'name email phone vehicleType')
        .populate('categoryId', 'name basePrice');
      if (!request) {
        throw new Error('Request not found');
      }
      logger.success(`Request updated: ${requestId}`);
      return request;
    } catch (error) {
      logger.error(`Error updating request: ${error.message}`);
      throw error;
    }
  }

  async getRequestsByUserId(userId) {
    try {
      const requests = await Request.find({ userId })
        .populate('userId', 'name email phone')
        .populate('driverId', 'name email phone vehicleType')
        .populate('categoryId', 'name basePrice');
      logger.info(`Fetched ${requests.length} requests for user: ${userId}`);
      return requests;
    } catch (error) {
      logger.error(`Error fetching user requests: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new RequestService();