const supabase = require('../config/database');
const logger = require('../utils/logger');
const { handleSupabase, logPayload } = require('../utils/supabaseHelper');
const { signToken } = require('../middleware/auth');
const { stripUndefined } = require('../utils/caseMapper');

const TABLE = 'drivers';

const mapDriver = (row) => {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address ?? null,
    dob: row.dob ?? null,
    licenseNumber: row.license_number ?? null,
    vehicleType: row.vehicle_type ?? null,
    vehicleNumber: row.vehicle_number ?? null,
    // Uploaded by the admin app via POST /api/uploads/driver-photo, which puts
    // it in the PUBLIC driver-photos bucket and returns a permanent URL — that
    // URL is all we store. Public because customers see the driver's photo on
    // the tracking screen.
    profilePictureUrl: row.profile_picture_url ?? null,
    isApprovedByAdmin: row.is_approved_by_admin,
    status: row.status,
    isOnline: row.is_online,
    lastOnlineAt: row.last_online_at,
    currentLocation: {
      latitude: row.current_latitude ?? null,
      longitude: row.current_longitude ?? null,
      lastUpdated: row.location_updated_at ?? null,
    },
    completedOrders: row.completed_orders,
    rating: Number(row.rating) || 0,
    totalRatings: row.total_ratings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toDbInsert = (data) =>
  stripUndefined({
    name: data.name,
    email: data.email?.toLowerCase?.() ?? data.email,
    phone: data.phone,
    address: data.address,
    dob: data.dob || null,
    license_number: data.licenseNumber ?? data.license_number,
    vehicle_type: data.vehicleType ?? data.vehicle_type,
    vehicle_number: data.vehicleNumber ?? data.vehicle_number,
    profile_picture_url: data.profilePictureUrl ?? data.profile_picture_url ?? null,
    is_approved_by_admin: data.isApprovedByAdmin ?? false,
    status: data.status || 'inactive',
    is_online: false,
  });

const toDbUpdate = (data) =>
  stripUndefined({
    name: data.name,
    email: data.email !== undefined ? data.email?.toLowerCase?.() ?? data.email : undefined,
    phone: data.phone,
    address: data.address,
    dob: data.dob,
    license_number: data.licenseNumber ?? data.license_number,
    vehicle_type: data.vehicleType ?? data.vehicle_type,
    vehicle_number: data.vehicleNumber ?? data.vehicle_number,
    profile_picture_url: data.profilePictureUrl ?? data.profile_picture_url,
    is_approved_by_admin: data.isApprovedByAdmin ?? data.is_approved_by_admin,
    status: data.status,
    is_online: data.isOnline ?? data.is_online,
    last_online_at: data.lastOnlineAt ?? data.last_online_at,
    current_latitude: data.currentLocation?.latitude ?? data.current_latitude,
    current_longitude: data.currentLocation?.longitude ?? data.current_longitude,
    location_updated_at: data.currentLocation?.lastUpdated ?? data.location_updated_at,
    completed_orders: data.completedOrders ?? data.completed_orders,
    rating: data.rating,
    total_ratings: data.totalRatings ?? data.total_ratings,
  });

const generateAuthToken = (driver) => {
  logger.info(`[DRIVER MODEL] Generating JWT for driver ${driver.id || driver._id}`);
  return signToken({
    _id: driver.id || driver._id,
    id: driver.id || driver._id,
    phone: driver.phone,
    email: driver.email,
    name: driver.name,
    role: 'driver',
  });
};

const create = async (data) => {
  logger.info(`[DRIVER MODEL] INSERT → ${TABLE}`);
  logPayload('driver.create', data);
  const result = await supabase.from(TABLE).insert(toDbInsert(data)).select().single();
  const row = handleSupabase('drivers.insert', result);
  logger.success(`[DRIVER MODEL] Created driver id=${row.id}`);
  return mapDriver(row);
};

const findByPhone = async (phone) => {
  logger.info(`[DRIVER MODEL] SELECT by phone=${phone}`);
  const result = await supabase.from(TABLE).select('*').eq('phone', phone).maybeSingle();
  const row = handleSupabase('drivers.findByPhone', result, { allowNull: true });
  return mapDriver(row);
};

const findById = async (id) => {
  logger.info(`[DRIVER MODEL] SELECT by id=${id}`);
  const result = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  const row = handleSupabase('drivers.findById', result, { allowNull: true });
  return mapDriver(row);
};

const findExisting = async ({ email, phone }) => {
  logger.info(`[DRIVER MODEL] SELECT existing email/phone`);
  if (phone) {
    const byPhone = await findByPhone(phone);
    if (byPhone) return byPhone;
  }
  if (email) {
    const result = await supabase.from(TABLE).select('*').eq('email', email).maybeSingle();
    const row = handleSupabase('drivers.findByEmail', result, { allowNull: true });
    return mapDriver(row);
  }
  return null;
};

const findAll = async () => {
  logger.info(`[DRIVER MODEL] SELECT all drivers`);
  const result = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
  const rows = handleSupabase('drivers.findAll', result);
  logger.info(`[DRIVER MODEL] Found ${rows.length} drivers`);
  return rows.map(mapDriver);
};

const updateById = async (id, data) => {
  logger.info(`[DRIVER MODEL] UPDATE id=${id}`);
  logPayload('driver.update', data);
  const result = await supabase.from(TABLE).update(toDbUpdate(data)).eq('id', id).select().single();
  const row = handleSupabase('drivers.update', result);
  return mapDriver(row);
};

const updateLocation = async (id, latitude, longitude) => {
  logger.info(`[DRIVER MODEL] Location update id=${id} lat=${latitude} lng=${longitude}`);
  return updateById(id, {
    current_latitude: latitude,
    current_longitude: longitude,
    location_updated_at: new Date().toISOString(),
  });
};

const incrementCompletedOrders = async (id) => {
  logger.info(`[DRIVER MODEL] Increment completed_orders id=${id}`);
  const driver = await findById(id);
  if (!driver) throw new Error('Driver not found');
  return updateById(id, { completedOrders: (driver.completedOrders || 0) + 1 });
};

module.exports = {
  mapDriver,
  create,
  findByPhone,
  findById,
  findExisting,
  findAll,
  updateById,
  updateLocation,
  incrementCompletedOrders,
  generateAuthToken,
};
