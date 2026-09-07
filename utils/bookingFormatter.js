const logger = require('./logger');

/**
 * Formats booking objects for the admin panel.
 *
 * Same idea as orderFormatter: the admin list/detail screens need the same
 * card fields as orders (customerName, pickupLocation, totalPrice, …) and
 * should not dump internals the UI cannot use — lat/lng, IP, User-Agent
 * ("Mozilla Firefox…"), price-engine breakdown, etc.
 *
 * Customer-facing booking endpoints still return the raw mapBooking() shape
 * (they need coordinates for the map). Only /api/admin/bookings* uses this.
 */
const formatItem = (item) => ({
  category: item.category,
  itemName: item.itemName,
  quantity: item.quantity,
  modifiers: item.modifiers || {},
});

const fullAddress = (formatted, line, postcode) => {
  if (formatted) return formatted;
  if (!line) return null;
  return postcode ? `${line}, ${postcode}` : line;
};

const formatBooking = (booking) => {
  if (!booking) return null;

  const formatted = {
    id: booking.id || booking._id,
    _id: booking._id || booking.id,
    userId: booking.userId,
    status: booking.status,
    pickupLocation: fullAddress(
      booking.collectionFormattedAddress,
      booking.collectionAddress,
      booking.collectionPostcode
    ),
    deliveryLocation: fullAddress(
      booking.deliveryFormattedAddress,
      booking.deliveryAddress,
      booking.deliveryPostcode
    ),
    pickupAddressLine: booking.collectionAddress,
    pickupPostcode: booking.collectionPostcode,
    deliveryAddressLine: booking.deliveryAddress,
    deliveryPostcode: booking.deliveryPostcode,
    pickupDateTime: booking.moveDate,
    dateFlexibility: booking.dateFlexibility,
    pickupPropertyType: booking.collectionPropertyType,
    deliveryPropertyType: booking.deliveryPropertyType,
    pickupFloorLevel: booking.collectionFloorLevel,
    deliveryFloorLevel: booking.deliveryFloorLevel,
    pickupLiftAccess: booking.collectionLiftAccess,
    deliveryLiftAccess: booking.deliveryLiftAccess,
    manpowerRequired: booking.manpowerRequired,
    packingService: booking.packingService,
    dismantlingRequired: booking.dismantlingRequired,
    parkingAccess: booking.parkingAccess,
    insuranceValue: booking.insuranceValue,
    jobNotes: booking.jobNotes,
    customerName: booking.fullName,
    customerEmail: booking.email,
    customerPhone: booking.mobileNumber,
    items: (booking.items || []).map(formatItem),
    totalPrice: booking.calculatedPrice,
    quotedPrice: booking.calculatedPrice,
    paymentStatus: booking.paymentStatus || 'unpaid',
    paidAt: booking.paidAt || null,
    submittedAt: booking.submittedAt || null,
    convertedOrderId: booking.convertedOrderId || null,
    totalItems: booking.totalItems || 0,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };

  logger.debug(`[FORMATTER] Formatted booking ${formatted.id} status=${formatted.status}`);
  return formatted;
};

const formatBookings = (bookings) => (bookings || []).map(formatBooking);

module.exports = { formatBooking, formatBookings };
