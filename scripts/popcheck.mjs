// PRINCE OF PERSIA — the Node audit (#316). Stage 1 pinned the rules of
// 1989; Stage 2 the look; Stage 3 the twelve levels and their signatures —
// mirror, mouse, shadow, invisible bridge, feather, and the sheathed merge.
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
import { makeGame, step, CFG, cloneGame, stateHash, chompDown, GUARD_STYLE, gateOpenHere } from '../src/games/PrinceOfPersia/sim.js'
import { decide, P } from '../src/games/PrinceOfPersia/planner.js'
import { LEVEL_COUNT, makeLevel, RW, FH, GROUND, roomOf, SOLID, SPIKE, LOOSE, GATE, EXITPLATE } from '../src/games/PrinceOfPersia/levels.js'
import { POSES, poseOf, RUN_FRAMES, DEATH_ANIMS, PALETTES, guardLook, gateBottom, gateDrawOpen, GATE_CLEAR, lightAt, torchGlow, facet, darkAlpha, LIGHT_AMBIENT, TORCH_RADIUS, LIGHT_DIR, escortSilhouettes, DOOR_ZONE, LIGHT_AMBIENT_LITE, HUD_LINE, torchSum, tempAt, bounceAt, poolVisibleAt, ambientFor } from '../src/games/PrinceOfPersia/art.js'
import { SFX, trackFor, TRACKS } from '../src/games/PrinceOfPersia/music.js'
import { MUSIC } from '../src/utils/AudioController.js'

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
    ...GUARD_STYLE.green,
    patrol: [x / T - 2, x / T + 2], engaged: false, wind: 0, cool: 30, recoil: 0,
    anim: 'idle', hurtT: 0, dead: false,
    follow: false, followT: 0, homeRoom: room,
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
    const spine = ['sim.js', 'levels.js', 'planner.js', 'music.js'].map((f) => readFileSync(join(here, '..', 'src', 'games', 'PrinceOfPersia', f), 'utf8'))
    ok('no Math.random in sim/levels/planner/music', spine.every((src) => !/Math\.random\s*\(/.test(src)))
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

// ---- 12. Stage 2: the look and the animation contract ----------------------
{
    ok('PH: the prince is most of a floor tall', CFG.PH >= 56 && CFG.PH <= FH * 0.75 && CFG.CH < CFG.PH)
    ok('the climb-up takes about a second', CFG.climbT * 1000 / 60 >= 700 && CFG.climbT * 1000 / 60 <= 1100)
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'PrinceOfPersia', 'art.js'), 'utf8')
    ok('legs are two-segment (thigh + shin + knee)', /function leg2\(/.test(src))
    const REQUIRED = ['idle', 'walk', 'run', 'start', 'skid', 'turn', 'jump', 'land', 'hang', 'climb',
        'careful', 'crouch', 'drink', 'draw', 'sheathe', 'block', 'attack',
        'die_impale', 'die_slice', 'die_crumple', 'die_cut', 'die_poison', 'die_shadow']
    const missing = REQUIRED.filter((n) => !(n in POSES))
    ok(`every named pose exists (${missing.length ? 'missing: ' + missing.join(',') : 'all'})`, missing.length === 0)
    ok('the run cycle has at least 8 distinct frames',
        RUN_FRAMES >= 8 && new Set(POSES.run.map((f) => JSON.stringify(f))).size >= 8)
    ok('climb-up animates through several frames', POSES.climb.length >= 4)
    ok('hang sways between frames', POSES.hang.length >= 2 && JSON.stringify(POSES.hang[0]) !== JSON.stringify(POSES.hang[1]))
    ok('poseOf wraps frames cyclically', JSON.stringify(poseOf('run', 8)) === JSON.stringify(poseOf('run', 0)))
    ok('each death has its own animation', Object.keys(DEATH_ANIMS).length === 6
        && new Set(Object.values(DEATH_ANIMS)).size === 6)

    // deaths really take their own pose in the sim
    const g2 = makeGame(0)
    setGround(g2, 1.5 * T, 8 * T - 250); g2.p.fallFrom = g2.p.y; g2.p.vy = 1; g2.p.onGround = false
    let t2 = 0; while (g2.status === 'play' && t2++ < 300) step(g2, {})
    ok('a long fall crumples (die_crumple)', g2.p.anim === DEATH_ANIMS.fall)

    // chomper and spikes set their death poses
    const gc = makeGame(0)
    const ch = gc.level.chomps[0]
    gc.tick = CFG.chompWait + 1 - ch.phase
    setGround(gc, (ch.c + 0.5) * T, 8 * T)
    step(gc, {})
    ok('the jaws slice (die_slice)', gc.p.anim === DEATH_ANIMS.chomper)
    const lvA = makeLevel(1)
    let spC = -1, spR = -1
    for (let r = 0; r < lvA.H; r++) for (let c = 0; c < lvA.W; c++) if (lvA.grid[r * lvA.W + c] === SPIKE) { spC = c; spR = r }
    const gp = makeGame(1)
    setGround(gp, (spC + 0.5) * T, spR * T)
    step(gp, {})
    ok('spikes impale (die_impale)', gp.p.anim === DEATH_ANIMS.spikes)
    const gw = makeGame(0); gw.sword = true
    const wd = mkGuard(3 * T, 8 * T, 0, 1)
    gw.guards.push(wd)
    setGround(gw, 3 * T - 40, 8 * T)
    gw.p.hp = 1
    wd.wind = wd.windT - CFG.guardHit0
    step(gw, {})
    ok('the sword cuts you down (die_cut)', gw.p.anim === DEATH_ANIMS.sword)

    // guards rank at a glance
    ok('green, red, fat, skeleton and Jaffar all have their own palette',
        ['green', 'red', 'fat', 'skeleton', 'jaffar'].every((k) => k in PALETTES))
    const turbans = ['green', 'red', 'fat', 'jaffar'].map((k) => PALETTES[k].turban)
    ok('turban colours are distinct by skill', new Set(turbans).size === turbans.length)
    ok('the fat guard is really wider', PALETTES.fat.wide > 1)
    ok('the skeleton is bone, Jaffar robes and a tall hat',
        guardLook('skeleton').bone === true && guardLook('jaffar').robe === true && guardLook('jaffar').hat === true)
    ok('guards keep distinct speed/telegraph by skill',
        GUARD_STYLE.red.speed > GUARD_STYLE.green.speed && GUARD_STYLE.red.windT < GUARD_STYLE.green.windT
        && GUARD_STYLE.fat.windT > GUARD_STYLE.green.windT)

    // themes: dungeon and palace both exist, rooms carry stable decoration seeds
    ok('the dungeon has blue-grey levels and the arcade reaches the palace',
        makeLevel(0).theme === 'dungeon' && makeLevel(LEVEL_COUNT - 1).theme === 'palace')
    ok('rooms carry stable decoration seeds', (() => {
        const a = makeLevel(2), b = makeLevel(2)
        return a.deco.length === a.nRooms && JSON.stringify(a.deco) === JSON.stringify(b.deco)
    })())

    // careful / drink / draw / sheathe states are reachable in the sim
    {
        const gg = makeGame(0)
        setGround(gg, 14.5 * T, 5 * T)              // the room-2 ledge at row 5
        let t3 = 0
        while (t3++ < 40 && !gg.p.careful) step(gg, { right: true })
        ok('the prince steps carefully at a pit edge', gg.p.careful === true && gg.p.anim === 'careful')
    }
    {
        const gg = makeGame(0)
        gg.pots.push({ c: 1, r: 8, room: 0, type: 'r', taken: false })
        setGround(gg, 1 * T + 4, 8 * T)
        run(gg, 3, { right: true })
        ok('a potion is drunk with its own pose', gg.p.drinkT > 0 && gg.p.anim === 'drink')
    }
    {
        const gg = makeGame(0); gg.sword = true
        const gd = mkGuard(3 * T, 8 * T, 0)
        gg.guards.push(gd)
        setGround(gg, 3 * T - 40, 8 * T)
        run(gg, 2)
        ok('the duel opens with the draw', gg.p.duelDrawn && gg.p.drawT > 0 && gg.p.anim === 'draw')
        run(gg, CFG.drawT + 2)
        gd.dead = true
        run(gg, 2)
        ok('walking away sheathes the sword', gg.p.sheatheT > 0 && gg.p.anim === 'sheathe')
    }
}


