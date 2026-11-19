// PICK RUSH — the shift audit (issue #1142).
//
//   npm run pickcheck              # Node rules + determinism + win proof + real drive
//   npm run pickcheck -- --node   # Node-only gates (no browser)
//   npm run pickcheck -- --mutate # silence ONE load-bearing rule, watch NAMED gates red
//
// Node proves the rules that make it a sorter (clamping, bin judging, the
// glass threshold, barrel slip, fuses, quota verdicts, the shift ladder) and
// the promise behind them (seeded determinism; the shipped autopilot clears
// every quota on three seeds; the parity rival keeps a head-to-head honest).
// Chrome proves it is PLAYABLE: boots clean, starts on a real Space, the
// cable and cargo pixels land exactly where the sim says after real strokes,
// and three wrong-bin drops fire the line and clock you back in.
//
// Mutants (PICK_MUT=judge|glass|roll|quota|wave|amb):
//   judge — CRATE stops belonging to its bin
//   glass — bottles stop being fragile
//   roll  — barrels stop rolling (nothing can ever slip)
//   quota — shift 1's quota becomes unreachable
//   wave  — the authored line collapses to one shift's waves (#2210)
//   amb   — the ambience eras collapse (early beeps at graveyard cadence, #2234)
//   vis   — the bins never fill (meter cap frozen at 9999, #2678)
//   whip  — the cable spring dies (no overshoot on reversal, #2678)
//   tell  — the grab-read telegraphs go silent (ring/jaw/slam never warn, #2684)
//   aim   — rival intent and ring ownership go blind (#2690)
//   rec   — the export's label law lies: a drop stops being a hit (#2734)
//   perfect — the PERFECT ladder pays nothing (mastery reward dies, #2742)
//   spoil — a belt-end miss stops spoiling the clean sheet (#2742)

import * as s from '../src/games/PickRush/sim.js'
import { readFileSync } from 'node:fs' // §CB pins the marquee colour from the painter's source
import { AMB_ZONES, zoneForShift, fireAt } from '../src/games/PickRush/ambience.js'
import { BIN_VIS, makeBinVis, stepBinVis, pushBinKind, dropVoice, DROP_THUD, makeWhip, stepWhip, whipTarget, CRANE, makeCraneVis, stepCrane, FEATHER_CUE, makeFeatherCue, stepFeatherCue, TELL, catchRing, slamTell, travelTell, jawWarn, craneAim, ringClaim, RING_OK, RING_OFF, BARREL_CORE } from '../src/games/PickRush/visuals.js'
import { scriptFor } from './lib/contractGames.mjs'
import { collectRun, planner, OUTCOME_BY_EVENT, makeReplayDriver } from './pickrush-export.mjs'
import { validateEpisode, exportEpisodes } from '../src/utils/robot/episode.js'
import { verifyRecording, decodePad } from '../src/utils/recording.js'

const args = process.argv.slice(2)
const NODE_ONLY = args.includes('--node')
const MUT = process.env.PICK_MUT || (args.includes('--mutate') ? 'judge' : null)

let pass = 0
const fails = []
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS  ${m}`) } else { fails.push(m); console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`) } }
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

if (MUT) {
    if (!['judge', 'glass', 'roll', 'quota', 'wave', 'amb', 'vis', 'whip', 'tell', 'aim', 'rec', 'perfect', 'spoil', 'voice', 'ease', 'feather'].includes(MUT)) { console.error(`unknown mutant ${MUT}`); process.exit(2) }
    console.log(`\x1b[33mMUTANT ACTIVE: ${MUT}\x1b[0m`)
}
const applyMut = () => {
    if (MUT === 'judge') s.KINDS.crate.bin = 1
    if (MUT === 'glass') s.KINDS.bottle.fragile = false
    if (MUT === 'roll') s.KINDS.barrel.roll = false
    if (MUT === 'quota') s.SHIFTS[0].quota = 99999
    if (MUT === 'wave') s.WAVES.length = 1
    if (MUT === 'amb') AMB_ZONES[0].cues.beep.every = 330 // early floor beeps at graveyard cadence — the night stops changing
    if (MUT === 'vis') BIN_VIS.cap = 9999 // bins never fill — the lamp never thunks (#2678)
    if (MUT === 'whip') BIN_VIS.spring = { k: 0, d: 0.22 } // cable spring dead — the head never whips past the tilt (#2678)
    if (MUT === 'tell') TELL.freeze = true // the belt goes mute: ring never lights, jaws never warn, pips never paint (#2684)
    if (MUT === 'aim') TELL.aimFreeze = true // the second crane goes invisible: no intent beacon, no ring ownership (#2690)
    if (MUT === 'rec') OUTCOME_BY_EVENT.drop = { ok: false, why: 'drop' } // the export calls a correct-bin land a MISS (#2734)
    if (MUT === 'perfect') s.PERFECT_PAY.fill(0) // mastery pays nothing — the reward dies (#2742)
    if (MUT === 'spoil') s.PERFECT_SPOIL.splice(s.PERFECT_SPOIL.indexOf('miss'), 1) // the line forgives every miss (#2742)
    if (MUT === 'voice') for (const t of DROP_THUD) t.hz = 120 // every bin thuds the same note — the variety dies (#2739)
    if (MUT === 'ease') CRANE.trail = 0 // the gantry stops dead again — inertia dies (#2755)
    if (MUT === 'feather') FEATHER_CUE.ticks = 0 // the first-shift lesson never arms (#2755)
}
applyMut()

const {
    makeGame, step, autopilot, stateHash, barrelUpright,
    BELT_Y, BIN_TOP, BELT_END, CARRY_TIP, CLAW_DOWN, FUSES, SHIFT_TICKS,
    VIEW_H, GRAB_DX, BREAK_VY, ATTEMPT_TIP, CLAW_SPEED, BARREL_R, beltV,
    KINDS, BINS, SHIFTS, WAVES, PERFECT_PAY, PERFECT_SPOIL,
} = s

const CAN_BIN = BINS[1]
const CRATE_BIN = BINS[0]
const BOTTLE_BIN = BINS[2]

// helper: drive the crane the way a player does — lead the moving target for
// the claw's descent time, dip, and keep tracking while the jaws fall
const grabFrom = (gs, item, cap = 500, pin = null) => {
    let n = 0, pressed = false
    while (n < cap) {
        if (pin) pin()
        const arm = gs.arms[0]
        if (arm.held === item.id) break
        if (item.carriedBy === -1 && !item.onBelt) return false
        const vb = 1.05 * SHIFTS[Math.min(gs.shift, SHIFTS.length - 1)].speed
        const dx = item.x - arm.x
        const lead = vb * Math.ceil((CLAW_DOWN - arm.tip) / 3)
        const pad = { left: false, right: false, a: false }
        if (!pressed && gs.tick > 1) {
            const want = dx - lead
            if (want > 1.5) pad.right = true
            else if (want < -1.5) pad.left = true
            else { pad.a = true; pressed = true }
        } else if (pressed && arm.held === null) {
            if (dx > 8) pad.right = true
            else if (dx < -8) pad.left = true
        }
        step(gs, [pad])
        n++
    }
    return gs.arms[0].held === item.id
}

const dropOver = (gs, x, cap = 400, keep = {}) => {
    let n = 0
    while (n < cap && gs.arms[0].held !== null) {
        const dx = x - gs.arms[0].x
        const pad = { left: dx < -1.5, right: dx > 1.5, a: false, ...keep }
        step(gs, [pad])
        n++
    }
    // settle the carriage (kills drift) before the release edge
    for (let k = 0; k < 3 && gs.arms[0].held !== null; k++) step(gs, [{ a: false, ...keep }])
    step(gs, [{ a: false }])
    step(gs, [{ a: true }])
}

const spawnAt = (gs, kind, x) => {
    const K = KINDS[kind]
    const it = { id: 8000 + gs.tick, n: gs.spawnN++, kind, x, y: BELT_Y - K.h / 2, vx: 0, vy: 0, rot: 0, onBelt: true, carriedBy: -1, fragile: K.fragile }
    gs.items.push(it)
    return it
}

// manual-injection gates must see ONLY what they inject — since #2210 the
// authored line is dense enough that a natural spawn used to wander into a
// grab window mid-gate. The line itself has its own section now.
const clearLine = (gs) => { gs.items.length = 0; gs.nextSpawn = Number.MAX_SAFE_INTEGER }

// drive free-fall out of the system: step until the item resolves
const resolve = (gs, cap = 120) => {
    const n0 = gs.tick
    while (gs.tick - n0 < cap && gs.items.length > 0 && !gs.end) step(gs, [{ a: false }])
}

// ---------------------------------------------------------------- Node gates
section('RULES — the crane')
{
    const gs = makeGame(11, 1)
    while (gs.tick < 40) step(gs, [{}]); clearLine(gs)
    const it = spawnAt(gs, 'can', 200)
    gs.arms[0].x = it.x
    const grabbed = grabFrom(gs, it)
    ok(grabbed, 'CLAMP: the claw grabs what it touches on the belt')
    ok(gs.arms[0].held === it.id && it.carriedBy === 0, 'CARRY: the cargo rides the jaws')
    let hoisted = 0
    while (gs.arms[0].tip > CARRY_TIP && hoisted < 60 && gs.arms[0].held !== null) { step(gs, [{ a: false }]); hoisted++ }
    ok(gs.arms[0].tip <= CARRY_TIP + 0.1, 'HOIST: a caught load auto-raises above the belt')
    const w0 = gs.warnings
    dropOver(gs, CAN_BIN.x + CAN_BIN.w / 2)
    resolve(gs)
    ok(gs.correct >= 1 && gs.binFill[1] >= 1 && gs.warnings === w0, 'JUDGE: CAN into the amber CAN bin pays and counts')
}

section('RULES — wrong bin, floor, fuses')
{
    const gs = makeGame(12, 1)
    while (gs.tick < 40) step(gs, [{}]); clearLine(gs)
    const it = spawnAt(gs, 'crate', 200)
    gs.arms[0].x = it.x
    grabFrom(gs, it)
    const c0 = gs.correct, f0 = gs.binFill[0], w0b = gs.warnings
    dropOver(gs, CRATE_BIN.x + CRATE_BIN.w / 2)
    resolve(gs)
    ok(gs.correct === c0 + 1 && gs.binFill[0] === f0 + 1 && gs.warnings === w0b,
        'JUDGE: CRATE into the cyan CRATE bin scores, fills and keeps fuses lit')
    const it2 = spawnAt(gs, 'can', 200)
    gs.arms[0].x = it2.x
    grabFrom(gs, it2)
    const c1 = gs.correct
    dropOver(gs, CRATE_BIN.x + CRATE_BIN.w / 2)
    resolve(gs)
    ok(gs.correct === c1 && gs.binFill[0] === f0 + 1, 'JUDGE: CAN into the CRATE bin scores NOTHING (wrong bin)')
}
{
    const gs = makeGame(13, 1)
    while (gs.tick < 40) step(gs, [{}]); clearLine(gs)
    const it = spawnAt(gs, 'coil', 200)
    gs.arms[0].x = it.x
    grabFrom(gs, it)
    // release between bins, over the bare floor
    dropOver(gs, 108)
    resolve(gs)
    ok(gs.warnings === 1, 'FUSE: a load dropped on the floor blows a fuse')
    gs.warnings = FUSES - 1
    const it2 = spawnAt(gs, 'crate', 200)
    gs.arms[0].x = it2.x
    grabFrom(gs, it2)
    dropOver(gs, 108)
    resolve(gs)
    ok(gs.end === 'fired' && gs.endReason === 'DROPPED ON FLOOR', 'FUSE: the third bad place fires you')
}

section('RULES — fragile glass')
{
    const slam = makeGame(14, 1)
    while (slam.tick < 40) step(slam, [{}]); clearLine(slam)
    const b1 = spawnAt(slam, 'bottle', 200)
    slam.arms[0].x = b1.x
    grabFrom(slam, b1)
    const w1 = slam.warnings
    dropOver(slam, BOTTLE_BIN.x + BOTTLE_BIN.w / 2)
    resolve(slam)
    ok(slam.correct === 0 && slam.warnings === w1 + 1, 'GLASS: a slam-drop from carry height SHATTERS the bottle')
}
{
    const soft = makeGame(15, 1)
    while (soft.tick < 40) step(soft, [{}]); clearLine(soft)
    const b = spawnAt(soft, 'bottle', 200)
    soft.arms[0].x = b.x
    grabFrom(soft, b)
    let n = 0
    while (soft.arms[0].held !== null && soft.arms[0].tip < CLAW_DOWN - 12 && n < 80) { step(soft, [{ down: true }]); n++ }
    const lowEnough = soft.arms[0].tip >= CLAW_DOWN - 12
    const c2 = soft.correct
    dropOver(soft, BOTTLE_BIN.x + BOTTLE_BIN.w / 2, 400, { down: true })
    resolve(soft)
    ok(lowEnough && soft.correct === c2 + 1 && soft.binFill[2] === 1, 'FEATHER: DOWN-low + release lands a bottle intact')
}

section('RULES — barrels and the line')
{
    const gs = makeGame(16, 1)
    while (gs.tick < 40) step(gs, [{}]); clearLine(gs)
    const br = spawnAt(gs, 'barrel', 200)
    br.rot = 1.1
    gs.arms[0].x = br.x
    const g0 = gs.tick
    while (gs.tick - g0 < 500 && !gs.end && gs.arms[0].held === null && br.onBelt && !gs.fx.some((f) => f.t === 'slip')) {
        grabFrom(gs, br, 400, () => { br.rot = 1.1 })
    }
    ok(gs.fx.some((f) => f.t === 'slip') && gs.arms[0].held === null,
        'SLIP: an off-axis barrel squirts out of the jaws')
    const gs2 = makeGame(16.5 >>> 0, 1)
    while (gs2.tick < 40) step(gs2, [{}]); clearLine(gs2)
    const br2 = spawnAt(gs2, 'barrel', 200)
    br2.rot = 0.1
    gs2.arms[0].x = br2.x
    let caught = false
    const g1 = gs2.tick
    while (gs2.tick - g1 < 500 && !gs2.end && !caught && br2.onBelt) { caught = grabFrom(gs2, br2, 400, () => { br2.rot = 0.1 }) }
    ok(caught, 'BARREL: an upright barrel clamps clean')
}
{
    const gs = makeGame(17, 1)
    while (gs.tick < 40) step(gs, [{}]); clearLine(gs)
    const it = spawnAt(gs, 'can', BELT_END - 4)
    gs.combo = 5
    const s0 = gs.score
    let lost = false
    let n = 0
    while (n < 40 && !lost) { step(gs, [{ a: false }]); lost = gs.ev.some((e) => e.type === 'miss'); n++ }
    ok(lost && gs.combo === 0 && gs.score === Math.max(0, s0 - 50) && gs.warnings === 0,
        'LINE: a piece riding off the end costs 50 + the combo, but not a fuse')
    void it
}

