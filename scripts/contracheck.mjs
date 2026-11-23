// contracheck.mjs — CONTRA (#2779): boots, rules hold, it can be won, and the
// check can be seen to fail.
//
//   node scripts/contracheck.mjs               # sim core + browser leg
//   node scripts/contracheck.mjs --mutant    # plant regressions, demand named harm
//
// The sim core runs in plain Node (sim.js is DOM-free): determinism, the 8-way
// run-and-gun law, one-hit death + respawn mercy, the SPREAD capsule, barrel
// chains, and the S2 laws — the waterfall ratchet camera, drowning torrent,
// vertical wake law, the armored gate with its one weak point and its
// ten-round cannon housings (#2880), and the door
// that cannot spill an army. The WINNABLE proof drives the FULL stage (jungle +
// falls + boss) with the honest-percept autopilot on seeds 1..12.
// Named regressions guard the traps this game almost shipped with: soldiers
// woken past the bullet-despawn edge (S1 — the stage played itself), and a
// core that never opens (S2 — the stage cannot be won). `--mutant` replants
// each and demands the harm is NAMED (#2142 direction).
// The browser leg drives real key events through the shell: attract → seat →
// run/jump/fire → die → restart, plus a warped boss visit, with zero page errors.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { makeGame, step, autopilot, stateHash, CFG, PLATFORMS, FALLS_LEDGES, warpFalls, warpBoss, dropIn, releaseSeat, CARRIER_ALT, vineTip, CASCADE, VINES, loopK, sortieK, LOOP_CAP, LOOP_STEP, LOOP_LIFE_BONUS, LOOP_LIVES_MAX, LOOP_FX, loopVoice, arcadeLoop, applyCall, SOMERSAULT_TICKS } from '../src/games/Contra/sim.js'
import { parseCall, intentKey } from '../src/games/Contra/voicecalls.js'
import { drawCapsule, drawCarrier, seatTagState, TAG_WARN, SKY_BASE, MUZZLE_BASE, heatSky, heatMuzzle } from '../src/games/Contra/art.js'
import { openGame, launch, requireDevServer, Report } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIM = join(ROOT, 'src/games/Contra/sim.js')
const ART = join(ROOT, 'src/games/Contra/art.js')
const BASE = process.env.CONTRA_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const MUTANT = process.argv.includes('--mutant')

const r = new Report('contracheck')

// ---------------------------------------------------------------- sim core ---
const runSeed = (seed, policy = autopilot, max = 20000) => {
    const gs = makeGame(seed)
    const seen = { efire: 0, wakesOut: 0, booms: 0 }
    for (const s of gs.soldiers) s._woken = false
    for (const s of gs.snipers) s._woken = false
    while (!gs.end && gs.tick < max) {
        step(gs, policy(gs))
        for (const s of gs.soldiers) if (s.awake && !s._woken) {
            s._woken = true
            if (s.x >= gs.cam + WVIEW - 2 || s.y >= gs.camY + HVIEW - 2) seen.wakesOut++
        }
        // S3: the spawn-shield law spans the new roster too
        for (const s of gs.snipers) if (s.awake && !s._woken) {
            s._woken = true
            if (s.x >= gs.cam + WVIEW - 2 || s.y >= gs.camY + HVIEW - 2) seen.wakesOut++
        }
        for (const e of gs.ev) { if (e.type === 'efire') seen.efire++; if (e.type === 'boom') seen.booms++ }
        gs.ev.length = 0
    }
    return { gs, ...seen }
}
const WVIEW = 384
const HVIEW = 224 // view spans kept literal here so the wake audit is independent of sim internals

r.check('boots: makeGame/step/stateHash are wired', typeof makeGame === 'function' && typeof step === 'function' && typeof stateHash === 'function')

// determinism: seed + pads twice -> identical hashes; another seed -> different
{
    const drive = (seed) => {
        const gs = makeGame(seed)
        const hs = []
        for (let i = 0; i < 600; i++) {
            step(gs, { right: i % 9 < 6, b: i % 4 < 2, a: i % 17 < 2, up: i % 53 < 7, down: false, left: false })
            if (i % 150 === 149) hs.push(stateHash(gs))
        }
        return { hs, final: stateHash(gs) }
    }
    const a = drive(7), b = drive(7), c = drive(8)
    r.check('determinism: seed+pads twice hashes identical', JSON.stringify(a) === JSON.stringify(b), `samples ${a.hs.join(',')}`)
    r.check('determinism: another seed differs', c.final !== a.final)
}

// the 8-way law
{
    const gs = makeGame(1)
    step(gs, { right: true, up: true, b: false, a: false, down: false, left: false })
    const d = Math.hypot(gs.p.ax, gs.p.ay)
    r.check('8-way: up+right aims the diagonal', gs.p.ax > 0.5 && gs.p.ay < -0.5 && Math.abs(d - 1) < 0.01, `aim=(${gs.p.ax.toFixed(2)},${gs.p.ay.toFixed(2)})`)
    step(gs, { right: false, up: true, b: false, a: false, down: false, left: false })
    r.check('8-way: up alone aims straight up', gs.p.ax === 0 && gs.p.ay === -1)
    step(gs, { right: true, up: false, down: true, b: false, a: false, left: false }) // on ground: down ignored
    r.check('8-way: down on the ground stays level', gs.p.ay === 0)
}

// run + jump + gravity
{
    const gs = makeGame(3)
    const x0 = gs.p.x
    for (let i = 0; i < 10; i++) step(gs, { right: true, b: false, a: false, down: false, left: false, up: false })
    r.check('run: right moves the hero', gs.p.x - x0 >= 18, `dx=${(gs.p.x - x0).toFixed(1)}`)
    step(gs, { a: true, right: true })
    step(gs, { a: false, right: true })
    let peak = gs.p.y
    while (!gs.p.onGround) { step(gs, { right: true }); peak = Math.min(peak, gs.p.y) }
    r.check('jump: leaves the ground and gravity brings it back', CFG.ground - peak > 30 && gs.p.onGround, `apex rise ${(CFG.ground - peak).toFixed(0)}px`)
}

// rifle vs SPREAD (S4: counts are per-seat — the blue gun fires on its own
// cadence; owner 0 = the hero's rounds)
{
    const g1 = makeGame(5)
    step(g1, { b: true })
    r.check('rifle fires one round', g1.pb.filter((b) => !b.o).length === 1, `pb=${g1.pb.filter((b) => !b.o).length}`)
    r.check('S4: the CPU ally fires his own round unasked', g1.pb.some((b) => b.o === 1))
    const g2 = makeGame(5)
    g2.p.weapon = 'spread'
    step(g2, { b: true })
    const mine = g2.pb.filter((b) => !b.o)
    r.check('SPREAD fires five rounds, fanned', mine.length === 5 && new Set(mine.map((b) => Math.round(b.vy * 10))).size >= 4, `pb=${mine.length}`)
}

// capsule -> spread; death reverts the gun
{
    const gs = makeGame(9)
    gs.capsule = { x: gs.p.x + 8, y: gs.p.y - 14, vx: 0 }
    step(gs, {})
    r.check('capsule grants SPREAD', gs.p.weapon === 'spread')
    gs.p.inv = 0
    gs.eb.push({ x: gs.p.x - 100, y: gs.p.y - 14, vx: 2.2, vy: 0 })
    let guard = 0
    while (gs.p.dead === 0 && guard++ < 300) step(gs, {})
    for (let i = 0; i < CFG.respawnFreeze + 2 && gs.p.dead >= 0 && gs.p.inv <= 0; i++) step(gs, {})
    r.check('death reverts to rifle and grants respawn mercy frames', gs.p.weapon === 'rifle' && gs.p.inv > 0, `inv=${gs.p.inv}`)
}

// one-hit death, lives, respawn
{
    const gs = makeGame(11)
    gs.p.inv = 0
    const l0 = gs.lives
    gs.eb.push({ x: gs.p.x, y: gs.p.y - 14, vx: 0.1, vy: 0 })
    step(gs, {})
    r.check('one hit kills: lives 3 -> 2, hero freezes', gs.lives === l0 - 1 && gs.p.dead > 0 && gs.end === null)
    let guard = 0
    while (gs.p.dead > 0 && guard++ < 200) step(gs, {})
    r.check('respawn: back on the ground, flashing, stage still live', gs.p.onGround && gs.p.inv > 0 && gs.end === null)
}

// barrels chain: shot barrel kills a nearby soldier and the barrel goes
{
    const gs = makeGame(13)
    const br = gs.barrels[0]           // x 640
    const near = { x: br.x + 20, y: CFG.ground }
    gs.soldiers.push({ x: near.x, y: near.y, hold: false, hp: 1, awake: true, t: 9999, walk: 0, walkDir: -1, dead: false })
    gs.p.x = 560; gs.prevA = false
    let booms = 0
    const kinds = []
    for (let i = 0; i < 60; i++) { step(gs, { right: false, b: true }); booms += gs.ev.filter((e) => e.type === 'boom').length; kinds.push(...gs.ev.filter((e) => e.type === 'boom').map((e) => e.kind)); gs.ev.length = 0 }
    r.check('TNT barrel: a round sets it off and the blast clears the soldier beside it', br.gone && gs.soldiers[gs.soldiers.length - 1].dead && booms >= 2, `booms=${booms}`)
    // #2782: the shell sizes blast visuals by kind — the sim must NAME the source
    r.check('blast events name their source (tnt demolition vs kill snap)', kinds.includes('tnt') && kinds.includes('kill'), `kinds=${kinds.join(',')}`)
}

// the turret answers with its own heavier report (#2782.6): a flagged efire
{
    const gs = makeGame(5)
    for (const s of gs.soldiers) s.dead = true
    gs.p.x = 360; gs.p.inv = 9999
    let big = 0
    for (let i = 0; i < 300 && !gs.end; i++) { step(gs, {}); big += gs.ev.filter((e) => e.type === 'efire' && e.big).length; gs.ev.length = 0 }
    r.check('turret fire is flagged big (distinct heavier report)', big >= 1, `big efires=${big}`)
}

// soldier muzzle-flash timer rides the sim tick (deterministic, undecorated truth)
{
    const gs = makeGame(7)
    gs.p.x = 250; gs.p.inv = 99999   // stand and be shot at; soldier 1 at x300 engages
    let flashed = false
    for (let i = 0; i < 120 && !flashed; i++) { step(gs, {}); flashed = gs.soldiers.some((s) => s.flash > 0); gs.ev.length = 0 }
    r.check('firing soldiers carry a muzzle-flash timer', flashed)
}

// soldiers fight back (the named regression): enemies must open fire and shots
// must be dodgeable-but-real on every autopilot seed tested for the win
{
    let minFire = Infinity, allInside = true
    for (const s of [1, 7, 13, 42, 99]) {
        const { efire, wakesOut } = runSeed(s)
        minFire = Math.min(minFire, efire)
        if (wakesOut > 0) allInside = false
    }
    r.check('the stage fights back: every autopilot seed takes enemy fire', minFire >= 1, `min efire across seeds = ${minFire}`)
    r.check('no spawn shield: every soldier wakes inside the view, both axes (inside the bullets reach)', allInside)
}

// winnable: the autopilot must clear the FULL stage (jungle+falls+boss) on
// every seed 1..12 — not cherry-picked, and not just the easy half of it
{
    const fails = []
    const phases = new Set()
    for (let s = 1; s <= 12; s++) {
        const { gs } = runSeed(s)
        if (gs.end !== 'win') fails.push(`${s}:${gs.end}@${gs.tick}`)
        if (gs.boss) phases.add(gs.boss.core === 0 ? 'bossKilled' : 'bossReached')
    }
    r.check('can be won: autopilot clears the whole stage on seeds 1..12', fails.length === 0, fails.join(' ') || '12/12')
    r.check('the win is earned in the arena: every seed reached and killed the gate core', phases.has('bossKilled') && !phases.has('bossReached'), [...phases].join(','))
}

// ------------------------------------------------------ S2: the waterfall ---
{
    const gs = makeGame(21); gs.p.x = CFG.endX - 1
    step(gs, { right: true })
    r.check('the gate is a door, not a wall: reaching it drops the hero into the waterfall', gs.phase === 'falls' && gs.end === null && gs.camY > 400, `phase=${gs.phase} camY=${gs.camY.toFixed(0)}`)
}
{
    // the torrent: stand still in the canyon and the water takes you; the
    // camera ratchets (never retreats); respawn lands on the last shelf.
    const gs = makeGame(5)
    warpFalls(gs)
    gs.p.x = FALLS_LEDGES[0].x + 40; gs.p.y = FALLS_LEDGES[0].y
    let drowned = false, ratchet = true, prev = gs.camY
    const l0 = gs.lives
    while (!drowned && gs.tick < 3000) {
        step(gs, {})
        if (gs.camY > prev + 1e-9) ratchet = false
        prev = gs.camY
        drowned = gs.ev.some((e) => e.type === 'drown')
        gs.ev.length = 0
    }
    r.check('the torrent drowns a hero who stops climbing', drowned && gs.lives === l0 - 1, `lives ${l0}->${gs.lives}`)
    r.check('camera ratchet: the falls never scroll back down', ratchet)
    let guard = 0
    while (gs.p.dead > 0 && guard++ < 200) step(gs, {})
    r.check('drowning respawns on the last safe shelf, not the jungle floor', gs.p.onGround && gs.p.y > 400, `y=${gs.p.y}`)
}
{
    // one-way law on the shelves: land above, pass through from below
    const gs = makeGame(31)
    warpFalls(gs)
    const l1 = FALLS_LEDGES[1]
    gs.p.x = l1.x + l1.w / 2; gs.p.y = FALLS_LEDGES[0].y
    let landed = false
    for (let i = 0; i < 80 && !landed; i++) {
        if (gs.p.onGround) { step(gs, { a: true }); continue }
        step(gs, {})
        if (gs.p.onGround && Math.abs(gs.p.y - l1.y) < 2) landed = true
    }
    r.check('falls shelf: a jump from the shelf below lands on top of it', landed, `y=${gs.p.y}`)
    const gs2 = makeGame(32)
    warpFalls(gs2)
    const l2 = FALLS_LEDGES[2]
    gs2.p.x = l2.x + 10; gs2.p.y = l2.y + 20; gs2.p.onGround = false; gs2.p.vy = -1
    step(gs2, {})
    r.check('falls shelf is one-way: rising passes through from below', !gs2.p.onGround)
}
{
    // geometry honesty: every shelf hop is inside human reach (rise <= apex 48,
    // horizontal edge gap <= ~55 of a jump's ~74px of travel)
    let bad = []
    for (let i = 1; i < FALLS_LEDGES.length; i++) {
        const a = FALLS_LEDGES[i - 1], b = FALLS_LEDGES[i]
        const rise = a.y - b.y
        const gap = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)))
        if (rise > 48 || gap > 55) bad.push(`${i}:rise${rise}/gap${gap}`)
    }
    r.check('the climb is honest: every shelf sits within one jump of the one below', bad.length === 0, bad.join(' ') || '12 hops ok')
}

// -------------------------------------------------------- S2: the gate ------
const mkBoss = (seed = 7) => {
    const gs = makeGame(seed)
    warpBoss(gs)
    gs.p.x = 150; gs.p.y = CFG.bossFloor; gs.p.onGround = true; gs.p.vy = 0
    gs.boss.guns.forEach((g) => { g.t = 1e9 }); gs.boss.doors.forEach((d) => { d.t = 1e9 })
    return gs
}
{
    const open = mkBoss(11); open.boss.coreT = 5
    let hits = 0
    for (let i = 0; i < 100; i++) { step(open, { right: true, up: true, b: true }); hits += open.ev.filter((e) => e.type === 'coreHit').length; open.ev.length = 0 }
    r.check('the open core takes the 45-degree fire line from the wall face', hits >= 4, `hits=${hits}`)
    const shut = mkBoss(11); shut.boss.coreT = CFG.coreOpen + 10
    const hp0 = shut.boss.core
    let sparks = 0, hits2 = 0
    for (let i = 0; i < 55; i++) { step(shut, { right: true, up: true, b: true }); hits2 += shut.ev.filter((e) => e.type === 'coreHit').length; sparks += shut.ev.filter((e) => e.type === 'spark').length; shut.ev.length = 0 }
    r.check('armor law: rounds on the SHUT shutter spark and never dent it', hits2 === 0 && sparks > 0 && shut.boss.core === hp0, `hits=${hits2} sparks=${sparks}`)
}
{
    // #2854 gate pierce law: the housing box sits on a 45-degree line no core
    // line touches — from patrol x=100, up-right fire crosses x∈[190,199] at
    // y∈[35,44] (gun 0), and that line's x+y=234 never enters the core's
    // [256,336] band. So this line tests ONLY the housings.
    const beam = mkBoss(7); beam.p.x = 100; beam.p.weapon = 'laser'; beam.p.inv = 99999
    let sparksB = 0, crossed = 0
    for (let i = 0; i < 90; i++) {
        step(beam, { right: true, up: true, b: true })
        sparksB += beam.ev.filter((e) => e.type === 'spark').length
        crossed += beam.pb.filter((b) => b.k === 'l' && b.hits && b.hits.includes('g0') && b.y < 28).length
        beam.ev.length = 0
    }
    r.check('#2854 LASER sparks through a cannon housing and keeps flying', sparksB >= 1 && crossed >= 1, `sparks=${sparksB} crossed=${crossed}`)
    const flame = mkBoss(7); flame.p.x = 100; flame.p.weapon = 'fire'; flame.p.inv = 99999
    let crossedF = 0
    for (let i = 0; i < 140; i++) {
        step(flame, { right: true, up: true, b: true })
        crossedF += flame.pb.filter((b) => b.k === 'f' && b.hits && b.hits.includes('g0') && b.y < 28).length
        flame.ev.length = 0
    }
    r.check('#2854 the firebar crosses the housings too (pierce is pierce)', crossedF >= 1, `crossed=${crossedF}`)
    const solid = mkBoss(7); solid.p.x = 100; solid.p.inv = 99999; solid.p2.out = true // rifle, pinned solo
    step(solid, { right: true, up: true, b: true })        // one round from x=100 onto the gun-0 line
    const round = solid.pb[0]
    let sparksR = solid.ev.filter((e) => e.type === 'spark').length
    for (let i = 0; i < 60 && solid.pb.includes(round); i++) {
        step(solid, {})
        sparksR += solid.ev.filter((e) => e.type === 'spark').length
        solid.ev.length = 0
    }
    r.check('#2854 ordinary rounds still die at the housing (the armour law stands)', !solid.pb.includes(round) && round.y >= 28 && sparksR >= 1, `diedAtY=${round.y} sparks=${sparksR} alive=${solid.pb.includes(round)}`)
    const shut2 = mkBoss(11); shut2.boss.coreT = CFG.coreOpen + 10; shut2.p.weapon = 'laser'; shut2.p.inv = 99999; shut2.p2.out = true
    step(shut2, { right: true, up: true, b: true })        // one beam from x=150 onto the core lane (shut window: 60 ticks)
    const beamR = shut2.pb[0]
    let hits3 = shut2.ev.filter((e) => e.type === 'coreHit').length
    let sparks3 = shut2.ev.filter((e) => e.type === 'spark').length
    for (let i = 0; i < 60 && shut2.pb.includes(beamR); i++) {
        step(shut2, {})
        hits3 += shut2.ev.filter((e) => e.type === 'coreHit').length
        sparks3 += shut2.ev.filter((e) => e.type === 'spark').length
        shut2.ev.length = 0
    }
    r.check('#2854 the SHUT shutter still eats a beam — the ONE weak point never moved', !shut2.pb.includes(beamR) && beamR.y >= CFG.coreY - CFG.coreHH && hits3 === 0 && sparks3 >= 1, `diedAtY=${beamR.y} hits=${hits3} sparks=${sparks3}`)
}
{
    // #2880 the depot slab law reaches the gate: pin the hero at x=100 (the
    // #2854 line crosses gun-0's box) and hold the trigger — ten rounds, a
    // spark per hit, then one named boom, +300, and the housing is dead. The
    // core never takes a hit on this line, gun 1 stands untouched.
    const gs = mkBoss(7); gs.p.x = 100; gs.p.inv = 99999; gs.p2.out = true
    const scoreBefore = gs.score
    let sparks = 0, booms = 0, coreHits = 0, tickCaved = -1
    for (let i = 0; i < 800 && tickCaved < 0; i++) {
        gs.p.x = 100 // pin the fire line — the hero holds rather than sweeping
        step(gs, { right: true, up: true, b: true })
        sparks += gs.ev.filter((e) => e.type === 'spark').length
        booms += gs.ev.filter((e) => e.type === 'boom').length
        coreHits += gs.ev.filter((e) => e.type === 'coreHit').length
        gs.ev.length = 0
        if (gs.boss.guns[0].dead) tickCaved = i
    }
    r.check('#2880 ten aimed rounds cave the near housing — spark per hit, then a named blast (+300), core untouched',
        tickCaved >= 0 && sparks === CFG.gunHp && booms === 1 && gs.score - scoreBefore === 300 && coreHits === 0 && gs.boss.guns[1].hp === CFG.gunHp,
        `tick=${tickCaved} sparks=${sparks} booms=${booms} dScore=${gs.score - scoreBefore} coreHits=${coreHits}`)
    // Silence: arm both mounts; the survivor keeps its cadence, the wreck's
    // muzzle never speaks again (gun-0 rounds would spawn within its box:
    // gun 1 sits 140px away and its line stays well below y<44 at x=190).
    gs.boss.guns[0].t = 1; gs.boss.guns[1].t = 1
    let cannonEv = 0, gun0Rounds = 0
    for (let i = 0; i < 600; i++) {
        gs.p.x = 100
        step(gs, {})
        cannonEv += gs.ev.filter((e) => e.type === 'cannon').length
        gun0Rounds += gs.eb.filter((b) => Math.abs(b.x - 190) <= 16 && b.y <= 52 && b.x > 170).length
        gs.ev.length = 0
    }
    r.check('#2880 the caved gun is silent for the fight — the survivor still answers',
        cannonEv >= 1 && gun0Rounds === 0, `cannon=${cannonEv} gun0rounds=${gun0Rounds}`)
    // The wreck no longer intercepts: rifle and laser both sail through the
    // dead housing with no spark, and the laser takes no "one take" on it.
    gs.pb.push({ x: 180, y: 36, vx: 2, vy: 0, k: 'r' })
    gs.pb.push({ x: 180, y: 40, vx: 2, vy: 0, k: 'l', hits: [] })
    const wR = gs.pb[gs.pb.length - 2]; const wL = gs.pb[gs.pb.length - 1]
    let sparksW = 0
    for (let i = 0; i < 24; i++) {
        step(gs, {})
        sparksW += gs.ev.filter((e) => e.type === 'spark').length
        gs.ev.length = 0
    }
    r.check('#2880 a caved housing stops eating rounds — wrecks intercept nothing (rifle or beam)',
        gs.pb.includes(wR) && gs.pb.includes(wL) && wR.x > 220 && sparksW === 0 && !wL.hits.includes('g0'),
        `rifleX=${wR.x} alive=${gs.pb.includes(wR)} sparks=${sparksW} took=${wL.hits.includes('g0')}`)
    // Sim truth: hp and dead ride the hash — a replay that caves a gun diverges.
    const gsH = mkBoss(7)
    const h0 = stateHash(gsH)
    gsH.boss.guns[0].hp = 3
    const h1 = stateHash(gsH)
    gsH.boss.guns[0].dead = true
    const h2 = stateHash(gsH)
    r.check('#2880 housing damage is sim truth — hp and dead ride stateHash', h0 !== h1 && h1 !== h2, `${h0}/${h1}/${h2}`)
}
{
    const gs = mkBoss(9); gs.boss.core = 1
    let won = false, bonusAt = -1, scoreBefore = gs.score, sDelta = 0
    for (let i = 0; i < 300 && !won; i++) {
        const pre = gs.score
        step(gs, { right: true, up: true, b: true })
        if (gs.boss.dying > 0 && bonusAt < 0) { bonusAt = gs.tick; sDelta = gs.score - pre }
        won = gs.end === 'win'
        gs.ev.length = 0
    }
    r.check('destroying the core ends stage 1 with a big score bonus', won && sDelta >= 5000, `won=${won} bonus=${sDelta} (from ${scoreBefore})`)
}

// ---- #2885: the scripted finale + the gorge's vine carriers ------------------
{
    const runCascade = (seed) => {
        const gs = makeGame(seed); warpBoss(gs)
        gs.boss.core = 1
        gs.boss.coreT = 0            // shutter open — one aimed round finishes it
        gs.pb.push({ x: CFG.coreX - 4, y: CFG.coreY, vx: 1, vy: 0, k: 'r' })
        const sites = []
        let rStart = null
        for (let i = 0; i < 400 && !gs.end; i++) {
            step(gs, {})
            if (gs.boss.dying > 0 && rStart === null) rStart = gs.r
            for (const e of gs.ev) if (e.type === 'boom' && e.kind === 'tnt') sites.push([e.x, e.y])
            gs.ev.length = 0
        }
        return { sites, end: gs.end, rStart, rEnd: gs.r, guns: gs.boss.guns.map((g) => [g.x, g.y - 4]) }
    }
    const cA = runCascade(3), cB = runCascade(40031)
    const want = CASCADE.map((s) => [s.x, s.y])
    r.check('#2885 the gate finale is SCRIPTED — the blast list walks the CASCADE sites position-by-position',
        JSON.stringify(cA.sites) === JSON.stringify(want), `sites=${cA.sites.length}/${want.length}`)
    r.check('#2885 every seed shows the SAME finale — the cascade takes zero gs.r draws',
        JSON.stringify(cA.sites) === JSON.stringify(cB.sites) && cA.rStart === cA.rEnd && cA.end === 'win' && cB.end === 'win',
        `r held=${cA.rStart === cA.rEnd} seed-40031 sites=${cB.sites.length}`)
    r.check('#2885 the choreography reads like the original — the guns go first, the heart goes last',
        JSON.stringify(cA.sites[0]) === JSON.stringify(cA.guns[0]) && JSON.stringify(cA.sites[3]) === JSON.stringify(cA.guns[1]) &&
        Math.hypot(cA.sites[cA.sites.length - 1][0] - CFG.coreX, cA.sites[cA.sites.length - 1][1] - CFG.coreY) < 2,
        `first=(${cA.sites[0]}) fourth=(${cA.sites[3]}) last=(${cA.sites[cA.sites.length - 1]})`)
}
{
    // reach law: airborne + jump held + the tip box catches a vine
    const gs = makeGame(7); warpFalls(gs)
    let vineEv = 0, attachedAt = -1
    for (let i = 0; i < 300 && gs.p.vine < 0; i++) {
        step(gs, { a: true })
        vineEv += gs.ev.filter((e) => e.type === 'vine').length
        gs.ev.length = 0
        const tp = vineTip(gs, 0)
        if (gs.p.vine < 0 && gs.p.dead === 0) { gs.p.x = tp.x; gs.p.y = tp.y + 14; gs.p.vy = -1; gs.p.onGround = false }
        if (gs.p.vine >= 0) attachedAt = i
    }
    r.check('#2885 reach law: airborne + jump held + the tip box catches a vine (named event)',
        attachedAt >= 0 && vineEv >= 1 && gs.p.vine === 0 && gs.p.grabI === 0, `tick=${attachedAt} ev=${vineEv}`)
    // grounded contact never takes the vine — a full period under the sweep
    const g2 = makeGame(7); warpFalls(g2)
    let groundedGrab = false, passed = 0
    for (let i = 0; i < CFG.vinePeriod; i++) {
        step(g2, {})
        const tp = vineTip(g2, 0)
        if (g2.p.onGround && Math.abs(tp.x - g2.p.x) <= CFG.vineGrabHW) passed++
        groundedGrab = groundedGrab || g2.p.vine >= 0
        g2.ev.length = 0
    }
    r.check('#2885 grounded contact never grabs — feet stay on the rock (tip passed overhead)',
        !groundedGrab && passed >= 1, `overhead-ticks=${passed} grab=${groundedGrab}`)
    // carrier law: the fling leaves at least vineCarryMin above the catch
    let peak = gs.p.y, unvineEv = 0
    for (let i = 0; i < 140 && gs.p.vine >= 0; i++) {
        step(gs, {})
        peak = Math.min(peak, gs.p.y)
        unvineEv += gs.ev.filter((e) => e.type === 'unvine').length
        gs.ev.length = 0
    }
    r.check('#2885 carrier law: the rider is flung at least vineCarryMin above the catch, momentum and all',
        gs.p.vine === -1 && gs.p.vineAtY - peak >= CFG.vineCarryMin && gs.p.vy < -1 && unvineEv >= 1,
        `lift=${(gs.p.vineAtY - peak).toFixed(1)} vy=${gs.p.vy.toFixed(2)}`)
    // release on command: jump again while riding
    const g3 = makeGame(7); warpFalls(g3)
    for (let i = 0; i < 300 && g3.p.vine < 0; i++) {
        step(g3, { a: true })
        const tp = vineTip(g3, 0)
        if (g3.p.vine < 0 && g3.p.dead === 0) { g3.p.x = tp.x; g3.p.y = tp.y + 14; g3.p.vy = -1; g3.p.onGround = false }
    }
    step(g3, { a: true })        // held while riding: no edge, stays on
    const midRide = g3.p.vine
    step(g3, {})                 // let go of the key
    step(g3, { a: true })        // press again — the rider flies off
    r.check('#2885 the rider lets go on command — jump releases mid-swing with upward momentum',
        midRide >= 0 && g3.p.vine === -1 && g3.p.vy <= -1.8, `mid=${midRide} vy=${g3.p.vy.toFixed(2)}`)
    // structural law: the SAME seatStep carries the vine law — the blue seat rides
    const g4 = makeGame(7); warpFalls(g4)
    g4.p2.human = true
    let qv = -1
    for (let i = 0; i < 300 && qv < 0 && g4.tick < 800; i++) {
        step(g4, {}, { a: true })
        const tp = vineTip(g4, 0)
        if (g4.p2.vine < 0 && g4.p2.dead === 0 && !g4.p2.out && g4.p2.enterT === 0) { g4.p2.x = tp.x; g4.p2.y = tp.y + 14; g4.p2.vy = -1; g4.p2.onGround = false }
        qv = g4.p2.vine
    }
    r.check('#2885 the vine law is structural — the blue seat rides the same seatStep', qv >= 0, `qvine=${qv}`)
    // hazard law untouched: the torrent still takes a rider
    const g6 = makeGame(7); warpFalls(g6)
    for (let i = 0; i < 300 && g6.p.vine < 0; i++) {
        step(g6, { a: true })
        const tp = vineTip(g6, 0)
        if (g6.p.vine < 0 && g6.p.dead === 0) { g6.p.x = tp.x; g6.p.y = tp.y + 14; g6.p.vy = -1; g6.p.onGround = false }
    }
    const livesBefore = g6.lives
    g6.camY = g6.p.y - (224 - CFG.drownAt) + 10    // the water climbs to the rider
    step(g6, {})
    r.check('#2885 hazard law untouched — the torrent still takes a vine rider (pool pays)',
        g6.lives === livesBefore - 1 && g6.p.dead > 0, `lives ${livesBefore}->${g6.lives} dead=${g6.p.dead}`)
    // sim truth: riders ride the hash
    const g5 = makeGame(7); warpFalls(g5)
    const ha = stateHash(g5)
    g5.p.vine = 0
    r.check('#2885 vine riders ride stateHash — a replay that catches a vine diverges loudly', ha !== stateHash(g5), `${ha}/${stateHash(g5)}`)
}
{
    const gs = makeGame(13)
    warpBoss(gs)
    let maxLive = 0, cannonFired = 0
    for (let i = 0; i < 1600; i++) {
        step(gs, {})   // hero stands and does nothing: the door must still cap, the guns must talk
        maxLive = Math.max(maxLive, gs.soldiers.filter((s) => !s.dead).length)
        cannonFired += gs.ev.filter((e) => e.type === 'cannon').length
        gs.ev.length = 0
    }
    r.check('the door cannot spill an army (spawn cap holds)', maxLive > 0 && maxLive <= CFG.doorCap, `max live=${maxLive}`)
    r.check('the cannons talk: the gate fires while you stand before it', cannonFired >= 4, `cannon=${cannonFired}`)
}
{
    const g2 = makeGame(22)
    g2.p2.human = true   // pin seat 2 still; this leg drains the SHARED pool deliberately
    let guard = 0, earlyEnd = false, partnerHeld = false
    while (!g2.end && guard++ < 4000) {
        g2.p.inv = 0; g2.p.dead = 0
        if (!g2.p.out) g2.eb.push({ x: g2.p.x, y: g2.p.y - 14, vx: 0.1, vy: 0 })
        else g2.eb.push({ x: g2.p2.x, y: g2.p2.y - 14, vx: 0.1, vy: 0 })   // hero down — the partner holds the line alone
        step(g2, {})
        if (g2.end && (!g2.p.out || !g2.p2.out)) earlyEnd = true
        if (!g2.end && g2.p.out && g2.p2.dead === 0 && g2.tick > 0) partnerHeld = true
    }
    r.check('#2814 GAME OVER needs BOTH seats down, never while one still stands (shared pool)',
        !earlyEnd && g2.end === 'dead' && g2.lives === 0 && g2.p.out && g2.p2.out, `end=${g2.end} early=${earlyEnd} pool=${g2.lives}`)
    r.check('#2814 a hero down leaves the partner running the run (arcade carry-on)',
        partnerHeld, `partnerHeld=${partnerHeld}`)
}

