const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user_controller');

// Public routes
router.post('/register', UserController.register);
router.post('/login', UserController.login);

// Protected routes (require token in headers)
router.post('/verify-token', UserController.verifyToken);
router.get('/profile', UserController.getProfile);

// Admin route
router.get('/all', UserController.getAll);

module.exports = router;