const Order = require('../models/order_model');
const Booking = require('../models/booking_model');
const Driver = require('../models/driver_model');
const logger = require('../utils/logger');
const { formatOrder, formatOrders } = require('../utils/orderFormatter');

const ACTIVE_STATUSES = [
  'pending',
  'confirmed',
  'pickupScheduled',
  'outForPickup',
  'pickupCompleted',
  'outForDropOff',
];

const VALID_STATUSES = [
  'pending',
  'confirmed',
  'pickupScheduled',
  'outForPickup',
  'pickupCompleted',
  'outForDropOff',
  'completed',
  'cancelled',
];

class OrderService {
  async createOrderFromBooking(bookingId, additionalData = {}) {
    try {
      logger.info(`[ORDER SVC] createFromBooking bookingId=${bookingId}`);
      logger.info(`[ORDER SVC] extra=${JSON.stringify(additionalData)}`);

      const booking = await Booking.findById(bookingId);
      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'submitted') {
        throw new Error('Only submitted bookings can be converted to orders');
      }
      if (booking.convertedOrderId) {
        throw new Error('Booking already converted to order');
      }

      const orderData = {
        userId: booking.userId,
        bookingId: booking.id,
        serviceName: additionalData.serviceName || 'Moving Service',
        pickupLocation: booking.collectionPostcode,
        deliveryLocation: booking.deliveryPostcode,
        pickupDateTime: booking.moveDate,
        pickupPropertyType: booking.collectionPropertyType,
        deliveryPropertyType: booking.deliveryPropertyType,
        pickupFloorLevel: booking.collectionFloorLevel,
        deliveryFloorLevel: booking.deliveryFloorLevel,
        pickupLiftAccess: booking.collectionLiftAccess,
        deliveryLiftAccess: booking.deliveryLiftAccess,
        manpowerRequired: booking.manpowerRequired,
        packingService: booking.packingService,
        dismantlingRequired: booking.dismantlingRequired,
        parkingAccess: booking.parkingAccess,
        insuranceValue: booking.insuranceValue,
        jobNotes: booking.jobNotes,
        customerName: booking.fullName,
        customerEmail: booking.email,
        customerPhone: booking.mobileNumber,
        items: (booking.items || []).map((item) => ({
          category: item.category,
          itemName: item.itemName,
          quantity: item.quantity,
          modifiers: item.modifiers || {},
        })),
        totalPrice: additionalData.totalPrice ?? booking.calculatedPrice ?? 0,
        quotedPrice: additionalData.quotedPrice ?? booking.calculatedPrice,
        status: 'pending',
        meta: booking.meta,
      };

      const order = await Order.create(orderData);

      await Booking.updateById(bookingId, {
        status: 'converted_to_order',
        convertedOrderId: order._id,
      });

      logger.success(
        `[ORDER SVC] Created ${order.orderId} from booking ${bookingId} price=£${order.totalPrice}`
      );
      return formatOrder(order);
    } catch (err) {
      logger.error(`[ORDER SVC] createFromBooking failed: ${err.message}`);
      throw err;
    }
  }

  async createOrder(orderData) {
    try {
      logger.info('[ORDER SVC] Direct create order...');
      const order = await Order.create(orderData);
      logger.success(`[ORDER SVC] Created ${order.orderId}`);
      return formatOrder(order);
    } catch (err) {
      logger.error(`[ORDER SVC] create failed: ${err.message}`);
      throw err;
    }
  }

  async getOrderById(orderId) {
    try {
      logger.info(`[ORDER SVC] getById=${orderId}`);
      const order = await Order.findById(orderId);
      if (!order) throw new Error('Order not found');
      return formatOrder(order);
    } catch (err) {
      logger.error(`[ORDER SVC] getById failed: ${err.message}`);
      throw err;
    }
  }

  async getOrderByOrderId(orderCode) {
    try {
      logger.info(`[ORDER SVC] getByCode=${orderCode}`);
      const order = await Order.findByOrderCode(orderCode);
      if (!order) throw new Error('Order not found');
      return formatOrder(order);
    } catch (err) {
      logger.error(`[ORDER SVC] getByCode failed: ${err.message}`);
      throw err;
    }
  }

  async getAllOrders(filter = {}, limit = 100) {
    try {
      logger.info(`[ORDER SVC] getAll filter=${JSON.stringify(filter)}`);
      const orders = await Order.findMany(filter, limit);
      return formatOrders(orders);
    } catch (err) {
      logger.error(`[ORDER SVC] getAll failed: ${err.message}`);
      throw err;
    }
  }

  async getOrdersByUserId(userId, status = null) {
    try {
      logger.info(`[ORDER SVC] getByUser userId=${userId} status=${status || 'any'}`);
      const filter = { userId };
      if (status) filter.status = status;
      const orders = await Order.findMany(filter);
      return formatOrders(orders);
    } catch (err) {
      logger.error(`[ORDER SVC] getByUser failed: ${err.message}`);
      throw err;
    }
  }

  async getActiveOrders(userId = null) {
    try {
      logger.info(`[ORDER SVC] getActive userId=${userId || 'all'}`);
      const filter = { statusIn: ACTIVE_STATUSES };
      if (userId) filter.userId = userId;
      const orders = await Order.findMany(filter);
      return formatOrders(orders);
    } catch (err) {
      logger.error(`[ORDER SVC] getActive failed: ${err.message}`);
      throw err;
    }
  }

  async updateOrderStatus(orderId, newStatus) {
    try {
      logger.info(`[ORDER SVC] updateStatus id=${orderId} → ${newStatus}`);
      if (!VALID_STATUSES.includes(newStatus)) {
        throw new Error(`Invalid status: ${newStatus}`);
      }

      const updateData = { status: newStatus };
      if (newStatus === 'completed') {
        updateData.completedAt = new Date().toISOString();
      }

      const order = await Order.updateById(orderId, updateData);
      logger.success(`[ORDER SVC] ${order.orderId} → ${newStatus}`);
      return formatOrder(order);
    } catch (err) {
      logger.error(`[ORDER SVC] updateStatus failed: ${err.message}`);
      throw err;
    }
  }

  async assignDriver(orderId, driverId) {
    try {
      logger.info(`[ORDER SVC] assignDriver order=${orderId} driver=${driverId}`);

      const driver = await Driver.findById(driverId);
      if (!driver) throw new Error('Driver not found');
      if (!driver.isApprovedByAdmin) throw new Error('Driver is not approved by admin');

      const existing = await Order.findById(orderId);
      if (!existing) throw new Error('Order not found');

      const updateData = { driverId };
      if (existing.status === 'pending') {
        updateData.status = 'confirmed';
        logger.info('[ORDER SVC] status pending → confirmed');
      }

      const order = await Order.updateById(orderId, updateData);
      logger.success(`[ORDER SVC] Driver ${driver.name} assigned to ${order.orderId}`);
      return formatOrder(order);
    } catch (err) {
      logger.error(`[ORDER SVC] assignDriver failed: ${err.message}`);
      throw err;
    }
  }

  async updatePricing(orderId, pricingData) {
    try {
      logger.info(`[ORDER SVC] updatePricing id=${orderId} data=${JSON.stringify(pricingData)}`);
      const order = await Order.updateById(orderId, {
        totalPrice: pricingData.totalPrice,
        quotedPrice: pricingData.quotedPrice,
      });
      return formatOrder(order);
    } catch (err) {
      logger.error(`[ORDER SVC] updatePricing failed: ${err.message}`);
      throw err;
    }
  }

  async cancelOrder(orderId, cancellationReason) {
    try {
      logger.info(`[ORDER SVC] cancel id=${orderId} reason=${cancellationReason}`);
      const order = await Order.findById(orderId);
      if (!order) throw new Error('Order not found');
      if (order.status === 'completed') throw new Error('Cannot cancel a completed order');
      if (order.status === 'cancelled') throw new Error('Order is already cancelled');

      const updated = await Order.updateById(orderId, {
        status: 'cancelled',
        cancellationReason,
        driverId: null,
      });

      logger.success(`[ORDER SVC] Cancelled ${updated.orderId}`);
      return formatOrder(updated);
    } catch (err) {
      logger.error(`[ORDER SVC] cancel failed: ${err.message}`);
      throw err;
    }
  }

  async updateOrder(orderId, updateData) {
    try {
      logger.info(`[ORDER SVC] update id=${orderId}`);
      const order = await Order.updateById(orderId, updateData);
      return formatOrder(order);
    } catch (err) {
      logger.error(`[ORDER SVC] update failed: ${err.message}`);
      throw err;
    }
  }

  async schedulePickup(orderId, pickupDateTime) {
    try {
      logger.info(`[ORDER SVC] schedulePickup id=${orderId} at=${pickupDateTime}`);
      const order = await Order.updateById(orderId, {
        pickupDateTime: new Date(pickupDateTime).toISOString(),
        status: 'pickupScheduled',
      });
      return formatOrder(order);
    } catch (err) {
      logger.error(`[ORDER SVC] schedulePickup failed: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new OrderService();
