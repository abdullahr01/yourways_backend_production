const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user_controller');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

logger.info('[ROUTES] User routes loaded (Supabase + JWT)');

// Public
router.post('/register', UserController.register);
router.post('/login', UserController.login);

// Protected (Bearer JWT, role=user)
router.post('/verify-token', requireAuth('user'), UserController.verifyToken);
router.get('/profile', requireAuth('user'), UserController.getProfile);

// NOTE: list-all users moved to GET /api/admin/users

module.exports = router;
