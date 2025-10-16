const express = require('express');
const router = express.Router();
const DriverController = require('../controllers/driver_controller');

router.post('/register', DriverController.registerDriver);
router.get('/available', DriverController.getAvailableDrivers);
router.get('/:id', DriverController.getDriver);
router.put('/:id', DriverController.updateDriver);

module.exports = router;
