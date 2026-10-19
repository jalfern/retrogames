// pacmancheck — PAC-MAN's arcade movement in plain Node, no browser (#472).
//   input : a held diagonal keeps the heading and pre-turns the OTHER axis —
//           all four headings; a 180 is instant anywhere in the tile; taps are
//           buffered until taken; a newer tap replaces the older; holding both
//           sides of an axis cannot oscillate the player.
//   turn  : the buffered turn is taken at the FIRST opening, never before one;
//           cornering starts it up to CORNER px before the tile centre, and a
//           press inside that window is still taken.
//   maze  : tunnel-row wrap; the ghost-house door is solid for the player;
//           dots and power are eaten on entry (score, pellet, timer).
//   spawn : makePacman honours the tile+progress invariant (no half-cell hitch).
// `--mutate` re-plants the pre-#472 behaviours in the real file, child run MUST die.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { MAP, COLS, ROWS, CORNER_PX, makePacman, stepPlayer, tileOpen, cloneMap } from '../src/games/Pacman/move.js'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const V = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }

// '#' wall, '.' dot, 'P' power, 'D' door, ' ' path
const grid = (rows) => rows.map(r => [...r].map(ch => ch === '#' ? 1 : ch === '.' ? 2 : ch === 'P' ? 3 : ch === 'D' ? 4 : 0))

const CROSS = grid(['#.#', '...', '#.#'])
const CORRIDOR = grid(['#######', '.######', '.......', '.######', '#######'])
const TUNNEL_MAP = cloneMap()

// one fixed tick at a time; inp(tick, P) -> direction names held this tick
function run(map, x, y, dir, inp, maxTicks = 80, p0 = 0) {
    const gs = {
        map,
        pacman: { x, y, dir: { ...dir }, nextDir: { ...dir }, progress: p0, speed: 0.15, poweredUp: false, powerTimer: 0 },
        score: 0
    }
    const trace = []
    for (let i = 0; i < maxTicks; i++) {
        const before = { x: gs.pacman.x, y: gs.pacman.y, p: gs.pacman.progress, dir: { ...gs.pacman.dir } }
        const held = (inp(i, gs.pacman) || []).map(n => ({ ...V[n] }))
        const eaten = stepPlayer(gs, held)
        trace.push({ tick: i, before, eaten, pos: { ...gs.pacman }, x: gs.pacman.x, y: gs.pacman.y, p: gs.pacman.progress, dir: { ...gs.pacman.dir } })
        if (gs.pacman.dir.x === 0 && gs.pacman.dir.y === 0 && i > 2) break
    }
    return { gs, trace }
}

const turned = (trace, d) => trace.find(t => t.dir.x === d.x && t.dir.y === d.y && !(t.before.dir.x === d.x && t.before.dir.y === d.y))

// ------------------------------------------------------------- diagonal input ----
console.log('diagonal input (keep heading, pre-turn the other axis)')
// heading WEST into the junction, up+left held: keep west to (1,1), turn up there
{
    const { trace } = run(CROSS, 2, 1, V.left, () => ['up', 'left'])
    const t = turned(trace, V.up)
    ok(!!t && t.x === 1 && t.y === 1, 'west heading + up/left: turn taken AT the junction', t ? `at ${t.x},${t.y}` : 'never turned')
    ok(trace.slice(0, (t?.tick ?? 99) + 1).every(e => e.y === 1), 'west heading: stayed on the corridor row until the turn')
    ok(trace.some(e => e.x === 1 && e.y === 0 && e.dir.y === -1), 'west heading: then ran up the north arm')
}
// heading NORTH, up+left held — the pre-#472 case: the left pre-turn was LOST
{
    const { trace } = run(CROSS, 1, 2, V.up, () => ['up', 'left'])
    const t = turned(trace, V.left)
    ok(!!t && t.x === 1 && t.y === 1, 'north heading + up/left: keeps north, turns left at the junction', t ? `at ${t.x},${t.y}` : 'never turned (the #472 loss)')
    ok(trace.slice(0, (t?.tick ?? 99) + 1).every(e => e.x === 1), 'north heading: stayed on column 1 until the turn')
    ok(trace.some(e => e.x === 0 && e.y === 1 && e.dir.x === -1), 'north heading: then ran west down the west arm')
}
// heading EAST, down+right held
{
    const { trace } = run(CROSS, 0, 1, V.right, () => ['down', 'right'])
    const t = turned(trace, V.down)
    ok(!!t && t.x === 1 && t.y === 1, 'east heading + down/right: turn at the junction', t ? `at ${t.x},${t.y}` : 'never turned')
    ok(trace.some(e => e.x === 1 && e.y === 2 && e.dir.y === 1), 'east heading: then ran south')
}
// heading SOUTH, down+right held (along axis = the heading)
{
    const { trace } = run(CROSS, 1, 0, V.down, () => ['down', 'right'])
    const t = turned(trace, V.right)
    ok(!!t && t.x === 1 && t.y === 1, 'south heading + down/right: keeps south, turns right at the junction', t ? `at ${t.x},${t.y}` : 'never turned')
    ok(trace.some(e => e.x === 2 && e.y === 1 && e.dir.x === 1), 'south heading: then ran east')
}
// heading SOUTH with up+right held: the opposite axis (up) is a 180 request
{
    const { trace } = run(CROSS, 1, 0, V.down, () => ['up', 'right'], 6, 0.4)
    ok(trace[0].dir.y === -1 && trace[0].y === 1 && Math.abs(trace[0].p - 0.6) < 1e-9, 'up held against a down heading: the 180 wins instantly, position kept')
    ok(turned(trace, V.right) !== undefined, 'up+right diagonal: the right axis is buffered')
}

