// MOMENTUM RUNNER — the pure simulation. This file imports into PLAIN NODE:
// that is why `npm run runnercheck` can prove every slope, spring, pit and
// loop of every zone is clearable BEFORE any browser exists.
//
// Angle-based physics is the muscle the issue named: while grounded the body
// carries a scalar speed ALONG the ground tangent; gravity's projection along
// that tangent (G*sin(theta)) is what drives you downhill — flat running is
// deliberately too slow for the loop. On landing the velocity vector is
// PROJECTED onto the new ground tangent: hitting a downhill adds the falling
// speed, hitting an uphill eats it. The loop is a real circle integrated by
// energy (v^2 = v0^2 - 2Gr(1-cos phi)); the instant the centripetal
// requirement v^2 >= G*r*cos(phi) fails, the body peels off the wall and
// falls — which is what makes the entry-speed receipt meaningful.
//
// Modes: 'track' (x along the polyline, s along the tangent), 'air'
// (ballistic vx/vy with light steer), 'loop' (phi from the circle's bottom).
//
// Determinism contract: no RNG, no wall clock, no DOM, no Date. The attract
// demo and runnercheck's CHAIN phase replay ONE script the autopilot proved,
// tick for tick — the planner never gets a pre-opened world (the metroid
// lesson): it dies on the same spikes you do.

export const FIXED_DT = 1 / 60
export const G = 1500
export const VIEW_W = 480
export const VIEW_H = 270

// Load-bearing rules. runnercheck mutates these BY NAME to prove each one is
// touched by a named check — an untouchable rule is a rule that already died.
export const CFG = {
    slopeDrive: true,      // gravity projected along the ground tangent
    loopContact: true,     // v^2 >= G*r*cos(phi) or you peel off the wall
    springLaunch: true,    // spring pads really throw a real body
    ringsProtect: true,    // a hazard scatters rings instead of killing
    checkpointSaves: true, // totems move the respawn point
    landProject: true,     // landings project velocity onto the new tangent
    jumpCut: true,         // releasing the jump key early clips the apex
    pitDeath: true,        // below a zone's floor is dying
}

export const RUN_TOP = 340      // flat-run cap: NOT enough for the loop
export const RUN_ACCEL = 700
export const BRAKE = 950
export const AIR_ACCEL = 300
export const ROLL_DRAG = 0.22
export const JUMP_V = 560
export const JUMP_CUT = 0.45    // vy multiplier when the key lets go early
export const VMAX = 1150
export const RING_R = 11
export const BODY_R = 9         // the wheel; y is the FOOT, centre is y-BODY_R

// Zones: segs are [x1,y1,x2,y2] ground segments (gaps between them are PITS),
// rings float RING-off-the-ground on the proven line, springs sit ON the track
// and fire automatically, spikes are a ground span, ck is the totem's x.
export const ZONES = [
    {
        name: 'GREEN HILL',
        segs: [
            [0, 180, 340, 180], [340, 180, 540, 234], [720, 272, 860, 272],
            [860, 272, 1160, 240], [1160, 240, 1280, 258], [1540, 180, 1980, 180],
            [1980, 180, 2180, 215], [2180, 215, 2400, 215],
        ],
        rings: [[300, 166], [326, 166], [900, 251], [940, 246], [980, 240],
            [1600, 166], [1640, 166], [1680, 166], [1720, 166]],
        spikes: [[1030, 1090]],
        springs: [[1280, 258, -980]],
        ck: 1900, goal: 2320, deathY: 520, yMin: -80, loop: null,
    },
    {
        name: 'EMBER GAUNTLET',
        segs: [
            [0, 160, 260, 160], [260, 160, 560, 250], [720, 258, 820, 258],
            [820, 258, 980, 225], [980, 225, 1150, 225], [1380, 150, 1750, 150],
            [1750, 150, 2000, 240], [2000, 240, 2080, 240], [2360, 300, 2520, 300],
            [2520, 300, 2620, 265], [2620, 265, 2800, 265],
        ],
        // the second ring set sits ON the spring's ballistic arc (mid-air):
        // the spring IS the route to Ember's second spike, and the rings that
        // survive that spike can only be had by riding it — runnercheck grades
        // this as velocity-reachability (spike2 unreached with 0 rings = fail).
        rings: [[120, 146], [160, 146], [200, 146], [240, 146],
            [1240, 59], [1350, -24], [1461, -47], [1580, -19], [1690, 45]],
        spikes: [[1060, 1100], [2440, 2480]],
        springs: [[1150, 225, -900]],
        ck: 1620, goal: 2740, deathY: 620, yMin: -66, loop: null,
    },
    {
        name: 'SKY LOOP',
        // The far ground is CONTINUOUS after the loop (no pit to jump), so the
        // runner rolls into the spike grounded and MUST spend the apex rings to
        // live. A runner that skipped the loop reaches this spike ringless and
        // dies — which is exactly what runnercheck proves (loop load-bearing).
        segs: [
            [0, 40, 150, 40], [150, 40, 950, 413], [950, 413, 1080, 425],
            [1080, 425, 1160, 425], [1160, 425, 2200, 445],
        ],
        // the ONLY rings for the far spike sit on the loop's apex arc: you can
        // collect them only by rolling over the INSIDE of the loop, and you can
        // only KEEP contact over the apex if entry v^2 >= 5*G*r. No ground
        // ring survives that far spike — runnercheck proves the straight/jump
        // route dies ringless there, so the loop is load-bearing, not scenic.
        rings: [[1211, 275], [1187, 261], [1160, 256], [1133, 261], [1109, 275]],
        spikes: [[1600, 1650]],
        springs: [],
        ck: 1000, goal: 2050, deathY: 760, yMin: 0,
        loop: { cx: 1160, cy: 345, r: 80 },
    },
]

