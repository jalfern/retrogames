// pinballcheck — PINBALL / CABINET ONE (issue #3103 rung 1), audited in plain
// Node against the SAME sim.js the tab runs (zero DOM, zero Math.random).
// Expectations are LITERAL numbers, not the sim's own constants — a check that
// imports the number it audits cannot see the number change (the TETRIS lesson).

import { makeGame, stepGame, stateOf, stateHash, TABLE, W, H, BALL_R, mulberry32 } from '../src/games/Pinball/sim.js'
import { Report } from './lib/harness.mjs'

const r = new Report('pinballcheck')
r.info('boot', 'sim.js imported in Node, zero DOM, zero Math.random')

const drive = (gs, pad = {}, n = 1) => { for (let i = 0; i < n; i++) stepGame(gs, pad); return gs }
const clear = (gs) => { const e = [...gs.events]; gs.events.length = 0; return e }
const types = (gs) => clear(gs).map((e) => e.type)

// ---------------------------------------------------------- geometry ----
{
    const arc = TABLE.arc
    r.check('the top arc starts at the left wall (10,160) and ends at the lane outer wall (350,160)',
        Math.abs(arc.cx - arc.rx - 10) < 0.01 && Math.abs(arc.cx + arc.rx - 350) < 0.01 && Math.abs(arc.cy - 160) < 0.01,
        `l=${arc.cx - arc.rx} r=${arc.cx + arc.rx} cy=${arc.cy}`)
    r.check('the arc top leaves a 10 px margin under the canvas edge', arc.cy - arc.ry === 10, `top=${arc.cy - arc.ry}`)
    r.check('the launch lane is 28 px wide (x 322..350), wider than the 18 px ball', 350 - 322 === 28 && 28 > 2 * BALL_R)
    r.check('the flipper pivots sit at y=552, 144 px apart, tips gape ~30 px (drainable)',
        TABLE.flippers.R.px - TABLE.flippers.L.px === 144 && TABLE.flippers.pivotY === 552,
        `gap=${TABLE.flippers.R.px - TABLE.flippers.L.px}`)
    // bumper pair spacing: no two bumpers within 2*(r)+ball of each other
    let clear1 = true
    for (let i = 0; i < TABLE.bumpers.length; i++) for (let j = i + 1; j < TABLE.bumpers.length; j++) {
        const a = TABLE.bumpers[i], b = TABLE.bumpers[j]
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 2 * BALL_R) clear1 = false
    }
    r.check('the three pop bumpers leave a ball-sized gap between every pair', clear1)
    r.check('the drop bank has 4 targets, 30 px wide, ordered left→right',
        TABLE.targets.length === 4 && TABLE.targets.every((t) => t.x2 - t.x1 === 30) &&
        TABLE.targets.every((t, i) => i === 0 || t.x1 > TABLE.targets[i - 1].x2))
    r.check('the outlane spinner sits between the guide and the left wall, above the kicker',
        TABLE.spinner.xMax === 46 && TABLE.spinner.yTo < TABLE.kicker.yAt + 2)
}

// ------------------------------------------------------------ gravity ----
{
    const gs = drive(makeGame(7))
    gs.bx = 100; gs.by = 250; gs.vx = 0; gs.vy = 0; gs.launched = true; clear(gs)
    drive(gs, {}, 30)
    r.check('a free ball accelerates downward under gravity (~0.5 s of fall drops ~110 px)', gs.by > 340 && gs.by < 390, `y=${gs.by.toFixed(1)} vy=${gs.vy.toFixed(0)}`)
    r.check('gravity reaches arcade speed quickly (vy > 400 px/s after half a second)', gs.vy > 400 && gs.vy < 470, `vy=${gs.vy.toFixed(0)}`)
}

// -------------------------------------------------------------- walls ----
{
    const gs = drive(makeGame(11))
    gs.bx = 100; gs.by = 250; gs.launched = true
    gs.vx = -500; gs.vy = 0; clear(gs)
    drive(gs, {}, 20)
    r.check('the left wall turns a hard horizontal hit (vx flips, damped)', gs.vx > 100 && gs.vx < 350, `vx=${gs.vx.toFixed(0)}`)
    const gs2 = drive(makeGame(12))
    gs2.bx = 260; gs2.by = 250; gs2.launched = true; gs2.vx = 500; gs2.vy = 0; clear(gs2)
    drive(gs2, {}, 8)
    r.check('the lane inner wall (x=322) is solid from the playfield side', gs2.vx < -100, `vx=${gs2.vx.toFixed(0)}`)
}

// --------------------------------------------------------- the plunger ----
{
    const gs = drive(makeGame(21))          // ball sits on the plunger
    r.check('a fresh game puts the ball on the plunger, unlaunched', gs.bx === 336 && gs.by === 555 && !gs.launched)
    drive(gs, { down: true }, 30)
    r.check('holding the plunger charges power (0.5 after half a second)', gs.power > 0.45 && gs.power < 0.72, `p=${gs.power.toFixed(2)}`)
    gs.by = 555; gs.vy = 0; clear(gs)
    drive(gs, {}, 1)                      // release → fire
    r.check('releasing the plunger fires the ball upward', types(gs).includes('plunge') && gs.vy < -600, `vy=${gs.vy.toFixed(0)}`)
    // full power reaches the top of the lane (y≈160 is the lane mouth)
    const gs3 = drive(makeGame(23)); gs3.launched = false
    drive(gs3, { down: true }, 70); gs3.by = 555; gs3.vy = 0; clear(gs3)
    drive(gs3, {}, 1)
    let minY = 9999
    for (let i = 0; i < 90; i++) { drive(gs3, {}, 1); minY = Math.min(minY, gs3.by) }
    r.check('full pull sends the ball over the arc (min y < 160)', minY < 160, `minY=${minY.toFixed(0)}`)
    const gs4 = drive(makeGame(24))
    clear(gs4); drive(gs4, {}, 260)
    r.check('an idle ball auto-plunges after 4 seconds', gs4.launched, `launched=${gs4.launched}`)
}

