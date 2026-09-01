/**
 * Session Inactivity Cron
 * Runs every 5 minutes to check for inactive sessions.
 * - 10 min inactive → send reminder
 * - 24 hours inactive → abandon session
 */

const cron = require('node-cron');
const ConversationSession = require('../models/ConversationSession');
const { sendInactivityReminder, abandonSession } = require('../engines/conversationEngine');
const logger = require('../utils/logger');

const REMINDER_MINUTES = parseInt(process.env.INACTIVITY_REMINDER_MINUTES || '10', 10);
const ABANDON_HOURS = parseInt(process.env.SESSION_ABANDON_HOURS || '24', 10);

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  if (process.env.NODE_ENV === 'test') return;

  try {
    const now = new Date();
    const reminderThreshold = new Date(now.getTime() - REMINDER_MINUTES * 60 * 1000);
    const abandonThreshold = new Date(now.getTime() - ABANDON_HOURS * 60 * 60 * 1000);

    // Find sessions to abandon (24h+ inactive, no reminder still needed)
    const toAbandon = await ConversationSession.find({
      status: 'active',
      phase: { $in: ['flow', 'summary', 'edit'] },
      lastInteractionAt: { $lt: abandonThreshold },
    }).limit(50);

    for (const session of toAbandon) {
      try {
        await abandonSession(session);
        logger.info('[Cron] Session abandoned due to inactivity', { sessionId: session._id });
      } catch (err) {
        logger.error('[Cron] Failed to abandon session', { sessionId: session._id, error: err.message });
      }
    }

    // Find sessions that need reminders (10 min inactive, no reminder sent yet)
    const needReminder = await ConversationSession.find({
      status: 'active',
      phase: { $in: ['flow', 'summary', 'edit'] },
      lastInteractionAt: { $lt: reminderThreshold, $gte: abandonThreshold },
      reminderSentAt: { $exists: false },
    }).limit(50);

    for (const session of needReminder) {
      try {
        await sendInactivityReminder(session);
        logger.info('[Cron] Inactivity reminder sent', { sessionId: session._id });
      } catch (err) {
        logger.error('[Cron] Failed to send reminder', { sessionId: session._id, error: err.message });
      }
    }
  } catch (err) {
    logger.error('[Cron] Session check failed', { error: err.message });
  }
});

logger.info('[Cron] Session inactivity monitor started');
