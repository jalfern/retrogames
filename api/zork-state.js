const BACKEND = 'http://5.78.145.117:3101'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const since = req.query.since || '0'
  try {
    const r = await fetch(`${BACKEND}/state?since=${since}`)
    const data = await r.json()
    res.status(200).json(data)
  } catch(e) {
    res.status(200).json({ lines: [], aiStatus: null, ts: Date.now(), error: e.message })
  }
}
