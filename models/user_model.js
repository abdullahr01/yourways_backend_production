const jwt = require('jsonwebtoken');
const supabase = require('../config/database');
const logger = require('../utils/logger');
const { handleSupabase, logPayload } = require('../utils/supabaseHelper');
const { JWT_SECRET } = require('../middleware/auth');
const { stripUndefined } = require('../utils/caseMapper');

const TABLE = 'users';

/** Map DB row → API shape (camelCase + _id for Flutter compatibility) */
const mapUser = (row) => {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address ?? null,
    dob: row.dob ?? null,
    status: row.status,
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
    status: data.status || 'active',
  });

const toDbUpdate = (data) =>
  stripUndefined({
    name: data.name,
    email: data.email !== undefined ? data.email?.toLowerCase?.() ?? data.email : undefined,
    phone: data.phone,
    address: data.address,
    dob: data.dob,
    status: data.status,
  });

const generateAuthToken = (user) => {
  logger.info(`[USER MODEL] Generating JWT for user ${user.id || user._id}`);
  const token = jwt.sign(
    {
      _id: user.id || user._id,
      id: user.id || user._id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      role: 'user',
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  logger.debug(`[USER MODEL] JWT issued (7d expiry)`);
  return token;
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw new Error('Invalid or expired token');
  }
};

const create = async (data) => {
  logger.info(`[USER MODEL] INSERT → ${TABLE}`);
  logPayload('user.create', data);
  const payload = toDbInsert(data);

  const result = await supabase.from(TABLE).insert(payload).select().single();
  const row = handleSupabase('users.insert', result);
  logger.success(`[USER MODEL] Created user id=${row.id} phone=${row.phone}`);
  return mapUser(row);
};

const findByPhone = async (phone) => {
  logger.info(`[USER MODEL] SELECT by phone=${phone}`);
  const result = await supabase.from(TABLE).select('*').eq('phone', phone).maybeSingle();
  const row = handleSupabase('users.findByPhone', result, { allowNull: true });
  return mapUser(row);
};

const findById = async (id) => {
  logger.info(`[USER MODEL] SELECT by id=${id}`);
  const result = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  const row = handleSupabase('users.findById', result, { allowNull: true });
  return mapUser(row);
};

const findByEmailOrPhone = async ({ email, phone }) => {
  logger.info(`[USER MODEL] SELECT existing email/phone`);
  if (phone) {
    const byPhone = await findByPhone(phone);
    if (byPhone) return byPhone;
  }
  if (email) {
    logger.info(`[USER MODEL] SELECT by email`);
    const result = await supabase.from(TABLE).select('*').eq('email', email).maybeSingle();
    const row = handleSupabase('users.findByEmail', result, { allowNull: true });
    return mapUser(row);
  }
  return null;
};

const findAll = async () => {
  logger.info(`[USER MODEL] SELECT all users`);
  const result = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
  const rows = handleSupabase('users.findAll', result);
  logger.info(`[USER MODEL] Found ${rows.length} users`);
  return rows.map(mapUser);
};

const updateById = async (id, data) => {
  logger.info(`[USER MODEL] UPDATE id=${id}`);
  logPayload('user.update', data);
  const result = await supabase.from(TABLE).update(toDbUpdate(data)).eq('id', id).select().single();
  const row = handleSupabase('users.update', result);
  return mapUser(row);
};

module.exports = {
  mapUser,
  create,
  findByPhone,
  findById,
  findByEmailOrPhone,
  findAll,
  updateById,
  generateAuthToken,
  verifyToken,
};
