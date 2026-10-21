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
import { TRACK, COURSES, selectCourse } from '../src/games/CometDrift/track.js'
import { trackGeometryStats, buildKart, makePool, kartYaw, BUGGY_SCALE, cameraCorridorAudit } from '../src/games/CometDriftHD/scene.js'

const args = process.argv.slice(2)
const MUTATE = args.includes('--mutate')
const MUTATE_CHIME = args.includes('--mutate-chime')
const MUTATE_BLOOM = args.includes('--mutate-bloom')
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

// chime mutant (#478 item 5): flatten the gold bell's sparkle so the ladder's
// chime stops rising — the gold-bell gate MUST go red under this run.
const AUDIO = resolve(HERE, '../src/games/CometDriftHD/audio.js')
const CLINE = 'export const GOLD_BELL = 3136'
const CUTIL = 'export const GOLD_BELL = 120'
let chimemutat = false
if (MUTATE_CHIME) {
    const csrc = readFileSync(AUDIO, 'utf8')
    if (!csrc.includes(CLINE)) { console.error('MUTATE_CHIME: gold-bell line not found — probing stale code.'); process.exit(2) }
    writeFileSync(AUDIO, csrc.replace(CLINE, CUTIL))
    chimemutat = true
    console.log('  ..    mutated: gold bell no longer rings on top — the chime gate MUST report a FAIL')
    process.on('exit', () => {
        if (chimemutat) {
            writeFileSync(AUDIO, readFileSync(AUDIO, 'utf8').replace(CUTIL, CLINE))
            console.log('  ..    chime mutation restored')
        }
    })
}

// #478 item 1 bloom mutant: drop the post chain on the node backend — the
// chain-presence gate MUST go red under this run.
const BLINE = 'post = buildPostChain(renderer)'
const BUTIL = 'post = null /* bloommut */'
let bloommutat = false
if (MUTATE_BLOOM) {
    const bsrc = readFileSync(SHARD, 'utf8')
    if (!bsrc.includes(BLINE)) { console.error('MUTATE_BLOOM: chain line not found — probing stale code.'); process.exit(2) }
    writeFileSync(SHARD, bsrc.replace(BLINE, BUTIL))
    bloommutat = true
    console.log('  ..    mutated: the post chain never builds — the bloom gates MUST report a FAIL')
    process.on('exit', () => {
        if (bloommutat) {
            writeFileSync(SHARD, readFileSync(SHARD, 'utf8').replace(BUTIL, BLINE))
            console.log('  ..    bloom mutation restored')
        }
    })
}

// ---------------------------------------------------------------- geometry
console.log('track geometry (the HD rebuild of the Gulch):')
const { stats, bounds, geos } = trackGeometryStats()
ok(bounds.offMin >= 220 && (bounds.topMax - bounds.elevMax) <= 3.6, `walls sit set back outside the sim clamp (${bounds.offMin}px >= 220px > ${bounds.simClampPx}px) and under the sightline (${(bounds.topMax - bounds.elevMax).toFixed(2)}u above the highest road)`)
const ring = (TRACK.N + 1) * 2
ok(stats.road.verts === ring, `road ribbon is a closed ring (${ring} verts)`)
ok(stats.road.nan === 0 && stats.wallL.nan === 0 && stats.plateauR.nan === 0, 'no NaN anywhere in the track bands')

// #542: the horizon furniture must ring EVERY course — when the world grew,
// the old fixed ring left the karts driving under the mesas. Nothing that is
// not the track may reach into the camera corridor (mesa footprints, spires).
console.log('camera corridor (#542):')
for (const c of COURSES) {
    selectCourse(c.id)
    const audit = cameraCorridorAudit()
    const extra = audit.violations.length ? ` (${audit.violations.length} intrusions, worst ${JSON.stringify(audit.violations.sort((a, b) => a.clearance - b.clearance)[0])})` : ''
    ok(audit.violations.length === 0, `${c.id}: ${audit.mesaCount} mesas + ${audit.sceneryCount} scenery items clear the corridor${extra}`)
}
selectCourse('gulch')

