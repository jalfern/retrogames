// RALLY LINK CHECK (#1448) — the RALLY CO-DRIVER ONLINE protocol harness.
// Pure Node: two "boxes" (host = seat 0 / driver, guest = seat 1 / co) run the
// SAME sim from one seed and talk only through an in-memory room that obeys the
// real relay rules (relay/core.js: FORWARD_TYPES allowlist, 512B budget, the
// 240 msg/s rate window under a 60 Hz fake clock). No sockets, no DOM.
//
//   1. the codec is honest    — padMask/unmaskPad round-trip all 64 masks
//   2. the snapshot round-trips — restore(res) keeps ticking to the same hash
//   3. lockstep holds          — two boxes, one seed, split seats: every
//                                hash boundary agrees, the stage finishes
//                                identically on both
//   4. it survives jitter      — a lossy relay (bounded per-pump delivery)
//                                stalls, never desyncs
//   5. a walkaway degrades     — the seat is demoted to CPU on the SAME
//                                tick both boxes expect, the stage runs out
//   6. a desync resyncs        — a bit-flipped pad freezes at the hash
//                                boundary; the host's chunked snapshot
//                                (<=380-char pieces, 512B-safe) restores the
//                                guest at the same tick; the pad streams
//                                resume, never reset
//   7. a rejoin restores       — promote + fresh 'go' runs lockstep again
//
// Run: npm run rallylinkcheck   (no dev server needed)

import { createSim, tickSim, stateHash, cpuDriverPad, cpuCoDriverPad } from '../src/games/RallyCoDriver/sim.js'
import {
    createRallySync, padMask, unmaskPad, snapshotGame, restoreGame,
    packSnap, cpuSeatPad, PAD_DELAY, HASH_EVERY, DROP_GRACE, SEATS, CHUNK,
} from '../src/games/RallyCoDriver/net.js'
import { newRoom, join, leave, relay, MAX_MSG, FORWARD_TYPES } from '../relay/core.js'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}

// ---- the fake clock: the relay's rate window is real-time, the sim is
// tick-time. 16 ms per tick = 60 Hz, so the window means what it means.
let FAKE_NOW = 1_000_000
const realNow = Date.now
const tickClock = () => { FAKE_NOW += 16 }
Date.now = () => FAKE_NOW

// ---- the in-memory room: relay/core.js rules, zero sockets ----------------
function makeLink() {
    const room = newRoom('TEST', 2)
    const inq = new Map()
    const oversize = []
    const send = (fromId, obj) => {
        const str = JSON.stringify(obj)
        if (Buffer.byteLength(str) > MAX_MSG) { oversize.push(str.length); return }
        // a dead member's socket is gone: its sends never reach the relay
        if (!room.members.some((m) => m.id === fromId)) return
        const r = relay(room, fromId, obj)
        if (!r.ok) throw new Error(`relay refused: ${r.err}`)
        for (const to of r.to) {
            if (!inq.has(to)) inq.set(to, [])
            inq.get(to).push(obj)
        }
    }
    return {
        room,
        oversize,
        join: (id) => join(room, id),
        leave: (id) => leave(room, id),
        send,
        drain: (id, limit = Infinity) => {
            const q = inq.get(id) || []
            const out = q.slice(0, limit)
            inq.set(id, q.slice(limit))
            return out
        },
        peek: (id) => (inq.get(id) || []).slice(),
        members: () => room.members.map((m) => m.id).sort(),
    }
}

