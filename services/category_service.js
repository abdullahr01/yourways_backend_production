const Category = require('../models/category_model');
const logger = require('../utils/logger');

class CategoryService {
  async createCategory(categoryData) {
    try {
      const existingCategory = await Category.findOne({ name: categoryData.name });
      if (existingCategory) {
        throw new Error('Category with this name already exists');
      }

      const category = new Category(categoryData);
      await category.save();
      logger.success(`Category created: ${category.name}`);
      return category;
    } catch (error) {
      logger.error(`Error creating category: ${error.message}`);
      throw error;
    }
  }

  async getAllCategories() {
    try {
      const categories = await Category.find({});
      logger.info(`Fetched ${categories.length} categories`);
      return categories;
    } catch (error) {
      logger.error(`Error fetching categories: ${error.message}`);
      throw error;
    }
  }

  async getCategoryById(categoryId) {
    try {
      const category = await Category.findById(categoryId);
      if (!category) {
        throw new Error('Category not found');
      }
      return category;
    } catch (error) {
      logger.error(`Error fetching category: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new CategoryService();