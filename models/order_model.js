const supabase = require('../config/database');
const logger = require('../utils/logger');
const { handleSupabase, logPayload } = require('../utils/supabaseHelper');
const { stripUndefined } = require('../utils/caseMapper');
const { mapDriver } = require('./driver_model');

const TABLE = 'orders';

const generateOrderCode = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const timeStr = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `ORD-${dateStr}-${timeStr}-${random}`;
};

const mapOrder = (row) => {
  if (!row) return null;

  // Populated driver join comes as nested `drivers` from supabase select
  const driverRow = row.drivers || null;
  const driver =
    driverRow && typeof driverRow === 'object'
      ? {
          name: driverRow.name || null,
          phone: driverRow.phone || null,
          vehicleType: driverRow.vehicle_type || null,
          vehicleNumber: driverRow.vehicle_number || null,
          rating: driverRow.rating != null ? Number(driverRow.rating) : null,
        }
      : row.driver_id
        ? { id: row.driver_id }
        : null;

  const items = row.items || [];
  const additionalItems = row.additional_items || [];

  return {
    _id: row.id,
    id: row.order_code || row.id,
    orderId: row.order_code,
    userId: row.user_id,
    bookingId: row.booking_id,
    serviceName: row.service_name,
    status: row.status,
    pickupLocation: row.pickup_location,
    deliveryLocation: row.delivery_location,
    // Structured pieces of the same address, for driver-app UIs that want to
    // render "Address" / "Postcode" as separate lines instead of one string.
    pickupAddressLine: row.pickup_address_line,
    pickupPostcode: row.pickup_postcode,
    deliveryAddressLine: row.delivery_address_line,
    deliveryPostcode: row.delivery_postcode,
    pickupCoordinates:
      row.pickup_latitude != null
        ? { latitude: Number(row.pickup_latitude), longitude: Number(row.pickup_longitude) }
        : null,
    deliveryCoordinates:
      row.delivery_latitude != null
        ? { latitude: Number(row.delivery_latitude), longitude: Number(row.delivery_longitude) }
        : null,
    pickupDateTime: row.pickup_datetime,
    deliveryDateTime: row.delivery_datetime,
    pickupCompletedAt: row.pickup_completed_at,
    deliveryCompletedAt: row.delivery_completed_at,
    completedAt: row.completed_at,
    pickupPropertyType: row.pickup_property_type,
    deliveryPropertyType: row.delivery_property_type,
    pickupFloorLevel: row.pickup_floor_level,
    deliveryFloorLevel: row.delivery_floor_level,
    pickupLiftAccess: row.pickup_lift_access,
    deliveryLiftAccess: row.delivery_lift_access,
    manpowerRequired: row.manpower_required,
    packingService: row.packing_service,
    dismantlingRequired: row.dismantling_required,
    parkingAccess: row.parking_access,
    insuranceValue: row.insurance_value != null ? Number(row.insurance_value) : 0,
    jobNotes: row.job_notes || '',
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    items,
    additionalItems,
    pickupPhotos: row.pickup_photos || [],
    deliveryPhotos: row.delivery_photos || [],
    pickupSignature: row.pickup_signature,
    deliverySignature: row.delivery_signature,
    driverComment: row.driver_comment,
    driver,
    driverId: row.driver_id,
    totalPrice: row.total_price != null ? Number(row.total_price) : 0,
    quotedPrice: row.quoted_price != null ? Number(row.quoted_price) : null,
    cancellationReason: row.cancellation_reason,
    meta: row.meta || {},
    totalItems: items.reduce((s, i) => s + (i.quantity || 1), 0),
    isActive: row.status !== 'completed' && row.status !== 'cancelled',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const SELECT_WITH_DRIVER =
  '*, drivers:driver_id ( name, phone, vehicle_type, vehicle_number, rating )';

const toDbInsert = (data) =>
  stripUndefined({
    order_code: data.orderId || data.order_code || generateOrderCode(),
    user_id: data.userId || data.user_id,
    booking_id: data.bookingId || data.booking_id || null,
    driver_id: data.driverId || data.driver || data.driver_id || null,
    service_name: data.serviceName || data.service_name,
    status: data.status || 'pending',
    pickup_location: data.pickupLocation || data.pickup_location,
    delivery_location: data.deliveryLocation || data.delivery_location,
    pickup_address_line: data.pickupAddressLine || data.pickup_address_line || null,
    pickup_postcode: data.pickupPostcode || data.pickup_postcode || null,
    delivery_address_line: data.deliveryAddressLine || data.delivery_address_line || null,
    delivery_postcode: data.deliveryPostcode || data.delivery_postcode || null,
    pickup_latitude: data.pickupCoordinates?.latitude ?? data.pickup_latitude ?? null,
    pickup_longitude: data.pickupCoordinates?.longitude ?? data.pickup_longitude ?? null,
    delivery_latitude: data.deliveryCoordinates?.latitude ?? data.delivery_latitude ?? null,
    delivery_longitude: data.deliveryCoordinates?.longitude ?? data.delivery_longitude ?? null,
    pickup_datetime: data.pickupDateTime || data.pickup_datetime || null,
    delivery_datetime: data.deliveryDateTime || data.delivery_datetime || null,
    pickup_property_type: data.pickupPropertyType || data.pickup_property_type,
    delivery_property_type: data.deliveryPropertyType || data.delivery_property_type,
    pickup_floor_level: data.pickupFloorLevel || data.pickup_floor_level,
    delivery_floor_level: data.deliveryFloorLevel || data.delivery_floor_level,
    pickup_lift_access: data.pickupLiftAccess ?? data.pickup_lift_access,
    delivery_lift_access: data.deliveryLiftAccess ?? data.delivery_lift_access,
    manpower_required: data.manpowerRequired || data.manpower_required,
    packing_service: data.packingService || data.packing_service,
    dismantling_required: data.dismantlingRequired ?? data.dismantling_required,
    parking_access: data.parkingAccess || data.parking_access,
    insurance_value: data.insuranceValue ?? data.insurance_value ?? 0,
    job_notes: data.jobNotes ?? data.job_notes ?? '',
    customer_name: data.customerName || data.customer_name,
    customer_email: data.customerEmail || data.customer_email,
    customer_phone: data.customerPhone || data.customer_phone,
    items: data.items || [],
    additional_items: data.additionalItems || data.additional_items || [],
    pickup_photos: data.pickupPhotos || data.pickup_photos || [],
    delivery_photos: data.deliveryPhotos || data.delivery_photos || [],
    pickup_signature: data.pickupSignature || data.pickup_signature || null,
    delivery_signature: data.deliverySignature || data.delivery_signature || null,
    driver_comment: data.driverComment || data.driver_comment || null,
    total_price: data.totalPrice ?? data.total_price ?? 0,
    quoted_price: data.quotedPrice ?? data.quoted_price ?? null,
    cancellation_reason: data.cancellationReason || data.cancellation_reason || null,
    meta: data.meta || {},
  });

const toDbUpdate = (data) => {
  // If driver is a string UUID, treat as driver_id
  let driverId = data.driverId ?? data.driver_id;
  if (typeof data.driver === 'string') driverId = data.driver;

  return stripUndefined({
    order_code: data.orderId ?? data.order_code,
    user_id: data.userId ?? data.user_id,
    booking_id: data.bookingId ?? data.booking_id,
    driver_id: driverId,
    service_name: data.serviceName ?? data.service_name,
    status: data.status,
    pickup_location: data.pickupLocation ?? data.pickup_location,
    delivery_location: data.deliveryLocation ?? data.delivery_location,
    pickup_address_line: data.pickupAddressLine ?? data.pickup_address_line,
    pickup_postcode: data.pickupPostcode ?? data.pickup_postcode,
    delivery_address_line: data.deliveryAddressLine ?? data.delivery_address_line,
    delivery_postcode: data.deliveryPostcode ?? data.delivery_postcode,
    pickup_latitude: data.pickupCoordinates?.latitude ?? data.pickup_latitude,
    pickup_longitude: data.pickupCoordinates?.longitude ?? data.pickup_longitude,
    delivery_latitude: data.deliveryCoordinates?.latitude ?? data.delivery_latitude,
    delivery_longitude: data.deliveryCoordinates?.longitude ?? data.delivery_longitude,
    pickup_datetime: data.pickupDateTime ?? data.pickup_datetime,
    delivery_datetime: data.deliveryDateTime ?? data.delivery_datetime,
    pickup_completed_at: data.pickupCompletedAt ?? data.pickup_completed_at,
    delivery_completed_at: data.deliveryCompletedAt ?? data.delivery_completed_at,
    completed_at: data.completedAt ?? data.completed_at,
    pickup_property_type: data.pickupPropertyType ?? data.pickup_property_type,
    delivery_property_type: data.deliveryPropertyType ?? data.delivery_property_type,
    pickup_floor_level: data.pickupFloorLevel ?? data.pickup_floor_level,
    delivery_floor_level: data.deliveryFloorLevel ?? data.delivery_floor_level,
    pickup_lift_access: data.pickupLiftAccess ?? data.pickup_lift_access,
    delivery_lift_access: data.deliveryLiftAccess ?? data.delivery_lift_access,
    manpower_required: data.manpowerRequired ?? data.manpower_required,
    packing_service: data.packingService ?? data.packing_service,
    dismantling_required: data.dismantlingRequired ?? data.dismantling_required,
    parking_access: data.parkingAccess ?? data.parking_access,
    insurance_value: data.insuranceValue ?? data.insurance_value,
    job_notes: data.jobNotes ?? data.job_notes,
    customer_name: data.customerName ?? data.customer_name,
    customer_email: data.customerEmail ?? data.customer_email,
    customer_phone: data.customerPhone ?? data.customer_phone,
    items: data.items,
    additional_items: data.additionalItems ?? data.additional_items,
    pickup_photos: data.pickupPhotos ?? data.pickup_photos,
    delivery_photos: data.deliveryPhotos ?? data.delivery_photos,
    pickup_signature: data.pickupSignature ?? data.pickup_signature,
    delivery_signature: data.deliverySignature ?? data.delivery_signature,
    driver_comment: data.driverComment ?? data.driver_comment,
    total_price: data.totalPrice ?? data.total_price,
    quoted_price: data.quotedPrice ?? data.quoted_price,
    cancellation_reason: data.cancellationReason ?? data.cancellation_reason,
    meta: data.meta,
  });
};

const create = async (data) => {
  logger.info(`[ORDER MODEL] INSERT → ${TABLE}`);
  const payload = toDbInsert(data);
  logger.info(`[ORDER MODEL] order_code=${payload.order_code}`);
  logPayload('order.create', payload);

  const result = await supabase.from(TABLE).insert(payload).select(SELECT_WITH_DRIVER).single();
  const row = handleSupabase('orders.insert', result);
  logger.success(`[ORDER MODEL] Created ${row.order_code} status=${row.status}`);
  return mapOrder(row);
};

const findById = async (id) => {
  logger.info(`[ORDER MODEL] SELECT by uuid id=${id}`);
  const result = await supabase.from(TABLE).select(SELECT_WITH_DRIVER).eq('id', id).maybeSingle();
  const row = handleSupabase('orders.findById', result, { allowNull: true });
  return mapOrder(row);
};

const findByOrderCode = async (orderCode) => {
  logger.info(`[ORDER MODEL] SELECT by order_code=${orderCode}`);
  const result = await supabase
    .from(TABLE)
    .select(SELECT_WITH_DRIVER)
    .eq('order_code', orderCode)
    .maybeSingle();
  const row = handleSupabase('orders.findByOrderCode', result, { allowNull: true });
  return mapOrder(row);
};

const findMany = async (filter = {}, limit = 100) => {
  logger.info(`[ORDER MODEL] SELECT many filter=${JSON.stringify(filter)} limit=${limit}`);
  let query = supabase
    .from(TABLE)
    .select(SELECT_WITH_DRIVER)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (filter.userId || filter.user_id) query = query.eq('user_id', filter.userId || filter.user_id);
  if (filter.driverId || filter.driver_id || filter.driver)
    query = query.eq('driver_id', filter.driverId || filter.driver_id || filter.driver);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.statusIn) query = query.in('status', filter.statusIn);
  if (filter.statusNotIn) query = query.not('status', 'in', `(${filter.statusNotIn.join(',')})`);

  const result = await query;
  const rows = handleSupabase('orders.findMany', result);
  logger.info(`[ORDER MODEL] Found ${rows.length} orders`);
  return rows.map(mapOrder);
};

const updateById = async (id, data) => {
  logger.info(`[ORDER MODEL] UPDATE id=${id}`);
  logPayload('order.update', data);
  const result = await supabase
    .from(TABLE)
    .update(toDbUpdate(data))
    .eq('id', id)
    .select(SELECT_WITH_DRIVER)
    .single();
  const row = handleSupabase('orders.update', result);
  logger.info(`[ORDER MODEL] Updated ${row.order_code} status=${row.status}`);
  return mapOrder(row);
};

const count = async (filter = {}) => {
  let query = supabase.from(TABLE).select('*', { count: 'exact', head: true });
  if (filter.driverId) query = query.eq('driver_id', filter.driverId);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.statusIn) query = query.in('status', filter.statusIn);
  const { count: total, error } = await query;
  if (error) {
    logger.error(`[ORDER MODEL] count failed: ${error.message}`);
    throw new Error(error.message);
  }
  return total || 0;
};

module.exports = {
  mapOrder,
  generateOrderCode,
  create,
  findById,
  findByOrderCode,
  findMany,
  updateById,
  count,
  mapDriver,
};