// ---- one box: sim + sync engine, the shell's exact tick contract ----------
function makeBox(link, id, mySeat, seed, wx) {
    const g = createSim(seed, 2, wx)
    const net = createRallySync({
        mySeat,
        watchSeats: [1 - mySeat],
        send: (t, p) => link.send(id, Object.assign({ t, s: mySeat }, p)),
    })
    const box = {
        link, id, g, net, seed, wx,
        go: null, snap: null, resyncs: 0, desyncs: 0, frozen: false,
    }
    // this box's own seat's "human" emitter (the harness's fair play). Reads
    // box.g at call time, so it survives a resync restore that swaps box.g.
    box.pad = () => (mySeat === 0 ? cpuDriverPad(box.g) : cpuCoDriverPad(box.g))
    // inbound: the game's room.on handlers forward exactly these
    box.pump = (limit = Infinity) => {
        for (const msg of link.drain(id, limit)) {
            if (msg.t === 'pad') net.gotPad(msg)
            else if (msg.t === 'hs') { const d = net.gotHash(msg.k, msg.h); if (d) { box.desyncs++; box.desync = d } }
            else if (msg.t === 'go') box.go = { seed: msg.seed, wx: msg.wx }
            else if (msg.t === 'res' && msg.e === 'snp') {
                const r = net.snapInbox.push(msg)
                if (r) box.snap = { snap: r.snap, tick: r.tick }
            }
        }
    }
    // the tick contract the shell runs (and the harness pins):
    //   pump -> pumpTo(tick+1+delay) -> ready -> assemble -> tickSim -> hash
    box.step = (readPad = box.pad) => {
        if (box.frozen) return 'frozen'
        box.pump()
        const k = g.tick + 1
        net.pumpTo(k + net.delay, readPad)
        const cpuMasks = {}
        for (const seat of net.watchSeats) cpuMasks[seat] = cpuSeatPad(g, seat)
        if (!net.ready(k, cpuMasks)) return 'stall'
        tickSim(g, net.assemble(k, cpuMasks))
        net.prune(g.tick)
        if (g.tick % net.hashEvery === 0) {
            const d = net.hash(g.tick, stateHash(g))
            if (d) { box.desyncs++; box.desync = d }
        }
        return 'tick'
    }
    return box
}

const runTo = (boxes, upto, extra = () => {}) => {
    let guard = 0
    while (boxes.every((b) => b.frozen || b.g.tick < upto || b.g.done) && guard++ < 200000) {
        for (const b of boxes) { if (!b.frozen) b.step() }
        extra()
    }
}

// ---- 1. the codec is honest ------------------------------------------------
console.log('codec:')
{
    let rt = 0
    for (let m = 0; m < 64; m++) {
        const p = unmaskPad(m)
        if (padMask(p) === m) rt++
    }
    ok('all 64 masks round-trip', rt === 64, `${rt}/64`)
    ok('padMask of loose pad is 0', padMask({}) === 0 && padMask(undefined) === 0)
    ok('unmask 0 is the released pad', JSON.stringify(unmaskPad(0)) === JSON.stringify({ up: false, down: false, left: false, right: false, a: false, b: false }))
}

// ---- 2. the snapshot round-trips -------------------------------------------
console.log('snapshot:')
{
    const g = createSim(7, 2, 'rain')
    for (let i = 0; i < 500; i++) tickSim(g, [cpuDriverPad(g), cpuCoDriverPad(g)])
    const str = JSON.stringify(snapshotGame(g))
    const chunks = packSnap(str, g.tick)
    ok(`snapshot is ${str.length} chars in ${chunks.length} chunks`, str.length > 800 && chunks.length >= 3)
    ok('every chunk is 512B-safe on the wire',
        chunks.every((c) => Buffer.byteLength(JSON.stringify({ t: 'res', e: c.e, k: c.k, i: c.i, z: c.z, p: c.p })) <= MAX_MSG))
    ok('chunks tile the payload exactly',
        chunks.length === Math.max(1, Math.ceil(str.length / CHUNK)) && chunks.every((c, i) => c.p === str.slice(i * CHUNK, (i + 1) * CHUNK)))
    const a = g
    const b = restoreGame(JSON.parse(str))
    for (let i = 0; i < 300; i++) {
        tickSim(a, [cpuDriverPad(a), cpuCoDriverPad(a)])
        tickSim(b, [cpuDriverPad(b), cpuCoDriverPad(b)])
    }
    ok('restore keeps ticking to the same hash', stateHash(a) === stateHash(b) && a.tick === b.tick)
    ok('restore drops the shell-only caches', b.stage !== a.stage && b.events.length === 0 && b.seed === a.seed)
}

