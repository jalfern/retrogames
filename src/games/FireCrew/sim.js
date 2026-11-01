// FIRE CREW — the pure heart (#1254). Grid world: fire spreads cell-by-cell
// biased by a shifting wind, floors burn out and collapse into holes, smoke
// swallows the interior, and the three seats see different things. Pure and
// seeded: mulberry32 lives here, every random the SIM consumes derives from
// the seed — Math.random() may never touch this file (determinism law).
//
// Seats: 1 HOSE (spray, hydrant, flare) · 2 RESCUE (grab, carry, climb)
//        · 3 LADDER (raise/lower the stick, brace in gales).
// Any seat can be human / cpu / model — the AI below is a deterministic pure
// function of (state, tick), which is also what makes the attract demo and the
// harness autopilot the same code path.

export const W = 30
export const H = 20
export const T = 16
export const CLOCK = 7200 // 2:00 of structure time
export const VICTIMS = 6

// tile kinds
export const EMPTY = 0 // walkable floor
export const WALL = 1 // structural — burns black, never collapses
export const FUEL = 2 // burnable furniture/floor — can collapse into a hole
export const OUT = 3 // solid wall, never burns
export const STREET = 4 // safe zone outside

export const LOFT_Y0 = 1
export const LOFT_Y1 = 4
export const LADDER_X = 15
export const HYDRANT = { x: 4, y: 17 }
export const AMBULANCE = { x0: 23, x1: 26, y0: 17, y1: 18 }
export const ENGINE = { x: 14, y: 17 }

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]] // E S W N
const CALM = -1

export function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// --- world generation -------------------------------------------------------

