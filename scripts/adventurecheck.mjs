// adventurecheck — ADVENTURE (#1473 seedpin batch 18) in plain Node.
// Pre-port, the dragon/bat dice ran off Math.random, there was no seed, no
// report, no contract, no score — and the castles' solid-top walls (a
// full-width top wall with the gate rect as EXTRA collision) made the foyers
// permanently unreachable, so carrying the chalice home was provably
// impossible. This gate pins what is true now: one seeded stream at every
// human start (?seed=N replays the world), the openable-gate law (park the
// matching key in front of its gate), the bridge wall-pass, dragon law
// (chase/bite/slay/flee), honest terminals — and a scripted run that
// actually carries the chalice to the Gold Castle.
// `--mutant` re-plants pre-port bugs; every mutant MUST turn something red.
//
//   npm run adventurecheck
//   npm run adventurecheck -- --mutant

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createSim, ROOMS, R, GW, GH, PLAYER_SPEED, MAX_ITEMS } from '../src/games/Adventure/sim.js'
import { seedRng } from '../src/utils/gameContract.js'
import { plant, pull } from './lib/mutateguard.mjs'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const S = PLAYER_SPEED
const IDX = new URL('../src/games/Adventure/index.jsx', import.meta.url)
const SIMF = new URL('../src/games/Adventure/sim.js', import.meta.url)
const step = (sim, inp) => { sim.step(inp); sim.events.length = 0 }

// ------------------------------------------------------------ determinism ----
console.log('seeded world: dragons and the bat replay off one stream')
const hash = (s) => JSON.stringify([
    s.tick, s.score, s.won, s.dead, s.room, s.carrying,
    s.player.x.toFixed(4), s.player.y.toFixed(4),
    s.dragons.map((d) => `${d.x.toFixed(4)}/${d.y.toFixed(4)}/${d.mouthOpen ? 1 : 0}`),
    s.bat.x.toFixed(4), s.bat.y.toFixed(4), s.bat.vx.toFixed(4),
])
const stream = (sd, n) => {
    const s = createSim(seedRng(sd))
    const out = []
    for (let i = 0; i < n; i++) { step(s, {}); out.push(hash(s)) }
    return out.join(';')
}
ok(stream(4242, 400) === stream(4242, 400), 'same seed → identical 400-tick world script')
ok(stream(4242, 400) !== stream(4243, 400), 'different seed → different world script')
ok(hash(createSim(seedRng(9))) === hash(createSim(seedRng(9))), 'two fresh sims of one seed are identical (no hidden state)')

// ------------------------------------------------------------------ law ------
console.log('fresh run: the 1993 starting layout')
{
    const s = createSim(seedRng(1))
    ok(s.room === R.GOLD_CASTLE && s.player.x === 80 && s.player.y === 150, 'starts outside the Gold Castle')
    ok(s.items.length === MAX_ITEMS && s.dragons.length === 3, `${MAX_ITEMS} items and 3 dragons in the world`)
    ok(s.bat.room === R.OVERWORLD_3, 'the bat starts in the overworld')
    ok(s.score === 0 && !s.won && !s.dead && s.tick === 0, 'clean report: score 0, alive, tick 0')
    ok(ROOMS[R.GOLD_CASTLE].gate && ROOMS[R.BLACK_CASTLE].gate && ROOMS[R.WHITE_CASTLE].gate,
        'the three castles carry gates')
    ok(!ROOMS[R.GOLD_CASTLE].walls.some((w) => w.y === 0 && w.w === GW),
        'castle tops are GAPS, not full-width solids (b18 fix — solid tops locked the foyers forever)')
}

