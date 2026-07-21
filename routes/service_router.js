const express = require('express');
const router = express.Router();
const ServiceController = require('../controllers/service_controller');
const logger = require('../utils/logger');

logger.info('[ROUTES] Service routes loaded');

router.get('/templates', ServiceController.getTemplates);
router.get('/templates/:serviceId', ServiceController.getTemplateById);
router.post('/quote', ServiceController.getQuote);

module.exports = router;
