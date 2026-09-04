const crypto = require('crypto');
const WebhookEvent = require('../models/WebhookEvent');
const MessageLog = require('../models/MessageLog');
const { processMessage } = require('../engines/conversationEngine');
const { parseIncomingMessage, processDeliveryStatus } = require('../services/msg91Service');
const logger = require('../utils/logger');

/**
 * Verify webhook authenticity using MSG91 signature.
 * If MSG91_WEBHOOK_SECRET is not set (or set to placeholder), skip verification.
 */
function verifyMsg91Signature(rawBody, signature) {
  const secret = process.env.MSG91_WEBHOOK_SECRET;
  // Skip if not configured or still set to placeholder
  if (!secret || secret === 'your_webhook_secret_here' || !signature) return true;
  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Safely parse request body — handles both Buffer (from express.raw) and
 * already-parsed JSON objects (from express.json).
 */
function parseBody(reqBody) {
  if (Buffer.isBuffer(reqBody)) {
    return { raw: reqBody, parsed: JSON.parse(reqBody.toString()) };
  }
  if (typeof reqBody === 'string') {
    const buf = Buffer.from(reqBody);
    return { raw: buf, parsed: JSON.parse(reqBody) };
  }
  // Already parsed object — reconstruct raw buffer for signature check
  const str = JSON.stringify(reqBody);
  return { raw: Buffer.from(str), parsed: reqBody };
}

/**
 * POST /api/webhooks/msg91
 * Handle incoming WhatsApp messages from MSG91
 */
exports.handleMsg91Webhook = async (req, res) => {
  const startTime = Date.now();

  let raw, parsed;
  try {
    ({ raw, parsed } = parseBody(req.body));
  } catch (err) {
    logger.error('[Webhook] Failed to parse request body', { error: err.message });
    // Still return 200 so MSG91 doesn't retry
    return res.status(200).json({ success: true, message: 'Received' });
  }

  const signature = req.headers['x-msg91-signature'] || req.headers['x-webhook-signature'];

  // Always respond 200 immediately to prevent MSG91 retries
  res.status(200).json({ success: true, message: 'Webhook received' });

  // Async processing after response sent
  setImmediate(async () => {
    try {
      // Verify signature (skipped if secret not configured)
      if (!verifyMsg91Signature(raw, signature)) {
        logger.warn('[Webhook] Invalid signature rejected');
        return;
      }

      logger.debug('[Webhook] Received payload', { payload: JSON.stringify(parsed) });

      // Parse the incoming message
      const parsedMessage = parseIncomingMessage(parsed);
      if (!parsedMessage) {
        logger.warn('[Webhook] Could not parse incoming message, raw payload logged', {
          payload: JSON.stringify(parsed),
        });
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
        eventType: parsed.contentType || parsed.messageType || parsed.type || 'message',
        rawPayload: parsed,
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
        text: parsedMessage.messageText,
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

  let payload;
  try {
    ({ parsed: payload } = parseBody(req.body));
  } catch {
    return;
  }

  setImmediate(async () => {
    try {
      const messageId = payload.message_id || payload.id || payload.requestId;
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
  const challenge = req.query.challenge || req.query['hub.challenge'];
  if (challenge) {
    return res.status(200).send(challenge);
  }
  res.status(200).json({ status: 'Webhook endpoint active', service: 'LauncherDesk MSG91 Webhook' });
};