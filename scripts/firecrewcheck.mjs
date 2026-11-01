// FIRE CREW — the Node gate (#1254). No browser, no dev server: it boots the
// sim from a seed, proves the five signature rules hold, proves a run can be
// WON, and proves the roster/registry wiring every harness reads. Run:
//   npm run firecrewcheck        — green
// Break any load-bearing line in sim.js and it must go red; see README.md.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
    makeRun, step, state, setSources, mulberry32, windBias, CLOCK, W, H, LOFT_Y1, LADDER_X,
    FUEL, stepToward, lightAt, applyRadio, sweepCovers, SWEEP_COST, VOICE_DRIVE_TICKS, inLoft,
} from '../src/games/FireCrew/sim.js'
import { parseRadio, radioLabel } from '../src/games/FireCrew/voiceradio.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
let passes = 0
let fails = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const runTo = (seed, cap = CLOCK + 10) => {
    const g = setSources(makeRun(seed), ['cpu', 'cpu', 'cpu'])
    let n = 0
    while (!g.done && n++ < cap) step(g, {})
    return g
}

console.log('boots')
{
    const g = makeRun(7)
    ok(g.tick === 0 && !g.done, 'a fresh run is at tick 0')
    ok(g.victims.length === 6, 'six victims on every seed', `${g.victims.length}`)
    const burning = g.cell.filter((c) => c && c.burning).length
    ok(burning >= 2, 'the alarm starts with a real fire', `${burning} cells in flames`)
    ok(g.crew.length === 3 && g.crew.every((f) => f.y >= 16), 'all three seats start on the safe street')
    const s = state(g)
    ok(['tick', 'score', 'done', 'hash', 'seed'].every((k) => k in s), 'state carries tick/score/done/hash/seed')
}

console.log('rules — fire spreads with the wind')
{
    // the law itself: downwind ignites hardest, upwind barely tries
    ok(windBias({ wind: { dir: 0, gust: 0 } }, 1, 0) > 2, 'downwind spread bias exceeds 2x')
    ok(windBias({ wind: { dir: 0, gust: 2 } }, 1, 0) > windBias({ wind: { dir: 0, gust: 0 } }, 1, 0), 'a gale pushes the front harder')
    ok(windBias({ wind: { dir: 0, gust: 0 } }, -1, 0) < 0.5, 'upwind spread is smothered')
    const src = readFileSync(path.join(HERE, '../src/games/FireCrew/sim.js'), 'utf8')
    ok(/0\.0034 \* windBias\(g, d\[0\], d\[1\]\)/.test(src), 'the spread loop actually routes through the wind law')
    // live: the wind really shifts during a shift — keep the run alive with
    // one unreachable victim so the clock cannot end the test early
    const g = makeRun(5)
    g.victims.forEach((v) => { v.state = 'rescued' })
    const stuck = g.victims[0]
    stuck.loft = false
    stuck.state = 'hidden'
    stuck.x = 2; stuck.y = 7
    for (const [hx, hy] of [[2, 7], [2, 6], [2, 8], [1, 7], [3, 7]]) {
        const c = g.cell[hy * W + hx] || (g.cell[hy * W + hx] = { fuel: 1, heat: 0 })
        c.gone = true
    }
    let changed = false
    const w0 = `${g.wind.dir}/${g.wind.gust}`
    for (let n = 0; n < 4000 && !changed && !g.done; n++) { step(g, {}); if (`${g.wind.dir}/${g.wind.gust}` !== w0) changed = true }
    ok(changed, 'wind shifts during a run')
}

console.log('rules — burned floors give way')
{
    const g = makeRun(7)
    const i = 12 * W + 12
    g.cell[i] = { fuel: 2, heat: 100, burning: true }
    for (let n = 0; n < 60 && !g.cell[i].gone; n++) step(g, {})
    ok(g.cell[i].gone, 'a fuel cell that burns out opens a hole')
    const nx = stepToward(g, 12, 11, 12, 13, false)
    ok(nx === null || !(nx.x === 12 && nx.y === 12), 'pathfinding refuses to route through the hole', JSON.stringify(nx))
}

