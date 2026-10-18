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

// The analog read of one stick: axes (a -1..1 pair, diagonals may exceed
// unit length) -> { x, y, push, engaged } in the same space the floating
// touch stick publishes (|v| == push, clamped to the unit circle). `engaged`
// uses the same dead zone as the digital arrows so a resting thumb publishes
// nothing. Importable in Node (vpadcheck) and the browser (GamepadBridge).
export function stickFromAxes(axes, deadZone = GPAD_DEAD_ZONE) {
    let x = (axes && axes[0]) || 0
    let y = (axes && axes[1]) || 0
    const m = Math.hypot(x, y)
    if (m > 1) { x /= m; y /= m }
    return { x, y, push: Math.min(1, m), engaged: m >= deadZone }
}

// Trigger values 0..1 from buttons 6 (LT) and 7 (RT). W3C pads report an
// analog `value`; a plain { pressed } fake (or a digital pad) falls back to
// 0/1. Missing buttons read as 0.
export function triggersFromPad(pad) {
    const value = (i) => {
        const b = pad && pad.buttons && pad.buttons[i]
        if (!b) return 0
        if (typeof b.value === 'number') return Math.max(0, Math.min(1, b.value))
        return b.pressed ? 1 : 0
    }
    return { lt: value(6), rt: value(7) }
}

// --- Per-game pad declarations (the optional `pad` field in src/config/games.js) ---
//
// Shape: { layout: 'dpad' | 'stick' | 'stick+dpad', buttons: [{ label, code }], analog: bool }
// `buttons[0]` is the B (second-action) button. These pure helpers are shared by
// the GamepadBridge, VirtualControls and vpadcheck so the registry is the single
// source of truth for what the B button does and says.

const PAD_LAYOUTS = ['dpad', 'stick', 'stick+dpad']
// The #420 standard: a game declares ONE input method. `method` supersedes the
// legacy `layout`; both are accepted so the two can coexist during rollout.
const PAD_METHODS = ['dpad', 'stick', 'pointer']

// True when `pad` is a well-formed declaration (or null/undefined, which is a
// legitimate "no pad" answer and is accepted by the callers, not here).
export function validPad(pad) {
    if (!pad || typeof pad !== 'object') return false
    const hasMethod = pad.method !== undefined
    const hasLayout = pad.layout !== undefined
    if (!hasMethod && !hasLayout) return false
    if (hasMethod && !PAD_METHODS.includes(pad.method)) return false
    if (hasLayout && !PAD_LAYOUTS.includes(pad.layout)) return false
    if (!Array.isArray(pad.buttons)) return false
    for (const b of pad.buttons) {
        if (!b || typeof b.label !== 'string' || typeof b.code !== 'string') return false
    }
    if (pad.analog !== undefined && typeof pad.analog !== 'boolean') return false
    if (pad.reads !== undefined && (!Array.isArray(pad.reads) || pad.reads.some((f) => typeof f !== 'string'))) return false
    if (pad.ways !== undefined && pad.ways !== 4 && pad.ways !== 8) return false
    return true
}

// #439: the number of directions a dpad game's touch stick quantizes to —
// 4 (the arcade 4-way diamond gate, dominant axis + hysteresis) or 8 (nearest
// sector, diagonals allowed). A pad that declares neither keeps the legacy
// 8-way cross d-pad (no diamond gate), so a per-title migration can opt in
// one at a time. Pure so vpadcheck can pin the registry.
export function waysOf(pad) {
    if (pad && (pad.ways === 4 || pad.ways === 8)) return pad.ways
    return null
}

// The B (second-action) button of a pad declaration, or null when there is none.
export function padButton(pad) {
    if (!validPad(pad) || !pad.buttons.length) return null
    return pad.buttons[0]
}

// Step 1 (#384): the floating stick is the DEFAULT touch layout. A game keeps
// the fixed d-pad only by declaring layout 'dpad' (the grid- / menu-driven
// titles, each with a one-line reason in its pad entry). `pad` is the registry
// entry's optional pad field — null/undefined when the game declares none, in
// which case the stick wins. Pure so vpadcheck can pin the default in Node.
export function shouldUseStick(pad) {
    return !(pad && pad.layout === 'dpad')
}
