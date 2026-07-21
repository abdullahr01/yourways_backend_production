const logger = require('./logger');

/**
 * Formats order documents for the Flutter app (YourWays OrderModel).
 * Maps orderId -> id and populates driver as DriverInfo object.
 */
const formatDriver = (driver) => {
  if (!driver || typeof driver !== 'object') return null;
  return {
    name: driver.name || null,
    phone: driver.phone || null,
    vehicleType: driver.vehicleType || null,
    vehicleNumber: driver.vehicleNumber || null,
    rating: driver.rating ?? null,
  };
};

const formatOrderItem = (item) => ({
  category: item.category,
  itemName: item.itemName,
  quantity: item.quantity,
  modifiers:
    item.modifiers instanceof Map
      ? Object.fromEntries(item.modifiers)
      : item.modifiers || {},
});

const formatOrder = (order) => {
  if (!order) return null;

  const doc = order.toObject ? order.toObject({ virtuals: true }) : { ...order };

  // id field matches Flutter OrderModel (uses orderId string)
  const formatted = {
    id: doc.orderId || doc._id?.toString(),
    _id: doc._id,
    orderId: doc.orderId,
    serviceName: doc.serviceName,
    status: doc.status,
    pickupLocation: doc.pickupLocation,
    deliveryLocation: doc.deliveryLocation,
    pickupDateTime: doc.pickupDateTime,
    deliveryDateTime: doc.deliveryDateTime,
    createdAt: doc.createdAt,
    completedAt: doc.completedAt,
    pickupPropertyType: doc.pickupPropertyType,
    deliveryPropertyType: doc.deliveryPropertyType,
    pickupFloorLevel: doc.pickupFloorLevel,
    deliveryFloorLevel: doc.deliveryFloorLevel,
    pickupLiftAccess: doc.pickupLiftAccess,
    deliveryLiftAccess: doc.deliveryLiftAccess,
    manpowerRequired: doc.manpowerRequired,
    packingService: doc.packingService,
    dismantlingRequired: doc.dismantlingRequired,
    parkingAccess: doc.parkingAccess,
    insuranceValue: doc.insuranceValue,
    jobNotes: doc.jobNotes,
    customerName: doc.customerName,
    customerEmail: doc.customerEmail,
    customerPhone: doc.customerPhone,
    items: (doc.items || []).map(formatOrderItem),
    additionalItems: (doc.additionalItems || []).map(formatOrderItem),
    driver: formatDriver(doc.driver),
    totalPrice: doc.totalPrice,
    quotedPrice: doc.quotedPrice,
    cancellationReason: doc.cancellationReason,
    pickupPhotos: doc.pickupPhotos || [],
    deliveryPhotos: doc.deliveryPhotos || [],
    pickupSignature: doc.pickupSignature || null,
    deliverySignature: doc.deliverySignature || null,
    driverComment: doc.driverComment || null,
    userId: doc.userId,
    bookingId: doc.bookingId,
  };

  return formatted;
};

const formatOrders = (orders) => orders.map(formatOrder);

module.exports = { formatOrder, formatOrders, formatDriver };
