const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notification_controller');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

logger.info('[ROUTES] Notification routes loaded (FCM)');

const anyRole = requireAuth(['user', 'driver', 'admin']);

// The owner is always taken from the JWT, never from the body, so a token can
// only ever be registered to (or removed from) the caller's own account.
router.post('/device-token', anyRole, NotificationController.registerDeviceToken);
router.delete('/device-token', anyRole, NotificationController.removeDeviceToken);

router.post('/test', requireAuth('admin'), NotificationController.sendTest);

module.exports = router;
