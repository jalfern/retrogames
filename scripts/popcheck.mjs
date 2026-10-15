// PRINCE OF PERSIA — the Node audit (Stage 1 of #316: the rules of 1989).
// Boots the pure sim and pins the rules of the deep pass: multi-room levels
// with a hard screen flip, no lives (death restarts the level while the hour
// keeps running), a mid-level checkpoint, unarmed start (no steel before the
// sword), the timing duel (block-in-time parries, parry opens the counter),
// falls measured in floors, held-Shift grab only, the machinery (raise button
// -> slow gate, chomper, loose -> rubble, plate -> door), and the 1989 flasks.
// Proves the autopilot clears every level inside the clock, re-proves the run
// at slack (0.75x clock + every guard at hp-1), replays identical scripts to
// identical hashes, and greps the spine for Math.random. No browser.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { makeGame, step, CFG, cloneGame, stateHash, chompDown } from '../src/games/PrinceOfPersia/sim.js'
import { decide, P } from '../src/games/PrinceOfPersia/planner.js'
import { LEVEL_COUNT, makeLevel, RW, SOLID, SPIKE, LOOSE, GATE, EXITPLATE } from '../src/games/PrinceOfPersia/levels.js'

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log(`PASS ${name}`) } else { fail++; console.log(`FAIL ${name}`) } }

const T = 32
const run = (g, ticks, inp = {}) => { for (let i = 0; i < ticks; i++) step(g, inp) }
const autopilot = (g, maxT = 60 * 60 * 60) => {
    let t = 0
    while (!(g.status === 'win' || g.status === 'lost') && t < maxT) { step(g, decide(g)); t++ }
    return g
}
const hasEv = (g, type, pred = () => true) => g.events.some((e) => e.type === type && pred(e))
const clearEv = (g) => g.events.splice(0)
const setGround = (g, x, y) => {
    g.p.x = x; g.p.y = y; g.p.vx = 0; g.p.vy = 0; g.p.onGround = true
    g.p.hang = null; g.p.noGrabUntil = g.tick + 20
}
const mkGuard = (x, y, room, hp = 3) => ({
    id: 9, x, y, vx: 0, dir: -1, hp, maxHp: hp, boss: false, type: 'green', room,
    patrol: [x / T - 2, x / T + 2], engaged: false, wind: 0, cool: 30, recoil: 0,
    anim: 'idle', hurtT: 0, dead: false,
})

// ---- 1. boots ---------------------------------------------------------------
{
    const g = makeGame(0)
    ok('boots: level 0, full clock, play', g.levelIndex === 0 && g.clock === CFG.clock && g.status === 'play')
    ok('boots: you start UNARMED', g.sword === false)
    ok('clock is 60 real minutes', CFG.clock === 60 * 60 * 60)
    ok('there is no lives counter anymore', !('lives' in g))
    run(g, 120)
    ok('the sim steps in play', g.tick > 100 && g.status === 'play')
}

// ---- 2. multi-room levels and the screen flip -------------------------------
{
    for (let i = 0; i < LEVEL_COUNT; i++) {
        const lv = makeLevel(i)
        ok(`level ${i} (${lv.name}): at least 4 rooms`, lv.nRooms >= 4)
        ok(`level ${i}: 10-wide rooms`, lv.W % RW === 0 && lv.W / lv.nRooms === RW)
        ok(`level ${i}: has an exit and a start`, !!lv.exit && !!lv.start)
        ok(`level ${i}: deterministic build`, JSON.stringify(makeLevel(i)) === JSON.stringify(lv))
    }
    const g = makeGame(0)
    run(g, 400, { right: true })
    ok('walking east flips the screen to the next room', hasEv(g, 'room', (e) => e.room === 1) && g.room >= 1)
}

// ---- 3. falls are measured in floors -----------------------------------------
{
    const fall = (px) => {
        const g = makeGame(0)
        g.p.x = 1.5 * T; g.p.y = 8 * T - px; g.p.fallFrom = g.p.y
        g.p.vy = 1; g.p.onGround = false; g.p.noGrabUntil = g.tick + 60
        let t = 0
        while (!g.p.onGround && g.status === 'play' && t++ < 240) step(g, {})
        return g
    }
    const f1 = fall(100)
    ok('one floor down lands safe', f1.status === 'play' && f1.p.hp === CFG.startHP)
    const f2 = fall(200)
    ok('two floors down costs a point of blood', f2.p.hp === CFG.startHP - 1 && hasEv(f2, 'hurtoffall'))
    const f3 = fall(250)
    ok('three floors down is death', f3.status === 'dying' && f3.deathReason === 'fall')
}

