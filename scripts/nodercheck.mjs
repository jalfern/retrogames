// NODERCHECK — the node router's contract, in Node, with fake fleets.
//
//   npm run nodercheck
//
// No real MLX, no real fleet: fake upstream nodes (models, streams,
// deaths — mutable, because the router reads its config once, so the only
// honest way to change a fleet mid-test is to change what the SAME nodes
// do) and the router on a scratch port, graded like every other check.
//
//   1. /v1/models is the union of what ONLINE nodes declared — a node
//      that stops answering LEAVES the union on the heartbeat (this is
//      how the MacBook Pro joins and leaves: lid shut, gone in <=1
//      heartbeat; no human, no restart, nothing else pays a timeout);
//   2. hot stickiness: consecutive same-model calls ride one node (no
//      model reload) until it is busy or gone;
//   3. a busy sticky node spills to the other holder; a model nobody
//      answers is a loud 503, never a hang;
//   4. honest failover: a 500 or a dropped socket BEFORE the client has
//      a single byte is replayed on the next candidate — the client sees
//      one 200 and one complete stream;
//   5. locked door: no token -> 401 everywhere;
//   6. per-node keys: each node receives ITS key, never the client's
//      router token.
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const TOKEN = 'rtest-token'
const ROUTER_PORT = 8310
const HB = 7000
const ok = []
const fail = []
const check = (name, cond, note = '') => {
    (cond ? ok : fail).push(name + (note ? ` (${note})` : ''))
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function fakeNode(port, st) {
    const seen = { auths: [], hits: 0 }
    const srv = http.createServer((req, res) => {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
            if (st.chatRefuse && req.url.startsWith('/v1/chat')) { req.socket.destroy(); return }
            seen.hits++
            seen.auths.push(req.headers.authorization)
            if (st.status500) { res.writeHead(500).end('boom'); return }
            if (req.url === '/v1/models') {
                res.writeHead(200, { 'content-type': 'application/json' })
                res.end(JSON.stringify({ object: 'list', data: st.models.map((id) => ({ id })) }))
                return
            }
            if (!st.models.includes(JSON.parse(body || '{}').model)) { res.writeHead(404).end('no model'); return }
            res.writeHead(200, { 'content-type': 'text/event-stream' })
            if (!st.streamMs) { res.end(`data: ${port}\n\nDONE\n\n`); return }
            res.write(`data: ${port}\n\n`)
            setTimeout(() => res.end('DONE\n\n'), st.streamMs)
        })
    })
    return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => resolve({ srv, seen, st, port })))
}

const req = (method, p, body, token = TOKEN) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const r = http.request({ host: '127.0.0.1', port: ROUTER_PORT, path: p, method,
        headers: { authorization: `Bearer ${token}`, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) } },
    (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ code: res.statusCode, body: b })) })
    r.on('error', reject)
    r.end(data)
})
const models = async () => (await req('GET', '/v1/models')).code === 200 ? JSON.parse((await req('GET', '/v1/models')).body).data.map((d) => d.id) : []
const chat = (model, token) => req('POST', '/v1/chat/completions', { model, messages: [{ role: 'user', content: 'x' }] }, token)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noderouter-test-'))
fs.writeFileSync(path.join(tmp, 'nodes.json'), JSON.stringify({
    token: TOKEN,
    nodes: [
        { name: 'flaky', url: 'http://127.0.0.1:8311', key: 'key-f', prio: 0, max: 1 },
        { name: 'a', url: 'http://127.0.0.1:8312', key: 'key-a', prio: 1, max: 1 },
        { name: 'b', url: 'http://127.0.0.1:8313', key: 'key-b', prio: 2, max: 2 },
        { name: 'mbp', url: 'http://127.0.0.1:8314', key: 'key-m', prio: 3, max: 2, dynamic: true },
    ],
}))

const F = await fakeNode(8311, { models: ['flaky', 'shared'], streamMs: 700 })
const A = await fakeNode(8312, { models: ['alpha', 'shared'], streamMs: 700 })
const B = await fakeNode(8313, { models: ['shared', 'beta'], streamMs: 0 })

const router = spawn(process.execPath, ['scripts/node-router.mjs'], {
    env: { ...process.env, NODE_ROUTER_CFG: path.join(tmp, 'nodes.json'), NODE_ROUTER_PORT: String(ROUTER_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
})
let routerLog = ''
router.stdout.on('data', (d) => (routerLog += d))
router.stderr.on('data', (d) => (routerLog += d))
for (let i = 0; i < 60; i++) { const m = await models().catch(() => []); if (m.length >= 4) break; await sleep(200) }

check('the union of /v1/models is exactly what online nodes declared',
    JSON.stringify((await models()).sort()) === JSON.stringify(['alpha', 'beta', 'flaky', 'shared']),
    (await models()).join(','))

check('an unreachable node is not in the union (the MBP-not-awake case)',
    !(await models()).includes('mbp-model'))

check('no token is a 401 on the door', (await chat('shared', 'wrong')).code === 401)

const r1 = await chat('shared')
const r2 = await chat('shared')
check('hot stickiness: consecutive same-model calls ride ONE node',
    r1.body === r2.body && r1.body.includes('8311'), `flaky hits=${F.seen.hits}`)

check('per-node keys: nodes get THEIR key, never the client token',
    F.seen.auths.length > 0 && F.seen.auths.every((x) => x === 'Bearer key-f'), F.seen.auths[0])

const held = chat('shared')
await sleep(120)
const spilled = await chat('shared')
await held
check('a busy sticky node spills to the OTHER holder of the model',
    !spilled.body.includes('8311') && spilled.body.includes('8312'), `second landed on: ${spilled.body.split('\n')[0]}`)

const nope = await chat('nobody-has-me')
check('a model nobody answers is a loud 503, not a hang', nope.code === 503, (nope.body || '').slice(0, 60))

check('the status endpoint prints the live map', (await req('GET', '/router/status')).body.includes('"nodes"'))

F.st.status500 = true
const r500 = await chat('shared')
check('a 500 BEFORE any byte is replayed on the next candidate',
    r500.code === 200 && r500.body.includes('8312'), `client saw: ${r500.code}`)
F.st.status500 = false

F.st.chatRefuse = true
const rRef = await chat('shared')
F.st.chatRefuse = false
check('a dropped socket BEFORE any byte is replayed too (full stream intact)',
    rRef.code === 200 && rRef.body.includes('DONE') && !rRef.body.includes('8311'), rRef.code)

F.srv.close()
await sleep(HB)
const union2 = await models()
check('a node going DARK leaves the union within one heartbeat (lid-close)',
    !union2.includes('flaky') && union2.includes('beta'), union2.join(','))
const orphan = await chat('flaky')
check('its orphaned model fails loud, not silent', orphan.code === 503)

A.srv.close()
await sleep(HB)
const union3 = await models()
check('alpha rides the union out with its last host', !union3.includes('alpha') && union3.includes('beta'))

router.kill('SIGTERM')
await sleep(200)
console.log(`\nnodercheck: ${ok.length}/${ok.length + fail.length} checks passed${fail.length ? `  — ${fail.length} FAILED` : '  — OK'}`)
if (fail.length) { console.log('failed:', fail.join(' | ')); console.log(routerLog.slice(-800)) }
process.exit(fail.length ? 1 : 0)
