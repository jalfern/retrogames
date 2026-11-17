// MISSILE BATTLE — the Node gate. No browser, no dev server: this file is the
// reason the attract demo is a PROVEN run and not theatre.
//
//   npm run missilecheck            # audits + proven run + slack rule
//   npm run missilecheck -- --mutate  # re-break the load-bearing rules;
//                                     every mutant MUST turn something red
//
// Sections: script audit (every warhead is legal and coverable) · frozen
// Math.random · engine pins (exact intercept, chain, spans, rebuild, banner)
// · the planner's proven run · bomber hunt (#2306 — altitude is real, the
// doctrine shoots loaded bombers when the reserve allows) · the SLACK RULE
// (every wave re-solved with ONE FEWER interceptor in EVERY battery) ·
// determinism.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { makeGame, step, stateHash, CFG, W, SEAT_OF_CITY } from '../src/games/MissileBattle/sim.js'
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

// -------------------------------------------------------------------- bomber hunt ----
section('BOMBER HUNT (#2306) — deny the delivery, not just the fall')
{
    // A bomber must fly at the altitude ITS SCRIPT declares: the audit reads
    // spec.y, the sim once hardcoded y:-4 for every kind, and the lie shipped
    // as invisible, unhittable aircraft while the gate printed 14/14 legal.
    const specB = WAVES[1].entries.find((e) => e.kind === 'bomber')
    const gA = toPlay(makeGame(1))
    let cruised = null
    for (let t = 0; t < 2000 && !cruised; t++) {
        step(gA, {})
        cruised = gA.enemies.find((e) => e.kind === 'bomber') || null
    }
    ok(!!cruised, 'no bomber ever appeared in SATURATION')
    ok(!!cruised && cruised.y === specB.y, `bomber cruises at y=${cruised?.y}, the script declares ${specB.y}`)
    ok(!!cruised && cruised.y > CFG.aimMinY && cruised.y < CFG.killLine, 'the cruising bomber sits outside the aim band — an invulnerable target shipped again')

    // the altitude guard refuses a nonsense script — the audit is no longer the
    // only witness (NaN at the spawn would poison the whole drop line)
    {
        const gB = toPlay(makeGame(0))
        gB.queue.push({ t: gB.playT + 1, kind: 'bomber', y: NaN, x0: 40, vx: 0.4, drops: [] })
        let threw = false
        try { for (let t = 0; t < 5 && !threw; t++) step(gB, {}) } catch { threw = true }
        ok(threw, 'a bomber spec with a NaN altitude entered the world instead of throwing')
    }

    // The doctrine's fat shot: quiet sky, a loaded bomber in the arc, THREE
    // rounds per tube — below the old `ammo >= 7` surplus gate that almost
    // never held. The autopilot must still take the kill, and take it BEFORE
    // the bomber's first delivery.
    {
        const g = toPlay(makeGame(0))
        g.queue.length = 0; g.enemies.length = 0; g.blasts.length = 0; g.intc.length = 0
        g.bases.forEach((b) => { b.ammo = 3 })
        g.enemies.push({ id: g.nextId++, kind: 'bomber', x: 40, px: 40, y: 42, vx: 0.4, vy: 0, ti: -1, t: 0, alive: true, split: null, amp: 0,
            drops: [{ t: 200, ti: 1, done: false }, { t: 300, ti: 2, done: false }], spawnAt: g.playT, score: CFG.score.bomber })
        const held = new Map()
        let killed = null, dropSeen = false, fired = false
        for (let t = 0; t < 400 && !killed; t++) {
            const inp = decide(g, held)
            if (inp.fire) fired = true
            step(g, inp)
            for (const ev of g.events) {
                if (ev.type === 'kill' && ev.kind === 'bomber') killed = ev
                if (ev.type === 'drop') dropSeen = true
            }
        }
        ok(fired, 'loaded bomber, quiet sky, 3 rounds per tube — a surplus gate is back and the autopilot refused the free kill')
        ok(!!killed, 'the hunted bomber survived a quiet sky — the doctrine does not actually shoot bombers')
        ok(!dropSeen, 'the bomber delivered before it died — a late hunt is not a denial')
    }

    // The reserve is REAL, not decoration: one tube left and one unanswered
    // warhead means that tube belongs to the warhead, never to a fancy kill.
    {
        const g = toPlay(makeGame(0))
        g.queue.length = 0; g.enemies.length = 0; g.blasts.length = 0; g.intc.length = 0
        g.bases[0].ammo = 1; g.bases[1].ammo = 0; g.bases[2].ammo = 0
        g.enemies.push({ id: g.nextId++, kind: 'icbm', x: 240, px: 240, y: 20, vx: 0, vy: 1, ti: -1, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: g.playT, score: CFG.score.icbm })
        g.enemies.push({ id: g.nextId++, kind: 'bomber', x: 40, px: 40, y: 42, vx: 0.4, vy: 0, ti: -1, t: 0, alive: true, split: null, amp: 0,
            drops: [{ t: 200, ti: 1, done: false }], spawnAt: g.playT, score: CFG.score.bomber })
        const held = new Map()
        let bomberKill = false, shots = 0
        for (let t = 0; t < 150; t++) {
            const inp = decide(g, held)
            if (inp.fire) shots++
            step(g, inp)
            for (const ev of g.events) if (ev.type === 'kill' && ev.kind === 'bomber') bomberKill = true
        }
        ok(!bomberKill && shots === 0, `the autopilot spent the held-back tube on the bomber (${shots} shots, kill=${bomberKill}) — the reserve does not hold`)
    }

    // Across the whole game: the autopilot BAGS bombers and whole deliveries
    // never happen. (Before #2306 this run scored 60 fired, zero bomber kills,
    // every scripted drop delivered or escaped-with.)
    {
        const g = makeGame(0)
        const held = new Map()
        let bk = 0, drops = 0, lost = 0
        for (let t = 0; t < 40000 && !g.end; t++) {
            const inp = decide(g, held)
            step(g, inp)
            for (const ev of g.events) {
                if (ev.type === 'kill' && ev.kind === 'bomber') bk++
                if (ev.type === 'drop') drops++
                if (ev.type === 'cityHit') lost++
            }
        }
        const scriptedDrops = WAVES.reduce((n, w) => n + w.entries.filter((e) => e.kind === 'bomber').reduce((m, e) => m + e.drops.length, 0), 0)
        ok(g.end === 'win' && lost === 0, `bombing doctrine made the game unwinnable or messy (end=${g.end}, lost=${lost})`)
        ok(bk >= 2, `only ${bk} bombers bagged across three barrages — the autopilot still avoids them on purpose`)
        ok(scriptedDrops - drops >= 4, `${drops}/${scriptedDrops} scripted drops happened — hunting denies barely any deliveries`)
        console.log(`  ..    ${bk} bombers bagged, ${scriptedDrops - drops}/${scriptedDrops} scripted drops denied before delivery`)
    }
}

