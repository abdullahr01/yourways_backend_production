const Booking = require('../models/booking_model');
// The payment gate reads the model directly, not payment_service — that
// service already requires THIS one (to submit a booking once Stripe
// confirms the money), so importing it back would create a require cycle.
const Payment = require('../models/payment_model');
const PricingService = require('./pricing_service');
const MapsService = require('./maps_service');
// order_service.js only requires models (not this service), so requiring it
// here creates no circular-import cycle — needed so submitBooking can
// immediately convert the freshly-submitted booking into an order.
const OrderService = require('./order_service');
const logger = require('../utils/logger');

/**
 * Fields a customer may never set on PUT /api/bookings/:id. The price and the
 * payment/lifecycle state are decided by the pricing engine, Stripe, and this
 * service — accepting them from the request body would let a client author its
 * own price or pretend a booking was already paid.
 */
const PROTECTED_BOOKING_FIELDS = [
  'calculatedPrice',
  'calculated_price',
  'priceBreakdown',
  'price_breakdown',
  'status',
  'paymentStatus',
  'payment_status',
  'paidAt',
  'paid_at',
  'submittedAt',
  'submitted_at',
  'convertedOrderId',
  'converted_order_id',
  'userId',
  'user_id',
];

class BookingService {
  async createBooking(bookingData) {
    try {
      logger.info('[BOOKING SVC] Creating draft booking...');
      logger.info(
        `[BOOKING SVC] userId=${bookingData.userId} route=${bookingData.collectionPostcode}→${bookingData.deliveryPostcode}`
      );

      if (!bookingData.userId) throw new Error('userId is required');
      if (!bookingData.collectionPostcode || !bookingData.deliveryPostcode) {
        throw new Error('collectionPostcode and deliveryPostcode are required');
      }
      // A postcode alone is NOT a usable pickup/delivery location — it cannot
      // tell a driver which house/flat to go to. A full street address is
      // mandatory so `orders.pickupLocation`/`deliveryLocation` (what the
      // driver actually sees) is a real, actionable address.
      if (!bookingData.collectionAddress || !bookingData.deliveryAddress) {
        throw new Error('collectionAddress and deliveryAddress are required');
      }
      if (!bookingData.fullName || !bookingData.email || !bookingData.mobileNumber) {
        throw new Error('fullName, email and mobileNumber are required');
      }
      if (bookingData.acceptTerms !== true) {
        throw new Error('acceptTerms must be true');
      }

      // A customer may keep as many bookings as they like — a booking is just a
      // saved quote, and building up a list of them is the point. The
      // one-order-at-a-time rule bites later, at payment
      // (order_service.js#assertNoActiveOrder).

      // Prefer coordinates the client already has (Places Autocomplete pick,
      // a dropped map pin, or "use my current location") — these are far more
      // precise than a postcode centroid. Only geocode ourselves as a fallback
      // when the client didn't send coordinates — and when we do geocode,
      // search using the FULL address (not just the postcode) for a pin that
      // points at the actual building, not just the postcode's rough centroid.
      // Best-effort: never blocks booking creation if Google Maps is
      // unreachable/missing.
      const hasCoords = (c) => c && c.latitude != null && c.longitude != null;
      const fullCollectionAddress = `${bookingData.collectionAddress}, ${bookingData.collectionPostcode}`;
      const fullDeliveryAddress = `${bookingData.deliveryAddress}, ${bookingData.deliveryPostcode}`;

      const [collectionGeocode, deliveryGeocode] = await Promise.all([
        hasCoords(bookingData.collectionCoordinates) ? null : MapsService.geocode(fullCollectionAddress),
        hasCoords(bookingData.deliveryCoordinates) ? null : MapsService.geocode(fullDeliveryAddress),
      ]);

      const collectionCoordinates = hasCoords(bookingData.collectionCoordinates)
        ? bookingData.collectionCoordinates
        : collectionGeocode;
      const deliveryCoordinates = hasCoords(bookingData.deliveryCoordinates)
        ? bookingData.deliveryCoordinates
        : deliveryGeocode;

      logger.info(
        `[BOOKING SVC] Coordinates: collection=${hasCoords(bookingData.collectionCoordinates) ? 'client-supplied' : 'geocoded'} ` +
          `delivery=${hasCoords(bookingData.deliveryCoordinates) ? 'client-supplied' : 'geocoded'}`
      );

      const booking = await Booking.create({
        ...bookingData,
        collectionCoordinates,
        deliveryCoordinates,
        // Google's canonical formatted address (previously computed then
        // silently thrown away) — stored so the order created from this
        // booking can show the driver a clean, complete address instead of a
        // bare postcode.
        collectionFormattedAddress: collectionGeocode?.formattedAddress || null,
        deliveryFormattedAddress: deliveryGeocode?.formattedAddress || null,
        status: 'draft',
        items: bookingData.items || [],
      });

      logger.success(`[BOOKING SVC] Created id=${booking.id} items=${booking.totalItems}`);
      return booking;
    } catch (err) {
      logger.error(`[BOOKING SVC] create failed: ${err.message}`);
      throw err;
    }
  }

