// ADVENTURE route (Atari 2600, 1979) — #1637 batch 11 WATCH driver.
//
// The proven route from adventurecheck's route adapter (winRunV3), ported to a
// generator that emits ONE input { dx, dy, drop } per tick. Node gates run this
// exact file (seeds 1..10 x cart variants 1..3, 30/30 wins) and the browser
// seats it live — the seat IS the proof, never a separate scripted replay.
//
// Reactive by construction: every step re-reads the live sim (item shuffle,
// the bat's steals, magnet drift, which gates are open, which walls the bridge
// has opened), so Y seats mid-run and the guide walks from HERE.
//
// The route (classic solve order):
//   blackKey -> black gate rite (drop the key at the threshold)
//   -> bridge -> whiteKey (through the Red Maze, bridge law respected)
//   -> white gate rite -> chalice -> home to the Gold Castle.
// Dragon lairs are avoided on the preferred graph; the plain graph is the
// retry. No sword, no dot rite, no teleports — legal player inputs only.

import { ROOMS, EXITS, CASTLE_INSIDES, R, GW, GH, PLAYER_SPEED as S, SIDE_GAP_Y, SIDE_GAP_H } from './sim.js'

// ---- cell-grid pathing inside a room (#1560 law: sign-steering dies in the
// mazes; plan on 4px cells, hop cell-to-cell one axis at a time) ----
const CELL = 4
const GWc = Math.ceil(GW / CELL)
const GHc = Math.ceil(GH / CELL)
const gridCache = new Map()
const freeGrid = (room) => {
    if (!gridCache.has(room)) {
        const walls = ROOMS[room].walls
        const g = new Array(GWc * GHc)
        for (let cy = 0; cy < GHc; cy++) for (let cx = 0; cx < GWc; cx++) {
            const px = cx * CELL + CELL / 2 - 3, py = cy * CELL + CELL / 2 - 5
            g[cy * GWc + cx] = !walls.some((w) => px < w.x + w.w && px + 6 > w.x && py < w.y + w.h && py + 10 > w.y)
        }
        gridCache.set(room, g)
    }
    return gridCache.get(room)
}

const cellPath = (sim, fx, fy, tx, ty) => {
    const g = freeGrid(sim.room)
    const cc = (v, n) => Math.max(0, Math.min(n - 1, v))
    const gx = cc(Math.floor(tx / CELL), GWc), gy = cc(Math.floor(ty / CELL), GHc)
    const sx0 = cc(Math.floor(fx / CELL), GWc), sy0 = cc(Math.floor(fy / CELL), GHc)
    let starts = [[sx0, sy0]]
    if (!g[sy0 * GWc + sx0]) {
        starts = []
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = cc(sx0 + dx, GWc), ny = cc(sy0 + dy, GHc)
            if (g[ny * GWc + nx]) starts.push([nx, ny])
        }
    }
    const prev = new Map()
    const order = []
    for (const [cx, cy] of starts) { const k = cy * GWc + cx; if (!prev.has(k)) { prev.set(k, -1); order.push(k) } }
    for (let i = 0; i < order.length; i++) {
        const s = order[i], cx = s % GWc, cy = (s - cx) / GWc
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= GWc || ny >= GHc) continue
            const k = ny * GWc + nx
            if (prev.has(k) || !g[k]) continue
            prev.set(k, s); order.push(k)
        }
    }
    const goal = gy * GWc + gx
    if (!prev.has(goal)) return []
    const path = []
    let k = goal
    while (k !== -1) { path.unshift([k % GWc, (k - (k % GWc)) / GWc]); k = prev.get(k) }
    return path
}

// Drive to a point in the current room, one input per tick. Diagonal first,
// then each axis alone (a side-biting wall can kill one tick mid-hop; the
// other still gets its tick). True on arrival, false on death/win/exhaustion.
// #3489: rooms no longer cage dragons — idle ones wander through doorways —
// so every drive is dragon-aware: a threat inside DODGE_SAFE triggers the
// kite below instead of walking into a maw.
const DODGE_SAFE = 48   // kite while a live dragon is nearer than this in your room

// #3489 — shared quest wait-credit. Every "wait for the world" the guide does
// (calm-entry, door-clear, guard cycle, bat trade, theft recovery) draws from
// ONE pool per drive instead of a fresh cap per attempt: ten fresh 1600-tick
// waits on one stubborn fetch burned the 60k budget on seeds 3/8 V1 (the bat
// hoarded the bridge for 40k ticks while each retry re-armed its own timer).
// When the credit is spent the guide stops waiting and drives — which is what
// the honest part of the quest still needs the budget for. Lives beside the
// sim in a WeakMap, never inside it: the guide still emits inputs only.
const CREDIT = new WeakMap()
const credit = (sim) => {
    let c = CREDIT.get(sim)
    if (!c) { c = { w: 30000 }; CREDIT.set(sim, c) }
    return c
}


const roomThreat = (sim) => {
    // #3489 sword ride: with the blade in hand a dragon is not a threat but
    // prey — the contact law (<14 px, sim.js) slays it. The guide then walks
    // straight through guarded rooms instead of kiting them.
    if (sim.carrying === 'sword') return null
    const p = sim.player
    let best = null
    for (const d of sim.dragons) {
        if (!d.alive || d.room !== sim.room) continue
        const dist = Math.hypot(p.x - d.x, p.y - d.y)
        if (!best || dist < best.dist) best = { d, dist }
    }
    return best
}

// The raw room hazard, blade or no blade — used when the dot WANTS the gap.
const roomDragon = (sim) => {
    const p = sim.player
    let best = null
    for (const d of sim.dragons) {
        if (!d.alive || d.room !== sim.room) continue
        const dist = Math.hypot(p.x - d.x, p.y - d.y)
        if (!best || dist < best.dist) best = { d, dist }
    }
    return best
}