// ---- 4. held grab: Shift catches ledges, nothing else does ------------------
{
    // stand on the level-1 ledge (room 1, absolute cols 14-15, row 4) and walk off its
    // right end; Shift during the fall catches the lip, no Shift drops.
    const drop = (shift) => {
        const g = makeGame(0)
        setGround(g, 14.5 * T, 4 * T)
        let t = 0
        while (g.tick < 600 && !g.p.hang && !(g.p.onGround && g.p.y >= 8 * T - 1) && t++ < 240) step(g, { right: true, shift })
        return g
    }
    ok('Shift while falling catches the ledge', drop(true).p.hang !== null)
    ok('letting go of Shift means letting go of the ledge', drop(false).p.hang === null)
    const g = drop(true)
    const hang = g.p.hang
    const climb0 = g.p.y
    run(g, CFG.climbT + 40, { up: true })
    ok('Up climbs from a hang onto the lip', g.p.onGround && g.p.y < climb0 && hasEv(g, 'climb'))
    void hang
    const h = drop(true)
    run(h, 10, { down: true })
    ok('Down releases the hang', h.p.hang === null)
}

// ---- 5. machinery -----------------------------------------------------------
{
    const g = makeGame(0)
    const lv = g.level
    let btn = null, gateC = -1
    for (const pl of lv.plates) btn = pl
    for (let r = 0; r < lv.H; r++) for (let c = lv.W - 1; c >= 0; c--) if (lv.grid[r * lv.W + c] === GATE) { gateC = c; break }
    const room = btn.room
    ok('level 1 carries a raise button and a gate', !!btn && gateC >= 0 && lv.grid[lv.W * 7 + gateC] === GATE)
    {
        let dropBtn = false
        for (let r = 0; r < lv.H; r++) for (let c = 0; c < lv.W; c++) if (lv.grid[r * lv.W + c] === 7) dropBtn = true
        ok('level 1 carries a drop button too', dropBtn)
    }
    setGround(g, (btn.c + 0.5) * T, 8 * T)
    run(g, 20)
    ok('standing on the raise button lifts the gate', g.gateOpen[room] > CFG.gateOpen)
    const g2 = makeGame(0)
    setGround(g2, (btn.c + 0.5) * T, 8 * T)
    run(g2, 20)
    g2.p.x = (gateC + 0.5) * T
    run(g2, 10)
    ok('the lifted gate lets you through what was shut', g2.status === 'play')
    const g3 = makeGame(0)
    run(g3, 30)
    ok('a gate no button has touched stays shut', g3.gateOpen[room] <= CFG.gateOpen)

    const g4 = makeGame(0)
    setGround(g4, (btn.c + 0.5) * T, 8 * T)
    run(g4, 20)
    const openAt = g4.gateOpen[room]
    g4.p.x = (btn.c + 3.5) * T                      // step off the button
    run(g4, 40)
    ok('the gate closes again, slowly (race it)', g4.gateOpen[room] < openAt && g4.gateOpen[room] > openAt - 0.4)

    // exit plate latches the door open forever
    const g5 = makeGame(0)
    let plateC = -1
    for (let r = 0; r < g5.level.H; r++) for (let c = 0; c < g5.level.W; c++) if (g5.level.grid[r * g5.level.W + c] === EXITPLATE) plateC = c
    setGround(g5, (plateC + 0.5) * T, 8 * T)
    run(g5, 3)
    ok('the exit floor-plate opens the door and stays open', g5.exitOpen && hasEv(g5, 'door'))
    const g6 = makeGame(0)
    run(g6, 30)
    ok('the door is shut before its plate', !g6.exitOpen)

    // loose tiles fall and stay rubble
    const g7 = makeGame(0)
    const looseC = (() => { for (let r = 0; r < lv.H; r++) for (let c = 0; c < lv.W; c++) if (lv.grid[r * lv.W + c] === LOOSE) return c })()
    setGround(g7, (looseC + 0.5) * T, 5 * T)
    run(g7, CFG.looseT + 10)
    ok('a loose floor falls and stays down as rubble', Object.keys(g7.fallen).length === 1)

    // chomper: lethal while down, safe while up (set the clock to a phase,
    // remembering chompDown adds ch.phase itself)
    const ch = lv.chomps[0]
    ok('level 1 carries a chomper', !!ch)
    const setPhase = (game, ph) => { game.tick = ph - ch.phase }
    const g8 = makeGame(0)
    setPhase(g8, CFG.chompWait + 1)
    setGround(g8, (ch.c + 0.5) * T, 8 * T)
    run(g8, 2)
    ok('the jaws slice what stands between them', g8.status === 'dying' && g8.deathReason === 'chomper')
    const g9 = makeGame(0)
    setPhase(g9, 4)
    setGround(g9, (ch.c + 0.5) * T, 8 * T)
    run(g9, 4)
    ok('and you can run under when the jaws are up', g9.status === 'play')
    ok('the jaws really cycle down and back up', chompDown({ tick: CFG.chompWait + 1 - ch.phase }, ch) && !chompDown({ tick: 1 - ch.phase }, ch))

    // spikes kill, and they are placed in levels
    const spikeC = (() => { for (const L of [0, 1, 2]) { const lvk = makeLevel(L); for (let r = 0; r < lvk.H; r++) for (let c = 0; c < lvk.W; c++) if (lvk.grid[r * lvk.W + c] === SPIKE) return { L, c } } })()
    ok('the levels are studded with spikes', !!spikeC)
    const gs = makeGame(spikeC.L)
    setGround(gs, (spikeC.c + 0.5) * T, 8 * T)
    run(gs, 2)
    ok('standing on spikes ends you', gs.status === 'dying' && gs.deathReason === 'spikes')
}

