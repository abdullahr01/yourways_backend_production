const express = require('express');
const router = express.Router();
const ImageController = require('../controllers/image_controller');
const { requireAuth, requireSelf } = require('../middleware/auth');
const logger = require('../utils/logger');

logger.info('[ROUTES] Image read routes loaded (/api/images)');

// Admin fleet / driver-management screen. Must be registered before /drivers/:id
// so Express does not treat "drivers" as an id.
router.get('/drivers', requireAuth('admin'), ImageController.listDriverPhotos);

router.get(
  '/drivers/:id/orders',
  requireAuth(['driver', 'admin']),
  requireSelf('id'),
  ImageController.getDriverOrderImages
);

// Public on purpose: the same URL is already on GET /api/drivers/:id and on
// the tracking payload. This is just that field on its own.
router.get('/drivers/:id', ImageController.getDriverPhoto);

router.get(
  '/users/:userId/orders',
  requireAuth(['user', 'admin']),
  requireSelf('userId'),
  ImageController.getUserOrderImages
);

// Proof photos are private. The service checks the caller owns the order,
// is assigned to it, or is an admin.
router.get(
  '/orders/:orderId',
  requireAuth(['user', 'driver', 'admin']),
  ImageController.getOrderImages
);

module.exports = router;
