const mongoose = require('mongoose');

const serviceOptionSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  value: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  nextQuestionIndex: { type: Number }, // For conditional branching
  subOptions: [{ label: String, value: String, order: Number, isActive: Boolean }],
});

const serviceQuestionSchema = new mongoose.Schema({
  index: { type: Number, required: true },
  key: { type: String, required: true, trim: true }, // field key for lead storage
  question: { type: String, required: true, trim: true },
  inputType: {
    type: String,
    enum: ['TEXT', 'BUTTONS', 'LIST', 'MULTI_SELECT', 'MOBILE', 'SKIP'],
    required: true,
  },
  isRequired: { type: Boolean, default: true },
  isOptional: { type: Boolean, default: false },
  validationType: {
    type: String,
    enum: ['none', 'mobile', 'text', 'number'],
    default: 'none',
  },
  options: [serviceOptionSchema],
  placeholder: { type: String },
  maxLength: { type: Number },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  fieldLabel: { type: String }, // Label shown in lead summary
});

const serviceFlowSchema = new mongoose.Schema({
  version: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  questions: [serviceQuestionSchema],
  totalSteps: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

const serviceCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    icon: { type: String, default: '📋' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    routingTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    flows: [serviceFlowSchema],
    currentFlowVersion: { type: Number, default: 1 },
    tags: [String],
  },
  { timestamps: true }
);

serviceCategorySchema.methods.getActiveFlow = function () {
  const flows = this.flows.filter((f) => f.isActive);
  if (!flows.length) return null;
  return flows.sort((a, b) => b.version - a.version)[0];
};

serviceCategorySchema.methods.getFlowByVersion = function (version) {
  return this.flows.find((f) => f.version === version) || null;
};

module.exports = mongoose.model('ServiceCategory', serviceCategorySchema);
