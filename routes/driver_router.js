const express = require('express');
const router = express.Router();
const DriverController = require('../controllers/driver_controller');

router.post('/register', DriverController.register);
router.post('/login', DriverController.login);
router.get('/all', DriverController.getAll);
router.put('/approve/:id', DriverController.approve);

module.exports = router;
