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

export { HOST_SLOT }