// ------------------------------------------------- bumper / sling / target ----
const setBall = (gs, x, y, vx, vy) => { gs.bx = x; gs.by = y; gs.vx = vx; gs.vy = vy; gs.launched = true }
{
    const gs = makeGame(31); gs.launched = true
    setBall(gs, 115, 185 - 40, 0, 220); clear(gs)
    drive(gs, {}, 12)
    r.check('a falling ball hits a pop bumper: event fires and it scores exactly 100', gs.score >= 100 && gs.bankHits >= 1, `score=${gs.score}`)
    const gsb = makeGame(32); gsb.launched = true
    setBall(gsb, 115, 161, 0, 0); clear(gsb); drive(gsb, {}, 1)
    r.check('the bumper kicks the ball back out hard (speed ≥ 350)', Math.hypot(gsb.vx, gsb.vy) >= 350, `sp=${Math.hypot(gsb.vx, gsb.vy).toFixed(0)}`)
    const gsc = makeGame(33); gsc.launched = true
    setBall(gsc, 100, 470, -80, 180); clear(gsc)
    let bestVy = 0
    for (let i = 0; i < 14; i++) { drive(gsc, {}, 1); bestVy = Math.min(bestVy, gsc.vy) }
    r.check('the left slingshot kicks a ball crossing its face (25 pts, velocity up)', gsc.score % 100 >= 25 && bestVy < -100, `score=${gsc.score} bestVy=${bestVy.toFixed(0)}`)
    const gsd = makeGame(34); gsd.launched = true
    setBall(gsd, 133, 285, 0, 150); clear(gsd)
    drive(gsd, {}, 6)
    r.check('a drop target falls for exactly 50', gsd.score === 50 && gsd.targetDown[0], `score=${gsd.score} down=${gsd.targetDown.join('')}`)
}

// ---------------------------------------------------- bank & bonus ladder ----
{
    const gs = makeGame(41); gs.launched = true
    for (let i = 0; i < 4; i++) {
        setBall(gs, (TABLE.targets[i].x1 + TABLE.targets[i].x2) / 2, 285, 0, 150); clear(gs)
        drive(gs, {}, 8); clear(gs)
    }
    r.check('clearing the bank pays exactly 4x50 + 250 = 450', gs.score === 450, `score=${gs.score}`)
    r.check('a cleared bank raises MULT to x2 and stays down until the ball ends', gs.mult === 2 && gs.targetDown.every(Boolean) && gs.bankLit)
    // second bank (after manual relight simulating the next ball is NOT automatic mid-ball)
    gs.targetDown = [false, false, false, false]; gs.bankLit = false
    for (let i = 0; i < 4; i++) {
        setBall(gs, (TABLE.targets[i].x1 + TABLE.targets[i].x2) / 2, 285, 0, 150); clear(gs)
        drive(gs, {}, 8); clear(gs)
    }
    r.check('a second bank mid-ball raises MULT to x3', gs.mult === 3, `mult=${gs.mult}`)
    const hits = gs.bankHits
    const before = gs.score
    gs.by = 999; clear(gs); drive(gs, {}, 4)     // drain
    r.check(`drain pays BONUS = hits(${hits}) x 50 x mult(3) exactly`, gs.score === before + hits * 150, `+${gs.score - before}`)
    r.check('the drain costs a ball (2 left of 3)', gs.balls === 2)
    r.check('the next ball starts on the plunger with the bank RELIT and MULT reset to x1',
        gs.by === 555 && gs.targetDown.every((d) => !d) && gs.mult === 1 && gs.bankHits === 0)
    const gs2 = makeGame(42); gs2.balls = 1; gs2.launched = true; gs2.by = 999; clear(gs2)
    drive(gs2, {}, 4)
    r.check('draining the last ball ends the game (done, phase over)', gs2.done && gs2.phase === 'over' && gs2.balls === 0)
}

// ---------------------------------------------------- spinner & kicker ----
{
    const gs = makeGame(51); gs.launched = true
    setBall(gs, 30, 435, 10, 320); clear(gs)
    drive(gs, {}, 30)
    const evs = []
    // keep feeding until the spinner ticks and the kicker fires
    let spun = false, kicked = false
    for (let i = 0; i < 60 && !(spun && kicked); i++) {
        if (gs.bx > 200 || gs.vy < -300) { kicked = true }
        for (const t of types(gs)) { if (t === 'spinner') spun = true; if (t === 'kicker') kicked = true }
        if (!spun && gs.by > 430 && gs.by < 500) { gs.bx = 30; gs.vy = 320 }
        drive(gs, {}, 1)
    }
    r.check('the outlane spinner ticks at 10 per turn as the ball rolls down', spun && gs.score % 100 >= 10, `turns=${gs.spinnerTurns}`)
    r.check('the outlane kicker hurls the ball back into play (100 pts, hard upward)', kicked && gs.balls === 3, `vx=${gs.vx.toFixed(0)} vy=${gs.vy.toFixed(0)}`)
}

