const BookingService = require('../services/booking_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class BookingController {
  /**
   * Create new booking
   * POST /api/bookings/create
   */
  async create(req, res) {
    try {
      logger.info('📝 Booking creation request received');
      
      // Attach metadata
      req.body.meta = {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      };
      
      const booking = await BookingService.createBooking(req.body);
      
      logger.success(`✅ Booking created: ${booking.id}`);
      logger.info(`[BOOKING CTRL] status=${booking.status} items=${booking.totalItems}`);
      return successResponse(res, 201, 'Booking created successfully', booking);
    } catch (err) {
      logger.error(`❌ Booking creation failed: ${err.message}`);
      return errorResponse(res, 400, 'Booking creation failed', err.message);
    }
  }

  /**
   * Get booking by ID
   * GET /api/bookings/:id
   */
  async getById(req, res) {
    try {
      logger.info(`🔍 Fetching booking: ${req.params.id}`);
      
      const booking = await BookingService.getBookingById(req.params.id);
      
      logger.success(`✅ Booking retrieved: ${req.params.id}`);
      return successResponse(res, 200, 'Booking fetched successfully', booking);
    } catch (err) {
      logger.error(`❌ Get booking failed: ${err.message}`);
      return errorResponse(res, 404, 'Booking not found', err.message);
    }
  }

  /**
   * Get all bookings
   * GET /api/bookings/all?status=draft
   */
  async getAll(req, res) {
    try {
      logger.info('📋 Fetching all bookings');
      
      const filter = {};
      if (req.query.status) {
        filter.status = req.query.status;
      }
      if (req.query.userId) {
        filter.userId = req.query.userId;
      }
      
      const limit = parseInt(req.query.limit) || 100;
      
      const bookings = await BookingService.getAllBookings(filter, limit);
      
      logger.success(`✅ Retrieved ${bookings.length} bookings`);
      return successResponse(res, 200, 'Bookings fetched successfully', bookings);
    } catch (err) {
      logger.error(`❌ Get all bookings failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch bookings', err.message);
    }
  }

  /**
   * Get bookings by user
   * GET /api/bookings/user/:userId?status=draft
   */
  async getByUser(req, res) {
    try {
      logger.info(`👤 Fetching bookings for user: ${req.params.userId}`);
      
      const status = req.query.status || null;
      const bookings = await BookingService.getBookingsByUserId(req.params.userId, status);
      
      logger.success(`✅ Retrieved ${bookings.length} bookings for user`);
      return successResponse(res, 200, 'User bookings fetched successfully', bookings);
    } catch (err) {
      logger.error(`❌ Get user bookings failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch user bookings', err.message);
    }
  }

  /**
   * Update booking
   * PUT /api/bookings/:id
   */
  async update(req, res) {
    try {
      logger.info(`✏️ Updating booking: ${req.params.id}`);
      
      const booking = await BookingService.updateBooking(req.params.id, req.body);
      
      logger.success(`✅ Booking updated: ${req.params.id}`);
      return successResponse(res, 200, 'Booking updated successfully', booking);
    } catch (err) {
      logger.error(`❌ Booking update failed: ${err.message}`);
      return errorResponse(res, 400, 'Booking update failed', err.message);
    }
  }

  /**
   * Add item to booking
   * POST /api/bookings/:id/items
   */
  async addItem(req, res) {
    try {
      logger.info(`➕ Adding item to booking: ${req.params.id}`);
      
      const booking = await BookingService.addItemToBooking(req.params.id, req.body);
      
      logger.success(`✅ Item added to booking: ${req.params.id}`);
      return successResponse(res, 200, 'Item added successfully', booking);
    } catch (err) {
      logger.error(`❌ Add item failed: ${err.message}`);
      return errorResponse(res, 400, 'Failed to add item', err.message);
    }
  }

  /**
   * Remove item from booking
   * DELETE /api/bookings/:id/items/:itemId
   */
  async removeItem(req, res) {
    try {
      logger.info(`➖ Removing item from booking: ${req.params.id}`);
      
      const booking = await BookingService.removeItemFromBooking(
        req.params.id,
        req.params.itemId
      );
      
      logger.success(`✅ Item removed from booking: ${req.params.id}`);
      return successResponse(res, 200, 'Item removed successfully', booking);
    } catch (err) {
      logger.error(`❌ Remove item failed: ${err.message}`);
      return errorResponse(res, 400, 'Failed to remove item', err.message);
    }
  }

  /**
   * Update item quantity
   * PATCH /api/bookings/:id/items/:itemId/quantity
   */
  async updateItemQuantity(req, res) {
    try {
      logger.info(`🔢 Updating item quantity in booking: ${req.params.id}`);
      
      const { quantity } = req.body;
      if (!quantity || quantity < 1) {
        throw new Error('Invalid quantity');
      }
      
      const booking = await BookingService.updateItemQuantity(
        req.params.id,
        req.params.itemId,
        quantity
      );
      
      logger.success(`✅ Item quantity updated in booking: ${req.params.id}`);
      return successResponse(res, 200, 'Item quantity updated successfully', booking);
    } catch (err) {
      logger.error(`❌ Update quantity failed: ${err.message}`);
      return errorResponse(res, 400, 'Failed to update quantity', err.message);
    }
  }

  /**
   * Submit booking — locks the price AND immediately converts it into an
   * order in the same request. Response contains both the finalized booking
   * (status: converted_to_order) and the newly created order (status:
   * pending) so the frontend can go straight to the order/tracking screen
   * using `data.order.orderId` — no separate "create order" call needed.
   *
   * Requires a succeeded Stripe payment on the booking, so in the normal flow
   * PaymentService triggers this automatically once Stripe confirms the money.
   * Calling it on an unpaid booking returns 402 Payment Required.
   * POST /api/bookings/:id/submit
   */
  async submit(req, res) {
    try {
      logger.info(`📤 Submitting booking: ${req.params.id}`);

      const { booking, order } = await BookingService.submitBooking(req.params.id);

      logger.success(`✅ Booking submitted & order created: ${req.params.id} → ${order.orderId}`);
      return successResponse(res, 201, 'Booking submitted and order created successfully', {
        booking,
        order,
      });
    } catch (err) {
      logger.error(`❌ Booking submission failed: ${err.message}`);
      // 402 when the booking hasn't been paid yet (see BookingService.submitBooking).
      return errorResponse(res, err.statusCode || 400, 'Booking submission failed', err.message);
    }
  }

  /**
   * Calculate quotation price
   * POST /api/bookings/:id/calculate-price
   */
  async calculatePrice(req, res) {
    try {
      logger.info(`[BOOKING CTRL] Calculate price request: ${req.params.id}`);

      const booking = await BookingService.calculatePrice(req.params.id);

      logger.success(`[BOOKING CTRL] Price calculated: £${booking.calculatedPrice}`);
      return successResponse(res, 200, 'Price calculated successfully', {
        calculatedPrice: booking.calculatedPrice,
        standardPrice: booking.priceBreakdown?.standardTotal,
        discountAmount: booking.priceBreakdown?.discountAmount,
        discountPercentage: booking.priceBreakdown?.discountPercentage,
        priceBreakdown: booking.priceBreakdown,
        estimatedDeliveryHours: booking.priceBreakdown?.estimatedDeliveryHours,
        booking,
      });
    } catch (err) {
      logger.error(`[BOOKING CTRL] Calculate price failed: ${err.message}`);
      return errorResponse(res, 400, 'Price calculation failed', err.message);
    }
  }

  /**
   * Delete booking
   * DELETE /api/bookings/:id
   */
  async delete(req, res) {
    try {
      logger.info(`🗑️ Deleting booking: ${req.params.id}`);
      
      const result = await BookingService.deleteBooking(req.params.id);
      
      logger.success(`✅ Booking deleted: ${req.params.id}`);
      return successResponse(res, 200, 'Booking deleted successfully', result);
    } catch (err) {
      logger.error(`❌ Booking deletion failed: ${err.message}`);
      return errorResponse(res, 400, 'Booking deletion failed', err.message);
    }
  }
}

module.exports = new BookingController();