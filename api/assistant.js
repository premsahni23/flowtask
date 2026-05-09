/**
 * /api/assistant
 * Answers questions about the user's tasks using their current board state.
 * Returns: { answer: string }
 */

async function callAI(prompt) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://flowtask.vercel.app',
      'X-Title': 'FlowTask'
    },
    body: JSON.stringify({
      model: 'mistralai/mistral-7b-instruct',
      max_tokens: 150,
      temperature: 0.5,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, todo = [], inprogress = [], completed = [] } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }

  const context = `
Current board state:
- To Do (${todo.length}): ${todo.slice(0, 5).join(', ') || 'none'}
- In Progress (${inprogress.length}): ${inprogress.slice(0, 5).join(', ') || 'none'}
- Completed (${completed.length}): ${completed.slice(0, 5).join(', ') || 'none'}
`.trim();

  const prompt = `You are a helpful productivity assistant for a Kanban task manager called FlowTask.

${context}

User question: "${question}"

Answer in 1-2 short sentences. Be direct and actionable. No markdown, no bullet points.`;

  try {
    const answer = await callAI(prompt);
    return res.status(200).json({ answer });
  } catch (err) {
    console.error('[assistant] error:', err.message);
    // Fallback answers based on question keywords
    const q = question.toLowerCase();
    let answer;
    if (q.includes('next') || q.includes('do')) {
      answer = inprogress.length > 0
        ? `Focus on: "${inprogress[0]}"`
        : todo.length > 0
          ? `Start with: "${todo[0]}"`
          : "You're all caught up! Add a new task.";
    } else if (q.includes('complet') || q.includes('done') || q.includes('finish')) {
      answer = completed.length > 0
        ? `Completed today: ${completed.slice(0, 3).join(', ')}`
        : "Nothing completed yet — let's change that!";
    } else {
      answer = `You have ${todo.length} pending and ${inprogress.length} in progress.`;
    }
    return res.status(200).json({ answer });
  }
}
