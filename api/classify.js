/**
 * POST /api/classify
 *
 * Body:    { "text": "Finished the design review" }
 * Returns: { "title": "Design review", "category": "completed" }
 *
 * category is always one of: todo | inprogress | completed
 * Falls back to { title: text, category: "todo" } on any error — never breaks the UI.
 */

'use strict';

const { callAI, parseAIJson, handleCors } = require('./_ai.js');

const VALID_COLS = ['todo', 'inprogress', 'completed'];

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: '"text" field is required' });
  }

  const input = text.trim();
  console.log('[classify] input:', input);

  const prompt = `You are a task classifier. Classify the task below and return ONLY valid JSON — no explanation, no markdown.

Task: "${input}"

Classification rules:
- "completed" → past tense (finished, done, completed, reviewed, shipped, fixed, wrote, built, sent)
- "inprogress" → currently happening (working on, coding, writing, building, in progress, started)
- "todo"       → everything else (need to, should, will, plan to, upcoming, want to)

"title" must be a clean concise rewrite of the task (max 60 chars, no surrounding quotes).

Respond with ONLY this JSON — nothing else:
{"title":"<clean task title>","category":"<todo|inprogress|completed>"}`;

  try {
    const raw    = await callAI(prompt, { max_tokens: 150, temperature: 0.1 });
    const parsed = parseAIJson(raw);

    console.log('[classify] parsed:', JSON.stringify(parsed));

    const category = VALID_COLS.includes(parsed.category) ? parsed.category : 'todo';
    const title    = typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim().slice(0, 120)
      : input;

    console.log('[classify] result:', { title, category });
    return res.status(200).json({ title, category });

  } catch (err) {
    console.error('[classify] error — falling back:', err.message);
    return res.status(200).json({ title: input, category: 'todo' });
  }
};
