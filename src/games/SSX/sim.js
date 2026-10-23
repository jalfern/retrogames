// SSX — sim.js : the whole mountain as one pure function of (state, input).
// No DOM, no React, no Math.random — seeded LCG only. This exact module is
// what scripts/ssxcheck.mjs imports in Node, so the race the harness proves
// winnable is the exact race the cabinet rides, tick for tick.
//
// THE CONTRACT (the 2000 original's, honoured):
// - DOWNHILL IS FREE SPEED. Gravity feeds you off the drop; carving and powder
//   take it back. The boost meter is the only engine.
// - TRICKS PAY, LANDINGS COLLECT. A trick only banks on a clean landing; a
//   half-finished flip eats it. Chains multiply up to x4; a bail resets to x1.
// - OVER: takeoff with a FULL meter doubles everything and unlocks the
//   over-the-top names (Frontflip 900, the 1080).
// - BOOST is spent speed: tricks fill the meter, Shift drains it into the
//   hill. A crash dumps half of it.
// - RACE: three heats, standings points, the mountain decides the champion.
//   SHOWOFF: 90 seconds, pure trick points against the house target.

import { buildCourse, terrainY, segAt, featureLift, COURSE_COUNT, WALL_X, DS } from './course.js'
import { decide, PACE, SKILL, cpuMiss } from './planner.js'

export const FIXED_DT = 1000 / 60

const rollLcg = (g) => { g._rs = (Math.imul(g._rs, 1664525) + 1013904223) >>> 0; return g._rs / 4294967296 }

export const CFG = {
    G: 22,                     // arcade gravity, m/s^2
    top: 30, boostTop: 38,     // m/s ceilings (face plate ~ km/h x3.6)
    STEER: 1.15,               // piste fractions / s at reference speed
    PRESS: 10,                 // #791 analog steer: pressure units / s (full carve ~0.1 s)
    CENT: 0.30,                // centrifugal push in a curve
    spinRate: 300,             // deg / s
    flipRate: 520,             // deg / s while held — an arcade-fast flip
    boostDrain: 26,            // meter / s spent
    boostAcc: 9,
    boostRev: 0.8,             // #791 boost engine: rev/s the bed climbs toward redline
                               // while Shift is held (hum 0→1 in ~1.25 s) — a sustained
                               // rising engine, not a one-shot whine
    boostGain: 0.02,           // meter per trick point — the whole economy
    attractFuel: 22,           // #791 attract demo only: meter/s fed into a HOT input
                               // (inp.fuel) so the showcase rider reaches lips full and
                               // throws OVERs — the original's attract was a highlight
                               // reel. A real input never carries fuel; see planner hot.
    tuckAcc: 3.2,              // m/s^2 the aero tuck (stick/↑) adds on the hill
    scrubDrag: 0.12,           // fraction/s of speed a scrub (stick/↓) checks
    revertPts: 200,            // #791 revert: landing spun the OPPOSITE way to the
                               // takeoff carve pays a style bonus (score, not meter —
                               // the boost economy stays the trick economy)
    revertTake: 0.25,          // edge pressure at takeoff for the carve to "own" a direction
    revertSpin: 120,           // degrees of opposite rotation that commits the revert
    rockBounce: 7.0,           // m/s kicked back off a rock top landed from above (#731)
    rockPts: 200,              // style points for the boulder boop
    bobbleK: 0.85,             // #791 line-bobble: skill-scaled odds a CPU *recovers*
                               // from clipping an obstacle (glance, speed+line loss) instead
                               // of going over the bars — seats miss lines, not just landings
    bobbleDrag: 0.82,          // fraction of speed kept past a clip
    bobbleKick: 0.55,          // lateral knock off the clip, piste fractions
    bobbleMeter: 12,           // meter scrubbed off by the obstacle
    bobbleT: 34,               // frames of off-balance wobble after a clip
    invertRate: 420,           // #791 slice 12: deg/s the board rolls about its long
                               // axis while an invert is held — one rotation in ~0.86 s,
                               // arcade-fast like the flips so it fits normal air
    invertPts: 400,            // per full invert rotation (a grab-turned board is worth
                               // more than the grab alone)
    invertCheck: true,         // half-done inverts crash you, same law as flips
    comboCap: 4,
    overDouble: true,
    flipCheck: true,           // half-done flips crash you
    wallCrash: true,
    showoffTime: 90,
    showoffTarget: 8000,
    slack: false,              // the harness flips this to 0.75x trick economy
}

