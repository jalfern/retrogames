// cometcheck — COMET DRIFT GP's Node gate (no browser, ~10 s).
//
// Every CIRCUIT in the course pack (#493) is audited as DATA before anyone
// drives (min radius, no self-crossing road, checkpoint gates on the road),
// and every CIRCUIT is WON, in Node, by the same autopilot the attract demo
// replays — from P7, on several seeds (the field must be beatable, not a
// procession). Then the shared machine: the lap gate is honest (an infield cut
// that skips the checkpoints must NOT bank a lap — and --mutate breaks that
// gate to prove this file can see it); the drift ladder pays; the rivals
// err; the machine is deterministic per course + seed.
//
// `npm run cometcheck` must be GREEN; `npm run cometcheck -- --mutate`
// must go RED (and restore the file whatever happens).

import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { deflateSync } from 'node:zlib'
import { REFERENCES, bestShapeDistance, normalize, resample, shapeDistance } from '../src/games/CometDrift/reference.js'

const SIM = new URL('../src/games/CometDrift/sim.js', import.meta.url)
const TRACKMOD = '../src/games/CometDrift/track.js'

const Tmod = await import(TRACKMOD)
const { COURSES, selectCourse } = Tmod

const R = { fail: 0 }
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  (' + detail + ')' : ''}`)
    if (!ok) R.fail++
}

const ccw = (px, py, qx, qy, rx, ry) => (rx - px) * (qy - py) - (qx - px) * (ry - py)

// ---- minimal PNG writer (RGB8, no deps) + reference|game side-by-side -------
const CRC_TABLE = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
    return t
})()
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function pngChunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
}
function writePNG(path, w, h, rgb) {
    const raw = Buffer.alloc((w * 3 + 1) * h)
    let o = 0
    for (let y = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w * 3; x++) raw[o++] = rgb[y * w * 3 + x] }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0)),
    ])
    writeFileSync(path, png)
}

// map normalised [0,1] points into a panel rect and stamp the polyline
function strokePoly(img, w, pts, ox, oy, pw, ph, col) {
    const px = (p) => [Math.round(ox + p[0] * pw), Math.round(oy + (1 - p[1]) * ph)]
    const set = (x, y) => { if (x < 0 || y < 0 || x >= w) return; const i = (y * w + x) * 3; img[i] = col[0]; img[i + 1] = col[1]; img[i + 2] = col[2] }
    const closed = [...pts, pts[0]]
    for (let k = 0; k < closed.length - 1; k++) {
        let [x0, y0] = px(closed[k]); const [x1, y1] = px(closed[k + 1])
        const dx = Math.abs(x1 - x0); const dy = Math.abs(y1 - y0); const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1
        let err = dx - dy
        for (let guard = 0; guard < 4096; guard++) {
            for (let t = -1; t <= 1; t++) set(x0, y0 + t)
            if (x0 === x1 && y0 === y1) break
            const e2 = 2 * err
            if (e2 > -dy) { err -= dy; x0 += sx }
            if (e2 < dx) { err += dx; y0 += sy }
        }
    }
}

function drawSideBySide(path, refPts, gamePts) {
    const P = 200; const GAP = 24; const PAD = 16
    const w = PAD * 2 + P * 2 + GAP; const h = PAD * 2 + P
    const img = new Uint8Array(w * h * 3).fill(0xf2)
    strokePoly(img, w, resample(normalize(refPts), 240), PAD, PAD, P, P, [0x90, 0x90, 0x90])
    strokePoly(img, w, resample(normalize(gamePts), 240), PAD + P + GAP, PAD, P, P, [0x3a, 0x32, 0x44])
    writePNG(path, w, h, img)
    return path
}

const loadSim = async () => {
    const m = await import('../src/games/CometDrift/sim.js' + '?c=' + Math.random())
    return m
}

