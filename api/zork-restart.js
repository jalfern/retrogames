const BACKEND = 'http://5.78.145.117:3101'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()
  try {
    const r = await fetch(`${BACKEND}/restart`, { method: 'GET' })
    const data = await r.json()
    res.status(200).json(data)
  } catch(e) {
    res.status(200).json({ error: e.message })
  }
}
