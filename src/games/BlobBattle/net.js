// BLOB BATTLE ONLINE (#840) — the meaning the room bytes carry for a two-board
// battler. The transport + roster live in src/utils/room.js and the tick-sync in
// src/utils/lockstep.js; this module only answers the game-specific questions:
// which board is which seat, what a pad looks like on the wire, how a match
// starts on one seed, and what a pad means once decoded.
//
// The wire pads ride room.send's `t`/`s` framing: {t:'pad', s, k, p}. The
// lockstep sampling law (sample once, D ahead, never resample) keeps the pad
// streams absolute, so both boxes execute the same seed + pads and hash-equal
// sims — the issue's determinism clause, exactly.

export const SEATS = 2
export const PAD_DELAY = 8      // ~133 ms of input delay: past round-trip, below feel
export const HASH_EVERY = 30

// the alphabet excludes I/O/0/1 (the SSX 'SNOW' lesson): a code with an O
// closes the relay socket 1002.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function randomCode(rand = Math.random) {
    let s = ''
    for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]
    return s
}

// boardFor maps a room seat to a sim well index — canonical on every box:
// well 0 is always seat 0 (the host), well 1 always seat 1.
export function boardFor(seat) { return seat === 0 ? 0 : 1 }

// wirePad squashes a game pad {left,right,down,rot,drop} into the six bits the
// lockstep wire carries. a = rotate, s = hard drop; both boxes decode identically.
export function toWire(pad) {
    return {
        l: !!pad.left, r: !!pad.right, u: false, d: !!pad.down,
        a: !!pad.rot, s: !!pad.drop,
    }
}

export function fromWire(p) {
    return {
        left: !!(p && p.l), right: !!(p && p.r), down: !!(p && p.d),
        rot: !!(p && p.a), drop: !!(p && p.s),
    }
}

// assemblePads builds the sim's [well0, well1] on THIS box. Pass the maps in
// SEAT order (seat0Map, seat1Map) — each map holds that seat's pads as they
// appeared on the wire (its own samples, or its peer's). Well index is seat
// index on every box, so seat order IS well order.
export function assemblePads(seat0Map, seat1Map, k) {
    const p0 = fromWire(seat0Map.get(k) || toWire({}))
    const p1 = fromWire(seat1Map.get(k) || toWire({}))
    return [p0, p1]
}

// seedFromRoom mixes the host's roll into a 32-bit match seed.
export function hostSeed(now = Date.now) {
    return ((now() ^ (Math.floor(Math.random() * 0xffffffff))) >>> 0) || 0x9e37
}
