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
    pitWalls: true,        // a pit's far side is a WALL: a body below the lip falls in, never climbs out
    boostPads: true,       // floor strips that add speed along the slope
    zoneTally: true,       // each goal counts up a time bonus + a ring bonus
    roll: true,            // down while moving curls into a ball: no steer, light drag
    ringScatter: true,     // a hit scatters your rings in a fixed fan; they last 3s
    drones: true,          // ground patrols + hovers: air/roll contact destroys, else a hit
    multiLoop: true,       // zones carry a LOOPS list; the later zones hold two to commit to
    routeFork: true,       // a fast body commits to the HIGH deck at a fork; slow stays low
}

// zone tally: clear the zone quickly and carry rings through the gate.
// timeBonus  = (TALLY_TIME_CAP - ticks spent this zone) * TALLY_TIME_RATE, floored at 0
// ringBonus  = rings held at the gate * TALLY_RING_RATE
// The cap tracks the "longer zones" pass: a sector now takes the autopilot
// 60-90s, so the time bonus pays for beating that, not an old 12s mark.
export const TALLY_TIME_CAP = 5400
export const TALLY_TIME_RATE = 1
export const TALLY_RING_RATE = 50
// boost pads: a floor strip adds BOOST_ACCEL while the body is over it
export const BOOST_ACCEL = 1150
// ring scatter: a hazard sheds your rings into a fixed forward fan (no RNG)
// that stays pickable for SCATTER_LIFE ticks (3s), capped at SCATTER_MAX rings
export const SCATTER_LIFE = 180
export const SCATTER_MAX = 8
export const SCATTER_FAN = [[14, -6], [30, -18], [46, -34], [62, -50], [78, -64], [94, -76], [110, -88], [126, -100]]
// drones: the patrol sweeps [x0,x1] on the ground; the hover bobs at (x,y).
// Position is a pure function of the tick (no per-drone state, no RNG).
// #627: bodies must read at a glance on a phone — the old r=10 dot did not.
export const DRL_SPEED = 140
export const DRONE_R = 18
export const HOVER_BOB = 6

// two routes (#550): every sector carries a HIGH deck over one flat stretch —
// a ramp up, a ringed plateau, a ramp back down to the low line. The decks
// share x with the low ground (an overpass), so groundY is a FUNCTION OF THE
// ROUTE: groundY(z, x, route). The body carries p.route. At the mouth only a
// body at/above FORK_SPEED commits to 'high' (speed opens the fast lane —
// the game's one currency); below it you stay on the safe low line.
export const FORK_DY = 96      // deck height above the low line
export const FORK_RAMP = 160   // ramp run: the surface is continuous at commit
export const FORK_PLAT = 620   // ringed plateau
export const FORK_SPEED = 700  // commit gate: above what a flat run settles at (~636)

