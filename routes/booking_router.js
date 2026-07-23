const express = require('express');
const router = express.Router();
const BookingController = require('../controllers/booking_controller');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

logger.info('[ROUTES] Booking routes loaded (Supabase)');

router.post('/create', requireAuth('user'), BookingController.create);
router.get('/all', optionalAuth, BookingController.getAll);
router.get('/user/:userId', requireAuth('user'), BookingController.getByUser);
router.get('/:id', optionalAuth, BookingController.getById);
router.put('/:id', requireAuth('user'), BookingController.update);
router.delete('/:id', requireAuth('user'), BookingController.delete);

router.post('/:id/items', requireAuth('user'), BookingController.addItem);
router.delete('/:id/items/:itemId', requireAuth('user'), BookingController.removeItem);
router.patch('/:id/items/:itemId/quantity', requireAuth('user'), BookingController.updateItemQuantity);

router.post('/:id/submit', requireAuth('user'), BookingController.submit);
router.post('/:id/calculate-price', requireAuth('user'), BookingController.calculatePrice);

module.exports = router;
