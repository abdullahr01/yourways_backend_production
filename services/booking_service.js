const Booking = require('../models/booking_model');
const logger = require('../utils/logger');

class BookingService {
  /**
   * Create a new booking (draft)
   */
  async createBooking(bookingData) {
    try {
      logger.info('Creating new booking...');
      
      const booking = new Booking(bookingData);
      await booking.save();
      
      logger.success(`Booking created successfully with ID: ${booking._id}`);
      logger.info(`Total items in booking: ${booking.totalItems}`);
      
      return booking;
    } catch (err) {
      logger.error(`Error creating booking: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get booking by ID
   */
  async getBookingById(bookingId) {
    try {
      logger.info(`Fetching booking with ID: ${bookingId}`);
      
      const booking = await Booking.findById(bookingId)
        .populate('userId', 'name email phone')
        .populate('convertedOrderId');
      
      if (!booking) {
        logger.warn(`Booking not found with ID: ${bookingId}`);
        throw new Error('Booking not found');
      }
      
      logger.success(`Booking fetched successfully: ${bookingId}`);
      return booking;
    } catch (err) {
      logger.error(`Error fetching booking: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get all bookings with optional filters
   */
  async getAllBookings(filter = {}, limit = 100) {
    try {
      logger.info('Fetching all bookings...');
      logger.info(`Applied filters: ${JSON.stringify(filter)}`);
      
      const bookings = await Booking.find(filter)
        .populate('userId', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(limit);
      
      logger.success(`Fetched ${bookings.length} bookings`);
      return bookings;
    } catch (err) {
      logger.error(`Error fetching bookings: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get bookings by user ID
   */
  async getBookingsByUserId(userId, status = null) {
    try {
      logger.info(`Fetching bookings for user: ${userId}`);
      
      const filter = { userId };
      if (status) {
        filter.status = status;
        logger.info(`Filtering by status: ${status}`);
      }
      
      const bookings = await Booking.find(filter)
        .sort({ createdAt: -1 });
      
      logger.success(`Fetched ${bookings.length} bookings for user ${userId}`);
      return bookings;
    } catch (err) {
      logger.error(`Error fetching user bookings: ${err.message}`);
      throw err;
    }
  }

  /**
   * Update booking
   */
  async updateBooking(bookingId, updateData) {
    try {
      logger.info(`Updating booking: ${bookingId}`);
      logger.info(`Update data: ${JSON.stringify(updateData)}`);
      
      // Prevent updating if already submitted
      const existingBooking = await Booking.findById(bookingId);
      if (!existingBooking) {
        logger.warn(`Booking not found: ${bookingId}`);
        throw new Error('Booking not found');
      }
      
      if (existingBooking.status === 'submitted' || existingBooking.status === 'converted_to_order') {
        logger.warn(`Cannot update booking ${bookingId} - already ${existingBooking.status}`);
        throw new Error(`Cannot update ${existingBooking.status} booking`);
      }
      
      const booking = await Booking.findByIdAndUpdate(
        bookingId,
        updateData,
        { new: true, runValidators: true }
      );
      
      logger.success(`Booking updated successfully: ${bookingId}`);
      return booking;
    } catch (err) {
      logger.error(`Error updating booking: ${err.message}`);
      throw err;
    }
  }

  /**
   * Add item to booking
   */
  async addItemToBooking(bookingId, item) {
    try {
      logger.info(`Adding item to booking: ${bookingId}`);
      logger.info(`Item: ${item.itemName} x${item.quantity}`);
      
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      if (booking.status !== 'draft') {
        throw new Error('Cannot modify non-draft booking');
      }
      
      booking.items.push(item);
      await booking.save();
      
      logger.success(`Item added. Total items now: ${booking.totalItems}`);
      return booking;
    } catch (err) {
      logger.error(`Error adding item to booking: ${err.message}`);
      throw err;
    }
  }

  /**
   * Remove item from booking
   */
  async removeItemFromBooking(bookingId, itemId) {
    try {
      logger.info(`Removing item ${itemId} from booking: ${bookingId}`);
      
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      if (booking.status !== 'draft') {
        throw new Error('Cannot modify non-draft booking');
      }
      
      booking.items = booking.items.filter(item => item.itemId !== itemId);
      await booking.save();
      
      logger.success(`Item removed. Total items now: ${booking.totalItems}`);
      return booking;
    } catch (err) {
      logger.error(`Error removing item from booking: ${err.message}`);
      throw err;
    }
  }

  /**
   * Update item quantity in booking
   */
  async updateItemQuantity(bookingId, itemId, quantity) {
    try {
      logger.info(`Updating item ${itemId} quantity to ${quantity} in booking: ${bookingId}`);
      
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      if (booking.status !== 'draft') {
        throw new Error('Cannot modify non-draft booking');
      }
      
      const item = booking.items.find(i => i.itemId === itemId);
      if (!item) {
        throw new Error('Item not found in booking');
      }
      
      item.quantity = quantity;
      await booking.save();
      
      logger.success(`Item quantity updated. Total items now: ${booking.totalItems}`);
      return booking;
    } catch (err) {
      logger.error(`Error updating item quantity: ${err.message}`);
      throw err;
    }
  }

  /**
   * Submit booking (mark as submitted, ready for conversion to order)
   */
  async submitBooking(bookingId) {
    try {
      logger.info(`Submitting booking: ${bookingId}`);
      
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      if (booking.status !== 'draft') {
        throw new Error('Only draft bookings can be submitted');
      }
      
      if (!booking.acceptTerms) {
        throw new Error('Terms must be accepted before submission');
      }
      
      if (booking.items.length === 0) {
        throw new Error('Cannot submit booking without items');
      }
      
      booking.status = 'submitted';
      booking.submittedAt = new Date();
      await booking.save();
      
      logger.success(`Booking submitted successfully: ${bookingId}`);
      return booking;
    } catch (err) {
      logger.error(`Error submitting booking: ${err.message}`);
      throw err;
    }
  }

  /**
   * Delete booking (only drafts)
   */
  async deleteBooking(bookingId) {
    try {
      logger.info(`Deleting booking: ${bookingId}`);
      
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      if (booking.status !== 'draft') {
        throw new Error('Only draft bookings can be deleted');
      }
      
      await Booking.findByIdAndDelete(bookingId);
      
      logger.success(`Booking deleted successfully: ${bookingId}`);
      return { message: 'Booking deleted successfully' };
    } catch (err) {
      logger.error(`Error deleting booking: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new BookingService();