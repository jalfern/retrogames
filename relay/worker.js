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
import { CODE_RE, MAX_MSG, IDLE_MS, RATE_WINDOW, relay } from './core.js'

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
    }

    async fetch(req) {
        const url = new URL(req.url)
        const code = url.pathname.split('/').pop()
        if (!CODE_RE.test(code)) return new Response('bad code', { status: 400 })
        if (req.headers.get('upgrade') !== 'websocket') {
            return Response.json({ code, members: this.ctx.getWebSockets().length })
        }
        const existing = this.ctx.getWebSockets()
        if (existing.length >= 2) return new Response('full', { status: 503 })
        const id = crypto.randomUUID()
        const slot = existing.length
        this.code = code
        this.rate = 0
        this.win = Date.now()
        const pair = new WebSocketPair()
        const [client, server] = Object.values(pair)
        server.serializeAttachment({ id, code })
        this.ctx.acceptWebSocket(server, [code])
        server.send(JSON.stringify({ t: 'welcome', you: slot }))
        if (slot === 1) {
            server.send(JSON.stringify({ t: 'peer', n: 2 }))
            for (const ws of existing) ws.send(JSON.stringify({ t: 'peer', n: 2 }))
        }
        await this.ctx.storage.put('meta', { code })
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
        if (url.pathname === '/' || url.pathname === '/status') {
            let rooms = -1
            try { rooms = await env.REGISTRY.get(env.REGISTRY.idFromName('registry')).count() } catch { /* probe anyway */ }
            return Response.json({ ok: true, service: 'retrogames-relay', rooms })
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
