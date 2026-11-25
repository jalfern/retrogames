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
        // the moorings stop riding the drawn sea (#3159) — props glued to flat.
        moorsea: { file: 'src/games/TidalRush/index.jsx', from: 'const wb = frontW(s.x, s.z, gs.front)', to: 'const wb = 0', note: 'moored props stop riding the sea Kai rides' },
        // the anchorage stops following the course seed (#3159) — spots jitter.
        moorrand: { file: 'src/games/TidalRush/art.js', from: 'let s = (seed >>> 0) || 1', to: 'let s = (Math.random() * 4294967296) >>> 0', note: 'anchorage stops following the seed' },
        // the gulls freeze mid-air (#3218) — the sky stops moving.
        gullfreeze: { file: 'src/games/TidalRush/index.jsx', from: 'gullFrame(gm, flock, bird, t)', to: 'gullFrame(gm, flock, bird, 0)', note: 'gulls freeze mid-air' },
        // the shallows stop shimmering (#3218) — beach caustics gone.
        causticoff: { file: 'src/games/TidalRush/art.js', from: 'float shoreK = length(vWorld.xz) / 180.0;', to: 'float shoreK = 0.0;', note: 'beach caustics disabled' },
        // the flat 360 lands in silence again (#3218) — no whoosh-in.
        trickdry: { file: 'src/games/TidalRush/index.jsx', from: "trick: () => { audioController.playSweep(1250, 240, 0.2, 'triangle', 0.06);", to: 'trick: () => {', note: 'flat-360 landing loses its whoosh-in' },
        // hull 0 is fed the local analog pad instead of its wire bytes (#3220) —
        // the exact divergence trap: host runs analog, guest runs the bits.
        wirefeed: { file: 'src/games/TidalRush/index.jsx', from: 'fromWire(mirrors[0].get(k) || toWire({}))', to: 'readPad()', note: 'hull 0 fed local analog — boxes diverge' },
    }
    const a = ANCHORS[MUT]
    if (!a) { console.error(`unknown mutant '${MUT}' (have: ${Object.keys(ANCHORS).join(', ')})`); process.exit(1) }
    const target = join(root, a.file || 'src/games/TidalRush/sim.js')
    const src = readFileSync(target, 'utf8')
    if (!src.includes(a.from)) { console.error(`mutant anchor missing in ${a.file || 'sim.js'} (${MUT})`); process.exit(1) }
    plant(target, src.replace(a.from, a.to))
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
    ok('drop density follows the rain at MY hull (Kai offline, my ski online #3220)', jsx.includes('rainAt(gs, gs.crafts[mySeat()].x, gs.crafts[mySeat()].z)') && jsx.includes('rainVis > 0.3'))
    ok('the crossing gets a wind cue', jsx.includes("e.type === 'rain'") && jsx.includes('sfx.rain(e.on)'))
}

// --- moorings (#3159): the bay is lived-in --------------------------------------
// Seeded sloops + a bell buoy ride the DRAWN sea inside the bounds. Proof the
// sim stays blind to them: sim.js never mentions the props, and the shell rides
// them on the SAME mixWater/mixHeight/frontW path the gates use.
{
    const { RX, RZ } = await import('../src/games/TidalRush/sim.js')
    const { boatSpots } = await import('../src/games/TidalRush/art.js')
    const simJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/sim.js'), 'utf8')
    const artJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/art.js'), 'utf8')
    const spots = boatSpots(7)
    const jsx2 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/index.jsx'), 'utf8')
    ok('a fleet anchors the bay: three sloops + a bell buoy', spots.length === 4 && spots.filter((s) => !s.bell).length === 3 && spots.filter((s) => s.bell).length === 1)
    ok('one course seed, one anchorage (same seed ⇒ same spots)', JSON.stringify(boatSpots(7)) === JSON.stringify(spots) && JSON.stringify(boatSpots(52)) === JSON.stringify(boatSpots(52)))
    ok('the bay changes with the course (other seed ⇒ other spots)', JSON.stringify(boatSpots(52)) !== JSON.stringify(spots))
    ok('props sit INSIDE the gate ellipse — never on the race line', spots.every((s) => (s.x / RX) ** 2 + (s.z / RZ) ** 2 <= 0.85))
    ok('the bell buoy waits where the first gates carry the pack', (() => { const b = spots.find((s) => s.bell); return b && Math.hypot(b.x, b.z) > 20 })())
    ok('the sim never hears of the moorings (decorations cannot touch rules)', !/boatSpots|makeBoat|makeBellBuoy|mooring|scenery/i.test(simJs))
    ok('props ride the SAME sea the gates do (frontW + mixWater/mixHeight)', jsx2.includes('frontW(s.x, s.z, gs.front)') && jsx2.includes('mixWater(s.x, s.z, t, gs.seaCur, gs.seaTarget, wb)'))
    ok('props dim storm-side like the gates (#3191 language)', jsx2.includes('buoyDim(s.g, RAIN_VIS * rainAt(gs, s.x, s.z))'))
    ok('a new seed re-hitches the fleet in the shell', jsx2.includes('gs.course.seed !== moorSeed'))
    ok('the bell rings at the buoy, not on a timer (proximity + cooldown)', jsx2.includes('< 16)') && jsx2.includes('bellCool = 5'))
    ok('masts and bells are original flat-shaded shapes', artJs.includes('export function makeBoat') && artJs.includes('export function makeBellBuoy') && artJs.includes('flatShading: true'))
}

