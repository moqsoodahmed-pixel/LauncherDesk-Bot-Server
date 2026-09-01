const mongoose = require('mongoose');

const messageLogSchema = new mongoose.Schema(
  {
    direction: { type: String, enum: ['incoming', 'outgoing'], required: true },
    whatsappNumber: { type: String, required: true, index: true },
    messageType: { type: String },
    content: { type: String },
    payload: { type: mongoose.Schema.Types.Mixed },
    externalMessageId: { type: String, index: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ConversationSession', index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    status: { type: String, enum: ['sent', 'delivered', 'read', 'failed', 'received'], default: 'sent' },
    error: { type: String },
    retryCount: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MessageLog', messageLogSchema);
