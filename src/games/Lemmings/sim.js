// LEMMINGS-LITE — the simulation. No DOM, no React, no canvas: plain Node can
// import this file, and `scripts/lemcheck.mjs` does exactly that — it proves
// every level is solvable (a greedy lookahead solver over THIS forward model)
// before a browser is ever opened, in the spirit of heistcheck/zorkcheck/beecheck.
//
// Geometry, so the tile math is readable: a lemming's foot y is a ROW BOUNDARY
// when standing — feet at y=k means cell ROW k is the ground under it. Its
// body is the one cell at row k-1. Walking right at foot k, the cells ahead are
//   (cx, k)   foot level  → solid = a one-tile step (mount it if there is headroom)
//   (cx, k-1) chest       → solid = a wall 2+ tall (only a climber, and only
//                           with free air above — an overhang refuses a climb)
//   both air  → the floor ends: fall. Fatal falls kill; the digger is the only
//   safe descent, because it tunnels one tile at a time from the inside.
//
// The rules that matter, and why each is the shape it is:
//
// - Agent-per-entity is the issue's request: every lemming is an independent
//   little state machine (walk / fall / climb / dig / block / bomb / corpse),
//   stepped in id order, so the whole game is a pure function of
//   (level, grid, command list). That is what makes "deterministic replay"
//   true rather than aspirational: attract mode IS a replayed solver script,
//   and lemcheck replays the solver's own script and demands an identical hash.
// - Commands are {tick, id, skill} — exactly what the shell records from the
//   player's one-click assignment. The solver has no privileged peeks; if it
//   cannot clear a level with the level's skill supply, the level is broken.
// - A climber needs a DIRT handhold and climbs only up: a steel wall refuses
//   it, and a steel overhang over dirt refuses it one move later. That asymmetry
//   is what levels are built from.
// - The digger TUNNELS: it chews the dirt cell at chest height and walks
//   through. (A digger that only dug straight down stranded itself in a shaft
//   bottom with the crowd still on the surface — a tunnel carries the swarm.)
// - Bombs clear dirt and bodies, never steel; a bomb chains other bombers;
//   corpses block walkers (the classic body-pile). Dirt is the only
//   destructible matter.

export const W = 48
export const H = 27
export const FIXED_DT = 1 / 60

export const AIR = 0
export const DIRT = 1
export const STEEL = 2

export const CFG = {
    walkSp: 2.3,
    fallSp: 8.5,
    maxFall: 7,
    climbSp: 2.6,
    digSp: 2.2,
    fuse: 1.6,
    blast: 1.8,
    blockRange: 1.0,
}

export const SKILLS = ['block', 'bomb', 'climb', 'dig']
export const SKILL_KEY = { Digit1: 'block', Digit2: 'bomb', Digit3: 'climb', Digit4: 'dig' }
export const SKILL_NAME = { block: 'BLOCKER', bomb: 'BOMBER', climb: 'CLIMBER', dig: 'DIGGER' }

export const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const cell = (g, cx, cy) => {
    if (cx < 0 || cx >= W || cy < 0 || cy >= H) return STEEL   // world edges are steel
    return g.grid[cy * W + cx]
}
export const solid = (g, cx, cy) => cell(g, cx, cy) !== AIR
const groundRow = (y) => Math.floor(y + 1e-6)
const bodyRow = (y) => Math.floor(y - 0.5)

export const hash = (s) => {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return (h >>> 0).toString(16)
}

export function stateHash(g) {
    let s = `${g.tick}|${g.exited}|${g.dead}|${g.score}`
    for (const L of g.lemmings) s += `|${L.id}:${L.state[0]}${L.dir}${L.x.toFixed(3)}${L.y.toFixed(3)}`
    for (let i = 0; i < g.grid.length; i++) s += String.fromCharCode(48 + g.grid[i])
    return hash(s)
}

