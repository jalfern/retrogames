// METROID-LITE — the simulation. No DOM, no React, no canvas. A run is a pure
// function of (script), and the WORLD is hand-carved on a fixed map — because
// an ability gate is a design decision, not a dice roll: every lock here is
// placed by hand and PROVEN load-bearing by `scripts/metroidcheck.mjs`.
//
// The muscle the issue names is the WORLD-STATE FLOW MACHINE, and the one
// structural promise of this file is that the machine and the game share the
// same body: `edgesFrom()` walks GHOSTS through the identical `stepBody()`
// the player uses — same gravity, same AABB collision, same jump cut — so
// "the flow machine says the ledge is reachable" and "the player can reach
// it" cannot drift apart (the sonar lesson: a predictive model that
// disagrees with the sim by one tick is a collision model written by a liar).
// And the whole assembled script is then replayed through the FULL sim
// (physics, bullets, bomb fuse, crawlers) by planRun, whose zero-hit win is
// what the harness grades and the attract demo replays.
//
// The gate chain, each link proven in BOTH directions (target reachable WITH
// the ability, UNREACHABLE without it — the heistcheck locked-door pattern):
//
//   (none)  --hop the pit, two ledges-->            POWER BEAM
//   BEAM    --melt the cracked block-->             room C ... climb to room D
//   BEAM    --across the crawled shelves-->         BOMBS
//   BOMB    --blow the bulkhead-->                  room E -> SPACE JUMP
//   SJUMP   --double-jump the 6-tile shaft steps--> THE RELIC
//
// Doors never appear in `solid()`'s ability logic: a cracked block is REAL
// rock until a real beam destroys it, a bulkhead is real until a real bomb
// opens it. The flow machine may only offer a door as traversable when the
// ability is held AND the body can stand in the firing/dropping row beside
// it, and it only destroys a door the exact moment it can afford one.
//
// Physics budget the map is designed against: one jump raises the feet
// ~64 px (4 tiles, zero margin at exactly 4 — so every single-jump step here
// rises 3 tiles or less); a space jump adds a second press near the apex,
// ~123 px — so the shaft's 6-tile (96 px) steps DOUBLE-jump ONLY, and the
// `doubleJump` mutant makes the relic unreachable, loudly.
//
// Death is not game over — that is Metroid's contract. Beacons SAVE the
// respawn point and recharge energy; broken blocks stay broken; dead
// crawlers stay dead. World state only flows forward.
//
// The second named muscle, PARALLAX, is also owned here as pure math:
// `starWorld(layer, k)` and LAYERS[].f are the ground truth the renderer and
// `scripts/metroidplay.mjs` both predict from — the driver samples a REAL
// pixel at a star's predicted screen x, so a renderer that scrolled every
// layer at the camera (one-layer "parallax") shows up as a DARK prediction.

export const TS = 16
export const MW = 140
export const MH = 44
export const VIEW_W = 480
export const VIEW_H = 272

export const EMPTY = 0
export const ROCK = 1
export const CRACK = 2
export const BULK = 3
export const SPIKE = 4

// Engine switches. All true in play; `metroidcheck --mutate` flips one in a
// child process and a NAMED check must go red. Each is a rule the chain or
// the world contract rests on (dashcheck/lemcheck/sonarcheck tradition).
export const CFG = {
    crackSolid: true,   // cracked blocks block movement until a beam opens them
    bulkSolid: true,    // bulkheads block movement until a bomb opens them
    beamBreaks: true,   // a beam destroys a cracked block it hits
    bombBreaks: true,   // a bomb explosion destroys bulkheads in range
    doubleJump: true,   // the space jump gives the second press
    beaconSaves: true,  // a beacon moves the respawn point
    hazardsHurt: true,  // spikes and crawlers cost energy
}

export const PHY = {
    acc: 0.35, maxV: 2.5, fric: 0.85, airFric: 0.99,
    grav: 0.36, jumpV: -7.0, cut: 0.45, maxFall: 9,
}

export const PLAYER = { w: 10, h: 20, energy: 4, invuln: 60, respawn: 55 }

// ---------------------------------------------------------------- world ----
// Carve rooms/corridors/shelves out of solid rock (the IronKeep lesson: an
// un-leaky map is the default when you carve, and every number below is a
// deliberate place, not a generated maybe). Row 0 is sky, row MH-1 bedrock.
// Stand cell = the cell the feet rest IN (its floor cell below is solid).
function carve(g, x0, y0, x1, y1, t = EMPTY) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y * MW + x] = t
}
const put = (g, x, y, t) => { g[y * MW + x] = t }

