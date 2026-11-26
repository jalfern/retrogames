// defendercheck — DEFENDER (#1473 seedpin batch 17) in plain Node.
// The Feb port had no score, no lives, no terminal (the ship could not die),
// no humans and dice off Math.random. This gate pins what is true now: the
// whole planet comes from ONE seeded stream (?seed=N replays the world), the
// 1981 law holds (lander 150, mutant 1500, catch 250, deliver 500, wave 1000,
// bonus@10k, abduction → mutation chain, friendly fire), the ship CAN die and
// the run reaches an honest terminal, and every human start honors ?seed=N.
// `--mutant` re-plants pre-port bugs; every mutant MUST turn something red.
//
//   npm run defendercheck
//   npm run defendercheck -- --mutant

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
    createSim, wrapDelta, groundAt, makeTerrain, makeHumans, spawnWave,
    livesForScore, humansAlive,
    SCORE_LANDER, SCORE_MUTANT, SCORE_CATCH, SCORE_DELIVER, SCORE_WAVE,
    BONUS_LIFE_EVERY, START_LIVES, WORLD_WIDTH, HUMAN_COUNT, DEATH_FREEZE, RESPAWN_DELAY, INVULN_TICKS, watchRoute,
    thrustHum, BOMBS_PER_WAVE, BOMB_SCREEN,
} from '../src/games/Defender/sim.js'
import { seedRng, seedFromQuery } from '../src/utils/gameContract.js'
import { plant, pull } from './lib/mutateguard.mjs'

const jsx = readFileSync('src/games/Defender/index.jsx', 'utf8')

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const newSim = (sd, h = 800) => createSim({ rand: seedRng(sd), height: h })
const stream = (sd, n) => {
    const s = newSim(sd)
    const out = []
    for (let i = 0; i < n; i++) {
        s.step({ right: i % 9 < 5, up: i % 13 < 3, fire: i % 7 === 0 })
        out.push(`${s.player.x.toFixed(4)}|${s.player.y.toFixed(4)}|${s.enemies.length}|${s.score}|${humansAlive(s.humans)}`)
    }
    return out.join(';')
}

// ------------------------------------------------------------ determinism ----
console.log('seeded planet: terrain, humans, waves and the whole stream replay')
{
    ok(stream(4242, 500) === stream(4242, 500), 'same seed → identical 500-tick world script')
    ok(stream(4242, 500) !== stream(4243, 500), 'different seed → different world script')

    let bad = 0
    for (let s = 1; s <= 12; s++) {
        const rand = seedRng(s * 7919)
        const pts = makeTerrain(rand, WORLD_WIDTH, 800)
        for (const y of pts) if (!(y >= 600 && y <= 780)) bad++
    }
    ok(bad === 0, 'terrain stays inside the 600–780 band (12 seeds)', `${bad}`)

    const rand = seedRng(55)
    const pts = makeTerrain(rand, WORLD_WIDTH, 800)
    const hm = makeHumans(rand, pts)
    ok(hm.length === HUMAN_COUNT && hm.every((h) => h.state === 'walk'), `the planet opens with ${HUMAN_COUNT} walking humans`)
    ok(hm.every((h) => Math.abs(h.y - (groundAt(pts, h.x) - 4)) < 0.01), 'humans stand on the terrain')
    const spread = hm.map((h) => h.x).sort((a, b) => a - b)
    ok(spread[spread.length - 1] - spread[0] > WORLD_WIDTH * 0.5, 'humans are spread around the planet')

    ok(spawnWave(seedRng(99), 1, 800).length === 8, 'wave 1 opens with 8 landers (the arcade count)')
    ok(spawnWave(seedRng(99), 10, 800).length === 12, 'late waves cap at 12 landers')
    const w = spawnWave(seedRng(7), 3, 800)
    ok(w.every((e) => e.x >= 0 && e.x < WORLD_WIDTH && e.y >= 60 && e.y <= 60 + Math.max(60, 800 * 0.45)), 'wave field spawns inside the sky')
    ok(seedFromQuery('?seed=777') === 777, '?seed=N parses for the pin')
    ok(Math.abs(wrapDelta(-3990, 4000) - 10) < 1e-9 && Math.abs(wrapDelta(3990, 4000) + 10) < 1e-9, 'wrapDelta takes the short way around the planet')
}

// --------------------------------------------------------- arcade scoring ----
console.log('1981 scoring law')
{
    ok(SCORE_LANDER === 150 && SCORE_MUTANT === 1500 && SCORE_CATCH === 250 && SCORE_DELIVER === 500 && SCORE_WAVE === 1000,
        'table: lander 150 / mutant 1500 / catch 250 / deliver 500 / wave 1000')
    ok(BONUS_LIFE_EVERY === 10000 && START_LIVES === 3, 'extra ship every 10,000, three lives to start')
    ok(livesForScore(9999) === 0 && livesForScore(10000) === 1 && livesForScore(25000) === 2, 'bonus ladder by the table')

    // Full rescue chain on a frozen decoy planet: shoot the hauler after it
    // grabs, catch the fall, deliver — net exactly 150 + 250 + 500.
    const s = newSim(7)
    const h = s.humans[0]
    s.enemies = [
        { x: h.x, y: h.y - 60, vx: 0, vy: 0.5, type: 'lander', state: 'descend', target: 0, carry: null },
        { x: (h.x + 2000) % WORLD_WIDTH, y: 70, vx: 0, vy: -0.4, type: 'lander', state: 'ascend', carry: null },
    ]
    s.player.x = h.x; s.player.y = h.y - 200; s.player.vx = 0; s.player.vy = 0; s.player.invuln = 100000
    const seen = []
    let phase = 'abduct'
    for (let i = 0; i < 4000 && seen.length < 4; i++) {
        s.step({})
        s.player.invuln = 100000
        if (s.events.some((e) => e.t === 'abduct')) { seen.push('abduct'); phase = 'ascend' }
        if (phase === 'ascend' && s.enemies[0] && s.enemies[0].y < 140) {
            const e = s.enemies[0]
            e.dead = true
            const hh = s.humans[e.carry]
            hh.state = 'falling'; hh.vy = 1
            e.carry = null
            s.score += SCORE_LANDER // as the laser would have scored it
            seen.push('shot')
            phase = 'fall'
        } else if (phase === 'fall') {
            const fall = s.humans.find((x) => x.state === 'falling')
            if (fall) { s.player.x = fall.x; s.player.y = fall.y - 12 }
            if (s.carrying !== null) phase = 'deliver'
        } else if (phase === 'deliver') {
            const carr = s.humans.find((x) => x.state === 'carried')
            if (carr) { s.player.x = carr.x; s.player.vy = 1 }
        }
        if (s.events.some((e) => e.t === 'catch')) seen.push('catch')
        if (s.events.some((e) => e.t === 'deliver')) seen.push('deliver')
    }
    ok(seen.join('>') === 'abduct>shot>catch>deliver', 'the signature chain plays out: abduct → shot → catch → deliver', seen.join('>'))
    ok(s.score === SCORE_LANDER + SCORE_CATCH + SCORE_DELIVER, 'rescue nets exactly 900', `${s.score}`)
    ok(s.humans[0].state === 'walk' && humansAlive(s.humans) === HUMAN_COUNT, 'the delivered human walks again; no lives lost')

    // Mutant killed by the nose of the fighter scores 1500 (a decoy keeps the
    // wave alive so the wave bonus cannot pollute the measurement).
    const m = newSim(11)
    m.enemies = [
        { x: (m.player.x + 120) % WORLD_WIDTH, y: m.player.y, vx: 0, vy: 0, type: 'mutant', state: 'hunt', carry: null },
        { x: (m.player.x + 2000) % WORLD_WIDTH, y: 70, vx: 0, vy: -0.3, type: 'lander', state: 'ascend', carry: null },
    ]
    m.player.invuln = 100000
    let got = 0
    for (let i = 0; i < 60 && !got; i++) {
        m.step({ right: true, fire: true })
        if (m.events.some((e) => e.t === 'killMutant')) got = m.score
    }
    ok(got === SCORE_MUTANT, 'laser through a mutant pays exactly 1500', `${got}`)
}

