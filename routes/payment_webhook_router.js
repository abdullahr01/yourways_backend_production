const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/payment_controller');
const logger = require('../utils/logger');

logger.info('[ROUTES] Stripe webhook route loaded (raw body, no auth)');

/**
 * Mounted BEFORE bodyParser.json() in app.js — deliberately.
 *
 * Stripe signs the exact bytes it sent. Once bodyParser.json() has turned the
 * stream into a JS object the original bytes are gone, and
 * `webhooks.constructEvent` can no longer verify the signature. So this one
 * route keeps the body as a raw Buffer while every other route in the app
 * still gets normal JSON parsing.
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  PaymentController.webhook
);

module.exports = router;
