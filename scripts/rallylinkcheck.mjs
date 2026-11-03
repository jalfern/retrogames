// RALLY LINK CHECK (#1448) — the RALLY CO-DRIVER ONLINE protocol harness.
// Pure Node: two "boxes" (host = seat 0 / driver, guest = seat 1 / co) run the
// SAME sim from one seed and talk only through an in-memory room that obeys the
// real relay rules (relay/core.js: FORWARD_TYPES allowlist, 512B budget, the
// 240 msg/s rate window under a 60 Hz fake clock). No sockets, no DOM.
//
//   1. the codec is honest    — padMask/unmaskPad round-trip all 64 masks
//   2. the snapshot round-trips — restore keeps ticking to the same hash
//   3. lockstep holds          — two boxes, one seed, split seats: every
//                                boundary hash agrees, the stage finishes
//                                identically on both
//   4. it survives jitter      — a laggy relay (one-way legs inside the
//                                11-tick pad lead) stalls, never desyncs
//   5. a walkaway degrades     — the seat is demoted to CPU after exactly
//                                DROP_GRACE stalled ticks, the stage runs out
//   6. a desync resyncs        — a diverged guest freezes at the hash
//                                boundary; the host's chunked snapshot
//                                (<=380-char pieces, 512B-safe) restores it
//                                at the same tick; the pad streams resume,
//                                never reset
//   7. a rejoin restores       — promote + fresh 'go' runs lockstep again
//
// The protocol's guarantee is about SIM TICKS, not wall time: the boxes may
// sit a tick or two apart in real time (that is what ready()/stall is for),
// so every agreement assertion compares the boundary hashes the two boxes
// recorded for the SAME tick — not their current state.
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
// latMs simulates the one-way relay leg (the SOS harness's hub.latMs model):
// a message sent at fake time T is deliverable only from T + latMs. 0 = instant.
function makeLink(latMs = 0) {
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
        const at = Date.now() + latMs
        for (const to of r.to) {
            if (!inq.has(to)) inq.set(to, [])
            inq.get(to).push({ m: obj, at })
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
            const out = []
            const rest = []
            for (const e of q) {
                if (out.length < limit && e.at <= Date.now()) out.push(e.m)
                else rest.push(e)
            }
            inq.set(id, rest)
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
        hashes: new Map(), // boundary tick -> whole-sim hash (the guarantee)
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
    // box.g, not a captured g: a resync swaps the sim object into box.g and
    // the pad streams must resume over the restored state (see test 6).
    box.step = (readPad = box.pad) => {
        if (box.frozen) return 'frozen'
        box.pump()
        const k = box.g.tick + 1
        net.pumpTo(k + net.delay, readPad)
        // CPU masks ONLY for seats that are not watched: a watched seat must
        // present its real wire pad for k or the box stalls — stalling (not
        // guessing a CPU pad) is the protocol's law under lag.
        const cpuMasks = {}
        for (let seat = 0; seat < SEATS; seat++) {
            if (net.watchSeats.indexOf(seat) < 0) cpuMasks[seat] = cpuSeatPad(box.g, seat)
        }
        if (!net.ready(k, cpuMasks)) return 'stall'
        tickSim(box.g, net.assemble(k, cpuMasks))
        net.prune(box.g.tick)
        if (box.g.tick % net.hashEvery === 0) {
            const h = stateHash(box.g)
            box.hashes.set(box.g.tick, h)
            const d = net.hash(box.g.tick, h)
            if (d) { box.desyncs++; box.desync = d }
        }
        return 'tick'
    }
    return box
}

// the largest boundary both boxes have ticked — the point of comparison
const commonBoundary = (a, b) => Math.floor(Math.min(a.g.tick, b.g.tick) / HASH_EVERY) * HASH_EVERY

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
    // 5000 ticks in: the snapshot carries a real S-split (state variety).
    // The sim's snapshot is ~0.5–0.7KB — over one 380-char chunk, under two
    // full stages' worth — so multi-chunk (2+) is the pin, not 3.
    const g = createSim(7, 2, 'rain')
    for (let i = 0; i < 5000; i++) tickSim(g, [cpuDriverPad(g), cpuCoDriverPad(g)])
    const str = JSON.stringify(snapshotGame(g))
    const chunks = packSnap(str, g.tick)
    ok(`snapshot spans multiple wire chunks (${str.length} chars in ${chunks.length})`,
        str.length > CHUNK && chunks.length >= 2)
    ok('every chunk is 512B-safe on the wire',
        chunks.every((c) => Buffer.byteLength(JSON.stringify({ t: 'res', e: c.e, k: c.k, i: c.i, z: c.z, p: c.p })) <= MAX_MSG))
    ok('chunks tile the payload exactly',
        chunks.length === Math.max(1, Math.ceil(str.length / CHUNK)) && chunks.every((c, i) => c.p === str.slice(i * CHUNK, (i + 1) * CHUNK)))
    const a = g
    const b = restoreGame(JSON.parse(str))
    ok('restore rebuilds the shell-only caches fresh',
        b.stage !== a.stage && b.events !== a.events && b.rng !== a.rng && b.seed === a.seed)
    for (let i = 0; i < 300; i++) {
        tickSim(a, [cpuDriverPad(a), cpuCoDriverPad(a)])
        tickSim(b, [cpuDriverPad(b), cpuCoDriverPad(b)])
    }
    ok('restore keeps ticking to the same hash', stateHash(a) === stateHash(b) && a.tick === b.tick)
}

