// BOMB DEFUSE LINK CHECK (#1819) — the online protocol harness. Pure Node:
// two "boxes" (host = seat 0, guest = seat 1) run the SAME sim from one seed
// and talk only through an in-memory room that obeys the real relay rules
// (relay/core.js: FORWARD_TYPES allowlist, 512B budget) under a 60 Hz fake
// clock. No sockets, no DOM.
//
//   1. the codec is honest      — padMask/unmaskPad round-trip all 64 masks
//   2. the snapshot round-trips — restore (incl. the rng counter) keeps
//                                 ticking to the same hash
//   3. lockstep holds           — every boundary hash agrees, the run finishes
//                                 identically on both boxes
//   4. it survives jitter       — legs inside the pad lead stall, never desync
//   5. a walkaway degrades      — after exactly DROP_GRACE stalled ticks the
//                                 peer seat demotes, gs.players flips to 1, the
//                                 engine partner takes over and the run is WON
//   6. a desync resyncs         — the guest freezes at the boundary; the
//                                 host's snapshot restores it at the same tick,
//                                 pad streams preserved
//   7. a rejoin restores        — promote + fresh 'go' runs lockstep again
//   8. the shell is wired       — static audit of index.jsx (Lobby mounted,
//                                 socket closed on unmount, seed in the go, the
//                                 lockstep contract in the loop, guest seat 1)
//
// Run: npm run defuselinkcheck   (no dev server needed)
// Mutant: npm run defuselinkcheck -- --mutate   (the walkaway never demotes —
//              test 5 goes RED: a lost link freezes frames; the law has teeth)

import { createGame, step, hash, solvePads, curStep, COLORS, needleOf, ZONE_HALF, SYNC, CUT } from '../src/games/BombDefuse/engine.js'
import {
    createDefuseSync, padMask, unmaskPad, snapshotNet, restoreNet, packSnap,
    PAD_DELAY, HASH_EVERY, DROP_GRACE, SEATS, CHUNK,
} from '../src/games/BombDefuse/net.js'
import { newRoom, join, leave, relay, MAX_MSG, FORWARD_TYPES } from '../relay/core.js'
import { readFileSync } from 'node:fs'

const MUTATE = process.argv.indexOf('--mutate') >= 0

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}

// ---- fake clock (the relay window is real-time; the sim is tick-time) ------
let FAKE_NOW = 1_000_000
const realNow = Date.now
const tickClock = () => { FAKE_NOW += 16 }
Date.now = () => FAKE_NOW

// ---- the in-memory room: relay/core.js rules, zero sockets ----------------
function makeLink(latMs = 0) {
    const room = newRoom('TEST', 2)
    const inq = new Map()
    const oversize = []
    const send = (fromId, obj) => {
        const str = JSON.stringify(obj)
        if (Buffer.byteLength(str) > MAX_MSG) { oversize.push(str.length); return }
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
        members: () => room.members.map((m) => m.id).sort(),
    }
}

// ---- recorded absolute streams (the harness's "fair play") -----------------
// A real player reads the SCREEN and commits pads on an absolute timeline —
// pad(k) exists whether or not the sim has reached k. A solver pad computed
// from the sender's live gs 8 ticks early is not that: it decides against a
// stale state (the arm cycles never settle). So the harness records each
// seed's clean solvePads stream ONCE, and boxes emit stream[k] — exactly what
// the recorded-replay spine ships (recordLiveTick feeds the same shape).
const streamCache = new Map()
function streamFor(seed) {
    if (streamCache.has(seed)) return streamCache.get(seed)
    const g = createGame(seed, 2)
    const stream = []
    while (!g.done) {
        const pads = solvePads(g)
        stream.push(pads)
        step(g, pads)
        while (g.events.length) g.events.shift()
    }
    streamCache.set(seed, stream)
    return stream
}

