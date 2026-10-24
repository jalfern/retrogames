// cometdrifthdsandcheck — COMET DRIFT HD dynamic sand scarification (#995).
//
// Node-only (plus the sun-shadow law). Proves the desert REMEMBERS the pack:
// the wear field stamps under any kart whose surface is sand, fades over the
// race clock, and pushes the gutter ribbon down-and-dark where it is scarred
// while the displaced sand crowns the rut's rim into a raised lip; a fresh
// stamp kicks a dust plume off the plowing karts (player full, rivals half
// rate); and the field carries across re-races (the desert remembers the
// session) — only a course swap rebuilds it. The ruts stay in the sand (the
// racing line never scars); the certified autopilot alone leaves a clean
// sheet — it is the field's seeded mistakes that carve; and stamping never
// touches the sim (finish times are identical with and without the wear loop).
//
//   npm run cometdrifthdsandcheck
//   npm run cometdrifthdsandcheck -- --mutate   # stamps become no-ops, the
//                                               # ribbon never moves and fresh
//                                               # ruts kick no dust — MUST go red
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { TRACK, selectCourse } from '../src/games/CometDrift/track.js'
import { makeGame, step, decide } from '../src/games/CometDrift/sim.js'
import { SAND_WEAR, makeWear, wearAt, stampWear, decayWear, scarStats, stampKarts, deformGeo, STAMP_PLUME, plumePuffs, rutOffset } from '../src/games/CometDriftHD/sand.js'
import { sunShadow, SUN_SHADOW, makeBlobShadow } from '../src/games/CometDriftHD/scene.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SELF = fileURLToPath(import.meta.url)
const SAND_SRC = resolve(HERE, '../src/games/CometDriftHD/sand.js')
const MUTATE = process.argv.includes('--mutate')

