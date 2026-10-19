// SIMCITY-MIN — the Node gate. No browser, no dev server.
//
//   npm run citycheck              # audit + pins + proven runs + slack + stability
//   npm run citycheck -- --mutate  # re-break the load-bearing rules
//
// Sections: frozen Math.random · scenario audit · construction/economy pins
// (ROAD adjacency, power-along-roads, POP-IS-RES-ONLY, ledger to the dollar)
// · the tap path (cursor moves don't tick, taps queue, alerts survive)
// · disaster pins (scripted fire, dousing, spread determinism, tornado cut)
// · doing nothing loses · the proven runs (the attract demo replays these)
// · the SLACK RULE (one fewer plant, one fewer station, one plant less cash)
// · the STABILITY/FUN stat harness (growth saturates, never explodes or
//   crashes — the economy must PLATEAU) · determinism · mutants.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { newCity, step, T, CFG, inB, stateHash, moveCursor, tapInbox, INBOX_CAP } from '../src/games/SimCityMin/sim.js'
import { plan } from '../src/games/SimCityMin/planner.js'
import { SCEN, W, H } from '../src/games/SimCityMin/scen.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const MUT = process.argv.includes('--mutate')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)
const idx = (x, y) => y * W + x

// ---------------------------------------------------------------- math is banned ----
section('MATH.RANDOM IS A SIM CRIME')
for (const f of ['sim.js', 'scen.js', 'planner.js']) {
    const raw = readFileSync(join(HERE, '../src/games/SimCityMin', f), 'utf8')
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(!/Math\s*\.\s*random/.test(src), `${f} contains Math.random — the economy may never gamble`)
}
{
    const real = Math.random
    Math.random = () => { throw new Error('Math.random called during plan — the city is scripted') }
    let froze = false
    try { plan(2); froze = true } catch (e) { fails.push(`frozen random hit: ${e.message}`) }
    Math.random = real
    ok(froze, 'a full disaster-scenario plan runs with Math.random THROWN at the call site')
}

// ---------------------------------------------------------------- scenario audit ----
section('SCENARIO AUDIT')
{
    SCEN.forEach((S, i) => {
        ok(S.target > 0 && S.deadline > 15, `s${i}: nonsense target/deadline`)
        ok(S.funds >= 800, `s${i}: ${S.funds} start funds cannot survive year one`)
        ok(S.map.length === H && S.map.every((r) => r.length === W), `s${i}: map is not ${H}x${W}`)
        for (const f of S.fires) {
            ok(inB(f.x, f.y) && f.year < S.deadline, `s${i}: fire ${JSON.stringify(f)} outside the game window`)
            ok(S.map[f.y][f.x] === '.', `s${i}: fire @${f.x},${f.y} lands on terrain, not a buildable cell`)
        }
        if (S.tornado) {
            ok(S.tornado.startYear + S.tornado.path.length <= S.deadline, `s${i}: tornado outlasts the deadline`)
            ok(S.tornado.path.every(([x, y]) => inB(x, y)), `s${i}: tornado leaves the map`)
        }
    })
    ok(SCEN.length === 3, `${SCEN.length} scenarios — three halls, like the arcade demands`)
}

