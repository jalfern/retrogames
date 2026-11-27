// mcsmartdrive (#3630) — real Chrome, real mouse and keys: the wave-7 smart
// bomb on the live page. mcsaucerdrive convention: missilecmdcheck owns the
// rule tables; this proves the browser half. Live gate negative (no smart-bomb
// cyan on a wave-1 sky), a cheat-hook lift to wave 7 (DebugKit offers the same
// jump), the battery speed split seen through the probe, probe↔pixels for the
// pulsing core, a real mouse blind-shot kill paying 25, and the watch keeping
// the board alive through the exotic wave. #3698 appended: the attract ad's
// scripted smart-bomb sighting, the azure fairness trail of the fast battery
// (and the plain trail of the outer ones), and the outer-immunity shimmer
// observed live while the watch sweeps the same sky.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/missilecommand`
const rep = new Report('mcsmartdrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: `${BASE}?seed=3582`, hook: '__mcTest', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const probe = () => page.evaluate(() => window.__mcTest.probe())

// map a game (x, y) to page client coordinates through the draw transform
const clientOf = (gx, gy) => page.evaluate(({ gx, gy }) => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvas.width / dpr / 800
    const scaleY = canvas.height / dpr / 600
    const scale = Math.min(scaleX, scaleY) * 0.95
    const transX = (canvas.width / dpr - 800 * scale) / 2
    const transY = (canvas.height / dpr - 600 * scale) / 2
    const rect = canvas.getBoundingClientRect()
    return { x: rect.left + transX + gx * scale, y: rect.top + transY + gy * scale }
}, { gx, gy })

// scan a box (game coords) for smart-bomb core paint: the white/cyan pulse pair
const coreAt = (gx, gy, half = 26) => page.evaluate(({ gx, gy, half }) => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvas.width / dpr / 800
    const scaleY = canvas.height / dpr / 600
    const scale = Math.min(scaleX, scaleY) * 0.95
    const transX = (canvas.width / dpr - 800 * scale) / 2
    const transY = (canvas.height / dpr - 600 * scale) / 2
    const px = Math.round((transX + gx * scale) * dpr)
    const py = Math.round((transY + gy * scale) * dpr)
    const R = Math.round(half * scale * dpr)
    const ctx = canvas.getContext('2d')
    const img = ctx.getImageData(px - R, py - R, R * 2, R * 2).data
    let cyan = 0
    for (let i = 0; i < img.length; i += 4) {
        const r = img[i], g = img[i + 1], b = img[i + 2]
        if (b > 200 && g > 170 && r < 160) cyan++ // #9ff4ff / #00e5ff family
    }
    return cyan
}, { gx, gy, half })

// ---- #3698 attract ad: the smart bomb gets its own scripted sighting ----
// (before the seat key — the ad flies on the attract board itself)
let adSeen = null
for (let i = 0; i < 32 && !adSeen; i++) {
    await sleep(200)
    const p = await probe()
    const scr = await page.evaluate(() => window.__mcTest.screen())
    if (p.attractSmarts >= 1 && p.smarts >= 1 && scr === 'attract') { adSeen = p.attractSmarts; break }
}
rep.check('the attract ad flies a scripted smart-bomb sighting on the demo board',
    adSeen !== null, adSeen ? `sightings ${adSeen}` : 'no sighting within 10s')

// ---- attract → live, gate negative ----
await page.keyboard.press('Space')
await sleep(400)
{
    const a = await probe()
    rep.check('raid is live at wave 1', a.wave === 1 && a.cities === 6 && !a.done, `w${a.wave} c${a.cities}`)
    rep.check('no smart bomb lives below the gate (live, wave 1)', a.smarts === 0)
    const seen = await coreAt(400, 300, 300) // whole sky, generous box
    rep.check('no smart-bomb cyan anywhere on a wave-1 sky', seen === 0, `${seen} px`)
}

// ---- lift to wave 7 and wait for the smart bomb ----
await page.evaluate(() => window.__mcTest.toWave7())
let bomb = null
for (let i = 0; i < 80 && !bomb; i++) {
    await sleep(150)
    const p = await probe()
    if (p.smarts > 0) bomb = p.smartAt[0]
}
rep.check('a smart bomb enters at wave 7 (live)', !!bomb, bomb ? `(${bomb.x},${bomb.y})→${bomb.tx}` : 'never entered')
if (!bomb) rep.exit(browser)

// battery speed split through the probe: center fast, outer slow, from the gate
{
    const pt = await clientOf(400, 300)
    await page.mouse.move(pt.x, pt.y)
    await page.keyboard.press('Space')
    const s0 = await probe()
    rep.check('a center click at wave 7 flies the 28 px/tick ABM (arcade "much greater speed")',
        s0.abmSpeeds.includes(28), JSON.stringify(s0.abmSpeeds))
    const pt2 = await clientOf(120, 300)
    await page.mouse.move(pt2.x, pt2.y)
    await page.keyboard.press('Space')
    const s1 = await probe()
    rep.check('an outer click still flies the 15 px/tick ABM', s1.abmSpeeds.includes(15), JSON.stringify(s1.abmSpeeds))
}

