// EXCITEBIKE — the pure sim. `step(state, input)` is the only way time moves,
// it imports nothing but the course data, and it contains no Math.random:
// everything the browser draws and everything scripts/excitecheck.mjs audits
// comes out of this file unchanged.
//
// The physics is one rule: the bike is ALWAYS ballistic (gravity every tick,
// position integrated every tick); the ground is simply the place the
// trajectory clips. That single choice gives the whole feel for free —
// crests launch you when your accumulated climb-rate outruns gravity, whoops
// make you hop because the sine throws you, and a 40px up-step is a wall
// unless you arrive airborne — no special-cased "launch zones" anywhere.
// Lean is the other rule: airborne, pitch only answers to the rider. Land
// with the nose too far under the slope and you go over the bars; the
// autopilot rolls the REAL sim to decide its lean, exactly the lesson the
// Spy Hunter planner learned the hard way.

import { LAP, groundY, slopeAt, featureAt, rivalSpeed, track, RIVALS } from './levels.js'

export const W = 256
export const H = 240
export const GY0 = 208                     // screen y of world-height 0
export const VS = 0.92                     // world height -> screen px

export const CFG = {
    g: 0.16,                               // gravity, px/tick²
    accelHigh: 0.026,
    accelLow: 0.052,
    maxHigh: 6.2,                          // px/tick at high gear
    maxLow: 4.3,
    hotDerate: 0.68,                       // top-speed factor while overheated
    heatGain: 0.13,                        // per tick, scaled (v/max)^4 — a
                                           // sustained redline boils in ~11s
    heatCool: 0.11,
    heatBoil: 100,
    heatCoolOff: 26,                       // engine comes back below this
    jump: 3.2,                             // base jump vy — mostly speed-INDEPENDENT:
    jumpPerV: 0.18,                        // a running jump flies FARTHER, not
                                           // higher. The arcade law that makes
                                           // an up-step always recoverable:
                                           // even from a crash-restart you can
                                           // hop the wall, you just land short
                                           // and slow. A v-scaled jump makes
                                           // the step unclimbable at walking
                                           // speed — a law no policy can beat,
                                           // which is how the track-0 trap
                                           // was born.
    jumpHold: 12,                          // ticks of hang-time while held
    jumpHoldF: 0.055,
    brake: 0.06,
    grade: 0.028,                          // slope drag on ground
    mudDrag: 0.02,                         // px/tick² while rolling through
    mudKick: 0.125,                        // per pump press
    pumpBack: 0.4,                         // v floor for a mud pump to bite
    waterDrag: 0.034,
    waterStall: 2.3,                       // entering slower than this stalls
    stallFix: 92,                          // ticks stuck (pumping shortens)
    stallFixMin: 38,
    boostV: 7.45,                          // boost sets speed to at least this
    boostCool: 3.5,                        // boosts bleed engine heat
    landFwd: 0.5,                          // nose-under-slope crash threshold
    landBack: 0.72,                        // nose-over crash (endo the loop)
    landNoseHigh: 0.42,                    // tail-first but legal: scrub speed
    leanRate: 0.02,
    crashTicks: 112,
    crashMash: 3,                          // ticks shaved per A press
    crashMin: 46,
    // rival bodies (#2384). They ride the pace line as a speed TARGET but fly
    // the same always-ballistic law as the player: crests and whoop waves
    // separate them when the ground falls faster than gravity. In the air a
    // rider stabilises toward a STALE terrain read — reaction lag grows as
    // skill falls — so the tail of the pack misjudges the rising ground after
    // a big ramp and lands on the nose. The landing window is the player's
    // own landFwd/landBack scaled by skill. A wipeout freezes the rival's
    // distance (the league churns live) and the cooldown is the section it
    // just learned, so one scare is drama, not a demolition derby.
    rivalEaseV: 0.10,                      // pace attractor while riding
    rivalDown: 110,                        // ticks walked back after a wipeout
    rivalRecover: 1.8,                     // v at the remount
    rivalLag: 14,                          // ticks of stale-eye × (lagBase − skill)
    rivalLagBase: 1.05,
    rivalCool: 200,                        // post-remount immunity ("learned it")
    rivalAirEase: 0.16,                    // air stabilisation rate (player's)
    rivalRollEase: 0.25,                   // ground pitch tracking (player's)
    rivalLookK: 5,                         // lookahead depth per skill (px per v)
    rivalTolMul: 1,                        // harness mutant knob on the window
    // CONTACT (#2391): the league turns solid. A bike occupies a body box
    // ±contactBody px along the track and contactClear px of height; crossing
    // it with height clearance is a scored FLYBY, crossing it on the level is
    // physics: closing onto a riding back bumps (momentum transfers, the
    // striker pays), closing onto a DOWNED rider slams or wipes out — the
    // wreck blocks the lane until its rider walks the bike back. A rival
    // that catches the player's back swerves. contactCool is the anti-derby
    // law (one drama per pair, the rivalCool lesson); contactK is the harness
    // mutant knob — 0 switches the whole law off.
    contactBody: 12,
    contactClear: 14,
    contactBump: 1.6,                      // closing speed that makes it a bump
    contactCrash: 3.4,                     // onto a riding back = over the bars
    contactSwap: 0.34,                     // closing speed the striker loses
    wreckV: 0.8,                           // slower than this and the wreck just holds you
    contactCool: 90,                       // ticks between contacts of one pair
    flybyPts: 150,
    contactK: 1,
    // PACK CONTACT (#2420): the league is solid to ITSELF too — rivals obey
    // the same body law against each other (bump/crash/solid wreck). A
    // grounded rival reads a DOWNED body ahead inside its braking distance
    // (v-scaled, earlier the better the rider) and commits the player's own
    // jump law — hazard hops are the lines the pace-line league never chose.
    // Late reactions arrive nose-low and the wreck chains. packK is the
    // harness mutant knob: 0 ghosts the pack again.
    packK: 1,
    hazBase: 3.2,                        // reaction distance px per unit of v
    hazSkill: 5,                         // skill buys metres of read ahead
    hazMin: 14,                          // inside this the hop can never rise — do not commit
    // LANE AXIS (#2457): the track gains its NES depth. `lane` is a continuous
    // lateral line 0 (near, the line the pinned league has always ridden) to 1
    // (far). ←/→ steer it; every contact law now asks SAME-LANE first —
    // crossing a body in another lane is a clean draft pass, no flyby, no
    // scrape. Two same-line bikes at matched speed (|relV| ≤ 0.3, the old
    // silent-ghost band) now RUB: the player pays scrape and the rival is
    // nudged aside; rival-vs-rival rub is lateral-only (never touches v or d,
    // so the CRASH LEAGUE receipts stand untouched). laneK=0 restores the
    // single-line league byte-identical (the harness pins both).
    laneK: 1,
    laneRate: 0.02,                      // lines/tick steered on the ground
    laneRateAir: 0.008,                  // half-authority in the air
    laneTouch: 0.3,                      // |Δlane| under this = the same line
    laneW: 0.34,                         // a rub shoves the rival this far aside
    laneHome: 0.004,                     // rivals ease back to line 0 (the pinned league line)
    laneScrape: 0.045,                   // px/tick the player bleeds while rubbing
    rubCool: 12,                         // ticks between rub bites (one scrape per bite, not per tick)
    // PACK BARGAINING (#2460): a speed-matched rival BEHIND you does not just
    // hold its pace line — if you settled onto a different line, it LATCHES
    // onto yours and closes the gap you took. Lateral only: v and d never
    // move, so the CRASH LEAGUE receipts stand. The latch needs a clear hazard
    // read (the same downed/held-body scan the hop commits to — a rider reads
    // the ground before it reads your line), releases when the geometry breaks
    // (you out-accelerate it, take the line back, or it gets shoved off by a
    // rub), and cools before re-engaging, so the contest is a duell, not a
    // clamp. Riders contest in proportion to skill — MARIO crowds you, IVAN
    // rides his line. bargK is the harness mutant knob: 0 restores the silent
    // hold-the-line pack byte-identical.
    bargK: 1,
    bargRate: 0.010,                     // lines/tick at skill 1 (player steers at 0.02 — counterplay always wins)
    bargRange: 140,                      // px of track behind you it will bargain over
    bargCool: 200,                       // ticks a released rival holds its line before it dares again
    clock: 70,                             // start clock, seconds
    lapBonus: 34,                          // seconds at the line
    laps: 2,
    count: 200,                            // ticks of 1-2-3-GO
    wallClip: 7,                           // ballistic clipping into ground
}

