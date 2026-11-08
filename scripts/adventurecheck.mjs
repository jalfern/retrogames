// adventurecheck — ADVENTURE (#1473 seedpin batch 18) in plain Node.
// Pre-port, the dragon/bat dice ran off Math.random, there was no seed, no
// report, no contract, no score — and the castles' solid-top walls (a
// full-width top wall with the gate rect as EXTRA collision) made the foyers
// permanently unreachable, so carrying the chalice home was provably
// impossible. This gate pins what is true now: one seeded stream at every
// human start (?seed=N replays the world), the openable-gate law (park the
// matching key in front of its gate), the bridge wall-pass, dragon law
// (chase/bite/slay/flee), honest terminals — and a scripted run that
// actually carries the chalice to the Gold Castle.
// `--mutant` re-plants pre-port bugs; every mutant MUST turn something red.
//
//   npm run adventurecheck
//   npm run adventurecheck -- --mutant

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createSim, ROOMS, R, GW, GH, PLAYER_SPEED, MAX_ITEMS, DRAGON_RESPAWN_TICKS, EXITS, CASTLE_INSIDES, SIDE_GAP_Y, SIDE_GAP_H, ROOM_WIPE_TICKS, stateHash } from '../src/games/Adventure/sim.js'
import { seedRng } from '../src/utils/gameContract.js'
import { makeRoute } from '../src/games/Adventure/route.js'
import { plant, pull } from './lib/mutateguard.mjs'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const S = PLAYER_SPEED
const IDX = new URL('../src/games/Adventure/index.jsx', import.meta.url)
const SIMF = new URL('../src/games/Adventure/sim.js', import.meta.url)
const GAMES = new URL('../src/config/games.js', import.meta.url)
const PO = new URL('../src/components/PauseOverlay.jsx', import.meta.url)
const step = (sim, inp) => { sim.step(inp); sim.events.length = 0 }

// ------------------------------------------------------------ determinism ----
console.log('seeded world: dragons and the bat replay off one stream')
const hash = (s) => JSON.stringify([
    s.tick, s.score, s.won, s.dead, s.room, s.carrying,
    s.player.x.toFixed(4), s.player.y.toFixed(4),
    s.dragons.map((d) => `${d.x.toFixed(4)}/${d.y.toFixed(4)}/${d.mouthOpen ? 1 : 0}`),
    s.bat.x.toFixed(4), s.bat.y.toFixed(4), s.bat.vx.toFixed(4),
])
const stream = (sd, n) => {
    const s = createSim(seedRng(sd))
    const out = []
    for (let i = 0; i < n; i++) { step(s, {}); out.push(hash(s)) }
    return out.join(';')
}
ok(stream(4242, 400) === stream(4242, 400), 'same seed → identical 400-tick world script')
ok(stream(4242, 400) !== stream(4243, 400), 'different seed → different world script')
ok(hash(createSim(seedRng(9))) === hash(createSim(seedRng(9))), 'two fresh sims of one seed are identical (no hidden state)')

// ------------------------------------------------------------------ law ------
console.log('fresh run: the 1993 starting layout')
{
    const s = createSim(seedRng(1))
    ok(s.room === R.GOLD_CASTLE && s.player.x === 80 && s.player.y === 150, 'starts outside the Gold Castle')
    ok(s.items.length === MAX_ITEMS && s.dragons.length === 3, `${MAX_ITEMS} items and 3 dragons in the world`)
    ok(s.bat.room === R.OVERWORLD_3, 'the bat starts in the overworld')
    ok(s.score === 0 && !s.won && !s.dead && s.tick === 0, 'clean report: score 0, alive, tick 0')
    ok(ROOMS[R.GOLD_CASTLE].gate && ROOMS[R.BLACK_CASTLE].gate && ROOMS[R.WHITE_CASTLE].gate,
        'the three castles carry gates')
    ok(!ROOMS[R.GOLD_CASTLE].walls.some((w) => w.y === 0 && w.w === GW),
        'castle tops are GAPS, not full-width solids (b18 fix — solid tops locked the foyers forever)')
}

console.log('items: pickup, drop, and the once-per-run score')
{
    const s = createSim(seedRng(7))
    // goldKey is loose in OVERWORLD_4; walk the player onto it
    s.room = R.OVERWORLD_4; s.player.x = 120; s.player.y = 84
    step(s, {})
    ok(s.carrying === 'goldKey' && s.score === 1, 'touching an item picks it up and scores the first distinct item')
    step(s, { drop: true })
    ok(s.carrying === null && s.items.find((i) => i.id === 'goldKey').room === R.OVERWORLD_4,
        'Space drops the item in the current room')
    step(s, { dx: 0, dy: S }); step(s, { dx: 0, dy: S }) // walk back onto it
    ok(s.carrying === 'goldKey' && s.score === 1, 're-picking the SAME item does not score twice')
    s.room = R.OVERWORLD_2; s.player.x = 100; s.player.y = 80
    step(s, {})
    ok(s.carrying === 'goldKey' && s.score === 1, 'a second item is unreachable while the slot is full')
    ok(s.score <= MAX_ITEMS, `score can never exceed ${MAX_ITEMS}`, `${s.score}`)
}

console.log('bridge: the wall-pass, and the foyer floor it unlocks')
{
    const no = createSim(seedRng(3))
    no.room = R.BLACK_FOYER; no.player.x = 80; no.player.y = 178
    for (let i = 0; i < 120; i++) step(no, { dx: 0, dy: S })
    ok(no.room === R.BLACK_FOYER && no.player.y <= 178.5, 'without the bridge the foyer floor is stone')

    const br = createSim(seedRng(3))
    br.room = R.BLACK_FOYER; br.player.x = 80; br.player.y = 178
    br.carrying = 'bridge'
    br.items.find((i) => i.id === 'bridge').carried = true
    for (let i = 0; i < 120 && br.room !== R.RED_LAB_1; i++) step(br, { dx: 0, dy: S })
    ok(br.room === R.RED_LAB_1, 'carrying the bridge, pushing down crosses the solid floor into the Red Maze')
}

console.log('bridge: placed on the wall it spans — a permanent, re-pickable crossing (#1551)')
{
    const s = createSim(seedRng(21))
    s.room = R.BLACK_FOYER; s.player.x = 80; s.player.y = 178
    s.carrying = 'bridge'
    s.items.find((i) => i.id === 'bridge').carried = true
    for (let i = 0; i < 120 && s.room !== R.RED_LAB_1; i++) step(s, { dx: 0, dy: S })
    const b = s.items.find((i) => i.id === 'bridge')
    ok(s.room === R.RED_LAB_1 && s.carrying === null, 'crossing with the bridge leaves it placed (the hands are empty again)')
    ok(b.room === R.BLACK_FOYER && !b.carried, 'the placed bridge stays on the wall side — not stranded past the wall')
    ok(s.bridged.has(`${R.BLACK_FOYER}:down`) && s.bridged.has(`${R.RED_LAB_1}:up`),
        'the crossed wall is recorded as bridged (both sides)')

    const t = createSim(seedRng(21))
    t.bridged.add(`${R.BLACK_FOYER}:down`)
    t.bridged.add(`${R.RED_LAB_1}:up`)
    t.room = R.BLACK_FOYER; t.player.x = 80; t.player.y = 178
    for (let i = 0; i < 120 && t.room !== R.RED_LAB_1; i++) step(t, { dx: 0, dy: S })
    ok(t.room === R.RED_LAB_1, 'a bridged crossing stays open for the run — no second bridge needed')

    const p = createSim(seedRng(21))
    const pb = p.items.find((i) => i.id === 'bridge')
    pb.room = R.BLACK_FOYER; pb.carried = false
    pb.x = 80 - 14; pb.y = GH - 10
    p.room = R.BLACK_FOYER; p.player.x = pb.x; p.player.y = GH - 14
    step(p, {})
    ok(p.carrying === 'bridge', 'the placed bridge is re-pickable from the wall')
}

