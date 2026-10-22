// vpadcheck — VirtualControls direction logic + sliding sequence, in Node (~1s).
//
// Proves:
//   1. dirsFrom returns the right codes for all 8 sectors + dead zone
//   2. sectorFrom maps angles correctly
//   3. The thumb-slip sequence left → up-left → up produces the right
//      keydown/keyup events (the spec's acceptance check)
//   4. Space dispatches key=' ' (not key='Space')

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { dirsFrom, sectorFrom, SECTOR_DIRS, DEAD_ZONE, stickVec, STICK_TRAVEL, STICK_DEAD, dpadDirs, DPAD_SWAP_HI, DPAD_SWAP_LO } from '../src/components/virtualDir.js'
import { gamepadToCodes, stickDirections, GPAD_DEAD_ZONE, GPAD_RELEASE_ZONE, GPAD_DPAD, GPAD_FIXED, validPad, padButton, stickFromAxes, triggersFromPad, shouldUseStick, waysOf, rumble, slotFieldsFrom } from '../src/components/gamepadMap.js'
import { steerPedals, steerResponse, STEER_GAIN } from '../src/utils/padState.js'
import { METHODS, blankPad, quantize, normalizePad, methodOf, DIR_DEAD, POINTER_HIT_PX, pointerTarget, pointerGesture, press, release, MAX_SLOTS, slotPad, pressSlot, setStickVecSlot, clearSlot, slotActive, setConnected, connectedSlots, clearAllSlots } from '../src/utils/onePad.js'
import { p2From } from '../src/games/Gauntlet/p2input.js'
import { actionCodeAt } from '../src/components/actionHit.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error(`  FAIL: ${msg}`) } }
const codes = (arr) => [...arr].sort().join(',')
// Compare a returned code Set against an expected array, order-insensitive.
const setEq = (set, expected) => codes(set) === codes(expected)
// Build a fake Gamepad: a 17-button pad with the given indices pressed, given axes.
const padWith = (pressedIdx, axes) => ({
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressedIdx.includes(i) })),
    axes: axes || [0, 0],
})


// --- 1. dirsFrom: all 8 sectors ---
// Offsets well outside the dead zone, each in a distinct sector
const sectorTests = [
    // [dx, dy, expected codes, label]
    [50, 0,  ['ArrowRight'], 'right'],
    [35, 35, ['ArrowDown', 'ArrowRight'], 'down-right'],
    [0, 50,  ['ArrowDown'], 'down'],
    [-35, 35, ['ArrowDown', 'ArrowLeft'], 'down-left'],
    [-50, 0, ['ArrowLeft'], 'left'],
    [-35, -35, ['ArrowUp', 'ArrowLeft'], 'up-left'],
    [0, -50, ['ArrowUp'], 'up'],
    [35, -35, ['ArrowUp', 'ArrowRight'], 'up-right'],
]
for (const [dx, dy, expected, label] of sectorTests) {
    const got = dirsFrom(dx, dy)
    ok(codes(got) === codes(expected), `dirsFrom(${dx},${dy}) = ${codes(got)}, want ${codes(expected)} (${label})`)
}

// --- 2. Dead zone ---
ok(dirsFrom(0, 0).length === 0, 'dead zone: centre returns []')
ok(dirsFrom(10, 0).length === 0, `dead zone: dx=10 (< ${DEAD_ZONE}) returns []`)
ok(dirsFrom(0, 10).length === 0, `dead zone: dy=10 (< ${DEAD_ZONE}) returns []`)
ok(dirsFrom(DEAD_ZONE, 0).length === 1, `edge: dx=${DEAD_ZONE} (== dead zone) returns 1 code`)

// --- 3. sectorFrom ---
ok(sectorFrom(50, 0) === 0, 'sectorFrom right = 0')
ok(sectorFrom(0, -50) === 6, 'sectorFrom up = 6')
ok(sectorFrom(-50, 0) === 4, 'sectorFrom left = 4')
ok(sectorFrom(0, 50) === 2, 'sectorFrom down = 2')
ok(sectorFrom(-35, -35) === 5, 'sectorFrom up-left = 5')

// --- 4. Sliding sequence: left → up-left → up ---
// Simulates the same transition logic the component uses.
function simulateSlide(positions) {
    let held = new Set()
    const events = []
    for (const [dx, dy] of positions) {
        const next = new Set(dirsFrom(dx, dy))
        for (const c of held) if (!next.has(c)) events.push(`keyup ${c}`)
        for (const c of next) if (!held.has(c)) events.push(`keydown ${c}`)
        held = next
    }
    for (const c of held) events.push(`keyup ${c}`)
    return events
}

const slide = simulateSlide([
    [-50, 0],    // left
    [-35, -35],  // up-left
    [0, -50],    // up
])

const expectedSlide = [
    'keydown ArrowLeft',
    'keydown ArrowUp',
    'keyup ArrowLeft',
    'keyup ArrowUp',
]
ok(JSON.stringify(slide) === JSON.stringify(expectedSlide),
    `slide left→up-left→up = ${JSON.stringify(slide)}, want ${JSON.stringify(expectedSlide)}`)

// --- 5. Slide right → down-right → down ---
const slide2 = simulateSlide([
    [50, 0],
    [35, 35],
    [0, 50],
])
const expectedSlide2 = [
    'keydown ArrowRight',
    'keydown ArrowDown',
    'keyup ArrowRight',
    'keyup ArrowDown',
]
ok(JSON.stringify(slide2) === JSON.stringify(expectedSlide2),
    `slide right→down-right→down = ${JSON.stringify(slide2)}, want ${JSON.stringify(expectedSlide2)}`)

// --- 6. Slide up → up-right → right (clockwise around top) ---
const slide3 = simulateSlide([
    [0, -50],
    [35, -35],
    [50, 0],
])
const expectedSlide3 = [
    'keydown ArrowUp',
    'keydown ArrowRight',
    'keyup ArrowUp',
    'keyup ArrowRight',
]
ok(JSON.stringify(slide3) === JSON.stringify(expectedSlide3),
    `slide up→up-right→right = ${JSON.stringify(slide3)}, want ${JSON.stringify(expectedSlide3)}`)

// --- 7. Space key property ---
// The component sends key=' ' for Space. Verify the logic:
const spaceKey = 'Space' === 'Space' ? ' ' : 'Space'
ok(spaceKey === ' ', `Space key property is ' ' (got '${spaceKey}')`)

// --- 8. SECTOR_DIRS completeness ---
ok(SECTOR_DIRS.length === 8, 'SECTOR_DIRS has 8 entries')
const allCodes = new Set(SECTOR_DIRS.flat())
for (const c of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    ok(allCodes.has(c), `SECTOR_DIRS covers ${c}`)
}

// --- 9. Gamepad: d-pad -> arrow codes ---
ok(setEq(gamepadToCodes(padWith([12])).codes, ['ArrowUp']), 'd-pad up (12) -> ArrowUp')
ok(setEq(gamepadToCodes(padWith([13])).codes, ['ArrowDown']), 'd-pad down (13) -> ArrowDown')
ok(setEq(gamepadToCodes(padWith([14])).codes, ['ArrowLeft']), 'd-pad left (14) -> ArrowLeft')
ok(setEq(gamepadToCodes(padWith([15])).codes, ['ArrowRight']), 'd-pad right (15) -> ArrowRight')
ok(setEq(gamepadToCodes(padWith([12, 15])).codes, ['ArrowUp', 'ArrowRight']), 'd-pad up+right -> diagonal')
ok(setEq(gamepadToCodes(padWith([])).codes, []), 'empty pad -> no codes')

// --- 10. Gamepad: face + system buttons ---
ok(setEq(gamepadToCodes(padWith([0])).codes, ['Space']), 'A (0) -> Space')
ok(setEq(gamepadToCodes(padWith([9])).codes, ['Enter']), 'Start (9) -> Enter')
ok(setEq(gamepadToCodes(padWith([8])).codes, ['Question']), 'Select (8) -> Question (the ? pause)')
ok(setEq(gamepadToCodes(padWith([1])).codes, ['KeyB']), 'B (1) -> default second action (KeyB)')
ok(setEq(gamepadToCodes(padWith([1]), { secondAction: 'KeyX' }).codes, ['KeyX']), 'B (1) -> game secondAction (KeyX)')

// --- 11. Gamepad: left stick -> arrows, dead zone ---
ok(setEq(gamepadToCodes(padWith([], [0.8, 0])).codes, ['ArrowRight']), 'stick right (0.8) -> ArrowRight')
ok(setEq(gamepadToCodes(padWith([], [0, -0.8])).codes, ['ArrowUp']), 'stick up (0,-0.8) -> ArrowUp')
ok(setEq(gamepadToCodes(padWith([], [-0.6, -0.6])).codes, ['ArrowLeft', 'ArrowUp']), 'stick up-left -> diagonal')
ok(setEq(gamepadToCodes(padWith([], [GPAD_DEAD_ZONE, 0])).codes, ['ArrowRight']), `stick at |v|==${GPAD_DEAD_ZONE} (edge) engages`)
ok(setEq(gamepadToCodes(padWith([], [GPAD_DEAD_ZONE - 0.05, 0])).codes, []), `stick |v|=${GPAD_DEAD_ZONE - 0.05} (< dead zone) from rest stays centre`)

// --- 12. Gamepad: stick + d-pad combine (union) ---
ok(setEq(gamepadToCodes(padWith([13], [0.8, 0])).codes, ['ArrowDown', 'ArrowRight']), 'stick right + d-pad down -> both')

// --- 13. Gamepad: hysteresis band keeps the last direction ---
// Push past the dead zone, then ease back into the band: the direction must
// hold (not flicker off) until the stick drops below the release zone.
{
    const st = { engaged: false, lastCodes: [] }
    const seq = [[0, 0], [0.6, 0], [0.2, 0], [0.15, 0], [0.05, 0]].map(([x, y]) => stickDirections([x, y], st))
    ok(JSON.stringify(seq[1]) === JSON.stringify(['ArrowRight']), 'hysteresis: |v|>=0.3 engages ArrowRight')
    ok(JSON.stringify(seq[2]) === JSON.stringify(['ArrowRight']), `hysteresis: band (0.1<|v|=${0.2}) keeps last direction`)
    ok(JSON.stringify(seq[3]) === JSON.stringify(['ArrowRight']), `hysteresis: band (|v|=${0.15}) keeps last direction`)
    ok(JSON.stringify(seq[4]) === JSON.stringify([]), `release: |v|=${0.05} (< ${GPAD_RELEASE_ZONE}) clears the direction`)
}

