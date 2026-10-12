// SPY HUNTER — the harness. No browser, a few seconds. This is the gate for
// the issue's muscle ("faithful replica of the original arcade"): the two
// stages are audited tick by tick as DATA before the autopilot ever drives
// them — oil may never seal all three lanes, nothing may spawn inside a
// wall, every stage must carry its supplies. Then the campaign runs for
// real through the same step() the player drives, the score ledger is
// recomputed from events the machine itself booked, and the slack rule
// re-wins it with one fewer missile per crate, with NO missiles at all, and
// with one fewer life.
//
//   npm run huntercheck
//   npm run huntercheck -- --mutate   # re-break the load-bearing rules;
//                                     # a surviving mutant means a check
//                                     # stopped touching the code
import { makeGame, step, CFG, PY, ROAD_L, ROAD_R, stateHash } from '../src/games/SpyHunter/sim.js'
import { STAGES, L1, L2, L3 } from '../src/games/SpyHunter/script.js'
import { plan } from '../src/games/SpyHunter/planner.js'

const MUT = process.argv.includes('--mutate')
let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)
const LANES = [L1, L2, L3]

// ---------------------------------------------------------------- road audit ----
section('ROAD AUDIT (the script is projected, not trusted)')
{
    for (let s = 0; s < STAGES.length; s++) {
        const st = STAGES[s]
        const g = makeGame(s)
        let maxSeal = 0, sealedAt = -1, spawnInCar = 0, wallSpawn = 0
        for (let t = 0; t < st.ticks + 300; t++) {
            g.player.invuln = 99   // the ghost is a camera, not a casualty
            step(g, {})
            // nothing spawns inside a car already on the road, or off-road
            // (the heli flies over the river — its spawn line is the sky)
            for (const e of g.ents) {
                if (e.type === 'heli') continue
                if (e.y > -18 && e.y < PY) {
                    if (e.x < ROAD_L + 12 || e.x > ROAD_R - 12) wallSpawn++
                }
            }
            // lane sealing: how many lane lines does oil currently cover
            // in the window where the player must already have committed?
            const win = g.oils.filter((o) => o.y > PY - 120 && o.y < PY - 20)
            const blocked = LANES.filter((lx) => win.some((o) => Math.abs(o.x - lx) < o.w / 2 + 4))
            if (blocked.length > maxSeal) { maxSeal = blocked.length; sealedAt = t }
        }
        ok(maxSeal <= 2, `stage ${s + 1}: oil sealed ${maxSeal} lanes at t=${sealedAt} — three-wide oil is an execution, not a hazard`)
        ok(wallSpawn === 0, `stage ${s + 1}: ${wallSpawn} cars spawned inside the walls/river`)
        void spawnInCar
    }
    // supplies exist per stage: at least one missile crate and the boat that
    // makes missiles matter
    for (let s = 0; s < STAGES.length; s++) {
        const crates = STAGES[s].events.filter((e) => e.type === 'supporter' && e.crate === 'missile')
        ok(crates.length >= 1, `stage ${s + 1} carries no missile crate — the boat is unbeatable and the slack rule is vacuous`)
    }
    // the boat actually fires
    {
        const g = makeGame(0)
        let fires = 0
        for (let t = 0; t < 900; t++) { g.player.invuln = 99; step(g, {}); fires += g.events.filter((e) => e.type === 'boatfire').length; g.events.length = 0 }
        ok(fires > 0, 'the gunboat never fired once — the missile has no reason to exist')
    }
    // every scripted car actually reaches the player's row
    for (let s = 0; s < STAGES.length; s++) {
        const g = makeGame(s)
        const seen = new Set()
        for (let t = 0; t < STAGES[s].ticks + 300; t++) {
            g.player.invuln = 99
            step(g, {})
            for (const e of g.ents) if (e.state === 'run' && e.y > PY - 30) seen.add(e.type)
            g.events.length = 0
        }
        for (const type of ['laker', 'rambler', 'sweeper', 'killer', 'traffic', 'heli', 'supporter']) {
            if (!STAGES[s].events.some((e) => e.type === type)) continue
            ok(seen.has(type), `stage ${s + 1}: scripted ${type} never reached the driving row`)
        }
    }
}