// #518: the road is NOT flat — it follows the course height profile, and every
// band (kerb, gutter, wall foot/top, plateau) hangs off the same profile at the
// same point index, so the terrain meets the road all the way round.
const yAt = (geo, i, v) => geo.getAttribute('position').getY(i * 2 + v)
{
    const S = 1 / 60
    let dev = 0
    let hangBad = 0; let footBad = 0; let rimBad = 0
    let minDev = Infinity; let maxDev = -Infinity
    const N = TRACK.N
    for (let i = 0; i < N; i++) {
        const ry = yAt(geos.road, i, 0)
        dev = Math.max(dev, Math.abs(ry - (TRACK.pts[i].h * S + 0.06)))
        const lift = yAt(geos.wallL, i, 1) - ry
        if (lift < 1.4 || lift > 3.7) hangBad++
        if (yAt(geos.wallL, i, 0) >= ry) footBad++
        if (yAt(geos.plateauL, i, 1) <= ry) rimBad++
        maxDev = Math.max(maxDev, lift)
        minDev = Math.min(minDev, lift)
    }
    ok(dev < 1e-6, `road surface follows the #518 height point for point (profile → geometry, max dev ${dev.toExponential(1)}u — float32 precision)`)
    ok((stats.road.maxY - stats.road.minY) >= 0.9 * (bounds.elevMax - bounds.elevMin),
        `the road goes up and down: ${stats.road.minY.toFixed(2)}..${stats.road.maxY.toFixed(2)}u across the lap`)
    ok(hangBad === 0, `cliff walls ride the profile too — every section stands ${minDev.toFixed(2)}..${maxDev.toFixed(2)}u over the road under it`)
    ok(footBad === 0, 'wall bases stay under the road at every point (no floating cliffs, elevated or not)')
    ok(rimBad === 0, 'plateau rim stays above the road at every point (scenery has ground)')
    ok(bounds.maxGrade <= 0.0951, `grades stay arcade-steep, not stunt-steep (max ${bounds.maxGrade.toFixed(3)})`)
}
ok(stats.wallL.maxY >= 1.5 && stats.wallR.maxY >= 1.5, 'cliff walls rise over the road')
ok(stats.kerbL.verts === ring && stats.gutterR.verts === ring, 'kerb + gutter rings cover the full lap')
const kart = buildKart(0x20b8dc, '#fff')
ok(kart.children.length >= 10 && kart.userData.wheels.length === 2, `buggy assembled: ${kart.children.length} parts, steerable front axles`)
ok(kart.userData.wheelDefs && kart.userData.wheelDefs.length === 4, 'fallback buggy exposes all four wheel rig nodes')

