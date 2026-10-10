// ICE CLIMBER CO-OP — the simulation. No DOM, no React, no canvas, no RNG:
// the whole mountain is a pure function of (level, inputs-so-far), which is
// what lets `scripts/icecheck.mjs` import this file in plain Node and prove a
// mountain is boreable, stackable and revivable BEFORE a browser is opened.
//
// The two muscles the issue named are load-bearing by construction:
//
// - THE MUTABLE TILEMAP: the mountain is a solid ICE massif and the shaft is
//   not authored — it is CREATED by punching. A climber may only rise into a
//   cell that is no longer ICE, so every metre of the route is a `dig` event
//   and a tile that used to exist. Silence the dig switch and the solver
//   physically cannot leave the floor.
// - THE SECOND SIMULTANEOUS INPUT PATH: two climbers, two key sets, live in
//   the same tick. Summit 3's carrot shelf sits three cells above the highest
//   single jump (rise 2.1), so the only way up is the SHOULDER rule: one
//   climber stands still while the other lands on their head (feet +1.5) and
//   jumps again (1.5 + 2.1 ≥ 3). Silence shoulder support and the solver
//   loses — the co-op is geometry, not cosmetics.
//
// Geometry: cell units, y-down, row 0 at the top. A climber is feet at (x, y)
// with the head at y - 1.5. ROCK and ICE block sideways; snow PLAT shelves
// block only downward (jump or climb up through them, land on top); ICE also
// blocks upward until it is punched. Climbing is possible only while UP is
// held and the column still holds you: ice above the head (punched on a
// timer) or an ice flank at the shoulder — the same flank check is what ends
// the climb at the summit shelf with no special-casing.
//
// Condors patrol fixed bands (the BoulderDash firefly lesson: fixed, so a
// route can be timed against them and the audit can prove it). A touch downs
// a climber and spends one shared life; the partner must reach the body and
// touch it to revive. Solo, summit 3 is impossible — and the audit proves the
// revive is load-bearing.

export const W = 15
export const H = 34
export const CELL = 16
export const FIXED_DT = 1 / 60

export const EMPTY = 0
export const ICE = 1
export const ROCK = 2
export const PLAT = 3

export const CFG = {
    g: 0.0055,
    maxFall: 0.25,
    jumpV: 0.152,              // rise = jumpV²/2g ≈ 2.1 cells — under 3, so L3 needs the stack
    walk: 0.062,
    climb: 0.045,
    punch: 8,                  // ticks of held UP per punched ice cell
    h: 1.5,
    hw: 0.3,
    lives: 3,
    invuln: 90,
    // Engine switches — play never touches these; `icecheck --mutate` silences
    // exactly one at a time and the matching honest check MUST go red.
    dig: true,                 // punching removes ice (the mutable tilemap)
    shoulder: true,            // the partner's head is ground (the co-op)
    revive: true,              // touch revives a downed climber
    moveLeft: true, moveRight: true,
}

const idx = (x, y) => y * W + x

export function cellAt(g, cx, cy) {
    if (cx < 0 || cx >= W || cy < 0 || cy >= H) return ROCK   // world edges are rock
    return g.grid[idx(cx, cy)]
}

const blocksX = (t) => t === ROCK || t === ICE
const ceilBlock = (t) => t === ROCK || t === ICE

export const hash = (s) => {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return (h >>> 0).toString(16)
}

// Every observable the planner and the driver may depend on. Two identical
// input scripts MUST hash identical; one flipped input tick MUST NOT.
export function stateHash(g) {
    let s = `${g.tick}|${g.level}|${g.lives}|${g.score}|${g.end}`
    for (const c of g.climbers) s += `|${c.x.toFixed(4)},${c.y.toFixed(4)},${c.vy.toFixed(4)},${c.down ? 1 : 0}${c.climbing ? 'C' : ''}`
    for (const b of g.birds) s += `|b${b.x.toFixed(4)},${b.dir}`
    s += '|' + (g.carrot ? g.carrot.join(',') : '-') + (g.carrotTaken ? '!' : '')
    for (let i = 0; i < g.grid.length; i++) s += String.fromCharCode(48 + g.grid[i])
    return hash(s)
}

export function cloneGame(g) {
    return {
        ...g,
        grid: Uint8Array.from(g.grid),
        climbers: g.climbers.map(c => ({ ...c })),
        birds: g.birds.map(b => ({ ...b })),
        carrot: g.carrot ? [...g.carrot] : null,
        events: [],
    }
}

// --------------------------------------------------------------- climbing ----
// The shoulder flank: an ICE cell beside the body. It grants upward purchase
// inside the shaft and it is the FIRST thing to vanish at the summit shelf —
// which is exactly what releases the climber onto the snow, no special case.
function shoulderICE(g, c) {
    const mid = Math.floor(c.y - CFG.h * 0.5)
    return cellAt(g, Math.floor(c.x - CFG.hw) - 1, mid) === ICE ||
        cellAt(g, Math.floor(c.x + CFG.hw) + 1, mid) === ICE
}