// --------------------------------------------------------- the 1981 monsters --
console.log('lander behaviour: abduction, mutation, hostile landings')
{
    const s = newSim(3)
    const h = s.humans[1]
    s.enemies = [{ x: h.x, y: h.y - 50, vx: 0, vy: 0, type: 'lander', state: 'descend', target: 1, carry: null }]
    s.player.invuln = 100000
    let abducted = false
    for (let i = 0; i < 400 && !abducted; i++) {
        s.step({})
        abducted = s.events.some((e) => e.t === 'abduct')
        s.enemies[0].x = h.x
    }
    ok(abducted && s.humans[1].state === 'abducted', 'a lander that reaches a walking human abducts it')
    const liftFrom = s.enemies[0].y
    for (let i = 0; i < 40; i++) s.step({})
    ok(s.enemies[0].y < liftFrom, 'the haul ascends with its catch')

    const m = newSim(13)
    const ground = groundAt(m.terrain, 500)
    m.enemies = [{ x: 500, y: ground - 40, vx: 0, vy: 0.5, type: 'lander', state: 'wander', carry: null }]
    m.player.invuln = 100000
    let mutated = false
    for (let i = 0; i < 300 && !mutated; i++) { m.step({}); mutated = m.events.some((e) => e.t === 'mutate') }
    ok(mutated && m.enemies[0].type === 'mutant', 'an empty lander touching the ground mutates (the 1981 law)')

    // #3453 top-of-haul law, re-verified against the original (Wikipedia/
    // Williams docs): "Landers capture humans and attempt to carry them to the
    // top of the screen at which point they turn into fast-moving mutants" —
    // and mutants ARE the captured humans ("captured humans that had turned
    // hostile", Jarvis). The human is lost at the top AND the shell mutates
    // there. Pre-fix bug: the emptied shell wandered the sky as a lander.
    // (The old README gap claiming the cabinet "re-descends" its catch was
    // wrong — no top turn exists; the save window is the ascent.)
    const d = newSim(17)
    const hv = d.humans[2]
    d.enemies = [{ x: hv.x, y: groundAt(d.terrain, hv.x) - 60, vx: 0, vy: 0, type: 'lander', state: 'ascend', carry: 2 }]
    hv.state = 'abducted'
    d.player.invuln = 100000
    let humanLost = false
    for (let i = 0; i < 1500 && !humanLost; i++) { d.step({}); humanLost = d.events.some((e) => e.t === 'humanDied') }
    ok(humanLost && hv.state === 'dead', 'a hauled human is lost at the top if you never shoot the hauler (the 1981 law)')
    ok(d.enemies[0].type === 'mutant' && d.enemies[0].state === 'hunt' && d.enemies[0].carry === null,
       'the hauler that reached the top MUTATED into a mutant on the spot — the shell never survives the top as a lander (#3453)')

    const dr = newSim(18)
    const hr = dr.humans[1]
    hr.state = 'abducted'
    dr.enemies = [{ x: hr.x, y: 110, vx: 0, vy: -0.72, type: 'lander', state: 'ascend', carry: 1 }]
    dr.player.x = (hr.x - 40 + WORLD_WIDTH) % WORLD_WIDTH
    dr.player.y = 110
    dr.player.facing = 1
    dr.player.invuln = 100000
    let nearTopSave = false
    for (let i = 0; i < 60 && !nearTopSave; i++) { dr.step({ right: true, fire: true }); nearTopSave = hr.state === 'falling' }
    ok(nearTopSave && hr.vy >= 1, 'a shot near the top still frees the catch — the save window stays open until the mutation moment')

    const dg = newSim(27)
    const hd2 = dg.humans[0]
    hd2.state = 'abducted'
    dg.enemies = [{ x: hd2.x, y: hd2.y - 16, vx: 0, vy: 0, type: 'lander', state: 'descend', target: 3, carry: 0 }]
    dg.humans[3].state = 'dead' // its dive target just died — the drop must not dangle
    dg.player.invuln = 100000
    let dropped = false
    for (let i = 0; i < 100 && !dropped; i++) { dg.step({}); dropped = hd2.state === 'falling' }
    ok(dropped, 'a hauler that loses its dive target drops the human (falls, never frozen mid-air)')

    const f = newSim(19)
    const hw = f.humans[0]
    f.enemies = []
    f.humans.forEach((x, i) => { if (i !== 0) x.state = 'dead' })
    hw.state = 'walk'
    hw.x = (f.player.x + 80) % WORLD_WIDTH
    hw.y = groundAt(f.terrain, hw.x) - 4
    f.player.invuln = 100000
    let ff = 0
    for (let i = 0; i < 60 && !ff; i++) { f.player.y = hw.y; f.step({ right: true, fire: true }); ff = f.events.some((e) => e.t === 'humanDied') ? 1 : 0 }
    ok(ff === 1 && hw.state === 'dead', 'friendly fire: your own shots kill humans, like the original')

    const g = newSim(23)
    const hd = g.humans[3]
    hd.state = 'falling'
    hd.vy = 1
    hd.y = groundAt(g.terrain, hd.x) - 60
    g.enemies = []
    g.player.invuln = 100000
    let died = false
    for (let i = 0; i < 200 && !died; i++) { g.step({}); died = g.events.some((e) => e.t === 'humanDied') }
    ok(died && hd.state === 'dead', 'a human dropped from a kill dies at the surface')
}

// ------------------------------------------------- death, grace, the terminal --
console.log('the ship can die (pre-port it could not): lives, grace, GAME OVER')
{
    const s = newSim(29)
    const before = s.lives
    s.enemies = [{ x: s.player.x, y: s.player.y, vx: 0, vy: 0, type: 'mutant', state: 'hunt', carry: null }]
    s.step({})
    ok(s.lives === before - 1 && s.player.dark > 0 && s.events.some((e) => e.t === 'die'),
        'enemy collision costs a life and starts the dark respawn')
    ok(s.player.invuln > s.player.dark, 'the respawn grace outlasts the dark blink')

    const t = newSim(31)
    t.player.invuln = 0
    t.player.vx = 0
    t.player.vy = 0
    t.player.y = groundAt(t.terrain, t.player.x) - 3
    t.enemies = []
    t.step({})
    ok(t.lives === START_LIVES - 1, 'touching the terrain is a crash')

    const o = newSim(37)
    let deaths = 0
    for (let i = 0; i < 2000 && deaths < START_LIVES; i++) {
        o.player.invuln = 0
        o.enemies = [{ x: o.player.x, y: o.player.y, vx: 0, vy: 0, type: 'mutant', state: 'hunt', carry: null }]
        o.step({})
        if (o.events.some((e) => e.t === 'die')) deaths++
    }
    ok(deaths === START_LIVES && o.over && o.lives === 0, 'three hits reach GAME OVER honestly', `deaths=${deaths}`)
    const frozenScore = o.score
    const frozenTick = o.tick
    o.step({ right: true, fire: true })
    ok(o.score === frozenScore && o.tick === frozenTick + 1, 'after GAME OVER the sim is inert (tick advances, nothing else)')

    const b = newSim(41)
    b.score = 9900
    b.enemies = [{ x: (b.player.x + 100) % WORLD_WIDTH, y: b.player.y, vx: 0, vy: 0, type: 'lander', state: 'hunt', carry: null }]
    b.player.invuln = 100000
    let bonus = false
    for (let i = 0; i < 60 && !bonus; i++) { b.step({ right: true, fire: true }); bonus = b.events.some((e) => e.t === 'bonus') }
    ok(bonus, 'crossing 10,000 hands out an extra ship mid-run')

    const w = newSim(43)
    w.enemies.forEach((e) => { e.dead = true })
    w.enemies = []
    w.score = 0
    w.player.invuln = 100000
    w.step({})
    ok(w.wave === 2 && w.score === SCORE_WAVE && w.enemies.length === 9, 'wiping every enemy clears the wave (+1000, nine fresh landers)', `w=${w.wave} s=${w.score} n=${w.enemies.length}`)
}

