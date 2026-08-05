const logger = require('./logger');

/**
 * Formats order objects for the Flutter app (YourWays OrderModel).
 * Works with already-mapped camelCase order objects from Order model.
 */
const formatDriver = (driver) => {
  if (!driver || typeof driver !== 'object') return null;
  return {
    name: driver.name || null,
    phone: driver.phone || null,
    vehicleType: driver.vehicleType || null,
    vehicleNumber: driver.vehicleNumber || null,
    rating: driver.rating ?? null,
    // Admin-uploaded at driver creation time — shown to customers/admin so
    // they can recognize the assigned driver (KB Section 7 driver approval flow).
    photoUrl: driver.profilePictureUrl || null,
  };
};

const formatOrderItem = (item) => ({
  category: item.category,
  itemName: item.itemName,
  quantity: item.quantity,
  modifiers: item.modifiers || {},
});

const formatOrder = (order) => {
  if (!order) return null;

  const formatted = {
    id: order.orderId || order.id || order._id,
    _id: order._id || order.id,
    orderId: order.orderId,
    serviceName: order.serviceName,
    status: order.status,
    pickupLocation: order.pickupLocation,
    deliveryLocation: order.deliveryLocation,
    pickupAddressLine: order.pickupAddressLine,
    pickupPostcode: order.pickupPostcode,
    deliveryAddressLine: order.deliveryAddressLine,
    deliveryPostcode: order.deliveryPostcode,
    pickupDateTime: order.pickupDateTime,
    deliveryDateTime: order.deliveryDateTime,
    createdAt: order.createdAt,
    completedAt: order.completedAt,
    pickupPropertyType: order.pickupPropertyType,
    deliveryPropertyType: order.deliveryPropertyType,
    pickupFloorLevel: order.pickupFloorLevel,
    deliveryFloorLevel: order.deliveryFloorLevel,
    pickupLiftAccess: order.pickupLiftAccess,
    deliveryLiftAccess: order.deliveryLiftAccess,
    manpowerRequired: order.manpowerRequired,
    packingService: order.packingService,
    dismantlingRequired: order.dismantlingRequired,
    parkingAccess: order.parkingAccess,
    insuranceValue: order.insuranceValue,
    jobNotes: order.jobNotes,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    items: (order.items || []).map(formatOrderItem),
    additionalItems: (order.additionalItems || []).map(formatOrderItem),
    driver: formatDriver(order.driver),
    totalPrice: order.totalPrice,
    quotedPrice: order.quotedPrice,
    cancellationReason: order.cancellationReason,
    pickupPhotos: order.pickupPhotos || [],
    deliveryPhotos: order.deliveryPhotos || [],
    pickupSignature: order.pickupSignature || null,
    deliverySignature: order.deliverySignature || null,
    driverComment: order.driverComment || null,
    userId: order.userId,
    bookingId: order.bookingId,
  };

  logger.debug(`[FORMATTER] Formatted order ${formatted.orderId} status=${formatted.status}`);
  return formatted;
};

const formatOrders = (orders) => (orders || []).map(formatOrder);

module.exports = { formatOrder, formatOrders, formatDriver };