// The cell the head would move into on the next rise.
function aboveHead(g, c) {
    return cellAt(g, Math.floor(c.x), Math.floor(c.y - CFG.h) - 1)
}

// Grounded + UP grabs the column above: un-bored ICE anywhere, or a bored
// shaft — a deep air gap (≥8 cells) capped by the summit shelf. The depth
// bound is what keeps the carrot shelf of THE STACK from being a free pole:
// the gap under it is two cells, and the stack jump is the only way up.
function canGrab(g, c) {
    if (aboveHead(g, c) === ICE) return true
    const fx = Math.floor(c.x)
    for (let k = 2; k <= 26; k++) {
        const t = cellAt(g, fx, Math.floor(c.y - CFG.h) - k)
        if (t !== EMPTY) return t === ICE || (t === PLAT && k >= 8)
    }
    return false
}

function solidColsBlock(g, c, nx) {
    const x0 = Math.floor(nx - CFG.hw + 0.001), x1 = Math.floor(nx + CFG.hw - 0.001)
    for (let cx = x0; cx <= x1; cx++) {
        for (let cy = Math.floor(c.y - CFG.h + 0.001); cy <= Math.floor(c.y - 0.001); cy++) {
            if (blocksX(cellAt(g, cx, cy))) return cx
        }
    }
    return -1
}

function newClimber(x, y, id) {
    return { id, x, y, vy: 0, grounded: false, climbing: false, punchT: 0,
        down: false, invuln: 0, onPartner: false, jumps: 0, digs: 0, prevJ: false }
}

function goDown(g, c, cause) {
    if (c.down) return
    c.down = true
    c.climbing = false
    c.grounded = false
    c.onPartner = false
    c.vy = 0
    g.lives--
    g.events.push({ type: 'down', who: c.id, cause })
    if (g.lives <= 0 || !g.climbers.some(o => !o.down)) {
        g.end = 'dead'
        g.events.push({ type: 'over' })
    }
}

// ------------------------------------------------------------------- a body ----
function stepClimber(g, c, inp, partner) {
    const ev = g.events
    if (c.down) return
    if (c.invuln > 0) c.invuln--

    // ---- horizontal: walks on the ground, drifts along the flank while
    // climbing — that drift is what parks the climber against the far ice
    // wall so the punched column opens straight up onto the shelf ----
    let dir = 0
    if (inp.r && CFG.moveRight) dir++
    if (inp.l && CFG.moveLeft) dir--
    if (dir !== 0) {
        const nx = c.x + dir * CFG.walk
        const hit = solidColsBlock(g, c, nx)
        if (hit < 0) c.x = nx
        else c.x = dir > 0 ? hit - CFG.hw - 0.001 : hit + 1 + CFG.hw + 0.001
    }

    // ---- vertical ----
    if (c.climbing) {
        if (!inp.u) { c.climbing = false; c.vy = 0 }
        else {
            const above = aboveHead(g, c)
            if (above === ICE) {
                c.punchT++
                if (CFG.dig && c.punchT >= CFG.punch) {
                    g.grid[idx(Math.floor(c.x), Math.floor(c.y - CFG.h) - 1)] = EMPTY
                    c.punchT = 0; c.digs++
                    ev.push({ type: 'dig', x: Math.round(c.x), y: Math.round(c.y) })
                }
            } else c.punchT = 0
            // Rise into anything that is not solid rock and not un-punched ice.
            // PLAT (a snow shelf) is up-throughable: punch through, then land
            // on it the instant the shoulder flank runs out.
            // Stay while the column still means "up": ice to punch (ICE), the
            // snow shelf you pass through (PLAT), an ice flank holding you, or
            // a DEEP bore — first solid ahead at least 8 cells up, which only
            // a bored shaft to the summit shelf is. The two-cell gap under
            // THE STACK's carrot shelf fails this scan: no free pole there.
            let stay = above === ICE || above === PLAT || shoulderICE(g, c)
            if (!stay && above === EMPTY) {
                const hh = Math.floor(c.y - CFG.h)
                for (let k = 2; k <= 26; k++) {
                    const t = cellAt(g, Math.floor(c.x), hh - k)
                    if (t !== EMPTY) { stay = t === ICE || (t === PLAT && k >= 8); break }
                }
            }
            if (above !== ICE && above !== ROCK) { c.y -= CFG.climb; c.onPartner = false }
            if (!stay) {
                c.climbing = false; c.vy = 0
                // The flank died at the shelf: if snow sits under the feet,
                // settle onto it — this snap is the climb-to-shelf exit.
                const cy = Math.floor(c.y + 0.001)
                let snap = false
                for (let cx = Math.floor(c.x - CFG.hw + 0.001); cx <= Math.floor(c.x + CFG.hw - 0.001); cx++) {
                    if (cellAt(g, cx, cy) !== EMPTY) { snap = true; break }
                }
                if (snap) {
                    c.y = cy; c.grounded = true
                    ev.push({ type: 'land', x: Math.round(c.x), y: Math.round(c.y) })
                }
            }
        }
    } else if (inp.u && c.grounded && canGrab(g, c)) {
        c.climbing = true; c.grounded = false; c.onPartner = false
        c.vy = 0; c.punchT = 0
        ev.push({ type: 'grab', x: Math.round(c.x), y: Math.round(c.y) })
    } else {
        if (inp.j && c.grounded && !c.prevJ) {
            c.vy = -CFG.jumpV
            c.grounded = false; c.onPartner = false; c.jumps++
            ev.push({ type: 'jump', x: Math.round(c.x), y: Math.round(c.y) })
        }
        c.prevJ = !!inp.j
        c.vy = Math.min(CFG.maxFall, c.vy + CFG.g)
        const prevY = c.y
        let ny = c.y + c.vy

        if (c.vy < 0) {
            const nr = Math.floor(ny - CFG.h)
            if (ceilBlock(cellAt(g, Math.floor(c.x), nr))) { ny = nr + 1 + CFG.h; c.vy = 0 }
        }

        let landed = false
        if (c.vy >= 0) {
            if (CFG.shoulder && partner && !partner.down && !partner.onPartner &&
                Math.abs(c.x - partner.x) < 0.55 && prevY <= partner.y - CFG.h + 0.05 && ny >= partner.y - CFG.h - 0.02) {
                ny = partner.y - CFG.h; landed = true; c.onPartner = true
            }
            if (!landed) {
                const prevRow = Math.floor(prevY - 0.001)
                const cy = Math.floor(ny - 0.001)
                if (cy >= prevRow) {
                    for (let cx = Math.floor(c.x - CFG.hw + 0.001); cx <= Math.floor(c.x + CFG.hw - 0.001); cx++) {
                        const t = cellAt(g, cx, cy)
                        if (t === ROCK || t === ICE || (t === PLAT && prevY <= cy + 0.001)) { ny = cy; landed = true; break }
                    }
                }
            }
        }
        c.grounded = landed
        if (landed) {
            if (c.vy > 0.08) ev.push({ type: 'land', x: Math.round(c.x), y: Math.round(c.y) })
            c.vy = 0
        }
        c.y = ny
        // standing on a partner is a state re-earned every tick — the moment
        // they walk away you fall
        if (c.grounded && c.onPartner &&
            !(partner && !partner.down && Math.abs(c.x - partner.x) < 0.55 &&
              Math.abs(c.y - (partner.y - CFG.h)) < 0.12)) {
            c.grounded = false; c.onPartner = false
        }
    }

    // ---- condors ----
    if (c.invuln <= 0 && !g.end) {
        for (const b of g.birds) {
            if (Math.abs(c.x - b.x) < 0.55 && Math.abs((c.y - CFG.h * 0.5) - b.y) < 0.8) {
                goDown(g, c, 'condor')
                return
            }
        }
    }
    // ---- the carrot ends the mountain ----
    if (!g.end && !g.carrotTaken && g.carrot) {
        const [kx, ky] = g.carrot
        if (Math.abs(c.x - (kx + 0.5)) < 0.5 + CFG.hw && c.y > ky && c.y - CFG.h < ky + 1) {
            g.carrotTaken = true
            g.score += 1000
            g.events.push({ type: 'carrot', x: kx, y: ky, who: c.id })
            g.end = 'clear'
        }
    }
}

