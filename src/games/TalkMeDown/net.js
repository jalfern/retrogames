// TALK ME DOWN REMOTE (#1880) — one bomb on two boxes, the manual in a
// different room. The engine was born for this: seed + per-seat pad streams
// give identical hashes (#494), so the two boxes run the SAME deterministic
// sim and only swap pads on the wire — the SOS sampling law (#531) as proven
// by BombDefuse online (#1819), with the walkaway laws bent to THIS game's
// roles:
//
//   host  = seat 0 = DEFUSER (hands, panel, flip)
//   guest = seat 1 = MANUAL  (pages, lines, flags)
//
// Wire (FORWARD_TYPES only — no relay redeploy):
//   {t:'go',  seed}                 host kickoff — one seed, one shared run
//   {t:'pad', k, mm:{seat:[m]}}   this box's own seat mask, batched every
//                                 SAMPLE_EVERY ticks (absolute stamps)
//   {t:'hs',  k, h}               whole-sim hash every HASH_EVERY ticks
//   {t:'res', e:'req'}            guest -> host: "put me back in sync"
//   {t:'res', e:'snp', i, z, p, k}  host snapshot chunk (512B-safe)
//   {t:'res', e:'rejoin'}         guest page reload: "seat me in the LIVE run"
//   {t:'res', e:'back', k}       host yes — k is the shared flip tick
//
// Walkaway, role-honest (the law that makes this TMD and not a shooter):
//  * guest gone  -> the host demotes seat 1: players flips to 1 and the
//    engine's CPU manual partner (partnerSay) takes back the rail. The bomb
//    stays defusable solo — the run never freezes because a friend left.
//  * host gone   -> the guest FREEZES (the manual seat owns no hands; there
//    is no role inversion: the page-holder cannot become the defuser). The
//    shell stops ticking, shows DEFUSER OFFLINE, and any key walks the guest
//    back to the lobby. Host authority stands — a returning host re-`go`es.
//
// A returning guest (#1838 law): rejoin -> back(stamped flip tick) + snapshot
// chunks + pad backfill. Both boxes flip players on the SAME sim tick, so
// hash equality survives the hand-back.
//
// Pure: no DOM, no WebSocket — `send` is injected, so scripts/tmdlinkcheck.mjs
// proves the whole protocol in plain Node over relay/core.js rules, zero
// sockets.

import { createGame } from './engine.js'

export const SEATS = 2
export const PAD_DELAY = 8      // ~133 ms of input delay: past round-trip, below feel
export const SAMPLE_EVERY = 2   // wire granularity (~30 Hz batches per box)
export const HASH_EVERY = 60    // ~1 s whole-sim hash boundary
export const DROP_GRACE = 30    // ~0.5 s of missing pads => the seat demotes
export const CHUNK = 380        // relay budget 512B, sig-lesson sizing
export const RESEAT_LEAD = PAD_DELAY + 2   // hand-back lands 10 ticks past —
                                            // inside the pad lead plus round-trip slack
export const RESEAT_WINDOW = 180           // ~3 s of honoured patience for a
                                            // returner; past it the stall law re-arms

// the six fields a pad carries — one byte on the wire.
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
// Every mutable gs field is integer, string or boolean — except the rng
// counter, the one thing the seed alone cannot rebuild mid-run (draws happen
// at bomb load, and the next bomb still needs the stream position).
export function snapshotNet(gs) {
    return {
        seed: gs.seed, players: gs.players, tick: gs.tick,
        round: gs.round, score: gs.score, strikes: gs.strikes,
        bombs: gs.bombsCleared, done: gs.done ? 1 : 0, won: gs.won ? 1 : 0,
        boomTick: gs.boomTick, fuse: gs.fuse, fuseMax: gs.fuseMax,
        fx: [gs.features.serial, gs.features.leds, gs.features.bolt, gs.features.serialDigit, gs.features.batteries],
        mods: gs.modules.map(m => [
            m.type, m.stamp, m.solved ? 1 : 0, m.locked, m.flash, m.dial ?? -1,
            m.wires ? m.wires.map(w => [w.color, w.lit ? 1 : 0, w.cut ? 1 : 0]) : 0,
        ]),
        cur: [gs.cursor.mod, gs.cursor.sub], curFlash: gs.cursorFlash,
        man: [gs.manual.page, gs.manual.line, gs.manual.flag || '', gs.manual.flagTicks],
        ord: [gs.order || '', gs.orderFor, gs.orderTicks],
        clearFlash: gs.clearFlash, flip: gs.flip,
        seq: Object.entries(gs.seqInput).map(([k, v]) => [k | 0, v.slice()]),
        rng: gs.rng.state(),
    }
}

