const express = require('express');
const router = express.Router();
const MapsController = require('../controllers/maps_controller');
const logger = require('../utils/logger');

logger.info('[ROUTES] Maps routes loaded (Google Distance Matrix + Geocoding)');

router.get('/geocode', MapsController.geocode);
router.get('/distance', MapsController.distance);

module.exports = router;