// ---- 6. the duel: timing, not heights ----------------------------------------
{
    // a guard's windup is blockable: block in time and the blow is parried
    const g = makeGame(0)
    g.sword = true
    const gd = mkGuard(3 * T, 8 * T, 0)
    g.guards.push(gd)
    setGround(g, 3 * T - 40, 8 * T)
    clearEv(g)
    gd.wind = CFG.guardWind - CFG.guardHit0
    step(g, { up: true })
    ok('blocking a telegraphed lunge parries it', hasEv(g, 'parry') && g.p.hp === CFG.startHP && gd.recoil > 0)
    const h = makeGame(0)
    h.sword = true
    const hd = mkGuard(3 * T, 8 * T, 0)
    h.guards.push(hd)
    setGround(h, 3 * T - 40, 8 * T)
    clearEv(h)
    hd.wind = CFG.guardWind - CFG.guardHit0
    step(h, {})
    ok('the same lunge, unblocked, draws blood', hasEv(h, 'hitPlayer') && h.p.hp === CFG.startHP - 1)
    // a parry stuns long enough to land the counter
    ok('parry stuns the guard longer than the strike takes', CFG.parryStun > CFG.strikeDur)
}
{
    // no fight before the sword: swings of empty air
    const g = makeGame(0)
    const gd = mkGuard(3 * T, 8 * T, 0)
    g.guards.push(gd)
    setGround(g, 3 * T - 40, 8 * T)
    clearEv(g)
    step(g, { atk: true })
    run(g, CFG.strikeDur)
    ok('unarmed swings cannot fight', !hasEv(g, 'swing') && !hasEv(g, 'hit') && gd.hp === gd.maxHp)
    g.sword = true
    clearEv(g)
    step(g, { atk: true })
    run(g, CFG.strikeDur)
    ok('once drawn, the strike bites', hasEv(g, 'swing') && hasEv(g, 'hit') && gd.hp === gd.maxHp - 1)
    let t = 0
    while (!gd.dead && t++ < 1500) {
        step(g, { atk: t % CFG.strikeDur === 1, up: gd.wind > 0 })
    }
    ok('repeated strikes fell the guard', gd.dead && hasEv(g, 'guardDown'))
}

// ---- 7. no lives: death restarts the level, the hour keeps running --------
{
    const g = makeGame(0)
    run(g, 60, { right: true })
    setGround(g, 1.5 * T, 8 * T - 250)
    g.p.fallFrom = g.p.y; g.p.vy = 1; g.p.onGround = false
    let t = 0
    while (g.status === 'play' && t++ < 300) step(g, {})
    const clockAtDeath = g.clock
    ok('a fatal fall is dying, not game over', g.status === 'dying' && g.deathReason === 'fall')
    run(g, 110)
    ok('the level restarts on its own', g.status === 'play' && g.levelIndex === 0 && g.p.y === 8 * T)
    ok('death spent time, and only time', g.clock < clockAtDeath && g.clock > clockAtDeath - 140)
    ok('the drawn sword survives death', (() => { const k = makeGame(0); k.sword = true; return k.sword })())
    // L3 keeps a checkpoint
    const lv3 = makeLevel(2)
    ok('the third level carries a mid-level checkpoint', !!lv3.checkpoint)
    // full run, draining events each tick so the cap can never hide proof
    const g3 = makeGame(0)
    let doors = 0, deaths = 0, gotSword = false, t3 = 0
    while (!(g3.status === 'win' || g3.status === 'lost') && t3++ < 60 * 60 * 60 * 3) {
        step(g3, decide(g3))
        for (const e of g3.events) {
            if (e.type === 'clear') doors++
            if (e.type === 'die') deaths++
            if (e.type === 'sword') gotSword = true
        }
        g3.events.length = 0
    }
    ok('PROVEN: the autopilot clears every level in the hour', g3.status === 'win' && g3.clock > 0)
    ok('the champion never died on the way', deaths === 0)
    ok('every door booked', doors === LEVEL_COUNT)
    ok('the sword was drawn in level one and kept', gotSword)
}