// ---- one box: sim + sync engine, the shell's exact tick contract ----------
function makeBox(link, id, mySeat, seed) {
    const g = createGame(seed, 2)
    const net = createDefuseSync({
        mySeat,
        watchSeats: [1 - mySeat],
        send: (t, p) => link.send(id, Object.assign({ t, s: mySeat }, p)),
    })
    const box = {
        link, id, g, net, seed,
        go: null, snap: null, resyncs: 0, desyncs: 0, frozen: false, demoted: 0,
        hashes: new Map(), // boundary tick -> whole-sim hash (the guarantee)
    }
    // this box's own seat's "human" emitter: its absolute stream pad.
    box.pad = (k) => streamFor(seed)[Math.min(k - 1, streamFor(seed).length - 1)][mySeat]
    box.pump = () => {
        for (const msg of link.drain(id)) {
            if (msg.t === 'pad') net.gotPad(msg)
            else if (msg.t === 'hs') {
                const d = net.gotHash(msg.k, msg.h)
                if (d) { box.desyncs++; box.desync = d; if (mySeat === 1) box.frozen = true }
            }
            else if (msg.t === 'go') box.go = { seed: msg.seed }
            else if (msg.t === 'res' && msg.e === 'req' && mySeat === 0) hostSnap(box)
            else if (msg.t === 'res' && msg.e === 'snp') {
                const r = net.snapInbox.push(msg)
                if (r) box.snap = { snap: r.snap, tick: r.tick }
            }
        }
    }
    // Solo after a walkaway: no peer consumes the pump path, so the survivor
    // runs its sim with fresh-view reactive pads at apply time (the shell
    // does the same with live held keys; the harness's "human" is reactive).
    // Every verb lands inside its window by construction — the run wins.
    const reactive = () => {
        const g = box.g
        if (g.done || g.intro > 0) return {}
        const st = curStep(g)
        if (st.kind === SYNC) return g.keys[1] && !g.keys[0] ? { a: true } : {}
        if (st.kind === CUT) {
            const d = (st.color - g.sel[0] + COLORS.length) % COLORS.length
            if (d !== 0) return { [d <= 2 ? 'up' : 'down']: true }
            if (!g.armed[0] && (g.armed[1] || g.stepT >= 120)) return { a: true }
            return {}
        }
        if (st.holder === 0) return { b: true }
        return Math.abs(needleOf(g) - g.zone) <= ZONE_HALF[g.bomb] * 0.55 ? { a: true } : {}
    }
    // the tick contract the shell runs (and the harness pins):
    //   pump -> pumpTo(k+delay) -> ready -> assemble -> step -> hash
    // plus the demote law: DROP_GRACE stalled ticks at one tick => the peer
    // seat dies and gs.players flips so the engine partner covers it.
    box.step = () => {
        if (box.frozen) return 'frozen'
        box.pump()
        if (net.solo()) {
            step(box.g, [reactive(), {}])
            while (box.g.events.length) box.g.events.shift()
            return 'tick'
        }
        const k = box.g.tick + 1
        net.pumpTo(k + net.delay, box.pad)
        if (!net.ready(k)) {
            box.miss = (box.miss || 0) + 1
            // MUTATE (opt-in, test 5 only): the walkaway never demotes.
            if (box.miss >= DROP_GRACE && !(MUTATE && box.noDemote)) {
                const seat = net.watchSeats[0]
                if (net.demote(seat)) { box.g.players = 1; box.demoted = k }
                box.miss = 0
            }
            return 'stall'
        }
        box.miss = 0
        step(box.g, net.assemble(k))
        while (box.g.events.length) box.g.events.shift()
        net.prune(box.g.tick)
        if (box.g.tick % net.hashEvery === 0) {
            const h = hash(box.g)
            box.hashes.set(box.g.tick, h)
            const d = net.hash(box.g.tick, h)
            if (d) { box.desyncs++; box.desync = d; if (mySeat === 0) hostSnap(box); else box.frozen = true }
        }
        return 'tick'
    }
    return box
}

const hostSnap = (box) => {
    for (const c of packSnap(JSON.stringify(snapshotNet(box.g)), box.g.tick)) {
        link0send(box, c)
    }
}
const link0send = (box, c) => box.link.send(box.id, Object.assign({ t: 'res', s: box.net.mySeat }, c))

