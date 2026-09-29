const NotificationService = require('../services/notification_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class NotificationController {
  /**
   * Save this phone's FCM token for the logged-in user/driver/admin.
   * POST /api/notifications/device-token  body: { token, platform, app }
   */
  async registerDeviceToken(req, res) {
    try {
      logger.info(`[NOTIFICATION CTRL] === REGISTER TOKEN role=${req.auth?.role} ===`);
      const result = await NotificationService.registerDeviceToken(req.auth, req.body || {});
      return successResponse(res, 200, 'Device registered for notifications', result);
    } catch (err) {
      logger.error(`[NOTIFICATION CTRL] register failed: ${err.message}`);
      return errorResponse(res, err.statusCode || 500, 'Failed to register device', err.message);
    }
  }

  /**
   * Stop sending to this phone (logout).
   * DELETE /api/notifications/device-token  body: { token }
   */
  async removeDeviceToken(req, res) {
    try {
      logger.info(`[NOTIFICATION CTRL] === REMOVE TOKEN role=${req.auth?.role} ===`);
      const result = await NotificationService.removeDeviceToken(req.auth, req.body || {});
      return successResponse(res, 200, 'Device unregistered from notifications', result);
    } catch (err) {
      logger.error(`[NOTIFICATION CTRL] remove failed: ${err.message}`);
      return errorResponse(res, err.statusCode || 500, 'Failed to unregister device', err.message);
    }
  }

  /**
   * Admin: send a test push to a person's devices or to one raw token.
   * POST /api/notifications/test
   *   body: { recipientType, recipientId } or { token }, plus optional title, body, dryRun
   */
  async sendTest(req, res) {
    try {
      logger.info(`[NOTIFICATION CTRL] === TEST PUSH by admin ${req.auth?.id} ===`);
      const result = await NotificationService.sendTestNotification(req.body || {});
      return successResponse(res, 200, `Test notification ${result.status}`, result);
    } catch (err) {
      logger.error(`[NOTIFICATION CTRL] test push failed: ${err.message}`);
      return errorResponse(res, err.statusCode || 500, 'Failed to send test notification', err.message);
    }
  }
}

module.exports = new NotificationController();
