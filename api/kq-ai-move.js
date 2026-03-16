// api/kq-ai-move.js — proxy King's Quest vision AI request to Hetzner
const BACKEND = 'http://5.78.145.117:3099'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).end(); return }

  try {
    const r = await fetch(`${BACKEND}/kq-ai-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    })
    const data = await r.json()
    res.status(200).json(data)
  } catch (e) {
    res.status(200).json({ command: null, error: e.message })
  }
}