export const GEARS = { high: { a: CFG.accelHigh, m: CFG.maxHigh }, low: { a: CFG.accelLow, m: CFG.maxLow } }

let uid = 0

export function makeGame(trackIdx = 0, opts = {}) {
    const tr = track(trackIdx)
    const clockSec = opts.clock !== undefined ? opts.clock : CFG.clock
    return {
        id: ++uid,
        tick: 0,
        track: trackIdx,
        gear: opts.gear || 'high',
        laps: opts.laps !== undefined ? opts.laps : CFG.laps,
        lap: 1,
        x: 0,                              // px into the lap
        total: 0,                          // px of the whole race (for rank)
        lane: 0,                           // #2457 lateral line, 0 near .. 1 far
        v: 0,
        alt: groundY(tr.ground, 0),        // world height of the wheels
        vy: 0,
        air: false,
        airT: 0,
        pitch: 0,
        onGround: true,
        heat: 0,
        hot: false,
        jumpT: 0,
        pumpT: 0,
        stall: 0,
        crash: 0,
        crashWhy: '',
        clock: Math.round(clockSec * 60),
        boostAt: -999,
        inBand: null,
        rank: RIVALS.length + 1,
        rivals: RIVALS.map((r, idx) => ({
            ...r, d: -idx * 14, v: r.base, alt: groundY(tr.ground, 0),
            vy: 0, air: false, pitch: 0, down: 0, cool: 0, crashes: 0,
            tk: 0, flown: false,          // contact cooldown / flyby-once flag (#2391)
            held: 0,                     // blocked behind a body (#2420) — brake latch
            lane: 0, rk: 0,             // #2457 lateral line / rub bite cooldown
            bg: 0, latch: false,       // #2460 bargain cooldown / active line-contest flag
        })),
        // #2420: one-drama-per-PAIR matrix (i*N+j and j*N+i), the contactCool
        // law extended to rival-vs-rival. Int ticks, decremented in pack().
        pk: new Array(RIVALS.length * RIVALS.length).fill(0),
        score: 0,
        end: null,
        count: opts.count !== undefined ? opts.count : CFG.count,
        prevJ: false,
        events: [],
        // slack knobs (the harness taxes these; the game never does)
        mudTax: opts.mudTax || 0,          // extra drag / weaker kicks
        heatTax: opts.heatTax || 0,        // extra heat per tick
        bonusTax: opts.bonusTax || 0,      // fewer seconds at the line
        _clockFrac: 0,
    }
}