section('ECONOMY — shifts, quota, win')
{
    const gs = makeGame(18, 1)
    const q0 = SHIFTS[0].quota
    gs.correct = q0
    gs.shiftTick = SHIFT_TICKS - 1
    step(gs, [{ a: false }])
    ok(gs.end !== 'fired' && gs.shift === 1 && gs.warnings === 0 && gs.correct === 0 && gs.score >= 500,
        'SHIFT: quota met promotes you, clears fuses, pays 500')
}
{
    const gs = makeGame(19, 1)
    gs.correct = SHIFTS[0].quota - 1
    gs.shiftTick = SHIFT_TICKS - 1
    step(gs, [{ a: false }])
    ok(gs.end === 'fired' && /QUOTA MISSED/.test(gs.endReason), 'QUOTA: short at the whistle = fired')
}
{
    const gs = makeGame(20, 1)
    gs.shift = SHIFTS.length - 1
    gs.correct = SHIFTS[SHIFTS.length - 1].quota
    gs.shiftTick = SHIFT_TICKS - 1
    step(gs, [{ a: false }])
    ok(gs.end === 'win', 'WIN: clearing the last shift completes the contract')
}

section('CLEAN SHIFT — the perfect-sheet law (#2742)')
{
    // one scripted CAN→CAN land on a quiet belt: the sheet stays clean.
    const cleanLand = (gs) => {
        const it = spawnAt(gs, 'can', 200)
        gs.arms[0].x = it.x
        if (!grabFrom(gs, it)) return false
        dropOver(gs, CAN_BIN.x + CAN_BIN.w / 2)
        resolve(gs)
        return gs.arms[0].clean === true
    }
    const fresh = (seed) => { const g = makeGame(seed, 1); while (g.tick < 40) step(g, [{}]); clearLine(g); return g }
    const whistle = (gs, shiftIdx) => {
        gs.correct = SHIFTS[shiftIdx].quota
        gs.shiftTick = SHIFT_TICKS - 1
        step(gs, [{ a: false }])
        return gs.ev.filter((e) => e.type === 'perfect')
    }

    const gs = fresh(40)
    ok(cleanLand(gs), 'CLEAN-FIRE: a scripted correct-bin land keeps the sheet clean')
    {
        const s0 = gs.score, a0 = gs.arms[0].score
        const p = whistle(gs, 0)
        ok(p.length === 1 && p[0].seat === 0 && p[0].shift === 0 && p[0].pts === 200
            && gs.score === s0 + 700 && gs.arms[0].score === a0 + 200,
            `CLEAN-FIRE: quota-clear with a clean sheet pays PERFECT 200 on top of the 500 promotion, into score AND the seat bank (Δscore ${gs.score - s0}, Δbank ${gs.arms[0].score - a0})`)
    }
    {
        const got = []
        let finalOk = true
        for (let i = 0; i < SHIFTS.length; i++) {
            const g = makeGame(41 + i, 1)
            g.shift = i
            const p = whistle(g, i)
            got.push(p.length === 1 ? p[0].pts : 0)
            if (i === SHIFTS.length - 1) finalOk = p.length === 1 && p[0].pts === 350 && g.end === 'win'
        }
        ok(got.join() === '200,250,300,350' && PERFECT_PAY.join() === '200,250,300,350',
            `CLEAN-AMOUNTS: the ladder pays ${got.join('/')} — literals pinned, table agrees`)
        ok(finalOk, 'CLEAN-FINAL: the last shift pays PERFECT 350 before the win closes the book')
    }

    // every fault class the sim records spoils the sheet — one gate each.
    const bustMiss = (g) => {
        spawnAt(g, 'can', BELT_END - 1)
        let n = 0
        while (n < 60 && g.arms[0].clean) { step(g, [{ a: false }]); n++ }
    }
    const bustWrong = (g) => {
        const it = spawnAt(g, 'can', 200)
        g.arms[0].x = it.x
        grabFrom(g, it)
        dropOver(g, CRATE_BIN.x + CRATE_BIN.w / 2) // CAN into CRATE — the law's own wrong-bin
        resolve(g)
    }
    const bustShatter = (g) => {
        const it = spawnAt(g, 'bottle', 200)
        g.arms[0].x = it.x
        grabFrom(g, it)
        dropOver(g, BOTTLE_BIN.x + BOTTLE_BIN.w / 2) // slam from carry height breaks it
        resolve(g)
    }
    const bustFloor = (g) => {
        const it = spawnAt(g, 'crate', 200)
        g.arms[0].x = it.x
        grabFrom(g, it)
        dropOver(g, 108) // between bins, over the bare floor
        resolve(g)
    }
    for (const [name, bust] of [['MISS', bustMiss], ['WRONG', bustWrong], ['SHATTER', bustShatter], ['FLOOR', bustFloor]]) {
        const g = fresh(45)
        bust(g)
        const spoiled = g.arms[0].clean === false
        const p = whistle(g, 0)
        ok(spoiled && p.length === 0, `CLEAN-BUST-${name}: a ${name.toLowerCase()} spoils the sheet — the whistle pays nothing`)
    }
    {
        const g = fresh(46)
        const br = spawnAt(g, 'barrel', 200)
        br.rot = 1.1
        g.arms[0].x = br.x
        const g0 = g.tick
        // short attempts, polled: the slip must land WELL before the belt
        // carries the barrel off the end (206 ticks at line speed) — otherwise
        // the gate tests the wrong law (a miss, not a slip).
        let slipped = false
        while (!slipped && g.tick - g0 < 190 && !g.end && g.arms[0].held === null && br.onBelt) {
            grabFrom(g, br, 45, () => { br.rot = 1.1 })
            slipped = g.fx.some((f) => f.t === 'slip')
        }
        const p = whistle(g, 0)
        ok(slipped && br.onBelt && g.arms[0].clean === true && p.length === 1,
            `CLEAN-SLIP: jaws bouncing off a rolling barrel loses nothing — the sheet forgives, the whistle pays (slip @${g.tick - g0}, perfect ${p.length})`)
    }
    {
        const g = fresh(47)
        ok(cleanLand(g), 'CLEAN-2P setup: seat 0 lands its CAN clean')
        // attribute a CAN→CRATE wrong-bin to seat 1 directly: the crane that
        // mislabelled it carries the fault, not the belt.
        const it = { id: 9500, n: 500, kind: 'can', x: CRATE_BIN.x + CRATE_BIN.w / 2, y: BIN_TOP - 2, vx: 0, vy: 1, rot: 0, onBelt: false, carriedBy: -1, fragile: false, lastSeat: 1 }
        g.players = 2
        g.arms.push({ x: 300, vx: 0, tip: 52, mode: 'up', held: null, clamp: 0, score: 0, clean: true, target: -1, walk: 0, commit: 0 })
        g.items.push(it)
        let n = 0
        while (n < 40 && g.items.length && g.arms[1].clean) { step(g, [{ a: false }, { a: false }]); n++ }
        ok(g.arms[1].clean === false && g.arms[0].clean === true,
            'CLEAN-2P: a wrong bin attributed to seat 1 blemishes ONLY seat 1')
        const b0 = g.arms[0].score, b1 = g.arms[1].score
        const p = whistle(g, 0)
        ok(p.length === 1 && p[0].seat === 0 && g.arms[0].score === b0 + 200 && g.arms[1].score === b1,
            'CLEAN-2P: the whistle pays one seat a clear sheet and nothing to the blemished one')
    }
    {
        const g = fresh(48)
        bustWrong(g)
        whistle(g, 0) // quota met but blemished: promotion, no pay
        ok(g.shift === 1 && g.arms[0].clean === true, 'CLEAN-RESET: crossing the whistle opens a brand-new sheet (the blemish is last shift\'s)')
        ok(cleanLand(g), 'CLEAN-RESET setup: shift 2 starts clean')
        const p = whistle(g, 1)
        ok(p.length === 1 && p[0].pts === 250 && p[0].shift === 1,
            'CLEAN-RESET: a clean shift 2 pays 250 even after a blemished shift 1')
    }
    {
        const g = makeGame(49, 1)
        g.correct = SHIFTS[0].quota - 1
        g.shiftTick = SHIFT_TICKS - 1
        step(g, [{ a: false }])
        ok(g.end === 'fired' && !g.ev.some((e) => e.type === 'perfect'),
            'CLEAN-SHORT: quota short at the whistle is fired — a clean sheet never buys the shift')
    }
    {
        const g = fresh(50)
        cleanLand(g)
        const raw = g.rng
        let draws = 0
        g.rng = () => { draws++; return raw() }
        whistle(g, 0)
        ok(draws === 0, `CLEAN-NO-RNG: the perfect payout consumes ZERO seeded draws (${draws}) — pure bookkeeping, the line is untouched`)
    }
    {
        const runOnce = (seed) => {
            const g = makeGame(seed, 1)
            let banked = 0
            for (let t = 0; t < 20000 && !g.end; t++) {
                step(g, [autopilot(g, 0)])
                for (const e of g.ev) if (e.type === 'perfect') banked++
            }
            return { banked, score: g.score, hash: g.hash, won: g.end === 'win' }
        }
        const a = runOnce(7), b = runOnce(7), c = runOnce(101), d = runOnce(2027)
        ok(a.banked === b.banked && a.hash === b.hash && a.score === b.score,
            'CLEAN-DETERMINISM: two autopilot runs of seed 7 bank identical perfects to identical hashes')
        ok([a.won, c.won, d.won].every(Boolean),
            'CLEAN-WINS: the perfect law never breaks the shipped autopilot\'s wins (7/101/2027 still complete the contract)')
        const m = [7, 101, 2027].map((sd, i) => `${sd}×${[a, c, d][i].banked}`).join(' ')
        ok([a, c, d].some((r) => r.banked > 0),
            `CLEAN-AUTO: the CPU earns the gold moment too — measured ${m} (attract shows the law; zero would mean the reward is unreachable in the demo)`)
    }
    ok(PERFECT_SPOIL.join() === 'miss,wrong,shatter,floor',
        `CLEAN-SPOIL: the spoil table is exactly the sim's fault classes (${PERFECT_SPOIL.join('/')}) — grip slips stay excused`)
}

section('WAVES — the authored line (#2210)')
{
    // Collect (shift, kind, tick) for every piece the sim puts on the belt.
    const lineRun = (seed, players = 1) => {
        const gs = makeGame(seed, players)
        const out = []
        let lastId = 0
        while (!gs.end && gs.tick < SHIFTS.length * SHIFT_TICKS + 900) {
            step(gs, players > 1 ? [autopilot(gs, 0), autopilot(gs, 1)] : [autopilot(gs, 0)])
            for (const it of gs.items) {
                if (it.id > lastId) { lastId = it.id; out.push({ shift: gs.shift, kind: it.kind, tick: gs.tick }) }
            }
        }
        return { gs, out }
    }
    const flat = (shift) => WAVES[Math.min(shift, WAVES.length - 1)].flatMap((w) => w.kinds)

    const a = lineRun(7), b = lineRun(2027)
    const kA = a.out.filter((x) => x.shift === 0).map((x) => x.kind)
    const kB = b.out.filter((x) => x.shift === 0).map((x) => x.kind)
    const want = flat(0)
    const n0 = Math.min(kA.length, kB.length)   // jitter may land one extra tail piece
    const cyc = Array.from({ length: n0 }, (_, i) => want[i % want.length])
    ok(n0 >= 2 * want.length && kA.slice(0, n0).join() === kB.slice(0, n0).join()
        && kA.slice(0, n0).join() === cyc.join(),
        `AUTHORED ORDER: shift-1 streams seed 7 ≡ seed 2027 ≡ the WAVES table cycled (${n0} pieces, ${(n0 / want.length).toFixed(1)} cycles)`)

    const byShift = [0, 1, 2, 3].map((sh) => new Set(a.out.filter((x) => x.shift === sh).map((x) => x.kind)))
    const eraOk = ['crate', 'can', 'coil'].every((k) => byShift[0].has(k)) && !['bottle', 'barrel', 'scrap'].some((k) => byShift[0].has(k))
        && byShift[1].has('bottle') && !byShift[1].has('scrap')
        && byShift[2].has('barrel') && !byShift[2].has('scrap')
        && byShift[3].has('scrap') && byShift[3].has('bottle')
    ok(eraOk, `ERA LADDER: waves introduce kinds per shift (${byShift.map((x) => [...x].sort().join('+')).join(' | ')})`)

    const gaps0 = a.out.filter((x) => x.shift === 0).map((x) => x.tick)
    const dg = gaps0.slice(1).map((t, i) => t - gaps0[i])
    const dset = [...new Set(dg)].sort((p, q) => p - q)
    const med = dset[Math.floor(dset.length / 2)]
    ok(dset.length >= 3 && Math.max(...dg) - med >= 40,
        `BREATHING: shift-1 pacing runs ${dset.length} distinct gaps, burst ${Math.min(...dg)}–${med} mid, breather ${Math.max(...dg)} — not one flat hum`)

    const supply = [0, 1, 2, 3].map((sh) => a.out.filter((x) => x.shift === sh).length)
    ok(supply.every((n, i) => n >= SHIFTS[i].quota + 18),
        `SUPPLY: the waves feed ${supply.join('/')} vs quota ${SHIFTS.map((q) => q.quota).join('/')} (≥18 headroom of pieces)`)

    {
        const gs = makeGame(7, 1)
        const names = []
        while (!gs.end && gs.tick < SHIFT_TICKS + 600) {
            step(gs, [autopilot(gs, 0)])
            for (const e of gs.ev) if (e.type === 'wave') names.push(e.name)
            if (gs.shift > 0) break
        }
        ok(names.length >= 2 && names[0] === WAVES[0][1].name,
            `WAVE CUE: the carry announces incoming waves by name (${names.slice(0, 3).join(' → ')})`)
    }
    {
        // CUE FAMILY (#2214): every announcement carries the section's voice so
        // the synth can vary per family. Pinned name-by-name against an
        // expectation table written independently of the sim's derivation —
        // glass outranks barrels, the rest read by their own goods.
        const FAMILY = {
            'SINGLE FILE': 'steady', 'CRATE & COIL': 'steady', 'EARLY BURST': 'steady',
            'TWIN PACK': 'steady', 'GLASS RUN': 'glass', 'LINE STEADY': 'steady',
            'BARREL ROLL': 'heavy', 'GLASS PAIR': 'glass', 'HEAVY LINE': 'steady',
            'SCRAP HEAPS': 'grim', 'RUSH HOUR': 'steady', 'GLASS GAMBLE': 'glass',
        }
        const gs = makeGame(7, 1)
        const seen = []
        const bad = []
        while (!gs.end && gs.tick < SHIFTS.length * SHIFT_TICKS + 900) {
            step(gs, [autopilot(gs, 0)])
            for (const e of gs.ev) if (e.type === 'wave') {
                seen.push(e.family)
                const w = WAVES.flat().find((x) => x.name === e.name)
                if (!w || e.family !== FAMILY[e.name] || e.kinds.join() !== w.kinds.join()) bad.push(e.name)
            }
        }
        const fams = [...new Set(seen)].sort()
        ok(seen.length >= 4 && fams.length >= 3 && bad.length === 0,
            `CUE FAMILY: each announcement names the next wave AND its voice (${fams.join('+')} across ${seen.length})` + (bad.length ? ` — WRONG: ${bad.join(',')}` : ''))
    }
}

