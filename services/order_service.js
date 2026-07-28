const Order = require('../models/order_model');
const Booking = require('../models/booking_model');
const Driver = require('../models/driver_model');
const MapsService = require('./maps_service');
const RealtimeService = require('./realtime_service');
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

      // The driver must see a real, actionable address — never a bare
      // postcode. Prefer Google's canonical formatted address (captured at
      // booking time, see booking_service.js#createBooking); fall back to the
      // customer-typed address line + postcode if geocoding wasn't available.
      const pickupLocation =
        booking.collectionFormattedAddress || `${booking.collectionAddress}, ${booking.collectionPostcode}`;
      const deliveryLocation =
        booking.deliveryFormattedAddress || `${booking.deliveryAddress}, ${booking.deliveryPostcode}`;

      const orderData = {
        userId: booking.userId,
        bookingId: booking.id,
        serviceName: additionalData.serviceName || 'Moving Service',
        pickupLocation,
        deliveryLocation,
        pickupAddressLine: booking.collectionAddress,
        pickupPostcode: booking.collectionPostcode,
        deliveryAddressLine: booking.deliveryAddress,
        deliveryPostcode: booking.deliveryPostcode,
        // Reuse coordinates already geocoded on the booking (avoids a second Google call).
        pickupCoordinates: booking.collectionCoordinates,
        deliveryCoordinates: booking.deliveryCoordinates,
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

      // Best-effort geocoding when coordinates aren't already supplied.
      if (!orderData.pickupCoordinates && orderData.pickupLocation) {
        orderData.pickupCoordinates = await MapsService.geocode(orderData.pickupLocation);
      }
      if (!orderData.deliveryCoordinates && orderData.deliveryLocation) {
        orderData.deliveryCoordinates = await MapsService.geocode(orderData.deliveryLocation);
      }

      const order = await Order.create(orderData);
      logger.success(`[ORDER SVC] Created ${order.orderId}`);
      return formatOrder(order);
    } catch (err) {
      logger.error(`[ORDER SVC] create failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Live tracking payload for a single order (KB Section 9.5 inferred
   * `/api/orders/:id/tracking` endpoint): current status, a status timeline,
   * the assigned driver's last-known GPS position, and a live ETA computed
   * via Google Distance Matrix from the driver's position to whichever
   * destination is relevant to the current status.
   */
  async getOrderTracking(orderId) {
    try {
      logger.info(`[ORDER SVC] getTracking id=${orderId}`);
      const order = await Order.findById(orderId);
      if (!order) throw new Error('Order not found');

      let driverLocation = null;
      let eta = null;

      if (order.driverId) {
        const driver = await Driver.findById(order.driverId);
        if (driver?.currentLocation?.latitude != null) {
          driverLocation = driver.currentLocation;
          const headingToDropoff = ['pickupCompleted', 'outForDropOff'].includes(order.status);
          const destinationAddress = headingToDropoff ? order.deliveryLocation : order.pickupLocation;

          eta = await MapsService.getEtaFromCoordinates(
            driverLocation.latitude,
            driverLocation.longitude,
            destinationAddress
          );
        }
      }

      const timeline = [
        { status: 'pending', label: 'Booking Confirmed', at: order.createdAt, done: true },
        { status: 'confirmed', label: 'Driver Assigned', at: order.driverId ? order.updatedAt : null, done: Boolean(order.driverId) },
        {
          status: 'outForPickup',
          label: 'Out for Pickup',
          done: ['outForPickup', 'pickupCompleted', 'outForDropOff', 'completed'].includes(order.status),
        },
        { status: 'pickupCompleted', label: 'Pickup Completed', at: order.pickupCompletedAt, done: Boolean(order.pickupCompletedAt) },
        {
          status: 'outForDropOff',
          label: 'Out for Dropoff',
          done: ['outForDropOff', 'completed'].includes(order.status),
        },
        { status: 'completed', label: 'Order Completed', at: order.completedAt, done: order.status === 'completed' },
      ];

      logger.success(`[ORDER SVC] Tracking ready for ${order.orderId} status=${order.status}`);
      return {
        orderId: order.orderId,
        status: order.status,
        timeline,
        driver: order.driver,
        driverLocation,
        eta,
        pickupLocation: order.pickupLocation,
        deliveryLocation: order.deliveryLocation,
        pickupAddressLine: order.pickupAddressLine,
        pickupPostcode: order.pickupPostcode,
        deliveryAddressLine: order.deliveryAddressLine,
        deliveryPostcode: order.deliveryPostcode,
        pickupCoordinates: order.pickupCoordinates,
        deliveryCoordinates: order.deliveryCoordinates,
        realtimeChannel: `order-${order._id}`,
      };
    } catch (err) {
      logger.error(`[ORDER SVC] getTracking failed: ${err.message}`);
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
      await RealtimeService.broadcastOrderUpdate(order);
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
      await RealtimeService.broadcastOrderUpdate(order);
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
      await RealtimeService.broadcastOrderUpdate(updated);
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
      await RealtimeService.broadcastOrderUpdate(order);
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
      await RealtimeService.broadcastOrderUpdate(order);
      return formatOrder(order);
    } catch (err) {
      logger.error(`[ORDER SVC] schedulePickup failed: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new OrderService();
