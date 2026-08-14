const Payment = require('../models/payment_model');
const Booking = require('../models/booking_model');
const Order = require('../models/order_model');
const BookingService = require('./booking_service');
const OrderService = require('./order_service');
const PricingService = require('./pricing_service');
const RealtimeService = require('./realtime_service');
const logger = require('../utils/logger');
const { formatOrder } = require('../utils/orderFormatter');
const {
  getStripe,
  toMinorUnits,
  fromMinorUnits,
  CURRENCY,
  MIN_CHARGE_MINOR,
  PUBLISHABLE_KEY,
} = require('../config/stripe');

/**
 * Stripe payments (KB Section 7.8, adapted to YourWays' pay-before-order rule).
 *
 * The money flow deliberately mirrors Stripe's own recommended split:
 *
 *   backend  — decides the amount, creates the PaymentIntent, verifies the
 *              webhook signature, records the payment, and is the ONLY thing
 *              that turns a paid booking into an order.
 *   frontend — renders Stripe's own card UI (Payment Element on web,
 *              PaymentSheet on Flutter) using the returned client_secret.
 *
 * Card details never reach this server, and no client can decide either the
 * price or whether it was paid:
 *   - the amount is always recalculated here from the booking (never read
 *     from the request body, and never trusted from bookings.calculated_price,
 *     which a customer could previously overwrite via PUT /api/bookings/:id);
 *   - the order is only created after Stripe tells us the money arrived,
 *     either by signed webhook or by us re-reading the PaymentIntent from
 *     Stripe's API (`confirmPayment`) — never because an app said "success".
 */

/** PaymentIntent states that mean "still in flight, reuse this intent". */
const REUSABLE_INTENT_STATUSES = [
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
];

const badRequest = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

class PaymentService {
  /** Public config for the apps — publishable key only, never the secret. */
  getPublicConfig() {
    return {
      publishableKey: PUBLISHABLE_KEY || null,
      currency: CURRENCY,
      // Tells the frontend which Stripe integration to build against.
      integration: 'payment_intents',
    };
  }

  /**
   * Step 1 of checkout: price the booking server-side and hand back a
   * client_secret for the app to confirm.
   *
   * Safe to call repeatedly — an in-flight PaymentIntent for the same booking
   * is reused (amount-synced if the customer edited items in between) instead
   * of creating a second intent, so a customer can never end up with two
   * chargeable intents for one booking.
   */
  async createPaymentIntentForBooking(bookingId, authUserId) {
    logger.info(`[PAYMENT SVC] createIntent booking=${bookingId} user=${authUserId}`);

    if (!bookingId) throw badRequest('bookingId is required');

    const booking = await Booking.findById(bookingId);
    if (!booking) throw badRequest('Booking not found', 404);

    if (authUserId && String(booking.userId) !== String(authUserId)) {
      logger.warn(
        `[PAYMENT SVC] Ownership denied — token user=${authUserId} tried booking ${bookingId} (owner=${booking.userId})`
      );
      throw badRequest('You do not have permission to pay for this booking', 403);
    }

    if (booking.status === 'converted_to_order') {
      throw badRequest('This booking has already been paid and converted into an order', 409);
    }
    if (booking.status === 'submitted') {
      throw badRequest(
        'This booking is already paid and awaiting order creation. Retry POST /api/orders/create-from-booking instead.',
        409
      );
    }
    if (!booking.items || booking.items.length === 0) {
      throw badRequest('Cannot pay for a booking with no items');
    }
    if (!booking.acceptTerms) {
      throw badRequest('Terms must be accepted before payment');
    }

    // Don't take money for a request that could never be submitted — the
    // one-active-request rule would reject the conversion afterwards.
    await BookingService.assertNoActiveRequest(booking.userId, { excludeBookingId: booking.id });

    // Authoritative price. Recalculated here rather than trusting the stored
    // value, then persisted so the booking, the payment, and the eventual
    // order all agree on one number.
    const priceBreakdown = await PricingService.calculateQuotation(booking);
    const amount = priceBreakdown.total;
    const amountMinor = toMinorUnits(amount);

    if (!Number.isFinite(amountMinor) || amountMinor < MIN_CHARGE_MINOR) {
      throw badRequest(
        `Calculated amount £${amount} is below the minimum card charge of £${fromMinorUnits(MIN_CHARGE_MINOR)}`
      );
    }

    await Booking.updateById(bookingId, {
      calculatedPrice: amount,
      priceBreakdown,
      paymentStatus: 'pending',
    });

    const stripe = getStripe();
    const existing = await Payment.findOpenByBookingId(bookingId);

    if (existing) {
      const reused = await this._reuseIntent(existing, { amount, amountMinor, booking });
      if (reused) {
        logger.success(
          `[PAYMENT SVC] Reusing intent ${reused.paymentIntentId} for booking ${bookingId} (£${reused.amount})`
        );
        return this._intentResponse(reused, { amount, amountMinor, priceBreakdown });
      }
    }

    const intent = await stripe.paymentIntents.create(
      {
        amount: amountMinor,
        currency: CURRENCY,
        // Lets Stripe decide which methods to offer (card, Apple/Google Pay)
        // based on the dashboard settings — same call works for web and Flutter.
        automatic_payment_methods: { enabled: true },
        description: `YourWays booking ${bookingId}`,
        receipt_email: booking.email || undefined,
        metadata: {
          bookingId: String(bookingId),
          userId: String(booking.userId),
          customerName: booking.fullName || '',
        },
      },
      // Guards against a double-tap creating two intents for the same price.
      { idempotencyKey: `yw-booking-${bookingId}-${amountMinor}` }
    );

    logger.success(`[PAYMENT SVC] Stripe intent created ${intent.id} amount=${amountMinor} ${CURRENCY}`);

    const payment = await Payment.create({
      bookingId,
      userId: booking.userId,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      amount,
      amountMinor,
      currency: CURRENCY,
      status: 'pending',
      meta: { intentStatus: intent.status },
    });

    return this._intentResponse(payment, { amount, amountMinor, priceBreakdown });
  }

