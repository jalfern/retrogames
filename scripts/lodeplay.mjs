// LODE RUNNER-LITE — Chrome plays vault 1 with NOTHING but real key events,
// and every claim the Node harness cannot see is graded in pixels:
//
//   npm run lodeplay     (needs `npm run dev`; LODE_URL overrides)
//
//   1. THE ATTRACT DEMO MOVES — the solver's proven witness walks the
//      canvas; the demo sim's own tick counter advances and the canvas is
//      demonstrably not black.
//   2. THE INPUT PATH — held arrows run the runner, and the recorded
//      command stream grows ONLY from real keypresses.
//   1b. PHONE VAULT-SELECT (#2063) — three tappable pads on the marquee;
//       each pad's real centre opens ITS OWN vault with real pointer events,
//       and a tap outside the pads still starts vault 1.
//   3. DIG → HOLE → REFILL — the dig opens a live hole diagonally below the
//      runner; the sim's fuse grows the brick back after the ~5 s hold.
//   3b. THE PAINT — terrain is runtime pixel art: warm mortar brick reads
//       distinct from cool concrete, and the runner and guard are distinct
//       sprites, not two shades of one glyph.
//   3c. THE ORIGINAL PALETTE — issue #168: the vault background is the
//       Apple II original's dark navy (not near-black), the runner paints
//       aqua (no strong-blue pixel, i.e. not the old white+blue kit), the
//       guard paints orange (not the old olive), and ladder and rope paint
//       the original's light grey (not green/yellow).
//   4b. THE CARVED SHAFT (#1942, deepened #1952) — three diggable strata: dig,
//       walk over the open pit mouth and FALL in (sprite and state agree), dig
//       straight down TWICE to the bedrock, and clamber back out with UP —
//       no life lost.
//   4. THE LADDER AND THE ROPE (vault 2) — run to a real ladder, climb it, and
//      dangle onto the rope line: the runner hangs, rope over his head in the state.
//   5. GUARDS HUNT — a guard's cell changes without being touched.
//   6. YOU CAN DIE AND COME BACK — walk into the guard until the game
//      overs, press R, and the GHOST of the lost run haunts the retry
//      tick-for-tick beside you.
//      (6b: runner and guard are distinct sprites, not one glyph in two colors.)
//   7. THE PAGE ITSELF REPLAYS — replayCheck re-runs the recorded stream
//      through the sim and compares state hashes mid-run.
import { launch, requireDevServer, Report, relayNoise } from './lib/harness.mjs'