export const CRACK_TILES = [[40, 35]]
export const BULK_TILES = [[87, 25], [87, 24]]

export function makeWorld() {
    const g = new Uint8Array(MW * MH).fill(ROCK)
    // ---- Act 1: tutorial halls — pit hop and two ledges to the BEAM ----
    carve(g, 2, 30, 18, 35)                  // room A (spawn on floor row 36)
    carve(g, 18, 33, 23, 35)                 // corridor A -> B (ceiling row 32)
    carve(g, 24, 28, 40, 35)                 // room B
    carve(g, 30, 36, 32, 37)                 // the pit (2 deep)...
    for (let x = 29; x <= 33; x++) put(g, x, 38, SPIKE)   // ...its teeth
    carve(g, 40, 34, 41, 35)                 // gate column (row 34 open) + throat
    for (const [x, y] of CRACK_TILES) put(g, x, y, CRACK)
    // the beam ledge: a 3-step, then a rise-2 hop over the pit
    put(g, 27, 33, ROCK); put(g, 28, 33, ROCK); put(g, 29, 33, ROCK)   // shelf row 33 (stand 32)
    for (let x = 33; x <= 36; x++) put(g, x, 31, ROCK)                 // ledge row 31 (stand 30)
    // ---- Act 2: crawled caves, the shelf climb, the bulkhead ----
    carve(g, 42, 28, 60, 35)                 // room C (floor row 36)
    carve(g, 42, 24, 60, 27)                 // C's upper story: headroom for the shelf climb
    carve(g, 60, 23, 61, 27)                 // the climb up through the room-C border
    for (let x = 52; x <= 54; x++) put(g, x, 36, SPIKE)   // floor teeth (below the shelf)
    for (let x = 46; x <= 55; x++) put(g, x, 33, ROCK)    // shelf row 33 (stand 32) — crawler 1 under it
    for (let x = 57; x <= 59; x++) put(g, x, 30, ROCK)    // shelf 2 (stand 29)
    for (let x = 61; x <= 63; x++) put(g, x, 27, ROCK)    // shelf 3 (stand 26)
    carve(g, 62, 18, 84, 25)                 // room D (floor row 26)
    for (let x = 76; x <= 77; x++) put(g, x, 26, SPIKE)   // D floor teeth
    for (let x = 66; x <= 75; x++) put(g, x, 23, ROCK)    // D shelf row 23 (stand 22) — crawler 2 under it, past the teeth
    carve(g, 85, 24, 86, 25)                 // corridor D -> bulkhead
    for (const [x, y] of BULK_TILES) put(g, x, y, BULK)
    carve(g, 88, 24, 88, 25)                 // corridor bulk -> E
    // ---- Act 3: the spire, the shaft, the relic ----
    carve(g, 89, 18, 104, 25)                // room E (floor row 26)
    for (let x = 92; x <= 94; x++) put(g, x, 23, ROCK)    // SJUMP ledge row 23 (stand 22)
    carve(g, 104, 21, 105, 25)               // E -> shaft throat, widened so jumps have headroom
    // The shaft: alternating HALF shelves. A body can never rise past a
    // ceiling that is itself the floor above, so every step must launch from
    // the column the next shelf does NOT cover and drift onto it mid-air.
    // Each rise is 80 px (5 tiles): a single-jump apex is ~72 — impossible —
    // a space jump ~130. This is where the SPACE JUMP is load-bearing, and
    // the `doubleJump` mutant makes the relic unreachable, loudly. Miss the
    // drift and you free-fall to the base: no damage, only lost breath.
    carve(g, 106, 2, 110, 25)                // the shaft, fully open...
    for (let x = 106; x <= 108; x++) put(g, x, 21, ROCK) // ...then half shelves: left row 21
    for (let x = 108; x <= 110; x++) put(g, x, 16, ROCK) // right row 16
    for (let x = 106; x <= 108; x++) put(g, x, 11, ROCK) // left row 11
    for (let x = 107; x <= 124; x++) put(g, x, 5, ROCK)  // the relic hall floor row 5 (x106 stays the open column)
    carve(g, 107, 2, 124, 4)                 // hall stand room; x106 well stays open to the sky

    const items = [
        { id: 'beam', label: 'POWER BEAM', x: 34, y: 30, taken: false, pts: 200 },  // on the ledge stand row
        { id: 'bomb', label: 'BOMBS', x: 81, y: 25, taken: false, pts: 250 },       // far D floor
        { id: 'sj', label: 'SPACE JUMP', x: 93, y: 22, taken: false, pts: 300 },    // E ledge stand row
    ]
    const beacons = [
        { x: 6, y: 35 },      // room A
        { x: 47, y: 32 },     // room C shelf
        { x: 63, y: 26 },     // room D doorway shelf
        { x: 100, y: 25 },    // room E, before the shaft
    ]
    const relic = { x: 118, y: 4 }
    const spawn = { x: 4, y: 35 }
    // patrols live UNDER the shelves and inside the teeth — the proven route
    // walks the shelves and the hop lanes, so a zero-hit run exists by
    // geometry, not luck; a player who drops to the floor meets them for real.
    const crawlers = [
        { x: 50 * TS, y: 36 * TS - 10, w: 14, h: 10, vx: 0, vy: 0, dir: 1, alive: true, onGround: false, dbl: true, min: 48, max: 51 },
        { x: 70 * TS, y: 26 * TS - 10, w: 14, h: 10, vx: 0, vy: 0, dir: -1, alive: true, onGround: false, dbl: true, min: 67, max: 74 },
    ]
    return { grid: g, spawn, items, beacons, relic, crawlers: crawlers.map(c => ({ ...c })) }
}

