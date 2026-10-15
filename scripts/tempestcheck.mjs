// TEMPEST — scripts/tempestcheck.mjs : the self-verifying harness. Node only, no
// browser. It imports the SAME sim/planner the cabinet drives and proves it
// boots, its rules hold, and it can be won — then (with --mutate) breaks
// load-bearing lines and requires each to go red.
//
// Run:  npm run tempestcheck  [-- --mutate]
//
//   determinism   identical seed + script → identical hash, tick for tick; no
//                 Math.random anywhere in the sim path.
//   geometry      the tube is a closed ring: player and enemy perimeter
//                 coordinates always live in [0, faces), motion is continuous,
//                 and the level table really cycles 16·16·32·96.
//   the rules     climbers never stall; the rim kills at ANY longitude (the
//                 cabinet rule); bullets kill the face they run down; firing from
//                 an edge line sends the super bullet, which pierces and rakes
//                 both faces flanking the edge; flippers hinge, pulsers home,
//                 spinners dive; waves spawn to budget, clear, advance and pay;
//                 an extra ship every 10,000; four losses end the run.
//   the win       the autopilot clears all four waves DEATHLESS on four seeds,
//                 and the whole campaign re-wins deathless under a uniform
//                 handicap of 2 units (slower guns, slower shots, denser tube)
//                 but LOSES at 3 — so the economy is load-bearing, not padding.

