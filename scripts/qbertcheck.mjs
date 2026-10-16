// qbertcheck — Q*BERT (Gottlieb, 1982) audited in plain Node, no browser.
//
// The contract: sim.js + planner.js are pure (zero DOM, zero Math.random), so
// the pyramid geometry, the flip rule, the fall edges, the Coily chase, the
// disc lure, the balls, the row-runners, the slick wipe and the round ledger
// are all provable offline against the SAME code the tab runs. Expectations
// are LITERAL numbers, not the sim's own constants — a check that imports the
// number it audits cannot see the number change (the TETRIS lesson). The
// walker here is the harness's own, independent of planner.js, so the pilot
// is graded by an outside referee; the pilot must clear round 1 with ONE fewer
// life than the player is dealt (the slack rule), hash-for-hash deterministic.

import {
    makeGame, step, stateHash, ROWS, CUBES, id, rowOf, colOf, neighbors,
    valid, cubeXY, neededCubes, edgeDist, W, HOP_TICKS, TUNNEL, tunnelCx,
} from '../src/games/QBert/sim.js'
import { plan } from '../src/games/QBert/planner.js'
import { sfxFor, VOICED, SILENT } from '../src/games/QBert/sound.js'
import { COILS, coilX, coilY, discHalfW, DISC_FRAMES, ballScale, BALL_FRAMES, BALL_R, bertFrame, BERT_GEO, BERT_LAND_TICKS, CUBE_SIDE, sideMargin, tunnelArch } from '../src/games/QBert/art.js'
import { Report } from './lib/harness.mjs'

const r = new Report('qbertcheck')
r.info('boot', 'sim.js + planner.js imported in Node, zero DOM, zero Math.random')

const play = (gs, input = {}) => step(gs, input)
const clearEv = (gs) => { const out = [...gs.events]; gs.events.length = 0; return out }
const until = (gs, cond, max = 600) => { let n = 0; while (!cond() && n < max) { play(gs); n++ } return n }

// ------------------------------------------------------------- geometry ----
r.check('the pyramid is 8 rows of 1,2,3,4,5,6,4,3 cubes', JSON.stringify(ROWS) === JSON.stringify([1, 2, 3, 4, 5, 6, 4, 3]), JSON.stringify(ROWS))
r.check('the board is exactly 28 cubes', CUBES.length === 28, `n=${CUBES.length}`)
r.check('the apex has exactly the two down-diagonal neighbours', JSON.stringify(neighbors(id(0, 0))) === JSON.stringify([id(1, 0), id(1, 1)]))
{
    let sym = true
    for (const a of CUBES) for (const b of neighbors(a)) if (!neighbors(b).includes(a) || !valid(rowOf(b), colOf(b))) sym = false
    r.check('diagonal adjacency is symmetric and stays on the board', sym)
    r.check('the bottom-right of the widest row is a fall (no cube below)', neighbors(id(5, 5)).every((n) => rowOf(n) < 6), `nbrs=${neighbors(id(5, 5)).length}`)
    r.check('the skirt hangs under the left edge (row 6 col 0 exists, col 4 does not)', valid(6, 0) && !valid(6, 4))
    let reach = new Set([id(0, 0)]), frontier = [id(0, 0)]
    while (frontier.length) {
        const next = []
        for (const n of frontier) for (const m of neighbors(n)) if (!reach.has(m)) { reach.add(m); next.push(m) }
        frontier = next
    }
    r.check('every cube is reachable from the apex by diagonal hops', reach.size === 28, `reach=${reach.size}`)
    const a = cubeXY(0, 0), l = cubeXY(5, 0), rr = cubeXY(5, 5), bot = cubeXY(7, 0)
    r.check('the iso layout centres every row: widest row spans 53..203, apex centred at 128, last row at y=161',
        Math.abs(a.x - 128) < 1 && Math.abs(l.x - 53) < 1 && Math.abs(rr.x - 203) < 1 && Math.abs(bot.y - 161) < 1,
        `apex=${a.x} l5=${l.x} r5=${rr.x} y7=${bot.y}`)
}

// ------------------------------------------------------ cube tiling ----
// The cabinet's surfaces tile contiguously: the front neighbour's top vertex
// sits one row-pitch below ours at the same x, so our side faces must reach
// its top edge. sideMargin is the pure coverage test in art.js (no DOM): the
// minimum, across the face, of (our side-bottom edge) minus (the front top
// edge). A shallow face (the old 10px) leaves the background showing through
// as a seam between diagonally adjacent tops; fail-proven below.
{
    r.check('the side faces are deep enough to reach the front top edge (no background seam)',
        sideMargin() >= 1, `margin=${Math.round(sideMargin() * 100) / 100}`)
    r.check('the side-face depth is at least the row pitch (15px)', CUBE_SIDE >= 15, `depth=${CUBE_SIDE}`)
    r.check('a shallow face (the old 10px) leaves a seam (the fix is load-bearing)',
        sideMargin(10) < 0, `margin@10=${Math.round(sideMargin(10) * 100) / 100}`)
}

