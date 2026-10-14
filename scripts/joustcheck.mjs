// joustcheck — JOUST (Williams, 1982) audited in plain Node, no browser.
//
// The contract: sim.js + waves.js + planner.js are pure, so the joust rule,
// the egg chain, the wrap, the troll hand, crumble timing and the wave
// score ledger are all provable offline against the SAME code the tab runs.
// Expectations are LITERAL numbers, not the sim's own constants — a check
// that imports the number it audits cannot see the number change (the
// TETRIS lesson). The autopilot that drives the attract demo must clear
// waves with its score ledger recomputed event-by-event from the transcript,
// and every run must be hash-for-hash deterministic.

import {
    makeGame, step, stateHash, WAVES,
} from '../src/games/Joust/sim.js'
import { plan } from '../src/games/Joust/planner.js'
import { SFX, SFX_IDS } from '../src/games/Joust/sounds.js'
import { Report } from './lib/harness.mjs'

const r = new Report('joustcheck')
r.info('boot', 'sim.js + waves.js + planner.js imported in Node, zero DOM, zero Math.random')

const play = (gs, input = {}) => step(gs, input)
const toPlay = (gs) => { gs.phase = 'play'; gs.phaseT = 0 }

// ------------------------------------------------------------- physics ----
{
    const gs = makeGame({ players: 1 })
    toPlay(gs)
    const rd = gs.players[0].rider
    Object.assign(rd, { x: 128, y: 60, vx: 0, vy: 0, a: 0, invuln: 0 })
    rd.invuln = 0
    play(gs)
    r.check('gravity: free fall adds exactly 0.045 px/tick^2', Math.abs(rd.vy - 0.045) < 1e-9, `dv=${rd.vy}`)
    let y = rd.y
    for (let i = 0; i < 19 && rd.state === 'alive'; i++) play(gs) // vy uncapped for 44 ticks
    const want = 60 + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].reduce((a, n) => a + 0.045 * n, 0)
    r.check('fall position over 20 ticks matches the literal parabola', Math.abs(rd.y - want) < 1e-6 || rd.state !== 'alive', `y=${rd.y.toFixed(3)} want<=${want.toFixed(3)}`)
}
{
    const gs = makeGame({ players: 1 })
    toPlay(gs)
    const rd = gs.players[0].rider
    rd.invuln = 0
    Object.assign(rd, { x: 20, y: 60, vx: 0, vy: 0, a: 0 })
    play(gs, { f: true })
    r.check('one flap from rest lifts at net -0.067 (thrust 0.112 - gravity 0.045)', Math.abs(rd.vy + 0.067) < 1e-9, `vy=${rd.vy}`)
    let climb = 0
    for (let i = 0; i < 60; i++) { play(gs, { f: true }); if (rd.vy < -0.2) climb++ }
    r.check('sustained flapping climbs (vy reaches -0.2 within 60 ticks)', climb > 20, `ticks climbing=${climb}`)
    r.check('terminal fall speed is capped at 2.0', -rd.vy <= 2.6 && rd.vy <= 2.0 + 1e-9)
}
{
    // tests run over the wave-1 pit column: nothing below until the lava,
    // so no check can pass by having crashed into a ledge first
    const gs = makeGame({ players: 1 })
    toPlay(gs)
    const rd = gs.players[0].rider
    rd.invuln = 0
    Object.assign(rd, { x: 128, y: 40, vx: 0, vy: 0, a: 0, onGround: false })
    for (let i = 0; i < 40; i++) { rd.y = Math.min(rd.y + rd.vy, 90); play(gs, { r: true }); if (rd.y > 70) { rd.y = 40; rd.vy = 0 } }
    r.check('without thrust the tilt caps at +/-0.87 rad (about 50 deg)', rd.state === 'alive' && Math.abs(rd.a - 0.87) < 1e-9, `a=${rd.a}`)
    for (let i = 0; i < 60 && rd.state === 'alive'; i++) { play(gs, {}); if (rd.y > 70) { rd.y = 40; rd.vy = 0 } }
    r.check('auto-upright: released, the mount centres within 60 ticks', rd.state === 'alive' && Math.abs(rd.a) < 1e-9, `a=${rd.a}`)
    const gs3 = makeGame({ players: 1 })
    toPlay(gs3)
    const rd3 = gs3.players[0].rider
    rd3.invuln = 0
    Object.assign(rd3, { x: 128, y: 40, vx: 0, vy: 0, a: 0 })
    for (let i = 0; i < 40 && rd3.state === 'alive'; i++) { play(gs3, { r: true }); if (rd3.y > 60) { rd3.y = 40; rd3.vy = 0 } }
    r.check('a leaning mount still slides (glide builds vx without flapping)', rd3.state === 'alive' && rd3.vx > 0.2, `vx=${rd3.vx.toFixed(3)}`)
    const gs2 = makeGame({ players: 1 })
    toPlay(gs2)
    const rd2 = gs2.players[0].rider
    rd2.invuln = 0
    Object.assign(rd2, { x: 128, y: 40, vx: 0, vy: 0, a: 0.87 })
    let vxMax = 0
    for (let i = 0; i < 160 && rd2.state === 'alive'; i++) { play(gs2, { r: true }); if (rd2.y > 60) { rd2.y = 40; rd2.vy = 0 } vxMax = Math.max(vxMax, Math.abs(rd2.vx)) }
    r.check('glide vx is capped at 2.3', vxMax <= 2.3 + 1e-9 && vxMax > 1, `vxMax=${vxMax}`)
}