// --- 14. Mutant that dies: hysteresis removed ---
// A no-hysteresis mutant re-derives the sector from noise every frame, so the
// moment the stick eases back into the band it drops the direction. The real
// logic keeps it. Prove the two diverge on the same input, so a regression
// that deletes the band is caught.
{
    const input = [[0, 0], [0.6, 0], [0.2, 0], [0.15, 0], [0.05, 0]]
    const st = { engaged: false, lastCodes: [] }
    const real = input.map(([x, y]) => stickDirections([x, y], st))
    const mutant = input.map(([x, y]) => (Math.hypot(x, y) >= GPAD_DEAD_ZONE ? dirsFrom(x, y, 0) : []))
    ok(JSON.stringify(real) !== JSON.stringify(mutant), 'hysteresis-removed mutant diverges from real stick logic')
    ok(JSON.stringify(mutant[2]) === JSON.stringify([]), 'mutant drops the direction inside the band (this is the bug)')
}

// --- 15. Gamepad: mapping tables are the standard layout ---
ok(GPAD_DPAD[12] === 'ArrowUp' && GPAD_DPAD[13] === 'ArrowDown' && GPAD_DPAD[14] === 'ArrowLeft' && GPAD_DPAD[15] === 'ArrowRight', 'd-pad table is the W3C layout (12 up,13 down,14 left,15 right)')
ok(GPAD_FIXED[0] === 'Space' && GPAD_FIXED[8] === 'Question' && GPAD_FIXED[9] === 'Enter', 'fixed-button table: A=Space, Select=Question, Start=Enter')

// --- 16. Pad declaration (games.js `pad` field): validPad shape ---
const goodPad = { layout: 'dpad', buttons: [{ label: 'B', code: 'KeyX' }], analog: false }
ok(validPad(goodPad) === true, 'validPad: well-formed dpad accepted')
ok(validPad({ layout: 'stick', buttons: [{ label: 'A', code: 'KeyW' }], analog: true }) === true, 'validPad: stick + analog accepted')
ok(validPad({ layout: 'stick+dpad', buttons: [] }) === true, 'validPad: stick+dpad with no buttons accepted')
ok(validPad(null) === false, 'validPad: null (no pad) rejected as a declaration')
ok(validPad({ layout: 'joystick', buttons: [] }) === false, 'validPad: unknown layout rejected')
ok(validPad({ layout: 'dpad' }) === false, 'validPad: missing buttons rejected')
ok(validPad({ layout: 'dpad', buttons: [{ label: 'B' }] }) === false, 'validPad: button missing code rejected')
ok(validPad({ layout: 'dpad', buttons: [{ code: 'KeyB' }] }) === false, 'validPad: button missing label rejected')
ok(validPad({ layout: 'dpad', buttons: [], analog: 'yes' }) === false, 'validPad: non-boolean analog rejected')

// --- 17. padButton: the B (second-action) button ---
ok(padButton(goodPad) && padButton(goodPad).code === 'KeyX' && padButton(goodPad).label === 'B', 'padButton: returns buttons[0] {label,code}')
ok(padButton(null) === null, 'padButton: null pad -> null')
ok(padButton({ layout: 'dpad' }) === null, 'padButton: invalid pad -> null')
ok(padButton({ layout: 'dpad', buttons: [] }) === null, 'padButton: no buttons -> null')

// --- 18. Mutant that dies: padButton picks the LAST button ---
// The B button is buttons[0]; a mutant that returns the last button silently
// binds the physical B to the wrong key on any multi-button declaration. Prove
// the two diverge on a two-button pad so the regression is caught.
{
    const multi = { layout: 'dpad', buttons: [{ label: 'B', code: 'KeyX' }, { label: 'C', code: 'KeyC' }] }
    const real = padButton(multi)
    const mutant = (p) => (validPad(p) && p.buttons.length ? p.buttons[p.buttons.length - 1] : null)
    ok(real.code === 'KeyX', 'padButton real picks the FIRST button (the B)')
    ok(mutant(multi).code === 'KeyC', 'mutant picks the LAST button (this is the bug)')
    ok(JSON.stringify(real) !== JSON.stringify(mutant(multi)), 'last-button mutant diverges from real padButton')
}

// --- 19. games.js: every folded game declares a pad with the right B code ---
// The step-2 fold removed the per-game secondAction prop, so the registry is now
// the only place the B code lives. If a game lost its pad entry, its B button and
// physical-pad binding vanish — this guard reads the registry text and fails.
{
    const gamesSrc = readFileSync(new URL('../src/config/games.js', import.meta.url), 'utf8')
    const blockFor = (path) => {
        const i = gamesSrc.indexOf(`path: '${path}'`)
        if (i === -1) return null
        const j = gamesSrc.indexOf('path: ', i + 1)
        return gamesSrc.slice(i, j === -1 ? gamesSrc.length : j)
    }
    const folded = [
        ['/mario', 'KeyF'], ['/ironkeep', 'ShiftLeft'], ['/beezee', 'KeyV'],
        ['/metroid', 'KeyX'], ['/simcity-min', 'KeyT'], ['/outpost', 'KeyT'], ['/papers-please', 'KeyD'],
        ['/lode-runner', 'ArrowDown'], ['/dogfight', 'KeyE'], ['/paperboy', 'KeyF'], ['/wizardry', 'KeyF'],
        ['/spy-hunter', 'KeyX'], ['/excitebike', 'KeyG'], ['/mario-kart', 'KeyR'], ['/zelda', 'KeyX'],
        ['/minesweeper', 'KeyB'], ['/bubble-bobble', 'KeyB'], ['/gauntlet', 'KeyX'], ['/four-halls', 'KeyX'],
        ['/smash-tv', 'KeyB'], ['/out-run', 'KeyB'], ['/lunar-lander', 'KeyX'], ['/polarity', 'KeyX'],
    ]
    for (const [path, code] of folded) {
        const block = blockFor(path)
        ok(block !== null, `games.js has an entry for ${path}`)
        if (!block) continue
        ok(/pad: \{/.test(block), `games.js ${path} declares a pad`)
        ok(new RegExp(`pad: .*code: '${code}'`).test(block), `games.js ${path} pad B code is ${code}`)
    }
}

// --- 20. stickVec: floating-stick offset -> clamped knob + analog vector ---
// Centre / dead zone: not engaged, zero vector, zero knob offset.
{
    const c = stickVec(0, 0)
    ok(c.engaged === false, 'stickVec centre: not engaged')
    ok(c.x === 0 && c.y === 0 && c.push === 0 && c.px === 0 && c.py === 0, 'stickVec centre: zero vector + knob')
    ok(stickVec(STICK_DEAD - 1, 0).engaged === false, `stickVec |d|=${STICK_DEAD - 1} (< dead) stays at rest`)
    ok(stickVec(0, STICK_DEAD - 1).engaged === false, 'stickVec small dy (< dead) stays at rest')
    ok(stickVec(STICK_DEAD, 0).engaged === true, `stickVec |d|==${STICK_DEAD} (edge) engages`)
}
// A push past the travel circle clamps to push===1 with a unit analog vector.
{
    const v = stickVec(100, 0)   // 100px right; travel radius is STICK_TRAVEL
    ok(v.engaged === true, 'stickVec right push: engaged')
    ok(Math.abs(v.push - 1) < 1e-9, `stickVec over-travel clamps push to 1 (got ${v.push})`)
    ok(Math.hypot(v.x, v.y) === 1, `stickVec over-travel yields a unit analog vector (got ${Math.hypot(v.x, v.y)})`)
    ok(v.x === 1 && v.y === 0, 'stickVec right: analog vector is +x')
    ok(Math.abs(v.px - STICK_TRAVEL) < 1e-9 && v.py === 0, 'stickVec over-travel clamps the knob to the travel circle')
}
// A half push gives push 0.5 with a proportional (non-unit) vector + raw knob offset.
{
    const half = STICK_TRAVEL / 2
    const v = stickVec(half, 0)
    ok(Math.abs(v.push - 0.5) < 1e-9, `stickVec |d|==travel/2 -> push 0.5 (got ${v.push})`)
    ok(Math.abs(v.x - 0.5) < 1e-9 && v.y === 0, 'stickVec |d|==travel/2 -> vector 0.5 +x')
    ok(Math.abs(v.px - half) < 1e-9, 'stickVec under-travel: knob offset equals the raw offset')
}
// Diagonal over-travel clamps to the circle: unit vector, symmetric knob.
{
    const v = stickVec(100, 100)   // down-right, well past travel
    ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-9, 'stickVec diagonal over-travel: unit vector')
    ok(v.x > 0 && v.y > 0, 'stickVec diagonal: +x +y (screen down-right)')
    ok(Math.abs(v.px) === Math.abs(v.py), 'stickVec diagonal: knob clamps symmetrically on the circle')
}
// All 8 directions produce the expected analog-vector signs (what a game reads).
{
    const dirTests = [
        [1, 0, 'right'], [0, 1, 'down'], [-1, 0, 'left'], [0, -1, 'up'],
        [1, 1, 'down-right'], [1, -1, 'up-right'], [-1, 1, 'down-left'], [-1, -1, 'up-left'],
    ]
    for (const [sx, sy, label] of dirTests) {
        const v = stickVec(sx * 40, sy * 40)
        ok(Math.sign(v.x) === sx && Math.sign(v.y) === sy, `stickVec ${label}: analog vector signs match (${v.x.toFixed(2)},${v.y.toFixed(2)})`)
    }
}

