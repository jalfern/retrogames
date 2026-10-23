// BLOB BATTLE — the pure simulation. Zero Math.random, zero DOM:
// (state, [pad1, pad2]) -> state, so scripts/blobcheck.mjs can audit the chain
// rules, garbage exchange, counters and determinism in plain Node, tick-for-tick,
// with the SAME code the renderer runs.
//
// An original battler in the style of Puyo Puyo (Sega arcade, 1991):
//   - two 6x12 wells; falling PAIRS of orbs in 4 colors, rotating about a pivot
//   - groups of 4+ connected same-color orbs pop; the stack collapses and
//     re-pops — every pop after the first in one cascade is a chain step
//   - attack = (chain - 1) + one extra row per 4 beyond a group's first four;
//     grey rows with one hole each queue against the rival
//   - clearing anything while incoming garbage is QUEUED counters it: the queue
//     is nullified and your own attack still goes
//   - a blocked spawn or a garbage shove with nowhere to go tops the well out;
//     first to 2 rounds wins the match
//   - gravity rises with the round index (the arcade's mounting pressure)
//
// Determinism law: every random the sim consumes comes from the seed; the same
// seed plus the same per-seat pad streams hash identically on every box.

export const COLS = 6
export const ROWS = 12
export const FIXED_DT = 1000 / 60
export const COLORS = 4 // 1..4 on the board; 5 = garbage
export const GARBAGE = 5
export const ROUNDS_TO_WIN = 2

export const POP_FRAMES = 24  // pop animation window; the well freezes mid-pop
export const DROP_BEAT = 6    // collapse beat before the next pair spawns
export const LAND_FRAMES = 30 // warning beat before queued rows slam in

export const DAS_DELAY = 12
export const DAS_REPEAT = 4
export const SOFT_FRAMES = 2

export const GRAVITY = [48, 42, 36, 30, 24, 20, 16, 12, 8, 6]
export const gravityFrames = (roundIdx) => GRAVITY[Math.min(roundIdx, GRAVITY.length - 1)]

// child-orb offset by rotation, clockwise from spawn (child to the right).
export const ROT_OFFSETS = [[0, 1], [1, 0], [0, -1], [-1, 0]]

