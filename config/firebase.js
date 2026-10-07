const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging: getAppMessaging } = require('firebase-admin/messaging');
const { getAuth: getAppAuth } = require('firebase-admin/auth');
const logger = require('../utils/logger');

/**
 * Firebase Admin: sends FCM push notifications and verifies the phone-OTP
 * ID tokens the apps send on login and register.
 *
 * FIREBASE_SERVICE_ACCOUNT holds the service-account key from the SAME
 * Firebase project the Flutter apps use (Console → Project settings →
 * Service accounts → Generate new private key). Either the raw JSON or the
 * JSON base64-encoded is accepted, since multi-line JSON is awkward to paste
 * into some hosting dashboards.
 *
 * Without it the rest of the API runs normally, notifications are skipped
 * and logins are not phone-verified (local development only).
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
let auth = null;
let projectId = null;

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

if (raw) {
  try {
    const account = parseServiceAccount(raw);
    const app = initializeApp({ credential: cert(account) });
    messaging = getAppMessaging(app);
    auth = getAppAuth(app);
    projectId = account.project_id;
    logger.success(`[FIREBASE] Messaging ready (project ${projectId})`);
  } catch (err) {
    logger.error(`[FIREBASE] FIREBASE_SERVICE_ACCOUNT is invalid — push notifications disabled: ${err.message}`);
  }
} else {
  logger.warn('[FIREBASE] FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled');
}

const getMessaging = () => messaging;

const getAuth = () => auth;

const isConfigured = () => Boolean(messaging);

module.exports = { getMessaging, getAuth, isConfigured, projectId };