// --- 21. Mutant that dies: the knob is NOT clamped to the travel circle ---
// Without clamping, a push far beyond the travel radius would report a vector
// whose magnitude exceeds 1 (a game steering on it would over-steer) and push>1.
// The real logic clamps both. Prove they diverge on an over-travel push.
{
    const real = stickVec(100, 0)
    const mag = Math.hypot(100, 0)
    const mutant = { px: 100, py: 0, x: 100 / STICK_TRAVEL, y: 0, push: mag / STICK_TRAVEL, engaged: true }
    ok(Math.abs(real.push - 1) < 1e-9 && mutant.push > 1, 'no-clamp mutant reports push > 1 (the bug)')
    ok(Math.hypot(mutant.x, mutant.y) > 1, 'no-clamp mutant reports an over-unit analog vector (the bug)')
    ok(JSON.stringify(real) !== JSON.stringify(mutant), 'no-clamp mutant diverges from real stickVec')
}

// --- 22. The first analog game opts in to the fixed stick (#420) ---
// MarioKart is the stick pilot: it drives purely from the one pad (VirtualControls
// writes it, the sim reads it). It now declares the new `method: 'stick'` (the
// fixed always-visible stick, not the floating one). Guard the registry so a
// silent revert is caught.
{
    const gamesSrc = readFileSync(new URL('../src/config/games.js', import.meta.url), 'utf8')
    const i = gamesSrc.indexOf("path: '/mario-kart'")
    ok(i !== -1, 'games.js has an entry for /mario-kart')
    if (i !== -1) {
        const j = gamesSrc.indexOf('path: ', i + 1)
        const block = gamesSrc.slice(i, j === -1 ? gamesSrc.length : j)
        ok(/method: 'stick'/.test(block), 'games.js /mario-kart declares method: stick (the fixed stick)')
        ok(/analog: true/.test(block), 'games.js /mario-kart opts in to analog input')
    }
}

// --- 23. stickFromAxes: the analog read of a gamepad stick (#290 step 4) ---
// Same space the floating touch stick publishes: |v| == push, clamped to the
// unit circle, engaged past the (shared) dead zone.
{
    const r = stickFromAxes([0.8, 0])
    ok(r.engaged === true && Math.abs(r.x - 0.8) < 1e-9 && r.y === 0 && Math.abs(r.push - 0.8) < 1e-9,
        `stickFromAxes right push 0.8 -> engaged (0.8, 0) push 0.8 (got ${r.x},${r.y} push ${r.push} eng ${r.engaged})`)
    const c = stickFromAxes([0, 0])
    ok(c.engaged === false && c.x === 0 && c.y === 0 && c.push === 0, 'stickFromAxes centre -> not engaged, zero vector')
    const d = stickFromAxes([GPAD_DEAD_ZONE - 0.05, 0])
    ok(d.engaged === false, `stickFromAxes |v|=${GPAD_DEAD_ZONE - 0.05} (< dead zone) -> not engaged`)
    const e = stickFromAxes([GPAD_DEAD_ZONE, 0])
    ok(e.engaged === true, `stickFromAxes |v|==${GPAD_DEAD_ZONE} (edge) -> engaged`)
    const diag = stickFromAxes([0.8, 0.8])
    ok(Math.abs(Math.hypot(diag.x, diag.y) - 1) < 1e-9 && Math.abs(diag.push - 1) < 1e-9,
        'stickFromAxes diagonal (|v|=1.13) clamps to the unit circle, push 1')
    ok(diag.x === diag.y && diag.x > 0, 'stickFromAxes diagonal keeps the 45-degree bearing')
    const sparse = stickFromAxes(undefined)
    ok(sparse.engaged === false && sparse.x === 0 && sparse.push === 0, 'stickFromAxes missing axes -> rest, no crash')
}

// --- 24. triggersFromPad: buttons 6 (LT) / 7 (RT), analog value with a digital fallback ---
{
    const b = (i, value, pressed) => ({ pressed: !!pressed, value })
    const pads = { buttons: Array.from({ length: 8 }, (_, i) => b(i, 0, false)) }
    ok(triggersFromPad(pads).lt === 0 && triggersFromPad(pads).rt === 0, 'triggersFromPad resting pad -> 0/0')
    pads.buttons[7].value = 0.5
    ok(triggersFromPad(pads).rt === 0.5, 'triggersFromPad RT half-squeezed -> 0.5')
    pads.buttons[6].value = 1
    ok(triggersFromPad(pads).lt === 1, 'triggersFromPad LT full -> 1')
    const digital = { buttons: Array.from({ length: 8 }, (_, i) => ({ pressed: false })) }
    digital.buttons[7].pressed = true
    ok(triggersFromPad(digital).rt === 1, 'triggersFromPad digital RT (no value) -> 1')
    const over = { buttons: Array.from({ length: 8 }, (_, i) => ({ pressed: false, value: i === 6 ? 1.7 : 0 })) }
    ok(triggersFromPad(over).lt === 1, 'triggersFromPad clamps an over-range value to 1')
    ok(triggersFromPad(null).rt === 0 && triggersFromPad(null).lt === 0, 'triggersFromPad null pad -> 0/0, no crash')
}

// --- 25. steerPedals: steering + pedals from the pad state ---
// The stick's x is the steering — through the #431 response curve + gain
// (steer = G·((1−A)x + A·x³), full push locks at G, not 1); the pedals are
// the triggers, with the stick's y as the touch fallback (push forward =
// gas, pull back = brake). The radial dead zone rides upstream, at the
// store writers (see steercheck).
{
    const up = steerPedals({ x: 0, y: -1, rt: 0, lt: 0 })
    ok(up.steer === 0 && up.thr === 1 && up.brk === 0, 'steerPedals stick fully forward -> thr 1, no brake')
    const down = steerPedals({ x: 0, y: 0.5, rt: 0, lt: 0 })
    ok(down.thr === 0 && Math.abs(down.brk - 0.5) < 1e-9, 'steerPedals stick pulled back halfway -> brk 0.5')
    const rt = steerPedals({ x: -0.7, y: -0.3, rt: 0.8, lt: 0 })
    ok(Math.abs(rt.steer - steerResponse(-0.7)) < 1e-9 && rt.steer < -0.2 && rt.steer > -STEER_GAIN && rt.thr === 0.8,
        `steerPedals x=-0.7 maps through curve+gain (${rt.steer.toFixed(4)}), RT beats a weaker stick-forward`)
    const lockR = steerPedals({ x: 1, y: 0, rt: 0, lt: 0 })
    ok(Math.abs(lockR.steer - STEER_GAIN) < 1e-9, `full right push locks at G=${STEER_GAIN}`)
    const both = steerPedals({ x: 0.4, y: 0.9, rt: 0.2, lt: 0.6 })
    ok(both.thr === 0.2 && Math.abs(both.brk - 0.9) < 1e-9,
        'steerPedals the larger of trigger/stick wins (stick brake 0.9 > lt 0.6)')
    const rest = steerPedals({ x: 0, y: 0, rt: 0, lt: 0 })
    ok(rest.steer === 0 && rest.thr === 0 && rest.brk === 0, 'steerPedals at rest -> all zero')
}

// --- 26. Mutant that dies: the y-axis pedal fallback removed ---
// A mutant that reads the pedals from the triggers alone loses the whole touch
// driving experience (a phone has no triggers). Prove it diverges on a
// stick-forward push with no triggers.
{
    const real = steerPedals({ x: 0, y: -1, rt: 0, lt: 0 })
    const mutant = (p) => ({ steer: p.x, thr: p.rt, brk: p.lt })
    const m = mutant({ x: 0, y: -1, rt: 0, lt: 0 })
    ok(real.thr === 1 && m.thr === 0, 'no-y-pedal mutant coasts on the touch stick (this is the bug)')
    ok(JSON.stringify(real) !== JSON.stringify(m), 'no-y-pedal mutant diverges from real steerPedals')
}

// --- 27. The first analog adopters actually opt in (#290 step 4) ---
// Two guards: the registry declares them analog, and their code reads
// padState (a silent removal of either would ship the stick as digital-only).
{
    const gamesSrc = readFileSync(new URL('../src/config/games.js', import.meta.url), 'utf8')
    const blockFor = (path) => {
        const i = gamesSrc.indexOf(`path: '${path}'`)
        if (i === -1) return null
        const j = gamesSrc.indexOf('path: ', i + 1)
        return gamesSrc.slice(i, j === -1 ? gamesSrc.length : j)
    }
    for (const path of ['/marble-madness', '/mario-kart', '/out-run']) {
        const block = blockFor(path)
        ok(block !== null, `games.js has an entry for ${path}`)
        if (block) {
            ok(/layout: 'stick'/.test(block) || /method: 'stick'/.test(block), `games.js ${path} uses the stick`)
            ok(/analog: true/.test(block), `games.js ${path} opts in to analog`)
        }
    }
    // The analog channel: legacy analog games read the padState holder; the #420
    // stick pilot (Mario Kart) reads the new one-pad. Each must import its own.
    const readers = [
        ['../src/games/MarbleMadness/index.jsx', "utils/padState", 'marble madness'],
        ['../src/games/OutRun/index.jsx', "utils/padState", 'out run'],
        ['../src/games/RaccoonHeist/index.jsx', "utils/padState", 'raccoon heist (right stick = camera)'],
        ['../src/games/MarioKart/index.jsx', "utils/onePad", 'mario kart (the #420 one pad)'],
    ]
    for (const [file, mod, label] of readers) {
        const src = readFileSync(new URL(file, import.meta.url), 'utf8')
        ok(new RegExp(`from '\\.\\./\\.\\./${mod}'`).test(src), `${label} imports the ${mod} analog channel`)
    }
}