// ------------------------------------------------------- S3: weapon wheel ---
{
    // the MG: a stream, at least twice the rifle's rounds on the same hold
    const mg = makeGame(5)
    mg.p.weapon = 'machine'
    let m = 0
    for (let i = 0; i < 60; i++) { step(mg, { b: true }); m += mg.ev.filter((e) => e.type === 'shot' && e.k === 'machine' && !e.o).length; mg.ev.length = 0 }
    const rf = makeGame(5)
    let r2 = 0
    for (let i = 0; i < 60; i++) { step(rf, { b: true }); r2 += rf.ev.filter((e) => e.type === 'shot' && !e.o).length; rf.ev.length = 0 }
    r.check('MG streams: at least twice the rifle on the same hold', m >= 14 && m >= r2 * 2, `MG ${m} vs rifle ${r2} in 60 ticks`)
    // the laser is the fastest round in the game
    const lz = makeGame(5); lz.p.weapon = 'laser'
    step(lz, { b: true })
    r.check('laser outruns every other round (>= 9 px/tick)', Math.hypot(lz.pb[0].vx, lz.pb[0].vy) >= 9, `speed=${Math.hypot(lz.pb[0].vx, lz.pb[0].vy).toFixed(1)}`)
    // the firebar undulates across its line of travel
    const fb = makeGame(5); fb.p.weapon = 'fire'
    step(fb, { b: true })
    const b0 = fb.pb[0]
    const vys = []
    for (let i = 0; i < 30; i++) { step(fb, {}); if (fb.pb.includes(b0)) vys.push(b0.vy) }
    r.check('firebar undulates: vy swings both sides of its line', vys.length > 10 && Math.min(...vys) < 0 && Math.max(...vys) > 0, `vy ${Math.min(...vys).toFixed(2)}..${Math.max(...vys).toFixed(2)}`)
}
{
    // piercing belongs to the wheel: one flame / one beam mows two aligned
    // soldiers; the plain rifle still stops at the first body.
    const lineup = (weapon) => {
        const gs = makeGame(5)
        gs.p.weapon = weapon
        gs.p2.out = true // the solo lineup law is the hero's gun alone; the co-op kill-cross is covered in the S4 section
        for (const s of gs.soldiers) s.dead = true
        const a = { x: gs.p.x + 70, y: CFG.ground, hold: false, hp: 1, awake: true, t: 99999, walk: 0, walkDir: -1, dead: false, flash: 0, nade: false, throwT: 0 }
        const b = { x: gs.p.x + 110, y: CFG.ground, hold: false, hp: 1, awake: true, t: 99999, walk: 0, walkDir: -1, dead: false, flash: 0, nade: false, throwT: 0 }
        gs.soldiers.push(a, b)
        for (let i = 0; i < 80; i++) { step(gs, { b: i === 0 }); gs.ev.length = 0 }
        return (a.dead ? 1 : 0) + (b.dead ? 1 : 0)
    }
    r.check('FIRE pierces: one flame kills two lined-up soldiers', lineup('fire') >= 2, `kills=${lineup('fire')}`)
    r.check('LASER pierces: one beam kills two lined-up soldiers', lineup('laser') >= 2, `kills=${lineup('laser')}`)
    r.check('the rifle round still stops at the first body', lineup('rifle') === 1)
}
{
    // the wheel itself: every capsule letter becomes the gun it prints
    const granted = []
    for (const kind of ['spread', 'machine', 'fire', 'laser']) {
        const gs = makeGame(9)
        gs.capsule = { x: gs.p.x + 8, y: gs.p.y - 14, vx: 0, kind }
        step(gs, {})
        granted.push(gs.p.weapon)
    }
    r.check('capsules grant every wheel letter (S/M/F/L)', granted.join(',') === 'spread,machine,fire,laser', granted.join(','))
    // and the spawn draw covers the wheel across seeds — no letter is dead code
    const seen = new Set()
    for (let s = 1; s <= 40; s++) {
        const gs = makeGame(s)
        for (let i = 0; i < 300; i++) { step(gs, {}); if (gs.capsule) seen.add(gs.capsule.kind) }
    }
    r.check('capsule draws cover all four letters across seeds', seen.size === 4, [...seen].sort().join(','))
}
// ------------------------------------------------ S3: snipers + grenadiers ---
{
    const gs = makeGame(13)
    gs.p.x = 300; gs.p.inv = 99999
    gs.p2.out = true // pinned solo: the tree-line leg aims at the hero, not the shadow (the co-op aim-swap law is in the S4 section)
    let shots = 0, fast = false, glintOk = true
    for (let i = 0; i < 400 && shots < 2; i++) {
        const charging = gs.snipers.some((s) => s.awake && !s.dead && s.t <= 40)
        step(gs, {})
        const fired = gs.ev.filter((e) => e.type === 'sniper').length
        if (fired) {
            shots += fired
            if (!charging) glintOk = false
            for (const b of gs.eb) if (Math.hypot(b.vx, b.vy) >= 3) fast = true
        }
        gs.ev.length = 0
    }
    r.check('snipers open fire from the tree line', shots >= 2, `shots=${shots}`)
    r.check('the sniper round is the fast one (>= 3 px/tick)', fast)
    r.check('every sniper shot was telegraphed (scope-glint window before the round)', glintOk)
}

// ---- #2905 perch drift + lob-only grenadier ---------------------------------
{
    // the tree line walks its aim: pin one hero under nest 1270 and the SAME
    // nest must fire from all three perches, home first, on the fixed rotation.
    const gs = makeGame(7)
    gs.p2.out = true; gs.p.inv = 999999
    const originX = []
    for (let i = 0; i < 1000 && originX.length < 5; i++) {
        gs.p.x = 1150
        const before = gs.ev.length
        step(gs, {})
        for (let j = before; j < gs.ev.length; j++) { const e = gs.ev[j]; if (e.type === 'sniper' && e.bx === 1270) originX.push(Math.round(e.x)) }
    }
    const rel = originX.map((x) => x - 1270)
    r.check('#2905 one nest fires from three perches — home, then the fixed rotation', JSON.stringify(rel) === '[0,-34,30,0,-34]', `rel origins ${JSON.stringify(rel)}`)
}
{
    // telegraph integrity: across the honest sweep the body never moves while
    // the scope window is open (t < 40), and no round ever leaves a moving nest.
    let midGlintMoves = 0, shotFromMoving = 0
    for (const seed of [7, 13, 21, 31]) {
        const gs = makeGame(seed)
        gs.p2.out = true
        const prev = new Map()
        for (let i = 0; i < 1400 && !gs.end; i++) {
            const before = gs.ev.length
            step(gs, autopilot(gs))
            for (const sn of gs.snipers) {
                if (sn.dead || !sn.awake) continue
                const p = prev.get(sn.bx)
                if (p && sn.t < 40 && (p.x !== sn.x || p.y !== sn.y)) midGlintMoves++
                prev.set(sn.bx, { x: sn.x, y: sn.y })
            }
            for (let j = before; j < gs.ev.length; j++) if (gs.ev[j].type === 'sniper' && gs.ev[j].reloc > 0) shotFromMoving++
        }
    }
    r.check('#2905 the aim is frozen while the glint flashes — no mid-telegraph shuffle, no shot from a moving nest', midGlintMoves === 0 && shotFromMoving === 0, `moves=${midGlintMoves} shots=${shotFromMoving}`)
    // the roof gun is exempt: nailed to the slab, its x === dp.x identity carries
    // the roof law. Five volleys, one origin, pi never turns.
    const g2 = makeGame(13)
    g2.p2.out = true; g2.p.inv = 999999
    const roofX = []
    let roofPi = 0
    for (let i = 0; i < 900 && roofX.length < 5 && !g2.end; i++) {
        g2.p.x = 1600
        const before = g2.ev.length
        step(g2, {})
        for (let j = before; j < g2.ev.length; j++) { const e = g2.ev[j]; if (e.type === 'sniper' && e.bx === 1700) roofX.push(Math.round(e.x)) }
        const roof = g2.snipers.find((s) => s.bx === 1700)
        if (roof) roofPi = Math.max(roofPi, roof.pi)
    }
    r.check('#2905 the depot-roof nest is exempt — five volleys, one origin, no rotation', roofX.length >= 2 && roofX.every((x) => x === 1700) && roofPi === 0, `origins=${JSON.stringify(roofX)} pi=${roofPi}`)
}
{
    // lob-only law: silence the whole jungle bar one vest grenadier kept in
    // its throwing band — the throws must come, and NO flat round may ever
    // leave that soldier's gun hand (the cabinet's bandolier has no rifle).
    const gs = makeGame(7)
    gs.p.inv = 999999; gs.p2.out = true
    const vest = gs.soldiers.find((s) => s.nade)
    gs.soldiers.forEach((s) => { if (s !== vest) s.dead = true })
    gs.turrets.forEach((t) => { t.dead = true }); gs.snipers.forEach((s) => { s.dead = true })
    vest.awake = true
    let throws = 0, rounds = 0
    for (let i = 0; i < 600; i++) {
        vest.x = gs.p.x + 150   // keep him in the approach band, as on the cabinet
        if (gs.depot) gs.depot.dead = true
        const before = gs.eb.length
        step(gs, {})
        for (let j = before; j < gs.eb.length; j++) (gs.eb[j].gr ? throws++ : rounds++)
    }
    r.check('#2905 the vest throws and never rifles — lob-only cabinet law', throws >= 2 && rounds === 0, `throws=${throws} rounds=${rounds}`)
}
{
    // a grenade rides a true arc and detonates at the ground it lands on
    const gs = makeGame(13)
    gs.p.x = 620; gs.p.inv = 99999
    let threw = false, vyMin = 0, vyMax = 0, groundBoom = false
    for (let i = 0; i < 500 && !groundBoom; i++) {
        step(gs, {})
        const grs = gs.eb.filter((b) => b.gr)
        if (gs.ev.some((e) => e.type === 'throw')) threw = true
        for (const g of grs) { vyMin = Math.min(vyMin, g.vy); vyMax = Math.max(vyMax, g.vy) }
        if (threw && gs.ev.some((e) => e.type === 'boom' && e.kind === 'tnt' && e.y >= CFG.ground - 8)) groundBoom = true
        gs.ev.length = 0
    }
    r.check('grenadiers lob on the approach', threw)
    r.check('a grenade flies a real arc (rises, then falls)', vyMin < -1 && vyMax > 1, `vy ${vyMin.toFixed(1)}..${vyMax.toFixed(1)}`)
    r.check('the grenade detonates on the ground (blast at the landing)', groundBoom)
    // the vest: the grenadier eats at least two rifle rounds
    const g2 = makeGame(5)
    const nade = g2.soldiers.find((s) => s.nade)
    nade.x = g2.p.x + 40; nade.y = CFG.ground; nade.awake = true; nade.t = 99999
    let shotsToKill = 0
    for (let i = 0; i < 60 && !nade.dead; i++) { step(g2, { b: i % 8 === 0 }); shotsToKill += g2.ev.filter((e) => e.type === 'shot').length; g2.ev.length = 0 }
    r.check('the grenadier vest eats rounds (two rifle hits minimum)', nade.dead && shotsToKill >= 2, `shots=${shotsToKill}`)
}

// platforms: land above, walk through from below
{
    const gs = makeGame(31)
    const pl = PLATFORMS[0]
    gs.p.x = pl.x + pl.w / 2; gs.p.y = CFG.ground
    let landed = false
    for (let i = 0; i < 80 && !landed; i++) {
        if (gs.p.onGround) { step(gs, { a: true }); continue }
        step(gs, {})
        if (gs.p.onGround && Math.abs(gs.p.y - pl.y) < 2) landed = true
    }
    r.check('walkway: a jump from the floor lands on top of the platform', landed, `y=${gs.p.y}`)
    const gs2 = makeGame(32)
    gs2.p.x = PLATFORMS[1].x + 10; gs2.p.y = PLATFORMS[1].y + 20; gs2.p.onGround = false; gs2.p.vy = -1
    step(gs2, {})
    r.check('walkway is one-way: rising passes through from below', !gs2.p.onGround)
}

// ------------------------------------------------- S3.5: the arms depot ---
{
    // ten rounds cave the slab, the roof gunner falls with it, and the
    // arcade's guns-and-prizes moment pays: M/F/L at three altitudes, +1000.
    const gs = makeGame(9); gs.p.x = 1610; gs.p.inv = 99999
    const roof = gs.snipers.find((sn) => sn.x === 1700)
    let sparks = 0
    for (let i = 0; i < 260 && !gs.depot.dead; i++) { step(gs, { b: true }); sparks += gs.ev.filter((e) => e.type === 'spark').length; gs.ev.length = 0 }
    const kinds = gs.vc.map((c) => c.kind).join(',')
    const alts = new Set(gs.vc.map((c) => c.y)).size
    r.check('S3.5 arms depot: ten rounds cave the slab', gs.depot.dead && sparks >= 10, `hp=${gs.depot.hp} sparks=${sparks}`)
    r.check('S3.5 payout: the fallen depot releases M/F/L capsules at three altitudes (+1000), roof sniper blown off', kinds === 'machine,fire,laser' && alts === 3 && roof.dead && gs.score >= 1000, `kinds=${kinds} alts=${alts} roof=${roof.dead}`)
    // the payout is real ordnance: touching the low capsule racks the MG
    gs.vc[0].x = gs.p.x
    step(gs, {})
    r.check('S3.5 volley capsule grants its gun on contact', gs.p.weapon === 'machine', `weapon=${gs.p.weapon}`)
}
{
    // walls are walls: even the piercing laser is eaten by the slab (chips hp).
    const gs = makeGame(9); gs.p.x = 1610; gs.p.inv = 99999; gs.p.weapon = 'laser'
    for (const s of gs.soldiers) if (Math.abs(s.x - 1610) < 320) s.dead = true
    let hp0 = gs.depot.hp, hits = 0
    for (let i = 0; i < 200 && !gs.depot.dead; i++) { step(gs, { b: true }); hits += gs.ev.filter((e) => e.type === 'spark').length; gs.ev.length = 0 }
    r.check('S3.5 walls are walls: the laser is absorbed by the slab and dents it', gs.depot.dead && hp0 === 10 && hits >= 10, `hits=${hits}`)
}
{
    // the hatch: it spills one vest-carrying grenadier at a time, and ONLY
    // with the spill point inside the view (spawn-shield law for door arrivals).
    const gs = makeGame(9); gs.p.x = 1500; gs.p.inv = 99999
    for (const s of gs.soldiers) s.dead = true   // watch the hatch alone
    let doors = 0, outOfView = 0, maxLive = 0
    for (let i = 0; i < 1400; i++) {
        const camBefore = gs.cam
        step(gs, {})
        if (gs.ev.some((e) => e.type === 'door')) {
            doors++
            const newest = gs.soldiers[gs.soldiers.length - 1]
            if (newest.x >= camBefore + WVIEW - 4) outOfView++
        }
        maxLive = Math.max(maxLive, gs.soldiers.filter((s) => !s.dead && s.nade).length)
        gs.ev.length = 0
    }
    r.check('S3.5 hatch spills grenadiers inside the view only', doors >= 1 && outOfView === 0, `doors=${doors} outside=${outOfView}`)
    const g2 = makeGame(9); g2.p.x = 1350; g2.p.inv = 99999
    for (const s of g2.soldiers) s.dead = true
    let doorsFar = 0
    for (let i = 0; i < 900; i++) { step(g2, {}); doorsFar += g2.ev.filter((e) => e.type === 'door').length; g2.ev.length = 0 }
    r.check('S3.5 the hatch stays shut while its spill point is off-screen', doorsFar === 0, `doors@1350=${doorsFar}`)
    r.check('S3.5 the hatch cannot spill an army — one live grenadier at a time (door law reused)', maxLive === 1, `max live=${maxLive}`)
}
{
    // the honest win leg, depot included: every seed clears, most see the
    // payout, and every soldier — door-born included — wakes inside the view.
    const fails = []
    let volleys = 0, wakesOut = 0
    for (let s = 1; s <= 12; s++) {
        const gs = makeGame(s)
        for (const so of gs.soldiers) so._w = false
        while (!gs.end && gs.tick < 20000) {
            step(gs, autopilot(gs))
            for (const so of gs.soldiers) if (so.awake && !so._w) { so._w = true; if (so.x >= gs.cam + WVIEW - 2) wakesOut++ }
            if (gs.ev.some((e) => e.type === 'volley')) volleys++
            gs.ev.length = 0
        }
        if (gs.end !== 'win') fails.push(`${s}:${gs.end}@${gs.tick}`)
    }
    r.check('S3.5 the depot cannot strand the stage: autopilot clears seeds 1..12', fails.length === 0, fails.join(' ') || '12/12')
    r.check('S3.5 the emplacement falls under fire on 9+ seeds (the payout is reachable, not gated)', volleys >= 9, `volleys ${volleys}/12`)
    r.check('S3.5 spawn-shield holds for the hatch too (all 12 seeds audited)', wakesOut === 0, `outside wakes=${wakesOut}`)
}

