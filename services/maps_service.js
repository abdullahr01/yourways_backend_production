const logger = require('../utils/logger');

/**
 * Google Maps Platform wrapper (Distance Matrix + Geocoding).
 *
 * KB Section 11.3/12 gap fix: pricing and tracking previously relied on a
 * synthetic postcode-character-diff heuristic. This service calls the real
 * Google APIs the project enabled (Distance Matrix API, Geocoding API) and
 * ALWAYS falls back to the deterministic heuristic if the key is missing or
 * the request fails, so booking/pricing/tracking never hard-crash because of
 * an external outage (KB 11.3 "Failure Handling" requirement).
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

class MapsService {
  isConfigured() {
    return Boolean(GOOGLE_MAPS_API_KEY);
  }

  /** Deterministic offline fallback — never throws, always returns a usable estimate. */
  _estimateDistanceHeuristic(collectionPostcode, deliveryPostcode) {
    const outward = (pc) => (pc || '').trim().split(/\s+/)[0].toUpperCase();
    const from = outward(collectionPostcode);
    const to = outward(deliveryPostcode);

    if (!from || !to) return { distanceMiles: 10, durationMinutes: 30 };
    if (from === to) return { distanceMiles: 5, durationMinutes: 15 };

    let diff = 0;
    for (let i = 0; i < Math.min(from.length, to.length); i++) {
      if (from[i] !== to[i]) diff++;
    }
    const distanceMiles = Math.min(150, Math.max(8, 10 + diff * 12));
    const durationMinutes = Math.round(distanceMiles * 2.2);
    return { distanceMiles, durationMinutes };
  }

  /**
   * Real-world distance + traffic-aware duration between two UK postcodes/addresses
   * via Google Distance Matrix API (KB Section 11.3/12 dependency).
   * @returns {Promise<{distanceMiles:number, durationMinutes:number, durationInTrafficMinutes:number|null, source:'google'|'heuristic'}>}
   */
  async getDistance(origin, destination) {
    if (!this.isConfigured()) {
      logger.warn('[MAPS] GOOGLE_MAPS_API_KEY not set — using postcode-diff heuristic fallback');
      return { ...this._estimateDistanceHeuristic(origin, destination), durationInTrafficMinutes: null, source: 'heuristic' };
    }
    if (!origin || !destination) {
      logger.warn('[MAPS] getDistance called without origin/destination — using heuristic fallback');
      return { ...this._estimateDistanceHeuristic(origin, destination), durationInTrafficMinutes: null, source: 'heuristic' };
    }

    try {
      const url =
        `${DISTANCE_MATRIX_URL}?units=imperial` +
        `&origins=${encodeURIComponent(`${origin}, UK`)}` +
        `&destinations=${encodeURIComponent(`${destination}, UK`)}` +
        `&departure_time=now&key=${GOOGLE_MAPS_API_KEY}`;

      logger.info(`[MAPS] Distance Matrix request: "${origin}" -> "${destination}"`);
      const response = await fetch(url);
      const json = await response.json();

      const element = json?.rows?.[0]?.elements?.[0];
      if (json.status !== 'OK' || !element || element.status !== 'OK') {
        logger.warn(
          `[MAPS] Distance Matrix returned no route (top=${json.status}, element=${element?.status}) — using heuristic fallback`
        );
        return { ...this._estimateDistanceHeuristic(origin, destination), durationInTrafficMinutes: null, source: 'heuristic' };
      }

      const distanceMiles = Math.round((element.distance.value / 1609.344) * 100) / 100;
      const durationMinutes = Math.round(element.duration.value / 60);
      const durationInTrafficMinutes = element.duration_in_traffic
        ? Math.round(element.duration_in_traffic.value / 60)
        : null;

      logger.success(
        `[MAPS] Google distance=${distanceMiles}mi duration=${durationMinutes}min traffic=${durationInTrafficMinutes ?? 'n/a'}min`
      );
      return { distanceMiles, durationMinutes, durationInTrafficMinutes, source: 'google' };
    } catch (err) {
      logger.error(`[MAPS] Distance Matrix request failed: ${err.message} — using heuristic fallback`);
      return { ...this._estimateDistanceHeuristic(origin, destination), durationInTrafficMinutes: null, source: 'heuristic' };
    }
  }

  /**
   * Address/postcode -> coordinates, used to store pickup/delivery pins on
   * bookings & orders for map rendering (KB Section 3.2 "Storage"/Section 16 Realtime).
   * Non-blocking by design: returns null on any failure instead of throwing.
   * @returns {Promise<{latitude:number, longitude:number, formattedAddress:string}|null>}
   */
  async geocode(address) {
    if (!this.isConfigured()) {
      logger.warn('[MAPS] Geocoding skipped — GOOGLE_MAPS_API_KEY not configured');
      return null;
    }
    if (!address || !String(address).trim()) return null;

    try {
      const url = `${GEOCODE_URL}?address=${encodeURIComponent(`${address}, UK`)}&key=${GOOGLE_MAPS_API_KEY}`;
      logger.info(`[MAPS] Geocoding: "${address}"`);
      const response = await fetch(url);
      const json = await response.json();

      const result = json?.results?.[0];
      if (json.status !== 'OK' || !result) {
        logger.warn(`[MAPS] Geocoding failed for "${address}" (status=${json.status})`);
        return null;
      }

      const { lat, lng } = result.geometry.location;
      logger.success(`[MAPS] Geocoded "${address}" -> ${lat}, ${lng}`);
      return { latitude: lat, longitude: lng, formattedAddress: result.formatted_address };
    } catch (err) {
      logger.error(`[MAPS] Geocoding request failed for "${address}": ${err.message}`);
      return null;
    }
  }

  /**
   * Live ETA from a driver's current GPS coordinates to a destination address —
   * powers `GET /api/orders/:id/tracking` (KB Section 9.5, inferred tracking endpoint).
   * @returns {Promise<{distanceMiles:number, etaMinutes:number}|null>}
   */
  async getEtaFromCoordinates(originLat, originLng, destinationAddress) {
    if (!this.isConfigured() || originLat == null || originLng == null || !destinationAddress) {
      return null;
    }

    try {
      const origin = `${originLat},${originLng}`;
      const url =
        `${DISTANCE_MATRIX_URL}?units=imperial` +
        `&origins=${encodeURIComponent(origin)}` +
        `&destinations=${encodeURIComponent(`${destinationAddress}, UK`)}` +
        `&departure_time=now&key=${GOOGLE_MAPS_API_KEY}`;

      const response = await fetch(url);
      const json = await response.json();
      const element = json?.rows?.[0]?.elements?.[0];
      if (json.status !== 'OK' || !element || element.status !== 'OK') {
        logger.warn(`[MAPS] ETA lookup failed (${json.status}/${element?.status})`);
        return null;
      }

      const distanceMiles = Math.round((element.distance.value / 1609.344) * 100) / 100;
      const etaMinutes = Math.round((element.duration_in_traffic || element.duration).value / 60);
      return { distanceMiles, etaMinutes };
    } catch (err) {
      logger.error(`[MAPS] ETA lookup error: ${err.message}`);
      return null;
    }
  }
}

module.exports = new MapsService();
