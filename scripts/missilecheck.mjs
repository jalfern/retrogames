// MISSILE BATTLE — the Node gate. No browser, no dev server: this file is the
// reason the attract demo is a PROVEN run and not theatre.
//
//   npm run missilecheck            # audits + proven run + slack rule
//   npm run missilecheck -- --mutate  # re-break the load-bearing rules;
//                                     every mutant MUST turn something red
//
// Sections: script audit (every warhead is legal and coverable) · frozen
// Math.random · engine pins (exact intercept, chain, spans, rebuild, banner)
// · the planner's proven run · the SLACK RULE (every wave re-solved with ONE
// FEWER interceptor in EVERY battery) · determinism.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { makeGame, step, stateHash, CFG, W } from '../src/games/MissileBattle/sim.js'
import { decide, plan } from '../src/games/MissileBattle/planner.js'
import { WAVES, TARGETS } from '../src/games/MissileBattle/waves.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const MUT = process.argv.includes('--mutate')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

const toPlay = (g) => {
    let t = 0
    while (g.phase !== 'play' && t < 400) { step(g, {}); t++ }
    return g
}

// ---------------------------------------------------------------- math is banned ----
section('MATH.RANDOM IS A SIM CRIME')
for (const f of ['sim.js', 'waves.js', 'planner.js']) {
    const raw = readFileSync(join(HERE, '../src/games/MissileBattle', f), 'utf8')
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(!/Math\s*\.\s*random/.test(src), `${f} contains Math.random — nothing here may be luck`)
}
const realRandom = Math.random
Math.random = () => { throw new Error('Math.random called during sim/planner — the world must be scripted') }
let froze = false
try {
    const g = toPlay(makeGame(1))
    plan(g)
    froze = true
} catch (e) {
    fails.push(`frozen Math.random was hit: ${e.message}`)
}
Math.random = realRandom
ok(froze, 'a full three-wave plan runs with Math.random THROWN at the call site')

// ---------------------------------------------------------------- script audit ----
section('WAVE SCRIPT AUDIT')
{
    let launches = 0, splits = 0, drops = 0, warheads = 0
    WAVES.forEach((w, wi) => {
        let prevT = -1
        for (const en of w.entries) {
            launches++
            ok(en.t > prevT, `w${wi}: entry t=${en.t} not after ${prevT}`)
            prevT = en.t
            ok(en.t >= 0 && en.t < 3000, `w${wi}: entry t=${en.t} outside window`)
            if (en.kind === 'bomber') {
                ok(Number.isFinite(en.vx) && en.vx !== 0, `w${wi}: bomber needs vx`)
                ok(en.y > 10 && en.y < 120, `w${wi}: bomber altitude ${en.y}`)
                for (const d of en.drops) {
                    drops++
                    ok(TARGETS[d.ti] !== undefined && d.t > 0, `w${wi}: bad drop ${JSON.stringify(d)}`)
                    warheads++
                }
            } else {
                ok(en.x0 >= 0 && en.x0 <= W, `w${wi}: icbm spawn x=${en.x0} off-map`)
                ok(en.spd >= (CFG.groundY + 4) / CFG.maxVY, `w${wi}: spd ${en.spd} falls faster than maxVY`)
                ok(TARGETS[en.ti] !== undefined, `w${wi}: target ${en.ti} is not a city or base`)
                warheads++
                if (en.split) {
                    splits++
                    ok(en.split.n >= 2 && en.split.n <= 3, `w${wi}: split n=${en.split.n}`)
                    ok(en.split.y > 20 && en.split.y < CFG.groundY - 60, `w${wi}: split altitude ${en.split.y} too low to answer`)
                    warheads += en.split.n - 1
                    // the split must happen while the parent is still above killLine
                    const yAt = (en.split.y + 4) / (CFG.groundY + 4) * en.spd
                    ok(en.spd - yAt > 30, `w${wi}: split leaves under 30 ticks of answer time`)
                }
            }
        }
    })
    ok(launches >= 40, `only ${launches} scripted launches across three barrages`)
    ok(splits >= 10, `only ${splits} MIRV splits — this is not a saturation game`)
    ok(drops >= 8, `only ${drops} bomber drops`)
    console.log(`  ..    ${launches} launches, ${warheads} warheads, ${splits} splitters, ${drops} bomber drops`)

    // every city column must be coverable by some battery even if two die
    for (const t of TARGETS) {
        const cover = CFG.spans.filter(([a, z]) => t >= a && t <= z)
        ok(cover.length >= 1, `target x=${t} is not in ANY battery arc — an unhittable city`)
    }
}