// ------------------------------------------------------------------ instant 180 ----
console.log('instant 180')
{
    const r = run(CROSS, 1, 1, V.left, (i) => i === 0 ? ['right'] : [], 4, 0.4)
    const t = r.trace[0]
    ok(t.dir.x === 1 && t.dir.y === 0, 'mid-tile press of the opposite: reverses on the SAME tick')
    ok(t.x === 0 && Math.abs(t.p - 0.6) < 1e-9, 'reversal keeps the position (tile ref + mirrored progress)', `x=${t.x} p=${t.p}`)
}
{
    const r = run(CROSS, 1, 1, V.left, (i) => i < 3 ? ['right', 'up'] : [], 4, 0.4)
    const t = r.trace[0]
    ok(t.dir.x === 1, 'diagonal containing the opposite: the 180 still wins instantly')
    const tu = turned(r.trace, V.up)
    ok(!!tu, 'diagonal 180: the other axis is buffered and taken at the first opening', tu ? `tick ${tu.tick}` : 'pre-turn lost')
}

// -------------------------------------------------------- buffering + cornering ----
console.log('turns: first opening, cornering window')
// buffered tap taken at the first opening of a long corridor (and no earlier)
{
    const { trace } = run(CORRIDOR, 5, 2, V.left, (i) => i === 0 ? ['up'] : [])
    const t = turned(trace, V.up)
    ok(!!t && t.x === 0 && t.y === 2, 'tap buffered across 5 tiles, taken at the first opening', t ? `at ${t.x},${t.y}` : 'never turned')
    ok(!trace.slice(0, t?.tick ?? 0).some(e => e.dir.y === -1), 'no turn before the opening')
}
// a newer tap replaces the older one
{
    const { trace } = run(CORRIDOR, 5, 2, V.left, (i) => (i === 0 ? ['up'] : i === 1 ? ['down'] : []))
    const tv = trace.find(e => e.dir.x === 0 && e.dir.y !== 0)
    ok(!!tv && tv.dir.y === 1, 'a second tap replaces the first (turns down, not up)', tv ? `dir=(${tv.dir.x},${tv.dir.y})` : 'never turned')
}
// cornering: the turn starts up to CORNER px BEFORE the tile centre
{
    const { trace } = run(CORRIDOR, 1, 2, V.left, () => ['up'], 6, 0.9)
    const t = trace[0]
    ok(t.dir.y === -1 && t.x === 0 && t.y === 2, 'press inside the corner window: turn taken this tick', `dir=(${t.dir.x},${t.dir.y}) x=${t.x}`)
    ok(t.before.x === 1 && t.before.p >= 1 - CORNER_PX / 16 - 1e-9, 'cornering: it started before the centre (in the window)', `before p=${t.before.p}`)
}
// a press OUTSIDE the window waits for the window (no early turn, no dropped turn)
{
    const r = run(CORRIDOR, 1, 2, V.left, (i) => i === 0 ? ['up'] : [], 8, 0.3)
    ok(r.trace[0].x === 1 && r.trace[1].x === 1 && r.trace[2].x === 1, 'no turn while outside the corner window')
    const t = turned(r.trace, V.up)
    ok(!!t && t.x === 0, 'the buffered press is still taken once the window opens', t ? `tick ${t.tick}` : 'dropped')
}
// holding a pre-turn down a corridor never cuts a corner at a closed tile
{
    const { trace } = run(CORRIDOR, 5, 2, V.left, () => ['up'])
    ok(!trace.some(e => e.dir.y === -1 && e.x !== 0), 'no corner cut where there is no opening')
    ok(trace.some(e => e.dir.y === -1 && e.x === 0 && e.y === 2), 'turns at the real opening')
}

