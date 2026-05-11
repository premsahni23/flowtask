/**
 * POST /api/planner
 *
 * Body:    { "tasks": "gym, coding, meeting" }
 * Returns: { "plan": [{ "task": "Gym", "time": "7:00 AM" }, ...] }
 *
 * Falls back to evenly-spaced times if AI fails.
 */

'use strict';

const { callAI, parseAIJson, handleCors, parseBody } = require('./_ai.js');

/** Convert a 24h hour integer to a 12h time string. e.g. 14 → "2:00 PM" */
function toTime(hour) {
  const h    = hour % 24;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${ampm}`;
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body    = await parseBody(req);
  const { tasks } = body;

  if (!tasks || typeof tasks !== 'string' || !tasks.trim()) {
    return res.status(400).json({ error: '"tasks" field is required' });
  }

  const input = tasks.trim();
  console.log('[planner] input:', input);

  const prompt = `You are a productivity planner. Create a realistic daily schedule for these tasks: ${input}

Rules:
- Schedule tasks between 7:00 AM and 9:00 PM
- Space tasks sensibly — allow at least 1 hour between them
- Use 12-hour time format exactly like: "9:00 AM" or "2:30 PM"
- Keep each task name concise (max 40 characters)
- Return ONLY a JSON array — no explanation, no markdown

Required format:
[{"task":"Task name","time":"9:00 AM"},{"task":"Another task","time":"2:00 PM"}]`;

  try {
    const raw    = await callAI(prompt, { max_tokens: 400, temperature: 0.4 });
    const parsed = parseAIJson(raw);

    console.log('[planner] parsed:', JSON.stringify(parsed));

    if (!Array.isArray(parsed)) {
      throw new Error('AI returned non-array: ' + typeof parsed);
    }

    const plan = parsed
      .filter(item => item && item.task && item.time)
      .map(item => ({
        task: String(item.task).trim().slice(0, 80),
        time: String(item.time).trim()
      }));

    if (plan.length === 0) {
      throw new Error('AI returned empty plan array');
    }

    console.log('[planner] plan items:', plan.length);
    return res.status(200).json({ plan });

  } catch (err) {
    console.error('[planner] error — using fallback schedule:', err.message);

    // Fallback: split by comma, strip "plan my day:" prefix, assign times from 9 AM
    const taskList = input
      .replace(/^plan my day[:\s]*/i, '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const plan = taskList.map((task, i) => ({
      task,
      time: toTime(9 + i * 2)
    }));

    return res.status(200).json({ plan });
  }
};