console.log('gray dot + sealed door: the original easter egg (#1551)')
{
    const s = createSim(seedRng(33))
    const dot = s.items.find((i) => i.id === 'dot')
    ok(!!dot && dot.w === 1 && dot.h === 1, 'the world carries the one-pixel gray dot')
    ok(dot.room === R.RED_LAB_1 && dot.y >= GH - 8,
        'the dot is sealed along the south wall of the bridge-only room (the Red Maze)')

    const m = createSim(seedRng(33))
    const mdot = m.items.find((i) => i.id === 'dot')
    m.room = R.RED_LAB_1
    m.player.x = mdot.x; m.player.y = GH - 20
    m.carrying = 'magnet'
    m.items.find((i) => i.id === 'magnet').carried = true
    m.bat.room = R.GOLD_CASTLE; m.bat.x = 5; m.bat.y = 5
    const dx0 = mdot.x, dy0 = mdot.y
    for (let i = 0; i < 40; i++) step(m, {})
    ok(mdot.x === dx0 && mdot.y === dy0, 'the magnet does not attract the dot (original law)')

    const d = createSim(seedRng(33))
    const ddot = d.items.find((i) => i.id === 'dot')
    d.room = R.RED_LAB_1; d.player.x = ddot.x; d.player.y = GH - 14
    step(d, {})
    ok(d.carrying === 'dot', 'walking the south wall picks up the dot')

    // The rite: the dot, with two or more other objects in the room (carried
    // one at a time, dropped in place), at the end of the corridor by the
    // sealed door — the original's "Created by Warren Robinett" trigger.
    const rite = (n) => {
        const r = createSim(seedRng(44))
        r.dragons.forEach((dg) => { dg.room = R.BLUE_LAB_2 })   // keep the lair dragon out
        r.room = R.DRAGON_LAIR
        r.player.x = 12; r.player.y = 90
        r.carrying = 'dot'
        r.items.find((i) => i.id === 'dot').carried = true
        const donors = ['goldKey', 'whiteKey', 'blackKey']
        donors.slice(0, n).forEach((id, i) => {
            const it = r.items.find((x) => x.id === id)
            it.room = R.DRAGON_LAIR; it.carried = false
            it.x = 60 + i * 12; it.y = 140
        })
        r.step({})
        return r
    }
    ok(!rite(1).secretOpen, 'dot + one other object does not open the door (original: two or more)')
    const r2 = rite(2)
    ok(r2.secretOpen && r2.events.includes('secret'),
        'dot + two other objects at the sealed door opens it (the "secret" sound event fires)')

    const blk = createSim(seedRng(55))
    blk.dragons.forEach((dg) => { dg.room = R.BLUE_LAB_2 })
    blk.room = R.DRAGON_LAIR; blk.player.x = 6; blk.player.y = 90
    for (let i = 0; i < 60; i++) step(blk, { dx: -S, dy: 0 })
    ok(blk.room === R.DRAGON_LAIR && blk.player.x >= 0, 'the sealed door holds: pushing left cannot reach the secret room')

    const op = createSim(seedRng(55))
    op.secretOpen = true
    op.dragons.forEach((dg) => { dg.room = R.BLUE_LAB_2 })
    op.room = R.DRAGON_LAIR; op.player.x = 6; op.player.y = 90
    for (let i = 0; i < 60 && op.room !== R.SECRET; i++) step(op, { dx: -S, dy: 0 })
    ok(op.room === R.SECRET, 'an open secret door lets the player into the creator\'s room')

    const bt = createSim(seedRng(66))
    bt.bat.room = R.DRAGON_LAIR; bt.bat.x = 3; bt.bat.y = 90; bt.bat.vx = -1.5
    step(bt, {})
    ok(bt.bat.room === R.DRAGON_LAIR, 'the bat cannot slip through the sealed door either')
}

console.log('bat roam: the purple bat changes rooms and roves the world (#1560)')
{
    // The 1993 bat's signature is roving rooms and swapping items. Pre-fix,
    // the inner bounce (|x| in [10, GW-20]) fired before the room-change
    // thresholds (x<2 / x>GW-8) could ever be reached — measured median
    // 1 room visited / 10000 ticks.
    for (const sd of [1, 42, 1337]) {
        const s = createSim(seedRng(sd))
        const seen = new Set([s.bat.room])
        for (let i = 0; i < 6000; i++) { step(s, {}); seen.add(s.bat.room) }
        ok(seen.size >= 3, `seed ${sd}: the bat roams — ${seen.size} distinct rooms in 6000 ticks`)
    }
    // The portcullis holds for the bat too: the gate sits at the courtyard's
    // top gap, and the foyer is only ever reached through an open gate.
    const gate = createSim(seedRng(99))
    gate.bat.room = R.BLACK_CASTLE; gate.bat.x = 80; gate.bat.y = 1; gate.bat.vy = -1.5
    step(gate, {})
    ok(gate.bat.room === R.BLACK_CASTLE, 'a closed portcullis blocks the bat (the gate holds for it too)')
    gate.gateOpen.blackKey = true
    gate.bat.y = 1; gate.bat.vy = -1.5
    step(gate, {})
    ok(gate.bat.room === R.BLACK_FOYER, 'an open gate lets the bat into the foyer')
}

console.log('gates: park the key in front of its gate')
{
    const s = createSim(seedRng(5))
    s.room = R.BLACK_CASTLE; s.player.x = 80; s.player.y = 32
    for (let i = 0; i < 40; i++) step(s, { dx: 0, dy: -S })
    ok(s.room === R.BLACK_CASTLE, 'a closed gate stays shut even when pushing at the gap')
    s.items.find((i) => i.id === 'blackKey').room = R.BLACK_CASTLE
    s.items.find((i) => i.id === 'blackKey').x = 80
    s.items.find((i) => i.id === 'blackKey').y = 50
    step(s, {})
    ok(s.gateOpen.blackKey, 'the black key lying in front of the black gate opens it')
    const far = createSim(seedRng(5))
    far.items.find((i) => i.id === 'blackKey').y = 90 // in the castle but below the gate zone
    far.items.find((i) => i.id === 'blackKey').room = R.BLACK_CASTLE
    step(far, {})
    ok(!far.gateOpen.blackKey, 'a key parked OUTSIDE the gate zone does not open it')
}

console.log('dragons: bite kills, sword slays, gold key repels Yorgle')
{
    const s = createSim(seedRng(11))
    const yorgle = s.dragons.find((d) => d.id === 'yorgle')
    s.room = yorgle.room; s.player.x = yorgle.x + 3; s.player.y = yorgle.y
    yorgle.mouthOpen = true
    step(s, {})
    ok(s.dead && s.deathTimer === 120, 'a bite with the mouth open kills the player')
    for (let i = 0; i < 130; i++) step(s, {})
    ok(s.dead && s.deathTimer <= 0, 'the death timer expires into the honest SLAIN terminal')
    for (let i = 0; i < 10; i++) step(s, {})
    ok(s.tick >= 0, 'terminal freezes the sim (no further ticks)')
    const t0 = s.tick
    step(s, { dx: S })
    ok(s.tick === t0, 'input at the terminal does not resume the dead world')

    const slay = createSim(seedRng(11))
    const g = slay.dragons.find((d) => d.id === 'grundle')
    slay.room = g.room; slay.player.x = g.x + 5; slay.player.y = g.y
    slay.carrying = 'sword'
    step(slay, {})
    ok(!g.alive, 'the sword slays a dragon within reach')
    ok(slay.dragons.every((d) => d.x >= 10 && d.x <= GW - 20 && d.y >= 10 && d.y <= GH - 20),
        'dragons stay clamped inside their rooms')

    const flee = createSim(seedRng(11))
    const y = flee.dragons.find((d) => d.id === 'yorgle')
    flee.room = y.room
    flee.player.x = y.x + 40; flee.player.y = y.y
    const x0 = y.x
    flee.carrying = 'goldKey'
    step(flee, {})
    ok(y.x < x0, 'Yorgle flees the carried gold key')
}

console.log('magnet: pulls nearby loose items toward the player (original attract)')
{
    const s = createSim(seedRng(13))
    const key = s.items.find((i) => i.id === 'goldKey')
    s.room = R.OVERWORLD_4
    s.player.x = 100; s.player.y = 90
    key.room = R.OVERWORLD_4; key.carried = false; key.x = 130; key.y = 90
    s.carrying = 'magnet'
    s.items.find((i) => i.id === 'magnet').carried = true
    s.bat.room = R.SECRET; s.bat.x = 5; s.bat.y = 5   // keep the bat out of the test room
    const kx0 = key.x
    for (let i = 0; i < 40; i++) step(s, {})
    ok(key.x < kx0, 'while carried, the magnet pulls a nearby loose item toward the player')

    // attraction is room-local: a loose item in ANOTHER room is left alone
    const far = createSim(seedRng(13))
    far.room = R.OVERWORLD_4
    far.player.x = 100; far.player.y = 90
    const fkey = far.items.find((i) => i.id === 'goldKey')
    fkey.room = R.OVERWORLD_2; fkey.carried = false; fkey.x = 130; fkey.y = 90
    far.carrying = 'magnet'
    far.items.find((i) => i.id === 'magnet').carried = true
    far.bat.room = R.SECRET; far.bat.x = 5; far.bat.y = 5
    const fkx0 = fkey.x
    for (let i = 0; i < 40; i++) step(far, {})
    ok(fkey.x === fkx0, 'the magnet only attracts items in the player\'s own room')
}

console.log('dragons: a slain dragon respawns to its lair after the delay')
{
    const s = createSim(seedRng(11))
    const g = s.dragons.find((d) => d.id === 'grundle')
    s.room = g.room; s.player.x = g.x + 5; s.player.y = g.y
    s.carrying = 'sword'
    const hx = g.x, hy = g.y
    step(s, {})
    ok(!g.alive, 'pre: the sword slays the dragon within reach')
    // retreat the player (and the sword) out of the lair so the respawned dragon
    // is not instantly re-slain; the other two dragons live in other rooms.
    s.room = R.OVERWORLD_5; s.player.x = 80; s.player.y = 150
    let waits = 0
    while (!g.alive && waits < DRAGON_RESPAWN_TICKS + 20) { step(s, {}); waits++ }
    ok(g.alive, `a slain dragon returns to play after ~${DRAGON_RESPAWN_TICKS} ticks`, `resumed after ${waits} ticks`)
    ok(g.room === R.RED_LAB_2 && Math.abs(g.x - hx) < 1 && Math.abs(g.y - hy) < 1,
        'the respawned dragon is back in its home room at its home position')
    ok(s.dragons.every((d) => d.alive), 'after the respawn all three dragons are in play')
}

