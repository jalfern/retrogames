// TETRIS (NES, 1989) — the pure simulation. Zero Math.random, zero DOM:
// (state, input) -> state, so scripts/tetrischeck.mjs can audit the gravity
// table, DAS, soft-drop cadence, the scoring ledger and the line-clear rules
// in plain Node, tick-for-tick, with the SAME code the renderer runs.
//
// Fidelity contract (issue #208):
//   NTSC A-Type gravity, levels 0-9: 48,43,38,33,28,23,18,13,8,6 frames/row.
//   Past level 9 the arcade keeps accelerating; the exact NES high-level table
//   is NOT reproduced here — it is an honest extrapolation (down to 2f at L29)
//   and the harness only pins the documented L0-9 rows. See README.md.
//   DAS 16/6 (16-frame initial delay, every 6 frames after). Soft drop = one
//   row every 2 frames while held. No hard drop, no hold, no ghost, no kicks.
//   Scoring 40/100/300/1200 x (level+1), capped at 9,999,990; level up every
//   10 lines; the piece locks on the first downward attempt that fails (the
//   NES has zero lock delay). Top-out = a spawn that collides.
//   Pieces: 8-bit Galois LFSR (period 255), piece = r % 7 (this keeps the
//   NES's documented modulo bias), reroll while it would form a triple.

export const COLS = 10
export const ROWS = 20
export const FIXED_DT = 1000 / 60
export const GRAVITY = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6]
export const LEVEL_CAP = 29
export const DAS_DELAY = 16
export const DAS_REPEAT = 6
export const SOFT_FRAMES = 2
export const SCORE_LINES = [0, 40, 100, 300, 1200]
export const SCORE_CAP = 9999990
export const PIECE_NAMES = ['L', 'J', 'O', 'S', 'Z', 'I', 'T']

function shapeSet(box, cells) {
    const n = box
    const rots = [cells]
    const count = box === 2 ? 1 : box === 4 ? 2 : 4
    for (let k = 1; k < count; k++) {
        rots.push(rots[k - 1].map(([r, c]) => [c, n - 1 - r]))
    }
    return rots
}

// Shapes in PIECE_NAMES order. Boxes: L/J/S/Z/T in a 3x3, O in a 2x2, I in a 4x4.
export const SHAPES = [
    shapeSet(3, [[0, 0], [1, 0], [2, 0], [2, 1]]),          // L
    shapeSet(3, [[0, 2], [1, 2], [2, 1], [2, 2]]),          // J
    shapeSet(2, [[0, 0], [0, 1], [1, 0], [1, 1]]),          // O
    shapeSet(3, [[0, 1], [0, 2], [1, 0], [1, 1]]),          // S
    shapeSet(3, [[0, 0], [0, 1], [1, 1], [1, 2]]),          // Z
    shapeSet(4, [[1, 0], [1, 1], [1, 2], [1, 3]]),          // I
    shapeSet(3, [[0, 1], [1, 0], [1, 1], [1, 2]]),          // T
]
export const SPAWN_X = 3
export const SPAWN_Y = 0

export function gravityFrames(level) {
    if (level <= 9) return GRAVITY[level]
    return Math.max(2, 6 - Math.floor((level - 9) / 5))
}

// 8-bit Galois LFSR, taps x^8+x^6+x^5+x^4+1 -> 0xB8, period 255.
export function lfsr8(r) {
    const fb = r & 1
    r >>= 1
    if (fb) r ^= 0xB8
    return r & 0xFF
}

export function newGame(startLevel = 0, seed = 1) {
    let s = {
        board: new Uint8Array(ROWS * COLS),
        cur: null, next: 0,
        rng: 0, last1: -1, last2: -1,
        level: Math.max(0, Math.min(LEVEL_CAP, startLevel | 0)),
        startLevel: Math.max(0, Math.min(LEVEL_CAP, startLevel | 0)),
        lines: 0, score: 0,
        g: 0, dasDir: 0, dasF: 0, softF: 0,
        prevRot: false,
        over: false,
        tick: 0,
        locks: 0,
        events: [],
        seed: seed >>> 0 || 0x9e37,
    }
    s.rng = s.seed & 0xFF || 0x1d
    s.next = drawPiece(s)
    s.cur = spawn(s.next)
    s.next = drawPiece(s)
    return s
}

export function drawPiece(s) {
    let p
    do {
        s.rng = lfsr8(s.rng)
        p = s.rng % 7
    } while (p === s.last1 && p === s.last2)
    s.last2 = s.last1
    s.last1 = p
    return p
}

export function spawn(type) {
    return { type, rot: 0, x: SPAWN_X, y: SPAWN_Y }
}