console.log('rules — water beats fire')
{
    const g = setSources(makeRun(9), ['human', 'cpu', 'cpu'])
    const f = g.crew[0]
    // park the hose facing a hand-built fire and soak
    let target = null
    for (let n = 0; n < 600 && !target; n++) {
        step(g, {})
        for (let i = 0; i < W * H; i++) {
            const c = g.cell[i]
            const x = i % W; const y = (i / W) | 0
            if (c && c.burning && y > LOFT_Y1 && y < 14 && x > 8) { target = { x, y }; break }
        }
    }
    ok(!!target, 'there is fire to soak')
    if (target) {
        f.x = target.x; f.y = target.y + 2; f.fx = f.x; f.fy = f.y; f.face = 3; f.tank = 100
        const before = g.cell[target.y * W + target.x]
        for (let n = 0; n < 40; n++) step(g, { a: true })
        ok(!before.burning || before.heat < 100, 'spraying knocks a burning cell down', `heat ${before.heat}`)
        ok(g.doused >= 1, 'soaked cells count as doused', `${g.doused}`)
    }
}

console.log('rules — the information split')
{
    const g = makeRun(7)
    // deep store room, far from every light and not downwind of fire: dark
    const dark = !lightAt(g, 25, 13, 0) || lightAt(g, 25, 13, 0) < 0.5
    ok(dark, 'an unlit corner is genuinely dark')
    g.ladder = 1
    ok(lightAt(g, 15, 3, 3) > 0.8, 'the ladder seat sees the loft when the stick is up', `${lightAt(g, 15, 3, 3)}`)
    g.ladder = 0
    ok(lightAt(g, 15, 3, 1) < 0.5, 'the hose seat cannot see the loft', `${lightAt(g, 15, 3, 1)}`)
    g.flares.push({ x: 15, y: 10, t: 100 })
    ok(lightAt(g, 15, 6, 1) > 0.5, 'a flare punches light through the smoke')
}

console.log('rules — the loft needs the ladder')
{
    const g = makeRun(7)
    g.ladder = 0
    for (let n = 0; n < 60; n++) step(g, { up: true }) // a rescue walking up cannot clip into the loft
    ok(g.crew[1].y > LOFT_Y1, 'no loft without the stick')
}

console.log('rules — smoke drifts with the wind (#1411)')
{
    const src = readFileSync(path.join(HERE, '../src/games/FireCrew/sim.js'), 'utf8')
    ok(/advectSmoke\(g\)/.test(src), 'the step loop runs the smoke transport')
    // lab: one tough ignition mid-room, wind pinned (dir -1 = calm; next far out)
    const mkLab = (dir, gust) => {
        const g = makeRun(7)
        for (const c of g.cell) if (c) { c.burning = false; c.heat = 0; c.out = true }
        g.wind = { dir, gust, next: 1e9 }
        g.cell[13 * W + 5] = { fuel: 9000, heat: 100, burning: true, out: false }
        return g
    }
    const gale = mkLab(0, 2) // east gale — row 13 is the clear channel (the x=24 wall has its gap there)
    for (let n = 0; n < 120; n++) step(gale, {})
    ok(gale.smoke[13 * W + 5] > 0.2, 'fire seeds smoke at its source', `${gale.smoke[13 * W + 5]}`)
    ok(gale.smoke[13 * W + 9] > 0.02, 'the plume drifts downwind (east)', `${gale.smoke[13 * W + 9]}`)
    ok(gale.smoke[13 * W + 2] < gale.smoke[13 * W + 9], 'smoke is thicker downwind than upwind')
    ok(gale.smoke[13 * W + 25] > 0.05, 'a gale drives the plume across the whole floor', `${gale.smoke[13 * W + 25]}`)
    const calm = mkLab(0, 0) // same seed, no gust: same direction, slower and thinner
    for (let n = 0; n < 120; n++) step(calm, {})
    ok(calm.smoke[13 * W + 25] < 0.02, 'without the gale the plume never reaches the far wall', `${calm.smoke[13 * W + 25]}`)
    const holdGale = mkLab(-1, 2); const holdCalm = mkLab(-1, 0) // calm: decay only
    holdGale.smoke[13 * W + 5] = 0.6; holdCalm.smoke[13 * W + 5] = 0.6
    for (const c of holdGale.cell) if (c) { c.burning = false; c.heat = 0 }
    for (const c of holdCalm.cell) if (c) { c.burning = false; c.heat = 0 }
    for (let n = 0; n < 100; n++) { step(holdGale, {}); step(holdCalm, {}) }
    ok(holdGale.smoke[13 * W + 5] > holdCalm.smoke[13 * W + 5], 'a gale holds the smoke in thicker', `${holdGale.smoke[13 * W + 5]} vs ${holdCalm.smoke[13 * W + 5]}`)
    // smoke eats light — but only crew lamps and ambient, never a source
    const dim = makeRun(7)
    dim.smoke[12 * W + 20] = 1
    ok(lightAt(dim, 20, 12, 0) < lightAt(makeRun(7), 20, 12, 0), 'dense smoke deepens the dark')
    dim.crew[0].x = 20; dim.crew[0].y = 13; dim.crew[0].face = 3
    const withSmoke = lightAt(dim, 20, 12, 0)
    dim.smoke[12 * W + 20] = 0
    const clear = lightAt(dim, 20, 12, 0)
    ok(withSmoke < clear && withSmoke > 0.5, 'the hose cone still reaches through smoke, but fainter', `${withSmoke} vs ${clear}`)
    dim.smoke[12 * W + 20] = 1
    dim.flares.push({ x: 20, y: 12, t: 100 })
    ok(lightAt(dim, 20, 12, 0) > 0.9, 'a flare pierces the smoke untouched')
    dim.flares.length = 0
    dim.sweep = { side: 'east', t: 60 } // x=20 is the east half
    ok(lightAt(dim, 20, 12, 0) >= 0.6, 'the radio sweep floors light above the smoke')
}