export function makeGame(level, grid) {
    return {
        level,
        grid: Uint8Array.from(grid),
        tick: 0,
        t: 0,
        end: null,                        // null | 'clear' | 'dead'
        win: false,
        score: 0,
        spawned: 0,
        exited: 0,
        dead: 0,
        cursor: { x: 6.5, y: 18 },
        selected: 'climb',
        skills: { ...level.skills },
        lemmings: [],
        cmds: [],                         // command log: {tick,id,skill} — replay fuel
        events: [],
    }
}

export function spawnLemming(g) {
    g.lemmings.push({
        id: g.lemmings.length,
        x: g.level.spawn.x + (g.spawned % 2 ? 0.25 : -0.25),
        y: g.level.spawn.y,
        vy: 0,
        dir: g.level.spawn.dir || 1,
        state: 'fall',
        fallDist: 0,
        digT: 0,
        fuseT: -1,
        climber: false,
        digger: false,
        turnCd: -1,
        live: true,
    })
    g.spawned++
    g.events.push({ type: 'spawn', id: g.lemmings.length - 1 })
}

export function nearestLemming(g, x, y, maxD = 1.6) {
    let best = null, bd = maxD + 1e-9
    for (const L of g.lemmings) {
        if (!L.live) continue
        const d = Math.hypot(L.x - x, L.y - y)
        if (d < bd) { bd = d; best = L }
    }
    return best
}

export function assign(g, id, skill) {
    const L = g.lemmings[id]
    if (!L || !L.live) return false
    if ((g.skills[skill] | 0) <= 0) return false
    const st = L.state
    if (skill === 'block' && st !== 'walk' && st !== 'dig') return false
    if (skill === 'dig' && st !== 'walk') return false
    if (skill === 'climb' && st === 'climb') return false
    if (skill === 'bomb' && st === 'bomb') return false
    g.skills[skill]--
    g.cmds.push({ tick: g.tick, id, skill })
    if (skill === 'climb') L.climber = true
    else if (skill === 'block') L.state = 'block'
    else if (skill === 'dig') { L.digger = true; L.state = 'dig'; L.digT = 0 }
    else if (skill === 'bomb') { L.state = 'bomb'; L.fuseT = 0 }
    g.events.push({ type: 'assign', id, skill })
    return true
}

export function step(g, cursorTarget = null) {
    g.events.length = 0
    if (g.end) return g
    g.tick++
    g.t = g.tick / 60
    const lv = g.level

    if (cursorTarget) g.cursor = { x: cursorTarget.x, y: cursorTarget.y }
    if (g.spawned < lv.spawnCount && g.tick % lv.spawnEvery === 0) spawnLemming(g)

    for (const L of g.lemmings) {
        if (!L.live) continue
        if (exitTouch(g, L)) continue
        switch (L.state) {
            case 'walk': case 'bomb': case 'block': walker(g, L); break
            case 'fall': faller(g, L); break
            case 'climb': climber(g, L); break
            case 'dig': digger(g, L); break
        }
        if (L.live && L.state !== 'climb' && L.state !== 'fall'
            && !solid(g, Math.floor(L.x), groundRow(L.y))) {
            L.state = 'fall'; L.fallDist = 0; L.vy = 0
        }
        if (L.live) exitTouch(g, L)
    }

    const active = g.lemmings.reduce((n, L) => n + (L.live ? 1 : 0), 0)
    if (active === 0 && g.spawned >= lv.spawnCount) {
        g.end = 'clear'
        g.win = g.exited >= lv.need
        g.score += g.win ? skillBonus(g) + Math.max(0, Math.round(lv.time - g.t)) * 2 : 0
        g.events.push({ type: g.win ? 'win' : 'lose' })
    } else if (g.tick >= lv.time * 60) {
        g.end = 'clear'
        g.win = g.exited >= lv.need
        g.score += g.win ? skillBonus(g) : 0
        g.events.push({ type: g.win ? 'win' : 'time' })
    }
    return g
}

