// kongcheck — DONKEY KONG (#1637 batch 27) in plain Node.
// The girder physics, ladder dives, crush deaths, barrel-jump points and the
// top-platform win were closure locals in index.jsx — unprovable without a
// browser. sim.js lifted them verbatim; this gate pins what is true now: one
// seeded stream (?seed=N replays the barrel pattern), the seven-girder level
// with dead broken ladders, the arcade's random ladder dive, the 100-point
// barrel arc, the 1000-point lap, the terminal — and the WATCH route: 24 seeds
// of seated play that zigzag the girders, arc the barrels, win, and (almost
// always) never die. `--mutant` re-plants the pre-lift failures and the seat
// rot; every mutant MUST turn something red.
//
//   npm run kongcheck
//   npm run kongcheck -- --mutant

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { START_LIVES, WIN_SCORE, BARREL_SPEED, makeRun, tickDonkeyKong, watchStep, stateHash, rnd, getPlatformY, buildLevel } from '../src/games/DonkeyKong/sim.js'
import { seedRng, seedFromQuery } from '../src/utils/gameContract.js'
import { plant, pull } from './lib/mutateguard.mjs'

const SIM = readFileSync('src/games/DonkeyKong/sim.js', 'utf8')
const IDX = readFileSync('src/games/DonkeyKong/index.jsx', 'utf8')
const REG = readFileSync('src/config/games.js', 'utf8')

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ------------------------------------------------------------- seeded dice ----
console.log('seeded stream: the dice live inside gs')
{
    ok(seedFromQuery('?seed=777') === 777, '?seed=N parses for the pin')
    const a = makeRun(4242), b = makeRun(4242)
    const sa = [], sb = []
    for (let i = 0; i < 200; i++) { sa.push(rnd(a)); sb.push(rnd(b)) }
    ok(sa.join() === sb.join(), 'same seed → identical 200-draw stream')
    const c = makeRun(4243)
    ok(rnd(c) !== sa[0], 'different seed → different stream')
    // b16 law: the in-gs stream matches the shipped seedRng step-for-step.
    const outer = seedRng(31337)
    const inner = makeRun(31337)
    let stepEq = true
    for (let i = 0; i < 100; i++) if (Math.abs(outer() - rnd(inner)) > 1e-12) stepEq = false
    ok(stepEq, 'rnd(gs) is step-identical to seedRng(seed) (#1473 replay holds)')
    ok(!/\bMath\.random\b/.test(SIM), 'the sim draws no dice outside the stream (b25 law)')
    ok(/watching \? watchStep\(gs\)/.test(SIM), 'the seat drives the sim through watchStep, not a bench script')
}

// ----------------------------------------------------------- level geometry ----
console.log('the site: seven girders, dead broken ladders')
{
    const { platforms, ladders } = buildLevel()
    ok(platforms.length === 7, 'seven girders (ground to her platform)', `${platforms.length}`)
    ok(platforms.some(p => p.slope > 0) && platforms.some(p => p.slope < 0), 'girders slope both ways (barrels roll down-hill)')
    const broken = ladders.filter(l => l.broken)
    ok(broken.length === 4, 'four broken ladders flicker as bait', `${broken.length}`)
    // A human standing at a broken ladder mouth who presses UP does not mount.
    const gs = makeRun(11)
    gs.attract = false
    const b0 = broken[0] // x=120 between ground and girder 1
    gs.player.x = b0.x - gs.player.w / 2
    gs.player.y = b0.yBot - gs.player.h
    gs.player.grounded = true
    tickDonkeyKong(gs, { up: true })
    ok(!gs.player.climbing, 'broken ladders never mount (they only flicker)')
    // The route ladder does mount and delivers to the girder above. Mounting
    // means standing ON the lower girder at the ladder x (feet on its surface)
    // and holding UP — the runner climbs out and snaps onto the girder above.
    const gs2 = makeRun(11)
    gs2.attract = false
    const l = gs2.ladders.find(la => la.x === 180 && !la.broken)
    gs2.player.x = l.x - gs2.player.w / 2
    gs2.player.y = l.yBot - gs2.player.h // standing on the ground floor at the ladder
    gs2.player.grounded = true
    let climbed = false, arrived = false
    for (let i = 0; i < 90; i++) {
        tickDonkeyKong(gs2, { up: !arrived })
        if (gs2.player.climbing) climbed = true
        if (climbed && !gs2.player.climbing && gs2.player.grounded && gs2.player.y < 216) arrived = true
    }
    const surf = getPlatformY(gs2.platforms[1], l.x)
    ok(climbed && arrived && Math.abs(gs2.player.y + gs2.player.h - surf) <= 2,
        'a held UP at the ladder foot climbs and snaps onto the girder above',
        `y=${gs2.player.y.toFixed(1)} surf=${surf.toFixed(1)}`)
}

