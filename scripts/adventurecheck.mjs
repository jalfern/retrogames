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
import { createSim, ROOMS, R, GW, GH, PLAYER_SPEED, MAX_ITEMS, DRAGON_RESPAWN_TICKS, EXITS, CASTLE_INSIDES, SIDE_GAP_Y, SIDE_GAP_H } from '../src/games/Adventure/sim.js'
import { seedRng } from '../src/utils/gameContract.js'
import { plant, pull } from './lib/mutateguard.mjs'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const S = PLAYER_SPEED
const IDX = new URL('../src/games/Adventure/index.jsx', import.meta.url)
const SIMF = new URL('../src/games/Adventure/sim.js', import.meta.url)
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
    function driveTo(sim, tx, ty, stop = 1.2) {
        const p = sim.player
        for (let i = 0; i < 5000; i++) {
            const ddx = tx - p.x, ddy = ty - p.y
            if (Math.abs(ddx) <= stop && Math.abs(ddy) <= stop) return true
            const r0 = sim.room
            const ux = Math.sign(ddx) * S, uy = Math.sign(ddy) * S
            const attempt = (dx, dy) => {
                const px = p.x, py = p.y
                step(sim, { dx, dy })
                if (sim.room !== r0) return true
                return Math.abs(p.x - px) > 0.01 || Math.abs(p.y - py) > 0.01
            }
            let moved = false
            if (Math.abs(ddx) > stop && Math.abs(ddy) > stop) moved = attempt(ux, uy) || attempt(ux, 0) || attempt(0, uy)
            else if (Math.abs(ddx) > stop) moved = attempt(ux, 0)
            else moved = attempt(0, uy)
            if (!moved) return false
            if (sim.dead || sim.won) return false
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
    const hop = (sim, from, to) => {  // walk one room edge: anchor, then push
        const edge = neighbors(sim, from).find(([, n]) => n === to)
        if (!edge) return false
        const d = edge[0]
        if (d === 'up' && !driveTo(sim, 80, 16)) return false
        if (d === 'down' && !driveTo(sim, 80, GH - 24)) return false
        if (d === 'left' && !driveTo(sim, 16, SIDE_GAP_Y + SIDE_GAP_H / 2)) return false
        if (d === 'right' && !driveTo(sim, GW - 24, SIDE_GAP_Y + SIDE_GAP_H / 2)) return false
        return cross(sim, d, to, 400)
    }
    const walkTo = (sim, from, to, avoidDragons = true) => {
        // prefer paths that never cross a dragon's home room (the shelters
        // already exclude them, but the route between can — a smart player
        // detours around Yorgle when the map allows); fall back to the plain
        // graph when the dragon rooms are the only way.
        const bfs = (skipDragons) => {
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
        const prev = bfs(avoidDragons) || bfs(false)
        if (!prev) return false
        const path = [to]
        while (prev.get(path[0]) !== null) path.unshift(prev.get(path[0]))
        for (let i = 0; i + 1 < path.length; i++) if (!hop(sim, path[i], path[i + 1])) return false
        return sim.room === to
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
            if (!walkTo(sim, startRoom, shelter)) return false
            for (let i = 0; i < budget && sim.bat.carrying === id; i++) {
                step(sim, {})
                if (sim.dead || sim.won) return false
            }
            if (sim.bat.carrying === id) return false
        }
        if (!walkTo(sim, sim.room, item.room)) return false
        if (!driveTo(sim, item.x, item.y)) return false
        if (sim.carrying !== id) return false  // re-stolen mid-walk
        if (!walkTo(sim, sim.room, startRoom)) return false
        return driveTo(sim, backX, backY)
    }
    function winRun(seed) {
        const sim = createSim(seedRng(seed))
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

// --------------------------------------------------------------- mutants -----
if (process.argv.includes('--mutant')) {
    console.log('\nmutants (each MUST turn the suite red)')
    const I = IDX.pathname
    const SM = SIMF.pathname
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