// ------------------------------------------------------------- construction pins ----
section('ENGINE PINS')
{
    const g = newCity(0)
    step(g, { tool: T.RES, place: [5, 4] })
    ok(!!g.events.find((e) => e.type === 'deny' && e.why === 'NOROAD'), 'a zone with no road answered nothing, not NOROAD')
    step(g, { tool: T.ROAD, place: [5, 4] })
    ok(g.grid[idx(5, 4)].t === T.ROAD, 'a road on grass was refused')
    step(g, { tool: T.ROAD, place: [14, 10] })
    ok(!!g.events.find((e) => e.type === 'deny' && e.why === 'GROUND'), 'water accepted a road')
    step(g, { tool: T.RES, place: [5, 3] })
    ok(g.grid[idx(5, 3)].t === T.RES, 'a road-adjacent zone was refused')
    g.funds = 0
    step(g, { tool: T.ROAD, place: [6, 4] })
    ok(!!g.events.find((e) => e.type === 'deny' && e.why === 'BROKE'), 'a bankrupt city built anyway')

    // POWER: a zone two steps off the plant network goes dark once unpowered
    const p = newCity(0)
    for (let x = 4; x <= 20; x++) step(p, { tool: T.ROAD, place: [x, 8] })
    step(p, { tool: T.PLANT, place: [5, 7] })
    for (const x of [6, 8]) step(p, { tool: T.RES, place: [x, 9] })
    for (let t = 0; t < CFG.yearTicks * 10; t++) step(p, {})
    const litSome = p.grid.filter((c) => c.lit).length
    ok(litSome > 0, 'the seeded plant lit nothing at all')
    step(p, { tool: 'doze', place: [5, 7] })
    for (let t = 0; t < CFG.yearTicks * 3; t++) step(p, {})
    ok(p.grid[idx(6, 9)].lvl === 0 && p.grid[idx(8, 9)].lvl === 0,
        'zones stayed lit after the only plant was demolished — power is theatre')

    // POP IS RES ONLY — the original bug: commerce was counted as residents
    const c = newCity(0)
    for (let x = 4; x <= 8; x++) step(c, { tool: T.ROAD, place: [x, 8] })
    step(c, { tool: T.PLANT, place: [6, 7] })
    for (let x = 5; x <= 8; x++) step(c, { tool: T.COM, place: [x, 9] })
    for (const [x, y] of [[5, 7], [7, 7]]) step(c, { tool: T.IND, place: [x, y] })
    for (let t = 0; t < CFG.yearTicks * 4; t++) step(c, {})
    ok(c.pop === 0 && c.jobs > 0, `commerce and industry alone produced ${c.pop} residents / ${c.jobs} jobs — POP must count RES only`)
    ok(c.grid[idx(5, 7)].lvl > 0 && c.grid[idx(7, 7)].lvl > 0, 'powered industry next to a road never developed')

    // block-by-block: one level per cooldown at most. "Grew" is tracked as
    // a high-water mark: a scripted fire can reduce the fixture's lone tile
    // (it strikes the city where the city is, and one tile is a city), but
    // that tests disasters, not growth — the anti-vacuity pin is "it ever
    // rose", and the mechanic pin is "never more than one level a year".
    const b = newCity(0)
    step(b, { tool: T.ROAD, place: [6, 8] })
    step(b, { tool: T.PLANT, place: [6, 7] })
    step(b, { tool: T.IND, place: [7, 8] })
    let peak = 0, prev = 0, big = 0
    for (let t = 0; t < CFG.yearTicks * 14; t++) {
        step(b, {})
        if (b.events.find((e) => e.type === 'year')) {
            const lvl = b.grid[idx(7, 8)].lvl
            if (lvl - prev > 1) big++
            prev = lvl
            peak = Math.max(peak, lvl)
        }
    }
    ok(peak > 0, 'block-by-block fixture never grew at all — the pin was vacuous')
    ok(big === 0, 'a block jumped more than one level in a year — growth is not block-by-block')
}

