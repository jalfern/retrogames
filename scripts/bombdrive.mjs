// BOMB DRIVE — real key/tap drive for TALK ME DOWN (#1252, step 6). Attract ->
// select -> play; drawn pixels follow the sim; a real keyboard strike; mic-path
// obey + refuse (grammar level, #1247); contract reset/step hashes self-agree;
// death, restart, pause — all with zero page errors. Shots land in /tmp/forge.

import { chromium } from 'playwright-core'

const URL = process.env.TMD_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/talk-me-down`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}
const cvBox = async (pg) => {
    const el = await pg.$('canvas')
    const b = await el.boundingBox()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
}
const canvasNoise = async (pg) => pg.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, c.height).data
    const seen = new Set()
    for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
    return seen.size
})
// #1373: mean luma of the four screen corners — the vignette pressure gauge.
const cornerLuma = (pg) => pg.evaluate(() => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    const box = (x0, y0) => {
        let n = 0
        for (let y = y0; y < y0 + 24; y += 2) for (let x = x0; x < x0 + 24; x += 2) {
            const i4 = (y * c.width + x) * 4
            n += (d[i4] + d[i4 + 1] + d[i4 + 2]) / 3
        }
        return n
    }
    return (box(16, 16) + box(c.width - 40, 16) + box(16, c.height - 40) + box(c.width - 40, c.height - 40)) / (4 * 169)
})

const browser = await chromium.launch({ channel: process.env.SHOT_CHANNEL || 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|AutoPlayback|favicon.ico/i.test(m.text())) errs.push(m.text()) })

await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction('!!window.__tmdTest', null, { timeout: 15000 })
await sleep(1200)
ok('attract shows', (await page.evaluate(() => window.__tmdTest.screen())) === 'attract')
ok('attract is drawn, not black', (await canvasNoise(page)) > 8)
await page.screenshot({ path: '/tmp/forge/tmd-attract.png' })

// attract animates on its own (demo bomb ticking)
const fA = await page.screenshot({ clip: await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x + b.width * 0.2, y: b.y + b.height * 0.2, width: b.width * 0.4, height: b.height * 0.5 } }) })
await sleep(1100)
const fB = await page.screenshot({ clip: await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x + b.width * 0.2, y: b.y + b.height * 0.2, width: b.width * 0.4, height: b.height * 0.5 } }) })
ok('the attract demo moves (frames differ)', !fA.equals(fB))

// attract -> select -> mode pick -> play, all with real keys
await page.keyboard.press('Space')
await sleep(200)
ok('any key reaches select', (await page.evaluate(() => window.__tmdTest.screen())) === 'select')
await page.keyboard.press('ArrowRight')
await page.keyboard.press('ArrowLeft')
await page.screenshot({ path: '/tmp/forge/tmd-select.png' })
await page.keyboard.press('Space')
await sleep(300)
ok('space starts the run (1P)', (await page.evaluate(() => window.__tmdTest.screen())) === 'play')
const st0 = await page.evaluate(() => window.__tmdTest.state())
ok('play opens a round-1 bomb', st0.round === 1 && st0.modules.length === 1)

// real keys: cycle modules + move cursor; drawn selection follows the logic
const box = await cvBox(page)
const clip = { x: box.x + 20, y: box.y + box.h * 0.15, width: box.w - 40, height: box.h * 0.73 }
const shotBefore = await page.screenshot({ clip })
// Hold ArrowRight and sample: the min-hold latch + a mod-3 wire cursor can net
// to zero on a single press, so the proof is ANY intermediate sub != 0
// while the key is down (and catch the picture then, for the pixel check).
let moved = false
let shotMid = null
await page.keyboard.down('ArrowRight')
for (let i = 0; i < 26; i++) {
    const s = await page.evaluate(() => window.__tmdTest.state())
    const subNow = s.modules[0].type === 'D' ? s.modules[0].dial !== st0.modules[0].dial : s.cursor.sub !== st0.cursor.sub
    if (subNow) {
        moved = true
        // the selection marker blinks; try a couple of phases for a visible diff
        for (let k = 0; k < 4 && !shotMid; k++) {
            const sh = await page.screenshot({ clip })
            if (!sh.equals(shotBefore)) shotMid = sh
            else await sleep(70)
        }
        if (shotMid) break
    }
    await sleep(20)
}
await page.keyboard.up('ArrowRight')
await sleep(120)
ok('real arrows move the cursor/dial (logical)', moved, `sub was ${st0.cursor.sub}`)
ok('the picture moved with the input', !!shotMid)
await page.screenshot({ path: '/tmp/forge/tmd-play.png' })

// a real strike on a seed where wire 0 is provably the wrong cut (node-pinned:
// seed 7 -> N?, target wire != 0): press SPACE at the leftmost wire
await page.evaluate(() => window.__tmdTest.start(7, 1))
await sleep(250)
await page.keyboard.press('Space')
// #1305 pixel gate: the strike must flinch the screen edges red (~500 ms
// window; poll so screenshot latency cannot decide the verdict).
let edgePeak = 0
for (let i = 0; i < 12 && edgePeak < 5000; i++) {
    edgePeak = Math.max(edgePeak, await page.evaluate(() => {
        const c = document.querySelector('canvas')
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let n = 0
        const inBand = (x, y) => y < 12 || y >= c.height - 12 || x < 12 || x >= c.width - 12
        for (let y = 0; y < c.height; y += 2) {
            for (let x = 0; x < c.width; x += 2) {
                if (!inBand(x, y)) continue
                const i4 = (y * c.width + x) * 4
                if (d[i4] > 100 && d[i4] > d[i4 + 1] + 40 && d[i4] > d[i4 + 2] + 40) n += 4
            }
        }
        return n
    }))
    await sleep(30)
}
await sleep(120)
const strikeSt = await page.evaluate(() => window.__tmdTest.state())
ok('a wrong verb at the panel trips a strike for real', strikeSt.strikes === 1, `strikes=${strikeSt.strikes}`)
ok('the strike flinches the screen edges red (pixels, #1305)', edgePeak > 5000, `peak=${edgePeak}`)

// mic grammar path (no speech service in headless — phrase injection, #1249 lesson)
const micOn = await page.evaluate(() => { window.__tmdTest.call('cut purple'); return window.__tmdTest.voiceLog().slice(-1)[0] })
ok('nonsense shout is refused with a log entry', micOn && micOn.ok === false && micOn.intent === null)
await page.evaluate(() => window.__tmdTest.call('cut red'))
const obey = await page.evaluate(() => window.__tmdTest.voiceLog().slice(-1)[0])
ok('a colour shout is understood (obey or refuse-with-why, never silent)', obey && obey.intent && obey.intent.kind === 'cut')
const mode = await page.evaluate(() => window.__tmdTest.voiceMode())
ok('voice badge reports support state', typeof mode.supported === 'boolean')

// #1373: clearing a bomb must drop a BOMB n INBOUND curtain for ~1 s — the
// old BOMB DOWN! flash landed on the already-armed next panel instead.
await page.evaluate(() => window.__tmdTest.start(9, 1))
await sleep(200)
const cleared = await page.evaluate(() => {
    const t = window.__tmdTest
    for (let i = 0; i < 40 && t.state().bombs < 1; i++) t.solveStep()
    return { bombs: t.state().bombs, curtain: t.hud().curtain }
})
ok('solver clears bomb 1 and the curtain logic arms with it', cleared.bombs >= 1 && cleared.curtain === 2, JSON.stringify(cleared))
let curtainInk = 0
for (let i = 0; i < 20 && curtainInk === 0; i++) {
    curtainInk = await page.evaluate(() => {
        if (!window.__tmdTest.hud().curtain) return 0
        const c = document.querySelector('canvas')
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let n = 0
        for (let y = 158; y <= 176; y++) for (let x = 60; x <= 360; x++) {
            const i4 = (y * c.width + x) * 4
            if (d[i4] > 200 && d[i4 + 1] > 195 && d[i4 + 2] > 170) n++ // white glyph phase
        }
        return n
    })
    if (curtainInk === 0 && !(await page.evaluate(() => window.__tmdTest.hud().curtain))) break
    await sleep(25)
}
ok('the curtain paints BOMB 2 INBOUND over the panel (pixels, #1373)', curtainInk > 30, `ink=${curtainInk}`)

// #1373: drive seat 2 with real keys — WASD+F pages the manual, walks its
// cursor and clips a paper flag. Until here seat 2 was only ever exercised by
// contract pads. The tap latch guarantees 1-2 ticks, and no round-1 cycle
// (page 3, line 3) is a divisor of 2 — deterministic movement per tap now.
await page.evaluate(() => window.__tmdTest.start(11, 2))
await sleep(250)
await page.keyboard.press('KeyD')
await sleep(150)
const pageMoved = await page.evaluate(() => window.__tmdTest.state().manualPage)
ok('seat 2 (KeyD) turns the manual page', pageMoved === 1 || pageMoved === 2, `page=${pageMoved}`)
await page.keyboard.press('KeyS')
await sleep(150)
const lineMoved = await page.evaluate(() => window.__tmdTest.state().manualLine)
ok('seat 2 (KeyS) walks the manual cursor', lineMoved === 1 || lineMoved === 2, `line=${lineMoved}`)
await page.keyboard.press('KeyF')
await sleep(180)
const flagged = await page.evaluate(() => window.__tmdTest.state().flag)
ok('seat 2 (KeyF) flags the rule it points at', !!flagged, `flag=${flagged}`)

// contract: seeded reset, 300 scripted ticks, hashes agree across resets
const h = await page.evaluate(() => {
    const g = window.__game
    const pads = i => ({ left: i % 47 < 11, right: i % 47 >= 18 && i % 47 < 30, up: i % 31 < 7, down: i % 31 >= 12 && i % 31 < 20, a: i % 23 < 2, b: false })
    g.reset(4242, 1); g.release()
    let last = 0
    for (let i = 0; i < 300; i++) last = g.step(pads(i)).hash
    g.reset(4242, 1)
    let again = 0
    for (let i = 0; i < 300; i++) again = g.step(pads(i)).hash
    return { last, again, id: g.meta.id }
})
ok('contract id + deterministic hashes', h.id === 'talk-me-down' && h.last === h.again, JSON.stringify(h))

// #1373: baseline corner brightness while the fuse is still generous (same
// seed the low-fuse sample below uses — same bomb, different clock).
await page.evaluate(() => { const g = window.__game; g.reset(7, 1); g.release() })
await sleep(150)
const lumaHi = await cornerLuma(page)

// #1305 pixel gate: below 10 s the fuse bezel must throb red whether or not
// the pulse sine is caught at its peak (alpha floor 0.45). Drive the clock with
// the contract, then sample the ring rows just outside the housing.
await page.evaluate(() => {
    const g = window.__game
    g.reset(7, 1); g.release()
    for (let t = 0; t < 3500; t++) g.step({}) // seed 7 round 1: fuse 65 s -> ~6 s left
})
await sleep(150)
const bezelOnce = async () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0
    const hot = (x, y) => {
        const i4 = (y * c.width + x) * 4
        // #1373 re-pin: the vignette overlays this region at low fuse, so the
        // gate now proves RED DOMINANCE (the ring's meaning) instead of
        // absolute brightness, which the overlay legitimately lowers.
        return d[i4] > 90 && d[i4] > d[i4 + 1] + 50 && d[i4] > d[i4 + 2] + 50
    }
    for (const row of [14, 48]) for (let x = 16; x <= 128; x++) if (hot(x, row)) n++
    for (const col of [16, 128]) for (let y = 14; y <= 48; y++) if (hot(col, y)) n++
    return n
})
let bezelRed = 0 // poll the pulse: one screenshot cannot decide a sine phase
for (let i = 0; i < 14 && bezelRed < 200; i++) {
    bezelRed = Math.max(bezelRed, await bezelOnce())
    await sleep(30)
}
ok('the last 10 s throbs a red bezel around the fuse (pixels, #1305)', bezelRed > 120, `ring pixels=${bezelRed}`)
// #1373: same low-fuse state — the four corners must sink into the vignette.
const lumaLow = await cornerLuma(page)
ok('the last 10 s sinks the corners into a vignette (pixels, #1373)', lumaHi - lumaLow >= 8, `hi=${lumaHi.toFixed(1)} lo=${lumaLow.toFixed(1)}`)

// die for real via the contract clock, then restart with a real key
await page.evaluate(() => {
    const g = window.__game
    g.reset(7, 1)
    for (let t = 0; t < 5200; t++) g.step({})
})
await sleep(300)
const dead = await page.evaluate(() => ({ screen: window.__tmdTest.screen(), st: window.__tmdTest.state() }))
ok('an ignored fuse explodes into the over screen', dead.screen === 'over' && dead.st.done && !dead.st.won)
await page.screenshot({ path: '/tmp/forge/tmd-over.png' })
await sleep(900)
await page.keyboard.press('Space')
await sleep(250)
ok('space after game over returns to attract', (await page.evaluate(() => window.__tmdTest.screen())) === 'attract')

// tap-to-start on touch: reload and tap the canvas
await page.reload({ waitUntil: 'load' })
await page.waitForFunction('!!window.__tmdTest', null, { timeout: 15000 })
await sleep(800)
const cv = await page.$('canvas')
await cv.click({ position: { x: 120, y: 120 } })
await sleep(200)
ok('tap advances the attract screen', (await page.evaluate(() => window.__tmdTest.screen())) === 'select')

// pause overlay during play
await page.keyboard.press('Space')
await sleep(250)
await page.keyboard.press('Escape')
await sleep(250)
const pausedShown = await page.evaluate(() => /TALK ME DOWN/i.test(document.body.innerText))
ok('escape raises the squad card (pause overlay)', pausedShown)
await page.keyboard.press('Escape')

// #1373: tap-to-talk pill (phones have no V key, #1287 pattern). `?touch=1`
// forces it on for the headless proof; a tap must toggle the mic badge AND
// must not leak a pointerdown into the screen machine (stays on select).
await page.goto(URL + '?touch=1', { waitUntil: 'load' })
await page.waitForFunction('!!window.__tmdTest', null, { timeout: 15000 })
await sleep(800)
await page.keyboard.press('Space') // attract -> select
await sleep(200)
const pill = await page.$('[data-voice-coop]')
ok('the mic pill is present on touch surfaces (DOM, #1373)', !!pill)
if (pill) {
    await pill.click()
    await sleep(150)
    const m1 = await page.evaluate(() => ({
        on: window.__tmdTest.voiceMode().on,
        screen: window.__tmdTest.screen(),
        attr: document.querySelector('[data-voice-coop]').getAttribute('data-voice-coop'),
    }))
    ok('tapping the pill turns the mic on (badge state)', m1.on && m1.attr === 'on', JSON.stringify(m1))
    ok('the pill tap does not leak into the screen machine', m1.screen === 'select', `screen=${m1.screen}`)
    await pill.click()
    await sleep(150)
    ok('a second tap releases the mic', await page.evaluate(() => window.__tmdTest.voiceMode().on) === false)
}

ok('zero page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
await browser.close()
console.log(`\nbombdrive: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
