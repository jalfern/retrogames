// SSX surface audit (#669) — Node, no browser, no randomness.
// Proves: the game boots, the surface rules hold (rock revealed by slope and
// ridge height, snow settled on ledges, wind cords present, sparkle only on
// flat lit snow, detail UVs tile deterministically, painted==ridden untouched),
// and the mountain is still winnable. Run: npm run ssxterraincheck

import { buildCourse, terrainY, featureLift, openness, COURSE_COUNT, DS } from '../src/games/SSX/course.js'
import { snowColor, surfaceInfo, slopeAt, sparkleMask, buildTerrain, buildSparkles, detailTexture, sparkleTexture, GRIDS } from '../src/games/SSX/art.js'
import { makeGame, step } from '../src/games/SSX/sim.js'
import { decide } from '../src/games/SSX/planner.js'

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log(`PASS ${name}`) } else { fail++; console.log(`FAIL ${name}`) } }

const luma = (rgb) => rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11

// ---- 1. boots + painted == ridden (surface detail must not move ground) ----
{
    const co = buildCourse(0)
    const mesh = buildTerrain(co)
    const pos = mesh.geometry.attributes.position
    const NC = GRIDS.COLS.length
    let worst = 0
    for (let r = 0; r < pos.count / NC; r += 2) {
        const s = (r + GRIDS.ROW_BACK) * 4
        for (let ci = 0; ci < NC; ci += 3) {
            const o = (r * NC + ci) * 3
            worst = Math.max(worst, Math.abs(pos.array[o + 1] - terrainY(co, s, GRIDS.COLS[ci])))
        }
    }
    ok('painted surface == ridden surface', worst < 1e-3)
    ok('detail is shading only: terrainY ignores the blend', Math.abs(terrainY(co, 152, -0.4) - (co.segs[38].y + 1.46)) < 9)
}

// ---- 2. rock shows through on steep ground (gully walls) ----------------------
for (let c = 0; c < COURSE_COUNT; c++) {
    const co = buildCourse(c)
    let rockOnWall = 0
    for (const gl of co.gullies) {
        const sm = (gl.s0 + gl.s1) / 2
        for (let x = 2; x <= 5; x += 0.5) {
            const inf = surfaceInfo(co, sm, x)
            if (inf.rockT > 0.7 && inf.grad > 0.5) rockOnWall++
        }
    }
    ok(`${co.name}: rock faces the gully walls (${rockOnWall} pts)`, rockOnWall >= 8)
    // and it is layered: colours along a wall column show several distinct bands
    const gl = co.gullies[0]
    const sm = (gl.s0 + gl.s1) / 2
    const hues = new Set()
    for (let x = 2; x <= 6; x += 0.25) {
        const rgb = snowColor(co, sm, x)
        hues.add(`${Math.round(rgb[0] / 12)}:${Math.round(rgb[1] / 12)}`)
    }
    ok(`${co.name}: rock is layered, not one flat tint (${hues.size} bands)`, hues.size >= 5)
}

// ---- 3. ridge crags: high shoulders break into snow/rock bands ---------------
for (let c = 0; c < COURSE_COUNT; c++) {
    const co = buildCourse(c)
    let crag = 0, snowCap = 0
    for (let s = 120; s < co.N * DS - 40; s += DS) {
        for (const x of [4, 5, 6, -4, -5, -6]) {
            const inf = surfaceInfo(co, s, x)
            if (inf.above > 3 && inf.rockT > 0.35) crag++
            if (inf.above > 3 && inf.rockT < 0.15) snowCap++
        }
    }
    ok(`${co.name}: ridges show crags breaking through (${crag})`, crag >= 6)
    ok(`${co.name}: ridges keep snow caps between crags (${snowCap})`, snowCap >= 6)
}