// ------------------------------------------------ dune buggy model + heading (#477)
// Jon's authored GLB drives the car now. Two facts must hold on the REAL bytes,
// not on a mock: the model's nose is +Z, and the sim-heading -> yaw law points
// it down the road (the old −a pointed it sideways — Jon's bug).
console.log('dune buggy model + heading law (#477):')
{
    const glbPath = resolve(HERE, '../public/games/comet-drift-hd/dune_buggy.glb')
    const bytes = readFileSync(glbPath)
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let off = 12; let gj = null
    while (off + 8 <= bytes.length) {
        const len = dv.getUint32(off, true); const type = dv.getUint32(off + 4, true)
        if (type === 0x4e4f534a) { gj = JSON.parse(bytes.subarray(off + 8, off + 8 + len).toString('utf8')); break }
        off += 8 + len
    }
    ok(!!gj, 'dune_buggy.glb is a readable glTF binary')
    const nodeByName = {}; for (const n of (gj.nodes || [])) nodeByName[n.name] = n
    const matNames = (gj.materials || []).map((m) => m.name)
    ok(!!nodeByName.DuneBuggy && ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'].every((w) => nodeByName[w]), 'rig has a root + the four named wheel pivots')
    ok(['Paint_Orange', 'Taillight_Red', 'Light_Emissive'].every((mt) => matNames.includes(mt)), 'paint + taillight + headlight materials present (per-rival recolour target exists)')
    const acc = (name, attr) => gj.accessors[gj.meshes[nodeByName[name].mesh].primitives[0].attributes[attr]]
    ok(acc('Chassis_light', 'POSITION').max[2] > acc('Chassis_tail', 'POSITION').max[2], `nose points +Z (headlights z=${acc('Chassis_light', 'POSITION').max[2].toFixed(2)} ahead of tailgate z=${acc('Chassis_tail', 'POSITION').max[2].toFixed(2)})`)

    // heading law: rotating the local nose (+Z) by kartYaw(a) lands on the sim
    // travel direction (cos a, sin a) in world (X,Z).
    let maxErr = 0
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const nose = [Math.sin(kartYaw(a)), Math.cos(kartYaw(a))]
        maxErr = Math.max(maxErr, Math.hypot(nose[0] - Math.cos(a), nose[1] - Math.sin(a)))
    }
    ok(maxErr < 1e-9, `heading law kartYaw(a) points the nose along (cos a, sin a) (max err ${maxErr.toExponential(1)})`)
    ok(Math.abs(kartYaw(0) - Math.PI / 2) < 1e-9, 'kartYaw(0) = π/2 (guards the reverted −a / sideways regression)')

    // wheel signs are derived from each pivot's baked matrix, so a future re-export
    // with different flips fails here. R = rotation 3x3 (column-major), side by x.
    const mul3 = (A, B) => A.map((r, i) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]))
    const ap3 = (A, v) => A.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2])
    const rotOf = (m) => [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]]
    const Ry = (t) => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]]
    const Rx = (t) => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]]
    const wheels = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'].map((nm) => {
        const m = nodeByName[nm].matrix || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        return { nm, R: rotOf(m), x: m[12], z: m[14], side: Math.sign(m[12]) }
    })
    ok(wheels.every((w) => w.side === 1 || w.side === -1) && wheels.length === 4, 'all four wheels offset to a defined left/right side')
    // forward roll: the tire top (local +Y) must swing toward +Z (world) for every
    // wheel when rolled by roll = +0.2 * side. Proves spin direction is consistent.
    ok(wheels.every((w) => ap3(mul3(w.R, Rx(0.2 * w.side)), [0, 1, 0])[2] > 0), 'roll by side-sign spins every wheel forward (both sides spin alike through the baked flip)')
    // steer: front wheels toe the same way (world forward +Z gains the same-sign X)
    const fronts = wheels.filter((w) => w.z > 0)
    const fwdX = fronts.map((w) => ap3(mul3(w.R, Ry(0.3 * w.side)), [0, 0, 1])[0])
    ok(fronts.length === 2 && fwdX[0] * fwdX[1] > 0 && Math.sign(fwdX[0]) === Math.sign(0.3), 'front wheels steer parallel (side-sign undoes the right-side flip)')
    ok(BUGGY_SCALE > 0.3 && BUGGY_SCALE < 0.8, `buggy scaled to a kart footprint (${BUGGY_SCALE}x its 3.4m body)`)
}

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
    const banked = [0, 0, 0]
    while (!g.end && t < 60000) {
        step(g, decide(g))
        for (const ev of g.events.splice(0)) if (ev.e === 'boost' && ev.who === 'COMET') banked[ev.tier]++
        t++
    }
    ok(g.end === 'win', `autopilot drives the field from P7 and WINS (${(t / 60).toFixed(1)}s world time, ${P.lap} laps)`)
    ok(banked[0] + banked[1] + banked[2] >= 3, `the ladder pays in a REAL race, not just the treadmill: ${banked[0]} blue + ${banked[1]} violet + ${banked[2]} gold banked (#471 item 8)`)
    ok(banked[2] >= 1, 'the autopilot banks the GOLD tier in-race')
}

// ---------------------------------------------------------------- bank voices
// #478 item 5: GOLD banks with a rising bell chime the lower tiers never ring.
console.log('bank voices (#478 item 5 — gold bell chime):')
{
    const AV = await import('file://' + AUDIO + '?t=' + Date.now())
    const { bankVoices, GOLD_CHIME, GOLD_BELL } = AV
    const sineTones = (tier) => bankVoices(tier).filter((v) => v.k === 'tone' && v.t === 'sine').map((v) => v.f)
    const chime = sineTones(2)
    ok(GOLD_CHIME.length >= 3, `gold chime is a ${GOLD_CHIME.length}-note arpeggio (not a single blip)`)
    ok(GOLD_CHIME.every((c) => c[2] === 'sine'), 'the chime is pure sine (bell, not a chiptune square)')
    ok(GOLD_CHIME.every((c) => c[1] <= 0.3), 'every chime note is short (<=0.3s) so it rings, not drones')
    ok(GOLD_CHIME.every((c, i) => i === 0 || c[0] > GOLD_CHIME[i - 1][0]), 'the chime ascends (rising ladder to the bell)')
    ok(chime.length === GOLD_CHIME.length && chime[chime.length - 1] === GOLD_BELL && GOLD_BELL >= 3000, `tier 2 rings the full chime topping out on the high G7 bell (${GOLD_BELL}Hz)`)
    ok(bankVoices(0).every((v) => v.t !== 'sine') && bankVoices(1).every((v) => v.t !== 'sine'), 'blue and violet have NO bell — the chime is GOLD-only')
    ok(GOLD_CHIME.every((c, i) => i === 0 || c[4] > GOLD_CHIME[i - 1][4]), 'chime notes arpeggiate (rising delays, not a chord stab)')
    ok(readFileSync(SHARD, 'utf8').includes('bankVoices(ev.tier)'), 'index.jsx drives the COMET bank voices from bankVoices(ev.tier)')
}

