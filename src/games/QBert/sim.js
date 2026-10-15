// Q*BERT — the pure simulation. Zero DOM, zero Math.random: the board is the
// 1982 Gottlieb pyramid (rows 1-6 plus the 4/3 skirt = 28 cubes), hops are
// diagonal-only, every landing flips the cube top. Coily drops after the 9th
// flip and hops at you; discs ride you to the top and lure a nearby snake off
// the edge; red balls ricochet the edges; Ugg/Wrongway run rows from round 2;
// Sam & Slick revert cubes from round 3. `npm run qbertcheck` audits all of
// it against THIS file — the tab runs the same step() the harness proves.

export const FIXED_DT = 1000 / 60
export const W = 256
export const H = 224
export const ROWS = [1, 2, 3, 4, 5, 6, 4, 3]
export const N_CUBES = 28
export const TOP_Y = 56
export const TILE_W = 30
export const TILE_H = 15
export const CUBE_H = 10
export const HOP_TICKS = 12
export const DEATH_TICKS = 78
export const FIRST_SNAKE_FLIPS = 9
export const SINGLE = 25
export const ROUNDTRIP = 50
export const HELI = 100
export const LURE = 500
export const CLEAR_BONUS = 1000
export const CYCLE = 5
export const ONE_UP_AT = 10000
export const MAX_LIVES = 9
// The original only chains the 25/50/100 ledger when consecutive hops land
// within a short window (~1s). A hop landing later than this resets the up-chain
// so a slow climb scores singles instead of building to the heli-jump 100.
export const CHAIN_WINDOW = 60

export const id = (r, c) => r * 8 + c
export const rowOf = (i) => i >> 3
export const colOf = (i) => i & 7
export const valid = (r, c) => r >= 0 && r < ROWS.length && c >= 0 && c < ROWS[r]
export const CUBES = []
for (let r = 0; r < ROWS.length; r++) for (let c = 0; c < ROWS[r]; c++) CUBES.push(id(r, c))

export function cubeXY(r, c) {
    return { x: W / 2 + (c - (ROWS[r] - 1) / 2) * TILE_W, y: TOP_Y + r * TILE_H }
}

export function neighbors(i) {
    const r = rowOf(i), c = colOf(i)
    const out = []
    if (valid(r - 1, c - 1)) out.push(id(r - 1, c - 1))
    if (valid(r - 1, c)) out.push(id(r - 1, c))
    if (valid(r + 1, c)) out.push(id(r + 1, c))
    if (valid(r + 1, c + 1)) out.push(id(r + 1, c + 1))
    return out
}

export function edgeDist(a, b) {
    if (a === b) return 0
    let frontier = new Set([a]), seen = new Set([a]), d = 0
    while (frontier.size && d < 12) {
        d++
        const next = new Set()
        for (const n of frontier) for (const m of neighbors(n)) {
            if (m === b) return d
            if (!seen.has(m)) { seen.add(m); next.add(m) }
        }
        frontier = next
    }
    return 99
}

function makeRng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

const flipTarget = (gs) => gs.mode === 1 ? 1 : 0

export function neededCubes(gs) {
    if (gs.mode === 1) return CUBES.filter((i) => gs.colors[i] !== 1)
    const count = new Array(CYCLE).fill(0)
    for (const i of CUBES) count[gs.colors[i]]++
    let best = 0
    for (let k = 1; k < CYCLE; k++) if (count[k] > count[best]) best = k
    return CUBES.filter((i) => gs.colors[i] !== best)
}

export function makeGame({ seed = 7, level = 1, lives = 3 } = {}) {
    const gs = {
        seed: seed >>> 0, rng: makeRng(seed ^ (level * 2654435761)),
        level, mode: level === 1 ? 1 : 2, lives, score: 0, total: 0,
        colors: new Array(64).fill(0),
        player: { r: 0, c: 0, hop: null, ride: null, dying: 0, invuln: 0, upChain: 0, lastCube: -1, prevCube: -1, facing: 1 },
        snakes: [], balls: [], runners: [], slicks: [],
        discs: [
            { x: -40, y: 34, v: 0.85, off: 0 },
            { x: W + 40, y: 26, v: -0.85, off: 250 },
        ],
        ballTimer: 170, runnerTimer: 380, slickTimer: 520,
        nextSnakeAt: FIRST_SNAKE_FLIPS,
        flips: 0, snakesWanted: 1, pending: null, phase: 'play', phaseT: 0,
        tick: 0, lastLandTick: -1, end: null, balloon: null, events: [],
    }
    resetRound(gs)
    return gs
}

