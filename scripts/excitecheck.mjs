// EXCITEBIKE — the harness. No browser, a few seconds. This is the gate for
// the issue's muscle ("as faithful to the NES original as possible"): the
// course is audited as DATA before anyone rides it (the loop must close, no
// control point may teleport off-screen, every gameplay band must sit on
// ground that exists, and a wide-open-throttle ride must never die stuck in a
// hole); the autopilot — the SAME call the attract demo replays — then clears
// both tracks in FIRST, with its score ledger recomputed from the events it
// booked and the replay proven hash-for-hash; and the SLACK RULE re-wins both
// tracks with less clock at every lap line, thicker mud, and an engine that
// overheats sooner. A level the machine only barely wins is not humanly
// winnable, and a check a mutant can't turn red is a check that stopped
// touching its rule.
//
//   npm run excitecheck
//   npm run excitecheck -- --mutate   # re-break the load-bearing rules; a
//                                     # surviving mutant means a check died
import { makeGame, step, stateHash, CFG } from '../src/games/Excitebike/sim.js'
import { track, groundY, featureAt, LAP, MUD, WATER, BOOST } from '../src/games/Excitebike/levels.js'
import { plan, decide } from '../src/games/Excitebike/planner.js'

const MUT = process.argv.includes('--mutate')
let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

// ------------------------------------------------------------- terrain audit ----
section('TERRAIN (the course is projected, not trusted)')
{
    for (let i = 0; i < 2; i++) {
        const tr = track(i)
        // the lap closes: height and shape must not teleport at the seam
        const a = groundY(tr.ground, LAP - 2), b = groundY(tr.ground, 2)
        ok(Math.abs(a - b) < 6, `track ${i + 1}: lap seam jumps ${a.toFixed(0)}->${b.toFixed(0)} (rider breaks an axle at the line)`)
        // every control point is on-screen and inside the lap
        let off = 0
        for (const [x, h] of tr.cps) { if (x < 0 || x > LAP || h < 40 || h > 165) off++ }
        ok(off === 0, `track ${i + 1}: ${off} control points off-screen/out of bounds`)
        // monotonic control points (no backward course)
        let back = 0
        for (let k = 1; k < tr.cps.length; k++) if (tr.cps[k][0] <= tr.cps[k - 1][0] - 1) back++
        ok(back === 0, `track ${i + 1}: ${back} control points run backward`)
        // every feature band lies on real ground inside the lap
        for (const band of tr.bands) {
            if (band.whoops) {
                ok(band.whoops[0] > 0 && band.whoops[1] < LAP, `track ${i + 1}: whoop band outside the lap`)
                continue
            }
            const [kind, x0, x1] = band
            ok(x0 > 0 && x1 < LAP && x1 > x0, `track ${i + 1}: ${kind} band lies off the course`)
            ok(groundY(tr.ground, (x0 + x1) / 2) > 40, `track ${i + 1}: ${kind} band sits above the world`)
        }
        ok(tr.steps.length >= 1, `track ${i + 1}: no up-step/step crest — the level-geometry muscle was never used`)
    }
    // a wide-open-throttle, no-skill ride must not die STUCK in a hole. The
    // up-steps live at the tops of ramps so a charging rider always tops them;
    // only the water hole may bite (and it recovers).
    for (let i = 0; i < 2; i++) {
        const g = makeGame(i, { count: 0 })
        let maxStuck = 0, stuck = 0
        for (let t = 0; t < 6000 && !g.end; t++) {
            step(g, { g: true })   // pure throttle, zero skill
            if (g.crash > 0 || g.stall > 0) stuck++; else stuck = 0
            maxStuck = Math.max(maxStuck, stuck)
            g.events.length = 0
        }
        ok(maxStuck < 400, `track ${i + 1}: WOT ride stuck ${maxStuck} ticks (a hole you cannot ride out is an unfair level, not difficulty)`)
    }
    // the gas gauge actually boils at WOT — heat is a real constraint
    {
        const g = makeGame(0, { count: 0 })
        let boiled = false
        for (let t = 0; t < 3000 && !boiled; t++) { step(g, { g: true }); boiled = g.events.some((e) => e.type === 'overheat'); g.events.length = 0 }
        ok(boiled, 'full throttle never overheated the engine — heat/overheat is theatre')
    }}

