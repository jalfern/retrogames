// BOMB DRIVE — real key/tap drive for TALK ME DOWN (#1252, step 6). Attract ->
// select -> play; drawn pixels follow the sim; a real keyboard strike; mic-path
// obey + refuse (grammar level, #1247); contract reset/step hashes self-agree;
// death, restart, pause — all with zero page errors. Shots land in /tmp/forge.

import { launchChrome } from './lib/chromeboot.mjs'
import { wrongWireAt } from './lib/tmdwrongwire.mjs'

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

const browser = await launchChrome({ channel: process.env.SHOT_CHANNEL || 'chrome', extraArgs: ['--autoplay-policy=no-user-gesture-required'] })
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

// A real strike on a wire that IS provably the wrong cut — derived LIVE from
// the panel the browser just painted, never remembered (#1871: seed 7's
// round-1 answer moved to wire 0 when #1909/#1917 shifted the rng draws, so
// the old seed-pinned premise made SPACE SOLVE and two gates went stale-red).
await page.evaluate(() => window.__tmdTest.start(7, 1))
await sleep(250)
const aim0 = await page.evaluate(() => window.__tmdTest.state())
const aim = wrongWireAt(aim0)
ok('the painted panel offers a wire the rulebook does not want', !!aim,
    aim ? '' : JSON.stringify({ stamp: aim0.modules[aim0.cursor.mod]?.stamp }))
// walk the cursor onto the wrong wire with real arrows, verifying each step
let aimOk = !!aim, cur = aim ? aim0.cursor.sub : -1
if (aim) {
    for (let g0 = 0; cur !== aim.wrong && g0 < 8; g0++) {
        await page.keyboard.press(cur < aim.wrong ? 'ArrowRight' : 'ArrowLeft')
        await sleep(90)
        cur = (await page.evaluate(() => window.__tmdTest.state())).cursor.sub
    }
}
ok('the cursor rides to the provably-wrong wire (real keys)', aimOk && cur === aim.wrong, `sub=${cur} wrong=${aim?.wrong}`)
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

// #1415: a LIVE capture banks voiceCmd (#1249 Gauntlet pattern, now for TMD).
// recordStart, then let the NATURAL loop tick (loop-lock released -> tickSim
// feeds recordLiveTick), injecting obey + refuse + no-call calls mid-capture.
// Audit: every heard call lands in the trace, and __game.replay still matches
// hashes at every checkpoint (replay ignores the metadata channel).
// Capture must OPEN on tick zero: reset, release and recordStart in ONE
// evaluate — no rAF frame between them — so recorder ticks and sim ticks
// share an origin and the banked hashes replay-exact (a capture opened
// mid-run would stamp every checkpoint ~N ticks ahead of the replay clock).
await page.evaluate(() => { const g = window.__game; g.reset(7, 1); g.release(); g.recordStart(30) })
await sleep(400) // natural rAF ticks bank pads + hashes
await page.evaluate(() => window.__tmdTest.call('cut red'))
await sleep(120)
await page.evaluate(() => window.__tmdTest.call('hello there'))
await sleep(350) // keep ticking after the calls so their recorder-clock stamps fit
const recRes = await page.evaluate(() => {
    const rec = window.__game.recordStop()
    window.__tmdRec = rec
    return rec ? { fmt: rec.format, ticks: rec.ticks, hashes: rec.hashes.length, cmds: (rec.voiceCmd || []).map(c => ({ ...c })) } : null
})
ok('the natural loop feeds a live capture (ticks banked)', recRes && recRes.ticks >= 20 && recRes.hashes >= 1, JSON.stringify(recRes && { t: recRes.ticks, h: recRes.hashes }))
ok('heard calls bank into voiceCmd (obey + no-call)', recRes && Array.isArray(recRes.cmds) && recRes.cmds.length === 2 &&
    recRes.cmds[0].intent === 'cut' && recRes.cmds[1].intent === null && recRes.cmds[1].why === 'NO CALL', JSON.stringify(recRes && recRes.cmds))
const recReplay = await page.evaluate(() => window.__game.replay(window.__tmdRec))
ok('the captured file replays hash-exact with the trace inside', recReplay.ok, JSON.stringify(recReplay.mismatch || recReplay.error))

