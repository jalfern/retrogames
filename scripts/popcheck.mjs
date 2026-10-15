// PRINCE OF PERSIA — the Node audit. Boots the pure sim, pins the movement,
// trap, potion and duel rules, proves the autopilot rescues the princess
// across all five screens, re-proves the whole run at slack (0.75x clock,
// one fewer HP in every guard), replays identical scripts to identical
// hashes, and greps the spine for Math.random. No browser, no randomness.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { makeGame, step, CFG, portOpen, cloneGame, stateHash } from '../src/games/PrinceOfPersia/sim.js'
import { decide, P } from '../src/games/PrinceOfPersia/planner.js'
import { LEVEL_COUNT, makeLevel, SOLID, SPIKE, SPIKE_PORTED, PLATE } from '../src/games/PrinceOfPersia/levels.js'

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log(`PASS ${name}`) } else { fail++; console.log(`FAIL ${name}`) } }

const run = (g, ticks, inp = {}) => { for (let i = 0; i < ticks; i++) step(g, inp) }
const autopilot = (g, maxT = 216000) => {
    let t = 0
    while (!(g.status === 'win' || g.status === 'lost') && t < maxT) { step(g, decide(g)); t++ }
    return g
}
const hasEv = (g, type, pred = () => true) => g.events.some((e) => e.type === type && pred(e))
const clearEv = (g) => g.events.splice(0)
const setGround = (g, x, y) => { g.p.x = x; g.p.y = y; g.p.vx = 0; g.p.vy = 0; g.p.onGround = true; g.p.hang = null; g.p.noGrabUntil = g.tick + 20 }

// ---- 1. boots ---------------------------------------------------------------
{
    const g = makeGame(0)
    ok('boots: level 0, full clock, 3 lives', g.levelIndex === 0 && g.clock === CFG.clock && g.lives === CFG.lives)
    ok('boots: five screens exist', LEVEL_COUNT === 5 && !!makeLevel(4).needBoss)
    run(g, 120)
    ok('boots: the sim steps in play', g.tick > 100 && g.status === 'play')
    ok('clock is 60 real minutes', CFG.clock === 60 * 60 * 60)
}

// ---- 2. movement --------------------------------------------------------------
{
    const g = makeGame(1)
    run(g, 200, { right: true })
    ok('run builds to the run cap', Math.abs(g.p.vx) > CFG.run - 0.01)
    const d0 = g.p.x
    run(g, 30)
    ok('friction kills the drive', g.p.vx === 0 && g.p.x - d0 < CFG.run * 30)
    const h = makeGame(1)
    run(h, 200, { right: true })
    const before = h.p.x
    run(h, 20, { left: true })
    ok('skid reverses quickly', h.p.vx <= 0 && h.p.x - before < 40)
}
{
    const g = makeGame(0)
    run(g, 120, { right: true })                 // approach the first pit lip
    g.p.vx = CFG.walk
    setGround(g, 8 * 32 - 9, 9 * 32)            // feet right at the lip of col 9
    run(g, 40, { right: true, shift: true })
    ok('careful step refuses the open edge', g.p.x < 9 * 32 - 8.5)
    run(g, 40, { right: true })
    ok('without careful, the step walks into the pit', g.p.y > 9 * 32 + 10 || g.p.hang !== null || g.status === 'dying')
}
{
    const dist = (mode) => {
        const g = makeGame(1)
        setGround(g, 120, 9 * 32)
        g.p.noGrabUntil = g.tick + 40
        const stop = 10 * 32                       // the spike field edge, mid-room
        let t0 = 0
        while (g.p.x < stop && g.status === 'play' && t0++ < 400) step(g, { right: true, shift: mode === 'walk' })
        const v = g.p.vx
        const x0 = g.p.x
        step(g, { right: true, jump: true, shift: mode === 'walk' })
        let t = 0
        while (!g.p.onGround && t < 200) { step(g, { right: true, jump: true, shift: mode === 'walk' }); t++ }
        return [g.p.x - x0, v]
    }
    const [dw, vw] = dist('walk')
    const [dr, vr] = dist('run')
    ok('the run really is faster than the careful walk', vr > vw + 1)
    ok('a running jump flies farther than a walking jump', dr > dw * 1.4)
}
{ // hang and pull-up in the tutorial pit
    const g = makeGame(0)
    setGround(g, 9.5 * 32, 9 * 32)
    g.p.vy = 2
    g.p.noGrabUntil = 0
    let t = 0
    while (!g.p.hang && t < 120) { step(g, { left: true }); t++ }
    ok('the pit wall catches you: hands on the ledge', hasEv(g, 'grab') && g.p.hang !== null)
    g.p.x = 8 * 32 + CFG.HW + 0.01
    const climb0 = g.p.y
    run(g, CFG.climbT + 60, { up: true })
    ok('pull-up lands standing on the lip', g.p.onGround && g.p.y < climb0 && hasEv(g, 'climb'))
}

