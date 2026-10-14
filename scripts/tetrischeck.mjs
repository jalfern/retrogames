// tetrischeck — TETRIS (NES) audited in plain Node, no browser.
//
// The contract: sim.js is pure (state, input), so the gravity table, DAS,
// soft-drop cadence, the scoring ledger, the level curve and the RNG are all
// provable offline against the SAME code the tab runs. The autopilot that the
// attract demo replays must clear lines and keep the well alive (the game can
// be won), and every run must be hash-for-hash deterministic.
//
// The piece generator is a 16-bit LFSR, pinned to its maximal 65535-state
// period: over that period piece = state % 7 gives residues
// [9362,9363,9362,9362,9362,9362,9362] — the skew is a documented NES
// property, and a "cleaner" generator that erased it would be a different
// game. The reroll rule (a piece equal to the previous is rerolled once) is
// pinned both as an exact shadow model and as "repeats are rarer, not banned".

import {
    newGame, step, gravityFrames, GRAVITY, DAS_DELAY, DAS_REPEAT, SOFT_FRAMES,
    CLEAR_FRAMES, SCORE_LINES, SCORE_CAP, COLS, ROWS, SPAWN_X, SPAWN_Y, cellsOf, fits,
    drawPiece, lfsr16, levelFromLines, stateHash, SHAPES, PIECE_NAMES, resting,
} from '../src/games/Tetris/sim.js'
import { choosePlan, driveInput, nextDemoLevel, DEMO_LEVELS } from '../src/games/Tetris/planner.js'
import { musicStep, TET_MUSIC_STEPS } from '../src/games/Tetris/music.js'
import { Report } from './lib/harness.mjs'

const r = new Report('tetrischeck')
r.info('boot', 'sim.js + planner.js imported in Node, zero DOM, zero Math.random')

// ---------------------------------------------------------- gravity table ----
// Expectation is the literal NTSC table, NOT the sim's own GRAVITY constant —
// a check that imports the number it audits cannot see the number change.
// The literal NES NTSC table, L0..L28 — NOT the sim's own GRAVITY constant,
// a check that imports the number it audits cannot see the number change.
const NES_TABLE = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6,
    5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
for (let L = 0; L <= 28; L++) {
    const s = newGame(L, 7)
    const y0 = s.cur.y
    let t = 0
    while (s.cur.y === y0 && !s.over && t < 1000) { step(s, {}); t++ }
    r.check(`gravity L${L} = ${NES_TABLE[L]} frames/row`, t === NES_TABLE[L], `first row after ${t} ticks`)
}
r.check('gravity L29+ holds at 1 frame/row (the NES floor, no level cap below it)',
    gravityFrames(29) === 1 && gravityFrames(50) === 1 && gravityFrames(99) === 1,
    `L29=${gravityFrames(29)} L50=${gravityFrames(50)} L99=${gravityFrames(99)}`)

// ------------------------------------------------------------------ DAS ----
{
    const s = newGame(0, 7)
    Object.assign(s.cur, { type: 2, rot: 0, x: 0, y: 5 }) // O with an 8-wide corridor right
    const moves = []
    let t = 0
    while (t < 40) { step(s, { right: true }); moves.push(s.cur.x); t++ }
    const shifted = []
    let prev = 0
    for (let i = 0; i < moves.length; i++) { if (moves[i] !== prev) shifted.push(i + 1); prev = moves[i] }
    const wantCapped = [1]
    for (let f = 1 + DAS_DELAY; f <= 35; f += DAS_REPEAT) wantCapped.push(f) // 1,17,23,29,35
    r.check(`DAS: first move immediate, then every ${DAS_REPEAT}f after the ${DAS_DELAY}f delay`, JSON.stringify(shifted) === JSON.stringify(wantCapped), `moved at ${shifted.join(',')} vs ${wantCapped.join(',')}`)

    // reversing direction moves immediately and restarts the delay
    const held = { right: true }
    const s2 = newGame(0, 7)
    let tt = 0
    while (tt < DAS_DELAY - 1) { step(s2, held); tt++ }
    const xBefore = s2.cur.x
    step(s2, { left: true })
    r.check('DAS: reversal moves on the tick it is pressed', s2.cur.x === xBefore - 1, `x ${xBefore} -> ${s2.cur.x}`)

    // releasing and re-pressing restarts the initial delay
    const s3 = newGame(0, 7)
    let t3 = 0
    while (t3 < 5) { step(s3, { left: true }); t3++ }
    for (let i = 0; i < 40; i++) step(s3, {})
    const xAfter = s3.cur.x
    let t4 = 0
    while (t4 < DAS_DELAY + 2 && s3.cur.x === xAfter) { step(s3, { left: true }); t4++ }
    r.check('DAS: release resets the delay', t4 === 1, `moved after ${t4}`)
}

