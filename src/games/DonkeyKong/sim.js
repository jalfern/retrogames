// sim.js — the whole world, play tick and WATCH driver of DONKEY KONG
// (#1637 batch 27).
//
// Pre-lift the whole game lived inside index.jsx's useEffect: the level, the
// physics, the barrels, the dice and the attract AI were all closure locals,
// so nothing could be proven without a browser. This module lifts the rule set
// verbatim (b24/b25/b26 template): makeRun(seed) is the entire world,
// tickDonkeyKong(gs, input) is what update() used to be, and kongcheck proves
// the SHIPPED physics in plain Node — ladders, barrel rolls and ladder dives,
// crush deaths, jump-over points, the top-platform win, the terminal.
// index.jsx keeps only shell: canvas, sound, chrome.
//
// The dice (barrel spacing, the arcade's random ladder dive) ride one
// mulberry32 stream INSIDE gs (#1473 seed-param, b16 law), identical steps to
// seedRng(seed), so ?seed=N replays the exact barrel pattern and a rollout can
// fork the dice by cloning the state.

export const GW = 224
export const GH = 256

export const GRAVITY = 0.25
export const JUMP_FORCE = -4.5
export const SPEED = 1.5
export const LADDER_SPEED = 1.2
export const BARREL_SPEED = 1.2
export const START_LIVES = 3
export const WIN_SCORE = 1000
export const BARREL_DIVE_CHANCE = 0.35 // the original's random ladder take

export const DK_PLAT = 5   // the girder the ape stands on
export const TOP_PLAT = 6   // the girder she stands on