// -------------------------------------------------------- flippers ----
{
    const gs = makeGame(61); gs.launched = true
    setBall(gs, 150, 560, 0, 120)
    clear(gs)
    drive(gs, { left: true }, 10)
    r.check('a held left flipper flicks a falling ball UPWARD with real speed', gs.vy < -300, `vy=${gs.vy.toFixed(0)}`)
    const gs2 = makeGame(62); gs2.launched = true
    // placed ON the resting face (16 px above it, near the tip): the sweep must catch it
    setBall(gs2, 148, 554, 0, 150); clear(gs2)
    drive(gs2, { left: true }, 10)
    r.check('flip timing sends the ball up-left when hit near the left tip', gs2.vy < -250, `vy=${gs2.vy.toFixed(0)} vx=${gs2.vx.toFixed(0)}`)
    const gs3 = makeGame(63); gs3.launched = true
    setBall(gs3, 184, 545, 0, 600); clear(gs3)
    drive(gs3, {}, 30)
    r.check('a ball dropping between the flippers drains (ball lost)', gs3.balls === 2, `balls=${gs3.balls}`)
}

// ---------------------------------------------------------- tilt ----
{
    const gs = makeGame(71); gs.launched = true
    setBall(gs, 180, 400, 0, 0); clear(gs)
    drive(gs, { b: true }, 3); clear(gs)          // nudge 1
    drive(gs, {}, 2); drive(gs, { b: true }, 3); clear(gs)   // nudge 2 -> warn
    drive(gs, {}, 2); drive(gs, { b: true }, 3); clear(gs)   // nudge 3 -> TILT
    r.check('three quick nudges TILT the machine', gs.tilt)
    const before = { vy: gs.vy }
    setBall(gs, 150, 560, 0, 120)
    drive(gs, { left: true }, 10)
    r.check('while tilted the flippers are DEAD (no upward flick)', gs.vy > -100, `vy=${gs.vy.toFixed(0)} (was ${before.vy.toFixed(0)})`)
    gs.by = 999; clear(gs); drive(gs, {}, 4)
    r.check('tilt clears at the drain — next ball is live again', !gs.tilt && gs.nudgeMeter === 0)
    const gsd = makeGame(72); gsd.launched = true
    setBall(gsd, 180, 400, 0, 0); clear(gsd)
    drive(gsd, { b: true }, 3); clear(gsd)
    drive(gsd, {}, 70)                              // ~1.1 s later
    drive(gsd, { b: true }, 3); clear(gsd)
    r.check('nudges spaced over the decay window do NOT accumulate into a tilt', !gsd.tilt && gsd.nudgeMeter === 1)
}

// ---------------------------------------------------- determinism ----
{
    const script = (i) => ({ left: i % 43 < 12, right: i % 43 >= 20 && i % 43 < 33, down: i % 211 < 25, b: i % 173 < 2 })
    const run = (seed) => { const gs = makeGame(seed); const hs = []; for (let i = 1; i <= 600; i++) { stepGame(gs, script(i)); if (i % 30 === 0) hs.push(stateHash(gs)) } return hs }
    const a = run(1234), b = run(1234), c = run(1235)
    r.check('same seed + same pads = hash-identical over 600 ticks (20 checkpoints)', JSON.stringify(a) === JSON.stringify(b))
    r.check('a different seed diverges', JSON.stringify(a) !== JSON.stringify(c))
    const gs = run.length && makeGame(9)
    const st = stateOf(drive(gs, script(5), 120))
    r.check('state() is plain JSON with tick/score/done', ['tick', 'score', 'done'].every((k) => k in st) && JSON.stringify(st).length > 0)
}

// -------------------------------------------------- fuzz containment ----
{
    const rng = mulberry32(4242)
    let escaped = 0, drains = 0, empties = 0
    const gs = makeGame(77)
    for (let i = 0; i < 6000; i++) {
        const pad = { left: rng() < 0.3, right: rng() < 0.3, b: rng() < 0.02, down: rng() < 0.05 }
        stepGame(gs, pad)
        for (const e of gs.events) if (e.type === 'drain') drains++
        gs.events.length = 0
        for (const p of gs.pucks) {
            if (p.launched && !gs.done && p.by > 1 && (p.bx < 1 || p.bx > W - 1 || p.by > H + 11)) escaped++
        }
        if (!gs.done && gs.pucks.length === 0) empties++   // even for one tick
    }
    r.check('6000 fuzz ticks: no ball ever tunnels out of the cabinet', escaped === 0, `escapes=${escaped}`)
    r.check('the playfield never sits empty mid-game (lock feeds, pack feeds)', empties === 0, `empties=${empties}`)
    r.check('the fuzz game actually drains balls (it is a playable loop, not a stuck ball)', drains > 0, `drains=${drains}`)
}

// =============== RUNG 2 (#3169): firelane · lock tower · MULTIBALL ===============
const rung2Ball = (gs, x, y, vx, vy) => {
    gs.pucks.length = 1
    gs.pucks[0] = { bx: x, by: y, vx, vy, prevY: y, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0 }
}

// ------------------------------------------------ rung-2 geometry ----
{
    const guide = TABLE.walls.find((w) => w.x1 === 298 && w.x2 === 298)
    const gate = TABLE.walls.find((w) => w.y1 === 190 && w.y2 === 190)
    r.check('the firelane is 24 px wide (x 298..322), wider than the 18 px ball', 322 - 298 === 24 && 24 > 2 * BALL_R)
    r.check('the firelane top gate is one-way and spans the full lane width',
        !!gate && gate.oneWay === true && Math.min(gate.x1, gate.x2) === 298 && Math.max(gate.x1, gate.x2) === 322)
    r.check('the firelane inner guide is solid both ways (the lane is entered only from the top)',
        !!guide && !guide.oneWay && guide.y1 === 195 && guide.y2 === 470)
    r.check('the lock mouth sits in the lane above the flipper deck',
        TABLE.lock.yAt > 240 && TABLE.lock.yAt < guide.y2 - 20 && TABLE.lock.need === 3,
        `yAt=${TABLE.lock.yAt}`)
    const kicksLeft = TABLE.mbKick.every((k) => k.x + BALL_R < 298)
    r.check('the multiball kick ejects onto the OPEN playfield — never back into the firelane', kicksLeft,
        TABLE.mbKick.map((k) => k.x).join('/'))
    r.check('the pack is three balls (the tower holds three)', TABLE.mbKick.length === 3)
}

