const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/responseHandler');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

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
 * Require a valid JWT. Optionally restrict by role: 'user' | 'driver' | 'admin'
 */
const requireAuth = (roles = null) => (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      logger.warn(`[AUTH] Missing token on ${req.method} ${req.originalUrl}`);
      return errorResponse(res, 401, 'No token provided', new Error('Authorization token missing'));
    }

    const decoded = verifyToken(token);
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

/** Optional auth — attaches req.auth if token present, otherwise continues. */
const optionalAuth = (req, res, next) => {
  try {
    const token = extractToken(req);
    if (token) {
      req.auth = verifyToken(token);
      req.user = req.auth;
      logger.info(`[AUTH] Optional token accepted for ${req.originalUrl}`);
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
  requireAuth,
  optionalAuth,
};
