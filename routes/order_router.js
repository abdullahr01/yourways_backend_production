const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/order_controller');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

logger.info('[ROUTES] Order routes loaded (Supabase)');

router.post('/create-from-booking', requireAuth('user'), OrderController.createFromBooking);
router.post('/create', requireAuth('user'), OrderController.create);

router.get('/active', optionalAuth, OrderController.getActive);
router.get('/user/:userId', requireAuth('user'), OrderController.getByUser);
router.get('/code/:orderId', optionalAuth, OrderController.getByOrderId);
router.get('/:id', optionalAuth, OrderController.getById);

router.put('/:id', requireAuth(['user', 'driver']), OrderController.update);
router.patch('/:id/status', requireAuth(['user', 'driver']), OrderController.updateStatus);
router.post('/:id/cancel', requireAuth('user'), OrderController.cancel);

// NOTE: list-all / assign-driver / pricing / schedule-pickup → /api/admin/orders

module.exports = router;
