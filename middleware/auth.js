const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const RevokedToken = require('../models/revoked_token_model');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const JWT_EXPIRES_IN = '7d';

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (!header) return null;
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return header.trim();
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    logger.warn(`[AUTH] Token verify failed: ${err.message}`);
    throw new Error('Invalid or expired token');
  }
};

/**
 * Sign a new JWT with a unique `jti` (JWT ID). The jti is what makes logout
 * actually possible with stateless JWTs — see `revokeToken` below.
 */
const signToken = (payload) => {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ ...payload, jti }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  logger.debug(`[AUTH] Issued JWT jti=${jti} role=${payload.role} (7d expiry)`);
  return token;
};

/**
 * Logout: record the token's jti in the `revoked_tokens` table so any future
 * request presenting it is rejected, even though the JWT signature itself is
 * still technically valid until its natural expiry.
 */
const revokeToken = async (decoded) => {
  if (!decoded?.jti) {
    logger.warn('[AUTH] Cannot revoke a token with no jti (issued before logout feature existed)');
    return false;
  }
  const expiresAt = decoded.exp
    ? new Date(decoded.exp * 1000).toISOString()
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await RevokedToken.create(decoded.jti, expiresAt);
  return true;
};

/**
 * Require a valid, non-revoked JWT. Optionally restrict by role: 'user' | 'driver' | 'admin'
 */
const requireAuth = (roles = null) => async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      logger.warn(`[AUTH] Missing token on ${req.method} ${req.originalUrl}`);
      return errorResponse(res, 401, 'No token provided', new Error('Authorization token missing'));
    }

    const decoded = verifyToken(token);

    if (decoded.jti && (await RevokedToken.exists(decoded.jti))) {
      logger.warn(`[AUTH] Rejected revoked token jti=${decoded.jti} path=${req.originalUrl}`);
      return errorResponse(res, 401, 'Token has been revoked. Please log in again.');
    }

    logger.info(
      `[AUTH] OK role=${decoded.role || 'user'} id=${decoded._id || decoded.id} path=${req.originalUrl}`
    );

    if (roles) {
      const allowed = Array.isArray(roles) ? roles : [roles];
      const role = decoded.role || 'user';
      if (!allowed.includes(role)) {
        logger.warn(`[AUTH] Role denied: have=${role} need=${allowed.join('|')}`);
        return errorResponse(res, 403, 'Insufficient permissions');
      }
    }

    req.auth = decoded;
    req.user = decoded; // backward compatible
    next();
  } catch (err) {
    return errorResponse(res, 401, 'Invalid or expired token', err);
  }
};

/** Optional auth — attaches req.auth if token present & not revoked, otherwise continues. */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (token) {
      const decoded = verifyToken(token);
      if (decoded.jti && (await RevokedToken.exists(decoded.jti))) {
        logger.warn(`[AUTH] Optional token revoked — ignoring on ${req.originalUrl}`);
      } else {
        req.auth = decoded;
        req.user = decoded;
        logger.info(`[AUTH] Optional token accepted for ${req.originalUrl}`);
      }
    }
  } catch {
    logger.warn(`[AUTH] Optional token ignored (invalid) on ${req.originalUrl}`);
  }
  next();
};

module.exports = {
  JWT_SECRET,
  extractToken,
  verifyToken,
  signToken,
  revokeToken,
  requireAuth,
  optionalAuth,
};
