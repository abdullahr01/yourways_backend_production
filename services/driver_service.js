const Driver = require('../models/driver_model');
const Order = require('../models/order_model');
const logger = require('../utils/logger');
const { formatOrder, formatOrders } = require('../utils/orderFormatter');

const DRIVER_ACTIVE_STATUSES = [
  'confirmed',
  'pickupScheduled',
  'outForPickup',
  'pickupCompleted',
  'outForDropOff',
];

class DriverService {
  async registerDriver(data) {
    try {
      logger.info('[DRIVER SVC] Registering driver...');
      logger.info(`[DRIVER SVC] phone=${data.phone} email=${data.email ? '***' : 'n/a'}`);

      if (!data.name || !data.email || !data.phone) {
        throw new Error('name, email and phone are required');
      }

      const existing = await Driver.findExisting({
        email: data.email.toLowerCase(),
        phone: data.phone,
      });
      if (existing) {
        throw new Error('Driver with this phone or email already exists.');
      }

      const driver = await Driver.create(data);
      logger.success(`[DRIVER SVC] Registered (pending approval) id=${driver.id}`);
      return driver;
    } catch (err) {
      logger.error(`[DRIVER SVC] register failed: ${err.message}`);
      throw err;
    }
  }

  async loginDriver(phone) {
    try {
      logger.info(`[DRIVER SVC] Login phone=${phone}`);
      const driver = await Driver.findByPhone(phone);
      if (!driver) throw new Error('Driver not found');

      if (!driver.isApprovedByAdmin) {
        logger.warn(`[DRIVER SVC] Not approved yet id=${driver.id}`);
        return {
          success: false,
          requiresAdminApproval: true,
          message: 'Contact admin for driver approval',
        };
      }

      if (driver.status === 'suspended') {
        throw new Error('Your account has been suspended. Contact admin.');
      }

      const token = Driver.generateAuthToken(driver);
      logger.success(`[DRIVER SVC] Login OK id=${driver.id}`);
      return { success: true, driver, token };
    } catch (err) {
      logger.error(`[DRIVER SVC] login failed: ${err.message}`);
      throw err;
    }
  }

  async approveDriver(driverId) {
    try {
      logger.info(`[DRIVER SVC] Approving id=${driverId}`);
      const driver = await Driver.updateById(driverId, {
        isApprovedByAdmin: true,
        status: 'active',
      });
      logger.success(`[DRIVER SVC] Approved ${driver.name}`);
      return driver;
    } catch (err) {
      logger.error(`[DRIVER SVC] approve failed: ${err.message}`);
      throw err;
    }
  }

  async getDriverById(driverId) {
    try {
      logger.info(`[DRIVER SVC] getById=${driverId}`);
      const driver = await Driver.findById(driverId);
      if (!driver) throw new Error('Driver not found');
      return driver;
    } catch (err) {
      logger.error(`[DRIVER SVC] getById failed: ${err.message}`);
      throw err;
    }
  }

  async getAll() {
    try {
      logger.info('[DRIVER SVC] getAll');
      return await Driver.findAll();
    } catch (err) {
      logger.error(`[DRIVER SVC] getAll failed: ${err.message}`);
      throw err;
    }
  }

  async updateDriver(driverId, updateData) {
    try {
      logger.info(`[DRIVER SVC] update id=${driverId} fields=${Object.keys(updateData).join(',')}`);
      const driver = await Driver.updateById(driverId, updateData);
      return driver;
    } catch (err) {
      logger.error(`[DRIVER SVC] update failed: ${err.message}`);
      throw err;
    }
  }

  async goOnline(driverId) {
    try {
      logger.info(`[DRIVER SVC] goOnline id=${driverId}`);
      return await Driver.updateById(driverId, {
        isOnline: true,
        lastOnlineAt: new Date().toISOString(),
        status: 'active',
      });
    } catch (err) {
      logger.error(`[DRIVER SVC] goOnline failed: ${err.message}`);
      throw err;
    }
  }