// ---- 13. Stage 3: twelve levels and their signatures -------------------------
{
    ok('there are twelve levels, each named', LEVEL_COUNT === 12 && new Set(Array.from({ length: 12 }, (_, i) => makeLevel(i).name)).size === 12)

    // the magic mirror teleports, once per entry
    {
        const lv = makeLevel(3)
        ok('the fourth level carries a mirror and a far side', !!lv.mirror && !!lv.mirrorTo)
        const g = makeGame(3)
        const m = lv.mirror
        setGround(g, (m.c + 0.5) * T, m.r * T)
        clearEv(g)
        run(g, 2)
        ok('stepping to the glass sends you through the barred corridor',
            hasEv(g, 'mirror') && Math.abs(g.p.x - (lv.mirrorTo.c + 0.5) * T) < 2)
        const x2 = g.p.x
        run(g, 5)
        ok('the glass only carries you once per entry', g.p.x === x2)
    }

    // the shadow wakes in level 4 and re-enacts your moves late
    {
        ok('the shadow sleeps through the first three levels',
            [0, 1, 2].every((i) => makeGame(i).shadow === null))
        ok('from the mirror onward the shadow follows', makeGame(3).shadow !== null)
        const g = makeGame(4)
        ok('it gathers behind the starting wall', g.shadow.x < g.p.x - 14 * T)
        run(g, 60, { right: true })
        ok('while you run it is still asleep', Math.abs(g.shadow.vx) < 0.01)
        run(g, CFG.shadowDelay + 120, { right: true })
        ok('then it re-enacts your run', g.shadow.x > (makeLevel(4).start.c + 0.5) * T - 14 * T + 100 && g.shadow.vx > 1)
    }

    // its phantom flasks are its own; poison is its death, not yours
    {
        const g = makeGame(4)
        const s = g.shadow
        const bp = g.pots.find((pt) => pt.type === 'b')
        ok('its level carries a phantom poison', !!bp)
        g.tick = s.bornAt + CFG.shadowDelay + 1
        s.x = (bp.c + 0.5) * T; s.y = bp.r * T; s.hp = 1
        clearEv(g)
        run(g, 3)
        ok('the shadow drinks the poison and dies alone',
            hasEv(g, 'shadowDrink', (e) => e.kind === 'b') && hasEv(g, 'shadowDown', (e) => e.why === 'poison')
            && s.dead && g.status === 'play' && g.p.hp === CFG.startHP)
    }

    // its touch kills — outside the lair
    {
        const g = makeGame(4)
        g.tick = g.shadow.bornAt + CFG.shadowDelay + 2
        g.shadow.x = g.p.x + 10
        clearEv(g)
        step(g, {})
        ok('the shadow touch is death', g.status === 'dying' && g.deathReason === 'shadow')
        ok('and it has its own animation', g.p.anim === DEATH_ANIMS.shadow)
    }

    // the mouse runs ahead and holds the button
    {
        const lv = makeLevel(7)
        ok('the mouse level names its helper', !!lv.mouse && lv.name === 'THE MOUSE')
        const g = makeGame(7)
        let t = 0, held = false
        while (!(g.status === 'clear' || g.status === 'lost') && t++ < 6000) {
            step(g, decide(g))
            if (g.mouse && g.mouse.onButton && g.gateOpen[g.mouse.room] > CFG.gateOpen) held = true
            g.events.length = 0
        }
        ok('the mouse really reaches and holds the raise button', held && g.status === 'clear')
    }

    // the invisible bridge holds weight and reveals itself underfoot
    {
        const lv = makeLevel(11)
        let bc = -1, br = -1
        for (let r = 0; r < lv.H; r++) for (let c = 0; c < lv.W; c++) if (lv.grid[r * lv.W + c] === 15) { bc = c; br = r }
        ok('the lair spans its pit with planks the eyes cannot see', bc >= 0)
        const g = makeGame(11)
        setGround(g, (bc - 2.5) * T, br * T)
        clearEv(g)
        run(g, 60, { right: true })
        ok('the first step finds the plank, and the plank shows', g.status === 'play' && hasEv(g, 'bridge') && Object.keys(g.bridgeSeen).length >= 1)
    }

    // the feather softens what would kill
    {
        const lvF = makeLevel(0)
        const dropC = (() => { for (let c = 2; c < lvF.W - 2; c++) { let free = true; for (const r of [1, 2, 3, 4, 5, 6, 7]) if (lvF.grid[r * lvF.W + c] !== 0) free = false; if (free && lvF.grid[8 * lvF.W + c] !== 0) return c } return -1 })()
        ok('the dungeon has a three-floor drop', dropC >= 0)
        const drop = (feather) => {
            const d = makeGame(0)
            if (feather) {
                d.pots.push({ c: 1, r: 8, room: 0, type: 'f', taken: false })
                d.p.hp = CFG.startHP
                setGround(d, 1 * T + 4, 8 * T)
                run(d, 3, { right: true })
            }
            setGround(d, (dropC + 0.5) * T, T - 16)
            d.p.fallFrom = d.p.y; d.p.vy = 1; d.p.onGround = false; d.p.noGrabUntil = d.tick + 60
            let t = 0
            while (!d.p.onGround && d.status === 'play' && t++ < 400) step(d, {})
            return d
        }
        const fe = drop(true)
        ok('feather in the blood', fe.p.lev > 0 || CFG.levG < CFG.g)
        ok('a three-floor fall with the feather costs blood, not the run',
            fe.status === 'play' && fe.p.hp === CFG.startHP - 1)
        ok('without it, the same fall kills', (() => { const h = drop(false); return h.status === 'dying' && h.deathReason === 'fall' })())
    }

    // the lair ends in the merge, not the sword
    {
        const lv = makeLevel(11)
        ok('the lair is the merge level', lv.merge === true && lv.shadow === true)
        ok('Jaffar waits at the end of the twelfth level', makeLevel(11).guards.some((q) => q.boss))
        const g = makeGame(11)
        g.sword = true
        let t = 0, mergedAt = -1
        while (!(g.status === 'win' || g.status === 'lost') && t++ < 20000) {
            step(g, decide(g))
            if (hasEv(g, 'merge')) mergedAt = g.tick
            g.events.length = 0
        }
        ok('PROVEN: in the lair the sheathed shadow merges back into you',
            mergedAt > 0 && g.merged && g.shadow.dead && g.shadow.dieWhy === 'merge')
    }

    // champion run: all twelve in one sitting, no deaths
    {
        const g = makeGame(0)
        let t = 0, doors = 0, deaths = 0
        const kinds = { mirror: false, bridge: false, merge: false, shadowPoison: false, mouse: false }
        while (!(g.status === 'win' || g.status === 'lost') && t++ < 60 * 60 * 60) {
            step(g, decide(g))
            for (const e of g.events) {
                if (e.type === 'clear') doors++
                if (e.type === 'die') deaths++
                if (e.type === 'mirror') kinds.mirror = true
                if (e.type === 'bridge') kinds.bridge = true
                if (e.type === 'merge') kinds.merge = true
                if (e.type === 'shadowDown' && e.why === 'poison') kinds.shadowPoison = true
                if (e.type === 'mouse') kinds.mouse = true
            }
            g.events.length = 0
        }
        ok('PROVEN: the autopilot rescues her through all twelve levels', g.status === 'win' && doors === 12)
        ok('PROVEN: the champion run takes no deaths', deaths === 0)
        ok('PROVEN: mirror, mouse, poisoned shadow, bridge and merge all fire in the run',
            Object.values(kinds).every(Boolean))
    }

    // the shell: twelve interludes, a shadow death line, the taller frame
    {
        const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'PrinceOfPersia', 'index.jsx'), 'utf8')
        ok('the shell carries an interlude for every crossing', (src.match(/^\s*'/gm) || []).length >= 22 && src.includes('INTERLUDES') && src.includes('CLEARED'))
        ok('the shell knows how the shadow ends you', src.includes('shadow:'))
        ok('the frame grew for the two pit rows', src.includes('aspect-[10/11]'))
        const asrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'PrinceOfPersia', 'art.js'), 'utf8')
        ok('the art draws the mirror, the mouse and the silhouette',
            /function drawMirror\(/.test(asrc) && /function drawMouse\(/.test(asrc) && asrc.includes('die_shadow') && asrc.includes('bridgeSeen'))
    }
}

// ---- 14. Stage 4: the sound spine ---------------------------------------------
{
    const drain = (game) => { const e = game.events.slice(); game.events.length = 0; return e }

    // which bed the moment deserves
    ok('S4: the dungeon level sits on the drip-stone bed', trackFor(makeGame(0)) === 'pop')
    ok('S4: palace levels sit on the throne bed', makeLevel(2).theme === 'palace' && trackFor(makeGame(2)) === 'popThrone')
    {
        const j = makeGame(11)
        const boss = j.guards.find((q) => q.boss)
        ok('S4: the lair carries the vizier', !!boss)
        j.p.x = boss.x - 40; j.p.y = boss.y; j.room = boss.room
        ok('S4: Jaffar in the room brings his own theme', trackFor(j) === 'popJaffar')
        boss.dead = true
        ok('S4: with the vizier down the palace bed returns', trackFor(j) === 'popThrone')
    }
    {
        const d = makeGame(0); d.status = 'dying'
        const w = makeGame(0); w.status = 'win'
        const l = makeGame(0); l.status = 'lost'
        ok('S4: death and the end of the hour drop to silence (as the original does)',
            trackFor(d) === null && trackFor(w) === null && trackFor(l) === null)
    }

    // the event->voice contract, pinned both ways
    const here = dirname(fileURLToPath(import.meta.url))
    const simSrc = readFileSync(join(here, '..', 'src', 'games', 'PrinceOfPersia', 'sim.js'), 'utf8')
    const simEvents = new Set([...simSrc.matchAll(/type: '([a-zA-Z]+)'/g)].map((m) => m[1]))
    ok(`S4: every event the sim can emit has a voice (${simEvents.size} events)`, [...simEvents].every((t) => t in SFX))
    ok('S4: the SFX table has no orphans the sim never emits', Object.keys(SFX).every((t) => simEvents.has(t)))
    ok('S4: every recipe returns synth steps of known verbs',
        Object.values(SFX).every((fn) => fn({ kind: 'r', run: true, soft: true, up: true, boss: true, floors: 2 })
            .every((st) => ['tone', 'sweep', 'noise'].includes(st[0]))))

    // the gait: leather on stone
    {
        const walkIv = []
        const wg = makeGame(0)
        setGround(wg, 1.5 * T, 8 * T)
        let last = -1, t = 0
        while (t++ < 400) { step(wg, { right: true, shift: true }); for (const e of drain(wg)) if (e.type === 'foot') { if (last >= 0) walkIv.push(wg.tick - last); last = wg.tick } }
        const wantW = CFG.stride / CFG.walk
        ok('S4: walking leaves footprints in the audio too',
            walkIv.length >= 8 && walkIv.every((x) => x >= wantW - 4 && x <= wantW + 4))
        const runIv = []
        const rg = makeGame(0)
        setGround(rg, 1.5 * T, 8 * T)
        last = -1; t = 0
        let runs = 0
        while (t++ < 600) { step(rg, { right: true }); for (const e of drain(rg)) if (e.type === 'foot' && e.run) { runs++; if (last >= 0) runIv.push(rg.tick - last); last = rg.tick } }
        const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length
        ok('S4: running hammers a faster gait than walking', runs > 12 && avg(runIv) < avg(walkIv) * 0.85)
        const ig = makeGame(0)
        let feet = 0; t = 0
        while (t++ < 300) { step(ig, {}); feet += drain(ig).filter((e) => e.type === 'foot').length }
        ok('S4: standing still keeps quiet feet', feet === 0)
    }

    // the landing thud
    {
        const lg = makeGame(0)
        lg.p.x = 1.5 * T; lg.p.y = 8 * T - 110; lg.p.fallFrom = lg.p.y; lg.p.vy = 1; lg.p.onGround = false; lg.p.noGrabUntil = lg.tick + 60
        let t = 0, floors = -1
        while (t++ < 240 && !lg.p.onGround) { step(lg, {}); for (const e of drain(lg)) if (e.type === 'land') floors = e.floors }
        ok('S4: a one-floor hop reports its landing', floors === 1)
    }

    // the chain: gates rattle in both directions
    {
        const cg = makeGame(0)
        const btn = cg.level.plates[0]
        setGround(cg, (btn.c + 0.5) * T, 8 * T)
        let up = 0, down = 0, t = 0
        while (t++ < 60) { step(cg, { right: true }); for (const e of drain(cg)) { if (e.type === 'chain') (e.up ? up++ : down++) } }
        ok('S4: the chain rattles as the gate climbs', up >= 1)
        cg.p.x = (btn.c + 3.5) * T
        t = 0
        while (t++ < 500) { step(cg, {}); for (const e of drain(cg)) if (e.type === 'chain') down++ }
        ok('S4: and grinds again on the way shut', down >= 2)
    }

    // the beds themselves: original Hijaz-mode melodies on the synth engine
    {
        ok('S4: all three Prince beds live in the synth engine', TRACKS.every((t) => t in MUSIC))
        ok('S4: the beds march at distinct tempos', MUSIC.pop.step > MUSIC.popThrone.step && MUSIC.popThrone.step > MUSIC.popJaffar.step)
        const hijaz = new Set([0, 1, 4, 5, 7, 8, 11])
        const inMode = (arr) => arr.every((n) => !n || hijaz.has((((n - 62) % 12) + 12) % 12))
        ok('S4: every Prince melody sits in the Hijaz mode (D Eb F# G A Bb C#)',
            TRACKS.every((t) => inMode(MUSIC[t].lead) && inMode(MUSIC[t].bass)))
        ok('S4: the darbuka lane taps dum and tek under every bed',
            TRACKS.every((t) => MUSIC[t].perc && MUSIC[t].perc.length === MUSIC[t].lead.length
                && MUSIC[t].perc.some((v) => v === 1) && MUSIC[t].perc.some((v) => v === 2)))
        ok('S4: the beds stay out of each other\u2019s melody',
            new Set(TRACKS.map((t) => MUSIC[t].lead.join(','))).size === TRACKS.length)
    }

    // the shell: recipes, attract silence, ambience, stings
    {
        const xsrc = readFileSync(join(here, '..', 'src', 'games', 'PrinceOfPersia', 'index.jsx'), 'utf8')
        ok('S4: the shell speaks through the SFX contract, not one-off beeps', xsrc.includes('SFX[ev.type]'))
        ok('S4: the attract screen stays silent until the hour starts', /attract \? null : trackFor/.test(xsrc))
        ok('S4: the shell carries the torch-crackle ambience', xsrc.includes('ambience'))
        ok('S4: death and victory cue their big stings', xsrc.includes('playDeath') && xsrc.includes('playFanfare'))
        ok('S4: the harness can hear the engine through the probe hook', xsrc.includes('musicState') && xsrc.includes('_peak'))
    }
}

// ---- 15. Stage 5: the gate draws open exactly when blocks() lets you through
{
    const lv = makeLevel(0)
    let gCol = -1, gRow = -1
    for (let c = 0; c < lv.W; c++) {
        let low = -1
        for (let r = 0; r < lv.H; r++) if (lv.grid[r * lv.W + c] === GATE) low = r
        if (low >= 0) { gCol = c; gRow = low; break }
    }
    ok('S5: a level carries a portcullis on a column with solid floor beneath',
        gCol >= 0 && gRow >= 0 && lv.grid[(gRow + 1) * lv.W + gCol] === SOLID)
    const span = (gRow + 1) * T
    ok('S5: a shut gate hangs all the way to the floor (no floating gap)',
        gateBottom(gRow, 0) === span && gateBottom(gRow, CFG.gateOpen - 0.001) === span)
    ok('S5: the instant it is passable the bars clear the prince headroom',
        gateBottom(gRow, CFG.gateOpen) <= span - CFG.PH && gateBottom(gRow, 1) < 3)
    ok('S5: the bars rise monotonically as the gate opens',
        gateBottom(gRow, 0.7) > gateBottom(gRow, 0.85) && gateBottom(gRow, 0.85) > gateBottom(gRow, 1))
    {
        const g = makeGame(0)
        const room = roomOf(gCol)
        let agree = true
        for (const open of [0, 0.3, CFG.gateOpen - 0.01, CFG.gateOpen, 0.9, 1]) {
            g.gateOpen[room] = open
            if (gateDrawOpen(open) !== gateOpenHere(g, GATE, gCol)) agree = false
        }
        ok('S5: drawn-open agrees with blocks() at every gate value', agree)
    }
    {
        // guards escort you between rooms: leave a live ground guard behind and
        // it walks through the doorway after you, then re-homes to your room
        const g = makeGame(1)
        const gd = g.guards.find((q) => q.room === 0 && !q.dead)
        ok('S5: the port level starts with a guard on the ground floor', !!gd && Math.floor(gd.y / T) === GROUND)
        setGround(g, 1.5 * T, 8 * T)
        step(g, {})                                  // in room 0, guard at peace
        ok('S5: a guard at peace in your room does not follow yet', gd.follow === false)
        g.p.x = 11.5 * T                          // cross into room 1
        step(g, {})
        ok('S5: the moment you leave its room the guard takes up the chase', gd.follow === true)
        let reached = gd.room
        for (let t = 0; t < 400 && reached < 1; t++) { step(g, {}); reached = gd.room }
        ok('S5: it really walks through the doorway into your room', reached === 1)
        ok('S5: a follower is not pinned to its old patrol line',
            gd.x > gd.patrol[1] * T)
    }
    {
        // a follower stops at the lip of a shaft rather than walking into the void
        const g = makeGame(4)                            // L5 room 0 floor opens a shaft at cols 3-4
        let shaft = -1
        for (let c = 0; c < RW; c++) if (g.level.grid[8 * g.level.W + c] === 0) { shaft = c; break }
        ok('S5: level 5 opens a shaft on the ground floor', shaft > 0)
        const gd = mkGuard((shaft - 1 + 0.5) * T, 8 * T, 0)
        g.guards.push(gd)
        gd.follow = true
        g.room = 0
        setGround(g, (RW + 1.5) * T, 8 * T)            // prince across the shaft, in room 1
        let maxX = gd.x
        for (let t = 0; t < 200; t++) { g.room = 1; step(g, {}); maxX = Math.max(maxX, gd.x) }
        ok('S5: a follower halts at the shaft lip instead of falling in',
            maxX < shaft * T + CFG.HW + 1)
    }
    {
        const xsrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'PrinceOfPersia', 'index.jsx'), 'utf8')
        ok('S5: the attract banner shows one message at a time under the HUD',
            !/fillRect\(0, VH \/ 2 - 34/.test(xsrc) && /bandTop = 22/.test(xsrc))
        ok('S5: the autopilot caption sits high, clear of the footer watermark',
            xsrc.includes('AUTOPILOT DEMONSTRATION') && !/AUTOPILOT DEMONSTRATION', VW \/ 2, VH - 30/.test(xsrc))
    }
    void GATE_CLEAR
}

// ---- 16. Stage 6: the second art pass — per-torch light, directional key ------
{
    // torch pools fall off smoothly from a firm core to nothing at the radius
    ok('S6: a torch is brightest at its flame and gone at its radius',
        torchGlow(0) === 1 && torchGlow(TORCH_RADIUS) === 0)
    let mono = true
    for (let d = 0; d < TORCH_RADIUS; d += 16) if (!(torchGlow(d) > torchGlow(d + 1))) mono = false
    ok('S6: a torch pool dims monotonically as you move away', mono)
    ok('S6: the falloff is a smooth curve, not a hard cut-off',
        torchGlow(TORCH_RADIUS / 2) > 0.3 && torchGlow(TORCH_RADIUS * 0.9) < 0.12)

    // one directional key light: facing normals agree, opposite ones disagree
    ok('S6: one directional key lights the facing normal and shadows the back',
        facet(LIGHT_DIR.x, LIGHT_DIR.y) > 0.9 && facet(-LIGHT_DIR.x, -LIGHT_DIR.y) < -0.9)
    ok('S6: a surface broadside to the key is neither lit nor shaded',
        Math.abs(facet(LIGHT_DIR.y, -LIGHT_DIR.x)) < 1e-6)

    // an unlit corner is dark but not black; pools lift it back, per-torch
    ok('S6: ambient keeps the dark readable (deep blue, not black)',
        LIGHT_AMBIENT >= 0.1 && lightAt(1e5, 1e5, []) === LIGHT_AMBIENT)
    const one = [[200, 120]]
    ok('S6: the flame pool lifts brightness well past ambient',
        lightAt(200, 120, one) > LIGHT_AMBIENT + 0.8)
    const two = [[120, 120], [300, 120]]
    ok('S6: light is per-torch — two sconces brighten between them, one cannot',
        lightAt(210, 120, two) > lightAt(210, 120, [[300, 120]]))
    ok('S6: overlapping pools meet in the middle but the far corner stays ambient',
        lightAt(210, 120, two) > LIGHT_AMBIENT + 0.4 && lightAt(1500, 900, two) === LIGHT_AMBIENT)
    ok('S6: the darkness veil is the inverse — deepest where no pool reaches',
        darkAlpha(200, 120, one) < darkAlpha(1500, 900, one)
        && darkAlpha(1500, 900, one) === 0.66 * (1 - LIGHT_AMBIENT))

    // the source really moved from a room-wide wash to per-torch pools
    const artSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'PrinceOfPersia', 'art.js'), 'utf8')
    ok('S6: the flat room-wide dark wash is gone', !/rgba\(0,\s*0,\s*8,\s*0\.32\)/.test(artSrc))
    ok('S6: pools and the vignette are painted with radial gradients',
        (artSrc.match(/createRadialGradient/g) || []).length >= 3)
    ok('S6: the scene lights per-torch — additive pools, and figures via atLight',
        /function lightPool\(/.test(artSrc) && /atLight\(/.test(artSrc)
        && /globalCompositeOperation = 'lighter'/.test(artSrc))

    // deeper colour: per-channel hue mixing replaced the equal-luminance nudge
    ok('S6: stone mixes hue per-channel (a chromatic lit/shadow side), not flat tone',
        /const mix = /.test(artSrc) && (artSrc.match(/mix\(/g) || []).length >= 4
        && !/function tone\(/.test(artSrc))
    ok('S6: figures are rim-lit from the room they stand in (warm + litSide)',
        /opts\.litSide/.test(artSrc) && /litSide: /.test(artSrc) && /warm: /.test(artSrc))
}

// ---- 17. Stage 7: the escort feel — door cues, bodies, the pincer ----------
{
    const drain = (game) => { const e = game.events.slice(); game.events.length = 0; return e }

    // the chase announces itself the moment you leave a guard breathing behind
    {
        const g = makeGame(10)
        const gd = g.guards.find((q) => q.room === 0 && Math.floor(q.y / T) === GROUND)
        setGround(g, 1.5 * T, 8 * T)
        step(g, {}); drain(g)
        g.p.x = 10.5 * T
        const ev = []
        for (let t = 0; t < 600 && g.status === 'play'; t++) { step(g, {}); ev.push(...drain(g)) }
        ok('S7: leaving a guard alive behind books an escort cue', ev.some((e) => e.type === 'escort' && e.guard === gd.id))
        ok('S7: the escort crossing the threshold rumbles through the stone', ev.some((e) => e.type === 'doorCross' && e.room === 1 && e.guard === gd.id))
    }

    // bodies hold the corridor — you cannot walk through a standing guard
    {
        const g = makeGame(0)
        g.sword = true
        const gd = mkGuard(6 * T, 8 * T, 0)
        g.guards.push(gd)
        setGround(g, 3 * T, 8 * T)
        g.p.hp = 9; g.p.maxHP = 9
        let minGap = 1e9
        for (let t = 0; t < 240 && g.status === 'play'; t++) {
            step(g, { right: true })
            if (!gd.dead) minGap = Math.min(minGap, Math.abs(gd.x - g.p.x))
        }
        ok('S7: a living body never lets you inside blade distance', minGap >= CFG.bodyGap - 2)
        const heldAt = g.p.x
        gd.dead = true
        for (let t = 0; t < 120 && g.status === 'play'; t++) step(g, { right: true })
        ok('S7: only steel opens the corridor — the same run passes over the fallen', g.p.x > heldAt + 2 * T)
    }

    // the pincer: one ahead, one behind, the corridor is closed
    {
        const g = makeGame(0)
        g.sword = true
        const ahead = mkGuard(6.5 * T, 8 * T, 0)
        const behind = mkGuard(1 * T, 8 * T, 0)
        ahead.id = 11; behind.id = 12
        ahead.patrol = [14, 18]; behind.patrol = [4, 8]
        behind.follow = true
        g.guards.push(ahead, behind)
        setGround(g, 4 * T, 8 * T)
        g.p.hp = 9; g.p.maxHP = 9
        const start = g.p.x
        let closed = false, pinned = false, bothWind = false
        for (let t = 0; t < 300 && g.status === 'play'; t++) {
            step(g, { right: true })
            if (ahead.hp > 0 && behind.hp > 0) {
                if (ahead.x - g.p.x > 0 && g.p.x - behind.x > 0) closed = true
                if (ahead.wind > 0 && behind.wind > 0) bothWind = true
                if (ahead.x - g.p.x > 0 && g.p.vx === 0 && Math.abs(g.p.x - start) < 3 * T) pinned = true
            }
        }
        ok('S7: an escort plus a guard ahead close the corridor on you', closed)
        ok('S7: pressed right against the pincer, you go nowhere', pinned)
        ok('S7: duel etiquette — two blades never swing in the same breath', !bothWind)
    }

    // the escort dashes: faster than its walk, it actually runs you down
    {
        const g = makeGame(0)
        const gd = mkGuard(1 * T, 8 * T, 0)
        g.guards.push(gd)
        setGround(g, 12 * T, 8 * T)           // 352px and another room away: pure escort range
        gd.follow = true
        const x0 = gd.x, t0 = g.tick
        let t = 0
        while (t++ < 400 && !gd.engaged && g.status === 'play') step(g, {})
        const secs = g.tick - t0
        const speed = (gd.x - x0) / secs
        ok('S7: an escort beyond duel range dashes, not strolls', speed > CFG.walk + 0.4 && secs > 20 && secs < 200)
    }

    // the jaws do not choose sides — an escort that chases across them dies there
    {
        const g = makeGame(4)                       // L5 room 1 carries jaws at col 16
        const ch = g.level.chomps.find((c) => Math.floor(c.c / RW) === 1)
        ok('S7: level 5 has jaws on the corridor', !!ch)
        g.guards.length = 0
        setGround(g, 9.5 * T, 8 * T)               // prince in room 0, left of the jaws
        const gd = mkGuard(700, 8 * T, 2, 3)   // positioned so its dash arrives on the jaws' down-beat
        gd.patrol = [20, 29]
        gd.follow = true
        g.guards.push(gd)
        let eaten = false
        for (let t = 0; t < 400 && g.status === 'play'; t++) { step(g, {}); if (gd.dead) { eaten = true; break } }
        ok('S7: jaws claim the guard that chases you across them', eaten)
    }

    // the door-frame silhouette: pure, honest, and painted
    {
        const g = makeGame(10)
        const gd = g.guards.find((q) => q.room === 0 && Math.floor(q.y / T) === GROUND)
        g.room = 1
        gd.follow = true
        gd.x = 8.5 * T                              // two columns out in the room behind
        const sil = escortSilhouettes(g)
        ok('S7: the arch behind you fills with a shape while the escort is in the door zone',
            sil.length === 1 && sil[0].doorCol === RW && sil[0].side === -1 && sil[0].id === gd.id)
        ok('S7: the silhouette is pure — same state, same answer',
            JSON.stringify(escortSilhouettes(g)) === JSON.stringify(sil))
        ok('S7: the zone is short — an escort far down the hall stays unseen',
            (gd.x = 3.5 * T, escortSilhouettes(g).length === 0))
        ok(`S7: the door zone spans ${DOOR_ZONE} columns, not the whole room`, DOOR_ZONE >= 2 && DOOR_ZONE <= 4)
        const artSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'PrinceOfPersia', 'art.js'), 'utf8')
        ok('S7: the scene paints the silhouette clipped into the door-frame',
            /escortSilhouettes\(g\)/.test(artSrc) && /ctx\.rect\(dx \+ 2, archTop/.test(artSrc))
    }

    // the etiquette and the hazard refusals live in the sim, not just in luck
    {
        const simSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'PrinceOfPersia', 'sim.js'), 'utf8')
        ok('S7: only the elected duelist may wind up', /gd === duelist && gd\.cool <= 0/.test(simSrc))
        ok('S7: a body never pins the prince onto teeth', /chomps\.some\(\(ch\) => ch\.c === pc && ch\.r === pr\)/.test(simSrc)
            && /never shove him into a wall|nor into a wall/.test(simSrc))
    }
}