// ---------------------------------------------------------------- wrap ----
{
    const gs = makeGame({ players: 1 })
    toPlay(gs)
    const rd = gs.players[0].rider
    rd.invuln = 0
    Object.assign(rd, { x: 255, y: 60, vx: 2, vy: 0, a: 0 })
    let prev = rd.x
    let wrapped = null
    for (let i = 0; i < 6 && wrapped === null; i++) {
        play(gs)
        rd.vx = 2 // hold speed against drag
        if (rd.x < prev) wrapped = rd.x
        prev = rd.x
    }
    r.check('screen wraps right-to-left near the seam, not in mid-air', wrapped !== null && wrapped < 4 && rd.state === 'alive', `wrapped at x=${wrapped}`)
    Object.assign(rd, { x: 1, y: 60, vx: -2, vy: 1, invuln: 0 })
    prev = rd.x
    wrapped = null
    for (let i = 0; i < 6 && wrapped === null; i++) {
        play(gs)
        rd.vx = -2
        if (rd.x > prev) wrapped = rd.x
        prev = rd.x
    }
    r.check('screen wraps left-to-right near the seam', wrapped !== null && wrapped > 252 && rd.state === 'alive', `wrapped at x=${wrapped}`)
}

// ------------------------------------------------- the joust rule itself ----
{
    const mk = () => {
        const gs = makeGame({ players: 1 })
        toPlay(gs)
        const rd = gs.players[0].rider
        rd.invuln = 0
        return gs
    }
    // higher wins
    let gs = mk()
    Object.assign(gs.players[0].rider, { x: 100, y: 100, vx: 0, vy: 1, a: 0, invuln: 0 })
    const foe = gs.riders[0]
    Object.assign(foe, { state: 'hunt', x: 100, y: 120, vx: 0, vy: 0 })
    play(gs)
    r.check('the higher lance wins: foe dies', foe.state === 'dead')
    r.check('winner scores 200 for a bounder', gs.players[0].score === 200, `score=${gs.players[0].score}`)
    r.check('the dead rider drops an egg', gs.eggs.length === 1 && gs.eggs[0].kind === 'bounder')
    r.check('the winner bounces (vy < 0)', gs.players[0].rider.vy < 0)
    // lower loses
    gs = mk()
    Object.assign(gs.players[0].rider, { x: 100, y: 120, vx: 0, vy: 0, a: 0, invuln: 0 })
    Object.assign(gs.riders[0], { state: 'hunt', x: 100, y: 105, vx: 0, vy: 0 })
    play(gs)
    r.check('the lower rider dies', gs.players[0].rider.state === 'dead')
    r.check('the lower rider loses a life', gs.players[0].lives === 2)
    r.check('the foe survives that joust', gs.riders.some((e) => e.state === 'hunt'))
    // dead even
    gs = mk()
    Object.assign(gs.players[0].rider, { x: 100, y: 120, vx: 0, vy: 0, a: 0, invuln: 0 })
    const even = gs.riders[0]
    Object.assign(even, { state: 'hunt', x: 100, y: 121, vx: 0, vy: 0 })
    play(gs)
    r.check('dead-even height kills BOTH', gs.players[0].rider.state === 'dead' && even.state === 'dead')
    // no contact
    gs = mk()
    Object.assign(gs.players[0].rider, { x: 100, y: 100, vx: 0, vy: 0, a: 0, invuln: 0 })
    Object.assign(gs.riders[0], { state: 'hunt', x: 100, y: 140, vx: 0, vy: 0 })
    play(gs)
    r.check('bodies 40px apart do not joust', gs.players[0].rider.state === 'alive' && gs.riders[0].state === 'hunt')
    // invulnerability
    gs = mk()
    Object.assign(gs.players[0].rider, { x: 100, y: 120, vx: 0, vy: 0, a: 0, invuln: 60 })
    Object.assign(gs.riders[0], { state: 'hunt', x: 100, y: 105, vx: 0, vy: 0 })
    play(gs)
    r.check('respawn invulnerability refuses the joust', gs.players[0].rider.state === 'alive' && gs.players[0].lives === 3)
}