console.log('items: pickup, drop, and the once-per-run score')
{
    const s = createSim(seedRng(7))
    // goldKey is loose in OVERWORLD_4; walk the player onto it
    s.room = R.OVERWORLD_4; s.player.x = 120; s.player.y = 84
    step(s, {})
    ok(s.carrying === 'goldKey' && s.score === 1, 'touching an item picks it up and scores the first distinct item')
    step(s, { drop: true })
    ok(s.carrying === null && s.items.find((i) => i.id === 'goldKey').room === R.OVERWORLD_4,
        'Space drops the item in the current room')
    step(s, { dx: 0, dy: S }); step(s, { dx: 0, dy: S }) // walk back onto it
    ok(s.carrying === 'goldKey' && s.score === 1, 're-picking the SAME item does not score twice')
    s.room = R.OVERWORLD_2; s.player.x = 100; s.player.y = 80
    step(s, {})
    ok(s.carrying === 'goldKey' && s.score === 1, 'a second item is unreachable while the slot is full')
    ok(s.score <= MAX_ITEMS, `score can never exceed ${MAX_ITEMS}`, `${s.score}`)
}

console.log('bridge: the wall-pass, and the foyer floor it unlocks')
{
    const no = createSim(seedRng(3))
    no.room = R.BLACK_FOYER; no.player.x = 80; no.player.y = 178
    for (let i = 0; i < 120; i++) step(no, { dx: 0, dy: S })
    ok(no.room === R.BLACK_FOYER && no.player.y <= 178.5, 'without the bridge the foyer floor is stone')

    const br = createSim(seedRng(3))
    br.room = R.BLACK_FOYER; br.player.x = 80; br.player.y = 178
    br.carrying = 'bridge'
    br.items.find((i) => i.id === 'bridge').carried = true
    for (let i = 0; i < 120 && br.room !== R.RED_LAB_1; i++) step(br, { dx: 0, dy: S })
    ok(br.room === R.RED_LAB_1, 'carrying the bridge, pushing down crosses the solid floor into the Red Maze')
}

console.log('gates: park the key in front of its gate')
{
    const s = createSim(seedRng(5))
    s.room = R.BLACK_CASTLE; s.player.x = 80; s.player.y = 32
    for (let i = 0; i < 40; i++) step(s, { dx: 0, dy: -S })
    ok(s.room === R.BLACK_CASTLE, 'a closed gate stays shut even when pushing at the gap')
    s.items.find((i) => i.id === 'blackKey').room = R.BLACK_CASTLE
    s.items.find((i) => i.id === 'blackKey').x = 80
    s.items.find((i) => i.id === 'blackKey').y = 50
    step(s, {})
    ok(s.gateOpen.blackKey, 'the black key lying in front of the black gate opens it')
    const far = createSim(seedRng(5))
    far.items.find((i) => i.id === 'blackKey').y = 90 // in the castle but below the gate zone
    far.items.find((i) => i.id === 'blackKey').room = R.BLACK_CASTLE
    step(far, {})
    ok(!far.gateOpen.blackKey, 'a key parked OUTSIDE the gate zone does not open it')
}

console.log('dragons: bite kills, sword slays, gold key repels Yorgle')
{
    const s = createSim(seedRng(11))
    const yorgle = s.dragons.find((d) => d.id === 'yorgle')
    s.room = yorgle.room; s.player.x = yorgle.x + 3; s.player.y = yorgle.y
    yorgle.mouthOpen = true
    step(s, {})
    ok(s.dead && s.deathTimer === 120, 'a bite with the mouth open kills the player')
    for (let i = 0; i < 130; i++) step(s, {})
    ok(s.dead && s.deathTimer <= 0, 'the death timer expires into the honest SLAIN terminal')
    for (let i = 0; i < 10; i++) step(s, {})
    ok(s.tick >= 0, 'terminal freezes the sim (no further ticks)')
    const t0 = s.tick
    step(s, { dx: S })
    ok(s.tick === t0, 'input at the terminal does not resume the dead world')

    const slay = createSim(seedRng(11))
    const g = slay.dragons.find((d) => d.id === 'grundle')
    slay.room = g.room; slay.player.x = g.x + 5; slay.player.y = g.y
    slay.carrying = 'sword'
    step(slay, {})
    ok(!g.alive, 'the sword slays a dragon within reach')
    ok(slay.dragons.every((d) => d.x >= 10 && d.x <= GW - 20 && d.y >= 10 && d.y <= GH - 20),
        'dragons stay clamped inside their rooms')

    const flee = createSim(seedRng(11))
    const y = flee.dragons.find((d) => d.id === 'yorgle')
    flee.room = y.room
    flee.player.x = y.x + 40; flee.player.y = y.y
    const x0 = y.x
    flee.carrying = 'goldKey'
    step(flee, {})
    ok(y.x < x0, 'Yorgle flees the carried gold key')
}

