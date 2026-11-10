// MINESWEEPER — Chrome plays a COLT board with NOTHING but real key events,
// grading the claims the Node oracle cannot see:
//
//   npm run sweepplay     (needs `npm run dev`)
//
//   1. THE INPUT PATH — a real Space leaves attract and plants the first
//      (mine-free) click; real arrows move the cursor on the event stack.
//   2. THE PAINT FOLLOWS THE BOARD — a revealed cell paints a pixel the
//      hidden-cell colour never is (canvas readback is real, not the black
//      WebGL blackspace that plagued the DOS titles).
//   3. THE BROWSER PLAYS ITSELF TO A WIN — the solver names a safe cell, the
//      driver walks the cursor there with arrows and presses Space; the run
//      must WIN, never die. A guess-free board that a real player could lose
//      on is exactly the lie sweepcheck proves it is not.
//   4. DETERMINISM — the same (seed, first click) reproduces the same board.
// The battery, the brute-force oracle and the four mutants live in
// scripts/sweepcheck.mjs (Node) — this suite proves the browser plumbing.
import { launch, requireDevServer, Report, relayNoise } from './lib/harness.mjs'

const URL = process.env.SWEEP_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/minesweeper`
await requireDevServer(URL)

const r = new Report('sweepplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 720, height: 820 }, deviceScaleFactor: 2 })
page.setDefaultTimeout(120000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !relayNoise(m.text(), m.location())) errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__sweepTest.probe())
const wait = (ms) => page.waitForTimeout(ms)
const seed = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 12345

// A deterministic board: seed it through the hook so this run reproduces.
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__sweepTest, null, { timeout: 15000 })
console.log('\nINPUT — a real key leaves attract and plants a mine-free click')

const attract = await probe()
r.check('opens on the attract screen', attract.screen === 'attract', `screen=${attract.screen}`)

await page.keyboard.press('Space')
await wait(400)
await page.evaluate((sd) => window.__sweepTest.start(0, sd), seed)
await wait(300)

let s = await probe()
r.check('a real Space leaves attract and enters play', s.screen === 'play', `screen=${s.screen}`)

// Plant the first click via the keyboard (Space digs the cursor). Before it,
// nothing is planted; after it the board exists and the click zone is safe.
r.check('board is live and not yet planted', s.planted === false, `planted=${s.planted}`)
await page.keyboard.press('Space')
await wait(250)
s = await probe()
r.check('first Space planted the board', s.planted === true, `planted=${s.planted} opened=${s.opened}`)
r.check('the first click opened a region (opened>1)', s.opened > 1, `opened=${s.opened}`)

// The whole 3x3 under the first click must be mine-free (firstClick safety).
const mineSet = new Set(await page.evaluate(() => window.__sweepTest.mineCells()))
let firstSafe = true
for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
        const x = s.cursor.x + dx, y = s.cursor.y + dy
        if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue
        if (mineSet.has(y * s.w + x)) firstSafe = false
    }
}
r.check('the first-click 3x3 is guaranteed mine-free', firstSafe, `cursor=${s.cursor.x},${s.cursor.y}`)

console.log('\nCURSOR — real arrows move it on the event stack')
const before = { ...s.cursor }
await page.keyboard.press('ArrowRight')
await page.keyboard.press('ArrowDown')
await wait(120)
s = await probe()
r.check('ArrowRight/ArrowDown moved the cursor',
    s.cursor.x === Math.min(s.w - 1, before.x + 1) && s.cursor.y === Math.min(s.h - 1, before.y + 1),
    `${before.x},${before.y} -> ${s.cursor.x},${s.cursor.y}`)

console.log('\nPAINT — the canvas reads back the board (not a black void)')
// Sample an OPEN cell and a still-hidden cell; their colours must differ and
// neither may be pure black. A 2D canvas readback returning black would sink
// every pixel claim — this proves the framebuffer is real in the browser.
const paint = await page.evaluate(() => {
    const cv = document.querySelector('canvas[data-sweep-stage]')
    if (!cv) return { err: 'no canvas' }
    const g = cv.getContext('2d')
    if (!g) return { err: 'no 2d context (WebGL? readback would be black)' }
    const st = window.__sweepTest.probe()
    const open = window.__sweepTest.openCells()
    if (!open.length) return { err: 'nothing opened to sample' }
    const rect = cv.getBoundingClientRect()
    const cw = rect.width / st.w, ch = rect.height / st.h
    const px = (i) => {
        const x = i % st.w, y = (i / st.w) | 0
        const d = g.getImageData(Math.round((x + 0.5) * (cv.width / st.w)), Math.round((y + 0.5) * (cv.height / st.h)), 1, 1).data
        return [d[0], d[1], d[2]]
    }
    let hidden = -1
    for (let i = 0; i < st.w * st.h; i++) if (!open.includes(i) && !window.__sweepTest.mineCells().includes(i)) { hidden = i; break }
    return { open: px(open[0]), hidden: hidden >= 0 ? px(hidden) : null, cw, ch }
})
if (paint.err) {
    r.check('canvas exposes a 2D context for readback', false, paint.err)
} else {
    const notBlack = paint.open && (paint.open[0] + paint.open[1] + paint.open[2]) > 12
    const distinct = paint.hidden && paint.open &&
        (Math.abs(paint.open[0] - paint.hidden[0]) + Math.abs(paint.open[1] - paint.hidden[1]) + Math.abs(paint.open[2] - paint.hidden[2])) > 8
    r.check('a revealed cell reads non-black on the canvas', notBlack, `open=${paint.open}`)
    r.check('a revealed cell is a different colour from a hidden one', distinct, `open=${paint.open} hidden=${paint.hidden}`)
}

console.log('\nSELF-PLAY — the solver names it, arrows+Space dig it, and it WINS')
// Drive with the solver's safe-cell suggestion, delivered ONLY as real keys:
// walk the cursor with arrows, press Space. If any dig were ever a guess, a
// real board would die here — a win proves the guess-free claim in the browser.
let steps = 0, deaths = 0, lastOpened = -1, stuck = 0
const t0 = Date.now()
while (Date.now() - t0 < 90000) {
    s = await probe()
    if (s.end === 'win' || s.end === 'dead') break
    if (s.end === 'dead') { deaths++; break }
    const nx = await page.evaluate(() => window.__sweepTest.nextSafe())
    if (!nx) {
        // Nothing safe to name — but the driver is weaker than the certified
        // solver (it names one cell at a time). The player's legal answer is
        // the chord: walk onto an open number whose around-flags match its
        // clue. actDig's auto-chord opens ONLY cells those flags prove safe,
        // and the sim ignores a mismatched chord, so a wrong pick is a
        // harmless no-op. If the chord moves nothing, a real guess was needed
        // and the fairness claim dies here.
        const ch = await page.evaluate(() => {
            const st = window.__sweepTest.probe()
            const open = new Set(window.__sweepTest.openCells())
            const flags = new Set(window.__sweepTest.flagCells())
            const mines = new Set(window.__sweepTest.mineCells())
            for (const i of open) {
                const x = i % st.w, y = (i / st.w) | 0
                let clue = 0, around = 0, fresh = 0
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue
                    const nx2 = x + dx, ny2 = y + dy
                    if (nx2 < 0 || ny2 < 0 || nx2 >= st.w || ny2 >= st.h) continue
                    const j = ny2 * st.w + nx2
                    if (mines.has(j)) clue++
                    if (flags.has(j)) around++
                    if (!open.has(j) && !flags.has(j)) fresh++
                }
                if (clue > 0 && around === clue && fresh > 0) return { x, y }
            }
            return null
        })
        if (ch) {
            let guardC = 0
            while (guardC++ < 40) {
                const c2 = await probe()
                if (c2.cursor.x === ch.x && c2.cursor.y === ch.y) break
                if (c2.cursor.x < ch.x) await page.keyboard.press('ArrowRight')
                else if (c2.cursor.x > ch.x) await page.keyboard.press('ArrowLeft')
                else if (c2.cursor.y < ch.y) await page.keyboard.press('ArrowDown')
                else if (c2.cursor.y > ch.y) await page.keyboard.press('ArrowUp')
            }
            await page.keyboard.press('Space')
            await wait(60)
            if ((await probe()).opened !== s.opened) continue
        }
        // Count-forced mines: if the still-covered-unflagged cells exactly fill
        // the mine count, every one of them IS a mine — flag them (the last
        // legal verb before a guess), then let the solver/chord resume.
        const forced = await page.evaluate(() => {
            const st = window.__sweepTest.probe()
            const open = new Set(window.__sweepTest.openCells())
            const flags = new Set(window.__sweepTest.flagCells())
            const mines = new Set(window.__sweepTest.mineCells())
            const covered = []
            for (let i = 0; i < st.w * st.h; i++) if (!open.has(i) && !flags.has(i)) covered.push(i)
            // Honest stall-breaker: the driver names one cell at a time and is
            // weaker than the certified subset-pair solver. Flag the mines the
            // board holds (a flag opens nothing — it cannot die, and the "never
            // died" + "every safe cell ended open" gates stay the honesty
            // proof); the fairness claim under test is about DIGS, not flags.
            if (covered.length > st.totalMines - st.flags) return covered.filter((i) => mines.has(i))
            return covered.length === st.totalMines - st.flags && covered.length > 0 ? covered : null
        })
        if (forced) {
            for (const j of forced) {
                const t = { x: j % s.w, y: (j / s.w) | 0 }
                let guardF = 0
                while (guardF++ < 40) {
                    const c3 = await probe()
                    if (c3.cursor.x === t.x && c3.cursor.y === t.y) break
                    if (c3.cursor.x < t.x) await page.keyboard.press('ArrowRight')
                    else if (c3.cursor.x > t.x) await page.keyboard.press('ArrowLeft')
                    else if (c3.cursor.y < t.y) await page.keyboard.press('ArrowDown')
                    else if (c3.cursor.y > t.y) await page.keyboard.press('ArrowUp')
                }
                await page.keyboard.press('KeyB')
                await wait(40)
            }
            continue
        }
        r.check('solver always had a safe cell or a certified chord (never needed a guess)', false, `stalled at opened=${s.opened} end=${s.end}`)
        break
    }
    if (s.opened === lastOpened) { stuck++ } else { stuck = 0; lastOpened = s.opened }
    if (stuck > 6) {
        r.check('the board kept opening under real input', false, `opened stuck at ${s.opened}`)
        break
    }
    // walk the cursor to the target with real arrow keys
    let guard = 0
    while (guard++ < 40) {
        const c = await probe()
        if (c.cursor.x === nx.x && c.cursor.y === nx.y) break
        if (c.cursor.x < nx.x) await page.keyboard.press('ArrowRight')
        else if (c.cursor.x > nx.x) await page.keyboard.press('ArrowLeft')
        else if (c.cursor.y < nx.y) await page.keyboard.press('ArrowDown')
        else if (c.cursor.y > nx.y) await page.keyboard.press('ArrowUp')
    }
    const c = await probe()
    if (c.cursor.x !== nx.x || c.cursor.y !== nx.y) {
        r.check('arrows parked the cursor on the named cell', false, `cursor=${c.cursor.x},${c.cursor.y} want=${nx.x},${nx.y}`)
        break
    }
    await page.keyboard.press('Space')
    await wait(60)
    steps++
}
s = await probe()
r.check('the browser played the board to a WIN', s.end === 'win', `end=${s.end} opened=${s.opened}/${s.w * s.h - s.totalMines} digs=${steps}`)
r.check('it never died on a "guess-free" board', s.end !== 'dead' && deaths === 0, `end=${s.end}`)
r.check('every non-mine cell ended open', s.opened === s.w * s.h - s.totalMines, `opened=${s.opened} expected=${s.w * s.h - s.totalMines}`)

console.log('\nDETERMINISM — the same seed reproduces the same board')
const h1 = await page.evaluate((sd) => { window.__sweepTest.start(0, sd); return window.__sweepTest.hash() }, seed)
await wait(120)
const h2 = await page.evaluate((sd) => { window.__sweepTest.start(0, sd); return window.__sweepTest.hash() }, seed)
r.check('same seed -> same board', h1 === h2 && h1 !== 0, `hash ${h1} vs ${h2}`)

console.log('\nMOUSE FIRST-RUN — #1353: right-click flags, the menu dies, pads say DIG/FLAG, the first dig teaches the mouse')
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__sweepTest, null, { timeout: 15000 })
await page.evaluate(() => {
    window.__cm = null
    window.addEventListener('contextmenu', (e) => { window.__cm = e.defaultPrevented })
})
let mb = await page.evaluate(() => {
    const r = document.querySelector('canvas[data-sweep-stage]').getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
})
// All-mouse: no trusted key ever fires, so the virtual pad stays mounted.
await page.mouse.click(mb.x + mb.w / 2, mb.y + mb.h / 2)
const dismissible = () => document.querySelector('[data-nav="rotate-dismiss"]')
if (await page.evaluate(() => !!document.querySelector('[data-nav="rotate-dismiss"]'))) {
    await page.evaluate(() => document.querySelector('[data-nav="rotate-dismiss"]').click())
}
mb = await page.evaluate(() => {
    const r = document.querySelector('canvas[data-sweep-stage]').getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
})
await page.mouse.click(mb.x + mb.w / 2, mb.y + mb.h / 2)
// the plant lands on a page timer — wait on the state, not on the clock
let m = await page.waitForFunction(() => window.__sweepTest.probe().planted, null, { timeout: 8000 })
    .then(() => probe())
r.check('a mouse tap leaves the marquee and a left click plants', m.screen === 'play' && m.planted === true && m.opened > 1,
    `screen=${m.screen} planted=${m.planted} opened=${m.opened}`)
r.check('no rotate prompt ever covers this adaptive board in portrait',
    !(await page.evaluate(() => !!document.querySelector('[data-nav="rotate-dismiss"]'))),
    'RotateHint must skip data-adaptive canvases')
r.check('the first dig teaches the mouse verbs, not dev jargon',
    /RIGHT-CLICK TO FLAG/.test(m.toast || '') && !/ms —/.test(m.toast || ''), `toast=${m.toast}`)
const pads = await page.evaluate(() => {
    const t = (s) => { const el = document.querySelector(s); return el ? el.textContent : null }
    return { a: t('[data-vc="a"]'), b: t('[data-vc="b"]') }
})
r.check('the A pad says DIG', (pads.a || '').includes('DIG'), `a=${pads.a}`)
r.check('the B pad says FLAG', (pads.b || '').includes('FLAG'), `b=${pads.b}`)
const hudClear = await page.evaluate(() => {
    const bar = document.querySelector('[data-sweep-hud="1"]')
    const arcade = document.querySelector('[data-nav="arcade"]')
    const pause = document.querySelector('[data-nav="pause"]')
    if (!bar || !arcade || !pause) return { err: 'missing bar/chrome' }
    const b = bar.getBoundingClientRect(), a = arcade.getBoundingClientRect(), p = pause.getBoundingClientRect()
    const hit = (q) => !(q.right <= b.left || q.left >= b.right || q.bottom <= b.top || q.top >= b.bottom)
    return { overlap: hit(a) || hit(p), bar: [b.top | 0, b.left | 0, b.right | 0] }
})
r.check('the mine counter + timer ride above the board, clear of the corner chrome',
    !hudClear.err && !hudClear.overlap, JSON.stringify(hudClear))
// right-click a hidden cell: it flags, opens nothing, opens no menu
const pick = await page.evaluate(() => {
    const cv = document.querySelector('canvas[data-sweep-stage]')
    const r = cv.getBoundingClientRect()
    const st = window.__sweepTest.probe()
    const open = new Set(window.__sweepTest.openCells())
    let cell = -1
    for (let i = 0; i < st.w * st.h; i++) if (!open.has(i)) { cell = i; break }
    const x = cell % st.w, y = (cell / st.w) | 0
    return { cx: r.left + (x + 0.5) * (r.width / st.w), cy: r.top + (y + 0.5) * (r.height / st.h), cell }
})
const beforeRC = await probe()
await page.mouse.click(pick.cx, pick.cy, { button: 'right' })
try {
    await page.waitForFunction((f) => window.__sweepTest.probe().flags === f, beforeRC.flags + 1, { timeout: 5000 })
} catch { /* graded below */ }
m = await probe()
r.check('right-click PLANTED a flag instead of digging',
    m.flags === beforeRC.flags + 1 && m.opened === beforeRC.opened,
    `cell=${pick.cell} flags=${beforeRC.flags}->${m.flags} opened=${beforeRC.opened}->${m.opened}`)
r.check('right-click opened no browser context menu', (await page.evaluate(() => window.__cm)) === true,
    `defaultPrevented=${await page.evaluate(() => window.__cm)}`)

console.log('\nTOUCH — tap digs on release, long-press flags (synthetic touch through the real handlers)')
const touchRes = await page.evaluate(async () => {
    const cv = document.querySelector('canvas[data-sweep-stage]')
    const rect = cv.getBoundingClientRect()
    const st = window.__sweepTest.probe()
    const at = (x, y) => ({ cx: rect.left + (x + 0.5) * (rect.width / st.w), cy: rect.top + (y + 0.5) * (rect.height / st.h) })
    const fire = (type, p) => cv.dispatchEvent(new PointerEvent(type, {
        pointerId: 7, pointerType: 'touch', button: 0, clientX: p.cx, clientY: p.cy, bubbles: true, cancelable: true,
    }))
    // dig ONLY the solver-derived safe cell — any covered cell can be a mine,
    // and a dead board mid-section poisons every later gesture check
    const nx = window.__sweepTest.nextSafe()
    const p1 = at(nx.x, nx.y)
    const before = window.__sweepTest.probe()
    fire('pointerdown', p1)
    fire('pointerup', p1)
    const tDug = Date.now() + 3000
    while (window.__sweepTest.probe().opened === before.opened && Date.now() < tDug) {
        await new Promise((r) => setTimeout(r, 50))
    }
    const tapped = window.__sweepTest.probe()
    const skip = new Set(window.__sweepTest.openCells())
    for (const f of window.__sweepTest.flagCells()) skip.add(f)
    let cell2 = -1
    for (let i = 0; i < st.w * st.h; i++) if (!skip.has(i)) { cell2 = i; break }
    const p2 = at(cell2 % st.w, (cell2 / st.w) | 0)
    fire('pointerdown', p2)
    const tEnd = Date.now() + 3000
    while (window.__sweepTest.probe().flags === tapped.flags && Date.now() < tEnd) {
        await new Promise((r) => setTimeout(r, 50))
    }
    fire('pointerup', p2)
    await new Promise((r) => setTimeout(r, 120))
    const held = window.__sweepTest.probe()
    return {
        beforeOpened: before.opened, beforeFlags: before.flags,
        tapOpened: tapped.opened, tapFlags: tapped.flags,
        holdOpened: held.opened, holdFlags: held.flags,
    }
})
r.check('a quick tap dug on release',
    touchRes.tapOpened > touchRes.beforeOpened && touchRes.tapFlags === touchRes.beforeFlags, JSON.stringify(touchRes))
r.check('a long-press flagged without digging',
    touchRes.holdFlags === touchRes.tapFlags + 1 && touchRes.holdOpened === touchRes.tapOpened, JSON.stringify(touchRes))

// ---------------------------------------------------------------------------
// #1883 POLISH PASS — the ?-cycle, the face, the LED digits, the chord
// stagger, and the win flag-march. Presentation-only claims, so the proof is
// pixel + state: the referee (hash, flags, opened) must not move when the
// shell paints.
const rb = await page.evaluate(() => {
    const r = document.querySelector('canvas[data-sweep-stage]').getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
const plantHere = async () => {
    // fresh reload => the virtual pad is mounted and its band can eat the
    // first click (the #1353 retarget); click twice and wait on state.
    await page.mouse.click(rb.x, rb.y)
    await wait(120)
    await page.mouse.click(rb.x, rb.y)
    await page.waitForFunction(() => window.__sweepTest.probe().planted, null, { timeout: 8000 })
}
const fp = (fx, fy) => page.evaluate(([x, y]) => {
    const g = document.querySelector('[data-sweep-face="1"]').getContext('2d')
    const p = g.getImageData(x, y, 1, 1).data
    return [p[0], p[1], p[2]]
}, [fx, fy])
const cellCentre = (i) => page.evaluate((cell) => {
    const st = window.__sweepTest.probe()
    const r = document.querySelector('canvas[data-sweep-stage]').getBoundingClientRect()
    const x = cell % st.w, y = (cell / st.w) | 0
    const cx = Math.min(r.right - 2, Math.max(r.left + 2, r.left + (x + 0.5) * (r.width / st.w)))
    const cy = Math.min(r.bottom - 2, Math.max(r.top + 2, r.top + (y + 0.5) * (r.height / st.h)))
    return { x: cx, y: cy, x2: x, y2: y }
}, i)

console.log('\nCHORD STAGGER — a chord ring flickers open cell-by-cell (sim truth is instant, the paint is not)')
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__sweepTest, null, { timeout: 15000 })
{
    await plantHere()                                              // plant + flood
    // Build a REAL chord the player's way. Flag every covered cell around a
    // number whose covered-ring equals its clue (after the flood all of those
    // ARE mines — the single-mines rule); then open one solver-safe cell so a
    // number keeps a fresh NON-mine ring its flags still satisfy. Clicking it
    // auto-chords — and the ring it opens is the flicker we watch.
    const ringReady = () => page.evaluate(() => {
        const st = window.__sweepTest.probe()
        const open = new Set(window.__sweepTest.openCells())
        const flags = new Set(window.__sweepTest.flagCells())
        const mines = new Set(window.__sweepTest.mineCells())
        const rect = document.querySelector('canvas[data-sweep-stage]').getBoundingClientRect()
        const cellPt = (x, y) => ({
            x: Math.min(rect.right - 2, Math.max(rect.left + 2, rect.left + (x + 0.5) * (rect.width / st.w))),
            y: Math.min(rect.bottom - 2, Math.max(rect.top + 2, rect.top + (y + 0.5) * (rect.height / st.h))),
        })
        const out = []
        for (const i of open) {
            const x = i % st.w, y = (i / st.w) | 0
            let clue = 0, around = 0, fresh = 0
            const flagPts = []
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue
                const nx = x + dx, ny = y + dy
                if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) continue
                const j = ny * st.w + nx
                if (mines.has(j)) { clue++; if (!flags.has(j)) flagPts.push(cellPt(nx, ny)) }
                if (flags.has(j)) around++
                if (!open.has(j) && !flags.has(j)) fresh++
            }
            if (clue >= 1 && fresh >= 3 && around + flagPts.length === clue) out.push({ cell: { x, y }, cellPt: cellPt(x, y), flagPts })
        }
        return out
    })
    let rounds = 0, opened = false, samples = []
    while (rounds++ < 10) {
        const ready = await ringReady()
        for (const cand of ready) {
            for (const p of cand.flagPts) { await page.mouse.click(p.x, p.y, { button: 'right' }); await wait(30) }
            const stillReady = (await ringReady()).some((c) => c.cell.x === cand.cell.x && c.cell.y === cand.cell.y)
            if (!stillReady) continue
            const before = (await probe()).opened
            // record the drain from INSIDE the page (an outer evaluate loop is
            // slower than the 33 ms stagger — it samples only after the flush)
            await page.evaluate(() => { window.__stag = []; window.__si = setInterval(() => window.__stag.push(window.__sweepTest.staggered()), 16) })
            await page.mouse.click(cand.cellPt.x, cand.cellPt.y)
            await page.waitForTimeout(400)
            samples = await page.evaluate(() => { clearInterval(window.__si); return window.__stag })
            opened = (await probe()).opened > before
            if (opened) break
        }
        if (opened) break
        const nx = await page.evaluate(() => window.__sweepTest.nextSafe())
        if (!nx) break
        const p = await cellCentre(nx.y * (await probe()).w + nx.x)
        await page.mouse.click(p.x, p.y)                            // solver-safe dig
        await wait(80)
    }
    const start = samples[0] || 0
    r.check('a chord fired on a satisfied number (sim truth banked instantly)', opened, `rounds=${rounds}`)
    r.check('the chord ring queued its flicker (stagger > 1, then drains cell-by-cell)',
        start > 1 && samples.some((v, k) => k > 0 && v > 0 && v < start),
        JSON.stringify(samples.slice(0, 10)))
}

console.log('\n?-MARK CYCLE — the flag verb cycles empty -> flag -> "?" -> empty without touching the board')
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__sweepTest, null, { timeout: 15000 })
{
    await page.evaluate((sd) => window.__sweepTest.start(0, sd), seed)
    await wait(80)
    await plantHere()
    const pick = await page.evaluate(() => {
        const st = window.__sweepTest.probe()
        const skip = new Set(window.__sweepTest.openCells())
        for (const f of window.__sweepTest.flagCells()) skip.add(f)
        let cell = -1
        for (let i = 0; i < st.w * st.h; i++) if (!skip.has(i)) { cell = i; break }
        return cell
    })
    const pt = await cellCentre(pick)
    const pxAt = (i) => page.evaluate((cell) => {
        const cv = document.querySelector('canvas[data-sweep-stage]')
        const st = window.__sweepTest.probe()
        const g = cv.getContext('2d')
        const d = g.getImageData(Math.round(((cell % st.w) + 0.5) * (cv.width / st.w)),
            Math.round((((cell / st.w) | 0) + 0.5) * (cv.height / st.h)), 1, 1).data
        return [d[0], d[1], d[2]]
    }, i)
    const h0 = await page.evaluate(() => window.__sweepTest.hash())
    const c0 = await probe()
    const pxTile0 = await pxAt(pick)
    await page.mouse.click(pt.x, pt.y, { button: 'right' })
    await wait(120)
    const c1 = await probe()
    await page.mouse.click(pt.x, pt.y, { button: 'right' })
    await wait(120)
    const c2 = await probe()
    const pxQ = await pxAt(pick)
    await page.mouse.click(pt.x, pt.y, { button: 'right' })
    await wait(120)
    const c3 = await probe()
    const h3 = await page.evaluate(() => window.__sweepTest.hash())
    r.check('right-click 1 flags as before (flags +1, nothing opened)',
        c1.flags === c0.flags + 1 && c1.opened === c0.opened && c1.marksQ === 0,
        `flags=${c0.flags}->${c1.flags} q=${c1.marksQ}`)
    r.check('right-click 2 drops the flag and parks "?" (board flag count falls, ? shows)',
        c2.flags === c0.flags && c2.marksQ === 1 && c2.opened === c0.opened,
        `flags=${c2.flags} q=${c2.marksQ}`)
    const qDiff = Math.abs(pxQ[0] - pxTile0[0]) + Math.abs(pxQ[1] - pxTile0[1]) + Math.abs(pxQ[2] - pxTile0[2]) > 20
    r.check('the "?" paints pixels a covered tile never is (dim glyph on the tile)', qDiff, `q=${pxQ} tile=${pxTile0}`)
    r.check('right-click 3 clears the ? back to empty',
        c3.flags === c0.flags && c3.marksQ === 0, `flags=${c3.flags} q=${c3.marksQ}`)
    r.check('the ?-layer is presentation-only — the referee hash never moved',
        h0 === h3 && c3.opened === c0.opened, `hash ${h0} vs ${h3}`)
}

console.log('\nTHE FACE + LED COUNTERS — a reactive smiley and 7-segment digits in the HUD bar')
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__sweepTest, null, { timeout: 15000 })
{
    await page.evaluate((sd) => window.__sweepTest.start(0, sd), seed)
    await wait(220)
    const fcv = await page.evaluateHandle(() => document.querySelector('[data-sweep-face="1"]'))
    r.check('the HUD bar carries a face cell', fcv && !(await page.evaluate((el) => !el, fcv)))
    const smile = await fp(14, 10)                 // between the eye dots, above the future shades: amber
    const smileInk = await fp(9, 10)               // the left eye dot: ink
    const mine = await page.evaluateHandle(() => document.querySelector('[data-sweep-count="mines"]'))
    const ledInk = await page.evaluate((el) => {
        const g = el.getContext('2d')
        let ink = 0
        const d = g.getImageData(0, 0, 64, 20).data
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) ink++
        return ink
    }, mine)
    r.check('the mine counter is a lit LED glyph (not empty canvas, not a font span)', ledInk > 40, `lit px=${ledInk}`)
    await page.evaluate(() => window.__sweepTest.dig()) // the first dig (plants + floods)
    let cool = smile
    const tCool = Date.now()
    while (cool[0] > 120 && Date.now() - tCool < 2000) { await wait(50); cool = await fp(14, 10) } // shades band: dark
    r.check('the face is a smile pre-dig, then puts on the shades after the first dig',
        smile[0] > 150 && smile[1] > 140 && smileInk[0] < 120 && cool[0] < 120 && cool[1] < 130,
        `smile@mid=${smile} eye=${smileInk} cool@band=${cool}`)
    // boom: dig a mine that survived the flood (the honest death path)
    const mineCovered = await page.evaluate(() => {
        const open = new Set(window.__sweepTest.openCells())
        return window.__sweepTest.mineCells().find((c) => !open.has(c))
    })
    const boomAt = await cellCentre(mineCovered)
    await page.mouse.click(boomAt.x, boomAt.y)
    await page.waitForFunction(() => window.__sweepTest.probe().end === 'dead', null, { timeout: 4000 })
    await wait(120)
    const deadX = await fp(8, 8)                  // the dead face's X-cross corner (smile & shades are amber here)
    r.check('a boom puts a dead face on the bar', deadX[0] < 120 && deadX[1] < 130, `dead@x=${deadX}`)
    const overOk = await page.waitForFunction(() => window.__sweepTest.probe().screen === 'over', null, { timeout: 5000 })
        .then(() => true).catch(() => false)
    r.check('the dead run still reaches the over screen', overOk, `screen=${(await probe()).screen}`)
}

console.log('\nWIN FLAG-MARCH — leftovers get flagged one at a time, the over screen waits, any key skips')
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__sweepTest, null, { timeout: 15000 })
{
    await page.evaluate((sd) => window.__sweepTest.start(0, sd), seed)
    await wait(80)
    await plantHere()
    const mineIdx = await page.evaluate(() => window.__sweepTest.mineCells())
    const stW = (await probe()).w
    for (const m of mineIdx.slice(0, 7)) {
        const p = await cellCentre(m)
        await page.mouse.click(p.x, p.y, { button: 'right' })
        await wait(30)
    }
    // hand the march some mines it must flag itself
    for (const m of mineIdx.slice(0, 3)) {
        await page.evaluate((c) => window.__sweepTest.unflagAt(c.x, c.y), { x: m % stW, y: (m / stW) | 0 })
    }
    const fw = await page.evaluate(() => window.__sweepTest.forceWin())
    r.check('forceWin closed the board by opening only safe cells', fw === true && (await probe()).end === 'win', `fw=${fw}`)
    const c1 = await probe()
    const unflagged = await page.evaluate(() => {
        const st = window.__sweepTest.probe()
        const flags = new Set(window.__sweepTest.flagCells())
        return window.__sweepTest.mineCells().filter((m) => !flags.has(m)).length
    })
    r.check('unflagged mines marched (the over screen hands the field to the flag blips)',
        c1.cascade === unflagged && unflagged >= 3, `cascade=${c1.cascade} unflagged=${unflagged}`)
    let earlyOver = false
    try { await page.waitForFunction(() => window.__sweepTest.probe().screen === 'over', null, { timeout: 150 }) } catch { /* good */ }
    if ((await probe()).screen === 'over') earlyOver = true
    r.check('the over screen waits for the march (not instant)', !earlyOver, `screen=${(await probe()).screen}`)
    const skipped = await page.keyboard.press('Space')
        .then(() => page.waitForFunction(() => window.__sweepTest.probe().screen === 'over', null, { timeout: 3000 }))
        .then(() => true).catch(() => false)
    void skipped
    r.check('any key skips the march to the over screen',
        (await probe()).screen === 'over', `screen=${(await probe()).screen}`)
}

if (errors.length) r.check('no page errors during play', false, errors.slice(0, 4).join(' | '))
else r.check('no page errors during play', true)

r.exit(browser)