  /**
   * Keep an already-created intent usable instead of making a new one.
   * Returns the (possibly amount-updated) payment row, or null when the old
   * intent is no longer usable and the caller should create a fresh one.
   */
  async _reuseIntent(payment, { amount, amountMinor, booking }) {
    const stripe = getStripe();

    let intent;
    try {
      intent = await stripe.paymentIntents.retrieve(payment.paymentIntentId);
    } catch (err) {
      logger.warn(
        `[PAYMENT SVC] Could not retrieve intent ${payment.paymentIntentId} (${err.message}) — creating a new one`
      );
      return null;
    }

    // Already paid while we weren't looking: reconcile instead of charging again.
    if (intent.status === 'succeeded') {
      logger.warn(
        `[PAYMENT SVC] Intent ${intent.id} already succeeded — reconciling instead of creating a new intent`
      );
      await this._applySucceeded(intent);
      throw badRequest('This booking has already been paid', 409);
    }

    if (!REUSABLE_INTENT_STATUSES.includes(intent.status)) {
      await Payment.updateById(payment.id, {
        status: intent.status === 'canceled' ? 'cancelled' : 'failed',
        meta: { ...payment.meta, intentStatus: intent.status },
      });
      return null;
    }

    if (intent.amount === amountMinor) {
      return payment;
    }

    // Customer edited the booking after starting checkout — move the existing
    // intent to the new price rather than leaving a stale amount behind.
    logger.info(
      `[PAYMENT SVC] Amount changed ${intent.amount} → ${amountMinor} — updating intent ${intent.id}`
    );
    try {
      const updated = await stripe.paymentIntents.update(intent.id, {
        amount: amountMinor,
        receipt_email: booking.email || undefined,
      });
      return Payment.updateById(payment.id, {
        amount,
        amountMinor,
        clientSecret: updated.client_secret || payment.clientSecret,
        meta: { ...payment.meta, intentStatus: updated.status },
      });
    } catch (err) {
      logger.warn(`[PAYMENT SVC] Intent amount update failed (${err.message}) — cancelling it`);
      try {
        await stripe.paymentIntents.cancel(intent.id);
      } catch {
        // Already cancelled/uncancellable — nothing useful to do.
      }
      await Payment.updateById(payment.id, { status: 'cancelled' });
      return null;
    }
  }