function resetRound(gs) {
    gs.mode = gs.level === 1 ? 1 : 2
    gs.colors.fill(0)
    if (gs.mode === 2) for (const i of CUBES) gs.colors[i] = Math.floor(gs.rng() * CYCLE)
    gs.snakes = []
    gs.balls = []
    gs.runners = []
    gs.slicks = []
    gs.flips = 0
    gs.nextSnakeAt = FIRST_SNAKE_FLIPS
    gs.snakesWanted = Math.min(1 + Math.floor((gs.level - 1) / 2), 3)
    gs.ballTimer = Math.max(120, 200 - gs.level * 10)
    gs.runnerTimer = gs.level >= 2 ? 300 : 1e9
    gs.slickTimer = gs.level >= 3 ? 420 : 1e9
    gs.player.r = 0; gs.player.c = 0
    gs.player.hop = null; gs.player.ride = null; gs.player.dying = 0
    gs.player.invuln = 40; gs.player.upChain = 0; gs.player.lastCube = -1; gs.player.prevCube = -1; gs.player.facing = 1
    gs.colors[id(0, 0)] = flipTarget(gs)
    gs.lastLandTick = -1
    gs.pending = null; gs.phase = 'play'; gs.phaseT = 0
}

const px = (gs) => cubeXY(gs.player.r, gs.player.c)

function kill(gs, cause) {
    const p = gs.player
    if (p.invuln > 0 || p.dying || gs.end) return
    p.dying = DEATH_TICKS
    gs.lives--
    gs.balloon = '@!#?@!'
    gs.events.push({ t: 'death', cause, x: px(gs).x, y: px(gs).y })
}

function hopTo(gs, tr, tc) {
    const p = gs.player
    const from = px(gs)
    const to = cubeXY(tr, tc)
    p.facing = to.x > from.x ? 1 : to.x < from.x ? -1 : p.facing
    p.prevCube = p.lastCube
    p.lastCube = id(p.r, p.c)
    p.hop = { fr: p.r, fc: p.c, tr, tc, t: 0, x0: from.x, y0: from.y }
    gs.events.push({ t: 'hop' })
}

function land(gs, tr, tc, up) {
    const p = gs.player
    p.r = tr; p.c = tc
    const cube = id(tr, tc)
    const to = cubeXY(tr, tc)
    gs.events.push({ t: 'land', cube, x: to.x, y: to.y })
    if (up) {
        if (gs.lastLandTick >= 0 && gs.tick - gs.lastLandTick > CHAIN_WINDOW) p.upChain = 0
        p.upChain++
    } else p.upChain = 0
    let pts = 0
    if (up && p.prevCube === cube) pts = ROUNDTRIP
    else if (up && p.upChain >= 2) pts = HELI
    else pts = SINGLE
    addScore(gs, pts)
    gs.events.push({ t: 'points', pts, cube, x: to.x, y: to.y })
    gs.lastLandTick = gs.tick
    flipCube(gs, cube)
    checkSnakeContact(gs)
    checkClear(gs)
}

function addScore(gs, n) {
    const before = Math.floor(gs.total / ONE_UP_AT)
    gs.score = Math.min(999999, gs.score + n)
    gs.total = gs.score
    const after = Math.floor(gs.total / ONE_UP_AT)
    if (after > before && gs.lives < MAX_LIVES) {
        gs.lives = Math.min(MAX_LIVES, gs.lives + (after - before))
        gs.events.push({ t: 'oneup', lives: gs.lives, score: gs.score })
    }
}

function flipCube(gs, cube) {
    if (gs.mode === 1) {
        if (gs.colors[cube] !== 1) { gs.colors[cube] = 1; gs.flips++ }
    } else {
        gs.colors[cube] = (gs.colors[cube] + 1) % CYCLE
        gs.flips++
    }
    if (gs.flips >= gs.nextSnakeAt && gs.snakes.length < gs.snakesWanted) {
        spawnSnake(gs)
        gs.nextSnakeAt = gs.flips + FIRST_SNAKE_FLIPS
    }
}

function spawnSnake(gs) {
    gs.snakes.push({ r: 0, c: 0, enter: 14, dropT: dropInterval(gs), x: cubeXY(0, 0).x, y: cubeXY(0, 0).y })
    gs.events.push({ t: 'snakespawn' })
}

const dropInterval = (gs) => Math.max(42, 92 - gs.level * 5)

function checkSnakeContact(gs) {
    const p = gs.player
    const pc = id(p.r, p.c)
    for (const s of gs.snakes) if (id(s.r, s.c) === pc) kill(gs, 'snake')
}

