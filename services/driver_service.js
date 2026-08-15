const Driver = require('../models/driver_model');
const Order = require('../models/order_model');
const RealtimeService = require('./realtime_service');
const logger = require('../utils/logger');
const { formatOrder, formatOrders } = require('../utils/orderFormatter');
const { formatDriverLocation } = require('../utils/locationFormatter');
const { isOrderProofKeyFor, keyFromPublicUrl, removeByKey } = require('../config/storage');
const DRIVER_STATUS = require('../constants/driver_status');

const DRIVER_ACTIVE_STATUSES = [
  'confirmed',
  'pickupScheduled',
  'outForPickup',
  'pickupCompleted',
  'outForDropOff',
];

const MAX_PROOF_PHOTOS = 12;

/**
 * Proof references must point at this order's own folder in the private bucket
 * (what POST /api/uploads/order-proof/:orderId returns). Without this check a
 * driver could attach another order's photos, or an off-site URL that the
 * customer's app would then render inside their order history.
 *
 * Plain https URLs are still accepted so rows written before the upload
 * endpoints existed keep working.
 */
const normalizeProofRefs = (orderId, values, label) => {
  const refs = (values || [])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);

  if (refs.length > MAX_PROOF_PHOTOS) {
    throw new Error(`At most ${MAX_PROOF_PHOTOS} ${label} photos can be attached to an order`);
  }

  for (const ref of refs) {
    if (!isOrderProofKeyFor(orderId, ref) && !ref.startsWith('https://')) {
      throw new Error(
        `Invalid ${label} photo reference — upload each photo to ` +
          `POST /api/uploads/order-proof/${orderId} and submit the storageKey it returns`
      );
    }
  }

  return refs;
};

class DriverService {
  /**
   * Creates a driver profile. Only ever called by AdminService.createDriver —
   * there is no driver self-registration endpoint. The admin fills in every
   * detail (including a profile picture, which the admin app uploads first via
   * POST /api/uploads/driver-photo — this just stores the returned URL) and the
   * driver starts unapproved
   * until the admin completes the OTP-verified approve step (client-side,
   * see docs/KNOWLEDGE_BASE.md Section 7 driver-approval flow).
   */
  async registerDriver(data) {
    try {
      logger.info('[DRIVER SVC] Registering driver (admin-created)...');
      logger.info(`[DRIVER SVC] phone=${data.phone} email=${data.email ? '***' : 'n/a'}`);

      if (!data.name || !data.email || !data.phone) {
        throw new Error('name, email and phone are required');
      }
      if (!data.profilePictureUrl) {
        throw new Error(
          'profilePictureUrl is required — upload the photo to POST /api/uploads/driver-photo first'
        );
      }

      const existing = await Driver.findExisting({
        email: data.email.toLowerCase(),
        phone: data.phone,
      });
      if (existing) {
        throw new Error('Driver with this phone or email already exists.');
      }

      const driver = await Driver.create(data);
      logger.success(`[DRIVER SVC] Registered (pending approval) id=${driver.id}`);
      return driver;
    } catch (err) {
      logger.error(`[DRIVER SVC] register failed: ${err.message}`);
      throw err;
    }
  }

  async loginDriver(phone) {
    try {
      logger.info(`[DRIVER SVC] Login phone=${phone}`);
      const driver = await Driver.findByPhone(phone);
      if (!driver) throw new Error('Driver not found');

      if (!driver.isApprovedByAdmin) {
        logger.warn(`[DRIVER SVC] Not approved yet id=${driver.id}`);
        return {
          success: false,
          requiresAdminApproval: true,
          message: 'Contact admin for driver approval',
        };
      }

      if (driver.status === DRIVER_STATUS.BLOCKED) {
        throw new Error('Your account has been blocked. Contact admin.');
      }

      // Deactivated drivers CAN log in — they're only stopped from going
      // online (see goOnline below). The app should surface driver.status
      // so it can show the "contact admin" messaging appropriately.
      const token = Driver.generateAuthToken(driver);
      logger.success(`[DRIVER SVC] Login OK id=${driver.id}`);
      return { success: true, driver, token };
    } catch (err) {
      logger.error(`[DRIVER SVC] login failed: ${err.message}`);
      throw err;
    }
  }