  async getBookingById(bookingId) {
    try {
      logger.info(`[BOOKING SVC] getById=${bookingId}`);
      const booking = await Booking.findById(bookingId);
      if (!booking) throw new Error('Booking not found');
      logger.success(`[BOOKING SVC] Found booking status=${booking.status}`);
      return booking;
    } catch (err) {
      logger.error(`[BOOKING SVC] getById failed: ${err.message}`);
      throw err;
    }
  }

  async getAllBookings(filter = {}, limit = 100) {
    try {
      logger.info(`[BOOKING SVC] getAll filter=${JSON.stringify(filter)}`);
      return await Booking.findMany(filter, limit);
    } catch (err) {
      logger.error(`[BOOKING SVC] getAll failed: ${err.message}`);
      throw err;
    }
  }

  async getBookingsByUserId(userId, status = null) {
    try {
      logger.info(`[BOOKING SVC] getByUser userId=${userId} status=${status || 'any'}`);
      const filter = { userId };
      if (status) filter.status = status;
      return await Booking.findMany(filter);
    } catch (err) {
      logger.error(`[BOOKING SVC] getByUser failed: ${err.message}`);
      throw err;
    }
  }

  async updateBooking(bookingId, updateData) {
    try {
      logger.info(`[BOOKING SVC] update id=${bookingId}`);
      const existing = await Booking.findById(bookingId);
      if (!existing) throw new Error('Booking not found');

      if (existing.status === 'submitted' || existing.status === 'converted_to_order') {
        throw new Error(`Cannot update ${existing.status} booking`);
      }

      // These are server-owned. They reach the DB mapper straight from
      // req.body, so without this a customer could PUT their own
      // `calculatedPrice` (pay £1 for a £300 move) or flip `status`/
      // `paymentStatus` to fake a paid booking.
      for (const field of PROTECTED_BOOKING_FIELDS) {
        if (updateData[field] !== undefined) {
          logger.warn(`[BOOKING SVC] Ignoring client-supplied '${field}' on booking update`);
          delete updateData[field];
        }
      }

      // If the client sent coordinates directly (map pin / autocomplete pick),
      // trust them as-is. Otherwise, re-geocode (best-effort) using the full
      // address only if the address line or postcode text actually changed.
      const hasCoords = (c) => c && c.latitude != null && c.longitude != null;

      if (!hasCoords(updateData.collectionCoordinates)) {
        const addressChanged =
          (updateData.collectionAddress && updateData.collectionAddress !== existing.collectionAddress) ||
          (updateData.collectionPostcode && updateData.collectionPostcode !== existing.collectionPostcode);
        if (addressChanged) {
          const address = updateData.collectionAddress ?? existing.collectionAddress;
          const postcode = updateData.collectionPostcode ?? existing.collectionPostcode;
          const geocode = await MapsService.geocode(`${address}, ${postcode}`);
          updateData.collectionCoordinates = geocode;
          updateData.collectionFormattedAddress = geocode?.formattedAddress || null;
        } else {
          delete updateData.collectionCoordinates;
        }
      }
      if (!hasCoords(updateData.deliveryCoordinates)) {
        const addressChanged =
          (updateData.deliveryAddress && updateData.deliveryAddress !== existing.deliveryAddress) ||
          (updateData.deliveryPostcode && updateData.deliveryPostcode !== existing.deliveryPostcode);
        if (addressChanged) {
          const address = updateData.deliveryAddress ?? existing.deliveryAddress;
          const postcode = updateData.deliveryPostcode ?? existing.deliveryPostcode;
          const geocode = await MapsService.geocode(`${address}, ${postcode}`);
          updateData.deliveryCoordinates = geocode;
          updateData.deliveryFormattedAddress = geocode?.formattedAddress || null;
        } else {
          delete updateData.deliveryCoordinates;
        }
      }

      const booking = await Booking.updateById(bookingId, updateData);
      logger.success(`[BOOKING SVC] Updated id=${booking.id}`);
      return booking;
    } catch (err) {
      logger.error(`[BOOKING SVC] update failed: ${err.message}`);
      throw err;
    }
  }

