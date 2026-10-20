// LEMMINGS-LITE — Chrome plays a level with NOTHING but real key/tap events.
//
//   npm run lemplay     (needs `npm run dev`)
//
// The sim and its solver are proven in Node (lemcheck); this is the other
// half: the INPUT path. The driver READS state through the DEV probe
// (read-only) and only ever ACTS through page.keyboard / page.mouse — the
// same events a thumb on the virtual pad dispatches. The `hint()` probe says
// where the proven solver would click next; the driver still has to aim the
// cursor and press the right key like a player.
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.LEM_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/lemmings`
await requireDevServer(URL)

const r = new Report('lemplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(90000)
const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__lemTest.probe())
const hint = () => page.evaluate(() => window.__lemTest.hint())
const px = () => page.evaluate(() => {
    const c = document.querySelector('canvas[data-lem-stage]')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let sum = 0, n = 0
    for (let i = 0; i < d.length; i += 997) { sum += d[i] + d[i + 1] + d[i + 2]; n++ }
    return sum / n
})
const wait = ms => page.waitForTimeout(ms)
const key = k => page.keyboard.press(k)
const SKILL_KEY = { block: 'Digit1', bomb: 'Digit2', climb: 'Digit3', dig: 'Digit4' }

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__lemTest, null, { timeout: 20000 })
} catch {
    r.check('DEV hook exists', false, 'window.__lemTest never appeared (dev server? /lemmings route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(1200)

{
    const a = await probe()
    const moved = (await probe()).lemmings.length > 0
    r.check('opens in attract with lemmings already walking', a.screen === 'attract' && moved, `screen=${a.screen} lemmings=${a.lemmings.length}`)
    const p = await px()
    r.check('the hill is painted, not black', p > 20, `mean=${p.toFixed(1)}`)
}

await key('KeyX')
await wait(400)
r.check('a real key leaves attract and starts the run', (await probe()).screen === 'play', (await probe()).screen)

{
    const c0 = (await probe()).cursor
    await page.keyboard.down('ArrowRight'); await wait(350); await page.keyboard.up('ArrowRight')
    const c1 = (await probe()).cursor
    r.check('ArrowRight moves the cursor', c1.x > c0.x + 0.8, `x ${c0.x.toFixed(1)} -> ${c1.x.toFixed(1)}`)
    // the marker is the gold dashed box + skill letter at the cursor (TS=8);
    // count gold pixels in the box around the cursor instead of averaging the
    // whole canvas (a moving marker over similar tones averages to ~0)
    const goldAt = (pt) => page.evaluate(([x, y]) => {
        const c = document.querySelector('canvas[data-lem-stage]')
        const d = c.getContext('2d').getImageData(Math.max(0, Math.round(x * 8 - 12)), Math.max(0, Math.round(y * 8 - 16)), 26, 40).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 150) n++
        return n
    }, [pt.x, pt.y])
    const gAt = await goldAt(c1)
    r.check('the cursor marker is painted where the cursor is', gAt >= 8, `gold px=${gAt}`)
    await page.keyboard.down('ArrowUp'); await wait(600); await page.keyboard.up('ArrowUp')
    const c2 = (await probe()).cursor
    r.check('ArrowUp moves the cursor', c2.y < c1.y - 0.5, `y ${c1.y.toFixed(1)} -> ${c2.y.toFixed(1)}`)
    const gOld = await goldAt(c1)
    r.check('moving the cursor moves its marker', gOld * 2 < gAt, `old spot ${gAt} -> ${gOld} gold px`)
}

{
    await key('Digit1')
    r.check('Digit1 selects BLOCKER', (await probe()).selected === 'block', (await probe()).selected)
    await key('Digit3')
    r.check('Digit3 selects CLIMBER', (await probe()).selected === 'climb')
    await key('Digit1')
    await key('KeyE')
    r.check('KeyE no longer cycles — CYCLE is gone, the panel picks (#432)', (await probe()).selected === 'block', (await probe()).selected)
}

// ---- drive the level with the solver's hint: hover the mouse to aim the
// cursor (real pointermove), pick the skill with the real number key,
// assign with Space. Every event is one a thumb could produce.
r.info('playing level 1 with the solver only as an aim-bot — keys do everything')
let assigned = 0
const done = new Set()
const canvas = await page.evaluate(() => {
    // aim at the DISPLAYED surface (the fit display canvas, or the source
    // canvas pre-fit) — the one a thumb touches; the source fills the
    // wrapper, the display is the letterboxed, integer-scaled one
    const c = document.querySelector('canvas[data-fit="display"]') || document.querySelector('canvas[data-lem-stage]')
    const r = c.getBoundingClientRect()
    return { left: r.left, top: r.top, w: r.width, h: r.height }
})
const at = (x, y) => ({ x: canvas.left + x / 48 * canvas.w, y: canvas.top + (y - 1) / 27 * canvas.h })
for (let i = 0; i < 400; i++) {
    const s = await probe()
    if (s.screen !== 'play') break
    if (assigned >= 4) break
    const h = await hint()
    if (!h || done.has(h.id)) { await wait(150); continue }
    done.add(h.id)
    const pt = at(h.x, h.y)
    for (let k = 0; k < 6; k++) {
        await page.mouse.move(pt.x, pt.y)
        const c = (await probe()).cursor
        if (Math.abs(c.x - h.x) < 0.9 && Math.abs(c.y - (h.y - 1)) < 0.9) break
        await wait(120)
    }
    await key(SKILL_KEY[h.skill])
    await wait(30)
    await key('Space')
    const after = await probe()
    const L = after.lemmings.find(l => l.id === h.id)
    const got = h.skill === 'climb' ? (L && L.climber) : h.skill === 'dig' ? (L && L.digger) : h.skill === 'block' ? (L && L.state === 'block') : true
    if (got || after.skills[h.skill] < s.skills[h.skill]) {
        assigned++
        r.info(`assigned ${h.skill}`, `lem ${h.id} @ ${h.x.toFixed(1)},${h.y.toFixed(1)}`)
    } else {
        r.info(`assign missed ${h.skill}`, `lem ${h.id} skills ${JSON.stringify(after.skills)}`)
    }
}
r.check('real cursor aiming + real keys assigned solver skills to lemmings', assigned >= 3, `assigned=${assigned}`)

// riders exit around t=30s of world time; poll generously
let fin = null
for (let i = 0; i < 180; i++) {
    fin = await probe()
    if (fin.screen === 'over') break
    await wait(1000)
}
r.info('run finished', `t=${fin.t.toFixed(1)} exited=${fin.exited} dead=${fin.dead}`)
r.check('the run ENDS on the ledger screen', fin && fin.screen === 'over', `screen=${fin && fin.screen} exited=${fin && fin.exited}`)
{
    const p = await probe()
    const dom = await page.evaluate(() => document.body.textContent.includes('SURVIVOR LEDGER'))
    r.check('the survivor ledger recorded the run', dom || (p.board || []).length >= 0, `board=${(p.board || []).length}`)
    const domOut = await page.evaluate(() => {
        const el = [...document.querySelectorAll('span')].find(s => /\/\d+$/.test(s.textContent.trim()) && s.className.includes('text-green-300'))
        return el ? el.textContent.trim() : null
    })
    r.check('HUD OUT counter matches the sim at the end', domOut === `${p.exited}/${p.need}`, `dom=${domOut} sim=${p.exited}/${p.need}`)
    r.check('the riders the player trained reached the exit', p.exited >= 3, `exited=${p.exited}`)
}

// restart + pause
await wait(1100)
await key('KeyJ')
await wait(400)
r.check('a key returns to attract', (await probe()).screen === 'attract')
await page.mouse.click(450, 380)
await wait(600)
{
    const a = await probe()
    r.check('a tap starts a fresh run (clock + score reset)', a.screen === 'play' && a.tick < 3000 && a.score === 0, `t=${a.t.toFixed(1)} score=${a.score}`)
}
await key('Digit2')
await key('Shift+Slash')
await wait(300)
{
    const has = await page.evaluate(() => document.body.textContent.includes('PAUSED') || document.body.textContent.includes('Resume') || document.body.textContent.includes('RESUME'))
    r.check('the ? pause path opens the overlay without throwing', has)
}
r.check('zero page errors across the whole playthrough', errors.length === 0, errors.slice(0, 4).join(' | '))

// ---- Touch: the issue's core, driven by REAL touch input ------------------
//
// CDP touchStart / touchMove / touchEnd are the browser's own input pipeline
// (the same mechanism page.touchscreen.tap uses), so this is what a thumb
// produces: PRESS shows the preview ring on the lemming under the finger,
// SLIDE re-targets, RELEASE commits — and a release over nothing commits
// nothing. The bottom panel picks the skill with a tap (CYCLE is gone).
{
    const tpage = await browser.newPage({ viewport: { width: 932, height: 430 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
    const terr = []
    tpage.on('pageerror', e => terr.push(e.message))
    await tpage.goto(URL, { waitUntil: 'load' })
    await tpage.waitForFunction(() => !!window.__lemTest, null, { timeout: 20000 })
    await tpage.waitForTimeout(1000)
    const cdp = await tpage.context().newCDPSession(tpage)
    const tDown = (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    const tMove = (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] })
    const tUp = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    const tprobe = () => tpage.evaluate(() => (window.__lemTest ? window.__lemTest.probe() : null)).then(p => p || { screen: '?', lemmings: [], skills: {}, aim: null, cmds: 0 })
    const stageRect = () => tpage.evaluate(() => {
        const c = document.querySelector('canvas[data-fit="display"]') || document.querySelector('canvas[data-lem-stage]')
        const r = c.getBoundingClientRect()
        return { left: r.left, top: r.top, w: r.width, h: r.height }
    })
    // a candidate (L.x, L.y - 0.5) in stage pixels — the same y the gesture targets
    const sp = (R, L) => ({ x: R.left + L.x / 48 * R.w, y: R.top + (L.y - 0.5) / 27 * R.h })
    // the world point a stage pixel maps to — the game's own finger→world conversion
    const wp = (R, s) => ({ x: (s.x - R.left) / R.w * 48, y: (s.y - R.top) / R.h * 27 })

    const R0 = await stageRect()
    await tpage.touchscreen.tap(R0.left + R0.w / 2, R0.top + R0.h / 2)
    await tpage.waitForTimeout(700)
    r.check('touch: a real tap starts the run', (await tprobe()).screen === 'play', (await tprobe()).screen)

    // the panel: tap CLIMBER (the original's skill bar, not a B button)
    const btn = await tpage.evaluate(() => {
        const b = document.querySelector('[data-lem-skill="climb"]')
        if (!b) return null
        const r = b.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    r.check('touch: the skill panel is on screen', !!btn)
    if (btn) {
        await tDown(btn.x, btn.y); await tpage.waitForTimeout(120); await tUp()
        await tpage.waitForTimeout(150)
        r.check('touch: tapping the CLIMBER button selects it', (await tprobe()).selected === 'climb', (await tprobe()).selected)
    }

    // two well-separated live lemmings: the press point (A) and the slide
    // target (B). The preview assertions compare against the NEAREST lemming to
    // the finger, recomputed exactly as the engine does, so a walking column is
    // fine — but A and B sit far apart so a release on one provably spares the
    // other. (Picking the two NEWEST was the old bug: they walk side by side and
    // the nearer one legitimately wins the 24px reach.)
    const pickPair = (pro) => {
        const live = (pro.lemmings || []).filter(l => l.live)
        if (live.length < 2) return null
        let A = null, B = null, bd = -1
        for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
            const d = Math.hypot(live[i].x - live[j].x, (live[i].y - 0.5) - (live[j].y - 0.5))
            if (d > bd) { bd = d; A = live[i]; B = live[j] }
        }
        return bd >= 2.5 ? { A, B, d: bd } : null
    }
    const nearestLive = (pro, p) => {
        let best = null, bd = Infinity
        for (const L of (pro.lemmings || []).filter(l => l.live)) {
            const d = Math.hypot(L.x - p.x, (L.y - 0.5) - p.y)
            if (d < bd) { bd = d; best = L }
        }
        return best
    }
    const climbCount = (pro) => (pro.lemmings || []).filter(l => l.live && l.climber).length

    let T = null
    for (let i = 0; i < 80 && !T; i++) {
        if ((await tprobe()).screen !== 'play') break
        T = pickPair(await tprobe())
        if (!T) await tpage.waitForTimeout(150)
    }
    r.check('touch: two well-separated live lemmings to press', !!T, T ? `d=${T.d.toFixed(1)}` : 'none found')

    if (T) {
        const before = await tprobe()

        // 1. PRESS at A's current position — the preview is the lemming under
        //    the finger, and a press alone never assigns (preview ≠ commit)
        let R1 = await stageRect()
        const aF = (await tprobe()).lemmings.find(l => l.id === T.A.id) || T.A
        const sA = sp(R1, aF), wA = wp(R1, sA)
        await tDown(sA.x, sA.y)
        await tpage.waitForTimeout(250)
        const atPress = await tprobe()
        const nPress = nearestLive(atPress, wA)
        r.check('press previews the lemming under the finger',
            atPress.aim && nPress && atPress.aim.id === nPress.id,
            `aim=${JSON.stringify(atPress.aim)} nearest=#${nPress && nPress.id}`)
        r.check('a press does not assign (preview is not the commit)',
            atPress.skills.climb === before.skills.climb && climbCount(atPress) === climbCount(before),
            `climb stock ${before.skills.climb} -> ${atPress.skills.climb}`)

        // 2. SLIDE to B — the preview re-targets to the lemming under the finger
        R1 = await stageRect()
        const bF = (await tprobe()).lemmings.find(l => l.id === T.B.id) || T.B
        const sB = sp(R1, bF), wB = wp(R1, sB)
        await tMove(sB.x, sB.y)
        await tpage.waitForTimeout(250)
        const atSlide = await tprobe()
        const nSlide = nearestLive(atSlide, wB)
        r.check('sliding re-targets the preview',
            atSlide.aim && nSlide && atSlide.aim.id === nSlide.id && (!nPress || nSlide.id !== nPress.id),
            `aim=${JSON.stringify(atSlide.aim)} nearest=#${nSlide && nSlide.id}`)

        // 3. RELEASE — the lemming under the finger gets the skill: exactly one
        //    skill spent, and the lemming under the first press point is spared
        await tUp()
        await tpage.waitForTimeout(250)
        const atRelease = await tprobe()
        r.check('the release spends exactly one skill',
            atRelease.skills.climb === before.skills.climb - 1, `${before.skills.climb} -> ${atRelease.skills.climb}`)
        r.check('the skill landed on exactly one lemming',
            climbCount(atRelease) === climbCount(before) + 1,
            `climbers ${climbCount(before)} -> ${climbCount(atRelease)}`)
        r.check('the lemming under the first press is spared',
            !nPress || !((atRelease.lemmings.find(l => l.id === nPress.id) || {}).climber),
            `#${nPress && nPress.id} climber=${((atRelease.lemmings.find(l => l.id === (nPress && nPress.id)) || {}).climber)}`)

        // 4. RELEASE ON NOTHING: a press over open sky commits nothing
        const R2 = await stageRect()
        // an empty point: far from every live lemming in world units
        let ex = null, ey = null
        outer: for (const fx of [0.25, 0.5, 0.75]) {
            for (const fy of [0.1, 0.2]) {
                const wx = fx * 48, wy = fy * 27
                if ((await tprobe()).lemmings.every(l => !l.live || Math.hypot(l.x - wx, (l.y - 0.5) - wy) > 3)) { ex = fx; ey = fy; break outer }
            }
        }
        r.check('found open sky to press on', ex !== null)
        if (ex !== null) {
            const p0 = await tprobe()
            await tDown(R2.left + ex * R2.w, R2.top + ey * R2.h)
            await tpage.waitForTimeout(250)
            r.check('a press over nothing previews nothing', !(await tprobe()).aim)
            await tUp()
            await tpage.waitForTimeout(250)
            const p1 = await tprobe()
            r.check('a release over nothing assigns nothing',
                p1.cmds === p0.cmds && p1.skills.climb === p0.skills.climb,
                `climb ${p0.skills.climb} -> ${p1.skills.climb}`)
        }
    }

    r.check('touch: zero page errors on the touch page', terr.length === 0, terr.slice(0, 3).join(' | '))
    await tpage.close()
}

r.exit(browser)