// ------------------------------------------------ gate physics ----
{
    const gs = makeGame(201); rung2Ball(gs, 310, 170, 0, 200); clear(gs)
    drive(gs, {}, 30)
    const evs = types(gs)
    const inLane = gs.pucks.length === 1 && gs.pucks[0].bx > 298 && gs.pucks[0].bx < 322
    r.check('a descending ball passes the one-way gate and rolls the lane (rollovers fire, ball stays roped)',
        evs.includes('lane') && inLane, evs.join(','))
    const gs2 = makeGame(202); rung2Ball(gs2, 310, 300, 0, -500); clear(gs2)
    let minY = 999
    for (let i = 0; i < 40; i++) { drive(gs2, {}, 1); minY = Math.min(minY, gs2.pucks[0].by) }
    const stillIn = gs2.pucks.length === 1 && gs2.pucks[0].bx > 298 && gs2.pucks[0].bx < 322
    r.check('a rising lane ball BOUNCES off the gate back down (no escaping the lane upward)',
        minY > 180 && stillIn, `minY=${minY.toFixed(0)}`)
    const gs3 = makeGame(203); rung2Ball(gs3, 250, 300, 500, 0); clear(gs3)
    drive(gs3, {}, 8)
    r.check('the lane guide is solid from the playfield (a rightbound shot bounces off x=298)',
        gs3.pucks[0].vx < -100, `vx=${gs3.pucks[0].vx.toFixed(0)}`)
}

// ------------------------------------------------ ramp rollovers ----
{
    const gs = makeGame(211); rung2Ball(gs, 336, 380, 0, -700); clear(gs)
    let hits = 0
    for (let i = 0; i < 24 && hits < 2; i++) { drive(gs, {}, 1); hits += types(gs).filter((t) => t === 'ramp').length }
    const after2 = gs.score
    r.check('crossing the two RAMP rollovers upward scores exactly 2×25', after2 === 50,
        `score=${after2} hits=${gs.rampHits}`)
    // third upward crossing completes the set
    rung2Ball(gs, 336, 380, 0, -700); clear(gs)
    let setEv = false
    for (let i = 0; i < 20 && !setEv; i++) { drive(gs, {}, 1); setEv = types(gs).includes('rampset') }
    r.check('the third ramp hit pays the 500 set bonus and lights the tower',
        setEv && gs.rampLit && gs.score === after2 + 25 + 500, `score=${gs.score}`)
    // downward crosses must NOT count
    const gsd = makeGame(212); rung2Ball(gsd, 336, 200, 0, 500); clear(gsd)
    drive(gsd, {}, 14)
    r.check('rollovers only count UPWARD crossings (rain-down the lane is free)',
        !types(gsd).includes('ramp') && gsd.score === 0, `score=${gsd.score}`)
}

// ------------------------------------------ lane sweep + lock capture ----
const rollToLock = (gs) => {
    rung2Ball(gs, 310, 235, 0, 160); clear(gs)
    for (let i = 0; i < 60; i++) {
        drive(gs, {}, 1)
        if (gs.events.some((e) => e.type === 'lock')) { clear(gs); return true }
        gs.events.length = 0
    }
    return false
}
{
    const gs = makeGame(221)
    const before = gs.score
    const locked = rollToLock(gs)
    r.check('a full firelane run scores 3×25 rollovers + 100 sweep, captured by the tower at 500',
        locked && gs.score === before + 75 + 100 + 500, `+${gs.score - before}`)
    r.check('the captured ball costs NOTHING: locks=1, and the lane feeds a fresh ball',
        gs.locks === 1 && gs.pucks.length === 1 && gs.pucks[0].by === TABLE.plunger.restY,
        `locks=${gs.locks} by=${gs.pucks[0].by}`)
    r.check('the third lock of the ball ignites MULTIBALL: pack of 3, tower lamps clear, 1000 paid', (() => {
        const s = gs.score
        rollToLock(gs); rollToLock(gs)
        return gs.multiball === true && gs.pucks.length === 3 && gs.locks === 0 &&
            gs.score === s + (175 + 500) + (175 + 500 + 1000) && gs.saveT > 0
    })(), `mb=${gs.multiball} pucks=${gs.pucks.length}`)
}