// --------------------------------------------------- the campaign + the ledger ----
section('THE CAMPAIGN (the autopilot = the attract demo) + LEDGER')
const t0 = Date.now()
const runs = []
for (let i = 0; i < 2; i++) {
    let ledger = 0
    const r = plan({
        track: i,
        onEvent: (e) => {
            if (e.type === 'air' || e.type === 'boost' || e.type === 'lap' || e.type === 'finish') ledger += e.pts
        },
    })
    runs.push({ r, ledger })
    const ms = Date.now() - t0
    ok(r.ok, `track ${i + 1}: autopilot did not clear in FIRST (end=${r.end} rank=${r.rank})`)
    ok(r.receipts.airs >= 3, `track ${i + 1}: only ${r.receipts.airs} scored airs — it never really jumped the ramps`)
    ok(r.receipts.boosts >= 1, `track ${i + 1}: never took a boost — the boost straight is a prop it walked past`)
    ok(r.game.score === ledger, `track ${i + 1}: ledger lies — score ${r.game.score}, booked events ${ledger}`)
    ok(ms < 15000, `the solve took ${ms}ms — the gate must stay in seconds`)
}

// ------------------------------------------------------------ determinism ----
section('DETERMINISM (the attract replay is not theatre)')
for (let i = 0; i < 2; i++) {
    const { r } = runs[i]
    const g = makeGame(i, {})
    for (const inp of r.script) step(g, inp)
    ok(g.score === r.game.score && g.tick === r.game.tick, `track ${i + 1}: replay diverged from the proven run`)
    // drop one pump/fire mid-run; the bike must be a different bike a few
    // ticks later (a check that only compares the end of a run proves nothing)
    const j = r.script.findIndex((x) => x.j)
    ok(j > 0, `track ${i + 1}: the winning run never jumped/pumped — tamper probe cannot run`)
    const a = makeGame(i, {}), b = makeGame(i, {})
    for (let k = 0; k < j + 6 && k < r.script.length; k++) {
        step(a, k === j ? {} : r.script[k])
        step(b, r.script[k])
    }
    ok(stateHash(a) !== stateHash(b), `track ${i + 1}: dropping a jump changed nothing — the sim ignores air`)
}

// ------------------------------------------------------------- slack rule ----
section('SLACK (one fewer of every supply, same win — or the goods were theatre)')
for (let i = 0; i < 2; i++) {
    for (const tax of [4, 8]) {
        const r = plan({ track: i, bonusTax: tax })
        ok(r.ok, `track ${i + 1}: ZERO SLACK — with ${34 - tax}s (not ${34}) at the line it finishes ${r.end} rank ${r.rank}`)
    }
    const mud = plan({ track: i, mudTax: 0.01 })
    ok(mud.ok, `track ${i + 1}: thicker mud (one pump short of traction) is unbeatable — the mud was not beatable, it was avoided`)
    const hot = plan({ track: i, heatTax: 1.5 })
    ok(hot.ok, `track ${i + 1}: an engine that overheats sooner cannot finish — heat was a wall, not a resource`)
    const all = plan({ track: i, bonusTax: 4, mudTax: 0.008, heatTax: 1.0 })
    ok(all.ok, `track ${i + 1}: stripped of slack on EVERY supply it cannot win (end=${all.end} rank=${all.rank})`)
}