// ------------------------------------------------- honest respawn grace (#3445) --
// The pre-fix sim decremented invuln ONLY while dark, so once dark hit 0 the
// grace FROZE at INVULN_TICKS — every collision check (invuln <= 0) was false
// forever: the first crash made the pilot immortal and GAME OVER unreachable.
// The 1981 cabinet promises ~1 s dark + ~2 s blinking grace, then you are
// mortal again. These pins prove the promise burns honestly WITHOUT the old
// test-side invuln = 0 cheat that hid the bug (#1473's terminal test cheated).
console.log('respawn grace burns honestly (#3445): it expires, death comes back, the terminal is natural')
{
    // 1. The clock: dark clears first, blink lasts exactly INVULN_TICKS more.
    const s = newSim(29)
    s.enemies = [{ x: s.player.x, y: s.player.y, vx: 0, vy: 0, type: 'mutant', state: 'hunt', carry: null }]
    s.step({})
    ok(s.events.some((e) => e.t === 'die') && s.player.invuln === RESPAWN_DELAY + INVULN_TICKS,
        'death sets dark + grace (no freeze at the top)', `invuln=${s.player.invuln}`)
    for (let i = 0; i < DEATH_FREEZE; i++) s.step({}) // the wreck-hold burns before the countdown
    ok(s.player.invuln === RESPAWN_DELAY + INVULN_TICKS,
        'the death freeze spends no grace (the cabinet holds the screen)', `invuln=${s.player.invuln}`)
    let ticks = 0
    while (s.player.dark > 0 && ticks < 600) { s.step({}); ticks++ }
    ok(s.player.dark === 0 && s.player.invuln === INVULN_TICKS,
        'when the dark ends the blink grace is exactly INVULN_TICKS strong (~2 s)', `dark=${s.player.dark} invuln=${s.player.invuln}`)
    ticks = 0
    // #3456: the hunt mutant now really chases (it used to be a fixture), and it
    // spawned on the wreck = on the respawn seat — a free bite at grace-zero.
    // Park it clear so this loop measures nothing but the clock.
    s.enemies[0].x = (s.player.x + 2000) % 4000
    s.enemies[0].y = 80
    while (s.player.invuln > 0 && ticks < 600) { s.step({}); ticks++ }
    ok(s.player.invuln === 0 && ticks === INVULN_TICKS,
        'the grace burns to ZERO on the clock alone — nothing forces it', `ticks=${ticks}`)

    // 2. Mortality restored: the NEXT collision takes another life untouched.
    const livesBefore = s.lives
    s.enemies = [{ x: s.player.x, y: s.player.y, vx: 0, vy: 0, type: 'mutant', state: 'hunt', carry: null }]
    s.step({})
    ok(s.lives === livesBefore - 1 && s.events.some((e) => e.t === 'die'),
        'the pilot is MORTAL after grace — a second crash lands without test-side nudges', `lives=${s.lives}`)

    // 3. The browser repro: hold ArrowDown. Three honest terrain hits reach the
    //    terminal with zero invuln manipulation (pre-fix this ran forever).
    const d = newSim(31)
    let cap = 2000
    while (!d.over && cap > 0) { d.step({ down: true }); cap-- }
    ok(d.over && d.lives === 0,
        'hands-down ArrowDown reaches GAME OVER naturally (the #3445 repro)', `over=${d.over} lives=${d.lives} ticks=${d.tick}`)
    ok(/if \(p\.invuln > 0\) p\.invuln -= 1/.test(readFileSync('src/games/Defender/sim.js', 'utf8')),
        'the honest-burn line is in the engine (source pin)')
    ok(/if \(isAttractMode\) sim\.player\.invuln = 999999/.test(jsx),
        'attract stays invulnerable BY COPY (#3445: the demo dying is a decision, and it is pinned as one)')
}

