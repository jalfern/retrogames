// sim.js — the seeded engine and arcade scoring of DEFENDER (#1473 batch 17).
//
// Pre-port the Feb shell had no score, no lives and no terminal — the ship
// could not die — and terrain, wave dice and jitter all rolled off the raw
// unseeded RNG. This module extracts the whole simulation into one pure,
// seeded engine so Node audits can replay a planet and the scoring law without
// a browser, and so `?seed=N` replays the exact world (mulberry32 via
// seedRng, #1473).
//
// Fidelity (Williams arcade, 1981): landers (150) descend, abduct a human and
// haul it skyward; shot while carrying, the human falls — catch it (+250) and
// deliver it back to the surface (+500); a human that hits the ground is gone
// for the whole game. A lander that reaches the ground empty mutates into a
// mutant (1500) and hunts the ship — and so does one that reaches the TOP with
// its catch: the hauled human turns hostile there (#3453, the original's own
// mutant genesis). Clearing every lander and mutant resurfaces
// the wave (+1000). 3 lives, extra ship every 10,000, ~0.5 s death freeze
// (#1531), respawn grace, and the
// run ends honestly at GAME OVER. Documented gaps (see README): hyperspace,
// meteor-swarm bonus. Every position-based collision reads the wrap through
// wrapDelta — lasers, catch, friendly fire, ship contact, the diver's
// descent and the bomb blast — so the wrap seam is not a dead zone.
//
// The smart bomb (#3443 — Jon's #2016 answer A, "port it. Smart bomb on the
// B/secondAction button, 3 per wave"): B vaporizes every hostile inside the
// 1000 px screen window (a quarter of the planet — 2000 px at the arcade's
// 2:1 aspect), credits the normal table, drops a hauler's human falling, and
// never touches the fighter or a foot soldier. 3 per wave, refilled on the
// wave beat. Press-driven and rand-free: the witness stream cannot shift.

export const WORLD_WIDTH = 4000
export const HUMAN_COUNT = 5
export const LANDER_SPEED = 0.9      // descend/ascend pace, px per tick
export const MUTANT_SPEED = 2.4
// #3456 stage 3 — the 1981 endgame rule: when the wave's last LANDER dies, the
// surviving mutants speed up (the cabinet's "speeders"). The wave never ends
// quietly; the duel gets faster.
export const SPEEDER_SPEED = 3.0
export const WALK_SPEED = 0.3
// #3453 polish — the 1981 wave pressure timer: each wave runs a countdown and
// when it expires the LANDERS run hot (steeper dives, faster hauls). The
// cabinet's beat; rand-free, so the witness stream cannot shift.
export const WAVE_TIME = 60 * 60            // seconds × ticks-per-second
export const URGENT_LANDER_SPEED = LANDER_SPEED * 1.5

// Arcade score table: lander 150, mutant 1500, falling human caught 250,
// carried human delivered 500, wave cleared 1000, extra ship every 10,000.
export const SCORE_LANDER = 150
export const SCORE_MUTANT = 1500
export const SCORE_CATCH = 250
export const SCORE_DELIVER = 500
export const SCORE_WAVE = 1000
export const BONUS_LIFE_EVERY = 10000

export const START_LIVES = 3
export const RESPAWN_DELAY = 60     // ~1 s dark before the ship returns
export const INVULN_TICKS = 120     // ~2 s blinking grace after respawn
export const DEATH_FREEZE = 30      // ~0.5 s the machine holds the dead frame
                                    // before the respawn countdown (#1531)

// #3443 (Jon's #2016 answer A): the smart bomb — 3 per wave, and the blast
// window is 1000 px of the 4000 px planet, wrap-aware and centered on the
// fighter. The cabinet showed a quarter of the field; 1000 px covers this
// port's widest view, so "everything on screen" is honest on every device.
export const BOMBS_PER_WAVE = 3
export const BOMB_SCREEN = 1000

// #2167: thrust-hum pitch from the fighter's speed, finite AT THE SOURCE.
// A non-finite vx (any physics edge) must not silence the hum into a dropped
// audio cue — the arcade hum stays pitched, the NaN is named by the gates.
export const thrustHum = (vx) => 50 + (Number.isFinite(vx) ? Math.abs(vx) : 0) * 8

// Shortest signed distance on the wrap-around planet.
export function wrapDelta(dx, width = WORLD_WIDTH) {
    let d = dx % width
    if (d > width / 2) d -= width
    if (d < -width / 2) d += width
    return d
}

// Heightmap: one sample per 10 px, seeded wandering between the limits of
// the original's terrain band.
export function makeTerrain(rand, width, height) {
    const pts = []
    let y = height - 100
    for (let x = 0; x <= width; x += 10) {
        y += (rand() - 0.5) * 40
        if (y > height - 20) y = height - 20
        if (y < height - 200) y = height - 200
        pts.push(y)
    }
    return pts
}

export function groundAt(pts, x) {
    const w = pts.length * 10 - 10
    let xi = x % w
    if (xi < 0) xi += w
    const i = Math.min(Math.floor(xi / 10), pts.length - 2)
    const t = (xi - i * 10) / 10
    return pts[i] * (1 - t) + pts[i + 1] * t
}

// Five humans, evenly spread around the planet, each walking one way.
export function makeHumans(rand, pts) {
    const humans = []
    const seg = WORLD_WIDTH / HUMAN_COUNT
    for (let i = 0; i < HUMAN_COUNT; i++) {
        const x = (i + 0.2 + 0.6 * rand()) * seg
        humans.push({ x, y: groundAt(pts, x) - 4, dir: rand() < 0.5 ? -1 : 1, state: 'walk' })
    }
    return humans
}

