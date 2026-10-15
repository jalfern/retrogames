// Pure gamepad -> keyboard-code mapping for the GamepadBridge.
// Importable in Node (vpadcheck) and the browser (GamepadBridge.jsx).
//
// Standard (Xbox/PS-style) gamepad layout:
//   button 0  (A)     -> Space            (the "A" / primary action)
//   button 1  (B)     -> the game's second action (per-game; defaults to KeyB,
//                        which ~half the titles already accept as an alias)
//   button 8  (Select)-> '?' pause        (code 'Question', key '?')
//   button 9  (Start) -> Enter            (starts from attract / confirms)
//   buttons 12-15     -> ArrowUp / ArrowDown / ArrowLeft / ArrowRight (d-pad)
//   axes 0,1 (left stick) -> arrows, dead-zoned + hysteresis
//
// Games keep reading keyboard `e.code`; the bridge just synthesises the same
// KeyboardEvents VirtualControls does, so nothing in a game has to change.

import { dirsFrom } from './virtualDir.js'

// Engage threshold: the stick must push past this magnitude before it drives
// an arrow. Release threshold: once engaged it only clears below this lower
// value, so a resting thumb that jitters in the band between them does not
// flick the arrows on and off every frame (hysteresis).
export const GPAD_DEAD_ZONE = 0.3
export const GPAD_RELEASE_ZONE = 0.1

// d-pad button index -> arrow code (W3C standard gamepad layout).
export const GPAD_DPAD = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' }

// Universal (game-independent) face/system buttons: index -> code. B (index 1)
// is handled separately because its target is per-game.
export const GPAD_FIXED = { 0: 'Space', 8: 'Question', 9: 'Enter' }

export const GPAD_DEFAULT_SECOND = 'KeyB'

// Left stick -> arrow codes with a dead zone and hysteresis. `state` carries
// the engaged flag + last direction across frames. Returns the codes to hold.
export function stickDirections(axes, state) {
    const x = (axes && axes[0]) || 0
    const y = (axes && axes[1]) || 0
    const mag = Math.hypot(x, y)
    if (mag < GPAD_RELEASE_ZONE) {
        state.engaged = false
        state.lastCodes = []
        return []
    }
    if (mag >= GPAD_DEAD_ZONE) {
        state.engaged = true
        state.lastCodes = dirsFrom(x, y, 0)
    }
    // else: in the hysteresis band (release < mag < dead zone) -> keep the last
    // direction rather than re-deriving a sector from near-centre noise.
    return state.lastCodes
}

// Full mapping for one frame. `pad` is a { buttons: [{ pressed }], axes: [] }
// snapshot (a real Gamepad, or a plain fake in the harness). `opts.secondAction`
// is the game's B-button code. Returns { codes: Set<string>, state } for the
// next frame.
export function gamepadToCodes(pad, opts = {}, state = { engaged: false, lastCodes: [] }) {
    const buttons = (pad && pad.buttons) || []
    const pressed = (i) => !!(buttons[i] && buttons[i].pressed)
    const codes = new Set()

    for (const idx of Object.keys(GPAD_DPAD)) if (pressed(+idx)) codes.add(GPAD_DPAD[+idx])
    for (const c of stickDirections(pad.axes, state)) codes.add(c)
    for (const idx of Object.keys(GPAD_FIXED)) if (pressed(+idx)) codes.add(GPAD_FIXED[+idx])
    if (pressed(1)) codes.add((opts && opts.secondAction) || GPAD_DEFAULT_SECOND)

    return { codes, state }
}
