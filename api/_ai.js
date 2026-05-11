/**
 * Shared OpenRouter utility — CommonJS (required by @vercel/node runtime).
 * Prefixed with _ so Vercel does NOT expose it as an HTTP endpoint.
 */

'use strict';

/**
 * Reliably parse the request body as JSON.
 * @vercel/node auto-parses when Content-Type is application/json,
 * but falls back to a raw Buffer in some runtime versions.
 * This handles both cases.
 * @returns {Promise<object>}
 */
async function parseBody(req) {
  // Already parsed by the runtime (most common case)
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  // Raw buffer / stream — read and parse manually
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/**
 * Send a prompt to OpenRouter and return the raw text response.
 * @param {string} prompt
 * @param {object} opts  - optional: model, max_tokens, temperature
 * @returns {Promise<string>}
 */
async function callAI(prompt, opts = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const appUrl = process.env.APP_URL || 'https://flowtask.vercel.app';

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set in environment variables');
  }

  const body = {
    model:       opts.model       || 'mistralai/mistral-7b-instruct',
    max_tokens:  opts.max_tokens  || 300,
    temperature: opts.temperature || 0.2,
    messages:    [{ role: 'user', content: prompt }]
  };

  console.log('[AI] model:', body.model, '| prompt length:', prompt.length);

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
    console.error('[AI] OpenRouter error:', res.status, errText);
    throw new Error(`OpenRouter ${res.status}: ${errText}`);
  }

  const data = await res.json();

  if (data.usage) {
    console.log('[AI] tokens used:', JSON.stringify(data.usage));
  }

  const text = data.choices?.[0]?.message?.content || '';
  console.log('[AI] raw response:', text);
  return text.trim();
}

/**
 * Safely extract and parse the first JSON object or array from AI output.
 * Strips markdown fences, handles extra prose.
 * @param {string} raw
 * @returns {object|Array}
 */
function parseAIJson(raw) {
  // Strip markdown code fences
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Extract first {...} or [...] block (non-greedy won't work for nested JSON,
  // so we use a greedy match and rely on JSON.parse to validate)
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);

  // Prefer array if both exist and array comes first
  const objIdx = objMatch ? cleaned.indexOf(objMatch[0]) : Infinity;
  const arrIdx = arrMatch ? cleaned.indexOf(arrMatch[0]) : Infinity;

  const candidate = arrIdx < objIdx
    ? arrMatch[0]
    : objMatch
      ? objMatch[0]
      : null;

  if (!candidate) {
    throw new Error(`No JSON found in AI response: "${cleaned.slice(0, 120)}"`);
  }

  try {
    return JSON.parse(candidate);
  } catch (e) {
    // Last resort: try the whole cleaned string
    return JSON.parse(cleaned);
  }
}

/**
 * Set CORS headers and handle OPTIONS preflight.
 * @returns {boolean} true if request was a preflight (handler should return immediately)
 */
function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { callAI, parseAIJson, handleCors, parseBody };