export function makeRun(seed) {
    const rng = mulberry32(seed >>> 0)
    const at = (x, y) => y * W + x
    const tile = new Array(W * H).fill(EMPTY)
    const cell = new Array(W * H).fill(null) // fire state for burnables

    // outer shell of the warehouse
    for (let x = 0; x < W; x++) { tile[at(x, 0)] = OUT; tile[at(x, 15)] = OUT }
    for (let y = 0; y <= 15; y++) { tile[at(0, y)] = OUT; tile[at(W - 1, y)] = OUT }
    // street
    for (let y = 16; y < H; y++) for (let x = 0; x < W; x++) tile[at(x, y)] = STREET

    // interior structural walls with doorways
    const wall = (x0, y0, x1, y1, gaps) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            if (!gaps.some(([gx, gy]) => gx === x && gy === y)) tile[at(x, y)] = WALL
        }
    }
    wall(9, 5, 9, 10, [[9, 7]])
    wall(20, 5, 20, 10, [[20, 8]])
    wall(9, 10, 20, 10, [[13, 10], [17, 10]])
    wall(5, 5, 5, 10, [[5, 8]])
    wall(24, 11, 24, 14, [[24, 13]])
    // front doorway (the way in/out)
    tile[at(14, 15)] = EMPTY
    tile[at(15, 15)] = EMPTY

    // loft floor is walkable above everything at rows LOFT_Y0..LOFT_Y1; a
    // handful of support pillars and scattered crates up there
    for (let x = 1; x < W - 1; x++) for (let y = LOFT_Y0; y <= LOFT_Y1; y++) {
        tile[at(x, y)] = FUEL // loft decking burns and can open holes
        cell[at(x, y)] = { fuel: 70, heat: 0, burning: false, out: false }
    }
    for (let x = 4; x < W - 1; x += 7) for (let y = LOFT_Y0 + 1; y <= LOFT_Y1 - 1; y += 2) tile[at(x, y)] = WALL

    // ground-floor furniture: seeded patches of fuel
    for (let x = 2; x < W - 2; x++) for (let y = LOFT_Y1 + 1; y <= 14; y++) {
        if (tile[at(x, y)] !== EMPTY) continue
        if (rng() < 0.16) {
            tile[at(x, y)] = FUEL
            cell[at(x, y)] = { fuel: 60 + Math.floor(rng() * 40), heat: 0, burning: false, out: false }
        }
    }

    // fire origins: 2-3 low on the ground floor, sometimes one in the loft
    const origins = []
    const freeFloor = (y0, y1) => {
        for (let tries = 0; tries < 200; tries++) {
            const x = 2 + Math.floor(rng() * (W - 4))
            const y = y0 + Math.floor(rng() * (y1 - y0 + 1))
            if (tile[at(x, y)] === FUEL && !origins.some((o) => o.x === x && o.y === y)) return { x, y }
        }
        return null
    }
    origins.push(freeFloor(11, 14), freeFloor(6, 9))
    if (rng() < 0.7) origins.push({ x: 1 + Math.floor(rng() * (W - 2)), y: LOFT_Y0 + 1 + Math.floor(rng() * 2) })
    for (const o of origins) {
        if (!o) continue
        const c = cell[at(o.x, o.y)]
        if (c) { c.heat = 100; c.burning = true }
    }

    // victims: seeded spots, 1-2 of them in the loft so the ladder matters
    const victims = []
    const placeVictim = (loft) => {
        for (let tries = 0; tries < 400; tries++) {
            const x = 2 + Math.floor(rng() * (W - 4))
            const y = loft ? LOFT_Y0 + Math.floor(rng() * (LOFT_Y1 - LOFT_Y0 + 1)) : 6 + Math.floor(rng() * 9)
            const t = tile[at(x, y)]
            const c = cell[at(x, y)]
            if ((t === EMPTY || (t === FUEL && c && !c.burning && c.heat < 40)) &&
                !victims.some((v) => v.x === x && v.y === y)) { victims.push(victim(x, y)); return }
        }
    }
    placeVictim(true); placeVictim(rng() < 0.5)
    for (let i = victims.length; i < VICTIMS; i++) placeVictim(false)

    const wind = { dir: Math.floor(rng() * 4), gust: rng() < 0.3 ? 2 : rng() < 0.5 ? 1 : 0, next: 900 + Math.floor(rng() * 600) }

    const firefighter = (seat, x, y, kind) => ({
        seat, kind, x, y, fx: x, fy: y, face: 3, moving: 0, tank: 100, battery: 100, flareT: 0,
        knocks: 0, downT: 0, hurtT: 0, carrying: null, climbT: 0, invulnT: 90,
    })

    const g = {
        seed: seed >>> 0, tick: 0, rng: mulberry32((seed ^ 0x9e3779b9) >>> 0),
        tile, cell, victims, wind,
        ladder: 0, // 0..1 raised fraction
        ladderNeed: false, braceHeld: false, slipT: 0,
        crew: [firefighter(1, 14, 18, 'hose'), firefighter(2, 16, 18, 'rescue'), firefighter(3, 13, 18, 'ladder')],
        flares: [], drops: [], embers: [],
        rescued: 0, lost: 0, doused: 0, score: 0,
        searchSeen: new Set(),
        done: false, win: false, message: '', messageT: 0,
        // radio (#1361): external calls, like pads — never from the rng.
        // sweep: the flashlight call lights one side (the lightAt rule finds
        // what it reveals); voiceLadder/radioHoldT drive the CPU seats.
        sweep: null, voiceLadder: null, radioHoldT: 0,
        players: 1, sources: ['human', 'cpu', 'cpu'],
    }
    return g
}

export function setSources(g, sources) {
    g.sources = sources.slice(0, 3)
    while (g.sources.length < 3) g.sources.push('cpu')
    return g
}

function victim(x, y) {
    return { x, y, loft: y <= LOFT_Y1, state: 'hidden', wave: 0, panic: 0 }
}

// --- helpers ---------------------------------------------------------------

export const inLoft = (y) => y <= LOFT_Y1

const walkable = (g, x, y, loftOK) => {
    if (x < 1 || y < 0 || x >= W - 1 || y >= H) return false
    const i = y * W + x
    if (g.cell[i] && g.cell[i].gone) return false // a collapsed hole swallows any tile
    if (y <= LOFT_Y1) {
        if (!loftOK) return false
        if (g.tile[i] === WALL || g.tile[i] === OUT) return false
        return true
    }
    if (y >= 16) return true // street always safe
    const t = g.tile[i]
    if (t === WALL || t === OUT) return false
    return true
}

const heatAt = (g, x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return 0
    const c = g.cell[y * W + x]
    return c ? c.heat : 0
}

const burningAt = (g, x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false
    const c = g.cell[y * W + x]
    return !!c && c.burning
}

