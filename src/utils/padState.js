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

export function setStick(x, y, push, engaged) {
    padState.x = x
    padState.y = y
    padState.push = push
    padState.engaged = !!engaged
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

// A racing game's steering + pedals from the pad state: the stick's x is the
// steering, and the pedals are the triggers — with the stick's y axis as the
// touch fallback (push forward to accelerate, pull back to brake), which is
// how the original cabinets' single control worked. `p` is the padState (or
// any { x, y, rt, lt } snapshot).
export function steerPedals(p) {
    const x = p && typeof p.x === 'number' ? p.x : 0
    const y = p && typeof p.y === 'number' ? p.y : 0
    const rt = p && typeof p.rt === 'number' ? p.rt : 0
    const lt = p && typeof p.lt === 'number' ? p.lt : 0
    return {
        steer: x,
        thr: Math.max(rt, y < 0 ? -y : 0),
        brk: Math.max(lt, y > 0 ? y : 0),
    }
}