console.log('rules — water pressure arcs with the tank (#1411)')
{
    const mkTarget = (tx, ty, tank) => {
        const g = setSources(makeRun(7), ['human', 'cpu', 'cpu'])
        for (const c of g.cell) if (c) { c.burning = false; c.heat = 0; c.out = true }
        g.cell[ty * W + tx] = { fuel: 9000, heat: 100, burning: true, out: false }
        const f = g.crew[0]
        f.x = 15; f.y = 12; f.fx = 15; f.fy = 12; f.face = 3 // facing north up the column
        f.tank = tank
        g.wind = { dir: -1, gust: 0, next: 1e9 }
        return { g, f, target: g.cell[ty * W + tx] }
    }
    const spray = (lab, tank, n) => { for (let i = 0; i < n; i++) { lab.f.tank = tank; step(lab.g, { a: true }) } }
    const full = mkTarget(15, 8, 100) // dead ahead, r = 4
    spray(full, 100, 6)
    ok(full.target.heat < 100, 'full pressure reaches four tiles out', `heat ${full.target.heat}`)
    const half = mkTarget(15, 8, 50)
    spray(half, 45, 6)
    ok(half.target.heat === 100, 'half pressure cannot reach the 4th tile', `heat ${half.target.heat}`)
    const low = mkTarget(15, 10, 8) // r = 2
    spray(low, 8, 6)
    ok(low.target.heat === 100, 'a nearly empty tank dribbles short', `heat ${low.target.heat}`)
    ok(low.target.burning, 'and the fire it cannot reach keeps burning')
    const fan = mkTarget(16, 11, 100) // beside the column — off the straight line
    spray(fan, 100, 6)
    ok(fan.target.heat < 100, 'full pressure fans wide at the nozzle', `heat ${fan.target.heat}`)
    const noFan = mkTarget(16, 11, 50)
    spray(noFan, 45, 6)
    ok(noFan.target.heat === 100, 'no fan below half pressure', `heat ${noFan.target.heat}`)
}

console.log('rules — the ladder is mobile (#1424)')
{
    // all-human lab: no autopilot, so the base law is what moves the base
    const g = setSources(makeRun(7), ['human', 'human', 'human'])
    for (const c of g.cell) if (c) { c.burning = false; c.heat = 0; c.out = true }
    g.wind = { dir: -1, gust: 0, next: 1e9 }
    g.ladder = 1
    const bx = g.ladderX
    const rf = g.crew[1]
    rf.x = bx; rf.y = LOFT_Y1; rf.fx = rf.x; rf.fy = rf.y // the rescue goes up
    for (let n = 0; n < 40; n++) step(g, {}, [{ right: true }, {}, { right: true }])
    ok(g.ladderX === bx, 'the base holds while the rescue is on the loft', `${bx} -> ${g.ladderX}`)
    ok(inLoft(rf.y), 'the rescue is still up there', `${rf.y}`)
    for (let n = 0; n < 60 && inLoft(rf.y); n++) step(g, {}, [{}, { down: true }, {}])
    ok(!inLoft(rf.y), 'the rescue comes back down through the gate', `${rf.x},${rf.y}`)
    const bx2 = g.ladderX
    for (let n = 0; n < 60; n++) step(g, {}, [{}, {}, { right: true }])
    ok(g.ladderX > bx2, 'the base follows seat 3 once the loft line is clear', `${bx2} -> ${g.ladderX}`)
    ok(!!stepToward(g, g.ladderX, LOFT_Y1 + 1, g.ladderX, LOFT_Y1, true), 'the climb gate rides the base', `x=${g.ladderX}`)
    ok(state(g).ladderX === g.ladderX, 'the state contract carries the base column')
}

