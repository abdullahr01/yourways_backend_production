/**
 * Service templates matching YourWays SRS (Yourways.docx Section 5 - Goods Categories & Subcategories)
 * and the full reverse-engineered catalog in docs/KNOWLEDGE_BASE.md Section 6 (Business Service Catalog).
 *
 * Used by the mobile app / website to show service -> category -> subcategory -> item pickers,
 * and by the Pricing Engine (services/pricing_service.js) to look up per-item weight/handling
 * defaults via `findCatalogItem()`.
 *
 * IMPORTANT — Tree A / Tree B normalization (KB Section 6.4 "Duplicate Categories & Overlapping
 * Items — Findings"):
 * The SRS defines TWO parallel, heavily-overlapping category trees: a "Room/Space" tree (Home >
 * Bedroom/Living Room/..., Garden/Lawn, Office, etc.) and a second "Furniture" tree that re-lists
 * Home/Office/Outdoor furniture with more granular material/size variants (e.g. "Glass Coffee
 * Table", "Walk In Wardrobe", "8 Seater Dining Table"). Per the KB's own recommendation (Section
 * 6.4 finding table + Section 6.5 "Recommended Normalized Database Organization"), this file
 * MERGES Tree B's more granular item variants into their corresponding Tree A subcategories
 * instead of duplicating a whole parallel "Furniture" category — every item name from BOTH trees
 * is preserved, just organized once instead of twice.
 */
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const modifier = (label, type, options = null, required = false) => ({
  label,
  type,
  options,
  required,
});

/**
 * @param {string} name - Item display name (verbatim from SRS/KB Section 6.1 where possible).
 * @param {number} weightKg - Typical/default weight in kg, used by the Pricing Engine when the
 *   customer does not supply an explicit "Estimated Weight (kg)" modifier (KB Section 6.5 / 11.3 —
 *   replaces the previous flat 15kg-for-everything fallback, which under-priced heavy items like
 *   pianos/appliances/vehicles and over-priced light items like boxes).
 * @param {object} opts
 * @param {boolean} [opts.fragile] - Defaults the "Fragile Item" handling flag (KB Section 6.3).
 * @param {boolean} [opts.insurance] - Defaults/recommends the "Requires Insurance" handling flag.
 * @param {Array} [opts.modifiers] - Extra input fields (used mainly by "Create Your Own Item").
 */
const item = (name, weightKg = 15, opts = {}) => ({
  name,
  defaultWeightKg: weightKg,
  ...(opts.fragile ? { fragileDefault: true } : {}),
  ...(opts.insurance ? { insuranceRecommended: true } : {}),
  modifiers: opts.modifiers || [],
});

/**
 * @param {object} opts
 * @param {number} [opts.pricingMultiplier] - Category-level pricing multiplier (KB Section 6.2/6.5)
 *   applied to every item's line cost in the Pricing Engine. Fixes the KB-flagged gap where Piano /
 *   Specialist & Antique / Industrial categories were priced identically to generic furniture
 *   despite carrying materially higher risk/value/handling cost.
 * @param {string} [opts.note] - Free-text engineering note (e.g. normalization callouts).
 */
const category = (name, items, opts = {}) => ({
  name,
  items,
  ...(opts.pricingMultiplier && opts.pricingMultiplier !== 1 ? { pricingMultiplier: opts.pricingMultiplier } : {}),
  ...(opts.note ? { note: opts.note } : {}),
});

/**
 * @param {object} opts
 * @param {string[]} [opts.requiredLogistics]
 * @param {boolean} [opts.requiresDropoffLocation] - false for "Man Power Only" (KB Section 6.2 —
 *   this is a single-location labor service, not a pickup->dropoff transport job).
 * @param {'instant'|'hourly'|'quoteOnRequest'} [opts.pricingModel] - KB Section 6.2/22 recommends
 *   Man Power Only be priced hourly and Industrial Machinery go through a "quote on request" flow
 *   rather than the generic instant weight-based quote; this flag lets the frontend/backend branch
 *   accordingly (full alternate pricing flows are tracked as a roadmap item, KB Section 23 Phase 3).
 */
