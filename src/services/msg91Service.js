/**
 * MSG91 WhatsApp Integration Service
 *
 * API: https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/
 *
 * NOTE: MSG91 interactive messages (buttons/lists) require specific account
 * configuration and may not be available on all plans. This service sends
 * all messages as plain text with numbered options as a reliable fallback.
 *
 * Text payload:
 *   POST control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/
 *   { integrated_number, recipient_number, content_type: "text", text: "..." }
 */

const axios = require('axios');
const logger = require('../utils/logger');
const MessageLog = require('../models/MessageLog');

const BASE_URL = 'https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/';
const AUTH_KEY = process.env.MSG91_AUTH_KEY;
const SENDER_NUMBER = process.env.MSG91_WHATSAPP_NUMBER;

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    Authkey: AUTH_KEY,
  };
}

/**
 * Core sender — all messages go through here
 */
async function sendMessage(toNumber, payload, conversationId, leadId) {
  const logEntry = await MessageLog.create({
    direction: 'outgoing',
    whatsappNumber: toNumber,
    messageType: payload.type || 'text',
    content: payload.text || payload.body || JSON.stringify(payload).slice(0, 200),
    payload,
    conversationId,
    leadId,
    status: 'sent',
  });

  if (!AUTH_KEY || !SENDER_NUMBER) {
    logger.warn('[MSG91] Credentials not configured — dry-run.', { to: toNumber });
    return { success: true, dryRun: true, logId: logEntry._id };
  }

  // Always convert to plain text — most reliable across all MSG91 plans
  const textBody = toTextPayload(toNumber, payload);
  logger.debug('[MSG91] Sending', { to: toNumber, body: JSON.stringify(textBody) });

  try {
    const response = await axios.post(BASE_URL, textBody, {
      headers: getHeaders(),
      timeout: 10000,
    });

    await MessageLog.findByIdAndUpdate(logEntry._id, {
      status: 'sent',
      externalMessageId: response.data?.message_id || response.data?.request_id,
      metadata: { response: response.data },
    });

    logger.info('[MSG91] Sent OK', { to: toNumber, type: payload.type, res: response.data });
    return { success: true, messageId: response.data?.message_id, logId: logEntry._id };
  } catch (error) {
    const errMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    logger.error('[MSG91] Send failed', { to: toNumber, error: errMsg });
    await MessageLog.findByIdAndUpdate(logEntry._id, { status: 'failed', error: errMsg });
    return { success: false, error: errMsg, logId: logEntry._id };
  }
}

/**
 * Convert any message type to a plain-text MSG91 payload.
 * Buttons and lists are rendered as numbered text options.
 */
function toTextPayload(toNumber, payload) {
  let text;

  if (payload.type === 'text') {
    text = payload.text;

  } else if (payload.type === 'button') {
    const opts = (payload.buttons || [])
      .map((b, i) => `${i + 1}. ${b.label || b.title}`)
      .join('\n');
    text = `${payload.body}\n\n${opts}\n\n_Reply with the number of your choice._`;

  } else if (payload.type === 'list') {
    const opts = (payload.options || [])
      .map((o, i) => `${i + 1}. ${o.label}`)
      .join('\n');
    text = `${payload.body}\n\n${opts}\n\n_Reply with the number of your choice._`;

  } else {
    text = payload.text || JSON.stringify(payload);
  }

  return {
    integrated_number: SENDER_NUMBER,
    recipient_number: toNumber,
    content_type: 'text',
    text,
  };
}

// ─── Public helpers ──────────────────────────────────────────

async function sendTextMessage(toNumber, text, conversationId, leadId) {
  return sendMessage(toNumber, { type: 'text', text }, conversationId, leadId);
}

async function sendButtonMessage(toNumber, body, buttons, conversationId, leadId) {
  if (!buttons || buttons.length === 0) {
    return sendTextMessage(toNumber, body, conversationId, leadId);
  }
  return sendMessage(toNumber, { type: 'button', body, buttons }, conversationId, leadId);
}

async function sendListMessage(toNumber, body, options, sectionTitle, conversationId, leadId) {
  return sendMessage(toNumber, { type: 'list', body, options, sectionTitle }, conversationId, leadId);
}

async function sendNumberedTextMessage(toNumber, body, options, conversationId, leadId) {
  const numbered = options.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n');
  const text = `${body}\n\n${numbered}\n\n_Reply with the number of your choice._`;
  return sendMessage(toNumber, { type: 'text', text }, conversationId, leadId);
}

async function sendTemplateMessage(toNumber, templateName, variables, conversationId) {
  // Templates use the bulk endpoint — keep separate
  const integrated_number = SENDER_NUMBER;
  const logEntry = await MessageLog.create({
    direction: 'outgoing',
    whatsappNumber: toNumber,
    messageType: 'template',
    content: templateName,
    status: 'sent',
    conversationId,
  });

  if (!AUTH_KEY || !SENDER_NUMBER) return { success: true, dryRun: true };

  try {
    const response = await axios.post(
      `${BASE_URL}bulk/`,
      {
        integrated_number,
        content_type: 'template',
        data: [{
          to: toNumber,
          type: 'template',
          message: {
            name: templateName,
            language: { code: 'en' },
            components: variables
              ? [{ type: 'body', parameters: variables.map((v) => ({ type: 'text', text: v })) }]
              : [],
          },
        }],
      },
      { headers: getHeaders(), timeout: 10000 }
    );
    await MessageLog.findByIdAndUpdate(logEntry._id, { status: 'sent', metadata: { response: response.data } });
    return { success: true };
  } catch (error) {
    const errMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    logger.error('[MSG91] Template send failed', { error: errMsg });
    await MessageLog.findByIdAndUpdate(logEntry._id, { status: 'failed', error: errMsg });
    return { success: false, error: errMsg };
  }
}