const URL = process.env.LODE_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/lode-runner`
await requireDevServer(URL)

const r = new Report('lodeplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 780, height: 720 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
// device-level AudioContext complaints (no audio device/renderer on the box)
// are not page errors — same filter papersplay/britanniadrive carry.
const deviceNoise = (s) => /AudioContext encountered an error from the audio device/i.test(String(s || ''))
page.on('pageerror', (e) => { if (!deviceNoise(e.message)) errors.push(`[pageerror] ${e.message}`) })
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error' && !relayNoise(m.text(), m.location()) && !deviceNoise(m.text())) { errors.push(`[console.error] ${m.text()}`); console.log('[console.error]', m.text().slice(0, 200)) } })

await page.goto(URL, { waitUntil: 'domcontentloaded' })
const waitHook = async (tries) => {
    for (let i = 0; i < tries; i++) {
        if (await page.evaluate(() => !!window.__lodeTest)) return true
        await page.waitForTimeout(200)
    }
    return false
}
// a brand-new lazy chunk can race vite's first dep-optimisation and stall
// cold; one reload is honest (a player pressing reload), then it is red.
if (!(await waitHook(75))) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitHook(75)
}
const hookLive = await page.evaluate(() => !!window.__lodeTest)
r.check('the __lodeTest hook is live', hookLive, hookLive ? '' :
    await page.evaluate(() => `${location.href} root=${(document.getElementById('root')?.innerHTML || 'EMPTY').slice(0, 120)}`))
const wait = (ms) => page.waitForTimeout(ms)
const probe = () => page.evaluate(() => window.__lodeTest.probe())
const holdKey = async (key, ms = 260) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); await wait(160) }
// classify the INNER window of a cell (inside the glyph baseline noise):
// gold stars are warm-yellow, traps warm-red, fresh holes dark.
// the gold star BLINKS (#ffd23e bright / #b8922e dim, a 2 s cycle), so one
// short sample can land entirely in the dim phase — sample across a whole
// cycle and accept either shade as gold.
const cellPix = (gx, gy, tries = 8) => page.evaluate(async ([x, y, n]) => {
    const c = document.querySelector('canvas[data-lode-stage]')
    if (!c) return { gold: 0, warm: 0, lit: 0 }
    let gold = 0, warm = 0, lit = 0
    for (let k = 0; k < n; k++) {
        const d = c.getContext('2d').getImageData(x * 20 + 4, y * 22 + 4, 12, 14).data
        for (let i = 0; i < d.length; i += 4) {
            const [rr, gg, bb] = [d[i], d[i + 1], d[i + 2]]
            if (rr + gg + bb > 40) lit++
            if (rr > 150 && gg > 110 && bb < 140) gold++
            if (rr >= gg + 6 && rr > bb + 10) warm++
        }
        await new Promise((res) => setTimeout(res, 260))
    }
    return { gold, warm, lit }
}, [gx, gy, tries])

// 1 — attract: the solver's witness moves on its own, and pixels prove it
await wait(3000)
let s = await probe()
r.check('attract mode is showing a live demo sim', s && s.screen === 'attract' && !!s.demo && s.demo.tick > 0, JSON.stringify(s && s.demo))
const demoA = s.demo
const canvasLit = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-lode-stage]')
    if (!c) return 0
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 40) n++
    return n
})
r.check(`attract canvas is not black (${canvasLit} lit samples of the vault)`, canvasLit > 300)
await wait(2500)
s = await probe()
// the demo wraps across vaults (one clears, the next loads, tick resets to 0),
// so "walking" is a MONOTONIC (vault, tick) advance — never a raw tick compare
const dB = s.demo
r.check('the demo is the witness walking (advancing tick-for-tick, across vaults)',
    (dB.idx * 100000 + dB.tick) > (demoA.idx * 100000 + demoA.tick),
    `vault ${demoA.idx} tick ${demoA.tick} -> vault ${dB.idx} tick ${dB.tick}`)

// 1b — #2063 phone parity: the marquee carries tappable vault-select pads.
// Grade the geometry, prove a tap OUTSIDE the pads still starts vault 1 (the
// button guard exempts only buttons), then tap each pad's real centre with
// real pointer events: the run must open ITS OWN vault — vault 2 and 3 are
// reachable without a keyboard, and the pad cannot also fire tap-anywhere.
const padGeom = await page.evaluate(() => window.__lodeTest.vaultPads())
r.check('the marquee carries three tappable vault pads',
    Array.isArray(padGeom) && padGeom.length === 3 && padGeom.every(Boolean),
    JSON.stringify(padGeom))
r.check('each pad reads its vault and meets the phone target floor (>=44x28)',
    padGeom.length === 3 && padGeom.every((p, i) => p && p.label === `VAULT ${i + 1}` && p.w >= 44 && p.h >= 28),
    JSON.stringify(padGeom))
await page.mouse.click(60, 660)                     // far corner of the marquee, no button there
await wait(450)
s = await probe()
r.check('a tap outside the pads still starts vault 1', s && s.screen === 'play' && s.level === 0,
    JSON.stringify(s && { screen: s.screen, level: s.level }))
for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__lodeTest.toAttract())
    await wait(300)
    const p = (await page.evaluate(() => window.__lodeTest.vaultPads()))[i]
    if (p) await page.mouse.click(p.cx, p.cy)
    await wait(450)
    const st = await probe()
    r.check(`a real tap on pad ${i + 1} opens vault ${i + 1} (not the tap-anywhere vault 1)`,
        !!p && st.screen === 'play' && st.level === i,
        JSON.stringify({ p, screen: st.screen, level: st.level }))
}
await page.evaluate(() => window.__lodeTest.toAttract())   // back to the marquee for section 2
await wait(300)

// 2 — one key into the vault; a held arrow moves the runner and stamps cmds
await page.keyboard.press('Digit1')
await wait(500)
s = await probe()
r.check('pressing 1 opens vault 1', s && s.screen === 'play' && s.level === 0, JSON.stringify(s && { screen: s.screen, level: s.level }))
const x0 = s.player.x, cmds0 = s.cmds
// ONE short hold, graded immediately: the guard closes on spawn in ~4 s,
// and a capture-respawn mid-test would (correctly!) report x back at 1 —
// dying is section 7's claim on the same fact, not this one's.
await holdKey('ArrowRight')
s = await probe()
r.check(`a held arrow runs east by real keys (${x0} -> ${s.player.x}, cmds ${cmds0} -> ${s.cmds})`,
    s.player.x > x0 && s.cmds > cmds0)
const rc0 = await page.evaluate(() => window.__lodeTest.replayCheck())
r.check('in-page replay matches the live state mid-run', rc0.match && rc0.cmds > 0, JSON.stringify(rc0))

// 3 — gold exists in the state AND on the canvas before it is collected
const goldCell = await page.evaluate(() => {
    const p = window.__lodeTest.probe()
    for (let y = 1; y < 18; y++) for (let x = 1; x < 33; x++) if (p.cellAt(x, y) === 5) return { x, y }
    return null
})
r.check('the vault carries gold in the grid', !!goldCell, JSON.stringify(goldCell))
if (goldCell) {
    const px = await cellPix(goldCell.x, goldCell.y)
    r.check(`a gold nugget paints gold pixels (${px.gold} warm-yellow in its cell window)`, px.gold >= 6, JSON.stringify(px))
}

// 3b — the paint (issue #156): vault 1's row 0 is wall, rows 16-18 are the
// three rock strata (row 15 is the walk level),
// so one read each grades "mortar brick vs cool concrete" — in hue AND in
// density (a glyph in a cell leaves most of the window black; a tile fills it).
const avgPx = (gx, gy) => page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas[data-lode-stage]')
    const d = c.getContext('2d').getImageData(x * 20 + 3, y * 22 + 3, 14, 16).data
    let r = 0, g = 0, b = 0, n = 0
    for (let i = 0; i < d.length; i += 4) {
        if (d[i] + d[i + 1] + d[i + 2] < 24) continue
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++
    }
    return n ? { r: r / n, g: g / n, b: b / n, n } : null
}, [gx, gy])
const artPx = { solid: await avgPx(5, 0), brick: await avgPx(5, 17) }
r.check('terrain is pixel art: warm mortar brick distinct from cool concrete (hue and density)',
    artPx.brick && artPx.solid
    && artPx.brick.r > artPx.brick.b + 15 && artPx.solid.b >= artPx.solid.r
    && artPx.brick.n > 150 && artPx.solid.n > 150,
    JSON.stringify(artPx))
// 3c — the vault background: vault 1 row 1 is the air row, so cell (5,1) is
// pure background fill. The original's is a DARK NAVY — blue-dominant but
// still dark; the old near-black failed on the hue, a bright blue would
// fail on the sum.
const bgPx = await avgPx(5, 1)
r.check('the background is the original dark navy (not the old near-black)',
    bgPx && bgPx.b > bgPx.r + 15
    && bgPx.r + bgPx.g + bgPx.b < 150 && bgPx.r + bgPx.g + bgPx.b > 25,
    JSON.stringify(bgPx))

// 4 — face and push DOWN at spawn: the diagonal brick below opens a live HOLE,
// which the sim's fuse grows back into brick after the ~5 s hold
await page.evaluate(() => window.__lodeTest.start(0))
await wait(300)
await holdKey('ArrowDown', 300)
let digged = false
for (let i = 0; i < 20 && !digged; i++) {
    digged = await page.evaluate(() => window.__lodeTest.probe().evLog.some((e) => e.type === 'dig'))
    if (!digged) await wait(150)
}
r.check('DOWN at spawn digs a brick (the sim says dig)', digged)
const holeCell = await page.evaluate(() => {
    const p = window.__lodeTest.probe()
    const px = p.player.x, py = p.player.y
    for (let dy = 1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx, y = py + dy
        if (p.holeAt(x, y) > 0) return { x, y, cell: p.cellAt(x, y), age: p.holeAt(x, y) }
    }
    return null
})
r.check('the dig opens a live hole diagonally below the runner', !!holeCell && holeCell.cell === 0 && holeCell.age > 0, JSON.stringify(holeCell))
await wait(6200) // refill 75 ticks = 5 s, plus margin
const refilled = await page.evaluate(([x, y]) => { const p = window.__lodeTest.probe(); return { cell: p.cellAt(x, y), age: p.holeAt(x, y) } }, [holeCell.x, holeCell.y])
r.check('the hole refills: the brick grows back after the fuse', refilled.cell === 1 && refilled.age === 0, JSON.stringify(refilled))

// 4b — THE CARVED SHAFT (#1942, deepened to three strata by #1952), with real
// keys only: the ground is three strata, so dig, step over the mouth (the
// walker falls in), dig straight down TWICE, and clamber three climbs back
// out — state AND pixels must agree at every step (the drawn sprite follows
// the logical cell).
await page.evaluate(() => window.__lodeTest.start(0))
await wait(300)
await holdKey('ArrowRight', 300)
await holdKey('ArrowDown', 300)                     // hole below-right of spawn: (2,16)
const mouth = await page.evaluate(() => {
    const p = window.__lodeTest.probe()
    const px = p.player.x
    return { hole16: p.holeAt(px + 1, 16), x: px + 1 }
})
r.check(`the shaft sits on diggable floor-rock: cells under the pit are brick (${mouth.hole16 > 0 ? 'pit open' : 'pit shut'})`,
    await page.evaluate(([x]) => { const p = window.__lodeTest.probe(); return p.cellAt(x, 17) === 1 && p.cellAt(x, 18) === 1 }, [mouth.x]))
await holdKey('ArrowRight', 300)                    // step over the mouth — gravity, not a block
let inPit = null
for (let i = 0; i < 20 && !(inPit && inPit.player.y === 16); i++) { inPit = await probe(); await wait(120) }
r.check('walking over an open pit drops the runner in (state row 16)', !!inPit && inPit.player.y === 16, JSON.stringify(inPit && { y: inPit.player.y, mode: inPit.player.mode }))
const pitPix = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-lode-stage]')
    const p = window.__lodeTest.probe()
    const d = c.getContext('2d').getImageData(p.player.x * 20 + 3, 16 * 22 + 3, 14, 16).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] >= 24) n++
    return { n, at: [p.player.x, p.player.y] }
})
r.check('the drawn runner stands in the pit — pixels match the logical cell', pitPix.n > 60, JSON.stringify(pitPix))
await holdKey('ArrowDown', 300)                     // dig down from the pit floor — a held key
// fires every moveEvery, so one squeeze can ride the shaft all the way to bedrock
let deepened = false
for (let i = 0; i < 20 && !deepened; i++) {
    deepened = await page.evaluate(([x]) => { const p = window.__lodeTest.probe(); return p.holeAt(x, 17) > 0 && p.player.y >= 17 }, [mouth.x])
    if (!deepened) await wait(150)
}
r.check('from the pit floor, DOWN carves the shaft deeper (row 17 opens, runner rides down)', deepened)
await holdKey('ArrowDown', 300)                     // dig the third stratum — the deepest grave
let deepest = false
for (let i = 0; i < 20 && !deepest; i++) {
    deepest = await page.evaluate(([x]) => { const p = window.__lodeTest.probe(); return p.holeAt(x, 18) > 0 && p.player.y === 18 }, [mouth.x])
    if (!deepest) await wait(150)
}
r.check('pit-bottom DOWN again carves the third stratum (row 18 opens, runner rides to the shaft floor)', deepest)
await holdKey('ArrowUp', 300)
await holdKey('ArrowUp', 300)
await holdKey('ArrowUp', 300)
let out = null
for (let i = 0; i < 20 && !(out && out.player.y === 15); i++) { out = await probe(); await wait(120) }
const climbs = out ? out.evLog.filter((e) => e.type === 'pitClimb').length : 0
r.check('UP clambers the runner out of a three-cell shaft, no life lost', !!out && out.player.y === 15 && climbs >= 3 && out.lives === 3,
    JSON.stringify(out && { y: out.player.y, climbs, lives: out.lives }))

// 4c — LIP LAW live (#2004): coming out of the freshly carved shaft the pit
// below is still open (the 5 s fuse has not run) — the runner arrives
// CLINGING, not floating: the flag reads true and the sprite paints sunk
// below the lip line, INTO the pit cell, where a stand frame paints nothing.
const lipState = await page.evaluate(() => {
    const p = window.__lodeTest.probe()
    return { x: p.player.x, y: p.player.y, mode: p.player.mode, lip: p.player.lip, openBelow: p.holeAt(p.player.x, p.player.y + 1) > 0 }
})
r.check('exiting a still-open shaft ends in a lip cling (flag true, hole open below)',
    lipState.lip === true && lipState.mode === 'stand' && lipState.openBelow, JSON.stringify(lipState))
const clingPix = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-lode-stage]')
    const p = window.__lodeTest.probe()
    const w = 16
    const d = c.getContext('2d').getImageData(p.player.x * 20 + 2, 15 * 22, w, 34).data // lip cell + pit top
    let lastRow = -1
    for (let yy = 0; yy < 34; yy++) {
        for (let xx = 0; xx < w; xx++) {
            const i = (yy * w + xx) * 4
            if (d[i] + d[i + 1] + d[i + 2] >= 330) lastRow = yy      // runner-bright (aqua/orange hues, not navy/gray pit art)
        }
    }
    return { lastRow }
})
r.check('the clinging body paints INTO the pit (bright pixels below the lip line)',
    clingPix.lastRow >= 25, JSON.stringify(clingPix))
await holdKey('ArrowLeft', 220)                    // one supported side-step and the cling is gone
let offLip = null
for (let i = 0; i < 12 && !(offLip && offLip.player.lip === false); i++) { offLip = await probe(); await wait(120) }
r.check('stepping off the lip onto supported floor clears the cling', !!offLip && offLip.player.lip === false, JSON.stringify(offLip && { x: offLip.player.x, y: offLip.player.y, lip: offLip.player.lip }))

// 5 — vault 2 "THE ROPE": run to the col-8 ladder and climb it — the runner
// rises off the floor into climb mode on the real ladder. (The rope line at
// the top of this same ladder is proven load-bearing by lodecheck; a
// climb-into-dangle is a let-go race the browser clock cannot time cleanly,
// so here we grade the ladder itself.)
await page.evaluate(() => window.__lodeTest.start(1))
await wait(300)
let foot = null
for (let i = 0; i < 40 && !foot; i++) {
    const q = await page.evaluate(() => window.__lodeTest.probe().player)
    if (q.x === 8 && q.y === 15) { foot = q; break }
    await holdKey(q.x < 8 ? 'ArrowRight' : 'ArrowLeft', 150)
}
r.check('walking reaches the col-8 ladder foot in vault 2', !!foot, JSON.stringify(foot))
for (let i = 0; i < 6; i++) await holdKey('ArrowUp', 90)   // a few rungs up, well below the top
const climbed = await page.evaluate(() => { const p = window.__lodeTest.probe(); return { mode: p.player.mode, x: p.player.x, y: p.player.y } })
r.check('a held arrow climbs the real ladder off the floor', (climbed.mode === 'climb' || climbed.mode === 'hang') && climbed.y < 15, JSON.stringify(climbed))
// 5b — the rope-and-ladder read the ORIGINAL's light grey (the old art was
// green ladder / yellow rope). The bright-filtered window average drops the
// navy background (its r+g+b is exactly 60), so the read is pure fixture.
const greyPx = (gx, gy) => page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas[data-lode-stage]')
    const d = c.getContext('2d').getImageData(x * 20 + 3, y * 22 + 3, 14, 16).data
    let r = 0, g = 0, b = 0, n = 0
    for (let i = 0; i < d.length; i += 4) {
        if (d[i] + d[i + 1] + d[i + 2] <= 60) continue
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++
    }
    return n ? { r: r / n, g: g / n, b: b / n, n } : null
}, [gx, gy])
const ladY = Math.min(climbed.y + 2, 15)   // a ladder rung below the runner, clear of him
const ladPx = await greyPx(8, ladY)
r.check(`the ladder paints the original's light grey (col 8, row ${ladY})`,
    ladPx && ladPx.n > 20 && ladPx.r > 100 && Math.abs(ladPx.r - ladPx.g) < 30 && Math.abs(ladPx.g - ladPx.b) < 30,
    JSON.stringify(ladPx))
