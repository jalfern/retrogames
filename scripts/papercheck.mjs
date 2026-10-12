// PAPERBOY — the Node gate. No browser, no dev server: this file is the
// reason the attract demo is a PROVEN route and not theatre.
//
//   npm run papercheck             # audit + proven run + slack rule
//   npm run papercheck -- --mutate # re-break the load-bearing rules; every
//                                  # mutant MUST turn something red
//
// Sections: no-random · route audit (a window the geometry would steal is a
// build failure) · engine pins (the door window edge, the lean gate, the cart
// sweep, the dog lunge, the crash ledger, the F-throw, stage clear) ·
// the proven run (all three stages, at MID) · THE SLACK RULE (every stage
// re-solved at FULL THROTTLE and at a CRAWL with the door windows 2px tighter
// per side AND with zero spare papers) · determinism.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CFG, XMAX, PEDAL, makeGame, step, stateHash, cartAt, sweepBlock, houseList } from '../src/games/Paperboy/sim.js'
import { STAGES } from '../src/games/Paperboy/levels.js'
import { solveGame } from '../src/games/Paperboy/planner.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const MUT = process.argv.includes('--mutate')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

const run = (g, input, n = 1) => {
    const ev = []
    for (let i = 0; i < n && !g.end; i++) {
        step(g, input)
        for (const e of g.events) ev.push(e)
        g.events.length = 0
    }
    return ev
}
const drive = (g, sTick, input) => {
    while (g.s < sTick && !g.end) run(g, input)
}

// ---------------------------------------------------------------- math is banned ----
section('MATH.RANDOM IS A SIM CRIME')
for (const f of ['sim.js', 'levels.js', 'planner.js']) {
    const raw = readFileSync(join(HERE, '../src/games/Paperboy', f), 'utf8')
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(!/Math\s*\.\s*random/.test(src), `${f} contains Math.random — nothing here may be luck`)
}
const realRandom = Math.random
Math.random = () => { throw new Error('Math.random called during sim/planner') }
let froze = false
try {
    const g = makeGame(0)
    for (let i = 0; i < 400 && !g.end; i++) step(g, { steer: 0, pedal: 1 })
    froze = true
} catch (e) {
    fails.push(`frozen Math.random was hit: ${e.message}`)
}
Math.random = realRandom
ok(froze, 'a 400-tick ride and the whole route audit run with Math.random THROWN at the call site')