// --------------------------------------------------------------------- jink ----
section('JINK (#2375) — the smart bomb makes you earn the kill')
{
    const mkSmart = (g, x, y, vx, amp) => {
        const e = { id: g.nextId++, kind: 'smart', x, px: x, y, vx, vy: 0.5, ti: -1, t: 0,
            alive: true, split: null, amp, drops: null, spawnAt: g.playT, score: CFG.score.smart }
        g.enemies.push(e)
        return e
    }
    const quietSky = (w = 0) => {
        const g = toPlay(makeGame(w))
        g.queue.length = 0; g.enemies.length = 0; g.blasts.length = 0; g.intc.length = 0
        return g
    }
    // a missile whose blast point is a bomb's EXACT predicted position at tau —
    // the same prediction law the planner uses, so what follows is the honest
    // autopilot encounter: feint, dodge, miss.
    const aimAt = (g, e, tau) => {
        const tx = e.px + e.vx * tau + Math.sin((e.t + tau) * 0.07) * e.amp
        const ty = e.y + e.vy * tau
        g.intc.push({ id: g.nextId++, x: 128, y: 200, tx, ty, vx: (tx - 128) / tau, vy: (ty - 200) / tau, eta: tau, t: 0, bat: 1 })
        return { tx, ty }
    }
    const oneEncounter = () => {
        const g = quietSky()
        const e = mkSmart(g, 200, 60, -0.3, 12)
        const { tx } = aimAt(g, e, 72)
        const seen = []
        let jinked = false, xAtBlast = null
        for (let t = 0; t < 110 && e.alive; t++) {
            step(g, {})
            for (const ev of g.events) {
                if (ev.type === 'jink') { jinked = true; seen.push(ev.dir) }
                if (ev.type === 'boom') xAtBlast = e.x
            }
        }
        return { g, e, tx, jinked, seen, xAtBlast }
    }

    // 1. no sky threat — no jink. The weave stays pure sine.
    {
        const g = quietSky()
        mkSmart(g, 200, 60, -0.3, 12)
        let jinks = 0
        for (let t = 0; t < 120; t++) { step(g, {}); for (const ev of g.events) if (ev.type === 'jink') jinks++ }
        ok(jinks === 0, `a smart bomb jinked ${jinks} times with NOTHING in the sky — the dodge is not threat-gated`)
    }

    // 2. a far-target missile is not a threat: blast point 60px away, no jink.
    {
        const g = quietSky()
        const e = mkSmart(g, 200, 60, -0.3, 12)
        g.intc.push({ id: g.nextId++, x: 128, y: 200, tx: 80, ty: 140, vx: (80 - 128) / 72, vy: (140 - 200) / 72, eta: 72, t: 0, bat: 1 })
        let jinks = 0
        for (let t = 0; t < 110 && e.alive; t++) { step(g, {}); for (const ev of g.events) if (ev.type === 'jink') jinks++ }
        ok(jinks === 0, `a bomb dodged a missile aimed ${60}px away — everything would dodge if far shots read as threats`)
    }

    // 3. THE ESCAPE: the first interceptor arrives at the predicted point and
    //    the bomb is gone — jink event fired, displacement AWAY from the blast
    //    point, survival by more than the blast radius.
    {
        const { e, tx, jinked, seen, xAtBlast } = oneEncounter()
        ok(jinked, 'a blast aimed at the smart bomb\'s exact predicted position was never dodged — the jink does not fire')
        ok(seen.length >= 1 && seen[0] === (tx <= 200 ? 1 : -1), `the jink went TOWARD the blast (dir ${seen[0]}, blast tx ${tx.toFixed(0)}) — an escape must run away from the detonation`)
        ok(e.alive, 'the smart bomb rode the first interceptor — nothing was earned')
        ok(xAtBlast !== null && Math.abs(xAtBlast - tx) > CFG.blastR, `it survived INSIDE the blast reach (${xAtBlast === null ? '?' : (xAtBlast - tx).toFixed(1)}px vs r ${CFG.blastR}) — a survival outside the physics is not a dodge`)
    }

    // 4. THE FOLLOW-UP: one committed escape per bomb. The second round,
    //    aimed where the first taught the shooter, kills with no second jink.
    {
        const { g, e, tx, seen } = oneEncounter()
        ok(e.alive, 'harness: the escape scenario must end with the bomb alive')
        aimAt(g, e, 72) // fire the follow-up at the NEW predicted position
        let jinks = 0
        for (let t = 0; t < 110 && e.alive; t++) { step(g, {}); for (const ev of g.events) if (ev.type === 'jink') jinks++ }
        ok(jinks === 0, `the spent bomb jinked ${jinks} more times — the budget is one committed escape, not an evasive god`)
        ok(!e.alive, 'the second round at the escape point missed too — the cooldown/budget doctrine does not converge; the kill cannot be earned')
    }

    // 5. across the proven run the dodge actually shapes the fight. #2379
    //    veterans (`jinks: 2` in the scripts) hold a second escape, so the
    //    ceiling is the summed budget, not the bomb count.
    {
        const gj = makeGame(0)
        const held = new Map()
        let jinks = 0
        const budget = WAVES.reduce((n, w) => n + w.entries.filter((x) => x.kind === 'smart')
            .reduce((m, x) => m + (x.jinks ?? CFG.dodge.budget), 0), 0)
        const smartCount = WAVES.reduce((n, w) => n + w.entries.filter((x) => x.kind === 'smart').length, 0)
        for (let t = 0; t < 40000 && !gj.end; t++) {
            step(gj, decide(gj, held))
            for (const ev of gj.events) if (ev.type === 'jink') jinks++
        }
        ok(jinks >= 3 && jinks <= budget, `the three barrages produced ${jinks} jinks (${smartCount} smart bombs, ${budget} escapes budgeted) — the escape never joins the real fight`)
        console.log(`  ..    ${jinks}/${budget} budgeted jinks across ${smartCount} smart bombs — the autopilot spends its feint rounds and still cleans house`)
    }
}

