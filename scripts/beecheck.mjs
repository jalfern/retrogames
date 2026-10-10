// BEEZEE — the garden audit. No browser, no dev server, ~0.1 s.
//
//   npm run beecheck              # fly every garden + pin the rules
//   npm run beecheck -- --mutate  # put three bugs back and prove this file notices
//   npm run beecheck -- --map 0   # ASCII map of a garden, as the bee sees it
//
// Why this exists: the classic failure of a flier level is not an ugly frame, it
// is a garden that cannot actually be flown — flowers you can never hover, wind
// that outruns the thrust, a UV rule that is decoration, a web strung across the
// only way to a bloom. None of that shows up in a screenshot. All of it is a
// deterministic simulation in sim.js, and `autopilot` — the same brain the
// attract demo flies with — is the proof. A garden the autopilot cannot bank in
// is not winnable; it is furniture.
//
// THE AUDIT MUST BE ABLE TO FAIL. `--mutate` breaks three load-bearing numbers
// and demands the audit go red on each. A gate that passes on a broken garden is
// worse than no gate (this repo has shipped two AI agents that way).

import { GARDENS, newGame, step, autopilot, windAt, landRadius, CFG, FIXED_DT } from '../src/games/Beezee/sim.js'

// Mirror of sim.js's daylight fraction, so the mutation probe can compute the
// honest gap even while CFG.uvBonus is lying.
const landRadiusReal = (f) => f.hide * 0.25
const UV_REAL_BONUS = 2.2

const args = process.argv.slice(2)
const MUT = args.includes('--mutate')
const mapArg = args.includes('--map') ? +args[args.indexOf('--map') + 1] : null

let pass = 0
const fails = []
const ok = (cond, msg) => { if (cond) pass++; else fails.push(msg) }
const section = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`)

const runGarden = (gi, maxSec = CFG.day + 2) => {
    const g = newGame(gi)
    let stings = []
    const waspMax = new Array(g.world.wasps.length).fill(0)
    for (let i = 0; i < maxSec * 60 && !g.end; i++) {
        step(g, autopilot(g))
        for (const e of g.events) if (e.type === 'sting') stings.push(e.by)
        g.world.wasps.forEach((w, k) => { waspMax[k] = Math.max(waspMax[k], Math.hypot(w.x - w.home.x, w.z - w.home.z)) })
    }
    return { g, stings, waspMax }
}

if (mapArg !== null) {
    const g = newGame(mapArg)
    const W = 61
    const cell = CFG.radius * 2 / W
    const rows = []
    for (let j = 0; j < W; j++) {
        let line = ''
        for (let i = 0; i < W; i++) {
            const x = -CFG.radius + i * cell
            const z = CFG.radius - j * cell
            let ch = '.'
            if (Math.hypot(x, z) < 3.4) ch = 'H'
            for (const f of g.world.flowers) if (Math.hypot(f.x - x, f.z - z) < cell) ch = f.uv ? 'U' : (f.kind === 'daisy' ? 'd' : 't')
            for (const w of g.world.webs) if (Math.hypot(w.x - x, w.z - z) < cell) ch = '#'
            for (const w of g.world.wasps) if (Math.hypot(w.home.x - x, w.home.z - z) < cell) ch = 'W'
            if (Math.hypot(4.6 - x, 0.5 - z) < cell) ch = 'G'
            line += ch
        }
        rows.push(line)
    }
    console.log(`GARDEN ${mapArg} — ${g.world.name}  (H hive, d/t flowers, U uv-cup, # web, W wasp, G gecko)`)
    rows.forEach(r => console.log(r))
    process.exit(0)
}