function checkClear(gs) {
    if (gs.end || gs.pending) return
    if (neededCubes(gs).length === 0) {
        gs.pending = { t: 100 }
        addScore(gs, CLEAR_BONUS)
        gs.events.push({ t: 'clear', bonus: CLEAR_BONUS, level: gs.level })
    }
}

export function step(gs, input = {}) {
    if (gs.end) return gs
    gs.tick++
    const p = gs.player

    for (const d of gs.discs) {
        d.x += d.v
        if (d.v > 0 && d.x > W + 40) d.x = -40
        if (d.v < 0 && d.x < -40) d.x = W + 40
    }

    if (p.hop) {
        p.hop.t++
        const k = p.hop.t / HOP_TICKS
        p.hop.k = k
        if (p.hop.t >= HOP_TICKS) {
            const h = p.hop
            p.hop = null
            land(gs, h.tr, h.tc, h.tr < h.fr)
        }
        if (p.dying) return finish(gs)
    }

    if (p.ride) {
        const d = gs.discs[p.ride.d]
        p.ride.t++
        p.ride.discX = d.x
        if (p.ride.t >= 44) {
            // the original's disc drop: a RANDOM ROW across the whole pyramid
            // (the old rule only ever reached the top two rows), then a random
            // cube in that row — so the ride can deposit Q*BERT anywhere on the
            // board, which is what makes the +50 round-trip a real gamble.
            const row = Math.floor(gs.rng() * ROWS.length)
            const drop = id(row, Math.floor(gs.rng() * ROWS[row]))
            p.ride = null
            land(gs, rowOf(drop), colOf(drop), true)
        }
        if (p.dying) return finish(gs)
    }

    if (p.dying > 0) {
        p.dying--
        if (p.dying === 0) {
            gs.balloon = null
            if (gs.lives <= 0) { gs.end = 'over'; gs.events.push({ t: 'over' }) }
            else { p.r = 0; p.c = 0; p.invuln = 50 }
        }
        return finish(gs)
    }
    if (gs.pending) {
        gs.pending.t--
        if (gs.pending.t <= 0) {
            gs.level++
            resetRound(gs)
        }
        return finish(gs)
    }
    if (p.invuln > 0) p.invuln--

    if (!p.hop && !p.ride && !p.dying) {
        const r = p.r, c = p.c
        const want =
            input.ul ? [-1, -1] : input.ur ? [-1, 0] : input.dl ? [1, 0] : input.dr ? [1, 1] : null
        if (want) {
            const tr = r + want[0], tc = c + want[1]
            if (valid(tr, tc)) hopTo(gs, tr, tc)
            else if (r === 0 && c === 0 && want[0] === -1) {
                const d = gs.discs.findIndex((x) => Math.abs(x.x - W / 2) < 22)
                if (d >= 0) {
                    p.ride = { d, t: 0 }
                    let lured = 0
                    for (const s of [...gs.snakes]) {
                        if (edgeDist(id(s.r, s.c), id(0, 0)) <= 2) {
                            gs.snakes.splice(gs.snakes.indexOf(s), 1)
                            gs.nextSnakeAt = gs.flips + FIRST_SNAKE_FLIPS
                            lured++
                            gs.events.push({ t: 'snakelure', x: s.x, y: s.y })
                        }
                    }
                    if (lured) addScore(gs, LURE * lured)
                    gs.events.push({ t: 'discride', d })
                }
            } else {
                kill(gs, 'fall')
                gs.events.push({ t: 'fall' })
            }
        }
    }

    // snakes
    for (const s of gs.snakes) {
        if (s.enter > 0) { s.enter--; continue }
        s.dropT--
        if (s.dropT <= 0) {
            s.dropT = dropInterval(gs)
            const opts = neighbors(id(s.r, s.c))
            if (p.ride) {
                if (edgeDist(id(s.r, s.c), id(0, 0)) <= 2) {
                    gs.snakes.splice(gs.snakes.indexOf(s), 1)
                    gs.nextSnakeAt = gs.flips + FIRST_SNAKE_FLIPS
                    gs.events.push({ t: 'snakelure', x: s.x, y: s.y })
                    addScore(gs, LURE)
                    continue
                }
            }
            const pc = id(p.r, p.c)
            let bestD = 1e9, best = null
            for (const m of opts) {
                const d = edgeDist(m, pc)
                if (d < bestD || (d === bestD && gs.rng() < 0.35)) { bestD = d; best = m }
            }
            if (best !== null) {
                s.r = rowOf(best); s.c = colOf(best)
                gs.events.push({ t: 'coilyhop' })
            }
            const to = cubeXY(s.r, s.c)
            s.x = to.x; s.y = to.y
            if (id(s.r, s.c) === pc && !p.ride) kill(gs, 'snake')
        }
    }

    // red balls: ricochet down the chosen edge, cube by cube
    gs.ballTimer--
    if (gs.ballTimer <= 0) {
        gs.ballTimer = Math.max(90, 200 - gs.level * 12)
        const side = gs.rng() < 0.5 ? -1 : 1
        gs.balls.push({ side, r: 0, c: 0, t: 0, stepT: 20, x: W / 2, y: TOP_Y })
        gs.events.push({ t: 'ballspawn' })
    }
    for (const b of gs.balls) {
        b.stepT--
        if (b.stepT <= 0) {
            b.stepT = 20
            const nr = b.r + 1
            const nc = b.side < 0 ? b.c : b.c + 1
            if (valid(nr, nc) && (b.side < 0 || nc < ROWS[nr])) { b.r = nr; b.c = nc }
            else { b.done = true }
            const to = b.done ? null : cubeXY(b.r, b.c)
            if (to) {
                b.x = to.x; b.y = to.y
                if (id(b.r, b.c) === id(p.r, p.c) && !p.ride) kill(gs, 'ball')
            }
        }
        b.t++
    }
    gs.balls = gs.balls.filter((b) => !b.done)

    // Ugg / Wrongway: run one row end to end
    gs.runnerTimer--
    if (gs.runnerTimer <= 0) {
        gs.runnerTimer = Math.max(260, 520 - gs.level * 30)
        const row = gs.rng() < 0.5 ? 4 : 5
        const dir = gs.rng() < 0.5 ? 1 : -1
        gs.runners.push({ row, dir, x: dir > 0 ? -12 : W + 12, kind: dir > 0 ? 'ugg' : 'wrongway' })
        gs.events.push({ t: 'runnerspawn', row, dir })
    }
    for (const u of gs.runners) {
        u.x += dirSpeed(gs) * u.dir
        if (u.row === p.r && !p.ride) {
            const row = cubeXY(u.row, 0)
            const left = row.x - TILE_W / 2, right = row.x + (ROWS[u.row] - 1) * TILE_W + TILE_W / 2
            if (u.x > left && u.x < right && Math.abs(u.x - px(gs).x) < 11) kill(gs, 'runner')
        }
        if (u.x < -20 || u.x > W + 20) u.done = true
    }
    gs.runners = gs.runners.filter((u) => !u.done)

    // Sam & Slick: slide across a row and down the left edge, reverting cubes
    gs.slickTimer--
    if (gs.slickTimer <= 0) {
        gs.slickTimer = Math.max(360, 700 - gs.level * 40)
        gs.slicks.push({ r: 5, c: ROWS[5] - 1, stepT: 24, trail: [], done: false })
        gs.events.push({ t: 'slickspawn' })
    }
    for (const sl of gs.slicks) {
        sl.stepT--
        if (sl.stepT <= 0) {
            sl.stepT = 24
            let nr = sl.r, nc = sl.c
            if (sl.c > 0) nc = sl.c - 1
            else if (sl.r < ROWS.length - 1 && valid(sl.r + 1, 0)) { nr = sl.r + 1; nc = 0 }
            else { sl.done = true }
            if (!sl.done) {
                sl.r = nr; sl.c = nc
                const cube = id(nr, nc)
                if (gs.colors[cube] !== 0) { gs.colors[cube] = 0; gs.events.push({ t: 'slickwipe', cube }) }
                sl.trail.push({ cube, t: 0 })
                if (cube === id(p.r, p.c) && !p.ride) kill(gs, 'slick')
            }
        }
        for (const t of sl.trail) t.t++
        sl.trail = sl.trail.filter((t) => t.t < 40)
    }
    gs.slicks = gs.slicks.filter((s) => !s.done)

    return finish(gs)
}

const dirSpeed = (gs) => 1.0 + gs.level * 0.08

function finish(gs) {
    return gs
}

export function stateHash(gs) {
    let h = 0x811c9dc5
    const mix = (n) => { h ^= n & 0xff; h = Math.imul(h, 0x01000193) >>> 0 }
    mix(gs.level); mix(gs.score); mix(gs.lives); mix(gs.flips); mix(gs.tick)
    for (const i of CUBES) mix(gs.colors[i])
    mix(gs.player.r * 8 + gs.player.c); mix(gs.player.upChain); mix(gs.player.dying ? 1 : 0)
    for (const s of gs.snakes) mix(s.r * 8 + s.c)
    for (const b of gs.balls) mix(b.r * 8 + b.c)
    for (const u of gs.runners) mix(Math.round(u.x))
    for (const s of gs.slicks) mix(s.r * 8 + s.c)
    mix(gs.end ? 1 : 0)
    return h >>> 0
}