// ------------------------------------------------------------ soft drop ----
{
    const s = newGame(0, 7)
    const y0 = s.cur.y
    const ticks = []
    let lastY = y0
    for (let t = 1; t <= SOFT_FRAMES * 6; t++) {
        step(s, { down: true })
        if (s.cur.y !== lastY) { ticks.push(t); lastY = s.cur.y }
    }
    const want = []
    for (let k = 1; k <= 6; k++) want.push(k * SOFT_FRAMES)
    r.check(`soft drop = one row every ${SOFT_FRAMES} frames while held`, JSON.stringify(ticks) === JSON.stringify(want), ticks.join(','))
    r.check('soft drop awards no points', s.score === 0)
}

// ---------------------------------------------------------------- lock ----
{
    // A piece on the floor locks on the first gravity tick that cannot move down.
    const s = newGame(0, 7)
    const type = s.cur.type
    const cells = cellsOf(type, 0, SPAWN_X, SPAWN_Y)
    let lowRow = 0
    for (const [rr] of cells) lowRow = Math.max(lowRow, rr)
    const rowsToFall = ROWS - 1 - lowRow
    let t = 0
    while (s.locks === 0 && t < 5000) { step(s, {}); t++ }
    r.check('locks exactly on the first failed downward attempt', t === (rowsToFall + 1) * GRAVITY[0], `locked after ${t}, expected ${(rowsToFall + 1) * GRAVITY[0]}`)
}