// ------------------------------------------------- smart split & escalation (#2379) ----
section('MENAGERIE (#2379) — the yellow bomb sheds, veterans double-dodge, blasts are material')
{
    const quietSky = (w = 0) => {
        const g = toPlay(makeGame(w))
        g.queue.length = 0; g.enemies.length = 0; g.blasts.length = 0; g.intc.length = 0
        return g
    }
    const mkSmart = (g, x, y, opts = {}) => {
        const e = { id: g.nextId++, kind: 'smart', x, px: x, y, vx: opts.vx ?? -0.3, vy: opts.vy ?? 0.5, ti: opts.ti ?? -1, t: 0,
            alive: true, split: opts.split ? { ...opts.split, done: false } : null, amp: opts.amp ?? 12, drops: null,
            jinks: opts.jinks ?? null, spawnAt: g.playT, score: CFG.score.smart }
        g.enemies.push(e)
        return e
    }
    const fireAt = (g, e, tau) => {
        const tx = e.px + e.vx * tau + Math.sin((e.t + tau) * 0.07) * e.amp
        const ty = e.y + e.vy * tau
        g.intc.push({ id: g.nextId++, x: 128, y: 200, tx, ty, vx: (tx - 128) / tau, vy: (ty - 200) / tau, eta: tau, t: 0, bat: 1 })
        return { tx, ty }
    }

    // 1. the SCRIPT carries the bestiary: the arcade's yellow bomb both weaves
    //    AND sheds — most GRAND BARRAGE smarts split near the deck.
    {
        let shed = 0, vets = 0
        WAVES.forEach((w, wi) => w.entries.forEach((en) => {
            if (en.kind !== 'smart') return
            if (en.split) {
                shed++
                ok(en.split.n >= 2 && en.split.n <= 3, `w${wi}: smart split n=${en.split.n}`)
                ok(en.split.y > 100 && en.split.y < CFG.killLine - 10, `w${wi}: smart sheds at y=${en.split.y} — the arcade sheds near the deck, not at the top`)
            }
            if ((en.jinks ?? 1) > 1) vets++
        }))
        ok(shed >= 3, `only ${shed} smart bombs shed MIRVs — the full menagerie is one silhouette and ours still stays singular`)
        ok(shed < WAVES.reduce((n, w) => n + w.entries.filter((e) => e.kind === 'smart').length, 0), 'every smart splits — the shed must be a promotion, not the default')
        ok(vets >= 1, 'no veteran smart (jinks: 2) — the late-wave escalation has no flagship')
    }

    // 2. the SPLIT LAW: the shed happens at the scripted altitude, the children
    //    converge on the PARENT's city and get answer time.
    {
        const g = quietSky()
        const e = mkSmart(g, 110, 100, { ti: 2, amp: 0, vy: 0.5, vx: 0.05, split: { y: 114, n: 2, spd: 150 } })
        let splitEv = null
        for (let t = 0; t < 40 && !splitEv; t++) { step(g, {}); splitEv = g.events.find((ev) => ev.type === 'split') || null }
        ok(!!splitEv, 'a smart bomb with a split spec crossed its altitude and never shed')
        const kids = g.enemies.filter((q) => q.kind === 'icbm' && q.y >= 110)
        ok(kids.length === 2, `the shed produced ${kids.length} children (want 2)`)
        ok(kids.every((k) => k.ti === 2), 'the shed children abandoned the parent\'s target city')
        ok(kids.every((k) => (CFG.groundY - k.y) / k.vy > 60), 'the shed children land with under 60 ticks of answer time — an unhittable MIRV is a broken rule, not difficulty')
        ok(!e.alive, 'the parent survived its own shed')
    }

    // 3. NO EARLY SHED: above the altitude the bomb is still whole.
    {
        const g = quietSky()
        mkSmart(g, 110, 60, { ti: 2, amp: 0, split: { y: 114, n: 2, spd: 150 } })
        let tooEarly = false
        for (let t = 0; t < 20; t++) { step(g, {}); if (g.events.some((ev) => ev.type === 'split')) tooEarly = true }
        ok(!tooEarly, 'the shed fired above its altitude — the mirror of the #2306 altitude lie')
    }

    // 4. THE TELL + ESCALATION: a baseline bomb (wave 2) escapes once, flashes
    //    `spent`, and the third round of any later engagement is dead-cheap.
    //    A veteran (wave 3, jinks: 2) signs for TWO escapes before the same tell.
    const escapeRound = (g, e) => {
        fireAt(g, e, 72)
        let jink = false
        for (let t = 0; t < 110 && e.alive; t++) { step(g, {}); for (const ev of g.events) if (ev.type === 'jink') jink = true }
        return jink
    }
    {
        const run = (wave, jinks) => {
            const g = quietSky(wave)
            const e = mkSmart(g, 200, 60, { amp: 12, jinks: jinks > 1 ? jinks : null })
            const js = []
            let spent = 0
            for (let r = 0; r < 4 && e.alive; r++) {
                fireAt(g, e, 72)
                for (let t = 0; t < 110 && e.alive; t++) {
                    step(g, {})
                    for (const ev of g.events) { if (ev.type === 'jink') js.push(ev.dir); if (ev.type === 'spent') spent++ }
                }
            }
            return { alive: e.alive, js, spent }
        }
        const base = run(1, 1)
        ok(base.js.length === 1 && base.spent === 1 && !base.alive, `baseline smart (wave 2): ${base.js.length} jinks, ${base.spent} spent, alive=${base.alive} (want 1 / 1 / dead)`)
        const esc = run(2, 2)
        ok(esc.js.length === 2 && esc.spent === 1 && !esc.alive, `veteran smart (wave 3): ${esc.js.length} jinks, ${esc.spent} spent, alive=${esc.alive} (want 2 / 1 / dead)`)
        ok(esc.js[0] === base.js[0], 'the veteran escaped in the opposite direction from the same sky — the escape is not the same geometry law')
    }

    // 5. ESCALATION IS VISIBLE: the wave-3 jink moves FURTHER per escape than
    //    the wave-2 one (that longer streak is the tell of the faster commit).
    {
        const drift = (wave) => {
            const g = quietSky(wave)
            const e = mkSmart(g, 200, 60, { amp: 12 })
            fireAt(g, e, 72)
            for (let t = 0; t < 110 && e.alive && !(e.dodgeT > 0); t++) step(g, {})
            const x0 = e.px
            for (let t = 0; t < 110 && e.alive && e.dodgeT > 0; t++) step(g, {})
            return Math.abs(e.px - x0)
        }
        const d1 = drift(1), d2 = drift(2)
        ok(d2 > d1, `wave-3 escape moved ${d2.toFixed(1)}px vs wave-2 ${d1.toFixed(1)}px — the escalation must be a BIGGER commitment, not the same one`)
        console.log(`  ..    escape drift wave2 ${d1.toFixed(1)}px -> wave3 ${d2.toFixed(1)}px`)
    }

    // 6. BLAST MATERIALS: every blast names what it burned through, so the
    //    renderer cannot collapse them back into one orange memory.
    {
        const g = quietSky()
        step(g, { aimTo: [100, 60], fire: true })
        let iv = false
        for (let t = 0; t < 120 && !iv; t++) { step(g, {}); iv = g.blasts.some((b) => b.src === 'iv') }
        ok(iv, 'an interceptor blast carries no material tag')
        const gc = quietSky()
        gc.enemies.push({ id: 901, kind: 'icbm', x: 54, px: 54, y: 180, vx: 0, vy: 1, ti: 0, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 0, score: 25 })
        let city = false
        for (let t = 0; t < 30 && !city; t++) { step(gc, {}); city = gc.blasts.some((b) => b.src === 'city') }
        ok(city, 'a city plume is tagged like a rubble puff — ART.md asked for material variety')
        const gb = quietSky()
        gb.enemies.push({ id: 902, kind: 'icbm', x: 128, px: 128, y: 180, vx: 0, vy: 1, ti: 7, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 0, score: 25 })
        let base = false
        for (let t = 0; t < 30 && !base; t++) { step(gb, {}); base = gb.blasts.some((b) => b.src === 'base') }
        ok(base, 'a battery spark is not tagged as one')
        const gd = quietSky()
        gd.enemies.push({ id: 903, kind: 'icbm', x: 30, px: 30, y: 180, vx: 0, vy: 1, ti: -1, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 0, score: 25 })
        let dud = false
        for (let t = 0; t < 30 && !dud; t++) { step(gd, {}); dud = gd.blasts.some((b) => b.src === 'dud') }
        ok(dud, 'a dud ground puff is not tagged as one')
        const gch = toPlay(makeGame(0))
        gch.enemies.push({ id: 904, kind: 'icbm', x: 112, px: 112, y: 60, vx: 0, vy: 0, ti: -1, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 0, score: 25 })
        gch.enemies.push({ id: 905, kind: 'icbm', x: 120, px: 120, y: 60, vx: 0, vy: 0, ti: -1, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 0, score: 25 })
        gch.blasts.push({ x: 100, y: 60, r: 11, rMax: 13, age: 1, state: 'grow', chain: false, src: 'iv' })
        let chainTag = false
        for (let t = 0; t < 40 && !chainTag; t++) { step(gch, {}); chainTag = gch.blasts.some((b) => b.chain && b.src === 'chain') }
        ok(chainTag, 'the chain pop has no material tag of its own')
    }
}

