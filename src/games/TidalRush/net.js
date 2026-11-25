// TIDAL RUSH ONLINE (#3220) — the meaning the room bytes carry for a three-hull
// race. Transport + roster live in src/utils/room.js, tick-sync in
// src/utils/lockstep.js (#531 sampling law, #1705 N-peer mode — GravelYard is
// the shipped precedent), the waiting room is the shared <Lobby/>. This module
// answers the game-specific questions only: which hull is which seat, what a
// pad looks like on the wire, and what a pad means once decoded.
//
// Wire pads are the six lockstep bits (l/r/u/d/s/a): throttle is the u bit,
// BRAKE the d bit, lean the l/r bits, spin the a bit, BOOST the s bit. Digital
// steering on the wire keeps the pad shape every lockstep game already proves;
// local analog stick stays local (it never leaves the box — the wire carries
// what both sims consume, and both consume exactly the bits).

import { HOST_SLOT } from '../../utils/room.js'

export const SEATS = 3            // KAI · MAKO · TUNDRA — humans fill from seat 0 up
export const PAD_DELAY = 8       // ~133 ms: past round-trip, below feel (the Blob law)
export const HASH_EVERY = 30
export const RIDE_NAMES = ['KAI', 'MAKO', 'TUNDRA']

// seatHull maps a room seat to a sim hull index — canonical on every box:
// seat 0 always rides hull 0 (KAI), seat 1 hull 1 (MAKO), seat 2 hull 2.
export function seatHull(seat) { return seat }

// wirePad squashes the sim pad {throttle, steer, brake, a, b} into six bits.
// steer quantises at ±0.5: a half-lock is a committed lean either way, and
// full-lock (the BARREL input) survives the trip exactly.
export function toWire(pad) {
    return {
        l: !!pad && pad.steer <= -0.5,
        r: !!pad && pad.steer >= 0.5,
        u: !!pad && pad.throttle > 0.5,
        d: !!(pad && pad.brake),
        a: !!(pad && pad.a),
        s: !!(pad && pad.b),
    }
}

export function fromWire(p) {
    return {
        throttle: p && p.u ? 1 : 0,
        steer: p ? (p.r ? 1 : 0) - (p.l ? 1 : 0) : 0,
        brake: !!(p && p.d),
        a: !!(p && p.a),
        b: !!(p && p.s),
    }
}

const EMPTY = () => ({ throttle: 0, steer: 0, brake: false, a: false, b: false })

// seatPads builds the sim's override map { hullId: pad } from the per-seat
// pad mirrors at tick k. Only HUMAN seats appear; CPU seats stay absent so
// sim.js keeps flying them on the seeded autopilot (and its rng draw — every
// box skips the same draws, so the streams stay identical).
export function assembleSeatPads(mirrors, k, humanSeats) {
    const out = {}
    for (const s of humanSeats) {
        const m = mirrors[s]
        out[seatHull(s)] = m && m.has(k) ? fromWire(m.get(k)) : EMPTY()
    }
    return out
}