// Kite a dragon that wandered into the player's room: run the away-vector at
// full speed (the dot is faster than every cart dragon — 1.8 vs ≤1.5); when a
// wall pins the flee, sweep one axis, and when the sweep still cannot free it,
// EVICT: run for the exit whose anchor sits farthest from the dragon into a
// calm neighbour. Escape wins outright: jaws shut beyond 30 px, so the #3441
// follow law leaves a chased-at-distance dragon behind, and the cross law
// waits for the room to empty before the route walks back in. True when the
// coast is clear (dragon left, died, or out of DODGE_SAFE), false on death.
function* dodge(sim, cap = 1500) {
    const p = sim.player
    // #3489 — honest pin law. Collision jitter shifts the dot ±1 px per tick
    // against stone AND against a following chaser, so per-tick "moved" checks
    // and "+0.5 px gained" releases both lie: the seed 7 V1 dot oscillated at
    // the Blue Labyrinth's top-right corner for ~160 ticks (always moving,
    // never escaping) while Yorgle climbed the right column into its back.
    // Progress is measured per WINDOW: if the gap to the jaws has not grown
    // by ~10 px in 24 ticks, the room is trying to kill us — EVICT.
    let pinned = 0, winDist = null, winTick = -99
    for (let i = 0; i < cap; i++) {
        if (sim.won) return true
        if (sim.dead) return false
        const t = roomThreat(sim)
        if (!t || t.dist > DODGE_SAFE) return true
        if (winDist === null || i - winTick >= 24) {
            if (winDist !== null) pinned = t.dist < winDist + 10 ? pinned + 1 : 0
            winDist = t.dist; winTick = i
        }
        const ax = p.x - t.d.x, ay = p.y - t.d.y
        const n = Math.hypot(ax, ay) || 1
        const rx = p.x, ry = p.y, r0 = sim.room
        yield { dx: (ax / n) * S, dy: (ay / n) * S }
        if (sim.room !== r0) return true   // slipped out a doorway — follower stays (jaws shut)
        if (sim.dead || sim.won) continue
        if (p.x === rx && p.y === ry) {
            // pinned against stone: sweep one axis at a time until free again
            const sweep = [[S, 0], [-S, 0], [0, S], [0, -S]][i % 4]
            yield { dx: sweep[0], dy: sweep[1] }
            if (sim.room !== r0) return true
        }
        if (pinned >= 2) {
            // EVICT: a doorway into a calm neighbour room — the NEAREST one.
            // Exposure time is path length over speed, so the short road out
            // beats the road away from the dragon's nose: a far door through
            // maze bars loses the sprint even starting farther from the jaws.
            // cellPath length is the honest measure — Manhattan lies in a maze.
            const calm = neighbors(sim, r0)
                .map(([d, to]) => ({ d, to, a: ANCHORS[d][0] }))
                .filter((e) => !sim.dragons.some((dg) => dg.alive && dg.room === e.to))
                .map((e) => ({ ...e, len: cellPath(sim, p.x + p.w / 2, p.y + p.h / 2, e.a[0] + p.w / 2, e.a[1] + p.h / 2).length }))
                .filter((e) => e.len > 0)
                .sort((A, B) => A.len - B.len
                    || Math.hypot(B.a[0] - t.d.x, B.a[1] - t.d.y) - Math.hypot(A.a[0] - t.d.x, A.a[1] - t.d.y))[0]
            if (!calm) { pinned = 0; winDist = null; continue }
            // cell-path to the exit anchor (sign-steering dies in mazes —
            // #1560 law), threat-blind: the calm door is the escape, and the
            // dot outruns every cart dragon in a straight race (1.8 vs ≤1.0).
            if ((yield* driveTo(sim, calm.a[0], calm.a[1], 1.2, true)) && sim.room !== r0) return true
            pinned = 0; winDist = null
        }
    }
    return false
}

// #3489 — a doorway is no longer a safe threshold: a roaming dragon can sit
// anywhere inside the next room and close the instant you arrive. Before
// pushing through, wait for `want` to be dragon-free (whole room, not just
// the landing spot), capped so a loitering hunter cannot deadlock the guide.
function* entryClear(sim, dir, want) {
    for (let i = 0; i < 1500 && !sim.won && !sim.dead; i++) {
        if (!sim.dragons.some((d) => d.alive && d.room === want)) return true
        yield {}
    }
    return !sim.dragons.some((d) => d.alive && d.room === want)
}

function* driveTo(sim, tx, ty, stop = 1.2, ignoreThreat = false) {
    const p = sim.player
    const txc = tx + p.w / 2, tyc = ty + p.h / 2
    let path = [], stuck = 0, slow = 0, lastDc = Infinity
    const plan = () => { path = cellPath(sim, p.x + p.w / 2, p.y + p.h / 2, txc, tyc); stuck = 0 }
    plan()
    // #3489: the room-local cap. A drive inside one room needs ~600 honest
    // ticks end-to-end; 5000 only ever fed the crawl-replan vortex (seed 7 V3
    // burned 20k ticks in driveTo alone). Snags re-plan once, then the
    // caller's own retry law takes over in a moved world.
    for (let i = 0; i < 1800; i++) {
        const th = roomThreat(sim)
        if (!ignoreThreat && th && th.dist <= DODGE_SAFE) { if (!(yield* dodge(sim))) return false; continue }
        const ddx = tx - p.x, ddy = ty - p.y
        if (Math.abs(ddx) <= stop && Math.abs(ddy) <= stop) return true
        let wx = txc, wy = tyc
        while (path.length) {
            const [cx, cy] = path[0]
            // advance only once the player's center is inside the waypoint cell
            if (Math.floor((p.x + p.w / 2) / CELL) === cx && Math.floor((p.y + p.h / 2) / CELL) === cy) { path.shift(); continue }
            wx = cx * CELL + CELL / 2; wy = cy * CELL + CELL / 2
            break
        }
        const dpx = wx - (p.x + p.w / 2), dpy = wy - (p.y + p.h / 2)
        // #3489 — drive along the SAME four axes the cell BFS plans with. A
        // diagonal push at a bar corner catches on the pixel law: the sim
        // slides the dot back, the center cell flips to the neighbour across
        // the bar, and the path target oscillates — a 1 px-per-3-tick crawl
        // that a dragon outruns (the seed 1 V1 escape died this way).
        // Dominant-axis-first walking keeps every push flush with a
        // wall-free single-axis run, exactly what BFS promised.
        let ux = 0, uy = 0
        if (Math.abs(dpx) > 0.3 && Math.abs(dpx) >= Math.abs(dpy)) ux = Math.min(S, Math.abs(dpx)) * Math.sign(dpx)
        else if (Math.abs(dpy) > 0.3) uy = Math.min(S, Math.abs(dpy)) * Math.sign(dpy)
        const r0 = sim.room, px = p.x, py = p.y
        yield { dx: ux, dy: uy }
        if (sim.room !== r0) return true
        if (sim.dead || sim.won) return false
        let moved = p.x !== px || p.y !== py
        if (!moved) {
            // the dominant push hit stone — try the other axis toward the
            // waypoint once (#1560 law)
            const other = ux !== 0
                ? [0, Math.abs(dpy) > 0.3 ? Math.min(S, Math.abs(dpy)) * Math.sign(dpy) : 0]
                : [Math.abs(dpx) > 0.3 ? Math.min(S, Math.abs(dpx)) * Math.sign(dpx) : 0, 0]
            if (other[0] !== 0 || other[1] !== 0) {
                yield { dx: other[0], dy: other[1] }
                if (sim.room !== r0) return true
                if (sim.dead || sim.won) return false
                moved = p.x !== px || p.y !== py
            }
        }
        if (!moved) { if (++stuck > 6) { if (!path.length) return false; plan() } } else stuck = 0
        // crawl guard: a target that doesn't close ~1/6 speed for half a
        // second is a snag, not a road — skip its cell and re-plan.
        const dc = Math.hypot(wx - (p.x + p.w / 2), wy - (p.y + p.h / 2))
        if (dc < lastDc - 0.4) slow = 0
        else if (++slow > 30) { slow = 0; if (path.length > 1) path.shift(); else plan() }
        lastDc = dc
    }
    return false
}

