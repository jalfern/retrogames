// smashcheck — SMASH TV in plain Node, no browser.
//   geometry  : exits sit on free border cells; start, spawns and crates are
//               off-wall and reachable from the start; bonus rooms carry civs.
//   rules     : exits sealed until the room dies, open after and walk-through
//               advances; ONE HIT KILLS (bullet, contact, grenade) and lives run
//               out into game over; spawn-invulnerability is the only mercy;
//               crates shatter in 2 hits and drop their gun; touching it swaps;
//               LASER burns POWER and refuses when broke; FIREBOMB costs 34,
//               kills every non-boss enemy and pays them; the bonus timer opens
//               the exits; killing THE ANNOUNCER wins.
//   ledger    : final score == sum of scored events, pilot replay included.
//   pilot     : seeds 0-8 win the nine-room show; seeds 1 and 3 do it deathless.
//   slack     : seed 1 still wins with one fewer crate per room and zero
//               energy cells.
//   determinism : same seed twice -> identical digest.
// `-- --mutate` re-plants five fixed bugs in child processes; each MUST die.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const { GW, GH, EXITS, TOTAL_ROOMS, genRoom, START, isBonus } = await import('../src/games/SmashTV/levels.js')

async function fresh() {
    const sim = await import(`../src/games/SmashTV/sim.js?c=${Date.now()}`)
    const planner = await import(`../src/games/SmashTV/planner.js?c=${Date.now()}`)
    return { ...sim, plan: planner.plan }
}
const S = await fresh()
const { makeGame, step, stateHash, CFG } = S
const cx = (c) => c * 16 + 8
const cy = (r) => 24 + r * 16 + 8

// ---------------------------------------------------------------- geometry ----
console.log('geometry')
for (let idx = 0; idx < TOTAL_ROOMS; idx++) {
    const room = genRoom(0, idx)
    const bad = room.walls.filter(([c, r]) => c < 1 || r < 1 || c >= GW - 1 || r >= GH - 1)
    ok(bad.length === 0, `room ${idx + 1}: patterns stay off the border`)
    const blocked = new Set(room.walls.map(([c, r]) => `${c},${r}`))
    for (const e of EXITS) ok(!blocked.has(`${e.c},${e.r}`), `room ${idx + 1}: exit ${e.side} is free`)
    const seen = new Set()
    const q = [[START.r, START.c]]
    while (q.length) {
        const [r, c] = q.pop()
        const k = `${c},${r}`
        if (seen.has(k) || blocked.has(k) || c < 0 || r < 0 || c >= GW || r >= GH) continue
        seen.add(k)
        q.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1])
    }
    for (const s of room.spawns) ok(seen.has(`${s.c},${s.r}`), `room ${idx + 1}: ${s.kind} reachable`)
    for (const k of room.crates) ok(seen.has(`${k.c},${k.r}`), `room ${idx + 1}: crate reachable`)
    for (const e of EXITS) ok(seen.has(`${e.c},${e.r}`), `room ${idx + 1}: exit ${e.side} walkable`)
    if (isBonus(idx)) ok(room.civilians > 0 && room.bonusTime > 0, `room ${idx + 1}: bonus room has contestants and a clock`)
}

