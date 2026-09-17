// RACCOON HEIST — "who is actually inside the wall?" probe.
//
//   npm run dev                # in another terminal
//   npm run cornerprobe [-- --throttle 64 --job 0]
//
// The pinch corner at a low frame rate produced two accusations that need opposite fixes:
// *"the raccoon walks into the mesh"* (a sim/`blocked()` bug) and *"the camera is inside
// brick"* (a rig bug). `near()` could not tell them apart — its nearest hit was the
// actor's own forearm (`fur1` = crew 1's fur, a metre of rig around the point that is its
// feet), and for a whole round the camera was blamed for a wall nobody had walked into.
// So this asks the collision model directly, once per **rendered frame**, and prints:
//
//   centre  metres from the actor's CENTRE to solid brick (positive = outside the level)
//   body    how deep the 0.32 m collider overlaps brick (positive = a step went un-refused)
//   cam     the camera: `INSIDE` = in grid geometry, else metres of world in front
//
// Two numbers rather than one, because they have different owners: `centre`/`body` are
// movement (`blocked()` refuses such a step, so a positive there is a sim bug), `cam` is
// the rig. Measured here at 5 fps in the pinch corner, the actor's centre bottoms out at
// exactly 0.32 m — the collider, touching, never through — and every buried camera frame
// has a clean body under it. Not a gate — `heistplay` is the gate; this is what you reach
// for when that gate goes red in the camera section and you need to know whose fault it is.

import { openGame, launch, requireDevServer, opt, throttleCPU } from './lib/harness.mjs'

const URL0 = opt(process.argv, '--url', process.env.HEIST_URL || 'http://localhost:5173/retrogames/raccoon-heist?pad=1&lite=1')
const THROTTLE = +opt(process.argv, '--throttle', 64)
const JOB = +opt(process.argv, '--job', 0)

await requireDevServer(URL0)
const browser = await launch()
const page = await openGame(browser, { url: URL0, hook: '__heistTest', viewport: { width: 640, height: 426 } })
if (THROTTLE) await throttleCPU(page, THROTTLE)

const out = await page.evaluate(async (job) => {
    const t = window.__heistTest
    const log = []

    // World-second sleeps (see `__simSleep` in scripts/heistplay.mjs): on a throttled box
    // a wall second is not a game second, and a probe that waits on the wall visits far
    // less of the level than it thinks it did.
    window.__simRate = 1
    window.__fps = 0
    let prev = null, fPrev = 0
    const rate = () => {
        const s = t.state()?.sim?.elapsed ?? 0, w = performance.now() / 1000
        if (prev && s > prev.s) {
            const dw = w - prev.w
            if (dw > 0.04) window.__simRate = window.__simRate * 0.6 + ((s - prev.s) / dw) * 0.4
        }
        prev = { s, w }
    }
    const sleep = async (secs) => {
        rate()
        await new Promise(r => setTimeout(r, Math.max(120, 1000 * secs / Math.min(4, Math.max(0.05, window.__simRate)))))
    }

    // Sample at the END of a rendered frame: this rAF is registered after the game's, so
    // `update()` — and all of this frame's catch-up ticks — has already run.
    ;(function tick(ts) {
        if (fPrev) {
            const dt = (ts - fPrev) / 1000
            if (dt > 0.02) window.__fps = window.__fps * 0.7 + (1 / dt) * 0.3
        }
        fPrev = ts
        const e = t.engine()
        if (e && t.state().screen === 'play') {
            const d = e.bodyDepth(), c = e.camClear()
            log.push({
                x: d.x, z: d.z, cell: d.cell, grid: d.grid, prop: d.prop, propAt: d.propAt, wall: d.wall,
                cam: c.inside ? 'INSIDE' : c.clear, dist: c.dist, side: c.side,
            })
        }
        requestAnimationFrame(tick)
    })(performance.now())

    t.job(job)
    await sleep(0.8)
    t.press(); await sleep(0.5)             // attract -> brief
    t.press(); await sleep(1.0)              // brief  -> play

    const thumb = (rx, ryUp) => t.stick(rx, -ryUp)
    const spot = t.tightSpot()
    t.moveTo(spot.x, spot.z)
    await sleep(0.2)
    t.setCam(Math.atan2(-spot.dx, -spot.dz), 0.5, 9)   // camera on the wall side
    await sleep(0.5)
    log.length = 0
    thumb(0, -1)                             // back into the wall, the way a player does it
    for (let i = 0; i < 8; i++) await sleep(0.5)
    thumb(0, 0)
    await sleep(0.5)

    // And the same walk with the camera on the *open* side, so a wall-only story can be
    // told apart from a corner-only one.
    t.setCam(Math.atan2(spot.dx, spot.dz), 0.5, 9)
    thumb(0, 1)
    for (let i = 0; i < 6; i++) await sleep(0.5)
    thumb(0, 0)
    await sleep(0.4)

    return { spot, log, depths: t.depths(), fps: window.__fps, rate: window.__simRate }
}, JOB)