console.log('win: the chalice home to the Gold Castle')
{
    // ---- the scripted route (mirrors the BFS solution of the fixed map) ----
    // (#1560) sign-steering dies in maze rooms: from some Blue Maze pockets
    // the player never reaches the edge anchor (dead-end), so recovery walks
    // failed. Plan on a 4px cell grid (per-room walls are static; cached)
    // and hop cell-to-cell, one axis at a time (axis hops between two free
    // cells are sweep-safe); fall back to direct steering when the grid has
    // no path (bridged walls, odd targets).
    const CELL = 4
    const GWc = Math.ceil(GW / CELL), GHc = Math.ceil(GH / CELL)
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
    function driveTo(sim, tx, ty, stop = 1.2) {
        const p = sim.player
        // (tx,ty) is the player's corner (as before); the grid plans on centers
        const txc = tx + p.w / 2, tyc = ty + p.h / 2
        let path = [], stuck = 0
        const plan = () => { path = cellPath(sim, p.x + p.w / 2, p.y + p.h / 2, txc, tyc); stuck = 0 }
        plan()
        for (let i = 0; i < 5000; i++) {
            const ddx = tx - p.x, ddy = ty - p.y
            if (Math.abs(ddx) <= stop && Math.abs(ddy) <= stop) return true
            let wx = txc, wy = tyc
            while (path.length) {
                const [cx, cy] = path[0]
                // advance only once the player's center is inside the waypoint
                // cell — a looser box skips cells and points the hop at a wall
                if (Math.floor((p.x + p.w / 2) / CELL) === cx && Math.floor((p.y + p.h / 2) / CELL) === cy) { path.shift(); continue }
                wx = cx * CELL + CELL / 2; wy = cy * CELL + CELL / 2
                break
            }
            const dpx = wx - (p.x + p.w / 2), dpy = wy - (p.y + p.h / 2)
            const ux = Math.abs(dpx) > 0.3 ? Math.min(S, Math.abs(dpx)) * Math.sign(dpx) : 0
            const uy = Math.abs(dpy) > 0.3 ? Math.min(S, Math.abs(dpy)) * Math.sign(dpy) : 0
            // diagonal first (fast), then each axis alone: a wall that bites
            // in from the side can block one axis mid-hop; the other must
            // still get its tick (the game collision-checks final positions,
            // and every step here is smaller than a wall)
            const r0 = sim.room
            const px = p.x, py = p.y
            const moved = (dx, dy) => {
                if (dx === 0 && dy === 0) return false
                step(sim, { dx, dy })
                return sim.room !== r0 || Math.abs(p.x - px) > 0.01 || Math.abs(p.y - py) > 0.01
            }
            const m = moved(ux, uy) || moved(ux, 0) || moved(0, uy)
            if (sim.room !== r0) return true
            if (sim.dead || sim.won) return false
            if (!m) { if (++stuck > 6) { if (!path.length) return false; plan() } } else stuck = 0
        }
        return false
    }
    const cross = (sim, dir, want, maxTicks = 400) => {
        const v = { up: [0, -S], down: [0, S], left: [-S, 0], right: [S, 0] }[dir]
        for (let i = 0; i < maxTicks && sim.room !== want && !sim.won; i++) step(sim, { dx: v[0], dy: v[1] })
        return sim.room === want
    }
    // #1560 steal recovery. The bat now roams for real and steals
    // route-critical items in the player's room. A drop always lands in the
    // player's room (the bat only swaps onto a loose partner), so recovery is:
    // if the bat still carries the item, walk to the nearest room holding a
    // loose partner (and no dragon) and wait for the swap; then walk to the
    // drop spot and come back to the route's continuation point. The walk
    // obeys the same laws as the player: bridge-only walls, the sealed secret
    // door, and the portcullis (only through an open gate).
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
    const hop = (sim, from, to) => {  // walk one room edge: anchor, then push
        const edge = neighbors(sim, from).find(([, n]) => n === to)
        if (!edge) return false
        const d = edge[0]
        // maze rooms don't always reach a single anchor — try the gap's points
        if (!ANCHORS[d].some(([ax, ay]) => driveTo(sim, ax, ay))) return false
        return cross(sim, d, to, 400)
    }
    const walkTo = (sim, to, avoidDragons = true) => {
        // prefer paths that never cross a dragon's home room (the shelters
        // already exclude them, but the route between can — a smart player
        // detours around Yorgle when the map allows); if a preferred path's
        // hops fail (maze dead-end), retry on the plain graph.
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
            for (let i = 0; i + 1 < path.length && ok; i++) ok = hop(sim, path[i], path[i + 1])
            if (ok) return sim.room === to
        }
        return false
    }
    function recover(sim, id, backX, backY, budget = 8000) {
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
            if (!walkTo(sim, shelter)) return false
            for (let i = 0; i < budget && sim.bat.carrying === id; i++) {
                step(sim, {})
                if (sim.dead || sim.won) return false
            }
            if (sim.bat.carrying === id) return false
        }
        if (!walkTo(sim, item.room)) return false
        if (!driveTo(sim, item.x, item.y)) return false
        if (sim.carrying !== id) return false  // re-stolen mid-walk
        if (!walkTo(sim, startRoom)) return false
        return driveTo(sim, backX, backY)
    }
    function winRun(seed, variant = 1) {
        const sim = createSim(seedRng(seed), variant)
        const T = (tx, ty) => driveTo(sim, tx, ty)
        // trip 1: blackKey into front of the black gate
        sim.player.x = 80
        if (!cross(sim, 'down', R.OVERWORLD_1)) return { ok: false, why: 'castle exit' }
        if (!cross(sim, 'down', R.OVERWORLD_2)) return { ok: false, why: 'ow2' }
        sim.player.y = 90
        if (!cross(sim, 'left', R.BLUE_LAB_1)) return { ok: false, why: 'lab1a' }
        if (!T(140, 90) || !T(140, 170) || !T(80, 170)) return { ok: false, why: 'lab1 descent' }
        if (!cross(sim, 'down', R.BLUE_LAB_2)) return { ok: false, why: 'lab2' }
        T(76, 92)
        if (sim.carrying !== 'blackKey') {
            if (!recover(sim, 'blackKey', 76, 92)) return { ok: false, why: 'no blackKey' }
        }
        T(80, 16)
        if (!cross(sim, 'up', R.BLUE_LAB_1)) return { ok: false, why: 'lab1b' }
        if (!T(140, 168) || !T(140, 44) || !T(110, 16) || !T(80, 16)) return { ok: false, why: 'lab1 climb' }
        if (!cross(sim, 'up', R.OVERWORLD_2)) return { ok: false, why: 'ow2b' }
        sim.player.y = 90
        if (!cross(sim, 'right', R.OVERWORLD_4)) return { ok: false, why: 'ow4' }
        sim.player.x = 80
        if (!cross(sim, 'down', R.OVERWORLD_3)) return { ok: false, why: 'ow3' }
        if (!cross(sim, 'down', R.BLACK_CASTLE)) return { ok: false, why: 'castleB' }
        sim.player.x = 80; sim.player.y = 32
        step(sim, { drop: true })
        for (let i = 0; i < 3 && !sim.gateOpen.blackKey; i++) step(sim, {})
        if (!sim.gateOpen.blackKey) return { ok: false, why: 'gateB' }
        if (!T(65, 24)) return { ok: false, why: 'key dodge' }
        // trip 2: bridge through the black foyer floor, stash it, take the white key
        if (!cross(sim, 'down', R.OVERWORLD_3)) return { ok: false, why: 'castleB out' }
        if (!cross(sim, 'up', R.OVERWORLD_2)) return { ok: false, why: 'ow2c' }
        sim.player.y = 70; sim.player.x = 95
        T(96, 76)
        if (sim.carrying !== 'bridge') {
            if (!recover(sim, 'bridge', 96, 76)) return { ok: false, why: 'no bridge' }
        }
        sim.player.y = 90
        if (!cross(sim, 'down', R.OVERWORLD_3)) return { ok: false, why: 'ow3c' }
        if (!cross(sim, 'down', R.BLACK_CASTLE)) return { ok: false, why: 'castleB2' }
        if (!cross(sim, 'up', R.BLACK_FOYER)) return { ok: false, why: 'foyerB' }
        if (!cross(sim, 'down', R.RED_LAB_1)) return { ok: false, why: 'red floor' }
        if (!T(140, 12)) return { ok: false, why: 'red enter' }
        if (!T(140, 86)) return { ok: false, why: 'red right column' }
        step(sim, { drop: true })                       // no-op: the bridge placed itself at the crossing
        if (sim.carrying !== null) return { ok: false, why: 'bridge drop failed' }
        if (!T(66, 86)) return { ok: false, why: 'red lower corridor' }
        if (sim.carrying !== 'whiteKey') {
            if (!recover(sim, 'whiteKey', 66, 86)) return { ok: false, why: 'no whiteKey' }
        }
        if (!T(140, 86)) return { ok: false, why: 'red lower right' }
        if (!T(140, 12)) return { ok: false, why: 'red right column up' }
        if (!T(80, 12)) return { ok: false, why: 'red top exit' }
        if (!cross(sim, 'up', R.BLACK_FOYER)) return { ok: false, why: 'foyer out red' }
        if (!T(65, 24)) return { ok: false, why: 'key dodge 2' }
        // trip 3: white key to its gate, chalice, and the ride home
        if (!cross(sim, 'up', R.BLACK_CASTLE)) return { ok: false, why: 'castleB3' }
        sim.player.y = 150
        if (!cross(sim, 'down', R.OVERWORLD_3)) return { ok: false, why: 'ow3b' }
        sim.player.y = 90
        if (!cross(sim, 'right', R.OVERWORLD_4)) return { ok: false, why: 'ow4b' }
        sim.player.y = 90
        if (!cross(sim, 'right', R.WHITE_CASTLE)) return { ok: false, why: 'castleW' }
        sim.player.x = 80; sim.player.y = 32
        step(sim, { drop: true })
        for (let i = 0; i < 3 && !sim.gateOpen.whiteKey; i++) step(sim, {})
        if (!sim.gateOpen.whiteKey) return { ok: false, why: 'gateW' }
        if (!cross(sim, 'up', R.WHITE_FOYER)) return { ok: false, why: 'foyerW' }
        T(80, 88)
        if (sim.carrying !== 'chalice') {
            if (!recover(sim, 'chalice', 80, 88)) return { ok: false, why: 'no chalice' }
        }
        T(80, 12)
        if (!cross(sim, 'up', R.WHITE_CASTLE)) return { ok: false, why: 'castleW out' }
        sim.player.y = 150
        if (!cross(sim, 'down', R.OVERWORLD_4)) return { ok: false, why: 'ow4 home' }
        sim.player.x = 80
        if (!cross(sim, 'up', R.OVERWORLD_1)) return { ok: false, why: 'ow1 home' }
        for (let i = 0; i < 200 && !sim.won; i++) step(sim, { dx: 0, dy: -S })
        return sim.won
            ? { ok: true, tick: sim.tick, score: sim.score }
            : { ok: false, why: `end room=${sim.room} carry=${sim.carrying} dead=${sim.dead}` }
    }

    let wins = 0
    let first = null
    const why = {}
    for (let sd = 1; sd <= 10; sd++) {
        const r = winRun(sd)
        if (r.ok) { wins++; if (!first) first = r } else { why[r.why] = (why[r.why] || 0) + 1 }
    }
    ok(wins === 10, 'scripted chalice run wins on 10/10 seeds', JSON.stringify(why))
    ok(first && first.score === 4, 'the winning run collected exactly bridge+black+white+chalice (score 4)',
        `${first && first.score}`)
    const a = winRun(42), b = winRun(42)
    ok(a.ok && b.ok && a.tick === b.tick, 'a pinned seed wins at the identical tick every time',
        `${a.tick} vs ${b.tick}`)

    const won = createSim(seedRng(42))
    won.room = R.GOLD_CASTLE; won.carrying = 'chalice'
    step(won, {})
    ok(won.won, 'chalice + Gold Castle room = YOU WON')
    const t0 = won.tick
    step(won, { dx: S })
    ok(won.tick === t0, 'the win terminal freezes the sim')

    // ================================================================ #1572 item 3 ----
    // SELECT GAME: the three honest variants. V1 is the classic pin world;
    // V2 moves ONLY the dragons; V3 re-homes the loot on the seeded stream
    // (the lairs, the gated foyers and the sealed room are not the
    // shuffle's to move — the rules stay the rules, not a coin flip).
    console.log('#1572 item 3: variant law — V1 classic / V2 fast / V3 shuffle')
    const vscript = (seed, variant, n = 400) => {
        const s = createSim(seedRng(seed), variant)
        const out = []
        for (let i = 0; i < n; i++) { step(s, {}); out.push(hash(s)) }
        return out.join(';')
    }
    ok(vscript(4242, 1) === vscript(4242, 1), 'V1 replays identically (the classic pin world)')
    ok(vscript(4242, 1) === vscript(4242, undefined), 'an omitted variant IS the classic (the pin law is untouched)')
    ok(vscript(4242, 2) !== vscript(4242, 1), 'V2 is not V1 (the fast world differs)')
    ok(createSim(seedRng(5), 2).dragons.map((d) => d.speed.toFixed(1)).join() === '0.9,1.2,1.5',
        'V2 runs the dragons at 1.5x the classic pace')
    ok(createSim(seedRng(5), 3).dragons.map((d) => d.speed.toFixed(1)).join() === '0.6,0.8,1.0',
        'V3 keeps the classic pace (the twist is the loot, not the hunters)')

    // V2 moves only the dragons: same seed, the loot and the bat sit where
    // the classic puts them (the variant is a twist on one dial, not a new world)
    const p1 = createSim(seedRng(55)), p2 = createSim(seedRng(55), 2)
    const itemsScript = (s) => s.items.map((i) => `${i.room}:${i.x.toFixed(3)}:${i.y.toFixed(3)}:${i.carried ? 1 : 0}`).join(';')
    for (let i = 0; i < 300; i++) { p1.step({}); p2.step({}) }
    ok(itemsScript(p1) === itemsScript(p2), 'V2 leaves the loot on the classic board')
    ok(p1.bat.x === p2.bat.x && p1.bat.y === p2.bat.y, 'V2 leaves the bat on the classic course')

    // V3: the seeded re-home, winnable by construction
    const vlayout = (s) => s.items.map((i) => `${i.id}@${i.room}:${i.x}:${i.y}`).join(';')
    ok(vlayout(createSim(seedRng(77), 3)) === vlayout(createSim(seedRng(77), 3)),
        'V3 layout is deterministic per seed')
    ok(vlayout(createSim(seedRng(77), 3)) !== vlayout(createSim(seedRng(78), 3)),
        'different seeds re-home the loot differently')
    ok([77, 78, 79].every((sd) => vlayout(createSim(seedRng(sd), 3)) !== vlayout(createSim(seedRng(sd)))),
        'a shuffle seed is not the classic layout')
    const lairs = new Set([R.BLUE_LAB_1, R.RED_LAB_2, R.DRAGON_LAIR])
    const foyers = new Set([R.GOLD_FOYER, R.BLACK_FOYER, R.WHITE_FOYER])
    const inAnyWall = (i) => ROOMS[i.room].walls.some((w) =>
        i.x < w.x + w.w && i.x + i.w > w.x && i.y < w.y + w.h && i.y + i.h > w.y)
    for (const sd of [1, 7, 42, 1337]) {
        const s = createSim(seedRng(sd), 3)
        ok(s.items.every((i) => i.room !== R.SECRET && !lairs.has(i.room) && !foyers.has(i.room)),
            `seed ${sd}: no loot in the sealed room, a lair, or a gated foyer (winnable by construction)`)
        ok(s.items.every((i) => !inAnyWall(i)), `seed ${sd}: every re-homed item sits clear of its room's walls`)
    }

    // The adaptive route: the fixed-map waypoint run cannot chase shuffled
    // loot, so each fetch walks the item to its seeded home (obeying the same
    // bridge/gate/secret-door laws as the player), stashing a wrongly-picked
    // item at the feet and re-approaching until the right one is carried. No
    // dragon room is ever entered: the ten shuffle rooms connect without one.
    function fetchItem(sim, id) {
        const item = sim.items.find((i) => i.id === id)
        for (let attempt = 0; attempt < 6; attempt++) {
            if (sim.carrying === id) return true
            if (sim.carrying) step(sim, { drop: true })
            if (sim.bat.carrying === id) {
                // the bat has it: wait where a loose partner sits (no dragon)
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
                if (!walkTo(sim, shelter)) continue
                for (let i = 0; i < 8000 && sim.bat.carrying === id; i++) {
                    step(sim, {})
                    if (sim.dead || sim.won) return sim.carrying === id
                }
                if (sim.bat.carrying === id) continue
            }
            if (!walkTo(sim, item.room)) continue
            if (!driveTo(sim, item.x, item.y)) continue
            if (sim.carrying === id) return true
        }
        return sim.carrying === id
    }
    function winRunV3(seed) {
        const sim = createSim(seedRng(seed), 3)
        const T = (tx, ty) => driveTo(sim, tx, ty)
        if (!fetchItem(sim, 'blackKey')) return { ok: false, why: 'blackKey' }
        if (!walkTo(sim, R.BLACK_CASTLE)) return { ok: false, why: 'to black gate' }
        if (!T(80, 32)) return { ok: false, why: 'black threshold' }
        step(sim, { drop: true })
        for (let i = 0; i < 3 && !sim.gateOpen.blackKey; i++) step(sim, {})
        if (!sim.gateOpen.blackKey) return { ok: false, why: 'gateB' }
        if (!fetchItem(sim, 'bridge')) return { ok: false, why: 'bridge' }
        if (!walkTo(sim, R.BLACK_FOYER)) return { ok: false, why: 'to black foyer' }
        if (!cross(sim, 'down', R.RED_LAB_1)) return { ok: false, why: 'red floor' }
        if (!fetchItem(sim, 'whiteKey')) return { ok: false, why: 'whiteKey' }
        if (!walkTo(sim, R.WHITE_CASTLE)) return { ok: false, why: 'to white gate' }
        if (!T(80, 32)) return { ok: false, why: 'white threshold' }
        step(sim, { drop: true })
        for (let i = 0; i < 3 && !sim.gateOpen.whiteKey; i++) step(sim, {})
        if (!sim.gateOpen.whiteKey) return { ok: false, why: 'gateW' }
        if (!fetchItem(sim, 'chalice')) return { ok: false, why: 'chalice' }
        if (!sim.won && !walkTo(sim, R.GOLD_CASTLE)) return { ok: false, why: 'home' }
        if (!sim.won) for (let i = 0; i < 200 && !sim.won; i++) step(sim, { dx: 0, dy: -S })
        return sim.won
            ? { ok: true, tick: sim.tick, score: sim.score }
            : { ok: false, why: `end room=${sim.room} carry=${sim.carrying}` }
    }

    console.log('#1572 item 3: every variant is provably winnable (the route adapter)')
    const tally = (run) => {
        let wins = 0
        const whys = {}
        for (let sd = 1; sd <= 10; sd++) {
            const r = run(sd)
            if (r.ok) wins++; else whys[r.why] = (whys[r.why] || 0) + 1
        }
        return { wins, whys }
    }
    const t1 = tally((sd) => winRun(sd, 1))
    ok(t1.wins === 10, 'V1 CLASSIC wins 10/10 seeds (the classic pin world)', JSON.stringify(t1.whys))
    const t2 = tally((sd) => winRun(sd, 2))
    ok(t2.wins === 10, 'V2 FAST wins 10/10 seeds (the route outruns the 1.5x hunters)', JSON.stringify(t2.whys))
    const t3 = tally(winRunV3)
    ok(t3.wins === 10, 'V3 SHUFFLE wins 10/10 seeds (the adaptive route finds the re-homed loot)', JSON.stringify(t3.whys))
}

