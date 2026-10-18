// ONE PAD PER TICK — the single input object every source funnels into (#420).
//
// Three input methods, declared per game in src/config/games.js:
//   dpad    grid / 4-way — fixed d-pad, bottom-left. The game reads the digital
//           directions, which EVERY source derives from the analog x/y through
//           ONE shared quantizer (keys, the touch d-pad, a gamepad stick, or a
//           scripted __game.step({x, y})).
//   stick   analog — fixed, always-visible stick, bottom-left. The game reads
//           x / y directly (steering, pedals, a trackball).
//   pointer cursor — tap / click / drag directly on the play field; no stick on
//           touch. The game reads pointer.x / y (normalized 0..1 to the canvas)
//           plus pointer.down / alt. A gamepad's stick moves the cursor (its
//           x / y feed the game as a cursor delta).
//
// The one pad, whatever the source:
//   { up, down, left, right,       // digital directions (booleans)
//     a, b, start,                 // action buttons (booleans)
//     x, y,                        // analog vector, -1..1 (0 at rest)
//     pointer: { x, y, down, alt } }  // x / y normalized 0..1 to the canvas
//
// Pure: importable in Node (vpadcheck) and the browser (VirtualControls,
// gameContract, GamepadBridge). No React, no DOM.

import { radialDeadZone } from './padState.js'

export const METHODS = ['dpad', 'stick', 'pointer']

// The digital direction fields the shared quantizer fills in.
export const DIR_FIELDS = ['up', 'down', 'left', 'right']

// The one-pad's top-level field names (the meta surface a game reports it reads).
export const PAD_FIELDS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'x', 'y', 'pointer']

// A fresh, all-idle pad. Pointer rests at the top-left corner with `down` false,
// so a resting pointer is never mistaken for a press.
export function blankPad() {
    return {
        up: false, down: false, left: false, right: false,
        a: false, b: false, start: false,
        x: 0, y: 0,
        pointer: { x: 0, y: 0, down: false, alt: false },
    }
}

// --- The ONE shared quantizer: an analog x / y -> the digital directions. ----
//
// Screen space: x right, y down. A dead band at the centre keeps a resting
// stick or d-pad from flicking a direction on-and-off. Diagonals light BOTH
// axes, so a 4-way game reads one axis at a time and an 8-way game reads both.
// This is the single place a dpad game's directions come from, for every source.
export const DIR_DEAD = 0.35

export function quantize(x, y, dead = DIR_DEAD) {
    return {
        up: y < -dead,
        down: y > dead,
        left: x < -dead,
        right: x > dead,
    }
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

// Fold ANY input source into the one pad for a game of `method`.
//
// `raw` is whatever a source hands over: a subset of the pad fields (keys map a
// direction to its boolean, a stick maps to x / y, a pointer maps to
// pointer.x / y, a scripted __game.step maps to whatever the harness picked).
// The rules:
//   * explicit booleans / numbers are copied through,
//   * x / y default to 0,
//   * the digital directions are the OR of any explicitly-held direction and
//     quantize(x, y) — so step({right: true}) and step({x: 1}) both read as
//     "right", which is what makes one pad genuinely one pad,
//   * pointer.x / y are clamped to 0..1; when a pointer game is driven by a
//     gamepad stick (x / y present, no pointer yet) the cursor sits at the
//     stick's position so (x+1)/2 maps the full stick range onto the canvas.
export function normalizePad(raw = {}, method = 'stick') {
    const pad = blankPad()
    const r = raw || {}
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0)
    pad.x = num(r.x)
    pad.y = num(r.y)
    if (Math.abs(pad.x) > 1) pad.x = pad.x > 0 ? 1 : -1
    if (Math.abs(pad.y) > 1) pad.y = pad.y > 0 ? 1 : -1

    const q = quantize(pad.x, pad.y)
    pad.up = !!r.up || q.up
    pad.down = !!r.down || q.down
    pad.left = !!r.left || q.left
    pad.right = !!r.right || q.right

    pad.a = !!r.a
    pad.b = !!r.b
    pad.start = !!r.start

    const p = r.pointer || {}
    pad.pointer = {
        x: clamp01(num(p.x)),
        y: clamp01(num(p.y)),
        down: !!p.down,
        alt: !!p.alt,
    }
    // A pointer game driven by a gamepad stick (no pointer coords yet) parks the
    // cursor at the stick's position; the game turns stick travel into motion.
    if (method === 'pointer' && (pad.x !== 0 || pad.y !== 0) && !(p.x || p.y)) {
        pad.pointer.x = clamp01((pad.x + 1) / 2)
        pad.pointer.y = clamp01((pad.y + 1) / 2)
    }
    return pad
}

// The input method a registry `pad` entry declares. `method` wins; when it is
// absent the legacy `layout` maps across ('dpad' stays 'dpad', everything else
// is 'stick'), so the ~40 titles that only declare `layout` keep their method
// without a migration. Pure so vpadcheck can pin it in Node.
export function methodOf(pad) {
    if (pad && pad.method && METHODS.includes(pad.method)) return pad.method
    if (pad && pad.layout === 'dpad') return 'dpad'
    return 'stick'
}

// --- The live "held" one pad -------------------------------------------------
//
// The single pad object every source is down on right now. A game's keyboard
// handler, the touch pad (VirtualControls) and the physical gamepad
// (GamepadBridge) all write their fields here, and the game's sim tick reads
// currentPad(method) for THE one pad — so keys, touch, mouse, gamepad and a
// scripted __game.step all produce the same shape. __game.step() bypasses the
// holder and hands an explicit pad straight to tick through the same
// normalizePad, which is what makes "one pad per tick" true.
//
// Digital fields are last-writer-wins per source (on one device a single source
// is usually active); analog x / y and pointer are likewise replaced, and
// normalizePad ORs any explicit digital with quantize(x, y) so an analog source
// and a digital source never fight.
export const held = blankPad()

export function press(field) { held[field] = true }
export function release(field) { held[field] = false }

// The analog stick (a touch stick or a gamepad's left stick): x / y in -1..1.
// #431: the shared scaled radial dead zone is applied here too, so games
// reading THE one pad (currentPad) get the same stick feel as padState readers.
export function setStickVec(x, y) {
    const dz = radialDeadZone(x, y)
    held.x = dz.x
    held.y = dz.y
}

// The pointer (a drag on the canvas for a pointer game): x / y normalized 0..1
// to the canvas, down = pressed, alt = the second gesture. down false clears it.
export function setPointer(x, y, down, alt) {
    held.pointer.x = clamp01(x)
    held.pointer.y = clamp01(y)
    held.pointer.down = !!down
    held.pointer.alt = !!alt
}

export function clearHeld() { Object.assign(held, blankPad()) }

// The one pad for a game of `method` from everything currently held.
export function currentPad(method) { return normalizePad(held, method) }