// hostSeed rolls a 32-bit match seed at kickoff.
export function hostSeed(now = Date.now) {
    return ((now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 0x9e37
}

// --- desync evidence (#3244 item 5) -------------------------------------------
// The referee freezes the bay on divergence (#863 law: never silent) — but a
// player reporting a freeze had nothing to attach. So every hash boundary gets
// a row: tick, my hash, every peer hash that landed. The last EVIDENCE_LIMIT
// rows stay in a ring; when the referee bites, the bad row is marked and the
// whole block is on screen, copyable. Pure data + formatting lives here so
// tidalcheck can pin the report without a browser.
export const EVIDENCE_LIMIT = 8

export function hex32(h) { return (h >>> 0).toString(16).toUpperCase().padStart(8, '0') }

export function createEvidence(limit = EVIDENCE_LIMIT) {
    const ring = []
    const at = (k) => {
        let e = ring.find((x) => x.k === k)
        if (!e) {
            e = { k, mine: null, peers: {}, bad: false, badSlot: -1 }
            ring.push(e)
            if (ring.length > limit) ring.shift()
        }
        return e
    }
    return {
        get rows() { return ring },
        reset() { ring.length = 0 },
        // mine records MY hash at boundary k (the box computed it).
        mine(k, h) { at(k).mine = h >>> 0 },
        // peer records a hash that arrived from `slot` at boundary k.
        peer(k, h, slot) { at(k).peers[slot | 0] = h >>> 0 },
        // mismatchSlot answers "who disagreed?" for the hash() path, where
        // lockstep reports the mismatch but not the slot — the ring has every
        // peer hash, so the culprit is the one that differs from mine.
        mismatchSlot(k) {
            const e = ring.find((x) => x.k === k)
            if (!e) return -1
            for (const s of Object.keys(e.peers)) if (e.peers[s] !== e.mine) return s | 0
            return -1
        },
        markBad(k, slot, mine, theirs) {
            const e = at(k)
            e.bad = true
            e.badSlot = slot | 0
            e.mine = mine >>> 0
            e.theirs = theirs >>> 0
        },
        // text renders the copyable block: header, aligned columns, and a
        // MISMATCH arrow on the boundary the referee froze on.
        text(roomCode = '', seat = 0) {
            const slots = [...new Set(ring.flatMap((e) => Object.keys(e.peers).map(Number)))].sort((a, b) => a - b)
            const pad = (s, w) => String(s).padEnd(w)
            const cell = (h) => (h === null || h === undefined ? '--------' : hex32(h))
            const out = [`TIDAL RUSH desync evidence — room ${roomCode || '????'} · seat ${seat}`]
            out.push(pad('tick', 6) + pad('mine', 9) + slots.map((s) => pad(`seat${s}`, 9)).join(''))
            for (const e of ring) {
                out.push(pad(e.k, 6) + pad(cell(e.mine), 9) + slots.map((s) => pad(cell(e.peers[s]), 9)).join('')
                    + (e.bad ? `  ← MISMATCH seat${e.badSlot}: mine ${hex32(e.mine)} theirs ${hex32(e.theirs)}` : ''))
            }
            return out.join('\n')
        },
    }
}

// --- room podium (#3244 item 4) ----------------------------------------------
// The race ends INTO a room moment: the standings of every seat, by finish
// time. Lockstep means both boxes already hold identical times/scores, but the
// host still broadcasts the rows (SSX's `pod` precedent, room.js §14) so a
// guest reads the ROOM's answer instead of trusting its own sort — and the
// phase can come back to 'waiting' on every cabinet, not just the host's.
// The rematch itself is the host pressing GO again: lobby.start re-broadcasts
// 'go' with a fresh seed, and seated guests race without re-entering a code.

// podiumRows ranks every hull swift-course-first. `humans` marks who actually
// rode to the line — a seat the autopilot coasted home is not a rider.
export function podiumRows(gs, humans) {
    const live = new Set(humans)
    return gs.crafts.slice()
        .sort((a, b) => (a.finishT - b.finishT) || (a.id - b.id))
        .map((c) => ({ seat: c.id, t: c.finishT, score: c.score, human: live.has(c.id) }))
}

// podWire squashes rows onto the wire: time in tenths of a second (the sheet
// only shows tenths), seat id keeps the column honest, human rides as a bit.
export function podWire(rows) {
    return rows.map((r) => [r.seat, Math.round(r.t * 10), Math.round(r.score), r.human ? 1 : 0])
}

// podRows inflates the host's broadcast into the local sheet — names come from
// this cabinet's own table, rank is the row order the host settled.
export function podRows(rows, names) {
    return (rows || []).map((r, i) => ({
        seat: r[0] | 0,
        rank: i + 1,
        name: names[r[0] | 0] || `SEAT ${r[0]}`,
        t: (r[1] | 0) / 10,
        score: r[2] | 0,
        human: !!r[3],
    }))
}

export { HOST_SLOT }
