// cometdrifthdcheck — COMET DRIFT HD (#465): the MODERN twin's harness.
//
// Node part (no browser): the rebuilt geometry is a faithful Gulch, the
// reused sim still holds its core rules, and the autopilot still wins the
// whole race. Browser part (dev server, headless Chrome): the WebGPU
// renderer boots (or falls back and says so), the canvas draws a real
// world (not black, not static), sparks are coupled to the drift state,
// and an end-table → restart round-trip works.
//
//   npm run cometdrifthdcheck
//   npm run cometdrifthdcheck -- --mutate     # breaks a load-bearing line, demands RED
//   npm run cometdrifthdcheck -- --skip-browser
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeGame, step, decide, stateHash } from '../src/games/CometDrift/sim.js'
import { TRACK } from '../src/games/CometDrift/track.js'
import { trackGeometryStats, buildKart, makePool } from '../src/games/CometDriftHD/scene.js'

const args = process.argv.slice(2)
const MUTATE = args.includes('--mutate')
const SKIP_BROWSER = args.includes('--skip-browser')
const HERE = dirname(fileURLToPath(import.meta.url))
const SHARD = resolve(HERE, '../src/games/CometDriftHD/index.jsx')

let pass = 0; let fail = 0
const ok = (cond, msg) => {
    if (cond) { pass++; console.log(`  ok  ${msg}`) } else { fail++; console.log(`  FAIL ${msg}`) }
}

// mutate first: the dev server must serve the BROKEN module to the browser
const LINE = 'const spawnTick = () => {'
const MUTIL = 'const spawnTick = () => { return;'
let mutated = false
if (MUTATE) {
    const src = readFileSync(SHARD, 'utf8')
    if (!src.includes(LINE)) { console.error('MUTATE: load-bearing line not found — probing stale code.'); process.exit(2) }
    writeFileSync(SHARD, src.replace(LINE, MUTIL))
    mutated = true
    console.log('  ..    mutated: particle spawning is dead — this run MUST report a FAIL')
    process.on('exit', () => {
        if (mutated) {
            writeFileSync(SHARD, readFileSync(SHARD, 'utf8').replace(MUTIL, LINE))
            console.log('  ..    mutation restored')
        }
    })
}

// ---------------------------------------------------------------- geometry
console.log('track geometry (the HD rebuild of the Gulch):')
const { stats } = trackGeometryStats()
const ring = (TRACK.N + 1) * 2
ok(stats.road.verts === ring, `road ribbon is a closed ring (${ring} verts)`)
ok(stats.road.nan === 0 && stats.wallL.nan === 0 && stats.plateauR.nan === 0, 'no NaN anywhere in the track bands')
ok(Math.abs(stats.road.minY - stats.road.maxY) < 1e-9, 'road surface is dead flat')
ok(stats.wallL.maxY >= 3.0 && stats.wallR.maxY >= 3.0, `cliff walls rise over 3 units (L ${stats.wallL.maxY.toFixed(2)}, R ${stats.wallR.maxY.toFixed(2)})`)
ok(stats.wallL.minY < stats.road.minY, 'wall bases sit below the road plane (no floating cliffs)')
ok(stats.plateauL.minY > stats.road.maxY && stats.plateauR.minY > stats.road.maxY, 'plateau rim stands above the road (scenery has ground)')
ok(stats.kerbL.verts === ring && stats.gutterR.verts === ring, 'kerb + gutter rings cover the full lap')
const kart = buildKart(0x20b8dc, '#fff')
ok(kart.children.length >= 10 && kart.userData.wheels.length === 2, `buggy assembled: ${kart.children.length} parts, steerable front axles`)
const pool = makePool(10, 0.2)
pool.spawn(0, 0.2, 0, 0.01, 0, 0, 5, 0xffffff)
pool.spawn(0, 0.2, 0, 0.01, 0, 0, 5, 0xffffff)
pool.step(0); pool.step(0)
ok(pool.aliveCount === 2, 'particle pool spawns and ages')
pool.step(0); pool.step(0); pool.step(0); pool.step(0)
ok(pool.aliveCount === 0, 'particle pool retires dead particles')

