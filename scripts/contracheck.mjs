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
import { makeGame, step, autopilot, stateHash, CFG, PLATFORMS, FALLS_LEDGES, warpFalls, warpBoss } from '../src/games/Contra/sim.js'
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

// rifle vs SPREAD
{
    const g1 = makeGame(5)
    step(g1, { b: true })
    r.check('rifle fires one round', g1.pb.length === 1, `pb=${g1.pb.length}`)
    const g2 = makeGame(5)
    g2.p.weapon = 'spread'
    step(g2, { b: true })
    r.check('SPREAD fires five rounds, fanned', g2.pb.length === 5 && new Set(g2.pb.map((b) => Math.round(b.vy * 10))).size >= 4, `pb=${g2.pb.length}`)
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
    let guard = 0
    while (!g2.end && guard++ < 9000) { g2.p.inv = 0; g2.eb.push({ x: g2.p.x, y: g2.p.y - 14, vx: 0.1, vy: 0 }); step(g2, {}) }
    r.check('three hits and the run is over (GAME OVER path)', g2.end === 'dead' && g2.lives === 0)
}

// ------------------------------------------------------- S3: weapon wheel ---
{
    // the MG: a stream, at least twice the rifle's rounds on the same hold
    const mg = makeGame(5)
    mg.p.weapon = 'machine'
    let m = 0
    for (let i = 0; i < 60; i++) { step(mg, { b: true }); m += mg.ev.filter((e) => e.type === 'shot' && e.k === 'machine').length; mg.ev.length = 0 }
    const rf = makeGame(5)
    let r2 = 0
    for (let i = 0; i < 60; i++) { step(rf, { b: true }); r2 += rf.ev.filter((e) => e.type === 'shot').length; rf.ev.length = 0 }
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

// ------------------------------------------------------------- the mutants ---
if (MUTANT) {
    const src = readFileSync(SIM, 'utf8')
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
            anchor: `gs.pb.push({ x: o.x, y: o.y, vx: p.ax * CFG.machineSpeed, vy: p.ay * CFG.machineSpeed, k: 'm' })`,
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
    ]
    for (const p of plants) {
        if (!src.includes(p.anchor)) { console.error(`MUTANT anchor (${p.name}) missing — sim moved; the plant must be re-anchored`); process.exit(2) }
        writeFileSync(SIM, src.replace(p.anchor, p.plant))
        let bad
        try {
            bad = 'dynamic-import'
            bad = await p.harm(await import(`../src/games/Contra/sim.js?mutant=${p.name}${Date.now()}`))
        } finally {
            writeFileSync(SIM, src)
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
    await page.evaluate(() => { window.__game && window.__game.reset(99); window.__contraTest.setup({ lives: 1 }) })
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

    r.check('zero page errors', errs.length === 0, errs.join(' | '))
    await page.close()
}

r.exit(browser)