// ---------------------------------------------------------------- the tap path ----
section('THE TAP PATH — the cursor is a brush, taps queue, alerts survive')
{
    // A cursor move is a BRUSH mutation, not a step: the clock, the year and
    // any alert already in flight must all survive it. (The old shell ran a
    // full step() per arrow press and spliced the events away before the UI
    // could hear them.)
    const g = newCity(0)
    g.events.push({ type: 'fire', x: 3, y: 3 })   // an alert in flight
    const t0 = g.tick, y0 = g.year
    moveCursor(g, -99, -99)
    ok(g.cursor.x === 0 && g.cursor.y === 0, `a fling to (-99,-99) left the brush at ${g.cursor.x},${g.cursor.y} — the walls are not there`)
    ok(g.tick === t0, `an arrow move advanced the clock ${t0} -> ${g.tick} — the cursor is a step, not a brush`)
    ok(g.year === y0, 'a cursor move ended a year')
    ok(g.events.length === 1 && g.events[0].type === 'fire', 'a cursor move ate the fire alert in flight')
    moveCursor(g, 99, 99)
    ok(g.cursor.x === W - 1 && g.cursor.y === H - 1, 'a fling to (+99,+99) walked through the east/south wall')

    // Two taps in one tick interval are TWO placements: the inbox digests one
    // request per step and the sim answers each one (the first lands, the
    // second on the same cell is refused — but neither is silently dropped).
    const c = newCity(0)
    step(c, { tool: T.ROAD, place: [11, 8] })
    const funds0 = c.funds
    tapInbox(c, 11, 9); tapInbox(c, 11, 9)   // a fast double tap
    step(c, { tool: T.RES })
    ok(c.grid[idx(11, 9)].t === T.RES, 'the first queued tap never placed')
    ok(c.funds === funds0 - CFG.cost.res, `the first tap charged ${funds0 - c.funds} (want ${CFG.cost.res})`)
    step(c, { tool: T.RES })
    const refused = c.events.find((e) => e.type === 'deny' && e.why === 'GROUND')
    ok(c.grid[idx(11, 9)].t === T.RES && !!refused, 'the second tap on an occupied cell was swallowed instead of refused')
    ok(c.funds === funds0 - CFG.cost.res, `the refused tap still charged money (${c.funds} vs ${funds0 - CFG.cost.res})`)
    step(c, {})
    ok(c.inbox.length === 0 && !c.events.some((e) => e.type === 'place' || e.type === 'deny'), 'a drained inbox still produces work')

    // the inbox is a queue with a cap, not a boolean: a burst of taps keeps
    // them all (up to the cap) and the state hash sees the backlog.
    const b = newCity(0)
    for (let i = 0; i < INBOX_CAP + 5; i++) tapInbox(b, 5, 4)
    ok(b.inbox.length === INBOX_CAP, `a ${INBOX_CAP + 5}-tap burst left ${b.inbox.length} queued — the cap is a lie`)
    ok(stateHash(b) !== stateHash(newCity(0)), 'stateHash ignores taps waiting in the inbox')
}

// ----------------------------------------------------------------- ledger audit ----
section('LEDGER CONSERVES TO THE DOLLAR')
{
    let years = 0
    for (const sc of [0, 1, 2]) {
        const r = plan(sc)
        const g2 = newCity(sc)
        let funds = g2.funds
        for (const inp of r.script) {
            step(g2, inp)
            const ev = g2.events.find((e) => e.type === 'year')
            if (ev) {
                years++
                ok(g2.funds === funds + ev.income - ev.expense - ev.spent, `s${sc} y${g2.year}: ledger break (${funds}+${ev.income}-${ev.expense}-${ev.spent} != ${g2.funds})`)
                funds = g2.funds
            }
        }
    }
    console.log(`  ..    ${years} year-ends balanced to the dollar`)
}

// ---------------------------------------------------------------- disaster pins ----
section('DISASTER PINS')
{
    // a scripted fire IGNITES a developed block (plants stand — they are
    // concrete), burns neighbours (deterministic mod), and a station within
    // radius DOUSES — unattended it must reach ash.
    const mk = (withStation) => {
        const g = newCity(1)
        for (let x = 4; x <= 18; x++) step(g, { tool: T.ROAD, place: [x, 12] })
        step(g, { tool: T.PLANT, place: [10, 11] })
        for (const [x, y] of [[9, 11], [11, 11], [12, 11]]) step(g, { tool: T.IND, place: [x, y] })
        for (const [x, y] of [[10, 13], [11, 13], [13, 13], [14, 11]]) step(g, { tool: T.RES, place: [x, y] })
        if (withStation) step(g, { tool: T.FIRE, place: [12, 13] })
        for (let t = 0; t < CFG.yearTicks * 16; t++) { step(g, {}); if (g.end) break }
        return g
    }
    const scarred = (g) => g.grid.filter((c) => c.scar > 0).length
    const burned = mk(false)
    const ashed = scarred(burned)
    ok(ashed > 0, `unattended fire scorched nothing — disaster mode is theatre`)

    // the SAME script with a station in dousing range: fewer cells scar
    const saved = mk(true)
    ok(scarred(saved) < ashed, `a guarded city took ${scarred(saved)} scars vs ${ashed} unguarded — dousing does nothing`)

    // spread is deterministic: two runs of the identical world burn identical cells
    const a = mk(false), b = mk(false)
    const scarOf = (g) => g.grid.map((c, i) => (c.scar ? i : '')).join(',')
    ok(scarOf(a) === scarOf(b), 'the same fire burned different cells twice — the spread rolls dice')

    // tornado: named path, fixed year; plants stand, a road cut UNLITS the far side
    const tn = newCity(2)
    const bY = SCEN[2].tornado.path[0][1]
    for (let x = 2; x <= 20; x++) step(tn, { tool: T.ROAD, place: [x, bY] })
    step(tn, { tool: T.PLANT, place: [8, bY - 1] })
    step(tn, { tool: T.RES, place: [19, bY - 1] })
    let eastLitBefore = false, eastLitAfter = null
    for (let t = 0; t < CFG.yearTicks * (SCEN[2].tornado.startYear + 4); t++) {
        step(tn, {})
        if (tn.year === SCEN[2].tornado.startYear - 1) eastLitBefore = tn.grid[idx(19, bY - 1)].lit
        if (tn.year === SCEN[2].tornado.startYear + 3) eastLitAfter = tn.grid[idx(19, bY - 1)].lit
    }
    ok(eastLitBefore === true, 'the far bank was never lit to begin with — the cut test is vacuous')
    ok(eastLitAfter === false, 'the tornado cut the corridor and the far bank stayed powered — power does not ride the road')
}