// ---- 3. lockstep holds ------------------------------------------------------
const SEED = 11
const WX = 'clear'
function freshPair(latMs = 0) {
    const link = makeLink(latMs)
    link.join('A'); link.join('B')
    const host = makeBox(link, 'A', 0, SEED, WX)
    const guest = makeBox(link, 'B', 1, SEED, WX)
    return { link, host, guest }
}
console.log('lockstep:')
{
    const { link, host, guest } = freshPair()
    // the kickoff: host curates the stage, the guest obeys
    link.send('A', { t: 'go', s: 0, seed: SEED, wx: WX })
    guest.pump()
    ok('go carries the curated seed + weather', guest.go && guest.go.seed === SEED && guest.go.wx === WX)
    // box.pad is each box's own-seat "human" emitter: the driver seat runs
    // cpuDriverPad, the co seat cpuCoDriverPad (the harness's fair play).
    // The start lights are the sync buffer: step until both boxes have run
    // tick 1. One box may tick first — the other's first pad batch lands a
    // step later and the ready gate holds until it does (that hold is the
    // protocol, not a bug). The guarantee is about sim ticks, not wall time.
    let g1 = 0
    while ((host.g.tick < 1 || guest.g.tick < 1) && g1++ < 30) { host.step(); guest.step(); tickClock() }
    ok('first tick runs on both (the start lights are the sync buffer)',
        host.g.tick >= 1 && guest.g.tick >= 1, `${host.g.tick}/${guest.g.tick}`)
    let guard = 0
    while (!host.g.done && guard++ < 200000) { host.step(); guest.step(); tickClock() }
    ok('no desync on either box', host.desyncs === 0 && guest.desyncs === 0, `h=${host.desyncs} g=${guest.desyncs}`)
    const cb = commonBoundary(host, guest)
    ok(`every boundary hash agrees (last: ${cb})`, host.hashes.get(cb) !== undefined && guest.hashes.get(cb) !== undefined
        && host.hashes.get(cb) === guest.hashes.get(cb))
    ok('the stage finishes on both, at the same tick', host.g.done === true && guest.g.done === true
        && host.g.tick === guest.g.tick, `${host.g.tick} vs ${guest.g.tick}`)
    ok('stalls are bounded (instant relay)', Math.max(host.net.stats().maxStallRun, guest.net.stats().maxStallRun) <= 1,
        JSON.stringify([host.net.stats(), guest.net.stats()]))
    ok('the CPU co called notes', host.g.stats.called > 0, `called=${host.g.stats.called}`)
    ok('no message oversize the relay budget', link.oversize.length === 0, JSON.stringify(link.oversize))
}

// ---- 4. it survives jitter --------------------------------------------------
console.log('jitter:')
{
    // 128 ms = 8 ticks of one-way leg: INSIDE the 11-tick pad lead (the same
    // law SOS pins as "a 45ms leg stays inside the 10-tick pad lead"). The
    // initial burst still arrives late, so the ready gate stalls — and the
    // stall must be bounded by the lead, after which lockstep holds.
    const { link, host, guest } = freshPair(128)
    link.send('A', { t: 'go', s: 0, seed: SEED, wx: WX })
    tickClock()
    let guard = 0
    while (guest.g.tick < 1260 && guard++ < 200000) { host.step(); guest.step(); tickClock() }
    const cb = commonBoundary(host, guest)
    ok('no desync under lag', host.desyncs === 0 && guest.desyncs === 0, `h=${host.desyncs} g=${guest.desyncs}`)
    ok(`the boundary hashes still agree (last: ${cb})`, host.hashes.get(cb) === guest.hashes.get(cb) && host.hashes.get(cb) !== undefined)
    const st = Math.max(host.net.stats().maxStallRun, guest.net.stats().maxStallRun)
    ok('the ready gate stalled (and only stalled) to absorb the lag', st > 0 && st <= PAD_DELAY, `maxStallRun=${st}`)
}

