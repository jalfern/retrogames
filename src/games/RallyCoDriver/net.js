// RALLY CO-DRIVER ONLINE (#1448 — lobby seats) — the 2-seat lockstep the sim
// was built for (README: "the sim already treats the co seat as pads,
// lockstep-ready"). Host = driver (seat 0), guest = co-driver (seat 1). Both
// boxes run the SAME sim from one seed (the 'go' kickoff) and sample each
// other's pads D ticks ahead (the SOS sampling law, #531): pad streams are
// absolute per tick, so seed + pads => the same hash on both boxes (the
// determinism law, rallycheck). Online the lights are skipped (cd.t = 0 in
// the shell): the ready gate IS the sync buffer — a box may not run a tick
// until the peer's pad for that tick is in, so the first ticks hold a frame
// or two while the first batches cross the relay (test 3 pins it).
//
// Wire (FORWARD_TYPES only — no relay redeploy):
//   {t:'go',  seed, wx}             host kickoff (curated seed + weather key)
//   {t:'pad', k, mm:{seat:[m]}}     this box's own seat's pad masks, batched
//                                   every SAMPLE_EVERY ticks (absolute ticks)
//   {t:'hs',  k, h}                 whole-sim hash every HASH_EVERY ticks
//   {t:'res', e:'req'}              "put me back in sync" (any member -> host)
//   {t:'res', e:'snp', i, z, p, k}  host snapshot chunk (<=380 chars inside
//                                   the relay's 512B budget)
//
// A walkaway is not a crash: when the remote seat's pads stop arriving for
// DROP_GRACE ticks, BOTH boxes hand that seat to its CPU emitter on the SAME
// tick — the relay FIFO-delivers the last pad batch to every member before
// the roster change, so the missing window opens on the same sim tick
// everywhere (the SOS drop-grace, #1416 gap 2). The CPU pair then runs the
// stage out — exactly the attract, so a lost link degrades to the solo demo
// instead of a frozen frame.
//
// Desync: any hash-boundary mismatch freezes the box; the host snapshots over
// the wire (chunked) and every box restores at the SAME tick — no reload. A
// resync never resets the pad buffers: samples already sent are final (the
// sampling law) and peers may have consumed ticks past the snapshot, so the
// preserved streams resume over the restored state.
//
// Pure: no DOM, no WebSocket — `send` is injected, so
// scripts/rallylinkcheck.mjs proves the whole protocol in plain Node over an
// in-memory room (relay/core.js rules, zero sockets).

import { createSim, cpuDriverPad, cpuCoDriverPad } from './sim.js'

export const SEATS = 2
export const PAD_DELAY = 10      // ~167 ms of input delay: past relay round-trip
export const SAMPLE_EVERY = 2    // wire granularity (~30 Hz batches per box)
export const HASH_EVERY = 60     // ~1 s whole-sim hash boundary
export const DROP_GRACE = 30     // ~0.5 s of missing pads => the seat is CPU
export const CHUNK = 380         // relay budget 512B, sig-lesson sizing

// the six fields either seat reads — one byte on the wire. The co seat only
// ever sets left/right/up/a/b (note keys), the driver up/down/left/right/a.
const MBIT = { up: 1, down: 2, left: 4, right: 8, a: 16, b: 32 }

export function padMask(pad) {
    let m = 0
    const p = pad || {}
    for (const k of Object.keys(MBIT)) if (p[k]) m |= MBIT[k]
    return m
}

export function unmaskPad(m) {
    const p = {}
    const n = m | 0
    for (const k of Object.keys(MBIT)) p[k] = !!(n & MBIT[k])
    return p
}

// ---- snapshot (host resync) ---------------------------------------------------
// The whole mutable gs, minus what the seed rebuilds: the stage (makeStage is
// pure from the seed), the vestigial rng (never drawn after creation), the
// shell-only caches (_posts, events). ~1.4KB -> 4 wire chunks.
export function snapshotGame(gs) {
    const c = gs.car
    return {
        seed: gs.seed, wx: gs.weather,
        tick: gs.tick, done: gs.done, win: gs.win, lapsDone: gs.lapsDone,
        timeMs: gs.timeMs, lastLapMs: gs.lastLapMs,
        splits: gs.splits, controlMs: gs.controlMs, vis: gs.vis,
        car: { s: c.s, lat: c.lat, v: c.v, align: c.align, off: c.off, prevS: c.prevS },
        co: {
            kind: gs.co.kind, nextIdx: gs.co.nextIdx, called: gs.co.called,
            prevPad: gs.co.prevPad, lastCall: gs.co.lastCall, lap: gs.co.lap,
        },
        card: gs.card,
        stats: { ...gs.stats },
    }
}

export function restoreGame(snap) {
    const gs = createSim(snap.seed, 2, snap.wx)
    gs.tick = snap.tick
    gs.done = snap.done
    gs.win = snap.win
    gs.lapsDone = snap.lapsDone
    gs.timeMs = snap.timeMs
    gs.lastLapMs = snap.lastLapMs
    gs.splits = snap.splits
    gs.controlMs = snap.controlMs
    gs.vis = snap.vis
    gs.car = snap.car
    gs.co = snap.co
    gs.card = snap.card
    gs.stats = snap.stats
    gs.events = []
    return gs
}