// --- gulls & shallows (#3218): the rung-1 tail moves -------------------------
// A seeded flock wheels over the anchorage and the outer bay carries beach
// caustics. Both are decoration — the sim stays blind — so the proof is the
// same shape as the moorings block: seed determinism, shell wiring, and a
// source pin on the shader terms.
{
    const { RX } = await import('../src/games/TidalRush/sim.js')
    const { gullSpots, makeGull, gullFrame } = await import('../src/games/TidalRush/art.js')
    const artJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/art.js'), 'utf8')
    const jsx2 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/index.jsx'), 'utf8')
    const simJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/TidalRush/sim.js'), 'utf8')
    const f7 = gullSpots(7)
    ok('three gulls wheel over the anchorage, seeded by the course', f7.birds.length === 3 && JSON.stringify(gullSpots(7)) === JSON.stringify(f7) && JSON.stringify(gullSpots(52)) !== JSON.stringify(f7))
    ok('the flock keeps its infield — orbit stays clear of the gate ring', [f7, gullSpots(52)].every((f) => Math.hypot(f.cx, f.cz) + Math.max(...f.birds.map((b) => b.r)) < RX * 0.62))
    const gA = makeGull(); const gB = makeGull()
    gullFrame(gA, f7, f7.birds[0], 3.7)
    gullFrame(gB, f7, f7.birds[0], 3.7)
    ok('a bird at clock t sits where the flock says (frame is pure, airborne)', gA.position.equals(gB.position) && gA.position.y > 4)
    ok('the shell flies the flock on the LIVE clock (everything moves)', jsx2.includes('gullFrame(gm, flock, bird, t)'))
    ok('a new course seed re-hitches the flock with the fleet', jsx2.includes('flock = gullSpots(moorSeed)'))
    ok('the sim never sees the birds (decoration cannot touch rules)', !/gull|gullSpots|gullFrame/i.test(simJs))
    ok('gulls are original flat-shaded shapes', artJs.includes('export function makeGull') && artJs.includes('const tip = new THREE.MeshStandardMaterial') && artJs.includes('flatShading: true'))
    // beach caustics: shimmer keyed to the outer bay, storm-swallowed, and the
    // shader divisor must track the mesh span so a resize trips the gate.
    const sizeM = artJs.match(/const SIZE = (\d+)/)
    ok('the shallows shimmer: caustics keyed to distance from the bay mouth', artJs.includes('float shoreK = length(vWorld.xz) /') && artJs.includes('pow(csA * csB, 2.5) * shallow'))
    ok('the caustic ring tracks the mesh span (divisor = SIZE/2)', sizeM !== null && artJs.includes(`/ ${Number(sizeM[1]) / 2}.0`))
    ok('storm water swallows the shimmer', artJs.includes('shallow * (1.0 - uStorm * 0.85)'))
    // the flat 360 lands with air in it: sfx.trick carries a whoosh sweep.
    ok('the flat-360 landing carries a whoosh-in', /trick: \(\) => \{ audioController\.playSweep\(/.test(jsx2))
}

// --- online rooms (#3220): wire semantics, lockstep parity, takeover ----------
{
    const HERE = join(dirname(fileURLToPath(import.meta.url)), '..')
    const jsxNet = readFileSync(join(HERE, 'src/games/TidalRush/index.jsx'), 'utf8')
    const { SEATS, PAD_DELAY, HASH_EVERY, toWire, fromWire, assembleSeatPads } = await import('../src/games/TidalRush/net.js')
    const { createLockStep } = await import('../src/utils/lockstep.js')

    ok('the room seats three — KAI MAKO TUNDRA', SEATS === 3)
    ok('the wire carries six bits, and full-lock survives it exactly (the BARREL input)',
        JSON.stringify(toWire({ throttle: 1, steer: 0.8, brake: true, a: true, b: true })) === JSON.stringify({ l: false, r: true, u: true, d: true, a: true, s: true })
        && fromWire({ l: true, r: false, u: false, d: false, a: false, s: false }).steer === -1)
    ok('a half-commit quantises (steer 0.4 is not a lean on the wire)',
        fromWire(toWire({ throttle: 1, steer: 0.4, brake: false, a: false, b: false })).steer === 0)
    ok('hull 0 rides its wire bytes, never local analog (the divergence trap)',
        jsxNet.includes('fromWire(mirrors[0].get(k) || toWire({}))') && !/step\(gs, readPad\(\)/.test(jsxNet))
    ok('received pads are stamped by seat and fed to the referee',
        jsxNet.includes('if (mirrors[s]) mirrors[s].set(m.k | 0, m.p)') && jsxNet.includes('ls.gotPad(m.k | 0, m.p, s)'))
    ok('the bay pauses offline only — a live room never starves the pad stream',
        jsxNet.includes("screenRef.current === 'play' && !net.racing"))

    // --- human seats in the sim -------------------------------------------------
    const SEED = 0x5eed01
    const NEUTRAL = () => ({ throttle: 0, steer: 0, brake: false, a: false, b: false })
    const soloRun = (humans, late) => {
        const gs = makeGame(SEED, 'sunny')
        gs.crafts.forEach((c, i) => { c.human = humans.includes(i) })
        for (let k = 0; k < 600; k++) {
            const seatPads = humans.includes(1)
                ? { 1: k > 120 ? { throttle: 1, steer: 0, brake: false, a: false, b: false } : NEUTRAL() }
                : {}
            step(gs, { throttle: 1, steer: 0, brake: false, a: false, b: false }, seatPads)
        }
        return gs
    }
    const cpuAll = soloRun([], false)
    const h1a = soloRun([1], true), h1b = soloRun([1], true)
    ok('the human-seat path is deterministic (same seed, same pads, same hash)',
        stateHash(h1a) === stateHash(h1b))
    ok('a seat on empty pads coasts — it never flies itself',
        h1a.crafts[1].progress < cpuAll.crafts[1].progress - 5)
    ok('a human seat skips the autopilot rng draw (streams stay room-wide)',
        h1a.rngS !== cpuAll.rngS && h1a.tick === cpuAll.tick)

    // --- two boxes, one sea ------------------------------------------------------
    const makeBox = (seat, humans, padOf) => {
        const gs = makeGame(SEED, 'storm')
        gs.crafts.forEach((c, i) => { c.human = humans.includes(i) })
        const mirrors = [new Map(), new Map(), new Map()]
        const box = { seat, gs, mirrors, hashes: [], desync: false, alone: false, dead: false, sibs: [] }
        box.ls = createLockStep({
            delay: PAD_DELAY, hashEvery: HASH_EVERY,
            // mirrors the room layer: every frame gets the sender's seat stamp.
            send: (m) => { if (m.t === 'pad') box.mirrors[seat].set(m.k, m.p); for (const b of box.sibs) if (!b.dead) b.onMsg(Object.assign({}, m, { s: seat })) },
        })
        box.ls.setPeers(humans.filter((s) => s !== seat))
        box.onMsg = (m) => {
            if (box.dead) return
            if (m.t === 'pad') { box.mirrors[m.s].set(m.k, m.p); if (m.s !== seat) box.ls.gotPad(m.k, m.p, m.s) }
            else if (m.t === 'hs') { const r = box.ls.gotHash(m.k, m.h, m.s); if (r && r.desync !== undefined) box.desync = true }
        }
        box.stepOnce = () => {
            if (box.dead) return false
            const k = gs.tick
            box.ls.pumpTo(k + PAD_DELAY, () => toWire(padOf(k)))
            if (!box.alone && !box.ls.ready(k)) return false
            const padIn = fromWire(box.mirrors[0].get(k) || toWire({}))
            step(gs, padIn, assembleSeatPads(box.mirrors, k, humans))
            if (!box.alone && k % HASH_EVERY === 0) {
                const h = stateHash(gs)
                box.hashes.push(h)
                const r = box.ls.hash(k, h)
                if (r && r.desync !== undefined) box.desync = true
            }
            return true
        }
        return box
    }
    const wig = (ph, amp) => (k) => ({ throttle: 1, steer: Math.sin(k / 15 + ph) > 0 ? amp : -amp * 0.7, brake: false, a: false, b: false })

    const pairUp = (arr) => { arr.forEach((b) => { b.sibs = arr.filter((x) => x !== b) }) }
    const runTo = (arr, target, hook = null) => {
        for (let guard = 0; guard < 12000 && arr.some((b) => b.gs.tick < target); guard++) {
            for (const b of arr) b.stepOnce()
            if (hook) hook(arr)
        }
    }
    const sameHashes = (arr) => {
        const n = Math.min(...arr.map((b) => b.hashes.length))
        return n >= 15 && arr.every((b) => b.hashes.slice(0, n).join(',') === arr[0].hashes.slice(0, n).join(','))
    }
    const b1 = [makeBox(0, [0, 1], wig(0, 0.9)), makeBox(1, [0, 1], wig(2.1, 0.8))]
    pairUp(b1)
    runTo(b1, 600)
    ok('two boxes, two riders: hashes agree at every boundary — the room rides ONE sea',
        sameHashes(b1))
    ok('neither box declared a desync on the honest run', !b1[0].desync && !b1[1].desync)
    ok('the pad streams ran ahead of the sim (sampling delay live)', b1[0].gs.tick + PAD_DELAY > 600 - 1)

    // the referee bites: a box that cheats the sea gets frozen, not shuffled.
    const b2 = [makeBox(0, [0, 1], wig(0, 0.9)), makeBox(1, [0, 1], wig(2.1, 0.8))]
    pairUp(b2)
    runTo(b2, 330, (arr) => { if (arr[0].gs.tick === 210) arr[1].gs.crafts[1].x += 1 })
    ok('a perturbed box IS caught — the hash referee reports desync, both sides',
        b2[0].desync && b2[1].desync)

    // three-hull room: host + two wire riders, autopilot fills nothing.
    const b3 = [makeBox(0, [0, 1, 2], wig(0, 0.9)), makeBox(1, [0, 1, 2], wig(2.1, 0.8)), makeBox(2, [0, 1, 2], wig(4.2, 0.75))]
    pairUp(b3)
    runTo(b3, 600)
    ok('a three-rider room is one world — all three hash-equal, no desync',
        sameHashes(b3) && !b3.some((b) => b.desync))

    // dropout: the guest goes silent; the host re-freezes the roster, takes the
    // open seat back on the autopilot, and finishes the race (never a stall).
    const bd = [makeBox(0, [0, 1], wig(0, 0.9)), makeBox(1, [0, 1], wig(2.1, 0.8))]
    pairUp(bd)
    for (let guard = 0; guard < 4000 && bd[0].gs.tick < 240; guard++) for (const b of bd) b.stepOnce()
    const tickAtDrop = bd[0].gs.tick
    bd[1].dead = true
    // — the component's seatGone: roster minus the gone seat, peers re-frozen,
    //   the orphan hull handed back to the seeded autopilot (the survivor is
    //   the authority: no hash peer left to disagree with).
    bd[0].gs.crafts[1].human = false
    bd[0].ls.setPeers([])
    bd[0].alone = true
    for (let g2 = 0; g2 < 300 && bd[0].gs.tick < tickAtDrop + 180; g2++) bd[0].stepOnce()
    ok('takeover: the race keeps ticking after a dropout (no silent stall)',
        bd[0].gs.tick >= tickAtDrop + 150)
    ok('takeover: the abandoned ski flies the autopilot again',
        bd[0].gs.crafts[1].speed > 5)
}

console.log(`\ntidalcheck: ${pass}/${pass + fail} ${fail ? 'FAILURES' : 'ok'}${MUT ? ` (mutant: ${MUT})` : ''}`)
if (MUT) {
    console.log(fail ? 'mutant caught — the check CAN fail' : `MUTANT SURVIVED (${MUT}) — check is blind`)
}
restoreAll()
process.exit(MUT ? (fail ? 0 : 1) : (fail ? 1 : 0))
