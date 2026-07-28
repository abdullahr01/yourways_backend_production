const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/admin_controller');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

logger.info('[ROUTES] Admin routes loaded (/api/admin)');

// Auth — first register is open; later requires admin (checked in controller)
router.post('/register', optionalAuth, AdminController.register);
router.post('/login', AdminController.login);

// Everything below requires role=admin
router.use(requireAuth('admin'));

router.get('/profile', AdminController.getProfile);
router.post('/logout', AdminController.logout);
router.get('/dashboard', AdminController.dashboard);

// Users
router.get('/users', AdminController.listUsers);

// Drivers
router.get('/drivers', AdminController.listDrivers);
router.put('/drivers/:id/approve', AdminController.approveDriver);
router.put('/drivers/:id/suspend', AdminController.suspendDriver);
router.put('/drivers/:id/activate', AdminController.activateDriver);

// Bookings
router.get('/bookings', AdminController.listBookings);
router.get('/bookings/:id', AdminController.getBooking);

// Orders
router.get('/orders', AdminController.listOrders);
router.get('/orders/:id', AdminController.getOrder);
router.post('/orders/:id/assign-driver', AdminController.assignDriver);
router.patch('/orders/:id/status', AdminController.updateOrderStatus);
router.patch('/orders/:id/pricing', AdminController.updateOrderPricing);
router.post('/orders/:id/schedule-pickup', AdminController.schedulePickup);
router.post('/orders/:id/cancel', AdminController.cancelOrder);

module.exports = router;
