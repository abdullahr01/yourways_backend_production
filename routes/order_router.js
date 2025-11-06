const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/order_controller');

// Create order from booking
router.post('/create-from-booking', OrderController.createFromBooking);

// Create order directly
router.post('/create', OrderController.create);

// Get all orders (with optional filters)
router.get('/all', OrderController.getAll);

// Get active orders
router.get('/active', OrderController.getActive);

// Get orders by user
router.get('/user/:userId', OrderController.getByUser);

// Get order by orderId (ORD-XXX format)
router.get('/code/:orderId', OrderController.getByOrderId);

// Get single order by ID
router.get('/:id', OrderController.getById);

// Update order
router.put('/:id', OrderController.update);

// Update order status
router.patch('/:id/status', OrderController.updateStatus);

// Assign driver to order
router.post('/:id/assign-driver', OrderController.assignDriver);

// Update order pricing
router.patch('/:id/pricing', OrderController.updatePricing);

// Schedule pickup
router.post('/:id/schedule-pickup', OrderController.schedulePickup);

// Cancel order
router.post('/:id/cancel', OrderController.cancel);

module.exports = router;