// ------------------------------------------------- S4: two-seat co-op ---
{
    // the blue seat is fielded from the drop: it fires its own rifle cadence
    // unasked and keeps advancing on the hero's shoulder.
    const gs = makeGame(42)
    let allyShots = 0
    const firstX = gs.p2.x
    for (let i = 0; i < 300; i++) {
        allyShots += gs.ev.filter((e) => ['shot', 'spread', 'fshot', 'lshot'].includes(e.type) && e.o === 1).length
        gs.ev.length = 0
        step(gs, autopilot(gs))
    }
    r.check('S4 co-op seat fielded by default: fires on its own and advances', allyShots > 0 && gs.p2.x > firstX + 100, `shots=${allyShots} x=${gs.p2.x.toFixed(0)}`)
}
{
    // an attributable kill: the blue seat kills a soldier under its own fire
    // while the hero never fires a round (owner tags make it provable).
    const gs = makeGame(5)
    gs.p.x = 60
    for (const s of gs.soldiers) s.dead = true
    gs.p2.human = true
    gs.p2.x = 200; gs.p2.y = CFG.ground; gs.p2.onGround = true; gs.p2.lane = CFG.ground; gs.p2.inv = 99999
    const victim = { x: 270, y: CFG.ground, hold: false, hp: 1, awake: true, t: 99999, walk: 0, walkDir: -1, dead: false, flash: 0, nade: false, throwT: 0 }
    gs.soldiers.push(victim)
    let heroFired = false
    for (let i = 0; i < 200 && !victim.dead; i++) {
        step(gs, {}, { b: true })
        if (gs.ev.some((e) => e.type === 'shot' && !e.o)) heroFired = true
        gs.ev.length = 0
    }
    r.check('S4 the blue seat kills under his own fire (attributable, hero never fired)', victim.dead && !heroFired)
}
{
    // nearest-hero aim law: enemies lead the NEARER hero's lane. The sniper at
    // x=520 aims down at the grounded hero (vy > 0.4); put a seat on the
    // walkway at y=150 closer to the muzzle and the round goes flat instead.
    const solo = makeGame(13); solo.p.x = 300; solo.p.inv = 99999; solo.p2.out = true
    let vsolo = null
    for (let i = 0; i < 500 && vsolo == null; i++) {
        step(solo, {}, {})
        if (solo.ev.some((e) => e.type === 'sniper')) vsolo = solo.eb[solo.eb.length - 1].vy
    }
    const coop = makeGame(13)
    coop.p.x = 300; coop.p.inv = 99999
    coop.p2.human = true
    coop.p2.x = 380; coop.p2.y = 150; coop.p2.onGround = true; coop.p2.lane = 150; coop.p2.inv = 99999
    let vcoop = null
    for (let i = 0; i < 500 && vcoop == null; i++) {
        step(coop, {}, {})
        if (coop.ev.some((e) => e.type === 'sniper')) vcoop = coop.eb[coop.eb.length - 1].vy
    }
    r.check('S4 nearest-hero aim swap: the sniper re-leads the closer blue lane (down-solo, flat-coop)',
        vsolo != null && vcoop != null && vsolo > 0.4 && Math.abs(vcoop) < 0.15, `solo vy=${vsolo && vsolo.toFixed(2)} coop vy=${vcoop && vcoop.toFixed(2)}`)
}
{
    // capsule per seat: whoever touches it takes the gun — the other keeps his.
    const gs = makeGame(5)
    gs.p2.human = true
    gs.p2.x = 200; gs.p2.y = CFG.ground; gs.p2.onGround = true; gs.p2.lane = CFG.ground; gs.p2.inv = 99999
    gs.capsule = { x: gs.p2.x, y: gs.p2.y - 14, vx: -0.01, kind: 'spread' }   // hero stays back at the spawn
    step(gs, {}, {})
    r.check('S4 capsule lands on the seat that touches it (per-seat guns)', gs.p2.weapon === 'spread' && gs.p.weapon === 'rifle', `p=${gs.p.weapon} p2=${gs.p2.weapon}`)
}
{
    // the blue death does NOT freeze the world: the hero keeps running and
    // firing through the tumble, and the partner respawns at his side (the
    // arcade drop-in law) with i-frames and a clean rifle.
    const gs = makeGame(7)
    gs.p2.inv = 0
    gs.eb.push({ x: gs.p2.x + 2, y: gs.p2.y - 14, vx: 0.1, vy: 0 })
    step(gs, {})
    r.check('#2814 blue death costs the SHARED pool — the partner pays with the team', gs.lives === 2 && gs.p2.dead > 0 && gs.end === null, `pool=${gs.lives}`)
    gs.p.x = 300; gs.p.vy = 0; gs.p.onGround = true; gs.p.lane = CFG.ground; gs.p.inv = 99999
    for (let i = 0; i < CFG.respawnFreeze + 5; i++) { step(gs, {}, {}); gs.pb.length = 0 }
    r.check("S4 respawn: partner re-enters at the hero's side, flashing, rifle back",
        gs.p2.dead === 0 && Math.abs(gs.p2.x - (gs.p.x - 26)) <= 2 && gs.p2.inv > 0 && gs.p2.weapon === 'rifle', `dx=${(gs.p2.x - (gs.p.x - 26)).toFixed(0)} inv=${gs.p2.inv}`)
}
{
    // human drop-in (Node mirror of the shell law): once seat 2 is claimed by
    // a human, pad2 alone drives it — walk and fire (#2814: the pool is shared).
    const gs = makeGame(5)
    gs.p.x = 300; gs.p.inv = 99999
    gs.p2.human = true
    gs.p2.x = 200; gs.p2.y = CFG.ground; gs.p2.onGround = true; gs.p2.lane = CFG.ground; gs.p2.inv = 99999
    const x0 = gs.p2.x
    let blueShot = false
    for (let i = 0; i < 40; i++) {
        step(gs, {}, { left: true, b: i % 5 === 0 })
        if (gs.pb.some((b) => b.o === 1)) blueShot = true
        gs.pb.length = 0
    }
    r.check('S4 pad2 drives the claimed seat: human walks left where the CPU would hold, fires his own rounds',
        gs.p2.x < x0 - 20 && blueShot, `dx=${(gs.p2.x - x0).toFixed(0)}`)
}
{
    // #2837 seat ceremony (Node mirror): drop-in ARRIVES — the standing ally is
    // pulled onto the rope and the soldier rappels to the hero-side spot, not
    // where he stood. Landing carries the mercy laws. A seat nobody drives
    // returns to the wingman brain after seatIdle, cost-free; presence resets
    // the patience; harness-pinned seats are immune; a re-touch arrives again;
    // an arrival beats the death tumble; and all of it hashes deterministically.
    const gs = makeGame(7)
    gs.p.x = 300; gs.p.inv = 99999
    gs.soldiers.forEach((s) => { s.dead = true }); gs.turrets.forEach((t) => { t.dead = true }); gs.snipers.forEach((s) => { s.dead = true }); gs.barrels.forEach((b) => { b.gone = true })
    gs.p2.x = 200; gs.p2.y = CFG.ground; gs.p2.onGround = true; gs.p2.lane = CFG.ground; gs.p2.inv = 99999
    const xStand = gs.p2.x
    const joinEv = dropIn(gs)
    r.check('#2837 dropIn pulls the standing seat onto the rope (human, padClaim, above the camera, clean rifle)',
        joinEv === true && gs.p2.human === true && gs.p2.padClaim === true && gs.p2.enterT === CFG.dropInT && gs.p2.y < 0 && gs.p2.weapon === 'rifle',
        `human=${gs.p2.human} pc=${gs.p2.padClaim} enterT=${gs.p2.enterT} y=${gs.p2.y.toFixed(0)}`)
    let descent = 0
    while (!gs.p2.onGround && descent < 60) { step(gs, {}, {}); gs.eb.length = 0; descent++ }
    r.check('#2837 the rappel lands at the hero-side spot, not where the ally stood, with mercy left',
        gs.p2.onGround && Math.abs(gs.p2.x - (gs.p.x + CFG.allySpawnDX)) <= 2 && Math.abs(gs.p2.x - xStand) > 40 && gs.p2.inv > CFG.invuln - CFG.dropInT,
        `x=${gs.p2.x.toFixed(0)} (stood ${xStand}, spot ${(gs.p.x + CFG.allySpawnDX).toFixed(0)}) inv=${gs.p2.inv}`)
    const lives0 = gs.lives
    let rel = -1
    for (let i = 0; i < CFG.seatIdle + 2 && rel < 0; i++) { step(gs, {}, {}); gs.eb.length = 0; if (!gs.p2.human) rel = i }
    r.check('#2837 drop-out: an idle pad-claimed seat returns to the wingman brain, exactly at patience, cost-free',
        rel === CFG.seatIdle && gs.lives === lives0 && gs.p2.padClaim === false && gs.p2.inv >= 60,
        `rel=${rel} (want ${CFG.seatIdle}) pool ${lives0}->${gs.lives} inv=${gs.p2.inv}`)
    r.check('#2837 re-touch after release arrives on the rope again',
        dropIn(gs) === true && gs.p2.enterT === CFG.dropInT && gs.p2.human === true && gs.p2.padClaim === true,
        `enterT=${gs.p2.enterT} human=${gs.p2.human}`)
    let early = -1
    for (let i = 0; i < CFG.seatIdle; i++) { step(gs, {}, i === 300 ? { right: true } : {}); gs.eb.length = 0; if (!gs.p2.human) early = i }
    r.check('#2837 presence resets the patience: one touch and the seat stays claimed the whole window',
        early === -1 && gs.p2.human === true, `released at ${early}`)
    {
        const pinned = makeGame(5)
        pinned.p2.human = true
        for (let i = 0; i < CFG.seatIdle + 100; i++) step(pinned, {}, {})
        r.check('#2837 harness-pinned seats (human without padClaim) never auto-release', pinned.p2.human === true)
    }
    {
        const gs4 = makeGame(7)
        gs4.p2.inv = 0
        gs4.eb.push({ x: gs4.p2.x + 2, y: gs4.p2.y - 14, vx: 0.1, vy: 0 })
        step(gs4, {})
        const tumble = gs4.p2.dead
        dropIn(gs4)
        r.check('#2837 drop-in beats the death tumble: the arriving player never waits out the CPU timer',
            tumble > 0 && gs4.p2.dead === 0 && gs4.p2.enterT > 0 && gs4.p2.human === true, `tumble=${tumble} enterT=${gs4.p2.enterT}`)
    }
    {
        const runCer = (seed) => {
            const g = makeGame(seed)
            for (let i = 0; i < 50; i++) step(g, {}, {})
            dropIn(g)
            for (let i = 0; i < CFG.seatIdle + 40; i++) step(g, {}, { right: i === 500 })
            return stateHash(g)
        }
        r.check('#2837 the ceremony is deterministic — same seed + same pads, same hash', runCer(11) === runCer(11))
    }
    {
        // #2842 (Node mirror): the 2UP tag is the seat's arrival tell — the
        // paint reads it through seatTagState(), so pin the tell itself: steady
        // for a seated seat, absent when the seat is down, blink-in on the
        // rope, steady the instant the soles touch, and the gold warning
        // opens exactly two seconds before patience runs out.
        const gs = makeGame(5)
        for (let i = 0; i < 40; i++) step(gs, {}, {})
        r.check('#2842 a seated CPU seat lights the tag steady', seatTagState(gs) === 'lit', seatTagState(gs))
        gs.p2.out = true
        r.check('#2842 a seat that is down shows no tag at all', seatTagState(gs) === 'off', seatTagState(gs))
        gs.p2.out = false
        dropIn(gs)
        r.check('#2842 the tag blinks-in all the way down the rope', seatTagState(gs) === 'arrive', seatTagState(gs))
        let land = -1
        for (let i = 0; i < CFG.dropInT + 120 && land < 0; i++) { step(gs, {}, {}); gs.eb.length = 0; if (gs.p2.enterT === 0 && gs.p2.onGround) land = i }
        r.check('#2842 the tag goes steady the instant the soles touch the deck', land >= 0 && seatTagState(gs) === 'lit', `land=${land} tag=${seatTagState(gs)}`)
        let warnIdle = -1, warnTicks = 0, relAt = -1
        for (let i = 0; relAt < 0 && i < CFG.seatIdle + 60; i++) {
            step(gs, {}, {}); gs.eb.length = 0
            if (seatTagState(gs) === 'warn') { warnTicks += 1; if (warnIdle < 0) warnIdle = gs.p2.idle }
            if (!gs.p2.human) relAt = i
        }
        r.check('#2842 the drop-out warning opens one beat after patience minus two seconds',
            warnIdle === CFG.seatIdle - TAG_WARN + 1, `idle@warn=${warnIdle} (want ${CFG.seatIdle - TAG_WARN + 1})`)
        r.check('#2842 the warning holds for exactly two seconds and the release restores the steady tag',
            warnTicks === TAG_WARN && relAt > 0 && seatTagState(gs) === 'lit',
            `warn ticks=${warnTicks}/${TAG_WARN} rel=${relAt} tag=${seatTagState(gs)}`)
    }
}
{
    // #2798 playtest law: repeated identical ally deaths are a BRAIN bug, not
    // fortune. The S4 sweep found the blue seat drowning at x=172,y=640 on
    // most seeds (the desperate clause zeroed his directions and he hopped in
    // place under the falls) — and landing into the same boss-band lob at
    // x=124. The honest brain must climb the falls with the hero, and never
    // dig the same grave twice across seeds.
    const graves = []
    const fails = []
    for (let s = 1; s <= 12; s++) {
        const gs = makeGame(s)
        let pd = 0
        for (let i = 0; i < 60 * 300 && !gs.end; i++) {
            step(gs, autopilot(gs))
            if (gs.p2.dead > 0 && pd === 0 && (gs.phase === 'falls' || gs.phase === 'boss')) {
                graves.push(`${s}:${gs.phase}@${Math.round(gs.p2.x)},${Math.round(gs.p2.y)}`)
            }
            pd = gs.p2.dead > 0 ? 1 : 0
        }
        if (gs.end !== 'win') fails.push(`${s}:${gs.end}`)
    }
    const seen = new Map()
    const dbl = []
    for (const g of graves) {
        const sig = g.slice(g.indexOf(':') + 1)
        seen.set(sig, (seen.get(sig) || 0) + 1)
    }
    for (const [sig, n] of seen) if (n > 1) dbl.push(`${sig}x${n}`)
    r.check('#2798 S4 ally climbs the falls and never digs the same grave twice (12-seed sweep)',
        fails.length === 0 && dbl.length === 0, `wins ${12 - fails.length}/12, graves=[${graves.join(' ')}]${dbl.length ? ' REPEAT ' + dbl.join(',') : ''}`)
}
// ---- #2789 salvage: capsule letters are 5x5 bitmap stamps, not fonts ------
// docs/ART.md bar: every pixel generated in code, crisp on the pixel grid.
// fillText smuggles the browser's antialiased font rasterizer into the capsule
// window; the cabinet STAMPS S/M/F/L. These laws demand the stamps: zero text
// API touches by drawCapsule, the exact lit-pixel count per letter, and each
// letter keeping its wheel ink (the shipped letter-identity palette).
{
    const EXPECT = { spread: ['S', 17, '#ff8c1a'], machine: ['M', 13, '#2b6fd4'], fire: ['F', 12, '#e23b2e'], laser: ['L', 9, '#8a3ad4'] }
    const stampProbe = (kind) => {
        const o = { text: 0, ink: null, px: 0, inks: new Set() }
        const ctx = {
            save () {}, restore () {}, translate () {},
            fillText () { o.text++ },
            measureText () { o.text++; return { width: 7 } },
            set font (_) { o.text++ }, get font () { return '' },
            set textBaseline (_) { o.text++ }, get textBaseline () { return 'top' },
            set fillStyle (v) { o.ink = v }, get fillStyle () { return o.ink },
            fillRect (x, y, w, h) { if (w === 1 && h === 1 && x >= -2 && x <= 2 && y >= -2 && y <= 2) { o.px++; o.inks.add(o.ink) } },
        }
        drawCapsule(ctx, { x: 0, y: 0, kind }, 0)
        return o
    }
    let fontsUsed = 0, miscount = [], misink = []
    for (const [kind, [letter, want, ink]] of Object.entries(EXPECT)) {
        const o = stampProbe(kind)
        fontsUsed += o.text
        if (o.px !== want) miscount.push(`${kind}/${letter}:${o.px}≠${want}`)
        if (o.inks.size !== 1 || !o.inks.has(ink)) misink.push(`${kind}:${[...o.inks].join('|')}≠${ink}`)
    }
    const odd = stampProbe('shotgun') // unknown kind falls back to S without throwing
    r.check('#2789 capsule letters are bitmap stamps — drawCapsule never touches the text APIs', fontsUsed === 0 && odd.px === 17, `text touches=${fontsUsed} fallback px=${odd.px}`)
    r.check('#2789 every stamp carries its exact glyph pixels (S17 M13 F12 L9)', miscount.length === 0, miscount.join(' ') || 'all counts exact')
    r.check('#2789 each letter keeps its wheel ink (M blue, F red, L purple, S orange)', misink.length === 0, misink.join(' ') || 'all inks hold')
}

// ---- #2971 LIVE chip: the HUD says so while a consented take banks ---------
// art.js is DOM-free — paint drawHud into a stub and count the plate. The
// chip must be a hot-red plate + dot + LIVE text, and it must never appear on
// a declined run (isRecording() is the bank's own truth — declined runs never
// carry a recorder, so no plate, no dot).
{
    const { drawHud } = await import('../src/games/Contra/art.js')
    const plate = (live) => {
        const o = { rects: [], text: [], arcs: 0 }
        const ctx = {
            textBaseline: '', font: '', fillStyle: '', strokeStyle: '', lineWidth: 0,
            fillRect (x, y, w, h) { o.rects.push(['fill', x, y, w, h, this.fillStyle]) },
            strokeRect (x, y, w, h) { o.rects.push(['stroke', x, y, w, h]) },
            fillText (t) { o.text.push(String(t)) },
            beginPath () {}, arc () { o.arcs++ }, fill () {},
        }
        drawHud(ctx, makeGame(7), 0, null, live)
        return o
    }
    const withLive = plate(true), without = plate(false)
    r.check('#2971 LIVE chip: a consented take banks — the HUD draws the plate, the dot and LIVE',
        withLive.text.includes('LIVE') && withLive.arcs >= 1 && withLive.rects.some((x) => x[0] === 'fill' && x[5] === 'rgba(26,8,8,0.92)'),
        `text=${withLive.text.filter(t => t === 'LIVE')} arcs=${withLive.arcs}`)
    r.check('#2971 LIVE chip: declined runs show nothing — no plate, no dot, no LIVE text',
        !without.text.includes('LIVE') && without.arcs === 0, `text=${without.text.join(',')} arcs=${without.arcs}`)
}

