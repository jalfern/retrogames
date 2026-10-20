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

    console.log(`— ${c.id}: straights do not charge (#478) —`)
    {
        // #478 item 2: charge must be earned in bends, not on the clock.
        // The longest |k| ≤ 2e-4 stretch (everything the grown world still
        // calls near-straight) must accrue under half a tick of charge per
        // held tick and stay under the blue gate — the old time-based rule
        // accrues 1.0/tick there and farms tiers without a corner.
        const STRAIGHT_K = 2e-4
        let bi = 0; let blen = 0; let bcur = 0; let bstart = 0
        for (let i = 0; i < T.N * 2; i++) {
            if (Math.abs(T.pts[i % T.N].k) <= STRAIGHT_K) { if (bcur === 0) bstart = i; bcur++; if (bcur > blen) { blen = bcur; bi = bstart } } else bcur = 0
        }
        const p = T.pts[(bi + 2) % T.N]
        const g = sim.makeGame(7)
        g.phase = 'race'
        const P = g.karts[0]
        P.v = 8.2; P.lapStart = -999
        P.x = p.x; P.y = p.y; P.a = p.a; P.idx = (bi + 2) % T.N; P.hint = P.idx
        let maxC = -1; let ticks = 0
        for (let i = 0; i < 400 && !P.finished; i++) {
            if (((P.idx - bi) + T.N) % T.N >= blen) break
            const q = T.pts[P.idx]
            const lat = (P.x - q.x) * -Math.sin(q.a) + (P.y - q.y) * Math.cos(q.a)
            const s = lat > 8 ? 'l' : lat < -8 ? 'r' : ((i % 24) < 12 ? 'r' : 'l')
            sim.step(g, { u: true, drift: true, [s]: true })
            ticks++
            maxC = Math.max(maxC, P.charge)
        }
        const cap = Math.min(45, ticks * 0.5)
        check(`${c.id}: held-drift + steer taps on the longest straight bank no tier (#478)`,
            maxC < cap, `${maxC.toFixed(1)} charge in ${ticks} straight ticks (cap ${cap.toFixed(1)})`)
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

// #440: drift steer authority. A held drift + steer used to wind the kart
// up into a spin (>150° in 550 ms) on the straights. Yaw now decays with
// driftT and is rate-capped, so a held drift flicks, carves a fixed radius,
// then straightens. Position is pinned to the centerline so this isolates the
// steering model from track-following; only the heading is measured.
console.log('— the drift steer authority (#440) —')
{
    const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }
    const longRun = (T, pred) => {
        let best = 0; let bi = 0; let cur = 0; let st = 0
        for (let i = 0; i < T.N; i++) { if (pred(T.pts[i])) { if (cur === 0) st = i; cur++ } else { if (cur > best) { best = cur; bi = st } cur = 0 } }
        if (cur > best) { best = cur; bi = st }
        return bi + Math.floor(best / 2)
    }
    const headingAfter = async (id, mode, ticks) => {
        const sim = await loadSim()
        selectCourse(id); selectCourse(id)
        const T = Tmod.TRACK
        const idx = mode === 'straight'
            ? longRun(T, (p) => Math.abs(p.k) < 1 / 5000)
            : longRun(T, (p) => Math.abs(p.k) > 1 / 3300 && Math.abs(p.k) < 1 / 700)
        const g = sim.makeGame(11); g.phase = 'race'
        const Q = g.karts[0]; Q.lapStart = -999
        const p = T.pts[idx]
        Q.a = p.a
        let maxoff = 0; let early = 0; let late = 0; const prev = { a: p.a }
        for (let i = 0; i < ticks; i++) {
            Q.x = p.x; Q.y = p.y; Q.idx = idx; Q.hint = idx; Q.v = 6.5
            Q.offroad = false; Q.wpress = 0; Q.bumpCd = 0
            sim.step(g, { u: true, r: true, drift: true })
            maxoff = Math.max(maxoff, Math.abs(wrap(Q.a - p.a)))
            const d = Math.abs(wrap(Q.a - prev.a)); prev.a = Q.a
            if (i < 33) early += d; else if (i >= ticks - 33) late += d
        }
        return { maxoff: maxoff * 180 / Math.PI, early: early * 180 / Math.PI, late: late * 180 / Math.PI }
    }
    for (const c of COURSES) {
        const quick = (await headingAfter(c.id, 'straight', 33)).maxoff
        const sus = await headingAfter(c.id, 'straight', 165)
        const carve = (await headingAfter(c.id, 'sweeper', 33)).maxoff
        check(`${c.id}: held drift+steer on a straight carves, doesn't spin (#440: <90° in 550ms)`, quick < 90, `Δ${quick.toFixed(0)}° in 33 ticks`)
        check(`${c.id}: a held drift straightens as it charges — late yaw < early yaw (#440 decay)`, sus.late < sus.early * 0.6, `early ${sus.early.toFixed(0)}° late ${sus.late.toFixed(0)}°`)
        check(`${c.id}: a held drift still carves the corner (not neutered)`, carve > 10, `Δ${carve.toFixed(0)}° in 33 ticks`)
    }
}

// #440 polish 3 — the HUD must ride the game's OWN bitmap font, not the
// browser default. `bold Npx monospace` is the same generic face every OS
// draws; docs/ART.md says build the look from the original. font.js is the
// designed 3x5 face; index.jsx routes every canvas glyph through drawText.
const FONTJS = new URL('../src/games/CometDrift/font.js', import.meta.url)
const IDXJS = new URL('../src/games/CometDrift/index.jsx', import.meta.url)
const loadFont = async () => import('../src/games/CometDrift/font.js' + '?f=' + Math.random())
const GLYPHS = ('0123456789'
    + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    + "-=/:.,!<>+ '.").split('')

