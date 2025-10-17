const Order = require('../models/order_model');
const logger = require('../utils/logger');

class OrderService {
  async createOrder(orderData) {
    try {
      const order = new Order(orderData);
      await order.save();
      logger.success(`Order created with code: ${order.requestCode}`);
      return order;
    } catch (err) {
      logger.error(`Error creating order: ${err.message}`);
      throw err;
    }
  }

  async getOrderById(id) {
    try {
      const order = await Order.findById(id).populate('userId', 'name email phone').populate('driverId', 'name phone vehicleType');
      if (!order) {
        throw new Error('Order not found');
      }
      logger.info(`Fetched order ${id}`);
      return order;
    } catch (err) {
      logger.error(`Error fetching order by id: ${err.message}`);
      throw err;
    }
  }

  async getAllOrders(filter = {}) {
    try {
      const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(100);
      logger.info(`Fetched ${orders.length} orders`);
      return orders;
    } catch (err) {
      logger.error(`Error fetching orders: ${err.message}`);
      throw err;
    }
  }

  async updateOrder(id, updateData) {
    try {
      const order = await Order.findByIdAndUpdate(id, updateData, { new: true });
      if (!order) {
        throw new Error('Order not found');
      }
      logger.success(`Order updated: ${id}`);
      return order;
    } catch (err) {
      logger.error(`Error updating order: ${err.message}`);
      throw err;
    }
  }

  async getOrdersByUserId(userId) {
    try {
      const orders = await Order.find({ userId }).sort({ createdAt: -1 });
      logger.info(`Fetched ${orders.length} orders for user ${userId}`);
      return orders;
    } catch (err) {
      logger.error(`Error fetching orders by user: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new OrderService();
