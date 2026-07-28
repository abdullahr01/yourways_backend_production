const MapsService = require('../services/maps_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

/**
 * Thin backend proxy around Google Maps Platform (KB Section 12 "External
 * Integrations") so the mobile/web apps never need their own Distance
 * Matrix/Geocoding key — only the backend's restricted server-side key is
 * used. Frontend still uses its own key for Places Autocomplete + map
 * rendering (Maps SDK for Android/iOS, Maps JavaScript API), which are
 * inherently client-side.
 */
class MapsController {
  /**
   * GET /api/maps/geocode?address=SW1A 1AA
   */
  async geocode(req, res) {
    try {
      const { address } = req.query;
      logger.info(`[MAPS CTRL] geocode request: ${address}`);
      if (!address) {
        return errorResponse(res, 400, 'address query parameter is required');
      }

      const result = await MapsService.geocode(address);
      if (!result) {
        return errorResponse(res, 404, 'Could not resolve that address');
      }

      return successResponse(res, 200, 'Address geocoded successfully', result);
    } catch (err) {
      logger.error(`[MAPS CTRL] geocode failed: ${err.message}`);
      return errorResponse(res, 500, 'Geocoding failed', err);
    }
  }

  /**
   * GET /api/maps/distance?origin=SW1A 1AA&destination=E1 6AN
   */
  async distance(req, res) {
    try {
      const { origin, destination } = req.query;
      logger.info(`[MAPS CTRL] distance request: ${origin} -> ${destination}`);
      if (!origin || !destination) {
        return errorResponse(res, 400, 'origin and destination query parameters are required');
      }

      const result = await MapsService.getDistance(origin, destination);
      return successResponse(res, 200, 'Distance calculated successfully', result);
    } catch (err) {
      logger.error(`[MAPS CTRL] distance failed: ${err.message}`);
      return errorResponse(res, 500, 'Distance calculation failed', err);
    }
  }
}

module.exports = new MapsController();
