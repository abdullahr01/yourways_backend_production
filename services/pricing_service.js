const logger = require('../utils/logger');
const CatalogService = require('./catalog_service');
const MapsService = require('./maps_service');

// Business constants (KB Section 11.3 "Future Scalability" flags these as the
// values to eventually move into an admin-configurable `pricing_rules` table —
// kept as named constants here so they are at least centralized/documented).
const PER_MILE_RATE = 2.5; // £ per mile (real distance now, via Google Distance Matrix)
const VAT_RATE = 0.2; // UK VAT
const COMPETITOR_DISCOUNT_RATE = 0.2; // "20% less than competitors" — applied to the standard total

// Labour: UK general logistics / warehouse operative band (~£12.50–£15/hr).
// Short local jobs (≤10 miles) sit on the National Living Wage floor.
// Longer jobs pay more per hour, matching the 15-mile → £15/hr example,
// capped at the typical HGV/specialist ceiling from the same research.
const LABOUR_HOURLY_RATE_LOCAL = 12.5; // £/hour per person, jobs up to 10 miles
const LABOUR_LOCAL_MILES = 10;
const LABOUR_RATE_PER_EXTRA_MILE = 0.5; // 10 mi = £12.50, 15 mi = £15.00
const LABOUR_HOURLY_RATE_CAP = 23; // typical UK HGV upper band

/**
 * Quotation engine (YourWays doc Section 6.2 Step 3 / KB Section 11.3).
 *
 * Pricing depends on: real-world distance (Google Distance Matrix), item
 * weight/quantity/category, manpower (hourly rate × people × estimated hours,
 * with the hourly rate rising after 10 miles), elevator/lift access at each
 * end (scaled by how many boxes/trips are involved), packing, dismantling,
 * insurance, and a flat volume discount for bigger jobs. No call-out fee
 * and no parking charge.
 *
 * The final customer-facing price is the computed "standard" price minus a
 * flat 20% platform discount ("20% less than competitors"). Both numbers are
 * returned so the UI can show a struck-through standard price next to the
 * discounted final price ("You save £X").
 */
class PricingService {
  /**
   * How many people the customer asked for. Accepts both the website labels
   * (`Driver Only`, `1 Man`, `2 Man Team`) and the older backend labels.
   */
  getLabourHeadcount(manpowerRequired) {
    const label = String(manpowerRequired || '').toLowerCase();
    if (label.includes('4+') || label.includes('4 man')) return 4;
    if (label.includes('3')) return 3;
    if (label.includes('2')) return 2;
    if (label.includes('1') || label.includes('driver')) return 1;
    return 2;
  }

  /**
   * Hourly rate per person, based on trip length.
   * 1–10 miles → £12.50 (UK general logistics / NLW band)
   * 15 miles  → £15.00
   * longer    → +£0.50 per extra mile, capped at £23
   */
  getLabourHourlyRate(distanceMiles) {
    const miles = Math.max(0, Number(distanceMiles) || 0);
    if (miles <= LABOUR_LOCAL_MILES) return LABOUR_HOURLY_RATE_LOCAL;
    const rate = LABOUR_HOURLY_RATE_LOCAL + (miles - LABOUR_LOCAL_MILES) * LABOUR_RATE_PER_EXTRA_MILE;
    return Math.round(Math.min(rate, LABOUR_HOURLY_RATE_CAP) * 100) / 100;
  }

  /**
   * Labour for the job: people × hourly rate × estimated hours.
   * Hours use the same estimate as the quote's delivery window so a 3-mile
   * sofa move does not pay the old flat £90 "2 man team" lump.
   */
  getManpowerCost(manpowerRequired, distanceMiles, estimatedHours) {
    const headcount = this.getLabourHeadcount(manpowerRequired);
    const hourlyRate = this.getLabourHourlyRate(distanceMiles);
    const hours = Math.max(1, Number(estimatedHours) || 1);
    return Math.round(headcount * hourlyRate * hours * 100) / 100;
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
      '1st Floor': 5,
      '2nd Floor': 20,
      '3rd Floor+': 40,
      Basement: 10,
    };
    const base = baseMap[floorLevel] || 0;
    const tripMultiplier = Math.max(1, Math.ceil(itemCount / 8));
    return Math.round(base * tripMultiplier * 100) / 100;
  }

  getParkingCharge() {
    return 0;
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
   * Per-item line cost, using the admin-managed DB catalog (CatalogService,
   * backed by service_items — see sql/005_driver_and_catalog.sql):
   *  - If the admin set an explicit `basePrice` on the item, pricing uses
   *    `qty * basePrice * pricingMultiplier` directly — this is what lets an
   *    admin "type a price and have it change in the system".
   *  - Otherwise (no basePrice override, the default for most items), it
   *    falls back to the original weight-based formula:
   *     - If the customer supplied "Estimated Weight (kg)", that value wins.
   *     - Otherwise use the catalog item's real-world default weight (e.g.
   *       ~250kg for an Upright Piano, ~8kg for a Small Box) instead of a
   *       flat 15kg guess for every item regardless of type.
   *  - The item's category `pricingMultiplier` (e.g. 2.5x for pianos, 2.0x for
   *    Specialist & Antique, 2.2x for Industrial) is applied either way.
   *
   * Async because the catalog lookup is DB-backed (with an in-memory cache —
   * see CatalogService) instead of a synchronous in-process object.
   */
  async calculateItemsCost(items = []) {
    let sum = 0;
    for (const bookingItem of items) {
      const qty = bookingItem.quantity || 1;
      const modifiers = bookingItem.modifiers || {};
      const providedWeight =
        typeof modifiers.get === 'function'
          ? modifiers.get('Estimated Weight (kg)')
          : modifiers['Estimated Weight (kg)'];

      const catalogEntry = await CatalogService.findCatalogItem(bookingItem.itemName || bookingItem.name);
      const pricingMultiplier = catalogEntry?.pricingMultiplier ?? 1;

      if (catalogEntry?.basePrice != null) {
        sum += qty * Number(catalogEntry.basePrice) * pricingMultiplier;
        continue;
      }

      const fallbackWeight = catalogEntry?.defaultWeightKg ?? 15;
      const weight =
        providedWeight !== undefined && providedWeight !== null && providedWeight !== ''
          ? Number(providedWeight)
          : Number(fallbackWeight);

      sum += qty * (2 + weight * 0.3) * pricingMultiplier;
    }
    return sum;
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

    const itemCount = (bookingData.items || []).reduce((s, i) => s + (i.quantity || 1), 0);
    const estimatedDeliveryHours = Math.max(
      2,
      Math.ceil((durationMinutes || distanceMiles * 2.2) / 60) + Math.ceil(itemCount / 5)
    );

    const basePrice = distanceMiles * PER_MILE_RATE;
    const manpowerCost = this.getManpowerCost(
      bookingData.manpowerRequired,
      distanceMiles,
      estimatedDeliveryHours
    );
    const itemsCost = await this.calculateItemsCost(bookingData.items);

    const floorCharge =
      this.getFloorCharge(bookingData.collectionFloorLevel, bookingData.collectionLiftAccess, itemCount) +
      this.getFloorCharge(bookingData.deliveryFloorLevel, bookingData.deliveryLiftAccess, itemCount);

    const packingCost = this.getPackingCost(bookingData.packingService);
    const dismantlingCost = bookingData.dismantlingRequired ? 40 : 0;
    const insuranceCost = (bookingData.insuranceValue || 0) * 0.02;
    const parkingCharge = this.getParkingCharge();

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