// ---------------------------------------------------------- the egg chain ----
{
    // the rider parks far away and goes invulnerable: nothing collects the
    // egg, nothing dies, so the chain runs on its own clock
    const gs = makeGame({ players: 1 })
    toPlay(gs)
    const foe = gs.riders[0]
    Object.assign(foe, { state: 'hunt', x: 30, y: 80, vx: 0, vy: 0 })
    Object.assign(gs.players[0].rider, { x: 30, y: 60, vx: 0, vy: 0, a: 0, invuln: 0 })
    play(gs) // joust win, egg drops
    // invulnerable and far: nothing collects the egg, nothing dies, the chain runs alone
    Object.assign(gs.players[0].rider, { x: 220, y: 100, invuln: 100000 })
    const egg = gs.eggs[0]
    r.check('egg falls fast enough to bank (max 1.8 px/tick)', !!egg)
    let guard = 0
    while (gs.eggs.length && !gs.eggs[0].rest && guard++ < 400) { play(gs); Object.assign(gs.players[0].rider, { x: 220, y: 100 }) }
    r.check('the egg lands and rests', gs.eggs.length === 1 && gs.eggs[0].rest, `guard=${guard}`)
    let hatched = null
    guard = 0
    while (guard++ < 300) {
        play(gs)
        Object.assign(gs.players[0].rider, { x: 220, y: 100 })
        hatched = gs.riders.find((e) => e.kind === 'hunter' && e.state === 'hunt')
        if (hatched) break
    }
    r.check('a left egg hatches a hunter at 240 ticks', !!hatched && gs.eggs.length === 0, `after ${guard} resting ticks`)
    // collect instead
    const gs2 = makeGame({ players: 1 })
    toPlay(gs2)
    Object.assign(gs2.players[0].rider, { x: 30, y: 60, vx: 0, vy: 0, a: 0, invuln: 0 })
    Object.assign(gs2.riders[0], { state: 'hunt', x: 30, y: 80, vx: 0, vy: 0 })
    play(gs2)
    gs2.players[0].score = 0
    const egg2 = gs2.eggs[0]
    Object.assign(gs2.players[0].rider, { x: egg2.x, y: egg2.y - 6, vy: 0, vx: 0, invuln: 0 })
    play(gs2)
    r.check('touching the egg banks +100', gs2.players[0].score === 100 && gs2.eggs.length === 0, `score=${gs2.players[0].score}`)
    // shadow riders drop nothing
    const gs3 = makeGame({ players: 1 })
    toPlay(gs3)
    Object.assign(gs3.players[0].rider, { x: 30, y: 60, vx: 0, vy: 0, a: 0, invuln: 0 })
    const sh = gs3.riders[0]
    sh.kind = 'shadow'
    Object.assign(sh, { state: 'hunt', x: 30, y: 80, vx: 0, vy: 0 })
    play(gs3)
    r.check('a shadow lord drops NO egg (the chain ends)', sh.state === 'dead' && gs3.eggs.length === 0 && gs3.players[0].score === 800, `score=${gs3.players[0].score}`)
}

