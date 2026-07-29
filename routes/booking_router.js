const express = require('express');
const router = express.Router();
const BookingController = require('../controllers/booking_controller');
const { requireAuth, requireSelf, optionalAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

logger.info('[ROUTES] Booking routes loaded (Supabase)');

router.post('/create', requireAuth('user'), BookingController.create);
router.get('/all', optionalAuth, BookingController.getAll);
// requireSelf: a customer's token can only list THEIR OWN booking history —
// without it, any logged-in user could read another user's bookings by
// changing :userId in the URL.
router.get('/user/:userId', requireAuth('user'), requireSelf('userId'), BookingController.getByUser);
router.get('/:id', optionalAuth, BookingController.getById);
router.put('/:id', requireAuth('user'), BookingController.update);
router.delete('/:id', requireAuth('user'), BookingController.delete);

router.post('/:id/items', requireAuth('user'), BookingController.addItem);
router.delete('/:id/items/:itemId', requireAuth('user'), BookingController.removeItem);
router.patch('/:id/items/:itemId/quantity', requireAuth('user'), BookingController.updateItemQuantity);

router.post('/:id/submit', requireAuth('user'), BookingController.submit);
router.post('/:id/calculate-price', requireAuth('user'), BookingController.calculatePrice);

module.exports = router;