// ------------------------------------------------ ALTERNATING BATTERIES (#2473) ----
section('ALTERNATING BATTERIES (#2473) — sectors, seats, rescue, ledgers')
{
    // 1. seats alternate by wave, and every named entry of a duo wave falls
    //    inside the defender's sector, spawning from the defender's side
    const SECTOR_TI = { 1: [0, 1, 2, 6, 7], 2: [3, 4, 5, 7, 8] }
    for (let w = 0; w < 3; w++) {
        const g = makeGame(w, { twoP: true })
        const seat = (w % 2) + 1
        ok(g.seat === seat, `duo wave ${w}: seat is ${g.seat}, the alternation law wants ${seat}`)
        for (const e of g.queue) {
            if (e.ti >= 0) ok(SECTOR_TI[seat].includes(e.ti), `wave ${w} seat ${seat}: an entry targets ti ${e.ti} — off-sector`)
            ok(seat === 1 ? e.x0 <= W / 2 : e.x0 >= W / 2, `wave ${w} seat ${seat}: spawn column ${e.x0} crosses the border`)
            if (e.drops) for (const d of e.drops) ok(d.ti < 0 || SECTOR_TI[seat].includes(d.ti), `wave ${w} seat ${seat}: a bomber drop targets ${d.ti} — off-sector`)
        }
    }
    // solo's queue is untouched by the retarget — same ti, same columns
    {
        const g = makeGame(0)
        ok(g.queue.every((e, i) => e.ti === WAVES[0].entries[i].ti && e.x0 === WAVES[0].entries[i].x0), 'the solo queue was retargeted')
        ok(g.seat === 0, 'solo seats exist')
    }

    // 2. the fire gate: deep in the partner's half is refused in the sector's
    //    own voice; the shared reserve fires for either defender
    const gateShot = (seat, x) => {
        const g = makeGame(seat === 1 ? 0 : 1, { twoP: true })
        g.phase = 'play'; g.playT = 1; g.queue = []; g.enemies = []
        step(g, { aimTo: [x, 60], fire: true })
        return { ev: g.events.find((e) => e.type === 'ifire' || e.type === 'denySeat' || e.type === 'deny'), intc: g.intc.length }
    }
    {
        const r1 = gateShot(1, 250)
        ok(r1.ev?.type === 'denySeat' && r1.intc === 0, 'player one fired deep over the east sector line')
        const r2 = gateShot(2, 250)
        ok(r2.ev?.type === 'ifire' && r2.ev.bat === 2, 'player two could not fire inside their own sector')
        const r3 = gateShot(1, 200)
        ok(r3.ev?.type === 'ifire' && r3.ev.bat === 1, 'the shared reserve ignored the defender')
        const r4 = gateShot(2, 20)
        ok(r4.ev?.type === 'denySeat' && r4.intc === 0, 'player two fired deep over the west sector line')
        const sg = makeGame(0); sg.phase = 'play'; sg.playT = 1; sg.queue = []
        step(sg, { aimTo: [250, 60], fire: true })
        ok(sg.intc.length === 1, 'solo fire touched the sector gate')
    }

    // 3. fallen sector + rescue: seats are eliminated only when their own
    //    three cities go dark; the survivor mans the tubes; both dark = war
    {
        const g = makeGame(0, { twoP: true })
        g.phase = 'play'; g.playT = 1; g.queue = []; g.enemies = []
        g.cities[0].alive = false; g.cities[1].alive = false
        g.enemies.push({ id: 901, kind: 'icbm', x: 110, px: 110, y: 191, vx: 0, vy: 1, ti: 2, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 1, score: 25 })
        step(g, {})
        ok(g.out[0] === true && g.events.some((e) => e.type === 'seatOut'), 'the west sector lost all three cities without the seatOut receipt')
        ok(g.end === null, 'one sector falling dark ended the war')
        const s = makeGame(1, { twoP: true })
        s.out = [true, false]; s.seat = 2; s.phase = 'play'; s.playT = 1; s.queue = []
        step(s, { aimTo: [20, 60], fire: true })
        ok(s.intc.length === 1 && s.intc[0].bat === 0, 'the survivor did not man the fallen sector\'s battery')
        // take the survivor's other two cities, then let the third fall: the
        // impact is what must darken the map, not a bookkeeping pass
        s.cities[4].alive = false; s.cities[5].alive = false
        s.enemies.push({ id: 902, kind: 'icbm', x: 146, px: 146, y: 191, vx: 0, vy: 1, ti: 3, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: 1, score: 25 })
        let dark = null
        for (let t = 0; t < 30 && !dark; t++) { step(s, {}); dark = s.events.find((e) => e.type === 'lose') }
        ok(!!dark && s.end === 'lose', 'both sectors went dark and the map stayed lit')
    }

    // 4. an eliminated seat never takes the sky again — its turn passes
    {
        const g = makeGame(0, { twoP: true })
        g.out = [true, false]
        g.phase = 'clear'; g.pT = 1; step(g, {}); step(g, {})
        ok(g.wave === 1 && g.seat === 2, `an eliminated seat returned to the board (wave ${g.wave} seats ${g.seat})`)
    }

    // 5. the proven duo run: the autopilot holding BOTH seats, both sectors
    //    spotless, and the two columns summing to the total exactly
    const duoR = plan(makeGame(0, { twoP: true }))
    ok(duoR.ok && duoR.receipts.end === 'win', `the duo autopilot did not win: ${duoR.receipts.end}`)
    for (const w of duoR.receipts.perWave) ok(w.lost === 0, `duo autopilot lost ${w.lost} cities on wave ${w.wave} — a sector fell`)
    const duoG = makeGame(0, { twoP: true })
    {
        const held = new Map()
        for (let t = 0; t < 40000 && !duoG.end; t++) step(duoG, decide(duoG, held))
        ok(duoG.end === 'win', `ledger run ended ${duoG.end}`)
        ok(duoG.pscore[0] + duoG.pscore[1] === duoG.score, `ledgers ${duoG.pscore.join('+')} do not sum to ${duoG.score}`)
        ok(duoG.pscore[0] > 0 && duoG.pscore[1] > 0, 'one seat carried the board alone — the wave-credit split is broken')
        ok(stateHash(duoG).includes(`|D${duoG.seat}`), 'the stateHash ignores the duo ledger')
        ok(!stateHash(makeGame(0)).includes('|D'), 'the solo hash carries a duo segment')
    }
    console.log(`  ..    duo autopilot: ${duoR.receipts.fired} fired, ${duoR.receipts.kills} kills, ledgers ${duoG.pscore.join(' / ')}`)
}