// #1415 pixel gate: the defuser's LCD rail footer etches the accepted call
// shapes under the glass — bright ink on the near-black frame (rows just under
// the glass; the glass itself ends at y+20). Dim steel while the mic is off,
// LCD green while it listens: the hint doubles as a mic-state echo.
const footerInk = (green) => page.evaluate((wantGreen) => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(16, 333, 320, 10).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g0 = d[i + 1], b = d[i + 2]
        if (wantGreen ? (g0 > 110 && g0 > r + 40 && g0 > b + 40) : (r > 70 && g0 > 70 && b > 70 && Math.abs(r - g0) < 30)) n++
    }
    return n
}, green)
await page.evaluate(() => { const g = window.__game; g.reset(7, 1); g.release() })
await sleep(200)
const inkOff = await footerInk(false)
ok('the call-hint footer is etched on the LCD rail (pixels, mic off)', inkOff > 60, `ink=${inkOff}`)
await page.keyboard.press('KeyV') // mic on
await sleep(200)
const inkOn = await footerInk(true)
ok('the footer glows green while the mic listens (pixels)', inkOn > 60, `ink=${inkOn}`)
await page.keyboard.press('KeyV') // mic off again
await sleep(150)

// ---- #1894 CALL-BY-KEY: real keystrokes deliver a call, no injection ------
// The gap this closes: headless CI had no speech service, so grammar +
// obey/refuse was PROVED ONLY THROUGH __tmdTest.call (a door around the mic
// layer) and delivery was badge state. Here the whole path runs on real key
// events: C opens, letters compose, ENTER shouts — through voice.js, onto the
// glass, into the #1415 bank. The mic keeps its own V while the line is shut;
// while it is open the keyboard is a mouth: arrows make no pad, V is a letter.
await page.evaluate(() => { window.__tmdTest.start(7, 1); window.__game.release() })
await sleep(250)
const glassInk = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(16, 314, 320, 18).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) { const r = d[i], g0 = d[i + 1], b = d[i + 2]; if (r > 150 && g0 > 110 && b < 130) n++ }
    return n
})
await page.keyboard.press('KeyX')
await sleep(80)
const opened = await page.evaluate(() => window.__tmdTest.callLine())
ok('X opens the CALL line', opened.open === true && opened.buf === '')
let inkEmpty = 0
for (let i = 0; i < 12 && inkEmpty <= 20; i++) { inkEmpty = Math.max(inkEmpty, await glassInk()); await sleep(50) }
ok('the glass shows CALL> with a caret (pixels)', inkEmpty > 20, `ink=${inkEmpty}`)
for (const k of ['KeyC', 'KeyU', 'KeyT', 'Space', 'KeyR', 'KeyE', 'KeyD']) await page.keyboard.press(k)
const typed = await page.evaluate(() => window.__tmdTest.callLine())
ok('letters and SPACE compose on the line', typed.open === true && typed.buf === 'cut red', JSON.stringify(typed))
// words are orders, not hands: an arrow while composing reaches no pad
const beforePad = await page.evaluate(() => window.__tmdTest.keys())
await page.keyboard.press('ArrowRight')
const afterPad = await page.evaluate(() => window.__tmdTest.keys())
const stillBuf = await page.evaluate(() => window.__tmdTest.callLine())
ok('an arrow mid-call is swallowed (no pad leak, text intact)', !afterPad.right && stillBuf.buf === 'cut red', `right=${afterPad.right} buf=${stillBuf.buf}`)
void beforePad
// V is just a letter while open (the mic switch resumes when shut)
await page.keyboard.press('KeyV')
const vTyped = await page.evaluate(() => ({ line: window.__tmdTest.callLine(), mode: window.__tmdTest.voiceMode() }))
ok('V types v while open and does NOT toggle the mic', vTyped.line.buf === 'cut redv' && vTyped.mode.on === false, JSON.stringify(vTyped))
await page.keyboard.press('Backspace') // drop the stray v
// ENTER shouts: the mic's own entry, so the same banner + log shape lands
await page.keyboard.press('Enter')
await sleep(60)
const cutEntry = await page.evaluate(() => window.__tmdTest.voiceLog().slice(-1)[0])
ok('ENTER shouts the line: cut intent through the shared grammar', cutEntry && cutEntry.intent && cutEntry.intent.kind === 'cut' && cutEntry.ok === true, JSON.stringify(cutEntry))
const closedAfter = await page.evaluate(() => window.__tmdTest.callLine())
ok('a shout closes the line', closedAfter.open === false && closedAfter.buf === '')
// poll: software-rendered Chrome commits frames ~100ms behind the sim
// (the #1305 bezel gate polls for the same reason; a single sample reads the
// pre-banner frame).
let bannerInk = 0
for (let i = 0; i < 12 && bannerInk <= 40; i++) {
    bannerInk = Math.max(bannerInk, await page.evaluate(() => {
        const c = document.querySelector('canvas')
        const d = c.getContext('2d').getImageData(170, 40, 300, 18).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) { const r = d[i], g0 = d[i + 1], b = d[i + 2]; if (g0 > 150 && g0 > r + 40 && g0 > b + 40) n++ }
        return n
    }))
    await sleep(50)
}
ok('the HEARD banner lights green for the typed shout (pixels)', bannerInk > 40, `ink=${bannerInk}`)
// nonsense typed is NO CALL — the line grew no grammar of its own
await page.keyboard.press('KeyX')
for (const k of ['KeyH', 'KeyE', 'KeyL', 'KeyL', 'KeyO', 'Space', 'KeyT', 'KeyH', 'KeyE', 'KeyR', 'KeyE']) await page.keyboard.press(k)
await page.keyboard.press('Enter')
const junkEntry = await page.evaluate(() => window.__tmdTest.voiceLog().slice(-1)[0])
ok('typed nonsense gets the same NO CALL refusal as a shout', junkEntry && junkEntry.intent === null && junkEntry.ok === false && junkEntry.said === 'hello there', JSON.stringify(junkEntry))
// the small line laws
await page.keyboard.press('KeyX'); await page.keyboard.press('KeyA'); await page.keyboard.press('Backspace')
ok('Backspace at empty closes the line', (await page.evaluate(() => window.__tmdTest.callLine())).open === false)
await page.keyboard.press('KeyX'); await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyX')
const cClosed = await page.evaluate(() => window.__tmdTest.callLine())
ok('X closes what X opened, discarding the draft', cClosed.open === false && cClosed.buf === '')
await page.keyboard.press('KeyX'); await page.keyboard.press('KeyZ'); await page.keyboard.press('Escape')
const escClosed = await page.evaluate(() => window.__tmdTest.callLine())
ok('Escape sheathes the line WITHOUT raising the pause card', escClosed.open === false && escClosed.paused === false, JSON.stringify(escClosed))
// parity with the #1415 bank law: a typed shout lands in the live capture
await page.evaluate(() => { window.__tmdTest.start(7, 1); window.__game.release(); window.__game.recordStart(30) }) // release AFTER replay-lock
await sleep(400)
await page.keyboard.press('KeyX')
for (const k of ['KeyC', 'KeyU', 'KeyT', 'Space', 'KeyR', 'KeyE', 'KeyD']) await page.keyboard.press(k)
await page.keyboard.press('Enter')
await sleep(350)
const keyRec = await page.evaluate(() => {
    const r = window.__game.recordStop(); window.__tmdKeyRec = r
    return r ? { cmds: (r.voiceCmd || []).map(c => ({ ...c })), hashes: r.hashes.length } : null
})
ok('a typed shout banks voiceCmd like a heard one (live capture)', keyRec && keyRec.cmds.length === 1 && keyRec.cmds[0].intent === 'cut' && keyRec.cmds[0].ok === true, JSON.stringify(keyRec && keyRec.cmds))
const keyReplay = await page.evaluate(() => window.__game.replay(window.__tmdKeyRec))
ok('the capture with the typed call replays hash-exact', keyReplay.ok === true, JSON.stringify(keyReplay.mismatch || keyReplay.error))
await page.evaluate(() => window.__game.release()) // replay locks the clock — the sections downstream expect it running
// #1637 law: words never release the WATCH seat — typed included
await page.evaluate(() => { window.__tmdTest.start(9, 1); window.__game.release() })
await sleep(200)
await page.keyboard.press('KeyY')
ok('watch seated for the word test', await page.evaluate(() => window.__tmdTest.watching()))
await page.keyboard.press('KeyX')
for (const k of ['KeyS', 'KeyE', 'KeyT']) await page.keyboard.press(k)
await page.keyboard.press('Enter')
const wordWatch = await page.evaluate(() => ({ w: window.__tmdTest.watching(), e: window.__tmdTest.voiceLog().slice(-1)[0] }))
ok('a typed word keeps the watch seat (orders, not hands)', wordWatch.w === true && wordWatch.e && wordWatch.e.intent && wordWatch.e.intent.kind === 'set', JSON.stringify(wordWatch))
await page.keyboard.press('ArrowLeft') // a hand takes over again for the exit paths
// mic-off footer is the keyboard coach: steel ink where the shapes used to glow
await page.evaluate(() => { window.__tmdTest.start(7, 1); window.__game.release() })
await sleep(200)
let coachInk = 0
for (let i = 0; i < 12 && coachInk <= 60; i++) {
    coachInk = Math.max(coachInk, await page.evaluate(() => {
        const c = document.querySelector('canvas')
        const d = c.getContext('2d').getImageData(16, 333, 320, 10).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) { const r = d[i], g0 = d[i + 1], b = d[i + 2]; if (r > 70 && g0 > 70 && b > 70 && Math.abs(r - g0) < 30) n++ }
        return n
    }))
    await sleep(50)
}
ok('the mic-off footer coaches the keys instead (steel pixels)', coachInk > 60, `ink=${coachInk}`)
await page.evaluate(() => { window.__tmdTest.start(9, 1); window.__game.release() })
await sleep(200)

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
let lumaHi = 0 // poll the brightest frame: the vignette throbs with sin(tick/6)
for (let i = 0; i < 12; i++) { lumaHi = Math.max(lumaHi, await cornerLuma(page)); await sleep(50) } // #1305 law: one screenshot cannot decide a sine phase

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
let bezelRed = 0 // poll the pulse: one screenshot cannot decide a sine phase.
// #1888 (from a fresh playtest run): on a loaded box the poll loop can read
// frame after frame at the SAME pulse phase — wall-clock polling leaves phase
// coverage to the render loop, and a starved render loop freezes the sine.
// Advance the pulse in WORLD time via the contract clock between samples
// (~5 ticks per poll sweeps the 31-tick period regardless of paint cadence;
// the fuse still has ~400 ticks of margin, so no early boom).
for (let i = 0; i < 14 && bezelRed < 200; i++) {
    await page.evaluate(() => { const g = window.__game; for (let t = 0; t < 5; t++) g.step({}) })
    bezelRed = Math.max(bezelRed, await bezelOnce())
    await sleep(30)
}
ok('the last 10 s throbs a red bezel around the fuse (pixels, #1305)', bezelRed > 120, `ring pixels=${bezelRed}`)
// #1373: same low-fuse state — the four corners must sink into the vignette.
let lumaLow = Infinity // same law on the sunken side: poll to the trough of the pulse
for (let i = 0; i < 12; i++) { lumaLow = Math.min(lumaLow, await cornerLuma(page)); await sleep(50) }
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