// ---------------------------------------------------------------- browser
if (!SKIP_BROWSER) {
    const { launch, openGame, requireDevServer } = await import('./lib/harness.mjs')
    const BASE = process.env.HD_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/comet-drift-hd`
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

        // #478 item 1: the legacy refuge must run WITHOUT the post chain (graceful absence)
        const chainPinned = await page.evaluate(() => window.__cometHDTest.fxChain())
        ok(chainPinned.mode === null && chainPinned.pipeline === false, `post chain is gracefully absent on the pinned legacy path (mode ${chainPinned.mode}, ${chainPinned.backend})`)

        // #477: the authored dune buggy GLB must actually replace the primitive
        // fallback (proves the async swap + material-clone + rig wiring run in a
        // browser, not just in the Node contract).
        try {
            await page.waitForFunction(() => window.__cometHDTest.modelLoaded(), null, { timeout: 15000 })
            ok(true, 'authored dune_buggy.glb swapped in for the primitive kart')
        } catch {
            ok(false, 'authored dune_buggy.glb swapped in for the primitive kart')
        }

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
        await page.waitForFunction(() => window.__cometHDTest.fx().v > 4.5, null, { timeout: 4000 }).catch(() => {})
        await page.waitForTimeout(120)
        const vHeld = await page.evaluate(() => window.__cometHDTest.fx().v)
        ok(vHeld > 4.5, `gas accelerates the buggy past the drift threshold (v ${vHeld.toFixed(2)})`)

        // slalom with drift held: serpentine keeps the kart on the asphalt,
        // and charge accrues through the whole weave (steer never hits 0)
        // drift through the contract loop: deterministic, no key-timing jitter
        // (the old keyboard slalom sank into the sand on BOTH old and new sims
        // depending on puppeteer key timing — it proved nothing). Drift legs
        // are separated by 3-tick steer-neutral gaps: pre-#471 code released
        // the drift in every gap (charge never reached 50, no bank); with the
        // apex grace the hold survives and the release banks blue.
        await page.keyboard.up('Space')
        await page.keyboard.up('KeyX')
        {
            const t = (await import('../src/games/CometDrift/track.js')).TRACK
            const p = t.pts[40]
            await page.evaluate(() => window.__game.release())
            const s = await page.evaluate(() => window.__game.snapshot())
            const P = s.karts[0]
            P.x = p.x; P.y = p.y; P.a = p.a; P.idx = 40; P.hint = 40; P.v = 6; P.lapStart = -9999
            P.spinT = 0; P.driftT = 0; P.charge = -1; P.boostT = 0; P.offroad = false
            await page.evaluate((ss) => window.__game.restore(ss), s)
            // treadmill like the Node ladder: pin the kart each tick so the
            // curved drift path can't wander into a wall and spin (which would
            // clear the charge). Only the grace law is under test here.
            const leg = (ticks, extra) => page.evaluate(({ x, y, a, ticks, extra }) => {
                const P = window.__cometHDTest.game().karts[0]
                for (let i = 0; i < ticks; i++) {
                    P.x = x; P.y = y; P.a = a; P.idx = 40; P.hint = 40; P.v = Math.min(P.v, 7.5)
                    window.__game.step({ up: true, ...extra }, 1)
                }
            }, { x: p.x, y: p.y, a: p.a, ticks, extra })
            let mid = { driftT: 0, charge: -1 }
            for (let i = 0; i < 6; i++) {
                await leg(12, { right: true, a: true })
                await leg(3, { a: true })
                mid = await page.evaluate(() => window.__game.state())
            }
            const midFx = await page.evaluate(() => window.__cometHDTest.fx())
            ok(mid.driftT > 40, `steer-neutral gaps no longer kill a held drift — apex grace bridges them (driftT ${mid.driftT}, charge ${mid.charge})`)
            ok(midFx.sparks > 0, `drift kicks GPU sparks (pool ${midFx.sparks})`)
            await leg(2, {})
            const b = await page.evaluate(() => window.__game.state())
            ok(b.boostT > 0 && b.driftT === 0, `releasing after gapped legs banks a turbo (boostT ${b.boostT}) — pre-grace code banked nothing here`)
        }

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
    // #542: back-to-back headless Chromes briefly wedge the GPU process and
    // the second boot lands in the legacy refuge; let the first one fully die.
    await new Promise((r) => setTimeout(r, 2000))
    const b2 = await launch()
    try {
        const page2 = await openGame(b2, { url: BASE, viewport: { width: 640, height: 360 }, hook: '__cometHDTest' })
        await page2.waitForFunction(() => window.__cometHDTest.ready(), null, { timeout: 20000 })
        const backend2 = await page2.evaluate(() => window.__cometHDTest.backend())
        ok(backend2 === 'webgpu' || backend2 === 'webgl2' || backend2 === 'webgl2-legacy', `default boot picks a real backend (got ${backend2})`)
        ok(backend2 === 'webgpu' || backend2 === 'webgl2', 'backend is WebGPU or the advertised WebGL2 fallback')

        // #478 item 1: the earned-bloom chain is live on whichever node backend
        // the product default picked, the radial smear follows boost both ways,
        // and on a pixel-readable backend the bloom demonstrably lights the frame.
        const ch = await page2.evaluate(() => window.__cometHDTest.fxChain())
        ok(ch.mode !== null && ch.pipeline === true, `post chain builds on the node backend (${ch.backend}: ${ch.mode})`)
        await page2.evaluate(() => { const k = window.__cometHDTest.game().karts[0]; k.boostT = 90; k.boostTier = 2 })
        await page2.waitForTimeout(120)
        const rb = await page2.evaluate(() => window.__cometHDTest.fxChain())
        ok(rb.radial > 0.3 && rb.bloom > 0, `gold boost drives the radial smear + keeps bloom gain live (radial ${rb.radial}, bloom ${rb.bloom})`)
        await page2.evaluate(() => { window.__cometHDTest.game().karts[0].boostT = 0 })
        await page2.waitForTimeout(150)
        const rd = await page2.evaluate(() => window.__cometHDTest.fxChain().radial)
        ok(rd === 0, `radial smear decays to zero the moment boost ends (${rd})`)
        if (backend2 === 'webgl2') {
            const bright = () => page2.evaluate(() => {
                const src = document.querySelector('canvas')
                const cv = document.createElement('canvas'); cv.width = 160; cv.height = 90
                const x = cv.getContext('2d'); x.drawImage(src, 0, 0, 160, 90)
                const d = x.getImageData(0, 0, 160, 90).data
                let s = 0
                for (let i = 0; i < d.length; i += 4) s += Math.max(0, (d[i] + d[i + 1] + d[i + 2]) / 3 - 150)
                return s
            })
            await page2.evaluate(() => window.__cometHDTest.setBloom(0))
            await page2.waitForTimeout(120)
            const offA = await bright()
            await page2.evaluate(() => window.__cometHDTest.setBloom(1.4))
            await page2.waitForTimeout(120)
            const onS = await bright()
            await page2.evaluate(() => window.__cometHDTest.setBloom(0))
            await page2.waitForTimeout(120)
            const offB = await bright()
            ok(onS > Math.max(offA, offB) + 40, `bloom demonstrably adds glow to the frame (glow-sum off ${offA.toFixed(0)}/${offB.toFixed(0)} -> on ${onS.toFixed(0)})`)
            await page2.evaluate(() => window.__cometHDTest.setBloom(0.5))
        }
    } finally {
        await b2.close()
    }

    // #478 item 0: ?renderer=webgl (Jon's pin name) pins the WebGL2 fallback.
    await new Promise((r) => setTimeout(r, 2000))
    const b3 = await launch()
    try {
        const page3 = await openGame(b3, { url: BASE + '?renderer=webgl', viewport: { width: 640, height: 360 }, hook: '__cometHDTest' })
        await page3.waitForFunction(() => window.__cometHDTest.ready(), null, { timeout: 20000 })
        const backend3 = await page3.evaluate(() => window.__cometHDTest.backend())
        ok(backend3 === 'webgl2' || backend3 === 'webgl2-legacy', `?renderer=webgl pins the WebGL2 fallback (${backend3})`)
    } finally {
        await b3.close()
    }
}

console.log(`\ncometdrifthdcheck: ${pass} pass, ${fail} fail`)
if (MUTATE || MUTATE_CHIME || MUTATE_BLOOM) process.exit(fail > 0 ? 0 : 1)
process.exit(fail > 0 ? 1 : 0)
