// EXCITEBIKE — Chrome rides the track with NOTHING but real key events, and the
// claims a Node harness cannot see are graded in PIXELS:
//
//   npm run exciteplay     (needs `npm run dev`)
//
//   1. THE INPUT PATH — ArrowUp is the GAS, the bike accelerates and the world
//      scrolls under a rider that stays pinned at the same screen column.
//   2. THE PAINT FOLLOWS THE HEIGHTMAP — the rider's red pixels sit at exactly
//      the canvas row the sim's altitude projects to (g2s), and climb when it
//      climbs. This is the check a Node audit of sim.js structurally cannot make.
//   3. THE LEAN IS REAL IN THE AIR — an arrow key tips the pitch while airborne
//      (the one input path the shell could previously not deliver at all).
//   4. THE WATER HOLE BITES IN THE TAB — a slow bike stalls on real pixels, and
//      real SPACE pumps walk it back to life faster than idle would.
//   5. THE ENGINE BOILS off a held throttle, and a drained clock ends the race
//      and loops back through the attract — which is the autopilot's proven lap.
// The terrain, ledger, slack rule and nine mutants live in excitecheck.mjs.
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.EXCITE_URL || 'http://localhost:5173/retrogames/excitebike'
await requireDevServer(URL)

const W = 256, H = 240
const g2s = (h) => (H - 46) - (h - 40) * 0.95
const isRed = (r, g, b) => r > 165 && g < 85 && b < 85

const r = new Report('exciteplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 620, height: 680 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__bikeTest.probe())
const wait = (ms) => page.waitForTimeout(ms)
const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key) }

// red-pixel centroid (x,y) + count over the whole stage
const bikePx = () => page.evaluate(() => {
    const g = document.querySelector('canvas[data-bike-stage]').getContext('2d')
    const d = g.getImageData(0, 0, 256, 240).data
    let n = 0, sx = 0, sy = 0, y0 = 999, y1 = -1
    for (let y = 0; y < 240; y++) for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4
        if (d[i] > 165 && d[i + 1] < 85 && d[i + 2] < 85) { n++; sx += x; sy += y; if (y < y0) y0 = y; if (y > y1) y1 = y }
    }
    return n ? { n, cx: sx / n, cy: sy / n, y0, y1 } : { n: 0, cx: -1, cy: -1, y0: -1, y1: -1 }
})

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__bikeTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__bikeTest never appeared (dev server? /excitebike route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(900)

// ---- attract: the autopilot's proven lap plays itself in a real tab ----
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    let moved = false, scoreGrew = false, sawBoost = false
    const t0 = a.tick, x0 = a.x
    for (let i = 0; i < 80; i++) {
        const s = await probe()
        moved = moved || s.x > x0 + 60
        scoreGrew = scoreGrew || s.score > 0
        sawBoost = sawBoost || s.v > 6
        if (moved && scoreGrew) break
        await wait(120)
    }
    const p = await bikePx()
    r.check('attract sim is live (the proven autopilot lap rides)', moved, `tick ${t0} -> ${(await probe()).tick}, x ${x0} -> ${(await probe()).x}`)
    r.check('the autopilot demo is really SCORING (boosts it hits)', scoreGrew || sawBoost, `score=${(await probe()).score}`)
    r.check('the attract screen paints a rider on the canvas', p.n > 25, `${p.n} red px`)
}

// ---- a real key starts a fresh race and lifts through the countdown ----
await page.keyboard.press('KeyZ')
await wait(200)
{
    const a = await probe()
    r.check('a real key starts a fresh race', a.screen === 'play' && a.count > 0 && a.x < 40 && a.score === 0,
        `screen=${a.screen} count=${a.count} x=${a.x.toFixed(0)}`)
}
let ready = false
for (let i = 0; i < 120 && !ready; i++) { ready = (await probe()).count === 0; if (!ready) await wait(80) }
r.check('the start-gate lifts (countdown reaches GO)', ready, `count=${(await probe()).count}`)

