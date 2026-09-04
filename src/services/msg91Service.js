/**
 * MSG91 WhatsApp Integration Service
 *
 * API Reference: https://docs.msg91.com/whatsapp
 * Base URL: https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/
 *
 * Text message payload:
 *   { integrated_number, recipient_number, content_type: "text", text: "..." }
 *
 * Interactive button payload:
 *   { integrated_number, recipient_number, content_type: "interactive", message: { interactive: { type:"button", ... } } }
 *
 * Interactive list payload:
 *   { integrated_number, recipient_number, content_type: "interactive", message: { interactive: { type:"list", ... } } }
 *
 * Template (bulk) endpoint: /bulk/
 *   { integrated_number, content_type: "template", data: [{ to, type:"template", message: {...} }] }
 */

const axios = require('axios');
const logger = require('../utils/logger');
const MessageLog = require('../models/MessageLog');

// MSG91 correct base URL
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
 * Core message sender
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
    logger.warn('[MSG91] Credentials not configured — dry-run mode.', { to: toNumber });
    return { success: true, dryRun: true, logId: logEntry._id };
  }

  try {
    const { endpoint, body } = buildMSG91Request(toNumber, payload);
    logger.debug('[MSG91] Sending request', { endpoint, body: JSON.stringify(body) });

    const response = await axios.post(endpoint, body, {
      headers: getHeaders(),
      timeout: 10000,
    });

    await MessageLog.findByIdAndUpdate(logEntry._id, {
      status: 'sent',
      externalMessageId: response.data?.message_id || response.data?.request_id,
      metadata: { response: response.data },
    });

    logger.info('[MSG91] Message sent successfully', { to: toNumber, type: payload.type, response: response.data });
    return { success: true, messageId: response.data?.message_id, logId: logEntry._id };
  } catch (error) {
    const errMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    logger.error('[MSG91] Failed to send message', { to: toNumber, error: errMsg, status: error.response?.status });

    await MessageLog.findByIdAndUpdate(logEntry._id, { status: 'failed', error: errMsg });
    return { success: false, error: errMsg, logId: logEntry._id };
  }
}

/**
 * Build the correct MSG91 API request based on message type.
 *
 * Returns { endpoint, body } where endpoint is the full URL to POST to.
 */
