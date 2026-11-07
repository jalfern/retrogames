// trampoline.js — per-section trampoline strength (#1758 item 5, physics half).
//
// The old bounciness was uniform AND effectively inert: landing set a positive
// vz while `air` was already false, so the next tick pinned z to the ground and
// the next edge clamped vz away. The cabinet's SILLY course springs harder the
// higher the section you land in — low aprons dead, high sky roads trampolines.
// This law makes the spring real and per-section: it keys the spring's arc to
// the landing cell's height band, energy-style (apex = rest * drop, capped), so
// a shallow tap flutters and a committed drop off the high road sails.
//
// Pure law over integer terrain heights — no rng, no time, no DOM.

export const TRAMP = {
    restLo: 0.30,   // restitution of the lowest aprons
    restHi: 0.85,   // restitution of the highest sky sections
    zLo: 6,         // the SILLY course's own height band: landings at or below
    zHi: 8,         // this spring at restLo, at or above it spring at restHi
    apexCap: 1.6,   // tiles — cap on the spring arc, keeps the fling tame
}

// Restitution of the section at landing height z: linear in the band, clamped.
export function trampRest(z) {
    const t = (z - TRAMP.zLo) / (TRAMP.zHi - TRAMP.zLo)
    return TRAMP.restLo + Math.max(0, Math.min(1, t)) * (TRAMP.restHi - TRAMP.restLo)
}

// Launch velocity for a landing of `drop` tiles onto section height z.
// Energy form: the arc's apex is rest * drop (capped), and vz follows from
// 2*grav*apex = vz². A zero drop (the landing of a spring's own arc) never
// re-springs — one arc per cliff-drop, no endless bounce.
export function trampVz(drop, z, grav) {
    const apex = Math.min(trampRest(z) * drop, TRAMP.apexCap)
    return Math.sqrt(2 * grav * Math.max(0, apex))
}
