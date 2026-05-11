/**
 * POST /api/assistant
 *
 * Human-like conversational AI companion — emotionally intelligent,
 * context-aware, adaptive, never repetitive.
 *
 * Body:    { message, history, todo, inprogress, completed }
 * Returns: { reply: string, answer: string }  ← both fields always present
 */

'use strict';

const { handleCors, parseBody } = require('./_ai.js');

// ── Model priority list ───────────────────────────────────────────────────────
// Ordered by conversational quality. First model that returns content wins.
const MODELS = [
  'meta-llama/llama-3.1-8b-instruct:free',   // best free conversational model
  'google/gemma-2-9b-it:free',                // strong fallback
  'mistralai/mistral-7b-instruct:free',       // reliable free fallback
  'mistralai/mistral-7b-instruct'             // paid fallback (last resort)
];

// ── Emotion / intent detector ─────────────────────────────────────────────────
// Reads the user message and recent history to detect emotional state.
// Returns a signal string the system prompt uses to adapt its tone.
function detectEmotionalContext(message, history) {
  const recent = [message, ...history.slice(-4).map(h => h.content)].join(' ').toLowerCase();

  if (/overwhelm|too much|can't cope|stressed|anxious|panic/.test(recent))
    return 'EMOTIONAL_STATE: user feels overwhelmed — respond with empathy first, then gently simplify';
  if (/tired|exhausted|burnt out|burnout|drained|no energy/.test(recent))
    return 'EMOTIONAL_STATE: user is tired — acknowledge it, suggest rest or a single small win';
  if (/not productive|unproductive|wasted|procrastinat|distracted|can\'t focus/.test(recent))
    return 'EMOTIONAL_STATE: user feels unproductive — be encouraging, avoid pressure, suggest one tiny step';
  if (/happy|great|amazing|crushed it|nailed|proud|excited/.test(recent))
    return 'EMOTIONAL_STATE: user is in a positive mood — match their energy, celebrate, build momentum';
  if (/bored|nothing to do|slow day|quiet/.test(recent))
    return 'EMOTIONAL_STATE: user seems bored — suggest a meaningful task or a stretch goal';
  if (/stuck|blocked|don\'t know|not sure|confused|help/.test(recent))
    return 'EMOTIONAL_STATE: user is stuck — ask a clarifying question, break things down';

  return null; // neutral — no special emotional handling needed
}

// ── Repetition guard ──────────────────────────────────────────────────────────
// Extracts the first 6 words of recent AI replies so the system prompt
// can tell the model what phrases to avoid.
function getRecentAIPhrases(history) {
  return history
    .filter(h => h.role === 'assistant')
    .slice(-4)
    .map(h => String(h.content || '').split(' ').slice(0, 6).join(' '))
    .filter(Boolean);
}

// ── System prompt builder ─────────────────────────────────────────────────────
function buildSystemPrompt(todo, inprogress, completed, history, userMessage) {
  const total   = todo.length + inprogress.length + completed.length;
  const pct     = total > 0 ? Math.round((completed.length / total) * 100) : 0;
  const now     = new Date();
  const hour    = now.getHours();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Time-of-day context
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

  const fmt = arr => arr.length === 0 ? 'none' : arr.slice(0, 6).map(t => `"${t}"`).join(', ');

  // Board signals
  const signals = [];
  if (total === 0)               signals.push('board is empty — user has no tasks yet');
  if (todo.length > 7)           signals.push(`heavy backlog: ${todo.length} pending tasks`);
  if (inprogress.length > 3)     signals.push(`context-switching risk: ${inprogress.length} tasks active simultaneously`);
  if (pct === 100 && total > 0)  signals.push('all tasks complete — exceptional day');
  if (pct >= 75 && pct < 100)    signals.push(`strong momentum: ${pct}% done`);
  if (inprogress.length === 0 && todo.length > 0) signals.push('nothing started yet today');
  if (completed.length > 0 && inprogress.length === 0 && todo.length === 0)
    signals.push('all remaining tasks are done');

  // Emotional context
  const emotion = detectEmotionalContext(userMessage, history);

  // Phrases the AI used recently (to prevent repetition)
  const recentPhrases = getRecentAIPhrases(history);

  return `You are FlowTask AI — an intelligent, emotionally aware productivity companion. Think of yourself as a blend of Jarvis, a supportive coach, and a smart friend who genuinely cares about the user's wellbeing and output.

PERSONALITY:
- Warm, natural, and conversational — never robotic or scripted
- Emotionally intelligent: read the user's mood and adapt your tone accordingly
- Proactive: notice patterns, ask thoughtful follow-up questions when appropriate
- Honest: give realistic advice, not just cheerleading
- Varied: never repeat the same phrasing twice in a row
- Concise: 1-3 sentences unless the user asks for a plan or breakdown

CURRENT CONTEXT:
- Time: ${timeStr} on ${dateStr} (${timeOfDay})
- In Progress (${inprogress.length}): ${fmt(inprogress)}
- To Do (${todo.length}): ${fmt(todo)}
- Completed today (${completed.length}): ${fmt(completed)}
- Overall progress: ${pct}% (${completed.length}/${total} tasks done)
${signals.length > 0 ? `- Signals: ${signals.join('; ')}` : ''}
${emotion ? `\n${emotion}` : ''}

CONVERSATION RULES:
1. Never start a response with "Start with", "Focus on", "Do your first task", or any phrase you used in the last 4 replies
2. Never say "As an AI", "I'm just an assistant", or "I don't have feelings"
3. Never use markdown, bullet points, numbered lists, or headers
4. If the user seems stressed or overwhelmed, acknowledge their feeling BEFORE giving advice
5. Occasionally ask a thoughtful follow-up question to deepen the conversation — but not every time
6. If the user has too many tasks, suggest reducing scope rather than just "focusing"
7. If the board is empty, gently encourage them to add something rather than just stating it's empty
8. Match the user's energy: if they're excited, be energetic; if they're tired, be calm and gentle
9. Vary your sentence structure and opening words across responses
${recentPhrases.length > 0 ? `10. AVOID starting with or repeating these recent phrases: ${recentPhrases.map(p => `"${p}..."`).join(', ')}` : ''}

FOLLOW-UP QUESTION EXAMPLES (use occasionally, not every reply):
- "What's been blocking you on that?"
- "Do you want quick wins or deep work right now?"
- "How are you feeling about your workload today?"
- "Should we break that into smaller steps?"
- "What would make today feel like a success for you?"

Respond naturally. Think before answering. Be the assistant the user actually needs right now.`;
}

// -- Reply sanitizer -------------------------------------------------------
// Strips system-prompt phrases that a model might echo back.
// Uses simple literal indexOf removal -- no regex sentence-wiping.
const BLOCKED_PHRASES = [
  'You are FlowTask AI',
  'FlowTask AI —', 'FlowTask AI -',
  'highly intelligent productivity companion',
  'intelligent, emotionally aware productivity companion',
  'Think of yourself as a blend of Jarvis',
  'blend of Jarvis',
  'supportive coach, and a smart friend',
  'PERSONALITY:', 'CURRENT CONTEXT:', 'CONVERSATION RULES:',
  'FOLLOW-UP QUESTION EXAMPLES', 'EMOTIONAL_STATE:',
  '[Board snapshot for this session]', '[End snapshot',
  'use this context to answer naturally',
  'Never say "As an AI"', 'Never use markdown',
  'Respond naturally. Think before answering',
];

function sanitizeReply(text) {
  if (!text || typeof text !== 'string') return '';
  let out = text;
  // Literal removal only -- no regex, no sentence-wiping
  for (const phrase of BLOCKED_PHRASES) {
    let idx = out.toLowerCase().indexOf(phrase.toLowerCase());
    while (idx !== -1) {
      out = out.slice(0, idx) + out.slice(idx + phrase.length);
      idx = out.toLowerCase().indexOf(phrase.toLowerCase());
    }
  }
  out = out.replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (out.length < 4) {
    console.warn('[sanitize] reply fully stripped — using safe fallback');
    return "I couldn't generate a response. Please try again.";
  }
  return out;
}

// ── Safe content extractor ────────────────────────────────────────────────────
function extractContent(data) {
  let content = data?.choices?.[0]?.message?.content;

  if (Array.isArray(content)) {
    content = content.map(p => (typeof p === 'string' ? p : p?.text || '')).join(' ');
  }

  content = String(content || '').trim();

  // Strip accidental markdown
  content = content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .trim();

  return content;
}

// ── OpenRouter caller with model fallback ─────────────────────────────────────
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
          max_tokens:  280,
          temperature: 0.82,  // higher = more natural, varied responses
          top_p:       0.92,  // nucleus sampling for diversity
          messages
        })
      });
    } catch (netErr) {
      console.error('[assistant] network error:', model, netErr.message);
      continue;
    }

    const rawText = await httpRes.text();
    console.log('[assistant] HTTP', httpRes.status, 'model:', model);
    console.log('[assistant] raw:', rawText.slice(0, 600));

    if (!httpRes.ok) {
      console.error('[assistant] HTTP error — trying next model');
      continue;
    }

    let data;
    try { data = JSON.parse(rawText); }
    catch (e) { console.error('[assistant] JSON parse failed:', e.message); continue; }

    if (data?.error) {
      console.error('[assistant] API error in body:', JSON.stringify(data.error));
      continue;
    }

    const content = extractContent(data);
    if (data?.usage) console.log('[assistant] tokens:', JSON.stringify(data.usage));

    if (content) {
      console.log('[assistant] success:', model, '|', content.slice(0, 100));
      return content;
    }

    console.warn('[assistant] empty content from', model);
  }

  throw new Error('All models returned empty content');
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Parse body with full debug logging ──
  const body = await parseBody(req);

  console.log('[assistant] ── incoming request ──');
  console.log('[assistant] body type:', typeof body, '| is Buffer:', Buffer.isBuffer(body));
  console.log('[assistant] body:', JSON.stringify(body).slice(0, 300));

  // Accept message, text, prompt, or query — never 400 on field name mismatch
  const userMessage = (
    body.message ||
    body.text    ||
    body.prompt  ||
    body.query   ||
    ''
  ).trim();

  const history    = Array.isArray(body.history)   ? body.history   : [];
  const todo       = Array.isArray(body.todo)       ? body.todo       : [];
  const inprogress = Array.isArray(body.inprogress) ? body.inprogress : [];
  const completed  = Array.isArray(body.completed)  ? body.completed  : [];

  console.log('[assistant] userMessage:', userMessage.slice(0, 120));
  console.log('[assistant] history turns:', history.length);
  console.log('[assistant] board — todo:', todo.length, '| inprogress:', inprogress.length, '| completed:', completed.length);

  // If message is empty, return a helpful fallback instead of 400
  // so the UI never shows an error state
  if (!userMessage) {
    console.warn('[assistant] empty message — returning prompt instead of 400');
    return res.status(200).json({
      reply:  "What's on your mind? Ask me anything about your tasks or your day.",
      answer: "What's on your mind? Ask me anything about your tasks or your day."
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const appUrl = process.env.APP_URL || 'https://flowtask.vercel.app';

  console.log('[assistant] API key set:', !!apiKey);
  console.log('[assistant] APP_URL:', appUrl);

  // No API key — return intelligent fallback, never an error
  if (!apiKey) {
    console.error('[assistant] OPENROUTER_API_KEY not set — using fallback');
    const reply = buildFallback(userMessage, todo, inprogress, completed, history);
    return res.status(200).json({ reply, answer: reply });
  }

  // Build the full messages array for the API call.
  // Context lives ONLY in the system role — never injected as user turns,
  // which prevents models from echoing it back as part of their reply.
  const systemPrompt = buildSystemPrompt(todo, inprogress, completed, history, userMessage);

  const messages = [
    { role: 'system', content: systemPrompt },
    // Conversation history — only real user/assistant turns, never system content
    ...history.slice(-16).map(h => ({
      role:    h.role === 'assistant' ? 'assistant' : 'user',
      content: String(h.content || '').slice(0, 500)
    })),
    { role: 'user', content: userMessage }
  ];

  try {
    const rawReply = await callOpenRouter(messages, apiKey, appUrl);
    // Sanitize before returning — strip any leaked system prompt phrases
    const reply = sanitizeReply(rawReply);
    console.log('[assistant] final reply:', reply.slice(0, 120));
    return res.status(200).json({ reply, answer: reply });
  } catch (err) {
    // OpenRouter failed — return fallback, never a 4xx/5xx
    console.error('[assistant] all models failed:', err.message);
    const reply = buildFallback(userMessage, todo, inprogress, completed, history);
    return res.status(200).json({ reply, answer: reply });
  }
};

// ── Emotionally intelligent fallback ─────────────────────────────────────────
// Only runs when ALL AI models fail. Varied, empathetic, non-repetitive.
function buildFallback(message, todo, inprogress, completed, history = []) {
  const q     = message.toLowerCase();
  const total = todo.length + inprogress.length + completed.length;
  const pct   = total > 0 ? Math.round((completed.length / total) * 100) : 0;

  // Detect emotional state
  const isOverwhelmed = /overwhelm|stressed|too much|anxious|panic/.test(q);
  const isTired       = /tired|exhausted|burnt|drained|no energy/.test(q);
  const isStuck       = /stuck|blocked|don't know|not sure|confused/.test(q);
  const isPositive    = /great|amazing|crushed|nailed|proud|excited/.test(q);

  // Emotional responses first
  if (isOverwhelmed) {
    if (inprogress.length > 0)
      return `That's a lot to carry. Let's simplify — just stay with "${inprogress[0]}" for now and ignore everything else.`;
    if (todo.length > 0)
      return `I hear you. Pick just one thing from your list — "${todo[0]}" — and let everything else wait.`;
    return "Take a breath. Your board is actually clear — sometimes the overwhelm is in our heads. What's really on your mind?";
  }

  if (isTired) {
    if (completed.length > 0)
      return `You've already done ${completed.length} thing${completed.length > 1 ? 's' : ''} today — that's real. Rest is productive too. What would feel manageable right now?`;
    return "Rest is part of the process. Even a 10-minute break can reset your focus. What's one small thing you could do after?";
  }

  if (isStuck) {
    if (inprogress.length > 0)
      return `What specifically is blocking you on "${inprogress[0]}"? Sometimes naming it is half the solution.`;
    return "What's the smallest possible next step you could take? Even something tiny counts.";
  }

  if (isPositive) {
    if (pct === 100 && total > 0)
      return "You cleared everything — that's genuinely impressive. What's next on your radar?";
    return `Love the energy! You're at ${pct}% — keep that momentum going.`;
  }

  // Task-state responses — varied phrasing pool
  const nextTaskResponses = inprogress.length > 0
    ? [
        `You've got "${inprogress[0]}" in motion — that's your best bet right now.`,
        `"${inprogress[0]}" is already rolling. Finishing it will feel great.`,
        `Your active task is "${inprogress[0]}" — give it your full attention and close it out.`
      ]
    : todo.length > 0
      ? [
          `"${todo[0]}" is waiting at the top of your list — a good place to begin.`,
          `How about tackling "${todo[0]}" next? It's been sitting there.`,
          `"${todo[0]}" looks like a solid next move. What do you think?`
        ]
      : [
          "Your board is clear — a rare and good thing. What would you like to add?",
          "Nothing left on the board. Time to plan your next move.",
          "All clear! What's coming up next for you?"
        ];

  if (q.includes('next') || q.includes('should') || q.includes('what') || q.includes('do') || q.includes('start')) {
    return nextTaskResponses[Math.floor(Math.random() * nextTaskResponses.length)];
  }

  if (q.includes('complet') || q.includes('done') || q.includes('finish') || q.includes('today')) {
    if (completed.length === 0) return "Nothing marked complete yet today — but the day isn't over. What can you close out?";
    if (pct === 100)            return `Everything done — ${completed.length} task${completed.length > 1 ? 's' : ''} completed. That's a full day.`;
    return `${completed.length} task${completed.length > 1 ? 's' : ''} done so far: ${completed.slice(0, 3).join(', ')}. ${todo.length > 0 ? `${todo.length} more to go.` : 'Almost there!'}`;
  }

  if (q.includes('how') || q.includes('progress') || q.includes('doing') || q.includes('status')) {
    if (pct === 100 && total > 0) return "Everything's done — you had a great day.";
    if (pct === 0 && total > 0)   return `${total} tasks on the board, none started yet. What's the first move?`;
    return `You're ${pct}% through — ${completed.length} done, ${inprogress.length} active, ${todo.length} waiting. Solid progress.`;
  }

  if (q.includes('break') || q.includes('rest')) {
    return "Absolutely — step away for a bit. Your tasks will still be here. A clear head is worth more than pushing through tired.";
  }

  if (q.includes('priorit') || q.includes('important') || q.includes('urgent')) {
    if (inprogress.length > 0) return `Finishing "${inprogress[0]}" is your highest-value move right now — completing beats starting.`;
    if (todo.length > 0)       return `"${todo[0]}" is at the top of your list. That's usually a good signal for priority.`;
    return "Board is clear — great moment to think about what matters most next.";
  }

  // Generic — varied
  if (total === 0) return "Your board is empty. What's on your mind today?";

  const generic = [
    `You have ${todo.length} pending and ${inprogress.length} in progress. What would you like to dig into?`,
    `${total} tasks total, ${pct}% done. What's on your mind?`,
    `Looking at your board — ${inprogress.length > 0 ? `"${inprogress[0]}" is active` : `${todo.length} tasks waiting`}. How can I help?`
  ];
  return generic[Math.floor(Math.random() * generic.length)];
}
