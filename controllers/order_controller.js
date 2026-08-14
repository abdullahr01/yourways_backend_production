const OrderService = require('../services/order_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class OrderController {
  /**
   * Create order from booking — RETRY/FALLBACK ONLY. The normal flow is
   * `POST /api/bookings/:id/submit`, which now creates the order itself.
   * Use this only to recover a booking stuck at status 'submitted' whose
   * order-creation step failed the first time.
   * POST /api/orders/create-from-booking
   */
  async createFromBooking(req, res) {
    try {
      logger.info('🚚 Order creation from booking request received (retry/fallback path)');
      
      // Price overrides are deliberately NOT accepted here: the order total is
      // the amount Stripe captured on the booking, so a client-supplied
      // totalPrice would put the books out of sync with the actual charge.
      const { bookingId, serviceName } = req.body;
      
      if (!bookingId) {
        throw new Error('Booking ID is required');
      }
      
      const order = await OrderService.createOrderFromBooking(bookingId, { serviceName });
      
      logger.success(`✅ Order created from booking: ${order.orderId}`);
      return successResponse(res, 201, 'Order created successfully', order);
    } catch (err) {
      logger.error(`❌ Order creation failed: ${err.message}`);
      // 402 when the booking hasn't been paid (see OrderService.createOrderFromBooking).
      return errorResponse(res, err.statusCode || 400, 'Order creation failed', err.message);
    }
  }

  /**
   * Create order directly (without booking) — ADMIN ONLY.
   *
   * Was open to customers, which became a way to get an order without ever
   * paying once bookings required payment. It survives as an ops tool for
   * manually entered jobs (e.g. a booking taken over the phone), where payment
   * is collected outside the app; such orders keep paymentStatus 'unpaid'.
   * POST /api/orders/create
   */
  async create(req, res) {
    try {
      logger.info('🚚 Direct order creation request received');
      
      // Attach metadata
      req.body.meta = {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      };
      
      const order = await OrderService.createOrder(req.body);
      
      logger.success(`✅ Order created: ${order.orderId}`);
      return successResponse(res, 201, 'Order created successfully', order);
    } catch (err) {
      logger.error(`❌ Order creation failed: ${err.message}`);
      return errorResponse(res, 400, 'Order creation failed', err.message);
    }
  }

  /**
   * Get order by ID
   * GET /api/orders/:id
   */
  async getById(req, res) {
    try {
      logger.info(`🔍 Fetching order: ${req.params.id}`);
      
      const order = await OrderService.getOrderById(req.params.id);
      
      logger.success(`✅ Order retrieved: ${order.orderId}`);
      return successResponse(res, 200, 'Order fetched successfully', order);
    } catch (err) {
      logger.error(`❌ Get order failed: ${err.message}`);
      return errorResponse(res, 404, 'Order not found', err.message);
    }
  }

  /**
   * Get order by orderId (ORD-XXX format)
   * GET /api/orders/code/:orderId
   */
  async getByOrderId(req, res) {
    try {
      logger.info(`🔍 Fetching order by code: ${req.params.orderId}`);
      
      const order = await OrderService.getOrderByOrderId(req.params.orderId);
      
      logger.success(`✅ Order retrieved: ${order.orderId}`);
      return successResponse(res, 200, 'Order fetched successfully', order);
    } catch (err) {
      logger.error(`❌ Get order failed: ${err.message}`);
      return errorResponse(res, 404, 'Order not found', err.message);
    }
  }

  /**
   * Get all orders
   * GET /api/orders/all?status=pending
   */
  async getAll(req, res) {
    try {
      logger.info('📋 Fetching all orders');
      
      const filter = {};
      if (req.query.status) {
        filter.status = req.query.status;
      }
      if (req.query.userId) {
        filter.userId = req.query.userId;
      }
      
      const limit = parseInt(req.query.limit) || 100;
      
      const orders = await OrderService.getAllOrders(filter, limit);
      
      logger.success(`✅ Retrieved ${orders.length} orders`);
      return successResponse(res, 200, 'Orders fetched successfully', orders);
    } catch (err) {
      logger.error(`❌ Get all orders failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch orders', err.message);
    }
  }

  /**
   * Get orders by user
   * GET /api/orders/user/:userId?status=pending
   */
  async getByUser(req, res) {
    try {
      logger.info(`👤 Fetching orders for user: ${req.params.userId}`);
      
      const status = req.query.status || null;
      const orders = await OrderService.getOrdersByUserId(req.params.userId, status);
      
      logger.success(`✅ Retrieved ${orders.length} orders for user`);
      return successResponse(res, 200, 'User orders fetched successfully', orders);
    } catch (err) {
      logger.error(`❌ Get user orders failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch user orders', err.message);
    }
  }

  /**
   * Get active orders
   * GET /api/orders/active?userId=xxx
   */
  async getActive(req, res) {
    try {
      logger.info('⚡ Fetching active orders');
      
      const userId = req.query.userId || null;
      const orders = await OrderService.getActiveOrders(userId);
      
      logger.success(`✅ Retrieved ${orders.length} active orders`);
      return successResponse(res, 200, 'Active orders fetched successfully', orders);
    } catch (err) {
      logger.error(`❌ Get active orders failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch active orders', err.message);
    }
  }

  /**
   * Live tracking (status timeline + driver position + ETA)
   * GET /api/orders/:id/tracking
   */
  async getTracking(req, res) {
    try {
      logger.info(`📍 Fetching tracking info: ${req.params.id}`);

      const tracking = await OrderService.getOrderTracking(req.params.id);

      logger.success(`✅ Tracking retrieved: ${tracking.orderId}`);
      return successResponse(res, 200, 'Tracking info fetched successfully', tracking);
    } catch (err) {
      logger.error(`❌ Get tracking failed: ${err.message}`);
      return errorResponse(res, 404, 'Tracking info not found', err.message);
    }
  }

  /**
   * Update order status
   * PATCH /api/orders/:id/status
   */
  async updateStatus(req, res) {
    try {
      logger.info(`🔄 Updating order status: ${req.params.id}`);
      
      const { status } = req.body;
      if (!status) {
        throw new Error('Status is required');
      }
      
      const order = await OrderService.updateOrderStatus(req.params.id, status);
      
      logger.success(`✅ Order status updated: ${order.orderId} -> ${status}`);
      return successResponse(res, 200, 'Order status updated successfully', order);
    } catch (err) {
      logger.error(`❌ Update status failed: ${err.message}`);
      return errorResponse(res, 400, 'Status update failed', err.message);
    }
  }

  /**
   * Assign driver to order
   * POST /api/orders/:id/assign-driver
   */
  async assignDriver(req, res) {
  try {
    logger.info(`👨‍✈️ Assigning driver to order: ${req.params.id}`);

    const { driverId } = req.body;
    if (!driverId) {
      throw new Error('Driver ID is required');
    }

    const order = await OrderService.assignDriver(req.params.id, driverId);

    logger.success(`✅ Driver assigned to order: ${order.orderId}`);
    return successResponse(res, 200, 'Driver assigned successfully', order);
  } catch (err) {
    logger.error(`❌ Assign driver failed: ${err.message}`);
    return errorResponse(res, 400, 'Driver assignment failed', err.message);
  }
}


  /**
   * Update order pricing
   * PATCH /api/orders/:id/pricing
   */
  async updatePricing(req, res) {
    try {
      logger.info(`💰 Updating order pricing: ${req.params.id}`);
      
      const { totalPrice, quotedPrice } = req.body;
      
      const order = await OrderService.updatePricing(req.params.id, {
        totalPrice,
        quotedPrice
      });
      
      logger.success(`✅ Pricing updated for order: ${order.orderId}`);
      return successResponse(res, 200, 'Pricing updated successfully', order);
    } catch (err) {
      logger.error(`❌ Update pricing failed: ${err.message}`);
      return errorResponse(res, 400, 'Pricing update failed', err.message);
    }
  }

  /**
   * Cancel order
   * POST /api/orders/:id/cancel
   */
  async cancel(req, res) {
    try {
      logger.info(`❌ Cancelling order: ${req.params.id}`);
      
      const { cancellationReason } = req.body;
      if (!cancellationReason) {
        throw new Error('Cancellation reason is required');
      }
      
      const order = await OrderService.cancelOrder(req.params.id, cancellationReason);
      
      logger.success(`✅ Order cancelled: ${order.orderId}`);
      return successResponse(res, 200, 'Order cancelled successfully', order);
    } catch (err) {
      logger.error(`❌ Order cancellation failed: ${err.message}`);
      return errorResponse(res, 400, 'Order cancellation failed', err.message);
    }
  }

  /**
   * Schedule pickup
   * POST /api/orders/:id/schedule-pickup
   */
  async schedulePickup(req, res) {
    try {
      logger.info(`📅 Scheduling pickup for order: ${req.params.id}`);
      
      const { pickupDateTime } = req.body;
      if (!pickupDateTime) {
        throw new Error('Pickup date time is required');
      }
      
      const order = await OrderService.schedulePickup(req.params.id, pickupDateTime);
      
      logger.success(`✅ Pickup scheduled for order: ${order.orderId}`);
      return successResponse(res, 200, 'Pickup scheduled successfully', order);
    } catch (err) {
      logger.error(`❌ Schedule pickup failed: ${err.message}`);
      return errorResponse(res, 400, 'Pickup scheduling failed', err.message);
    }
  }

  /**
   * Update order details
   * PUT /api/orders/:id
   */
  async update(req, res) {
    try {
      logger.info(`✏️ Updating order: ${req.params.id}`);
      
      const order = await OrderService.updateOrder(req.params.id, req.body);
      
      logger.success(`✅ Order updated: ${order.orderId}`);
      return successResponse(res, 200, 'Order updated successfully', order);
    } catch (err) {
      logger.error(`❌ Order update failed: ${err.message}`);
      return errorResponse(res, 400, 'Order update failed', err.message);
    }
  }
}

module.exports = new OrderController();