// BOMB DEFUSE ONLINE (#1819) — the 2-seat lockstep this sim was born for.
// Host = seat 0, guest = seat 1; both boxes run the SAME deterministic sim
// from the seed the `go` carries, sampling each other's pads D ticks ahead
// (the SOS sampling law, #531): pads are absolute per tick, so seed + pads
// => the same integer hash on both boxes (this engine is seed-pure and
// integer-only — the #1793 lesson was applied before the fact).
//
// Wire (FORWARD_TYPES only — no relay redeploy):
//   {t:'go',  seed}                host kickoff — one seed, one shared run
//   {t:'pad', k, mm:{seat:[m]}}   this box's own seat mask, batched every
//                                 SAMPLE_EVERY ticks (absolute ticks)
//   {t:'hs',  k, h}              whole-sim hash every HASH_EVERY ticks
//   {t:'res', e:'req'}           "put me back in sync" (guest -> host)
//   {t:'res', e:'snp', i, z, p, k}  host snapshot chunk (512B-safe)
//   {t:'res', e:'rejoin'}        #1838 returner: "seat me in the LIVE run"
//   {t:'res', e:'back', k}       host yes — k is the shared flip tick, chunks follow
//
// A walkaway is not a crash: this engine already covers an empty seat 2 with
// its partner emitter (players=1 && pad[1] all-false). When the peer's pads
// stop for DROP_GRACE stalled ticks the surviving box flips gs.players to 1
// and feeds the survivor's mask into seat 0 — the run keeps burning with the
// CPU partner instead of freezing a frame. If the SURVIVOR is the guest
// (host lost), its own pads drive seat 0: one defuser, one partner, on every
// live box. Host authority stands: a snapshot resync past a partial-link
// drift snaps the guest back to the host's truth.
//
// Desync: any hash-boundary mismatch freezes the guest; the host snapshots
// (chunked) and the guest restores at the SAME tick — pad streams PRESERVED,
// samples already sent are final (the sampling law).
//
// Pure: no DOM, no WebSocket — `send` is injected, so
// scripts/defuselinkcheck.mjs proves the whole protocol in plain Node over an
// in-memory room (relay/core.js rules, zero sockets).

import { createGame } from './engine.js'

export const SEATS = 2
export const PAD_DELAY = 8      // ~133 ms of input delay: past round-trip, below feel
export const SAMPLE_EVERY = 2   // wire granularity (~30 Hz batches per box)
export const HASH_EVERY = 60    // ~1 s whole-sim hash boundary
export const DROP_GRACE = 30    // ~0.5 s of missing pads => the partner covers
export const CHUNK = 380        // relay budget 512B, sig-lesson sizing
export const RESEAT_LEAD = PAD_DELAY + 2   // #1838: hand-back lands 10 ticks past
                                            // the snapshot stamp — inside the pad
                                            // lead plus round-trip slack
export const RESEAT_WINDOW = 180          // ~3 s: back + chunks + reload + first
                                            // masks; past it the stall law re-arms

// the six fields either seat reads — one byte on the wire.
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
// The whole mutable gs is integers and booleans — plus the rng counter, the
// one thing the seed alone cannot rebuild mid-run (draws happen at step load).
export function snapshotNet(gs) {
    return {
        seed: gs.seed, players: gs.players, tick: gs.tick, bomb: gs.bomb, step: gs.step,
        fuse: gs.fuse, score: gs.score, strikes: gs.strikes, done: gs.done ? 1 : 0, won: gs.won ? 1 : 0,
        intro: gs.intro, stepT: gs.stepT, keyT: gs.keyT, armedT: gs.armedT,
        keys: [gs.keys[0] ? 1 : 0, gs.keys[1] ? 1 : 0],
        armed: [gs.armed[0] ? 1 : 0, gs.armed[1] ? 1 : 0],
        sel: [gs.sel[0], gs.sel[1]], held: gs.held ? 1 : 0,
        phase: gs.phase, needleT: gs.needleT, zone: gs.zone,
        // #1831: the edge memory must ride the snapshot too — restored without
        // it, a guest would fire a press the host already consumed (the key
        // was down at resync time), and the hash boundary would never agree.
        pp: gs.prevPad.map(p => (p.up ? 1 : 0) | (p.down ? 2 : 0) | (p.a ? 4 : 0)),
        lead: gs.brain.syncLead, follow: gs.brain.follow, rx: gs.rng.x(),
    }
}

