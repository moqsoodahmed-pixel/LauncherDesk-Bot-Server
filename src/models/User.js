const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    whatsappNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    normalizedNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: { type: String, trim: true },
    businessName: { type: String, trim: true },
    firstContactAt: { type: Date, default: Date.now },
    lastContactAt: { type: Date, default: Date.now },
    totalLeads: { type: Number, default: 0 },
    totalConversations: { type: Number, default: 0 },
    isBlocked: { type: Boolean, default: false },
    notes: { type: String },
    tags: [String],
    preferredLanguage: { type: String, default: 'en' },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
