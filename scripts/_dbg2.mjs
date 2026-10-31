import { newRoom, join, leave, relay, rosterOf } from '../relay/core.js'
import { createRoom } from '../src/utils/room.js'
const rooms = new Map()
const hub = { refused: 0 }
hub.connect = (code, cap, id) => {
    let r = rooms.get(code)
    if (!r) { r = { core: newRoom(code, cap || 2), socks: new Map() }; rooms.set(code, r) }
    const inbox = []
    const out = {
        send(str) { console.log('SEND', id, str.slice(0, 60)); const res = relay(r.core, id, JSON.parse(str)); console.log('RELAY>', res); if (!res.ok) { hub.refused++; return } for (const pid of res.to) { const p = r.socks.get(pid); if (p) p.deliver(str) } },
        deliver(s) { inbox.push(s) }, onMessage(cb) { out.cb = cb }, onClose() {}, close() {},
        pump() { while (inbox.length) { const s = inbox.shift(); console.log('RECV>', id, s.slice(0, 60)); if (out.cb) out.cb(s) } },
    }
    r.socks.set(id, out)
    const j = join(r.core, id)
    out.deliver(JSON.stringify({ t: 'welcome', you: j.slot, cap: r.core.max }))
    for (const pid of r.socks.keys()) r.socks.get(pid).deliver(JSON.stringify(rosterOf(r.core)))
    return out
}
const mk = (id) => {
    const ws = { ref: null }
    const room = createRoom({ relay: 'ws://mem', makeTransport: (url) => { const code = url.split('/room/')[1].split('?')[0]; const cap = Number(new URL(url, 'ws://x').searchParams.get('cap')) || 0; ws.ref = hub.connect(code, cap, id); return ws.ref }, onPhase: (p) => console.log(id, 'phase', p) })
    room.on('go', (m) => console.log(id, 'GOT GO', JSON.stringify(m)))
    return { room, pump: () => ws.ref && ws.ref.pump() }
}
const h = mk('h'), g = mk('g')
h.room.connect('ABCD', 4)
for (let i = 0; i < 3; i++) { h.pump(); g.pump() }
g.room.connect('ABCD', 0)
for (let i = 0; i < 3; i++) { h.pump(); g.pump() }
console.log('roles', h.room.role, g.room.role, 'phases', h.room.phase, g.room.phase)
h.room.send('go', { seed: 4242 })
for (let i = 0; i < 3; i++) { h.pump(); g.pump() }
console.log('refused', hub.refused)
