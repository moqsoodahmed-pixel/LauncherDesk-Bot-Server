const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, default: 'msg91' },
    eventId: { type: String, unique: true, index: true },
    eventType: { type: String },
    rawPayload: { type: mongoose.Schema.Types.Mixed },
    processedAt: { type: Date },
    status: {
      type: String,
      enum: ['pending', 'processed', 'failed', 'duplicate'],
      default: 'pending',
    },
    error: { type: String },
    whatsappNumber: { type: String, index: true },
    messageId: { type: String, index: true },
    retryCount: { type: Number, default: 0 },
    processingTimeMs: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