// ---- #2971 touch-aware attract copy ----------------------------------------
// The phone has no keys, and seat 2 is keyboard-only by design (Jon's rule) —
// the touch copy must say so, never teach WASD/F/G, and never invite a
// keyboard-only ceremony. Static source audit (the copy is a source const,
// the same pattern as the art legs) + the live touch flag on the probe.
{
    const src = readFileSync(join(ROOT, 'src/games/Contra/index.jsx'), 'utf8')
    const lines = (arr) => {
        const mm = src.match(new RegExp(`const ${arr} = \\[([\\s\\S]*?)\\]`))
        return mm ? [...mm[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : []
    }
    const touchLines = lines('MESSAGES_TOUCH')
    const kbLines = lines('MESSAGES_KEYBOARD')
    r.check('#2971 touch copy exists and teaches no keyboard keys',
        touchLines.length > 0 && !touchLines.some(t => /WASD|F JUMP|G FIRE|PRESS ANY KEY/i.test(t)),
        touchLines.join(' | '))
    r.check('#2971 touch copy says seat 2 is keyboard-only and the phone keeps the CPU ally',
        touchLines.some(t => /SEAT 2 IS KEYBOARD-ONLY/i.test(t) && /CPU ALLY/i.test(t)),
        touchLines.filter(t => /SEAT 2|CPU ALLY/i.test(t)).join(' | '))
    r.check('#2971 keyboard copy still teaches the seat-2 drop-in (the desktop path is unchanged)',
        kbLines.some(t => /2P DROP-IN: WASD MOVE/i.test(t)) && kbLines.some(t => /PRESS ANY KEY/i.test(t)),
        kbLines.filter(t => /DROP-IN|PRESS ANY/i.test(t)).join(' | '))
}

// ---- #2847 pod carriers: the capsules that fly in on aircraft --------------
{
    // the fly-in is seed/tick arithmetic (zero gs.r): same seed, same flight.
    const fly = (seed) => {
        const gs = makeGame(seed)
        gs.p.inv = 100000
        for (let i = 0; i < 900; i++) {
            step(gs, {})
            if (gs.carriers.length) return { tick: gs.tick, alt: gs.carriers[0].y, kind: gs.carriers[0].kind }
        }
        return null
    }
    const a = fly(7), b = fly(7)
    r.check('#2847 courier fly-in is deterministic (same tick, altitude, letter)', !!a && JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a))
    const kinds = new Set(); const alts = new Set()
    for (let s = 1; s <= 8; s++) { const f = fly(s); if (f) { kinds.add(f.kind); alts.add(f.alt) } }
    r.check('#2847 courier letters cover the wheel across seeds', kinds.size === 4, [...kinds].sort().join(','))
    r.check('#2847 couriers fly both bands across seeds', alts.size === 2, [...alts].sort((x, y) => x - y).join(','))
    r.check('#2847 zero rng law: seeding the courier draws nothing from gs.r', (() => {
        // the schedule must not consume gs.r — the tuned stream stands: every
        // existing gs.r consumer (soldier wake timing) shifts exactly as if
        // no carriers existed. Compare gs.r against a carriers-free drive.
        const g1 = makeGame(21); g1.p.inv = 100000
        const g2 = makeGame(21); g2.p.inv = 100000; g2.nextCarrier = 10 ** 9
        for (let i = 0; i < 1500; i++) { step(g1, {}); step(g2, {}) }
        return g1.r === g2.r
    })())
}
{
    // the two-hit law and the jettison: spark, then fall, and the pod carries
    // the letter the plane was ferrying.
    const gs = makeGame(7)
    gs.p2.out = true
    const y = CARRIER_ALT[1]
    gs.carriers.push({ x: gs.p.x + 60, y, vx: CFG.carrierVx, hp: CFG.carrierHp, kind: 'laser', dead: false })
    gs.pb.push({ x: gs.carriers[0].x, y: y + 5, vx: 5.5, vy: 0, k: 'r' })
    step(gs, {})
    r.check('#2847 first hit sparks the airframe (no jettison yet)', gs.carriers[0] && gs.carriers[0].hp === 1 && gs.pods.length === 0, `hp=${gs.carriers[0] && gs.carriers[0].hp} pods=${gs.pods.length}`)
    const sc = gs.score
    gs.pb.push({ x: gs.carriers[0].x, y: y + 5, vx: 5.5, vy: 0, k: 'r' })
    step(gs, {})
    r.check('#2847 the second hit downes the courier (+500) and drops its pod', gs.carriers.length === 0 && gs.pods.length === 1 && gs.score - sc === 500 && gs.pods[0].kind === 'laser' && gs.ev.some((e) => e.type === 'cargo'), `pods=${gs.pods.length} dScore=${gs.score - sc}`)
    // the pod falls, settles on the deck, and waits — then hands over its gun
    let rest = -1
    for (let i = 0; i < 300; i++) { step(gs, {}); if (gs.pods[0] && gs.pods[0].vy === 0 && gs.pods[0].y >= CFG.ground - 2) { rest = i; break } }
    r.check('#2847 the pod falls and settles at the deck line', rest >= 0, `rest after ${rest}`)
    if (gs.pods[0]) {
        gs.p.x = gs.pods[0].x; gs.p.inv = 100000
        step(gs, {})
        r.check('#2847 a settled pod delivers its gun on contact', gs.p.weapon === 'laser' && gs.pods.length === 0, `weapon=${gs.p.weapon} pods=${gs.pods.length}`)
    } else r.check('#2847 a settled pod delivers its gun on contact', false, 'pod vanished before pickup')
}
{
    // per-seat capture: the blue seat takes a pod that reaches HIM, the hero
    // keeps his gun (the capsule law, verbatim).
    const gs = makeGame(9)
    gs.p.x = 40
    gs.p2.human = true; gs.p2.x = 200; gs.p2.y = CFG.ground; gs.p2.onGround = true; gs.p2.lane = CFG.ground; gs.p2.inv = 100000
    gs.pods.push({ x: gs.p2.x + 2, y: CFG.ground - 2, vx: 0, vy: 0, kind: 'fire' })
    step(gs, {}, {})
    r.check('#2847 pods capture per-seat (the seat that touches takes the gun)', gs.p2.weapon === 'fire' && gs.p.weapon === 'rifle', `p=${gs.p.weapon} p2=${gs.p2.weapon}`)
}
{
    // fairness laws: the sky courier is a delivery, not an attacker (contact
    // never kills), the band sits above the gun-line (ground fire is not
    // intercepted), and only one courier is over the jungle at a time.
    const gs = makeGame(11)
    gs.p.inv = 0; gs.p.onGround = true
    gs.carriers.push({ x: gs.p.x + 2, y: CFG.ground - 14, vx: 0, hp: 2, kind: 'spread', dead: false })
    step(gs, {})
    r.check('#2847 contact with a courier is non-lethal (it is cargo, not a weapon)', gs.lives === 3 && gs.p.dead === 0, `lives=${gs.lives} dead=${gs.p.dead}`)
    gs.carriers.length = 0
    // ground fire passes under the band: kill a distant soldier with a flat
    // round while a courier flies directly over it.
    for (const s of gs.soldiers) s.dead = true
    gs.p2.out = true; gs.p.inv = 100000
    const victim = { x: gs.p.x + 90, y: CFG.ground, hold: false, hp: 1, awake: true, t: 99999, walk: 0, walkDir: -1, dead: false, flash: 0, nade: false, throwT: 0 }
    gs.soldiers.push(victim)
    gs.carriers.push({ x: victim.x, y: CARRIER_ALT[1], vx: CFG.carrierVx, hp: 2, kind: 'machine', dead: false })
    for (let i = 0; i < 40 && !victim.dead; i++) step(gs, { b: i === 0 })
    r.check('#2847 the flight band never eats a round aimed at the ground', victim.dead && gs.carriers.length === 1 && gs.carriers[0].hp === 2, `victim=${victim.dead} carrierHp=${gs.carriers[0] && gs.carriers[0].hp}`)
    // one courier at a time + escape reschedules the next flight
    let maxOver = 0
    for (let s = 1; s <= 6; s++) {
        const g = makeGame(s)
        g.p.inv = 100000; g.p2.inv = 100000
        for (let i = 0; i < 2400 && !g.end; i++) { step(g, {}); maxOver = Math.max(maxOver, g.carriers.length) }
    }
    r.check('#2847 only one courier over the jungle at a time', maxOver === 1, `max ${maxOver}`)
    {
        const g = makeGame(7)
        g.p.inv = 100000
        let escaped = null
        for (let i = 0; i < 1200; i++) {
            step(g, {})
            if (escaped == null && g.carriers.length === 0 && g.tick > 320) { escaped = { tick: g.tick, next: g.nextCarrier, pods: g.pods.length }; break }
        }
        r.check('#2847 an untouched courier escapes WITH its pod and reschedules', !!escaped && escaped.pods === 0 && escaped.next > escaped.tick + CFG.carrierNext, JSON.stringify(escaped))
    }
}
{
    // the canyon owns the vertical: entering the falls clears the sky, and
    // the couriers ride the state hash (a replay that drops one diverges loudly).
    const gs = makeGame(7)
    gs.p.inv = 100000
    gs.carriers.push({ x: 200, y: CARRIER_ALT[0], vx: CFG.carrierVx, hp: 2, kind: 'fire', dead: false })
    gs.pods.push({ x: 150, y: 180, vx: CFG.podVx, vy: 0.5, kind: 'spread' })
    warpFalls(gs)
    r.check('#2847 the waterfall clears the sky (no couriers, no pods below the falls)', gs.carriers.length === 0 && gs.pods.length === 0, `carriers=${gs.carriers.length} pods=${gs.pods.length}`)
    const g1 = makeGame(7), g2 = makeGame(7)
    g2.carriers.push({ x: 300, y: CARRIER_ALT[1], vx: CFG.carrierVx, hp: 2, kind: 'laser', dead: false })
    r.check('#2847 couriers ride the state hash (a dropped courier diverges)', stateHash(g1) !== stateHash(g2))
}
{
    // ---- #2852 pod-carrier polish: the snap, the puff, the rotor disc ----
    // Jettison snap: the pod hangs at release while the cable recoil lasts,
    // THEN falls — nothing just appears-and-drops. Touchdown kicks exactly one
    // dust event with a 12-tick speck puff, and the pod stays collectable.
    const gs = makeGame(11)
    gs.p2.out = true
    const yC = CARRIER_ALT[0]
    gs.carriers.push({ x: gs.p.x + 60, y: yC, vx: CFG.carrierVx, hp: CFG.carrierHp, kind: 'spread', dead: false })
    for (let i = 0; i < 2 && gs.carriers.length; i++) {
        gs.pb.push({ x: gs.carriers[0].x, y: yC + 5, vx: 5.5, vy: 0, k: 'r' })
        step(gs, {})
    }
    const pod = gs.pods[0]
    r.check('#2852 jettison stamps a cable-recoil snap on the pod', !!pod && pod.recoil > 0 && pod.recoil <= 6, pod ? `recoil=${pod.recoil}` : 'no pod')
    if (pod) {
        const yHold = pod.y
        let snapTicks = 0
        while (pod.recoil > 0 && snapTicks < 8) { step(gs, {}); snapTicks++ }
        r.check('#2852 the load hangs while the hooks part (no fall during snap)', pod.y === yHold && snapTicks >= 4, `dy=${(pod.y - yHold).toFixed(2)} snapTicks=${snapTicks}`)
        let fell = false
        for (let i = 0; i < 8 && !fell; i++) { step(gs, {}); fell = pod.y > yHold }
        r.check('#2852 gravity resumes the beat after the snap', fell)
        let dusts = 0
        let landed = -1
        gs.ev.length = 0
        for (let i = 0; i < 300 && (landed < 0 || i < landed + 14); i++) {
            step(gs, {})
            dusts += gs.ev.filter((e) => e.type === 'dust').length
            gs.ev.length = 0
            if (landed < 0 && pod.puff > 0 && pod.y >= CFG.ground - 2) landed = i
        }
        r.check('#2852 touchdown kicks exactly one dust event at the deck', dusts === 1 && landed >= 0, `dusts=${dusts} landed@${landed}`)
        r.check('#2852 the puff rides the pod and the pod stays collectable', pod.puff >= 0 && pod.y >= CFG.ground - 2, `puff=${pod.puff}`)
        gs.p.x = pod.x; gs.p.inv = 100000
        step(gs, {})
        r.check('#2852 the snapped, puffed pod still delivers its gun', gs.p.weapon === 'spread' && gs.pods.length === 0, `weapon=${gs.p.weapon} pods=${gs.pods.length}`)
    } else {
        r.check('#2852 the load hangs while the hooks part (no fall during snap)', false, 'no pod to hang')
        r.check('#2852 gravity resumes the beat after the snap', false, 'no pod')
        r.check('#2852 touchdown kicks exactly one dust event at the deck', false, 'no pod')
        r.check('#2852 the puff rides the pod and the pod stays collectable', false, 'no pod')
        r.check('#2852 the snapped, puffed pod still delivers its gun', false, 'no pod')
    }
    // rotor read: a translucent disc sweep under TWO counter-phase blade rows —
    // never a single 1-px antenna line (the #2852 complaint).
    {
        const calls = []
        let alpha = 1
        const ctx = {
            save () {}, restore () {}, translate () {},
            set fillStyle (v) { this.f = v }, get fillStyle () { return this.f },
            set globalAlpha (v) { alpha = v }, get globalAlpha () { return alpha },
            fillRect (x, y, w, h) { calls.push({ x, y, w, h, a: alpha }) },
        }
        drawCarrier(ctx, { x: 0, y: 0, hp: 2 }, 0)
        const disc = calls.some((k) => k.a < 1 && k.w >= 30)
        const bladeA = calls.some((k) => k.h === 1 && k.y === -12 && k.w >= 20)
        const bladeB = calls.some((k) => k.h === 1 && k.y === -11 && k.w >= 20)
        r.check('#2852 the rotor reads as a disc: translucent sweep + two blade rows', disc && bladeA && bladeB, `disc=${disc} blades=${bladeA}/${bladeB}`)
    }
    // hook frames: a recoiling pod draws its cut cables, tips flicking open.
    {
        const frames = (recoil) => {
            const calls = []
            const ctx = {
                save () {}, restore () {}, translate () {},
                set fillStyle (v) { this.f = v }, get fillStyle () { return this.f },
                set globalAlpha (v) {}, get globalAlpha () { return 1 },
                fillRect (x, y, w, h) { calls.push({ x, y, w, h }) },
            }
            drawCapsule(ctx, { x: 0, y: 0, kind: 'laser', recoil }, 0)
            return calls
        }
        const early = frames(6), late = frames(2)
        r.check('#2852 the jettison draws cut-cable stubs that flick open', early.filter((k) => k.y === -9 && k.h === 3).length === 2 && late.some((k) => k.y === -11), `stubs=${early.filter((k) => k.y === -9 && k.h === 3).length} tips=${late.some((k) => k.y === -11)}`)
        r.check('#2852 a settled pod draws no hooks (cables only at the snap)', frames(0).filter((k) => k.y === -9 && k.h === 3).length === 0)
    }
}

// ---- #2917 the second air layer: hangar sorties at the gate -----------------
{
    // THE TELEGRAPH: the door grinds before the hull is born. Pin the whole
    // chain on one seed — grind, launch, emergence at the mouth — and demand
    // the `hangar` event strictly precedes `lift` by gsTelegraph ticks.
    const cycle = (seed) => {
        const gs = makeGame(seed)
        gs.p2.out = true
        gs.p.inv = 100000
        warpBoss(gs)
        let grindAt = 0, liftAt = 0, emerge = null
        const evs = []
        for (let i = 0; i < 500; i++) {
            step(gs, {})
            for (const e of gs.ev) evs.push(e.type)
            gs.ev.length = 0
            if (!grindAt && gs.boss.hangar.open > 0) grindAt = gs.tick
            if (!liftAt && gs.boss.hangar.launchAt > 0) liftAt = gs.tick
            if (!emerge && gs.gunships.length) emerge = { tick: gs.tick, x: gs.gunships[0].x, y: gs.gunships[0].y, ty: gs.gunships[0].ty, hp: gs.gunships[0].hp }
            if (emerge) break
        }
        return { grindAt, liftAt, emerge, firstHangar: evs.indexOf('hangar'), firstLift: evs.indexOf('lift') }
    }
    const c7 = cycle(7), c7b = cycle(7)
    r.check('#2917 the door telegraphs the sortie — grind, then lift, gsTelegraph apart, hull emerges at the mouth',
        c7.grindAt > 0 && c7.liftAt === c7.grindAt && c7.emerge && c7.emerge.tick === c7.grindAt + CFG.gsTelegraph
        && c7.firstHangar >= 0 && c7.firstLift > c7.firstHangar
        && Math.abs(c7.emerge.x - (CFG.gsHangarX - 6 + CFG.gsVx)) < 0.01
        && Math.abs(c7.emerge.y - (CFG.gsHangarY + 10.8)) < 0.01 && c7.emerge.hp === CFG.gsHp,
        JSON.stringify(c7))
    r.check('#2917 sortie cycle is deterministic (same seed, same grind tick, emergence and altitude)',
        JSON.stringify(c7) === JSON.stringify(c7b), JSON.stringify(c7))
    {
        const bands = new Set()
        for (let s = 1; s <= 8; s++) { const e = cycle(s).emerge; if (e) bands.add(e.ty) }
        r.check('#2917 sorties work both altitude bands across seeds', bands.size === 2 && [...bands].every((b) => CFG.gsAlt.includes(b)), [...bands].sort((a, b) => a - b).join(','))
    }
    r.check('#2917 zero rng law: the sortie schedule draws nothing from gs.r', (() => {
        const g1 = makeGame(21); g1.p.inv = 100000; warpBoss(g1)
        const g2 = makeGame(21); g2.p.inv = 100000; warpBoss(g2); g2.sortieT = 10 ** 9; g2.p2.out = true; g1.p2.out = true
        for (let i = 0; i < 900; i++) { step(g1, {}); step(g2, {}) }
        return g1.r === g2.r
    })(), 'gs.r identical across a sortie-full and a sortie-free boss run')
}
{
    // THE STRAFE LAW at the sim level: an idle grounded hero, one hull — every
    // round the hull fires is pinned-speed, SHALLOW (|vy| <= gsVyMax, inside
    // the autopilot's 1.2 hop window), and it leaves the hull only while the
    // hull is OVER the fortress.
    const gs = makeGame(3)
    gs.p2.out = true; gs.p.inv = 100000
    warpBoss(gs)
    let seen = 0, shallow = true, pinnedSpeed = true
    let firedOverWall = true, firedGrounded = true, sawFire = false
    for (let i = 0; i < 900; i++) {
        step(gs, {})
        if (gs.ev.some((e) => e.type === 'gsfire')) {
            sawFire = true
            const sh = gs.gunships[0]
            if (!sh || sh.x <= CFG.wallX) firedOverWall = false
            if (!gs.p.onGround) firedGrounded = false
        }
        gs.ev.length = 0
        for (const b of gs.eb) if (b.gs) {
            seen += 1
            if (Math.abs(b.vy) > CFG.gsVyMax + 1e-9) shallow = false
            if (Math.abs(Math.hypot(b.vx, b.vy) - CFG.eBulletSpeed) > 0.01) pinnedSpeed = false
        }
    }
    r.check('#2917 an idle grounded hero draws the strafe — hull fires only over the fortress, at a grounded target',
        sawFire && firedOverWall && firedGrounded, `fires=${sawFire} overWall=${firedOverWall} grounded=${firedGrounded}`)
    r.check('#2917 every hull round is pinned-speed and SHALLOW — |vy| <= gsVyMax < the 1.2 hop window, so the hop is always the answer',
        seen > 0 && shallow && pinnedSpeed, `roundTicks=${seen}`)
    r.check('#2917 fairness by construction — band, cap and cadence stand inside the taught answers',
        CFG.gsVyMax < 1.2 && CFG.gsAlt[1] + CFG.gsHH < 136 && CFG.gsAlt[0] - CFG.gsHH > 40 && CFG.gsRearm >= CFG.gsTelegraph,
        `vyMax=${CFG.gsVyMax} band=${CFG.gsAlt.join('..')} rearm=${CFG.gsRearm}`)
    r.check('#2917 the sortie cadence law — loop 1 runs the hangar at exact tempo (sortieK(1)=1), later passes raise cadence at HALF the tempo only',
        sortieK(1) === 1 && Math.abs(sortieK(1.3) - 1.15) < 1e-9 && sortieK(1.3) < 1.3 && sortieK(1.3) > 1,
        `sortieK(1)=${sortieK(1)} sortieK(cap)=${sortieK(1.3)}`)
}
{
    // THE AIRFRAME: three rounds, spark per hit, named fireball, +400 purse.
    const gs = makeGame(5)
    gs.p2.out = true; gs.p.inv = 100000
    warpBoss(gs); gs.sortieT = 10 ** 9
    gs.gunships.push({ x: 200, y: 60, ty: 60, vx: 0, hp: CFG.gsHp, t: 10 ** 9, n: 1, dead: false, flash: 0 })
    const sc = gs.score
    const sparks = []
    for (let i = 0; i < 3; i++) {
        gs.pb.push({ x: 186, y: 62, vx: 5.5, vy: 0, k: 'r' })
        step(gs, {})
        sparks.push(gs.ev.filter((e) => e.type === 'spark').length)
        gs.ev.length = 0
    }
    r.check('#2917 three rounds take the hull — spark per hit, white flash, then the named fireball and the arcade purse',
        gs.gunships.length === 0 && gs.score - sc === CFG.gsScore && sparks.every((n) => n === 1), `dScore=${gs.score - sc} sparks=${sparks.join(',')}`)
}
{
    // THE PIERCE LAW, verbatim on the new hulls: a laser beam sparks through
    // one hull per beam and keeps flying; each hull eats exactly one take.
    const gs = makeGame(5)
    gs.p2.out = true; gs.p.inv = 100000
    warpBoss(gs); gs.sortieT = 10 ** 9
    gs.gunships.push({ x: 200, y: 60, ty: 60, vx: 0, hp: CFG.gsHp, t: 10 ** 9, n: 1, dead: false, flash: 0 })
    gs.gunships.push({ x: 160, y: 60, ty: 60, vx: 0, hp: CFG.gsHp, t: 10 ** 9, n: 2, dead: false, flash: 0 })
    gs.pb.push({ x: 138, y: 60, vx: 5.5, vy: 0, k: 'l' })
    let pierces = 0
    for (let i = 0; i < 24 && gs.pb.length; i++) { step(gs, {}); pierces += gs.pb.filter((b) => b.k === 'l').length; gs.ev.length = 0 }
    const [h200, h160] = gs.gunships
    r.check('#2917 FIRE/LASER pierce the airframe one take per hull per beam — the beam answers to the sky law, not a wall',
        h200.hp === CFG.gsHp - 1 && h160.hp === CFG.gsHp - 1 && pierces >= 10, `200:${h200 && h200.hp} 160:${h160 && h160.hp} beamTicks=${pierces}`)
}
{
    // THE CONTACT LAW: the hull is a weapon, not cargo — touching it takes a
    // life (either seat), while a grounded flat shot passes UNDER the band.
    const gs = makeGame(5)
    gs.p2.out = true; gs.p.inv = 0
    warpBoss(gs); gs.sortieT = 10 ** 9
    gs.gunships.push({ x: gs.p.x, y: gs.p.y - 14, ty: gs.p.y - 14, vx: 0, hp: CFG.gsHp, t: 10 ** 9, n: 1, dead: false, flash: 0 })
    step(gs, {})
    r.check('#2917 contact with the hull kills the seat — this aircraft is a weapon, not a courier',
        gs.lives < 3, `lives=${gs.lives}`)
    // ... and the band sits above the gun line: a flat round aimed at the far
    // gun flies its whole crossing without ever touching a hull in its band.
    const g2 = makeGame(5)
    g2.p2.out = true; g2.p.inv = 100000
    warpBoss(g2); g2.sortieT = 10 ** 9
    g2.gunships.push({ x: 300, y: CFG.gsAlt[1], ty: CFG.gsAlt[1], vx: 0, hp: CFG.gsHp, t: 10 ** 9, n: 1, dead: false, flash: 0 })
    const near = g2.gunships[0]
    const chest = g2.p.y - 14   // the arena floor sits above the jungle deck — aim at the hero's real chest line
    for (let i = 0; i < 60; i++) {
        g2.pb.push({ x: g2.p.x + 8, y: chest, vx: CFG.bulletSpeed || 5.5, vy: 0, k: 'r' })
        step(g2, {})
    }
    r.check('#2917 the band never eats flat ground fire — rounds aimed at the wall fly under the sortie (up-aim is the toll)',
        near.hp === CFG.gsHp && chest - CFG.gsHH > CFG.gsAlt[1], `hullHp=${near.hp}`)
}
{
    // HASH + PHASE laws: the falls own the vertical alone, and the schedule,
    // the door and the airframe are all sim truth.
    const gs = makeGame(7)
    gs.p.inv = 100000
    warpBoss(gs)
    for (let i = 0; i < 400 && !gs.gunships.length; i++) step(gs, {})
    warpFalls(gs)
    r.check('#2917 the waterfall clears the sky — no hulls, no armed door below the falls',
        gs.gunships.length === 0 && gs.sortieT === 0 && (!gs.boss || gs.boss.hangar.open === 0), `hulls=${gs.gunships.length} sortieT=${gs.sortieT}`)
    const g1 = makeGame(9); warpBoss(g1)
    const g2 = makeGame(9); warpBoss(g2); g2.sortieT += 1
    const g3 = makeGame(9); warpBoss(g3); g3.gunships.push({ x: 220, y: 60, ty: 60, vx: 0, hp: CFG.gsHp, t: 10 ** 9, n: 1, dead: false, flash: 0 })
    r.check('#2917 schedule, door and airframe ride the state hash — a replay that dodged a sortie diverges loudly',
        stateHash(g1) !== stateHash(g2) && stateHash(g1) !== stateHash(g3))
    // the heart going quiet empties the sky: with the core dead, no hull flies.
    const g4 = makeGame(9); warpBoss(g4); g4.p.inv = 100000; g4.p2.out = true
    g4.sortieT = g4.tick
    for (let i = 0; i < CFG.gsTelegraph + 6 && !g4.gunships.length; i++) step(g4, {})
    g4.boss.core = 1; g4.boss.coreT = 0
    let emptied = false
    for (let i = 0; i < 40 && !emptied; i++) {
        g4.pb.push({ x: CFG.coreX - 6, y: CFG.coreY, vx: 5.5, vy: 0, k: 'r' })
        step(g4, {})
        if (g4.boss.dying > 0) { emptied = true; break }
    }
    r.check('#2917 with the heart gone the sky empties too — no sortie outlives the core',
        emptied && g4.gunships.length === 0, `dying=${g4.boss && g4.boss.dying} hulls=${g4.gunships.length}`)
}
{
    // THE FAIRNESS SPINE (the session's pin): under the UNCHANGED honest
    // autopilot, across seeds 1..12 — no seed ever faces two hulls at once,
    // sorties actually fly (gsFirstShot lands inside the fortress-crossing
    // window — the trap the draft PR named), and the gate's strafe rounds do
    // answer to the game's taught hop: every round still satisfies the flat-
    // shot family the brain already clears.
    let maxHulls = 0, sorties = 0, rounds = 0, shallow = true
    for (let s = 1; s <= 12; s++) {
        const gs = makeGame(s)
        while (!gs.end && gs.tick < 20000) {
            step(gs, autopilot(gs))
            maxHulls = Math.max(maxHulls, gs.gunships.length)
            sorties += gs.boss && gs.boss.hangar.launchAt > 0 && gs.boss.hangar.open === CFG.gsGrind ? 1 : 0
            for (const b of gs.eb) if (b.gs) { rounds += 1; if (Math.abs(b.vy) > CFG.gsVyMax + 1e-9) shallow = false }
            gs.ev.length = 0
        }
    }
    r.check('#2917 one sortie at a time under the honest autopilot, across seeds 1..12',
        maxHulls === 1, `max ${maxHulls}`)
    r.check('#2917 the second air layer is LIVE under autopilot — sorties fly and rounds answer to the hop law (gsFirstShot inside the crossing window)',
        sorties >= 6 && rounds >= 1 && shallow, `sorties=${sorties} rounds=${rounds} shallow=${shallow}`)
}

// ------------------------------------------------------------- the mutants ---
if (MUTANT) {
    const plants = [
        {
            name: 'spawn-shield',
            anchor: 'if (s.x < gs.cam + W - 4 && s.y < gs.camY + H - 4) { s.awake = true',
            plant: 'if (s.x < gs.cam + W + 40 && s.y < gs.camY + H - 4) { /* MUTANT(spawn-shield): soldiers wake past the bullet-despawn edge */ s.awake = true',
            harm: async (mod) => {
                const gs = mod.makeGame(13)
                let wakesOut = 0
                for (const s of gs.soldiers) s._w = false
                while (!gs.end && gs.tick < 20000) {
                    mod.step(gs, mod.autopilot(gs))
                    for (const s of gs.soldiers) if (s.awake && !s._w) { s._w = true; if (s.x >= 384 + gs.cam - 2 || s.y >= gs.camY + 224 - 2) wakesOut++ }
                    gs.ev.length = 0
                }
                return wakesOut > 0 ? `HARM NAMED: ${wakesOut} soldiers woke beyond the bullet-despawn edge - an unshootable shield; the stage plays itself` : null
            },
        },
        {
            name: 'sealed-core',
            anchor: 'const open = (bo.coreT % CFG.coreCycle) < CFG.coreOpen\n                if (open) {',
            plant: 'const open = false /* MUTANT(sealed-core): the shutter never rides */\n                if (open) {',
            harm: async (mod) => {
                let wins = 0
                for (let s = 1; s <= 6; s++) {
                    const gs = mod.makeGame(s)
                    while (!gs.end && gs.tick < 20000) { mod.step(gs, mod.autopilot(gs)); gs.ev.length = 0 }
                    if (gs.end === 'win') wins++
                }
                return wins === 0 ? 'HARM NAMED: the core never opens - 0/6 seeds can finish the stage; the gate is an unwinnable wall' : null
            },
        },
        {
            // S3: the wheel must actually turn. Silence the MG's round and the
            // letter M becomes a legend on the capsule instead of a gun.
            name: 'no-stream',
            anchor: `gs.pb.push({ x: o.x, y: o.y, vx: p.ax * CFG.machineSpeed, vy: p.ay * CFG.machineSpeed, k: 'm', o: owner })`,
            plant: 'void 0 /* MUTANT(no-stream): the MG clicks on empty */',
            harm: async (mod) => {
                const gs = mod.makeGame(5)
                gs.p.weapon = 'machine'
                let n = 0
                for (let i = 0; i < 60; i++) { mod.step(gs, { b: true }); n += gs.pb.filter((b) => b.k === 'm').length; gs.pb.length = 0 }
                return n === 0 ? 'HARM NAMED: MACHINE GUN fires nothing - the wheel lost M, 20 rounds promised and zero delivered' : null
            },
        },
        {
            // S3: piercing is the signature of F and L. Freeze the hit-list and
            // the beam becomes just a fast, boring rifle.
            name: 'no-pierce',
            anchor: "const pierce = b.k === 'f' || b.k === 'l'",
            plant: 'const pierce = false /* MUTANT(no-pierce): beams stop dead at the first body */',
            harm: async (mod) => {
                const gs = mod.makeGame(5)
                gs.p.weapon = 'laser'
                gs.p2.out = true // pinned solo: attribute the line to the hero's beam, not the blue rifle
                for (const s of gs.soldiers) s.dead = true
                const a = { x: gs.p.x + 70, y: mod.CFG.ground, hold: false, hp: 1, awake: true, t: 99999, walk: 0, walkDir: -1, dead: false, flash: 0, nade: false, throwT: 0 }
                const b = { x: gs.p.x + 110, y: mod.CFG.ground, hold: false, hp: 1, awake: true, t: 99999, walk: 0, walkDir: -1, dead: false, flash: 0, nade: false, throwT: 0 }
                gs.soldiers.push(a, b)
                for (let i = 0; i < 80; i++) { mod.step(gs, { b: i === 0 }); gs.ev.length = 0 }
                const kills = (a.dead ? 1 : 0) + (b.dead ? 1 : 0)
                return kills <= 1 ? `HARM NAMED: the laser stops at one body (${kills}/2) - piercing was the wheel's signature, now it is just a fast rifle` : null
            },
        },
        {
            name: 'depot-impervious',
            anchor: "dp.hp -= 1; gs.ev.push({ type: 'spark', x: b.x, y: b.y })",
            plant: "dp.hp -= 0; /* MUTANT(depot-impervious): the emplacement cannot be caved */ gs.ev.push({ type: 'spark', x: b.x, y: b.y })",
            harm: async (mod) => {
                let volleys = 0
                for (let s = 1; s <= 6; s++) {
                    const gs = mod.makeGame(s)
                    while (!gs.end && gs.tick < 20000) { if (gs.ev.some((e) => e.type === 'volley')) volleys++; gs.ev.length = 0; mod.step(gs, mod.autopilot(gs)) }
                }
                return volleys === 0 ? 'HARM NAMED: the arms depot is impervious - 0/6 seeds release the capsule volley; the arcade keeps its guns behind the wall' : null
            },
        },
        {
            // #2880: take the housings' HP away and the gate returns to the
            // old forever-armour — ten rounds, a hundred rounds, the gun talks
            // on. The harm names exactly the gap this stage closed.
            name: 'gate-armor-forever',
            anchor: 'g.hp -= 1',
            plant: 'g.hp -= 0; /* MUTANT(gate-armor-forever): the cannon housings never dent */',
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                mod.warpBoss(gs)
                gs.p.x = 150; gs.p.y = mod.CFG.bossFloor; gs.p.onGround = true; gs.p.vy = 0
                gs.boss.guns.forEach((g) => { g.t = 1e9 }); gs.boss.doors.forEach((d) => { d.t = 1e9 })
                gs.p.x = 100; gs.p.inv = 99999; gs.p2.out = true
                let dead = false
                for (let i = 0; i < 1200 && !dead; i++) {
                    gs.p.x = 100
                    mod.step(gs, { right: true, up: true, b: true })
                    dead = gs.boss.guns[0].dead
                }
                return dead ? null : 'HARM NAMED: the gate housing is impervious - 1200 ticks of aimed fire at x=100 and the gun still cannot be answered; the depot law never reached the gate'
            },
        },
        {
            // #2814 re-forged: ignore the partner's SEAT and the run GAME OVERs
            // the instant the hero's pool empties while the blue soldier still
            // stands — the cabinet never ends a run under a living second player.
            name: 'one-bank-lie',
            anchor: 'return gs.p.out && gs.p2.out',
            plant: 'return gs.p.out /* MUTANT(one-bank-lie): seat 2 ignored - hero down ends the run */',
            harm: async (mod) => {
                const gs = mod.makeGame(11)
                gs.p.x = 40
                gs.p2.human = true; gs.p2.x = 60; gs.p2.inv = 100000   // pin seat 2 up, out of the line of fire
                for (let k = 0; k < 3; k++) {
                    gs.p.inv = 0; gs.p.dead = 0
                    gs.eb.push({ x: gs.p.x + 2, y: gs.p.y - 14, vx: 0.1, vy: 0 })
                    mod.step(gs, {}, {})
                    for (let i = 0; i < 60; i++) { mod.step(gs, {}, {}); gs.ev.length = 0 }
                }
                return gs.end === 'dead' && !gs.p2.out && gs.p2.dead === 0
                    ? 'HARM NAMED: seat 2 is ignored - the run GAME OVERs while the blue soldier still stands; the cabinet ends it only when both seats are down'
                    : null
            },
        },
        {
            // #2814: blue deaths must drain the SHARED pool. Let them ride free
            // and the volunteer is an immortal tank — co-op is a lie the other
            // way: the partner costs the team nothing.
            name: 'blue-death-is-free',
            anchor: "    if (gs.lives > 0) gs.lives -= 1\n    if (gs.lives <= 0) {\n        gs.lives = 0; q.out = true",
            plant: "    /* MUTANT(blue-death-is-free): the volunteer costs the team nothing */\n    if (gs.lives <= 0) {\n        gs.lives = 0; q.out = true",
            harm: async (mod) => {
                const gs = mod.makeGame(9)
                gs.p.inv = 100000
                gs.p2.inv = 0
                gs.eb.push({ x: gs.p2.x + 2, y: gs.p2.y - 14, vx: 0.1, vy: 0 })
                mod.step(gs, {}, {})
                return gs.lives === 3 && gs.p2.dead > 0
                    ? 'HARM NAMED: blue deaths drain nothing - the partner is an immortal tank; the cabinet makes EVERY death cost the shared pool'
                    : null
            },
        },
        {
            // #2789: the letter IS the gun label. Erase the stamp and every
            // capsule is an anonymous orange box - the wheel goes blind.
            name: 'letter-erased',
            file: join(ROOT, 'src/games/Contra/art.js'),
            mod: 'art.js',
            anchor: 'if (rows[r] & (1 << (4 - bit))) ctx.fillRect(-2 + bit, -2 + r, 1, 1)',
            plant: 'if (false && (rows[r] & (1 << (4 - bit)))) ctx.fillRect(-2 + bit, -2 + r, 1, 1) /* MUTANT(letter-erased): the window stays blank */',
            harm: async (mod) => {
                const o = { text: 0, ink: null, px: 0 }
                const ctx = {
                    save () {}, restore () {}, translate () {},
                    fillText () { o.text++ }, measureText () { o.text++; return { width: 7 } },
                    set font (_) { o.text++ }, get font () { return '' },
                    set textBaseline (_) { o.text++ }, get textBaseline () { return 'top' },
                    set fillStyle (v) { o.ink = v }, get fillStyle () { return o.ink },
                    fillRect (x, y, w, h) { if (w === 1 && h === 1 && x >= -2 && x <= 2 && y >= -2 && y <= 2) o.px++ },
                }
                mod.drawCapsule(ctx, { x: 0, y: 0, kind: 'machine' }, 0)
                return o.px === 0 ? 'HARM NAMED: capsules stamp no letter - M/F/L/S are blank orange boxes; the player cannot tell which gun the capsule carries' : null
            },
        },
        {
            // #2837: a passenger who stands up must leave a drivable seat. If
            // the patience never fires, the abandoned puppet stays human forever
            // and the wingman never steps back in.
            name: 'never-release',
            anchor: 'seatIdle: 600,',
            plant: 'seatIdle: 2147483647, /* MUTANT(never-release): the patience never runs out */',
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                gs.p.x = 300; gs.p.inv = 100000
                gs.soldiers.forEach((s) => { s.dead = true }); gs.turrets.forEach((t) => { t.dead = true }); gs.snipers.forEach((s) => { s.dead = true }); gs.barrels.forEach((b) => { b.gone = true })
                mod.dropIn(gs)
                for (let i = 0; i < 700; i++) { mod.step(gs, {}, {}); gs.eb.length = 0 }
                return gs.p2.human === true
                    ? 'HARM NAMED: nobody drove the seat for ten seconds and it was never taken back - the abandoned human seat just stands there while the wingman brain watches'
                    : null
            },
        },
        {
            // #2847: the courier's whole POINT is the pod it drops. Let the
            // airframe fall empty and the sky is target practice for nothing.
            name: 'cargo-jettison',
            anchor: 'gs.pods.push({ x: cr.x, y: cr.y + 12, vx: CFG.podVx, vy: 0, kind: cr.kind, recoil: 6, puff: 0 })',
            plant: 'void 0 /* MUTANT(cargo-jettison): the courier keeps its prize */',
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                gs.p2.out = true
                gs.carriers.push({ x: gs.p.x + 60, y: mod.CARRIER_ALT[1], vx: mod.CFG.carrierVx, hp: mod.CFG.carrierHp, kind: 'laser', dead: false })
                gs.pb.push({ x: gs.carriers[0].x, y: mod.CARRIER_ALT[1] + 5, vx: 5.5, vy: 0, k: 'r' })
                mod.step(gs, {})
                gs.pb.push({ x: gs.carriers[0].x, y: mod.CARRIER_ALT[1] + 5, vx: 5.5, vy: 0, k: 'r' })
                mod.step(gs, {})
                return gs.pods.length === 0
                    ? 'HARM NAMED: a downed courier drops nothing - the plane is shot but no pod is jettisoned; the sky delivery never reaches the deck'
                    : null
            },
        },
        {
            // #2847: two rounds must be enough. A steel courier keeps its cargo
            // out of reach and the wheel stays in the sky.
            name: 'carrier-impervious',
            anchor: 'cr.hp -= 1\n                gs.ev.push({ type: \'spark\', x: b.x, y: b.y })',
            plant: 'cr.hp -= 0 /* MUTANT(carrier-impervious): the airframe swallows rounds */\n                gs.ev.push({ type: \'spark\', x: b.x, y: b.y })',
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                gs.p2.out = true
                gs.carriers.push({ x: gs.p.x + 60, y: mod.CARRIER_ALT[1], vx: mod.CFG.carrierVx, hp: mod.CFG.carrierHp, kind: 'laser', dead: false })
                for (let i = 0; i < 30; i++) {
                    gs.pb.push({ x: gs.carriers[0].x, y: mod.CARRIER_ALT[1] + 5, vx: 5.5, vy: 0, k: 'r' })
                    mod.step(gs, {})
                    if (!gs.carriers.length) break
                }
                return gs.carriers.length === 1
                    ? 'HARM NAMED: the courier cannot be downed - 30 rounds spark off and the pod is never released; no gun on the wheel can be earned from the sky'
                    : null
            },
        },
        {
            // #2854: the housing pierce branch is the whole stage. Revoke it and
            // the wall swallows beams again — the laser stops where a rank of
            // soldiers would fly through.
            name: 'housings-eat-beams',
            anchor: "if (pierce) { hs.push('g' + gi); continue }",
            plant: "if (false) { hs.push('g' + gi); continue } /* MUTANT(housings-eat-beams): the mount swallows beams again */",
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                mod.warpBoss(gs)
                gs.p.x = 100; gs.p.y = mod.CFG.bossFloor; gs.p.onGround = true; gs.p.vy = 0
                gs.p.weapon = 'laser'; gs.p.inv = 99999
                gs.boss.guns.forEach((g) => { g.t = 1e9 }); gs.boss.doors.forEach((d) => { d.t = 1e9 })
                let crossed = false
                for (let i = 0; i < 90; i++) {
                    mod.step(gs, { right: true, up: true, b: true })
                    if (gs.pb.some((b) => b.k === 'l' && b.y < 28)) crossed = true
                    gs.ev.length = 0
                }
                return crossed
                    ? null
                    : 'HARM NAMED: beams die at the cannon housings again - the laser stops dead at the mount where the bodies law says it flies on; pierce stops at the wall'
            },
        },
        // #2852 pod-carrier polish laws — each named harm must kill a pin.
        {
            name: 'no-snap',
            anchor: 'vx: CFG.podVx, vy: 0, kind: cr.kind, recoil: 6, puff: 0',
            plant: 'vx: CFG.podVx, vy: 0, kind: cr.kind, recoil: 0, puff: 0 /* MUTANT(no-snap): the cargo drops dead on the cut */',
            harm: async (mod) => {
                const gs = mod.makeGame(11)
                gs.p2.out = true
                gs.carriers.push({ x: gs.p.x + 60, y: mod.CARRIER_ALT[0], vx: mod.CFG.carrierVx, hp: mod.CFG.carrierHp, kind: 'spread', dead: false })
                for (let i = 0; i < 2 && gs.carriers.length; i++) {
                    gs.pb.push({ x: gs.carriers[0].x, y: mod.CARRIER_ALT[0] + 5, vx: 5.5, vy: 0, k: 'r' })
                    mod.step(gs, {})
                }
                const pod = gs.pods[0]
                return pod && !(pod.recoil > 0)
                    ? 'HARM NAMED: the jettison has no snap - the pod appears and drops with nothing selling the release; the hooks never part'
                    : null
            },
        },
        {
            name: 'dry-landing',
            anchor: "if (c.vy > 0) { c.puff = 12; gs.ev.push({ type: 'dust', k: c.kind }) }",
            plant: 'if (false && c.vy > 0) { /* MUTANT(dry-landing): touchdown kicks no sand */ }',
            harm: async (mod) => {
                const gs = mod.makeGame(11)
                gs.p2.out = true
                gs.carriers.push({ x: gs.p.x + 60, y: mod.CARRIER_ALT[0], vx: mod.CFG.carrierVx, hp: mod.CFG.carrierHp, kind: 'spread', dead: false })
                for (let i = 0; i < 2 && gs.carriers.length; i++) {
                    gs.pb.push({ x: gs.carriers[0].x, y: mod.CARRIER_ALT[0] + 5, vx: 5.5, vy: 0, k: 'r' })
                    mod.step(gs, {})
                }
                gs.ev.length = 0
                let landed = false
                let signal = false
                for (let i = 0; i < 240 && !landed; i++) {
                    mod.step(gs, {})
                    if (gs.ev.some((e) => e.type === 'dust')) signal = true
                    if (gs.pods[0] && gs.pods[0].puff > 0) signal = true
                    gs.ev.length = 0
                    if (gs.pods[0] && gs.pods[0].y >= mod.CFG.ground - 2) landed = true
                }
                return landed && !signal
                    ? 'HARM NAMED: the pod lands dry - cargo hits the deck with no puff and no sound; the eye never sees the touchdown'
                    : null
            },
        },
        {
            name: 'antenna-rotor',
            file: join(ROOT, 'src/games/Contra/art.js'),
            mod: 'art.js',
            anchor: 'ctx.fillRect(-19, -12, 38, 2)',
            plant: '/* MUTANT(antenna-rotor): the translucent disc sweep is gone */',
            harm: async (mod) => {
                const calls = []
                let alpha = 1
                const ctx = {
                    save () {}, restore () {}, translate () {},
                    set fillStyle (v) { this.f = v }, get fillStyle () { return this.f },
                    set globalAlpha (v) { alpha = v }, get globalAlpha () { return alpha },
                    fillRect (x, y, w, h) { calls.push({ x, y, w, h, a: alpha }) },
                }
                mod.drawCarrier(ctx, { x: 0, y: 0, hp: 2 }, 0)
                return !calls.some((k) => k.a < 1 && k.w >= 30)
                    ? 'HARM NAMED: the rotor lost its disc sweep - two chopping lines over bare sky read as an antenna, the exact #2852 complaint'
                    : null
            },
        },
        {
            name: 'one-blade',
            file: join(ROOT, 'src/games/Contra/art.js'),
            mod: 'art.js',
            anchor: 'ctx.fillRect(-wB, -11, wB * 2, 1)',
            plant: '/* MUTANT(one-blade): the counter-phase blade line is gone */',
            harm: async (mod) => {
                const calls = []
                const ctx = {
                    save () {}, restore () {}, translate () {},
                    set fillStyle (v) { this.f = v }, get fillStyle () { return this.f },
                    set globalAlpha (v) {}, get globalAlpha () { return 1 },
                    fillRect (x, y, w, h) { calls.push({ x, y, w, h }) },
                }
                mod.drawCarrier(ctx, { x: 0, y: 0, hp: 2 }, 0)
                return !calls.some((k) => k.h === 1 && k.y === -11 && k.w >= 20)
                    ? 'HARM NAMED: a single blade line again - without the counter-phase row the chop reads as a stick, not a spinning disc'
                    : null
            },
        },
        {
            name: 'no-hooks',
            file: join(ROOT, 'src/games/Contra/art.js'),
            mod: 'art.js',
            anchor: 'ctx.fillRect(-6, -9, 1, 3); ctx.fillRect(5, -9, 1, 3)',
            plant: '/* MUTANT(no-hooks): the cut cables never draw */',
            harm: async (mod) => {
                const calls = []
                const ctx = {
                    save () {}, restore () {}, translate () {},
                    set fillStyle (v) { this.f = v }, get fillStyle () { return this.f },
                    set globalAlpha (v) {}, get globalAlpha () { return 1 },
                    fillRect (x, y, w, h) { calls.push({ x, y, w, h }) },
                }
                mod.drawCapsule(ctx, { x: 0, y: 0, kind: 'laser', recoil: 6 }, 0)
                return calls.filter((k) => k.y === -9 && k.h === 3).length === 0
                    ? 'HARM NAMED: a recoiling pod draws no cables - nothing ever held it, so the snap is invisible'
                    : null
            },
        },
        // #2885 finale + vine-carrier laws — each named harm must kill a pin.
        {
            name: 'cascade-random',
            anchor: "                const site = CASCADE[CASCADE.length - 1 - bo.dying / CFG.cascadeStep]\n                boom(gs, site.x, site.y, false, 'tnt')",
            plant: "                boom(gs, mod_wallX(gs) + 20 + rnd(gs) * 180, 30 + rnd(gs) * 110, false, 'tnt') /* MUTANT(cascade-random): noise around the wall, not the script */\n                function mod_wallX (g) { return 168 }",
            harm: async (mod) => {
                const run = (seed) => {
                    const gs = mod.makeGame(seed); mod.warpBoss(gs)
                    gs.boss.core = 1; gs.boss.coreT = 0
                    gs.pb.push({ x: mod.CFG.coreX - 4, y: mod.CFG.coreY, vx: 1, vy: 0, k: 'r' })
                    const sites = []
                    for (let i = 0; i < 400 && !gs.end; i++) { mod.step(gs, {}); for (const e of gs.ev) if (e.type === 'boom' && e.kind === 'tnt') sites.push([Math.round(e.x), Math.round(e.y)]); gs.ev.length = 0 }
                    return sites
                }
                const a = run(3), b = run(40031)
                return JSON.stringify(a) !== JSON.stringify(b)
                    ? 'HARM NAMED: the finale rerandomizes per seed - the fortress dies in noise, not the scripted walk the original choreographs'
                    : null
            },
        },
        {
            name: 'vine-deadwood',
            anchor: 'h.vine = vi; h.grabI = vi; h.rideT = 0; h.vineAtY = h.y',
            plant: 'void 0 /* MUTANT(vine-deadwood): the tips stop catching */',
            harm: async (mod) => {
                const gs = mod.makeGame(7); mod.warpFalls(gs)
                let rode = false
                for (let i = 0; i < 300 && !rode; i++) {
                    mod.step(gs, { a: true })
                    const tp = mod.vineTip(gs, 0)
                    if (gs.p.vine < 0 && gs.p.dead === 0) { gs.p.x = tp.x; gs.p.y = tp.y + 14; gs.p.vy = -1; gs.p.onGround = false }
                    rode = gs.p.vine >= 0
                }
                return !rode
                    ? 'HARM NAMED: a vine catches nobody - the carriers are deadwood and the climb loses its alternate line'
                    : null
            },
        },
        {
            name: 'vine-sink',
            anchor: 'h.y = tp.y + CFG.vineHang',
            plant: 'h.y = h.vineAtY + CFG.vineHang /* MUTANT(vine-sink): the strand stops tracking the arc */',
            harm: async (mod) => {
                const gs = mod.makeGame(7); mod.warpFalls(gs)
                for (let i = 0; i < 300 && gs.p.vine < 0; i++) {
                    mod.step(gs, { a: true })
                    const tp = mod.vineTip(gs, 0)
                    if (gs.p.vine < 0 && gs.p.dead === 0) { gs.p.x = tp.x; gs.p.y = tp.y + 14; gs.p.vy = -1; gs.p.onGround = false }
                }
                if (gs.p.vine < 0) return 'HARM NAMED: rider never even caught the vine in the harness rig — cannot score this law'
                const at = gs.p.vineAtY
                let peak = gs.p.y
                for (let i = 0; i < mod.CFG.vineRideMax + 40 && gs.p.vine >= 0; i++) { mod.step(gs, {}); peak = Math.min(peak, gs.p.y) }
                const lift = at - peak
                return lift < mod.CFG.vineCarryMin
                    ? `HARM NAMED: the vine lifts its rider only ${lift.toFixed(1)}px (< ${mod.CFG.vineCarryMin}) — the arc is dead, riders are dropped back where they hung`
                    : null
            },
        },
        {
            // #2894: a loop that never gets hotter is a placebo — STAGE CLEAR
            // would hand back the same tempo and call it round two.
            name: 'loop-dead',
            anchor: 'return Math.min(LOOP_CAP, 1 + LOOP_STEP * Math.max(0, Math.floor(n) - 1))',
            plant: 'return 1 /* MUTANT(loop-dead): every pass runs the first pass tempo */',
            harm: async (mod) => {
                const run = (loop) => {
                    const gs = mod.makeGame(7, loop)
                    mod.warpBoss(gs)
                    gs.soldiers.length = 0
                    gs.boss.doors.forEach((d) => { d.t = 1e9 })
                    gs.p.inv = 99999; gs.p2.out = true
                    const t = []
                    while (t.length < 3 && gs.tick < 1500) { mod.step(gs, {}); for (const e of gs.ev) if (e.type === 'cannon') t.push(gs.tick); gs.ev.length = 0 }
                    return t
                }
                const a = run(1); const b = run(2)
                return b.length === a.length && b[2] >= a[2]
                    ? `HARM NAMED: loop 2's cannons answer at loop 1's tempo (${a.join(',')} vs ${b.join(',')}) — stage 1 returns but never runs hot; the arcade loop is a placebo`
                    : null
            },
        },
        {
            // #2894: the clamp is the winnable-law of the heat — escape it and
            // the deep loops become rounds the tuned hop simply cannot answer.
            name: 'loop-overdrive',
            anchor: 'export const LOOP_CAP = 1.30',
            plant: 'export const LOOP_CAP = 2',
            harm: async (mod) => mod.loopK(6) !== 1.3
                ? `HARM NAMED: the tempo escapes its pin — loop 6 runs x${mod.loopK(6).toFixed(2)}; the ceiling that keeps every loop clearable is gone and the bank can no longer carry it`
                : null,
        },
        {
            // #2905: a tree line that never moves is the gap this stage closed —
            // freeze the relocation and the crossfire is nailed to one perch
            // again, exactly the pre-#2905 cabinet-of-cardboard behaviour.
            name: 'perch-frozen',
            anchor: 'sn.relocT = PERCH_RELOC',
            plant: 'sn.relocT = 0 /* MUTANT(perch-frozen): the canopy never walks */',
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                gs.p2.out = true; gs.p.inv = 999999
                const rel = []
                for (let i = 0; i < 1000 && rel.length < 5; i++) {
                    gs.p.x = 1150
                    const before = gs.ev.length
                    mod.step(gs, {})
                    for (let j = before; j < gs.ev.length; j++) { const e = gs.ev[j]; if (e.type === 'sniper' && e.bx === 1270) rel.push(Math.round(e.x) - 1270) }
                }
                return rel.length >= 2 && rel.every((x) => x === 0)
                    ? `HARM NAMED: nest 1270 fires all ${rel.length} rounds from x-home (${JSON.stringify(rel)}) — the perch rotation is dead and the crossfire sits on one fixed spot again`
                    : null
            },
        },
        {
            // #2905: put the rifle back in the grenadier's hands — the cabinet's
            // vest throws only, and a bandolier that sprays flat rounds while it
            // advances makes the approach band a wall no hop covers.
            name: 'lob-hall',
            anchor: 'if (!s.nade && tgt && s.t <= 0 && Math.abs(dx) < range && Math.abs(dy) < range * 0.9 && inCamX && inCamY) {',
            plant: 'if (tgt && s.t <= 0 && Math.abs(dx) < range && Math.abs(dy) < range * 0.9 && inCamX && inCamY) /* MUTANT(lob-hall): the vest keeps its rifle */ {',
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                gs.p.inv = 999999; gs.p2.out = true
                const vest = gs.soldiers.find((s) => s.nade)
                gs.soldiers.forEach((s) => { if (s !== vest) s.dead = true })
                gs.turrets.forEach((t) => { t.dead = true }); gs.snipers.forEach((s) => { s.dead = true })
                vest.awake = true
                let rounds = 0
                for (let i = 0; i < 600; i++) {
                    vest.x = gs.p.x + 150
                    if (gs.depot) gs.depot.dead = true
                    const before = gs.eb.length
                    mod.step(gs, {})
                    for (let j = before; j < gs.eb.length; j++) if (!gs.eb[j].gr) rounds++
                }
                return rounds > 0
                    ? `HARM NAMED: the vest grenadier fired ${rounds} flat rifle rounds in 600 ticks — the cabinet's bandolier throws only, and the extra rifle thickens the approach past the lane the hop was tuned for`
                    : null
            },
        },
        {
            // #2902: a world that never looks hotter is the gap this pass
            // closed — pin the sky heat dead and round two arrives unmarked.
            name: 'loop-blind',
            file: ART, mod: 'art.js',
            anchor: 'const skyNotch = (n) => Math.max(0, Math.min(2, Math.floor(n) - LOOP_SKY_HOT + 1))',
            plant: 'const skyNotch = () => 0 /* MUTANT(loop-blind): the palette stops reading the pass */',
            harm: async (mod) => JSON.stringify(mod.heatSky(4)) === JSON.stringify(mod.heatSky(1))
                ? 'HARM NAMED: the sky at loop 4 is the loop-1 sky — stage 1 comes back identically dressed and a player who missed the HUD tag cannot tell round two started'
                : null,
        },
        {
            // #2902: the rising reports ARE the escalation the cabinet's board
            // paid; flatten the voice and the loop goes quiet-cold.
            name: 'voice-flat',
            anchor: 'return Math.min(1 + 0.06 * 3, 1 + 0.06 * (Math.max(1, Math.floor(n)) - 1))',
            plant: 'return 1 /* MUTANT(voice-flat): every pass reports at loop 1 pitch */',
            harm: async (mod) => mod.loopVoice(3) <= 1
                ? `HARM NAMED: loop 3's guns crack at loop 1 pitch — the sound never escalates; the heat loses the layer the original sold it with`
                : null,
        },
        {
            // #2917: the airframe is three rounds of armour — take the decrement
            // and the sortie becomes an unkillable taxi. Name it.
            name: 'gunship-impervious',
            anchor: 'sh.hp -= 1',
            plant: 'sh.hp -= 0 /* MUTANT(gunship-impervious): the airframe swallows rounds */',
            harm: async (mod) => {
                const gs = mod.makeGame(5)
                gs.p2.out = true; gs.p.inv = 100000
                mod.warpBoss(gs); gs.sortieT = 10 ** 9
                gs.gunships.push({ x: 200, y: 60, ty: 60, vx: 0, hp: mod.CFG.gsHp, t: 10 ** 9, n: 1, dead: false, flash: 0 })
                for (let i = 0; i < 12; i++) {
                    gs.pb.push({ x: 186, y: 62, vx: 5.5, vy: 0, k: 'r' })
                    mod.step(gs, {})
                    if (!gs.gunships.length) break
                }
                return gs.gunships.length === 1
                    ? 'HARM NAMED: the gunship cannot be downed - 12 rounds spark off and the hull owns the arena sky forever; the second air layer becomes an unanswerable tax'
                    : null
            },
        },
        {
            // #3000: the shout must actually reach the barrel. Silence the aim
            // channel at the seam and the radio echoes while the wingman keeps
            // staring at the treeline — louder than useless, a liar with a banner.
            name: 'voice-deaf',
            anchor: 'gs.orderAim = intent.dir',
            plant: "gs.orderAim = 'level' /* MUTANT(voice-deaf): every aim shout falls on deaf ears */",
            harm: async (mod) => {
                const gs = mod.makeGame(13)
                for (let t = 0; t < 90; t++) { mod.step(gs, mod.autopilot(gs)); gs.ev.length = 0 }
                mod.applyCall(gs, { kind: 'aim', dir: 'up' })
                let up = 0
                for (let t = 0; t < 120 && !gs.end; t++) {
                    mod.step(gs, mod.autopilot(gs)); gs.ev.length = 0
                    for (const bl of gs.pb) if (bl.o === 1 && bl.vy < -0.3) up++
                }
                return up < 100
                    ? `HARM NAMED: AIM UP was shouted, the banner said AIM UP - and the wingman answered with ${up} sky-rounds (hundreds expected). The radio became theater`
                    : null
            },
        },
        {
            // #3000: defaults are the contract with every pre-voice pin and
            // sweep — drift the born-stance and un-spoken runs change shape.
            name: 'drift-hug',
            anchor: "orderAim: 'level', orderForm: 'follow', holdX: 0,",
            plant: "orderAim: 'level', orderForm: 'spread', holdX: 0, /* MUTANT(drift-hug): the wingman is born on a flank nobody ordered */",
            harm: async (mod) => {
                const gs = mod.makeGame(3)
                return gs.orderForm !== 'follow'
                    ? `HARM NAMED: a fresh game starts already SPREAD (${gs.orderForm}) - the pre-voice stance drifted; every un-spoken run and pin stands on sand`
                    : null
            },
        },
        {
            // #3035: the tuck must actually turn. Freeze the clock and the hero
            // hangs in the air like a photograph — the photograph is the bug
            // this stage was filed to erase.
            name: 'stiff-hop',
            anchor: 'else if (h.rollT > 0) h.rollT += 1',
            plant: 'else if (false && h.rollT > 0) h.rollT += 1 /* MUTANT(stiff-hop): the body never turns - the jump hangs a photograph */',
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                for (let i = 0; i < 40; i++) { mod.step(gs, {}); gs.ev.length = 0 }
                mod.step(gs, { a: true })
                let maxRoll = gs.p.rollT
                for (let i = 0; i < 120 && !gs.p.onGround; i++) { mod.step(gs, {}); maxRoll = Math.max(maxRoll, gs.p.rollT) }
                return maxRoll <= 1
                    ? `HARM NAMED: the whole arc held rollT=${maxRoll} - the hero hangs in the air for ${maxRoll >= 1 ? 'a full 37-tick jump' : 'the jump'} without turning a degree; the cabinet's signature silhouette is gone and ART bar 2 (falls animate) is broken`
                    : null
            },
        },
        {
            // #3035: only the jump tumbles. Arm the clock on ANY air and every
            // step off a ledge becomes a somersault the cabinet never does —
            // the tumble stops meaning "I jumped".
            name: 'roll-on-step',
            anchor: 'if (h.onGround) h.rollT = 0\n    else if (h.rollT > 0) h.rollT += 1',
            plant: 'if (h.onGround) h.rollT = 0\n    else { h.rollT = Math.max(1, h.rollT + 1) /* MUTANT(roll-on-step): any airborne frame tumbles - steps and drop-throughs somersault too */ }',
            harm: async (mod) => {
                const g = mod.makeGame(7)
                mod.warpFalls(g)
                g.p.inv = 999999
                const led = mod.FALLS_LEDGES[0]
                g.p.x = led.x + led.w - 4; g.p.y = led.y; g.p.onGround = true; g.p.vy = 0
                let offRoll = 0
                for (let i = 0; i < 60; i++) { mod.step(g, { right: true }); if (!g.p.onGround) offRoll = Math.max(offRoll, g.p.rollT) }
                return offRoll > 0
                    ? `HARM NAMED: walking off a ledge rolled rollT=${offRoll} - the tumble now lies about whether the player jumped; the cabinet reserves the somersault for the jump`
                    : null
            },
        },
        {
            // #3038: DOWN must bend the body. A deaf duck erases the three
            // ground profiles this stage was filed for — the cabinet's own
            // stance system, gone silent at the seam.
            name: 'duck-deaf',
            anchor: 'if (pad.down && !h.prevD && h.posture < 2) { h.posture += 1;',
            plant: 'if (false && pad.down && !h.prevD && h.posture < 2) { h.posture += 1; /* MUTANT(duck-deaf): DOWN on the ground is inert - the cabinet\'s profiles are gone */',
            harm: async (mod) => {
                const gs = mod.makeGame(3)
                gs.p.inv = 999999
                for (let i = 0; i < 30; i++) { mod.step(gs, {}); gs.ev.length = 0 }
                mod.step(gs, { down: true }); mod.step(gs, {})
                mod.step(gs, { down: true })
                return gs.p.posture === 0
                    ? 'HARM NAMED: two presses of DOWN on the ground and the hero never left his feet - kneel and prone do not exist; the signature silhouette this stage shipped is gone'
                    : null
            },
        },
        {
            // #3038: the duck dodges AIMED fire, not the ground. A flat body
            // that shrugs off a deck blast turns the profile into a cheat
            // code, and the honest grenade — the cabinet's own answer to
            // low posture — stops being an answer.
            name: 'prone-immortal',
            anchor: 'if (gs.p.dead === 0 && gs.p.inv <= 0 && !gs.p.out && Math.hypot(gs.p.x - x, gs.p.y - ((CFG.duckCenter[gs.p.posture | 0] || 14) - 2) - y) < CFG.blastPlayerR) killPlayer(gs)',
            plant: 'if (gs.p.dead === 0 && gs.p.inv <= 0 && !gs.p.out && gs.p.posture !== 2 && Math.hypot(gs.p.x - x, gs.p.y - 12 - y) < CFG.blastPlayerR) killPlayer(gs) /* MUTANT(prone-immortal): the ground stops answering a flat body - ducking is a cheat */',
            harm: async (mod) => {
                const g = mod.makeGame(11)
                g.p.inv = 0; g.p.posture = 2
                // outside the contact band, inside the radius: only the blast
                // can answer this one — which is exactly where the cheat hides.
                g.eb.push({ x: g.p.x + 18, y: mod.CFG.ground - 60, vx: -0.4, vy: 2.4, gr: true })
                for (let i = 0; i < 80 && g.p.dead === 0 && !g.p.out; i++) mod.step(g, {})
                return g.p.dead === 0 && !g.p.out
                    ? 'HARM NAMED: a grenade landed at a prone hero\'s feet and the blast walked away unhurt - the flat body shrugs off the very ground it lies on; lying down became an invincibility cheat'
                    : null
            },
        },
        {
            // #3038: the profile pays its price. Full-speed ducks make the
            // honest answer to every aimed round "lie down and sprint" - the
            // crawl is the trade that keeps the duck a decision, not a law.
            name: 'no-crawl-price',
            anchor: 'if (runDir) { h.x += runDir * (h.posture > 0 ? CFG.run * CFG.duckSpeed : CFG.run); h.walk += 1 }',
            plant: 'if (runDir) { h.x += runDir * CFG.run; h.walk += 1 } /* MUTANT(no-crawl-price): low profiles keep full speed - the trade is gone, ducking is free */',
            harm: async (mod) => {
                const g = mod.makeGame(5)
                g.p.inv = 999999
                const dx = (pad) => { const x0 = g.p.x; mod.step(g, pad); return g.p.x - x0 }
                const run = dx({ right: true })
                dx({ down: true }); dx({}); dx({ down: true }); dx({})
                const proneDx = dx({ right: true })
                return g.p.posture === 2 && Math.abs(proneDx - run) < 0.01
                    ? `HARM NAMED: a prone hero covered ${proneDx.toFixed(1)} px/tick - the same as a full sprint; the crawl price is gone and ducking costs nothing to do at speed`
                    : null
            },
        },
    ]
    for (const p of plants) {
        const f = p.file || SIM
        const src = readFileSync(f, 'utf8')
        if (!src.includes(p.anchor)) { console.error(`MUTANT anchor (${p.name}) missing — ${p.mod || 'sim.js'} moved; the plant must be re-anchored`); process.exit(2) }
        writeFileSync(f, src.replace(p.anchor, p.plant))
        let bad
        try {
            bad = 'dynamic-import'
            bad = await p.harm(await import(`../src/games/Contra/${p.mod || 'sim.js'}?mutant=${p.name}${Date.now()}`))
        } finally {
            writeFileSync(f, src)
        }
        r.check(`mutant(${p.name}) goes RED: harm named`, bad !== null, bad || 'harm NOT named — mutant survived')
    }
    console.log('\nmutant run: expected red on the planted lines.')
    r.exit()
}

