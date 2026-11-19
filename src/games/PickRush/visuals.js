// PICK RUSH — render-side juice law (#2678). Pure helpers the painter steps
// every frame: the bins' fill meter + full-bin lamp, and the hoist cable's
// whip spring. Hash-clean by construction — the sim never imports this file;
// these read only already-stepped sim state (binFill counts, arm velocity),
// so seed + pads keep producing identical state hashes (#1142).
//
// BIN_VIS is a mutable object, not bare consts: pickcheck's `vis`/`whip`
// mutants freeze one law each the way the amb mutant collapses an era.

import { barrelUpright, KINDS, BINS, BIN_TOP, BELT_END, GRAV, BREAK_VY, GRAB_DX, ATTEMPT_TIP, CLAW_SPEED, BARREL_R, beltV } from './sim.js'

export const BIN_VIS = {
    cap: 12,      // pieces a bin visibly holds before the lamp thunks and wraps
    spring: { k: 0.14, d: 0.22 }, // cable whip: light damping, so a reversal overshoots
    clamp: 7,     // px the cable head may trail the trolley (world units)
}

export const makeBinVis = (n) => Array.from({ length: n }, () => ({ base: 0, fill: 0, flash: 0, stack: [], ghost: [], settle: 0 }))

// #2739 bin interiors: the meter counts, but the INTERIOR shows WHAT landed.
// The caller pushes each drop event's kind (pushBinKind) beside the raw count,
// so the painter draws real crate/can/barrel/bottle silhouettes instead of a
// tag-coloured fill column. `stack` mirrors `fill` (same law, one channel per
// drop); when the pallet thunks full, the stack becomes `ghost` — a compressed
// settle that squashes for `settle` ticks before the bin reads empty again.
// Still render-only: sim/hash never see any of it (#1142).
export const pushBinKind = (st, kind) => {
    st.stack.push(kind)
    if (st.stack.length > BIN_VIS.cap) st.stack.shift()
}

// Feed one bin's raw lifetime count (gs.binFill[i]) once per painted frame.
// Returns true on the frame the bin crosses full: the caller plays the thunk.
// A fresh game (raw < base) heals silently — no phantom thunk on restart,
// and the interiors clear with it (no phantom crates on a fresh floor).
export function stepBinVis(st, raw) {
    if (raw < st.base) {
        st.base = raw
        st.stack.length = 0
        st.ghost.length = 0
        st.settle = 0
    }
    st.fill = raw - st.base
    // self-heal: the meter is the truth. A rewound raw (new game before any
    // wrap — base still 0, so the branch above can't see it) leaves stale
    // entries; the column truncates down to the meter it mirrors.
    if (st.stack.length > st.fill) st.stack.length = st.fill
    if (st.fill >= BIN_VIS.cap) {
        st.base = raw
        st.fill = 0
        st.flash = 26
        st.ghost = st.stack.slice() // the full pallet settles compressed…
        st.stack.length = 0
        st.settle = 14             // …for a beat before the empty bin reads empty
        return true
    }
    if (st.flash > 0) st.flash--
    if (st.settle > 0) st.settle--
    return false
}

// #2739 audio variety: every correct drop used to thud the same sheet-metal
// note. Each bin has its own voice now — CRATE a heavy pine knock, CAN a
// brighter tin ring, BOTTLE the lightest tick (glass lands softest), COIL the
// densest rubber thunk, SCRAP the deepest clatter — so the bin you hit is
// audible, matching the JUICE contract the gauge already reads. A rarer
// double-tink rides combo ≥ 4 so the streak is heard, not just counted.
// Pure derivation, zero rng: the same drop always sounds the same (#1142).
export const DROP_THUD = [
    { hz: 110, gain: 0.058 }, // CRATE
    { hz: 124, gain: 0.052 }, // CAN
    { hz: 147, gain: 0.044 }, // BOTTLE
    { hz: 98, gain: 0.062 },  // COIL
    { hz: 87, gain: 0.056 },  // SCRAP
]

export const dropVoice = (bin, combo) => {
    const t = DROP_THUD[bin] || DROP_THUD[0]
    return { hz: t.hz, gain: t.gain, double: (combo | 0) >= 4 }
}

export const makeWhip = () => ({ y: 0, v: 0 })

