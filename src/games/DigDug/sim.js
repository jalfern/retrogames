// DIG DUG — pure simulation. step(state, input) -> state, zero Math.random():
// the round roster, spawn corners and speed come from levels.js data plus the
// seed, so scripts/dugcheck.mjs can audit the rules and replay a pilot run
// hash-for-hash in plain Node.
//
// The load-bearing rules (the ones the harness pins):
//   - the pump: harpoon a SOLID enemy, then each further pump press inflates
//     it one stage; stage 4 pops. Stop pumping and it deflates one stage per
//     DEFLATE ticks; an inflated enemy is shoved away from the harpoon.
//   - kill value = PUMP_POINTS[kind][layer] (deep dirt pays more, open air
//     pays half); a ghost (underground, eyes-only) cannot be harpooned.
//   - a rock falls when its support column (dirt cells directly above it)
//     empties; while falling it crushes every enemy it passes over, and a
//     rock that crushes n enemies pays n * ROCK_BASE * (layer+1) each.
//   - after two rocks drop in a round, veggies sprout at their spots.
//   - when only ONE enemy is left alive it flees: pumped state resets, the
//     harpoon pops off, and it heads for the nearest top corner to exit and
//     re-enter.
//   - death: touched by a solid enemy, caught in Fygar fire (straight down an
//     open tunnel only — leaving the row dodges it), or crushed by a rock.

import {
    CELL, COLS, ROWS, W, H, HUD_ROW, AIR_TOP, AIR_BOT, DIRT_TOP, DIRT_BOT,
    FLOOR_ROW, FIELD_Y0, LAYERS, layerOf, ROUNDS, PUMP_POINTS, ROCK_BASE, ROUND_BONUS,
} from './levels.js'

export { W, H, CELL, COLS, ROWS, LAYERS, layerOf }