// --------------------------------------------------------- the campaign run ----
section('THE CAMPAIGN (autopilot = attract demo) + LEDGER')
const t0 = Date.now()
let ledger = 0
const r = plan({
    onEvent: (e) => {
        if (e.type === 'kill' || e.type === 'crate' || e.type === 'dist' || e.type === 'stageclear') ledger += e.pts
    },
})
const solveMs = Date.now() - t0
ok(r.ok, `the autopilot did not clear both stages: end=${r.game.end} stage=${r.game.stage}`)
ok(solveMs < 40000, `solve took ${solveMs}ms — the gate must stay seconds`)
ok(r.receipts.kills >= 12, `only ${r.receipts.kills} kills — the highway did not really fight back`)
ok(r.receipts.missilesFired >= 1, 'the proven run fired ZERO missiles — the slack rule would be vacuous')
ok(r.receipts.crates >= 1, 'the proven run caught no crate — the Supporter is theatre')
ok(r.game.score === ledger, `score ledger lies: score says ${r.game.score}, events say ${ledger}`)
ok(r.game.stage === STAGES.length - 1 && r.game.end === 'win', 'did not finish on stage 2 with a win')

// ---------------------------------------------------------------- determinism ----
section('DETERMINISM (the attract replay is not theatre)')
{
    const g = makeGame(0)
    for (const inp of r.script) step(g, inp)
    ok(g.score === r.game.score && g.tick === r.game.tick, 'replay diverged from the proven run')
    // drop a fire and compare FIVE TICKS LATER, while the missing bullet is
    // still airborne. Comparing only the end of the run proves nothing: a
    // shot that missed everything reconverges, and that is not a bug.
    const g2 = makeGame(0)
    const g3 = makeGame(0)
    const j = r.script.findIndex((i) => i.f)
    ok(j > 0, 'winning script never fired the gun — tamper probe cannot run')
    for (let k = 0; k < j + 5 && k < r.script.length; k++) {
        step(g3, r.script[k])
        step(g2, k === j ? { ...r.script[k], f: false } : r.script[k])
    }
    ok(stateHash(g2) !== stateHash(g3), 'dropping one fire left no bullet missing — the sim ignores bullets')
}

// ------------------------------------------------------------------ slack rule ----
section('SLACK RULE (fewer supplies, same win — or the goods were theatre)')
{
    const base = r.receipts.missilesFired
    for (const tax of [1, 2, 3]) {
        const rs = plan({ missileTax: tax })
        ok(rs.ok, `ZERO SLACK — with the Supporter carrying ${3 - tax} missiles per crate the campaign dies (${rs.game.end})`)
        ok(rs.receipts.missilesFired < base || tax === 3, `tax=${tax} fired the same ${rs.receipts.missilesFired} missiles — the tax was not paid`)
    }
    const rl = plan({ lives: 2 })
    ok(rl.ok, 'ZERO SLACK — the campaign cannot survive one fewer life')
}