// ---- carriage inertia (#2755 QA polish 2) ---------------------------------
// A 1.4-ton gantry does not stop dead. The carriage PAINT rides a heavy
// spring toward its velocity-lag target: press and the paint eases in (it
// trails the sim further as speed builds), release and it glides out with a
// slight rail-flex rebound before settling EXACTLY on the sim position — the
// PIXELS law (#1184 sampling) keeps holding at rest, and mid-motion the cable
// cargo column visibly leans on the #2678 whip. Pad law, sim and hashes never
// see any of it: stepCrane reads the already-stepped arm velocity like the
// whip spring does, so seed + pads keep producing identical state hashes.
// CRANE is mutable (not bare consts) for the same reason BIN_VIS is:
// `PICK_MUT=ease` kills the trail and named gates go red.
export const CRANE = { trail: 2.2, k: 0.3, d: 0.5, clamp: 4.5 }

export const makeCraneVis = () => ({ off: 0, v: 0 })

// vx = this tick's sim carriage velocity (px/tick, ARM_SPEED = 2.4).
export function stepCrane(c, vx) {
    const target = -(vx / 2.4) * CRANE.trail
    c.v += (target - c.off) * CRANE.k - c.v * CRANE.d
    c.off += c.v
    if (c.off > CRANE.clamp) { c.off = CRANE.clamp; c.v = Math.min(c.v, 0) }
    if (c.off < -CRANE.clamp) { c.off = -CRANE.clamp; c.v = Math.max(c.v, 0) }
    // at rest the paint lands exactly on the sim — no residual lean
    if (target === 0 && Math.abs(c.off) < 0.02 && Math.abs(c.v) < 0.02) { c.off = 0; c.v = 0 }
    return c.off
}

// ---- first-shift feather lesson (#2755 QA polish 2) ----------------------
// The slam meter explains glass ONCE you are already carrying it, but nothing
// ever told a fresh player that DOWN feathers at all. Law: the first fragile
// the claw lifts by the end of shift 2 (the era glass joins the line; bottles
// simply do not exist in shift 1, so in practice this is the first bottle), a one-
// time cue arms under the cargo — chevrons + FEATHER — and fades on its own
// clock. Gone by shift 3: shift 3+ never arms it again, and it only ever
// arms once per shift. Non-nagging: it appears at the claw, at the exact
// moment the law can bite, and never interrupts the slam meter's own story.
// Pure derivation of stepped sim state + a paint-side timer — hash-clean.
// FEATHER_CUE mutable for the `feather` mutant (the lesson never arms).
export const FEATHER_CUE = { ticks: 150 }

export const makeFeatherCue = () => ({ t: 0, shown: false })

// Step once per sim tick while PLAYING (attract never teaches). Returns the
// live timer: > 0 means a fragile is aboard with the lesson lit.
export function stepFeatherCue(cv, gs, seat) {
    if (cv.t > 0) cv.t--
    const arm = gs.arms[seat]
    if (!arm || arm.held === null || gs.shift > 1 || cv.shown) return cv.t // gs.shift is 0-based: 1 = the second shift, glass era
    const it = gs.items.find((i2) => i2.id === arm.held)
    if (it && it.fragile) { cv.t = FEATHER_CUE.ticks; cv.shown = true }
    return cv.t
}

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

// Mutant handles: PICK_MUT=tell freezes the whole family to its warning-off
// reading; PICK_MUT=aim mutes only the #2690 intent/ownership pair. Named
// pickcheck gates go red — scripts/pickcheck.mjs §TELL and §AIM.
export const TELL = { freeze: false, aimFreeze: false }

// #2694 colourblind law: the ring's two verdicts and the barrel core it
// circles live HERE, not as literals in the painter, so pickcheck's §CB gate
// can prove the palette stays distinguishable under a deuteranopia transform
// at the game's native 426×240. The painter imports these; drift fails the gate.
export const RING_OK = '#5dff8f'    // a clamp this tick bites
export const RING_OFF = '#ff5a4f'   // it would slip
export const BARREL_CORE = '#b8862f' // the body the hoop rides over

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