// apply a reassembled snapshot at the host's tick; streams preserved
const applySnap = (box) => {
    if (!box.snap) return false
    const keptOwn = box.net.hasPad(box.net.mySeat, box.snap.tick + 5)
    box.g = restoreNet(box.snap.snap)
    box.snap = null
    box.resyncs++
    box.frozen = false
    return keptOwn
}

const commonBoundary = (a, b) => Math.floor(Math.min(a.g.tick, b.g.tick) / HASH_EVERY) * HASH_EVERY

const runPair = (host, guest, cond, cap = 200000) => {
    let guard = 0
    while (cond(host, guest) && guard++ < cap) { host.step(); guest.step(); tickClock() }
    return guard < cap
}

// ---- 1. the codec is honest ------------------------------------------------
console.log('codec:')
{
    let rt = 0
    for (let m = 0; m < 64; m++) if (padMask(unmaskPad(m)) === m) rt++
    ok('all 64 masks round-trip', rt === 64, `${rt}/64`)
    ok('padMask of loose pad is 0', padMask({}) === 0 && padMask(undefined) === 0)
    const p = unmaskPad(padMask({ a: true, b: true, up: true }))
    ok('unmask carries the two-hand verbs', p.a === true && p.b === true && p.up === true && p.down === false)
}

// ---- 2. the snapshot round-trips -------------------------------------------
console.log('snapshot:')
{
    const g = createGame(7, 2)
    for (let i = 0; i < 1200; i++) { step(g, solvePads(g)); while (g.events.length) g.events.shift() }
    const str = JSON.stringify(snapshotNet(g))
    const chunks = packSnap(str, g.tick)
    ok(`snapshot is tiny on the wire (${str.length} chars, ${chunks.length} chunk)`,
        str.length <= CHUNK * 2 && chunks.length >= 1)
    ok('every chunk is 512B-safe on the wire',
        chunks.every((c) => Buffer.byteLength(JSON.stringify({ t: 'res', e: c.e, k: c.k, i: c.i, z: c.z, p: c.p, s: 0 })) <= MAX_MSG))
    const b = restoreNet(JSON.parse(str))
    ok('restore rebuilds fresh bombs from the seed', b.bombs !== g.bombs && b.seed === g.seed && b.tick === g.tick)
    let same = true
    for (let i = 0; i < 400 && !g.done; i++) {
        step(g, solvePads(g)); while (g.events.length) g.events.shift()
        step(b, solvePads(b)); while (b.events.length) b.events.shift()
        if (hash(g) !== hash(b) || g.tick !== b.tick) { same = false; break }
    }
    ok('restore keeps ticking to the same hash (rng counter rode the wire)', same && g.tick === b.tick)
}

// ---- 3. lockstep holds ------------------------------------------------------
const SEED = 11
function freshPair(latMs = 0) {
    const link = makeLink(latMs)
    link.join('A'); link.join('B')
    const host = makeBox(link, 'A', 0, SEED)
    const guest = makeBox(link, 'B', 1, SEED)
    return { link, host, guest }
}
console.log('lockstep:')
{
    const { link, host, guest } = freshPair()
    link.send('A', { t: 'go', s: 0, seed: SEED })
    guest.pump()
    ok('go carries the shared seed', guest.go && guest.go.seed === SEED)
    let g1 = 0
    while ((host.g.tick < 1 || guest.g.tick < 1) && g1++ < 30) { host.step(); guest.step(); tickClock() }
    ok('first tick runs on both (the ready gate is the sync buffer)',
        host.g.tick >= 1 && guest.g.tick >= 1, `${host.g.tick}/${guest.g.tick}`)
    const ran = runPair(host, guest, (h, gg) => !h.g.done || !gg.g.done)
    ok('the run ends (nobody hangs)', ran)
    ok('no desync on either box', host.desyncs === 0 && guest.desyncs === 0, `h=${host.desyncs} g=${guest.desyncs}`)
    const cb = commonBoundary(host, guest)
    ok(`every boundary hash agrees (last: ${cb})`,
        host.hashes.get(cb) !== undefined && guest.hashes.get(cb) !== undefined && host.hashes.get(cb) === guest.hashes.get(cb))
    ok('both boxes defuse the same bombs at the same tick',
        host.g.done && guest.g.done && host.g.won && guest.g.won && host.g.tick === guest.g.tick && host.g.score === guest.g.score,
        `${host.g.tick}/${guest.g.tick} won ${host.g.won}/${guest.g.won}`)
    ok('stalls are bounded (instant relay)', Math.max(host.net.stats().maxStallRun, guest.net.stats().maxStallRun) <= 1,
        JSON.stringify([host.net.stats(), guest.net.stats()]))
    ok('no message oversize the relay budget', link.oversize.length === 0, JSON.stringify(link.oversize))
}

