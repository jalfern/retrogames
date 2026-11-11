// sim.js — FROGGER's seeded dice, world and tick rules (#1473 seedpin batch 15;
// #1637 b25 lifted the whole engine in so the harness drives the SHIPPED physics).
//
// The only dice the engine rolls are here: each floating lane's dive-phase
// offset and which home hosts the fly. Both come from the injected rand
// (seedRng(seed) upstream), so a seeded world reproduces its traffic exactly —
// lane geometry, offsets and bonus house included.
//
// b25: index.jsx used to own hop/update/die/homes in closures. The whole per-tick
// rule set now lives here, verbatim (march, riding, dive drown, crush, off-board,
// clock, homes, lives, levels), so scripts/froggercheck.mjs proves the driver
// against the physics the player actually meets — one implementation, not a
// paraphrase (the b24 Pong law).

import { seedRng } from '../../utils/gameContract.js'

export const CELL = 20
export const COLS = 13
export const W = COLS * CELL
export const DIVE_CYCLE = 4.5 * 60

// Row map (top to bottom): 0 = homes, 1-4 = river, 5 = median,
// 6-10 = road (8 is the rest lane), 11 = start.
export const HOME_ROW = 0
export const RIVER_TOP = 1
export const RIVER_BOT = 4
export const MEDIAN_ROW = 5
export const ROAD_TOP = 6
export const ROAD_BOT = 10
export const START_ROW = 11

export const TIME_LIMIT = 30 * 60
export const HOP_ANIM = 9
export const DIE_ANIM = 55
export const HOME_ANIM = 45
export const DIVE_UP = 3.3 * 60

// The attract demo thinks every 15 ticks (a deliberate hop cadence).
export const DEMO_EVERY = 15

export const RIVER_CFG = [
    { dir: 1, speed: 0.6, kind: 'log', widths: [3], gap: 2.4 },
    { dir: -1, speed: 0.75, kind: 'turtle', widths: [2, 2], gap: 2.6, dive: true },
    { dir: 1, speed: 1.0, kind: 'log', widths: [2, 2], gap: 2.4 },
    { dir: -1, speed: 1.1, kind: 'log', widths: [1], gap: 2.7 }
]
export const ROAD_CFG = {
    6: { dir: 1, speed: 0.7, kind: 'truck', widths: [2], gap: 3.4 },
    7: { dir: 1, speed: 1.5, kind: 'car', widths: [1, 1], gap: 2.4 },
    9: { dir: -1, speed: 1.2, kind: 'car', widths: [1], gap: 2.3 },
    10: { dir: -1, speed: 0.95, kind: 'car', widths: [1, 1], gap: 3.1 }
}

export const HOUSE_COLS = [1, 4, 6, 8, 11]

// Death feedback, as pure data so froggercheck can gate it without a browser.
// The arcade distinguishes its deaths: a car crush squashes, a splash/time-out
// rings, and going OFF the board is its own mark — it must NOT reuse the water
// ripple (the whole point of #1508's "distinct off-board splat").
export function deathStyle(cause) {
    if (cause === 'car') return { kind: 'squash', color: '#5adb5a' }
    if (cause === 'time') return { kind: 'ripple', color: '#ffe14d' }
    if (cause === 'off') return { kind: 'splat', color: '#ff7a5c' }
    return { kind: 'ripple', color: 'rgba(160,210,255,0.9)' } // water / default
}

export function makeLane({ dir, speed, kind, widths, gap, phase = 0, dive = false }, rand) {
    const pattern = [...widths]
    let list = []
    let cycle = 0
    let guard = 0
    while (cycle < W + 4 * CELL && guard++ < 20) {
        list = list.concat(pattern)
        cycle = list.reduce((s, w) => s + (w + gap) * CELL, 0)
    }
    const maxW = Math.max(...list)
    const items = []
    let x = phase * CELL
    for (const w of list) {
        items.push({ x, w })
        x += (w + gap) * CELL
    }
    return { dir, speed, kind, items, cycle, maxW, dive, t: Math.floor(rand() * DIVE_CYCLE) }
}

