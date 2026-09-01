const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

router.get('/', async (req, res, next) => {
  try {
    const teams = await Team.find({ isActive: true })
      .populate('members', 'name email role')
      .populate('manager', 'name email')
      .sort({ name: 1 });
    res.json({ success: true, data: teams });
  } catch (err) { next(err); }
});

router.post('/', restrictTo('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const team = await Team.create(req.body);
    res.status(201).json({ success: true, data: team });
  } catch (err) { next(err); }
});

router.patch('/:id', restrictTo('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const team = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    res.json({ success: true, data: team });
  } catch (err) { next(err); }
});

router.delete('/:id', restrictTo('SUPER_ADMIN'), async (req, res, next) => {
  try {
    await Team.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Team deactivated' });
  } catch (err) { next(err); }
});

module.exports = router;