// ---- 5. a walkaway degrades -------------------------------------------------
console.log('walkaway:')
{
    const { link, host, guest } = freshPair()
    link.send('A', { t: 'go', s: 0, seed: SEED, wx: WX })
    guest.pump()
    const hostPad = () => cpuDriverPad(host.g)
    tickClock()
    let guard = 0
    while (host.g.tick < 300 && guard++ < 200000) { host.step(); guest.step(); tickClock() }
    const tBefore = host.g.tick
    ok('precondition: both boxes at 300', tBefore >= 300 && guest.g.tick >= 300)
    // the guest closes the tab: relay membership gone, sends dead, inbound dead
    link.leave('B')
    const nextIdxBefore = host.g.co.nextIdx
    let demotedAt = null
    let demoteMiss = null
    let miss = 0
    guard = 0
    while (!host.g.done && guard++ < 200000) {
        // the shell's grace contract: DROP_GRACE stalled ticks => CPU the seat
        host.pump()
        const k = host.g.tick + 1
        host.net.pumpTo(k + host.net.delay, hostPad)
        // CPU masks only for seats ALREADY demoted (off the watch list) —
        // while a seat is watched it must present its real wire pad or stall.
        const cpuMasks = {}
        for (let seat = 0; seat < SEATS; seat++) {
            if (host.net.watchSeats.indexOf(seat) < 0) cpuMasks[seat] = cpuSeatPad(host.g, seat)
        }
        if (!host.net.ready(k, cpuMasks)) {
            miss++
            if (miss >= DROP_GRACE) { demotedAt = k; demoteMiss = miss; host.net.demote(1); miss = 0 }
            tickClock()
            continue
        }
        miss = 0
        tickSim(host.g, host.net.assemble(k, cpuMasks))
        host.net.prune(host.g.tick)
        tickClock()
    }
    // The guest's last batch covered to tBefore + PAD_DELAY. The host's first
    // missing tick is one past that; a stalled tick does NOT advance, so all
    // DROP_GRACE stalled ticks happen AT that same tick — the demote fires on
    // the 30th stall, at k = lastRemote + 1.
    const lastRemote = tBefore + PAD_DELAY
    ok('the demote fires after exactly DROP_GRACE stalled ticks',
        demotedAt === lastRemote + 1 && demoteMiss === DROP_GRACE,
        `demotedAt=${demotedAt} expected=${lastRemote + 1} miss=${demoteMiss}`)
    ok('the seat is CPU now: watch list empty', host.net.watchSeats.length === 0)
    ok('the CPU co took over and kept the note flow going', host.g.co.nextIdx > nextIdxBefore,
        `nextIdx ${nextIdxBefore} -> ${host.g.co.nextIdx}`)
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
    tickClock()
    let guard = 0
    while (host.g.tick < 300 && guard++ < 200000) { host.step(); guest.step(); tickClock() }
    // a wire bit flip the guest alone experienced: nudge the guest's car so
    // its sim diverges from the host's (a deterministic stand-in for it)
    guest.g.car.v += 0.01
    // BOTH keep ticking — the host is the authority and must keep producing
    // pads + hashes while the (soon-frozen) guest waits for the snapshot.
    guard = 0
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
    guard = 0
    while (!host.g.done && guard++ < 200000) { host.step(hostPad); guest.step(guestPad); tickClock() }
    ok('after resync the boundary hashes agree again', host.hashes.get(snapTick + HASH_EVERY) === guest.hashes.get(snapTick + HASH_EVERY)
        && host.hashes.get(snapTick + HASH_EVERY) !== undefined,
        `next=${snapTick + HASH_EVERY}`)
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
    tickClock()
    let guard = 0
    while (host.g.tick < 200 && guard++ < 200000) { host.step(); guest.step(); tickClock() }
    link.leave('B')
    const hostPad = () => cpuDriverPad(host.g)
    let miss = 0
    guard = 0
    while (host.net.watchSeats.length > 0 && !host.g.done && guard++ < 200000) {
        host.pump()
        const k = host.g.tick + 1
        host.net.pumpTo(k + host.net.delay, hostPad)
        // CPU masks only for seats ALREADY demoted (off the watch list) —
        // while a seat is watched it must present its real wire pad or stall.
        const cpuMasks = {}
        for (let seat = 0; seat < SEATS; seat++) {
            if (host.net.watchSeats.indexOf(seat) < 0) cpuMasks[seat] = cpuSeatPad(host.g, seat)
        }
        if (!host.net.ready(k, cpuMasks)) {
            miss++
            if (miss >= DROP_GRACE) { host.net.demote(1); miss = 0 }
            tickClock()
            continue
        }
        miss = 0
        tickSim(host.g, host.net.assemble(k, cpuMasks))
        host.net.prune(host.g.tick)
        tickClock()
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
    tickClock()
    guard = 0
    while (host.g.tick < 600 && guard++ < 200000) { host.step(); guest.step(); tickClock() }
    const cb = commonBoundary(host, guest)
    ok('lockstep is back after the rejoin', host.desyncs === 0 && guest.desyncs === 0
        && host.hashes.get(cb) === guest.hashes.get(cb) && host.hashes.get(cb) !== undefined)
    ok('the wire types are all relay-legal', SEATS === 2 && FORWARD_TYPES.includes('go')
        && FORWARD_TYPES.includes('pad') && FORWARD_TYPES.includes('hs') && FORWARD_TYPES.includes('res'))
}

Date.now = realNow
console.log(`\nrallylinkcheck: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
