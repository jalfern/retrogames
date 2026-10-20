// LOCKSTEP (#531) — the client half of online 2P. Both browsers run the SAME
// deterministic sim (seed + pad streams => same hash, the slotcheck law) and
// exchange exactly three message types over the relay:
//   {t:'pad', k, p}  my pad for tick k (p = the one pad, #420)
//   {t:'hs',  k, h}  my state hash at tick k (every hashEvery ticks)
//   {t:'start', seed, hero, peerHero}  host -> guest at kickoff
// A tick k runs only when BOTH pads for k are in. Pads are sent D ticks ahead
// (input delay) so network latency hides behind the delay buffer; held
// directions are resampled every frame and re-sent until tick k executes.
// Hashes are verified at every hashEvery boundary; a mismatch is a DESYNC —
// callers must freeze and say so on screen. Pure: no DOM, no WebSocket —
// `send` is injected, so netcheck runs two of these over an in-memory pipe
// against real Gauntlet sims.

export const WIRE = { PAD: 'pad', HASH: 'hs', START: 'start' }

export function normalizeWirePad(p) {
    const o = p || {}
    return { l: !!o.l, r: !!o.r, u: !!o.u, d: !!o.d, s: !!o.s, a: !!o.a }
}

export function createLockStep(opts = {}) {
    const delay = Number.isFinite(opts.delay) ? opts.delay : 4
    const hashEvery = Number.isFinite(opts.hashEvery) ? opts.hashEvery : 30
    const send = typeof opts.send === 'function' ? opts.send : () => {}
    const KEEP = 240
    let local = new Map()
    let remote = new Map()
    let ours = new Map()
    let peerH = new Map()
    let stalls = 0

    const shrink = (map, k) => {
        for (const key of map.keys()) if (key < k - KEEP) map.delete(key)
    }

    return {
        delay,
        hashEvery,
        reset() {
            local = new Map(); remote = new Map(); ours = new Map(); peerH = new Map(); stalls = 0
        },
        // driver samples the local pad fresh each frame for k..k+delay
        sample(k, pad) { local.set(k, normalizeWirePad(pad)) },
        // send this tick and the lookahead (peers overwrite by k; last wins)
        publish(k) {
            for (let j = 0; j <= delay; j++) {
                const p = local.get(k + j)
                if (p) send({ t: WIRE.PAD, k: k + j, p })
            }
        },
        gotPad(k, pad) { remote.set(k, normalizeWirePad(pad)) },
        ready(k) { return local.has(k) && remote.has(k) },
        pads(k) { return [local.get(k) || normalizeWirePad(), remote.get(k) || normalizeWirePad()] },
        // pad is late: caller holds the sim (and must count it).
        stall() { stalls++; return stalls },
        // hash at a boundary: send + compare now, or remember for when it lands.
        hash(k, h) {
            ours.set(k, h)
            send({ t: WIRE.HASH, k, h })
            if (peerH.has(k)) {
                const p = peerH.get(k)
                return p === h ? { ok: k } : { desync: k, mine: h, theirs: p }
            }
            return null
        },
        gotHash(k, h) {
            peerH.set(k, h)
            if (ours.has(k)) {
                const mine = ours.get(k)
                return mine === h ? { ok: k } : { desync: k, mine, theirs: h }
            }
            return null
        },
        prune(k) { shrink(local, k); shrink(remote, k); shrink(ours, k); shrink(peerH, k) },
        stats() { return { local: local.size, remote: remote.size, stalls } },
    }
}