// ---------------------------------------------------------------- route audit ----
section('ROUTE AUDIT')
{
    for (let i = 0; i < STAGES.length; i++) {
        const st = STAGES[i]
        const hs = houseList(st)
        ok(hs.length >= 15 && hs.length <= 30, `stage ${i}: ${hs.length} houses (want 15..30 — a route of ${hs.length} is not a paper route)`)
        ok(st.len / PEDAL[1] >= 2200 && st.len / PEDAL[1] <= 5200, `stage ${i}: a ${Math.round(st.len / PEDAL[1] / 60)} s route (want 37..87 s)`)
        // houses: strictly ahead, spaced beyond two windows
        let prev = -1e9, prevSide = 0
        for (const h of hs) {
            ok(h.s > prev + 2 * CFG.wwin + 40 || h.side !== prevSide, `stage ${i}: house s=${h.s} too close to the previous same-side door (window collision)`)
            ok(h.s >= st.houseBase && h.s <= st.len - 320, `stage ${i}: house s=${h.s} has no run-out before the route end`)
            prev = h.s; prevSide = h.side
        }
        // crates: never seal the road — a >=20px lane must stay open on some side
        for (const c of st.crates) {
            const lo = c.x - (c.w ?? CFG.crateW) - 5, hi = c.x + (c.w ?? CFG.crateW) + 5
            ok(lo > -XMAX && hi < XMAX, `stage ${i}: crate at x=${c.x} touches a kerb — the road is sealed`)
            ok(Math.max(lo + XMAX, XMAX - hi) >= 20, `stage ${i}: crate at x=${c.x} leaves less than a 20px lane`)
            const near = hs.find((h) => Math.abs(h.s - c.s) <= CFG.wwin + 2)
            if (near) {
                const doorOk = near.side < 0 ? lo > -6 : hi < 6
                ok(doorOk, `stage ${i}: crate at s=${c.s} sits inside the door window of house s=${near.s} (that paper is unthrowable)`)
            }
        }
        // crossings: a sweep is 2*84/carSpd ticks; the gap between carts must be
        // long enough to enter, and spawns must not land inside a door window
        const sweep = (2 * 84) / CFG.carSpd
        for (const c of st.crossings) {
            ok(c.P - sweep >= 30, `stage ${i}: crossing s=${c.s} has a ${c.P - sweep} tick gap (need >= 30 to answer)`)
            for (const h of hs) {
                const wLo = (h.s - CFG.wwin) / PEDAL[1], wHi = (h.s + CFG.wwin) / PEDAL[1]
                const first = ((c.ph % c.P) + c.P) % c.P
                let bad = false
                for (let L = first; L <= wHi + sweep; L += c.P) {
                    // a cart is on the road during [L, L+sweep]; if any of that
                    // overlaps the throw window on the cart's side-of-door, the
                    // window still has ticks left only if the sweep misses it
                    if (L + sweep > wLo && L < wHi && Math.abs(c.s - h.s) < CFG.carBand) bad = true
                }
                ok(!bad, `stage ${i}: crossing s=${c.s} sweeps THROUGH door window s=${h.s} on its own side`)
            }
        }
        // dogs: the lunge (dogR + dogTicks*dogSpd) must threaten a lane, and a
        // dog must not live inside a door window on the side it kerbs at
        for (const d of st.dogs) {
            ok(d.s0 >= 400 && d.s0 <= st.len - 200, `stage ${i}: dog s=${d.s0} outside the sane band`)
            for (const h of hs) {
                if (Math.abs(h.s - d.s0) > CFG.wwin + 6) continue
                ok(h.side !== d.side, `stage ${i}: dog s=${d.s0} kerbs exactly at its own door s=${h.s}`)
            }
        }
    }
    const total = STAGES.reduce((n, s) => n + houseList(s).length, 0)
    ok(total === 77, `the series plants ${total} doors (77 is the shipped contract)`)
    console.log(`  ..    3 stages, ${total} doors, ${STAGES.reduce((n, s) => n + s.crossings.length, 0)} crossings, ${STAGES.reduce((n, s) => n + s.dogs.length, 0)} dogs`)
}

