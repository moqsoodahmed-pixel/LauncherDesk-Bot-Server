const express = require('express');
const router = express.Router();
const ConversationSession = require('../models/ConversationSession');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.service) filter.currentServiceSlug = req.query.service;
    if (req.query.search) {
      filter.whatsappNumber = new RegExp(req.query.search, 'i');
    }

    const [sessions, total] = await Promise.all([
      ConversationSession.find(filter)
        .populate('user', 'whatsappNumber name')
        .populate('lead', 'leadId status')
        .sort({ lastInteractionAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-messages -flowSnapshot')
        .lean(),
      ConversationSession.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: sessions,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const session = await ConversationSession.findById(req.params.id)
      .populate('user', 'whatsappNumber name totalLeads')
      .populate('lead')
      .lean();
    if (!session) return res.status(404).json({ success: false, message: 'Conversation not found' });
    res.json({ success: true, data: session });
  } catch (err) { next(err); }
});

module.exports = router;