// ------------------------------------------------------------- core physics ----
console.log('rules: gravity, jump, crush, dive, arc, lap, terminal')
{
    // Jump: full grounded hop returns to the girder. The test stands in the
    // right-hand pocket (x>208) — everywhere else the 40 px arc reaches girder
    // 1 from the ground (that is why jump candidates stay barrel-gated: the
    // arcade doctrine forbids kangarooing the tower, the physics does not).
    const gs = makeRun(7)
    gs.attract = false
    gs.player.x = 213
    tickDonkeyKong(gs, null) // settle grounded
    const y0 = gs.player.y
    ok(gs.player.grounded, 'ground floor holds the runner at the start')
    const evJ = tickDonkeyKong(gs, { jump: true })
    ok(evJ.jump && gs.player.vy < 0, 'Space launches an arc')
    let landed = -1
    for (let i = 1; i < 90; i++) {
        const ev = tickDonkeyKong(gs, null)
        if (ev.jump) ok(false, 'jump must require the ground', `re-jump at +${i}`)
        if (gs.player.grounded) { landed = i; break }
    }
    ok(landed > 10 && landed < 60, `the arc lands (~${landed} ticks) back on the girder`)
    ok(Math.abs(gs.player.y - y0) <= 4, 'the hop returns to the same surface', `y0=${y0} y=${gs.player.y}`)

    // Crush death: a barrel on the chest kills; 90-tick animation costs a life.
    // Contact offset ~4 px: inside the arcade kill box (|dx|<8,|dy|<10), well
    // outside any shrunk-box mutant's "safe" center.
    const d = makeRun(7)
    d.attract = false
    tickDonkeyKong(d, null)
    d.barrels.push({ x: d.player.x + 5, y: d.player.y - 3, w: 10, h: 10, vx: 0, vy: 0, rot: 0, onLadder: false, falling: false })
    const evD = tickDonkeyKong(d, null)
    ok(evD.died && d.deathTimer === 90 && d.lives === START_LIVES, 'contact with a barrel kills (90-tick animation before the life is spent)')
    for (let i = 0; i < 95; i++) tickDonkeyKong(d, null)
    ok(d.lives === START_LIVES - 1 && d.barrels.length === 0, 'the life is spent and the board is cleared for the retry')
    // Terminal at zero lives.
    const t = makeRun(7)
    t.attract = false
    t.lives = 1
    tickDonkeyKong(t, null)
    t.barrels.push({ x: t.player.x + 5, y: t.player.y - 3, w: 10, h: 10, vx: 0, vy: 0, rot: 0, onLadder: false, falling: false })
    tickDonkeyKong(t, null)
    for (let i = 0; i < 95; i++) if (tickDonkeyKong(t, null).over) break
    ok(t.over && t.lives === 0, 'the run reaches an honest terminal at 0 lives')

    // Barrels: none before the first throw; then a steady 150–250 tick rhythm
    // and down-hill rolls; ladders take divers.
    const s = makeRun(99)
    s.attract = false
    let firstBarrel = -1, spawns = 0, dives = 0, maxSeen = 0
    for (let i = 0; i < 3000; i++) {
        const ev = tickDonkeyKong(s, null)
        if (ev.barrel && firstBarrel < 0) firstBarrel = i
        if (ev.barrel) spawns++
        for (const b of s.barrels) if (b.onLadder) dives++
        maxSeen = Math.max(maxSeen, s.barrels.length)
    }
    ok(firstBarrel >= 179 && firstBarrel <= 181, `the first barrel ships on the 180-tick fuse`, `${firstBarrel}`)
    ok(spawns >= 14 && spawns <= 21, `the die spaces throws 150–250 ticks (got ${spawns} in 3000)`)
    ok(maxSeen >= 2, 'the field stacks barrels (throws outpace exits)')
    ok(dives > 0, 'a rolled barrel eventually takes a ladder down (35% dive)', `dives=${dives}`)
    ok(s.barrels.every(b => Math.abs(b.vx) <= BARREL_SPEED + 1e-9), 'no barrel outruns the arcade roll speed')

    // Barrel arc: leap a rolling barrel from the ground floor → +100. The
    // jump must fire while it is 8–14 px out on the near side: closer and the
    // kill box (|dx|<8) catches the takeoff, farther and the arc lands on its
    // path. Spawned left of the runner (the right edge is off the map).
    const g2 = makeRun(505)
    g2.attract = false
    g2.player.x = 213 // open pocket: the arc returns to the ground here
    tickDonkeyKong(g2, null)
    g2.barrels.push({ x: g2.player.x - 30, y: 232 - 10, w: 10, h: 10, vx: BARREL_SPEED, vy: 0, rot: 0, onLadder: false, falling: false })
    let scoreEv = 0
    for (let i = 0; i < 60 && !scoreEv; i++) {
        const b = g2.barrels[0]
        if (!b) break
        const gap = (b.x + b.w / 2) - (g2.player.x + g2.player.w / 2)
        const ev = tickDonkeyKong(g2, { jump: g2.player.grounded && gap > -14 && gap < -8 })
        if (ev.died) break
        scoreEv = ev.jumpedBarrel
    }
    ok(scoreEv === 1 && g2.score === 100, 'clearing a barrel underfoot scores the arcade 100', `score=${g2.score}`)

    // The lap: stand on her girder → win flag, +1000, back to the start.
    const w = makeRun(7)
    w.attract = false
    w.player.x = 100
    w.player.y = getPlatformY(w.platforms[6], 105) - w.player.h
    const evW = tickDonkeyKong(w, null)
    ok(evW.won && w.winTimer === 90, 'the top girder rings the lap', `won=${evW.won}`)
    for (let i = 0; i < 95; i++) tickDonkeyKong(w, null)
    ok(w.score === WIN_SCORE && w.player.x === 24 && w.player.y === 216, 'the lap banks 1000 and resets the board', `score=${w.score}`)
}