export function segAt(z, x) {
    for (const sgm of z.segs) if (x >= sgm[0] && x <= sgm[2]) return sgm
    return null
}
export function groundY(z, x) {
    const sgm = segAt(z, x)
    if (!sgm) return null
    const [x1, y1, x2, y2] = sgm
    return y1 + (x - x1) * (y2 - y1) / (x2 - x1)
}
export function segAngle(sgm) { return Math.atan2(sgm[3] - sgm[1], sgm[2] - sgm[0]) }
export function holeAhead(z, x, reach) {
    // first pit start at/after x, and where its far lip is
    for (let px = x; px <= x + reach; px += 4) {
        if (groundY(z, px) === null) {
            let far = px
            while (far < px + 500 && groundY(z, far) === null) far += 4
            return { start: px, far }
        }
    }
    return null
}
export function springFor(z, x, holeStart) {
    // a spring that sits at (or just before) the far end of the reachable
    // ground in front of x — the route for the hole starting at holeStart
    for (const sp of z.springs) if (sp[0] > x - 4 && sp[0] <= holeStart + 4) return sp
    return null
}
// the centripetal floor for the top of a loop: v^2 >= G*r at phi=pi,
// i.e. the energy-consistent ENTRY speed^2 must reach 5*G*r.
export const loopRequire = (r) => 5 * G * r

// ---------------------------------------------------------------- physics ----

function toAir(g, theta, jump = 0) {
    const p = g.p
    p.mode = 'air'
    p.vx = p.s * Math.cos(theta)
    p.vy = p.s * Math.sin(theta) - jump
    p.cut = false
}

function die(g, why) {
    g.ev.push({ type: 'die', why })
    g.deaths++
    g.rings = 0
    const z = ZONES[g.zone]
    const sx = (CFG.checkpointSaves && g.save.zone === g.zone) ? g.save.x : z.segs[0][0] + 40
    g.p.x = sx
    g.p.y = groundY(z, sx)
    g.p.mode = 'track'
    g.p.s = 0; g.p.vx = 0; g.p.vy = 0
    g.p.invuln = 90
    g.ev.push({ type: 'respawn', x: sx })
}

