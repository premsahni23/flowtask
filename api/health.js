/**
 * GET /api/health
 *
 * Quick deployment verification endpoint.
 * Returns environment variable presence (not values) and Node version.
 * Safe to call publicly — no secrets are exposed.
 */

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  return res.status(200).json({
    ok:      true,
    ts:      new Date().toISOString(),
    node:    process.version,
    env: {
      OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
      APP_URL:            process.env.APP_URL || '(not set — using default)'
    }
  });
}
