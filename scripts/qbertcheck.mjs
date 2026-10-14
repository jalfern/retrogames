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
    valid, cubeXY, neededCubes, edgeDist, W, HOP_TICKS,
} from '../src/games/QBert/sim.js'
import { plan } from '../src/games/QBert/planner.js'
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
    r.check('the disc ride drops Q*BERT back on top of the pyramid', gs.player.r <= 2 && gs.player.dying === 0, `landed @${gs.player.r},${gs.player.c}`)
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

r.exit()
