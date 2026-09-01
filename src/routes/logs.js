const express = require('express');
const router = express.Router();
const MessageLog = require('../models/MessageLog');
const WebhookEvent = require('../models/WebhookEvent');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

router.get('/messages', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.direction) filter.direction = req.query.direction;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.number) filter.whatsappNumber = new RegExp(req.query.number);

    const [logs, total] = await Promise.all([
      MessageLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      MessageLog.countDocuments(filter),
    ]);
    res.json({ success: true, data: logs, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

router.get('/webhooks', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [events, total] = await Promise.all([
      WebhookEvent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WebhookEvent.countDocuments(filter),
    ]);
    res.json({ success: true, data: events, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

module.exports = router;
