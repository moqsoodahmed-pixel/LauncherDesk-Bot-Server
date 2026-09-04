/**
 * MSG91 WhatsApp Integration Service
 *
 * All MSG91 credentials are read from environment variables.
 * Configure these in your .env file:
 *   MSG91_AUTH_KEY        — Your MSG91 auth key
 *   MSG91_WHATSAPP_NUMBER — Your registered WhatsApp number (91XXXXXXXXXX)
 *   MSG91_INTEGRATION_ID  — WhatsApp integration ID from MSG91 dashboard
 *   MSG91_NAMESPACE       — Template namespace from MSG91 dashboard
 *   MSG91_BASE_URL        — MSG91 API base URL (default: https://api.msg91.com/api/v5)
 */

const axios = require('axios');
const logger = require('../utils/logger');
const MessageLog = require('../models/MessageLog');

const BASE_URL = process.env.MSG91_BASE_URL || 'https://api.msg91.com/api/v5';
const AUTH_KEY = process.env.MSG91_AUTH_KEY;
const SENDER_NUMBER = process.env.MSG91_WHATSAPP_NUMBER;
const INTEGRATION_ID = process.env.MSG91_INTEGRATION_ID;

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    authkey: AUTH_KEY,
  };
}

/**
 * Core message sender — logs all outgoing messages
 */
async function sendMessage(toNumber, payload, conversationId, leadId) {
  const logEntry = await MessageLog.create({
    direction: 'outgoing',
    whatsappNumber: toNumber,
    messageType: payload.type || 'text',
    content: payload.text || JSON.stringify(payload).slice(0, 200),
    payload,
    conversationId,
    leadId,
    status: 'pending',
  });

  if (!AUTH_KEY || !SENDER_NUMBER) {
    logger.warn('[MSG91] Credentials not configured. Message NOT sent (dry-run mode).', {
      to: toNumber,
      type: payload.type,
    });
    await MessageLog.findByIdAndUpdate(logEntry._id, { status: 'dry_run' });
    return { success: true, dryRun: true, logId: logEntry._id };
  }

  try {
    const msg91Payload = buildMSG91Payload(toNumber, payload);
    logger.debug('[MSG91] Sending payload', { to: toNumber, type: payload.type, payload: JSON.stringify(msg91Payload) });

    const response = await axios.post(
      `${BASE_URL}/whatsapp/whatsapp-outbound-message/bulk/`,
      msg91Payload,
      { headers: getHeaders(), timeout: 10000 }
    );

    await MessageLog.findByIdAndUpdate(logEntry._id, {
      status: 'sent',
      externalMessageId: response.data?.message_id || response.data?.request_id,
      metadata: { response: response.data },
    });

    logger.info('[MSG91] Message sent', { to: toNumber, type: payload.type, response: response.data });
    return { success: true, messageId: response.data?.message_id, logId: logEntry._id };
  } catch (error) {
    const errMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    logger.error('[MSG91] Failed to send message', { to: toNumber, error: errMsg, status: error.response?.status });

    await MessageLog.findByIdAndUpdate(logEntry._id, {
      status: 'failed',
      error: errMsg,
    });

    return { success: false, error: errMsg, logId: logEntry._id };
  }
}

/**
 * Build MSG91-compatible payload structure.
 * MSG91 WhatsApp API v5 bulk format.
 */
function buildMSG91Payload(toNumber, payload) {
  const integrated_number = SENDER_NUMBER;

  if (payload.type === 'text') {
    return {
      integrated_number,
      content_type: 'text',
      data: [
        {
          to: toNumber,
          type: 'text',
          message: { text: payload.text },
        },
      ],
    };
  }

  if (payload.type === 'button') {
    return {
      integrated_number,
      content_type: 'interactive',
      data: [
        {
          to: toNumber,
          type: 'interactive',
          message: {
            interactive: {
              type: 'button',
              body: { text: payload.body },
              action: {
                buttons: payload.buttons.map((btn, i) => ({
                  type: 'reply',
                  reply: { id: btn.id || `btn_${i}`, title: String(btn.label).slice(0, 20) },
                })),
              },
            },
          },
        },
      ],
    };
  }

  if (payload.type === 'list') {
    return {
      integrated_number,
      content_type: 'interactive',
      data: [
        {
          to: toNumber,
          type: 'interactive',
          message: {
            interactive: {
              type: 'list',
              body: { text: payload.body },
              action: {
                button: payload.buttonLabel || 'Select',
                sections: payload.sections || [
                  {
                    title: payload.sectionTitle || 'Options',
                    rows: (payload.options || []).map((opt, i) => ({
                      id: opt.id || `opt_${i}`,
                      title: String(opt.label).slice(0, 24),
                      description: opt.description || '',
                    })),
                  },
                ],
              },
            },
          },
        },
      ],
    };
  }

  if (payload.type === 'template') {
    return {
      integrated_number,
      content_type: 'template',
      data: [
        {
          to: toNumber,
          type: 'template',
          message: payload.template,
        },
      ],
    };
  }

  // Fallback: plain text
  return {
    integrated_number,
    content_type: 'text',
    data: [
      {
        to: toNumber,
        type: 'text',
        message: { text: payload.text || JSON.stringify(payload) },
      },
    ],
  };
}

/**
 * Send a plain text message
 */
async function sendTextMessage(toNumber, text, conversationId, leadId) {
  return sendMessage(toNumber, { type: 'text', text }, conversationId, leadId);
}

/**
 * Send an interactive button message (max 3 buttons in WhatsApp)
 * Automatically falls back to numbered list if more than 3 options.
 */
