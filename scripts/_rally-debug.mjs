import { createSim, tickSim, stateHash, cpuDriverPad, cpuCoDriverPad } from '../src/games/RallyCoDriver/sim.js'
import { createRallySync, cpuSeatPad } from '../src/games/RallyCoDriver/net.js'
import { newRoom, join, relay, MAX_MSG } from '../relay/core.js'

let FAKE_NOW = 1_000_000
const realNow = Date.now
const tickClock = () => { FAKE_NOW += 16 }
Date.now = () => FAKE_NOW

const room = newRoom('TEST', 2)
const inq = new Map()
const send = (fromId, obj) => {
    const str = JSON.stringify(obj)
    if (Buffer.byteLength(str) > MAX_MSG) throw new Error('oversize')
    if (!room.members.some((m) => m.id === fromId)) return
    const r = relay(room, fromId, obj)
    if (!r.ok) throw new Error(`relay refused: ${r.err}`)
    for (const to of r.to) { if (!inq.has(to)) inq.set(to, []); inq.get(to).push(obj) }
}
join(room, 'A'); join(room, 'B')

function makeBox(id, mySeat, seed, wx) {
    const g = createSim(seed, 2, wx)
    const net = createRallySync({ mySeat, watchSeats: [1 - mySeat], send: (t, p) => send(id, Object.assign({ t, s: mySeat }, p)) })
    const box = { id, g, net, pad: () => (mySeat === 0 ? cpuDriverPad(g) : cpuCoDriverPad(g)) }
    box.pump = (limit = Infinity) => {
        const q = inq.get(id) || []
        const out = q.slice(0, limit); inq.set(id, q.slice(limit))
        for (const msg of out) {
            if (msg.t === 'pad') net.gotPad(msg)
            else if (msg.t === 'hs') net.gotHash(msg.k, msg.h)
        }
    }
    box.step = (readPad = box.pad) => {
        if (g.done) return 'done'
        box.pump()
        const k = g.tick + 1
        net.pumpTo(k + net.delay, readPad)
        const cpuMasks = {}
        for (const seat of net.watchSeats) cpuMasks[seat] = cpuSeatPad(g, seat)
        if (!net.ready(k, cpuMasks)) return 'stall'
        tickSim(g, net.assemble(k, cpuMasks))
        net.prune(g.tick)
        if (g.tick % net.hashEvery === 0) net.hash(g.tick, stateHash(g))
        return 'tick'
    }
    return box
}
const host = makeBox('A', 0, 11, 'clear')
const guest = makeBox('B', 1, 11, 'clear')
let first = null
let guard = 0
while (!host.g.done && !guest.g.done && guard++ < 100000) {
    host.step(); guest.step(); tickClock()
    const a = stateHash(host.g), b = stateHash(guest.g)
    if (a !== b && first == null) {
        first = { tick: host.g.tick, gtick: guest.g.tick, a, b }
        // dump the differing fields
        const ha = host.g, gb = guest.g
        const diff = []
        for (const key of Object.keys(ha)) {
            if (key === 'stage' || key === 'rng' || key === 'events' || key === 'w') continue
            if (key === 'car') {
                for (const f of Object.keys(ha.car)) if (String(ha.car[f]) !== String(gb.car[f])) diff.push(`car.${f}: ${ha.car[f]} vs ${gb.car[f]}`)
            } else if (key === 'co') {
                for (const f of Object.keys(ha.co)) if (String(ha.co[f]) !== String(gb.co[f]) && f !== 'called') diff.push(`co.${f}: ${ha.co[f]} vs ${gb.co[f]}`)
                const ca = ha.co.called, cb = gb.co.called
                for (let i = 0; i < ca.length; i++) if (String(ca[i]) !== String(cb[i])) { diff.push(`co.called[${i}]: ${ca[i]} vs ${cb[i]}`); if (diff.length > 12) break }
            } else if (key === 'card' || key === 'stats' || key === 'splits' || key === 'controlMs') {
                if (JSON.stringify(ha[key]) !== JSON.stringify(gb[key])) diff.push(`${key} differs`)
            } else if (String(ha[key]) !== String(gb[key])) diff.push(`${key}: ${ha[key]} vs ${gb[key]}`)
        }
        console.log('FIRST DIVERGENCE', JSON.stringify(first), 'diffs:', diff.slice(0, 12).join(' | '))
        // what pads did each box consume at this tick?
        break
    }
}
if (!first) console.log('no divergence, host done', host.g.done, 'guest done', guest.g.done, 'ticks', host.g.tick, guest.g.tick)
Date.now = realNow