// Push toward a room edge until the transition lands in `want`. #3489: first
// wait for the landing spot to be dragon-free (a roaming dragon can camp the
// doorway), and kite immediately if one closes on the arrival anyway.
// #3489 — live dragons inside a room: the door is only a door when the far
// side is quiet. Entering on top of a resident hands the dot to its jaws
// (seed 1 V1 died in Blue Lab 1 this way), so every seam-cross — script or
// adaptive — first waits out the resident at the doorstep, and only then
// asks the column law. With the sword in hand the room is prey, not peril.
const residents = (sim, room) => sim.dragons.filter((d) => d.alive && d.room === room)

function* cross(sim, dir, want, maxTicks = 400) {
    const v = { up: [0, -S], down: [0, S], left: [-S, 0], right: [S, 0] }[dir]
    if (sim.room !== want && sim.carrying !== 'sword' && residents(sim, want).length) {
        // Calm-entry law: never step onto a dragon without the blade. Wait
        // at the doorstep for the room to empty (roam makes every room
        // quiet eventually; the cap keeps a loitering hunter from
        // deadlocking the route). Fetches that must cross a resident's
        // territory arm the sword first — that is the cart's own answer —
        // so calm-waiting here is the exception path, not the grind.
        let calmRun = 0
        for (let i = 0; i < 1200 && calmRun < 25 && !sim.won && !sim.dead; i++) {
            if (sim.carrying === 'sword') break   // armed while waiting — the room is prey now
            if (roomThreat(sim) && roomThreat(sim).dist <= 20) return false
            calmRun = residents(sim, want).length ? 0 : calmRun + 1
            if (calmRun >= 40) break
            yield {}
        }
        if (residents(sim, want).length && sim.carrying !== 'sword') return false
    }
    // Push-through law: a tail anywhere behind you cannot close while you
    // drive straight at an open column (dot 1.8 vs the fastest jaws 1.0 ×
    // variant scale). Only jaws already ON your back (≤20 px) abort the
    // crossing — that is the one distance where turning mid-stride loses.
    if (sim.room !== want && sim.carrying !== 'sword' && roomThreat(sim) && roomThreat(sim).dist <= 20) return false
    if (sim.room !== want) yield* entryClear(sim, dir, want)
    const from = sim.room
    // #3489: a dodge mid-push can change the room to something that is not
    // `want` — pushing `dir` from there would punch into a third room (seed 2
    // slid from Overworld 5 down into the Dragon Lair this way). Abort instead.
    for (let i = 0; i < maxTicks && sim.room !== want && sim.room === from && !sim.won && !sim.dead; i++) yield { dx: v[0], dy: v[1] }
    if (sim.room === want && !sim.won && !sim.dead && roomThreat(sim)) { if (!(yield* dodge(sim))) return false }
    return sim.room === want
}

// Room graph obeying the player's own laws: portcullis only through an open
// gate, sealed sides only once the bridge is laid, the secret door only after
// the dot rite.
const sideSolid = (room, dir) => ROOMS[room].walls.some((w) => dir === 'up' ? w.y === 0 && w.w === GW
    : dir === 'down' ? w.y + w.h === GH && w.w === GW
    : dir === 'left' ? w.x === 0 && w.h === GH
    : w.x + w.w === GW && w.h === GH)

const neighbors = (sim, room) => {
    const es = []
    for (const d of ['up', 'down', 'left', 'right']) {
        let to = -1
        if (d === 'up' && ROOMS[room].gate && CASTLE_INSIDES[room] !== undefined) {
            if (sim.gateOpen[ROOMS[room].gateKey]) to = CASTLE_INSIDES[room]
        } else {
            const ex = EXITS[room]
            if (ex && ex[d] !== undefined && ex[d] >= 0) to = ex[d]
        }
        if (to < 0) continue
        if (sideSolid(room, d) && !sim.bridged.has(`${room}:${d}`)) continue
        if (!sim.secretOpen && ((room === R.DRAGON_LAIR && to === R.SECRET) || (room === R.SECRET && to === R.DRAGON_LAIR))) continue
        es.push([d, to])
    }
    return es
}

const ANCHORS = {
    up: [[80, 16], [70, 16], [90, 16]],
    down: [[80, GH - 24], [70, GH - 24], [90, GH - 24]],
    left: [[16, SIDE_GAP_Y + SIDE_GAP_H / 2], [16, SIDE_GAP_Y], [16, SIDE_GAP_Y + SIDE_GAP_H]],
    right: [[GW - 24, SIDE_GAP_Y + SIDE_GAP_H / 2], [GW - 24, SIDE_GAP_Y], [GW - 24, SIDE_GAP_Y + SIDE_GAP_H]],
}

// Walk one room edge: an anchor that reaches, then push through the gap.
function* hop(sim, from, to) {
    const edge = neighbors(sim, from).find(([, n]) => n === to)
    if (!edge) return false
    const d = edge[0]
    // #3489: a dodge mid-drive can slip a seam and land in a different
    // room than `from` — pushing the doorway from there would punch into
    // the wrong neighbour. Require the room to still be `from`.
    for (const [ax, ay] of ANCHORS[d]) {
        if ((yield* driveTo(sim, ax, ay)) && sim.room === from) return yield* cross(sim, d, to, 400)
        if (sim.room !== from || sim.dead || sim.won) return false
    }
    return false
}