export const CFG = {
    playerSpeed: 1.6,
    digH: 8, digDown: 12, digUp: 20,   // ticks per dirt cell by direction
    centerLerp: 0.3,
    harpoonLen: 44, harpoonSpeed: 6, harpoonCool: 3,
    pumpStages: 4, deflateTicks: 90, shove: 0.7,
    killR: 9,
    fireSpeed: 3, fireMax: 96, fireTail: 22,
    rockWarn: 40, rockAccel: 0.12, rockMaxV: 3.2,
    respawn: 240, cornerExit: 30,
    deathFreeze: 90, roundPause: 120,
    maxLives: 5, extraLife: 10000,
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const cx = (c) => c * CELL + CELL / 2
const cy = (r) => FIELD_Y0 + r * CELL + CELL / 2
const colOf = (x) => Math.floor(x / CELL)
const rowOf = (y) => Math.floor((y - FIELD_Y0) / CELL)

function fnv(str) {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return h.toString(16)
}

// ---------------------------------------------------------------- grid ----
function buildGrid(gs) {
    const dirt = []
    for (let r = 0; r < ROWS; r++) {
        const row = []
        for (let c = 0; c < COLS; c++) row.push(r >= DIRT_TOP && r <= DIRT_BOT)
        dirt.push(row)
    }
    gs.dirt = dirt
    // rocks hang in carved ceiling pockets: their own cell starts open
    for (const k of ROUNDS[gs.round].rocks) gs.dirt[k.row][k.col] = false
}
const inField = (r, c) => r >= AIR_TOP && r <= DIRT_BOT && c >= 0 && c < COLS
const isDirt = (gs, r, c) => inField(r, c) && gs.dirt[r][c]
const isRockCell = (gs, r, c) => gs.rocks.some((k) => k.state === 'held' && k.row === r && k.col === c)
// passable for the player: air or already-dug, never dirt/rock/floor
const openCell = (gs, r, c) => r >= AIR_TOP && r <= DIRT_BOT && c >= 0 && c < COLS && !gs.dirt[r][c] && !isRockCell(gs, r, c)

// ---------------------------------------------------------------- setup ----
export function makeGame(seed = 0) {
    const gs = {
        seed, tick: 0, score: 0, lives: 3, round: 0,
        kills: 0, rocksDropped: 0, roundPhase: 'play', phaseT: 0,
        end: null, events: [], _nextId: 1, upTo: CFG.extraLife,
        player: null, harpoon: null, enemies: [], rocks: [], veggies: [],
        queue: [], respawnT: 0, escapeT: 0, _cool: 0, _fleeSet: false,
    }
    startRound(gs, 0)
    return gs
}

function startRound(gs, round) {
    gs.round = round
    const R = ROUNDS[round]
    gs.kills = 0
    gs.rocksDropped = 0
    gs.roundPhase = 'play'
    gs.phaseT = 0
    buildGrid(gs)
    gs.rocks = R.rocks.map((k) => ({ id: gs._nextId++, col: k.col, row: k.row, y: cy(k.row), state: 'held', vy: 0, squash: 0 }))
    gs.veggies = R.vegSpots.map((v, i) => ({ id: gs._nextId++, col: v.col, row: v.row, spot: i, live: false, bob: i * 7 }))
    gs.queue = R.comp.slice()
    const rot = seedRot(gs.seed)
    gs.enemies = []
    { const n0 = Math.min(R.cap, gs.queue.length); for (let i = 0; i < n0; i++) spawnEnemy(gs, rot[i % 3]) }
    gs.respawnT = CFG.respawn; gs.escapeT = 0
    gs.player = { x: cx(9), y: cy(AIR_BOT), dir: [1, 0], digT: 0, moving: false, deadT: 0 }
    gs.harpoon = null
}

function seedRot(seed) {
    const base = [2, 15, 4]
    const n = seed % 3
    return base.slice(n).concat(base.slice(0, n))
}

function spawnEnemy(gs, col) {
    const kind = gs.queue.shift()
    if (!kind) return
    const R = ROUNDS[gs.round]
    gs.enemies.push({
        id: gs._nextId++, kind, x: cx(col), y: cy(AIR_TOP),
        stage: 0, defl: CFG.deflateTicks, attached: false,
        ghost: false, path: [], repathT: 0, state: 'walk', breathT: R.breathCd,
        flee: false, fireLen: 0, fireDir: 0, fireT: 0,
    })
}

// ---------------------------------------------------------------- scoring ----
function addScore(gs, pts, meta) {
    gs.score += pts
    if (gs.score >= gs.upTo) { gs.lives = Math.min(CFG.maxLives, gs.lives + 1); gs.upTo += CFG.extraLife; gs.events.push({ type: '1up', pts: 0 }) }
    gs.events.push({ type: 'score', pts, ...meta })
}

function pumpLayer(e) {
    const r = rowOf(e.y)
    if (r <= AIR_BOT) return -1 // in the open air: half of layer 0
    return layerOf(r)
}

function pumpKillPoints(e) {
    const l = pumpLayer(e)
    const table = PUMP_POINTS[e.kind]
    return l < 0 ? Math.floor(table[0] / 2) : table[l]
}

function rockKillPoints(e, nCrushed) {
    return ROCK_BASE * (layerOf(rowOf(e.y)) + 1) * nCrushed
}

// ---------------------------------------------------------------- harpoon ----
function fireHarpoon(gs, inp) {
    const h = gs.harpoon
    const p = gs.player
    if (h) {
        if (h.attached && h.state === 'hold') { pump(gs) }
        return
    }
    // aim is independent of the movement keys: you can fire and back away
    let ax = p.dir[0], ay = p.dir[1]
    if (inp && inp.aim) {
        ax = inp.aim[0]; ay = inp.aim[1]
        if (ax !== 0 && ay !== 0) { if (Math.abs(ax) >= Math.abs(ay)) ay = 0; else ax = 0 }
        if (ax === 0 && ay === 0) { ax = p.dir[0]; ay = p.dir[1] }
    }
    gs.harpoon = { x: p.x, y: p.y, dx: ax, dy: ay, len: 0, state: 'out', attached: null, cool: 0 }
}

function pump(gs) {
    const h = gs.harpoon
    const e = gs.enemies.find((x) => x.id === h.attached)
    if (!e) { gs.harpoon = null; return }
    e.stage += 1
    e.defl = CFG.deflateTicks
    gs.events.push({ type: 'puff', id: e.id, stage: e.stage, x: e.x, y: e.y })
    if (e.stage >= CFG.pumpStages) {
        const pts = pumpKillPoints(e)
        addScore(gs, pts, { kind: 'pump', enemy: e.kind })
        gs.events.push({ type: 'pumpKill', id: e.id, kind: e.kind, pts, x: e.x, y: e.y })
        gs.enemies = gs.enemies.filter((x) => x.id !== e.id)
        gs.harpoon = null
        gs.kills++
    }
}

function updateHarpoon(gs) {
    const h = gs.harpoon
    if (!h) return
    if (h.state === 'hold') {
        const e = gs.enemies.find((x) => x.id === h.attached)
        if (!e) { gs.harpoon = null; return }
        const dist = Math.hypot(e.x - gs.player.x, e.y - gs.player.y)
        // the harpoon telescopes with the inflation; it snaps off only at full reach
        if (e.stage > 0 && dist > h.len) h.len = Math.min(70, dist)
        if (dist > 70) {
            e.attached = false
            gs.harpoon = null
            return
        }
        // shove the inflated enemy away from the player
        if (e.stage > 0) {
            const s = Math.sign(e.x - gs.player.x) || 1
            e.x = clamp(e.x + s * CFG.shove, CELL / 2, W - CELL / 2)
            const nc = colOf(e.x)
            if (isRockCell(gs, rowOf(e.y), nc)) e.x -= s * CFG.shove
        }
        return
    }
    if (h.state === 'out') {
        h.len += CFG.harpoonSpeed
        const tipx = h.x + h.dx * h.len, tipy = h.y + h.dy * h.len
        const tr = rowOf(tipy), tc = colOf(tipx)
        // stops at dirt / rock / walls
        if (tc < 0 || tc >= COLS || tr < AIR_TOP || tr > DIRT_BOT || gs.dirt[tr][tc] || isRockCell(gs, tr, tc)) {
            h.state = 'back'; return
        }
        for (const e of gs.enemies) {
            if (e.ghost || e.stage > 0) continue
            if (Math.abs(e.x - tipx) < 13 && Math.abs(e.y - tipy) < 13) {
                h.attached = e.id; h.state = 'hold'; e.attached = true
                e.stage = 1; e.defl = CFG.deflateTicks
                gs.events.push({ type: 'hook', id: e.id, x: e.x, y: e.y })
                gs.events.push({ type: 'puff', id: e.id, stage: 1, x: e.x, y: e.y })
                return
            }
        }
        if (h.len >= CFG.harpoonLen) h.state = 'back'
        return
    }
    h.len -= CFG.harpoonSpeed
    if (h.len <= 0) { gs.harpoon = null; if (!gs.harpoon) gs._cool = CFG.harpoonCool }
}

// ---------------------------------------------------------------- enemies ----
function bfsPath(gs, sr, sc, tr, tc, openOnly = false) {
    // ghost pathing: through dirt and open cells alike; rocks/floor block.
    // openOnly (a fleeing enemy) sticks to dug/air ground so it stays catchable.
    if (!inField(tr, tc)) return []
    const prev = new Map()
    const q = [[sr, sc]]
    const seen = new Set([`${sr},${sc}`])
    const nbrs = [[0, 1], [0, -1], [1, 0], [-1, 0]]
    while (q.length) {
        const [r, c] = q.shift()
        if (r === tr && c === tc) {
            // waypoints after the start, ending at the goal cell itself
            const path = []
            let k = `${r},${c}`
            while (k !== undefined && k !== `${sr},${sc}`) {
                path.unshift(k.split(',').map(Number))
                k = prev.get(k)
            }
            return path
        }
        for (const [dr, dc] of nbrs) {
            const nr = r + dr, nc = c + dc
            const key = `${nr},${nc}`
            if (seen.has(key) || nr < AIR_TOP || nr > DIRT_BOT || nc < 0 || nc >= COLS) continue
            if (isRockCell(gs, nr, nc)) continue
            if (openOnly && gs.dirt[nr][nc]) continue
            seen.add(key); prev.set(key, `${r},${c}`); q.push([nr, nc])
        }
    }
    return openOnly ? bfsPath(gs, sr, sc, tr, tc, false) : []
}

function updateEnemies(gs) {
    const R = ROUNDS[gs.round]
    const p = gs.player
    const inPlay = gs.enemies.filter((e) => e.state !== 'gone').length
    // classic: the LAST enemy left in play (nothing waiting to respawn) flees
    const lastOne = inPlay === 1 && gs.queue.length === 0
    if (lastOne && !gs._fleeSet) {
        gs._fleeSet = true
        for (const e of gs.enemies) {
            if (e.state === 'gone') continue
            e.flee = true
            e.stage = 0
            e.attached = false
            if (gs.harpoon && gs.harpoon.attached === e.id) gs.harpoon = null
            gs.events.push({ type: 'flee', id: e.id })
        }
    }
    if (!lastOne) gs._fleeSet = false

    for (const e of gs.enemies) {
        if (e.state === 'gone') continue
        const er = rowOf(e.y), ec = colOf(e.x)

        // inflated: no movement, deflation countdown
        if (e.stage > 0) {
            e.defl--
            if (e.defl <= 0) {
                e.stage--
                e.defl = CFG.deflateTicks
                gs.events.push({ type: 'deflate', id: e.id, stage: e.stage })
                if (e.stage === 0) {
                    e.attached = false
                    if (gs.harpoon && gs.harpoon.attached === e.id) gs.harpoon = null
                }
            }
            continue
        }

        // movement toward target
        e.repathT--
        const fleeCorner = p.x > W / 2 ? 0 : COLS - 1
        const tgt = e.flee
            ? { r: AIR_TOP, c: fleeCorner }
            : { r: rowOf(p.y), c: colOf(p.x) }
        if (e.repathT <= 0 || e.path.length === 0) {
            e.path = bfsPath(gs, er, ec, tgt.r, tgt.c, e.flee)
            e.repathT = 24
        }
        if (e.flee && er <= AIR_TOP && (ec <= 0 || ec >= COLS - 1)) {
            // exits the corner: re-enters a lap later near the OTHER side
            e.state = 'gone'
            e.exitCol = ec
            gs.events.push({ type: 'escaped', id: e.id })
            gs.escapeT = 90
            continue
        }
        const [nr, nc] = e.path.length ? e.path[0] : [er, ec]
        const tx = cx(nc), ty = cy(nr)
        const sp = gs.dirt[clamp(er, 0, ROWS - 1)][clamp(ec, 0, COLS - 1)] ? R.ghostSpeed : R.walkSpeed
        const fleeSp = e.flee ? sp * 1.2 : sp
        const dx = tx - e.x, dy = ty - e.y
        const dist = Math.abs(dx) + Math.abs(dy)
        if (dist < 1) { e.path.shift() }
        else {
            if (Math.abs(dx) >= Math.abs(dy)) e.x += clamp(dx, -fleeSp, fleeSp)
            else e.y += clamp(dy, -fleeSp, fleeSp)
        }
        e.ghost = isDirt(gs, rowOf(e.y), colOf(e.x))

        // touching a solid, uninflated, unhooked enemy kills the player
        if (!e.ghost && !e.attached && e.state === 'walk' && Math.abs(e.x - p.x) < CFG.killR && Math.abs(e.y - p.y) < CFG.killR + 2) {
            killPlayer(gs, 'touch')
            return
        }

        // Fygar fire: straight down a fully open tunnel row
        if (e.kind === 'fygar' && !e.ghost && !e.flee) {
            if (e.fireT > 0) {
                e.fireT--
                e.fireLen = Math.min(CFG.fireMax, e.fireLen + CFG.fireSpeed)
                const tipc = colOf(e.x + e.fireDir * e.fireLen)
                if (tipc < 0 || tipc >= COLS || gs.dirt[er][clamp(tipc, 0, COLS - 1)] || isRockCell(gs, er, tipc)) e.fireT = Math.min(e.fireT, 6)
                if (rowOf(p.y) === er && Math.sign(p.x - e.x) === e.fireDir && Math.abs(p.x - e.x) <= e.fireLen && openCell(gs, er, colOf(p.x))) {
                    killPlayer(gs, 'fire')
                    return
                }
                if (e.fireT === 0) e.breathT = R.breathCd
            } else {
                e.breathT--
                const sameRow = rowOf(p.y) === er
                const dir = Math.sign(p.x - e.x)
                let clear = sameRow && dir !== 0 && Math.abs(p.x - e.x) < CFG.fireMax
                if (clear) {
                    for (let c = ec + dir; dir > 0 ? c < colOf(p.x) : c > colOf(p.x); c += dir) {
                        if (!openCell(gs, er, c)) { clear = false; break }
                    }
                    if (!openCell(gs, er, colOf(p.x))) clear = false
                }
                if (clear && e.breathT <= 0) {
                    e.fireT = Math.ceil(Math.abs(p.x - e.x) / CFG.fireSpeed) + CFG.fireTail
                    e.fireDir = dir; e.fireLen = 0
                    gs.events.push({ type: 'fire', id: e.id, dir, row: er })
                }
            }
        } else if (e.fireT > 0) { e.fireT-- }
    }

    // respawn the roster while the goal is unmet
    if (gs.queue.length && gs.enemies.length < R.cap) {
        gs.respawnT--
        if (gs.respawnT <= 0) { spawnEnemy(gs, seedRot(gs.seed)[(gs._nextId + gs.kills) % 3]); gs.respawnT = CFG.respawn }
    }
    if (gs.escapeT > 0) {
        gs.escapeT--
        if (gs.escapeT === 0) {
            const e = gs.enemies.find((x) => x.state === 'gone')
            if (e) {
                // re-enters from the side it left, then runs the full lap away
                const backCol = e.exitCol <= COLS / 2 ? 1 : COLS - 2
                e.state = 'walk'; e.flee = gs.queue.length === 0
                e.x = cx(backCol); e.y = cy(AIR_TOP); e.path = []
            }
        }
    }
}

// ---------------------------------------------------------------- rocks ----
function supportAbove(gs, k) {
    let n = 0
    for (let r = DIRT_TOP; r < k.row; r++) if (gs.dirt[r][k.col]) n++
    return n
}

function updateRocks(gs) {
    for (const k of gs.rocks) {
        if (k.state === 'held') {
            if (supportAbove(gs, k) === 0) { k.state = 'warn'; k.warnT = CFG.rockWarn; gs.events.push({ type: 'rockWarn', id: k.id, col: k.col, row: k.row }) }
        } else if (k.state === 'warn') {
            k.warnT--
            if (k.warnT <= 0) { k.state = 'fall'; k.vy = 0.4; gs.rocksDropped++; gs.events.push({ type: 'rockFall', id: k.id, col: k.col }) }
        } else if (k.state === 'fall') {
            k.vy = Math.min(CFG.rockMaxV, k.vy + CFG.rockAccel)
            const prevY = k.y
            k.y += k.vy
            // crush anything the rock passes over
            const crushed = []
            for (const e of gs.enemies) {
                if (e.state === 'gone') continue
                const inCol = Math.abs(e.x - cx(k.col)) < CELL
                const passed = e.y >= prevY - CELL / 2 && e.y <= k.y + CELL / 2
                if (inCol && passed) crushed.push(e)
            }
            if (crushed.length) {
                for (const e of crushed) {
                    const pts = rockKillPoints(e, crushed.length)
                    addScore(gs, pts, { kind: 'rock', enemy: e.kind })
                    gs.events.push({ type: 'rockKill', id: e.id, kind: e.kind, pts, x: e.x, y: e.y })
                    gs.kills++
                    if (gs.harpoon && gs.harpoon.attached === e.id) gs.harpoon = null
                }
                gs.enemies = gs.enemies.filter((e) => !crushed.includes(e))
                gs.events.push({ type: 'crush', n: crushed.length, col: k.col })
            }
            // land on the first solid thing below
            const below = rowOf(k.y + CELL / 2) + 0
            const landRow = below
            if (landRow >= FLOOR_ROW || gs.dirt[clamp(landRow, 0, ROWS - 1)][k.col] || isRockCell(gs, landRow, k.col)) {
                k.y = cy(landRow - 1)
                k.state = 'land'; k.squash = 12
                gs.events.push({ type: 'rockLand', id: k.id, col: k.col, row: landRow - 1 })
                if (gs.harpoon && gs.harpoon.attached === -1) gs.harpoon = null
                // the player gets crushed only if standing under it when it lands
                const p = gs.player
                if (colOf(p.x) === k.col && rowOf(p.y) === landRow - 1) { killPlayer(gs, 'rock'); return }
            }
        } else if (k.state === 'land') {
            if (k.squash > 0) k.squash--
        }
    }
    // veggies sprout after two rocks
    if (gs.rocksDropped >= 2) {
        for (const v of gs.veggies) {
            if (!v.live) { v.live = true; gs.events.push({ type: 'veggieSpawn', id: v.id, col: v.col, row: v.row }) }
        }
    }
    for (const v of gs.veggies) {
        if (v.live && !v.taken && colOf(gs.player.x) === v.col && rowOf(gs.player.y) === v.row) {
            v.taken = true
            const pts = 300 + gs.round * 100
            addScore(gs, pts, { kind: 'veggie' })
            gs.events.push({ type: 'veggie', id: v.id, pts })
        }
    }
}

// ---------------------------------------------------------------- player ----
function killPlayer(gs, how) {
    if (gs.player.deadT > 0 || gs.end) return
    gs.player.deadT = CFG.deathFreeze
    gs.lives--
    gs.harpoon = null
    gs.events.push({ type: 'death', how, lives: gs.lives })
}

function updatePlayer(gs, inp) {
    const p = gs.player
    if (p.deadT > 0) {
        p.deadT--
        if (p.deadT === 0) {
            if (gs.lives <= 0) { gs.end = 'over'; return }
            // restart the round: dirt and rocks come back, score and kills stay
            startRoundFresh(gs)
            gs.events.push({ type: 'roundRestart' })
        }
        return
    }
    let dx = 0, dy = 0
    if (inp.left) dx = -1
    else if (inp.right) dx = 1
    else if (inp.up) dy = -1
    else if (inp.down) dy = 1
    p.moving = false
    if (dx !== 0) p.dir = [dx, 0]
    if (dy !== 0) p.dir = [0, dy]
    if (dx !== 0 || dy !== 0) {
        const r = rowOf(p.y), c = colOf(p.x)
        const tr = r + dy, tc = c + dx
        if (dx !== 0 && tc >= 0 && tc < COLS) {
            if (isDirt(gs, r, tc)) dig(gs, p, dx, 0, CFG.digH)
            else if (openCell(gs, r, tc)) { p.x += dx * CFG.playerSpeed; p.moving = true }
            else if (dy === 0) p.digT = 0
        } else if (dy !== 0 && tr >= AIR_TOP && tr <= DIRT_BOT) {
            if (isDirt(gs, tr, c)) dig(gs, p, 0, dy, CFG.digUp)
            else if (openCell(gs, tr, c)) { p.y += dy * (dy < 0 ? CFG.playerSpeed * 0.8 : CFG.playerSpeed); p.moving = true }
        }
        // snap toward tunnel center on the idle axis
        if (dx !== 0) p.y += (cy(r) - p.y) * CFG.centerLerp
        if (dy !== 0) p.x += (cx(c) - p.x) * CFG.centerLerp
        if (dx !== 0 && dy !== 0) { /* dx wins above; never both */ }
    }
    p.x = clamp(p.x, CELL / 2, W - CELL / 2)
    p.y = clamp(p.y, cy(AIR_TOP), cy(DIRT_BOT))
    if (inp.fire && (gs._cool || 0) <= 0) fireHarpoon(gs, inp)
    if ((gs._cool || 0) > 0) gs._cool--
}

function dig(gs, p, dx, dy, cost) {
    p.digT++
    if (p.digT < cost) return
    p.digT = 0
    const r = rowOf(p.y) + dy, c = colOf(p.x) + dx
    if (!isDirt(gs, r, c)) return
    gs.dirt[r][c] = false
    p.moving = true
    gs.events.push({ type: 'dig', col: c, row: r, layer: layerOf(r) })
    if (dx !== 0) p.x += dx * CFG.playerSpeed
}

function startRoundFresh(gs) {
    const R = ROUNDS[gs.round]
    buildGrid(gs)
    gs.rocks = R.rocks.map((k) => ({ id: gs._nextId++, col: k.col, row: k.row, y: cy(k.row), state: 'held', vy: 0, squash: 0 }))
    gs.veggies = R.vegSpots.map((v, i) => ({ id: gs._nextId++, col: v.col, row: v.row, spot: i, live: false, bob: i * 7 }))
    gs.queue = R.comp.slice()
    gs.enemies = []
    const rot = seedRot(gs.seed)
    { const n0 = Math.min(R.cap, gs.queue.length); for (let i = 0; i < n0; i++) spawnEnemy(gs, rot[i % 3]) }
    gs.respawnT = CFG.respawn; gs.escapeT = 0
    gs.harpoon = null
    gs._fleeSet = false
    gs.player = { x: cx(9), y: cy(AIR_BOT), dir: [1, 0], digT: 0, moving: false, deadT: 0 }
}

// ---------------------------------------------------------------- step ----
export function step(gs, inp) {
    gs.tick++
    if (gs.end) return gs

    if (gs.roundPhase === 'pause') {
        gs.phaseT--
        if (gs.phaseT <= 0) {
            if (gs.round + 1 >= ROUNDS.length) { gs.end = 'win'; gs.events.push({ type: 'win' }); return gs }
            startRound(gs, gs.round + 1)
            gs.events.push({ type: 'round', round: gs.round })
        }
        return gs
    }

    updatePlayer(gs, inp)
    if (gs.player.deadT > 0 || gs.end) {
        if (gs.end) return gs
        // frozen while the death animation plays
        return gs
    }
    updateHarpoon(gs)
    updateEnemies(gs)
    if (gs.player.deadT > 0 || gs.end) return gs
    updateRocks(gs)

    if (gs.kills >= ROUNDS[gs.round].goal && gs.roundPhase === 'play') {
        const bonus = ROUND_BONUS(gs.round)
        addScore(gs, bonus, { kind: 'roundBonus' })
        gs.roundPhase = 'pause'; gs.phaseT = CFG.roundPause
        gs.events.push({ type: 'roundClear', round: gs.round, pts: bonus })
    }
    return gs
}

// ---------------------------------------------------------------- hash ----
export function stateHash(gs) {
    const p = gs.player
    const parts = [
        gs.tick, gs.round, gs.lives, gs.score, gs.kills, gs.rocksDropped, gs.end || '-',
        p.x.toFixed(2), p.y.toFixed(2), p.dir.join(','), p.deadT,
        gs.dirt.map((row) => row.map((d) => (d ? 1 : 0)).join('')).join(''),
        gs.harpoon ? `${gs.harpoon.state}${gs.harpoon.attached || 0}${gs.harpoon.len.toFixed(1)}` : '-',
        ...gs.enemies.map((e) => `${e.id}${e.kind}${e.state}${e.x.toFixed(2)},${e.y.toFixed(2)},s${e.stage}${e.ghost ? 'g' : ''}${e.flee ? 'f' : ''}`),
        ...gs.rocks.map((k) => `${k.id}${k.state}${k.y.toFixed(1)}`),
        ...gs.veggies.map((v) => `${v.id}${v.live ? 1 : 0}${v.taken ? 1 : 0}`),
    ]
    return fnv(parts.join('|'))
}

export function clone(gs) {
    return JSON.parse(JSON.stringify(gs))
}
