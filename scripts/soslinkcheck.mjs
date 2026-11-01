// SOSLINKCHECK (#1291) — SHORT ORDER SHOUT online lobby, proven in plain Node.
// Two endpoints ride the REAL client stack (src/utils/room.js + lobby.js via an
// in-memory relay built on relay/core.js — the same pure rules the Cloudflare
// worker enforces) and the game's own net.js + engine.js. Proves the three
// acceptance clauses of #1291:
//   1. lobby: host code -> guest joins -> seats fill -> host starts on one seed;
//   2. lockstep: a whole shift with two emitters-as-humans ends with the SAME
//      hash on both boxes, a dish served, and the quota won (the README's 2P CPU
//      pair reaches quota on 8/8 seeds — this replays one of those over the wire);
//   3. desync: one peer's pad forced off-by-one at apply time is CAUGHT by the
//      whole-sim hash and HEALED by the host snapshot — ticks keep running, no
//      reload, hashes agree again for the rest of the shift.
// Plus: wire sanity (every message fits the relay's 512B budget and the room
// rate window with four members) and drop-grace (a guest leaving mid-shift
// leaves the host cooking on with CPUs).
//
// npm run soslinkcheck — no browser, no network, deterministic.

import { newRoom, join, leave, relay, rosterOf } from '../relay/core.js'
import { createLobby } from '../src/utils/lobby.js'
import { createGame, stepGame, hashState, snapshotGame, restoreGame, makeCpuEmitter } from '../src/games/ShortOrderShout/engine.js'
import { createSosSync, seatsOf, packSnap, padMask, unmaskPad, SEATS, PAD_DELAY, stallNotice, NOTICE_AT, STALL_MAX } from '../src/games/ShortOrderShout/net.js'

let pass = 0, fail = 0
const ok = (c, msg, extra = '') => { if (c) { pass++; console.log(`  ok  ${msg}`) } else { fail++; console.log(`  FAIL ${msg} ${extra}`) } }

// Virtual clock: the relay guards a REAL-time rate window, but the harness runs
// thousands of ticks synchronously. Advancing Date.now ~17ms per simulated frame
// keeps the math honest (a 60 Hz world) without waiting on real seconds.

// A "human" in online play is state-agnostic thumbs: deterministic per tick.
// recordRun() plays a seat set live in a headless sim (local mode exactly) and
// captures the pad stream — feeding this over the wire reproduces the local
// outcome tick-for-tick (the determinism law), with proper k-stamped batches.
function recordRun(seed, seats, maxTicks = 12000) {
    const gs = createGame(seed, seats)
    const ems = Array.from({ length: seats }, (_, i) => makeCpuEmitter(i))
    const stream = []
    while (!gs.done && stream.length < maxTicks) {
        const pads = gs.cooks.map((c, i) => ems[i]({ gs, tick: gs.tick }))
        stream.push(pads.map(padMask))
        stepGame(gs, pads)
    }
    return { stream, gs }
}

const REAL_NOW = Date.now
let vnow = REAL_NOW()
Date.now = () => vnow