section('AMB — per-shift ambience (#2234)')
{
    ok(zoneForShift(0) === 0 && zoneForShift(1) === 0 && zoneForShift(2) === 1 && zoneForShift(3) === 2 && zoneForShift(9) === 2,
        `AMB ZONE: eras map shifts 1–2/3/4+ to early/glass/graveyard (${[0, 1, 2, 3, 9].map(zoneForShift).join('/')})`)

    const zA = AMB_ZONES[0], zB = AMB_ZONES[1], zC = AMB_ZONES[2]
    ok(zA.cues.beep.every > zB.cues.beep.every && zB.cues.beep.every > zC.cues.beep.every
        && zA.hum < zB.hum && zB.hum < zC.hum
        && zA.sub === 0 && zB.sub > 0 && zC.sub > zB.sub,
        `AMB CADENCE: beeps tighten ${zA.cues.beep.every}/${zB.cues.beep.every}/${zC.cues.beep.every} and the bed deepens ${zA.hum}/${zB.hum}/${zC.hum} across the night`)

    const beepTicks = []
    for (let t = 0; t <= 1620; t++) if (fireAt(0, t, true).includes('beep')) beepTicks.push(t)
    ok(JSON.stringify(beepTicks) === '[90,630,1170]',
        `AMB SCHEDULE: the quiet floor beeps at exact ticks ${beepTicks.join('/')} — pure schedule, no rng`)

    let bleed = 0
    for (let t = 0; t <= SHIFT_TICKS; t++) {
        if (fireAt(0, t, true).includes('hiss') || fireAt(0, t, true).includes('chatter')) bleed++
        if (fireAt(1, t, true).includes('chatter')) bleed++
    }
    ok(bleed === 0, 'AMB ERAS: no pneumatics on the early floor, no chatter before the graveyard peak')

    let leaked = 0
    for (let t = 0; t <= 2000; t++) if (fireAt(t % 3, t, false).length) leaked++
    ok(leaked === 0, 'AMB DOOR: no cue fires while the line is not running (attract/over stay clean)')
}

section('POLISH — wave read + card clearance (#2223)')
{
    // PIP-SOURCE + WAVE-STEP: the lamp row's data (kind count + spawn index)
    // must stay well-formed, and every announcement carries the line slot its
    // cue pitch steps to.
    const gs = makeGame(7, 1)
    const names = []
    const bad = []
    let kiBad = 0
    while (gs.tick < 1400) {
        step(gs, [{}])
        const waves = WAVES[Math.min(gs.shift, WAVES.length - 1)]
        const w = waves[gs.wave.wi]
        if (gs.wave.ki > w.kinds.length) kiBad++
        for (const e of gs.ev) {
            if (e.type !== 'wave') continue
            names.push(`${e.name}@${e.wi}`)
            if (typeof e.wi !== 'number' || !waves[e.wi] || waves[e.wi].name !== e.name) bad.push(e.name)
        }
    }
    ok(bad.length === 0 && names.length >= 2,
        `WAVE-STEP: every announcement names its slot so the cue steps 0/+2/+4 st (${names.slice(0, 3).join(' → ')})` + (bad.length ? ` — WRONG: ${bad.join(',')}` : ''))
    ok(kiBad === 0, 'PIP-SOURCE: the spawn index never exceeds the wave length (the lamp row always has a size)')
}
{
    // SHIFT-CARD: the SHIFT CLEAR card owns the middle of the screen for the
    // whole breather — the wave marquee (belt mouth, lives 46 ticks) must
    // never be able to fire under it. Bands: card 94–114, marquee 56–74, and
    // the first announcement after a shift change lands clear of the card.
    ok(BELT_Y - 40 + 18 <= VIEW_H / 2 - 26,
        'SHIFT-CARD: the marquee band (belt mouth) sits above the CLEAR card band (screen mid)')
    const gs = makeGame(1, 2)
    const gaps = []
    let pending = null
    let guard = 0
    while (!gs.end && guard++ < 60000) {
        step(gs, [autopilot(gs, 0), autopilot(gs, 1)])
        for (const e of gs.ev) {
            if (e.type === 'shift') pending = gs.tick
            else if (e.type === 'wave' && pending !== null) { gaps.push(gs.tick - pending); pending = null }
        }
    }
    ok(gs.end === 'win' && gaps.length >= 3 && gaps.every((g) => g > 46),
        `SHIFT-CARD: first marquee of shifts 2–4 lands ${gaps.join('/')} ticks after the CLEAR card — past its 46-tick life`)
}

section('DETERMINISM — seed + pads = hashes')
{
    const script = (i) => ({ left: i % 43 < 17, right: i % 43 >= 21 && i % 43 < 38, down: i % 67 < 6, a: i % 13 < 2, b: i % 37 === 0 })
    const run = (seed) => {
        const g = makeGame(seed, 1)
        const hs = []
        for (let i = 0; i < 600; i++) { step(g, [script(i)]); if (i % 100 === 99) hs.push(g.hash) }
        return { final: JSON.stringify(g), hs }
    }
    const a = run(7), b = run(7), c = run(8)
    ok(a.final === b.final && a.hs.join() === b.hs.join(), 'DETERMINISM: same seed + same pads run twice → identical states and hashes')
    ok(a.final !== c.final, 'SEEDS DIFFER: seed 8 diverges from seed 7')
}

section('WIN PROOF — the shipped autopilot clears every shift')
for (const seed of [7, 101, 2027]) {
    const gs = makeGame(seed, 1)
    const per = []
    let sh = 0, prev = 0
    while (!gs.end && gs.tick < SHIFTS.length * SHIFT_TICKS + 900) {
        step(gs, [autopilot(gs, 0)])
        if (gs.shift !== sh) { per.push(prev); sh = gs.shift } else prev = gs.correct
        prev = gs.correct
    }
    per.push(prev)
    const need = SHIFTS.map((x) => x.quota)
    const clearedAll = gs.end === 'win' && per.length >= need.length && per.every((v, i) => v >= need[i] + 2)
    ok(clearedAll, `AUTOPILOT seed ${seed}: ${gs.end || 'unfinished'} per-shift ${per.join('/')} vs quota ${need.join('/')} (≥2 headroom each)`)
}

section('HEAD-TO-HEAD — the parity rival keeps it honest')
for (const seed of [7, 101, 2027]) {
    const gs = makeGame(seed, 2)
    while (!gs.end && gs.tick < SHIFTS.length * SHIFT_TICKS + 900) step(gs, [autopilot(gs, 0), autopilot(gs, 1)])
    const p1 = gs.arms[0].score, p2 = gs.arms[1].score
    const ratio = p2 / (p1 + 1)
    ok(gs.end === 'win' && ratio > 0.5 && ratio < 1.5, `RIVAL seed ${seed}: win=${gs.end === 'win'} banks ${p1} vs ${p2} (ratio ${ratio.toFixed(2)})`)
}

section('STATE — motion carriers (#1184)')
{
    const gs = makeGame(21, 2)
    while (gs.tick < 300) step(gs, [autopilot(gs, 0), autopilot(gs, 1)])
    ok(typeof gs.arms[0].x === 'number' && typeof gs.arms[1].x === 'number' && gs.items.length > 0,
        'CARRIERS: arm positions + cargo are in the sim state (pos/clawY ride the contract)')
}

section('JUICE — bin meters, full lamp, cable whip are render-only (#2678)')
{
    // Caps are hardcoded 12 on purpose: the vis mutant freezes the law, and a
    // pin that asked the law what it currently is would let any mutant survive.
    const st = makeBinVis(1)[0]
    const fired = []
    for (let k = 1; k <= 12; k++) if (stepBinVis(st, k)) fired.push(k)
    ok(fired.length === 1 && fired[0] === 12 && st.fill === 0 && st.flash > 0,
        'BIN-METER: counts 1..11 stay quiet, the 12th thunks — lamp lights, column wraps to 0')
    let fired2 = 0
    for (let k = 13; k <= 24; k++) if (stepBinVis(st, k)) fired2++
    ok(fired2 === 1 && st.fill === 0, 'BIN-METER: refills exactly to cap — no double-thunk, no drift')
    const rst = makeBinVis(1)[0]
    stepBinVis(rst, 7)
    ok(!stepBinVis(rst, 0) && rst.fill === 0 && rst.base === 0,
        'BIN-METER: a fresh game heals the counter silently — no phantom thunk on restart')
}
{
    // The visual accounting equals the line's real drop accounting, seed-exact.
    const vis = makeBinVis(BINS.length)
    let triggers = 0
    const gs = makeGame(7, 2)
    while (!gs.end && gs.tick < SHIFTS.length * SHIFT_TICKS + 900) {
        step(gs, [autopilot(gs, 0), autopilot(gs, 1)])
        for (let i = 0; i < BINS.length; i++) if (stepBinVis(vis[i], gs.binFill[i])) triggers++
    }
    const floorSum = gs.binFill.reduce((a, f) => a + Math.floor(f / 12), 0)
    ok(triggers >= 1 && triggers === floorSum,
        `BIN-METER accounting matches real drops: ${triggers} thunks === Σ floor(binFill/12) = ${floorSum}`)
}
{
    // Hash-clean: twin seeds, one driven with the juice stepping every frame.
    const drive = (juice) => {
        const gs = makeGame(31, 2)
        const vis = makeBinVis(BINS.length)
        const ws = [makeWhip(), makeWhip()]
        while (gs.tick < 600) {
            step(gs, [autopilot(gs, 0), autopilot(gs, 1)])
            if (juice) {
                for (let i = 0; i < BINS.length; i++) stepBinVis(vis[i], gs.binFill[i])
                for (let a = 0; a < 2; a++) stepWhip(ws[a], whipTarget(gs.arms[a].vx))
            }
        }
        return stateHash(gs)
    }
    ok(drive(true) === drive(false), 'SIM-CLEAN: twin seeds hash identically with and without the juice — render never reaches the sim (#1142)')
}
{
    const w = makeWhip()
    for (let t = 0; t < 160; t++) stepWhip(w, whipTarget(2.5)) // steady east slide
    ok(Math.abs(w.y + 4) < 0.3, `WHIP-SPRING: a steady slide settles at the classic trailing tilt (${w.y.toFixed(1)} px)`)
    let maxY = -9, maxAbs = 0
    for (let t = 0; t < 160; t++) { stepWhip(w, whipTarget(-2.5)); maxY = Math.max(maxY, w.y); maxAbs = Math.max(maxAbs, Math.abs(w.y)) }
    ok(maxY >= 4.2, `WHIP-SPRING: reversing overshoots the static tilt (+${maxY.toFixed(1)} px past +4) — the cable head keeps travelling`)
    ok(maxAbs <= BIN_VIS.clamp + 1e-9, `WHIP-SPRING: the offset stays clamped (max ${maxAbs.toFixed(1)} ≤ ${BIN_VIS.clamp}) — the cable never paints off the crane`)
    for (let t = 0; t < 240; t++) stepWhip(w, whipTarget(0))
    ok(Math.abs(w.y) < 0.05, 'WHIP-SPRING: at rest the cable hangs straight again')
}

section('INERTIA — carriage ease-in/out, render-only (#2755)')
{
    // The paint rides a heavy spring off the SAME sim clock the gates drive:
    // press deepens the lag, release glides out, rest lands EXACTLY on the sim.
    const gs = makeGame(7, 1)
    const c = makeCraneVis()
    const twin = []
    let clamped = true, trailGrew = true, peak = 0, prevAbs = 0
    for (let t = 0; t < 30; t++) {
        step(gs, [{ right: true }])
        stepCrane(c, gs.arms[0].vx)
        twin.push([gs.arms[0].x, gs.hash])
        if (Math.abs(c.off) > CRANE.clamp + 1e-9) clamped = false
        // ramp proof: the lag deepens strictly through the first four ticks and
        // carries most of its steady lean by t4 (a hard snap would be full at t1)
        if (t > 0 && t <= 4) trailGrew = trailGrew && Math.abs(c.off) > prevAbs
        if (t === 4) trailGrew = trailGrew && Math.abs(c.off) >= 0.6 * CRANE.trail
        peak = Math.max(peak, -c.off) // rightward => paint sits BEHIND (off < 0)
        prevAbs = Math.abs(c.off)
    }
    // sequential twin (item ids ride a module counter — interleaved games would
    // compare id 1 vs id 2, #1142's determinism gates all re-make between runs)
    const gs2 = makeGame(7, 1)
    let desync = false, desyncAt = -1
    for (let t = 0; t < 30; t++) {
        step(gs2, [{ right: true }])
        if (gs2.arms[0].x !== twin[t][0] || gs2.hash !== twin[t][1]) { desync = true; if (desyncAt < 0) desyncAt = t }
    }
    ok(!desync, `INERTIA-SIM-PURE: the seed-7 stream ticks identical positions + hashes against the ease-less twin — pad law and state hashes never see the carriage weight${desyncAt >= 0 ? ` (first diff tick ${desyncAt})` : ''}`)
    ok(peak >= 1.2, `INERTIA-TRAIL: a held press paints the carriage behind the sim, deepening to ${peak.toFixed(2)} px (≥1.2) — a 1.4-ton gantry does not stop dead`)
    ok(trailGrew, `INERTIA-EASE-IN: the lag deepens tick over tick through the ramp (peak ${peak.toFixed(2)}) — the carriage spins up, it never snaps`)
    ok(clamped, `INERTIA-CLAMP: the lag stays inside ${CRANE.clamp} px — the paint never drifts off the rail`)
    const off0 = c.off
    let glideTicks = 0, rebound = 0
    for (let t = 0; t < 600; t++) {
        step(gs, [{}])
        stepCrane(c, gs.arms[0].vx)
        if (Math.abs(c.off) > 0.02) glideTicks = t + 1
        rebound = Math.max(rebound, c.off) // gliding past rest the other way = rail flex
    }
    ok(off0 < -0.5 && glideTicks >= 3, `INERTIA-EASE-OUT: released, the paint glides ${glideTicks} ticks from ${off0.toFixed(2)} px toward rest — mass, not a switch`)
    ok(rebound >= 0.25, `INERTIA-REBOUND: the stop flexes the rail ${rebound.toFixed(2)} px past rest before settling — the gantry nods like a crane`)
    ok(c.off === 0 && c.v === 0, 'INERTIA-REST: at rest the paint sits EXACTLY on the sim position — the #1184 PIXELS sampling law keeps holding')
}