// --------------------------------------------------------------- seat rules ----
console.log('seat semantics: driver in, driver out, honest waits')
{
    // Seated: no human input lands, yet the runner climbs.
    const gs = makeRun(31337)
    gs.attract = false
    gs.watching = true
    for (let i = 0; i < 240; i++) tickDonkeyKong(gs, null)
    ok(gs.tickN === 240 && gs.player.y < 216, 'seated: null input still drives — the runner left the ground floor', `y=${gs.player.y.toFixed(0)}`)

    // Unseated: null input is the human coasting — the runner stands.
    const coast = makeRun(31337)
    coast.attract = false
    coast.watching = false
    for (let i = 0; i < 240; i++) tickDonkeyKong(coast, null)
    ok(coast.player.x === 24 && coast.player.y === 216 && !coast.player.climbing, 'unseated: null input is nobody driving')

    // Arcade doctrine: jumps are for barrels. With an empty site the driver
    // must not hop (the 40 px arc could kangaroo the 34 px girder gaps —
    // the original never did, and neither does the proven route).
    const early = makeRun(31337)
    early.attract = false
    early.watching = true
    tickDonkeyKong(early, null)
    const d0 = watchStep(early)
    ok(d0 && d0.jump === false, 'no barrels near → no jumps (ladders are the climb)')

    // Honest waits: attract, terminal, death/win animations.
    const att = makeRun(5, { attract: true })
    ok(watchStep(att) === null, 'watchStep waits on the attract demo')
    att.attract = false
    att.over = true
    ok(watchStep(att) === null, 'watchStep waits at the terminal')
    att.over = false
    att.deathTimer = 40
    ok(watchStep(att) === null, 'watchStep waits through the death animation')
    att.deathTimer = 0
    att.winTimer = 40
    ok(watchStep(att) === null, 'watchStep waits through the lap animation')
}

