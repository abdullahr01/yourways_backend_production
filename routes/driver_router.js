const express = require('express');
const router = express.Router();
const DriverController = require('../controllers/driver_controller');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

logger.info('[ROUTES] Driver routes loaded (Supabase + JWT)');

// Public auth
router.post('/register', DriverController.register);
router.post('/login', DriverController.login);

// Driver self endpoints
router.get('/:id', DriverController.getById);
router.put('/:id', requireAuth(['driver', 'user']), DriverController.update);

// Driver session actions
router.post('/:id/go-online', requireAuth('driver'), DriverController.goOnline);
router.post('/:id/go-offline', requireAuth('driver'), DriverController.goOffline);
router.post('/:id/update-location', requireAuth('driver'), DriverController.updateLocation);

router.get('/:id/orders', requireAuth('driver'), DriverController.getDriverOrders);
router.get('/:id/orders/active', requireAuth('driver'), DriverController.getDriverActiveOrders);
router.patch('/:id/orders/:orderId/status', requireAuth('driver'), DriverController.updateOrderStatus);
router.post('/:id/orders/:orderId/complete-pickup', requireAuth('driver'), DriverController.completePickup);
router.post('/:id/orders/:orderId/complete-delivery', requireAuth('driver'), DriverController.completeDelivery);

router.get('/:id/statistics', requireAuth('driver'), DriverController.getStatistics);

// NOTE: approve / list-all drivers moved to /api/admin/drivers

module.exports = router;