export const idx = (x, y) => y * MW + x
export const inB = (x, y) => x >= 0 && x < MW && y >= 0 && y < MH
export const tileAt = (g, x, y) => (inB(x, y) ? g[idx(x, y)] : ROCK)

export function solid(g, x, y) {
    const t = tileAt(g, x, y)
    if (t === ROCK || t === SPIKE) return true
    if (t === CRACK) return CFG.crackSolid
    if (t === BULK) return CFG.bulkSolid
    return false
}

// ---------------------------------------------------------------- body ----
// The ONE integrator. Player, flow-machine ghosts, crawlers and bombs all
// step through this — which is what keeps the flow machine honest: it can
// only promise landings a real body survives.
export function stepBody(b, inp, g) {
    if (inp.left) b.vx -= PHY.acc
    if (inp.right) b.vx += PHY.acc
    if (!inp.left && !inp.right) b.vx *= b.onGround ? PHY.fric : PHY.airFric
    b.vx = Math.max(-PHY.maxV, Math.min(PHY.maxV, b.vx))
    if (Math.abs(b.vx) < 0.05) b.vx = 0
    if (inp.jump && b.onGround) { b.vy = PHY.jumpV; b.onGround = false; b.dbl = false }
    else if (inp.jump2 && !b.onGround && CFG.doubleJump && !b.dbl) { b.vy = PHY.jumpV; b.dbl = true }
    if (inp.cut && b.vy < 0) b.vy *= PHY.cut
    b.vy = Math.min(b.vy + PHY.grav, PHY.maxFall)

    b.x += b.vx
    const x0 = Math.floor(b.x / TS), x1 = Math.floor((b.x + b.w - 1) / TS)
    const y0 = Math.floor(b.y / TS), y1 = Math.floor((b.y + b.h - 1) / TS)
    for (let y = y0; y <= y1; y++) {
        if (b.vx > 0 && solid(g, x1, y)) { b.x = x1 * TS - b.w; b.vx = 0 }
        else if (b.vx < 0 && solid(g, x0, y)) { b.x = (x0 + 1) * TS; b.vx = 0 }
    }
    b.y += b.vy
    b.onGround = false
    const nx0 = Math.floor(b.x / TS), nx1 = Math.floor((b.x + b.w - 1) / TS)
    const ny0 = Math.floor(b.y / TS), ny1 = Math.floor((b.y + b.h - 1) / TS)
    for (let x = nx0; x <= nx1; x++) {
        if (b.vy > 0 && solid(g, x, ny1)) { b.y = ny1 * TS - b.h; b.vy = 0; b.onGround = true }
        else if (b.vy < 0 && solid(g, x, ny0)) { b.y = (ny0 + 1) * TS; b.vy = 0 }
    }
    if (b.y > MH * TS + 64) b.dead = true
}

export const footCell = (b) => ({ x: Math.floor((b.x + b.w / 2) / TS), y: Math.floor((b.y + b.h - 1) / TS) })
export const bodyInSolid = (b, g) => {
    const x0 = Math.floor(b.x / TS), x1 = Math.floor((b.x + b.w - 1) / TS)
    const y0 = Math.floor(b.y / TS), y1 = Math.floor((b.y + b.h - 1) / TS)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solid(g, x, y)) return true
    return false
}
export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
export const bodyAt = (cell) => ({ x: cell.x * TS + (TS - PLAYER.w) / 2, y: (cell.y + 1) * TS - PLAYER.h })