// ---------------------------------------------------- #2894 arcade loop ---
// STAGE CLEAR hands stage 1 back at tempo. loopK is a pure, clamped staircase;
// loop 1 is byte-identical to the pre-loop shelf; loop/lk are sim truth; the
// settings draw zero rng; the gate's cannons bark sooner at identical opening
// conditions; the shutter cycles at k (duty ratio stands, windows shorten);
// and every loop stays clearable by the honest autopilot on all 12 seeds at
// the loop bank (3 + 1 per loop, capped) that the shell pays on the resume.
r.check('#2894 loopK is a pure staircase: x1 at loop 1, +LOOP_STEP a pass, pinned at LOOP_CAP from loop 4',
    loopK(1) === 1 && Math.abs(loopK(2) - (1 + LOOP_STEP)) < 1e-9 && Math.abs(loopK(3) - (1 + 2 * LOOP_STEP)) < 1e-9 && loopK(4) === LOOP_CAP && loopK(9) === LOOP_CAP && loopK(99) === LOOP_CAP)

const lp1 = makeGame(5)
const lp2 = makeGame(5, 1)
let lpSame = lp1.loop === 1 && lp1.lk === 1 && lp2.loop === 1 && lp2.lk === 1 && stateHash(lp1) === stateHash(lp2)
for (let i = 0; i < 600 && lpSame; i++) {
    step(lp1, autopilot(lp1)); step(lp2, autopilot(lp2))
    if (stateHash(lp1) !== stateHash(lp2)) lpSame = false
}
r.check('#2894 the default is still loop 1 — makeGame(seed) and makeGame(seed,1) tick identically for 600 beats', lpSame)
r.check('#2894 the loop rides the hash — same seed, different pass, different sim truth',
    stateHash(makeGame(5)) !== stateHash(makeGame(5, 2)))
r.check('#2894 tempo settings consume zero rng — the seeded stream starts where it always did',
    makeGame(5, 3).r === makeGame(5).r)

const cannonRun = (mod, loop) => {
    const gs = mod.makeGame(7, loop)
    mod.warpBoss(gs)
    gs.soldiers.length = 0
    gs.boss.doors.forEach((d) => { d.t = 1e9 })
    gs.p.inv = 99999; gs.p2.out = true
    const t = []
    while (t.length < 4 && gs.tick < 1500) {
        mod.step(gs, {})
        for (const e of gs.ev) if (e.type === 'cannon') t.push(gs.tick)
        gs.ev.length = 0
    }
    return t
}
const cL1 = cannonRun({ makeGame, step, warpBoss }, 1)
const cL2 = cannonRun({ makeGame, step, warpBoss }, 2)
r.check('#2894 the gate runs hot — identical opening volley, then loop 2 lands its guns sooner (tempo, not bullet speed)',
    cL1.length === 4 && cL2.length === 4 && cL1[0] === cL2[0] && cL1[1] === cL2[1] && cL2[2] < cL1[2] && cL2[3] < cL1[3],
    JSON.stringify({ loop1: cL1, loop2: cL2 }))

const sh = makeGame(7, 2)
warpBoss(sh)
sh.soldiers.length = 0; sh.boss.doors.forEach((d) => { d.t = 1e9 }); sh.p.inv = 99999; sh.p2.out = true
const coreT0 = sh.boss.coreT   // makeBoss opens its cycle armored-in — measure the delta, not the face value
for (let i = 0; i < 100; i++) step(sh, {})
r.check('#2894 the shutter cycles at tempo — coreT advances by k, so both windows shorten and the duty ratio stands',
    Math.abs((sh.boss.coreT - coreT0) - 100 * loopK(2)) < 1e-6, `dcoreT=${sh.boss.coreT - coreT0} want=${100 * loopK(2)}`)

const loopSweep = (L) => {
    const fails = []
    for (let s = 1; s <= 12; s++) {
        const gs = makeGame(s, L)
        gs.lives = Math.min(LOOP_LIVES_MAX, 3 + (L - 1) * LOOP_LIFE_BONUS)   // the bank startLoop pays on the resume
        while (!gs.end && gs.tick < 30000) { step(gs, autopilot(gs)); gs.ev.length = 0 }
        if (gs.end !== 'win') fails.push(`${s}:${gs.end}@${gs.tick}`)
    }
    return fails
}
const fL2 = loopSweep(2), fL3 = loopSweep(3), fL4 = loopSweep(4), fL9 = loopSweep(9)
r.check('#2894 loops 2 and 3 clear with the honest autopilot on all 12 seeds at the loop bank',
    fL2.length === 0 && fL3.length === 0, [...fL2, ...fL3].join(' ') || 'all clear')
r.check('#2894 the heat holds — capped loops 4 and 9 still clear 12/12 — the loop never becomes unwinnable',
    fL4.length === 0 && fL9.length === 0, [...fL4, ...fL9].join(' ') || 'all clear')

// ------------------------------------------------ #2902 loop presentation ---
// The resume must be seen AND heard hotter — but as pure palette/voice derived
// from the pass number, never rng, never a new speed. Loop 1 returns the exact
// base colors and pitch (the pre-loop look is byte-pinned); the heat rises one
// notch and HOLDS (capped), mirroring loopK's ceiling so no cue outruns the
// tempo. These are the sim-can't-lie cues: the art reads gs.loop directly.
{
    const toRgb = (h) => { const p = parseInt(h.slice(1), 16); return [(p >> 16) & 255, (p >> 8) & 255, p & 255] }
    const redBias = (h) => { const [r, , b] = toRgb(h); return r - b }
    const redderThan = (a, b) => a.every((c, i) => redBias(c) > redBias(b[i]))   // r-b (red-minus-blue) rises on every stop
    const s1 = heatSky(1), s2 = heatSky(2), s3 = heatSky(3), s4 = heatSky(4), s9 = heatSky(9)
    r.check('#2902 the jungle sky reads the base palette through loop 2 (loop 1 is byte-pinned)',
        JSON.stringify(s1) === JSON.stringify(SKY_BASE) && JSON.stringify(s2) === JSON.stringify(SKY_BASE), JSON.stringify(s1))
    r.check('#2902 loop 3 turns the sky one notch redder (every stop gains red-minus-blue)',
        redderThan(s3, s1), JSON.stringify(s3))
    r.check('#2902 the sky heat is capped — loop 4 = loop 9 (mirrors loopK, no runaway)',
        JSON.stringify(s4) === JSON.stringify(s9), JSON.stringify({ s4, s9 }))

    const m1 = heatMuzzle(1), m2 = heatMuzzle(2), m3 = heatMuzzle(3), m9 = heatMuzzle(9)
    // "hotter" for a muzzle star = the green drains out of it (yellow-white ->
    // red-hot); red-minus-blue is the SKY metric but reads flat on saturated
    // orange, where red and blue fall together.
    const gDrains = (a, b) => a.every((c, i) => toRgb(c)[1] < toRgb(b[i])[1])
    r.check('#2902 muzzle flash stays at the base colors on loop 1',
        JSON.stringify(m1) === JSON.stringify(MUZZLE_BASE), JSON.stringify(m1))
    r.check('#2902 loop 2 runs the muzzle hotter (green drains from both flash frames — yellow-white toward red)',
        gDrains(m2, m1), JSON.stringify(m2))
    r.check('#2902 muzzle heat is capped too', JSON.stringify(m3) === JSON.stringify(m9), JSON.stringify({ m3, m9 }))

    r.check('#2902 the loop voice is unity on loop 1 (no pitch shift on the pre-loop run)',
        loopVoice(1) === 1, `v1=${loopVoice(1)}`)
    r.check('#2902 enemy reports rise ~6% a pass — loop 2 = x1.06, loop 3 = x1.12',
        Math.abs(loopVoice(2) - 1.06) < 1e-9 && Math.abs(loopVoice(3) - 1.12) < 1e-9, `v2=${loopVoice(2)} v3=${loopVoice(3)}`)
    r.check('#2902 the voice is capped at x1.18 (holds from loop 4, mirroring LOOP_CAP)',
        loopVoice(4) === loopVoice(9) && Math.abs(loopVoice(9) - 1.18) < 1e-9, `v4=${loopVoice(4)} v9=${loopVoice(9)}`)

    r.check('#2902 LOOP_FX holds the world for ~two beats (an interstitial, not a flicker)',
        LOOP_FX >= 90 && LOOP_FX <= 140, `LOOP_FX=${LOOP_FX}`)

    r.check('#2902 the heat cues never couple to gameplay — loopK is still the only tempo law',
        loopK(1) === 1 && Math.abs(loopK(2) - 1.1) < 1e-9 && loopK(4) === LOOP_CAP)

    const h1 = makeGame(11, 3), h2 = makeGame(11, 3)
    for (let i = 0; i < 400; i++) { step(h1, autopilot(h1)); step(h2, autopilot(h2)); heatSky(h1.loop); heatMuzzle(h1.loop) }
    r.check('#2902 heat cues are hash-clean — two loop-3 replays stay identical (palette/voice consume zero gs.r)',
        stateHash(h1) === stateHash(h2), `${stateHash(h1)} vs ${stateHash(h2)}`)
}