// ------------------------------------------------------- hop + flip rule ----
{
    const gs = makeGame({ seed: 5 })
    r.check('the round opens with the apex already green (the start cube counts)', gs.colors[id(0, 0)] === 1 && neededCubes(gs).length === 27)
    clearEv(gs)
    play(gs, { dl: true })
    r.check('one dl press starts a hop (airborne, cube not yet changed)', gs.player.hop !== null && gs.player.r === 0)
    until(gs, () => !gs.player.hop, HOP_TICKS + 5)
    r.check('the hop lands on (1,0) after 12 ticks and flips it', gs.player.r === 1 && gs.player.c === 0 && gs.colors[id(1, 0)] === 1, `@${gs.player.r},${gs.player.c} col=${gs.colors[id(1, 0)]}`)
    r.check('a single landing scores exactly 25 and counts one flip', gs.score === 25 && gs.flips === 1, `score=${gs.score} flips=${gs.flips}`)
    r.check('a green cube re-landed does NOT double-count flips', (() => {
        play(gs, { ur: true }); until(gs, () => !gs.player.hop)
        play(gs, { dl: true }); until(gs, () => !gs.player.hop)
        return gs.flips === 1
    })())
}
{
    const gs = makeGame({ seed: 5 })
    Object.assign(gs.player, { r: 5, c: 5, invuln: 0 })
    play(gs, { dr: true })
    until(gs, () => !gs.player.hop)
    const ev = clearEv(gs)
    r.check('a diagonal that leaves the skirt is a fall: life lost with the balloon', gs.lives === 2 && gs.player.dying > 0 && gs.balloon === '@!#?@!' && ev.some((e) => e.t === 'death' && e.cause === 'fall'), `lives=${gs.lives} balloon=${gs.balloon}`)
    until(gs, () => gs.player.dying === 0)
    r.check('the death animation ends by respawning at the apex, invulnerable', gs.player.r === 0 && gs.player.c === 0 && gs.player.invuln > 0)
}
{
    const gs = makeGame({ seed: 5 })
    play(gs, { ul: true })
    r.check('an up-hop from the apex with no disc nearby is blocked (never a fall off the top)', gs.player.hop === null && gs.lives === 3)
}

// ------------------------------------------------------------ facing ----
{
    // Q*BERT faces the direction he TRAVELS on screen, not the key you pressed.
    // The old render rule (tc >= fc) pointed him right on every down-left hop and
    // on a skirt up-right hop. The sim now owns `facing` as the sign of the
    // horizontal hop displacement; these pins pin that rule, not a key-table.
    const face = (seed, r, c, input) => {
        const gs = makeGame({ seed })
        Object.assign(gs.player, { r, c, invuln: 0 })
        play(gs, input)
        until(gs, () => !gs.player.hop)
        return gs.player.facing
    }
    r.check('apex down-left hop faces LEFT (the bug: the old tc>=fc rule said right)', face(5, 0, 0, { dl: true }) === -1)
    r.check('apex down-right hop faces RIGHT', face(5, 0, 0, { dr: true }) === 1)
    r.check('up-left hop faces LEFT', face(5, 1, 1, { ul: true }) === -1)
    r.check('skirt down-left hop faces RIGHT (the row below is narrower; a naive down-left=left fix would get this wrong)', face(5, 5, 3, { dl: true }) === 1)
    r.check('skirt up-right hop faces LEFT (the row above is narrower; the old tc>=fc rule said right)', face(5, 6, 2, { ur: true }) === -1)
}

// --------------------------------------------------------- chain scoring ----
{
    // dl,dl,dr: three downs to (3,1) (the apex round-trips on the edges, so go
    // deep). Then ur,ur: two consecutive UP-hops that never land back on the
    // cube left two hops ago -> the second scores the heli-jump 100.
    const gs = makeGame({ seed: 5 })
    const seq = [{ dl: true }, { dl: true }, { dr: true }, { ur: true }, { ur: true }]
    const pts = []
    for (const s of seq) {
        clearEv(gs)
        play(gs, s)
        until(gs, () => !gs.player.hop)
        pts.push(...clearEv(gs).filter((e) => e.t === 'points').map((e) => e.pts))
    }
    r.check('chain scoring: 25/25/25 down, up 25 (chain 1), HELI-JUMP 100 (chain 2)', JSON.stringify(pts) === JSON.stringify([25, 25, 25, 25, 100]), JSON.stringify(pts))
}
{
    // slow chain: the same climb as the heli pin, but the last two up-hops are
    // separated by a long hesitation (well past the ~1s chain window) -> the
    // up-chain resets, so the second up-hop scores a single, not the heli-jump 100
    const gs = makeGame({ seed: 5 })
    const pts = []
    const doHop = (s) => {
        clearEv(gs); play(gs, s); until(gs, () => !gs.player.hop)
        pts.push(...clearEv(gs).filter((e) => e.t === 'points').map((e) => e.pts))
    }
    doHop({ dl: true }); doHop({ dl: true }); doHop({ dr: true }); doHop({ ur: true }) // 25,25,25,25 -> (2,1)
    for (let i = 0; i < 90; i++) play(gs)   // stand well over the one-second window
    r.check('the hesitation is real and the climb survives it (no death, no extra flip)', gs.player.dying === 0 && gs.flips === 4, `flips=${gs.flips} dying=${gs.player.dying}`)
    doHop({ ur: true })   // up to (1,1): gap > window resets the chain -> SINGLE 25, not 100
    r.check('a slow chain (gap past the ~1s window) scores a single, not the heli-jump 100',
        JSON.stringify(pts) === JSON.stringify([25, 25, 25, 25, 25]), JSON.stringify(pts))
}
{
    // round trip: down (apex -> (1,0)), then back UP onto the apex you came from
    const gs = makeGame({ seed: 5 })
    const seq = [{ dl: true }, { ur: true }]
    const pts = []
    for (const s of seq) {
        clearEv(gs)
        play(gs, s)
        until(gs, () => !gs.player.hop)
        pts.push(...clearEv(gs).filter((e) => e.t === 'points').map((e) => e.pts))
    }
    r.check('round trip (down, then back up onto the cube you came from) scores 50', JSON.stringify(pts) === JSON.stringify([25, 50]), JSON.stringify(pts))
}