export function mulberry32(a) {
    return function () {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function drawPair(rng) {
    // arcade odds: each orb independently one of 4 colors (same-color pair 1/4)
    return [1 + Math.floor(rng() * COLORS), 1 + Math.floor(rng() * COLORS)]
}

function makeWell() {
    return {
        board: new Uint8Array(ROWS * COLS),
        cur: null,            // { x, y, rot, c1, c2 }
        next: null,           // previewed pair [c1, c2], drawn one pair ahead
        slide: [],           // { r, c, dy }: orb at (r,c) came from r+dy; renderer animates it back during the collapse beat
        phase: 'fall',        // fall | pop | drop | land | over
        phaseT: 0,
        popping: null,        // [r,c] cells mid-pop
        chain: 0,
        sizeExtras: 0,        // extra rows earned from big groups this cascade
        clearedThisCascade: 0,
        pending: 0,           // grey rows queued against THIS well by the rival
        holes: [],           // hole column per pending row (rolled at send time)
        _toSend: 0,         // rows this well just earned; step() delivers them
        rounds: 0,
        score: 0,
        over: false,
        dasDir: 0, dasF: 0, softF: 0, prevRot: false, prevDrop: false,
        g: 0,
        locks: 0,
    }
}

export function newGame(seed = 1, players = 1) {
    const s = {
        seed: seed >>> 0 || 0x9e37,
        wells: [makeWell(), makeWell()],
        players: players > 1 ? 2 : 1,
        round: 1,
        roundIdx: 0,
        winner: -1,
        tick: 0,
        over: false,
        events: [],
    }
    s.rng = mulberry32(s.seed)
    for (const w of s.wells) { w._rng = s.rng; w.next = drawPair(s.rng); spawnPair(w, 0, s.events) }
    return s
}

export function idx(r, c) { return r * COLS + c }

export function pairCells(x, y, rot) {
    const [dr, dc] = ROT_OFFSETS[rot % 4]
    return [[y, x], [y + dr, x + dc]]
}

export function fits(w, x, y, rot) {
    for (const [r, c] of pairCells(x, y, rot)) {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false
        if (w.board[idx(r, c)]) return false
    }
    return true
}

function spawnPair(w, seat, ev) {
    const [c1, c2] = w.next || drawPair(w._rng)
    w.next = drawPair(w._rng)
    w.cur = { x: 2, y: 0, rot: 0, c1, c2 }
    w.g = 0; w.softF = 0; w.dasF = 0; w.dasDir = 0; w.prevDrop = false
    w.slide = []
    w.phase = 'fall'
    if (!fits(w, w.cur.x, w.cur.y, w.cur.rot)) {
        w.over = true
        w.phase = 'over'
        ev.push({ t: 'topout', seat })
    }
}

export function tryMove(w, dx) {
    if (fits(w, w.cur.x + dx, w.cur.y, w.cur.rot)) { w.cur.x += dx; return true }
    return false
}

export function tryRotate(w) {
    const nr = (w.cur.rot + 1) % 4
    if (fits(w, w.cur.x, w.cur.y, nr)) { w.cur.rot = nr; return true }
    return false
}

export function tryDown(w) {
    if (fits(w, w.cur.x, w.cur.y + 1, w.cur.rot)) { w.cur.y++; return true }
    return false
}

// flood-fill connected groups of >=4 same-color orbs; garbage never pops
export function findGroups(board) {
    const seen = new Uint8Array(ROWS * COLS)
    const groups = []
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const i = idx(r, c)
            const v = board[i]
            if (!v || v === GARBAGE || seen[i]) continue
            const stack = [[r, c]]
            const cells = [[r, c]]
            seen[i] = 1
            while (stack.length) {
                const [cr, cc] = stack.pop()
                for (const [ar, ac] of [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]]) {
                    if (ar < 0 || ar >= ROWS || ac < 0 || ac >= COLS) continue
                    const j = idx(ar, ac)
                    if (seen[j] || board[j] !== v) continue
                    seen[j] = 1
                    stack.push([ar, ac])
                    cells.push([ar, ac])
                }
            }
            if (cells.length >= 4) groups.push({ color: v, cells })
        }
    }
    return groups
}

export function dropOrbs(w) {
    w.slide = []
    for (let c = 0; c < COLS; c++) {
        let write = ROWS - 1
        for (let r = ROWS - 1; r >= 0; r--) {
            const v = w.board[idx(r, c)]
            if (v) {
                if (write !== r) { w.board[idx(write, c)] = v; w.board[idx(r, c)] = 0; w.slide.push({ r: write, c, dy: r - write }) }
                write--
            }
        }
        for (let r = write; r >= 0; r--) w.board[idx(r, c)] = 0
    }
}

function lockPair(w, seat, ev) {
    const cells = pairCells(w.cur.x, w.cur.y, w.cur.rot)
    w.board[idx(cells[0][0], cells[0][1])] = w.cur.c1
    w.board[idx(cells[1][0], cells[1][1])] = w.cur.c2
    w.cur = null
    w.locks++
    ev.push({ t: 'lock', seat })
    const groups = findGroups(w.board)
    if (groups.length) popStage(w, seat, groups, ev)
    else finishCascade(w, seat, false, ev)
}

function popStage(w, seat, groups, ev) {
    w.chain++
    let cells = []
    for (const g of groups) {
        cells = cells.concat(g.cells)
        w.score += 10 * w.chain * g.cells.length + (g.cells.length >= 5 ? 40 * w.chain : 0)
        w.sizeExtras += Math.floor(g.cells.length / 4) - 1
    }
    w.clearedThisCascade += cells.length
    w.popping = cells
    w.phase = 'pop'
    w.phaseT = POP_FRAMES
    ev.push({ t: 'pop', seat, chain: w.chain, size: cells.length, groups: groups.map((g) => g.cells.length) })
}

