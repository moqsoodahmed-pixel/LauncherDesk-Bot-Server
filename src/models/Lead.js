const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const leadAnswerSchema = new mongoose.Schema({
  questionKey: { type: String, required: true },
  questionLabel: { type: String },
  value: { type: mongoose.Schema.Types.Mixed },
  displayValue: { type: String },
  inputType: { type: String },
  answeredAt: { type: Date, default: Date.now },
});

const leadNoteSchema = new mongoose.Schema({
  content: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  authorName: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const leadSchema = new mongoose.Schema(
  {
    leadId: {
      type: String,
      unique: true,
      default: () => `LD-${Date.now()}-${uuidv4().slice(0, 6).toUpperCase()}`,
      index: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    whatsappNumber: { type: String, required: true, index: true },

    // Contact info
    name: { type: String, trim: true },
    mobile: { type: String, trim: true },
    businessName: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    description: { type: String },

    // Service info
    service: { type: String, required: true, trim: true },
    serviceSlug: { type: String, trim: true },
    subService: { type: String, trim: true },
    answers: [leadAnswerSchema],

    // Routing
    assignedTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    assignedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },

    // Status
    status: {
      type: String,
      enum: ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost', 'Abandoned'],
      default: 'New',
    },
    isComplete: { type: Boolean, default: false },
    isAbandoned: { type: Boolean, default: false },

    // Source
    source: { type: String, default: 'WhatsApp', trim: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ConversationSession' },

    // Timestamps
    submittedAt: { type: Date },

    // Notes
    notes: [leadNoteSchema],

    // Service category reference
    serviceCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCategory' },
    flowVersion: { type: Number, default: 1 },
  },
  { timestamps: true }
);

leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ service: 1, createdAt: -1 });
leadSchema.index({ assignedTeam: 1, status: 1 });
leadSchema.index({ whatsappNumber: 1, createdAt: -1 });

module.exports = mongoose.model('Lead', leadSchema);
