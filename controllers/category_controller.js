const CategoryService = require('../services/category_service');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const logger = require('../utils/logger');

class CategoryController {
  async createCategory(req, res) {
    try {
      logger.info('Category creation request received');
      const category = await CategoryService.createCategory(req.body);
      successResponse(res, 201, 'Category created successfully', category);
    } catch (error) {
      logger.error(`Category creation error: ${error.message}`);
      errorResponse(res, 400, 'Category creation failed', error);
    }
  }

  async getAllCategories(req, res) {
    try {
      logger.info('Fetching all categories');
      const categories = await CategoryService.getAllCategories();
      successResponse(res, 200, 'Categories fetched successfully', categories);
    } catch (error) {
      logger.error(`Error fetching categories: ${error.message}`);
      errorResponse(res, 500, 'Failed to fetch categories', error);
    }
  }

  async getCategory(req, res) {
    try {
      logger.info(`Fetching category with ID: ${req.params.id}`);
      const category = await CategoryService.getCategoryById(req.params.id);
      successResponse(res, 200, 'Category fetched successfully', category);
    } catch (error) {
      logger.error(`Error fetching category: ${error.message}`);
      errorResponse(res, 404, 'Category not found', error);
    }
  }
}

module.exports = new CategoryController();
