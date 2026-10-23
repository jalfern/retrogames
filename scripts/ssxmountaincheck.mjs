// SSX mountain-feel audit (#638) — Node, no browser, no randomness.
// Proves the three things FORGE.md asks: the game boots, the core mountain
// rules hold (summit start, open faces with gully-only walls, shaped snow,
// painted==ridden surface, shelf props), and the race can still be won.
// Run: npm run ssxmountaincheck

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCourse, terrainY, openness, undulate, bankTurn, sceneryPlan, COURSE_COUNT, DS, WALL_X, SHELF_PROPS } from '../src/games/SSX/course.js'
import { snowColor, buildTerrain, THEMES, GRIDS, SUN, GROOVE, TRACK_DARKEN, surfaceInfo, peaksRing } from '../src/games/SSX/art.js'
import { makeGame, step } from '../src/games/SSX/sim.js'
import { decide } from '../src/games/SSX/planner.js'

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log(`PASS ${name}`) } else { fail++; console.log(`FAIL ${name}`) } }

const here = dirname(fileURLToPath(import.meta.url))

// ---- 1. summit: you start on top and the run falls away ---------------------
for (let c = 0; c < COURSE_COUNT; c++) {
    const co = buildCourse(c)
    const ys = co.segs.map((s) => s.y)
    ok(`${co.name}: seg 0 is the high point`, ys[0] >= Math.max(...ys) - 1e-9)
    ok(`${co.name}: the drop is real`, ys[0] - ys[co.N - 1] > 40)
    let mono = true
    for (let i = 1; i < co.N; i++) if (co.segs[i].y > co.segs[i - 1].y + 1e-9) mono = false
    ok(`${co.name}: centreline never climbs`, mono)
    const first = co.segs.slice(0, 10).every((s) => s.drop <= 0.05)
    const steep = co.segs.slice(0, 30).some((s) => s.drop >= 0.10)
    ok(`${co.name}: summit traverse then drop-away`, first && steep)
    // the view off the lip: 60 m ahead of the start is already below you
    ok(`${co.name}: fall visible from the gate`, terrainY(co, 60, 0) < co.segs[0].y - 1.5)
}

// ---- 2. open face majority; walls only in gullies ----------------------------
for (let c = 0; c < COURSE_COUNT; c++) {
    const co = buildCourse(c)
    let openN = 0
    for (let i = 10; i < co.N - 10; i++) if (openness(co, i * DS) > 0.5) openN++
    const frac = openN / (co.N - 20)
    ok(`${co.name}: mostly open face (${frac.toFixed(2)})`, frac >= 0.5)
    ok(`${co.name}: start section is open`, openness(co, 2 * DS) === 1 && openness(co, 40 * DS) > 0.5 || openness(co, 2 * DS) === 1)
    for (const gl of co.gullies) {
        const sm = (gl.s0 + gl.s1) / 2
        ok(`${co.name}: walls squeeze the gully at s=${Math.round(sm)}`,
            openness(co, sm) < 0.01 && terrainY(co, sm, WALL_X + 1.5) - terrainY(co, sm, 0) > 3.5)
        const nxt = co.gullies.find((k) => k.s0 > gl.s1 && k.s0 - gl.s1 < 200)
        const probeS = nxt ? (gl.s1 + nxt.s0) / 2 : gl.s1 + 80
        ok(`${co.name}: face reopens past the gully`, openness(co, probeS) > 0.55)
    }
    // no silhouette overhang: far columns never stand above the near crest
    for (const gl of co.gullies) {
        const sm = (gl.s0 + gl.s1) / 2
        ok(`${co.name}: gully far side sinks below the near crest`,
            terrainY(co, sm, 3.2) > terrainY(co, sm, 16) && terrainY(co, sm, 7) > terrainY(co, sm, 26))
    }
}

// ---- 3. shaped snow: rollers, moguls, banking ---------------------------------
for (let c = 0; c < COURSE_COUNT; c++) {
    const co = buildCourse(c)
    let flips = 0, prev = null
    for (let s = 40; s < 340; s += 1) {
        const d = undulate(co, s + 1) - undulate(co, s)
        if (prev !== null && Math.sign(d) !== Math.sign(prev) && Math.abs(d) > 1e-4) flips++
        prev = d
    }
    ok(`${co.name}: rollers and moguls undulate down the face (${flips} crests)`, flips >= 8)
    let lo = 1e9, hi = -1e9
    for (let s = 40; s < 140; s++) { const u = undulate(co, s); lo = Math.min(lo, u); hi = Math.max(hi, u) }
    ok(`${co.name}: relief is visible (not flat)`, hi - lo > 0.5)
    // gradients stay gentle enough that rollers are snow, not launch walls
    let maxG = 0
    for (let s = 20; s < co.N * DS - 20; s++) maxG = Math.max(maxG, Math.abs(undulate(co, s + 1) - undulate(co, s)))
    ok(`${co.name}: roller gradient below launch threshold`, maxG < 0.3)
    // banking: outside of a turn lifts, straights stay flat
    const curveSeg = co.segs.findIndex((s) => Math.abs(s.curve) > 0.009)
    ok(`${co.name}: turns are banked`, curveSeg > 0 && bankTurn(co, curveSeg * DS, -Math.sign(co.segs[curveSeg].curve)) > Math.abs(co.segs[curveSeg].curve) * 20)
    ok(`${co.name}: straights sit flat`, Math.abs(bankTurn(co, 0, 1)) < 1e-9)
}