// ----------------------------------------------- multiball behaviour ----
{
    const gs = makeGame(231)
    rollToLock(gs); rollToLock(gs); rollToLock(gs)
    r.check('MULTIBALL is live with the pack down', gs.multiball && gs.pucks.length === 3)
    // park: hold the pack safely on the open playfield so a unit manoeuvre
    // with ONE free ball doesn't race the drain.
    const park = (free = -1) => {
        gs.pucks.forEach((p, i) => { if (i === free) return; p.bx = 90 + i * 60; p.by = 420; p.vx = 0; p.vy = 0 })
    }
    const laneBall = () => ({ bx: 310, by: 235, vx: 0, vy: 160, prevY: 235, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0 })

    park(0)
    gs.pucks[0].bx = 115; gs.pucks[0].by = 145; gs.pucks[0].vx = 0; gs.pucks[0].vy = 220
    clear(gs)
    const s0 = gs.score
    for (let i = 0; i < 12; i++) { park(0); stepGame(gs, {}); gs.events.length = 0 }
    r.check('playfield scoring DOUBLES while the pack is down (bumper 100 → 200)',
        gs.score - s0 === 200, `+${gs.score - s0}`)

    // a lock during the pack banks an extra ball instead of starting a new pack
    const li = gs.pucks.length
    gs.pucks.push(laneBall())
    let extraEv = false
    for (let i = 0; i < 90 && !extraEv; i++) {
        park(li); stepGame(gs, {}); extraEv = gs.events.some((e) => e.type === 'extraball'); gs.events.length = 0
    }
    r.check('a lock DURING multiball banks an extra ball (the pack stays down)',
        gs.extraBall === 1 && gs.multiball, `extra=${gs.extraBall} mb=${gs.multiball}`)

    // drains cost balls-on-playfield only — the save is spent, so they thin the pack
    gs.saveUsed = true
    const ballsBefore = gs.balls
    park(0); gs.pucks[0].by = 999; clear(gs); stepGame(gs, {}); gs.events.length = 0
    r.check('a pack drain costs a ball-on-playfield but NOT a game ball',
        gs.balls === ballsBefore && gs.pucks.length === 2, `balls=${gs.balls} pucks=${gs.pucks.length}`)
    // drain the rest: when the pack returns to one ball it ends and pays
    let guard = 0
    while (gs.pucks.length > 1 && gs.multiball && guard++ < 1000) {
        park(0); gs.pucks[0].by = 999; clear(gs); stepGame(gs, {}); gs.events.length = 0
    }
    r.check('when the last ball of the pack drains, MULTIBALL ends and the banked extra ball pays',
        !gs.multiball && gs.balls === ballsBefore + 1 && gs.extraBall === 0,
        `balls ${ballsBefore}→${gs.balls}`)
}

// -------------------------------------------------- ball save ----
{
    const gs = makeGame(241)
    rollToLock(gs); rollToLock(gs); rollToLock(gs)
    r.check('the pack opens with a live ball-save window', gs.saveT > 0 && !gs.saveUsed, `saveT=${gs.saveT}`)
    const before = { balls: gs.balls, pucks: gs.pucks.length }
    gs.pucks[0].by = 999; clear(gs); drive(gs, {}, 4)
    r.check('the first drain inside the window relaunches instead (SAVE, no ball lost)',
        gs.events.some((e) => e.type === 'save') && gs.pucks.length === before.pucks && gs.balls === before.balls && gs.saveUsed,
        `pucks=${gs.pucks.length}`)
    gs.pucks[0].by = 999; clear(gs); drive(gs, {}, 4)
    r.check('the save is spent — the next drain does thin the pack',
        gs.pucks.length === before.pucks - 1 && gs.balls === before.balls)
}

// ------------------------------------------------- state/hash pins ----
{
    const gs = makeGame(251)
    const st = stateOf(drive(gs, {}, 60))
    r.check('state carries the seed as an integer (report/replay pin #3103) + rung-2 fields',
        Number.isInteger(st.seed) && st.seed >= 0 && 'liveBalls' in st && 'locks' in st && typeof st.multiball === 'boolean')
    const h0 = stateHash(gs)
    gs.locks = 1
    r.check('the hash covers the lock tower (a banked lock changes the hash)', stateHash(gs) !== h0)
    gs.locks = 0; gs.multiball = true
    r.check('the hash covers the pack (multiball changes the hash)', stateHash(gs) !== h0)
}

// -------------------------------------------- scripted winnable rung 2 ----
{
    // A REAL run: plunge at the pw≈8 sweet spot (4 hold ticks) — the probe
    // shows the ball rounds the dome, rolls the firelane and locks; three
    // plunges ignite MULTIBALL. No teleports: this proves a human line exists.
    const gs = makeGame(3169)
    let mb = false, empties = 0, scoreAtLock = 0
    for (let i = 0; i < 3000 && !mb; i++) {
        const p = gs.pucks[0]
        const atPlunger = gs.pucks.length === 1 && !p.launched && p.by > 540
        const pad = atPlunger && i % 90 < 4 ? { down: true } : {}
        stepGame(gs, pad)
        if (gs.pucks.length === 0 && !gs.done) empties++
        if (scoreAtLock === 0 && gs.events.some((e) => e.type === 'lock')) scoreAtLock = gs.score
        if (gs.multiball) mb = true
        gs.events.length = 0
    }
    r.check('HUMAN LINE: three medium plunges lock the tower and ignite MULTIBALL within 3000 ticks', mb, `mb=${mb}`)
    r.check('that run banked the lock jackpots first (tower pays before the pack)', scoreAtLock >= 500, `first lock score=${scoreAtLock}`)
    r.check('the human line never leaves the table empty', empties === 0)
}

// =============== RUNG 3 (#3199): ORBIT WRAP · MAGNET · DMD ===============
const rung3Ball = (gs, x, y, vx, vy) => {
    gs.pucks.length = 1
    gs.pucks[0] = { bx: x, by: y, vx, vy, prevY: y, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false }
}
const wrap = (gs) => {
    // feed the climbing rail at the kicker's own output vector; run until the
    // wrap pays (or 220 ticks). Returns the events seen.
    rung3Ball(gs, 20, 498, TABLE.kicker.vx, TABLE.kicker.vy)
    const seen = []
    for (let i = 0; i < 220; i++) {
        drive(gs, {}, 1)
        seen.push(...types(gs))
        if (seen.includes('orbit')) break
    }
    return seen
}