import { readFileSync } from 'node:fs'
import { makeGame, step, stateHash, CFG, LEVELS, TARGET_WAVES, waveSize, wrapDelta, SCORE, WAVE_BONUS, playerSpeed } from '../src/games/Tempest/sim.js'
import { plan, runCampaign, decide } from '../src/games/Tempest/planner.js'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}${detail ? '  — ' + detail : ''}`) } }
const section = (t) => console.log(`\u001b[1m${t}\u001b[0m`)

// scenario sandbox: fresh game, spawn queue frozen so a kill never trips the
// wave-clear mid-scenario
const sandbox = () => {
    const g = makeGame(1)
    g.spawned = 3
    g.spawnT = 1e9
    g.enemies = []
    g.bullets = []
    return g
}

section('BOOT + DETERMINISM')
{
    const runs = [1, 7, 42, 1337].map((s) => runCampaign(s))
    ok('autopilot clears all four waves on four seeds', runs.every(({ g }) => g.end === 'win'), runs.map(({ g }) => g.end).join(','))
    ok('every campaign is deathless', runs.every(({ deaths }) => deaths === 0), runs.map(({ deaths }) => deaths).join(','))
    ok('campaigns finish inside the tick budget', runs.every(({ ticks }) => ticks > 500 && ticks < 43200), runs.map(({ ticks }) => ticks).join(','))
}
{
    const a = makeGame(1), b = makeGame(1)
    const scr = plan(1).script
    const ha = [], hb = []
    for (let i = 0; i < 600; i++) {
        const inp = scr[i] || { left: false, right: false, fire: false }
        step(a, inp); step(b, inp)
        if (i % 97 === 0) { ha.push(stateHash(a)); hb.push(stateHash(b)) }
    }
    ok('identical script → identical state hash (no wall-clock)', ha.length > 4 && ha.every((h, i) => h === hb[i]))
}
{
    const src = ['sim.js', 'planner.js'].map((f) => readFileSync(new URL(`../src/games/Tempest/${f}`, import.meta.url), 'utf8')).join('\n')
    ok('no Math.random in the sim path', !/Math\.random\s*\(/.test(src))
}

section('GEOMETRY')
ok('level table cycles the cabinet geometry 16·16·32·96', LEVELS.map((l) => l.faces).join(',') === '16,16,32,96' && LEVELS.map((l) => l.ridge).join(',') === '0,1,0,1')
ok('wrapDelta folds the ring', wrapDelta(3, 16) === 3 && wrapDelta(13, 16) === -3 && Math.abs(wrapDelta(80, 96) - (-16)) < 1e-9)
{
    const g = makeGame(7)
    const scr = plan(7).script
    let pBad = 0, aBad = 0, jumpBad = 0, stallBad = 0
    let prevA = new Map()
    for (let i = 0; i < scr.length && !g.end; i++) {
        const n = g.faces
        step(g, scr[i], 1 / 60)
        if (g.p < 0 || g.p >= n) pBad++
        for (const e of g.enemies) {
            if (e.A < 0 || e.A >= n) aBad++
            const pa = prevA.get(e.id)
            if (pa !== undefined) {
                const maxStep = (Math.max(CFG.spinOrbit, CFG.pulseHome * (n / 16), 1 / CFG.flipPeriod) / 60) * 1.6
                let d = Math.abs(wrapDelta(e.A - pa, n))
                if (d > maxStep) jumpBad++
                const ptd = g.enemies.find((x) => x.id === e.id)
                if (!ptd) continue
            }
            prevA.set(e.id, e.A)
        }
    }
    ok('player coordinate lives on [0, faces)', pBad === 0, `${pBad}`)
    ok('enemy coordinates live on [0, faces)', aBad === 0, `${aBad}`)
    ok('all motion is continuous (no teleporting across the ring)', jumpBad === 0, `${jumpBad}`)
    void stallBad
}

section('THE RULES')
{
    const g = makeGame(5)
    let stalled = 0
    const prevT = new Map()
    const scr = plan(5).script
    for (let i = 0; i < scr.length && !g.end; i++) {
        step(g, scr[i], 1 / 60)
        for (const e of g.enemies) {
            const pt = prevT.get(e.id)
            if (pt !== undefined && !(e.t > pt)) stalled++
            prevT.set(e.id, e.t)
        }
    }
    ok('climbers never stall toward the rim', stalled === 0, `${stalled}`)
}
{
    const g = sandbox()
    g.enemies = [{ id: 901, type: 'flip', A: (g.p + 2) % g.faces, t: 0.992, spd: 0.08, flipDir: 1, stage: 0, stageT: 0, diving: false }]
    const lives = g.lives
    for (let i = 0; i < 30 && g.lives === lives; i++) step(g, { left: false, right: false, fire: false })
    ok('the rim kills an arrival at your end', g.lives === lives - 1 && g.events.some((e) => e.kind === 'death'))
}
{
    const g = sandbox()
    g.enemies = [{ id: 902, type: 'flip', A: (g.p + g.faces / 2) % g.faces, t: 0.992, spd: 0.08, flipDir: 1, stage: 0, stageT: 0, diving: false }]
    const lives = g.lives
    for (let i = 0; i < 30 && g.lives === lives; i++) step(g, { left: false, right: false, fire: false })
    ok('the rim kills on the OPPOSITE longitude too (the cabinet rule)', g.lives === lives - 1)
}
{
    const g = sandbox()
    g.enemies = [{ id: 903, type: 'flip', A: 5.5, t: 0.5, spd: 0.05, flipDir: 1, stage: 0, stageT: 0, diving: false }]
    g.p = 5.5
    step(g, { left: false, right: false, fire: true })
    let guard = 0
    while (g.enemies.length && guard++ < 60) step(g, { left: false, right: false, fire: false })
    ok('a bullet kills the enemy riding its face', g.enemies.length === 0)
    ok('the kill banks the flipper value', g.score >= SCORE.flip, `score ${g.score}`)
}
{
    const g = sandbox()
    g.enemies = [{ id: 904, type: 'flip', A: 9.5, t: 0.5, spd: 0.05, flipDir: 1, stage: 0, stageT: 0, diving: false }]
    g.p = 5.5
    step(g, { left: false, right: false, fire: true })
    for (let i = 0; i < 90; i++) step(g, { left: false, right: false, fire: false })
    ok('a bullet on a different face misses cleanly', g.enemies.length === 1 && g.bullets.length === 0)
}
{
    const g = sandbox()
    g.p = 5.02
    step(g, { left: false, right: false, fire: true })
    ok('standing on an edge line loads the super bullet', g.events.some((e) => e.kind === 'super') && g.bullets.some((b) => b.super))
}
{
    const g = sandbox()
    g.p = 5.0
    g.enemies = [
        { id: 905, type: 'flip', A: 4.5, t: 0.55, spd: 0.05, flipDir: 1, stage: 0, stageT: 0, diving: false },
        { id: 906, type: 'flip', A: 5.5, t: 0.38, spd: 0.05, flipDir: 1, stage: 0, stageT: 0, diving: false },
    ]
    step(g, { left: false, right: false, fire: true })
    let guard = 0
    while (g.enemies.length && guard++ < 90) step(g, { left: false, right: false, fire: false })
    ok('the super bullet rakes BOTH faces of the edge', g.enemies.length === 0, `left ${g.enemies.length}`)
    ok('it chain-kills for the full value', g.score >= SCORE.flip * 2 && g.superKills === 2, `score ${g.score} supers ${g.superKills}`)
}
{
    const g = sandbox()
    g.p = 5.5
    g.enemies = [
        { id: 907, type: 'flip', A: 5.4, t: 0.55, spd: 0.05, flipDir: 1, stage: 0, stageT: 0, diving: false },
        { id: 908, type: 'flip', A: 5.6, t: 0.42, spd: 0.05, flipDir: 1, stage: 0, stageT: 0, diving: false },
    ]
    step(g, { left: false, right: false, fire: true })
    let guard = 0
    while (g.bullets.length && guard++ < 90) step(g, { left: false, right: false, fire: false })
    ok('a normal bullet dies on its first kill', g.enemies.length === 1)
}
{
    const g = sandbox()
    const e = { id: 909, type: 'flip', A: 5.2, t: 0.2, spd: 0.05, flipDir: 1, stage: 0, stageT: 0, diving: false }
    g.enemies = [e]
    const faces = new Set()
    let dirBad = 0
    for (let i = 0; i < 240; i++) {
        const pa = e.A
        step(g, { left: false, right: false, fire: false })
        if (!g.enemies.includes(e)) break
        let d = wrapDelta(e.A - pa, g.faces)
        if (d < -1e-9) dirBad++
        faces.add(Math.floor(e.A))
    }
    ok('flippers hinge across face boundaries, one direction, continuously', faces.size >= 2 && dirBad === 0, `faces ${faces.size} dirBad ${dirBad}`)
}
{
    const g = sandbox()
    g.p = 8
    const e = { id: 910, type: 'pulse', A: 4, t: 0.2, spd: 0.05, flipDir: 1, stage: 0, stageT: 0, diving: false }
    g.enemies = [e]
    const d0 = Math.abs(wrapDelta(e.A - g.p, g.faces))
    for (let i = 0; i < 90; i++) step(g, { left: false, right: false, fire: false })
    const d1 = Math.abs(wrapDelta(e.A - g.p, g.faces))
    ok('pulsers curve toward the player (they fly straight at you)', d1 < d0 - 0.5, `d0 ${d0.toFixed(2)} d1 ${d1.toFixed(2)}`)
    ok('pulser convergence beats its climb: it meets you', e.t < 1, `t ${e.t.toFixed(2)}`)
}
{
    const g = sandbox()
    const e = { id: 911, type: 'spin', A: 3, t: 0.36, spd: 0.07, flipDir: 1, stage: 0, stageT: 0, diving: false }
    g.enemies = [e]
    let preSpeed = 0
    for (let i = 0; i < 12; i++) { const t0 = e.t; step(g, { left: false, right: false, fire: false }); preSpeed = e.t - t0 }
    let guard = 0
    while (!e.diving && guard++ < 120) step(g, { left: false, right: false, fire: false })
    let postSpeed = 0
    for (let i = 0; i < 12 && g.enemies.includes(e); i++) { const t0 = e.t; step(g, { left: false, right: false, fire: false }); postSpeed = e.t - t0 }
    ok('spinners lock and dive at more than double the orbit climb', e.diving && postSpeed > preSpeed * 2, `pre ${preSpeed.toFixed(5)} post ${postSpeed.toFixed(5)}`)
}
{
    const g = makeGame(2)
    const target = waveSize(1, g.faces)
    for (let i = 0; i < 60 * 25; i++) step(g, { left: false, right: false, fire: false })
    ok('a wave spawns exactly to its budget', g.spawned === target, `spawned ${g.spawned} want ${target}`)
}
{
    const g = sandbox()
    g.spawned = waveSize(1, g.faces)
    const before = g.score
    step(g, { left: false, right: false, fire: false })
    ok('a cleared wave advances and pays its bonus', g.level === 2 && g.score - before === WAVE_BONUS * 1, `level ${g.level} gain ${g.score - before}`)
}
{
    const g = sandbox()
    g.score = 9990
    g.enemies = [{ id: 912, type: 'pulse', A: 5.5, t: 0.5, spd: 0.05, flipDir: 1, stage: 0, stageT: 0, diving: false }]
    g.p = 5.5
    const lives = g.lives
    step(g, { left: false, right: false, fire: true })
    let guard = 0
    while (g.enemies.length && g.lives === lives && guard++ < 90) step(g, { left: false, right: false, fire: false })
    ok('every 10,000 buys an extra ship', g.lives === lives + 1 && g.nextLife === 20000, `lives ${g.lives} next ${g.nextLife} score ${g.score}`)
}
{
    const g = sandbox()
    g.enemies = [{ id: 913, type: 'flip', A: g.p, t: 0.995, spd: 0.08, flipDir: 1, stage: 0, stageT: 0, diving: false }]
    const score = g.score
    for (let i = 0; i < 30 && g.lives === 4; i++) step(g, { left: false, right: false, fire: false })
    ok('a death resets the wave but keeps level and score', g.lives === 3 && g.level === 1 && g.score === score && g.spawned === 0)
}
{
    const g = sandbox()
    for (let k = 0; k < 4; k++) {
        g.enemies = [{ id: 920 + k, type: 'flip', A: g.p, t: 0.995, spd: 0.08, flipDir: 1, stage: 0, stageT: 0, diving: false }]
        g.spawned = 3
        g.spawnT = 1e9
        for (let i = 0; i < 30 && g.lives === 4 - k; i++) step(g, { left: false, right: false, fire: false })
    }
    ok('four arrivals end the run', g.end === 'over' && g.lives === 0, `lives ${g.lives} end ${g.end}`)
}
{
    const r = plan(0)
    ok('the demo campaign terminates in a win at wave four', r.won, `end won=${r.won}`)
    ok('a full four-wave campaign pays its wave bonuses', r.score >= (1 + 2 + 3 + 4) * WAVE_BONUS, `score ${r.score}`)
}

section('PILOT HONESTY')
{
    const g = makeGame(3)
    const mem = { id: null }
    let badKeys = 0, badVals = 0, nonFinite = 0
    for (let i = 0; i < 2400 && !g.end; i++) {
        const inp = decide(g, mem)
        const keys = Object.keys(inp).sort().join(',')
        if (keys !== 'fire,left,right') badKeys++
        if (!Object.values(inp).every((v) => typeof v === 'boolean')) badVals++
        if (!Number.isFinite(g.p) || !Number.isFinite(g.score)) nonFinite++
        step(g, inp, 1 / 60)
    }
    ok('the pilot only ever asks for left/right/fire', badKeys === 0 && badVals === 0)
    ok('the state never goes non-finite under pilot control', nonFinite === 0)
    ok('the pilot cannot ask for a cheat outside the rules', typeof playerSpeed(g) === 'number' && playerSpeed(g) === CFG.playerRev * g.faces)
}

section('THE WIN + SLACK')
{
    const base = { cd: CFG.fireCooldown, bs: CFG.bulletSpeed, gap: CFG.spawnGap, cb: CFG.climbBase }
    const handicap = (x) => {
        CFG.fireCooldown = base.cd + x * 0.2
        CFG.bulletSpeed = Math.max(0.15, base.bs - x * 0.22)
        CFG.spawnGap = Math.max(0.1, base.gap - x * 0.09)
        CFG.climbBase = base.cb + x * 0.015
    }
    const restore = () => { CFG.fireCooldown = base.cd; CFG.bulletSpeed = base.bs; CFG.spawnGap = base.gap; CFG.climbBase = base.cb }
    handicap(2)
    const runs2 = [1, 7, 42, 1337].map((s) => runCampaign(s))
    restore()
    ok('slack: the campaign still wins deathless with a uniform 2-unit handicap', runs2.every(({ g, deaths }) => g.end === 'win' && deaths === 0))
    handicap(3)
    const runs3 = [1, 7, 42, 1337].map((s) => runCampaign(s))
    restore()
    ok('slack: at handicap 3 it LOSES — the guns/tube economy is load-bearing', runs3.some(({ g, deaths }) => g.end !== 'win' || deaths > 0))
}

// --------------------------------------------------------------- mutants ----
if (process.argv.includes('--mutate')) {
    section('MUTANTS (each must be CAUGHT — the check must go red)')
    const expectRed = (name, fn) => { const caught = !fn(); ok(`mutant killed: ${name}`, caught) }

    expectRed('rim kill off (the tube stops caring)', () => {
        CFG.rimKill = false
        const g = sandbox()
        g.enemies = [{ id: 951, type: 'flip', A: g.p, t: 0.992, spd: 0.08, flipDir: 1, stage: 0, stageT: 0, diving: false }]
        const lives = g.lives
        step(g, { left: false, right: false, fire: false })
        CFG.rimKill = true
        return g.lives < lives
    })

    expectRed('lane kill off (bullets forget what a face is)', () => {
        CFG.laneKill = false
        const g = sandbox()
        g.enemies = [{ id: 952, type: 'flip', A: 5.5, t: 0.5, spd: 0.02, flipDir: 1, stage: 0, stageT: 0, diving: false }]
        g.p = 5.5
        step(g, { left: false, right: false, fire: true })
        for (let i = 0; i < 60; i++) step(g, { left: false, right: false, fire: false })
        CFG.laneKill = true
        return g.enemies.length === 0
    })

    expectRed('super pierce off (edge shots stop at the first body)', () => {
        CFG.superPierce = false
        const g = sandbox()
        g.p = 5.0
        g.enemies = [
            { id: 953, type: 'flip', A: 4.5, t: 0.55, spd: 0.02, flipDir: 1, stage: 0, stageT: 0, diving: false },
            { id: 954, type: 'flip', A: 5.5, t: 0.38, spd: 0.02, flipDir: 1, stage: 0, stageT: 0, diving: false },
        ]
        step(g, { left: false, right: false, fire: true })
        for (let i = 0; i < 90; i++) step(g, { left: false, right: false, fire: false })
        CFG.superPierce = true
        return g.enemies.length === 0 && g.superKills === 2
    })

    expectRed('scoring off (kills stop paying)', () => {
        CFG.scoreOn = false
        const g = sandbox()
        g.enemies = [{ id: 955, type: 'flip', A: 5.5, t: 0.5, spd: 0.02, flipDir: 1, stage: 0, stageT: 0, diving: false }]
        g.p = 5.5
        step(g, { left: false, right: false, fire: true })
        for (let i = 0; i < 60; i++) step(g, { left: false, right: false, fire: false })
        CFG.scoreOn = true
        return g.score >= SCORE.flip
    })
}

console.log(`\ntempestcheck: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