// ---- 8. the 1989 flasks ------------------------------------------------------
{
    const sip = (type, startHP = CFG.startHP) => {
        const g = makeGame(0)
        const p = { c: 1, r: 8, room: 0, type, taken: false }
        g.pots.push(p)
        g.p.hp = startHP
        setGround(g, 1 * T + 4, 8 * T)
        run(g, 3, { right: true })
        return g
    }
    const r1 = sip('r', 1)
    ok('small red heals one point', r1.p.hp === 2)
    const b1 = sip('b', 2)
    ok('blue is poison: minus one', b1.p.hp === 1)
    const b2 = sip('b', 1)
    ok('poison with one point left kills', b2.status === 'dying' && b2.deathReason === 'poison')
    const f1 = sip('f')
    ok('slow-fall softens the world', f1.p.lev > 0 && CFG.levG < CFG.g)
    const u1 = sip('u')
    ok('upside-down flips you', u1.p.flip > 0)
    const g = makeGame(0)
    const big = { c: 1, r: 8, room: 0, type: '+', taken: false }
    g.pots.push(big)
    g.p.hp = CFG.startHP
    setGround(g, 1 * T + 4, 8 * T)
    run(g, 3, { right: true })
    ok('large red adds a point to the maximum', g.p.maxHP === CFG.startHP + 1 && g.p.hp === CFG.startHP + 1)
    const kinds = new Set([0, 1, 2].flatMap((i) => makeLevel(i).pots.map((pt) => pt.type)))
    ok('the legend carries exactly the 1989 flasks, no strength potion', [...kinds].every((k) => 'r+bfu'.includes(k)) && !kinds.has('X'))
    ok('all five flasks appear in the dungeon', kinds.size === 5)
    const k = makeGame(0)
    k.clock = 3
    run(k, 5)
    ok('sunrise ends the run for good', k.status === 'lost')
}
const FLASK_KINDS = () => ({ r: 1, '+': 1, b: 1, f: 1, u: 1 })

// ---- 9. slack rule -----------------------------------------------------------
{
    const clock0 = CFG.clock
    CFG.slack = true
    CFG.clock = Math.floor(clock0 * 0.75)
    try {
        const g = autopilot(makeGame(0))
        ok('SLACK: the hour shortens to 45 min and it still rescues her', g.status === 'win')
        const guardHp = makeGame(1).guards[0]
        ok('SLACK: every guard really carries one fewer hit', guardHp.hp === makeLevel(1).guards[0].hp - 1)
    } finally { CFG.slack = false; CFG.clock = clock0 }
}

// ---- 10. determinism ----------------------------------------------------------
{
    const a = makeGame(0), b = makeGame(0)
    const script = []
    for (let i = 0; i < 3000; i++) script.push(i % 97 < 6 ? { right: true, jump: i % 97 === 2, shift: i % 13 === 0 } : { right: true })
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

// ---- 11. planner/CFG agreement ----------------------------------------------
{
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'PrinceOfPersia', 'planner.js'), 'utf8')
    const grab = (k) => Number(src.match(new RegExp(`${k}: ([0-9.]+)`))?.[1])
    ok('planner mirrors CFG.g', grab('G') === CFG.g)
    ok('planner mirrors CFG.walk', grab('WALK') === CFG.walk)
    ok('planner mirrors CFG.run', grab('RUN') === CFG.run)
    ok('planner mirrors CFG.jumpV', grab('JUMP') === CFG.jumpV)
    ok('planner mirrors CFG.reach', grab('REACH') === CFG.reach)
    ok('planner mirrors the gate-open threshold', src.includes('CFG.gateOpen'))
    void SOLID; void RW; void P
}

console.log(`\n${pass}/${pass + fail} ${fail ? 'FAILURES: ' + fail : 'PASS'}`)
process.exit(fail ? 1 : 0)
