const express = require('express');
const router = express.Router();
const AdminUser = require('../models/AdminUser');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

router.get('/', async (req, res, next) => {
  try {
    const users = await AdminUser.find({ isActive: true })
      .populate('team', 'name slug')
      .select('-password')
      .sort({ name: 1 });
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

router.post('/', restrictTo('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const user = await AdminUser.create(req.body);
    const userObj = user.toObject();
    delete userObj.password;
    res.status(201).json({ success: true, data: userObj });
  } catch (err) { next(err); }
});

router.patch('/:id', restrictTo('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const allowed = ['name', 'email', 'role', 'team', 'isActive', 'phone'];
    const updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
    const user = await AdminUser.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

router.delete('/:id', restrictTo('SUPER_ADMIN'), async (req, res, next) => {
  try {
    await AdminUser.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) { next(err); }
});

module.exports = router;