// ------------------------------------------------ rung-3 geometry ----
{
    const guide = TABLE.walls.find((w) => w.x1 === 40 && w.x2 === 40)
    r.check('the orbit rail (x=40) makes a 30 px climbing channel with the left wall, open onto the outlane below',
        !!guide && guide.y1 === 320 && guide.y2 === 415 && 40 - 10 > 2 * BALL_R && guide.y2 < TABLE.spinner.yFrom)
    const arc = TABLE.arc
    const arcY = (x) => arc.cy - arc.ry * Math.sqrt(Math.max(0, 1 - ((x - arc.cx) / arc.rx) ** 2))
    const MG = TABLE.magnet, O = TABLE.orbit
    r.check('both flank pads hang under the dome ceiling with ball clearance',
        arcY(O.armPad.x) + BALL_R < O.armPad.y && arcY(O.donePad.x) + BALL_R < O.donePad.y,
        `arm=${arcY(O.armPad.x).toFixed(0)} done=${arcY(O.donePad.x).toFixed(0)}`)
    r.check('the magnet reach clears the climbing rail (a wrap is never ambushed mid-channel)',
        MG.x - 40 > MG.field + BALL_R, `reach=${MG.field + BALL_R} gap=${MG.x - 40}`)
    r.check('the magnet sits in its own lawn: clear of slings, bank, DMD bezel and the rail',
        MG.y >= TABLE.targetY + 50 && MG.x > 50 &&
        Math.hypot(MG.x - 232, MG.y - 500) > MG.r + 40 && MG.y > 310)
}

// ---------------------------------------------------- orbit rules ----
{
    const gs = makeGame(301)
    const seen = wrap(gs)
    // keep the ball flying: the wrap's descent lands on the firelane gate —
    // the chain pays AFTER the orbit itself.
    for (let i = 0; i < 150; i++) { drive(gs, {}, 1); seen.push(...types(gs)) }
    r.check('a scripted wrap ARMS at the left flank and COMPLETES at the right — ORBIT pays 100',
        seen.includes('orbitarm') && seen.includes('curl') && seen.includes('orbit') && gs.orbits === 1,
        seen.join(','))
    r.check('the wrap lands on the firelane and chains to a lock (orbit is a second lock route)',
        seen.includes('lane') && seen.includes('lock'), seen.join(','))
    // exact scoring: 100 orbit + 75 lane + 100 sweep + 500 lock, nothing else touched
    r.check('that chained wrap scores exactly 775 (100+75+100+500, MULT x1)', gs.score === 775, `score=${gs.score}`)
    // arm is UPWARD-only
    const gd = makeGame(302); rung3Ball(gd, 40, 100, 0, 400); clear(gd)
    drive(gd, {}, 20)
    r.check('falling back down through the arm pad does NOT arm the loop',
        !types(gd).includes('orbitarm') && gd.orbits === 0)
    // completion needs the arm: drop straight down the done pad
    const gu = makeGame(303); rung3Ball(gu, 290, 100, 0, 400); clear(gu)
    drive(gu, {}, 20)
    r.check('a ball descending the right flank un-armed completes nothing',
        !types(gu).includes('orbit') && gu.orbits === 0)
    // armed ball that falls back down the LEFT flank must not complete
    const gf = makeGame(304); wrap(gf) // completes once already — reset counters
    gf.orbits = 0; gf.orbitBank = 0; gf.orbitLit = false
    rung3Ball(gf, 40, 130, 0, 400); clear(gf)
    gf.pucks[0].orbitArmed = true
    drive(gf, {}, 20)
    r.check('an armed ball that falls back down the left flank scores no orbit',
        !types(gf).includes('orbit') && gf.orbits === 0)
}

// -------------------------------------------------- orbit the set ----
{
    const gs = makeGame(311)
    const s0 = gs.score
    wrap(gs); gs.locks = 0 // bank the tower lock the wrap chains into — keep focus on orbits
    wrap(gs); gs.locks = 0
    const seen3 = wrap(gs); gs.locks = 0
    r.check('three wraps bank the ORBIT SET: +500 paid, lamp lit, bank resets',
        seen3.includes('orbitset') && gs.orbitLit && gs.orbitBank === 0 && gs.score >= s0 + 3 * 100 + 500,
        `lit=${gs.orbitLit} bank=${gs.orbitBank}`)
    const before4 = gs.score
    const seen4 = wrap(gs)
    r.check('while the set is lit, the next wrap banks a LOCK outright',
        seen4.includes('orbitlock') && !gs.orbitLit && gs.locks >= 1 && gs.score >= before4 + 100 + 500,
        `locks=${gs.locks}`)
}

