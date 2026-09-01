const ServiceCategory = require('../models/ServiceCategory');

exports.getServices = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.active === 'true') filter.isActive = true;
    const services = await ServiceCategory.find(filter)
      .populate('routingTeam', 'name slug color')
      .sort({ order: 1 })
      .lean();
    res.json({ success: true, data: services });
  } catch (err) {
    next(err);
  }
};

exports.getService = async (req, res, next) => {
  try {
    const service = await ServiceCategory.findById(req.params.id)
      .populate('routingTeam', 'name slug color');
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    res.json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
};

exports.createService = async (req, res, next) => {
  try {
    const { name, slug, description, icon, order, routingTeam } = req.body;
    const service = await ServiceCategory.create({ name, slug, description, icon, order, routingTeam });
    res.status(201).json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
};

exports.updateService = async (req, res, next) => {
  try {
    const allowed = ['name', 'description', 'icon', 'order', 'isActive', 'routingTeam', 'tags'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const service = await ServiceCategory.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('routingTeam', 'name slug color');
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    res.json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
};

exports.reorderService = async (req, res, next) => {
  try {
    const { order } = req.body;
    if (typeof order !== 'number') return res.status(400).json({ success: false, message: 'order must be a number' });
    const service = await ServiceCategory.findByIdAndUpdate(req.params.id, { order }, { new: true });
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    res.json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
};

exports.createFlow = async (req, res, next) => {
  try {
    const service = await ServiceCategory.findById(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

    // Deactivate existing flows
    service.flows.forEach((f) => { f.isActive = false; });

    const newVersion = (service.currentFlowVersion || 0) + 1;
    service.flows.push({
      version: newVersion,
      isActive: true,
      questions: req.body.questions || [],
      totalSteps: (req.body.questions || []).length,
    });
    service.currentFlowVersion = newVersion;
    await service.save();

    res.status(201).json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
};

exports.updateQuestions = async (req, res, next) => {
  try {
    const service = await ServiceCategory.findById(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

    const flowVersion = parseInt(req.params.flowVersion);
    const flowIndex = service.flows.findIndex((f) => f.version === flowVersion);
    if (flowIndex < 0) return res.status(404).json({ success: false, message: 'Flow version not found' });

    service.flows[flowIndex].questions = req.body.questions;
    service.flows[flowIndex].totalSteps = req.body.questions.length;
    service.markModified('flows');
    await service.save();

    res.json({ success: true, data: service.flows[flowIndex] });
  } catch (err) {
    next(err);
  }
};