export function step(g, inp) {
    const p = g.p
    const z = ZONES[g.zone]
    g.ev.length = 0
    g.tick++
    if (g.end) return g

    if (p.invuln > 0) p.invuln--

    if (p.mode === 'track') {
        const sgm = segAt(z, p.x)
        if (!sgm) { toAir(g, p.lastTheta || 0); }
        else {
            const th = segAngle(sgm)
            p.lastTheta = th
            let a = 0
            if (CFG.slopeDrive) a += G * Math.sin(th)
            if (inp.right) a += p.s < RUN_TOP ? RUN_ACCEL : 140
            if (inp.left) a -= p.s > 0 ? BRAKE : RUN_ACCEL
            a -= ROLL_DRAG * p.s
            p.s = Math.max(-200, Math.min(VMAX, p.s + a * FIXED_DT))
            p.x += p.s * Math.cos(th) * FIXED_DT
            const gy = groundY(z, p.x)
            if (gy === null) { toAir(g, th) }
            else {
                p.y = gy
                // spring pads fire on touch — the one input-free verb
                if (CFG.springLaunch) {
                    for (const sp of z.springs) {
                        if (Math.abs(p.x - sp[0]) < 16 && Math.abs(p.y - sp[1]) < 20 && g.tick > (g.spent.get(sp) || -99)) {
                            g.spent.set(sp, g.tick)
                            p.mode = 'air'; p.cut = false
                            p.vx = p.s * Math.cos(th); p.vy = sp[2]
                            g.ev.push({ type: 'spring', x: sp[0] })
                        }
                    }
                }
            }
        }
        if (p.mode === 'track' && inp.jumpEdge) {
            const sgm2 = segAt(z, p.x)
            if (sgm2) { toAir(g, segAngle(sgm2), JUMP_V); g.ev.push({ type: 'jump' }) }
        }
    } else if (p.mode === 'air') {
        p.vy = Math.min(1500, p.vy + G * FIXED_DT)
        if (inp.right) p.vx = Math.min(VMAX, p.vx + AIR_ACCEL * FIXED_DT)
        if (inp.left) p.vx = Math.max(-300, p.vx - AIR_ACCEL * FIXED_DT)
        if (inp.jumpCut && CFG.jumpCut && !p.cut && p.vy < -80) { p.vy *= JUMP_CUT; p.cut = true }
        p.x += p.vx * FIXED_DT
        p.y += p.vy * FIXED_DT
        const gy = groundY(z, p.x)
        if (gy !== null && p.y >= gy) {
            p.y = gy
            const sgm = segAt(z, p.x)
            const th = segAngle(sgm)
            p.s = CFG.landProject ? p.vx * Math.cos(th) + p.vy * Math.sin(th) : p.vx
            p.s = Math.max(-200, Math.min(VMAX, p.s))
            p.mode = 'track'
            g.ev.push({ type: 'land', x: Math.round(p.x) })
        } else if (p.y > z.deathY) {
            if (CFG.pitDeath) die(g, 'pit')
            else { p.y = z.deathY - 1; p.vy = 0 }
        }
    } else if (p.mode === 'loop') {
        const L = z.loop
        // energy along the circle; phi measured from the bottom, screen y-down
        const v2 = Math.max(0, p.v0 * p.v0 - 2 * G * L.r * (1 - Math.cos(p.phi)))
        // inside the loop the track's normal force is N = v^2/r + g*cos(phi):
        // it releases near the APEX (upper half, cos<0) once v^2 < -g*r*cos,
        // which is exactly why the entry floor is v^2 >= 5*g*r (top: v^2>=g*r).
        if (CFG.loopContact && Math.cos(p.phi) < 0 && v2 < -G * L.r * Math.cos(p.phi)) {
            // peeled off the wall before the apex — a real fall, no loop, no apex rings
            const v = Math.sqrt(v2)
            p.mode = 'air'; p.cut = false
            p.x = L.cx + L.r * Math.sin(p.phi)
            p.y = L.cy + L.r * Math.cos(p.phi)
            p.vx = v * Math.cos(p.phi); p.vy = -v * Math.sin(p.phi)
            g.ev.push({ type: 'crash' })
        } else {
            p.phi += Math.sqrt(v2) / L.r * FIXED_DT
            if (p.phi >= Math.PI * 2) {
                p.mode = 'track'
                p.x = L.cx; p.y = L.cy + L.r
                p.s = Math.sqrt(v2)
                p.lastTheta = 0
                g.loopTaken = true
                g.score += 500
                g.ev.push({ type: 'loop', v: Math.round(p.s) })
            } else {
                // follow the circle every tick, so the apex rings (which sit
                // ON this arc) are actually passed through and collected
                p.x = L.cx + L.r * Math.sin(p.phi)
                p.y = L.cy + L.r * Math.cos(p.phi)
            }
        }
    }

    // ---- pickups and hazards run in every mode ----
    for (let i = 0; i < z.rings.length; i++) {
        if (g.taken.has(zoneRing(g.zone, i))) continue
        const [rx, ry] = z.rings[i]
        const dx = p.x - rx, dy = (p.y - BODY_R) - ry
        if (dx * dx + dy * dy < (RING_R + BODY_R) * (RING_R + BODY_R)) {
            g.taken.add(zoneRing(g.zone, i))
            g.rings++; g.score += 10
            g.ev.push({ type: 'ring', x: rx })
        }
    }
    if (p.invuln === 0) {
        for (const sp of z.spikes) {
            const grounded = p.mode === 'track' || (p.mode === 'air' && p.y >= (groundY(z, p.x) ?? 1e9) - 2)
            if (p.x >= sp[0] && p.x <= sp[1] && grounded) {
                if (g.rings > 0 && CFG.ringsProtect) {
                    g.ev.push({ type: 'hit', lost: g.rings })
                    g.rings = 0
                    p.s *= 0.75
                    if (p.mode === 'air') { const gy = groundY(z, p.x); if (gy !== null) { p.y = gy; p.s = p.vx * 0.75; p.mode = 'track' } }
                    p.invuln = 70
                } else {
                    die(g, 'spikes')
                }
                break
            }
        }
    }
    if (!g.end) {
        if (p.mode === 'track') {
            if (z.ck > 0 && p.x >= z.ck && !(g.save.zone === g.zone && g.save.x === z.ck)) {
                g.save = { zone: g.zone, x: z.ck }
                g.ev.push({ type: 'save', x: z.ck })
            }
            if (p.x >= z.goal) {
                g.ev.push({ type: 'goal', zone: g.zone })
                g.score += 1000
                if (g.zone + 1 >= ZONES.length) { g.end = 'win' }
                else {
                    g.zone++
                    const z2 = ZONES[g.zone]
                    g.save = { zone: g.zone, x: z2.segs[0][0] + 40 }
                    g.p.x = z2.segs[0][0] + 40
                    g.p.y = groundY(z2, g.p.x)
                    g.p.mode = 'track'; g.p.s = 0; g.p.vx = 0; g.p.vy = 0
                    g.spent = new Map()
                }
            }
        }
    }
    return g
}

