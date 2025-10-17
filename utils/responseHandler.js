exports.successResponse = (res, code, message, data = null) => {
  return res.status(code).json({
    success: true,
    message,
    data,
  });
};

exports.errorResponse = (res, code, message, error = null) => {
  return res.status(code).json({
    success: false,
    message,
    error: error?.message || error,
  });
};
