/**
 * POST /api/assistant
 *
 * Body:    { "question": "What should I do next?", "todo": [], "inprogress": [], "completed": [] }
 * Returns: { "answer": "Focus on: ..." }
 *
 * Falls back to rule-based answers if AI fails — never returns an error to the UI.
 */

'use strict';

const { callAI, handleCors } = require('./_ai.js');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    question,
    todo       = [],
    inprogress = [],
    completed  = []
  } = req.body || {};

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: '"question" field is required' });
  }

  console.log('[assistant] question:', question);
  console.log('[assistant] board — todo:', todo.length, 'inprogress:', inprogress.length, 'completed:', completed.length);

  const fmt = arr =>
    arr.length === 0 ? 'none' : arr.slice(0, 5).map(t => `"${t}"`).join(', ');

  const context = [
    `To Do (${todo.length}): ${fmt(todo)}`,
    `In Progress (${inprogress.length}): ${fmt(inprogress)}`,
    `Completed (${completed.length}): ${fmt(completed)}`
  ].join('\n');

  const prompt = `You are a concise productivity assistant for a Kanban app called FlowTask.

Current board:
${context}

User: "${question}"

Reply in 1-2 sentences. Be direct and actionable. No markdown, no bullet points, no preamble.`;

  try {
    const answer = await callAI(prompt, { max_tokens: 120, temperature: 0.5 });
    console.log('[assistant] answer:', answer);
    return res.status(200).json({ answer });

  } catch (err) {
    console.error('[assistant] error — using fallback:', err.message);

    // Rule-based fallback — always returns something useful
    const q = question.toLowerCase();
    let answer;

    if (q.includes('next') || q.includes('should i do') || q.includes('start')) {
      if (inprogress.length > 0) {
        answer = `Keep working on "${inprogress[0]}" — it's already in progress.`;
      } else if (todo.length > 0) {
        answer = `Start with "${todo[0]}" — it's at the top of your list.`;
      } else {
        answer = "You're all caught up! Add a new task to keep the momentum going.";
      }
    } else if (q.includes('complet') || q.includes('done') || q.includes('finish') || q.includes('today')) {
      answer = completed.length > 0
        ? `You've completed ${completed.length} task${completed.length > 1 ? 's' : ''}: ${completed.slice(0, 3).join(', ')}.`
        : "Nothing completed yet — let's change that!";
    } else if (q.includes('how') || q.includes('progress') || q.includes('doing')) {
      const total = todo.length + inprogress.length + completed.length;
      const pct   = total > 0 ? Math.round((completed.length / total) * 100) : 0;
      answer = `You're ${pct}% done — ${completed.length} completed, ${inprogress.length} in progress, ${todo.length} pending.`;
    } else {
      answer = `You have ${todo.length} pending task${todo.length !== 1 ? 's' : ''} and ${inprogress.length} in progress.`;
    }

    return res.status(200).json({ answer });
  }
};