const L = out.log
const worstGrid = Math.max(...L.map(f => f.grid))
const worstProp = Math.max(...L.map(f => f.prop))
const row = (d) => `@${d.x},${d.z} ${d.cell} centre ${d.wall} m from brick, body ${d.grid}, prop ${d.prop}${d.propAt ? ' (' + d.propAt.join('/') + ')' : ''}`
console.log(`\ncorner ${JSON.stringify([out.spot.x, out.spot.z])} dir ${out.spot.dx},${out.spot.dz}` +
    ` @ ${out.fps.toFixed(1)} fps, ${out.rate.toFixed(2)}x real time (throttle ${THROTTLE})`)
console.log(`  worst actor depth: centre ${Math.min(...L.map(f => f.wall))} m from brick, body ${worstGrid} m, prop ${worstProp} m`)
console.log(`  buried camera frames:    ${L.filter(f => f.cam === 'INSIDE').length} / ${L.length}`)
console.log(`  closest rig gap:         ${Math.min(...L.map(f => f.dist)).toFixed(2)} m`)
console.log('\n   x       z     cell  centre   body   prop  cam       dist   side')
console.log('   centre = centre-to-solid-brick metres (positive = OUTSIDE the level: the WALKING question)')
console.log('   body   = how deep the 0.32 m collider overlaps brick (positive = blocked() let a body through)')
const pad = (v) => (v === -99 ? '   none' : v.toFixed(3).padStart(7))
for (const f of L) {
    const bad = f.wall < 0.001 || f.grid > 0 || f.prop > 0 || f.cam === 'INSIDE'
    console.log(`${bad ? '*' : ' '} ${String(f.x).padStart(6)} ${String(f.z).padStart(6)} ${f.cell.padEnd(7)}` +
        ` ${pad(f.wall)} ${pad(f.grid)} ${pad(f.prop)} ` +
        `${String(f.cam).padStart(8)} ${String(f.dist).padStart(6)} ${String(f.side).padStart(6)}`)
}
console.log('\nthe cast, by the collision model (a rig named fur1 is the actor itself — crew 1\'s fur):')
for (const d of out.depths.crew) if (d) console.log('  raccoon  ' + row(d))
for (const d of out.depths.watchers) if (d) console.log('  watcher  ' + row(d))
console.log(`\nverdict: actor's centre inside GRID geometry on ${L.filter(f => f.wall < 0.001).length} of ${L.length} frames` +
    ` — ${Math.min(...L.map(f => f.wall)) < 0.001 ? 'SIM BUG (blocked() let a body through)' : 'the sim is clean; any buried frame is the RIG'}`)
// Props are deliberately gentler than the grid: `blocked(self)` lets a body that is
// *already* inside a prop keep walking, so a spawn/teleport/rescue can put you in one
// without the sim being broken. Only a penetration that appears while walking counts.
console.log(`           actor inside a PROP on ${L.filter(f => f.prop > 0.001).length} frames (worst ${worstProp} m)` +
    (worstProp > 0.001 ? ' — fine if it started there, a bug if it grew while walking' : ''))
await browser.close()
