// MARBLE MADNESS — pure simulation. step(gs, input), zero Math.random(): the
// clock, the pendulums, the wave and every hazard phase are functions of gs.tick,
// so scripts/marblecheck.mjs can audit the rules and replay the pilot run
// hash-for-hash in plain Node.
//
// The load-bearing rules (the ones the harness pins):
//   - arrows are ACCELERATION, not velocity: inertia, friction, and gravity
//     along the fall-line of the heightmap; SILLY flips the slope sign.
//   - the void under the marble, or a landing BREAKDROP or more tile-steps
//     below the ledge you left, shatters the marble (a life).
//   - the clock runs per race; leftover seconds ride along: the next race's
//     clock = its base + what you saved, and the saved time banks as
//     secs * 100 * (race+1). Practice's clock expiring only restarts it.
//   - steelie rams (knockback, not a kill — the cliff does the killing),
//     acid slinkies kill, green slinkies bounce, munchers eat you when the
//     jaw closes, hammers crush you under the strike, the wave hurls you.

import { RACES, GRID, BREAKDROP, WIN_BONUS, EXTRA_LIFE, buildHeights } from './levels.js'

export { RACES, GRID, BREAKDROP }

export const CFG = {
    acc: 0.005,           // tiles/tick² from the trackball
    fric: 0.992,
    brakeBoost: 1.8,     // pushing against the roll is a hard reverse
    brakeFric: 0.96,     // pushing against the roll stops you, eventually
    slopeK: 0.004,        // gravity along d(z)/d(tile)
    sillyBias: 0.0009,    // SILLY extra pull toward the far edge
    maxV: 0.24,
    grav: 0.012,          // vz decay while airborne (tiles/tick²)
    steelSpeed: 0.062,
    steelR: 0.85, knock: 0.10,
    hammerR: 0.42, hammerLow: 0.65, hammerReach: 1.8, hammerW: 0.035,
    munchR: 0.9, munchCycle: 200, munchSnap: 120, munchHold: 15,
    slinkyR: 0.55, slinkyUp: 0.32,
    throwVX: 0.10, throwVZ: 0.30,
    bounceRest: 0.45,     // SILLY floors are trampolines
    goalR: 1.0,
    deathT: 90, clearT: 130,
    maxLives: 5,
    respawnInvuln: 90,
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function fnv(str) {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return h.toString(16)
}

// ---------------------------------------------------------------- terrain ----
export function cellAt(gs, x, y) {
    const c = Math.floor(x), r = Math.floor(y)
    if (r < 0 || c < 0 || r >= GRID || c >= GRID) return null
    return gs.heights[r][c]
}

export function waveZ(gs, x, y) {
    let z = 0
    for (const w of gs.waves) {
        if (x < w.x0 || x > w.x1 + 1 || y < w.y0 || y > w.y1 + 1) continue
        const s = Math.sin((x - gs.tick * w.speed * 2) * 0.55)
        if (s > 0) z = Math.max(z, s * w.amp)
    }
    return z
}

// bilinear ground height at continuous (x,y); null when the local cell is void.
// Void neighbors clamp to the current cell's height so the marble rolls to the
// lip before the void check catches it.
export function groundAt(gs, x, y) {
    const z0 = cellAt(gs, x, y)
    if (z0 == null || z0 < 0) return null
    const c = Math.floor(x), r = Math.floor(y)
    let gx = x - (c + 0.5), gy = y - (r + 0.5)
    const zc = z0 + waveZ(gs, x, y)
    let z = zc
    if (gx !== 0) {
        const nc = c + Math.sign(gx)
        const nz = nc >= 0 && nc < GRID && gs.heights[r][nc] >= 0 ? gs.heights[r][nc] + waveZ(gs, nc + 0.5, y) : z0
        z += (nz - z0) * Math.abs(gx)
    }
    if (gy !== 0) {
        const nr = r + Math.sign(gy)
        const nz = nr >= 0 && nr < GRID && gs.heights[nr][c] >= 0 ? gs.heights[nr][c] + waveZ(gs, x, nr + 0.5) : z0
        z += (nz - z0) * Math.abs(gy)
    }
    return z
}

const solidCell = (gs, r, c) => r >= 0 && c >= 0 && r < GRID && c < GRID && gs.heights[r][c] >= 0
// walkable step between solid cells (planner + steelie pathing predicate)
export const stepOk = (gs, r1, c1, r2, c2) =>
    solidCell(gs, r1, c1) && solidCell(gs, r2, c2) && Math.abs(gs.heights[r2][c2] - gs.heights[r1][c1]) <= 2

// ---------------------------------------------------------------- setup ----
export function makeGame(seed = 0) {
    const gs = {
        seed, tick: 0, raceIdx: 0, score: 0, lives: 3,
        phase: 'play', phaseT: 0, end: null, events: [],
        timeT: 0, carry: 0, secsWarned: -1, upTo: EXTRA_LIFE,
        clears: 0, deaths: 0,
        heights: null, waves: [], race: null,
        m: null, steelies: [], munchers: [], slinkies: [], hammers: [], knockT: 0,
        invulnT: 0,
    }
    loadRace(gs, 0, 0)
    return gs
}

function loadRace(gs, idx, carryTicks) {
    gs.raceIdx = idx
    gs.race = RACES[idx]
    gs.heights = buildHeights(idx)
    gs.waves = (RACES[idx].waves || []).map((w) => ({ ...w }))
    gs.timeT = RACES[idx].time * 60 + carryTicks
    gs.carry = carryTicks
    gs.secsWarned = -1
    gs.phase = 'play'; gs.phaseT = 0
    gs.m = { x: RACES[idx].start.c + 0.5, y: RACES[idx].start.r + 0.5, vx: 0, vy: 0, z: gs.heights[RACES[idx].start.r][RACES[idx].start.c], vz: 0, air: false, zFrom: 0, dir: [1, 1] }
    gs.steelies = (RACES[idx].steelies || []).map((s) => ({ x: s.c + 0.5, y: s.r + 0.5, hx: s.c + 0.5, hy: s.r + 0.5, vx: 0, vy: 0 }))
    gs.munchers = (RACES[idx].munchers || []).map((mo) => ({ c: mo.c, r: mo.r, phase: mo.phase }))
    gs.slinkies = (RACES[idx].slinkies || []).map((s) => ({ c: s.c, r: s.r, acid: !!s.acid, cool: 0 }))
    gs.hammers = (RACES[idx].hammers || []).map((h) => ({ c: h.c, r: h.r, phase: h.phase }))
    gs.invulnT = CFG.respawnInvuln
}

// screen-space push -> world-space direction. Keys are unit screen vectors
// scaled by the iso diamond (sx=6*(x-y), sy=3*(x+y)); the inverse maps
// left+down to true south, right+down to true south-east.
export function screenToWorld(ix, iy) {
    const wx = (ix + iy) / 2
    const wy = (iy - ix) / 2
    const n = Math.hypot(wx, wy) || 1
    return [wx / n, wy / n]
}

// ---------------------------------------------------------------- death ----
function killMarble(gs, how) {
    if (gs.phase !== 'play' || gs.invulnT > 0) return
    gs.deaths++
    gs.lives--
    gs.phase = 'dying'
    gs.phaseT = CFG.deathT
    gs.events.push({ type: 'shatter', how, lives: gs.lives, x: gs.m.x, y: gs.m.y, z: gs.m.z })
}

function respawn(gs) {
    if (gs.lives <= 0) { gs.end = 'over'; gs.events.push({ type: 'over' }); return }
    const R = RACES[gs.raceIdx]
    gs.m = { x: R.start.c + 0.5, y: R.start.r + 0.5, vx: 0, vy: 0, z: gs.heights[R.start.r][R.start.c], vz: 0, air: false, zFrom: 0, dir: [1, 1] }
    gs.phase = 'play'
    gs.events.push({ type: 'respawn', race: gs.raceIdx })
}

function addScore(gs, pts) {
    gs.score += pts
    if (gs.score >= gs.upTo) { gs.lives = Math.min(CFG.maxLives, gs.lives + 1); gs.upTo += EXTRA_LIFE; gs.events.push({ type: '1up' }) }
}

// ---------------------------------------------------------------- hazards ----
function updateSteelies(gs) {
    const m = gs.m
    for (const s of gs.steelies) {
        // a steelie holds its post: it chases what strays near, but will not
        // leave its stretch of the course (and climbs no more than one step)
        const homeD = Math.hypot(m.x - s.hx, m.y - s.hy)
        const chasing = homeD < 9
        const tx = chasing ? m.x : s.hx
        const ty = chasing ? m.y : s.hy
        const dx = tx - s.x, dy = ty - s.y
        const d = Math.hypot(dx, dy) || 1
        let ux = dx / d, uy = dy / d
        const sr = Math.floor(s.y), sc = Math.floor(s.x)
        const nx = s.x + ux * CFG.steelSpeed, ny = s.y + uy * CFG.steelSpeed
        if (!steelStep(gs, sr, sc, Math.floor(ny), Math.floor(nx))) {
            if (steelStep(gs, sr, sc, sr, Math.floor(nx))) uy = 0
            else if (steelStep(gs, sr, sc, Math.floor(ny), sc)) ux = 0
            else { ux = 0; uy = 0 }
        }
        s.vx = ux * CFG.steelSpeed; s.vy = uy * CFG.steelSpeed
        s.x += s.vx; s.y += s.vy
        const pdx = m.x - s.x, pdy = m.y - s.y
        const pd = Math.hypot(pdx, pdy) || 1
        if (pd < CFG.steelR && gs.phase === 'play') {
            const kx = pdx / pd, ky = pdy / pd
            if (gs.knockT <= 0) {
                m.vx += kx * CFG.knock; m.vy += ky * CFG.knock
                if (!m.air) m.vz = Math.max(m.vz, 0.10)
                gs.knockT = 40
                gs.events.push({ type: 'steelieHit', x: m.x, y: m.y })
            }
            // equal and opposite: the two marbles part, no cannon-fodder cornering
            const sxn = s.x - kx * 0.5, syn = s.y - ky * 0.5
            const nr = Math.floor(syn), ncol = Math.floor(sxn)
            if (steelStep(gs, sr, sc, nr, ncol)) { s.x = sxn; s.y = syn }
        }
    }
}

const steelStep = (gs, r1, c1, r2, c2) =>
    solidCell(gs, r1, c1) && solidCell(gs, r2, c2) && Math.abs(gs.heights[r2][c2] - gs.heights[r1][c1]) <= 1

function updateHammers(gs) {
    const m = gs.m
    for (const h of gs.hammers) {
        const ang = Math.sin((gs.tick + h.phase) * CFG.hammerW) * 1.9
        const hx = h.c + 0.5 + Math.sin(ang) * CFG.hammerReach
        const hy = h.r + 0.5
        const low = Math.abs(ang) < CFG.hammerLow
        h.hx = hx; h.hy = hy; h.low = low
        if (low && !m.air && Math.hypot(m.x - hx, m.y - hy) < CFG.hammerR) killMarble(gs, 'hammer')
    }
}

function updateMunchers(gs) {
    const m = gs.m
    for (const mo of gs.munchers) {
        const ph = (gs.tick + mo.phase) % CFG.munchCycle
        mo.open = ph < CFG.munchSnap
        mo.snapping = ph >= CFG.munchSnap && ph < CFG.munchSnap + CFG.munchHold
        if (ph === CFG.munchSnap && Math.hypot(m.x - (mo.c + 0.5), m.y - (mo.r + 0.5)) < CFG.munchR) killMarble(gs, 'munch')
    }
}

function updateSlinkies(gs) {
    const m = gs.m
    for (const s of gs.slinkies) {
        if (s.cool > 0) { s.cool--; continue }
        if (Math.hypot(m.x - (s.c + 0.5), m.y - (s.r + 0.5)) < CFG.slinkyR && !m.air) {
            if (s.acid) { killMarble(gs, 'acid'); return }
            s.cool = 30
            m.vz = CFG.slinkyUp
            m.vx *= 1.15; m.vy *= 1.15
            gs.events.push({ type: 'bounce', x: m.x, y: m.y })
        }
    }
}

function updateWave(gs) {
    const m = gs.m
    if (m.air) return
    for (const w of gs.waves) {
        if (m.x < w.x0 + 0.5 || m.x > w.x1 + 0.5 || m.y < w.y0 + 0.5 || m.y > w.y1 + 0.5) continue
        const s = Math.sin((m.x - gs.tick * w.speed * 2) * 0.55)
        const prev = Math.sin((m.x - (gs.tick - 1) * w.speed * 2) * 0.55)
        if (prev <= 0.97 && s > 0.97) {
            m.vx += w.dir * CFG.throwVX
            m.vz = CFG.throwVZ
            gs.events.push({ type: 'throw', x: m.x, y: m.y })
        }
    }
}

// ---------------------------------------------------------------- marble ----
function updateMarble(gs, inp) {
    const m = gs.m
    let ix = 0, iy = 0
    if (inp.left) ix -= 1
    if (inp.right) ix += 1
    if (inp.up) iy -= 1
    if (inp.down) iy += 1
    const e = 0.25
    const gz = groundAt(gs, m.x, m.y)

    let ax = 0, ay = 0
    if (!m.air) {
        if (gz == null) {
            m.air = true; m.zFrom = m.z; m.vz = Math.min(m.vz, 0)
            gs.events.push({ type: 'overEdge', x: m.x, y: m.y })
        } else {
            if (ix !== 0 || iy !== 0) {
                const [wx, wy] = screenToWorld(ix, iy)
                ax += wx * CFG.acc; ay += wy * CFG.acc
                m.dir = [Math.sign(wx) || m.dir[0], Math.sign(wy) || m.dir[1]]
            }
            const gx = (groundAt(gs, m.x + e, m.y) ?? gz) - (groundAt(gs, m.x - e, m.y) ?? gz)
            const gy = (groundAt(gs, m.x, m.y + e) ?? gz) - (groundAt(gs, m.x, m.y - e) ?? gz)
            const sg = gs.race.reversed ? 1 : -1 // SILLY falls uphill
            ax += sg * gx * CFG.slopeK
            ay += sg * gy * CFG.slopeK
            if (gs.race.reversed) ay -= CFG.sillyBias
            if (ax * m.vx + ay * m.vy < 0) { ax *= CFG.brakeBoost; ay *= CFG.brakeBoost }
            m.vx += ax; m.vy += ay
            m.z = gz
        }
    } else {
        m.vz -= CFG.grav
        m.z += m.vz
        const g = groundAt(gs, m.x, m.y)
        if (g != null && m.vz < 0 && m.z <= g + 0.02) {
            const drop = m.zFrom - g
            if (drop > BREAKDROP) { killMarble(gs, 'shatter'); return }
            m.z = g; m.air = false; m.vz = 0
            if (gs.race.reversed) m.vz = Math.max(0, drop * CFG.bounceRest * 0.5)
            gs.events.push({ type: 'land', drop })
        } else if (g == null && m.z <= -1.5) {
            killMarble(gs, 'void')
            return
        }
    }
    const braking = ax * m.vx + ay * m.vy < 0
    m.vx *= braking ? CFG.brakeFric : CFG.fric
    m.vy *= braking ? CFG.brakeFric : CFG.fric
    const sp = Math.hypot(m.vx, m.vy)
    if (sp > CFG.maxV) { m.vx *= CFG.maxV / sp; m.vy *= CFG.maxV / sp }
    const nx = m.x + m.vx, ny = m.y + m.vy
    // off the grid edge is the void
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) { killMarble(gs, 'void'); return }
    m.x = nx; m.y = ny
    if (!m.air) {
        const g2 = groundAt(gs, m.x, m.y)
        if (g2 != null) m.z = g2
    }
    if (gs.invulnT > 0) gs.invulnT--
}