// ------------------------------------------------- #3000 spoken orders ---
// The voice seam, Node side: the pure grammar, the honest sim seam, and the
// obedience laws. Determinism rules the section: an un-spoken run is the
// pre-#3000 game byte-for-byte (twins hash-identical), a spoken run diverges
// (the orders ride the hash), and applyCall consumes ZERO gs.r — a shout can
// never bend the seed. Formation lives where it can be kept: jungle and arena;
// the falls climb out-ranks it (a held seat on the torrent is a drowned seat).
{
    const CALLS_YES = [
        ['aim up', 'aim-up'], ['AIM UP!', 'aim-up'], ['shoot high', 'aim-up'], ['watch the sky', 'aim-up'],
        ['point up there', 'aim-up'], ['guns up', 'aim-up'], ['look above', 'aim-up'], ['bring the gunship down', 'aim-up'],
        ['bring it down', 'aim-down'], ['aim down', 'aim-down'], ['fire low', 'aim-down'],
        ['aim straight ahead', 'aim-level'], ['level your gun', 'aim-level'],
        ['follow me', 'follow'], ['come with me', 'follow'], ['rally', 'follow'], ['let us go', 'follow'],
        ['hold', 'hold'], ['hold position', 'hold'], ['stay', 'hold'], ['cover me', 'hold'], ['wait', 'hold'],
        ['spread out', 'spread'], ['fan out', 'spread'], ['take the flank', 'spread'], ['fall back', 'spread'], ['widen up', 'spread'],
    ]
    const CALLS_NO = ['', 'up', 'down', 'aim', 'watch out', 'left right', 'grenade', 'hello friend', 'the jungle']
    const missY = CALLS_YES.filter(([t, want]) => intentKey(parseCall(t)) !== want)
    const hitN = CALLS_NO.filter((t) => intentKey(parseCall(t)) !== null)
    r.check(`#3000 grammar: all ${CALLS_YES.length} phrasings land their intent`, missY.length === 0, missY.map((x) => `${x[0]}->${intentKey(parseCall(x[0]))}`).join(' '))
    r.check(`#3000 grammar: all ${CALLS_NO.length} non-orders refuse (bare directions and commandless verbs are guesses, not orders)`,
        hitN.length === 0, hitN.join(' '))

    {
        const gs = makeGame(7)
        const r0 = gs.r
        const a = applyCall(gs, { kind: 'aim', dir: 'up' })
        const f = applyCall(gs, { kind: 'formation', dir: 'spread' })
        const bad = applyCall(gs, { kind: 'teleport', dir: 'win' })
        r.check('#3000 honesty: orders consume zero gs.r — a shout cannot bend the seed',
            gs.r === r0 && a.ok && f.ok && !bad.ok, `why=${bad.why}`)
    }

    {
        const gs = makeGame(3)
        const d0 = gs.orderAim === 'level' && gs.orderForm === 'follow' && gs.holdX === 0
        applyCall(gs, { kind: 'formation', dir: 'spread' })
        applyCall(gs, { kind: 'aim', dir: 'up' })
        const next = arcadeLoop(gs)
        r.check('#3000 defaults are today\'s stance, and the arcade-loop rebuild resets the orders',
            d0 && next.orderForm === 'follow' && next.orderAim === 'level' && next.holdX === 0)
    }

    const twinRun = (seed, n, at, intent) => {
        const gs = makeGame(seed)
        const trail = []
        for (let t = 0; t < n; t++) {
            if (at === t && intent) applyCall(gs, intent)
            step(gs, autopilot(gs))
            trail.push({ x: gs.p2.x, y: gs.p2.y, px: gs.p.x })
        }
        return { gs, trail }
    }

    {
        const a = makeGame(17); const b = makeGame(17)
        let same = true
        for (let t = 0; t < 600 && !a.end && !b.end; t++) {
            step(a, autopilot(a)); step(b, autopilot(b))
            if (stateHash(a) !== stateHash(b)) { same = false; break }
        }
        r.check('#3000 the invariant law: un-spoken twins stay hash-identical for 600 ticks (nobody shouted, nothing changed)', same)
        const c = makeGame(19); const d = makeGame(19)
        let diverged = false
        for (let t = 0; t < 400 && !c.end && !d.end; t++) {
            if (t === 50) applyCall(d, { kind: 'aim', dir: 'up' })
            step(c, autopilot(c)); step(d, autopilot(d))
            if (stateHash(c) !== stateHash(d)) { diverged = true; break }
        }
        r.check('#3000 orders move the hash — a replay cannot silently drop a shout', diverged)
    }

    {
        const a = twinRun(5, 240)
        const b = twinRun(5, 240, 60, { kind: 'formation', dir: 'spread' })
        const gapA = a.trail[239].px - a.trail[239].x
        const gapB = b.trail[239].px - b.trail[239].x
        r.check('#3000 SPREAD widens the flank (the wingman takes the lagging lane)',
            gapB > gapA + 25, `gap follow=${gapA.toFixed(0)} spread=${gapB.toFixed(0)}`)
        applyCall(b.gs, { kind: 'formation', dir: 'follow' })
        let n = 0
        while (!b.gs.end && n < 140 && b.gs.p.x - b.gs.p2.x > 36) { step(b.gs, {}); n++ }
        r.check('#3000 FOLLOW re-anchors to the shoulder (shared physics: the walk-in closes while the hero is quiet)',
            b.gs.p.x - b.gs.p2.x <= 36, `closed to ${(b.gs.p.x - b.gs.p2.x).toFixed(0)} in ${n} quiet ticks`)
    }

    {
        // Scripted, seed-honest hold drill: drive the hero straight so the
        // camera ratchets at a known pace; post the wingman mid-screen; the
        // scroll must reach the post (release) and the resume must chase.
        // Seeds 1..12 tried in order — the first survivor names the drill.
        const holdDrill = (seed) => {
            const gs = makeGame(seed)
            let n = 0, drift = 0, stood = 0, holdX = 0, released = false, chased = 0
            while (n < 400 && !gs.end && gs.p2.x - gs.cam < 150) { step(gs, { right: true }); n++ }
            if (gs.end || gs.p2.dead > 0) return null
            const called = applyCall(gs, { kind: 'formation', dir: 'hold' })
            if (!called.ok) return null
            holdX = gs.holdX
            const gap0 = gs.p2.x - gs.cam
            while (n < 1200 && !gs.end && gs.orderForm === 'hold') {
                step(gs, { right: true }); n++
                drift = Math.max(drift, Math.abs(gs.p2.x - holdX))
                stood++
                if (gs.p2.dead > 0) return null
            }
            released = gs.orderForm === 'follow' && !gs.end && gs.p2.dead === 0
            const m0 = n
            while (n < m0 + 300 && !gs.end && gs.p2.dead === 0 && gs.p2.x - holdX < 40) { step(gs, { right: true }); n++ }
            chased = gs.p2.dead === 0 ? gs.p2.x - holdX : -1
            return { seed, ok: released && drift <= 6 && stood >= 8 && chased >= 40, stood, drift, gap0, chased }
        }
        let drill = null
        for (let s = 1; s <= 12 && !drill; s++) { const d = holdDrill(s); if (d && d.ok) drill = d }
        r.check('#3000 HOLD posts mid-screen (clamped to the live edge), stands fast, SELF-RELEASES when the scroll reaches the post, and the resume chases (the board took his position — wingman autonomy)',
            drill !== null, drill ? `seed ${drill.seed}: stood=${drill.stood} drift=${drill.drift.toFixed(1)} gap-at-post=${drill.gap0.toFixed(0)} chased=${drill.chased.toFixed(0)}px` : 'no seed in 1..12 completed the drill')
    }

    {
        const a = makeGame(11); warpFalls(a)
        const b = makeGame(11); warpFalls(b)
        applyCall(b, { kind: 'formation', dir: 'hold' })
        let same = true
        for (let t = 0; t < 300 && !a.end && !b.end; t++) {
            step(a, autopilot(a)); step(b, autopilot(b))
            if (Math.abs(a.p2.x - b.p2.x) > 0.01 || Math.abs(a.p2.y - b.p2.y) > 0.01) { same = false; break }
        }
        r.check('#3000 the torrent out-ranks the shout — formation orders leave the falls climb byte-identical (a held seat here is a drowned seat)', same)
    }

    {
        const gs = makeGame(13)
        for (let t = 0; t < 90; t++) step(gs, autopilot(gs))
        applyCall(gs, { kind: 'aim', dir: 'up' })
        let up = 0
        for (let t = 0; t < 120 && !gs.end; t++) {
            step(gs, autopilot(gs))
            for (const bl of gs.pb) if (bl.o === 1 && bl.vy < -0.3) up++
        }
        r.check('#3000 AIM UP puts diagonals on the board from the ALLY gun (the cabinet\'s anti-air)', up > 0, `${up} up-rounds`)
        applyCall(gs, { kind: 'aim', dir: 'level' })
        r.check('#3000 AIM LEVEL hands the barrel back to the brain', gs.orderAim === 'level')
    }

    {
        const gs = makeGame(23)
        gs.p2.human = true
        applyCall(gs, { kind: 'aim', dir: 'up' })
        for (let t = 0; t < 60; t++) step(gs, autopilot(gs), { left: false, right: true, up: false, down: false, a: false, b: true })
        r.check('#3000 a human in the blue seat keeps his own aim — orders steer the wingman brain, never a person\'s hands',
            Math.abs(gs.p2.ay) < 0.01 && gs.p2.ax > 0.9, `ax=${gs.p2.ax.toFixed(2)} ay=${gs.p2.ay.toFixed(2)}`)
    }
}

// ------------------------------------------------ #3035 the somersault ---
// The cabinet turns the hero a full revolution through a jump (ART bar 2 —
// falls animate). rollT is presentation: it must arm honestly (only a real
// jump), complete exactly one turn per arc, clear honestly (ground, vine),
// and never touch the referee — physics and every stored pin stay byte-
// identical because the clock rides nowhere the hash can see.
{
    // one arc, one turn: arms at 1 with the jump event, the last airborne
    // frame lands exactly on the pinned span, and the step after the landing
    // finds the clock cleared. The span pin is tied to the OBSERVED arc — if
    // jumpV/grav ever drift, this goes red and the constant must re-agree.
    const gs = makeGame(7)
    for (let i = 0; i < 40; i++) { step(gs, {}); gs.ev.length = 0 }
    step(gs, { a: true })
    const armed = gs.p.rollT === 1 && gs.ev.some((e) => e.type === 'jump')
    let maxRoll = gs.p.rollT
    for (let i = 0; i < 120 && !gs.p.onGround; i++) { step(gs, {}); maxRoll = Math.max(maxRoll, gs.p.rollT) }
    const landed = gs.p.onGround
    step(gs, {})
    r.check('#3035 a jump is a somersault — the clock arms with the jump event and exactly one revolution completes as the feet land',
        armed && landed && maxRoll === SOMERSAULT_TICKS && gs.p.rollT === 0,
        `armed=${armed} maxRoll=${maxRoll} span=${SOMERSAULT_TICKS}`)

    // stepping off a rock is NOT a jump — the cabinet does not tumble, and
    // neither do we (the falls ledge: feet leave the stone with no jump edge)
    {
        const g = makeGame(7)
        warpFalls(g)
        g.p.inv = 999999
        const led = FALLS_LEDGES[0]
        g.p.x = led.x + led.w - 4; g.p.y = led.y; g.p.onGround = true; g.p.vy = 0
        let offRoll = 0, sawAir = false
        for (let i = 0; i < 60; i++) {
            step(g, { right: true })
            if (!g.p.onGround) { sawAir = true; offRoll = Math.max(offRoll, g.p.rollT) }
            if (g.p.onGround && sawAir) break
        }
        r.check('#3035 walking off a ledge rides the arc upright — the roll never arms without a jump',
            sawAir && offRoll === 0, `air=${sawAir} maxRoll=${offRoll}`)
    }

    // drop-through: deliberate, but still not a somersault — down is down
    {
        const g = makeGame(7)
        const pl = PLATFORMS[0]
        g.p.x = pl.x + pl.w / 2; g.p.y = pl.y; g.p.onGround = true; g.p.vy = 0
        step(g, { a: true, down: true })
        let dropRoll = g.p.rollT
        for (let i = 0; i < 40 && !g.p.onGround; i++) { step(g, {}); dropRoll = Math.max(dropRoll, g.p.rollT) }
        r.check('#3035 dropping through a platform never tumbles — the press-through stays a press-through',
            dropRoll === 0, `maxRoll=${dropRoll}`)
    }

    // the vine catch clears the tumble mid-arc — a hanging rider is one-armed
    // and still, tumbles belong to the free flight only
    {
        const g = makeGame(7)
        warpFalls(g)
        g.p.inv = 999999
        let caught = false, rollAtCatch = -1
        for (let t = 0; t < 400 && !caught; t++) {
            const tp = vineTip(g, 0)
            if (g.p.onGround) { g.p.y = tp.y + 26; g.p.vy = -2.2; g.p.onGround = false; g.p.rollT = 12; g.p.x = tp.x }
            step(g, { a: true })
            if (g.p.vine >= 0) { caught = true; rollAtCatch = g.p.rollT }
        }
        r.check('#3035 the vine catch zeroes the somersault — a rider hangs still, mid-turn or not',
            caught && rollAtCatch === 0, `caught=${caught} rollAtCatch=${rollAtCatch}`)
    }

    // structural law, the seatStep promise: the blue seat somersaults too.
    // Drive the honest autopilot until the wingman's hop fires and find the
    // clock armed on his jump tick.
    {
        let found = null
        for (let s = 1; s <= 4 && !found; s++) {
            const g = makeGame(s)
            while (!g.end && g.tick < 12000) {
                step(g, autopilot(g))
                if (g.ev.some((e) => e.type === 'jump' && e.o === 1)) { found = { s, roll: g.p2.rollT }; break }
                g.ev.length = 0
            }
        }
        r.check('#3035 the somersault is structural — the blue seat clock arms on HIS jumps too',
            found !== null && found.roll === 1, JSON.stringify(found))
    }

    // the clock is presentation, not law: two states differing ONLY in rollT
    // hash identical — the referee never sees the tumble, so every stored
    // hash pin, replay and twin law in this suite keeps standing untouched.
    {
        const a = makeGame(9), b = makeGame(9)
        b.p.rollT = 21; b.p2.rollT = 21
        const stream = (seed) => {
            const g = makeGame(seed)
            const hs = []
            for (let i = 0; i < 900; i++) { step(g, autopilot(g)); if (i % 225 === 224) hs.push(stateHash(g)) }
            return hs.join('|')
        }
        r.check('#3035 the roll never enters the referee — rollT-only states hash identical and autopilot streams twin',
            stateHash(a) === stateHash(b) && stream(3) === stream(3) && stream(5) !== stream(6),
            `${stateHash(a)}/${stateHash(b)}`)
    }
}

// --------------------------------------------------- #3038 the duck ---
// The cabinet's three ground profiles. DOWN on the ground cycles stand ->
// kneel -> prone, UP stands; jump / air / respawn stand you back up. A low
// profile fires LEVEL from a lower muzzle, travels at crawl half-price, and
// sinks the body under the aimed chest line — while the ground stays honest
// (deck blasts and soldiers still take a flat body), the profile rides the
// hash, and the honest autopilot never ducks, so every tuned stream stands.
{
    const P = (o) => ({ left: false, right: false, up: false, down: false, a: false, b: false, ...o })

    // edges cycle, holding latches, UP stands
    {
        const gs = makeGame(3)
        gs.p.inv = 999999
        for (let i = 0; i < 30; i++) { step(gs, {}); gs.ev.length = 0 }
        step(gs, P({ down: true }))
        const kneel = gs.p.posture === 1 && gs.ev.some((e) => e.type === 'duck' && e.post === 1)
        step(gs, P({ down: true }))
        const latch = gs.p.posture === 1   // held is not a fresh press
        step(gs, P({})); step(gs, P({ down: true }))
        const prone = gs.p.posture === 2 && gs.ev.some((e) => e.type === 'duck' && e.post === 2)
        step(gs, P({})); step(gs, P({ down: true }))
        const flat = gs.p.posture === 2   // flat is the floor of the cycle
        step(gs, P({})); step(gs, P({ up: true }))
        r.check('#3038 DOWN cycles stand->kneel->prone on fresh presses, holds latch, UP stands the body back up',
            kneel && latch && prone && flat && gs.p.posture === 0,
            JSON.stringify({ kneel, latch, prone, flat, stand: gs.p.posture === 0 }))
    }

    // a jump is the cabinet's stand-up; air never ducks; drop-through keeps
    // its own meaning (down + jump presses through — it never kneels)
    {
        const gs = makeGame(3)
        gs.p.inv = 999999
        step(gs, P({ down: true })); step(gs, P({}))
        step(gs, P({ a: true }))
        const jumped = gs.p.posture === 0 && gs.p.rollT === 1
        let lowAir = false
        for (let i = 0; i < 60 && !gs.p.onGround; i++) { step(gs, P({ down: true })); if (gs.p.posture !== 0) lowAir = true }
        const pl = PLATFORMS[0]
        gs.p.x = pl.x + pl.w / 2; gs.p.y = pl.y; gs.p.onGround = true; gs.p.vy = 0; gs.p.posture = 0
        step(gs, P({ down: true })); step(gs, P({}))   // kneel on the walkway
        step(gs, P({ a: true, down: true }))
        const dropStill = gs.p.posture === 0 && gs.p.drop > 0
        r.check('#3038 a jump stands the body (and rolls the somersault), mid-air never ducks, DOWN+jump on a walkway still drops through',
            jumped && !lowAir && dropStill, JSON.stringify({ jumped, lowAir, dropStill }))
    }

    // the trade: low travel crawls at half speed; low fire leaves level off
    // the deck at the profile's muzzle line (kneel 11, prone 6)
    {
        const gs = makeGame(5)
        gs.p.inv = 999999
        const dx = (pad) => { const x0 = gs.p.x; step(gs, pad); return gs.p.x - x0 }
        const mine = () => [...gs.pb].reverse().find((b) => b.o === 0)   // the hero's own round — the ally's gun streams too (o:1)
        const run = dx(P({ right: true }))
        dx(P({ down: true })); dx(P({}))
        const kneelDx = dx(P({ right: true }))
        gs.p.cool = 0; step(gs, P({ right: true, b: true }))
        const sk = mine()
        const muzzleK = gs.p.y - sk.y
        dx(P({ down: true })); dx(P({}))
        const proneDx = dx(P({ right: true }))
        gs.p.cool = 0; step(gs, P({ right: true, b: true, down: true }))  // already flat: down cannot aim
        const sp = mine()
        const muzzleP = gs.p.y - sp.y
        const half = CFG.run * CFG.duckSpeed
        r.check('#3038 the price and the prize — low profiles crawl at half speed, and their rounds leave LEVEL at deck+11 (kneel) / deck+6 (prone)',
            run === CFG.run && kneelDx === half && proneDx === half && muzzleK === CFG.duckMuzzle[1] && muzzleP === CFG.duckMuzzle[2] && sk.vy === 0 && sp.vy === 0,
            JSON.stringify({ run, kneelDx, proneDx, half, muzzleK, muzzleP, v: [sk.vy, sp.vy] }))
    }

    // the profiles decide the hit: every gun leads the chest line (lane-14),
    // so a chest round eats stand and kneel and passes over a flat body, and
    // a head-high round eats stand and sinks under the kneel.
    {
        const die = (posture, yRel) => {
            const g = makeGame(11)
            g.p.inv = 0; g.p.posture = posture
            g.eb.push({ x: g.p.x + 40, y: g.p.y + yRel, vx: -2.2, vy: 0 })
            for (let i = 0; i < 40 && g.p.dead === 0 && !g.p.out; i++) step(g, {})
            return g.p.dead > 0 || g.p.out
        }
        const chest = [die(0, -14), die(1, -14), die(2, -14)]
        const head = [die(0, -24), die(1, -24), die(2, -24)]
        r.check('#3038 the profile takes the hit — a chest-line round kills stand and kneel and passes OVER a prone hero; a head-high round kills stand and sinks under the kneel',
            chest[0] && chest[1] && !chest[2] && head[0] && !head[1] && !head[2],
            JSON.stringify({ chest, head }))
    }

    // the ground stays honest: a deck blast takes a flat body (the belly is
    // measured at deck+2.5 of the 30 px radius), and a soldier runs over a
    // prone hero regardless — contact is the feet law.
    {
        const g = makeGame(11)
        g.p.inv = 0; g.p.posture = 2
        // lands ~11 px off the body: outside the 9 px contact band, well
        // inside the 30 px radius — the kill is the BLAST, not a touch.
        g.eb.push({ x: g.p.x + 18, y: CFG.ground - 60, vx: -0.4, vy: 2.4, gr: true })
        for (let i = 0; i < 80 && g.p.dead === 0 && !g.p.out; i++) step(g, {})
        const blast = g.p.dead > 0 || g.p.out
        const g2 = makeGame(11)
        g2.p.inv = 0; g2.p.posture = 2
        const s0 = g2.soldiers.find((s) => !s.dead)
        s0.hold = false; s0.awake = true; s0.x = g2.p.x + 5; s0.y = g2.p.y
        for (let i = 0; i < 10 && g2.p.dead === 0 && !g2.p.out; i++) step(g2, {})
        const contact = g2.p.dead > 0 || g2.p.out
        r.check('#3038 the ground stays lethal — a deck blast takes the prone hero and a soldier still runs over a flat body (you cannot duck an explosion or a boot)',
            blast && contact, JSON.stringify({ blast, contact }))
    }

    // sim truth, not paint: posture-only states diverge the hash; and the
    // honest autopilot never ducks, so every tuned seed stream runs the
    // pre-duck game byte-for-byte (zero DOWN presses across the sweep).
    {
        const a = makeGame(9), b = makeGame(9), c = makeGame(9)
        b.p.posture = 1; c.p.posture = 2
        const stream = (seed) => {
            const g = makeGame(seed)
            const hs = []
            let down = 0
            for (let i = 0; i < 900; i++) { const pad = autopilot(g); if (pad.down) down += 1; step(g, pad); if (i % 225 === 224) hs.push(stateHash(g)) }
            return { hs: hs.join('|'), down }
        }
        const s3 = stream(3), s3b = stream(3), s5 = stream(5)
        r.check('#3038 the profile is sim truth — posture-only states diverge the hash — while the autopilot stream twins with ZERO DOWN presses (every pre-duck seed and pin stands)',
            stateHash(a) !== stateHash(b) && stateHash(b) !== stateHash(c) && s3.hs === s3b.hs && s3.hs !== s5.hs && s3.down === 0 && s5.down === 0,
            JSON.stringify({ h: [stateHash(a), stateHash(b), stateHash(c)].join('/'), twin: s3.hs === s3b.hs, down: [s3.down, s5.down] }))
    }

    // structural law: the blue seat ducks under the identical seatStep, and
    // the #3000 AIM DOWN shout now kneels the wingman — what the words mean.
    {
        const g = makeGame(4)
        g.p2.human = true
        for (let i = 0; i < 30; i++) { step(g, {}, P({})); g.ev.length = 0 }
        step(g, {}, P({ down: true }))
        const seatDucks = g.p2.posture === 1
        const g2 = makeGame(6)
        applyCall(g2, { kind: 'aim', dir: 'down' })
        let kneeSeen = 0
        for (let i = 0; i < 60 && !g2.end; i++) { step(g2, autopilot(g2)); kneeSeen = Math.max(kneeSeen, g2.p2.posture) }
        r.check('#3038 the duck is structural — the blue seat kneels under HIS pad through the same seatStep, and the shouted AIM DOWN now takes the wingman to a knee (the words move the whole gunner, low barrel included)',
            seatDucks && kneeSeen >= 1, JSON.stringify({ seatDucks, kneeSeen }))
    }
}

