// tidalcheck.mjs — TIDAL RUSH, plain Node (zero DOM, zero browser).
// Proves three things per FORGE.md step 5: the game boots (a seeded race
// builds), its core rules hold (red-right/yellow-left judgement, miss chokes
// the throttle, progress-based skip policing — near OR far outside the line —
// boost economy, tricks bank on landing, laps count, the bay is bounded), and
// it can be won (autoPad takes P1 across seeds, on BOTH bays). Determinism is
// pinned twice: identical streams for one seed, divergence for another.
//
// Rung 2 (STORM BAY) adds: the sea is a table value — sunny ≡ WAVES forever,
// storm re-rolls per lap through a converging blend; lightning is sim-owned
// and never fires on sunny; the barrel roll scores; the shader is a uniform
// bridge — SEA_UNIFORMS appear in the GLSL text, seaUniforms() maps the live
// table into them exactly, and index.jsx writes them every frame. That is the
// drawn-sea ≡ ridden-sea proof, upgraded from "one constant table" to "every
// sea that ever re-rolls".
//
// Run: npm run tidalcheck                    (green)
//      node scripts/tidalcheck.mjs --mutate           (judgement muted → red)
//      node scripts/tidalcheck.mjs --mutate=swell     (swell re-roll dead → red)
//      node scripts/tidalcheck.mjs --mutate=rainoff   (rain wallpaper again → red)
//      node scripts/tidalcheck.mjs --mutate=push      (crosswind zeroed → red)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { plant, restoreAll } from './lib/mutateguard.mjs'