export function cellsOf(type, rot, x, y) {
    return SHAPES[type][rot % SHAPES[type].length].map(([r, c]) => [y + r, x + c])
}

export function fits(s, type, rot, x, y) {
    for (const [r, c] of cellsOf(type, rot, x, y)) {
        if (c < 0 || c >= COLS || r >= ROWS) return false
        if (r >= 0 && s.board[r * COLS + c]) return false
    }
    return true
}

function lockPiece(s) {
    const { type, rot, x, y } = s.cur
    for (const [r, c] of cellsOf(type, rot, x, y)) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) s.board[r * COLS + c] = type + 1
    }
    s.locks++
    s.events.push({ t: 'lock', piece: PIECE_NAMES[type] })
    const full = []
    for (let r = 0; r < ROWS; r++) {
        let done = true
        for (let c = 0; c < COLS; c++) if (!s.board[r * COLS + c]) { done = false; break }
        if (done) full.push(r)
    }
    const n = full.length
    if (n > 0) {
        for (const r of full) {
            for (let rr = r; rr > 0; rr--) s.board.copyWithin(rr * COLS, (rr - 1) * COLS, rr * COLS)
            s.board.fill(0, 0, COLS)
        }
        const before = s.level
        s.score = Math.min(SCORE_CAP, s.score + SCORE_LINES[n] * (s.level + 1))
        s.lines += n
        s.level = Math.min(LEVEL_CAP, s.startLevel + Math.floor(s.lines / 10))
        s.events.push({ t: 'clear', n, rows: full, gained: SCORE_LINES[n] * (before + 1) })
        if (s.level > before) s.events.push({ t: 'level', level: s.level })
    }
    s.cur = spawn(s.next)
    s.next = drawPiece(s)
    s.g = 0
    s.softF = 0
    if (!fits(s, s.cur.type, s.cur.rot, s.cur.x, s.cur.y)) {
        s.over = true
        s.events.push({ t: 'over' })
    }
}

function tryMove(s, dx) {
    if (fits(s, s.cur.type, s.cur.rot, s.cur.x + dx, s.cur.y)) {
        s.cur.x += dx
        s.events.push({ t: 'move', dx })
        return true
    }
    return false
}

function tryRotate(s) {
    const nr = (s.cur.rot + 1) % SHAPES[s.cur.type].length
    if (nr === s.cur.rot) return false
    if (fits(s, s.cur.type, nr, s.cur.x, s.cur.y)) {
        s.cur.rot = nr
        s.events.push({ t: 'rot', rot: nr })
        return true
    }
    return false
}

function tryDown(s) {
    if (fits(s, s.cur.type, s.cur.rot, s.cur.x, s.cur.y + 1)) {
        s.cur.y++
        return true
    }
    return false
}

export function step(s, input = {}) {
    if (s.over) return s
    s.tick++
    const left = !!input.left, right = !!input.right, down = !!input.down
    const rot = !!input.rot

    const dir = left && !right ? -1 : right && !left ? 1 : 0
    if (dir !== 0 && dir !== s.dasDir) {
        tryMove(s, dir)
        s.dasDir = dir
        s.dasF = 0
    } else if (dir !== 0) {
        s.dasF++
        if (s.dasF >= DAS_DELAY && (s.dasF - DAS_DELAY) % DAS_REPEAT === 0) tryMove(s, dir)
    } else {
        s.dasDir = 0
        s.dasF = 0
    }

    if (rot && !s.prevRot) tryRotate(s)
    s.prevRot = rot

    if (down) {
        s.softF++
        if (s.softF >= SOFT_FRAMES) {
            s.softF = 0
            if (!tryDown(s)) lockPiece(s)
            else s.g = 0
        }
    } else {
        s.softF = 0
    }

    s.g++
    if (s.g >= gravityFrames(s.level)) {
        s.g = 0
        if (!tryDown(s)) lockPiece(s)
    }
    return s
}

export function idx(r, c) { return r * COLS + c }

export function stateHash(s) {
    let h = 0x811c9dc5
    const mix = (v) => { h ^= v & 0xFF; h = Math.imul(h, 0x01000193) >>> 0 }
    for (let i = 0; i < s.board.length; i++) mix(s.board[i])
    mix(s.cur.type); mix(s.cur.rot); mix(s.cur.x + 32); mix(s.cur.y + 32)
    mix(s.next); mix(s.level); mix(s.lines)
    mix(s.score & 0xFF); mix(s.score >>> 8); mix(s.score >>> 16)
    mix(s.over ? 1 : 0)
    return h >>> 0
}
