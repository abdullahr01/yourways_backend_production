const express = require('express');
const router = express.Router();
const DriverController = require('../controllers/driver_controller');
const logger = require('../utils/logger');

logger.info('[ROUTES] Driver routes loaded: auth, orders, location, statistics');

// ==================== Authentication ====================
router.post('/register', DriverController.register);
router.post('/login', DriverController.login);

// ==================== Driver Management ====================
router.get('/all', DriverController.getAll);
router.get('/:id', DriverController.getById);
router.put('/:id', DriverController.update);
router.put('/approve/:id', DriverController.approve);

// ==================== Online/Offline Status ====================
router.post('/:id/go-online', DriverController.goOnline);
router.post('/:id/go-offline', DriverController.goOffline);

// ==================== Location Updates ====================
router.post('/:id/update-location', DriverController.updateLocation);

// ==================== Order Management ====================
router.get('/:id/orders', DriverController.getDriverOrders);
router.get('/:id/orders/active', DriverController.getDriverActiveOrders);
router.patch('/:id/orders/:orderId/status', DriverController.updateOrderStatus);
router.post('/:id/orders/:orderId/complete-pickup', DriverController.completePickup);
router.post('/:id/orders/:orderId/complete-delivery', DriverController.completeDelivery);

// ==================== Statistics ====================
router.get('/:id/statistics', DriverController.getStatistics);

module.exports = router;