export function isDown(g, f) { return f.downT > 0 }

const seatPad = (pad, pads, seat) => (Array.isArray(pads) ? pads[seat - 1] || {} : seat === 1 ? pad || {} : {})

// BFS over the walkable grid avoiding fire (cost-weighted). Returns the next
// step toward the target, or null.
export function stepToward(g, x, y, tx, ty, loftOK) {
    if (x === tx && y === ty) return null
    const dist = new Int16Array(W * H).fill(-1)
    const q = [[tx, ty]]
    dist[ty * W + tx] = 0
    const back = new Int16Array(W * H).fill(-1)
    let head = 0
    const here = y * W + x
    while (head < q.length) {
        const [cx, cy] = q[head++]
        const ci = cy * W + cx
        for (const d of DIRS) {
            const nx = cx + d[0]; const ny = cy + d[1]
            if (!walkable(g, nx, ny, loftOK)) continue
            if (inLoft(cy) !== inLoft(ny) && !(nx === LADDER_X && g.ladder > 0.9)) continue
            const ni = ny * W + nx
            if (dist[ni] >= 0) continue
            const h = heatAt(g, nx, ny)
            if (h > 55) continue // crews will not walk into flame
            dist[ni] = dist[ci] + 1 + Math.floor(h / 8)
            back[ni] = ci
            q.push([nx, ny])
        }
    }
    if (dist[here] < 0) return null
    const p = back[here] // BFS grew from the target: the parent IS the next step
    if (p < 0) return null
    return { x: p % W, y: (p / W) | 0 }
}

// --- fire ------------------------------------------------------------------

function windBias(g, dx, dy) {
    if (g.wind.dir === CALM) return 1
    const d = DIRS[g.wind.dir]
    if (d[0] === dx && d[1] === dy) return 2.4 + g.wind.gust
    if (d[0] === -dx && d[1] === -dy) return 0.35
    return 1
}
export { windBias }

function spreadAndBurn(g) {
    const rng = g.rng
    if (g.tick % 2) return // fire chemistry runs at 30 Hz
    const next = []
    for (let i = 0; i < W * H; i++) {
        const c = g.cell[i]
        if (!c) continue
        if (c.burning) {
            c.fuel -= 0.6 + g.wind.gust * 0.15
            if (c.fuel <= 0) {
                c.burning = false; c.heat = 0; c.gone = true
                g.tile[i] = g.tile[i] === FUEL ? EMPTY : g.tile[i]
            }
            const x = i % W; const y = (i / W) | 0
            for (const d of DIRS) {
                const nx = x + d[0]; const ny = y + d[1]
                if (nx < 1 || ny < 0 || nx >= W - 1 || ny > 14) continue
                const ni = ny * W + nx
                const n = g.cell[ni]
                if (!n || n.burning || n.gone || n.fuel <= 0) continue
                const p = 0.0034 * windBias(g, d[0], d[1]) * (n.fuel > 50 ? 1 : 1.4)
                if (rng() < p) next.push(ni)
            }
        } else if (c.heat > 0 && !c.out) {
            c.heat = Math.max(0, c.heat - 0.7)
            if (c.heat > 60 && c.fuel > 0) c.burning = true
        }
    }
    for (const ni of next) { g.cell[ni].heat = Math.max(g.cell[ni].heat, 40) }
}

function doWind(g) {
    if (g.tick < g.wind.next) return
    const rng = g.rng
    g.wind.dir = rng() < 0.18 ? CALM : Math.floor(rng() * 4)
    g.wind.gust = rng() < 0.28 ? 2 : rng() < 0.5 ? 1 : 0
    g.wind.next = g.tick + 900 + Math.floor(rng() * 600)
}

// --- visibility (the information split) --------------------------------------
// Returns a per-tile light value 0..1 for drawing AND for the rules that ask
// "could THIS seat see that?".
// Which side of the house a radio sweep lights (see applyRadio).
export const sweepCovers = (side, x, y) => {
    if (side === 'west') return x < W / 2
    if (side === 'east') return x >= W / 2
    if (side === 'back') return y > LOFT_Y1 && y <= 7
    if (side === 'front') return y >= 11
    if (side === 'loft') return inLoft(y)
    return true // 'all' — the whole house
}