export const speedMult = level => Math.min(1 + (level - 1) * 0.12, 1.8)

export const spansOf = lane => lane.items.map(it => ({
    x: mod(it.x, lane.cycle) - lane.maxW * CELL,
    w: it.w * CELL
}))

export const mod = (v, c) => ((v % c) + c) % c

export const surfaced = lane => !lane.dive || mod(lane.t, DIVE_CYCLE) < DIVE_UP

const laneAt = (gs, row) => (row >= RIVER_TOP && row <= RIVER_BOT)
    ? gs.riverLanes[row - RIVER_TOP]
    : (gs.roadLanes[row] || null)

// "Can the frog stand at x in this row right now?" True on safe ground,
// true on a clear road (the empty rest lane counts), true on a surfaced
// float under the frog. False in water with nothing to ride.
export function supportAt(gs, row, x) {
    if (row === MEDIAN_ROW || row === START_ROW) return true
    if (row === HOME_ROW) return false
    const lane = laneAt(gs, row)
    if (!lane) return row >= ROAD_TOP && row <= ROAD_BOT
    if (row >= ROAD_TOP) return !spansOf(lane).some(s => x + 8 > s.x + 2 && x - 8 < s.x + s.w - 2)
    if (!surfaced(lane)) return false
    return spansOf(lane).some(s => x >= s.x - 4 && x <= s.x + s.w + 4)
}

export function crushAt(gs, row, x) {
    const lane = gs.roadLanes[row]
    if (!lane) return false
    return spansOf(lane).some(s => x + 7 > s.x + 3 && x - 7 < s.x + s.w - 3)
}

// FNV-1a over the live sim — the __game contract's determinism fingerprint
// (#377): equal on two identical seeded runs, different across seeds.
export function stateHash(gs) {
    let h = 2166136261
    const mix = n => { h = (h ^ (Math.trunc(n) | 0)) >>> 0; h = Math.imul(h, 16777619) >>> 0 }
    mix(gs.tickN); mix(gs.score); mix(gs.lives); mix(gs.level); mix(gs.timeLeft)
    mix(gs.frog.row); mix(gs.frog.x * 4); mix(gs.frog.riding + 2); mix(gs.frog.state.length)
    for (const lane of gs.riverLanes) { mix(lane.t); for (const it of lane.items) mix(it.x * 4) }
    for (const r of Object.keys(gs.roadLanes)) { for (const it of gs.roadLanes[r].items) mix(it.x * 4) }
    for (const hs of gs.houses) mix((hs.filled ? 2 : 0) + (hs.fly ? 1 : 0))
    return h >>> 0
}

export const houseAt = x => {
    for (let i = 0; i < HOUSE_COLS.length; i++) {
        const cx = HOUSE_COLS[i] * CELL + CELL / 2
        if (Math.abs(x - cx) <= CELL * 0.6) return i
    }
    return -1
}

// ---------------------------------------------------------------------------
// The world. makeRun(seed) is the whole game state: seeded traffic dice live
// on gs.rand; every spawn draws from it, so ?seed=N replays the exact run.
// ---------------------------------------------------------------------------

export function makeRun(seed, opts = {}) {
    const gs = {
        seed,
        rand: seedRng(seed),
        tickN: 0,
        level: 1,
        score: 0,
        lives: 3,
        timeLeft: TIME_LIMIT,
        over: false,
        attract: !!opts.attract,
        watching: false,
        levelFlash: 0,
        demoTick: 0,
        riverLanes: [],
        roadLanes: {},
        houses: [],
        frog: {
            x: 6 * CELL + CELL / 2, row: START_ROW,
            prevX: 6 * CELL + CELL / 2, prevRow: START_ROW,
            bestRow: START_ROW, riding: -1,
            state: 'alive', // alive | dying | home
            cause: '', animT: 0, deadT: 0, homeCol: -1,
        },
    }
    buildWorld(gs)
    return gs
}