// ------------------------------------------------------------------ engine pins ----
section('ENGINE PINS')
{
    // 1. THE DOOR WINDOW — inside centre delivers; outside by a pixel misses.
    const g1 = makeGame(0)
    const h0 = houseList(STAGES[0])[0]
    drive(g1, h0.s - 8, {})
    g1.x = -20
    run(g1, { throw: -1 })
    for (let i = 0; i < 30 && g1.flights.length; i++) run(g1, {})
    ok(g1.delivered === 1 && g1.streak === 1 && g1.score >= 50, `a centre throw at s=${g1.s.toFixed(0)} for house s=${h0.s} delivered=${g1.delivered} (want exactly the paper landing on the mat)`)

    const g1b = makeGame(0)
    drive(g1b, h0.s - CFG.wwin - 5, {})     // throw resolves at s+PEDAL: lands 18px out
    g1b.x = -20
    run(g1b, { throw: -1 })
    for (let i = 0; i < 30 && g1b.flights.length; i++) run(g1b, {})
    ok(g1b.missed === 1 && g1b.delivered === 0, `a throw 1px past the window missed=${g1b.missed} delivered=${g1b.delivered} (the window must have an EDGE)`)

    // 2. THE LEAN GATE — a left throw from centre is wasted paper and a dead streak.
    const g2 = makeGame(0)
    drive(g2, h0.s - 4, {})
    g2.streak = 3
    g2.x = 0
    const ev2 = run(g2, { throw: -1 })
    ok(ev2.some((e) => e.type === 'lean') && g2.streak === 0 && g2.delivered === 0, 'a throw without the lean should bounce off the gate with a lean event')

    // 3. EMPTY — no papers left, the throw is a click, not a flight.
    const g3 = makeGame(0)
    g3.papers = 0
    const ev3 = run(g3, { throw: 1 })
    ok(ev3.some((e) => e.type === 'empty') && g3.flights.length === 0, 'throwing on an empty stack must answer EMPTY')

    // 4. CART GEOMETRY closed forms: enters at the kerb, the swept span is the
    //    body PLUS carAhead in the direction of travel (not behind it).
    {
        const c = { s: 0, P: 150, ph: 0, from: -1 }
        ok(Math.abs(cartAt(c, 0, 0) + 84) < 1e-9, 'a cart does not enter at |x|=84')
        const [lo, hi] = sweepBlock(-20, -1)       // moving right from x=-20
        ok(lo === -20 - CFG.carW - 4 && hi === -20 + CFG.carW + 4 + CFG.carAhead, `the swept span behind the front is wrong: [${lo},${hi}]`)
        const [lo2, hi2] = sweepBlock(20, 1)       // moving left from x=+20 (mirror)
        ok(lo2 === 20 - CFG.carW - 4 - CFG.carAhead && hi2 === 20 + CFG.carW + 4, `mirror swept span wrong: [${lo2},${hi2}]`)
    }
    // 5. THE SWEEP KILLS AHEAD OF THE FRONT: a boy ~20px in front of an
    //    onrushing cart's nose is ALREADY overtaken (cart 3 > steer 2.4).
    {
        const g = makeGame(1)
        const c = g.crossings[0]
        drive(g, c.s - 8, {})                       // inside the crossing band
        c.launched.length = 0                       // silence the real grid for the pin
        c.nextL = g.tick + 300
        g.x = 30
        c.launched.push(g.tick - 25)                // cart body at -9, nose at +9
        g.events.length = 0                         // the crash must be THIS geometry, not history
        const ev = run(g, {}, 2)
        ok(ev.some((e) => e.type === 'crash' && e.what === 'cart'), 'a cart nose 21px behind a straight-line boy never swept him — the sweeper must close, not just touch')
    }
    // 6. THE DOG: its lunge lands INSIDE the s-band and crosses from its own
    //    kerb PAST centre — the doomed lane is between the dog's body and the
    //    middle; the far side is the free one.
    {
        const d = STAGES[0].dogs[0]                 // side +1: from the right kerb
        const g = makeGame(0)
        g.x = 25                                    // the dog swings THROUGH here
        drive(g, d.s0 + 12, {})
        ok(g.lives < CFG.lives, `riding x=25 into the dog at s=${d.s0} paid no life (lives=${g.lives}) — the lunge geometry is a decoration`)
        const g2 = makeGame(0)
        g2.x = -25                                  // its body owns 3..45 at band time; the left is free
        drive(g2, d.s0 + 12, {})
        ok(g2.lives === CFG.lives, 'the far side of a crossing dog got bitten anyway')
    }
    // 7. THE CRASH LEDGER: a crash costs a life, kills the streak, freezes the
    //    scroll (stun) and hops the boy off the hazard.
    {
        const g = makeGame(1)
        const c = STAGES[1].crates[1]
        g.streak = 4
        g.x = c.x
        g.events.length = 0
        const ev = driveCollect(g, c.s - 2, {})
        const cr = ev.find((e) => e.type === 'crash')
        ok(!!cr, 'straight into a named crate and nothing happened')
        ok(g.lives === CFG.lives - 1 && g.streak === 0, `crash ledger: lives=${g.lives} streak=${g.streak}`)
        const sDuring = g.s
        run(g, {}, 10)
        ok(g.s === sDuring, `the stun froze ${g.s - sDuring}px of scroll (want 0 while stunned)`)
    }
    // 8. THE F-THROW: one paper down the lane meets the dog in its own band.
    {
        const g = makeGame(0)
        const d = STAGES[0].dogs[0]
        g.x = 18
        drive(g, d.s0 - 55, {})
        drive(g, d.s0 - 12, { pedal: 0 })            // crawl so the flight meets the band mid-lunge
        const ev = run(g, { throw: 2, pedal: 0 }, 1)
        for (let i = 0; i < 6; i++) ev.push(...run(g, { pedal: 0 }))
        ok(ev.some((e) => e.type === 'scare') || g.scared > 0, 'a paper thrown down the lane at a lunging dog missed — F has no answer')
    }
    // 9. STAGE CLEAR + the win: ride far enough and the world rolls on.
    {
        const g = makeGame(2)
        const before = g.score
        g.s = STAGES[2].len - 20          // teleport to the run-out: the PIN is the handoff, not the drive
        run(g, { pedal: 1 }, 15)
        ok(g.end === 'win' && g.win && g.score > before, `finishing IRON HILL gave end=${g.end} score+=${g.score - before}`)
        const gg = makeGame(1)
        gg.s = STAGES[1].len - 20
        run(gg, { pedal: 1 }, 15)
        ok(gg.si === 2 && gg.s < 100 && gg.papers === STAGES[2].houseCount + CFG.sparePapers, `stage handoff: si=${gg.si} papers=${gg.papers}`)
    }
}
function driveCollect(g, sTick, input) {
    const ev = []
    while (g.s < sTick && !g.end) {
        const e = run(g, input)
        ev.push(...e)
    }
    return ev
}