async function processDeliveryStatus(messageId, status) {
  try {
    await MessageLog.findOneAndUpdate(
      { externalMessageId: messageId },
      { status: status.toLowerCase(), updatedAt: new Date() }
    );
    logger.info('[MSG91] Delivery status updated', { messageId, status });
  } catch (err) {
    logger.error('[MSG91] Status update failed', { error: err.message });
  }
}

/**
 * Parse incoming MSG91 webhook payload.
 * Handles all MSG91 payload shapes.
 */
function parseIncomingMessage(rawBody) {
  try {
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    logger.debug('[MSG91] Raw webhook', { body: JSON.stringify(body) });

    let fromNumber, messageText, messageId, messageType, buttonPayload, timestamp;

    // Format 1: MSG91 flat webhook (customerNumber, contentType, text, interactive...)
    if (body.customerNumber || body.integratedNumber) {
      fromNumber = body.customerNumber || body.from;
      messageId = body.requestId || body.replyMsgId || body.uuid || `local_${Date.now()}`;
      timestamp = body.ts ? parseInt(body.ts, 10) : Date.now();
      messageType = (body.contentType || body.messageType || 'text').toLowerCase();

      if (body.text && (messageType === 'text' || !body.interactive)) {
        messageText = body.text;
        messageType = 'text';
      } else if (body.interactive || messageType === 'interactive') {
        let interactive = body.interactive;
        if (typeof interactive === 'string') {
          try { interactive = JSON.parse(interactive); } catch (_) { interactive = {}; }
        }
        interactive = interactive || {};
        if (interactive.type === 'button_reply') {
          buttonPayload = { id: interactive.button_reply?.id, title: interactive.button_reply?.title };
          messageText = interactive.button_reply?.title || interactive.button_reply?.id;
          messageType = 'button_reply';
        } else if (interactive.type === 'list_reply') {
          buttonPayload = { id: interactive.list_reply?.id, title: interactive.list_reply?.title };
          messageText = interactive.list_reply?.title || interactive.list_reply?.id;
          messageType = 'list_reply';
        } else {
          messageText = body.text || '';
        }
      } else if (body.button || messageType === 'button') {
        let btn = body.button;
        if (typeof btn === 'string') { try { btn = JSON.parse(btn); } catch (_) { btn = { text: btn }; } }
        btn = btn || {};
        buttonPayload = { id: btn.payload || btn.id, title: btn.text || btn.title };
        messageText = btn.text || btn.title || btn.payload || '';
        messageType = 'button_reply';
      } else if (body.text) {
        messageText = body.text;
        messageType = 'text';
      } else if (body.messages) {
        let msgs = body.messages;
        if (typeof msgs === 'string') { try { msgs = JSON.parse(msgs); } catch (_) { msgs = null; } }
        if (Array.isArray(msgs) && msgs.length > 0) {
          const m = msgs[0];
          fromNumber = fromNumber || m.from;
          messageText = m.text?.body || m.text || m.message || '';
          messageType = m.type || 'text';
          messageId = m.id || messageId;
        }
      }
    }
    // Format 2: data-wrapped
    else if (body.data) {
      const data = Array.isArray(body.data) ? body.data[0] : body.data;
      fromNumber = data.from || data.sender || data.mobile || data.customerNumber;
      messageId = data.id || data.message_id;
      timestamp = data.timestamp || Date.now();
      if (data.type === 'text' || data.text) {
        messageText = data.text?.body || data.text || data.message;
        messageType = 'text';
      } else if (data.type === 'interactive') {
        const iv = data.interactive || {};
        if (iv.type === 'button_reply') {
          buttonPayload = { id: iv.button_reply?.id, title: iv.button_reply?.title };
          messageText = iv.button_reply?.title;
          messageType = 'button_reply';
        } else if (iv.type === 'list_reply') {
          buttonPayload = { id: iv.list_reply?.id, title: iv.list_reply?.title };
          messageText = iv.list_reply?.title;
          messageType = 'list_reply';
        }
      } else {
        messageText = data.message || data.body || '';
        messageType = data.type || 'text';
      }
    }
    // Format 3: flat top-level
    else {
      fromNumber = body.from || body.sender || body.mobile || body.customerNumber;
      messageId = body.id || body.message_id;
      messageText = body.text?.body || body.text || body.message || '';
      messageType = body.type || 'text';
      timestamp = body.timestamp || Date.now();
    }

    if (!fromNumber) {
      logger.warn('[MSG91] No sender found', { body: JSON.stringify(body) });
      return null;
    }

    let parsedTimestamp;
    if (typeof timestamp === 'number') {
      parsedTimestamp = timestamp > 1e10 ? new Date(timestamp) : new Date(timestamp * 1000);
    } else {
      parsedTimestamp = new Date();
    }

    const result = {
      fromNumber: String(fromNumber),
      messageText: (messageText || '').trim(),
      messageId: String(messageId || `local_${Date.now()}`),
      messageType: messageType || 'text',
      buttonPayload,
      timestamp: parsedTimestamp,
      rawPayload: body,
    };

    logger.debug('[MSG91] Parsed', { result });
    return result;
  } catch (err) {
    logger.error('[MSG91] Parse failed', { error: err.message });
    return null;
  }
}

module.exports = {
  sendMessage,
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  sendTemplateMessage,
  sendNumberedTextMessage,
  processDeliveryStatus,
  parseIncomingMessage,
};