// ------------------------------------------------------------------ rules
console.log('reused sim keeps its rules under the new renderer:')
{
    const h1 = []; const h2 = []
    const gA = makeGame(0); const gB = makeGame(0)
    for (let i = 0; i < 900; i++) { step(gA, decide(gA)); h1.push(stateHash(gA)); step(gB, decide(gB)); h2.push(stateHash(gB)) }
    ok(h1.join() === h2.join(), 'same seed replays identically, tick for tick (900 ticks)')
}
{
    // the ladder pays (reference implementation: cometcheck's treadmill — pin
    // the kart to one road point so a long drift accrues without it wandering
    // into a wall). In a real race the autopilot's line precision rarely holds
    // a drift long enough; that gap rides the shared sim and is filed to QA.
    const p = TRACK.pts[40]
    const run = (ticks) => {
        const g = makeGame(5)
        g.phase = 'race'; g.count = 0
        const P = g.karts[0]
        P.v = 6; P.lapStart = -999
        const pin = () => { P.x = p.x; P.y = p.y; P.a = p.a; P.idx = 40; P.hint = 40 }
        for (let i = 0; i < ticks; i++) { pin(); step(g, { u: true, r: true, drift: true }) }
        step(g, { u: true })
        return P
    }
    const short = run(70)
    ok(short.boostT > 0 && short.boostTier === 0, `held drift pays tier 0 on release (boostT ${short.boostT})`)
    const gold = run(170)
    ok(gold.boostT > 0 && gold.boostTier === 2, `165-tick hold pays the GOLD turbo (boostT ${gold.boostT})`)
    ok(gold.boostT > short.boostT, 'higher tiers pay longer boosts')
}
{
    const g = makeGame(0)
    const P = g.karts[0]
    let t = 0
    while (!g.end && t < 60000) { step(g, decide(g)); t++ }
    ok(g.end === 'win', `autopilot drives the field from P7 and WINS (${(t / 60).toFixed(1)}s world time, ${P.lap} laps)`)
}

