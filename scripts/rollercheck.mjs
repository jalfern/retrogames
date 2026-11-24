// rollercheck.mjs — MARBLE RUSH (#3107). Node proves the rules, the chrome
// proves it runs: boot, the physics laws (grade accelerates, the shared grip
// budget slides you outward, edges drop you, gaps swallow the slow, bumpers
// kick, bridges carry you), every stage is winnable by the autopilot within
// the BRONZE bound, determinism (seed + pads ⇒ identical hashes), and the
// parity bridge: art.js extrudes floors through course.pointOf and index.jsx
// places the marble and decks through the same pointOf/moverDeck the sim rides
// — plus a geometry check that the built mesh actually carries those samples.
// The last section drives it in real headless Chrome — opt-in on the lane:
// the CI scope gate is Node-only (skyward's pattern), so pass --browser:
// attract, key-start, throttle, drive off the edge, die, retry — zero page errors.
//
// Run: npm run rollercheck                           (CI half, Node-only)
//      npm run rollercheck -- --browser              (+ Chrome drive, lane-run)
//      node scripts/rollercheck.mjs --mutate            (edge fall muted → red)
//      node scripts/rollercheck.mjs --mutate=budget     (grip budget dead → red)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { plant, restoreAll } from './lib/mutateguard.mjs'