function buildMSG91Request(toNumber, payload) {
  const integrated_number = SENDER_NUMBER;
  const recipient_number = toNumber;

  // ── Plain text ──────────────────────────────────────────────
  if (payload.type === 'text') {
    return {
      endpoint: BASE_URL,
      body: {
        integrated_number,
        recipient_number,
        content_type: 'text',
        text: payload.text,
      },
    };
  }

  // ── Interactive buttons (max 3) ─────────────────────────────
  if (payload.type === 'button') {
    return {
      endpoint: BASE_URL,
      body: {
        integrated_number,
        recipient_number,
        content_type: 'interactive',
        message: {
          interactive: {
            type: 'button',
            body: { text: payload.body },
            action: {
              buttons: payload.buttons.map((btn, i) => ({
                type: 'reply',
                reply: {
                  id: String(btn.id || `btn_${i}`).slice(0, 256),
                  title: String(btn.label || btn.title || '').slice(0, 20),
                },
              })),
            },
          },
        },
      },
    };
  }

  // ── Interactive list ────────────────────────────────────────
  if (payload.type === 'list') {
    return {
      endpoint: BASE_URL,
      body: {
        integrated_number,
        recipient_number,
        content_type: 'interactive',
        message: {
          interactive: {
            type: 'list',
            body: { text: payload.body },
            action: {
              button: (payload.buttonLabel || 'Select').slice(0, 20),
              sections: payload.sections || [
                {
                  title: (payload.sectionTitle || 'Options').slice(0, 24),
                  rows: (payload.options || []).map((opt, i) => ({
                    id: String(opt.id || `opt_${i}`).slice(0, 200),
                    title: String(opt.label || '').slice(0, 24),
                    description: String(opt.description || '').slice(0, 72),
                  })),
                },
              ],
            },
          },
        },
      },
    };
  }

  // ── Template (uses /bulk/ endpoint) ────────────────────────
  if (payload.type === 'template') {
    return {
      endpoint: `${BASE_URL}bulk/`,
      body: {
        integrated_number,
        content_type: 'template',
        data: [
          {
            to: toNumber,
            type: 'template',
            message: payload.template,
          },
        ],
      },
    };
  }

  // ── Fallback: plain text ────────────────────────────────────
  return {
    endpoint: BASE_URL,
    body: {
      integrated_number,
      recipient_number,
      content_type: 'text',
      text: payload.text || JSON.stringify(payload),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Public helper functions
// ─────────────────────────────────────────────────────────────

async function sendTextMessage(toNumber, text, conversationId, leadId) {
  return sendMessage(toNumber, { type: 'text', text }, conversationId, leadId);
}

async function sendButtonMessage(toNumber, body, buttons, conversationId, leadId) {
  if (!buttons || buttons.length === 0) {
    return sendTextMessage(toNumber, body, conversationId, leadId);
  }
  if (buttons.length <= 3) {
    return sendMessage(toNumber, { type: 'button', body, buttons }, conversationId, leadId);
  }
  if (buttons.length <= 10) {
    return sendListMessage(toNumber, body, buttons.map((b) => ({ id: b.id, label: b.label })), 'Options', conversationId, leadId);
  }
  return sendNumberedTextMessage(toNumber, body, buttons, conversationId, leadId);
}

async function sendListMessage(toNumber, body, options, sectionTitle, conversationId, leadId) {
  if (options.length <= 10) {
    return sendMessage(toNumber, { type: 'list', body, options, sectionTitle }, conversationId, leadId);
  }
  return sendNumberedTextMessage(toNumber, body, options, conversationId, leadId);
}

async function sendNumberedTextMessage(toNumber, body, options, conversationId, leadId) {
  const numbered = options.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n');
  const text = `${body}\n\n${numbered}\n\n_Reply with the number of your choice._`;
  return sendMessage(toNumber, { type: 'text', text }, conversationId, leadId);
}

async function sendTemplateMessage(toNumber, templateName, variables, conversationId) {
  const payload = {
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components: variables
        ? [{ type: 'body', parameters: variables.map((v) => ({ type: 'text', text: v })) }]
        : [],
    },
  };
  return sendMessage(toNumber, payload, conversationId);
}

async function processDeliveryStatus(messageId, status) {
  try {
    await MessageLog.findOneAndUpdate(
      { externalMessageId: messageId },
      { status: status.toLowerCase(), updatedAt: new Date() }
    );
    logger.info('[MSG91] Delivery status updated', { messageId, status });
  } catch (err) {
    logger.error('[MSG91] Failed to update delivery status', { messageId, error: err.message });
  }
}

/**
 * Parse an incoming MSG91 WhatsApp webhook payload.
 *
 * MSG91 sends flat fields: customerNumber, integratedNumber, contentType,
 * text, messageType, interactive, button, ts, messages, etc.
 */
function parseIncomingMessage(rawBody) {
  try {
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    logger.debug('[MSG91] Raw webhook body', { body: JSON.stringify(body) });

    let fromNumber, messageText, messageId, messageType, buttonPayload, timestamp;

    // ── Format 1: MSG91 flat webhook payload ──────────────────
    if (body.customerNumber || body.integratedNumber) {
      fromNumber = body.customerNumber || body.from;
      messageId = body.requestId || body.replyMsgId || body.uuid || `local_${Date.now()}`;
      timestamp = body.ts ? parseInt(body.ts, 10) : Date.now();
      messageType = (body.contentType || body.messageType || 'text').toLowerCase();

      if (messageType === 'text' || body.text) {
        messageText = body.text;
        messageType = 'text';
      } else if (messageType === 'interactive' || body.interactive) {
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
          messageText = body.text || JSON.stringify(interactive);
          messageType = 'interactive';
        }
      } else if (messageType === 'button' || body.button) {
        let btn = body.button;
        if (typeof btn === 'string') {
          try { btn = JSON.parse(btn); } catch (_) { btn = { text: btn }; }
        }
        btn = btn || {};
        buttonPayload = { id: btn.payload || btn.id, title: btn.text || btn.title };
        messageText = btn.text || btn.title || btn.payload;
        messageType = 'button_reply';
      } else if (body.messages) {
        let msgs = body.messages;
        if (typeof msgs === 'string') {
          try { msgs = JSON.parse(msgs); } catch (_) { msgs = null; }
        }
        if (Array.isArray(msgs) && msgs.length > 0) {
          const m = msgs[0];
          fromNumber = fromNumber || m.from;
          messageText = m.text?.body || m.text || m.message || '';
          messageType = m.type || 'text';
          messageId = m.id || messageId;
        }
      }
    }
    // ── Format 2: data-wrapped ────────────────────────────────
    else if (body.data) {
      const data = Array.isArray(body.data) ? body.data[0] : body.data;
      fromNumber = data.from || data.sender || data.mobile || data.customerNumber;
      messageId = data.id || data.message_id || data.msg_id;
      timestamp = data.timestamp || data.time || Date.now();

      if (data.type === 'text' || data.text) {
        messageText = data.text?.body || data.text || data.message;
        messageType = 'text';
      } else if (data.type === 'interactive') {
        const interactive = data.interactive || {};
        if (interactive.type === 'button_reply') {
          buttonPayload = { id: interactive.button_reply?.id, title: interactive.button_reply?.title };
          messageText = interactive.button_reply?.title;
          messageType = 'button_reply';
        } else if (interactive.type === 'list_reply') {
          buttonPayload = { id: interactive.list_reply?.id, title: interactive.list_reply?.title };
          messageText = interactive.list_reply?.title;
          messageType = 'list_reply';
        }
      } else if (data.type === 'button') {
        buttonPayload = { id: data.button?.payload, title: data.button?.text };
        messageText = data.button?.text;
        messageType = 'button_reply';
      } else {
        messageText = data.message || data.body || '';
        messageType = data.type || 'text';
      }
    }
    // ── Format 3: flat top-level ──────────────────────────────
    else {
      fromNumber = body.from || body.sender || body.mobile || body.customerNumber;
      messageId = body.id || body.message_id;
      messageText = body.text?.body || body.text || body.message || '';
      messageType = body.type || 'text';
      timestamp = body.timestamp || Date.now();
    }

    if (!fromNumber) {
      logger.warn('[MSG91] Could not extract sender number', { body: JSON.stringify(body) });
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

    logger.debug('[MSG91] Parsed incoming message', { result });
    return result;
  } catch (err) {
    logger.error('[MSG91] Failed to parse incoming message', { error: err.message });
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