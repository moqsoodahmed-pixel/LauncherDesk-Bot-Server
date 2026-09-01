const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, errors } = format;

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${stack || message}`;
  if (Object.keys(meta).length > 0) {
    // Mask sensitive fields
    const safeMeta = maskSensitiveData(meta);
    log += ` | ${JSON.stringify(safeMeta)}`;
  }
  return log;
});

function maskSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'mobile', 'phone'];
  const masked = { ...obj };
  for (const key of Object.keys(masked)) {
    const lk = key.toLowerCase();
    if (sensitiveKeys.some((s) => lk.includes(s))) {
      if (typeof masked[key] === 'string' && masked[key].length > 4) {
        masked[key] = masked[key].slice(0, 2) + '****' + masked[key].slice(-2);
      } else {
        masked[key] = '****';
      }
    } else if (typeof masked[key] === 'object') {
      masked[key] = maskSensitiveData(masked[key]);
    }
  }
  return masked;
}

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    new transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
    }),
  ],
});

if (process.env.NODE_ENV === 'production') {
  logger.add(
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    })
  );
  logger.add(
    new transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
    })
  );
}

module.exports = logger;
