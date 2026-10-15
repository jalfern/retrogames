// The current analog stick vector, shared between the floating touch stick
// (writer) and any game that opts in by reading it (reader, when its games.js
// `pad.analog` is true). A module-level holder so it survives re-renders and is
// importable from both the component and game code without prop-drilling or a
// per-frame re-render.
//
// This is only the *extra* analog channel. The digital 8-way arrows the stick
// emits are dispatched separately as the same KeyboardEvents every game already
// reads; a game that sets `pad.analog: true` additionally reads this vector for
// smooth input (a trackball, steering, a camera) in #290 step 4.

export const padState = { x: 0, y: 0, push: 0, engaged: false }

export function setStick(x, y, push, engaged) {
    padState.x = x
    padState.y = y
    padState.push = push
    padState.engaged = !!engaged
}

export function clearStick() {
    padState.x = 0
    padState.y = 0
    padState.push = 0
    padState.engaged = false
}
