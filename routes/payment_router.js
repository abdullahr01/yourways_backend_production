const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/payment_controller');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

logger.info('[ROUTES] Payment routes loaded (Stripe)');

// Public — publishable key only. Safe to expose; it is designed to ship
// inside web/mobile clients.
router.get('/config', PaymentController.config);

// Customer checkout. Ownership is enforced inside PaymentService against the
// booking's userId (the booking id arrives in the body, so requireSelf can't
// be used here).
router.post('/create-intent', requireAuth('user'), PaymentController.createIntent);
router.get('/booking/:bookingId', requireAuth('user'), PaymentController.getBookingPaymentStatus);

// Server-verified reconciliation: the client names the intent, Stripe supplies
// the verdict. Used as the immediate path after the payment sheet closes and
// as the fallback when webhooks aren't reachable (local dev).
router.post('/confirm', requireAuth('user'), PaymentController.confirm);

// NOTE: POST /webhook is registered separately in app.js via
// routes/payment_webhook_router.js because it needs the raw request body.
// NOTE: list-all payments / refunds live under /api/admin/payments.

module.exports = router;
