const Order = require('../models/order_model');
const Booking = require('../models/booking_model');
const Driver = require('../models/driver_model');
const logger = require('../utils/logger');
const { formatOrder, formatOrders } = require('../utils/orderFormatter');

class OrderService {
  /**
   * Create order from booking
   */
  async createOrderFromBooking(bookingId, additionalData = {}) {
    try {
      logger.info(`Creating order from booking: ${bookingId}`);
      
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      if (booking.status !== 'submitted') {
        throw new Error('Only submitted bookings can be converted to orders');
      }
      
      if (booking.status === 'converted_to_order') {
        throw new Error('Booking already converted to order');
      }
      
      logger.info('Mapping booking data to order...');
      
      // Map booking to order
      const orderData = {
        userId: booking.userId,
        bookingId: booking._id,
        serviceName: additionalData.serviceName || 'Moving Service',
        
        // Locations
        pickupLocation: booking.collectionPostcode,
        deliveryLocation: booking.deliveryPostcode,
        
        // Dates
        pickupDateTime: booking.moveDate,
        
        // Property Details
        pickupPropertyType: booking.collectionPropertyType,
        deliveryPropertyType: booking.deliveryPropertyType,
        pickupFloorLevel: booking.collectionFloorLevel,
        deliveryFloorLevel: booking.deliveryFloorLevel,
        pickupLiftAccess: booking.collectionLiftAccess,
        deliveryLiftAccess: booking.deliveryLiftAccess,
        
        // Service Details
        manpowerRequired: booking.manpowerRequired,
        packingService: booking.packingService,
        dismantlingRequired: booking.dismantlingRequired,
        parkingAccess: booking.parkingAccess,
        insuranceValue: booking.insuranceValue,
        jobNotes: booking.jobNotes,
        
        // Contact
        customerName: booking.fullName,
        customerEmail: booking.email,
        customerPhone: booking.mobileNumber,
        
        // Items - convert booking items to order items
        items: booking.items.map(item => ({
          category: item.category,
          itemName: item.itemName,
          quantity: item.quantity,
          modifiers: Object.fromEntries(item.modifiers)
        })),
        
        // Pricing — use booking quotation if available
        totalPrice: additionalData.totalPrice || booking.calculatedPrice || 0,
        quotedPrice: additionalData.quotedPrice || booking.calculatedPrice,
        
        // Metadata
        meta: booking.meta
      };
      
      const order = new Order(orderData);
      await order.save();
      
      // Update booking status
      booking.status = 'converted_to_order';
      booking.convertedOrderId = order._id;
      await booking.save();
      
      logger.success(`[ORDER] Created from booking: ${order.orderId} (status: pending, price: £${order.totalPrice})`);
      logger.info(`[ORDER] Booking ${bookingId} marked as converted`);

      return formatOrder(order);
    } catch (err) {
      logger.error(`Error creating order from booking: ${err.message}`);
      throw err;
    }
  }

