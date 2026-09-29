const DeviceToken = require('../models/device_token_model');
const Notification = require('../models/notification_model');
const firebase = require('../config/firebase');
const logger = require('../utils/logger');

// Which app each JWT role is allowed to register from.
const APP_FOR_ROLE = { user: 'customer', driver: 'driver', admin: 'admin' };

// Must match the channel the Flutter apps create on Android.
const ANDROID_CHANNEL_ID = 'order_updates';

// FCM error codes meaning the token will never work again (app uninstalled,
// token rotated). Anything else — quota, network, server — is transient and
// the token is kept.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

// sendEachForMulticast accepts at most 500 tokens per call.
const MAX_TOKENS_PER_SEND = 500;

const orderCodeOf = (order) => order?.orderId || order?.id || '';

const vehicleOf = (driver) =>
  [driver?.vehicleType, driver?.vehicleNumber].filter(Boolean).join(', ');

const placeOf = (postcode, location) => postcode || location || 'address on the job';

/**
 * Wording and recipient for each order event. `recipient` returns who gets
 * it; `dedupe` is the part of the key that makes it "once only".
 */
const ORDER_EVENTS = {
  driver_assigned: {
    recipient: (order) => ({ type: 'user', id: order.userId }),
    // Includes the driver so a re-assignment to someone else notifies again.
    dedupe: (order, driver) => `${order._id}:driver_assigned:${driver?.id || order.driverId}:user:${order.userId}`,
    title: () => 'Driver assigned',
    body: (order, driver) => {
      const name = driver?.name || 'A driver';
      const vehicle = vehicleOf(driver);
      return `${name}${vehicle ? ` (${vehicle})` : ''} will handle your order ${orderCodeOf(order)}.`;
    },
  },
  new_job: {
    recipient: (order, driver) => ({ type: 'driver', id: driver?.id || order.driverId }),
    dedupe: (order, driver) => `${order._id}:new_job:driver:${driver?.id || order.driverId}`,
    title: () => 'New job assigned',
    body: (order) =>
      `${placeOf(order.pickupPostcode, order.pickupLocation)} → ${placeOf(order.deliveryPostcode, order.deliveryLocation)} · ${orderCodeOf(order)}`,
  },
  arrived_pickup: {
    recipient: (order) => ({ type: 'user', id: order.userId }),
    dedupe: (order) => `${order._id}:arrived_pickup:user:${order.userId}`,
    title: () => 'Your driver has arrived',
    body: (order) => `Your driver is at the pickup address for order ${orderCodeOf(order)}.`,
  },
  pickup_completed: {
    recipient: (order) => ({ type: 'user', id: order.userId }),
    dedupe: (order) => `${order._id}:pickup_completed:user:${order.userId}`,
    title: () => 'Items collected',
    body: (order) => `Your items for order ${orderCodeOf(order)} have been collected. Tap to see the photos.`,
  },
  arrived_dropoff: {
    recipient: (order) => ({ type: 'user', id: order.userId }),
    dedupe: (order) => `${order._id}:arrived_dropoff:user:${order.userId}`,
    title: () => 'Your driver has arrived',
    body: (order) => `Your driver is at the delivery address for order ${orderCodeOf(order)}.`,
  },
  delivered: {
    recipient: (order) => ({ type: 'user', id: order.userId }),
    dedupe: (order) => `${order._id}:delivered:user:${order.userId}`,
    title: () => 'Delivered',
    body: (order) => `Order ${orderCodeOf(order)} has been delivered. Thank you for choosing YourWays!`,
  },
};

const errorText = (err) => err?.code ? `${err.code}: ${err.message}` : (err?.message || String(err));

// FCM registration tokens are ~150–200 chars; anything far outside that is
// a client bug (e.g. sending the JWT instead).
const MIN_TOKEN_LENGTH = 20;
const MAX_TOKEN_LENGTH = 4096;

const badRequest = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const ownerFromAuth = (auth) => ({
  ownerType: auth?.role || 'user',
  ownerId: auth?.id || auth?._id,
});

class NotificationService {
  async registerDeviceToken(auth, { token, platform, app } = {}) {
    const { ownerType, ownerId } = ownerFromAuth(auth);

    if (typeof token !== 'string' || token.trim().length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
      throw badRequest('token must be the FCM registration token from the app');
    }
    if (!DeviceToken.PLATFORMS.includes(platform)) {
      throw badRequest(`platform must be one of: ${DeviceToken.PLATFORMS.join(', ')}`);
    }
    if (!DeviceToken.APPS.includes(app)) {
      throw badRequest(`app must be one of: ${DeviceToken.APPS.join(', ')}`);
    }
    if (APP_FOR_ROLE[ownerType] !== app) {
      throw badRequest(
        `A ${ownerType} login can only register from the ${APP_FOR_ROLE[ownerType]} app (got app=${app})`,
        403
      );
    }

    const row = await DeviceToken.upsert({ token: token.trim(), ownerType, ownerId, platform, app });
    logger.success(`[NOTIFICATION SVC] Device registered ${ownerType}:${ownerId} ${platform}/${app}`);
    return { registered: true, platform: row.platform, app: row.app };
  }

  async removeDeviceToken(auth, { token } = {}) {
    const { ownerType, ownerId } = ownerFromAuth(auth);
    if (typeof token !== 'string' || !token.trim()) {
      throw badRequest('token is required');
    }
    const removed = await DeviceToken.removeForOwner(token.trim(), ownerType, ownerId);
    return { removed };
  }