// ------------------------------------------------------------ flow machine ----
// A "cell" is a stand cell. edgesFrom() launches ghosts with fixed input
// patterns and returns the stand cell each landing occupies WITH the exact
// per-tick inputs, so a BFS over edges flattens into a script the real sim
// replays. Doors are never physics: an edge crosses a door only after its
// cell pays for it (fire / bomb) with the ability in hand.
// walk: corridor steps and precise item pickups; hop: a cut short jump;
// jump / jump2: the ledge climbers. Every one runs through stepBody.
// walk: corridor steps and item pickups; tap: a 4-tick run-up then a full
// jump — the pattern that lands ON a 3-tile shelf instead of sliding past it;
// hop: a cut short jump for one-tile steps; jump/sj: the climbers.
// Every pattern is a push schedule + optional jump/double/cut. walk:
// corridor steps; tap: short run-up so the body lands ON a 3-tile shelf;
// hop: cut short jump; jump/sj: climbers; sjwell: up the open well then
// drift onto the island; sjzig: hop off the island edge into the well,
// double-jump up the ceilingless column, drift back onto the next island —
// the shaft's only way up.
const PATTERNS = [
    { name: 'walk1', push: [[1, 0, 24]] },
    { name: 'walk-1', push: [[-1, 0, 24]] },
    { name: 'hop1', push: [[1, 0, 24]], jump: 0, cut: 5 },
    { name: 'hop-1', push: [[-1, 0, 24]], jump: 0, cut: 5 },
    { name: 'tap1', push: [[1, 0, 4]], jump: 4, cut: 14 },
    { name: 'tap-1', push: [[-1, 0, 4]], jump: 4, cut: 14 },
    { name: 'jump1', push: [[1, 0, 24]], jump: 0, cut: 12 },
    { name: 'jump-1', push: [[-1, 0, 24]], jump: 0, cut: 12 },
    { name: 'jump0', push: [], jump: 0, cut: 12 },
    { name: 'sj0', push: [], jump: 0, dbl: 13, cut: 12 },
    { name: 'sjwell1', push: [[1, 6, 46]], jump: 0, dbl: 13, cut: 12 },
    { name: 'sjzig-1', push: [[-1, 0, 12], [1, 13, 46]], jump: 0, dbl: 15, cut: 12 },
    { name: 'sjzig1', push: [[1, 0, 12], [-1, 13, 46]], jump: 0, dbl: 15, cut: 12 },
]

function ghostTraj(g, cell, pat, abil, pose) {
    const sj = pat.dbl !== undefined
    if (sj && !(abil.sjump && CFG.doubleJump)) return null
    const at = pose || bodyAt(cell)
    const b = { x: at.x, y: at.y, w: PLAYER.w, h: PLAYER.h, vx: 0, vy: 0, onGround: true, dbl: false }
    const script = []
    const MAX = 110
    const dirPushed = pat.push.some(([d]) => d !== 0)
    let landed = -1
    for (let t = 0; t < MAX; t++) {
        const settled = landed >= 0
        const inp = settled ? {} : {
            left: pat.push.some(([d, t0, t1]) => d === -1 && t >= t0 && t < t1),
            right: pat.push.some(([d, t0, t1]) => d === 1 && t >= t0 && t < t1),
            jump: pat.jump === t, jump2: sj && pat.dbl === t, cut: pat.cut === t,
        }
        script.push(inp)
        stepBody(b, inp, g)
        if (bodyInSolid(b, g)) return null
        if (b.onGround && landed < 0) {
            const f = footCell(b)
            if (tileAt(g, f.x, f.y + 1) === SPIKE) return null
            if (b.dead) return null
            landed = t
        }
        // keep ticking until AT REST: the live replay runs these same scripts
        // back-to-back, and an edge that ends mid-slide hands the next edge a
        // velocity its ghost never promised — the sonar shadow lesson again.
        if (landed >= 0 && Math.abs(b.vx) < 0.05 && b.vy === 0) {
            const f = footCell(b)
            if (tileAt(g, f.x, f.y + 1) === SPIKE) return null
            if (!dirPushed && f.x === cell.x && f.y === cell.y) return null
            return { cell: f, script, pose: { x: b.x, y: b.y } }
        }
    }
    return null
}

// Doors a body can open from this exact stand cell: same row, ability held,
// and the destruction mechanism actually works in this world.
export function doorsHere(g, cell, abil) {
    const out = []
    const tryDoor = (dx, kind, need, act, cfg) => {
        const tx = cell.x + dx, ty = cell.y
        if (tileAt(g, tx, ty) !== kind || !abil[need] || !CFG[cfg]) return
        out.push({ kind, x: tx, y: ty, act })
    }
    tryDoor(1, CRACK, 'beam', 'fire', 'beamBreaks')
    tryDoor(-1, CRACK, 'beam', 'fire', 'beamBreaks')
    tryDoor(1, BULK, 'bomb', 'bomb', 'bombBreaks')
    tryDoor(-1, BULK, 'bomb', 'bomb', 'bombBreaks')
    return out
}