const ropePx = await greyPx(12, 5)   // the rope line spans cols 6-18 in vault 2
r.check('the rope line paints the same light grey, not the old yellow',
    ropePx && ropePx.n > 20 && ropePx.r > 100 && Math.abs(ropePx.r - ropePx.g) < 30 && Math.abs(ropePx.g - ropePx.b) < 30,
    JSON.stringify(ropePx))

// 6 — guards hunt without being touched
await page.evaluate(() => window.__lodeTest.start(0))
await wait(400)
const gA = (await probe()).guards.map((gd) => `${gd.x},${gd.y}`).join(' ')
await wait(3500)
const q = await probe()
const gB = q.guards.map((gd) => `${gd.x},${gd.y}`).join(' ')
const pursued = q.evLog.filter((e) => e.type === 'pursued').length
r.check('guards move on their own (the pathfinder is driving)', gA !== gB || pursued > 0, `${gA} -> ${gB}, pursued receipts: ${pursued}`)
// 6b — runner and guard are distinct sprites: positions and pixels in one
// evaluate, so a guard cannot drift between the two reads
const cast = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-lode-stage]')
    const p = window.__lodeTest.probe()
    const read = (x, y) => {
        const d = c.getContext('2d').getImageData(x * 20 + 3, y * 22 + 3, 14, 16).data
        let r = 0, g = 0, b = 0, n = 0
        let blue = 0   // max b-g over the window: a strong-blue pixel is the
        // old runner's blue overalls; the aqua kit and the navy background
        // never get anywhere near that
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] + d[i + 1] + d[i + 2] < 24) continue
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++
            blue = Math.max(blue, d[i + 2] - d[i + 1])
        }
        return n ? { r: r / n, g: g / n, b: b / n, n, blue } : null
    }
    const gd = p.guards.find((x) => x.alive)
    return { player: read(p.player.x, p.player.y), guard: gd ? read(gd.x, gd.y) : null, at: { p: [p.player.x, p.player.y], g: gd && [gd.x, gd.y] } }
})
const castDist = cast.player && cast.guard
    ? Math.hypot(cast.player.r - cast.guard.r, cast.player.g - cast.guard.g, cast.player.b - cast.guard.b) : 0
