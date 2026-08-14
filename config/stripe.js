const Stripe = require('stripe');
const logger = require('../utils/logger');

/**
 * Stripe client + money helpers.
 *
 * The secret key never leaves this process — the apps only ever receive the
 * publishable key (via GET /api/payments/config) and a PaymentIntent
 * client_secret, which is scoped to that one payment.
 */

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Pricing is UK-only (pricing_service.js applies UK VAT and £/mile rates).
const CURRENCY = 'gbp';

// Stripe rejects GBP charges under £0.30.
const MIN_CHARGE_MINOR = 30;

let client = null;

if (SECRET_KEY) {
  client = new Stripe(SECRET_KEY);
  logger.success(
    `[STRIPE] Client ready (${SECRET_KEY.startsWith('sk_live') ? 'LIVE' : 'test'} mode)`
  );
} else {
  logger.warn('[STRIPE] STRIPE_SECRET_KEY not set — payment endpoints will return 503');
}

/**
 * Throws instead of returning null so every call site fails loudly with the
 * same message rather than each one crashing on `undefined.paymentIntents`.
 */
const getStripe = () => {
  if (!client) {
    const err = new Error('Stripe is not configured on the server (STRIPE_SECRET_KEY missing)');
    err.statusCode = 503;
    throw err;
  }
  return client;
};

const isConfigured = () => Boolean(client);

/** £123.45 -> 12345. Stripe only accepts integer minor units. */
const toMinorUnits = (amount) => Math.round(Number(amount) * 100);

/** 12345 -> 123.45, for storing/displaying alongside the rest of our GBP values. */
const fromMinorUnits = (minor) => Math.round(Number(minor)) / 100;

module.exports = {
  getStripe,
  isConfigured,
  toMinorUnits,
  fromMinorUnits,
  CURRENCY,
  MIN_CHARGE_MINOR,
  PUBLISHABLE_KEY,
  WEBHOOK_SECRET,
};
