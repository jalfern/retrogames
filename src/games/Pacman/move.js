// PAC-MAN player movement — the arcade input rules, pure and Node-testable.
//
// #472: the original decode read the one pad's axes in a fixed priority
// (up > down > left > right), so a held diagonal kept ONE axis: heading up or
// down, the horizontal pre-turn was lost, and a turn could only ever start
// exactly on a tile centre. The classic rules this module implements:
//
//   * a held DIAGONAL means "keep my heading, pre-turn the other axis" —
//     the along-axis keeps the heading, the other axis is the buffered turn,
//   * a tap or hold is BUFFERED until the first opening in that direction
//     (or until a newer input replaces it),
//   * a 180 is instant, anywhere in the tile,
//   * cornering: the buffered turn starts a few px (CORNER) BEFORE the tile
//     centre, not on it.
//
// The module owns the maze, the tile-lookup and one fixed tick of the player.
// Ghosts, sound and drawing stay in the component; it calls stepPlayer once
// per tick with the pad's held directions and plays the returned event.

export const CELL_SIZE = 16
export const TUNNEL_ROW = 14
// arcade cornering: the turn may start this many px before the tile centre
export const CORNER_PX = 4
export const CORNER = CORNER_PX / CELL_SIZE

// The power pellet is 600 ticks of scared ghosts. The arcade keeps them solid
// blue for the bulk of that and only flashes white in the final seconds to warn
// the power is expiring — a two-stage tell, not a constant strobe. Driven by the
// world timer (powerTimer), never wall-clock, so a clock-driven harness sees both
// stages at deterministic ticks (pacmancheck gates this). (#1508)
export const POWER_TICKS = 600
export const SCARED_FLASH_AT = 180
export const SCARED_BLINK = 20
export function scaredSkin(powerTimer) {
    if (powerTimer > SCARED_FLASH_AT) return 'blue'
    return Math.floor(powerTimer / SCARED_BLINK) % 2 === 0 ? 'blue' : 'white'
}

