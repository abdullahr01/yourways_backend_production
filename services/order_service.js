const Order = require('../models/order_model');
const Booking = require('../models/booking_model');
const Driver = require('../models/driver_model');
// Model, not payment_service — payment_service already requires this file.
const Payment = require('../models/payment_model');
const MapsService = require('./maps_service');
const RealtimeService = require('./realtime_service');
const logger = require('../utils/logger');
const { formatOrder, formatOrders, formatDriver } = require('../utils/orderFormatter');
const { formatDriverLocation } = require('../utils/locationFormatter');
const { isUniqueViolation } = require('../utils/supabaseHelper');

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

      const already = await this._existingOrderForBooking(booking);
      if (already) {
        logger.info(`[ORDER SVC] Booking ${bookingId} already has order ${already.orderId}`);
        await this._markBookingConverted(bookingId, already._id, booking);
        return formatOrder(already);
      }

      if (booking.status !== 'submitted') {
        throw new Error('Only submitted bookings can be converted to orders');
      }

      // Same payment gate as submitBooking — this endpoint is a retry path for
      // a booking whose payment already succeeded, so an unpaid booking
      // reaching here means someone is trying to skip checkout.
      const payment = await Payment.findSucceededByBookingId(bookingId);
      if (!payment) {
        logger.warn(`[ORDER SVC] Blocked — booking ${bookingId} has no successful payment`);
        const err = new Error(
          'This booking has not been paid yet. Pay via POST /api/payments/create-intent first.'
        );
        err.statusCode = 402;
        throw err;
      }

      // Deliberately NOT gated by the one-active-order rule. Reaching this line
      // means the money is already captured, so refusing would leave the
      // customer paid-up with no job. The rule is applied before payment, in
      // createPaymentIntentForBooking. In the rare race where two bookings get
      // paid moments apart, both orders are honoured and the admin sees two
      // active jobs rather than the customer losing one.

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
        // The captured amount wins over the quote: the order total must equal
        // what the customer's card was actually charged.
        totalPrice: additionalData.totalPrice ?? payment.amount ?? booking.calculatedPrice ?? 0,
        quotedPrice: additionalData.quotedPrice ?? booking.calculatedPrice,
        paymentStatus: 'succeeded',
        paidAmount: payment.amount,
        paymentId: payment.id,
        status: 'pending',
        meta: booking.meta,
      };

      let order;
      try {
        order = await Order.create(orderData);
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        logger.warn(
          `[ORDER SVC] Race on booking ${bookingId} — another process already created the order`
        );
        order = await Order.findByBookingId(bookingId);
        if (!order) throw err;
        await this._markBookingConverted(bookingId, order._id, booking);
        return formatOrder(order);
      }

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

  async _markBookingConverted(bookingId, orderId, booking = null) {
    if (booking?.convertedOrderId && booking.status === 'converted_to_order') return;
    await Booking.updateById(bookingId, {
      status: 'converted_to_order',
      convertedOrderId: orderId,
    });
  }

  async _existingOrderForBooking(booking) {
    if (!booking) return null;
    if (booking.convertedOrderId) {
      const byPointer = await Order.findById(booking.convertedOrderId);
      if (byPointer) return byPointer;
    }
    return Order.findByBookingId(booking.id);
  }

  async createOrder(orderData) {
    try {
      logger.info('[ORDER SVC] Direct create order...');

      // Admin-only endpoint (phone bookings, ops fixes). It still respects the
      // one-active-order rule so a manually entered job can't quietly put a
      // customer on two moves at once — but an admin who genuinely needs to can
      // say so explicitly.
      if (orderData.allowConcurrentOrder === true) {
        logger.warn(
          `[ORDER SVC] one-active-order rule overridden by admin for user ${orderData.userId}`
        );
      } else {
        await this.assertNoActiveOrder(orderData.userId);
      }
      delete orderData.allowConcurrentOrder;

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

      const afterScheduled = ['pickupScheduled', 'outForPickup', 'pickupCompleted', 'outForDropOff', 'completed'];
      const timeline = [
        { status: 'pending', label: 'Booking Confirmed', at: order.createdAt, done: true },
        { status: 'confirmed', label: 'Driver Assigned', at: order.driverId ? order.updatedAt : null, done: Boolean(order.driverId) },
        {
          status: 'pickupScheduled',
          label: 'Pickup Scheduled',
          at: order.pickupDateTime,
          done: afterScheduled.includes(order.status),
        },
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
        driver: formatDriver(order.driver),
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
        // Proof-of-delivery — captured by the driver app at pickup/delivery via
        // POST /api/uploads/order-proof/:orderId. Stored as private storage
        // keys; middleware/signStorageUrls.js turns them into short-lived
        // signed URLs on the way out.
        pickupPhotos: order.pickupPhotos || [],
        deliveryPhotos: order.deliveryPhotos || [],
        pickupSignature: order.pickupSignature || null,
        deliverySignature: order.deliverySignature || null,
        deliveryWaiverAccepted: !!order.deliveryWaiverAccepted,
        driverComment: order.driverComment || null,
        realtimeChannel: `order-${order._id}`,
      };
    } catch (err) {
      logger.error(`[ORDER SVC] getTracking failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Just the assigned driver's position for one order — the endpoint the
   * customer tracking map should poll between Realtime pushes.
   *
   * Split out of getOrderTracking() because that one bills a Google Distance
   * Matrix request for the ETA on every single call, which is fine to load a
   * screen once but not to refresh a marker every few seconds. This reads one
   * row and nothing else.
   */
  async getDriverLocationForOrder(orderId) {
    try {
      logger.info(`[ORDER SVC] getDriverLocation order=${orderId}`);
      const order = await Order.findById(orderId);
      if (!order) throw new Error('Order not found');

      // No driver yet is a normal state for a pending order, not an error —
      // the map just shows no marker.
      if (!order.driverId) {
        return {
          orderId: order.orderId,
          status: order.status,
          driverAssigned: false,
          location: null,
          realtimeChannel: `order-${order._id}`,
        };
      }

      const driver = await Driver.findById(order.driverId);

      // driverId and the driver-<id> Realtime channel are stripped: both would
      // let the customer app keep watching that driver after this order ends.
      // The customer refreshes the marker by re-calling this endpoint; the
      // order-<uuid> channel still tells them when the status changes.
      const { driverId, realtimeChannel, ...location } = formatDriverLocation(driver);

      return {
        orderId: order.orderId,
        status: order.status,
        driverAssigned: true,
        location,
        realtimeChannel: `order-${order._id}`,
      };
    } catch (err) {
      logger.error(`[ORDER SVC] getDriverLocation failed: ${err.message}`);
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

  /**
   * Single-order existence check backing the one-active-order rule. Returns the
   * raw (not formatted-for-driver) order so callers can read orderId/status
   * directly.
   */
  async getActiveOrderForUser(userId) {
    if (!userId) return null;
    const orders = await Order.findMany({ userId, statusIn: ACTIVE_STATUSES }, 1);
    return orders[0] || null;
  }

  /**
   * Business rule: a customer may have as many bookings as they like, but only
   * ONE order in progress. A booking is just a saved quote; an order is a job
   * the operation has to physically staff, and the customer can only be moved
   * one job at a time.
   *
   * Where this is enforced matters. It runs *before the customer pays*
   * (payment_service.js#createPaymentIntentForBooking), never on the conversion
   * that happens afterwards — `createOrderFromBooking` and
   * `submitBooking` both require a succeeded payment to run at all, so
   * refusing them would mean taking someone's money and then denying them the
   * job. Once the money is in, the order gets created.
   *
   * `excludeBookingId` is the booking being paid for, so it doesn't count
   * itself as the blocker.
   */
  async assertNoActiveOrder(userId, { excludeBookingId = null } = {}) {
    if (!userId) return;

    const activeOrder = await this.getActiveOrderForUser(userId);
    if (activeOrder) {
      logger.warn(
        `[ORDER SVC] Blocked — user ${userId} already has active order ${activeOrder.orderId} (${activeOrder.status})`
      );
      const err = new Error(
        `You already have an order in progress (${activeOrder.orderId}, status: ${activeOrder.status}). ` +
          `You can keep adding bookings, but they can only be paid for once this order is completed or cancelled.`
      );
      err.statusCode = 409;
      throw err;
    }

    // A booking sitting at 'submitted' has been paid but its order row hasn't
    // been written yet (the conversion half failed and is awaiting retry).
    // There is no order to find, yet the customer is already committed to a
    // job, so it has to count.
    const submitted = await Booking.findMany({ userId, statusIn: ['submitted'] }, 5);
    const other = submitted.find((b) => b.id !== excludeBookingId);
    if (other) {
      logger.warn(
        `[ORDER SVC] Blocked — user ${userId} has paid booking ${other.id} still awaiting its order`
      );
      const err = new Error(
        'You have already paid for another booking that is still being turned into an order. ' +
          'Please wait a moment and try again.'
      );
      err.statusCode = 409;
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
      if (driver.status === 'blocked' || driver.status === 'deactivated') {
        throw new Error(`Cannot assign a ${driver.status} driver — activate them first`);
      }

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
module.exports.ACTIVE_STATUSES = ACTIVE_STATUSES;
