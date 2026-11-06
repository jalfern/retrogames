// GRAVEL YARD ONLINE (#1672 — lobby seats) — the meaning the room bytes carry
// for the yard. Transport + roster live in src/utils/room.js (via lobby.js) and
// the tick-sync in src/utils/lockstep.js; this module only answers the game
// questions: which seat is which machine, what a pad looks like on the wire,
// and what a pad means once decoded.
//
// CANONICAL SEAT LAW (identical on every box): seat 0 = the digger = the
// HOST's hands, seat 1 = the dump truck = the first joiner's hands, seat 2 =
// the SCREEN OPERATOR = the second joiner's hands (#1705). Join order fixes
// the machine; the room roster decides which seats are humans. With a two-
// browser crew seat 2 stays the CPU emitter on both boxes, exactly as #1672
// shipped — the crowds-the-pad objection was about a third LOCAL keyboard,
// and a remote browser brings its own pad. Both sims run the same in-sim CPU
// (deterministic, #494), so the crews stay honest. The sim is lockstep-ready
// already: seed + pad streams => same hashState on every box (the sampling
// law from lockstep.js — sample once, D ticks ahead, never resample). A pad
// that never arrives runs as an empty pad (BlobBattle #840 law): the run
// keeps rolling on the boxes that did receive it, and the hash boundary is
// the referee — a mismatch means the streams diverged, and every box says so
// instead of silently shipping two different runs.
//
// Pure: no DOM, no WebSocket — so gravelcheck proves the whole seat model in
// plain Node, three in-memory boxes against real engine sims.

export const SEATS = 3
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

// seatOf: which canonical seat THIS browser drives. The room slot IS the seat:
// host 0 = digger; joiners in join order take 1 = truck, 2 = operator (#1705).
// The legacy single-guest call without a slot still answers 1 (the #1672 law).
export function seatOf(role, slot = null) { return role === 'host' ? 0 : (slot === null ? 1 : slot) }

// wirePad is the object that rides the relay: {m} = the pad mask at tick k.
export function wirePad(pad) { return { m: padMask(pad) } }

// padsAt builds the sim's [digger, truck, operator] pads at tick k from the
// seat mirrors (Maps keyed by tick, holding exactly the bytes each seat sent).
// Mirrors — not arrival order — decide, so every box applies identical pads.
// A missing sample is an empty pad (never a CPU surprise: CPU crews live in
// the sim for unfilled seats only).
export function padsAt(mirrors, k) {
    return [0, 1, 2].map((s) => {
        const mm = mirrors[s]
        return unmaskPad(mm && mm.has(k) ? mm.get(k).m : 0)
    })
}

// hostSeed rolls the match seed on the host so both boxes dig the same gravel.
export function hostSeed(now = Date.now) {
    return ((now() ^ (Math.floor(Math.random() * 0xffffffff))) >>> 0) || 0x9e37
}

// The online sources() row for the contract: which seat kinds this box sees.
// Roster-driven (#1705): live seats are 'human' (own slot) or 'remote' (a
// friend's), unfilled seats stay 'cpu'. The legacy two-browser call without a
// roster keeps the #1672 law: host+guest pair live, operator CPU.
export function seatKinds(role, slots = null, yourSlot = null) {
    if (role !== 'host' && role !== 'guest') return null
    const live = slots ? slots.map((s) => s | 0) : [0, 1]
    const me = yourSlot === null ? (role === 'host' ? 0 : 1) : yourSlot | 0
    return [0, 1, 2].map((s) => (
        live.includes(s) ? { kind: s === me ? 'human' : 'remote' } : { kind: 'cpu' }
    ))
}