const serviceType = (serviceId, name, description, categories, opts = {}) => ({
  serviceId,
  name,
  description,
  requiredLogistics:
    opts.requiredLogistics ||
    ['pickupLocation', 'deliveryLocation', 'manpowerRequired', 'parkingAccess'],
  requiresDropoffLocation: opts.requiresDropoffLocation !== false,
  pricingModel: opts.pricingModel || 'instant',
  // Every service gets the shared "Custom Item" escape hatch (KB Section 6.1.12 / 6.2 —
  // Custom Item is a cross-cutting feature in the SRS, not Home-Move-specific).
  categories: [...categories, CUSTOM_ITEM_CATEGORY],
});

// ---------------------------------------------------------------------------
// Shared cross-cutting category: Custom Item (KB Section 6.1.12)
// ---------------------------------------------------------------------------

const CUSTOM_ITEM_CATEGORY = category('Custom Item', [
  item('Create Your Own Item', 15, {
    modifiers: [
      modifier('Item Name', 'text', null, true),
      modifier('Length (cm)', 'number'),
      modifier('Width (cm)', 'number'),
      modifier('Height (cm)', 'number'),
      modifier('Estimated Weight (kg)', 'number'),
    ],
  }),
]);

// ---------------------------------------------------------------------------
// Shared reusable category: Boxes & Packaging (KB Section 6.1.3)
// SRS lists this as a top-level category (sibling of Home/Office/etc.); it is attached to every
// service where packaging materials are a realistic add-on (Home Move, Office Move, Man and Van).
// ---------------------------------------------------------------------------

const BOXES_AND_PACKAGING_CATEGORY = category('Boxes & Packaging', [
  item('Small Box (Approx. 40 x 30 x 30 cm)', 8),
  item('Medium Box (Approx. 45 x 45 x 35 cm)', 12),
  item('Large Box (Approx. 50 x 50 x 50 cm)', 18),
  item('Wardrobe Box', 15),
  item('Crate', 10),
  item('Small Bag', 3),
  item('Large Bag', 6),
  item('Suitcase', 15),
  item('Box Of Clothes', 10),
  item('Bicycle', 15),
]);

// ---------------------------------------------------------------------------
// 1) HOME MOVE  (KB Section 6.1.1 — Bedroom, Living Room, Dining Room, Kitchen, Bathroom)
// ---------------------------------------------------------------------------

