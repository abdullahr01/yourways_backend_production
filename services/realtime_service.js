const supabase = require('../config/database');
const logger = require('../utils/logger');

/**
 * Supabase Realtime broadcast wrapper (KB Section 16 "Realtime System").
 *
 * Instead of exposing the database directly to clients (which would require
 * Row Level Security rules keyed off a Supabase Auth JWT we don't issue,
 * since this backend uses its own custom JWT), the backend pushes lightweight
 * "broadcast" messages over public Supabase Realtime channels whenever
 * something changes. The Flutter apps / Next.js admin panel subscribe
 * directly to these channels using the Supabase anon key — no extra polling,
 * no extra backend endpoints needed for live updates.
 *
 * Channel naming convention (frontend should subscribe to these):
 *   - `driver-<driverId>`  event `location` -> { driverId, latitude, longitude, updatedAt }
 *   - `driver-<driverId>`  event `status`   -> { driverId, isOnline }
 *   - `order-<orderUuid>`  event `update`   -> { orderId, status, driverId, updatedAt }
 *
 * Example (Flutter/Dart or JS client):
 *   supabase.channel('order-<uuid>')
 *     .onBroadcast(event: 'update', callback: (payload) => ...)
 *     .subscribe();
 *
 * All sends are best-effort/non-blocking: a Realtime hiccup must never fail
 * the underlying API request (location update, status change, etc.).
 */
class RealtimeService {
  async _send(channelName, event, payload) {
    const channel = supabase.channel(channelName);
    try {
      // httpSend() always uses the REST API (no websocket/subscribe needed) —
      // the correct method for one-off server-side broadcasts.
      const result = await channel.httpSend(event, payload);
      if (result?.success === false) {
        logger.warn(`[REALTIME] ${channelName}/${event} send failed status=${result.status} error=${result.error}`);
      } else {
        logger.debug(`[REALTIME] Broadcast sent ${channelName}/${event}`);
      }
    } catch (err) {
      logger.warn(`[REALTIME] Broadcast ${channelName}/${event} failed (non-blocking): ${err.message}`);
    } finally {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  /** Live driver GPS position, for the customer tracking map + admin live map. */
  async broadcastDriverLocation(driverId, location) {
    if (!driverId) return;
    return this._send(`driver-${driverId}`, 'location', {
      driverId,
      latitude: location.latitude,
      longitude: location.longitude,
      updatedAt: location.updatedAt || new Date().toISOString(),
    });
  }

  /** Driver online/offline availability change, for admin live monitoring. */
  async broadcastDriverStatus(driverId, isOnline) {
    if (!driverId) return;
    return this._send(`driver-${driverId}`, 'status', { driverId, isOnline });
  }

  /** Order status/detail change, for the customer tracking screen + admin dashboard. */
  async broadcastOrderUpdate(order) {
    if (!order) return;
    const orderUuid = order._id || order.id;
    if (!orderUuid) return;
    return this._send(`order-${orderUuid}`, 'update', {
      orderId: order.orderId,
      status: order.status,
      driverId: order.driverId || null,
      updatedAt: order.updatedAt || new Date().toISOString(),
    });
  }
}

module.exports = new RealtimeService();
