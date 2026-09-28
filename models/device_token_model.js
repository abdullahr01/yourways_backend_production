const supabase = require('../config/database');
const logger = require('../utils/logger');
const { handleSupabase } = require('../utils/supabaseHelper');

const TABLE = 'device_tokens';

const OWNER_TYPES = ['user', 'driver', 'admin'];
const PLATFORMS = ['android', 'ios'];
const APPS = ['customer', 'driver', 'admin'];

// Tokens are only ever logged by their tail — enough to match against the
// app's own logs without putting a usable push address in ours.
const tail = (token) => `…${String(token).slice(-8)}`;

const mapDeviceToken = (row) => {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    token: row.token,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    platform: row.platform,
    app: row.app,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * Insert or refresh a token. Because the token column is unique, the same
 * phone registering again just bumps last_seen_at — and if another account
 * owned it (someone else logged in on this phone), ownership moves over.
 */
const upsert = async ({ token, ownerType, ownerId, platform, app }) => {
  logger.info(`[DEVICE TOKEN] UPSERT ${ownerType}:${ownerId} ${platform}/${app} token=${tail(token)}`);
  const result = await supabase
    .from(TABLE)
    .upsert(
      {
        token,
        owner_type: ownerType,
        owner_id: ownerId,
        platform,
        app,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    )
    .select()
    .single();
  return mapDeviceToken(handleSupabase('device_tokens.upsert', result));
};

/** Logout: only the caller's own row is removed, never someone else's. */
const removeForOwner = async (token, ownerType, ownerId) => {
  logger.info(`[DEVICE TOKEN] DELETE ${ownerType}:${ownerId} token=${tail(token)}`);
  const result = await supabase
    .from(TABLE)
    .delete({ count: 'exact' })
    .eq('token', token)
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId);
  handleSupabase('device_tokens.removeForOwner', result, { allowNull: true });
  return (result.count ?? 0) > 0;
};

const findByOwner = async (ownerType, ownerId) => {
  const result = await supabase
    .from(TABLE)
    .select('*')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId);
  const rows = handleSupabase('device_tokens.findByOwner', result);
  return rows.map(mapDeviceToken);
};

/** Tokens FCM reported as uninstalled / invalid. */
const removeTokens = async (tokens = []) => {
  if (!tokens.length) return 0;
  const result = await supabase.from(TABLE).delete({ count: 'exact' }).in('token', tokens);
  handleSupabase('device_tokens.removeTokens', result, { allowNull: true });
  logger.info(`[DEVICE TOKEN] Removed ${result.count ?? 0} dead token(s)`);
  return result.count ?? 0;
};

module.exports = {
  OWNER_TYPES,
  PLATFORMS,
  APPS,
  mapDeviceToken,
  upsert,
  removeForOwner,
  findByOwner,
  removeTokens,
};