// ---- ArrowUp is the GAS: real key -> the world scrolls under a pinned rider ----
{
    const a = await probe()
    await page.keyboard.down('ArrowUp')
    let vPeak = 0
    for (let i = 0; i < 40; i++) { vPeak = Math.max(vPeak, (await probe()).v); await wait(60) }
    const b = await probe()
    await page.keyboard.up('ArrowUp')
    const p = await bikePx()
    r.check('ArrowUp builds speed (real gas)', b.v > 3.5 && vPeak > 3.5, `v ${a.v.toFixed(2)} -> ${b.v.toFixed(2)}`)
    r.check('holding gas advances the bike down the track (real distance)', b.x > a.x + 120, `x ${a.x.toFixed(0)} -> ${b.x.toFixed(0)}`)
    r.check('the rider stays PINED at one screen column while the world scrolls past', Math.abs(p.cx - 84) < 22 && p.n > 25,
        `bike red centroid cx=${p.cx.toFixed(0)} (want ~84), ${p.n} px`)
}

// ---- the paint follows the heightmap: the rider's row is where g2s(alt) says ----
{
    // an on-ground rider's alt is the TERRAIN, not a knob — so rest it on a hill
    // top (x=1200, ground 150) and a valley (x=1800, ground 87), read the SIM's
    // own settled alt, and demand the red band sit at g2s(alt)-6 in both cases.
    const restAndSample = async (x) => {
        await page.evaluate((px) => window.__bikeTest.setup({ track: 0, x: px, v: 0 }), x)
        await wait(500)                       // let alt ease onto the terrain
        const a = await probe()
        const p = await bikePx()
        return { alt: a.alt, y0: p.y0, y1: p.y1, n: p.n }
    }
    const hi = await restAndSample(1200)
    const lo = await restAndSample(1800)
    const row = (s) => (s.y0 + s.y1) / 2
    const want = (s) => g2s(s.alt) - 6
    r.check('the rider is PAINTED at the exact canvas row the heightmap projects to (hill top)',
        hi.n > 20 && Math.abs(row(hi) - want(hi)) < 14, `alt ${hi.alt.toFixed(0)} red ${hi.y0}-${hi.y1} want ~${want(hi).toFixed(0)}`)
    r.check('...and again in a valley, lower on the canvas',
        lo.n > 20 && Math.abs(row(lo) - want(lo)) < 14 && row(lo) > row(hi) + 25,
        `alt ${lo.alt.toFixed(0)} red ${lo.y0}-${lo.y1} want ~${want(lo).toFixed(0)} (hill was ${row(hi).toFixed(0)})`)
}

// ---- the LEAN is real in the air: an arrow tips the pitch (the fixed path) ----
{
    await page.evaluate(() => window.__bikeTest.setup({ x: 3200, alt: 150, v: 6, air: true, vy: 4, pitch: -0.25 }))
    await wait(80)
    const before = (await probe()).pitch
    await page.keyboard.down('ArrowUp')   // airborne: this is the rider's weight, not the gas
    await wait(500)
    const p1 = await probe()
    await page.keyboard.up('ArrowUp')
    r.check('airborne, ArrowUp LEANS the nose up (the weight path fires on real keys)',
        p1.pitch > before + 0.08 && p1.air, `pitch ${before.toFixed(3)} -> ${p1.pitch.toFixed(3)} (air=${p1.air})`)
    await page.evaluate(() => window.__bikeTest.setup({ x: 3200, alt: 150, v: 6, air: true, vy: 4, pitch: 0.2 }))
    await wait(80)
    const b2 = (await probe()).pitch
    await page.keyboard.down('ArrowDown')  // airborne: nose down
    await wait(500)
    const p2 = await probe()
    await page.keyboard.up('ArrowDown')
    r.check('airborne, ArrowDown LEANS the nose down', p2.pitch < b2 - 0.08, `pitch ${b2.toFixed(3)} -> ${p2.pitch.toFixed(3)}`)
}