// ------------------------------------------------------------------ winnable ----
for (let gi = 0; gi < GARDENS.length; gi++) {
    const { g, stings, waspMax } = runGarden(gi)
    const left = g.world.flowers.reduce((s, f) => s + f.nectar, 0)
    section(`GARDEN ${gi} — ${GARDENS[gi].name}`)
    ok(g.end === 'sun' || g.end === 'delivered',
        `autopilot died ('${g.end}') at t=${g.t.toFixed(0)}s — garden is a graveyard, not a garden (stings: ${stings.join(',')})`)
    ok(g.delivered >= 3, `autopilot banked only ${g.delivered} nectar in a full day — hovering cannot beat this wind`)
    ok(g.score >= 80, `autopilot scored ${g.score} — below the floor a real bee should clear easily`)
    ok(stings.length <= 3, `autopilot took ${stings.length} stings — hazard pressure past what a careful bee can dodge`)
    // wind, thrust and range must admit a solution: the autopilot suffers the
    // same physics the player does, so its success IS the reachability proof.
    ok(g.t >= CFG.day * 0.99, `sim ended at t=${g.t.toFixed(1)} — the day did not run its length`)
    // wasps on leash: a wanderer off the map is a wasp the player can never see coming
    waspMax.forEach((d, k) => ok(d <= 16, `wasp ${k} wandered ${d.toFixed(1)} m from home (leash 11 + orbit margin)`))
    // every hazard must be able to reach the bee it threatens, but never outrun a sprint
    ok(g.world.wasps.every(w => w.speed < CFG.sprintSpeed), 'a wasp is faster than bee sprint — no counterplay exists')
    ok(g.world.flowers.some(f => f.uv), 'no UV flower in this garden — the issue asked for ultraviolet vision')
    // and no flower may sit under a web: that is a tax, not a hazard
    for (const f of g.world.flowers) {
        ok(!g.world.webs.some(w => Math.hypot(w.x - f.x, w.z - f.z) < 2.8),
            `flower ${f.id} has a web inside 2.8 m — hovering it is unavoidable damage`)
    }
}

// ----------------------------------------------------------------- wind sign ----
{
    section('WIND + PHYSICS (sign conventions are load-bearing)')
    const g = newGame(0)
    const [wx0, wz0] = windAt(g.world, 1)
    g.bee.x = 0; g.bee.z = 0; g.bee.y = 2
    for (let i = 0; i < 60; i++) {
        g.t = 1 + i * FIXED_DT
        step(g, {})
    }
    const dot = (g.bee.x - 0) * wx0 + (g.bee.z - 0) * wz0
    const wm = Math.hypot(wx0, wz0)
    ok(wm > 0.5, `wind magnitude ${wm.toFixed(2)} — a calm meadow proves nothing about drift`)
    ok(dot > 0, `bee drifted AGAINST the wind vector (wind ${wx0.toFixed(1)},${wz0.toFixed(1)} → moved ${g.bee.x.toFixed(1)},${g.bee.z.toFixed(1)}) — the sign is inverted`)
    const drift = Math.hypot(g.bee.x, g.bee.z)
    ok(drift > wm * 0.6, `drift ${drift.toFixed(2)} m is far below the wind's ${wm.toFixed(2)} m/s — windGain lost teeth`)
}