// One mulberry32 state carried INSIDE gs — identical steps to seedRng(seed).
export function rnd(gs) {
    gs.rngState = (gs.rngState + 0x6D2B79F5) | 0
    let t = Math.imul(gs.rngState ^ (gs.rngState >>> 15), 1 | gs.rngState)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const getPlatformY = (plat, px) => plat.y + plat.slope * (px - plat.x)

// Find what platform an entity is standing on (verbatim from the shell).
export function findPlatform(platforms, ex, ey, eh) {
    const footY = ey + eh
    for (const p of platforms) {
        if (ex >= p.x - 2 && ex <= p.x + p.w + 2) {
            const surfaceY = getPlatformY(p, ex)
            if (footY >= surfaceY - 2 && footY <= surfaceY + 6) {
                return p
            }
        }
    }
    return null
}

// Which of the seven girders supports the feet (index, or null mid-air).
export function platformIndex(gs, ex, ey, eh) {
    const footY = ey + eh
    for (let i = 0; i < gs.platforms.length; i++) {
        const p = gs.platforms[i]
        if (ex >= p.x - 2 && ex <= p.x + p.w + 2) {
            const surfaceY = getPlatformY(p, ex)
            if (footY >= surfaceY - 2 && footY <= surfaceY + 6) return i
        }
    }
    return null
}

// Level data — sloped girders like the original. Each platform:
// { x, y, w, slope } (slope = py change per px, positive = slopes right-down);
// ladders: { x, yTop, yBot, broken } (broken ones never mount, only flicker).
export function buildLevel() {
    const platforms = []
    const ladders = []

    const SL = 0.035 // slope magnitude

    // Bottom girder (flat) — ground floor, player starts here
    platforms.push({ x: 0, y: 232, w: GW, slope: 0 })
    // 2nd girder — barrels roll right (slopes down-right), gap on right
    platforms.push({ x: 0, y: 192, w: GW - 16, slope: SL })
    // 3rd girder — barrels roll left (slopes down-left), gap on left
    platforms.push({ x: 16, y: 160, w: GW - 16, slope: -SL })
    // 4th girder — rolls right, gap on right
    platforms.push({ x: 0, y: 128, w: GW - 16, slope: SL })
    // 5th girder — rolls left, gap on left
    platforms.push({ x: 16, y: 96, w: GW - 16, slope: -SL })
    // 6th girder (DK's platform) — barrels start here, rolls right
    platforms.push({ x: 0, y: 72, w: GW, slope: SL * 0.5 })
    // Top platform (Pauline)
    platforms.push({ x: 72, y: 48, w: 80, slope: 0 })

    const addLadder = (x, topPlatIdx, botPlatIdx, broken) => {
        const tp = platforms[topPlatIdx]
        const bp = platforms[botPlatIdx]
        const yTop = getPlatformY(tp, x) + 8  // below top platform surface
        const yBot = getPlatformY(bp, x)      // at bottom platform surface
        ladders.push({ x, yTop, yBot, broken })
    }

    // Floor 0 (ground) ↔ Floor 1
    addLadder(180, 1, 0, false)
    addLadder(120, 1, 0, true)
    // Floor 1 ↔ Floor 2
    addLadder(40, 2, 1, false)
    addLadder(110, 2, 1, true)
    // Floor 2 ↔ Floor 3
    addLadder(180, 3, 2, false)
    addLadder(140, 3, 2, true)
    // Floor 3 ↔ Floor 4
    addLadder(40, 4, 3, false)
    addLadder(90, 4, 3, true)
    // Floor 4 ↔ Floor 5 (DK's level)
    addLadder(180, 5, 4, false)
    // Floor 5 ↔ Top
    addLadder(100, 6, 5, false)
    addLadder(124, 6, 5, false)

    return { platforms, ladders }
}

// ---------------------------------------------------------------------------
// The world. makeRun(seed) is the whole game state: level, player, barrels and
// every die on the run's stream, so ?seed=N replays the exact barrel pattern.
// ---------------------------------------------------------------------------
export function makeRun(seed, opts = {}) {
    const { platforms, ladders } = buildLevel()
    return {
        seed: seed >>> 0,
        rngState: seed | 0,
        tickN: 0,
        score: 0,
        lives: START_LIVES,
        over: false,
        attract: !!opts.attract,
        watching: false, // #1637 b27 — the WATCH seat
        deathTimer: 0,
        winTimer: 0,
        barrelTimer: 180,
        dkThrowing: false,
        dkThrowTimer: 0,
        platforms,
        ladders,
        player: {
            x: 24, y: 216, w: 11, h: 16,
            vx: 0, vy: 0,
            grounded: false, climbing: false,
            dir: 1, frame: 0, walkFrame: 0, climbFrame: 0,
            jumpedBarrels: new Set(),
        },
        barrels: [],
    }
}

function resetPlayer(gs) {
    const p = gs.player
    p.x = 24
    p.y = 216
    p.vx = 0
    p.vy = 0
    p.grounded = false
    p.climbing = false
    p.dir = 1
    p.frame = 0
    p.jumpedBarrels = new Set()
    gs.barrels = []
    gs.barrelTimer = 180
    gs.deathTimer = 0
    gs.winTimer = 0
}

function killPlayer(gs, ev) {
    if (gs.deathTimer > 0) return
    gs.deathTimer = 90
    ev.died = true
}

function spawnBarrel(gs, ev) {
    gs.dkThrowing = true
    gs.dkThrowTimer = 30
    ev.barrel = true
    // Spawn near DK, on the 6th platform
    const dkPlat = gs.platforms[DK_PLAT]
    const spawnX = 48
    const spawnY = dkPlat ? getPlatformY(dkPlat, spawnX) - 10 : 60
    gs.barrels.push({
        x: spawnX, y: spawnY,
        w: 10, h: 10,
        vx: BARREL_SPEED, vy: 0,
        rot: 0,
        onLadder: false,
        falling: false,
    })
}

function updateBarrel(gs, b) {
    if (b.onLadder) {
        // Rolling down a ladder
        b.y += 1.5
        b.rot += 0.1

        // Check if reached bottom of ladder
        if (b.y + b.h >= (b.ladderBot || 999)) {
            b.onLadder = false
            b.falling = false
            // Find the platform at the bottom
            const onPlat = findPlatform(gs.platforms, b.x + b.w / 2, b.y, b.h)
            if (onPlat) {
                const surfaceY = getPlatformY(onPlat, b.x + b.w / 2)
                b.y = surfaceY - b.h
                b.vy = 0
                if (onPlat.slope < 0) b.vx = -BARREL_SPEED
                else if (onPlat.slope > 0) b.vx = BARREL_SPEED
                else b.vx = BARREL_SPEED
            } else {
                // Fell off — just apply gravity
                b.vy = 0
                b.vx = BARREL_SPEED
            }
        }
        return
    }

    // Apply gravity
    b.vy += GRAVITY
    b.y += b.vy
    b.x += b.vx
    b.rot += b.vx * 0.15

    // Platform collision
    let landed = false
    for (const p of gs.platforms) {
        const cx = b.x + b.w / 2
        if (cx >= p.x && cx <= p.x + p.w) {
            const surfaceY = getPlatformY(p, cx)
            if (b.y + b.h >= surfaceY && b.y + b.h < surfaceY + 10 && b.vy >= 0) {
                b.y = surfaceY - b.h
                b.vy = 0
                b.falling = false
                landed = true

                // Roll in direction of slope
                if (p.slope < 0) b.vx = -BARREL_SPEED
                else if (p.slope > 0) b.vx = BARREL_SPEED
                break
            }
        }
    }

    // Check if barrel should take a ladder down
    if (landed && !b.falling) {
        for (const l of gs.ladders) {
            if (l.broken) continue
            const cx = b.x + b.w / 2
            // Barrel feet should be near the top of this ladder
            if (Math.abs(cx - l.x) < 6 && Math.abs((b.y + b.h) - (l.yTop - 8)) < 6) {
                // Random chance to take ladder (like the original)
                if (rnd(gs) < BARREL_DIVE_CHANCE) {
                    b.onLadder = true
                    b.x = l.x - b.w / 2
                    b.vx = 0
                    b.vy = 0
                    b.ladderBot = l.yBot
                    break
                }
            }
        }
    }

    // Edge of platform — fall off
    if (!b.onLadder) {
        const onPlat = findPlatform(gs.platforms, b.x + b.w / 2, b.y, b.h)
        if (!onPlat && b.vy === 0) {
            b.falling = true
        }
    }
}

// The attract demo (pre-lift, verbatim): run toward the nearest climbable
// ladder base, climb, jump anything near on the same band.
function attractPlan(gs) {
    const p = gs.player
    let moveDir = 0
    let wantJump = false
    let wantClimbUp = false

    if (p.climbing) {
        wantClimbUp = true
    } else {
        let bestLadder = null
        let bestDist = Infinity
        for (const l of gs.ladders) {
            if (l.broken) continue
            const footY = p.y + p.h
            if (Math.abs(l.yBot - footY) < 6) {
                const dist = Math.abs(p.x - l.x)
                if (dist < bestDist) { bestDist = dist; bestLadder = l }
            }
        }

        if (bestLadder && bestDist < 6) {
            wantClimbUp = true
        } else if (bestLadder) {
            moveDir = bestLadder.x > p.x ? 1 : -1
        } else {
            moveDir = p.dir
            if (p.x < 20) moveDir = 1
            if (p.x > GW - 20) moveDir = -1
        }

        for (const b of gs.barrels) {
            if (Math.abs(b.y - p.y) < 16 && Math.abs(b.x - p.x) < 30 && p.grounded) {
                wantJump = true
            }
        }
    }
    return { moveDir, wantJump, wantClimbUp, wantClimbDown: false }
}

// ---------------------------------------------------------------------------
// One full play tick, lifted verbatim from index.jsx update() (#1637 b27) so
// kongcheck proves the SHIPPED physics: gravity and girders, ladder mount and
// dismount with the foot-snap, the sloped barrel roll with its random dives,
// crush death, jump-over points, the top-platform win, lives and the terminal.
// Mutates gs; returns the events index.jsx turns into sound. `input`
// ({left,right,up,down,jump}) is the held-key view; while watching with no
// human input, watchStep drives instead.
// ---------------------------------------------------------------------------
export function tickDonkeyKong(gs, input = null) {
    const ev = { jump: false, jumpedBarrel: 0, died: false, respawn: false, won: false, over: false, barrel: false }
    const p = gs.player
    gs.tickN++
    if (gs.over) { ev.over = true; return ev }

    // Death animation
    if (gs.deathTimer > 0) {
        gs.deathTimer--
        if (gs.deathTimer <= 0) {
            gs.lives--
            if (gs.lives <= 0) {
                gs.over = true
                ev.over = true
            } else {
                resetPlayer(gs)
                ev.respawn = true
            }
        }
        return ev
    }

    // Win animation
    if (gs.winTimer > 0) {
        gs.winTimer--
        if (gs.winTimer <= 0) {
            gs.score += WIN_SCORE
            resetPlayer(gs)
        }
        return ev
    }

    // DK throwing animation
    if (gs.dkThrowing) {
        gs.dkThrowTimer--
        if (gs.dkThrowTimer <= 0) gs.dkThrowing = false
    }

    // ---- CONTROLS ----
    let plan
    if (gs.attract) {
        plan = attractPlan(gs)
    } else {
        const act = input || (gs.watching ? watchStep(gs) : {})
        plan = {
            moveDir: (act.right ? 1 : 0) - (act.left ? 1 : 0),
            wantJump: !!act.jump && p.grounded && !p.climbing,
            wantClimbUp: !!act.up,
            wantClimbDown: !!act.down,
        }
    }
    const { moveDir, wantJump, wantClimbUp, wantClimbDown } = plan

    // ---- LADDER LOGIC ----
    const nearLadder = gs.ladders.find(l => {
        if (l.broken) return false
        const cx = p.x + p.w / 2
        return Math.abs(cx - l.x) < 8 &&
            p.y + p.h > l.yTop &&
            p.y + p.h <= l.yBot + 4
    })

    if (p.climbing) {
        if (wantClimbUp) {
            p.y -= LADDER_SPEED
            p.climbFrame++
        } else if (wantClimbDown) {
            p.y += LADDER_SPEED
            p.climbFrame++
        }
        p.vx = 0
        p.vy = 0

        // Check if reached top or bottom of ladder
        if (!nearLadder) {
            p.climbing = false
            // Snap to nearest platform
            const plat = findPlatform(gs.platforms, p.x + p.w / 2, p.y, p.h)
            if (plat) {
                p.y = getPlatformY(plat, p.x + p.w / 2) - p.h
                p.grounded = true
            }
        }
    } else {
        // Try to mount ladder
        if (nearLadder && (wantClimbUp || wantClimbDown)) {
            p.x = nearLadder.x - p.w / 2
            p.climbing = true
            p.vy = 0
            p.vx = 0
        }

        if (!p.climbing) {
            p.vx = moveDir * SPEED
            if (moveDir !== 0) p.dir = moveDir

            if (wantJump && p.grounded) {
                p.vy = JUMP_FORCE
                p.grounded = false
                ev.jump = true
            }
        }
    }

    // ---- PHYSICS ----
    if (!p.climbing) {
        p.vy += GRAVITY
        p.y += p.vy
        p.x += p.vx
    }

    // Walking animation
    if (Math.abs(p.vx) > 0.1 && p.grounded) p.walkFrame++
    p.frame++

    // Platform collision
    p.grounded = false
    if (!p.climbing && p.vy >= 0) {
        for (const pl of gs.platforms) {
            const cx = p.x + p.w / 2
            if (cx >= pl.x && cx <= pl.x + pl.w) {
                const surfaceY = getPlatformY(pl, cx)
                if (p.y + p.h >= surfaceY && p.y + p.h < surfaceY + 8) {
                    p.y = surfaceY - p.h
                    p.vy = 0
                    p.grounded = true
                    break
                }
            }
        }
    }

    // Wall constraints
    if (p.x < 0) p.x = 0
    if (p.x > GW - p.w) p.x = GW - p.w

    // Fall death
    if (p.y > GH + 10) killPlayer(gs, ev)

    // ---- BARRELS ----
    gs.barrelTimer--
    if (gs.barrelTimer <= 0) {
        spawnBarrel(gs, ev)
        gs.barrelTimer = 150 + Math.floor(rnd(gs) * 100)
    }

    for (let i = gs.barrels.length - 1; i >= 0; i--) {
        const b = gs.barrels[i]
        updateBarrel(gs, b)

        // Remove if off screen
        if (b.y > GH + 20) {
            gs.barrels.splice(i, 1)
            continue
        }

        // Collision with player
        if (gs.deathTimer <= 0 && gs.winTimer <= 0) {
            const dx = (p.x + p.w / 2) - (b.x + b.w / 2)
            const dy = (p.y + p.h / 2) - (b.y + b.h / 2)
            if (Math.abs(dx) < 8 && Math.abs(dy) < 10) {
                killPlayer(gs, ev)
            }

            // Score for jumping over barrels
            if (p.vy < 0 || !p.grounded) {
                if (Math.abs(dx) < 16 && dy < 0 && dy > -24 && !p.jumpedBarrels.has(b)) {
                    p.jumpedBarrels.add(b)
                    gs.score += 100
                    ev.jumpedBarrel++
                }
            }
        }
    }

    // ---- WIN CONDITION ----
    if (p.y + p.h < 56 && p.x > 72 && p.x < 152) {
        gs.winTimer = 90
        ev.won = true
    }
    return ev
}

// ---------------------------------------------------------------------------
// WATCH driver (#1637 batch 27). Reactive against live state every tick (Rogue
// law): seats anywhere, steers back, re-seats from exactly there. No rand in
// the policy — rollouts clone the world and fork the dice from the state, so
// every candidate is judged under identical future weather and the Node sweep
// and the seat drive ONE identical policy.
// ---------------------------------------------------------------------------

// The proven route: from the start corner, the six usable ladders zigzag to
// her girder. Each entry is the ladder x to climb FROM that girder. The two
// open ladders at the top (x 100 / 124) both land inside the win zone.
const ROUTE = [
    { plat: 0, x: 180 },
    { plat: 1, x: 40 },
    { plat: 2, x: 180 },
    { plat: 3, x: 40 },
    { plat: 4, x: 180 },
    { plat: 5, x: 100 },
]

const WATCH_HORIZON = 90  // ~1.5 s — a segment (walk + climb) fits inside
const HOLD = 8

// Clone only what the tick mutates. The level is read-only: shared refs.
function cloneWorld(gs) {
    const barrels = gs.barrels.map(b => ({ ...b }))
    const ref = new Map()
    gs.barrels.forEach((b, i) => ref.set(b, barrels[i]))
    return {
        seed: gs.seed,
        rngState: gs.rngState,
        tickN: gs.tickN,
        score: gs.score,
        lives: gs.lives,
        over: false,
        attract: false,
        watching: false,
        deathTimer: gs.deathTimer,
        winTimer: gs.winTimer,
        barrelTimer: gs.barrelTimer,
        dkThrowing: false,
        dkThrowTimer: 0,
        platforms: gs.platforms,
        ladders: gs.ladders,
        player: {
            ...gs.player,
            jumpedBarrels: new Set([...gs.player.jumpedBarrels].map(b => ref.get(b)).filter(Boolean)),
        },
        barrels,
    }
}

// How far up the proven route the runner is: metres of height (feet above the
// ground girder, monotone through climbs, exits and falls) plus a slim bonus
// for standing near the route's next ladder. Height-based on purpose: a
// target+fraction scale lets mid-ladder credit OUTRANK a finished exit, which
// teaches the rollout to hang on ladders instead of climbing out.
function progress(c) {
    const p = c.player
    const footY = p.y + p.h
    const h = Math.max(0, 232 - footY) // px of height above the ground girder
    if (p.climbing) return h * 10 + 8 // on a ladder = fully committed to the route
    let align = 0
    const pi = platformIndex(c, p.x + p.w / 2, p.y, p.h)
    if (pi !== null) {
        const wp = ROUTE.find(r => r.plat === pi)
        if (wp) align = Math.max(0, 8 - Math.abs(wp.x - (p.x + p.w / 2)) * 0.1)
    }
    return h * 10 + align
}

// The obvious play: climb the route's ladder when nothing is riding it, wait
// when something is, jump a barrel that reaches you on your girder.
function greedy(c) {
    const p = c.player

    if (p.climbing) {
        // Ride up — unless a barrel is coming down THIS ladder just above us.
        // Retreat DOWN while there is room left (the arcade's footwork); the
        // bottom exit snaps onto the girder, where the dive passes harmlessly.
        let gapUp = Infinity
        for (const b of c.barrels) {
            if (b.onLadder && Math.abs(b.x + b.w / 2 - (p.x + p.w / 2)) < 8 && b.y < p.y) {
                gapUp = Math.min(gapUp, p.y - (b.y + b.h))
            }
        }
        if (gapUp < 16) return { left: false, right: false, up: false, down: true, jump: false }
        return { left: false, right: false, up: true, down: false, jump: false }
    }

    const pi = platformIndex(c, p.x + p.w / 2, p.y, p.h)
    if (pi === null) return { left: false, right: false, up: false, down: false, jump: false }
    const wp = ROUTE.find(r => r.plat === pi)
    if (!wp) return { left: false, right: false, up: false, down: false, jump: false }

    const cx = p.x + p.w / 2
    const dx = wp.x - cx
    const dir = dx > 0 ? 1 : -1

    // Barrel threats on THIS girder (feet within one band, moving or not).
    const footY = p.y + p.h
    const near = c.barrels
        .filter(b => !b.onLadder && Math.abs((b.y + b.h) - footY) < 12 && Math.abs(b.x - cx) < 30)
        .sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx))[0]

    // Is the route ladder safe to board? A barrel riding it, or rolling onto
    // its top on the girder above, drops onto the runner mid-climb.
    const ladderSafe = () => {
        for (const b of c.barrels) {
            const bx = b.x + b.w / 2
            if (b.onLadder && Math.abs(bx - wp.x) < 6) {
                const l = c.ladders.find(la => !la.broken && Math.abs(la.x - wp.x) < 2)
                if (l && b.ladderBot === l.yBot && b.y + b.h > l.yTop - 2) return false
            }
            const lTop = c.platforms.findIndex(pl => getPlatformY(pl, wp.x) + 8 === (c.ladders.find(la => !la.broken && Math.abs(la.x - wp.x) < 2) || {}).yTop)
            if (lTop >= 0) {
                const surf = getPlatformY(c.platforms[lTop], wp.x)
                const onTop = Math.abs((b.y + b.h) - surf) < 12 && Math.abs(bx - wp.x) < 26
                if (onTop && Math.sign(bx - wp.x) === Math.sign(-b.vx || -1)) return false // rolling in
            }
        }
        return true
    }

    const atLadder = Math.abs(dx) <= 1.5

    // Jump a barrel that actually reaches us: same band, ahead of us in our
    // walking direction or overtaking from behind, inside an arc's runway.
    const jumpNear = (walkDir) => {
        if (!near || !p.grounded) return false
        const bx = near.x + near.w / 2
        const gap = bx - cx
        const closing = Math.abs(near.vx) > 0 && Math.sign(gap) * Math.sign(near.vx) < 0 // rolling at us
        const ahead = Math.sign(gap) === walkDir && gap > 2
        const behind = Math.sign(gap) === -walkDir && Math.abs(gap) < 14
        return (ahead || behind || closing) && Math.abs(gap) < 24
    }

    if (atLadder && ladderSafe()) return { left: false, right: false, up: true, down: false, jump: false }

    // Blocked at the mouth: stand OFF it, back the way we came, at a fixed
    // standoff — a dancer twitching at the foot of the ladder gets speared by
    // whatever comes down it. Retreat to 22 px, hold there, walk in when clear.
    const STANDOFF = 22
    if (!ladderSafe()) {
        if (atLadder) {
            return {
                left: dir === 1, right: dir === -1, up: false, down: false,
                jump: jumpNear(-dir),
            }
        }
        if (Math.abs(dx) < STANDOFF) {
            const away = -dir
            return {
                left: away === -1, right: away === 1, up: false, down: false,
                jump: jumpNear(away),
            }
        }
        return { left: false, right: false, up: false, down: false, jump: jumpNear(dir) }
    }

    return {
        left: dir === -1,
        right: dir === 1,
        up: false,
        down: false,
        jump: jumpNear(dir),
    }
}