// ------------------------------------------------------------------ engine pins ----
section('ENGINE PINS')
{
    // an interceptor lands exactly on its point
    const g = toPlay(makeGame(0))
    step(g, { aimTo: [100, 60], fire: true })
    const ifire = g.events.find((e) => e.type === 'ifire')
    ok(!!ifire && ifire.bat === 1, `first shot at x=100 comes from battery ${ifire?.bat} (want the nearest: 1)`)
    let boom = null
    for (let t = 0; t < 120 && !boom; t++) { step(g, {}); boom = g.events.find((e) => e.type === 'boom') }
    ok(!!boom && Math.abs(boom.x - 100) < 1 && Math.abs(boom.y - 60) < 1, `boom landed at ${boom?.x},${boom?.y} (want 100,60 — the exact-arrival contract missileplay samples)`)

    // held-edge: holding fire must not drain the battery
    const g2 = toPlay(makeGame(0))
    const a0 = g2.bases[1].ammo
    step(g2, { aimTo: [128, 50], fire: true })
    for (let t = 0; t < 20; t++) step(g2, { aimTo: [128, 50], fire: true })
    ok(g2.bases[1].ammo === a0 - 1, `a HELD Space fired ${a0 - g2.bases[1].ammo} shots (must be exactly 1 — fire is edge-triggered)`)

    // spans: the right edge belongs to battery 2, the left to battery 0
    const g3 = toPlay(makeGame(0))
    step(g3, { aimTo: [248, 70], fire: true })
    ok(g3.events.find((e) => e.type === 'ifire')?.bat === 2, 'a shot at x=248 does not come from the right battery')
    step(g3, { fire: false })   // release the latch — Space is edge-triggered
    step(g3, { aimTo: [6, 70], fire: true })
    ok(g3.events.some((e) => e.type === 'ifire' && e.bat === 0), 'a shot at x=6 does not come from the left battery')

    // deny is loud, not silent
    const g4 = toPlay(makeGame(0))
    g4.bases.forEach((b) => { b.ammo = 0 })
    step(g4, { aimTo: [128, 60], fire: true })
    ok(!!g4.events.find((e) => e.type === 'deny'), 'out of ammo must answer DENY, not silence')

    // a blast kills what it touches; the CHAIN kills a neighbour the main
    // blast can NEVER reach (18px out, chain reaches ~9 from the kill point)
    const g5 = toPlay(makeGame(0))
    g5.enemies.push({ id: 501, kind: 'icbm', x: 112, px: 112, y: 60, vx: 0, vy: 0, ti: -1, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 0, score: 25 })
    g5.enemies.push({ id: 502, kind: 'icbm', x: 120, px: 120, y: 60, vx: 0, vy: 0, ti: -1, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 0, score: 25 })
    g5.enemies.push({ id: 503, kind: 'icbm', x: 160, px: 160, y: 60, vx: 0, vy: 0.4, ti: -1, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 0, score: 25 })
    g5.blasts.push({ x: 100, y: 60, r: 11, rMax: 13, age: 1, state: 'grow', chain: false })
    let chainKill = false
    for (let t = 0; t < 40; t++) {
        step(g5, {})
        for (const e of g5.events) if (e.type === 'kill' && e.chain && e.x >= 116 && e.x <= 124) chainKill = true
    }
    ok(!g5.enemies.some((e) => e.id === 501 && e.alive), 'a warhead inside an expanding blast survived')
    ok(chainKill, 'the neighbour 18px out was never chain-killed — saturation has no answer')
    ok(g5.enemies.some((e) => e.id === 503 && e.alive), 'a warhead 60px away died to a 13px blast')
    for (let t = 0; t < 60 && g5.blasts.length; t++) step(g5, {})
    ok(g5.blasts.length === 0, 'blasts never die')

    // ground truth: an unopposed warhead takes its city; all six down = dark
    const g6 = toPlay(makeGame(0))
    g6.enemies.push({ id: 601, kind: 'icbm', x: 54, px: 54, y: 180, vx: 0, vy: 1, ti: 0, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 0, score: 25 })
    let hit = null
    for (let t = 0; t < 30 && !hit; t++) { step(g6, {}); hit = g6.events.find((e) => e.type === 'cityHit') }
    ok(!!hit && !g6.cities[0].alive, 'a warhead landed on a city and the city stayed lit')
    g6.cities.slice(1).forEach((c) => { c.alive = false })
    g6.enemies.push({ id: 602, kind: 'icbm', x: 146, px: 146, y: 188, vx: 0, vy: 1, ti: 3, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 0, score: 25 })
    let dark = null
    for (let t = 0; t < 30 && !dark; t++) { step(g6, {}); dark = g6.events.find((e) => e.type === 'lose') }
    ok(!!dark && g6.end === 'lose', 'the sixth city fell and the map stayed lit')
}

