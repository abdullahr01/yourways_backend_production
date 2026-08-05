const CatalogService = require('../services/catalog_service');
const PricingService = require('../services/pricing_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class ServiceController {
  /**
   * GET /api/services/templates
   * Returns all service categories & items for the booking UI.
   * DB-backed (services/catalog_service.js) — response shape is unchanged
   * from the old static-file version, but the data is now admin-editable
   * via /api/admin/catalog/*.
   */
  async getTemplates(req, res) {
    try {
      logger.info('[SERVICE] Fetching all service templates');
      const templates = await CatalogService.getTemplates();
      logger.info(`[SERVICE] Returning ${templates.length} templates`);

      return successResponse(res, 200, 'Service templates fetched successfully', {
        templates,
        handlingOptions: CatalogService.getHandlingOptions(),
      });
    } catch (err) {
      logger.error(`[SERVICE] Failed to fetch templates: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch service templates', err);
    }
  }

  /**
   * GET /api/services/templates/:serviceId
   */
  async getTemplateById(req, res) {
    try {
      const { serviceId } = req.params;
      logger.info(`[SERVICE] Fetching template: ${serviceId}`);

      const template = await CatalogService.getTemplateById(serviceId);
      if (!template) {
        logger.warn(`[SERVICE] Template not found: ${serviceId}`);
        return errorResponse(res, 404, 'Service template not found');
      }

      logger.success(`[SERVICE] Template found: ${template.name}`);
      return successResponse(res, 200, 'Service template fetched successfully', template);
    } catch (err) {
      logger.error(`[SERVICE] Failed to fetch template: ${err.message}`);
      return errorResponse(res, 500, 'Failed to fetch service template', err);
    }
  }

  /**
   * POST /api/services/quote
   * Quick quotation without saving a booking (preview).
   */
  async getQuote(req, res) {
    try {
      logger.info('[SERVICE] Quick quote request received');
      logger.info(`[SERVICE] Quote route: ${req.body.collectionPostcode} -> ${req.body.deliveryPostcode}, items: ${req.body.items?.length || 0}`);

      const breakdown = await PricingService.calculateQuotation(req.body);

      return successResponse(res, 200, 'Quotation calculated successfully', {
        estimatedCost: breakdown.total,
        standardCost: breakdown.standardTotal,
        discountAmount: breakdown.discountAmount,
        discountPercentage: breakdown.discountPercentage,
        estimatedDeliveryHours: breakdown.estimatedDeliveryHours,
        taxesAndCharges: breakdown.vat,
        priceBreakdown: breakdown,
      });
    } catch (err) {
      logger.error(`[SERVICE] Quote calculation failed: ${err.message}`);
      return errorResponse(res, 400, 'Quotation calculation failed', err);
    }
  }
}

module.exports = new ServiceController();
