// controllers/driver_controller.js
const DriverService = require('../services/driver_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class DriverController {
  // ==================== Authentication ====================
  
  async register(req, res) {
    try {
      logger.info('[INFO] 🚗 Driver registration request received');
      logger.info(`[INFO] Request body fields: ${Object.keys(req.body).join(', ')}`);
      
      const driver = await DriverService.registerDriver(req.body);
      
      logger.success(`[SUCCESS] ✅ Driver registered successfully: ${driver.name}`);
      successResponse(
        res, 
        201, 
        'Driver registered successfully (pending approval)', 
        driver
      );
    } catch (err) {
      logger.error(`[ERROR] ❌ Driver registration failed: ${err.message}`);
      errorResponse(res, 400, 'Driver registration failed', err);
    }
  }

  async login(req, res) {
    try {
      const { phone } = req.body;
      logger.info(`[INFO] 🔐 Driver login attempt: ${phone}`);
      
      if (!phone) {
        logger.error('[ERROR] Phone number missing in request');
        return errorResponse(res, 400, 'Phone number is required');
      }

      const result = await DriverService.loginDriver(phone);

      if (!result.success) {
        logger.warn(`[WARN] Login unsuccessful: ${result.message}`);
        return errorResponse(res, 403, result.message);
      }

      logger.success(`[SUCCESS] ✅ Driver login successful: ${result.driver.name}`);
      successResponse(res, 200, 'Driver login successful', result.driver);
    } catch (err) {
      logger.error(`[ERROR] ❌ Driver login failed: ${err.message}`);
      errorResponse(res, 400, 'Driver login failed', err);
    }
  }

  // ==================== Driver Management ====================
  
  async getById(req, res) {
    try {
      const { id } = req.params;
      logger.info(`[INFO] 🔍 Fetching driver by ID: ${id}`);
      
      const driver = await DriverService.getDriverById(id);
      
      logger.success(`[SUCCESS] ✅ Driver fetched: ${driver.name}`);
      successResponse(res, 200, 'Driver fetched successfully', driver);
    } catch (err) {
      logger.error(`[ERROR] ❌ Get driver failed: ${err.message}`);
      errorResponse(res, 404, 'Driver not found', err);
    }
  }

  async getAll(req, res) {
    try {
      logger.info('[INFO] 📋 Fetching all drivers');
      const drivers = await DriverService.getAll();
      
      logger.success(`[SUCCESS] ✅ Fetched ${drivers.length} drivers`);
      successResponse(res, 200, 'Drivers fetched successfully', drivers);
    } catch (err) {
      logger.error(`[ERROR] ❌ Fetch all drivers failed: ${err.message}`);
      errorResponse(res, 500, 'Failed to fetch drivers', err);
    }
  }

  async approve(req, res) {
    try {
      logger.info(`[INFO] ✅ Approving driver ID: ${req.params.id}`);
      const driver = await DriverService.approveDriver(req.params.id);
      
      logger.success(`[SUCCESS] ✅ Driver approved: ${driver.name}`);
      successResponse(res, 200, 'Driver approved successfully', driver);
    } catch (err) {
      logger.error(`[ERROR] ❌ Driver approval failed: ${err.message}`);
      errorResponse(res, 400, 'Driver approval failed', err);
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      logger.info(`[INFO] ✏️ Updating driver: ${id}`);
      logger.info(`[INFO] Fields to update: ${Object.keys(req.body).join(', ')}`);
      
      const driver = await DriverService.updateDriver(id, req.body);
      
      logger.success(`[SUCCESS] ✅ Driver updated: ${driver.name}`);
      successResponse(res, 200, 'Driver updated successfully', driver);
    } catch (err) {
      logger.error(`[ERROR] ❌ Driver update failed: ${err.message}`);
      errorResponse(res, 400, 'Driver update failed', err);
    }
  }

  // ==================== Online/Offline Status ====================
  
  async goOnline(req, res) {
    try {
      const { id } = req.params;
      logger.info(`[INFO] 🟢 Driver going online: ${id}`);
      
      const driver = await DriverService.goOnline(id);
      
      logger.success(`[SUCCESS] ✅ Driver is now online: ${driver.name}`);
      successResponse(res, 200, 'Driver is now online', driver);
    } catch (err) {
      logger.error(`[ERROR] ❌ Go online failed: ${err.message}`);
      errorResponse(res, 400, 'Failed to go online', err);
    }
  }

  async goOffline(req, res) {
    try {
      const { id } = req.params;
      logger.info(`[INFO] 🔴 Driver going offline: ${id}`);
      
      const driver = await DriverService.goOffline(id);
      
      logger.success(`[SUCCESS] ✅ Driver is now offline: ${driver.name}`);
      successResponse(res, 200, 'Driver is now offline', driver);
    } catch (err) {
      logger.error(`[ERROR] ❌ Go offline failed: ${err.message}`);
      errorResponse(res, 400, 'Failed to go offline', err);
    }
  }

  // ==================== Location Updates ====================
  
  async updateLocation(req, res) {
    try {
      const { id } = req.params;
      const { latitude, longitude } = req.body;
      
      logger.info(`[INFO] 📍 Updating location for driver: ${id}`);
      logger.info(`[INFO] Coordinates: ${latitude}, ${longitude}`);
      
      if (!latitude || !longitude) {
        logger.error('[ERROR] Latitude or longitude missing');
        return errorResponse(res, 400, 'Latitude and longitude are required');
      }

      const driver = await DriverService.updateLocation(id, latitude, longitude);
      
      logger.success(`[SUCCESS] ✅ Location updated: ${driver.name}`);
      successResponse(res, 200, 'Location updated successfully', driver);
    } catch (err) {
      logger.error(`[ERROR] ❌ Update location failed: ${err.message}`);
      errorResponse(res, 400, 'Failed to update location', err);
    }
  }

  // ==================== Order Management ====================
  
  async getDriverOrders(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.query;
      
      logger.info(`[INFO] 📦 Fetching orders for driver: ${id}`);
      if (status) {
        logger.info(`[INFO] Filtering by status: ${status}`);
      }
      
      const orders = await DriverService.getDriverOrders(id, status);
      
      logger.success(`[SUCCESS] ✅ Fetched ${orders.length} orders`);
      successResponse(res, 200, 'Orders fetched successfully', orders);
    } catch (err) {
      logger.error(`[ERROR] ❌ Fetch orders failed: ${err.message}`);
      errorResponse(res, 400, 'Failed to fetch orders', err);
    }
  }

  async getDriverActiveOrders(req, res) {
    try {
      const { id } = req.params;
      logger.info(`[INFO] ⚡ Fetching active orders for driver: ${id}`);
      
      const orders = await DriverService.getDriverActiveOrders(id);
      
      logger.success(`[SUCCESS] ✅ Fetched ${orders.length} active orders`);
      successResponse(res, 200, 'Active orders fetched successfully', orders);
    } catch (err) {
      logger.error(`[ERROR] ❌ Fetch active orders failed: ${err.message}`);
      errorResponse(res, 400, 'Failed to fetch active orders', err);
    }
  }

  async updateOrderStatus(req, res) {
    try {
      const { id, orderId } = req.params;
      const { status, additionalData } = req.body;
      
      logger.info(`[INFO] 🔄 Driver ${id} updating order ${orderId} status`);
      logger.info(`[INFO] New status: ${status}`);
      
      if (!status) {
        logger.error('[ERROR] Status field missing');
        return errorResponse(res, 400, 'Status is required');
      }

      const order = await DriverService.updateOrderStatus(
        id, 
        orderId, 
        status,
        additionalData
      );
      
      logger.success(`[SUCCESS] ✅ Order status updated: ${order.orderId} -> ${status}`);
      successResponse(res, 200, 'Order status updated successfully', order);
    } catch (err) {
      logger.error(`[ERROR] ❌ Update order status failed: ${err.message}`);
      errorResponse(res, 400, 'Failed to update order status', err);
    }
  }

  async completePickup(req, res) {
    try {
      const { id, orderId } = req.params;
      const { additionalItems, photos, comment, signature } = req.body;

      logger.info(`[DRIVER CTRL] Complete pickup: driver=${id} order=${orderId}`);

      const order = await DriverService.completePickup(
        id,
        orderId,
        additionalItems,
        photos,
        comment,
        signature
      );
      
      logger.success(`[SUCCESS] ✅ Pickup completed: ${order.orderId}`);
      successResponse(res, 200, 'Pickup completed successfully', order);
    } catch (err) {
      logger.error(`[ERROR] ❌ Complete pickup failed: ${err.message}`);
      errorResponse(res, 400, 'Failed to complete pickup', err);
    }
  }

  async completeDelivery(req, res) {
    try {
      const { id, orderId } = req.params;
      const { photos, comment, signature } = req.body;

      logger.info(`[DRIVER CTRL] Complete delivery: driver=${id} order=${orderId}`);

      const order = await DriverService.completeDelivery(
        id,
        orderId,
        photos,
        comment,
        signature
      );
      
      logger.success(`[SUCCESS] ✅ Delivery completed: ${order.orderId}`);
      successResponse(res, 200, 'Delivery completed successfully', order);
    } catch (err) {
      logger.error(`[ERROR] ❌ Complete delivery failed: ${err.message}`);
      errorResponse(res, 400, 'Failed to complete delivery', err);
    }
  }

  // ==================== Statistics ====================
  
  async getStatistics(req, res) {
    try {
      const { id } = req.params;
      logger.info(`[INFO] 📊 Fetching statistics for driver: ${id}`);
      
      const statistics = await DriverService.getDriverStatistics(id);
      
      logger.success(`[SUCCESS] ✅ Statistics fetched successfully`);
      logger.info(`[INFO] Stats - Total: ${statistics.totalOrders}, Completed: ${statistics.completedOrders}, Active: ${statistics.activeOrders}`);
      successResponse(res, 200, 'Statistics fetched successfully', statistics);
    } catch (err) {
      logger.error(`[ERROR] ❌ Fetch statistics failed: ${err.message}`);
      errorResponse(res, 400, 'Failed to fetch statistics', err);
    }
  }
}

module.exports = new DriverController();