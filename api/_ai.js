/**
 * Shared OpenRouter utility — CommonJS (required by @vercel/node runtime).
 * Prefixed with _ so Vercel does NOT expose it as an HTTP endpoint.
 */

'use strict';

/**
 * Reliably parse the request body as JSON.
 *
 * Vercel's @vercel/node runtime can deliver req.body as:
 *   1. A plain object  — already parsed (happy path)
 *   2. A Buffer        — needs toString() + JSON.parse
 *   3. A string        — needs JSON.parse
 *   4. undefined/null  — needs stream reading
 *
 * @returns {Promise<object>}
 */
async function parseBody(req) {
  const b = req.body;

  // Case 1: already a plain object (not a Buffer, not null)
  if (b && typeof b === 'object' && !Buffer.isBuffer(b) && !Array.isArray(b)) {
    console.log('[parseBody] pre-parsed object, keys:', Object.keys(b));
    return b;
  }

  // Case 2: Buffer
  if (Buffer.isBuffer(b)) {
    try {
      const parsed = JSON.parse(b.toString('utf8'));
      console.log('[parseBody] parsed from Buffer, keys:', Object.keys(parsed));
      return parsed;
    } catch (e) {
      console.error('[parseBody] Buffer parse failed:', e.message);
      return {};
    }
  }

  // Case 3: already a string
  if (typeof b === 'string' && b.trim()) {
    try {
      const parsed = JSON.parse(b);
      console.log('[parseBody] parsed from string, keys:', Object.keys(parsed));
      return parsed;
    } catch (e) {
      console.error('[parseBody] string parse failed:', e.message);
      return {};
    }
  }

  // Case 4: raw stream (req.body is undefined/null)
  console.log('[parseBody] reading raw stream...');
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      console.log('[parseBody] stream raw length:', raw.length);
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        console.log('[parseBody] stream parsed, keys:', Object.keys(parsed));
        resolve(parsed);
      } catch (e) {
        console.error('[parseBody] stream parse failed:', e.message, '| raw:', raw.slice(0, 100));
        resolve({});
      }
    });
    req.on('error', (e) => {
      console.error('[parseBody] stream error:', e.message);
      resolve({});
    });
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
