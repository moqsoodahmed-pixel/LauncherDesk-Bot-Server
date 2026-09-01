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
    status: 'sent',
  });

  if (!AUTH_KEY || !SENDER_NUMBER) {
    logger.warn('[MSG91] Credentials not configured. Message NOT sent (dry-run mode).', {
      to: toNumber,
      type: payload.type,
    });
    return { success: true, dryRun: true, logId: logEntry._id };
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/whatsapp/whatsapp-outbound-message/bulk/`,
      {
        integrated_number: SENDER_NUMBER,
        content_type: 'template',
        ...buildMSG91Payload(toNumber, payload),
      },
      { headers: getHeaders(), timeout: 10000 }
    );

    await MessageLog.findByIdAndUpdate(logEntry._id, {
      status: 'sent',
      externalMessageId: response.data?.message_id || response.data?.request_id,
      metadata: { response: response.data },
    });

    logger.info('[MSG91] Message sent', { to: toNumber, type: payload.type, msgId: response.data?.message_id });
    return { success: true, messageId: response.data?.message_id, logId: logEntry._id };
  } catch (error) {
    const errMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    logger.error('[MSG91] Failed to send message', { to: toNumber, error: errMsg });

    await MessageLog.findByIdAndUpdate(logEntry._id, {
      status: 'failed',
      error: errMsg,
    });

    return { success: false, error: errMsg, logId: logEntry._id };
  }
}

/**
 * Build MSG91-compatible payload structure.
 * MSG91 WhatsApp API uses a "data" array format for bulk sends.
 */
function buildMSG91Payload(toNumber, payload) {
  if (payload.type === 'text') {
    return {
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
                  reply: { id: btn.id || `btn_${i}`, title: btn.label.slice(0, 20) },
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
                    rows: payload.options.map((opt, i) => ({
                      id: opt.id || `opt_${i}`,
                      title: opt.label.slice(0, 24),
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

  // Fallback: plain text
  return {
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
 * Used when interactive messages are unavailable or option count exceeds limits
 */
async function sendNumberedTextMessage(toNumber, body, options, conversationId, leadId) {
  const numbered = options.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n');
  const text = `${body}\n\n${numbered}\n\n_Reply with the number or text of your choice._`;
  return sendMessage(toNumber, { type: 'text', text }, conversationId, leadId);
}

/**
 * Send a WhatsApp template message
 * Used for session re-initiation (MSG91 requires template for 24h+ inactive users)
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
 * Parse an incoming MSG91 WhatsApp webhook payload
 * Returns a normalized message object regardless of MSG91 payload format
 */
function parseIncomingMessage(rawBody) {
  try {
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;

    // MSG91 may send different payload shapes depending on message type
    // Normalize to a consistent internal format
    let fromNumber, messageText, messageId, messageType, buttonPayload, interactivePayload, timestamp;

    // Handle MSG91 inbound format
    if (body.data) {
      const data = Array.isArray(body.data) ? body.data[0] : body.data;
      fromNumber = data.from || data.sender || data.mobile;
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
        messageType = 'button';
      } else {
        messageText = data.message || data.body || '';
        messageType = data.type || 'text';
      }
    } else {
      // Try alternate format
      fromNumber = body.from || body.sender || body.mobile;
      messageId = body.id || body.message_id;
      messageText = body.text?.body || body.text || body.message || '';
      messageType = body.type || 'text';
      timestamp = body.timestamp || Date.now();
    }

    if (!fromNumber) {
      logger.warn('[MSG91] Could not extract sender from payload', { body });
      return null;
    }

    return {
      fromNumber: String(fromNumber),
      messageText: (messageText || '').trim(),
      messageId: String(messageId || `local_${Date.now()}`),
      messageType,
      buttonPayload,
      interactivePayload,
      timestamp: new Date(
        typeof timestamp === 'number' && timestamp > 1e10 ? timestamp : timestamp * 1000
      ),
      rawPayload: body,
    };
  } catch (err) {
    logger.error('[MSG91] Failed to parse incoming message', { error: err.message });
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