console.log('rules — the ladder shaft carries water up (#1424)')
{
    const mkShaft = (ladder, hx) => {
        const g = setSources(makeRun(7), ['human', 'human', 'human'])
        for (const c of g.cell) if (c) { c.burning = false; c.heat = 0; c.out = true }
        g.wind = { dir: -1, gust: 0, next: 1e9 }
        g.ladderX = 20
        g.ladder = ladder
        const f = g.crew[0]
        f.x = hx; f.y = 9; f.fx = hx; f.fy = 9; f.face = 0 // facing east
        f.tank = 100
        // seat 3 stands under the base: the follow law holds the column put
        g.crew[2].x = 20; g.crew[2].fx = 20
        g.cell[LOFT_Y1 * W + 20] = { fuel: 9000, heat: 100, burning: true, out: false }
        return g
    }
    const soak = (g, n) => { for (let i = 0; i < n; i++) { g.crew[0].tank = 100; step(g, { a: true }) } }
    const up = mkShaft(1, 16) // column 20 is r=4 dead ahead — the stream crosses it
    soak(up, 12)
    const cu = up.cell[LOFT_Y1 * W + 20]
    ok(!cu.burning, 'the stream climbs the shaft and soaks the loft column', `heat ${cu.heat}`)
    ok(up.doused >= 1, 'a shaft-soaked cell counts as doused', `${up.doused}`)
    const down = mkShaft(0, 16)
    soak(down, 12)
    ok(down.cell[LOFT_Y1 * W + 20].burning, 'a lowered stick closes the shaft')
    const miss = mkShaft(1, 3) // column 20 is 17 tiles east — beyond any range
    soak(miss, 12)
    ok(miss.cell[LOFT_Y1 * W + 20].heat === 100, 'a stream that misses the column never touches the loft')
    // the vertical stance: standing IN the base column, aimed straight up
    const mkVert = (ladder) => {
        const g = mkShaft(ladder, 20)
        g.crew[0].face = 3 // in the column, facing up
        return g
    }
    const vert = mkVert(1)
    soak(vert, 12)
    ok(!vert.cell[LOFT_Y1 * W + 20].burning, 'a stream aimed up the base climbs the shaft', `heat ${vert.cell[LOFT_Y1 * W + 20].heat}`)
    const vertDown = mkVert(0)
    soak(vertDown, 12)
    ok(vertDown.cell[LOFT_Y1 * W + 20].burning, 'the vertical shaft closes with the stick down')
}

console.log('rules — the CPU bucket brigade douses the loft (#1424)')
{
    const g = setSources(makeRun(7), ['cpu', 'cpu', 'cpu'])
    for (const c of g.cell) if (c) { c.burning = false; c.heat = 0; c.out = true }
    g.wind = { dir: -1, gust: 0, next: 1e9 }
    g.cell[2 * W + 3] = { fuel: 9000, heat: 100, burning: true, out: false } // a lone loft fire, far from the base
    for (const v of g.victims) if (v.loft) v.state = 'rescued' // the fire is the ladder's only reason
    let n = 0
    while (!g.done && n++ < 4000 && g.cell[2 * W + 3].burning) step(g, {})
    ok(!g.cell[2 * W + 3].burning, 'the CPU douses a loft fire (the bucket brigade)', `tick ${g.tick}, heat ${g.cell[2 * W + 3].heat}`)
}