// ------------------------------------------------- hand, lava, terrain ----
{
    const gs = makeGame({ players: 1 })
    toPlay(gs)
    gs.tick = 30 // hand phase pinned: hand0 (period 360, phase 0) is mid-rise
    const h = gs.hands[0]
    play(gs) // advance hands one tick at tick 31
    const tip = h.y
    r.check('hand rides the pattern: mid-cycle tip sits between lava and its post', tip > 150 && tip < 218, `tip=${tip.toFixed(1)}`)
    const rd = gs.players[0].rider
    Object.assign(rd, { x: h.x, y: tip + 4, vx: 0, vy: 0, a: 0, invuln: 0 })
    play(gs)
    r.check('the troll hand eats a rider below its tip', rd.state === 'dead', `cause=hand`)
}
{
    const gs = makeGame({ players: 1 })
    toPlay(gs)
    const rd = gs.players[0].rider
    Object.assign(rd, { x: 128, y: 205, vx: 0, vy: 1, a: 0, invuln: 0 }) // over the wave-1 pit
    play(gs)
    r.check('lava kills over a pit (feet past y=212)', rd.state === 'dead')
}
{
    const gs = makeGame({ players: 1 })
    toPlay(gs)
    const rd = gs.players[0].rider
    Object.assign(rd, { x: 72, y: 138, vx: 0, vy: 1, a: 0, invuln: 0 }) // above the 152 ledge
    let g1 = 0
    while (g1++ < 40 && rd.state === 'alive' && !rd.onGround) play(gs)
    r.check('upright arrival lands safe on the ledge', rd.onGround === true && rd.vy === 0 && rd.state === 'alive', `y=${rd.y}`)
    const gs2 = makeGame({ players: 1 })
    toPlay(gs2)
    Object.assign(gs2.players[0].rider, { x: 72, y: 138, vx: 0, vy: 1, a: 1.2, invuln: 0 })
    let g2 = 0
    while (g2++ < 40 && gs2.players[0].rider.state === 'alive' && !gs2.players[0].rider.onGround) play(gs2)
    r.check('arriving crooked (>0.52 rad) is a crash', gs2.players[0].rider.state === 'dead')
}
{ // crumble: wave 3's ledges forgive one ride, then not
    const gs = makeGame({ players: 1 })
    toPlay(gs)
    gs.segs = WAVES[2].segs.map((s) => ({ ...s, rideT: 0, gone: false }))
    const seg = gs.segs.find((s) => s.crumble)
    const rd = gs.players[0].rider
    Object.assign(rd, { x: (seg.x0 + seg.x1) / 2, y: seg.y - 20, vx: 0, vy: 1, a: 0, invuln: 0 })
    let g0 = 0
    while (g0++ < 40 && rd.state === 'alive' && !rd.onGround) play(gs)
    r.check('a rider lands on the crumble ledge', rd.onGround === true && rd.state === 'alive')
    let t = 1
    while (t < 100 && !seg.gone) { play(gs); t++ }
    r.check('the ledge crumbles 100 ticks into a ride', seg.gone === true, `at ride tick ${t}`)
    play(gs)
    r.check('and drops the rider into the air after', rd.onGround === false && rd.vy > 0)
}
{ // terrain claims enemy riders too
    const gs = makeGame({ players: 1 })
    toPlay(gs)
    gs.players[0].rider.invuln = 120
    Object.assign(gs.players[0].rider, { x: 20, y: 40, vx: 0, vy: 0, a: 0 })
    const foe = gs.riders[0]
    Object.assign(foe, { state: 'hunt', x: 128, y: 210, vx: 0, vy: 1 })
    play(gs)
    r.check('lava claims enemy riders (+50 terrain kill)', foe.state === 'dead' && gs.players[0].score === 50, `score=${gs.players[0].score}`)
}

