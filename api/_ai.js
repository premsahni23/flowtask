/**
 * Shared OpenRouter utility for all FlowTask API routes.
 * Prefixed with _ so Vercel does NOT expose it as an HTTP endpoint.
 */

/**
 * Send a prompt to OpenRouter and return the raw text response.
 * @param {string} prompt
 * @param {object} opts  - optional overrides: model, max_tokens, temperature
 * @returns {Promise<string>}
 */
export async function callAI(prompt, opts = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const appUrl = process.env.APP_URL || 'https://flowtask.vercel.app';

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }

  const body = {
    model:       opts.model       || 'mistralai/mistral-7b-instruct',
    max_tokens:  opts.max_tokens  || 300,
    temperature: opts.temperature || 0.2,
    messages: [{ role: 'user', content: prompt }]
  };

  console.log('[AI] calling OpenRouter model:', body.model);

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  appUrl,
      'X-Title':       'FlowTask'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[AI] OpenRouter HTTP error:', res.status, errText);
    throw new Error(`OpenRouter ${res.status}: ${errText}`);
  }

  const data = await res.json();

  // Log usage for debugging
  if (data.usage) {
    console.log('[AI] tokens used:', data.usage);
  }

  const text = data.choices?.[0]?.message?.content || '';
  console.log('[AI] raw response:', text);
  return text.trim();
}

/**
 * Safely extract and parse the first JSON object or array from AI output.
 * Handles markdown code fences, extra prose, and malformed responses.
 * @param {string} raw
 * @returns {object|Array}
 */
export function parseAIJson(raw) {
  // Strip markdown code fences
  let cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Extract first complete {...} or [...] block
  const match = cleaned.match(/(\{[\s\S]*?\}|\[[\s\S]*?\])/);
  if (!match) {
    throw new Error(`No JSON block found in AI response: "${cleaned.slice(0, 100)}"`);
  }

  try {
    return JSON.parse(match[1]);
  } catch (e) {
    // Last resort: try parsing the whole cleaned string
    return JSON.parse(cleaned);
  }
}

/**
 * Handle CORS preflight for all API routes.
 * Call at the top of every handler.
 * @returns {boolean} true if the request was a preflight (caller should return)
 */
export function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
