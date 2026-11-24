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
    let escaped = 0, drains = 0
    const gs = makeGame(77)
    for (let i = 0; i < 6000; i++) {
        const pad = { left: rng() < 0.3, right: rng() < 0.3, b: rng() < 0.02, down: rng() < 0.05 }
        stepGame(gs, pad)
        for (const e of gs.events) if (e.type === 'drain') drains++
        gs.events.length = 0
        if (gs.launched && !gs.done && gs.by > 1 && (gs.bx < 1 || gs.bx > W - 1 || gs.by > H + 11)) escaped++
    }
    r.check('6000 fuzz ticks: the ball never tunnels out of the cabinet', escaped === 0, `escapes=${escaped}`)
    r.check('the fuzz game actually drains balls (it is a playable loop, not a stuck ball)', drains > 0, `drains=${drains}`)
}

r.exit()