// ------------------------------------------------------- rules the game promised ----
section('RULES THE CARTRIDGE PROMISED')
{
    // the water hole stalls a slow bike — and pumping walks it out
    {
        const tr = track(0)
        const g = makeGame(0, { count: 0 })
        // park it slow, right at the water
        const wb0 = tr.bands.find((b) => b[0] === WATER)
        g.x = wb0[1] + 20
        g.alt = groundY(tr.ground, g.x); g.v = 2.0; g.stall = 0
        let sawStall = false
        for (let t = 0; t < 200 && !sawStall; t++) { step(g, { g: true }); sawStall = g.events.some((e) => e.type === 'stall'); g.events.length = 0 }
        ok(sawStall, 'a slow bike in the water did not stall — the water hole is a rumble strip')
        const g2 = makeGame(0, { count: 0 })
        const wband = tr.bands.find((b) => b[0] === WATER)
        g2.x = wband[1] + 20; g2.alt = groundY(tr.ground, g2.x); g2.stall = 1
        let out = false
        for (let t = 0; t < 300 && !out; t++) { step(g2, { j: t % 2 === 0 }); out = g2.events.some((e) => e.type === 'unstall'); g2.events.length = 0 }
        ok(out, 'pumping never walked the bike out of a stall — mash is theatre')
    }
    // the mud bleeds speed when coasting (the pump kick is what fights it)
    {
        const tr = track(0)
        const m = tr.bands.find((b) => b[0] === MUD)
        const g = makeGame(0, { count: 0 })
        g.x = m[1] + 10; g.alt = groundY(tr.ground, g.x); g.v = 5
        let worse = 0
        for (let t = 0; t < 80; t++) {
            if (g.x > m[1] + 4 || g.x < m[0]) { g.x = m[1]; g.alt = groundY(tr.ground, g.x) }
            const v0 = g.v; step(g, {})   // coast: mud drag has no gas to fight
            if (g.v < v0 - 0.001) worse++
            g.events.length = 0
        }
        ok(worse > 40, `mud did not bleed speed while coasting (only ${worse}/80 ticks) — mud is floor polish`)
    }
    // boost sets speed AND is a floor (slower than it, faster is kept). The
    // assertion names a concrete number, NOT CFG.boostV — reading the constant
    // the mutant edits is a circular check (boostV=0 made `v >= boostV` true
    // for a bike that never launched).
    {
        const g = makeGame(0, { count: 0 })
        g.v = 3; g.boostAt = -1e6
        g.x = 3950; g.alt = groundY(track(0).ground, 3950)
        step(g, { g: true })
        ok(g.v >= 6, `a boost only nudged to ${g.v.toFixed(2)} — the arrows did not launch the bike`)
    }
    // the wet skip: holding gas over water at a run does NOT stall it
    {
        const tr = track(0)
        const w = tr.bands.find((b) => b[0] === WATER)
        const g = makeGame(0, { count: 0 })
        g.v = 5.4
        let clean = true
        for (let t = 0; t < 200 && clean; t++) {
            // keep it pinned to the water band with throttle (real bike would
            // coast through; we re-pin altitude so the probe isolates stall)
            if (g.x > w[1] - 240 && g.x < w[0]) { g.x = w[1] - 30; g.alt = groundY(tr.ground, g.x) }
            step(g, { g: true })
            if (g.stall > 0 || g.events.some((e) => e.type === 'stall')) clean = false
            g.events.length = 0
        }
        ok(clean, 'a fast charging bike stalled in the water — the skip was removed')
    }
    // the third side of lean: a CORRECTLY levelled landing must survive. The
    // crash-only probes can't see a threshold so tight it punishes good
    // riders — this is the one that can fail by being too strict.
    {
        const clean = () => {
            const g = makeGame(0, { count: 0 }); g.v = 5
            g.x = 1000; g.alt = groundY(track(0).ground, 1000) + 26
            g.air = true; g.vy = -1; g.pitch = 0; g.jumpT = 0
            for (let k = 0; k < 60 && g.air; k++) step(g, {})
            return g.crash === 0 && !g.end
        }
        ok(clean(), 'a level, neutral landing on ordinary ground crashes the rider — lean thresholds punish good play')
    }
    // lean both ways is a real crash surface (rolling the sim to a nose-low landing)
    {
        let sawForward = 0, sawBack = 0
        const g = makeGame(0, { count: 0 })
        g.v = 6
        for (let t = 0; t < 12000 && (sawForward < 1 || sawBack < 1); t++) {
            g.x = (t * 6) % (LAP - 200); g.alt = groundY(track(0).ground, g.x) + 40
            g.air = true; g.vy = 1; g.jumpT = 0
            const dir = sawForward < 1 ? { d: true } : { u: true }
            for (let k = 0; k < 120; k++) {
                step(g, dir)
                if (g.crash > 0) { if (g.crashWhy === 'forward') sawForward++; else if (g.crashWhy === 'backward') sawBack++; break }
                if (g.end) break
            }
            g.events.length = 0
        }
        ok(sawForward > 0, 'nose-down landings never crashed — the forward wipeout (and the lean-back skill) is gone')
        ok(sawBack > 0, 'nose-up over-rotations never crashed — the endo/backflip skill is gone')
    }
    // the step must be top-able: a WOT rider who taps on the ramp reaches the deck
    {
        const tr = track(0)
        const g = makeGame(0, { count: 0 })
        g.v = 6
        let topped = false
        for (let t = 0; t < 1200 && !topped; t++) {
            step(g, { g: true, j: g.x > 2600 && g.x < 2640 })
            if (g.x > 2760 && g.x < 2900 && g.alt > 124 && g.crash === 0) topped = true
            if (g.crash > 0) { g.crash = 0; g.stall = 0; g.v = 6 }
            g.events.length = 0
        }
        ok(topped, 'a WOT rider over the up-step never reached the deck — the step is a wall, not a jump')
    }
    // clock counts down and ends the game
    {
        const g = makeGame(0, { count: 0 })
        g.clock = 2
        let ended = ''
        for (let t = 0; t < 200 && !ended; t++) { step(g, {}); ended = g.end || ''; g.events.length = 0 }
        ok(ended === 'time', 'the clock never ran the bike out of time — the countdown is a decoration')
    }
    // DebugKit's decide() actually answers (never throws, always names a lever)
    {
        const g = makeGame(0, {})
        step(g, { g: true })
        const d = decide(g, { pump: 0 })
        ok(d && ('g' in d), 'decide() gave no throttle verdict')
    }
}

