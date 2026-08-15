/**
 * Shared shape for the "where is the driver right now" endpoints
 * (GET /api/drivers/:id/location and GET /api/orders/:id/driver-location).
 *
 * The stored position is only ever the LAST ONE THE DRIVER APP PUSHED via
 * POST /api/drivers/:id/update-location. If that app is backgrounded, offline,
 * or the phone died, the row keeps its old coordinates forever and a map drawn
 * from them looks live while being minutes old. So every response carries the
 * age of the fix and an isStale flag, letting the client show
 * "last updated X ago" instead of a silently frozen marker.
 */

// A driver app pushing normally sends a fix well inside this window, so
// anything older means the app stopped reporting rather than the driver
// standing still.
const STALE_AFTER_SECONDS = 120;

const formatDriverLocation = (driver) => {
  const location = driver?.currentLocation || {};
  const hasLocation = location.latitude != null && location.longitude != null;
  const lastUpdated = location.lastUpdated || null;

  const ageSeconds =
    hasLocation && lastUpdated
      ? Math.max(0, Math.round((Date.now() - new Date(lastUpdated).getTime()) / 1000))
      : null;

  return {
    driverId: driver?.id || driver?._id || null,
    isOnline: !!driver?.isOnline,
    hasLocation,
    latitude: hasLocation ? Number(location.latitude) : null,
    longitude: hasLocation ? Number(location.longitude) : null,
    lastUpdated,
    ageSeconds,
    isStale: !hasLocation || ageSeconds === null || ageSeconds > STALE_AFTER_SECONDS,
    staleAfterSeconds: STALE_AFTER_SECONDS,
    // Preferred over polling this endpoint: the backend already pushes every
    // fix here as it arrives (services/realtime_service.js).
    realtimeChannel: driver?.id || driver?._id ? `driver-${driver.id || driver._id}` : null,
  };
};

module.exports = { formatDriverLocation, STALE_AFTER_SECONDS };
