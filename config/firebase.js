const admin = require('firebase-admin');
const logger = require('../utils/logger');

/**
 * Firebase Admin, used only to send FCM push notifications.
 *
 * FIREBASE_SERVICE_ACCOUNT holds the service-account key from the SAME
 * Firebase project the Flutter apps use (Console → Project settings →
 * Service accounts → Generate new private key). Either the raw JSON or the
 * JSON base64-encoded is accepted, since multi-line JSON is awkward to paste
 * into some hosting dashboards.
 *
 * Without it the rest of the API runs normally and notifications are skipped.
 */

const parseServiceAccount = (raw) => {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const account = JSON.parse(text);
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error('missing project_id, client_email or private_key');
  }
  // Env dashboards often turn the key's newlines into literal "\n".
  account.private_key = account.private_key.replace(/\\n/g, '\n');
  return account;
};

let messaging = null;
let projectId = null;

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

if (raw) {
  try {
    const account = parseServiceAccount(raw);
    const app = admin.initializeApp({ credential: admin.credential.cert(account) });
    messaging = admin.messaging(app);
    projectId = account.project_id;
    logger.success(`[FIREBASE] Messaging ready (project ${projectId})`);
  } catch (err) {
    logger.error(`[FIREBASE] FIREBASE_SERVICE_ACCOUNT is invalid — push notifications disabled: ${err.message}`);
  }
} else {
  logger.warn('[FIREBASE] FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled');
}

const getMessaging = () => messaging;

const isConfigured = () => Boolean(messaging);

module.exports = { getMessaging, isConfigured, projectId };