// ---------------------------------------------------- the dumb recipe (#270) ----
section('THE DUMB ONE-STREET RECIPE NOW LOSES')
{
    // The recipe from the issue: one main street, a plant mid-street, 8
    // industry at one end, ~22 homes at the other, nothing after. It used to
    // win every map inside a fifth of the deadline; the RCI leg (industry
    // stalls at level 1 without a neighbourhood) must kill it on all three.
    for (const sc of [0, 1, 2]) {
        const S = SCEN[sc]
        const g = newCity(sc)
        let bestY = 8, bestLen = 0
        for (let y = 1; y < H - 1; y++) {
            let run = 0
            for (let x = 0; x <= W; x++) {
                const isG = x < W && S.map[y][x] === '.'
                if (isG) run++; else { if (run > bestLen) { bestLen = run; bestY = y }; run = 0 }
            }
        }
        const y = bestY
        for (let x = 1; x < W - 1; x++) if (S.map[y][x] === '.') g.grid[idx(x, y)].t = T.ROAD
        const py = S.map[y - 1] && S.map[y - 1][12] === '.' ? y - 1 : y + 1
        g.grid[idx(12, py)].t = T.PLANT
        const placeZ = (zx, tool) => {
            for (const dy of [-1, 1]) {
                const zy = y + dy
                if (!inB(zx, zy) || S.map[zy][zx] !== '.' || g.grid[idx(zx, zy)].t !== T.GRASS) continue
                g.grid[idx(zx, zy)].t = tool; return true
            }
            return false
        }
        let ind = 0, res = 0
        for (let x = 2; x <= 10 && ind < 8; x++) if (placeZ(x, T.IND)) ind++
        for (let x = 14; x <= 22; x++) { if (placeZ(x, T.RES)) res++; if (res < 22 && placeZ(x, T.RES)) res++ }
        for (let t = 0; t < CFG.yearTicks * 80 && !g.end; t++) step(g, {})
        ok(g.end === 'lose', `s${sc} ${S.name}: the one-street recipe (I${ind}/R${res}) ended ${g.end} @y${g.year} pop ${g.pop} — the trap still pays`)
    }
}

// ------------------------------------------------- disasters are actually seen ----
section('DISASTERS ARE SEEN IN A COMPETENT GAME')
{
    // A scripted fire no longer waits at its corner: it strikes the nearest
    // developed cell to the seed — the city where the city is. So a competent
    // run must actually see its disasters: every map scripts fires, at least
    // one ignites before the run ends, the first strike lands by mid-deadline,
    // and nothing duds (a city that exists has something to burn).
    for (const sc of [0, 1, 2]) {
        const S = SCEN[sc]
        const g = newCity(sc)
        const r = plan(sc)
        const fired = []
        let duds = 0
        for (const inp of r.script) {
            step(g, inp)
            for (const e of g.events) {
                if (e.type === 'fire') fired.push(e.year)
                if (e.type === 'dudfire') duds++
            }
        }
        ok(S.fires.length > 0, `s${sc} ${S.name}: no scripted disasters — a map with nothing to answer for`)
        ok(fired.length > 0, `s${sc} ${S.name}: no scripted fire ever ignited in a competent game — the disasters are invisible`)
        // a fire in the WIN year still counts as seen: inside yearTick the
        // disasters strike before the end check, so the player sees the
        // strike and the answer in the same year the city takes the crown.
        // A fire AFTER the end never ignites at all — that is the
        // "late decoration" this pin hunts.
        ok(fired.some((yy) => yy <= g.year), `s${sc}: fires at [${fired.join(',')}] all after the end (y${g.year}) — a late decoration, not a mid-game threat`)
        ok(fired.length && Math.min(...fired) <= Math.floor(S.deadline / 2), `s${sc}: first strike y${Math.min(...fired) || '?'} — past mid-deadline (${S.deadline})`)
        ok(duds === 0, `s${sc}: ${duds} fire(s) duded — the city existed, the strike found nothing`)
    }
}