console.log('win: the chalice home to the Gold Castle')
{
    // ---- the scripted route (mirrors the BFS solution of the fixed map) ----
    function driveTo(sim, tx, ty, stop = 1.2) {
        const p = sim.player
        for (let i = 0; i < 5000; i++) {
            const ddx = tx - p.x, ddy = ty - p.y
            if (Math.abs(ddx) <= stop && Math.abs(ddy) <= stop) return true
            const r0 = sim.room
            const ux = Math.sign(ddx) * S, uy = Math.sign(ddy) * S
            const attempt = (dx, dy) => {
                const px = p.x, py = p.y
                step(sim, { dx, dy })
                if (sim.room !== r0) return true
                return Math.abs(p.x - px) > 0.01 || Math.abs(p.y - py) > 0.01
            }
            let moved = false
            if (Math.abs(ddx) > stop && Math.abs(ddy) > stop) moved = attempt(ux, uy) || attempt(ux, 0) || attempt(0, uy)
            else if (Math.abs(ddx) > stop) moved = attempt(ux, 0)
            else moved = attempt(0, uy)
            if (!moved) return false
            if (sim.dead || sim.won) return false
        }
        return false
    }
    const cross = (sim, dir, want, maxTicks = 400) => {
        const v = { up: [0, -S], down: [0, S], left: [-S, 0], right: [S, 0] }[dir]
        for (let i = 0; i < maxTicks && sim.room !== want && !sim.won; i++) step(sim, { dx: v[0], dy: v[1] })
        return sim.room === want
    }
    function winRun(seed) {
        const sim = createSim(seedRng(seed))
        const T = (tx, ty) => driveTo(sim, tx, ty)
        // trip 1: blackKey into front of the black gate
        sim.player.x = 80
        if (!cross(sim, 'down', R.OVERWORLD_1)) return { ok: false, why: 'castle exit' }
        if (!cross(sim, 'down', R.OVERWORLD_2)) return { ok: false, why: 'ow2' }
        sim.player.y = 90
        if (!cross(sim, 'left', R.BLUE_LAB_1)) return { ok: false, why: 'lab1a' }
        if (!T(140, 90) || !T(140, 170) || !T(80, 170)) return { ok: false, why: 'lab1 descent' }
        if (!cross(sim, 'down', R.BLUE_LAB_2)) return { ok: false, why: 'lab2' }
        T(76, 92)
        if (sim.carrying !== 'blackKey') return { ok: false, why: 'no blackKey' }
        T(80, 16)
        if (!cross(sim, 'up', R.BLUE_LAB_1)) return { ok: false, why: 'lab1b' }
        if (!T(140, 168) || !T(140, 44) || !T(110, 16) || !T(80, 16)) return { ok: false, why: 'lab1 climb' }
        if (!cross(sim, 'up', R.OVERWORLD_2)) return { ok: false, why: 'ow2b' }
        sim.player.y = 90
        if (!cross(sim, 'right', R.OVERWORLD_4)) return { ok: false, why: 'ow4' }
        sim.player.x = 80
        if (!cross(sim, 'down', R.OVERWORLD_3)) return { ok: false, why: 'ow3' }
        if (!cross(sim, 'down', R.BLACK_CASTLE)) return { ok: false, why: 'castleB' }
        sim.player.x = 80; sim.player.y = 32
        step(sim, { drop: true })
        for (let i = 0; i < 3 && !sim.gateOpen.blackKey; i++) step(sim, {})
        if (!sim.gateOpen.blackKey) return { ok: false, why: 'gateB' }
        if (!T(65, 24)) return { ok: false, why: 'key dodge' }
        // trip 2: bridge through the black foyer floor, stash it, take the white key
        if (!cross(sim, 'down', R.OVERWORLD_3)) return { ok: false, why: 'castleB out' }
        if (!cross(sim, 'up', R.OVERWORLD_2)) return { ok: false, why: 'ow2c' }
        sim.player.y = 70; sim.player.x = 95
        T(96, 76)
        if (sim.carrying !== 'bridge') return { ok: false, why: 'no bridge' }
        sim.player.y = 90
        if (!cross(sim, 'down', R.OVERWORLD_3)) return { ok: false, why: 'ow3c' }
        if (!cross(sim, 'down', R.BLACK_CASTLE)) return { ok: false, why: 'castleB2' }
        if (!cross(sim, 'up', R.BLACK_FOYER)) return { ok: false, why: 'foyerB' }
        if (!cross(sim, 'down', R.RED_LAB_1)) return { ok: false, why: 'red floor' }
        if (!T(140, 12)) return { ok: false, why: 'red enter' }
        if (!T(140, 86)) return { ok: false, why: 'red right column' }
        step(sim, { drop: true })                       // bridge parks in the corner for good
        if (sim.carrying !== null) return { ok: false, why: 'bridge drop failed' }
        if (!T(66, 86)) return { ok: false, why: 'red lower corridor' }
        if (sim.carrying !== 'whiteKey') return { ok: false, why: 'no whiteKey' }
        if (!T(140, 86)) return { ok: false, why: 'red lower right' }
        if (!T(140, 12)) return { ok: false, why: 'red right column up' }
        if (!T(80, 12)) return { ok: false, why: 'red top exit' }
        if (!cross(sim, 'up', R.BLACK_FOYER)) return { ok: false, why: 'foyer out red' }
        if (!T(65, 24)) return { ok: false, why: 'key dodge 2' }
        // trip 3: white key to its gate, chalice, and the ride home
        if (!cross(sim, 'up', R.BLACK_CASTLE)) return { ok: false, why: 'castleB3' }
        sim.player.y = 150
        if (!cross(sim, 'down', R.OVERWORLD_3)) return { ok: false, why: 'ow3b' }
        sim.player.y = 90
        if (!cross(sim, 'right', R.OVERWORLD_4)) return { ok: false, why: 'ow4b' }
        sim.player.y = 90
        if (!cross(sim, 'right', R.WHITE_CASTLE)) return { ok: false, why: 'castleW' }
        sim.player.x = 80; sim.player.y = 32
        step(sim, { drop: true })
        for (let i = 0; i < 3 && !sim.gateOpen.whiteKey; i++) step(sim, {})
        if (!sim.gateOpen.whiteKey) return { ok: false, why: 'gateW' }
        if (!cross(sim, 'up', R.WHITE_FOYER)) return { ok: false, why: 'foyerW' }
        T(80, 88)
        if (sim.carrying !== 'chalice') return { ok: false, why: 'no chalice' }
        T(80, 12)
        if (!cross(sim, 'up', R.WHITE_CASTLE)) return { ok: false, why: 'castleW out' }
        sim.player.y = 150
        if (!cross(sim, 'down', R.OVERWORLD_4)) return { ok: false, why: 'ow4 home' }
        sim.player.x = 80
        if (!cross(sim, 'up', R.OVERWORLD_1)) return { ok: false, why: 'ow1 home' }
        for (let i = 0; i < 200 && !sim.won; i++) step(sim, { dx: 0, dy: -S })
        return sim.won
            ? { ok: true, tick: sim.tick, score: sim.score }
            : { ok: false, why: `end room=${sim.room} carry=${sim.carrying} dead=${sim.dead}` }
    }

    let wins = 0
    let first = null
    const why = {}
    for (let sd = 1; sd <= 10; sd++) {
        const r = winRun(sd)
        if (r.ok) { wins++; if (!first) first = r } else { why[r.why] = (why[r.why] || 0) + 1 }
    }
    ok(wins === 10, 'scripted chalice run wins on 10/10 seeds', JSON.stringify(why))
    ok(first && first.score === 4, 'the winning run collected exactly bridge+black+white+chalice (score 4)',
        `${first && first.score}`)
    const a = winRun(42), b = winRun(42)
    ok(a.ok && b.ok && a.tick === b.tick, 'a pinned seed wins at the identical tick every time',
        `${a.tick} vs ${b.tick}`)

    const won = createSim(seedRng(42))
    won.room = R.GOLD_CASTLE; won.carrying = 'chalice'
    step(won, {})
    ok(won.won, 'chalice + Gold Castle room = YOU WON')
    const t0 = won.tick
    step(won, { dx: S })
    ok(won.tick === t0, 'the win terminal freezes the sim')
}