const zoneRing = (z, i) => z * 100 + i

export function makeGame() {
    const z = ZONES[0]
    return {
        tick: 0, zone: 0, rings: 0, score: 0, deaths: 0, end: null, loopTaken: false,
        save: { zone: 0, x: z.segs[0][0] + 40 },
        taken: new Set(), spent: new Map(), ev: [],
        p: { x: z.segs[0][0] + 40, y: groundY(z, z.segs[0][0] + 40), mode: 'track', s: 0, vx: 0, vy: 0, invuln: 0, cut: false, lastTheta: 0, v0: 0, phi: 0 },
    }
}

export function enterLoop(g) {
    const L = ZONES[g.zone].loop
    g.p.mode = 'loop'; g.p.phi = 0; g.p.v0 = g.p.s
    g.p.x = L.cx; g.p.y = L.cy + L.r
}

// ONE entry rule, used identically by the planner, the replay and the shell.
// The runner is grounded, moving along flat floor, at/after the loop mouth,
// floor height equals the circle bottom, and the loop has not yet been taken.
export function maybeEnterLoop(g) {
    const z = ZONES[g.zone], L = z.loop, p = g.p
    if (!L || g.loopTaken || p.mode !== 'track') return false
    if (p.x >= L.cx && p.lastTheta === 0 && Math.abs(p.y - (L.cy + L.r)) < 0.5) {
        enterLoop(g); return true
    }
    return false
}

// ------------------------------------------------------------- autopilot ----
// Greedy and honest: hold right; jump a pit ONLY if a ballistic lookahead
// (the SAME groundY the renderer draws) shows a landing past its far lip;
// never jump when a spring sits between you and the hole — the spring is the
// route. Every candidate is integrated by stepBody, a pure copy of the track/
// air math, so what the planner predicts is what the engine will do.

function flyLand(z, x, y, vx, vy) {
    // integrate the SAME air math; returns x at first landing, or null
    let px = x, py = y, tvx = vx, tvy = vy
    for (let t = 0; t < 130; t++) {
        tvy = Math.min(1500, tvy + G * FIXED_DT)
        tvx = Math.min(VMAX, tvx + AIR_ACCEL * FIXED_DT)
        px += tvx * FIXED_DT; py += tvy * FIXED_DT
        const gy = groundY(z, px)
        if (gy !== null && py >= gy) return { x: px, y: gy }
        if (py > z.deathY) return null
    }
    return null
}

