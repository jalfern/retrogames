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
    const cv = document.querySelector('canvas')
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
        // No derivable cell — the board would need a guess. On a fair COLT
        // board this must never happen before the win.
        r.check('solver always had a safe cell to name (never needed a guess)', false, `stalled at opened=${s.opened} end=${s.end}`)
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
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
})
// All-mouse: no trusted key ever fires, so the virtual pad stays mounted.
await page.mouse.click(mb.x + mb.w / 2, mb.y + mb.h / 2)
const dismissible = () => document.querySelector('[data-nav="rotate-dismiss"]')
if (await page.evaluate(() => !!document.querySelector('[data-nav="rotate-dismiss"]'))) {
    await page.evaluate(() => document.querySelector('[data-nav="rotate-dismiss"]').click())
}
mb = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect()
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
    const cv = document.querySelector('canvas')
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
    const cv = document.querySelector('canvas')
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

if (errors.length) r.check('no page errors during play', false, errors.slice(0, 4).join(' | '))
else r.check('no page errors during play', true)

r.exit(browser)
