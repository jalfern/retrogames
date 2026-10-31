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
    FUEL, stepToward, lightAt,
} from '../src/games/FireCrew/sim.js'

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
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