// #2420: a rival's wipeout, shared by the landing law (why forward/
// backward) and the pack law (why wreck/contact, `on` names the victim).
// Distance freezes while the rider walks the bike back; the remount is the
// same slow, learned one.
function rivalWipe(g, r, why, on) {
    if (why === 'wreck') r.d -= 8   // the striker is knocked back off the body,
                                    // stopping behind the wreck it hit — the same
                                    // −8 the player pays (#2391), so the frozen
                                    // distances read honestly on the leaderboard.
    const x = ((r.d % LAP) + LAP) % LAP
    r.down = CFG.rivalDown
    r.crashes++
    r.air = false; r.vy = 0; r.v = 0; r.alt = groundY(track(g.track).ground, r.d)
    emit(g, { type: 'rcrash', name: r.name, why, x, ...(on ? { on } : {}) })
}

// The CRASH LEAGUE (#2384): rivals are riding bodies, not ghosts. The pace
// line stays their speed TARGET, but each rival integrates the same always-
// ballistic law the player does — crests and whoop waves throw them up when
// the ground falls away faster than gravity — and its landing is judged by
// the player's own nose-vs-slope rule inside a skill-scaled window. In the
// air a rider steers toward a STALE terrain read (reaction lag grows as
// skill falls), so the tail of the pack misjudges the rising ground after
// the big ramps and lands on the nose. A wiped-out rival freezes its
// distance while it walks the bike back: the leaderboard churns live and a
// stuck chase can ride past the wreck. Zero Math.random — receipts pin it.
function rivalTick(g) {
    const tr = track(g.track)
    for (const r of g.rivals) {
        if (r.cool > 0) r.cool--
        if (r.rk > 0) r.rk--
        if (r.bg > 0) r.bg--
        // PACK BARGAINING (#2460): the gap you took, the pack answers. A
        // grounded rival BEHIND you at matched speed (the rub band — a latch
        // can therefore only ever end in a rub or a clean line break, never a
        // new crash) that sees you settled on a line OFF the league home
        // LATCHES onto yours: it walks onto your line, stops AT it, and tracks
        // you there while the match lasts — the gap is contested, not given.
        // Engaging needs a full line of daylight (laneTouch) and a clear hazard
        // read (ground before lines). The duel PAUSES while either rider is
        // airborne or reading a wreck (no motion, no hard feelings — bumpy
        // ground must not end the duel for three seconds at every hop), and
        // only a real break — you out-pace it, it slides past, or you take the
        // league line back — cools it before it dares again.
        let contest = false
        let mover = false
        if (CFG.bargK && CFG.laneK && r.down <= 0 && r.held <= 0 && r.cool <= 0 &&
            r.v > 1 && g.crash === 0 && (r.latch || r.bg === 0)) {
            const behind = g.total - r.d
            const rel = g.v - r.v
            const wantLine = g.lane >= CFG.laneTouch              // you drove out of his home line
            const distOK = r.latch ? behind >= -10 && behind <= CFG.bargRange
                : behind > 4 && behind <= CFG.bargRange
            const lineOK = r.latch || Math.abs(g.lane - r.lane) >= CFG.laneTouch
            if (wantLine && distOK && lineOK && Math.abs(rel) <= 0.3) {
                const react = r.v * (CFG.hazBase + CFG.hazSkill * r.skill)
                let busy = false
                for (const q of g.rivals) {
                    if (q === r) continue
                    if (q.down <= 0 && q.held <= 0) continue
                    const gq = q.d - r.d
                    if (gq >= CFG.hazMin && gq <= react) { busy = true; break }
                }
                if (!busy) { contest = true; mover = !g.air && !r.air }
            }
        }
        if (contest && !r.latch) emit(g, { type: 'bargain', name: r.name, x: ((r.d % LAP) + LAP) % LAP })
        if (!contest && r.latch) r.bg = CFG.bargCool
        r.latch = contest
        // #2457: a shoved rival drifts back to the league line over ~30
        // ticks — enough for the pass it was shoved for, and home again
        // before the next lap's chain (the CRASH LEAGUE receipts ride line 0).
        if (mover) {
            // contest: pull onto the player's line, skill-scaled, and stop
            // AT it — a bargainer mirrors your line, it does not cut you off.
            const want = g.lane
            const stepB = CFG.bargRate * r.skill
            const dir = want > r.lane ? 1 : -1
            r.lane = Math.abs(want - r.lane) <= stepB ? want : r.lane + stepB * dir
        } else if (!contest && CFG.laneK && r.lane !== 0) {
            r.lane = r.lane * (1 - CFG.laneHome)
        }
        if (r.held > 0) { r.held--; r.v = 0; r.alt = groundY(tr.ground, r.d); r.air = false; r.vy = 0; continue }
        if (r.down > 0) {
            r.down--
            if (r.down === 0) {
                r.v = CFG.rivalRecover
                r.cool = CFG.rivalCool
                emit(g, { type: 'rup', name: r.name, x: ((r.d % LAP) + LAP) % LAP })
            }
            continue                        // walking the bike back: d frozen
        }
        const pace = rivalSpeed(tr, r.d, r.base)
        r.v += (pace - r.v) * CFG.rivalEaseV
        const x = ((r.d % LAP) + LAP) % LAP
        // HAZARD HOP (#2420): a downed body ahead within braking distance is
        // the line the pace line never took. Better riders read it earlier
        // (v-scaled by skill); commit the player's own jump law, or arrive
        // nose-low at the body and the wreck chains you.
        if (CFG.contactK && CFG.packK && !r.air && r.v > 1) {
            const react = r.v * (CFG.hazBase + CFG.hazSkill * r.skill)
            for (const q of g.rivals) {
                if (q === r) continue
                if (q.down <= 0 && q.held <= 0) continue   // hazard = a body down OR a bike held dead-still in the lane
                const gap = q.d - r.d
                if (gap >= CFG.hazMin && gap <= react && r.v - q.v > CFG.wreckV) {
                    r.air = true
                    r.vy = CFG.jump + CFG.jumpPerV * r.v
                    emit(g, { type: 'rhop', name: r.name, x })
                    break
                }
            }
        }
        if (r.air) {
            const lag = Math.max(0, Math.round(CFG.rivalLag * (CFG.rivalLagBase - r.skill)))
            const look = 8 + r.skill * Math.max(8, r.v * CFG.rivalLookK)
            const want = Math.atan(slopeAt(tr.ground, x + look - lag * r.v))
            r.pitch += (want - r.pitch) * CFG.rivalAirEase
        } else {
            r.pitch += (Math.atan(slopeAt(tr.ground, x)) - r.pitch) * CFG.rivalRollEase
        }
        r.vy -= CFG.g
        const ny = r.alt + r.vy
        const gy = groundY(tr.ground, r.d)
        if (ny >= gy) {
            r.air = true
            r.alt = ny
        } else if (r.air) {
            const err = r.pitch - Math.atan(slopeAt(tr.ground, r.d))
            const w = CFG.rivalTolMul * (0.72 + 0.4 * r.skill)
            if (r.cool <= 0 && (err < -CFG.landFwd * w || err > CFG.landBack * w)) {
                rivalWipe(g, r, err < 0 ? 'forward' : 'backward')
            } else {
                r.alt = gy; r.air = false; r.vy = 0
            }
        } else {
            r.alt = gy; r.vy = 0
        }
        r.d += r.v
    }
}