const HOME_MOVE = serviceType(
  'home_move',
  'Home Move',
  'Full-property residential relocation covering every room in the house (KB Section 6.2 "HOME").',
  [
    category('Bedroom - Beds & Mattresses', [
      item('Single Bed & Mattress', 25),
      item('Double Bed & Mattress', 35),
      item('Kingsize Bed & Mattress', 45),
      item('Super Kingsize Bed & Mattress', 55),
      item('Single Bed Frame', 15),
      item('Double Bed Frame', 22),
      item('Kingsize Bed Frame', 28),
      item('Bunk Bed', 40),
      item('Cot', 10),
      item('Single Mattress', 12),
      item('Double Mattress', 18),
      item('Kingsize Mattress', 22),
    ]),
    category('Bedroom - Wardrobes & Storage', [
      item('Single Wardrobe', 30),
      item('Double Wardrobe', 45),
      item('Triple Wardrobe', 60),
      item('Sliding Door Wardrobe', 55),
      item('Flat Packed Wardrobe', 35),
      item('Walk In Wardrobe', 70), // Tree B addition (KB 6.1.11)
      item('Chest Of Drawers', 25),
      item('Bedside Table', 8),
      item('Shelf', 6),
      item('Ottoman', 15),
    ]),
    category('Bedroom - Bedroom Furniture', [
      item('Dressing Table', 20),
      item('Side Table', 8),
      item('TV', 12, { fragile: true }),
    ]),
    category('Living Room - Sofas & Seating', [
      item('Two Seater Sofa', 40),
      item('Three Seater Sofa', 55),
      item('Four Seater Sofa', 65),
      item('Five Seater Sofa', 75),
      item('Six Seater Sofa', 85),
      item('Seven Seater Sofa', 95),
      item('L Shaped Sofa', 80),
      item('Corner Sofa', 85),
      item('Two Seater Reclining Sofa', 60),
      item('Three Seater Reclining Sofa', 75),
      item('Two Seater Sofa Bed', 55),
      item('Three Seater Sofa Bed', 65),
      item('Corner Sofa Bed', 80),
      item('Armchair', 25),
      item('Sofa Chair', 20),
      item('Rocking Chair', 18),
    ]),
    category('Living Room - Tables & Storage', [
      // Coffee Table / TV Stand / Bookcase merged with Tree B's material/size variants (KB 6.1.11)
      item('Small Coffee Table', 10),
      item('Medium Coffee Table', 15),
      item('Large Coffee Table', 20),
      item('Glass Coffee Table', 18, { fragile: true }),
      item('Marble Coffee Table', 35, { fragile: true }),
      item('Nesting Coffee Table', 14),
      item('Small TV Stand', 10),
      item('Medium TV Stand', 15),
      item('Large TV Stand', 22),
      item('Wall Mounted TV Unit', 18),
      item('Entertainment Unit', 30),
      item('Small Bookcase', 12),
      item('Medium Bookcase', 20),
      item('Large Bookcase', 30),
      item('Open Shelf Bookcase', 22),
      item('Closed Door Bookcase', 28),
      item('Shelf', 6),
    ]),
    category('Living Room - Electronics & Decor', [
      item('Small Television / TV (Less than 30")', 6, { fragile: true }),
      item('Medium Television / TV (30" to 40")', 10, { fragile: true }),
      item('Large Television / TV (Greater than 40")', 16, { fragile: true }),
      item('Artwork', 4, { fragile: true }),
      item('Rug', 8),
      item('Carpet', 12),
      item('Floor Lamp', 5),
      item('Foot Stool', 6),
      item('Chandelier', 10, { fragile: true, insurance: true }),
      item('Picture Frame', 2, { fragile: true }),
    ]),
    category('Dining Room - Dining Furniture', [
      // 2/8 Seater + Dining Bench merged from Tree B (KB 6.1.11)
      item('2 Seater Dining Table', 15),
      item('4 Seater Dining Table', 28),
      item('6 Seater Dining Table', 40),
      item('8 Seater Dining Table', 55),
      item('4 Seater Dining Table & Chairs', 50),
      item('6 Seater Dining Table & Chairs', 70),
      item('Dining Chair', 6),
      item('Dining Bench', 15),
    ]),
    category('Dining Room - Storage & Decor', [
      // Storage Cabinet/Glass Cabinet/Shoe Cabinet/Corner Cabinet merged from Tree B "Cabinet" (KB 6.1.11)
      item('Side Cabinet', 25),
      item('Display Cabinet', 35, { fragile: true }),
      item('Storage Cabinet', 28),
      item('Glass Cabinet', 30, { fragile: true }),
      item('Shoe Cabinet', 15),
      item('Corner Cabinet', 22),
      item('Large Mirror', 12, { fragile: true }),
      item('Small Mirror', 4, { fragile: true }),
    ]),
    category('Kitchen - Appliances', [
      item('Fridge', 45, { insurance: true }),
      item('Fridge Freezer', 60, { insurance: true }),
      item('American Fridge', 90, { insurance: true }),
      item('Freezer', 40, { insurance: true }),
      item('Washing Machine', 65, { insurance: true }),
      item('Tumble Dryer', 35, { insurance: true }),
      item('Dishwasher', 40, { insurance: true }),
      item('Microwave Oven', 12),
      item('Cooker', 45),
      item('Air Fryer', 6),
    ]),
    category('Kitchen - Kitchen Furniture', [
      item('Kitchen Table', 20),
      item('Chair', 6),
      item('Stool', 5),
      item('Bin', 4),
    ]),
    category('Kitchen - Utility Items', [
      item('Ironing Board', 5),
      item('Cloth Horse', 3),
      item('Water Cooler', 12),
    ]),
    category('Bathroom - Bathroom Furniture & Accessories', [
      item('Bathroom Cabinet', 15),
      item('Bath Tub', 45, { fragile: true }),
      item('Large Mirror', 12, { fragile: true }),
      item('Small Mirror', 4, { fragile: true }),
      item('Rug', 4),
    ]),
    BOXES_AND_PACKAGING_CATEGORY,
  ]
);