// ------------------------------------------------------------------- the tick ----
// inputs = {a: {l,r,j,u}, b: {l,r,j,u}} — one vector PER CLIMBER PER TICK.
// That pair-per-tick is the second-input-path contract: both key sets feed
// the same tick and neither queues the other.
export function step(g, inputs = { a: {}, b: {} }) {
    g.events.length = 0
    if (g.end) return g
    g.tick++

    for (const b of g.birds) {
        b.x += b.dir * b.spd
        if (b.x >= b.max) { b.x = b.max; b.dir = -1 }
        if (b.x <= b.min) { b.x = b.min; b.dir = 1 }
    }

    const [a, b] = g.climbers
    stepClimber(g, a, inputs.a || {}, b)
    stepClimber(g, b, inputs.b || {}, a)

    // revive: a living climber who reaches the body and touches it
    if (CFG.revive) {
        for (const dn of g.climbers) {
            if (!dn.down) continue
            const other = g.climbers.find(o => o !== dn && !o.down)
            if (other && Math.abs(other.x - dn.x) < 0.7 && Math.abs(other.y - dn.y) < 1.4) {
                dn.down = false
                dn.invuln = CFG.invuln
                g.events.push({ type: 'revive', who: dn.id })
            }
        }
    }

    for (const c of g.climbers) if (c.y > H - 1) { c.y = H - 1; c.vy = 0 }
    return g
}

export function makeGame(level) {
    return {
        level: level.idx,
        grid: Uint8Array.from(level.grid),
        carrot: level.carrot ? [...level.carrot] : null,
        carrotTaken: false,
        climbers: [newClimber(level.spawn.x, level.spawn.y, 0), newClimber(level.spawn.x, level.spawn.y, 1)],
        birds: (level.birds || []).map((b, i) => ({ id: i, ...b, dir: b.dir || 1 })),
        lives: level.lives ?? CFG.lives,
        score: level.score || 0,
        tick: 0,
        end: null,
        events: [],
    }
}