// ---- per-course audits ------------------------------------------------------
for (const c of COURSES) {
    selectCourse(c.id)
    selectCourse(c.id)
    const T = Tmod.TRACK
    const CHECKPOINTS = Tmod.CHECKPOINTS
    console.log(`— circuit ${c.id} (data audit) —`)
    let minR = Infinity; let minI = 0
    for (let i = 0; i < T.N; i++) {
        const k = Math.abs(T.pts[i].k)
        if (k > 1e-9 && 1 / k < minR) { minR = 1 / k; minI = i }
    }
    // #542: brakeable, not spin-able. The grown world tripled every radius;
    // the signature hairpins were pulled back to ~105px so the tightest
    // corners stay braking corners (>=95 keeps them out of the crawl where a
    // one-tick steering error means a spin).
    check(`${c.id}: drivable — min radius >= 95 (braking corners, not spin corners #542)`, minR >= 95, `minR ${minR.toFixed(0)} at s=${T.pts[minI].s.toFixed(0)}`)
    const LEN3 = { gulch: 4124, sandbank: 6166, corkscomb: 8330 }
    check(`${c.id}: laps roughly 3x longer (#542 grew the world to 8192)`, T.len >= LEN3[c.id] * 2.2, `len ${T.len.toFixed(0)} (was ${LEN3[c.id]})`)

    const HALF = T.WALL_R + 16
    let crossings = 0
    for (let i = 0; i < T.N; i += 2) {
        for (let j = 0; j < T.N; j += 2) {
            if (i === j) continue
            let arc = Math.abs(T.pts[j].s - T.pts[i].s)
            arc = Math.min(arc, T.len - arc)
            if (arc < 750) continue
            const A = T.pts[i]; const B = T.pts[j]
            if (Math.hypot(A.x - B.x, A.y - B.y) > HALF * 2 + 40) continue
            const ax = Math.cos(A.a + Math.PI / 2); const ay = Math.sin(A.a + Math.PI / 2)
            const bx = Math.cos(B.a + Math.PI / 2); const by = Math.sin(B.a + Math.PI / 2)
            const x1 = A.x - ax * HALF; const y1 = A.y - ay * HALF; const x2 = A.x + ax * HALF; const y2 = A.y + ay * HALF
            const x3 = B.x - bx * HALF; const y3 = B.y - by * HALF; const x4 = B.x + bx * HALF; const y4 = B.y + by * HALF
            if (ccw(x1, y1, x2, y2, x3, y3) * ccw(x1, y1, x2, y2, x4, y4) < 0 &&
                ccw(x3, y3, x4, y4, x1, y1) * ccw(x3, y3, x4, y4, x2, y2) < 0) crossings++
        }
    }
    check(`${c.id}: road never crosses itself`, crossings === 0, `${crossings} crossings`)
    const nearestPt = (arc) => {
        let bp = T.pts[0]; let bd = Infinity
        for (const p of T.pts) { const d = Math.abs(p.s - arc); if (d < bd) { bd = d; bp = p } }
        return { p: bp, d: bd }
    }
    check(`${c.id}: 4 checkpoint gates, every gate on the road`,
        CHECKPOINTS.length === 4 && CHECKPOINTS.every((arc) => {
            const { p, d } = nearestPt(arc)
            // #542: the grown track has ~30px sample spacing — the nearest
            // polyline point to a gate fraction is up to half a step away.
            return d <= 24 && Tmod.surfaceAt(p.x, p.y).surf === 'road'
        }), `${CHECKPOINTS.join(',')}`)
    check(`${c.id}: start/finish sits on the centerline (line on asphalt)`,
        T.pts[0].s === 0 && Tmod.surfaceAt(T.pts[0].x, T.pts[0].y).surf === 'road')

    // #518: the course goes up and down. The profile is closed (no step at the
    // lap line), sits on the 0 datum at the start, and stays arcade-steep.
    let hmin = Infinity; let hmax = -Infinity
    for (const p of T.pts) { hmin = Math.min(hmin, p.h); hmax = Math.max(hmax, p.h) }
    check(`${c.id}: elevation — the lap goes up and down (>= 25px of relief)`, hmax - hmin >= 25, `${(hmax - hmin).toFixed(0)}px (${hmin.toFixed(0)}..${hmax.toFixed(0)})`)
    check(`${c.id}: elevation — start/finish is the flat datum (h=0)`, Math.abs(T.pts[0].h) < 1e-9, T.pts[0].h.toFixed(4))
    check(`${c.id}: elevation — height is continuous across the lap seam`, Math.abs(T.pts[T.N - 1].h - T.pts[0].h) <= 1.5, `${T.pts[T.N - 1].h.toFixed(2)} -> ${T.pts[0].h.toFixed(2)}`)
    check(`${c.id}: elevation — grades capped at 9.5%`, T.maxGrade <= 0.0951, `max ${T.maxGrade.toFixed(3)}`)

    // #518: gravity is real in the sim — same throttle, same surface: the
    // downhill section must outrun the uphill one within the same tick budget.
    {
        const sv = await loadSim()
        const up = T.pts.find((p) => p.grade >= 0.045)
        const dn = T.pts.find((p) => p.grade <= -0.045)
        const runAt = (p) => {
            const gg = sv.makeGame(2)
            gg.phase = 'race'
            const Q = gg.karts[0]
            Q.v = 5; Q.lapStart = -999
            for (let i = 0; i < 40; i++) {
                Q.x = p.x; Q.y = p.y; Q.a = p.a; Q.idx = p.i; Q.hint = p.i
                sv.step(gg, { u: true })
            }
            return Q.v
        }
        const vd = runAt(dn); const vu = runAt(up)
        check(`${c.id}: gravity — flat-out downhill outruns uphill on the same slope law`, vd - vu >= 0.6, `v down ${vd.toFixed(2)} vs up ${vu.toFixed(2)}`)
    }

    // #513: the layout must actually follow its reference circuit. Normalise the
    // game centerline and the map centreline to the same box; mean point-to-point
    // distance (both ways, best of direct/mirror) must stay under 3% of the box.
    if (REFERENCES[c.id]) {
        const ref = REFERENCES[c.id]
        const gamePts = T.pts.map((p) => [p.x, p.y])
        const d = bestShapeDistance(gamePts, ref.pts)
        check(`${c.id}: layout follows ${ref.name} (avg distance <= 3% of box)`,
            d <= 0.03, `${(d * 100).toFixed(2)}%`)
        // average distance alone forgives a missing lobe; cap the worst local
        // deviation too, so signature features cannot be quietly smoothed away
        const WORST_CAP = { sandbank: 0.12, corkscomb: 0.18 }
        const A = resample(normalize(ref.pts), 240)
        const G = resample(normalize(gamePts), 240)
        const dm2 = shapeDistance(gamePts, ref.pts.map(([x, y]) => [1 - x, y]))
        const Ar = d <= dm2 ? A : A.map(([x, y]) => [1 - x, y])
        let worst = 0
        for (const [x, y] of Ar) {
            let m = Infinity
            for (const [gx, gy] of G) { const dd = Math.hypot(x - gx, y - gy); if (dd < m) m = dd }
            if (m > worst) worst = m
        }
        check(`${c.id}: no route feature is smoothed away (worst local distance <= ${100 * WORST_CAP[c.id]}%)`,
            worst <= WORST_CAP[c.id], `worst ${(worst * 100).toFixed(1)}%`)
        const png = new URL(`../docs/comet-ref-${c.id}.png`, import.meta.url)
        drawSideBySide(png, ref.pts, gamePts)

        // #513: the slow corners are real braking corners — the autopilot must
        // shed speed well below flat-out to make them (and still win, below).
        const sim = await loadSim()
        const g = sim.makeGame(0)
        let minV = Infinity; let n = 0
        while (!g.end && n < 60 * 300) { sim.step(g, sim.decide(g)); if (g.phase === 'race') minV = Math.min(minV, g.karts[0].v); n++ }
        check(`${c.id}: autopilot brakes for the slow corners (min v < 5.5)`, minV < 5.5, `min v ${minV.toFixed(2)}`)
    }

    const sim = await loadSim()
    const race = (seed) => {
        const g = sim.makeGame(seed)
        let n = 0
        while (!g.end && n < 60 * 300) { sim.step(g, sim.decide(g)); n++ }
        return g
    }
    console.log(`— ${c.id}: the win (autopilot from P7) —`)
    const results = []
    for (const seed of [0, 7, 9, 42]) {
        const g = race(seed)
        const P = g.karts[0]
        results.push({ seed, end: g.end, place: P.place, laps: P.lap })
        check(`${c.id} seed ${seed}: autopilot wins the ${sim.LAPS}-lap GP from P7`, g.end === 'win' && P.place === 1 && P.lap === sim.LAPS,
            `end=${g.end} place=${P.place} lap=${P.lap}`)
        check(`${c.id} seed ${seed}: game binds the selected course`, g.course === c.id, g.course)
    }
    check(`${c.id}: drift ladder pays in a REAL race, not just the treadmill (apex grace, #471)`, (() => {
        const g = sim.makeGame(3)
        const banked = [0, 0, 0]
        let n = 0
        while (!g.end && n < 60 * 300) {
            sim.step(g, sim.decide(g))
            for (const ev of g.events.splice(0)) if (ev.e === 'boost' && ev.who === 'COMET') banked[ev.tier]++
            n++
        }
        return banked[0] + banked[1] + banked[2] >= 3 && banked[2] >= 1
    })(), (() => {
        const g = sim.makeGame(3)
        const banked = [0, 0, 0]
        let n = 0
        while (!g.end && n < 60 * 300) {
            sim.step(g, sim.decide(g))
            for (const ev of g.events.splice(0)) if (ev.e === 'boost' && ev.who === 'COMET') banked[ev.tier]++
            n++
        }
        return `banked ${banked[0]} blue, ${banked[1]} violet, ${banked[2]} gold`
    })())
    check(`${c.id}: field is a race, not a procession: top rival within 6 s of the win`, (() => {
        const g = race(7)
        const finishers = g.karts.filter((k) => k.finished)
        return finishers.length >= 2 ? finishers[1].finishT - finishers[0].finishT <= 360 : finishers.length === 1
    })(), (() => { const g = race(7); const f = g.karts.filter((k) => k.finished); return f.length > 1 ? `gap ${((f[1].finishT - f[0].finishT) / 60).toFixed(1)}s` : 'field lapped' })())
    check(`${c.id}: rivals make seeded mistakes (spin/wide events)`, (() => {
        let errs = 0
        for (const s of [0, 7, 9, 42]) {
            const g = sim.makeGame(s)
            let n = 0
            while (!g.end && n < 60 * 300) {
                sim.step(g, sim.decide(g)); n++
                errs += g.events.filter((ev) => ev.e === 'spin' && ev.who !== 'COMET').length
            }
        }
        return errs > 0
    })())

    console.log(`— ${c.id}: the lap gate (infield-cut probe) —`)
    {
        const m = await loadSim()
        const g = m.makeGame(3)
        g.phase = 'race'
        const P = g.karts[0]
        const p = T.pts[T.N - 8]
        P.x = p.x; P.y = p.y; P.a = p.a; P.idx = T.N - 8; P.hint = T.N - 8; P.v = 8; P.cp = 0; P.lap = 0
        // #426 fix: the grown world made this probe coast ~240px short of the
        // line, so even the gateless mutant banked nothing and the probe was
        // blind. Throttle it across the line: cp stays 0, no lap may bank.
        for (let i = 0; i < 90; i++) m.step(g, { u: true })
        check(`${c.id}: cutting the line without checkpoints banks NO lap`, P.lap === 0, `lap ${P.lap}, s ${T.pts[P.idx].s.toFixed(0)}/${T.len.toFixed(0)}`)
    }

    console.log(`— ${c.id}: the drift ladder —`)
    {
        // pin the ladder test on the circuit's LONGEST gentle FAST sweeper (the
        // banked loop of Daytona/Laguna, r ~700–3300 post-#542): throttle holds flat-out
        // there, so a held drift can run the whole arc and bank the gold comet.
        // A fixed index is wrong once the layouts are reference-shaped (#513).
        let bi = 0; let bbest = 0; let bcur = 0; let bstart = 0
        for (let i = 0; i < T.N; i++) {
            const k = Math.abs(T.pts[i].k)
            if (k > 1 / 3300 && k < 1 / 700) { if (bcur === 0) bstart = i; bcur++ } else { if (bcur > bbest) { bbest = bcur; bi = bstart } bcur = 0 }
        }
        if (bcur > bbest) { bbest = bcur; bi = bstart }
        const pinIdx = (bi + Math.floor(bbest / 2)) % T.N
        const g = sim.makeGame(5)
        g.phase = 'race'
        const P = g.karts[0]
        P.v = 6; P.lapStart = -999
        const p = T.pts[pinIdx]
        const pin = () => { P.x = p.x; P.y = p.y; P.a = p.a; P.idx = pinIdx; P.hint = pinIdx }
        pin()
        for (let i = 0; i < 170; i++) { pin(); sim.step(g, { u: true, r: true, drift: true }) }
        const held = P.driftT >= sim.TIERS[2].t
        sim.step(g, { u: true })
        const boosted = P.boostT > 0 && P.boostTier === 2
        check(`${c.id}: hold 165+ ticks of drift → gold turbo on release`, held && boosted,
            `driftT held=${held} boostT=${P.boostTier >= 0 ? P.boostT : 0} tier=${P.boostTier}`)
        const g2 = sim.makeGame(5)
        g2.phase = 'race'
        const Q = g2.karts[0]
        Q.v = 6
        const pin2 = () => { Q.x = p.x; Q.y = p.y; Q.a = p.a; Q.idx = pinIdx; Q.hint = pinIdx }
        pin2()
        for (let i = 0; i < 70; i++) { pin2(); sim.step(g2, { u: true, r: true, drift: true }) }
        sim.step(g2, { u: true })
        check(`${c.id}: a short drift pays tier 0 only`, Q.boostTier === 0, `tier ${Q.boostTier}`)
    }

    console.log(`— ${c.id}: the pack reads + the ladder announces (#426) —`)
    {
        const m = await loadSim()
        const g = m.makeGame(3)
        const crosses = [0, 0, 0]
        let brakeTicks = 0; let rivalBrake = 0; let n = 0
        while (!g.end && n < 60 * 300) {
            m.step(g, m.decide(g)); n++
            brakeTicks += g.karts[0].braking
            for (let i = 1; i < g.karts.length; i++) rivalBrake += g.karts[i].braking
            for (const ev of g.events.splice(0)) if (ev.e === 'tier' && ev.who === 'COMET') crosses[ev.tier]++
        }
        check(`${c.id}: charging announces every tier crossing (blue/violet/gold events)`,
            crosses[0] >= 1 && crosses[1] >= 1 && crosses[2] >= 1,
            `tier events: ${crosses[0]} blue, ${crosses[1]} violet, ${crosses[2]} gold`)
        check(`${c.id}: brake lights light under braking, player and field`,
            brakeTicks >= 30 && rivalBrake >= 30, `player ${brakeTicks} ticks, rivals ${rivalBrake}`)
    }

    console.log(`— ${c.id}: determinism —`)
    {
        const run = (seed) => {
            const g = sim.makeGame(seed)
            const samples = []
            let n = 0
            while (!g.end && n < 60 * 300) {
                sim.step(g, sim.decide(g)); n++
                if (n % 120 === 0) samples.push(sim.stateHash(g))
            }
            return { samples, final: sim.stateHash(g), end: g.end }
        }
        const a = run(7); const b = run(7); const c2 = run(9)
        check(`${c.id} seed 7 twice → identical sample hashes`, JSON.stringify(a.samples) === JSON.stringify(b.samples), `${a.samples.length} samples`)
        check(`${c.id} seed 7 twice → identical final hash + outcome`, a.final === b.final && a.end === b.end, `${a.final} ${a.end}`)
        check(`${c.id} seed 9 → different hash`, c2.final !== a.final, `${c2.final} vs ${a.final}`)
    }

    console.log(`— ${c.id}: the look (palette ${c.palette}) —`)
    {
        const { paletteFor } = await import('../src/games/CometDrift/art.js')
        const PAL = paletteFor(c.palette)
        const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
        const lum = (h) => { const [r, g, b] = rgb(h); return r * 0.299 + g * 0.587 + b * 0.114 }
        const [rr, rg, rb] = rgb(PAL.road)
        check(`${c.id}: the road is slate (blue-dark, low saturation)`, rb >= rr && Math.abs(rr - rg) < 20 && rr < 90, PAL.road)
        const strata = ['rockShadow', 'rockDark', 'rockMid', 'rockLight', 'rimLit'].map((k) => PAL[k])
        check(`${c.id}: walls carry 5 strata brightening foot-to-rim`, strata.every(Boolean) && strata.every((col, i) => i === 0 || lum(col) > lum(strata[i - 1])),
            strata.map((col) => col && Math.round(lum(col))).join('<'))
        check(`${c.id}: no painted kerb or centre-line chrome (canyon, not circuit)`, !('kerbA' in PAL) && !('center' in PAL))
        check(`${c.id}: asphalt wears into wheel grooves (darker than the road)`, lum(PAL.groove) < lum(PAL.road), `${PAL.groove} vs ${PAL.road}`)
    }
}

