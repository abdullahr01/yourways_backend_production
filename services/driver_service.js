// services/driver_service.js
const Driver = require('../models/driver_model');
const Order = require('../models/order_model');
const logger = require('../utils/logger');

class DriverService {
  // ==================== Authentication ====================
  
  async registerDriver(data) {
    try {
      logger.info('[INFO] Registering new driver...');
      logger.info(`[INFO] Phone: ${data.phone}, Email: ${data.email}`);
      
      const existing = await Driver.findOne({ 
        $or: [{ phone: data.phone }, { email: data.email }] 
      });
      
      if (existing) {
        logger.error(`[ERROR] Driver already exists: ${data.phone || data.email}`);
        throw new Error('Driver with this phone or email already exists.');
      }

      const driver = new Driver(data);
      await driver.save();

      logger.success(`[SUCCESS] ✅ Driver registered (pending approval) ID: ${driver._id}`);
      logger.info(`[INFO] Driver name: ${driver.name}`);
      return driver;
    } catch (err) {
      logger.error(`[ERROR] ❌ Register Driver failed: ${err.message}`);
      throw err;
    }
  }

  async loginDriver(phone) {
    try {
      logger.info(`[INFO] Driver login attempt: ${phone}`);
      const driver = await Driver.findOne({ phone });
      
      if (!driver) {
        logger.error(`[ERROR] Driver not found: ${phone}`);
        throw new Error('Driver not found');
      }

      logger.info(`[INFO] Driver found: ${driver.name} (${driver._id})`);

      if (!driver.isApprovedByAdmin) {
        logger.warn(`[WARN] Driver not approved yet: ${phone}`);
        return { 
          success: false, 
          requiresAdminApproval: true,
          message: 'Contact admin for driver approval' 
        };
      }

      if (driver.status === 'suspended') {
        logger.error(`[ERROR] Driver account suspended: ${phone}`);
        throw new Error('Your account has been suspended. Contact admin.');
      }

      logger.success(`[SUCCESS] ✅ Driver login successful: ${phone}`);
      return { 
        success: true, 
        driver 
      };
    } catch (err) {
      logger.error(`[ERROR] ❌ Login Driver failed: ${err.message}`);
      throw err;
    }
  }

  // ==================== Driver Management ====================
  
  async approveDriver(driverId) {
    try {
      logger.info(`[INFO] Approving driver: ${driverId}`);
      const driver = await Driver.findByIdAndUpdate(
        driverId,
        { 
          isApprovedByAdmin: true,
          status: 'active' 
        },
        { new: true }
      );
      
      if (!driver) {
        logger.error(`[ERROR] Driver not found: ${driverId}`);
        throw new Error('Driver not found');
      }
      
      logger.success(`[SUCCESS] ✅ Driver approved: ${driver.name} (${driverId})`);
      return driver;
    } catch (err) {
      logger.error(`[ERROR] ❌ Approve Driver failed: ${err.message}`);
      throw err;
    }
  }

  async getDriverById(driverId) {
    try {
      logger.info(`[INFO] Fetching driver: ${driverId}`);
      const driver = await Driver.findById(driverId)
        .populate('assignedOrders');
      
      if (!driver) {
        logger.error(`[ERROR] Driver not found: ${driverId}`);
        throw new Error('Driver not found');
      }
      
      logger.success(`[SUCCESS] ✅ Driver fetched: ${driver.name} (${driverId})`);
      logger.info(`[INFO] Assigned orders count: ${driver.assignedOrders?.length || 0}`);
      return driver;
    } catch (err) {
      logger.error(`[ERROR] ❌ Get Driver failed: ${err.message}`);
      throw err;
    }
  }

  async getAll() {
    try {
      logger.info('[INFO] Fetching all drivers');
      const drivers = await Driver.find({})
        .sort({ createdAt: -1 });
      
      logger.success(`[SUCCESS] ✅ Fetched ${drivers.length} drivers`);
      return drivers;
    } catch (err) {
      logger.error(`[ERROR] ❌ Fetch Drivers failed: ${err.message}`);
      throw err;
    }
  }

  async updateDriver(driverId, updateData) {
    try {
      logger.info(`[INFO] Updating driver: ${driverId}`);
      logger.info(`[INFO] Fields to update: ${Object.keys(updateData).join(', ')}`);
      
      const driver = await Driver.findByIdAndUpdate(
        driverId,
        updateData,
        { new: true, runValidators: true }
      );
      
      if (!driver) {
        logger.error(`[ERROR] Driver not found: ${driverId}`);
        throw new Error('Driver not found');
      }
      
      logger.success(`[SUCCESS] ✅ Driver updated: ${driver.name} (${driverId})`);
      return driver;
    } catch (err) {
      logger.error(`[ERROR] ❌ Update Driver failed: ${err.message}`);
      throw err;
    }
  }

