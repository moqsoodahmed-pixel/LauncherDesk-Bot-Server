const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  direction: { type: String, enum: ['incoming', 'outgoing'], required: true },
  messageType: { type: String, enum: ['text', 'button', 'list', 'template', 'media', 'interactive'], default: 'text' },
  content: { type: String },
  payload: { type: mongoose.Schema.Types.Mixed },
  status: { type: String, enum: ['sent', 'delivered', 'read', 'failed', 'received'], default: 'sent' },
  externalMessageId: { type: String },
  timestamp: { type: Date, default: Date.now },
});

const conversationSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    whatsappNumber: { type: String, required: true, index: true },

    // Flow state
    currentService: { type: String },
    currentServiceSlug: { type: String },
    currentServiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCategory' },
    currentFlowVersion: { type: Number },
    currentQuestionIndex: { type: Number, default: -1 },

    // Collected answers (key-value map)
    answers: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Multi-select temp state
    multiSelectAnswers: [String],
    awaitingMultiSelectDone: { type: Boolean, default: false },

    // Session state
    status: {
      type: String,
      enum: ['active', 'awaiting_menu', 'completed', 'abandoned', 'escalated'],
      default: 'awaiting_menu',
    },
    phase: {
      type: String,
      enum: ['menu', 'flow', 'summary', 'edit', 'completed'],
      default: 'menu',
    },

    // Edit mode
    isEditing: { type: Boolean, default: false },
    editingQuestionIndex: { type: Number },

    // Mobile validation
    invalidMobileAttempts: { type: Number, default: 0 },
    invalidAttemptCount: { type: Number, default: 0 },

    // Timing
    lastInteractionAt: { type: Date, default: Date.now },
    reminderSentAt: { type: Date },
    completedAt: { type: Date },
    abandonedAt: { type: Date },

    // Related lead
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },

    // Message history
    messages: [messageSchema],

    // Snapshot of flow at session start (for versioning stability)
    flowSnapshot: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

conversationSessionSchema.index({ whatsappNumber: 1, status: 1 });
conversationSessionSchema.index({ lastInteractionAt: 1, status: 1 });

module.exports = mongoose.model('ConversationSession', conversationSessionSchema);