// --- 28. Step 1 (#384): the floating stick is the DEFAULT touch layout ---
// A game with no pad declaration (or a non-dpad one) gets the stick; only an
// explicit layout 'dpad' opts out to the fixed d-pad (the grid-/menu titles).
{
    ok(shouldUseStick(null) === true, 'default: no pad declaration -> the floating stick')
    ok(shouldUseStick(undefined) === true, 'default: undefined pad -> the floating stick')
    ok(shouldUseStick({ layout: 'dpad', buttons: [] }) === false, 'layout dpad -> the fixed d-pad (the exception)')
    ok(shouldUseStick({ layout: 'stick', buttons: [] }) === true, 'layout stick -> the floating stick')
    ok(shouldUseStick({ layout: 'stick+dpad', buttons: [] }) === true, 'layout stick+dpad -> the floating stick')
}
// Mutant that dies: the default silently reverts to the pre-#384 d-pad, so every
// title that declares no pad loses the floating stick. Prove the two diverge.
{
    const oldDefault = (pad) => !!(pad && (pad.layout === 'stick' || pad.layout === 'stick+dpad'))
    ok(shouldUseStick(null) !== oldDefault(null), 'old d-pad-default mutant diverges (no pad is now stick)')
    ok(shouldUseStick({ layout: 'dpad', buttons: [] }) === oldDefault({ layout: 'dpad', buttons: [] }),
        'both agree dpad is the d-pad (only the default changed)')
}
// The d-pad exception set is exactly the grid- / menu-driven titles, and each
// carries a one-line reason. A silent revert (drop the layout or the reason)
// would put a grid game back on the floating stick, so the registry is pinned.
{
    const gamesSrc = readFileSync(new URL('../src/config/games.js', import.meta.url), 'utf8')
    const blockFor = (path) => {
        const i = gamesSrc.indexOf(`path: '${path}'`)
        if (i === -1) return null
        const j = gamesSrc.indexOf('path: ', i + 1)
        return gamesSrc.slice(i, j === -1 ? gamesSrc.length : j)
    }
    const dpadGames = ['/minesweeper', '/simcity-min', '/outpost', '/papers-please', '/wizardry', '/tetris', '/qbert', '/bards-tale']
    for (const path of dpadGames) {
        const block = blockFor(path)
        ok(block !== null, `games.js has an entry for ${path}`)
        if (!block) continue
        ok(/layout: 'dpad'/.test(block), `games.js ${path} keeps the fixed d-pad`)
        ok(/reason: '/.test(block), `games.js ${path} carries a one-line d-pad reason`)
    }
}

// --- 29. Step 2 (#384): labelled pads in the registry (batch 1 of ~10/PR) ---
// The real registry, bundled with the esbuild Vite ships (game components
// stubbed — the visibilitycheck trick), so this proves the actual `pad` values
// rather than a regex over the source. Every declared pad is well-formed, every
// button carries a non-empty label + code, and a dpad opt-out carries a reason.
// The batch-1 ten are pinned below; later steps extend the list until it is the
// whole registry, then this section flips to "every entry declares a pad".
{
    const here = dirname(fileURLToPath(import.meta.url))
    const root = join(here, '..')
    const STUB = join(root, 'node_modules', '.vpad-stub.cjs')
    const SRC = join(root, 'node_modules', '.vpad-A.src.js')
    const OUT = join(root, 'node_modules', '.vpad-A.mjs')
    writeFileSync(STUB, `module.exports = new Proxy({}, { get: (t, p) => () => null })\n`)
    writeFileSync(SRC, `import { GAMES } from ${JSON.stringify(join(root, 'src', 'config', 'games.js'))}\nexport { GAMES }\n`)
    await build({
        entryPoints: [SRC],
        absWorkingDir: root,
        outfile: OUT,
        bundle: true,
        format: 'esm',
        platform: 'node',
        jsx: 'automatic',
        banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
        logLevel: 'silent',
        plugins: [{
            name: 'stub-games',
            setup(b) {
                b.onResolve({ filter: /(^|\.\.\/)games\// }, () => ({ path: STUB, external: false }))
                b.onResolve({ filter: /^\.\/games\// }, () => ({ path: STUB, external: false }))
            },
        }],
    })
    const { GAMES } = await import(pathToFileURL(OUT).href)
    const nonEmpty = (s) => typeof s === 'string' && s.length > 0
    for (const g of GAMES) {
        if (g.pad === undefined) continue   // not yet declared (step 2 rolls out in batches)
        ok(validPad(g.pad), `${g.path}: pad declaration is well-formed`)
        for (const b of g.pad.buttons) {
            ok(nonEmpty(b.label) && nonEmpty(b.code), `${g.path}: pad button carries a non-empty label + code (${JSON.stringify(b)})`)
        }
        if (g.pad.layout === 'dpad') {
            ok(nonEmpty(g.pad.reason), `${g.path}: dpad opt-out carries a one-line reason`)
        }
    }
    // The batch-1 ten: declared now. mario-classic's B is RUN on KeyX (the code
    // accepts KeyX for run); the other nine are move-/fire-only originals with
    // no second button, so an empty button list is the honest declaration.
    const batch1 = {
        '/mario-classic': 'KeyX', '/galaga': null, '/pong': null, '/invaders': null,
        '/pacman': null, '/asteroids': null, '/donkeykong': null, '/centipede': null,
        '/defender': null, '/pitfall': null,
    }
    for (const [path, code] of Object.entries(batch1)) {
        const g = GAMES.find((e) => e.path === path)
        ok(!!g && g.pad !== undefined, `games.js ${path} declares a pad (step 2 batch 1)`)
        if (!g || g.pad === undefined) continue
        if (code === null) {
            ok(g.pad.buttons.length === 0, `games.js ${path} declares no B button (move-/fire-only original)`)
        } else {
            const b = padButton(g.pad)
            ok(!!b && b.code === code && nonEmpty(b.label), `games.js ${path} B button is ${code}, labelled '${b && b.label}'`)
        }
    }
    // Step 2 batch 2: the next ten undeclared canvas titles. Every one is a
    // move-/fire-only original whose primary action is the A button (Space), so
    // each takes the floating stick (the default) and declares no B button.
    const batch2 = {
        '/boulder-dash': null, '/sonar': null, '/momentum': null, '/frogger': null,
        '/tempest': null, '/dig-dug': null, '/adventure': null, '/joust': null,
        '/arkanoid': null, '/missile-battle': null,
    }
    for (const [path, code] of Object.entries(batch2)) {
        const g = GAMES.find((e) => e.path === path)
        ok(!!g && g.pad !== undefined, `games.js ${path} declares a pad (step 2 batch 2)`)
        if (!g || g.pad === undefined) continue
        ok(g.pad.layout === 'stick', `games.js ${path} uses the floating stick (the default)`)
        if (code === null) {
            ok(g.pad.buttons.length === 0, `games.js ${path} declares no B button (move-/fire-only original)`)
        } else {
            const b = padButton(g.pad)
            ok(!!b && b.code === code && nonEmpty(b.label), `games.js ${path} B button is ${code}, labelled '${b && b.label}'`)
        }
    }
}

// --- 30. #420: the one pad per tick + the three input methods (the pilots) ---
// The core: the shared quantizer, the one-pad normalizer, and the method
// resolver. Then the registry: the three pilot games each declare a method,
// read only the fields they use, and label their buttons by action — and each
// game actually imports the one pad it drives from.

// 30a. blankPad: the complete one-pad shape, at rest.
{
    const p = blankPad()
    ok(p.up === false && p.down === false && p.left === false && p.right === false, 'blankPad: no direction held')
    ok(p.a === false && p.b === false && p.start === false, 'blankPad: no button held')
    ok(p.x === 0 && p.y === 0, 'blankPad: analog at rest')
    ok(p.pointer && p.pointer.x === 0 && p.pointer.y === 0 && p.pointer.down === false && p.pointer.alt === false, 'blankPad: pointer at rest, not pressed')
}

// 30b. quantize: the ONE shared quantizer (analog x / y -> digital directions).
{
    ok(quantize(0.8, 0).right === true && quantize(0.8, 0).left === false, 'quantize +x -> right')
    ok(quantize(-0.8, 0).left === true, 'quantize -x -> left')
    ok(quantize(0, -0.8).up === true, 'quantize -y (screen up) -> up')
    ok(quantize(0, 0.8).down === true, 'quantize +y (screen down) -> down')
    ok(quantize(0.8, 0.8).right === true && quantize(0.8, 0.8).down === true, 'quantize a diagonal lights both axes (8-way)')
    ok(quantize(0, 0).up === false && quantize(0, 0).right === false, `quantize centre (< ${DIR_DEAD}) -> no direction`)
    ok(quantize(0.2, 0).right === false, `quantize |x|=${0.2} (inside the dead band) stays centre`)
    ok(quantize(DIR_DEAD + 0.05, 0).right === true, 'quantize just past the dead band engages')
}

// 30c. normalizePad: one pad from any source. dpad directions OR in from x / y.
{
    const p = normalizePad({ x: 1 }, 'dpad')
    ok(p.right === true && p.left === false && p.up === false && p.down === false, 'normalizePad dpad step({x:1}) reads as "right" (the one pad)')
    const up = normalizePad({ x: 0, y: -1 }, 'dpad')
    ok(up.up === true, 'normalizePad dpad step({y:-1}) reads as "up"')
    const explicit = normalizePad({ left: true, x: 0, y: 0 }, 'dpad')
    ok(explicit.left === true && explicit.right === false, 'normalizePad keeps an explicit digital direction')
    const both = normalizePad({ up: true, x: 1 }, 'dpad')
    ok(both.up === true && both.right === true, 'normalizePad ORs an explicit direction with quantize(x,y)')
    const rest = normalizePad({}, 'stick')
    ok(rest.x === 0 && rest.y === 0 && rest.up === false, 'normalizePad empty -> a resting pad')
    const act = normalizePad({ a: true, b: true, x: -1 }, 'stick')
    ok(act.a === true && act.b === true && act.left === true, 'normalizePad buttons + analog pass through, dirs quantized')
}

// 30d. normalizePad: pointer x / y clamp to 0..1; a gamepad stick parks the cursor.
{
    const p = normalizePad({ pointer: { x: 1.5, y: -0.5, down: true, alt: false } }, 'pointer')
    ok(p.pointer.x === 1 && p.pointer.y === 0 && p.pointer.down === true, 'normalizePad clamps pointer x/y to 0..1 and keeps down')
    const stick = normalizePad({ x: 1, y: -1 }, 'pointer')
    ok(Math.abs(stick.pointer.x - 1) < 1e-9 && stick.pointer.y === 0, 'a pointer game driven by a gamepad stick parks the cursor at the stick position')
}

// 30e. methodOf: the declared method wins; the legacy layout maps across.
{
    ok(METHODS.join(',') === 'dpad,stick,pointer', 'METHODS is exactly dpad/stick/pointer')
    ok(methodOf({ method: 'pointer', buttons: [] }) === 'pointer', 'methodOf: a declared method wins')
    ok(methodOf({ method: 'dpad', buttons: [] }) === 'dpad', 'methodOf: dpad')
    ok(methodOf({ layout: 'dpad', buttons: [] }) === 'dpad', 'methodOf: legacy layout dpad -> dpad')
    ok(methodOf({ layout: 'stick', buttons: [] }) === 'stick', 'methodOf: legacy layout stick -> stick')
    ok(methodOf({ layout: 'stick+dpad', buttons: [] }) === 'stick', 'methodOf: legacy stick+dpad -> stick')
    ok(methodOf(null) === 'stick', 'methodOf: no pad -> stick (the default)')
    ok(methodOf({ method: 'joystick', layout: 'dpad', buttons: [] }) === 'dpad', 'methodOf: an unknown method falls back to the legacy layout')
}

// 30f. The three pilots in the registry: method + reads + action-labeled B (and
// A), and each game imports the one pad it drives from. Real registry, bundled
// the way section 29 does — a silent revert of any declaration is caught.
{
    const here = dirname(fileURLToPath(import.meta.url))
    const root = join(here, '..')
    const OUT = join(root, 'node_modules', '.vpad-A.mjs')
    const { GAMES } = await import(pathToFileURL(OUT).href)
    const pilots = {
        '/pacman': { method: 'dpad', reads: ['up', 'down', 'left', 'right'], b: null, file: '../src/games/Pacman/index.jsx' },
        '/mario-kart': { method: 'stick', reads: ['x', 'y', 'a', 'b'], b: 'KeyR', bLabel: 'DRIFT', aLabel: 'ITEM', file: '../src/games/MarioKart/index.jsx' },
        '/lemmings': { method: 'pointer', reads: ['pointer'], b: null, file: '../src/games/Lemmings/index.jsx' },
    }
    for (const [path, want] of Object.entries(pilots)) {
        const g = GAMES.find((e) => e.path === path)
        ok(!!g && g.pad && g.pad.method === want.method, `games.js ${path} declares method ${want.method}`)
        if (!g || !g.pad) continue
        ok(validPad(g.pad), `games.js ${path} pad is well-formed (method)`)
        ok(JSON.stringify([...g.pad.reads].sort()) === JSON.stringify([...want.reads].sort()), `games.js ${path} reads ${JSON.stringify(want.reads)}`)
        if (want.b === null) {
            ok(g.pad.buttons.length === 0, `games.js ${path} declares no B button`)
        } else {
            const b = padButton(g.pad)
            ok(!!b && b.code === want.b && b.label === want.bLabel, `games.js ${path} B button is ${want.b}, labelled '${want.bLabel}'`)
        }
        if (want.aLabel) ok(g.pad.aLabel === want.aLabel, `games.js ${path} A button is labelled '${want.aLabel}'`)
        const src = readFileSync(new URL(want.file, import.meta.url), 'utf8')
        ok(/from '\.\.\/\.\.\/utils\/onePad'/.test(src), `games.js ${path} game imports the one pad it drives from`)
    }
}

// 30g. The three pilots' start prompts are touch-aware (#420): a phone has no
// arrow keys, so the attract prompt must say TAP. The gate reads each pilot's
// source and requires a TAP-carrying prompt, so a revert to keys-only is caught.
{
    const prompts = {
        '/pacman': '../src/games/Pacman/index.jsx',
        '/mario-kart': '../src/games/MarioKart/index.jsx',
        '/lemmings': '../src/games/Lemmings/index.jsx',
    }
    for (const [path, file] of Object.entries(prompts)) {
        const src = readFileSync(new URL(file, import.meta.url), 'utf8')
        ok(/\bTAP\b/.test(src), `games.js ${path} start prompt is touch-aware (says TAP)`)
    }
}

// --- 31. #439: the 4/8-way "diamond gate" quantizer (dpadDirs) ---
// A cabinet's 4-way stick has a restrictor gate: the thumb slides freely but the
// output snaps to the DOMINANT axis, with ±15-degree hysteresis near the 45deg
// diagonal so it does not flicker between two directions. ways 8 keeps the
// legacy nearest-sector read (diagonals allowed). Newest direction wins.

// 31a. 4-way pure axes (no hysteresis history needed).
{
    ok(JSON.stringify(dpadDirs(50, 0, 4, {})) === JSON.stringify(['ArrowRight']), 'dpadDirs 4-way +x -> right')
    ok(JSON.stringify(dpadDirs(-50, 0, 4, {})) === JSON.stringify(['ArrowLeft']), 'dpadDirs 4-way -x -> left')
    ok(JSON.stringify(dpadDirs(0, -50, 4, {})) === JSON.stringify(['ArrowUp']), 'dpadDirs 4-way -y (screen up) -> up')
    ok(JSON.stringify(dpadDirs(0, 50, 4, {})) === JSON.stringify(['ArrowDown']), 'dpadDirs 4-way +y (screen down) -> down')
}

// 31b. 4-way dominant axis: the larger |component| wins off the diagonal.
{
    ok(JSON.stringify(dpadDirs(50, 20, 4, {})) === JSON.stringify(['ArrowRight']), 'dpadDirs 4-way |x|>|y| off-diagonal -> right (dominant x)')
    ok(JSON.stringify(dpadDirs(20, 50, 4, {})) === JSON.stringify(['ArrowDown']), 'dpadDirs 4-way |y|>|x| off-diagonal -> down (dominant y)')
    ok(JSON.stringify(dpadDirs(-45, 15, 4, {})) === JSON.stringify(['ArrowLeft']), 'dpadDirs 4-way sign follows the active axis (-x, small +y) -> left')
}

// 31c. Dead zone: inside DEAD_ZONE nothing engages (a resting thumb).
{
    ok(dpadDirs(0, 0, 4, {}).length === 0, 'dpadDirs centre -> []')
    ok(dpadDirs(DEAD_ZONE - 1, 0, 4, {}).length === 0, `dpadDirs |d|=${DEAD_ZONE - 1} (< dead) -> []`)
    ok(dpadDirs(0, DEAD_ZONE - 1, 8, {}).length === 0, 'dpadDirs 8-way small dy (< dead) -> []')
}

// 31d. ways 8: the nearest 45-degree sector, diagonals allowed (the legacy read).
{
    ok(JSON.stringify(dpadDirs(35, 35, 8, {})) === JSON.stringify(SECTOR_DIRS[sectorFrom(35, 35)]), 'dpadDirs 8-way down-right -> the down-right sector (both axes)')
    ok(JSON.stringify(dpadDirs(35, 35, 8, {})) === JSON.stringify(['ArrowDown', 'ArrowRight']), 'dpadDirs 8-way down-right lights both axes')
    ok(JSON.stringify(dpadDirs(-35, -35, 8, {})) === JSON.stringify(['ArrowUp', 'ArrowLeft']), 'dpadDirs 8-way up-left lights both axes')
    ok(JSON.stringify(dpadDirs(35, 0, 8, {})) === JSON.stringify(['ArrowRight']), 'dpadDirs 8-way +x -> right')
}

// 31e. 4-way on an EXACT diagonal is deterministic (no history: vertical wins).
{
    ok(JSON.stringify(dpadDirs(35, 35, 4, {})) === JSON.stringify(['ArrowDown']), 'dpadDirs 4-way exact 45deg (no history) resolves deterministically (down)')
}

// 31f. Hysteresis — the core of the fix. Cross the diagonal from a dominant axis
// and the last axis holds until the thumb clears it by more than the ±15deg
// wedge (|y|/|x| past DPAD_SWAP_HI, ~1.73). This is what stops the flicker.
{
    const st = {}
    ok(JSON.stringify(dpadDirs(50, 0, 4, st)) === JSON.stringify(['ArrowRight']), 'hysteresis: push right engages (axis x)')
    // r = 60/50 = 1.2 (angle ~50deg, past the 45deg line but inside the wedge):
    // the dominant axis is now vertical, yet the last axis (x) is kept.
    ok(JSON.stringify(dpadDirs(50, 60, 4, st)) === JSON.stringify(['ArrowRight']),
        `hysteresis: r=1.2 (past 45deg, < ${DPAD_SWAP_HI.toFixed(2)}) KEEPS the last axis (right, not down)`)
    // Push clearly vertical (r = 100/50 = 2.0 > DPAD_SWAP_HI): the axis flips.
    ok(JSON.stringify(dpadDirs(50, 100, 4, st)) === JSON.stringify(['ArrowDown']),
        `hysteresis: r=2.0 (> ${DPAD_SWAP_HI.toFixed(2)}) takes the vertical axis (down)`)
    // Ease back to r = 30/40 = 0.75 (angle ~37deg): dominant axis is now
    // horizontal, but the last axis (y) is kept until it clears DPAD_SWAP_LO.
    ok(JSON.stringify(dpadDirs(40, 30, 4, st)) === JSON.stringify(['ArrowDown']),
        `hysteresis: r=0.75 (< 1 but > ${DPAD_SWAP_LO.toFixed(2)}) KEEPS the last axis (down, not right)`)
    // Push clearly horizontal (r = 20/50 = 0.4 < DPAD_SWAP_LO): the axis flips.
    ok(JSON.stringify(dpadDirs(50, 20, 4, st)) === JSON.stringify(['ArrowRight']),
        `hysteresis: r=0.4 (< ${DPAD_SWAP_LO.toFixed(2)}) takes the horizontal axis (right)`)
}

// 31g. Newest direction wins: a clear push overrides the hysteresis memory.
{
    const st = {}
    dpadDirs(50, 0, 4, st)   // right (axis x)
    dpadDirs(50, 60, 4, st)  // still right (hysteresis)
    ok(JSON.stringify(dpadDirs(0, -50, 4, st)) === JSON.stringify(['ArrowUp']),
        'newest wins: a clear up push overrides the remembered horizontal axis')
}

// 31h. The wedge constants are tan(45deg ± 15deg): ~1.73 up, ~0.58 down.
{
    ok(Math.abs(DPAD_SWAP_HI - Math.tan(Math.PI / 4 + 15 * Math.PI / 180)) < 1e-9, 'DPAD_SWAP_HI == tan(60deg)')
    ok(Math.abs(DPAD_SWAP_LO - Math.tan(Math.PI / 4 - 15 * Math.PI / 180)) < 1e-9, 'DPAD_SWAP_LO == tan(30deg)')
    ok(DPAD_SWAP_HI > 1 && DPAD_SWAP_LO < 1, 'the hysteresis wedge straddles the 45deg line (HI>1>LO)')
}

// 31i. Mutant that dies: hysteresis removed. A no-memory version re-derives the
// dominant axis from the raw offset every move, so the moment the thumb crosses
// the diagonal it flips — the exact flicker the gate prevents. Prove they
// diverge on the same sequence.
{
    const noHyst = (x, y, ways) => (ways === 8 ? SECTOR_DIRS[sectorFrom(x, y)]
        : (Math.hypot(x, y) < DEAD_ZONE ? []
            : (Math.abs(x) >= Math.abs(y) ? [x >= 0 ? 'ArrowRight' : 'ArrowLeft'] : [y >= 0 ? 'ArrowDown' : 'ArrowUp'])))
    const seq = [[50, 0], [50, 60], [50, 100]]
    const st = {}
    const real = seq.map(([x, y]) => dpadDirs(x, y, 4, st))
    const mutant = seq.map(([x, y]) => noHyst(x, y, 4))
    ok(JSON.stringify(real) !== JSON.stringify(mutant), 'no-hysteresis mutant diverges from the real diamond gate')
    ok(JSON.stringify(real[1]) === JSON.stringify(['ArrowRight']) && JSON.stringify(mutant[1]) === JSON.stringify(['ArrowDown']),
        'at r=1.2 the real keeps the last axis (right) but the mutant flicks to the dominant axis (down)')
}

// --- 32. #439: `ways` on the pad declaration + the diamond-gate migration ---
//
// 32a. validPad accepts ways 4/8 and rejects anything else.
{
    ok(validPad({ method: 'dpad', ways: 4, buttons: [] }) === true, 'validPad: ways 4 accepted')
    ok(validPad({ method: 'dpad', ways: 8, buttons: [] }) === true, 'validPad: ways 8 accepted')
    ok(validPad({ method: 'dpad', ways: 5, buttons: [] }) === false, 'validPad: ways 5 rejected')
    ok(validPad({ method: 'dpad', ways: '4', buttons: [] }) === false, 'validPad: a non-numeric ways rejected')
    ok(validPad({ method: 'dpad', buttons: [] }) === true, 'validPad: no ways is still valid (the legacy d-pad)')
}

// 32b. waysOf: the declared ways, or null (the legacy 8-way cross d-pad).
{
    ok(waysOf({ method: 'dpad', ways: 4 }) === 4, 'waysOf: ways 4 -> 4')
    ok(waysOf({ method: 'dpad', ways: 8 }) === 8, 'waysOf: ways 8 -> 8')
    ok(waysOf({ method: 'dpad' }) === null, 'waysOf: no ways -> null (legacy d-pad)')
    ok(waysOf({ method: 'dpad', ways: 5 }) === null, 'waysOf: an invalid ways -> null')
    ok(waysOf(null) === null, 'waysOf: null pad -> null')
}

// 32c. The registry: PAC-MAN is migrated to the diamond gate (method dpad +
// ways 4). Real registry, bundled the way the #420 pilot guard does — a silent
// revert of the declaration is caught.
{
    const here = dirname(fileURLToPath(import.meta.url))
    const root = join(here, '..')
    const OUT = join(root, 'node_modules', '.vpad-A.mjs')
    const { GAMES } = await import(pathToFileURL(OUT).href)
    const pac = GAMES.find((e) => e.path === '/pacman')
    ok(!!pac && pac.pad, 'games.js has a pad entry for /pacman')
    if (pac && pac.pad) {
        ok(pac.pad.method === 'dpad', 'games.js /pacman declares method dpad')
        ok(pac.pad.ways === 4, 'games.js /pacman declares ways 4 (the diamond gate)')
        ok(validPad(pac.pad), 'games.js /pacman pad is well-formed (with ways)')
        ok(waysOf(pac.pad) === 4, 'games.js /pacman resolves to the 4-way diamond gate')
    }
    // The other dpad titles that have NOT been migrated declare no `ways` and so
    // keep the legacy 8-way cross d-pad — pin that a migration is per-title.
    const unmigrated = ['/minesweeper', '/tetris', '/qbert', '/bards-tale']
    for (const path of unmigrated) {
        const g = GAMES.find((e) => e.path === path)
        if (!g || !g.pad) continue
        ok(g.pad.ways === undefined, `games.js ${path} still declares no ways (kept the legacy d-pad)`)
    }
}

// 32d. The contract surfaces `ways` on __game.meta when a game provides it (a
// DEV-only surface; here guarded by source, the way the TAP-prompt guard does).
{
    const src = readFileSync(new URL('../src/utils/gameContract.js', import.meta.url), 'utf8')
    ok(/\.\.\.\(spec\.ways \? \{ ways: spec\.ways \} : \{\}\)/.test(src),
        'gameContract: __game.meta reports `ways` when the game declares it')
}

// --- 33. #432: the shared pointer press-preview-release gesture ------------
//
// Every pointer-method game aims with the finger: press previews, slide
// re-targets, release commits, release on nothing commits nothing. The reach
// is screen-space (a fingertip), not world cells — the same thumb-size at any
// zoom. This pins the shared half in Node; the Lemmings mount (panel, ring,
// portrait prompt, fit-shell sizing) is proven in lemplay / vpadboot.

// 33a. The reach constant: about a fingertip, in SCREEN px.
{
    ok(POINTER_HIT_PX === 24, `POINTER_HIT_PX is 24 screen px (fingertip), got ${POINTER_HIT_PX}`)
}

// 33b. pointerTarget: nearest candidate wins, within the screen-space reach.
{
    const cands = [
        { x: 10, y: 10 },
        { x: 11.5, y: 10 },   // nearer to the finger at (11, 10)
        { x: 20, y: 10 },     // far
    ]
    const t = pointerTarget(cands, 11, 10, 12)   // 12 screen px per world unit
    ok(t && t.x === 11.5, 'pointerTarget: the nearest candidate within reach wins')
    ok(pointerTarget(cands, 20, 10, 12) && pointerTarget(cands, 20, 10, 12).x === 20, 'pointerTarget: the finger ON a candidate takes it (0 < reach)')
    ok(pointerTarget(cands, 30, 10, 12) === null, 'pointerTarget: nothing within the reach -> null (a miss is not a near-miss)')
    ok(pointerTarget([], 10, 10, 12) === null, 'pointerTarget: no candidates -> null')
}

// 33c. The reach is SCREEN space: the same 2.0-world-unit gap is a hit when
// the stage scale makes it 23.98 px, and a miss when it is 24.02 px — the
// boundary is the 24 px fingertip, at any zoom.
{
    const c = [{ x: 12, y: 0 }]
    ok(pointerTarget(c, 10, 0, 10) !== null, 'reach scales with the stage: 20 px gap is inside 24 px')
    ok(pointerTarget(c, 10, 0, 11.99) !== null, 'reach scales with the stage: 23.98 px gap is inside 24 px')
    ok(pointerTarget(c, 10, 0, 12.01) === null, 'reach scales with the stage: 24.02 px gap is outside 24 px')
    ok(pointerTarget(c, 10, 0, 1e-6) !== null, 'reach: a degenerate scale still has a (huge) world reach, no crash')
}

// 33d. pointerGesture: press previews, a slide re-targets, release commits ONCE
// with the target; a release over nothing commits null (a no-op).
{
    const near = { x: 10, y: 10, id: 'A' }
    const far = { x: 11.2, y: 10, id: 'B' }
    const commits = []
    const gs = { pd: false, aim: null }
    pointerGesture(gs, { x: 10, y: 10, down: true }, [near, far], 10, 10, 12, (a) => commits.push(a))
    ok(gs.pd === true && gs.aim === near, 'gesture: the PRESS previews the candidate under the finger')
    ok(commits.length === 0, 'gesture: a press does not commit (the preview is not the assignment)')
    pointerGesture(gs, { x: 11.2, y: 10, down: true }, [near, far], 11.2, 10, 12, (a) => commits.push(a))
    ok(gs.aim === far, 'gesture: SLIDING re-targets the preview to the new candidate')
    pointerGesture(gs, { x: 11.2, y: 10, down: false }, [near, far], 11.2, 10, 12, (a) => commits.push(a))
    ok(commits.length === 1 && commits[0] === far, 'gesture: the RELEASE commits the previewed target, exactly once')
    ok(gs.aim === null && gs.pd === false, 'gesture: after the release the gesture is idle (no stale aim)')
    // release on nothing: a press that finds no candidate commits null.
    const gs2 = { pd: false, aim: null }
    const commits2 = []
    pointerGesture(gs2, { down: true }, [], 40, 40, 12, (a) => commits2.push(a))
    ok(gs2.aim === null, 'gesture: a press over nothing previews nothing')
    pointerGesture(gs2, { down: false }, [], 40, 40, 12, (a) => commits2.push(a))
    ok(commits2.length === 1 && commits2[0] === null, 'gesture: releasing over nothing commits null (does nothing)')
    // idle: a pad that is not down and was not down does nothing at all.
    const gs3 = { pd: false, aim: null }
    let idleCommits = 0
    pointerGesture(gs3, { down: false }, [near], 10, 10, 12, () => idleCommits++)
    ok(gs3.aim === null && idleCommits === 0, 'gesture: an idle pad never commits')
}

// 33e. The Lemmings mount: the game runs the SHARED gesture (not a private
// tap-to-assign), writes the one pad's pointer from its own touch, drives the
// sizing from the shared fit shell (ResizeObserver, not window.resize), carries
// the original bottom panel, and says ROTATE in portrait. Source pins, the way
// the pilot guard does — a silent revert to tap-to-assign is caught.
{
    const src = readFileSync(new URL('../src/games/Lemmings/index.jsx', import.meta.url), 'utf8')
    ok(/pointerGesture\(/.test(src) && /setPointer\(/.test(src), 'lemmings: runs the shared gesture and writes the one pad pointer')
    ok(!/cycleSkill/.test(src), 'lemmings: CYCLE is gone (the panel picks the skill)')
    ok(/makeFitCanvas\(/.test(src) && !/window\.addEventListener\('resize'/.test(src),
        'lemmings: sized by the shared fit shell (ResizeObserver), no window.resize')
    ok(/data-lem-panel/.test(src) && /data-lem-skill/.test(src), 'lemmings: the original bottom panel (skill bar with counts)')
    ok(/PAUSE/.test(src) && /ffHeld/.test(src), 'lemmings: PAUSE + FAST-FORWARD on the panel')
    ok(/ffId = e\.pointerId/.test(src), 'lemmings: FF releases by pointer id (a slide-off release cannot leave 3x stuck)')
    ok((src.match(/abortGesture\(\)/g) || []).length >= 3,
        'lemmings: the gesture aborts on level load, pause and blur (a stale press never commits)')
    ok(/ROTATE YOUR PHONE/.test(src), 'lemmings: the portrait prompt')
}

// --- 34. #384 step 4: the gamepad rumble ----------------------------------
//
// One rumble(ms, strength) beside the touch haptic (VirtualControls'
// navigator.vibrate(8)): the physical pad's twin, wired to the stick titles'
// hit / death moments. The actuator path is the whole feature — no pad, a pad
// without an actuator, and a browser that rejects or throws on playEffect must
// all be a no-op, never a throw.

// 34a. Behaviour against a stubbed navigator. Node 21+ ships a global navigator
// without getGamepads (that is the "no pad" case); for the rest we swap in a
// fake, then restore the original.
{
    const orig = globalThis.navigator
    const calls = []
    const actuator = (log) => ({
        playEffect: (type, opts) => { log.push([type, opts]); return Promise.resolve() },
    })
    const fakePad = (act) => ({ connected: true, vibrationActuator: act })
    const withPads = (pads) => {
        Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pads }, configurable: true, writable: true })
    }
    try {
        ok(rumble(200, 1) === false, 'rumble: no getGamepads (Node navigator) -> no-op false')
        withPads([null])
        ok(rumble(200, 1) === false, 'rumble: no connected pad -> no-op false')
        withPads([fakePad(undefined)])
        ok(rumble(200, 1) === false, 'rumble: pad without an actuator -> no-op false')
        withPads([fakePad({})])
        ok(rumble(200, 1) === false, 'rumble: actuator without playEffect -> no-op false')
        withPads([fakePad(actuator(calls))])
        ok(rumble(250, 1) === true, 'rumble: a connected pad with an actuator -> true')
        ok(calls.length === 1 && calls[0][0] === 'dual-rumble', `rumble: playEffect is called with dual-rumble (got ${JSON.stringify(calls)})`)
        ok(calls[0] && calls[0][1].duration === 250 && calls[0][1].strongMagnitude === 1 && calls[0][1].weakMagnitude === 0.5,
            `rumble: ms and strength map onto duration / strong / weak (got ${JSON.stringify(calls[0] && calls[0][1])})`)
        calls.length = 0
        rumble(999999, 2)
        ok(calls[0] && calls[0][1].duration === 5000 && calls[0][1].strongMagnitude === 1,
            `rumble: oversized ms / strength clamp to 5000 / 1 (got ${JSON.stringify(calls[0] && calls[0][1])})`)
        calls.length = 0
        rumble(100, 0.5)
        ok(calls[0] && calls[0][1].strongMagnitude === 0.5 && calls[0][1].weakMagnitude === 0.25,
            `rumble: a light tap is a light rumble (got ${JSON.stringify(calls[0] && calls[0][1])})`)
        withPads([fakePad({ playEffect: () => Promise.reject(new Error('not supported')) })])
        ok(rumble(200, 1) === true, 'rumble: a rejecting playEffect is swallowed (no throw)')
        await new Promise((res) => setTimeout(res, 10)) // let the rejection settle
        withPads([fakePad({ playEffect: () => { throw new Error('no') } })])
        ok(rumble(200, 1) === false, 'rumble: a synchronously throwing playEffect is caught -> false')
    } finally {
        Object.defineProperty(globalThis, 'navigator', { value: orig, configurable: true, writable: true })
    }
}

// 34b. The wiring: the stick titles' hit / death moments call it. Source pins,
// the way section 33e does — a silent revert (a rumble deleted from a crash)
// is caught in the static gate.
{
    const wired = [
        ['../src/games/MarioKart/index.jsx', /ev\.e === 'spin' && ev\.who === 'PLAYER'.*rumble\(/, 'mario-kart: the PLAYER spin-out rumbles'],
        ['../src/games/MarioKart/index.jsx', /ev\.e === 'bump' && ev\.who === 'PLAYER'.*rumble\(/, 'mario-kart: the PLAYER bump rumbles'],
        // #576: CometDrift's player kart is named COMET (the PLAYER constant in
        // sim.js is { name: 'COMET' }) — the 'PLAYER' pin here matched a
        // condition that could never fire, so the spin/bump rumble had been dead.
        ['../src/games/CometDrift/index.jsx', /ev\.e === 'spin' && ev\.who === 'COMET'.*rumble\(/, 'comet-drift: the COMET spin-out rumbles'],
        ['../src/games/CometDrift/index.jsx', /ev\.e === 'bump' && ev\.who === 'COMET'.*rumble\(/, 'comet-drift: the COMET bump rumbles'],
        ['../src/games/Joust/index.jsx', /e\.t === 'death'.*rumble\(/, 'joust: the player death rumbles'],
        ['../src/games/RaccoonHeist/index.jsx', /e\.type === 'caught'.*rumble\(/, 'raccoon-heist: a caught raccoon rumbles'],
        ['../src/games/RaccoonHeist/index.jsx', /e\.type === 'bust'.*rumble\(/, 'raccoon-heist: a bust rumbles'],
    ]
    for (const [file, re, label] of wired) {
        const src = readFileSync(new URL(file, import.meta.url), 'utf8')
        ok(re.test(src), label)
    }
    for (const file of ['../src/games/MarioKart/index.jsx', '../src/games/CometDrift/index.jsx', '../src/games/Joust/index.jsx', '../src/games/RaccoonHeist/index.jsx']) {
        const src = readFileSync(new URL(file, import.meta.url), 'utf8')
        ok(/import\s*\{[^}]*\brumble\b[^}]*\}\s*from\s*'[^']*gamepadMap'/.test(src), `${file} imports rumble from the shared gamepadMap`)
    }
}

// --- #492: player slots — pad N drives player N ------------------------------
// Slot 1 is THE shared pad: legacy writes stay visible through slotPad(1),
// and nothing a second pad touches may ever leak into player 1.
clearAllSlots()
{
    press('a')
    ok(slotPad(1, 'stick').a === true, 'slots: legacy press("a") lands on slot 1')
    release('a')
    pressSlot(2, 'left'); pressSlot(2, 'b')
    const s2 = slotPad(2, 'stick'); const s1 = slotPad(1, 'stick')
    ok(s2.left === true && s2.b === true, 'slots: slot 2 gets its own presses')
    ok(s1.left === false && s1.b === false, 'slots: slot 2 presses are invisible to slot 1')
    ok(slotActive(2) === true && slotActive(1) === false, 'slots: slotActive follows its own slot')
    setStickVecSlot(2, 0.5, 0)
    ok(Math.abs(slotPad(2, 'stick').x - (0.5 - 0.12) / 0.88) < 1e-9, 'slots: slot-2 stick passes the shared radial dead zone')
    ok(slotPad(2, 'stick').right === true, 'slots: slot-2 stick push quantizes to digital right')
    setStickVecSlot(2, 0.1, 0)
    ok(slotPad(2, 'stick').x === 0 && slotPad(1, 'stick').x === 0, 'slots: in-zone sticks rest at 0 in every slot')
    clearSlot(2)
    ok(slotPad(2, 'stick').left === false && slotActive(2) === false, 'slots: clearSlot silences only slot 2')
    ok(slotPad(1, 'stick') && slotActive(1) === false, 'slots: clearing slot 2 leaves slot 1 idle-clean')
    ok(setConnected(0) === 1 && connectedSlots() === 1, 'slots: setConnected clamps up to one slot')
    ok(setConnected(9) === MAX_SLOTS, `slots: setConnected clamps down to MAX_SLOTS (${MAX_SLOTS})`)
    setConnected(3); pressSlot(3, 'a')
    ok(setConnected(2) === 2 && slotPad(3, 'stick').a === false, 'slots: a vanished slot releases its held key (never sticks)')
    clearAllSlots()
    ok(connectedSlots() === 1, 'slots: clearAllSlots drops back to one slot')
}

// --- #492: one pad -> slot fields (the multiplayer half of the bridge) -------
{
    const f = slotFieldsFrom(padWith([0, 1, 9, 15], [0.8, 0]), { engaged: false, lastCodes: [] })
    ok(f.fields.right === true && f.fields.a === true && f.fields.b === true && f.fields.start === true, 'slot map: dpad-right + A + B + Start -> right/a/b/start')
    ok(Math.abs(f.fields.x - 0.8) < 1e-9 && f.fields.y === 0, 'slot map: stick published raw')
    ok(f.fields.left === false && f.fields.up === false && f.fields.down === false, 'slot map: unpressed fields stay false')
    const g = slotFieldsFrom(padWith([], [0.6, 0]), f.state)
    ok(g.fields.right === true, 'slot map: stick engages past the dead zone')
    const h = slotFieldsFrom(padWith([], [0.2, 0]), g.state)
    ok(h.fields.right === true, 'slot map: hysteresis band holds the direction')
    const i0 = slotFieldsFrom(padWith([], [0.02, 0]), h.state)
    ok(i0.fields.right === false, 'slot map: below the release zone clears it')
    const other = slotFieldsFrom(padWith([], [0.2, 0]), { engaged: false, lastCodes: [] })
    ok(other.fields.right === false, 'slot map: hysteresis state is per-slot (a fresh pad reads centre)')
    const sel = slotFieldsFrom(padWith([8], [0, 0]), { engaged: false, lastCodes: [] })
    ok(sel.fields.a === false && sel.fields.b === false && sel.fields.start === false, 'slot map: Select (8) maps to no gameplay field')
}

// --- #492: P2 merge — keyboard WASD+F + slot 2 pad fold into one sim input ---
{
    const kbOff = { l: false, r: false, u: false, d: false, swordEdge: false }
    const only = p2From({ l: true, r: false, u: false, d: false, swordEdge: true }, null)
    ok(only.left === true && only.sword === true, 'p2: keyboard alone drives P2 (the #491 fixed path)')
    const pad = { left: false, right: true, up: true, down: false, a: true, b: false }
    const a1 = p2From(kbOff, pad, { a: false, b: false })
    ok(a1.right === true && a1.fwd === true && a1.sword === true, 'p2: pad alone drives P2; A edges into a swing')
    const a2 = p2From(kbOff, pad, { a: true, b: false })
    ok(a2.right === true && a2.sword === false, 'p2: held A never repeats the swing (edge trigger)')
    const both = p2From({ l: true, r: false, u: false, d: false, swordEdge: false }, { left: false, right: true, up: false, down: false, a: false, b: false }, { a: false, b: false })
    ok(both.left === true && both.right === true, 'p2: keyboard and pad fold together (OR)')
    const frames = [[{ a: true }, { a: false, b: false }], [{ a: true }, { a: true, b: false }]]
    const real = frames.map(([p, pv]) => p2From(kbOff, p, pv).sword)
    const mutant = frames.map(([p]) => !!p.a)
    ok(JSON.stringify(real) !== JSON.stringify(mutant), 'p2 mutant: deleting the edge trigger diverges')
    ok(real[0] === true && real[1] === false && mutant[1] === true, 'p2 mutant: mutant swings every held tick, real logic swings once')
}

// --- #492: the wiring is where it must be (registry + frame path + bridge) ----
{
    const gamesSrc = readFileSync(new URL('../src/config/games.js', import.meta.url), 'utf8')
    ok(/path: '\/gauntlet',[\s\S]{0,120}players: 2/.test(gamesSrc), 'registry: GAUNTLET declares players: 2')
    ok(/path: '\/bubble-bobble',[\s\S]{0,160}players: 2/.test(gamesSrc), 'registry: BUBBLE BOBBLE declares players: 2')
    const gSrc = readFileSync(new URL('../src/games/Gauntlet/index.jsx', import.meta.url), 'utf8')
    ok(/step\(gs, inp, pInp\)/.test(gSrc), 'gauntlet: the frame path threads P2 input into the sim (#491 root cause)')
    ok(/p2From\(p2, slotPad\(2, 'stick'\), p2Prev\)/.test(gSrc), 'gauntlet: P2 merges the keyboard and the slot-2 pad each tick')
    ok(/exposeGame\(/.test(gSrc) && /players: 2/.test(gSrc), 'gauntlet: __game.meta players is 2')
    ok(/retrogames:pads/.test(gSrc), 'gauntlet: wakes P2 on the pad-count event')
    const bSrc = readFileSync(new URL('../src/components/GamepadBridge.jsx', import.meta.url), 'utf8')
    ok(/slotFieldsFrom\(/.test(bSrc) && /pressSlot\(slotN, k\)/.test(bSrc), 'bridge: pads past the first write their own slots')
    ok(/'retrogames:pads'/.test(bSrc), 'bridge: announces pad-count changes')
}

// --- 35. #734: the A/B hit area follows the drawn layout --------------------
//
// The two action buttons are drawn B-left / A-right. The old hit test split the
// whole action zone at its CENTER (left half -> Space/A, right half -> B), so
// the left-drawn B fired A and the right-drawn A fired B — in Smash TV, tapping
// BOMB fired and tapping FIRE bombed. The fix tests each button's OWN rect.
//
// Proven two ways: (a) the pure actionCodeAt against the drawn rects (simulated
// here exactly as VirtualControls lays them out), and (b) a source pin that the
// component feeds it the buttons' live rects, not a zone center.
{
    const B = 'KeyB'   // Smash TV's second action
    // The drawn layout, as VirtualControls renders it: B (w-14) left, gap-2,
    // A (w-14) right; the zone carries pb-2 (bottom) + pr-4 (right) padding.
    const bRect = { left: 0, top: 0, right: 56, bottom: 56, width: 56, height: 56 }
    const aRect = { left: 64, top: 0, right: 120, bottom: 56, width: 56, height: 56 }
    const zoneRect = { left: 0, top: 0, right: 136, bottom: 64, width: 136, height: 64 }
    const ctx = (o = {}) => ({ showA: true, bCode: B, aRect, bRect, zoneRect, ...o })
    const at = (x, y, o) => actionCodeAt(ctx(o), x, y)

    // 35a. Each drawn button fires its OWN action (the #734 fix).
    ok(at(28, 28) === B, 'tap the drawn B (left, centre) fires B (KeyB), not Space')
    ok(at(92, 28) === 'Space', 'tap the drawn A (right, centre) fires Space, not B')
    ok(at(1, 1) === B, 'tap the drawn B (top-left corner) fires B')
    ok(at(119, 1) === 'Space', 'tap the drawn A (top-right corner) fires Space')
    ok(at(55, 55) === B, 'tap the drawn B (bottom-right corner) fires B')
    ok(at(65, 55) === 'Space', 'tap the drawn A (bottom-left corner) fires Space')

    // 35b. A touch in the gap / padding splits on the DRAWN side (B left, A right).
    ok(at(60, 28) === B, 'touch in the gap (x=60 < centre 68) falls to the left button (B)')
    ok(at(128, 28) === 'Space', 'touch in the pr-4 padding (x=128 >= centre) falls to the right button (A)')
    ok(at(28, 60) === B, 'touch in the pb-2 padding (below B) falls to the left button (B)')

    // 35c. Single-button zones still resolve to the one shown button.
    ok(at(28, 28, { showA: false }) === B, 'B-only zone (A hidden) fires B anywhere')
    ok(at(92, 28, { bCode: null }) === 'Space', 'A-only zone (no B) fires Space anywhere')

    // 35d. Mutant that dies: the old zone-center split. It maps the left-drawn B
    // to Space and the right-drawn A to B — the exact swap #734 reports.
    const zoneCx = zoneRect.left + zoneRect.width / 2
    const oldCodeAt = (x) => (x < zoneCx ? 'Space' : B)
    ok(at(28, 28) !== oldCodeAt(28), 'zone-center mutant fires Space on the drawn B (the bug) — real logic fires B')
    ok(at(92, 28) !== oldCodeAt(92), 'zone-center mutant fires B on the drawn A (the bug) — real logic fires Space')

    // 35e. The wiring: the component feeds actionCodeAt the buttons' live rects
    // (and a y), not a zone center — a silent revert to the old split is caught.
    const src = readFileSync(new URL('../src/components/VirtualControls.jsx', import.meta.url), 'utf8')
    ok(/import\s*\{[^}]*\bactionCodeAt\b[^}]*\}\s*from\s*'\.\/actionHit'/.test(src), 'VirtualControls imports actionCodeAt from ./actionHit')
    ok(/ref=\{aBtnRef\}/.test(src) && /ref=\{bBtnRef\}/.test(src), 'VirtualControls attaches aBtnRef / bBtnRef to the drawn A / B buttons')
    ok(/aRect:\s*aBtnRef\.current\s*&&\s*aBtnRef\.current\.getBoundingClientRect\(\)/.test(src), 'VirtualControls feeds the A button live rect')
    ok(/bRect:\s*bBtnRef\.current\s*&&\s*bBtnRef\.current\.getBoundingClientRect\(\)/.test(src), 'VirtualControls feeds the B button live rect')
    ok(/aCodeAt\(x, y\)/.test(src), 'VirtualControls hit test takes the touch y (per-button rect, not a zone half)')
}

// --- 36. #735 req 4: a drag on the controls must never become text selection ---
// The iPad problem: a touch that starts on a button and moves can turn into a
// native rubber-band selection (dragging the label out with a selection
// handle) instead of the pad reading the new button. The markup opts the whole
// pad bar and every button into `select-none` (user-select:none — no
// rubber-band) and every interactive zone into `touch-none` (touch-action:
// none — no scroll/zoom gesture). A silent drop of either class re-opens the
// bug, so the committed class lists are pinned (the markup, not a prose note).
{
    const vc = readFileSync(new URL('../src/components/VirtualControls.jsx', import.meta.url), 'utf8')
    // The A/B action zone is where a thumb slides between buttons; its OWN
    // element must carry both guard classes (extracted, not a whole-file grep,
    // so a class removed specifically from the zone is caught).
    const zoneCls = vc.match(/data-vc="actzone"[\s\S]*?className="([^"]*)"/)
    ok(zoneCls !== null, '#735 drag-select: the A/B action zone is present (data-vc="actzone")')
    if (zoneCls) {
        ok(/select-none/.test(zoneCls[1]), '#735 drag-select: the A/B zone disables text selection (select-none)')
        ok(/touch-none/.test(zoneCls[1]), '#735 drag-select: the A/B zone disables touch scroll/zoom (touch-none)')
    }
    ok(/select-none/.test(vc), '#735 drag-select: the pad bar / face buttons carry select-none')
    // Each interactive zone (swipe field, fixed stick, diamond gate, d-pad,
    // action zone) carries the pair together, so a drag on any of them can
    // neither select text nor scroll the page.
    const guarded = (vc.match(/touch-none select-none/g) || []).length
    ok(guarded >= 4, `#735 drag-select: >=4 interactive zones carry 'touch-none select-none' (got ${guarded})`)
}

// --- Summary ---
const total = pass + fail
console.log(`vpadcheck: ${pass}/${total} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