// ------------------------------------------------------------------ rules ----
console.log('rules')
// exits sealed until the room falls, then walk-through advances
{
    const gs = makeGame(0)
    for (let i = 0; i < 120; i++) { step(gs, {}); gs.events.length = 0 }
    ok(!gs.cleared, 'exits stay sealed while the room has life')
    gs.enemies = []
    gs.roomData.spawns = []
    gs.spawnT = 0
    step(gs, {})
    const evC = gs.events.find((e) => e.type === 'clear')
    ok(gs.cleared && evC, 'the room falls when the last enemy dies (+bonus event)', evC ? `+${evC.pts}` : '')
    const ex = EXITS[0]
    gs.player.x = cx(ex.c); gs.player.y = cy(ex.r)
    step(gs, {})
    ok(gs.room === 1, 'walking an open exit advances the room')
    ok(gs.energy === CFG.maxEnergy, 'POWER refills on the new room')
}
// one hit kills, lives run out into game over
{
    const gs = makeGame(0)
    gs.player.invuln = 0
    gs.ebullets.push({ id: 8001, x: gs.player.x + 2, y: gs.player.y, dx: 1, dy: 0, dmg: 1, kind: 'shot' })
    step(gs, {})
    ok(gs.events.some((e) => e.type === 'death') && gs.lives === CFG.lives - 1, 'ONE bullet ends a life')
    gs.player.deadT = 0
    gs.player.invuln = 0
    gs.ebullets.push({ id: 8002, x: gs.player.x + 2, y: gs.player.y, dx: 1, dy: 0, dmg: 1, kind: 'shot' })
    step(gs, {})
    gs.player.deadT = 0; gs.player.invuln = 0
    gs.ebullets.push({ id: 8003, x: gs.player.x + 2, y: gs.player.y, dx: 1, dy: 0, dmg: 1, kind: 'shot' })
    step(gs, {})
    ok(gs.lives === 0 || gs.end === 'over', 'three bodies spend the run', `lives ${gs.lives} end ${gs.end}`)
}
// spawn invulnerability is the only mercy
{
    const gs = makeGame(0)
    ok(gs.player.invuln > 0, 'contestants spawn shielded')
    gs.ebullets.push({ id: 8101, x: gs.player.x + 2, y: gs.player.y, dx: 1, dy: 0, dmg: 1, kind: 'shot' })
    step(gs, {})
    ok(gs.lives === CFG.lives && gs.player.deadT === 0, 'a shielded player walks through fire')
}
// contact and grenades also kill
{
    const gs = makeGame(0)
    gs.player.invuln = 0
    gs.enemies.push({ id: 8201, kind: 'walkcam', x: gs.player.x + 3, y: gs.player.y, hp: 1, cd: 9999, wanderT: 999, wdx: 0, wdy: 0, hitT: 0, dir: 1 })
    step(gs, {})
    ok(gs.player.deadT > 0 || gs.end, 'a touch also ends it')
}
// crates: two hits, gun drops, touch swaps
{
    const gs = makeGame(0)
    const k = gs.crates[0]
    ok(!!k, 'room 1 hides a weapon crate')
    for (let i = 0; i < 40; i++) { gs.bullets.push({ id: 9000 + i, x: k.x, y: k.y, dx: 0, dy: 0, pierce: 0, dmg: 1, kind: 'twin' }); step(gs, {}); gs.events.length = 0; if (k.hp <= 0) break }
    ok(k.hp <= 0, 'a crate shatters under two hits')
    const drop = gs.items.find((it) => it.t === 'weapon')
    ok(!!drop && drop.w === k.weapon, 'the crate reveals its gun')
    gs.player.x = drop.x; gs.player.y = drop.y
    step(gs, {})
    ok(gs.weapon === k.weapon, `touching it swaps the gun (${gs.weapon})`)
}
// LASER burns POWER and refuses when broke
{
    const gs = makeGame(0)
    gs.weapon = 'laser'; gs.energy = 100
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 16; j++) { step(gs, { fire: true }); gs.events.length = 0 } }
    ok(gs.energy === 94, 'LASER costs 2 POWER a shot', `energy ${gs.energy}`)
    gs.energy = 1
    step(gs, { fire: true })
    ok(!gs.events.some((e) => e.type === 'shoot') && gs.energy === 1, 'a broke LASER refuses to fire')
}
// FIREBOMB: costs 34, clears the room (not the boss), pays the kills
{
    const gs = makeGame(0)
    gs.enemies = [
        { id: 8301, kind: 'walkcam', x: 40, y: 60, hp: 1, cd: 999, wanderT: 999, wdx: 0, wdy: 0, hitT: 0, dir: 1 },
        { id: 8302, kind: 'turret', x: 200, y: 60, hp: 2, cd: 999, wanderT: 999, wdx: 0, wdy: 0, hitT: 0, dir: 1 },
    ]
    gs.ebullets.push({ id: 8303, x: 100, y: 100, dx: 1, dy: 0, dmg: 1, kind: 'shot' })
    const s0 = gs.score
    step(gs, { bomb: true })
    ok(gs.energy === CFG.maxEnergy - CFG.firebombCost, 'the firebomb takes 34 POWER')
    ok(gs.enemies.length === 0 && gs.ebullets.length === 0, 'the firebomb sweeps the studio')
    ok(gs.score - s0 === 50 + 150, 'firebomb kills still pay', `+${gs.score - s0}`)
    gs.energy = 10
    step(gs, { bomb: true })
    ok(gs.events.some((e) => e.type === 'bombFail') && gs.energy === 10, 'not enough POWER, not enough boom')
}
// bonus: timer runs the clock even if you hold your fire; exits then open
{
    const r = S.plan(0)
    const gs = makeGame(0)
    let inBonus = false
    for (const inp of r.script) {
        step(gs, inp); gs.events.length = 0
        if (gs.room === 3 && gs.roomData.bonus) { inBonus = true; break }
    }
    ok(inBonus, 'room 4 is the blood bonus')
    ok(gs.civilians.length > 0, 'contestants fill the bonus floor')
    let t = 0
    while (!gs.cleared && t++ < 700) { step(gs, {}); gs.events.length = 0 }
    ok(gs.cleared && gs.bonusT <= 0, 'the bonus clock opening the exits is mercy enough')
}
// combo pays more as it climbs
{
    const r = S.plan(0)
    const gs = makeGame(0)
    const civKills = []
    for (const inp of r.script) {
        step(gs, inp)
        for (const e of gs.events) if (e.type === 'civKill') civKills.push(e)
        gs.events.length = 0
    }
    const best = civKills.reduce((m, e) => Math.max(m, e.combo), 0)
    ok(civKills.length >= 2 && best >= 2, 'the bonus chains a combo', `${civKills.length} hits, best x${best}`)
    const pay = civKills.find((e) => e.combo >= 2)
    ok(!pay || pay.pts >= 150, 'combo kills pay the escalation', pay && `${pay.pts}`)
}
// THE ANNOUNCER: killing him ends the show
{
    const r = S.plan(0)
    const gs = makeGame(0)
    for (const inp of r.script) { step(gs, inp); gs.events.length = 0; if (gs.end) break }
    ok(gs.end === 'win' && gs.room === TOTAL_ROOMS - 1, 'the pilot beats the ANNOUNCER in room 9')
}