// ---------------------------------------------------------------- deny voice ----
// #2483 item 4: the seat refusal is the alternating law's voice. It must be
// the house two-tone (high ask, low no — the captain's idiom), the crossed
// sector band must strobe red at the denial, and the flash must decay. The
// shell is browser-only, so this arm pins the source the browser will run.
section('DENY VOICE (#2483) — two-tone refusal, red band, solo untouched')
{
    const jsx = readFileSync(join(HERE, '../src/games/MissileBattle/index.jsx'), 'utf8')
    const b0 = jsx.indexOf("e.type === 'denySeat'")
    const b1 = jsx.indexOf("e.type === 'seatOut'", b0)
    ok(b0 > 0 && b1 > b0, 'the denySeat branch was removed from the shell')
    const branch = jsx.slice(b0, b1)
    const tones = (branch.match(/audioController\.playTone\(/g) || []).length
    ok(tones === 2, `the sector refusal is ${tones === 1 ? 'back to one flat buzz' : `voiced with ${tones} tones`} — the law wants the two-tone (high ask, low no)`)
    ok(!/playTone\(\s*110\b/.test(branch), 'the old flat 110 Hz deny buzz is back')
    ok(/denyFlash\s*=\s*\d+/.test(branch) && /denyBand\s*=\s*e\.x\s*<\s*W\s*\/\s*2\s*\?\s*0\s*:\s*1/.test(branch),
        'the denial no longer arms the crossed-band flash keyed to the target side')
    ok(/denyFlash\s*>\s*0/.test(jsx) && /rgba\(255,\s*64,\s*64/.test(jsx) && /denyBand\s*===\s*0/.test(jsx),
        'the red sector-band strobe was deleted from the map paint')
    ok(/if\s*\(denyFlash\s*>\s*0\)\s*denyFlash--/.test(jsx), 'the refusal flash never decays — it would stain the band red forever')
    // solo keeps its exact old voice — only duo gained the chirp
    const d0 = jsx.indexOf("e.type === 'deny'")
    const solo = jsx.slice(d0, jsx.indexOf('else if', d0 + 10))
    ok(/playTone\(\s*90\b/.test(solo) && (solo.match(/audioController\.playTone\(/g) || []).length === 1,
        'the solo DENY voice changed — item 4 is duo-only')
    // the band the renderer paints is keyed to the EVENT x — prove denied
    // shots really land deep in the partner's band, not near the line
    {
        const g = makeGame(0, { twoP: true })
        g.phase = 'play'; g.playT = 1; g.queue = []; g.enemies = []
        step(g, { aimTo: [250, 60], fire: true })
        const e1 = g.events.find((e) => e.type === 'denySeat')
        const h = makeGame(1, { twoP: true })
        h.phase = 'play'; h.playT = 1; h.queue = []; h.enemies = []
        step(h, { aimTo: [20, 60], fire: true })
        const e2 = h.events.find((e) => e.type === 'denySeat')
        ok(e1 && e1.x > W / 2, 'a west-seat denial does not stamp an east-side x — the flash would paint the wrong band')
        ok(e2 && e2.x < W / 2, 'an east-seat denial does not stamp a west-side x — the flash would paint the wrong band')
    }
}

// ------------------------------------------------ visible labour & ceremony (#2510) ----
// The duo law teaches itself on screen: the machine signs its shift, the turn
// flip ceremonies the seat, the rescue re-lights the taken tubes, and the
// arcade keeps a city column per seat. The shell is browser-only, so this arm
// pins the sim data the naming reads AND the renderer idioms it runs — the
// deny-voice pattern (#2483).
section('#2510 DUO CEREMONY — seat stamps, seat card, AUTONOMOUS tag, rescue re-light, city columns')
{
    // 1. every interceptor stamps WHOSE sky it defended — the trail hue and
    //    the AUTONOMOUS tag read it. Solo stamps 0, and the stamp must not
    //    move the hash one jot (solo replay parity, #2473 law).
    {
        const g = makeGame(0, { twoP: true })
        g.phase = 'play'; g.playT = 1; g.queue = []; g.enemies = []
        step(g, { aimTo: [80, 60], fire: true })
        ok(g.intc.length > 0 && g.intc[g.intc.length - 1].seat === 1, 'a west-seat shot carries no seat stamp — the autopilot hue and the tag name nobody')
        const h = makeGame(1, { twoP: true })
        h.phase = 'play'; h.playT = 1; h.queue = []; h.enemies = []
        step(h, { aimTo: [180, 60], fire: true })
        ok(h.intc.length > 0 && h.intc[h.intc.length - 1].seat === 2, 'an east-seat shot carries no seat stamp')
        const s = makeGame(0)
        s.phase = 'play'; s.playT = 1; s.queue = []; s.enemies = []
        step(s, { aimTo: [128, 60], fire: true })
        ok(s.intc.length > 0 && s.intc[s.intc.length - 1].seat === 0, 'solo interceptors must stamp seat 0 — the duo naming must not leak into solo')
        const a = makeGame(0), b = makeGame(0)
        a.intc.push({ id: 1, x: 5, y: 6 })
        b.intc.push({ id: 1, x: 5, y: 6, seat: 2 })
        ok(stateHash(a) === stateHash(b), 'the seat stamp moved the stateHash — solo replay hashes broke')
    }
    // 2. the banner event carries the seat (the card's data source); the
    //    solo banner's event shape stays exactly as it was.
    {
        const b = makeGame(0, { twoP: true }).events.find((e) => e.type === 'banner')
        ok(b && b.seat === 1, 'the duo banner does not carry the seat — the ceremony has no name to show')
        ok(!('seat' in (makeGame(0).events.find((e) => e.type === 'banner') || {})), 'the solo banner gained a seat field — solo event shape moved')
    }
    // 3. the rescue receipt names the fallen seat — the re-light's colour key.
    {
        const g = makeGame(0, { twoP: true })
        g.phase = 'play'; g.playT = 1; g.queue = []; g.enemies = []
        // kill the other two west cities; the live one takes the missile —
        // the fall that closes the sector is the one that must name the seat.
        g.cities.forEach((c, i) => { if (SEAT_OF_CITY[i] === 1 && i !== 0) c.alive = false })
        g.enemies.push({ id: 900, kind: 'icbm', x: 40, px: 40, y: CFG.groundY - 4, vx: 0, vy: 1, ti: 0, t: 0, alive: true, split: null, amp: 0, drops: null, spawnAt: g.playT, score: CFG.score.icbm })
        for (let t = 0; t < 12 && !g.events.some((e) => e.type === 'seatOut'); t++) step(g, {})
        const so = g.events.find((e) => e.type === 'seatOut')
        ok(so && so.seat === 1, 'seatOut does not name the fallen seat — the re-light pulses for nobody')
    }
    // 4-7. renderer idioms the browser runs (deny-voice style):
    const jsx = readFileSync(join(HERE, '../src/games/MissileBattle/index.jsx'), 'utf8')
    // the seat card ceremonies the turn flip on the banner's first beat, and
    // the toast no longer duplicates the seat word.
    ok(/CFG\.bannerLen\s*-\s*90/.test(jsx) && /PLAYER \$\{gs\.seat === 1 \? 'ONE' : 'TWO'\}/.test(jsx),
        'the seat card was deleted — the arcade turn flip is back to a bare toast')
    ok(!/WAVE \$\{e\.wave \+ 1\} · PLAYER/.test(jsx), 'the banner toast spells the seat again — the card ceremonies it now')
    // the machine signs its shift, in its own hue; its shots fly that hue too.
    ok(/AUTONOMOUS/.test(jsx) && /gs\.cpu\[gs\.seat - 1\]/.test(jsx) && /SEAT_RGB\[gs\.seat\]/.test(jsx),
        'the AUTONOMOUS tag is gone — the autopilot is invisible labour again')
    ok(/SEAT_RGB\[m\.seat\]/.test(jsx), 'autopilot interceptors lost their trail hue — machine shots look human again')
    // the rescue: a moment (rings + sparks in the survivor hue) AND a record
    // (fallen tubes keep the survivor colour for the rest of the war).
    ok(/relight\s*=\s*\d+/.test(jsx) && /SEAT_RGB\[surv\]/.test(jsx) && /relight\s*>\s*0/.test(jsx),
        'the rescue re-light beat was deleted — a sector falling is undersold again')
    ok(/own === 1 \? 2 : 1/.test(jsx), 'the taken tubes no longer keep the survivor colour — the handover is invisible after the moment')
    // arcade sidewalls: a city column per seat, dimming as cities die.
    ok(/wx\s*=\s*s === 1 \? 3 : W - 5/.test(jsx) && /SEAT_OF_CITY\[i2\] === s/.test(jsx),
        'the per-player city columns were deleted — ownership needs the HUD again')
    // duo-only law: none of this paints for a solo player.
    ok(/twoP && gs\.phase === 'banner'/.test(jsx) || /gs\.twoP && gs\.phase === 'banner'/.test(jsx),
        'the seat card lost its twoP gate — solo would gain a PLAYER ONE ceremony')
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
    // #2473: the duo mirror — the sector budget follows the knob, and both
    // sectors must still come through spotless one round lighter everywhere
    for (let w = 0; w < WAVES.length; w++) {
        CFG.ammoWave = honest - 1
        const r = plan(makeGame(w, { twoP: true }))
        CFG.ammoWave = honest
        ok(r.ok && r.receipts.citiesLost === 0, `duo wave ${w} @ ${honest - 1}/battery: ${r.ok ? `survived DIRTY (lost ${r.receipts.citiesLost})` : 'LOSES'} — a sector fell with slack on the tubes`)
        console.log(`  ..    duo wave ${w} @ ${honest - 1}/battery: ${r.ok && r.receipts.citiesLost === 0 ? 'BOTH SECTORS HELD' : 'FAILED'}`)
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

    // #2473 duo determinism: the mirrored barrage, the alternating seats and
    // the ledger all replay to the identical hashes and verdicts
    const runDuo = () => {
        const g = makeGame(0, { twoP: true })
        const held = new Map()
        const hs = []
        for (let t = 0; t < 30000 && !g.end; t++) {
            step(g, decide(g, held))
            if (t % 1000 === 0) hs.push(stateHash(g))
        }
        return { hs, end: g.end, score: g.score, ps: g.pscore.join('/') }
    }
    const da = runDuo(), db = runDuo()
    ok(JSON.stringify(da) === JSON.stringify(db), 'two identical duo runs diverged')
    ok(da.end === 'win', `the duo determinism run ended ${da.end} (want win)`)
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
    // 7. jink switches (#2375): each must go red through its own pin.
    {
        const escape = () => {
            const g = toPlay(makeGame(0))
            g.queue.length = 0; g.enemies.length = 0; g.blasts.length = 0; g.intc.length = 0
            const e = { id: g.nextId++, kind: 'smart', x: 200, px: 200, y: 60, vx: -0.3, vy: 0.5, ti: -1, t: 0,
                alive: true, split: null, amp: 12, drops: null, spawnAt: g.playT, score: CFG.score.smart }
            g.enemies.push(e)
            const tau = 72
            const tx = e.px + e.vx * tau + Math.sin((e.t + tau) * 0.07) * e.amp
            const ty = e.y + e.vy * tau
            g.intc.push({ id: g.nextId++, x: 128, y: 200, tx, ty, vx: (tx - 128) / tau, vy: (ty - 200) / tau, eta: tau, t: 0, bat: 1 })
            let jinked = false
            for (let t = 0; t < 110 && e.alive; t++) {
                step(g, {})
                for (const ev of g.events) if (ev.type === 'jink') jinked = true
            }
            return jinked && e.alive
        }
        tryMut('dodgeOn true -> false (no jink at all)', { dodge: { ...CFG.dodge }, dodgeOn: false }, escape)
        tryMut('jink budget 1 -> 0 (never commits)', { dodge: { ...CFG.dodge, budget: 0 } }, escape)
        tryMut('jink ticks 14 -> 0 (event fires, px never moves)', { dodge: { ...CFG.dodge, ticks: 0 } }, escape)
    }
    // 8. escalation switches (#2379): the wave-3 commitment must have probes.
    {
        // drift of a no-spec wave-3 jink (net of fall vx): escalation is
        // v1.35 x 18 ticks = 18.9px; the wave-2 baseline nets only 9.8px
        // (v1.1 x 14). Anything <= 16 means the escalation table stopped
        // driving the wave.
        const bigDrift = () => {
            const g = toPlay(makeGame(2))
            g.queue.length = 0; g.enemies.length = 0; g.blasts.length = 0; g.intc.length = 0
            const e = { id: g.nextId++, kind: 'smart', x: 200, px: 200, y: 60, vx: -0.3, vy: 0.5, ti: -1, t: 0,
                alive: true, split: null, amp: 12, drops: null, spawnAt: g.playT, score: CFG.score.smart }
            g.enemies.push(e)
            const tau = 72
            const tx = e.px + e.vx * tau + Math.sin((e.t + tau) * 0.07) * e.amp
            const ty = e.y + e.vy * tau
            g.intc.push({ id: g.nextId++, x: 128, y: 200, tx, ty, vx: (tx - 128) / tau, vy: (ty - 200) / tau, eta: tau, t: 0, bat: 1 })
            for (let t = 0; t < 110 && e.alive && !(e.dodgeT > 0); t++) step(g, {})
            const x0 = e.px
            for (let t = 0; t < 110 && e.alive && e.dodgeT > 0; t++) step(g, {})
            return Math.abs(e.px - x0) > 16   // escalation nets 18.9px; baseline nets 9.8 (v1.1, 14 ticks)
        }
        tryMut('dodgeEsc null (wave 3 stops escalating)', { dodgeEsc: null }, bigDrift)
        tryMut('dodgeEsc ticks 18 -> 14 (escalation invisible)', { dodgeEsc: { ...CFG.dodgeEsc, ticks: 14 } }, bigDrift)
        tryMut('dodgeEsc v 1.35 -> 1.1 (same commitment as wave 2)', { dodgeEsc: { ...CFG.dodgeEsc, v: 1.1 } }, bigDrift)
    }
    // 9. #2473 seat laws: the sector gate, the retarget map and the ledger —
    //    each switch must turn its ALTERNATING pins red
    {
        const eastRefused = () => {
            const g = makeGame(0, { twoP: true }); g.phase = 'play'; g.playT = 1; g.queue = []; g.enemies = []
            step(g, { aimTo: [250, 60], fire: true })
            return g.intc.length === 0
        }
        tryMut('seatGate off (no sector line)', { seatGate: false }, eastRefused)
        const sectorLaw = () => {
            const g = makeGame(1, { twoP: true })
            return g.queue.every((e) => e.ti < 0 || [3, 4, 5, 7, 8].includes(e.ti))
        }
        tryMut('retargetOn off (waves ignore the sector map)', { retargetOn: false }, sectorLaw)
        const ledger = () => {
            const g = makeGame(0, { twoP: true })
            const held = new Map()
            for (let t = 0; t < 40000 && !g.end; t++) step(g, decide(g, held))
            return g.pscore[0] + g.pscore[1] === g.score && g.pscore[0] > 0
        }
        tryMut('ledgerOn off (kills and bonuses skip the seat columns)', { ledgerOn: false }, ledger)
    }
}

console.log(`\nmissilecheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