const fireScript = () => Array.from({ length: 6 }, (_, t) => ({ fire: t === 0 }))
const bombScript = () => Array.from({ length: 56 }, (_, t) => ({ bomb: t === 0 }))

// BFS stand cells over a SCRATCH grid: when a popped cell can pay for a
// door, that door is destroyed at that instant for the ghosts' sake — but
// only on the scratch copy. The live sim must still break every door with a
// real beam/bomb when the assembled script runs (that is what the stage's
// live promise grades — never hand the proof a world someone else unlocked).
export function explore(g, start, abil, startPose) {
    const parent = new Map()
    const paid = new Map()          // "x,y" -> [{cell, dx, act}] doors fired from it
    const seen = new Set([`${start.x},${start.y}`])
    // a cell names a TILE, but a body settles at an exact pose; the next
    // edge's ghost must launch from THAT pose or the replay of a chain
    // drifts a few px per edge and walks off a ledge the ghost never left.
    const poses = new Map([[`${start.x},${start.y}`, startPose || bodyAt(start)]])
    const q = [[start.x, start.y]]
    let visited = 0
    while (q.length) {
        const [x, y] = q.shift()
        visited++
        const k = `${x},${y}`
        let p = paid.get(k)
        for (const d of doorsHere(g, { x, y }, abil)) {
            if (!p) paid.set(k, p = [])
            p.push(d)
            // the door goes NOW — when affordably. A bomb blast clears the
            // whole connected bulkhead cluster (radius from a feet-dropped
            // bomb covers the designed two-tile plug); a beam burns exactly
            // the one block it touches. Both mirror the live sim's actions.
            if (d.act === 'bomb') {
                const q = [[d.x, d.y]]
                while (q.length) {
                    const [bx, by] = q.pop()
                    if (tileAt(g, bx, by) !== BULK) continue
                    g[idx(bx, by)] = EMPTY
                    for (const [dx2, dy2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) q.push([bx + dx2, by + dy2])
                }
            } else g[idx(d.x, d.y)] = EMPTY
        }
        for (const pat of PATTERNS) {
            const t = ghostTraj(g, { x, y }, pat, abil, poses.get(k))
            if (!t) continue
            const nk = `${t.cell.x},${t.cell.y}`
            if (seen.has(nk)) continue
            seen.add(nk)
            poses.set(nk, t.pose)
            parent.set(nk, { from: k, script: t.script })
            q.push([t.cell.x, t.cell.y])
        }
    }
    return { seen, parent, paid, poses, visited }
}

export const has = (seen, x, y) => seen.has(`${x},${y}`)

// ------------------------------------------------------------- the game ----
export function makeGame(opts = {}) {
    const w = makeWorld()
    return {
        world: w,
        p: { ...bodyAt(w.spawn), w: PLAYER.w, h: PLAYER.h, vx: 0, vy: 0, onGround: false, dbl: false, face: 1 },
        energy: PLAYER.energy, invuln: 0, dead: 0,
        save: { ...w.spawn },
        abil: { beam: false, bomb: false, sjump: false, ...(opts.abil || {}) },
        score: 0, deaths: 0, tick: 0, end: null, win: false,
        shots: [], bombs: [], booms: [],
        events: [],
        cracks: 0, bulks: 0,
    }
}

function damage(g, fromX) {
    if (!CFG.hazardsHurt || g.invuln > 0 || g.dead || g.end) return
    g.energy--
    g.invuln = PLAYER.invuln
    g.p.vx = (g.p.x + g.p.w / 2 < fromX ? -1 : 1) * 2.5
    g.p.vy = -4
    g.events.push({ type: 'hit', energy: g.energy })
    if (g.energy <= 0) {
        g.dead = PLAYER.respawn
        g.deaths++
        g.events.push({ type: 'die' })
    }
}

function fireBeam(g) {
    if (!g.abil.beam || g.end || g.dead) return
    const p = g.p
    g.shots.push({ x: p.x + (p.face > 0 ? p.w : -8), y: p.y + 8, vx: 6 * p.face, life: 70 })
    g.events.push({ type: 'fire' })
}

function dropBomb(g) {
    if (!g.abil.bomb || g.end || g.dead) return
    const p = g.p
    g.bombs.push({ x: p.x + p.w / 2 - 5, y: p.y + p.h - 10, w: 10, h: 10, vx: p.vx * 0.4, vy: 0, fuse: 50, onGround: false, dbl: true })
    g.events.push({ type: 'bomb' })
}

function explode(g, bx, by) {
    g.booms.push({ x: bx, y: by, t: g.tick })
    g.events.push({ type: 'boom' })
    const R = 1.8
    const cx0 = Math.floor(bx / TS), cy0 = Math.floor(by / TS)
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.hypot(dx, dy) > R) continue
        const x = cx0 + dx, y = cy0 + dy
        const t = tileAt(g.world.grid, x, y)
        if (t === BULK && CFG.bombBreaks) { g.world.grid[idx(x, y)] = EMPTY; g.bulks++; g.events.push({ type: 'bulk' }) }
        else if (t === CRACK && CFG.bombBreaks) { g.world.grid[idx(x, y)] = EMPTY; g.cracks++; g.events.push({ type: 'crack' }) }
    }
    for (const c of g.world.crawlers) {
        if (c.alive && Math.hypot(c.x + 7 - bx, c.y + 5 - by) < TS * 2.2) {
            c.alive = false
            g.score += 40
            g.events.push({ type: 'kill', how: 'bomb' })
        }
    }
}

