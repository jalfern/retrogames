// contracheck.mjs — CONTRA (#2779): boots, rules hold, it can be won, and the
// check can be seen to fail.
//
//   node scripts/contracheck.mjs               # sim core + browser leg
//   node scripts/contracheck.mjs --mutant    # plant regressions, demand named harm
//
// The sim core runs in plain Node (sim.js is DOM-free): determinism, the 8-way
// run-and-gun law, one-hit death + respawn mercy, the SPREAD capsule, barrel
// chains, and the S2 laws — the waterfall ratchet camera, drowning torrent,
// vertical wake law, the armored gate with its one weak point, and the door
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
import { makeGame, step, autopilot, stateHash, CFG, PLATFORMS, FALLS_LEDGES, warpFalls, warpBoss, dropIn, releaseSeat, CARRIER_ALT } from '../src/games/Contra/sim.js'
import { drawCapsule } from '../src/games/Contra/art.js'
import { openGame, launch, requireDevServer, Report } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIM = join(ROOT, 'src/games/Contra/sim.js')
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
            anchor: 'gs.pods.push({ x: cr.x, y: cr.y + 12, vx: CFG.podVx, vy: 0, kind: cr.kind })',
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

// ------------------------------------------------------------- browser leg ---
await requireDevServer(`${BASE}/contra`)
const browser = await launch()
{
    const page = await openGame(browser, { url: `${BASE}/contra`, hook: '__contraTest', wait: 600 })
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
    await page.waitForTimeout(120)
    const jumped = await page.evaluate(() => window.__contraTest.probe())
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

    r.check('zero page errors', errs.length === 0, errs.join(' | '))
    await page.close()
}

r.exit(browser)
