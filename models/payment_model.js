const supabase = require('../config/database');
const logger = require('../utils/logger');
const { handleSupabase, logPayload } = require('../utils/supabaseHelper');
const { stripUndefined } = require('../utils/caseMapper');

const TABLE = 'payments';

/**
 * A payment is still "open" while Stripe hasn't reached a terminal answer —
 * these are the rows we reuse (instead of creating a second PaymentIntent)
 * when a customer taps Pay again after abandoning the sheet.
 */
const OPEN_STATUSES = ['pending', 'processing'];

const mapPayment = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    bookingId: row.booking_id,
    orderId: row.order_id,
    userId: row.user_id,
    paymentIntentId: row.stripe_payment_intent_id,
    clientSecret: row.stripe_client_secret,
    chargeId: row.stripe_charge_id,
    amount: row.amount != null ? Number(row.amount) : 0,
    amountMinor: row.amount_minor != null ? Number(row.amount_minor) : 0,
    currency: row.currency,
    status: row.status,
    paymentMethodType: row.payment_method_type,
    receiptUrl: row.receipt_url,
    failureMessage: row.failure_message,
    refundedAmount: row.refunded_amount != null ? Number(row.refunded_amount) : 0,
    paidAt: row.paid_at,
    refundedAt: row.refunded_at,
    meta: row.meta || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toDbInsert = (data) =>
  stripUndefined({
    booking_id: data.bookingId ?? data.booking_id ?? null,
    order_id: data.orderId ?? data.order_id ?? null,
    user_id: data.userId ?? data.user_id,
    stripe_payment_intent_id: data.paymentIntentId ?? data.stripe_payment_intent_id,
    stripe_client_secret: data.clientSecret ?? data.stripe_client_secret ?? null,
    stripe_charge_id: data.chargeId ?? data.stripe_charge_id ?? null,
    amount: data.amount,
    amount_minor: data.amountMinor ?? data.amount_minor,
    currency: data.currency || 'gbp',
    status: data.status || 'pending',
    payment_method_type: data.paymentMethodType ?? data.payment_method_type ?? null,
    receipt_url: data.receiptUrl ?? data.receipt_url ?? null,
    failure_message: data.failureMessage ?? data.failure_message ?? null,
    refunded_amount: data.refundedAmount ?? data.refunded_amount ?? 0,
    paid_at: data.paidAt ?? data.paid_at ?? null,
    refunded_at: data.refundedAt ?? data.refunded_at ?? null,
    meta: data.meta || {},
  });

const toDbUpdate = (data) =>
  stripUndefined({
    booking_id: data.bookingId ?? data.booking_id,
    order_id: data.orderId ?? data.order_id,
    stripe_client_secret: data.clientSecret ?? data.stripe_client_secret,
    stripe_charge_id: data.chargeId ?? data.stripe_charge_id,
    amount: data.amount,
    amount_minor: data.amountMinor ?? data.amount_minor,
    currency: data.currency,
    status: data.status,
    payment_method_type: data.paymentMethodType ?? data.payment_method_type,
    receipt_url: data.receiptUrl ?? data.receipt_url,
    failure_message: data.failureMessage ?? data.failure_message,
    refunded_amount: data.refundedAmount ?? data.refunded_amount,
    paid_at: data.paidAt ?? data.paid_at,
    refunded_at: data.refundedAt ?? data.refunded_at,
    meta: data.meta,
  });

const create = async (data) => {
  logger.info(`[PAYMENT MODEL] INSERT → ${TABLE}`);
  logPayload('payment.create', { ...data, clientSecret: '***' });
  const result = await supabase.from(TABLE).insert(toDbInsert(data)).select().single();
  const row = handleSupabase('payments.insert', result);
  logger.success(`[PAYMENT MODEL] Created payment id=${row.id} status=${row.status}`);
  return mapPayment(row);
};

const findById = async (id) => {
  logger.info(`[PAYMENT MODEL] SELECT id=${id}`);
  const result = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  const row = handleSupabase('payments.findById', result, { allowNull: true });
  return mapPayment(row);
};

const findByIntentId = async (paymentIntentId) => {
  logger.info(`[PAYMENT MODEL] SELECT intent=${paymentIntentId}`);
  const result = await supabase
    .from(TABLE)
    .select('*')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();
  const row = handleSupabase('payments.findByIntentId', result, { allowNull: true });
  return mapPayment(row);
};

const findMany = async (filter = {}, limit = 100) => {
  logger.info(`[PAYMENT MODEL] SELECT many filter=${JSON.stringify(filter)} limit=${limit}`);
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (filter.userId) query = query.eq('user_id', filter.userId);
  if (filter.bookingId) query = query.eq('booking_id', filter.bookingId);
  if (filter.orderId) query = query.eq('order_id', filter.orderId);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.statusIn) query = query.in('status', filter.statusIn);

  const result = await query;
  const rows = handleSupabase('payments.findMany', result);
  logger.info(`[PAYMENT MODEL] Found ${rows.length} payments`);
  return rows.map(mapPayment);
};

/** Newest payment for a booking, whatever its status (used for status polling). */
const findLatestByBookingId = async (bookingId) => {
  if (!bookingId) return null;
  const rows = await findMany({ bookingId }, 1);
  return rows[0] || null;
};

/**
 * The payment gate. `submitBooking` / `createOrderFromBooking` call this —
 * a booking with no succeeded payment can never become an order.
 */
const findSucceededByBookingId = async (bookingId) => {
  if (!bookingId) return null;
  const rows = await findMany({ bookingId, status: 'succeeded' }, 1);
  return rows[0] || null;
};

/** Reusable in-flight PaymentIntent for a booking, if the customer already started one. */
const findOpenByBookingId = async (bookingId) => {
  if (!bookingId) return null;
  const rows = await findMany({ bookingId, statusIn: OPEN_STATUSES }, 1);
  return rows[0] || null;
};

const updateById = async (id, data) => {
  logger.info(`[PAYMENT MODEL] UPDATE id=${id}`);
  logPayload('payment.update', data);
  const result = await supabase.from(TABLE).update(toDbUpdate(data)).eq('id', id).select().single();
  const row = handleSupabase('payments.update', result);
  logger.info(`[PAYMENT MODEL] Updated payment id=${row.id} status=${row.status}`);
  return mapPayment(row);
};

module.exports = {
  OPEN_STATUSES,
  mapPayment,
  create,
  findById,
  findByIntentId,
  findMany,
  findLatestByBookingId,
  findSucceededByBookingId,
  findOpenByBookingId,
  updateById,
};