export function lightAt(g, x, y, seat) {
    if (y >= 16) return 1
    const raw = lightAtRaw(g, x, y, seat)
    // the radio's flashlight sweep: light the side called out, through the
    // same rule that finds victims and draws the darkness
    if (g.sweep && g.sweep.t > 0 && sweepCovers(g.sweep.side, x, y)) return Math.max(0.6, raw)
    return raw
}

function lightAtRaw(g, x, y, seat) {
    const i = y * W + x
    if (g.tile[i] === WALL || g.tile[i] === OUT) return 0.5
    if (g.cell[i] && g.cell[i].burning) return 1
    const f = g.crew[Math.max(0, seat - 1)]
    if (seat === 3) {
        // the ladder seat owns the loft window: above, everything is visible
        if (inLoft(y)) return g.ladder > 0.4 ? 0.9 : 0.35
        return f ? (Math.abs(f.x - x) + Math.abs(f.y - y) <= 3 ? 0.8 : 0.15) : 0.2
    }
    const cf = g.crew[0]; const rf = g.crew[1]; const lf = g.crew[2]
    let best = 0.08
    for (const fl of g.flares) if (Math.abs(fl.x - x) + Math.abs(fl.y - y) <= 8) best = Math.max(best, 0.95)
    if (cf && cf.seat === 1 && Math.abs(cf.x - x) + Math.abs(cf.y - y) <= 2) best = Math.max(best, 0.5)
    if (cf && !isDown(g, cf)) {
        const d = DIRS[cf.face]
        if (Math.sign(x - cf.x) === d[0] && d[0] !== 0 && Math.abs(y - cf.y) <= 1 && Math.abs(x - cf.x) <= 6) best = Math.max(best, 0.85)
        if (Math.sign(y - cf.y) === d[1] && d[1] !== 0 && Math.abs(x - cf.x) <= 1 && Math.abs(y - cf.y) <= 6) best = Math.max(best, 0.85)
    }
    if (rf && !isDown(g, rf) && Math.abs(rf.x - x) + Math.abs(rf.y - y) <= 3) best = Math.max(best, 0.8)
    if (lf && Math.abs(lf.x - x) + Math.abs(lf.y - y) <= 2) best = Math.max(best, 0.6)
    if (inLoft(y) && g.ladder > 0.4) best = Math.max(best, 0.35)
    return best
}

// --- crew actions ----------------------------------------------------------

function faceFrom(pad) {
    if (pad.left) return 2
    if (pad.right) return 0
    if (pad.up) return 3
    if (pad.down) return 1
    return null
}

function moveCrew(g, f, pad) {
    if (isDown(g, f)) { f.downT--; return }
    const d = faceFrom(pad)
    if (d !== null) f.face = d
    if (f.climbT > 0) return // mid-climb, movement pauses one beat
    const v = f.carrying ? 0.11 : 0.16
    let mx = 0; let my = 0
    if (pad.left) mx = -1
    if (pad.right) mx = 1
    if (pad.up) my = -1
    if (pad.down) my = 1
    if (!mx && !my) { f.moving = 0; return }
    if (mx && my) my = 0 // keep it grid-friendly: prefer horizontal
    f.fx += mx * v; f.fy += my * v
    const nx = Math.round(f.fx); const ny = Math.round(f.fy)
    const loftOK = f.seat === 2 || g.sources[f.seat - 1] === 'cpu'
    const allowed = (tx, ty) => {
        if (!walkable(g, tx, ty, loftOK)) return false
        if (inLoft(f.y) !== inLoft(ty)) {
            // crossing the loft line only at the ladder tile, only with the stick up
            if (tx !== LADDER_X || g.ladder < 0.9 || !loftOK) return false
        }
        return true
    }
    if (mx && allowed(nx, Math.round(f.fy))) f.x = nx
    else f.fx = f.x
    if (my && allowed(Math.round(f.fx), ny)) {
        f.y = ny
        if (inLoft(f.y) !== inLoft(ny)) f.climbT = 18 // animate the climb
    } else f.fy = f.y
    f.moving = (mx || my) ? f.moving + 1 : 0
    f.battery = Math.min(100, f.battery + 0.06)
    // fire damage
    if (burningAt(g, f.x, f.y) && f.invulnT <= 0) {
        f.hurtT = 20
        f.knocks++
        f.invulnT = 60
        if (f.knocks >= 3) {
            f.downT = 180; f.knocks = 0; f.x = ENGINE.x; f.y = ENGINE.y + 1
            f.fx = f.x; f.fy = f.y; f.carrying = null; f.invulnT = 120
            g.message = `CREW DOWN - SEAT ${f.seat} DRAGGED OUT`; g.messageT = 150
        }
    } else f.hurtT = Math.max(0, f.hurtT - 1)
    f.invulnT = Math.max(0, f.invulnT - 1)
    // hole underfoot
    const ci = f.y * W + f.x
    if (g.tile[ci] === FUEL && g.cell[ci] && g.cell[ci].gone) {
        if (f.carrying) { f.carrying.state = 'lost'; g.lost++; f.carrying = null; g.message = 'VICTIM LOST THROUGH THE FLOOR'; g.messageT = 150 }
        f.x = ENGINE.x; f.y = ENGINE.y + 1; f.fx = f.x; f.fy = f.y
        f.knocks++; f.invulnT = 90
    }
}

