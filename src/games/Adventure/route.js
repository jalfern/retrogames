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
    let pinned = 0, lastDist = Infinity
    for (let i = 0; i < cap; i++) {
        if (sim.won) return true
        if (sim.dead) return false
        const t = roomThreat(sim)
        if (!t || t.dist > DODGE_SAFE) return true
        const ax = p.x - t.d.x, ay = p.y - t.d.y
        const n = Math.hypot(ax, ay) || 1
        const rx = p.x, ry = p.y, r0 = sim.room
        yield { dx: (ax / n) * S, dy: (ay / n) * S }
        if (sim.room !== r0) return true   // slipped out a doorway — follower stays (jaws shut)
        if (sim.dead || sim.won) continue
        // #3489: collision jitter in a corner shifts the dot ±1 px per tick —
        // that fake progress must NOT clear the pinned count, or EVICT never
        // fires and the guide flees into stone forever (seed 1 burned 48k
        // ticks this way). Only real distance gained releases the pin.
        const gained = t.dist > lastDist + 0.5
        if (p.x === rx && p.y === ry) {
            // pinned against stone: sweep one axis at a time until free again
            const sweep = [[S, 0], [-S, 0], [0, S], [0, -S]][i % 4]
            yield { dx: sweep[0], dy: sweep[1] }
            if (sim.room !== r0) return true
            if (++pinned < 8) { lastDist = t.dist; continue }
            // EVICT: the farthest doorway into a calm neighbour room
            const calm = neighbors(sim, r0)
                .map(([d, to]) => ({ d, to, a: ANCHORS[d][0] }))
                .filter((e) => !sim.dragons.some((dg) => dg.alive && dg.room === e.to))
                .sort((A, B) => Math.hypot(B.a[0] - t.d.x, B.a[1] - t.d.y)
                    - Math.hypot(A.a[0] - t.d.x, A.a[1] - t.d.y))[0]
            if (!calm) { pinned = 0; lastDist = t.dist; continue }
            // cell-path to the exit anchor (sign-steering dies in mazes —
            // #1560 law), threat-blind: the calm door is the escape, and a
            // cornered chaser cannot close while the dot is at full speed.
            if ((yield* driveTo(sim, calm.a[0], calm.a[1], 1.2, true)) && sim.room !== r0) return true
            pinned = 0; lastDist = t.dist
        } else if (gained) pinned = 0
        lastDist = t.dist
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
    let path = [], stuck = 0
    const plan = () => { path = cellPath(sim, p.x + p.w / 2, p.y + p.h / 2, txc, tyc); stuck = 0 }
    plan()
    for (let i = 0; i < 5000; i++) {
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
        const ux = Math.abs(dpx) > 0.3 ? Math.min(S, Math.abs(dpx)) * Math.sign(dpx) : 0
        const uy = Math.abs(dpy) > 0.3 ? Math.min(S, Math.abs(dpy)) * Math.sign(dpy) : 0
        const r0 = sim.room, px = p.x, py = p.y
        yield { dx: ux, dy: uy }
        if (sim.room !== r0) return true
        if (sim.dead || sim.won) return false
        let moved = p.x !== px || p.y !== py
        if (!moved && (ux !== 0 || uy !== 0)) {
            yield { dx: ux, dy: 0 }
            if (sim.room !== r0) return true
            if (sim.dead || sim.won) return false
            moved = p.x !== px || p.y !== py
        }
        if (!moved && uy !== 0) {
            yield { dx: 0, dy: uy }
            if (sim.room !== r0) return true
            if (sim.dead || sim.won) return false
            moved = p.x !== px || p.y !== py
        }
        if (!moved) { if (++stuck > 6) { if (!path.length) return false; plan() } } else stuck = 0
    }
    return false
}