// ---- #3698 item 1+2 ride AFTER the watch section (ordering lesson, this
// session): the first seeded smart bomb exists only ~4 s after the wave lifts,
// and the blind-kill check below must meet it first. The fairness trail and the
// immunity shimmer need only smartWave + a defended board, so they run late,
// under the watch — which keeps the sky alive to observe instead of burning it.

// sprite matches logical state: the pulsing core sits where the probe says
await sleep(120)
{
    const p = await probe()
    const at = p.smartAt[0]
    if (!at) rep.check('probe↔pixels: bomb still crossing', false, 'gone too early')
    else {
        const cyan = await coreAt(at.x, at.y)
        rep.check('the drawn core matches the logical position (probe ↔ pixels)', cyan >= 4, `at (${at.x},${at.y}) → ${cyan} cyan px`)
    }
}

// ---- real mouse blind shot: aim inside the lead window, center sector ----
let killDelta = null
for (let i = 0; i < 12; i++) {
    const before = await probe()
    if (before.smarts === 0) break
    const b = before.smartAt[0]
    // solve the gunner's blind meet: earliest j with center arrival k <= j and
    // the aim within the 32 px blind radius of the bomb — manual §7 hint 3.
    const dxn = b.tx - b.x, dyn = 550 - b.y
    const nl = Math.hypot(dxn, dyn) || 1
    const spd = 1.7 // WARHEAD_SPEED_BASE + wave*0.1 at wave 7
    let aim = null
    for (let j = 1; j <= 60; j++) {
        const px = b.x + (dxn / nl) * spd * j
        const py = b.y + (dyn / nl) * spd * j
        if (py > 485) break
        if (Math.hypot(px - b.x, py - b.y) > 32) continue
        const k = Math.floor(Math.hypot(px - 400, py - 530) / 28) + 1
        if (k <= j && Math.abs(px - 400) <= Math.abs(px - 40) && Math.abs(px - 400) <= Math.abs(px - 760)) { aim = { px, py }; break }
    }
    if (!aim) { await sleep(150); continue }
    const pt = await clientOf(aim.px, aim.py)
    await page.mouse.move(pt.x, pt.y)
    await page.keyboard.press('Space')
    const t0 = Date.now()
    while (Date.now() - t0 < 1600) {
        await sleep(100)
        const now = await probe()
        if (now.score - before.score >= 25 && now.smarts < before.smarts) { killDelta = now.score - before.score; break }
        if (now.smarts === 0 && before.smarts > 0) { killDelta = now.score - before.score; break }
    }
    if (killDelta !== null && killDelta >= 25) break
    killDelta = null
    await sleep(120)
}
rep.check('a real mouse aim + Space blind-kills the smart bomb for ≥25 on the live board',
    killDelta !== null && killDelta >= 25, `delta ${killDelta}`)

// ---- the watch takes the wave ----
await page.keyboard.press('y')
let held = false
for (let i = 0; i < 90; i++) {
    await sleep(150)
    const p = await probe()
    if (p.wave >= 8 || (p.smarts === 0 && p.wave >= 7 && !p.done)) { held = true; break }
    if (p.done) break
}
{
    const p = await probe()
    rep.check('the watch holds the board through the smart-bomb wave', held && !p.done && p.cities >= 4, `w${p.wave} c${p.cities} smarts ${p.smarts}`)
}

