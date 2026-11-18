// PICK RUSH — render-side juice law (#2678). Pure helpers the painter steps
// every frame: the bins' fill meter + full-bin lamp, and the hoist cable's
// whip spring. Hash-clean by construction — the sim never imports this file;
// these read only already-stepped sim state (binFill counts, arm velocity),
// so seed + pads keep producing identical state hashes (#1142).
//
// BIN_VIS is a mutable object, not bare consts: pickcheck's `vis`/`whip`
// mutants freeze one law each the way the amb mutant collapses an era.

import { barrelUpright, KINDS, BINS, BIN_TOP, GRAV, BREAK_VY, GRAB_DX } from './sim.js'

export const BIN_VIS = {
    cap: 12,      // pieces a bin visibly holds before the lamp thunks and wraps
    spring: { k: 0.14, d: 0.22 }, // cable whip: light damping, so a reversal overshoots
    clamp: 7,     // px the cable head may trail the trolley (world units)
}

export const makeBinVis = (n) => Array.from({ length: n }, () => ({ base: 0, fill: 0, flash: 0 }))

// Feed one bin's raw lifetime count (gs.binFill[i]) once per painted frame.
// Returns true on the frame the bin crosses full: the caller plays the thunk.
// A fresh game (raw < base) heals silently — no phantom thunk on restart.
export function stepBinVis(st, raw) {
    if (raw < st.base) st.base = raw
    st.fill = raw - st.base
    if (st.fill >= BIN_VIS.cap) {
        st.base = raw
        st.fill = 0
        st.flash = 26
        return true
    }
    if (st.flash > 0) st.flash--
    return false
}

export const makeWhip = () => ({ y: 0, v: 0 })

// The tilt a steady slide deserves (the pre-#2678 static model).
export const whipTarget = (vx) => Math.max(-4, Math.min(4, -vx * 1.6))

// Step the spring: y trails the target, and because damping is light it
// WHIPS past it when the gantry reverses — the cable head keeps travelling.
export function stepWhip(w, target) {
    w.v += (target - w.y) * BIN_VIS.spring.k - w.v * BIN_VIS.spring.d
    w.y += w.v
    if (w.y > BIN_VIS.clamp) { w.y = BIN_VIS.clamp; w.v = -Math.abs(w.v) * 0.4 }
    if (w.y < -BIN_VIS.clamp) { w.y = -BIN_VIS.clamp; w.v = Math.abs(w.v) * 0.4 }
    return w.y
}

// ---- grab-read telegraphs (#2684) ------------------------------------------
// The belt's two lethal laws — the barrel's upright catch window and the
// glass slam threshold — live in the physics, invisible at a glance. These
// pure reads say what the next input WOULD do: a catch ring on a rolling
// barrel (green = jaws bite now, red = it slips), a red jaw-arc when a
// descent is aimed at off-axis cargo, and a slam pip column under carried
// glass that turns green inside the feather distance. Same hash-clean law
// as the meters above — sim.js never imports this file; these read only
// already-stepped state (rot, held, tip), so seed + pads keep producing
// identical hashes. The import at the top is the law's own source: the
// tells import the predicates instead of re-deriving them, so the paint can
// never drift from what the jaws actually do.

// Mutant handle (PICK_MUT=tell): freeze the whole family to its warning-off
// reading. Named pickcheck gates go red — scripts/pickcheck.mjs §TELL.
export const TELL = { freeze: false }

// Ring state for an on-belt piece: 'ok' = a clamp attempt bites this tick,
// 'off' = it would slip, null = not a roller.
export const catchRing = (it) => {
    if (TELL.freeze || !KINDS[it.kind].roll) return null
    return barrelUpright(it) ? 'ok' : 'off'
}

// The projected landing of a carried fragile if released RIGHT NOW. Mirrors
// stepItems' fall DISCRETELY (vy += GRAV; y += vy — the Euler order the sim
// uses), not the continuous √(v0² + 2ad) form: the discrete fall lands a
// beat later than physics, and a continuous tell would cry wolf in the
// boundary band (continuous says dy 61–63 shatters at 8.2; the sim actually
// arrives at exactly 8.0, which the law accepts) — the #2214 off-by-one
// family, so the tell re-runs the sim's own loop. Only meaningful over a bin
// column (that is where a fall resolves); vx is never the shatter axis from
// a crane — the loaded carriage tops out at 1.73 px/t against BREAK_VX 3.2
// — so this reads the fall alone.
export const slamTell = (gs, seat) => {
    if (TELL.freeze) return null
    const arm = gs.arms[seat]
    if (!arm || arm.held === null) return null
    const it = gs.items.find((i2) => i2.id === arm.held)
    if (!it || !it.fragile) return null
    const bin = BINS.find((b) => it.x >= b.x + 5 && it.x <= b.x + b.w - 5)
    if (!bin) return null
    const dy = BIN_TOP - (it.y + KINDS[it.kind].h / 2)
    let vy = 2, fall = 0, n = 0
    while (fall < dy && n < 200) { vy += GRAV; fall += vy; n++ }
    return {
        dy,
        impact: vy,
        safe: vy <= BREAK_VY,
    }
}

// A descent that is doomed before it lands: the claw is dropping and the
// load under it is an off-axis barrel within the grab window. Paint the
// warning for the WHOLE descent — by the time tip reaches the attempt window
// (stepArm's tip >= 76) the slip is one tick away and a warning there is
// theatre, not information. The player still has the whole fall to abort (A
// rises) or re-time the dip.
export const jawWarn = (gs, seat) => {
    if (TELL.freeze) return false
    const arm = gs.arms[seat]
    if (!arm || arm.held !== null || arm.clamp > 0) return false
    if (arm.mode !== 'lowering') return false
    return gs.items.some((it) => it.onBelt && it.carriedBy === -1
        && Math.abs(it.x - arm.x) <= GRAB_DX
        && KINDS[it.kind].roll && !barrelUpright(it))
}