// Room-to-room walk: prefer paths that never cross a living dragon's room,
// retry on the plain graph when a preferred hop dead-ends.
function* walkTo(sim, to, avoidDragons = true) {
    // #3489 escape law: standing in a resident's room without a sword is the
    // death position, whatever the target. Leave first — nearest calm
    // neighbour — then take the real route from there. (BlackKey in Blue
    // Lab 2 with Yorgle home in Lab 1: the direct hop waits in the kill
    // zone; the cart answer is to be somewhere else while the phase rolls.)
    if (to !== sim.room && sim.carrying !== 'sword' && residents(sim, sim.room).length) {
        const calm = neighbors(sim, sim.room)
            .filter(([, n]) => !sim.dragons.some((dg) => dg.alive && dg.room === n))[0]
        if (calm) {
            if (!(yield* hop(sim, sim.room, calm[1]))) return false
            if (sim.room === to) return true
        }
    }
    const bfs = (skipDragons, from) => {
        const prev = new Map([[from, null]])
        const order = [from]
        for (let i = 0; i < order.length; i++) {
            for (const [, n] of neighbors(sim, order[i])) {
                if (prev.has(n)) continue
                if (skipDragons && n !== to && sim.dragons.some((dg) => dg.alive && dg.room === n)) continue
                prev.set(n, order[i]); order.push(n)
            }
        }
        return prev.has(to) ? prev : null
    }
    for (const skip of (avoidDragons ? [true, false] : [false])) {
        const prev = bfs(skip, sim.room)
        if (!prev) continue
        const path = [to]
        while (prev.get(path[0]) !== null) path.unshift(prev.get(path[0]))
        let ok = true
        // #3489: a dodge can slip the sprite into a neighbour mid-path; the
        // stale BFS no longer matches reality. Bail and re-plan from the room
        // we are actually in instead of pushing from a room the route left.
        for (let i = 0; i + 1 < path.length && ok; i++) {
            if (sim.room !== path[i]) { ok = false; break }
            ok = yield* hop(sim, path[i], path[i + 1])
        }
        if (ok) return sim.room === to
        // the walk slipped a seam: recompute a fresh route from wherever we landed
        if (sim.room !== path[0]) {
            const prev2 = bfs(skip, sim.room)
            if (prev2) {
                const path2 = [to]
                while (prev2.get(path2[0]) !== null) path2.unshift(prev2.get(path2[0]))
                let ok2 = true
                for (let i = 0; i + 1 < path2.length && ok2; i++) {
                    if (sim.room !== path2[i]) { ok2 = false; break }
                    ok2 = yield* hop(sim, path2[i], path2[i + 1])
                }
                if (ok2) return sim.room === to
            }
        }
    }
    return false
}

// #3489 — cart loot can rest ON a wall cell: the classic whiteKey sits on the
// Red Maze bar, so its own cell is solid and cellPath to the exact spot is
// unwinnable (the fetch burned all ten retries on that dead goal). Pickup is
// a rect overlap, so when the exact spot has no path, take the nearest stop
// whose player cell is free and whose box still touches the item — the same
// corner the proven waypoint script drives to (66,86 for the whiteKey).
function* driveOntoItem(sim, item) {
    const p = sim.player
    const touch = () => sim.carrying === item.id
    // every stop whose box overlaps the item, exact spot first
    const stops = [[0, item.x, item.y]]
    for (let oy = -(p.h - 1); oy <= item.h - 1; oy++) {
        for (let ox = -(p.w - 1); ox <= item.w - 1; ox++) {
            if (!ox && !oy) continue
            const tx = Math.max(0, Math.min(GW - p.w, item.x + ox))
            const ty = Math.max(0, Math.min(GH - p.h, item.y + oy))
            stops.push([Math.abs(ox) + Math.abs(oy), tx, ty])
        }
    }
    stops.sort((a, b) => (a[0] || 0) - (b[0] || 0))
    for (const [, tx, ty] of stops) {
        if (sim.dead || sim.won || touch()) return touch()
        if (sim.room !== item.room) {
            // #3489 seam-slip: a drive can graze a door column and warp the dot
            // into the neighbour — walk back before taking the next stop, or
            // the fetch bounces across the seam forever (bridge at Lab 2's
            // bottom edge, blackKey dropped in the door mouth, seed 6 V1).
            if (!(yield* walkTo(sim, item.room))) return false
            if (touch()) return true
        }
        if (!cellPath(sim, p.x + p.w / 2, p.y + p.h / 2, tx + p.w / 2, ty + p.h / 2).length
            && !(tx === item.x && ty === item.y)) continue
        if (yield* driveTo(sim, tx, ty)) {
            if (touch()) return true
            if (sim.room === item.room && !sim.dead && !sim.won) {
                // overlap law fires on the next steps — stand here a beat
                for (let i = 0; i < 6 && !touch() && !sim.dead && !sim.won && sim.room === item.room; i++) yield {}
                if (touch()) return true
            }
        }
        if (touch()) return true
    }
    return false
}

// #3489 — does the shortest room-path to `to` pass through a resident? Gating
// only sees total closure; the corridor is the true risk — Yorgle home in the
// Blue Labyrinth does not gate Black Key (a detour exists) but it does own
// the road a sane route would take.
const corridorBusy = (sim, to) => {
    if (sim.room === to) return residents(sim, to).length > 0
    const prev = new Map([[sim.room, null]])
    const order = [sim.room]
    for (let i = 0; i < order.length; i++) {
        for (const [, n] of neighbors(sim, order[i])) {
            if (!prev.has(n)) { prev.set(n, order[i]); order.push(n) }
        }
    }
    if (!prev.has(to)) return true
    const path = [to]
    while (prev.get(path[0]) !== null) path.unshift(prev.get(path[0]))
    return path.some((r) => residents(sim, r).length > 0)
}

// #3489 — the sword errand: goldKey (Overworld 4) opens the Gold Castle, the
// Gold Foyer holds the blade. Best-effort — the guard cycle is the fallback
// when the ride cannot be armed (the bat absconded with both, say).
function* armSword(sim) {
    if (sim.carrying === 'sword') return true
    const sword = sim.items.find((i) => i.id === 'sword')
    if (!sword || sword.carried) return false
    if (!sim.gateOpen.goldKey) {
        if (!(yield* fetchItem(sim, 'goldKey'))) return false
        if (!(yield* walkTo(sim, R.GOLD_CASTLE))) return false
        if (!(yield* driveTo(sim, 80, 32))) return false
        if (!(yield* openGate(sim, 'goldKey'))) return false
    }
    return yield* fetchItem(sim, 'sword')
}