export function buildWorld(gs) {
    gs.riverLanes = RIVER_CFG.map(c => makeLane(c, gs.rand))
    gs.roadLanes = {}
    for (const r of Object.keys(ROAD_CFG)) gs.roadLanes[r] = makeLane(ROAD_CFG[r], gs.rand)
    gs.houses = HOUSE_COLS.map(() => ({ filled: false, fly: false }))
    const flyIdx = Math.floor(gs.rand() * gs.houses.length)
    gs.houses[flyIdx].fly = true
}

export function resetFrog(gs) {
    const frog = gs.frog
    frog.x = 6 * CELL + CELL / 2
    frog.row = START_ROW
    frog.prevX = frog.x
    frog.prevRow = START_ROW
    frog.bestRow = START_ROW
    frog.riding = -1
    frog.state = 'alive'
    frog.animT = 0
    frog.deadT = 0
    frog.homeCol = -1
    gs.timeLeft = TIME_LIMIT
}

export function die(gs, cause) {
    const frog = gs.frog
    if (frog.state !== 'alive') return
    frog.state = 'dying'
    frog.cause = cause
    frog.deadT = DIE_ANIM
    frog.riding = -1
}

export function nextLife(gs) {
    gs.lives--
    if (gs.lives <= 0) {
        gs.over = true
    } else {
        resetFrog(gs)
    }
}

export function completeLevel(gs) {
    gs.score += 1000
    gs.level++
    gs.levelFlash = 120
    buildWorld(gs)
    resetFrog(gs)
}

export function enterHome(gs, hi) {
    const h = gs.houses[hi]
    if (h.filled) { die(gs, 'wall'); return }
    h.filled = true
    gs.score += 50
    let fly = false
    if (h.fly) {
        gs.score += 200
        h.fly = false
        fly = true
    }
    const frog = gs.frog
    frog.state = 'home'
    frog.deadT = HOME_ANIM
    frog.homeCol = hi
    frog.riding = -1
    if (gs.houses.every(x => x.filled)) {
        frog.deadT = HOME_ANIM + 40
    } else {
        gs.timeLeft = TIME_LIMIT
    }
    return fly
}

// ------------------------------------------------------------------
// HOP — one grid cell per press. Landing is resolved immediately;
// animT only interpolates the sprite along the arc.
// ------------------------------------------------------------------
export function hop(gs, dx, dy) {
    const frog = gs.frog
    if (frog.state !== 'alive') return null
    const nx = frog.x + dx * CELL
    const nr = frog.row + dy
    if (dx !== 0 && (nx < CELL / 2 + 2 || nx > W - CELL / 2 - 2)) return null
    const row = Math.max(HOME_ROW, Math.min(START_ROW, nr))

    frog.prevX = frog.x
    frog.prevRow = frog.row
    frog.x = nx
    frog.row = row
    frog.animT = HOP_ANIM

    if (dy < 0 && row < frog.bestRow) {
        frog.bestRow = row
        gs.score += 10
    }
    frog.riding = -1

    if (row === HOME_ROW) {
        const hi = houseAt(nx)
        if (hi >= 0) {
            const fly = enterHome(gs, hi)
            return { kind: 'home', row, fly: !!fly }
        }
        die(gs, 'water')
        return { kind: 'died', cause: 'water', row }
    } else if (row >= RIVER_TOP && row <= RIVER_BOT) {
        if (supportAt(gs, row, nx)) frog.riding = row - RIVER_TOP
        else { die(gs, 'water'); return { kind: 'died', cause: 'water', row } }
    }
    if (crushAt(gs, row, nx)) { die(gs, 'car'); return { kind: 'died', cause: 'car', row } }
    return { kind: 'hopped', row }
}

