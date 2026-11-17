// qa-smash-seeds — the #2530 honest 97-roll-seed audit (studio, 2026-11-17).
// Drives the SAME loop plan() drives (decide -> step) over every seed the
// cabinet can roll (0..96) and classifies each outcome:
//   WON / LOST            — the game ended
//   STUCK@x,y rN          — score, room, lives and weapon frozen >12k ticks
//                           with the body inside an 8px box (in-place wedge)
//   ROAM rN frozen=T      — score/room/lives/weapon frozen >12k ticks while
//                           the body paces a wider area (unresolved-last-threat)
// Baseline measured at b90dd96 (rebased qa/smash-wedge-2530): 66 won,
// 6 lost, 7 STUCK {17,19,20,34,41,48,62}, 18 ROAM
// {18,23,28,30,32,43,44,47,54,55,57,60,65,66,73,86,92,95}.
// Re-measured at 9ba4e31 (pathOn parent re-key fix): 80 won, 13 lost,
// 0 stuck, 4 ROAM {20,53,60,66}. Re-measured after the goal-progress stall
// detector (studio, 2026-11-17): 81 won, 13 lost, 0 stuck, 3 ROAM
// {53,60,66} — seed 20 (static turret, east-commit/volt-back ping-pong) now
// wins; 53's mechanism is measured (a dropped flame barrel sits ON the
// route's own cell — the #2032 avoid law and the router fight at the d<=16
// boundary forever), 60 and 66 stay tracked on the issue. The fix must drive
// the remaining class to zero, keep the nine certified pilot seeds winning,
// and then graduate into smashcheck's roll-seeds gate (done for the fixed
// seeds; seed 20 joined).
// Usage: node scripts/qa-smash-seeds.mjs [maxTicks]

const { makeGame, step } = await import('../src/games/SmashTV/sim.js')
const { decide } = await import('../src/games/SmashTV/planner.js')
const MAX = Number(process.argv[2] || 60000)
const won = [], lost = [], stuck = [], roam = []
for (let seed = 0; seed < 97; seed++) {
    const gs = makeGame(seed)
    let sig = '', frozen = 0, minx = 0, maxx = 0, miny = 0, maxy = 0
    while (!gs.end && gs.tick < MAX) {
        step(gs, decide(gs))
        gs.events.length = 0
        const s = `${gs.score}|${gs.room}|${gs.lives}|${gs.weapon}`
        if (s !== sig) {
            sig = s; frozen = 0
            minx = maxx = gs.player.x; miny = maxy = gs.player.y
        } else {
            if (gs.player.x < minx) minx = gs.player.x
            if (gs.player.x > maxx) maxx = gs.player.x
            if (gs.player.y < miny) miny = gs.player.y
            if (gs.player.y > maxy) maxy = gs.player.y
            frozen++
            if (frozen > 12000 && Math.max(maxx - minx, maxy - miny) < 8) break
        }
    }
    if (gs.end === 'win') won.push(seed)
    else if (gs.end) lost.push(seed)
    else if (frozen > 12000 && Math.max(maxx - minx, maxy - miny) < 8) stuck.push(`seed ${seed}@${gs.player.x.toFixed(0)},${gs.player.y.toFixed(0)} r${gs.room}`)
    else roam.push(`seed ${seed} r${gs.room} frozen=${frozen}`)
}
console.log(`won=${won.length} lost=${lost.length} stuck=${stuck.length} roam=${roam.length}`)
if (lost.length) console.log(`lost:  ${lost.join(',')}`)
if (stuck.length) console.log(`stuck: ${stuck.join(' ')}`)
if (roam.length) console.log(`roam:  ${roam.join(' ')}`)
