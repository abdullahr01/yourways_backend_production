const logger = require('../utils/logger');
const { findCatalogItem } = require('../data/service_templates');
const MapsService = require('./maps_service');

// Business constants (KB Section 11.3 "Future Scalability" flags these as the
// values to eventually move into an admin-configurable `pricing_rules` table —
// kept as named constants here so they are at least centralized/documented).
const CALLOUT_FEE = 35; // flat call-out charge
const PER_MILE_RATE = 2.5; // £ per mile (real distance now, via Google Distance Matrix)
const VAT_RATE = 0.2; // UK VAT
const COMPETITOR_DISCOUNT_RATE = 0.2; // "20% less than competitors" — applied to the standard total

/**
 * Quotation engine (YourWays doc Section 6.2 Step 3 / KB Section 11.3).
 *
 * Pricing depends on: real-world distance (Google Distance Matrix), item
 * weight/quantity/category, manpower tier, elevator/lift access at each end
 * (scaled by how many boxes/trips are involved), packing, dismantling,
 * insurance, parking access, and a flat volume discount for bigger jobs.
 *
 * The final customer-facing price is the computed "standard" price minus a
 * flat 20% platform discount ("20% less than competitors"). Both numbers are
 * returned so the UI can show a struck-through standard price next to the
 * discounted final price ("You save £X").
 */
class PricingService {
  getManpowerCost(manpowerRequired) {
    const map = {
      '1 Man (Driver Assisted)': 45,
      '2 Man Team': 90,
      '3 Man Team': 135,
      '4+ Man Team': 180,
    };
    return map[manpowerRequired] || 90;
  }

  /**
   * Floor/elevator charge (KB Section 6.2 "Floor Level"/"Lift Access").
   * Waived entirely when there's a lift or the property is ground floor —
   * otherwise scaled by how many trips the crew realistically needs to make
   * up/down the stairs, driven by how many boxes/items are in the job.
   */
  getFloorCharge(floorLevel, hasLift, itemCount = 0) {
    if (hasLift || floorLevel === 'Ground Floor') return 0;
    const baseMap = {
      '1st Floor': 15,
      '2nd Floor': 30,
      '3rd Floor+': 50,
      Basement: 20,
    };
    const base = baseMap[floorLevel] || 0;
    const tripMultiplier = Math.max(1, Math.ceil(itemCount / 8));
    return Math.round(base * tripMultiplier * 100) / 100;
  }

  getParkingCharge(parkingAccess) {
    const map = {
      'Easy Access (Driveway/Loading Bay)': 0,
      'Street Parking': 10,
      'Difficult Access (Permits/Long Carry)': 25,
      'Restricted Access': 35,
      'No Parking Nearby': 45,
    };
    return map[parkingAccess] || 0;
  }

  getPackingCost(packingService) {
    const map = {
      None: 0,
      'Materials Only': 25,
      'Fragile Items Only': 40,
      'Full Packing Service': 80,
    };
    return map[packingService] || 0;
  }

  /**
   * Per-item line cost, using the KB Section 6.5/11.3 catalog lookup:
   *  - If the customer supplied "Estimated Weight (kg)", that value wins.
   *  - Otherwise fall back to the catalog item's real-world default weight
   *    (e.g. ~250kg for an Upright Piano, ~8kg for a Small Box) instead of a
   *    flat 15kg guess for every item regardless of type.
   *  - The item's category `pricingMultiplier` (e.g. 2.5x for pianos, 2.0x for
   *    Specialist & Antique, 2.2x for Industrial) is applied to the line cost,
   *    directly addressing the KB-flagged under-pricing gap for those categories.
   */
  calculateItemsCost(items = []) {
    return items.reduce((sum, bookingItem) => {
      const qty = bookingItem.quantity || 1;
      const modifiers = bookingItem.modifiers || {};
      const providedWeight =
        typeof modifiers.get === 'function'
          ? modifiers.get('Estimated Weight (kg)')
          : modifiers['Estimated Weight (kg)'];

      const catalogEntry = findCatalogItem(bookingItem.itemName || bookingItem.name);
      const fallbackWeight = catalogEntry?.defaultWeightKg ?? 15;
      const weight =
        providedWeight !== undefined && providedWeight !== null && providedWeight !== ''
          ? Number(providedWeight)
          : Number(fallbackWeight);

      const pricingMultiplier = catalogEntry?.pricingMultiplier ?? 1;
      const lineCost = qty * (5 + weight * 0.5) * pricingMultiplier;

      return sum + lineCost;
    }, 0);
  }