// ------------------------------------------------------------------
// ATTRACT DEMO — plays by the same rules the player does. Lifted verbatim
// from index.jsx demoThink (#1637 b25) so the shell and the checks face
// one implementation. The wobble hops ride gs.rand — the seeded stream.
// ------------------------------------------------------------------
export function demoStep(gs) {
    const frog = gs.frog
    if (frog.state !== 'alive') return
    const r = frog.row
    const upClear = row => supportAt(gs, row, frog.x)

    if (r === START_ROW || (r > ROAD_TOP && !gs.roadLanes[r])) {
        if (upClear(r - 1)) hop(gs, 0, -1)
        else if (gs.rand() < 0.25) hop(gs, gs.rand() < 0.5 ? -1 : 1, 0)
    } else if (r >= ROAD_TOP) {
        const lane = gs.roadLanes[r]
        const incoming = lane && spansOf(lane).some(s =>
            lane.dir === 1 ? (s.x + s.w >= frog.x - 4 * CELL && s.x < frog.x) : (s.x <= frog.x + 4 * CELL && s.x + s.w > frog.x))
        if (upClear(r - 1) && !incoming) hop(gs, 0, -1)
        else if (gs.rand() < 0.3) hop(gs, gs.rand() < 0.5 ? -1 : 1, 0)
    } else if (r === MEDIAN_ROW) {
        if (supportAt(gs, RIVER_BOT, frog.x)) hop(gs, 0, -1)
        else if (gs.rand() < 0.3) {
            const d = gs.rand() < 0.5 ? -1 : 1
            if (supportAt(gs, RIVER_BOT, frog.x + d * CELL)) hop(gs, d, 0)
        }
    } else {
        const lane = gs.riverLanes[r - RIVER_TOP]
        const diving = lane.dive && DIVE_UP - mod(lane.t, DIVE_CYCLE) < 45
        const fwd = supportAt(gs, r - 1, frog.x) || (r - 1 === HOME_ROW && houseAt(frog.x) >= 0 && !gs.houses[houseAt(frog.x)].filled)
        if (fwd && !diving && supportAt(gs, r, frog.x + CELL)) hop(gs, 1, -1)
        else if (fwd && !diving && supportAt(gs, r, frog.x)) hop(gs, 0, -1)
        else if (diving) {
            const d = gs.rand() < 0.5 ? -1 : 1
            const s = spansOf(lane).some(sp => frog.x + d * CELL >= sp.x + 2 && frog.x + d * CELL <= sp.x + sp.w - 2)
            if (s && frog.x + d * CELL > CELL && frog.x + d * CELL < W - CELL) hop(gs, d, 0)
        }
    }
}

// ---------------------------------------------------------------------------
// THE DRIVER (#1637 batch 25): survival-rollout crossing brain.

// Where is a lane's item span dt ticks from now? Analytic offset of the SAME
// arithmetic tickFrogger takes (x += dir*speed*mult each tick — a multiply is
// exact for the march since every tick adds the same increment), so the rollout
// sees the traffic the shipped sim will actually show.
const spanAt = (lane, it, dt, m) => mod(it.x + lane.dir * lane.speed * m * dt, lane.cycle) - lane.maxW * CELL

const crushedAtT = (gs, row, x, dt, m) => {
    const lane = gs.roadLanes[row]
    if (!lane) return false
    for (const it of lane.items) {
        const sx = spanAt(lane, it, dt, m)
        if (x + 7 > sx + 3 && x - 7 < sx + it.w * CELL - 3) return true
    }
    return false
}

const supportedAtT = (gs, row, x, dt, m) => {
    if (row === MEDIAN_ROW || row === START_ROW) return true
    if (row === HOME_ROW) return false
    const lane = laneAt(gs, row)
    if (!lane) return row >= ROAD_TOP && row <= ROAD_BOT
    if (row >= ROAD_TOP) {
        for (const it of lane.items) {
            const sx = spanAt(lane, it, dt, m)
            if (x + 8 > sx + 2 && x - 8 < sx + it.w * CELL - 2) return false
        }
        return true
    }
    if (lane.dive && mod(lane.t + dt, DIVE_CYCLE) >= DIVE_UP) return false
    for (const it of lane.items) {
        const sx = spanAt(lane, it, dt, m)
        if (x >= sx - 4 && x <= sx + it.w * CELL + 4) return true
    }
    return false
}