function hydrantNear(f) { return Math.abs(f.x - HYDRANT.x) + Math.abs(f.y - HYDRANT.y) <= 1 }
function ambulanceAt(x, y) { return y >= AMBULANCE.y0 && y <= AMBULANCE.y1 && x >= AMBULANCE.x0 && x <= AMBULANCE.x1 }

function crewA(g, f, pad) {
    if (isDown(g, f)) return
    if (f.kind === 'hose' || f.seat === 1) {
        if (pad.a && f.tank > 0 && !hydrantNear(f)) {
            f.tank = Math.max(0, f.tank - 0.55)
            const d = DIRS[f.face]
            for (let r = 1; r <= 3; r++) {
                const x = f.x + d[0] * r; const y = f.y + d[1] * r
                if (inLoft(y)) continue
                const c = g.cell[y * W + x]
                if (c && !c.gone && c.heat > 0) {
                    c.heat = Math.max(0, c.heat - 16)
                    if (c.burning && c.heat <= 25) { c.burning = false; c.out = true; g.doused++ }
                    if (!c.burning && c.heat <= 5) c.out = true
                }
            }
            g.drops.push({ x: f.x + d[0] * 2, y: f.y + d[1] * 2, t: 8 })
        }
        if (hydrantNear(f)) f.tank = Math.min(100, f.tank + 1.4)
        if (pad.b && f.battery >= 30) { f.battery -= 30; g.flares.push({ x: f.x, y: f.y, t: 220 }) }
    }
    if (f.kind === 'rescue' || f.seat === 2) {
        if (pad.b && !f.carrying) {
            const v = g.victims.find((v) => v.state !== 'rescued' && v.state !== 'lost' && v.x === f.x && v.y === f.y)
            if (v) { v.state = 'carried'; f.carrying = v }
        }
        if (pad.b && f.carrying) {
            if (ambulanceAt(f.x, f.y)) { f.carrying.state = 'rescued'; g.rescued++; f.carrying = null; f.knocks = 0; g.message = 'VICTIM TO THE AMBULANCE +1000'; g.messageT = 90 }
            else { f.carrying.state = 'found'; f.carrying = null }
        }
    }
    if (f.kind === 'ladder' || f.seat === 3) {
        if (pad.a) g.ladder = Math.min(1, g.ladder + 0.02)
        if (pad.b) g.ladder = Math.max(0, g.ladder - 0.03)
        g.braceHeld = !!pad.a && g.wind.gust === 2
    }
}

// auto pickup/drop keeps phone play fluid (A is spray on the shared pad)
function autoCarry(g) {
    const rf = g.crew[1]
    if (isDown(g, rf) || rf.carrying) return
    const v = g.victims.find((v) => v.state === 'found' && v.x === rf.x && v.y === rf.y)
    if (v) { v.state = 'carried'; rf.carrying = v }
}
function autoDrop(g) {
    const rf = g.crew[1]
    if (rf.carrying && ambulanceAt(rf.x, rf.y)) { rf.carrying.state = 'rescued'; g.rescued++; rf.carrying = null; rf.knocks = 0; g.message = 'VICTIM TO THE AMBULANCE +1000'; g.messageT = 90 }
}