// Fetch an item wherever it currently is (the shuffle moved it, the bat may
// hold it): walk to its room, drive onto it, retry; when the bat carries it,
// wait in a shelter room holding a loose partner (the swap law) and re-walk.
// #3489: with dragons roaming, the WALK rides with the sword when one is in
// hand (dragon rooms are then passable — the contact law slays anything that
// closes to <14); the sword comes OFF at the item, not at the start, so the
// guarded fetch happens right after the guard died, inside its respawn delay.
// #3489 — a drop on a door threshold spawns the item INSIDE the wall band
// (y = 194 on a 192-tall room — forever unreachable, and a key there dead-
// locks the quest, seeds 6/8 V1). Never hand an item to an edge: stand on
// open floor before releasing.
function* dropCarrySafe(sim) {
    if (!sim.carrying) return
    const p = sim.player
    if (p.y < 20 || p.y > GH - 32 || p.x < 20 || p.x > GW - 24) {
        if (!(yield* driveTo(sim, 80, 100))) return
        if (p.y < 20 || p.y > GH - 32 || p.x < 20 || p.x > GW - 24) return
    }
    yield { drop: true }
    yield {}
}

function* fetchItem(sim, id, depth = 0) {
    const item = sim.items.find((i) => i.id === id)
    const cr = credit(sim)
    const isGrail = id === 'chalice' || id === 'chalice2'
    let armed = false
    for (let attempt = 0; attempt < 10; attempt++) {
        // #3482: both chalices are the goal item — any cup in hand satisfies
        // a cup fetch (and the retry below must never drop one to re-fetch it).
        if (sim.carrying === id || (isGrail && (sim.carrying === 'chalice' || sim.carrying === 'chalice2'))) return true
        if (sim.dead || sim.won) return sim.carrying === id
        // #3489 retry floor: a failed attempt can return synchronously (a
        // blocked hop yields nothing) — ten zero-tick attempts burn the whole
        // quest budget inside one frame. Kite if jaws are close, breathe
        // otherwise, so every retry happens in a moved world.
        if (roomThreat(sim) && roomThreat(sim).dist <= DODGE_SAFE) { if (!(yield* dodge(sim))) return sim.carrying === id }
        else yield {}
        if (sim.carrying && sim.carrying !== 'sword') yield* dropCarrySafe(sim)
        // #3489 sword ride: a wanderer squatting on the loot room or on its
        // only approach is answered the cart's own way — the Gold Foyer sword,
        // whose key waits in Overworld 4 (and Yorgle flees the gold key by
        // his own law). With the blade in hand the walk is the kill: chase
        // the guard into the contact law (<14 px, sim.js), sword OFF at the
        // item so the fetch lands inside the respawn delay. Arming answers
        // EVERY occupied-room fetch, not just fully gated ones — a calm
        // detour exists until a roamer takes the corridor, and the seed
        // scoreboard showed the unarmed roulette loses ~4 seeds in 10.
        if (!armed && id !== 'sword' && id !== 'goldKey' && sim.carrying !== 'sword'
            && (corridorBusy(sim, item.room) || residents(sim, sim.room).length)) {
            armed = true
            yield* armSword(sim)
            if (sim.dead || sim.won) return sim.carrying === id
        }
        // #3489 guard cycle (no blade): a resident hunter can outlast any
        // single doorway wait. Step out to a calm doorstep, wait for a LONG
        // absence — several hundred clear ticks — then take the walk while the
        // room stays quiet.
        if (sim.carrying !== 'sword' && sim.dragons.some((d) => d.alive && d.room === item.room)) {
            const calm = neighbors(sim, item.room)
                .filter(([, n]) => !sim.dragons.some((dg) => dg.alive && dg.room === n))
                .map(([, n]) => n)[0]
            if (calm !== undefined && sim.room !== calm && !(yield* walkTo(sim, calm, false))) continue
            const cap = Math.min(1600, cr.w)
            let clearRun = 0
            for (let i = 0; i < cap && clearRun < 160 && !sim.dead && !sim.won; i++) {
                clearRun = sim.dragons.some((d) => d.alive && d.room === item.room) ? 0 : clearRun + 1
                cr.w--
                yield {}
            }
        }
        if (depth === 0 && sim.bat.carrying === id) {
            // #3489 decoy post: this port's bat swaps its haul for a loose
            // item it bumps INSIDE the player's room — proximity to the dot is
            // irrelevant, but the room is everything. Chasing the bat's exact
            // pixel burned thousands (old law), and camping where the route
            // happened to stand burned thousands more (seed 8 V2 camped in Blue
            // Lab 2 forty thousand ticks while the bat loitered the Gold
            // Foyer). The post that wins is the bat's own room when calm, its
            // doorstep otherwise: plant currency on that floor and let the
            // dwell-time law do the rest — a hunter stays in a room a few
            // hundred ticks, and so does a bat.
            // Currency is filtered: a key is only spendable AFTER its gate is
            // open (seeds died re-locking keeps with keys they still needed),
            // and the same room is offered first — that is usually the decoy
            // this very round planted, back within arm's reach.
            const safeDecoy = () => {
                const pool = ['sword', 'magnet', 'dot',
                    ...(sim.gateOpen.goldKey ? ['goldKey'] : []),
                    ...(sim.gateOpen.blackKey ? ['blackKey'] : []),
                    ...(sim.gateOpen.whiteKey ? ['whiteKey'] : []),
                    'chalice', 'chalice2'].filter((x) => x !== id && x !== 'bridge')
                return pool.find((x) => sim.items.some((i) => i.id === x && !i.carried && i.room === sim.room))
                    || pool.find((x) => sim.items.some((i) => i.id === x && !i.carried))
            }
            let traded = false
            // #3524 patient currency: currency planted at a post stays the
            // trade bait. Re-fetching every round left the post EMPTY exactly
            // when a den-camped bat came out (the seed 19/21/22/29 bridge
            // burns): the visit landed, the wait expired, and the next march
            // abandoned the plant it had just made. A round that finds its own
            // bait still lying at this post skips the errand and sits the wait
            // again — the swap fires the tick the bat steps in, whenever that
            // is. The march-order is untouched: currency, then post, then the
            // dwell wait (V2 seed 2 proves trading on time beats chasing).
            let bait = null
            let baitRoom = -1
            for (let c = 0; c < 8 && sim.bat.carrying === id && !sim.dead && !sim.won && cr.w > 400; c++) {
                if (roomThreat(sim) && roomThreat(sim).dist <= DODGE_SAFE) { if (!(yield* dodge(sim))) break }
                const br = sim.bat.room
                const calmBatRoom = !residents(sim, br).length
                const post = calmBatRoom ? br
                    : neighbors(sim, br).map(([, n]) => n).find((n) => !residents(sim, n).length)
                if (post === undefined) continue   // the bat sits deep in a den — revisit later
                const baitOut = bait !== null && post === baitRoom
                    && sim.items.some((i) => i.id === bait && !i.carried && i.room === post)
                if (!sim.carrying && !baitOut) {
                    const decoyId = safeDecoy()
                    if (!decoyId) break
                    if (!(yield* fetchItem(sim, decoyId, 1))) break
                }
                if (sim.room !== post && !(yield* walkTo(sim, post))) continue
                if (sim.room !== post) continue
                if (sim.carrying) {
                    bait = sim.carrying; baitRoom = post
                    yield* dropCarrySafe(sim)      // plant on the post's open floor
                    if (sim.carrying) { bait = null; break }  // refused at an edge — re-plan
                } else if (!baitOut) continue      // hand empty, nothing planted — re-plan
                // A long wait at an EMPTY post is camping, not trading (that
                // is the shape of the 19k-tick burn, seed 7 V3): spend the
                // dwell-length wait only while the bat actually occupies the
                // post; when it is elsewhere, hold the step and re-march.
                let burst = sim.bat.room === post ? 700 : 350
                while (burst > 0 && cr.w > 0 && sim.bat.carrying === id && !sim.dead && !sim.won) {
                    burst--; cr.w--
                    const th = roomThreat(sim)
                    if (th && th.dist <= DODGE_SAFE) break
                    if (sim.carrying) break        // a stray landed in hand — replant fresh
                    if (sim.room !== post) break   // slipped a seam — re-march
                    yield {}
                }
                if (sim.bat.carrying !== id) { traded = true; break }
            }
            if (!traded) continue
        }
        if (!(yield* walkTo(sim, item.room))) continue
        // riding: close the gap and let the contact law do the slaying
        if (sim.carrying === 'sword') {
            for (let round = 0; round < 6 && !sim.dead && !sim.won; round++) {
                const g = roomDragon(sim)
                if (!g || g.dist < 12) break
                yield* driveTo(sim, g.d.x, g.d.y, 10, true)
                if (!sim.dragons.some((d) => d.alive && d.room === sim.room)) break
            }
        }
        if (sim.carrying === 'sword') yield* dropCarrySafe(sim)
        if (!(yield* driveOntoItem(sim, item))) continue
        if (sim.carrying === id) return true
    }
    return sim.carrying === id
}