// ------------------------------------------------------------------- no-fire loses ----
section('DOING NOTHING LOSES')
{
    const g = toPlay(makeGame(0))
    let t = 0
    while (!g.end && t < 9000) { step(g, {}); t++ }
    ok(g.end === 'lose', `zero interceptors thrown and the game ended ${g.end} — the sim does not punish doing nothing`)
    ok(t < 3000, `the unpunished sky took ${t} ticks to fall — saturation must arrive in seconds`)
}

// ------------------------------------------------------------- the proven run ----
section('THE PROVEN RUN (the attract demo replays exactly this)')
let provenFired = 0
{
    const g = makeGame(0)
    const t0 = Date.now()
    const r = plan(g)
    ok(r.ok, `the autopilot did NOT win: end=${r.receipts.end}`)
    ok(r.receipts.citiesLost === 0, `${r.receipts.citiesLost} cities lost on the proven run — the demo must be perfect`)
    ok(r.receipts.kills >= 45, `only ${r.receipts.kills} kills across three barrages`)
    provenFired = r.receipts.fired
    ok(provenFired <= 84, `the proven run burned ${provenFired} interceptors — over 3×28 leaves no slack`)
    for (const w of r.receipts.perWave) ok(w.lost === 0 && w.kills > 0, `wave ${w.wave} receipts wrong: ${JSON.stringify(w)}`)
    console.log(`  ..    ${provenFired} fired, ${r.receipts.kills} kills, ${Date.now() - t0} ms, score ${r.receipts.score}`)
    ok(r.receipts.perWave.length === 3, `run ended after ${r.receipts.perWave.length} waves — must walk all three`)
}

// ------------------------------------------------------------------- the slack rule ----
section('SLACK RULE — one fewer interceptor in EVERY battery')
{
    const honest = CFG.ammoWave
    for (let w = 0; w < WAVES.length; w++) {
        CFG.ammoWave = honest - 1
        const r = plan(makeGame(w))
        CFG.ammoWave = honest
        ok(r.ok, `wave ${w} is NOT winnable at ${honest - 1} per battery (fired ${r.receipts.fired}, lost ${r.receipts.citiesLost}) — zero slack is a build failure`)
        console.log(`  ..    wave ${w} @ ${honest - 1}/battery: ${r.ok ? 'WINS' : 'LOSES'} (${r.receipts.fired} fired, ${r.receipts.citiesLost} lost)`)
    }
}

// ------------------------------------------------------------------ determinism ----
section('DETERMINISM')
{
    const run = () => {
        const g = makeGame(0)
        const held = new Map()
        const hs = []
        for (let t = 0; t < 30000 && !g.end; t++) {
            step(g, decide(g, held))
            if (t % 1000 === 0) hs.push(stateHash(g))
        }
        return { hs, end: g.end, score: g.score }
    }
    const a = run(), b = run()
    ok(JSON.stringify(a) === JSON.stringify(b), 'two identical runs of the same script diverged')
    ok(a.end === 'win', `the determinism run ended ${a.end} (want win)`)

    // stateHash must actually SEE the world
    const g1 = toPlay(makeGame(0)), g2 = toPlay(makeGame(0))
    for (const g of [g1, g2]) {
        for (let t = 0; t < 70; t++) step(g, {})   // the first warheads launch
    }
    ok(g1.enemies.length > 0 && stateHash(g1) === stateHash(g2), 'two fresh identical states hash differently')
    g2.enemies[0].x += 0.4
    ok(stateHash(g1) !== stateHash(g2), 'stateHash ignores enemy x')
    g2.enemies[0].x -= 0.4
    g2.aim.x += 0.1
    ok(stateHash(g1) !== stateHash(g2), 'stateHash ignores the reticle')
}

