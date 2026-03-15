export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()
  try {
    const response = await fetch("http://5.78.145.117:3099/ai-move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body)
    })
    const data = await response.json()
    return res.status(200).json(data)
  } catch(e) {
    return res.status(200).json({ command: null })
  }
}