export function restoreNet(snap) {
    const gs = createGame(snap.seed >>> 0 || 1, snap.players > 1 ? 2 : 1)
    gs.tick = snap.tick | 0
    gs.round = snap.round | 0
    gs.score = snap.score | 0
    gs.strikes = snap.strikes | 0
    gs.bombsCleared = snap.bombs | 0
    gs.done = !!snap.done
    gs.won = !!snap.won
    gs.boomTick = snap.boomTick | 0
    gs.fuse = snap.fuse | 0
    gs.fuseMax = snap.fuseMax | 0
    gs.features = {
        serial: String(snap.fx[0]), leds: snap.fx[1] | 0, bolt: snap.fx[2] | 0,
        serialDigit: snap.fx[3] | 0, batteries: snap.fx[4] | 0,
    }
    gs.modules = snap.mods.map(r => ({
        type: r[0], stamp: r[1], solved: !!r[2], locked: r[3] | 0, flash: r[4] | 0,
        dial: r[5] >= 0 ? r[5] : undefined,
        wires: r[6] ? r[6].map(w => ({ color: w[0], lit: !!w[1], cut: !!w[2] })) : undefined,
    }))
    gs.cursor = { mod: snap.cur[0] | 0, sub: snap.cur[1] | 0 }
    gs.cursorFlash = snap.curFlash | 0
    gs.manual = {
        page: snap.man[0] | 0, line: snap.man[1] | 0,
        flag: snap.man[2] || null, flagTicks: snap.man[3] | 0,
    }
    gs.order = snap.ord[0] || null
    gs.orderFor = snap.ord[1] | 0
    gs.orderTicks = snap.ord[2] | 0
    gs.clearFlash = snap.clearFlash | 0
    gs.flip = snap.flip | 0
    gs.seqInput = {}
    for (const [k, v] of snap.seq || []) gs.seqInput[k] = v.slice()
    gs.rng.setState(snap.rng | 0)
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

// createTmdSync(opts):
//   send(type, payload)          ride the room (adds {t, s} framing)
//   mySeat                       seat THIS browser owns (host 0, guest 1)
//   watchSeats                   live peer seats to wait on
// Tick contract (mirrors the proven BombDefuse #1819 core):
//   pumpTo(target, readPad)      sample own seat's held keys up to target
//   ready(k)                     may tick k run? (peer pad in, or peer demoted)
//   assemble(k)                  [seat0pad, seat1pad] — demoted seat stays {}
//                                so the engine's CPU manual covers (players=1)
//   solo()                       seat 1 demoted (shell flips gs.players to 1)
//   hash(k, h) / gotHash(k, h)   boundary compare against the one peer
export function createTmdSync(opts = {}) {
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
    const dropped = new Set() // demoted seats: wire pads DEAD — a straggler
                              // batch must never outrank the CPU partner
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
        // Guest walkaway (host side): the manual seat falls to the CPU
        // partner. Dropping the seat's stale remote samples is the
        // load-bearing part. Seat 0 is never demoted here — the defuser
        // seat is the run's spine (see the host-gone law in the header).
        demote(seat) {
            if (seat === 0) return false
            const i = api.watchSeats.indexOf(seat)
            if (i < 0) return false
            api.watchSeats.splice(i, 1)
            dropped.add(seat)
            remote.clear()
            api.reseatTick = null
            if (stalledSeat === seat) { stalledSeat = -1; stallRun = 0 }
            return true
        },
        // Mirror of demote (#1838 rejoin): pads from the seat must be
        // stored again once the returner is back on the wire.
        promote(seat) {
            if (!dropped.delete(seat)) return false
            if (api.watchSeats.indexOf(seat) < 0) {
                api.watchSeats.push(seat)
                api.watchSeats.sort((a, b) => a - b)
            }
            return true
        },
        // #1838 in-flight reseat: until the shared flip tick k, assemble()
        // keeps seat 1 the partner's — the returning player's pads ride the
        // wire but must not outrank the CPU until BOTH boxes seat the human
        // on the same sim tick (hash equality survives the flip).
        reseatTick: null,
        // The returner's rebuild base: fresh own/hash buffers, sampling
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
        // The sim's pads array for tick k: [seat0, seat1]. Seat 0 is the
        // defuser's — on this game only seat 1 ever demotes (host-gone is
        // a freeze, not a demote), so a dropped seat always lands pads[1] =
        // {} and the engine's CPU manual covers with players=1.
        assemble(k) {
            const pads = [{}, {}]
            const m0 = (api.mySeat === 0 ? own : remote).get(k)
            const m1 = (api.mySeat === 1 ? own : remote).get(k)
            if (m0 != null) pads[0] = unmaskPad(m0)
            if (m1 != null && !dropped.has(1)) pads[1] = unmaskPad(m1)
            // #1838: until the shared flip tick the seat stays the CPU's —
            // the returning player's pads ride the wire but must not
            // outrank the partner until BOTH boxes flip on the same tick.
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
        // batches sent while its socket was gone are gone. `own` still holds
        // them (sampling runs PAD_DELAY ahead): answer the hand-back with one
        // catch-up batch. Late is legal; absent is fatal.
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
