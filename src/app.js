require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const connectDB = require('./config/database');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/auth');
const leadRoutes = require('./routes/leads');
const conversationRoutes = require('./routes/conversations');
const serviceRoutes = require('./routes/services');
const flowRoutes = require('./routes/flows');
const teamRoutes = require('./routes/teams');
const userRoutes = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');
const settingsRoutes = require('./routes/settings');
const webhookRoutes = require('./routes/webhooks');
const logRoutes = require('./routes/logs');

const app = express();

// Trust proxy for Render/Railway deployment
app.set('trust proxy', 1);

// Connect to MongoDB
connectDB();

// Security middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS — allow both the admin frontend and MSG91 servers
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'https://api.msg91.com',
  'https://msg91.com',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (MSG91 webhooks, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some((o) => origin.startsWith(o))) return callback(null, true);
    // Allow the frontend URL dynamically
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) return callback(null, true);
    callback(null, true); // Be permissive for webhooks — auth is done via signature
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-webhook-signature', 'x-msg91-signature', 'authkey'],
}));

// Body parsing — use JSON for everything.
// We reconstruct the raw buffer in the webhook controller when needed for signature verification.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB query sanitization
app.use(mongoSanitize());

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  message: { success: false, message: 'Webhook rate limit exceeded.' },
});

app.use('/api/', apiLimiter);
app.use('/api/webhooks', webhookLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'LauncherDesk WhatsApp Bot', timestamp: new Date().toISOString() });
});

// Root health check (some platforms ping /)
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'LauncherDesk WhatsApp Bot' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/flows', flowRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/logs', logRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// Error handler
app.use(errorHandler);

// Start inactivity cron
require('./services/sessionCron');

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`🚀 LauncherDesk server running on port ${PORT}`);
    logger.info(`📱 Environment: ${process.env.NODE_ENV}`);
    logger.info(`🔗 Webhook URL: POST /api/webhooks/msg91`);
  });
}

module.exports = app;