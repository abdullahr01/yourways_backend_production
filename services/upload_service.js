const Order = require('../models/order_model');
const logger = require('../utils/logger');
const {
  BUCKETS,
  MAX_FILE_BYTES,
  ALLOWED_MIME_TYPES,
  sniffImageMime,
  extensionForMime,
  randomSuffix,
  uploadBuffer,
  publicUrl,
  signKeys,
} = require('../config/storage');

/**
 * Image uploads.
 *
 * These endpoints are deliberately purpose-scoped rather than one generic
 * "upload anything" route: a generic uploader open to every logged-in account
 * is free file hosting for anyone who can register, and nothing stops them
 * filling the storage quota. Each function below knows what it is for, who is
 * allowed to call it, and where the bytes belong.
 *
 * Uploading and *using* an image are separate steps on purpose. This service
 * only moves bytes and hands back a reference; ownership is established when a
 * caller saves that reference onto a row — the admin into
 * drivers.profile_picture_url, the driver into orders.pickup_photos /
 * delivery_photos. That is why no "images" table is needed: the order row
 * already records which photos belong to which order, and the existing
 * ownership guards on the order endpoints already decide who may read them.
 */

// Two things that must line up for a signature to be worth anything in a
// dispute: it belongs to one order, and it was captured at delivery time.
const PROOF_KINDS = {
  pickup: { folder: 'pickup', multiple: true },
  delivery: { folder: 'delivery', multiple: true },
  pickupSignature: { folder: 'signature-pickup', multiple: false },
  deliverySignature: { folder: 'signature-delivery', multiple: false },
};

const badRequest = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * A file is only accepted if its actual bytes are a JPEG/PNG/WebP. The declared
 * Content-Type is used for nothing except the error message, because the client
 * chooses it freely.
 */
const validateImage = (file) => {
  if (!file?.buffer?.length) {
    throw badRequest('No image file received');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw badRequest(
      `Image is too large (${(file.size / 1048576).toFixed(1)} MB). Maximum is ${
        MAX_FILE_BYTES / 1048576
      } MB`,
      413
    );
  }

  const detected = sniffImageMime(file.buffer);
  if (!detected || !ALLOWED_MIME_TYPES.includes(detected)) {
    throw badRequest(
      `Unsupported file type${
        file.mimetype ? ` (sent as ${file.mimetype})` : ''
      }. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`
    );
  }

  return detected;
};

// Order ids are UUIDs. Checking the shape keeps a crafted id from escaping its
// folder via `..` before it ever reaches the storage API.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class UploadService {
  /**
   * Driver profile photo. Admin-only, because admins are the only ones who
   * create or edit drivers.
   *
   * Lands in the PUBLIC bucket and returns a permanent URL, which is what the
   * caller passes straight into POST /api/admin/drivers as profilePictureUrl.
   * The photo is uploaded before the driver row exists, so a brand new upload
   * has no driver id to file itself under and goes to `pending/`.
   */
  async uploadDriverPhoto(file, { driverId = null } = {}) {
    logger.info(`[UPLOAD SVC] Driver photo (driverId=${driverId || 'pending'})`);

    const contentType = validateImage(file);
    const ext = extensionForMime(contentType);

    if (driverId && !UUID_RE.test(driverId)) {
      throw badRequest('Invalid driverId');
    }

    const folder = driverId || 'pending';
    const path = `${folder}/${Date.now()}-${randomSuffix()}.${ext}`;

    const key = await uploadBuffer({
      bucket: BUCKETS.DRIVER_PHOTOS,
      path,
      buffer: file.buffer,
      contentType,
    });

    const url = publicUrl(BUCKETS.DRIVER_PHOTOS, path);
    logger.success(`[UPLOAD SVC] Driver photo ready → ${url}`);

    return { url, storageKey: key, contentType, bytes: file.size };
  }

  /**
   * Proof of pickup/delivery. Only the driver the order is assigned to may add
   * proof to it (admins may too, for support cases) — otherwise any logged-in
   * driver could write photos into another driver's job folder.
   *
   * Lands in the PRIVATE bucket, so what comes back is a storage key to be
   * stored on the order, plus a short-lived `previewUrl` so the driver app can
   * show a thumbnail straight away. The keys are then submitted to the existing
   * complete-pickup / complete-delivery endpoints.
   */
  async uploadOrderProof(files, { orderId, kind, authId, role }) {
    logger.info(
      `[UPLOAD SVC] Order proof order=${orderId} kind=${kind} by=${role}:${authId} count=${files?.length || 0}`
    );

    const spec = PROOF_KINDS[kind];
    if (!spec) {
      throw badRequest(
        `Invalid kind "${kind}". Expected one of: ${Object.keys(PROOF_KINDS).join(', ')}`
      );
    }
    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      throw badRequest('Invalid orderId');
    }

    const order = await Order.findByUuidOrCode(orderId.trim());
    if (!order) {
      throw badRequest('Order not found', 404);
    }
    // Storage folders are always the row UUID, even if the client sent ORD-…
    const orderUuid = order._id;

    if (!files?.length) {
      throw badRequest(
        'No image file received. Send multipart/form-data with the image in the "files" field (also accepts: file, photos, photo, image, images)'
      );
    }
    if (!spec.multiple && files.length > 1) {
      throw badRequest(`Only one file may be uploaded for kind "${kind}"`);
    }

    if (role !== 'admin' && order.driverId !== authId) {
      logger.warn(
        `[UPLOAD SVC] Proof upload denied: order ${orderUuid} belongs to driver ${order.driverId}, caller is ${authId}`
      );
      throw badRequest('This order is not assigned to you', 403);
    }

    const keys = [];
    for (const [index, file] of files.entries()) {
      const contentType = validateImage(file);
      const ext = extensionForMime(contentType);
      const path = `${orderUuid}/${spec.folder}/${Date.now()}-${index}-${randomSuffix()}.${ext}`;

      keys.push(
        await uploadBuffer({
          bucket: BUCKETS.ORDER_PROOFS,
          path,
          buffer: file.buffer,
          contentType,
        })
      );
    }

    const signed = await signKeys(keys);
    logger.success(`[UPLOAD SVC] Stored ${keys.length} proof file(s) for order ${order.orderId}`);

    return {
      orderId: order.orderId,
      orderUuid,
      kind,
      // What the driver app must send back to complete-pickup/complete-delivery.
      storageKeys: keys,
      files: keys.map((key) => ({ storageKey: key, previewUrl: signed.get(key) || null })),
    };
  }
}

module.exports = new UploadService();