  async addItemToBooking(bookingId, item) {
    try {
      logger.info(`[BOOKING SVC] addItem booking=${bookingId} item=${item?.itemName}`);
      const booking = await Booking.findById(bookingId);
      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'draft') throw new Error('Cannot modify non-draft booking');

      const items = [...(booking.items || []), item];
      const updated = await Booking.updateById(bookingId, { items });
      logger.success(`[BOOKING SVC] Item added. totalItems=${updated.totalItems}`);
      return updated;
    } catch (err) {
      logger.error(`[BOOKING SVC] addItem failed: ${err.message}`);
      throw err;
    }
  }

  async removeItemFromBooking(bookingId, itemId) {
    try {
      logger.info(`[BOOKING SVC] removeItem booking=${bookingId} itemId=${itemId}`);
      const booking = await Booking.findById(bookingId);
      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'draft') throw new Error('Cannot modify non-draft booking');

      const items = (booking.items || []).filter((i) => i.itemId !== itemId);
      const updated = await Booking.updateById(bookingId, { items });
      logger.success(`[BOOKING SVC] Item removed. totalItems=${updated.totalItems}`);
      return updated;
    } catch (err) {
      logger.error(`[BOOKING SVC] removeItem failed: ${err.message}`);
      throw err;
    }
  }

  async updateItemQuantity(bookingId, itemId, quantity) {
    try {
      logger.info(`[BOOKING SVC] updateQty booking=${bookingId} itemId=${itemId} qty=${quantity}`);
      const booking = await Booking.findById(bookingId);
      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'draft') throw new Error('Cannot modify non-draft booking');

      const items = (booking.items || []).map((i) =>
        i.itemId === itemId ? { ...i, quantity } : i
      );
      const found = items.find((i) => i.itemId === itemId);
      if (!found) throw new Error('Item not found in booking');

      const updated = await Booking.updateById(bookingId, { items });
      logger.success(`[BOOKING SVC] Quantity updated. totalItems=${updated.totalItems}`);
      return updated;
    } catch (err) {
      logger.error(`[BOOKING SVC] updateQty failed: ${err.message}`);
      throw err;
    }
  }

  async calculatePrice(bookingId) {
    try {
      logger.info(`[BOOKING SVC] calculatePrice id=${bookingId}`);
      const booking = await Booking.findById(bookingId);
      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'draft') {
        throw new Error('Price can only be calculated for draft bookings');
      }

      const breakdown = await PricingService.calculateQuotation(booking);
      const updated = await Booking.updateById(bookingId, {
        calculatedPrice: breakdown.total,
        priceBreakdown: breakdown,
      });

      logger.success(`[BOOKING SVC] Price £${breakdown.total} saved for ${bookingId}`);
      return updated;
    } catch (err) {
      logger.error(`[BOOKING SVC] calculatePrice failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Submit a draft booking AND immediately convert it into an order in the
   * same call. Internally this is two sequential writes (bookings row →
   * submitted/converted_to_order, orders row → pending), reusing
   * `OrderService.createOrderFromBooking` so the order-creation logic (field
   * mapping, coordinate reuse, order code generation) isn't duplicated.
   *
   * PAYMENT GATE: the booking must already have a succeeded Stripe payment.
   * In practice that means this is driven by PaymentService once Stripe
   * confirms the money (webhook or verified /confirm), not called directly by
   * a client — a customer hitting POST /api/bookings/:id/submit before paying
   * gets 402 Payment Required. The check lives here rather than in the route
   * so no code path (route, retry endpoint, future admin tool) can skip it.
   */
  async submitBooking(bookingId) {
    try {
      logger.info(`[BOOKING SVC] submit id=${bookingId}`);
      const booking = await Booking.findById(bookingId);
      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'draft') throw new Error('Only draft bookings can be submitted');
      if (!booking.acceptTerms) throw new Error('Terms must be accepted before submission');
      if (!booking.items || booking.items.length === 0) {
        throw new Error('Cannot submit booking without items');
      }

      const payment = await Payment.findSucceededByBookingId(bookingId);
      if (!payment) {
        logger.warn(`[BOOKING SVC] Blocked — booking ${bookingId} has no successful payment`);
        const err = new Error(
          'This booking has not been paid yet. Create a payment with POST /api/payments/create-intent, ' +
            'complete it in the app, and the order is created automatically once Stripe confirms it.'
        );
        err.statusCode = 402;
        throw err;
      }
      logger.info(`[BOOKING SVC] Payment verified: ${payment.paymentIntentId} £${payment.amount}`);

      // No one-active-order check here on purpose: the payment gate above means
      // the money is already captured by the time we get this far, so refusing
      // would leave the customer charged with no job. That rule is enforced
      // before payment instead — see order_service.js#assertNoActiveOrder.

      // The amount Stripe actually captured is the locked price — so the
      // order total can never drift from what the customer was charged.
      const calculatedPrice = payment.amount;
      let priceBreakdown = booking.priceBreakdown;

      if (!priceBreakdown) {
        logger.info('[BOOKING SVC] No stored breakdown — recomputing for the record...');
        priceBreakdown = await PricingService.calculateQuotation(booking);
      }

      await Booking.updateById(bookingId, {
        calculatedPrice,
        priceBreakdown,
        status: 'submitted',
        submittedAt: new Date().toISOString(),
      });

      logger.success(`[BOOKING SVC] Submitted id=${bookingId} price=£${calculatedPrice}`);

      logger.info(`[BOOKING SVC] Auto-converting submitted booking ${bookingId} into an order...`);
      const order = await OrderService.createOrderFromBooking(bookingId);
      const finalBooking = await Booking.findById(bookingId);

      logger.success(
        `[BOOKING SVC] Booking ${bookingId} converted → order ${order.orderId} (price £${calculatedPrice})`
      );

      return { booking: finalBooking, order };
    } catch (err) {
      logger.error(`[BOOKING SVC] submit failed: ${err.message}`);
      throw err;
    }
  }

  async deleteBooking(bookingId) {
    try {
      logger.info(`[BOOKING SVC] delete id=${bookingId}`);
      const booking = await Booking.findById(bookingId);
      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'draft') throw new Error('Only draft bookings can be deleted');

      // payments.booking_id is ON DELETE CASCADE, so deleting a paid booking
      // would silently erase the record of a real charge.
      const paid = await Payment.findSucceededByBookingId(bookingId);
      if (paid) {
        throw new Error(
          `Cannot delete a paid booking (£${paid.amount} charged). Cancel the order and refund the payment instead.`
        );
      }

      await Booking.deleteById(bookingId);
      logger.success(`[BOOKING SVC] Deleted id=${bookingId}`);
      return { message: 'Booking deleted successfully' };
    } catch (err) {
      logger.error(`[BOOKING SVC] delete failed: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new BookingService();
