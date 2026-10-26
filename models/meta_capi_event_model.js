const supabase = require('../config/database');
const { handleSupabase, isUniqueViolation } = require('../utils/supabaseHelper');

const TABLE = 'meta_capi_events';

const enqueue = async ({ eventId, eventName, payload }) => {
  const result = await supabase
    .from(TABLE)
    .insert({ event_id: eventId, event_name: eventName, payload, status: 'pending' })
    .select('id')
    .maybeSingle();

  if (result.error && isUniqueViolation(result.error)) return false;
  handleSupabase('metaCapiEvents.enqueue', result);
  return true;
};

const claimDue = async (limit = 10) => {
  const result = await supabase.rpc('claim_meta_capi_events', { p_limit: limit });
  return handleSupabase('metaCapiEvents.claimDue', result) || [];
};

const markSent = async (id) => {
  const result = await supabase
    .from(TABLE)
    .update({
      status: 'sent',
      payload: null,
      locked_at: null,
      last_error_code: null,
      sent_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id')
    .single();
  handleSupabase('metaCapiEvents.markSent', result);
};

const markFailed = async (event, errorCode) => {
  const isTerminal = event.attempts >= 8;
  const delayMinutes = Math.min(60, 2 ** Math.min(event.attempts, 6));
  const result = await supabase
    .from(TABLE)
    .update({
      status: isTerminal ? 'failed' : 'pending',
      payload: isTerminal ? null : event.payload,
      next_attempt_at: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString(),
      locked_at: null,
      last_error_code: String(errorCode || 'send_failed').slice(0, 100),
    })
    .eq('id', event.id)
    .select('id')
    .single();
  handleSupabase('metaCapiEvents.markFailed', result);
};

module.exports = { enqueue, claimDue, markSent, markFailed };