// -------------------------------------------------- line-clear window ----
// The NES flashes the full rows BEFORE anything shifts: the board freezes,
// the score waits for the shift, the input is ignored, and the next piece
// does not even spawn until the shift lands.
{
    const mk = () => {
        const s = newGame(0, 3)
        s.board.fill(0)
        for (let c = 0; c <= 5; c++) s.board[19 * COLS + c] = 1
        s.board[18 * COLS + 0] = 2 // marker riding the shift
        Object.assign(s.cur, { type: 5, rot: 0, x: 6, y: 0 }) // horizontal I over cols 6-9
        return s
    }
    const s = mk()
    const snap = (x) => JSON.stringify(x.board)
    let clearTick = -1, clearedTick = -1
    let frozen = true, refBoard = null
    let scoreAtClear = -1, curAtClear = null, nextAtClear = -1
    let t = 0
    while (!s.over && clearedTick < 0 && t++ < 2000) {
        step(s, {})
        for (const e of s.events) {
            if (e.t === 'clear' && clearTick < 0) { clearTick = s.tick; refBoard = snap(s); scoreAtClear = s.score; curAtClear = { type: s.cur.type, x: s.cur.x }; nextAtClear = s.next }
            if (e.t === 'cleared' && clearedTick < 0) clearedTick = s.tick
        }
        if (clearTick > 0 && clearedTick < 0 && snap(s) !== refBoard) frozen = false
    }
    r.check('clear window: a single flashes, then shifts', clearTick > 0 && clearedTick > 0, `clear@${clearTick} cleared@${clearedTick}`)
    r.check('the board is frozen for the whole flash window', frozen, 'board changed mid-flash')
    r.check('the shift lands exactly 30 ticks after the flash starts (0.5s at 60Hz)', clearedTick - clearTick === 30 && CLEAR_FRAMES === 30, `${clearedTick - clearTick} ticks`)
    r.check('the score waits for the shift (0 during the flash, 40 after)', scoreAtClear === 0 && s.score === 40, `atClear ${scoreAtClear}, after ${s.score}`)
    r.check('the locked piece stays on screen through the flash; the next spawns only after',
        curAtClear && curAtClear.type === 5 && curAtClear.x === 6 && s.cur.type === nextAtClear,
        `during flash: ${curAtClear ? PIECE_NAMES[curAtClear.type] + '@' + curAtClear.x : 'n/a'}, after: ${PIECE_NAMES[s.cur.type]}`)
    r.check('the marker rides the shift: row 18 -> 19, and only then', s.board[19 * COLS + 0] === 2 && s.board[18 * COLS + 0] === 0, `marker at 19=${s.board[19 * COLS + 0]}, 18=${s.board[18 * COLS + 0]}`)

    // input is ignored inside the window
    const s2 = mk()
    let t2 = 0
    while (!s2.clearing && t2++ < 2000) step(s2, { down: true })
    const x0 = s2.cur.x, ev0 = s2.events.length, t0 = s2.clearing.t
    step(s2, { left: true, right: true, down: true, rot: true })
    r.check('input is ignored during the clear window (no move, no event, timer ticks)', s2.clearing && s2.cur.x === x0 && s2.events.length === ev0 && s2.clearing.t === t0 - 1, `x ${s2.cur.x}, events ${s2.events.length - ev0}, t ${s2.clearing && s2.clearing.t}`)
}
{
    // the lock event carries the locked cells (the shell's lock flash reads them)
    const s = newGame(0, 7)
    let t = 0
    while (!s.events.some((e) => e.t === 'lock') && t++ < 5000) step(s, { down: true })
    const ev = s.events.find((e) => e.t === 'lock')
    const id = PIECE_NAMES.indexOf(ev.piece) + 1
    const onBoard = ev.cells.every(([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < COLS && s.board[r * COLS + c] === id)
    r.check('lock event carries the locked cells, and they are on the board', ev.cells.length === 4 && onBoard, `piece ${ev.piece}, ${ev.cells.length} cells`)
}
{
    // the music tempo table (music.js): faster every level, honest floor
    r.check('tetris music: L0 step is the pinned 0.15', TET_MUSIC_STEPS[0] === 0.15 && musicStep(0) === 0.15)
    let nonInc = true
    for (let L = 1; L < TET_MUSIC_STEPS.length; L++) if (TET_MUSIC_STEPS[L] > TET_MUSIC_STEPS[L - 1]) nonInc = false
    r.check('tetris music speeds up every level (non-increasing step L0-9)', nonInc, TET_MUSIC_STEPS.join(','))
    r.check('tetris music tempo floors at 0.06 (L5=0.1, L29/L99=floor)', musicStep(5) === 0.1 && TET_MUSIC_STEPS[9] === 0.06 && musicStep(29) === 0.06 && musicStep(99) === 0.06)
}
{
    // the attract demo cycles its start level so the gravity range is visible
    r.check('attract demo cycles its start level 0 -> 5 -> 9 -> 0', DEMO_LEVELS.join(',') === '0,5,9' && nextDemoLevel(0) === 5 && nextDemoLevel(5) === 9 && nextDemoLevel(9) === 0)
}
{
    // the landing tick reads resting(): no room one row down
    const s = newGame(0, 7)
    Object.assign(s.cur, { type: 2, rot: 0, x: 4, y: 18 })
    r.check('resting: an O on the floor is resting', resting(s) === true)
    Object.assign(s.cur, { y: 0 })
    r.check('resting: the same O at spawn is not', resting(s) === false)
}

// ------------------------------------------------------- scoring ledger ----
// NOTE: the case above is invalid by construction (an I alone never fills a row);
// the two real cases below fill the well. Keep the audit honest: verify the
// invalid one really does NOT score.
{
    const s = newGame(0, 3)
    s.board.fill(0)
    Object.assign(s.cur, { type: 5, rot: 0, x: 6, y: 0 })
    let g = 0
    while (!s.over && g++ < 4000) step(s, {})
    r.check('an unfilled well never pays (no phantom clears)', s.score === 0 && s.lines === 0)
}
{
    // single: row 19 cols 0-5 filled, drop horizontal I into cols 6-9
    const s = newGame(5, 3)
    s.board.fill(0)
    for (let c = 0; c <= 5; c++) s.board[19 * COLS + c] = 1
    Object.assign(s.cur, { type: 5, rot: 0, x: 6, y: 0 })
    let g = 0
    while (!s.over && s.lines === 0 && g++ < 5000) step(s, {})
    r.check('single at L5 = 40x6 = 240', s.score === 240 && s.lines === 1, `score ${s.score}`)
}
{
    // double crossing the level line: 9 lines banked, clear 2 more at L0
    const s = newGame(0, 3)
    s.board.fill(0)
    s.lines = 9
    for (let r0 = 18; r0 <= 19; r0++) for (let c = 0; c <= 7; c++) s.board[r0 * COLS + c] = 1
    Object.assign(s.cur, { type: 2, rot: 0, x: 8, y: 0 })
    let g = 0
    while (!s.over && s.lines < 11 && g++ < 5000) step(s, {})
    r.check('double at L0 (9 banked) = 100, graded at the PREVIOUS level', s.score === 100 && s.lines === 11, `score ${s.score}, lines ${s.lines}`)
    r.check('level 0 -> 1 at 10 lines', s.level === 1, `level ${s.level}`)
}
{
    // triple
    const s = newGame(9, 3)
    s.board.fill(0)
    for (let r0 = 17; r0 <= 19; r0++) for (let c = 0; c <= 8; c++) s.board[r0 * COLS + c] = 1
    Object.assign(s.cur, { type: 5, rot: 1, x: 7, y: 0 })
    let g = 0
    while (!s.over && s.lines === 0 && g++ < 5000) step(s, {})
    r.check('triple at L9 = 300x10', s.score === 3000 && s.lines === 3, `score ${s.score}`)
}
{
    // tetris: vertical I into a 4-deep single-wide shaft at col 9
    const s = newGame(9, 3)
    s.board.fill(0)
    for (let r0 = 16; r0 <= 19; r0++) for (let c = 0; c <= 8; c++) s.board[r0 * COLS + c] = 1
    Object.assign(s.cur, { type: 5, rot: 1, x: 7, y: 0 })
    let g = 0
    while (!s.over && s.lines === 0 && g++ < 5000) step(s, {})
    r.check('tetris at L9 = 1200x10 = 12000', s.score === 12000 && s.lines === 4, `score ${s.score}`)
}
{
    // rows shift down correctly, and only the filled rows clear
    const s = newGame(0, 3)
    s.board.fill(0)
    s.board[18 * COLS + 3] = 3
    for (let c = 0; c <= 5; c++) s.board[19 * COLS + c] = 1
    Object.assign(s.cur, { type: 5, rot: 0, x: 6, y: 0 })
    let g = 0
    while (!s.over && s.lines === 0 && g++ < 5000) step(s, {})
    r.check('clearing shifts the stack down by exactly one row', s.board[19 * COLS + 3] === 3 && s.board[18 * COLS + 3] === 0, `id3 now at row ${s.board[19 * COLS + 3] ? 19 : 18}`)
}
{
    // score cap
    const s = newGame(9, 3)
    s.board.fill(0)
    for (let r0 = 16; r0 <= 19; r0++) for (let c = 0; c <= 8; c++) s.board[r0 * COLS + c] = 1
    s.score = SCORE_CAP - 1
    Object.assign(s.cur, { type: 5, rot: 1, x: 7, y: 0 })
    let g = 0
    while (!s.over && s.score < SCORE_CAP && g++ < 5000) step(s, {})
    r.check('score caps at 999,999', s.score === 999999, `score ${s.score}`)
}
{
    // rule 5: the start-level level curve, pinned against the NES formula —
    // the FIRST up at min(start*10+10, max(100, start*10-50)) lines, then
    // every 10. No cap: the counter keeps going past 29.
    r.check('L0: level-up every 10 lines',
        levelFromLines(0, 0) === 0 && levelFromLines(0, 9) === 0 && levelFromLines(0, 10) === 1 && levelFromLines(0, 19) === 1 && levelFromLines(0, 20) === 2,
        [0, 9, 10, 19, 20].map((l) => levelFromLines(0, l)).join(','))
    r.check('start L5: first up at min(60,100)=60 lines, then every 10',
        levelFromLines(5, 59) === 5 && levelFromLines(5, 60) === 6 && levelFromLines(5, 69) === 6 && levelFromLines(5, 70) === 7,
        [59, 60, 69, 70].map((l) => levelFromLines(5, l)).join(','))
    r.check('start L9: first up at min(100,100)=100 lines (line 10 is still L9)',
        levelFromLines(9, 10) === 9 && levelFromLines(9, 99) === 9 && levelFromLines(9, 100) === 10 && levelFromLines(9, 110) === 11,
        [10, 99, 100, 110].map((l) => levelFromLines(9, l)).join(','))
    r.check('no level cap: the counter keeps going past 29',
        levelFromLines(9, 200) === 20 && levelFromLines(9, 240) === 24 && levelFromLines(0, 1000) === 100,
        [levelFromLines(9, 200), levelFromLines(9, 240), levelFromLines(0, 1000)].join(','))
    // and through the real step loop: 300 lines must land on level 30, not clamp
    const s = newGame(0, 3)
    s.board.fill(0)
    for (let c = 0; c <= 5; c++) s.board[19 * COLS + c] = 1
    s.lines = 299
    s.level = levelFromLines(0, 299)
    Object.assign(s.cur, { type: 5, rot: 0, x: 6, y: 0 })
    let g = 0
    while (!s.over && s.lines === 299 && g++ < 5000) step(s, {})
    r.check('no cap in the live sim: 300 lines -> level 30', s.lines === 300 && s.level === 30, `lines ${s.lines} level ${s.level}`)
}

// ----------------------------------------------------------------- RNG ----
{
    // 16-bit LFSR: maximal 65535-state period, pinned exactly. Over the full
    // period piece = state % 7 gives the documented residues, and the count
    // must also equal the INDEPENDENT theory (iterate x=1..65535, count x%7) —
    // a non-primitive or 8-bit generator could not match both.
    const counts = new Array(7).fill(0)
    let v = 0xB400
    for (let i = 0; i < 65535; i++) { v = lfsr16(v); counts[v % 7]++ }
    const theory = new Array(7).fill(0)
    for (let x = 1; x <= 65535; x++) theory[x % 7]++
    r.check('16-bit LFSR: maximal period 65535, bias [9362,9363,9362,9362,9362,9362,9362]',
        JSON.stringify(counts) === JSON.stringify([9362, 9363, 9362, 9362, 9362, 9362, 9362]) && JSON.stringify(counts) === JSON.stringify(theory),
        counts.join(','))
}
{
    // reroll-once, pinned two ways. (1) A shadow model re-derives every draw
    // from the raw LFSR + the documented rule and must match the sim's piece
    // AND its rng state — an 8-bit LFSR, a ban-triple, a double reroll, or a
    // different mapping all diverge. (2) Behaviourally, repeats are rarer than
    // the raw generator (the reroll fires) but not banned (a double still lands).
    const s = newGame(0, 42)
    let shadowRng = s.rng, shadowLast = s.last1
    let agree = true
    for (let i = 0; i < 20000; i++) {
        const got = drawPiece(s)
        shadowRng = lfsr16(shadowRng)
        let p = shadowRng % 7
        if (p === shadowLast) { shadowRng = lfsr16(shadowRng); p = shadowRng % 7 }
        if (p !== got || shadowRng !== s.rng) { agree = false; break }
        shadowLast = p
    }
    r.check('reroll-once is exact: shadow model re-derives every piece + rng state', agree)
    const s2 = newGame(0, 42)
    const seq = []
    for (let i = 0; i < 50000; i++) seq.push(drawPiece(s2))
    const raw = []
    let rv = 42
    for (let i = 0; i < 50000; i++) { rv = lfsr16(rv); raw.push(rv % 7) }
    const doubles = (a) => { let c = 0; for (let i = 1; i < a.length; i++) if (a[i] === a[i - 1]) c++; return c }
    const pieceDoubles = doubles(seq), rawDoubles = doubles(raw)
    r.check('reroll-once: repeats are rarer than the raw generator (50k draws)', pieceDoubles < rawDoubles, `piece ${pieceDoubles} vs raw ${rawDoubles}`)
    r.check('reroll-once: repeats are not banned (a double still occurs)', pieceDoubles > 0, `doubles=${pieceDoubles}`)
}
{
    const a = newGame(0, 123), b = newGame(0, 123), c = newGame(0, 124)
    let same = true, diff = false, firstDiff = -1
    for (let i = 0; i < 2000; i++) {
        const pa = drawPiece(a), pb = drawPiece(b), pc = drawPiece(c)
        if (pa !== pb) { same = false; if (firstDiff < 0) firstDiff = i }
        if (pc !== pb) diff = true
    }
    r.check('same seed -> same piece stream', same, firstDiff < 0 ? '' : `diverged at draw ${firstDiff}`)
    r.check('different seed -> different stream', diff)
}

// ------------------------------------------------------- pieces & walls ----
{
    const lens = SHAPES.map((s) => s.length).join(',')
    r.check('rotation states: O=1, I=2, JLSTZ=4', lens === '4,4,1,4,4,2,4', lens)
    let inBounds = true
    for (let t = 0; t < 7; t++) {
        for (const [r0, c0] of cellsOf(t, 0, SPAWN_X, SPAWN_Y)) if (r0 >= ROWS || c0 < 0 || c0 >= COLS) inBounds = false
    }
    r.check('every piece fits inside the well at spawn', inBounds)
}
{
    // top-out: a spawn that collides ends the game
    const s = newGame(0, 7)
    s.board.fill(1)
    s.board[0] = 0 // irrelevant — spawn cols 3-5 rows 0/1 are all buried
    const before = s.over
    s.cur = { type: 0, rot: 0, x: SPAWN_X, y: SPAWN_Y }
    if (!fits(s, s.cur.type, 0, SPAWN_X, SPAWN_Y)) { s.over = true }
    r.check('a blocked spawn collides (top-out condition holds)', before === false && s.over === true)
    // through step(): lock with the spawn buried -> over event
    const s2 = newGame(0, 7)
    for (let r0 = 0; r0 < 14; r0++) for (let c = 0; c < COLS; c++) s2.board[r0 * COLS + c] = 1
    s2.board.fill(0)
    for (let r0 = 1; r0 < ROWS; r0++) for (let c = 0; c < COLS; c++) s2.board[r0 * COLS + c] = 1
    Object.assign(s2.cur, { type: 5, rot: 0, x: SPAWN_X, y: -1 }) // I flat in the only open row
    let g = 0
    while (!s2.over && g++ < 4000) step(s2, { down: true })
    r.check('top-out fires through the real step loop', s2.over && s2.events.some((e) => e.t === 'over'))
}

// ------------------------------------------------------- autopilot demo ----
function autoplay(level, seed, maxPieces) {
    const s = newGame(level, seed)
    let mem = { lastLocks: -1 }
    let plan = choosePlan(s)
    let g = 0
    while (!s.over && s.locks < maxPieces && g++ < 200000) {
        step(s, driveInput(s, plan, mem))
        if (s.locks !== mem.lastLocks && !s.clearing) { mem = { lastLocks: s.locks }; plan = choosePlan(s) }
    }
    return s
}
{
    const seeds = [1, 7, 42, 999, 20261013, 3, 5, 11]
    let allClear = true, minLines = 1e9, allAlive = true
    for (const seed of seeds) {
        const s = autoplay(0, seed, 150)
        if (s.lines < 10) allClear = false
        if (s.lines < minLines) minLines = s.lines
        if (s.over && s.locks < 60) allAlive = false
    }
    r.check('autopilot clears >=10 lines on every probe seed (150 pieces)', allClear, `min ${minLines}`)
    r.check('autopilot never tops out before 60 pieces on any probe seed', allAlive)
}
{
    const a = autoplay(0, 20261013, 150)
    const b = autoplay(0, 20261013, 150)
    r.check('the attract demo replays hash-for-hash', stateHash(a) === stateHash(b) && a.score === b.score, `hash ${stateHash(a)} / ${stateHash(b)}`)
    const c = autoplay(9, 20261013, 150)
    r.check('higher level = faster game: L9 reaches the same piece count with more lines or earlier over', c.lines >= a.lines || c.over, `L9 lines ${c.lines} vs L0 ${a.lines}`)
}

// --------------------------------------------------------- honesty pins ----
{
    // gravity claim from the README, restated here so drift fails loudly:
    r.check('NTSC table is exactly the full known L0-28 rows', GRAVITY.join(',') === '48,43,38,33,28,23,18,13,8,6,5,5,5,4,4,4,3,3,3,2,2,2,2,2,2,2,2,2,2', GRAVITY.join(','))
    r.check('DAS constants are the NES 16/6', DAS_DELAY === 16 && DAS_REPEAT === 6)
    r.check('soft drop is the NES 2-frame rate', SOFT_FRAMES === 2)
    const s = newGame(0, 7)
    for (let i = 0; i < 10; i++) step(s, { hard: true })
    r.check('there is no hard drop: a "hard" input moves nothing', s.cur.y === SPAWN_Y)
    r.check('seven tetrominoes L J O S Z I T', PIECE_NAMES.join('') === 'LJOSZIT')
}

r.exit()