// ------------------------------------------------------------------- the UV rule
{
    section('UV VISION (the issue asked for it; here is the proof it matters)')
    const g = newGame(0)
    const cup = g.world.flowers.find(f => f.uv && f.nectar >= 3)
    ok(!!cup, 'garden 0 has no UV cup to test with')
    // The rule is NOT "UV opens the cup" — it is "UV WIDENS the ring".
    // Hover offset between the two radii (blind: no; UV: yes). That is the
    // skill the mode buys you: aiming tolerance against the wind.
    const off = (landRadius(cup, false) + landRadius(cup, true)) / 2
    const park = () => {
        g.bee.x = cup.x + off; g.bee.z = cup.z
        g.bee.y = cup.stemH + 0.4
        g.bee.vx = g.bee.vy = g.bee.vz = 0
    }
    const hover = (uv, secs) => {
        g.bee.nectar = 0
        for (let i = 0; i < secs * 60; i++) {
            park()
            step(g, { thrust: true, uv })
        }
        return g.bee.nectar
    }
    const daylight = hover(false, 2.5)
    ok(daylight === 0, `a daylit hover at ${off.toFixed(2)} m off-center collected ${daylight} from a UV cup — UV is decoration`)
    const uvGot = hover(true, 2.5)
    ok(uvGot >= 2, `a UV hover at the same ${off.toFixed(2)} m collected only ${uvGot} — UV mode does not actually widen the ring`)
    ok(landRadius(cup, false) < landRadius(cup, true) * 0.6,
        `UV radius ratio ${landRadius(cup, false).toFixed(2)}/${landRadius(cup, true).toFixed(2)} — the modes are too similar to matter`)
    // ordinary flowers must NOT need UV (or the game is a chore)
    const daisy = g.world.flowers.find(f => !f.uv && f.nectar >= 2)
    g.bee.nectar = 0
    const nd0 = g.bee.nectar
    for (let i = 0; i < 2 * 60; i++) {
        g.bee.x = daisy.x; g.bee.z = daisy.z
        g.bee.y = daisy.stemH + 0.4
        g.bee.vx = g.bee.vy = g.bee.vz = 0
        step(g, { thrust: true, uv: false })
        void nd0
    }
    ok(g.bee.nectar > 0, 'a plain flower demands UV — every bloom should not be a puzzle')
}

// --------------------------------------------------------------- determinism ----
{
    section('DETERMINISM (one seed = one world, browser and harness alike)')
    const run = () => {
        const g = newGame(1)
        for (let i = 0; i < 60 * 40 && !g.end; i++) step(g, autopilot(g))
        return `${g.score}|${g.bee.x.toFixed(4)}|${g.delivered}`
    }
    const a = run(), b = run()
    ok(a === b, `two runs of seed differ: ${a} vs ${b}`)
}

// ------------------------------------------------------------------ mutations ----
if (MUT) {
    section('MUTATIONS — each one MUST make a real check go red')
    // Each probe returns TRUE on the honest world (baseline) and must go FALSE
    // under its mutation. A survivor is reported, and this process exits red.
    const tryMut = (name, apply, probe) => {
        const base = probe()
        ok(base, `mutation harness is broken: baseline for '${name}' is already false`)
        const save = { ...CFG }
        apply(CFG)
        const verdict = probe()
        Object.assign(CFG, save)
        console.log(`  mut ${name}: ${verdict ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(!verdict, `${name} SURVIVED — a check has stopped touching this rule`)
    }
    tryMut('windGain sign inverted', c => { c.windGain = -1 }, () => {
        const g = newGame(0)
        const [wx0, wz0] = windAt(g.world, 1)
        g.bee.x = 0; g.bee.z = 0; g.bee.y = 2
        for (let i = 0; i < 60; i++) { g.t = 1 + i * FIXED_DT; step(g, {}) }
        return g.bee.x * wx0 + g.bee.z * wz0 > 0
    })
    tryMut('carry disabled', c => { c.carry = 0 }, () => {
        const g = newGame(0)
        for (let i = 0; i < CFG.day * 60 + 5 && !g.end; i++) step(g, autopilot(g))
        return g.delivered >= 3
    })
    tryMut('UV bonus flattened to daylight', c => { c.uvBonus = 1.01 }, () => {
        // hover the ring GAP (offset between the real radii): UV collects there,
        // and a flattened bonus must stop collecting
        const g = newGame(0)
        const cup = g.world.flowers.find(f => f.uv && f.nectar >= 3)
        // off is pinned to the HONEST numbers — if it were recomputed from the
        // mutated radius the probe would keep chasing the mutated hole shut.
        const off = (landRadiusReal(cup) + cup.hide * UV_REAL_BONUS) / 2
        let got = 0
        for (let i = 0; i < 3 * 60; i++) {
            g.bee.x = cup.x + off; g.bee.z = cup.z; g.bee.y = cup.stemH + 0.4
            g.bee.vx = g.bee.vy = g.bee.vz = 0
            step(g, { thrust: true, uv: true })
            got = Math.max(got, g.bee.nectar)
        }
        return got >= 2
    })
}

console.log(`\nbeecheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach(f => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
