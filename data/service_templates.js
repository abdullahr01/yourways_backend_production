/**
 * Service templates matching YourWays document (Section 5 - Goods Categories).
 * Used by the mobile app / website to show category → subcategory → item pickers.
 */
const logger = require('../utils/logger');

const modifier = (label, type, options = null, required = false) => ({
  label,
  type,
  options,
  required,
});

const item = (name, modifiers = []) => ({ name, modifiers });

const category = (name, items) => ({ name, items });

const SERVICE_TEMPLATES = [
  {
    serviceId: 'home_move',
    name: 'Home Move',
    requiredLogistics: ['pickupLocation', 'deliveryLocation', 'manpowerRequired', 'parkingAccess'],
    categories: [
      category('Bedroom', [
        item('Single Bed & Mattress'),
        item('Double Bed & Mattress'),
        item('Kingsize Bed & Mattress'),
        item('Single Wardrobe'),
        item('Double Wardrobe'),
        item('Chest Of Drawers'),
        item('Dressing Table'),
      ]),
      category('Living Room', [
        item('Two Seater Sofa'),
        item('Three Seater Sofa'),
        item('L Shaped Sofa'),
        item('Corner Sofa'),
        item('Coffee Table'),
        item('TV Stand'),
        item('Bookcase'),
      ]),
      category('Kitchen', [
        item('Fridge'),
        item('Washing Machine'),
        item('Microwave Oven'),
        item('Kitchen Table'),
      ]),
      category('Boxes & Packaging', [
        item('Small Box (Approx. 40 x 30 x 30 cm)'),
        item('Medium Box (Approx. 45 x 45 x 35 cm)'),
        item('Large Box (Approx. 50 x 50 x 50 cm)'),
        item('Wardrobe Box'),
      ]),
      category('Custom Item', [
        item('Create Your Own Item', [
          modifier('Item Name', 'text', null, true),
          modifier('Length (cm)', 'number'),
          modifier('Width (cm)', 'number'),
          modifier('Height (cm)', 'number'),
          modifier('Estimated Weight (kg)', 'number'),
        ]),
      ]),
    ],
  },
  {
    serviceId: 'man_and_van',
    name: 'Man and Van',
    requiredLogistics: ['pickupLocation', 'deliveryLocation', 'manpowerRequired'],
    categories: [
      category('Small Moves', [
        item('Single Item Delivery'),
        item('Student Move'),
        item('Apartment Move'),
        item('Studio Flat Move'),
      ]),
      category('Delivery Services', [
        item('Same Day Delivery'),
        item('Furniture Delivery'),
        item('Store Pickup & Delivery'),
        item('Local Delivery'),
        item('Long Distance Delivery'),
      ]),
      category('Van Support Services', [
        item('Driver Only'),
        item('Driver With Helper'),
        item('Two Movers & Van'),
        item('Three Movers & Van'),
      ]),
    ],
  },
  {
    serviceId: 'vehicle',
    name: 'Vehicle Transport',
    requiredLogistics: ['pickupLocation', 'deliveryLocation'],
    categories: [
      category('Cars', [
        item('Hatchback Car'),
        item('Sedan Car'),
        item('SUV'),
        item('Van'),
        item('Non-Running Vehicle'),
      ]),
      category('Motorcycles & Bikes', [
        item('Motorcycle'),
        item('Scooter'),
        item('Electric Bike'),
      ]),
    ],
  },
  {
    serviceId: 'piano',
    name: 'Piano Delivery',
    requiredLogistics: ['pickupLocation', 'deliveryLocation', 'manpowerRequired', 'parkingAccess'],
    categories: [
      category('Piano Types', [
        item('Upright Piano'),
        item('Baby Grand Piano'),
        item('Grand Piano'),
        item('Digital Piano'),
      ]),
      category('Piano Accessories', [
        item('Piano Bench'),
        item('Piano Cover'),
      ]),
    ],
  },
  {
    serviceId: 'office',
    name: 'Office Move',
    requiredLogistics: ['pickupLocation', 'deliveryLocation', 'manpowerRequired'],
    categories: [
      category('Office Furniture', [
        item('Office Desk'),
        item('Office Chair'),
        item('Filing Cabinet'),
        item('Bookcase'),
      ]),
      category('Office Equipment', [
        item('Computer'),
        item('Printer'),
        item('Photocopier'),
      ]),
    ],
  },
  {
    serviceId: 'manpower_only',
    name: 'Man Power Only',
    requiredLogistics: ['pickupLocation', 'manpowerRequired'],
    categories: [
      category('Loading & Moving Assistance', [
        item('Loading Assistance'),
        item('Unloading Assistance'),
        item('Packing Assistance'),
        item('Assembly Assistance'),
        item('Disassembly Assistance'),
      ]),
    ],
  },
];

const HANDLING_OPTIONS = [
  'Fragile Item',
  'High Value Item',
  'Requires Insurance',
  'Requires Protective Wrapping',
  'Requires Wooden Crating',
  'Requires Assembly',
  'Requires Disassembly',
  'Requires Multiple Movers',
  'Stair Access Required',
  'Lift Access Available',
  'White Glove Delivery',
  'Climate Controlled Delivery',
];

logger.info(`[DATA] Loaded ${SERVICE_TEMPLATES.length} service templates`);

module.exports = { SERVICE_TEMPLATES, HANDLING_OPTIONS };
