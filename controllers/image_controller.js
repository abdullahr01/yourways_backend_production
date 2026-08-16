const ImageService = require('../services/image_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class ImageController {
  /**
   * GET /api/images/drivers/:id
   * Permanent public URL of one driver's profile picture.
   */
  async getDriverPhoto(req, res) {
    try {
      logger.info(`[IMAGE CTRL] Driver photo: ${req.params.id}`);
      const result = await ImageService.getDriverPhoto(req.params.id);
      return successResponse(res, 200, 'Driver photo fetched successfully', result);
    } catch (err) {
      logger.error(`[IMAGE CTRL] getDriverPhoto failed: ${err.message}`);
      return errorResponse(res, err.statusCode || 404, err.message, err);
    }
  }

  /**
   * GET /api/images/drivers
   * Admin driver-management screen — every driver's photo in one call.
   */
  async listDriverPhotos(req, res) {
    try {
      logger.info('[IMAGE CTRL] List driver photos');
      const result = await ImageService.listDriverPhotos();
      return successResponse(res, 200, 'Driver photos fetched successfully', result);
    } catch (err) {
      logger.error(`[IMAGE CTRL] listDriverPhotos failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch driver photos', err);
    }
  }

  /**
   * GET /api/images/orders/:orderId
   * Driver face + pickup/delivery proof + signatures for one order.
   */
  async getOrderImages(req, res) {
    try {
      logger.info(`[IMAGE CTRL] Order images: ${req.params.orderId} kind=${req.query.kind || 'all'}`);
      const result = await ImageService.getOrderImages(req.params.orderId, {
        auth: req.auth,
        kind: req.query.kind || null,
      });
      return successResponse(res, 200, 'Order images fetched successfully', result);
    } catch (err) {
      logger.error(`[IMAGE CTRL] getOrderImages failed: ${err.message}`);
      return errorResponse(res, err.statusCode || 404, err.message, err);
    }
  }

  /**
   * GET /api/images/users/:userId/orders
   * Customer's order-history photos.
   */
  async getUserOrderImages(req, res) {
    try {
      logger.info(`[IMAGE CTRL] User order images: ${req.params.userId}`);
      const result = await ImageService.getImagesForUserOrders(req.params.userId, {
        auth: req.auth,
      });
      return successResponse(res, 200, 'Order images fetched successfully', result);
    } catch (err) {
      logger.error(`[IMAGE CTRL] getUserOrderImages failed: ${err.message}`);
      return errorResponse(res, err.statusCode || 400, err.message, err);
    }
  }

  /**
   * GET /api/images/drivers/:id/orders
   * Driver's job-history photos.
   */
  async getDriverOrderImages(req, res) {
    try {
      logger.info(`[IMAGE CTRL] Driver order images: ${req.params.id}`);
      const result = await ImageService.getImagesForDriverOrders(req.params.id, {
        auth: req.auth,
      });
      return successResponse(res, 200, 'Order images fetched successfully', result);
    } catch (err) {
      logger.error(`[IMAGE CTRL] getDriverOrderImages failed: ${err.message}`);
      return errorResponse(res, err.statusCode || 400, err.message, err);
    }
  }
}

module.exports = new ImageController();
