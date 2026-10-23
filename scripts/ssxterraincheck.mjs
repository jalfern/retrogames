// SSX surface audit (#669) — Node, no browser, no randomness.
// Proves: the game boots, the surface rules hold (rock revealed by slope and
// ridge height, snow settled on ledges, wind cords present, sparkle only on
// flat lit snow, detail UVs tile deterministically, painted==ridden untouched),
// and the mountain is still winnable. Run: npm run ssxterraincheck

import { buildCourse, terrainY, featureLift, openness, outcropAt, gapAt, GAP_DEPTH, GAP_X, chuteAt, COURSE_COUNT, DS } from '../src/games/SSX/course.js'
import { snowColor, surfaceInfo, slopeAt, sparkleMask, buildTerrain, buildSparkles, detailTexture, sparkleTexture, GRIDS, rockStrata, cpuSprayCount, landingSound, carveVoice, rimJagPlan, SPARKLE_PULSE, GROOVE, speedStreakK } from '../src/games/SSX/art.js'
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
    // (#889: sweep every gully — six mountains carry more wall than the first)
    const hues = new Set()
    for (const gk of co.gullies) {
        const sm2 = (gk.s0 + gk.s1) / 2
        for (let x = 2; x <= 6; x += 0.25) {
            const rgb = snowColor(co, sm2, x)
            hues.add(`${Math.round(rgb[0] / 8)}:${Math.round(rgb[1] / 8)}`)
        }
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
            if (inf.rawRock > 0.5 && inf.relax > 0.4) {
                ledges++
                if (inf.rockT > inf.rawRock * 0.62) ledgesOk = false
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
        const gi = Math.floor(s / DS)
        if (gapAt(co, s) || co.gaps.some((gp) => gi >= gp.i0 && gi <= gp.i1)) continue   // #889: a crevasse row is dark on purpose
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

// ---- 10. #685 surfaces polish -----------------------------------------------
{
    // coarse strata carried in the rock colour: the 1-3 m fracture/bedding
    // motifs wash out under mipmapping; ~18 m slabs keep cliffs broken in the
    // chase-cam distance
    const co = buildCourse(0)
    const xs = []
    for (let s = 0; s <= 600; s++) xs.push(rockStrata(s, 4.5))
    const peaks = []
    for (let i = 1; i < xs.length; i++) if (xs[i] >= 0.9 && xs[i - 1] < 0.9) peaks.push(i)
    const gaps = peaks.slice(1).map((p, i) => p - peaks[i])
    const meanGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
    ok(`rock strata coarse: ${peaks.length} slabs, mean ${meanGap.toFixed(0)} m`, peaks.length >= 4 && meanGap >= 12)
    const slabs = new Set()
    let rockPts = 0
    // #889: the mountain is longer and carries more walls — sample every
    // gully's cliff foot at two columns, not one lucky phase of the first.
    for (const gl of co.gullies) {
        const gm = (gl.s0 + gl.s1) / 2
        for (const xw of [3.5, 4.5]) {
            for (let s = gm - 90; s <= gm + 90; s += 6) {
                if (surfaceInfo(co, s, xw).rockT > 0.5) { rockPts++; slabs.add(Math.round(luma(snowColor(co, s, xw)) / 9)) }
            }
        }
    }
    ok(`cliff keeps slab bands along the run (${slabs.size} tones / ${rockPts} pts)`, rockPts >= 10 && slabs.size >= 3)
}
{
    // night: rock separates from blue shadowed snow — warm-cast slabs against
    // moonlit blue, clearly darker too (the blue-on-blue read is fixed)
    const co = buildCourse(0)
    co.theme = 'night'
    let nR = 0, rockBR = 0, rockL = 0, nS = 0, snowBR = 0, snowL = 0
    for (let s = 120; s < co.N * DS - 40; s += DS) {
        for (const x of [4, 5, -4, -5]) {
            const inf = surfaceInfo(co, s, x)
            if (inf.rockT > 0.7) { nR++; rockBR += inf.rgb[2] - inf.rgb[0]; rockL += luma(inf.rgb) }
        }
        for (const x of [-0.5, 0, 0.5]) {
            const rgb = snowColor(co, s, x)
            nS++; snowBR += rgb[2] - rgb[0]; snowL += luma(rgb)
        }
    }
    const rBR = nR ? rockBR / nR : 999, sBR = nS ? snowBR / nS : 0
    const rL = nR ? rockL / nR : 999, sL = nS ? snowL / nS : 0
    ok(`night rock reads warm against blue snow (rock b-r ${rBR.toFixed(0)} vs snow ${sBR.toFixed(0)})`,
        nR >= 8 && sBR >= 60 && rBR <= sBR - 30)
    ok(`night rock stays darker than moonlit snow (${rL.toFixed(0)} vs ${sL.toFixed(0)})`, rL * 2 <= sL)
    co.theme = 'day'
}
{
    // per-facet sparkle: two layers, independent dot fields + decorrelated pulse
    const co = buildCourse(0)
    ok('sparkle pulses decorrelated (per-facet phase)', SPARKLE_PULSE.length === 2
        && Math.abs(SPARKLE_PULSE[0].rate - SPARKLE_PULSE[1].rate) >= 0.02
        && SPARKLE_PULSE[0].seed !== SPARKLE_PULSE[1].seed)
    const mesh = buildTerrain(co)
    const sp0 = buildSparkles(co, mesh.geometry, 0)
    const sp1 = buildSparkles(co, mesh.geometry, 1)
    ok('layer-2 sparkle is additive with its own base', sp1.material.blending === 2 && sp0.material.opacity !== sp1.material.opacity)
    let bothLit = 0, onlyOne = 0
    for (let s = 40; s < co.N * DS - 40; s += DS) {
        for (let x = -4; x <= 4; x += 0.5) {
            const m0 = sparkleMask(co, s, x, 0), m1 = sparkleMask(co, s, x, 1)
            if (m0 > 0.15 && m1 > 0.15) bothLit++
            if ((m0 > 0.15) !== (m1 > 0.15)) onlyOne++
        }
    }
    ok(`layers light different facets (${onlyOne} exclusive pts of ${bothLit + onlyOne})`, onlyOne >= 10)
}
{
    // CPU riders kick spray; airborne/slow/straight riders never do
    ok('cpu spray: carving kicks, air/slow/straight do not',
        cpuSprayCount({ air: false, tumble: 0, v: 14, steerSm: 0.6 }) >= 1
        && cpuSprayCount({ air: true, tumble: 0, v: 14, steerSm: 0.6 }) === 0
        && cpuSprayCount({ air: false, tumble: 0, v: 6, steerSm: 0.6 }) === 0
        && cpuSprayCount({ air: false, tumble: 0, v: 14, steerSm: 0.2 }) === 0)
    const g = makeGame('race')
    let sprayTicks = 0
    for (let t = 0; t < 20000 && !g.end; t++) {
        step(g, g.phase === 'run' ? decide(g, g.riders[0]) : {})
        for (let i = 1; i < g.riders.length; i++) if (cpuSprayCount(g.riders[i]) > 0) sprayTicks++
    }
    ok(`the CPU field cuts powder (${sprayTicks} rider-ticks)`, sprayTicks >= 100)
}
{
    // landing voice: crusty steep ground snaps, soft ground thuffs
    const crust = landingSound(0.5, 16), powder = landingSound(0.12, 16)
    ok('crust vs powder landing split', crust.crust && !powder.crust
        && crust.dur < powder.dur && crust.vol > powder.vol && !!crust.swish && !powder.swish)
    let icy = 0, soft = 0
    const co = buildCourse(0)
    for (let s = 120; s < co.N * DS - 40; s += DS) {
        for (const x of [2.5, -2.5, 3.5, -3.5]) {
            if (slopeAt(co, s, x) > 0.34) icy++; else soft++
        }
    }
    ok('both landing surfaces occur on the mountain', icy > 0 && soft > 0)
}
{
    // #791 carve voice: icy crust swishes brighter, thinner and louder than powder
    const ice = carveVoice(0.5, 16, 0.7), powder = carveVoice(0.12, 16, 0.7)
    ok('crust vs powder carve: icy swishes brighter, shorter, louder',
        ice.icy && !powder.icy
        && ice.cutoff > powder.cutoff && ice.dur < powder.dur && ice.vol > powder.vol)
    ok('carve cutoff rises monotonically with slope',
        carveVoice(0.3, 16, 0.7).cutoff > carveVoice(0.25, 16, 0.7).cutoff
        && carveVoice(0.45, 16, 0.7).cutoff > carveVoice(0.3, 16, 0.7).cutoff
        && carveVoice(0.6, 16, 0.7).cutoff > carveVoice(0.45, 16, 0.7).cutoff)
    ok('carve swish still scales with speed and pressure on both surfaces',
        carveVoice(0.12, 24, 0.7).cutoff > carveVoice(0.12, 10, 0.7).cutoff
        && carveVoice(0.12, 16, 0.9).vol > carveVoice(0.12, 16, 0.5).vol
        && carveVoice(0.5, 24, 0.9).cutoff > carveVoice(0.5, 10, 0.5).cutoff)
    ok('carve voice stays bounded',
        carveVoice(1.4, 38, 1).vol <= 0.1 && carveVoice(0, 8, 0.5).cutoff >= 650
        && carveVoice(1.4, 38, 1).dur >= 0.069 && carveVoice(1.4, 38, 1).icyT === 1)
    let icier = 0, softer = 0
    const co = buildCourse(0)
    for (let s = 120; s < co.N * DS - 40; s += DS) {
        for (const x of [0, 1.2, -1.2, 2.2, -2.2]) {
            if (carveVoice(slopeAt(co, s, x), 16, 0.7).icy) icier++; else softer++
        }
    }
    ok(`both carve surfaces occur on the mountain (${icier} icy / ${softer} powder)`, icier > 0 && softer > icier)
}
{
    // rim jag skyline: shards only stand on high rock rims, bounded count
    for (let c = 0; c < COURSE_COUNT; c++) {
        const co = buildCourse(c)
        const plan = rimJagPlan(co)
        let high = plan.filter((j) => surfaceInfo(co, j.s, j.x).above > 10).length
        ok(`${co.name}: rim jags break the skyline (${plan.length}, all high=${high === plan.length})`,
            plan.length >= 12 && plan.length <= 240 && high === plan.length)
    }
}
{
    ok('carve grooves carry a packed-snow albedo lip', GROOVE.lipAlpha > 0 && GROOVE.lipAlpha < GROOVE.alpha
        && GROOVE.lipColor.length === 3 && GROOVE.lipColor !== GROOVE.color)
}

// ---- 10b. #844 outcrops: authored stretches of exposed rock face ----------
{
    // inside a span the authored side carries a wide banded rock face — far
    // more rock than the mirrored ground outside the spans, which keeps its
    // open snow shoulder; the band eases, never snaps
    for (let c = 0; c < COURSE_COUNT; c++) {
        const co = buildCourse(c)
        let okAll = co.outcrops.length > 0
        for (const oc of co.outcrops) {
            let inRock = 0, n = 0, inSum = 0, outSum = 0
            for (let s = oc.s0 + 30; s <= oc.s1 - 30; s += DS) {
                for (let x = 2.2; x <= 5; x += 0.7) {
                    n++
                    const ri = surfaceInfo(co, s, oc.side * x).rockT
                    inSum += ri; if (ri > 0.5) inRock++
                    outSum += surfaceInfo(co, s, -oc.side * x).rockT
                }
            }
            if (n === 0 || inRock < n * 0.35 || inSum / n < outSum / n + 0.15) okAll = false
        }
        ok(`${co.name}: outcrops expose a rock face on their side`, okAll)
    }
    const co = buildCourse(0)
    let worstStep = 0
    for (let s = 0; s < co.N * DS; s += 1) worstStep = Math.max(worstStep, Math.abs(outcropAt(co, s + 1).w - outcropAt(co, s).w))
    ok('outcrop weight eases along the run (no hard edges)', worstStep <= 0.2)
    let sparkKillOk = true
    for (const oc of co.outcrops) {
        for (let s = oc.s0 + 30; s <= oc.s1 - 30; s += DS) {
            for (const x of [2.6, 3.3, 4]) {
                if (surfaceInfo(co, s, oc.side * x).rockT > 0.6 && sparkleMask(co, s, oc.side * x) > 0.02) sparkKillOk = false
            }
        }
    }
    ok('outcrop rock kills the sparkle', sparkKillOk)
}

// ---- 12. #911 crevasse ice + chute lane ---------------------------------------
{
    const luma = (rgb) => rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11
    const blueR = (rgb) => rgb[2] - rgb[0]
    // the canyon gaps ring rock walls and outcrops can sit beside a chute, so a
    // single fixed reference offset lands on stone — the "surrounding snow"
    // reference is the brightest open-snow sample in a small fan (rockT keeps
    // the walls out). The property is unchanged: floor/lane vs the snow that
    // actually borders them.
    const snowRef = (co, s, xs) => {
        let best = null
        for (const x of xs) {
            const o = surfaceInfo(co, s, x)
            if (o.rockT < 0.5 && (!best || luma(o.rgb) > luma(best.rgb))) best = o
        }
        return best
    }
    let wallIce = 0, crest = 0, fade = 0, icePin = 0, nGaps = 0
    for (let ci = 0; ci < COURSE_COUNT; ci++) {
        const co = buildCourse(ci)
        for (const gp of co.gaps) {
            const s = ((gp.i0 + gp.i1) / 2) * DS
            const wall = surfaceInfo(co, s, 1.07)      // wall column, under the crest line
            const line = surfaceInfo(co, s, GAP_X)    // the danger-edge crest
            const below = surfaceInfo(co, s, 1.02)    // wall falling into the floor
            const skirt = surfaceInfo(co, s, 1.30)    // wall easing to the rim
            const holeFloor = surfaceInfo(co, s, 0.4) // the sink floor
            const rim = surfaceInfo(co, s, 2.2)       // open snow beyond the gap
            const ref = snowRef(co, s, [1.30, -1.30, 2.2, -2.2, 2.7, -2.7])
            if (blueR(wall.rgb) > blueR(rim.rgb) + 8) wallIce++
            if (luma(line.rgb) > luma(below.rgb) + 25 && luma(line.rgb) > luma(skirt.rgb) + 8) crest++
            if (ref && luma(holeFloor.rgb) < luma(line.rgb) - 20 && luma(holeFloor.rgb) < luma(ref.rgb) - 40) fade++
            if (holeFloor.iceT > 0.1 && line.iceT > 0.9 && rim.iceT === 0) icePin++
            nGaps++
        }
    }
    ok(`crevasse walls read as ice, not flat dark snow (${wallIce}/${nGaps})`, nGaps >= 5 && wallIce === nGaps)
    ok(`the snow lip crests at the danger line (${crest}/${nGaps})`, nGaps >= 5 && crest === nGaps)
    ok(`the hole floor fades cold-dark with depth (${fade}/${nGaps})`, nGaps >= 5 && fade === nGaps)
    ok(`ice rides the sink, not the rim (${icePin}/${nGaps})`, nGaps >= 5 && icePin === nGaps)

    let laneOk = 0, nChutes = 0
    for (let ci = 0; ci < COURSE_COUNT; ci++) {
        const co = buildCourse(ci)
        for (const ch of co.chutes) {
            const sMid = ((ch.i0 + ch.i1) / 2) * DS
            const laneC = surfaceInfo(co, sMid, ch.x).rgb
            const side = snowRef(co, sMid, [ch.x + ch.w + 0.6, ch.x + ch.w + 1.2, ch.x - ch.w - 0.6, ch.x - ch.w - 1.2])
            if (side && luma(laneC) < luma(side.rgb) - 10 && laneC[2] >= laneC[0]) laneOk++
            nChutes++
        }
    }
    ok(`the express trough wears a packed-snow lane (${laneOk}/${nChutes})`, nChutes >= 8 && laneOk === nChutes)

    const co = buildCourse(0)
    const gp = co.gaps[0]
    const s = ((gp.i0 + gp.i1) / 2) * DS
    ok('sparkle dies in the crevasse ice', sparkleMask(co, s, 0.4) < 0.05 && sparkleMask(co, s, GAP_X) < 0.05)
    ok('streak law: the chute lights streaks at pace where nothing else does',
        speedStreakK(70, false, true) > 0.8 && speedStreakK(70, false, false) === 0 && speedStreakK(110, false, false) > 0)
    ok('streak law: a held boost still lifts the field', speedStreakK(70, true, false) > speedStreakK(70, false, false))
}

// ---- 11. still winnable --------------------------------------------------------
{
    const run = (g, maxT = 400000) => { let t = 0; while (!g.end && t < maxT) { step(g, g.phase === 'run' ? decide(g, g.riders[0]) : {}); t++ } return g }
    const g = run(makeGame('race'))
    ok(`PROVEN: autopilot wins RACE (${g.end}: ${g.why})`, g.end === 'win')
}

console.log(`${pass}/${pass + fail} ${fail ? 'FAILURES: ' + fail : 'PASS'}`)
process.exit(fail ? 1 : 0)