// ------------------------------------------------------------- doing nothing ----
section('DOING NOTHING LOSES')
{
    for (const sc of [0, 1, 2]) {
        const g = newCity(sc)
        let t = 0
        while (!g.end && t < CFG.yearTicks * 80) { step(g, {}); t++ }
        ok(g.end === 'lose', `s${sc}: an empty field ended ${g.end} — overhead or the deadline must collect`)
    }
}

// ---------------------------------------------------------- proven + slack ----
section('THE PROVEN RUNS (the attract demo replays these, tick for tick)')
const base = []
{
    for (const sc of [0, 1, 2]) {
        const r = plan(sc)
        base.push(r.receipts)
        ok(r.ok, `s${sc} did NOT win: ${r.receipts.why} @y${r.receipts.year} pop ${r.receipts.pop}`)
        ok(r.receipts.year >= 10, `s${sc} won in ${r.receipts.year} years — a sprint, not a long horizon`)
        ok(r.receipts.year <= SCEN[sc].deadline - 5, `s${sc} won at the buzzer (${r.receipts.year}/${SCEN[sc].deadline})`)
        const f = r.receipts.popHistory
        const kinds = new Set(r.script.filter((i) => i.place && [T.RES, T.COM, T.IND].includes(i.tool)).map((i) => i.tool))
        ok(kinds.size === 3, `s${sc} built only ${[...kinds].join('/') || 'nothing'} — a one-zone town is not an economy`)
        console.log(`  ..    s${sc} WIN y${r.receipts.year} pop ${r.receipts.pop} plants ${r.receipts.plants} stations ${r.receipts.fires} funds ${r.receipts.funds}`)
    }
}

section('SLACK RULE — one fewer plant, one fewer station, one plant less cash')
{
    SCEN.forEach((_, sc) => {
        const b = base[sc]
        ok(b.plants >= 1 && (sc === 0 || b.fires >= 1), `s${sc}: slack needs consumables to remove (P${b.plants} F${b.fires})`)
        const r = plan(sc, { plantCap: b.plants - 1, fireCap: b.fires - 1, fundsCut: CFG.cost.plant })
        ok(r.ok, `s${sc} is NOT winnable with one fewer plant (${b.plants - 1}), one fewer station (${b.fires - 1}) and $${CFG.cost.plant} less — zero slack is a build failure`)
        ok(r.receipts.plants <= b.plants - 1 && r.receipts.fires <= Math.max(0, b.fires - 1),
            `s${sc} slack run cheated the caps: ${r.receipts.plants}P/${r.receipts.fires}F vs ${b.plants - 1}/${b.fires - 1}`)
        ok(r.receipts.year <= SCEN[sc].deadline - 3, `s${sc} slack won at the buzzer (${r.receipts.year}) — no margin for a human`)
        console.log(`  ..    s${sc} slack @P${b.plants - 1}/F${b.fires - 1}/-$${CFG.cost.plant}: ${r.ok ? 'WINS' : 'LOSES'} y${r.receipts.year} pop ${r.receipts.pop}`)
    })
}