const skillBonus = (g) => SKILLS.reduce((s, k) => s + (g.skills[k] | 0), 0) * 25

function exitTouch(g, L) {
    const e = g.level.exit
    if (Math.floor(L.x) === e.x && bodyRow(L.y) === e.y) {
        L.live = false; L.state = 'exited'
        g.exited++
        g.score += 100
        g.events.push({ type: 'exit', id: L.id })
        return true
    }
    return false
}

function kill(g, L, cause) {
    L.live = false; L.state = 'dead'
    g.dead++
    g.events.push({ type: cause === 'fall' ? 'splat' : 'boom', id: L.id })
}

function walker(g, L) {
    if (L.state === 'bomb') {
        L.fuseT += FIXED_DT
        if (L.fuseT >= CFG.fuse) { blast(g, L); return }
    }
    if (L.state === 'block') return

    const sp = CFG.walkSp * FIXED_DT
    const wasDir = L.dir
    traffic(g, L)
    if (L.dir !== wasDir) return                 // turned: stands this tick
    const nx = L.x + L.dir * sp
    const cx = Math.floor(nx + L.dir * 0.45)
    const k = groundRow(L.y)
    // Three cells matter ahead: a1 = body level (an obstacle here is a step
    // or a wall), a2 = the standing room above a step / wall continuation,
    // a0 = the next floor. Flat ground has a0 solid and a1 air.
    const a1 = cell(g, cx, k - 1)
    const a2 = cell(g, cx, k - 2)
    const a0 = cell(g, cx, k)
    if (a1 === DIRT && L.digger) {
        L.state = 'dig'
    } else if (a1 !== AIR) {
        if (a2 === AIR) {                       // one-tile ledge: mount it
            L.x = cx + 0.5 - L.dir * 0.02
            L.y = k - 1
            g.events.push({ type: 'step', id: L.id })
        } else if (L.climber && a1 === DIRT) {   // wall: a dirt handhold takes climbers up
            L.state = 'climb'
        } else {
            L.dir = -L.dir
            g.events.push({ type: 'turn', id: L.id })
        }
    } else if (a0 !== AIR) {
        L.x = nx                                 // ordinary flat step
    } else {
        L.x = nx
        L.state = 'fall'; L.fallDist = 0; L.vy = 0
    }
}

// Traffic, the way bodies actually resolve it: a walker turns when its nose
// touches a STATIC body (blocker, corpse) or an ONCOMING walker. Same-direction
// overlap is allowed (single file passes through — bodies are 1 tile of fluff),
// and a walker that just turned ignores traffic for a few ticks, or two pairs
// that passed through each other would flip back forever (a corridor that
// vibrates without moving is the deadlock this rule exists to prevent).
// A blocker that can be shoved past is not a blocker, so static bodies turn
// walkers even during that cooldown.
function traffic(g, L) {
    if (L.state !== 'walk') return
    for (const o of g.lemmings) {
        if (o === L || !o.live) continue
        if (Math.abs(o.y - L.y) > 1.1) continue
        const dx = o.x - L.x
        if (dx * L.dir < 0 || Math.abs(dx) > 0.55) continue
        const staticBody = o.state === 'block' || o.state === 'dead'
        const oncoming = o.state === 'walk' && o.dir === -L.dir
        if (!staticBody && !oncoming) continue
        if (!staticBody && L.turnCd > g.tick) continue
        L.dir = -L.dir
        L.turnCd = g.tick + 14
        g.events.push({ type: 'turn', id: L.id })
        return
    }
}

function faller(g, L) {
    L.vy = Math.min(CFG.fallSp, L.vy + 20 * FIXED_DT)
    const d = L.vy * FIXED_DT
    L.y += d; L.fallDist += d
    if (solid(g, Math.floor(L.x), groundRow(L.y))) {
        L.y = Math.floor(L.y + 1e-6)
        if (L.fallDist > CFG.maxFall) { kill(g, L, 'fall'); return }
        L.state = 'walk'
        g.events.push({ type: 'land', id: L.id })
    } else if (L.climber && cell(g, Math.floor(L.x + L.dir * 0.5), bodyRow(L.y)) === DIRT) {
        L.state = 'climb'
    }
    if (L.y > H + 2) kill(g, L, 'fall')
}