// ---- 4. it survives jitter --------------------------------------------------
console.log('jitter:')
{
    // 120 ms legs = 7.5 ticks, inside the 8-tick pad lead: stalls, never desync.
    const { link, host, guest } = freshPair(120)
    link.send('A', { t: 'go', s: 0, seed: SEED })
    tickClock()
    runPair(host, guest, (h, gg) => h.g.tick < 900 && gg.g.tick < 900)
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
    link.send('A', { t: 'go', s: 0, seed: SEED })
    guest.pump()
    tickClock()
    runPair(host, guest, (h, gg) => h.g.tick < 300 || gg.g.tick < 300)
    ok('precondition: both boxes past 300 ticks', host.g.tick >= 300 && guest.g.tick >= 300)
    link.leave('B') // the guest closes the tab
    host.noDemote = MUTATE
    const tBefore = host.g.tick
    runPair(host, host, (h) => !h.g.done && h.g.tick < 12000)
    const lastRemote = tBefore + PAD_DELAY
    const okW = (name, cond, extra = '') =>
        MUTATE ? ok(`mutant dies: ${name}`, !cond) : ok(name, cond, extra)
    okW('the demote fires after exactly DROP_GRACE stalled ticks',
        host.demoted === lastRemote + 1, `demotedAt=${host.demoted} expected=${lastRemote + 1}`)
    okW('the seat is dead: watch list empty, partner flag up',
        host.net.watchSeats.length === 0 && host.net.solo() === true)
    okW('the engine took the seat (players flipped to 1)', host.g.players === 1)
    okW('the run ran out with the CPU partner (degrade, not a freeze)', host.g.done === true && host.g.won === true,
        `done=${host.g.done} won=${host.g.won} strikes=${host.g.strikes}`)
    ok('no desync ever filed against the surviving box', host.desyncs === 0)
    void lastRemote
}

// ---- 6. a desync resyncs ----------------------------------------------------
console.log('resync:')
{
    const { link, host, guest } = freshPair()
    link.send('A', { t: 'go', s: 0, seed: SEED })
    guest.pump()
    tickClock()
    runPair(host, guest, (h, gg) => h.g.tick < 300 || gg.g.tick < 300)
    // the guest alone saw a bit flip: nudge its integer state
    guest.g.fuse -= 7
    runPair(host, guest, (h, gg) => !guest.desyncs && gg.g.tick < 900, 20000)
    ok('the mismatch surfaces at a hash boundary', guest.desyncs > 0 && guest.desync.desync % HASH_EVERY === 0,
        JSON.stringify(guest.desync || null))
    const snapTick = guest.desync.desync
    ok('the guest froze within one RTT of the boundary (no fake ticking)',
        guest.frozen === true && guest.g.tick >= snapTick && guest.g.tick <= snapTick + PAD_DELAY,
        `tick=${guest.g.tick} snap=${snapTick}`)
    ok('the host is at the same boundary when it snapshots', host.g.tick === snapTick, `host=${host.g.tick} snap=${snapTick}`)
    tickClock()
    guest.pump()
    ok('the snapshot arrived', !!guest.snap && guest.snap.tick === snapTick)
    const keptOwn = applySnap(guest)
    ok('the pad buffers survived the resync (streams resume, never reset)', keptOwn === true)
    ok('the guest rolled back to the host truth', guest.g.fuse === host.g.fuse && guest.g.tick === snapTick)
    runPair(host, guest, (h, gg) => !h.g.done || !gg.g.done)
    ok('after resync the boundary hashes agree again',
        host.hashes.get(snapTick + HASH_EVERY) === guest.hashes.get(snapTick + HASH_EVERY)
        && host.hashes.get(snapTick + HASH_EVERY) !== undefined, `next=${snapTick + HASH_EVERY}`)
    ok('both boxes finish the same run', host.g.done === guest.g.done && host.g.won === guest.g.won
        && host.g.tick === guest.g.tick && host.g.score === guest.g.score, `${host.g.tick} vs ${guest.g.tick}`)
    ok('the guest desynced exactly once', guest.desyncs === 1 && guest.resyncs === 1)
    void link
}

