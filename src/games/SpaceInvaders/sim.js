// SPACE INVADERS — pure sim (space-invaders, Taito 1978).
//
// Fixed world coordinates: 224 x 256, the original's native resolution
// (rotated arcade panel). index.jsx scales this to the canvas with
// imageSmoothingEnabled=false — pixel title, screen-resolution rendering is
// forbidden (AGENTS.md "Adding a game").
//
// Entropy discipline (#1473): zero Math.random here. Every dice roll —
// invader fire, shooter choice, UFO arrival and bounty — draws from `rand`,
// injected by index.jsx as seedRng(seed). ?seed=N therefore replays the exact
// world: same shots, same saucer, same run. The attract demo runs this SAME
// sim, so the seed is regenerated at every human start (Outpost/DK precedent).
//
// Terminal model (restored faithfully — the old port silently re-init'ed):
// rows score 30/20/20/10 top-to-bottom (the original's row bands folded to
// four rows), three lives, respawn keeps invader formation and clears the
// screen's bullets, a landing ends the game, waves speed up and start lower.

export const GW = 224
export const GH = 256

export const PLAYER_W = 13
export const PLAYER_H = 8
export const PLAYER_Y = GH - 24
export const INVADER_W = 12
export const INVADER_H = 8
export const BULLET_W = 1
export const BULLET_H = 4
export const COLS = 8
export const ROWS = 4
export const ROW_SCORE = [30, 20, 20, 10]
export const LIVES = 3
export const RESPAWN_TICKS = 90
export const UFO_SPEED = 1
export const UFO_Y = 26
export const UFO_POINTS = [50, 100, 150, 300]

// The 1978 bunkers: four destructible forts of 2x2 bricks (11x8 cells =
// 22x16 px each), dome corners cut, a 6x4 slot in the crown. They sit
// between the fleet and the player. A shot eats exactly ONE brick and is
// lost; a shot whose path is hollow (slot or already chewed) passes. A
// descended invader erases whatever bricks it walks over. A cleared wave
// does NOT rebuild them — only a new game restores the forts (original).
export const BUNKER_W = 22
export const BUNKER_H = 16
export const BUNKER_ROWS = 8
export const BUNKER_Y = 208
export const BUNKER_X = [23, 75, 127, 179]
export const BUNKER_SHAPE = [
    0b01111111110, // crown, corners cut
    0b11111001111, // the 6px slot in the crown (cells 4-5, centered)
    0b11111001111,
    0b11111111111,
    0b11111111111,
    0b11111111111,
    0b11111111111,
    0b11111111111,
]

export const newBunkers = () => BUNKER_X.map((x) => ({ x, y: BUNKER_Y, cells: BUNKER_SHAPE.slice() }))
export const bunkerBricks = (s) => {
    let n = 0
    for (const b of s.bunkers) for (const m of b.cells) { let r = m; while (r) { n += r & 1; r >>>= 1 } }
    return n
}

// mulberry32 lives in gameContract (seedRng); the sim takes any () => [0,1).

export const makeWorld = (rand, opts = {}) => {
    const wave = opts.wave || 1
    const state = {
        tick: 0,
        wave,
        score: opts.score || 0,
        lives: opts.lives || LIVES,
        playerX: GW / 2 - PLAYER_W / 2,
        cooldown: 0,
        invaders: [],
        dir: 1,
        enemyBullets: [],
        playerBullet: null, // original: one shot on screen at a time
        ufo: null,          // { x, points }
        ufoNext: 900 + Math.floor(rand() * 600),
        bunkers: newBunkers(),
        phase: 'play',      // play | dying | over
        respawn: 0,
        overTick: 0,
    }
    buildFormation(state)
    return state
}

export const buildFormation = (state) => {
    state.invaders = []
    const startX = 24
    const startY = 40 + Math.min((state.wave - 1) * 8, 48) // later waves start lower
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            state.invaders.push({
                x: startX + c * 16,
                y: startY + r * 12,
                alive: true,
                row: r,
            })
        }
    }
    state.dir = 1
    state.enemyBullets = []
    state.playerBullet = null
    state.ufo = null
}