function afterPop(w, seat, ev) {
    for (const [r, c] of w.popping) w.board[idx(r, c)] = 0
    w.popping = null
    dropOrbs(w)
    const groups = findGroups(w.board)
    if (groups.length) {
        popStage(w, seat, groups, ev)
        return
    }
    finishCascade(w, seat, true, ev)
}

// end of one cascade: score the attack, settle incoming, respawn.
function finishCascade(w, seat, hadClears, ev) {
    w._toSend = hadClears ? Math.max(0, w.chain - 1) + w.sizeExtras : 0
    if (hadClears && w.pending > 0) {
        ev.push({ t: 'counter', seat, rows: w.pending })
        w.pending = 0
        w.holes = []
    } else if (!hadClears && w.pending > 0) {
        w.phase = 'land'
        w.phaseT = LAND_FRAMES
        w.chain = 0; w.sizeExtras = 0; w.clearedThisCascade = 0
        return
    }
    w.chain = 0; w.sizeExtras = 0; w.clearedThisCascade = 0
    w.phase = 'drop'
    w.phaseT = DROP_BEAT
}

function applyGarbage(w, seat, ev) {
    const shift = w.pending
    if (shift <= 0) return
    // push the stack up by `shift`: new[r] = old[r + shift], walked bottom-up
    for (let r = ROWS - 1 - shift; r >= 0; r--) {
        for (let c = 0; c < COLS; c++) w.board[idx(r, c)] = w.board[idx(r + shift, c)]
    }
    for (let r = ROWS - shift; r < ROWS; r++) for (let c = 0; c < COLS; c++) w.board[idx(r, c)] = GARBAGE
    for (let i = 0; i < shift; i++) w.board[idx(ROWS - 1 - i, w.holes[i] || 0)] = 0
    w.slide = []
    for (let r = ROWS - 1 - shift; r >= 0; r--) {
        for (let c = 0; c < COLS; c++) if (w.board[idx(r, c)]) w.slide.push({ r, c, dy: shift })
    }
    ev.push({ t: 'garbage', seat, rows: shift })
    w.pending = 0
    w.holes = []
    if (w.cur) {
        let y = w.cur.y
        while (y > 0 && !fits(w, w.cur.x, y, w.cur.rot)) y--
        if (!fits(w, w.cur.x, y, w.cur.rot)) { w.over = true; w.phase = 'over'; ev.push({ t: 'topout', seat }) }
        else w.cur.y = y
    }
}

function stepWell(w, pad, seat, s, ev) {
    if (w.over) return
    if (w.phase === 'pop') {
        if (--w.phaseT <= 0) afterPop(w, seat, ev)
        return
    }
    if (w.phase === 'drop') {
        if (--w.phaseT <= 0) spawnPair(w, seat, ev)
        return
    }
    if (w.phase === 'land') {
        if (--w.phaseT <= 0) {
            applyGarbage(w, seat, ev)
            if (!w.over) { w.phase = 'drop'; w.phaseT = DROP_BEAT }
        }
        return
    }
    if (!w.cur) return

    const left = !!pad.left, right = !!pad.right, down = !!pad.down
    const rot = !!pad.rot, drop = !!pad.drop

    const dir = left && !right ? -1 : right && !left ? 1 : 0
    if (dir !== 0 && dir !== w.dasDir) {
        tryMove(w, dir)
        w.dasDir = dir
        w.dasF = 0
    } else if (dir !== 0) {
        w.dasF++
        if (w.dasF >= DAS_DELAY && (w.dasF - DAS_DELAY) % DAS_REPEAT === 0) tryMove(w, dir)
    } else {
        w.dasDir = 0
        w.dasF = 0
    }

    if (rot && !w.prevRot) { if (tryRotate(w)) ev.push({ t: 'rot', seat }) }
    w.prevRot = rot

    if (drop && !w.prevDrop) {
        let y = w.cur.y
        while (fits(w, w.cur.x, y + 1, w.cur.rot)) y++
        w.cur.y = y
        ev.push({ t: 'harddrop', seat })
        lockPair(w, seat, ev)
        w.prevDrop = drop
        return
    }
    w.prevDrop = drop

    if (down) {
        w.softF++
        if (w.softF >= SOFT_FRAMES) {
            w.softF = 0
            if (!tryDown(w)) lockPair(w, seat, ev)
            else w.g = 0
        }
    } else {
        w.softF = 0
    }

    w.g++
    if (w.g >= gravityFrames(s.roundIdx)) {
        w.g = 0
        if (!tryDown(w)) lockPair(w, seat, ev)
    }
}