function rollout(gs, cand) {
    const c = cloneWorld(gs)
    const p0 = progress(c)
    let maxP = p0
    let minBarrelGap = Infinity
    let jumped = 0
    for (let t = 0; t < WATCH_HORIZON; t++) {
        const ev = tickDonkeyKong(c, t < HOLD ? cand : greedy(c))
        if (ev.died) return t * 10 // dying at any tick is the bottom of the class
        if (ev.won) return WATCH_HORIZON * 100000 + (WATCH_HORIZON - t) * 1000
        jumped += ev.jumpedBarrel
        maxP = Math.max(maxP, progress(c))
        let gap = Infinity
        for (const b of c.barrels) gap = Math.min(gap, Math.hypot(b.x - c.player.x, b.y - c.player.y))
        if (gap < minBarrelGap) minBarrelGap = gap
    }
    const p1 = progress(c)
    // Danger dominates shaping: any point in the rollout spent 24 px from a
    // barrel pays per px of closeness. The horizon cannot see the 3-px kill at
    // its far edge, and neither can a player who plans past it — a candidate
    // that ends the horizon clinging to a barrel is not "safe so far".
    const danger = Math.max(0, 24 - Math.min(minBarrelGap, 24)) * 14
    const shaping =
        maxP * 900 +                    // highest girder reached dominates
        Math.max(0, p1 - p0) * 400 +  // net ground made
        // Ground made then partly lost still counts: credit the best margin
        // over the start even if the runner slipped back (walking off an edge
        // costs less than standing still, and the ladder is still worth
        // approaching) — capped so a doomed walk can't outvalue the climb.
        Math.max(0, maxP - p0) * 120 +
        jumped * 150 -                // the arcade pays for barrel arcs — so does the driver
        danger
    return WATCH_HORIZON * 1000 + shaping
}