// ---------------------------------------------------------------------------
// 2) GARDEN / LAWN  (KB Section 6.1.2, merged with Tree B "Outdoor Furniture" variants)
// ---------------------------------------------------------------------------

const GARDEN = serviceType(
  'garden',
  'Garden & Outdoor',
  'Outdoor furniture and garden storage relocation (KB Section 6.2 "GARDEN / LAWN").',
  [
    category('Outdoor Furniture - Garden Chair', [
      item('Plastic Garden Chair', 3),
      item('Wooden Garden Chair', 8),
      item('Metal Garden Chair', 6),
      item('Folding Garden Chair', 4),
      item('Reclining Garden Chair', 7),
    ]),
    category('Outdoor Furniture - Garden Table', [
      item('Small Garden Table', 8),
      item('Medium Garden Table', 14),
      item('Large Garden Table', 22),
      item('Glass Garden Table', 18, { fragile: true }),
      item('Folding Garden Table', 10),
    ]),
    category('Outdoor Furniture - Garden Set', [
      // Merged Tree A's "Garden Set (5/6/7 Seater)" with Tree B's fuller size/style range (KB 6.1.11)
      item('2 Seater Garden Set', 20),
      item('4 Seater Garden Set', 40),
      item('5 Seater Garden Set', 50),
      item('6 Seater Garden Set', 60),
      item('7 Seater Garden Set', 70),
      item('Rattan Garden Set', 55),
      item('Corner Garden Set', 65),
    ]),
    category('Outdoor Storage', [
      // Merged Tree A's "Storage Box Small/Medium/Large" with Tree B's "Outdoor Storage Box" naming (KB 6.1.11)
      item('Small Outdoor Storage Box', 8),
      item('Medium Outdoor Storage Box', 15),
      item('Large Outdoor Storage Box', 25),
      item('Waterproof Storage Box', 18),
      item('Deck Storage Box', 22),
    ]),
  ]
);

// ---------------------------------------------------------------------------
// 3) OFFICE MOVE  (KB Section 6.1.4, merged with Tree B "Office Furniture" variants)
// ---------------------------------------------------------------------------