// one world tick. `inp`: {left,right,jumpEdge,jumpCut,fireEdge,bombEdge}
// (fireEdge + down drops a bomb in the shell; bombEdge is the explicit B key.)
export function step(g, inp = {}) {
    g.events.length = 0
    if (g.end) return g
    g.tick++
    if (g.invuln > 0) g.invuln--

    if (g.dead > 0) {
        g.dead--
        if (g.dead === 0) {
            const s = CFG.beaconSaves ? g.save : g.world.spawn
            const b = bodyAt(s)
            g.p.x = b.x; g.p.y = b.y; g.p.vx = 0; g.p.vy = 0
            g.energy = PLAYER.energy
            g.invuln = PLAYER.invuln * 2
            g.events.push({ type: 'respawn', save: { ...s }, beacon: CFG.beaconSaves })
        }
    } else {
        if (inp.left) g.p.face = -1
        if (inp.right) g.p.face = 1
        stepBody(g.p, {
            left: inp.left, right: inp.right,
            jump: inp.jumpEdge && g.p.onGround,
            jump2: inp.jumpEdge && !g.p.onGround && !g.p.dbl,
            cut: inp.jumpCut,
        }, g.world.grid)
        if (inp.fireEdge && !inp.down) fireBeam(g)
        else if (inp.fireEdge || inp.bombEdge) dropBomb(g)

        if (g.p.onGround) {
            const f = footCell(g.p)
            if (tileAt(g.world.grid, f.x, f.y + 1) === SPIKE) damage(g, g.p.x)
        }
    }

    for (const s of g.shots) {
        s.x += s.vx; s.life--
        const tx = Math.floor((s.x + (s.vx > 0 ? 7 : 0)) / TS), ty = Math.floor(s.y / TS)
        const t = tileAt(g.world.grid, tx, ty)
        if (t === CRACK && CFG.beamBreaks) {
            g.world.grid[idx(tx, ty)] = EMPTY; g.cracks++
            s.life = 0
            g.events.push({ type: 'crack' })
        } else if (solid(g.world.grid, tx, ty)) s.life = 0
        for (const c of g.world.crawlers) {
            if (c.alive && s.x < c.x + c.w && s.x + 8 > c.x && s.y < c.y + c.h && s.y + 3 > c.y) {
                c.alive = false; s.life = 0; g.score += 40
                g.events.push({ type: 'kill', how: 'beam' })
            }
        }
    }
    g.shots = g.shots.filter(s => s.life > 0)

    for (const b of g.bombs) {
        stepBody(b, {}, g.world.grid)
        b.fuse--
        if (b.fuse <= 0) { b.done = true; explode(g, b.x + b.w / 2, b.y + b.h / 2) }
    }
    g.bombs = g.bombs.filter(b => !b.done)
    g.booms = g.booms.filter(bo => g.tick - bo.t < 18)

    // crawlers: the same body, walked by a tiny brain
    for (const c of g.world.crawlers) {
        if (!c.alive) continue
        const ahead = Math.floor((c.x + c.w / 2 + c.dir * (c.w / 2 + 2)) / TS)
        const midY = Math.floor((c.y + c.h / 2) / TS)
        const footY = Math.floor((c.y + c.h + 1) / TS)
        const below = tileAt(g.world.grid, ahead, footY)
        if (solid(g.world.grid, ahead, midY) || (below !== SPIKE && !solid(g.world.grid, ahead, footY)) || below === SPIKE) c.dir *= -1
        if (c.x < c.min * TS) c.dir = 1
        if (c.x > c.max * TS) c.dir = -1
        stepBody(c, { right: c.dir > 0, left: c.dir < 0 }, g.world.grid)
        if (g.dead === 0 && g.invuln <= 0 && !g.end && overlap(g.p, c)) damage(g, c.x + c.w / 2)
    }

    for (const it of g.world.items) {
        if (it.taken) continue
        if (overlap(g.p, { x: it.x * TS + 2, y: it.y * TS + 2, w: 12, h: 12 })) {
            it.taken = true
            if (it.id === 'sj') g.abil.sjump = true
            else g.abil[it.id] = true
            g.score += it.pts
            g.events.push({ type: 'item', id: it.id, label: it.label })
        }
    }
    for (const bc of g.world.beacons) {
        if (Math.hypot(g.p.x + 5 - (bc.x * TS + 8), g.p.y + 10 - (bc.y * TS + 8)) < 26) {
            if (g.save.x !== bc.x || g.save.y !== bc.y || g.energy < PLAYER.energy) {
                g.save = { x: bc.x, y: bc.y }
                g.energy = PLAYER.energy
                g.events.push({ type: 'save', at: { ...g.save } })
            }
        }
    }
    const r = g.world.relic
    if (!g.end && overlap(g.p, { x: r.x * TS + 2, y: r.y * TS + 2, w: 12, h: 12 })) {
        g.end = 'win'; g.win = true
        g.score += 1000 + g.energy * 100
        g.events.push({ type: 'relic' })
    }
    return g
}

