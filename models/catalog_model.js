/**
 * DB-backed service catalog (sql/005_driver_and_catalog.sql):
 *   service_types -> service_type_categories (join) -> service_categories -> service_items
 *
 * Replaces the static data/service_templates.js as the live source of truth.
 * That file still exists — it's the one-time seed source for
 * scripts/seed_catalog.js and is otherwise unused by the running app.
 *
 * Consumed exclusively through services/catalog_service.js (which adds
 * caching + admin write methods) — controllers should never import this
 * model directly.
 */
const supabase = require('../config/database');
const logger = require('../utils/logger');
const { handleSupabase, logPayload } = require('../utils/supabaseHelper');
const { stripUndefined } = require('../utils/caseMapper');

const SERVICE_TYPES_TABLE = 'service_types';
const CATEGORIES_TABLE = 'service_categories';
const TYPE_CATEGORIES_TABLE = 'service_type_categories';
const ITEMS_TABLE = 'service_items';

// ---------------------------------------------------------------------------
// Row <-> app object mapping
// ---------------------------------------------------------------------------

const mapServiceType = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    serviceId: row.service_id,
    name: row.name,
    description: row.description ?? null,
    requiredLogistics: row.required_logistics || [],
    requiresDropoffLocation: row.requires_dropoff_location,
    pricingModel: row.pricing_model,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const mapCategory = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    pricingMultiplier: row.pricing_multiplier != null ? Number(row.pricing_multiplier) : 1,
    note: row.note ?? null,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const mapItem = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    defaultWeightKg: row.default_weight_kg != null ? Number(row.default_weight_kg) : 15,
    basePrice: row.base_price != null ? Number(row.base_price) : null,
    fragileDefault: !!row.fragile_default,
    insuranceRecommended: !!row.insurance_recommended,
    modifiers: row.modifiers || [],
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toServiceTypeInsert = (data) =>
  stripUndefined({
    service_id: data.serviceId ?? data.service_id,
    name: data.name,
    description: data.description ?? null,
    required_logistics:
      data.requiredLogistics ??
      data.required_logistics ??
      ['pickupLocation', 'deliveryLocation', 'manpowerRequired', 'parkingAccess'],
    requires_dropoff_location: data.requiresDropoffLocation ?? data.requires_dropoff_location ?? true,
    pricing_model: data.pricingModel ?? data.pricing_model ?? 'instant',
    is_active: data.isActive ?? data.is_active ?? true,
    sort_order: data.sortOrder ?? data.sort_order ?? 0,
  });

const toServiceTypeUpdate = (data) =>
  stripUndefined({
    service_id: data.serviceId ?? data.service_id,
    name: data.name,
    description: data.description,
    required_logistics: data.requiredLogistics ?? data.required_logistics,
    requires_dropoff_location: data.requiresDropoffLocation ?? data.requires_dropoff_location,
    pricing_model: data.pricingModel ?? data.pricing_model,
    is_active: data.isActive ?? data.is_active,
    sort_order: data.sortOrder ?? data.sort_order,
  });

const toCategoryInsert = (data) =>
  stripUndefined({
    name: data.name,
    pricing_multiplier: data.pricingMultiplier ?? data.pricing_multiplier ?? 1,
    note: data.note ?? null,
    is_active: data.isActive ?? data.is_active ?? true,
    sort_order: data.sortOrder ?? data.sort_order ?? 0,
  });

const toCategoryUpdate = (data) =>
  stripUndefined({
    name: data.name,
    pricing_multiplier: data.pricingMultiplier ?? data.pricing_multiplier,
    note: data.note,
    is_active: data.isActive ?? data.is_active,
    sort_order: data.sortOrder ?? data.sort_order,
  });

const toItemInsert = (data) =>
  stripUndefined({
    category_id: data.categoryId ?? data.category_id,
    name: data.name,
    default_weight_kg: data.defaultWeightKg ?? data.default_weight_kg ?? 15,
    base_price: data.basePrice ?? data.base_price ?? null,
    fragile_default: data.fragileDefault ?? data.fragile_default ?? false,
    insurance_recommended: data.insuranceRecommended ?? data.insurance_recommended ?? false,
    modifiers: data.modifiers ?? [],
    is_active: data.isActive ?? data.is_active ?? true,
    sort_order: data.sortOrder ?? data.sort_order ?? 0,
  });