console.log('— the course pack (#493) —')
{
    const fresh = await import(TRACKMOD + '?pack=' + Math.random())
    check('pack holds the Gulch and at least one new circuit', fresh.COURSES.length >= 2 &&
        fresh.COURSES.some((c) => c.id === 'gulch') && fresh.COURSES.some((c) => c.id !== 'gulch'),
        fresh.COURSES.map((c) => c.id).join(','))
    const first = fresh.COURSES.map((c) => ({ id: c.id, n: null }))
    fresh.selectCourse(first[0].id); first[0].n = fresh.TRACK.len
    fresh.selectCourse(first[1].id); first[1].n = fresh.TRACK.len
    check('selectCourse swaps the live TRACK (identity kept, contents per course)',
        first[0].n !== first[1].n && fresh.TRACK.id === first[1].id && fresh.SCENERY.length > 0 && fresh.CHECKPOINTS.length === 4,
        `${first[0].n.toFixed(0)} vs ${first[1].n.toFixed(0)}`)
    fresh.selectCourse('bogus')
    check('an unknown id falls back to the Gulch', fresh.TRACK.id === 'gulch')
}

// ---- reference provenance (#513 redo) ---------------------------------------
// The shape gate only bites if reference.js itself sits on the real maps.
// This decodes the committed road masks (data/maps/<map>-mask.png, gray8 +
// filter 0, written by scripts/extract-comet-references.mjs from the actual
// Wikimedia map files) and demands BOTH:
//   on-road  — the reference centerline lies within TOL_ON px of drawn road
//   coverage — most drawn road pixels are within TOL_COVER px of the ref
// A hand-typed blob fails both directions.
{
    const readGray = (p) => {
        const buf = readFileSync(p)
        let o = 8; let w = 0; let h = 0; const idat = []
        while (o + 8 <= buf.length) {
            const len = buf.readUInt32BE(o); const type = buf.toString('ascii', o + 4, o + 8)
            if (type === 'IHDR') { w = buf.readUInt32BE(o + 8); h = buf.readUInt32BE(o + 12) }
            else if (type === 'IDAT') idat.push(buf.subarray(o + 8, o + 8 + len))
            o += 12 + len
        }
        const raw = inflateSync(Buffer.concat(idat))
        const out = new Uint8Array(w * h)
        for (let y = 0; y < h; y++) {
            if (raw[y * (w + 1)] !== 0) throw new Error('mask PNG must use filter 0')
            raw.copy(out, y * w, y * (w + 1) + 1, y * (w + 1) + 1 + w)
        }
        return { w, h, d: out }
    }
    const PROVENANCE = [
        { id: 'sandbank', map: 'daytona' },
        { id: 'corkscomb', map: 'laguna' },
    ]
    const TOL_ON = 5
    const TOL_COVER = 6
    const MIN_ON = 0.98
    const MIN_COVER = 0.2
    const MIN_AREA = 0.25
    for (const pv of PROVENANCE) {
        const mk = readGray(new URL(`../data/maps/${pv.map}-mask.png`, import.meta.url))
        const { w, h } = mk
        let x0 = 1e9; let x1 = -1e9; let y0 = 1e9; let y1 = -1e9
        const bpx = []
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!mk.d[y * w + x]) continue
                bpx.push(y * w + x)
                if (x < x0) x0 = x; if (x > x1) x1 = x
                if (y < y0) y0 = y; if (y > y1) y1 = y
            }
        }
        // chamfer distance transform (centipixels): distance to nearest road px
        const dist = new Float64Array(w * h).fill(1e9)
        for (const k of bpx) dist[k] = 0
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const k = y * w + x
                let d = dist[k]
                if (y > 0) { d = Math.min(d, dist[k - w] + 100); d = Math.min(d, dist[k - w] + 41) }
                if (x > 0) { d = Math.min(d, dist[k - 1] + 100); d = Math.min(d, dist[k - 1] + 41) }
                if (y > 0 && x < w - 1) d = Math.min(d, dist[k - w + 1] + 41)
                dist[k] = d
            }
        }
        for (let y = h - 1; y >= 0; y--) {
            for (let x = w - 1; x >= 0; x--) {
                const k = y * w + x
                let d = dist[k]
                if (y < h - 1) { d = Math.min(d, dist[k + w] + 100); d = Math.min(d, dist[k + w] + 41) }
                if (x < w - 1) { d = Math.min(d, dist[k + 1] + 100); d = Math.min(d, dist[k + 1] + 41) }
                if (y < h - 1 && x > 0) d = Math.min(d, dist[k + w - 1] + 41)
                dist[k] = d
            }
        }
        // The mask bbox carries badge/text margins the traced loop does not, so
        // align the loop's own bbox onto it with a small shift+scale search that
        // maximises on-road coverage.
        const lp = resample(REFERENCES[pv.id].pts, 400)
        const lx0 = Math.min(...lp.map((p) => p[0])); const lx1 = Math.max(...lp.map((p) => p[0]))
        const ly0 = Math.min(...lp.map((p) => p[1])); const ly1 = Math.max(...lp.map((p) => p[1]))
        const mapPt = (nx, ny, sc, dx, dy) => [
            Math.round(x0 + ((nx - lx0) / (lx1 - lx0)) * (x1 - x0) * sc + dx),
            Math.round(y0 + ((ny - ly0) / (ly1 - ly0)) * (y1 - y0) * sc + dy),
        ]
        let best = null
        for (let sc = 0.94; sc <= 1.061; sc += 0.01) {
            for (let dx = -14; dx <= 14; dx += 2) {
                for (let dy = -14; dy <= 14; dy += 2) {
                    let on = 0
                    for (const [nx, ny] of lp) {
                        const [px, py] = mapPt(nx, ny, sc, dx, dy)
                        if (px < 0 || py < 0 || px >= w || py >= h) continue
                        if (dist[py * w + px] <= TOL_ON * 100) on++
                    }
                    if (!best || on > best.on) best = { on, dx, dy, sc }
                }
            }
        }
        const fOn = best.on / lp.length
        const q = lp.map(([nx, ny]) => mapPt(nx, ny, best.sc, best.dx, best.dy))
        let a2 = 0
        for (let i = 0; i < q.length; i++) {
            const a = q[i]; const b = q[(i + 1) % q.length]
            a2 += a[0] * b[1] - b[0] * a[1]
        }
        const area = Math.abs(a2) / 2
        const hit = new Uint8Array(w * h)
        for (const [px, py] of q) {
            for (let oy = -TOL_COVER; oy <= TOL_COVER; oy++) {
                for (let ox = -TOL_COVER; ox <= TOL_COVER; ox++) {
                    if (ox * ox + oy * oy > TOL_COVER * TOL_COVER) continue
                    const qx = px + ox; const qy = py + oy
                    if (qx >= 0 && qx < w && qy >= 0 && qy < h) hit[qy * w + qx] = 1
                }
            }
        }
        let cov = 0
        for (const k of bpx) if (hit[k]) cov++
        const fCov = cov / bpx.length
        if (process.env.COMETREF_DEBUG) console.log(`  ${pv.id} measured: on ${(100 * fOn).toFixed(1)}% cover ${(100 * fCov).toFixed(1)}% at dx ${best.dx} dy ${best.dy} sc ${best.sc.toFixed(2)}`)
        check(`${pv.id}: reference sits on the map mask (${pv.map}, ${bpx.length} road px)`, fOn >= MIN_ON, `on-road ${(100 * fOn).toFixed(1)}% >= ${100 * MIN_ON}%`)
        check(`${pv.id}: reference explains the map's road`, fCov >= MIN_COVER, `coverage ${(100 * fCov).toFixed(1)}% >= ${100 * MIN_COVER}%`)
        let per = 0
        for (let i = 0; i < lp.length; i++) {
            const a = lp[i]; const b = lp[(i + 1) % lp.length]
            per += Math.hypot(b[0] - a[0], b[1] - a[1])
        }
        const scaled = per / (lx1 - lx0) * (x1 - x0) * best.sc
        check(`${pv.id}: reference is circuit-sized`, scaled >= 1.2 * (w + h), `per ${scaled.toFixed(0)} (mask ${w}x${h})`)
        check(`${pv.id}: reference encloses a circuit infield`, area >= MIN_AREA * w * h, `area ${(100 * area / (w * h)).toFixed(1)}% >= ${100 * MIN_AREA}%`)
    }
}