// ---------------------------------------------------------------- hash ----
export function stateHash(g) {
    let s = `${g.tick}|${g.p.x.toFixed(2)},${g.p.y.toFixed(2)}|${g.energy}|${g.deaths}|${g.score}|${g.save.x},${g.save.y}|${g.end}`
    s += `|${g.abil.beam ? 1 : 0}${g.abil.bomb ? 1 : 0}${g.abil.sjump ? 1 : 0}|${g.cracks}${g.bulks}`
    for (const c of g.world.crawlers) s += c.alive ? 'C' : 'x'
    let h = 0x811c9dc5
    for (let i = 0; i < g.world.grid.length; i++) { h ^= g.world.grid[i]; h = Math.imul(h, 0x01000193) }
    return s + '|' + (h >>> 0).toString(16)
}

// ------------------------------------------------------------- the script ----
// Flatten one chain edge into real-sim inputs.
// one press tick — jumpEdge doubles as the second press when the ghost used
// jump2 (the real player's shell fires jumpEdge on every press; airborne +
// not-yet-doubled in step() means space jump).
const edgeTicks = (script) => script.map((inp) => ({
    left: !!inp.left, right: !!inp.right,
    jumpEdge: !!(inp.jump || inp.jump2), jumpCut: !!inp.cut,
    fireEdge: !!inp.fire, bombEdge: !!inp.bomb,
}))
const doorTicks = (act) => (act === 'bomb' ? bombScript() : fireScript()).map((inp) => ({
    fireEdge: !!inp.fire, bombEdge: !!inp.bomb,
}))

const SAME = (a, b) => a.x === b.x && a.y === b.y

