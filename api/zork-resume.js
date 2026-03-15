const BACKEND = 'http://5.78.145.117:3101'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const action = req.url.includes('resume') ? 'resume' : 'pause'
  try {
    const r = await fetch(`${BACKEND}/${action}`)
    const data = await r.json()
    res.status(200).json(data)
  } catch(e) {
    res.status(200).json({ error: e.message })
  }
}