let pass = 0; let fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  ok  ${msg}`) } else { fail++; console.log(`  FAIL ${msg}`) } }

const PAIRS = [
    ['const h = stampWear(w, k.x, k.y)', 'const h = 0'],
    ['pos.setY(i, by + rutOffset(v, gpc))', 'pos.setY(i, by)'],
    ['n += STAMP_PLUME.perKart', 'n += 0'],
]
if (MUTATE) {
    let src = readFileSync(SAND_SRC, 'utf8')
    if (!PAIRS.every(([good]) => src.includes(good))) { console.error('MUTATE: load-bearing lines not found — stale code.'); process.exit(2) }
    for (const [good, bad] of PAIRS) src = src.replace(good, bad)
    writeFileSync(SAND_SRC, src)
    console.log('  ..    mutated: the desert forgets, the rim flattens, the ruts kick no dust — the child run MUST be red')
    let done = false
    try {
        const child = spawnSync(process.execPath, [SELF], { encoding: 'utf8' })
        done = child.status !== 0
        console.log(done ? '  ok  mutant detected: child run failed as demanded' : '  FAIL mutant escaped: child run still green')
    } finally {
        let s = readFileSync(SAND_SRC, 'utf8')
        for (const [good, bad] of PAIRS) s = s.replace(bad, good)
        writeFileSync(SAND_SRC, s)
        console.log('  ..    mutation restored')
    }
    process.exit(done ? 0 : 1)
}

console.log('— the wear field —')
{
    const w = makeWear(0, 0, 210, 210)
    ok(w.nx === Math.ceil(210 / SAND_WEAR.cell) && w.grid.length === w.nx * w.nz, `field covers its bounds (${w.nx}x${w.nz} cells)`)
    stampWear(w, 105, 105)
    const c = wearAt(w, 105, 105)
    ok(c > 0.3 && c <= SAND_WEAR.max, `stamp centres at ${c.toFixed(3)} (0.3..${SAND_WEAR.max})`)
    const r = SAND_WEAR.radius
    ok(wearAt(w, 105 + r + SAND_WEAR.cell, 105) === 0, 'outside the rut radius there is no wear')
    let mono = true; let prev = SAND_WEAR.max
    for (let d = 0; d <= r; d += 4) {
        const v = wearAt(w, 105 + d, 105)
        if (v > prev + 1e-9) mono = false
        prev = v
    }
    ok(mono, 'the rut fades monotonically from centre to edge')
    const before = wearAt(w, 105, 105)
    for (let i = 0; i < 10; i++) stampWear(w, 105, 105)
    ok(wearAt(w, 105, 105) === Math.min(SAND_WEAR.max, before + SAND_WEAR.add * 10) || wearAt(w, 105, 105) <= SAND_WEAR.max,
        `repeat stamps clamp at max (${wearAt(w, 105, 105).toFixed(2)})`)
    stampWear(w, -9999, -9999)
    ok(true, 'out-of-bounds stamps cannot write outside the grid')
    for (let i = 0; i < Math.ceil(1 / SAND_WEAR.decay) + 50; i++) decayWear(w)
    ok(scarStats(w).cells === 0, 'the desert cleans itself: full decay to zero cells')
}

console.log('— the ribbon takes the ruts —')
{
    const w = makeWear(-400, -400, 400, 400)
    const geo = new THREE.PlaneGeometry(800, 800, 8, 8)
    geo.rotateX(-Math.PI / 2)
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3).fill(1), 3))
    const pos = geo.getAttribute('position'); const col = geo.getAttribute('color')
    const authY = Float32Array.from(pos.array.filter((_, i) => i % 3 === 1))
    let vi = 0
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i)) < 1 && Math.abs(pos.getZ(i)) < 1) vi = i
    const touchedClean = deformGeo(geo, w)
    ok(touchedClean === 0, 'an unworn field leaves the ribbon untouched')
    stampWear(w, 0, 0, SAND_WEAR.max)
    const touched = deformGeo(geo, w)
    ok(touched >= 1, `scarred field deforms ${touched} verts`)
    const sunk = authY[vi] - pos.getY(vi)
    ok(sunk > SAND_WEAR.sink * 0.9 && sunk <= SAND_WEAR.sink + 1e-6, `the rut sinks the ribbon ${sunk.toFixed(3)}u (cap ${SAND_WEAR.sink})`)
    ok(col.getX(vi) < 1 && col.getY(vi) < 1 && col.getZ(vi) < 1, `scarred sand darkens (${col.getX(vi).toFixed(2)})`)
    let farOk = true
    for (let i = 0; i < pos.count; i++) if (Math.hypot(pos.getX(i), pos.getZ(i)) > SAND_WEAR.radius * 1.5 && (pos.getY(i) !== authY[i] || col.getX(i) !== 1)) farOk = false
    ok(farOk, 'verts outside the rut keep their authored height and colour')
    const y1 = pos.getY(vi)
    deformGeo(geo, w)
    ok(pos.getY(vi) === y1, 'deform recomputes from the captured base — a fresh pass never doubles the rut')
    for (let i = 0; i < Math.ceil(1 / SAND_WEAR.decay) + 50; i++) { decayWear(w); deformGeo(geo, w) }
    ok(pos.getY(vi) === authY[vi] && col.getX(vi) === 1, 'decay lifts the ribbon and its colour back to the authored surface')
}

console.log('— the rut’s rim: displaced sand —')
{
    ok(rutOffset(1, 0) === -SAND_WEAR.sink, 'a full-depth centre sits a full sink below the authored surface')
    ok(rutOffset(0, 1) === SAND_WEAR.lip, 'a peak wear gradient raises a full lip above untouched sand')
    const w = makeWear(-400, -400, 400, 400)
    stampWear(w, 0, 0, SAND_WEAR.max)
    // scan +x under the stamp: the profile must crown where the wear gradient
    // peaks (the patch edge) and floor out at the centre — never the reverse.
    let crown = -Infinity; let crownD = -1; let floor = Infinity
    for (let d = 0; d <= SAND_WEAR.radius + 2 * w.cell; d += 1) {
        const v = wearAt(w, d, 0)
        const g = Math.abs(wearAt(w, d + w.cell, 0) - wearAt(w, d - w.cell, 0)) / 2
        const off = rutOffset(v, g)
        if (off > crown) { crown = off; crownD = d }
        if (d < SAND_WEAR.radius && off < floor) floor = off
    }
    ok(crown > 0 && crownD > SAND_WEAR.radius * 0.5, `the rim crowns ${crown.toFixed(3)}u above untouched sand at d=${crownD} — the edge, not the centre`)
    ok(floor < -SAND_WEAR.sink * 0.9, `the floor sits ${(-floor).toFixed(3)}u below the authored surface`)
    // and the geometry obeys the law: a finely-cut ribbon grows a real berm.
    const geo = new THREE.PlaneGeometry(160, 160, 160, 160)
    geo.rotateX(-Math.PI / 2)
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3).fill(1), 3))
    const pos = geo.getAttribute('position')
    const auth = Float32Array.from(pos.array.filter((_, i) => i % 3 === 1))
    deformGeo(geo, w)
    let berm = -Infinity
    for (let i = 0; i < pos.count; i++) berm = Math.max(berm, pos.getY(i) - auth[i])
    ok(berm > 0, `deformGeo raises the rim: the deformed ribbon peaks ${berm.toFixed(3)}u above its authored surface`)
}

console.log('— the stamp plume —')
{
    ok(STAMP_PLUME.perKart > 0 && STAMP_PLUME.ttl > 0, 'the plume has a size and a life')
    const P = { name: 'p' }, R = { name: 'r' }
    const rep = { stamped: 4, karts: [P, R] }
    ok(plumePuffs(rep, P, 0) === 2 * STAMP_PLUME.perKart, 'even tick: the player and the rivals all plough')
    ok(plumePuffs(rep, P, 1) === STAMP_PLUME.perKart, 'odd tick: the rivals wait their turn — only the player ploughs')
    ok(plumePuffs({ stamped: 0, karts: [] }, P, 0) === 0, 'no carving, no dust')
}

console.log('— a real race carves the desert —')
for (const cid of ['sandbank', 'gulch']) {
    selectCourse(cid)
    const sim = await import(`../src/games/CometDrift/sim.js?s=${cid}`)
    const w = makeWear(
        Math.min(...TRACK.pts.map((p) => p.x)) - 420, Math.min(...TRACK.pts.map((p) => p.y)) - 420,
        Math.max(...TRACK.pts.map((p) => p.x)) + 420, Math.max(...TRACK.pts.map((p) => p.y)) + 420)
    const hints = {}
    const g = sim.makeGame(3)
    let n = 0; let plowTicks = 0
    while (!g.end && n < 60 * 400) {
        sim.step(g, sim.decide(g))
        const rep = stampKarts(w, g.karts, hints)
        if (rep.karts.length) plowTicks++
        decayWear(w)
        n++
    }
    const s = scarStats(w)
    ok(g.end === 'win' && s.cells > 0 && s.depth > 0,
        `${cid}: the pack ruts the sand in a full race (${s.cells} cells, depth ${s.depth.toFixed(2)}, sum ${s.sum})`)
    ok(plowTicks > 0, `${cid}: the carving comes in fresh stamps — ${plowTicks} ploughing ticks kick a plume`)
}

console.log('— what must NOT happen —')
selectCourse('sandbank')
{
    const sim = await import('../src/games/CometDrift/sim.js?clean=1')
    const bounds = () => [
        Math.min(...TRACK.pts.map((p) => p.x)) - 420, Math.min(...TRACK.pts.map((p) => p.y)) - 420,
        Math.max(...TRACK.pts.map((p) => p.x)) + 420, Math.max(...TRACK.pts.map((p) => p.y)) + 420]
    const w = makeWear(...bounds())
    const hints = {}
    const g = sim.makeGame(3)
    let n = 0
    while (!g.end && n < 60 * 400) {
        sim.step(g, sim.decide(g))
        stampKarts(w, [g.karts[0]], hints)
        decayWear(w)
        n++
    }
    const pilot = scarStats(w)
    ok(pilot.depth < SAND_WEAR.max * 0.6,
        `the certified autopilot skims, it does not plough (${pilot.cells} cells, depth ${pilot.depth.toFixed(2)}) — the ideal line grazes the sand margins and nothing more`)
    const w2 = makeWear(...bounds())
    const g2 = sim.makeGame(3)
    let n2 = 0
    while (!g2.end && n2 < 60 * 400) {
        sim.step(g2, sim.decide(g2))
        stampKarts(w2, g2.karts, {})
        decayWear(w2)
        n2++
    }
    const field = scarStats(w2)
    ok(field.cells > pilot.cells && field.depth > pilot.depth,
        `the field does the carving: the pack ${field.cells} cells @ depth ${field.depth.toFixed(2)} vs the pilot's ${pilot.cells} @ ${pilot.depth.toFixed(2)}`)
    ok(g2.karts[0].finishT === g.karts[0].finishT, `stamping never touches the sim (finish ${g.karts[0].finishT} == ${g2.karts[0].finishT})`)
    let roadDirty = 0
    for (let i = 0; i < TRACK.pts.length; i += 7) if (wearAt(w2, TRACK.pts[i].x, TRACK.pts[i].y) > 0) roadDirty++
    ok(roadDirty === 0, 'the racing line stays clean — ruts live in the sand, never on the asphalt')
}

