const express = require('express');
const router = express.Router();
const RequestController = require('../controllers/request_controller');

router.post('/create', RequestController.createRequest);
router.get('/all', RequestController.getAllRequests);
router.get('/user/:userId', RequestController.getUserRequests);
router.get('/:id', RequestController.getRequest);
router.put('/:id', RequestController.updateRequest);

module.exports = router;