  // ==================== Online/Offline Status ====================
  
  async goOnline(driverId) {
    try {
      logger.info(`[INFO] Driver going online: ${driverId}`);
      const driver = await Driver.findByIdAndUpdate(
        driverId,
        { 
          isOnline: true,
          lastOnlineAt: new Date(),
          status: 'active'
        },
        { new: true }
      );
      
      if (!driver) {
        logger.error(`[ERROR] Driver not found: ${driverId}`);
        throw new Error('Driver not found');
      }
      
      logger.success(`[SUCCESS] ✅ Driver is now online: ${driver.name}`);
      return driver;
    } catch (err) {
      logger.error(`[ERROR] ❌ Go Online failed: ${err.message}`);
      throw err;
    }
  }

  async goOffline(driverId) {
    try {
      logger.info(`[INFO] Driver going offline: ${driverId}`);
      const driver = await Driver.findByIdAndUpdate(
        driverId,
        { 
          isOnline: false,
          lastOnlineAt: new Date()
        },
        { new: true }
      );
      
      if (!driver) {
        logger.error(`[ERROR] Driver not found: ${driverId}`);
        throw new Error('Driver not found');
      }
      
      logger.success(`[SUCCESS] ✅ Driver is now offline: ${driver.name}`);
      return driver;
    } catch (err) {
      logger.error(`[ERROR] ❌ Go Offline failed: ${err.message}`);
      throw err;
    }
  }

  // ==================== Location Updates ====================
  
  async updateLocation(driverId, latitude, longitude) {
    try {
      logger.info(`[INFO] Updating driver location: ${driverId}`);
      logger.info(`[INFO] Coordinates: ${latitude}, ${longitude}`);
      
      const driver = await Driver.findById(driverId);
      
      if (!driver) {
        logger.error(`[ERROR] Driver not found: ${driverId}`);
        throw new Error('Driver not found');
      }
      
      await driver.updateLocation(latitude, longitude);
      logger.success(`[SUCCESS] ✅ Location updated for driver: ${driver.name}`);
      return driver;
    } catch (err) {
      logger.error(`[ERROR] ❌ Update Location failed: ${err.message}`);
      throw err;
    }
  }

  // ==================== Order Management - FIXED ====================
  
  async getDriverOrders(driverId, statusFilter = null) {
    try {
      logger.info(`[INFO] Fetching orders for driver: ${driverId}`);
      
      const driver = await Driver.findById(driverId);
      if (!driver) {
        logger.error(`[ERROR] Driver not found: ${driverId}`);
        throw new Error('Driver not found');
      }

      logger.info(`[INFO] Driver: ${driver.name}`);

      // FIXED: Query by driver ObjectId reference
      const query = { driver: driverId };
      
      if (statusFilter) {
        query.status = statusFilter;
        logger.info(`[INFO] Filtering by status: ${statusFilter}`);
      }

      const orders = await Order.find(query)
        .populate('userId', 'name phone email')
        .sort({ pickupDateTime: 1 });
      
      logger.success(`[SUCCESS] ✅ Fetched ${orders.length} orders for driver: ${driver.name}`);
      return orders;
    } catch (err) {
      logger.error(`[ERROR] ❌ Get Driver Orders failed: ${err.message}`);
      throw err;
    }
  }

  async getDriverActiveOrders(driverId) {
    try {
      logger.info(`[INFO] Fetching active orders for driver: ${driverId}`);
      
      const activeStatuses = [
        'pickupScheduled',
        'outForPickup',
        'itemsCollected',
        'outForDropOff'
      ];

      logger.info(`[INFO] Active statuses: ${activeStatuses.join(', ')}`);

      // FIXED: Query by driver ObjectId reference
      const orders = await Order.find({
        driver: driverId,
        status: { $in: activeStatuses }
      })
        .populate('userId', 'name phone email')
        .sort({ pickupDateTime: 1 });
      
      logger.success(`[SUCCESS] ✅ Fetched ${orders.length} active orders for driver`);
      return orders;
    } catch (err) {
      logger.error(`[ERROR] ❌ Get Driver Active Orders failed: ${err.message}`);
      throw err;
    }
  }