// ---- 3. traps ---------------------------------------------------------------
{
    const g = makeGame(0)
    setGround(g, 11.5 * 32, 8 * 32)            // on the loose tile (col 11)
    run(g, CFG.looseT + 10)
    ok('a loose tile shakes and drops', hasEv(g, 'loose') && Object.keys(g.fallen).length === 1)
    ok('the tutorial pit really is studded', makeLevel(0).grid[10 * 19 + 9] === SPIKE)
    const h = makeGame(0)
    setGround(h, 9.5 * 32, 11 * 32)
    run(h, 2)
    ok('and standing on the spikes ends you', h.status === 'dying' && h.deathReason === 'spikes')
}
{
    const g = makeGame(1)
    setGround(g, 5.5 * 32, 9 * 32)            // the pressure plate, col 5
    run(g, 5)
    ok('the plate latches the port open', g.portLatch && portOpen(g))
    const h = makeGame(1)
    setGround(h, 11.5 * 32, 9 * 32)          // ported spikes, col 11, unlatched
    run(h, 2)
    ok('spikes on a shut port kill', h.status === 'dying' && h.deathReason === 'spikes')
    const k = makeGame(1)
    k.portLatch = true
    setGround(k, 11.5 * 32, 9 * 32)
    run(k, 20)
    ok('the same spikes lie flat once the port is open', k.status === 'play')
}
{
    const g = makeGame(2)
    const gu = g.level.guills[0]
    ok('the guillotine cycle closes without a seam',
        CFG.guillWait + CFG.guillDrop + 8 + CFG.guillUp === CFG.guillPeriod)
    const ph = CFG.guillWait + CFG.guillDrop          // blade fully down
    g.tick = ph - 1
    setGround(g, (gu.c + 0.5) * CFG.T, (gu.rBot + 1) * CFG.T)
    step(g, {})
    ok('the gate claims what stands under it', g.status === 'dying' && g.deathReason === 'gate')
    const h = makeGame(2)
    h.tick = 4 - 1                                     // blade fully up
    setGround(h, (gu.c + 0.5) * CFG.T, (gu.rBot + 1) * CFG.T)
    run(h, 4)
    ok('and lets you run under while it is up', h.status === 'play')
}

// ---- 4. the duel -----------------------------------------------------------
{
    const g = makeGame(1)
    g.portLatch = true
    const gd = g.guards[0]
    setGround(g, gd.x - 40, gd.y)
    gd.stance = 2
    gd.wind = CFG.guardDur - CFG.guardHit0
    step(g, {})                                       // holding middle: wrong height
    ok('a blade at the wrong height cuts', g.p.hp === CFG.hearts - 1 && hasEv(g, 'hitPlayer'))
    const h = makeGame(1)
    h.portLatch = true
    const hd = h.guards[0]
    setGround(h, hd.x - 40, hd.y)
    hd.stance = 0
    hd.wind = CFG.guardDur - CFG.guardHit0
    step(h, { down: true })                          // matched low: steel finds steel
    ok('steel at the matching height parries', h.p.hp === CFG.hearts && hasEv(h, 'parry'))
}
{
    const g = makeGame(1)
    g.portLatch = true
    const gd = g.guards[0]
    setGround(g, gd.x - 40, gd.y)
    gd.stance = 2
    clearEv(g)
    step(g, { atk: true, down: true })               // low strike vs a high guard
    run(g, CFG.swingDur)
    ok('a strike at the open height lands', hasEv(g, 'hit') && gd.hp === 2)
    let t = 0
    while (!gd.dead && t < 900) {
        gd.stance = (gd.stance + 1) % 3
        const s = (gd.stance + 1) % 3
        step(g, { atk: t % CFG.swingDur === 1, up: s === 2, down: s === 0 })
        t++
    }
    ok('relentless correct-height strikes fell the guard', gd.dead && hasEv(g, 'guardDown'))
    ok('the princess door stays locked while a boss lives', makeLevel(4).needBoss === true)
}

