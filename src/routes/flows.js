const express = require('express');
const router = express.Router();
const ServiceCategory = require('../models/ServiceCategory');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

// Get all flows across services
router.get('/', async (req, res, next) => {
  try {
    const services = await ServiceCategory.find({ isActive: true })
      .select('name slug flows currentFlowVersion routingTeam')
      .populate('routingTeam', 'name slug')
      .lean();
    res.json({ success: true, data: services });
  } catch (err) { next(err); }
});

module.exports = router;