// ----------------------------------------------------------------- 1-up ----
{
    // a hop that stays under 10,000 must NOT award a life
    const gs = makeGame({ seed: 5, lives: 3 })
    gs.score = 9900; gs.total = 9900
    clearEv(gs)
    play(gs, { dl: true }); until(gs, () => !gs.player.hop)
    const ev = clearEv(gs)
    r.check('a hop that stays under 10,000 awards no 1-up', gs.lives === 3 && !ev.some((e) => e.t === 'oneup'), `lives=${gs.lives} score=${gs.score}`)
}
{
    // the first 10,000 boundary, crossed on an ordinary 25-point hop, awards
    // exactly one extra life (and prints a oneup event, for the HUD/ledger)
    const gs = makeGame({ seed: 5, lives: 3 })
    gs.score = 9990; gs.total = 9990
    clearEv(gs)
    play(gs, { dl: true }); until(gs, () => !gs.player.hop)
    const ev = clearEv(gs)
    r.check('crossing 10,000 awards exactly one extra life (oneup event)', gs.lives === 4 && ev.some((e) => e.t === 'oneup' && e.lives === 4), `lives=${gs.lives} score=${gs.score}`)
}
{
    // each further 10,000 boundary awards one more life (here: 19,990 -> 20,015)
    const gs = makeGame({ seed: 5, lives: 3 })
    gs.score = 19990; gs.total = 19990
    clearEv(gs)
    play(gs, { dl: true }); until(gs, () => !gs.player.hop)
    const ev = clearEv(gs)
    r.check('a later 10,000 boundary awards one more life', gs.lives === 4 && ev.some((e) => e.t === 'oneup' && e.lives === 4), `lives=${gs.lives} score=${gs.score}`)
}
{
    // 1-ups stop at the 9-life cap: a boundary crossed at the cap awards nothing
    const gs = makeGame({ seed: 5, lives: 9 })
    gs.score = 99990; gs.total = 99990
    clearEv(gs)
    play(gs, { dl: true }); until(gs, () => !gs.player.hop)
    const ev = clearEv(gs)
    r.check('1-ups stop at the 9-life cap (a boundary crossed at the cap awards nothing)', gs.lives === 9 && !ev.some((e) => e.t === 'oneup'), `lives=${gs.lives} score=${gs.score}`)
}

// ------------------------------------------------------------ Coily ----
{
    // the harness's OWN walker (independent of planner.js): BFS to the nearest
    // cube that still needs flipping — this drives flips, not the pilot.
    const walk = (gs, maxFlips) => {
        while (gs.flips < maxFlips && !gs.end && gs.player.dying === 0) {
            const need = new Set(neededCubes(gs))
            if (!need.size) return
            const prev = new Map([[id(gs.player.r, gs.player.c), -1]])
            let frontier = [id(gs.player.r, gs.player.c)], hit = -1
            outer: while (frontier.length) {
                const next = []
                for (const n of frontier) for (const m of neighbors(n)) {
                    if (prev.has(m)) continue
                    prev.set(m, n)
                    if (need.has(m)) { hit = m; break outer }
                    next.push(m)
                }
                frontier = next
            }
            if (hit < 0) return
            const path = []
            let cur = hit
            while (cur !== id(gs.player.r, gs.player.c)) { path.unshift(cur); cur = prev.get(cur) }
            for (const m of path) {
                if (gs.end || gs.pending) return
                if (gs.player.dying > 0) { until(gs, () => gs.player.dying === 0); }
                const dr = rowOf(m) - gs.player.r, dc = colOf(m) - gs.player.c
                const dir = dr === -1 && dc === -1 ? 'ul' : dr === -1 ? 'ur' : dc === 0 ? 'dl' : 'dr'
                play(gs, { [dir]: true })
                until(gs, () => !gs.player.hop)
            }
        }
    }
    const gs = makeGame({ seed: 11 })
    walk(gs, 8)
    r.check('no snake on the board before the 9th flip', gs.snakes.length === 0, `flips=${gs.flips} snakes=${gs.snakes.length}`)
    walk(gs, 9)
    r.check('Coily drops exactly at the 9th flip', gs.snakes.length === 1 && gs.flips === 9, `flips=${gs.flips} snakes=${gs.snakes.length}`)
    // stand still off-apex: the snake must close and kill
    Object.assign(gs.player, { r: 4, c: 2, invuln: 0 })
    clearEv(gs)
    const ev = []
    let guard = 0
    while (gs.player.dying === 0 && guard++ < 60 * 20) { play(gs); ev.push(...clearEv(gs)) }
    const dists = []
    r.check('a standing target is eaten by the chase', gs.player.dying > 0 && ev.some((e) => e.t === 'death' && e.cause === 'snake'), `dying=${gs.player.dying} after ${guard} ticks`)
    r.check('the snake chase took a life and printed the balloon', gs.lives === 2 && gs.balloon === '@!#?@!')
}
{
    // the chase closes distance: pin that each drop the snake gets no further
    const gs = makeGame({ seed: 3 })
    gs.snakes.push({ r: 0, c: 0, enter: 0, dropT: 10, x: cubeXY(0, 0).x, y: cubeXY(0, 0).y })
    Object.assign(gs.player, { r: 3, c: 0, invuln: 0 })
    const pc = id(3, 0)
    let d0 = edgeDist(id(0, 0), pc), everGrew = false, closed = 0
    let guard = 0
    while (gs.player.dying === 0 && guard++ < 600) {
        play(gs)
        const s = gs.snakes[0]
        if (!s) break
        const d = edgeDist(id(s.r, s.c), pc)
        if (d > d0) everGrew = true
        if (d < d0) closed++
        d0 = Math.min(d0, d)
    }
    r.check('each Coily drop moves strictly toward you (never wanders off), and closes to contact', closed >= 2 && !everGrew && gs.player.dying > 0, `closes=${closed} grew=${everGrew}`)
}

