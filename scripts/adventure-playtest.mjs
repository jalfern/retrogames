// Throwaway playtest driver for #1556 (ADVENTURE difficulty curve / bat routing /
// sword findability) + #1560 (bat roam + steal recovery). Not a new framework —
// numbers only; any law that comes out of it lands in adventurecheck.
// Run from the qa worktree root.
import { createSim, ROOMS, R, GW, GH, PLAYER_SPEED, EXITS, CASTLE_INSIDES, SIDE_GAP_Y, SIDE_GAP_H } from '../src/games/Adventure/sim.js'
import { seedRng } from '../src/utils/gameContract.js'

const S = PLAYER_SPEED
const step = (sim, inp) => { sim.step(inp); sim.events.length = 0 }
const pctl = (arr, q) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))] }
const pct = (n, d) => `${(100 * n / d).toFixed(1)}%`

// ---------------------------------------------------------------- A. NOVICE ----
// Random-walk agent: holds a direction 30-90 ticks, changes at walls/transitions,
// never drops items (novices don't discover the gate rite from the pad alone).
console.log('=== A. NOVICE random-walk, 300 seeds x 5000 ticks ===')
{
    const N = 300
    let deaths = 0, wins = 0
    const surv = [], killerRooms = {}, reach = {}
    const stealCounts = []
    let reachedGoldKeyRoom = 0, swordByDeath = 0
    for (let sd = 1; sd <= N; sd++) {
        const sim = createSim(seedRng(sd))
        const seen = new Set([sim.room])
        let dir = ['up', 'down', 'left', 'right'][Math.floor(seedRng(sd * 7919)() * 4)]
        let hold = 30 + Math.floor(seedRng(sd * 104729)() * 60)
        let steals = 0, deaths0 = 0
        for (let t = 0; t < 5000 && !sim.won; t++) {
            if (sim.dead && sim.deathTimer <= 0) break
            const r0 = sim.room, x0 = sim.player.x, y0 = sim.player.y
            const v = { up: [0, -S], down: [0, S], left: [-S, 0], right: [S, 0] }[dir]
            step(sim, { dx: v[0], dy: v[1] })
            if (sim.events.includes('steal')) steals++
            seen.add(sim.room)
            hold--
            if (--hold <= 0 || (sim.room === r0 && sim.player.x === x0 && sim.player.y === y0)) {
                const rnd = seedRng(sd * 1000003 + t)()
                dir = ['up', 'down', 'left', 'right'][Math.floor(rnd * 4)]
                hold = 30 + Math.floor(rnd * 60)
            }
            if (sim.dead && deaths0 === 0) { deaths0 = 1; killerRooms[sim.room] = (killerRooms[sim.room] || 0) + 1; surv.push(t); if (sim.carrying === 'sword') swordByDeath++ }
        }
        if (sim.dead) deaths++
        if (sim.won) wins++
        stealCounts.push(steals)
        for (const r of seen) reach[r] = (reach[r] || 0) + 1
        if (seen.has(R.OVERWORLD_4)) reachedGoldKeyRoom++
    }
    console.log(`deaths ${pct(deaths, N)}  wins ${pct(wins, N)}`)
    console.log(`survival ticks: p10 ${pctl(surv, 0.1)}  median ${pctl(surv, 0.5)}  p90 ${pctl(surv, 0.9)}`)
    console.log(`killed-in room dist: ${JSON.stringify(killerRooms)}  (roomIds: 7=Blue Lab 1/Yorgle, 16=Lair/Rhindle)`)
    console.log(`sword held at first death: ${pct(swordByDeath, deaths)} of deaths`)
    console.log(`reached OW4 (goldKey room): ${pct(reachedGoldKeyRoom, N)}`)
    const names = { 0: 'GoldCastle', 1: 'GoldFoyer', 2: 'OW1', 3: 'OW2', 4: 'OW3', 5: 'OW4', 6: 'OW5', 7: 'BL1', 8: 'BL2', 9: 'BL3', 10: 'BlackC', 11: 'BlackF', 12: 'RedL1', 13: 'RedL2', 14: 'WhiteC', 15: 'WhiteF', 16: 'Lair', 17: 'Secret' }
    const reachPct = Object.entries(reach).sort((a, b) => b[1] - a[1]).map(([r, c]) => `${names[r]}:${pct(c, N)}`)
    console.log(`room reach: ${reachPct.join(' ')}`)
    console.log(`bat steals/1000 ticks median ${pctl(stealCounts.map((s) => s / 5), 0.5)} p90 ${pctl(stealCounts.map((s) => s / 5), 0.9)}`)
}