  async approveDriver(driverId) {
    try {
      logger.info(`[DRIVER SVC] Approving id=${driverId}`);
      const driver = await Driver.updateById(driverId, {
        isApprovedByAdmin: true,
        status: DRIVER_STATUS.ACTIVE,
      });
      logger.success(`[DRIVER SVC] Approved ${driver.name}`);
      return driver;
    } catch (err) {
      logger.error(`[DRIVER SVC] approve failed: ${err.message}`);
      throw err;
    }
  }

  async getDriverById(driverId) {
    try {
      logger.info(`[DRIVER SVC] getById=${driverId}`);
      const driver = await Driver.findById(driverId);
      if (!driver) throw new Error('Driver not found');
      return driver;
    } catch (err) {
      logger.error(`[DRIVER SVC] getById failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Lightweight status payload for the driver app (homepage slider / banners).
   * `status` = admin lifecycle; `isOnline` = driver's own online slider.
   */
  async getDriverStatus(driverId) {
    try {
      logger.info(`[DRIVER SVC] getStatus=${driverId}`);
      const driver = await Driver.findById(driverId);
      if (!driver) throw new Error('Driver not found');
      return {
        driverId: driver.id || driver._id,
        status: driver.status,
        isOnline: !!driver.isOnline,
        isApprovedByAdmin: !!driver.isApprovedByAdmin,
        lastOnlineAt: driver.lastOnlineAt || null,
      };
    } catch (err) {
      logger.error(`[DRIVER SVC] getStatus failed: ${err.message}`);
      throw err;
    }
  }

  async getAll() {
    try {
      logger.info('[DRIVER SVC] getAll');
      return await Driver.findAll();
    } catch (err) {
      logger.error(`[DRIVER SVC] getAll failed: ${err.message}`);
      throw err;
    }
  }

  async updateDriver(driverId, updateData) {
    try {
      logger.info(`[DRIVER SVC] update id=${driverId} fields=${Object.keys(updateData).join(',')}`);

      // Replacing the photo should not leave the old file in the bucket forever.
      const nextPhoto = updateData.profilePictureUrl ?? updateData.profile_picture_url;
      const previousPhoto = nextPhoto ? (await Driver.findById(driverId))?.profilePictureUrl : null;

      const driver = await Driver.updateById(driverId, updateData);

      if (previousPhoto && previousPhoto !== nextPhoto) {
        const staleKey = keyFromPublicUrl(previousPhoto);
        if (staleKey) await removeByKey(staleKey);
      }

      return driver;
    } catch (err) {
      logger.error(`[DRIVER SVC] update failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Driver slides the homepage "go online" slider. Deactivated drivers can
   * still log in but are rejected here — the app turns this specific error
   * into the "you are deactivated, contact admin" popup the user described.
   * Blocked drivers never reach this point since they can't log in at all.
   */
  async goOnline(driverId) {
    try {
      logger.info(`[DRIVER SVC] goOnline id=${driverId}`);
      const driver = await Driver.findById(driverId);
      if (!driver) throw new Error('Driver not found');

      if (driver.status === DRIVER_STATUS.DEACTIVATED) {
        throw new Error('Your account has been deactivated. Contact admin.');
      }
      if (driver.status === DRIVER_STATUS.BLOCKED) {
        throw new Error('Your account has been blocked. Contact admin.');
      }

      const updated = await Driver.updateById(driverId, {
        isOnline: true,
        lastOnlineAt: new Date().toISOString(),
        status: DRIVER_STATUS.ACTIVE,
      });
      await RealtimeService.broadcastDriverStatus(driverId, true);
      return updated;
    } catch (err) {
      logger.error(`[DRIVER SVC] goOnline failed: ${err.message}`);
      throw err;
    }
  }

  async goOffline(driverId) {
    try {
      logger.info(`[DRIVER SVC] goOffline id=${driverId}`);
      const driver = await Driver.updateById(driverId, {
        isOnline: false,
        lastOnlineAt: new Date().toISOString(),
      });
      await RealtimeService.broadcastDriverStatus(driverId, false);
      return driver;
    } catch (err) {
      logger.error(`[DRIVER SVC] goOffline failed: ${err.message}`);
      throw err;
    }
  }

  async updateLocation(driverId, latitude, longitude) {
    try {
      logger.info(`[DRIVER SVC] updateLocation id=${driverId} ${latitude},${longitude}`);
      const driver = await Driver.updateLocation(driverId, latitude, longitude);
      // Supabase Realtime broadcast — live tracking for customer app + admin map (KB Section 16).
      await RealtimeService.broadcastDriverLocation(driverId, {
        latitude,
        longitude,
        updatedAt: driver.currentLocation?.lastUpdated,
      });
      return driver;
    } catch (err) {
      logger.error(`[DRIVER SVC] updateLocation failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Last-known GPS position of one driver, for the admin live map and for the
   * driver app to confirm its own fixes are landing.
   *
   * Customers do NOT use this: they are never given a driverId (formatDriver
   * deliberately omits it), and letting them poll an arbitrary driver would
   * mean tracking that driver outside of any order. They use
   * GET /api/orders/:id/driver-location instead. The route pairs
   * requireAuth(['driver','admin']) with requireSelf so a driver can only read
   * their own row.
   */
  async getDriverLocation(driverId) {
    try {
      logger.info(`[DRIVER SVC] getLocation id=${driverId}`);

      const driver = await Driver.findById(driverId);
      if (!driver) {
        const err = new Error('Driver not found');
        err.statusCode = 404;
        throw err;
      }

      return formatDriverLocation(driver);
    } catch (err) {
      logger.error(`[DRIVER SVC] getLocation failed: ${err.message}`);
      throw err;
    }
  }

  async getDriverOrders(driverId, statusFilter = null) {
    try {
      logger.info(`[DRIVER SVC] getOrders driver=${driverId} status=${statusFilter || 'any'}`);
      const driver = await Driver.findById(driverId);
      if (!driver) throw new Error('Driver not found');

      const filter = { driverId };
      if (statusFilter) filter.status = statusFilter;
      const orders = await Order.findMany(filter);
      return formatOrders(orders);
    } catch (err) {
      logger.error(`[DRIVER SVC] getOrders failed: ${err.message}`);
      throw err;
    }
  }

  async getDriverActiveOrders(driverId) {
    try {
      logger.info(`[DRIVER SVC] getActiveOrders driver=${driverId}`);
      const orders = await Order.findMany({
        driverId,
        statusIn: DRIVER_ACTIVE_STATUSES,
      });
      return formatOrders(orders);
    } catch (err) {
      logger.error(`[DRIVER SVC] getActiveOrders failed: ${err.message}`);
      throw err;
    }
  }

  async updateOrderStatus(driverId, orderId, newStatus, additionalData = {}) {
    try {
      logger.info(
        `[DRIVER SVC] updateOrderStatus driver=${driverId} order=${orderId} → ${newStatus}`
      );
      logger.info(`[DRIVER SVC] additionalData keys=${Object.keys(additionalData || {}).join(',')}`);

      const order = await Order.findById(orderId);
      if (!order) throw new Error('Order not found or not assigned to this driver');
      if (order.driverId !== driverId) {
        logger.warn(`[DRIVER SVC] Driver mismatch have=${order.driverId} want=${driverId}`);
        throw new Error('Order not found or not assigned to this driver');
      }

      const updateData = {
        status: newStatus,
        ...additionalData,
      };

      if (newStatus === 'completed') {
        updateData.completedAt = new Date().toISOString();
        await Driver.incrementCompletedOrders(driverId);
      }

      const updated = await Order.updateById(orderId, updateData);
      logger.success(`[DRIVER SVC] Order ${updated.orderId} → ${newStatus}`);
      await RealtimeService.broadcastOrderUpdate(updated);
      return formatOrder(updated);
    } catch (err) {
      logger.error(`[DRIVER SVC] updateOrderStatus failed: ${err.message}`);
      throw err;
    }
  }

  async completePickup(driverId, orderId, additionalItems = [], photos = [], comment = '', signature = '') {
    try {
      logger.info(`[DRIVER SVC] completePickup driver=${driverId} order=${orderId}`);
      if (!Array.isArray(photos) || photos.length === 0) {
        throw new Error('At least one pickup photo is required before completing pickup');
      }
      const pickupPhotos = normalizeProofRefs(orderId, photos, 'pickup');
      if (pickupPhotos.length === 0) {
        throw new Error('At least one pickup photo is required before completing pickup');
      }

      const additionalData = {
        pickupCompletedAt: new Date().toISOString(),
        pickupPhotos,
      };
      if (additionalItems?.length) additionalData.additionalItems = additionalItems;
      if (comment) additionalData.driverComment = comment;
      if (signature) {
        [additionalData.pickupSignature] = normalizeProofRefs(orderId, [signature], 'pickup signature');
      }

      return await this.updateOrderStatus(driverId, orderId, 'pickupCompleted', additionalData);
    } catch (err) {
      logger.error(`[DRIVER SVC] completePickup failed: ${err.message}`);
      throw err;
    }
  }

  async completeDelivery(
    driverId,
    orderId,
    photos = [],
    comment = '',
    signature = '',
    deliveryWaiverAccepted = false
  ) {
    try {
      logger.info(`[DRIVER SVC] completeDelivery driver=${driverId} order=${orderId}`);
      if (!Array.isArray(photos) || photos.length === 0) {
        throw new Error('At least one delivery photo is required before completing the order');
      }
      if (!signature) {
        throw new Error('Customer signature is required before completing the order');
      }
      // Waiver / T&Cs are shown on the driver screen after the customer signs;
      // customer must check the box before the order can be completed.
      if (deliveryWaiverAccepted !== true) {
        throw new Error(
          'Customer must accept the delivery waiver / terms and conditions before completing the order'
        );
      }
      const deliveryPhotos = normalizeProofRefs(orderId, photos, 'delivery');
      if (deliveryPhotos.length === 0) {
        throw new Error('At least one delivery photo is required before completing the order');
      }
      const [deliverySignature] = normalizeProofRefs(orderId, [signature], 'delivery signature');

      const additionalData = {
        deliveryCompletedAt: new Date().toISOString(),
        deliveryPhotos,
        deliverySignature,
        deliveryWaiverAccepted: true,
      };

      if (comment) {
        const order = await Order.findById(orderId);
        additionalData.driverComment = order?.driverComment
          ? `${order.driverComment} | Delivery: ${comment}`
          : comment;
      }

      return await this.updateOrderStatus(driverId, orderId, 'completed', additionalData);
    } catch (err) {
      logger.error(`[DRIVER SVC] completeDelivery failed: ${err.message}`);
      throw err;
    }
  }

  async getDriverStatistics(driverId) {
    try {
      logger.info(`[DRIVER SVC] statistics driver=${driverId}`);
      const driver = await Driver.findById(driverId);
      if (!driver) throw new Error('Driver not found');

      const totalOrders = await Order.count({ driverId });
      const completedOrders = await Order.count({ driverId, status: 'completed' });
      const activeOrders = await Order.count({
        driverId,
        statusIn: DRIVER_ACTIVE_STATUSES,
      });

      const statistics = {
        totalOrders,
        completedOrders,
        activeOrders,
        rating: driver.rating,
        totalRatings: driver.totalRatings,
      };

      logger.success(
        `[DRIVER SVC] Stats total=${totalOrders} completed=${completedOrders} active=${activeOrders}`
      );
      return statistics;
    } catch (err) {
      logger.error(`[DRIVER SVC] statistics failed: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new DriverService();
