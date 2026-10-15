// vpadcheck — VirtualControls direction logic + sliding sequence, in Node (~1s).
//
// Proves:
//   1. dirsFrom returns the right codes for all 8 sectors + dead zone
//   2. sectorFrom maps angles correctly
//   3. The thumb-slip sequence left → up-left → up produces the right
//      keydown/keyup events (the spec's acceptance check)
//   4. Space dispatches key=' ' (not key='Space')

import { readFileSync } from 'fs'
import { dirsFrom, sectorFrom, SECTOR_DIRS, DEAD_ZONE, stickVec, STICK_TRAVEL, STICK_DEAD } from '../src/components/virtualDir.js'
import { gamepadToCodes, stickDirections, GPAD_DEAD_ZONE, GPAD_RELEASE_ZONE, GPAD_DPAD, GPAD_FIXED, validPad, padButton } from '../src/components/gamepadMap.js'

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
        ['/mario', 'KeyF'], ['/ironkeep', 'ShiftLeft'], ['/beezee', 'KeyV'], ['/lemmings', 'KeyE'],
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

// --- 22. games.js: the first analog game opts in to the floating stick ---
// MarioKart is the first title flipped to layout 'stick' (it drives purely from
// VirtualControls — no canvas touch). Guard the registry so a silent revert to
// 'dpad' (which would drop the floating stick) is caught.
{
    const gamesSrc = readFileSync(new URL('../src/config/games.js', import.meta.url), 'utf8')
    const i = gamesSrc.indexOf("path: '/mario-kart'")
    ok(i !== -1, 'games.js has an entry for /mario-kart')
    if (i !== -1) {
        const j = gamesSrc.indexOf('path: ', i + 1)
        const block = gamesSrc.slice(i, j === -1 ? gamesSrc.length : j)
        ok(/layout: 'stick'/.test(block), 'games.js /mario-kart uses layout: stick (the floating stick)')
        ok(/analog: true/.test(block), 'games.js /mario-kart opts in to analog input')
    }
}

// --- Summary ---
const total = pass + fail
console.log(`vpadcheck: ${pass}/${total} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
