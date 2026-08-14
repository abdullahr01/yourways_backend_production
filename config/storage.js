const crypto = require('crypto');
const supabase = require('./database');
const logger = require('../utils/logger');

/**
 * Supabase Storage wrapper.
 *
 * Everything image-related goes through here so there is exactly one place that
 * knows bucket names, size/type limits and how a stored value is turned back
 * into something a browser can render.
 *
 * Two buckets, two very different read models (see sql/008_storage_buckets.sql):
 *
 *   driver-photos (public)  → we store the permanent public URL in the DB and
 *                             read it back verbatim. Nothing to sign.
 *   order-proofs (private)  → we store a STORAGE KEY in the DB and mint a
 *                             short-lived signed URL at response time.
 *
 * A "storage key" is `<bucket>/<objectPath>`, e.g.
 * `order-proofs/1f2e.../delivery/1699882-1.jpg`. Keeping the bucket inside the
 * string makes stored values self-describing, which is what lets
 * middleware/signStorageUrls.js recognise a private path anywhere in a response
 * payload without being told which field it came from.
 */

const BUCKETS = {
  DRIVER_PHOTOS: 'driver-photos',
  ORDER_PROOFS: 'order-proofs',
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // keep in sync with 008_storage_buckets.sql

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// An hour is long enough for a customer to browse their order history and open
// a photo, short enough that a link copied out of the network tab dies quickly.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * The Content-Type header is attacker-controlled, so we also read the file's
 * magic bytes. `image/png` on a .exe is trivial to send; a PNG header is not.
 * Returns the detected MIME type, or null if the bytes are not one of ours.
 */
const sniffImageMime = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
};

const extensionForMime = (mime) => EXTENSION_BY_MIME[mime] || 'bin';

/** `order-proofs/a/b.jpg` -> { bucket: 'order-proofs', path: 'a/b.jpg' } */
const splitKey = (key) => {
  const [bucket, ...rest] = String(key).split('/');
  return { bucket, path: rest.join('/') };
};

/**
 * Is this stored value a private object we need to sign before a client can
 * render it? Full URLs (public bucket, or rows written before storage existed)
 * are passed through untouched.
 */
const isPrivateStorageKey = (value) =>
  typeof value === 'string' &&
  !value.startsWith('http') &&
  value.startsWith(`${BUCKETS.ORDER_PROOFS}/`);

/**
 * Would this value, if saved on order `orderId`, actually point at that order's
 * own proof folder? Used before writing photo references onto an order so a
 * driver can't attach someone else's proof — or an off-site URL that the
 * customer's app would then dutifully render — to a job.
 */
const isOrderProofKeyFor = (orderId, value) =>
  typeof value === 'string' && value.startsWith(`${BUCKETS.ORDER_PROOFS}/${orderId}/`);

/** Short random segment so two uploads in the same millisecond can't collide. */
const randomSuffix = () => crypto.randomBytes(4).toString('hex');

/**
 * Uploads bytes and returns the storage key. `upsert: false` means a repeated
 * call can never silently overwrite someone else's object.
 */
const uploadBuffer = async ({ bucket, path, buffer, contentType }) => {
  logger.info(`[STORAGE] Uploading ${bucket}/${path} (${buffer.length} bytes, ${contentType})`);

  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    logger.error(`[STORAGE] Upload failed for ${bucket}/${path}: ${error.message}`);
    throw new Error(`Failed to store file: ${error.message}`);
  }

  logger.success(`[STORAGE] Stored ${bucket}/${path}`);
  return `${bucket}/${path}`;
};

/** Permanent URL. Only meaningful for public buckets. */
const publicUrl = (bucket, path) => {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
};

/**
 * Batch-signs private keys. One Supabase round trip per bucket regardless of
 * how many orders are in the response, which is why the signing middleware can
 * afford to run on list endpoints.
 *
 * Returns a Map of storage key -> signed URL. Keys that fail to sign are simply
 * absent, so callers fall back to leaving the raw value in place.
 */
const signKeys = async (keys, ttlSeconds = SIGNED_URL_TTL_SECONDS) => {
  const signed = new Map();
  const unique = [...new Set(keys)];
  if (unique.length === 0) return signed;

  const byBucket = new Map();
  for (const key of unique) {
    const { bucket, path } = splitKey(key);
    if (!path) continue;
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket).push({ key, path });
  }

  for (const [bucket, entries] of byBucket) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(entries.map((e) => e.path), ttlSeconds);

    if (error) {
      logger.error(`[STORAGE] Signing failed for ${bucket}: ${error.message}`);
      continue;
    }

    // createSignedUrls preserves input order and reports per-object errors.
    data.forEach((result, index) => {
      if (result?.signedUrl) {
        signed.set(entries[index].key, result.signedUrl);
      } else {
        logger.warn(
          `[STORAGE] No signed URL for ${entries[index].key}: ${result?.error || 'unknown'}`
        );
      }
    });
  }

  logger.debug(`[STORAGE] Signed ${signed.size}/${unique.length} object(s)`);
  return signed;
};

/**
 * Best-effort delete — used when a driver's photo is replaced. A failure here
 * only leaves an orphan file behind, so it must never break the caller.
 */
const removeByKey = async (key) => {
  try {
    const { bucket, path } = splitKey(key);
    if (!bucket || !path) return false;
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) throw new Error(error.message);
    logger.info(`[STORAGE] Removed ${key}`);
    return true;
  } catch (err) {
    logger.warn(`[STORAGE] Could not remove ${key}: ${err.message}`);
    return false;
  }
};

/**
 * Turns a public URL back into a storage key so old objects can be deleted.
 * Returns null for anything that isn't one of our public-bucket URLs.
 */
const keyFromPublicUrl = (url) => {
  if (typeof url !== 'string') return null;
  const marker = '/storage/v1/object/public/';
  const at = url.indexOf(marker);
  if (at === -1) return null;
  return decodeURIComponent(url.slice(at + marker.length).split('?')[0]) || null;
};

module.exports = {
  BUCKETS,
  MAX_FILE_BYTES,
  ALLOWED_MIME_TYPES,
  SIGNED_URL_TTL_SECONDS,
  sniffImageMime,
  extensionForMime,
  splitKey,
  isPrivateStorageKey,
  isOrderProofKeyFor,
  randomSuffix,
  uploadBuffer,
  publicUrl,
  signKeys,
  removeByKey,
  keyFromPublicUrl,
};
