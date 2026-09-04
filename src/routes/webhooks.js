const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// MSG91 incoming webhook — POST /api/webhooks/msg91
router.post('/msg91', webhookController.handleMsg91Webhook);

// Delivery status webhook — POST /api/webhooks/msg91/status
router.post('/msg91/status', webhookController.handleDeliveryStatus);

// Verification / health check — GET /api/webhooks/msg91
router.get('/msg91', webhookController.verifyWebhook);

module.exports = router;