// The gate chain: stage i runs BFS with the abilities stage i-1 granted, walks
// the parent chain out of it, and IMMEDIATELY replays everything through the
// real sim, demanding the stage's promise before the next stage is believed
// (sonarcheck: never hand the next stage a world a script already unlocked).
export function planRun(opts = {}) {
    const g = makeGame()
    const world = g.world
    const script = []
    const trace = []
    const stages = ['beam', 'bomb', 'sj', 'relic']
    for (let i = 0; i < 8 && !g.p.onGround; i++) step(g, {})   // settle on the floor
    for (const st of stages) {
        const it = st === 'relic' ? null : world.items.find((i) => i.id === st)
        const goal = st === 'relic' ? { x: world.relic.x, y: 4 } : { x: it.x, y: it.y }
        // settle first: the pose the stage's ghosts launch from must be the
        // pose the live body actually rests in.
        const stage = []
        for (let i = 0; i < 45 && (!g.p.onGround || g.p.vx !== 0 || g.p.vy !== 0); i++) { step(g, {}); stage.push({}) }
        const start = footCell(g.p)
        if (!g.p.onGround || g.p.vx !== 0) return { ok: false, stage: `settle:${st}`, script, trace, g }
        const startPose = { x: g.p.x, y: g.p.y }
        const { seen, parent, paid } = explore(Uint8Array.from(world.grid), start, g.abil, startPose)
        // nearest goal stand cell: the goal cell itself or a cell beside it
        let endK = null
        if (seen.has(`${goal.x},${goal.y}`)) endK = `${goal.x},${goal.y}`
        if (!endK) {
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, 0]]) {
                if (seen.has(`${goal.x + dx},${goal.y + dy}`)) { endK = `${goal.x + dx},${goal.y + dy}`; break }
            }
        }
        // items sit one row above their stand cell: land on the stand cell
        if (!endK && st !== 'relic' && seen.has(`${it.x},${it.y - 1}`)) endK = `${it.x},${it.y - 1}`
        void seen
        if (!endK) return { ok: false, stage: st, script, trace, g }
        // reconstruct the chain of stand cells from start to endK
        const cells = []
        let cur = endK
        let guard = 0
        while (cur !== `${start.x},${start.y}` && guard++ < 500) {
            const pv = parent.get(cur)
            if (!pv) return { ok: false, stage: `chain:${st}`, script, trace, g }
            cells.unshift({ k: cur, from: pv.from, script: pv.script })
            cur = pv.from
        }
        // assemble: at every cell along the chain, pay its doors BEFORE
        // walking out of it — same instant explore() destroyed them.
        const chain = []
        for (const c of cells) {
            const p = paid.get(c.from)
            if (p) for (const d of p) chain.push(...doorTicks(d.act))
            chain.push(...edgeTicks(c.script))
        }
        const goalX = st === "relic" ? world.relic.x * TS : it.x * TS
        const takenNow = () => st === 'relic' ? g.end === 'win' : it.taken
        const before = g.tick
        // run the chain, then sweep toward the goal with live-computed walk
        // ticks (the chain can land BESIDE it): the pickup fires in the REAL
        // sim while passing, never as a bookkeeping cheat. Then settle to a
        // rest pose — the next stage's ghosts launch from exactly that.
        for (let i = 0; i < chain.length + 90 && !g.end; i++) {
            let inp = chain[i]
            if (!inp) {
                if (takenNow()) break
                const d = Math.sign(goalX - (g.p.x + g.p.w / 2)) || 1
                inp = { left: d < 0, right: d > 0 }
            }
            step(g, inp)
            for (const ev of g.events) {
                if (ev.type === 'hit' && !opts.allowHits) return { ok: false, stage: `hit:${st}@${g.tick}`, script, trace, g }
            }
            stage.push(inp)
            if (st === 'relic' && g.end === 'win') break
        }
        if (!g.end) for (let i = 0; i < 140 && (!g.p.onGround || g.p.vx !== 0); i++) { step(g, {}); stage.push({}) }
        script.push(...stage)
        trace.push({ stage: st, ticks: g.tick - before })
        // the stage's promise, graded on the LIVE world
        if (st === 'relic') {
            if (g.end !== 'win') return { ok: false, stage: 'relic', script, trace, g }
        } else {
            if (!it.taken) return { ok: false, stage: `item:${st}`, script, trace, g }
            if (!g.p.onGround || g.p.vx !== 0) return { ok: false, stage: `air2:${st}`, script, trace, g }
        }
    }
    return { ok: g.end === 'win', end: g.end, script, trace, g }
}

// Attract/audit helper: a fresh game replaying the proven script.
export function replayScript(script, opts = {}) {
    const g = makeGame()
    for (let i = 0; i < script.length && !g.end; i++) {
        step(g, script[i])
        if (opts.onTick) opts.onTick(g)
    }
    return g
}

// ---------------------------------------------------------------- sky ----
// Three independent star fields at scroll factors the renderer MUST honour
// (parallax). `starWorld` is the single ground truth; metroidplay predicts a
// star's screen x from it against REAL pixels — a renderer that scrolls every
// layer at the camera puts its stars where the prediction is DARK.
export const STAR_PER = 2000
export const LAYERS = [
    { f: 0.15, n: 26, color: '#8fb7d9' },
    { f: 0.35, n: 18, color: '#b9d4ea' },
    { f: 0.62, n: 12, color: '#e6f2ff' },
]
export function starWorld(layer, k) {
    let h = ((layer + 1) * 7919 + (k + 1) * 104729) >>> 0
    h = Math.imul(h ^ (h >>> 15), 0x2c1b31d1) >>> 0
    const x = h % STAR_PER
    const y = (Math.imul(h ^ 0x9e3779b9, 0x85ebca6b) >>> 0) % (VIEW_H - 40)
    return { x, y }
}
export const starScreenX = (layer, k, camX, f = LAYERS[layer].f) => {
    const s = starWorld(layer, k)
    let x = (s.x - camX * f) % STAR_PER
    if (x < 0) x += STAR_PER
    return x
}