  async goOffline(driverId) {
    try {
      logger.info(`[DRIVER SVC] goOffline id=${driverId}`);
      return await Driver.updateById(driverId, {
        isOnline: false,
        lastOnlineAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(`[DRIVER SVC] goOffline failed: ${err.message}`);
      throw err;
    }
  }

  async updateLocation(driverId, latitude, longitude) {
    try {
      logger.info(`[DRIVER SVC] updateLocation id=${driverId} ${latitude},${longitude}`);
      return await Driver.updateLocation(driverId, latitude, longitude);
    } catch (err) {
      logger.error(`[DRIVER SVC] updateLocation failed: ${err.message}`);
      throw err;
    }
  }

  async getDriverOrders(driverId, statusFilter = null) {
    try {
      logger.info(`[DRIVER SVC] getOrders driver=${driverId} status=${statusFilter || 'any'}`);
      const driver = await Driver.findById(driverId);
      if (!driver) throw new Error('Driver not found');

      const filter = { driverId };
      if (statusFilter) filter.status = statusFilter;
      const orders = await Order.findMany(filter);
      return formatOrders(orders);
    } catch (err) {
      logger.error(`[DRIVER SVC] getOrders failed: ${err.message}`);
      throw err;
    }
  }

  async getDriverActiveOrders(driverId) {
    try {
      logger.info(`[DRIVER SVC] getActiveOrders driver=${driverId}`);
      const orders = await Order.findMany({
        driverId,
        statusIn: DRIVER_ACTIVE_STATUSES,
      });
      return formatOrders(orders);
    } catch (err) {
      logger.error(`[DRIVER SVC] getActiveOrders failed: ${err.message}`);
      throw err;
    }
  }

  async updateOrderStatus(driverId, orderId, newStatus, additionalData = {}) {
    try {
      logger.info(
        `[DRIVER SVC] updateOrderStatus driver=${driverId} order=${orderId} → ${newStatus}`
      );
      logger.info(`[DRIVER SVC] additionalData keys=${Object.keys(additionalData || {}).join(',')}`);

      const order = await Order.findById(orderId);
      if (!order) throw new Error('Order not found or not assigned to this driver');
      if (order.driverId !== driverId) {
        logger.warn(`[DRIVER SVC] Driver mismatch have=${order.driverId} want=${driverId}`);
        throw new Error('Order not found or not assigned to this driver');
      }

      const updateData = {
        status: newStatus,
        ...additionalData,
      };

      if (newStatus === 'completed') {
        updateData.completedAt = new Date().toISOString();
        await Driver.incrementCompletedOrders(driverId);
      }

      const updated = await Order.updateById(orderId, updateData);
      logger.success(`[DRIVER SVC] Order ${updated.orderId} → ${newStatus}`);
      return formatOrder(updated);
    } catch (err) {
      logger.error(`[DRIVER SVC] updateOrderStatus failed: ${err.message}`);
      throw err;
    }
  }

  async completePickup(driverId, orderId, additionalItems = [], photos = [], comment = '', signature = '') {
    try {
      logger.info(`[DRIVER SVC] completePickup driver=${driverId} order=${orderId}`);
      const additionalData = {
        pickupCompletedAt: new Date().toISOString(),
      };
      if (additionalItems?.length) additionalData.additionalItems = additionalItems;
      if (photos?.length) additionalData.pickupPhotos = photos;
      if (comment) additionalData.driverComment = comment;
      if (signature) additionalData.pickupSignature = signature;

      return await this.updateOrderStatus(driverId, orderId, 'pickupCompleted', additionalData);
    } catch (err) {
      logger.error(`[DRIVER SVC] completePickup failed: ${err.message}`);
      throw err;
    }
  }

  async completeDelivery(driverId, orderId, photos = [], comment = '', signature = '') {
    try {
      logger.info(`[DRIVER SVC] completeDelivery driver=${driverId} order=${orderId}`);
      const additionalData = {
        deliveryCompletedAt: new Date().toISOString(),
      };
      if (photos?.length) additionalData.deliveryPhotos = photos;
      if (signature) additionalData.deliverySignature = signature;

      if (comment) {
        const order = await Order.findById(orderId);
        additionalData.driverComment = order?.driverComment
          ? `${order.driverComment} | Delivery: ${comment}`
          : comment;
      }

      return await this.updateOrderStatus(driverId, orderId, 'completed', additionalData);
    } catch (err) {
      logger.error(`[DRIVER SVC] completeDelivery failed: ${err.message}`);
      throw err;
    }
  }

  async getDriverStatistics(driverId) {
    try {
      logger.info(`[DRIVER SVC] statistics driver=${driverId}`);
      const driver = await Driver.findById(driverId);
      if (!driver) throw new Error('Driver not found');

      const totalOrders = await Order.count({ driverId });
      const completedOrders = await Order.count({ driverId, status: 'completed' });
      const activeOrders = await Order.count({
        driverId,
        statusIn: DRIVER_ACTIVE_STATUSES,
      });

      const statistics = {
        totalOrders,
        completedOrders,
        activeOrders,
        rating: driver.rating,
        totalRatings: driver.totalRatings,
      };

      logger.success(
        `[DRIVER SVC] Stats total=${totalOrders} completed=${completedOrders} active=${activeOrders}`
      );
      return statistics;
    } catch (err) {
      logger.error(`[DRIVER SVC] statistics failed: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new DriverService();