const OFFICE = serviceType(
  'office',
  'Office Move',
  'Commercial office relocation: furniture, equipment, kitchen, and packaging (KB Section 6.2 "OFFICE").',
  [
    category('Office Furniture - Desks & Tables', [
      item('Office Desk', 25),
      item('Pedestal Desk', 30),
      item('Corner Desk', 35),
      item('Corner Desk With Pedestal', 40),
      item('Standing Desk', 28),
      item('Standing Desk - Electric', 38),
      item('Executive Desk', 45), // Tree B addition
      item('Reception Desk', 55), // Tree B addition
      item('Board Room Table', 70),
      item('Coffee Table', 15),
    ]),
    category('Office Furniture - Chairs', [
      item('Office Chair', 12),
      item('Desk Chair', 10),
      item('Stacking Chair', 6),
      item('Folding Chair', 5),
      item('Executive Office Chair', 18), // Tree B addition
      item('Mesh Chair', 11), // Tree B addition
      item('Ergonomic Chair', 15), // Tree B addition
      item('Gaming Chair', 20), // Tree B addition
      item('Visitor Chair', 8), // Tree B addition
    ]),
    category('Office Furniture - Storage', [
      item('Small Filing Cabinet', 20),
      item('Large Filing Cabinet', 35),
      item('2 Drawer Filing Cabinet', 18), // Tree B addition
      item('4 Drawer Filing Cabinet', 30), // Tree B addition
      item('Mobile Filing Cabinet', 15), // Tree B addition
      item('Pedestal', 12),
      item('Storage Cabinet', 25),
      item('Cupboard', 30),
      item('Locker', 22),
      item('Bookcase', 20),
      item('Archive Cabinet', 28), // Tree B addition
      item('Document Cabinet', 25), // Tree B addition
      item('Pedestal Storage', 12), // Tree B addition
    ]),
    category('Office Furniture - Board Room Table', [
      // Tree B's more granular board-room-table sizing (KB 6.1.11)
      item('Small Meeting Table', 25),
      item('Medium Board Room Table', 45),
      item('Large Board Room Table', 70),
      item('Conference Table', 80),
    ]),
    category('Office Equipment', [
      item('Computer', 10),
      item('Computer Monitor', 6, { fragile: true }),
      item('Printer', 12),
      item('Photocopier', 45, { insurance: true }),
      item('TV', 12, { fragile: true }),
      item('Drawing Board', 8),
      item('Projector', 4, { fragile: true }),
      item('Projector Screen', 10),
      item('Mini Fridge', 20),
      item('Paper Shredder', 8),
      item('Display Board', 10),
    ]),
    category('Office Kitchen', [
      item('Kitchen Table', 20),
      item('Chair', 6),
      item('Stool', 5),
      item('Water Cooler', 12),
    ]),
    category('Office Packaging - Boxes', [
      item('Small Box', 8),
      item('Medium Box', 12),
      item('Large Box', 18),
      item('Crate', 10),
    ]),
  ]
);

// ---------------------------------------------------------------------------
// 4) PIANO DELIVERY  (KB Section 6.1.5 — specialist pricing multiplier per KB 6.2 gap finding)
// ---------------------------------------------------------------------------

const PIANO = serviceType(
  'piano',
  'Piano Delivery',
  'Specialist piano moving — one of the heaviest, most damage-prone item types (KB Section 6.2 "PIANO DELIVERY"). Requires piano-certified movers and specialist equipment.',
  [
    category(
      'Piano Types',
      [
        item('Upright Piano', 250, { fragile: true, insurance: true }),
        item('Baby Grand Piano', 320, { fragile: true, insurance: true }),
        item('Grand Piano', 450, { fragile: true, insurance: true }),
        item('Digital Piano', 40, { fragile: true, insurance: true }),
        item('Keyboard Piano', 10, { fragile: true }),
        item('Studio Piano', 230, { fragile: true, insurance: true }),
        item('Concert Piano', 480, { fragile: true, insurance: true }),
      ],
      {
        pricingMultiplier: 2.5,
        note: 'KB Section 6.2 gap: generic weight-based pricing materially under-prices pianos; multiplier reflects specialist crew/equipment cost.',
      }
    ),
    category('Piano Accessories', [
      item('Piano Bench', 8),
      item('Piano Cover', 2),
      item('Piano Pedals', 1),
      item('Music Stand', 2),
    ], { pricingMultiplier: 1.2 }),
  ],
  { requiredLogistics: ['pickupLocation', 'deliveryLocation', 'manpowerRequired', 'parkingAccess'] }
);

// ---------------------------------------------------------------------------
// 5) VEHICLE TRANSPORT  (KB Section 6.1.6)
// ---------------------------------------------------------------------------

