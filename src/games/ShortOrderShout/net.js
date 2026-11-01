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
    const snapInbox = makeSnapInbox()

    const shrink = (map, k) => { for (const key of map.keys()) if (key < k - KEEP) map.delete(key) }
    const rmap = (seat) => { let m = remote.get(seat); if (!m) { m = new Map(); remote.set(seat, m) } return m }
    const omap = (seat) => { let m = own.get(seat); if (!m) { m = new Map(); own.set(seat, m) } return m }

    const api = {
        delay,
        hashEvery,
        snapInbox,
        stats: () => ({ stalls, stallRun, maxStallRun, nextSample }),
        // Fresh shift only (new seed on 'go'): every buffer starts clean.
        // A DESYNC resync must NOT call this — pad samples already sent are
        // final (the sampling law) and peers may have consumed ticks past the
        // snapshot. Resync restores gs and lets the preserved streams resume.
        reset(k0 = 0) {
            own = new Map(); remote = new Map(); ours = new Map(); peerH = new Map()
            nextSample = k0
            pending.length = 0
            stalls = 0; stallRun = 0; maxStallRun = 0
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
            for (const s of Object.keys(mm)) {
                const seat = s | 0
                if (seat < 0 || seat >= SEATS) continue
                const v = mm[s]
                if (Array.isArray(v)) v.forEach((mask, i) => rmap(seat).set(msg.k + i, mask | 0))
                else rmap(seat).set(msg.k, v | 0)
            }
        },
        // May tick k run? Every non-CPU seat must have a mask for k.
        ready(k, cpuMasks = {}) {
            let ok = true
            for (const seat of api.watchSeats || []) {
                if (cpuMasks[seat] !== undefined) continue // CPU: computed locally at k
                const mine = (own.get(seat) || new Map()).has(k)
                const theirs = (remote.get(seat) || new Map()).has(k)
                if (!mine && !theirs) ok = false
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