export const waveSpeed = (wave) => 0.8 + wave * 0.25
export const fireChance = (wave) => Math.min(0.02 + wave * 0.004, 0.05)

export const activeCount = (s) => s.invaders.reduce((n, i) => n + (i.alive ? 1 : 0), 0)

// Does a shot fired straight up the column x still have to get through a fort?
// A fort with ANY brick left shields its whole span (one shot eats ONE brick).
export const fortBlocks = (s, x) => s.bunkers.some((b) => x + 1 > b.x && x < b.x + BUNKER_W && b.cells.some((m) => m !== 0))

// WATCH route (#1637 batch 18, hardened batch 19) — the proven flight, pure
// per-tick reaction on live state. Three laws, in order:
//  1. STAND IN CLEAR COLUMNS: enemy shots fall straight (2.5 px/t), so the
//     route plans a *standing place*, not a dodge twitch — the aiming point,
//     nudged to the nearest column a body clear of every shot still in the air.
//  2. SHOOT THE LOWEST: descent ends the game, so the target is the lowest
//     invader whose column the forts don't shield; among equal rows prefer one
//     whose LEAD point is also shield-free (#1637 b19: law 3's meeting point
//     sits ~17 px into the marching column — often over a fort, where the shot
//     spends itself on a brick while the fleet walks on), then nearest.
//  3. LEAD THE MARCH: the fleet drifts while our shot climbs at 5 px/t, so
//     fire at the meeting point, not today's x.
// The fire gate never pulls the trigger from a fort-shielded column unless the
// chosen target itself hides behind a shield — then brick-biting is the honest
// endgame (#1637 b19: seed 1462 stalled 511 ticks exactly this way).
// No rand, no memory — honest from any position, so the attract demo and the
// Y seat run exactly this brain, and invaderscheck's WITNESS section flies it
// across 20 seeds (wave 1 cleared, no lives lost) and watchcheck drives it in
// the browser. Extracting it into sim.js keeps one brain, not a forked one.
export const watchRoute = (s) => {
    const input = { left: false, right: false, fire: false }
    if (s.phase !== 'play') return input
    const pc = s.playerX + PLAYER_W / 2
    const minX = 4 + PLAYER_W / 2
    const maxX = GW - 4 - PLAYER_W / 2
    // A column is contested when its shot is inside our approach band (~40
    // ticks out); higher shots keep falling and get re-judged as they drop.
    const lanes = s.enemyBullets.filter((b) => b.y > GH - 100).map((b) => b.x)
    const freeAt = (x) => lanes.every((lx) => Math.abs(lx - x) >= 12)
    const pathOpen = (x) => lanes.every((lx) => (lx - Math.min(pc, x)) * (lx - Math.max(pc, x)) >= 0 || Math.abs(lx - pc) < 12)
    const leadOf = (i) => {
        const flight = (PLAYER_Y - BULLET_H - i.y) / 5
        // #1637 b20 — fold the edge bounce into the meeting point: a straight
        // lead is fiction once the column reverses mid-flight (measured bursts of
        // edge-bounce misses stretched the inter-kill gaps past 230 ticks). The
        // whole formation reverses together (step's hitEdge rule), so predict:
        // march to the bounce, then travel the other way for the rest of the
        // shot's flight. Flight <= ~40 t never reaches a second bounce at wave 1.
        const spAbs = waveSpeed(s.wave)
        let edgeDist = Infinity
        for (const j of s.invaders) if (j.alive) edgeDist = Math.min(edgeDist, s.dir > 0 ? GW - 4 - INVADER_W - j.x : j.x - 4)
        const tEdge = spAbs > 0 ? Math.max(0, edgeDist) / spAbs : flight
        let x = i.x + INVADER_W / 2 + s.dir * spAbs * Math.min(flight, tEdge)
        let rem = flight - tEdge
        let d = -s.dir
        const span = (GW - 8 - INVADER_W) / spAbs
        let guard = 0
        while (rem > 0 && guard++ < 3) { x += d * spAbs * Math.min(rem, span); rem -= span; d = -d }
        return Math.max(minX, Math.min(maxX, x))
    }
    // Law 2: the lowest invader the forts don't shield — and where the fort
    // choice ties, the one whose meeting point flies over open sky.
    let best = null
    let bestBlocked = true
    let bestAimBlocked = true
    for (const i of s.invaders) {
        if (!i.alive) continue
        const blocked = fortBlocks(s, i.x + INVADER_W / 2)
        const aimBlocked = fortBlocks(s, leadOf(i))
        const nearer = !best || Math.abs(i.x + INVADER_W / 2 - pc) < Math.abs(best.x + INVADER_W / 2 - pc)
        if (!best || i.y > best.y
            || (i.y === best.y && !blocked && bestBlocked)
            || (i.y === best.y && blocked === bestBlocked && !aimBlocked && bestAimBlocked)
            || (i.y === best.y && blocked === bestBlocked && aimBlocked === bestAimBlocked && nearer)) {
            best = i
            bestBlocked = blocked
            bestAimBlocked = aimBlocked
        }
    }
    if (!best) return input
    // Law 3: the meeting point of our shot and the marching target.
    const aimX = leadOf(best)
    // #1637 b20 RE-AIM — kill what is aligned NOW. Row-dominant aiming marched
    // the ship toward the lowest invader's lead column while OTHER invaders sat
    // already aligned over open sky (~500 ticks per seed of green fire gates,
    // measured). An aligned shot that can leave this tick beats walking to a
    // greener column: the descent law still owns the choice whenever nothing is
    // lined up, and the fort law is unchanged for this pass too.
    if (!s.playerBullet && freeAt(pc)) {
        let shot = null
        let shotBlocked = true
        for (const i of s.invaders) {
            if (!i.alive) continue
            const blocked = fortBlocks(s, i.x + INVADER_W / 2)
            if (!(blocked || !fortBlocks(s, pc))) continue // the fire gate for this target
            if (Math.abs(leadOf(i) - pc) <= 2.5) {
                if (!shot || i.y > shot.y
                    || (i.y === shot.y && !blocked && shotBlocked)
                    || (i.y === shot.y && blocked === shotBlocked && Math.abs(i.x + INVADER_W / 2 - pc) < Math.abs(shot.x + INVADER_W / 2 - pc))) {
                    shot = i
                    shotBlocked = blocked
                }
            }
        }
        if (shot) { input.fire = true; return input }
    }
    // Law 1: stand free of every contested column; fleeing takes priority, and
    // no route ever threads between two falling shots.
    let goal = null
    if (!freeAt(pc)) {
        for (let d = 1; d <= 48 && goal === null; d++) {
            if (pc + d <= maxX && freeAt(pc + d)) goal = pc + d
            else if (pc - d >= minX && freeAt(pc - d)) goal = pc - d
        }
    } else {
        for (let d = 0; d <= 48 && goal === null; d++) {
            if (aimX + d <= maxX && freeAt(aimX + d) && pathOpen(aimX + d)) goal = aimX + d
            else if (d > 0 && aimX - d >= minX && freeAt(aimX - d) && pathOpen(aimX - d)) goal = aimX - d
        }
    }
    if (goal === null) goal = lanes.some((lx) => lx >= pc) ? minX : maxX
    const dx = goal - pc
    if (dx > 1) input.right = true
    else if (dx < -1) input.left = true
    if (Math.abs(aimX - pc) <= 2.5 && !s.playerBullet && freeAt(pc) && (bestBlocked || !fortBlocks(s, pc))) input.fire = true
    return input
}

