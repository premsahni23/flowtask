/**
 * POST /api/assistant
 *
 * Full conversational AI endpoint with:
 * - Jarvis-style system personality
 * - Conversation history context (last 10 messages)
 * - Task board awareness
 * - Smart productivity analysis
 * - Natural language responses
 *
 * Body: {
 *   message:    string,           // current user message
 *   history:    [{role, content}], // last N conversation turns
 *   todo:       string[],
 *   inprogress: string[],
 *   completed:  string[]
 * }
 * Returns: { answer: string }
 */

'use strict';

const { handleCors } = require('./_ai.js');

// ── System personality prompt ─────────────────────────────────────────────────
function buildSystemPrompt(todo, inprogress, completed) {
  const total    = todo.length + inprogress.length + completed.length;
  const pct      = total > 0 ? Math.round((completed.length / total) * 100) : 0;
  const now      = new Date();
  const timeStr  = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr  = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const fmt = arr => arr.length === 0 ? 'none' : arr.slice(0, 8).join(', ');

  // Detect productivity signals for smarter responses
  const signals = [];
  if (todo.length > 6)       signals.push(`overloaded (${todo.length} pending tasks)`);
  if (inprogress.length > 3) signals.push(`context-switching risk (${inprogress.length} tasks in progress simultaneously)`);
  if (completed.length > 0 && pct === 100) signals.push('all tasks complete — exceptional day');
  if (pct >= 75)             signals.push(`strong progress (${pct}% done)`);
  if (todo.length > 0 && inprogress.length === 0) signals.push('nothing started yet — needs a push');

  return `You are FlowTask AI, an intelligent personal productivity assistant — think Jarvis from Iron Man, but focused on helping users get things done.

Your personality:
- Warm, direct, and encouraging — never robotic or generic
- Concise: 1-3 sentences max unless the user asks for detail
- Proactive: notice patterns, suggest next actions, detect overload
- Conversational: remember what was said earlier in this chat
- Smart: prioritize by urgency and context, not just order

Current time: ${timeStr} on ${dateStr}

User's task board:
- In Progress (${inprogress.length}): ${fmt(inprogress)}
- To Do (${todo.length}): ${fmt(todo)}
- Completed today (${completed.length}): ${fmt(completed)}
- Overall progress: ${pct}% complete (${completed.length}/${total} tasks)
${signals.length > 0 ? `\nProductivity signals: ${signals.join('; ')}` : ''}

Rules:
- Never use markdown, bullet points, or headers in your response
- Never say "As an AI" or "I'm just an assistant"
- If the user seems overwhelmed, acknowledge it and suggest focusing on ONE task
- If they've completed everything, celebrate genuinely
- If nothing is started, give a specific, motivating nudge
- Keep responses under 60 words unless asked for a plan or list`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    message,
    history    = [],   // [{ role: 'user'|'assistant', content: string }]
    todo       = [],
    inprogress = [],
    completed  = []
  } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: '"message" field is required' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const appUrl = process.env.APP_URL || 'https://flowtask.vercel.app';

  if (!apiKey) {
    console.error('[assistant] OPENROUTER_API_KEY not set');
    return res.status(200).json({ answer: buildFallback(message, todo, inprogress, completed) });
  }

  console.log('[assistant] message:', message.slice(0, 100));
  console.log('[assistant] history turns:', history.length);
  console.log('[assistant] board — todo:', todo.length, 'inprogress:', inprogress.length, 'completed:', completed.length);

  // Build the full messages array: system + history (last 10) + current message
  const systemPrompt = buildSystemPrompt(todo, inprogress, completed);

  const messages = [
    { role: 'system', content: systemPrompt },
    // Include last 10 turns of conversation history for memory
    ...history.slice(-10).map(h => ({
      role:    h.role === 'assistant' ? 'assistant' : 'user',
      content: String(h.content).slice(0, 500) // cap each turn to avoid token overflow
    })),
    { role: 'user', content: message.trim() }
  ];

  try {
    const res2 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  appUrl,
        'X-Title':       'FlowTask'
      },
      body: JSON.stringify({
        model:       'mistralai/mistral-7b-instruct',
        max_tokens:  200,
        temperature: 0.7,   // higher temp for more natural conversation
        messages
      })
    });

    if (!res2.ok) {
      const errText = await res2.text();
      console.error('[assistant] OpenRouter error:', res2.status, errText);
      throw new Error(`OpenRouter ${res2.status}`);
    }

    const data   = await res2.json();
    const answer = (data.choices?.[0]?.message?.content || '').trim();

    if (data.usage) console.log('[assistant] tokens:', JSON.stringify(data.usage));
    console.log('[assistant] answer:', answer.slice(0, 120));

    if (!answer) throw new Error('Empty response from AI');

    return res.status(200).json({ answer });

  } catch (err) {
    console.error('[assistant] AI failed — using fallback:', err.message);
    return res.status(200).json({ answer: buildFallback(message, todo, inprogress, completed) });
  }
};

// ── Rule-based fallback (runs when AI is unavailable) ─────────────────────────
function buildFallback(message, todo, inprogress, completed) {
  const q     = message.toLowerCase();
  const total = todo.length + inprogress.length + completed.length;
  const pct   = total > 0 ? Math.round((completed.length / total) * 100) : 0;

  if (q.includes('next') || q.includes('should i') || q.includes('start') || q.includes('do')) {
    if (inprogress.length > 0) return `Keep going on "${inprogress[0]}" — you've already started it.`;
    if (todo.length > 0)       return `Start with "${todo[0]}" — it's first on your list.`;
    return "You're all caught up! Add something new to work on.";
  }

  if (q.includes('complet') || q.includes('done') || q.includes('finish') || q.includes('today')) {
    if (completed.length === 0) return "Nothing completed yet — let's change that. Pick one task and start.";
    return `You've completed ${completed.length} task${completed.length > 1 ? 's' : ''} today: ${completed.slice(0, 3).join(', ')}.`;
  }

  if (q.includes('how') || q.includes('progress') || q.includes('doing') || q.includes('status')) {
    if (pct === 100) return "Everything done — you crushed it today! 🎉";
    return `You're ${pct}% done — ${completed.length} completed, ${inprogress.length} in progress, ${todo.length} still to do.`;
  }

  if (q.includes('overwhelm') || q.includes('too many') || q.includes('stress')) {
    return `Focus on just one thing right now: "${inprogress[0] || todo[0] || 'your next task'}". Everything else can wait.`;
  }

  if (q.includes('break') || q.includes('rest') || q.includes('tired')) {
    return "Take a 10-minute break — you've earned it. Come back fresh and tackle the next task.";
  }

  if (q.includes('priorit') || q.includes('important') || q.includes('urgent')) {
    if (inprogress.length > 0) return `Finish "${inprogress[0]}" first — completing in-progress work beats starting new tasks.`;
    if (todo.length > 0)       return `"${todo[0]}" looks like your top priority. Start there.`;
    return "Your board is clear — great time to plan your next goals.";
  }

  // Generic fallback
  if (total === 0) return "Your board is empty. Add your first task and let's get moving!";
  return `You have ${todo.length} pending, ${inprogress.length} in progress, and ${completed.length} completed. What would you like to focus on?`;
}
