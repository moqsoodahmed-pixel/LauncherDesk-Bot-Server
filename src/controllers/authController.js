const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser');
const logger = require('../utils/logger');

function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'changeme_jwt_secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function sendToken(user, statusCode, res) {
  const token = signToken(user._id);
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      team: user.team,
      avatar: user.avatar,
    },
  });
}

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await AdminUser.findOne({ email, isActive: true }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    await AdminUser.findByIdAndUpdate(user._id, { lastLogin: new Date() });
    logger.info('[Auth] Admin login', { email: user.email, role: user.role });
    sendToken(user, 200, res);
  } catch (err) {
    next(err);
  }
};

exports.logout = (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await AdminUser.findById(req.user._id).populate('team', 'name slug');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await AdminUser.findById(req.user._id).select('+password');
    if (!user || !(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    await user.save();
    sendToken(user, 200, res);
  } catch (err) {
    next(err);
  }
};