// 0: Path, 1: Wall Block, 2: Dot, 3: Power, 4: Ghost-house Door
export const MAP = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
    [1, 3, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 3, 1],
    [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1],
    [1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 1],
    [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 1, 0, 0, 4, 4, 0, 0, 1, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
    [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
    [1, 3, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 0, 0, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 3, 1],
    [1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1],
    [1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1],
    [1, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1],
    [1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
]

export const ROWS = MAP.length
export const COLS = MAP[0].length

export const cloneMap = () => MAP.map(row => [...row])

// The spawn sits on the two-tile gap under the ghost house (the classic
// position), snapped to a tile centre so the tile+progress invariant holds —
// the old 13.5 start cost a half-cell hitch on the first step.
export function makePacman() {
    return {
        x: 14, y: 23,
        dir: { x: -1, y: 0 },
        nextDir: { x: -1, y: 0 },
        progress: 0,
        speed: 0.15,
        poweredUp: false,
        powerTimer: 0
    }
}

// Can a player leave tile (x, y) in direction d? The tunnel row wraps; the
// ghost-house door (4) is solid for the player. Dimensions come from the map
// (not the module maze) so pacmancheck's alternate mazes (CROSS / CORRIDOR)
// work too — a small grid must not be indexed against the big maze's rows.
export function tileOpen(map, x, y, d) {
    const rows = map.length, cols = map[0].length
    const nx = x + d.x, ny = y + d.y
    if (ny === TUNNEL_ROW && (nx < 0 || nx >= cols)) return true
    return nx >= 0 && nx < cols && ny >= 0 && ny < rows && map[ny][nx] !== 1 && map[ny][nx] !== 4
}

const same = (a, b) => a.x === b.x && a.y === b.y
const opposite = (a, b) => a.x === -b.x && a.y === -b.y

// One fixed tick of the player.
//
// gs    : { map, pacman, score } — mutated in place (score on a dot/power).
// held  : the pad's held directions as {x, y} vectors, in pad priority order
//         (up, down, left, right) — the component builds this from the one pad.
// returns 'dot' | 'power' | null for the component's audio.
export function stepPlayer(gs, held) {
    const P = gs.pacman
    if (held.length === 2 && opposite(held[0], held[1])) held.length = 1
    const moving = P.dir.x !== 0 || P.dir.y !== 0
    let reversed = false

    if (held.length && moving) {
        const rev = held.find(d => opposite(d, P.dir))
        if (rev) {
            // the classic 180: instant, anywhere in the tile. Keep the position:
            // x + dir*p is unchanged when the tile ref moves one ahead and the
            // progress mirrors. The reversal IS the whole tick — no turn, no
            // advance (advancing would break that invariant); the pre-turn rides
            // nextDir into the next tick.
            P.x += P.dir.x
            P.y += P.dir.y
            P.progress = 1 - P.progress
            if (P.x <= -1) P.x = COLS - 1
            else if (P.x >= COLS) P.x = 0
            P.dir = { x: -P.dir.x, y: -P.dir.y }
            const pre = held.find(d => d !== rev)
            if (pre) P.nextDir = pre
            reversed = true
        } else if (held.length > 1) {
            // diagonal: keep the heading, pre-turn the other axis
            const along = held.find(d => same(d, P.dir))
            P.nextDir = along ? held.find(d => !same(d, along)) : held[0]
        } else {
            P.nextDir = held[0]
        }
    } else if (!moving && held.length) {
        // stopped (wall guard): any held direction that is open restarts the run
        for (const d of held) if (tileOpen(gs.map, P.x, P.y, d)) { P.dir = d; break }
    }

    let eaten = null
    if (!reversed) {
        // Take the buffered turn at the first opening — cornering lets it start
        // CORNER px before the tile centre.
        if (P.dir.x !== 0 || P.dir.y !== 0) {
            const nd = P.nextDir
            if (nd && !same(nd, P.dir)) {
                if (P.progress === 0) {
                    if (tileOpen(gs.map, P.x, P.y, nd)) P.dir = nd
                } else if (P.progress >= 1 - CORNER) {
                    const tx = P.x + P.dir.x, ty = P.y + P.dir.y
                    if (tileOpen(gs.map, tx, ty, nd)) {
                        P.x = tx; P.y = ty
                        P.progress = 0
                        P.dir = nd
                    }
                }
            }
            if (P.progress === 0 && !tileOpen(gs.map, P.x, P.y, P.dir)) {
                P.dir = { x: 0, y: 0 }
            }
        }

        if (P.dir.x !== 0 || P.dir.y !== 0) {
            P.progress += P.speed
            if (P.progress >= 1) {
                P.x += P.dir.x
                P.y += P.dir.y
                P.progress = 0
                P.x = Math.round(P.x)
                P.y = Math.round(P.y)
                if (P.x <= -1) P.x = COLS - 1
                else if (P.x >= COLS) P.x = 0
                const mx = P.x, my = P.y
                if (mx >= 0 && mx < COLS && my >= 0 && my < ROWS) {
                    const tile = gs.map[my][mx]
                    if (tile === 2) {
                        gs.map[my][mx] = 0
                        gs.score += 10
                        eaten = 'dot'
                    } else if (tile === 3) {
                        gs.map[my][mx] = 0
                        gs.score += 50
                        P.poweredUp = true
                        P.powerTimer = POWER_TICKS
                        eaten = 'power'
                    }
                }
            }
        }
    }
    return eaten
}

// ---------------------------------------------------------------------------
// GHOST AI — #1473 seedpin batch 15. The whole ghost brain lives here as pure
// functions: the map, pacman and the ghosts arrive through gs, every die roll
// comes from the injected rand (seedRng(seed) upstream). stepGhost is exactly
// what the shipped loop runs per ghost per tick, so the Node harness proves the
// real thing: same seed → byte-identical wander; seeded worlds replay.
// ---------------------------------------------------------------------------

export function validMoves(map, x, y) {
    const moves = []
    if (y === 14) {
        if (x <= 1) { moves.push({ x: -1, y: 0 }); moves.push({ x: 1, y: 0 }); }
        else if (x >= COLS - 2) { moves.push({ x: 1, y: 0 }); moves.push({ x: -1, y: 0 }); }
    }
    if (x < COLS - 1 && map[y][x + 1] !== 1) moves.push({ x: 1, y: 0 })
    if (x > 0 && map[y][x - 1] !== 1) moves.push({ x: -1, y: 0 })
    if (y < ROWS - 1 && map[y + 1][x] !== 1 && map[y + 1][x] !== 4) moves.push({ x: 0, y: 1 })
    if (y > 0 && map[y - 1][x] !== 1) moves.push({ x: 0, y: -1 })
    return moves
}

export function bfsDir(map, startX, startY, targetType, targetPos = null, pacPos = null) {
    let queue = [{ x: startX, y: startY, path: [] }]
    let visited = new Set(`${startX},${startY}`)
    let iterations = 0
    const MAX_ITER = 600

    while (queue.length > 0 && iterations++ < MAX_ITER) {
        let curr = queue.shift()
        if (targetType === 'dot' && map[curr.y][curr.x] === 2) return curr.path[0]
        if (targetType === 'power' && map[curr.y][curr.x] === 3) return curr.path[0]
        if (targetType === 'pacman' && pacPos && curr.x === pacPos.x && curr.y === pacPos.y) return curr.path[0]
        if (targetType === 'home' && curr.x === 13 && curr.y === 14) return curr.path[0]
        if (targetType === 'pos' && curr.x === targetPos.x && curr.y === targetPos.y) return curr.path[0]

        const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
        for (let d of dirs) {
            let nx = curr.x + d.x, ny = curr.y + d.y
            if (ny === 14 && (nx < 0 || nx >= COLS)) continue
            if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS && map[ny][nx] !== 1 && !visited.has(`${nx},${ny}`)) {
                visited.add(`${nx},${ny}`)
                queue.push({ x: nx, y: ny, path: [...curr.path, d] })
            }
        }
    }
    return null
}

export function nearestGhostDist(ghosts, x, y) {
    let minDist = Infinity
    ghosts.forEach(g => {
        const dist = Math.sqrt(Math.pow(g.x - x, 2) + Math.pow(g.y - y, 2))
        if (dist < minDist) minDist = dist
    })
    return minDist
}

// attract autopilot panic: move away from the nearest ghost, no instant reverse
export function safeMove(map, pacman, ghosts, x, y) {
    const moves = validMoves(map, x, y)
    if (moves.length === 0) return { x: 0, y: 0 }
    let bestMove = null
    let maxScore = -Infinity
    moves.forEach(m => {
        const nx = x + m.x
        const ny = y + m.y
        const ghostDist = nearestGhostDist(ghosts, nx, ny)
        const isReverse = (m.x === -pacman.dir.x && m.y === -pacman.dir.y)
        const score = ghostDist - (isReverse ? 2 : 0)
        if (score > maxScore) { maxScore = score; bestMove = m }
    })
    return bestMove
}

// one ghost, one tick: pen timers, exit path, per-tile decision (all rand
// draws), grid movement, tunnel wrap, and the touch predicate — in the same
// order, with the same rand consumption as before the extraction (scared rolls
// its die even on an empty move list; the fallback roll only fires when the
// decision came up empty).
export function stepGhost(g, gs, rand, hooks = {}) {
    const { map, pacman } = gs
    if (g.state === 'pen') {
        g.penTimer--
        if (g.penTimer <= 0) {
            g.state = 'exiting'
        } else {
            if (g.progress === 0) {
                if (!g.penBounceDir) g.penBounceDir = -1
                const ny = Math.round(g.y) + g.penBounceDir
                if (ny < 13 || ny > 15 || map[ny][Math.round(g.x)] === 1) g.penBounceDir *= -1
                g.nextDir = { x: 0, y: g.penBounceDir }
            }
            g.progress += g.speed * 0.5
            if (g.progress >= 1) {
                g.y += g.nextDir.y
                g.y = Math.round(g.y)
                g.progress = 0
            }
            return
        }
    }

    if (g.state === 'exiting') {
        if (g.progress === 0) {
            const gx = Math.round(g.x)
            const gy = Math.round(g.y)
            if (gy <= 11) g.state = 'chase'
            else if (gx < 13) g.nextDir = { x: 1, y: 0 }
            else if (gx > 13) g.nextDir = { x: -1, y: 0 }
            else g.nextDir = { x: 0, y: -1 }
        }
        if (g.state === 'exiting') {
            g.progress += g.speed
            if (g.progress >= 1) {
                g.x += g.nextDir.x
                g.y += g.nextDir.y
                g.x = Math.round(g.x)
                g.y = Math.round(g.y)
                g.progress = 0
            }
            return
        }
    }

    if (g.progress === 0) {
        let move = null
        const rx = Math.round(g.x), ry = Math.round(g.y)
        const pacPos = { x: Math.round(pacman.x), y: Math.round(pacman.y) }
        if (g.state === 'dead') {
            move = bfsDir(map, rx, ry, 'home')
            if (!move) { g.state = 'pen'; g.penTimer = 120 }
        } else if (g.state === 'scared') {
            const moves = validMoves(map, rx, ry)
            move = moves[Math.floor(rand() * moves.length)]
        } else if (g.type === 'blinky') {
            move = bfsDir(map, rx, ry, 'pacman', null, pacPos)
        } else if (g.type === 'pinky') {
            const tx = Math.max(0, Math.min(COLS - 1, Math.round(pacman.x + pacman.dir.x * 4)))
            const ty = Math.max(0, Math.min(ROWS - 1, Math.round(pacman.y + pacman.dir.y * 4)))
            move = bfsDir(map, rx, ry, 'pos', { x: tx, y: ty }, pacPos)
            if (!move) move = bfsDir(map, rx, ry, 'pacman', null, pacPos)
        } else {
            if (rand() > 0.5) {
                move = bfsDir(map, rx, ry, 'pacman', null, pacPos)
            } else {
                const moves = validMoves(map, rx, ry)
                if (moves.length > 0) move = moves[Math.floor(rand() * moves.length)]
            }
        }
        if (move) g.nextDir = move
        else {
            const moves = validMoves(map, rx, ry)
            if (moves.length > 0) g.nextDir = moves[Math.floor(rand() * moves.length)]
        }
    }
    if (g.nextDir) {
        let currentSpeed = g.speed
        if (g.state === 'scared') currentSpeed *= 0.6
        if (g.state === 'dead') currentSpeed *= 3.0
        g.progress += currentSpeed
        if (g.progress >= 1) {
            g.x += g.nextDir.x
            g.y += g.nextDir.y
            g.progress = 0
            g.x = Math.round(g.x)
            g.y = Math.round(g.y)
            if (g.x <= -1) g.x = COLS - 1
            if (g.x >= COLS) g.x = 0
        }
    }
    const dx = (g.x + (g.nextDir?.x || 0) * g.progress) - (pacman.x + pacman.dir.x * pacman.progress)
    const dy = (g.y + (g.nextDir?.y || 0) * g.progress) - (pacman.y + pacman.dir.y * pacman.progress)
    if (Math.sqrt(dx * dx + dy * dy) < 0.8) {
        if (g.state === 'scared') {
            g.state = 'dead'
            hooks.eat?.()
        } else if (g.state === 'chase') {
            hooks.hit?.()
        }
    }
}