// On this girder, is anything close enough that an arc might be the right
// answer? Jump candidates only compete when a barrel is near (see below).
function barrelThreat(gs) {
    const p = gs.player
    const footY = p.y + p.h
    return gs.barrels.some(b => !b.onLadder && Math.abs((b.y + b.h) - footY) < 14 && Math.abs(b.x - p.x) < 34)
}

// Candidate order IS the tie-break: climb first (the route is the win), then
// walk the girder, dodge, and only then stand — the arcade player's instinct.
const WALK_CANDS = [
    { up: true },
    { right: true },
    { left: true },
    { down: true },
    {},
]
const JUMP_CANDS = [
    { right: true, jump: true },
    { left: true, jump: true },
    { jump: true },
]

// Null = nothing steerable yet (game over, attract, the death/win animation —
// the honest wait; the shell releases the watcher at the terminal anyway).
// The arcade doctrine that keeps this a ROUTE and not a exploit: the girder
// gap is 34 px and the jump arc is 40 — a kangaroo could hop the whole tower.
// The original never did: jumps are for barrels, ladders are for climbing. So
// jump candidates only compete when a barrel is actually near, and progress
// credit flows through the route's ladders.
export function watchStep(gs) {
    if (gs.over || gs.attract) return null
    if (gs.deathTimer > 0 || gs.winTimer > 0) return null
    const cands = barrelThreat(gs) ? [...WALK_CANDS, ...JUMP_CANDS] : WALK_CANDS
    let best = null
    let bestV = -Infinity
    // The immediate greedy play competes as candidate zero: when the horizon
    // genuinely cannot separate actions, the route instinct keeps the wheel.
    for (const cand of [greedy(gs), ...cands.map(c => ({ left: !!c.left, right: !!c.right, up: !!c.up, down: !!c.down, jump: !!c.jump }))]) {
        const v = rollout(gs, cand)
        if (v > bestV) { bestV = v; best = cand }
    }
    return best || { left: false, right: false, up: false, down: false, jump: false }
}

// FNV-1a over everything the physics carries — the sweep's byte-equal replay
// witness and the contract state hash. Decorative poses (DK chest-beat, walk
// frames) are deliberately out: they can never differ under equal inputs.
export function stateHash(gs) {
    const r4 = (n) => Math.round(n * 1e4)
    const p = gs.player
    let s = `K${gs.tickN}|${gs.score}|${gs.lives}|${gs.over ? 1 : 0}|${gs.deathTimer}|${gs.winTimer}|${gs.barrelTimer}|${gs.rngState}|`
    s += `${r4(p.x)},${r4(p.y)},${r4(p.vx)},${r4(p.vy)},${p.grounded ? 1 : 0},${p.climbing ? 1 : 0},${p.dir},${p.jumpedBarrels.size}|`
    s += gs.barrels.map(b => `${r4(b.x)},${r4(b.y)},${r4(b.vx)},${r4(b.vy)},${b.onLadder ? 1 : 0},${b.falling ? 1 : 0},${b.ladderBot || 0}`).join(';')
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    return (h >>> 0).toString(36)
}