// ---------------------------------------------------- the coily spring ----
// Coily's body is a real spring, not a stack of bars: several oval coils whose
// stack wiggles by a travelling sinusoid that advances one phase per frame.
// coilX/coilY are a PURE model in art.js (importable in Node, like the PoP
// light model), so the "it is a coil, it wiggles, it stays in bounds" contract
// is provable offline. The pins use LITERAL bounds, not the model's own
// constants (the TETRIS lesson): a static stack of bars — no per-coil variation
// or no per-frame advance — goes red.
{
    const xs0 = Array.from({ length: 5 }, (_, i) => coilX(i, 0))
    const xs1 = Array.from({ length: 5 }, (_, i) => coilX(i, 1))
    const maxAbs = Math.max(...xs0.map(Math.abs), ...xs1.map(Math.abs))
    r.check('Coily is a stack of multiple oval coils, not one bar', COILS >= 4, `coils=${COILS}`)
    r.check('the coil offsets vary across the stack (a wave, not a flat line)',
        xs0.some((x) => Math.abs(x) > 0.2) && new Set(xs0.map((x) => Math.round(x * 100))).size >= 3, JSON.stringify(xs0))
    r.check('the coil wiggle stays within a 2px amplitude (the spring never leaves the sprite)',
        maxAbs <= 2, `max=${Math.round(maxAbs * 100) / 100}`)
    r.check('the coil wiggle advances with the frame (frame 0 != frame 1 — the spring shimmers as it hops)',
        xs1.some((x, i) => Math.abs(x - xs0[i]) > 0.1), `d=${xs1.map((x, i) => Math.round((x - xs0[i]) * 100)).join(',')}`)
    // the whole spring fits the 22x22 sprite: each 15-wide / 4-tall coil oval,
    // centred at x=11, never clips for either frame.
    const fits = [0, 1].every((f) => Array.from({ length: COILS }, (_, i) => {
        const cx = 11 + coilX(i, f), cy = coilY(i)
        return cx - 7.5 >= 0 && cx + 7.5 <= 22 && cy - 2 >= 0 && cy + 2 <= 22
    }).every(Boolean))
    r.check('every coil oval fits inside the 22x22 sprite (no clipping on either frame)', fits)
}

// ----------------------------------------------------- the spinning disc ----
// The flying disc is a flat disc spinning about its vertical axis; at the
// cabinet's shallow angle its projected width oscillates as it turns
// (broadside -> edge-on -> broadside). That oscillation is the "it is spinning"
// cue the old 26x8 bar of shifting dashes never had. discHalfW is a PURE model
// in art.js, pinned in Node against LITERAL bounds (the TETRIS lesson): a
// static-width bar — no oscillation, no edge-on thinning, or a small disc —
// goes red.
{
    const ws = Array.from({ length: DISC_FRAMES }, (_, i) => discHalfW(i))
    const mx = Math.max(...ws), mn = Math.min(...ws)
    r.check('the disc spins: its projected width oscillates across the spin (not a static-width bar)',
        mx - mn > 4, JSON.stringify(ws.map((w) => Math.round(w * 10) / 10)))
    r.check('the disc is a real disc at broadside (larger than the old 26px bar: half-width >= 13)',
        mx >= 13, `max=${Math.round(mx * 10) / 10}`)
    r.check('the disc thins toward edge-on as it rotates (a real spin, not a fixed width)',
        mn <= 3, `min=${Math.round(mn * 10) / 10}`)
    r.check('the rotating disc stays inside its 28px sprite (2 x half-width <= 28, no clipping)',
        mx * 2 <= 28, `max=${Math.round(mx * 10) / 10}`)
}

// ------------------------------------------------------ the bouncing ball ----
// The red ball ricochets cube by cube down the edge. On each cube it compresses
// on impact (a squash) and springs back to round — the rubber-ball "boing" the
// old static 10x10 circle never had. ballScale is a PURE model of that per-cube
// bounce in art.js, pinned in Node against LITERAL bounds (the TETRIS lesson): a
// static ball — no squash at impact, no spring past round, or an out-of-bounds
// flare — goes red.
{
    const sc = Array.from({ length: BALL_FRAMES }, (_, i) => ballScale(i))
    const sy = sc.map((s) => s.sy)
    const sx = sc.map((s) => s.sx)
    const mny = Math.min(...sy), mxy = Math.max(...sy)
    const maxW = Math.max(...sx)
    r.check('the ball bounces: its height oscillates across the cube (not a static ball)',
        mxy - mny > 0.3, JSON.stringify(sy.map((v) => Math.round(v * 100) / 100)))
    r.check('the ball squashes hard on impact: the impact frame is the deepest, and under round',
        ballScale(0).sy <= mny + 1e-9 && mny < 1,
        `f0=${Math.round(ballScale(0).sy * 100) / 100} min=${Math.round(mny * 100) / 100}`)
    r.check('the ball springs PAST round as it rebounds (a real boing, not a flat press)',
        mxy > 1, `max=${Math.round(mxy * 100) / 100}`)
    r.check('the boing damps back toward round before the next impact (it settles, not a metronome)',
        Math.abs(ballScale(BALL_FRAMES - 1).sy - 1) < 0.05, `fLast=${Math.round(ballScale(BALL_FRAMES - 1).sy * 100) / 100}`)
    r.check('the squash flare stays inside the 22px sprite (2 x r x sx <= 22, no clipping)',
        2 * BALL_R * maxW <= 22, `maxW=${Math.round(2 * BALL_R * maxW * 10) / 10}`)
    r.check('the rebound stretch fits above the surface line in the sprite (2 x r x sy <= 15, no clipping)',
        2 * BALL_R * mxy <= 15, `maxH=${Math.round(2 * BALL_R * mxy * 10) / 10}`)
}