export function rankOf(g) {
    let ahead = 0
    for (const r of g.rivals) if (r.d > g.total + 0.01) ahead++
    return ahead + 1
}

// CONTACT (#2391): the league turns solid. The law per rival, once per
// `contactCool` per pair (the rivalCool lesson — one drama, not a derby):
// • flyby — wheels ≥ contactClear above the rider while inside the body box
//   pays flybyPts (once per airborne pass, so over-jumping the pack is a
//   skill, and the score only grows where a body actually was);
// • wreck — a DOWNED rider is solid: any ground speed above wreckV on the
//   bars is a wipeout, slower and the wreck simply holds you (the lane is
//   blocked until its rider walks the bike back — brake or hop);
// • bump — closing on a riding back faster than contactBump transfers
//   momentum (the striker pays contactSwap of the closing speed, the pushed
//   rider gains half that and 3px of track); over contactCrash it is over
//   the bars;
// • jolt — a rival catching YOUR back swerves (v × 0.55 — visible
//   intelligence, no rival-vs-rival lines yet, the README says so) and
//   shoves you forward.
// Only a speed-matched draft (|relV| ≤ 0.3) glides silently past a body —
// the sim has no lateral axis, so at any closing pace you either hop the
// rider (clean, scored) or scrape through it (one bump per pass;
// contactCool is the one-drama-per-pair law). Deterministic: no
// Math.random, everything derived from live state.
function contact(g) {
    if (!CFG.contactK || g.end) return
    for (const r of g.rivals) {
        if (r.tk > 0) r.tk--
        const gap = r.d - g.total
        const ag = Math.abs(gap)
        const clear = g.alt - r.alt
        if (ag >= CFG.contactBody) {
            if (!g.air) r.flown = false
            continue
        }
        // #2457 same-line gate: inside the body box but on ANOTHER line is a
        // clean draft pass — no flyby (you never crossed THEIR body), no
        // scrape, no hold. The lane axis replaces the ghost courtesy.
        if (CFG.laneK && Math.abs(r.lane - g.lane) >= CFG.laneTouch) continue
        if (clear >= CFG.contactClear) {
            if (g.air && !r.flown) {
                r.flown = true
                g.score += CFG.flybyPts
                emit(g, { type: 'flyby', name: r.name, pts: CFG.flybyPts, x: g.x })
            }
            continue
        }
        if (r.tk > 0) continue
        const relV = g.v - r.v
        if (r.down > 0) {
            if (g.crash > 0 || g.stall > 0) continue
            if (g.v > CFG.wreckV) {
                crash(g, 'wreck')
                g.total -= 8
                r.tk = CFG.contactCool
            } else {
                g.v = 0
            }
            continue
        }
        if (g.crash > 0 || g.stall > 0) continue
        if (gap > 0) {
            if (relV > CFG.contactCrash) {
                crash(g, 'contact')
                r.tk = CFG.contactCool
            } else if (relV > CFG.contactBump || (ag < 8 && relV > 0.3)) {
                const cv = Math.max(relV, CFG.contactBump)
                g.v -= cv * CFG.contactSwap
                r.v += cv * CFG.contactSwap * 0.5
                r.d += 3
                emit(g, { type: 'bump', name: r.name, cv: +cv.toFixed(2), x: g.x })
                r.tk = CFG.contactCool
            }
            // a gentle close stays a clean pass: the sim has no lateral axis,
            // so politeness at pace-difference belongs to the open gap list,
            // not to silent speed theft (ranks must not leak invisibly).
        } else if (relV < -CFG.contactBump && g.v > 1.0) {
            // jolt = a wheel-to-wheel incident at racing speed. A nearly
            // stopped bike is a marshalled corner, not a race contact (the
            // spectator-park pattern in exciteplay and the forgiving down/
            // stall states ride on this).
            r.v *= 0.55
            g.v = Math.min(CFG.boostV + 0.1, g.v + 0.35)
            g.total += 3
            emit(g, { type: 'jolt', name: r.name, x: g.x })
            r.tk = CFG.contactCool
        }
        // RUB (#2457): the old silent ghost band (|relV| ≤ 0.3 same-line) is
        // now handlebars-on-handlebars. The player pays scrape every bite;
        // the rival is shoved aside, so the fix for being stuck behind is
        // steering — the lane axis closes the pass-without-a-line loophole.
        // Never bites a down or held rider (that is a marshalled body), and
        // never while the player is wrecked or stalled.
        if (CFG.laneK && r.rk === 0 && !g.air && !r.air && r.down <= 0 && r.held <= 0 &&
            g.crash === 0 && g.stall === 0 && ag < CFG.contactBody && Math.abs(relV) <= 0.3) {
            g.v = Math.max(0, g.v - CFG.laneScrape)
            const dir = r.lane >= g.lane ? 1 : -1
            r.lane = Math.min(1, Math.max(0, r.lane + CFG.laneW * dir))
            r.rk = CFG.rubCool
            emit(g, { type: 'rub', name: r.name, x: g.x })
        }
    }
}

