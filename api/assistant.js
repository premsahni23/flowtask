/**
 * POST /api/assistant
 *
 * Conversational AI assistant with:
 * - Full OpenRouter response logging for Vercel debugging
 * - Robust content extraction (handles all response shapes)
 * - System personality injected as first user message (model-compatible)
 * - Conversation history context
 * - Task board awareness
 * - Guaranteed non-empty response — never returns undefined
 *
 * Body:    { message, history, todo, inprogress, completed }
 * Returns: { reply: string }   ← always present, always a non-empty string
 */

'use strict';

const { handleCors, parseBody } = require('./_ai.js');

// ── Models to try in order (first available free model wins) ─────────────────
// meta-llama/llama-3.1-8b-instruct:free is the most reliable free model on OpenRouter
// mistralai/mistral-7b-instruct is the fallback
const MODELS = [
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'mistralai/mistral-7b-instruct'
];

// ── Safe content extractor ────────────────────────────────────────────────────
// Handles every shape OpenRouter might return
function extractContent(data) {
  // Standard OpenAI-compatible shape
  let content = data?.choices?.[0]?.message?.content;

  // Some models return content as an array of parts
  if (Array.isArray(content)) {
    content = content.map(p => (typeof p === 'string' ? p : p?.text || '')).join(' ');
  }

  // Ensure it's a string
  content = String(content || '').trim();

  // Strip any accidental markdown the model added
  content = content
    .replace(/^#+\s*/gm, '')   // headings
    .replace(/\*\*(.*?)\*\*/g, '$1')  // bold
    .replace(/\*(.*?)\*/g, '$1')      // italic
    .trim();

  return content;
}

// ── Build system context as a user-turn prefix ────────────────────────────────
// Injected as the first user message so it works with models that ignore system role
function buildContextPrefix(todo, inprogress, completed) {
  const total   = todo.length + inprogress.length + completed.length;
  const pct     = total > 0 ? Math.round((completed.length / total) * 100) : 0;
  const now     = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const fmt     = arr => arr.length === 0 ? 'none' : arr.slice(0, 6).join(', ');

  const signals = [];
  if (todo.length > 6)       signals.push(`overloaded with ${todo.length} pending tasks`);
  if (inprogress.length > 3) signals.push(`${inprogress.length} tasks in progress simultaneously`);
  if (pct === 100 && total > 0) signals.push('all tasks complete');
  if (pct >= 75)             signals.push(`${pct}% done — strong progress`);
  if (todo.length > 0 && inprogress.length === 0) signals.push('nothing started yet');

  return `[SYSTEM CONTEXT — do not repeat this back to the user]
You are FlowTask AI, a smart productivity assistant like Jarvis. Be warm, direct, and concise (1-3 sentences). Never use markdown, bullet points, or say "As an AI".

Time: ${timeStr} on ${dateStr}
Board: In Progress (${inprogress.length}): ${fmt(inprogress)} | To Do (${todo.length}): ${fmt(todo)} | Done (${completed.length}): ${fmt(completed)} | Progress: ${pct}%${signals.length > 0 ? ` | Signals: ${signals.join(', ')}` : ''}
[END CONTEXT]`;
}

// ── Call OpenRouter with model fallback ───────────────────────────────────────
async function callOpenRouter(messages, apiKey, appUrl) {
  for (const model of MODELS) {
    console.log('[assistant] trying model:', model);

    let httpRes;
    try {
      httpRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
          'HTTP-Referer':  appUrl,
          'X-Title':       'FlowTask'
        },
        body: JSON.stringify({
          model,
          max_tokens:  250,
          temperature: 0.7,
          messages
        })
      });
    } catch (networkErr) {
      console.error('[assistant] network error for model', model, ':', networkErr.message);
      continue; // try next model
    }

    // Log full raw response for Vercel debugging
    const rawText = await httpRes.text();
    console.log('[assistant] HTTP status:', httpRes.status);
    console.log('[assistant] raw response:', rawText.slice(0, 800));

    if (!httpRes.ok) {
      console.error('[assistant] model', model, 'returned HTTP', httpRes.status, '— trying next');
      continue;
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[assistant] JSON parse failed for model', model, ':', parseErr.message);
      continue;
    }

    // Log the full parsed structure
    console.log('[assistant] parsed data:', JSON.stringify({
      id:      data?.id,
      model:   data?.model,
      choices: data?.choices?.length,
      usage:   data?.usage,
      error:   data?.error
    }));

    // Check for API-level error in body (OpenRouter sometimes returns 200 with error)
    if (data?.error) {
      console.error('[assistant] API error in body:', JSON.stringify(data.error));
      continue;
    }

    const content = extractContent(data);
    console.log('[assistant] extracted content:', content.slice(0, 200));

    if (content) {
      console.log('[assistant] success with model:', model);
      return content;
    }

    console.warn('[assistant] empty content from model', model, '— trying next');
  }

  // All models failed
  throw new Error('All models returned empty content');
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse body — handles both auto-parsed objects and raw streams
  const body = await parseBody(req);

  console.log('[assistant] ── new request ──');
  console.log('[assistant] raw body keys:', Object.keys(body));

  // Accept both `message` and `text` field names for compatibility
  const userMessage = (body.message || body.text || '').trim();
  const history     = Array.isArray(body.history)    ? body.history    : [];
  const todo        = Array.isArray(body.todo)        ? body.todo        : [];
  const inprogress  = Array.isArray(body.inprogress)  ? body.inprogress  : [];
  const completed   = Array.isArray(body.completed)   ? body.completed   : [];

  console.log('[assistant] userMessage:', userMessage.slice(0, 120));
  console.log('[assistant] history turns:', history.length);
  console.log('[assistant] board — todo:', todo.length, 'inprogress:', inprogress.length, 'completed:', completed.length);

  if (!userMessage) {
    console.error('[assistant] 400 — no message in body:', JSON.stringify(body).slice(0, 200));
    return res.status(400).json({ error: 'message is required', received: Object.keys(body) });
  }

  const input  = userMessage;
  const apiKey = process.env.OPENROUTER_API_KEY;
  const appUrl = process.env.APP_URL || 'https://flowtask.vercel.app';

  console.log('[assistant] API key set:', !!apiKey);
  console.log('[assistant] APP_URL:', appUrl);

  if (!apiKey) {
    console.error('[assistant] OPENROUTER_API_KEY is not set — returning fallback');
    const reply = buildFallback(input, todo, inprogress, completed);
    return res.status(200).json({ reply, answer: reply }); // both fields for compat
  }

  // Build messages array:
  // 1. System context injected as first user message (works with all models)
  // 2. Conversation history (last 10 turns)
  // 3. Current user message
  const contextPrefix = buildContextPrefix(todo, inprogress, completed);

  const messages = [
    // System role for models that support it
    {
      role:    'system',
      content: 'You are FlowTask AI, a smart productivity assistant. Be concise, warm, and direct. No markdown.'
    },
    // Context as first user message (fallback for models ignoring system role)
    { role: 'user',      content: contextPrefix },
    { role: 'assistant', content: 'Understood. I have your task board context and I\'m ready to help.' },
    // Conversation history
    ...history.slice(-8).map(h => ({
      role:    h.role === 'assistant' ? 'assistant' : 'user',
      content: String(h.content || '').slice(0, 400)
    })),
    // Current message
    { role: 'user', content: input }
  ];

  try {
    const reply = await callOpenRouter(messages, apiKey, appUrl);
    // Return both `reply` and `answer` so both old and new frontend code works
    return res.status(200).json({ reply, answer: reply });

  } catch (err) {
    console.error('[assistant] all models failed:', err.message);
    const reply = buildFallback(input, todo, inprogress, completed);
    return res.status(200).json({ reply, answer: reply });
  }
};