// ---------------------------------------------------- Q*Bert's hop poses ----
// The hop reads as a real leap, not a static figure: the up-hop TUCKS (feet up,
// body compact) and holds the tuck + smile at the apex; the down-hop stretches;
// and a down-landing plays a two-frame splayed SQUASH (deep, then recover) that
// settles back to idle. bertFrame is the PURE schedule and BERT_GEO each
// frame's literal geometry, pinned against LITERAL bounds (the TETRIS lesson):
// a flat pose set — no tuck, no stretch, no squash, or an out-of-bounds pose —
// goes red.
{
    const [idle, rise, apex, stretch, squash, recover] = BERT_GEO
    r.check('Q*Bert idle reads idle (frame 0)', bertFrame('idle') === 0, `f=${bertFrame('idle')}`)
    r.check('the up-hop rises tucked, then holds the tuck at the apex', bertFrame('up', 0.25) === 1 && bertFrame('up', 0.75) === 2, `a=${bertFrame('up', 0.25)} p=${bertFrame('up', 0.75)}`)
    r.check('the down-hop stretches toward the landing', bertFrame('down', 0.5) === 3, `f=${bertFrame('down', 0.5)}`)
    r.check('a down-landing squashes (deep) then recovers, and settles back to idle', bertFrame('land', 0.25) === 4 && bertFrame('land', 0.75) === 5 && bertFrame('land', 1) === 0, `d=${bertFrame('land', 0.25)} r=${bertFrame('land', 0.75)} s=${bertFrame('land', 1)}`)
    r.check('dying overrides every hop phase', bertFrame('dying') === 6 && bertFrame('dying', 0.5) === 6, `f=${bertFrame('dying')}`)
    r.check('the apex tuck is the most compact pose (feet up, body short of idle)', apex.fy < idle.fy && apex.bh < idle.bh && rise.fy < idle.fy, JSON.stringify([apex, rise]))
    r.check('the down-hop stretch is taller than idle (a real reach)', stretch.bh > idle.bh, `stretch=${stretch.bh} idle=${idle.bh}`)
    r.check('the landing squash is flatter and wider than idle (splayed feet)', squash.bh < idle.bh && squash.splay > idle.splay, JSON.stringify(squash))
    r.check('the squash recovers toward idle (the spring back)', recover.bh > squash.bh && recover.bh <= idle.bh && recover.splay === squash.splay, JSON.stringify(recover))
    r.check('the landing squash is a couple of frames, not instant and not a full hop', BERT_LAND_TICKS >= 4 && BERT_LAND_TICKS < HOP_TICKS, `land=${BERT_LAND_TICKS} hop=${HOP_TICKS}`)
    r.check('every pose stays inside the 18x20 sprite (feet, body and splay in bounds)',
        BERT_GEO.every((g) => g.fy + 3 <= 21 && g.fy - g.bh >= 6 && 1 - g.splay >= 0 && 11 + g.splay + 6 <= 18),
        JSON.stringify(BERT_GEO.map((g) => [g.fy, g.bh, g.splay])))
}

// --------------------------------------------------- the disc + snake lure ----
{
    const gs = makeGame({ seed: 13 })
    gs.discs[0].x = W / 2
    gs.snakes.push({ r: 1, c: 0, enter: 0, dropT: 9999, x: cubeXY(1, 0).x, y: cubeXY(1, 0).y })
    gs.snakes.push({ r: 5, c: 5, enter: 0, dropT: 9999, x: cubeXY(5, 5).x, y: cubeXY(5, 5).y })
    gs.score = 0
    clearEv(gs)
    play(gs, { ul: true })
    const ev = clearEv(gs)
    r.check('an up-hop from the apex with a disc crossing boards it', gs.player.ride !== null && ev.some((e) => e.t === 'discride'))
    r.check('the disc carries a nearby snake off the edge (+500) and leaves a distant one', gs.snakes.length === 1 && gs.snakes[0].r === 5 && ev.some((e) => e.t === 'snakelure') && gs.score === 500, `snakes=${gs.snakes.length} score=${gs.score}`)
    until(gs, () => !gs.player.ride, 60)
    // the drop's contract is "on a valid cube" — landing on the distant snake
    // (still at 5,5) is a legitimate death, so dying is NOT asserted here.
    r.check('the disc ride drops Q*BERT back onto a valid cube on the pyramid (never off-board)', valid(gs.player.r, gs.player.c), `landed @${gs.player.r},${gs.player.c}`)
}
{
    // the original's disc drop picks a RANDOM ROW across the whole pyramid, not
    // just the top two rows. Stub the RNG to a high roll and prove the drop
    // reaches the bottom skirt — the old apex-biased rule (rng<0.3 ? top : apex)
    // could never leave the top, so this pin is red on the old code.
    const gs = makeGame({ seed: 13 })
    gs.discs[0].x = W / 2
    gs.rng = () => 0.99
    clearEv(gs)
    play(gs, { ul: true })
    until(gs, () => !gs.player.ride, 60)
    r.check('a high RNG roll sends the disc drop to a bottom row (the wider row list, not apex-only)', gs.player.r === 7 && valid(gs.player.r, gs.player.c) && gs.player.dying === 0, `landed @${gs.player.r},${gs.player.c}`)
}
{
    // and a low roll still reaches the top — the drop spans the whole board,
    // it is not just "always the bottom". Row 0 has one cube, so any col roll
    // lands the apex.
    const gs = makeGame({ seed: 13 })
    gs.discs[0].x = W / 2
    gs.rng = () => 0.0
    clearEv(gs)
    play(gs, { ul: true })
    until(gs, () => !gs.player.ride, 60)
    r.check('a low RNG roll sends the disc drop to the apex row', gs.player.r === 0 && valid(gs.player.r, gs.player.c) && gs.player.dying === 0, `landed @${gs.player.r},${gs.player.c}`)
}

// -------------------------------------------------------------- red ball ----
{
    const gs = makeGame({ seed: 17 })
    Object.assign(gs.player, { r: 3, c: 0, invuln: 0 })
    gs.balls.push({ side: -1, r: 2, c: 0, t: 0, stepT: 5, x: cubeXY(2, 0).x, y: cubeXY(2, 0).y })
    clearEv(gs)
    const ev = []
    let guard = 0
    while (gs.player.dying === 0 && guard++ < 200) { play(gs); ev.push(...clearEv(gs)) }
    r.check('a ricocheting red ball down the left edge kills on the cube it reaches', gs.player.dying > 0 && ev.some((e) => e.t === 'death' && e.cause === 'ball'), `dying=${gs.player.dying}`)
}

// ------------------------------------------------- Ugg / Wrongway runners ----
const HW_ = 12
{
    const gs = makeGame({ seed: 19 })
    gs.runners.push({ row: 4, dir: 1, x: cubeXY(4, 0).x - HW_, kind: 'ugg' })
    Object.assign(gs.player, { r: 4, c: 3, invuln: 0 })
    clearEv(gs)
    const ev = []
    let guard = 0
    while (gs.player.dying === 0 && guard++ < 400) { play(gs); ev.push(...clearEv(gs)) }
    r.check('a runner crossing the row you stand on kills you', gs.player.dying > 0 && ev.some((e) => e.t === 'death' && e.cause === 'runner'))
}

