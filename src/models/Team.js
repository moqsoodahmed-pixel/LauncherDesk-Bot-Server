const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }],
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    color: { type: String, default: '#3B82F6' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Team', teamSchema);