// ----------------------------------------------------------------- pilot ----
console.log('pilot')
let deathless = 0
for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = S.plan(seed)
    ok(r.won, `pilot clears the show (seed ${seed})`, `deaths=${r.deaths} score=${r.score}`)
    if (r.won && r.deaths === 0) deathless++
}
ok(deathless >= 2, 'two seeds prove a deathless matinee', `deathless ${deathless}`)

// ----------------------------------------------------------------- slack ----
console.log('slack')
{
    const r = S.plan(1, { slack: true })
    ok(r.won, 'the show is still won with one fewer crate per room and zero energy cells', `deaths=${r.deaths}`)
}

// ---------------------------------------------------------------- ledger ----
console.log('ledger')
{
    const r = S.plan(0)
    const gs = makeGame(0)
    let ledger = 0
    for (const inp of r.script) {
        step(gs, inp)
        for (const e of gs.events) if (e.type === 'score') ledger += e.pts
        gs.events.length = 0
    }
    ok(ledger === r.gs.score, 'final score equals the sum of scored events', `${ledger} vs ${r.gs.score}`)
}

// ---------------------------------------------------------- determinism ----
console.log('determinism')
{
    const a = S.plan(0), b = S.plan(0)
    ok(a.hash === b.hash, 'same seed replays identically', `${a.hash} vs ${b.hash}`)
}

// ------------------------------------------------------------- mutants ----
if (process.argv.includes('--mutate')) {
    console.log('mutants (must die)')
    const SIM = 'src/games/SmashTV/sim.js'
    const MUTANTS = [
        ['exits unlock while enemies live', 'gs.spawnT <= 0 && !room.spawns.length && gs.enemies.length === 0', 'gs.enemies.length >= 0'],
        ['one-hit lethality removed', 'if (p.deadT > 0 || gs.end || p.invuln > 0) return', 'if (p.deadT > 0 || gs.end || p.invuln >= 0) return'],
        ['crates keep their gun inside', 'gs.items.push({ id: gs._nextId++, t: \'weapon\', w: k.weapon, x: k.x, y: k.y })', 'void k'],
        ['firebomb goes free', 'gs.energy -= CFG.firebombCost\n    let killed = 0', 'gs.energy -= 0\n    let killed = 0'],
        ['the bonus clock never runs out', 'if (gs.bonusT <= 0) {', 'if (gs.bonusT <= -1e9) {'],
    ]
    const orig = readFileSync(SIM, 'utf8')
    let died = 0
    for (const [name, from, to] of MUTANTS) {
        if (!orig.includes(from)) { ok(false, `mutant ${name}: anchor missing`); continue }
        writeFileSync(SIM, orig.replace(from, to))
        const res = spawnSync('node', ['scripts/smashcheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant ${name} caught`) }
        else ok(false, `mutant ${name} SURVIVED`)
    }
    writeFileSync(SIM, orig)
    ok(died === MUTANTS.length, 'all mutants die', `${died}/${MUTANTS.length}`)
}

console.log(fails ? `FAIL ${fails} (pass ${passes})` : `PASS ${passes}`)
process.exit(fails ? 1 : 0)
