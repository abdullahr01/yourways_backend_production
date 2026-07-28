const Booking = require('../models/booking_model');
const PricingService = require('./pricing_service');
const MapsService = require('./maps_service');
const logger = require('../utils/logger');

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
      if (!bookingData.fullName || !bookingData.email || !bookingData.mobileNumber) {
        throw new Error('fullName, email and mobileNumber are required');
      }
      if (bookingData.acceptTerms !== true) {
        throw new Error('acceptTerms must be true');
      }

      // Prefer coordinates the client already has (Places Autocomplete pick,
      // a dropped map pin, or "use my current location") — these are far more
      // precise than a postcode centroid. Only geocode the postcode ourselves
      // as a fallback when the client didn't send coordinates. Best-effort:
      // never blocks booking creation if Google Maps is unreachable/missing.
      const hasCoords = (c) => c && c.latitude != null && c.longitude != null;

      const [collectionCoordinates, deliveryCoordinates] = await Promise.all([
        hasCoords(bookingData.collectionCoordinates)
          ? bookingData.collectionCoordinates
          : MapsService.geocode(bookingData.collectionPostcode),
        hasCoords(bookingData.deliveryCoordinates)
          ? bookingData.deliveryCoordinates
          : MapsService.geocode(bookingData.deliveryPostcode),
      ]);

      logger.info(
        `[BOOKING SVC] Coordinates: collection=${hasCoords(bookingData.collectionCoordinates) ? 'client-supplied' : 'geocoded'} ` +
          `delivery=${hasCoords(bookingData.deliveryCoordinates) ? 'client-supplied' : 'geocoded'}`
      );

      const booking = await Booking.create({
        ...bookingData,
        collectionCoordinates,
        deliveryCoordinates,
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

      // If the client sent coordinates directly (map pin / autocomplete pick),
      // trust them as-is. Otherwise, re-geocode (best-effort) only if the
      // postcode text itself changed.
      const hasCoords = (c) => c && c.latitude != null && c.longitude != null;

      if (!hasCoords(updateData.collectionCoordinates)) {
        if (
          updateData.collectionPostcode &&
          updateData.collectionPostcode !== existing.collectionPostcode
        ) {
          updateData.collectionCoordinates = await MapsService.geocode(updateData.collectionPostcode);
        } else {
          delete updateData.collectionCoordinates;
        }
      }
      if (!hasCoords(updateData.deliveryCoordinates)) {
        if (
          updateData.deliveryPostcode &&
          updateData.deliveryPostcode !== existing.deliveryPostcode
        ) {
          updateData.deliveryCoordinates = await MapsService.geocode(updateData.deliveryPostcode);
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

      let calculatedPrice = booking.calculatedPrice;
      let priceBreakdown = booking.priceBreakdown;

      if (!calculatedPrice) {
        logger.info('[BOOKING SVC] No price yet — calculating before submit...');
        priceBreakdown = await PricingService.calculateQuotation(booking);
        calculatedPrice = priceBreakdown.total;
      }

      const updated = await Booking.updateById(bookingId, {
        calculatedPrice,
        priceBreakdown,
        status: 'submitted',
        submittedAt: new Date().toISOString(),
      });

      logger.success(`[BOOKING SVC] Submitted id=${bookingId} price=£${calculatedPrice}`);
      return updated;
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