// ---------------------------------------------------- component wiring (#1473) --
console.log('component wiring: pin, report, contract, terminal UI')
{
    const src = readFileSync('src/games/Defender/index.jsx', 'utf8')
    const simSrc = readFileSync('src/games/Defender/sim.js', 'utf8')
    ok(!/Math\.random\(\)/.test(simSrc), 'sim.js is zero-entropy (no Math.random() call anywhere)')
    const dice = src.match(/Math\.random\(\)/g) || []
    const seedDraws = src.match(/Math\.random\(\) \* 1000000/g) || []
    ok(dice.length === 1 && seedDraws.length === 1, 'the only die in the shell is the seed generation', `${dice.length}/${seedDraws.length}`)
    ok(/seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\)/.test(src) && /seedRng\(seed\)/.test(src),
        'startRun honors ?seed=N')
    ok(/exposeFeedbackState\(\(\) => \(\{[\s\S]{0,260}?done:[\s\S]{0,80}?seed,[\s\S]{0,80}?lives:[\s\S]{0,80}?wave:/.test(src),
        'production report carries seed + terminal + lives + wave')
    ok(/exposeGame\(\{[\s\S]*?id: 'defender'/.test(src), 'QA contract exposeGame wired with id defender')
    ok(/isAttractMode \|\| sim\.over/.test(src) && /handleCanvasTap/.test(src), 'any key or tap starts and restarts the run')
    ok(/GAME OVER/.test(src) && /RESTART/.test(src), 'the terminal says GAME OVER and offers restart')
    ok(/invuln/.test(simSrc) && /dark/.test(simSrc), 'engine carries the respawn dark + grace fields')
    const fb = readFileSync('scripts/feedbackcheck.mjs', 'utf8')
    ok(/at least 55 games/.test(fb) && /reportingGames >= 55/.test(fb), 'feedbackcheck floor raised to 55 (Defender counts)')
    const at = readFileSync('src/games/Defender/attract.js', 'utf8')
    ok(!/LANDERS/.test(at) && /RESCUE THE HUMANS/.test(at), 'attract copy rescued the wrong noun (humans, not landers)')
    ok(/README\.md/.test('README.md') && readFileSync('src/games/Defender/README.md', 'utf8').includes('Honest gaps'), 'README carries engine notes + honest gaps')
}

// ---------------------------------------------------- feel pass (#1531) -------
console.log('feel pass #1531: death pause, telegraph, thrust voice, radar flicker')
{
    ok(DEATH_FREEZE === 30, 'the death pause is ~0.5 s (30 ticks, like the cabinet)')

    const s = newSim(53)
    s.enemies = [{ x: s.player.x, y: s.player.y, vx: 0, vy: 0, type: 'mutant', state: 'hunt', carry: null }]
    s.step({})
    ok(s.freeze === DEATH_FREEZE && s.events.some((e) => e.t === 'die'), 'a death arms the freeze')
    const snap = () => `${s.player.x}|${s.player.y}|${s.enemies[0].x}|${s.enemies[0].y}|${s.humans.map((h) => h.x.toFixed(3)).join(',')}|${s.particles.length}`
    const before = snap()
    const tickBefore = s.tick
    for (let i = 0; i < 10; i++) s.step({ right: true, fire: true })
    ok(snap() === before, 'the whole world holds still while the wreck is on screen', snap() === before ? '' : `${snap()} != ${before}`)
    ok(s.tick === tickBefore + 10 && s.freeze === DEATH_FREEZE - 10, 'the freeze burns one tick per step', `tick+${s.tick - tickBefore} freeze=${s.freeze}`)
    const px = s.player.x
    for (let i = 0; i < DEATH_FREEZE + 5; i++) s.step({ right: true })
    ok(s.freeze === 0 && s.player.x !== px, 'the world resumes when the pause expires')
    ok(!s.over && s.lives === START_LIVES - 1, 'the pause costs nothing beyond the life itself')

    const src = readFileSync('src/games/Defender/index.jsx', 'utf8')
    ok(/thrustFacing !== 0[\s\S]{0,140}?playTone\(/.test(src), 'thrust has a voice: hum plays while accelerating (docs/ART.md rule 4)')
    ok(/state === 'descend'[\s\S]{0,160}?playSweep\(/.test(src), 'a diving lander pulses a telegraph hum')
    ok(/rgba\(120,220,255,0\.45\)/.test(src) && /descend/.test(src), 'the tractor-beam telegraph is drawn over the dive')
    ok(/500 \+ Math\.min\(500, sim\.wave \* 80\)/.test(src), 'the wave fanfare pitch ramps per wave')
    ok(/drawHuman\(h, h\.state === 'walk'\)/.test(src), 'walking humans get the 2-frame shuffle')
    ok(/% 24 > 3/.test(src) && /% 18 > 2/.test(src), 'radar dots flicker on the scanner')
}

// ---------------------------------------------------- presentation #1907 ----
console.log('presentation pass #1907: color tells, rescue staging, celebration, radar priority')
{
    // Kills read by COLOR: lander green, mutant red, wreck orange, mutate flash.
    const l = newSim(59)
    l.enemies = [
        { x: (l.player.x + 120) % WORLD_WIDTH, y: l.player.y, vx: 0, vy: 0, type: 'lander', state: 'wander', carry: null },
        { x: (l.player.x + 2000) % WORLD_WIDTH, y: 70, vx: 0, vy: -0.3, type: 'lander', state: 'ascend', carry: null },
    ]
    l.player.invuln = 100000
    let greenPop = false
    for (let i = 0; i < 60 && !greenPop; i++) {
        l.step({ right: true, fire: true })
        if (l.events.some((e) => e.t === 'killLander')) {
            greenPop = l.particles.some((p) => p.col === '#3dff5e')
        }
    }
    ok(greenPop, 'a lander pop is GREEN — distinct from every other explosion (#1907)')

    const m = newSim(61)
    m.enemies = [
        { x: (m.player.x + 120) % WORLD_WIDTH, y: m.player.y, vx: 0, vy: 0, type: 'mutant', state: 'hunt', carry: null },
        { x: (m.player.x + 2000) % WORLD_WIDTH, y: 70, vx: 0, vy: -0.3, type: 'lander', state: 'ascend', carry: null },
    ]
    m.player.invuln = 100000
    let redPop = false
    for (let i = 0; i < 60 && !redPop; i++) {
        m.step({ right: true, fire: true })
        if (m.events.some((e) => e.t === 'killMutant')) redPop = m.particles.some((p) => p.col === '#ff5555')
    }
    ok(redPop, 'a mutant burst is RED — the two kill kinds never look alike')

    const g = newSim(13)
    const groundG = groundAt(g.terrain, 500)
    g.enemies = [{ x: 500, y: groundG - 40, vx: 0, vy: 0.5, type: 'lander', state: 'wander', carry: null }]
    g.player.invuln = 100000
    let mutFlash = false
    for (let i = 0; i < 300 && !mutFlash; i++) { g.step({}); if (g.events.some((e) => e.t === 'mutate')) mutFlash = g.particles.some((p) => p.col === '#b1ff5e') }
    ok(mutFlash, 'the ground mutate flashes — the lander→mutant turn is announced')

    const w = newSim(29)
    w.enemies = [{ x: w.player.x, y: w.player.y, vx: 0, vy: 0, type: 'mutant', state: 'hunt', carry: null }]
    w.step({})
    ok(w.particles.some((p) => p.col === '#ff8a3c'), 'the fighter wreck burns orange')
    ok(w.particles.every((p) => typeof p.col === 'string'), 'every particle carries its color (no invisible default)')

    // Wave-clear celebration: arms on the clear, burns down on its own clock.
    const c = newSim(47)
    c.enemies = []
    c.player.invuln = 100000
    c.step({})
    ok(c.celebrate === 100 && c.wave === 2, 'a wave clear arms the ~100-tick celebration beat', `celebrate=${c.celebrate}`)
    c.enemies = [{ x: (c.player.x + 2000) % WORLD_WIDTH, y: 70, vx: 0, vy: -0.4, type: 'lander', state: 'ascend', carry: null }]
    for (let i = 0; i < 101; i++) c.step({ right: true })
    ok(c.celebrate === 0, 'the celebration burns down and never hangs', `celebrate=${c.celebrate}`)

    // The hold-fire tell: the brain flags WHY it stayed quiet, and only then.
    {
        const s = createSim({ rand: seedRng(11), height: 420 })
        s.enemies = [{ x: 500, y: 300, vx: 0, vy: 0, type: 'lander', state: 'wander', carry: null }]
        s.humans.forEach((h, i) => { if (i > 0) h.state = 'dead' })
        const h = s.humans[0]
        h.state = 'walk'; h.x = 300; h.y = 300
        s.player.x = 200; s.player.y = 300; s.player.vx = 3; s.player.vy = 0
        s.player.facing = 1; s.player.dark = 0; s.player.invuln = 1
        ok(watchRoute(s).holdTell === true, 'a held trigger is TOLD: fire suppressed by a friend raises holdTell')
    }
    {
        const s = createSim({ rand: seedRng(12), height: 420 })
        s.enemies = [{ x: 500, y: 300, vx: 0, vy: 0, type: 'lander', state: 'wander', carry: null }]
        s.humans.forEach((h) => { h.state = 'dead' })
        s.player.x = 200; s.player.y = 300; s.player.vx = 3; s.player.vy = 0
        s.player.facing = 1; s.player.dark = 0; s.player.invuln = 1
        const inp = watchRoute(s)
        ok(inp.fire === true && !inp.holdTell, 'a clear shot fires and raises no tell (the bracket lies never)')
    }

    // The render half: these live in the shell, pinned by shape like #1531 did.
    const src = readFileSync('src/games/Defender/index.jsx', 'utf8')
    ok(/const tumble = h\.state === 'falling'/.test(src) && /const flap = \(tickN >> 2\)/.test(src),
        'a falling pod tumbles under a flapping chute (#1907)')
    ok(/sim\.carrying !== null[\s\S]{0,320}?lineTo\(h\.x, h\.y - 5\)/.test(src),
        'a carried human is roped to the belly by a harness line')
    ok(/drawHuman\(h, true\)/.test(src), 'the carried human kicks its legs — the rescue is visibly alive')
    ok(/if \(e\.type === 'lander' && e\.carry !== null && e\.state === 'ascend'\)/.test(src) && /rgba\(120,220,255,0\.5\)/.test(src),
        'the tractor beam stays on through the haul (no detached floating human)')
    ok(/sim\.celebrate > 0/.test(src) && /WAVE CLEARED/.test(src) && /GET READY/.test(src),
        'the wave clear shows the planet-explosion banner AND the new-wave countdown tell')
    ok(/RESCUED/.test(src), 'the delivery names itself: +500 RESCUED popup (b19 behaviour made legible)')
    ok(/\+250/.test(src), 'the catch pops +250 over the rescue point')
    ok(/const wrapBlink = cameraX \+ viewWidth > WORLD_WIDTH/.test(src),
        'radar player dot takes priority — blinks big across a wrap pass')
    ok(/playSweep\(hum \* 2/.test(src), 'thrust layers a rising harmonic over the hum — speed is audible')
    ok(/playTone\(hum, 0\.1, 'sawtooth', 0\.045\)/.test(src), 'the thrust tone itself fires at the pitch thrustHum sets')
    ok(/holdTell && \(tickN >> 3\)/.test(src), 'the held trigger shows a yellow bracket off the nose')
    ok(/pt\.col \|\| 'white'/.test(src), 'particles are drawn in their kill color')
}


// ---------- WATCH witness (#1637 batch 18; dual-set b21; #3445 retired the
// survival claim; #3456 stage 2 re-earned a real one) ---------------------------
// b18-b21 pinned "all 40 seeds survive 150 s" — #3445 proved that was the
// frozen-grace artifact; honest clock measured 0/20 + 1/20. #3456 stage 2
// re-tuned watchRoute against the MORTAL pilot — and uncovered a second artifact
// hiding under the first: hunt-state mutants never integrated position (statues),
// so even the 0/20 baseline had been flying a half-dead planet. Fixing the
// fidelity bug AND the route measures (npm run watchmeasure): banks 13,550 +
// 5,050, waves 20/20 + 19/20, rescues 44 + 37, deliveries 37 + 27, and
// SURVIVED at the horizon 17/20 + 17/20. That is survival most horizons, not
// proof — so the copy claim stays retired and the witness pins move here: the
// job floors rise to what the honest patrol delivers, and the mortality tripwire
// flips from ">=15 honest GAME OVERs" (which survival progress would break by
// design, see #3445) to "<=5" — an honest pilot loses ships to real hunters, and
// a return of 0-deaths patrols is the immortality bug back.
{
    const patrol = (base) => {
        let survived = 0, overs = 0, waveSeeds = 0, minScore = Infinity, catches = 0, delivers = 0, livesLost = 0
        for (let k = 0; k < 20; k++) {
            const rand = seedRng(base + k * 91)
            const w = createSim({ rand, height: 420 })
            let waves = 0
            let cap = 9000
            while (!w.over && cap > 0) {
                w.step(watchRoute(w))
                for (const e of w.events) {
                    if (e.t === 'wave') waves++
                    if (e.t === 'catch') catches++
                    if (e.t === 'deliver') delivers++
                    if (e.t === 'die') livesLost++
                }
                cap--
            }
            if (!w.over) survived++
            else overs++
            if (waves >= 1) waveSeeds++
            minScore = Math.min(minScore, w.score)
        }
        return { survived, overs, waveSeeds, minScore, catches, delivers, livesLost }
    }
    const wi = patrol(2000)
    const ho = patrol(5000)
    ok(wi.overs <= 5 && ho.overs <= 5,
        `the seat pilot SURVIVES its horizon vs the real hunters — ${wi.survived}/20 + ${ho.survived}/20 alive at 150 s (#3456 stage 2; ${wi.overs + ho.overs} honest GAME OVERs across 40 sets: mortal, never immortal — 0 deaths on both sets would be the grace bug back)`)
    ok(wi.livesLost >= 20 && ho.livesLost >= 20,
        `both sets spend >= 20 lives under honest fire (${wi.livesLost} + ${ho.livesLost}) — the pilot bleeds; immortality is still the bug, not the fix`)
    ok(wi.minScore >= 6000, `every witness patrol banks >= 6,000 against the live planet (min ${wi.minScore} — was 1,100 pre-#3456)`)
    ok(ho.minScore >= 4000, `untuned holdout banks >= 4,000 on every seed (min ${ho.minScore} — the pins are law, not seed-fitting)`)
    ok(wi.waveSeeds >= 15, `>= 15/20 witness seeds clear a wave (${wi.waveSeeds}/20 — the hunters clear themselves now, so waves close)`)
    ok(ho.waveSeeds >= 15, `>= 15/20 holdout seeds clear a wave (${ho.waveSeeds}/20)`)
    ok(wi.catches >= 25 && wi.delivers >= 20, `rescue law under real fire: ${wi.catches} catches, ${wi.delivers} deliveries on the witness set`)
    ok(ho.catches >= 25 && ho.delivers >= 20, `the untuned holdout rescues too: ${ho.catches} catches, ${ho.delivers} deliveries`)
    ok(humansAlive(createSim({ rand: seedRng(2000), height: 420 }).humans) === HUMAN_COUNT,
        'witness seeds start with the street full (five humans)')
    // The law, tested directly: a hauler outranks a CLOSER idle lander. The
    // targets now sit on OPPOSITE sides so the steer direction itself is the
    // verdict — the old both-left rig passed even with the weighting deleted.
    {
        const s = createSim({ rand: seedRng(7), height: 420 })
        s.enemies = [
            { x: 120, y: 150, vx: 0, vy: 0, type: 'lander', state: 'wander', carry: null },
            { x: 320, y: 150, vx: 0, vy: 0, type: 'lander', state: 'ascend', carry: 0 },
        ]
        s.humans[0].state = 'abducted'
        s.player.x = 200; s.player.y = 150; s.player.vx = 0; s.player.vy = 0
        s.player.facing = -1; s.player.dark = 0; s.player.invuln = 1
        const inp = watchRoute(s)
        ok(inp.right && !inp.left, 'a lander HAULING a human outranks a nearer idle one (the planet\'s job comes first)', `left=${inp.left} right=${inp.right}`)
    }
    // The delivery elevator, tested directly: holding a human up high, the route
    // must ride it DOWN to the wireframe. (The old fleet-total pin only killed
    // this by immortality scale; a mortal patrol meanders low sometimes and
    // still books deliveries — so the LAW of the steer is what gets pinned.)
    {
        const s = createSim({ rand: seedRng(13), height: 420 })
        s.enemies = []
        s.humans.forEach((h, i) => { if (i > 0) h.state = 'dead' })
        s.humans[0].state = 'carried'
        s.carrying = 0
        s.player.x = 200; s.player.y = 120; s.player.vx = 0; s.player.vy = 0
        s.player.facing = 1; s.player.dark = 0; s.player.invuln = 1
        const inp = watchRoute(s)
        ok(inp.down && !inp.up, 'a carried human is flown down the elevator to the surface', `down=${inp.down} up=${inp.up}`)
    }
    // Friendly fire stays honest at the brain too: a walking human in the laser
    // line closer than the target holds the trigger.
    {
        const s = createSim({ rand: seedRng(11), height: 420 })
        s.enemies = [{ x: 500, y: 300, vx: 0, vy: 0, type: 'lander', state: 'wander', carry: null }]
        s.humans.forEach((h, i) => { if (i > 0) h.state = 'dead' })
        const h = s.humans[0]
        h.state = 'walk'; h.x = 300; h.y = 300
        s.player.x = 200; s.player.y = 300; s.player.vx = 3; s.player.vy = 0
        s.player.facing = 1; s.player.dark = 0; s.player.invuln = 1
        const inp = watchRoute(s)
        ok(!inp.fire, 'the brain will not shoot past a walking human standing between it and the target', `fire=${inp.fire}`)
    }
    ok(/watchRoute\(sim\)/.test(jsx) && !/autopilot/.test(jsx),
        'index.jsx runs watchRoute for attract AND seat — the forked autopilot is gone')
    ok((jsx.match(/watchRoute\(sim\)/g) || []).length >= 2, 'attract AND the Y seat call the same brain')
    ok(/isWatchKey\(e\)/.test(jsx) && /isTakeoverKey\(e\)/.test(jsx), 'seat + takeover wired in index.jsx')
    ok(/data-watch-toggle/.test(jsx), 'the pill press is not eaten by the canvas tap')
    ok(/label: 'DEFENDER'[\s\S]{0,400}WATCH_HELP/.test(readFileSync('src/config/games.js', 'utf8')),
        'registry advertises WATCH for Defender')
    // #3443: the witness floors below are re-pinned ON TOP OF the bomb build —
    // honest only while the route never reaches for it. The patrol must not
    // press B with a simulated key, pad field or input shape.
    ok(!/bomb/i.test((readFileSync('src/games/Defender/sim.js', 'utf8').match(/export const watchRoute[\s\S]*?\n}/) || [''])[0]),
        'watchRoute\'s body never mentions the smart bomb — the 40-seed witness is unchanged by #3443')
    {
        const s = createSim({ rand: seedRng(2000), height: 420 })
        ok(watchRoute(s).bomb === undefined, 'patrol input carries no bomb field')
    }
}

// ---------- SMART BOMB (#3443 — Jon's #2016 answer A) ------------------------
// B vaporizes every hostile inside the 1000 px screen window, wrap-aware; the
// blast spares pilot and humans; a hauler's cargo drops FALLING; 3 per wave,
// refilled on the wave beat; edge-triggered; rand-free (seedpin law).
console.log('smart bomb (Jon #2016, #3443):')
{
    const far = () => ({ x: 2000, y: 200, vx: 0, vy: 0, type: 'lander', state: 'wander', carry: null }) // antipode anchor: keeps wave-clear out of the test
    ok(BOMBS_PER_WAVE === 3 && BOMB_SCREEN === 1000,
        'supply is 3 and the screen window is 1000 px — Jon\'s exact words, a quarter of the planet')
    // 1) starts stocked
    ok(newSim(7).bombs === BOMBS_PER_WAVE, 'a new run starts with 3 bombs')
    // 2) window law: <= half a screen dies, beyond lives
    {
        const s = newSim(7)
        s.player.x = 200; s.player.invuln = 99999
        s.enemies = [
            { x: 260, y: 200, vx: 0, vy: 0, type: 'lander', state: 'wander', carry: null },
            { x: 700, y: 200, vx: 0, vy: 0, type: 'mutant', state: 'hunt', carry: null },
            { x: 900, y: 200, vx: 0, vy: 0, type: 'lander', state: 'wander', carry: null },
            far(),
        ]
        s.step({ bomb: true })
        ok(s.enemies.length === 2 && s.enemies.every((e) => e.x === 900 || e.x === 2000),
            'kills exactly inside the 1000 px window (260 + 700 die; 700-away… 900 and the antipode live)',
            s.enemies.map((e) => e.x).join(','))
        ok(s.score === SCORE_LANDER + SCORE_MUTANT, 'bomb kills pay the normal table (150 + 1500)', `${s.score}`)
        ok(s.events.some((e) => e.t === 'bomb' && e.kills === 2), 'the bomb event names its kill count')
    }
    // 3) seam-aware: 50 px across the wrap is IN
    {
        const s = newSim(7)
        s.player.x = 10; s.player.invuln = 99999
        s.enemies = [{ x: 3960, y: 200, vx: 0, vy: 0, type: 'lander', state: 'hunt', carry: null }, far()]
        s.step({ bomb: true })
        ok(s.enemies.length === 1 && s.enemies[0].x === 2000, 'the blast crosses the wrap seam — a kill 50 px the other way')
    }
    // 4) the blast spares the good guys
    {
        const s = newSim(7)
        s.player.x = 200; s.player.invuln = 0; s.lives = START_LIVES
        s.enemies = [far()]
        const before = humansAlive(s.humans)
        for (let i = 0; i < 5; i++) s.step({ bomb: i === 0 })
        ok(s.lives === START_LIVES && humansAlive(s.humans) === before,
            'one press, five ticks: the pilot is untouched and the street is unharmed')
    }
    // 5) hauler drops its cargo FALLING (the catchable law, same as a laser)
    {
        const s = newSim(7)
        s.player.x = 200; s.player.invuln = 99999
        const h = s.humans[0]
        h.state = 'abducted'; h.x = 210; h.y = 166
        s.enemies = [{ x: 210, y: 150, vx: 0, vy: 0, type: 'lander', state: 'ascend', carry: 0 }, far()]
        s.step({ bomb: true })
        ok(s.enemies.length === 1 && h.state === 'falling' && h.vy === 1.05,
            'a bombed hauler dies and its human falls — catchable, never collateral')
    }
    // 6) edge trigger + dry clicks
    {
        const s = newSim(7)
        s.player.invuln = 99999
        s.enemies = [far()]
        s.step({ bomb: true }); s.step({ bomb: true }); s.step({ bomb: true })
        ok(s.bombs === BOMBS_PER_WAVE - 1, 'HELD bomb is one blast, not a stream (edge-trigger)', `${s.bombs}`)
        s.step({ bomb: false }); s.step({ bomb: true })
        ok(s.bombs === BOMBS_PER_WAVE - 2, 'release + press fires again')
        s.bombs = 0
        s.step({ bomb: false }); s.step({ bomb: true })
        ok(s.bombs === 0 && !s.events.some((e) => e.t === 'bomb'), 'a dry click at zero says nothing and spends nothing')
    }
    // 7) the wave beat restocks
    {
        const s = newSim(7)
        s.bombs = 0
        s.enemies = []
        s.step({})
        ok(s.bombs === BOMBS_PER_WAVE && s.events.some((e) => e.t === 'wave'),
            'clearing a wave refills to 3 (cap, not stack)', `${s.bombs}`)
    }
    // 8) never during dark (dead)
    {
        const s = newSim(7)
        s.player.dark = 30; s.bombs = 3
        s.step({ bomb: true })
        ok(s.bombs === 3, 'no wasted bomb while the ship is dead and respawning')
    }
    // 9) rand-free: the press cannot shift the seed stream. Proof: identical
    // pads twice, AND the blast path calls no rand — a hand-kill and a bomb at
    // the same tick leave the NEXT rand output identical to a no-kill tick when
    // both kill nothing.
    {
        const drive = () => {
            const w = createSim({ rand: seedRng(99), height: 420 })
            let t = 0
            while (!w.over && t < 1200) { w.step({ bomb: t % 37 === 0, fire: t % 11 === 0, right: t % 5 === 0 }); t++ }
            return `${w.tick}|${w.score}|${w.wave}|${w.player.x.toFixed(6)}`
        }
        ok(drive() === drive(), 'bomb-padded runs replay byte-identical (deterministic press path)')
        const bombPath = (readFileSync('src/games/Defender/sim.js', 'utf8').match(/const smartBomb[\s\S]*?\n    \}/) || [''])[0]
        ok(bombPath && !/rand\(\)/.test(bombPath), 'smartBomb draws ZERO rand — the seedpin law holds even under a human hammering B')
    }
    // 10) view + pad wiring
    ok(/secondAction=\{\{ label: 'BOMB', code: 'ShiftLeft' \}\}/.test(jsx),
        'the pad shows BOMB as B (secondAction, ShiftLeft)')
    ok(/buttons: \['left', 'right', 'up', 'down', 'a', 'b'\]/.test(jsx),
        'the QA contract declares b — replay and bots can press the bomb')
    ok(/keys\.ShiftLeft = !!pad\.b/.test(jsx), 'pad.b lands on the keyboard field the sim reads')
    ok(/bombs: sim \? sim\.bombs/.test(jsx), 'state() carries the bomb stock (additive to the contract)')
    ok(/bombFlash/.test(jsx) && /rgba\(255,255,255,/.test(jsx), 'the detonation washes the screen white like the cabinet')
    ok(/label: 'DEFENDER'[\s\S]{0,500}Shift: Smart bomb/.test(readFileSync('src/config/games.js', 'utf8')),
        'registry controls advertise the smart bomb')
}

// ---------------------------------------------------------------- seam laws ----
// #3453: the documented wrap-seam skip was stale — every position-based
// collision in the sim already reads the wrap through wrapDelta. These pins
// hold that law so it cannot rot back into a documented dead zone.
console.log('wrap seam laws (#3453):')
{
    // antipode anchor: keeps wave-clear out of the test
    const far = () => ({ x: 2000, y: 200, vx: 0, vy: 0, type: 'lander', state: 'wander', carry: null })
    // 1) fire path: a laser spawned on the ship kills a mutant across the seam
    {
        const s = newSim(7)
        s.player.x = 3960; s.player.y = 200; s.player.vx = 0; s.player.vy = 0
        s.enemies = [
            { x: 6, y: 200, vx: 0, vy: 0, type: 'mutant', state: 'hunt', carry: null },
            far(),
        ]
        s.step({ fire: true })
        ok(s.events.some((e) => e.t === 'killMutant'),
            'a laser fired on the ship crosses the seam and kills a mutant on the far side')
    }
    // 2) friendly fire across the seam
    {
        const s = newSim(7)
        const h = s.humans[0]
        h.state = 'walk'; h.x = 4; h.dir = 1
        h.y = groundAt(s.terrain, h.x) - 4
        s.enemies = [far()]
        s.lasers = [{ x: 3980, y: h.y, vx: 20, life: 60 }]
        s.step({})
        ok(h.state === 'dead' && s.events.some((e) => e.t === 'humanDied'),
            'friendly fire across the wrap — a walking human just over the seam dies to the blast')
    }
    // 3) the catch reads the wrap
    {
        const s = newSim(7)
        const h = s.humans[1]
        h.state = 'falling'; h.x = 6; h.y = 400; h.vy = 1
        s.player.x = 3994; s.player.y = h.y - 12; s.player.vx = 0; s.player.vy = 0
        s.enemies = [far()]
        s.step({})
        ok(s.carrying === 1 && h.state === 'carried' && s.events.some((e) => e.t === 'catch'),
            'a falling human on the far side of the seam is caught — the catch reads the wrap')
    }
    // 4) ship contact across the seam kills the fighter
    {
        const s = newSim(7)
        s.player.x = 3994; s.player.y = 400; s.player.vx = 0; s.player.vy = 0
        s.enemies = [
            { x: 6, y: 400, vx: 0, vy: 0, type: 'mutant', state: 'hunt', carry: null },
            far(),
        ]
        const lives = s.lives
        s.step({})
        ok(s.events.some((e) => e.t === 'die') && s.lives === lives - 1,
            'enemy contact on the far side of the seam kills the fighter — ship contact reads the wrap')
    }
    // 5) the empty-lander mutation law reads the wrap
    {
        const s = newSim(7)
        const g = groundAt(s.terrain, 3995)
        s.enemies = [
            { x: 3995, y: g - 11, vx: 0, vy: 0.5, type: 'lander', state: 'wander', carry: null },
            far(),
        ]
        s.step({})
        ok(s.enemies.some((e) => e.x === 3995 && e.type === 'mutant') && s.events.some((e) => e.t === 'mutate'),
            'an empty lander reaching the ground on the far side of the seam mutates (the 1981 law)')
    }
    // 6) a diver crosses the seam and abducts the human on the far side
    {
        const s = newSim(13)
        const h = s.humans[0]
        h.state = 'walk'; h.x = 1; h.dir = -1
        h.y = groundAt(s.terrain, h.x) - 4
        const band = groundAt(s.terrain, h.x) - 18
        s.enemies = [
            { x: 3999, y: band - 4, vx: 0, vy: 0.2, type: 'lander', state: 'descend', carry: null, target: 0 },
            far(),
        ]
        s.player.invuln = 99999
        let crossSeam = false
        for (let i = 0; i < 60; i++) {
            const preHuman = h.x, preDiver = s.enemies[0].x
            s.step({})
            if (s.events.some((e) => e.t === 'abduct')) {
                crossSeam = preHuman < 10 && preDiver > 3990 && Math.abs(wrapDelta(preHuman - preDiver)) < 6
                break
            }
        }
        ok(s.humans[0].state === 'abducted' && crossSeam,
            'a diver descends across the seam and abducts the human on the far side')
    }
}

// ---------------------------------------------------------------- hum NaN ----
// #2167: the nightly page-error family — the thrust hum fed a non-finite
// freq into setValueAtTime. The hum pitch now lives in sim.js (thrustHum) and
// is finite AT THE SOURCE: a NaN vx hums idle at 50 Hz instead of dropping
// the cue behind #2166's global guard.
console.log('thrust hum is finite at the source (#2167):')
{
    ok(thrustHum(0) === 50 && thrustHum(8) === 114 && thrustHum(-8) === 114,
        'hum tracks speed across the whole ±8 envelope')
    ok(thrustHum(NaN) === 50 && thrustHum(Infinity) === 50 && thrustHum(-Infinity) === 50,
        'a non-finite vx hums idle — never NaN, never silent')
    ok(jsx.includes('thrustHum(sim.player.vx)'),
        'index.jsx builds the hum through thrustHum (no raw vx near an AudioParam)')
    // physics finiteness law: an honest patrol never leaks NaN into the ship.
    let leak = ''
    outer: for (let sd = 1; sd <= 8; sd++) {
        const s = newSim(sd * 31)
        for (let i = 0; i < 1800 && !s.over; i++) {
            s.step(watchRoute(s))
            if (![s.player.x, s.player.y, s.player.vx, s.player.vy].every(Number.isFinite)) {
                leak = `seed ${sd * 31} tick ${i}`
                break outer
            }
        }
    }
    ok(leak === '', 'watchRoute patrols keep x/y/vx/vy finite (8 seeds × 30 s)', leak)
}

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutant')) {
    console.log('mutants (each MUST die)')
    const I = 'src/games/Defender/index.jsx'
    const S = 'src/games/Defender/sim.js'
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)', I,
            `seed = forcedSeed !== undefined && forcedSeed !== null
                ? forcedSeed >>> 0
                : (seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000))`,
            `seed = forcedSeed !== undefined && forcedSeed !== null
                ? forcedSeed >>> 0
                : Math.floor(Math.random() * 1000000)`],
        ['production report drops the seed', I,
            `            seed: seed,
            lives: sim ? sim.lives : START_LIVES,
            wave: sim ? sim.wave : 1,
        }))`,
            `            lives: sim ? sim.lives : START_LIVES,
            wave: sim ? sim.wave : 1,
        }))`],
        ['the empty-lander mutation rule is deleted', S,
            `if (e.type === 'lander' && !e.carry && e.y >= groundAt(s.terrain, e.x) - 12) {`,
            `if (false && e.type === 'lander' && !e.carry && e.y >= groundAt(s.terrain, e.x) - 12) {`],
        ['catch scores like a lander (table corrupted)', S,
            `export const SCORE_CATCH = 250`,
            `export const SCORE_CATCH = 150`],
        ['the ship cannot die (pre-port terminal theft)', S,
            `if (s.lives <= 0) {`,
            `if (false) {`],
        ['gravity runs backwards (falling humans float up)', S,
            `h.vy += 0.05`,
            `h.vy -= 0.05`],
        ['the death pause is deleted (#1531 feel regressed)', S,
            `if (s.freeze > 0) { s.freeze -= 1; return s }`,
            `if (false) { s.freeze -= 1; return s }`],
        ['thrust goes silent again', I,
            `audioController.playTone(hum, 0.1, 'sawtooth', 0.045)`,
            `/* silent */`],
        ['the abduction telegraph hum is muted', I,
            `audioController.playSweep(140, 70, 0.2, 'triangle', 0.06)`,
            `/* muted */`],
        ['the tractor beam is invisible', I,
            `ctx.strokeStyle = (tickN >> 2) % 2 === 0 ? 'rgba(120,220,255,0.45)' : 'rgba(120,220,255,0.2)'`,
            `ctx.strokeStyle = '#cccccc'`],
        ['terrain is friendly (pre-port invincibility)', S,
            `if (p.dark <= 0 && p.invuln <= 0 && ceil - p.y < 8) { die(); return s }`,
            `if (false) { die(); return s }`],
        ['the patrol loses its elevator (vertical aim deleted)', S,
            `        if (!climbing) {
            if (dy > 10) input.down = true
            else if (dy < -10) input.up = true
        }`,
            `        if (false) {
            if (dy > 10) input.down = true
            else if (dy < -10) input.up = true
        }`],
        ['haulers lose their rank (b19 rescue weighting deleted)', S,
            `if (e.type === 'lander' && e.carry !== null) d *= 0.25`,
            `if (false && e.type === 'lander' && e.carry !== null) d *= 0.25`],
        ['the guns ignore the humans they defend (b19 friendly-fire guard blinded)', S,
            `if (Math.abs(hd) < Math.abs(dx) + 8 && Math.sign(hd || p.facing) === Math.sign(dx || p.facing) && Math.abs(h.y - p.y) < 10) shield = true`,
            `if (false) shield = true`],
        ['the patrol ignores falling humans again (b19 rescue chase deleted)', S,
            `if (fall && fallD < 1000 && !climbing) {`,
            `if (false) {`],
        ['the rescued human is never set down (b19 delivery elevator deleted)', S,
            `if (s.carrying !== null) {
        const want = groundAt(s.terrain, p.x) - 13`,
            `if (false && s.carrying !== null) {
        const want = groundAt(s.terrain, p.x) - 13`],
        ['the patrol stops lifting off the wireframe (b21 crash-law sentinel)', S,
            `    if (climbing) input.up = true`,
            `    if (false) input.up = true`],
        ['#1907 lander pops lose their green', S,
            `killFx(e.x, e.y, 10, '#3dff5e') // the arcade's green lander pop (#1907)`,
            `killFx(e.x, e.y, 10, '#ffffff')`],
        ['#1907 mutant bursts lose their red', S,
            `killFx(e.x, e.y, 10, '#ff5555') // mutants burst red (#1907)`,
            `killFx(e.x, e.y, 10, '#ffffff')`],
        ['#1907 the wave-clear celebration never arms', S,
            `s.celebrate = 100 // #1907: the planet-exploses celebration beat before the new wave settles`,
            `s.celebrate = 0`],
        ['#1907 the celebration hangs forever (no decay)', S,
            `if (s.celebrate > 0) s.celebrate -= 1 // #1907: the wave-clear beat burns its own clock`,
            `if (false) { s.celebrate -= 1 }`],
        ['#1907 the held-trigger tell is muted', S,
            `else input.holdTell = true // #1907: the brain SHOWS why it held the trigger`,
            `/* tell muted */`],
        ['#1907 the falling pod loses its chute', I,
            `const tumble = h.state === 'falling'`,
            `const tumble = false`],
        ['#1907 the harness line is cut (carried human detaches)', I,
            `ctx.moveTo(p.x, p.y + 6); ctx.lineTo(h.x, h.y - 5)`,
            `/* no harness */`],
        ['#1907 the tractor drops the hauled human', I,
            `if (e.type === 'lander' && e.carry !== null && e.state === 'ascend') {`,
            `if (false && e.type === 'lander' && e.carry !== null && e.state === 'ascend') {`],
        ['#1907 the rescue stops naming itself', I,
            `popups.push({ x: sim.player.x, y: sim.player.y + 24, text: '+500 RESCUED', life: 90 }) // #1907: names b19's delivery beat`,
            `/* silent delivery */`],
        ['#1907 radar loses its wrap-priority blink', I,
            `const wrapBlink = cameraX + viewWidth > WORLD_WIDTH && (tickN >> 2) % 2 === 0`,
            `const wrapBlink = false`],
        ['#1907 the thrust harmonic layer is peeled off', I,
            `audioController.playSweep(hum * 2, hum * 2 + 60, 0.08, 'square', 0.018)`,
            `/* no harmonic */`],
        ['#1907 the celebration banner is blanked', I,
            `ctx.fillText('WAVE CLEARED', viewWidth / 2, viewHeight / 2 - 16)`,
            `/* blanked */`],
        ['#2167 the hum clamp is peeled off (raw vx reaches the AudioParam)', S,
            `export const thrustHum = (vx) => 50 + (Number.isFinite(vx) ? Math.abs(vx) : 0) * 8`,
            `export const thrustHum = (vx) => 50 + Math.abs(vx) * 8`],
        ['#3443 waves stop restocking the smart bomb', S,
            `s.bombs = BOMBS_PER_WAVE // #3443 (Jon #2016): 3 per wave — the wave beat restocks`,
            `/* dry waves */`],
        ['#3445 the respawn grace freezes when dark ends (the immortality bug)', S,
            `if (p.invuln > 0) p.invuln -= 1`,
            `if (p.dark > 0) p.invuln -= 1`],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/defendercheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(file)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