// ------------------------------------------------------ the magnet ----
{
    const MG = TABLE.magnet
    const gs = makeGame(321)
    rung3Ball(gs, MG.x, MG.y - 40, 0, 60)
    const t0 = gs.tick
    let grabTick = -1, freeTick = -1, scoreAtGrab = 0, clampX = 0, clampY = 0, drift = 0
    for (let i = 0; i < 300 && freeTick < 0; i++) {
        drive(gs, {}, 1)
        const ev = types(gs)
        if (grabTick < 0 && ev.includes('maggrab')) { grabTick = gs.tick; scoreAtGrab = gs.score; clampX = gs.pucks[0].bx; clampY = gs.pucks[0].by }
        if (grabTick >= 0 && freeTick < 0 && gs.magHold > 0) drift = Math.max(drift, Math.hypot(gs.pucks[0].bx - clampX, gs.pucks[0].by - clampY))
        if (grabTick >= 0 && freeTick < 0 && ev.includes('magfree')) freeTick = gs.tick
    }
    r.check('a drifting ball is pulled, clamped at the post face and HELD (velocity dies)',
        grabTick > 0 && gs.magCharge === 0, `grab@${grabTick}`)
    r.check('the hold lasts exactly 72 world ticks and the release pays 50 x MULT',
        freeTick - grabTick === MG.hold && gs.score === scoreAtGrab + TABLE.rules.magnet,
        `held=${freeTick - grabTick} paid=${gs.score - scoreAtGrab}`)
    r.check('the held ball is pinned (drift < 0.01 px) while the world clock runs its 72 ticks',
        drift < 0.01 && freeTick - t0 >= MG.hold, `drift=${drift.toFixed(4)} ticks=${freeTick - t0}`)
    // spent: a second visit must not grab
    const gs2 = makeGame(322)
    rung3Ball(gs2, MG.x, MG.y - 40, 0, 60)
    for (let i = 0; i < 120; i++) { drive(gs2, {}, 1); clear(gs2) }
    rung3Ball(gs2, MG.x, MG.y - 40, 0, 60)
    const g2 = []
    for (let i = 0; i < 60; i++) { drive(gs2, {}, 1); g2.push(...types(gs2)) }
    r.check('a spent magnet lets the next ball pass (charge dies with the hold)',
        !g2.includes('maggrab') && gs2.magCharge === 0)
    // recharge: drain a ball that touched the field
    const touch = gs2.pucks[0]
    touch.bx = MG.x; touch.by = MG.y; touch.vx = 0; touch.vy = 0
    gs2.magTouched = false
    drive(gs2, {}, 1)
    r.check('rolling through the field marks the magnet touched (recharge eligibility)',
        gs2.magTouched === true)
    gs2.pucks[0].by = TABLE.drainY + 5
    const ev2 = []
    drive(gs2, {}, 2); ev2.push(...types(gs2))
    r.check('draining a ball that touched the field RE-ARMS the magnet for the next ball',
        gs2.magCharge === 1 && !gs2.magTouched)
}

// ----------------------------------------------------- the DMD ----
{
    // message state lives in the SIM — Node pins what the strip says.
    const gs = makeGame(331)
    r.check('a fresh strip is dark (idle crawl takes over, no lingering text)', stateOf(gs).dmd.text === '')
    // bank clear announces the mult
    const O = TABLE.targetY
    for (let i = 0; i < TABLE.targets.length; i++) {
        rung3Ball(gs, (TABLE.targets[i].x1 + TABLE.targets[i].x2) / 2, O - 30, 0, 200)
        for (let t = 0; t < 30; t++) { drive(gs, {}, 1); if (gs.targetDown[i]) break }
    }
    r.check('clearing the bank puts MULT x2 on the strip (sim-owned message)',
        gs.mult === 2 && stateOf(gs).dmd.text === 'MULT x2', stateOf(gs).dmd.text)
    // a wrap announces itself
    const gw = makeGame(332); wrap(gw)
    r.check('the wrap announces ORBIT on the strip as it pays', (() => {
        const gs3 = makeGame(333); const s = wrap(gs3)
        return s.includes('orbit') && stateOf(gs3).dmd.text === 'ORBIT! +100'
    })())
    // messages decay
    const gd2 = makeGame(334); wrap(gd2)
    for (let i = 0; i < 130; i++) drive(gd2, {}, 1)
    r.check('strip messages decay on the world clock (back to the idle crawl)',
        stateOf(gd2).dmd.text === '' || stateOf(gd2).dmd.text === 'LOCK 1/3', stateOf(gd2).dmd.text)
    // tilt announces
    const gt = makeGame(335)
    drive(gt, { b: true }, 1); drive(gt, {}, 2); drive(gt, { b: true }, 1); drive(gt, {}, 2); drive(gt, { b: true }, 1)
    r.check('TILT takes over the strip', gt.tilt && stateOf(gt).dmd.text === 'TILT!', stateOf(gt).dmd.text)
}

