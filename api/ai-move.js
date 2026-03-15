export default async function handler(req, res) {
  // CORS — allow requests from jalfern.com and retrogames-psi.vercel.app
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).end()

  try {
    let body = req.body
    if (typeof body === 'string') body = JSON.parse(body)
    if (!body) {
      const raw = await new Promise((resolve) => {
        let d = ''; req.on('data', c => d += c); req.on('end', () => resolve(d))
      })
      body = JSON.parse(raw || '{}')
    }

    const response = await fetch('http://5.78.145.117:3099/ai-move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await response.json()
    return res.status(200).json(data)
  } catch(e) {
    console.error('ai-move error:', e.message)
    return res.status(200).json({ command: null, error: e.message })
  }
}