export const RUN_TOP = 340      // flat-run cap: NOT enough for the loop
export const RUN_ACCEL = 700
export const BRAKE = 950
export const AIR_ACCEL = 300
export const ROLL_DRAG = 0.22
export const ROLL_DRAG_ROLL = 0.06   // a ball has far less drag than a standing runner
export const ROLL_MIN = 60           // "down" below this speed won't curl you up
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
            [2400, 215, 2520, 255], [2520, 255, 2660, 255],
            [2920, 255, 3640, 255],
            [3640, 255, 3860, 215], [3860, 215, 4140, 215],
            [4140, 215, 4280, 250], [4280, 250, 4560, 250],
        ],
        // the rings at 2916..3529 sit ON the second spring's ballistic arc
        // (the proven line, sampled): they can only be had by riding the spring
        // at speed. A slow rider's lower arc misses them — and a slow rider
        // lands BEFORE the 3560 spike ringless. The post-landing spike at 4300
        // then only forgives the rings that arc carried through.
        rings: [[300, 166], [326, 166], [900, 251], [940, 246], [980, 240],
            [1600, 166], [1640, 166], [1680, 166], [1720, 166],
            [2916, 61], [3069, -8], [3223, -50], [3376, -66], [3529, -55]],
        spikes: [[1030, 1090], [3560, 3610], [4300, 4360]],
        springs: [[1280, 258, -980], [2660, 255, -980]],
        boosts: [[740, 850], [2200, 2300], [3920, 4100]],
        // the patrol guards the grounded run between the first pit and the
        // first spike (a hit you survive WITH the early rings); the hover
        // sits on the apex of the first spring's arc — only an AIR body
        // (the spring flight) reaches it, so the proven line destroys it
        drones: [{ kind: 'patrol', x0: 910, x1: 970 }, { kind: 'hover', x: 1710, y: -65 }],
        ck: 1900, goal: 4420, deathY: 520, yMin: -80, loops: [],
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
        boosts: [[1420, 1680], [2650, 2730]],
        // #627: an enemy in every zone. The patrol guards the pre-spike flat;
        // the hover sits on the spring's proven apex — air-only prize.
        drones: [{ kind: 'patrol', x0: 820, x1: 940 }, { kind: 'hover', x: 1550, y: -35 }],
        ck: 1620, goal: 2740, deathY: 620, yMin: -66, loops: [],
    },
    {
        name: 'SKY LOOP',
        // The far ground is CONTINUOUS after the loop (no pit to jump), so the
        // runner rolls into the spike grounded and MUST spend the apex rings to
        // live. A runner that skipped the loop reaches this spike ringless and
        // dies — which is exactly what runnercheck proves (loop load-bearing).
        segs: [
            [0, 40, 150, 40], [150, 40, 950, 413], [950, 413, 1080, 425],
            [1080, 425, 1360, 425], [1360, 425, 2200, 445],
        ],
        // the ONLY rings for the far spike sit on the loop's apex arc: you can
        // collect them only by rolling over the INSIDE of the loop, and you can
        // only KEEP contact over the apex if entry v^2 >= 5*G*r. No ground
        // ring survives that far spike — runnercheck proves the straight/jump
        // route dies ringless there, so the loop is load-bearing, not scenic.
        rings: [[1211, 275], [1187, 261], [1160, 256], [1133, 261], [1109, 275]],
        spikes: [[1600, 1650]],
        springs: [],
        boosts: [[1850, 2000]],
        // #627: the patrol guards the flat AFTER both loop exits (its mouth is
        // clear — a staggered body must never be dropped short of a loop); the
        // hover sits above the post-spike run — only an airborne body reaches it.
        drones: [{ kind: 'patrol', x0: 1450, x1: 1520 }, { kind: 'hover', x: 1700, y: 380 }],
        ck: 1000, goal: 2050, deathY: 760, yMin: 0,
        // two loops on the flat run after the dive. loops[0] is the load-bearing
        // one: its apex rings are the ONLY rings that survive the far spike. The
        // body carries its entry speed across the flat to loops[1] (a pure
        // momentum commitment, no rings) — so committing to the first loop at
        // speed is what opens the second.
        loops: [{ cx: 1160, cy: 345, r: 80, loadBearing: true }, { cx: 1360, cy: 345, r: 80 }],
    },
]