// --- deterministic CPU ------------------------------------------------------

function cpuHose(g) {
    const f = g.crew[0]
    const pad = {}
    const drive = (nx) => {
        if (!nx) return false
        if (nx.x < f.x) pad.left = true
        if (nx.x > f.x) pad.right = true
        if (nx.y < f.y) pad.up = true
        if (nx.y > f.y) pad.down = true
        return true
    }
    if (hydrantNear(f) && f.tank < 95) return pad // wait at the hydrant
    if (f.tank < 25) { drive(stepToward(g, f.x, f.y, HYDRANT.x, HYDRANT.y, false)); return pad }
    // nearest fire reachable on this floor
    let fire = null; let bestD = 1e9
    for (let i = 0; i < W * H; i++) {
        const c = g.cell[i]
        if (!c || (!c.burning && c.heat < 30) || c.gone) continue
        const x = i % W; const y = (i / W) | 0
        if (inLoft(y)) continue
        const d = Math.abs(f.x - x) + Math.abs(f.y - y)
        if (d < bestD) { bestD = d; fire = { x, y } }
    }
    if (!fire) return pad
    const d = DIRS[f.face]
    const inFront = (tx, ty) => {
        const dx = tx - f.x; const dy = ty - f.y
        return Math.abs(dx) + Math.abs(dy) <= 3 &&
            ((d[0] !== 0 && Math.sign(dx || d[0]) === d[0] && dy === 0) || (d[1] !== 0 && Math.sign(dy || d[1]) === d[1] && dx === 0))
    }
    if (inFront(fire.x, fire.y)) { pad.a = true; return pad }
    // walk to the best stand-and-spray cell beside the fire
    let spot = null; let spotD = 1e9
    for (const dd of DIRS) {
        const sx = fire.x + dd[0]; const sy = fire.y + dd[1]
        if (!walkable(g, sx, sy, false) || burningAt(g, sx, sy)) continue
        const dd2 = Math.abs(f.x - sx) + Math.abs(f.y - sy)
        if (dd2 < spotD) { spotD = dd2; spot = { x: sx, y: sy } }
    }
    if (spot) drive(stepToward(g, f.x, f.y, spot.x, spot.y, false))
    return pad
}

function cpuRescue(g) {
    const f = g.crew[1]
    const pad = {}
    const drive = (nx) => {
        if (!nx) return
        if (nx.x < f.x) pad.left = true
        if (nx.x > f.x) pad.right = true
        if (nx.y < f.y) pad.up = true
        if (nx.y > f.y) pad.down = true
    }
    if (g.radioHoldT > 0 && !f.carrying) return pad // radio hold: stand down
    if (f.carrying) {
        if (ambulanceAt(f.x, f.y)) { pad.b = true; return pad }
        drive(stepToward(g, f.x, f.y, AMBULANCE.x0 + 1, AMBULANCE.y0 + 1, inLoft(f.y)))
        return pad
    }
    const loftNeed = g.victims.some((v) => v.loft && v.state !== 'rescued' && v.state !== 'lost')
    g.ladderNeed = loftNeed
    let target = null; let bestD = 1e9
    for (const v of g.victims) {
        if (v.state !== 'found') continue
        if (v.loft && g.ladder < 0.9) continue
        const d = Math.abs(f.x - v.x) + Math.abs(f.y - v.y)
        if (d < bestD) { bestD = d; target = v }
    }
    if (!target) {
        if (loftNeed) {
            if (g.ladder < 0.9) { drive(stepToward(g, f.x, f.y, LADDER_X, LOFT_Y1 + 1, false)); return pad }
            let lv = null; let lvD = 1e9
            for (const v of g.victims) {
                if (!v.loft || v.state === 'rescued' || v.state === 'lost') continue
                const d = Math.abs(f.x - v.x) + Math.abs(f.y - v.y)
                if (d < lvD) { lvD = d; lv = v }
            }
            if (lv) { drive(stepToward(g, f.x, f.y, lv.x, lv.y, true)); pad.b = true }
            return pad
        }
        // nothing found, nothing above: search the smoke. Deterministic sweep
        // of the nearest not-yet-seen tile — a firefighter feeling their way.
        const seen = g.searchSeen
        let cellT = null; let cd = 1e9
        for (let y = LOFT_Y1 + 1; y <= 14; y++) {
            for (let x = 1; x < W - 1; x++) {
                const i = y * W + x
                if (seen.has(i) || !walkable(g, x, y, false) || burningAt(g, x, y)) continue
                const d = Math.abs(f.x - x) + Math.abs(f.y - y)
                if (d < cd) { cd = d; cellT = { x, y } }
            }
        }
        if (cellT) drive(stepToward(g, f.x, f.y, cellT.x, cellT.y, false))
        return pad
    }
    if (target.x === f.x && target.y === f.y) { pad.b = true; return pad }
    drive(stepToward(g, f.x, f.y, target.x, target.y, target.loft && g.ladder > 0.9))
    return pad
}