export function restoreNet(snap) {
    const gs = createGame(snap.seed >>> 0 || 1, snap.players > 1 ? 2 : 1)
    gs.tick = snap.tick | 0
    gs.bomb = snap.bomb | 0
    gs.step = snap.step | 0
    gs.fuse = snap.fuse | 0
    gs.score = snap.score | 0
    gs.strikes = snap.strikes | 0
    gs.done = !!snap.done
    gs.won = !!snap.won
    gs.intro = snap.intro | 0
    gs.stepT = snap.stepT | 0
    gs.keyT = snap.keyT | 0
    gs.armedT = snap.armedT | 0
    gs.keys = [!!snap.keys[0], !!snap.keys[1]]
    gs.armed = [!!snap.armed[0], !!snap.armed[1]]
    gs.sel = [snap.sel[0] | 0, snap.sel[1] | 0]
    gs.held = !!snap.held
    gs.phase = snap.phase | 0
    gs.needleT = snap.needleT | 0
    gs.zone = snap.zone | 0
    // #1831: rebuild the edge memory — keys held at resync stay "already
    // fired" on the guest, exactly as the host sees them (missing snap.pp =
    // an old host: all-released, the pre-edge semantics of one press/tick).
    const pp = snap.pp || [0, 0]
    gs.prevPad = pp.map(v => ({ up: !!(v & 1), down: !!(v & 2), left: false, right: false, a: !!(v & 4), b: false }))
    gs.brain.syncLead = snap.lead | 0
    gs.brain.follow = snap.follow | 0
    gs.rng.x(snap.rx)
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

// createDefuseSync(opts):
//   send(type, payload)          ride the room (adds {t, s} framing)
//   mySeat                       the seat THIS browser drives (0 host, 1 guest)
//   watchSeats                   live human seats to wait on (the peer)
//   delay / hashEvery            wire tuning (defaults above)
// Tick contract (called from the game loop):
//   pumpTo(target, readPad)      sample own seat's held keys up to target
//   ready(k)                     may tick k run? (peer pad in, or peer demoted)
//   assemble(k)                  [seat0pad, seat1pad] — demoted seats stay {}
//                                so the engine's partner covers (players=1)
//   solo()                       any seat demoted (shell flips gs.players to 1)
//   hash(k, h) / gotHash(k, h)   both-edge compare against the one peer
// Wire inbound (the room.on handlers forward here):
//   gotPad(msg)                  {k, mm} from the peer
//   snapInbox                    chunk reassembler for host resync
export function createDefuseSync(opts = {}) {
    const delay = Number.isFinite(opts.delay) ? opts.delay : PAD_DELAY
    const hashEvery = Number.isFinite(opts.hashEvery) ? opts.hashEvery : HASH_EVERY
    const send = typeof opts.send === 'function' ? opts.send : () => {}
    const KEEP = 1080
    let nextSample = 1
    let pending = []
    let own = new Map()    // k -> mask (own seat's samples)
    let remote = new Map() // k -> mask (the peer's seat)
    let ours = new Map()   // k -> h
    let peerH = new Map()  // k -> h
    let stalls = 0, stallRun = 0, maxStallRun = 0
    let stalledSeat = -1
    const dropped = new Set() // demoted seats: their wire pads are DEAD — a
                              // straggler batch must never outrank the partner
    const snapInbox = makeSnapInbox()

    const shrink = (map, k) => { for (const key of map.keys()) if (key < k - KEEP) map.delete(key) }

    const api = {
        delay,
        hashEvery,
        snapInbox,
        mySeat: (opts.mySeat | 0) % SEATS,
        watchSeats: (opts.watchSeats || []).slice(),
        stats: () => ({ stalls, stallRun, maxStallRun, nextSample, stalledSeat }),
        solo: () => dropped.size > 0,
        droppedSeats: () => [...dropped].sort(),
        // Walkaway: the peer seat falls to the engine's partner. Dropping the
        // seat's stale remote samples is the load-bearing part.
        demote(seat) {
            const i = api.watchSeats.indexOf(seat)
            if (i < 0) return false
            api.watchSeats.splice(i, 1)
            dropped.add(seat)
            remote.clear()
            api.reseatTick = null
            if (stalledSeat === seat) { stalledSeat = -1; stallRun = 0 }
            return true
        },
        // Mirror of demote: used by the fresh-'go' path AND by the host when
        // it answers a #1838 rejoin (pads from the seat must be stored again).
        promote(seat) {
            if (!dropped.delete(seat)) return false
            if (api.watchSeats.indexOf(seat) < 0) {
                api.watchSeats.push(seat)
                api.watchSeats.sort((a, b) => a - b)
            }
            return true
        },
        // #1838 in-flight reseat. When set, assemble() keeps seat 1 empty
        // (engine partner keeps burning) until the shared flip tick k, where
        // BOTH boxes step with players=2 — flip tied to the sim tick, never
        // the wall clock, so hash equality survives the hand-back.
        reseatTick: null,
        // The returner's own rebuild base: fresh own/hash buffers, sampling
        // resumes at k0+1. REMOTE IS PRESERVED — the host's masks buffered
        // while the page reloaded are exactly what lockstep resumes on.
        reseatBase(k0) {
            own = new Map(); ours = new Map(); peerH = new Map()
            pending.length = 0
            nextSample = k0 + 1
            stalls = 0; stallRun = 0
            stalledSeat = -1
        },
        // Fresh run only (new seed on 'go'). A DESYNC resync must NOT call
        // this — samples already sent are final (the sampling law).
        reset(k0 = 0) {
            own = new Map(); remote = new Map(); ours = new Map(); peerH = new Map()
            nextSample = k0 + 1
            pending.length = 0
            stalls = 0; stallRun = 0; maxStallRun = 0
            stalledSeat = -1
            dropped.clear()
            api.reseatTick = null
            snapInbox.reset()
        },
        // Sample every tick up to target, batch on the wire every SAMPLE_EVERY.
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
        // May tick k run? Every still-watched seat must have a mask for k.
        ready(k) {
            let ok = true
            stalledSeat = -1
            for (const seat of api.watchSeats) {
                const mine = (seat === api.mySeat) ? own.has(k) : remote.has(k)
                if (!mine) { ok = false; if (stalledSeat < 0) stalledSeat = seat }
            }
            if (ok) stallRun = 0
            else { stalls++; stallRun++; if (stallRun > maxStallRun) maxStallRun = stallRun }
            return ok
        },
        // The sim's pads array for tick k: [seat0, seat1]. A demoted seat
        // stays {} — with gs.players=1 the engine's partner covers it. The
        // survivor always drives seat 0, so a guest left alone maps its own
        // pads there (host authority stands — a later snapshot outranks it).
        assemble(k) {
            const pads = [{}, {}]
            if (dropped.size) {
                const surv = dropped.has(0) ? 1 : 0
                const m = (surv === api.mySeat ? own : remote).get(k)
                if (m != null) pads[0] = unmaskPad(m)
                return pads
            }
            const m0 = (api.mySeat === 0 ? own : remote).get(k)
            const m1 = (api.mySeat === 1 ? own : remote).get(k)
            if (m0 != null) pads[0] = unmaskPad(m0)
            if (m1 != null) pads[1] = unmaskPad(m1)
            // #1838: until the shared flip tick the seat stays the partner's —
            // the returning player's pads ride the wire but must not outrank
            // the CPU until BOTH boxes flip players on the same tick.
            if (api.reseatTick != null && k < api.reseatTick) pads[1] = {}
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
        check(k, h) {
            const theirs = peerH.get(k)
            if (theirs === undefined) return null
            if (theirs !== (h >>> 0)) return { desync: k, mine: h >>> 0, theirs }
            return null
        },
        prune(k) {
            shrink(ours, k); shrink(peerH, k); shrink(own, k); shrink(remote, k)
        },
        // #1838: a returner rebuilt at tick k0 needs OUR masks for k0+1.. —
        // batches sent while its socket was gone are gone. We still hold them
        // in `own` (sampling runs PAD_DELAY ahead), so answer the hand-back
        // with one catch-up batch: the sampling law says stamps are absolute,
        // late delivery is legal — and without this the reseat can never tick.
        backfillPads(k0, n) {
            const arr = []
            for (let k = k0; k < k0 + n; k++) {
                const m = own.get(k)
                if (m == null) break
                arr.push(m)
            }
            return arr.length ? { k: k0, mm: { [api.mySeat]: arr } } : null
        },
        hasPad(seat, k) {
            return (seat === api.mySeat ? own : remote).has(k)
        },
        debug(k) {
            const d = { nextSample, stalls, stallRun }
            for (const seat of [0, 1]) {
                d[`s${seat}`] = `${(seat === api.mySeat ? own : remote).has(k) ? 'o' : '-'}`
            }
            return d
        },
    }
    return api
}
