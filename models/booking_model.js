const supabase = require('../config/database');
const logger = require('../utils/logger');
const { handleSupabase, logPayload } = require('../utils/supabaseHelper');
const { stripUndefined } = require('../utils/caseMapper');

const TABLE = 'bookings';

const mapBooking = (row) => {
  if (!row) return null;
  const items = row.items || [];
  const totalItems = items.reduce((sum, i) => sum + (i.quantity || 1), 0);

  return {
    _id: row.id,
    id: row.id,
    userId: row.user_id,
    collectionPostcode: row.collection_postcode,
    deliveryPostcode: row.delivery_postcode,
    collectionCoordinates:
      row.collection_latitude != null
        ? { latitude: Number(row.collection_latitude), longitude: Number(row.collection_longitude) }
        : null,
    deliveryCoordinates:
      row.delivery_latitude != null
        ? { latitude: Number(row.delivery_latitude), longitude: Number(row.delivery_longitude) }
        : null,
    moveDate: row.move_date,
    dateFlexibility: row.date_flexibility,
    collectionPropertyType: row.collection_property_type,
    deliveryPropertyType: row.delivery_property_type,
    collectionFloorLevel: row.collection_floor_level,
    deliveryFloorLevel: row.delivery_floor_level,
    collectionLiftAccess: row.collection_lift_access,
    deliveryLiftAccess: row.delivery_lift_access,
    parkingAccess: row.parking_access,
    manpowerRequired: row.manpower_required,
    dismantlingRequired: row.dismantling_required,
    packingService: row.packing_service,
    insuranceValue: row.insurance_value != null ? Number(row.insurance_value) : 0,
    jobNotes: row.job_notes || '',
    fullName: row.full_name,
    email: row.email,
    mobileNumber: row.mobile_number,
    acceptTerms: row.accept_terms,
    items,
    calculatedPrice: row.calculated_price != null ? Number(row.calculated_price) : null,
    priceBreakdown: row.price_breakdown,
    status: row.status,
    submittedAt: row.submitted_at,
    convertedOrderId: row.converted_order_id,
    meta: row.meta || {},
    totalItems,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toDbInsert = (data) =>
  stripUndefined({
    user_id: data.userId || data.user_id,
    collection_postcode: data.collectionPostcode || data.collection_postcode,
    delivery_postcode: data.deliveryPostcode || data.delivery_postcode,
    collection_latitude: data.collectionCoordinates?.latitude ?? data.collection_latitude ?? null,
    collection_longitude: data.collectionCoordinates?.longitude ?? data.collection_longitude ?? null,
    delivery_latitude: data.deliveryCoordinates?.latitude ?? data.delivery_latitude ?? null,
    delivery_longitude: data.deliveryCoordinates?.longitude ?? data.delivery_longitude ?? null,
    move_date: data.moveDate || data.move_date || null,
    date_flexibility: data.dateFlexibility || data.date_flexibility,
    collection_property_type: data.collectionPropertyType || data.collection_property_type,
    delivery_property_type: data.deliveryPropertyType || data.delivery_property_type,
    collection_floor_level: data.collectionFloorLevel || data.collection_floor_level,
    delivery_floor_level: data.deliveryFloorLevel || data.delivery_floor_level,
    collection_lift_access: data.collectionLiftAccess ?? data.collection_lift_access,
    delivery_lift_access: data.deliveryLiftAccess ?? data.delivery_lift_access,
    parking_access: data.parkingAccess || data.parking_access,
    manpower_required: data.manpowerRequired || data.manpower_required,
    dismantling_required: data.dismantlingRequired ?? data.dismantling_required,
    packing_service: data.packingService || data.packing_service,
    insurance_value: data.insuranceValue ?? data.insurance_value ?? 0,
    job_notes: data.jobNotes ?? data.job_notes ?? '',
    full_name: data.fullName || data.full_name,
    email: (data.email || '').toLowerCase(),
    mobile_number: data.mobileNumber || data.mobile_number,
    accept_terms: data.acceptTerms ?? data.accept_terms,
    items: data.items || [],
    calculated_price: data.calculatedPrice ?? data.calculated_price ?? null,
    price_breakdown: data.priceBreakdown ?? data.price_breakdown ?? null,
    status: data.status || 'draft',
    meta: data.meta || {},
  });

const toDbUpdate = (data) =>
  stripUndefined({
    user_id: data.userId ?? data.user_id,
    collection_postcode: data.collectionPostcode ?? data.collection_postcode,
    delivery_postcode: data.deliveryPostcode ?? data.delivery_postcode,
    collection_latitude: data.collectionCoordinates?.latitude ?? data.collection_latitude,
    collection_longitude: data.collectionCoordinates?.longitude ?? data.collection_longitude,
    delivery_latitude: data.deliveryCoordinates?.latitude ?? data.delivery_latitude,
    delivery_longitude: data.deliveryCoordinates?.longitude ?? data.delivery_longitude,
    move_date: data.moveDate ?? data.move_date,
    date_flexibility: data.dateFlexibility ?? data.date_flexibility,
    collection_property_type: data.collectionPropertyType ?? data.collection_property_type,
    delivery_property_type: data.deliveryPropertyType ?? data.delivery_property_type,
    collection_floor_level: data.collectionFloorLevel ?? data.collection_floor_level,
    delivery_floor_level: data.deliveryFloorLevel ?? data.delivery_floor_level,
    collection_lift_access: data.collectionLiftAccess ?? data.collection_lift_access,
    delivery_lift_access: data.deliveryLiftAccess ?? data.delivery_lift_access,
    parking_access: data.parkingAccess ?? data.parking_access,
    manpower_required: data.manpowerRequired ?? data.manpower_required,
    dismantling_required: data.dismantlingRequired ?? data.dismantling_required,
    packing_service: data.packingService ?? data.packing_service,
    insurance_value: data.insuranceValue ?? data.insurance_value,
    job_notes: data.jobNotes ?? data.job_notes,
    full_name: data.fullName ?? data.full_name,
    email: data.email !== undefined ? String(data.email).toLowerCase() : undefined,
    mobile_number: data.mobileNumber ?? data.mobile_number,
    accept_terms: data.acceptTerms ?? data.accept_terms,
    items: data.items,
    calculated_price: data.calculatedPrice ?? data.calculated_price,
    price_breakdown: data.priceBreakdown ?? data.price_breakdown,
    status: data.status,
    submitted_at: data.submittedAt ?? data.submitted_at,
    converted_order_id: data.convertedOrderId ?? data.converted_order_id,
    meta: data.meta,
  });

const create = async (data) => {
  logger.info(`[BOOKING MODEL] INSERT → ${TABLE}`);
  logPayload('booking.create', data);
  const result = await supabase.from(TABLE).insert(toDbInsert(data)).select().single();
  const row = handleSupabase('bookings.insert', result);
  logger.success(`[BOOKING MODEL] Created booking id=${row.id} status=${row.status}`);
  return mapBooking(row);
};

const findById = async (id) => {
  logger.info(`[BOOKING MODEL] SELECT id=${id}`);
  const result = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  const row = handleSupabase('bookings.findById', result, { allowNull: true });
  return mapBooking(row);
};

const findMany = async (filter = {}, limit = 100) => {
  logger.info(`[BOOKING MODEL] SELECT many filter=${JSON.stringify(filter)} limit=${limit}`);
  let query = supabase.from(TABLE).select('*').order('created_at', { ascending: false }).limit(limit);

  if (filter.userId || filter.user_id) query = query.eq('user_id', filter.userId || filter.user_id);
  if (filter.status) query = query.eq('status', filter.status);

  const result = await query;
  const rows = handleSupabase('bookings.findMany', result);
  logger.info(`[BOOKING MODEL] Found ${rows.length} bookings`);
  return rows.map(mapBooking);
};

const updateById = async (id, data) => {
  logger.info(`[BOOKING MODEL] UPDATE id=${id}`);
  logPayload('booking.update', data);
  const result = await supabase.from(TABLE).update(toDbUpdate(data)).eq('id', id).select().single();
  const row = handleSupabase('bookings.update', result);
  logger.info(`[BOOKING MODEL] Updated booking id=${row.id} status=${row.status}`);
  return mapBooking(row);
};

const deleteById = async (id) => {
  logger.info(`[BOOKING MODEL] DELETE id=${id}`);
  const result = await supabase.from(TABLE).delete().eq('id', id).select().single();
  handleSupabase('bookings.delete', result);
  logger.success(`[BOOKING MODEL] Deleted booking id=${id}`);
  return true;
};

module.exports = {
  mapBooking,
  create,
  findById,
  findMany,
  updateById,
  deleteById,
};