section('FEATHER — one-time first-shift lesson at the claw (#2755)')
{
    const gs = makeGame(7, 1)
    const cv = makeFeatherCue()
    const litShifts = new Set()
    let firedAt = -1, firedShift = -1, maxLit = 0
    for (let t = 0; t < SHIFT_TICKS * 4 + 600 && !gs.end; t++) {
        step(gs, [autopilot(gs, 0)])
        stepFeatherCue(cv, gs, 0)
        if (cv.t > 0) {
            litShifts.add(gs.shift)
            maxLit = Math.max(maxLit, cv.t)
            if (firedAt < 0) { firedAt = gs.tick; firedShift = gs.shift }
        }
    }
    ok(firedAt > 0 && firedShift === 1, `FEATHER-FIRE: the first bottle of the line arms the lesson (tick ${firedAt}, shift index ${firedShift} — the glass era) — a fresh player is taught the glass law BEFORE the slam meter needs it`)
    ok(litShifts.size === 1 && litShifts.has(1), 'FEATHER-ERA: the cue never burns outside the glass era — gone by the third shift, exactly as owed')
    ok(maxLit === FEATHER_CUE.ticks && cv.t === 0, `FEATHER-DECAY: armed at the lift, it fades on its own ${FEATHER_CUE.ticks}-tick clock — it never nags`)
    ok(cv.shown, 'FEATHER-ONCE: the lesson marks itself shown once armed — one lesson, not a caption track')
    const gs3 = makeGame(7, 1)
    const cv3 = makeFeatherCue()
    cv3.shown = true // a seat that already learned
    let lit3 = 0
    for (let t = 0; t < SHIFT_TICKS * 3 + 600 && !gs3.end; t++) { step(gs3, [autopilot(gs3, 0)]); stepFeatherCue(cv3, gs3, 0); if (cv3.t > 0) lit3++ }
    ok(lit3 === 0, 'FEATHER-LEARNED: after the first lesson the floor stays quiet all contract long')
}

section('DEMO-REP — attract rotation teaches the three risk laws (#2755)')
{
    // The old 1337+(n%97) rotation opened every demo at shift 1, where none of
    // the risk laws exist yet. The rotation now pre-rolls measured seeds into
    // the busy era; re-measure every pinned seed from the PREROLL mark here.
    const src = readFileSync(new URL('../src/games/PickRush/index.jsx', import.meta.url), 'utf8')
    const ms = src.match(/DEMO_SEEDS = \[(\d+), (\d+), (\d+)\]/)
    const mp = src.match(/DEMO_PREROLL = (\d+)/)
    ok(!!ms && !!mp, 'DEMO-SEEDS: the attract spins three pinned seeds behind a pinned pre-roll')
    if (ms && mp) {
        const seeds = [+ms[1], +ms[2], +ms[3]]
        const PREROLL = +mp[1]
        ok(new Set(seeds).size === 3, `DEMO-SET: three distinct seeds (${seeds.join(', ')})`)
        let unionSlip = false, unionBottle = false, unionCatch = false
        for (const seed of seeds) {
            const g = makeGame(seed, 2)
            let slip = 0, bottle = 0, catchB = 0, tSlip = 1e9, tBottle = 1e9, tCatch = 1e9
            for (let t = 0; t < 30000 && !g.end; t++) {
                step(g, [autopilot(g, 0), autopilot(g, 1)])
                if (g.tick <= PREROLL) continue
                for (const e of g.ev) {
                    if (e.type === 'slip') { slip++; tSlip = Math.min(tSlip, g.tick - PREROLL) }
                    else if (e.type === 'drop' && e.kind === 'bottle') { bottle++; tBottle = Math.min(tBottle, g.tick - PREROLL) }
                    else if (e.type === 'drop' && e.kind === 'barrel') { catchB++; tCatch = Math.min(tCatch, g.tick - PREROLL) }
                }
            }
            ok(slip >= 5 && bottle >= 5 && catchB >= 5 && g.endReason === 'ALL SHIFTS CLEARED',
                `DEMO-REP[${seed}]: shows slips ${slip}, feathered bottle lands ${bottle}, barrel catches ${catchB} and still clears the contract`)
            ok(tSlip <= 400 && tBottle <= 700 && tCatch <= 1200,
                `DEMO-LAW-CLOCK[${seed}]: slip @${tSlip}, glass land @${tBottle}, barrel catch @${tCatch} ticks after the pre-roll — five seconds of attract, three laws`)
            unionSlip = unionSlip || tSlip <= 400; unionBottle = unionBottle || tBottle <= 700; unionCatch = unionCatch || tCatch <= 1200
        }
        ok(unionSlip && unionBottle && unionCatch, 'DEMO-UNION: across one spin the rotation shows every risk law inside the first screenful of seconds')
        ok(!src.includes('demoAt % 97'), 'DEMO-OLD-ROTATION: the unmeasured 1337+(n%97) seed counter is gone')
    }
}

