// ICE CLIMBER CO-OP — mountain construction. Mountains are CARVED out of a
// solid ICE massif in code (the BoulderDash/Lemmings lesson): a rock shell, a
// floor, an air corridor under the ice, and a massif whose shaft is NOT
// authored — the shaft is created by punching, by the planner and by Jon's
// thumbs alike, tile by tile. `scripts/icecheck.mjs` proves every mountain
// with the real planner: it actually bores the column, times the condor and
// stacks a climber on a climber before it may call a summit winnable.
//
// The one piece of authored geometry per mountain:
//   shelf   PLAT row 6, cols 8-10 — the climb ends on it the moment the
//           shoulder flank runs out, because the punched drift column (8)
//           opens straight through it.
//   pocket  the un-punched ice column at 7 keeps a strip of the shelf top on
//           the condor's far side of every patrol — the only safe stand.
//   L3 only PLAT row 3, cols 8-10: the carrot shelf, three cells above the
//           single-jump ceiling of the game (rise 2.1). Nobody is that tall.

import { W, H, EMPTY, ICE, ROCK, PLAT } from './sim.js'

class Carve {
    constructor() { this.g = new Uint8Array(W * H).fill(EMPTY) }
    set(x, y, t) { if (x >= 0 && x < W && y >= 0 && y < H) this.g[y * W + x] = t; return this }
    rect(x0, y0, x1, y1, t) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t); return this }
}

function mountain(extra = {}) {
    const c = new Carve()
    c.rect(0, 0, 0, H - 1, ROCK)                 // world walls
    c.rect(W - 1, 0, W - 1, H - 1, ROCK)
    c.rect(1, 0, W - 2, 0, ROCK)                 // sky cap
    c.rect(0, H - 2, W - 1, H - 1, ROCK)         // the floor
    c.rect(5, 6, 9, 29, ICE)                     // the massif — the shaft lives here
    c.rect(8, 6, 10, 6, PLAT)                    // summit shelf
    if (extra.high) c.rect(8, 3, 10, 3, PLAT)    // the carrot shelf (L3 only)
    return c.g
}

export const LEVELS = [
    {
        // Teach the cut: walk the corridor, punch the massif, ride the flank
        // out onto the shelf, take the carrot. No hazard, one muscle.
        name: 'FIRST FROST',
        spawn: { x: 2.5, y: 32 }, carrot: [10, 5],
        proves: ['dig'],
        build: () => mountain(),
    },
    {
        // The condor owns the shelf. Its patrol stops short of the ice
        // column at 7 — the pocket — and the whole mountain is the dash from
        // pocket to carrot while its back is turned. The audit waits for the
        // bird at the far fence rather than gambling on luck.
        name: 'CONDOR PASS',
        spawn: { x: 2.5, y: 32 }, carrot: [10, 5],
        birds: [{ x: 12.6, y: 4.5, min: 8.9, max: 13.2, spd: 0.04, dir: -1 }],
        proves: ['dig', 'dodge'],
        build: () => mountain(),
    },
    {
        // The co-op bill comes due: the carrot shelf hangs three cells over
        // the summit shelf, and the highest jump in the game clears two.
        // The only way up is a climber-shaped stepladder. Silence the
        // shoulder rule and this mountain is a poster, not a level. The
        // carrot sits at the FAR end of that shelf so even a climber riding
        // a head (two cells up, short arm) cannot lean the last step.
        name: 'THE STACK',
        spawn: { x: 2.5, y: 32 }, carrot: [10, 1],
        proves: ['dig', 'shoulder'],
        build: () => mountain({ high: true }),
    },
]

export function buildLevel(idx) {
    const lv = LEVELS[idx % LEVELS.length]
    const { build, ...meta } = lv
    return { ...meta, idx, grid: build() }
}
