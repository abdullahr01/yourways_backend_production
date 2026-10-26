const isWebsiteOrigin = (origin) => {
  if (origin === 'https://yourwaycouriers.co.uk') return true;
  return process.env.NODE_ENV !== 'production' &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
};

module.exports = (req) => {
  const consent = isWebsiteOrigin(req.get('Origin')) && req.get('X-Marketing-Consent') === 'all'
    ? 'all'
    : 'essential';
  return {
    marketingConsent: consent,
    fbp: consent === 'all' ? req.get('X-Fbp') || null : null,
    fbc: consent === 'all' ? req.get('X-Fbc') || null : null,
    ip: consent === 'all' ? req.ip || null : null,
    userAgent: consent === 'all' ? req.get('User-Agent') || null : null,
  };
};