// Push toward a room edge until the transition lands in `want`. #3489: first
// wait for the landing spot to be dragon-free (a roaming dragon can camp the
// doorway), and kite immediately if one closes on the arrival anyway.
function* cross(sim, dir, want, maxTicks = 400) {
    const v = { up: [0, -S], down: [0, S], left: [-S, 0], right: [S, 0] }[dir]
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
    if (yield* driveTo(sim, item.x, item.y)) return true
    if (sim.dead || sim.won || sim.room !== item.room) return sim.carrying === item.id
    const stops = []
    for (let oy = -(p.h - 1); oy <= item.h - 1; oy++) {
        for (let ox = -(p.w - 1); ox <= item.w - 1; ox++) {
            if (!ox && !oy) continue
            const tx = Math.max(0, Math.min(GW - p.w, item.x + ox))
            const ty = Math.max(0, Math.min(GH - p.h, item.y + oy))
            stops.push([Math.abs(ox) + Math.abs(oy), tx, ty])
        }
    }
    stops.sort((a, b) => a[0] - b[0])
    const pxx = p.x + p.w / 2, pyy = p.y + p.h / 2
    for (const [, tx, ty] of stops) {
        if (!cellPath(sim, pxx, pyy, tx + p.w / 2, ty + p.h / 2).length) continue
        if (yield* driveTo(sim, tx, ty)) return true
        if (sim.dead || sim.won || sim.room !== item.room) return sim.carrying === item.id
    }
    return false
}

// #3489 — is every dragon-free road to `to` closed? (A resident in `to`
// itself counts as gated: the room must be entered past its jaws.)
const dragonGated = (sim, to) => {
    if (sim.room === to) return sim.dragons.some((d) => d.alive && d.room === to)
    const prev = new Map([[sim.room, null]])
    const order = [sim.room]
    for (let i = 0; i < order.length; i++) {
        for (const [, n] of neighbors(sim, order[i])) {
            if (prev.has(n) || sim.dragons.some((d) => d.alive && d.room === n)) continue
            prev.set(n, order[i]); order.push(n)
        }
    }
    return !prev.has(to)
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
function* fetchItem(sim, id) {
    const item = sim.items.find((i) => i.id === id)
    let armed = false
    for (let attempt = 0; attempt < 10; attempt++) {
        if (sim.carrying === id) return true
        if (sim.dead || sim.won) return sim.carrying === id
        if (sim.carrying && sim.carrying !== 'sword') yield { drop: true }
        // #3489 sword ride: a wanderer squatting on the loot room or on its
        // only approach is answered the cart's own way — the Gold Foyer sword,
        // whose key waits in Overworld 4. With the blade in hand the walk is
        // the kill: chase the guard into the contact law (<14 px, sim.js),
        // sword OFF at the item so the fetch lands inside the respawn delay.
        if (!armed && id !== 'sword' && id !== 'goldKey' && sim.carrying !== 'sword' && dragonGated(sim, item.room)) {
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
            let clearRun = 0
            for (let i = 0; i < 4000 && clearRun < 260 && !sim.dead && !sim.won; i++) {
                clearRun = sim.dragons.some((d) => d.alive && d.room === item.room) ? 0 : clearRun + 1
                yield {}
            }
        }
        if (sim.bat.carrying === id) {
            const prev = new Map([[sim.room, null]])
            const order = [sim.room]
            for (let i = 0; i < order.length; i++) {
                for (const [, n] of neighbors(sim, order[i])) {
                    if (!prev.has(n)) { prev.set(n, order[i]); order.push(n) }
                }
            }
            const shelter = order.find((room) =>
                sim.items.some((i) => i.id !== id && i.room === room && !i.carried) &&
                !sim.dragons.some((dg) => dg.alive && dg.room === room))
            if (shelter === undefined) continue
            if (!(yield* walkTo(sim, shelter))) continue
            for (let i = 0; i < 8000 && sim.bat.carrying === id; i++) {
                yield {}
                if (sim.dead || sim.won) return sim.carrying === id
            }
            if (sim.bat.carrying === id) continue
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
        if (sim.carrying === 'sword') yield { drop: true }
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

// The full quest, start to finish. Returns { ok, why } — the honest verdict
// the seat reports when the guide runs out of proven road.
function* runRoute(sim) {
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
    if (!(yield* fetchItem(sim, 'chalice'))) return { ok: false, why: 'chalice' }
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
    if (sim.carrying !== 'chalice') {
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
        for (let i = 0; i < 8000 && sim.bat.carrying === id; i++) {
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