// ---------------------------------------------------- WATCH driver sweep ----
// #1637 b27 — the seat IS this sweep: watchStep replayed over the game's OWN
// lifted physics, 24 seeds. The floors below are what the proven route
// actually does; if a change drops one, the driver got worse and this is red.
console.log('WATCH driver sweep: 24 seeds of seated play on the shipped physics')
{
    // KONG_SWEEP=fast trims for the --mutant child runs (same law, plain run
    // stays at the full 24 seeds × 100 s).
    const FAST = process.env.KONG_SWEEP === 'fast'
    const SEEDS = FAST ? 8 : 24
    const TICKS = FAST ? 3600 : 6000
    const run = (seed) => {
        const gs = makeRun(seed)
        gs.attract = false
        gs.watching = true
        const samples = []
        let deaths = 0, wins = 0
        for (let i = 0; i < TICKS; i++) {
            const ev = tickDonkeyKong(gs, null)
            if (ev.died) deaths++
            if (ev.won) wins++
            if (i % 300 === 0) samples.push(stateHash(gs))
            if (gs.over) break
        }
        return { gs, samples, deaths, wins }
    }
    let det = 0, zeroDeath = 0, wonAll = 0
    let minWinTick = Infinity, totalArcPoints = 0
    const red = []
    for (let s = 1; s <= SEEDS; s++) {
        const seed = s * 7919
        const a = run(seed)
        const b = run(seed)
        if (JSON.stringify(a.samples) === JSON.stringify(b.samples)) det++
        if (a.deaths === 0) zeroDeath++
        if (a.wins >= 1) wonAll++
        minWinTick = Math.min(minWinTick, a.gs.tickN)
        totalArcPoints += a.gs.score % WIN_SCORE
        if (a.gs.over || a.wins < 1) red.push(`${seed}${a.gs.over ? ':OVER' : ':NOWIN'}`)
    }
    ok(det === SEEDS, `${SEEDS}/${SEEDS} seeds replay byte-equal (hash sampled every 300 ticks)`, red.join(' '))
    ok(wonAll === SEEDS, `every seed banks a lap under the watch`, red.join(' '))
    ok(zeroDeath >= (FAST ? 7 : 22), `zero-death runs on ${FAST ? 7 : 22}+ seeds`, `${zeroDeath}/${SEEDS}`)
    ok(totalArcPoints >= (FAST ? 200 : 400), 'the fleet arcs real barrels for points (progress, not waiting)', `${totalArcPoints}`)
    ok(minWinTick >= 300, 'no seed banks its lap suspiciously fast (the route uses the ladders)', `${minWinTick}`)
}