// ---------------------------------------------------------------- clock ----
function updateClock(gs) {
    gs.timeT--
    const secs = Math.ceil(gs.timeT / 60)
    if (secs <= 10 && secs !== gs.secsWarned && secs > 0) { gs.secsWarned = secs; gs.events.push({ type: 'tickBeep', secs }) }
    if (gs.timeT <= 0) {
        if (gs.race.noPenalty) {
            gs.events.push({ type: 'practiceRestart' })
            loadRace(gs, gs.raceIdx, 0)
            gs.events.push({ type: 'raceStart', race: gs.raceIdx })
        } else {
            gs.lives = 0
            gs.phase = 'dying'; gs.phaseT = CFG.deathT
            gs.events.push({ type: 'timeUp' })
        }
    }
}

function checkGoal(gs) {
    const m = gs.m
    if (m.air) return
    const g = gs.race.goal
    if (Math.hypot(m.x - (g.c + 0.5), m.y - (g.r + 0.5)) < CFG.goalR) {
        const secs = Math.max(0, Math.ceil(gs.timeT / 60))
        const pts = secs * 100 * (gs.raceIdx + 1)
        addScore(gs, pts)
        gs.clears++
        gs.phase = 'clear'
        gs.phaseT = CFG.clearT
        gs.events.push({ type: 'raceClear', race: gs.raceIdx, secs, pts })
    }
}

