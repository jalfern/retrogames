// PICK RUSH — render-side juice law (#2678). Pure helpers the painter steps
// every frame: the bins' fill meter + full-bin lamp, and the hoist cable's
// whip spring. Hash-clean by construction — the sim never imports this file;
// these read only already-stepped sim state (binFill counts, arm velocity),
// so seed + pads keep producing identical state hashes (#1142).
//
// BIN_VIS is a mutable object, not bare consts: pickcheck's `vis`/`whip`
// mutants freeze one law each the way the amb mutant collapses an era.

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
