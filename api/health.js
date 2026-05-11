/**
 * GET /api/health
 *
 * Deployment verification — call this first after every deploy.
 * Returns env var presence (never values) and Node version.
 */

'use strict';

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  return res.status(200).json({
    ok:   true,
    ts:   new Date().toISOString(),
    node: process.version,
    env: {
      OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
      APP_URL:            process.env.APP_URL || '(not set — default will be used)'
    }
  });
};