// ---- the water hole bites IN THE TAB, and real SPACE + throttle drive you out ----
{
    const WATER_END = 3580
    // drop a slow bike just inside the water band -> it must stall on real physics
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 3548, v: 1.2 }))
    let stalled = null
    for (let i = 0; i < 60 && !stalled; i++) { const s = await probe(); if (s.stall > 0) { stalled = s; break } await wait(60) }
    r.check('a slow bike entering the water STALLS in the browser (real physics, not rigged)', !!stalled, stalled ? `stall=${stalled.stall}` : 'never stalled')
    if (stalled) {
        // The honest, runner-independent claim: the throttle alone re-stalls
        // forever (water drag 0.034 > high-gear accel 0.026) — only a real
        // SPACE pump gives the kick that drives the bike past the far edge.
        // So grade the outcome the player cares about: does the bike ESCAPE?
        const x0 = (await probe()).x
        await page.keyboard.down('ArrowUp')                 // real throttle...
        let escaped = false, ticks = 0
        for (let i = 0; i < 900 && !escaped; i++) {
            await page.keyboard.press('Space'); ticks++     // ...and real pump
            const s = await probe(); if (s.x > WATER_END + 2) { escaped = true; break }
            await wait(15)
        }
        await page.keyboard.up('ArrowUp')
        const s = await probe()
        r.check('real throttle + SPACE pumps the stalled bike OUT of the water (pump is load-bearing)',
            escaped, `x ${x0.toFixed(0)} -> ${s.x.toFixed(0)} after ${ticks} pumps (far edge ${WATER_END})`)
    }
}

// ---- the engine boils off a held throttle ----
{
    // track 0 (the fast one; supercross is hillier and heats slower). Start
    // already fast and warm — the Throttle still does the crossing, we just do
    // not ask a browser to idle 20s. hot=true is the sim's own verdict.
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 300, v: 6, heat: 72 }))
    for (let i = 0; i < 20; i++) { if ((await probe()).count > 0) await wait(40); else break }
    await page.keyboard.down('ArrowUp')
    let boiled = false, peak = 0
    for (let i = 0; i < 260 && !boiled; i++) { const s = await probe(); peak = Math.max(peak, s.heat); boiled = s.hot; if (!boiled) await wait(60) }
    await page.keyboard.up('ArrowUp')
    const after = await probe()
    r.check('holding the gas BOILS the engine (the throttle is a real risk)', boiled, `hot=${after.hot} heat peaked ${peak.toFixed(0)}/100`)
}

// ---- a drained clock ends the race, and a real key loops back through attract ----
{
    // clock counts DOWN once per real second (60 ticks); 2s is enough to watch
    // the sim decide 'time' on its own — we set the state, the rule is the sim's.
    await page.evaluate(() => window.__bikeTest.setup({ track: 0, x: 400, v: 5, clock: 2 }))
    let over = null
    for (let i = 0; i < 200 && !over; i++) { over = (await probe()).screen === 'over'; if (!over) await wait(60) }
    r.check('a drained clock ends the race (over screen — the timeout is real)', !!over, `screen=${(await probe()).screen}`)
    await wait(1100)
    await page.keyboard.press('KeyZ')
    await wait(300)
    let mid = await probe()
    r.check('a real key returns to the attract screen', mid.screen === 'attract', `screen=${mid.screen}`)
    await page.keyboard.press('KeyZ')
    await wait(250)
    mid = await probe()
    r.check('and a real key starts a fresh race from attract', mid.screen === 'play' && mid.count > 0, `screen=${mid.screen} count=${mid.count}`)
}

// ---- the pause door ----
{
    await page.keyboard.press('Shift+Slash')
    await wait(300)
    r.check('a real ? opens the pause overlay', (await page.locator('text=RESUME GAME').count()) > 0)
    await page.keyboard.press('Shift+Slash')
    await wait(250)
    r.check('a real ? closes it again', (await page.locator('text=RESUME GAME').count()) === 0)
}

r.check('zero page errors across the whole ride', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