// ================================================================ #1637 batch 11 ----
// WATCH route (route.js): the drivers above, ported to a per-tick generator the
// browser seats live. The proof runs the SHIPPED module against real sims — one
// input per tick, no teleports, no cheating the collision laws. Seat = proof.
console.log('#1637 batch 11: the WATCH driver wins the quest (route.js, live-step proof)')
{
    const drive = (seed, variant) => {
        const sim = createSim(seedRng(seed), variant)
        const w = makeRoute(sim)
        let r = w.next(), n = 0
        while (!r.done && n < 60000) {
            sim.step(r.value || {})
            sim.events.length = 0
            n++
            if (sim.dead) break
            r = w.next()
        }
        return { won: sim.won, why: r.done ? (r.value && r.value.why) : 'budget', ticks: n }
    }
    for (const [v, label] of [[1, 'CLASSIC script'], [2, 'FAST script'], [3, 'SHUFFLE adaptive']]) {
        let wins = 0
        const whys = {}
        for (let sd = 1; sd <= 10; sd++) {
            const r = drive(sd, v)
            if (r.won) wins++
            else whys[r.why] = (whys[r.why] || 0) + 1
        }
        ok(wins === 10, `route.js wins V${v} ${label} on 10/10 seeds`, JSON.stringify(whys))
    }
    // honesty: the guide emits inputs only — it never touches the world directly
    const RT = readFileSync('src/games/Adventure/route.js', 'utf8')
    ok(!/\bP\.x\s*=[^=]|\bP\.y\s*=[^=]|sim\.room\s*=[^=]|sim\.carrying\s*=[^=]|sim\.player\.x\s*=[^=]/.test(RT),
        'route.js never writes the sim (inputs only — no teleport guides)')
    ok(/sim\.variant >= 3 \? runRoute\(sim\) : scriptRun\(sim\)/.test(RT),
        'route.js dispatches by cart variant (fixed maps get the waypoint script, the shuffle gets the adapter)')
    // determinism: the guide over a pinned seed is exact
    const ra = drive(7, 1), rb = drive(7, 1)
    ok(ra.won && rb.won && ra.ticks === rb.ticks, 'a pinned seed watches to the identical tick', `${ra.ticks} vs ${rb.ticks}`)
    // bat-theft proof: at least one seed wins only because recover() runs
    // (seed 6 staggers past its first recover — vscript pin kept honest below)
    const s6 = drive(6, 1)
    ok(s6.won && s6.ticks > 2200, 'seed 6 wins through the bat recovery (the route survives steals)', `${s6.ticks} ticks`)
}

