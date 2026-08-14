const PaymentService = require('../services/payment_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { getStripe, isConfigured, WEBHOOK_SECRET } = require('../config/stripe');
const logger = require('../utils/logger');

class PaymentController {
  /**
   * Publishable key + currency for the apps.
   * GET /api/payments/config
   */
  async config(req, res) {
    try {
      logger.info('[PAYMENT CTRL] === CONFIG ===');
      if (!isConfigured()) {
        return errorResponse(res, 503, 'Stripe is not configured on the server');
      }
      return successResponse(res, 200, 'Stripe config fetched successfully', PaymentService.getPublicConfig());
    } catch (err) {
      logger.error(`[PAYMENT CTRL] config failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch Stripe config', err.message);
    }
  }

  /**
   * Start checkout for a draft booking.
   * POST /api/payments/create-intent  body: { bookingId }
   */
  async createIntent(req, res) {
    try {
      logger.info('[PAYMENT CTRL] === CREATE INTENT ===');
      const { bookingId } = req.body || {};
      const authUserId = req.auth?.id || req.auth?._id;
      logger.info(`[PAYMENT CTRL] bookingId=${bookingId} user=${authUserId}`);

      const result = await PaymentService.createPaymentIntentForBooking(bookingId, authUserId);

      logger.success(
        `[PAYMENT CTRL] Intent ready ${result.paymentIntentId} £${result.amount}`
      );
      return successResponse(res, 201, 'Payment intent created successfully', result);
    } catch (err) {
      logger.error(`[PAYMENT CTRL] createIntent failed: ${err.message}`);
      return errorResponse(res, err.statusCode || 400, 'Failed to create payment intent', err.message);
    }
  }

  /**
   * Payment state for a booking (poll after the payment sheet closes).
   * GET /api/payments/booking/:bookingId
   */
  async getBookingPaymentStatus(req, res) {
    try {
      logger.info(`[PAYMENT CTRL] === STATUS booking=${req.params.bookingId} ===`);
      const authUserId = req.auth?.id || req.auth?._id;

      const result = await PaymentService.getBookingPaymentStatus(req.params.bookingId, authUserId);

      logger.success(`[PAYMENT CTRL] Status=${result.paymentStatus} paid=${result.isPaid}`);
      return successResponse(res, 200, 'Payment status fetched successfully', result);
    } catch (err) {
      logger.error(`[PAYMENT CTRL] status failed: ${err.message}`);
      return errorResponse(res, err.statusCode || 400, 'Failed to fetch payment status', err.message);
    }
  }

  /**
   * Re-read the PaymentIntent from Stripe and apply the result (creating the
   * order if it succeeded). The client only supplies the intent id — the
   * outcome always comes from Stripe, never from the request body.
   * POST /api/payments/confirm  body: { paymentIntentId }
   */
  async confirm(req, res) {
    try {
      logger.info('[PAYMENT CTRL] === CONFIRM ===');
      const { paymentIntentId } = req.body || {};
      const authUserId = req.auth?.id || req.auth?._id;
      logger.info(`[PAYMENT CTRL] paymentIntentId=${paymentIntentId} user=${authUserId}`);

      const result = await PaymentService.confirmPayment(paymentIntentId, authUserId);

      logger.success(
        `[PAYMENT CTRL] Confirmed status=${result.paymentStatus} order=${result.order?.orderId || 'none'}`
      );
      return successResponse(res, 200, 'Payment confirmed successfully', result);
    } catch (err) {
      logger.error(`[PAYMENT CTRL] confirm failed: ${err.message}`);
      return errorResponse(res, err.statusCode || 400, 'Payment confirmation failed', err.message);
    }
  }

  /**
   * Stripe webhook. No JWT — authenticity comes from the Stripe signature
   * header, which is verified against the raw request body (see
   * routes/payment_webhook_router.js for why the body must stay unparsed).
   * POST /api/payments/webhook
   */
  async webhook(req, res) {
    logger.info('[PAYMENT CTRL] === STRIPE WEBHOOK ===');

    if (!isConfigured()) {
      logger.error('[PAYMENT CTRL] Webhook received but Stripe is not configured');
      return res.status(503).json({ received: false, error: 'Stripe not configured' });
    }
    if (!WEBHOOK_SECRET) {
      // Refusing unverified events is the only safe option — an unsigned
      // webhook endpoint would let anyone mark any booking as paid.
      logger.error(
        '[PAYMENT CTRL] STRIPE_WEBHOOK_SECRET is not set — refusing to process unverified events. ' +
          'Use POST /api/payments/confirm for local testing, or run: stripe listen --forward-to localhost:5000/api/payments/webhook'
      );
      return res.status(503).json({ received: false, error: 'Webhook secret not configured' });
    }

    const signature = req.headers['stripe-signature'];
    let event;

    try {
      event = getStripe().webhooks.constructEvent(req.body, signature, WEBHOOK_SECRET);
    } catch (err) {
      logger.error(`[PAYMENT CTRL] Signature verification failed: ${err.message}`);
      return res.status(400).json({ received: false, error: `Webhook Error: ${err.message}` });
    }

    logger.info(`[PAYMENT CTRL] Verified event ${event.type} id=${event.id}`);

    try {
      await PaymentService.handleWebhookEvent(event);
      logger.success(`[PAYMENT CTRL] Handled ${event.type}`);
    } catch (err) {
      // 500 makes Stripe retry with backoff, which is what we want for a
      // transient DB failure. Handlers are idempotent, so retries are safe.
      logger.error(`[PAYMENT CTRL] Handler failed for ${event.type}: ${err.message}`);
      return res.status(500).json({ received: false, error: err.message });
    }

    return res.status(200).json({ received: true });
  }

  // ——— Admin ———

  /**
   * GET /api/admin/payments?status=succeeded&userId=&bookingId=&limit=
   */
  async listPayments(req, res) {
    try {
      logger.info('[PAYMENT CTRL] === ADMIN LIST PAYMENTS ===');
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      if (req.query.userId) filter.userId = req.query.userId;
      if (req.query.bookingId) filter.bookingId = req.query.bookingId;
      if (req.query.orderId) filter.orderId = req.query.orderId;
      const limit = parseInt(req.query.limit, 10) || 100;

      const payments = await PaymentService.listPayments(filter, limit);
      const totalCollected = payments
        .filter((p) => p.status === 'succeeded' || p.status === 'refunded')
        .reduce((sum, p) => sum + (p.amount - p.refundedAmount), 0);

      logger.success(`[PAYMENT CTRL] Returned ${payments.length} payments`);
      return successResponse(res, 200, 'Payments fetched successfully', {
        count: payments.length,
        netCollected: Math.round(totalCollected * 100) / 100,
        payments,
      });
    } catch (err) {
      logger.error(`[PAYMENT CTRL] listPayments failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch payments', err.message);
    }
  }

  /**
   * POST /api/admin/payments/:id/refund  body: { amount?, reason? }
   */
  async refund(req, res) {
    try {
      logger.info(`[PAYMENT CTRL] === ADMIN REFUND ${req.params.id} ===`);
      const { amount, reason } = req.body || {};

      const result = await PaymentService.refundPayment(req.params.id, { amount, reason });

      logger.success(`[PAYMENT CTRL] Refunded £${result.refundedAmount}`);
      return successResponse(res, 200, 'Payment refunded successfully', result);
    } catch (err) {
      logger.error(`[PAYMENT CTRL] refund failed: ${err.message}`);
      return errorResponse(res, err.statusCode || 400, 'Refund failed', err.message);
    }
  }
}

module.exports = new PaymentController();
