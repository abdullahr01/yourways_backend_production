const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/order_controller');

// create order
router.post('/create', OrderController.create);

// get all orders (optional ?status=...)
router.get('/all', OrderController.getAll);

// get orders by user
router.get('/user/:userId', OrderController.getByUser);

// get single order
router.get('/:id', OrderController.getById);

// update order
router.put('/:id', OrderController.update);

module.exports = router;
