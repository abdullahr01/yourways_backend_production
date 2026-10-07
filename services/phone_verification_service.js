const firebase = require('../config/firebase');
const logger = require('../utils/logger');

const withStatus = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * Comparable form of a phone number: no spaces or punctuation, and UK
 * national numbers ("07…", "447…", "0044…") written as "+447…".
 */
const normalizePhone = (phone) => {
  let value = String(phone || '').replace(/[\s\-().]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (/^0\d{10}$/.test(value)) value = `+44${value.slice(1)}`;
  if (/^44\d{10}$/.test(value)) value = `+${value}`;
  return value;
};

class PhoneVerificationService {
  /** False only when Firebase isn't configured (local development). */
  isEnforced() {
    return firebase.isConfigured();
  }

  /**
   * Proves the caller completed the Firebase phone OTP for `phone`: the
   * firebaseIdToken must be a valid, unexpired token from this Firebase
   * project whose phone_number is the same number. Throws 401 otherwise.
   */
  async assertOwnsPhone(phone, firebaseIdToken) {
    if (!this.isEnforced()) {
      logger.warn('[PHONE VERIFY] Skipped — Firebase not configured, login is NOT phone-verified');
      return;
    }
    if (typeof firebaseIdToken !== 'string' || !firebaseIdToken.trim()) {
      throw withStatus('firebaseIdToken is required. Verify the phone number with the SMS code first.', 401);
    }

    let decoded;
    try {
      decoded = await firebase.getAuth().verifyIdToken(firebaseIdToken.trim());
    } catch (err) {
      logger.warn(`[PHONE VERIFY] Rejected token: ${err.code || err.message}`);
      throw withStatus('Phone verification failed or expired. Please verify the phone number again.', 401);
    }

    if (!decoded.phone_number) {
      throw withStatus('This Firebase sign-in has no verified phone number.', 401);
    }
    if (normalizePhone(decoded.phone_number) !== normalizePhone(phone)) {
      logger.warn('[PHONE VERIFY] Rejected token: phone number does not match the request');
      throw withStatus('The verified phone number does not match the phone number sent.', 401);
    }
    logger.info('[PHONE VERIFY] Phone ownership verified');
  }
}

module.exports = new PhoneVerificationService();
module.exports.normalizePhone = normalizePhone;
