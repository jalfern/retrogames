// CIVILIZATION V — the autopilot. This same reactive brain drives the attract
// demo (live in the shell) and is the witness scripts/civcheck.mjs replays to
// prove the game is winnable and deterministic. No Math.random; every choice is
// a function of the state, so re-running from the same seed reproduces a
// hash-for-hash identical game.
//
// Stage-2 policy: found the capital, keep the settlers expanding once it is
// safe, and fight defensively — kill threats near home, burn nearby barbarian
// camps, shoot what stands in range — then end the turn and let the capital
// grow to the milestone. It does not conquergoal: domination stays a player
// ambition, the autopilot's job is to survive the frontier it was proven on.

import { CFG, T, canFound, neighbors, hexDist, newGame, step, tileAt, unitAt, atWar, BARB, UNIT, TECH, stepToward, tileBlocked, availableTechs, canImprove, canAdopt, WONDER, WONDER_IDS, canBuildWonder, canRecruit, canUseGP, GP_TYPES } from './sim.js'

const SITE = (tl) => (tl.terr === T.GRASS ? 3 : tl.terr === T.PLAINS ? 2 : 0)
    + (tl.river ? 2 : 0) + (tl.forest ? 1 : 0) + (tl.terr === T.HILLS ? 1 : 0)

// research path the witness steers the player down: Stage 4 puts the land to
// work first (Pottery → farms, The Wheel → roads), then the arms. Issued only
// when research is idle (just learned). Stage 8 appends the later eras at the
// tail — the old line keeps its exact order so every proven witness run replays
// unchanged; a science-race harness (civcheck §32) re-prioritises this very
// array to drive the Ark home.
export const RESEARCH_ORDER = ['POTTERY', 'THE_WHEEL', 'ARCHERY', 'MASONRY', 'BRONZE_WORKING', 'AGRICULTURE', 'WRITING', 'CURRENCY', 'HORSEBACK', 'PHILOSOPHY', 'ENGINEERING', 'MATHEMATICS',
    'EDUCATION', 'BANKING', 'GUNPOWDER', 'ASTRONOMY', 'STEAM_POWER', 'RAILROAD', 'INDUSTRIALIZATION', 'ELECTRICITY', 'SPACEFLIGHT']

// Stage 5: culture buys government too — the witness lines up Tradition first
// (borders + luxury joy), then Liberty's colonial push, then Commerce.
const POLICY_ORDER = ['FOUNDATIONS', 'CEREMONY', 'COLONIAL', 'COLLEGE', 'TRADING_POSTS', 'TREATIES']

function bestSiteNeighbor(gs, civ, c, r) {
    let best = null, bs = -1e9
    for (const [nc, nr] of neighbors(c, r)) {
        const tl = tileAt(gs, nc, nr)
        if (!tl || tl.terr < T.GRASS || tl.terr > T.HILLS) continue
        if (gs.units.some((u) => u.alive && u.c === nc && u.r === nr)) continue
        if (tileBlocked(gs, nc, nr)) continue
        // avoid founding too near existing cities (spacing) while scouting outward
        let s = SITE(tl)
        for (const ct of gs.cities) if (ct.alive && hexDist([ct.c, ct.r], [nc, nr]) < CFG.minCitySpacing) s -= 5
        s += neighbors(nc, nr).filter(([x, y]) => tileAt(gs, x, y)?.terr === T.GRASS).length * 1.2
        if (s > bs) { bs = s; best = [nc, nr] }
    }
    return best
}

// combat targets for one of our military units, in priority order
function strikeTarget(gs, u) {
    const range = Math.max(1, UNIT[u.kind].range)
    let best = null, bd = 1e9, bk = 0
    const consider = (c, r, kindW) => {
        const d = hexDist([u.c, u.r], [c, r])
        if (d < 1 || d > range) return
        const score = d * 10 - kindW          // nearer + meaner wins
        if (score > bd * 10 - bk) { bd = d; bk = kindW; best = [c, r] }
    }
    for (const x of gs.units) if (x.alive && atWar(gs, 0, x.civ)) consider(x.c, x.r, x.kind === 'SETTLER' ? 5 : 3)
    for (const cp of gs.camps) if (cp.alive) consider(cp.c, cp.r, 4)
    return best
}

// what an idle military unit walks toward: threats near home, then camps near home
function objective(gs, u, cap) {
    let best = null, bd = 5
    const anchor = cap || u
    for (const x of gs.units) {
        if (!x.alive || !atWar(gs, 0, x.civ)) continue
        const near = hexDist([x.c, x.r], [anchor.c, anchor.r])
        const d = hexDist([u.c, u.r], [x.c, x.r])
        if (near <= 4 && d < bd) { bd = d; best = [x.c, x.r] }
    }
    if (best) return best
    bd = 5
    for (const cp of gs.camps) {
        if (!cp.alive) continue
        const near = hexDist([cp.c, cp.r], [anchor.c, anchor.r])
        const d = hexDist([u.c, u.r], [cp.c, cp.r])
        if (near <= 4 && d < bd) { bd = d; best = [cp.c, cp.r] }
    }
    return best
}

