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

    advanceBullets(s)

    // --- collisions ---
    if (s.playerBullet) {
        const b = s.playerBullet
        let consumed = false
        for (const i of s.invaders) {
            if (!i.alive) continue
            if (b.x >= i.x && b.x <= i.x + INVADER_W && b.y <= i.y + INVADER_H && b.y + BULLET_H >= i.y) {
                i.alive = false
                s.score += ROW_SCORE[i.row]
                consumed = true
                break
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

    for (const b of s.enemyBullets) {
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
    for (const b of s.enemyBullets) mix(b.x + b.y * 512)
    mix(s.playerBullet ? s.playerBullet.x + s.playerBullet.y * 512 : -1)
    mix(s.ufo ? Math.round(s.ufo.x * 10) : -2)
    return h >>> 0
}

export const done = (s) => s.phase === 'over'