// ---- #1797 the back panel: real-key tilt, drawn batteries, voice pulse -------
{
    await page.evaluate(() => { const g = window.__game; g.reset(7, 1); g.release() })
    await sleep(150)
    await page.keyboard.down('ArrowUp')
    await sleep(120)
    await page.keyboard.up('ArrowUp')
    await sleep(120)
    const tilting = await page.evaluate(() => window.__tmdTest.state().flipped)
    ok('real ArrowUp at module 1 tilts the bomb onto its back', tilting === 1, `flipped=${tilting}`)
    const backPx = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let amber = 0
        for (let y = 150; y < 240; y++) {
            for (let x = 126; x < 322; x++) {
                const i4 = (y * c.width + x) * 4
                if (d[i4] > 180 && d[i4 + 1] > 110 && d[i4 + 1] < 200 && d[i4 + 2] < 90) amber++
            }
        }
        return amber
    })
    ok('the back plate draws its battery bank (amber battery pixels)', backPx > 600, `amber=${backPx}`)
    // #1917 THE RAIL with real keys: pick a blocked slot -> silence; home to
    // the open end -> the cell comes out; once more -> it re-clips home.
    {
        const st0 = await page.evaluate(() => window.__tmdTest.state())
        ok('the rail reaches the test hook (tray/sel in simState)', Array.isArray(st0.tray) && st0.tray.length === 3 && Number.isInteger(st0.sel))
        const t0 = st0.tray.map(Number)
        let open = -1
        for (let j = 2; j >= 0; j--) if (t0[j]) { open = j; break }
        let sCur = st0.sel
        const goTo = async target => {
            while (sCur !== target) {
                await page.keyboard.press(sCur > target ? 'ArrowLeft' : 'ArrowRight')
                await sleep(90)
                sCur = await page.evaluate(() => window.__tmdTest.state().sel)
            }
        }
        const blocked = (open + 2) % 3
        if (st0.held === 0 && open >= 0 && t0[blocked] === 1) {
            await goTo(blocked)
            const pre = await page.evaluate(() => window.__tmdTest.state())
            await page.keyboard.press('Space'); await sleep(120)
            const ref = await page.evaluate(() => window.__tmdTest.state())
            ok('real keys at a blocked slot: silence — no pull, no strike, hand stays',
                ref.held === pre.held && ref.pulls === pre.pulls && ref.strikes === pre.strikes && ref.batteries === pre.batteries,
                JSON.stringify([ref.held, ref.pulls, ref.strikes, ref.batteries]))
            await goTo(open)
            await page.keyboard.press('Space'); await sleep(120)
            const out = await page.evaluate(() => window.__tmdTest.state())
            ok('the open-end cell comes out on a real Space (rail truth in state)',
                out.held === 1 && out.pulls === st0.pulls + 1 && out.heldSlot === open && out.batteries === st0.batteries - 1,
                JSON.stringify([out.held, out.pulls, out.heldSlot, out.batteries]))
            await page.keyboard.press('Space'); await sleep(120)
            const back = await page.evaluate(() => window.__tmdTest.state())
            ok('put-back re-clips the cell to the slot it came from',
                back.held === 0 && back.batteries === st0.batteries && back.tray.map(Number).join('') === t0.join(''),
                JSON.stringify([back.held, back.batteries, back.tray.join('')]))
        }
    }
    // wrong verbs on the back stay silent — a strike would spark + shake
    const before = await page.evaluate(() => window.__tmdTest.state())
    await page.keyboard.press('Space')
    await sleep(120)
    const afterBack = await page.evaluate(() => window.__tmdTest.state())
    ok('Space on the back is refused silently — no strike, no score',
        afterBack.strikes === before.strikes && afterBack.score === before.score && afterBack.flipped === 1)
    await page.keyboard.down('ArrowDown')
    await sleep(120)
    await page.keyboard.up('ArrowDown')
    await sleep(120)
    ok('real ArrowDown tilts back to the modules', await page.evaluate(() => window.__tmdTest.state().flipped) === 0)
    // voice: a shouted flip pulses the hint — words make things visible, they
    // never act (#1247): flipped must STAY 0 while the hint glows amber.
    await page.evaluate(() => { window.__tmdTest.call('flip it') })
    await sleep(60)
    const pulse = await page.evaluate(() => ({
        flipped: window.__tmdTest.state().flipped,
        log: window.__tmdTest.voiceLog().slice(-1)[0],
    }))
    ok('a heard FLIP pulses instead of acting (words visible, hands yours)',
        pulse.flipped === 0 && pulse.log && pulse.log.ok === true && pulse.log.intent && pulse.log.intent.kind === 'flip',
        JSON.stringify(pulse))
}

ok('zero page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
await browser.close()
console.log(`\nbombdrive: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