// ------------------------------------------------------------- B. SKILLED ------
// Scripted win route (mirrors adventurecheck's winRun), with and without the
// sword detour; measures win rate, time-to-win and Yorgle encounters.
{
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
    // #1560 steal recovery (same helper as adventurecheck's winRun): the bat
    // now roams and steals route-critical items in the player's room; a drop
    // always lands in the player's room (the bat swaps onto a loose partner),
    // so recovery = walk to the nearest room with a loose partner (no dragon),
    // wait for the swap, walk to the drop spot, return to the route point.
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
    const hop = (sim, from, to) => {
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
        if (sim.carrying !== id) return false
        if (!walkTo(sim, sim.room, startRoom)) return false
        return driveTo(sim, backX, backY)
    }
    function swordTrip(sim) {
        // from BLACK_CASTLE start position: grab goldKey at OW4, park at gold gate, take sword
        const T = (tx, ty) => driveTo(sim, tx, ty)
        if (!cross(sim, 'down', R.OVERWORLD_2)) return 'exit'
        sim.player.y = 90
        if (!cross(sim, 'right', R.OVERWORLD_4)) return 'ow4'
        T(116, 86); if (sim.carrying !== 'goldKey') return 'no goldKey'
        sim.player.x = 80
        if (!cross(sim, 'up', R.OVERWORLD_1)) return 'ow1'
        if (!cross(sim, 'up', R.GOLD_CASTLE)) return 'goldcastle'
        sim.player.x = 80; sim.player.y = 32
        step(sim, { drop: true })
        for (let i = 0; i < 3 && !sim.gateOpen.goldKey; i++) step(sim, {})
        if (!sim.gateOpen.goldKey) return 'gateG'
        if (!cross(sim, 'up', R.GOLD_FOYER)) return 'foyerG'
        T(76, 96); if (sim.carrying !== 'sword') return 'no sword'
        T(80, 12); if (!cross(sim, 'up', R.GOLD_CASTLE)) return 'outG'
        sim.player.y = 150
        if (!cross(sim, 'down', R.OVERWORLD_1)) return 'ow1b'
        sim.player.y = 90
        if (!cross(sim, 'right', R.OVERWORLD_4)) return 'ow4b'
        sim.player.x = 80
        if (!cross(sim, 'down', R.OVERWORLD_3)) return 'ow3b'
        sim.player.x = 80
        if (!cross(sim, 'down', R.BLACK_CASTLE)) return 'blackcastle'
        return 'ok'
    }
    function winRun(sd, withSword, trackSteals = false) {
        const sim = createSim(seedRng(sd))
        const T = (tx, ty) => driveTo(sim, tx, ty)
        let yorgleTicks = 0, yorgleSeen = 0
        let critSteals = 0
        const CRIT = ['blackKey', 'whiteKey', 'bridge', 'chalice', 'goldKey', 'sword']
        const wrapped = sim.step.bind(sim)
        // count ticks spent in the same room as living yorgle + (#1560) steals
        // of route-critical items by the bat
        sim.step = (inp) => {
            wrapped(inp)
            const y = sim.dragons[0]
            if (sim.room === y.room && y.alive) { yorgleTicks++; yorgleSeen = 1 }
            if (trackSteals && sim.events.includes('steal') && CRIT.includes(sim.bat.carrying)) critSteals++
        }
        sim.player.x = 80
        if (withSword) {
            const r = swordTrip(sim); if (r !== 'ok') return { ok: false, why: `sword:${r}` }
            // swordTrip ends at BLACK_CASTLE: rejoin the lab route via OW3 -> OW2
            if (!cross(sim, 'down', R.OVERWORLD_3)) return { ok: false, why: 'ow3 rejoin' }
            if (!cross(sim, 'up', R.OVERWORLD_2)) return { ok: false, why: 'ow2 rejoin' }
        } else if (!cross(sim, 'down', R.OVERWORLD_2)) return { ok: false, why: 'ow2' }
        sim.player.y = 90
        if (!cross(sim, 'left', R.BLUE_LAB_1)) return { ok: false, why: 'lab1a' }
        if (!T(140, 90) || !T(140, 170) || !T(80, 170)) return { ok: false, why: 'lab1 descent' }
        if (!cross(sim, 'down', R.BLUE_LAB_2)) return { ok: false, why: 'lab2' }
        T(76, 92)
        if (sim.carrying !== 'blackKey') {
            if (!recover(sim, 'blackKey', 76, 92)) return { ok: false, why: 'no blackKey' }
        }
        if (sim.dragons[0].alive && sim.room === sim.dragons[0].room) return { ok: false, why: 'yorgle blocked lab exit' }
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
        step(sim, { drop: true })
        if (!T(66, 86)) return { ok: false, why: 'red lower corridor' }
        if (sim.carrying !== 'whiteKey') {
            if (!recover(sim, 'whiteKey', 66, 86)) return { ok: false, why: 'no whiteKey' }
        }
        if (!T(140, 86)) return { ok: false, why: 'red lower right' }
        if (!T(140, 12)) return { ok: false, why: 'red column up' }
        if (!T(80, 12)) return { ok: false, why: 'red top exit' }
        if (!cross(sim, 'up', R.BLACK_FOYER)) return { ok: false, why: 'foyer out red' }
        if (!T(65, 24)) return { ok: false, why: 'key dodge 2' }
        if (!cross(sim, 'up', R.BLACK_CASTLE)) return { ok: false, why: 'castleB3' }
        sim.player.y = 150
        if (!cross(sim, 'down', R.OVERWORLD_3)) return { ok: false, why: 'ow3b' }
        sim.player.y = 90
        if (!cross(sim, 'right', R.OVERWORLD_4)) return { ok: false, why: 'ow4b' }
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
        return sim.won ? { ok: true, tick: sim.tick, yorgleTicks, yorgleSeen, critSteals } : { ok: false, why: `end room=${sim.room} carry=${sim.carrying} dead=${sim.dead}` }
    }
    for (const withSword of [false]) {
        // NOTE (playtest finding): the sword detour is scriptable but cannot
        // simply prepend — carry is ONE slot, so holding the sword blocks every
        // key/chalice pickup; a sword-carrying route must park the sword at a
        // waypoint and re-arm for the Yorgle pass. Authentic single-slot
        // constraint (#1556 finding in the issue note); measuring the full
        // park/re-arm route is left to the follow-up playtest pass.
        const N = 50, why = {}
        let wins = 0, bSteals = 0
        const ticks = [], yorgle = []
        for (let sd = 1; sd <= N; sd++) {
            const r = winRun(sd, withSword, true)
            if (r.ok) { wins++; ticks.push(r.tick); yorgle.push(r.yorgleTicks); bSteals += r.critSteals } else why[r.why] = (why[r.why] || 0) + 1
        }
        console.log(`=== B. skilled route ${withSword ? 'WITH sword detour' : 'no sword'} (${N} seeds) ===`)
        console.log(`wins ${pct(wins, N)} ${wins ? `win ticks median ${pctl(ticks, 0.5)} p90 ${pctl(ticks, 0.9)}` : ''} ${Object.keys(why).length ? `failures ${JSON.stringify(why)}` : ''}  bat route-critical steals ${bSteals}`)
        if (wins) console.log(`ticks shared-room with living Yorgle: median ${pctl(yorgle, 0.5)} p90 ${pctl(yorgle, 0.9)}`)
    }
    // C.1 + C.2 live in this block: C.2 needs winRun (block-scoped above).
    console.log('=== C.1 bat room visits, 20 seeds x 10000 ticks (parked player) ===')
    const visits = []
    for (let sd = 1; sd <= 20; sd++) {
        const sim = createSim(seedRng(sd))
        const seen = new Set([sim.bat.room])
        for (let t = 0; t < 10000; t++) { step(sim, { dx: 0, dy: 0 }); seen.add(sim.bat.room) }
        visits.push(seen.size)
    }
    console.log(`distinct rooms visited: median ${pctl(visits, 0.5)}  p10 ${pctl(visits, 0.1)}  p90 ${pctl(visits, 0.9)}  (pre-fix: 1)`)
    console.log('=== C.2 route-critical steals + recovery on the skilled route, 100 seeds ===')
    let wins = 0, totalCritSteals = 0, recoveredRuns = 0
    const why = {}
    const N = 100
    for (let sd = 1; sd <= N; sd++) {
        const r = winRun(sd, false, true)
        if (r.ok) {
            wins++
            totalCritSteals += r.critSteals
            if (r.critSteals > 0) recoveredRuns++
        } else why[r.why] = (why[r.why] || 0) + 1
    }
    console.log(`wins ${pct(wins, N)} ${Object.keys(why).length ? `failures ${JSON.stringify(why)}` : ''}`)
    console.log(`route-critical steals total ${totalCritSteals}  (${pct(recoveredRuns, N)} of runs needed recovery)`)
}

// ------------------------------------------------------ C. BAT ROAM (#1560) ----
// The bat's 1993 signature: roving the world and swapping items. Pre-#1560
// the inner bounce kept it in ONE room for the whole run (median 1 room /
// 10000 ticks, 20 seeds) and its item-steal almost never fired. C.1 measures
// the roam itself (parked player — the roam is player-independent); C.2
// measures interference on the skilled route: how often the bat takes a
// route-critical item and whether steal-recovery keeps the run green (the
// numbers size the recovery budget). Both run inside the B block above —
// C.2 needs the block-scoped winRun.