export const WATCH_HORIZON = 420 // ticks the rollouts scan ahead (7 s)
const DRIFT_CAP = 900            // + carried-log projection cap (15 s)

// Greedy continuation used inside the rollout: hop up whenever the landing is
// proven safe at that future instant (open house on the homes row), else the
// diagonals, else hold on (lane drift included). One small policy — the
// rollout asks "what survives if I take THIS first hop and then play it the
// obvious way", which is exactly the seat's behaviour one tick at a time.
// Mutates its scalar copies; returns ticks survived (horizon + 1 = escaped the
// window alive) and whether a home was reached (with the dt it landed).
function greedyRun(gs, m, dt0, row0, x0, riding0, time0) {
    let row = row0
    let x = x0
    let riding = riding0
    let time = time0
    let dt = dt0
    for (; dt <= WATCH_HORIZON; dt++) {
        if (--time <= 0) return { died: dt, home: 0 }
        if (riding >= 0) {
            const lane = gs.riverLanes[riding]
            x += lane.dir * lane.speed * m
            if (lane.dive && mod(lane.t + dt, DIVE_CYCLE) >= DIVE_UP) return { died: dt, home: 0 }
        }
        if (crushedAtT(gs, row, x, dt, m)) return { died: dt, home: 0 }
        if (x < CELL * 0.4 || x > W - CELL * 0.4) return { died: dt, home: 0 }
        if (row === ROAD_TOP) { /* keep scanning; step tries up below */ }
        // try to climb: up, then the diagonals — first landing proven safe.
        let moved = false
        for (const [sx, sd] of [[0, -1], [CELL, 1], [-CELL, -1]]) {
            const nx = x + sx
            if (sx !== 0 && (nx < CELL / 2 + 2 || nx > W - CELL / 2 - 2)) continue
            const nr = row + sd
            if (nr === HOME_ROW) {
                const hi = houseAt(nx)
                if (hi >= 0 && !gs.houses[hi].filled) return { died: 0, home: dt }
                continue
            }
            if (nr < HOME_ROW) continue
            if (!supportedAtT(gs, nr, nx, dt, m)) continue
            if (crushedAtT(gs, nr, nx, dt, m)) continue
            row = nr; x = nx
            riding = (nr >= RIVER_TOP && nr <= RIVER_BOT) ? nr - RIVER_TOP : -1
            moved = true
            break
        }
        if (moved && row === MEDIAN_ROW) { /* safe pocket; keep scanning for the river gap */ }
        // Last-resort descent: when the current ride is about to drown or drop
        // the frog off an edge, the shuffle play is to hop DOWN onto the lane
        // beneath — its opposite drift carries back toward the houses behind.
        // Fires on imminent death (<=60 ticks) or on row 1 with every open
        // house behind (the only way home is the leftward lane beneath), and
        // never when a climb is available — so it cannot oscillate.
        if (!moved && riding >= 0) {
            const lane = gs.riverLanes[riding]
            const per = lane.speed * m
            let rem = lane.dir > 0 ? (W - CELL * 0.4 - x) / per : (x - CELL * 0.4) / per
            if (lane.dive) {
                const toDive = DIVE_UP - mod(lane.t + dt, DIVE_CYCLE)
                if (toDive <= 0) return { died: dt, home: 0 }
                rem = Math.min(rem, toDive)
            }
            const houseBehind = row === RIVER_TOP
                && !gs.houses.some((h, i) => !h.filled && HOUSE_COLS[i] * CELL + CELL / 2 >= x)
            if (rem <= 60 || houseBehind) {
                const nr = row + 1
                if (nr <= MEDIAN_ROW) {
                    for (const sx of [0, CELL, -CELL]) {
                        const nxx = x + sx
                        if (sx !== 0 && (nxx < CELL / 2 + 2 || nxx > W - CELL / 2 - 2)) continue
                        if (!supportedAtT(gs, nr, nxx, dt, m)) continue
                        row = nr; x = nxx
                        riding = (nr >= RIVER_TOP && nr <= RIVER_BOT) ? nr - RIVER_TOP : -1
                        moved = true
                        break
                    }
                }
            }
        }
    }
    return { died: 0, home: 0, survived: true, row, x, riding }
}

