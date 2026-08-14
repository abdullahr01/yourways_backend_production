const express = require('express');
const multer = require('multer');
const router = express.Router();
const UploadController = require('../controllers/upload_controller');
const { requireAuth } = require('../middleware/auth');
const { errorResponse } = require('../utils/responseHandler');
const { MAX_FILE_BYTES, ALLOWED_MIME_TYPES } = require('../config/storage');
const logger = require('../utils/logger');

logger.info('[ROUTES] Upload routes loaded (Supabase Storage)');

const MAX_FILES_PER_REQUEST = 8;

/**
 * Files are buffered in memory and forwarded to Supabase, rather than the apps
 * uploading to Supabase directly. That keeps the storage credentials in this
 * process only, keeps the rule that clients talk to our API and nothing else,
 * and gives us one place to reject non-images before they reach the bucket. The
 * cost is that the bytes make two hops instead of one — fine at a handful of
 * photos per order, worth revisiting (signed upload URLs) if volume grows.
 *
 * Worst case memory per request is MAX_FILE_BYTES × MAX_FILES_PER_REQUEST, so
 * both limits are deliberately modest.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_REQUEST },
});

const fileFields = upload.fields([
  { name: 'files', maxCount: MAX_FILES_PER_REQUEST },
  { name: 'file', maxCount: 1 },
]);

/**
 * multer rejects by throwing into its callback, which would otherwise surface as
 * an unhandled 500 with an unhelpful message. Translate its errors into the
 * same JSON shape as everything else.
 */
const receiveFiles = (req, res, next) =>
  fileFields(req, res, (err) => {
    if (!err) return next();

    logger.warn(`[UPLOAD] Rejected by multer: ${err.code || 'unknown'} ${err.message}`);

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return errorResponse(
          res,
          413,
          `Image is too large. Maximum is ${MAX_FILE_BYTES / 1048576} MB`
        );
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return errorResponse(res, 400, `Too many files. Maximum is ${MAX_FILES_PER_REQUEST}`);
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return errorResponse(
          res,
          400,
          'Unexpected form field. Send the image(s) as "files" (or "file")'
        );
      }
    }
    return errorResponse(res, 400, 'Image upload failed', err.message);
  });

// What the pickers should enforce client-side. Public: it's just limits.
router.get('/limits', UploadController.limits);

// Admin-only: only admins create or edit drivers, so only admins need to put a
// photo in the driver bucket.
router.post('/driver-photo', requireAuth('admin'), receiveFiles, UploadController.driverPhoto);

// Ownership can't be checked by requireSelf here (the order id identifies the
// job, not the caller), so UploadService verifies the order is assigned to this
// driver before writing anything. Same pattern as payments and bookings.
router.post(
  '/order-proof/:orderId',
  requireAuth(['driver', 'admin']),
  receiveFiles,
  UploadController.orderProof
);

logger.info(
  `[ROUTES] Uploads accept ${ALLOWED_MIME_TYPES.join(', ')} up to ${
    MAX_FILE_BYTES / 1048576
  } MB, ${MAX_FILES_PER_REQUEST} per request`
);

module.exports = router;
