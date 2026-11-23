// P2 PAD SEAT (#2860) — pure, Node-pinnable by ddragoncheck.
//
// The cramp law this answers: two humans at one keyboard collide — P2's
// WASD+F/G/V sits exactly where P1's off-hand reaches for Z/X. The fix is
// the friend's own controller: a second physical gamepad (GamepadBridge #492)
// or a linked iPhone (?pads=1 / the PADS pill, #893) lands its pad in onePad
// slot 2, and this module folds it into the seat-2 shape the sim already
// speaks — the keyboard seat is untouched and unions with the pad.
//
// Mapping mirrors player 1's physical layout so the two dragons' thumbs do
// the same thing: A/cross = JUMP, B/circle = KICK, square/triangle/LB (the
// slot's `boost` channel — the phone's Y button already lands there) = PUNCH.
//
// kb    { l, r, u, d, j, k, p } — the keyboard's P2 booleans (WASD F/G/V)
// pad   slotPad(2, 'dpad') — slot 2's one pad, or null when no second pad
export function p2Merge(kb, pad) {
    const p = pad || {}
    return {
        left: !!kb.l || !!p.left,
        right: !!kb.r || !!p.right,
        up: !!kb.u || !!p.up,
        down: !!kb.d || !!p.down,
        a: !!kb.j || !!p.a,           // jump
        b: !!kb.k || !!p.b,          // kick
        punch: !!kb.p || !!p.boost,  // punch — the slot's third action
    }
}

// Drop-in law (same as the keyboard's): the first input takes the blue seat.
// Since #3005 (Jon's #2908/#2930) the seat is HELD while it's driven: the
// sim's idle clock hands an abandoned seat back to dragonBrain and a fresh
// press re-seats through this same line. The seat exists (coop run), is the
// CPU's, and is not down — then a live pad 2 hands it over. Returns true
// when the seat was taken THIS call, so the caller pays the join shout once
// per seating.
//
// #3007 item 4 refines that shout: a returning driver is not a new player.
// The shell tracks the first seating's tick (seat2At, #1712 convention) and
// asks this to split arrival (seat2At < 0 → 'PLAYER 2') from return
// (already seated once → 'P2 BACK' + the ascent chirp). Pure, Node-pinnable.
export const isReSeat = (seat2At) => seat2At >= 0
export function p2Seat(gs, active) {
    if (!active || !gs || !gs.jimmy || gs.jimmy.human || gs.jimmy.out) return false
    gs.jimmy.human = true
    return true
}