// ------------------------------------------------------------------ mutations ----
if (MUT) {
    section('MUTATIONS — each MUST turn an honest check red')

    const tryMut = (name, apply, probe, expect = true) => {
        const base = probe()
        ok(base === expect, `mutation harness broken: baseline for '${name}' is not ${expect}`)
        const save = {}
        for (const k of Object.keys(apply)) save[k] = CFG[k]
        Object.assign(CFG, apply)
        const v = probe()
        Object.assign(CFG, save)
        console.log(`  mut ${name}: ${v === expect ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(v !== expect, `${name} SURVIVED — a check stopped touching this rule`)
    }

    // "wins" is too soft a bar for these two probes — a map burned to five
    // embers still WINS. The question here is: is the defense still CLEAN?
    const cleanWin = (w) => {
        const r = plan(makeGame(w))
        return r.ok && r.receipts.citiesLost === 0
    }

    // 1. interdict too slow: intercept math cannot outrun the fall
    tryMut('ivSpeed 2.1 -> 0.9 (batteries too slow)', { ivSpeed: 0.9 }, () => cleanWin(2))

    // 2. chains off: the cluster kill — saturation's only answer — dies
    const chainWorks = () => {
        const g = toPlay(makeGame(0))
        g.enemies.push({ id: 701, kind: 'icbm', x: 112, px: 112, y: 60, vx: 0, vy: 0, ti: -1, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 0, score: 25 })
        g.enemies.push({ id: 702, kind: 'icbm', x: 120, px: 120, y: 60, vx: 0, vy: 0, ti: -1, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 0, score: 25 })
        g.blasts.push({ x: 100, y: 60, r: 11, rMax: 13, age: 1, state: 'grow', chain: false })
        let chained = false
        for (let t = 0; t < 40; t++) { step(g, {}); for (const e of g.events) if (e.type === 'kill' && e.chain) chained = true }
        return chained
    }
    tryMut('chainR 0.72 -> 0 (no cluster kill)', { chainR: 0 }, chainWorks)

    // 3. a blast that inflates lethargically: the exact-centre kill still
    //    lands (contact at dist 0), but the neighbour at +8px never gets
    //    reached before it has fallen out of the blast's reach
    tryMut('blastGrow 0.7 -> 0.05 (blast inflates too slow to chain)', { blastGrow: 0.05 }, chainWorks)

    // 4. left battery blinded by a span swap: the player's own pick changes
    const leftPick = () => {
        const g = toPlay(makeGame(0))
        step(g, { aimTo: [6, 70], fire: true })
        return g.events.find((e) => e.type === 'ifire')?.bat === 0
    }
    tryMut('left battery span [0,104] -> [0,4]', { spans: [[0, 4], CFG.spans[1], CFG.spans[2]] }, leftPick)

    // 5. ammo economy: 6 per battery must NOT stay clean (the slack margin
    //    is one interceptor per battery — a mutant that steals four proves
    //    the slack loop is actually counting, and fires inputs that the
    //    empty tubes DENY must not count as a working defense)
    {
        const base = cleanWin(1)
        ok(base === true, "mutation harness broken: baseline for 'ammo economy'")
        const save = CFG.ammoWave
        CFG.ammoWave = 6
        const v = cleanWin(1)
        CFG.ammoWave = save
        console.log(`  mut ammoWave 10 -> 6: ${v === true ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(v !== true, 'ammoWave 6 stayed clean — the slack loop is not counting batteries')
    }

    // 6. ground impact ignores cities: the lose check stops being touched
    {
        const groundKills = () => {
            const g = toPlay(makeGame(0))
            g.enemies.push({ id: 801, kind: 'icbm', x: 54, px: 54, y: 185, vx: 0, vy: 1, ti: 0, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 0, score: 25 })
            for (let t = 0; t < 30; t++) step(g, {})
            return !g.cities[0].alive
        }
        const base = groundKills()
        ok(base === true, "mutation harness broken: baseline for 'ground kill'")
        const save = CFG.groundY
        CFG.groundY = 400
        const v = groundKills()
        CFG.groundY = save
        console.log(`  mut groundY 192 -> 400 (warheads phase through cities): ${v === true ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(v !== true, 'the ground-impact rule SURVIVED underground — no check watches the floor')
    }
}

console.log(`\nmissilecheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