console.log('rules — the radio carries the split (#1361)')
{
    // the grammar: exact phrasings a crew would shout, and the honesty floor
    ok(JSON.stringify(parseRadio('victim on the left')) === JSON.stringify({ kind: 'spot', side: 'west' }), '"victim on the left" is a west spot call')
    ok(JSON.stringify(parseRadio('there is a person by the west crates')) === JSON.stringify({ kind: 'spot', side: 'west' }), 'a longer west spot call parses')
    ok(JSON.stringify(parseRadio("someone's trapped up there")) === JSON.stringify({ kind: 'spot', side: 'loft' }), '"up there" is the loft')
    ok(JSON.stringify(parseRadio('body in the back room')) === JSON.stringify({ kind: 'spot', side: 'back' }), 'a back spot call parses')
    ok(JSON.stringify(parseRadio('a man by the door')) === JSON.stringify({ kind: 'spot', side: 'front' }), 'a front spot call parses')
    ok(JSON.stringify(parseRadio('I see a body')) === JSON.stringify({ kind: 'spot', side: 'all' }), 'a spot call with no side sweeps everything')
    ok(JSON.stringify(parseRadio('ladder up')) === JSON.stringify({ kind: 'ladder', dir: 'up' }), '"ladder up" parses')
    ok(JSON.stringify(parseRadio('bring the ladder down')) === JSON.stringify({ kind: 'ladder', dir: 'down' }), '"bring the ladder down" parses')
    ok(JSON.stringify(parseRadio('hold the ladder')) === JSON.stringify({ kind: 'ladder', dir: 'brace' }), '"hold the ladder" is a brace, never a hold')
    ok(JSON.stringify(parseRadio('hold')) === JSON.stringify({ kind: 'hold' }), 'a bare "hold" stands the seat down')
    ok(parseRadio('fire on the left') === null, 'fire is visible — it is never the call')
    ok(parseRadio('the wind smells funny') === null, 'chatter is no call')
    ok(radioLabel({ kind: 'spot', side: 'west' }) === 'VICTIM WEST', 'the HUD label is short and unmistakable')

    // the honesty law: a shout is a flashlight sweep through the SAME light
    // rule that finds victims — it costs battery and cannot beat the dark
    const g = setSources(makeRun(7), ['human', 'cpu', 'cpu'])
    const v = g.victims.find((x) => !x.loft && x.state === 'hidden')
    v.x = 3; v.y = 12 // a dark corner (0.08) on the west side
    ok(lightAt(g, 3, 12, 0) < 0.5, 'the test corner is genuinely dark')
    g.crew[0].battery = 0
    const dead = applyRadio(g, { kind: 'spot', side: 'west' })
    ok(!dead.ok && dead.why === 'LIGHT DEAD', 'a sweep costs battery — dead light is refused')
    g.crew[0].battery = 100
    const armed = applyRadio(g, { kind: 'spot', side: 'west' })
    ok(armed.ok && g.sweep && g.sweep.side === 'west', 'a spot call arms the flashlight sweep')
    ok(g.crew[0].battery === 100 - SWEEP_COST, 'the sweep spends the hose seat\'s battery', `${g.crew[0].battery}`)
    ok(lightAt(g, 3, 12, 0) >= 0.6, 'the sweep lights the named side')
    ok(lightAt(g, 26, 12, 0) < 0.6, 'the far side stays dark')
    for (let n = 0; n < 30 && v.state !== 'found'; n++) step(g, {})
    ok(v.state === 'found', 'the sweep finds the victim through the same light rule')

    const g2 = setSources(makeRun(7), ['human', 'cpu', 'cpu'])
    const v2 = g2.victims.find((x) => !x.loft && x.state === 'hidden')
    v2.x = 2; v2.y = 13
    g2.crew[0].battery = 100
    applyRadio(g2, { kind: 'spot', side: 'east' })
    for (let n = 0; n < 30; n++) step(g2, {})
    ok(v2.state === 'hidden', 'a sweep of the wrong side delivers nothing')
    ok(!sweepCovers('east', 2, 13) && sweepCovers('west', 2, 13), 'sweepCovers only covers the named side')

    // ladder and hold calls drive the CPU seats through their pads
    const g3 = setSources(makeRun(7), ['human', 'cpu', 'cpu'])
    for (const x of g3.victims) { x.loft = false; if (x.y <= LOFT_Y1) x.y = 12 } // nothing above: autopilot would lower
    g3.ladder = 0.5
    applyRadio(g3, { kind: 'ladder', dir: 'up' })
    step(g3, {})
    ok(g3.ladder > 0.5, 'a "ladder up" call drives the CPU ladder seat up', `${g3.ladder}`)
    for (let n = 0; n < VOICE_DRIVE_TICKS + 1 && !g3.done; n++) step(g3, {})
    ok(!g3.voiceLadder, 'the call wears off after its ticks')

    const g4 = setSources(makeRun(7), ['human', 'cpu', 'cpu'])
    for (let n = 0; n < 200 && !g4.done; n++) step(g4, {})
    const p0 = `${g4.crew[1].x},${g4.crew[1].y}`
    applyRadio(g4, { kind: 'hold' })
    for (let n = 0; n < 30 && !g4.done; n++) step(g4, {})
    ok(`${g4.crew[1].x},${g4.crew[1].y}` === p0 || !!g4.crew[1].carrying, 'a "hold" call stands the rescue seat down', p0)
}

