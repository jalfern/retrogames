// grindcheck — GRIND CITY rules + winnability, pure Node.
// Proves: the game boots, its core rules hold, the autopilot makes every
// goal inside the 2:00 run, and seed + pads replay identical hashes.
// Run: npm run grindcheck [-- --mutate <rule>]  (--mutate proves it can fail)

import { makeGame, step, stateOf, hashState, packIn, unpackIn, SCORE_GOAL } from '../src/games/GrindCity/sim.js'
import { botPad, makeBot } from '../src/games/GrindCity/planner.js'
import { parkHeight, LETTERS, RAILS } from '../src/games/GrindCity/park.js'

const dt = 1 / 60
let fails = 0
const ok = (name, cond, extra = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
    if (!cond) fails++
}

// --mutate [rule] breaks one load-bearing rule; the check MUST go red.
// Bare --mutate (nightly form, #601) runs every rule in fresh children.
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const SELF = fileURLToPath(import.meta.url)
const MUTI = process.argv.indexOf('--mutate')
const MUT = MUTI > -1 ? process.argv[MUTI + 1] : null
if (MUTI > -1 && !MUT) {
    let died = 0
    for (const rule of ['letters', 'gap', 'replay']) {
        const res = spawnSync(process.execPath, [SELF, '--mutate', rule], { encoding: 'utf8' })
        // child convention below: exit 0 = the rule broke and the check saw red
        if (res.status === 0) { died++; console.log(`mutant dies: ${rule}`) }
        else console.log(`mutant SURVIVES: ${rule} — check is toothless`)
    }
    console.log(died === 3 ? `ALL MUTANTS CAUGHT (${died}/3)` : `${died}/3 mutants caught`)
    process.exit(died === 3 ? 0 : 1)
}

// ── boot ──────────────────────────────────────────────────────────────────
const boot = makeGame(1, 'run')
ok('boots to menu', boot.phase === 'menu')
ok('run clock is 2:00', Math.abs(boot.timeLeft - 120) < 0.01, `${boot.timeLeft}s`)
boot.phase = 'play'
step(boot, {})
ok('ticks advance', boot.tick === 1)
ok('park surface sane near start', parkHeight(6, -31.5) > 3, `h=${parkHeight(6, -31.5)}`)

// ── core rules ────────────────────────────────────────────────────────────
{
    const s = makeGame(5, 'run'); s.phase = 'play'
    s.x = 0; s.z = 0; s.y = 0; s.heading = 0; s.speed = 0
    step(s, { a: true })                                  // ollie
    ok('ollie lifts', s.air && s.vy > 4)
    let t = 0
    while (s.air && t++ < 200) step(s, {})
    ok('lands again', !s.air && s.y >= parkHeight(s.x, s.z) - 0.01)
    step(s, { a: true })                                  // manual press in grace
    ok('manual starts on landing press', !!s.manual)
    step(s, { a: false })
    step(s, { a: false })
    ok('manual ends and becomes a trick', s.chain.includes('Manual') || s.chain.length > 0)
}
{
    // bail forfeits the unbanked chain
    const s = makeGame(5, 'run'); s.phase = 'play'
    s.x = 0; s.z = 0; s.y = 0; s.heading = 0; s.speed = 3
    step(s, { a: true })
    const scoreBefore = s.score
    // force a bad landing: half-flipped
    s.airTrick.flip = 1; s.airTrick.flipDir = 1; s.airTrick.flipRot = 100
    s.vy = -20
    let t = 0
    while (s.phase === 'play' && t++ < 200) step(s, {})
    ok('bail ends the chain without banking', s.phase === 'tumble' && s.score === scoreBefore && s.chain.length === 0)
}
{
    // grind latch on the plaza rail
    const s = makeGame(5, 'run'); s.phase = 'play'
    const r = RAILS.find(r => r.id === 'plaza')
    s.x = -12; s.z = -2; s.y = parkHeight(-12, -2); s.heading = 0; s.speed = 6
    step(s, { a: true })
    let t = 0
    while (!s.grind && t++ < 120) step(s, {})
    ok('rail latch starts a grind', !!s.grind, s.grind ? s.grind.name : 'never latched')
    ok('grind is on the plaza rail', s.grind && RAILS[s.grind.ri].id === 'plaza')
}

// ── winnability: the autopilot makes every goal inside 2:00 ───────────────
for (const seed of [7, 3, 42, 101, 999]) {
    const s = makeGame(seed, 'run'); s.phase = 'play'
    const bot = makeBot()
    let t = 0
    while (!s.done && t++ < 120 * 60) {
        // optional mutation: sabotage the letter pickups
        if (MUT === 'letters') LETTERS.forEach(l => { s.letters[l.k] = false })
        step(s, botPad(stateOf(s), bot))
        if (MUT === 'gap') s.overHole = false
    }
    const st = stateOf(s)
    ok(`seed ${seed}: all goals + win`, st.won === true,
        `score=${st.score} letters=${Object.keys(st.letters).length}/5 gap=${st.gapDone} t=${120 - st.timeLeft | 0}s`)
    ok(`seed ${seed}: score clears the target`, st.score >= SCORE_GOAL + 10000, `${st.score}`)
}

// ── determinism: seed + pads ⇒ identical hashes ───────────────────────────
function drive(seed) {
    const s = makeGame(seed, 'run'); s.phase = 'play'
    const bot = makeBot(); const hashes = []
    for (let t = 1; t <= 1800; t++) {
        step(s, botPad(stateOf(s), bot))
        if (t % 30 === 0) hashes.push(hashState(s))
    }
    return hashes
}
{
    const a = drive(7); const b = drive(7)
    ok('replay is deterministic', JSON.stringify(a) === JSON.stringify(b))
    const c = drive(8)
    ok('seed actually steers the sim', JSON.stringify(a) !== JSON.stringify(c))
}

// ── run replay (#3225): the cabinet logs packed inputs; a replay re-steps ──
{
    const all = { left: true, right: false, up: true, down: false, a: true, b: true }
    ok('input pack roundtrip', JSON.stringify(unpackIn(packIn(all))) === JSON.stringify(all))
    ok('empty input packs to zero', packIn({}) === 0)

    const s = makeGame(7, 'run'); s.phase = 'play'
    const bot = makeBot(); const log = []; const hs = []
    let t = 0
    while (!s.done && t++ < 120 * 60) {
        const p = botPad(stateOf(s), bot)
        // mutate 'replay': the LOG lies about B while the ridden input stays true
        log.push(packIn(MUT === 'replay' ? { ...p, b: false } : p))
        step(s, p)
        hs.push(hashState(s))
    }
    ok('replay base: bot line completes', s.done === true, `${log.length} ticks`)

    const s2 = makeGame(7, 'run'); s2.phase = 'play'
    let ident = log.length > 0
    for (let i = 0; i < log.length && ident; i++) {
        step(s2, unpackIn(log[i]))
        if (hashState(s2) !== hs[i]) ident = false
    }
    ok('input-log replay rides the identical line',
        ident && s2.tick === s.tick && s2.score === s.score && s2.won,
        `${log.length} ticks, score=${s2.score}, won=${s2.won}`)
}

if (MUT) {
    if (fails > 0) { console.log(`mutate ${MUT}: caught (${fails} red)`); process.exit(0) }
    console.log(`mutate ${MUT}: SURVIVED — check is toothless`); process.exit(1)
}
console.log(fails === 0 ? 'ALL GREEN' : `${fails} FAILURES`)
process.exit(fails === 0 ? 0 : 1)