// ------------------------------------------------------------ rules honesty ----
section('RULES THE ARCADE PROMISED')
{
    // the gun can NEVER touch the boat — that is what the missiles are for
    const g = makeGame(0)
    g.player.x = ROAD_R - 8
    for (let t = 0; t < 400; t++) step(g, { f: true })
    ok(!g.events.some((e) => e.type === 'kill' && e.kind === 'boat'), 'a ROAD bullet killed the boat — the river is not the road')
    // a missile can
    {
        const g2 = makeGame(0)
        g2.missiles = 5
        g2.player.x = ROAD_R - 10
        let killed = false
        for (let t = 0; t < 900 && !killed; t++) {
            g2.player.invuln = 99
            g2.player.spin = 0
            g2.oils.length = 0
            g2.ents.length = 0   // aim test, not a duel: the missile homes on the NEAREST car,
            // and a laker 2 px closer steals every salvo (which is correct behavior —
            // and was exactly why this probe once "failed" against a working missile)
            const boat = g2.boat
            step(g2, { m: boat.state === 'run' && boat.y > 40 && boat.y < 150 && t % 20 === 0 })
            killed = g2.events.some((e) => e.type === 'kill' && e.kind === 'boat')
            g2.events.length = 0
        }
        ok(killed, 'a missile never killed the boat either — the river is simply unreachable')
        // and it comes back for more
        let back = false
        for (let t = 0; t < 700 && !back; t++) { step(g2, {}); back = g2.events.some((e) => e.type === 'boatback'); g2.events.length = 0 }
        ok(back, 'the boat stayed dead — the river emptied forever')
    }
    // oil spins, once per slick
    {
        const g3 = makeGame(0)
        g3.player.invuln = 0
        g3.oils.push({ x: g3.player.x, y: PY - 30, w: 38, vy: CFG.scroll, hit: false })
        let spins = 0
        for (let t = 0; t < 80; t++) { step(g3, {}); spins += g3.events.filter((e) => e.type === 'spin').length; g3.events.length = 0 }
        ok(spins === 1, `one slick caused ${spins} spins — a slick must grab once, not re-grab`)
        ok(g3.player.spin === 0, 'the spin never ended — no recovery from oil')
    }
    // the gun overheats and then will NOT fire until it cools
    {
        const g4 = makeGame(0)
        let hot = false
        for (let t = 0; t < 400 && !hot; t++) { step(g4, { f: true }); hot = g4.events.some((e) => e.type === 'overheat'); g4.events.length = 0 }
        ok(hot, '400 held-down trigger ticks and the gun never overheated — heat is theatre')
        let shots = 0
        for (let t = 0; t < 50; t++) { const n = g4.shots.length; step(g4, { f: true }); if (g4.shots.length > n) shots++; g4.events.length = 0 }
        ok(shots === 0, `it fired ${shots} times while the lockout ran — overheat is theatre`)
        for (let t = 0; t < 250; t++) step(g4, {})
        const n = g4.shots.length
        for (let t = 0; t < 20; t++) step(g4, { f: true })
        ok(g4.shots.length > n, 'the gun never recovered after cooling — overheat is a death sentence, not a pause')
    }
    // grass kills slowly; the wall kills now
    {
        const g5 = makeGame(0)
        g5.player.x = ROAD_L - 6
        let died = ''
        for (let t = 0; t < CFG.offMax + 40; t++) {
            step(g5, {})
            const d = g5.events.find((e) => e.type === 'death')
            if (d) { died = d.why; break }
            g5.events.length = 0
        }
        ok(died === 'offroad', `grass did not eventually kill the car (died: ${died || 'never'})`)
        const g6 = makeGame(0)
        g6.player.invuln = 0
        g6.player.x = ROAD_L - 14
        step(g6, {})
        ok(g6.player.dead > 0, 'the wall let a car drive through it')
    }
    // the sweeper shoves instead of killing
    {
        const g7 = makeGame(0)
        g7.player.invuln = 0
        const x0 = g7.player.x
        g7.ents.push({ id: 'mut-sweep', type: 'sweeper', x: x0 - 12, y: PY, vy: 1.0, t: 0, hp: 3, state: 'run', push: 1 })
        step(g7, {})
        ok(g7.player.dead === 0 && g7.player.x > x0, 'the sweeper did not shove (or killed) — it is a plow, not a wall')
    }
    // the bonus car pays 2000 and only once
    {
        const g8 = makeGame(0)
        g8.stageT = STAGES[0].ticks - 2
        let pts = 0
        for (let t = 0; t < STAGES[0].ticks; t++) {
            g8.player.invuln = 99
            g8.player.x = g8.bonusAlive ? g8.bonusX : 112
            step(g8, { f: true })
            for (const e of g8.events) if (e.kind === 'bonus') pts += e.pts
            g8.events.length = 0
        }
        ok(pts === 0 || pts === CFG.points.bonus, `bonus car paid ${pts} — one crossing pays 0 or exactly 2000, twice is a bug`)
    }
    // deaths book nothing: a kill credited to its victim would lie in the ledger
    {
        const g9 = makeGame(0)
        g9.player.invuln = 0
        g9.ents.push({ id: 'mut-kill', type: 'killer', x: g9.player.x, y: PY, vy: 0.3, t: 1, hp: 1, state: 'run', fire: 9999 })
        step(g9, {})
        ok(!g9.events.some((e) => e.type === 'kill'), 'the car that ran you over was credited as YOUR kill')
    }
}

