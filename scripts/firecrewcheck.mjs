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
    FUEL, stepToward, lightAt, applyRadio, sweepCovers, SWEEP_COST, VOICE_DRIVE_TICKS,
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
