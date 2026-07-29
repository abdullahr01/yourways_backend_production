const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/order_controller');
const { requireAuth, requireSelf, optionalAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

logger.info('[ROUTES] Order routes loaded (Supabase)');

// NOT part of the normal flow anymore — POST /api/bookings/:id/submit now
// creates the order automatically in the same call. This route stays as a
// safety-net: if a submit request's order-creation half fails/times out
// after the booking was already marked 'submitted', the booking can no
// longer be re-submitted (only 'draft' bookings can be submitted), so the
// app can retry just this step. It's safe to retry — createOrderFromBooking
// throws if the booking was already converted, so it can never double-create.
router.post('/create-from-booking', requireAuth('user'), OrderController.createFromBooking);
router.post('/create', requireAuth('user'), OrderController.create);

router.get('/active', optionalAuth, OrderController.getActive);
// requireSelf: same reasoning as bookings — a customer can only list THEIR
// OWN order history.
router.get('/user/:userId', requireAuth('user'), requireSelf('userId'), OrderController.getByUser);
router.get('/code/:orderId', optionalAuth, OrderController.getByOrderId);
router.get('/:id/tracking', optionalAuth, OrderController.getTracking);
router.get('/:id', optionalAuth, OrderController.getById);

router.put('/:id', requireAuth(['user', 'driver']), OrderController.update);
router.patch('/:id/status', requireAuth(['user', 'driver']), OrderController.updateStatus);
router.post('/:id/cancel', requireAuth('user'), OrderController.cancel);

// NOTE: list-all / assign-driver / pricing / schedule-pickup → /api/admin/orders

module.exports = router;