// --------------------------------------------------------- Sam & Slick ----
{
    const gs = makeGame({ seed: 23 })
    gs.slicks.push({ r: 5, c: 5, stepT: 3, trail: [], done: false })
    gs.colors[id(5, 4)] = 1
    clearEv(gs)
    let guard = 0
    while (!clearEv(gs).some((e) => e.t === 'slickwipe') && guard++ < 60) play(gs)
    r.check('Slick wipes a green cube back to base as it slides through', gs.colors[id(5, 4)] === 0, `col=${gs.colors[id(5, 4)]}`)
    Object.assign(gs.player, { r: 5, c: 2, invuln: 0 })
    guard = 0
    while (gs.player.dying === 0 && guard++ < 200) play(gs)
    r.check('touching the slick kills', gs.player.dying > 0 && gs.lives < 3)
}

// --------------------------------------------------- the tunnel mouths ----
// The cabinet's bottom-corner portals: the sim owns the spans (TUNNEL), the
// runners emerge from one mouth and enter the other, Slick slides in from the
// right mouth out through the left, and tunnelArch is the PURE opening
// profile the painter draws. Pins are LITERAL (the TETRIS lesson): mouths that
// drift off the pyramid edges, a runner that materialises mid-edge, a Slick
// that pops on/off the board, or an arch that flattens to a bar/square, all
// go red.
{
    r.check('the mouths sit flush against the widest row edges (left 38, right 218, 26px wide)',
        TUNNEL.left.x1 === Math.round(cubeXY(5, 0).x) - 15 && TUNNEL.right.x0 === Math.round(cubeXY(5, 5).x) + 15
        && TUNNEL.left.x0 === TUNNEL.left.x1 - 26 && TUNNEL.right.x1 === TUNNEL.right.x0 + 26,
        `L=${TUNNEL.left.x0}..${TUNNEL.left.x1} R=${TUNNEL.right.x0}..${TUNNEL.right.x1}`)
    const spawnRunner = (roll) => {
        const gs = makeGame({ seed: 19, level: 2 })
        gs.rng = () => roll
        gs.runnerTimer = 1
        play(gs)
        return gs
    }
    const ugg = spawnRunner(0.4)    // row 4, dir +1
    const ww = spawnRunner(0.6)     // row 5, dir -1
    // (a freshly spawned runner already takes its first tick inside step, so
    // pin the mouth centre plus at most one level-2 speed increment of 1.16)
    r.check('Ugg emerges from the LEFT mouth centre (25), not mid-edge (-12)',
        ugg.runners.length === 1 && ugg.runners[0].x > 25 && ugg.runners[0].x < 27 && ugg.runners[0].kind === 'ugg', JSON.stringify(ugg.runners))
    r.check('Wrongway emerges from the RIGHT mouth centre (231), not mid-edge (268)',
        ww.runners.length === 1 && ww.runners[0].x > 229 && ww.runners[0].x < 231 && ww.runners[0].kind === 'wrongway', JSON.stringify(ww.runners))
}
{
    // the full crossing: the runner is alive mid-board and despawns only once
    // it has reached the opposite mouth — no mid-screen vanish
    const gs = makeGame({ seed: 19, level: 2 })
    gs.rng = () => 0.4
    gs.runnerTimer = 1
    play(gs)
    let seenMid = false, lastX = 0
    let guard = 0
    while (guard++ < 600) {
        const u = gs.runners[0]
        if (!u) break
        if (u.x > 100) seenMid = true
        lastX = u.x
        play(gs)
    }
    r.check('a runner crosses the whole board (alive past mid-board) and despawns only at the opposite mouth (x > 218)',
        seenMid && lastX > 218, `lastX=${Math.round(lastX * 10) / 10}`)
}
{
    // Slick: slides in from the right mouth onto the end cube (no pop), and
    // exits the bottom-left into the left mouth (no pop-off on (7,0))
    const gs = makeGame({ seed: 23, level: 3 })
    gs.slickTimer = 1
    play(gs)
    const sl = gs.slicks[0]
    // (the spawn tick already slides the entry 2.5px, so pin 231 - 2.5 exactly)
    r.check('Slick spawns inside the RIGHT mouth (x=228.5, in>0), not on the end cube (203)',
        sl && sl.in > 0 && sl.x === 228.5 && sl.r === 5 && sl.c === 5, JSON.stringify(sl && { x: sl.x, in: sl.in }))
    let entered = null, exited = false, lastX = 0
    let guard = 0
    while (guard++ < 1200) {
        const s2 = gs.slicks[0]
        if (!s2) break
        if (s2.in === 0 && entered === null) entered = s2.x === cubeXY(5, 5).x
        if (s2.out > 0) { exited = true; lastX = s2.x }
        play(gs)
    }
    r.check("Slick's entry slide ends exactly on the end cube (203) before it starts wiping", entered === true, `entered=${entered}`)
    r.check('Slick exits through the LEFT mouth (vanishes at the mouth centre, not on (7,0) at x=98)',
        exited && lastX > 12 && lastX < 38, `lastX=${Math.round(lastX * 10) / 10}`)
}
{
    // the arch profile: a doorway that flares from an 8px keystone to the
    // full 20px portal, and the opening frames every enemy path that must
    // pass through the mouth
    const aR = tunnelArch(26, 40)
    const aL = tunnelArch(26, 70)
    const ow = (a) => a[1] - a[0]
    r.check('the arch flares from an 8px keystone to the full 20px portal (a doorway, not a bar or square)',
        ow(aR[0]) === 8 && ow(aR[39]) === 20 && ow(aR[0]) < ow(aR[20]),
        `top=${ow(aR[0])} mid=${ow(aR[20])} bot=${ow(aR[39])}`)
    const band = Array.from({ length: 28 }, (_, i) => 112 + i)    // the runner y bands (rows 4 and 5)
    const frames = (a, y0, ys) => ys.every((y) => y - y0 >= 0 && y - y0 < a.length && ow(a[y - y0]) >= 8)
    r.check('the right opening frames the runner bands (y 112..139)', frames(aR, TUNNEL.right.y0, band))
    r.check('the left opening frames the runner bands AND Slick bottom exit (y 161)', frames(aL, TUNNEL.left.y0, [...band, 161]))
}