// ------------------------------------------------------------- browser leg ---
await requireDevServer(`${BASE}/contra`)
const browser = await launch()
{
    const page = await openGame(browser, { url: `${BASE}/contra`, hook: '__contraTest', wait: 600, decline: true })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.stack || e.message))

    const attract1 = await page.evaluate(() => window.__contraTest.probe())
    await page.waitForTimeout(700)
    const attract2 = await page.evaluate(() => window.__contraTest.probe())
    r.check('attract: the demo runs itself before any key', attract1.screen === 'attract' && attract2.tick > attract1.tick, `tick ${attract1.tick} -> ${attract2.tick}`)

    // ART.md §6 audit (#2782.5): the attract shows the game and rolls one
    // cycling message. The rotation is WORLD-tick bound (index = tick/150), so
    // one full cycle is 2.5 WORLD seconds regardless of render rate — software
    // CI Chrome paints at ~16 fps and would starve a paint-counted window.
    const msgA = attract1.msg
    let msgB = msgA
    for (let guard = 0; guard < 40 && msgB === msgA; guard++) {
        await page.waitForTimeout(100)
        msgB = (await page.evaluate(() => window.__contraTest.probe())).msg
    }
    r.check('attract: one cycling message rotates (ART §6, world-tick bound)',
        typeof msgA === 'string' && msgA.length > 0 && msgB !== msgA, `"${msgA}" -> "${msgB}"`)

    // #3018 — the attract teaches the radio: ~10 s into the demo jungle, one
    // scripted demo shout lands — the wingman obeys (the sim's own order law),
    // the echo banner lands in the same 146..160 band as the play echo (the
    // LOOP banner slams at 80..144 on the taught pass, never stacked), and the
    // teach completes in ~5 s: the banner decays and the demo returns to natural.
    let shouted = null
    for (let g0 = 0; g0 < 90 && !(shouted && shouted.call && shouted.call.demoShout); g0++) {
        await page.waitForTimeout(300)
        shouted = await page.evaluate(() => window.__contraTest.probe())
    }
    const demoBannerPx = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        const k = c.width / 384
        const d = c.getContext('2d').getImageData(Math.round(130 * k), Math.round(146 * k), Math.round(124 * k), Math.round(14 * k)).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 120) n++   // banner gold
        return n
    })
    // the gold notch blinks above the ally while AIM UP holds his diagonal —
    // poll for the blink window (tick % 30 < 20)
    let notchGold = 0
    for (let g0 = 0; g0 < 12 && notchGold < 3; g0++) {
        const notch = await page.evaluate(() => {
            const pr = window.__contraTest.probe()
            if (!pr.ally || pr.end) return { n: 0, tick: pr.tick, aim: pr.call.aim }
            const c = document.querySelector('canvas')
            const k = c.width / 384
            const ax = Math.round((pr.ally.x - pr.cam) * k)
            const ay = Math.round((pr.ally.y - 31) * k)
            if (ax < 4 || ay < 2) return { n: 0, tick: pr.tick, aim: pr.call.aim }
            const d = c.getContext('2d').getImageData(ax - 4, ay - 2, Math.round(9 * k), Math.round(5 * k)).data
            let n = 0
            for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 120) n++
            return { n, tick: pr.tick, aim: pr.call.aim }
        })
        if (notch && notch.n > notchGold) notchGold = notch.n
        await page.waitForTimeout(120)
    }
    r.check('#3018 attract teaches the radio — one demo shout lands, the wingman obeys (gold notch over his head), the banner paints over the jungle (no sound)',
        shouted && shouted.screen === 'attract' && shouted.call && shouted.call.demoShout && shouted.call.demo && shouted.call.demo.text === 'AIM UP' && shouted.call.aim === 'up' && demoBannerPx >= 20 && notchGold >= 3,
        JSON.stringify({ shouted: shouted && { tick: shouted.tick, banner: shouted.call.demo, aim: shouted.call.aim }, bannerGold: demoBannerPx, notchGold }))
    // and the teach is a pass, not a state: ~5 s later the banner decays and
    // the demo returns to natural (aim level / follow, wingman back on the seat)
    let taught = null
    for (let g0 = 0; g0 < 60 && !(taught && taught.call && taught.call.demo === null && taught.call.aim === 'level' && taught.call.form === 'follow'); g0++) {
        await page.waitForTimeout(300)
        taught = await page.evaluate(() => window.__contraTest.probe())
    }
    r.check('#3018 the teach completes — the banner decays in ~5 s and the demo returns to natural',
        taught && taught.call && taught.call.demo === null && taught.call.aim === 'level' && taught.call.form === 'follow',
        JSON.stringify({ taught: taught && { tick: taught.tick, banner: taught.call.demo, aim: taught.call.aim, form: taught.call.form } }))

    await page.keyboard.press('Space')
    await page.waitForTimeout(300)
    const started = await page.evaluate(() => window.__contraTest.probe())
    r.check('any key takes the seat (attract -> play)', started.screen === 'play', `screen=${started.screen}`)

    const x0 = started.x
    await page.keyboard.down('ArrowRight')
    await page.keyboard.down('KeyX')
    await page.waitForTimeout(450)
    const ran = await page.evaluate(() => window.__contraTest.probe())
    await page.keyboard.up('KeyX')
    r.check('real keys: ArrowRight runs and KeyX fires', ran.x - x0 > 40 && ran.pb > 0, `dx=${(ran.x - x0).toFixed(0)} pb=${ran.pb}`)
    await page.keyboard.press('Space')
    // poll, don't single-shot: a software-rendered stall can eat a 120 ms sample
    // window (the jump itself lasts ~37 ticks — no honest poll can miss it).
    let jumped = null
    for (let g = 0; g < 12 && !(jumped && (!jumped.onGround || jumped.y < 196)); g++) {
        await page.waitForTimeout(50)
        jumped = await page.evaluate(() => window.__contraTest.probe())
    }
    r.check('Space jumps (the A button leaves the ground)', !jumped.onGround || jumped.y < 196, `y=${jumped.y}`)
    await page.keyboard.up('ArrowRight')

    // S3 live: the wheel in the browser — MG streams rounds, capsules carry letters
    await page.evaluate(() => window.__contraTest.setup({ weapon: 'machine' }))
    await page.keyboard.down('KeyX')
    await page.waitForTimeout(420)
    const mg = await page.evaluate(() => window.__contraTest.probe())
    await page.keyboard.up('KeyX')
    r.check('live MG: weapon reads machine and rounds stream on screen', mg.weapon === 'machine' && mg.pb >= 4, `weapon=${mg.weapon} pb=${mg.pb}`)
    const capped = await page.evaluate(() => { window.__contraTest.setup({ capsuleNear: true, capsuleKind: 'laser' }); return window.__contraTest.probe() })
    r.check('live capsule carries its letter (L)', capped.capsule && capped.capsule.kind === 'laser', JSON.stringify(capped.capsule))

    // S4 live co-op: the blue seat is on the field from the drop, and a WASD
    // press claims it — the human takes the pad from the CPU.
    await page.evaluate(() => { window.__game && window.__game.reset(99) })
    await page.waitForTimeout(200)
    const withAlly = await page.evaluate(() => window.__contraTest.probe())
    r.check("S4 live: the blue seat rides the hero's shoulder from the drop",
        withAlly.ally && !withAlly.ally.out && withAlly.ally.x <= withAlly.x + 6 && withAlly.ally.human === false,
        `ally=${withAlly.ally && withAlly.ally.x.toFixed(0)} hero=${withAlly.x.toFixed(0)}`)
    await page.evaluate(() => window.__contraTest.setup({ allyX: 220 }))
    await page.waitForTimeout(80)
    const ax0 = (await page.evaluate(() => window.__contraTest.probe())).ally.x
    await page.keyboard.down('KeyA')
    const cer = await page.evaluate(() => window.__contraTest.probe())
    await page.waitForTimeout(600)
    const drop = await page.evaluate(() => window.__contraTest.probe())
    await page.keyboard.up('KeyA')
    r.check('#2837 live drop-in: KeyA calls for the drop — the soldier is on the rope the moment the seat is claimed',
        cer.ally.human === true && cer.ally.padClaim === true && cer.ally.enter > 0 && !cer.ally.onGround,
        `human=${cer.ally.human} pc=${cer.ally.padClaim} enter=${cer.ally.enter} ground=${cer.ally.onGround}`)
    r.check('S4 live drop-in: KeyA claims seat 2 and the human pad drives him left',
        drop.ally.human === true && drop.ally.x < ax0 - 10, `human=${drop.ally.human} dx=${(drop.ally.x - ax0).toFixed(0)}`)
    // #2837 ceremony via DEV hooks: release hands the seat back, and the
    // patience is visible in the probe (the 10 s law itself is pinned in Node).
    const relA = await page.evaluate(() => { window.__contraTest.setup({ allyRelease: true }); return window.__contraTest.probe() })
    r.check('#2837 live release: the wingman takes the claimed seat back (padClaim cleared)',
        relA.ally.human === false && relA.ally.padClaim === false, `human=${relA.ally.human} pc=${relA.ally.padClaim}`)
    const dropB = await page.evaluate(() => { window.__contraTest.setup({ allyDrop: true }); return window.__contraTest.probe() })
    r.check('#2837 live re-arrival: the seat comes back on the rope after a release',
        dropB.ally.human === true && dropB.ally.enter > 0, `human=${dropB.ally.human} enter=${dropB.ally.enter}`)

    // S2 through the DEV warp: the canyon paints, and the armor law holds live
    await page.evaluate(() => window.__contraTest.setup({ warp: 'falls' }))
    await page.waitForTimeout(120)
    const falls = await page.evaluate(() => window.__contraTest.probe())
    r.check('warp: the waterfall phase paints (phase falls, camera at the bottom)', falls.phase === 'falls' && falls.camY > 400, `phase=${falls.phase} camY=${falls.camY}`)
    await page.evaluate(() => window.__contraTest.setup({ warp: 'boss', x: 150, coreOpen: false, clearBoss: true }))
    await page.waitForTimeout(80)
    const shutCore = await page.evaluate(() => window.__contraTest.probe().core)
    await page.keyboard.down('ArrowRight')
    await page.keyboard.down('ArrowUp')
    await page.keyboard.down('KeyX')
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__contraTest.setup({ coreOpen: false }))
    await page.waitForTimeout(300)
    await page.keyboard.up('KeyX')
    await page.keyboard.up('ArrowUp')
    await page.keyboard.up('ArrowRight')
    const afterShut = await page.evaluate(() => window.__contraTest.probe())
    r.check('live armor law: fire on the shut shutter does not dent the core', afterShut.phase === 'boss' && afterShut.core === shutCore, `core ${shutCore} -> ${afterShut.core}`)
    await page.evaluate(() => window.__contraTest.setup({ coreOpen: true }))
    await page.keyboard.down('ArrowRight')
    await page.keyboard.down('ArrowUp')
    await page.keyboard.down('KeyX')
    await page.waitForTimeout(500)
    await page.keyboard.up('KeyX')
    await page.keyboard.up('ArrowUp')
    await page.keyboard.up('ArrowRight')
    const afterOpen = await page.evaluate(() => window.__contraTest.probe())
    r.check('live core law: fire through the open shutter lands hits', afterOpen.core < shutCore, `core ${shutCore} -> ${afterOpen.core}`)

    // force the death path through the DEV setup hook, then restart with keys.
    // Fresh sim first: the earlier open-core leg may have already won the run
    // (screen clear end=win), so reset to a live play state before forcing death.
    await page.evaluate(() => { window.__game && window.__game.reset(99); window.__contraTest.setup({ lives: 1, allyOut: true }) })   // #2814 shared-pool law: seat 2 stood down, the hero's last pool life must end the run deterministically
    await page.waitForTimeout(120)
    let over = null
    for (let guard = 0; guard < 40; guard++) {
        await page.evaluate(() => window.__contraTest.setup({ lives: 0, kill: true }))
        await page.waitForTimeout(200)
        over = await page.evaluate(() => window.__contraTest.probe())
        if (over.screen === 'over') break
    }
    r.check('dying with no lives left reaches GAME OVER', over.screen === 'over' && over.end === 'dead', `screen=${over.screen} end=${over.end}`)
    await page.waitForTimeout(1000)
    await page.keyboard.press('Space')
    await page.waitForTimeout(250)
    await page.keyboard.press('Space')
    await page.waitForTimeout(250)
    const restarted = await page.evaluate(() => window.__contraTest.probe())
    r.check('restart loop: GAME OVER -> attract -> play by real keys', restarted.screen === 'play', `screen=${restarted.screen}`)

    // the drawn frame follows the sim: a pixel-bearing canvas after a run start
    const png = await page.evaluate(() => {
        const c = window.__game ? window.__game.frame() : null
        return c && c.length > 2000
    })
    r.check('the canvas paints real pixels', png)
    // and it is really IN the page: StrictMode's simulated-unmount cleanup can
    // detach a JSX-mounted canvas while its buffer keeps answering frame() —
    // the pixels are real but the player sees black (found live, #2779 review).
    const mounted = await page.evaluate(() => {
        const cs = [...document.querySelectorAll('canvas')]
        return cs.length >= 1 && cs.every((c) => c.isConnected)
    })
    r.check('the canvas is mounted in the page (StrictMode law)', mounted)

    // #2782.1: the bottom edge is a shoreline, not dry dirt — sample the sea
    // band and demand blue dominate (r>b brown everywhere = the old regression).
    const wet = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        const d = c.getContext('2d').getImageData(8, 212, 368, 10).data
        let blue = 0, n = 0
        for (let i = 0; i < d.length; i += 4) { n++; if (d[i + 2] > d[i] + 20) blue++ }
        return n ? blue / n : 0
    })
    r.check('water on the bottom edge: the sea band reads blue (not dry dirt)', wet > 0.5, `blue fraction=${wet.toFixed(2)}`)

    // #2782.2: during the respawn freeze the corpse tumbles — the probe frame
    // advances while dead (the sim freeze law itself is checked sim-side).
    await page.evaluate(() => window.__contraTest.setup({ lives: 2, kill: true }))
    let t1 = null, t2 = null
    for (let guard = 0; guard < 20 && !(t1 && t2); guard++) {
        const p = await page.evaluate(() => window.__contraTest.probe())
        if (p.tumble >= 0) { if (!t1) t1 = { f: p.tumble, at: Date.now() }; else if (Date.now() - t1.at > 200) t2 = p.tumble }
        await page.waitForTimeout(60)
    }
    r.check('death tumble animates during the respawn freeze', t1 !== null && t2 !== null && t2 !== t1.f, `frames ${t1 && t1.f} -> ${t2}`)

    // #2847 browser legs: the courier flies, and cargo delivered to the deck
    // actually changes the hero's gun through the real loop.
    const skySet = await page.evaluate(() => window.__contraTest.setup({ carrierHere: true, carrierKind: 'laser' }))
    const skyProbe = await page.evaluate(() => window.__contraTest.probe())
    r.check('#2847 courier stands up in the live sim (shell draws it, no errors)', skySet && skyProbe.carriers === 1, JSON.stringify({ set: skySet, carriers: skyProbe.carriers }))
    await page.evaluate(() => window.__contraTest.setup({ podHere: true, podKind: 'machine', podDX: 14 }))
    let podWeapon = null
    await page.keyboard.down('ArrowRight')
    for (let guard = 0; guard < 40 && podWeapon !== 'machine'; guard++) {
        await page.waitForTimeout(100)
        podWeapon = (await page.evaluate(() => window.__contraTest.probe())).weapon
    }
    await page.keyboard.up('ArrowRight')
    r.check('#2847 deck pod delivers its gun through real keys', podWeapon === 'machine', `weapon=${podWeapon}`)

    // #2880 browser legs: the probe carries housing truth through the real
    // loop, and a caved mount renders as a blackened wreck — the rust ring
    // around its blown muzzle is the marker; the live slab carries none there
    // (the strip's static wall rivets are measured in both states, so only
    // the wreck's ring moves the count).
    await page.evaluate(() => window.__contraTest.setup({ warp: 'boss', clearBoss: true }))
    const liveGuns = (await page.evaluate(() => window.__contraTest.probe())).gateGuns
    const rustStrip = () => page.evaluate(() => {
        const c = document.querySelector('canvas')
        const k = c.width / 384
        const d = c.getContext('2d').getImageData(Math.round(183 * k), Math.round(30 * k), Math.max(15, Math.round(15 * k)), Math.max(2, Math.round(2 * k))).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 110 && d[i + 1] > 60 && d[i + 1] < 115 && d[i + 2] < 90) n++
        return n
    })
    const liveRust = await rustStrip()
    await page.evaluate(() => window.__contraTest.setup({ warp: 'boss', gunHp0: 0 }))
    const wreckGuns = (await page.evaluate(() => window.__contraTest.probe())).gateGuns
    let wreckRust = 0
    for (let guard = 0; guard < 20 && wreckRust < 8; guard++) {
        await page.waitForTimeout(100) // let a frame paint after the warp (rAF, not sim)
        wreckRust = await rustStrip()
    }
    r.check('#2880 probe carries housing truth live: hp 10 at the arena, dead once caved',
        Array.isArray(liveGuns) && liveGuns[0].hp === 10 && !liveGuns[0].dead && wreckGuns && wreckGuns[0].dead,
        JSON.stringify({ live: liveGuns, wreck: wreckGuns }))
    r.check('#2880 the caved mount renders ruined — soot ring appears where the live slab was bare',
        wreckRust - liveRust >= 8, `live=${liveRust} wreck=${wreckRust}`)

    // #2885 browser legs: the vines hang over the live canyon (pixels over a
    // bare-canyon baseline), a held jump catches a swinging tip through real
    // keys, and the scripted finale walks its countdown in the real loop.
    // Prologue: an attract/over screen eats its first key (startPlay consumes
    // the press before the pad latches) — guarantee play, and keep the hero
    // out of the torrent while the polls sip seconds of world time.
    const ensurePlay = async () => {
        for (let guard = 0; guard < 50; guard++) {
            const p = await page.evaluate(() => window.__contraTest.probe())
            if (p.screen === 'play') return true
            await page.keyboard.press('KeyX')
            await page.waitForTimeout(120)
        }
        return false
    }
    await ensurePlay()
    await page.evaluate(() => window.__contraTest.setup({ warp: 'falls', inv: 99999, lives: 99 }))
    const vineCol = () => page.evaluate(() => {
        const c = document.querySelector('canvas')
        const k = c.width / 384
        const d = c.getContext('2d').getImageData(Math.round(112 * k), Math.round(150 * k), Math.round(156 * k), Math.round(72 * k)).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 18 && d[i + 1] > d[i + 2] + 18) n++ // green strand beats the slate
        return n
    })
    // Rider legs FIRST — the vine 3 strand is at dry altitude, but the pixel
    // baseline's multi-second dwells sit at the lip, where the ratcheting
    // torrent would drown-loop a hero parked between polls.
    await page.evaluate(() => window.__contraTest.setup({ warp: 'falls', vineAt: 3, inv: 99999, lives: 99 }))
    await page.keyboard.down('Space')
    let grabProbe = null
    for (let guard = 0; guard < 30 && !(grabProbe && grabProbe.vine.p >= 0); guard++) {
        await page.evaluate(() => window.__contraTest.setup({ vineAt: 3, inv: 99999, lives: 99 }))
        await page.waitForTimeout(60)
        grabProbe = await page.evaluate(() => window.__contraTest.probe())
    }
    r.check('#2885 live reach: hold jump at the swinging tip and the hero hangs (probe rider truth)',
        grabProbe && grabProbe.vine.p >= 0, JSON.stringify(grabProbe && grabProbe.vine))
    await page.keyboard.up('Space')
    await page.waitForTimeout(80)
    const preRide = (await page.evaluate(() => window.__contraTest.probe())).vine.p
    // one-shot tap: jumpQ latches the press to a single tick of `a` — enough
    // to release on the edge, too short to let the flung hero re-grab.
    await page.keyboard.press('Space')
    let freeProbe = null
    for (let guard = 0; guard < 25 && !(freeProbe && freeProbe.vine.p === -1 && freeProbe.vine.tips.length > 0); guard++) {
        await page.waitForTimeout(60)
        freeProbe = await page.evaluate(() => window.__contraTest.probe())
    }
    r.check('#2885 live release: jump again and the rider comes off the vine',
        preRide >= 0 && freeProbe && freeProbe.vine.p === -1 && freeProbe.vine.tips.length > 0, JSON.stringify({ preRide, vine: freeProbe && freeProbe.vine }))
    // pixel presence: vines paint over the bare-canyon baseline
    let withVines = 0
    for (let guard = 0; guard < 20 && withVines === 0; guard++) { await page.waitForTimeout(100); withVines = await vineCol() }
    await page.evaluate(() => window.__contraTest.setup({ warp: 'falls', vinesGone: true, inv: 99999, lives: 99 }))
    let bare = -1
    for (let guard = 0; guard < 20; guard++) {
        await page.waitForTimeout(100)
        const b = await vineCol()
        bare = bare < 0 ? b : Math.min(bare, b)
    }
    r.check('#2885 live canyon paints vines — green strand pixels over the bare-canyon baseline',
        withVines - bare >= 12, `with=${withVines} bare=${bare}`)
    // the scripted finale through the real loop: run to the firing band, put
    // rounds into the open core, and watch the script-length countdown clear.
    await ensurePlay()
    await page.evaluate(() => window.__contraTest.setup({ warp: 'boss', inv: 99999, lives: 99 }))
    await page.keyboard.down('ArrowRight')
    let bandX = 0
    for (let guard = 0; guard < 40 && bandX < 136; guard++) {
        await page.waitForTimeout(80)
        bandX = (await page.evaluate(() => window.__contraTest.probe())).x
    }
    await page.keyboard.down('ArrowUp')
    await page.keyboard.down('KeyX')
    let dyingSeen = 0, cleared = null, c0 = null
    for (let guard = 0; guard < 220 && !cleared; guard++) {
        await page.waitForTimeout(100)
        const p = await page.evaluate(() => window.__contraTest.probe())
        if (c0 === null) c0 = p.cascadeDying
        if (p.cascadeDying > 0) dyingSeen = Math.max(dyingSeen, p.cascadeDying)
        cleared = p.end === 'win' ? p.end : null
    }
    await page.keyboard.up('KeyX'); await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowRight')
    r.check('#2885 the scripted finale runs live — a full script-length countdown from the kill to STAGE CLEAR',
        c0 === 0 && dyingSeen > 0 && dyingSeen <= CASCADE.length * CFG.cascadeStep && cleared === 'win',
        `bandX=${bandX} c0=${c0} dying=${dyingSeen} end=${cleared}`)

    // #2894 browser legs: the arcade loop through the real shell. Kill the core,
    // let STAGE CLEAR hold, and PLAY comes back — stage 1 again, seed kept,
    // tempo raised, the bank paid +1, the HUD marking the pass in gold over the
    // loop-1 baseline. (The cascade leg above just took a win, so the loop that
    // ensurePlay lands on may already be n≥2 — the leg reads it dynamically.)
    await ensurePlay()
    const preLoop = await page.evaluate(() => window.__contraTest.probe())
    const goldRow = () => page.evaluate(() => {
        const c = document.querySelector('canvas')
        const k = c.width / 384
        const d = c.getContext('2d').getImageData(Math.round(232 * k), Math.round(13 * k), Math.round(34 * k), Math.round(8 * k)).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 120) n++   // HUD gold
        return n
    })
    await page.evaluate(() => window.__contraTest.setup({ warp: 'boss', inv: 99999, lives: 4 }))
    await page.keyboard.down('ArrowRight')
    let lbx = 0
    for (let g0 = 0; g0 < 40 && lbx < 136; g0++) { await page.waitForTimeout(80); lbx = (await page.evaluate(() => window.__contraTest.probe())).x }
    await page.keyboard.down('ArrowUp')
    await page.keyboard.down('KeyX')
    let wonLeg = null
    for (let g0 = 0; g0 < 220 && !wonLeg; g0++) {
        await page.waitForTimeout(100)
        const p = await page.evaluate(() => window.__contraTest.probe())
        if (p.end === 'win') wonLeg = p
    }
    await page.keyboard.up('KeyX'); await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowRight')
    let resumed = null
    for (let g0 = 0; g0 < 300 && !(resumed && resumed.screen === 'play' && resumed.loop === preLoop.loop + 1); g0++) {
        await page.waitForTimeout(80)
        resumed = await page.evaluate(() => window.__contraTest.probe())
    }
    r.check('#2894 the win LOOPS — STAGE CLEAR hands stage 1 back at loop n+1: tempo raised, seed kept, score and bank carried',
        wonLeg !== null && resumed !== null && resumed.loop === preLoop.loop + 1 && Math.abs(resumed.lk - loopK(preLoop.loop + 1)) < 1e-9 && resumed.seed === preLoop.seed && resumed.phase === 'jungle' && resumed.x < 80 && resumed.score >= wonLeg.score && resumed.lives >= preLoop.lives,
        JSON.stringify({ pre: preLoop.loop, wonScore: wonLeg && wonLeg.score, resumed: resumed && { loop: resumed.loop, lk: resumed.lk, seedKept: resumed.seed === preLoop.seed, phase: resumed.phase, x: resumed.x, score: resumed.score, lives: resumed.lives } }))
    const goldPost = resumed && resumed.loop === preLoop.loop + 1 ? resumed.loop : -1
    // Baseline honestly: the same live run, loop fields toggled to 1 (marker off),
    // then back — the diff is exactly the LOOP-n ink, whatever pass we landed on.
    let goldBase = -1; let goldMark = -1
    if (goldPost > 0) {
        // the canvas repaints once per rAF — give each toggle a beat, or the
        // pixel read races the frame and samples the pre-toggle paint
        await page.evaluate(() => window.__contraTest.setup({ loop: 1 }))
        await page.waitForTimeout(150)
        goldBase = await goldRow()
        await page.evaluate((L) => window.__contraTest.setup({ loop: L }), goldPost)
        await page.waitForTimeout(150)
        goldMark = await goldRow()
    }
    r.check('#2894 the pass reads — LOOP n paints gold on the HUD where loop 1 shows nothing',
        goldMark - goldBase >= 10, `gold loop1=${goldBase} loopN=${goldMark}`)

    // ---------- #2902 browser legs: the loop presentation ----------
    const goldBand = () => page.evaluate(() => {
        const c = document.querySelector('canvas')
        const k = c.width / 384
        const d = c.getContext('2d').getImageData(Math.round(140 * k), Math.round(84 * k), Math.round(104 * k), Math.round(40 * k)).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 120) n++   // banner gold
        return n
    })
    // Leg A — the resume is an interstitial: win, and the handback arrives as a
    // LOOP banner slam over a HELD world (two quiet beats), heads flashing gold
    // for the banked courtesy, then the jungle starts moving at loop n+1.
    await ensurePlay()
    const preF = await page.evaluate(() => window.__contraTest.probe())
    await page.evaluate(() => window.__contraTest.setup({ warp: 'boss', inv: 99999, lives: 4 }))
    await page.keyboard.down('ArrowRight')
    let fbx = 0
    for (let g0 = 0; g0 < 40 && fbx < 136; g0++) { await page.waitForTimeout(80); fbx = (await page.evaluate(() => window.__contraTest.probe())).x }
    await page.keyboard.down('ArrowUp')
    await page.keyboard.down('KeyX')
    let winF = null
    for (let g0 = 0; g0 < 220 && !winF; g0++) {
        await page.waitForTimeout(100)
        const p = await page.evaluate(() => window.__contraTest.probe())
        if (p.end === 'win') winF = p
    }
    await page.keyboard.up('KeyX'); await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowRight')
    let fxOn = null
    for (let g0 = 0; g0 < 300 && !(fxOn && fxOn.screen === 'play' && fxOn.loopFx); g0++) {
        await page.waitForTimeout(60)
        fxOn = await page.evaluate(() => window.__contraTest.probe())
    }
    // One sampler across the freeze: banner gold, heads flash, and held ticks —
    // evaluate round-trips are milliseconds, so a per-tick freeze needs real
    // waits between samples, not a fast exit-on-first-hit loop.
    let bannerGold = 0, flashHi = 0, flashLo = 999
    let held1 = null, held2 = null
    for (let g0 = 0; g0 < 24; g0++) {
        const s = await page.evaluate(() => {
            const c = document.querySelector('canvas')
            const k = c.width / 384
            const gtest = (d, i) => d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 120
            const gb = c.getContext('2d').getImageData(Math.round(140 * k), Math.round(84 * k), Math.round(104 * k), Math.round(40 * k)).data
            let bn = 0; for (let i = 0; i < gb.length; i += 4) if (gtest(gb, i)) bn++
            const hd = c.getContext('2d').getImageData(Math.round(148 * k), Math.round(10 * k), Math.round(56 * k), Math.round(10 * k)).data
            let hn = 0; for (let i = 0; i < hd.length; i += 4) if (gtest(hd, i)) hn++
            const p = window.__contraTest.probe()
            return { bn, hn, tick: p.tick, fxOn: p.loopFx !== null, at: Date.now() }
        })
        bannerGold = Math.max(bannerGold, s.bn)
        if (s.fxOn) {
            flashHi = Math.max(flashHi, s.hn); flashLo = Math.min(flashLo, s.hn)
            if (!held1) held1 = s
            else if (!held2 && s.at - held1.at > 250) held2 = s
        }
        await page.waitForTimeout(70)
    }
    let fxOff = null
    for (let g0 = 0; g0 < 200 && !(fxOff && fxOff.screen === 'play' && !fxOff.loopFx); g0++) {
        await page.waitForTimeout(80)
        fxOff = await page.evaluate(() => window.__contraTest.probe())
    }
    r.check('#2902 the resume is an interstitial — the LOOP banner slams over a HELD world (tick stands still), then the stage resumes one notch hotter',
        fxOn !== null && fxOn.loopFx && fxOn.loopFx.n === preF.loop + 1 && bannerGold >= 30 &&
        held1 !== null && held2 !== null && held2.tick === held1.tick &&
        fxOff !== null && fxOff.loop === preF.loop + 1 && fxOff.tick > held1.tick,
        JSON.stringify({ fx: fxOn && fxOn.loopFx, bannerGold, heldTick: [held1 && held1.tick, held2 && held2.tick], after: fxOff && { loop: fxOff.loop, tick: fxOff.tick } }))
    r.check('#2902 the bank celebrates — the heads row flashes gold while the banner holds',
        flashHi >= 20 && flashLo <= 4, `gold hi=${flashHi} lo=${flashLo}`)

    // Leg B — the world LOOKS hotter: same live run, pass toggled. Palette only;
    // red-minus-green bias on the sky band, sampled above the mountain line.
    const skyBias = () => page.evaluate(() => {
        const c = document.querySelector('canvas')
        const k = c.width / 384
        const d = c.getContext('2d').getImageData(Math.round(8 * k), Math.round(8 * k), Math.round(72 * k), Math.round(34 * k)).data
        let s = 0, n = 0
        for (let i = 0; i < d.length; i += 4) { n++; s += d[i] - d[i + 1] }
        return n ? s / n : 0
    })
    await page.evaluate(() => window.__contraTest.setup({ loop: 1 }))
    await page.waitForTimeout(160)
    const skyCool = await skyBias()
    await page.evaluate(() => window.__contraTest.setup({ loop: 4 }))
    await page.waitForTimeout(160)
    const skyHot = await skyBias()
    r.check('#2902 the world reads hotter — the loop-4 sky is redder than loop 1 on the live canvas',
        skyHot - skyCool >= 6, `mean(r-g) loop1=${skyCool.toFixed(1)} loop4=${skyHot.toFixed(1)}`)

    // Leg C — phone-scale legibility: the LOOP tag rides a warm dark plate with
    // a gold border (8px gold on bright jungle sky was the wash-out complaint).
    const plateInk = () => page.evaluate(() => {
        const c = document.querySelector('canvas')
        const k = c.width / 384
        const d = c.getContext('2d').getImageData(Math.round(226 * k), Math.round(9 * k), Math.round(44 * k), Math.round(14 * k)).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > d[i + 1] + 6) n++   // warm ink: red beats green
        return n
    })
    await page.evaluate(() => window.__contraTest.setup({ loop: 1 }))
    await page.waitForTimeout(160)
    const plateOff = await plateInk()
    await page.evaluate(() => window.__contraTest.setup({ loop: 4 }))
    await page.waitForTimeout(160)
    const plateOn = await plateInk()
    r.check('#2902 the LOOP tag is plated for phone scale — warm backplate + gold border paint at loop 4, nothing at loop 1',
        plateOff <= 8 && plateOn >= 150, `loop1=${plateOff} loop4=${plateOn}`)

    // #2902 attract teaches the loop: force the demo's death onto the harness
    // clock, and the attract screen runs one LOOP 2 pass with the banner before
    // handing the copy back — the mechanic advertises itself pre-clear.
    await page.evaluate(() => { window.__game && window.__game.reset(99); window.__contraTest.setup({ lives: 0, kill: true, allyOut: true }) })
    let overT = null
    for (let g0 = 0; g0 < 40; g0++) {
        await page.waitForTimeout(200)
        overT = await page.evaluate(() => window.__contraTest.probe())
        if (overT && overT.screen === 'over') break
        await page.evaluate(() => window.__contraTest.setup({ lives: 0, kill: true, allyOut: true }))
    }
    await page.waitForTimeout(1100)                 // GAME OVER holds ~0.9 s before its key answers
    await page.keyboard.press('Space')               // over -> attract
    let attractLive = null
    for (let g0 = 0; g0 < 40 && !(attractLive && attractLive.screen === 'attract' && !attractLive.end); g0++) {
        await page.waitForTimeout(100)
        attractLive = await page.evaluate(() => window.__contraTest.probe())
    }
    const teachArmed = await page.evaluate(() => window.__contraTest.attractLoopNow())
    await page.waitForTimeout(220)
    const teachOn = await page.evaluate(() => window.__contraTest.probe())
    const teachGold = await goldBand()
    const teachT0 = teachOn && teachOn.tick
    await page.waitForTimeout(240)
    const teachT1 = (await page.evaluate(() => window.__contraTest.probe())).tick
    let teachGo = null
    for (let g0 = 0; g0 < 120 && !(teachGo && teachGo.screen === 'attract' && !teachGo.loopFx && teachGo.demoLoop === 1 && teachGo.tick > teachT0); g0++) {
        await page.waitForTimeout(100)
        teachGo = await page.evaluate(() => window.__contraTest.probe())
    }
    r.check('#2902 attract teaches the loop — the demo survives its end, runs LOOP 2, and the banner slams over the attract jungle (held)',
        attractLive !== null && teachArmed === true && teachOn && teachOn.screen === 'attract' && teachOn.loop === 2 && teachOn.demoLoop === 1 &&
        teachOn.loopFx && teachOn.loopFx.n === 2 && teachGold >= 30 && teachT1 === teachT0 && teachGo !== null,
        JSON.stringify({ armed: teachArmed, teach: teachOn && { screen: teachOn.screen, loop: teachOn.loop, fx: teachOn.loopFx }, teachGold, held: [teachT0, teachT1] }))
    // and the teach is a pass, not a state: attract returns to loop-1 copy
    let teachBack = null
    for (let g0 = 0; g0 < 220 && !(teachBack && teachBack.screen === 'attract' && teachBack.demoLoop === 0 && teachBack.loop === 1); g0++) {
        await page.waitForTimeout(100)
        teachBack = await page.evaluate(() => window.__contraTest.probe())
    }
    r.check('#2902 the taught pass ends — attract cycles back to loop-1 demo and copy', teachBack !== null, JSON.stringify(teachBack && { s: teachBack.screen, d: teachBack.demoLoop, l: teachBack.loop }))

    // #2917 browser legs: the hangar cycle runs live (grind → lift → hull on
    // the probe), the strafe that comes down is shallow through the real loop,
    // and the steel paints sky pixels a sortie-free fortress never shows.
    await ensurePlay()
    await page.evaluate(() => window.__contraTest.setup({ warp: 'boss', x: 60, inv: 99999, lives: 99, allyOut: true, sortieOff: true }))
    await page.waitForTimeout(200)
    const gsPix = () => page.evaluate(() => {
        const c = document.querySelector('canvas')
        const k = c.width / 384
        const d = c.getContext('2d').getImageData(Math.round(108 * k), Math.round(84 * k), Math.round(48 * k), Math.round(32 * k)).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 60 && d[i + 1] > 55 && d[i + 2] > 50) n++ // steel/glass/exhaust beats the slate gorge
        return n
    })
    let hullBase = -1
    for (let g0 = 0; g0 < 8; g0++) { await page.waitForTimeout(90); hullBase = Math.max(hullBase, await gsPix()) }
    await page.evaluate(() => window.__contraTest.setup({ warp: 'boss', x: 60, inv: 99999, lives: 99, allyOut: true, sortieNow: true, gsX: 130, gsY: 100 }))
    let hullLit = 0
    for (let g0 = 0; g0 < 12; g0++) {
        await page.waitForTimeout(90)
        hullLit = Math.max(hullLit, await gsPix())
        const pin = await page.evaluate(() => window.__contraTest.setup({ x: 60, inv: 99999, allyOut: true, sortieNow: true, gsX: 130, gsY: 100 }))
        if (!pin) break
    }
    r.check('#2917 live fortress paints the gunship — steel/canopy pixels over the sortie-free baseline',
        hullLit - hullBase >= 12, `hull=${hullLit} baseline=${hullBase}`)
    // the door leg: the bay's ember throat line vs the shut shutter. The
    // window is the bay itself (lintel above, HUD above that), and the
    // criterion is the throat's burnt orange #b3541e — tight enough to
    // reject the door's rust trim (#8a5a3a), the HUD's gold and the
    // banner's crimson (#e23b2e sits at g=59, just under the line).
    const doorGlow = () => page.evaluate(() => {
        const c = document.querySelector('canvas')
        const k = c.width / 384
        const d = c.getContext('2d').getImageData(Math.round(247 * k), Math.round(16 * k), Math.round(30 * k), Math.round(18 * k)).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 60 && d[i + 1] < 110 && d[i + 2] < 50) n++ // the bay's ember throat line
        return n
    })
    let shutGlow = -1
    for (let g0 = 0; g0 < 12; g0++) {
        await page.evaluate(() => window.__contraTest.setup({ warp: 'boss', inv: 99999, lives: 99, allyOut: true, hangarOpen: 0 }))
        await page.waitForTimeout(90)
        shutGlow = Math.max(shutGlow, await doorGlow())
    }
    let grindGlow = 0
    for (let g0 = 0; g0 < 12; g0++) {
        await page.evaluate(() => window.__contraTest.setup({ warp: 'boss', inv: 99999, lives: 99, allyOut: true, hangarOpen: 57 }))
        await page.waitForTimeout(90)
        grindGlow = Math.max(grindGlow, await doorGlow())
    }
    r.check('#2917 live parapet grinds — the open bay paints its ember throat where the shut shutter shows nothing',
        grindGlow >= 12 && shutGlow <= 4, `grind=${grindGlow} shut=${shutGlow}`)
    // the live sortie chain: a fresh warp arms the schedule; poll door → hull →
    // shallow rounds through the untouched world loop.
    await ensurePlay()
    await page.evaluate(() => window.__contraTest.setup({ warp: 'boss', x: 100, inv: 99999, lives: 99, allyOut: true }))
    let sawDoor = false, sawHull = false, roundsLive = 0, maxVy = 0
    for (let g0 = 0; g0 < 140; g0++) {
        await page.waitForTimeout(100)
        const p = await page.evaluate(() => window.__contraTest.probe())
        if (!p || p.screen !== 'play' || p.phase !== 'boss') continue
        if (p.sortie.door > 0 || p.sortie.due > 0) sawDoor = true
        if (p.sortie.hulls.length) sawHull = true
        for (const b of p.sortie.aimed) { roundsLive += 1; maxVy = Math.max(maxVy, Math.abs(b.vy)) }
        if (sawHull && roundsLive >= 2) break
    }
    r.check('#2917 the live gate runs its air layer — the beacon grinds, the hull lifts, and every round that comes down is shallow',
        sawDoor && sawHull && roundsLive >= 2 && maxVy <= 1.01, JSON.stringify({ sawDoor, sawHull, roundsLive, maxVy: +maxVy.toFixed(2) }))
    await page.evaluate(() => window.__contraTest.setup({ sortieOff: true }))

    // ---- #2971: the consent gate over live play + the LIVE plate (phone) ----
    // A fresh profile on a touch phone: the first tap starts the run AND raises
    // the gate (never a phantom click on the switches — the #2971 regression).
    // YES keeps banking mid-take (LIVE plate paints); NO plays on silently.
    const phoneLeg = async (answer) => {
        const pp = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
        const pErrs = []
        pp.on('pageerror', (e) => pErrs.push(e.stack || e.message))
        try {
            await pp.goto(`${BASE}/contra?touch=1`, { waitUntil: 'load' })
            await pp.waitForFunction(() => !!window.__contraTest, null, { timeout: 15000 })
            await pp.waitForTimeout(900) // let the attract sim wake so the tap lands as START
            await pp.tap('canvas')
            let gateUp = false, gateQuiet = false, playing = false
            for (let i = 0; i < 80 && !gateUp; i++) {
                gateUp = await pp.evaluate(() => !!document.querySelector('[data-auto-record-gate]'))
                if (gateUp) {
                    // the WIP regression: the tap's click must not have flipped the motion switch
                    gateQuiet = await pp.evaluate(() => document.querySelector('#consent-motion')?.getAttribute('aria-checked') === 'false')
                    break
                }
                await pp.waitForTimeout(50)
            }
            playing = await pp.evaluate(() => window.__contraTest.probe()?.screen === 'play')
            if (answer === 'yes') {
                await pp.click('#consent-name')
                await pp.type('#consent-name', 'qabot')
                await pp.click('#consent-motion')
                await pp.click('#consent-yes')
            } else {
                await pp.click('#consent-no')
            }
            const recorded = await (async () => {
                const t0 = Date.now()
                while (Date.now() - t0 < 6000) {
                    const v = await pp.evaluate(() => !!(window.__autoCapture && window.__autoCapture.recording))
                    if (v) return true
                    if (answer === 'no' && v === false) return false
                    await pp.waitForTimeout(100)
                }
                return await pp.evaluate(() => !!(window.__autoCapture && window.__autoCapture.recording))
            })()
            const platePx = await (async () => {
                const t0 = Date.now()
                let n = 0
                while (Date.now() - t0 < 3000) {
                    n = await pp.evaluate(() => {
                        const c = document.querySelector('canvas')
                        if (!c) return 0
                        const d = c.getContext('2d').getImageData(150, 22, 44, 12).data
                        let k = 0
                        for (let i = 0; i < d.length; i += 4) {
                            if (d[i] > 200 && d[i + 1] > 40 && d[i + 1] < 120 && d[i + 2] < 90) k++
                        }
                        return k
                    })
                    if (n > 0) return n
                    await pp.waitForTimeout(150)
                }
                return n
            })()
            const touchCopy = await pp.evaluate(() => window.__contraTest.probe()?.touch === true)
            const pScreen = await pp.evaluate(() => window.__contraTest.probe()?.screen)
            return { gateUp, gateQuiet, playing, recorded, platePx, touchCopy, pScreen, pErrs }
        } finally {
            await pp.close()
        }
    }
    const granted = await phoneLeg('yes')
    r.check('#2971 phone: the first tap starts the run AND raises the gate',
        granted.playing && granted.gateUp, `playing=${granted.playing} gate=${granted.gateUp}`)
    r.check('#2971 phone: the tap never flips the motion switch before the player sees it',
        granted.gateQuiet, `motion switch aria-checked=${granted.gateQuiet ? 'false' : 'not-false'}`)
    r.check('#2971 phone: YES keeps banking mid-take — the recorder is armed',
        granted.recorded === true, `recorded=${granted.recorded}`)
    r.check('#2971 phone: the LIVE plate paints while the take banks',
        granted.platePx > 0, `hot-red plate pixels=${granted.platePx}`)
    r.check('#2971 phone: the touch-aware copy is live (?touch=1)',
        granted.touchCopy === true, `touch=${granted.touchCopy}`)
    r.check('#2971 phone: a granted take still plays (screen=play)',
        granted.pScreen === 'play', `screen=${granted.pScreen}`)
    r.check('#2971 phone: no page errors on the granted leg', granted.pErrs.length === 0, granted.pErrs.join(' | '))

    const declined = await phoneLeg('no')
    r.check('#2971 phone: the first tap starts the run AND raises the gate (declined leg)',
        declined.playing && declined.gateUp, `playing=${declined.playing} gate=${declined.gateUp}`)
    r.check('#2971 phone: NO plays on silently — nothing records',
        declined.recorded === false, `recorded=${declined.recorded}`)
    r.check('#2971 phone: declined runs never paint the LIVE plate',
        declined.platePx === 0, `hot-red plate pixels=${declined.platePx}`)
    r.check('#2971 phone: a declined run still plays (screen=play)',
        declined.pScreen === 'play', `screen=${declined.pScreen}`)
    r.check('#2971 phone: no page errors on the declined leg', declined.pErrs.length === 0, declined.pErrs.join(' | '))

    r.check('zero page errors', errs.length === 0, errs.join(' | '))
    await page.close()
}