section('INTERIOR — stacked silhouettes + a voice per bin (#2739)')
{
    // The stack rides beside the meter, one push per drop: same law, same wrap.
    const st = makeBinVis(1)[0]
    let aligned = true, wrapped = null
    for (let k = 1; k <= 12; k++) {
        pushBinKind(st, k % 2 ? 'can' : 'barrel')
        if (stepBinVis(st, k)) wrapped = k
        else aligned = aligned && st.stack.length === st.fill && st.stack.length === k
    }
    ok(aligned && wrapped === 12 && st.fill === 0 && st.stack.length === 0,
        'STACK-MIRROR: silhouettes climb one per drop and vanish on the wrap — stack.length === fill every tick')
    ok(st.ghost.length === 12 && st.settle === 14,
        'SETTLE: the thunked pallet ghosts its 12 pieces, pressed, for 14 ticks')
    for (let t = 0; t < 14; t++) stepBinVis(st, 12)
    ok(st.settle === 0, 'SETTLE: the pancake fades out and the empty bin reads empty')
    const rst = makeBinVis(1)[0]
    pushBinKind(rst, 'crate'); stepBinVis(rst, 0) // meter at zero, one stale push
    ok(!stepBinVis(rst, 0) && rst.fill === 0 && rst.stack.length === 0,
        'STACK-HEAL: a rewound meter truncates stale silhouettes — no phantom crate at zero')
    const wg = makeBinVis(1)[0]
    for (let k = 1; k <= 12; k++) { pushBinKind(wg, 'can'); stepBinVis(wg, k) } // wrap once, then refill
    pushBinKind(wg, 'crate'); stepBinVis(wg, 13)
    wg.settle = 9
    ok(!stepBinVis(wg, 0) && wg.base === 0 && wg.stack.length === 0 && wg.ghost.length === 0 && wg.settle === 0,
        'STACK-HEAL: a fresh game below the wrap base clears silhouettes, the ghost and the settle silently')
}
{
    // Seed-exact: drive the real line, push kinds exactly as the shell does,
    // and the interiors mirror the meter for every bin on every tick.
    const gs = makeGame(7, 2)
    const vis = makeBinVis(BINS.length)
    const hist = BINS.map(() => [])
    let lies = 0, drops = 0
    while (!gs.end && gs.tick < SHIFTS.length * SHIFT_TICKS + 900) {
        step(gs, [autopilot(gs, 0), autopilot(gs, 1)])
        for (const e of gs.ev) if (e.type === 'drop') { pushBinKind(vis[e.bin], e.kind); hist[e.bin].push(e.kind); drops++ }
        for (let i = 0; i < BINS.length; i++) {
            stepBinVis(vis[i], gs.binFill[i])
            if (vis[i].stack.length !== vis[i].fill) lies++
        }
    }
    ok(drops >= 12, `LINE-PUSH: seed 7's whole line banks ${drops} drops — enough to wrap pallets`)
    ok(lies === 0, `LINE-MIRROR: interior stack === meter fill for every bin, every tick (seed 7 full line)`)
    const b1 = hist[1], s1 = vis[1].stack
    ok(s1.length === 0 || s1.join(',') === b1.slice(-s1.length).join(','),
        'LINE-KINDS: the CAN bin\'s live stack IS the tail of its real drop kinds (barrels among cans)')
}
{
    // One voice per bin, pinned by literal — five distinct notes, distinct gains.
    const want = [110, 124, 147, 98, 87]
    ok(DROP_THUD.length === want.length && DROP_THUD.every((t, i) => t.hz === want[i] && t.gain > 0 && t.gain < 0.1),
        'VOICE-PIN: CRATE 110 · CAN 124 · BOTTLE 147 · COIL 98 · SCRAP 87 Hz, gains in range — each bin audible as itself')
    ok(new Set(DROP_THUD.map((t) => t.hz)).size === 5, 'VOICE-SET: five distinct thud notes — the line never drones one note')
    ok(dropVoice(0, 3).double === false && dropVoice(2, 4).double === true && dropVoice(4, 9).double === true && dropVoice(0).double === false,
        'DOUBLE-TINK: the streak chime rides combo ≥ 4 only (and stays quiet without a combo)')
    ok(dropVoice(0, 4).hz === DROP_THUD[0].hz && dropVoice(1, 4).gain === DROP_THUD[1].gain,
        'VOICE-PICK: dropVoice hands the caller the bin\'s own note and gain')
    const src = readFileSync(new URL('../src/games/PickRush/index.jsx', import.meta.url), 'utf8')
    ok(src.includes('dropVoice(bi, e.combo)') && src.includes('pushBinKind(binVis[bi], e.kind)'),
        'SOURCE: the shell\'s drop event rings dropVoice AND pushes the landed kind')
    ok(/2093, 0\.05, 'sine'/.test(src) && /2637, 0\.05, 'sine'/.test(src),
        'SOURCE: the combo double-tink (2093→2637 sine pair) is wired in the painter\'s file')
    ok(/drawItem\(ctx, vis\.stack\[k\] \|\| b\.kind/.test(src) && /drawItem\(ctx, vis\.ghost\[k\]/.test(src),
        'SOURCE: bins paint their own landed silhouettes (stack) and the settle pancake (ghost) via drawItem')
}

section('TELL — the grab-read telegraphs never lie (#2684)')
{
    // RING-TRUTH: over a real rolling line, every painted ring agrees with
    // the jaw law it mirrors — green only on frames a clamp would bite.
    const gs = makeGame(7, 2)
    let seenOk = 0, seenOff = 0, lies = 0, dirty = 0
    while (!gs.end && gs.tick < SHIFTS.length * SHIFT_TICKS + 900) {
        step(gs, [autopilot(gs, 0), autopilot(gs, 1)])
        const h0 = gs.hash
        for (const it of gs.items) {
            if (!it.onBelt || it.carriedBy !== -1) continue
            const r = catchRing(it)
            if (!r) continue
            if (r === 'ok') seenOk++; else seenOff++
            if (r !== (barrelUpright(it) ? 'ok' : 'off')) lies++
        }
        for (let s2 = 0; s2 < gs.arms.length; s2++) {
            const j1 = jawWarn(gs, s2), j2 = jawWarn(gs, s2)
            const t1 = JSON.stringify(slamTell(gs, s2)), t2 = JSON.stringify(slamTell(gs, s2))
            if (j1 !== j2 || t1 !== t2) dirty++
        }
        if (gs.hash !== h0 || stateHash(gs) !== h0) dirty++
    }
    ok(seenOk >= 20 && seenOff >= 20 && lies === 0,
        `RING-TRUTH: seed 7's line ran ${seenOk} catchable / ${seenOff} off-axis barrel frames — ring ≡ barrelUpright on every one (a tell that never flips, or ever lies, goes red here)`)
    ok(dirty === 0,
        `TELL-PURE: ring/jaw/slam reads are idempotent and leave the state hash unmoved across the whole line (${dirty} dirty frames)`)
}

section('AIM — rival intent & ring ownership (#2690 QA)')
{
    // AIM-TRUTH: over seed 7's real 2P line the foreman's intent tell names
    // a live piece of HIS parity — and never lies about the brain's pick:
    // while the claw is empty and up that pick is the nearest reachable
    // parity piece, re-derived HERE from the parity law the README documents
    // (not imported from autopilot's source), so a helper that drifts goes red.
    const gs = makeGame(7, 2)
    let seen = 0, lies = 0, stale = 0, dirty = 0
    while (!gs.end && gs.tick < SHIFTS.length * SHIFT_TICKS + 900) {
        step(gs, [autopilot(gs, 0), autopilot(gs, 1)])
        const h0 = gs.hash
        const a = craneAim(gs, 1)
        const arm = gs.arms[1]
        if (a) {
            seen++
            const it = gs.items.find((i2) => i2.id === a.id)
            if (!(it.onBelt && it.carriedBy === -1)) lies++
            if (((it.n ?? 0) % 2) !== 1) lies++ // parity ownership, spelled out again
            if (arm.held === null && arm.mode === 'up') {
                // Reconstruct the frame the BRAIN saw: it picked from the PRE-step
                // snapshot, and the harness reads POST-step (#2214 drift family).
                // arm.vx is recorded per tick, every free piece rode the belt one
                // vb, and pieces born this tick (px at the mouth) were not yet on
                // the line for the brain. In that frame the predicates are the
                // autopilot's own, so id equality is exact — the 6 px tolerance
                // only forgives the rare ARM_MAX clamp where vx lies about how far
                // the claw actually travelled.
                const ax = arm.x - (arm.vx || 0)
                const vbq = 1.05 * SHIFTS[Math.min(gs.shiftTick === 0 && gs.tick > 1 ? gs.shift - 1 : gs.shift, SHIFTS.length - 1)].speed
                let best = a, bx = a.x - vbq // the aim is always a candidate (outer checks prove it live+odd)
                for (const it2 of gs.items) {
                    if (it2.carriedBy !== -1 || !it2.onBelt || it2.id === a.id) continue
                    const px = it2.x - vbq
                    if (px <= -11.99) continue // born this tick — invisible to the brain
                    if (px > BELT_END - 24) continue
                    if (((it2.n ?? 0) % 2) !== 1) continue // parity ownership, spelled out again
                    if (px < ax - 40) continue
                    if (px < bx) { best = it2; bx = px }
                }
                if (best.id !== a.id && Math.abs(bx - (a.x - vbq)) > 6) lies++ // nearer head-of-line ignored: a lie
                if (bx <= ax - 40 || bx > BELT_END - 24) stale++ // nothing truly in the brain's window: honest memory
            }
        }
        const a2 = craneAim(gs, 1)
        if (JSON.stringify(a) !== JSON.stringify(a2) || gs.hash !== h0 || stateHash(gs) !== h0) dirty++
    }
    ok(seen >= 200 && lies === 0,
        `AIM-TRUTH: foreman intent live on ${seen} ticks of seed 7's line (${stale} honest behind-claw memories) — every read named a live odd-parity piece, and at rest it IS the brain's nearest pick (${lies} lies)`)
    ok(dirty === 0,
        `AIM-PURE: intent reads are idempotent and leave the state hash unmoved across the whole line (${dirty} dirty frames)`)
}
{
    // CLAIM splits the blink on built geometry: nobody = steady, rival =
    // slow, mine = fast — and when both claws converge on one barrel the
    // fast read wins ("mine"). A loaded claw never claims.
    const gs = makeGame(5, 2)
    clearLine(gs)
    const br = spawnAt(gs, 'barrel', 210); br.rot = 0.1
    const A = gs.arms[0], B = gs.arms[1]
    A.x = 250; A.mode = 'up'; B.x = 400; B.mode = 'up'
    const idle = ringClaim(gs, br, 0)
    B.x = br.x + 5; B.mode = 'lowering'
    const rival = ringClaim(gs, br, 0)
    A.x = br.x - 5; A.mode = 'lowering'
    const both = ringClaim(gs, br, 0)
    A.held = 4242 // carrying something else: no longer converging
    const mineHeld = ringClaim(gs, br, 0)
    ok(idle === null && rival === 'rival' && both === 'mine' && mineHeld === 'rival',
        `CLAIM-TRUTH: nobody says null, the rival's approach says rival, both converging mine wins, a loaded claw drops the claim (${idle}/${rival}/${both}/${mineHeld})`)
}
{
    // RING-PREDICTS: the ring's promise is an outcome — red reads all
    // descent and the jaws bounce; green reads all descent and they bite.
    const off = makeGame(21, 1)
    while (off.tick < 40) step(off, [{}]); clearLine(off)
    const br = spawnAt(off, 'barrel', 200); br.rot = 1.1
    off.arms[0].x = br.x
    let warnFrames = 0, offFrames = 0
    // sample INSIDE the chase (the descent happens within grabFrom's own
    // loop — sampling after it returns sees only the post-slip aftermath)
    grabFrom(off, br, 400, () => {
        br.rot = 1.1
        const a = off.arms[0]
        if (br.onBelt && catchRing(br) === 'off') offFrames++
        if (a.mode === 'lowering' && Math.abs(br.x - a.x) <= GRAB_DX && jawWarn(off, 0)) warnFrames++
    })
    ok(off.fx.some((f) => f.t === 'slip') && offFrames >= 100 && warnFrames >= 2 && off.arms[0].held === null,
        `RING-PREDICTS (off): a pinned off-axis barrel reads red on ${offFrames} of the drive (the ring is the approach tell), the jaws warn on ${warnFrames} descent-in-range frames — and the descent slips`)
    // #2694 rewrite: the upright case lets the barrel roll for real now — the
    // arc's promise is about the ATTIMPT tick, so a natural-roll descent that
    // meets the jaws upright must be quiet all the way, whatever the roll did
    // mid-fall. Search the phase; a clean clamp with zero arc proves the
    // predictive mirror tracks the roll, not the present pose.
    let clean = null
    for (let rot0 = 0; clean === null && rot0 <= Math.PI; rot0 += 0.02) {
        const up = makeGame(22, 1)
        while (up.tick < 40) step(up, [{}]); clearLine(up)
        const br2 = spawnAt(up, 'barrel', 200); br2.rot = rot0
        up.arms[0].x = br2.x
        let warned = false
        grabFrom(up, br2, 400, () => { if (jawWarn(up, 0)) warned = true })
        if (up.arms[0].held === br2.id && !warned && catchRing(br2) === 'ok') clean = Math.round(rot0 * 100) / 100
    }
    ok(clean !== null,
        `RING-PREDICTS (ok): spawn phase ${clean} — the barrel rolls naturally, the whole descent reads quiet, the ring is green at the bite, and the jaws clamp clean (predictive law: quiet ⇔ upright at the attempt)`)
}
{
    // SLAM-LAW: the pip column's colour IS the physics' verdict. Swept
    // release heights through the real fall: green ⇔ lands clean, red ⇔
    // the bottle shatters — the discrete mirror must agree at every height,
    // boundary band included (dy 60–63, where the naive continuous formula
    // would cry wolf).
    const slamCase = (targetTip) => {
        const gs = makeGame(23, 1)
        while (gs.tick < 40) step(gs, [{}]); clearLine(gs)
        const b = spawnAt(gs, 'bottle', 200)
        gs.arms[0].x = b.x
        if (!grabFrom(gs, b)) return { t: null }
        let n = 0
        while (gs.arms[0].held !== null && gs.arms[0].tip > CARRY_TIP && n < 40) { step(gs, [{ a: false }]); n++ } // hoist home
        while (gs.arms[0].held !== null && gs.arms[0].tip < targetTip && n < 100) { step(gs, [{ down: true }]); n++ }
        const t = slamTell(gs, 0)
        const c0 = gs.correct, w0 = gs.warnings
        // release in ONE step, feather held: the A-edge frees the load before
        // the mode logic can lift the claw. A two-step release ({a:false} then
        // {a:true}) climbs 3 px AFTER the tell snapshot — the fall would then
        // start from a different height than the tell read, exactly the drift
        // this sweep exists to catch (the tell must speak about the drop the
        // player is actually about to make).
        step(gs, [{ a: true }])
        resolve(gs)
        return { t, shattered: gs.warnings > w0, scored: gs.correct > c0 }
    }
    const high = slamCase(CARRY_TIP)
    ok(high.t && high.t.safe === false && high.shattered,
        `SLAM-LAW: carried glass at hoist height reads red (impact ${high.t && high.t.impact}) — and physics agrees, it shatters`)
    const deep = slamCase(CLAW_DOWN - 12)
    ok(deep.t && deep.t.safe === true && !deep.shattered && deep.scored,
        `SLAM-LAW: feathered to the lip the column reads green (impact ${deep.t && deep.t.impact}) — the bottle lands clean and scores`)
    let agree = 0, riskN = 0, safeN = 0, counted = 0
    for (let tipStop = 60; tipStop <= CLAW_DOWN - 1; tipStop += 3) {
        const c = slamCase(tipStop)
        if (!c.t) continue
        counted++
        if (c.t.safe) safeN++; else riskN++
        if (c.t.safe === !c.shattered) agree++
    }
    ok(agree === counted && riskN >= 4 && safeN >= 4,
        `SLAM-LAW sweep: ${agree}/${counted} release heights — the tell's colour IS the physics verdict at every one (${riskN} red heights shatter, ${safeN} green heights land clean)`)
    // the column keeps its silence where it has no meaning
    const mute = makeGame(24, 1)
    while (mute.tick < 40) step(mute, [{}]); clearLine(mute)
    ok(slamTell(mute, 0) === null, 'SLAM-SILENT: an empty claw paints no column')
    const cn = spawnAt(mute, 'can', 200)
    mute.arms[0].x = cn.x
    grabFrom(mute, cn)
    ok(slamTell(mute, 0) === null, 'SLAM-SILENT: a carried CAN (not fragile) never paints a slam column')
    mute.items.find((i2) => i2.id === mute.arms[0].held).x = 108 // over the bare floor gap
    ok(slamTell(mute, 0) === null, 'SLAM-SILENT: even glass over bare floor (no bin under it) paints no column')
    ok(travelTell(mute, 0) === null, 'TRAVEL-SILENT (CAN): glass-less cargo never paints a ghost column')
}

section('PREDICT — the jaw arc reads the meeting, not the moment (#2694)')
{
    // PREDICT-TRUTH: over seed 7's real 2P line the arc equals an
    // independently re-spelled predictive mirror on EVERY tick, both seats —
    // belt speed, attempt tip, claw speed, roll radius and the 0.42 upright
    // window all written out again here (not imported), so a helper that
    // drifts from the sim's own kinematics goes red by name.
    const gs = makeGame(7, 2)
    let lies = 0, dirty = 0, earlyWarn = 0, warnFrames = 0
    const hist = [[], []]
    const slips = []
    while (!gs.end && gs.tick < SHIFTS.length * SHIFT_TICKS + 900) {
        step(gs, [autopilot(gs, 0), autopilot(gs, 1)])
        const h0 = gs.hash
        for (let s2 = 0; s2 < gs.arms.length; s2++) {
            const a = gs.arms[s2]
            const vbq = 1.05 * SHIFTS[Math.min(gs.shift, SHIFTS.length - 1)].speed // belt law, spelled again
            const nq = Math.max(0, Math.ceil((76 - a.tip) / 3)) // attempt tip / claw speed, spelled again
            const expect = a.held === null && a.clamp === 0 && a.mode === 'lowering' &&
                gs.items.some((it) => {
                    if (!it.onBelt || it.carriedBy !== -1 || it.kind !== 'barrel') return false
                    const dxq = Math.abs(it.x + vbq * nq - (a.x + (a.vx || 0) * nq))
                    const rq = (((it.rot + (vbq * nq) / 6.5) % Math.PI) + Math.PI) % Math.PI
                    return dxq <= 11 && !(rq < 0.42 || rq > Math.PI - 0.42) // grab window + upright window, spelled again
                })
            const j = jawWarn(gs, s2)
            if (j !== expect) lies++
            if (j) { warnFrames++; if (a.tip < 76) earlyWarn++ }
            hist[s2].push(j)
        }
        for (const e of gs.ev) if (e.type === 'slip') slips.push([e.seat ?? 0, gs.tick])
        if (gs.hash !== h0 || stateHash(gs) !== h0) dirty++
    }
    const headed = slips.filter(([s2, T]) => T >= 2 && hist[s2][T - 2]).length
    ok(lies === 0 && dirty === 0,
        `PREDICT-TRUTH: seed 7's whole line — jaw arc ≡ the independently re-spelled meeting mirror on every tick, both seats (${warnFrames} warned frames, ${lies} lies, ${dirty} dirty)`)
    ok(earlyWarn >= 40,
        `PREDICT-EXTENDS: ${earlyWarn} warned frames land ABOVE the attempt window (tip < 76) — the arc now speaks from the press, not the last two frames of the fall`)
    ok(slips.length >= 5 && headed >= Math.ceil(slips.length * 0.6),
        `PREDICT-HEADSTART: ${headed}/${slips.length} slips on the line were already warned the tick before the jaws bounced — the warning arrives with time to abort`)
}

section('TRAVEL — the ghost column guides glass home (#2694)')
{
    // TRAVEL-DEST: glass in the air over the CAN/BOTTLE gap says WHERE it
    // belongs and HOW it would land — the same discrete Euler fall the slam
    // column uses, re-spelled here independently at both heights.
    const gs = makeGame(31, 1)
    while (gs.tick < 40) step(gs, [{}]); clearLine(gs)
    const bt = spawnAt(gs, 'bottle', 166)
    gs.arms[0].x = bt.x
    ok(grabFrom(gs, bt), 'TRAVEL-SET: the bottle is aboard')
    let tn = 0
    while (gs.arms[0].held !== null && gs.arms[0].tip > CARRY_TIP && tn < 40) { step(gs, [{ a: false }]); tn++ }
    const it = gs.items.find((i2) => i2.id === gs.arms[0].held)
    gs.arms[0].x = 176; it.x = 176 // centre of the CAN/BOTTLE gap — no bin's judgment, just travel
    const t = travelTell(gs, 0)
    const dyq = BIN_TOP - (it.y + KINDS.bottle.h / 2)
    let vyq = 2, fallq = 0; while (fallq < dyq) { vyq += 0.5; fallq += vyq } // the sim's gravity, spelled again
    ok(t && t.bin === 2 && BINS[t.bin].kind === 'bottle' && t.dx === Math.round(213 - it.x) && t.impact === vyq && t.safe === false,
        `TRAVEL-DEST: glass hoisted in the gap names its home bin (${t && BINS[t.bin].label}, dx ${t && t.dx}) and paints the fall RED — impact ${t && t.impact} vs the shatter law, matching the independent mirror exactly (${vyq})`)
    let fn = 0
    while (gs.arms[0].held !== null && gs.arms[0].tip < CLAW_DOWN - 2 && fn < 60) { step(gs, [{ a: false, down: true }]); fn++ }
    const t2 = travelTell(gs, 0)
    ok(t2 && t2.safe === true && t2.bin === 2 && t2.impact <= BREAK_VY,
        `TRAVEL-FEATHER: on the way the ghost turns green at impact ${t2 && t2.impact} — pre-feather while travelling, arrive already safe`)
    gs.arms[0].x = 213; it.x = 213 // over the home bin mouth: slamTell owns the story
    const t3 = travelTell(gs, 0), s3 = slamTell(gs, 0)
    ok(t3 === null && s3 !== null, 'TRAVEL-HANDOFF: over a bin column the ghost yields to the live slam meter (one column, one story)')
    // PURE: idempotent reads across a real line, and a non-null never names a
    // bin other than the cargo's own tag.
    const gs2 = makeGame(7, 2)
    let dirty = 0, gapFrames = 0, wrongHome = 0
    while (!gs2.end && gs2.tick < SHIFTS.length * SHIFT_TICKS + 900) {
        step(gs2, [autopilot(gs2, 0), autopilot(gs2, 1)])
        const h0 = gs2.hash
        for (let s2 = 0; s2 < 2; s2++) {
            const t1 = travelTell(gs2, s2), t2 = travelTell(gs2, s2)
            if (JSON.stringify(t1) !== JSON.stringify(t2)) dirty++
            if (t1) {
                gapFrames++
                const held = gs2.items.find((i2) => i2.id === gs2.arms[s2].held)
                if (!held || t1.bin !== KINDS[held.kind].bin) wrongHome++
            }
        }
        if (gs2.hash !== h0 || stateHash(gs2) !== h0) dirty++
    }
    ok(dirty === 0 && wrongHome === 0 && gapFrames >= 100,
        `TRAVEL-PURE: seed 7's line read the ghost ${gapFrames} frames — idempotent, hash-clean, and it never named the wrong home (${dirty} dirty, ${wrongHome} wrong)`)
}

section('CB — the catch ring reads colour-blind (#2694)')
{
    // deuteranopia transform (Machado et al. 2009, severity 1.0) + CIE76, run
    // on the palette constants the painter imports, in the game's native
    // 426×240. ok-vs-off is the verdict pair; each ring state vs the barrel
    // core is the figure/ground pair the issue flagged. The marquee's glass
    // family colour is pinned from the painter's source text so a palette edit
    // without a re-run of this gate goes red.
    const src = readFileSync(new URL('../src/games/PickRush/index.jsx', import.meta.url), 'utf8')
    const glassTag = (src.match(/TAG = \{[^}]*?bottle: '#([0-9a-fA-F]{6})'/) || [])[1] || ''
    ok(glassTag.toLowerCase() === 'ff4fd8', `CB-PIN: the marquee glass colour is ${glassTag} — if you retune TAG.bottle, this gate stops you until the pair has been re-checked`)
    const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
    const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
    const dex2 = (h) => {
        const [r, g, b] = rgb(h).map(lin)
        const m = [[0.151600, 0.793665, 0.054710], [0.115329, 0.692357, 0.192314], [0.032024, 0.104195, 0.863781]]
        const d = m.map((row) => row[0] * r + row[1] * g + row[2] * b)
        const X = 0.4124 * d[0] + 0.3576 * d[1] + 0.1805 * d[2]
        const Y = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]
        const Z = 0.0193 * d[0] + 0.1192 * d[1] + 0.9505 * d[2]
        const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
        const fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883)
        return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
    }
    const dE = (a, b) => { const A = dex2(a), B = dex2(b); return Math.round(Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) * 10) / 10 }
    const vOk = dE(RING_OK, RING_OFF), vCoreOk = dE(RING_OK, BARREL_CORE), vCoreOff = dE(RING_OFF, BARREL_CORE)
    const vGlass = dE(RING_OK, `#${glassTag}`)
    ok(vOk >= 25 && vCoreOk >= 15 && vCoreOff >= 15 && vGlass >= 25,
        `CB-RING: under deuteranopia at native res — ok/off verdict pair ΔE ${vOk}, ok/core ${vCoreOk}, off/core ${vCoreOff}, ring/glass-marquee ${vGlass} (thresholds 25/15/15/25; the ring also carries lineWidth + blink redundancy)`)
}