// Wave field: the original opened with 8 landers; each wave adds one, capped
// at 12 so late waves stay survivable.
export function spawnWave(rand, wave, height) {
    const landers = []
    const count = Math.min(7 + wave, 12)
    for (let i = 0; i < count; i++) {
        landers.push({
            x: rand() * WORLD_WIDTH,
            y: 60 + rand() * Math.max(60, height * 0.45),
            vx: (rand() - 0.5) * 1.2,
            vy: 0.2 + rand() * 0.4,
            type: 'lander',
            state: 'wander',
            carry: null,
        })
    }
    return landers
}

// How many extra ships the score has earned (arcade: one per 10,000).
export const livesForScore = (score) => Math.floor(score / BONUS_LIFE_EVERY)

// Count of still-living humans (walk/abducted/falling/carried all count;
// only `dead` is gone).
export const humansAlive = (humans) => humans.filter((h) => h.state !== 'dead').length

// WATCH route (#1637 batch 18; defends the humans since batch 19) — the patrol
// the attract screen already flies, extracted from index.jsx so ONE brain drives
// attract, seat and proof (the no-forked-brain law). Pure per-tick reaction: the
// planet's own job ranking. A lander HAULING a human outranks everything — shoot
// it and the human drops, recoverable; a lander on a dive is next. A held human
// is carried down the elevator and set back on the surface (+500, and a full
// street at wave clear is the arcade's own bonus). A falling human is flown into,
// not shot at: sit just above it and let gravity bring it into the harness (+250).
// Otherwise chase the nearest threat on the wrap (vertical proximity weighs more —
// the guns fire flat along the facing), lift off the wireframe it hugs, and fire
// at anything level inside laser range — EXCEPT when a walking human stands in the
// laser line closer than the target (the arcade's friendly-fire law runs both
// ways). No rand, no memory — honest from any position.
// Honest measure (defendercheck's WITNESS, two seeded 150-second patrol sets),
// re-read after #3445 (mortal grace) AND #3456 (the fidelity fix that made hunt
// mutants actually move): the route now survives 19/20 + 16/20 at the horizon,
// banks >= 9,650 + 5,950, clears waves on every seed and rescues 49 + 47.
// The copy claim "the patrol survives" stays retired until both sets are 20/20
// honestly. Any input takes over, and the seat releases with the run.
// The flat-line gun law (#3456 stage 3, factored so the HAUL can use it too):
// anything legally shootable down this level line takes the shot — nearest
// first — and a walking human closer than the target vetoes the line (the
// arcade friendly-fire law runs both ways). Returns { gun, hold } so the
// held-trigger tell travels with the veto wherever the route is working.
const lineGun = (s, p) => {
    let gunD = Infinity
    let gun = false
    let hold = false
    for (const e of s.enemies) {
        const ex = wrapDelta(e.x - p.x)
        if (ex === 0 || Math.abs(ex) > 560 || Math.sign(ex) !== p.facing) continue
        if (Math.abs(e.y - p.y) >= 15) continue
        let blocked = false
        for (const h of s.humans) {
            if (h.state !== 'walk') continue
            const hd = wrapDelta(h.x - p.x)
            if ((hd === 0 ? p.facing : Math.sign(hd)) === Math.sign(ex) && Math.abs(hd) < Math.abs(ex) + 8 && Math.abs(h.y - p.y) < 10) blocked = true
        }
        if (blocked) { hold = true; continue }
        if (Math.abs(ex) < gunD) { gunD = Math.abs(ex); gun = true }
    }
    return { gun, hold }
}

