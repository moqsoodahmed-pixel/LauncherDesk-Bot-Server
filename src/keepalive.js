/**
 * Keep-alive pinger — prevents Render free tier cold starts.
 * Pings the server every 14 minutes so it never spins down.
 * Add this to the bottom of src/app.js:
 *   require('./keepalive');
 */
const https = require('https');

const RENDER_URL = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_URL;

function ping() {
  if (!RENDER_URL) return;
  const url = `${RENDER_URL}/health`;
  https.get(url, (res) => {
    console.log(`[Keepalive] Pinged ${url} → ${res.statusCode}`);
  }).on('error', (err) => {
    console.warn('[Keepalive] Ping failed:', err.message);
  });
}

// Ping every 14 minutes (Render spins down after 15 min inactivity)
setInterval(ping, 14 * 60 * 1000);

// Initial ping after 30 seconds
setTimeout(ping, 30000);

module.exports = { ping };