// ---------------------------------------------------------------- EXPORT — Plaicraft episodes (#2734)
section('EXPORT — Plaicraft episodes (#2734)')
{
    // The gates below never borrow the exporter's verdict table: they replay
    // each file's OWN pads back into the sim and re-label every terminal event
    // with the law written INLINE (drop = the tagged bin caught it = hit;
    // wrong/shatter/slip = miss). That independent truth is compared against
    // what the dataset claims — and against the sim's own `correct` counter,
    // one per seed. A mislabel by the pipeline, or a pad lane that cannot
    // replay, names the seed red.
    const walkRecording = (file) => {
        const gs = makeGame(file.seed >>> 0, file.players)
        const labels = []
        let hits = 0, misses = 0
        for (let t = 0; t < file.ticks; t++) {
            step(gs, file.slots.map((sl) => decodePad(sl.pads[t], file.method)))
            for (const e of gs.ev) {
                const hit = e.type === 'drop'
                if (!hit && !['wrong', 'shatter', 'slip'].includes(e.type)) continue
                const l = { t: gs.tick, ok: hit, why: e.type }
                if (e.kind !== undefined) l.kind = e.kind
                if (typeof e.seat === 'number' && e.seat >= 0) l.seat = e.seat
                if (e.bin !== undefined) l.bin = e.bin
                if (e.pts !== undefined) l.pts = e.pts
                labels.push(l)
                if (hit) hits++; else misses++
            }
        }
        // gs.correct resets at every whistle (per-shift quota counter) — the
        // LIFETIME land count is ΣbinFill, the sim's own per-bin ledger.
        return { labels, hits, misses, lifetime: gs.binFill.reduce((a, b) => a + b, 0), won: gs.end === 'win' }
    }
    const runDraws = (driver, seed, cap = 2000) => {
        const gs = makeGame(seed >>> 0, 2)
        let draws = 0
        const raw = gs.rng
        gs.rng = () => { draws++; return raw() }
        for (let t = 0; t < cap && !gs.end; t++) step(gs, [driver(gs, 0), driver(gs, 1)])
        return draws
    }
    const files = []
    for (const seed of [7, 101, 2027]) {
        const r = collectRun(seed)
        files.push(r.file)
        const bad = validateEpisode(r.file)
        ok(bad === null, `EXPORT-VALID: seed ${seed}'s episode block validates${bad ? ` — ${bad}` : ''}`)
        const v = verifyRecording(r.file, makeReplayDriver())
        ok(v.ok, `EXPORT-REPLAY: seed ${seed} replays its recorded pads to identical hashes${v.ok ? '' : ` — mismatch @t${v.mismatch.tick}`}`)
        const truth = walkRecording(r.file)
        const lie = truth.labels.findIndex((l, i) => JSON.stringify(l) !== JSON.stringify(r.file.episode.labels[i]))
        ok(r.file.episode.labels.length === truth.labels.length && lie === -1,
            `EXPORT-LABELS-TRUTH: seed ${seed} — every label equals the independent re-walk (${truth.labels.length} drops, ${truth.hits} hits)${lie === -1 ? '' : ` — first lie at label ${lie}: dataset ${JSON.stringify(r.file.episode.labels[lie])} vs truth ${JSON.stringify(truth.labels[lie])}`}`)
        ok(truth.hits === truth.lifetime && r.stats.hits === truth.hits,
            `EXPORT-HITS-CORRECT: seed ${seed} — Σhit labels ≡ ΣbinFill, the sim's lifetime land ledger (${truth.hits}; gs.correct resets per shift)`)
        ok(truth.won && r.file.episode.success === true && r.file.episode.task === 'pick-rush-shift',
            `EXPORT-WIN: seed ${seed}'s planner completes the contract and the episode says so (score ${r.stats.score})`)
        ok(r.file.slots.length === 2 && r.file.slots.every((sl) => sl.pads.length === r.file.ticks)
            && r.file.episode.labels.every((l) => (l.ok ? l.why === 'drop' : ['wrong', 'shatter', 'slip'].includes(l.why))),
            `EXPORT-SHAPE: seed ${seed} — one pad per tick per seat, every verdict legal (why ≡ its class)`)
    }
    const corpus = exportEpisodes(files)
    const parsed = corpus.text.trim().split('\n').map((x) => JSON.parse(x))
    ok(parsed.length === files.length && parsed.every((p, i) => validateEpisode(p) === null
        && JSON.stringify(p.episode.labels) === JSON.stringify(files[i].episode.labels)),
        `EXPORT-JSONL: ${parsed.length} episodes round-trip through exportEpisodes — validate clean, labels byte-equal`)
    const dAuto = runDraws(autopilot, 7), dPlan = runDraws(planner, 7)
    ok(dPlan < dAuto, `EXPORT-RNG-FREE: the corpus planner draws fewer seeded numbers than the autopilot (${dPlan} vs ${dAuto} by tick 2000) — a pad stream carries pads, not draws, so replay hinges on this`)
}