const toItemUpdate = (data) =>
  stripUndefined({
    category_id: data.categoryId ?? data.category_id,
    name: data.name,
    default_weight_kg: data.defaultWeightKg ?? data.default_weight_kg,
    base_price: data.basePrice !== undefined ? data.basePrice : data.base_price,
    fragile_default: data.fragileDefault ?? data.fragile_default,
    insurance_recommended: data.insuranceRecommended ?? data.insurance_recommended,
    modifiers: data.modifiers,
    is_active: data.isActive ?? data.is_active,
    sort_order: data.sortOrder ?? data.sort_order,
  });

// ---------------------------------------------------------------------------
// Full tree read — reproduces the exact nested shape the old static
// SERVICE_TEMPLATES array had: [{ serviceId, name, ..., categories: [{ name, ..., items: [...] }] }]
// ---------------------------------------------------------------------------

const getFullCatalogTree = async ({ includeInactive = false } = {}) => {
  logger.info(`[CATALOG MODEL] getFullCatalogTree includeInactive=${includeInactive}`);

  let typesQuery = supabase.from(SERVICE_TYPES_TABLE).select('*').order('sort_order');
  if (!includeInactive) typesQuery = typesQuery.eq('is_active', true);
  const typesResult = await typesQuery;
  const typeRows = handleSupabase('catalog.serviceTypes', typesResult);

  let categoriesQuery = supabase.from(CATEGORIES_TABLE).select('*').order('sort_order');
  if (!includeInactive) categoriesQuery = categoriesQuery.eq('is_active', true);
  const categoriesResult = await categoriesQuery;
  const categoryRows = handleSupabase('catalog.categories', categoriesResult);

  const joinResult = await supabase
    .from(TYPE_CATEGORIES_TABLE)
    .select('*')
    .order('sort_order');
  const joinRows = handleSupabase('catalog.typeCategories', joinResult);

  let itemsQuery = supabase.from(ITEMS_TABLE).select('*').order('sort_order');
  if (!includeInactive) itemsQuery = itemsQuery.eq('is_active', true);
  const itemsResult = await itemsQuery;
  const itemRows = handleSupabase('catalog.items', itemsResult);

  const itemsByCategory = new Map();
  itemRows.forEach((row) => {
    const list = itemsByCategory.get(row.category_id) || [];
    list.push(mapItem(row));
    itemsByCategory.set(row.category_id, list);
  });

  const categoriesById = new Map(categoryRows.map((row) => [row.id, row]));

  const categoryIdsByType = new Map();
  joinRows.forEach((join) => {
    if (!categoriesById.has(join.category_id)) return; // filtered out (inactive)
    const list = categoryIdsByType.get(join.service_type_id) || [];
    list.push(join.category_id);
    categoryIdsByType.set(join.service_type_id, list);
  });

  const tree = typeRows.map((typeRow) => {
    const mapped = mapServiceType(typeRow);
    const categoryIds = categoryIdsByType.get(typeRow.id) || [];
    mapped.categories = categoryIds.map((catId) => {
      const catRow = categoriesById.get(catId);
      const mappedCat = mapCategory(catRow);
      mappedCat.items = itemsByCategory.get(catId) || [];
      return mappedCat;
    });
    return mapped;
  });

  logger.info(`[CATALOG MODEL] tree built: ${tree.length} service types`);
  return tree;
};

/** Name-keyed flat index across ALL active items — mirrors the old static ITEM_CATALOG_INDEX. */
const getFlatItemIndex = async () => {
  const tree = await getFullCatalogTree();
  const index = {};
  tree.forEach((svc) => {
    svc.categories.forEach((cat) => {
      cat.items.forEach((it) => {
        index[it.name.toLowerCase()] = {
          name: it.name,
          defaultWeightKg: it.defaultWeightKg,
          basePrice: it.basePrice,
          fragileDefault: it.fragileDefault,
          insuranceRecommended: it.insuranceRecommended,
          pricingMultiplier: cat.pricingMultiplier || 1,
          serviceId: svc.serviceId,
          category: cat.name,
        };
      });
    });
  });
  return index;
};

// ---------------------------------------------------------------------------
// Service type CRUD
// ---------------------------------------------------------------------------

const createServiceType = async (data) => {
  logPayload('catalog.createServiceType', data);
  const result = await supabase
    .from(SERVICE_TYPES_TABLE)
    .insert(toServiceTypeInsert(data))
    .select()
    .single();
  return mapServiceType(handleSupabase('catalog.createServiceType', result));
};