// Value one candidate action by replaying the game's OWN forward rules —
// landing, riding drift, dive drown, crush, off-board, clock — under the
// greedy continuation (the brain re-decides next tick, so the rollout owes
// only this hop plus the obvious play after it).
// Returns { ok, value }; ok=false when the hop itself is illegal (off bounds).
function rollout(gs, dx, dy) {
    const frog = gs.frog
    if (frog.state !== 'alive') return { ok: false, value: -1 }
    const nx = frog.x + dx * CELL
    if (dx !== 0 && (nx < CELL / 2 + 2 || nx > W - CELL / 2 - 2)) return { ok: false, value: -1 }
    const m = speedMult(gs.level)
    let row = Math.max(HOME_ROW, Math.min(START_ROW, frog.row + dy))
    let riding = -1
    const x = nx

    // Landing resolves exactly like hop().
    if (row === HOME_ROW) {
        const hi = houseAt(nx)
        // Home at dt 0 — the earliness bonus must match greedyRun's formula
        // (1e6 + horizon - dt) or waiting one extra tick would outrank taking
        // the house NOW, and the frog would procrastinate past every door.
        if (hi >= 0 && !gs.houses[hi].filled) return { ok: true, value: 1e6 + WATCH_HORIZON }
        return { ok: true, value: 1 } // wall or water at the homes row = a loss
    } else if (row >= RIVER_TOP && row <= RIVER_BOT) {
        if (supportedAtT(gs, row, x, 0, m)) riding = row - RIVER_TOP
        else return { ok: true, value: 2 } // splash on landing
    }
    if (crushedAtT(gs, row, x, 0, m)) return { ok: true, value: 1 }

    const r = greedyRun(gs, m, 1, row, x, riding, gs.timeLeft)
    if (r.home) return { ok: true, value: 1e6 + (WATCH_HORIZON - r.home) }
    let survived = r.died
    // A frog still riding at the horizon end gets its carry-out projected: the
    // slow log lanes reach an edge well past the scan window, and the exact tick
    // the board drops it is pure scalar arithmetic (drift + dive phase).
    if (!survived && r.riding >= 0) {
        const lane = gs.riverLanes[r.riding]
        let xx = r.x
        for (let dt = WATCH_HORIZON + 1; dt < DRIFT_CAP; dt++) {
            xx += lane.dir * lane.speed * m
            if (lane.dive && mod(lane.t + dt, DIVE_CYCLE) >= DIVE_UP) { survived = dt; break }
            if (xx < CELL * 0.4 || xx > W - CELL * 0.4) { survived = dt; break }
        }
    }
    survived = survived || DRIFT_CAP
    return { ok: true, value: survived * 10 + (START_ROW - row) * 50 }
}

// Candidate order IS the tie-break: forward first, then the diagonals that
// keep climbing, then wait, then the sidesteps, and last the descents — the
// shuffle-back the shuffle play reserves for when forward is out of road.
const CANDIDATES = [[0, -1], [1, -1], [-1, -1], [0, 0], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1]]