// snapshot JSON slices into <=380-char wire chunks; every chunk carries
// k = the sender's completed tick, the state's as-of stamp.
export function packSnap(str, k) {
    const out = []
    for (let i = 0, z = Math.max(1, Math.ceil(str.length / CHUNK)); i < z; i++) {
        out.push({ e: 'snp', k: k | 0, i, z, p: str.slice(i * CHUNK, (i + 1) * CHUNK) })
    }
    return out
}

export function makeSnapInbox() {
    const parts = []
    let z = 0, tk = 0
    return {
        reset() { parts.length = 0; z = 0; tk = 0 },
        // returns {snap, tick} when complete, null while collecting.
        push(msg) {
            if (!msg || msg.e !== 'snp' || typeof msg.p !== 'string') return null
            z = msg.z | 0 || z
            tk = msg.k | 0
            parts[msg.i | 0] = msg.p
            if (z && parts.filter(Boolean).length >= z) {
                const joined = parts.slice(0, z).join('')
                parts.length = 0; z = 0
                try { return { snap: JSON.parse(joined), tick: tk } } catch { return null }
            }
            return null
        },
    }
}

// createRallySync(opts):
//   send(type, payload)          ride the room (adds {t, s} framing)
//   mySeat                       the seat THIS browser drives (0 host, 1 guest)
//   delay / hashEvery            wire tuning (defaults above)
// Pumping and assembly (the tick contract, called from the game loop):
//   pumpTo(target, readPad)      sample own seat's held keys up to target
//   ready(k, cpuMasks)           may tick k run? (remote mask in, or CPU seat)
//   assemble(k, cpuMasks)        build the sim's [driver, co] pads for tick k
//   hash(k, h) / gotHash(k, h)   both-edge compare against the one peer
// Wire inbound (the game's room.on handlers forward here):
//   gotPad(msg)                  {k, mm} from the peer
//   snapInbox                    chunk reassembler for host resync
export function createRallySync(opts = {}) {
    const delay = Number.isFinite(opts.delay) ? opts.delay : PAD_DELAY
    const hashEvery = Number.isFinite(opts.hashEvery) ? opts.hashEvery : HASH_EVERY
    const send = typeof opts.send === 'function' ? opts.send : () => {}
    const KEEP = 480
    // Sampling starts at tick 1: the sim's first consumed tick is 1 (tick 0's
    // pad is never read), and starting at 0 shifts every SAMPLE_EVERY batch
    // by one — the last sent batch then covers tick-1 of the box's last tick,
    // which moves the walkaway demote off the exact DROP_GRACE boundary.
    let nextSample = 1
    let pending = [] // unsent masks, flushed in SAMPLE_EVERY batches
    let own = new Map()    // k -> mask (own seat's samples)
    let remote = new Map() // k -> mask (the peer's seat)
    let ours = new Map()   // k -> h
    let peerH = new Map()  // k -> h
    let stalls = 0, stallRun = 0, maxStallRun = 0
    let stalledSeat = -1   // which watch seat blocked the last ready() check
    const dropped = new Set() // demoted seats: their wire pads are DEAD — gotPad
                              // must not resurrect them (a straggler batch would
                              // outrank the CPU mask in assemble and poison the hash)
    const snapInbox = makeSnapInbox()

    const shrink = (map, k) => { for (const key of map.keys()) if (key < k - KEEP) map.delete(key) }

    const api = {
        delay,
        hashEvery,
        snapInbox,
        mySeat: (opts.mySeat | 0) % SEATS,
        stats: () => ({ stalls, stallRun, maxStallRun, nextSample, stalledSeat }),
        // Walkaway: hand watch seat `seat` to its CPU. Every box stalls at the
        // SAME tick (the first the departed member ever failed to sample — the
        // relay FIFO-delivers the last batch before the roster change), so the
        // flip keeps pad streams identical everywhere. Dropping the seat's
        // stale remote samples is the load-bearing part: assemble() prefers
        // the remote buffer over the CPU mask, and a resurrected pad would
        // break hash equality.
        demote(seat) {
            const i = (api.watchSeats || []).indexOf(seat)
            if (i < 0) return false
            api.watchSeats.splice(i, 1)
            dropped.add(seat)
            remote.clear()
            if (stalledSeat === seat) { stalledSeat = -1; stallRun = 0 }
            return true
        },
        // Mirror of demote: the seat goes back on the watch list and its wire
        // pads live again (a mid-race rejoin, taken up at the next go).
        promote(seat) {
            if (!dropped.delete(seat)) return false
            if ((api.watchSeats || []).indexOf(seat) < 0) {
                api.watchSeats.push(seat)
                api.watchSeats.sort((a, b) => a - b)
            }
            return true
        },
        // Fresh stage only (new seed on 'go'): every buffer starts clean. A
        // DESYNC resync must NOT call this — pad samples already sent are
        // final (the sampling law) and the peer may have consumed ticks past
        // the snapshot. Resync restores the sim and lets the streams resume.
        reset(k0 = 0) {
            own = new Map(); remote = new Map(); ours = new Map(); peerH = new Map()
            nextSample = k0 + 1 // the fresh sim sits at k0; its first tick is k0+1
            pending.length = 0
            stalls = 0; stallRun = 0; maxStallRun = 0
            stalledSeat = -1
            dropped.clear()
            snapInbox.reset()
        },
        // Sample EVERY tick up to target (simTick + delay) — the sim consumes
        // pads at tick granularity — but only put a batch on the wire every
        // SAMPLE_EVERY ticks (~30 Hz/box, rate-safe at the room's window).
        pumpTo(target, readPad) {
            while (nextSample <= target) {
                const k = nextSample++
                const m = padMask(readPad(k))
                own.set(k, m)
                pending.push(m)
                if (pending.length >= SAMPLE_EVERY) {
                    const kk = k - pending.length + 1
                    send('pad', { k: kk, mm: { [api.mySeat]: pending.slice() } })
                    pending.length = 0
                }
            }
        },
        gotPad(msg) {
            if (!msg || typeof msg.k !== 'number') return
            const mm = msg.mm || {}
            for (const s of Object.keys(mm)) {
                const seat = s | 0
                if (seat < 0 || seat >= SEATS || seat === api.mySeat) continue
                if (dropped.has(seat)) continue // dead seat's pads stay dead
                const v = mm[s]
                if (Array.isArray(v)) v.forEach((mask, i) => remote.set(msg.k + i, mask | 0))
                else remote.set(msg.k, v | 0)
            }
        },
        // May tick k run? Every non-CPU watch seat must have a mask for k.
        ready(k, cpuMasks = {}) {
            let ok = true
            stalledSeat = -1
            for (const seat of api.watchSeats || []) {
                if (cpuMasks[seat] !== undefined) continue // CPU: computed locally at k
                const mine = (seat === api.mySeat) ? own.has(k) : remote.has(k)
                if (!mine) { ok = false; if (stalledSeat < 0) stalledSeat = seat }
            }
            if (ok) stallRun = 0
            else { stalls++; stallRun++; if (stallRun > maxStallRun) maxStallRun = stallRun }
            return ok
        },
        // The sim's pads array for tick k: [driver, co].
        assemble(k, cpuMasks = {}) {
            const pads = []
            for (let seat = 0; seat < SEATS; seat++) {
                // m == null (loose): a seat absent from own must fall through
                // to remote, then CPU — a strict undefined-check once silently
                // zeroed every remote pad (the soslinkcheck tick-60 bug).
                let m = null
                if (seat === api.mySeat) m = own.get(k)
                if (m == null) m = remote.get(k)
                if (m == null && cpuMasks[seat] !== undefined) m = cpuMasks[seat]
                pads.push(unmaskPad(m == null ? 0 : m))
            }
            return pads
        },
        hash(k, h) {
            ours.set(k, h >>> 0)
            send('hs', { k, h: h >>> 0 })
            return api.check(k, h >>> 0)
        },
        gotHash(k, h) {
            peerH.set(k | 0, h >>> 0)
            return ours.has(k | 0) ? api.check(k | 0, ours.get(k | 0)) : null
        },
        // a tick hash must agree with the peer's — one stage, two identical views.
        check(k, h) {
            const theirs = peerH.get(k)
            if (theirs === undefined) return null
            if (theirs !== (h >>> 0)) return { desync: k, mine: h >>> 0, theirs }
            return null
        },
        prune(k) {
            shrink(ours, k); shrink(peerH, k); shrink(own, k); shrink(remote, k)
        },
        // harness peek: does any buffer hold a pad for seat@tick?
        hasPad(seat, k) {
            return (seat === api.mySeat ? own : remote).has(k)
        },
        // harness/debug view: who has a sample for tick k.
        debug(k) {
            const d = { nextSample, stalls, stallRun }
            for (const seat of [0, 1]) {
                d[`s${seat}`] = `${(seat === api.mySeat ? own : remote).has(k) ? 'o' : '-'}`
            }
            return d
        },
    }
    api.watchSeats = (opts.watchSeats || []).slice()
    return api
}

// The CPU fallback for a seat no one drives (never joined, or dropped after
// the grace): the same emitters the attract uses, computed at tick time.
// Returns the wire MASK, not the raw pad: assemble() treats cpuMasks values
// as masks (unmaskPad does `m | 0`), and a raw pad object masks to NaN -> 0,
// a permanently released pad — the demoted co would never call a note again
// (the walkaway test pins the note flow after the flip).
export function cpuSeatPad(g, seat) {
    return padMask(seat === 1 ? cpuCoDriverPad(g) : cpuDriverPad(g))
}