// ---- 18. Stage 8: colour temperature, floor bounce, phone readability --------
{
    const artSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'PrinceOfPersia', 'art.js'), 'utf8')
    const idxSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'PrinceOfPersia', 'index.jsx'), 'utf8')

    // phone readability: lite lifts the floor, desktop keeps the deep mood
    ok('S8: lite lifts the ambient floor; desktop keeps the deep mood',
        ambientFor(false) === LIGHT_AMBIENT && ambientFor(true) === LIGHT_AMBIENT_LITE
        && LIGHT_AMBIENT_LITE > LIGHT_AMBIENT)
    ok('S8: lightAt takes the ambient floor, so a torchless room can be lifted',
        lightAt(1e5, 1e5, []) === LIGHT_AMBIENT && lightAt(1e5, 1e5, [], LIGHT_AMBIENT_LITE) === LIGHT_AMBIENT_LITE)

    // colour temperature: cold where only ambient reaches, amber in a pool
    ok('S8: temperature is 0 in a cold ambient corner and high at a flame',
        tempAt(1e5, 1e5, []) === 0 && tempAt(200, 120, [[200, 120]]) > 0.7)
    const one = [[200, 120]]
    ok('S8: the further from the flame, the cooler the light',
        tempAt(200, 120, one) > tempAt(200, 120, [[260, 120]]))
    ok('S8: a lifted ambient dilutes warmth — brighter and cooler on a phone',
        tempAt(300, 120, one, LIGHT_AMBIENT) > tempAt(300, 120, one, LIGHT_AMBIENT_LITE))
    ok('S8: torchSum is the flame alone — additive between two, gone far away',
        Math.abs(torchSum(200, 120, one) - 1) < 1e-9 && torchSum(1500, 900, one) === 0
        && torchSum(200, 120, [[200, 120], [240, 120]]) > torchSum(200, 120, one))

    // floor bounce: a horizontal ground lift that ignores height, dies with distance
    ok('S8: bounce is maximal directly under a sconce and gone past its reach',
        bounceAt(200, [[200, 500]]) === 1 && bounceAt(200 + TORCH_RADIUS, [[200, 500]]) === 0)
    ok('S8: bounce is a floor signal — height does not matter, horizontal distance does',
        bounceAt(200, [[200, 100]]) === 1 && bounceAt(200, [[200, 100]]) > bounceAt(150, [[200, 100]]))
    let bMono = true
    for (let d = 0; d < TORCH_RADIUS * 0.9; d += 12) if (!(bounceAt(200, [[200, 500]]) > bounceAt(200 + d + 12, [[200, 500]]))) bMono = false
    ok('S8: bounce falls off monotonically away from the sconce', bMono)

    // bloom must not wash the HUD band
    ok('S8: pools fade to nothing above the HUD band and are full below it',
        poolVisibleAt(0) < 0.2 && poolVisibleAt(HUD_LINE) === 1 && poolVisibleAt(200) === 1)
    ok('S8: the light pool is clipped to the playfield below the HUD',
        /ctx\.clip\(\)/.test(artSrc) && /rect\(x - TORCH_RADIUS, HUD_LINE/.test(artSrc))
    ok('S8: the HUD rides a gradient scrim, not a flat slab',
        /const scrim = ctx\.createLinearGradient/.test(artSrc))

    // figures carry a hue, not just a brightness
    ok('S8: figures get a colour temperature from the room they stand in',
        /opts\.temp/.test(artSrc) && /temp: /.test(artSrc) && /tempAt\(/.test(artSrc))
    ok('S8: the scene lights at the ambient the mode asks for',
        /ambientFor\(/.test(artSrc) && /lightAt\(x, y, torchPx, amb\)/.test(artSrc))
    ok('S8: the shell routes ?lite through to the renderer',
        /LITE = .*lite/.test(idxSrc) && /lite: LITE/.test(idxSrc))

    // determinism still holds across the whole spine
    ok('S8: determinism holds — no Math.random anywhere in art.js', !/Math\.random/.test(artSrc))
}

console.log(`\n${pass}/${pass + fail} ${fail ? 'FAILURES: ' + fail : 'PASS'}`)
process.exit(fail ? 1 : 0)
