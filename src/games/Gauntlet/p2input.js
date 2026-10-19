// P2 input merge (#492) — pure, Node-pinnable by vpadcheck.
//
// Player 2 has two sources on one machine: the keyboard (WASD + F, the #491
// path) and, when present, the second physical pad via the slot layer
// (slotPad(2)). Whichever the human prefers, both fold into the single
// partner-input shape the sim expects. Sword is edge-triggered: the keyboard
// hands a per-tick edge directly; the pad holds `a`/`b` level, so the edge
// is `held now && !held last tick` with `prev` carried by the caller.
//
// kb   { l, r, u, d, swordEdge } — the keyboard's P2 booleans
// pad  slotPad(2, method) — slot 2's one pad, or null when no second pad
// prev { a, b } — pad button levels from the previous tick
export function p2From(kb, pad, prev = { a: false, b: false }) {
    const p = pad || {}
    const a = !!p.a
    const b = !!p.b
    return {
        left: !!kb.l || !!p.left,
        right: !!kb.r || !!p.right,
        fwd: !!kb.u || !!p.up,
        back: !!kb.d || !!p.down,
        sword: !!kb.swordEdge || (a && !prev.a) || (b && !prev.b),
        a,
        b,
    }
}