// PACK CONTACT (#2420): the league turns solid to ITSELF. Pairwise, the
// chaser vs the rider ahead, with the SAME constants #2391 gave the player:
// • airborne above contactClear — clean line, nothing to pay (the hazard
//   hop worked);
// • a DOWNED rider blocks the lane: arrive above wreckV and it is a wipeout
//   (the chain — a crash site is where the tail piles up), slower and the
//   body simply holds you until its rider walks the bike back;
// • closing on a riding back above contactBump bumps with two-way momentum
//   transfer; above contactCrash the striker is over the bars.
// One drama per pair per contactCool (the pk matrix — a pack pass is a
// fight, not a demolition derby). Deterministic: zero Math.random.
function pack(g) {
    if (!CFG.contactK || !CFG.packK || g.end) return
    const N = g.rivals.length
    for (let k = 0; k < g.pk.length; k++) if (g.pk[k] > 0) g.pk[k]--
    for (let i = 0; i < N; i++) {
        const a = g.rivals[i]
        if (a.down > 0) continue                 // walking a bike makes no contact
        if (a.cool > 0) continue                 // remount grace — the marshalled corner rule,
                                                 // extended: you never re-crash into the body you
                                                 // just walked your bike out from beside.
        for (let j = 0; j < N; j++) {
            if (j === i) continue
            const b = g.rivals[j]
            const gap = b.d - a.d
            if (gap <= 0 || gap >= CFG.contactBody) continue   // b must be AHEAD of a
            // #2457 same-line gate: two rivals abreast draft clean — the pack
            // only fights for the line it shares.
            if (CFG.laneK && Math.abs(a.lane - b.lane) >= CFG.laneTouch) continue
            // clearance above GROUND — the rider's own airborne law; the player's
            // flyby clearance is ground-based too, and the pack rides the same
            // terrain together (a dip between two bikes is not a hole in the law).
            if (a.alt - groundY(track(g.track).ground, a.d) >= CFG.contactClear) continue    // flew the line clean
            if (g.pk[i * N + j] > 0) continue
            const relV = a.v - b.v
            if (b.down > 0) {
                if (a.v > CFG.wreckV) {
                    rivalWipe(g, a, 'wreck', b.name)
                    g.pk[i * N + j] = g.pk[j * N + i] = CFG.contactCool
                } else {
                    // The lane is BLOCKED: sit behind the body. A rival's pace
                    // would creep him onto the body at walking speed, so the
                    // hold LATCHES the brake for a few ticks at a time (the
                    // pack keeps re-arming it while the body stays in front) —
                    // a rival waits at the body's edge until the lane clears.
                    // (The player's hold is untouched — a human brakes; the
                    // pace line has to be braked for it.)
                    a.v = 0
                    a.held = 3
                }
                continue
            }
            if (relV > CFG.contactCrash) {
                rivalWipe(g, a, 'contact', b.name)
                g.pk[i * N + j] = g.pk[j * N + i] = CFG.contactCool
            } else if (relV > CFG.contactBump || (gap < 8 && relV > 0.3)) {
                const cv = Math.max(relV, CFG.contactBump)
                a.v -= cv * CFG.contactSwap
                b.v += cv * CFG.contactSwap * 0.5
                b.d += 3
                emit(g, { type: 'rbump', a: a.name, b: b.name, cv: +cv.toFixed(2), x: ((b.d % LAP) + LAP) % LAP })
                g.pk[i * N + j] = g.pk[j * N + i] = CFG.contactCool
            } else if (CFG.laneK && !a.air && !b.air && b.down <= 0 && Math.abs(relV) <= 0.3) {
                // PACK RUB (#2420 law, #2457 axis): matched speed, same line —
                // they scrape and the tail rider slides to the open line.
                // LATERAL ONLY: v and d never move, so the CRASH LEAGUE
                // receipts (times and distances) are untouched by the axis.
                const dir = b.lane >= a.lane ? 1 : -1
                b.lane = Math.min(1, Math.max(0, b.lane + CFG.laneW * dir))
                emit(g, { type: 'rrub', a: a.name, b: b.name, x: ((b.d % LAP) + LAP) % LAP })
                g.pk[i * N + j] = g.pk[j * N + i] = CFG.contactCool
            }
        }
    }
}

