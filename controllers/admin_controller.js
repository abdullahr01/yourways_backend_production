const AdminService = require('../services/admin_service');
const CatalogService = require('../services/catalog_service');
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
  async createDriver(req, res) {
    try {
      logger.info('[ADMIN CTRL] createDriver');
      const driver = await AdminService.createDriver(req.body);
      return successResponse(res, 201, 'Driver created successfully (pending approval)', driver);
    } catch (err) {
      logger.error(`[ADMIN CTRL] createDriver failed: ${err.message}`);
      return errorResponse(res, 400, 'Driver creation failed', err);
    }
  }

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

  async blockDriver(req, res) {
    try {
      logger.info(`[ADMIN CTRL] blockDriver id=${req.params.id}`);
      const driver = await AdminService.blockDriver(req.params.id);
      return successResponse(res, 200, 'Driver blocked successfully', driver);
    } catch (err) {
      logger.error(`[ADMIN CTRL] blockDriver failed: ${err.message}`);
      return errorResponse(res, 400, 'Driver block failed', err);
    }
  }

  async deactivateDriver(req, res) {
    try {
      logger.info(`[ADMIN CTRL] deactivateDriver id=${req.params.id}`);
      const driver = await AdminService.deactivateDriver(req.params.id);
      return successResponse(res, 200, 'Driver deactivated successfully', driver);
    } catch (err) {
      logger.error(`[ADMIN CTRL] deactivateDriver failed: ${err.message}`);
      return errorResponse(res, 400, 'Driver deactivation failed', err);
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

  // ——— Catalog: service types ———
  // Full CRUD over items/categories/prices listed on the platform (DB-backed,
  // see sql/005_driver_and_catalog.sql + services/catalog_service.js).
  async createServiceType(req, res) {
    try {
      logger.info('[ADMIN CTRL] createServiceType');
      const serviceType = await CatalogService.createServiceType(req.body);
      return successResponse(res, 201, 'Service type created successfully', serviceType);
    } catch (err) {
      logger.error(`[ADMIN CTRL] createServiceType failed: ${err.message}`);
      return errorResponse(res, 400, 'Service type creation failed', err);
    }
  }

  async updateServiceType(req, res) {
    try {
      logger.info(`[ADMIN CTRL] updateServiceType id=${req.params.id}`);
      const serviceType = await CatalogService.updateServiceType(req.params.id, req.body);
      return successResponse(res, 200, 'Service type updated successfully', serviceType);
    } catch (err) {
      logger.error(`[ADMIN CTRL] updateServiceType failed: ${err.message}`);
      return errorResponse(res, 400, 'Service type update failed', err);
    }
  }

  async deleteServiceType(req, res) {
    try {
      logger.info(`[ADMIN CTRL] deleteServiceType id=${req.params.id}`);
      await CatalogService.deleteServiceType(req.params.id);
      return successResponse(res, 200, 'Service type deleted successfully');
    } catch (err) {
      logger.error(`[ADMIN CTRL] deleteServiceType failed: ${err.message}`);
      return errorResponse(res, 400, 'Service type deletion failed', err);
    }
  }

  // ——— Catalog: categories ———
  async createCategory(req, res) {
    try {
      logger.info('[ADMIN CTRL] createCategory');
      const category = await CatalogService.createCategory(req.body);

      // Convenience: allow creating + attaching to a service type in one call.
      if (req.body.serviceTypeId) {
        await CatalogService.attachCategoryToServiceType(
          req.body.serviceTypeId,
          category.id,
          req.body.sortOrder || 0
        );
      }

      return successResponse(res, 201, 'Category created successfully', category);
    } catch (err) {
      logger.error(`[ADMIN CTRL] createCategory failed: ${err.message}`);
      return errorResponse(res, 400, 'Category creation failed', err);
    }
  }

  async updateCategory(req, res) {
    try {
      logger.info(`[ADMIN CTRL] updateCategory id=${req.params.id}`);
      const category = await CatalogService.updateCategory(req.params.id, req.body);
      return successResponse(res, 200, 'Category updated successfully', category);
    } catch (err) {
      logger.error(`[ADMIN CTRL] updateCategory failed: ${err.message}`);
      return errorResponse(res, 400, 'Category update failed', err);
    }
  }

  async deleteCategory(req, res) {
    try {
      logger.info(`[ADMIN CTRL] deleteCategory id=${req.params.id}`);
      await CatalogService.deleteCategory(req.params.id);
      return successResponse(res, 200, 'Category deleted successfully');
    } catch (err) {
      logger.error(`[ADMIN CTRL] deleteCategory failed: ${err.message}`);
      return errorResponse(res, 400, 'Category deletion failed', err);
    }
  }

  /** Attach an existing (often shared, e.g. "Custom Item") category to another service type. */
  async attachCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const { serviceTypeId, sortOrder } = req.body;
      if (!serviceTypeId) throw new Error('serviceTypeId is required');
      logger.info(`[ADMIN CTRL] attachCategory category=${categoryId} -> serviceType=${serviceTypeId}`);
      const joined = await CatalogService.attachCategoryToServiceType(serviceTypeId, categoryId, sortOrder || 0);
      return successResponse(res, 201, 'Category attached to service type successfully', joined);
    } catch (err) {
      logger.error(`[ADMIN CTRL] attachCategory failed: ${err.message}`);
      return errorResponse(res, 400, 'Category attach failed', err);
    }
  }

  async detachCategory(req, res) {
    try {
      const { categoryId, serviceTypeId } = req.params;
      logger.info(`[ADMIN CTRL] detachCategory category=${categoryId} from serviceType=${serviceTypeId}`);
      await CatalogService.detachCategoryFromServiceType(serviceTypeId, categoryId);
      return successResponse(res, 200, 'Category detached from service type successfully');
    } catch (err) {
      logger.error(`[ADMIN CTRL] detachCategory failed: ${err.message}`);
      return errorResponse(res, 400, 'Category detach failed', err);
    }
  }

  // ——— Catalog: items (incl. price overrides) ———
  async createItem(req, res) {
    try {
      logger.info('[ADMIN CTRL] createItem');
      if (!req.body.categoryId) throw new Error('categoryId is required');
      const item = await CatalogService.createItem(req.body);
      return successResponse(res, 201, 'Item created successfully', item);
    } catch (err) {
      logger.error(`[ADMIN CTRL] createItem failed: ${err.message}`);
      return errorResponse(res, 400, 'Item creation failed', err);
    }
  }

  async updateItem(req, res) {
    try {
      logger.info(`[ADMIN CTRL] updateItem id=${req.params.id}`);
      const item = await CatalogService.updateItem(req.params.id, req.body);
      return successResponse(res, 200, 'Item updated successfully', item);
    } catch (err) {
      logger.error(`[ADMIN CTRL] updateItem failed: ${err.message}`);
      return errorResponse(res, 400, 'Item update failed', err);
    }
  }

  async deleteItem(req, res) {
    try {
      logger.info(`[ADMIN CTRL] deleteItem id=${req.params.id}`);
      await CatalogService.deleteItem(req.params.id);
      return successResponse(res, 200, 'Item deleted successfully');
    } catch (err) {
      logger.error(`[ADMIN CTRL] deleteItem failed: ${err.message}`);
      return errorResponse(res, 400, 'Item deletion failed', err);
    }
  }
}

module.exports = new AdminController();
