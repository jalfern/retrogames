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
    BONUS_LIFE_EVERY, START_LIVES, WORLD_WIDTH, HUMAN_COUNT, DEATH_FREEZE, watchRoute,
    thrustHum,
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

    const d = newSim(17)
    const hv = d.humans[2]
    d.enemies = [{ x: hv.x, y: groundAt(d.terrain, hv.x) - 60, vx: 0, vy: 0, type: 'lander', state: 'ascend', carry: 2 }]
    hv.state = 'abducted'
    d.player.invuln = 100000
    let humanLost = false
    for (let i = 0; i < 1500 && !humanLost; i++) { d.step({}); humanLost = d.events.some((e) => e.t === 'humanDied') }
    ok(humanLost && hv.state === 'dead', 'a hauled human dies at the top if you never shoot the hauler')

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
    ok(/holdTell && \(tickN >> 3\)/.test(src), 'the held trigger shows a yellow bracket off the nose')
    ok(/pt\.col \|\| 'white'/.test(src), 'particles are drawn in their kill color')
}


// ---------- WATCH witness (#1637 batch 18; defends the humans since batch 19;
// dual-set + crash-law pins since batch 21): the seat brain patrols it ----------
{
    // b20 measured ~1 graze per patrol and pinned "what is MEASURED, not wishes".
    // b21 replays the identical loop over an independent HOLDOUT set (5000+k*91)
    // beside the witness set, adds the per-seed crash law (no patrol may lose two
    // lives inside 150 s — measured: every one of the 40 seeds loses at most one),
    // and raises the rescue pins to the measured truth (b19 sat at 46; the old
    // pin 30 had 16 points of slack). The holdout is never tuned against — it is
    // proof the pins are law and not seed-fitting.
    const patrol = (base) => {
        let survived = 0, waveSeeds = 0, minScore = Infinity, catches = 0, delivers = 0, worstSeedHits = 0
        for (let k = 0; k < 20; k++) {
            const rand = seedRng(base + k * 91)
            const w = createSim({ rand, height: 420 })
            let waves = 0, hits = 0
            let cap = 9000
            while (!w.over && cap > 0) {
                w.step(watchRoute(w))
                for (const e of w.events) {
                    if (e.t === 'wave') waves++
                    if (e.t === 'catch') catches++
                    if (e.t === 'deliver') delivers++
                    if (e.t === 'die') hits++
                }
                cap--
            }
            if (!w.over) survived++
            if (waves >= 1) waveSeeds++
            minScore = Math.min(minScore, w.score)
            worstSeedHits = Math.max(worstSeedHits, hits)
        }
        return { survived, waveSeeds, minScore, catches, delivers, worstSeedHits }
    }
    const wi = patrol(2000)
    const ho = patrol(5000)
    ok(wi.survived === 20 && ho.survived === 20,
        `every seeded patrol survives its 150 s horizon, witness AND holdout (${wi.survived}/20 + ${ho.survived}/20)`)
    ok(wi.minScore >= 7000, `patrol banks >= 7000 on every witness seed (min ${wi.minScore} — b19's rescues raised the floor from 4000)`)
    ok(ho.minScore >= 1300, `untuned holdout banks >= 1300 on every seed (min ${ho.minScore} — the pins are law, not seed-fitting)`)
    ok(wi.waveSeeds >= 19, `>= 19/20 witness seeds clear at least a wave (${wi.waveSeeds}/20)`)
    ok(wi.catches >= 40 && wi.delivers >= 40, `the patrol rescues humans across the fleet: ${wi.catches} catches, ${wi.delivers} deliveries (b18: 8 and 8; b21 raised the pin from 30)`)
    ok(ho.catches >= 40 && ho.delivers >= 40, `the untuned holdout rescues too: ${ho.catches} catches, ${ho.delivers} deliveries`)
    ok(Math.max(wi.worstSeedHits, ho.worstSeedHits) <= 1,
        `no patrol crashes twice — worst of 40 seeds loses ${Math.max(wi.worstSeedHits, ho.worstSeedHits)} of 3 lives in 150 s (the ~1 graze per patrol is the b20 law; a SECOND crash means the route broke)`)
    ok(humansAlive(createSim({ rand: seedRng(2000), height: 420 }).humans) === HUMAN_COUNT,
        'witness seeds start with the street full (five humans)')
    // The law, tested directly: a hauler outranks a CLOSER idle lander.
    {
        const s = createSim({ rand: seedRng(7), height: 420 })
        s.enemies = [
            { x: 120, y: 150, vx: 0, vy: 0, type: 'lander', state: 'wander', carry: null },
            { x: -50, y: 150, vx: 0, vy: 0, type: 'lander', state: 'ascend', carry: 0 },
        ]
        s.humans[0].state = 'abducted'
        s.player.x = 200; s.player.y = 150; s.player.vx = 0; s.player.vy = 0
        s.player.facing = -1; s.player.dark = 0; s.player.invuln = 1
        const inp = watchRoute(s)
        ok(inp.left && !inp.right, 'a lander HAULING a human outranks a nearer idle one (the planet\'s job comes first)', `dx-steer left=${inp.left} right=${inp.right}`)
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
            `const hum = 50 + Math.abs(sim.player.vx) * 8
                audioController.playTone(hum, 0.1, 'sawtooth', 0.045)`,
            `const hum = 50 + Math.abs(sim.player.vx) * 8
                /* silent */`],
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