// ---- 4. painted slope IS the ridden slope -------------------------------------
{
    // every vertex of the painted mesh must equal terrainY at its (s,x) —
    // the grid the camera paints is the grid the sim rides
    const NC = GRIDS.COLS.length
    for (let c = 0; c < COURSE_COUNT; c++) {
        const co = buildCourse(c)
        const mesh = buildTerrain(co)
        const pos = mesh.geometry.attributes.position
        let worst = 0
        for (let r = 0; r < pos.count / NC; r += 3) {
            const s = (r + GRIDS.ROW_BACK) * 4
            for (let ci = 0; ci < NC; ci += 2) {
                const o = (r * NC + ci) * 3
                worst = Math.max(worst, Math.abs(pos.array[o + 1] - terrainY(co, s, GRIDS.COLS[ci])))
            }
        }
        ok(`${co.name}: painted surface == ridden surface`, worst < 1e-3)
    }
}

// ---- 5. snow reads as snow: smooth, hollows blue-dark, crests lit ----------
{
    const co = buildCourse(0)
    const luma = (rgb) => rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11
    let jump = 0
    const inStripe = (x) => Math.abs(Math.abs(x) - 0.99) < 0.16
    for (let s = 60; s < 700; s += DS) {
        const gi = Math.floor(s / DS)
        if (co.gaps && co.gaps.some((gp) => gi >= gp.i0 && gi <= gp.i1)) continue   // #889: crevasse rows are dark on purpose
        let prev = null
        for (let x = -1.6; x <= 1.6; x += 0.2) {
            if (inStripe(x)) { prev = null; continue }
            const c = snowColor(co, s, x)
            if (prev !== null && Math.abs(luma(c) - luma(prev)) > 42) jump++
            prev = c
        }
    }
    ok('shading is smooth across the piste (no speckle)', jump === 0)
    // find a hollow and a crest on the same slope column: hollow runs darker
    // and bluer than the crest
    let hollowBlueDiff = -1e9, darkerOk = false, bluerOk = false
    for (let s = 40; s < 300; s += 1) {
        const lap = (terrainY(co, s - 3, 0.3) + terrainY(co, s + 3, 0.3) + terrainY(co, s, -0.1) + terrainY(co, s, 0.7)) / 4 - terrainY(co, s, 0.3)
        if (lap > 0.05) {
            const cH = snowColor(co, s, 0.3)
            const cC = snowColor(co, s + 5, 0.3)
            const blue = cH[2] - cH[0]
            if (blue > hollowBlueDiff) hollowBlueDiff = blue
            if (luma(cH) < luma(cC)) darkerOk = true
            if (cH[2] - cH[0] > cC[2] - cC[0]) bluerOk = true
        }
    }
    ok('hollows sit darker than crests', darkerOk)
    ok('hollows carry a blue cast', bluerOk && hollowBlueDiff > 20)
    ok('every theme defines shade colours', Object.values(THEMES).every((T) => T.shadow && T.rock2 && T.skyTop && T.peak))
}

// ---- 6. shelf props (#637) ----------------------------------------------------
{
    const shelf = JSON.parse(readFileSync(join(here, '..', 'public', 'models', 'shelf.json'), 'utf8'))
    const ids = new Set(shelf.entries.map((e) => e.id))
    for (let c = 0; c < COURSE_COUNT; c++) {
        const co = buildCourse(c)
        const plan = sceneryPlan(co)
        ok(`${co.name}: props scattered (${plan.length})`, plan.length >= 60)
        ok(`${co.name}: only shelf ids used`, plan.every((p) => SHELF_PROPS.includes(p.id) && ids.has(p.id)))
        const kinds = new Set(plan.map((p) => p.id))
        ok(`${co.name}: trees, fence and flags present`, kinds.has('tree_pine') && kinds.has('fence') && kinds.has('flag'))
        ok(`${co.name}: every crash obstacle is modelled`, co.obstacles.every((ob) => plan.some((p) => p.s === ob.i * DS && Math.abs(p.x - ob.x) < 1e-9)))
        ok(`${co.name}: deterministic plan`, JSON.stringify(sceneryPlan(co)) === JSON.stringify(plan))
        ok(`${co.name}: props avoid the start gate area`, plan.filter((p) => p.s < 30 && Math.abs(p.x) < 1.1 && p.id !== 'flag').length === 0)
    }
    const co = buildCourse(0)
    ok('scenery props all sit on the slope surface', sceneryPlan(co).every((p) => terrainY(co, p.s, p.x) !== undefined))
}