// ---------------------------------------------------------- shell wiring pin ----
console.log('shell wiring: seed, terminal, seat chrome')
{
    ok(/seed = seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\)/.test(IDX), 'startRun regenerates the seed and honors ?seed=N')
    ok(/exposeFeedbackState\(\(\) => \(\{[\s\S]{0,160}?done: gs\.over, seed: gs\.seed, lives: gs\.lives/.test(IDX),
        'production report carries seed + terminal + lives')
    ok(/exposeGame\(\{[\s\S]*?id: 'donkeykong'/.test(IDX), 'QA contract exposeGame wired')
    ok(/hash: stateHash\(gs\)/.test(IDX), 'QA contract state carries the physics hash')
    ok(/if \(isWatchKey\(e\)\)/.test(IDX) && /isTakeoverKey\(e\)/.test(IDX), 'Y toggles; driving keys take over')
    ok(IDX.includes('playWatchStart') && IDX.includes('playWatchStop') && IDX.includes('watchSfx: watchSfxLog'),
        'seat blips logged through the shared watch chrome')
    const RUN0 = IDX.match(/const startRun = \(\) => \{[\s\S]*?\n        \}/)
    ok(!!RUN0 && /watching = false/.test(RUN0[0]), 'watch never lingers into a fresh human run')
    ok(/if \(ev\.over && !gs\.attract && gs\.watching\) release\(false\)/.test(IDX),
        'the terminal releases the watcher (silent, racer rule)')
    ok(/<AttractWatchButton/.test(IDX) && IDX.includes('WATCH_ATTRACT_HINT'), 'attract carries the shared WATCH hint')
    ok(/const input = gs\.attract \|\| gs\.watching \? null : heldInput\(\)/.test(IDX),
        'the watcher owns the wheel — held keys never mute the driver')
    ok(/handleCanvasTap/.test(IDX), 'phones can tap the field to start/restart/take over')
    ok(/DONKEY KONG[\s\S]{0,400}WATCH_HELP/.test(REG), 'the registry advertises the proven route')
    ok(/attractFrame\(attractTick, GW, GH\)/.test(IDX), 'the attract layout rides the shared cycle')
}

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutant')) {
    console.log('mutants (each MUST die)')
    const I = 'src/games/DonkeyKong/index.jsx'
    const S = 'src/games/DonkeyKong/sim.js'
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)', I,
            `seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)`,
            `seed = Math.floor(Math.random() * 1000000)`],
        ['production report drops the seed', I,
            `tick: gs.tickN, score: gs.score, done: gs.over, seed: gs.seed, lives: gs.lives,\n        }))`,
            `tick: gs.tickN, score: gs.score, done: gs.over, lives: gs.lives,\n        }))`],
        ['broken ladders become climbable (bait turns live)', S,
            `        if (l.broken) return false
        const cx = p.x + p.w / 2`,
            `        if (false && l.broken) return false
        const cx = p.x + p.w / 2`],
        ['the barrel die leaves the stream (spacing unseeded)', S,
            `gs.barrelTimer = 150 + Math.floor(rnd(gs) * 100)`,
            `gs.barrelTimer = 150 + Math.floor(Math.random() * 100)`],
        ['the barrel arc pays nothing (jump window dropped)', S,
            `if (Math.abs(dx) < 16 && dy < 0 && dy > -24 && !p.jumpedBarrels.has(b)) {`,
            `if (Math.abs(dx) < 1 && dy < 0 && dy > -24 && !p.jumpedBarrels.has(b)) {`],
        ['contact is harmless (crush law stolen)', S,
            `if (Math.abs(dx) < 8 && Math.abs(dy) < 10) {
                killPlayer(gs, ev)`,
            `if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
                killPlayer(gs, ev)`],
        ['the lap never rings (win zone deleted)', S,
            `if (p.y + p.h < 56 && p.x > 72 && p.x < 152) {`,
            `if (false && p.y + p.h < 56 && p.x > 72 && p.x < 152) {`],
        ['the lap banks 0 (win bonus hollow)', S,
            `gs.score += WIN_SCORE`,
            `gs.score += 0`],
        ['ladders never take divers (the dive chance dies)', S,
            `if (rnd(gs) < BARREL_DIVE_CHANCE) {`,
            `if (rnd(gs) < -1) {`],
        ['the driver is muted (watch coasts forever)', S,
            `input || (gs.watching ? watchStep(gs) : {})`,
            `input || null`],
        ['watch lingers into a fresh run (startRun keeps the seat)', I,
            `            setAttractUi(false)
            gs.watching = false // watch never lingers — a new run starts in your hands`,
            `            setAttractUi(false)`],
        ['held keys mute the driver (seat flag dropped from the gate)', I,
            `const input = gs.attract || gs.watching ? null : heldInput()`,
            `const input = gs.attract ? null : heldInput()`],
        ['terminal releases the watcher with a blip (racer rule broken)', I,
            `if (ev.over && !gs.attract && gs.watching) release(false)`,
            `if (ev.over && !gs.attract && gs.watching) release(true)`],
        ['the kangaroo rides (jump candidates ungated — the route becomes a hop)', S,
            `const cands = barrelThreat(gs) ? [...WALK_CANDS, ...JUMP_CANDS] : WALK_CANDS`,
            `const cands = [...WALK_CANDS, ...JUMP_CANDS]`],
        ['the route table stops steering (waypoints vanish from the girder view)', S,
            `const wp = ROUTE.find(r => r.plat === pi)
    if (!wp) return { left: false, right: false, up: false, down: false, jump: false }`,
            `const wp = ROUTE.find(r => r.plat === -1)
    if (!wp) return { left: false, right: false, up: false, down: false, jump: false }`],
        ['the horizon goes myopic (too short to see a dive reach the mouth)', S,
            `const WATCH_HORIZON = 90`,
            `const WATCH_HORIZON = 12`],
        ['the hold collapses to one tick (ties never shape the climb)', S,
            `const HOLD = 8`,
            `const HOLD = 1`],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/kongcheck.mjs'], { encoding: 'utf8', env: { ...process.env, KONG_SWEEP: 'fast' } })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(file)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
