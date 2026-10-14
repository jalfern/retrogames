// NODERCHECK — the node router's contract, in Node, with fake fleets.
//
//   npm run nodercheck        (~15s; deliberately NOT a static-CI gate —
//   a 35s browser-free script must not tax every game PR; run it when the
//   router or its config changes)
//
// No real MLX, no real fleet: fake upstream nodes (models, streams,
// deaths — mutable, because the router reads its config once, so the only
// honest way to change a fleet mid-test is to change what the SAME nodes
// do) and the router on a scratch port, graded like every other check.
//
//   1. ROLE MAP — /v1/models is the catalog a node CAN load, not what it
//      serves: the Studio declares QA's 27B, and prio alone would load it
//      there and re-create the Oct 11 memory-guard crash. So the fake
//      fleet is the real one by role: studio-like (Flash + the FORBIDDEN
//      27B it really declares) vs mini-like vs a laptop that is asleep.
//      QA's model must NEVER touch the studio node, and must 503 LOUDLY
//      (naming the role map) when its allowed hosts are down — a silent
//      fall-through to the Studio is the worst bug this file exists to
//      catch;
//   2. join/leave: a node that stops answering LEAVES the union on the
//      heartbeat (lid-shut MacBook Pro; nothing else pays a timeout);
//   3. hot stickiness: consecutive same-model calls ride one node until
//      it is busy or gone;
//   4. a busy sticky node spills to the other ALLOWED holder; a model
//      nobody may answer is a loud 503, never a hang;
//   5. honest failover: a 500 or a dropped socket BEFORE the client has
//      a single byte is replayed on the next allowed candidate — the
//      client sees one 200 and one complete stream;
//   6. locked door: no token -> 401 everywhere;
//   7. per-node keys: each node receives ITS key, never the client's
//      router token.
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const TOKEN = 'rtest-token'
const ROUTER_PORT = 8310
const HB = 1200
const SLEEP = HB + 500
const ok = []
const fail = []
const check = (name, cond, note = '') => {
    (cond ? ok : fail).push(name + (note ? ` (${note})` : ''))
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function fakeNode(port, st) {
    const seen = { auths: [], hits: 0, chats: 0 }
    const srv = http.createServer((req, res) => {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
            if (st.chatRefuse && req.url.startsWith('/v1/chat')) { req.socket.destroy(); return }
            seen.hits++
            if (req.url.startsWith('/v1/chat')) seen.chats++
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
const models = async () => { const r = await req('GET', '/v1/models'); return r.code === 200 ? JSON.parse(r.body).data.map((d) => d.id) : [] }
const chat = (model, token) => req('POST', '/v1/chat/completions', { model, messages: [{ role: 'user', content: 'x' }] }, token)

const QA = 'Qwen3.8-27B-oQ4e-mtp'
const FLASH = 'Qwen3.8-Flash-Next-oQ5e'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noderouter-test-'))
fs.writeFileSync(path.join(tmp, 'nodes.json'), JSON.stringify({
    token: TOKEN,
    nodes: [
        { name: 'laptop', url: 'http://127.0.0.1:8311', key: 'key-f', prio: 0, max: 1, allow: ['27B'] },
        { name: 'studio', url: 'http://127.0.0.1:8312', key: 'key-s', prio: 1, max: 1, allow: ['Flash', 'gemma'] },
        { name: 'mini', url: 'http://127.0.0.1:8313', key: 'key-m', prio: 2, max: 2, allow: ['27B'] },
        { name: 'mbp', url: 'http://127.0.0.1:8314', key: 'key-b', prio: 3, max: 2, dynamic: true, allow: ['27B'] },
    ],
}))

const F = await fakeNode(8311, { models: [QA], streamMs: 700 })
const S = await fakeNode(8312, { models: [FLASH, QA, 'gemma-4', 'DeepSeek-V4'], streamMs: 0 })
const M = await fakeNode(8313, { models: [QA], streamMs: 0 })

const router = spawn(process.execPath, ['scripts/node-router.mjs'], {
    env: { ...process.env, NODE_ROUTER_CFG: path.join(tmp, 'nodes.json'), NODE_ROUTER_PORT: String(ROUTER_PORT), NODE_ROUTER_HB: String(HB) },
    stdio: ['ignore', 'pipe', 'pipe'],
})
let routerLog = ''
router.stdout.on('data', (d) => (routerLog += d))
router.stderr.on('data', (d) => (routerLog += d))
for (let i = 0; i < 60; i++) { const m = await models().catch(() => []); if (m.length >= 3) break; await sleep(150) }

check('the union of /v1/models is exactly what online nodes declared',
    JSON.stringify((await models()).sort()) === JSON.stringify([QA, FLASH, 'gemma-4', 'DeepSeek-V4'].sort()),
    (await models()).join(','))

check('no token is a 401 on the door', (await chat(QA, 'wrong')).code === 401)

const r1 = await chat(QA)
const r2 = await chat(QA)
check(`hot stickiness: consecutive ${QA} calls ride ONE node`,
    r1.body === r2.body && r1.body.includes('8311'), `laptop hits=${F.seen.hits}`)
check('the FORBIDDEN 27B never touched the studio node (the Oct 11 crash)',
    S.seen.chats === 0, `studio CHAT hits: ${S.seen.chats} (its /models probes are fine)`)

const fl = await chat(FLASH)
check('Flash rides the Studio (allowed there, nowhere else)', fl.code === 200 && fl.body.includes('8312'))

const blocked = await chat('DeepSeek-V4')
check('a model the Studio DECLARES but may not serve is a loud role-map 503, not a fall-through',
    blocked.code === 503 && blocked.body.includes('role map'), blocked.body.slice(0, 110))

check('per-node keys: nodes get THEIR key, never the client token',
    F.seen.auths.length > 0 && F.seen.auths.every((x) => x === 'Bearer key-f'), F.seen.auths[0])

const held = chat(QA)
await sleep(120)
const spilled = await chat(QA)
await held
check('a busy sticky node spills to the other ALLOWED holder (never the Studio)',
    spilled.body.includes('8313'), `second landed: ${spilled.body.split('\n')[0]}`)

check('the status endpoint prints the live map with allow-lists',
    (await req('GET', '/router/status')).body.includes('"allow"'))

F.st.status500 = true
const r500 = await chat(QA)
check('a 500 BEFORE any byte replays on the next ALLOWED candidate',
    r500.code === 200 && r500.body.includes('8313'), `client saw: ${r500.code}`)
F.st.status500 = false

F.st.chatRefuse = true
const rRef = await chat(QA)
F.st.chatRefuse = false
check('a dropped socket BEFORE any byte replays too (full stream intact)',
    rRef.code === 200 && rRef.body.includes('DONE') && !rRef.body.includes('8311'), rRef.code)

F.srv.close()
await sleep(SLEEP)
const alive = await chat(QA)
check('the laptop going dark mid-day just moves its model to the mini',
    alive.code === 200 && alive.body.includes('8313'))

S.st.status500 = false
M.srv.close()
await sleep(SLEEP)
const forbidden = await chat(QA)
check('ALL allowed hosts down: QA\'s 27B 503s naming the role map while the Studio DECLINES',
    forbidden.code === 503 && forbidden.body.includes('role map') && forbidden.body.includes('studio'),
    forbidden.body.slice(0, 130))

S.srv.close()
await sleep(SLEEP)
check('the union empties honestly when every node is dark', (await models()).length === 0)

router.kill('SIGTERM')
await sleep(200)
console.log(`\nnodercheck: ${ok.length}/${ok.length + fail.length} checks passed${fail.length ? `  — ${fail.length} FAILED` : '  — OK'}`)
if (fail.length) { console.log('failed:', fail.join(' | ')); console.log(routerLog.slice(-800)) }
process.exit(fail.length ? 1 : 0)
