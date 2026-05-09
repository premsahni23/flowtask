/**
 * /api/classify
 * Classifies a task using OpenRouter AI and returns:
 * { title: string, category: "todo" | "inprogress" | "completed" }
 */

// Reusable OpenRouter caller — used by all AI endpoints
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
      max_tokens: 200,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  console.log('[AI] raw response:', text);
  return text.trim();
}

// Parse JSON safely from AI output (strips markdown code fences)
function parseJSON(raw) {
  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  // Extract first {...} or [...] block
  const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) throw new Error('No JSON found in: ' + cleaned);
  return JSON.parse(match[1]);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' });
  }

  const prompt = `You are a task classifier. Given a task description, return ONLY valid JSON with no explanation.

Task: "${text}"

Rules:
- "category" must be exactly one of: todo, inprogress, completed
- Use "completed" if the task is described in past tense (e.g. "finished", "done", "completed")
- Use "inprogress" if the task is currently happening (e.g. "working on", "coding", "writing")
- Use "todo" for everything else
- "title" should be a clean, concise version of the task (max 60 chars)

Return ONLY this JSON:
{"title":"<clean title>","category":"<todo|inprogress|completed>"}`;

  try {
    const raw    = await callAI(prompt);
    const parsed = parseJSON(raw);

    // Validate and sanitise
    const validCols = ['todo', 'inprogress', 'completed'];
    const category  = validCols.includes(parsed.category) ? parsed.category : 'todo';
    const title     = typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim().slice(0, 120)
      : text;

    return res.status(200).json({ title, category });

  } catch (err) {
    console.error('[classify] error:', err.message);
    // Graceful fallback — never break the UI
    return res.status(200).json({ title: text, category: 'todo' });
  }
}