export const PLACE_PTS = [10, 7, 5, 3, 2, 1]
export const CARVE_FADE = 300

// #894 (the #873 answer — Jon picked analogue): the touch pad's physical
// stick tilts map onto the original's dual-stick verbs. `ty` is the stick's
// vertical vector in screen space (-1 = pushed forward/up, +1 = pulled back).
// Forward tilt tucks and commits a FRONT flip (the sim's negative ledger,
// flip === 2); back tilt scrubs and keeps the back flip. A neutral tilt
// commits nothing — the FLIP button alone still throws the default back flip.
export const STICK_TILT = { flip: 0.5, body: 0.4 }
export function flipDirFromTilt(ty) {
    if (ty <= -STICK_TILT.flip) return 2
    if (ty >= STICK_TILT.flip) return 1
    return 0
}
export function bodyFromTilt(ty) {
    return { tuck: ty <= -STICK_TILT.body, scrub: ty >= STICK_TILT.body }
}
const GRABS = [
    { name: 'INDY', back: 1, spot: 'toe' },
    { name: 'MUTE', back: 0, spot: 'toe' },
    { name: 'METHOD', back: 1, spot: 'heel' },
    { name: 'SALISBURY', back: 0, spot: 'heel' },
    { name: 'NOSEGRAB', back: 0, spot: 'nose' },
    { name: 'TAILGRAB', back: 1, spot: 'tail' },
]
// #791 slice 6: the grab's NAME comes from the inputs that reach it —
// steer sign picks the hand, held flip commits the weight fore/aft, held
// scrub presses the heel edge. Front hand leads for regular (even seat),
// goofy (odd seat) mirrors it. The flip commit follows the reach: front hand
// goes nose, back hand goes tail; the findIndex fallback is a safety net for
// table gaps, resolving to the hand's between-feet edge grab.
export function grabKindFor(steer, flipHeld, scrubHeld, stanceFrontLeft) {
    const reachLeft = steer < -0.05
    const back = reachLeft === !!stanceFrontLeft ? 0 : 1
    const spot = flipHeld ? (back ? 'tail' : 'nose') : scrubHeld ? 'heel' : 'toe'
    let k = GRABS.findIndex((g) => g.back === back && g.spot === spot)
    if (k < 0) k = back ? 0 : 1
    return k
}
export const GRAB_NAMES = GRABS.map((g) => g.name)
export const GRAB_POSES = ['grabIndy', 'grabFlat', 'grabMethod', 'grabSalis', 'grabNose', 'grabTail']
const SPINS = ['', '180', '360', '540', '720', '900', '1080']
const NAMES = ['JEFF', 'MAC', 'RIFF', 'SIG', 'TYRONE', 'KAELI']
export const RIDER_COLORS = [0x3ec8ff, 0xff4fa3, 0xffc23e, 0x7bff5e, 0xb381ff, 0xff7a3e]