// Drop the carried key at its castle threshold and wait for the portcullis.
function* openGate(sim, keyId) {
    yield { drop: true }
    for (let i = 0; i < 4 && !sim.gateOpen[keyId]; i++) yield {}
    return sim.gateOpen[keyId] === true
}

// #3482 — two Grails ride the board (the duplicate sits in the open Blue
// Castle) and either one home wins. Fetch the CUP THE ROUTE IS NEARER: in the
// shuffle the original can be re-homed across the map or hoarded by the bat,
// while the pin copy waits by the road. Reachability is read on the same
// gated graph the walk uses, so a cup behind a closed keep is skipped honestly.
function* fetchGrail(sim) {
    if (sim.carrying === 'chalice' || sim.carrying === 'chalice2') return true
    const reach = new Map([[sim.room, 0]])
    const order = [sim.room]
    for (let i = 0; i < order.length; i++) {
        for (const [, n] of neighbors(sim, order[i])) {
            if (!reach.has(n)) { reach.set(n, reach.get(order[i]) + 1); order.push(n) }
        }
    }
    const cups = sim.items
        .filter((i) => i.id === 'chalice' || i.id === 'chalice2')
        .map((i) => ({ id: i.id, d: reach.has(i.room) ? reach.get(i.room) : Infinity }))
        .sort((a, b) => a.d - b.d)
    for (const c of cups) {
        if (c.d === Infinity) continue
        if (yield* fetchItem(sim, c.id)) return true
    }
    return sim.carrying === 'chalice' || sim.carrying === 'chalice2'
}

// The full quest, start to finish. Returns { ok, why } — the honest verdict
// the seat reports when the guide runs out of proven road.
function* runRoute(sim) {
    // #3489 arm first: the cart's opening is goldKey → Gold Castle → sword.
    // Yorgle flees the gold key by his own law, and once the blade is in
    // hand the corridor rooms are prey, not peril — the route stops waiting
    // at doors entirely. Best-effort: if the errand fails (bat took the
    // key, shuffle re-homed it badly) the calm-wait laws below still work.
    yield* armSword(sim)
    // #3489 resume law: the planner reads the LIVE world — a gate already
    // open stays open, a bridge already laid stays laid — so a hand-over
    // from the scripted map mid-quest resumes exactly where the road left
    // off instead of re-running errands the world has already done.
    if (!sim.gateOpen.blackKey) {
        if (!(yield* fetchItem(sim, 'blackKey'))) return { ok: false, why: 'blackKey' }
        if (!(yield* walkTo(sim, R.BLACK_CASTLE))) return { ok: false, why: 'to black gate' }
        if (!(yield* driveTo(sim, 80, 32))) return { ok: false, why: 'black threshold' }
        if (!(yield* openGate(sim, 'blackKey'))) return { ok: false, why: 'gateB' }
    }
    if (!sim.bridged.has(`${R.BLACK_FOYER}:down`)) {
        if (!(yield* fetchItem(sim, 'bridge'))) return { ok: false, why: 'bridge' }
        if (!(yield* walkTo(sim, R.BLACK_FOYER))) return { ok: false, why: 'to black foyer' }
        if (!(yield* cross(sim, 'down', R.RED_LAB_1))) {
            // the bat may have lifted the bridge on the walk — the stone floor
            // answers only to the bridge, so recover it and try the drop again.
            if (!(yield* recover(sim, 'bridge', 80, GH - 24))) return { ok: false, why: 'red floor' }
            if (!(yield* cross(sim, 'down', R.RED_LAB_1))) return { ok: false, why: 'red floor' }
        }
    }
    if (!sim.gateOpen.whiteKey) {
        if (!(yield* fetchItem(sim, 'whiteKey'))) return { ok: false, why: 'whiteKey' }
        if (!(yield* walkTo(sim, R.WHITE_CASTLE))) return { ok: false, why: 'to white gate' }
        if (!(yield* driveTo(sim, 80, 32))) return { ok: false, why: 'white threshold' }
        if (!(yield* openGate(sim, 'whiteKey'))) return { ok: false, why: 'gateW' }
    }
    if (!(yield* fetchGrail(sim))) return { ok: false, why: 'chalice' }
    if (!sim.won && !(yield* walkTo(sim, R.GOLD_CASTLE))) return { ok: false, why: 'home' }
    for (let i = 0; i < 400 && !sim.won; i++) {
        const th = roomThreat(sim)
        if (th && th.dist <= DODGE_SAFE) { if (!(yield* dodge(sim))) return { ok: false, why: 'died at home' }; continue }
        yield { dx: 0, dy: -S }
        if (sim.dead) return { ok: false, why: 'died at home' }
    }
    return sim.won
        ? { ok: true, why: 'won' }
        : { ok: false, why: `end room=${sim.room} carry=${sim.carrying}` }
}

