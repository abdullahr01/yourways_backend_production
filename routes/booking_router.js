const express = require('express');
const router = express.Router();
const BookingController = require('../controllers/booking_controller');
const logger = require('../utils/logger');

logger.info('[ROUTES] Booking routes loaded: create, items, submit, calculate-price');

// Create new booking
router.post('/create', BookingController.create);

// Get all bookings (with optional filters)
router.get('/all', BookingController.getAll);

// Get bookings by user
router.get('/user/:userId', BookingController.getByUser);

// Get single booking by ID
router.get('/:id', BookingController.getById);

// Update booking
router.put('/:id', BookingController.update);

// Delete booking (draft only)
router.delete('/:id', BookingController.delete);

// Add item to booking
router.post('/:id/items', BookingController.addItem);

// Remove item from booking
router.delete('/:id/items/:itemId', BookingController.removeItem);

// Update item quantity
router.patch('/:id/items/:itemId/quantity', BookingController.updateItemQuantity);

// Submit booking
router.post('/:id/submit', BookingController.submit);

// Calculate quotation price (YourWays doc Step 3)
router.post('/:id/calculate-price', BookingController.calculatePrice);

module.exports = router;