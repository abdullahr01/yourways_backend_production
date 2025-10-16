const RequestService = require('../services/request_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class RequestController {
  async createRequest(req, res) {
    try {
      logger.info('Moving request creation received');
      const request = await RequestService.createRequest(req.body);
      successResponse(res, 201, 'Request created successfully', request);
    } catch (error) {
      logger.error(`Request creation error: ${error.message}`);
      errorResponse(res, 400, 'Request creation failed', error);
    }
  }

  async getRequest(req, res) {
    try {
      logger.info(`Fetching request with ID: ${req.params.id}`);
      const request = await RequestService.getRequestById(req.params.id);
      successResponse(res, 200, 'Request fetched successfully', request);
    } catch (error) {
      logger.error(`Error fetching request: ${error.message}`);
      errorResponse(res, 404, 'Request not found', error);
    }
  }

  async getAllRequests(req, res) {
    try {
      logger.info('Fetching all requests');
      const requests = await RequestService.getAllRequests();
      successResponse(res, 200, 'Requests fetched successfully', requests);
    } catch (error) {
      logger.error(`Error fetching requests: ${error.message}`);
      errorResponse(res, 500, 'Failed to fetch requests', error);
    }
  }

  async updateRequest(req, res) {
    try {
      logger.info(`Updating request with ID: ${req.params.id}`);
      const request = await RequestService.updateRequest(req.params.id, req.body);
      successResponse(res, 200, 'Request updated successfully', request);
    } catch (error) {
      logger.error(`Error updating request: ${error.message}`);
      errorResponse(res, 400, 'Request update failed', error);
    }
  }

  async getUserRequests(req, res) {
    try {
      logger.info(`Fetching requests for user: ${req.params.userId}`);
      const requests = await RequestService.getRequestsByUserId(req.params.userId);
      successResponse(res, 200, 'User requests fetched successfully', requests);
    } catch (error) {
      logger.error(`Error fetching user requests: ${error.message}`);
      errorResponse(res, 500, 'Failed to fetch user requests', error);
    }
  }
}

module.exports = new RequestController();