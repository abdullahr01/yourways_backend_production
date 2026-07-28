const bcrypt = require('bcryptjs');
const supabase = require('../config/database');
const logger = require('../utils/logger');
const { handleSupabase, logPayload } = require('../utils/supabaseHelper');
const { signToken } = require('../middleware/auth');
const { stripUndefined } = require('../utils/caseMapper');

const TABLE = 'admins';
const SALT_ROUNDS = 10;

const mapAdmin = (row, { includeSensitive = false } = {}) => {
  if (!row) return null;
  const admin = {
    _id: row.id,
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeSensitive) {
    admin.passwordHash = row.password_hash;
  }
  return admin;
};

const generateAuthToken = (admin) => {
  logger.info(`[ADMIN MODEL] Generating JWT for admin ${admin.id}`);
  return signToken({
    _id: admin.id,
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: 'admin',
  });
};

const hashPassword = async (password) => {
  logger.debug('[ADMIN MODEL] Hashing password...');
  return bcrypt.hash(password, SALT_ROUNDS);
};

const comparePassword = async (password, hash) => bcrypt.compare(password, hash);

const create = async ({ name, email, password, phone }) => {
  logger.info(`[ADMIN MODEL] INSERT → ${TABLE}`);
  logPayload('admin.create', { name, email, phone });

  const password_hash = await hashPassword(password);
  const payload = stripUndefined({
    name,
    email: email.toLowerCase(),
    password_hash,
    phone: phone || null,
    status: 'active',
  });

  const result = await supabase.from(TABLE).insert(payload).select().single();
  const row = handleSupabase('admins.insert', result);
  logger.success(`[ADMIN MODEL] Created admin id=${row.id}`);
  return mapAdmin(row);
};

const findByEmail = async (email, { withPassword = false } = {}) => {
  logger.info(`[ADMIN MODEL] SELECT by email`);
  const result = await supabase
    .from(TABLE)
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  const row = handleSupabase('admins.findByEmail', result, { allowNull: true });
  return mapAdmin(row, { includeSensitive: withPassword });
};

const findById = async (id) => {
  logger.info(`[ADMIN MODEL] SELECT by id=${id}`);
  const result = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  const row = handleSupabase('admins.findById', result, { allowNull: true });
  return mapAdmin(row);
};

const countAll = async () => {
  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true });
  if (error) {
    logger.error(`[ADMIN MODEL] count failed: ${error.message}`);
    throw new Error(error.message);
  }
  return count || 0;
};

const touchLastLogin = async (id) => {
  logger.info(`[ADMIN MODEL] Update last_login_at id=${id}`);
  const result = await supabase
    .from(TABLE)
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  const row = handleSupabase('admins.touchLastLogin', result);
  return mapAdmin(row);
};

module.exports = {
  mapAdmin,
  create,
  findByEmail,
  findById,
  countAll,
  touchLastLogin,
  generateAuthToken,
  comparePassword,
};