  async updateOrderStatus(driverId, orderId, newStatus, additionalData = {}) {
    try {
      logger.info(`[INFO] Driver ${driverId} updating order ${orderId} to ${newStatus}`);
      
      // FIXED: Find order by driver ObjectId reference
      const order = await Order.findOne({ 
        _id: orderId, 
        driver: driverId 
      });
      
      if (!order) {
        logger.error(`[ERROR] Order not found or not assigned to driver: ${orderId}`);
        throw new Error('Order not found or not assigned to this driver');
      }

      logger.info(`[INFO] Order found: ${order.orderId}`);

      const updateData = {
        status: newStatus,
        updatedAt: new Date(),
        ...additionalData
      };

      // Add completion timestamp if completing order
      if (newStatus === 'completed') {
        updateData.completedAt = new Date();
        logger.info('[INFO] Setting completion timestamp');
        
        // Update driver statistics
        await Driver.findByIdAndUpdate(driverId, {
          $inc: { completedOrders: 1 }
        });
        logger.info('[INFO] Driver completed orders count incremented');
      }

      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        updateData,
        { new: true }
      ).populate('userId', 'name phone email');
      
      logger.success(`[SUCCESS] ✅ Order ${order.orderId} status updated to ${newStatus}`);
      return updatedOrder;
    } catch (err) {
      logger.error(`[ERROR] ❌ Update Order Status failed: ${err.message}`);
      throw err;
    }
  }

  async completePickup(driverId, orderId, additionalItems = [], photos = [], comment = '') {
    try {
      logger.info(`[INFO] Driver ${driverId} completing pickup for order ${orderId}`);
      
      const additionalData = {
        pickupCompletedAt: new Date()
      };

      if (additionalItems && additionalItems.length > 0) {
        additionalData.additionalItems = additionalItems;
        logger.info(`[INFO] Additional items count: ${additionalItems.length}`);
      }

      if (photos && photos.length > 0) {
        additionalData.pickupPhotos = photos;
        logger.info(`[INFO] Pickup photos count: ${photos.length}`);
      }

      if (comment) {
        additionalData.driverComment = comment;
        logger.info(`[INFO] Driver comment: ${comment}`);
      }

      const order = await this.updateOrderStatus(
        driverId, 
        orderId, 
        'itemsCollected',
        additionalData
      );
      
      logger.success(`[SUCCESS] ✅ Pickup completed for order ${order.orderId}`);
      return order;
    } catch (err) {
      logger.error(`[ERROR] ❌ Complete Pickup failed: ${err.message}`);
      throw err;
    }
  }

  async completeDelivery(driverId, orderId, photos = [], comment = '') {
    try {
      logger.info(`[INFO] Driver ${driverId} completing delivery for order ${orderId}`);
      
      const additionalData = {
        deliveryCompletedAt: new Date()
      };

      if (photos && photos.length > 0) {
        additionalData.deliveryPhotos = photos;
        logger.info(`[INFO] Delivery photos count: ${photos.length}`);
      }

      if (comment) {
        const order = await Order.findById(orderId);
        if (order && order.driverComment) {
          additionalData.driverComment = `${order.driverComment} | Delivery: ${comment}`;
        } else {
          additionalData.driverComment = comment;
        }
        logger.info(`[INFO] Driver comment: ${comment}`);
      }

      const order = await this.updateOrderStatus(
        driverId, 
        orderId, 
        'completed',
        additionalData
      );
      
      logger.success(`[SUCCESS] ✅ Delivery completed for order ${order.orderId}`);
      return order;
    } catch (err) {
      logger.error(`[ERROR] ❌ Complete Delivery failed: ${err.message}`);
      throw err;
    }
  }

  // ==================== Statistics - FIXED ====================
  
  async getDriverStatistics(driverId) {
    try {
      logger.info(`[INFO] Fetching statistics for driver: ${driverId}`);
      
      const driver = await Driver.findById(driverId);
      if (!driver) {
        logger.error(`[ERROR] Driver not found: ${driverId}`);
        throw new Error('Driver not found');
      }

      logger.info(`[INFO] Calculating statistics for: ${driver.name}`);

      // FIXED: Count orders by driver ObjectId reference
      const totalOrders = await Order.countDocuments({ driver: driverId });
      const completedOrders = await Order.countDocuments({ 
        driver: driverId, 
        status: 'completed' 
      });
      const activeOrders = await Order.countDocuments({ 
        driver: driverId,
        status: { 
          $in: ['pickupScheduled', 'outForPickup', 'itemsCollected', 'outForDropOff'] 
        }
      });

      const statistics = {
        totalOrders,
        completedOrders,
        activeOrders,
        rating: driver.rating,
        totalRatings: driver.totalRatings
      };

      logger.success(`[SUCCESS] ✅ Statistics fetched for driver: ${driver.name}`);
      logger.info(`[INFO] Total: ${totalOrders}, Completed: ${completedOrders}, Active: ${activeOrders}`);
      return statistics;
    } catch (err) {
      logger.error(`[ERROR] ❌ Get Statistics failed: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new DriverService();