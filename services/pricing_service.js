const logger = require('../utils/logger');

/**
 * Quotation engine (YourWays doc Section 6.2 Step 3).
 * Calculates price from distance, items, manpower, and service options.
 */
class PricingService {
  /**
   * Rough UK postcode distance estimate (miles) using outward codes.
   * Replace with Google Distance Matrix API in production.
   */
  estimateDistanceMiles(collectionPostcode, deliveryPostcode) {
    const outward = (pc) => (pc || '').trim().split(/\s+/)[0].toUpperCase();
    const from = outward(collectionPostcode);
    const to = outward(deliveryPostcode);

    if (!from || !to) return 10;
    if (from === to) return 5;

    let diff = 0;
    for (let i = 0; i < Math.min(from.length, to.length); i++) {
      if (from[i] !== to[i]) diff++;
    }
    return Math.min(150, Math.max(8, 10 + diff * 12));
  }

  getManpowerCost(manpowerRequired) {
    const map = {
      '1 Man (Driver Assisted)': 45,
      '2 Man Team': 90,
      '3 Man Team': 135,
      '4+ Man Team': 180,
    };
    return map[manpowerRequired] || 90;
  }

  getFloorCharge(floorLevel, hasLift) {
    if (hasLift || floorLevel === 'Ground Floor') return 0;
    const map = {
      '1st Floor': 15,
      '2nd Floor': 30,
      '3rd Floor+': 50,
      'Basement': 20,
    };
    return map[floorLevel] || 0;
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

  calculateItemsCost(items = []) {
    return items.reduce((sum, item) => {
      const qty = item.quantity || 1;
      const weight = item.modifiers?.get?.('Estimated Weight (kg)')
        ?? item.modifiers?.['Estimated Weight (kg)']
        ?? 15;
      return sum + qty * (5 + Number(weight) * 0.5);
    }, 0);
  }

  /**
   * Main quotation calculation — returns priceBreakdown + total.
   */
  calculateQuotation(bookingData) {
    logger.info('[PRICING] Starting quotation calculation...');
    logger.info(`[PRICING] Route: ${bookingData.collectionPostcode} -> ${bookingData.deliveryPostcode}`);

    const distanceMiles = this.estimateDistanceMiles(
      bookingData.collectionPostcode,
      bookingData.deliveryPostcode
    );
    const basePrice = 35 + distanceMiles * 2.5;
    const manpowerCost = this.getManpowerCost(bookingData.manpowerRequired);
    const itemsCost = this.calculateItemsCost(bookingData.items);
    const floorCharge =
      this.getFloorCharge(bookingData.collectionFloorLevel, bookingData.collectionLiftAccess) +
      this.getFloorCharge(bookingData.deliveryFloorLevel, bookingData.deliveryLiftAccess);
    const packingCost = this.getPackingCost(bookingData.packingService);
    const dismantlingCost = bookingData.dismantlingRequired ? 40 : 0;
    const insuranceCost = (bookingData.insuranceValue || 0) * 0.02;
    const parkingCharge = this.getParkingCharge(bookingData.parkingAccess);

    const itemCount = (bookingData.items || []).reduce((s, i) => s + (i.quantity || 1), 0);
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

    const vat = subtotal * 0.2;
    const total = Math.round((subtotal + vat) * 100) / 100;

    const estimatedDeliveryHours = Math.max(2, Math.ceil(distanceMiles / 25) + Math.ceil(itemCount / 5));

    const breakdown = {
      distanceMiles,
      basePrice: Math.round(basePrice * 100) / 100,
      manpowerCost,
      itemsCost: Math.round(itemsCost * 100) / 100,
      floorCharge,
      packingCost,
      dismantlingCost,
      insuranceCost: Math.round(insuranceCost * 100) / 100,
      parkingCharge,
      subtotal: Math.round(subtotal * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      total,
      volumeDiscount,
      estimatedDeliveryHours,
    };

    logger.info(`[PRICING] Quotation total: £${total} (${distanceMiles} miles, ~${estimatedDeliveryHours}h)`);
    logger.info(`[PRICING] Breakdown: ${JSON.stringify(breakdown)}`);

    return breakdown;
  }
}

module.exports = new PricingService();
