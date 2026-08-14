const UploadService = require('../services/upload_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { MAX_FILE_BYTES, ALLOWED_MIME_TYPES } = require('../config/storage');
const logger = require('../utils/logger');

/**
 * Accept either `files` (repeatable) or `file` (single) as the form field name,
 * so the React admin app and the Flutter driver app don't have to agree on one.
 * multer's .fields() puts them in an object keyed by field name.
 */
const collectFiles = (req) => {
  if (Array.isArray(req.files)) return req.files;
  return [...(req.files?.files || []), ...(req.files?.file || [])];
};

class UploadController {
  /**
   * Upload a driver's profile photo, then pass the returned `url` into
   * POST /api/admin/drivers as profilePictureUrl.
   * POST /api/uploads/driver-photo   multipart: file | files
   */
  async driverPhoto(req, res) {
    try {
      logger.info('[UPLOAD CTRL] === DRIVER PHOTO ===');
      const [file] = collectFiles(req);
      const { driverId } = req.body || {};

      const result = await UploadService.uploadDriverPhoto(file, { driverId: driverId || null });

      logger.success(`[UPLOAD CTRL] Driver photo stored (${result.bytes} bytes)`);
      return successResponse(res, 201, 'Image uploaded successfully', result);
    } catch (err) {
      logger.error(`[UPLOAD CTRL] driverPhoto failed: ${err.message}`);
      return errorResponse(res, err.statusCode || 400, 'Image upload failed', err.message);
    }
  }

  /**
   * Upload pickup/delivery photos or a signature for one order. Returns storage
   * keys to submit to complete-pickup / complete-delivery.
   * POST /api/uploads/order-proof/:orderId?kind=pickup   multipart: files | file
   */
  async orderProof(req, res) {
    try {
      const { orderId } = req.params;
      const kind = req.query.kind || req.body?.kind;
      logger.info(`[UPLOAD CTRL] === ORDER PROOF order=${orderId} kind=${kind} ===`);

      const result = await UploadService.uploadOrderProof(collectFiles(req), {
        orderId,
        kind,
        authId: req.auth?.id || req.auth?._id,
        role: req.auth?.role || 'driver',
      });

      logger.success(`[UPLOAD CTRL] ${result.storageKeys.length} proof file(s) stored`);
      return successResponse(res, 201, 'Images uploaded successfully', result);
    } catch (err) {
      logger.error(`[UPLOAD CTRL] orderProof failed: ${err.message}`);
      return errorResponse(res, err.statusCode || 400, 'Image upload failed', err.message);
    }
  }

  /**
   * Lets the apps show the right picker limits instead of hard-coding them and
   * drifting from the server.
   * GET /api/uploads/limits
   */
  async limits(req, res) {
    logger.info('[UPLOAD CTRL] === LIMITS ===');
    return successResponse(res, 200, 'Upload limits fetched successfully', {
      maxFileBytes: MAX_FILE_BYTES,
      maxFileMb: MAX_FILE_BYTES / 1048576,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      maxFilesPerRequest: 8,
      fieldName: 'files',
    });
  }
}

module.exports = new UploadController();
