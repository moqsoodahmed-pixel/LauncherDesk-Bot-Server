const crypto = require('crypto');
const WebhookEvent = require('../models/WebhookEvent');
const MessageLog = require('../models/MessageLog');
const { processMessage } = require('../engines/conversationEngine');
const { parseIncomingMessage, processDeliveryStatus } = require('../services/msg91Service');
const logger = require('../utils/logger');

/**
 * Verify webhook authenticity using MSG91 signature
 */
function verifyMsg91Signature(rawBody, signature) {
  const secret = process.env.MSG91_WEBHOOK_SECRET;
  if (!secret || !signature) return true; // Skip if not configured
  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

/**
 * POST /api/webhooks/msg91
 * Handle incoming WhatsApp messages from MSG91
 */
exports.handleMsg91Webhook = async (req, res) => {
  const startTime = Date.now();

  // Parse raw body
  const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));
  const signature = req.headers['x-msg91-signature'] || req.headers['x-webhook-signature'];

  // Always respond 200 quickly to prevent MSG91 retries
  res.status(200).json({ success: true, message: 'Webhook received' });

  // Async processing
  setImmediate(async () => {
    try {
      // Verify signature
      if (!verifyMsg91Signature(rawBody, signature)) {
        logger.warn('[Webhook] Invalid signature rejected');
        return;
      }

      const payload = JSON.parse(rawBody.toString());
      logger.debug('[Webhook] Received payload', { type: payload.type || 'unknown' });

      // Parse the incoming message
      const parsedMessage = parseIncomingMessage(payload);
      if (!parsedMessage) {
        logger.warn('[Webhook] Could not parse incoming message');
        return;
      }

      // Create idempotency key
      const eventId = parsedMessage.messageId || `${parsedMessage.fromNumber}_${Date.now()}`;

      // Check for duplicate processing
      const existingEvent = await WebhookEvent.findOne({ eventId });
      if (existingEvent) {
        logger.info('[Webhook] Duplicate event ignored', { eventId });
        await WebhookEvent.findByIdAndUpdate(existingEvent._id, { $inc: { retryCount: 1 } });
        return;
      }

      // Store webhook event
      const webhookEvent = await WebhookEvent.create({
        provider: 'msg91',
        eventId,
        eventType: payload.type || 'message',
        rawPayload: payload,
        whatsappNumber: parsedMessage.fromNumber,
        messageId: parsedMessage.messageId,
        status: 'pending',
      });

      // Log incoming message
      await MessageLog.create({
        direction: 'incoming',
        whatsappNumber: parsedMessage.fromNumber,
        messageType: parsedMessage.messageType,
        content: parsedMessage.messageText,
        externalMessageId: parsedMessage.messageId,
        payload: parsedMessage,
        status: 'received',
      });

      // Process message through conversation engine
      await processMessage(parsedMessage);

      // Mark as processed
      const processingTime = Date.now() - startTime;
      await WebhookEvent.findByIdAndUpdate(webhookEvent._id, {
        status: 'processed',
        processedAt: new Date(),
        processingTimeMs: processingTime,
      });

      logger.info('[Webhook] Message processed successfully', {
        eventId,
        from: parsedMessage.fromNumber,
        processingTimeMs: processingTime,
      });
    } catch (err) {
      logger.error('[Webhook] Processing failed', { error: err.message, stack: err.stack });
    }
  });
};

/**
 * POST /api/webhooks/msg91/status
 * Handle delivery/read status updates
 */
exports.handleDeliveryStatus = async (req, res) => {
  res.status(200).json({ success: true });

  const payload = req.body instanceof Buffer ? JSON.parse(req.body.toString()) : req.body;
  setImmediate(async () => {
    try {
      const messageId = payload.message_id || payload.id;
      const status = payload.status || payload.message_status;
      if (messageId && status) {
        await processDeliveryStatus(messageId, status);
      }
    } catch (err) {
      logger.error('[Webhook] Status update failed', { error: err.message });
    }
  });
};

/**
 * GET /api/webhooks/msg91
 * Webhook verification challenge (if MSG91 requires it)
 */
exports.verifyWebhook = (req, res) => {
  const challenge = req.query.challenge || req.query.hub?.challenge;
  if (challenge) {
    return res.status(200).send(challenge);
  }
  res.status(200).json({ status: 'Webhook endpoint active', service: 'LauncherDesk MSG91 Webhook' });
};