// ------------------------------------------------------------ mutations ----
if (MUT) {
    section('MUTATIONS — each MUST turn an honest check red')
    const probeBoost = () => {
        const g = makeGame(0, { count: 0 }); g.v = 3; g.boostAt = -1e6
        g.x = 3950; g.alt = groundY(track(0).ground, 3950)
        step(g, { g: true })
        return g.v >= 6
    }
    const probeStall = () => {
        const tr = track(0); const w = tr.bands.find((b) => b[0] === WATER)
        const g = makeGame(0, { count: 0 })
        g.x = w[1] + 20; g.alt = groundY(tr.ground, g.x); g.v = 2.0
        for (let t = 0; t < 200; t++) { step(g, { g: true }); if (g.events.some((e) => e.type === 'stall')) return true; g.events.length = 0 }
        return false
    }
    const probeHeat = () => {
        const g = makeGame(0, { count: 0 })
        for (let t = 0; t < 3000; t++) { step(g, { g: true }); if (g.events.some((e) => e.type === 'overheat')) return true; g.events.length = 0 }
        return false
    }
    const probeCrash = () => {
        const g = makeGame(0, { count: 0 }); g.v = 6
        for (let t = 0; t < 4000; t++) {
            g.x = (t * 6) % (LAP - 200); g.alt = groundY(track(0).ground, g.x) + 40; g.air = true; g.vy = 1; g.jumpT = 0
            for (let k = 0; k < 120; k++) { step(g, { d: true }); if (g.crash > 0) return true; if (g.end) break }
            g.events.length = 0
        }
        return false
    }
    const probeBack = () => {
        const g = makeGame(0, { count: 0 }); g.v = 6
        for (let t = 0; t < 4000; t++) {
            g.x = (t * 6) % (LAP - 200); g.alt = groundY(track(0).ground, g.x) + 40; g.air = true; g.vy = 1; g.jumpT = 0
            for (let k = 0; k < 120; k++) { step(g, { u: true }); if (g.crash > 0) return true; if (g.end) break }
            g.events.length = 0
        }
        return false
    }
    const tryMut = (name, apply, probe, expect = true) => {        const base = probe()
        ok(base === expect, `mutation harness broken: baseline for '${name}' is ${base}, expected ${expect}`)
        const save = apply()
        const v = probe()
        for (const k of Object.keys(save)) CFG[k] = save[k]
        console.log(`  mut ${name}: ${v === expect ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(v !== expect, `${name} SURVIVED — a check stopped touching this rule`)
    }
    const flat = (patch) => () => { const s = {}; for (const k of Object.keys(patch)) { s[k] = CFG[k]; CFG[k] = patch[k] } return s }
    tryMut('boostV=0 (arrows are paint)', flat({ boostV: 0 }), probeBoost)
    tryMut('waterStall=0 (the hole never bites)', flat({ waterStall: 0 }), probeStall)
    tryMut('heatBoil=inf (engine is immortal)', flat({ heatBoil: 1e9 }), probeHeat)
    tryMut('landFwd=inf (nose-down landings are free)', flat({ landFwd: 1e9 }), probeCrash)
    // NB no "tight thresholds" mutant: the in-air stabilizer (pitch eases to
    // the landing slope with no input) makes an over-tight envelope an
    // EQUIVALENT mutant — it never punishes a stabilizing rider. The
    // clean-land check in RULES is the real guard on that path.
    tryMut('mudDrag=0 (water/mud is just road)', flat({ mudDrag: 0, waterDrag: 0 }), () => {
        // hold a bike IN the water, coasting (no gas, no pump). With drag the
        // hole bleeds it under the stall floor; with drag gone it coasts on.
        const tr = track(0); const w = tr.bands.find((b) => b[0] === WATER)
        const mid = (w[1] + w[2]) / 2
        const g = makeGame(0, { count: 0 }); g.v = 3; g.x = mid; g.alt = groundY(tr.ground, mid)
        let clean = true
        for (let t = 0; t < 120; t++) {
            g.x = mid; g.alt = groundY(tr.ground, mid)   // keep it soaked
            step(g, {})
            if (g.stall > 0 || g.events.some((e) => e.type === 'stall')) { clean = false; break }
            g.events.length = 0
        }
        return clean   // drag present => stalls => clean=false; drag gone => true
    }, false)
    tryMut('brake=inf (the bike cannot slow — no skip, all stall)', flat({ brake: 9 }), () => {
        // the lever brake owns is DECELERATION. From a run, braking must take a
        // real, readable distance to stop (not one brick-wall tick). A bike
        // that cannot feather the gas into the water cannot choose to skip it.
        const g = makeGame(1, { count: 0 }); g.x = 100; g.alt = groundY(track(1).ground, 100); g.v = 6
        let ticks = 0
        for (let t = 0; t < 400 && g.v > 0.2; t++) { step(g, { b: true }); ticks++; g.events.length = 0 }
        return ticks >= 18   // a real brake takes >=18 ticks; brake=9 stops in 1
    })
    tryMut('crashMash=0 (mash will not walk it out)', flat({ crashMash: 0 }), () => {
        // the arcade contract: mashing A after a wipeout beats just waiting.
        // grade the DIFFERENTIAL — mash recovery vs coast recovery.
        const rec = (mash) => {
            const g = makeGame(0, { count: 0 }); g.crash = 100
            let t = 0
            while (g.crash > 0 && t < 600) { step(g, mash ? { j: t % 2 === 0 } : {}); t++; g.events.length = 0 }
            return t
        }
        return rec(true) < rec(false)
    })
    tryMut('landBack=1e9 (over-rotation is free)', flat({ landBack: 1e9 }), probeBack)
    tryMut('count=inf (the gate never lifts)', () => { const s = { count: CFG.count }; CFG.count = 1e9; return s }, () => {
        const g = makeGame(0, {})
        for (let t = 0; t < 400; t++) step(g, { g: true })
        return g.total > 1
    })
}

console.log(`\nexcitecheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
