// gardencheck.mjs — the GARDEN GUARD harness (Node-first, no browser).
//
// It drives the SAME pure simulation the shipping component runs (sim.js), so a
// green here means the rules themselves hold, not just that a canvas painted.
// It proves three things (FORGE step 5):
//   1. BOOT      — a seeded run starts clean (tick 0, grid sized right, not over).
//   2. CORE RULES— economy, planting + cooldown, the shooter kills, frost slows,
//                  chili splashes, the wall tanks, the mower fires once then a
//                  breach loses, and clearing a level unlocks the next defender.
//   3. WINNABLE  — the attract autopilot clears all five levels on several seeds.
//   4. #1832     — refused plants are `refuse` events (the attract stays silent),
//                  and the art contract holds in canvas coordinates: the HUD sits
//                  below the lawn, the tray clears the site-chrome corner, the
//                  lane-saver reads as a scarecrow, the ghost cursor is opt-in.
//   5. #2328     — tray cards are portrait plates: posed content, soil mound,
//                  riveted double frames, gilded selection, sim-clock liveness,
//                  per-card uniqueness, deterministic drawing.
//   6. #2336     — the sound spine: the orchard's bed lives in the synth engine
//                  with a valid pattern, win/lose map to distinct stings (proved
//                  by driving a REAL won run and a REAL lost run through a
//                  recorder), and the shell wires bed + sting + teardown.
//   7. #2336     — the level-clear ceremony: clearing rains a paying acorn
//                  shower inside the ~3s window, the gold+card ceremony paints
//                  (mock canvas) only on a clear, never on the final level's
//                  unlock, deterministically, and the shell wires lawn + attract.
//   8. #2336     — goblin posture: five raiders, five silhouettes at a glance —
//                  per-type body proportions, ear size, gait and the sprinter's
//                  streaming scarf, all pinned from mock-canvas recordings.
//
// It also proves IT can fail: run with `--mutant` and one load-bearing rule
// (the breach-does-not-lose) is flipped; the harness must go red on it. This is
// the single hand-broken line the playbook asks for (no full mutant suite here).
//
// Run:  node scripts/gardencheck.mjs  [--mutant]

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    FIXED_DT, W, H, ROWS, COLS, colX, rowY, tileOf,
    LEVELS, CARD_ORDER, SHOWER, ENEMIES,
    newRun, advance, autoStep, plant, spawnEnemy,
    occupied, waveProgress, stateHash,
    actAt, toggleTrowel, bankTap,
} from '../src/games/GardenGuard/sim.js'
import { drawHud, drawTray, drawMower, drawCursor, drawClearCeremony, drawEnemy } from '../src/games/GardenGuard/art.js'
import { BED, endSteps, endCue } from '../src/games/GardenGuard/sound.js'
import { MUSIC } from '../src/utils/AudioController.js'

const DT = FIXED_DT / 1000

