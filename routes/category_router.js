const express = require('express');
const router = express.Router();
const CategoryController = require('../controllers/category_controller');

router.post('/create', CategoryController.createCategory);
router.get('/all', CategoryController.getAllCategories);
router.get('/:id', CategoryController.getCategory);

module.exports = router;