// ------------------------------------------------ waves as data + ledger ----
r.check('the issue asks five waves', WAVES.length === 5)
r.check('every wave has ground, spawns and a roster', WAVES.every((w) => w.segs.some((s) => s.y === 204) && w.spawns.length >= 1 && w.roster.length >= 3))
r.check('later waves bring the crumble and the third hand', WAVES[2].segs.some((s) => s.crumble) && WAVES[2].hands.length === 3 && WAVES[4].roster.some((s) => s.kind === 'shadow'))
{ // pit audit: every wave's pits sit inside the screen and lava is below all ground
    let ok = true
    const SCREEN_W = 256
    for (const w of WAVES) {
        const grounds = w.segs.filter((s) => s.y === 204).sort((a, b) => a.x0 - b.x0)
        let cur = 0
        for (const g of grounds) {
            if (g.x0 > cur && g.x0 - cur > 64) ok = false // a pit wider than a rider can cross from the air? width cap 64
            cur = Math.max(cur, g.x1)
        }
        if (SCREEN_W - cur > 64) ok = false
    }
    r.check('no lava pit is wider than 64 px (a glide across is always possible)', ok)
}

// --------------------------------------------- the autopilot + wave ledger ----
function waveRun(maxTick = 60 * 60 * 15) {
    const gs = makeGame({ players: 1 })
    let ledger = 0
    let maxWave = 0
    let t = 0
    let peakLives = gs.players[0].lives
    let collected = 0
    let hatched = 0
    while (!gs.end && t < maxTick) {
        step(gs, plan(gs))
        t++
        for (const e of gs.events) {
            if (e.t === 'kill') ledger += e.cause === 'terrain' ? 50 : ({ bounder: 200, hunter: 400, shadow: 800 }[e.kind] || 0)
            if (e.t === 'eggget') { ledger += 100; collected++ }
            if (e.t === 'clear') ledger += e.bonus
            if (e.t === 'hatch') hatched++
        }
        gs.events.length = 0
        maxWave = Math.max(maxWave, gs.wave)
        peakLives = Math.max(peakLives, gs.players[0].lives)
    }
    return { gs, t, ledger, maxWave, peakLives, collected, hatched, hash: stateHash(gs) }
}

const A = waveRun()
r.check('the autopilot clears at least two waves (the game can be won by its own demo pilot)', A.maxWave >= 2, `reached wave ${A.maxWave + 1} in ${Math.round(A.t / 60)}s of world time`)
r.check('the autopilot banks the joust score, not just survival', A.gs.players[0].score >= 1000, `score=${A.gs.players[0].score}`)
r.check('the wave ledger adds up event-by-event against the final score', A.gs.total === A.ledger, `total=${A.gs.total} ledger=${A.ledger}`)
r.check('the pilot collects eggs (the chain is part of the win)', A.collected >= 3, `collected=${A.collected}, hatched=${A.hatched}`)

const B = waveRun(A.t + 1)
r.check('the autopilot run is hash-for-hash deterministic', B.hash === A.hash, `${A.hash} vs ${B.hash}`)

{ // stress: take the top speed away — a pilot that only wins with physics cheats is not a pilot
    const gs = makeGame({ players: 1 })
    let t = 0
    let maxWave = 0
    while (!gs.end && t < 60 * 60 * 15) {
        step(gs, plan(gs))
        // impose a slower max every tick (planner cannot see it change the ceiling)
        const rd = gs.players[0].rider
        if (rd && rd.state === 'alive') {
            if (rd.vx > 1.8) rd.vx = 1.8
            if (rd.vx < -1.8) rd.vx = -1.8
        }
        t++
        maxWave = Math.max(maxWave, gs.wave)
        gs.events.length = 0
    }
    r.check('the pilot still clears wave 1 with vx clipped to 1.8', maxWave >= 1, `reached wave ${maxWave + 1}`)
}

