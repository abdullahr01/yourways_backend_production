const Driver = require('../models/driver_model');
const Order = require('../models/order_model');
const logger = require('../utils/logger');
const {
  SIGNED_URL_TTL_SECONDS,
  isPrivateStorageKey,
  signKeys,
} = require('../config/storage');

/**
 * Read-side of images.
 *
 * Uploading still goes through POST /api/uploads/*. These endpoints exist so
 * the apps can load pictures without scraping them out of a driver or order
 * payload — admin driver list, customer tracking/history, driver job history.
 *
 * Driver photos are public URLs and come back as-is. Proof-of-delivery lives
 * in a private bucket, so this service signs those keys the same way
 * middleware/signStorageUrls.js does on order reads. The frontend only ever
 * sees a `url` it can put in <img src>.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const IMAGE_KINDS = ['driverPhoto', 'pickup', 'delivery', 'pickupSignature', 'deliverySignature'];

const httpError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const authIdOf = (auth) => (auth ? auth.id || auth._id || null : null);

const expiresAtFromNow = () =>
  new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

/** `{ url, expiresAt }` — expiresAt is null for public/permanent URLs. */
const display = (value, signed) => {
  if (!value) return null;
  if (isPrivateStorageKey(value)) {
    const url = signed.get(value) || null;
    return url ? { url, expiresAt: expiresAtFromNow() } : null;
  }
  if (typeof value === 'string' && value.startsWith('http')) {
    return { url: value, expiresAt: null };
  }
  return null;
};

const displayList = (values, signed) =>
  (values || []).map((value) => display(value, signed)).filter(Boolean);

const collectProofKeys = (order) =>
  [
    ...(order.pickupPhotos || []),
    ...(order.deliveryPhotos || []),
    order.pickupSignature,
    order.deliverySignature,
  ].filter(isPrivateStorageKey);

/**
 * Proof photos are pictures of people's homes. Only the customer who owns the
 * order, the assigned driver, or an admin may read them.
 */
const assertCanViewOrderImages = (order, auth) => {
  if (!auth) {
    throw httpError('Authentication required', 401);
  }
  if (auth.role === 'admin') return;

  const authId = authIdOf(auth);
  if (auth.role === 'user' && String(order.userId) === String(authId)) return;
  if (auth.role === 'driver' && String(order.driverId) === String(authId)) return;

  throw httpError('You do not have permission to view these images', 403);
};

const formatDriverPhoto = (driver) => ({
  driverId: driver.id || driver._id,
  name: driver.name || null,
  hasPhoto: Boolean(driver.profilePictureUrl),
  photo: display(driver.profilePictureUrl, new Map()),
});

const formatOrderImages = (order, signed, kind = null) => {
  const include = (name) => !kind || kind === name;
  const payload = {
    orderId: order.orderId,
    orderUuid: order._id,
    status: order.status,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
  };

  if (include('driverPhoto')) {
    payload.driverPhoto = display(order.driver?.profilePictureUrl || order.driver?.photoUrl, signed);
  }
  if (include('pickup')) payload.pickupPhotos = displayList(order.pickupPhotos, signed);
  if (include('delivery')) payload.deliveryPhotos = displayList(order.deliveryPhotos, signed);
  if (include('pickupSignature')) {
    payload.pickupSignature = display(order.pickupSignature, signed);
  }
  if (include('deliverySignature')) {
    payload.deliverySignature = display(order.deliverySignature, signed);
  }
  return payload;
};

const signOrders = async (orders) => {
  const keys = orders.flatMap(collectProofKeys);
  return signKeys(keys);
};

class ImageService {
  async getDriverPhoto(driverId) {
    logger.info(`[IMAGE SVC] getDriverPhoto id=${driverId}`);
    if (!driverId || !UUID_RE.test(driverId)) {
      throw httpError('Invalid driver id');
    }
    const driver = await Driver.findById(driverId);
    if (!driver) throw httpError('Driver not found', 404);
    return formatDriverPhoto(driver);
  }

  async listDriverPhotos() {
    logger.info('[IMAGE SVC] listDriverPhotos');
    const drivers = await Driver.findAll();
    return {
      count: drivers.length,
      drivers: drivers.map(formatDriverPhoto),
    };
  }

  async getOrderImages(orderId, { auth, kind = null } = {}) {
    logger.info(`[IMAGE SVC] getOrderImages order=${orderId} kind=${kind || 'all'}`);
    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      throw httpError('Invalid order id');
    }
    if (kind && !IMAGE_KINDS.includes(kind)) {
      throw httpError(`Invalid kind "${kind}". Expected one of: ${IMAGE_KINDS.join(', ')}`);
    }

    const order = await Order.findByUuidOrCode(orderId.trim());
    if (!order) throw httpError('Order not found', 404);
    assertCanViewOrderImages(order, auth);

    const signed = await signOrders([order]);
    return formatOrderImages(order, signed, kind);
  }

  async getImagesForUserOrders(userId, { auth } = {}) {
    logger.info(`[IMAGE SVC] getImagesForUserOrders user=${userId}`);
    if (!userId || !UUID_RE.test(userId)) {
      throw httpError('Invalid user id');
    }

    const orders = await Order.findMany({ userId });
    // Ownership is also enforced by requireSelf on the route; this is the
    // service-level backup so a missed middleware cannot leak another
    // customer's home photos.
    for (const order of orders) assertCanViewOrderImages(order, auth);

    const signed = await signOrders(orders);
    return {
      userId,
      count: orders.length,
      orders: orders.map((order) => formatOrderImages(order, signed)),
    };
  }

  async getImagesForDriverOrders(driverId, { auth } = {}) {
    logger.info(`[IMAGE SVC] getImagesForDriverOrders driver=${driverId}`);
    if (!driverId || !UUID_RE.test(driverId)) {
      throw httpError('Invalid driver id');
    }

    const driver = await Driver.findById(driverId);
    if (!driver) throw httpError('Driver not found', 404);

    const orders = await Order.findMany({ driverId });
    for (const order of orders) assertCanViewOrderImages(order, auth);

    const signed = await signOrders(orders);
    return {
      driverId,
      count: orders.length,
      orders: orders.map((order) => formatOrderImages(order, signed)),
    };
  }
}

module.exports = new ImageService();
module.exports.IMAGE_KINDS = IMAGE_KINDS;
