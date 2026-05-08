export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        system: `Classify task into todo/inprogress/completed and return JSON:
        {"category":"todo|inprogress|completed","title":"clean title"}`,
        messages: [{ role: "user", content: text }]
      })
    });

    const data = await response.json();
    const raw = data.content?.[0]?.text || "{}";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

    res.status(200).json(parsed);

  } catch (err) {
    res.status(200).json({
      category: "todo",
      title: text
    });
  }
}