// ------------------------------------------------ #3000 voice browser leg ---
// No speech engine in headless Chrome — which is exactly the honest-degrade
// case to pin: the radio must report UN-ARMED (never fake a LISTEN), while
// the shared seam still obeys and banks. Everything runs in ONE evaluate so
// the rAF loop cannot drift the twins between reads.
{
    const vp = await openGame(browser, { url: `${BASE}/contra`, hook: '__contraTest', wait: 500 })
    const vErrs = []
    vp.on('pageerror', (e) => vErrs.push(e.stack || e.message))
    const leg = await vp.evaluate(() => {
        const T = window.__contraTest, G = window.__game
        T.start()
        const cold = T.probe().call.armed
        G.reset(21, 2)
        const hSilent = G.step({ b: true }, 60).hash
        G.reset(21, 2)
        T.say('AIM UP')
        const aimProbe = T.probe().call
        const hShout = G.step({ b: true }, 60).hash
        T.say('SPREAD OUT')
        const spreadProbe = T.probe().call
        const beforeNo = T.probe().call
        T.say('HELLO THERE')
        const noProbe = T.probe().call
        G.recordStart()
        G.step({}, 5)
        T.say('AIM UP')
        T.say('bogus nonsense')
        const rec = G.recordStop()
        return { cold, aim: aimProbe, diverged: hShout !== hSilent, spread: spreadProbe, no: noProbe, before: beforeNo, cmds: rec.voiceCmd || [] }
    })
    r.check('#3000 browser: no speech engine, no lie — the radio reports un-armed (headless honest-degrade)',
        leg.cold === false, `armed=${leg.cold}`)
    r.check('#3000 browser: a shout through the mic seam steers the wingman and echoes on the banner',
        leg.aim.aim === 'up' && leg.aim.banner && leg.aim.banner.text === 'AIM UP' && leg.aim.banner.ok === true,
        JSON.stringify(leg.aim))
    r.check('#3000 browser: the shouted run diverges its twin (orders ride the hash end-to-end)', leg.diverged)
    r.check('#3000 browser: SPREAD OUT lands the formation channel',
        leg.spread.form === 'spread' && leg.spread.banner && leg.spread.banner.text === 'SPREAD', JSON.stringify(leg.spread))
    r.check('#3000 browser: small talk refuses loudly (banner NO CALL) and moves nothing — every channel keeps its last order',
        leg.no.banner && leg.no.banner.text === 'NO CALL' && leg.no.banner.ok === false
        && leg.no.form === leg.before.form && leg.no.aim === leg.before.aim && leg.no.holdX === leg.before.holdX,
        JSON.stringify({ no: leg.no, before: leg.before }))
    r.check('#3000 browser: the take banks each call as voiceCmd — intents, not fake pads (seat 1, dir, why)',
        leg.cmds.length === 2 && leg.cmds[0].said === 'AIM UP' && leg.cmds[0].intent === 'aim-up' && leg.cmds[0].dir === 'up'
        && leg.cmds[0].ok === true && leg.cmds[0].seat === 1
        && leg.cmds[1].intent === null && leg.cmds[1].ok === false && leg.cmds[1].why === 'NO CALL' && leg.cmds[1].seat === 1,
        JSON.stringify(leg.cmds))
    r.check('#3000 browser: no page errors on the voice leg', vErrs.length === 0, vErrs.join(' | '))
    await vp.close()
}

// ------------------------------------------------ #3003 voice-polish legs ---
// First-run teach card (FireCrew #1287 pattern): the first grant shows it,
// localStorage-gated; the card is the one message at that moment. And the
// HOLD post: a subtle gold tick on the ground marks the spot the wingman
// stands at (the shout itself is pinned sim-side above).
{
    const vp = await openGame(browser, { url: `${BASE}/contra`, hook: '__contraTest', wait: 500 })
    const vErrs = []
    vp.on('pageerror', (e) => vErrs.push(e.stack || e.message))
    const leg = await vp.evaluate(async () => {
        const T = window.__contraTest
        T.start()
        localStorage.removeItem('contra:voice-hints')
        const first = T.hintNow()
        const hint = T.probe().call.hint
        const seen = localStorage.getItem('contra:voice-hints')
        const second = T.hintNow()
        const hintAfter = T.probe().call.hint
        // poll until the card paints (headless rAF can throttle)
        const c = document.querySelector('canvas')
        const goldIn = (x, y, w, h) => {
            const d = c.getContext('2d').getImageData(x, y, w, h).data
            let g = 0
            for (let i = 0; i < d.length; i += 4) { if (d[i] > 200 && d[i + 1] > 180 && d[i + 2] < 100) g++ }
            return g
        }
        let gold = 0
        for (let i = 0; i < 40 && gold < 20; i++) {
            await new Promise(r => requestAnimationFrame(r))
            await new Promise(r => setTimeout(r, 50))
            gold = goldIn(0, 146, 384, 42)
        }
        // the HOLD post tick: pin the wingman mid-screen, say HOLD, let a frame land
        T.setup({ allyX: 150 })
        T.say('HOLD')
        const holdProbe = T.probe().call
        const cam = T.probe().cam
        const hx = Math.round(holdProbe.holdX - cam)
        let tickGold = 0
        for (let i = 0; i < 40 && tickGold < 4; i++) {
            await new Promise(r => requestAnimationFrame(r))
            await new Promise(r => setTimeout(r, 50))
            tickGold = goldIn(Math.max(0, hx - 8), 184, 17, 8)
        }
        // the post disappears when the order changes back to FOLLOW
        T.say('FOLLOW ME')
        const followProbe = T.probe().call
        return { first, hint, seen, second, hintAfter, gold, hold: holdProbe, tickGold, follow: followProbe }
    })
    r.check('#3003 the first grant arms the teach card (first-run only)',
        leg.first === true && leg.hint && leg.hint.t > 0 && leg.seen === '1', JSON.stringify(leg))
    r.check('#3003 the card is never shown twice (localStorage-gated)',
        leg.second === false && leg.hintAfter && leg.hintAfter.t > 0, JSON.stringify(leg))
    r.check('#3003 the teach card paints (gold plate, border and copy)',
        leg.gold >= 20, `gold pixels=${leg.gold}`)
    r.check('#3003 the HOLD post ticks on the ground at the post',
        leg.hold.form === 'hold' && leg.hold.holdX > 0 && leg.tickGold >= 4, JSON.stringify({ hold: leg.hold, tickGold: leg.tickGold }))
    r.check('#3003 the post clears when the order changes back to FOLLOW',
        leg.follow.form === 'follow', JSON.stringify(leg.follow))
    r.check('#3003 browser: no page errors on the teach-card/post legs', vErrs.length === 0, vErrs.join(' | '))
    await vp.close()
}

// ------------------------------------------------ #3019 refuse-knock leg ----
// Phone speakers roll off hard below ~250 Hz — raising the gain on the 180 Hz
// refuse fundamental (#3016) cannot make it audible on small drivers. The knock
// must schedule a second tone above the rolloff knee (the 330 Hz octave).
// The log slice is race-free: phraseHeard -> applyCall -> sfx.callNo runs in
// one synchronous JS task, so what the spy records around say() is exactly the
// knock's oscillators — no music or gunfire noise can interleave (and noise
// never creates oscillators anyway).
{
    const vp = await openGame(browser, { url: `${BASE}/contra`, hook: '__contraTest', start: true, wait: 250 })
    const kErrs = []
    vp.on('pageerror', (e) => kErrs.push(e.stack || e.message))
    const leg = await vp.evaluate(() => {
        const T = window.__contraTest
        T.start()
        window.__game.reset(21, 2)
        // spy every frequency the controller binds at oscillator birth
        window.__oscLog = []
        const proto = AudioContext.prototype
        const orig = proto.createOscillator
        proto.createOscillator = function (...a) {
            const o = orig.apply(this, a)
            const sv = o.frequency.setValueAtTime.bind(o.frequency)
            o.frequency.setValueAtTime = (v, t) => { window.__oscLog.push(v); return sv(v, t) }
            return o
        }
        const sayAt = (text) => {
            const i0 = window.__oscLog.length
            T.say(text)
            return window.__oscLog.slice(i0) // synchronously taken — the knock in full
        }
        const knock = sayAt('HELLO THERE') // unobeyable -> callNo
        const ack = sayAt('AIM UP') // obeyed -> callAck (its 930 tail is async, not in slice)
        proto.createOscillator = orig
        return { knock, ack }
    })
    r.check('#3019 refuse knock: two tones scheduled, the octave above the phone rolloff knee (250 Hz)',
        leg.knock.length === 2 && leg.knock[0] === 180 && leg.knock[1] >= 250 && leg.knock[1] <= 400,
        JSON.stringify(leg.knock))
    r.check('#3019 refuse knock: the acknowledge sweep keeps its own voice (starts at 620)',
        leg.ack.length === 1 && leg.ack[0] === 620, JSON.stringify(leg.ack))
    r.check('#3019 refuse knock: no page errors on the knock leg', kErrs.length === 0, kErrs.join(' | '))
    await vp.close()
}

// ---------- #3035 browser leg: the somersault paints ----------
// One real-key jungle hop, sampled every animation frame from the hero's own
// pixels. Inversion proof: bandana red on the FEET line mid-arc — impossible
// for the static tuck this gap shipped with (the head sat at -31 all flight).
// Arm law by DIFFERENCE: two identical seeded hops (same seed, so the same
// rollT stream — rotating limbs, flicker cadence and background cancel) that
// differ only in held aim; dark gun ink above the pivot on the AIM-UP hop but
// not the flat hop proves the barrel stays at the live aim while the body
// turns — the sprite keeps matching the logical state.
{
    const hp = await openGame(browser, { url: `${BASE}/contra`, hook: '__contraTest', start: true, wait: 300 })
    const hErrs = []
    hp.on('pageerror', (e) => hErrs.push(e.stack || e.message))
    const captureScript = async (up) => {
        const T = window.__contraTest
        T.start()
        window.__game.reset(21, 1)
        return new Promise((resolve) => {
            const c = document.querySelector('canvas')
            const k = c.width / 384
            const RED = (r, g, b) => r > 170 && g < 110 && b < 110
            // gun steel is a COLD dark grey — the jungle's dark greens must not
            // answer (skyTop/skyMid/canopy all sit under 70 on r and g; the
            // blue-leading test separates steel #20242c/#3c4650 from bark- and
            // leaf-darks, which run green-warm: b < g).
            const GUN = (r, g, b) => r < 70 && g < 80 && b > r + 6 && b > g + 4 && b < 120
            const count = (x0, y0, w, h, test) => {
                const d = c.getContext('2d').getImageData(Math.round(x0 * k), Math.round(y0 * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))).data
                let n = 0
                for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++
                return n
            }
            const frames = []
            let air = 0
            const t0 = performance.now()
            const grab = () => {
                const p = T.probe()
                if (p.screen !== 'play') { if (performance.now() - t0 < 4000) requestAnimationFrame(grab); else resolve(frames); return }
                if (p.roll > 0 && !p.onGround) {
                    air++
                    const cx = p.x - p.cam, cy = p.y
                    // ArrowUp alone aims straight up (ax=0) — the barrel stub
                    // stands OVER the body centre, x -2..+6, rows -33..-22.
                    // Boots (cold dark too) sweep this box identically on both
                    // arm-states, so the mean difference is the held barrel.
                    frames.push({ roll: p.roll, redBelow: count(cx - 10, cy - 7, 20, 9, RED), gunAbove: count(cx - 2, cy - 33, 8, 12, GUN) })
                } else if (air > 0) { resolve(frames); return }
                if (performance.now() - t0 > 4000) { resolve(frames); return }
                requestAnimationFrame(grab)
            }
            requestAnimationFrame(grab)
        })
    }
    const captureHop = async (up) => {
        const pending = hp.evaluate(captureScript, up)
        if (up) await hp.keyboard.down('ArrowUp')
        await new Promise((res) => setTimeout(res, 60))
        await hp.keyboard.press('Space')
        const frames = await pending
        if (up) await hp.keyboard.up('ArrowUp')
        return frames
    }
    // headless paint here runs well below 60 fps — one arc yields ~8 samples,
    // too few to promise a hit inside the ~8-tick inversion window. Take four
    // hops per arm-state: inversion needs any one frame anywhere, and the gun
    // law is a MEAN per sampled frame, so constant window occupants (the
    // rotating boots, the same every hop) cancel and only the aim difference
    // can move the needle.
    const upFrames = [], flatFrames = []
    for (let i = 0; i < 4; i++) {
        upFrames.push(...await captureHop(true))
        await new Promise((res) => setTimeout(res, 80))
        flatFrames.push(...await captureHop(false))
        await new Promise((res) => setTimeout(res, 80))
    }
    const invFrames = (f) => f.reduce((a, x) => a + (x.redBelow >= 5 ? 1 : 0), 0)
    const invMax = (f) => Math.max(0, ...f.map((x) => x.redBelow))
    const gunMean = (f) => { const s = f.filter((x) => x.roll >= 8); return s.length ? s.reduce((a, x) => a + x.gunAbove, 0) / s.length : 0 }
    const ok = upFrames.length >= 12 && flatFrames.length >= 12 &&
        invFrames(upFrames) >= 1 && invFrames(flatFrames) >= 1 &&
        gunMean(upFrames) >= gunMean(flatFrames) + 1.5
    r.check('#3035 live somersault: band-in-the-feet-line frames appear on both arm-states (the body turns whatever the arrows do), and the AIM-UP hops carry dark barrel ink above the pivot that the flat hops do not (body turns, aim does not)',
        ok, `up=${upFrames.length}f inv=${invFrames(upFrames)}(max ${invMax(upFrames)}) gun=${gunMean(upFrames).toFixed(1)} | flat=${flatFrames.length}f inv=${invFrames(flatFrames)}(max ${invMax(flatFrames)}) gun=${gunMean(flatFrames).toFixed(1)}`)
    r.check('#3035 somersault legs: zero page errors', hErrs.length === 0, hErrs.join(' | '))
    await hp.close()
}

// ---------- #3038 browser leg: the duck paints ----------
// Real ArrowDown presses take the profile, and the drawn body comes down with
// it. Bandana red is the stamp: standing its rows sit at the top of the head
// column (-32..-27 over the feet), kneel moves it to the middle band, prone
// parks it within 9 px of the deck. Poll for the whole profile in ONE frame
// (near red AND no top red together) — the headless paint law: grade the
// repaint, never a sleep.
{
    const dp = await openGame(browser, { url: `${BASE}/contra`, hook: '__contraTest', start: true, wait: 300 })
    const dErrs = []
    dp.on('pageerror', (e) => dErrs.push(e.stack || e.message))
    await dp.evaluate(() => { window.__contraTest.start(); window.__game.reset(31, 1) })
    await dp.waitForTimeout(150)
    const inkScript = () => {
        const pr = window.__contraTest.probe()
        const c = document.querySelector('canvas')
        const k = c.width / 384
        const RED = (r, g, b) => r > 170 && g < 110 && b < 110
        const count = (x0, y0, w, h) => {
            const d = c.getContext('2d').getImageData(Math.round(x0 * k), Math.round(y0 * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))).data
            let n = 0
            for (let i = 0; i < d.length; i += 4) if (RED(d[i], d[i + 1], d[i + 2])) n++
            return n
        }
        const cx = pr.x - pr.cam, feet = pr.y - pr.camY
        return { posture: pr.posture, top: count(cx - 9, feet - 33, 18, 7), near: count(cx - 9, feet - 9, 18, 9) }
    }
    const pollInk = async (want, budget = 40) => {
        let last = null
        for (let i = 0; i < budget; i++) {
            last = await dp.evaluate(inkScript)
            if (want(last)) return last
            await dp.waitForTimeout(80)
        }
        return last
    }
    const standInk = await pollInk((s) => s.posture === 0 && s.top >= 3)
    // movement keys are held-key state, not tap-latched like jump — a
    // press() with no dwell evaporates between pads. Hold for real.
    await dp.keyboard.down('ArrowDown'); await dp.waitForTimeout(120); await dp.keyboard.up('ArrowDown')
    await dp.waitForTimeout(80)
    const kneelProbe = await dp.evaluate(() => window.__contraTest.probe())
    await dp.keyboard.down('ArrowDown'); await dp.waitForTimeout(120); await dp.keyboard.up('ArrowDown')
    await dp.waitForTimeout(80)
    const proneProbe = await dp.evaluate(() => window.__contraTest.probe())
    const proneInk = await pollInk((s) => s.posture === 2 && s.near >= 3 && s.top === 0)
    await dp.keyboard.down('ArrowUp'); await dp.waitForTimeout(120); await dp.keyboard.up('ArrowUp')
    await dp.waitForTimeout(80)
    const upProbe = await dp.evaluate(() => window.__contraTest.probe())
    const backInk = await pollInk((s) => s.posture === 0 && s.top >= 3)
    r.check('#3038 live duck through real keys: two ArrowDown presses land posture 2, and the paint follows the profile — bandana red inside 9 px of the deck with the top of the column empty, and ArrowUp sends it back to the crown',
        kneelProbe.posture === 1 && proneProbe.posture === 2 && proneInk.near >= 3 && proneInk.top === 0 && upProbe.posture === 0 && backInk.top >= 3 && standInk.top >= 3,
        JSON.stringify({ kneel: kneelProbe.posture, prone: proneProbe.posture, proneInk, up: upProbe.posture, back: backInk.top }))
    r.check('#3038 duck browser legs: zero page errors', dErrs.length === 0, dErrs.join(' | '))
    await dp.close()
}

r.exit(browser)