// ------------------------------------------------ round modes + the round ----
r.check('round 1 is the single-flip mode', makeGame({ level: 1 }).mode === 1)
r.check('round 2 is the five-colour cycle mode', makeGame({ level: 2 }).mode === 2)
{
    const gs = makeGame({ level: 2, seed: 29 })
    const cols = new Set(CUBES.map((i) => gs.colors[i]))
    r.check('cycle boards seed every colour 0..4 on the cubes', [...cols].every((c) => c >= 0 && c < 5) && cols.size >= 2, `kinds=${cols.size}`)
    const un = neededCubes(gs)
    const t0 = un.length
    // set all to colour 1 except one cube showing 0
    for (const i of CUBES) gs.colors[i] = 1
    const victim = id(3, 1)
    gs.colors[victim] = 0
    Object.assign(gs.player, { r: 2, c: 1, invuln: 0 })
    clearEv(gs)
    play(gs, { dl: true })
    until(gs, () => !gs.player.hop)
    const ev = clearEv(gs)
    r.check('a cycle hop advances the cube 0 -> 1', gs.colors[victim] === 1)
    r.check('the round clears the instant all 28 cubes match (+1000)', ev.some((e) => e.t === 'clear' && e.bonus === 1000) && gs.pending !== null)
    until(gs, () => !gs.pending, 120)
    r.check('clearing rolls the pyramid into the next round (level++)', gs.level === 3 && gs.mode === 2, `level=${gs.level}`)
    r.check('cycle mode never needed 0 colour left', t0 >= 0)
}
{
    // full round-1 clear under the harness walker: exactly 27 flips, no clear sooner
    const gs = makeGame({ seed: 31 })
    let clearAt = -1, flipsAt = -1
    let guard = 0
    while (!gs.end && guard++ < 60 * 120) {
        const need = new Set(neededCubes(gs))
        if (!need.size) { clearAt = gs.tick; flipsAt = gs.flips; break }
        const prev = new Map([[id(gs.player.r, gs.player.c), -1]])
        let frontier = [id(gs.player.r, gs.player.c)], hit = -1
        outer: while (frontier.length) {
            const next = []
            for (const n of frontier) for (const m of neighbors(n)) {
                if (prev.has(m)) continue
                prev.set(m, n)
                if (need.has(m)) { hit = m; break outer }
                next.push(m)
            }
            frontier = next
        }
        if (hit < 0) break
        const path = []
        let cur = hit
        while (cur !== id(gs.player.r, gs.player.c)) { path.unshift(cur); cur = prev.get(cur) }
        for (const m of path) {
            if (gs.pending) break
            if (gs.player.dying > 0) { until(gs, () => gs.player.dying === 0); }
            const dr = rowOf(m) - gs.player.r, dc = colOf(m) - gs.player.c
            const dir = dr === -1 && dc === -1 ? 'ul' : dr === -1 ? 'ur' : dc === 0 ? 'dl' : 'dr'
            play(gs, { [dir]: true })
            until(gs, () => !gs.player.hop)
        }
        gs.events.length = 0
    }
    r.check('a scripted tour flips every cube and clears the round on flip 27', flipsAt === 27 && clearAt > 0, `flips=${flipsAt}`)
}

// --------------------------------------------- the pilot: wins + slack + hash ----
function pilotRun(seed, lives) {
    const gs = makeGame({ seed, lives })
    let ledger = 0
    let t = 0
    while (!gs.end && !gs.pending && t < 60 * 120) {
        step(gs, plan(gs))
        for (const e of gs.events) {
            if (e.t === 'points') ledger += e.pts
            if (e.t === 'snakelure') ledger += 500
            if (e.t === 'clear') ledger += e.bonus
        }
        gs.events.length = 0
        t++
    }
    return { gs, ledger, t, hash: stateHash(gs) }
}

for (const seed of [1, 7, 42, 101, 777, 0xbeef, 2026, 1982]) {
    const A = pilotRun(seed, 3)
    r.check(`seed ${seed}: the pilot clears round 1 (the game can be won by its own demo)`, !!A.gs.pending, `flips=${A.gs.flips} lives=${A.gs.lives} t=${A.t}`)
    r.check(`seed ${seed}: the pilot runs with ONE FEWER LIFE than the player is dealt (slack)`, !!pilotRun(seed, 2).gs.pending)
    r.check(`seed ${seed}: the score ledger adds up event-by-event`, A.gs.score === A.ledger, `score=${A.gs.score} ledger=${A.ledger}`)
    const B = pilotRun(seed, 3)
    r.check(`seed ${seed}: the pilot run is hash-for-hash deterministic`, B.hash === A.hash && B.t === A.t, `${A.hash}@${A.t} vs ${B.hash}@${B.t}`)
}

{
    // the pilot refuses to hop into a snake it can see
    const gs = makeGame({ seed: 51 })
    Object.assign(gs.player, { r: 0, c: 0, invuln: 0 })
    gs.snakes.push({ r: 1, c: 0, enter: 0, dropT: 10, x: cubeXY(1, 0).x, y: cubeXY(1, 0).y })
    const inp = plan(gs)
    r.check('the pilot freezes rather than hopping at a snake one hop away, dropping soon', !(inp.dl === true), JSON.stringify(inp))
}

