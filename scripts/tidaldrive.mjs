// drive tidal-rush end to end in headless Chrome: real key/tap events for
// start, steer, pause, bay-pick and restart; the contract drives the long
// race forward fast. Proves boot, live front in browser state, HUD ≡ state,
// pixels alive, over → restart. Advisory lane tool (#3104 rung 3).
import { openGame, launch } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const browser = await launch()
const out = []
const ok = (n, c, x = '') => { out.push(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
try {
    const page = await openGame(browser, { url: `${BASE}/tidal-rush?lite=1`, hook: '__tidalTest' })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForFunction('window.__game', { timeout: 20000 })
    ok('boots clean', errors.length === 0, errors.join(';'))

    const a1 = await page.evaluate(() => window.__tidalTest.probe())
    await wait(1200)
    const a2 = await page.evaluate(() => window.__tidalTest.probe())
    ok('attract auto-drives', a2.tick > a1.tick + 30, `${a1.tick}→${a2.tick}`)

    // real key: ◀ ▶ picks the bay on the menu
    await page.keyboard.press('ArrowRight')
    await wait(300)
    const bayStorm = await page.evaluate(() => window.__tidalTest.probe().stage)
    ok('menu ◀ ▶ picks STORM BAY (real key)', bayStorm === 'storm', `stage=${bayStorm}`)

    // real tap: start the race
    await page.mouse.click(320, 240)
    await wait(400)
    const started = await page.evaluate(() => window.__tidalTest.probe())
    ok('tap starts the race', started.screen === 'play', `screen=${started.screen}`)

    // real key: throttle up
    await page.keyboard.down('ArrowUp')
    await wait(2500)
    const fast = await page.evaluate(() => window.__tidalTest.probe())
    await page.keyboard.up('ArrowUp')
    ok('throttle builds speed', fast.speed > 8, `speed=${fast.speed}m/s`)

    // HUD matches state (drawn ≡ logical): km/h text
    const hud = await page.evaluate(() => {
        const el = [...document.querySelectorAll('div')].find((d) => d.className.includes('text-2xl') && d.textContent.includes('km/h'))
        return el ? el.textContent : ''
    })
    ok('HUD speed matches sim state', Math.abs(parseInt(hud, 10) - Math.round(fast.speed * 3.6)) <= 2, `hud="${hud.trim()}" state=${Math.round(fast.speed * 3.6)}`)

    // #3276 real keys: the two pitch verbs, driven by evidence the sim itself
    // reports — HANDSTAND first (gas stays on the whole time: press brake
    // airborne, watch hsPaid tick to ≥1 mid-air), FLIP second (brake ALONE
    // airborne: watch positive pitch wind ≥5 rad, then bank ≥300 on landing).
    // Natural kickers vary by seed, so the leg retries up to 4 seeds; keys are
    // always released in the finally, never stuck into the racing lines.
    {
        const popNow = () => page.evaluate(() => {
            const el = [...document.querySelectorAll('div')].find((d) => d.className.includes('text-xl') && d.className.includes('font-black') && d.className.includes('text-cyan-200'))
            return el && parseFloat(getComputedStyle(el).opacity) > 0.5 ? el.textContent : ''
        })
        const flipOk = { done: false, det: '' }
        const handOk = { done: false, det: '' }
        try {
            for (let seed = 5; seed < 9 && !(flipOk.done && handOk.done); seed++) {
                await page.evaluate((sd) => window.__game.reset(sd), seed >>> 0)
                await wait(4200) // countdown out
                const base = (await page.evaluate(() => window.__tidalTest.probe())).score
                let last = base, hsSeen = 0, arm = false
                const dl = Date.now() + 50000
                await page.keyboard.down('ArrowUp')
                while (Date.now() < dl && !(flipOk.done && handOk.done)) {
                    const s = await page.evaluate(() => window.__tidalTest.probe())
                    if (s.airborne) {
                        // handstand phase rides the gas; flip phase lifts it (brake ALONE)
                        if (handOk.done) await page.keyboard.up('ArrowUp')
                        else await page.keyboard.down('ArrowUp')
                        await page.keyboard.down('ArrowDown')
                        if (!handOk.done) { if (s.hsPaid >= 1) { hsSeen = s.hsPaid; handOk.det = `seed=${seed} hs=${hsSeen} pop="${await popNow()}"` } }
                        else if (s.flip >= 5.0) arm = true
                        continue
                    }
                    await page.keyboard.down('ArrowUp'); await page.keyboard.up('ArrowDown')
                    if (!handOk.done && hsSeen >= 1) handOk.done = true
                    else if (handOk.done && !flipOk.done && arm && s.score - last >= 300) flipOk.done = true
                    arm = false
                    last = s.score
                }
            }
        } finally {
            await page.keyboard.up('ArrowDown').catch(() => {})
            await page.keyboard.up('ArrowUp').catch(() => {})
        }
        ok('HANDSTAND pays on real keys (gas+brake airborne ≥0.5 s inverted)', handOk.done, handOk.det)
        ok('BACK FLIP completes on real keys (brake alone, +300 banked)', flipOk.done, flipOk.det)
    }

    // real key: pause freezes sim, resume unfreezes
    await page.keyboard.press('Slash')
    await wait(250)
    const p1 = await page.evaluate(() => window.__tidalTest.probe().tick)
    await wait(600)
    const p2 = await page.evaluate(() => window.__tidalTest.probe().tick)
    await page.keyboard.press('Slash')
    await wait(600)
    const p3 = await page.evaluate(() => window.__tidalTest.probe().tick)
    ok('? pauses and resumes the sim', p2 === p1 && p3 > p2, `${p1}/${p2}/${p3}`)

    // contract drive: steer through gates to the squall and past the finish
    const drive = await page.evaluate(async () => {
        window.__game.reset(7)
        let frontSeen = 0, frontMax = 0
        for (let i = 0; i < 150; i++) {
            const s = window.__tidalTest.autoDrive(60)
            if (s.frontPct > 0 && s.frontPct < 100) { frontSeen = 1; frontMax = Math.max(frontMax, s.frontPct) }
            if (s.done) break
        }
        return { end: window.__tidalTest.probe(), frontSeen, frontMax }
    })
    ok('front goes live in the browser mid-race', drive.frontSeen === 1 && drive.frontMax > 5, `max=${drive.frontMax}%`)
    ok('the race can be WON from the browser', drive.end.done === true, `rank=${drive.end.rank} score=${drive.end.score} t=${drive.end.t}`)
    ok('rival pack races too (all finish)', drive.end.rank >= 1 && drive.end.rank <= 3)

    // pixels: renderer alive, sea reads blue
    const px = await page.evaluate(async () => {
        const url = window.__game.frame()
        const img = new Image()
        img.src = url
        await img.decode()
        const c = document.createElement('canvas')
        c.width = 64; c.height = 40
        const x = c.getContext('2d')
        x.drawImage(img, 0, 0, 64, 40)
        const d = x.getImageData(0, 0, 64, 24).data
        let s = 0, b = 0, r = 0
        for (let i = 0; i < d.length; i += 4) { s += d[i] + d[i + 1] + d[i + 2]; b += d[i + 2]; r += d[i] }
        return { lum: s / (d.length / 4), blue: b / (d.length / 4), red: r / (d.length / 4) }
    })
    ok('scene renders (not black)', px.lum > 40, `mean lum=${px.lum.toFixed(1)}`)
    ok('sea reads blue', px.blue > px.red, `b=${px.blue.toFixed(1)} r=${px.red.toFixed(1)}`)

    // real key: over → press any key restarts
    const over = await page.evaluate(() => window.__tidalTest.probe().screen)
    await page.keyboard.press('Space')
    await wait(500)
    const restarted = await page.evaluate(() => window.__tidalTest.probe())
    ok('over → any key restarts', over === 'over' && restarted.screen === 'play', `over=${over} now=${restarted.screen}`)
    ok('zero page errors end-to-end', errors.length === 0, errors.join(';'))

    // #3365 phone chrome clearance — the centre bay/gate banner must stay on
    // one line and keep an 8px gap from every shared chrome pill (ARCADE /
    // FEEDBACK stack, PAUSE) at 390px. The old left-1/2 column was capped at
    // half-viewport wide: it wrapped and touched the FEEDBACK pill at 0px.
    {
        const p2 = await openGame(browser, { url: `${BASE}/tidal-rush?lite=1`, hook: '__tidalTest', viewport: { width: 390, height: 844 } })
        await p2.waitForFunction('window.__game', { timeout: 20000 })
        await p2.keyboard.press('Enter')
        await wait(4800)
        const clear = await p2.evaluate(() => {
            const rc = (el) => el.getBoundingClientRect()
            const pills = [...document.querySelectorAll('button,div')]
                .filter((d) => /^(ARCADE|FEEDBACK|PAUSE)$/.test(d.textContent.trim()))
                .map((d) => ({ r: rc(d), t: d.textContent.trim() }))
            const hud = [...document.querySelectorAll('div')]
            const find = (re) => hud.filter((d) => re.test(d.textContent) && d.children.length <= 3 && d.textContent.trim().length < 60)
                .sort((a, b) => { const A = rc(a), B = rc(b); return A.width * A.height - B.width * B.height })[0]
            const boxes = [find(/RED RIGHT|YELLOW LEFT/), find(/^SUNNY BAY$|^STORM BAY ·/)].filter(Boolean)
            let gap = 1e9, worst = ''
            for (const b of boxes) for (const q of pills) {
                const r = rc(b)
                const gx = Math.min(r.right, q.r.right) - Math.max(r.left, q.r.left)
                const gy = Math.min(r.bottom, q.r.bottom) - Math.max(r.top, q.r.top)
                const g = Math.hypot(Math.max(0, -gx), Math.max(0, -gy))
                if (g < gap) { gap = g; worst = `"${b.textContent.trim().slice(0, 20)}"↔"${q.t}"` }
            }
            const banner = find(/RED RIGHT|YELLOW LEFT/)
            return { gap: Math.round(gap), worst, bannerH: banner ? Math.round(rc(banner).height) : 0, nPills: pills.length, nBoxes: boxes.length }
        })
        // vacuity guards first: an audit that saw no pills or no HUD proves nothing
        ok('390px page shows chrome + HUD (#3365)', clear.nPills >= 3 && clear.nBoxes >= 2, `pills=${clear.nPills} boxes=${clear.nBoxes}`)
        ok('phone HUD keeps 8px clear of chrome pills (#3365)', clear.gap >= 8, `gap=${clear.gap}px ${clear.worst}`)
        ok('gate hint stays one line at 390px (#3365)', clear.bannerH > 0 && clear.bannerH < 36, `h=${clear.bannerH}`)
        await p2.close()
    }

    // #3389 score-column chrome clearance — the two side HUD columns compose the
    // safe-area vars exactly like the shared pills do. Measured at inset 0 (must be
    // unchanged from the old pixels) and with a simulated notch (--sat 59px, the
    // standalone-PWA case where ARCADE/FEEDBACK/PAUSE used to land ON the score):
    // the columns must ride down WITH the pills — no overlap, ≥8px gap preserved,
    // and both columns' top must actually MOVE with the inset (composition proven,
    // not luck of distance).
    {
        const p3 = await openGame(browser, { url: `${BASE}/tidal-rush?lite=1`, hook: '__tidalTest', viewport: { width: 640, height: 426 } })
        await p3.waitForFunction('window.__game', { timeout: 20000 })
        await p3.keyboard.press('Enter')
        await wait(4800)
        const meas = async () => p3.evaluate(() => {
            const rc = (el) => el.getBoundingClientRect()
            const pills = [...document.querySelectorAll('button')].filter((d) => /^(ARCADE|FEEDBACK|PAUSE|PADS)$/.test(d.textContent.trim()))
            const cols = [...document.querySelectorAll('div')].filter((d) => { const st = d.getAttribute('style') || ''; return st.indexOf('var(--sat, 0px)') >= 0 && st.indexOf('calc(') >= 0 && st.indexOf('top:') >= 0 })
            let gap = 1e9, worst = ''
            const tops = []
            for (const c of cols) {
                const r = rc(c); tops.push(Math.round(r.top))
                for (const q of pills) {
                    const qr = rc(q)
                    const gx = Math.min(r.right, qr.right) - Math.max(r.left, qr.left)
                    const gy = Math.min(r.bottom, qr.bottom) - Math.max(r.top, qr.top)
                    const g = Math.hypot(Math.max(0, -gx), Math.max(0, -gy))
                    if (g < gap) { gap = g; worst = `"${c.textContent.trim().slice(0, 16)}"↔"${q.textContent.trim()}"` }
                }
            }
            return { gap: Math.round(gap), worst, tops: tops.join('/'), nPills: pills.length, nCols: cols.length }
        })
        const sat0 = await meas()
        ok('#3389 page shows chrome pills + both HUD columns (vacuity)', sat0.nPills >= 3 && sat0.nCols === 2, `pills=${sat0.nPills} cols=${sat0.nCols}`)
        ok('#3389 columns clear of pills at inset 0', sat0.gap >= 8, `gap=${sat0.gap}px ${sat0.worst}`)
        await p3.evaluate(() => { const s = document.documentElement.style; s.setProperty('--sat', '59px'); s.setProperty('--sal', '47px'); s.setProperty('--sar', '47px') })
        await wait(350)
        const notch = await meas()
        ok('#3389 columns still clear at notch inset (sat 59)', notch.gap >= 8, `gap=${notch.gap}px ${notch.worst}`)
        const moved = notch.tops.split('/').map(Number)
        const before = sat0.tops.split('/').map(Number)
        ok('#3389 both columns ride DOWN with the inset (≥55px)', moved.length === 2 && before.length === 2 && moved.every((t, i) => t - before[i] >= 55 && t - before[i] <= 61), `sat0=${sat0.tops} notch=${notch.tops}`)
        await p3.close()
    }

    if (process.env.SHOTS) {
        await page.evaluate(() => window.__tidalTest.setMode('attract'))
        await wait(700)
        await page.screenshot({ path: 'shots/tidal-r3-attract.png' })
    }
    console.log(out.join('\n'))
    console.log(out.every((l) => l.startsWith('PASS')) ? 'DRIVE GREEN' : 'DRIVE RED')
    process.exitCode = out.every((l) => l.startsWith('PASS')) ? 0 : 1
} finally {
    await browser.close()
}