const VEHICLE = serviceType(
  'vehicle',
  'Vehicle Transport',
  'Car/motorcycle/commercial vehicle transport and vehicle parts delivery (KB Section 6.2 "VEHICLE TRANSPORT"). NOTE (KB gap): a production system should price this per-mile/per-vehicle-class via a dedicated model rather than the generic weight formula — tracked in KB Section 22/23 roadmap.',
  [
    category('Cars', [
      item('Hatchback Car', 1100),
      item('Sedan Car', 1400),
      item('SUV', 1800),
      item('Pickup Truck', 2000),
      item('Van', 2200),
      item('Luxury Car', 1900, { insurance: true }),
      item('Sports Car', 1600, { insurance: true }),
      item('Classic Car', 1300, { fragile: true, insurance: true }),
      item('Non-Running Vehicle', 1400),
    ]),
    category('Motorcycles & Bikes', [
      item('Motorcycle', 180),
      item('Scooter', 110),
      item('Dirt Bike', 100),
      item('Quad Bike', 250),
      item('Electric Bike', 25),
    ]),
    category('Vehicle Parts', [
      item('Car Engine', 150, { insurance: true }),
      item('Gearbox', 60),
      item('Car Door', 20),
      item('Car Bonnet', 15),
      item('Tires / Wheels', 12),
      item('Exhaust System', 10),
      item('Bumper', 8),
      item('Motorcycle Parts', 10),
    ]),
    category('Commercial Vehicles', [
      item('Mini Truck', 2500),
      item('Cargo Van', 2300),
      item('Trailer', 600),
      item('Forklift', 3500, { insurance: true }),
    ]),
  ],
  { requiredLogistics: ['pickupLocation', 'deliveryLocation'] }
);

// ---------------------------------------------------------------------------
// 6) INDUSTRIAL (MACHINERY)  (KB Section 6.1.7 — quote-on-request per KB 6.2 gap finding)
// ---------------------------------------------------------------------------

const INDUSTRIAL = serviceType(
  'industrial',
  'Industrial & Machinery',
  'B2B industrial/warehouse/construction equipment relocation (KB Section 6.2 "INDUSTRIAL (MACHINERY)"). High value, low frequency, highly specialized — routed through a quote-on-request flow rather than instant pricing.',
  [
    category(
      'Industrial Equipment',
      [
        item('Generator', 120, { insurance: true }),
        item('Air Compressor', 90),
        item('Welding Machine', 60),
        item('Industrial Printer', 150, { insurance: true }),
        item('Hydraulic Machine', 300, { insurance: true }),
        item('CNC Machine', 1200, { insurance: true }),
        item('Lathe Machine', 900, { insurance: true }),
        item('Milling Machine', 1000, { insurance: true }),
        item('Packaging Machine', 400, { insurance: true }),
        item('Conveyor System', 500, { insurance: true }),
      ],
      { pricingMultiplier: 2.2 }
    ),
    category(
      'Construction Machinery',
      [
        item('Cement Mixer', 150),
        item('Mini Excavator', 2500, { insurance: true }),
        item('Forklift', 3500, { insurance: true }),
        item('Scissor Lift', 1800, { insurance: true }),
        item('Pallet Jack', 70),
        item('Industrial Shelving', 120),
      ],
      { pricingMultiplier: 2.2 }
    ),
    category(
      'Warehouse Equipment',
      [
        item('Storage Rack', 80),
        item('Heavy Duty Cabinet', 60),
        item('Warehouse Trolley', 30),
        item('Industrial Workbench', 90),
      ],
      { pricingMultiplier: 2.0 }
    ),
  ],
  {
    requiredLogistics: ['pickupLocation', 'deliveryLocation', 'manpowerRequired', 'parkingAccess'],
    pricingModel: 'quoteOnRequest',
  }
);

// ---------------------------------------------------------------------------
// 7) MAN POWER ONLY  (KB Section 6.1.8 — hourly, single-location per KB 6.2 gap finding)
// ---------------------------------------------------------------------------

