const express = require('express');
const router = express.Router();
const AppSettings = require('../models/AppSettings');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

router.get('/', async (req, res, next) => {
  try {
    const settings = await AppSettings.find({ isPublic: true }).lean();
    const map = {};
    settings.forEach((s) => { map[s.key] = s.value; });
    res.json({ success: true, data: map });
  } catch (err) { next(err); }
});

router.patch('/', restrictTo('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const updates = req.body;
    const ops = Object.entries(updates).map(([key, value]) =>
      AppSettings.findOneAndUpdate({ key }, { value }, { upsert: true, new: true })
    );
    await Promise.all(ops);
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) { next(err); }
});

module.exports = router;