// --------------------------------------------------------------------- the maze ----
console.log('maze: tunnel, door, dots')
{
    const r = run(TUNNEL_MAP, 0, 14, V.left, () => ['left'], 3, 0.9)
    ok(r.trace[0].x === COLS - 1 && r.trace[0].y === 14, 'tunnel row wraps (x 0 -> COLS-1)', `x=${r.trace[0].x}`)
}
{
    const r = run(TUNNEL_MAP, 11, 12, V.right, () => ['right'], 12, 0.9)
    ok(!r.trace.some(e => e.x === 13 && e.y === 12), 'the ghost-house door is solid (never enters it)')
    const last = r.trace[r.trace.length - 1]
    ok(last.dir.x === 0 && last.dir.y === 0 && last.x === 12 && last.y === 12, 'stops in front of the door', `at ${last.x},${last.y} dir=(${last.dir.x},${last.dir.y})`)
    ok(TUNNEL_MAP[12][13] === 4, 'the door tile is untouched')
}
{
    const r = run(TUNNEL_MAP, 12, 23, V.left, () => ['left'], 6)
    const t = r.trace.find(e => e.eaten === 'dot')
    ok(!!t && t.x === 11 && r.gs.score === 10 && TUNNEL_MAP[23][11] === 0, 'dot eaten on entry: +10, tile cleared', t ? `tick ${t.tick} x=${t.x} score=${r.gs.score}` : 'no dot')
}
{
    const r = run(TUNNEL_MAP, 2, 23, V.left, () => ['left'], 10)
    const t = r.trace.find(e => e.eaten === 'power')
    ok(!!t && t.x === 1 && r.gs.score === 50 && t.pos.poweredUp && t.pos.powerTimer === 600, 'power pellet: +50, poweredUp, 600-tick timer', t ? `x=${t.x}` : 'no power')
    ok(TUNNEL_MAP[23][1] === 0, 'power tile cleared')
}

// ----------------------------------------------------------------------- the spawn ----
console.log('spawn invariant')
{
    const p = makePacman()
    ok(Number.isInteger(p.x) && Number.isInteger(p.y), 'spawn sits on a tile centre (no half-cell hitch)')
    const r = run(TUNNEL_MAP, p.x, p.y, p.dir, () => ['left'], 30)
    ok(r.trace.every(e => e.before.x === Math.round(e.before.x) && e.before.y === Math.round(e.before.y)), 'tile+progress invariant holds every tick')
    const firstDot = r.trace.find(e => e.eaten === 'dot')
    ok(!!firstDot && firstDot.x === 12, 'from the spawn heading left, the first dot is at x=12', firstDot ? `x=${firstDot.x}` : 'none')
}

console.log(`\n${passes} passed, ${fails} failed`)

// ----------------------------------------------------------------------- mutants ----
if (process.argv.includes('--mutate')) {
    console.log('mutants (must die)')
    const F = 'src/games/Pacman/move.js'
    const MUTANTS = [
        ['fixed-priority decode (pre-#472: the diagonal keeps ONE axis)', F,
            `        } else if (held.length > 1) {
            // diagonal: keep the heading, pre-turn the other axis
            const along = held.find(d => same(d, P.dir))
            P.nextDir = along ? held.find(d => !same(d, along)) : held[0]`,
            `        } else if (held.length > 1) {
            P.nextDir = held[0]`],
        ['turns start only on the tile centre (no cornering)', F,
            `            } else if (P.progress >= 1 - CORNER) {`,
            `            } else if (false) {`],
        ['a 180 waits for the next centre (no instant reversal)', F,
            `        if (rev) {`,
            `        if (false) {`],
        ['the ghost-house door is walkable', F,
            `return nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && map[ny][nx] !== 1 && map[ny][nx] !== 4`,
            `return nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && map[ny][nx] !== 1`],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant ${name}: anchor missing`); continue }
        writeFileSync(file, orig.replace(from, to))
        const res = spawnSync('node', ['scripts/pacmancheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant ${name} caught`) }
        else { ok(false, `mutant ${name} caught`, 'check stayed green') }
        writeFileSync(file, orig)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

process.exit(fails ? 1 : 0)
