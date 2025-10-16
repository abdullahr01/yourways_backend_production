const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user_controller');

router.post('/register', UserController.registerUser);
router.get('/all', UserController.getAllUsers);
router.get('/:id', UserController.getUser);
router.put('/:id', UserController.updateUser);

module.exports = router;