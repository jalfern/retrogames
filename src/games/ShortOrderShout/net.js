// SHORT ORDER SHOUT ONLINE (#1291) — the meaning the room bytes carry for a
// 1-4 seat co-op kitchen. Transport + roster live in src/utils/room.js (via
// src/utils/lobby.js); this module answers the game-specific questions: what a
// pad looks like on the wire, which seats this browser drives, when a tick may
// run, and how a desync heals.
//
// THE SAMPLING LAW (#531, unchanged): each pad is sampled ONCE, D ticks ahead
// of the sim, and never resampled — pad streams are absolute, so every box
// executes the identical seed + pad streams through the deterministic engine
// (seed + pads => same hash, the soscheck law). The whole-sim hash ships every
// HASH_EVERY ticks and doubles as the desync detector: any mismatch freezes
// every box, the host snapshots over the wire (chunked <=380 chars inside the
// relay's 512B budget, type 'res'), and everyone resumes at the SAME tick —
// no reload (the issue's recovery clause).
//
// Wire (FORWARD_TYPES only — no relay redeploy):
//   {t:'pad', s, k, mm:{seat:mask}}  my seats' pads, sampled at tick k
//   {t:'hs',  s, k, h}              my sim hash at tick k
//   {t:'go',   seed, partner}       host kickoff (seed exchange; partner =
//                                  host drives seat 1 locally too)
//   {t:'res',  e:'req'}            "put me back in sync" (any member -> host)
//   {t:'res',  e:'snp', i, z, p}  host snapshot chunk
//   pad k:'d'  {seat,mode,at}     host seat-control cmd (#1416 gap-2 remainder):
//                                  flip seat `seat` to CPU ('cpu') or back to
//                                  human ('hum'), applied at the ANCHORED tick
//                                  k >= at on every box — never on arrival, which
//                                  would flip different ticks per box. Rides the
//                                  forwarded `pad` type like voice k:'v'.
//   pad/hs carry {c, a}            latency ping rides the existing types (#1416
//                                  gap 3): c = sender's own clock, a = [[slot, c]]
//                                  acks of recently seen peer clocks. Only your
//                                  OWN clock returns to you, so no cross-clock
//                                  skew can poison the sample — NTP by echo, no
//                                  new relay type (FORWARD_TYPES unchanged).
// Rate math: batches ride every SAMPLE_EVERY ticks (~30 Hz/member) + hashes
// ~1 Hz; four members stay well under the relay's 240 msg/s room window.
//
// Pure: no DOM, no WebSocket — `send` is injected, so scripts/soslinkcheck.mjs
// proves the whole protocol in plain Node over an in-memory room.

export const SEATS = 4
export const PAD_DELAY = 10      // ~167 ms of input delay: past relay round-trip
export const SAMPLE_EVERY = 2    // sample/send granularity; the UI latches A/B
                                 // presses >=100ms (~6 ticks), so a 2-tick sampler
                                 // can never miss an action edge
export const HASH_EVERY = 60     // ~1 s whole-sim hash boundary
export const STALL_MAX = 180     // ~3 s of missing pads => host gives up, re-kicks
export const NOTICE_AT = 120     // ~2 s: the re-kick is coming — say so, don't freeze
export const DROP_GRACE = 30     // ~0.5 s of missing pads for a seat whose player
                                 // LEFT the roster => hand it to the CPU and keep
                                 // cooking (#1416 gap 2) — a walkaway is not a crash
export const CHUNK = 380         // relay budget 512B, sig-lesson sizing

// the six fields the kitchen reads — one byte on the wire.
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

// seatsOf answers "which sim seats does the browser in relay slot `slot`
// drive?" — every browser owns its slot's seat; the host may also keep seat 1
// as a local keyboard partner (Opencooked's couch-share over the wire). Seats
// this leaves unowned are CPU, filled by the caller.
export function seatsOf(slot, hostPartner) {
    const out = slot >= 0 && slot < SEATS ? [slot] : []
    if (slot === 0 && hostPartner && out.indexOf(1) < 0) out.push(1)
    return out
}