console.log('— the field —')
check('7 karts on the grid, player last', await (async () => {
    const m7 = await loadSim()
    const g = m7.makeGame(1); return g.karts.length === 7 && g.karts[0].row === 6
})())

console.log('— the shared look (canyon pins, #435) —')
{
    const { KART, LIVERY, MESA_FAR, MESA_NEAR, longestFlatRun } = await import('../src/games/CometDrift/art.js')
    check('mesas are flat-topped (plateaus, not sine ridges)', longestFlatRun(MESA_FAR) >= 8 && longestFlatRun(MESA_NEAR) >= 8,
        `runs ${longestFlatRun(MESA_FAR)}/${longestFlatRun(MESA_NEAR)}`)
    check('the horizon has several distinct mesas', new Set([...MESA_FAR]).size >= 4 && new Set([...MESA_NEAR]).size >= 4)
    check('karts wider than tall, 3 poses', KART.w > KART.h && KART.frames === 3)
    check('seven liveries', Object.keys(LIVERY).length === 7)
}

console.log('— the boost payoff ladder —')
{
    const sim = await loadSim()
    const T = (await import(TRACKMOD)).TRACK
    const payFor = (ticksHeld) => {
        const gg = sim.makeGame(11)
        gg.phase = 'race'
        const Q = gg.karts[0]
        Q.v = 6; Q.lapStart = -999
        // pin on the same longest banked sweeper the gold-ladder test uses
        // (fixed index 40 landed on a braking corner once layouts followed real
        // maps #513 — a spin there truncates the top tier and the ladder inverts)
        let bi = 0; let bbest = 0; let bcur = 0; let bstart = 0
        for (let i = 0; i < T.N; i++) {
            const k = Math.abs(T.pts[i].k)
            if (k > 1 / 3300 && k < 1 / 700) { if (bcur === 0) bstart = i; bcur++ } else { if (bcur > bbest) { bbest = bcur; bi = bstart } bcur = 0 }
        }
        if (bcur > bbest) { bbest = bcur; bi = bstart }
        const pinIdx = (bi + Math.floor(bbest / 2)) % T.N
        const p = T.pts[pinIdx]
        const pin = () => { Q.x = p.x; Q.y = p.y; Q.a = p.a; Q.idx = pinIdx; Q.hint = pinIdx }
        pin()
        for (let i = 0; i < ticksHeld; i++) { pin(); sim.step(gg, { u: true, r: true, drift: true }) }
        sim.step(gg, { u: true })
        return { tier: Q.boostTier, dur: Q.boostT }
    }
    const a = payFor(sim.TIERS[0].t)
    const b = payFor(sim.TIERS[1].t)
    const c2 = payFor(sim.TIERS[2].t)
    check('each higher tier pays a longer, stronger boost',
        a.tier === 0 && b.tier === 1 && c2.tier === 2 && b.dur > a.dur && c2.dur > b.dur,
        `${a.tier}:${a.dur} ${b.tier}:${b.dur} ${c2.tier}:${c2.dur}`)
    check('over-cap speed rises with the tier', sim.TIERS[1].over > sim.TIERS[0].over && sim.TIERS[2].over > sim.TIERS[1].over)
}

