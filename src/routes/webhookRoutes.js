const express = require('express');
const router = express.Router();

const webhookController = require('../controllers/webhookController');

// Shiprocket webhook (no auth, verified by signature)
router.post('/shiprocket', webhookController.handleShiprocketWebhook);

module.exports = router;