// The current analog pad state, shared between the writers — the floating
// touch stick (VirtualControls), the physical gamepad (GamepadBridge) — and
// any game that opts in by reading it (reader, when its games.js
// `pad.analog` is true). A module-level holder so it survives re-renders and
// is importable from both the component and game code without prop-drilling
// or a per-frame re-render.
//
// This is only the *extra* analog channel. The digital 8-way arrows the stick
// emits are dispatched separately as the same KeyboardEvents every game
// already reads; a game that sets `pad.analog: true` additionally reads this
// state for smooth input (a trackball, steering, pedals, a camera) in #290
// step 4.
//
//   x, y     left-stick vector, -1..1 (|v| == push, 0 at rest)
//   push     left-stick magnitude 0..1
//   engaged  left stick pushed past its dead zone
//   rx, ry   right-stick vector, -1..1 (gamepad only; 0 on touch)
//   rt, lt   triggers 0..1 (gamepad only; 0 on touch)
//
// Writers: setStick (left, touch + gamepad), setRight (right stick +
// triggers, gamepad), clearStick / clearRight / clearPad on release.

export const padState = { x: 0, y: 0, push: 0, engaged: false, rx: 0, ry: 0, rt: 0, lt: 0 }

// #431: push/engaged are derived here from the dead-zoned magnitude; the
// incoming push/engaged args (the stick's own pre-zone read) are kept in the
// signature so both writers stay call-compatible, unused.
export function setStick(x, y, _push, _engaged) {
    const dz = radialDeadZone(x, y)
    padState.x = dz.x
    padState.y = dz.y
    padState.push = dz.push
    padState.engaged = dz.engaged
}

export function setRight(rx, ry, rt, lt) {
    padState.rx = rx
    padState.ry = ry
    padState.rt = rt
    padState.lt = lt
}

export function clearStick() {
    padState.x = 0
    padState.y = 0
    padState.push = 0
    padState.engaged = false
}

export function clearRight() {
    padState.rx = 0
    padState.ry = 0
    padState.rt = 0
    padState.lt = 0
}

export function clearPad() {
    clearStick()
    clearRight()
}

// --- Pure mapping helpers (importable in Node for vpadcheck) ---------------

// #431: the standard stick pipeline, in order — scaled radial dead zone
// (shared, every stick game, touch + gamepad), response curve (per game,
// steering only), gain, then per-tick steering smoothing. Keyboard / digital
// paths never pass through here; these constants are Jon's tuning knobs.
export const STICK_DEAD_ZONE = 0.12   // D — radial dead zone, remapped away
export const STEER_CURVE_A = 0.7     // A — s' = (1-A)·s + A·s³ (soft center)
export const STEER_GAIN = 0.6        // G — full push locks at G, not 1
export const STEER_SMOOTH = 0.12     // R — max steer change per tick

// Scaled radial dead zone: m = |v|; m < D collapses to rest, else the
// magnitude is remapped (m - D) / (1 - D) so the response starts at 0 just
// outside the zone instead of jumping. Applied at the analog store writers
// (setStick / setStickVec), so both the touch stick and a gamepad's left
// stick — and every game reading either — share one dead zone.
export function radialDeadZone(x, y, d = STICK_DEAD_ZONE) {
    const m = Math.hypot(x, y)
    if (!(m > 0)) return { x: 0, y: 0, push: 0, engaged: false }
    if (m < d) return { x: 0, y: 0, push: 0, engaged: false }
    const k = (m - d) / (1 - d) / m
    return { x: x * k, y: y * k, push: (m - d) / (1 - d), engaged: true }
}

// Response curve + gain (steering only): gentle near center, full lock at
// full push scaled by G.
export function steerResponse(s, a = STEER_CURVE_A, g = STEER_GAIN) {
    return g * ((1 - a) * s + a * s * s * s)
}

// Steer smoothing: move `prev` toward `target` by at most `rate` per tick,
// so a thumb twitch can't snap the wheel.
export function smoothSteer(prev, target, rate = STEER_SMOOTH) {
    const d = target - prev
    if (d > rate) return prev + rate
    if (d < -rate) return prev - rate
    return target
}

// The whole pipeline constant set, for `__game.meta` so a model sees the same
// mapping a human gets.
export const STEER_PIPELINE = {
    deadZone: STICK_DEAD_ZONE,
    curveA: STEER_CURVE_A,
    gain: STEER_GAIN,
    smooth: STEER_SMOOTH,
    formula: 's0 = radialDeadZone(stick); s1 = G * ((1-A)*s0.x + A*s0.x^3); steer = smoothStep(prev, s1, R)',
}

// A racing game's steering + pedals from the pad state: the stick's x is the
// steering (response curve + gain #431 — the stick x arrives dead-zoned from
// the store writer), and the pedals are the triggers — with the stick's y
// axis as the touch fallback (push forward to accelerate, pull back to
// brake), which is how the original cabinets' single control worked. `p` is
// the padState (or any { x, y, rt, lt } snapshot).
export function steerPedals(p) {
    const x = p && typeof p.x === 'number' ? p.x : 0
    const y = p && typeof p.y === 'number' ? p.y : 0
    const rt = p && typeof p.rt === 'number' ? p.rt : 0
    const lt = p && typeof p.lt === 'number' ? p.lt : 0
    return {
        steer: steerResponse(x),
        thr: Math.max(rt, y < 0 ? -y : 0),
        brk: Math.max(lt, y > 0 ? y : 0),
    }
}
