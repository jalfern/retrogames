// grindcheck — GRIND CITY rules + winnability, pure Node.
// Proves: the game boots, its core rules hold, the autopilot makes every
// goal inside the 2:00 run, and seed + pads replay identical hashes.
// Run: npm run grindcheck [-- --mutate <rule>]  (--mutate proves it can fail)

import { makeGame, step, stateOf, hashState, SCORE_GOAL } from '../src/games/GrindCity/sim.js'
import { botPad, makeBot } from '../src/games/GrindCity/planner.js'
import { parkHeight, LETTERS, RAILS } from '../src/games/GrindCity/park.js'

const dt = 1 / 60
let fails = 0
const ok = (name, cond, extra = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
    if (!cond) fails++
}

// --mutate <rule> breaks one load-bearing rule; the check MUST go red.
const MUT = process.argv.includes('--mutate')
    ? process.argv[process.argv.indexOf('--mutate') + 1] : null

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

if (MUT) {
    if (fails > 0) { console.log(`mutate ${MUT}: caught (${fails} red)`); process.exit(0) }
    console.log(`mutate ${MUT}: SURVIVED — check is toothless`); process.exit(1)
}
console.log(fails === 0 ? 'ALL GREEN' : `${fails} FAILURES`)
process.exit(fails === 0 ? 0 : 1)