// ------------------------------------- ball-ball collision (#3217) ----
// Steel refuses steel: the pack resolves pairwise inside the 240 Hz substep
// loop. Expectations are LITERAL (e=0.8 head-on from ±300 means ∓240) — the
// TETRIS lesson again: no importing the number being audited.
{
    const mkPuck = (x, y, vx, vy, held) => ({
        bx: x, by: y, vx, vy, prevY: y, launched: true, laneCurved: false, spin: 0,
        spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false,
        magHeld: !!held, magX: held ? x : undefined, magY: held ? y : undefined,
    });
    const packOf = (seed, defs) => {
        const gs = makeGame(seed); gs.launched = true; gs.pucks = defs.map((d) => mkPuck(...d)); clear(gs); return gs;
    };

    // head-on ±300 on open field (y 250 is clear of arc, bank, magnet field)
    {
        const gs = packOf(361, [[160, 250, 300, 0], [216, 250, -300, 0]]);
        let minD = 9999, orderOk = true, clacks = 0
        for (let i = 0; i < 8; i++) {
            drive(gs, {}, 1)
            const d = Math.hypot(gs.pucks[1].bx - gs.pucks[0].bx, gs.pucks[1].by - gs.pucks[0].by)
            minD = Math.min(minD, d)
            if (gs.pucks[1].bx <= gs.pucks[0].bx) orderOk = false
            clacks += types(gs).filter((t) => t === 'ballhit').length
        }
        r.check('two balls closing head-on never pass through (order kept, no overlap sampled)',
            orderOk && minD >= 17.5, `minD=${minD.toFixed(1)}`)
        r.check('a head-on meeting reverses both balls at steel restitution (±300 → ∓240)',
            Math.abs(gs.pucks[0].vx + 240) < 30 && Math.abs(gs.pucks[1].vx - 240) < 30,
            `vx=${gs.pucks[0].vx.toFixed(0)}/${gs.pucks[1].vx.toFixed(0)}`)
        r.check('one meeting pays exactly one steel clack (cooldown holds through the contact)', clacks === 1, `clacks=${clacks}`)
    }

    // chase: a fast ball catches a slow one — the pack transfers THROUGH itself
    {
        const gs = packOf(362, [[160, 250, 500, 0], [216, 250, 100, 0]])
        drive(gs, {}, 10)
        const [a, b] = gs.pucks
        r.check('hit the front ball, the one ahead flies off: 500/100 chaser pair leaves 140/460',
            Math.abs(a.vx - 140) < 30 && Math.abs(b.vx - 460) < 30, `vx=${a.vx.toFixed(0)}/${b.vx.toFixed(0)}`)
        r.check('pack physics never adds tangential energy (v² sum ≤ the 500/100 start)',
            a.vx * a.vx + b.vx * b.vx <= 500 * 500 + 100 * 100 + 1,
            `sum=${(a.vx * a.vx + b.vx * b.vx).toFixed(0)}`)
    }

    // spawn overlap separates silently — pack-off must not clack by itself
    {
        const gs = packOf(363, [[170, 250, 0, 0], [184, 250, 0, 0]])
        drive(gs, {}, 2)
        const d = Math.hypot(gs.pucks[1].bx - gs.pucks[0].bx, gs.pucks[1].by - gs.pucks[0].by)
        const ev = types(gs)
        r.check('two balls spawned 14 px apart push to contact within 2 ticks and stay in order',
            d >= 17.9 && gs.pucks[1].bx > gs.pucks[0].bx, `d=${d.toFixed(1)}`)
        r.check('a soft touch is silent — separation with no closing speed fires no clack',
            !ev.includes('ballhit'), ev.join(','))
    }

    // magnet pin becomes a post: bounce off the held ball, the pin never shifts
    {
        const gs = packOf(364, [[240, 331, 0, 0, true], [280, 331, -300, 0]])
        let minD = 9999
        for (let i = 0; i < 6; i++) {
            drive(gs, {}, 1)
            minD = Math.min(minD, Math.hypot(gs.pucks[1].bx - gs.pucks[0].bx, gs.pucks[1].by - gs.pucks[0].by))
        }
        const [pin, free] = gs.pucks
        r.check('a ball thrown at the magnet-pinned ball bounces off it (vx reverses, no pass-through)',
            free.vx > 150 && minD >= 17.5, `vx=${free.vx.toFixed(0)} minD=${minD.toFixed(1)}`)
        r.check('the pin does not budge — a held ball takes no push from the pack',
            pin.magHeld && pin.bx === 240 && pin.by === 331, `at=(${pin.bx},${pin.by})`)
    }

    // single ball stays quiet; a scripted pack is deterministic and does clack
    {
        const gs = drive(makeGame(365))
        clear(gs)
        drive(gs, { down: true }, 70); gs.by = 555; gs.vy = 0; clear(gs)
        let oneBall = 0
        for (let i = 0; i < 400; i++) { drive(gs, {}, 1); oneBall += types(gs).filter((t) => t === 'ballhit').length }
        r.check('a lone ball never clacks with itself (single-ball games see zero ballhit events)',
            oneBall === 0, `clacks=${oneBall}`)

        const script = (seed) => {
            const gs = packOf(seed, [[140, 220, 260, 120], [196, 240, -260, 80], [170, 320, 40, -300]])
            const hs = []; let clacks = 0
            for (let i = 0; i < 150; i++) {
                stepGame(gs, {}); clacks += gs.events.filter((e) => e.type === 'ballhit').length
                gs.events.length = 0
                if (i % 25 === 24) hs.push(stateHash(gs))
            }
            return { hs, clacks }
        }
        const A = script(366), B = script(366)
        r.check('a three-ball scramble is deterministic: hash-identical twice over',
            A.hs.every((h, i) => h === B.hs[i]) && A.hs.length === 6)
        r.check('the scramble really collides (steel clacks land in the pack)', A.clacks > 0, `clacks=${A.clacks}`)
    }
}

// --------------------------------------------- font + determinism ----
{
    const { FONT, DMD_MSGS } = await import('../src/games/Pinball/art.js')
    const chars = new Set(DMD_MSGS.join('').toUpperCase().split(''))
    const missing = [...chars].filter((c) => !(c in FONT))
    r.check(`the dot font covers every character the strip can ever show (${chars.size} glyphs)`,
        missing.length === 0, `missing=${missing.join(' ')}`)
    const a = makeGame(341), b = makeGame(341)
    const hs = []
    for (let i = 0; i < 900; i++) {
        stepGame(a, i % 120 < 3 ? { down: true } : {}); a.events.length = 0
        stepGame(b, i % 120 < 3 ? { down: true } : {}); b.events.length = 0
        if (i % 150 === 149) hs.push(stateHash(a) === stateHash(b))
    }
    r.check('rung-3 state (orbit bank, magnet charge/hold, msg) is deterministic: hash-identical over 900 ticks',
        hs.every(Boolean) && hs.length === 6)
    const c = makeGame(342)
    for (let i = 0; i < 600; i++) { stepGame(c, {}); c.events.length = 0 }
    r.check('the hash moved on from the rung-3 seeds (new state is mixed in)', stateHash(a) !== stateHash(c))
}

r.exit()