// One fixed-timestep tick. `input` = { left, right, fire } (fire = rising edge
// handled by the driver; the sim honours a single shot on screen). `rand` is
// the seeded stream. Mutates and returns `s`.
export const step = (s, input, rand) => {
    s.tick++

    if (s.phase === 'over') { s.overTick++; return s }

    // --- player movement ---
    const speed = 3
    if (input.left) s.playerX -= speed
    if (input.right) s.playerX += speed
    s.playerX = Math.max(4, Math.min(GW - PLAYER_W - 4, s.playerX))

    if (s.cooldown > 0) s.cooldown--

    // --- player fire: original allows one shot on screen ---
    if (input.fire && s.cooldown <= 0 && !s.playerBullet && s.phase === 'play') {
        s.playerBullet = { x: s.playerX + PLAYER_W / 2, y: PLAYER_Y - BULLET_H }
        s.cooldown = 10
    }

    // --- respawn countdown ---
    if (s.phase === 'dying') {
        s.respawn--
        if (s.respawn <= 0) {
            s.phase = 'play'
            s.playerX = GW / 2 - PLAYER_W / 2
        }
        // bullets still fall during the death pause; skip invader fire
        advanceBullets(s)
        return s
    }

    // --- invader march (all-on-move, like the original's column sweep) ---
    const act = s.invaders.filter((i) => i.alive)
    if (act.length === 0) {
        s.wave++
        buildFormation(s)
        return s
    }
    const sp = waveSpeed(s.wave)
    let hitEdge = false
    for (const i of act) {
        i.x += s.dir * sp
        if (i.x <= 4 || i.x + INVADER_W >= GW - 4) hitEdge = true
    }
    if (hitEdge) {
        s.dir *= -1
        for (const i of act) i.y += 8
        if (act.some((i) => i.y + INVADER_H >= PLAYER_Y)) {
            // invaders reached the player line — the original ends the game
            s.phase = 'over'
            return s
        }
    }
    // the fleet grinds the forts down as it descends (original overwrite)
    stompBunkers(s)

    // --- invader fire (seeded gameplay entropy) ---
    if (rand() < fireChance(s.wave)) {
        const shooter = act[Math.floor(rand() * act.length)]
        s.enemyBullets.push({ x: shooter.x + INVADER_W / 2, y: shooter.y + INVADER_H })
    }

    // --- mystery UFO ---
    if (!s.ufo && s.tick >= s.ufoNext) {
        s.ufo = { x: -16, points: UFO_POINTS[Math.floor(rand() * UFO_POINTS.length)] }
        s.ufoNext = s.tick + 1200 + Math.floor(rand() * 900)
    }
    if (s.ufo) {
        s.ufo.x += UFO_SPEED
        if (s.ufo.x > GW + 16) s.ufo = null
    }

    // sweep origins before the bullets move (a fast shot skips 2px brick rows)
    const pb0 = s.playerBullet ? s.playerBullet.y : null
    const eb0 = s.enemyBullets.map((b) => b.y)
    advanceBullets(s)

    // --- collisions ---
    if (s.playerBullet) {
        const b = s.playerBullet
        let consumed = shotVsBunkers(s, Math.floor(b.x), b.y, pb0 + BULLET_H, false) // swept up
        if (!consumed) {
            for (const i of s.invaders) {
                if (!i.alive) continue
                if (b.x >= i.x && b.x <= i.x + INVADER_W && b.y <= i.y + INVADER_H && b.y + BULLET_H >= i.y) {
                    i.alive = false
                    s.score += ROW_SCORE[i.row]
                    consumed = true
                    break
                }
            }
        }
        if (!consumed && s.ufo &&
            b.x >= s.ufo.x && b.x <= s.ufo.x + 16 && b.y <= UFO_Y + 6 && b.y >= UFO_Y) {
            s.score += s.ufo.points
            s.ufo = null
            consumed = true
        }
        if (consumed) s.playerBullet = null
    }

    for (let k = 0; k < s.enemyBullets.length; k++) {
        const b = s.enemyBullets[k]
        // the forts shield the player: a falling shot eats one brick and is lost
        if (shotVsBunkers(s, Math.floor(b.x), eb0[k], b.y + BULLET_H, true)) {
            b.y = GH + 99 // consumed by the fort
            continue
        }
        if (b.y >= PLAYER_Y && b.y <= PLAYER_Y + PLAYER_H &&
            b.x >= s.playerX && b.x <= s.playerX + PLAYER_W) {
            b.y = GH + 99 // consumed
            loseLife(s)
            break
        }
    }
    s.enemyBullets = s.enemyBullets.filter((b) => b.y < GH)

    return s
}