if (process.argv.includes('--mutate')) {
    // break the checkpoint gate in sim.js and demand the shortcut probe above
    // goes red. Restore runs whatever happens.
    const path = SIM
    const src = readFileSync(path, 'utf8')
    const shortcut = async () => {
        const m = await loadSim()
        selectCourse('sandbank')
        const TS = Tmod.TRACK
        const g = m.makeGame(3)
        g.phase = 'race'
        const P = g.karts[0]
        const p = TS.pts[TS.N - 8]
        P.x = p.x; P.y = p.y; P.a = p.a; P.idx = TS.N - 8; P.hint = TS.N - 8; P.v = 8; P.cp = 0; P.lap = 0
        for (let i = 0; i < 90; i++) m.step(g, { u: true })
        return P.lap
    }
    try {
        writeFileSync(path, src.replace('if (crossed && k.cp === (1 << CHECKPOINTS.length) - 1) {', 'if (crossed) {'))
        const lap = await shortcut()
        if (lap > 0) {
            console.log('  MUTANT DIED — with the gate removed the infield cut banks a lap (lap=%d): the gate is load-bearing and this file went RED on it, by design', lap)
            R.fail++
        } else {
            console.log('  MUTANT SURVIVED — removing the gate changed nothing: cometcheck is BLIND')
        }
    } finally {
        writeFileSync(path, src)
    }

    // #518 mutant: kill the slope term and the downhill/uphill proof above
    // must go blind (same speed both ways) — the gravity gate is load-bearing.
    const slopeProbe = async () => {
        const mm = await import('../src/games/CometDrift/sim.js' + '?m=' + Math.random())
        selectCourse('corkscomb')
        const TS = Tmod.TRACK
        const up = TS.pts.find((p) => p.grade >= 0.045)
        const dn = TS.pts.find((p) => p.grade <= -0.045)
        const runAt = (p) => {
            const gg = mm.makeGame(2)
            gg.phase = 'race'
            const Q = gg.karts[0]
            Q.v = 5; Q.lapStart = -999
            for (let i = 0; i < 40; i++) {
                Q.x = p.x; Q.y = p.y; Q.a = p.a; Q.idx = p.i; Q.hint = p.i
                mm.step(gg, { u: true })
            }
            return Q.v
        }
        return runAt(dn) - runAt(up)
    }
    try {
        writeFileSync(path, src.replace('slopeK: 0.42,', 'slopeK: 0,'))
        const gap = await slopeProbe()
        if (gap < 0.6) {
            console.log(`  MUTANT DIED — with slopeK=0 downhill and uphill match again (gap ${gap.toFixed(2)}): the #518 gravity gate is load-bearing`)
            R.fail++
        } else {
            console.log('  MUTANT SURVIVED — removing slopeK changed nothing: the gravity gate is BLIND')
        }
    } finally {
        writeFileSync(path, src)
    }

    // #426 mutant: silence the tier announcements and the announce gate dies.
    try {
        writeFileSync(path, src.replace("if (tierNow > prevTier) g.events.push({ e: 'tier', who: k.name, tier: tierNow })", ''))
        const announceProbe = async () => {
            const mm = await loadSim()
            selectCourse('sandbank')
            const gg = mm.makeGame(3)
            let tiers = 0; let n = 0
            while (!gg.end && n < 60 * 300) {
                mm.step(gg, mm.decide(gg)); n++
                tiers += gg.events.splice(0).filter((ev) => ev.e === 'tier').length
            }
            return tiers
        }
        const got = await announceProbe()
        if (got === 0) {
            console.log('  MUTANT DIED — with the tier push removed no crossing is announced (0 events): the #426 announce gate is load-bearing')
            R.fail++
        } else {
            console.log(`  MUTANT SURVIVED — ${got} tier events without the push: the announce gate is BLIND`)
        }
    } finally {
        writeFileSync(path, src)
    }

    // #426 mutant: brake lights never light and the brake-read gate must go blind.
    try {
        writeFileSync(path, src.replace('k.braking = brk > 0 ? 1 : 0', 'k.braking = 0'))
        const brakeProbe = async () => {
            const mm = await loadSim()
            selectCourse('gulch')
            const gg = mm.makeGame(3)
            let b = 0; let n = 0
            while (!gg.end && n < 60 * 300) {
                mm.step(gg, mm.decide(gg)); n++
                for (const k of gg.karts) b += k.braking
            }
            return b
        }
        const lit = await brakeProbe()
        if (lit === 0) {
            console.log('  MUTANT DIED — with braking pinned off no brake light ever lights: the #426 brake-read gate is load-bearing')
            R.fail++
        } else {
            console.log(`  MUTANT SURVIVED — ${lit} braking ticks with the term pinned off: the brake-read gate is BLIND`)
        }
    } finally {
        writeFileSync(path, src)
    }
}

console.log(`\n${R.fail === 0 ? 'GREEN' : 'RED — ' + R.fail + ' failed'}`)
process.exit(R.fail === 0 ? 0 : 1)