// ── Rule-based fallback ───────────────────────────────────────────────────────
function buildFallback(message, todo, inprogress, completed) {
  const q     = message.toLowerCase();
  const total = todo.length + inprogress.length + completed.length;
  const pct   = total > 0 ? Math.round((completed.length / total) * 100) : 0;

  if (q.includes('next') || q.includes('should i') || q.includes('start') || q.includes('what') || q.includes('do')) {
    if (inprogress.length > 0) return `Keep going on "${inprogress[0]}" — you've already started it.`;
    if (todo.length > 0)       return `Start with "${todo[0]}" — it's first on your list.`;
    return "Your board is clear! Add a new task and let's get moving.";
  }
  if (q.includes('complet') || q.includes('done') || q.includes('finish') || q.includes('today')) {
    if (completed.length === 0) return "Nothing completed yet — pick one task and start it now.";
    return `You've completed ${completed.length} task${completed.length > 1 ? 's' : ''} today: ${completed.slice(0, 3).join(', ')}.`;
  }
  if (q.includes('how') || q.includes('progress') || q.includes('doing') || q.includes('status')) {
    if (pct === 100 && total > 0) return "Everything done — you absolutely crushed it today!";
    return `You're ${pct}% done — ${completed.length} completed, ${inprogress.length} in progress, ${todo.length} still to do.`;
  }
  if (q.includes('overwhelm') || q.includes('too many') || q.includes('stress') || q.includes('focus')) {
    const target = inprogress[0] || todo[0];
    return target
      ? `Focus on just one thing: "${target}". Close everything else and get it done.`
      : "Take a breath. Your board is clear — add one task and start fresh.";
  }
  if (q.includes('break') || q.includes('rest') || q.includes('tired')) {
    return "Take a 10-minute break — you've earned it. Come back fresh and tackle the next task.";
  }
  if (q.includes('priorit') || q.includes('important') || q.includes('urgent')) {
    if (inprogress.length > 0) return `Finish "${inprogress[0]}" first — completing beats starting.`;
    if (todo.length > 0)       return `"${todo[0]}" is your top priority. Start there.`;
    return "Board is clear — great time to plan your next goals.";
  }
  if (total === 0) return "Your board is empty. Add your first task and let's get moving!";
  return `You have ${todo.length} pending, ${inprogress.length} in progress, and ${completed.length} completed. What would you like to focus on?`;
}