// Reactive against live state every tick (Rogue law): seats anywhere, steers
// back, re-seats from exactly there. No rand — fully deterministic, so the
// Node sweep and the seat drive one identical policy. Null = hold (or the
// life/frog is not steerable: honest wait for the respawn).
export function watchStep(gs) {
    if (gs.over || gs.attract) return null
    if (gs.frog.state !== 'alive') return null
    let best = null
    let bestV = -Infinity
    for (const [dx, dy] of CANDIDATES) {
        const r = rollout(gs, dx, dy)
        if (!r.ok) continue
        if (r.value > bestV) { bestV = r.value; best = [dx, dy] }
    }
    if (!best) return null
    if (best[0] === 0 && best[1] === 0) return null
    return { dx: best[0], dy: best[1] }
}

// ---------------------------------------------------------------------------
// One full play tick, lifted verbatim from index.jsx update() (#1637 b25) so
// froggercheck proves the SHIPPED physics: lane march (dive phase included),
// the frog's riding/crush/off-board/clock rules, the attract demo's cadence,
// home/lives/level sequencing. Mutates gs; returns the events index.jsx turns
// into sound. `humanHop` (from a keydown) is applied before physics, exactly
// where a press landed between frames pre-lift.
// ---------------------------------------------------------------------------
export function tickFrogger(gs, humanHop = null) {
    const ev = { hopped: 0, died: null, home: 0, fly: false, level: false, beep: false, over: false }
    gs.tickN++
    const frog = gs.frog
    if (frog.animT > 0) frog.animT--
    const m = speedMult(gs.level)
    gs.riverLanes.forEach(lane => {
        lane.t++
        lane.items.forEach(it => { it.x += lane.dir * lane.speed * m })
    })
    Object.values(gs.roadLanes).forEach(lane => {
        lane.items.forEach(it => { it.x += lane.dir * lane.speed * m })
    })
    if (gs.levelFlash > 0) gs.levelFlash--

    if (gs.attract) {
        gs.demoTick++
        if (gs.demoTick >= DEMO_EVERY) {
            gs.demoTick = 0
            demoStep(gs)
        }
        if (frog.state === 'dying' && --frog.deadT <= 0) resetFrog(gs)
        if (frog.state === 'home' && --frog.deadT <= 0) resetFrog(gs)
        return ev
    }

    if (gs.over) { ev.over = true; return ev }

    if (humanHop) {
        const r = hop(gs, humanHop.dx, humanHop.dy)
        if (r) stamp(ev, r)
    } else if (gs.watching) {
        const act = watchStep(gs)
        if (act) {
            const r = hop(gs, act.dx, act.dy)
            if (r) stamp(ev, r)
        }
    }

    if (frog.state === 'alive') {
        if (frog.riding >= 0) {
            const lane = gs.riverLanes[frog.riding]
            frog.x += lane.dir * lane.speed * m
            if (!surfaced(lane)) { die(gs, 'water'); ev.died = 'water' }
        }
        if (frog.state === 'alive') {
            if (crushAt(gs, frog.row, frog.x)) { die(gs, 'car'); ev.died = 'car' }
            if (frog.state === 'alive') {
                if (frog.x < CELL * 0.4 || frog.x > W - CELL * 0.4) { die(gs, 'off'); ev.died = 'off' }
                gs.timeLeft--
                if (gs.timeLeft <= 0) { die(gs, 'time'); ev.died = 'time' }
                else if (gs.timeLeft < 5 * 60 && gs.timeLeft % 60 === 0) ev.beep = true
            }
        }
    } else if (frog.state === 'dying') {
        if (gs.over) return ev // frozen splat under the GAME OVER screen
        if (--frog.deadT <= 0) { nextLife(gs); if (gs.over) ev.over = true }
    } else if (frog.state === 'home') {
        if (--frog.deadT <= 0) {
            if (gs.houses.every(h => h.filled)) { completeLevel(gs); ev.level = true }
            else resetFrog(gs)
        }
    }
    return ev
}

// Fold a hop() result into the event bag (sound contract for index.jsx).
function stamp(ev, r) {
    if (r.kind === 'hopped') ev.hopped = r.row
    else if (r.kind === 'died') ev.died = r.cause
    else if (r.kind === 'home') { ev.home = 1; if (r.fly) ev.fly = true }
}
