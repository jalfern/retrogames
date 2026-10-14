// Q*BERT autopilot: BFS over the cube graph to the nearest cube that still
// needs a flip, frozen while a hazard occupies or is about to occupy the next
// step. The attract demo replays this run; qbertcheck proves it clears round 1
// with one fewer life than the player gets (the slack rule).

import { id, rowOf, colOf, neighbors, neededCubes, edgeDist } from './sim.js'

function bfsPath(from, targets, blocked) {
    if (targets.has(from)) return []
    const prev = new Map([[from, -1]])
    let frontier = [from]
    while (frontier.length) {
        const next = []
        for (const n of frontier) {
            for (const m of neighbors(n)) {
                if (prev.has(m) || blocked.has(m)) continue
                prev.set(m, n)
                if (targets.has(m)) {
                    const path = []
                    let cur = m
                    while (cur !== from) { path.unshift(cur); cur = prev.get(cur) }
                    return path
                }
                next.push(m)
            }
        }
        frontier = next
    }
    return null
}

function dirBetween(a, b) {
    const dr = rowOf(b) - rowOf(a), dc = colOf(b) - colOf(a)
    if (dr === -1 && dc === -1) return 'ul'
    if (dr === -1) return 'ur'
    if (dc === 0) return 'dl'
    return 'dr'
}

export function plan(gs) {
    const p = gs.player
    if (gs.end || gs.pending || p.dying || p.hop || p.ride) return {}
    const me = id(p.r, p.c)
    const needed = neededCubes(gs)
    if (!needed.length) return {}

    const blocked = new Set()
    for (const s of gs.snakes) {
        const sc = id(s.r, s.c)
        blocked.add(sc)
        if (s.enter <= 0 && s.dropT <= 24) for (const m of neighbors(me)) if (m === sc) blocked.add(m)
        if (s.enter > 0) blocked.add(id(0, 0))
        if (edgeDist(sc, me) === 1 && s.dropT <= 18) return {}
    }
    for (const b of gs.balls) blocked.add(id(b.r, b.c))
    for (const sl of gs.slicks) {
        blocked.add(id(sl.r, sl.c))
        if (sl.c > 0) blocked.add(id(sl.r, sl.c - 1))
    }
    const targets = new Set(needed)
    targets.delete(me)
    const path = bfsPath(me, targets, blocked)
    if (!path || !path.length) return {}
    const next = path[0]
    if (blocked.has(next)) return {}
    // a runner currently crossing any row our route uses: wait it out
    for (const u of gs.runners) {
        const spans = path.some((i) => rowOf(i) === u.row) || p.r === u.row
        if (spans) return {}
    }
    return { [dirBetween(me, next)]: true }
}