export const fmtTime = (t) => {
    const s = Math.floor(t / 60), m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}.${String(Math.floor((t % 60) * 100 / 100)).padStart(2, '0')}`
}

function newRider(i, isP, gridBack) {
    return {
        id: i, isP, name: isP ? 'YOU' : NAMES[i],
        color: RIDER_COLORS[i],
        s: -gridBack * 7, x: ((i % 2) ? 1 : -1) * 0.3 + (i * 0.13), y: 0, vy: 0,
        v: 0, air: false, airT: 0, spin: 0, spinDir: 0, flip: 0, grab: 0, grabKind: 0, stance: i % 2,
        invert: 0, invertSign: 1,
        crouch: false, crouchT: 0, boost: false, boostEdge: false, boostHum: 0,
        tuck: false, scrub: false,
        tumble: 0, stomp: 0, stompPow: 0, chain: 0, chainDisp: 0, chainDispT: 0,
        meter: 0, over: false, grind: null, grindT: 0,
        finished: false, place: 0, finishT: 0, points: 0,
        lastTrick: null, lastTrickT: 0, score: 0,
        crashes: 0, tricksLanded: 0, bigAir: 0,
        carves: [],
        bounceOb: -1,
        miss: false,
        bobble: 0, bobbleOb: -1,
        jumpHeld: false, steerSm: 0, press: 0, takeSpin: 0, seedPhase: i * 1.7 + 0.4,
    }
}

export function makeGame(mode = 'race', seed = 0) {
    const g = {
        mode, seed, tick: 0,
        heat: 0, course: buildCourse(mode === 'showoff' ? 2 : 0),
        phase: 'count', count: 180, runT: 0, heatT: 0,
        riders: Array.from({ length: 6 }, (_, i) => newRider(i, i === 0, mode === 'showoff' ? i * 2 : (i === 0 ? 2 : i - 1))),
        heatResults: [], standings: [0, 0, 0, 0, 0, 0],
        end: null, why: '', place: 0,
        showoffLeft: mode === 'showoff' ? CFG.showoffTime : 0,
        lastHeatPlace: 0, flash: {},
        events: [], _rs: (seed * 2654435761 + 101) >>> 0,
    }
    g.riders[0].s = -14
    return g
}

export function loadHeat(g, heat) {
    g.heat = heat
    g.course = buildCourse(heat)
    g.phase = 'count'; g.count = 180; g.heatT = 0
    for (const r of g.riders) {
        Object.assign(r, newRider(r.id, r.isP, r.isP ? 2 : r.id - 1))
        r.s = (r.isP ? -14 : -(r.id - 1) * 7)
        r.lastTrick = null
    }
    push(g, { type: 'heat', heat })
}

export function push(g, e) { g.events.push(e) }

function evalTrick(g, r, impact = 0) {
    const sp = Math.min(6, Math.floor(Math.abs(r.spin) / 175))
    const fl = Math.round(Math.abs(r.flip) / 360)
    const flOk = !CFG.flipCheck || Math.abs(Math.abs(r.flip) - fl * 360) <= 55 || Math.abs(r.flip) < 140
    if (fl > 0 && !flOk) return { crash: true }
    // #791 slice 12: the invert ledger — full rolls bank, half-done ones eat it.
    const iv = Math.round(Math.abs(r.invert) / 360)
    const ivOk = !CFG.invertCheck || Math.abs(Math.abs(r.invert) - iv * 360) <= 55 || Math.abs(r.invert) < 140
    if (iv > 0 && !ivOk) return { crash: true }
    const spinPts = sp * sp * 50
    const flipPts = fl * 350
    const grabPts = r.grab ? 150 : 0
    const invertPts = iv * CFG.invertPts
    const airPts = r.airT > 1.1 ? 300 + Math.round(r.airT * 60) : Math.round(r.airT * 80)
    const pipeB = r.pipeAir ? 250 : 0
    // #791 revert: the board came off the lip carved one way and lands spun
    // the other way. Style bonus on the score — the meter keeps counting the
    // pre-revert base, so the boost economy stays exactly the trick economy.
    const revert = r.takeSpin !== 0 && r.spin * r.takeSpin < 0 && Math.abs(r.spin) >= CFG.revertSpin
    let base = spinPts + flipPts + grabPts + invertPts + airPts + pipeB
    if (base < 60) return { crash: false, pts: 0 }
    const mult = Math.min(CFG.comboCap, r.chain + 1)
    if (r.over && CFG.overDouble) base *= 2
    const pts = base * mult
    const revertBonus = revert ? Math.round(CFG.revertPts * mult * (r.over && CFG.overDouble ? 2 : 1)) : 0
    const spinName = SPINS[sp] || ''
    const flipName = fl > 0 ? `${fl > 1 ? 'DOUBLE ' : ''}${r.flip < 0 ? 'FRONT' : 'BACK'}FLIP ` : ''
    const grabName = r.grab ? GRABS[r.grabKind].name + ' ' : ''
    const invName = iv > 0 ? `${iv > 1 ? 'DOUBLE ' : ''}${r.invertSign < 0 ? 'SOLID' : 'NIKE'} INVERT ` : ''
    r.chain = Math.min(CFG.comboCap - 1, r.chain + 1)
    r.chainDisp = mult; r.chainDispT = 150
    r.score += pts + revertBonus; r.tricksLanded++
    if (r.airT > 1.2) r.bigAir++
    r.meter = Math.min(100, r.meter + pts * CFG.boostGain * (CFG.slack ? 0.75 : 1))
    r.lastTrick = `${r.over ? 'OVER!! ' : ''}${revert ? 'REVERT ' : ''}${flipName}${grabName}${invName}${spinName}${spinName ? '' : 'AIR'}`.trim()
    r.lastTrickT = 150
    push(g, { type: 'land', who: r.id, pts: pts + revertBonus, name: r.lastTrick, mult, over: !!r.over, revert, bigAir: r.airT > 1.2, impact, invert: iv })
    return { crash: false, pts: pts + revertBonus }
}

function crash(g, r, what) {
    if (r.tumble > 0) return
    r.tumble = 70
    r.crashes++
    r.chain = 0
    r.v *= 0.22
    r.meter *= 0.5
    r.over = false
    r.spin = 0; r.flip = 0; r.grab = 0; r.air = false; r.grind = null; r.invert = 0
    r.press = 0; r.takeSpin = 0
    r.stomp = 0; r.stompPow = 0
    r.bobble = 0
    push(g, { type: 'crash', who: r.id, what })
}

function riderStep(g, r, inp) {
    const c = g.course
    const dt = 1 / 60
    if (r.tumble > 0) {
        r.tumble--
        r.v = Math.max(6, r.v - 12 * dt)
        r.s += r.v * dt
        r.x *= 0.96
        r.y = terrainY(c, r.s, r.x)
        if (r.tumble === 0) { r.v = Math.min(r.v, 12); push(g, { type: 'up', who: r.id }) }
        return
    }
    if (r.stomp > 0) r.stomp--
    if (r.bobble > 0) r.bobble--
    const pace = r.isP ? 1 : PACE[r.id - 1]
    // #791 analog steer: the board loads onto an edge over ~0.1 s of held
    // pressure instead of snapping to full lock — a tap nips, a hold carves.
    // Touch drag distance feeds the target directly (index.jsx); keyboard/pad
    // ±1 feeds the same ramp, so both inputs are pressure-scaled.
    const want = Math.max(-1, Math.min(1, inp.steer || 0))
    r.press += Math.max(-CFG.PRESS * dt, Math.min(CFG.PRESS * dt, want - r.press))
    const steer = r.press

    // ---- rails: grind zone snaps you on and pays trickle ----
    let rail = null
    if (!r.air) {
        for (const rl of c.rails) {
            const s0 = rl.i0 * DS, s1 = rl.i1 * DS
            if (r.s > s0 - 2 && r.s < s1 + 2 && Math.abs(r.x - rl.x) < 0.32) { rail = rl; break }
        }
    }
    if (rail) {
        if (!r.grind) { r.grind = rail; r.grindT = 0; r.spin = 0; r.flip = 0; r.invert = 0; push(g, { type: 'grindstart', who: r.id }) }
        r.grindT += dt
        r.tuck = false; r.scrub = false
        r.x += (rail.x - r.x) * 0.4
        r.v = Math.max(r.v, 12)
        r.y = terrainY(c, r.s, rail.x) + 0.18
        r.s += r.v * dt
        const gp = Math.round(90 * dt * 10) / 10
        r.score += gp
        r.meter = Math.min(100, r.meter + gp * CFG.boostGain * (CFG.slack ? 0.75 : 1))
        if (r.s > rail.i1 * DS + 1) {
            const tot = Math.round(60 + r.grindT * 90)
            push(g, { type: 'grind', who: r.id, pts: tot })
            r.grind = null
        }
        return
    }
    r.grind = null

    if (r.air) {
        // ---- AIR: the trick ledger runs here, the landing collects ----
        r.airT += dt
        r.tuck = false; r.scrub = false
        r.vy -= CFG.G * dt
        r.y += r.vy * dt
        r.s += r.v * dt
        r.spin += steer * CFG.spinRate * dt
        // #791 doubles: past a second of hang the rotation ledger opens to a
        // second flip — airtime is the limiter (520°/s needs ~1.4 s to bank a
        // DOUBLE), and flipCheck still eats any unfinished attempt.
        const flipCap = (r.over || r.airT > 1.05) ? 720 : 360
        if (inp.flip && Math.abs(r.flip) < flipCap + 20) r.flip += CFG.flipRate * dt * (inp.flip === 2 ? -1 : 1)
        if (inp.grab && !r.grab) { r.grab = 1; r.grabKind = grabKindFor(steer, inp.flip, inp.scrub, r.stance === 0) }
        // #791 slice 12: the invert — a grabbed board pushed over about its long
        // axis. Hands on the board (a held grab) are what turn it, and the roll
        // only advances while held, exactly like the flip ledger; steer sign at the
        // first frame picks the direction (NIKE vs SOLID). Half-done rolls crash.
        if (inp.invert && r.grab && Math.abs(r.invert) < 740) {
            if (r.invert === 0) r.invertSign = steer < -0.05 ? -1 : 1
            r.invert += CFG.invertRate * dt * r.invertSign
        }
        const groundY = terrainY(c, r.s, r.x)
        if (r.vy < 0) {
            // rock tops are bounce pads (#731): descending onto one kicks you
            // back off with style points — a second contact is a crash, and a
            // rock met at ground level still bails (the loop below).
            for (const ob of c.obstacles) {
                if (ob.kind !== 'rock') continue
                const os = ob.i * DS
                if (Math.abs(os - r.s) < DS * 0.9 && Math.abs(ob.x - r.x) < ob.r) {
                    const top = groundY + 1.1
                    if (r.y <= top) {
                        if (r.bounceOb === ob.i) { crash(g, r, 'rock'); return }
                        r.bounceOb = ob.i
                        r.y = top
                        r.vy = CFG.rockBounce
                        r.score += CFG.rockPts
                        r.meter = Math.min(100, r.meter + CFG.rockPts * CFG.boostGain * (CFG.slack ? 0.75 : 1))
                        r.lastTrick = 'ROCK BOUNCE'
                        r.lastTrickT = 150
                        push(g, { type: 'rockbounce', who: r.id, pts: CFG.rockPts, name: 'ROCK BOUNCE' })
                        return
                    }
                }
            }
        }
        if (r.y <= groundY && r.vy < 0) {
            r.y = groundY
            r.air = false
            // #791: landing impact — descent speed at touchdown drives a
            // compression/stomp pose and sizes the spray burst in the renderer.
            // Purely cosmetic state: physics is untouched, but it rides the
            // hash so replays stomp identically.
            const impact = Math.max(0, -r.vy)
            r.stompPow = Math.min(1, impact / 11)
            if (r.stompPow > 0.04) r.stomp = Math.round(8 + r.stompPow * 10)
            // #791: the seat flagged at takeoff washes out on landing —
            // chain and meter go, the field drives past it.
            if (r.miss) { r.miss = false; crash(g, r, 'miss'); return }
            const res = evalTrick(g, r, impact)
            r.pipeAir = false
            if (res.crash) { crash(g, r, 'bail'); return }
            r.spin = 0; r.flip = 0; r.grab = 0; r.airT = 0; r.over = false; r.takeSpin = 0; r.invert = 0
            if (res.pts > 0) { /* banked */ }
            // landing absorption: slope landings keep speed, flat landings shed a little
            const { seg } = segAt(c, r.s)
            r.v *= seg.drop > 0.08 ? 0.97 : 0.9
        }
        return
    }

    // ---- GROUND ----
    const { seg } = segAt(c, r.s)
    r.y = terrainY(c, r.s, r.x)
    const gain = seg.drop * CFG.G * 1.55
    r.v += gain * dt
    r.v -= (Math.abs(steer) * 0.028 + r.v * 0.0018) * r.v * dt
    if (Math.abs(r.x) > 1) {
        if (r.v > 14) r.v -= (r.v - 14) * 0.9 * dt       // powder drag
    }
    // tuck / scrub (stick or ↑/↓, #547): the aero tuck parting the wind pays,
    // an edge-check scrub bites speed. Steering stays live through both.
    r.tuck = !!inp.tuck
    r.scrub = !!inp.scrub
    if (r.tuck && !r.scrub) r.v += CFG.tuckAcc * dt
    if (r.scrub) r.v -= CFG.scrubDrag * r.v * dt
    // boost spend
    const wantBoost = !!inp.boost && r.meter > 0
    if (wantBoost) {
        r.meter = Math.max(0, r.meter - CFG.boostDrain * dt)
        r.v += CFG.boostAcc * dt
        if (!r.boostEdge) { r.boostEdge = true; r.boostHum = 0; push(g, { type: 'boost', who: r.id }) }
        r.boostHum = Math.min(1, r.boostHum + CFG.boostRev * dt)
    } else { r.boostEdge = false; r.boostHum = 0 }
    // #791 attract fuel: only an inp.fuel (hot attract) input carries it, and
    // only the witness rides hot in attract — the race and the field never do.
    if (inp.fuel && r.isP && r.meter < 100) r.meter = Math.min(100, r.meter + CFG.attractFuel * dt)
    r.boost = wantBoost
    const top = wantBoost ? CFG.boostTop * pace : CFG.top * pace
    r.v = Math.max(0, Math.min(top, r.v))

    // crouch / ollie: hold to compress, release to snap off the snow
    if (inp.jump) { r.crouch = true; r.crouchT = Math.min(0.6, r.crouchT + dt) }
    else if (r.crouch) {
        r.crouch = false
        const boostV = 3 + r.crouchT * 4
        r.vy = boostV
        r.air = true; r.airT = 0; r.spin = 0; r.flip = 0; r.grab = 0; r.stomp = 0; r.invert = 0
        r.over = r.meter >= 100
        r.takeSpin = Math.abs(r.press) >= CFG.revertTake ? Math.sign(r.press) : 0
        r.miss = !r.isP && cpuMiss(g, r)
        push(g, { type: 'jump', who: r.id, small: true })
    }
    r.crouchT = r.crouch ? r.crouchT : 0

    // lateral: steer + the curve's centrifugal push
    r.steerSm += (steer - r.steerSm) * Math.min(1, 6 * dt)
    const sf = r.v / 30
    const pow = Math.abs(r.x) > 1 ? 0.5 : 1
    r.x += steer * CFG.STEER * sf * pow * dt
    r.x -= seg.curve * r.v * CFG.CENT * dt
    if (CFG.wallCrash && Math.abs(r.x) >= WALL_X) {
        r.x = Math.sign(r.x) * (WALL_X - 0.12)
        crash(g, r, 'wall')
        return
    }
    r.s += r.v * dt

    // obstacles: only bite when you are on their level.
    // #791 line-bobble: the CPU field misses *lines*, not just landings. When a
    // rival clips a rock/tree it should have dodged, a skilled seat glances off
    // and recovers — speed and line lost, but the board keeps rolling — while a
    // bad roll still goes over the bars. The player is never exempt: the same
    // contact at ground level is a straight bailing (the original's rule).
    for (const ob of c.obstacles) {
        const os = ob.i * DS
        if (Math.abs(os - r.s) < DS * 0.9 && Math.abs(ob.x - r.x) < ob.r) {
            const obH = ob.kind === 'tree' ? 2.4 : 1.1
            if (r.y < terrainY(c, r.s, r.x) + obH) {
                if (!r.isP && r.bobbleOb !== ob.i && rollLcg(g) < CFG.bobbleK * SKILL[r.id - 1]) {
                    r.bobbleOb = ob.i
                    r.v *= CFG.bobbleDrag
                    r.x += (ob.x > r.x ? -1 : 1) * CFG.bobbleKick
                    r.meter = Math.max(0, r.meter - CFG.bobbleMeter)
                    r.bobble = CFG.bobbleT
                    push(g, { type: 'bobble', who: r.id, what: ob.kind })
                    continue
                }
                crash(g, r, ob.kind); return
            }
        }
    }

    // auto-launch: the terrain stepping up hard ahead of the board, or the
    // lip running out from under it (the crest of a kicker / pipe wall)
    const dAhead = r.v * 2 * dt + 0.6
    const ahead = terrainY(c, r.s + dAhead, r.x)
    const liftHere = featureLift(c, r.s, r.x)
    if ((ahead - r.y > 0.55 || (liftHere > 0.8 && r.y - ahead > 0.3)) && r.v > 12) {
        const lip = segAt(c, r.s)
        r.vy = Math.max(4.5, liftHere * 1.9) + r.v * 0.11 + r.crouchT * 2.5
        r.air = true; r.airT = 0; r.spin = 0; r.flip = 0; r.grab = 0; r.stomp = 0; r.invert = 0
        r.over = r.meter >= 100
        r.takeSpin = Math.abs(r.press) >= CFG.revertTake ? Math.sign(r.press) : 0
        r.miss = !r.isP && cpuMiss(g, r)
        r.pipeAir = c.pipes.some((p) => lip.i >= p.i0 - 1 && lip.i <= p.i1 + 1)
        push(g, { type: 'jump', who: r.id, power: r.vy, pipe: r.pipeAir })
    }

    // carve tracks: hard steering bites grooves into the slope; they fade in ~5 s
    if (r.isP && r.v > 8 && Math.abs(steer) > 0.45) {
        r.carves.push({ s: r.s, x: r.x, t: g.tick })
        if (r.carves.length > 420) r.carves.splice(0, r.carves.length - 420)
    }
    while (r.carves.length && g.tick - r.carves[0].t > CARVE_FADE) r.carves.shift()
}

function finishCheck(g, r) {
    if (r.finished) return
    const finishS = g.course.finish * DS
    if (g.mode === 'showoff') {
        if (r.s >= finishS) { r.s = 60; push(g, { type: 'loop', who: r.id }) }
        return
    }
    if (r.s >= finishS) {
        r.finished = true
        r.finishT = g.heatT
        r.place = 1 + g.riders.filter((q) => q.id !== r.id && q.finished).length
        g.standings[r.id] += PLACE_PTS[Math.min(5, r.place - 1)]
        r.points = g.standings[r.id]
        push(g, { type: 'finish', who: r.id, place: r.place, t: r.finishT })
        if (r.isP) {
            g.lastHeatPlace = r.place
            g.phase = 'heatEnd'; g.heatT = 0
        }
    }
}

export function step(g, inp = {}) {
    if (g.end) return
    g.tick++

    if (g.phase === 'count') {
        g.count--
        if (g.count % 60 === 0 && g.count > 0) push(g, { type: 'count', n: Math.ceil(g.count / 60) })
        if (g.count <= 0) { g.phase = 'run'; push(g, { type: 'go' }) }
        return
    }
    if (g.phase === 'heatEnd') {
        // the rest of the field rides out while the standings breathe
        g.heatT++
        for (const r of g.riders) { if (!r.isP) { riderStep(g, r, decide(g, r)); finishCheck(g, r) } }
        if (g.heatT > 240) {
            if (g.heat >= COURSE_COUNT - 1) endHeatEnd(g)
            else loadHeat(g, g.heat + 1)
        }
        return
    }

    g.runT++
    if (g.mode !== 'showoff') g.heatT++
    const p = g.riders[0]
    riderStep(g, p, inp)
    finishCheck(g, p)
    for (const r of g.riders) {
        if (r.isP) continue
        riderStep(g, r, decide(g, r))
        finishCheck(g, r)
    }

    if (g.mode === 'showoff') {
        g.showoffLeft -= 1 / 60
        if (g.showoffLeft <= 0) {
            g.end = p.score >= CFG.showoffTarget ? 'win' : 'time'
            g.why = g.end === 'win' ? `SHOWOFF CLEARED — ${p.score} pts beats the house ${CFG.showoffTarget}` : `THE CLOCK KEEPS IT — ${p.score}/${CFG.showoffTarget} pts`
            push(g, { type: g.end, score: p.score, target: CFG.showoffTarget })
        }
    }

    // face-plate rank among the field
    p.place = 1 + g.riders.filter((q) => q.id !== 0 && q.s > p.s).length
}

function endHeatEnd(g) {
    g.heatResults.push({ heat: g.heat, place: g.lastHeatPlace })
    const p = g.riders[0]
    const best = Math.max(...g.standings.filter((_, i) => i !== 0))
    g.place = 1 + g.standings.filter((v, i) => i !== 0 && v > g.standings[0]).length
    g.end = g.standings[0] >= best && g.standings[0] > 0 ? 'win' : 'lose'
    g.why = g.end === 'win' ? `MOUNTAIN CHAMPION — ${p.points} standings points` : `THE FIELD TOOK IT — ${p.points}/${best} points`
    push(g, { type: g.end, points: p.points, standings: [...g.standings] })
}

// player score convenience
export const playerScore = (g) => g.riders[0].score

export function stateHash(g) {
    let h = 0x811c9dc5
    const add = (str) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) } }
    add(`${g.tick}|${g.heat}|${g.phase}|${g.mode}|${g.end}|${g.showoffLeft.toFixed(2)}|${g.count}`)
    for (const r of g.riders) {
        add(`|${r.id}:${r.s.toFixed(2)},${r.x.toFixed(3)},${r.y.toFixed(2)},${r.v.toFixed(2)},${r.vy.toFixed(2)},${r.spin.toFixed(1)},${r.flip.toFixed(1)},${r.meter.toFixed(1)},${r.chain},${r.score},${r.tumble},${r.finished ? 1 : 0},${r.air ? 1 : 0},${r.tuck ? 1 : 0}${r.scrub ? 1 : 0},p${r.press.toFixed(3)},ts${r.takeSpin},st${r.stomp}:${r.stompPow.toFixed(2)},bb${r.bobble},iv${r.invert.toFixed(1)}`)
    }
    return (h >>> 0).toString(16)
}

export function cloneGame(g) { return JSON.parse(JSON.stringify(g)) }
