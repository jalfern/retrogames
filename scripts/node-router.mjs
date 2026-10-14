// THE NODE ROUTER — one OpenAI-compatible door in front of the MLX fleet.
//
//   node scripts/node-router.mjs        (launchd: com.jalfern.noderouter, :8010)
//
// Nodes (config: ~/.config/noderouter/nodes.json, chmod 600 — keys never
// live in the repo):
//
//   {
//     "token":  "router-local bearer token the opencode provider sends",
//     "nodes": [
//       { "name": "studio", "url": "http://127.0.0.1:8000",
//         "key": "sk-...", "prio": 1, "max": 4,
//         "allow": ["Flash-Next", "gemma", "Coder", "DeepSeek", "27B-oQ8e"] },
//       { "name": "mini",   "url": "http://127.0.0.1:18000",
//         "key": "sk-...", "prio": 2, "max": 2, "allow": ["27B"] },
//       { "name": "mbp",    "url": "http://<tailscale-ip>:8000",
//         "key": "sk-...", "prio": 3, "max": 2, "dynamic": true,
//         "allow": ["27B"] }
//     ]
//   }
//
// The four behaviours that make it "intelligent" rather than a round-robin:
//
// 0. ROLE MAP — /v1/models is the catalog a node CAN load, not what it
//    serves (the Studio declares 13). Without policy, prio alone would
//    pull QA's 27B onto the Studio beside Flash-Next and re-create the
//    Oct 11 memory-guard crash. `allow` (substring patterns) is the
//    machine contract: Studio builds games (Flash-Next class), the mini
//    serves QA's 27B, the MBP (when awake, on AC) takes 27B fixes — and
//    when it is away that work 503s rather than silently landing on the
//    Studio. A model nobody is ALLOWED is a loud 503 naming the map.
//
// 1. CAPABILITY MAP — every node is polled (/v1/models) on a heartbeat; a
//    node is offerable only while it answers, and only for the models it
//    itself declared. The MacBook Pro therefore joins and leaves by itself:
//    lid shut -> gone from the union in <=1 probe interval, oMLX back up
//    -> back in, no human, no restart, nothing else pays a timeout.
//
// 2. HOT-LOAD STICKINESS — oMLX caches several loaded models, but switching
//    costs a load and thrash evicts. Consecutive requests for model X
//    stick to the node that last served X while that node is online,
//    allowed, and below its concurrency cap, so the common case (one
//    agent hammering one model) never pays a reload. Only a busy/offline/
//    disallowed sticky node forces a move, and the new node becomes
//    sticky.
//
// 3. HONEST FAILOVER — if a chosen node fails BEFORE a single response
//    byte (refused/5xx), the request is replayed once per remaining
//    candidate. Once bytes are on the wire the stream is passed through
//    untouched and a mid-stream death propagates as a truncated stream —
//    the client's own retry sees a clean world.
//
// The router swaps Authorization per node (each oMLX has its own key),
// binds 127.0.0.1 only, and requires `token` on every request so a
// dev-server leak cannot burn the fleet. GET /router/status answers the
// live map as JSON (that is what scripts/nodercheck.mjs grades).
import http from 'node:http'
import fs from 'node:fs'

const CFG_PATH = process.env.NODE_ROUTER_CFG || `${process.env.HOME}/.config/noderouter/nodes.json`
const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'))
const PORT = Number(process.env.NODE_ROUTER_PORT || 8010)

const nodes = cfg.nodes.map((n) => ({
    ...n,
    online: false,
    models: new Set(),
    inFlight: 0,
    fail: 0,
    lastOk: 0,
    lastErr: '',
    served: 0,
    reloads: 0,
}))
const byName = Object.fromEntries(nodes.map((n) => [n.name, n]))
const sticky = new Map()
const allowed = (n, model) => !n.allow || !model || n.allow.some((p) => model.includes(p))

const url = (u) => new URL(u)

function probe(n) {
    const t0 = Date.now()
    const req = http.get(url(n.url) , { path: '/v1/models', headers: { authorization: `Bearer ${n.key}` }, timeout: n.dynamic ? 2500 : 4000 }, (res) => {
        let body = ''
        res.on('data', (d) => (body += d))
        res.on('end', () => {
            if (res.statusCode !== 200) { markDown(n, `HTTP ${res.statusCode}`); return }
            try {
                const models = JSON.parse(body).data.map((m) => m.id)
                n.models = new Set(models)
                n.online = true
                n.fail = 0
                n.lastOk = Date.now()
                n.lastErr = ''
            } catch { markDown(n, 'bad /v1/models JSON') }
        })
    })
    req.on('timeout', () => { req.destroy(new Error('probe timeout')) })
    req.on('error', (e) => markDown(n, e.message))
    void t0
}

