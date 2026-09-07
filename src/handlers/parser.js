// ─────────────────────────────────────────────────────────────
//  MSG91 Inbound Payload Parser
//
//  MSG91 sends different payload shapes for:
//   - Plain text messages
//   - Quick reply button clicks
//   - Interactive list selections
//   - Template button clicks ("Explore Services")
//
//  This normalises all of them into one consistent object:
//  { phone, type, text, buttonId, listRowId, messageId }
// ─────────────────────────────────────────────────────────────

function parseInbound(body) {
  const entry = body?.data || body;

  const phone =
    entry?.customerNumber ||
    entry?.wa_id ||
    entry?.mobile ||
    entry?.from ||
    entry?.sender ||
    entry?.phone ||
    null;

  if (!phone) {
    console.warn('[Parser] Could not extract phone from payload:', JSON.stringify(body).slice(0, 200));
    return null;
  }

  // Extract message ID for deduplication
  const messageId =
    entry?.requestId ||
    entry?.replyMsgId ||
    entry?.uuid ||
    entry?.message_id ||
    entry?.id ||
    null;

  const msgType =
    entry?.contentType ||
    entry?.type ||
    entry?.message_type ||
    'text';

  // ── Template button click ─────────────────────────────────
  if (msgType === 'button' || entry?.button) {
    const btnPayload = entry?.button || entry?.interactive?.button_reply;
    return {
      phone,
      messageId,
      type:     'button',
      text:     btnPayload?.text || btnPayload?.title || '',
      buttonId: btnPayload?.payload || btnPayload?.id || '',
      listRowId: null,
    };
  }

  // ── Interactive reply button / list click ─────────────────
  if (msgType === 'interactive') {
    const interactive = entry?.interactive || entry?.message?.interactive;
    if (typeof interactive === 'string') {
      try { interactive = JSON.parse(interactive); } catch (_) {}
    }

    if (interactive?.type === 'button_reply') {
      return {
        phone,
        messageId,
        type:     'button_reply',
        text:     interactive.button_reply?.title || '',
        buttonId: interactive.button_reply?.id    || '',
        listRowId: null,
      };
    }

    if (interactive?.type === 'list_reply') {
      return {
        phone,
        messageId,
        type:     'list_reply',
        text:     interactive.list_reply?.title || '',
        buttonId: null,
        listRowId: interactive.list_reply?.id   || '',
      };
    }
  }

  // ── Plain text ────────────────────────────────────────────
  const candidates = [
    typeof entry?.text === 'string' ? entry.text : entry?.text?.body,
    typeof entry?.body === 'string' ? entry.body : entry?.body?.text,
    entry?.message?.text?.body,
    entry?.message?.body,
    entry?.content,
  ];
  const textBody = candidates.find((c) => typeof c === 'string' && c.length > 0) || '';

  return {
    phone,
    messageId,
    type:     'text',
    text:     textBody.trim(),
    buttonId: null,
    listRowId: null,
  };
}

module.exports = { parseInbound };