// ---------------------------------------------------------------- step ----
export function step(gs, inp) {
    gs.tick++
    if (gs.end) return gs
    if (gs.phase === 'dying') {
        gs.phaseT--
        if (gs.phaseT <= 0) {
            if (gs.end) return gs
            if (gs.lives <= 0) { gs.end = 'over'; gs.events.push({ type: 'over' }); return gs }
            respawn(gs)
        }
        return gs
    }
    if (gs.phase === 'clear') {
        gs.phaseT--
        if (gs.phaseT <= 0) {
            if (gs.raceIdx + 1 >= RACES.length) {
                addScore(gs, WIN_BONUS)
                gs.end = 'win'
                gs.events.push({ type: 'win', pts: WIN_BONUS })
                return gs
            }
            const carry = Math.max(0, gs.timeT)
            loadRace(gs, gs.raceIdx + 1, carry)
            gs.events.push({ type: 'raceStart', race: gs.raceIdx, carry })
        }
        return gs
    }
    if (gs.knockT > 0) gs.knockT--
    updateClock(gs)
    if (gs.phase !== 'play') return gs
    updateMarble(gs, inp)
    if (gs.phase !== 'play') return gs
    updateSteelies(gs)
    updateHammers(gs)
    updateMunchers(gs)
    updateSlinkies(gs)
    updateWave(gs)
    if (gs.phase !== 'play') return gs
    checkGoal(gs)
    return gs
}

// ---------------------------------------------------------------- hash ----
export function stateHash(gs) {
    const m = gs.m
    return fnv([
        gs.tick, gs.raceIdx, gs.score, gs.lives, gs.phase, gs.end || '-',
        gs.timeT, gs.clears, gs.deaths,
        m.x.toFixed(3), m.y.toFixed(3), m.vx.toFixed(4), m.vy.toFixed(4), m.z.toFixed(2), m.vz.toFixed(3), m.air ? 'A' : 'R',
        ...gs.steelies.map((s) => `${s.x.toFixed(2)},${s.y.toFixed(2)}`),
        ...gs.munchers.map((mo) => `${mo.c}${mo.r}${(gs.tick + mo.phase) % CFG.munchCycle}`),
        ...gs.slinkies.map((s) => `${s.c}${s.r}s${s.cool}`),
        ...gs.hammers.map((h) => `${h.c}${h.r}${(gs.tick + h.phase) % 400}`),
    ].join('|'))
}

export function clone(gs) {
    return JSON.parse(JSON.stringify(gs))
}