// ------------------------------------------------------- stability (the stat harness) ----
section('THE ECONOMY PLATEAUS — stable AND fun')
{
    // take each scenario, make the target unreachable (play to the deadline),
    // and grade the shape of the curve the greedy engine walks: it must climb,
    // saturate, and sit still — no explosion, no collapse, cash never negative.
    SCEN.forEach((S, sc) => {
        const real = S.target
        S.target = 1e9
        const r = plan(sc, { maxYears: 60 })
        S.target = real
        const f = r.receipts.popHistory
        ok(f.length >= 30, `s${sc}: economy died before the horizon`)
        const firstIdx = f.findIndex((v) => v > 0)
        ok(firstIdx >= 0 && firstIdx <= 6, `s${sc}: first residents at year ${firstIdx + 1} — too slow to be a game`)
        // stability measures DRAWS on the peak, not growth: a curve still
        // climbing capacity is healthy; one that gives back a fifth of its
        // population in a cycle is the oscillation this pin hunts
        // only the MATURE end is graded: mid-game swings while the city is
        // filling its map are residents chasing jobs — that is the game.
        // Saturation means the last 15 years don't give back a fifth.
        let worst = 0
        const tail = f.slice(Math.max(0, f.length - 18), Math.max(0, f.length - 3))
        if (tail.length > 8) {
            for (let i = 4; i < tail.length; i++) {
                const peak = Math.max(...tail.slice(0, i + 1))
                if (peak > 60) worst = Math.max(worst, (peak - tail[i]) / peak)
            }
        }
        ok(worst <= 0.2, `s${sc}: the mature economy still swung ${(worst * 100).toFixed(0)}% off its peak — oscillating, not saturating`)
        const grow = f[10] >= f[firstIdx + 1] * 2
        ok(grow, `s${sc}: population did not double within 9 years of first residents (${f[firstIdx + 1]} -> ${f[10]}) — the economy is a crawl, not a curve`)
        ok(f[f.length - 1] >= f[Math.floor(f.length / 2)], 'the mature city shrank over the back half — no plateau')
        console.log(`  ..    s${sc} free-run y30→y50 pop ${f[29] || f[f.length - 1]}→${f[Math.min(49, f.length - 1)]}`)
    })
}

// ------------------------------------------------------------------ determinism ----
section('DETERMINISM')
{
    const run = () => {
        const g = newCity(2)
        const r = plan(2)
        r.script.forEach((i) => step(g, i))
        return { end: g.end, why: g.endWhy, year: g.year, pop: g.pop, funds: g.funds, score: g.score }
    }
    const a = run(), b = run()
    ok(JSON.stringify(a) === JSON.stringify(b), 'two identical runs of the same city diverged')
    const g1 = newCity(0), g2 = newCity(0)
    for (const g of [g1, g2]) for (let t = 0; t < 300; t++) step(g, {})
    ok(stateHash(g1) === stateHash(g2), 'two fresh identical worlds hash differently')
    g2.grid[idx(5, 5)].lvl = 3
    ok(stateHash(g1) !== stateHash(g2), 'stateHash ignores a zoning change')
    const g3 = newCity(0)
    g3.funds += 1
    ok(stateHash(g3) !== stateHash(newCity(0)), 'stateHash ignores the treasury')
}