async function sendButtonMessage(toNumber, body, buttons, conversationId, leadId) {
  if (!buttons || buttons.length === 0) {
    return sendTextMessage(toNumber, body, conversationId, leadId);
  }

  // WhatsApp supports max 3 interactive buttons
  if (buttons.length <= 3) {
    return sendMessage(
      toNumber,
      { type: 'button', body, buttons },
      conversationId,
      leadId
    );
  }

  // Fall back to list message for 4–10 options
  if (buttons.length <= 10) {
    return sendListMessage(
      toNumber,
      body,
      buttons.map((b) => ({ id: b.id, label: b.label })),
      'Options',
      conversationId,
      leadId
    );
  }

  // Fall back to numbered text for > 10 options
  return sendNumberedTextMessage(toNumber, body, buttons, conversationId, leadId);
}

/**
 * Send a WhatsApp list message (up to 10 items)
 */
async function sendListMessage(toNumber, body, options, sectionTitle, conversationId, leadId) {
  if (options.length <= 10) {
    return sendMessage(
      toNumber,
      { type: 'list', body, options, sectionTitle },
      conversationId,
      leadId
    );
  }
  return sendNumberedTextMessage(toNumber, body, options, conversationId, leadId);
}

/**
 * Fallback: numbered text list
 */
async function sendNumberedTextMessage(toNumber, body, options, conversationId, leadId) {
  const numbered = options.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n');
  const text = `${body}\n\n${numbered}\n\n_Reply with the number or text of your choice._`;
  return sendMessage(toNumber, { type: 'text', text }, conversationId, leadId);
}

/**
 * Send a WhatsApp template message
 */
async function sendTemplateMessage(toNumber, templateName, variables, conversationId) {
  const payload = {
    type: 'template',
    template: {
      name: templateName,
      namespace: INTEGRATION_ID,
      language: { code: 'en' },
      components: variables
        ? [{ type: 'body', parameters: variables.map((v) => ({ type: 'text', text: v })) }]
        : [],
    },
  };
  return sendMessage(toNumber, payload, conversationId);
}

/**
 * Process a delivery/read status update from MSG91 webhook
 */
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
 * MSG91 sends the payload with these top-level fields (as per their webhook config):
 *   customerNumber, integratedNumber, contentType, text, messageType,
 *   interactive, button, messages, ts, etc.
 *
 * Returns a normalized message object.
 */
function parseIncomingMessage(rawBody) {
  try {
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;

    logger.debug('[MSG91] Raw webhook body', { body: JSON.stringify(body) });

    let fromNumber, messageText, messageId, messageType, buttonPayload, timestamp;

    // ── Format 1: MSG91 custom webhook payload (flat structure from their template) ──
    // Fields: customerNumber, integratedNumber, contentType, text, messageType,
    //         interactive, button, ts, messages, etc.
    if (body.customerNumber || body.integratedNumber) {
      fromNumber = body.customerNumber || body.from;
      messageId = body.requestId || body.replyMsgId || body.uuid || `local_${Date.now()}`;
      timestamp = body.ts ? parseInt(body.ts, 10) : Date.now();
      messageType = (body.contentType || body.messageType || 'text').toLowerCase();

      if (messageType === 'text' || (!messageType && body.text)) {
        messageText = body.text;
        messageType = 'text';
      } else if (messageType === 'interactive' || body.interactive) {
        // Parse interactive (button/list reply)
        let interactive = body.interactive;
        if (typeof interactive === 'string') {
          try { interactive = JSON.parse(interactive); } catch (_) { interactive = {}; }
        }
        interactive = interactive || {};

        if (interactive.type === 'button_reply') {
          buttonPayload = {
            id: interactive.button_reply?.id,
            title: interactive.button_reply?.title,
          };
          messageText = interactive.button_reply?.title || interactive.button_reply?.id;
          messageType = 'button_reply';
        } else if (interactive.type === 'list_reply') {
          buttonPayload = {
            id: interactive.list_reply?.id,
            title: interactive.list_reply?.title,
          };
          messageText = interactive.list_reply?.title || interactive.list_reply?.id;
          messageType = 'list_reply';
        } else {
          messageText = body.text || JSON.stringify(interactive);
          messageType = 'interactive';
        }
      } else if (messageType === 'button' || body.button) {
        // Quick reply button tap
        let btn = body.button;
        if (typeof btn === 'string') {
          try { btn = JSON.parse(btn); } catch (_) { btn = { text: btn }; }
        }
        btn = btn || {};
        buttonPayload = { id: btn.payload || btn.id, title: btn.text || btn.title };
        messageText = btn.text || btn.title || btn.payload;
        messageType = 'button_reply';
      } else if (body.text) {
        messageText = body.text;
        messageType = 'text';
      } else if (body.messages) {
        // Try to parse the messages field
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
    // ── Format 2: MSG91 data-wrapped format ──
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
    // ── Format 3: Flat top-level format ──
    else {
      fromNumber = body.from || body.sender || body.mobile || body.customerNumber;
      messageId = body.id || body.message_id;
      messageText = body.text?.body || body.text || body.message || '';
      messageType = body.type || 'text';
      timestamp = body.timestamp || Date.now();
    }

    if (!fromNumber) {
      logger.warn('[MSG91] Could not extract sender from payload', { body: JSON.stringify(body) });
      return null;
    }

    // Normalize timestamp
    let parsedTimestamp;
    if (typeof timestamp === 'number') {
      // MSG91 sends seconds; JS needs ms
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

    logger.debug('[MSG91] Parsed message', { result });
    return result;
  } catch (err) {
    logger.error('[MSG91] Failed to parse incoming message', { error: err.message, stack: err.stack });
    return null;
  }
}

module.exports = {
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  sendTemplateMessage,
  sendNumberedTextMessage,
  processDeliveryStatus,
  parseIncomingMessage,
};