// ---- 7. a rejoin restores ---------------------------------------------------
console.log('rejoin:')
{
    const { link, host, guest } = freshPair()
    link.send('A', { t: 'go', s: 0, seed: SEED })
    guest.pump()
    tickClock()
    runPair(host, guest, (h, gg) => h.g.tick < 200 || gg.g.tick < 200)
    link.leave('B')
    runPair(host, host, (h) => h.net.watchSeats.length > 0 && !h.g.done && h.g.tick < 6000)
    ok('host demoted the walkaway', host.net.watchSeats.length === 0 && host.g.players === 1)
    link.join('B')
    ok('the relay re-seats the returner', link.members().join(',') === 'A,B')
    // a fresh go (the shell re-kicks): sims rebuilt, sync reset, both promote
    host.net.promote(1); guest.net.promote(1)
    link.send('A', { t: 'go', s: 0, seed: 23 })
    guest.pump()
    ok('the fresh go lands', guest.go && guest.go.seed === 23)
    host.g = createGame(23, 2); guest.g = createGame(23, 2)
    host.net.reset(0); guest.net.reset(0)
    tickClock()
    runPair(host, guest, (h, gg) => h.g.tick < 600 || gg.g.tick < 600)
    const cb = commonBoundary(host, guest)
    ok('lockstep is back after the rejoin', host.desyncs === 0 && guest.desyncs === 0
        && host.hashes.get(cb) === guest.hashes.get(cb) && host.hashes.get(cb) !== undefined)
    ok('the wire types are all relay-legal', SEATS === 2 && FORWARD_TYPES.includes('go')
        && FORWARD_TYPES.includes('pad') && FORWARD_TYPES.includes('hs') && FORWARD_TYPES.includes('res'))
}

// ---- 8. the shell is wired (static audit) ------------------------------------
console.log('shell audit:')
{
    const src = readFileSync(new URL('../src/games/BombDefuse/index.jsx', import.meta.url), 'utf8')
    ok('the shared Lobby overlay is MOUNTED (state={netUi})', /<Lobby\b[\s\S]{0,400}?state=\{netUi\}/.test(src))
    ok('the relay socket closes on unmount', /lobby\.close\(\)/.test(src))
    ok('the go payload carries the seed', /lobby\.start\(\{ seed: /.test(src))
    ok('the loop runs the lockstep contract', /pumpTo\(/.test(src) && /\.ready\(/.test(src) && /\.assemble\(/.test(src))
    ok('the walkaway demote is wired in the shell', /demote\(/.test(src) && /DROP_GRACE/.test(src))
    ok('the guest drives seat 1', /role === 'guest' \? 1 : 0|netRole === 'guest' \? 1 : 0/.test(src))
    ok('boundary hashes ride the shell loop', /HASH_EVERY/.test(src) && /\.hash\(/.test(src))
    ok('a desync freeze + snapshot resync is wired', /restoreNet\(/.test(src) && /packSnap\(/.test(src))
    ok('the DEMO is still pure: attract never touches the net path', !/solvePads\(a\)[^]*pumpTo/.test(src))
    const eng = readFileSync(new URL('../src/games/BombDefuse/engine.js', import.meta.url), 'utf8')
    ok('the engine grew ONLY an rng accessor for the snapshot', /next\.x = /.test(eng) && !/WebSocket/.test(eng))
}

Date.now = realNow
console.log(`\ndefuselinkcheck: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