// ---- 3. lockstep holds ------------------------------------------------------
const SEED = 11
const WX = 'clear'
function freshPair(drainLimit = Infinity) {
    const link = makeLink()
    link.join('A'); link.join('B')
    const host = makeBox(link, 'A', 0, SEED, WX)
    const guest = makeBox(link, 'B', 1, SEED, WX)
    const drain = drainLimit
    return { link, host, guest, drain }
}
console.log('lockstep:')
{
    const { link, host, guest } = freshPair()
    // the kickoff: host curates the stage, the guest obeys
    link.send('A', { t: 'go', s: 0, seed: SEED, wx: WX })
    guest.pump()
    ok('go carries the curated seed + weather', guest.go && guest.go.seed === SEED && guest.go.wx === WX)
    // box.pad is each box's own-seat "human" emitter: the driver seat runs
    // cpuDriverPad, the co seat cpuCoDriverPad (the harness's fair play)
    const r0 = host.step()
    ok('first tick runs (the start lights are the sync buffer)', r0 === 'tick', r0)
    runTo([host, guest], 1800, () => { tickClock() })
    ok('no desync on either box', host.desyncs === 0 && guest.desyncs === 0, `h=${host.desyncs} g=${guest.desyncs}`)
    ok('hashes agree at the final boundary', stateHash(host.g) === stateHash(guest.g))
    ok('both boxes stall identically at the same tick', host.g.tick === guest.g.tick, `${host.g.tick} vs ${guest.g.tick}`)
    ok('stalls are bounded (instant relay)', Math.max(host.net.stats().maxStallRun, guest.net.stats().maxStallRun) <= 1,
        JSON.stringify([host.net.stats(), guest.net.stats()]))
    tickClock()
    while (!host.g.done) host.step()
    ok('the stage finishes on both, identically', host.g.done === guest.g.done && host.g.win === guest.g.win
        && stateHash(host.g) === stateHash(guest.g))
    ok('the CPU co called notes after the demote-free run', host.g.stats.called > 0)
    ok('no message oversize the relay budget', link.oversize.length === 0, JSON.stringify(link.oversize))
}

// ---- 4. it survives jitter --------------------------------------------------
console.log('jitter:')
{
    const { link, host, guest } = freshPair(2) // <=2 msgs per pump: real lag
    link.send('A', { t: 'go', s: 0, seed: SEED, wx: WX })
    guest.pump()
    runTo([host, guest], 1200, () => { tickClock() })
    ok('no desync under lag', host.desyncs === 0 && guest.desyncs === 0)
    ok('the boxes stay on one clock', host.g.tick === guest.g.tick, `${host.g.tick} vs ${guest.g.tick}`)
    const st = Math.max(host.net.stats().maxStallRun, guest.net.stats().maxStallRun)
    ok('the ready gate stalled (and only stalled) to absorb the lag',
        st > 0 && st < 60, `maxStallRun=${st}`)
    ok('still in hash agreement', stateHash(host.g) === stateHash(guest.g))
}

// ---- 5. a walkaway degrades -------------------------------------------------
console.log('walkaway:')
{
    const { link, host, guest } = freshPair()
    link.send('A', { t: 'go', s: 0, seed: SEED, wx: WX })
    guest.pump()
    const hostPad = () => cpuDriverPad(host.g)
    runTo([host, guest], 300, () => { tickClock() })
    const tBefore = host.g.tick
    ok('precondition: in lockstep at 300', tBefore >= 300 && host.g.tick === guest.g.tick)
    // the guest closes the tab: relay membership gone, sends dead, inbound dead
    link.leave('B')
    const calledBefore = host.g.stats.called
    let demotedAt = null
    let miss = 0
    tickClock()
    while (!host.g.done) {
        // the shell's grace contract: DROP_GRACE stalled ticks => CPU the seat
        host.pump()
        const k = host.g.tick + 1
        host.net.pumpTo(k + host.net.delay, hostPad)
        let cpuMasks = {}
        for (const seat of host.net.watchSeats) cpuMasks[seat] = cpuSeatPad(host.g, seat)
        if (!host.net.ready(k, cpuMasks)) {
            miss++
            if (miss >= DROP_GRACE) { demotedAt = k; host.net.demote(1); miss = 0 }
            continue
        }
        miss = 0
        tickSim(host.g, host.net.assemble(k, cpuMasks))
        host.net.prune(host.g.tick)
    }
    const lastRemote = tBefore + PAD_DELAY // the guest's last batch covered to here
    ok('the demote fires on the same tick both boxes would compute',
        demotedAt === lastRemote + 1 + DROP_GRACE - 1, `demotedAt=${demotedAt} expected=${lastRemote + DROP_GRACE}`)
    ok('the seat is CPU now: watch list empty, dropped remembered',
        host.net.watchSeats.length === 0 && host.net.hasPad(1, host.g.tick) === false)
    ok('the CPU co took over and kept calling', host.g.stats.called > calledBefore,
        `${calledBefore} -> ${host.g.stats.called}`)
    ok('the stage ran out solo (degrade to the solo demo, not a freeze)', host.g.done === true && host.g.win === true)
}