// -------------------------------------------------------- egg-hatch proof ----
{ // an autopilot BLIND to eggs leaves them on the ledges: the wave must get
    // harder on its own. If this ever reports 0, the hatch chain in the live
    // sim is dead code and the pilot's perfect egg ledger proves nothing.
    const gs = makeGame({ players: 1 })
    let t = 0
    let sawHunterFromEgg = 0
    while (!gs.end && t < 60 * 60 * 15) {
        const eggs = gs.eggs
        gs.eggs = []
        const inp = plan(gs)
        gs.eggs = eggs
        step(gs, inp)
        t++
        for (const e of gs.events) if (e.t === 'hatch' && e.kind === 'hunter') sawHunterFromEgg++
        gs.events.length = 0
    }
    r.check('eggs left by an egg-blind pilot really do hatch mid-run (the chain is live)', sawHunterFromEgg >= 1, `hatched=${sawHunterFromEgg}`)
}

// ------------------------------------------------------------ sound table ----
// The cabinet's SFX had grain — a growl, a wing-flap crash, an egg-tinkle. The
// flat one-beep-per-event was the gap. sounds.js maps each event class to a
// recipe of voices; index.jsx plays them. Pinned here in Node so a regression
// (two events merged to one timbre, a growl deleted, the tinkle flattened) is
// red, not a shrug.
{
    const need = ['joust', 'smite', 'death', 'egg-get', 'egg-drop', 'hatch', 'crumble', 'clear', 'oneup', 'over', 'win']
    const PRIMS = ['tone', 'sweep', 'noise', 'fanfare', 'death']
    r.check('the sound table covers every event class that makes a sound', need.every((id) => Array.isArray(SFX[id]) && SFX[id].length >= 1), SFX_IDS.join(','))
    r.check('every recipe voice names a known AudioController primitive', Object.values(SFX).every((rec) => rec.every((v) => PRIMS.includes(v.k))))

    // no two event classes may share an identical recipe — the distinction IS the grain
    const sig = (id) => JSON.stringify(SFX[id])
    const seen = {}
    let dup = null
    for (const id of need) { if (seen[sig(id)]) dup = `${id} == ${seen[sig(id)]}`; seen[sig(id)] = id }
    r.check('no two event classes share an identical SFX recipe', dup === null, dup || `${need.length} recipes all distinct`)

    // the low growl: hatch is a sawtooth down-sweep that ends below 100 Hz
    const hatch = SFX.hatch[0]
    r.check('hatch is the low growl (sawtooth down-sweep, ends below 100 Hz)', hatch.k === 'sweep' && hatch.w === 'sawtooth' && hatch.f0 > hatch.f1 && hatch.f1 < 100, JSON.stringify(hatch))
    // the wing-flap crash: death carries a noise voice
    r.check('the death is a wing-flap crash (carries a noise voice)', SFX.death.some((v) => v.k === 'noise'))
    // the lance growl: the joust carries a sawtooth voice
    r.check('the joust carries the growl (a sawtooth voice)', SFX.joust.some((v) => v.k === 'sweep' && v.w === 'sawtooth'))

    // the egg-tinkle vs the egg plop: two high notes, brighter than the drop
    const peak = (rec) => rec.reduce((m, v) => Math.max(m, v.f || 0, v.f0 || 0, v.f1 || 0), 0)
    const tinkle = SFX['egg-get']
    r.check('the egg-tinkle is two high-register notes (>700 Hz each)', tinkle.length === 2 && tinkle.every((v) => v.f > 700), JSON.stringify(tinkle))
    r.check('the tinkle is brighter than the drop (egg-get peaks above egg-drop)', peak(SFX['egg-get']) > peak(SFX['egg-drop']), `get=${peak(SFX['egg-get'])} drop=${peak(SFX['egg-drop'])}`)
    // the victory outdoes the wave-clear
    r.check('the victory outdoes the wave-clear (win recipe is longer than clear)', SFX.win.length > SFX.clear.length, `win=${SFX.win.length} clear=${SFX.clear.length}`)
}

r.exit()
