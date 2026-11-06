// ONLINE 2P RELAY (production) — Cloudflare Worker, one hibernating
// Durable Object per 4-letter room code. Forwards JSON pads between two
// browsers and nothing else. Logic lives in ./core.js (shared with the Node
// test relay); this file is only the Cloudflare plumbing: WS hibernation,
// classic DO storage for the rate window (JS memory does not survive
// hibernation — storage is read once per wake and written at most once
// per window per room), idle alarms and the global room cap via the
// Registry singleton DO.
// Served at https://retrogames.jalfern.workers.dev/room/<CODE> (wss).

import { DurableObject } from 'cloudflare:workers'
import { CODE_RE, MAX_MSG, IDLE_MS, RATE_WINDOW, ROOM_CAP_MAX, relay, validateFeedback, buildFeedbackIssue, corsHeaders, FB_SHOT_PLACEHOLDER, screenshotMarkdown, uploadScreenshot, SES_MAX_BODY, validateSessionEnvelope, sessionKey, sessionMeta, sessionRow } from './core.js'

const GH_API = 'https://api.github.com'

// #905: a captured screenshot must be VIEWABLE in the issue, not "attached" as a
// base64 blob nobody can open. #1222: the old path (issue-assets on
// uploads.github.com) is dead for server-side uploads — raw bodies get 400
// "Multipart form data required", canonical multipart gets 422 "Bad Size" at any
// size. Release assets take raw binary and a published release's download URL
// renders in issue markdown, so core.uploadScreenshot rides the persistent
// `feedback-assets` release. Every step is best-effort: a failed upload leaves an
// honest note in the body, and the report still files (note + replay are the
// load-bearing parts).
async function attachScreenshot(env, number, dataUrl, issueBody) {
    const up = await uploadScreenshot({
        apiUrl: GH_API,
        repo: env.GH_REPO,
        number,
        dataUrl,
        headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, 'user-agent': 'retrogames-relay' },
    })
    const markdown = up.url ? screenshotMarkdown(up.url) : screenshotMarkdown(null, up.status, up.err)
    try {
        await fetch(`${GH_API}/repos/${env.GH_REPO}/issues/${number}`, {
            method: 'PATCH',
            headers: {
                authorization: `Bearer ${env.GITHUB_TOKEN}`,
                'content-type': 'application/json',
                'user-agent': 'retrogames-relay',
            },
            body: JSON.stringify({ body: issueBody.replace(FB_SHOT_PLACEHOLDER, markdown) }),
        })
    } catch { /* issue stays filed with the honest note */ }
}

// CORS (#886): the button on jalfern.com fetches /status and POSTs /feedback
// cross-origin; every plain-HTTP answer here carries the allow headers (WS
// upgrades are exempt — WebSocket traffic is not CORS-gated).
const json = (obj, origin, status) => Response.json(obj, { status, headers: corsHeaders(origin) })