const MANPOWER_ONLY = serviceType(
  'manpower_only',
  'Man Power Only',
  'Labor-only service — loading, unloading, packing, rearrangement, and assembly/disassembly assistance with no transport involved (KB Section 6.2 "MAN POWER ONLY").',
  [
    category('Loading & Moving Assistance', [
      item('Loading Assistance', 0),
      item('Unloading Assistance', 0),
      item('Furniture Rearrangement', 0),
      item('Packing Assistance', 0),
      item('Unpacking Assistance', 0),
      item('Assembly Assistance', 0),
      item('Disassembly Assistance', 0),
    ]),
  ],
  {
    requiredLogistics: ['pickupLocation', 'manpowerRequired'],
    requiresDropoffLocation: false,
    pricingModel: 'hourly',
  }
);

// ---------------------------------------------------------------------------
// 8) SPECIALIST & ANTIQUE  (KB Section 6.1.9 — mandatory-insurance-leaning category)
// ---------------------------------------------------------------------------

const SPECIALIST_ANTIQUE = serviceType(
  'specialist_antique',
  'Specialist & Antique',
  'High-value, fragile, irreplaceable items requiring white-glove treatment (KB Section 6.2 "SPECIALIST & ANTIQUE").',
  [
    category(
      'Antique Furniture',
      [
        item('Antique Wardrobe', 50, { fragile: true, insurance: true }),
        item('Antique Cabinet', 40, { fragile: true, insurance: true }),
        item('Antique Table', 30, { fragile: true, insurance: true }),
        item('Antique Chair', 12, { fragile: true, insurance: true }),
        item('Antique Desk', 35, { fragile: true, insurance: true }),
        item('Antique Bed Frame', 30, { fragile: true, insurance: true }),
        item('Antique Mirror', 15, { fragile: true, insurance: true }),
        item('Antique Clock', 20, { fragile: true, insurance: true }),
        item('Antique Trunk', 25, { fragile: true, insurance: true }),
      ],
      { pricingMultiplier: 2.0 }
    ),
    category(
      'Fine Art & Collectibles',
      [
        item('Painting / Canvas Art', 3, { fragile: true, insurance: true }),
        item('Sculpture', 25, { fragile: true, insurance: true }),
        item('Framed Artwork', 5, { fragile: true, insurance: true }),
        item('Glass Artwork', 6, { fragile: true, insurance: true }),
        item('Statue', 40, { fragile: true, insurance: true }),
        item('Collectible Item', 3, { fragile: true, insurance: true }),
        item('Museum Piece', 20, { fragile: true, insurance: true }),
        item('Vintage Decor', 8, { fragile: true }),
      ],
      { pricingMultiplier: 2.0 }
    ),
    category(
      'Fragile & Luxury Items',
      [
        item('Glass Table', 30, { fragile: true, insurance: true }),
        item('Marble Table', 60, { fragile: true, insurance: true }),
        item('Large Mirror', 12, { fragile: true, insurance: true }),
        item('Chandelier', 10, { fragile: true, insurance: true }),
        item('Crystal Item', 3, { fragile: true, insurance: true }),
        item('Ceramic Item', 3, { fragile: true, insurance: true }),
        item('Display Cabinet', 35, { fragile: true, insurance: true }),
        item('Luxury Furniture', 45, { fragile: true, insurance: true }),
        item('Designer Furniture', 40, { fragile: true, insurance: true }),
      ],
      { pricingMultiplier: 2.0 }
    ),
    category(
      'Specialist Musical Items',
      [
        item('Grandfather Clock', 60, { fragile: true, insurance: true }),
        item('Harp', 35, { fragile: true, insurance: true }),
        item('Drum Kit', 25, { fragile: true }),
        item('Guitar Collection', 15, { fragile: true, insurance: true }),
      ],
      { pricingMultiplier: 2.0 }
    ),
  ]
);

// ---------------------------------------------------------------------------
// 9) MAN AND VAN  (KB Section 6.1.10)
// ---------------------------------------------------------------------------