// ------------------------------------------------------------------- mutants ----
if (MUT) {
    section('MUTATIONS — each MUST turn an honest check red')

    const tryMut = (name, apply, probe) => {
        const baseV = probe()
        ok(baseV === true, `mutation harness broken: baseline for '${name}' is not green`)
        const save = {}
        for (const k of Object.keys(apply)) save[k] = CFG[k]
        Object.assign(CFG, apply)
        const v = probe()
        Object.assign(CFG, save)
        console.log(`  mut ${name}: ${v === true ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(v !== true, `${name} SURVIVED — a check stopped touching this rule`)
    }

    // 1. block-by-block growth off: instant saturating town
    tryMut('maxLvl 4 -> 1 (buildings never rise)', { maxLvl: 1 }, () => plan(0).ok)

    // 2. power no longer rides roads with a range — relays are pointless
    tryMut('powerRange 12 -> 200 (one plant lights the map)', { powerRange: 200 }, () => {
        const p = newCity(0)
        for (let x = 4; x <= 20; x++) step(p, { tool: T.ROAD, place: [x, 8] })
        step(p, { tool: T.PLANT, place: [4, 7] })
        step(p, { tool: T.IND, place: [20, 9] })
        for (let t = 0; t < CFG.yearTicks * 8; t++) step(p, {})
        return p.grid[idx(20, 9)].lvl === 0
    })

    // 3. fire spreads to every neighbour every year: fires become lava
    tryMut('spreadMod 5 -> 1 (burns all neighbours)', { spreadMod: 1 }, () => {
        const g = newCity(0)
        for (let x = 4; x <= 18; x++) step(g, { tool: T.ROAD, place: [x, 8] })
        step(g, { tool: T.PLANT, place: [10, 9] })
        step(g, { tool: T.IND, place: [9, 9] })
        step(g, { tool: T.IND, place: [11, 9] })
        for (let x = 8; x <= 12; x++) step(g, { tool: T.RES, place: [x, 7] })
        for (let x = 9; x <= 11; x++) step(g, { tool: T.RES, place: [x, 6] })
        for (let t = 0; t < CFG.yearTicks * 6; t++) step(g, {})
        // light the centre house directly: mod 5 may catch a neighbour or two,
        // mod 1 must ignite every neighbour at once
        g.grid[idx(10, 7)].burn = CFG.fireYears
        let spreads = 0
        for (let t = 0; t < CFG.yearTicks * 2; t++) {
            step(g, {})
            spreads += g.events.filter((e) => e.type === 'spread').length
        }
        return spreads <= 2
    })

    // 4. the city forgets to bill overhead: an empty field is free forever
    tryMut('overhead 20 -> 0 (an empty field costs nothing)', { overhead: 0 }, () => {
        const g = newCity(0)
        let ev = []
        for (let t = 0; t < CFG.yearTicks * 3; t++) { step(g, {}); ev = ev.concat(g.events.filter((e) => e.type === 'year')) }
        return ev.length > 0 && ev[ev.length - 1].expense === 20
    })

    // 5. fires fizzle: burn=0 ignition is silently nothing. The probe must
    //    give the strike a DEVELOPED block — plants are concrete and never
    //    burn (the tornado rule is the fire rule), and s1's rock cluster
    //    eats naive row-7 fixtures, so this mirrors the mk() disaster
    //    fixture's row-12 layout: jobs that make the blocks develop.
    tryMut('fireYears 2 -> 0 (scripted fires fizzle)', { fireYears: 0 }, () => {
        const g = newCity(1)
        for (let x = 4; x <= 18; x++) step(g, { tool: T.ROAD, place: [x, 12] })
        step(g, { tool: T.PLANT, place: [10, 11] })
        for (const [x, y] of [[9, 11], [11, 11], [12, 11]]) step(g, { tool: T.IND, place: [x, y] })
        for (const [x, y] of [[10, 13], [11, 13], [13, 13], [14, 11]]) step(g, { tool: T.RES, place: [x, y] })
        for (let t = 0; t < CFG.yearTicks * 16; t++) step(g, {})
        return g.grid.filter((c) => c.scar > 0).length > 0
    })

    // 6. commerce stops employing: the jobs mix that drags residents forward
    tryMut('jobsC 7 -> 0 (commerce creates no work)', { jobsC: 0 }, () => {
        const c = newCity(0)
        for (let x = 4; x <= 8; x++) step(c, { tool: T.ROAD, place: [x, 8] })
        step(c, { tool: T.PLANT, place: [6, 7] })
        step(c, { tool: T.IND, place: [5, 7] })
        for (let x = 5; x <= 8; x++) step(c, { tool: T.COM, place: [x, 9] })
        step(c, { tool: T.RES, place: [7, 7] })
        for (let t = 0; t < CFG.yearTicks * 10; t++) step(c, {})
        const iOnly = c.grid.reduce((n, cc) => n + (cc.t === T.IND ? cc.lvl * 14 : 0), 0)
        return c.jobs > iOnly
    })

    // 7. the upkeep schedule — a city that never pays for its roads never
    //    faces the trade-off the slack rule grades
    tryMut('road upkeep 1 -> 0 (streets are free forever)', { upkeep: { ...CFG.upkeep, [T.ROAD]: 0 } }, () => {
        const g = newCity(0)
        for (let x = 4; x <= 20; x++) step(g, { tool: T.ROAD, place: [x, 8] })
        let ev = []
        for (let t = 0; t < CFG.yearTicks * 2; t++) { step(g, {}); ev = ev.concat(g.events.filter((e) => e.type === 'year')) }
        return ev.length > 0 && ev[ev.length - 1].expense === CFG.overhead + 17
    })
}

console.log(`\ncitycheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