const advanceBullets = (s) => {
    if (s.playerBullet) {
        s.playerBullet.y -= 5
        if (s.playerBullet.y < 0) s.playerBullet = null
    }
    for (const b of s.enemyBullets) b.y += 2.5
}

// One shot eats exactly ONE brick: the first filled 2x2 cell the swept 1px
// column crosses, scanning from the leading edge (the shot's tip). A pixel
// sitting on a brick boundary tries the right-hand neighbour. If no filled
// cell is crossed — a slot, or a gap already chewed through — the shot
// passes on to what is behind the fort.
const shotVsBunkers = (s, x, yTop, yBottom, down) => {
    for (const b of s.bunkers) {
        if (x + 1 <= b.x || x >= b.x + BUNKER_W) continue
        const top = Math.max(yTop, b.y) - b.y
        const bot = Math.min(yBottom, b.y + BUNKER_H) - b.y
        if (bot < top) continue
        const r0 = Math.floor(top / 2)
        const r1 = Math.floor((bot - 0.001) / 2)
        const c0 = Math.floor((x - b.x) / 2)
        for (let r = down ? r1 : r0; r !== (down ? r0 - 1 : r1 + 1); r += down ? -1 : 1) {
            for (const c of [c0, c0 + 1]) {
                if (c < 0 || c > 10) continue
                if ((b.cells[r] >> c) & 1) { b.cells[r] &= ~(1 << c); return true }
            }
        }
    }
    return false
}

