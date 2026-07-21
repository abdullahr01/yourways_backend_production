exports.successResponse = (res, code, message, data = null) => {
  const logger = require('./logger');
  logger.info(`[RESPONSE] ${code} success: ${message}`);
  return res.status(code).json({
    success: true,
    message,
    data,
  });
};

exports.errorResponse = (res, code, message, error = null) => {
  const logger = require('./logger');
  logger.error(`[RESPONSE] ${code} error: ${message} | ${error?.message || error || ''}`);
  return res.status(code).json({
    success: false,
    message,
    error: error?.message || error,
  });
};