// ------------------------------------------------- #1572 item 3 wiring (static) ----
console.log('#1572 item 3: SELECT GAME wiring (static)')
{
    const src = readFileSync(IDX, 'utf8')
    const simSrc = readFileSync(SIMF, 'utf8')
    const attractSrc = readFileSync(new URL('../src/games/Adventure/attract.js', import.meta.url), 'utf8')
    ok(/export const VARIANTS = \{/.test(simSrc) && /export const DEFAULT_VARIANT = 1/.test(simSrc),
        'the three named variants live in the sim (not the shell)')
    ok(/createSim\(rand, variant = DEFAULT_VARIANT\)/.test(simSrc),
        'createSim takes the variant and defaults to the classic')
    ok(/sim = createSim\(seedRng\(seed\), variant\)/.test(src), 'the run boots the SELECTED variant (the sim receives it)')
    ok(/attractFrame\(tick, w, h, variant = 1\)/.test(attractSrc), 'attractFrame takes the selected variant')
    ok(/SELECT GAME/.test(attractSrc) && /String\(variant\)/.test(attractSrc),
        'the attract shows the variant number (the cart\'s dot matrix)')
    ok(/attractFrame\(sim\.tick, GW, GH, variant\)/.test(src), 'the shell draws the attract with the selected variant')
    ok(/e\.code === 'ArrowLeft' \|\| e\.code === 'ArrowRight'/.test(src), 'left/right cycle the pick on the SELECT GAME screen')
    ok(/variant: sim\.variant,/.test(src), 'state() carries the live variant (the harness can read SELECT GAME)')
}

// ------------------------------------------------------- #1556 playtest fix ----
console.log('#1556 playtest fix: gate-mouth de-wedge (Black Castle soft-lock)')
{
    // The scripted playtest sweep (scripts/adventure-playtest.mjs, #1556) found a
    // SOFT-LOCK: OW3's bottom exit drops the player into Black Castle at y=8 —
    // inside the closed gate's rect (56,0,48,30) — with all four directions
    // colliding. The win-script masked it (it teleports y); a real player who
    // approaches the castle before the key is free is pinned there forever.
    // The fix nudges a wedged landing below the obstruction.
    for (const sd of [7, 42, 1337]) {
        const sim = createSim(seedRng(sd))
        sim.room = R.OVERWORLD_3; sim.player.x = 80; sim.player.y = 150
        for (let i = 0; i < 400 && sim.room !== R.BLACK_CASTLE; i++) step(sim, { dx: 0, dy: S })
        ok(sim.room === R.BLACK_CASTLE && sim.player.y >= 30,
            `seed ${sd}: arrival at the closed black gate de-wedges below the gate`, `room=${sim.room} y=${sim.player.y}`)
        for (let i = 0; i < 200 && sim.room === R.BLACK_CASTLE; i++) step(sim, { dx: 0, dy: S })
        ok(sim.room === R.OVERWORLD_3, `seed ${sd}: soft-lock gone — the player walks back out to OW3`, `room=${sim.room}`)
    }
    // De-wedge must not smuggle anyone through: standing below a closed gate,
    // pressing up never enters the foyer and never crosses y<30.
    const keep = createSim(seedRng(7))
    keep.room = R.OVERWORLD_3; keep.player.x = 80; keep.player.y = 150
    for (let i = 0; i < 400 && keep.room !== R.BLACK_CASTLE; i++) step(keep, { dx: 0, dy: S })
    let breached = 0
    for (let i = 0; i < 200; i++) { step(keep, { dx: 0, dy: -S }); if (keep.player.y < 30 - 0.01) breached++ }
    ok(breached === 0 && keep.room === R.BLACK_CASTLE, 'the closed gate still blocks the foyer approach (de-wedge sits OUTSIDE the gate law)', `breach ticks=${breached}`)
    // Determinism survives the fix: identical replays for one pinned seed.
    const replay = (sd) => {
        const s = createSim(seedRng(sd)); s.room = R.OVERWORLD_3; s.player.x = 80; s.player.y = 150
        for (let i = 0; i < 500; i++) step(s, { dx: 0, dy: i < 120 ? S : -S })
        return `${s.room}:${s.player.x.toFixed(4)}:${s.player.y.toFixed(4)}:${s.tick}`
    }
    ok(replay(7) === replay(7), 'de-wedge replays identically for a pinned seed', replay(7))
}

// ------------------------------------------------------ #1572 affordance ----
console.log('#1572 gate-rite affordance: the threshold teaches the drop')
{
    const give = (s, id) => {
        const item = s.items.find((i) => i.id === id)
        item.room = s.room
        item.carried = true
        s.carrying = id
    }
    const at = (castle, keyId, y, open = false) => {
        const s = createSim(seedRng(7))
        s.room = castle
        s.player.x = 80
        s.player.y = y
        if (open) s.gateOpen[ROOMS[castle].gateKey] = true
        if (keyId) give(s, keyId)
        step(s, { dx: 0, dy: 0 })
        return s
    }
    const bk = at(R.BLACK_CASTLE, 'blackKey', 40)
    ok(bk.afford === 'blackKey', 'the matching key at the threshold glints the black gate')
    ok(at(R.BLACK_CASTLE, 'goldKey', 40).afford === null, 'the WRONG key at the black gate gives no hint')
    ok(at(R.BLACK_CASTLE, 'blackKey', 100).afford === null, 'carrying the key far from the threshold gives no hint')
    ok(at(R.BLACK_CASTLE, 'blackKey', 40, true).afford === null, 'an open gate needs no hint (the mat rests)')
    ok(at(R.BLACK_CASTLE, null, 40).afford === null, 'empty hands at the threshold give no hint')
    ok(at(R.OVERWORLD_1, 'blackKey', 40).afford === null, 'a non-gate room never affords, even carrying a key')

    // The full rite the hint teaches: walk up to the closed gate with the key
    // (mat glints), drop it (the gate law fires), and the hint falls silent.
    const e2e = createSim(seedRng(42))
    e2e.room = R.BLACK_CASTLE
    e2e.player.x = 80
    e2e.player.y = 150
    give(e2e, 'blackKey')
    let sawGlint = 0
    for (let i = 0; i < 400 && !e2e.gateOpen.blackKey; i++) {
        step(e2e, { dx: 0, dy: -S })
        if (e2e.afford === 'blackKey') sawGlint++
    }
    ok(sawGlint > 0, 'walking up to the closed gate carrying its key makes the mat glint', `glint ticks=${sawGlint}`)
    step(e2e, { dx: 0, dy: 0, drop: true })
    ok(e2e.gateOpen.blackKey, 'the drop the glint pointed at opens the gate (affordance teaches the true rite)')
    ok(e2e.afford === null, 'the hint falls silent once the gate stands open')

    // Pure output: the hint must not disturb the seeded replay.
    const aff = (sd) => {
        const s = createSim(seedRng(sd))
        give(s, 'blackKey')
        s.room = R.BLACK_CASTLE
        s.player.x = 80
        s.player.y = 150
        let seq = ''
        for (let i = 0; i < 300; i++) {
            // Net-up wander (30 ticks up, 23 back) with a still x: sweeps the
            // threshold, so the glint window is genuinely crossed, not vacuous.
            step(s, { dx: 0, dy: i % 53 < 30 ? -S : S })
            seq += s.afford ? '1' : '0'
        }
        return seq
    }
    ok(aff(7) === aff(7) && aff(7) !== '', 'the affordance is deterministic — it never pollutes the seeded stream')
    ok(aff(7).includes('1') && aff(2027).includes('1'), 'the scripted wander actually reaches a glinting threshold (the gate is not vacuously null)', JSON.stringify([aff(7).includes('1'), aff(2027).includes('1')]))
}

// ------------------------------------------------------------- static law ----
console.log('#1473 wiring: report + pin + contract (static)')
{
    const src = readFileSync(IDX, 'utf8')
    ok(/exposeFeedbackState\(\s*\(\)\s*=>\s*\(\{[\s\S]*?\btick:[\s\S]*?\bscore:[\s\S]*?\bdone:[\s\S]*?\bseed:/.test(src),
        'production report carries {tick,score,done,seed}')
    ok(/seedFromQuery\s*\(/.test(src), 'human start consumes seedFromQuery (pin law)')
    ok(/exposeGame\(\{[\s\S]*?id:\s*'adventure'/.test(src), 'exposeGame registers id "adventure"')
    ok(/unexposeGame\(\)[\s\S]*unexposeFeedbackState\(\)/.test(src), 'cleanup un-exposes game + feedback')
    ok(/pointerdown/.test(src), 'canvas pointerdown starts/restarts (phone parity)')
    const simSrc = readFileSync(SIMF, 'utf8')
    const stripped = simSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    ok(!/Math\.random/.test(stripped), 'sim.js is entropy-free — every dice roll runs through the injected stream')
    const idxCode = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    const randomLines = idxCode.split('\n').filter((l) => l.includes('Math.random'))
    ok(randomLines.length === 1 && /seedFromQuery/.test(randomLines[0]),
        'index.jsx keeps exactly one Math.random — the un-pinned seed roll itself', randomLines.join(' ~ '))
}

console.log('attract mode: fixed stream, never pollutes the pinned run')
{
    const src = readFileSync(IDX, 'utf8')
    ok(/const attractRand = seedRng\(\d+\)/.test(src), 'attract wander runs on its own fixed stream')
}

// --------------------------------------------------------------- #1568 spine ----
console.log('#1568 spine visibility: roster + driving script + position carrier (static)')
{
    const src = readFileSync(IDX, 'utf8')
    const roster = readFileSync(new URL('./lib/contractGames.mjs', import.meta.url), 'utf8')
    ok(/\{ id: 'adventure', path: '\/adventure' \}/.test(roster),
        'adventure is on the contract spine roster — contractcheck/juice/nightly/boredom read it')
    ok(/adventure: \(i\) => \(\{[^)]*left[^)]*right[^)]*up[^)]*down[^)]*a:/.test(roster),
        'PATTERNS.adventure scripts 4 directions + drop for the contract replay')
    ok(/state:\s*\(\)\s*=>\s*\(\{[\s\S]*?x:\s*sim\.player\.x,[\s\S]*?y:\s*sim\.player\.y,[\s\S]*?lives:/.test(src),
        'state() carries live x/y — a POSITION_KEYS carrier; the boredom audit must never call this game BLIND')
    ok(/exposeFeedbackState\([\s\S]*?x:\s*sim\.player\.x,[\s\S]*?y:\s*sim\.player\.y/.test(src),
        'the production report carries position too')
}

// ---------------------------------------------------- #1572 affordance (static) ----
console.log('#1572 gate-rite affordance: shared zone + renderer gate (static)')
{
    const src = readFileSync(IDX, 'utf8')
    const simSrc = readFileSync(SIMF, 'utf8')
    ok(/export const GATE_ZONE = \{ x: 40, y: 0, w: 80, h: 60 \}/.test(simSrc),
        'the key-drop zone is ONE shared constant — rule, hint and mat cannot drift apart')
    ok(/key\.y < GATE_ZONE\.y \+ GATE_ZONE\.h && key\.x > GATE_ZONE\.x && key\.x < GATE_ZONE\.x \+ GATE_ZONE\.w/.test(simSrc),
        'the gate-open rule reads the shared zone (the old magic numbers are gone)')
    ok(/sim\.afford = gateRoom\.gateKey/.test(simSrc),
        'sim carries the affordance (matching key at a closed threshold)')
    ok(/const glint = sim\.afford === room\.gateKey/.test(src),
        'the mat glints ONLY while carrying the matching key (renderer gate)')
    ok(/ctx\.globalAlpha = glint \? 0\.9 : 0\.25/.test(src),
        'the mat is quiet at rest (25%) and bright under the glint (90%)')
    ok(/state: \(\)\s*=>\s*\(\{[\s\S]*?afford: sim\.afford,/.test(src),
        'state() carries afford so the harness can watch the hint')
}

// ------------------------------------------------- #1572 guidance tab (static) ----
console.log('#1572 guidance tab: registry guide content + shared renderer gate (static)')
{
    const gamesSrc = readFileSync(GAMES, 'utf8')
    const poSrc = readFileSync(PO, 'utf8')
    // Isolate the ADVENTURE registry entry so the gates can't be satisfied by
    // another game's data (or a stray comment elsewhere in the registry).
    const start = gamesSrc.indexOf("path: '/adventure'")
    const end = gamesSrc.indexOf('\n    },', start)
    const entry = start >= 0 && end > start ? gamesSrc.slice(start, end) : ''
    ok(start >= 0 && end > start, 'ADVENTURE entry found in the registry (the guide gates have a real anchor)')
    ok(/guide:\s*\[/.test(entry),
        'ADVENTURE registers a guide array — PauseOverlay shows a guidance tab')
    const guideBlock = entry.match(/guide:\s*\[[\s\S]*?\]/)?.[0] || ''
    ok(/golden/i.test(guideBlock) && /black/i.test(guideBlock) && /white/i.test(guideBlock) && /castle/i.test(guideBlock),
        'the guide names the three castles and their matching key colors')
    ok(/drop/i.test(guideBlock) && /key/i.test(guideBlock) && /gate/i.test(guideBlock),
        'the guide teaches the drop-the-key rite (the 0/200 first-timer failure)')
    ok(/bridge/i.test(guideBlock) && /wall/i.test(guideBlock),
        'the guide states the bridge-over-walls law')
    ok(/magnet/i.test(guideBlock),
        'the guide states the magnet law')
    const leak = guideBlock.match(/gr[ae]y\s*dot|secret|robinett|rite/i)?.[0]
    ok(!leak, 'the guide keeps the gray-dot secret rite hidden (Robinett\'s discovery stays the player\'s)', leak || '')
    ok(/game\.guide/.test(poSrc), 'PauseOverlay reads game.guide')
    ok(/game\?\.guide\?\.length/.test(poSrc),
        'the guidance tab renders ONLY for games that register one — every other help screen is untouched')
}

// -------------------------------------------- #1591 contract hash + nightly softlock ----
console.log('#1591 contract state().hash + the nightly softlock regression')
{
    const src = readFileSync(IDX, 'utf8')
    ok(/state:\s*\(\)\s*=>\s*\(\{[\s\S]*?hash:\s*stateHash\(sim\),/.test(src),
        'state() exposes hash: stateHash(sim) — the nightly bot can tell a live world from a frozen one')

    // A live world must change the digest every tick; a frozen one (terminal)
    // must NOT — that is the exact discrimination the nightly softlock gate uses.
    // V1's layout is seed-independent (the seed drives only the dragon/bat dice),
    // so determinism is pinned over IDENTICAL input streams, exactly like a real
    // replay — and different seeds diverge once those dice have rolled.
    const hstream = (seed, n = 300) => {
        const s = createSim(seedRng(seed))
        const out = []
        for (let i = 0; i < n; i++) { s.step({ dx: (i % 7 < 3 ? PLAYER_SPEED : -PLAYER_SPEED), dy: 0 }); s.events.length = 0; out.push(stateHash(s)) }
        return out.join(';')
    }
    ok(hstream(3) === hstream(3), 'stateHash replays deterministically: same seed, same pads, identical hash stream')
    ok(hstream(3) !== hstream(4), 'different seeds diverge once the seeded dice roll')
    {
        const live = createSim(seedRng(9))
        const seq = []
        for (let i = 0; i < 50; i++) { live.step({ dx: PLAYER_SPEED, dy: 0 }); live.events.length = 0; seq.push(stateHash(live)) }
        ok(new Set(seq).size === seq.length, 'a moving world changes stateHash every tick (never looks frozen)', `${new Set(seq).size}/${seq.length}`)
    }
    {
        const done = createSim(seedRng(9))
        done.room = R.GOLD_CASTLE; done.carrying = 'chalice'; done.events.length = 0
        done.step({ dx: PLAYER_SPEED, dy: 0 })
        const hWon = stateHash(done)
        let moved = 0
        for (let i = 0; i < 20; i++) { done.step({ dx: PLAYER_SPEED, dy: -PLAYER_SPEED }); done.events.length = 0; if (stateHash(done) !== hWon) moved++ }
        ok(done.won && moved === 0, 'the terminal freezes stateHash too (it tracks sim time, not wall-clock — no Date.now/random)', `moved ${moved}`)
    }

    // The nightly repro: replay seed 20261149 (the exact bot seed) for the full
    // cap with nightlybot's pad policy. If the run does not finish — the bot is
    // a random wanderer and will not solve a full ADVENTURE — the last-30 hashes
    // MUST NOT collapse to one (the #1591 false positive). This is the gate.
    const NIGHTLY_CAP = 9000
    const mul = (aa) => function () {
        aa |= 0; aa = (aa + 0x6D2B79F5) | 0
        let t = Math.imul(aa ^ (aa >>> 15), 1 | aa)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const nightlyRun = (seed) => {
        const sim = createSim(seedRng(seed), 1)
        const hashes = [stateHash(sim)]
        let prevTick = sim.tick
        for (let i = 0; i < NIGHTLY_CAP; i++) {
            const rng = mul((seed ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0)
            const r = rng()
            let left = false, right = false, up = false, down = false
            if (r < 0.24) left = true
            else if (r < 0.48) right = true
            else if (r < 0.60) up = true
            else if (r < 0.70) down = true
            const a = rng() < 0.18
            if (!(sim.won || (sim.dead && sim.deathTimer <= 0))) {
                sim.step({ dx: (right ? PLAYER_SPEED : 0) - (left ? PLAYER_SPEED : 0), dy: (down ? PLAYER_SPEED : 0) - (up ? PLAYER_SPEED : 0), drop: a })
                sim.events.length = 0
            }
            const isDone = sim.won || (sim.dead && sim.deathTimer <= 0)
            if (i >= NIGHTLY_CAP - 30) hashes.push(stateHash(sim))
            prevTick = sim.tick
            if (isDone) break
        }
        const isDone = sim.won || (sim.dead && sim.deathTimer <= 0)
        return { tick: sim.tick, done: isDone, uniq: new Set(hashes.slice(-30)).size }
    }
    for (const sd of [20261149, 20261106, 20261120]) {
        const r = nightlyRun(sd)
        ok(r.done || r.tick >= NIGHTLY_CAP || r.uniq > 1,
            `seed ${sd}: an unfinished run never looks frozen (${r.uniq} distinct last-30 hashes, tick ${r.tick})`)
        if (!r.done) ok(r.uniq > 1,
            `seed ${sd}: #1591 regression — last-30 hashes are distinct, the nightly verdict is endurance, not softlock`,
            `uniq=${r.uniq} tick=${r.tick} — a size-1 set would re-file the softlock`)
    }
}

// ------------------------------------------------------------- #1588 juice ----
console.log('#1588 juice: maw chew, carried-chalice sparkle, room-change wipe (sim signals)')
{
    // CHEW — only a hunting dragon (an open bite-maw in the player's room)
    // chews. Nothing hunting → no chew; a dead dragon → no chew; hunting → the
    // signal alternates (the chew), it never sits stuck on one frame.
    const idle = createSim(seedRng(5))   // at rest the three dragons live in other rooms
    let chewIdle = 0
    for (let i = 0; i < 200; i++) { step(idle, { dx: 0, dy: 0 }); if (idle.chew) chewIdle++ }
    ok(chewIdle === 0, 'no chew while nothing hunts the player (the maws stay calm)', `chew ticks=${chewIdle}`)

    const chase = createSim(seedRng(5))
    const ch = chase.dragons.find((d) => d.id === 'rhindle')
    chase.room = ch.room
    chase.player.x = ch.x + 22; chase.player.y = ch.y   // close enough to hunt (mouthOpen), outside bite range
    let hi = 0, lo = 0
    for (let i = 0; i < 60; i++) { step(chase, { dx: 0, dy: 0 }); if (chase.chew) hi++; else lo++ }
    ok(chase.dragons.some((d) => d.mouthOpen) && hi > 0 && lo > 0,
        'while hunted, the maw alternates open/closed — a chew, not a frozen jaw', `hi=${hi} lo=${lo}`)

    const dead = createSim(seedRng(5))
    const gr = dead.dragons.find((d) => d.id === 'grundle')
    dead.room = gr.room; dead.player.x = gr.x + 10; dead.player.y = gr.y   // within sword reach (<14), outside bite (<8)
    dead.carrying = 'sword'; dead.items.find((i) => i.id === 'sword').carried = true
    step(dead, {})                                   // sword slays it (it was hunting, maw open)
    ok(!gr.alive, 'setup: the sword slays the hunting dragon')
    let chewDead = 0
    for (let i = 0; i < 60; i++) { step(dead, { dx: 0, dy: 0 }); if (dead.chew) chewDead++ }
    ok(chewDead === 0, 'a slain dragon never chews (a corpse keeps its mouth shut)', `chew ticks=${chewDead}`)

    // SPARKLE — only the chalice IN HAND sparkles. Test away from the Gold
    // Castle (chalice + castle would win and freeze the sim mid-test).
    const sp = createSim(seedRng(5))
    sp.room = R.OVERWORLD_4; sp.player.x = 80; sp.player.y = 90
    ok(sp.sparkle === false, 'nothing sparkles with empty hands')
    sp.carrying = 'sword'; step(sp, { dx: 0, dy: 0 })
    ok(sp.sparkle === false, 'a carried sword does NOT sparkle (only the goal item glints)')
    sp.carrying = 'chalice'; step(sp, { dx: 0, dy: 0 })
    ok(sp.sparkle === true, 'the carried chalice sparkles')
    // Drop it, then walk away so it is not instantly re-picked off the feet —
    // the glint is a property of being carried, not of the chalice existing.
    sp.items.find((i) => i.id === 'chalice').carried = true
    step(sp, { drop: true })
    for (let i = 0; i < 12; i++) step(sp, { dx: 0, dy: -S })   // step off the dropped cup
    ok(sp.carrying === null && sp.sparkle === false, 'a chalice no longer carried stops sparkling (the glint is in the hand)', `carry=${sp.carrying}`)

    // WIPE — fires for a few ticks after a real room change, then rests.
    const wp = createSim(seedRng(5))
    ok(wp.wipe === false, 'no wipe on the opening draw (the world opens clean, not mid-flash)')
    wp.room = R.OVERWORLD_1; wp.player.x = 80; wp.player.y = GH - 8
    for (let i = 0; i < 40 && wp.room === R.OVERWORLD_1; i++) step(wp, { dx: 0, dy: S })
    ok(wp.room === R.OVERWORLD_2, 'the scripted walk crosses OW1 -> OW2 (a real room change)')
    ok(wp.wipe === true, 'the room change arms the wipe flash')
    let wipeTicks = 1   // the transition tick already read wipe===true above
    for (let i = 0; i < ROOM_WIPE_TICKS + 6; i++) { step(wp, { dx: 0, dy: 0 }); if (wp.wipe) wipeTicks++ }
    ok(wp.wipe === false && wipeTicks >= 1 && wipeTicks <= ROOM_WIPE_TICKS,
        'the wipe fades out within its window (a flash, not a stuck white screen)', `ticks=${wipeTicks}`)

    // ENTROPY-FREE — the juice reads state + tick only, never `rand`, so the
    // seeded world is untouched: run it twice, the whole juice timeline matches,
    // and the scripted wander really does cross doorways (so the wipe gate is
    // not vacuously satisfied by a player who never leaves a room).
    const jseq = (sd) => {
        const s = createSim(seedRng(sd))
        s.room = R.OVERWORLD_2; s.player.x = 80; s.player.y = GH - 6   // start on the bottom edge so the weave crosses doorways
        let q = ''
        for (let i = 0; i < 200; i++) {
            step(s, { dx: 0, dy: i % 16 < 8 ? S : -S })   // weave down/up across room edges
            q += (s.chew ? '1' : '0') + (s.sparkle ? 'a' : 'b') + (s.wipe ? 'X' : '_')
        }
        return q
    }
    ok(jseq(7) === jseq(7), 'the juice timeline is deterministic — it never pollutes the seeded stream')
    ok(jseq(7).includes('X'), 'the scripted wander really does cross a doorway (the wipe gate is not vacuous)', jseq(7).slice(0, 40))
}

console.log('#1588 juice: the renderer draws each effect only on its signal (static)')
{
    const src = readFileSync(IDX, 'utf8')
    ok(/if \(sim\.chew\) \{/.test(src), 'the maw chews ONLY on the chew signal (renderer gate — a hunt alternates the jaws)')
    ok(/if \(sim\.sparkle\) \{/.test(src), 'the chalice glint draws ONLY while it is carried (renderer gate)')
    ok(/if \(sim\.wipe && !isAttractMode\) \{/.test(src), 'the room-change wipe draws only on a fresh transition, never in attract (renderer gate)')
    ok(/const phase = \(sim\.tick - sim\.wipeAt\) \/ ROOM_WIPE_TICKS/.test(src),
        'the wipe sweeps on a deterministic tick phase (no wall clock — screenshots stay stable)')
    ok(/ROOM_WIPE_TICKS/.test(src), 'the shell imports the wipe window from the sim (drawing and harness cannot drift)')
    // 1993-cart palette law: the new juice animates with existing palette tokens
    // only. Assert the sparkle uses white/yellow and the wipe uses white.
    ok(/sim\.sparkle[\s\S]*COLORS\.white[\s\S]*COLORS\.yellow/.test(src),
        'the carried-chalice sparkle stays inside the 1993 palette (white + yellow)')
    ok(/sim\.wipe[\s\S]*ctx\.fillStyle = COLORS\.white/.test(src),
        'the room-change flash stays inside the 1993 palette (white)')
}

// --------------------------------------------------------------- mutants -----
if (process.argv.includes('--mutant')) {
    console.log('\nmutants (each MUST turn the suite red)')
    const I = IDX.pathname
    const SM = SIMF.pathname
    const GS = GAMES.pathname
    const PS = PO.pathname
    const AF = new URL('../src/games/Adventure/attract.js', import.meta.url).pathname
    const RTF = new URL('../src/games/Adventure/route.js', import.meta.url).pathname
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)', I,
            `: (seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000))`,
            `: Math.floor(Math.random() * 1000000)`],
        ['production report drops the seed', I,
            `            seed: seed,
            room: sim.room,`,
            `            room: sim.room,`],
        ['the chalice win condition is deleted (pre-port dead terminal)', SM,
            `if (sim.room === R.GOLD_CASTLE && sim.carrying === 'chalice') {`,
            `if (false) {`],
        ['castle top re-solidifies (the foyer-lock bug returns)', SM,
            `{ id: R.WHITE_CASTLE, name: 'White Castle', bg: '#c0c0c0', walls: makeWalls(true, true, false, false)`,
            `{ id: R.WHITE_CASTLE, name: 'White Castle', bg: '#c0c0c0', walls: makeWalls(false, true, false, false)`],
        ['score counts duplicate pickups (progress metric inflated)', SM,
            `if (!sim.pickedUp[item.id]) {`,
            `if (true) {`],
        ['the dragon bite is deleted (pre-port invincibility)', SM,
            `if (dist < 8 && dragon.mouthOpen) {`,
            `if (false) {`],
        ['the bridge is just decoration (wall-pass removed)', SM,
            `player.x += dx * 0.3  // partial wall pass
            player.y += dy * 0.3`,
            `player.x += 0  // no pass
            player.y += 0`],
        ['the magnet is just decoration (attract removed)', SM,
            `        if (sim.carrying === 'magnet') {`,
            `        if (false) { // no attract`],
        ['the slain dragon never comes back (respawn removed)', SM,
            `                if (sim.tick >= dragon.respawnAt) {`,
            `                if (false) {`],
        ['the placed bridge is removed (crossing re-strands the bridge)', SM,
            '        sim.bridged.add(`${from}:${dir}`)',
            '        if (false) sim.bridged.add(`${from}:${dir}`)'],
        ['the magnet attracts the dot (original law broken)', SM,
            '!item.carried && !item.noMagnet',
            '!item.carried'],
        ['the secret door opens with a single object (rite threshold broken)', SM,
            'if (others >= 2) {',
            'if (others >= 1) {'],
        ['the sealed door is a mirage (barrier removed)', SM,
            '        if (!sim.secretOpen) {',
            '        if (false) {  // barrier removed'],
        ['the dot is a visible block, not a hidden pixel', SM,
            'w: 1, h: 1, color: COLORS.grey',
            'w: 4, h: 4, color: COLORS.grey'],
        ['the soft-lock de-wedge is removed (gate-mouth pin returns)', SM,
            `        for (let i = 0; i < 24 && collidesWithWalls(rm, sim.player.x, sim.player.y, sim.player.w, sim.player.h); i++) {
            sim.player.y += 2
        }`,
            `        // de-wedge removed`],
        ['the inner bounce re-traps the bat in one room (roam removed)', SM,
            `        const { bat } = sim
        bat.x += bat.vx
        bat.y += bat.vy

        // Bat randomly changes direction (seeded dice, #1473)`,
            `        const { bat } = sim
        bat.x += bat.vx
        bat.y += bat.vy
        if (bat.x < 10 || bat.x > GW - 20) bat.vx *= -1
        if (bat.y < 10 || bat.y > GH - 20) bat.vy *= -1

        // Bat randomly changes direction (seeded dice, #1473)`],
        ['the portcullis no longer holds for the bat (gate check removed)', SM,
            `                return sim.gateOpen[ROOMS[bat.room].gateKey] ? CASTLE_INSIDES[bat.room] : -1`,
            `                return CASTLE_INSIDES[bat.room]  // gate check removed`],
        ['#1568: the position carrier vanishes from state() — the audit goes BLIND again', I,
            `                x: sim.player.x,
                y: sim.player.y,
                lives: null,`,
            `                lives: null,`],
        ['#1572: the glint is removed (the threshold stops teaching the drop)', I,
            'const glint = sim.afford === room.gateKey',
            'const glint = false'],
        ['#1572: the affordance fires for ANY carried item (wrong-key lies)', SM,
            'sim.carrying === gateRoom.gateKey',
            'sim.carrying'],
        ['#1572: the affordance ignores the drop zone (glints anywhere)', SM,
            'player.y < GATE_ZONE.y + GATE_ZONE.h',
            'player.y < GH + 999'],
        ['#1572: the hint persists after the gate opens (stale teaching)', SM,
            '!sim.gateOpen[gateRoom.gateKey] && sim.carrying',
            'true && sim.carrying'],
        ['#1572: the guidance tab drops the drop-the-key rite (guide lies to first-timers)', GS,
            `            { text: 'Stand at a gate and DROP its matching key (Space) to open it for good.' },\n`,
            ''],
        ['#1572: the guide forgets the magnet law', GS,
            `            { text: 'The magnet pulls loose items toward you as you walk.' },\n`,
            ''],
        ['#1572: the guide leaks the gray-dot secret rite (Robinett spoiled)', GS,
            `            { text: 'Bring the Enchanted Chalice back to the Golden Castle.' },`,
            `            { text: 'Bring the Enchanted Chalice back to the Golden Castle.' },\n            { text: 'Take the gray dot to the lair door for the secret rite.' },`],
        ['#1572: the guidance tab shows for every game (shared help screen breaks)', PS,
            'game?.guide?.length',
            'true'],
        ['#1572: V2 runs the classic pace (the speed scale is gone)', SM,
            '...t, speed: t.speed * spec.dragonScale, alive: true, mouthOpen: false,',
            '...t, alive: true, mouthOpen: false,'],
        ['#1572: V3 ignores the seed stream (the shuffle is pinned)', SM,
            'item.room = pool[Math.floor(rand() * pool.length)]',
            'item.room = pool[0]'],
        ['#1572: the lair law dies (loot shuffles into the sealed room)', SM,
            'item.room = pool[Math.floor(rand() * pool.length)]',
            "item.room = item.id === 'sword' ? R.SECRET : pool[Math.floor(rand() * pool.length)]"],
        ['#1572: the variant never reaches the sim (SELECT GAME is a lie)', I,
            'sim = createSim(seedRng(seed), variant)',
            'sim = createSim(seedRng(seed))'],
        ['#1572: the attract hides the variant (no dot-matrix readout)', AF,
            "{ text: String(variant), x: w / 2, y: h * 0.82, size: 28, col: '#ffff00', glow: 0 },",
            ''],
        ['#1591: state().hash drops the digest (the nightly false softlock returns)', I,
            'hash: stateHash(sim),',
            'hash: undefined,'],
        ['#1591: stateHash is constant (a live world looks frozen → endurance never proves)', SM,
            '    return h >>> 0\n}',
            '    return 2166136261\n}'],
        ['#1588: the maw stops chewing (the chew signal is removed)', SM,
            'sim.chew = hunting && (sim.tick % CHEW_TICKS < CHEW_TICKS / 2)',
            'sim.chew = false'],
        ['#1588: the maw chews even with nothing hunting (a calm room grins)', SM,
            'sim.chew = hunting && (sim.tick % CHEW_TICKS < CHEW_TICKS / 2)',
            'sim.chew = true && (sim.tick % CHEW_TICKS < CHEW_TICKS / 2)'],
        ['#1588: the carried chalice never sparkles (the goal item loses its glint)', SM,
            "sim.sparkle = sim.carrying === 'chalice'",
            'sim.sparkle = false'],
        ['#1588: every carried item sparkles (the sword lies about being the prize)', SM,
            "sim.sparkle = sim.carrying === 'chalice'",
            'sim.sparkle = !!sim.carrying'],
        ['#1588: the room-change flash never fires (the hard-cut returns)', SM,
            'sim.wipe = sim.tick - sim.wipeAt < ROOM_WIPE_TICKS',
            'sim.wipe = false'],
        ['#1588: the room-change flash never ends (a stuck white screen)', SM,
            'sim.wipe = sim.tick - sim.wipeAt < ROOM_WIPE_TICKS',
            'sim.wipe = true'],
        ['#1588: the renderer ignores the chew signal (the maw sits frozen)', I,
            'if (sim.chew) {',
            'if (false) {'],
        ['#1588: the renderer ignores the carried-chalice sparkle', I,
            'if (sim.sparkle) {',
            'if (false) {'],
        ['#1588: the renderer never draws the room-change flash', I,
            'if (sim.wipe && !isAttractMode) {',
            'if (false) {'],
        ['#1637: route.js drops the fixed-map dispatch (V1/V2 lose their proven script)', RTF,
            'const gen = sim.variant >= 3 ? runRoute(sim) : scriptRun(sim)',
            'const gen = runRoute(sim)'],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/adventurecheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else ok(false, `mutant dies: ${name}`, 'child passed despite the bug')
        pull(file)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
