const DeviceToken = require('../models/device_token_model');
const logger = require('../utils/logger');

// Which app each JWT role is allowed to register from.
const APP_FOR_ROLE = { user: 'customer', driver: 'driver', admin: 'admin' };

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
}

module.exports = new NotificationService();
