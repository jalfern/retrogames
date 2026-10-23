// ONLINE 2P RELAY (test twin) — plain Node/ws server speaking the EXACT
// worker.js protocol on top of relay/core.js. netcheck's browser tier points
// two headless Chrome Gauntlets at this instead of Cloudflare, so the wire
// protocol, caps and lifecycle are proven identically on every CI run — no
// network, no secrets. Run: `node relay/server.mjs [port]` (default 8787).

import { WebSocketServer } from 'ws'
import { CODE_RE, MAX_MSG, join, leave, relay, rosterOf, newRoom, newRegistry, registryAdd, registryRemove, registryCount } from './core.js'

export function startRelay(port = Number(process.env.PORT || 8787)) {
    const reg = newRegistry()
    const rooms = new Map()
    const wss = new WebSocketServer({ port })

    const roomFor = (code, cap) => {
        let r = rooms.get(code)
        if (!r) {
            r = { core: newRoom(code, cap), socks: new Map(), idle: null }
            rooms.set(code, r)
        }
        return r
    }

    const touch = (r) => {
        if (r.idle) clearTimeout(r.idle)
        r.idle = setTimeout(() => closeRoom(r), 90000)
        r.idle.unref?.()
    }

    const closeRoom = (r) => {
        const code = r.core.code
        if (process.env.RELAY_DEBUG) console.log('[relay] closeRoom', code)
        for (const ws of r.socks.values()) { try { ws.close(1000, 'room closed') } catch { /* gone */ } }
        r.socks.clear()
        rooms.delete(code)
        registryRemove(reg, code)
    }

    const broadcast = (r, obj) => {
        const text = JSON.stringify(obj)
        for (const ows of r.socks.values()) { try { ows.send(text) } catch { /* gone */ } }
    }

    wss.on('connection', (ws, req) => {
        const raw = req.url || ''
        const path = raw.split('?')[0]
        const m = path.match(/^\/room\/([A-Za-z0-9]{4})$/)
        if (!m) { ws.close(1002, 'use /room/CODE'); return }
        const code = m[1].toUpperCase()
        if (!CODE_RE.test(code)) { ws.close(1002, 'bad code'); return }
        if (!registryAdd(reg, code, Date.now())) { ws.close(1013, 'rooms full'); return }
        const capParam = Number(new URL(raw, 'ws://x').searchParams.get('cap')) || 0
        const r = roomFor(code, capParam > 0 ? capParam : undefined)
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        ws.__id = id
        ws.__code = code
        ws.isAlive = true
        ws.on('pong', () => { ws.isAlive = true })
        const res = join(r.core, id)
        if (!res.ok) { registryRemove(reg, code); ws.close(1013, 'room full'); return }
        r.socks.set(id, ws)
        touch(r)
        ws.send(JSON.stringify({ t: 'welcome', you: res.slot, cap: r.core.max }))
        broadcast(r, rosterOf(r.core))
        if (process.env.RELAY_DEBUG) console.log('[relay] join', code, id, 'slot', res.slot, 'peers', res.peers)
        if (res.peers === 2) {
            ws.send(JSON.stringify({ t: 'peer', n: 2 }))
            for (const [oid, ows] of r.socks) if (oid !== id) ows.send(JSON.stringify({ t: 'peer', n: 2 }))
        }
        ws.on('message', (buf) => {
            const text = buf.toString()
            if (text.length > MAX_MSG) { ws.close(1009, 'too big'); return }
            let obj = null
            try { obj = JSON.parse(text) } catch { ws.close(1007, 'bad json'); return }
            const out = relay(r.core, id, obj)
            if (!out.ok) {
                if (out.err === 'rate') for (const ows of r.socks.values()) { try { ows.close(1008, 'rate') } catch { /* gone */ } }
                return
            }
            touch(r)
            for (const [oid, ows] of r.socks) if (out.to.indexOf(oid) >= 0) ows.send(text)
        })
        const gone = () => {
            r.socks.delete(id)
            touch(r)
            if (leave(r.core, id).gone) { broadcast(r, rosterOf(r.core)); for (const ows of r.socks.values()) ows.send(JSON.stringify({ t: 'gone' })) }
            if (r.socks.size === 0) closeRoom(r)
        }
        ws.on('close', (c) => { if (process.env.RELAY_DEBUG) console.log('[relay] ws close', code, id, 'socks', r.socks.size, 'core', r.core.members.length); gone() })
        ws.on('error', () => { if (process.env.RELAY_DEBUG) console.log('[relay] ws error', code, id); gone() })
    })

    const hb = setInterval(() => {
        for (const ws of wss.clients) {
            if (!ws.isAlive) { try { ws.terminate() } catch { /* gone */ }; continue }
            ws.isAlive = false
            try { ws.ping() } catch { /* gone */ }
        }
    }, 30000)
    hb.unref?.()

    return {
        port,
        boundPort: () => { const a = wss.address(); return a ? a.port : 0 },
        rooms: () => rooms.size,
        codes: () => registryCount(reg),
        close: () => new Promise((done) => { clearInterval(hb); for (const r of rooms.values()) closeRoom(r); wss.close(done) }),
    }
}

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
    const p = Number(process.argv[2] || process.env.PORT || 8787)
    const s = startRelay(p)
    console.log(`retrogames relay (test twin) ws://127.0.0.1:${p}`)
    process.on('SIGTERM', () => s.close())
    process.on('SIGINT', () => s.close())
}