// landing slope a ballistic hop WOULD find at x (used only for event truth;
// the planner gets its own answer by rolling this same step())
function emit(g, e) { g.events.push(e) }

function crash(g, why) {
    g.crash = CFG.crashTicks
    g.crashWhy = why
    g.air = false
    g.vy = 0
    g.v = 0
    emit(g, { type: 'crash', why, x: g.x })
}

export function step(g, inp) {
    g.tick++
    const tr = track(g.track)
    const jEdge = !!inp.j && !g.prevJ
    g.prevJ = !!inp.j

    if (g.end) return

    // ---- countdown gate ------------------------------------------------
    if (g.count > 0) {
        g.count--
        if (g.count === 0) emit(g, { type: 'go' })
        return
    }

    // ---- clock ----------------------------------------------------------
    g._clockFrac += 1
    if (g._clockFrac >= 60) {
        g._clockFrac -= 60
        g.clock--
        if (g.clock <= 0) { g.clock = 0; g.end = 'time'; emit(g, { type: 'gameover', why: 'time' }); return }
    }

    // ---- wrecked: mash A to walk it back --------------------------------
    if (g.crash > 0) {
        g.crash--
        // mashing A walks you back — each press shaves ticks, and it must be
        // able to reach ZERO. A floor here (crashMin) used to re-arm the wreck
        // under a continuous autopilot pump, locking the bike forever.
        if (jEdge) g.crash = Math.max(0, g.crash - CFG.crashMash)
        g.v *= 0.9
        g.alt = groundY(tr.ground, g.x)
        g.pitch *= 0.8
        g.x += g.v; g.total += g.v
        if (g.crash === 0) { g.v = 1.6; g.pitch = Math.atan(slopeAt(tr.ground, g.x)); emit(g, { type: 'recover' }) }
        g.heat = Math.max(0, g.heat - CFG.heatCool * 0.5)
        rivalTick(g); pack(g); g.rank = rankOf(g)
        return
    }

    // ---- stalled in the water hole ---------------------------------------
    if (g.stall > 0) {
        g.stall--
        if (jEdge) g.stall = Math.max(0, g.stall - 4)
        g.v = Math.max(0, g.v - 0.2)
        g.alt = groundY(tr.ground, g.x)
        g.onGround = true
        if (g.stall === 0) { g.v = 2.4; emit(g, { type: 'unstall' }) }
        rivalTick(g); pack(g); g.rank = rankOf(g)
        return
    }

    const gear = GEARS[g.gear]
    const maxV = gear.m * (g.hot ? CFG.hotDerate : 1)

    // ---- horizontal -------------------------------------------------------
    if (!g.air) {
        if (inp.g && g.v < maxV) g.v += gear.a
        if (inp.b) g.v = Math.max(0, g.v - CFG.brake)
        if (!inp.g) g.v = Math.max(0, g.v - 0.004)
        // terrain grade
        const sl = slopeAt(tr.ground, g.x)
        g.v = Math.max(0, g.v - sl * CFG.grade)
        // bands
        const band = featureAt(tr, g.x)
        g.inBand = band ? band.kind : null
        if (band && band.kind === 'mud') {
            g.v = Math.max(0, g.v - (CFG.mudDrag + g.mudTax))
            if (g.pumpT > 0 && g.v > CFG.pumpBack) g.v += CFG.mudKick - g.mudTax * 2
        } else if (band && band.kind === 'water') {
            g.v = Math.max(0, g.v - (CFG.waterDrag + g.mudTax * 1.5))
            if (g.pumpT > 0 && g.v > CFG.pumpBack) g.v += CFG.mudKick - g.mudTax * 2
            if (g.v < CFG.waterStall && g.v > 0.4) {
                g.stall = CFG.stallFix
                g.v = 0
                emit(g, { type: 'stall', x: g.x })
            }
        } else if (band && band.kind === 'boost') {
            if (g.v < CFG.boostV) {
                if (g.boostAt < g.x - LAP / 2) { g.score += 250; emit(g, { type: 'boost', pts: 250, x: g.x }) }
                g.boostAt = g.x
                g.v = Math.max(g.v, CFG.boostV)
                g.heat = Math.max(0, g.heat - CFG.boostCool)
            }
        }
        // the engine has a limiter: everything above the gear's ceiling
        // (a boost that outlived its arrows, a downhill that ran away)
        // bleeds back off once the bike is back on honest ground. Without
        // this the boost leaks through the whole lap and the heat ledger
        // (which reads v/maxV) never boils.
        if ((!band || band.kind !== 'boost') && g.v > maxV) g.v = Math.max(maxV, g.v - 0.03)
    } else if (inp.b) {
        g.v = Math.max(0, g.v - CFG.brake * 0.3)
    }
    g.v = Math.min(g.v, CFG.boostV + 0.1)
    if (g.pumpT > 0) g.pumpT--
    if (jEdge && g.onGround && !g.air) {
        // the jump — and the pump on mud/water
        const band = featureAt(tr, g.x)
        if (band && (band.kind === 'mud' || band.kind === 'water') && g.v <= CFG.maxLow + 1.5) {
            g.pumpT = 6
        } else if (g.v > 0.4) {
            g.air = true
            g.vy = CFG.jump + CFG.jumpPerV * g.v
            g.jumpT = CFG.jumpHold
            g.onGround = false
        }
    } else if (jEdge && g.air && g.jumpT > 0) {
        g.jumpT = CFG.jumpHold          // holding jump in early air hangs longer
    }

    // ---- lane steer (#2457) -----------------------------------------------
    // ← steers OUT to the far line, → back to the near line. Continuous,
    // clamped to the track: the NES crossed its width in about a second,
    // so ground authority clears a rival's lane (laneTouch) in ~15 ticks.
    // Airborne the same keys still move the bike, at reduced authority.
    if (CFG.laneK) {
        const lr = g.air ? CFG.laneRateAir : CFG.laneRate
        if (inp.l) g.lane = Math.min(1, g.lane + lr)
        if (inp.r) g.lane = Math.max(0, g.lane - lr)
    }

    // ---- heat -------------------------------------------------------------
    if (!g.air) {
        const r = Math.min(1, g.v / maxV)
        if (inp.g && !g.hot && r > 0.55) g.heat += CFG.heatGain * Math.pow(r, 4) + g.heatTax * 0.02
        else g.heat = Math.max(0, g.heat - CFG.heatCool * (inp.g ? 0.4 : 1))
        if (g.heat >= CFG.heatBoil) { g.hot = true; emit(g, { type: 'overheat' }) }
        if (g.hot && g.heat <= CFG.heatCoolOff) { g.hot = false; emit(g, { type: 'cooled' }) }
    } else {
        g.heat = Math.max(0, g.heat - CFG.heatCool * 0.5)
    }

    // ---- always-ballistic integrate ----------------------------------------
    // holding A through the rise weakens gravity (the NES "hold for float");
    // lean answers only in the air — on the ground U is gas and D is brake
    const prevX = g.x
    g.x += g.v
    g.total += g.v
    const hang = g.air && g.jumpT > 0 && g.vy > 0 && inp.j
    g.vy -= hang ? CFG.g * 0.55 : CFG.g
    if (g.air) {
        if (inp.u) g.pitch += CFG.leanRate
        if (inp.d) g.pitch -= CFG.leanRate
        if (g.jumpT > 0) g.jumpT--
    }
    const ny = g.alt + g.vy
    const gy = groundY(tr.ground, g.x)

    // A rider keeps the bike roughly level in the air: with no U/D input the
    // pitch eases toward the slope it is about to meet, so a clean hop lands
    // clean. Actively leaning (U/D) overrides this — throw the bike too far
    // and land on the nose and you still go over the bars. This is the
    // difference between an unforgivable bug and the arcade's own feel.
    if (g.air && !inp.u && !inp.d) {
        const want = Math.atan(slopeAt(tr.ground, g.x + Math.max(8, g.v * 6)))
        g.pitch += (want - g.pitch) * 0.16
    }

    if (ny >= gy) {
        // still (or newly) airborne
        if (!g.air) {
            g.air = true
            g.airT = 0
        }
        g.alt = ny
        g.airT++
    } else {
        // trajectory hit the ground — landing, or clipping a wall
        if (ny < gy - CFG.wallClip && g.v > 0) {
            // wall: the step slammed into. Speed decides survive vs wipeout,
            // and either way the bike is knocked BACK — the arcade never
            // leaves you pinned at the foot of a wall with no runway to
            // rev and try the jump again.
            g.x = prevX
            g.alt = groundY(tr.ground, prevX)
            const knock = Math.min(230, 14 + g.v * 38)
            g.x = Math.max(2, prevX - knock)
            g.alt = groundY(tr.ground, g.x)
            if (g.v < 2.6) {
                crash(g, 'wall')
            } else {
                g.v *= 0.28
                emit(g, { type: 'slam', x: g.x })
            }
        } else {
            const sl = slopeAt(tr.ground, g.x)
            const slopeA = Math.atan(sl)
            const err = g.pitch - slopeA
            if (err < -CFG.landFwd || err > CFG.landBack) {
                crash(g, err < 0 ? 'forward' : 'backward')
                g.alt = gy
            } else {
                if (g.air) {
                    // a real landing
                    if (g.airT >= 40) {
                        const pts = 100 + Math.floor((g.airT - 40) / 10) * 50
                        g.score += pts
                        emit(g, { type: 'air', pts, t: g.airT, x: g.x })
                    }
                    if (err > CFG.landNoseHigh) {
                        g.v *= 0.88
                        emit(g, { type: 'nosehigh', x: g.x })
                    }
                    g.pitch = slopeA
                }
                g.alt = gy
                g.air = false
                g.airT = 0
                g.vy = 0
                g.onGround = true
            }
        }
    }

    // pitch tracks the ground while rolling
    if (!g.air && g.crash === 0) {
        const want = Math.atan(slopeAt(tr.ground, g.x))
        g.pitch += (want - g.pitch) * 0.25
    }

    // ---- lap line ---------------------------------------------------------
    if (g.x >= LAP) {
        g.x -= LAP
        g.boostAt = -999
        if (g.lap >= g.laps) {
            const rank = rankOf(g)
            g.score += 1000 + Math.max(0, (6 - rank) * 1000) + 2500
            g.end = 'win'
            emit(g, { type: 'finish', rank, pts: 1000 + Math.max(0, (6 - rank) * 1000) + 2500 })
        } else {
            g.lap++
            const bonus = Math.max(8, CFG.lapBonus - g.bonusTax)
            g.clock += bonus * 60
            g.score += 1000
            emit(g, { type: 'lap', lap: g.lap, bonus, pts: 1000 })
        }
    }

    rivalTick(g)
    pack(g)
    contact(g)
    g.rank = rankOf(g)
}

export function stateHash(g) {
    const f = [g.x, g.v, g.alt, g.pitch, g.heat, g.clock, g.score, g.total, g.rank]
    let h = 2166136261
    for (const n of f) {
        const s = Math.round(n * 1000)
        h ^= s & 0xff; h = Math.imul(h, 16777619)
        h ^= (s >>> 8) & 0xff; h = Math.imul(h, 16777619)
        h ^= (s >>> 16) & 0xff; h = Math.imul(h, 16777619)
    }
    h ^= g.tick; h = Math.imul(h, 16777619)
    return (h >>> 0).toString(16)
}
