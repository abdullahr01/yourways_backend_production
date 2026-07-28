const AdminService = require('../services/admin_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { revokeToken } = require('../middleware/auth');
const logger = require('../utils/logger');

class AdminController {
  async register(req, res) {
    try {
      logger.info('[ADMIN CTRL] === REGISTER ===');
      const adminCount = await AdminService.countAdmins();

      // First admin is open (bootstrap). Later ones need an existing admin JWT.
      if (adminCount > 0) {
        if (!req.auth || req.auth.role !== 'admin') {
          logger.warn('[ADMIN CTRL] Register blocked — admin auth required');
          return errorResponse(
            res,
            403,
            'Only an authenticated admin can create another admin'
          );
        }
      } else {
        logger.info('[ADMIN CTRL] Bootstrap: creating first admin (no auth required)');
      }

      const { admin, token } = await AdminService.registerAdmin(req.body);
      logger.success(`[ADMIN CTRL] Registered id=${admin.id}`);
      return successResponse(res, 201, 'Admin registered successfully', {
        admin,
        token,
        tokenExpiry: '7 days',
      });
    } catch (err) {
      logger.error(`[ADMIN CTRL] register failed: ${err.message}`);
      return errorResponse(res, 400, 'Admin registration failed', err);
    }
  }

  async login(req, res) {
    try {
      logger.info('[ADMIN CTRL] === LOGIN ===');
      const { email, password } = req.body;
      const { admin, token } = await AdminService.loginAdmin(email, password);
      logger.success(`[ADMIN CTRL] Login OK id=${admin.id}`);
      return successResponse(res, 200, 'Admin login successful', {
        admin,
        token,
        tokenExpiry: '7 days',
      });
    } catch (err) {
      logger.error(`[ADMIN CTRL] login failed: ${err.message}`);
      return errorResponse(res, 401, 'Admin login failed', err);
    }
  }

  async getProfile(req, res) {
    try {
      logger.info('[ADMIN CTRL] === PROFILE ===');
      const admin = await AdminService.getProfile(req.auth._id || req.auth.id);
      return successResponse(res, 200, 'Admin profile fetched', admin);
    } catch (err) {
      logger.error(`[ADMIN CTRL] profile failed: ${err.message}`);
      return errorResponse(res, 404, 'Failed to fetch admin profile', err);
    }
  }

  async logout(req, res) {
    try {
      logger.info(`[ADMIN CTRL] === LOGOUT === id=${req.auth?.id || req.auth?._id}`);
      await revokeToken(req.auth);
      logger.success(`[ADMIN CTRL] Logged out id=${req.auth?.id || req.auth?._id}`);
      return successResponse(res, 200, 'Logged out successfully');
    } catch (err) {
      logger.error(`[ADMIN CTRL] logout failed: ${err.message}`);
      return errorResponse(res, 400, 'Logout failed', err);
    }
  }

  async dashboard(req, res) {
    try {
      logger.info('[ADMIN CTRL] === DASHBOARD ===');
      const stats = await AdminService.getDashboard();
      return successResponse(res, 200, 'Dashboard stats fetched', stats);
    } catch (err) {
      logger.error(`[ADMIN CTRL] dashboard failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch dashboard', err);
    }
  }

  // ——— Users ———
  async listUsers(req, res) {
    try {
      logger.info('[ADMIN CTRL] listUsers');
      const users = await AdminService.listUsers();
      return successResponse(res, 200, 'Users fetched successfully', users);
    } catch (err) {
      logger.error(`[ADMIN CTRL] listUsers failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch users', err);
    }
  }

  // ——— Drivers ———
  async listDrivers(req, res) {
    try {
      logger.info('[ADMIN CTRL] listDrivers');
      const drivers = await AdminService.listDrivers();
      return successResponse(res, 200, 'Drivers fetched successfully', drivers);
    } catch (err) {
      logger.error(`[ADMIN CTRL] listDrivers failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch drivers', err);
    }
  }

  async approveDriver(req, res) {
    try {
      logger.info(`[ADMIN CTRL] approveDriver id=${req.params.id}`);
      const driver = await AdminService.approveDriver(req.params.id);
      return successResponse(res, 200, 'Driver approved successfully', driver);
    } catch (err) {
      logger.error(`[ADMIN CTRL] approveDriver failed: ${err.message}`);
      return errorResponse(res, 400, 'Driver approval failed', err);
    }
  }

  async suspendDriver(req, res) {
    try {
      logger.info(`[ADMIN CTRL] suspendDriver id=${req.params.id}`);
      const driver = await AdminService.suspendDriver(req.params.id);
      return successResponse(res, 200, 'Driver suspended successfully', driver);
    } catch (err) {
      logger.error(`[ADMIN CTRL] suspendDriver failed: ${err.message}`);
      return errorResponse(res, 400, 'Driver suspend failed', err);
    }
  }

  async activateDriver(req, res) {
    try {
      logger.info(`[ADMIN CTRL] activateDriver id=${req.params.id}`);
      const driver = await AdminService.activateDriver(req.params.id);
      return successResponse(res, 200, 'Driver activated successfully', driver);
    } catch (err) {
      logger.error(`[ADMIN CTRL] activateDriver failed: ${err.message}`);
      return errorResponse(res, 400, 'Driver activate failed', err);
    }
  }

  // ——— Bookings ———
  async listBookings(req, res) {
    try {
      logger.info('[ADMIN CTRL] listBookings');
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      if (req.query.userId) filter.userId = req.query.userId;
      const limit = parseInt(req.query.limit, 10) || 100;
      const bookings = await AdminService.listBookings(filter, limit);
      return successResponse(res, 200, 'Bookings fetched successfully', bookings);
    } catch (err) {
      logger.error(`[ADMIN CTRL] listBookings failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch bookings', err);
    }
  }

  async getBooking(req, res) {
    try {
      const booking = await AdminService.getBooking(req.params.id);
      return successResponse(res, 200, 'Booking fetched successfully', booking);
    } catch (err) {
      return errorResponse(res, 404, 'Booking not found', err);
    }
  }

  // ——— Orders ———
  async listOrders(req, res) {
    try {
      logger.info('[ADMIN CTRL] listOrders');
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      if (req.query.userId) filter.userId = req.query.userId;
      if (req.query.driverId) filter.driverId = req.query.driverId;
      const limit = parseInt(req.query.limit, 10) || 100;
      const orders = await AdminService.listOrders(filter, limit);
      return successResponse(res, 200, 'Orders fetched successfully', orders);
    } catch (err) {
      logger.error(`[ADMIN CTRL] listOrders failed: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch orders', err);
    }
  }

  async getOrder(req, res) {
    try {
      const order = await AdminService.getOrder(req.params.id);
      return successResponse(res, 200, 'Order fetched successfully', order);
    } catch (err) {
      return errorResponse(res, 404, 'Order not found', err);
    }
  }

  async assignDriver(req, res) {
    try {
      logger.info(`[ADMIN CTRL] assignDriver order=${req.params.id}`);
      const { driverId } = req.body;
      if (!driverId) throw new Error('driverId is required');
      const order = await AdminService.assignDriver(req.params.id, driverId);
      return successResponse(res, 200, 'Driver assigned successfully', order);
    } catch (err) {
      logger.error(`[ADMIN CTRL] assignDriver failed: ${err.message}`);
      return errorResponse(res, 400, 'Driver assignment failed', err);
    }
  }

  async updateOrderStatus(req, res) {
    try {
      const { status } = req.body;
      if (!status) throw new Error('status is required');
      const order = await AdminService.updateOrderStatus(req.params.id, status);
      return successResponse(res, 200, 'Order status updated successfully', order);
    } catch (err) {
      return errorResponse(res, 400, 'Status update failed', err);
    }
  }

  async updateOrderPricing(req, res) {
    try {
      const { totalPrice, quotedPrice } = req.body;
      const order = await AdminService.updateOrderPricing(req.params.id, {
        totalPrice,
        quotedPrice,
      });
      return successResponse(res, 200, 'Pricing updated successfully', order);
    } catch (err) {
      return errorResponse(res, 400, 'Pricing update failed', err);
    }
  }

  async schedulePickup(req, res) {
    try {
      const { pickupDateTime } = req.body;
      if (!pickupDateTime) throw new Error('pickupDateTime is required');
      const order = await AdminService.schedulePickup(req.params.id, pickupDateTime);
      return successResponse(res, 200, 'Pickup scheduled successfully', order);
    } catch (err) {
      return errorResponse(res, 400, 'Pickup scheduling failed', err);
    }
  }

  async cancelOrder(req, res) {
    try {
      const { cancellationReason } = req.body;
      if (!cancellationReason) throw new Error('cancellationReason is required');
      const order = await AdminService.cancelOrder(req.params.id, cancellationReason);
      return successResponse(res, 200, 'Order cancelled successfully', order);
    } catch (err) {
      return errorResponse(res, 400, 'Order cancellation failed', err);
    }
  }
}

module.exports = new AdminController();