const MAN_AND_VAN = serviceType(
  'man_and_van',
  'Man and Van',
  'Flexible, lightweight single-van moving and delivery jobs — the highest-frequency service type (KB Section 6.2 "MAN AND VAN").',
  [
    category('Small Moves', [
      item('Single Item Delivery', 15),
      item('Student Move', 150),
      item('Apartment Move', 300),
      item('Studio Flat Move', 200),
    ]),
    category('Delivery Services', [
      item('Same Day Delivery', 15),
      item('Furniture Delivery', 30),
      item('Store Pickup & Delivery', 20),
      item('Marketplace Delivery', 15),
      item('Local Delivery', 15),
      item('Long Distance Delivery', 15),
    ]),
    category(
      'Van Support Services',
      [
        item('Driver Only', 0),
        item('Driver With Helper', 0),
        item('Two Movers & Van', 0),
        item('Three Movers & Van', 0),
      ],
      {
        note:
          'KB Section 6.4 finding #10: these selections are semantically the same as the manpowerRequired ' +
          'booking field. Kept here for catalog completeness/back-compat display, but the booking UI should ' +
          'set `manpowerRequired` directly from this selection rather than pricing it as a physical item.',
      }
    ),
    BOXES_AND_PACKAGING_CATEGORY,
  ]
);

// ---------------------------------------------------------------------------
// Export list — every SRS-defined service type (KB Section 6.0 catalog structure overview)
// ---------------------------------------------------------------------------

const SERVICE_TEMPLATES = [
  HOME_MOVE,
  MAN_AND_VAN,
  VEHICLE,
  PIANO,
  OFFICE,
  MANPOWER_ONLY,
  GARDEN,
  INDUSTRIAL,
  SPECIALIST_ANTIQUE,
];

// ---------------------------------------------------------------------------
// Additional Service Options / Handling Options (KB Section 6.1.13) — cross-cutting flags
// applicable to any booking/item, not a bookable category.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Flat catalog index for the Pricing Engine (KB Section 6.5 / 11.3).
// NOTE: this is a pragmatic, name-keyed lookup appropriate for the current static-catalog stage.
// KB Section 6.5/10.5 recommends evolving this into a proper `items` table with a many-to-many
// `item_category_links` join once the catalog needs to be admin-editable — see docs/KNOWLEDGE_BASE.md.
// ---------------------------------------------------------------------------

function buildCatalogIndex(templates) {
  const index = {};
  templates.forEach((svc) => {
    svc.categories.forEach((cat) => {
      const pricingMultiplier = cat.pricingMultiplier || 1;
      cat.items.forEach((catalogItem) => {
        index[catalogItem.name.toLowerCase()] = {
          name: catalogItem.name,
          defaultWeightKg: catalogItem.defaultWeightKg,
          fragileDefault: !!catalogItem.fragileDefault,
          insuranceRecommended: !!catalogItem.insuranceRecommended,
          pricingMultiplier,
          serviceId: svc.serviceId,
          category: cat.name,
        };
      });
    });
  });
  return index;
}

const ITEM_CATALOG_INDEX = buildCatalogIndex(SERVICE_TEMPLATES);

/**
 * Look up an item's catalog defaults (weight, fragility/insurance defaults, pricing multiplier)
 * by name. Used by services/pricing_service.js so quotes reflect real per-item weight/risk instead
 * of a flat fallback. Returns null for unrecognized/custom item names (Custom Item / free-text).
 */
function findCatalogItem(name) {
  if (!name) return null;
  return ITEM_CATALOG_INDEX[String(name).trim().toLowerCase()] || null;
}

const totalItemCount = Object.keys(ITEM_CATALOG_INDEX).length;
const totalCategoryCount = SERVICE_TEMPLATES.reduce((sum, svc) => sum + svc.categories.length, 0);
logger.info(
  `[DATA] Loaded ${SERVICE_TEMPLATES.length} service templates, ${totalCategoryCount} categories, ${totalItemCount} unique catalog items`
);

module.exports = {
  SERVICE_TEMPLATES,
  HANDLING_OPTIONS,
  ITEM_CATALOG_INDEX,
  findCatalogItem,
};