// pure: what a box holds on screen while a human's pads have stopped arriving
// (null = keep cooking, no notice). Only the HOST can restart the shift (it
// re-kicks at STALL_MAX); a guest has no lever of its own, so it shows that the
// host is on it instead of sitting frozen on the last frame (#1379 gap 6).
export function stallNotice(stallRun, role) {
    if (!(stallRun >= NOTICE_AT)) return null
    return role === 'host' ? 'FRIEND LOST — RESTARTING SHIFT' : 'HOST RESTARTING SHIFT'
}

// seedFromRoom rolls a 32-bit match seed on the host at kickoff.
export function hostSeed(now = Date.now) {
    return ((now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 0x9e37
}

// snapshot JSON is ~800 bytes — slice it into <=380-char wire chunks. Every
// chunk carries k = the host's completed tick, the state's as-of stamp.
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

// createSosSync(opts):
//   send(type, payload)          ride the room (adds {t, s} framing)
//   mySeats                    seats THIS browser drives (numbers, ascending)
//   cpuSeats                   seats filled by deterministic local emitters
//   delay / hashEvery          wire tuning (defaults above)
// Pumping and assembly (the tick contract, called from the game loop):
//   pumpTo(target, readKeys(seat))  sample own seats' held keys up to target
//   ready(k, ownMasks)              may tick k run? (own + remote masks in)
//   assemble(k, ownMasks, cpuMasks) build the engine's pads array for tick k
//   hash(k, h) / gotHash(k, h, from)  both-edge compare against ALL peers
// Wire inbound (the game's room.on handlers forward here):
//   gotPad(msg)                     {k, mm} from a peer
//   snapInbox                       chunk reassembler for host resync
export function createSosSync(opts = {}) {
    const delay = Number.isFinite(opts.delay) ? opts.delay : PAD_DELAY
    const hashEvery = Number.isFinite(opts.hashEvery) ? opts.hashEvery : HASH_EVERY
    const send = typeof opts.send === 'function' ? opts.send : () => {}
    const KEEP = 480
    let nextSample = 0
    let pending = [] // unsent per-tick samples, flushed in SAMPLE_EVERY batches
    let own = new Map() // seat -> Map(k -> mask) (own samples, absolute ticks)
    let remote = new Map() // seat -> Map(k -> mask)
    let ours = new Map() // k -> h
    let peerH = new Map() // k -> Map(seat -> h)
    let stalls = 0, stallRun = 0, maxStallRun = 0
    let stalledSeat = -1 // which watch seat blocked the last ready() check
    const dropped = new Set() // demoted seats: their wire pads are DEAD — gotPad
                              // must not resurrect them (a straggler batch would
                              // outrank the CPU mask in assemble and poison the hash)
    const snapInbox = makeSnapInbox()

    const shrink = (map, k) => { for (const key of map.keys()) if (key < k - KEEP) map.delete(key) }
    const rmap = (seat) => { let m = remote.get(seat); if (!m) { m = new Map(); remote.set(seat, m) } return m }
    const omap = (seat) => { let m = own.get(seat); if (!m) { m = new Map(); own.set(seat, m) } return m }

    const api = {
        delay,
        hashEvery,
        snapInbox,
        stats: () => ({ stalls, stallRun, maxStallRun, nextSample, stalledSeat }),
        // Walkaway takeover (#1416 gap 2): hand watch seat `seat` to the CPU.
        // Every box stalls at the SAME tick — the first the departed member ever
        // failed to sample, since the relay FIFO-delivers their last pad batch to
        // all members before the roster change — so demoting while stalled keeps
        // pad streams identical everywhere. Dropping the seat's stale remote
        // samples is the load-bearing part: assemble() prefers remote over the
        // CPU mask, and a resurrected pad would break hash equality.
        demote(seat) {
            const i = (api.watchSeats || []).indexOf(seat)
            if (i < 0) return false
            api.watchSeats.splice(i, 1)
            dropped.add(seat)
            own.delete(seat)
            remote.delete(seat)
            if (stalledSeat === seat) { stalledSeat = -1; stallRun = 0 }
            return true
        },
        // PROMOTE (#1416 gap-2 remainder): the mirror of demote. The seat goes
        // back on the watch list and its wire pads live again; the caller owns
        // the accept-floor (pads stamped before the anchored tick `at` must be
        // rejected identically everywhere — see createSeatCtl).
        promote(seat) {
            if (!dropped.delete(seat)) return false
            if ((api.watchSeats || []).indexOf(seat) < 0) {
                api.watchSeats.push(seat)
                api.watchSeats.sort((a, b) => a - b)
            }
            return true
        },
        // Fresh shift only (new seed on 'go'): every buffer starts clean.
        // A DESYNC resync must NOT call this — pad samples already sent are
        // final (the sampling law) and peers may have consumed ticks past the
        // snapshot. Resync restores gs and lets the preserved streams resume.
        reset(k0 = 0) {
            own = new Map(); remote = new Map(); ours = new Map(); peerH = new Map()
            nextSample = k0
            pending.length = 0
            stalls = 0; stallRun = 0; maxStallRun = 0
            stalledSeat = -1
            dropped.clear()
            snapInbox.reset()
        },
        // Sample EVERY tick up to target (simTick + delay) — the engine consumes
        // pads at tick granularity — but only put a batch on the wire every
        // SAMPLE_EVERY ticks (~30 Hz/member, rate-safe at four seats). The wire
        // carries arrays; receivers expand them back to per-tick masks.
        pumpTo(target, readKeys) {
            while (nextSample <= target) {
                const k = nextSample++
                const mm = {}
                for (const seat of api.mySeats) {
                    const m = padMask(readKeys(seat, k))
                    omap(seat).set(k, m)
                    mm[seat] = m
                }
                if (Object.keys(mm).length) pending.push({ k, mm })
                if (pending.length >= SAMPLE_EVERY) {
                    const kk = pending[0].k
                    const out = {}
                    for (const [seatStr] of Object.entries(pending[0].mm)) {
                        const s = seatStr | 0
                        out[s] = pending.map((p) => p.mm[s])
                    }
                    send('pad', { k: kk, mm: out })
                    pending.length = 0
                }
            }
        },
        gotPad(msg) {
            if (!msg || typeof msg.k !== 'number') return
            const mm = msg.mm || {}
            const floorOk = (seat, k) => !dropped.has(seat) || (api.acceptFloor && api.acceptFloor(seat, k))
            for (const s of Object.keys(mm)) {
                const seat = s | 0
                if (seat < 0 || seat >= SEATS) continue
                const v = mm[s]
                // #1416: pads from a handed-off seat are dead — unless an anchored
                // PROMOTE command set an accept-floor (gap-2 remainder): pads it
                // stamped at/after `at` trail the command through the FIFO relay
                // and must enter the buffer BEFORE the flip tick runs.
                if (Array.isArray(v)) v.forEach((mask, i) => { if (floorOk(seat, msg.k + i)) rmap(seat).set(msg.k + i, mask | 0) })
                else if (floorOk(seat, msg.k)) rmap(seat).set(msg.k, v | 0)
            }
        },
        // May tick k run? Every non-CPU seat must have a mask for k.
        ready(k, cpuMasks = {}) {
            let ok = true
            stalledSeat = -1
            for (const seat of api.watchSeats || []) {
                if (cpuMasks[seat] !== undefined) continue // CPU: computed locally at k
                const mine = (own.get(seat) || new Map()).has(k)
                const theirs = (remote.get(seat) || new Map()).has(k)
                if (!mine && !theirs) { ok = false; if (stalledSeat < 0) stalledSeat = seat }
            }
            if (ok) stallRun = 0
            else { stalls++; stallRun++; if (stallRun > maxStallRun) maxStallRun = stallRun }
            return ok
        },
        // The engine's pads array for tick k (length SEATS; unused idles).
        assemble(k, cpuMasks = {}) {
            const pads = []
            for (let seat = 0; seat < SEATS; seat++) {
                // m == null (loose): a seat absent from own must fall through to
                // remote, then CPU — a strict undefined-check here once silently
                // zeroed every remote pad (soslinkcheck caught it at tick 60).
                let m = null
                if (own.has(seat)) m = own.get(seat).get(k)
                if (m == null && remote.has(seat)) m = remote.get(seat).get(k)
                if (m == null && cpuMasks[seat] !== undefined) m = cpuMasks[seat]
                pads.push(unmaskPad(m == null ? 0 : m))
            }
            return pads
        },
        hash(k, h) {
            ours.set(k, h)
            send('hs', { k, h })
            return api.check(k, h)
        },
        gotHash(k, h, from) {
            let m = peerH.get(k); if (!m) { m = new Map(); peerH.set(k, m) }
            m.set(from | 0, h >>> 0)
            return ours.has(k) ? api.check(k, ours.get(k)) : null
        },
        // a tick hash must agree with EVERY peer that reported it — one kitchen,
        // four identical views.
        check(k, h) {
            const m = peerH.get(k)
            if (!m) return null
            for (const [seat, theirs] of m) {
                if (theirs !== (h >>> 0)) return { desync: k, mine: h >>> 0, theirs, seat }
            }
            return null
        },
        prune(k) {
            shrink(ours, k); shrink(peerH, k)
            for (const [, m] of own) shrink(m, k)
            for (const [, m] of remote) shrink(m, k)
        },
        // harness peek: does any buffer hold a pad for seat@tick? (floor proof)
        hasPad(seat, k) {
            return (own.get(seat) || new Map()).has(k) || (remote.get(seat) || new Map()).has(k)
        },
        // harness/debug view: who has a sample for tick k.
        debug(k) {
            const d = { nextSample, stalls, stallRun }
            for (const seat of api.watchSeats) d[`s${seat}`] = `${(own.get(seat) || new Map()).has(k) ? 'o' : '-'}${(remote.get(seat) || new Map()).has(k) ? 'r' : '-'}`
            return d
        },
    }
    // seats whose pads must arrive (humans); refreshed by the caller whenever
    // the roster changes. CPU seats never gate a tick. Own seats are refreshed
    // the same way — both change when a friend joins or a couch partner sits.
    api.watchSeats = (opts.watchSeats || []).slice()
    api.mySeats = (opts.mySeats || []).slice()
    return api
}

// ---- latency ping (#1416 gap 3) ----------------------------------------------
// Honest per-seat RTT without touching the deterministic core and without a new
// relay type: every pad/hs already crosses the room at ~30 Hz, so the sender
// stamps its own clock (`c`) on those messages and echoes back the newest clock
// seen from each peer (`a: [[slot, c], …]`). When your own `c` comes back to
// you, now() - c is a real round trip — both legs crossed the relay and both
// ends' scheduling. Skew never enters: the echoed number is always the sender's
// own clock. HUD-only state — the sim never reads any of it, hashes unchanged.
export const RTT_STALE_MS = 5000 // no acks this long => the link went quiet — no pip
export const RTT_GOOD_MS = 120   // pip colours: green / amber / red

export function createRttTracker(opts = {}) {
    const mySlot = typeof opts.mySlot === 'function' ? opts.mySlot : () => -1
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now()
    const ACK_MAX = 3            // one pair per peer (3 peers max) — tiny on the wire
    const toAck = new Map()     // peerSlot -> newest c seen from them
    const ema = new Map()       // peerSlot -> smoothed RTT ms
    const lastAck = new Map()   // peerSlot -> when the last echo landed
    const samples = new Map()   // peerSlot -> count (first pip needs one honest sample)

    const api = {
        // wrap an outgoing pad/hs payload; other types pass through untouched.
        decorate(type, payload) {
            const p = payload || {}
            if (type !== 'pad' && type !== 'hs') return p
            const a = []
            for (const [slot, c] of toAck.entries()) {
                if (a.length >= ACK_MAX) break
                a.push([slot | 0, c])
            }
            return Object.assign({}, p, { c: now(), a })
        },
        // every inbound room message with a slot goes through here (before sync —
        // sync ignores c/a; this only watches).
        onRecv(msg) {
            if (!msg || typeof msg.s !== 'number') return
            if (typeof msg.c === 'number') toAck.set(msg.s, msg.c)
            if (!Array.isArray(msg.a)) return
            const me = mySlot()
            for (const pair of msg.a) {
                if (!Array.isArray(pair) || (pair[0] | 0) !== me) continue
                const rtt = now() - pair[1]
                if (!(rtt >= 0) || rtt > 60000) continue // impossible sample — drop it
                const prev = ema.get(msg.s) // the ack came from msg.s
                ema.set(msg.s, prev == null ? rtt : prev * 0.7 + rtt * 0.3)
                lastAck.set(msg.s, now())
                samples.set(msg.s, (samples.get(msg.s) || 0) + 1)
            }
        },
        // fresh seat -> smoothed ms, only while the link is alive and honest.
        pips() {
            const out = {}
            const t = now()
            for (const [slot, v] of ema) {
                if (t - (lastAck.get(slot) || 0) > RTT_STALE_MS) continue
                out[slot] = Math.round(v)
            }
            return out
        },
        color(ms) {
            return ms <= RTT_GOOD_MS ? '#58d048' : ms <= RTT_GOOD_MS * 2 ? '#f8d038' : '#f05030'
        },
        reset() { toAck.clear(); ema.clear(); lastAck.clear(); samples.clear() },
        stats: () => ({ acked: toAck.size, samples: samples.size }),
    }
    return api
}

// ---- host seat control (#1416 gap-2 remainder) ------------------------------
// The host demotes/promotes seats MID-SHIFT from the seat tags. A flip changes
// which masks feed the deterministic engine, so every box must flip at the SAME
// tick — the command therefore carries an anchored future tick `at`, chosen by
// the host as nextSample + CMD_LEAD. Correctness rests on two orderings:
//  * DEMOTE: pads the departed-ish seat still sends for ticks >= at trail the
//    command on the FIFO wire and land while the seat is already `dropped` on
//    every box (apply happens at tick at; pads for k < at were sent at
//    k <= at-1-PAD_DELAY, i.e. reach everyone ~PAD_DELAY before that);
//  * PROMOTE: the box owning the seat resumes sampling at k >= at - PAD_DELAY
//    - 1 (one pump AHEAD — at at - delay the pointer already sits past tick
//    at), so the ordinary pump samples tick at and its first resumed batch
//    covers tick `at`. Only stamps >= at ever pass the floor,
//    and those provably trail the command, so all buffers fill identically.
export const CMD_LEAD = 30 // ~0.5 s of runway: the cmd outruns the flip tick

export function createSeatCtl(opts = {}) {
    const delay = Number.isFinite(opts.delay) ? opts.delay : PAD_DELAY
    const hostSlot = opts.hostSlot === undefined ? 0 : opts.hostSlot | 0
    let pend = [] // {seat, mode:'cpu'|'hum', at, resumed}
    const floors = new Map() // promoted seat -> smallest accepted pad tick

    const valid = (msg) => !!msg && msg.k === 'd'
        && Number.isInteger(msg.seat) && msg.seat >= 0 && msg.seat < SEATS
        && (msg.mode === 'cpu' || msg.mode === 'hum')
        && Number.isInteger(msg.at) && msg.at > 0

    return {
        LEAD: CMD_LEAD,
        // Accept a command: the host's own click (msg.s = hostSlot) or the
        // relay-borne copy of it on a guest. One flight per seat — a second
        // order while one is anchored must wait its turn (chip taps debounce).
        queue(msg) {
            if (!valid(msg)) return false
            if ((msg.s | 0) !== hostSlot) return false // only the host commands
            if (pend.some((c) => c.seat === msg.seat)) return false
            pend.push({ seat: msg.seat | 0, mode: msg.mode, at: msg.at | 0, resumed: false })
            if (msg.mode === 'hum') floors.set(msg.seat | 0, msg.at | 0)
            return true
        },
        // Flip state for every box when its sim clock reaches the anchor.
        due(k) {
            const hit = pend.filter((c) => k >= c.at)
            if (hit.length) pend = pend.filter((c) => k < c.at)
            return hit
        },
        // The box driving a promoted seat must be back on the wire EARLY enough
        // that tick `at` still lies ahead of the sample pointer: pumpTo advances
        // nextSample every tick even while the seat is absent, so at k = at -
        // delay the pointer already sits at at + 1. Resume one pump ahead
        // (k >= at - delay - 1) and the ordinary pump then samples tick at.
        resume(k) {
            const out = []
            for (const c of pend) {
                if (c.mode === 'hum' && !c.resumed && k >= c.at - delay - 1) { c.resumed = true; out.push(c.seat) }
            }
            return out
        },
        // pad accept-floor for gotPad: only an armed promote accepts pads while
        // the seat is still dropped, and only from its anchor tick up.
        accept(seat, k) {
            const f = floors.get(seat | 0)
            return f !== undefined && k >= f
        },
        clearFloor(seat) { floors.delete(seat | 0) },
        clear() { pend = []; floors.clear() },
        stats: () => ({ pending: pend.map((c) => ({ seat: c.seat, mode: c.mode, at: c.at })) }),
    }
}