// A descended invader erases every brick its body overlaps (original
// overwrite — the fleet does not shoot the forts, it walks them down).
const stompBunkers = (s) => {
    for (const i of s.invaders) {
        if (!i.alive) continue
        for (const b of s.bunkers) {
            if (i.x + INVADER_W <= b.x || i.x >= b.x + BUNKER_W) continue
            if (i.y + INVADER_H <= b.y || i.y >= b.y + BUNKER_H) continue
            const c0 = Math.max(0, Math.floor((i.x - b.x) / 2))
            const c1 = Math.min(10, Math.floor((i.x + INVADER_W - b.x - 0.001) / 2))
            const r0 = Math.max(0, Math.floor((i.y - b.y) / 2))
            const r1 = Math.min(7, Math.floor((i.y + INVADER_H - b.y - 0.001) / 2))
            for (let r = r0; r <= r1; r++) {
                let mask = 0
                for (let c = c0; c <= c1; c++) mask |= 1 << c
                b.cells[r] &= ~mask
            }
        }
    }
}

export const loseLife = (s) => {
    s.lives--
    s.enemyBullets = []
    s.playerBullet = null
    if (s.lives <= 0) {
        s.lives = 0
        s.phase = 'over'
    } else {
        s.phase = 'dying'
        s.respawn = RESPAWN_TICKS
    }
}

// State hash for drift checks (harness contract `state.hash`).
export const hash = (s) => {
    let h = 0x811c9dc5 ^ s.tick ^ (s.wave * 2654435761)
    const mix = (v) => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0 }
    mix(s.score); mix(s.lives); mix(Math.round(s.playerX * 100))
    mix(s.dir); mix(s.phase === 'over' ? 7 : s.phase === 'dying' ? 3 : 1)
    for (const i of s.invaders) mix((i.alive ? 1 : 0) * 91 + i.x + i.y * 512)
    for (const b of s.bunkers) {
        let m = b.x
        for (let r = 0; r < BUNKER_ROWS; r++) m = (Math.imul(m, 31) + b.cells[r]) >>> 0
        mix(m)
    }
    for (const b of s.enemyBullets) mix(b.x + b.y * 512)
    mix(s.playerBullet ? s.playerBullet.x + s.playerBullet.y * 512 : -1)
    mix(s.ufo ? Math.round(s.ufo.x * 10) : -2)
    return h >>> 0
}

export const done = (s) => s.phase === 'over'