// A descent that is doomed before it lands: the barrel the converging claw
// will meet WHEN the tip reaches the attempt window is off-axis — say so from
// the press tick, a whole cable-length before the jaws get there (#2694).
// The mirror is discrete — the belt's own per-tick roll (rot += vb/BARREL_R),
// n whole ticks of it — never a continuous formula (the #2684 catch), and the
// verdict is PREDICTIVE, not present tense: a barrel off-axis NOW that the
// roll rights before the attempt is not doomed, and the arc stays quiet for it
// (the old present-tense arc cried wolf there). At tip >= ATTEMPT_TIP the
// projection is n = 0, i.e. exactly this tick — the moment of truth the
// original law already knew. The player still has the whole fall to abort (A
// rises) or re-time the dip.
export const jawWarn = (gs, seat) => {
    if (TELL.freeze) return false
    const arm = gs.arms[seat]
    if (!arm || arm.held !== null || arm.clamp > 0) return false
    if (arm.mode !== 'lowering') return false
    const vb = beltV(gs)
    const n = Math.max(0, Math.ceil((ATTEMPT_TIP - arm.tip) / CLAW_SPEED))
    const ax = arm.x + arm.vx * n // coast the carriage to where it will be
    return gs.items.some((it) => it.onBelt && it.carriedBy === -1 && KINDS[it.kind].roll
        && Math.abs(it.x + vb * n - ax) <= GRAB_DX
        && !barrelUpright({ rot: it.rot + (vb * n) / BARREL_R }))
}

// #2694 travel hint: while fragile glass is aboard and NO bin sits under it,
// the slam meter has nothing to say (its column only means something over a
// bin mouth). A dim ghost column at the cargo's tagged home bin keeps the
// destination story alive across the gap — its colour is the same discrete
// fall verdict the live slam column gives, so the player can pre-feather on
// the way and arrive already green. Reads only stepped state; hash-clean.
export const travelTell = (gs, seat) => {
    if (TELL.freeze) return null
    const arm = gs.arms[seat]
    if (!arm || arm.held === null) return null
    const it = gs.items.find((i2) => i2.id === arm.held)
    if (!it || !it.fragile) return null
    if (BINS.some((b) => it.x >= b.x + 5 && it.x <= b.x + b.w - 5)) return null // slamTell owns the bin span
    const dest = KINDS[it.kind].bin
    const dy = BIN_TOP - (it.y + KINDS[it.kind].h / 2)
    let vy = 2, fall = 0, n = 0
    while (fall < dy && n < 200) { vy += GRAV; fall += vy; n++ } // the sim's own Euler fall
    return { bin: dest, dx: Math.round(BINS[dest].x + BINS[dest].w / 2 - it.x), dy, impact: vy, safe: vy <= BREAK_VY }
}

// ---- rival intent & ring ownership (#2690 QA) -----------------------------
// Two cranes share one belt, but nothing on the rails said what the foreman's
// brain was hunting — and two claws homing on the same barrel gave the catch
// ring one face. These are pure reads of ALREADY-stepped state: the
// autopilot's target memory (`arm.target` — motion-carrier, never hashed, cf.
// pos/clawY #1184) and approach geometry. The rules and hashes never see
// them: same law as the #2678 meters. Whether a seat is brain-driven is the
// caller's business (a human partner has no readable intent); these helpers
// just report what the memory says.

// What this seat's crane is hunting right now: the live belt piece its
// autopilot last locked. Null while carrying (the slam meter tells that
// story), and when the memory went stale — the piece was grabbed, landed,
// or ran off the line end. Mirrors the autopilot's own reach filter so the
// tell never points at a piece the brain already gave up on.
export const craneAim = (gs, seat) => {
    if (TELL.freeze || TELL.aimFreeze) return null
    const arm = gs.arms[seat]
    if (!arm || arm.held !== null) return null
    const it = gs.items.find((i2) => i2.id === arm.target)
    if (!it || !it.onBelt || it.carriedBy !== -1 || it.x > BELT_END - 24) return null
    return { id: it.id, kind: it.kind, bin: KINDS[it.kind].bin, x: it.x }
}

// Who is converging on this piece: 'mine' when seat `me`'s empty claw is
// lowering into the grab window, 'rival' when the other crane alone is,
// null when nobody is. Mine wins ties — the fast blink is yours.
export const ringClaim = (gs, it, me = 0) => {
    if (TELL.freeze || TELL.aimFreeze) return null
    const near = (s) => {
        const a = gs.arms[s]
        return !!a && a.held === null && a.mode === 'lowering'
            && Math.abs(a.x - it.x) <= GRAB_DX
    }
    if (near(me)) return 'mine'
    for (let s = 0; s < gs.arms.length; s++) if (s !== me && near(s)) return 'rival'
    return null
}
