// pinballcheck — PINBALL / CABINET ONE (issue #3103 rung 1), audited in plain
// Node against the SAME sim.js the tab runs (zero DOM, zero Math.random).
// Expectations are LITERAL numbers, not the sim's own constants — a check that
// imports the number it audits cannot see the number change (the TETRIS lesson).
//
// Run: npm run pinballcheck                  (green)
//      node scripts/pinballcheck.mjs --mutate          (all rules in fresh children, #601)
//      node scripts/pinballcheck.mjs --mutate=economy  (one rule; the check MUST go red)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Report } from './lib/harness.mjs'
import { plant, restoreAll } from './lib/mutateguard.mjs'

// --mutate [rule] plants one load-bearing break in sim.js; the check MUST see
// red. Bare --mutate (nightly form, #601) runs every rule in fresh children.
const MUTI = process.argv.indexOf('--mutate')
const mutEq = process.argv.find((a) => a.startsWith('--mutate='))
const MUT = mutEq ? mutEq.split('=')[1] : (MUTI > -1 ? process.argv[MUTI + 1] || null : null)
if (MUTI > -1 && !MUT) {
    let died = 0
    const RULES = ['seed', 'economy', 'mirror', 'search', 'kickback', 'skin', 'demo', 'smithzone', 'smithload', 'tiltnudge', 'powerzone', 'solo', 'seam', 'mix', 'packmagnet', 'magspent', 'magclock', 'magstall', 'magrearm']
    for (const rule of RULES) {
        const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--mutate=${rule}`], { encoding: 'utf8' })
        // child convention at EOF: exit 0 = the rule broke and the check saw red
        if (res.status === 0) { died++; console.log(`mutant dies: ${rule}`) }
        else console.log(`mutant SURVIVES: ${rule} — check is toothless\n${res.stdout?.split('\n').slice(-4).join('\n')}`)
    }
    console.log(died === RULES.length ? `ALL MUTANTS CAUGHT (${died}/${RULES.length})` : `${died}/${RULES.length} mutants caught`)
    process.exit(died === RULES.length ? 0 : 1)
}
if (MUT) {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const ANCHORS = {
        // every seed deals the SAME table — determinism's "divergent seeds" pins die.
        seed: { from: 'mulberry32((seed >>> 0) ^ 0x9e3779b9)', to: 'mulberry32(0x9e3779b9)', note: 'seed ignored — every seed deals the same table' },
        // EMBER RIDER pays CABINET ONE's jackpots — the two cabinets are one table.
        economy: { from: 'lock: 400, multiball: 1200,', to: 'lock: 500, multiball: 1000,', note: 'EMBER RIDER jackpots copied from CABINET ONE' },
        // mbKick 0 stops mirroring — cabinet two is no longer an x-mirror build.
        mirror: { from: '{ x: 75, y: 170, vx: 80, vy: -160 },', to: '{ x: 93, y: 170, vx: 80, vy: -160 },', note: 'ember mbKick 0 breaks its mirror' },
        // the ball search never ends a stalled ball — a rare rest position wedges the game open.
        search: { from: 'if (p.stall > 1200) p.drain = true;', to: 'if (p.stall > 100000) p.drain = true;', note: 'ball search never drains a stalled ball' },
        // the kickback solenoid seizes — the free save never fires (#3250).
        kickback: { from: 'p.vy > KB.minVy &&', to: 'p.vy > KB.minVy * 20 &&', note: 'kickback plunger seizes — the save never fires' },
        // a renamed palette key silently paints a hole in the TOXIC kit — the
        // key-parity law (#3259) must catch it. Targets art.js, not sim.js.
        skin: {
            file: 'src/games/Pinball/art.js',
            from: "    hotRgb: '255,159,28',\n    magRgb: '69,201,255',",
            to: "    hotRgbX: '255,159,28',\n    magRgb: '69,201,255',",
            note: 'TOXIC kit loses its hotRgb key — the renderer would paint undefined',
        },
        // the attract demo bot stops plunging — the machine never plays itself
        // and never reaches MULTIBALL; the show-off pins must catch it.
        demo: {
            file: 'src/games/Pinball/sim.js',
            from: '? { down: true } : {};',
            to: '? {} : {};',
            note: 'demoPad never pulls the plunger — the attract show-off is a screensaver',
        },
        // smith zone law relaxed — an out-of-dome bumper would ship and jam the dome.
        smithzone: {
            file: 'src/games/Pinball/sim.js',
            from: "if (x < L.domX[0] || x > L.domX[1] || y < L.domY[0] || y > L.domY[1]) return 'BUMPER OUT OF ZONE'",
            to: "if (x < -900 || x > 9900 || y < -900 || y > 9900) return 'BUMPER OUT OF ZONE'",
            note: 'smith bumper zone check opens wide — illegal layouts would compile playable',
        },
        // makeGame stops accepting table objects — a smithed cabinet silently
        // plays CABINET ONE while the marquee lies about its name.
        smithload: {
            file: 'src/games/Pinball/sim.js',
            from: 'const tb = cab && typeof cab === \'object\' ? cab : (CABINETS[cab] || TABLE)',
            to: 'const tb = CABINETS[cab] || TABLE',
            note: 'makeGame ignores compiled smith tables — the player-built cabinet is a lie',
        },
        // the tilt impulse forgets its latch — a held lean re-nudges every
        // sample and farms the 3-strike tilt-out (#3237 honesty law).
        // the three-step zone ticks go silent — the pull again reads as one
        // smooth blur and the meter steps never light (#3297).
        powerzone: {
            file: 'src/games/Pinball/sim.js',
            from: 'if (zone > gs.powerZone) {',
            to: 'if (zone > 99) {',
            note: 'power-zone ticks never emit — the three-step pull is gone',
        },
        // the solo bed forgets the pack — two beds would fight over one bus the
        // moment MULTIBALL lands, and the #3178 exclusivity law is the contract
        // the mb pin checks (#3304).
        solo: {
            file: 'src/games/Pinball/sim.js',
            from: 'if (gs.done || gs.multiball) return 0;',
            to: 'if (gs.done) return 0;',
            note: 'solo bed ignores MULTIBALL — the pack and the ostinato fight on one bus',
        },
        // the seam glide collapses to the old splice — the dip never happens and
        // the record-skip #3313 item 1 killed is back (the seam pin is toothed).
        seam: {
            file: 'src/games/Pinball/index.jsx',
            from: 'else if (bedOn && !mbBedRef.current) { audioController.setMusicLevel(0.001); bedSeamRef.current = { left: 150 } }',
            to: 'else if (bedOn && !mbBedRef.current) { audioController.startMusic(\'pinballMb\'); audioController.setMusicLevel(0.55); mbBedRef.current = true; soloBedRef.current = 0 }',
            note: 'seam glide removed at pack arrival — track splices without dipping the bus',
        },
        tiltnudge: {
            file: 'src/games/Pinball/sim.js',
            from: 'if (!latched && Math.abs(x) >= law.fire) { fire = true; latched = true; }',
            to: 'if (Math.abs(x) >= law.fire) { fire = true; latched = true; }',
            note: 'tilt latch dropped — holding the phone sideways spams nudges into a free TILT',
        },
        // the mid voice is muted in the scheduler while the track data keeps
        // its line — the phone loses its carrier leg and the bed drowns again
        // (#3336). The wiring pin reads the real schedule line, so a silent
        // voice cannot hide behind intact data.
        mix: {
            file: 'src/utils/AudioController.js',
            from: 'const mn = P.mid && P.mid[i]',
            to: 'const mn = false && P.mid[i]',
            note: 'mid voice muted in _schedule — the phone-band line never sounds',
        },
        // #3422 the coil dies at the first grab again — the pack sails past a
        // live magnet and only one ball per drive ever gets caught.
        packmagnet: {
            file: 'src/games/Pinball/sim.js',
            from: 'if (!b.magHeld && (b.magHoldT ?? 0) >= 0 && (gs.magCharge > 0 || gs.magHold > 0)) {',
            to: 'if (!b.magHeld && (b.magHoldT ?? 0) >= 0 && gs.magCharge > 0) {',
            note: 'magnet de-energises at the first grab — a second ball never pins while one is held',
        },
        // the per-puck clock collapses onto one shared freeze: no snap can drop
        // while another pin still rides, so the pack hangs on the post forever.
        magclock: {
            file: 'src/games/Pinball/sim.js',
            from: '        if (hp.magHoldT > 0) continue;',
            to: '        if (hp.magHoldT > 0 || gs.pucks.some((p) => p.magHeld && p !== hp)) continue;',
            note: 'a held ball cannot snap while another ball rides the coil',
        },
        // the spent marker is dropped — a snapped ball re-rides the same drive
        // and the magnet farms holds for free.
        magspent: {
            file: 'src/games/Pinball/sim.js',
            from: 'hp.magHeld = false; hp.magHoldT = -1;',
            to: 'hp.magHeld = false; hp.magHoldT = 0;',
            note: 'spent marker never set — a snapped ball re-grabs on the same energised drive',
        },
        // the re-arm forgets its balls: the coil lights up but every ball still
        // carries the spent mark, so the magnet reads armed and catches nothing.
        magrearm: {
            file: 'src/games/Pinball/sim.js',
            from: 'for (const p of gs.pucks) if (!p.magHeld && p.magHoldT != null && p.magHoldT < 0) p.magHoldT = 0;',
            to: 'for (const p of gs.pucks) if (!p.magHeld && p.magHoldT != null && p.magHoldT < 0) p.magHoldT = -1;',
            note: 're-arm leaves the spent marks on the balls still riding the table',
        },
        // ball search freezes game-wide again — a motionless ball off the post
        // can never be searched out while the magnet holds, wedging the pack.
        magstall: {
            file: 'src/games/Pinball/sim.js',
            from: 'const stallExempt = p.magHeld || p.cap ||',
            to: 'const stallExempt = gs.magHold > 0 || p.cap ||',
            note: 'stall exemption goes game-wide — a stuck free ball never counts during any hold',
        },
    }
    const a = ANCHORS[MUT]
    if (!a) { console.error(`unknown mutant '${MUT}' (have: ${Object.keys(ANCHORS).join(', ')})`); process.exit(1) }
    const target = join(root, a.file || 'src/games/Pinball/sim.js')
    const src = readFileSync(target, 'utf8')
    if (!src.includes(a.from)) { console.error(`mutant anchor missing in ${a.file || 'sim.js'} (${MUT})`); process.exit(1) }
    plant(target, src.replace(a.from, a.to))
    console.log(`[mutant] ${a.note} — check must go red`)
}

const { makeGame, stepGame, stateOf, stateHash, resetBall, TABLE, W, H, BALL_R, mulberry32, demoPad, demoOver, compileTable, sanitizeDef, SMITH_REFS, SMITH_LIMITS, bumperZoneOk, zoneGuidePath, tiltImpulse, TILT_NUDGE, soloBed, SOLO_FLOOR, SOLO_BASE, SOLO_CAP, SOLO_HEAT_AT } = await import('../src/games/Pinball/sim.js')
const { SKINS, skinsFor, skinAt, parseStyle, styleIndex, PAL, PAL_EMBER, PAL_TIDE, PAL_TOXIC, kitIndex, styleWarn, KIT_STORE, ATTRACT_DMD, FONT, textFit, marqueeFit } = await import('../src/games/Pinball/art.js')

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

// -------------------------------- #3297: plunger 3-step power zones ----
{
    const gs = drive(makeGame(25)); gs.launched = false; clear(gs)
    drive(gs, { down: true }, 70)                      // full pull
    const ev = clear(gs).filter((e) => e.type === 'powerzone')
    r.check('a full pull emits LIGHT/FIRM/MAX ticks in order, once each',
        ev.length === 3 && ev[0].zone === 1 && ev[1].zone === 2 && ev[2].zone === 3,
        `zones=${ev.map((e) => e.zone).join(',')}`)
    const step = TABLE.plunger.chargeRate / 60 // one tick of charge
    const zp = (i) => (ev[i] ? ev[i].power : NaN)
    r.check('zone boundaries land on 1/3, 2/3 and full power',
        ev.length === 3 && Math.abs(zp(0) - 1 / 3) <= step * 2 && Math.abs(zp(1) - 2 / 3) <= step * 2 && zp(2) >= 0.999,
        `p=${ev.map((e) => e.power.toFixed(3)).join(',')}`)
    drive(gs, {}, 1)                                   // release
    r.check('the zone counter resets on plunge (physics of the release untouched)',
        types(gs).includes('plunge') && gs.powerZone === 0, `zone=${gs.powerZone}`)
    const gs2 = drive(makeGame(27)); gs2.launched = false; clear(gs2)
    drive(gs2, { down: true }, 10)                    // power 0.225 < 1/3
    r.check('a soft pull stays silent: below the first third, no zone ticks',
        !types(gs2).includes('powerzone'), `p=${gs2.power.toFixed(2)}`)
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
    drive(gs, {}, 2); drive(gs, { b: true }, 3)
    const warnEv = clear(gs).filter((e) => e.type === 'tiltwarn')   // nudge 2 -> warn
    drive(gs, {}, 2); drive(gs, { b: true }, 3); clear(gs)   // nudge 3 -> TILT
    r.check('three quick nudges TILT the machine', gs.tilt)
    r.check('#3297 the wobble cue lands once, on the penultimate nudge (tiltwarn)',
        warnEv.length === 1, `warnEv=${warnEv.length}`)
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

// --------------------------------------------- tilt-to-nudge (#3237) ----
{
    // the shell maps a screen-rotated lean through this law (padTypes.tiltVec
    // → tiltImpulse): crossing fire nudges ONCE, a held lean never re-fires
    // (no farming the tilt-out), a return inside dead re-arms. Mirrored both
    // ways — the cabinet does not care which way you nudge.
    const F = TILT_NUDGE.fire
    const a1 = tiltImpulse(F + 0.2, false)
    r.check('lean past the line fires exactly one nudge and latches', a1.fire && a1.latched)
    const a2 = tiltImpulse(F + 0.2, a1.latched)
    r.check('the held lean never re-nudges (tilt-out cannot be farmed)', !a2.fire && a2.latched)
    const a3 = tiltImpulse(TILT_NUDGE.rearm - 0.02, a2.latched)
    r.check('returning inside the dead zone re-arms the lean', !a3.fire && !a3.latched)
    const a4 = tiltImpulse(-(F + 0.2), a3.latched)
    r.check('the other direction fires too (mirrored law)', a4.fire && a4.latched)
    r.check('drift inside the dead zone never fires', !tiltImpulse(0.05, false).fire && !tiltImpulse(-TILT_NUDGE.rearm, false).fire)
    r.check('the fire line sits at ~8° of lean', F * 14 >= 7 && F * 14 <= 9, `${(F * 14).toFixed(1)}°`)
    // an end-to-end walk of the law through the SIM: each lean is a full
    // tilt-and-return cycle and pays exactly one nudge; the third TILT-out
    // rides the same three-strike law as the button.
    const gs = makeGame(77); gs.launched = true
    setBall(gs, 180, 400, 0, 0); clear(gs)
    let latch = false
    const lean = () => {
        const p = tiltImpulse(F + 0.3, latch); latch = p.latched
        if (p.fire) { drive(gs, { b: true }, 2); drive(gs, {}, 1) }
        latch = tiltImpulse(0, latch).latched          // swing back to level
        return p.fire
    }
    lean(); const w = gs.nudgeMeter === 1
    lean()
    r.check('lean pulses drive the sim: two nudges bank, meter reads true', gs.nudgeMeter === 2 && w, `meter=${gs.nudgeMeter}`)
    lean()
    r.check('the third lean lands the machine in TILT (same law as B)', gs.tilt)
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

// -------------------------------------- rollover pitch-ladder source (#3178) ----
{
    // The shell voices each LANE rollover at 1240 + 240*i Hz so the firelane
    // descent teaches its own progress by ear. The ladder rides on the event's
    // rollover index — pin that one descent delivers all three indices in order.
    const gs = makeGame(204); rung2Ball(gs, 310, 170, 0, 200); clear(gs)
    const idx = []
    for (let i = 0; i < 40 && idx.length < 3; i++) {
        stepGame(gs, {}); clear(gs).forEach((e) => { if (e.type === 'lane') idx.push(e.i) })
    }
    r.check('one descent rolls all three LANE rollovers as ascending indices 0,1,2 (the pitch-ladder source)',
        idx.join(',') === '0,1,2', idx.join(','))
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

// ----------------------------------------- MULTIBALL bed seam (#3178) ----
{
    // The shell keys the MULTIBALL tension bed (MUSIC.pinballMb) off gs.multiball
    // and cuts it when the pack goes home — pause and game-over included. The
    // AudioController cannot run in Node, but its trigger can: pin that the
    // `multiball` event rides the same step as the flag RISES and `packend`
    // the same step as it FALLS, or the bed strands a loop (or never starts).
    const gs = makeGame(232)
    let rise = -1, fall = -1
    rollToLock(gs); rollToLock(gs)
    // third lock under watch — the pack-off edge must be visible with the flag
    rung2Ball(gs, 310, 235, 0, 160); clear(gs)
    for (let i = 0; i < 90 && rise < 0; i++) {
        drive(gs, {}, 1)
        if (types(gs).includes('multiball') && gs.multiball) rise = gs.tick
    }
    r.check('the multiball event rides the same step the pack goes live (bed-start seam)',
        rise > 0 && gs.locks === 0 && gs.pucks.length === 3, `rise=${rise} pucks=${gs.pucks.length}`)
    // send the pack home and catch the stop edge
    gs.saveUsed = true
    let guard = 0
    while (gs.multiball && gs.pucks.length > 1 && guard++ < 1000) {
        gs.pucks.forEach((p, i) => { if (i === 0) { p.by = 999 } else { p.bx = 90 + i * 60; p.by = 420; p.vx = 0; p.vy = 0 } })
        stepGame(gs, {})
        if (types(gs).includes('packend') && !gs.multiball) fall = gs.tick
    }
    r.check('the packend event rides the same step the pack ends (bed-stop seam)',
        fall > rise && !gs.multiball, `fall=${fall} rise=${rise}`)
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

// ======================================= the pack magnet (#3422) ----
// Real machines run the magnet coil per PACK: while a hold is live the field
// stays energised, every ball that finds the post face pins on its own clock
// and pays its own snap; a ball never rides the same drive twice; the ball
// search exempts each pinned ball individually, never the whole table.
{
    const MG = TABLE.magnet
    const mkPuck = (x, y, vx, vy) => ({ bx: x, by: y, vx, vy, prevY: y, launched: true, laneCurved: false,
        spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false, magHoldT: 0 })

    // CABINET ONE, multiball-shaped: first ball pinned top-face, second driven
    // at the free side face while the coil is hot.
    const gs = makeGame(342)
    rung3Ball(gs, MG.x, MG.y - 40, 0, 60)
    const score0 = gs.score
    let grabs = 0, snaps = 0, bothTicks = 0, injected = false, heldBothAtGrab2 = false
    let clockAfterFirstSnap = -1, multSeen = 0
    for (let i = 0; i < 320; i++) {
        drive(gs, {}, 1)
        const t = types(gs)
        grabs += t.filter((x) => x === 'maggrab').length
        snaps += t.filter((x) => x === 'magfree').length
        const held = gs.pucks.filter((p) => p.magHeld).length
        if (held >= 2) bothTicks++
        if (grabs === 2 && !heldBothAtGrab2) heldBothAtGrab2 = held >= 2
        if (snaps === 1 && clockAfterFirstSnap < 0) clockAfterFirstSnap = gs.magHold
        if (snaps === 2) { multSeen = gs.mult; break }
        if (!injected && grabs === 1) {
            injected = true
            gs.pucks.push(mkPuck(MG.x + 32, MG.y + 4, -320, 0))   // the pack's second ball drives the free face
        }
    }
    r.check('#3422 the live coil catches the pack: a second ball pins while the first is held (two grabs, shared faces)',
        grabs === 2 && heldBothAtGrab2 && bothTicks > 0, `grabs=${grabs} both=${bothTicks}`)
    r.check('#3422 each pin holds its own clock and snaps with its own payout (2 × magnet at mult 1)',
        snaps === 2 && multSeen === 1 && gs.score - score0 === 2 * TABLE.rules.magnet,
        `snaps=${snaps} mult=${multSeen} paid=${gs.score - score0}`)
    r.check('#3422 the episode clock survives the first snap — the coil stays energised till the LAST ball drops',
        clockAfterFirstSnap > 0, `magHold@snap1=${clockAfterFirstSnap}`)
    // after the snaps both balls ride the field (the top pin sits 19 px off the
    // post centre — well inside the 33 px reach) yet neither may re-ride the
    // dead drive: the spent marker (magHoldT < 0) must refuse re-grabs.
    const grabsEnd = grabs
    for (let i = 0; i < 60; i++) {
        drive(gs, {}, 1)
        grabs += types(gs).filter((x) => x === 'maggrab').length
    }
    r.check('#3422 a snapped ball never rides the same drive twice (drifting through the live field, no re-grab)',
        grabs === grabsEnd, `grabs ${grabsEnd}→${grabs}`)

    // per-ball ball-search exemption: a motionless FREE ball counts its stall
    // while the coil holds ANOTHER ball (the old game-wide exemption froze it).
    const gs4 = makeGame(343)
    rung3Ball(gs4, MG.x, MG.y - 40, 0, 60)
    let inj4 = false, stallMax = 0
    for (let i = 0; i < 100; i++) {
        drive(gs4, {}, 1); types(gs4)
        if (!inj4 && gs4.magHold > 0) { inj4 = true; gs4.pucks.push(mkPuck(120, 400, 0, 0)) }
        const f = gs4.pucks[1]
        // count ONLY inside the hot window — after the coil dies every version
        // counts stalls, so a sample from there has no teeth (#3422)
        if (f) { f.vx = 0; f.vy = 0; if (gs4.magHold > 0) stallMax = Math.max(stallMax, f.stall || 0) }
    }
    r.check('#3422 ball search is per-ball: a motionless free ball counts stall while the coil holds another',
        stallMax >= 10, `stall=${stallMax}`)
    const heldPin = gs4.pucks[0]
    r.check('#3422 the pinned ball itself stays exempt (a catch is never a stall)',
        heldPin && heldPin.stall === 0, `stall=${heldPin && heldPin.stall}`)

    // re-arm clears the spent marker of a ball STILL RIDING THE TABLE: pin the
    // pack (two grabs), let both snap for real (both carry magHoldT −1), then
    // drain one — that drain re-arms the coil (touch law) and must re-arm the
    // survivor too (#3422).
    const gs5 = makeGame(344)
    gs5.multiball = true; gs5.saveUsed = true; gs5.saveT = 0
    rung3Ball(gs5, MG.x, MG.y - 40, 0, 60)
    let snaps5 = 0, inj5 = false
    const a5 = gs5.pucks[0]
    for (let i = 0; i < 200 && snaps5 < 2; i++) {
        drive(gs5, {}, 1)
        const t = types(gs5)
        snaps5 += t.filter((x) => x === 'magfree').length
        if (!inj5 && gs5.magHold > 0) { inj5 = true; gs5.pucks.push(mkPuck(MG.x + 32, MG.y + 4, -320, 0)) }
    }
    const w5 = gs5.pucks.find((p) => p.magHoldT === -1)
    r.check('#3422 setup: both pack balls really snapped spent (both carry the −1 marker)',
        snaps5 === 2 && gs5.pucks.filter((p) => p.magHoldT === -1).length === 2, `snaps=${snaps5}`)
    if (w5) {
        const other = gs5.pucks.find((p) => p !== w5)
        if (other) { other.bx = 150; other.by = TABLE.drainY + 5 }   // drain the OTHER ball
        drive(gs5, {}, 2); types(gs5)
        // the proof is the RE-CATCH: w5 is still inside the field, and catching
        // it again required BOTH laws at once — the drain re-armed the coil
        // (charge gate) AND re-armed the ball (spent marker cleared).
        r.check('#3422 a drain re-arms the coil AND its balls: the spent survivor is catchable again mid-field',
            gs5.pucks.length === 1 && gs5.pucks.includes(w5) && w5.magHeld === true && w5.magHoldT > 0,
            `packs=${gs5.pucks.length} held=${w5.magHeld} holdT=${w5.magHoldT}`)
    }
}

// ---- #3422 the orbit lane is per-ball — verified, not assumed ----
// The gap claimed the orbit ran one loop at a time; the arm/curl/done flags
// were already per-puck. This pins that truth so a later refactor cannot
// silently regress it: two balls in the channel arm and score independently.
{
    const gs = makeGame(345)
    rung3Ball(gs, 20, 498, TABLE.kicker.vx, TABLE.kicker.vy)
    let arms = 0, orbs = 0, inj = false
    for (let i = 0; i < 500 && !(inj && orbs >= 2); i++) {
        drive(gs, {}, 1)
        const t = types(gs)
        arms += t.filter((x) => x === 'orbitarm').length
        orbs += t.filter((x) => x === 'orbit').length
        if (!inj && t.includes('orbitarm')) { inj = true; gs.pucks.push({ bx: 20, by: 498, vx: TABLE.kicker.vx, vy: TABLE.kicker.vy, prevY: 498, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false, magHoldT: 0 }) }
    }
    r.check('#3422 the orbit lane is per-ball: two wrapped balls arm twice, score twice, bank twice',
        arms === 2 && orbs === 2 && gs.orbits === 2 && gs.orbitBank === 2,
        `arms=${arms} orbs=${orbs} bank=${gs.orbitBank}`)
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

// =============== #3232: CABINET TWO "EMBER RIDER" — MIRROR PROOF ===============
// The second cabinet is a mirror build: it adds NO physics, only data. So the
// two proofs are (1) the DATA is exactly the x-mirror of CABINET ONE, and
// (2) the ENGINE is x-mirror equivariant: same seed + mirrored inputs ⇒
// mirrored states, identical event type inventory. Together they certify
// EMBER RIDER without re-tuning a single constant. Rules differ by design.
{
    const { TABLE_TWO: T2, cabIndexOf } = await import('../src/games/Pinball/sim.js')
    const T1 = TABLE
    const mx = (x) => W - x
    // --- 1. structural mirror: every coordinate of T2 mirrors T1's
    const wallsMirrored = T1.walls.length === T2.walls.length && T1.walls.every((w, i) => {
        const m = T2.walls[i]
        const geom = (Math.abs(mx(w.x1) - m.x1) < 1e-9 && Math.abs(mx(w.x2) - m.x2) < 1e-9 && w.y1 === m.y1 && w.y2 === m.y2) ||
            (Math.abs(mx(w.x2) - m.x1) < 1e-9 && Math.abs(mx(w.x1) - m.x2) < 1e-9 && w.y1 === m.y1 && w.y2 === m.y2)
        if (!geom || !!w.oneWay !== !!m.oneWay) return false
        if (!w.oneWay) return true
        // the one-way FACE must mirror too: n = (dy,-dx); mirror n → (-nx, ny)
        const n1x = w.y2 - w.y1, n1y = -(w.x2 - w.x1)
        const n2x = m.y2 - m.y1, n2y = -(m.x2 - m.x1)
        return Math.abs(n2x + n1x) < 1e-9 && Math.abs(n2y - n1y) < 1e-9
    })
    r.check('every wall of EMBER RIDER is the x-mirror of CABINET ONE (one-way faces included)', wallsMirrored)
    r.check('outlane guide mirrors (endpoint set)', (() => {
        const q = (x, y) => `${Math.round(mx(x) * 1000)},${y}`
        const u = (x, y) => `${Math.round(x * 1000)},${y}`
        const a = new Set([q(T1.outlaneGuide.x1, T1.outlaneGuide.y1), q(T1.outlaneGuide.x2, T1.outlaneGuide.y2)])
        const b = new Set([u(T2.outlaneGuide.x1, T2.outlaneGuide.y1), u(T2.outlaneGuide.x2, T2.outlaneGuide.y2)])
        return [...a].sort().join() === [...b].sort().join()
    })())
    r.check('bumpers/slings/targets/magnet mirror element-for-element',
        T1.bumpers.every((b, i) => Math.abs(mx(b.x) - T2.bumpers[i].x) < 1e-9 && b.y === T2.bumpers[i].y && b.r === T2.bumpers[i].r) &&
        T1.slings.every((s, i) => Math.abs(mx(s.x1) - T2.slings[i].x1) < 1e-9 && Math.abs(mx(s.x2) - T2.slings[i].x2) < 1e-9 && s.y1 === T2.slings[i].y1) &&
        T1.targets.every((t, i) => Math.abs(mx(t.x2) - T2.targets[i].x1) < 1e-9 && Math.abs(mx(t.x1) - T2.targets[i].x2) < 1e-9) &&
        T1.targetY === T2.targetY && Math.abs(mx(T1.magnet.x) - T2.magnet.x) < 1e-9 && T1.magnet.y === T2.magnet.y)
    r.check('lane/firelane/lock/spinner/kicker/orbit zones mirror with direction flipped',
        Math.abs(mx(T1.lane.innerX) - T2.lane.innerX) < 1e-9 && T1.lane.side === -T2.lane.side && T1.lane.bottomY === T2.lane.bottomY &&
        Math.abs(T1.lane.curlVx + T2.lane.curlVx) < 1e-9 &&
        Math.abs(mx(T1.lane.rampZone.x2) - T2.lane.rampZone.x1) < 1e-9 && Math.abs(mx(T1.lane.rampZone.x1) - T2.lane.rampZone.x2) < 1e-9 &&
        Math.abs(mx(T1.laneX.x2) - T2.laneX.x1) < 1e-9 && Math.abs(mx(T1.laneX.x1) - T2.laneX.x2) < 1e-9 &&
        Math.abs(mx(T1.lock.x2) - T2.lock.x1) < 1e-9 && Math.abs(mx(T1.lock.x1) - T2.lock.x2) < 1e-9 && T1.lock.yAt === T2.lock.yAt && T1.lock.need === T2.lock.need &&
        T1.spinner.xMax === mx(T2.spinner.xMax) && T1.spinner.side === -T2.spinner.side && T1.spinner.yFrom === T2.spinner.yFrom &&
        T1.kicker.xMax === mx(T2.kicker.xMax) && T1.kicker.side === -T2.kicker.side && Math.abs(T1.kicker.vx + T2.kicker.vx) < 1e-9 && T1.kicker.vy === T2.kicker.vy &&
        Math.abs(mx(T1.orbit.armPad.x) - T2.orbit.armPad.x) < 1e-9 && T1.orbit.armPad.y === T2.orbit.armPad.y &&
        Math.abs(mx(T1.orbit.donePad.x) - T2.orbit.donePad.x) < 1e-9 && T1.orbit.donePad.y === T2.orbit.donePad.y &&
        Math.abs(mx(T1.orbit.curl.xMax) - T2.orbit.curl.xMax) < 1e-9 && T1.orbit.curl.side === -T2.orbit.curl.side && Math.abs(T1.orbit.curl.vx + T2.orbit.curl.vx) < 1e-9 &&
        Math.abs(mx(T1.orbit.ch.cx) - T2.orbit.ch.cx) < 1e-9 && T1.orbit.ch.side === -T2.orbit.ch.side && T1.orbit.need === T2.orbit.need)
    r.check('flippers mirror (pivots W-x, angles 180-x) and the plunger moves to the left lane',
        T2.flippers.L.px === mx(T1.flippers.R.px) && T2.flippers.R.px === mx(T1.flippers.L.px) &&
        Math.abs(T2.flippers.L.rest - (180 - T1.flippers.R.rest)) < 1e-9 && Math.abs(T2.flippers.L.up - (180 - T1.flippers.R.up)) < 1e-9 &&
        Math.abs(T2.flippers.R.rest - (180 - T1.flippers.L.rest)) < 1e-9 && Math.abs(T2.flippers.R.up - (180 - T1.flippers.L.up)) < 1e-9 &&
        T2.plunger.x === mx(T1.plunger.x) && T2.plunger.restY === T1.plunger.restY)
    r.check('EMBERS rules are its own hotter economy (literal, not derived)',
        T2.rules.bumper === 75 && T2.rules.sling === 30 && T2.rules.spinner === 15 && T2.rules.bankClear === 300 &&
        T2.rules.ramp === 30 && T2.rules.rampSet === 600 && T2.rules.lane === 30 && T2.rules.laneSweep === 150 &&
        T2.rules.lock === 400 && T2.rules.multiball === 1200 && T2.rules.orbit === 150 && T2.rules.orbitSet === 600 &&
        T2.rules.magnet === 75 && T2.rules.multCap === 4 && T2.saveTicks === 240 && T2.tilt.decayTicks === 42)
    r.check('state reports which cabinet it runs (cab pin) + cabIndexOf round-trips',
        stateOf(makeGame(1, 1)).cab === 'ember-rider' && stateOf(makeGame(1, 0)).cab === 'cabinet-one' &&
        cabIndexOf('ember-rider') === 1 && cabIndexOf('cabinet-one') === 0)
}

// --- 2. engine mirror equivariance: same seed, mirrored pads ⇒ mirrored states
{
    const { TABLE_TWO } = await import('../src/games/Pinball/sim.js')
    void TABLE_TWO
    const a = makeGame(7, 0), b = makeGame(7, 1)
    const typesA = [], typesB = []
    let worst = 0, worstLate = 0, divergeAt = -1, countersSplit = false
    let snapA = null, snapB = null
    const N = 1500
    for (let i = 0; i < N; i++) {
        // medium auto-plunge script, identical on both; flips would mirror too
        const pad = i % 90 < 4 ? { down: true } : {}
        stepGame(a, pad); stepGame(b, pad)
        if (i < 400) { typesA.push(...a.events.map((e) => e.type)); typesB.push(...b.events.map((e) => e.type)) }
        a.events.length = 0; b.events.length = 0
        if (i === 399 && a.pucks.length && b.pucks.length) {
            snapA = { balls: a.balls, locks: a.locks, targets: a.targetDown.join(''), spin: a.spinnerTurns, mult: a.mult }
            snapB = { balls: b.balls, locks: b.locks, targets: b.targetDown.join(''), spin: b.spinnerTurns, mult: b.mult }
        }
        if (a.pucks.length !== b.pucks.length) { divergeAt = i; countersSplit = true; continue }
        for (let k = 0; k < a.pucks.length; k++) {
            const pa = a.pucks[k], pb = b.pucks[k]
            const d = Math.max(Math.abs(pb.bx - (W - pa.bx)), Math.abs(pb.by - pa.by),
                Math.abs(pb.vx + pa.vx), Math.abs(pb.vy - pa.vy))
            if (i < 400) worst = Math.max(worst, d); else if (!countersSplit) worstLate = Math.max(worstLate, d)
        }
        if (a.balls !== b.balls || a.locks !== b.locks || a.multiball !== b.multiball) countersSplit = true
        if (i < 400) worst = Math.max(worst, Math.abs(a.ang.L - (180 - b.ang.R)), Math.abs(a.ang.R - (180 - b.ang.L)))
    }
    const sortedEq = (x, y) => x.length === y.length && x.slice().sort().join() === y.slice().sort().join()
    r.check('mirror equivariance: identical seed + mirrored pads ⇒ puck states mirror over the first 400 ticks',
        worst < 1e-6, `worst=${worst.toExponential(2)} px`)
    r.check('the mirrored runs see IDENTICAL event inventories over the first 400 ticks',
        sortedEq(typesA, typesB) && typesA.includes('plunge') && typesA.includes('lock'),
        `n=${typesA.length}/${typesB.length}`)
    r.check('and identical match-state counters at tick 400',
        snapA.balls === snapB.balls && snapA.locks === snapB.locks && snapA.targets === snapB.targets &&
        snapA.spin === snapB.spin && snapA.mult === snapB.mult,
        `balls=${snapA.balls}/${snapB.balls} locks=${snapA.locks}/${snapB.locks} spin=${snapA.spin}/${snapB.spin}`)
    // The physics is x-mirror equivariant at ulp level (1e-7 px after 400 ticks);
    // pinball is chaotic, so a sub-nanometre deviation is all a marginal
    // bumper hit needs to fork the line. That is documented, not denied:
    r.check('documented chaos: while the match-state stays common, late deviations stay sub-micrometre',
        worstLate < 1e-6 || countersSplit, `late=${worstLate.toExponential(2)} splitAt=${divergeAt}`)
    // scores differ BY DESIGN — and the difference is explainable: ember pays
    // less per bumper but more per bank; the run must simply not be identical.
    r.check('ECONOMY pin: the two cabinets score different totals on the same line',
        a.score !== b.score, `cab-one=${a.score} ember=${b.score}`)
    r.check('mbKick mirrors position and horizontal kick',
        TABLE.mbKick.every((k, i) => Math.abs((W - k.x) - TABLE_TWO.mbKick[i].x) < 1e-9 && Math.abs(k.vx + TABLE_TWO.mbKick[i].vx) < 1e-9 && k.y === TABLE_TWO.mbKick[i].y))
}

// --- 3. the human line replays on EMBER RIDER (mirrored) ----
{
    const gs = makeGame(3169, 1)
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
    r.check('HUMAN LINE (ember): three medium left-lane plunges lock the tower and ignite MULTIBALL', mb, `mb=${mb}`)
    r.check('ember pays its own lock jackpot (400) before the pack', scoreAtLock >= 400, `first lock score=${scoreAtLock}`)
    r.check('the ember human line never leaves the table empty', empties === 0)
}

// --- 4. ember literal rules: magnet snap + chained wrap pay ember values ----
{
    const gs = makeGame(321, 1)
    rung3Ball(gs, 120, 310, 0, 60)   // ember magnet sits at (120,350)
    const seen = []
    for (let i = 0; i < 300 && !seen.includes('magfree'); i++) { drive(gs, {}, 1); seen.push(...types(gs)) }
    r.check('ember MAGNET grabs and snaps for +75 (its own price)',
        seen.includes('maggrab') && seen.includes('magfree') && gs.score === 75, `${seen.join(',')} score=${gs.score}`)
    const gw = makeGame(301, 1)
    // mirrored wrap feed: the ember kicker fires LEFT up the right rail
    rung3Ball(gw, 340, 498, -10, -880)
    const wseen = []
    for (let i = 0; i < 220 && !wseen.includes('orbit'); i++) { drive(gw, {}, 1); wseen.push(...types(gw)) }
    for (let i = 0; i < 150; i++) { drive(gw, {}, 1); wseen.push(...types(gw)) }
    r.check('a mirrored wrap on EMBER RIDER arms, completes and chains to the firelane lock',
        wseen.includes('orbitarm') && wseen.includes('curl') && wseen.includes('orbit') && wseen.includes('lane') && wseen.includes('lock'), wseen.join(','))
    r.check('that chained wrap pays exactly 790 ember (150+90+150+400)', gw.score === 790, `score=${gw.score}`)
}

// --- 5. cabinet-two determinism ----
{
    const run = (seed) => { const gs = makeGame(seed, 1); const hs = []; for (let i = 1; i <= 600; i++) { stepGame(gs, i % 90 < 4 ? { down: true } : {}); if (i % 100 === 0) hs.push(stateHash(gs)) } return hs }
    const a = run(41), b = run(41), c = run(42)
    r.check('EMBER RIDER is deterministic: same seed ⇒ hash-identical over 600 ticks', JSON.stringify(a) === JSON.stringify(b))
    r.check('different seeds diverge on ember too', JSON.stringify(a) !== JSON.stringify(c))
    r.check('the same seed on different cabinets gives different hashes (tables are not interchangeable)',
        run(41)[5] !== (() => { const gs = makeGame(41, 0); const hs = []; for (let i = 1; i <= 600; i++) { stepGame(gs, i % 90 < 4 ? { down: true } : {}); if (i % 100 === 0) hs.push(stateHash(gs)) } return hs })()[5])
}

// --- 6. ball search (#3232): a motionless ball cannot wedge a game open ----
{
    const gs = drive(makeGame(7))
    gs.bx = 100; gs.by = 250; gs.vx = 0; gs.vy = 0; gs.launched = true; clear(gs)
    gs.pucks[0].stall = 1200          // 20 world-s already counted motionless
    const balls = gs.balls
    drive(gs, {}, 1)
    r.check('BALL SEARCH: a ball stalled 20 world-s off lane/magnet drains on the next tick',
        gs.balls < balls || gs.done === true, `balls=${gs.balls}/${balls} done=${gs.done}`)
    const gs2 = drive(makeGame(8))
    gs2.bx = 100; gs2.by = 250; gs2.vx = 0; gs2.vy = 0; gs2.launched = true; clear(gs2)
    gs2.pucks[0].stall = 1199; gs2.pucks[0].magHeld = true; gs2.pucks[0].magHoldT = 5
    gs2.pucks[0].magX = 100; gs2.pucks[0].magY = 250; gs2.magHold = 5  // #3422: the episode clock is derived from the held puck
    drive(gs2, {}, 1)
    r.check('the search exempts a magnet-held ball (never eats a catch) and resets its counter',
        gs2.pucks[0] && gs2.pucks[0].stall === 0 && gs2.balls === gs2.table.balls, `stall=${gs2.pucks[0]?.stall} balls=${gs2.balls}`)
}

// --- 7. the seed is load-bearing ---- stateHash embeds gs.seed, so divergent
// hashes can prove nothing about the RNG. Compare the RAW physics line under a
// scripted nudge stream: the seeded jitter (sim.js rng() on nudge) must fork
// two seeds and repeat one seed exactly.
{
    const line = (seed) => {
        const gs = makeGame(seed); const ps = []; let nudges = 0
        for (let i = 1; i <= 500; i++) {
            let pad = {}
            if (i % 90 < 4) pad = { down: true }
            else if (gs.launched && nudges < 2 && i % 40 === 20) { nudges++; pad = { b: true } }
            stepGame(gs, pad)
            ps.push(gs.pucks.map((p) => `${p.bx.toFixed(6)}:${p.by.toFixed(6)}:${p.vx.toFixed(6)}`).join('|'))
        }
        return ps.join(';')
    }
    const l1 = line(71), l2 = line(71), l3 = line(72)
    r.check('same seed + same nudge script ⇒ bit-identical physics line', l1 === l2)
    r.check('different seeds ⇒ the seeded nudge jitter forks the physics line (seed is load-bearing)', l1 !== l3)
    const ln = (seed) => {
        const gs = makeGame(seed, 1); const ps = []; let nudges = 0
        for (let i = 1; i <= 500; i++) {
            let pad = {}
            if (i % 90 < 4) pad = { down: true }
            else if (gs.launched && nudges < 2 && i % 40 === 20) { nudges++; pad = { b: true } }
            stepGame(gs, pad)
            ps.push(gs.pucks.map((p) => `${p.bx.toFixed(6)}:${p.by.toFixed(6)}:${p.vx.toFixed(6)}`).join('|'))
        }
        return ps.join(';')
    }
    const ln1 = ln(41), ln2 = ln(41), ln3 = ln(42)
    r.check('the same fork exists on EMBER RIDER', ln1 === ln2 && ln1 !== ln3)
}

// --- 8. kickback (#3250): one free save per ball at the right drain column ----
{
    const { TABLE_TWO } = await import('../src/games/Pinball/sim.js')
    const mx = (x) => W - x
    const gs = drive(makeGame(120))
    setBall(gs, 196, 558, 0, 300); clear(gs)
    drive(gs, {}, 1)
    r.check('KICKBACK: a fast right-column descent is saved — fired back up, +100 literal',
        gs.events.some((e) => e.type === 'kickback') && gs.score === 100 && gs.vy < -800,
        `vy=${gs.vy.toFixed(0)} score=${gs.score}`)
    r.check('the save announces itself on the sim-owned DMD and reads spent in state',
        gs.msg.text === 'KICKBACK! +100' && gs.msg.t > 0 && stateOf(gs).kbUsed === true, gs.msg.text)
    const seen = []
    setBall(gs, 196, 552, 0, 300); clear(gs)
    for (let i = 0; i < 40; i++) { drive(gs, {}, 1); seen.push(...types(gs)) }
    r.check('one save per ball: the spent kickback lets the next right-column ball drain',
        !seen.includes('kickback') && seen.includes('drain'), seen.join(','))
    // the device re-arms with the next ball reset
    resetBall(gs); gs.kbFlash = 0
    setBall(gs, 196, 558, 0, 300); clear(gs)
    drive(gs, {}, 1)
    r.check('the kickback re-arms with every new ball', gs.events.some((e) => e.type === 'kickback'))
    // gate law: dead-centre deaths stay deaths; slow rests never launch
    const dc = drive(makeGame(122))
    setBall(dc, 184, 545, 0, 600); clear(dc)
    const dcSeen = []
    for (let i = 0; i < 30; i++) { drive(dc, {}, 1); dcSeen.push(...types(dc)) }
    r.check('a straight-CENTRE drain is not saved (the device guards its own column)',
        !dcSeen.includes('kickback') && dcSeen.includes('drain'), dcSeen.join(','))
    const rs = drive(makeGame(121))
    setBall(rs, 196, 598, 0, 0); clear(rs)
    drive(rs, {}, 12)
    r.check('a ball dying at rest in the pocket is never launched (minVy gate — search law intact)',
        rs.kbUsed === false && rs.balls < rs.table.balls, `kbUsed=${rs.kbUsed} balls=${rs.balls}`)
    // EMBER RIDER: mirrored column, its own hotter-priced save
    const em = drive(makeGame(123, 1))
    setBall(em, 163, 558, 0, 300); clear(em)
    drive(em, {}, 1)
    r.check('EMBER RIDER saves its mirrored column for its own price (+75, fired right)',
        em.events.some((e) => e.type === 'kickback') && em.score === 75 && em.vx > 0 && em.vy < -800,
        `vx=${em.vx.toFixed(0)} vy=${em.vy.toFixed(0)} score=${em.score}`)
    r.check('kickback zone mirrors with direction flipped (#3250)',
        Math.abs(mx(TABLE.kb.x2) - TABLE_TWO.kb.x1) < 1e-9 && Math.abs(mx(TABLE.kb.x1) - TABLE_TWO.kb.x2) < 1e-9 &&
        TABLE.kb.yFrom === TABLE_TWO.kb.yFrom && TABLE.kb.yTo === TABLE_TWO.kb.yTo &&
        TABLE.kb.minVy === TABLE_TWO.kb.minVy && Math.abs(TABLE.kb.vx + TABLE_TWO.kb.vx) < 1e-9 &&
        TABLE.kb.vy === TABLE_TWO.kb.vy)
}

// --- 8b. JET LANE + KICKBACK L (#3432): the left flank comes alive ----------
// The never-dry stage gave CABINET ONE a left ramp (two upward wires in the
// flank corridor) and a mirror kickback behind the left flipper tip, joined by
// the combo law (a flank SET re-arms the left save once). These pins hold the
// ladder, the per-side once-only law, the disjointness of the two columns, the
// wire zone gates, the mirror build on EMBER RIDER, and the observable state.
{
    const { TABLE_TWO } = await import('../src/games/Pinball/sim.js')
    const mx = (x) => W - x

    // structural: the mirror data law (same contract shape as #3250's)
    r.check('#3432 kbL + rampL mirror exactly between cabinets (zone flip, vx flip)',
        Math.abs(mx(TABLE.kbL.x2) - TABLE_TWO.kbL.x1) < 1e-9 && Math.abs(mx(TABLE.kbL.x1) - TABLE_TWO.kbL.x2) < 1e-9 &&
        TABLE.kbL.yFrom === TABLE_TWO.kbL.yFrom && TABLE.kbL.yTo === TABLE_TWO.kbL.yTo &&
        TABLE.kbL.minVy === TABLE_TWO.kbL.minVy && Math.abs(TABLE.kbL.vx + TABLE_TWO.kbL.vx) < 1e-9 &&
        TABLE.kbL.vy === TABLE_TWO.kbL.vy &&
        Math.abs(mx(TABLE.rampL.x2) - TABLE_TWO.rampL.x1) < 1e-9 && Math.abs(mx(TABLE.rampL.x1) - TABLE_TWO.rampL.x2) < 1e-9 &&
        JSON.stringify(TABLE.rampL.rolls) === JSON.stringify(TABLE_TWO.rampL.rolls))
    r.check('the two kickback columns are disjoint — one fall can never fire both',
        TABLE.kb.x1 > TABLE.kbL.x2 && TABLE_TWO.kbL.x1 > TABLE_TWO.kb.x2)

    // the left save: fire, price, direction, observable
    const gs = drive(makeGame(140))
    setBall(gs, 165, 556, 0, 300); clear(gs)
    drive(gs, {}, 1)
    r.check('KICKBACK L: a fast left-column descent is saved — +100 literal, fired up-RIGHT',
        gs.events.some((e) => e.type === 'kickback' && e.side === 'L') && gs.score === 100 && gs.vy < -800 && gs.vx > 0,
        `vy=${gs.vy.toFixed(0)} vx=${gs.vx.toFixed(0)} score=${gs.score}`)
    r.check('the left save reads spent in state (kbLUsed) and names itself on the DMD',
        stateOf(gs).kbLUsed === true && gs.msg.text === 'KICKBACK! +100', gs.msg.text)
    // once per SIDE: right kb stays live after the left save fires
    setBall(gs, 196, 558, 0, 300); clear(gs)
    drive(gs, {}, 1)
    r.check('a ball may be saved once per side — the right kickback stays live (#3432)',
        gs.events.some((e) => e.type === 'kickback' && e.side !== 'L') && gs.score === 200,
        `score=${gs.score}`)
    // spent both sides → the next fall in either column dies
    const spentSeen = []
    setBall(gs, 165, 556, 0, 300); clear(gs)
    for (let i = 0; i < 40; i++) { drive(gs, {}, 1); spentSeen.push(...types(gs)) }
    r.check('with both saves spent, the left column drains — one save per side per ball',
        !spentSeen.includes('kickback') && spentSeen.includes('drain'), spentSeen.join(','))
    // rests never launch (search law), per side
    const rs = drive(makeGame(141))
    setBall(rs, 163, 598, 0, 0); clear(rs)
    drive(rs, {}, 12)
    r.check('a resting ball never trips KICKBACK L (minVy gate — search law intact)',
        rs.kbLUsed === false && rs.balls < rs.table.balls, `kbLUsed=${rs.kbLUsed} balls=${rs.balls}`)

    // JET LANE wires: progress then SET, ladder literals (25 + 25 + 500)
    const jl = drive(makeGame(142))
    setBall(jl, 60, 380, 0, -200); clear(jl)          // apex ~358 → crosses only the lower wire
    const oneSeen = []
    for (let i = 0; i < 15; i++) { drive(jl, {}, 1); oneSeen.push(...types(jl)) }
    r.check('one flank wire pays 25 and lights progress — no SET yet',
        jl.score === 25 && jl.rampLHits === 1 && jl.rampLLit === false &&
        oneSeen.filter((t) => t === 'rampL').length === 1 && !oneSeen.includes('ramplset'),
        `score=${jl.score} hits=${jl.rampLHits} ${oneSeen.join(',')}`)
    setBall(jl, 60, 400, 0, -520); clear(jl)          // apex ~280 → crosses both wires
    const twoSeen = []
    for (let i = 0; i < 70; i++) { drive(jl, {}, 1); twoSeen.push(...types(jl)) }
    r.check('crossing both wires completes the SET — 2×25 + 500 and the DMD names it',
        jl.score === 575 && twoSeen.filter((t) => t === 'rampL').length === 2 &&
        twoSeen.includes('ramplset') && jl.rampLLit === true && jl.msg.text === 'RAMP L SET! +500',
        `score=${jl.score} msg=${jl.msg.text}`)
    r.check('the flank return runs down the LEFT half toward the spinner/kicker channel',
        jl.bx < 112 && jl.by > 380, `x=${jl.bx.toFixed(0)} y=${jl.by.toFixed(0)}`)
    // gates: outside the corridor UP, or inside DOWN, never score
    const gj = drive(makeGame(143))
    setBall(gj, 90, 430, 0, -520); clear(gj)
    const gjSeen = []
    for (let i = 0; i < 60; i++) { drive(gj, {}, 1); gjSeen.push(...types(gj)) }
    r.check('an upward crossing OUTSIDE the corridor never scores the flank ramp',
        !gjSeen.includes('rampL'), gjSeen.join(','))
    const gd = drive(makeGame(144))
    setBall(gd, 60, 280, 0, 300); clear(gd)
    const gdSeen = []
    for (let i = 0; i < 60; i++) { drive(gd, {}, 1); gdSeen.push(...types(gd)) }
    r.check('the wires are one-way law: a DOWNWARD pass through the corridor never scores',
        !gdSeen.includes('rampL'), gdSeen.join(','))
    const gl = drive(makeGame(145))
    setBall(gl, 336, 430, 0, -520); clear(gl)
    const glSeen = []
    for (let i = 0; i < 60; i++) { drive(gl, {}, 1); glSeen.push(...types(gl)) }
    r.check('the launch-lane RAMP stays its own device — flank never cross-lights',
        glSeen.includes('ramp') && !glSeen.includes('rampL'), glSeen.join(','))

    // combo law: spend the left save, then a SET buys it back — once, audibly
    const cb = drive(makeGame(146))
    setBall(cb, 165, 556, 0, 300); clear(cb)
    drive(cb, {}, 1)                                    // spend kbL
    setBall(cb, 60, 400, 0, -520); clear(cb)          // flank SET
    const cbSeen = []
    let armFlash = 0
    for (let i = 0; i < 60; i++) { drive(cb, {}, 1); cbSeen.push(...types(cb)); armFlash = Math.max(armFlash, cb.kbLArmFlash) }
    r.check('combo law: a RAMP L SET re-arms the spent left save (kbarm + un-spent state)',
        cbSeen.includes('ramplset') && cbSeen.includes('kbarm') && cb.kbLUsed === false && armFlash > 0,
        `${cbSeen.join(',')} kbLUsed=${cb.kbLUsed}`)
    setBall(cb, 165, 556, 0, 300); clear(cb)
    drive(cb, {}, 1)
    r.check('the re-armed save actually fires — two left saves on one ball',
        cb.events.some((e) => e.type === 'kickback' && e.side === 'L'), cb.events.map((e) => e.type).join(','))
    const ca = drive(makeGame(147))
    setBall(ca, 60, 400, 0, -520); clear(ca)
    const caSeen = []
    for (let i = 0; i < 60; i++) { drive(ca, {}, 1); caSeen.push(...types(ca)) }
    r.check('a SET while the save is still armed announces nothing (no phantom kbarm)',
        caSeen.includes('ramplset') && !caSeen.includes('kbarm') && ca.kbLUsed === false, caSeen.join(','))

    // EMBER RIDER: hotter flank, same laws
    const em = drive(makeGame(148, 1))
    setBall(em, 300, 400, 0, -520); clear(em)
    const emSeen = []
    for (let i = 0; i < 70; i++) { drive(em, {}, 1); emSeen.push(...types(em)) }
    r.check('EMBER RIDER flank pays its own hotter ladder (30×2 + 600, mirrored)',
        em.score === 660 && emSeen.filter((t) => t === 'rampL').length === 2 && emSeen.includes('ramplset') &&
        em.msg.text === 'RAMP L SET! +600', `score=${em.score} msg=${em.msg.text}`)
    r.check('EMBER RIDER returns down the RIGHT half (the mirror flank)',
        em.bx > W - 112 && em.by > 380, `x=${em.bx.toFixed(0)} y=${em.by.toFixed(0)}`)
    const ek = drive(makeGame(149, 1))
    setBall(ek, 195, 556, 0, 300); clear(ek)
    drive(ek, {}, 1)
    r.check('EMBER RIDER saves its mirror column for 75, fired up-LEFT',
        ek.events.some((e) => e.type === 'kickback' && e.side === 'L') && ek.score === 75 && ek.vx < 0 && ek.vy < -800,
        `vx=${ek.vx.toFixed(0)} vy=${ek.vy.toFixed(0)} score=${ek.score}`)

    // observable state: hash covers the new devices; reset re-arms them
    const hs = drive(makeGame(150))
    const h0 = stateHash(hs)
    hs.kbLUsed = true
    r.check('the hash covers the left save (spent and armed cannot hide)', stateHash(hs) !== h0)
    hs.kbLUsed = false; hs.rampLLit = true
    r.check('the hash covers the flank SET lamp too', stateHash(hs) !== h0)
    const rb = drive(makeGame(151))
    setBall(rb, 165, 556, 0, 300); drive(rb, {}, 1)
    setBall(rb, 60, 400, 0, -520)
    for (let i = 0; i < 60; i++) drive(rb, {}, 1)
    resetBall(rb)
    r.check('a new ball re-arms both flank devices (save, progress, SET lamp)',
        rb.kbLUsed === false && rb.rampLHits === 0 && rb.rampLLit === false)

    // determinism of the whole flank story, and the smith chassis carries it
    const flankScript = (seed) => {
        const g = drive(makeGame(seed))
        setBall(g, 165, 556, 0, 300); drive(g, {}, 2)
        setBall(g, 60, 400, 0, -520); for (let i = 0; i < 60; i++) drive(g, {}, 1)
        return JSON.stringify(stateOf(g))
    }
    r.check('the flank story is deterministic: same seed ⇒ identical observable state',
        flankScript(152) === flankScript(152))
    const sm = compileTable(SMITH_REFS.nova).tb
    r.check('TABLE SMITH builds carry the flank chassis (kbL + rampL ride every table)',
        !!sm.kbL && !!sm.rampL && sm.kbL.x1 === TABLE.kbL.x1 && sm.rampL.x1 === TABLE.rampL.x1)
}

// =============== #3259: ART KITS (skins) — a dress, never a machine ===============
// The arcades sold art kits: same machine, new paint. The contract here is
// the same one #3103 puts on cabinets — a kit is PALETTE ONLY. These pins
// keep that honest: registry shape, key parity (a missing key would paint an
// invisible hole), real visual difference, the cycle wrap law the attract row
// leans on, the ?style parse, and a replay leg proving no kit touches physics.
{
    const cabIds = ['cabinet-one', 'ember-rider']
    r.check('registry: every cabinet carries >=2 kits, index 0 is the house dress',
        cabIds.every((id) => Array.isArray(SKINS[id]) && SKINS[id].length >= 2 &&
            SKINS[id][0].pal === (id === 'cabinet-one' ? PAL : PAL_EMBER)))
    r.check('registry: kit ids unique per cabinet, lowercase single-word',
        cabIds.every((id) => {
            const ids = SKINS[id].map((k) => k.id)
            return new Set(ids).size === ids.length && ids.every((s) => /^[a-z0-9]+$/.test(s))
        }))
    r.check('kits are dress-only: a kit carries id/label/pal and NOTHING else (#3103)',
        cabIds.every((id) => SKINS[id].every((k) => Object.keys(k).sort().join(',') === 'id,label,pal')))
    const palKeys = Object.keys(PAL).sort().join(',')
    r.check('key parity: every kit paints the full palette (a missing key paints undefined)',
        cabIds.every((id) => SKINS[id].every((k) => Object.keys(k.pal).sort().join(',') === palKeys)))
    r.check('PAL_TIDE and PAL_TOXIC carry the full key set',
        Object.keys(PAL_TIDE).sort().join(',') === palKeys && Object.keys(PAL_TOXIC).sort().join(',') === palKeys)
    r.check('an alt kit differs where players look: field, lane AND neon all change',
        cabIds.every((id) => SKINS[id].slice(1).every((k) =>
            k.pal.fieldTop !== SKINS[id][0].pal.fieldTop &&
            k.pal.lane !== SKINS[id][0].pal.lane &&
            k.pal.neon !== SKINS[id][0].pal.neon)))
    r.check('baked rgb variants stay r,g,b triples in every kit',
        cabIds.every((id) => SKINS[id].every((k) =>
            ['hotRgb', 'magRgb', 'trailRgb', 'spark', 'kickerRgb'].every((key) =>
                /^\d{1,3},\d{1,3},\d{1,3}$/.test(k.pal[key])))))
    r.check('skinAt wraps both directions — the B cycle has no edge',
        cabIds.every((id) => {
            const n = SKINS[id].length
            return skinAt(id, n).id === SKINS[id][0].id &&
                skinAt(id, -1).id === SKINS[id][n - 1].id &&
                skinAt(id, n * 7 + 2).id === SKINS[id][2 % n].id
        }))
    r.check('skinsFor falls back to CABINET ONE for an unknown table (never a blank row)',
        skinsFor('no-such-table') === SKINS['cabinet-one'])
    r.check('parseStyle: id AND squashed label resolve case-free',
        parseStyle('TIDAL') === 'tidal' && parseStyle('Toxic') === 'toxic' &&
        parseStyle('tidalrun') === 'tidal' && parseStyle('midnight') === 'midnight')
    r.check('parseStyle: unknown/empty return null — the cabinet keeps its default',
        parseStyle('nope') === null && parseStyle('') === null && parseStyle(null) === null)
    r.check('styleIndex applies on the cabinet that ships the kit, keeps the pick elsewhere',
        styleIndex('cabinet-one', 'tidal', 0) === 1 &&
        styleIndex('ember-rider', 'tidal', 0) === 0 &&
        styleIndex('ember-rider', 'toxic', 0) === 1 &&
        styleIndex('cabinet-one', null, 1) === 1)
    // physics leg: the same seed replays bit-identical — the shell may change
    // dress, kit and DMD announcements, but never the machine under them.
    const runKit = () => stateHash(drive(makeGame(7, 0), { down: true, right: true }, 240))
    r.check('a kit never touches physics: seed 7 replays bit-identical', runKit() === runKit())
}

// =============== #3237 tail: ATTRACT SHOW-OFF + KIT TAIL ===============
// The attract mode drives a REAL sim through demoPad — the same 4-tick
// medium-plunge protocol the HUMAN LINE pins above — so every pin below
// audits the exact code path the browser runs. No DOM, no RNG.
{
    const cabIds = Object.keys(SKINS)
    // the bot protocol: at the plunger hold four ticks, release, otherwise idle.
    {
        const gs = makeGame(1337)
        r.check('demoPad holds the plunger ticks 0..3 and releases on 4',
            demoPad(gs, 0).down === true && demoPad(gs, 3).down === true && demoPad(gs, 4).down === undefined)
        const ghost = { ...gs, pucks: [{ ...gs.pucks[0], by: 300, launched: true }] }
        r.check('demoPad ignores a ball that is not at the plunger',
            Object.keys(demoPad(ghost, 90)).length === 0)
    }
    // THE demo run: from seed 1337 the machine plays itself to MULTIBALL —
    // same shape as the human-line pins (lock jackpots first, never empty).
    {
        const gs = makeGame(1337)
        let mb = false, empties = 0, scoreAtLock = 0
        for (let i = 0; i < 3000 && !mb; i++) {
            stepGame(gs, demoPad(gs, gs.tick))
            if (gs.pucks.length === 0 && !gs.done) empties++
            if (scoreAtLock === 0 && gs.events.some((e) => e.type === 'lock')) scoreAtLock = gs.score
            if (gs.multiball) mb = true
            gs.events.length = 0
        }
        r.check('ATTRACT DEMO (cab one): the bot drives to MULTIBALL within 3000 ticks', mb, `first lock score=${scoreAtLock}`)
        r.check('the demo banks lock jackpots before the pack — it really locks', scoreAtLock >= 500, `first lock score=${scoreAtLock}`)
        r.check('the demo never leaves the table empty', empties === 0, `empties=${empties}`)
    }
    {
        const gs = makeGame(1337, 1)
        let mb = false
        for (let i = 0; i < 3000 && !mb; i++) {
            stepGame(gs, demoPad(gs, gs.tick))
            if (gs.multiball) mb = true
            gs.events.length = 0
        }
        r.check('ATTRACT DEMO (ember rider): the mirrored bot reaches MULTIBALL too', mb)
    }
    r.check('demoOver: only done, or a beat after the pack, ends a demo run',
        demoOver({ done: false }, false, 9999) === false &&
        demoOver({ done: true }, false, 0) === true &&
        demoOver({ done: false }, true, 421) === true &&
        demoOver({ done: false }, true, 100) === false)
    // kit tail — memory, warnings, the third dress.
    r.check('#3237: three art kits ride every cabinet (the row cycles deeper)',
        cabIds.every((id) => SKINS[id].length >= 3), cabIds.map((id) => `${id}=${SKINS[id].length}`).join(' '))
    r.check('the third kit is a real third dress (lane and neon distinct from kits one and two)',
        cabIds.every((id) => {
            const [a, b, c] = SKINS[id]
            return c.pal.lane !== a.pal.lane && c.pal.lane !== b.pal.lane && c.pal.neon !== b.pal.neon && c.pal.fieldTop !== b.pal.fieldTop
        }))
    r.check('kitIndex: remembered ids resolve, stale ids fall back to the house dress',
        kitIndex('cabinet-one', 'noir') === 2 && kitIndex('cabinet-one', 'glacier') === 0 &&
        kitIndex('cabinet-one', 'retired-kit') === 0 && kitIndex('ember-rider', 'toxic') === 1)
    r.check('styleWarn: only a NAMED style the picked cabinet does not ship warns',
        styleWarn('cabinet-one', 'toxic') === true && styleWarn('ember-rider', 'glacier') === false &&
        styleWarn('cabinet-one', null) === false && styleWarn('ember-rider', 'tidal') === true)
    r.check('kit memory lives at the pinned storage slot', KIT_STORE === 'retrogames.pinball.kits')
    r.check('attract DMD lines: >=3 per cabinet, in-font, crawl-length, no shout words',
        cabIds.every((id) => Array.isArray(ATTRACT_DMD[id]) && ATTRACT_DMD[id].length >= 3 &&
            ATTRACT_DMD[id].every((s) => s.length <= 23 &&
                [...s.toUpperCase()].every((ch) => FONT[ch] !== undefined) &&
                !/TILT|MULTIBALL|MULT x|ORBIT SET|ORBIT LOCK|RAMP SET|SAVE/.test(s))))
    // shell anchors — presentation laws the browser carries (text-scan idiom).
    const shell = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src/games/Pinball/index.jsx'), 'utf8')
    r.check('shell gives the kit cycle its own dress-flip sound (#3259 owed)',
        /case 'dressflip'/.test(shell) && /sfxFor\(\{ type: 'dressflip' \}\)/.test(shell))
    r.check('shell persists the kit pick through the pinned memory key',
        shell.includes('localStorage.setItem(KIT_STORE') && shell.includes('saveKit('))
    r.check('shell says NO SUCH KIT on the DMD and on the row badge',
        shell.includes("'NO SUCH KIT'") && shell.includes('NO SUCH KIT HERE'))
    r.check('the results screen wears the kit line (#3237)', shell.includes('◆ KIT {k.label}'))
    r.check('attract drives the demo through the game\'s own drawTable (one renderer)',
        shell.includes('stepDemo(dt)') && shell.includes('drawTable(d.gs, DLIVE)') && shell.includes('demoPad(gs, t)'))
}

// ═══════════════════════════════════ TABLE SMITH (#3284) ═══════════════
{
    r.info('smith', 'the editor compiler turns player layouts into engine DATA — the #3103 contract, playable')
    // zone / overlap / cross-part refusals — the legality boundary, pinned.
    const rej = [
        [{ name: '', bumpers: [] }, 'PLACE A BUMPER'],
        [{ name: '', bumpers: [[1, 1]] }, 'BUMPER OUT OF ZONE'],
        [{ name: '', bumpers: [[90, 270]] }, 'BUMPER OUT OF DOME'],
        [{ name: '', bumpers: [[115, 170], [130, 175]] }, 'BUMPER OVERLAP'],
        [{ name: '', bumpers: [[180, 150]], slingL: [98, 452] }, 'SLING OUT OF ZONE'],
        [{ name: '', bumpers: [[180, 150]], slingR: [262, 452] }, 'SLING OUT OF ZONE'],
        [{ name: '', bumpers: [[180, 150]], bank: [300, 250] }, 'BANK OUT OF ZONE'],
        [{ name: '', bumpers: [[180, 150]], bank: [180, 200] }, 'BANK OUT OF ZONE'],
        [{ name: '', bumpers: [[180, 150]], magnet: [50, 300] }, 'MAGNET OUT OF ZONE'],
        [{ name: '', bumpers: [[180, 260]], bank: [180, 230] }, 'BUMPER ON BANK'],
        [{ name: '', bumpers: [[180, 150], [180, 195]] }, 'BUMPER OVERLAP'],
        [{ name: '', bumpers: [[180, 240]], magnet: [180, 270] }, 'MAGNET ON BUMPER'],
    ]
    for (const [def, why] of rej) {
        r.check(`smith refuses ${why}`, compileTable(def).error === why, `got ${compileTable(def).error}`)
    }
    // the flipper-gap law: the sling zone itself keeps a 60 px centre corridor
    r.check('sling zone holds the flipper-gap law (tips ≤150 / ≥210)',
        SMITH_LIMITS.slingX.L[1] + SMITH_LIMITS.slingRun <= 150 &&
        SMITH_LIMITS.slingX.R[0] - SMITH_LIMITS.slingRun >= W - 150)
    // sanitize: untrusted localStorage junk drops to a clean def
    const san = sanitizeDef({ name: 'nope!!1 2 3 4 5 6 7 8 9 0 a', bumpers: [['a', 2], [3, 4, 5], [115, 170]], bank: ['x', 1], magnet: [180, 300], junk: 7 })
    r.check('sanitize drops junk entries and caps the bumper list',
        san.bumpers.length === 1 && san.bank === null && san.magnet && !('junk' in san), JSON.stringify(san))
    r.check('sanitize keeps names to a marquee-safe caps slice', san.name.length <= 14 && san.name === san.name.toUpperCase())
    // determinism: same def, byte-identical compile; same seed, identical run
    const ca = compileTable(SMITH_REFS.nova), cb = compileTable(SMITH_REFS.nova)
    const ga = makeGame(7, ca.tb), gb = makeGame(7, cb.tb)
    for (let i = 0; i < 600; i++) { stepGame(ga, {}); stepGame(gb, {}) }
    r.check('compile + sim on a smithed table is deterministic',
        stateHash(ga) === stateHash(gb), `${stateHash(ga)} vs ${stateHash(gb)}`)
    // makeGame really loads the passed table (not the shelf fallback)
    r.check('makeGame drives the SMITHED table, not CABINET ONE in disguise',
        ga.table.id === 'my-table' && ga.table.label === SMITH_REFS.nova.name && ga.table.bumpers.length === 3,
        `${ga.table.id}`)
    // engine tolerance: no magnet, no bank — the table still boots and plays
    const nomag = compileTable({ name: 'BARE', bumpers: [[180, 150]], bank: null, magnet: null })
    r.check('a smithed table may skip magnet and bank (data tolerance, not physics)',
        nomag.error === null && nomag.tb.magnet === null && nomag.tb.targets.length === 0 && Number.isFinite(nomag.tb.view.bankCx))
    {
        const g = makeGame(3, nomag.tb)
        drive(g, {}, 4000)
        r.check('a bank-less table never lights a phantom bank-clear', !g.bankLit && Number.isFinite(g.score))
    }
    // every reference layout PLAYS on the live sim: launch, score, resolve —
    // BALL SEARCH (engine law) is the no-wedge guarantee custom tables inherit.
    for (const [k, def] of Object.entries(SMITH_REFS)) {
        const g = makeGame(11, compileTable(def).tb)
        let launched = false, scored = false, done = false, nan = false
        for (let i = 0; i < 4000 && !done; i++) {
            stepGame(g, { a: i % 40 < 6, b: i % 97 === 0 })
            if (g.launched && g.by < 500) launched = true
            if (g.score > 0) scored = true
            if (!Number.isFinite(g.bx) || !Number.isFinite(g.score)) nan = true
            if (g.done) done = true
        }
        r.check(`smith ref "${k}" plays: launch + score + resolve`, launched && scored && done && !nan,
            `score=${g.score} done=${done} nan=${nan}`)
    }
    // the editor's starting draft must itself be legal (openEditor ships it)
    r.check('the editor opens on a legal default layout', compileTable(SMITH_REFS.nova).error === null)
    // shell anchors: the row of three, the ghost entry, the storage slot
    const sh = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src/games/Pinball/index.jsx'), 'utf8')
    r.check('the attract row carries the smith slot as its third cabinet',
        sh.includes("custom: true") && sh.includes('DESIGN YOUR OWN') && sh.includes('BUILD'))
    r.check('the smith saves to its pinned storage slot', sh.includes("MY_STORE = 'retrogames.pinball.mytable.v1'"))
    r.check('unsaved slot answers START with the bench, not an empty table',
        sh.includes('openEditor()') && sh.includes('!CABS[2].saved'))
    r.check('TEST drops home to the bench, not the row', sh.includes('testBackRef.current'))
    r.check('the pad labels B as TOOL on the bench', sh.includes("screen === 'edit' ? 'TOOL'"))
    // #3338: the saved custom row tells the truth — B means REDESIGN there, not KIT.
    r.check('the pad labels B as REDESIGN on the saved custom',
        sh.includes("cabIdx === 2 && CABS[2]?.saved ? 'REDESIGN'"))
    r.check('the attract hint line promises REDESIGN on the saved custom',
        sh.includes('◀ ▶ CABINET · ▲▼ KIT · B REDESIGN · SPACE START') &&
        sh.includes('cabRef.current === 2 && CABS[2].saved ?'))
    r.check('the saved custom still dresses with ▲▼ (B means REDESIGN, not the kit)',
        sh.includes("cabRef.current === 2 && CABS[2].saved && (e.code === 'KeyB' || e.code === 'ShiftLeft')"))
    // #3237 tilt-to-nudge shell wiring: honest grant, play-only fire, pulse release.
    r.check('tilt nudge offers an honest grant tap (iOS permission path)',
        sh.includes('data-tilt="nudge-enable"') && sh.includes('requestPermission'))
    r.check('the lean only nudges inside an unpaused run',
        sh.includes("screenRef.current === 'play' && !pausedRef.current"))
    r.check('a held NUDGE button owns b — the lean never stomps it', sh.includes('!keysRef.current.b'))
    r.check('the tilt pulse rides the sim steps then releases b', sh.includes('if (tiltPulseRef.current > 0 && --tiltPulseRef.current === 0) keysRef.current.b = false'))
    r.check('the lean maps through the shared screen-rotation law', sh.includes("import { tiltVec } from '../../components/padTypes.js'"))
    // #3359 garage: three slots hold smith layouts; the card shows the CURRENT
    // slot; 1/2/3 + the chooser strip pick it; the legacy blob migrates once.
    r.check('the garage holds three slots',
        sh.includes("const GARAGE_SLOTS = 3"))
    r.check('the per-slot save key is pinned (legacy mytable.v1 read kept for the migration)',
        sh.includes("const GARAGE_PREFIX = 'retrogames.pinball.cab.v1'") &&
        sh.includes("const slotKey = (i) => `${GARAGE_PREFIX}:${i}`") &&
        sh.includes("const SLOT_STORE = 'retrogames.pinball.slot'"))
    r.check('the slot selection is persisted (load + save under the pinned key)',
        sh.includes("localStorage.getItem(SLOT_STORE)") && sh.includes("localStorage.setItem(SLOT_STORE"))
    r.check('Digit1/2/3 pick the garage slot on the smith card (A/B/C stay cabinets/kit)',
        sh.includes("e.code === 'Digit1'") && sh.includes("e.code === 'Digit2'") && sh.includes("e.code === 'Digit3'"))
    r.check('the garage chooser strip is drawn on the smith card, not on stock cabinets',
        sh.includes('if (i === 2)') && sh.includes('stripY') && sh.includes('GARAGE_SLOTS'))
    r.check('a slot switch clears the painted-field cache and re-deals the demo',
        sh.includes('delete fieldsRef.current[k]') && sh.includes('demoRebuild()'))
    r.check('SAVE lands in the slot the card is showing (no more single-slot save)',
        sh.includes('saveGarageSlot(garage.sel'))
    r.check('a junk slot reads ghost (validateSmith gate), never a save',
        sh.includes('const slotDefLegal = (s)') && sh.includes('validateSmith(def) === null'))
    r.check('one-shot legacy migration: only into an EMPTY slot 0, def must compile, blob kept',
        sh.includes('const legacyRaw = loadMyRaw()') && sh.includes('if (legacyRaw && !slots[0])') &&
        sh.includes('validateSmith(legacyDef) === null') && sh.includes('slots[0] = { name: legacyName, def: legacyDef }'))
}

// ═══ #3290 stage 1: honest ghost, drawn rules, phone fits ═══
{
    r.info('smith-ui', 'discoverability, ghost-demo honesty, the zone guide and the phone-width laws')
    // the drawn rim IS the law: every vertex passes bumperZoneOk,
    // and the rim touches all four clamps plus the live ellipse.
    const zone = zoneGuidePath(SMITH_LIMITS)
    r.check('#3290 zoneGuidePath: every vertex legal under bumperZoneOk (guide == law)',
        zone.every(([x, y]) => bumperZoneOk(SMITH_LIMITS, x, y)))
    r.check('#3290 zoneGuidePath traces all clamps and the ellipse rim',
        zone.some(([x]) => x === SMITH_LIMITS.domX[0]) && zone.some(([x]) => x === SMITH_LIMITS.domX[1]) &&
        zone.some(([, y]) => y === SMITH_LIMITS.domY[0]) && zone.some(([, y]) => y === SMITH_LIMITS.domY[1]) &&
        zone.some(([x, y]) => Math.abs(((x - 180) / 144) ** 2 + ((y - 160) / 124) ** 2 - 1) < 1e-9))
    r.check('#3290 rim agreement: just-outside refuses, the clamp edge passes',
        !bumperZoneOk(SMITH_LIMITS, 268, 160) === false && !bumperZoneOk(SMITH_LIMITS, 269, 160) &&
        !bumperZoneOk(SMITH_LIMITS, 180, 271) && !bumperZoneOk(SMITH_LIMITS, 82, 260) &&
        bumperZoneOk(SMITH_LIMITS, 82, 160))  // the clamp edge where the ellipse is widest-short
    // the ghost ad-line set is crawl-legal (same three laws as every cabinet)
    r.check('#3290 ghost sell-lines: >=3, in-font, crawl-length, no shout words',
        Array.isArray(ATTRACT_DMD.ghost) && ATTRACT_DMD.ghost.length >= 3 &&
        ATTRACT_DMD.ghost.every((x) => x.length <= 23 &&
            [...x.toUpperCase()].every((ch) => FONT[ch] !== undefined) &&
            !/TILT|MULTIBALL|MULT x|ORBIT SET|ORBIT LOCK|RAMP SET|SAVE/.test(x)))
    r.check('#3290 both stock cabinets now sell BUILD YOUR OWN TABLE',
        ATTRACT_DMD['cabinet-one'].includes('BUILD YOUR OWN TABLE') &&
        ATTRACT_DMD['ember-rider'].includes('BUILD YOUR OWN TABLE'))
    // phone-width fit laws: every marquee the row can show stays inside its card
    const CARDW = 104
    const labels = []
    for (const tag of ['CABINET ONE', 'EMBER RIDER', 'DESIGN YOUR OWN', 'SUPER NOVA RIDER'])
        for (const id of ['cabinet-one', 'ember-rider', 'my-table'])
            for (const k of skinsFor(id)) labels.push(tag + ' \u00b7 ' + k.label)
    r.check('#3290 marqueeFit: every tag x kit marquee stays inside its card',
        labels.every((lb) => { const m = marqueeFit(lb, CARDW); return m.text.length * m.size * 0.6 <= CARDW }),
        labels.length + ' labels tried')
    r.check('#3290 marqueeFit drops the \u00b7 KIT tail before truncating a name',
        marqueeFit('SOME LONG NAME \u00b7 MIDNIGHT', CARDW).text === 'SOME LONG NAME')
    r.check('#3290 textFit truncation is a last resort that still fits', (() => {
        const m = textFit('X'.repeat(40), 60); return m.size === 7 && m.text.length * 7 * 0.6 <= 60 && m.text.length >= 1
    })())
    // shell anchors: the honesty, the always-badge, the pad-zone lift, the tap plumbing
    const sh2 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src/games/Pinball/index.jsx'), 'utf8')
    r.check('#3290 the unsaved ghost demos the bench default (NOVA), not CABINET ONE',
        sh2.includes('previewTb(cabRef.current)') && sh2.includes('compileTable(SMITH_REFS.nova).tb'))
    r.check('#3290 the ghost badge rides the row from every frame (isSel || ghostCard)',
        sh2.includes('const ghostCard = i === 2 && !CABS[2].saved') && sh2.includes('if (isSel || ghostCard)'))
    r.check('#3290 the blueprint shimmers unselected (invitation, not furniture)',
        sh2.includes('0.25 + 0.2 * Math.sin(t / 320)'))
    r.check('#3290 the bench palette lives above the phone pad zone (SMITH_BAR y488)',
        /SMITH_BAR = \{ bw: 38, x0: 28, y0: 488, h: 22 \}/.test(sh2))
    r.check('#3290 bench taps answer their own tool cells',
        sh2.includes('ti = Math.floor((pxE - SMITH_BAR.x0) / SMITH_BAR.bw)'))
    r.check('#3290 a tap that opens the bench never presses A through tapStart',
        sh2.includes('tapSpaceGuard = true') && sh2.includes('if (tapSpaceGuard) { tapSpaceGuard = false'))
    r.check('#3290 card-tap seams pick the nearest centre (no first-match coin-toss)',
        sh2.includes('const dd = Math.abs(px - (r.x + CARD_W / 2))') && sh2.includes('if (dd < bd) { bd = dd; best = i }'))
    r.check('#3290 the selected mini-card carries its own legible message strip',
        sh2.includes('textFit(mt, CARD_W - 10') && sh2.includes('mf.size'))
}

// --------------------------------------------- solo bed (#3304) ----
{
    const gs = makeGame(81)
    r.check('#3304 a fresh game hums at the bed base (ball in the shooter, score 0)',
        soloBed(gs) === SOLO_BASE, `law=${soloBed(gs)}`)
    gs.score = SOLO_HEAT_AT / 2
    r.check('#3304 the bed swells with the run (half heat = half travel)',
        Math.abs(soloBed(gs) - (SOLO_BASE + (SOLO_CAP - SOLO_BASE) * 0.5)) < 1e-9, `law=${soloBed(gs)}`)
    gs.score = SOLO_HEAT_AT * 4
    r.check('#3304 red heat caps at SOLO_CAP — still quieter than the mb bed (0.55)',
        soloBed(gs) === SOLO_CAP && SOLO_CAP < 0.55, `law=${soloBed(gs)}`)
    gs.multiball = true
    r.check('#3304 the pack is exclusive — solo answers 0 while MULTIBALL runs (#3178 untouched)',
        soloBed(gs) === 0, `law=${soloBed(gs)}`)
    gs.multiball = false; gs.score = 12000
    gs.tilt = true
    r.check('#3304 a tilted cabinet plays thin (half the floor)', soloBed(gs) === SOLO_FLOOR / 2, `law=${soloBed(gs)}`)
    gs.tilt = false
    gs.pucks.length = 0
    r.check('#3304 between balls the bed breathes at the floor, mid-run', soloBed(gs) === SOLO_FLOOR, `law=${soloBed(gs)}`)
    const gs0 = makeGame(82); gs0.score = 0; gs0.pucks.length = 0
    r.check('#3304 before the first launch of a fresh game the cabinet is silent', soloBed(gs0) === 0, `law=${soloBed(gs0)}`)
    gs.done = true
    r.check('#3304 game over cuts the bed', soloBed(gs) === 0, `law=${soloBed(gs)}`)
    const sh2 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src/games/Pinball/index.jsx'), 'utf8')
    r.check('#3304 the #3178 mb seam keeps its shape (pack gates the bed, track pinballMb, level 0.55)',
        sh2.includes("const bedOn = screenRef.current === 'play' && !pausedRef.current && (gs.multiball || devMbRef.current)") &&
        sh2.includes("audioController.startMusic('pinballMb'); audioController.setMusicLevel(0.55)"))
    r.check('#3304 the solo seam rides the law, quantized to 0.02, and the pack never hears it',
        sh2.includes('soloBed(gs) : 0') && sh2.includes('Math.round(lvl / 0.02) * 0.02') && sh2.includes('if (!bedOn && !bedSeamRef.current) {'))
    // #3313 item 1: the seam is a glide, not a splice — dip the bus, swap at
    // the bottom, rise into the new bed; both swaps relight in the SAME turn.
    r.check('#3313 pack arrival is a dip-then-swap glide (150 ms dip, track swap at the bottom)',
        sh2.includes("else if (bedOn && !mbBedRef.current) { audioController.setMusicLevel(0.001); bedSeamRef.current = { left: 150 } }") &&
        sh2.includes("audioController.startMusic('pinballMb'); audioController.setMusicLevel(0.55)") &&
        sh2.includes('seam.left -= dt'))
    r.check('#3313 pack departure hands back in the SAME turn (stop and start share one automation frame — no burst)',
        sh2.includes("else if (!bedOn && mbBedRef.current) { audioController.setMusicLevel(0.001); bedSeamRef.current = { left: 150 } }") &&
        sh2.includes("audioController.startMusic('pinballSolo'); audioController.setMusicLevel(q); soloBedRef.current = q; mbBedRef.current = false"))
    // #3313 item 2: the heat tell rides the SAME law value the bus reads.
    r.check('#3313 the DMD heat tell is wired to the bed law (index passes law/SOLO_CAP, art scales the glow)',
        sh2.includes('heat: Math.max(0, Math.min(1, soloBed(gs) / SOLO_CAP))') &&
        readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src/games/Pinball/art.js'), 'utf8')
            .includes('const bezelGlow = (hot ? (multi ? 22 : 12) : 6) + heat * 7;'))
    r.check('#3313 heat spans 0..1 exactly where the swell does (base→cap)',
        Math.abs(soloBed({ done: false, multiball: false, tilt: false, pucks: [{ launched: true }], score: 0 }) / SOLO_CAP - SOLO_BASE / SOLO_CAP) < 1e-9 &&
        Math.abs(soloBed({ done: false, multiball: false, tilt: false, pucks: [{ launched: true }], score: SOLO_HEAT_AT }) / SOLO_CAP - 1) < 1e-9)
    r.check('#3304 the dev mb-rig is seam-only — it overlays the bed ref, never gs.multiball',
        sh2.includes('devMb: (on = true) => { devMbRef.current = Boolean(on)') &&
        !sh2.includes('gsRef.current.multiball ='))
}

// ------------------------------------- phone mix calibration (#3336) ----
// The SOLO bed measured thin where a PHONE speaker can hear it (#3313 item
// 3): bus destination gain MUSIC_BUS×law = 0.016–0.048 with the bass at
// 41–55 Hz — under the small-speaker knee — and the lead sparse. The fix is
// VOICING, not gain: the swell law is the contract, so the literals 0.16 /
// 0.30 / 0.10 / 25000 and the 0.02 quantize must not move, and the mid line
// must stay a BED: capped peak ≥ 12 dB under a single bumper hit.
// The knee model is the documented phone assumption (12 dB/oct below 150 Hz,
// 2nd-order mechanical HP: amplitude (f/fc)² below fc); real-ears-on-device
// stays tied to #3054's recorder gap — this pins the math, the wiring, and
// the direction of the fix, not the last dB.
{
    const { MUSIC, MUSIC_BUS } = await import('../src/utils/AudioController.js')
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)
    const KNEE = 150
    const kneePow = (hz) => (hz >= KNEE ? 1 : Math.pow(hz / KNEE, 4)) // 12 dB/oct power
    const P = MUSIC.pinballSolo
    const STEP = 0.125

    // the contract, literal: no blind gain bump — the swell law unchanged
    r.check('#3336 the swell law is untouched (0.16 base · 0.30 cap · 0.10 floor · 25000 heat · MUSIC_BUS 0.16)',
        SOLO_BASE === 0.16 && SOLO_CAP === 0.30 && SOLO_FLOOR === 0.10 && SOLO_HEAT_AT === 25000 && MUSIC_BUS === 0.16)
    r.check('#3336 the quantize stays 0.02 (index.jsx)',
        readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src/games/Pinball/index.jsx'), 'utf8')
            .includes('Math.round(lvl / 0.02) * 0.02'))

    // the mid voice exists, is wired, and is opt-in (other tracks keep the
    // byte-identical schedule — no other title's sound moves)
    const ac = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src/utils/AudioController.js'), 'utf8')
    r.check('#3336 the mid voice is wired in _schedule (square, vol 0.3, dur 1.1 step)',
        ac.includes("const mn = P.mid && P.mid[i]") &&
        ac.includes("if (mn) this._note(f(mn), m.nextTime, m.stepDur * 1.1, 'square', 0.3)"))
    r.check('#3336 opt-in law — pinballSolo is the ONLY track with a mid line',
        Object.keys(MUSIC).filter((k) => MUSIC[k].mid).join() === 'pinballSolo' &&
        MUSIC.pinballMb.mid === undefined)
    r.check('#3336 the mid line keeps bar parity (32 steps, same as lead/bass/perc)',
        P.mid.length === 32 && P.mid.length === P.lead.length && P.mid.length === P.bass.length && P.mid.length === P.perc.length)

    // voice law: every mid note lives in the phone-carry band (160–340 Hz —
    // above the knee, below the small speaker's upper roll-off)
    const midHz = P.mid.filter(Boolean).map(midi)
    r.check('#3336 every mid note sits in the phone-carry band (160–340 Hz)',
        midHz.every((hz) => hz >= 160 && hz <= 340), `${Math.min(...midHz).toFixed(1)}–${Math.max(...midHz).toFixed(1)} Hz`)

    // patient, not a drummer: an eighth-note pulse (gap ≤ 4 steps), never a
    // 16th flurries; and the walk is chordal — every mid note is the root or
    // the fifth of the bass note that owns its bar
    let gap = 0, maxGap = 0
    for (let i = 0; i < 32; i++) { gap = P.mid[i] ? (maxGap = Math.max(maxGap, gap + 1), 0) : gap + 1 }
    maxGap = Math.max(maxGap, gap) // wrap
    r.check('#3336 the mid pulses every ≤4 steps — sustained without flurries (16 notes, max gap 2)',
        P.mid.filter(Boolean).length === 16 && maxGap <= 4, `notes=${P.mid.filter(Boolean).length} maxGap=${maxGap}`)
    let chordal = true
    for (let i = 0; i < 32; i++) {
        if (!P.mid[i]) continue
        let bi = i
        for (;;) { if (P.bass[bi]) break; bi = (bi + 31) % 32 }
        const iv = (P.mid[i] - P.bass[bi] - 24) % 12
        if (iv !== 0 && iv !== 7) chordal = false
    }
    r.check('#3336 the mid walks root–5th over its own bass (i–VII–VI–v, folded two octaves up)', chordal)

    // the knee math: what each voice contributes inside the phone band, as
    // mean power over one loop (vol² × knee(f) × dur). Before the fix the
    // sustain leg was the sparse lead alone; the bass is nearly all gone.
    const voiceE = (arr, vol, durMul) => arr.reduce((e, n) => e + (n ? vol * vol * kneePow(midi(n)) * STEP * durMul : 0), 0)
    const leadE = voiceE(P.lead, 0.5, 0.9)
    const bassE = voiceE(P.bass, 0.6, 1.1)
    const midE = voiceE(P.mid, 0.3, 1.1)
    const hatE = P.perc.filter(Boolean).length * 0.22 * 0.22 * 0.04
    r.check('#3336 diagnosis pinned — the bass fundamental is >20 dB down at the knee (the phone never had it)',
        kneePow(midi(33)) < 0.05 && kneePow(midi(28)) < 0.01,
        `A1 ${10 * Math.log10(kneePow(midi(33))).toFixed(1)} dB · E1 ${10 * Math.log10(kneePow(midi(28))).toFixed(1)} dB`)
    r.check('#3336 the mid is the bed\'s biggest carrier in-band — bigger than the sparse lead',
        midE >= leadE, `mid=${midE.toFixed(4)} lead=${leadE.toFixed(4)}`)
    r.check('#3336 sustained in-band power at least DOUBLES (+3 dB) with the mid line (measured off the track data)',
        midE + leadE + bassE + hatE >= 2 * (leadE + bassE + hatE),
        `pre=${(leadE + bassE + hatE).toFixed(4)} post=${(midE + leadE + bassE + hatE).toFixed(4)}`)

    // bed discipline (#3304 stays the law): the loudest mid at full heat is
    // still ≥12 dB under ONE bumper hit (square 0.12, direct to destination).
    const capPeak = 0.3 * MUSIC_BUS * SOLO_CAP
    r.check('#3336 bed under volley — cap mid peak ≤ bumper vol / 4 (≥12 dB under, literal 0.12)',
        capPeak <= 0.12 / 4, `capPeak=${capPeak.toFixed(5)} bumper/4=${(0.12 / 4).toFixed(5)}`)
}

restoreAll()
if (MUT) {
    const red = r.failed > 0
    console.log(`\npinballcheck mutant '${MUT}': ${red ? 'RED — caught' : 'GREEN — SURVIVED, check is toothless'}`)
    process.exit(red ? 0 : 1)
}
r.exit()