async function handleFeedback(req, env) {
    const origin = req.headers.get('origin')
    if (!env || !env.GITHUB_TOKEN || !env.GH_REPO) {
        return json({ ok: false, err: 'relay not configured' }, origin, 503)
    }
    let body
    try { body = await req.json() } catch { return json({ ok: false, err: 'bad json' }, origin, 400) }
    const v = validateFeedback(body)
    if (!v.ok) return json({ ok: false, err: v.err }, origin, 400)
    const isJon = !!(env.JON_KEY && typeof body.key === 'string' && body.key === env.JON_KEY)
    const issue = buildFeedbackIssue(body, isJon)
    try {
        const res = await fetch(`${GH_API}/repos/${env.GH_REPO}/issues`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${env.GITHUB_TOKEN}`,
                'user-agent': 'retrogames-relay',
            },
            body: JSON.stringify(issue),
        })
        if (!res.ok) return json({ ok: false, err: `github ${res.status}` }, origin, 502)
        const j = await res.json()
        if (j && j.number && body.screenshot) await attachScreenshot(env, j.number, body.screenshot, issue.body)
        return json({ ok: true, issue: j.html_url, labels: issue.labels }, origin, 200)
    } catch {
        return json({ ok: false, err: 'github unreachable' }, origin, 502)
    }
}

// SESSION STORE (#1711) — private R2 behind this worker. Uploads carry a
// consent envelope that core.validateSessionEnvelope refuses without; the
// bucket itself is never public (reads only through these routes). Until the
// bucket + binding exist, /status reports sessions:false and every route
// answers an honest 503 (capability gate, #737 pattern).
async function handleSessionUpload(req, env, origin) {
    if (!env || !env.SESSIONS) return json({ ok: false, err: 'store not configured' }, origin, 503)
    const len = Number(req.headers.get('content-length') || 0)
    if (len > SES_MAX_BODY) return json({ ok: false, err: 'too big' }, origin, 413)
    let body
    try { body = await req.json() } catch { return json({ ok: false, err: 'bad json' }, origin, 400) }
    const v = validateSessionEnvelope(body)
    if (!v.ok) return json({ ok: false, err: v.err }, origin, 400)
    const stamp = new Date().toISOString()
    const key = sessionKey(body.recording, stamp, crypto.randomUUID().replace(/-/g, ''))
    const meta = sessionMeta(body.recording, body.player)
    meta.uploadedAt = stamp
    await env.SESSIONS.put(key, JSON.stringify(body.recording), { httpMetadata: { contentType: 'application/json' }, customMetadata: meta })
    return json({ ok: true, key }, origin, 200)
}

async function handleSessionList(req, env, origin) {
    if (!env || !env.SESSIONS) return json({ ok: false, err: 'store not configured' }, origin, 503)
    const limit = Math.max(1, Math.min(200, Number(new URL(req.url).searchParams.get('limit')) || 50))
    const listed = await env.SESSIONS.list({ limit })
    const sessions = []
    for (const o of listed.objects) {
        const head = await env.SESSIONS.head(o.key)
        sessions.push(sessionRow(o.key, head && head.customMetadata, o.uploaded ? o.uploaded.toISOString() : ''))
    }
    return json({ ok: true, sessions }, origin, 200)
}

async function handleSessionGet(env, origin, pathname) {
    if (!env || !env.SESSIONS) return json({ ok: false, err: 'store not configured' }, origin, 503)
    const key = decodeURIComponent(pathname.slice('/sessions/'.length))
    if (!/^[a-z0-9][a-z0-9-]{0,40}\/[0-9-]{10}-seed\d+-[a-f0-9]{10}\.json$/.test(key)) return json({ ok: false, err: 'bad key' }, origin, 400)
    const obj = await env.SESSIONS.get(key)
    if (!obj) return json({ ok: false, err: 'not found' }, origin, 404)
    return new Response(obj.body, { headers: { 'content-type': 'application/json', ...corsHeaders(origin) } })
}

export class Registry extends DurableObject {
    async tryAdd(code) {
        const now = Date.now()
        const rooms = (await this.ctx.storage.get('rooms')) || {}
        if (rooms[code]) return true
        const live = Object.keys(rooms)
        if (live.length >= 120) {
            for (const c of live) if (now - rooms[c] > 3600000) delete rooms[c]
            if (Object.keys(rooms).length >= 120) return false
        }
        rooms[code] = now
        await this.ctx.storage.put('rooms', rooms)
        return true
    }

    async remove(code) {
        const rooms = (await this.ctx.storage.get('rooms')) || {}
        delete rooms[code]
        await this.ctx.storage.put('rooms', rooms)
        return true
    }

    async count() {
        return Object.keys((await this.ctx.storage.get('rooms')) || {}).length
    }
}

export class Room extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env)
        this.rate = 0
        this.win = 0
        this.code = null
        this.cap = 2
    }

    rosterText(socks) {
        const slots = socks.map((s) => (s.deserializeAttachment() || {}).slot | 0).sort((a, b) => a - b)
        return JSON.stringify({ t: 'roster', n: slots.length, cap: this.cap, slots })
    }

    async fetch(req) {
        const url = new URL(req.url)
        const code = url.pathname.split('/').pop()
        if (!CODE_RE.test(code)) return new Response('bad code', { status: 400 })
        if (req.headers.get('upgrade') !== 'websocket') {
            return Response.json({ code, members: this.ctx.getWebSockets().length })
        }
        const existing = this.ctx.getWebSockets()
        const storedCap = await this.ctx.storage.get('cap')
        this.cap = storedCap && storedCap.cap ? storedCap.cap : (Number(url.searchParams.get('cap')) || 2)
        this.cap = Math.max(1, Math.min(ROOM_CAP_MAX, this.cap))
        if (existing.length >= this.cap) return new Response('full', { status: 503 })
        const id = crypto.randomUUID()
        const slot = existing.length
        this.code = code
        this.rate = 0
        this.win = Date.now()
        const pair = new WebSocketPair()
        const [client, server] = Object.values(pair)
        server.serializeAttachment({ id, code, slot })
        this.ctx.acceptWebSocket(server, [code])
        server.send(JSON.stringify({ t: 'welcome', you: slot, cap: this.cap }))
        const all = this.ctx.getWebSockets()
        const roster = this.rosterText(all)
        for (const ws of all) { try { ws.send(roster) } catch { /* gone */ } }
        if (slot === 1) {
            server.send(JSON.stringify({ t: 'peer', n: 2 }))
            for (const ws of existing) { try { ws.send(JSON.stringify({ t: 'peer', n: 2 })) } catch { /* gone */ } }
        }
        await this.ctx.storage.put({ meta: { code }, cap: { cap: this.cap } })
        await this.ctx.storage.setAlarm(Date.now() + IDLE_MS)
        return new Response(null, { status: 101, webSocket: client })
    }

    async webSocketMessage(ws, msg) {
        if (typeof msg !== 'string' || msg.length > MAX_MSG) { ws.close(1009, 'too big'); return }
        const att = ws.deserializeAttachment() || {}
        let obj = null
        try { obj = JSON.parse(msg) } catch { ws.close(1007, 'bad json'); return }
        if (this.code !== att.code) {
            const meta = await this.ctx.storage.get('meta')
            this.code = meta ? meta.code : att.code
            const win = await this.ctx.storage.get('win')
            if (win && Date.now() - win < RATE_WINDOW) { this.win = win; this.rate = (await this.ctx.storage.get('rate')) || 0 }
            else { this.win = Date.now(); this.rate = 0 }
        }
        const socks = this.ctx.getWebSockets()
        const room = { code: att.code, members: socks.map((s) => { const a = s.deserializeAttachment() || {}; return { id: a.id } }), rate: this.rate, win: this.win }
        const res = relay(room, att.id, obj)
        this.rate = room.rate
        this.win = room.win
        if (!res.ok) {
            if (res.err === 'rate') this.closeAll('rate')
            return
        }
        if (this.rate <= 1 || Date.now() - this.win >= RATE_WINDOW) {
            this.ctx.waitUntil(this.ctx.storage.put({ win: this.win, rate: this.rate }))
        }
        for (const s of socks) {
            const a = s.deserializeAttachment() || {}
            if (res.to.indexOf(a.id) >= 0) s.send(msg)
        }
        this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + IDLE_MS))
    }

    webSocketClose(ws) { this.memberGone(ws) }
    webSocketError(ws) { this.memberGone(ws) }

    memberGone(ws) {
        const peers = this.ctx.getWebSockets().filter((s) => s !== ws)
        const gone = peers.length === 1
        for (const s of peers) {
            try { if (gone) s.send(JSON.stringify({ t: 'gone' })) } catch { /* peer gone too */ }
        }
        if (peers.length === 0) {
            this.ctx.waitUntil(this.release())
        } else {
            this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + IDLE_MS))
        }
    }

    async release() {
        const code = this.code
        for (const s of this.ctx.getWebSockets()) { try { s.close(1000, 'room closed') } catch { /* already */ } }
        await this.ctx.storage.deleteAll()
        const env = this.env
        if (code && env && env.REGISTRY) {
            const reg = env.REGISTRY.get(env.REGISTRY.idFromName('registry'))
            try { await reg.remove(code) } catch { /* best effort */ }
        }
    }

    closeAll(why) {
        for (const s of this.ctx.getWebSockets()) { try { s.close(1008, why) } catch { /* already */ } }
    }

    async alarm() {
        if (this.ctx.getWebSockets().length === 0) await this.release()
        else this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + IDLE_MS))
    }
}

export default {
    async fetch(req, env) {
        const url = new URL(req.url)
        const origin = req.headers.get('origin')
        // Browsers preflight the JSON POST (content-type is not a CORS-safelisted
        // value); answer OPTIONS for the HTTP endpoints, never for room upgrades.
        if (req.method === 'OPTIONS') {
            if (url.pathname === '/status' || url.pathname === '/feedback' || url.pathname === '/sessions' || url.pathname.startsWith('/sessions/')) {
                return new Response(null, { status: 204, headers: corsHeaders(origin) })
            }
            return new Response(null, { status: 405 })
        }
        if (req.method === 'POST' && url.pathname === '/feedback') return handleFeedback(req, env)
        if (req.method === 'POST' && url.pathname === '/sessions') return handleSessionUpload(req, env, origin)
        if (req.method === 'GET' && url.pathname === '/sessions') return handleSessionList(req, env, origin)
        if (req.method === 'GET' && url.pathname.startsWith('/sessions/')) return handleSessionGet(env, origin, url.pathname)
        if (url.pathname === '/' || url.pathname === '/status') {
            let rooms = -1
            try { rooms = await env.REGISTRY.get(env.REGISTRY.idFromName('registry')).count() } catch { /* probe anyway */ }
            // Capability flag (#737): the in-game FEEDBACK button stays hidden until
            // the relay can actually file (deploy + GH secret present), so a PR that
            // ships the client before Jon's deploy never shows a button that 503s.
            // jonKey (#737 follow-up): presence-only boolean — "the secrets should be
            // deployed" must be checkable with one curl, without leaking the key.
            const feedback = !!(env.GITHUB_TOKEN && env.GH_REPO)
            // sessions (#1711): R2 store bound? Clients hide upload affordances until true.
            return json({ ok: true, service: 'retrogames-relay', rooms, feedback, jonKey: !!env.JON_KEY, sessions: !!(env.SESSIONS && env.SESSIONS.put) }, origin, 200)
        }
        const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{4})$/)
        if (!m) return new Response('use /room/CODE', { status: 400 })
        const code = m[1].toUpperCase()
        if (!CODE_RE.test(code)) return Response.json({ err: 'bad code' }, { status: 400 })
        if (req.headers.get('upgrade') !== 'websocket') return Response.json({ code, valid: true })
        const reg = env.REGISTRY.get(env.REGISTRY.idFromName('registry'))
        if (!(await reg.tryAdd(code))) return Response.json({ err: 'rooms full' }, { status: 503 })
        const stub = env.ROOM.get(env.ROOM.idFromName(code))
        return stub.fetch(new Request(url.toString(), { headers: req.headers, cf: req.cf }))
    },
}
