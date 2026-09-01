const mongoose = require('mongoose');

const appSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed },
    description: { type: String },
    isPublic: { type: Boolean, default: false },
    category: { type: String, default: 'general' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppSettings', appSettingsSchema);