export function planRun() {
    const g = makeGame()
    const script = []
    const receipt = {
        gaps: [], loop: null, hits: 0, ringsAtHit: [], deaths: 0,
        springs: 0, warnings: [],
    }
    // the autopilot will not commit to a jump unless its own ballistic
    // lookahead lands this far past the far lip — so every gap in the receipt
    // is a proven clearance, and runnercheck re-measures it on the real body.
    const MARGIN = 24
    let jumpAt = -1           // tick index where the queued jump fires
    let pending = null        // { holeFar } the jump must clear
    for (let t = 0; t < 60 * 130; t++) {
        const z = ZONES[g.zone]
        const p = g.p
        const inp = { right: true }
        if (p.mode === 'track' && jumpAt < 0) {
            // The loop is the ROUTE, not scenery: never jump the mouth of a
            // loop this run has not yet taken. Its far-spike rings live on the
            // apex arc (only the inside of the loop reaches them), so jumping
            // the mouth would strand the runner ringless on the far side.
            const skipLoop = z.loop && !g.loopTaken && p.x >= z.loop.cx - 340
            const hole = holeAhead(z, p.x + 20, 280)
            if (hole && !skipLoop) {
                const sp = springFor(z, p.x, hole.start)
                if (sp) {
                    // the spring carries this hole — jumping would miss it
                } else {
                    const th = segAngle(segAt(z, p.x))
                    // try to launch within the next 26 ticks, earliest first
                    let sx = p.x, sy = p.y, ss = p.s
                    for (let k = 0; k <= 26 && jumpAt < 0; k++) {
                        const a = (CFG.slopeDrive ? G * Math.sin(th) : 0)
                            + (ss < RUN_TOP ? RUN_ACCEL : 140) - ROLL_DRAG * ss
                        ss = Math.max(-200, Math.min(VMAX, ss + a * FIXED_DT))
                        sx += ss * Math.cos(th) * FIXED_DT
                        const gy = groundY(z, sx)
                        if (gy === null) break
                        sy = gy
                        const land = flyLand(z, sx, sy,
                            ss * Math.cos(th), ss * Math.sin(th) - JUMP_V)
                        if (land && land.x >= hole.far + MARGIN) {
                            jumpAt = t + k
                            pending = { far: hole.far }
                        }
                    }
                }
            }
        }
        if (jumpAt === t) { inp.jumpEdge = true; jumpAt = -1 }
        step(g, inp)
        for (const e of g.ev) {
            if (e.type === 'hit') { receipt.hits++; receipt.ringsAtHit.push(e.lost) }
            if (e.type === 'spring') receipt.springs++
            if (e.type === 'land' && pending) {
                receipt.gaps.push({ far: pending.far, landed: e.x, margin: e.x - pending.far })
                pending = null
            }
            if (e.type === 'loop') receipt.loop = { entryV2: g.p.v0 * g.p.v0, exitV: e.v, need: loopRequire(ZONES[2].loop.r) }
            if (e.type === 'respawn') receipt.deaths++
        }
        maybeEnterLoop(g)
        script.push(inp)
        if (g.end === 'win') break
        if (g.deaths > 0) { receipt.warnings.push(`died at tick ${t}`); break }
    }
    receipt.score = g.score
    receipt.rings = g.rings
    const ok = g.end === 'win' && receipt.deaths === 0
        && receipt.gaps.every(x => x.margin >= MARGIN)
        && receipt.ringsAtHit.every(r => r > 0)
    return { ok, script, receipt, end: g.end, g }
}

export function replayScript(script, opts = {}) {
    const g = makeGame()
    for (let i = 0; i < script.length && !g.end; i++) {
        step(g, script[i])
        maybeEnterLoop(g)
        if (opts.onTick) opts.onTick(g)
    }
    return g
}

export function stateHash(g) {
    const p = g.p
    return [g.tick, g.zone, Math.round(p.x * 4), Math.round(p.y * 4),
        p.mode[0], Math.round((p.s || 0) * 2 + (p.vx || 0)), Math.round(p.vy * 2),
        g.rings, g.score, g.deaths].join(':')
}
