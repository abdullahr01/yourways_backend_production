const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/admin_controller');
const PaymentController = require('../controllers/payment_controller');
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

// Drivers — admin is the ONLY way a driver profile gets created (no
// self-registration). Approval still requires the admin to have verified an
// OTP client-side first (Flutter/Firebase), then call approve below.
router.post('/drivers', AdminController.createDriver);
router.get('/drivers', AdminController.listDrivers);
router.put('/drivers/:id/approve', AdminController.approveDriver);
router.put('/drivers/:id/block', AdminController.blockDriver);
router.put('/drivers/:id/deactivate', AdminController.deactivateDriver);
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

// Payments — read-only ledger plus refunds. Refunding is the money-side
// counterpart to cancelling an order, so it is admin-only by design.
router.get('/payments', PaymentController.listPayments);
router.post('/payments/:id/refund', PaymentController.refund);

// Catalog — full admin control over what services/categories/items/prices
// are listed on the platform (DB-backed, replaces editing data/service_templates.js).
router.post('/catalog/service-types', AdminController.createServiceType);
router.put('/catalog/service-types/:id', AdminController.updateServiceType);
router.delete('/catalog/service-types/:id', AdminController.deleteServiceType);

router.post('/catalog/categories', AdminController.createCategory);
router.put('/catalog/categories/:id', AdminController.updateCategory);
router.delete('/catalog/categories/:id', AdminController.deleteCategory);
router.post('/catalog/categories/:categoryId/attach', AdminController.attachCategory);
router.delete('/catalog/categories/:categoryId/service-types/:serviceTypeId', AdminController.detachCategory);

router.post('/catalog/items', AdminController.createItem);
router.put('/catalog/items/:id', AdminController.updateItem);
router.delete('/catalog/items/:id', AdminController.deleteItem);

module.exports = router;