const updateServiceType = async (id, data) => {
  logPayload('catalog.updateServiceType', data);
  const result = await supabase
    .from(SERVICE_TYPES_TABLE)
    .update(toServiceTypeUpdate(data))
    .eq('id', id)
    .select()
    .single();
  return mapServiceType(handleSupabase('catalog.updateServiceType', result));
};

const deleteServiceType = async (id) => {
  logger.info(`[CATALOG MODEL] DELETE service_type id=${id}`);
  const result = await supabase.from(SERVICE_TYPES_TABLE).delete().eq('id', id).select().maybeSingle();
  return handleSupabase('catalog.deleteServiceType', result, { allowNull: true });
};

const findServiceTypeById = async (id) => {
  const result = await supabase.from(SERVICE_TYPES_TABLE).select('*').eq('id', id).maybeSingle();
  return mapServiceType(handleSupabase('catalog.findServiceTypeById', result, { allowNull: true }));
};

// ---------------------------------------------------------------------------
// Category CRUD + attach/detach to service types
// ---------------------------------------------------------------------------

const createCategory = async (data) => {
  logPayload('catalog.createCategory', data);
  const result = await supabase.from(CATEGORIES_TABLE).insert(toCategoryInsert(data)).select().single();
  return mapCategory(handleSupabase('catalog.createCategory', result));
};

const updateCategory = async (id, data) => {
  logPayload('catalog.updateCategory', data);
  const result = await supabase
    .from(CATEGORIES_TABLE)
    .update(toCategoryUpdate(data))
    .eq('id', id)
    .select()
    .single();
  return mapCategory(handleSupabase('catalog.updateCategory', result));
};

const deleteCategory = async (id) => {
  logger.info(`[CATALOG MODEL] DELETE category id=${id}`);
  const result = await supabase.from(CATEGORIES_TABLE).delete().eq('id', id).select().maybeSingle();
  return handleSupabase('catalog.deleteCategory', result, { allowNull: true });
};

const attachCategoryToServiceType = async (serviceTypeId, categoryId, sortOrder = 0) => {
  logger.info(`[CATALOG MODEL] attach category=${categoryId} -> serviceType=${serviceTypeId}`);
  const result = await supabase
    .from(TYPE_CATEGORIES_TABLE)
    .insert({ service_type_id: serviceTypeId, category_id: categoryId, sort_order: sortOrder })
    .select()
    .single();
  return handleSupabase('catalog.attachCategory', result);
};

const detachCategoryFromServiceType = async (serviceTypeId, categoryId) => {
  logger.info(`[CATALOG MODEL] detach category=${categoryId} from serviceType=${serviceTypeId}`);
  const result = await supabase
    .from(TYPE_CATEGORIES_TABLE)
    .delete()
    .eq('service_type_id', serviceTypeId)
    .eq('category_id', categoryId)
    .select()
    .maybeSingle();
  return handleSupabase('catalog.detachCategory', result, { allowNull: true });
};

// ---------------------------------------------------------------------------
// Item CRUD
// ---------------------------------------------------------------------------

const createItem = async (data) => {
  logPayload('catalog.createItem', data);
  const result = await supabase.from(ITEMS_TABLE).insert(toItemInsert(data)).select().single();
  return mapItem(handleSupabase('catalog.createItem', result));
};

const updateItem = async (id, data) => {
  logPayload('catalog.updateItem', data);
  const result = await supabase.from(ITEMS_TABLE).update(toItemUpdate(data)).eq('id', id).select().single();
  return mapItem(handleSupabase('catalog.updateItem', result));
};

const deleteItem = async (id) => {
  logger.info(`[CATALOG MODEL] DELETE item id=${id}`);
  const result = await supabase.from(ITEMS_TABLE).delete().eq('id', id).select().maybeSingle();
  return handleSupabase('catalog.deleteItem', result, { allowNull: true });
};

module.exports = {
  mapServiceType,
  mapCategory,
  mapItem,
  getFullCatalogTree,
  getFlatItemIndex,
  createServiceType,
  updateServiceType,
  deleteServiceType,
  findServiceTypeById,
  createCategory,
  updateCategory,
  deleteCategory,
  attachCategoryToServiceType,
  detachCategoryFromServiceType,
  createItem,
  updateItem,
  deleteItem,
};