console.log('wins')
{
    let wins = 0; const detail = []
    for (const seed of [1, 2, 3, 42, 777, 2026, 31337, 424242, 5150, 90210]) {
        const g = runTo(seed)
        if (g.rescued === 6) wins++
        detail.push(`${seed}:${g.rescued}/6`)
    }
    ok(wins >= 8, 'the autopilot rescues all six on at least 8/10 seeds', detail.join(' '))
}

console.log('determinism')
{
    const a = runTo(1234)
    const b = runTo(1234)
    ok(state(a).hash === state(b).hash && state(a).tick === state(b).tick, 'seed + autopilot replay identical')
    const rngA = mulberry32(7)(); const rngB = mulberry32(7)()
    ok(rngA === rngB, 'mulberry32 is deterministic per seed')
    let spread = 0
    const r = mulberry32(3)
    for (let i = 0; i < 500; i++) { const v = r(); if (v < 0 || v >= 1) spread++ }
    ok(spread === 0, 'rng stays in [0,1)')
}

console.log('the clock ends every shift')
{
    const g = makeRun(4242)
    let n = 0
    while (!g.done && n++ < CLOCK + 100) step(g, {})
    ok(g.done, 'no run exceeds the structure clock', `tick ${g.tick}`)
}

console.log('roster + registry wiring')
{
    const cc = readFileSync(path.join(HERE, 'lib/contractGames.mjs'), 'utf8')
    ok(/\{ id: 'fire-crew', path: '\/fire-crew' \}/.test(cc), 'contractGames lists fire-crew')
    ok(/'fire-crew': \(i\) =>/.test(cc), 'contractGames drives fire-crew')
    const nb = readFileSync(path.join(HERE, 'nightlybot.mjs'), 'utf8')
    ok(/\{ id: 'fire-crew', path: '\/fire-crew' \}/.test(nb), 'nightlybot soaks fire-crew')
    const cfg = readFileSync(path.join(HERE, '../src/config/games.js'), 'utf8')
    ok(/path: '\/fire-crew'/.test(cfg) && /label: 'FIRE CREW'/.test(cfg), 'registry routes /fire-crew')
    ok(/visibility: 'private'/.test(cfg.slice(cfg.indexOf(`path: '/fire-crew'`)).slice(0, 400)), 'registered private (#379)')
    const ac = readFileSync(path.join(HERE, 'attractcheck.mjs'), 'utf8')
    ok(/label: 'FIRE CREW'/.test(ac), 'attractcheck audits the attract')
    const idx = readFileSync(path.join(HERE, '../src/games/FireCrew/index.jsx'), 'utf8')
    ok(idx.includes('<AttractMessage className="mb-6 text-orange-100/80" messages={MESSAGES} />'), 'attract slot anchor present')
    ok(/id: 'fire-crew'/.test(idx), 'the contract id is wired in the shell')
    // radio wiring (#1361): consent before any mic, the mic never auto-asks
    ok(/import \{ parseRadio \} from '\.\/voiceradio\.js'/.test(idx), 'the shell parses radio calls')
    ok(/KeyV/.test(idx), 'the radio toggles on V')
    ok(idx.includes('askVoiceConsent') && idx.includes('startSpeechListen'), 'consent is asked before the mic opens')
    ok(idx.includes('createVoiceSession') && idx.includes('voiceExtra'), 'the raw mic track rides the recording')
    ok(idx.includes('recordVoiceCmd'), 'every spoken call banks into the recording')
    const sim = readFileSync(path.join(HERE, '../src/games/FireCrew/sim.js'), 'utf8')
    ok(/export function applyRadio/.test(sim), 'the sim owns the radio entry point')
    ok(/export const sweepCovers/.test(sim) && /g\.sweep && g\.sweep\.t > 0/.test(sim), 'the sweep rides the lightAt rule')
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
