const supabase = require('../config/database');
const logger = require('../utils/logger');
const { handleSupabase, isUniqueViolation } = require('../utils/supabaseHelper');

const TABLE = 'notifications';

const STATUSES = ['pending', 'sent', 'failed', 'skipped'];

const mapNotification = (row) => {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    recipientType: row.recipient_type,
    recipientId: row.recipient_id,
    orderId: row.order_id,
    type: row.type,
    dedupeKey: row.dedupe_key,
    title: row.title,
    body: row.body,
    data: row.data || {},
    status: row.status,
    tokensTargeted: row.tokens_targeted,
    tokensSucceeded: row.tokens_succeeded,
    error: row.error,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * Reserve the slot for one push before sending it. dedupe_key is unique, so
 * a second attempt for the same event (double tap, retried request, two
 * requests racing) loses the insert and gets null back instead of a row.
 * A null dedupeKey is never deduplicated (used by the admin test push).
 */
const claim = async ({ recipientType, recipientId, orderId, type, dedupeKey, title, body, data }) => {
  logger.info(`[NOTIFICATION MODEL] CLAIM ${type} → ${recipientType}:${recipientId} key=${dedupeKey || '(none)'}`);
  const result = await supabase
    .from(TABLE)
    .insert({
      recipient_type: recipientType,
      recipient_id: recipientId,
      order_id: orderId || null,
      type,
      dedupe_key: dedupeKey || null,
      title,
      body,
      data: data || {},
      status: 'pending',
    })
    .select()
    .single();

  if (result.error && isUniqueViolation(result.error)) {
    logger.info(`[NOTIFICATION MODEL] Already claimed key=${dedupeKey} — skipping duplicate`);
    return null;
  }
  return mapNotification(handleSupabase('notifications.claim', result));
};

/** Record how the send went. sent_at is only stamped for a real delivery. */
const markResult = async (id, { status, tokensTargeted = 0, tokensSucceeded = 0, error = null }) => {
  const result = await supabase
    .from(TABLE)
    .update({
      status,
      tokens_targeted: tokensTargeted,
      tokens_succeeded: tokensSucceeded,
      error: error ? String(error).slice(0, 1000) : null,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select()
    .single();
  return mapNotification(handleSupabase('notifications.markResult', result));
};

module.exports = {
  STATUSES,
  mapNotification,
  claim,
  markResult,
};
