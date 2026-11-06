// LOCKSTEP (#531) — the client half of online 2P. Both browsers run the SAME
// deterministic sim (seed + pad streams => same hash, the slotcheck law) and
// exchange exactly three message types over the relay:
//   {t:'pad', k, p}    my FINAL pad for tick k (p = the one pad, #420)
//   {t:'hs',  k, h}    my state hash at tick k (every hashEvery ticks)
//   {t:'start', seed, hero, peerHero}  host -> guest at kickoff
// A tick k runs only when the peer's pad for k is in. THE SAMPLING LAW: each
// pad is sampled ONCE, D ticks ahead of the sim, and never resampled — the
// sim at tick k consumes the pad taken D frames ago (that is the input
// delay, and it makes pad streams absolute, so both boxes execute identical
// streams; "resample and resend until due" does NOT: the peer may already
// have run the tick on the earlier value — netcheck proved it). Button
// EDGES belong to the oldest unsampled tick only, so one press never fires
// twice. Hashes are verified at every hashEvery boundary, on both edges of
// the exchange (hash() and gotHash() compare); a mismatch is a DESYNC —
// callers must freeze and say so on screen. Pure: no DOM, no WebSocket —
// `send` is injected, so netcheck runs two of these over an in-memory pipe
// against real Gauntlet sims.

export const WIRE = { PAD: 'pad', HASH: 'hs', START: 'start' }

// #546 item 2: backoff for auto-reconnecting a dropped WS while still waiting
// for a partner — 400ms, doubling, capped at 8s so a dead relay is not
// hammered. Pure so netcheck can pin the ladder.
export function retryDelay(attempt, base = 400, cap = 8000) {
    return Math.min(cap, base * 2 ** Math.max(0, attempt | 0))
}

export function normalizeWirePad(p) {
    const o = p || {}
    const n = { l: !!o.l, r: !!o.r, u: !!o.u, d: !!o.d, s: !!o.s, a: !!o.a }
    // #1705: mask-shaped pads (GravelYard's {m}) ride this same pipeline; the
    // normalizer used to erase `m`, which left every yard pad empty on the
    // mirror side. Numbers pass through intact; field-shaped pads unchanged.
    if (Number.isFinite(o.m)) n.m = o.m | 0
    return n
}

export function createLockStep(opts = {}) {
    const delay = Number.isFinite(opts.delay) ? opts.delay : 4
    const hashEvery = Number.isFinite(opts.hashEvery) ? opts.hashEvery : 30
    const send = typeof opts.send === 'function' ? opts.send : () => {}
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now()
    const KEEP = 240
    let local = new Map()
    let remote = new Map()
    let remoteAt = new Map()
    let lastArrival = 0
    let ours = new Map()
    let peerH = new Map()
    // N-peer mode (#1705): when peers is set (live remote slot ids), pads and
    // hashes key by slot and a tick runs only when EVERY peer's pad for k has
    // landed; the hash referee compares against every peer. Left null it is the
    // exact single-peer law every 2P game shipped on — netcheck pins that.
    let peers = Array.isArray(opts.peers) && opts.peers.length ? opts.peers.slice() : null
    let bySlot = new Map()  // slot -> Map(k -> pad)
    let hBySlot = new Map() // slot -> Map(k -> hash)
    let stalls = 0
    let stallRun = 0
    let maxStallRun = 0
    let nextSend = 0

    const shrink = (map, k) => {
        for (const key of map.keys()) if (key < k - KEEP) map.delete(key)
    }

    const compare = (k, theirs, mine) => {
        return theirs === mine ? { ok: k } : { desync: k, mine, theirs }
    }

    return {
        delay,
        hashEvery,
        reset() {
            local = new Map(); remote = new Map(); remoteAt = new Map(); lastArrival = 0
            ours = new Map(); peerH = new Map()
            bySlot = new Map(); hBySlot = new Map()
            stalls = 0; stallRun = 0; maxStallRun = 0; nextSend = 0
        },
        // #1705: freeze the live peer roster at kickoff (host starts with what
        // the roster says). Call right after reset(). Null = single-peer law.
        setPeers(slots) {
            peers = Array.isArray(slots) && slots.length ? slots.slice() : null
            bySlot = new Map(); hBySlot = new Map()
        },
        // Sample every tick from nextSend up to target (= simTick + delay),
        // stamp it and send it — final, once. readPad(t) answers the live pad.
        pumpTo(target, readPad) {
            const start = nextSend
            while (nextSend <= target) {
                const p = normalizeWirePad(readPad(nextSend))
                if (nextSend > start) { p.s = false; p.a = false }
                local.set(nextSend, p)
                send({ t: WIRE.PAD, k: nextSend, p })
                nextSend++
            }
        },
        gotPad(k, pad, slot = 0) {
            const p = normalizeWirePad(pad)
            if (peers) {
                let m = bySlot.get(slot)
                if (!m) { m = new Map(); bySlot.set(slot, m) }
                m.set(k, p)
            } else remote.set(k, p)
            const at = now()
            remoteAt.set(k, at)
            if (at > lastArrival) lastArrival = at
        },
        // #546 item 1: age (ms) of the freshest remote pad at time `at` —
        // ~0 when the wire is healthy and the buffer keeps pace, it grows
        // when the friend lags. -1 until any pad has landed.
        padAge(at) { return lastArrival ? at - lastArrival : -1 },
        ready(k) {
            let r
            if (peers) {
                r = true
                for (const s of peers) { const m = bySlot.get(s); if (!m || !m.has(k)) { r = false; break } }
            } else r = remote.has(k)
            if (r) stallRun = 0
            return r
        },
        stall() { stalls++; stallRun++; if (stallRun > maxStallRun) maxStallRun = stallRun; return stalls },
        pads(k) { return [local.get(k) || normalizeWirePad(), remote.get(k) || normalizeWirePad()] },
        // hash at a boundary: send + compare now, or remember for when it lands.
        // In N-peer mode every peer is refereed: any mismatch is a desync.
        hash(k, h) {
            ours.set(k, h)
            send({ t: WIRE.HASH, k, h })
            if (peers) {
                for (const s of peers) {
                    const m = hBySlot.get(s)
                    if (m && m.has(k)) { const r = compare(k, m.get(k), h); if (r.desync !== undefined) return r }
                }
                return null
            }
            if (peerH.has(k)) return compare(k, peerH.get(k), h)
            return null
        },
        gotHash(k, h, slot = 0) {
            if (peers) {
                let m = hBySlot.get(slot)
                if (!m) { m = new Map(); hBySlot.set(slot, m) }
                m.set(k, h)
                if (ours.has(k)) return compare(k, h, ours.get(k))
                return null
            }
            peerH.set(k, h)
            if (ours.has(k)) return compare(k, ours.get(k), h)
            return null
        },
        prune(k) {
            shrink(local, k); shrink(remote, k); shrink(remoteAt, k); shrink(ours, k); shrink(peerH, k)
            for (const m of bySlot.values()) shrink(m, k)
            for (const m of hBySlot.values()) shrink(m, k)
        },
        stats() {
            const remoteN = peers ? [...bySlot.values()].reduce((n, m) => n + m.size, 0) : remote.size
            return { local: local.size, remote: remoteN, stalls, stallRun, maxStallRun }
        },
    }
}