const mutArg = process.argv.find((a) => a.startsWith('--mutate'))
const MUT = mutArg ? (mutArg.split('=')[1] || 'judge') : null
let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`) } else { fail++; console.log(`  FAIL ${name}`) } }

// Plant the chosen mutant the honest way (guarded, remembered, rewound by
// mutateguard even if we die mid-run), THEN import the sim so ESM caches the
// mutated source.
if (MUT) {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const simPath = join(root, 'src/games/TidalRush/sim.js')
    const src = readFileSync(simPath, 'utf8')
    const ANCHORS = {
        // RED passes from ANY side — the slalom's core must notice.
        judge: { from: "const want = g.color === 'red' ? -1 : 1", to: 'const want = 1', note: 'RED-side judgement muted' },
        // STORM laps stop re-rolling the swell — "changes lap to lap" dies.
        swell: { from: 'gs.seaTarget = stormSea(gs.seed, c.lap)', to: 'gs.seaTarget = gs.seaTarget', note: 'per-lap swell re-roll pinned' },
        // the squall front freezes — the new sea never arrives.
        front: { from: 'gs.front.prog += FRONT_SPEED * DT', to: 'gs.front.prog += 0 * DT', note: 'squall front progress frozen' },
        // rain is wallpaper again (#3191) — the field never wets anyone.
        rainoff: { from: "if (gs.stage !== 'storm') return 0", to: 'return 0', note: 'rain field disabled everywhere' },
        // the squall stops shoving — crosswind drift zeroed.
        push: { from: 'const drift = RAIN_PUSH * rain * windGust(gs)', to: 'const drift = 0 * RAIN_PUSH * rain * windGust(gs)', note: 'crosswind drift zeroed' },
    }
    const a = ANCHORS[MUT]
    if (!a) { console.error(`unknown mutant '${MUT}' (have: ${Object.keys(ANCHORS).join(', ')})`); process.exit(1) }
    if (!src.includes(a.from)) { console.error(`mutant anchor missing in sim.js (${MUT})`); process.exit(1) }
    plant(simPath, src.replace(a.from, a.to))
    console.log(`[mutant] ${a.note} — check must go red`)
}

const { WAVES, heightAt, seaGLSL, seaGLSLFront, seaUniforms, SEA_UNIFORMS, SEA_UNIFORMS_B, FRONT_UNIFORMS, frontUniforms, frontW, mixHeight, sunnySea, stormSea, omega, FRONT_SPEED } = await import('../src/games/TidalRush/water.js')
const { makeGame, step, autoPad, stateOf, stateHash, LAPS, rainAt, windAt, windGust, RAIN_VIS, RAIN_DRAG, RAIN_PUSH, THRUST, DRAG } = await import('../src/games/TidalRush/sim.js')

const run = (gs, maxS = 240, padFn = null) => {
    const events = []
    let t = 0
    while (!gs.done && t < 60 * maxS) { step(gs, padFn ? padFn(gs) : autoPad(gs)); events.push(...gs.events); t++ }
    return events
}
const ampEq = (a, b, eps = 1e-9) => a.length === b.length && a.every((w, i) =>
    Math.abs(w.amp - b[i].amp) <= eps && Math.abs(w.len - b[i].len) <= eps)

// 1. boot + state shape
{
    const gs = makeGame(7)
    const s = stateOf(gs)
    ok('boot: fresh race at tick 0, 3 crafts, 10 gates', s.tick === 0 && gs.crafts.length === 3 && gs.course.gates.length === 10 && s.done === false)
    ok('state is JSON-safe', JSON.stringify(s) === JSON.stringify(JSON.parse(JSON.stringify(s))))
    ok('gates alternate red/yellow', gs.course.gates.every((g, i) => g.color === (i % 2 === 0 ? 'red' : 'yellow')))
    ok('state carries the rung-2 fields (stage/swell/flash)', 'stage' in s && 'swell' in s && 'flash' in s)
}

// 2. determinism: seed + identical pads ⇒ identical hashes; other seeds differ;
//    and the STORM stream is its own deterministic world
{
    const a = makeGame(7); const b = makeGame(7); const c = makeGame(8)
    const ha = [], hb = [], hc = []
    for (let t = 0; t < 900; t++) {
        const pa = autoPad(a)
        step(a, pa); step(b, { ...pa }); step(c, autoPad(c))
        if (t % 100 === 0) { ha.push(stateHash(a)); hb.push(stateHash(b)); hc.push(stateHash(c)) }
    }
    ok('same seed, same pads ⇒ identical hash every 100 ticks', ha.join(',') === hb.join(','))
    ok('different seed ⇒ divergent hash', ha.join(',') !== hc.join(','))

    const s1 = makeGame(7, 'storm'); const s2 = makeGame(7, 'storm')
    let hs1 = 0, hs2 = 0, hsSun = 0
    for (let t = 0; t < 600; t++) { step(s1, autoPad(s1)); step(s2, autoPad(s2)) }
    hs1 = stateHash(s1); hs2 = stateHash(s2); hsSun = stateHash(a)
    ok('storm is deterministic too', hs1 === hs2)
    ok('storm and sunny streams diverge', hs1 !== hsSun)
}

// 3. gate judgement: RED clean on the right, miss on the left; YELLOW mirrored
{
    const g = makeGame(7); const g0 = g.course.gates[0]
    const lat = { x: g0.tangent.z, z: -g0.tangent.x } // left of travel
    g.crafts[0].x = g0.x + lat.x * 3; g.crafts[0].z = g0.z + lat.z * 3
    g.crafts[0].heading = Math.atan2(g0.tangent.x, g0.tangent.z); g.crafts[0].speed = 12
    g.crafts[0].progress = g0.arc - 2
    g.crafts[0].progIdx = Math.round(((g0.arc - 2) / g.course.len) * 720) % 720
    for (let i = 0; i < 40 && g.crafts[0].judged[0] === 0; i++) step(g, autoPad(g))
    ok('RED judged clean when passed on the correct side', g.crafts[0].judged[0] === 1)

    const g2 = makeGame(7)
    g2.crafts[0].x = g0.x - lat.x * 3; g2.crafts[0].z = g0.z - lat.z * 3
    g2.crafts[0].heading = Math.atan2(g0.tangent.x, g0.tangent.z); g2.crafts[0].speed = 12
    g2.crafts[0].progress = g0.arc - 2; g2.crafts[0].progIdx = g.crafts[0].progIdx
    for (let i = 0; i < 40 && g2.crafts[0].judged[0] === 0; i++) step(g2, { throttle: 1, steer: 0, brake: false, a: false, b: false })
    ok('RED judged a miss from the wrong side', g2.crafts[0].judged[0] === -1)
    ok('a miss chokes the throttle', g2.crafts[0].penalty > 0)

    const y1 = makeGame(7); const gy = y1.course.gates[1]
    const latY = { x: gy.tangent.z, z: -gy.tangent.x }
    y1.crafts[0].x = gy.x - latY.x * 3; y1.crafts[0].z = gy.z - latY.z * 3
    y1.crafts[0].heading = Math.atan2(gy.tangent.x, gy.tangent.z); y1.crafts[0].speed = 12
    y1.crafts[0].progress = gy.arc - 2; y1.crafts[0].progIdx = Math.round(((gy.arc - 2) / y1.course.len) * 720) % 720
    for (let i = 0; i < 40 && y1.crafts[0].judged[1] === 0; i++) step(y1, { throttle: 1, steer: 0, brake: false, a: false, b: false })
    ok('YELLOW judged clean on ITS correct side (mirror of red)', y1.crafts[0].judged[1] === 1)
}

// 4. skip policing rides PROGRESS (rung-2 rewrite of the corridor rule):
//    far outside the old corridor still judges; across the bay still never
//    judges; a shortcut cannot pre-judge a gate out of order.
{
    const gs = makeGame(7)
    const p = gs.crafts[0]
    p.judged[0] = 1
    p.judged[1] = 1
    for (let i = 0; i < 60; i++) step(gs, { throttle: 0, steer: 0, brake: false, a: false, b: false })
    ok('distant gate stays unjudged from across the bay', p.judged[8] === 0)

    const g2 = makeGame(7)
    const g0 = g2.course.gates[0]
    const tan = g0.tangent
    g2.crafts[0].x = g0.x + tan.x * 15; g2.crafts[0].z = g0.z + tan.z * 15
    g2.crafts[0].progress = g0.arc + 15
    g2.crafts[0].progIdx = Math.round(((g0.arc + 15) / g2.course.len) * 720) % 720
    g2.crafts[0].heading = Math.atan2(tan.x, tan.z); g2.crafts[0].speed = 10
    step(g2, { throttle: 1, steer: 0, brake: false, a: false, b: false })
    ok('past the gate line unjudged ⇒ skip judged (inside the old corridor)', g2.crafts[0].judged[0] === -1)

    // THE loophole: 40 m outside the old 18 m corridor, past the line.
    const g3 = makeGame(7)
    const lat3 = { x: g0.tangent.z, z: -g0.tangent.x }
    g3.crafts[0].x = g0.x + tan.x * 15 + lat3.x * 40
    g3.crafts[0].z = g0.z + tan.z * 15 + lat3.z * 40
    g3.crafts[0].progress = g0.arc + 15
    g3.crafts[0].progIdx = g2.crafts[0].progIdx
    g3.crafts[0].heading = Math.atan2(tan.x, tan.z); g3.crafts[0].speed = 10
    step(g3, { throttle: 1, steer: 0, brake: false, a: false, b: false })
    ok('far-outside skip loophole CLOSED: 40 m lateral past the line judges a miss', g3.crafts[0].judged[0] === -1)

    // and an out-of-order buoy clip must NOT pre-judge: gate 3's radius while
    // gate 0 is still pending, ahead of its line ⇒ nothing happens to gate 3.
    const g4 = makeGame(7)
    const g3d = g4.course.gates[3]
    g4.crafts[0].x = g3d.x; g4.crafts[0].z = g3d.z
    g4.crafts[0].progress = g3d.arc - 1
    g4.crafts[0].progIdx = Math.round(((g3d.arc - 1) / g4.course.len) * 720) % 720
    g4.crafts[0].speed = 10
    step(g4, { throttle: 1, steer: 0, brake: false, a: false, b: false })
    ok('a shortcut across the middle cannot pre-judge a later gate', g4.crafts[0].judged[3] === 0)
}

// 5. boost economy: clean passes charge it; burning pushes speed past cruise
{
    const gs = makeGame(7)
    let maxV = 0, sawBoost = false
    for (let t = 0; t < 60 * 70 && !gs.done; t++) {
        step(gs, autoPad(gs))
        const p = gs.crafts[0]
        if (p.boosting) sawBoost = true
        maxV = Math.max(maxV, p.speed)
    }
    ok('autoPad charges and burns the sprint', sawBoost)
    ok('sprint pushes speed past cruise (>17 m/s)', maxV > 17)
}

// 6. air + tricks: kickers fly, the flat 360 banks +250, the barrel +200
{
    const gs = makeGame(7)
    let airs = 0, tricks = 0, barrels = 0
    const evs = run(gs, 90)
    airs = evs.filter((e) => e.type === 'air').length
    tricks = evs.filter((e) => e.type === 'trick').length
    barrels = evs.filter((e) => e.type === 'barrel').length
    ok('the bay has real kickers (autoPad flies)', airs > 5)
    ok('a held spin completes a 360 trick at least once per race', tricks > 0)

    const g2 = makeGame(7)
    let done = false
    for (let t = 0; t < 60 * 120 && !done; t++) {
        const p = g2.crafts[0]
        const pad = autoPad(g2); pad.a = p.airborne
        const score0 = g2.score
        step(g2, pad)
        if (g2.events.find((ev) => ev.type === 'trick')) { done = true; ok('trick scores +250 on landing', g2.score - score0 >= 250) }
    }
    if (!done) ok('trick scores +250 on landing', false)

    // BARREL: deterministic forced air, full-lock steer, land after a full roll
    const g3 = makeGame(7)
    const p = g3.crafts[0]
    for (let t = 0; t < 92; t++) step(g3, { throttle: 0, steer: 0, brake: false, a: false, b: false }) // wait out the start lights
    p.airborne = true; p.vy = 3.0; p.y = heightAt(p.x, p.z, g3.t, g3.seaCur) + 3.0; p.speed = 12
    let sawBarrel = false
    for (let t = 0; t < 90 && !sawBarrel; t++) {
        step(g3, { throttle: 1, steer: 1, brake: false, a: false, b: false })
        sawBarrel = g3.events.some((e) => e.type === 'barrel')
    }
    ok('full-lock steer airborne completes a BARREL ROLL (+200)', sawBarrel)
}

// 7. win: autoPad takes P1 on every seed on BOTH bays, sane times, bounded
{
    const times = []
    let allWin = true, bounded = true, lapOK = true
    for (const seed of [1, 7, 42, 99, 1234]) {
        const gs = makeGame(seed)
        run(gs, 240)
        if (!gs.done || gs.rank !== 1) allWin = false
        times.push(gs.t)
        if (gs.crafts[0].lap !== LAPS + 1) lapOK = false
        for (const c of gs.crafts) {
            const rr = (c.x / (74 + 27)) ** 2 + (c.z / (46 + 27)) ** 2
            if (rr > 1.3) bounded = false
        }
    }
    ok('autoPad WINS sunny (P1) on every seed', allWin)
    ok('finish times sane (45–120 s)', times.every((t) => t > 45 && t < 120))
    ok('laps counted 1→3, three gatesets completed', lapOK)
    ok('nobody escapes the bay bounds', bounded)

    const stormTimes = []
    let stormWin = true, stormBounds = true
    for (const seed of [1, 7, 42, 99]) {
        const gs = makeGame(seed, 'storm')
        run(gs, 240)
        if (!gs.done || gs.rank !== 1) stormWin = false
        stormTimes.push(gs.t)
        for (const c of gs.crafts) {
            const rr = (c.x / (74 + 27)) ** 2 + (c.z / (46 + 27)) ** 2
            if (rr > 1.3) stormBounds = false
        }
    }
    ok('autoPad WINS storm (P1) too — the storm is rideable', stormWin)
    ok('storm finish times sane (45–140 s)', stormTimes.every((t) => t > 45 && t < 140))
    ok('storm keeps everyone in the bay', stormBounds)
}

// 8. CPU field is alive: rivals advance laps and stay near the leader
{
    const gs = makeGame(7)
    for (let t = 0; t < 60 * 40 && !gs.done; t++) step(gs, autoPad(gs))
    const [p, mako, tundra] = gs.crafts
    ok('rivals race: both lapped into the pack within a straight', mako.progress > p.progress * 0.55 && tundra.progress > p.progress * 0.4)
}

// 9. THE BRIDGE: uniform-slot GLSL, live-table mapping, per-frame wiring
{
    const glsl = seaGLSL()
    let names = true
    for (const n of SEA_UNIFORMS) if (!glsl.includes(n)) names = false
    ok('GLSL declares every slot uniform from water.js', names && SEA_UNIFORMS.length === 24)
    const sinTerms = (glsl.match(/sin\(f\)/g) || []).length
    const cosTerms = (glsl.match(/cos\(f\)/g) || []).length
    ok('GLSL is fully unrolled: 4 sin + 4 cos terms (SwiftShader-safe, #3134)', sinTerms === 4 && cosTerms === 4)
    ok('GLSL has no array constructors (GLSL ES 1.00)', !/vec[234]\[\d/.test(glsl))

    const table = stormSea(7, 2)
    const su = seaUniforms(table)
    let bridge = true
    for (let i = 0; i < 4; i++) {
        const w = table[i]
        if (su[`uDir${i}`][0] !== w.dx || su[`uDir${i}`][1] !== w.dz) bridge = false
        if (su[`uA${i}`] !== w.amp || su[`uQ${i}`] !== w.qa) bridge = false
        if (su[`uK${i}`] !== w.k || su[`uO${i}`] !== w.om || su[`uPh${i}`] !== w.phase) bridge = false
    }
    ok('seaUniforms maps a live storm table into the uniforms exactly', bridge)
    const omOk = stormSea(1, 1).every((w) => Math.abs(w.om - omega(w.len)) < 1e-12)
    ok('every storm wave obeys deep-water dispersion ω=√(gk)', omOk)

    const artSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/index.jsx'), 'utf8')
    const artJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/art.js'), 'utf8')
    ok('the shell pushes the LIVE seas + front into the shader every frame (pushSea)', artSrc.includes('pushSea(sea.mat, gs)') && artJs.includes("seaUniforms(gs.seaCur)") && artJs.includes("seaUniforms(gs.seaTarget, 'B')") && artJs.includes('frontUniforms(gs.front)'))
}

// 10. restart: a fresh game after a finished one starts clean
{
    const gs = makeGame(7)
    run(gs, 240)
    const gs2 = makeGame(7)
    ok('restart returns a fresh tick-0 race', gs.done && gs2.tick === 0 && !gs2.done && stateHash(gs) !== stateHash(gs2))
}

// 11. SUNNY is frozen heritage: the rung-1 bay never moves
{
    const gs = makeGame(7)
    const sunny = sunnySea()
    let stable = true
    for (let t = 0; t < 60 * 80 && !gs.done; t++) { step(gs, autoPad(gs)); if (!ampEq(gs.seaCur, sunny, 1e-12)) stable = false }
    ok('sunny sea ≡ WAVES table, every tick of the race', stable && ampEq(gs.seaCur, sunny, 1e-12))
    ok('sunny race never schedules lightning', gs.flash === 0)
}

// 12. STORM BAY: table value, per-lap re-roll through a converging blend
{
    const gs = makeGame(7, 'storm')
    ok('storm starts on stormSea(seed, lap 1)', ampEq(gs.seaCur, stormSea(7, 1)))
    ok('storm swell towers over sunny (main amp > sunny)', gs.seaCur[0].amp > sunnySea()[0].amp)
    const shape = stormSea(7, 1)
    const unit = shape.every((w) => Math.abs(Math.hypot(w.dx, w.dz) - 1) < 1e-9)
    const boundedAmp = shape.every((w) => w.amp > 0.15 && w.amp < 2.4)
    let qk = 0; for (const w of shape) qk += w.qa * w.k
    ok('storm waves: unit dirs, sane amps, no crest overhang (ΣQ·k ≤ 0.55)', unit && boundedAmp && qk <= 0.5501)
    ok('storm tables are seeded-pure: same seed+lap ⇒ same sea', ampEq(stormSea(9, 3), stormSea(9, 3)))
    ok('lap tables actually differ (the swell changes lap to lap)', !ampEq(stormSea(9, 1), stormSea(9, 3)))

    // race: after the lap-2 swell event, the target is lap 2's sea and the
    // live blend converges onto it within the blend window
    const g2 = makeGame(7, 'storm')
    let sawSwell = false
    let swells = 0
    for (let t = 0; t < 60 * 240 && !g2.done; t++) {
        step(g2, autoPad(g2))
        if (g2.events.some((e) => e.type === 'swell')) { sawSwell = true; swells++; if (swells === 1) {
            ok('swell shift lands the lap-2 sea on the target', ampEq(g2.seaTarget, stormSea(7, 2)))
        } }
    }
    ok('the storm re-rolls the swell mid-race', sawSwell && swells === 2) // laps 2 and 3
    ok('the live sea converges onto the re-rolled target', ampEq(g2.seaCur, g2.seaTarget, 1e-3))
}

// 13. lightning: storm-owned, seeded, visible; never on sunny
{
    const gs = makeGame(7, 'storm')
    let flashes = 0, sawLit = false
    for (let t = 0; t < 60 * 120 && !gs.done; t++) {
        step(gs, autoPad(gs))
        if (gs.events.some((e) => e.type === 'flash')) { flashes++; sawLit = gs.flash > 0.9 }
    }
    ok('the storm lightens (≥1 sim-scheduled flash per 2 min)', flashes >= 1 && sawLit)
    const gs2 = makeGame(7)
    let sunFlash = 0
    for (let t = 0; t < 60 * 80 && !gs2.done; t++) { step(gs2, autoPad(gs2)); if (gs2.events.some((e) => e.type === 'flash')) sunFlash++ }
    ok('sunny skies stay dry — zero lightning', sunFlash === 0)
}

// 14. the field behaves like water: bounded, continuous, wets. (Step small
//     and threshold loose enough for Gerstner crest-compression; a broken
//     field — NaN, blowup, flatline — still trips it.)
{
    let maxH = 0
    let prev = heightAt(-160, 13, 0)
    let smooth = true
    for (let i = 1; i < 4000; i++) {
        const x = -160 + i * 0.08, h = heightAt(x, 13, i * 0.016)
        if (!Number.isFinite(h)) { smooth = false; break }
        maxH = Math.max(maxH, Math.abs(h))
        if (Math.abs(h - prev) > 0.5) smooth = false
        prev = h
    }
    ok('sunny surface bounded (<2.5 m) and continuous', maxH < 2.5 && smooth)
    const sea = stormSea(7, 3)
    let maxS = 0, smoothS = true, prevS = heightAt(-160, 13, 0, sea)
    for (let i = 1; i < 4000; i++) {
        const x = -160 + i * 0.08, h = heightAt(x, 13, i * 0.016, sea)
        if (!Number.isFinite(h)) { smoothS = false; break }
        maxS = Math.max(maxS, Math.abs(h))
        if (Math.abs(h - prevS) > 1.1) smoothS = false // stormier, but still continuous
        prevS = h
    }
    ok('storm surface bounded (<4.2 m) and continuous', maxS < 4.2 && smoothS)
}

// 15. RUNG 3 — the squall front: it travels, it judges nothing but the sea,
//     it completes inside a lap, CPU and shader evaluate the SAME mix.
{
    const gs = makeGame(7, 'storm')
    ok('sunny never raises a front', gs.front === null)
    let sawFront = false, frontT0 = -1, doneT = -1, spatialOk = false, exact = true, seaSnap = false
    for (let t = 0; t < 60 * 240 && !gs.done; t++) {
        step(gs, autoPad(gs))
        if (gs.front && !sawFront) { sawFront = true; frontT0 = gs.t }
        if (gs.front && gs.front.prog > 40 && !spatialOk) {
            spatialOk = true
            const f = gs.front
            const sB = Math.max(-f.h + 2, Math.min(f.h, f.prog - f.h - 0.6 * f.band))
            const sA = Math.max(-f.h, Math.min(f.h - 2, f.prog - f.h + 0.6 * f.band))
            const b = { x: f.dx * sB, z: f.dz * sB }, a2 = { x: f.dx * sA, z: f.dz * sA }
            if (frontW(b.x, b.z, f) !== 1 || frontW(a2.x, a2.z, f) !== 0) exact = false
            if (Math.abs(mixHeight(b.x, b.z, gs.t, gs.seaCur, gs.seaTarget, frontW(b.x, b.z, f)) - heightAt(b.x, b.z, gs.t, gs.seaTarget)) > 1e-12) exact = false
            if (Math.abs(mixHeight(a2.x, a2.z, gs.t, gs.seaCur, gs.seaTarget, frontW(a2.x, a2.z, f)) - heightAt(a2.x, a2.z, gs.t, gs.seaCur)) > 1e-12) exact = false
        }
        if (sawFront && doneT < 0 && !gs.front) {
            doneT = gs.t
            seaSnap = gs.seaCur.every((w, i) => w.amp === gs.seaTarget[i].amp && w.phase === gs.seaTarget[i].phase)
        }
    }
    ok('the storm raises a squall front on the lap-2 re-roll', sawFront)
    ok('behind the front rides the NEW sea, ahead the OLD — exact', spatialOk && exact)
    ok('the front crosses inside ~12 s and the new sea takes over', doneT > 0 && doneT - frontT0 < 12 && seaSnap)
    ok('front speed is the tuned squall pace', FRONT_SPEED === 26)
    ok('state carries the rung-3 field (frontPct)', 'frontPct' in stateOf(gs))

    // sunny race: gs.front stays null for every tick
    const sun = makeGame(7)
    let sunnyFront = false
    for (let t = 0; t < 60 * 80 && !sun.done; t++) { step(sun, autoPad(sun)); if (sun.front) sunnyFront = true }
    ok('SUNNY BAY never raises a front mid-race', !sunnyFront)

    // determinism ACROSS a front: identical replays through lap-2 weather
    const r1 = makeGame(11, 'storm'), r2 = makeGame(11, 'storm')
    for (let t = 0; t < 60 * 45; t++) { step(r1, autoPad(r1)); step(r2, autoPad(r2)) }
    ok('storm replays match through the squall (hash)', stateHash(r1) === stateHash(r2))
}

// 16. RUNG 3 — GLSL twin + bridge for the two-slot front shader
{
    const glsl = seaGLSLFront()
    let names = true
    for (const n of [...SEA_UNIFORMS, ...SEA_UNIFORMS_B, ...FRONT_UNIFORMS]) if (!glsl.includes(n)) names = false
    ok('front GLSL declares both slot sets + the front uniforms (48+4 names)', names && SEA_UNIFORMS_B.length === 24 && FRONT_UNIFORMS.length === 4)
    ok('front GLSL carries clamp+smoothstep and mix (the CPU twin)', glsl.includes('clamp(') && glsl.includes('3.0 - 2.0 * t') && glsl.includes('mix(hA, hB, w)'))
    const sinTerms = (glsl.match(/sin\(f\)/g) || []).length
    ok('front GLSL is fully unrolled for BOTH tables (8 sin terms, SwiftShader-safe)', sinTerms === 8)
    ok('front GLSL has no array constructors (GLSL ES 1.00)', !/vec[234]\[\d/.test(glsl))

    const gs = makeGame(7, 'storm')
    for (let t = 0; t < 60 * 40 && !gs.front && !gs.done; t++) step(gs, autoPad(gs)) // catch the live front
    const fu = frontUniforms(gs.front)
    const bridgeOk = gs.front
        ? (fu.uFN[0] === gs.front.dx && fu.uFN[1] === gs.front.dz && fu.uFP === gs.front.prog && fu.uFH === gs.front.h && fu.uFW === gs.front.band)
        : (fu.uFP === -1e4 && fu.uFW === 1)
    ok('frontUniforms maps the live front (or its parked state) exactly', bridgeOk)
    const suB = seaUniforms(gs.seaTarget, 'B')
    let bOk = true
    for (let i = 0; i < 4; i++) {
        const w = gs.seaTarget[i]
        if (suB[`uDir${i}B`][0] !== w.dx || suB[`uA${i}B`] !== w.amp || suB[`uQ${i}B`] !== w.qa) bOk = false
    }
    ok('the incoming table lands in the B slots exactly', bOk)
}

// 17. RUNG 3 — the air pays: airbonus events are exact, bare air banks nothing
{
    const gs = makeGame(7, 'storm')
    const ev = run(gs, 240)
    const bonuses = ev.filter((e) => e.type === 'airbonus')
    ok('landed tricks bank an air-time bonus', bonuses.length > 0)
    ok('every bonus equals min(100, round(airT×50))', bonuses.every((e) => e.pts === Math.min(100, Math.round(e.airT * 50)) && e.pts > 0))
    ok('bonus is capped at +100', bonuses.every((e) => e.pts <= 100))
    const tricks = ev.filter((e) => e.type === 'trick' || e.type === 'barrel').length
    ok('one bonus per trick (one trick per air)', bonuses.length <= tricks)

    // bare air — no A, no lock — banks nothing
    const g2 = makeGame(7, 'storm')
    let sawAir = false, bareBonus = 0
    for (let t = 0; t < 60 * 240 && !g2.done; t++) {
        step(g2, { throttle: 1, steer: 0, brake: false, a: false, b: false })
        if (g2.events.some((e) => e.type === 'air')) sawAir = true
        if (g2.events.some((e) => e.type === 'airbonus')) bareBonus++
    }
    ok('a bare air banks nothing (no spin, no bonus)', sawAir && bareBonus === 0)
}

// 18. RAIN (#3191) — the squall is terrain: it gates by stage+front, bites
// speed, walks the hull downwind, dims the gates, and announces itself. Sunny
// is and stays dry.
{
    const sun = makeGame(7)
    let sunnyDry = true, sunnyRainEvt = 0
    for (let t = 0; t < 600; t++) {
        step(sun, autoPad(sun))
        if (rainAt(sun, sun.crafts[0].x, sun.crafts[0].z) !== 0) sunnyDry = false
        if (sun.events.some((e) => e.type === 'rain')) sunnyRainEvt++
    }
    ok('SUNNY never rains — field, state and events all agree', sunnyDry && stateOf(sun).rain === 0 && sunnyRainEvt === 0)

    const st = makeGame(7, 'storm')
    step(st, autoPad(st))
    ok('deep STORM (no front up) rains everywhere', rainAt(st, 0, 0) === 1 && rainAt(st, 40, -20) === 1)
    ok('state reports the hull rain (finite, above zero)', Number.isFinite(stateOf(st).rain) && stateOf(st).rain > 0)

    const st2 = makeGame(7, 'storm')
    for (let t = 0; t < 60 * 30; t++) step(st2, autoPad(st2))
    ok('mid-race the rain is SPATIAL — full behind the front, dry ahead', (() => {
        const fr = st2.front
        if (!fr || fr.prog < fr.band) return false
        return rainAt(st2, -fr.dx * fr.h, -fr.dz * fr.h) === 1 && rainAt(st2, fr.dx * fr.h, fr.dz * fr.h) < 0.05
    })())

    // drift isolation: throttle 0, speed 0 — only the wind can move the hull
    const wet = makeGame(7, 'storm')
    const c0 = wet.crafts[0]
    const x0 = c0.x, z0 = c0.z
    const wnd = windAt(wet)
    let bumped = false
    for (let t = 0; t < 90; t++) {
        step(wet, { throttle: 0, steer: 0, brake: false, a: false, b: false })
        if (wet.events.some((e) => e.type === 'bump')) bumped = true
    }
    const ddx = c0.x - x0, ddz = c0.z - z0
    const dl = Math.hypot(ddx, ddz)
    ok('the crosswind WALKS a stationary hull in the squall', !bumped && dl > 0.4 && dl < 4)
    ok('drift points along the wind, not somewhere random', dl > 0 && (ddx * wnd.x + ddz * wnd.z) / dl > 0.999)

    const dry = makeGame(7)
    const k0 = dry.crafts[0]
    const dx0 = k0.x, dz0 = k0.z
    for (let t = 0; t < 90; t++) step(dry, { throttle: 0, steer: 0, brake: false, a: false, b: false })
    ok('dry water never shoves (exact zero)', k0.x === dx0 && k0.z === dz0)

    // the bite: wet terminal speed sits 5-15 % under dry; gusts vary, the law does not
    const vtDry = Math.sqrt(THRUST / DRAG), vtWet = Math.sqrt(THRUST / (DRAG + RAIN_DRAG))
    ok('rain drag bites top speed 5-15 %', vtWet / vtDry < 0.95 && vtWet / vtDry > 0.85)
    ok('push is a shove, not a gale (1-2.5 m/s at full rain)', RAIN_PUSH >= 1 && RAIN_PUSH <= 2.5)
    ok('gate-dim ceiling: aggressive but never invisible', RAIN_VIS > 0.5 && RAIN_VIS < 0.9)

    // band-edge events: a full storm race crosses the band on AND off
    const race = makeGame(7, 'storm')
    let onN = 0, offN = 0
    for (let t = 0; t < 60 * 240 && !race.done; t++) {
        step(race, autoPad(race))
        for (const e of race.events) if (e.type === 'rain') { if (e.on) onN++; else offN++ }
    }
    ok('the band edge announces itself (in AND out over a race)', onN >= 1 && offN >= 1)

    // DRAWN = RIDDEN: the shell dims gates by the rain at EACH gate and rates
    // its drops by the rain at Kai's hull (#3191)
    const jsx = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/index.jsx'), 'utf8')
    const artJs2 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/art.js'), 'utf8')
    ok('gates dim toward storm fog by rain at THEIR point', jsx.includes('buoyDim(b, RAIN_VIS * rainAt(gs, g0.x, g0.z))') && artJs2.includes('lerp(BUOY_DIM_COL'))
    ok('drop density follows the rain at Kai hull', jsx.includes('rainAt(gs, gs.crafts[0].x, gs.crafts[0].z)') && jsx.includes('rainVis > 0.3'))
    ok('the crossing gets a wind cue', jsx.includes("e.type === 'rain'") && jsx.includes('sfx.rain(e.on)'))
}

console.log(`\ntidalcheck: ${pass}/${pass + fail} ${fail ? 'FAILURES' : 'ok'}${MUT ? ` (mutant: ${MUT})` : ''}`)
if (MUT) {
    console.log(fail ? 'mutant caught — the check CAN fail' : `MUTANT SURVIVED (${MUT}) — check is blind`)
}
restoreAll()
process.exit(MUT ? (fail ? 0 : 1) : (fail ? 1 : 0))
