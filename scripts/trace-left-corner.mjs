// #3657 item 2 — measured left-corner fall column trace.
// Logs every barrel exit/despawn: which girder end it left, the cx it
// reached, where it landed (or the void). Run: node scripts/trace-left-corner.mjs
import { makeRun, tickDonkeyKong, getPlatformY, GW, GH } from '../src/games/DonkeyKong/sim.js'

let voidLeft = 0, landings = {}, despawns = []
for (let seed = 1; seed <= 12; seed++) {
    const gs = makeRun(seed, { human: true })
    let prev = new Map()
    for (let t = 0; t < 9000; t++) {
        tickDonkeyKong(gs, {})
        const cur = new Map()
        for (const b of gs.barrels) {
            const cx = b.x + b.w / 2, fy = b.y + b.h
            cur.set(b, { cx, fy, falling: b.falling, onLadder: b.onLadder, x: b.x })
            const p = prev.get(b)
            if (p) {
                // record the transition into falling off a girder LEFT end
                if (!p.falling && b.falling && !b.onLadder && !p.onLadder) {
                    const key = `exit cx≈${p.cx.toFixed(1)} y≈${p.fy.toFixed(1)}`
                    if (p.cx < 30) landings[key] = (landings[key] || 0) + 1
                }
                // barrel gone this tick (spliced): classify by last cx
                if (!cur.has(b) && !b.onLadder) {
                    voidLeft++
                    despawns.push({ seed, t, cx: p.cx.toFixed(1), y: p.fy.toFixed(1) })
                }
            }
        }
        prev = cur
    }
}
console.log('left-end exits (cx<30):', landings)
console.log('barrels last-seen at left (cx of final tick):', despawns.length)
const cxs = despawns.map(d => parseFloat(d.cx))
if (cxs.length) {
    console.log('cx range at void:', Math.min(...cxs).toFixed(1), '→', Math.max(...cxs).toFixed(1))
    console.log('sample:', despawns.slice(0, 8))
}
// where does a faller from girder 2's left end cross p1's surface line?
const p1 = { x: 0, y: 192, w: 208, slope: 0.035 }
const p2end = getPlatformY({ x: 16, y: 160, w: 208, slope: -0.035 }, 16)
let vy = 0, y = p2end + 8, x = 16, ticks = 0
while (y < getPlatformY(p1, Math.max(x, 0)) + 8 && ticks < 60) { vy += 0.25; y += vy; x -= 1.2; ticks++ }
console.log(`analytic: exits cx=16 foot≈${(p2end + 8).toFixed(1)}, meets girder-1 line at cx≈${x.toFixed(1)} after ${ticks} ticks (girder 1 starts x=0 → ${x >= 0 ? 'CATCH' : 'MISS by ' + (-x).toFixed(1)}px)`)