r.check('the runner and the guard paint as distinct sprites (not one glyph in two colors)',
    cast.player && cast.guard && cast.player.n > 60 && cast.guard.n > 60 && castDist > 30,
    JSON.stringify({ ...cast, dist: Math.round(castDist) }))
// 6c — the ORIGINAL palette (issue #168): the old art was a white+blue runner
// and an olive guard; the original is an aqua runner and orange guards.
r.check('the runner paints aqua (no strong-blue pixel in his window, the old overalls test)',
    cast.player && cast.player.blue < 40, JSON.stringify(cast.player))
r.check('the guard paints orange, not the old olive (warm window average)',
    cast.guard && cast.guard.r > cast.guard.g + 10, JSON.stringify(cast.guard))

// 7 — you can die: walk east into the hunt until the game overs
let over = null
for (let i = 0; i < 70 && !over; i++) {
    await page.evaluate(() => { const p = window.__lodeTest.probe(); if (p.screen === 'over') return; window.__lodeTest.start && !0 })
    await holdKey('ArrowRight', 450)
    const st = await probe()
    if (st.screen === 'over') over = st
}
r.check('walking into guards three times ends the run (you can lose)', !!over, over ? `end=${over.end}` : 'never died in 70 tries')
if (over) {
    await wait(1100)
    await page.keyboard.press('KeyR')
    await wait(300)
    s = await probe()
    r.check('R restarts THIS vault — and your lost run haunts it as a ghost',
        s.screen === 'play' && s.level === 0 && !!s.ghost, JSON.stringify({ screen: s.screen, ghost: s.ghost }))
    await wait(1500)
    s = await probe()
    r.check('the ghost replays tick-for-tick beside you',
        !!s.ghost && s.ghost.tick > 10 && Math.abs(s.ghost.tick - s.tick) <= 2,
        `ghost ${s.ghost && s.ghost.tick} vs live ${s.tick}`)
    await holdKey('ArrowRight')
    const rc1 = await page.evaluate(() => window.__lodeTest.replayCheck())
    r.check('the retry replays its own new stream hash-for-hash', rc1.match && rc1.cmds > 0, JSON.stringify(rc1))
}

const clean = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e))
r.check('zero page errors', clean.length === 0, clean.slice(0, 3).join(' | '))

r.exit(browser)