  /**
   * Push for an order event (see ORDER_EVENTS). Safe to call from any order
   * flow: it never throws, so a push problem can't fail the action itself.
   * Pass `driver` when the order row may not carry the joined driver yet.
   */
  async notifyOrderEvent(type, order, { driver } = {}) {
    try {
      const event = ORDER_EVENTS[type];
      if (!event) throw new Error(`Unknown notification type "${type}"`);
      if (!order?._id) throw new Error('order is required');

      const assignedDriver = driver || (order.driver?.name ? { ...order.driver, id: order.driverId } : null);
      const recipient = event.recipient(order, assignedDriver);
      if (!recipient.id) {
        logger.info(`[NOTIFICATION SVC] ${type} for ${orderCodeOf(order)} skipped — no ${recipient.type} on the order`);
        return { status: 'skipped', reason: `no ${recipient.type}` };
      }

      return await this.sendToRecipient({
        recipientType: recipient.type,
        recipientId: recipient.id,
        orderId: order._id,
        type,
        dedupeKey: event.dedupe(order, assignedDriver),
        title: event.title(order, assignedDriver),
        body: event.body(order, assignedDriver),
        data: {
          type,
          orderUuid: order._id,
          orderCode: orderCodeOf(order),
          status: order.status || '',
        },
      });
    } catch (err) {
      logger.error(`[NOTIFICATION SVC] ${type} for ${orderCodeOf(order) || '?'} failed: ${errorText(err)}`);
      return { status: 'failed', reason: errorText(err) };
    }
  }

  /**
   * Claim the dedupe slot, send to every device the recipient has, clean up
   * dead tokens and log the outcome. Never throws.
   * Returns { status: sent|failed|skipped|duplicate, ... }.
   */
  async sendToRecipient({ recipientType, recipientId, orderId = null, type, dedupeKey = null, title, body, data = {}, dryRun = false }) {
    const label = `${type} → ${recipientType}:${recipientId}`;
    let claimed = null;
    try {
      claimed = await Notification.claim({ recipientType, recipientId, orderId, type, dedupeKey, title, body, data });
      if (!claimed) return { status: 'duplicate' };

      if (!firebase.isConfigured()) {
        await Notification.markResult(claimed.id, { status: 'skipped', error: 'FCM not configured (FIREBASE_SERVICE_ACCOUNT missing)' });
        logger.warn(`[NOTIFICATION SVC] ${label} skipped — FCM not configured`);
        return { status: 'skipped', reason: 'fcm not configured', notificationId: claimed.id };
      }

      const devices = await DeviceToken.findByOwner(recipientType, recipientId);
      const tokens = [...new Set(devices.map((d) => d.token))];
      if (!tokens.length) {
        await Notification.markResult(claimed.id, { status: 'skipped', error: 'recipient has no registered devices' });
        logger.info(`[NOTIFICATION SVC] ${label} skipped — no registered devices`);
        return { status: 'skipped', reason: 'no devices', notificationId: claimed.id };
      }

      const { succeeded, deadTokens, firstError } = await this._sendToTokens(tokens, { title, body, data }, dryRun);

      if (deadTokens.length) {
        try {
          await DeviceToken.removeTokens(deadTokens);
        } catch (cleanupErr) {
          logger.warn(`[NOTIFICATION SVC] Dead-token cleanup failed: ${errorText(cleanupErr)}`);
        }
      }

      const status = succeeded > 0 ? 'sent' : 'failed';
      await Notification.markResult(claimed.id, {
        status,
        tokensTargeted: tokens.length,
        tokensSucceeded: succeeded,
        error: status === 'failed' ? firstError : null,
      });

      const note = dryRun ? ' (dry run)' : '';
      if (status === 'sent') logger.success(`[NOTIFICATION SVC] ${label} sent to ${succeeded}/${tokens.length} device(s)${note}`);
      else logger.warn(`[NOTIFICATION SVC] ${label} failed on all ${tokens.length} device(s)${note}: ${firstError}`);

      return {
        status,
        notificationId: claimed.id,
        tokensTargeted: tokens.length,
        tokensSucceeded: succeeded,
        deadTokensRemoved: deadTokens.length,
        dryRun,
        ...(status === 'failed' && { reason: firstError }),
      };
    } catch (err) {
      logger.error(`[NOTIFICATION SVC] ${label} error: ${errorText(err)}`);
      if (claimed) {
        await Notification.markResult(claimed.id, { status: 'failed', error: errorText(err) }).catch(() => {});
      }
      return { status: 'failed', reason: errorText(err), notificationId: claimed?.id || null };
    }
  }

  /** One FCM multicast per 500 tokens. FCM data values must be strings. */
  async _sendToTokens(tokens, { title, body, data }, dryRun) {
    const messaging = firebase.getMessaging();
    const stringData = Object.fromEntries(
      Object.entries(data || {}).map(([k, v]) => [k, v == null ? '' : String(v)])
    );

    let succeeded = 0;
    const deadTokens = [];
    let firstError = null;

    for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_SEND) {
      const batch = tokens.slice(i, i + MAX_TOKENS_PER_SEND);
      const response = await messaging.sendEachForMulticast(
        {
          tokens: batch,
          notification: { title, body },
          data: stringData,
          android: {
            priority: 'high',
            notification: { channelId: ANDROID_CHANNEL_ID, sound: 'default' },
          },
          apns: {
            headers: { 'apns-priority': '10' },
            payload: { aps: { sound: 'default' } },
          },
        },
        dryRun
      );

      succeeded += response.successCount;
      response.responses.forEach((r, idx) => {
        if (r.success) return;
        const code = r.error?.code;
        if (!firstError) firstError = errorText(r.error);
        if (DEAD_TOKEN_CODES.has(code)) deadTokens.push(batch[idx]);
      });
    }

    return { succeeded, deadTokens, firstError };
  }
}

module.exports = new NotificationService();
module.exports.ORDER_EVENT_TYPES = Object.keys(ORDER_EVENTS);