// ---- in-memory relay (relay/core.js rules, zero sockets) ----------------------
function makeMemRelay() {
    const rooms = new Map()
    const hub = { maxBytes: 0, oversize: 0, refused: 0 }
    hub.connect = (code, cap, id) => {
        let r = rooms.get(code)
        if (!r) { r = { core: newRoom(code, cap || 2), socks: new Map() }; rooms.set(code, r) }
        const inbox = []
        const out = {
            send(str) {
                let obj = null
                try { obj = JSON.parse(str) } catch { return } // junk dropped
                hub.maxBytes = Math.max(hub.maxBytes, str.length)
                if (str.length > 512) { hub.oversize++; return }
                const res = relay(r.core, id, obj)
                if (!res.ok) { hub.refused++; if (process.env.SOS_DBG) console.log('REFUSED', id, str.slice(0, 80), JSON.stringify(res)); return }
                hub.count = (hub.count || 0) + 1
                out.tx = (out.tx || 0) + 1
                for (const peerId of res.to) {
                    const peer = r.socks.get(peerId)
                    if (peer) peer.deliver(str)
                }
            },
            deliver(str) { inbox.push(str) },
            onMessage(cb) { out.cb = cb },
            onClose() { /* sockets do not drop in memory */ },
            close() {
                r.socks.delete(id)
                const lr = leave(r.core, id)
                if (lr.gone) {
                    for (const peerId of [...r.socks.keys()]) {
                        const peer = r.socks.get(peerId)
                        peer.deliver(JSON.stringify(rosterOf(r.core)))
                        peer.deliver(JSON.stringify({ t: 'gone' }))
                    }
                }
                if (lr.empty) rooms.delete(code)
            },
            pump() {
                while (inbox.length) { const s = inbox.shift(); if (out.cb) out.cb(s) }
            },
        }
        r.socks.set(id, out)
        const j = join(r.core, id)
        if (!j.ok) { hub.refused++; return out }
        // welcome + roster arrive on the next pump, like a real socket
        out.deliver(JSON.stringify({ t: 'welcome', you: j.slot, cap: r.core.max }))
        for (const peerId of r.socks.keys()) {
            const peer = r.socks.get(peerId)
            peer.deliver(JSON.stringify(rosterOf(r.core)))
        }
        return out
    }
    return hub
}