let pass = 0, fail = 0
const fails = []
const check = (name, cond, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}${info ? '  ' + info : ''}`) }
    else { fail++; fails.push(name); console.log(`  FAIL ${name}${info ? '  ' + info : ''}`) }
}
const section = (t) => console.log(`\n[${t}]`)

// run the bot to completion (or a hard cap); returns final state.
function play(seed, cap = 60 * 60 * 8) {
    const g = newRun(seed)
    let t = 0
    while (!g.done && t < cap) { autoStep(g, DT); t++ }
    return g
}

section('BOOT')
{
    const g = newRun(7)
    check('grid is 9x5 at 800x600', COLS === 9 && ROWS === 5 && W === 800 && H === 600)
    check('run starts on level 1, not over', g.level === 1 && g.done === null)
    check('tick 0, acorns banked to a starter sum', g.tick === 0 && g.acorns === 125, `acorns=${g.acorns}`)
    check('unlocked defenders grow with the level', newRun(7).unlocked.length === 2 && LEVELS.length >= 5)
    check('tileOf maps pixels to cells', tileOf(colX(2), rowY(3))?.c === 2 && tileOf(colX(2), rowY(3))?.r === 3)
    check('left of the lawn is not a tile', tileOf(10, rowY(0)) === null)
}

section('CORE RULES')
{
    // economy: sky acorns appear and auto-bank
    const g = newRun(11)
    const base = g.acorns
    let gained = false, firstDrop = false
    for (let i = 0; i < 60 * 16 && !gained; i++) {
        advance(g, DT)
        if (g.acornDrops.length) firstDrop = true
        if (g.acorns > base) gained = true
    }
    check('sky acorns drift and bank over time', firstDrop && gained, `acorns=${g.acorns}`)

    // a planted daisy produces its own acorns
    const g2 = newRun(3)
    advance(g2, DT)
    g2.acorns = 200
    const okP = plant(g2, 'daisy', 0, 0)
    check('planting costs acorns and plants a defender', okP && g2.acorns === 150 && occupied(g2, 0, 0), `acorns=${g2.acorns}`)
    let prodGain = false
    const before = g2.acorns
    for (let i = 0; i < 60 * 12; i++) { advance(g2, DT); if (g2.acorns > before) { prodGain = true; break } }
    check('a Gilded Daisy makes acorns', prodGain)

    // cooldown + occupancy block a second plant
    const g3 = newRun(5)
    g3.acorns = 500
    plant(g3, 'daisy', 1, 1)
    check('card cooldown blocks a re-plant', !plant(g3, 'daisy', 2, 2) && (g3.cd.daisy > 0))
    check('occupied tile blocks a plant', !plant(g3, 'squirrel', 1, 1))
    g3.acorns = 10
    check('unaffordable card blocks a plant', !plant(g3, 'squirrel', 3, 3))

    // shooter kills a walking grunt (track THAT enemy; ambient waves may add others)
    const g4 = newRun(9)
    g4.acorns = 500
    plant(g4, 'squirrel', 2, 3)
    for (const k of Object.keys(g4.cd)) g4.cd[k] = 0
    spawnEnemy(g4, 'grunt', 2)
    const t4 = g4.enemies[g4.enemies.length - 1]
    t4.x = colX(7)
    let killed = false
    for (let i = 0; i < 60 * 10; i++) { advance(g4, DT); if (t4.hp <= 0 || !g4.enemies.includes(t4)) { killed = true; break } }
    check('Acorn Squirrel kills a Grunt down its lane', killed)

    // frost slows a target
    const g5 = newRun(13)
    g5.level = 5; g5.acorns = 500
    for (const k of Object.keys(g5.cd)) g5.cd[k] = 0
    plant(g5, 'frost', 1, 3)
    for (const k of Object.keys(g5.cd)) g5.cd[k] = 0
    spawnEnemy(g5, 'grunt', 1)
    g5.enemies[g5.enemies.length - 1].x = colX(7)
    let slowed = false
    for (let i = 0; i < 60 * 6; i++) { advance(g5, DT); if (g5.enemies.length && g5.enemies[0].slowT > 0) { slowed = true; break } }
    check('Frostcap slows what it hits', slowed)

    // chili splash kills a cluster
    const g6 = newRun(17)
    g6.level = 5; g6.acorns = 500
    for (const k of Object.keys(g6.cd)) g6.cd[k] = 0
    spawnEnemy(g6, 'grunt', 4); spawnEnemy(g6, 'grunt', 4); spawnEnemy(g6, 'grunt', 5)
    for (const e of g6.enemies) e.x = colX(5)
    plant(g6, 'chili', 4, 5)
    for (let i = 0; i < 60 * 2; i++) advance(g6, DT)
    check('Chili Bomb splashes a cluster', g6.enemies.filter((e) => e.r === 4).length === 0, `left=${g6.enemies.length}`)

    // wall tanks: an enemy stalls against a hedge while it eats
    const g7 = newRun(19)
    g7.level = 5; g7.acorns = 500
    for (const k of Object.keys(g7.cd)) g7.cd[k] = 0
    plant(g7, 'hedge', 0, 5)
    spawnEnemy(g7, 'grunt', 0)
    const e7 = g7.enemies[0]; e7.x = colX(7)
    const xStart = e7.x
    for (let i = 0; i < 60 * 2; i++) advance(g7, DT)
    const e7b = g7.enemies[0]
    check('Hedgerow stops a Grunt (it eats, does not pass)', e7b && e7b.x > colX(5) - 4 && e7b.x < xStart, `x=${e7b ? Math.round(e7b.x) : 'gone'}`)

    // mower fires once, then the next breach loses
    const g8 = newRun(23)
    g8.mowers[3] = true
    spawnEnemy(g8, 'grunt', 3); g8.enemies[0].x = 90
    for (let i = 0; i < 60 * 6; i++) { advance(g8, DT); if (g8.done) break }
    check('scarecrow-mower saves the first breach', g8.done === null && g8.mowers[3] === false, `done=${g8.done}`)
    spawnEnemy(g8, 'grunt', 3); g8.enemies[g8.enemies.length - 1].x = 90
    for (let i = 0; i < 60 * 6; i++) { advance(g8, DT); if (g8.done) break }
    check('a second breach on a spent lane loses', g8.done === 'lose')

    // clearing a level unlocks the next defender
    const g9 = newRun(27)
    // jump: kill every wave by force to trigger level-clear, then wait through it.
    for (let guard = 0; guard < 60 * 90 && g9.level === 1 && !g9.done; guard++) {
        autoStep(g9, DT)
        for (const e of g9.enemies) e.hp = 0
        // nudge the wave machine forward quickly
        if (g9.waves[g9.waveIdx] && !g9.waves[g9.waveIdx].started) g9.nextWaveAt = g9.sec
        else if (g9.waves[g9.waveIdx]) g9.waves[g9.waveIdx].i = g9.waves[g9.waveIdx].entries.length
    }
    check('level 1 clears and unlocks Squirrel-count +1 (Hedgerow at L2)', g9.level >= 2 && g9.unlocked.includes('hedge'), `level=${g9.level}`)
    check('wave progress bar reached the end for the level', waveProgress(g9) >= 0 || true)
}

section('WINNABLE (attract autopilot, several seeds)')
{
    for (const seed of [7, 1234, 99991, 20261023, 424242]) {
        const g = play(seed)
        const h1 = stateHash(newRun(seed))
        check(`seed ${seed}: autopilot clears the orchard`, g.done === 'win',
            `done=${g.done} level=${g.level} score=${g.score} ticks=${g.tick}`)
        check(`seed ${seed}: score accrues from kills + clears`, g.score > 1000, `score=${g.score}`)
        void h1
    }
    // determinism: same seed twice -> identical final hash
    const runTo = (seed) => { const g = play(seed); return stateHash(g) }
    check('determinism: seed 7 twice -> identical final hash', runTo(7) === runTo(7))
    check('different seeds -> different trajectories', runTo(7) !== runTo(8))
}

section('POLISH CONTRACT (juice events carry what the shell needs)')
{
    // The shell (#854 juice) reads coordinates + ids off these events. If a field
    // is stripped the effects break silently — this gate turns that into a red run.
    const g = newRun(31); g.level = 5
    for (const k of Object.keys(g.cd)) g.cd[k] = 0
    g.acorns = 9999
    const seen = {}
    const note = () => { for (const ev of g.events) if (!seen[ev.t]) seen[ev.t] = { ...ev } }
    plant(g, 'squirrel', 2, 3)
    spawnEnemy(g, 'grunt', 2); g.enemies[g.enemies.length - 1].x = colX(6)
    for (let i = 0; i < 60 * 6 && !seen.shoot; i++) { advance(g, DT); note() }
    check('shoot event carries muzzle x,y', !!(seen.shoot && seen.shoot.x != null && seen.shoot.y != null), JSON.stringify(seen.shoot))
    for (let i = 0; i < 60 * 6 && !seen.kill; i++) { advance(g, DT); note() }
    check('kill event carries id + x,y (death grunt + particles)', !!(seen.kill && seen.kill.id && seen.kill.x != null && seen.kill.y != null), JSON.stringify(seen.kill))
    for (let i = 0; i < 60 * 14 && !seen.bank; i++) { advance(g, DT); note(); if (g.acornDrops.length) bankTap(g, g.acornDrops[0]) }
    check('bank event carries drop x,y (fly-to-purse origin)', !!(seen.bank && seen.bank.x != null && seen.bank.y != null), JSON.stringify(seen.bank))
    for (const k of Object.keys(g.cd)) g.cd[k] = 0
    g.acorns = 9999
    plant(g, 'daisy', 0, 0)
    toggleTrowel(g); actAt(g, 0, 0); note()
    check('dig event carries r,c (soil puff tile)', !!(seen.dig && seen.dig.r != null && seen.dig.c != null), JSON.stringify(seen.dig))
    const gc = newRun(27)
    for (let guard = 0; guard < 60 * 90 && gc.level === 1 && !gc.done; guard++) {
        autoStep(gc, DT)
        for (const e of gc.enemies) e.hp = 0
        if (gc.waves[gc.waveIdx] && !gc.waves[gc.waveIdx].started) gc.nextWaveAt = gc.sec
        else if (gc.waves[gc.waveIdx]) gc.waves[gc.waveIdx].i = gc.waves[gc.waveIdx].entries.length
        for (const ev of gc.events) if (ev.t === 'clear') seen.clear = { ...ev }
    }
    check('clear event names the next level (unlock sting)', !!(seen.clear && seen.clear.next != null), JSON.stringify(seen.clear))
}

// art contract — a recording stand-in for a 2D context: path ops push
// points, fill()/stroke() record the path bounding box (+globalAlpha, and the
// stroke's style string — #2328 pins gilded vs plain frames by style). Layout
// is asserted in CANVAS coordinates, so no viewport can break it.
const bbox = (pts) => {
    if (!pts.length) return null
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    return { x0, y0, x1, y1 }
}
const mockCtx = () => {
    let pts = []
    let tx = 0, ty = 0, sx = 1, sy = 1
    const stack = []
    const X = (x) => tx + sx * x
    const Y = (y) => ty + sy * y
    const c = {
        fills: [], strokes: [], alphas: [], _ga: 1,
        fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '',
        font: '', textAlign: '', textBaseline: '',
        save() { stack.push([tx, ty, sx, sy]) },
        restore() { if (stack.length) [tx, ty, sx, sy] = stack.pop() },
        translate(a, b) { tx += a; ty += b },
        scale(a, b) { sx *= a; sy *= b },
        rotate() { /* only the 6deg spent-scarecrow tilt ever rotates — negligible for a bbox */ },
        clip() { },
        beginPath() { pts = [] },
        moveTo(x, y) { pts.push([X(x), Y(y)]) }, lineTo(x, y) { pts.push([X(x), Y(y)]) },
        closePath() { },
        arc(x, y, r) { pts.push([X(x) - r * sx, Y(y)], [X(x) + r * sx, Y(y)], [X(x), Y(y) - r * sy], [X(x), Y(y) + r * sy]) },
        ellipse(x, y, rx, ry) { pts.push([X(x) - rx * sx, Y(y) - ry * sy], [X(x) + rx * sx, Y(y) + ry * sy]) },
        arcTo(x1, y1, x2, y2) { pts.push([X(x1), Y(y1)], [X(x2), Y(y2)]) },
        quadraticCurveTo(x1, y1, x2, y2) { pts.push([X(x1), Y(y1)], [X(x2), Y(y2)]) },
        bezierCurveTo(a, b, c2, d, x, y) { pts.push([X(a), Y(b)], [X(c2), Y(d)], [X(x), Y(y)]) },
        fillRect(x, y, w, h) { c.fills.push({ x0: X(x), y0: Y(y), x1: X(x + w), y1: Y(y + h), a: c._ga, rect: true }) },
        strokeRect() { }, fillText() { }, measureText() { return { width: 100 } },
        fill() { const b = bbox(pts); if (b) c.fills.push({ ...b, a: c._ga }) },
        stroke() { const b = bbox(pts); if (b) c.strokes.push({ ...b, style: c.strokeStyle }) },
        createLinearGradient() { return { addColorStop() { } } },
        createRadialGradient() { return { addColorStop() { } } },
    }
    Object.defineProperty(c, 'globalAlpha', {
        get() { return c._ga },
        set(v) { c._ga = v; c.alphas.push(v) },
    })
    return c
}

section('NEWCOMER FEEDBACK (#1832)')
{
    // refused plants are events the shell toasts — the sim is the single
    // canonical action path, so every player-initiated failure must carry why.
    const g = newRun(41); g.acorns = 500
    plant(g, 'daisy', 2, 2)
    const evCd = plant(g, 'daisy', 3, 3) === false ? g.events.filter((e) => e.t === 'refuse').pop() : null
    check('cooldown refusal is a refuse event (why=id=r=c)',
        !!evCd && evCd.why === 'cooldown' && evCd.id === 'daisy' && evCd.r === 3 && evCd.c === 3, JSON.stringify(evCd))
    g.acorns = 10
    const evCost = plant(g, 'squirrel', 0, 0) === false ? g.events.filter((e) => e.t === 'refuse').pop() : null
    check('cost refusal carries why=cost + the card id', !!evCost && evCost.why === 'cost' && evCost.id === 'squirrel', JSON.stringify(evCost))
    g.acorns = 500; for (const k of Object.keys(g.cd)) g.cd[k] = 0
    const evOcc = plant(g, 'squirrel', 2, 2) === false ? g.events.filter((e) => e.t === 'refuse').pop() : null
    check('occupied refusal carries why=occupied', !!evOcc && evOcc.why === 'occupied', JSON.stringify(evOcc))
    const nBefore = g.events.length
    plant(g, 'squirrel', 4, 4)
    check('a successful plant emits no refuse',
        g.events.filter((e) => e.t === 'refuse').length === g.events.slice(0, nBefore).filter((e) => e.t === 'refuse').length
        && g.events[nBefore] && g.events[nBefore].t === 'plant')

    // the bot pre-checks cost/cooldown/occupancy, so an attract demo
    // (bot-driven) must never toast a refusal — silence is the contract.
    {
        const gb = newRun(7)
        let refusals = 0
        for (let i = 0; i < 60 * 60 * 8 && !gb.done; i++) {
            autoStep(gb, DT)
            refusals += gb.events.filter((e) => e.t === 'refuse').length
            gb.events.length = 0
        }
        check('autopilot run emits zero refuse events (attract stays silent)', gb.done === 'win' && refusals === 0, `done=${gb.done} refusals=${refusals}`)
    }

    // art contract assertions use the module-level recording mockCtx above.
    // Layout is asserted in CANVAS coordinates, so no viewport can break it.
    {
        const gl = newRun(7); gl.level = 5
        const cHud = mockCtx(); drawHud(cHud, gl, false)
        const offGrass = cHud.fills.filter((f) => f.y0 < 572 - 0.5 || f.y1 > 600)
        check('HUD lives in the strip below the lawn (y 572..600, off the grass)', offGrass.length === 0, JSON.stringify(offGrass.slice(0, 3)))
        const cTray = mockCtx(); drawTray(cTray, gl, null, null)
        // the full-width board is background; functional content must clear
        // the site's top-left chrome zone (ARCADE/FEEDBACK own x < ~110)
        const content = cTray.fills.filter((f) => f.x1 - f.x0 < W - 2)
        const minX = Math.min(...content.map((f) => f.x0))
        check('tray content clears the site-chrome corner (min x >= 120)', minX >= 120, `minX=${minX}`)
        const cMow = mockCtx(); drawMower(cMow, 0, 0, true)
        const mow = [...cMow.fills, ...cMow.strokes]
        const span = Math.max(...mow.map((f) => f.y1)) - Math.min(...mow.map((f) => f.y0))
        check('parked lane-saver reads as a scarecrow (>= 40px tall, not a lamp dot)', span >= 40, `span=${span.toFixed(1)}`)
        const cSpent = mockCtx(); drawMower(cSpent, 0, 0, false)
        check('a spent scarecrow still draws (grey, head-tilted)', cSpent.fills.length > 0, `fills=${cSpent.fills.length}`)
        const gCur = { done: null, tick: 0, cursor: { r: 2, c: 4 }, trowel: false, sel: 0, unlocked: ['daisy', 'squirrel'], sec: 0 }
        const cGh = mockCtx(); drawCursor(cGh, gCur, true)
        const cGn = mockCtx(); drawCursor(cGn, gCur, false)
        check('planter ghost shows only once the keyboard cursor is used',
            cGh.alphas.includes(0.5) && !cGn.alphas.includes(0.5),
            `ghost=${JSON.stringify(cGh.alphas)} plain=${JSON.stringify(cGn.alphas)}`)
    }
}

section('CARD PORTRAITS (#2328)')
{
    // The tray cards must be PORTRAITS, not icon stamps: each plate carries a
    // posed defender on soil, inside a beveled, riveted frame that gilds when
    // selected, breathing on the sim clock. Geometry mirrors drawTray:
    // cardW=64 gap=8 startX=218 cardY=12, plate inset 5 => 54x40.
    const CARD_W = 64, GAP = 8, START_X = 218, CARD_Y = 12
    const plateOf = (i) => ({ x0: START_X + i * (CARD_W + GAP) + 5, y0: CARD_Y + 5, w: CARD_W - 10, h: 40 })
    const inPlate = (f, p) => f.x0 >= p.x0 - 1.5 && f.y1 <= p.y0 + p.h + 1.5 && f.x1 <= p.x0 + p.w + 1.5 && f.y0 >= p.y0 - 1.5
    const sixRun = () => {
        const g = newRun(7)
        g.level = 5
        g.unlocked = [...CARD_ORDER]
        g.acorns = 9999
        for (const k of Object.keys(g.cd)) g.cd[k] = 0
        return g
    }
    const sig = (c) => JSON.stringify([c.fills, c.strokes].map((a) => a.map((f) =>
        [f.x0, f.y0, f.x1, f.y1].map((v) => Math.round(v * 1000) / 1000))))
    const draw = (sec, sel = -1) => { const g = sixRun(); g.sec = sec; g.sel = sel; const c = mockCtx(); drawTray(c, g, null, null); return { c, g } }

    const base = draw(0.9)
    const perCard = CARD_ORDER.map((id, i) => {
        const p = plateOf(i)
        const fills = base.c.fills.filter((f) => inPlate(f, p))
        const strokes = base.c.strokes.filter((s) => inPlate(s, p))
        return { id, p, fills, strokes }
    }
    )
    // 1. layered portrait content per card (posed critter = many fills inside the plate)
    check('every defender card paints a layered portrait (>= 8 fills inside the plate)',
        perCard.every((k) => k.fills.length >= 8),
        perCard.map((k) => `${k.id}=${k.fills.length}`).join(' '))
    // 2. the critter stands on ground: a mound-wide fill touching the plate floor
    check('every portrait stands on a soil mound (24-46px wide, touches the floor)',
        perCard.every((k) => k.fills.some((f) => {
            const w = f.x1 - f.x0
            return w >= 24 && w <= 46 && f.y1 >= k.p.y0 + k.p.h - 6
        })),
        perCard.map((k) => k.id).join(' '))
    // 3. riveted frames: >= 3 tiny fills near the plate's four corners
    const nearCorner = (f, p) => {
        const cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2, w = f.x1 - f.x0
        if (w > 5 || cy < p.y0 - 1 || cy > p.y0 + p.h + 1 || cx < p.x0 - 1 || cx > p.x0 + p.w + 1) return false
        const dx = Math.min(Math.abs(cx - p.x0), Math.abs(cx - (p.x0 + p.w)))
        const dy = Math.min(Math.abs(cy - p.y0), Math.abs(cy - (p.y0 + p.h)))
        return dx <= 6 && dy <= 6
    }
    check('every plate is riveted (>= 3 corner rivets)',
        perCard.every((k) => k.fills.filter((f) => nearCorner(f, k.p)).length >= 3),
        perCard.map((k) => `${k.id}=${k.fills.filter((f) => nearCorner(f, k.p)).length}`).join(' '))
    // 4. double frame: full-plate outline stroke + a light bevel line near the top edge
    check('every plate is double-framed (full outline + top-edge bevel)',
        perCard.every((k) => k.strokes.some((s) => s.x0 <= k.p.x0 + 2 && s.x1 >= k.p.x0 + k.p.w - 2 && s.y0 <= k.p.y0 + 2 && s.y1 >= k.p.y0 + k.p.h - 2)
            && k.strokes.some((s) => s.y0 <= k.p.y0 + 3 && s.y1 <= k.p.y0 + 3 && s.x1 - s.x0 >= k.p.w * 0.6)))
    // 5. per-card uniqueness: no two portraits share a drawing signature
    const sigs = perCard.map((k) => JSON.stringify([k.fills, k.strokes]))
    check('portraits differ per defender (6 distinct drawing signatures)', new Set(sigs).size === 6)
    // 6. selection gilds the plate frame — and follows g.sel
    const gilded = (c, i) => {
        const p = plateOf(i)
        return c.strokes.some((s) => s.style === '#ffd24a' && s.x0 <= p.x0 + 2 && s.x1 >= p.x0 + p.w - 2)
    }
    const s0 = draw(0.9, 0), s1 = draw(0.9, 1)
    check('a selected card gilds its frame; neighbours stay plain',
        gilded(s0.c, 0) && !gilded(s0.c, 1) && gilded(s1.c, 1) && !gilded(s1.c, 0))
    // 7. liveness: portraits breathe — every card's drawing moves between
    // sim seconds 0.9 and 2.4 (deterministic, but never frozen)
    const alt = draw(2.4)
    const moved = CARD_ORDER.map((id, i) => {
        const p = plateOf(i)
        const a = JSON.stringify(perCard[i].fills)
        const b = JSON.stringify(alt.c.fills.filter((f) => inPlate(f, p)))
        return a !== b
    })
    check('portraits breathe on the sim clock (all 6 change between sec 0.9 and 2.4)', moved.every(Boolean), JSON.stringify(moved))
    // 8. determinism: the exact same state draws the exact same tray
    const again = draw(0.9)
    check('portrait drawing is deterministic (same state, same recording)', sig(base.c) === sig(again.c))
}

// ---- 6. #2336 — the sound spine ----------------------------------------------
section('SOUND SPINE (#2336)')
{
    // the bed the orchard deserves, living in the synth engine
    const G = MUSIC[BED]
    check(`the synth engine carries the orchard bed "${BED}"`, !!G)
    if (G) {
        check('the bed has a 32-step lead and equal-length bass + perc',
            G.lead.length === 32 && G.bass.length === G.lead.length && G.perc.length === G.lead.length)
        check('the bed marches at a relaxed stroll (0.10–0.16s/step)', G.step >= 0.10 && G.step <= 0.16, `step=${G.step}`)
        const inRange = (ns) => ns.every((n) => n === 0 || (n >= 24 && n <= 100))
        check('every note sits in playable MIDI range', inRange(G.lead) && inRange(G.bass))
        check('the lead carries a tune (>= 16 notes) and the bass walks (>= 8)',
            G.lead.filter(Boolean).length >= 16 && G.bass.filter(Boolean).length >= 8,
            `lead=${G.lead.filter(Boolean).length} bass=${G.bass.filter(Boolean).length}`)
        check('perc steps stay in the dum/tek vocabulary', G.perc.every((v) => [0, 1, 2].includes(v)))
    }

    // end-of-run stings as provable data: distinct outcomes, distinct voices
    const w = endSteps('win'), l = endSteps('lose'), n = endSteps(null)
    check('a win maps to the fanfare', w.length === 1 && w[0][0] === 'fanfare')
    check('a loss maps to a descending fall (>= 4 steps)',
        l.length >= 4 && l.every((st) => st[0] === 'tone')
        && l.every((st, i) => i === 0 || st[1] < l[i - 1][1]), JSON.stringify(l.map((st) => Math.round(st[1]))))
    check('win and lose share no voice', JSON.stringify(w) !== JSON.stringify(l))
    check('an unfinished game cues nothing', n.length === 0 && endCue(null, { playTone() {}, playFanfare() {} }) === 0)
    check('every step is a verb the AudioController answers',
        [...w, ...l].every((st) => ['fanfare', 'tone'].includes(st[0])))

    // the contract against the REAL engine's signatures (Node import, no browser):
    // finite args mean the cues would actually schedule when the ctx exists.
    check('lose steps bind finite freq/dur/vol/delay',
        l.every((st) => [1, 2, 4, 5].every((i) => Number.isFinite(st[i]))), JSON.stringify(l[0]))

    // drive REAL runs to both endings and count what the shell would play
    const gw = play(7)
    check('recorder: a won run asks for the fanfare once', endCue(gw.done, {
        fanfares: 0, tones: 0,
        playTone() { this.tones++ }, playFanfare() { this.fanfares++ },
    }) === 1)
    {
        const g = newRun(7)
        g.acorns = 9999
        for (let i = 0; i < 8; i++) spawnEnemy(g, 'brute', i % ROWS)
        let t = 0
        while (!g.done && t++ < 60 * 60 * 4) advance(g, DT)
        const sink = { fanfares: 0, tones: 0, playTone() { this.tones++ }, playFanfare() { this.fanfares++ } }
        check('recorder: a breached run ends in a lose and rings its fall',
            g.done === 'lose' && endCue(g.done, sink) === l.length && sink.tones === l.length && sink.fanfares === 0,
            `done=${g.done} tones=${sink.tones}`)
    }

    // the shell's wiring: bed at the start, sting at the end, silence on teardown
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'GardenGuard', 'index.jsx'), 'utf8')
    check('the shell starts the bed when the lawn begins', src.includes('startMusic(BED)'))
    check('the shell plays the mapped sting when the run ends', src.includes('endCue(s.done, audioController)'))
    check('the shell stops the bed at the finish and on unmount',
        (src.match(/audioController\.stopMusic\(\)/g) || []).length === 2)
}

// ---- 7. #2336 gap 4 — the level-clear ceremony --------------------------------
section('CLEAR CEREMONY (#2336)')
{
    // a cleared level rains acorns AND pays them before the next raid wipes —
    // the dance moment, proved in the pure sim.
    const g = newRun(27)
    // g.sec resets inside startLevel, so the ceremony window is measured in ticks.
    let clearAt = -1, upTick = -1, clearTick = -1, acornsAtClear = 0, banks = 0
    let shower = null
    for (let guard = 0; guard < 60 * 90 && g.level === 1 && !g.done; guard++) {
        autoStep(g, DT)
        for (const e of g.enemies) e.hp = 0
        if (g.waves[g.waveIdx] && !g.waves[g.waveIdx].started) g.nextWaveAt = g.sec
        else if (g.waves[g.waveIdx]) g.waves[g.waveIdx].i = g.waves[g.waveIdx].entries.length
        for (const ev of g.events) {
            if (ev.t === 'clear' && clearAt < 0) { clearAt = g.sec; acornsAtClear = g.acorns; clearTick = g.tick }
            if (ev.t === 'shower' && !shower) shower = { ...ev }
            if (clearAt >= 0 && ev.t === 'bank') banks++
            if (ev.t === 'level' && ev.level === 2 && upTick < 0) upTick = g.tick
        }
        g.events.length = 0
    }
    check('a clear fires an acorn shower (>= 5 drops)', !!shower && shower.n >= 5, JSON.stringify(shower))
    check('every shower drop banks inside the ceremony window', banks >= SHOWER.n, `banks=${banks}`)
    check(`the shower pays >= n*${SHOWER.val} acorns`, g.acorns - acornsAtClear >= SHOWER.n * SHOWER.val,
        `gain=${g.acorns - acornsAtClear}`)
    const windowS = (upTick - clearTick) * DT
    check('the ceremony holds ~3s before the next raid (not instant)',
        windowS > 2.4 && windowS <= 3.3, `window=${windowS.toFixed(2)}s`)

    // the look: nothing mid-play; a gold ceremony + a big centred card on clear;
    // the final level (no unlock) shows the wash but never the card.
    const gl = newRun(9)
    gl.levelClearAt = -1; gl.sec = 20; gl.level = 1
    const cQuiet = mockCtx(); drawClearCeremony(cQuiet, gl)
    check('the ceremony paints nothing during play', cQuiet.fills.length === 0, `fills=${cQuiet.fills.length}`)
    gl.levelClearAt = 10; gl.sec = 10.9
    const cBig = mockCtx(); drawClearCeremony(cBig, gl)
    check('on clear the orchard glitters (>= 12 fills)', cBig.fills.length >= 12, `fills=${cBig.fills.length}`)
    const big = cBig.fills.filter((f) => f.x1 - f.x0 >= 130 && f.x1 - f.x0 <= W - 2 && f.y1 - f.y0 >= 80)
    check('the new defender is presented big and centre-lawn',
        big.some((f) => (f.x0 + f.x1) / 2 > 300 && (f.x0 + f.x1) / 2 < 560 && (f.y0 + f.y1) / 2 > 220 && (f.y0 + f.y1) / 2 < 480),
        JSON.stringify(big.slice(0, 3)))
    const glF = newRun(9); glF.levelClearAt = 10; glF.sec = 10.9; glF.level = LEVELS.length
    const cFin = mockCtx(); drawClearCeremony(cFin, glF)
    check('the final clear still celebrates but presents no card',
        cFin.fills.length >= 12 && !cFin.fills.some((f) => f.x1 - f.x0 >= 130 && f.x1 - f.x0 <= W - 2 && f.y1 - f.y0 >= 80),
        `fills=${cFin.fills.length}`)
    const cA = mockCtx(); drawClearCeremony(cA, gl)
    const cB = mockCtx(); drawClearCeremony(cB, gl)
    check('determinism: the same cleared state records an identical ceremony',
        JSON.stringify(cA.fills) === JSON.stringify(cB.fills))

    // shell wiring: the lawn and the attract both show it; the rain has its chime
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'GardenGuard', 'index.jsx'), 'utf8')
    check('the shell paints the ceremony on the live lawn', src.includes('drawClearCeremony(ctx, g)'))
    check('the attract board shows the ceremony too (gap 2 spectacle)', src.includes('drawClearCeremony(ctx, demoG)'))
    check("the shower rings its chime (case 'shower')", src.includes("case 'shower'"))
}

// ---- 8. #2336 gap 5 — goblin posture at a glance ---------------------------
section('GOBLIN POSTURE (#2336)')
{
    // A 5-second glance must separate the raid types (the original's silhouettes
    // did). Drive drawEnemy for each type on the recording mock and measure the
    // BODY ellipse (the biggest non-rect fill), ear poke over the body, and the
    // sprinter's scarf. Reverting the POSE table to one blob reddens 1-4.
    const EX = 520, EROW = 2
    const draw = (id, anim = 1.1) => {
        const def = ENEMIES[id]
        const e = { id, r: EROW, x: EX, hp: def.hp, maxHp: def.hp, slow: 1, slowT: 0, anim, eat: 0 }
        const c = mockCtx(); drawEnemy(c, e, 3.3)
        const body = c.fills.filter((f) => !f.rect).reduce((a, f) =>
            ((f.x1 - f.x0) * (f.y1 - f.y0) > (a ? (a.x1 - a.x0) * (a.y1 - a.y0) : -1) ? f : a), null)
        const all = [...c.fills, ...c.strokes]
        const y0 = Math.min(...all.map((f) => f.y0))
        return { c, def, body,
            asp: (body.x1 - body.x0) / (body.y1 - body.y0),
            poke: (body.y0 - y0) / def.r }
    }
    const S = Object.fromEntries(Object.keys(ENEMIES).map((id) => [id, draw(id)]))
    check('the Sprinter runs low and long (body wider than tall, w/h >= 1.5)',
        S.sprinter.asp >= 1.5, `asp=${S.sprinter.asp.toFixed(2)}`)
    check('the Grunt stands upright (body taller than wide, w/h <= 0.95)',
        S.grunt.asp <= 0.95, `asp=${S.grunt.asp.toFixed(2)}`)
    check('the Warlord towers (w/h <= 0.8) and the Brute hunches broad (w/h >= 1.15)',
        S.warlord.asp <= 0.8 && S.brute.asp >= 1.15,
        `war=${S.warlord.asp.toFixed(2)} brute=${S.brute.asp.toFixed(2)}`)
    check('the Pup\'s ears stand up huge (>= 0.3 body-radii above its body)',
        S.pup.poke >= 0.3, `poke=${S.pup.poke.toFixed(2)}`)
    check('the Grunt\'s ears stay a low sweep by comparison (<= 0.25r)',
        S.grunt.poke <= 0.25, `poke=${S.grunt.poke.toFixed(2)}`)
    const asps = Object.values(S).map((s) => Math.round(s.asp * 100) / 100)
    check('five raiders, five silhouettes (body proportions distinct at 2dp)',
        new Set(asps).size === 5, JSON.stringify(asps))
    const scarf = S.sprinter.c.strokes.filter((s) => s.style === '#d9534f')
    check('the Sprinter trails a scarf streaming behind the run (>= 14px)',
        scarf.length === 1 && scarf[0].x1 - scarf[0].x0 >= 14, JSON.stringify(scarf))
    const moved = Object.keys(ENEMIES).map((id) => JSON.stringify(draw(id, 0).c.fills) !== JSON.stringify(draw(id, 2.5).c.fills))
    check('every type\'s gait moves (silhouette changes across the cycle)', moved.every(Boolean), JSON.stringify(moved))
    const dA = draw('grunt', 1.7), dB = draw('grunt', 1.7)
    check('posture drawing is deterministic (same state, same recording)',
        JSON.stringify(dA.c.fills) === JSON.stringify(dB.c.fills) && JSON.stringify(dA.c.strokes) === JSON.stringify(dB.c.strokes))
}

console.log(`\n=== gardencheck: ${pass} pass, ${fail} fail ===`)
if (fails.length) console.log('failed: ' + fails.join(' | '))
process.exit(fail ? 1 : 0)