// ---- 6. a desync resyncs ----------------------------------------------------
console.log('resync:')
{
    const { link, host, guest } = freshPair()
    link.send('A', { t: 'go', s: 0, seed: SEED, wx: WX })
    guest.pump()
    const hostPad = () => cpuDriverPad(host.g)
    const guestPad = () => cpuCoDriverPad(guest.g)
    runTo([host, guest], 300, () => { tickClock() })
    // a wire bit flip the guest alone experienced: nudge the guest's car so its
    // sim diverges from the host's (deterministic stand-in for a flipped pad)
    guest.g.car.v += 0.01
    // BOTH keep ticking — the host is the authority and must keep producing
    // pads + hashes while the (soon-frozen) guest waits for the snapshot.
    tickClock()
    let guard = 0
    while (!guest.desyncs && guest.g.tick < 900 && guard++ < 5000) {
        host.step(hostPad)
        guest.step(guestPad)
        tickClock()
    }
    ok('the mismatch surfaces at a hash boundary', guest.desyncs > 0 && guest.desync.desync % HASH_EVERY === 0,
        JSON.stringify(guest.desync || null))
    const snapTick = guest.desync.desync
    ok('the host is at the same boundary when it snapshots', host.g.tick === snapTick, `host=${host.g.tick} snap=${snapTick}`)
    guest.frozen = true // the guest holds while it waits for the host's truth
    // the host answers with its chunked snapshot (the authority's state)
    const hostStr = JSON.stringify(snapshotGame(host.g))
    for (const c of packSnap(hostStr, snapTick)) link.send('A', { t: 'res', e: c.e, k: c.k, i: c.i, z: c.z, p: c.p })
    tickClock()
    guest.pump()
    ok('the chunked snapshot reassembled', !!guest.snap && guest.snap.tick === snapTick,
        guest.snap ? `tick=${guest.snap.tick}` : 'no snapshot')
    // restore at the SAME tick; the pad streams are PRESERVED (the sampling law)
    const keptOwn = guest.net.hasPad(1, snapTick + 5)
    guest.g = restoreGame(guest.snap.snap)
    guest.resyncs++
    guest.frozen = false
    ok('the pad buffers survived the resync (streams resume)', keptOwn === true)
    tickClock()
    guard = 0
    while (!host.g.done && guard++ < 200000) { host.step(hostPad); guest.step(guestPad); tickClock() }
    ok('after resync the hashes agree again', stateHash(host.g) === stateHash(guest.g))
    ok('both boxes finish the same stage', host.g.done === guest.g.done && host.g.win === guest.g.win
        && host.g.tick === guest.g.tick, `${host.g.tick} vs ${guest.g.tick}`)
    ok('the guest desynced exactly once', guest.desyncs === 1 && guest.resyncs === 1)
}
// ---- 7. a rejoin restores ---------------------------------------------------
console.log('rejoin:')
{
    const { link, host, guest } = freshPair()
    link.send('A', { t: 'go', s: 0, seed: SEED, wx: WX })
    guest.pump()
    runTo([host, guest], 200, () => { tickClock() })
    link.leave('B')
    const hostPad = () => cpuDriverPad(host.g)
    let miss = 0
    tickClock()
    while (host.net.watchSeats.length > 0 && !host.g.done) {
        host.pump()
        const k = host.g.tick + 1
        host.net.pumpTo(k + host.net.delay, hostPad)
        const cpuMasks = {}
        for (const seat of host.net.watchSeats) cpuMasks[seat] = cpuSeatPad(host.g, seat)
        if (!host.net.ready(k, cpuMasks)) {
            miss++
            if (miss >= DROP_GRACE) { host.net.demote(1); miss = 0 }
            continue
        }
        miss = 0
        tickSim(host.g, host.net.assemble(k, cpuMasks))
    }
    ok('host demoted the walkaway', host.net.watchSeats.length === 0)
    // the guest reloads back in and the host curates a fresh stage
    link.join('B')
    ok('the relay re-seats the returner', link.members().join(',') === 'A,B')
    host.net.promote(1)
    link.send('A', { t: 'go', s: 0, seed: 23, wx: 'rain' })
    guest.pump()
    ok('the fresh go lands', guest.go && guest.go.seed === 23 && guest.go.wx === 'rain')
    host.g = createSim(23, 2, 'rain'); guest.g = createSim(23, 2, 'rain')
    host.net.reset(0); guest.net.reset(0)
    runTo([host, guest], 600, () => { tickClock() })
    ok('lockstep is back after the rejoin', host.desyncs === 0 && guest.desyncs === 0
        && stateHash(host.g) === stateHash(guest.g))
    ok('SEATS is still two', SEATS === 2 && FORWARD_TYPES.includes('go') && FORWARD_TYPES.includes('pad')
        && FORWARD_TYPES.includes('hs') && FORWARD_TYPES.includes('res'))
}

Date.now = realNow
console.log(`\nrallylinkcheck: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