function cpuLadder(g) {
    const pad = {}
    // the radio drives this seat: a human shout outranks the autopilot
    if (g.voiceLadder && g.voiceLadder.t > 0) {
        if (g.voiceLadder.dir === 'down') pad.b = true
        else pad.a = true // 'up' and 'brace' both hold U (raise and brace)
        return pad
    }
    const loftNeed = g.victims.some((v) => v.loft && v.state !== 'rescued' && v.state !== 'lost')
    const someoneInLoft = g.crew.some((f) => inLoft(f.y))
    const waitingAtBase = g.crew[1].y === LOFT_Y1 + 1 && Math.abs(g.crew[1].x - LADDER_X) <= 1 && loftNeed
    const need = loftNeed || someoneInLoft || waitingAtBase
    if (need) {
        pad.a = true // hold to raise; at full height under a gale this is the brace
    } else if (g.ladder > 0) pad.b = true
    return pad
}

// --- the step --------------------------------------------------------------

export function step(g, pad, pads) {
    if (g.done) return g
    g.tick++
    spreadAndBurn(g)
    doWind(g)
    // ladder physics: gales try to slip a raised, unbraced ladder with a climber
    if (g.wind.gust === 2 && g.ladder > 0.9 && !g.braceHeld) {
        g.slipT++
        if (g.slipT > 150) {
            g.ladder = 0; g.slipT = 0
            g.message = 'LADDER SLIPPED - BRACE IT!'
            g.messageT = 120
            const rf = g.crew[1]
            if (inLoft(rf.y)) { rf.y = LOFT_Y1 + 1; rf.fy = rf.y; rf.knocks++ }
            const cv = g.victims.find((v) => v.state === 'carried')
            if (cv) { /* carried victim falls with the rescuer — handled by hole/ground logic next tick */ }
        }
    } else g.slipT = 0
    // victims found when a light touches them
    for (const v of g.victims) {
        v.wave = (v.wave + 1) % 60
        // a light finds a victim; the loft window finds loft victims once the
        // stick is up — the ladder seat is the one who can see them (the split)
        if (v.state === 'hidden' && (lightAt(g, v.x, v.y, 0) > 0.5 || (v.loft && g.ladder > 0.9))) v.state = 'found'
    }
    for (const f of g.crew) {
        const p = seatPad(pad, pads, f.seat)
        const human = g.sources[f.seat - 1] === 'human'
        const driven = human ? p : f.seat === 1 ? cpuHose(g) : f.seat === 2 ? cpuRescue(g) : cpuLadder(g)
        moveCrew(g, f, driven)
        crewA(g, f, driven)
    }
    autoCarry(g); autoDrop(g)
    for (const f of g.crew) if (f.carrying) { f.carrying.x = f.x; f.carrying.y = f.y }
    const rf = g.crew[1]
    if (!isDown(g, rf)) g.searchSeen.add(rf.y * W + rf.x)
    g.flares = g.flares.filter((fl) => --fl.t > 0)
    g.drops = g.drops.filter((d) => --d.t > 0)
    if (g.sweep && !--g.sweep.t) g.sweep = null
    if (g.voiceLadder && !--g.voiceLadder.t) g.voiceLadder = null
    g.radioHoldT = Math.max(0, g.radioHoldT - 1)
    g.messageT = Math.max(0, g.messageT - 1)
    g.score = g.rescued * 1000 + g.doused * 10 + (g.done && g.win ? Math.floor((CLOCK - g.tick) / 10) : 0)
    const unresolved = g.victims.filter((v) => v.state !== 'rescued' && v.state !== 'lost').length
    if (unresolved === 0) { g.done = true; g.win = g.rescued > 0 }
    if (g.tick >= CLOCK) { g.done = true; g.win = false; g.message = 'THE STRUCTURE CLOCK RAN OUT' }
    return g
}