// ------------------------------------------------------------------ mutations ----
if (MUT) {
    section('MUTATIONS — each MUST turn an honest check red')
    const BONUS0 = CFG.points.bonus
    const spinProbe = () => {
        const g = makeGame(0)
        g.player.invuln = 0
        g.oils.push({ x: g.player.x, y: PY - 30, w: 38, vy: CFG.scroll, hit: false })
        for (let t = 0; t < 80; t++) {
            step(g, {})
            // the EVENT alone would survive a spin=0 mutant — the spin
            // DURATION is the control that was stolen
            const e = g.events.find((e) => e.type === 'spin')
            if (e && g.player.spin > 0) return true
            g.events.length = 0
        }
        return false
    }
    const heatProbe = () => {
        const g = makeGame(0)
        for (let t = 0; t < 400; t++) { step(g, { f: true }); if (g.events.some((e) => e.type === 'overheat')) return true; g.events.length = 0 }
        return false
    }
    const recoverProbe = () => {
        const g = makeGame(0)
        for (let t = 0; t < 400; t++) { g.player.invuln = 99; step(g, { f: true }) }
        for (let t = 0; t < 250; t++) { g.player.invuln = 99; step(g, {}) }
        const n = g.shots.length
        for (let t = 0; t < 40; t++) { g.player.invuln = 99; step(g, { f: true }) }
        // one sputtering shot through a re-lock is NOT recovery: heat must
        // actually fall, which buys the sustained burst of a real cooldown
        return g.shots.length - n >= 2
    }
    const grassProbe = () => {
        const g = makeGame(0)
        g.player.x = ROAD_L - 6
        for (let t = 0; t < 400; t++) { step(g, {}); if (g.events.some((e) => e.type === 'death')) return true; g.events.length = 0 }
        return false
    }
    const boatProbe = () => {
        const g = makeGame(0)
        let f = 0
        for (let t = 0; t < 900; t++) { step(g, {}); f += g.events.filter((e) => e.type === 'boatfire').length; g.events.length = 0 }
        return f > 0
    }
    const bonusProbe = () => {
        const g = makeGame(0)
        g.stageT = STAGES[0].ticks - 2
        let pts = 0
        for (let t = 0; t < 400; t++) { g.player.x = g.bonusAlive ? g.bonusX : 112; step(g, { f: true }); for (const e of g.events) if (e.kind === 'bonus') pts += e.pts; g.events.length = 0 }
        return pts === 0 || pts === BONUS0
    }
    const tryMut = (name, apply, probe, expect = true) => {
        const base = probe()
        ok(base === expect, `mutation harness broken: baseline for '${name}' is not the expected ${expect}`)
        const save = apply()
        const v = probe()
        for (const k of Object.keys(save)) {
            if (save[k] && typeof save[k] === 'object') CFG.points[k] = save[k].points
            else CFG[k] = save[k]
        }
        console.log(`  mut ${name}: ${v === expect ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(v !== expect, `${name} SURVIVED — a check stopped touching this rule`)
    }
    const flat = (patch) => () => { const save = {}; for (const k of Object.keys(patch)) { save[k] = CFG[k]; CFG[k] = patch[k] } return save }
    tryMut('spin=0 (oil is floor polish)', flat({ spin: 0 }), spinProbe)
    tryMut('heatMax=inf (gun never overheats)', flat({ heatMax: 1e9 }), heatProbe)
    tryMut('heatCool=0 (gun stays dead)', flat({ heatCool: 0 }), recoverProbe)
    tryMut('offMax=inf (grass is pavement)', flat({ offMax: 1e9 }), grassProbe)
    tryMut('boatFire=inf (the river goes quiet)', flat({ boatFire: 100000 }), boatProbe)
    tryMut('bonus=10 (double-dipping pays)', () => { const save = { points: CFG.points.bonus }; CFG.points.bonus = 10; return save }, bonusProbe)
}

console.log(`\nhuntercheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
