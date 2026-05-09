/**
 * /api/planner
 * Generates a structured daily plan from a comma-separated task list.
 * Returns: [{ task: string, time: string }]
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
      max_tokens: 400,
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  console.log('[planner] raw:', text);
  return text.trim();
}

function parseJSON(raw) {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const match   = cleaned.match(/(\[[\s\S]*\])/);
  if (!match) throw new Error('No JSON array in: ' + cleaned);
  return JSON.parse(match[1]);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tasks } = req.body;
  if (!tasks || typeof tasks !== 'string') {
    return res.status(400).json({ error: 'tasks string is required' });
  }

  const prompt = `You are a productivity planner. Create a realistic daily schedule for these tasks: ${tasks}

Rules:
- Schedule tasks between 7:00 AM and 9:00 PM
- Space them out sensibly (allow time for breaks)
- Use 12-hour time format (e.g. "9:00 AM")
- Keep task names concise (max 40 chars)
- Return ONLY a JSON array, no explanation

Return ONLY this format:
[{"task":"Task name","time":"9:00 AM"},{"task":"Another task","time":"2:00 PM"}]`;

  try {
    const raw    = await callAI(prompt);
    const parsed = parseJSON(raw);

    // Validate array structure
    if (!Array.isArray(parsed)) throw new Error('Expected array');

    const plan = parsed
      .filter(item => item.task && item.time)
      .map(item => ({
        task: String(item.task).trim().slice(0, 80),
        time: String(item.time).trim()
      }));

    return res.status(200).json({ plan });

  } catch (err) {
    console.error('[planner] error:', err.message);
    // Fallback: split tasks and assign default times
    const items = tasks.split(',').map((t, i) => ({
      task: t.trim(),
      time: `${9 + i * 2}:00 ${9 + i * 2 < 12 ? 'AM' : 'PM'}`
    }));
    return res.status(200).json({ plan: items });
  }
}