const mutArg = process.argv.find((a) => a.startsWith('--mutate'))
const MUT = mutArg ? (mutArg.split('=')[1] || 'edge') : null
const BROWSER = process.argv.includes('--browser')
let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`) } else { fail++; console.log(`  FAIL ${name}`) } }

if (MUT) {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const simPath = join(root, 'src/games/MarbleRush/sim.js')
    const src = readFileSync(simPath, 'utf8')
    const ANCHORS = {
        // the edge stops dropping you — the shelf's whole threat vanishes
        edge: { from: '} else if (!overGap && Math.abs(gs.u - deckE.u) > deckE.w + MARBLE_R * 0.25) {', to: '} else if (false) {', note: 'edge fall muted' },
        // grip never runs out — curves stop throwing the marble outward
        budget: { from: 'const excess = need - avail', to: 'const excess = 0', note: 'centripetal budget muted' },
        // the sweeping bar stops knocking — the stage 2 verb is gone
        sweep: { from: 'gs.swHits += 1', to: 'gs.swHits += 0', note: 'sweeper knock muted' },
        // the checkpoint never arms — late falls lose the whole shelf
        gate: { from: 'gs.cpArmed = true', to: 'gs.cpArmed = false', note: 'checkpoint arming muted' },
    }
    const a = ANCHORS[MUT]
    if (!a) { console.error(`unknown mutant '${MUT}' (have: ${Object.keys(ANCHORS).join(', ')})`); process.exit(1) }
    if (!src.includes(a.from)) { console.error(`mutant anchor missing in sim.js (${MUT})`); process.exit(1) }
    plant(simPath, src.replace(a.from, a.to))
    console.log(`[mutant] ${a.note} — check must go red`)
}

const { STAGES } = await import('../src/games/MarbleRush/course.js')
const { makeGame, step, autoPad, respawn, stateOf, stateHash, courseFor, STAGE_COUNT } = await import('../src/games/MarbleRush/sim.js')

const drive = (gs, maxS, padFn = null) => {
    let g = 0
    while (!gs.done && g < 60 * maxS) { step(gs, padFn ? padFn(gs) : autoPad(gs)); g++ }
    return gs
}

console.log('\n[1] boot + shape')
{
    const gs = makeGame(7, 0)
    const s = stateOf(gs)
    ok('boot: tick 0, on the shelf, not done', s.tick === 0 && !s.done && gs.s > 0 && gs.len > 150)
    ok('state is JSON-safe', JSON.stringify(s) === JSON.stringify(JSON.parse(JSON.stringify(s))))
    ok('ten stages, names, ascending medal bounds', STAGE_COUNT === 10 && STAGES.every((st) => st.name && st.medals[0] < st.medals[1] && st.medals[1] < st.medals[2]))
    ok('stage 2 grew the shelf: six late stages carry cp/movers props, first five untouched', STAGES.slice(5).every((st) => st.cp > 0) && STAGES.slice(0, 5).every((st) => st.cp === 0 && st.sweepers.length === 0))
}

console.log('\n[2] course compiles honest')
for (let i = 0; i < STAGE_COUNT; i++) {
    const c = courseFor(i)
    const gapRuns = c.segs.filter((g0) => g0.gap).length
    const wantGaps = STAGES[i].segs.filter(([, , , w]) => w <= 0).length
    const propsInside = c.bumpers.every((b) => b.s > 0 && b.s < c.len && Math.abs(b.u) < c.halfWidthOf(b.s))
        && c.movers.every((m) => m.from > 0 && m.to < c.len && m.to > m.from)
        && c.kickers.every((k) => k.s > 0 && k.s < c.len)
        && c.sweepers.every((sw) => sw.s > 0 && sw.s < c.len && c.gapAt(sw.s) === 0 && Math.abs(sw.A) + sw.w < c.halfWidthOf(sw.s) + 0.11)
        && (c.cp === 0 || (c.cp > 0 && c.cp < c.len && c.gapAt(c.cp) === 0))
    // every metre of hole must have a ride over it: a deck, or a kicker flight
    let gapCovered = true
    for (let s = 1; s < c.len - 1; s += 1) {
        if (!c.gapAt(s)) continue
        const onDeck = c.movers.some((mv) => s >= mv.from && s < mv.to)
        const onFlight = c.kickers.some((kk) => kk.s <= s && s < kk.gapTo)
        if (!onDeck && !onFlight) { gapCovered = false; break }
    }
    ok(`stage ${i + 1} ${STAGES[i].name}: len ${Math.round(c.len)}m, gaps ${gapRuns}, props inside`, c.len > 150 && gapRuns === wantGaps && propsInside && gapCovered)
}

console.log('\n[3] the physics laws')
{
    const gs = makeGame(1, 4)
    gs.s = 70; gs.t = 1.1; gs.phase = 1          // the drop-in ramp of SKY SHOT
    const v0 = gs.v
    for (let i = 0; i < 120; i++) step(gs, { throttle: 0, steer: 0, brake: false })
    ok('grade: downhill rolls you with no throttle', gs.v > v0 + 1.2 && !gs.falling)
}
{
    const gs = makeGame(1, 0)
    gs.phase = 1; gs.t = 1.1
    let fell = false
    for (let i = 0; i < 240 && !gs.done; i++) { step(gs, { throttle: 0, steer: 1, brake: false }); if (gs.falling) fell = true }
    ok('edge: steering off the shelf drops you', fell && gs.done && gs.fail)
}
{
    const gs = makeGame(1, 1)
    gs.phase = 1; gs.t = 1.1; gs.s = 34; gs.v = 19
    // commit to SWITCHBACK's first banked left at speed, hands off: inertia
    // must spend the budget and walk the marble OUTWARD (+u on a left turn)
    let uMax = 0
    for (let i = 0; i < 120 && !gs.done; i++) { step(gs, { throttle: 1, steer: 0, brake: false }); uMax = Math.max(uMax, gs.u) }
    ok('budget: too fast hands-off through a hard curve slides you outward', gs.falling || uMax > 0.5)
}
{
    const gs = drive(makeGame(1, 2), 120)
    ok('bumper alley: the run kicks bumpers (score banked)', !gs.fail && gs.score >= 50)
}
{
    const gs = drive(makeGame(1, 3), 120)
    ok('swing bridge: riding both oscillating decks home', !gs.fail && gs.done)
}
{
    const gs = makeGame(1, 4)
    gs.phase = 1; gs.t = 1.1; gs.s = 96; gs.v = 4   // arrive at the lip cold
    drive(gs, 60, () => ({ throttle: 0, steer: 0, brake: false }))
    ok('sky shot: crawl to the lip and the gap swallows you', gs.fail)
}

console.log('\n[3b] the stage 2 verbs: sweeping bars + checkpoint gates')
{
    // sit in THE MILL's bar lane, hands off: the bar must hit you, knock you
    // sideways and bite your speed
    const gs = makeGame(7, 7)
    gs.phase = 1; gs.t = 1.1; gs.s = 214; gs.v = 12
    let knocked = false
    let wlatAt = 0
    const v0 = gs.v
    for (let i = 0; i < 600 && gs.swHits === 0; i++) {
        step(gs, { throttle: 0, steer: 0, brake: false })
        if (gs.swHits > 0) { knocked = true; wlatAt = gs.wlat }
    }
    ok('bar lane: the sweeping bar finds you and knocks sideways', knocked && Math.abs(wlatAt) > 3 && gs.v < v0)
    // cooldown pins one knock per pass: stay on the station for 0.4 s of
    // bar-crossing and no second bite lands
    const gs2 = makeGame(7, 7)
    gs2.phase = 1; gs2.t = 1.1; gs2.s = 214; gs2.v = 12
    for (let i = 0; i < 600 && gs2.swHits === 0; i++) step(gs2, { throttle: 0, steer: 0, brake: false })
    const first = gs2.swHits
    const cd = gs2.swCd
    for (let i = 0; i < 24; i++) { gs2.s = 214; step(gs2, { throttle: 0, steer: 0, brake: false }) }
    ok('cooldown: one knock per pass, then immunity', first === 1 && cd > 0.4 && gs2.swHits === 1)
}
{
    // gate arms once crossed, not before
    const gs = makeGame(7, 5)   // UPPER DECK, cp at 150
    gs.phase = 1; gs.t = 1.1; gs.s = 140; gs.v = 10
    for (let i = 0; i < 60 && !gs.cpArmed; i++) step(gs, { throttle: 1, steer: 0, brake: false })
    ok('gate arms exactly when crossed', gs.cpArmed && gs.s >= 150)
    ok('a clear lap does not arm the gate at the start', !makeGame(7, 5).cpArmed)
    // fall after the gate: respawn AT the gate on the same running clock
    gs.falling = true; gs.y = -8; gs.done = true; gs.fail = true
    const tBefore = gs.t
    const scoreBefore = gs.score
    const moved = respawn(gs)
    ok('respawn at the gate keeps clock + score (medals stay honest)',
        moved && gs.cpArmed && Math.abs(gs.s - 146) < 0.01 && gs.t === tBefore && gs.score === scoreBefore && !gs.done && !gs.fail && gs.respawned === 1)
    // respawn refuses when there is nothing to respawn from
    gs.done = true; gs.fail = false
    ok('respawn refuses after finishing the shelf', respawn(gs) === false)
    // no gate on the first five shelves — a fall costs the whole run there
    const g5 = makeGame(7, 4)
    ok('rung 1 shelves stay ungated', g5.cpS === 0 && respawn(g5) === false)
}

console.log('\n[4] every shelf is winnable, inside bronze')
for (let i = 0; i < STAGE_COUNT; i++) {
    const res = [1, 7, 42].map((seed) => drive(makeGame(seed, i), 120))
    const allWon = res.every((gs) => gs.done && !gs.fail)
    const allMedal = res.every((gs) => gs.t <= STAGES[i].medals[2])
    const goldRoom = res.every((gs) => gs.t <= STAGES[i].medals[0])
    ok(`stage ${i + 1}: autopilot wins on 3 seeds, medals land (gold ${res[0].t.toFixed(1)}s ≤ ${STAGES[i].medals[0]}s)`, allWon && allMedal && goldRoom)
}

console.log('\n[5] determinism')
{
    const a = makeGame(7, 1); const b = makeGame(7, 1)
    let same = true
    for (let t = 0; t < 900; t++) {
        const p = autoPad(a)
        step(a, p); step(b, { ...p })
        if (stateHash(a) !== stateHash(b)) same = false
    }
    ok('seed + pads ⇒ identical hashes (900 ticks)', same)
    ok('hash walks with the run', stateHash(a) !== stateHash(makeGame(7, 1)))
    // the seed owns the bridge phases — another seed is another moment
    const d7 = makeGame(7, 3); const d9 = makeGame(9, 3)
    let diff = false
    for (let t = 0; t < 900 && !(diff || d7.done || d9.done); t++) { step(d7, autoPad(d7)); step(d9, autoPad(d9)); if (stateHash(d7) !== stateHash(d9)) diff = true }
    ok('a different seed swings different bridges (streams diverge)', diff)
    ok('state carries seed + hash', Number.isInteger(makeGame(5, 0).seed) && Number.isInteger(stateOf(makeGame(5, 0)).hash))
}

console.log('\n[6] the parity bridge (drawn ≡ ridden)')
{
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const art = readFileSync(join(root, 'src/games/MarbleRush/art.js'), 'utf8')
    const idx = readFileSync(join(root, 'src/games/MarbleRush/index.jsx'), 'utf8')
    ok('art.js builds floors through course.pointOf', art.includes('course.pointOf('))
    ok('index.jsx places the marble via pointOf(s,u,y)', idx.includes('course.pointOf(gs.s, gs.u, gs.y)'))
    ok('decks move by the sim function moverDeck(t + seeded phase)', idx.includes('moverDeck(course, mi, gs.t + gs.mvPhase[mi])') && (await import('../src/games/MarbleRush/course.js')).moverDeck.length === 3)
    ok('bars sweep by the sim function sweeperBar(t + seeded phase)', idx.includes('sweeperBar(course, si, gs.t + gs.swPhase[si])') && (await import('../src/games/MarbleRush/course.js')).sweeperBar.length === 3)
    // structural proof: the first built vertex of stage 1's floor equals the
    // manifold sample the physics rides
    const THREE = await import('three')
    const { buildStage } = await import('../src/games/MarbleRush/art.js')
    void THREE
    const built = buildStage(courseFor(0))
    const posAttr = built.mesh.geometry.getAttribute('position')
    const p0 = courseFor(0).pointOf(0, -Math.max(0.25, courseFor(0).halfWidthOf(0)))
    const near = (posAttr.getX(0) - p0.x) ** 2 + (posAttr.getY(0) - p0.y) ** 2 + (posAttr.getZ(0) - p0.z) ** 2 < 1e-4
    ok('stage 1 mesh vertex 0 sits exactly on the manifold', near)
    ok('stage 1 mesh has real extent', posAttr.count > 400)
}

console.log('\n[7] stateHash survives JSON snapshot/restore')
{
    const gs = drive(makeGame(9, 0), 60)
    const snap = JSON.parse(JSON.stringify(gs))
    const h1 = stateHash(gs)
    Object.assign(gs, JSON.parse(JSON.stringify(snap)))
    ok('snapshot round-trip hash-equal', stateHash(gs) === h1)
}

if (BROWSER) {
    console.log('\n[8] Chrome drive (real keys)')
    const { launch, openGame, requireDevServer } = await import('./lib/harness.mjs')
    const url = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/marble-rush?lite=1`
    await requireDevServer(url)
    const browser = await launch()
    const page = await openGame(browser, { url, hook: '__marbleRushTest', wait: 600 })
    let errors = 0
    page.on('pageerror', () => { errors += 1 })
    page.on('console', (m) => { if (m.type() === 'error') errors += 1 })

    const s0 = await page.evaluate(() => window.__marbleRushTest.probe())
    ok('attract: boots onto the attract screen', s0.screen === 'attract' && s0.tick >= 0)
    ok('attract: autopilot preview is rolling', s0.progress > 0)

    await page.keyboard.press('Space')
    await page.waitForTimeout(1400)
    const s1 = await page.evaluate(() => window.__marbleRushTest.probe())
    ok('key-start: Space starts a shelf, clock runs past the countdown', s1.screen === 'play' && s1.t > 0.05)

    await page.keyboard.down('ArrowUp')
    await page.waitForTimeout(2200)
    const s2 = await page.evaluate(() => window.__marbleRushTest.probe())
    await page.keyboard.up('ArrowUp')
    ok('drive: throttle walks s and gains speed', s2.progress > s1.progress && s2.speed > 2)

    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(2800)
    await page.keyboard.up('ArrowRight')
    await page.waitForFunction(() => window.__marbleRushTest.probe().screen === 'over', null, { timeout: 6000 }).catch(() => {})
    const s3 = await page.evaluate(() => window.__marbleRushTest.probe())
    ok('die: holding into the sky ends the run', s3.screen === 'over' || s3.falling || s3.fail)

    await page.keyboard.press('Space')
    await page.waitForTimeout(1400)
    const s4 = await page.evaluate(() => window.__marbleRushTest.probe())
    ok('retry: Space puts you back on the start pad', s4.screen === 'play' && s4.progress < 0.2)

    // checkpoint flow on UPPER DECK (shelf 6, gate at 61 %): run past the
    // gate, drop off the edge past it, and Space must return you AT the gate
    await page.evaluate(() => window.__marbleRushTest.setStage(5))
    await page.keyboard.press('Space')
    await page.evaluate(() => window.__marbleRushTest.press('ArrowUp'))
    await page.waitForFunction(() => window.__marbleRushTest.probe().progress > 0.63, null, { timeout: 25000 }).catch(() => {})
    await page.waitForFunction(() => window.__marbleRushTest.probe().cpArmed === true, null, { timeout: 15000 }).catch(() => {})
    await page.evaluate(() => window.__marbleRushTest.press('ArrowRight'))
    await page.waitForFunction(() => window.__marbleRushTest.probe().screen === 'over', null, { timeout: 12000 }).catch(() => {})
    await page.evaluate(() => { window.__marbleRushTest.release('ArrowUp'); window.__marbleRushTest.release('ArrowRight') })
    const s5 = await page.evaluate(() => window.__marbleRushTest.probe())
    ok('gate flow: fell past the gate, card offers the gate', s5.screen === 'over' && s5.cpArmed && s5.fail)
    await page.keyboard.press('Space')
    await page.waitForTimeout(500)
    const s6 = await page.evaluate(() => window.__marbleRushTest.probe())
    ok('gate flow: Space returns at the gate (mid-shelf, respawn counted)', s6.screen === 'play' && s6.cpArmed && s6.respawns === 1 && s6.progress > 0.5 && s6.progress < 0.66)

    const frame = await page.evaluate(() => window.__game.frame())
    ok('frame: canvas actually draws', typeof frame === 'string' && frame.length > 20000)
    const cState = await page.evaluate(() => {
        const st = window.__game.reset(1234)
        for (let i = 0; i < 600; i++) window.__game.step({ up: true, x: Math.sin(i * 0.02) * 0.4 })
        const s = window.__game.state()
        window.__game.release()
        return s
    })
    ok('contract: 600 contract ticks, JSON state, real progress', cState.tick > 0 && typeof cState.progress === 'number' && !Number.isNaN(cState.progress) && cState.progress > 0)
    ok('zero page errors across the whole drive', errors === 0)
    await browser.close()
}

console.log(`\nrollercheck: ${pass}/${pass + fail} pass${MUT ? ` (mutant: ${MUT})` : ''}`)
restoreAll()
if (fail) process.exit(1)
