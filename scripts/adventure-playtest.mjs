// Throwaway playtest driver for #1556 (ADVENTURE difficulty curve / bat routing /
// sword findability). Not a new framework — numbers only; any law that comes out
// of it lands in adventurecheck. Run from the qa worktree root.
import { createSim, ROOMS, R, GW, GH, PLAYER_SPEED } from '../src/games/Adventure/sim.js'
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
    function winRun(sd, withSword) {
        const sim = createSim(seedRng(sd))
        const T = (tx, ty) => driveTo(sim, tx, ty)
        let yorgleTicks = 0, yorgleSeen = 0
        const wrapped = sim.step.bind(sim)
        // count ticks spent in the same room as living yorgle
        sim.step = (inp) => { wrapped(inp); const y = sim.dragons[0]; if (sim.room === y.room && y.alive) { yorgleTicks++; yorgleSeen = 1 } }
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
        if (sim.carrying !== 'blackKey') return { ok: false, why: 'no blackKey' }
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
        if (sim.carrying !== 'bridge') return { ok: false, why: 'no bridge' }
        sim.player.y = 90
        if (!cross(sim, 'down', R.OVERWORLD_3)) return { ok: false, why: 'ow3c' }
        if (!cross(sim, 'down', R.BLACK_CASTLE)) return { ok: false, why: 'castleB2' }
        if (!cross(sim, 'up', R.BLACK_FOYER)) return { ok: false, why: 'foyerB' }
        if (!cross(sim, 'down', R.RED_LAB_1)) return { ok: false, why: 'red floor' }
        if (!T(140, 12)) return { ok: false, why: 'red enter' }
        if (!T(140, 86)) return { ok: false, why: 'red right column' }
        step(sim, { drop: true })
        if (!T(66, 86)) return { ok: false, why: 'red lower corridor' }
        if (sim.carrying !== 'whiteKey') return { ok: false, why: 'no whiteKey' }
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
        if (sim.carrying !== 'chalice') return { ok: false, why: 'no chalice' }
        T(80, 12)
        if (!cross(sim, 'up', R.WHITE_CASTLE)) return { ok: false, why: 'castleW out' }
        sim.player.y = 150
        if (!cross(sim, 'down', R.OVERWORLD_4)) return { ok: false, why: 'ow4 home' }
        sim.player.x = 80
        if (!cross(sim, 'up', R.OVERWORLD_1)) return { ok: false, why: 'ow1 home' }
        for (let i = 0; i < 200 && !sim.won; i++) step(sim, { dx: 0, dy: -S })
        return sim.won ? { ok: true, tick: sim.tick, yorgleTicks, yorgleSeen } : { ok: false, why: `end room=${sim.room} carry=${sim.carrying} dead=${sim.dead}` }
    }
    for (const withSword of [false]) {
        // NOTE (playtest finding): the sword detour is scriptable but cannot
        // simply prepend — carry is ONE slot, so holding the sword blocks every
        // key/chalice pickup; a sword-carrying route must park the sword at a
        // waypoint and re-arm for the Yorgle pass. Authentic single-slot
        // constraint (#1556 finding in the issue note); measuring the full
        // park/re-arm route is left to the follow-up playtest pass.
        const N = 50, why = {}
        let wins = 0
        const ticks = [], yorgle = []
        for (let sd = 1; sd <= N; sd++) {
            const r = winRun(sd, withSword)
            if (r.ok) { wins++; ticks.push(r.tick); yorgle.push(r.yorgleTicks) } else why[r.why] = (why[r.why] || 0) + 1
        }
        console.log(`=== B. skilled route ${withSword ? 'WITH sword detour' : 'no sword'} (${N} seeds) ===`)
        console.log(`wins ${pct(wins, N)} ${wins ? `win ticks median ${pctl(ticks, 0.5)} p90 ${pctl(ticks, 0.9)}` : JSON.stringify(why)}`)
        if (wins) console.log(`ticks shared-room with living Yorgle: median ${pctl(yorgle, 0.5)} p90 ${pctl(yorgle, 0.9)}`)
    }
}

// ------------------------------------------------------ C. BAT KEY THIEVERY ----
// The skilled route assumes keys sit where they fell. How often does the bat
// move blackKey/whiteKey/bridge off their template spot before the route needs
// them, and can the run recover?
{
    console.log('=== C. bat interference with route-critical items, 100 seeds ===')
    let stolenBeforeNeeded = 0, neverRecovered = 0
    const N = 100
    for (let sd = 1; sd <= N; sd++) {
        const sim = createSim(seedRng(sd))
        let stealTarget = 0, recovered = 0
        for (let t = 0; t < 8000; t++) {
            step(sim, { dx: 0, dy: 0 })
            if (sim.events.includes('steal')) {
                const b = sim.bat
                if (['blackKey', 'whiteKey', 'bridge'].includes(b.carrying)) stealTarget = sim.tick
            }
            // recovery: bat drops by stealing another loose item in same room
            if (stealTarget && !sim.bat.carrying && sim.tick > stealTarget) { recovered = 1; stealTarget = 0 }
            if (sim.dead && sim.deathTimer <= 0) break
        }
        const bat = sim.bat
        const critCarried = ['blackKey', 'whiteKey', 'bridge'].includes(bat.carrying)
        if (critCarried) { stolenBeforeNeeded++; if (!recovered) neverRecovered++ }
    }
    console.log(`route-critical item in bat claws at tick 8000: ${pct(stolenBeforeNeeded, N)}; never dropped all run: ${pct(neverRecovered, N)}`)
}