  /**
   * Create order directly (without booking)
   */
  async createOrder(orderData) {
    try {
      logger.info('Creating new order directly...');
      
      const order = new Order(orderData);
      await order.save();
      
      logger.success(`[ORDER] Created: ${order.orderId}`);
      logger.info(`[ORDER] Total items: ${order.totalItems}`);

      return formatOrder(order);
    } catch (err) {
      logger.error(`Error creating order: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId) {
    try {
      logger.info(`Fetching order with ID: ${orderId}`);
      
      const order = await Order.findById(orderId)
        .populate('userId', 'name email phone')
        .populate('bookingId')
        .populate('driver', 'name phone vehicleType vehicleNumber rating');
      
      if (!order) {
        logger.warn(`Order not found with ID: ${orderId}`);
        throw new Error('Order not found');
      }
      
      logger.success(`[ORDER] Fetched: ${order.orderId}`);
      return formatOrder(order);
    } catch (err) {
      logger.error(`Error fetching order: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get order by orderId (ORD-XXX format)
   */
  async getOrderByOrderId(orderId) {
    try {
      logger.info(`Fetching order with orderId: ${orderId}`);
      
      const order = await Order.findOne({ orderId })
        .populate('userId', 'name email phone')
        .populate('bookingId')
        .populate('driver', 'name phone vehicleType vehicleNumber rating');
      
      if (!order) {
        logger.warn(`Order not found with orderId: ${orderId}`);
        throw new Error('Order not found');
      }
      
      logger.success(`[ORDER] Fetched by code: ${orderId}`);
      return formatOrder(order);
    } catch (err) {
      logger.error(`Error fetching order by orderId: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get all orders with optional filters
   */
  async getAllOrders(filter = {}, limit = 100) {
    try {
      logger.info('Fetching all orders...');
      logger.info(`Applied filters: ${JSON.stringify(filter)}`);
      
      const orders = await Order.find(filter)
        .populate('userId', 'name email phone')
        .populate('driver', 'name phone vehicleType vehicleNumber rating')
        .sort({ createdAt: -1 })
        .limit(limit);

      logger.success(`[ORDER] Fetched ${orders.length} orders`);
      return formatOrders(orders);
    } catch (err) {
      logger.error(`Error fetching orders: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get orders by user ID
   */
  async getOrdersByUserId(userId, status = null) {
    try {
      logger.info(`Fetching orders for user: ${userId}`);
      
      const filter = { userId };
      if (status) {
        filter.status = status;
        logger.info(`Filtering by status: ${status}`);
      }
      
      const orders = await Order.find(filter)
        .populate('driver', 'name phone vehicleType vehicleNumber rating')
        .sort({ createdAt: -1 });

      logger.success(`[ORDER] Fetched ${orders.length} orders for user ${userId}`);
      return formatOrders(orders);
    } catch (err) {
      logger.error(`Error fetching user orders: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get active orders (not completed or cancelled)
   */
  async getActiveOrders(userId = null) {
    try {
      logger.info('Fetching active orders...');
      
      const filter = {
        status: { $nin: ['completed', 'cancelled'] }
      };
      
      if (userId) {
        filter.userId = userId;
        logger.info(`Filtering for user: ${userId}`);
      }
      
      const orders = await Order.find(filter)
        .populate('userId', 'name email phone')
        .populate('driver', 'name phone vehicleType vehicleNumber rating')
        .sort({ createdAt: -1 });

      logger.success(`[ORDER] Fetched ${orders.length} active orders`);
      return formatOrders(orders);
    } catch (err) {
      logger.error(`Error fetching active orders: ${err.message}`);
      throw err;
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId, newStatus) {
    try {
      logger.info(`Updating order ${orderId} status to: ${newStatus}`);
      
      const validStatuses = [
        'pending',
        'confirmed',
        'pickupScheduled',
        'outForPickup',
        'pickupCompleted',
        'outForDropOff',
        'completed',
        'cancelled',
      ];
      
      if (!validStatuses.includes(newStatus)) {
        throw new Error(`Invalid status: ${newStatus}`);
      }
      
      const updateData = { status: newStatus };
      
      // Set completedAt if status is completed
      if (newStatus === 'completed') {
        updateData.completedAt = new Date();
        logger.info('Setting completion timestamp');
      }
      
      const order = await Order.findByIdAndUpdate(
        orderId,
        updateData,
        { new: true, runValidators: true }
      ).populate('driver', 'name phone vehicleType vehicleNumber rating');

      if (!order) {
        throw new Error('Order not found');
      }

      logger.success(`[ORDER] Status updated: ${order.orderId} -> ${newStatus}`);
      return formatOrder(order);
    } catch (err) {
      logger.error(`Error updating order status: ${err.message}`);
      throw err;
    }
  }

  /**
   * Assign driver to order (YourWays doc: admin assigns -> status becomes confirmed)
   */
  async assignDriver(orderId, driverId) {
    try {
      logger.info(`[ORDER] Assigning driver ${driverId} to order ${orderId}`);

      const driver = await Driver.findById(driverId);
      if (!driver) {
        throw new Error('Driver not found');
      }
      if (!driver.isApprovedByAdmin) {
        throw new Error('Driver is not approved by admin');
      }

      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      const updateData = { driver: driverId };
      if (order.status === 'pending') {
        updateData.status = 'confirmed';
        logger.info('[ORDER] Status will change: pending -> confirmed');
      }

      const updatedOrder = await Order.findByIdAndUpdate(orderId, updateData, { new: true })
        .populate('driver', 'name phone vehicleType vehicleNumber rating');

      await Driver.findByIdAndUpdate(driverId, { $addToSet: { assignedOrders: orderId } });

      logger.success(`[ORDER] Driver ${driver.name} assigned to ${updatedOrder.orderId}`);
      return formatOrder(updatedOrder);
    } catch (err) {
      logger.error(`[ORDER] Assign driver failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Update order pricing
   */
  async updatePricing(orderId, pricingData) {
    try {
      logger.info(`Updating pricing for order: ${orderId}`);
      
      const updateData = {};
      if (pricingData.totalPrice !== undefined) {
        updateData.totalPrice = pricingData.totalPrice;
      }
      if (pricingData.quotedPrice !== undefined) {
        updateData.quotedPrice = pricingData.quotedPrice;
      }
      
      logger.info(`New pricing: ${JSON.stringify(pricingData)}`);
      
      const order = await Order.findByIdAndUpdate(
        orderId,
        updateData,
        { new: true, runValidators: true }
      );
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      logger.success(`[ORDER] Pricing updated: ${order.orderId}`);
      return formatOrder(order);
    } catch (err) {
      logger.error(`Error updating pricing: ${err.message}`);
      throw err;
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId, cancellationReason) {
    try {
      logger.info(`[ORDER] Cancelling order: ${orderId}`);
      logger.info(`[ORDER] Reason: ${cancellationReason}`);

      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status === 'completed') {
        throw new Error('Cannot cancel a completed order');
      }
      if (order.status === 'cancelled') {
        throw new Error('Order is already cancelled');
      }

      if (order.driver) {
        await Driver.findByIdAndUpdate(order.driver, { $pull: { assignedOrders: orderId } });
        logger.info(`[ORDER] Removed from driver ${order.driver} assigned list`);
      }

      order.status = 'cancelled';
      order.cancellationReason = cancellationReason;
      await order.save();

      const populated = await Order.findById(orderId)
        .populate('driver', 'name phone vehicleType vehicleNumber rating');

      logger.success(`[ORDER] Cancelled: ${order.orderId}`);
      return formatOrder(populated);
    } catch (err) {
      logger.error(`[ORDER] Cancel failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Update order details
   */
  async updateOrder(orderId, updateData) {
    try {
      logger.info(`[ORDER] Updating order: ${orderId}`);
      logger.info(`[ORDER] Update data: ${JSON.stringify(updateData)}`);

      const order = await Order.findByIdAndUpdate(
        orderId,
        updateData,
        { new: true, runValidators: true }
      ).populate('driver', 'name phone vehicleType vehicleNumber rating');

      if (!order) {
        throw new Error('Order not found');
      }

      logger.success(`[ORDER] Updated: ${order.orderId}`);
      return formatOrder(order);
    } catch (err) {
      logger.error(`[ORDER] Update failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Schedule pickup for order
   */
  async schedulePickup(orderId, pickupDateTime) {
    try {
      logger.info(`Scheduling pickup for order: ${orderId}`);
      logger.info(`Pickup time: ${pickupDateTime}`);
      
      const order = await Order.findByIdAndUpdate(
        orderId,
        {
          pickupDateTime: new Date(pickupDateTime),
          status: 'pickupScheduled',
        },
        { new: true, runValidators: true }
      ).populate('driver', 'name phone vehicleType vehicleNumber rating');
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      logger.success(`[ORDER] Pickup scheduled: ${order.orderId}`);
      return formatOrder(order);
    } catch (err) {
      logger.error(`Error scheduling pickup: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new OrderService();