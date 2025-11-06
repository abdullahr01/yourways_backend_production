const Order = require('../models/order_model');
const Booking = require('../models/booking_model');
const Driver = require('../models/driver_model')
const logger = require('../utils/logger');

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
        
        // Pricing
        totalPrice: additionalData.totalPrice || 0,
        quotedPrice: additionalData.quotedPrice,
        
        // Metadata
        meta: booking.meta
      };
      
      const order = new Order(orderData);
      await order.save();
      
      // Update booking status
      booking.status = 'converted_to_order';
      booking.convertedOrderId = order._id;
      await booking.save();
      
      logger.success(`Order created successfully: ${order.orderId}`);
      logger.info(`Booking ${bookingId} marked as converted`);
      
      return order;
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
      
      logger.success(`Order created successfully: ${order.orderId}`);
      logger.info(`Total items in order: ${order.totalItems}`);
      
      return order;
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
        .populate('bookingId');
      
      if (!order) {
        logger.warn(`Order not found with ID: ${orderId}`);
        throw new Error('Order not found');
      }
      
      logger.success(`Order fetched successfully: ${order.orderId}`);
      return order;
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
        .populate('bookingId');
      
      if (!order) {
        logger.warn(`Order not found with orderId: ${orderId}`);
        throw new Error('Order not found');
      }
      
      logger.success(`Order fetched successfully: ${orderId}`);
      return order;
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
        .sort({ createdAt: -1 })
        .limit(limit);
      
      logger.success(`Fetched ${orders.length} orders`);
      return orders;
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
        .sort({ createdAt: -1 });
      
      logger.success(`Fetched ${orders.length} orders for user ${userId}`);
      return orders;
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
        .sort({ createdAt: -1 });
      
      logger.success(`Fetched ${orders.length} active orders`);
      return orders;
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
        'pickupScheduled',
        'outForPickup',
        'pickupCompleted',
        'outForDropOff',
        'completed',
        'cancelled'
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
      );
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      logger.success(`Order status updated: ${order.orderId} -> ${newStatus}`);
      return order;
    } catch (err) {
      logger.error(`Error updating order status: ${err.message}`);
      throw err;
    }
  }

  /**
   * Assign driver to order
   */
  async assignDriver(orderId, driverId) {
    // 1. Verify driver exists and is approved
    const driver = await Driver.findById(driverId);
  
    // 2. Assign driver to order
    const order = await Order.findByIdAndUpdate(
      orderId,
      { driver: driverId },
      { new: true }
    ).populate('driver');
  
    // 3. Add order to driver's assignedOrders array ✅ NEW
    await Driver.findByIdAndUpdate(
      driverId,
      { $addToSet: { assignedOrders: orderId } }
    );
  
    return order;
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
      
      logger.success(`Pricing updated for order: ${order.orderId}`);
      return order;
    } catch (err) {
      logger.error(`Error updating pricing: ${err.message}`);
      throw err;
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId, cancellationReason) {
    const order = await Order.findById(orderId);
  
    // Remove order from driver's list if assigned
    if (order.driver) {
      await Driver.findByIdAndUpdate(
        order.driver,
        { $pull: { assignedOrders: orderId } }
      );
    }
  
    order.status = 'cancelled';
    // ... rest of cancellation logic
  }

  /**
   * Update order details
   */
  async updateOrder(orderId, updateData) {
    try {
      logger.info(`Updating order: ${orderId}`);
      logger.info(`Update data: ${JSON.stringify(updateData)}`);
      
      const order = await Order.findByIdAndUpdate(
        orderId,
        updateData,
        { new: true, runValidators: true }
      );
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      logger.success(`Order updated successfully: ${order.orderId}`);
      return order;
    } catch (err) {
      logger.error(`Error updating order: ${err.message}`);
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
          status: 'pickupScheduled'
        },
        { new: true, runValidators: true }
      );
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      logger.success(`Pickup scheduled for order: ${order.orderId}`);
      return order;
    } catch (err) {
      logger.error(`Error scheduling pickup: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new OrderService();