// ------------------------------------------------------ sound contract ----
// The SFX table (sound.js) is the contract between the sim's events and the
// shell's player, pinned here both ways:
//   (1) every event type in VOICED + SILENT is emitted by the sim — no dead
//       voices (the sim renamed/removed an event -> red)
//   (2) every event type the sim emits is in the contract — a NEW event with
//       no voice fails the gate (the "event without a voice" rule from the
//       Prince of Persia sound pass)
// The forced tour below makes each type happen; any event that fires by
// accident along the way is graded too.
{
    const seen = new Set()
    const watch = (g) => { for (const e of g.events) seen.add(e.t) }
    const g = makeGame({ seed: 5, lives: 9 })

    // hop / land / points(25)
    play(g, { dl: true }); watch(g)
    until(g, () => !g.player.hop); watch(g)
    // points(50) round trip, and 9990 + 50 crosses 10,000 -> oneup
    // (below the 9-life cap, or the ledger stays silent by design)
    g.lives = 3
    g.score = 9990; g.total = 9990
    play(g, { ur: true }); watch(g)
    until(g, () => !g.player.hop); watch(g)
    // fall + death, then the respawn
    Object.assign(g.player, { r: 5, c: 5, invuln: 0, hop: null })
    play(g, { dr: true }); watch(g)
    until(g, () => g.player.dying === 0); watch(g)
    // snakespawn: arm the snake, then flip an unflipped cube ((1,1) is fresh)
    g.nextSnakeAt = 1
    play(g, { dr: true }); watch(g)
    until(g, () => !g.player.hop); watch(g)
    // coilyhop: the snake (spawned at the apex) chases a far, invulnerable player
    Object.assign(g.player, { r: 5, c: 0, invuln: 400 })
    for (let i = 0; i < 240; i++) { play(g); watch(g) }
    // discride + snakelure: board the disc with a snake one hop from the apex
    g.snakes.length = 0
    g.snakes.push({ r: 1, c: 0, enter: 0, dropT: 9999, x: cubeXY(1, 0).x, y: cubeXY(1, 0).y })
    Object.assign(g.player, { r: 0, c: 0, hop: null, ride: null, invuln: 0 })
    g.discs[0].x = W / 2
    play(g, { ul: true }); watch(g)
    until(g, () => !g.player.ride, 60); watch(g)
    // park the player somewhere safe for the rest of the tour
    g.balls.length = 0
    Object.assign(g.player, { r: 2, c: 0, hop: null, ride: null, invuln: 120 })
    // ballspawn / runnerspawn / slickspawn: force the timers
    g.ballTimer = 1; play(g); watch(g)
    g.runnerTimer = 1; play(g); watch(g)
    g.slickTimer = 1; play(g); watch(g)
        // slickwipe: a green cube directly on the slick's path (finish the
        // tunnel entry so the slick is a cube-stepper again)
        g.slicks[0].in = 0
        g.slicks[0].x = cubeXY(5, 5).x
        g.colors[id(5, 4)] = 1
        g.slicks[0].stepT = 1; play(g); watch(g)
    // clear: everything green except the cube the player hops onto
    for (const i of CUBES) g.colors[i] = 1
    g.colors[id(3, 1)] = 0
    play(g, { dr: true }); watch(g)
    until(g, () => !g.player.hop); watch(g)
    r.check('the tour cleared the round before the game could end (clear was seen live)', seen.has('clear') && g.pending !== null, `pending=${g.pending && g.pending.t}`)
    until(g, () => !g.pending, 120); watch(g)
    // over: one life left, fall off the skirt
    g.lives = 1
    Object.assign(g.player, { r: 5, c: 5, invuln: 0, hop: null })
    play(g, { dr: true }); watch(g)
    until(g, () => g.end, 300); watch(g)

    const deadVoices = [...VOICED, ...SILENT].filter((t) => !seen.has(t))
    r.check('the sim emits every event in the sound contract (no dead voice)', deadVoices.length === 0, `missing: ${deadVoices.join(',')}`)
    const unlisted = [...seen].filter((t) => !VOICED.includes(t) && !SILENT.includes(t))
    r.check('every event the sim emits is voiced or explicitly silent (a new event without a voice fails the gate)', unlisted.length === 0, `unlisted: ${unlisted.join(',')}`)
    r.check('silent events make no sound', sfxFor({ t: 'land' }).length === 0 && sfxFor({ t: 'fall' }).length === 0)
}
{
    // the shapes that define the pass — fail-proven: the pre-fix code played ONE
    // sweep(660->1320) for every score >= 50 and had no coilyhop/oneup voice at
    // all, so the heli/round-trip/boing/oneup pins below are all red on it.
    const up = (ops) => ops.every((o, i) => o.k === 'tone' && (i === 0 || o.f > ops[i - 1].f))
    const heli = sfxFor({ t: 'points', pts: 100 })
    r.check('the heli-jump 100 is a coin-timbre up-arpeggio: 4 bright, ascending, spaced notes',
        heli.length === 4 && up(heli) && heli.every((o) => o.f >= 800) && heli.every((o, i) => i === 0 || o.at >= heli[i - 1].at + 0.03),
        JSON.stringify(heli))
    const rt = sfxFor({ t: 'points', pts: 50 })
    r.check('the round-trip 50 is a shorter up-arpeggio (2 ascending notes, plainly smaller than the heli)',
        rt.length === 2 && up(rt) && rt.length < heli.length, JSON.stringify(rt))
    const single = sfxFor({ t: 'points', pts: 25 })
    r.check('an ordinary 25 stays a single note (no arpeggio for an ordinary hop)',
        single.length === 1 && single[0].k === 'tone', JSON.stringify(single))
    const boing = sfxFor({ t: 'coilyhop' })
    r.check("Coily's drop tick is one soft descending boing",
        boing.length === 1 && boing[0].k === 'sweep' && boing[0].f0 > boing[0].f1 && boing[0].v <= 0.08, JSON.stringify(boing))
    const oneup = sfxFor({ t: 'oneup' })
    r.check('the 1-up has a voice: an ascending jingle of at least 3 notes',
        oneup.length >= 3 && up(oneup), JSON.stringify(oneup))
    r.check('death stays a descending sweep; clear keeps the fanfare; over keeps the death jingle',
        sfxFor({ t: 'death' })[0].k === 'sweep' && sfxFor({ t: 'death' })[0].f0 > sfxFor({ t: 'death' })[0].f1
        && sfxFor({ t: 'clear' }).some((o) => o.k === 'fanfare')
        && sfxFor({ t: 'over' }).some((o) => o.k === 'jingle'))
    r.check('every voiced event type resolves to a non-empty recipe', VOICED.every((t) => sfxFor({ t, pts: 25 }).length > 0), VOICED.join(','))
}

r.exit()