// ------------------------------------------------- the "longer zones" pass ----
// The hand-built cores above are short: the autopilot clears them in ~3-6s, so
// "there is barely a game" (the issue). This appends a deterministic TAIL to
// every sector — a fixed cycle of beats, each of which starts and ends on flat
// ground at the entry height so they chain with no height bookkeeping:
//
//   fastBoost  a flat stretch with a sprint strip (carry/reward speed)
//   valleyLoop a rolling quarter-pipe valley sampled from true circular arcs;
//              a full loop sits on the valley floor — the downhill IS the
//              engine that charges it (#627: loops and curves in every zone)
//   pitHop     a flat run-up, one jumpable pit (hazard), a flat run-off
//   hill       a downhill that builds speed, then the climb back (fast stretch)
//
// No RNG: each zone carries a HAND-AUTHORED beat PROGRAM (#642), so the
// attract demo and the gate prove the identical route, and no two stretches of
// a sector rhyme. The programs reuse one invariant: every beat starts and ends
// tangent-flat at the entry height, so beats chain with no height bookkeeping.
// The hand-built core (and every coordinate a check pins) is left untouched.
const ARC_R = 469          // valley arc radius: ~55 degrees max, reads curved
const VALLEY_DROP = 200     // rolling dip depth — enough to charge the loop
const LOOP_R = 70           // valley-floor loop; v^2 >= 5*G*r needs ~724
const beatFlatBoost = (x, y, len = 2600, b0 = 900, b1 = 1500) => ({
    segs: [[x, y, x + len, y]],
    boosts: [[x + b0, x + b1]],
    x1: x + len,
})
const beatPitHop = (x, y, run = 1150, pit = 110) => {
    const off = 2600 - run - pit
    return { segs: [[x, y, x + run, y], [x + run + pit, y, x + 2600, y]], x1: x + 2600, off }
}
// a WIDE gap you must jump (#642 "wider gaps"): longer run-up, 180-220px pit
const beatBigHop = (x, y, pit = 200, run = 900, off = 700) => ({
    segs: [[x, y, x + run, y], [x + run + pit, y, x + run + pit + off, y]],
    x1: x + run + pit + off,
})
// spring INTO a wide gap (#642 "springs into high routes", low form): the pad
// at the lip is the only route; a hover waits over the landing at jump height.
// The pad is LONG on purpose: a sprung body at 700-850 px/s flies ~1.2s, so
// run-off ~1150 keeps the landing on flat ground, never on the next beat's
// downslope (the pit-wall rule reads slope landings below the lip as deaths).
const beatSpringHop = (x, y, pit = 240, run = 820, off = 1150) => {
    const sx = x + run
    return {
        segs: [[x, y, sx, y], [sx + pit, y, sx + pit + off, y]],
        springs: [[sx, y, -900]],
        hover: { kind: 'hover', x: sx + pit + 280, y: y - 250 },
        x1: sx + pit + off,
    }
}
// a hill sized per beat (#642 "slopes that launch you" + variety)
const beatHill = (x, y, depth = 200, down = 1300, up = 1500) => ({
    segs: [[x, y, x + down, y + depth], [x + down, y + depth, x + down + up, y]],
    x1: x + down + up,
})
// rolling S-curves from true circular arcs — dip, crest, shallower dip, crest:
// almost no flat ground (#642)
const beatSCurves = (x, y, drop = 120, len = 2050) => {
    const d1 = arcPipe(x, y, drop, 4, true)
    const u1 = arcPipe(x + d1.run, y + drop, drop, 4, false)
    const d2 = arcPipe(x + d1.run + u1.run, y, drop * 0.8, 4, true)
    const u2 = arcPipe(x + d1.run + u1.run + d2.run, y + drop * 0.8, drop * 0.8, 4, false)
    const ex = x + d1.run + u1.run + d2.run + u2.run
    return { segs: [...d1.segs, ...u1.segs, ...d2.segs, ...u2.segs, [ex, y, x + len, y]], x1: x + len }
}
// spikes that MATTER (#642 "enemies placed where they matter"): a sprint
// strip, three ground rings as the toll, then a spike span — rings protect,
// the scatter fan refills for whatever comes next.
const beatSpikeSprint = (x, y, len = 2200) => ({
    segs: [[x, y, x + len, y]],
    boosts: [[x + 150, x + 700]],
    rings: [[x + 980, y - 14], [x + 1020, y - 14], [x + 1060, y - 14]],
    spikes: [[x + 1150, x + 1210]],
    x1: x + len,
})
// sample a circular arc into n segments; tangent-flat at one end, steep at the
// other (a quarter-pipe). `down` dips into the screen, `up` climbs out.
function arcPipe(x, y, drop, n, down) {
    const phi = Math.acos(1 - drop / ARC_R)
    const run = ARC_R * Math.sin(phi)
    const pts = []
    for (let k = 0; k <= n; k++) {
        const a = phi * k / n
        if (down) pts.push([x + ARC_R * Math.sin(a), y + ARC_R * (1 - Math.cos(a))])
        else pts.push([x + run - ARC_R * Math.sin(phi - a), y - drop + ARC_R * (1 - Math.cos(phi - a))])
    }
    pts[0][0] = x
    pts[n][0] = x + run
    const segs = []
    for (let k = 0; k < n; k++) segs.push([pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]])
    return { segs, run }
}
const beatValleyLoop = (x, y) => {
    const segs = [[x, y, x + 150, y]]
    const d = arcPipe(x + 150, y, VALLEY_DROP, 5, true)
    segs.push(...d.segs)
    const bx = x + 150 + d.run, by = y + VALLEY_DROP
    const cx = bx + 80 + LOOP_R
    segs.push([bx, by, cx + LOOP_R + 80, by])
    const u = arcPipe(cx + LOOP_R + 80, by, VALLEY_DROP, 5, false)
    segs.push(...u.segs)
    const ex = cx + LOOP_R + 80 + u.run
    segs.push([ex, y, x + 2600, y])
    // two rings on the valley floor before the loop: the descent's toll booth
    return { segs, x1: x + 2600, loop: { cx, cy: by - LOOP_R, r: LOOP_R }, rings: [[cx - LOOP_R - 60, by - 14], [cx - LOOP_R - 20, by - 14]] }
}

