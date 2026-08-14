const { isPrivateStorageKey, signKeys } = require('../config/storage');
const logger = require('../utils/logger');

/**
 * Turns private storage keys into short-lived signed URLs on their way out.
 *
 * Proof-of-delivery photos live in a private bucket, so what the database holds
 * is a key like `order-proofs/<orderId>/delivery/169...jpg`, which no browser
 * can render on its own. Something has to swap those for signed URLs before the
 * response leaves.
 *
 * That swap happens here, at the response boundary, rather than inside
 * formatOrder — because orders are formatted in ~20 places across the order,
 * driver, admin and payment services, and any one of them left unconverted
 * means silently broken images on that screen. Wrapping res.json instead means
 * every endpoint is covered, including ones written later.
 *
 * The walk only rewrites strings that start with a private bucket name. Public
 * URLs (driver photos) and legacy values are returned untouched, so this is safe
 * to run over every payload.
 */

const MAX_DEPTH = 10;

// Only recurse into arrays and plain objects: walking something like a Date via
// Object.values would flatten it to {}.
const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const collectKeys = (node, found, depth = 0) => {
  if (depth > MAX_DEPTH) return;

  if (typeof node === 'string') {
    if (isPrivateStorageKey(node)) found.add(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectKeys(item, found, depth + 1);
    return;
  }
  if (isPlainObject(node)) {
    for (const value of Object.values(node)) collectKeys(value, found, depth + 1);
  }
};

const applySignedUrls = (node, signed, depth = 0) => {
  if (depth > MAX_DEPTH) return node;

  if (typeof node === 'string') {
    return signed.get(node) || node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => applySignedUrls(item, signed, depth + 1));
  }
  if (isPlainObject(node)) {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = applySignedUrls(value, signed, depth + 1);
    }
    return out;
  }
  return node;
};

const signStorageUrls = (req, res, next) => {
  const sendJson = res.json.bind(res);

  res.json = (body) => {
    const found = new Set();
    collectKeys(body, found);

    if (found.size === 0) return sendJson(body);

    signKeys([...found])
      .then((signed) => {
        logger.debug(`[STORAGE] Signed ${signed.size} media URL(s) for ${req.originalUrl}`);
        return sendJson(signed.size > 0 ? applySignedUrls(body, signed) : body);
      })
      .catch((err) => {
        // A signing outage must not take the whole endpoint down: send the
        // payload with raw keys. Images fail to load, the rest of the screen
        // works. The keys alone grant no access to a private bucket.
        logger.error(`[STORAGE] Signing failed for ${req.originalUrl}: ${err.message}`);
        sendJson(body);
      });

    return res;
  };

  next();
};

module.exports = signStorageUrls;
