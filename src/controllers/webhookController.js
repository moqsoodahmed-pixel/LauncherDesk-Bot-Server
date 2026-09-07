const crypto = require('crypto');
const WebhookEvent = require('../models/WebhookEvent');
const MessageLog = require('../models/MessageLog');
const { processMessage } = require('../engines/conversationEngine');
const { parseIncomingMessage, processDeliveryStatus } = require('../services/msg91Service');
const logger = require('../utils/logger');

function verifyMsg91Signature(rawBody, signature) {
  const secret = process.env.MSG91_WEBHOOK_SECRET;
  if (!secret || secret === 'your_webhook_secret_here' || !signature) return true;
  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

function parseBody(reqBody) {
  if (Buffer.isBuffer(reqBody)) {
    return { raw: reqBody, parsed: JSON.parse(reqBody.toString()) };
  }
  if (typeof reqBody === 'string') {
    const buf = Buffer.from(reqBody);
    return { raw: buf, parsed: JSON.parse(reqBody) };
  }
  const str = JSON.stringify(reqBody);
  return { raw: Buffer.from(str), parsed: reqBody };
}

/**
 * Build a stable idempotency key from the message.
 *
 * MSG91 sometimes fires the same webhook twice within milliseconds.
 * We use fromNumber + messageId (if real) OR fromNumber + text + minute-bucket
 * so that two fires of the same message in the same minute are collapsed.
 */
function buildEventId(parsedMessage, rawPayload) {
  const { fromNumber, messageId, messageText } = parsedMessage;

  // If MSG91 gave us a real message ID (not our local fallback), trust it
  if (messageId && !messageId.startsWith('local_')) {
    return `${fromNumber}_${messageId}`;
  }

  // Fallback: number + text + minute bucket — collapses duplicates within 60 s
  const minuteBucket = Math.floor(Date.now() / 60000);
  const textKey = (messageText || '').trim().toLowerCase().slice(0, 30);
  return `${fromNumber}_${textKey}_${minuteBucket}`;
}

/**
 * POST /api/webhooks/msg91
 */
exports.handleMsg91Webhook = async (req, res) => {
  const startTime = Date.now();

  let raw, parsed;
  try {
    ({ raw, parsed } = parseBody(req.body));
  } catch (err) {
    logger.error('[Webhook] Body parse failed', { error: err.message });
    return res.status(200).json({ success: true, message: 'Received' });
  }

  const signature = req.headers['x-msg91-signature'] || req.headers['x-webhook-signature'];

  // Respond 200 immediately so MSG91 doesn't retry
  res.status(200).json({ success: true, message: 'Webhook received' });

  setImmediate(async () => {
    try {
      if (!verifyMsg91Signature(raw, signature)) {
        logger.warn('[Webhook] Bad signature — ignored');
        return;
      }

      logger.debug('[Webhook] Payload', { payload: JSON.stringify(parsed) });

      const parsedMessage = parseIncomingMessage(parsed);
      if (!parsedMessage) {
        logger.warn('[Webhook] Unparseable payload', { raw: JSON.stringify(parsed) });
        return;
      }

      const eventId = buildEventId(parsedMessage, parsed);

      // ── Idempotency check — atomic findOneAndUpdate to avoid race conditions ──
      const existing = await WebhookEvent.findOneAndUpdate(
        { eventId },
        { $inc: { retryCount: 1 }, $setOnInsert: { status: 'processing' } },
        { upsert: true, new: false } // returns OLD doc (null if just inserted)
      );

      if (existing) {
        // Doc already existed → duplicate
        logger.info('[Webhook] Duplicate suppressed', { eventId, retryCount: existing.retryCount });
        return;
      }

      // First time seeing this event — process it
      logger.info('[Webhook] Processing', { eventId, from: parsedMessage.fromNumber, text: parsedMessage.messageText });

      await MessageLog.create({
        direction: 'incoming',
        whatsappNumber: parsedMessage.fromNumber,
        messageType: parsedMessage.messageType,
        content: parsedMessage.messageText,
        externalMessageId: parsedMessage.messageId,
        payload: parsedMessage,
        status: 'received',
      });

      await processMessage(parsedMessage);

      const processingTime = Date.now() - startTime;
      await WebhookEvent.findOneAndUpdate(
        { eventId },
        {
          status: 'processed',
          processedAt: new Date(),
          processingTimeMs: processingTime,
          provider: 'msg91',
          eventType: parsed.contentType || parsed.messageType || 'message',
          rawPayload: parsed,
          whatsappNumber: parsedMessage.fromNumber,
          messageId: parsedMessage.messageId,
        }
      );

      logger.info('[Webhook] Done', { eventId, ms: processingTime });
    } catch (err) {
      logger.error('[Webhook] Processing error', { error: err.message, stack: err.stack });
    }
  });
};

/**
 * POST /api/webhooks/msg91/status
 */
exports.handleDeliveryStatus = async (req, res) => {
  res.status(200).json({ success: true });
  let payload;
  try { ({ parsed: payload } = parseBody(req.body)); } catch { return; }

  setImmediate(async () => {
    try {
      const messageId = payload.message_id || payload.id || payload.requestId;
      const status = payload.status || payload.message_status;
      if (messageId && status) await processDeliveryStatus(messageId, status);
    } catch (err) {
      logger.error('[Webhook] Status update error', { error: err.message });
    }
  });
};

/**
 * GET /api/webhooks/msg91
 */
exports.verifyWebhook = (req, res) => {
  const challenge = req.query.challenge || req.query['hub.challenge'];
  if (challenge) return res.status(200).send(challenge);
  res.status(200).json({ status: 'active', service: 'LauncherDesk MSG91 Webhook' });
};