const fontIntegrity = async () => {
    const { FONT, CW, CH, textW, drawText } = await loadFont()
    const g = (k) => FONT[k]
    const rowsOk = GLYPHS.every((k) => {
        const s = g(k)
        return Array.isArray(s) && s.length === CH && s.every((r) => r.length === CW && /^[01]+$/.test(r))
    })
    check('font: 0-9, A-Z and HUD symbols are defined as 3x5 bitmaps', rowsOk,
        GLYPHS.filter((k) => { const s = g(k); return !(Array.isArray(s) && s.length === CH && s.every((r) => r.length === CW && /^[01]+$/.test(r))) }).join(''))
    const digits = '0123456789'.split('').map((d) => g(d).join('|'))
    check('font: the ten digits are all distinct glyphs', new Set(digits).size === 10)
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => g(c).join('|'))
    check('font: the twenty-six letters are all distinct glyphs', new Set(letters).size === 26)
    check('font: textW measures a string (advance = glyph + one-cell gap)', typeof textW === 'function' && textW('123', 2) === (3 * 4 - 1) * 2, `${textW('123', 2)}`)
    check('font: drawText is exported and callable', typeof drawText === 'function')
}

const hudUsesOwnFont = () => {
    const src = readFileSync(IDXJS, 'utf8')
    check('index.jsx: no browser-default monospace face anywhere in the canvas', !/monospace/.test(src))
    check('index.jsx: no raw ctx.fillText (every glyph routes through the own font)', !/\.fillText\(/.test(src))
    check('index.jsx: imports drawText from the game font module', /import\s*\{[^}]*\bdrawText\b[^}]*\}\s*from\s*'\.\/font\.js'/.test(src))
    check('index.jsx: the POS/positional HUD draws via drawText', /drawText\(ctx,\s*'POS'/.test(src) && /drawText\(ctx,\s*`\$\{P\.place\}/.test(src))
}

await fontIntegrity()
hudUsesOwnFont()

// #440 item 4 — sun azimuth. The disc must be anchored to a fixed world
// azimuth and projected through the SAME pinhole the road and scenery use.
// The old linear map (`wrapA(...) * W * 0.66`) was not the road's
// projection: turn away from the azimuth and the disc vanished while the
// glow band kept bleeding in at the screen edge — westbound straights got
// "glow, no sun". sunLayout (art.js) is the single source; the renderer
// gates disc+glow together through `visible`.
const ARTJS = new URL('../src/games/CometDrift/art.js', import.meta.url)
const loadArt = async () => import('../src/games/CometDrift/art.js' + '?s=' + Math.random())

const sunAudit = async () => {
    const { sunLayout, SUN_AZ } = await loadArt()
    for (const W of [320, 560, 880]) {
        const pp = 540
        const at = (camA) => {
            const s = sunLayout(camA, W, pp, 1, 200, 30)
            const x = s.visible ? s.sunX : W + 4096
            return { x, discHit: x > -s.discR && x < W + s.discR, glowHit: x > -s.glowR && x < W + s.glowR }
        }
        const a0 = at(0); const aL = at(Math.PI * 2)
        check(`sun ${W}px: fixed world azimuth — a full turn of heading returns to the same spot`, Math.abs(a0.x - aL.x) < 1e-9 && a0.discHit === aL.discHit)
        const back = at(SUN_AZ + Math.PI)
        check(`sun ${W}px: facing away from the azimuth — no disc AND no glow band`, !back.discHit && !back.glowHit)
        let bands = 0; let prev = false; let maxStep = 0; let prevX = 0; let stray = 0
        let firstHit = false; let lastHit = false
        for (let i = 0; i < 720; i++) {
            const v = at((i * Math.PI) / 360)
            if (v.discHit && !prev) bands++
            if (v.discHit) { if (prev && Math.abs(v.x - prevX) > maxStep) maxStep = Math.abs(v.x - prevX); prevX = v.x }
            if (!v.discHit && v.glowHit) stray++
            prev = v.discHit
            if (i === 0) firstHit = v.discHit
            lastHit = v.discHit
        }
        if (firstHit && lastHit) bands--
        check(`sun ${W}px: exactly one visible band per lap — the disc glides, never teleports`, bands === 1, `bands ${bands}`)
        check(`sun ${W}px: no glow without the disc at any heading`, stray === 0, `stray ${stray}`)
        check(`sun ${W}px: the sun tracks camera rotation — max ${maxStep.toFixed(1)}px step per 0.5°`, maxStep > 0.2 && maxStep < pp * 0.021)
        let worst = 0
        for (let i = 0; i < 36; i++) {
            const camA = SUN_AZ - 0.28 + (i * 0.56) / 35
            const D = 4000
            const wx = Math.cos(SUN_AZ) * D; const wy = Math.sin(SUN_AZ) * D
            const f = wx * Math.cos(camA) + wy * Math.sin(camA)
            const l = wx * -Math.sin(camA) + wy * Math.cos(camA)
            worst = Math.max(worst, Math.abs(W / 2 + pp * (l / f) - sunLayout(camA, W, pp, 1, 200, 30).sunX))
        }
        check(`sun ${W}px: same projection as road/scenery — sun x == landmark x (worst ${worst.toFixed(2)}px)`, worst < 1)
    }
}

const sunWired = () => {
    const src = readFileSync(IDXJS, 'utf8')
    check('index.jsx: sun position comes only from art.js sunLayout', /sunLayout\(camA, W, pp, u, HZ, sunLift\)/.test(src) && !/SUN_A\b/.test(src))
    check('index.jsx: disc+glow are gated together through sun.visible', /sun\.visible\s*\?\s*sun\.sunX\s*:\s*W\s*\+\s*4096/.test(src))
}

console.log('— sun azimuth, full-lap audit (#440 item 4) —')
await sunAudit()
sunWired()

// #440 item 5 — rival boost was silent: the sim announces EVERY kart's gold
// release but the sfx loop only reacted to COMET's. rivalBoostFx (sim.js) is
// the pure loudness law — quieter than the player, fades with the gap, silent
// past the mute radius, gold louder than blue — and index.jsx must route rival
// boost events through it.
const sfxLaw = async () => {
    const { rivalBoostFx, RIVAL_BOOST } = await import('../src/games/CometDrift/sim.js' + '?sfx=' + Math.random())
    const near = rivalBoostFx(0, 2)
    const mid = rivalBoostFx(350, 2)
    const mute = rivalBoostFx(RIVAL_BOOST.mute, 2)
    check('a rival gold release is audible up close (#440 item 5)', near.vol > 0.03, `vol ${near.vol.toFixed(3)}`)
    check('the distant sweep fades with the gap (#440 item 5)', near.vol > mid.vol * 1.42 && mid.vol > mute.vol && mute.vol <= 0, `near ${near.vol.toFixed(3)} > mid ${mid.vol.toFixed(3)} > mute ${mute.vol.toFixed(3)}`)
    check('a boost one pack-length away still registers (#440 item 5)', rivalBoostFx(150, 2).vol > 0.02 && rivalBoostFx(150, 0).vol > 0.01)
    check('silent past the mute radius (#440 item 5)', rivalBoostFx(RIVAL_BOOST.mute + 40, 2).vol === 0)
    check('gold pops louder than blue at the same gap (#440 item 5)', rivalBoostFx(120, 2).vol > rivalBoostFx(120, 0).vol)
    check('a rival never outruns the player\'s own boost volume (#440 item 5)', near.vol < 0.11, `rival max ${near.vol.toFixed(3)} < player blue 0.11`)
    check('far releases go soft-edged (triangle), near ones square (#440 item 5)', rivalBoostFx(200, 2).far === true && rivalBoostFx(100, 2).far === false)
    selectCourse('sandbank')
    const m = await loadSim()
    const g = m.makeGame(3)
    let rb = 0
    for (let n = 0; n < 60 * 90 && !g.end; n++) {
        m.step(g, m.decide(g))
        for (const ev of g.events) if (ev.e === 'boost' && ev.who !== 'COMET') rb++
        g.events.length = 0
    }
    check('the pack really releases boosts in a race — the sound has a job (#440 item 5)', rb > 0, `${rb} rival releases in seed 3`)
}
const sfxWired = () => {
    const src = readFileSync(IDXJS, 'utf8')
    check('index.jsx: rival boost events route through rivalBoostFx (#440 item 5)', /if \(ev\.e === 'boost' && ev\.who !== 'COMET'\) \{/.test(src) && /distant\.push\(/.test(src) && /rivalBoostFx\(/.test(src))
    check('index.jsx: distant rivals render as the softer triangle sweep (#440 item 5)', /fx\.far \? 'triangle' : 'square'/.test(src))
    check('index.jsx: a near-silent distant release is skipped, not stacked (#440 item 5)', /\.vol < 0\.004/.test(src))
}
console.log('— rival boost is a distant sweep (#440 item 5) —')
await sfxLaw()
sfxWired()

// #440 item 2 — overtakes blinded the chase camera: at contact distance the
// rival buggy sprite grew past half the portrait screen (measured 53–158% of
// screen height at f 30..90, and seed-3 racing really reaches f≈0), hiding
// the road ahead. rivalViewFx (art.js) is the pure readability law: rivals
// covering > dampFrac of screen height darken, past capFrac they shrink;
// far rivals render untouched.
const viewLaw = async () => {
    const { rivalViewFx, RIVAL_VIEW } = await import('../src/games/CometDrift/art.js' + '?view=' + Math.random())
    const PH = 448
    const rawAt = (f, H) => Math.min(H * 1.6, 54 * (540 / f) * 0.9)
    const far = rivalViewFx(rawAt(300, PH), PH)
    check('a far rival renders untouched (#440 item 2)', far.s === 1 && far.alpha === 1, `f300: ${rawAt(300, PH).toFixed(0)}px = ${(rawAt(300, PH) / PH * 100).toFixed(0)}%`)
    const blinding = rawAt(30, PH)
    const d30 = rivalViewFx(blinding, PH)
    check('a blinding close rival shrinks to readable size (#440 item 2: <=56% of screen)', blinding * d30.s <= 0.56 * PH, `raw ${(blinding / PH * 100).toFixed(0)}% → ${(blinding * d30.s / PH * 100).toFixed(0)}%`)
    check('a half-screen rival darkens so the road reads through (#440 item 2)', rivalViewFx(rawAt(60, PH), PH).alpha <= 0.85 && rivalViewFx(rawAt(90, PH), PH).alpha <= 0.92)
    const edge = rivalViewFx(rawAt(150, PH), PH)
    check('damping is continuous at the threshold (#440 item 2)', rivalViewFx(RIVAL_VIEW.dampFrac * PH - 1, PH).s === 1 && edge.alpha > 0.7, `f150 alpha ${edge.alpha.toFixed(2)}`)
    let monoS = true; let monoA = true
    for (let px = 40; px <= PH * 1.6; px += 5) {
        const a = rivalViewFx(px, PH); const b = rivalViewFx(px + 5, PH)
        if (b.s > a.s + 1e-9 || b.alpha > a.alpha + 1e-9) { monoS = false; monoA = false }
    }
    check('damping grows monotonically with coverage (#440 item 2)', monoS && monoA)
    check('a rival never goes invisible (#440 item 2)', RIVAL_VIEW.minAlpha >= 0.5 && rivalViewFx(PH * 1.6, 176).alpha >= RIVAL_VIEW.minAlpha)
    selectCourse('sandbank')
    const m = await loadSim()
    const g = m.makeGame(3)
    let dampTicks = 0; let worstAfter = 0
    for (let n = 0; n < 60 * 90 && !g.end; n++) {
        m.step(g, m.decide(g))
        const P = g.karts[0]; const ca = Math.cos(P.a); const sa = Math.sin(P.a)
        let fmin = Infinity
        for (const K of g.karts.slice(1)) {
            const f = (K.x - P.x) * ca + (K.y - P.y) * sa
            if (f >= 30) fmin = Math.min(fmin, f)
        }
        if (fmin === Infinity) continue
        const raw = rawAt(fmin, PH)
        const fx = rivalViewFx(raw, PH)
        if (fx.s < 1 || fx.alpha < 1) dampTicks++
        worstAfter = Math.max(worstAfter, raw * fx.s / PH)
    }
    check('contact racing really triggers the law — it has a job (#440 item 2)', dampTicks > 60, `${dampTicks} dampened ticks in seed 3`)
    check('throughout the race nothing covers more than 56% of the screen (#440 item 2)', worstAfter <= 0.551, `worst ${(worstAfter * 100).toFixed(1)}%`)
}
const viewWired = () => {
    const src = readFileSync(IDXJS, 'utf8')
    check('index.jsx: rival sprites route through rivalViewFx (#440 item 2)', /const rv = it\.o \? rivalViewFx\(h, H\) : \{ s: 1, alpha: 1 \}/.test(src) && /w \*= rv\.s; h \*= rv\.s/.test(src))
    check('index.jsx: the shadow dims with the damped sprite (#440 item 2)', /ctx\.globalAlpha = 0\.22 \* rv\.alpha/.test(src))
    check('index.jsx: the player kart is NEVER dampened — it stays solid (#440 item 2)', /ctx\.drawImage\(S\.comet\[sf\]\[rf\], -pw \/ 2, -ph, pw, ph\)/.test(src) && !/rv\.(s|alpha)[\s\S]{0,40}S\.comet\[sf\]/.test(src.slice(src.indexOf('const pw = Math.round'))))
    check('index.jsx: scenery has no rival damp — only karts carry .o (#440 item 2)', /it\.o \? rivalViewFx/.test(src) && /items\.push\(\{ x: sc\.x, y: sc\.y, a: 0, img/.test(src))
}
console.log('— overtakes stay readable (#440 item 2) —')
await viewLaw()
viewWired()

// #440 item 6 — the engine bed was one buzz: a Math.round(v) stepped pop
// period (a plastic gear-step at every integer of speed), dead-steady pitch,
// and held drifts / sand runs silent bar the one-shot crashes. engineSfx.js
// is the pure law (engineVoice/driftScrape/sandWhoosh); index.jsx accumulates
// phases and routes them into AudioController.
const SFXJS = new URL('../src/games/CometDrift/engineSfx.js', import.meta.url)
const loadSfx = async () => import('../src/games/CometDrift/engineSfx.js' + '?e=' + Math.random())

const engineLaw = async () => {
    const { ENGINE, SCRAPE, engineVoice, driftScrape, sandWhoosh } = await loadSfx()
    check('engine is silent below a crawl (#440 item 6)', engineVoice(0.4, -1, 0) === null)
    const pop = (v) => engineVoice(v, -1, 7).period
    let stepMax = 0
    for (let v = 0.5; v < 14; v += 0.25) stepMax = Math.max(stepMax, Math.abs(pop(v + 0.25) - pop(v)))
    check('pop period is continuous in speed — no integer gear-step (#440 item 6)', stepMax <= 0.26, `worst Δ ${stepMax.toFixed(2)} per 0.25 v`)
    const f = (v, tier, tick) => engineVoice(v, tier, tick).freq
    const fs = []
    for (let t = 0; t < 240; t++) fs.push(f(8, -1, t) - (ENGINE.floor + 8 * ENGINE.vMul))
    const wobMax = Math.max(...fs.map(Math.abs))
    const spread = Math.max(...fs) - Math.min(...fs)
    check('pitch wobbles — the engine breathes, no dead laser tone (#440 item 6)', new Set(fs).size >= 150 && spread >= 12, `${new Set(fs).size}/240 distinct, spread ${spread.toFixed(1)} Hz`)
    check('wobble stays a wobble — bounded by wob1+wob2 (#440 item 6)', wobMax <= ENGINE.wob1 + ENGINE.wob2 + 1e-9, `peak ±${wobMax.toFixed(2)} Hz`)
    check('boost tiers keep the audible ladder: 34 + 52·tier above base (#440 item 6)',
        Math.abs(f(8, 0, 0) - f(8, -1, 0) - ENGINE.boostBase) < 1e-9
        && Math.abs(f(8, 1, 0) - f(8, 0, 0) - ENGINE.boostTierMul) < 1e-9
        && Math.abs(f(8, 2, 0) - f(8, 1, 0) - ENGINE.boostTierMul) < 1e-9)
    check('no scrape while the wheels are straight (#440 item 6)', driftScrape(0, 9) === null && driftScrape(40, 3) === null)
    let mono = true; let cap = 0
    for (let d = 1; d <= SCRAPE.maxGrip * 2; d++) {
        const a = driftScrape(d, 9); const b = driftScrape(d + 1, 9)
        cap = Math.max(cap, a.vol)
        if (b.vol < a.vol - 1e-12 || b.freq > a.freq + 1e-12) mono = false
    }
    check('held-drift crackle swells and darkens as the tyre charges (#440 item 6)', mono && cap <= 0.034, `vol cap ${cap.toFixed(3)}`)
    check('no whoosh on asphalt, none at a crawl (#440 item 6)', sandWhoosh(false, 9) === null && sandWhoosh(true, 0.5) === null)
    check('sand sits under kerb — whoosh cutoff below the scrape floor (#440 item 6)',
        sandWhoosh(true, 12).freq < driftScrape(SCRAPE.maxGrip, 12).freq, `${sandWhoosh(true, 12).freq} < ${driftScrape(SCRAPE.maxGrip, 12).freq}`)
    check('whoosh swells with speed (#440 item 6)', sandWhoosh(true, 10).vol > sandWhoosh(true, 2).vol)
    selectCourse('sandbank')
    const m = await loadSim()
    const g = m.makeGame(3)
    let sc = 0
    for (let n = 0; n < 60 * 90 && !g.end; n++) { m.step(g, m.decide(g)); if (driftScrape(g.karts[0].driftT, g.karts[0].v)) sc++ }
    check('real racing really holds drifts — the scrape has a job (#440 item 6)', sc > 60, `${sc} scrape ticks in seed 3`)
    const g2 = m.makeGame(3)
    for (let n = 0; n < 600 && !sandWhoosh(g2.karts[0].offroad, g2.karts[0].v); n++) m.step(g2, { u: true, r: true, drift: true })
    check('run wide and it really leaves the road — the whoosh has a job (#440 item 6)', sandWhoosh(g2.karts[0].offroad, g2.karts[0].v) !== null, `v ${g2.karts[0].v.toFixed(1)} offroad ${g2.karts[0].offroad}`)
}
const engineWired = () => {
    const src = readFileSync(IDXJS, 'utf8')
    check('index.jsx: the engine bed routes through engineSfx laws (#440 item 6)', /import\s*\{[^}]*engineVoice[^}]*driftScrape[^}]*sandWhoosh[^}]*\}\s*from\s*'\.\/engineSfx\.js'/.test(src))
    check('index.jsx: engine pop phase comes from the law, not a stepped modulo (#440 item 6)', /engAcc \+= 1 \/ e\.period/.test(src) && !/g\.tick % period/.test(src) && !/15 - Math\.round\(P\.v\)/.test(src))
    check('index.jsx: drift scrape is filtered noise, not raw crackle (#440 item 6)', /playFilteredNoise\(sc\.dur, sc\.vol, sc\.freq\)/.test(src))
    check('index.jsx: sand whoosh is filtered noise too (#440 item 6)', /playFilteredNoise\(ws\.dur, ws\.vol, ws\.freq\)/.test(src))
}
console.log('— the engine bed has a voice (#440 item 6) —')
await engineLaw()
engineWired()

// ---- the attract course selector is tappable (#534) -------------------------
// The phone title has no stick, so the ‹ › chevrons are the only course
// control. Their geometry + hit test live in selector.js (pure, shared by the
// renderer, the pointer handler and this gate): audit that they are a thumb's
// size, symmetric about the name, off-centre, on-screen, never overlapping,
// and that a chevron tap routes to that course while the centre (the name)
// stays the clear start zone.
const SELJS = new URL('../src/games/CometDrift/selector.js', import.meta.url)
const loadSelector = (q = '') => import(new URL(q ? `../src/games/CometDrift/selector.js?v=${q}` : SELJS, import.meta.url))
const SEL_CASES = [ { W: 384, H: 176 }, { W: 256, H: 176 }, { W: 256, H: 448 } ]
const selectorGate = (SEL) => {
    const { selectorGeom, selectorHit } = SEL
    let geomOk = true, geomWhy = []
    let hitOk = true, hitWhy = []
    for (const { W, H } of SEL_CASES) {
        const g = selectorGeom(W, H, 1)
        const onScreen = g.left[0] - g.hw >= 0 && g.right[0] + g.hw <= W && g.rowY - g.hh >= 0 && g.rowY + g.hh <= H
        const flank = g.left[0] < W / 2 && g.right[0] > W / 2 && g.left[1] === g.rowY && g.right[1] === g.rowY
        const symmetric = Math.abs(g.left[0] + g.right[0] - W) <= 1
        const thumb = g.hw * 2 >= 48 && g.hh * 2 >= 32
        const noOverlap = g.right[0] - g.hw > g.left[0] + g.hw
        if (!(onScreen && flank && symmetric && thumb && noOverlap)) { geomOk = false; geomWhy.push(`${W}x${H}: on=${onScreen} flank=${flank} sym=${symmetric} thumb=${thumb} overlap=${!noOverlap}`) }
        const hitL = selectorHit(g, g.left[0], g.left[1]) === -1
        const hitR = selectorHit(g, g.right[0], g.right[1]) === 1
        const centre = selectorHit(g, Math.round(W / 2), g.rowY) === 0
        const corner = selectorHit(g, 0, 0) === 0
        if (!(hitL && hitR && centre && corner)) { hitOk = false; hitWhy.push(`${W}x${H}: L=${hitL} R=${hitR} centre=${centre} corner=${corner}`) }
    }
    check('attract chevrons: thumb-sized, symmetric, off-centre, on-screen, non-overlapping (#534)', geomOk, geomWhy.join(' | '))
    check('attract chevrons: a chevron tap routes to that course, the centre stays the start zone (#534)', hitOk, hitWhy.join(' | '))
}
console.log('— the attract course selector is tappable (#534) —')
selectorGate(await loadSelector())

if (process.argv.includes('--mutate')) {
    // #534 mutant: collapse the chevrons onto the centre — no thumb target, no
    // flanking, and the centre is no longer the clear start zone. The selector
    // gate must go red. Re-imports the mutated file via a bust query.
    {
        const selSrc = readFileSync(SELJS, 'utf8')
        const died = async (label, run) => {
            const before = R.fail
            await run()
            if (R.fail > before) console.log(`  MUTANT DIED — ${label}: the #534 selector gate is load-bearing`)
            else console.log(`  MUTANT SURVIVED — ${label}: the #534 selector gate is BLIND`)
        }
        try {
            writeFileSync(SELJS, selSrc
                .replace('const off = Math.round(88 * hs)', 'const off = 0')
                .replace('const hw = Math.max(1, Math.round(32 * hs))', 'const hw = Math.max(1, Math.round(6 * hs))')
                .replace('const hh = Math.max(1, Math.round(20 * hs))', 'const hh = Math.max(1, Math.round(6 * hs))'))
            await died('the chevrons shrink onto the centre (no thumb target, no start zone)', async () => selectorGate(await loadSelector(Date.now())))
        } finally { writeFileSync(SELJS, selSrc) }
    }

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

    // #478 mutant: restore the time-based accrual and the straight gate must die.
    try {
        writeFileSync(path, src.replace('k.charge = k.charge < 0 ? bendW : k.charge + bendW', 'k.charge = Math.max(k.charge, k.driftT)'))
        const straightProbe = async () => {
            const mm = await loadSim()
            selectCourse('gulch')
            const TT = Tmod.TRACK
            let bi = 0; let blen = 0; let bcur = 0; let bstart = 0
            for (let i = 0; i < TT.N * 2; i++) {
                if (Math.abs(TT.pts[i % TT.N].k) <= 2e-4) { if (bcur === 0) bstart = i; bcur++; if (bcur > blen) { blen = bcur; bi = bstart } } else bcur = 0
            }
            const p = TT.pts[(bi + 2) % TT.N]
            const gg = mm.makeGame(7)
            gg.phase = 'race'
            const P = gg.karts[0]
            P.v = 8.2; P.lapStart = -999
            P.x = p.x; P.y = p.y; P.a = p.a; P.idx = (bi + 2) % TT.N; P.hint = P.idx
            let maxC = -1; let ticks = 0
            for (let i = 0; i < 400 && !P.finished; i++) {
                if (((P.idx - bi) + TT.N) % TT.N >= blen) break
                const q = TT.pts[P.idx]
                const lat = (P.x - q.x) * -Math.sin(q.a) + (P.y - q.y) * Math.cos(q.a)
                const s = lat > 8 ? 'l' : lat < -8 ? 'r' : ((i % 24) < 12 ? 'r' : 'l')
                mm.step(gg, { u: true, drift: true, [s]: true })
                ticks++
                maxC = Math.max(maxC, P.charge)
            }
            return { maxC, ticks, cap: Math.min(45, ticks * 0.5) }
        }
        const pr = await straightProbe()
        if (pr.maxC >= pr.cap) {
            console.log(`  MUTANT DIED — time-based accrual farms ${pr.maxC.toFixed(1)} charge in ${pr.ticks} straight ticks (cap ${pr.cap.toFixed(1)}): the #478 straight gate is load-bearing`)
            R.fail++
        } else {
            console.log(`  MUTANT SURVIVED — old accrual banked only ${pr.maxC.toFixed(1)} on the straight: the #478 gate is BLIND`)
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

    // #440 mutants: the drift-authority gate is load-bearing. Re-plant each
    // regression into sim.js and demand the straight/spin probe goes red.
    const headingMut = async (mode, ticks) => {
        const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }
        const mm = await loadSim()
        selectCourse('gulch'); selectCourse('gulch')
        const TT = Tmod.TRACK
        const flat = mode === 'sweeper'
            ? (p) => Math.abs(p.k) > 1 / 3300 && Math.abs(p.k) < 1 / 700
            : (p) => Math.abs(p.k) < 1 / 5000
        let best = 0; let bi = 0; let cur = 0; let st = 0
        for (let i = 0; i < TT.N; i++) { if (flat(TT.pts[i])) { if (cur === 0) st = i; cur++ } else { if (cur > best) { best = cur; bi = st } cur = 0 } }
        if (cur > best) { best = cur; bi = st }
        const idx = bi + Math.floor(best / 2); const p = TT.pts[idx]
        const gg = mm.makeGame(11); gg.phase = 'race'
        const Q = gg.karts[0]; Q.lapStart = -999; Q.a = p.a
        let mo = 0; let early = 0; let late = 0; const prev = { a: p.a }
        for (let i = 0; i < ticks; i++) {
            Q.x = p.x; Q.y = p.y; Q.idx = idx; Q.hint = idx; Q.v = 6.5
            Q.offroad = false; Q.wpress = 0; Q.bumpCd = 0
            mm.step(gg, { u: true, r: true, drift: true })
            mo = Math.max(mo, Math.abs(wrap(Q.a - p.a)))
            const d = Math.abs(wrap(Q.a - prev.a)); prev.a = Q.a
            if (i < 33) early += d; else if (i >= ticks - 33) late += d
        }
        return { maxoff: mo * 180 / Math.PI, early: early * 180 / Math.PI, late: late * 180 / Math.PI }
    }
    // cap removed → the straight spin returns
    try {
        writeFileSync(path, src.replace('driftYawCap: 0.03,', 'driftYawCap: 100,'))
        const q = (await headingMut('straight', 33)).maxoff
        if (q >= 90) { console.log(`  MUTANT DIED — with the yaw cap removed a straight held drift spins again (Δ${q.toFixed(0)}°): the #440 cap gate is load-bearing`); R.fail++ }
        else console.log(`  MUTANT SURVIVED — cap removal still carves ${q.toFixed(0)}°: the cap gate is BLIND`)
    } finally { writeFileSync(path, src) }
    // decay removed → a held drift stops straightening (late yaw = early yaw)
    try {
        writeFileSync(path, src.replace('driftDecayT: 90,', 'driftDecayT: 1e9,'))
        const s = await headingMut('straight', 165)
        if (s.late >= s.early * 0.6) { console.log(`  MUTANT DIED — without authority decay a held drift never straightens (early ${s.early.toFixed(0)}° late ${s.late.toFixed(0)}°): the #440 decay gate is load-bearing`); R.fail++ }
        else console.log(`  MUTANT SURVIVED — decay removal still straightens (early ${s.early.toFixed(0)}° late ${s.late.toFixed(0)}°): the decay gate is BLIND`)
    } finally { writeFileSync(path, src) }
    // cap tightened to zero → the drift can no longer carve at all
    try {
        writeFileSync(path, src.replace('driftYawCap: 0.03,', 'driftYawCap: 0.0005,'))
        const cv = (await headingMut('straight', 33)).maxoff
        if (cv < 10) { console.log(`  MUTANT DIED — an over-tight cap neuters the drift (Δ${cv.toFixed(0)}° carve): the #440 carve floor is load-bearing`); R.fail++ }
        else console.log(`  MUTANT SURVIVED — over-tight cap still carves Δ${cv.toFixed(0)}°: the carve floor is BLIND`)
    } finally { writeFileSync(path, src) }

    // #440 own-font mutants: re-plant a system-fallback draw / a broken glyph
    // and the gate above MUST go red. R.fail delta > 0 means the mutant died.
    const idxSrc = readFileSync(IDXJS, 'utf8')
    const fontSrc = readFileSync(FONTJS, 'utf8')
    const died = async (label, run) => {
        const before = R.fail
        await run()
        if (R.fail > before) console.log(`  MUTANT DIED — ${label}: the #440 own-font gate is load-bearing`)
        else console.log(`  MUTANT SURVIVED — ${label}: the own-font gate is BLIND`)
    }
    try {
        writeFileSync(IDXJS, idxSrc.replace(`drawText(ctx, 'POS', Math.round(5 * hs), Math.round(11 * hs), '#b08460', dsz(8))`, `ctx.font = 'bold 8px monospace'; ctx.fillText('POS', Math.round(5 * hs), Math.round(11 * hs))`))
        await died('a HUD readout falls back to browser monospace fillText', hudUsesOwnFont)
    } finally { writeFileSync(IDXJS, idxSrc) }
    try {
        writeFileSync(IDXJS, idxSrc.replace(`import { drawText } from './font.js'`, `import { textW as _tw } from './font.js'`))
        await died('index.jsx stops importing its own font', hudUsesOwnFont)
    } finally { writeFileSync(IDXJS, idxSrc) }
    try {
        writeFileSync(FONTJS, fontSrc.replace(`    '3': ['111', '001', '011', '001', '111'],`, `    '3': ['111', '001', '011', '001'],`))
        await died('a glyph loses a pixel row', fontIntegrity)
    } finally { writeFileSync(FONTJS, fontSrc) }
    try {
        writeFileSync(FONTJS, fontSrc.replace(`    '8': ['111', '101', '111', '101', '111'],`, `    '8': ['010', '101', '101', '101', '010'],`))
        await died('two digits collapse to the same glyph', fontIntegrity)
    } finally { writeFileSync(FONTJS, fontSrc) }
    try {
        writeFileSync(FONTJS, fontSrc.replace('return n === 0 ? 0 : n * (CW + 1) - 1', 'return n === 0 ? 0 : n * (CW + 1) + 1'))
        await died('textW stops measuring the trailing gap', fontIntegrity)
    } finally { writeFileSync(FONTJS, fontSrc) }

    // #440 item-4 sun mutants: re-plant each regression into art.js/index.jsx
    // and demand the azimuth gate above goes red.
    const sunDied = async (label, run) => {
        const before = R.fail
        await run()
        if (R.fail > before) console.log(`  MUTANT DIED — ${label}: the #440 sun-azimuth gate is load-bearing`)
        else console.log(`  MUTANT SURVIVED — ${label}: the sun-azimuth gate is BLIND`)
    }
    const artSrc = readFileSync(ARTJS, 'utf8')
    try {
        writeFileSync(ARTJS, artSrc.replace('const sunX = half + pp * Math.tan(d)', 'const sunX = half + d * W * 0.66'))
        await sunDied('the linear azimuth map returns (westbound glow-band without a disc)', sunAudit)
    } finally { writeFileSync(ARTJS, artSrc) }
    try {
        writeFileSync(ARTJS, artSrc.replace('const sunX = half + pp * Math.tan(d)', 'const sunX = half'))
        await sunDied('the sun is nailed to screen centre for the whole lap', sunAudit)
    } finally { writeFileSync(ARTJS, artSrc) }
    try {
        writeFileSync(ARTJS, artSrc.replace('wrapAz(SUN_AZ - camA)', 'wrapAz(SUN_AZ - camA * 0.9)'))
        await sunDied('the sun azimuth is no longer fixed in world space', sunAudit)
    } finally { writeFileSync(ARTJS, artSrc) }
    try {
        writeFileSync(IDXJS, idxSrc.replace('const sunX = sun.visible ? sun.sunX : W + 4096', 'const sunX = sun.sunX'))
        await sunDied('the renderer drops the visibility gate (glow bleeds without the disc)', sunWired)
    } finally { writeFileSync(IDXJS, idxSrc) }

    // #440 item-5 rival-sfx mutants: re-plant the silence / a flat law and
    // demand the distant-sweep gate above goes red.
    const simSfxSrc = readFileSync(SIM, 'utf8')
    const sfxDied = async (label, run) => {
        const before = R.fail
        await run()
        if (R.fail > before) console.log(`  MUTANT DIED — ${label}: the #440 rival-sfx gate is load-bearing`)
        else console.log(`  MUTANT SURVIVED — ${label}: the rival-sfx gate is BLIND`)
    }
    try {
        writeFileSync(SIM, simSfxSrc.replace('const prox = Math.max(0, 1 - dist / RIVAL_BOOST.mute)', 'const prox = 1'))
        await sfxDied('every rival boost is full volume regardless of distance', sfxLaw)
    } finally { writeFileSync(SIM, simSfxSrc) }
    try {
        writeFileSync(SIM, simSfxSrc.replace('RIVAL_BOOST.maxVol * (0.45 + tier * 0.275) * prox', 'RIVAL_BOOST.maxVol * 0.72 * prox'))
        await sfxDied('gold and blue releases sound identical', sfxLaw)
    } finally { writeFileSync(SIM, simSfxSrc) }
    try {
        writeFileSync(SIM, simSfxSrc.replace('maxVol: 0.07', 'maxVol: 0.2'))
        await sfxDied('a rival release is louder than the player\'s own boost', sfxLaw)
    } finally { writeFileSync(SIM, simSfxSrc) }
    try {
        writeFileSync(IDXJS, idxSrc.replace("if (ev.e === 'boost' && ev.who !== 'COMET') {", "if (false && ev.e === 'boost' && ev.who !== 'COMET') {"))
        await sfxDied('rival boosts are silent again (the #440 regression)', sfxWired)
    } finally { writeFileSync(IDXJS, idxSrc) }
    try {
        writeFileSync(SIM, simSfxSrc.replace('mute: 700', 'mute: 1e9'))
        await sfxDied('the mute radius vanishes — a rival across the map still pops', sfxLaw)
    } finally { writeFileSync(SIM, simSfxSrc) }

    // #440 item-2 readability mutants: re-plant the blinding sprite and a
    // flat law and demand the readability gate above goes red.
    const viewDied = async (label, run) => {
        const before = R.fail
        await run()
        if (R.fail > before) console.log(`  MUTANT DIED — ${label}: the #440 readability gate is load-bearing`)
        else console.log(`  MUTANT SURVIVED — ${label}: the readability gate is BLIND`)
    }
    try {
        writeFileSync(ARTJS, artSrc.replace('const s = frac > RIVAL_VIEW.capFrac ? RIVAL_VIEW.capFrac / frac : 1', 'const s = 1'))
        await viewDied('the blinding portrait sprite returns (no shrink)', viewLaw)
    } finally { writeFileSync(ARTJS, artSrc) }
    try {
        writeFileSync(ARTJS, artSrc.replace('const alpha = Math.max(RIVAL_VIEW.minAlpha, 1 - over * 1.1)', 'const alpha = 1'))
        await viewDied('close rivals stay fully opaque — the road is gone', viewLaw)
    } finally { writeFileSync(ARTJS, artSrc) }
    try {
        writeFileSync(ARTJS, artSrc.replace('dampFrac: 0.25', 'dampFrac: 0.02'))
        await viewDied('far rivals ghost too (threshold swallowed the field)', viewLaw)
    } finally { writeFileSync(ARTJS, artSrc) }
    try {
        writeFileSync(IDXJS, idxSrc.replace('it.o ? rivalViewFx(h, H) : { s: 1, alpha: 1 }', '{ s: 1, alpha: 1 }'))
        await viewDied('the renderer bypasses the law (the #440 item-2 regression)', viewWired)
    } finally { writeFileSync(IDXJS, idxSrc) }

    // #440 item-6 engine-voice mutants: re-plant the plastic gear-step, the
    // dead pitch, the silent drift, the glass-cutting sand and the bypass.
    const sfx6Src = readFileSync(SFXJS, 'utf8')
    const sfx6Died = async (label, run) => {
        const before = R.fail
        await run()
        if (R.fail > before) console.log(`  MUTANT DIED — ${label}: the #440 engine-voice gate is load-bearing`)
        else console.log(`  MUTANT SURVIVED — ${label}: the engine-voice gate is BLIND`)
    }
    try {
        writeFileSync(SFXJS, sfx6Src.replace('const period = Math.max(3, 15 - v)', 'const period = Math.max(3, 15 - Math.round(v))'))
        await sfx6Died('the round(v) gear-step is back in the pop rate', engineLaw)
    } finally { writeFileSync(SFXJS, sfx6Src) }
    try {
        writeFileSync(SFXJS, sfx6Src.replace('const wob = ENGINE.wob1 * Math.sin(tick * ENGINE.wobR1) + ENGINE.wob2 * Math.sin(tick * ENGINE.wobR2)', 'const wob = 0'))
        await sfx6Died('pitch is dead-steady again — no wobble', engineLaw)
    } finally { writeFileSync(SFXJS, sfx6Src) }
    try {
        writeFileSync(SFXJS, sfx6Src.replace('if (driftT <= 0 || v <= SCRAPE.minV) return null', 'if (v <= SCRAPE.minV) return null'))
        await sfx6Died('scrape fires on straight wheels (driftT ignored)', engineLaw)
    } finally { writeFileSync(SFXJS, sfx6Src) }
    try {
        writeFileSync(SFXJS, sfx6Src.replace('freq: 300 + 500 * speed', 'freq: 3000 + 500 * speed'))
        await sfx6Died('sand reads brighter than kerb — cutoff swapped above the scrape', engineLaw)
    } finally { writeFileSync(SFXJS, sfx6Src) }
    try {
        writeFileSync(IDXJS, idxSrc.replace('engAcc += 1 / e.period', 'engAcc += 1 / (15 - Math.round(P.v))'))
        await sfx6Died('the engine loop bypasses the law\'s period (the #440 item-6 regression)', engineWired)
    } finally { writeFileSync(IDXJS, idxSrc) }
}

console.log(`\n${R.fail === 0 ? 'GREEN' : 'RED — ' + R.fail + ' failed'}`)
process.exit(R.fail === 0 ? 0 : 1)
