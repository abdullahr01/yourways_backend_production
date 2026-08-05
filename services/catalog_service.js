/**
 * Service catalog — the single entry point controllers/pricing use for
 * reading the catalog, and the only place admin catalog writes go through.
 *
 * Wraps models/catalog_model.js with an in-memory cache for the read-heavy
 * tree/lookup (the booking UI and every quote calculation hit this), which
 * is invalidated on any admin write. This keeps the public
 * GET /api/services/templates response fast without needing a full
 * multi-table join on every request.
 */
const CatalogModel = require('../models/catalog_model');
const logger = require('../utils/logger');

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

class CatalogService {
  constructor() {
    this._treeCache = null; // Promise<tree> | null
    this._indexCache = null; // Promise<flatIndex> | null
  }

  invalidateCache() {
    logger.info('[CATALOG SVC] Cache invalidated');
    this._treeCache = null;
    this._indexCache = null;
  }

  /** Public catalog tree — GET /api/services/templates. Cached. */
  async getTemplates() {
    if (!this._treeCache) {
      this._treeCache = CatalogModel.getFullCatalogTree().catch((err) => {
        this._treeCache = null; // don't cache failures
        throw err;
      });
    }
    return this._treeCache;
  }

  async getTemplateById(serviceId) {
    const templates = await this.getTemplates();
    return templates.find((t) => t.serviceId === serviceId) || null;
  }

  getHandlingOptions() {
    return HANDLING_OPTIONS;
  }

  /** Name-keyed lookup used by PricingService.calculateItemsCost. Cached. */
  async findCatalogItem(name) {
    if (!name) return null;
    if (!this._indexCache) {
      this._indexCache = CatalogModel.getFlatItemIndex().catch((err) => {
        this._indexCache = null;
        throw err;
      });
    }
    const index = await this._indexCache;
    return index[String(name).trim().toLowerCase()] || null;
  }

  // ——— Admin: service types ———

  async createServiceType(data) {
    const created = await CatalogModel.createServiceType(data);
    this.invalidateCache();
    return created;
  }

  async updateServiceType(id, data) {
    const updated = await CatalogModel.updateServiceType(id, data);
    this.invalidateCache();
    return updated;
  }

  async deleteServiceType(id) {
    const deleted = await CatalogModel.deleteServiceType(id);
    this.invalidateCache();
    return deleted;
  }

  // ——— Admin: categories ———

  async createCategory(data) {
    const created = await CatalogModel.createCategory(data);
    this.invalidateCache();
    return created;
  }

  async updateCategory(id, data) {
    const updated = await CatalogModel.updateCategory(id, data);
    this.invalidateCache();
    return updated;
  }

  async deleteCategory(id) {
    const deleted = await CatalogModel.deleteCategory(id);
    this.invalidateCache();
    return deleted;
  }

  async attachCategoryToServiceType(serviceTypeId, categoryId, sortOrder) {
    const joined = await CatalogModel.attachCategoryToServiceType(serviceTypeId, categoryId, sortOrder);
    this.invalidateCache();
    return joined;
  }

  async detachCategoryFromServiceType(serviceTypeId, categoryId) {
    const result = await CatalogModel.detachCategoryFromServiceType(serviceTypeId, categoryId);
    this.invalidateCache();
    return result;
  }

  // ——— Admin: items (incl. price overrides) ———

  async createItem(data) {
    const created = await CatalogModel.createItem(data);
    this.invalidateCache();
    return created;
  }

  async updateItem(id, data) {
    const updated = await CatalogModel.updateItem(id, data);
    this.invalidateCache();
    return updated;
  }

  async deleteItem(id) {
    const deleted = await CatalogModel.deleteItem(id);
    this.invalidateCache();
    return deleted;
  }
}

module.exports = new CatalogService();