  _intentResponse(payment, { amount, amountMinor, priceBreakdown }) {
    return {
      paymentId: payment.id,
      paymentIntentId: payment.paymentIntentId,
      clientSecret: payment.clientSecret,
      publishableKey: PUBLISHABLE_KEY || null,
      // The frontend must display THIS amount — it is what will be charged,
      // and it can differ from an older quote if the booking changed.
      amount: amount ?? payment.amount,
      amountMinor: amountMinor ?? payment.amountMinor,
      currency: payment.currency,
      status: payment.status,
      priceBreakdown,
    };
  }

  /**
   * Stripe → us. Called only after the signature has been verified in the
   * controller, so the payload is trustworthy.
   */
  async handleWebhookEvent(event) {
    logger.info(`[PAYMENT SVC] Webhook ${event.type} id=${event.id}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        return this._applySucceeded(event.data.object, event.id);

      case 'payment_intent.payment_failed':
        return this._applyFailed(event.data.object, event.id);

      case 'payment_intent.canceled':
        return this._applyCancelled(event.data.object, event.id);

      case 'charge.refunded':
        return this._applyRefunded(event.data.object, event.id);

      default:
        logger.info(`[PAYMENT SVC] Ignoring unhandled event type ${event.type}`);
        return { ignored: true };
    }
  }

  /**
   * Client-driven reconciliation. The client only tells us WHICH payment to
   * look at; the status comes from Stripe's API, so this is not "trusting the
   * frontend". Exists because webhooks need a public URL (Stripe CLI in local
   * dev) and can be delayed — the app can call this right after the payment
   * sheet closes and get its order immediately.
   */
  async confirmPayment(paymentIntentId, authUserId) {
    logger.info(`[PAYMENT SVC] confirm intent=${paymentIntentId} user=${authUserId}`);
    if (!paymentIntentId) throw badRequest('paymentIntentId is required');

    const payment = await Payment.findByIntentId(paymentIntentId);
    if (!payment) throw badRequest('Payment not found', 404);
    if (authUserId && String(payment.userId) !== String(authUserId)) {
      throw badRequest('You do not have permission to access this payment', 403);
    }

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    logger.info(`[PAYMENT SVC] Stripe says intent ${paymentIntentId} is '${intent.status}'`);

    switch (intent.status) {
      case 'succeeded':
        return this._applySucceeded(intent);
      case 'canceled':
        return this._applyCancelled(intent);
      case 'requires_payment_method':
        // Two very different situations share this status: a declined attempt
        // (last_payment_error set) vs. an intent nobody has tried to pay yet.
        // Only the former is a failure.
        if (intent.last_payment_error) return this._applyFailed(intent);
        return {
          payment,
          order: null,
          paymentStatus: 'pending',
          clientSecret: payment.clientSecret,
        };
      default:
        await Payment.updateById(payment.id, {
          status: intent.status === 'processing' ? 'processing' : payment.status,
          meta: { ...payment.meta, intentStatus: intent.status },
        });
        return {
          payment: await Payment.findById(payment.id),
          order: null,
          paymentStatus: intent.status === 'processing' ? 'processing' : payment.status,
        };
    }
  }

  /**
   * The only path that turns money into an order.
   *
   * Idempotent by design: Stripe retries webhooks, and the app may call
   * /confirm for the same intent at the same time. A payment that is already
   * succeeded and already linked to an order short-circuits.
   */
  async _applySucceeded(intent, eventId = null) {
    const stripe = getStripe();

    // Re-read with the charge expanded so we can store the receipt URL and the
    // real captured amount rather than what we hoped to charge.
    let full = intent;
    try {
      full = await stripe.paymentIntents.retrieve(intent.id, { expand: ['latest_charge'] });
    } catch (err) {
      logger.warn(`[PAYMENT SVC] Could not expand charge for ${intent.id}: ${err.message}`);
    }

    const charge = typeof full.latest_charge === 'object' ? full.latest_charge : null;
    const capturedMinor = full.amount_received || full.amount;

    let payment = await Payment.findByIntentId(full.id);

    // Self-heal: intent exists at Stripe but we have no row (e.g. our insert
    // failed after the intent was created). metadata.bookingId lets us recover.
    if (!payment) {
      const bookingId = full.metadata?.bookingId;
      const userId = full.metadata?.userId;
      if (!bookingId || !userId) {
        logger.error(
          `[PAYMENT SVC] Succeeded intent ${full.id} has no local payment row and no metadata — manual reconciliation needed`
        );
        return { ignored: true, reason: 'unknown_payment' };
      }
      logger.warn(`[PAYMENT SVC] Recreating missing payment row for intent ${full.id}`);
      payment = await Payment.create({
        bookingId,
        userId,
        paymentIntentId: full.id,
        clientSecret: full.client_secret,
        amount: fromMinorUnits(capturedMinor),
        amountMinor: capturedMinor,
        currency: full.currency || CURRENCY,
        status: 'pending',
        meta: { recovered: true },
      });
    }

    const alreadyDone = payment.status === 'succeeded' && payment.orderId;
    if (alreadyDone) {
      logger.info(`[PAYMENT SVC] Intent ${full.id} already fulfilled → order ${payment.orderId}`);
      const existingOrder = await Order.findById(payment.orderId);
      return {
        payment,
        order: existingOrder ? formatOrder(existingOrder) : null,
        paymentStatus: 'succeeded',
        alreadyProcessed: true,
      };
    }

    payment = await Payment.updateById(payment.id, {
      status: 'succeeded',
      amount: fromMinorUnits(capturedMinor),
      amountMinor: capturedMinor,
      chargeId: charge?.id || (typeof full.latest_charge === 'string' ? full.latest_charge : null),
      receiptUrl: charge?.receipt_url || null,
      paymentMethodType: charge?.payment_method_details?.type || full.payment_method_types?.[0] || null,
      failureMessage: null,
      paidAt: new Date().toISOString(),
      meta: { ...payment.meta, intentStatus: full.status, lastEventId: eventId },
    });

    logger.success(`[PAYMENT SVC] Payment ${payment.id} SUCCEEDED £${payment.amount}`);

    await Booking.updateById(payment.bookingId, {
      paymentStatus: 'succeeded',
      paidAt: payment.paidAt,
    });

    const order = await this._fulfillBooking(payment.bookingId);

    if (order) {
      await Payment.updateById(payment.id, { orderId: order._id });
      const updatedOrder = await Order.updateById(order._id, {
        paymentStatus: 'succeeded',
        paidAmount: payment.amount,
        paymentId: payment.id,
      });
      await RealtimeService.broadcastOrderUpdate(updatedOrder);

      logger.success(
        `[PAYMENT SVC] Booking ${payment.bookingId} paid → order ${updatedOrder.orderId}`
      );
      return {
        payment: await Payment.findById(payment.id),
        order: formatOrder(updatedOrder),
        paymentStatus: 'succeeded',
      };
    }

    // Paid, but the order couldn't be created. The money is recorded and the
    // booking is 'submitted', so POST /api/orders/create-from-booking can
    // finish the job without charging again.
    logger.error(
      `[PAYMENT SVC] Payment ${payment.id} succeeded but order creation failed — booking ${payment.bookingId} needs order retry`
    );
    return {
      payment: await Payment.findById(payment.id),
      order: null,
      paymentStatus: 'succeeded',
      orderCreationPending: true,
    };
  }

  /**
   * Convert the now-paid booking into an order, tolerating every partial
   * state a retried webhook can land in.
   */
  async _fulfillBooking(bookingId) {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      logger.error(`[PAYMENT SVC] Booking ${bookingId} vanished before fulfillment`);
      return null;
    }

    if (booking.convertedOrderId) {
      logger.info(`[PAYMENT SVC] Booking ${bookingId} already converted → ${booking.convertedOrderId}`);
      return Order.findById(booking.convertedOrderId);
    }

    try {
      if (booking.status === 'draft') {
        const { order } = await BookingService.submitBooking(bookingId);
        return Order.findById(order._id);
      }

      // 'submitted' — a previous attempt locked the price but died before the
      // order was written.
      const order = await OrderService.createOrderFromBooking(bookingId);
      return Order.findById(order._id);
    } catch (err) {
      logger.error(`[PAYMENT SVC] Fulfillment failed for booking ${bookingId}: ${err.message}`);
      return null;
    }
  }

  async _applyFailed(intent, eventId = null) {
    const payment = await Payment.findByIntentId(intent.id);
    if (!payment) {
      logger.warn(`[PAYMENT SVC] Failed intent ${intent.id} has no local payment row`);
      return { ignored: true };
    }
    if (payment.status === 'succeeded') {
      logger.warn(`[PAYMENT SVC] Ignoring failure for already-succeeded payment ${payment.id}`);
      return { payment, order: null, paymentStatus: 'succeeded' };
    }

    const failureMessage =
      intent.last_payment_error?.message || 'Payment failed. Please try another card.';

    const updated = await Payment.updateById(payment.id, {
      status: 'failed',
      failureMessage,
      meta: { ...payment.meta, intentStatus: intent.status, lastEventId: eventId },
    });

    // Booking stays 'draft' so the customer can fix their card and retry —
    // createPaymentIntentForBooking will hand back a fresh intent.
    await Booking.updateById(payment.bookingId, { paymentStatus: 'failed' });

    logger.warn(`[PAYMENT SVC] Payment ${payment.id} FAILED: ${failureMessage}`);
    return { payment: updated, order: null, paymentStatus: 'failed' };
  }

  async _applyCancelled(intent, eventId = null) {
    const payment = await Payment.findByIntentId(intent.id);
    if (!payment) return { ignored: true };
    if (payment.status === 'succeeded') {
      return { payment, order: null, paymentStatus: 'succeeded' };
    }

    const updated = await Payment.updateById(payment.id, {
      status: 'cancelled',
      meta: { ...payment.meta, intentStatus: intent.status, lastEventId: eventId },
    });
    await Booking.updateById(payment.bookingId, { paymentStatus: 'cancelled' });

    logger.warn(`[PAYMENT SVC] Payment ${payment.id} CANCELLED`);
    return { payment: updated, order: null, paymentStatus: 'cancelled' };
  }

  /**
   * `charge.refunded` fires both for dashboard refunds and for our own
   * refundPayment() call, so this must stay idempotent.
   */
  async _applyRefunded(charge, eventId = null) {
    const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!intentId) return { ignored: true };

    const payment = await Payment.findByIntentId(intentId);
    if (!payment) {
      logger.warn(`[PAYMENT SVC] Refund for unknown intent ${intentId}`);
      return { ignored: true };
    }

    const refundedAmount = fromMinorUnits(charge.amount_refunded || 0);
    const fullyRefunded = Boolean(charge.refunded) || refundedAmount >= payment.amount;

    const updated = await Payment.updateById(payment.id, {
      status: fullyRefunded ? 'refunded' : payment.status,
      refundedAmount,
      refundedAt: new Date().toISOString(),
      meta: { ...payment.meta, lastEventId: eventId },
    });

    // A refund can only follow a success, so the non-full case is 'succeeded'.
    await Booking.updateById(payment.bookingId, {
      paymentStatus: fullyRefunded ? 'refunded' : 'succeeded',
    });

    if (payment.orderId) {
      await Order.updateById(payment.orderId, {
        paymentStatus: fullyRefunded ? 'refunded' : 'succeeded',
      });
    }

    logger.success(
      `[PAYMENT SVC] Payment ${payment.id} refunded £${refundedAmount} (full=${fullyRefunded})`
    );
    return { payment: updated, order: null, paymentStatus: updated.status };
  }

  /**
   * Payment state for a booking — what the app polls after the sheet closes
   * if it would rather not call /confirm.
   */
  async getBookingPaymentStatus(bookingId, authUserId) {
    logger.info(`[PAYMENT SVC] status booking=${bookingId}`);

    const booking = await Booking.findById(bookingId);
    if (!booking) throw badRequest('Booking not found', 404);
    if (authUserId && String(booking.userId) !== String(authUserId)) {
      throw badRequest('You do not have permission to access this booking', 403);
    }

    const payment = await Payment.findLatestByBookingId(bookingId);
    const orderUuid = booking.convertedOrderId || payment?.orderId || null;
    const order = orderUuid ? await Order.findById(orderUuid) : null;

    return {
      bookingId,
      bookingStatus: booking.status,
      paymentStatus: payment?.status || booking.paymentStatus || 'unpaid',
      isPaid: payment?.status === 'succeeded',
      amount: payment?.amount ?? booking.calculatedPrice ?? null,
      currency: payment?.currency || CURRENCY,
      paidAt: payment?.paidAt || booking.paidAt || null,
      receiptUrl: payment?.receiptUrl || null,
      failureMessage: payment?.failureMessage || null,
      paymentIntentId: payment?.paymentIntentId || null,
      order: order ? formatOrder(order) : null,
    };
  }

  // ——— Admin ———

  async listPayments(filter = {}, limit = 100) {
    logger.info(`[PAYMENT SVC] listPayments filter=${JSON.stringify(filter)}`);
    return Payment.findMany(filter, limit);
  }

  async getPaymentById(paymentId) {
    const payment = await Payment.findById(paymentId);
    if (!payment) throw badRequest('Payment not found', 404);
    return payment;
  }

  /**
   * Admin refund. Partial refunds are allowed (e.g. a cancellation fee is
   * retained); the `charge.refunded` webhook then confirms the final numbers.
   */
  async refundPayment(paymentId, { amount = null, reason = null } = {}) {
    logger.info(`[PAYMENT SVC] refund payment=${paymentId} amount=${amount ?? 'full'}`);

    const payment = await Payment.findById(paymentId);
    if (!payment) throw badRequest('Payment not found', 404);
    if (payment.status !== 'succeeded' && payment.status !== 'refunded') {
      throw badRequest(`Only succeeded payments can be refunded (this one is '${payment.status}')`);
    }

    const alreadyRefunded = payment.refundedAmount || 0;
    const refundableAmount = payment.amount - alreadyRefunded;
    if (refundableAmount <= 0) {
      throw badRequest('This payment has already been fully refunded', 409);
    }

    const refundAmount = amount != null ? Number(amount) : refundableAmount;
    if (refundAmount <= 0 || refundAmount > refundableAmount) {
      throw badRequest(`Refund amount must be between £0.01 and £${refundableAmount}`);
    }

    const stripe = getStripe();
    const refund = await stripe.refunds.create(
      {
        payment_intent: payment.paymentIntentId,
        amount: toMinorUnits(refundAmount),
        // Stripe only accepts a fixed set of reasons; free text goes in metadata.
        metadata: { reason: reason || 'admin_refund', paymentId: String(paymentId) },
      },
      { idempotencyKey: `yw-refund-${paymentId}-${toMinorUnits(refundAmount)}` }
    );

    const totalRefunded = alreadyRefunded + refundAmount;
    const fullyRefunded = totalRefunded >= payment.amount;

    const updated = await Payment.updateById(paymentId, {
      status: fullyRefunded ? 'refunded' : payment.status,
      refundedAmount: totalRefunded,
      refundedAt: new Date().toISOString(),
      meta: { ...payment.meta, lastRefundId: refund.id, refundReason: reason || null },
    });

    await Booking.updateById(payment.bookingId, {
      paymentStatus: fullyRefunded ? 'refunded' : 'succeeded',
    });

    if (payment.orderId) {
      await Order.updateById(payment.orderId, {
        paymentStatus: fullyRefunded ? 'refunded' : 'succeeded',
      });
    }

    logger.success(
      `[PAYMENT SVC] Refunded £${refundAmount} on payment ${paymentId} (total £${totalRefunded})`
    );
    return { payment: updated, refundId: refund.id, refundedAmount: refundAmount };
  }
}

module.exports = new PaymentService();