// ------------------------------------------------------------- static law ----
console.log('#1473 wiring: report + pin + contract (static)')
{
    const src = readFileSync(IDX, 'utf8')
    ok(/exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{[\s\S]*?\btick:[\s\S]*?\bscore:[\s\S]*?\bdone:[\s\S]*?\bseed:/.test(src),
        'production report carries {tick,score,done,seed}')
    ok(/seedFromQuery\s*\(/.test(src), 'human start consumes seedFromQuery (pin law)')
    ok(/exposeGame\(\{[\s\S]*?id:\s*'adventure'/.test(src), 'exposeGame registers id "adventure"')
    ok(/unexposeGame\(\)[\s\S]*unexposeFeedbackState\(\)/.test(src), 'cleanup un-exposes game + feedback')
    ok(/pointerdown/.test(src), 'canvas pointerdown starts/restarts (phone parity)')
    const simSrc = readFileSync(SIMF, 'utf8')
    const stripped = simSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    ok(!/Math\.random/.test(stripped), 'sim.js is entropy-free — every dice roll runs through the injected stream')
    const idxCode = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    const randomLines = idxCode.split('\n').filter((l) => l.includes('Math.random'))
    ok(randomLines.length === 1 && /seedFromQuery/.test(randomLines[0]),
        'index.jsx keeps exactly one Math.random — the un-pinned seed roll itself', randomLines.join(' ~ '))
}

console.log('attract mode: fixed stream, never pollutes the pinned run')
{
    const src = readFileSync(IDX, 'utf8')
    ok(/const attractRand = seedRng\(\d+\)/.test(src), 'attract wander runs on its own fixed stream')
}

// --------------------------------------------------------------- mutants -----
if (process.argv.includes('--mutant')) {
    console.log('\nmutants (each MUST turn the suite red)')
    const I = IDX.pathname
    const SM = SIMF.pathname
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)', I,
            `: (seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000))`,
            `: Math.floor(Math.random() * 1000000)`],
        ['production report drops the seed', I,
            `            seed: seed,
            room: sim.room,`,
            `            room: sim.room,`],
        ['the chalice win condition is deleted (pre-port dead terminal)', SM,
            `if (sim.room === R.GOLD_CASTLE && sim.carrying === 'chalice') {`,
            `if (false) {`],
        ['castle top re-solidifies (the foyer-lock bug returns)', SM,
            `{ id: R.WHITE_CASTLE, name: 'White Castle', bg: '#c0c0c0', walls: makeWalls(true, true, false, false)`,
            `{ id: R.WHITE_CASTLE, name: 'White Castle', bg: '#c0c0c0', walls: makeWalls(false, true, false, false)`],
        ['score counts duplicate pickups (progress metric inflated)', SM,
            `if (!sim.pickedUp[item.id]) {`,
            `if (true) {`],
        ['the dragon bite is deleted (pre-port invincibility)', SM,
            `if (dist < 8 && dragon.mouthOpen) {`,
            `if (false) {`],
        ['the bridge is just decoration (wall-pass removed)', SM,
            `player.x += dx * 0.3  // partial wall pass
            player.y += dy * 0.3`,
            `player.x += 0  // no pass
            player.y += 0`],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/adventurecheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else ok(false, `mutant dies: ${name}`, 'child passed despite the bug')
        pull(file)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