// ---------------------------------------------------------------- Chrome
if (!NODE_ONLY) {
    const { openGame, launch, requireDevServer, Report } = await import('./lib/harness.mjs')
    const BASE = process.env.CONTRACT_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
    await requireDevServer(`${BASE}/pick-rush`)
    const browser = await launch()
    const rep = new Report('pickcheck/browser')
    let pageErrors = 0
    try {
        const page = await openGame(browser, { url: `${BASE}/pick-rush`, hook: '__pickrushTest', viewport: { width: 940, height: 700 } })
        page.on('pageerror', () => { pageErrors++ })

        rep.check('BOOT: window.__game is live with the pad contract',
            await page.evaluate(() => !!window.__game && window.__game.meta.id === 'pick-rush' && window.__game.meta.buttons.includes('a')))

        await page.waitForFunction(() => window.__pickrushTest.state().tick > 60, null, { timeout: 15000 })
        const attract = await page.evaluate(() => window.__pickrushTest.state())
        rep.check('ATTRACT: the demo line runs before anyone touches it', attract.mode === 'attract' && attract.tick > 0)

        // AMB attract-door (#2234), pinned at boot before any play can dirty
        // the log: the demo line runs and the cue log stays empty — the
        // schedule waits for a player.
        const ambBoot = await page.evaluate(() => window.__pickrushTest.ambience())
        rep.check('AMB attract: the demo line runs, yet the floor stays silent (no cues before play)',
            ambBoot.fired.length === 0, JSON.stringify({ tick: attract.tick, fired: ambBoot.fired.length }))

        // real Space clocks in
        await page.keyboard.press('Space')
        await page.waitForTimeout(200)
        rep.check('START: a real SPACE leaves attract', await page.evaluate(() => window.__pickrushTest.state().mode === 'play'))

        // #2742 the clean-sheet ledger is live from the first tick of play
        const clean0 = await page.evaluate(() => window.__pickrushTest.perfects())
        rep.check('CLEAN LIVE: every seat starts on a clean sheet, nothing banked yet',
            Array.isArray(clean0.clean) && clean0.clean.length >= 1 && clean0.clean.every(Boolean) && clean0.n === 0 && clean0.banked.length === 0,
            JSON.stringify(clean0))

        // real strokes move the crane, and the cable is painted where it says
        const before = await page.evaluate(() => window.__pickrushTest.state())
        await page.keyboard.down('ArrowRight')
        await page.waitForTimeout(320)
        await page.keyboard.up('ArrowRight')
        // #2678 the cable hangs on a spring — give it the settle time (was 120 ms,
        // mid-oscillation under software render; the gate demands the REST position)
        await page.waitForTimeout(500)
        const cable = await page.evaluate((b0) => {
            const st = window.__pickrushTest.state()
            const c = window.__pickrushTest.canvas()
            const x = Math.round(st.pos * 2)
            const midY = Math.round(((34 + (st.clawY - 8)) / 2) * 2)
            const d = c.getContext('2d').getImageData(x - 2, midY, 5, 6).data
            let hit = false
            for (let i = 0; i < d.length; i += 4) {
                if (Math.abs(d[i] - 207) < 40 && Math.abs(d[i + 1] - 216) < 40 && Math.abs(d[i + 2] - 227) < 40) hit = true
            }
            return { moved: st.pos > b0 + 1, hit }
        }, before.pos)
        rep.check('DRIVE: ArrowRight really slides the gantry east', cable.moved)
        rep.check('PIXELS: the cable is painted exactly at the sim-reported arm x', cable.hit)

        // cargo pixel proof: spawn a CAN through the DEV kit, grab it via the
        // contract, carry it low over its bin, and sample the core colour
        const cargo = await page.evaluate(async () => {
            const g = window.__game
            const it = () => window.__pickrushTest.state()
            g.reset(7, 1)
            window.__dbg.act('spawn can')
            // track and dip: chase the item until clamped
            let pressed = false
            for (let i = 0; i < 300; i++) {
                const s0 = it()
                if (s0.carried === 'can') break
                const item = s0.items.find((x) => x[0] === 'can' && x[3] === -1)
                if (!item) break
                const dx = item[1] - s0.pos
                const lead = s0.beltV * Math.ceil((97 - s0.clawY) / 3)
                const pad = { left: false, right: false, a: false }
                if (!pressed) {
                    const want = dx - lead
                    if (want > 1.5) pad.right = true
                    else if (want < -1.5) pad.left = true
                    else { pad.a = true; pressed = true }
                } else if (s0.carried === '') {
                    if (dx > 8) pad.right = true
                    else if (dx < -8) pad.left = true
                }
                g.step([pad], 1)
            }
            const carried = it().carried === 'can'
            if (!carried) return { carried, painted: false }
            for (let i = 0; i < 200; i++) {
                const s0 = it()
                const dx = 141 - s0.pos
                g.step([{ left: dx < -1.5, right: dx > 1.5 }], 1)
                if (Math.abs(dx) <= 2) break
            }
            g.step([{ a: false }], 1)
            g.step([{ a: true }], 1)
            // painted frame, not 34 ms: the chase loop never yielded to rAF, so
            // under software render a fixed wait sampled stale canvas bits (#2136)
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))))
            const s1 = it()
            const c = window.__pickrushTest.canvas()
            const ix = Math.round(s1.pos * 2)
            const iy = Math.round((60 + 9) * 2)
            const d = c.getContext('2d').getImageData(ix - 10, iy - 16, 21, 32).data
            let painted = false
            for (let k = 0; k < d.length; k += 4) {
                if (Math.abs(d[k] - 224) < 36 && Math.abs(d[k + 1] - 160) < 36 && Math.abs(d[k + 2] - 48) < 36) painted = true
            }
            return { carried, painted }
        })
        rep.check('GRAB: the claw clamps a can on the live page', cargo.carried)
        rep.check('PIXELS: the carried CAN is painted at the claw, matching sim state', cargo.painted)

        // die and restart: three wrong-bin drops via the DEV kit
        const death = await page.evaluate(async () => {
            const g = window.__game
            const it = () => g.state()
            let drops = 0
            for (let attempt = 0; attempt < 6 && drops < 3; attempt++) {
                window.__dbg.act('spawn can')
                let pressed = false
                for (let i = 0; i < 300; i++) {
                    const s0 = it()
                    if (s0.done || s0.carried === 'can') break
                    const item = s0.items.find((x) => x[0] === 'can' && x[3] === -1)
                    if (!item) break
                    const dx = item[1] - s0.pos
                    const lead = s0.beltV * Math.ceil((97 - s0.clawY) / 3)
                    const pad = { left: false, right: false, a: false }
                    if (!pressed) {
                        const want = dx - lead
                        if (want > 1.5) pad.right = true
                        else if (want < -1.5) pad.left = true
                        else { pad.a = true; pressed = true }
                    } else if (s0.carried === '') {
                        if (dx > 8) pad.right = true
                        else if (dx < -8) pad.left = true
                    }
                    g.step([pad], 1)
                }
                if (it().carried !== 'can') continue
                for (let i = 0; i < 200; i++) {
                    const s0 = it()
                    const dx = 69 - s0.pos
                    g.step([{ left: dx < -1.5, right: dx > 1.5 }], 1)
                    if (Math.abs(dx) <= 2) break
                }
                g.step([{ a: false }], 1)
                g.step([{ a: true }], 1)
                for (let i = 0; i < 60 && it().fusesLeft > 3 - (drops + 1); i++) g.step([{}], 1)
                drops++
            }
            const s1 = it()
            return { done: s1.done, reason: s1.endReason, fuses: s1.fusesLeft }
        })
        rep.check('FIRE: three wrong-bin drops through the contract end the shift',
            death.done && /WRONG BIN/.test(death.reason || '') && death.fuses === 0)

        await page.waitForTimeout(750)
        await page.keyboard.press('Space')
        await page.waitForTimeout(300)
        rep.check('RESTART: a Space after the firing card clocks back in', await page.evaluate(() => window.__pickrushTest.state().mode === 'attract'))

        // AMB live (#2234): the demo floor never sells a mood the player has
        // not bought — then the running line BEEPs (quiet early zone), and
        // putting the night at shift 4 drops the bed into the graveyard zone
        // where the relay chatter lives. The FIRE gate left the contract on
        // the loop — release it so rAF drives the line again first.
        await page.evaluate(() => window.__game.release())
        const ambAttract = await page.evaluate(() => ({ before: window.__pickrushTest.ambience().fired.length, tick: window.__pickrushTest.state().tick }))
        await page.waitForFunction((t0) => window.__pickrushTest.state().tick > t0 + 240, ambAttract.tick, { timeout: 10000 })
        const ambAttract2 = await page.evaluate(() => window.__pickrushTest.ambience())
        rep.check('AMB attract: the attract demo adds no ambience cues (the floor waits for a player)',
            ambAttract2.fired.length === ambAttract.before, JSON.stringify({ before: ambAttract.before, after: ambAttract2.fired.length }))
        await page.keyboard.press('Space')
        await page.waitForFunction(() => window.__pickrushTest.state().tick > 140, null, { timeout: 8000 })
        const ambPlay = await page.evaluate(() => window.__pickrushTest.ambience())
        rep.check('AMB live: the running early floor beeps once, far away (zone early, first scheduled cue)',
            ambPlay.zone === 0 && ambPlay.fired.filter((f) => f.cue === 'beep').length === 1 && ambPlay.fired.every((f) => f.cue === 'beep'),
            JSON.stringify(ambPlay))
        await page.evaluate(() => { window.__pickrushTest.sim().shift = 3 }) // clock forward to the graveyard peak
        await page.waitForFunction(() => window.__pickrushTest.ambience().fired.some((f) => f.cue === 'chatter'), null, { timeout: 10000 })
        const ambGrave = await page.evaluate(() => ({ ...window.__pickrushTest.ambience(), stateZone: window.__game.state().ambZone }))
        rep.check('AMB eras: shift 4 drops the floor into graveyard — chatter + hiss join at the tighter cadence',
            ambGrave.zone === 2 && ambGrave.stateZone === 2 && ambGrave.fired.some((f) => f.cue === 'chatter' && f.shift === 3),
            JSON.stringify({ zone: ambGrave.zone, fired: ambGrave.fired.map((f) => `${f.cue}@${f.tick}/${f.shift}`) }))
        // clock out of the line so the gates downstream still find attract,
        // exactly where they expect it (same over-card walk the RESTART gate uses)
        await page.evaluate(() => { const q = window.__pickrushTest.sim(); q.end = 'fire'; q.endReason = 'AMB AUDIT' })
        await page.waitForFunction(() => window.__pickrushTest.state().mode === 'over', null, { timeout: 5000 })
        await page.waitForTimeout(750)
        await page.keyboard.press('Space')
        await page.waitForTimeout(300)

        // juice carrier: the quota gauge flags near-clear at exactly one pick short
        const near = await page.evaluate(() => {
            const g = window.__game
            g.reset(7, 1)
            const base = g.state().quotaNear
            const gs = window.__pickrushTest.sim()
            gs.correct = g.state().quota - 1
            const on = g.state().quotaNear
            gs.correct = g.state().quota
            const over = g.state().quotaNear
            gs.correct = 0
            g.release()
            return { base, on, over }
        })
        rep.check('JUICE: quotaNear flips true at exactly one pick short of quota',
            !near.base && near.on === true && near.over === false, JSON.stringify(near))

        // WAVE-INK (#2214): the marquee is not just evented — it is PAINTED at
        // the breather tick. Drive seed 7 with an idle crane to the first wave
        // announcement, let the page paint, and sample the banner band at the
        // exact device rect: caption ink (ice-blue) + the amber plate rim.
        const marquee = await page.evaluate(async () => {
            const g = window.__game
            g.reset(7, 1)
            let announced = false
            for (let i = 0; i < 520; i++) {
                g.step([{}], 1)
                const wv = window.__pickrushTest.sim().fx.filter((f) => f.t === 'wave')
                if (wv.length && wv[wv.length - 1].k >= 8) { announced = true; break }
            }
            if (!announced) return { announced, ink: 0, rim: 0 }
            // wait for a PAINTED frame, not a fixed 34ms: under multi-lane load
            // a frame takes 60–120ms and the sample used to land before any
            // rAF paint after the marquee was created (canvas still showed the
            // post-reset frame — the #2136-family flake, seen on main 2026-11-14).
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))))
            const c = window.__pickrushTest.canvas()
            const d = c.getContext('2d').getImageData(250, 112, 352, 36).data
            let ink = 0, rim = 0
            for (let p = 0; p < d.length; p += 4) {
                if (Math.abs(d[p] - 127) < 50 && Math.abs(d[p + 1] - 212) < 50 && Math.abs(d[p + 2] - 255) < 50) ink++
                if (Math.abs(d[p] - 200) < 40 && Math.abs(d[p + 1] - 161) < 40 && Math.abs(d[p + 2] - 28) < 40) rim++
            }
            const k = window.__pickrushTest.sim().fx.filter((f) => f.t === 'wave').slice(-1)[0].k
            return { announced, ink, rim, k }
        })
        rep.check('WAVE-INK: the wave marquee paints caption ink + amber rim over the belt mouth at the breather',
            marquee.announced && marquee.ink >= 12 && marquee.rim >= 2, JSON.stringify(marquee))

        // PIPS (#2223): the wave-progress lamp row is PAINTED between the belt
        // and the bins, and DIMS as pieces ride in. Sample the row's device
        // rect (world 194–232 × 121–133 ×2) before the first spawn and once
        // two pieces have ridden in — two lamps' worth of ice-blue must go dark.
        const pips = await page.evaluate(async () => {
            const g = window.__game
            const rowLit = () => {
                const c = window.__pickrushTest.canvas()
                const d = c.getContext('2d').getImageData(386, 242, 80, 24).data
                let n = 0
                for (let p = 0; p < d.length; p += 4) {
                    if (Math.abs(d[p] - 127) < 50 && Math.abs(d[p + 1] - 212) < 50 && Math.abs(d[p + 2] - 255) < 50) n++
                }
                return n
            }
            g.reset(7, 1)
            g.step([{}], 4)
            const painted = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))))
            await painted()
            const s0 = g.state()
            const lit0 = rowLit()
            for (let i = 0; i < 200 && g.state().waveSpawned < 2; i++) g.step([{}], 1)
            await painted()
            const s1 = g.state()
            return { lit0, lit1: rowLit(), total0: s0.waveTotal, spawn0: s0.waveSpawned, total1: s1.waveTotal, spawn1: s1.waveSpawned }
        })
        rep.check('PIPS: the wave lamp row paints full and dims two lamps as two pieces ride in',
            pips.spawn0 === 0 && pips.total0 === 4 && pips.spawn1 >= 2 && pips.lit0 >= 120 && pips.lit1 <= pips.lit0 - 60,
            JSON.stringify(pips))

        // WAVE-STEP live (#2223): the component keys the cue's pitch to the
        // line slot — the first two announcements of a shift step +2 and +4
        // semitones, and the recorded index matches the name being shown.
        const stepz = await page.evaluate(() => {
            const g = window.__game
            g.reset(7, 1)
            for (let i = 0; i < 1400 && window.__pickrushTest.waveCues().length < 2; i++) g.step([{}], 1)
            return window.__pickrushTest.waveCues().slice(0, 3)
        })
        rep.check('WAVE-STEP: each wave cue steps its pitch by its slot (0 → +2 → +4 st), index matches the name',
            stepz.length >= 2 && stepz.every((c) => c.step === Math.round(Math.pow(2, (c.wi * 2) / 12) * 1000) / 1000)
                && stepz[0].wi === 1 && stepz[1].wi === 2 && stepz[1].step > stepz[0].step,
            JSON.stringify(stepz))

        // WHIP-SPRING live (#2678): the cable head trails the trolley and
        // OVERSHOOTS the old static ±4 tilt mid-reversal. An in-page recorder
        // catches the biggest spring offset plus the cable ink centroid at that
        // very frame while real keyboard strokes slam the gantry both ways.
        await page.evaluate(() => {
            const g = window.__game
            g.reset(7, 1)
            g.release() // hand the loop back to the rAF driver — this gate moves the arm with real keys
            window.__whipRec = { max: 0, inkOff: null, samples: [], rec: true }
            const loop = () => {
                const R = window.__whipRec
                if (!R.rec) return
                const st = g.state()
                R.samples.push(st.whip)
                if (Math.abs(st.whip) > Math.abs(R.max)) {
                    R.max = st.whip
                    const c = window.__pickrushTest.canvas()
                    const cx = Math.round(st.pos * 2)
                    const midY = Math.round(((34 + (st.clawY - 8)) / 2) * 2)
                    const d = c.getContext('2d').getImageData(cx - 10, midY - 3, 21, 6).data
                    let sx = 0, n = 0
                    for (let p = 0; p < d.length; p += 4) {
                        if (Math.abs(d[p] - 207) < 40 && Math.abs(d[p + 1] - 216) < 40 && Math.abs(d[p + 2] - 227) < 40) { sx += (p / 4) % 21; n++ }
                    }
                    R.inkOff = n > 0 ? sx / n - 10 : null
                }
                requestAnimationFrame(loop)
            }
            requestAnimationFrame(loop)
        })
        await page.keyboard.down('ArrowRight')
        await page.waitForTimeout(450)
        await page.keyboard.up('ArrowRight')
        await page.keyboard.down('ArrowLeft')
        await page.waitForTimeout(500)
        await page.keyboard.up('ArrowLeft')
        await page.waitForTimeout(500)
        const whipGate = await page.evaluate(() => {
            window.__whipRec.rec = false
            return { max: window.__whipRec.max, inkOff: window.__whipRec.inkOff, settle: window.__game.state().whip, n: window.__whipRec.samples.length }
        })
        rep.check('WHIP-SPRING: reversing the gantry overshoots the static ±4 tilt on the live spring',
            Math.abs(whipGate.max) >= 4.2, `max whip ${Number(whipGate.max).toFixed(2)} px over ${whipGate.n} frames`)
        rep.check('WHIP-PIXELS: at the biggest whip the painted cable centroid sits off the trolley line',
            whipGate.inkOff !== null && Math.abs(whipGate.inkOff) >= 2, `centroid ${whipGate.inkOff} device px off centre`)
        rep.check('WHIP-REST: steady again, the cable hangs straight', Math.abs(whipGate.settle) < 0.5, `settle ${Number(whipGate.settle).toFixed(2)} px`)

        // INERTIA live (#2755): a real held stroke trails the paint behind the
        // sim, and after the release the ease glides out and lands EXACTLY on
        // the sim position (the #1184 PIXELS law is unbroken at rest).
        await page.evaluate(() => {
            const g = window.__game
            g.reset(7, 1)
            g.release()
            window.__easeRec = { min: 0, rec: true }
            const loop = () => {
                if (!window.__easeRec.rec) return
                window.__easeRec.min = Math.min(window.__easeRec.min, g.state().ease)
                requestAnimationFrame(loop)
            }
            requestAnimationFrame(loop)
        })
        await page.keyboard.down('ArrowRight')
        await page.waitForTimeout(320)
        await page.keyboard.up('ArrowRight')
        await page.waitForTimeout(500)
        const easeGate = await page.evaluate(() => {
            window.__easeRec.rec = false
            const st = window.__game.state()
            return { min: window.__easeRec.min, settle: st.ease, paint: window.__pickrushTest.ease() }
        })
        rep.check('INERTIA-PIXELS: a real held stroke paints the carriage behind the sim (trails ≥1 px mid-run)',
            easeGate.min <= -1, `min lag ${Number(easeGate.min).toFixed(2)} px`)
        rep.check('INERTIA-REST live: after the release the ease glides out to exactly zero on the sim line',
            easeGate.settle === 0 && easeGate.paint.paintX === Math.round(easeGate.paint.simX),
            JSON.stringify(easeGate.paint))

        // FEATHER lesson live (#2755): grab a spawned bottle through the rig,
        // and the chevron + FEATHER caption is really INKED under the carriage.
        const featherGate = await page.evaluate(async () => {
            const g = window.__game
            g.reset(7, 1)
            window.__dbg.act('spawn bottle')
            let pressed = false
            for (let i = 0; i < 300; i++) {
                const s0 = g.state()
                if (s0.carried === 'bottle') break
                const item = s0.items.find((x) => x[0] === 'bottle' && x[3] === -1)
                if (!item) break
                const dx = item[1] - s0.pos
                const lead = s0.beltV * Math.ceil((97 - s0.clawY) / 3)
                const pad = { left: false, right: false, a: false }
                if (!pressed) {
                    const want = dx - lead
                    if (want > 1.5) pad.right = true
                    else if (want < -1.5) pad.left = true
                    else { pad.a = true; pressed = true }
                } else if (s0.carried === '') {
                    if (dx > 8) pad.right = true
                    else if (dx < -8) pad.left = true
                }
                g.step([pad], 1)
            }
            const lit = g.state().feather
            if (lit <= 0) return { carried: g.state().carried, lit, ink: false }
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))))
            const s1 = g.state()
            const px = Math.round((s1.pos + s1.ease) * 2)
            const c = window.__pickrushTest.canvas()
            const d = c.getContext('2d').getImageData(px - 16, 66, 32, 48).data
            let ink = false
            for (let k = 0; k < d.length; k += 4) {
                if (d[k] > 190 && d[k + 1] > 140 && d[k + 1] < 230 && d[k + 2] < 130) ink = true
            }
            return { carried: s1.carried, lit, ink }
        })
        rep.check('FEATHER-INK: the eased bottle grab shows the one-time lesson painted under the carriage',
            featherGate.carried === 'bottle' && featherGate.lit > 0 && featherGate.ink, JSON.stringify(featherGate))

        // METER (#2678): the fill column paints at the matching height and the
        // full bin thunks — lamp lit, tag-coloured rim flashed, column wrapped.
        // Raw counts ride the sim hook only (the #2234 amb-audit pattern).
        const meter = await page.evaluate(async () => {
            const g = window.__game
            const painted = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))))
            g.reset(7, 1)
            await painted()
            const q = window.__pickrushTest.sim()
            q.binFill[1] = 5
            await painted()
            const c = window.__pickrushTest.canvas()
            const tagInk = (x, y, w, h) => {
                const d = c.getContext('2d').getImageData(x, y, w, h).data
                let n = 0
                for (let p = 0; p < d.length; p += 4) {
                    if (d[p] > 150 && d[p + 1] > 90 && d[p + 1] < 205 && d[p + 2] < 110) n++ // CAN-tag amber, blended over the slot
                }
                return n
            }
            const half = tagInk(336, 376, 5, 30) // CAN meter slot, inked to 5/12
            const visHalf = g.state().binVis[1]
            q.binFill[1] = 12 // raw crosses cap — the next painted frame thunks
            let lamp = false
            for (let i = 0; i < 120 && !lamp; i++) { await new Promise((r) => setTimeout(r, 16)); lamp = g.state().binLamp[1] }
            const rim = lamp ? tagInk(219, 310, 5, 60) : 0 // rim flash on the bin's left edge, same frame
            const lowInk = tagInk(336, 398, 5, 10) // meter bottom after the wrap: empty
            return { half, lamp, rim, lowInk, visHalf, visAfter: g.state().binVis[1] }
        })
        rep.check('METER: a bin at 5/12 paints its amber column to the matching height',
            meter.half >= 40 && meter.visHalf === 5, `${meter.half} ink px in the slot, state fill ${meter.visHalf}`)
        rep.check('METER-FULL: crossing the cap lights the lamp and flashes the rim; the column wraps to 0',
            meter.lamp === true && meter.rim >= 20 && meter.lowInk === 0 && meter.visAfter === 0,
            `lamp ${meter.lamp}, rim ${meter.rim} px, low ink ${meter.lowInk}, vis ${meter.visAfter}`)

        // BARREL-RING (#2684): the catch ring is PAINTED and mirrors the jaw
        // law. Put a known-rotation barrel on the belt, let the page paint, and
        // sample the annulus around it: no green while it lies off-axis; roll
        // it upright and the green hoop appears. The DEV eye pairs every ring
        // with an independent inline upright verdict — the tell is caught lying,
        // not just missing.
        const ringGate = await page.evaluate(async () => {
            const g = window.__game
            const painted = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))))
            const eye = () => window.__pickrushTest.tells().find((t) => t.id === 7777)
            const ringInk = () => {
                const b = eye()
                const c = window.__pickrushTest.canvas()
                const d = c.getContext('2d').getImageData(b.x * 2 - 22, b.y * 2 - 22, 44, 44).data
                let n = 0
                for (let p = 0; p < d.length; p += 4) {
                    if (d[p] < 150 && d[p + 1] > 195 && d[p + 2] > 90 && d[p + 2] < 195) n++ // catch-green, blended
                }
                return { n, ring: b.ring, upright: b.upright }
            }
            g.reset(9, 1)
            const q = window.__pickrushTest.sim()
            q.nextSpawn = Number.MAX_SAFE_INTEGER // the gate owns the belt
            q.items.push({ id: 7777, n: 500, kind: 'barrel', x: 250, y: 88.5, vx: 0, vy: 0, rot: 1.1, onBelt: true, carriedBy: -1, fragile: false })
            g.step([{}], 1) // one belt tick — rot 1.26, still off-axis
            await painted()
            const offRead = ringInk()
            q.items.find((i2) => i2.id === 7777).rot = 0.05
            g.step([{}], 1) // +0.16 → 0.21, upright — the hoop should light
            await painted()
            const okRead = ringInk()
            const tell = g.state().barrelTell
            return { offRead, okRead, okTell: tell.find((t) => t[0] === 7777) || null }
        })
        rep.check('BARREL-RING: an off-axis barrel rides dark — no catch-green ink, and eye/law/contract agree it reads off',
            ringGate.offRead.ring === 'off' && ringGate.offRead.upright === false && ringGate.offRead.n <= 5,
            JSON.stringify(ringGate.offRead))
        rep.check('BARREL-RING: roll the same barrel upright and the green catch hoop paints (state + eye + canvas)',
            ringGate.okRead.ring === 'ok' && ringGate.okRead.upright === true && ringGate.okRead.n >= 60,
            JSON.stringify(ringGate.okRead))
        rep.check('BARREL-STATE: the contract carries the ring truth for the rolling piece',
            !!ringGate.okTell && ringGate.okTell[1] === 'ok', JSON.stringify(ringGate.okTell))

        // AIM-BEACON (#2690): in a live foreman race the autopilot's target
        // is painted — a tag-coloured lead line marches from his carriage to
        // the piece he's locked on. Run the page's own loop until the
        // contract names an aim, then sample the canvas corridor between the
        // carriage and the item (the item itself sits below the sampled band).
        const aimGate = await page.evaluate(async () => {
            const g = window.__game
            g.reset(7, 2)
            let s0 = null, eye = null
            for (let i = 0; i < 500 && !(s0 = g.state()).rivalAim; i++) {
                window.__pickrushTest.step(1, {}, [{}, window.__pickrushTest.auto(1)]) // the real brain drives seat 1
            }
            if (!s0 || !s0.rivalAim) return { fail: 'no foreman aim in 500 ticks' }
            eye = window.__pickrushTest.aimEye()
            if (!eye.aim) return { fail: 'contract aimed but the eye says no' }
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))))
            const c = window.__pickrushTest.canvas()
            const hex = eye.tag
            const rgb = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16))
            const lo = Math.round(Math.min(s0.arm2Pos, eye.aim.x) * 2) - 6
            const wid = Math.max(14, Math.round(Math.abs(s0.arm2Pos - eye.aim.x) * 2) + 12)
            const d = c.getContext('2d').getImageData(Math.max(0, lo), 94, wid, 66).data // world y 47..80: below carriage, above belt cargo
            let tag = 0
            for (let p = 0; p < d.length; p += 4) {
                if (Math.abs(d[p] - rgb[0]) < 90 && Math.abs(d[p + 1] - rgb[1]) < 90 && Math.abs(d[p + 2] - rgb[2]) < 90) tag++
            }
            return { n: tag, live: eye.live, parity: eye.parity, kind: eye.aim.kind }
        })
        rep.check('AIM-BEACON: the foreman paints a tag-coloured lead line to the parity piece his brain hunts — state, eye and canvas agree',
            !aimGate.fail && aimGate.live === true && aimGate.parity === 1 && aimGate.n >= 40, JSON.stringify(aimGate))

        // CLAIM-FLIP (#2690): the ownership read lives on the contract. Put a
        // barrel mid-belt, let the RIVAL crane converge on it (arm lowering,
        // inside the grab window, short of the attempt height so nothing
        // bites), read 'rival'; bring MY claw in too and the read flips to
        // 'mine'. The DEV eye re-derives the claim inline — helper vs geometry.
        const flipGate = await page.evaluate(async () => {
            const g = window.__game
            g.reset(9, 2)
            const q = window.__pickrushTest.sim()
            q.nextSpawn = Number.MAX_SAFE_INTEGER // the gate owns the belt
            q.items.push({ id: 7778, n: 501, kind: 'barrel', x: 250, y: 88.5, vx: 0, vy: 0, rot: 0.1, onBelt: true, carriedBy: -1, fragile: false })
            q.arms[1].x = 255; q.arms[1].mode = 'lowering'; q.arms[1].tip = 55
            g.step([{}], 2) // rival descends into the window (tip 61 — no attempt yet)
            const rival = ((g.state().ringClaim.find((r) => r[0] === 7778) || [])[1]) || null
            q.arms[0].x = 245; q.arms[0].mode = 'lowering'; q.arms[0].tip = 55
            g.step([{}], 2) // mine converges too
            const s = g.state()
            const mine = ((s.ringClaim.find((r) => r[0] === 7778) || [])[1]) || null
            const eye = window.__pickrushTest.tells().find((t) => t.id === 7778)
            return { rival, mine, eyeClaim: eye ? eye.claim : null, ring: eye ? eye.ring : null }
        })
        rep.check("CLAIM-FLIP: the rival's converging claw reads rival on the contract; when mine closes on the same barrel the claim flips to mine (eye agrees)",
            flipGate.rival === 'rival' && flipGate.mine === 'mine' && flipGate.eyeClaim === 'mine', JSON.stringify(flipGate))

        // SLAM-TELL (#2684): real-keys story — hoist glass over its bin and
        // the projected fall paints red (carry height is 8.8 against a law of
        // 8.0 — every high release shatters); feather and the column turns
        // green; release on green and the bottle lands clean, fuse intact.
        const slamGate = await page.evaluate(async () => {
            const g = window.__game
            const painted = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))))
            g.reset(7, 1)
            window.__dbg.act('spawn bottle')
            let pressed = false
            for (let i = 0; i < 300; i++) {
                const s0 = g.state()
                if (s0.carried === 'bottle') break
                const item = s0.items.find((x) => x[0] === 'bottle' && x[3] === -1)
                if (!item) break
                const dx = item[1] - s0.pos
                const lead = s0.beltV * Math.ceil((97 - s0.clawY) / 3)
                const pad = { left: false, right: false, a: false }
                const want = dx - lead
                if (!pressed) {
                    if (want > 1.5) pad.right = true
                    else if (want < -1.5) pad.left = true
                    else { pad.a = true; pressed = true }
                } else if (s0.carried === '') {
                    if (dx > 8) pad.right = true
                    else if (dx < -8) pad.left = true
                }
                g.step([pad], 1)
            }
            if (g.state().carried !== 'bottle') return { fail: 'no bottle' }
            for (let i = 0; i < 200; i++) {
                const s0 = g.state()
                const dx = 213 - s0.pos // over the BOTTLE bin mouth
                g.step([{ left: dx < -1.5, right: dx > 1.5 }], 1)
                if (Math.abs(dx) <= 2) break
            }
            const slamHigh = g.state().slamTell
            await painted()
            const pipInk = (mode) => {
                const st = g.state()
                const c = window.__pickrushTest.canvas()
                const x = Math.round(st.pos * 2)
                const d = c.getContext('2d').getImageData(x - 3, Math.round((st.clawY + 21) * 2), 7, Math.round((150 - (st.clawY + 21)) * 2)).data
                let n = 0
                for (let p = 0; p < d.length; p += 4) {
                    if (mode === 'r' ? (d[p] > 195 && d[p + 1] < 150 && d[p + 2] < 140)
                        : (d[p] < 150 && d[p + 1] > 195 && Math.abs(d[p + 2] - 143) < 60)) n++
                }
                return n
            }
            const red = pipInk('r')
            let green = null
            let greenInk = 0
            for (let i = 0; i < 120; i++) {
                g.step([{ down: true }], 1)
                const t = g.state().slamTell
                if (t && t[1] === 1) {
                    await painted()
                    green = t
                    greenInk = pipInk('g')
                    break
                }
            }
            const w0 = g.state().fusesLeft
            const c0 = g.state().correct
            g.step([{ a: true, down: true }], 1) // release ON green
            // drive the fall itself: the claw is already empty on this tick,
            // so a `carried !== ''` loop would exit without a single step —
            // the bottle needs ticks to reach the lip and be judged.
            for (let i = 0; i < 60; i++) g.step([{}], 1)
            await painted()
            const s2 = g.state()
            g.release()
            return { slamHigh, red, green, greenInk, w0, wAfter: s2.fusesLeft, gained: s2.correct - c0, slamAfter: s2.slamTell, done: s2.done }
        })
        rep.check('SLAM-TELL: glass hoisted over its bin paints a red fall column — the impact is past the shatter law',
            !!slamGate.slamHigh && slamGate.slamHigh[1] === 0 && slamGate.slamHigh[0] > 8 && slamGate.red >= 40,
            `impact ${slamGate.slamHigh && slamGate.slamHigh[0]}, red ${slamGate.red} px`)
        rep.check('SLAM-TELL: feathering turns the column green, and releasing on green lands the bottle clean — no fuse, quota point',
            !!slamGate.green && slamGate.greenInk >= 24 && slamGate.w0 === 3 && slamGate.wAfter === 3 && slamGate.gained >= 1 && slamGate.slamAfter === null,
            JSON.stringify(slamGate))

        // determinism through the live contract
        const script = scriptFor('pick-rush')
        const det = await page.evaluate((scr) => {
            const g = window.__game
            const run = () => {
                g.reset(7)
                let s = null
                for (let i = 0; i < scr.length; i++) s = g.step([scr[i]], 1)
                return JSON.stringify(s)
            }
            const A = run(), B = run()
            g.release()
            return { equal: A === B, tick: JSON.parse(B).tick }
        }, script)
        rep.check('CONTRACT: 600 scripted ticks replay identically in the live page', det.equal && det.tick === 600, `ended at ${det.tick}`)

        // #2734 REC — live takes bank as labelled episodes; harness drives
        // never bank. Fresh page first so the store starts where we say it does.
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForFunction(() => window.__pickrushTest && window.__pickrushTest.state().tick > 40, null, { timeout: 15000 })
        const recBase = await page.evaluate(() => window.__pickrushTest.epStats().saved)
        await page.keyboard.press('Space') // clock in for real
        await page.waitForFunction(() => window.__pickrushTest.epRun().ticks > 30, null, { timeout: 8000 })
        await page.keyboard.down('ArrowRight'); await page.waitForTimeout(240); await page.keyboard.up('ArrowRight')
        await page.keyboard.press('Space'); await page.waitForTimeout(200)
        const recLive = await page.evaluate(() => window.__pickrushTest.epRun())
        rep.check('REC-LIVE: a take started with real keys records ticks',
            recLive.recording && recLive.ticks > 30, JSON.stringify(recLive))
        // arm and win through the DEV eye; the loop clocks out the shift and banks
        await page.evaluate(() => { const gs = window.__pickrushTest.sim(); gs.correct = 99; gs.bestCombo = Math.max(gs.bestCombo, 2); gs.shift = 3; gs.shiftTick = 4199 })
        await page.waitForFunction(() => !!window.__pickrushTest.epLast(), null, { timeout: 8000 })
        const bank = await page.evaluate(() => {
            const b = window.__pickrushTest.epLast()
            const ls = (() => { try { return (JSON.parse(localStorage.getItem('retrogames-episodes') || '[]')).length } catch { return -1 } })()
            return {
                game: b.file.game, task: b.file.episode.task, success: b.file.episode.success,
                seed: b.file.seed, ticksFile: b.file.ticks, ticks: b.ticks, hits: b.hits, misses: b.misses,
                labels: (b.file.episode.labels || []).length,
                padsOK: b.file.slots.length === 2 && b.file.slots.every((sl) => sl.pads.length === b.file.ticks),
                stored: window.__pickrushTest.epStats().saved, ls,
            }
        })
        rep.check('REC-BANKED: the real-key take closed as a Plaicraft episode in storage — pads per seat per tick, labels counted, seed honest',
            bank.game === 'pick-rush' && bank.task === 'pick-rush-shift' && bank.success === true
            && bank.padsOK && bank.labels === bank.hits + bank.misses && bank.stored === bank.ls && bank.stored === recBase + 1
            && Number.isInteger(bank.seed) && bank.ticksFile === bank.ticks, JSON.stringify(bank))
        // the harness lane stays silent: reset + scripted ticks + a forced end
        // through the DEV eye must add NOTHING to the store (the loop owns the bank)
        await page.evaluate(() => {
            const g = window.__game
            g.reset(9)
            for (let i = 0; i < 200; i++) g.step([{ right: true }], 1)
            g.release()
            const gs = window.__pickrushTest.sim()
            gs.end = 'fired'; gs.endReason = 'REC GATE'
        })
        await page.waitForFunction(() => window.__pickrushTest.state().mode === 'over', null, { timeout: 8000 })
        const recQuiet = await page.evaluate(() => window.__pickrushTest.epStats().saved)
        rep.check('REC-NOICE: contract drives end the shift but bank no episode', recQuiet === recBase + 1, `stored ${recQuiet}, expected ${recBase + 1}`)

        rep.check('ZERO page errors', pageErrors === 0, String(pageErrors))
    } finally {
        rep.exit(browser)
    }
}

console.log(`\npickcheck/node: ${pass - fails.length}/${pass} checks passed` + (fails.length ? ` — ${fails.length} FAILED` : ' — OK'))
if (MUT) {
    // a mutant run must go RED: if nothing failed, the mutant is not load-bearing
    console.log(fails.length ? `  mutant ${MUT}: caught by ${fails.length} named gate(s)` : `  mutant ${MUT}: SURVIVED — the audit missed it`)
    process.exit(fails.length ? 0 : 1)
}
if (fails.length) { fails.forEach((f) => console.error('  FAIL', f)); process.exit(1) }
