/**
 * One-time seed script — populates the DB-backed service catalog
 * (service_types / service_categories / service_type_categories / service_items,
 * see sql/005_driver_and_catalog.sql) from the existing static
 * data/service_templates.js file.
 *
 * data/service_templates.js is left completely untouched by this migration —
 * it now only serves as the seed source. After this runs once, all catalog
 * reads/writes go through models/catalog_model.js + services/catalog_service.js
 * against the database, and admins manage the catalog via
 * /api/admin/catalog/* instead of editing this file.
 *
 * Usage:
 *   node scripts/seed_catalog.js
 *
 * Safe to re-run: if any service_types rows already exist, the script exits
 * without touching the database (prevents accidental duplicate seeding). To
 * force a clean re-seed, truncate the four catalog tables first, then re-run.
 */
require('dotenv').config();
const supabase = require('../config/database');
const logger = require('../utils/logger');
const { SERVICE_TEMPLATES } = require('../data/service_templates');

async function main() {
  logger.info('[SEED] Starting catalog seed from data/service_templates.js...');

  const { count, error: countErr } = await supabase
    .from('service_types')
    .select('id', { count: 'exact', head: true });
  if (countErr) throw countErr;

  if (count && count > 0) {
    logger.warn(
      `[SEED] service_types already has ${count} row(s) — aborting to avoid duplicates. ` +
        'Truncate service_items, service_type_categories, service_categories, service_types and re-run if you need a clean reseed.'
    );
    return;
  }

  // Shared category objects (e.g. CUSTOM_ITEM_CATEGORY, BOXES_AND_PACKAGING_CATEGORY)
  // are the *same JS object reference* across multiple service types in the
  // static file — this map preserves that sharing as a single DB row + many
  // join-table attachments, instead of duplicating the category per service type.
  const categoryRowIdByRef = new Map();

  let serviceTypeCount = 0;
  let categoryCount = 0;
  let itemCount = 0;

  for (let svcIndex = 0; svcIndex < SERVICE_TEMPLATES.length; svcIndex++) {
    const svc = SERVICE_TEMPLATES[svcIndex];

    const { data: serviceTypeRow, error: svcErr } = await supabase
      .from('service_types')
      .insert({
        service_id: svc.serviceId,
        name: svc.name,
        description: svc.description || null,
        required_logistics: svc.requiredLogistics || [],
        requires_dropoff_location: svc.requiresDropoffLocation !== false,
        pricing_model: svc.pricingModel || 'instant',
        sort_order: svcIndex,
      })
      .select()
      .single();
    if (svcErr) throw svcErr;
    serviceTypeCount++;
    logger.info(`[SEED] + service_type ${svc.serviceId} (${svc.name})`);

    for (let catIndex = 0; catIndex < svc.categories.length; catIndex++) {
      const cat = svc.categories[catIndex];

      let categoryId = categoryRowIdByRef.get(cat);
      if (!categoryId) {
        const { data: categoryRow, error: catErr } = await supabase
          .from('service_categories')
          .insert({
            name: cat.name,
            pricing_multiplier: cat.pricingMultiplier || 1,
            note: cat.note || null,
            sort_order: catIndex,
          })
          .select()
          .single();
        if (catErr) throw catErr;
        categoryId = categoryRow.id;
        categoryRowIdByRef.set(cat, categoryId);
        categoryCount++;

        if (cat.items?.length) {
          const itemRows = cat.items.map((it, itemIndex) => ({
            category_id: categoryId,
            name: it.name,
            default_weight_kg: it.defaultWeightKg ?? 15,
            fragile_default: !!it.fragileDefault,
            insurance_recommended: !!it.insuranceRecommended,
            modifiers: it.modifiers || [],
            sort_order: itemIndex,
          }));
          const { error: itemErr } = await supabase.from('service_items').insert(itemRows);
          if (itemErr) throw itemErr;
          itemCount += itemRows.length;
        }
      }

      const { error: joinErr } = await supabase.from('service_type_categories').insert({
        service_type_id: serviceTypeRow.id,
        category_id: categoryId,
        sort_order: catIndex,
      });
      if (joinErr) throw joinErr;
    }
  }

  logger.success(
    `[SEED] Done. ${serviceTypeCount} service types, ${categoryCount} unique categories, ${itemCount} items seeded.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`[SEED] Failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  });