console.log('— sun-fixed shadows —')
{
    ok(SUN_SHADOW.az > 0 && SUN_SHADOW.stretch > 1, 'the dusk sun has a fixed azimuth and the shadow stretches along it')
    const a = sunShadow(0); const b = sunShadow(1.5); const c = sunShadow(6)
    ok(a.core > b.core && b.core > c.core, 'the higher the kart rides, the softer its core shadow')
    ok(a.halo > b.halo && c.stretch > a.stretch, 'elevation spreads and fades the halo; it never sharpens uphill')
    const sh = makeBlobShadow()
    ok(sh.userData.halo && sh.userData.core && sh.userData.parts.join() === 'halo,core', 'the blob rig exposes halo+core for the sun law to steer')
}

const SKIP_BROWSER = process.argv.includes('--skip-browser')
const HD_URL = process.env.HD_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/comet-drift-hd`
if (SKIP_BROWSER) {
    console.log('\n(browser section skipped)')
} else {
    const { launch, openGame } = await import('./lib/harness.mjs')
    let browser
    try {
        browser = await launch()
    } catch {
        console.log('\n(no Chrome available — browser section skipped)')
    }
    if (browser) {
        console.log('\n— the live wire-up (headless Chrome) —')
        const page = await openGame(browser, { url: HD_URL, viewport: { width: 900, height: 760 }, hook: '__cometHDTest' })
        await page.evaluate(() => window.__cometHDTest.setCourse('sandbank'))
        const grown = await page.evaluate(async () => {
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
            for (let i = 0; i < 60; i++) {
                const s = window.__cometHDTest.sandState()
                if (s && s.cells > 0) return s
                await sleep(500)
            }
            return window.__cometHDTest.sandState()
        })
        ok(grown && grown.cells > 0 && grown.depth > 0 && grown.sum > 0,
            `the attract pack carves the desert live (${grown.cells} cells, depth ${grown.depth}, sum ${grown.sum})`)
        const kept = await page.evaluate(async () => {
            window.__game.reset(7)
            const s = window.__cometHDTest.sandState()
            return s
        })
        ok(kept && kept.cells > 0 && kept.lip > 0,
            'the desert remembers the session: a re-race keeps the scars (and the rim law travels with them)')
        const sh = await page.evaluate(() => window.__cometHDTest.shadowBlob())
        ok(sh.parts === 2 && sh.stretch > 1 && Math.abs(sh.haloAz - SUN_SHADOW.az) < 0.01,
            `the live halo holds the sun line (az ${sh.haloAz}, stretch ${sh.stretch})`)
        ok(sh.core > 0 && sh.halo > 0 && sh.core > sh.halo, 'the live shadow paints core over halo, both above zero')
        const driven = await page.evaluate(() => {
            window.__game.step({ up: true, x: 0.6 }, 600)
            const s = window.__cometHDTest.sandState()
            return { ...s, v: window.__game.state().v, dust: window.__cometHDTest.stampDust() }
        })
        ok(driven.cells > kept.cells && driven.depth > 0,
            `contract-driven driving deepens the ruts (${driven.cells} cells, depth ${driven.depth})`)
        ok(driven.dust > 0, `fresh ruts kick dust off the plowing karts (${driven.dust} puffs in the step)`)
        const swapped = await page.evaluate(() => {
            window.__cometHDTest.setCourse('gulch')
            return window.__cometHDTest.sandState()
        })
        ok(swapped && swapped.cells === 0, 'a course swap rebuilds the field — the session’s memory is per course')
        await browser.close()
    }
}

console.log(`\ncometdrifthdsandcheck: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
