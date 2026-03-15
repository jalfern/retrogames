const BACKEND = 'http://5.78.145.117:3101'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).end()
  try {
    let body = req.body
    if (typeof body === 'string') body = JSON.parse(body)
    await fetch(`${BACKEND}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    res.status(200).json({ ok: true })
  } catch(e) {
    res.status(200).json({ ok: false, error: e.message })
  }
}