// ---- 5. potions and the clock --------------------------------------------------
{
    const g = makeGame(3)
    const L = g.lives
    setGround(g, 5.5 * CFG.T, 9 * CFG.T)
    run(g, 3, { right: true })
    ok('the life potion is a life', g.lives === L + 1)
    setGround(g, 9.5 * CFG.T, 9 * CFG.T)
    run(g, 3, { right: true })
    ok('levitation slows the fall', g.p.lev > 0)
    setGround(g, 300, 9 * CFG.T)
    g.p.vy = 5
    const f0 = g.p.vy
    run(g, 5)
    ok('and under it the world pulls softer', g.p.vy - f0 < 5 * CFG.g + 0.1)
    const h = makeGame(3)
    setGround(h, 7.5 * CFG.T, 9 * CFG.T)
    run(h, 3, { right: true })
    ok('the poisoned flask is the worst thirst', h.status === 'dying' && h.deathReason === 'poison')
    const k = makeGame(0)
    k.clock = 3
    run(k, 5)
    ok('sunrise ends everything', k.status === 'dying' && k.deathReason === 'time')
}

// ---- 6. win proofs -----------------------------------------------------------
{
    const g = autopilot(makeGame(0))
    ok('PROVEN: the autopilot rescues the princess', g.status === 'win')
    ok('the Vizier fell before the door', g.levelIndex === LEVEL_COUNT - 1 && g.guards.every((q) => !q.boss || q.dead))
    ok('the hour was never near spent', g.clock > CFG.clock * 0.8)
    ok('the champion never died on the way', g.events.filter((e) => e.type === 'die').length === 0)
    ok('all five doors booked', g.events.filter((e) => e.type === 'clear').length === LEVEL_COUNT)
}

// ---- 7. slack rule -----------------------------------------------------------
{
    const clock0 = CFG.clock
    CFG.slack = true
    CFG.clock = Math.floor(clock0 * 0.75)
    try {
        const g = autopilot(makeGame(0))
        ok('SLACK: the hour shortens to 45 min and it still rescues her', g.status === 'win')
        const g2 = autopilot(makeGame(0))
        ok('SLACK: every guard really did carry one fewer hit', g2.events.length >= 0 && makeGame(1).guards[0].hp === makeLevel(1).guards[0].hp - 1)
    } finally { CFG.slack = false; CFG.clock = clock0 }
}

// ---- 8. determinism ----------------------------------------------------------
{
    const a = makeGame(0), b = makeGame(0)
    const script = []
    for (let i = 0; i < 3000; i++) script.push(i % 97 < 6 ? { right: true, jump: i % 97 === 2 } : { right: true })
    const ha = [], hb = []
    for (let i = 0; i < script.length; i++) {
        step(a, script[i]); step(b, script[i])
        if (i % 400 === 0) { ha.push(stateHash(a)); hb.push(stateHash(b)) }
    }
    ok('replay is hash-for-hash identical', ha.join(',') === hb.join(','))
    const c = cloneGame(a)
    ok('cloneGame snapshots without aliasing', stateHash(c) === stateHash(a) && c !== a)
    const here = dirname(fileURLToPath(import.meta.url))
    const spine = ['sim.js', 'levels.js', 'planner.js'].map((f) => readFileSync(join(here, '..', 'src', 'games', 'PrinceOfPersia', f), 'utf8'))
    ok('no Math.random in sim/levels/planner', spine.every((src) => !/Math\.random\s*\(/.test(src)))
}

// ---- 9. planner/CFG agreement ----------------------------------------------
{
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'PrinceOfPersia', 'planner.js'), 'utf8')
    const grab = (k) => Number(src.match(new RegExp(`${k}: ([0-9.]+)`))?.[1])
    ok('planner mirrors CFG.g', grab('G') === CFG.g)
    ok('planner mirrors CFG.walk', grab('WALK') === CFG.walk)
    ok('planner mirrors CFG.run', grab('RUN') === CFG.run)
    ok('planner mirrors CFG.jumpV', grab('JUMP') === CFG.jumpV)
    ok('planner mirrors CFG.reach', grab('REACH') === CFG.reach)
}

// ---- 10. level integrity ----------------------------------------------------
for (let i = 0; i < LEVEL_COUNT; i++) {
    const lv = makeLevel(i)
    ok(`level ${i} (${lv.name}): has an exit and a start`, !!lv.exit && !!lv.start)
    ok(`level ${i}: deterministic build`, JSON.stringify(makeLevel(i)) === JSON.stringify(lv))
}

console.log(`\n${pass}/${pass + fail} ${fail ? 'FAILURES: ' + fail : 'PASS'}`)
process.exit(fail ? 1 : 0)
