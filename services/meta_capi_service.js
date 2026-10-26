const crypto = require('crypto');
const MetaCapiEvent = require('../models/meta_capi_event_model');
const logger = require('../utils/logger');

const configuredVersion = process.env.META_GRAPH_API_VERSION || 'v26.0';
const API_VERSION = /^v\d+\.\d+$/.test(configuredVersion) ? configuredVersion : 'v26.0';
const EVENT_SOURCE_URLS = {
  Lead: 'https://yourwaycouriers.co.uk/book',
  Purchase: 'https://yourwaycouriers.co.uk/book/quote',
};

const isConfigured = () => Boolean(process.env.META_CAPI_ACCESS_TOKEN && process.env.META_PIXEL_ID);

const isEnabled = () =>
  isConfigured() &&
  (process.env.NODE_ENV === 'production' || Boolean(process.env.META_CAPI_TEST_EVENT_CODE));

const captureContext = (context = {}) => {
  if (!isEnabled() || context.marketingConsent !== 'all') {
    return {};
  }
  return {
    marketingConsent: 'all',
    fbp: typeof context.fbp === 'string' ? context.fbp.slice(0, 500) : null,
    fbc: typeof context.fbc === 'string' ? context.fbc.slice(0, 500) : null,
    ip: typeof context.ip === 'string' ? context.ip.slice(0, 64) : null,
    userAgent: typeof context.userAgent === 'string' ? context.userAgent.slice(0, 1000) : null,
  };
};

const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

const normalizePhone = (value) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  // YourWays serves the UK. Convert a local UK number to its country-code form.
  if (digits.startsWith('0')) digits = `44${digits.slice(1)}`;
  else if (digits.startsWith('44')) digits = `44${digits.slice(2).replace(/^0+/, '')}`;
  return digits;
};

const buildUserData = ({ email, phone, context = {} }) => {
  const userData = {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  if (normalizedEmail) userData.em = [sha256(normalizedEmail)];
  if (normalizedPhone) userData.ph = [sha256(normalizedPhone)];
  if (context.ip) userData.client_ip_address = context.ip;
  if (context.userAgent) userData.client_user_agent = context.userAgent;
  if (context.fbp) userData.fbp = context.fbp;
  if (context.fbc) userData.fbc = context.fbc;
  return userData;
};

const buildPayload = ({ eventName, eventId, email, phone, context, eventTime, value }) => {
  const event = {
    event_name: eventName,
    event_time: Math.floor(new Date(eventTime || Date.now()).getTime() / 1000),
    event_id: eventId,
    action_source: 'website',
    event_source_url: EVENT_SOURCE_URLS[eventName],
    user_data: buildUserData({ email, phone, context }),
  };
  if (eventName === 'Purchase') {
    event.custom_data = { value: Number(value), currency: 'GBP' };
  }
  return {
    data: [event],
    ...(process.env.META_CAPI_TEST_EVENT_CODE
      ? { test_event_code: process.env.META_CAPI_TEST_EVENT_CODE }
      : {}),
  };
};

const enqueue = async (event) => {
  if (!isEnabled() || event.context?.marketingConsent !== 'all') return false;
  const payload = buildPayload(event);
  try {
    await MetaCapiEvent.enqueue({ eventId: event.eventId, eventName: event.eventName, payload });
    // Dispatch asynchronously. Event delivery must not delay or fail the
    // booking/payment request; the durable outbox retries Meta failures.
    setImmediate(() => dispatchDue().catch((err) => {
      logger.warn(`[META CAPI] Background dispatch skipped: ${err.code || 'queue_error'}`);
    }));
    return true;
  } catch (err) {
    logger.warn(`[META CAPI] Could not queue ${event.eventName} event: ${err.code || 'queue_error'}`);
    return false;
  }
};

const send = async (row) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const url = new URL(`https://graph.facebook.com/${API_VERSION}/${process.env.META_PIXEL_ID}/events`);
  url.searchParams.set('access_token', process.env.META_CAPI_ACCESS_TOKEN);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(row.payload),
      signal: controller.signal,
    });
    let result;
    try {
      result = await response.json();
    } catch {
      result = {};
    }
    if (!response.ok || result.error || result.events_received === 0) {
      const errorCode = result.error?.code || `http_${response.status}`;
      await MetaCapiEvent.markFailed(row, errorCode);
      logger.warn(`[META CAPI] ${row.event_name} event ${row.event_id} rejected (${errorCode})`);
      return;
    }
    await MetaCapiEvent.markSent(row.id);
    logger.info(`[META CAPI] ${row.event_name} event ${row.event_id} accepted`);
  } catch (err) {
    const errorCode = err.name === 'AbortError' ? 'timeout' : err.code || 'network_error';
    await MetaCapiEvent.markFailed(row, errorCode);
    logger.warn(`[META CAPI] ${row.event_name} event ${row.event_id} send failed (${errorCode})`);
  } finally {
    clearTimeout(timeout);
  }
};

let dispatchInFlight = false;
const dispatchDue = async () => {
  if (!isEnabled() || dispatchInFlight) return;
  dispatchInFlight = true;
  try {
    const rows = await MetaCapiEvent.claimDue(10);
    for (const row of rows) await send(row);
  } finally {
    dispatchInFlight = false;
  }
};

const enqueueLead = (booking, context) => enqueue({
  eventName: 'Lead',
  eventId: `lead_${booking.id}`,
  eventTime: booking.createdAt,
  email: booking.email,
  phone: booking.mobileNumber,
  context,
});

const enqueuePurchase = (paymentIntentId, amount, paidAt, booking, context) => enqueue({
  eventName: 'Purchase',
  eventId: `purchase_${paymentIntentId}`,
  eventTime: paidAt,
  value: Number(amount),
  email: booking?.email,
  phone: booking?.mobileNumber,
  context,
});

module.exports = { isConfigured, isEnabled, captureContext, enqueueLead, enqueuePurchase, dispatchDue };
