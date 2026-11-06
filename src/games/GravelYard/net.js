// GRAVEL YARD ONLINE (#1672 — lobby seats) — the meaning the room bytes carry
// for the yard. Transport + roster live in src/utils/room.js (via lobby.js) and
// the tick-sync in src/utils/lockstep.js; this module only answers the game
// questions: which seat is which machine, what a pad looks like on the wire,
// and what a pad means once decoded.
//
// CANONICAL SEAT LAW (identical on every box): seat 0 = the digger = the
// HOST's hands, seat 1 = the dump truck = the GUEST's hands. Seat 2, the
// screen operator, stays the CPU emitter on both boxes — the third scheme
// would crowd the pad (README gap), and both sims run the same in-sim CPU
// (deterministic, #494), so the crews stay honest. The sim is lockstep-ready
// already: seed + pad streams => same hashState on every box (the sampling
// law from lockstep.js — sample once, D ticks ahead, never resample). A pad
// that never arrives runs as an empty pad (BlobBattle #840 law): the run
// keeps rolling on the boxes that did receive it, and the hash boundary is
// the referee — a mismatch means the streams diverged, and both boxes say so
// instead of silently shipping two different runs.
//
// Pure: no DOM, no WebSocket — so gravelcheck proves the whole seat model in
// plain Node, two in-memory boxes against real engine sims.

export const SEATS = 2
export const PAD_DELAY = 8      // ~133 ms of input delay: past relay round-trip, below feel
export const HASH_EVERY = 30    // ~0.5 s hash boundary; the referee between boxes

// the six fields a yard seat reads — one int on the wire.
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

// seatOf: which canonical seat THIS browser drives. Host = digger, guest = truck.
export function seatOf(role) { return role === 'host' ? 0 : 1 }

// wirePad is the object that rides the relay: {m} = the pad mask at tick k.
export function wirePad(pad) { return { m: padMask(pad) } }

// padsAt builds the sim's [digger, truck] pads at tick k from the two seat
// mirrors (Maps keyed by tick, holding exactly the bytes each seat sent).
// Mirrors — not arrival order — decide, so both boxes apply identical pads.
// A missing sample is an empty pad (never a CPU surprise: CPU crews live in
// the sim for seat 2 only).
export function padsAt(hostMirror, guestMirror, k) {
    const hm = hostMirror.get(k)
    const gm = guestMirror.get(k)
    return [unmaskPad(hm ? hm.m : 0), unmaskPad(gm ? gm.m : 0)]
}

// hostSeed rolls the match seed on the host so both boxes dig the same gravel.
export function hostSeed(now = Date.now) {
    return ((now() ^ (Math.floor(Math.random() * 0xffffffff))) >>> 0) || 0x9e37
}

// The online sources() row for the contract: which seat kinds this box sees.
// Your own seat is 'human'; the peer's seat is 'remote'; seat 2 stays 'cpu'.
export function seatKinds(role) {
    if (role !== 'host' && role !== 'guest') return null
    return [
        { kind: role === 'host' ? 'human' : 'remote' },
        { kind: role === 'guest' ? 'human' : 'remote' },
        { kind: 'cpu' },
    ]
}