// ---- fixed-map script (V1 CLASSIC / V2 FAST): the waypoint route from
// adventurecheck's winRun, ported one-for-one. Teleports became real drives —
// the guide never jumps the sprite; the script only emits legal inputs.
// (V3 SHUFFLE re-homes the loot, where this script cannot look, so those runs
// dispatch to the adaptive runRoute below instead.)
function* scriptCore(sim) {
    const P = sim.player
    // #3489: the fixed map yields to the planner the moment the roam law
    // disturbs its lane — a dragon inside the player's room (checked before
    // and after every segment) bails to scriptRun's adaptive fallback, which
    // resumes the quest from live state, instead of fighting in corridors.
    const R1 = function* (tx, ty) {
        if (roomThreat(sim)) return false
        const r = yield* driveTo(sim, tx, ty)
        return r && !roomThreat(sim)
    }
    const W = function* (_s, dir, want, max) {
        if (roomThreat(sim)) return false
        const r = yield* cross(sim, dir, want, max)
        return r && !roomThreat(sim) && sim.room === want
    }
    const OG = function* (k) {
        const r = yield* openGate(sim, k)
        return r && !roomThreat(sim)
    }
    // trip 1: blackKey into front of the black gate
    if (!(yield* R1(80, P.y))) return { ok: false, why: 'castle align' }
    if (!(yield* W(sim, 'down', R.OVERWORLD_1))) return { ok: false, why: 'castle exit' }
    if (!(yield* W(sim, 'down', R.OVERWORLD_2))) return { ok: false, why: 'ow2' }
    if (!(yield* R1(P.x, 90))) return { ok: false, why: 'ow2 align' }
    if (!(yield* W(sim, 'left', R.BLUE_LAB_1))) return { ok: false, why: 'lab1a' }
    if (!(yield* R1(140, 90)) || !(yield* R1(140, 170)) || !(yield* R1(80, 170))) return { ok: false, why: 'lab1 descent' }
    if (!(yield* W(sim, 'down', R.BLUE_LAB_2))) return { ok: false, why: 'lab2' }
    if (!(yield* R1(76, 92))) return { ok: false, why: 'blackKey spot' }
    if (sim.carrying !== 'blackKey') {
        if (!(yield* recover(sim, 'blackKey', 76, 92))) return { ok: false, why: 'no blackKey' }
    }
    if (!(yield* R1(80, 16))) return { ok: false, why: 'lab2 exit' }
    if (!(yield* W(sim, 'up', R.BLUE_LAB_1))) return { ok: false, why: 'lab1b' }
    if (!(yield* R1(140, 168)) || !(yield* R1(140, 44)) || !(yield* R1(110, 16)) || !(yield* R1(80, 16))) return { ok: false, why: 'lab1 climb' }
    if (!(yield* W(sim, 'up', R.OVERWORLD_2))) return { ok: false, why: 'ow2b' }
    if (!(yield* R1(P.x, 90))) return { ok: false, why: 'ow2b align' }
    if (!(yield* W(sim, 'right', R.OVERWORLD_4))) return { ok: false, why: 'ow4' }
    if (!(yield* R1(80, P.y))) return { ok: false, why: 'ow4 align' }
    if (!(yield* W(sim, 'down', R.OVERWORLD_3))) return { ok: false, why: 'ow3' }
    if (!(yield* W(sim, 'down', R.BLACK_CASTLE))) return { ok: false, why: 'castleB' }
    if (!(yield* R1(80, 32))) return { ok: false, why: 'black threshold' }
    if (!(yield* OG('blackKey'))) return { ok: false, why: 'gateB' }
    if (!(yield* R1(65, 24))) return { ok: false, why: 'key dodge' }
    // trip 2: bridge through the black foyer floor, into the Red Maze
    if (!(yield* W(sim, 'down', R.OVERWORLD_3))) return { ok: false, why: 'castleB out' }
    if (!(yield* W(sim, 'up', R.OVERWORLD_2))) return { ok: false, why: 'ow2c' }
    if (!(yield* R1(95, 70))) return { ok: false, why: 'bridge corner' }
    if (!(yield* R1(96, 76))) return { ok: false, why: 'bridge spot' }
    if (sim.carrying !== 'bridge') {
        if (!(yield* recover(sim, 'bridge', 96, 76))) return { ok: false, why: 'no bridge' }
    }
    if (!(yield* R1(P.x, 90))) return { ok: false, why: 'ow3 align' }
    if (!(yield* W(sim, 'down', R.OVERWORLD_3))) return { ok: false, why: 'ow3c' }
    if (!(yield* W(sim, 'down', R.BLACK_CASTLE))) return { ok: false, why: 'castleB2' }
    if (!(yield* W(sim, 'up', R.BLACK_FOYER))) return { ok: false, why: 'foyerB' }
    if (!(yield* W(sim, 'down', R.RED_LAB_1))) return { ok: false, why: 'red floor' }
    if (!(yield* R1(140, 12))) return { ok: false, why: 'red enter' }
    if (!(yield* R1(140, 86))) return { ok: false, why: 'red right column' }
    yield { drop: true }                       // no-op: the bridge placed itself at the crossing
    if (sim.carrying !== null) return { ok: false, why: 'bridge drop failed' }
    if (!(yield* R1(66, 86))) return { ok: false, why: 'red lower corridor' }
    if (sim.carrying !== 'whiteKey') {
        if (!(yield* recover(sim, 'whiteKey', 66, 86))) return { ok: false, why: 'no whiteKey' }
    }
    if (!(yield* R1(140, 86))) return { ok: false, why: 'red lower right' }
    if (!(yield* R1(140, 12))) return { ok: false, why: 'red right column up' }
    if (!(yield* R1(80, 12))) return { ok: false, why: 'red top exit' }
    if (!(yield* W(sim, 'up', R.BLACK_FOYER))) return { ok: false, why: 'foyer out red' }
    if (!(yield* R1(65, 24))) return { ok: false, why: 'key dodge 2' }
    // trip 3: white key to its gate, chalice, and the ride home
    if (!(yield* W(sim, 'up', R.BLACK_CASTLE))) return { ok: false, why: 'castleB3' }
    if (!(yield* R1(P.x, 150))) return { ok: false, why: 'castleB3 align' }
    if (!(yield* W(sim, 'down', R.OVERWORLD_3))) return { ok: false, why: 'ow3b' }
    if (!(yield* R1(P.x, 90))) return { ok: false, why: 'ow3b align' }
    if (!(yield* W(sim, 'right', R.OVERWORLD_4))) return { ok: false, why: 'ow4b' }
    if (!(yield* R1(P.x, 90))) return { ok: false, why: 'ow4b align' }
    if (!(yield* W(sim, 'right', R.WHITE_CASTLE))) return { ok: false, why: 'castleW' }
    if (!(yield* R1(80, 32))) return { ok: false, why: 'white threshold' }
    if (!(yield* OG('whiteKey'))) return { ok: false, why: 'gateW' }
    if (!(yield* W(sim, 'up', R.WHITE_FOYER))) return { ok: false, why: 'foyerW' }
    if (!(yield* R1(80, 88))) return { ok: false, why: 'chalice spot' }
    if (sim.carrying !== 'chalice' && sim.carrying !== 'chalice2') {
        // #3482: a duplicate cup picked up along the way IS the goal item —
        // do not trade it for the original, drive it home.
        if (!(yield* recover(sim, 'chalice', 80, 88))) return { ok: false, why: 'no chalice' }
    }
    if (!(yield* R1(80, 12))) return { ok: false, why: 'foyerW exit' }
    if (!(yield* W(sim, 'up', R.WHITE_CASTLE))) return { ok: false, why: 'castleW out' }
    if (!(yield* R1(P.x, 150))) return { ok: false, why: 'castleW align' }
    if (!(yield* W(sim, 'down', R.OVERWORLD_4))) return { ok: false, why: 'ow4 home' }
    if (!(yield* R1(80, P.y))) return { ok: false, why: 'ow4 home align' }
    if (!sim.won && !(yield* W(sim, 'up', R.OVERWORLD_1))) return { ok: false, why: 'ow1 home' }
    for (let i = 0; i < 400 && !sim.won; i++) {
        const th = roomThreat(sim)
        if (th && th.dist <= DODGE_SAFE) { if (!(yield* dodge(sim))) return { ok: false, why: 'died at home' }; continue }
        yield { dx: 0, dy: -S }
        if (sim.dead) return { ok: false, why: 'died at home' }
    }
    return sim.won
        ? { ok: true, why: 'won' }
        : { ok: false, why: `end room=${sim.room} carry=${sim.carrying} dead=${sim.dead}` }
}