export const watchRoute = (s) => {
    const input = { left: false, right: false, up: false, down: false, fire: false }
    const p = s.player
    if (s.over || p.dark > 0) return input
    const dir = p.vx >= 0 ? 1 : -1
    // The endgame shape (#3456 stage 3): the wave's landers are all dead and
    // the surviving mutants run hot (SPEEDER_SPEED). Fleeing at cruise no
    // longer outlasts the last hunter — the route must fight the duel instead
    // of trailing it, and the wave can only close by killing.
    const onlyMutants = s.enemies.length > 0 && s.enemies.every(e => e.type === 'mutant')
    // Terrain seat (#3456 stage 2): the look-ahead horizon scales with speed AND
    // with arrest distance — pressing up only buys ~0.5/tick of lift while inertia
    // keeps sinking ~2.7×vy, so the margin must cover the SINK, not the climb rate
    // (the old flat 30 px panic-climb fired late on a fast dive and grazed anyway;
    // the /wasup taxonomy proved the press was already down when the hull died).
    const sink = Math.max(0, p.vy) * 3
    const look = 24 + Math.abs(p.vx) * 20
    let aheadFloor = groundAt(s.terrain, p.x)
    for (let d = 14; d <= look; d += 14) aheadFloor = Math.min(aheadFloor, groundAt(s.terrain, p.x + dir * d))
    // Margin = current sink + terrain RISE across the horizon (closing
    // horizontally into rising ground adds relative descent vy alone misses).
    const climbMargin = 14 + sink + Math.max(0, groundAt(s.terrain, p.x) - aheadFloor) * 0.6
    const climbing = aheadFloor - p.y < climbMargin
    if (climbing) input.up = true
    // Canyon rule (#3456): a wall that gains more height over the horizon than a
    // full climb can gain is not a hill, it is a trap — turn off it and come back
    // along the contour. (Terrain here climbs up to 2 px per px; at dash speed
    // that outruns the fighter's lift, and /wasup deaths were exactly this.)
    const tRemain = Math.abs(p.vx) > 0.5 ? look / Math.abs(p.vx) : 60
    const climbGain = Math.min(8 * tRemain, 0.25 * tRemain * tRemain) * 0.8
    const riseAhead = groundAt(s.terrain, p.x) - groundAt(s.terrain, p.x + dir * look)
    const canyon = climbing && riseAhead > climbGain + 12
    if (canyon) { if (p.vx >= 0) input.left = true; else input.right = true; return input }
    // Pulsed descent law: no branch free-falls past a gentle gait, and nothing
    // dives inside the near-ground zone (the elevator auto-delivers at clearance
    // 18, comfortably above this line).
    const canDown = p.vy < 2.6 && groundAt(s.terrain, p.x) - p.y > 26

    // Delivery, valley-site (#3456 stage 2): the held human only commits to the
    // floor while the floor within reach still admits the seat — if any sampled
    // ground ahead rises into the descent line, hold height and drift until the
    // ridge has passed (the seat itself is safe; it is the RIDING to it that died).
    if (s.carrying !== null) {
        const seat = groundAt(s.terrain, p.x) - 13
        const clrNow = groundAt(s.terrain, p.x) - p.y
        const elevatorD = p.vy < (clrNow > 26 ? 2.6 : 1.0)
        let riseAhead = false
        for (let d = 14; d <= 60 + Math.abs(p.vx) * 12; d += 14) {
            if (groundAt(s.terrain, p.x + dir * d) - p.y < 8 + sink) { riseAhead = true; break }
        }
        // Guns live during the haul (#3456 stage 3): the arcade fighter never
        // muzzles its cargo. The same flat-line law and friendly-fire veto that
        // guard the cruise apply at the elevator — ±1.2 px/tick of brake never
        // outran a 2.4 cap anyway; diedHauling (12 + 11) was the package being
        // hunted by a route that could neither flee nor answer.
        const haulGun = lineGun(s, p)
        if (haulGun.hold) input.holdTell = true
        if (haulGun.gun) input.fire = true
        // Nearest hostile in the package's airspace — with the same momentum
        // law (#3456 stage 3): read the fighter's projected position too, so
        // the brace starts before a dash commits the package into the hunter.
        let hunt = null
        let huntD = Infinity
        const hx = ((p.x + p.vx * 10) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
        const hy = p.y + p.vy * 6
        for (const e of s.enemies) {
            const bx = Math.min(Math.abs(wrapDelta(e.x - p.x)), Math.abs(wrapDelta(e.x - hx)))
            const by = Math.min(Math.abs(e.y - p.y), Math.abs(e.y - hy))
            if (bx > 170 || by > 70) continue
            if (bx < huntD) { huntD = bx; hunt = { bx: wrapDelta(e.x - p.x), by: e.y - p.y, vy: e.vy } }
        }
        // Overhead pocket (#3456 stage 4): a hunter nearly ON the column and
        // closing vertically is beyond the horizontal laser — and the vertical
        // race is lost before it starts (climb is 0.5/tick, its dive is 3).
        // Every stage-4 package death read |bx| < 18, |by| 11–15, kvy ±2…3.
        // The package breaks the COLUMN instead: dash off the contact line at
        // full cruise (mutants track at 2.4 — cruise outruns), hold height,
        // and the elevator resumes once the tracker has passed.
        if (hunt && huntD < 40 && Math.abs(hunt.by) < 60 && hunt.by * hunt.vy < -0.2) {
            if (hunt.bx >= 0) input.left = true
            else input.right = true
            if (input.up && input.down) input.down = false
            return input
        }
        // The elevator is no blind spot (#3456): too close at delivery height
        // aborts the drop to cruise band rather than trading the haul for a
        // hull; the resume happens next tick once the threat clears.
        if (hunt && huntD < 120 && Math.abs(hunt.by) < 46 && clrNow < 70) {
            input.up = true
            input.down = false
        } else if (hunt) {
            // Turn-and-brace WITH the package: flip toward the hunter so its own
            // approach walks into the 20/tick laser, hop off the kill band when
            // it comes level, and keep the seat line — the delivery resumes the
            // tick the lane clears.
            if (hunt.bx > 0) input.right = true
            else if (hunt.bx < 0) input.left = true
            if (huntD < 80 && Math.abs(hunt.by) < 17) {
                if (hunt.by >= 0 || clrNow < 100) input.up = true
                else if (canDown) input.down = true
            } else if (p.y > seat + 2) input.up = true
            else if (elevatorD && !climbing && !riseAhead && p.y < seat - 2) input.down = true
        } else {
            if (p.y > seat + 2) input.up = true
            else if (elevatorD && !climbing && !riseAhead && p.y < seat - 2) input.down = true
        }
        // Station-keeping: brake into the hover only while the airspace is
        // clear; braced, cap the dash instead of pinning the hull still.
        if (!hunt || huntD > 120) {
            if (p.vx > 1.2) input.left = true
            else if (p.vx < -1.2) input.right = true
        } else {
            if (p.vx > 4) input.left = true
            else if (p.vx < -4) input.right = true
        }
        if (input.up && input.down) input.down = false
        return input
    }

    // Rescue: a human already falling is worth banking if the ship can get under
    // it before the surface — chase only a realistically reachable one (scaled to
    // how far it still has to fall and how low it already is), then sit just
    // above and let it drop into the harness.
    let fall = null
    let fallD = Infinity
    for (const h of s.humans) {
        if (h.state !== 'falling') continue
        const d = Math.abs(wrapDelta(h.x - p.x)) + Math.abs(h.y - p.y) * 3
        if (d < fallD) { fallD = d; fall = h }
    }
    if (fall && fallD < 1000 && !climbing) {
        const fdx = wrapDelta(fall.x - p.x)
        if (Math.abs(fdx) > 16) {
            if (fdx > 4) input.right = true
            else if (fdx < -4) input.left = true
        } else if (p.vx > 1.6) input.left = true
        else if (p.vx < -1.6) input.right = true
        const wantY = Math.min(fall.y - 12, groundAt(s.terrain, fall.x) - 18)
        if (canDown && p.y < wantY - 4) input.down = true
        else if (p.y > wantY + 6) input.up = true
        if (input.up && input.down) input.down = false
        return input
    }

    // Threat choice, weighted by the planet's job: a hauler is the top priority,
    // a diver next, everything else nearest-first. Fresh-facing gate (#3456):
    // nearest-after-wrap is NOT nearest — a target behind the nose only wins by
    // flipping the fighter and sweeping the corridor through its kill band, the
    // channel the enemy-death column counted under V6. It costs 3.5× here.
    let best = null
    let bestD = Infinity
    for (const e of s.enemies) {
        let d = Math.abs(wrapDelta(e.x - p.x)) + Math.abs(e.y - p.y) * 6
        if (e.type === 'lander' && e.carry !== null) d *= 0.25
        else if (e.type === 'lander' && e.state === 'descend') d *= 0.7
        const edx = wrapDelta(e.x - p.x)
        const eface = edx === 0 ? p.facing : Math.sign(edx)
        // A hauler is never demoted by the facing gate — the rescue job outranks
        // the sweep risk (the planet's own law, pinned in defendercheck). Nor is
        // anything in the speeder endgame: with only hunters left, EVERY target
        // is the duel and the tax would have the route fly with its back turned.
        if (eface !== p.facing && !(e.type === 'lander' && e.carry !== null)) d *= 3.5
        if (d < bestD) { bestD = d; best = e }
    }
    if (best) {
        const dx = wrapDelta(best.x - p.x)
        const dy = best.y - p.y
        const f = dx === 0 ? p.facing : Math.sign(dx)
        const aligned = Math.abs(dy) < 15 && Math.abs(dx) < 560 && (dx === 0 || Math.sign(dx) === p.facing)
        // Friendly-fire guard: never send a laser down a line where a walking
        // human stands closer than the target — your shots kill humans too.
        let shield = false
        if (aligned) {
            for (const h of s.humans) {
                if (h.state !== 'walk') continue
                const hd = wrapDelta(h.x - p.x)
                if (Math.abs(hd) < Math.abs(dx) + 8 && Math.sign(hd || p.facing) === Math.sign(dx || p.facing) && Math.abs(h.y - p.y) < 10) shield = true
            }
        }
        // A hostile closing from astern (#3456): turn and BRACE, don't flee.
        // Fleeing at cruise outruns a mutant (cap 2.4) forever — several holdout
        // seeds scored 7,800 and never cleared the wave because they could never
        // shake or kill the last hunter. Facing it makes its own approach close
        // the duel at 2.4 while the laser (20/tick, and the guns are already
        // level-aligned) wins the range war; vertical dodge stays live under it.
        // A hostile on the side the nose does NOT point at (#3456 stage 3,
        // re-keyed from velocity to FACING — the death taxonomy showed 123/151
        // witness contacts landing while the hull faced away from the killer):
        // that hunter gets FACED. Its own closing speed walks it into the
        // 20/tick laser, the wave actually ends, and braked drift no longer
        // presents a free back to anything astern. Vertical: match its altitude
        // with room, hop off the line if it arrives level before the gun can.
        let rear = null
        let rearD = Infinity
        for (const e of s.enemies) {
            const bx = wrapDelta(e.x - p.x)
            // In the speeder endgame the duel is whatever the nose does not
            // point at; otherwise stage 2's velocity-key (an astern chaser of a
            // fleeing hull) stands.
            const onRear = p.vx >= 0 ? bx < -8 : bx > 8
            if (onRear && Math.abs(bx) < 150 && Math.abs(e.y - p.y) < 40 && Math.abs(bx) < rearD) { rearD = Math.abs(bx); rear = e }
        }
        // The rescue job outranks the brace (the planet's law): while a hauler is
        // THE job, steer the job, not the duel.
        const chaserBehind = rear !== null && !(best.type === 'lander' && best.carry !== null)
        // Hover-kill (#3456 — the elevator's ±1.2 rule generalized): INSIDE the
        // late bracket the hull stops paying the duel with its body — the laser
        // closes at 20 whatever the hull does, so braking just keeps the hull out
        // of the ±16 band while the shot walks the rest. Late, not early: dwelling
        // at range is what fed chasers in v1.
        const hover = !chaserBehind && !shield && f === p.facing && Math.abs(dy) < 24 && Math.abs(dx) < 220
        // Crossfire bail (#3456): anything already inside the outer band is
        // dodged out of the kill band VERTICALLY, whatever the target list says —
        // mutants match horizontal speed, but few vertical sprints. Autopsy: the
        // route kept dying at dy +9..14 with its guns aimed elsewhere. Stage 3
        // widens the band (90/34): the failing seeds died at dy 18–30 with the
        // general aim still steering the hull TOWARD the hunter one axis while
        // it closed on the other — bail starts before the aim can deliver it.
        let close = null
        let closeD = Infinity
        // Stage 3 momentum law: the band reads the ship's PROJECTED position
        // (10 ticks of velocity ahead), not just its foot. Every stage-3
        // autopsy death was momentum — a dash or vy built by the aim/flight of
        // earlier ticks carrying the hull into a threat the escape already
        // "saw"; a memoryless brain that only reacts at contact distance can
        // never null 8 px/tick in 20 px. Reading ahead is the fix.
        const qx = ((p.x + p.vx * 10) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
        const qy = p.y + p.vy * 6
        for (const e of s.enemies) {
            const ex = Math.min(Math.abs(wrapDelta(e.x - p.x)), Math.abs(wrapDelta(e.x - qx)))
            const ey = Math.min(Math.abs(e.y - p.y), Math.abs(e.y - qy))
            if (ex < 90 && ey < 34 && ex < closeD) { closeD = ex; close = e }
        }
        if (close) {
            // Flee the hug in BOTH axes at cruise (> the mutant's 2.4 cap) —
            // braking inside the danger bubble is how v1 fed the route to the
            // hunters; separation first, the brace kills it at range after.
            const cy = close.y - p.y
            if (cy > 4) input.up = true
            else if (canDown && aheadFloor - p.y > 70) input.down = true
            const cx = wrapDelta(close.x - p.x)
            if (cx > 0) { if (p.vx > -4.5) input.left = true }
            else if (p.vx < 4.5) input.right = true
        } else if (shield) {
            // The shot the rules refuse, the body must also refuse: RUN from a
            // blocked line (mutants cap at 2.4 — cruise outruns them) until the
            // foot soldier has walked out (0.3/tick); creeping into a shielded
            // target was the front-+dy enemy bucket this stage had to close.
            // (#1907 tell lives in the gun block — one source, one mutant.)
            if (Math.abs(dx) < 300) {
                if (dx > 0) { if (p.vx > -4.2) input.left = true }
                else if (p.vx < 4.2) input.right = true
            }
            if (canDown && dy > 24) input.down = true
            else if (dy < -12) input.up = true
        } else if (chaserBehind) {
            const rr = Math.sign(wrapDelta(rear.x - p.x))
            if (onlyMutants && s.enemies.length === 1 && rearD > 90 && Math.abs(rear.y - p.y) < 12) {
                // Last-hunter endgame (#3456 stage 3): with the wave's landers
                // gone, trailing the survivor past the horizon never closes it.
                // When it is ALREADY level (the gun will fire the tick the nose
                // comes around) and at clean range, flip and let its approach
                // walk into the laser — a bounded, shootable duel, not a trade.
                if (rr > 0) input.right = true
                else input.left = true
            } else {
                if (p.vx * rr > -1.4) { if (rr > 0) input.right = true; else input.left = true }
                const ry = rear.y - p.y
                if (canDown && ry > 10) input.down = true
                else if (ry < -10) input.up = true
            }
        } else if (hover) {
            if (p.vx > 2.2) input.left = true
            else if (p.vx < -2.2) input.right = true
            else if (Math.abs(p.vx) < 0.9) { if (f > 0) input.right = true; else input.left = true }
        } else if (dx > 6) input.right = true
        else if (dx < -6) input.left = true
        if (!climbing && !shield && !close) {
            // Stage 3: vertical AIM never commits the hull into a contact
            // column — an enemy just off the nose vertically closes into the
            // ±16 kill band faster than a built-up vy nulls. When the shot
            // line is also a contact column, hold height; the target presents
            // itself (and `close` owns the escape) long before the climb does.
            const contactColumn = (towardDown) => s.enemies.some(e => {
                const ex = Math.abs(wrapDelta(e.x - p.x))
                const ey = e.y - p.y
                return ex < 60 && (towardDown ? (ey > 10 && ey < 90) : (ey < -10 && ey > -90))
            })
            if (canDown && dy > 10 && !contactColumn(true)) input.down = true
            else if (dy < -10 && !contactColumn(false)) input.up = true
        }
    }
    // The gun is independent of the patrol's chosen job (#3456): anything legally
    // shootable down this flat line takes the shot — nearest first — whatever the
    // threat list decided, and walking human-closer-than-target vetoes the line
    // (the arcade friendly-fire law runs both ways). An aligned-but-vetoed line
    // still shows the hold tell.
    const line = lineGun(s, p)
    if (line.hold) input.holdTell = true
    if (line.gun) input.fire = true
    // Thrust interlock (#3456): lift always outranks dive. U-and-D together used
    // to cancel to ~0 and the trace showed the route sinking into rising ground
    // one neutered tick at a time while both keys were held.
    if (input.up && input.down) input.down = false
    return input
}

// One full simulation step. `input` = {left,right,up,down,fire}; the planet
// wrap, scoring, abduction chain, mutation and terminal all live here, driven
// by a single mulberry32 stream `rand` (seedRng(seed)).
export function createSim({ rand, height }) {
    const s = {
        tick: 0,
        score: 0,
        lives: START_LIVES,
        wave: 1,
        over: false,
        bonusLives: 0,
        terrain: makeTerrain(rand, WORLD_WIDTH, height),
        humans: [],
        enemies: [],
        lasers: [],
        particles: [],
        player: { x: 200, y: 200, vx: 3, vy: 0, facing: 1, cooldown: 0, dark: 0, invuln: 0 },
        carrying: null,
        freeze: 0,
        celebrate: 0, // #1907: wave-clear celebration ticks (the planet-explode beat)
        bombs: BOMBS_PER_WAVE, // #3443: smart-bomb stock, refilled at every wave beat
        prevBomb: false,       // edge-trigger: one press = one bomb, held ≠ stream
        bombFlash: 0,          // the white detonation beat the renderer paints
        speedMode: false,      // #3456 stage 3: landerless wave — the mutants run hot
        waveClock: WAVE_TIME,  // #3453: per-wave countdown; at 0 the landers go urgent
        urgent: false,
        events: [],
    }
    s.humans = makeHumans(rand, s.terrain)
    s.enemies = spawnWave(rand, 1, height)

    // #1907: kills read by COLOR, like the cabinet — landers pop green, mutants
    // burst red, the wreck burns orange, a lost human sparks gold.
    const killFx = (x, y, n, col = '#ffffff') => {
        for (let i = 0; i < n; i++) {
            s.particles.push({ x, y, vx: (rand() - 0.5) * 10, vy: (rand() - 0.5) * 10, life: 30, col })
        }
    }
    // #1907: a rand-FREE burst — the seedpin law says the witness stream may
    // not shift by a single draw, so announced flashes use a fixed pattern.
    const flashBurst = (x, y, col) => {
        for (let i = 0; i < 8; i++) {
            s.particles.push({ x, y, vx: Math.cos(i * Math.PI / 4) * 4, vy: Math.sin(i * Math.PI / 4) * 4, life: 22, col })
        }
    }

    const addScore = (pts) => {
        s.score += pts
        if (livesForScore(s.score) > s.bonusLives) { s.bonusLives += 1; s.lives += 1; s.events.push({ t: 'bonus' }) }
    }

    // #3443 — the smart bomb (Jon's #2016 answer A). One press vaporizes every
    // hostile inside the 1000 px screen window around the fighter, wrap-aware,
    // each dying at its table value; a hauler's cargo drops FALLING (catchable,
    // the same law as a shot hauler). The blast is selective like the cabinet's:
    // never the pilot, never a foot soldier. rand-FREE end to end — the FX use
    // the fixed flash pattern, so even a human pressing B cannot shift the seed
    // stream (the seedpin law), and watchRoute never presses at all.
    const smartBomb = (p) => {
        s.bombs -= 1
        s.bombFlash = 18
        let kills = 0
        for (const e of s.enemies) {
            if (e.dead || Math.abs(wrapDelta(e.x - p.x)) > BOMB_SCREEN / 2) continue
            e.dead = true
            kills += 1
            if (e.type === 'lander') {
                addScore(SCORE_LANDER)
                s.events.push({ t: 'killLander', pts: SCORE_LANDER })
                flashBurst(e.x, e.y, '#3dff5e')
                if (e.carry !== null) {
                    const h = s.humans[e.carry]
                    h.state = 'falling'
                    h.vy = 1
                    e.carry = null
                }
            } else {
                addScore(SCORE_MUTANT)
                s.events.push({ t: 'killMutant', pts: SCORE_MUTANT })
                flashBurst(e.x, e.y, '#ff5555')
            }
        }
        // The detonation ring — fixed pattern, deterministic, no rand.
        for (let i = 0; i < 16; i++) {
            s.particles.push({ x: p.x, y: p.y, vx: Math.cos(i * Math.PI / 8) * 7, vy: Math.sin(i * Math.PI / 8) * 7, life: 18, col: '#ffffff' })
        }
        s.events.push({ t: 'bomb', kills })
    }

    const die = () => {
        s.lives -= 1
        s.events.push({ t: 'die' })
        killFx(s.player.x, s.player.y, 16, '#ff8a3c')
        if (s.lives <= 0) {
            s.lives = 0
            s.over = true
            s.events.push({ t: 'over' })
            return
        }
        s.player.x = 200
        s.player.y = 200
        s.player.vx = 3
        s.player.vy = 0
        s.player.dark = RESPAWN_DELAY
        s.player.invuln = RESPAWN_DELAY + INVULN_TICKS
        s.freeze = DEATH_FREEZE // the machine holds the explosion on screen
        // A ship captured at death is dropped; if it falls through the ground
        // it dies, like everything else that hits the surface.
        if (s.carrying !== null) { s.humans[s.carrying].state = 'falling'; s.humans[s.carrying].vy = 1; s.carrying = null }
    }

    s.step = (input) => {
        s.tick += 1
        s.events = []
        if (s.over) return s
        // Death pause (#1531): the cabinet froze the screen with the wreck on
        // it for half a second before the respawn countdown — nothing moves,
        // particles included; only the clock runs.
        if (s.freeze > 0) { s.freeze -= 1; return s }
        if (s.celebrate > 0) s.celebrate -= 1 // #1907: the wave-clear beat burns its own clock
        if (s.bombFlash > 0) s.bombFlash -= 1 // #3443: the detonation white fades

        // #3453: the per-wave countdown. At zero the wave goes urgent — landers
        // dive and haul at URGENT_LANDER_SPEED until the wave turns over. The
        // edge fires once per wave; freeze (GAME OVER beat) pauses the clock.
        if (s.waveClock > 0) s.waveClock -= 1
        if (s.waveClock === 0 && !s.urgent) {
            s.urgent = true
            s.events.push({ t: 'waveUrgent' })
        }

        const p = s.player

        // Speeder endgame (#3456 stage 3, the 1981 rule): with every lander of
        // the wave dead, the surviving mutants hunt faster — the wave cannot be
        // finished by outlasting the last hunter. The transition is rand-free
        // (a state edge, not a draw), so the seed stream cannot shift.
        const speedMode = s.enemies.length > 0 && s.enemies.every((e) => e.type === 'mutant')
        if (speedMode && !s.speedMode) s.events.push({ t: 'speedup' })
        s.speedMode = speedMode

        // --- Player flight (inertia like the Jupiter fighter) ---
        if (p.dark > 0) {
            p.dark -= 1
        } else {
            if (input.left) { p.vx -= 0.5; p.facing = -1 }
            if (input.right) { p.vx += 0.5; p.facing = 1 }
            if (input.up) p.vy -= 0.5
            if (input.down) p.vy += 0.5
        }
        // #3445: the grace burns EVERY tick, not only while dark. The pre-fix
        // line sat inside the dark branch, so once dark hit 0 invuln froze at
        // 120 — every collision check (invuln <= 0) was false forever and the
        // pilot was immortal after its first crash. The cabinet promises ~1 s
        // dark + ~2 s blinking invulnerability, then you are mortal again.
        if (p.invuln > 0) p.invuln -= 1
        p.vx *= 0.98
        p.vy *= 0.95
        p.vx = Math.max(-8, Math.min(8, p.vx))
        p.vy = Math.max(-8, Math.min(8, p.vy))
        p.x = ((p.x + p.vx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
        p.y += p.vy
        if (p.y < 60) p.y = 60
        const ceil = groundAt(s.terrain, p.x)
        if (p.dark <= 0 && p.invuln <= 0 && ceil - p.y < 8) { die(); return s }
        if (p.y > groundAt(s.terrain, p.x) - 8) p.y = groundAt(s.terrain, p.x) - 8
        if (p.cooldown > 0) p.cooldown -= 1

        // --- Smart bomb (#3443): edge-triggered B, never during dark/death ---
        const bombPress = !!input.bomb && !s.prevBomb
        s.prevBomb = !!input.bomb
        if (bombPress && s.bombs > 0 && p.dark <= 0) smartBomb(p)

        // --- Lasers ---
        if (input.fire && p.cooldown <= 0 && p.dark <= 0) {
            s.lasers.push({ x: p.x + (p.facing === 1 ? 20 : -20), y: p.y, vx: p.facing * 20, life: 60 })
            p.cooldown = 10
        }
        s.lasers.forEach((l) => {
            l.x = ((l.x + l.vx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
            l.life -= 1
        })
        s.lasers = s.lasers.filter((l) => l.life > 0)

        // --- Humans ---
        s.humans.forEach((h) => {
            if (h.state === 'walk') {
                h.x = ((h.x + h.dir * WALK_SPEED) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
                h.y = groundAt(s.terrain, h.x) - 4
            } else if (h.state === 'abducted' || h.state === 'carried') {
                // position is owned by the carrier below
            } else if (h.state === 'falling') {
                h.vy += 0.05
                h.y += h.vy
                if (h.y >= groundAt(s.terrain, h.x) - 4) {
                    h.state = 'dead'
                    h.y = groundAt(s.terrain, h.x) - 4
                    s.events.push({ t: 'humanDied' })
                    killFx(h.x, h.y, 6, '#ffd23f')
                }
            }
        })

        // --- Enemies: landers (wander → descend → abduct → ascend) and mutants ---
        s.enemies.forEach((e) => {
            if (e.type === 'mutant') {
                // Fast, evasive chase on the wrap. In the speeder endgame
                // (#3456 stage 3) the same hunt runs hotter — the cabinet's
                // landerless-wave speedup: more drive, higher cap, tighter jitter.
                const cap = speedMode ? SPEEDER_SPEED : MUTANT_SPEED
                const drive = speedMode ? 0.155 : 0.12
                const dx = wrapDelta(p.x - e.x)
                const dy = p.y - e.y
                e.vx += Math.sign(dx) * drive
                e.vy += Math.sign(dy) * drive
                if (rand() < (speedMode ? 0.05 : 0.03)) e.vy += (rand() - 0.5) * 3
                e.vx = Math.max(-cap, Math.min(cap, e.vx))
                e.vy = Math.max(-cap, Math.min(cap, e.vy))
                // #3456 fidelity fix: hunt mutants' chase velocity was tracked
                // every tick but never integrated — the state-machine movement
                // block below belongs to the landers, so mutants were STATUES
                // that the README (and two seasons of WITNESS prose) swore were
                // chasing. The 1981 mutant hunts the fighter; now it actually
                // moves, and the route's braces/dodges face a real hunter.
                e.x = ((e.x + e.vx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
                e.y += e.vy
            } else {
                const held = e.carry !== null ? s.humans[e.carry] : null
                if (e.state === 'wander') {
                    e.vy += (rand() - 0.42) * 0.06
                    e.vy = Math.max(-0.4, Math.min(0.6, e.vy))
                    if (rand() < 0.008) {
                        // Pick the nearest living walking human and dive for it.
                        let best = null
                        let bestD = Infinity
                        s.humans.forEach((h, i) => {
                            if (h.state !== 'walk') return
                            const d = Math.abs(wrapDelta(h.x - e.x))
                            if (d < bestD) { bestD = d; best = i }
                        })
                        if (best !== null) { e.state = 'descend'; e.target = best }
                    }
                } else if (e.state === 'descend') {
                    const h = s.humans[e.target]
                    if (!h || h.state !== 'walk') {
                        // Losing the target mid-dive must never leave a human
                        // frozen mid-air: whatever it held starts falling.
                        if (e.carry !== null) {
                            const held0 = s.humans[e.carry]
                            if (held0.state === 'abducted') { held0.state = 'falling'; held0.vy = 1 }
                        }
                        e.carry = null
                        e.state = 'ascend'
                    } else {
                        const dx = wrapDelta(h.x - e.x)
                        const dy = (h.y - 14) - e.y
                        const lsp = s.urgent ? URGENT_LANDER_SPEED : LANDER_SPEED // #3453: expired clock, steeper dives
                        e.x += Math.sign(dx) * Math.min(Math.abs(dx), lsp)
                        e.y += Math.sign(dy) * Math.min(Math.abs(dy), lsp)
                        if (Math.abs(dx) < 6 && Math.abs(dy) < 8) {
                            // Abduction: the human dangles below and rises with it.
                            h.state = 'abducted'
                            e.carry = e.target
                            e.target = null
                            e.state = 'ascend'
                            s.events.push({ t: 'abduct' })
                        }
                    }
                } else if (e.state === 'ascend') {
                    e.vy = -(s.urgent ? URGENT_LANDER_SPEED : LANDER_SPEED) * 0.8 // #3453: urgent hauls race the surface
                    if (held) {
                        // Haul the human toward the surface again — if it lands
                        // with its catch, the human is gone and the shell mutates.
                        if (e.y > groundAt(s.terrain, e.x) - 14) {
                            held.state = 'dead'
                            held.y = groundAt(s.terrain, held.x) - 4
                            held.vy = 0
                            e.carry = null
                            e.state = 'hunt'
                            e.type = 'mutant'
                            e.vy = -1.5
                            s.events.push({ t: 'humanDied' })
                            s.events.push({ t: 'mutate' })
                            flashBurst(e.x, e.y, '#b1ff5e') // #1907: mutation flash, same tell as a ground mutate
                        }
                    }
                    if (e.state === 'ascend' && e.y < 70) {
                        // 1981 law, re-verified for #3453 against the original's
                        // documented mechanics: the lander takes its catch TO THE
                        // TOP and there the pair turns into a mutant — "Mutants,
                        // captured humans that had turned hostile" (Jarvis). The
                        // human is lost at the top; the shell does NOT survive as
                        // a lander (pre-fix bug: it wandered the sky empty). The
                        // README's older note that the cabinet "re-descends" its
                        // catch was wrong — no top turn exists; the save window is
                        // the ascent itself (shoot: the catch falls, catchable).
                        if (held) {
                            held.state = 'dead'
                            held.vy = 0
                            held.y = groundAt(s.terrain, held.x) - 4
                            e.carry = null
                            e.state = 'hunt'
                            e.type = 'mutant'
                            e.vy = -1.5
                            s.events.push({ t: 'humanDied' })
                            s.events.push({ t: 'mutate' })
                            flashBurst(e.x, e.y, '#b1ff5e') // the mutation flash, same tell as a ground mutate
                        } else {
                            e.state = 'wander'
                        }
                    }
                }
                if (e.state === 'wander' || e.state === 'descend') {
                    e.x = ((e.x + e.vx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
                    e.y += e.vy
                } else if (e.state === 'ascend') {
                    e.x = ((e.x + e.vx * 0.5) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH
                    e.y += e.vy
                }
                // Empty lander touching the ground mutates (the 1981 law).
                if (e.type === 'lander' && !e.carry && e.y >= groundAt(s.terrain, e.x) - 12) {
                    e.type = 'mutant'
                    e.state = 'hunt'
                    e.vy = -1.5
                    s.events.push({ t: 'mutate' })
                    flashBurst(e.x, e.y, '#b1ff5e') // #1907: the shell flashes green as it turns
                }
                // Carried human rides just below the shell.
                if (e.carry !== null) {
                    const h2 = s.humans[e.carry]
                    h2.x = e.x
                    h2.y = e.y + 16
                }
            }
            e.x = ((e.x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH
            e.y = Math.max(55, Math.min(groundAt(s.terrain, e.x) - 2, e.y))
        })

        // --- Laser hits: the arcade's scoring table ---
        s.lasers.forEach((l) => {
            s.enemies.forEach((e) => {
                if (e.dead || l.life <= 0) return
                if (Math.abs(wrapDelta(l.x - e.x)) < 20 && Math.abs(l.y - e.y) < 16) {
                    e.dead = true
                    l.life = 0
                    if (e.type === 'lander') {
                        addScore(SCORE_LANDER)
                        s.events.push({ t: 'killLander', pts: SCORE_LANDER })
                        killFx(e.x, e.y, 10, '#3dff5e') // the arcade's green lander pop (#1907)
                        if (e.carry !== null) {
                            const h = s.humans[e.carry]
                            h.state = 'falling'
                            h.vy = 1
                            e.carry = null
                        }
                    } else {
                        addScore(SCORE_MUTANT)
                        s.events.push({ t: 'killMutant', pts: SCORE_MUTANT })
                        killFx(e.x, e.y, 10, '#ff5555') // mutants burst red (#1907)
                    }
                }
            })
            // Friendly fire exists in the original — your shots can kill the
            // very humans you are defending.
            s.humans.forEach((h) => {
                if (h.state === 'walk' && Math.abs(wrapDelta(l.x - h.x)) < 8 && Math.abs(l.y - h.y) < 8) {
                    l.life = 0
                    h.state = 'dead'
                    s.events.push({ t: 'humanDied' })
                }
            })
        })
        s.enemies = s.enemies.filter((e) => !e.dead)
        s.lasers = s.lasers.filter((l) => l.life > 0)

        // --- Falling humans: mid-air catch, then delivery ---
        s.humans.forEach((h, i) => {
            if (h.state === 'falling' && p.dark <= 0 && s.carrying === null) {
                if (Math.abs(wrapDelta(h.x - p.x)) < 16 && Math.abs(h.y - p.y - 12) < 16) {
                    h.state = 'carried'
                    s.carrying = i
                    addScore(SCORE_CATCH)
                    s.events.push({ t: 'catch', pts: SCORE_CATCH })
                }
            }
            if (h.state === 'carried') {
                h.x = p.x
                h.y = p.y + 12
                if (groundAt(s.terrain, h.x) - h.y < 6) {
                    h.state = 'walk'
                    h.y = groundAt(s.terrain, h.x) - 4
                    s.carrying = null
                    addScore(SCORE_DELIVER)
                    s.events.push({ t: 'deliver', pts: SCORE_DELIVER })
                }
            }
        })

        // --- Ship collision: enemies kill the fighter ---
        if (p.dark <= 0 && p.invuln <= 0) {
            for (const e of s.enemies) {
                if (Math.abs(wrapDelta(e.x - p.x)) < 18 && Math.abs(e.y - p.y) < 16) { die(); break }
            }
        }

        // --- Wave clear ---
        if (s.enemies.length === 0) {
            addScore(SCORE_WAVE)
            s.wave += 1
            s.enemies = spawnWave(rand, s.wave, height)
            s.bombs = BOMBS_PER_WAVE // #3443 (Jon #2016): 3 per wave — the wave beat restocks
            s.waveClock = WAVE_TIME // #3453: new wave, fresh countdown
            s.urgent = false
            s.celebrate = 100 // #1907: the planet-exploses celebration beat before the new wave settles
            s.events.push({ t: 'wave', pts: SCORE_WAVE })
        }

        // --- Particles ---
        s.particles.forEach((pt) => { pt.x += pt.vx; pt.y += pt.vy; pt.life -= 1 })
        s.particles = s.particles.filter((pt) => pt.life > 0)
        return s
    }

    return s
}
