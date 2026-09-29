const express = require('express');
const router = express.Router();
const DriverController = require('../controllers/driver_controller');
const { requireAuth, requireSelf } = require('../middleware/auth');
const logger = require('../utils/logger');

logger.info('[ROUTES] Driver routes loaded (Supabase + JWT)');

// Public auth — NOTE: there is no driver self-registration. Drivers are
// created exclusively by an admin (POST /api/admin/drivers) with the
// admin-verified OTP approval flow (handled entirely client-side by the
// admin app via Firebase, same as customer OTP) — see AdminController.createDriver.
router.post('/login', DriverController.login);
router.post('/logout', requireAuth('driver'), DriverController.logout);

// Driver self endpoints — requireSelf ensures a driver's token can only
// read/modify THEIR OWN record, never another driver's (previously any
// authenticated driver could edit/query any :id by just changing the URL).
// Status must be registered before bare /:id so Express doesn't treat
// "status" as an id. Own-id only — used by the driver app for banners/slider.
router.get(
  '/:id/status',
  requireAuth('driver'),
  requireSelf('id'),
  DriverController.getStatus
);

// Last-known GPS position. Authenticated on purpose (unlike GET /:id): an open
// endpoint here would let anyone follow a driver around all day. Admins read
// any driver for the live map; a driver only their own (enforced in the
// service). Customers use GET /api/orders/:id/driver-location instead.
// requireSelf already lets admins through while pinning a driver to their own id.
router.get(
  '/:id/location',
  requireAuth(['driver', 'admin']),
  requireSelf('id'),
  DriverController.getLocation
);

// GET /:id stays public/unauthenticated on purpose — it's the driver's
// public-facing profile shown to customers during order tracking.
router.get('/:id', DriverController.getById);
router.put('/:id', requireAuth('driver'), requireSelf('id'), DriverController.update);

// Driver session actions
router.post('/:id/go-online', requireAuth('driver'), requireSelf('id'), DriverController.goOnline);
router.post('/:id/go-offline', requireAuth('driver'), requireSelf('id'), DriverController.goOffline);
router.post(
  '/:id/update-location',
  requireAuth('driver'),
  requireSelf('id'),
  DriverController.updateLocation
);

router.get('/:id/orders', requireAuth('driver'), requireSelf('id'), DriverController.getDriverOrders);
router.get(
  '/:id/orders/active',
  requireAuth('driver'),
  requireSelf('id'),
  DriverController.getDriverActiveOrders
);
router.patch(
  '/:id/orders/:orderId/status',
  requireAuth('driver'),
  requireSelf('id'),
  DriverController.updateOrderStatus
);
router.post(
  '/:id/orders/:orderId/arrived',
  requireAuth('driver'),
  requireSelf('id'),
  DriverController.markArrived
);
router.post(
  '/:id/orders/:orderId/complete-pickup',
  requireAuth('driver'),
  requireSelf('id'),
  DriverController.completePickup
);
router.post(
  '/:id/orders/:orderId/complete-delivery',
  requireAuth('driver'),
  requireSelf('id'),
  DriverController.completeDelivery
);

router.get('/:id/statistics', requireAuth('driver'), requireSelf('id'), DriverController.getStatistics);

// NOTE: approve / list-all drivers moved to /api/admin/drivers

module.exports = router;