// per-zone programs (#642): every stretch different, no cycle, no repeating
// tail. Order keeps the invariants the gate pins: beat 0 is the flat fork
// runway (the deck overlaps it), valley loops follow speed builders so the
// entry always clears v^2 >= 5Gr, and zone 2 (load-bearing apex rings) gets
// no tail rings or spikes — its only rings must stay on the loop arc.
const PROGRAMS = [
    // GREEN HILL
    [beatFlatBoost, beatValleyLoop, beatSpringHop, beatBigHop, beatHill, beatSpikeSprint,
        beatSCurves, beatPitHop, beatValleyLoop, beatBigHop, beatSpringHop, beatHill,
        beatSCurves, beatPitHop, beatFlatBoost, beatValleyLoop, beatSpikeSprint, beatBigHop,
        beatHill, beatPitHop],
    // EMBER GAUNTLET
    [beatFlatBoost, beatSCurves, beatValleyLoop, beatBigHop, beatSpikeSprint, beatSpringHop,
        beatHill, beatPitHop, beatValleyLoop, beatSCurves, beatBigHop, beatSpikeSprint,
        beatSpringHop, beatHill, beatPitHop, beatValleyLoop, beatFlatBoost, beatBigHop,
        beatHill, beatPitHop],
    // SKY LOOP — rings are load-bearing here; no tail rings, no tail spikes
    [beatFlatBoost, beatValleyLoop, beatBigHop, beatSCurves, beatHill, beatSpringHop,
        beatPitHop, beatValleyLoop, beatBigHop, beatHill, beatSCurves, beatSpringHop,
        beatPitHop, beatValleyLoop, beatFlatBoost, beatBigHop, beatHill, beatSCurves,
        beatPitHop, beatHill],
]
// per-beat tweaks so neighbouring zones never share a shape
const TWEAKS = [
    {},
    { pitHop: [1150, 120], bigHop: [180], hill: [220, 1250, 1350], sCurves: [160] },
    { pitHop: [1150, 130], bigHop: [220, 950, 650], hill: [260, 1500, 1100], sCurves: [150], springHop: [260] },
]
const TWEAKED = (fn, zi) => {
    const tune = { beatPitHop: 'pitHop', beatBigHop: 'bigHop', beatHill: 'hill', beatSCurves: 'sCurves', beatSpringHop: 'springHop' }[fn.name]
    const args = TWEAKS[zi]?.[tune]
    return args ? (x, y) => fn(x, y, ...args) : fn
}

// append each zone's program and push its goal to the end, so the autopilot
// spends 60-90s in a sector on all-different terrain.
for (const [zi, z] of ZONES.entries()) {
    if (!z.loops) z.loops = []
    const last = z.segs[z.segs.length - 1]
    let x = last[2], y = last[3]
    const tailX = x, tailY = y
    for (const beat of PROGRAMS[zi]) {
        const b = TWEAKED(beat, zi)(x, y)
        z.segs.push(...b.segs)
        if (b.boosts) z.boosts.push(...b.boosts)
        if (b.rings && zi !== 2) z.rings.push(...b.rings)   // zone 2's rings stay on its loop arc
        if (b.spikes) z.spikes.push(...b.spikes)
        if (b.springs) z.springs.push(...b.springs)
        if (b.hover) z.drones.push(b.hover)
        if (b.loop) z.loops.push(b.loop)
        x = b.x1
    }
    z.goal = x - 20

    // the fork (#550): above the first fastBoost stretch — AFTER its sprint
    // strip, so committing means you carried (or made) speed there. The deck
    // overlaps the low line's x; its ramps start and end exactly ON the low
    // height, so the commit and the rejoin are continuous, never teleports.
    // #627: the ramps are quarter-pipe arcs (steep launch, flat landing), not
    // straight boards — same run and rise, sampled on a circle tangent-flat
    // at the top. The commit window is fx..fx+FORK_RAMP (the arc's run).
    const fx = tailX + 1560, fy = tailY, hy = fy - FORK_DY
    const hx = fx + FORK_RAMP
    const rR = (FORK_RAMP * FORK_RAMP + FORK_DY * FORK_DY) / (2 * FORK_DY)
    const rPh = Math.acos(1 - FORK_DY / rR)
    const up = [], dn = []
    for (let k = 0; k < 4; k++) {
        const p0 = rPh * k / 4, p1 = rPh * (k + 1) / 4
        up.push([hx - rR * Math.sin(rPh - p0), hy + rR * (1 - Math.cos(rPh - p0)),
            hx - rR * Math.sin(rPh - p1), hy + rR * (1 - Math.cos(rPh - p1))])
        dn.push([hx + FORK_PLAT + rR * Math.sin(p0), hy + rR * (1 - Math.cos(p0)),
            hx + FORK_PLAT + rR * Math.sin(p1), hy + rR * (1 - Math.cos(p1))])
    }
    z.routes = {
        high: [...up, [hx, hy, hx + FORK_PLAT, hy], ...dn],
    }
    // the fast lane's payoff: six rings only a high-route body passes through
    z.highRings = [0, 1, 2, 3, 4, 5].map(i => [hx + 40 + i * 100, hy - 14])
}