// ---- 4. snow settles on ledges ----------------------------------------------
{
    const co = buildCourse(0)
    let ledgesOk = true, ledges = 0
    for (let s = 120; s < co.N * DS - 40; s += DS) {
        for (const x of [2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
            const inf = surfaceInfo(co, s, x)
            if (inf.rawRock > 0.5 && inf.relax > 0.5) {
                ledges++
                if (inf.rockT > inf.rawRock * 0.55) ledgesOk = false
            }
        }
    }
    ok(`ledges in the rock zone hold snow (${ledges} found)`, ledges >= 5 && ledgesOk)
}

// ---- 5. built features never read as rock (#638 lesson) ---------------------
{
    const co = buildCourse(0)
    const k = co.kickers[1]
    const s = ((k.i0 + k.i1) / 2) * DS
    const fx = k.x + k.w * 0.75
    const flank = surfaceInfo(co, s, fx)
    const gyRaw = (terrainY(co, s + 1, fx) - terrainY(co, s - 1, fx)) / 2
    const gxRaw = (terrainY(co, s, fx + 0.05) - terrainY(co, s, fx - 0.05)) / 0.1 / 9
    const rawGrad = Math.hypot(gyRaw, gxRaw)
    ok(`kicker flank stays snow though the built face is steep (raw grad ${rawGrad.toFixed(2)})`, flank.rockT < 0.05 && rawGrad > 0.6)
    ok('feature faces still catch light', terrainY(co, k.lip * DS, k.x) - terrainY(co, (k.lip + 2) * DS, k.x) > 1)
}

// ---- 6. wind cords: colour varies along s on the piste, but continuously ----
{
    const co = buildCourse(0)
    let minD = 1e9, maxD = 0, along = 0
    for (let s = 100; s < 600; s += 1) {
        const d = luma(snowColor(co, s + 3, 0.4)) - luma(snowColor(co, s, 0.4))
        minD = Math.min(minD, d); maxD = Math.max(maxD, d)
    }
    along = maxD - minD
    ok(`wind cords modulate the piste shade (${along.toFixed(1)} luma)`, along > 6)
    let jump = 0
    const inStripe = (x) => Math.abs(Math.abs(x) - 0.99) < 0.16
    for (let s = 60; s < 700; s += DS) {
        let prev = null
        for (let x = -1.6; x <= 1.6; x += 0.2) {
            if (inStripe(x)) { prev = null; continue }
            const c = snowColor(co, s, x)
            if (prev !== null && Math.abs(luma(c) - luma(prev)) > 42) jump++
            prev = c
        }
    }
    ok('detail keeps the piste shading continuous', jump === 0)
}

// ---- 7. sparkle: flat lit snow twinkles, rock and steep faces never ---------
{
    const co = buildCourse(0)
    let flatLit = 0, wrong = 0
    for (let s = 40; s < co.N * DS - 40; s += DS) {
        for (let x = -6; x <= 6; x += 0.5) {
            const m = sparkleMask(co, s, x)
            const inf = surfaceInfo(co, s, x)
            if (m > 0.2) flatLit++
            if (inf.rockT > 0.5 && m > 0.02) wrong++
            if (inf.grad > 0.6 && m > 0.02) wrong++
        }
    }
    ok(`sparkle covers flat lit snow only (${flatLit} pts, ${wrong} violations)`, flatLit >= 20 && wrong === 0)
    const mesh = buildTerrain(co)
    const sp = buildSparkles(co, mesh.geometry)
    ok('sparkle overlay shares terrain buffers', sp.geometry.getAttribute('position') === mesh.geometry.getAttribute('position'))
    ok('sparkle overlay is additive', sp.material.blending === 2)
}

// ---- 8. detail textures + UVs -------------------------------------------------
{
    const co = buildCourse(0)
    ok('node build: detail texture skipped without DOM', detailTexture('day') === null && sparkleTexture('day') === null)
    const mesh = buildTerrain(co)
    ok('terrain carries uv for the detail map', !!mesh.geometry.getAttribute('uv') && mesh.material.map === null)
    const uv = mesh.geometry.attributes.uv.array
    const NC = GRIDS.COLS.length
    let uMin = 1e9, uMax = -1e9, vMin = 1e9, vMax = -1e9
    for (let i = 0; i < uv.length; i += 2) {
        uMin = Math.min(uMin, uv[i]); uMax = Math.max(uMax, uv[i])
        vMin = Math.min(vMin, uv[i + 1]); vMax = Math.max(vMax, uv[i + 1])
    }
    ok(`UVs span ${Math.round(uMax - uMin)}x${Math.round(vMax - vMin)} tiles`, (uMax - uMin) > 40 && (vMax - vMin) > 60)
    ok('snowColor deterministic', JSON.stringify(snowColor(co, 321, 2.3)) === JSON.stringify(snowColor(co, 321, 2.3)))
}

// ---- 9. all themes keep sane colours ------------------------------------------
for (let c = 0; c < COURSE_COUNT; c++) {
    const co = buildCourse(c)
    let bad = 0, rockSeen = false, sparkSeen = false
    for (let s = 40; s < co.N * DS - 40; s += DS) {
        for (let x = -4; x <= 4; x += 0.5) {
            const rgb = snowColor(co, s, x)
            if (rgb.some((v) => !(v >= 0 && v <= 255))) bad++
            if (surfaceInfo(co, s, x).rockT > 0.7) rockSeen = true
            if (sparkleMask(co, s, x) > 0.1) sparkSeen = true
        }
    }
    ok(`${co.name}: colours in gamut, rock + sparkle both present`, bad === 0 && rockSeen && sparkSeen)
}

// ---- 10. still winnable --------------------------------------------------------
{
    const run = (g, maxT = 400000) => { let t = 0; while (!g.end && t < maxT) { step(g, g.phase === 'run' ? decide(g, g.riders[0]) : {}); t++ } return g }
    const g = run(makeGame('race'))
    ok(`PROVEN: autopilot wins RACE (${g.end}: ${g.why})`, g.end === 'win')
}

console.log(`${pass}/${pass + fail} ${fail ? 'FAILURES: ' + fail : 'PASS'}`)
process.exit(fail ? 1 : 0)
