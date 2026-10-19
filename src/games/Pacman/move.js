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
                        P.powerTimer = 600
                        eaten = 'power'
                    }
                }
            }
        }
    }
    return eaten
}