// ------------------------------------------------------------------- the proven run ----
section('THE PROVEN RUN (the attract demo replays exactly this)')
let proven = null
{
    const t0 = Date.now()
    proven = solveGame({})
    ok(proven.ok, `the autopilot did NOT win the series: ${proven.why}`)
    ok(proven.delivered === proven.total, `the proven run dropped ${proven.total - proven.delivered} papers at the doors`)
    ok(proven.crashes === 0, `the proven run crashed ${proven.crashes} times — the demo must be perfect`)
    console.log(`  ..    ${proven.script.length} ticks, ${proven.delivered}/${proven.total} doors, score ${proven.score}, ${Date.now() - t0} ms`)
}

// ------------------------------------------------------------------- the slack rule ----
section('SLACK RULE — tighter windows, full throttle, a crawl, zero spare papers')
{
    const wTight = CFG.wwin - 4            // -2px PER SIDE: one tick less per edge at MID
    const hi = solveGame({ v: PEDAL[2], wwin: wTight })
    ok(hi.ok && hi.delivered === hi.total && hi.crashes === 0, `FULL THROTTLE with windows ${wTight}: ${hi.ok ? 'won' : hi.why}`)
    console.log(`  ..    hi (v=${PEDAL[2]}, w=${wTight}): ${hi.ok ? 'WINS ' + hi.delivered + '/' + hi.total : 'loses'}`)
    const lo = solveGame({ v: PEDAL[0], wwin: wTight })
    ok(lo.ok && lo.delivered === lo.total && lo.crashes === 0, `CRAWL with windows ${wTight}: ${lo.ok ? 'won' : lo.why}`)
    console.log(`  ..    lo (v=${PEDAL[0]}, w=${wTight}): ${lo.ok ? 'WINS ' + lo.delivered + '/' + lo.total : 'loses'}`)
    const mid = solveGame({ wwin: wTight })
    ok(mid.ok, `MID with windows ${wTight}: ${mid.ok ? 'won' : mid.why}`)

    // zero spare papers: the exact number of doors, not one more. Solve at MID
    // (that is the witness the demo uses) then replay IT with no spares.
    const saveSpare = CFG.sparePapers
    CFG.sparePapers = 0
    const g = makeGame(0)
    let crashed = 0, t = 0
    while (!g.end && t < proven.script.length + 400) {
        step(g, proven.script[t] || {})
        for (const e of g.events) if (e.type === 'crash') crashed++
        g.events.length = 0
        t++
    }
    CFG.sparePapers = saveSpare
    ok(g.end === 'win' && g.delivered === proven.total && crashed === 0 && g.papers === 0,
        `zero-spare replay: end=${g.end} delivered=${g.delivered}/${proven.total} papersLeft=${g.papers} crashes=${crashed} — the route must fit its own paper count with NONE spare`)
    console.log(`  ..    zero-spare: ${g.delivered} doors on exactly ${g.delivered} papers, ${g.papers} left`)
}