// ---- one browser ---------------------------------------------------------------
// Mirrors what ShortOrderShout/index.jsx wires in online mode: lobby + sync +
// sim. `humanKeys(seat)` is the browser's held-keys map; the harness feeds the
// same deterministic CPU emitter a real human's thumbs replace.
function makeEndpoint({ id, slug, relayHub, seats = SEATS, isHost, partner = false, stream = null }) {
    const ep = { id, gs: null, playing: false, hashes: [], desyncs: [], resyncs: 0, injected: null, lastHs: null, joinedSlot: -1, hub: relayHub }
    let ws = null
    const transports = []
    const makeTransport = (url) => {
        const code = decodeUrl(url)
        const cap = Number(new URL(url, 'ws://x').searchParams.get('cap')) || 0
        ws = relayHub.connect(code, cap, id)
        transports.push(ws)
        return {
            send: (s) => ws.send(s),
            onMessage: (cb) => { ws.onMessage(cb) },
            onClose: (cb) => ws.onClose(cb),
            close: () => ws.close(),
        }
    }
    const decodeUrl = (url) => decodeURIComponent(url.replace(/^ws:\/\/[^/]+\/room\//, '').split('?')[0])

    ep.emitters = []
    ep.record = null // seat -> [mask per tick]: the human's deterministic thumbs
    ep.readKeys = (seat, k) => {
        if (ep.record && ep.record[seat]) return unmaskPad(ep.record[seat][k - (ep.recBase || 0)] ?? 0)
        const em = ep.emitters[seat]
        return em && ep.gs ? em({ gs: ep.gs, tick: ep.gs.tick }) : {}
    }
    ep.sync = createSosSync({
        send: (t, p) => { if (ep.lobby && ep.lobby.room) ep.lobby.room.send(t, p) },
        mySeats: [],
        watchSeats: [],
    })

    ep.lobby = createLobby({
        slug,
        cap: seats,
        relay: 'ws://mem',
        makeTransport,
        onState: (s) => { ep.phase = s.phase; ep.code = s.code },
        onRoster: ({ slots }) => { ep.slots = slots.slice(); ep.ownersChanged() },
        onJoin: () => ep.ownersChanged(),
        onLeave: () => ep.ownersChanged(),
        onStart: (m) => ep.startMatch(m),
        on: {
            pad: (m) => { ep.padRcv = (ep.padRcv || 0) + 1; if (process.env.SOS_DBG && ep.padRcv <= 3) console.log('PADRX', id, JSON.stringify(m).slice(0, 100)); ep.sync.gotPad(m) },
            hs: (m) => {
                const r = ep.sync.gotHash(m.k | 0, m.h >>> 0, m.s | 0)
                if (r && r.desync !== undefined) ep.onDesync(r)
            },
            res: (m) => {
                if (m.e === 'req') { if (ep.isHost && ep.playing) ep.hostResync() }
                else if (m.e === 'snp') {
                    const got = ep.sync.snapInbox.push(m)
                    if (got) ep.applySnap(got)
                }
            },
            gone: () => ep.ownersChanged(),
        },
    })
    ep.isHost = isHost
    ep.partner = partner

    ep.ownersChanged = () => {
        const slots = ep.slots || []
        ep.mySeats = seatsOf(ep.lobby.room.yourSlot, ep.partner)
        ep.sync.mySeats = ep.mySeats.slice()
        const humans = slots.filter((s) => s < seats)
        ep.watch = humans
        ep.sync.watchSeats = humans.slice()
    }
    ep.startMatch = (m) => {
        const seed = (m && m.seed) >>> 0 || 1
        ep.partner = !!(m && m.partner) && ep.isHost
        ep.gs = createGame(seed, seats)
        ep.emitters = Array.from({ length: seats }, (_, i) => makeCpuEmitter(i))
        if (stream) {
            // the recorded stream never crosses the wire (512B budget) — both
            // boxes share it the way they share the seed: by construction.
            ep.recBase = 0
            ep.record = {}
            for (let s2 = 0; s2 < seats; s2++) ep.record[s2] = stream.map((row) => row[s2] || 0)
        }
        ep.sync.reset(0)
        ep.sync.snapInbox.reset()
        ep.mySeats = seatsOf(ep.lobby.room.yourSlot, ep.partner)
        ep.sync.mySeats = ep.mySeats.slice()
        ep.watch = (ep.slots || [0]).slice()
        ep.sync.watchSeats = ep.watch.slice()
        ep.playing = true
    }
    ep.onDesync = (r) => {
        ep.desyncs.push(r)
        if (ep.isHost) ep.hostResync()
        else ep.lobby.room.send('res', { e: 'req' })
    }
    ep.hostResync = () => {
        // freeze (loop gate), snapshot at the last completed tick, resume.
        const k = ep.gs.tick
        for (const c of packSnap(JSON.stringify(snapshotGame(ep.gs)), k)) ep.lobby.room.send('res', c)
        ep.resyncedAsHost = true
    }
    ep.applySnap = ({ snap, tick }) => {
        ep.gs = restoreGame(snap)
        ep.resyncs++
        ep.lastSnapTick = tick
    }

    // one fixed-timestep frame, the way the browser loop drives it
    ep.step = () => {
        if (!ep.playing || !ep.gs || ep.gs.done) return
        const k = ep.gs.tick
        ep.sync.prune(k)
        ep.sync.pumpTo(k + ep.sync.delay, ep.readKeys)
        const cpuMasks = {}
        for (let s = 0; s < seats; s++) {
            if (ep.watch.indexOf(s) < 0) {
                const em = ep.emitters[s]
                cpuMasks[s] = padMask(em ? em({ gs: ep.gs, tick: k }) : {})
            }
        }
        if (!ep.sync.ready(k, cpuMasks)) {
            if (process.env.SOS_DBG && ep.sync.stats().stallRun === 50) {
                console.log('STALL', id, JSON.stringify(ep.sync.debug(k)), 'cpu', JSON.stringify(Object.keys(cpuMasks)), 'my', ep.mySeats, 'hub', JSON.stringify(ep.hub.count || 0), 'refused', ep.hub.refused || 0, 'tx', ep.txCount())
            }
            if (ep.sync.stats().stallRun > 600) throw new Error(`${id}: stalled >600 ticks — protocol deadlock`)
            ep.stalled = (ep.stalled || 0) + 1
            return
        }
        const pads = ep.sync.assemble(k, cpuMasks)
        if (process.env.SOS_DBG && ep.padLog === undefined) console.log('FIRST', id, 'k', k, 'watch', JSON.stringify(ep.watch), 'cpu', JSON.stringify(cpuMasks), 'dbg', JSON.stringify(ep.sync.debug(k)), 'pads', JSON.stringify(pads))
        if (process.env.SOS_DBG && k <= 64) { ep.padLog = ep.padLog || []; ep.padLog.push([k, pads.map((p) => padMask(p)).join(',')]) }
        // test seam: force THIS box's applied pad for one seat off-by-one once
        if (ep.injected && ep.injected.tick === k) {
            pads[ep.injected.seat] = { ...pads[ep.injected.seat], ...ep.injected.pad }
        }
        stepGame(ep.gs, pads)
        ep.servedSeen = ep.gs.served
        if (k > 0 && k % ep.sync.hashEvery === 0) {
            const h = hashState(ep.gs)
            ep.hashes.push({ k, h })
            const r = ep.sync.hash(k, h)
            if (r && r.desync !== undefined) ep.onDesync(r)
        }
    }
    ep.pumpWire = () => { for (const t of transports) t.pump() }
    ep.txCount = () => transports.reduce((n, t) => n + (t.tx || 0), 0)
    return ep
}

// ---- drive ---------------------------------------------------------------------
function runTogether(eps, maxTicks, doneFn) {
    for (let i = 0; i < maxTicks; i++) {
        vnow += 17 // one 60Hz frame on the virtual clock (relay rate math)
        for (const ep of eps) ep.pumpWire()
        for (const ep of eps) ep.step()
        if (doneFn && doneFn(eps, i)) return i
    }
    return -1
}

// =============================== 1. LOBBY =========================================
console.log('# lobby (host code, guest joins, host starts on one seed)')
{
    const hub = makeMemRelay()
    const host = makeEndpoint({ id: 'h', slug: 'short-order-shout', relayHub: hub, isHost: true })
    const guest = makeEndpoint({ id: 'g', slug: 'short-order-shout', relayHub: hub, isHost: false })
    host.lobby.open()
    host.pumpWire(); guest.pumpWire()
    ok(host.lobby.room.yourSlot === 0 && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(host.code || host.lobby.room.code), `host opens a code ${host.lobby.room.code}`)
    guest.lobby.join(host.lobby.room.code)
    for (let i = 0; i < 6; i++) { host.pumpWire(); guest.pumpWire() }
    ok(guest.lobby.room.yourSlot === 1, 'guest takes seat 1')
    ok((host.slots || []).join(',') === '0,1', `roster shows both cooks on host (${host.slots})`)
    ok(host.lobby.state().joinHref.includes('?net=join&room='), 'share link carries ?net=join&room=CODE')
    host.lobby.start({ seed: 4242, partner: false })
    for (let i = 0; i < 6; i++) { host.pumpWire(); guest.pumpWire() }
    if (process.env.SOS_DBG) console.log('DBG host', host.playing, 'guest', guest.playing, 'gphase', guest.lobby.room.phase, 'grole', guest.lobby.room.role, 'refused', hub.refused, 'slots', guest.slots)
    ok(host.playing && guest.playing, 'go starts the shift on both boxes')
    ok(host.gs.seed === 4242 && guest.gs.seed === 4242, 'seed exchange: both kitchens on the host seed')
    ok(host.mySeats.join() === '0' && guest.mySeats.join() === '1', 'each browser owns its slot seat')
}

// =============================== 2. FULL SHIFT ====================================
console.log('# lockstep: a whole shift, hash-for-hash, quota won together (2 seats)')
{
    const rec = recordRun(777, 2) // local-mode reference: the pair reaches quota on this seed
    const hub = makeMemRelay()
    const host = makeEndpoint({ id: 'h', slug: 'short-order-shout', relayHub: hub, seats: 2, isHost: true, stream: rec.stream })
    const guest = makeEndpoint({ id: 'g', slug: 'short-order-shout', relayHub: hub, seats: 2, isHost: false, stream: rec.stream })
    host.lobby.open()
    for (let i = 0; i < 4; i++) { host.pumpWire(); guest.pumpWire() }
    guest.lobby.join(host.lobby.room.code)
    for (let i = 0; i < 6; i++) { host.pumpWire(); guest.pumpWire() }
    host.lobby.start({ seed: 777, partner: false })
    for (let i = 0; i < 6; i++) { host.pumpWire(); guest.pumpWire() }
    const n = runTogether([host, guest], 12000, (eps) => eps[0].gs.done && eps[1].gs.done)
    ok(n >= 0, `shift ran to the whistle (${n} frames)`)
    ok(host.desyncs.length === 0 && guest.desyncs.length === 0, 'zero desyncs across the whole shift', JSON.stringify([host.desyncs[0], guest.desyncs[0]]))
    ok(host.gs.served >= 1 && guest.gs.served >= 1, `dishes served identically (${host.gs.served}/${guest.gs.served})`)
    ok(host.gs.score === guest.gs.score && guest.gs.score === rec.gs.score, `score online == score local (${host.gs.score}=${rec.gs.score})`)
    ok(rec.gs.score >= 900 && host.gs.win && guest.gs.win, `quota won over the wire (${host.gs.score} >= 900, clean shift on both boxes)`)
    ok(host.hashes.length > 40 && host.hashes.every((x, i) => guest.hashes[i] && x.h === guest.hashes[i].h), `${host.hashes.length} hash boundaries, all equal`)
    ok(hashState(host.gs) === hashState(rec.gs), 'final hash equals the local reference run (the determinism law, end to end)')
    ok(hub.oversize === 0 && hub.refused === 0 && hub.maxBytes <= 512, `wire fits the relay guards (max ${hub.maxBytes}B, oversize ${hub.oversize}, refused ${hub.refused})`)
    const rate = (host.txCount() + guest.txCount()) / (n / 60)
    ok(rate < 240, `room rate under the 240/s window (~${Math.round(rate)}/s with 2 members)`)
}

// =============================== 3. DESYNC + HEAL ===============================
console.log('# desync injection: off-by-one pad caught by hash, healed by host snapshot')
{
    const rec = recordRun(555, 2)
    const hub = makeMemRelay()
    const host = makeEndpoint({ id: 'h', slug: 'short-order-shout', relayHub: hub, seats: 2, isHost: true, stream: rec.stream })
    const guest = makeEndpoint({ id: 'g', slug: 'short-order-shout', relayHub: hub, seats: 2, isHost: false, stream: rec.stream })
    host.lobby.open()
    for (let i = 0; i < 4; i++) { host.pumpWire(); guest.pumpWire() }
    guest.lobby.join(host.lobby.room.code)
    for (let i = 0; i < 6; i++) { host.pumpWire(); guest.pumpWire() }
    host.lobby.start({ seed: 555, partner: false })
    for (let i = 0; i < 6; i++) { host.pumpWire(); guest.pumpWire() }
    runTogether([host, guest], 150)
    ok(host.hashes.length >= 2 && guest.hashes.length >= 2, 'clean run-in, hashes agreeing')
    // force the GUEST's applied pad off-by-one once: a spurious UP step the
    // host never sees — a torn frame mutated after sampling, the worst case.
    guest.injected = { tick: guest.gs.tick + PAD_DELAY + 2, seat: 1, pad: { up: true } }
    const before = host.desyncs.length + guest.desyncs.length
    const n = runTogether([host, guest], 4000, (eps) => eps[0].resyncedAsHost && eps[1].resyncs > 0)
    ok(n >= 0, 'desync detected and resync completed')
    ok(host.desyncs.length + guest.desyncs.length > before, 'hash mismatch flagged within a boundary or two', JSON.stringify([host.desyncs[0], guest.desyncs[0]]))
    ok(guest.resyncs >= 1, 'guest adopted the host snapshot')
    // keep cooking: the next three boundaries must agree and ticks must advance
    guest.injected = null
    const tickAtResync = host.gs.tick
    runTogether([host, guest], 600)
    ok(host.gs.tick > tickAtResync + 200 && guest.gs.tick > tickAtResync + 200, `sim keeps running after resync (${host.gs.tick}/${guest.gs.tick})`)
    const ha = host.hashes.slice(-3), ga = guest.hashes.slice(-3)
    ok(ha.length === 3 && ha.every((x, i) => ga[i] && x.k === ga[i].k && x.h === ga[i].h), 'post-resync hashes agree at the next 3 boundaries')
    ok(host.desyncs.length <= 2 && guest.desyncs.length <= 2, 'no desync storm after the heal', JSON.stringify([host.desyncs.length, guest.desyncs.length]))
}

// =============================== 4. FOUR SEATS ====================================
console.log('# four cooks: rate window, join/leave grace')
{
    const rec = recordRun(31337, 4)
    const hub = makeMemRelay()
    const a = makeEndpoint({ id: 'a', slug: 'short-order-shout', relayHub: hub, seats: 4, isHost: true, partner: true, stream: rec.stream })
    const b = makeEndpoint({ id: 'b', slug: 'short-order-shout', relayHub: hub, seats: 4, isHost: false, stream: rec.stream })
    const c = makeEndpoint({ id: 'c', slug: 'short-order-shout', relayHub: hub, seats: 4, isHost: false, stream: rec.stream })
    a.lobby.open()
    for (let i = 0; i < 4; i++) { a.pumpWire(); b.pumpWire(); c.pumpWire() }
    b.lobby.join(a.lobby.room.code)
    c.lobby.join(a.lobby.room.code)
    for (let i = 0; i < 8; i++) { a.pumpWire(); b.pumpWire(); c.pumpWire() }
    ok(b.lobby.room.yourSlot === 1 && c.lobby.room.yourSlot === 2, 'b and c take seats 1 and 2')
    a.lobby.start({ seed: 31337, partner: true })
    for (let i = 0; i < 8; i++) { a.pumpWire(); b.pumpWire(); c.pumpWire() }
    ok(a.mySeats.join() === '0,1', 'host drives seats 0+1 with a couch partner')
    const n = runTogether([a, b, c], 2000)
    ok(a.gs.tick > 1500 && b.gs.tick > 1500 && c.gs.tick > 1500, `four-cook kitchen cookin' (${a.gs.tick}/${b.gs.tick}/${c.gs.tick} of ${n >= 0 ? n : '2000'})`)
    ok(a.desyncs.length === 0 && b.desyncs.length === 0 && c.desyncs.length === 0, 'zero desyncs at four seats', JSON.stringify([a.desyncs[0], b.desyncs[0], c.desyncs[0]]))
    ok(a.gs.score === b.gs.score && b.gs.score === c.gs.score, `all three views agree on score (${a.gs.score})`)
    const perSec = a.gs.tick / 60
    const total = a.txCount() + b.txCount() + c.txCount()
    ok(total / perSec < 240, `four members stay under the 240/s room window (~${Math.round(total / perSec)}/s)`)
    // c leaves mid-shift: seat 2 falls to CPU and the kitchen keeps running
    c.lobby.close()
    for (let i = 0; i < 8; i++) { a.pumpWire(); b.pumpWire() }
    runTogether([a, b], 600)
    ok(a.gs.tick > 2100 && b.gs.tick > 2100, `shift survives a walkaway (${a.gs.tick}/${b.gs.tick})`)
    ok(a.desyncs.length === 0 && b.desyncs.length === 0, 'no desync from the walkaway (CPU takeover)')
}

// =============================== 5. RE-KICK HANDOFF =============================
console.log('# re-kick handoff (#1379 gap 6): a stalled box says so, it does not freeze')
{
    ok(stallNotice(0, 'guest') === null, 'no notice while pads are flowing (stallRun 0)')
    ok(stallNotice(NOTICE_AT - 1, 'guest') === null, `no notice just under the bar (stallRun ${NOTICE_AT - 1})`)
    ok(stallNotice(NOTICE_AT, 'guest') === 'HOST RESTARTING SHIFT', 'guest shows HOST RESTARTING SHIFT at the notice bar')
    ok(stallNotice(STALL_MAX, 'host') === 'FRIEND LOST — RESTARTING SHIFT', 'host shows FRIEND LOST at/after the re-kick bar')
    ok(stallNotice(STALL_MAX, 'guest') === 'HOST RESTARTING SHIFT', 'guest still points at the host at the re-kick bar')
    ok(NOTICE_AT < STALL_MAX, 'guest is told BEFORE the host re-kicks (notice precedes restart)')
}

console.log(`\nsoslinkcheck: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