  /**
   * Main quotation calculation — returns priceBreakdown + total.
   * Async because real-world distance is now sourced from Google Distance
   * Matrix API (with an automatic offline heuristic fallback — see MapsService).
   */
  async calculateQuotation(bookingData) {
    logger.info('[PRICING] Starting quotation calculation...');
    logger.info(`[PRICING] Route: ${bookingData.collectionPostcode} -> ${bookingData.deliveryPostcode}`);

    const { distanceMiles, durationMinutes, durationInTrafficMinutes, source } = await MapsService.getDistance(
      bookingData.collectionPostcode,
      bookingData.deliveryPostcode
    );
    logger.info(`[PRICING] Distance source=${source} miles=${distanceMiles} duration=${durationMinutes}min`);

    const basePrice = CALLOUT_FEE + distanceMiles * PER_MILE_RATE;
    const manpowerCost = this.getManpowerCost(bookingData.manpowerRequired);
    const itemsCost = this.calculateItemsCost(bookingData.items);

    const itemCount = (bookingData.items || []).reduce((s, i) => s + (i.quantity || 1), 0);

    const floorCharge =
      this.getFloorCharge(bookingData.collectionFloorLevel, bookingData.collectionLiftAccess, itemCount) +
      this.getFloorCharge(bookingData.deliveryFloorLevel, bookingData.deliveryLiftAccess, itemCount);

    const packingCost = this.getPackingCost(bookingData.packingService);
    const dismantlingCost = bookingData.dismantlingRequired ? 40 : 0;
    const insuranceCost = (bookingData.insuranceValue || 0) * 0.02;
    const parkingCharge = this.getParkingCharge(bookingData.parkingAccess);

    const volumeDiscount = itemCount >= 10 ? 25 : itemCount >= 5 ? 10 : 0;

    const subtotal =
      basePrice +
      manpowerCost +
      itemsCost +
      floorCharge +
      packingCost +
      dismantlingCost +
      insuranceCost +
      parkingCharge -
      volumeDiscount;

    const vat = subtotal * VAT_RATE;
    const standardTotal = Math.round((subtotal + vat) * 100) / 100;

    // "20% less than competitors" — the actual chargeable/displayed price.
    const discountAmount = Math.round(standardTotal * COMPETITOR_DISCOUNT_RATE * 100) / 100;
    const total = Math.round((standardTotal - discountAmount) * 100) / 100;

    const estimatedDeliveryHours = Math.max(
      2,
      Math.ceil((durationMinutes || distanceMiles * 2.2) / 60) + Math.ceil(itemCount / 5)
    );

    const breakdown = {
      distanceMiles,
      durationMinutes,
      durationInTrafficMinutes,
      distanceSource: source, // 'google' | 'heuristic'
      basePrice: Math.round(basePrice * 100) / 100,
      manpowerCost,
      itemsCost: Math.round(itemsCost * 100) / 100,
      floorCharge,
      packingCost,
      dismantlingCost,
      insuranceCost: Math.round(insuranceCost * 100) / 100,
      parkingCharge,
      volumeDiscount,
      subtotal: Math.round(subtotal * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      // "Was" price — shown struck-through in the UI.
      standardTotal,
      discountPercentage: COMPETITOR_DISCOUNT_RATE * 100,
      discountAmount,
      // Final chargeable price (what gets saved as calculatedPrice/totalPrice).
      total,
      finalTotal: total,
      estimatedDeliveryHours,
    };

    logger.success(
      `[PRICING] Standard £${standardTotal} -> Final £${total} (20% off, you save £${discountAmount}) | ${distanceMiles}mi, ~${estimatedDeliveryHours}h`
    );
    logger.info(`[PRICING] Breakdown: ${JSON.stringify(breakdown)}`);

    return breakdown;
  }
}

module.exports = new PricingService();