function climber(g, L) {
    const wx = Math.floor(L.x + L.dir * 0.5)
    const ny = L.y - CFG.climbSp * FIXED_DT
    const cur = bodyRow(L.y)
    const nb = bodyRow(ny)
    if (nb !== cur) {
        const c = cell(g, wx, nb)                    // the next handhold up the wall
        if (c === DIRT) { L.y = ny; return }
        if (c === AIR) {                             // crested: mount the top (row `cur`)
            L.y = cur
            L.x = wx + 0.5 + L.dir * 0.05
            L.state = 'walk'
            g.events.push({ type: 'crest', id: L.id })
            return
        }
        L.state = 'fall'; L.vy = 0; L.fallDist = 0   // steel above the dirt: no handhold
        return
    }
    L.y = ny
    if (L.y < 1) { L.state = 'fall'; L.vy = 0; L.fallDist = 0 }
}

// the digger tunnels: it chews the dirt at chest height and walks through.
// A tunnel is flat, so the whole crowd can follow one digger single file.
function digger(g, L) {
    const cx = Math.floor(L.x + L.dir * 1.45)
    const chest = cell(g, cx, bodyRow(L.y))
    if (chest === DIRT) {
        L.digT += CFG.digSp * FIXED_DT
        if (L.digT >= 1) {
            L.digT -= 1
            g.grid[bodyRow(L.y) * W + cx] = AIR
            g.events.push({ type: 'dig', id: L.id })
        }
        return
    }
    L.state = 'walk'
    g.events.push({ type: chest === STEEL ? 'digstop' : 'digthru', id: L.id })
}

function blast(g, L) {
    const bx = L.x, by = L.y - 0.5
    kill(g, L, 'bomb')
    const r = CFG.blast
    for (let cy = Math.floor(by - r); cy <= Math.floor(by + r); cy++) {
        for (let cx = Math.floor(bx - r); cx <= Math.floor(bx + r); cx++) {
            if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue
            const dx = cx + 0.5 - bx, dy = cy + 0.5 - by
            if (dx * dx + dy * dy <= r * r && g.grid[cy * W + cx] === DIRT) {
                g.grid[cy * W + cx] = AIR
            }
        }
    }
    g.events.push({ type: 'blast', id: L.id, x: bx, y: by })
    for (const o of g.lemmings) {
        if (!o.live || o === L) continue
        if (Math.hypot(o.x - bx, o.y - 0.5 - by) < r + 0.3) {
            if (o.state === 'bomb') o.fuseT = Math.min(o.fuseT, 0.02)
            else kill(g, o, 'bomb')
        }
    }
    for (const o of g.lemmings) {
        if (o.live && o.state !== 'climb' && o.state !== 'fall'
            && !solid(g, Math.floor(o.x), groundRow(o.y))) {
            o.state = 'fall'; o.fallDist = 0; o.vy = 0
        }
    }
}

// -------------------------------------------------------------- solvability ----
// The gate. A greedy planner that speaks only like a player: at decision ticks
// it clones the true forward model, applies one real command, rolls H ticks,
// and commits the best-scoring move. No walkthrough, no hints, no privileged
// peeks — if this cannot clear a level with the level's own skill supply,
// lemcheck goes red. The committed script is returned so attract mode replays
// it and lemcheck demands bit-identical determinism of the replay.

function scoreState(g) {
    let s = g.exited * 900 - g.dead * 140
    const e = g.level.exit
    for (const L of g.lemmings) {
        if (!L.live) continue
        s += 60 - Math.hypot(e.x - L.x, e.y - L.y) * 2
    }
    return s
}

