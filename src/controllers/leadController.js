const Lead = require('../models/Lead');
const logger = require('../utils/logger');

// Build filter object from query params
function buildFilter(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.service) filter.serviceSlug = query.service;
  if (query.team) filter.assignedTeam = query.team;
  if (query.assignedUser) filter.assignedUser = query.assignedUser;
  if (query.isComplete !== undefined) filter.isComplete = query.isComplete === 'true';
  if (query.isAbandoned !== undefined) filter.isAbandoned = query.isAbandoned === 'true';

  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  if (query.search) {
    const rx = new RegExp(query.search, 'i');
    filter.$or = [{ name: rx }, { mobile: rx }, { businessName: rx }, { leadId: rx }, { service: rx }];
  }

  return filter;
}

exports.getLeads = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const sortField = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;
    const filter = buildFilter(req.query);

    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .populate('assignedTeam', 'name slug color')
        .populate('assignedUser', 'name email')
        .populate('user', 'whatsappNumber')
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Lead.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getLead = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedTeam', 'name slug color email')
      .populate('assignedUser', 'name email role')
      .populate('user', 'whatsappNumber name totalLeads firstContactAt')
      .populate('conversationId')
      .populate('notes.author', 'name email')
      .lean();

    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
};

exports.updateLead = async (req, res, next) => {
  try {
    const allowed = ['name', 'mobile', 'businessName', 'city', 'state', 'description', 'status', 'assignedTeam', 'assignedUser'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const lead = await Lead.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('assignedTeam', 'name slug color')
      .populate('assignedUser', 'name email');
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
};

exports.updateLeadStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost', 'Abandoned'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const lead = await Lead.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
};

exports.assignLead = async (req, res, next) => {
  try {
    const { assignedTeam, assignedUser } = req.body;
    const updates = {};
    if (assignedTeam !== undefined) updates.assignedTeam = assignedTeam || null;
    if (assignedUser !== undefined) updates.assignedUser = assignedUser || null;
    const lead = await Lead.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('assignedTeam', 'name slug color')
      .populate('assignedUser', 'name email');
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
};

exports.addNote = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Note content is required' });
    }
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $push: { notes: { content: content.trim(), author: req.user._id, authorName: req.user.name } } },
      { new: true }
    ).populate('notes.author', 'name email');
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, data: lead.notes });
  } catch (err) {
    next(err);
  }
};

exports.deleteNote = async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $pull: { notes: { _id: req.params.noteId } } },
      { new: true }
    );
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, message: 'Note deleted' });
  } catch (err) {
    next(err);
  }
};

exports.exportLeads = async (req, res, next) => {
  try {
    const filter = buildFilter(req.query);
    const leads = await Lead.find(filter)
      .populate('assignedTeam', 'name')
      .populate('assignedUser', 'name email')
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    const headers = ['Lead ID', 'Date', 'Name', 'Mobile', 'Business Name', 'Service', 'Sub-Service', 'City', 'State', 'Team', 'Lead Status', 'Source', 'Complete'];
    const rows = leads.map((l) => [
      l.leadId || l._id,
      l.createdAt ? new Date(l.createdAt).toISOString().slice(0, 10) : '',
      l.name || '',
      l.mobile || '',
      l.businessName || '',
      l.service || '',
      l.subService || '',
      l.city || '',
      l.state || '',
      l.assignedTeam?.name || '',
      l.status || '',
      l.source || '',
      l.isComplete ? 'Yes' : 'No',
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="launcherdesk-leads.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
};