export function segAt(z, x) {
    for (const sgm of z.segs) if (x >= sgm[0] && x <= sgm[2]) return sgm
    return null
}
export function segAtRoute(z, x, route = 'low') {
    if (route === 'high' && z.routes) {
        for (const sgm of z.routes.high) if (x >= sgm[0] && x <= sgm[2]) return sgm
    }
    return segAt(z, x)
}
export function groundY(z, x, route = 'low') {
    const sgm = segAtRoute(z, x, route)
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

// Drone position is a pure function of the tick — the patrol is a triangle
// wave over its span, the hover bobs. No per-drone state, so a death/respawn
// never desyncs them and the renderer can draw them from the same math.
export function dronePos(g, i) {
    const z = ZONES[g.zone]
    const d = z.drones[i]
    if (d.kind === 'hover') {
        return { x: d.x, y: d.y + HOVER_BOB * Math.sin(g.tick * 0.15) }
    }
    const span = d.x1 - d.x0
    const u = (g.tick * DRL_SPEED / span) % 2
    const f = u < 1 ? u : 2 - u
    const x = d.x0 + f * span
    return { x, y: groundY(z, x) - DRONE_R }
}

// ---------------------------------------------------------------- physics ----

// a legit landing on the tick it crosses ground dips at most ~vy*dt + slope*dt
// below the surface (< 45px); anything deeper arriving over a hole came in
// BELOW the far lip — that is a wall strike, not a landing (#641).
const WALL_TOL = 48

function toAir(g, theta, jump = 0) {
    const p = g.p
    p.mode = 'air'
    p.hole = false
    p.vx = p.s * Math.cos(theta)
    p.vy = p.s * Math.sin(theta) - jump
    p.cut = false
    p.rolling = false
}

function die(g, why) {
    g.ev.push({ type: 'die', why })
    g.deaths++
    g.rings = 0
    g.scatter = []
    const z = ZONES[g.zone]
    const sx = (CFG.checkpointSaves && g.save.zone === g.zone) ? g.save.x : z.segs[0][0] + 40
    g.p.x = sx
    g.p.y = groundY(z, sx)
    g.p.route = 'low'
    g.p.mode = 'track'
    g.p.hole = false
    g.p.s = 0; g.p.vx = 0; g.p.vy = 0
    g.p.rolling = false
    g.p.invuln = 90
    g.ev.push({ type: 'respawn', x: sx })
}

// A hazard that staggers instead of kills: shed the rings you hold into the
// fixed forward fan (ringScatter) so a fast player can scoop them back, and
// drop a bit of momentum. Spikes and drones both call this.
function stagger(g, why) {
    const p = g.p
    const lost = g.rings
    g.ev.push({ type: 'hit', why, lost })
    g.rings = 0
    p.s *= 0.75
    if (p.mode === 'air') {
        const z2 = ZONES[g.zone]
        const gy = groundY(z2, p.x)
        const sgm = gy === null ? null : segAtRoute(z2, p.x)
        if (sgm && !(CFG.pitWalls && p.hole && p.y > sgm[1] + WALL_TOL)) { p.y = gy; p.s = p.vx * 0.75; p.mode = 'track'; p.hole = false }
    }
    p.invuln = 70
    if (CFG.ringScatter) {
        const n = Math.min(lost, SCATTER_MAX)
        g.scatter = []
        for (let i = 0; i < n; i++) {
            const [ox, oy] = SCATTER_FAN[i]
            g.scatter.push({ x: p.x + ox, y: (p.y - BODY_R) + oy, until: g.tick + SCATTER_LIFE })
        }
    }
}

export function step(g, inp) {
    const p = g.p
    const z = ZONES[g.zone]
    g.ev.length = 0
    g.tick++
    if (g.end) return g

    if (p.invuln > 0) p.invuln--

    maybeRouteFork(g)

    if (p.mode === 'track') {
        const sgm = segAtRoute(z, p.x, p.route)
        if (!sgm) { toAir(g, p.lastTheta || 0); }
        else {
            const th = segAngle(sgm)
            p.lastTheta = th
            const rolling = CFG.roll && !!inp.down && Math.abs(p.s) >= ROLL_MIN
            p.rolling = rolling
            let a = 0
            if (CFG.slopeDrive) a += G * Math.sin(th)
            if (!rolling) {
                if (inp.right) a += p.s < RUN_TOP ? RUN_ACCEL : 140
                if (inp.left) a -= p.s > 0 ? BRAKE : RUN_ACCEL
            }
            if (CFG.boostPads) for (const b of z.boosts) if (p.x >= b[0] && p.x <= b[1]) a += BOOST_ACCEL
            a -= (rolling ? ROLL_DRAG_ROLL : ROLL_DRAG) * p.s
            p.s = Math.max(-200, Math.min(VMAX, p.s + a * FIXED_DT))
            p.x += p.s * Math.cos(th) * FIXED_DT
            const gy = groundY(z, p.x, p.route)
            if (gy === null) { toAir(g, th) }
            else {
                p.y = gy
                // spring pads fire on touch — the one input-free verb
                if (CFG.springLaunch && p.route === 'low') {
                    for (const sp of z.springs) {
                        if (Math.abs(p.x - sp[0]) < 16 && Math.abs(p.y - sp[1]) < 20 && g.tick > (g.spent.get(sp) || -99)) {
                            g.spent.set(sp, g.tick)
                            p.mode = 'air'; p.cut = false; p.hole = false
                            p.vx = p.s * Math.cos(th); p.vy = sp[2]
                            g.ev.push({ type: 'spring', x: sp[0] })
                        }
                    }
                }
            }
        }
        if (p.mode === 'track' && inp.jumpEdge) {
            const sgm2 = segAtRoute(z, p.x, p.route)
            if (sgm2) { toAir(g, segAngle(sgm2), JUMP_V); g.ev.push({ type: 'jump' }) }
        }
    } else if (p.mode === 'air') {
        p.vy = Math.min(1500, p.vy + G * FIXED_DT)
        if (inp.right) p.vx = Math.min(VMAX, p.vx + AIR_ACCEL * FIXED_DT)
        if (inp.left) p.vx = Math.max(-300, p.vx - AIR_ACCEL * FIXED_DT)
        if (inp.jumpCut && CFG.jumpCut && !p.cut && p.vy < -80) { p.vy *= JUMP_CUT; p.cut = true }
        p.x += p.vx * FIXED_DT
        p.y += p.vy * FIXED_DT
        const gy = groundY(z, p.x, p.route)
        if (gy === null) p.hole = true
        if (gy !== null && p.y >= gy) {
            const sgm = segAtRoute(z, p.x, p.route)
            if (CFG.pitWalls && p.hole && p.y > sgm[1] + WALL_TOL) {
                // arrived below the far lip — the pit's wall stops the forward
                // motion; the body rides the face down and gravity finishes
                // the job at deathY. No climbing out.
                p.x = Math.min(p.x, sgm[0] - 0.5)
                p.vx = 0
                g.ev.push({ type: 'wall', x: Math.round(p.x) })
            } else {
                p.y = gy
                const th = segAngle(sgm)
                p.s = CFG.landProject ? p.vx * Math.cos(th) + p.vy * Math.sin(th) : p.vx
                p.s = Math.max(-200, Math.min(VMAX, p.s))
                p.mode = 'track'
                p.hole = false
                g.ev.push({ type: 'land', x: Math.round(p.x) })
            }
        } else if (p.y > z.deathY) {
            if (CFG.pitDeath) die(g, 'pit')
            else { p.y = z.deathY - 1; p.vy = 0 }
        }
    } else if (p.mode === 'loop') {
        const L = z.loops[g.activeLoopIdx]
        // energy along the circle; phi measured from the bottom, screen y-down
        const v2 = Math.max(0, p.v0 * p.v0 - 2 * G * L.r * (1 - Math.cos(p.phi)))
        // inside the loop the track's normal force is N = v^2/r + g*cos(phi):
        // it releases near the APEX (upper half, cos<0) once v^2 < -g*r*cos,
        // which is exactly why the entry floor is v^2 >= 5*g*r (top: v^2>=g*r).
        if (CFG.loopContact && Math.cos(p.phi) < 0 && v2 < -G * L.r * Math.cos(p.phi)) {
            // peeled off the wall before the apex — a real fall, no loop, no apex rings
            const v = Math.sqrt(v2)
            p.mode = 'air'; p.cut = false; p.hole = false
            p.x = L.cx + L.r * Math.sin(p.phi)
            p.y = L.cy + L.r * Math.cos(p.phi)
            p.vx = v * Math.cos(p.phi); p.vy = -v * Math.sin(p.phi)
            g.ev.push({ type: 'crash', idx: g.activeLoopIdx })
        } else {
            p.phi += Math.sqrt(v2) / L.r * FIXED_DT
            if (p.phi >= Math.PI * 2) {
                p.mode = 'track'
                p.x = L.cx; p.y = L.cy + L.r
                p.s = Math.sqrt(v2)
                p.lastTheta = 0
                g.loopTaken = true
                g.score += 500
                g.ev.push({ type: 'loop', v: Math.round(p.s), idx: g.activeLoopIdx, r: L.r })
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
    // the high deck's rings: reachable only from the fast lane (the low line
    // passes UNDER them), so the speed gamble at the fork is what pays.
    if (CFG.routeFork && z.highRings && p.route === 'high') {
        for (let i = 0; i < z.highRings.length; i++) {
            if (g.taken.has(zoneRing(g.zone, 60 + i))) continue
            const [rx, ry] = z.highRings[i]
            const dx = p.x - rx, dy = (p.y - BODY_R) - ry
            if (dx * dx + dy * dy < (RING_R + BODY_R) * (RING_R + BODY_R)) {
                g.taken.add(zoneRing(g.zone, 60 + i))
                g.rings++; g.score += 10
                g.ev.push({ type: 'ring', x: rx, high: true })
            }
        }
    }
    // shed rings: the fixed fan from the last hit, pickable for SCATTER_LIFE
    for (let i = g.scatter.length - 1; i >= 0; i--) {
        const r = g.scatter[i]
        if (g.tick > r.until) { g.scatter.splice(i, 1); continue }
        const dx = p.x - r.x, dy = (p.y - BODY_R) - r.y
        if (dx * dx + dy * dy < (RING_R + BODY_R) * (RING_R + BODY_R)) {
            g.scatter.splice(i, 1)
            g.rings++; g.score += 10
            g.ev.push({ type: 'ring', x: r.x })
        }
    }
    if (p.invuln === 0) {
        for (const sp of z.spikes) {
            const grounded = p.mode === 'track' || (p.mode === 'air' && p.y >= (groundY(z, p.x) ?? 1e9) - 2)
            if (p.x >= sp[0] && p.x <= sp[1] && grounded) {
                if (g.rings > 0 && CFG.ringsProtect) stagger(g, 'spikes')
                else die(g, 'spikes')
                break
            }
        }
        if (!g.end && CFG.drones && p.invuln === 0 && z.drones) {
            for (let i = 0; i < z.drones.length; i++) {
                const k = g.zone * 100 + i
                if (g.droneDown.has(k)) continue
                const d = dronePos(g, i)
                const dx = p.x - d.x, dy = (p.y - BODY_R) - d.y
                if (dx * dx + dy * dy < (DRONE_R + BODY_R) * (DRONE_R + BODY_R)) {
                    if (p.mode === 'air' || p.rolling) {
                        // a jumping or rolling body blows the drone away
                        g.droneDown.add(k)
                        g.score += 200
                        g.ev.push({ type: 'drone', x: d.x, y: d.y })
                    } else if (g.rings > 0 && CFG.ringsProtect) stagger(g, 'drone')
                    else die(g, 'drone')
                    break
                }
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
                if (CFG.zoneTally) {
                    const tInZone = g.tick - g.zoneStartTick
                    const timeBonus = Math.max(0, TALLY_TIME_CAP - tInZone) * TALLY_TIME_RATE
                    const ringBonus = g.rings * TALLY_RING_RATE
                    g.ev.push({ type: 'tally', zone: g.zone, time: timeBonus, rings: ringBonus, total: timeBonus + ringBonus })
                    g.score += timeBonus + ringBonus
                }
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
                    g.p.route = 'low'
                    g.spent = new Map()
                    g.scatter = []   // shed rings don't carry between sectors
                    g.loopTaken = false; g.loopsTaken = new Set(); g.activeLoopIdx = -1
                    g.zoneStartTick = g.tick
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
        loopsTaken: new Set(), activeLoopIdx: -1,
        zoneStartTick: 0,
        save: { zone: 0, x: z.segs[0][0] + 40 },
        taken: new Set(), spent: new Map(), droneDown: new Set(), ev: [],
        scatter: [],
        p: { x: z.segs[0][0] + 40, y: groundY(z, z.segs[0][0] + 40), mode: 'track', route: 'low', hole: false, s: 0, vx: 0, vy: 0, invuln: 0, cut: false, lastTheta: 0, v0: 0, phi: 0, rolling: false },
    }
}

// ONE entry rule, used identically by the planner, the replay and the shell.
// The runner is grounded, moving along flat floor, at/after an untaken loop's
// mouth, and the floor height equals that circle's bottom. A zone may hold
// SEVERAL loops (the loops list); the body commits to the first untaken one
// whose mouth it reaches. With multiLoop off only the first is honoured.
export function maybeEnterLoop(g) {
    const z = ZONES[g.zone], p = g.p
    const all = z.loops || []
    const loops = CFG.multiLoop ? all : all.slice(0, 1)
    if (!loops.length || p.mode !== 'track') return false
    for (let i = 0; i < loops.length; i++) {
        const L = loops[i]
        const key = g.zone * 100 + i
        if (g.loopsTaken.has(key)) continue
        if (p.x >= L.cx && p.lastTheta === 0 && Math.abs(p.y - (L.cy + L.r)) < 0.5) {
            g.p.mode = 'loop'; g.p.phi = 0; g.p.v0 = g.p.s
            g.p.x = L.cx; g.p.y = L.cy + L.r
            g.activeLoopIdx = i
            g.loopsTaken.add(key)
            g.loopTaken = true
            return true
        }
    }
    return false
}

// ONE fork rule, used identically by the sim (every tick), the planner and the
// gate. Commit: grounded, slow line, mouth of the ramp, speed at/above the
// gate — speed is the currency that opens the fast lane. Rejoin: past the
// off-ramp's end the deck hands you back to the low line at the same height,
// so the route change is a surface transition, not a teleport.
export function maybeRouteFork(g) {
    const z = ZONES[g.zone], p = g.p
    const f = z.routes && z.routes.high
    if (!f) return false
    if (p.route === 'low') {
        if (!CFG.routeFork || p.mode !== 'track') return false
        if (p.x >= f[0][0] && p.x <= f[0][0] + FORK_RAMP && p.s >= FORK_SPEED) {
            p.route = 'high'
            p.y = groundY(z, p.x, 'high')
            p.lastTheta = segAngle(segAtRoute(z, p.x, 'high'))
            g.ev.push({ type: 'fork', route: 'high', x: Math.round(p.x) })
            return true
        }
    } else if (p.mode === 'track' && p.x > f[f.length - 1][2]) {
        p.route = 'low'
        const gy = groundY(z, p.x, 'low')
        if (gy !== null) p.y = gy
        p.lastTheta = segAngle(segAt(z, p.x))
        g.ev.push({ type: 'fork', route: 'low', x: Math.round(p.x) })
        return true
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
    // integrate the SAME air math (wall rule included); returns x at first
    // landing, or null — a wall strike is not a landing
    let px = x, py = y, tvx = vx, tvy = vy, hole = false
    for (let t = 0; t < 130; t++) {
        tvy = Math.min(1500, tvy + G * FIXED_DT)
        tvx = Math.min(VMAX, tvx + AIR_ACCEL * FIXED_DT)
        px += tvx * FIXED_DT; py += tvy * FIXED_DT
        const gy = groundY(z, px)
        if (gy === null) { hole = true } else if (py >= gy) {
            if (CFG.pitWalls && hole && py > segAt(z, px)[1] + WALL_TOL) return null
            return { x: px, y: gy }
        }
        if (py > z.deathY) return null
    }
    return null
}

// planRun(g0): the greedy policy from any state. Default = a fresh game (the
// attract proof). DebugKit's PROGNOSIS passes a CLONE of the live game so the
// question it answers is "can this still be won from HERE?".
export function planRun(g0) {
    const g = g0 || makeGame()
    const script = []
    const receipt = {
        gaps: [], loops: [], hits: 0, ringsAtHit: [], deaths: 0,
        springs: 0, drones: 0, warnings: [],
    }
    // the autopilot will not commit to a jump unless its own ballistic
    // lookahead lands this far past the far lip — so every gap in the receipt
    // is a proven clearance, and runnercheck re-measures it on the real body.
    const MARGIN = 24
    let jumpAt = -1           // tick index where the queued jump fires
    let pending = null        // { holeFar } the jump must clear
    for (let t = 0; t < 60 * 400; t++) {
        const z = ZONES[g.zone]
        const p = g.p
        const inp = { right: true }
        if (p.mode === 'track' && jumpAt < 0) {
            // The loop is the ROUTE, not scenery: never jump the mouth of a
            // loop this run has not yet taken. Its far-spike rings live on the
            // apex arc (only the inside of the loop reaches them), so jumping
            // the mouth would strand the runner ringless on the far side.
            const skipLoop = (z.loops || []).some((L, i) => !g.loopsTaken.has(g.zone * 100 + i) && p.x >= L.cx - 340)
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
                        let a = (CFG.slopeDrive ? G * Math.sin(th) : 0)
                            + (ss < RUN_TOP ? RUN_ACCEL : 140) - ROLL_DRAG * ss
                        if (CFG.boostPads) for (const b of z.boosts) if (sx >= b[0] && sx <= b[1]) a += BOOST_ACCEL
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
            if (e.type === 'drone') receipt.drones++
            if (e.type === 'land' && pending) {
                receipt.gaps.push({ far: pending.far, landed: e.x, margin: e.x - pending.far })
                pending = null
            }
            if (e.type === 'loop') receipt.loops.push({ entryV2: g.p.v0 * g.p.v0, exitV: e.v, need: loopRequire(e.r), idx: e.idx, zone: g.zone, tick: t })
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
        p.mode[0], p.route === 'high' ? 'H' : 'L', Math.round((p.s || 0) * 2 + (p.vx || 0)), Math.round(p.vy * 2),
        g.rings, g.score, g.deaths, g.droneDown.size, g.scatter.length].join(':')
}
