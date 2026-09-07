const Admin = require('../models/admin_model');
const User = require('../models/user_model');
const Driver = require('../models/driver_model');
const Booking = require('../models/booking_model');
const Order = require('../models/order_model');
const Payment = require('../models/payment_model');
const OrderService = require('./order_service');
const DriverService = require('./driver_service');
const DRIVER_STATUS = require('../constants/driver_status');
const logger = require('../utils/logger');
const { formatOrders } = require('../utils/orderFormatter');
const { formatBooking, formatBookings } = require('../utils/bookingFormatter');

class AdminService {
  /**
   * Bootstrap / create admin. First admin is always allowed.
   * Later admins require an authenticated admin caller (enforced in controller).
   */
  async registerAdmin({ name, email, password, phone }) {
    try {
      logger.info('[ADMIN SVC] Register admin...');
      if (!name || !email || !password) {
        throw new Error('name, email and password are required');
      }
      if (String(password).length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      const existing = await Admin.findByEmail(email);
      if (existing) {
        throw new Error('Admin with this email already exists');
      }

      const admin = await Admin.create({ name, email, password, phone });
      const token = Admin.generateAuthToken(admin);
      logger.success(`[ADMIN SVC] Registered admin id=${admin.id}`);
      return { admin, token };
    } catch (err) {
      logger.error(`[ADMIN SVC] register failed: ${err.message}`);
      throw err;
    }
  }

  async loginAdmin(email, password) {
    try {
      logger.info(`[ADMIN SVC] Login attempt email=${email ? '***' : 'n/a'}`);
      if (!email || !password) throw new Error('email and password are required');

      const admin = await Admin.findByEmail(email, { withPassword: true });
      if (!admin) throw new Error('Invalid email or password');
      if (admin.status !== 'active') throw new Error('Admin account is inactive');

      const ok = await Admin.comparePassword(password, admin.passwordHash);
      if (!ok) {
        logger.warn('[ADMIN SVC] Login failed — bad password');
        throw new Error('Invalid email or password');
      }

      await Admin.touchLastLogin(admin.id);
      const safe = await Admin.findById(admin.id);
      const token = Admin.generateAuthToken(safe);

      logger.success(`[ADMIN SVC] Login OK id=${safe.id}`);
      return { admin: safe, token };
    } catch (err) {
      logger.error(`[ADMIN SVC] login failed: ${err.message}`);
      throw err;
    }
  }

  async getProfile(adminId) {
    logger.info(`[ADMIN SVC] getProfile id=${adminId}`);
    const admin = await Admin.findById(adminId);
    if (!admin) throw new Error('Admin not found');
    return admin;
  }

  async getDashboard() {
    try {
      logger.info('[ADMIN SVC] Building dashboard stats...');
      const [users, drivers, bookings, orders, activeOrders, pendingOrders, payments] = await Promise.all([
        User.findAll(),
        Driver.findAll(),
        Booking.findMany({}, 5000),
        Order.findMany({}, 5000),
        Order.findMany(
          {
            statusIn: [
              'pending',
              'confirmed',
              'pickupScheduled',
              'outForPickup',
              'pickupCompleted',
              'outForDropOff',
            ],
          },
          5000
        ),
        Order.findMany({ status: 'pending' }, 5000),
        Payment.findMany({}, 5000),
      ]);

      const approvedDrivers = drivers.filter((d) => d.isApprovedByAdmin);
      const onlineDrivers = drivers.filter((d) => d.isOnline);
      const revenue = orders
        .filter((o) => o.status === 'completed')
        .reduce((sum, o) => sum + (Number(o.totalPrice) || 0), 0);

      // Cash actually taken through Stripe, which is a different number from
      // completedRevenue: customers pay up front, before the job is completed.
      const succeededPayments = payments.filter(
        (p) => p.status === 'succeeded' || p.status === 'refunded'
      );
      const collected = succeededPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const refunded = payments.reduce((sum, p) => sum + (p.refundedAmount || 0), 0);

      const stats = {
        totalUsers: users.length,
        totalDrivers: drivers.length,
        approvedDrivers: approvedDrivers.length,
        onlineDrivers: onlineDrivers.length,
        totalBookings: bookings.length,
        draftBookings: bookings.filter((b) => b.status === 'draft').length,
        submittedBookings: bookings.filter((b) => b.status === 'submitted').length,
        totalOrders: orders.length,
        pendingOrders: pendingOrders.length,
        activeOrders: activeOrders.length,
        completedOrders: orders.filter((o) => o.status === 'completed').length,
        cancelledOrders: orders.filter((o) => o.status === 'cancelled').length,
        completedRevenue: Math.round(revenue * 100) / 100,
        totalPayments: payments.length,
        successfulPayments: succeededPayments.length,
        failedPayments: payments.filter((p) => p.status === 'failed').length,
        pendingPayments: payments.filter((p) => p.status === 'pending' || p.status === 'processing')
          .length,
        grossCollected: Math.round(collected * 100) / 100,
        totalRefunded: Math.round(refunded * 100) / 100,
        netCollected: Math.round((collected - refunded) * 100) / 100,
      };

      logger.success(`[ADMIN SVC] Dashboard ready: ${JSON.stringify(stats)}`);
      return stats;
    } catch (err) {
      logger.error(`[ADMIN SVC] dashboard failed: ${err.message}`);
      throw err;
    }
  }

  // ——— Users ———
  async listUsers() {
    logger.info('[ADMIN SVC] listUsers');
    return User.findAll();
  }

  // ——— Drivers ———
  /**
   * Admin-only driver creation — the ONLY way a driver profile is created
   * (there is no self-registration). The admin app is responsible for the
   * OTP-verified approval step client-side (Firebase, same pattern as
   * customer OTP); this just persists the profile as unapproved, exactly
   * like DriverService.registerDriver always did.
   */
  async createDriver(driverData) {
    logger.info('[ADMIN SVC] createDriver...');
    return DriverService.registerDriver(driverData);
  }

  async listDrivers() {
    logger.info('[ADMIN SVC] listDrivers');
    return Driver.findAll();
  }

  async approveDriver(driverId) {
    logger.info(`[ADMIN SVC] approveDriver id=${driverId}`);
    return DriverService.approveDriver(driverId);
  }

  /** Driver cannot log in at all until re-activated. */
  async blockDriver(driverId) {
    logger.info(`[ADMIN SVC] blockDriver id=${driverId}`);
    return Driver.updateById(driverId, {
      status: DRIVER_STATUS.BLOCKED,
      isOnline: false,
    });
  }

  /** Driver can still log in, but cannot go online (app shows a "contact admin" popup). */
  async deactivateDriver(driverId) {
    logger.info(`[ADMIN SVC] deactivateDriver id=${driverId}`);
    return Driver.updateById(driverId, {
      status: DRIVER_STATUS.DEACTIVATED,
      isOnline: false,
    });
  }

  async activateDriver(driverId) {
    logger.info(`[ADMIN SVC] activateDriver id=${driverId}`);
    const driver = await Driver.findById(driverId);
    if (!driver) throw new Error('Driver not found');
    if (!driver.isApprovedByAdmin) {
      throw new Error('Driver must be approved before activation');
    }
    return Driver.updateById(driverId, { status: DRIVER_STATUS.ACTIVE });
  }

  // ——— Bookings ———
  // Admin booking screen: quotes the customer started but has not paid /
  // converted into an order yet. Formatted the same way as list-orders so
  // the panel can reuse the same cards (and without meta/coordinates).
  async listBookings(filter = {}, limit = 100) {
    logger.info(`[ADMIN SVC] listBookings filter=${JSON.stringify(filter)}`);
    const bookings = await Booking.findMany(filter, limit);
    return formatBookings(bookings);
  }

  async getBooking(id) {
    const booking = await Booking.findById(id);
    if (!booking) throw new Error('Booking not found');
    return formatBooking(booking);
  }

  // ——— Orders ———
  async listOrders(filter = {}, limit = 100) {
    logger.info(`[ADMIN SVC] listOrders filter=${JSON.stringify(filter)}`);
    const orders = await Order.findMany(filter, limit);
    return formatOrders(orders);
  }

  async getOrder(id) {
    return OrderService.getOrderById(id);
  }

  async assignDriver(orderId, driverId) {
    logger.info(`[ADMIN SVC] assignDriver order=${orderId} driver=${driverId}`);
    return OrderService.assignDriver(orderId, driverId);
  }

  async updateOrderStatus(orderId, status) {
    logger.info(`[ADMIN SVC] updateOrderStatus order=${orderId} → ${status}`);
    return OrderService.updateOrderStatus(orderId, status);
  }

  async updateOrderPricing(orderId, pricingData) {
    logger.info(`[ADMIN SVC] updatePricing order=${orderId}`);
    return OrderService.updatePricing(orderId, pricingData);
  }

  async schedulePickup(orderId, pickupDateTime) {
    logger.info(`[ADMIN SVC] schedulePickup order=${orderId}`);
    return OrderService.schedulePickup(orderId, pickupDateTime);
  }

  async cancelOrder(orderId, cancellationReason) {
    logger.info(`[ADMIN SVC] cancelOrder order=${orderId}`);
    return OrderService.cancelOrder(orderId, cancellationReason);
  }

  async countAdmins() {
    return Admin.countAll();
  }
}

module.exports = new AdminService();
