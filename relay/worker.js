// ONLINE 2P RELAY (production) — Cloudflare Worker, one hibernating SQLite
// Durable Object per 4-letter room code. Forwards JSON pads between two
// browsers and nothing else. Logic lives in ./core.js (shared with the Node
// test relay); this file is only the Cloudflare plumbing: WS hibernation,
// SQL-backed rate state (JS memory does not survive hibernation), idle
// alarms and the global room cap via the Registry singleton DO.
// Served at https://retrogames.jalfern.workers.dev/room/<CODE> (wss).

import { CODE_RE, MAX_MSG, IDLE_MS, relay, registryRemove } from './core.js'

export class Registry extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env)
        this.sql.exec('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, at INTEGER)')
    }

    tryAdd(code) {
        if (this.sql.exec('SELECT code FROM rooms WHERE code = ?', code).toArray().length) return true
        const n = this.sql.exec('SELECT COUNT(*) AS n FROM rooms').toArray()[0].n
        if (n >= 120) {
            this.sql.exec('DELETE FROM rooms WHERE at < ?', Date.now() - 3600000)
            const n2 = this.sql.exec('SELECT COUNT(*) AS n FROM rooms').toArray()[0].n
            if (n2 >= 120) return false
        }
        this.sql.exec('INSERT OR REPLACE INTO rooms (code, at) VALUES (?, ?)', code, Date.now())
        return true
    }

    remove(code) {
        this.sql.exec('DELETE FROM rooms WHERE code = ?', code)
        return true
    }

    count() {
        return this.sql.exec('SELECT COUNT(*) AS n FROM rooms').toArray()[0].n
    }
}

export class Room extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env)
        this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k INTEGER PRIMARY KEY, rate INTEGER, win INTEGER, code TEXT)')
    }

    code() {
        const row = this.sql.exec('SELECT code FROM meta WHERE k = 1').toArray()[0]
        return row ? row.code : null
    }

    async fetch(req) {
        const url = new URL(req.url)
        const code = url.pathname.split('/').pop()
        if (!CODE_RE.test(code)) return new Response('bad code', { status: 400 })
        if (req.headers.get('upgrade') !== 'websocket') {
            const live = this.ctx.getWebSockets().length
            return Response.json({ code, members: live })
        }
        const existing = this.ctx.getWebSockets()
        const slot = existing.length
        this.sql.exec('INSERT OR REPLACE INTO meta (k, rate, win, code) VALUES (1, 0, 0, ?)', code)
        if (slot >= 2) return new Response('full', { status: 503 })
        const id = crypto.randomUUID()
        const pair = new WebSocketPair()
        const [client, server] = Object.values(pair)
        server.serializeAttachment({ id, code })
        this.ctx.acceptWebSocket(server, [code])
        server.send(JSON.stringify({ t: 'welcome', you: slot }))
        for (const ws of existing) ws.send(JSON.stringify({ t: 'peer', n: 2 }))
        if (slot === 1) server.send(JSON.stringify({ t: 'peer', n: 2 }))
        this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + IDLE_MS))
        return new Response(null, { status: 101, webSocket: client })
    }

    webSocketMessage(ws, msg) {
        if (typeof msg !== 'string' || msg.length > MAX_MSG) { ws.close(1009, 'too big'); return }
        const att = ws.deserializeAttachment() || {}
        let obj = null
        try { obj = JSON.parse(msg) } catch { ws.close(1007, 'bad json'); return }
        const socks = this.ctx.getWebSockets()
        const room = { code: att.code, members: socks.map((s) => { const a = s.deserializeAttachment() || {}; return { id: a.id, slot: a.slot } }) }
        for (const s of socks) {
            const a = s.deserializeAttachment() || {}
            if (a.id === att.id) { s.serializeAttachment(a); continue }
            s.serializeAttachment(a)
        }
        room.rate = 0
        room.win = 0
        const row = this.sql.exec('SELECT rate, win FROM meta WHERE k = 1').toArray()[0]
        if (row) { room.rate = row.rate; room.win = row.win }
        const res = relay(room, att.id, obj)
        if (!res.ok) {
            if (res.err === 'rate') { this.closeAll('rate'); return }
            return
        }
        this.sql.exec('INSERT OR REPLACE INTO meta (k, rate, win, code) VALUES (1, ?, ?, ?)', room.rate, room.win, att.code)
        for (const s of socks) {
            const a = s.deserializeAttachment() || {}
            if (res.to.indexOf(a.id) >= 0) s.send(msg)
        }
        this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + IDLE_MS))
    }

    webSocketClose(ws) { this.memberGone(ws) }
    webSocketError(ws) { this.memberGone(ws) }

    memberGone(ws) {
        const att = ws.deserializeAttachment() || {}
        this.sql.exec('DELETE FROM meta WHERE k = 1')
        const socks = this.ctx.getWebSockets()
        const ids = socks.map((s) => ((s.deserializeAttachment() || {}).id))
        const gone = ids.length === 1
        for (const s of socks) {
            const a = s.deserializeAttachment() || {}
            if (a.id !== att.id) { s.serializeAttachment(a); if (gone) s.send(JSON.stringify({ t: 'gone' })) }
        }
        if (socks.length === 0) {
            this.ctx.waitUntil(this.release())
        } else {
            this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + IDLE_MS))
        }
    }

    async release() {
        const code = this.code()
        for (const s of this.ctx.getWebSockets()) s.close(1000, 'room closed')
        this.sql.exec('DELETE FROM meta')
        const env = this.env
        if (code && env && env.REGISTRY) {
            const reg = env.REGISTRY.get(env.REGISTRY.idFromName('registry'))
            try { await reg.remove(code) } catch { /* best effort */ }
        }
        await this.ctx.storage.deleteAll()
    }

    closeAll(why) {
        for (const s of this.ctx.getWebSockets()) s.close(1008, why)
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