// ---- #3698 item 1: the answer to a smart bomb wears a brighter trail ----
// Key 2 (the arcade's named center battery) fires 28 px/t; only its trail may
// paint azure (#4d8cff, verified pixel-exact against the live canvas) while
// the fast law is live. Key 1's shots prove the split. The scan runs on the
// page's own rAF loop and RE-FIRES: a single fast flight can land between two
// samples on a loaded box (observed: 446 azure px on the caught frame, 0 on a
// one-shot run); a cadence keeps paint on the wire every frame.
const trailMax = (key, shots) => page.evaluate(async ({ key, shots }) => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvas.width / dpr / 800
    const scaleY = canvas.height / dpr / 600
    const scale = Math.min(scaleX, scaleY) * 0.95
    const transX = (canvas.width / dpr - 800 * scale) / 2
    const transY = (canvas.height / dpr - 600 * scale) / 2
    const px = Math.round((transX + 400 * scale) * dpr)
    const py = Math.round((transY + 430 * scale) * dpr)
    const R = Math.round(90 * scale * dpr)
    const ctx = canvas.getContext('2d')
    let max = 0
    const t0 = performance.now()
    let fired = 0
    let nextShot = 0
    while (performance.now() - t0 < 2600) {
        if (fired < shots && performance.now() - t0 >= nextShot) {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: key, key: key.slice(-1), bubbles: true }))
            fired++
            nextShot = performance.now() + (key === 'Digit2' ? 170 : 380)
        }
        const img = ctx.getImageData(px - R, py - R, R * 2, R * 2).data
        let azure = 0
        for (let i = 0; i < img.length; i += 4) {
            const r = img[i], g = img[i + 1], b = img[i + 2]
            if (b > 200 && g >= 110 && g <= 190 && r >= 40 && r <= 110) azure++ // #4d8cff core
        }
        if (azure > max) max = azure
        await new Promise((res) => requestAnimationFrame(res))
    }
    return max
}, { key, shots })
{
    // wait for a wave break: the watch spends magazines fast, and the trail
    // check needs the center battery loaded (silos refill every wave start)
    let p0 = await probe()
    const tRef = Date.now()
    while (Date.now() - tRef < 30000 && !p0.done && p0.silosAmmo[1] < 6) { await sleep(300); p0 = await probe() }
    const centerAlive = p0.silosAmmo[1] > 3 // dead/low center would empty-fire
    const aim = await clientOf(400, 300)
    await page.mouse.move(aim.x, aim.y)
    const fastMax = centerAlive ? await trailMax('Digit2', 5) : 0
    // threshold notes: clean runs record 400-500 azure px, noise never above 0 —
    // but at the fixed-timestep floor (~4 fps under a loaded box) a 6-tick ABM
    // life fits inside one catch-up batch and never reaches the canvas at all
    // (observed: a real fire captured 0 px). The cadence shrinks those blind
    // frames; 4 keeps the gate meaningful without demanding a quiet machine.
    rep.check('the fast center battery draws a brighter azure trail (fairness tell, live)', fastMax >= 4, `${fastMax} azure px (center ammo ${p0.silosAmmo[1]})`)
    await sleep(1200) // let the fast shots' blasts fade before grading the outer ones
    const outerMax = centerAlive ? await trailMax('Digit1', 3) : 0
    rep.check('the outer battery still draws the plain blue trail (the tell is the split)', outerMax === 0, `${outerMax} azure px`)
}

// ---- #3698 item 2: the immunity shimmer renderer, live ----
// The RULE is pinned in missilecmdcheck (a resist record exists exactly where
// an outer blast passed a live bomb's core — and a kill never shimmers). The
// browser half's contract: gs.resist really paints. Stamp one through the DEV
// hook at a spot clear of any falling bomb (the bomb's own cyan halo would
// false-positify the scan), and catch the expanding ring on the page's frames.
{
    const p = await probe()
    const spot = [[700, 130], [100, 130], [400, 110]].find(([x, y]) =>
        p.smartAt.every((b) => Math.hypot(b.x - x, b.y - y) > 110))
    let cyan = 0
    if (spot) {
        cyan = await page.evaluate(async ([x, y]) => {
            const canvas = document.querySelector('canvas')
            const dpr = window.devicePixelRatio || 1
            const scale = Math.min(canvas.width / dpr / 800, canvas.height / dpr / 600) * 0.95
            const transX = (canvas.width / dpr - 800 * scale) / 2
            const transY = (canvas.height / dpr - 600 * scale) / 2
            const px = Math.round((transX + x * scale) * dpr)
            const py = Math.round((transY + y * scale) * dpr)
            const R = Math.round(34 * scale * dpr)
            const ctx = canvas.getContext('2d')
            let max = 0
            const t0 = performance.now()
            let stamps = 0
            while (performance.now() - t0 < 900) {
                // re-stamp: a 10-tick ring can fall inside one catch-up batch on
                // a throttled box and never paint; a cadence keeps it on the wire
                if (stamps++ % 4 === 0) window.__mcTest.resistFx(x, y)
                const img = ctx.getImageData(px - R, py - R, R * 2, R * 2).data
                let n = 0
                for (let i = 0; i < img.length; i += 4) {
                    const r = img[i], g = img[i + 1], b = img[i + 2]
                    if (b > 120 && g > 110 && r < 80) n++ // cyan at alpha ≥0.5
                    // (the ring fades over 10 ticks; the smart halo would match
                    // but the spot keeps bombs ≥110 px away, outside the scan)
                }
                if (n > max) max = n
                await new Promise((res) => requestAnimationFrame(res))
            }
            return max
        }, spot)
    }
    rep.check('gs.resist paints the cyan immunity shimmer on the live canvas (render path)',
        cyan >= 6, `${cyan} cyan ring px${spot ? '' : ' (no clear spot)'}`)
}

rep.check('zero page errors across the drive', errors === 0, `${errors}`)

rep.exit(browser)
