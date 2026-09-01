const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// MSG91 incoming webhook
router.post('/msg91', webhookController.handleMsg91Webhook);

// Delivery status webhook
router.post('/msg91/status', webhookController.handleDeliveryStatus);

// Verification endpoint (GET) for MSG91 webhook setup
router.get('/msg91', webhookController.verifyWebhook);

module.exports = router;