function candidates(g) {
    // Act only where the world refuses to move: a walker stopped by a wall, or
    // one about to shuffle off an edge. Everything else is already progressing.
    const out = []
    const seen = new Set()
    const push = (id, skill) => {
        const key = `${skill}:${id}`
        if ((g.skills[skill] | 0) <= 0 || seen.has(key)) return
        seen.add(key); out.push({ id, skill })
    }
    for (const L of g.lemmings) {
        if (!L.live || L.state !== 'walk') continue
        const k = groundRow(L.y)
        const cx = Math.floor(L.x + L.dir * 0.65)
        const a1 = cell(g, cx, k - 1)
        const a2 = cell(g, cx, k - 2)
        const a0 = cell(g, cx, k)
        const wall = a1 !== AIR && a2 !== AIR          // 2+ tall: a skill is needed
        if (wall && a1 === DIRT) {
            if (!L.digger) push(L.id, 'dig')
            if (!L.climber) push(L.id, 'climb')
        }
        if (a0 === AIR && a1 === AIR) {                // the floor ends
            // a blocker needs solid ground under its own feet — a would-be
            // blocker standing over the void just becomes another corpse
            if (cell(g, Math.floor(L.x), k) !== AIR) push(L.id, 'block')
            if (!L.climber) push(L.id, 'climb')
        }
        // A bomb is a TIMER: assigned at the wall it has already bounced and
        // explodes a tile short. Offer it while the walker still has runway
        // to touch the obstacle when the fuse runs out (~3.7 tiles / 1.6 s).
        if (L.fuseT < 0 && !L.digger) {
            let d = -1
            for (let c = Math.floor(L.x); ; c += L.dir) {
                const cc = c + (L.dir > 0 ? 1 : 0)
                if (cell(g, cc, k - 1) !== AIR && cell(g, cc, k - 2) !== AIR) { d = Math.abs(cc + 0.5 - L.x); break }
                if (Math.abs(cc + 0.5 - L.x) > 6) break
            }
            if (d >= 2 && d <= 4.2 && g.skills.bomb > 0) push(L.id, 'bomb')
        }
    }
    return out.slice(0, 8)
}

const roll = (g0, act, horizon) => {
    const g = structuredClone(g0)
    g.events.length = 0
    if (act) assign(g, act.id, act.skill)
    let h = horizon
    while (!g.end && h-- > 0) step(g)
    return g
}

export function solve(g, horizon = 1500) {
    let cooldown = 0
    while (!g.end && g.tick < g.level.time * 60) {
        if (cooldown <= 0) {
            const cands = candidates(g)
            if (cands.length) {
                let best = null
                let bestScore = scoreState(roll(g, null, horizon))
                for (const a of cands) {
                    const s = scoreState(roll(g, a, horizon))
                    if (s > bestScore + 1) { bestScore = s; best = a }
                }
                if (best) { assign(g, best.id, best.skill); cooldown = 30 }
                else cooldown = 20
            }
        } else cooldown--
        step(g)
    }
    return { cmds: g.cmds.map(c => ({ ...c })), exited: g.exited, dead: g.dead, win: g.win, end: g.end, score: g.score }
}

/** Apply a recorded script to a fresh game. Used by attract mode (a replay of
 *  the solver's script) and by lemcheck's determinism proof. The command takes
 *  effect on the tick AFTER its stamp — exactly how solve() applied it. */
export function replay(level, grid, cmds, opts = {}) {
    const g = makeGame(level, grid)
    const byTick = new Map()
    for (const c of cmds) {
        if (!byTick.has(c.tick)) byTick.set(c.tick, [])
        byTick.get(c.tick).push(c)
    }
    while (!g.end && g.tick < (opts.maxTicks || level.time * 60 + 60)) {
        const todo = byTick.get(g.tick + 1)
        if (todo) for (const c of todo) assign(g, c.id, c.skill)
        step(g)
        if (opts.onTick) opts.onTick(g)
    }
    return g
}
