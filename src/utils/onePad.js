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
//     ax, ay,                      // AIM analog vector, -1..1 (twin-stick aim, #496)
//     aimUp, aimDown, aimLeft,     // digital aim directions: explicit OR ax/ay
//     aimRight,                        quantized through the SAME DIR_DEAD
//     pointer: { x, y, down, alt } }  // x / y normalized 0..1 to the canvas
//
// Pure: importable in Node (vpadcheck) and the browser (VirtualControls,
// gameContract, GamepadBridge). No React, no DOM.

import { radialDeadZone } from './padState.js'

export const METHODS = ['dpad', 'stick', 'pointer']

// The digital direction fields the shared quantizer fills in.
export const DIR_FIELDS = ['up', 'down', 'left', 'right']

// The one-pad's top-level field names (the meta surface a game reports it reads).
export const PAD_FIELDS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'x', 'y', 'ax', 'ay', 'aimUp', 'aimDown', 'aimLeft', 'aimRight', 'pointer']

// The digital AIM direction fields (#496, the twin-stick second vector).
export const AIM_FIELDS = ['aimUp', 'aimDown', 'aimLeft', 'aimRight']

// A fresh, all-idle pad. Pointer rests at the top-left corner with `down` false,
// so a resting pointer is never mistaken for a press.
export function blankPad() {
    return {
        up: false, down: false, left: false, right: false,
        a: false, b: false, start: false,
        x: 0, y: 0,
        ax: 0, ay: 0,
        aimUp: false, aimDown: false, aimLeft: false, aimRight: false,
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

    // #496 twin-stick aim: the SAME quantizer turns the aim vector digital, so
    // step({ax: 1}) and step({aimRight: true}) read alike — for one stick, the
    // movement stick and the aim stick are the same rules twice.
    pad.ax = num(r.ax)
    pad.ay = num(r.ay)
    if (Math.abs(pad.ax) > 1) pad.ax = pad.ax > 0 ? 1 : -1
    if (Math.abs(pad.ay) > 1) pad.ay = pad.ay > 0 ? 1 : -1
    const aq = quantize(pad.ax, pad.ay)
    pad.aimUp = !!r.aimUp || aq.up
    pad.aimDown = !!r.aimDown || aq.down
    pad.aimLeft = !!r.aimLeft || aq.left
    pad.aimRight = !!r.aimRight || aq.right

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

// #496: slot 1's AIM stick (a gamepad's right stick) — the same dead zone as
// the movement stick, landing on the pad's ax / ay.
export function setAimVec(x, y) {
    const dz = radialDeadZone(x, y)
    held.ax = dz.x
    held.ay = dz.y
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

// --- Press, preview, release (#432): the shared pointer gesture ------------
//
// A pointer-method game aims with the finger, not a magic cursor: the PRESS
// shows a preview on the candidate the finger will take, SLIDING re-targets,
// the RELEASE commits — and a release over nothing commits nothing. The
// candidate list and the commit are the game's; the gesture and the reach are
// the shared half, so every pointer title (Lemmings, Civ, SimCity, …) picks
// targets with the same thumb-sized model.
//
// POINTER_HIT_PX is the finger's reach in SCREEN px (about a fingertip), not
// world cells: the same thumb-size at any zoom, on any phone. `scale` is the
// stage's screen px per world unit (the game's fit scale); the game converts
// the finger to world units the same way it converts any stage point.
export const POINTER_HIT_PX = 24

// The nearest candidate to the finger, in screen space. cands are plain
// {x, y} in world units (the game attaches its own ids / fields); (wx, wy) is
// the finger in world units; scale is screen px per world unit. Within the
// reach the nearest wins; outside it, nothing (a miss is not a near-miss).
export function pointerTarget(cands, wx, wy, scale, hitPx = POINTER_HIT_PX) {
    const reach = hitPx / (scale > 0 ? scale : 1)
    let best = null, bd = reach + 1e-9
    for (const c of cands) {
        const d = Math.hypot(c.x - wx, c.y - wy)
        if (d < bd) { bd = d; best = c }
    }
    return best
}

// Step the gesture with THE one pad's pointer field. `gs` is the game's own
// plain object (it keeps gs.pd / gs.aim); cands the live candidates; commit
// gets the target or null on the release edge (null = release on nothing, a
// no-op). Press and hold re-target every call, so a slide moves the preview.
export function pointerGesture(gs, p, cands, wx, wy, scale, commit) {
    const down = !!(p && p.down)
    if (down) {
        gs.aim = pointerTarget(cands, wx, wy, scale)
    } else if (gs.pd) {
        const a = gs.aim
        gs.aim = null
        if (commit) commit(a)
    }
    gs.pd = down
}

// --- Player slots (#492): pad N drives player N -----------------------------
//
// One held pad per player slot. Slot 1 IS `held` above — every existing field
// and function (press / release / setStickVec / setPointer / clearHeld /
// currentPad) keeps writing and reading exactly slot 1, so the ~40
// single-player titles are byte-identical. A second physical gamepad feeds
// slot 2 through the GamepadBridge, and a multiplayer game reads slot N's pad
// each tick with slotPad(n, method). Keyboard, touch and mouse stay slot 1
// (Jon's ruling: no second on-screen touchpad).
//
// `connected` is the number of live player slots: pad N online (N > 1) makes
// slots 1..N exist. Keyboard-only 2P titles keep connected 1; the count is
// about pads, not about mode.

export const MAX_SLOTS = 4

const slotPads = [held]

// The raw held pad of slot n (1-based), growing the table on demand.
function slot(n) {
    const i = Math.max(1, Math.min(MAX_SLOTS, n | 0)) - 1
    while (slotPads.length <= i) slotPads.push(blankPad())
    return slotPads[i]
}

// The one pad for slot n, normalized for a game of `method`. Slot 1 through
// this is the same as currentPad(method).
export function slotPad(n, method) { return normalizePad(slot(n), method) }

export function pressSlot(n, field) { slot(n)[field] = true }
export function releaseSlot(n, field) { slot(n)[field] = false }

// Slot n's analog stick, with the same shared scaled radial dead zone.
export function setStickVecSlot(n, x, y) {
    const dz = radialDeadZone(x, y)
    const p = slot(n)
    p.x = dz.x
    p.y = dz.y
}

// #496: slot n's AIM stick (that pad's right stick), same dead zone as movement.
export function setAimVecSlot(n, x, y) {
    const dz = radialDeadZone(x, y)
    const p = slot(n)
    p.ax = dz.x
    p.ay = dz.y
}

export function setPointerSlot(n, x, y, down, alt) {
    const p = slot(n)
    p.pointer.x = clamp01(x)
    p.pointer.y = clamp01(y)
    p.pointer.down = !!down
    p.pointer.alt = !!alt
}

export function clearSlot(n) { Object.assign(slot(n), blankPad()) }

// True while slot n has anything held down (direction, button, stick, aim, pointer).
export function slotActive(n) {
    const p = slot(n)
    return p.up || p.down || p.left || p.right || p.a || p.b || p.start
        || p.x !== 0 || p.y !== 0 || p.ax !== 0 || p.ay !== 0
        || p.aimUp || p.aimDown || p.aimLeft || p.aimRight
        || p.pointer.down || p.pointer.alt
}

let connected = 1

// The live player-slot count (>= 1: keyboard is always slot 1).
export function connectedSlots() { return connected }

// Set the live slot count (the GamepadBridge reports one slot per connected
// pad, at least 1). Clamped to 1..MAX_SLOTS. Clears the pads of slots that
// went away, so a unplugged pad's held key never sticks at slot N.
export function setConnected(n) {
    const c = Math.max(1, Math.min(MAX_SLOTS, n | 0))
    if (c === connected) return connected
    for (let i = c; i < MAX_SLOTS; i++) if (slotPads[i]) Object.assign(slotPads[i], blankPad())
    connected = c
    return connected
}

// Release every slot and drop back to one (unmount / page teardown).
export function clearAllSlots() {
    for (let i = 0; i < slotPads.length; i++) Object.assign(slotPads[i], blankPad())
    connected = 1
}