function markDown(n, why) {
    n.fail++
    n.online = false
    n.lastErr = why
}

const HEARTBEAT_MS = Number(process.env.NODE_ROUTER_HB || 6000)
setInterval(() => { for (const n of nodes) probe(n) }, HEARTBEAT_MS)
for (const n of nodes) probe(n)

function candidates(model) {
    return nodes
        .filter((n) => n.online && (model ? n.models.has(model) && allowed(n, model) : true))
        .sort((a, b) => (a.inFlight - b.inFlight) || (a.prio - b.prio))
}

function pick(model) {
    const cands = candidates(model)
    if (!cands.length) return null
    const s = model && sticky.get(model)
    const sNode = s && byName[s]
    if (sNode && cands.includes(sNode) && sNode.inFlight < (sNode.max || 2)) return sNode
    const pickNode = cands[0]
    if (model && (!s || s !== pickNode.name)) {
        if (model && sticky.get(model) && byName[sticky.get(model)]?.online) byName[sticky.get(model)].reloads++
        sticky.set(model, pickNode.name)
    }
    return pickNode
}

const forward = (n, req, body) => new Promise((resolve, reject) => {
    const u = url(n.url)
    const up = http.request({
        host: u.hostname, port: u.port, path: req.url, method: req.method,
        headers: { ...req.headers, authorization: `Bearer ${n.key}`, host: u.host },
        timeout: 600000,
    }, (res) => resolve(res))
    up.on('error', reject)
    up.on('timeout', () => up.destroy(new Error('upstream timeout')))
    n.inFlight++
    const dec = () => { n.inFlight-- }
    up.on('close', dec)
    up._body = body
    up.end(body)
})

async function proxy(req, res) {
    const auth = (req.headers.authorization || '').replace(/^Bearer /, '')
    if (auth !== cfg.token) { res.writeHead(401).end('unauthorized'); return }

    if (req.url === '/v1/models') {
        const ids = new Set()
        for (const n of nodes) if (n.online) for (const m of n.models) ids.add(m)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ object: 'list', data: [...ids].map((id) => ({ id, object: 'model', owned_by: 'node-router' })) }))
        return
    }

    if (req.url === '/router/status') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
            sticky: Object.fromEntries(sticky),
            nodes: nodes.map((n) => ({
                name: n.name, online: n.online, models: [...n.models], allow: n.allow || null, inFlight: n.inFlight,
                served: n.served, prio: n.prio, lastErr: n.lastErr,
                seen: n.lastOk ? Math.round((Date.now() - n.lastOk) / 1000) + 's ago' : 'never',
            })),
        }, null, 1))
        return
    }

    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks)
    let model = null
    if (req.url.startsWith('/v1/chat/completions') || req.url.startsWith('/v1/completions')) {
        try { model = JSON.parse(body.toString()).model || null } catch {}
    }

    const tried = new Set()
    let node = pick(model)
    let lastErr = 'no node online'
    while (node && !tried.has(node.name)) {
        tried.add(node.name)
        try {
            const upstream = await forward(node, req, body)
            if (upstream.statusCode >= 500 && !upstream.headersSent) {
                upstream.resume()
                lastErr = `${node.name} -> HTTP ${upstream.statusCode}`
                node = candidates(model).find((c) => !tried.has(c.name))
                continue
            }
            node.served++
            const h = { ...upstream.headers }
            delete h['transfer-encoding']
            res.writeHead(upstream.statusCode, h)
            upstream.pipe(res)
            return
        } catch (e) {
            lastErr = `${node.name} -> ${e.message}`
            node = candidates(model).find((c) => !tried.has(c.name))
        }
    }
    const blocked = model ? nodes.filter((n) => n.online && n.models.has(model) && !allowed(n, model)).map((n) => n.name) : []
    res.writeHead(blocked.length || lastErr.startsWith('no node') ? 503 : 502)
    res.end(JSON.stringify({ error: { message: blocked.length
        ? `node-router: role map — ${model} is declared online by ${blocked.join(',')} but allowed on nobody`
        : `node-router: ${lastErr}`, tried: [...tried] } }))
}

const server = http.createServer((req, res) => {
    proxy(req, res).catch((e) => { try { res.writeHead(500).end(String(e.message)) } catch {} })
})
server.listen(PORT, '127.0.0.1', () => console.log(`node-router on :${PORT}, ${nodes.length} nodes`))
setInterval(() => {
    console.log(nodes.map((n) => `${n.name}:${n.online ? 'up' : 'down'}${n.inFlight ? ` b${n.inFlight}` : ''}${n.lastErr ? ` (${n.lastErr})` : ''}`).join(' '))
}, 60000)