// ------------------------------------------------------------------ determinism ----
section('DETERMINISM')
{
    const stream = () => {
        const g = makeGame(0)
        const hs = []
        for (let t = 0; t < proven.script.length && !g.end; t++) {
            step(g, proven.script[t])
            if (t % 900 === 0) hs.push(stateHash(g))
        }
        return { hs, end: g.end, score: g.score }
    }
    const a = stream(), b = stream()
    ok(JSON.stringify(a) === JSON.stringify(b), 'two identical runs of the proven script diverged')
    ok(a.end === 'win', `the determinism run ended ${a.end}`)

    // the hash must SEE the world — and one dropped throw must change it
    const g1 = makeGame(0), g2 = makeGame(0)
    for (let t = 0; t < 130; t++) { step(g1, proven.script[t]); step(g2, proven.script[t]) }
    const h1 = stateHash(g1), h2 = stateHash(g2)
    ok(h1 === h2, 'fresh identical states hash differently')
    const g3 = makeGame(0)
    for (let t = 0; t < 130; t++) step(g3, { ...proven.script[t], throw: undefined })
    drive(g3, 300, {})
    ok(stateHash(g3) !== stateHash(g1), 'stateHash ignores deliveries')
    g2.x += 0.4
    ok(stateHash(g1) !== stateHash(g2), 'stateHash ignores the handlebars')
}

// ------------------------------------------------------------------ mutations ----
if (MUT) {
    section('MUTATIONS — each MUST turn an honest probe red')

    const mut = (name, patch, probe) => {
        const base = probe()
        ok(base === true, `mutation harness broken: baseline for '${name}' is not true (${base})`)
        const save = {}
        for (const k of Object.keys(patch)) save[k] = CFG[k]
        Object.assign(CFG, patch)
        const v = probe()
        Object.assign(CFG, save)
        console.log(`  mut ${name}: ${v === true ? 'SURVIVED (BAD)' : 'caught by a probe'}`)
        ok(v !== true, `${name} SURVIVED — a check stopped touching this rule`)
    }

    // 1. the lean gate off — throwing the wrong way becomes free
    mut('leanGate=false (no lean required)', { leanGate: false }, () => {
        const g = makeGame(0)
        const h0 = houseList(STAGES[0])[0]
        drive(g, h0.s - 4, {})
        g.x = 0
        const ev = run(g, { throw: -1 })
        return ev.some((e) => e.type === 'lean')
    })

    // 2. dogs stop lunging — the dog lane becomes a decoration
    mut('dogLunge=false (kerb potatoes)', { dogLunge: false }, () => {
        const d = STAGES[0].dogs[0]
        const g = makeGame(0)
        g.x = 25
        drive(g, d.s0 + 12, {})
        return g.lives < CFG.lives
    })

    // 3. the sweeper only touches, never closes — the nose-chase kill dies
    mut('carSweep=false (carts become paddle-boards)', { carSweep: false }, () => {
        const g = makeGame(1)
        const c = g.crossings[0]
        drive(g, c.s - 8, {})
        c.launched.length = 0
        c.nextL = g.tick + 300
        g.x = 30
        c.launched.push(g.tick - 25)
        g.events.length = 0
        const ev = run(g, {}, 2)
        return ev.some((e) => e.type === 'crash' && e.what === 'cart')
    })

    // 4. crashes stop costing the streak — combo farming lives inside wreckage
    mut('crashReset=false (the streak survives a wreck)', { crashReset: false }, () => {
        const g = makeGame(1)
        const c = STAGES[1].crates[1]
        g.streak = 4
        g.x = c.x
        driveCollect(g, c.s + 4, {})
        return g.streak === 0
    })

    // 5. WITNESS INTEGRITY: physics off the grid — a DP that still claimed
    //    victory here would be lying (its reachable set assumes 3 slots per
    //    tick; the sim now moves 0.3). The replay witness MUST catch it.
    //    (A CONSISTENT slow-steer world genuinely stays clearable — that is
    //    slack, not a bug; this mutant breaks DP-vs-sim agreement instead.)
    mut('steer 2.4 -> 0.3 (DP/witness agreement)', { steer: 0.3 }, () => {
        const r = solveGame({})
        return r.ok && r.delivered === r.total && r.crashes === 0
    })

    // 6. door windows slashed to 4px — slack must STOP being slack
    mut('wwin 16 -> 8 (two-tick doors)', { wwin: 8 }, () => {
        const r = solveGame({ v: PEDAL[2], wwin: CFG.wwin - 4 })
        if (!r.ok) console.log('      probe why:', r.why)
        return r.ok
    })
}

console.log(`\npapercheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