// ---------------------------------------------------------------- browser
if (!SKIP_BROWSER) {
    const { launch, openGame, requireDevServer } = await import('./lib/harness.mjs')
    const BASE = process.env.HD_URL || 'http://localhost:5173/retrogames/comet-drift-hd'
    // pixel assertions need the WebGL2 backend: a WebGPU canvas answers black
    // to 2D drawImage/getImageData. The game defaults to WebGPU (verified on
    // the compositor via screenshots); the harness pins the fallback it
    // advertises for phones, and checks both backends boot.
    const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'gl=webgl2'
    console.log(`browser (${URL}):`)
    requireDevServer(BASE)
    const browser = await launch()
    const page = await openGame(browser, { url: URL, viewport: { width: 840, height: 420 }, hook: '__cometHDTest', wait: 500 })
    try {
        await page.waitForFunction(() => window.__cometHDTest.ready(), null, { timeout: 20000 })
        const backend = await page.evaluate(() => window.__cometHDTest.backend())
        ok(backend === 'webgl2' || backend === 'webgl2-legacy', `WebGL2 fallback backend active for pixel checks (${backend})`)

        const pixels = async () => page.evaluate(() => {
            const src = document.querySelector('canvas')
            const cv = document.createElement('canvas')
            cv.width = 160; cv.height = 90
            const x = cv.getContext('2d')
            x.drawImage(src, 0, 0, 160, 90)
            const d = x.getImageData(0, 0, 160, 90).data
            let min = 255; let max = 0
            const uniq = new Set()
            for (let i = 0; i < d.length; i += 4) {
                const l = (d[i] + d[i + 1] + d[i + 2]) / 3
                min = Math.min(min, l); max = Math.max(max, l)
                uniq.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`)
            }
            return { min, max, uniq: uniq.size }
        })
        await page.waitForTimeout(600)
        const p1 = await pixels()
        ok(p1.max - p1.min > 60 && p1.uniq > 12, `canvas draws a real world, not black/flat (luma ${p1.min}..${p1.max}, ${p1.uniq} colors)`)

        await page.keyboard.press('Space')
        await page.waitForTimeout(150)
        ok(await page.evaluate(() => window.__cometHDTest.screen()) === 'race', 'any key leaves attract for the race')

        await page.evaluate(() => { window.__cometHDTest.game().count = 1 })
        await page.keyboard.down('KeyX')
        await page.waitForTimeout(1000)
        const vHeld = await page.evaluate(() => window.__cometHDTest.fx().v)
        ok(vHeld > 4.5, `gas accelerates the buggy past the drift threshold (v ${vHeld.toFixed(2)})`)

        // slalom with drift held: serpentine keeps the kart on the asphalt,
        // and charge accrues through the whole weave (steer never hits 0)
        await page.keyboard.down('Space')
        let mid = { driftT: 0, charge: -1, sparks: 0 }
        for (let i = 0; i < 8; i++) {
            const key = i % 2 ? 'ArrowRight' : 'ArrowLeft'
            await page.keyboard.down(key)
            await page.waitForTimeout(230)
            if (i === 5) mid = await page.evaluate(() => window.__cometHDTest.fx())
            await page.keyboard.up(key)
        }
        ok(mid.driftT > 20, `held slalom builds a long drift (driftT ${mid.driftT}, charge ${mid.charge})`)
        ok(mid.sparks > 0, `drift kicks GPU sparks (pool ${mid.sparks})`)
        await page.keyboard.up('Space')
        await page.keyboard.up('KeyX')
        await page.waitForTimeout(150)
        const b = await page.evaluate(() => window.__cometHDTest.fx())
        ok(b.boostT > 0 && b.driftT === 0, `releasing the slalom banks a turbo (boostT ${b.boostT}, tier banked)`)

        const p2 = await pixels()
        ok(p2.max - p2.min > 60, 'canvas still renders after a boost (not a dead black frame)')

        // end table round-trip at contract speed: teleport onto the line on
        // the last lap, drive over it, watch the end screen, tap back out.
        const snap = await page.evaluate(() => {
            window.__game.release()
            const s = window.__game.snapshot()
            const P = s.karts[0]
            P.lap = 3; P.cp = 15
            return s
        })
        {
            const t = (await import('../src/games/CometDrift/track.js')).TRACK
            const p = t.pts[t.N - 4]
            snap.karts[0].x = p.x; snap.karts[0].y = p.y; snap.karts[0].a = p.a
            snap.karts[0].idx = t.N - 4; snap.karts[0].hint = t.N - 4; snap.karts[0].v = 8
        }
        await page.evaluate((s) => window.__game.restore(s), snap)
        let doneState = { done: false }
        for (let i = 0; i < 8; i++) {
            await page.evaluate(() => window.__game.step({ up: true }, 60))
            doneState = await page.evaluate(() => window.__game.state())
            if (doneState.done) break
        }
        ok(doneState.done === true, 'crossing the line on the last lap ends the race')
        await page.evaluate(() => window.__game.release())
        await page.waitForTimeout(120)
        ok(await page.evaluate(() => window.__cometHDTest.screen()) === 'end', 'shell switches to the end screen')
        await page.waitForTimeout(500)
        await page.keyboard.press('KeyX')
        await page.waitForTimeout(120)
        ok(await page.evaluate(() => window.__cometHDTest.screen()) === 'attract', 'one key (after the guard) restarts from the end table')

        const p3 = await pixels()
        ok(p3.max - p3.min > 60, 'attract still renders live after restart (full cycle survives)')
    } finally {
        await browser.close()
    }

    // the product default: WebGPU is attempted first (falls back per-device)
    const b2 = await launch()
    try {
        const page2 = await openGame(b2, { url: BASE, viewport: { width: 640, height: 360 }, hook: '__cometHDTest' })
        await page2.waitForFunction(() => window.__cometHDTest.ready(), null, { timeout: 20000 })
        const backend2 = await page2.evaluate(() => window.__cometHDTest.backend())
        ok(backend2 === 'webgpu' || backend2 === 'webgl2' || backend2 === 'webgl2-legacy', `default boot picks a real backend (got ${backend2})`)
        ok(backend2 === 'webgpu' || backend2 === 'webgl2', 'backend is WebGPU or the advertised WebGL2 fallback')
    } finally {
        await b2.close()
    }
}

console.log(`\ncometdrifthdcheck: ${pass} pass, ${fail} fail`)
if (MUTATE) process.exit(fail > 0 ? 0 : 1)
process.exit(fail > 0 ? 1 : 0)