// --- the radio (#1361) -------------------------------------------------------
// External input like the pads: the shell (mic) or the harness calls this with
// a parsed intent; it never reads the rng, so determinism holds.
//
// A spot call is a FLASHLIGHT SWEEP, not a cheat: it lights one side through
// the same lightAt rule that finds victims and draws the darkness, and it
// costs the hose seat's battery (15 — light is fuel, the flare's law). A shout
// about a corner the sweep cannot light delivers nothing but the echo.
// Ladder and hold calls drive the CPU seats through their pads; against a
// human seat they are an echo only — a human seat answers only to pads.
export const SWEEP_TICKS = 120
export const SWEEP_COST = 15
export const VOICE_DRIVE_TICKS = 90

export function applyRadio(g, intent) {
    if (!g || g.done || !intent) return { ok: false, why: intent ? 'GAME OVER' : 'NO CALL', msg: '' }
    if (intent.kind === 'spot') {
        if (g.crew[0].battery < SWEEP_COST) {
            g.message = 'RADIO: LIGHT DEAD — NO BATTERY'; g.messageT = 120
            return { ok: false, why: 'LIGHT DEAD', msg: g.message }
        }
        g.crew[0].battery -= SWEEP_COST
        g.sweep = { side: intent.side || 'all', t: SWEEP_TICKS }
        g.message = `RADIO: VICTIM ${intent.side === 'all' ? 'SPOTTED' : intent.side.toUpperCase()}`
        g.messageT = 120
        return { ok: true, side: intent.side || 'all', msg: g.message }
    }
    if (intent.kind === 'ladder') {
        const cpu = g.sources[2] !== 'human'
        g.voiceLadder = cpu ? { dir: intent.dir, t: VOICE_DRIVE_TICKS } : null
        g.message = `RADIO: LADDER ${intent.dir.toUpperCase()}${cpu ? '' : ' (SEAT 3)'}`
        g.messageT = 120
        return { ok: true, dir: intent.dir, drove: cpu, msg: g.message }
    }
    if (intent.kind === 'hold') {
        const cpu = g.sources[1] !== 'human'
        if (cpu) g.radioHoldT = VOICE_DRIVE_TICKS
        g.message = `RADIO: HOLD${cpu ? '' : ' (SEAT 2)'}`
        g.messageT = 120
        return { ok: true, drove: cpu, msg: g.message }
    }
    return { ok: false, why: 'NO CALL', msg: '' }
}

// --- state/hash for the harness ---------------------------------------------

export function stateHash(g) {
    let h = 0x811c9dc5
    const mix = (v) => { h ^= v | 0; h = Math.imul(h, 0x019d4d) >>> 0 }
    for (let i = 0; i < W * H; i += 1) {
        const c = g.cell[i]
        if (c) mix((c.burning ? 128 : 0) | (c.gone ? 64 : 0) | ((c.heat / 4) | 0))
        else mix(g.tile[i])
    }
    for (const f of g.crew) { mix(f.x); mix(f.y); mix(f.face); mix(f.knocks); mix((f.tank / 4) | 0) }
    for (const v of g.victims) { mix(v.x); mix(v.y); mix(v.state.length) }
    mix(g.ladder * 50); mix(g.wind.dir + 4); mix(g.wind.gust); mix(g.tick); mix(g.rescued); mix(g.lost)
    return h >>> 0
}

export function state(g) {
    return {
        tick: g.tick, score: g.score, done: g.done, win: g.win, seed: g.seed,
        players: g.sources.filter((s) => s === 'human').length,
        rescued: g.rescued, lost: g.lost, doused: g.doused,
        wind: { dir: g.wind.dir, gust: g.wind.gust }, ladder: Math.round(g.ladder * 100) / 100,
        sweep: g.sweep ? g.sweep.side : null,
        tank: Math.round(g.crew[0].tank), battery: Math.round(g.crew[0].battery),
        hash: stateHash(g),
    }
}
