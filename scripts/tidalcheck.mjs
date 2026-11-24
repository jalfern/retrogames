// tidalcheck.mjs — TIDAL RUSH, plain Node (zero DOM, zero browser).
// Proves three things per FORGE.md step 5: the game boots (a seeded race
// builds), its core rules hold (red-right/yellow-left judgement, miss chokes
// the throttle, skips judge inside the corridor but never across the bay,
// boost economy, tricks bank on landing, laps count, the bay is bounded), and
// it can be won (autoPad takes P1 across seeds). Determinism is pinned twice:
// identical streams for one seed, divergence for another.
//
// The CPU/GLSL parity gate parses waterGLSL() and re-reads heightAt — the
// drawn surface must stay the SAME table the hull rides (#3104's core).
//
// Run: npm run tidalcheck            (green)
//      node scripts/tidalcheck.mjs --mutate  (plant the red-side mutant; must go red)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { plant, restoreAll } from './lib/mutateguard.mjs'

const MUT = process.argv.includes('--mutate')
let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`) } else { fail++; console.log(`  FAIL ${name}`) } }

// --mutate: plant the red-side mutant the honest way (guarded, remembered,
// rewound by mutateguard even if we die mid-run), THEN import the sim so ESM
// caches the mutated source. The planted line makes RED pass from ANY side;
// gate-judgement gates must go red on it.
if (MUT) {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const simPath = join(root, 'src/games/TidalRush/sim.js')
    const src = readFileSync(simPath, 'utf8')
    const from = "const want = g.color === 'red' ? -1 : 1"
    if (!src.includes(from)) { console.error('mutant anchor missing in sim.js'); process.exit(1) }
    plant(simPath, src.replace(from, 'const want = 1'))
    console.log('[mutant] RED-side judgement muted — check must go red')
}

const { WAVES, heightAt, waterGLSL, omega } = await import('../src/games/TidalRush/water.js')
const { makeGame, step, autoPad, stateOf, stateHash, LAPS } = await import('../src/games/TidalRush/sim.js')

// 1. boot + state shape
{
    const gs = makeGame(7)
    const s = stateOf(gs)
    ok('boot: fresh race at tick 0, 3 crafts, 10 gates', s.tick === 0 && gs.crafts.length === 3 && gs.course.gates.length === 10 && s.done === false)
    ok('state is JSON-safe', JSON.stringify(s) === JSON.stringify(JSON.parse(JSON.stringify(s))))
    ok('gates alternate red/yellow', gs.course.gates.every((g, i) => g.color === (i % 2 === 0 ? 'red' : 'yellow')))
}

// 2. determinism: seed + identical pads ⇒ identical hashes; other seeds differ
{
    const drives = [
        () => makeGame(7),
        (i) => makeGame(i),
    ]
    const a = drives[0](); const b = drives[1](7)
    const ha = [], hb = [], hc = []
    const c = makeGame(8)
    for (let t = 0; t < 900; t++) {
        const pa = autoPad(a)
        step(a, pa); step(b, { ...pa })
        step(c, autoPad(c))
        if (t % 100 === 0) { ha.push(stateHash(a)); hb.push(stateHash(b)); hc.push(stateHash(c)) }
    }
    ok('same seed, same pads ⇒ identical hash every 100 ticks', ha.join(',') === hb.join(','))
    ok('different seed ⇒ divergent hash', ha.join(',') !== hc.join(','))
}

// 3. gate judgement: RED clean on the right, miss on the left; YELLOW mirrored
{
    // gate 0 is red at the bay bottom; lat = left of travel
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

// 4. skip-detection: across the bay ⇒ NOT judged (the #3104 corridor bug);
//    through the corridor past the line ⇒ judged a miss.
{
    const gs = makeGame(7)
    const p = gs.crafts[0]
    gs.crafts[0].judged[0] = 1 // pretend gate 0 done so lower gates fall behind
    gs.crafts[0].judged[1] = 1
    for (let i = 0; i < 60; i++) step(gs, { throttle: 0, steer: 0, brake: false, a: false, b: false })
    ok('distant gate stays unjudged from across the bay', p.judged[8] === 0)

    const g2 = makeGame(7)
    const g0 = g2.course.gates[0]
    const tan = g0.tangent
    // park just past the line, inside the corridor, facing away — next tick the
    // skip rule must catch it
    g2.crafts[0].x = g0.x + tan.x * 15; g2.crafts[0].z = g0.z + tan.z * 15
    g2.crafts[0].progress = g0.arc + 15
    g2.crafts[0].progIdx = Math.round(((g0.arc + 15) / g2.course.len) * 720) % 720
    g2.crafts[0].heading = Math.atan2(tan.x, tan.z); g2.crafts[0].speed = 10
    step(g2, { throttle: 1, steer: 0, brake: false, a: false, b: false })
    ok('crossing the gate line inside the corridor judges a skip', g2.crafts[0].judged[0] === -1)
}

// 5. boost economy: clean passes charge it; burning pushes speed past cruise
{
    const gs = makeGame(7)
    let maxV = 0, sawBoost = false
    for (let t = 0; t < 60 * 70 && !gs.done; t++) {
        const pad = autoPad(gs)
        step(gs, pad)
        const p = gs.crafts[0]
        if (p.boosting) sawBoost = true
        maxV = Math.max(maxV, p.speed)
    }
    ok('autoPad charges and burns the sprint', sawBoost)
    ok('sprint pushes speed past cruise (>17 m/s)', maxV > 17)
}

// 6. air + trick: at least one kicker per race; a held spin banks a trick
{
    const gs = makeGame(7)
    let airs = 0, tricks = 0
    for (let t = 0; t < 60 * 90 && !gs.done; t++) {
        step(gs, autoPad(gs))
        airs += gs.events.filter((e) => e.type === 'air').length
        tricks += gs.events.filter((e) => e.type === 'trick').length
    }
    ok('the bay has real kickers (autoPad flies)', airs > 5)
    ok('a held spin completes a 360 trick at least once per race', tricks > 0)

    const g2 = makeGame(7)
    // force air + spin deterministically: hold SPIN for every air pocket
    let done = false
    for (let t = 0; t < 60 * 120 && !done; t++) {
        const p = g2.crafts[0]
        const pad = autoPad(g2); pad.a = p.airborne
        const score0 = g2.score
        step(g2, pad)
        const e = g2.events.find((ev) => ev.type === 'trick')
        if (e) { done = true; ok('trick scores +250 on landing', g2.score - score0 >= 250) }
    }
    if (!done) ok('trick scores +250 on landing', false)
}

// 7. win: autoPad takes P1 on every seed, in a sane time, within bounds
{
    const times = []
    let allWin = true, bounded = true, lapOK = true
    for (const seed of [1, 7, 42, 99, 1234]) {
        const gs = makeGame(seed)
        let t = 0
        while (!gs.done && t < 60 * 240) { step(gs, autoPad(gs)); t++ }
        if (!gs.done || gs.rank !== 1) allWin = false
        times.push(gs.t)
        if (gs.crafts[0].lap !== LAPS + 1) lapOK = false
        for (const c of gs.crafts) {
            const rr = (c.x / (74 + 27)) ** 2 + (c.z / (46 + 27)) ** 2
            if (rr > 1.3) bounded = false
        }
    }
    ok('autoPad WINS (P1) on every seed', allWin)
    ok('finish times sane (45–120 s)', times.every((t) => t > 45 && t < 120))
    ok('laps counted 1→3, three gatesets completed', lapOK)
    ok('nobody escapes the bay bounds', bounded)
}

// 8. CPU field is alive: rivals advance laps and stay near the leader
{
    const gs = makeGame(7)
    for (let t = 0; t < 60 * 40 && !gs.done; t++) step(gs, autoPad(gs))
    const [p, mako, tundra] = gs.crafts
    ok('rivals race: both lapped into the pack within a straight', mako.progress > p.progress * 0.55 && tundra.progress > p.progress * 0.4)
}

// 9. CPU/GLSL parity: the shader text carries the exact table heightAt uses
{
    const glsl = waterGLSL()
    let parity = glsl.includes('float waveHeight(vec2 pos, float uT, out vec2 disp)')
    for (const w of WAVES) {
        const amp = w.amp.toFixed(4)
        const om = omega(w.len).toFixed(6)
        if (!glsl.includes(`+ ${amp} * sin(f)`) && !glsl.includes(`${amp} * sin(f)`)) parity = false
        if (!glsl.includes(om)) parity = false
    }
    ok('waterGLSL embeds every wave of the CPU table (same sea, drawn)', parity)
    // and the field behaves like water: bounded, continuous, wets
    // and the field behaves like water: bounded, continuous, wets. (Step small
    // and threshold loose enough for Gerstner crest-compression; a broken
    // field — NaN, blowup, flatline — still trips it.)
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
    ok('surface bounded (<2.5 m) and continuous', maxH < 2.5 && smooth)
}

// 10. restart: a fresh game after a finished one starts clean
{
    const gs = makeGame(7)
    for (let t = 0; t < 60 * 240 && !gs.done; t++) step(gs, autoPad(gs))
    const gs2 = makeGame(7)
    ok('restart returns a fresh tick-0 race', gs.done && gs2.tick === 0 && !gs2.done && stateHash(gs) !== stateHash(gs2))
}

console.log(`\ntidalcheck: ${pass}/${pass + fail} ${fail ? 'FAILURES' : 'ok'}${MUT ? ' (mutant run)' : ''}`)
if (MUT) {
    console.log(fail ? 'mutant caught — the check CAN fail' : 'MUTANT SURVIVED — check is blind')
}
restoreAll()
process.exit(MUT ? (fail ? 0 : 1) : (fail ? 1 : 0))