export function decide(gs) {
    if (gs.end || gs.phase !== 'player') return {}
    if (gs.units.some((u) => u.civ === 0 && u.alive && u.path && u.path.length)) return {}
    const cap = gs.cities.find((c) => c.civ === 0 && c.alive && c.capital)
    const s = gs.units.find((u) => u.civ === 0 && u.alive && u.kind === 'SETTLER')
    if (!cap && s) {
        if (canFound(gs, 0, s.c, s.r, s) === true) return { select: s.id, found: true }
        if (s.moves > 0) { const t = bestSiteNeighbor(gs, 0, s.c, s.r); if (t) return { select: s.id, move: t } }
    }
    if (cap) {
        // keep the lab lit: choose the next tech whenever research is idle
        const R0 = gs.tech[0]
        if (!R0.research) {
            const av = availableTechs(gs, 0)
            for (const id of RESEARCH_ORDER) if (av.includes(id)) return { research: id }
        }
        // spend culture on government when the pool can pay
        for (const id of POLICY_ORDER) if (canAdopt(gs, 0, id) === true) return { policy: id }
        // Stage 6: spend a great person in hand (save the engineer for a wonder,
        // the scientist for something that will take a while), then recruit, then
        // chase the first wonder whose tech the lab has handed down.
        for (const t of GP_TYPES) {
            if (gs.gp[0].held[t] > 0 && canUseGP(gs, 0, t) === true) {
                if (t === 'SCIENTIST' && gs.tech[0].research && gs.tech[0].prog * 2 < TECH[gs.tech[0].research].cost) return { useGP: { kind: t } }
                if (t === 'ENGINEER' && cap.queue && cap.queue.length && WONDER[cap.queue[0]]) return { useGP: { kind: t } }
                if (t === 'MERCHANT') return { useGP: { kind: t } }
            }
        }
        for (const t of GP_TYPES) if (canRecruit(gs, 0, t) === true) return { recruit: t }
        if (cap.queue.length < 3 && !cap.queue.some((k) => WONDER[k]) && !WONDER_IDS.some((id) => gs.wonders[id] === 0)) {
            const pick = WONDER_IDS.filter((id) => canBuildWonder(gs, 0, id) === true)
            if (pick.length) return { queue: pick[0] }
        }
        // Stage 4 labour: train one worker, then keep it working the heartland
        const workers = gs.units.filter((u) => u.alive && u.civ === 0 && u.kind === 'WORKER')
        if (!workers.length && !(cap.queue || []).includes('WORKER') && cap.queue.length < 3) return { queue: 'WORKER' }
        const w = workers.find((x) => x.busy == null && x.moves > 0)
        if (w) {
            for (const k of ['MINE', 'FARM', 'ROAD']) if (canImprove(gs, 0, w, k) === true) return { select: w.id, improve: k }
            const spot = neighbors(w.c, w.r).find(([c, r]) => {
                const tl = tileAt(gs, c, r)
                return tl && tl.terr >= T.GRASS && tl.terr <= T.HILLS && !tl.imp && !tl.road && !unitAt(gs, c, r) && !tileBlocked(gs, c, r) && tl.owner === 0
            }) || neighbors(w.c, w.r).find(([c, r]) => {
                const tl = tileAt(gs, c, r)
                return tl && tl.terr >= T.GRASS && tl.terr <= T.HILLS && !unitAt(gs, c, r) && !tileBlocked(gs, c, r)
            })
            if (spot) return { select: w.id, move: spot }
        }
        // fight: any unit that can strike now, strongest target first
        const mil = gs.units.filter((u) => u.alive && u.civ === 0 && u.str > 0 && u.moves > 0)
        for (const u of mil) {
            const t = strikeTarget(gs, u)
            if (t) return { select: u.id, attack: t }
        }
        // march toward the nearest objective, settlers keep expanding once safe
        for (const u of mil) {
            const o = objective(gs, u, cap)
            if (o && u.moves > 0) { const t = stepToward(gs, u, o); if (t) return { select: u.id, move: t } }
        }
        const extra = gs.units.filter((u) => u.alive && u.civ === 0 && u.kind === 'SETTLER' && u.moves > 0 && cap.size >= 2)
        for (const e of extra) {
            if (canFound(gs, 0, e.c, e.r, e) === true) return { select: e.id, found: true }
            const t = bestSiteNeighbor(gs, 0, e.c, e.r)
            if (t) return { select: e.id, move: t }
        }
    }
    return { endTurn: true }
}

export function plan(scenario = 0, seed = 1) {
    const gs = newGame(seed, scenario)
    let guard = 0
    while (!gs.end && guard++ < 40000) step(gs, decide(gs))
    const cap = gs.cities[gs.capitalOf[0]]
    return {
        ok: gs.end === 'win',
        end: gs.end,
        turns: gs.turn,
        capitalSize: cap ? cap.size : 0,
        why: gs.endWhy,
        hash: (gs.turn * 2654435761 ^ gs.units.length * 40503 ^ (cap ? cap.size * 2246822519 : 0)) >>> 0,
        cities: gs.cities.filter((c) => c.alive).length,
    }
}