// #3489 — the fixed map bends, the guide does not quit. With dragons roaming
// (the cart's own law), a waypoint script can be pushed off its proven road:
// a wandering hunter blocks a corridor, a kite escapes through another door.
// When the script cannot finish and the run is still alive, hand over to the
// adaptive planner — it re-reads the live world (carried item, open gates,
// placed bridge, item locations) and walks the quest from wherever the dot
// stands, recovering the same way it already recovers from bat thefts.
function* scriptRun(sim) {
    yield* armSword(sim)   // #3489 arm first — see runRoute
    const res = yield* scriptCore(sim)
    if (res.ok || sim.dead || sim.won) return res
    return yield* runRoute(sim)
}

// Bat-theft recovery (the #1560 law, ported): a drop always lands in the
// player's room, so wait where a loose partner sits (the swap), walk to the
// drop spot, and come back to the route's continuation point.
function* recover(sim, id, backX, backY) {
    if (sim.carrying === id) return true
    const item = sim.items.find((i) => i.id === id)
    const startRoom = sim.room
    if (item.carried) {
        const prev = new Map([[startRoom, null]])
        const order = [startRoom]
        for (let i = 0; i < order.length; i++) {
            for (const [, n] of neighbors(sim, order[i])) {
                if (!prev.has(n)) { prev.set(n, order[i]); order.push(n) }
            }
        }
        const shelter = order.find((room) =>
            sim.items.some((i) => i.id !== id && i.room === room && !i.carried) &&
            !sim.dragons.some((dg) => dg.alive && dg.room === room))
        if (shelter === undefined) return false
        if (!(yield* walkTo(sim, shelter))) return false
        const cr = credit(sim)
        const cap = Math.min(3000, cr.w)
        for (let i = 0; i < cap && sim.bat.carrying === id; i++) {
            cr.w--
            yield {}
            if (sim.dead || sim.won) return false
        }
        if (sim.bat.carrying === id) return false
    }
    if (!(yield* walkTo(sim, item.room))) return false
    if (!(yield* driveTo(sim, item.x, item.y))) return false
    if (sim.carrying !== id) return false  // re-stolen mid-walk
    if (!(yield* walkTo(sim, startRoom))) return false
    return yield* driveTo(sim, backX, backY)
}

// #1845 watch polish — the seat voice: the guide announces WHICH driver took
// the wheel, so the ear knows what it's about to watch. V1/V2 (fixed maps) run
// the proven waypoint script; V3 re-homes loot, so its adaptive route gets its
// own note. Same dispatch law as makeRoute below — one brain, two voices. The
// shared handoff blip (utils/watch.js) stays untouched: this stacks after it.
export function watchVoice(sim) {
    return sim.variant >= 3 ? { driver: 'adaptive', tone: 880 } : { driver: 'script', tone: 587 }
}

// Seat factory: makeRoute(sim) -> { next() }. The seat feeds the LIVE sim
// every tick; next() returns { done, value: input } while the guide drives,
// and { done: true, value: verdict } when the route is finished or given up.
// V1/V2 (fixed maps) run the proven waypoint script; V3 (shuffle) runs the
// adaptive route — both ported from the drivers adventurecheck proves with.
export function makeRoute(sim) {
    CREDIT.set(sim, { w: 30000 })   // #3489 — one wait-credit pool per drive
    const gen = sim.variant >= 3 ? runRoute(sim) : scriptRun(sim)
    let result = { ok: false, why: 'not started' }
    return {
        next() {
            const r = gen.next()
            if (r.done) result = r.value || result
            return r
        },
        result: () => result,
    }
}