export function step(s, pads = [{}, {}]) {
    if (s.over) return s
    s.tick++
    const ev = s.events
    stepWell(s.wells[0], pads[0] || {}, 0, s, ev)
    stepWell(s.wells[1], pads[1] || {}, 1, s, ev)
    // deliver freshly earned attacks against the rival (holes rolled here, in
    // one fixed order, so both boxes generate identical garbage)
    for (let i = 0; i < 2; i++) {
        const w = s.wells[i]
        if (w._toSend > 0) {
            const rival = s.wells[1 - i]
            for (let k = 0; k < w._toSend; k++) {
                rival.holes.push(Math.floor(s.rng() * COLS))
            }
            rival.pending += w._toSend
            ev.push({ t: 'send', seat: i, rows: w._toSend })
            w._toSend = 0
        }
    }
    for (let i = 0; i < 2; i++) {
        if (s.wells[i].over && !s.over) {
            const other = 1 - i
            s.wells[other].rounds++
            ev.push({ t: 'round', winner: other, round: s.round })
            if (s.wells[other].rounds >= ROUNDS_TO_WIN) {
                s.over = true
                s.winner = other
                ev.push({ t: 'match', winner: other })
            } else {
                nextRound(s)
            }
        }
    }
    return s
}

function nextRound(s) {
    s.round++
    s.roundIdx++
    const [r0, r1] = [s.wells[0].rounds, s.wells[1].rounds]
    const [p0, p1] = [s.wells[0].score, s.wells[1].score]
    s.wells = [makeWell(), makeWell()]
    for (let i = 0; i < 2; i++) {
        const w = s.wells[i]
        w._rng = s.rng
        w.rounds = [r0, r1][i]
        w.score = [p0, p1][i]
    }
    spawnPair(s.wells[0], 0, s.events)
    spawnPair(s.wells[1], 1, s.events)
}

export function stateHash(s) {
    let h = 0x811c9dc5
    const mix = (v) => { h ^= v & 0xFF; h = Math.imul(h, 0x01000193) >>> 0 }
    for (const w of s.wells) {
        for (let i = 0; i < w.board.length; i++) mix(w.board[i])
        if (w.cur) { mix(w.cur.x + 8); mix(w.cur.y + 8); mix(w.cur.rot); mix(w.cur.c1); mix(w.cur.c2) }
        mix(w.next ? w.next[0] + 8 : 0); mix(w.next ? w.next[1] + 8 : 0)
        mix(w.chain); mix(w.pending); mix(w.phase.length); mix(w.rounds)
        mix(w.score & 0xFF); mix(w.score >>> 8); mix(w.score >>> 16)
        mix(w.over ? 1 : 0)
    }
    mix(s.round); mix(s.roundIdx); mix(s.winner + 2); mix(s.over ? 1 : 0)
    mix(s.tick & 0xFF); mix(s.tick >>> 8); mix(s.tick >>> 16)
    return h >>> 0
}