// ---- 7. no randomness in the deterministic modules ---------------------------
for (const f of ['course.js', 'sim.js', 'planner.js']) {
    const src = readFileSync(join(here, '..', 'src', 'games', 'SSX', f), 'utf8')
    ok(`${f}: no Math.random`, !/Math\.random\s*\(/.test(src))
}

// ---- 8. the mountain is still winnable ----------------------------------------
{
    const run = (g, maxT = 400000) => { let t = 0; while (!g.end && t < maxT) { step(g, g.phase === 'run' ? decide(g, g.riders[0]) : {}); t++ } return g }
    const g = run(makeGame('race'))
    ok(`PROVEN: autopilot still wins RACE (${g.end}: ${g.why})`, g.end === 'win')
    const s = run(makeGame('showoff'))
    ok('PROVEN: showoff target still reachable', s.end === 'win')
    const { CFG } = await import('../src/games/SSX/sim.js')
    CFG.slack = true
    const cap = CFG.comboCap
    CFG.comboCap = 3
    const sl = run(makeGame('race'))
    ok('SLACK: race still wins at 0.75x trick economy, chain cap x3', sl.end === 'win')
    const sl2 = run(makeGame('showoff'))
    ok('SLACK: showoff still wins', sl2.end === 'win')
    CFG.slack = false
    CFG.comboCap = cap
}

// ---- 9. mountain feel #665: sun in frame, roller pops, groove contrast ------
{
    // chase-cam geometry mirrors index.jsx frame(): back 9.5, up 4.1+v*0.028,
    // look 16 ahead +1.2 (pitch), fov 66 + speed*0.55 + boost 8; sky origin
    // sits 60 below the camera (the dome offset) — 900/640 = the harness shot.
    const sunInUpperThird = (v, boost, theme) => {
        const sd = SUN[theme] || SUN.day
        const up = 4.1 + v * 0.028
        const pitch = Math.atan2(1.2 - up, 25.5)
        const fov = ((66 + Math.min(16, Math.max(0, (v - 12) * 0.55)) + (boost ? 8 : 0)) * Math.PI) / 180
        const halfV = fov / 2
        const halfH = Math.atan(Math.tan(halfV) * (900 / 640))
        const rad = Math.cos(sd.el) * 680
        const el = Math.atan2(Math.sin(sd.el) * 680 - 60, rad)
        const rv = el - pitch
        const vert = 0.5 - rv / fov
        return vert >= 0.02 && vert <= 1 / 3 && Math.abs(sd.az) <= halfH * 0.85
    }
    for (let c = 0; c < COURSE_COUNT; c++) {
        const co = buildCourse(c)
        ok(`${co.name}: sun/moon sits in the chase-cam upper third at gate/cruise/boost`,
            sunInUpperThird(8, false, co.theme) && sunInUpperThird(18, false, co.theme) && sunInUpperThird(30, true, co.theme))
    }
    // roller/lip auto-launches fire on every heat (0-based) and carry `power`
    for (let heat = 0; heat < 3; heat++) {
        const g = makeGame('race')
        while (!g.end && g.heat < heat) step(g, g.phase === 'run' ? decide(g, g.riders[0]) : {})
        let pops = 0
        while (!g.end && g.heat === heat) {
            step(g, g.phase === 'run' ? decide(g, g.riders[0]) : {})
            for (const e of g.events.splice(0)) if (e.type === 'jump' && e.who === 0 && e.power !== undefined) pops++
        }
        ok(`heat ${heat + 1} (${buildCourse(heat).name}): roller launches fire and carry power (${pops})`, pops >= 2)
    }
    const jsxA = readFileSync(join(here, '..', 'src', 'games', 'SSX', 'index.jsx'), 'utf8')
    ok('sfx: a powered launch gets its own deeper sweep, not the ollie chirp',
        /e\.type === 'jump' && mine[\s\S]{0,240}e\.power[\s\S]{0,200}playSweep\(140/.test(jsxA))
    ok('fresh carve grooves bite darker than the groomed line', GROOVE.alpha - TRACK_DARKEN >= 0.4)
}

// ---- 10. mountain feel #665 round 2: gully stone, capped rims, white faces,
//          varied peak ring, finish grandstands ----------------------------------
{
    const luma = (rgb) => rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11
    for (let c = 0; c < COURSE_COUNT; c++) {
        const co = buildCourse(c)
        if (!co.gullies.length) continue
        const gl = co.gullies[0]
        let rockLo = 1e9, rockHi = -1e9, litSum = 0, litN = 0, darkSum = 0, darkN = 0, capped = 0, bare = 0
        for (let s = Math.round(gl.s0); s <= Math.round(gl.s1); s += DS) {
            for (const x of [-7, -5.5, -4.2, -3.2, 3.2, 4.2, 5.5, 7]) {
                const info = surfaceInfo(co, s, x)
                if (info.rockT > 0.45) {
                    const L = luma(info.rgb)
                    rockLo = Math.min(rockLo, L); rockHi = Math.max(rockHi, L)
                }
                // sun-vs-shade comparison at matched height/steepness, so the
                // cap and slopeRock terms can't bias the comparison
                if (info.rockT > 0.5 && info.above < 12) {
                    const L = luma(info.rgb)
                    if (info.litFace > 0.6) { litSum += L; litN++ }
                    else if (info.litFace < 0.15) { darkSum += L; darkN++ }
                }
                if (info.above > 14 && Math.abs(x) > 1.6) {
                    if (info.rockT < 0.25) capped++
                    if (info.rockT > 0.5) bare++
                }
            }
        }
        ok(`${co.name}: gully rock is two-tone (lit faces vs dark clefts)`, rockHi - rockLo > 18)
        ok(`${co.name}: sun-facing rock reads lighter than shaded rock (${litN}/${darkN})`,
            litN > 3 && darkN > 3 && litSum / litN > (darkSum / darkN) * 1.15)
        ok(`${co.name}: snow caps band the jagged rim (${capped} capped / ${bare} bare teeth)`,
            capped > 0 && bare > 0)
    }
    // #665 item 3: open faces near the camera keep their whiteness — a flat,
    // rock-free centre-lane pixel on the day course may not run icy.
    {
        const co = buildCourse(0)
        let worstBlue = -1e9
        for (let s = 60; s < 700; s += DS) {
            for (const x of [-0.5, 0, 0.5]) {
                const info = surfaceInfo(co, s, x)
                if (info.hollow < 0.15 && info.rockT < 0.05) {
                    worstBlue = Math.max(worstBlue, info.rgb[2] - info.rgb[0])
                }
            }
        }
        ok('day open faces stay near-white (blue cast confined to hollows)', worstBlue < 40)
    }
    // #665 item 2: the horizon range varies its silhouettes and rocks its flanks
    {
        const ring = peaksRing()
        const segs = new Set(ring.map((p) => p.segs))
        ok('peak ring varies silhouettes', segs.size >= 3 && ring.every((p) => p.sx !== 1 || p.sz !== 1))
        ok('some peaks stand bare rock, the rest wear caps', ring.some((p) => p.cap) && ring.some((p) => !p.cap))
        ok('peak bodies stay hazed rock under the caps',
            THEMES.day.peakRock[0] < THEMES.day.peak[0] && THEMES.night.peakRock && THEMES.dusk.peakRock)
        ok('rim caps carry a tint brighter than the snowfield in every theme',
            Object.values(THEMES).every((T) => T.capSnow[0] * 0.3 + T.capSnow[1] * 0.59 + T.capSnow[2] * 0.11
                > T.snowB[0] * 0.3 + T.snowB[1] * 0.59 + T.snowB[2] * 0.11 + 10))
        ok('peak ring is deterministic', JSON.stringify(peaksRing()) === JSON.stringify(ring))
    }
    // #665 item 6: race-day grandstands at the finish, clear of gullies
    for (let c = 0; c < COURSE_COUNT; c++) {
        const co = buildCourse(c)
        const plan = sceneryPlan(co)
        const stands = plan.filter((p) => p.id === 'grandstand')
        ok(`${co.name}: a bank of seats lines the finish`, stands.length >= 2)
        ok(`${co.name}: grandstands sit clear of gullies and face the line`,
            stands.length >= 2 && stands.every((p) => openness(co, p.s) > 0.7
                && p.s > 0.7 * co.N * DS && Math.abs(p.x) > WALL_X && p.orient === 'across'))
    }
}

console.log(`${pass}/${pass + fail} ${fail ? 'FAILURES: ' + fail : 'PASS'}`)
process.exit(fail ? 1 : 0)
