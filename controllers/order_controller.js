const OrderService = require('../services/order_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class OrderController {
  async create(req, res) {
    try {
      logger.info('Order creation received');
      // attach meta if desired
      req.body.meta = {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      };
      const order = await OrderService.createOrder(req.body);
      return successResponse(res, 201, 'Order created successfully', order);
    } catch (err) {
      logger.error(`Order creation error: ${err.message}`);
      return errorResponse(res, 400, 'Order creation failed', err.message);
    }
  }

  async getById(req, res) {
    try {
      logger.info(`Fetching order id: ${req.params.id}`);
      const order = await OrderService.getOrderById(req.params.id);
      return successResponse(res, 200, 'Order fetched successfully', order);
    } catch (err) {
      logger.error(`Get order error: ${err.message}`);
      return errorResponse(res, 404, 'Order not found', err.message);
    }
  }

  async getAll(req, res) {
    try {
      logger.info('Fetching all orders');
      // allow simple status filter via query ?status=pending
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      const orders = await OrderService.getAllOrders(filter);
      return successResponse(res, 200, 'Orders fetched successfully', orders);
    } catch (err) {
      logger.error(`Get all orders error: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch orders', err.message);
    }
  }

  async update(req, res) {
    try {
      logger.info(`Updating order id: ${req.params.id}`);
      const order = await OrderService.updateOrder(req.params.id, req.body);
      return successResponse(res, 200, 'Order updated successfully', order);
    } catch (err) {
      logger.error(`Order update error: ${err.message}`);
      return errorResponse(res, 400, 'Order update failed', err.message);
    }
  }

  async getByUser(req, res) {
    try {
      logger.info(`Fetching orders for user: ${req.params.userId}`);
      const orders = await OrderService.getOrdersByUserId(req.params.userId);
      return successResponse(res, 200, 'User orders fetched successfully', orders);
    } catch (err) {
      logger.error(`Get user orders error: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch user orders', err.message);
    }
  }
}

module.exports = new OrderController();
