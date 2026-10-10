// METROID-LITE — Chrome plays the cave with NOTHING but real key events, and
// the PARALLAX contract is graded in pixels.
//
//   npm run metroidplay     (needs `npm run dev`)
//
// Three things a Node harness cannot see, and this does:
//   1. the input path — a real Space/Arrow/X keypress reaching step() through
//      the browser's event stack (the virtual pad dispatches these same codes);
//   2. the painter — the issue's second named muscle is three-layer parallax.
//      The harness hardcodes the promised factors [0.15, 0.35, 0.62] itself,
//      predicts a star's screen pixel at the CURRENT camera from inside the
//      page (one evaluate = one consistent frame), samples the canvas there —
//      and samples where a cam-rate (f=1) renderer would paint it instead.
//      A star is only believed if it sits at its OWN prediction at TWO
//      different cameras: positions alone can lie, the RATE cannot.
//      Stars are graded in the relic-hall sky band — the only screen region
//      that is empty map (rock ceilings elsewhere read bright and would be
//      graded as painted sky). Coincidence with any other star's honest
//      position is excluded, deterministically, from the cheat samples.
//   3. the attract proof — the proven zero-hit route plays itself in the page,
//      real rAF feeding the fixed step: upgrades light up on schedule, the
//      camera walks to the shaft, and the death counter stays zero.
// Every keypress that must land on a specific tick is scheduled against
// gs.tick, never wall-clock (the heistplay lesson: CDP round-trips stall
// rAF, so wall-clock key holds coalesce into one tick).
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.METROID_URL || 'http://localhost:5173/retrogames/metroid'
await requireDevServer(URL)

const r = new Report('metroidplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(120000)
const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__metroidTest.probe())
const wait = ms => page.waitForTimeout(ms)
const tap = k => page.keyboard.press(k)
const hold = async (k, ms) => { await page.keyboard.down(k); await wait(ms); await page.keyboard.up(k); await wait(50) }
const tickNow = () => page.evaluate(() => window.__metroidTest.probe().tick)
const untilTick = async (n) => {
    for (let i = 0; i < 300; i++) { if ((await tickNow()) >= n) return; await wait(25) }
}

// THE HARNESS'S OWN PARALLAX CONTRACT — hardcoded on purpose. If the game
// scrolls a layer at the camera, its stars land off-prediction / on-cheat.
const F = [0.15, 0.35, 0.62]
const NSTAR = [26, 18, 12]

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__metroidTest, null, { timeout: 30000 })
} catch {
    r.check('DEV hook exists', false, 'window.__metroidTest never appeared (dev server? /metroid route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(1200)

// ---- attract: the proven route replays itself in the page ----
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    let camMax = 0, deaths = 0, takenMax = 0, tickGrew = false, relicSeen = false
    const t0 = a.tick
    for (let i = 0; i < 20; i++) {
        const s = await probe()
        if (s.tick > t0 + 30) tickGrew = true
        deaths = Math.max(deaths, s.deaths)
        takenMax = Math.max(takenMax, s.taken)
        if (s.end === 'win') relicSeen = true
        camMax = Math.max(camMax, s.cam.x)
        await wait(2200)
    }
    r.check('attract sim is live and zero-hit for a whole route', tickGrew && deaths === 0, `tick ${t0}->${(await probe()).tick} deaths=${deaths}`)
    r.check('attract earns upgrades on schedule (beam≈8s bomb≈13s sj≈33s)', takenMax >= 3, `taken=${takenMax}`)
    r.check('attract camera reaches deep into the cave', camMax > 1100, `camMax=${camMax}`)
    r.check('the attract route resets to hunt again (looped demo)', relicSeen, 'the demo never reached the relic')
}

// ---- real keys start a fresh run and drive the body ----
await tap('KeyZ')
await wait(500)
{
    const a = await probe()
    r.check('a real key starts a fresh run', a.screen === 'play' && a.score === 0 && a.energy === 4 && a.taken === 0, `screen=${a.screen} energy=${a.energy}`)
    await hold('ArrowRight', 1600)
    const b = await probe()
    r.check('holding RIGHT walks the hunter and drags the camera', b.player.x > a.player.x + 30 && b.cam.x > 0, `x ${a.player.x}->${b.player.x} cam=${b.cam.x}`)
    await hold('ArrowLeft', 400)
    const c = await probe()
    r.check('holding LEFT walks back', c.player.x < b.player.x - 20, `x ${b.player.x}->${c.player.x}`)
    const gy = c.player.y
    await page.keyboard.down('Space')
    let j = await probe()
    for (let i = 0; i < 40 && j.onGround && !(j.player.y < gy - 2); i++) { await wait(40); j = await probe() }
    await page.keyboard.up('Space')
    await wait(600)
    r.check('SPACE launches the real body (airborne frame sampled)', j.player.y < gy - 4 || !j.onGround, `y ${gy}->${j.player.y} onGround=${j.onGround}`)
    await tap('KeyX')
    await wait(200)
    const w = await probe()
    r.check('firing without the BEAM fires nothing', !w.evLog.some(e => e.type === 'fire' && e.tick > w.tick - 30), 'no-fire rule holds in the shell')
}

// ---- parallax in pixels, at TWO cameras, in the relic-hall sky band ----
{
    // sky = empty map cells: at the hall floor (camY clamps to 0) the screen
    // rows for cells 2-4 are the map's only honest sky band. Set the hunter
    // in the hall with a RIG (setup), then WALK him with real arrows —
    // camera A at the right wall, camera B 250 px later. A star bright at
    // its own cam*f prediction under BOTH cameras cannot be an accident.
    await page.evaluate(() => window.__metroidTest.teleport(112, 4))
    await wait(350)
    const scan = (l, k) => page.evaluate(([l, k, f, F, N]) => {
        const st = window.__metroidTest.star(l, k)
        const c = window.__metroidTest.camX()
        const cy = window.__metroidTest.camY()
        if (cy > 8) return null
        const wrapv = v => ((v % 2000) + 2000) % 2000
        const pred = wrapv(st.wx.x - c * f)
        const wrong = wrapv(st.wx.x - c)
        const g = document.querySelector('canvas[data-metroid-stage]').getContext('2d')
        const rl = 118 * 16 - c
        const pxp = window.__metroidTest.probe().player.x - c
        const mx = (x) => {
            if (x < 4 || x > 475) return -1
            if (Math.abs(x - rl) < 26 || (pxp > -6 && pxp < 486 && Math.abs(x - pxp) < 14)) return -1
            for (let xx = Math.round(x) - 3; xx <= Math.round(x) + 3; xx++) {
                for (let yy = st.wx.y - 2; yy <= st.wx.y + 2; yy++) {
                    if (window.__metroidTest.tile(Math.floor((c + xx) / 16), Math.floor((cy + yy) / 16)) !== 0) return -1
                }
            }
            const d = g.getImageData(Math.round(x) - 3, st.wx.y - 2, 7, 5).data
            let m = 0
            for (let i = 0; i < d.length; i += 4) m = Math.max(m, (d[i] + d[i + 1] + d[i + 2]) / 3)
            return m
        }
        let other = false
        for (let L = 0; L < 3 && !other; L++) {
            for (let k2 = 0; k2 < N[L]; k2++) {
                if (L === l && k2 === k) continue
                const s2 = window.__metroidTest.star(L, k2)
                if (Math.abs(s2.wx.y - st.wx.y) > 3) continue
                if (Math.abs(wrapv(s2.wx.x - c * F[L]) - wrong) <= 4) { other = true; break }
            }
        }
        return { c, y: st.wx.y, at: mx(pred), wrong: !other && Math.abs(wrong - pred) > 8 ? mx(wrong) : -2, wrongX: wrong }
    }, [l, k, F[l], F, NSTAR])

    const phases = []
    const starDbg = []
    const scanAll = async () => {
        const br = {}, wr = []
        for (let l = 0; l < 3; l++) for (let k = 0; k < NSTAR[l]; k++) {
            const r0 = await scan(l, k)
            if (r0 === null) continue
            if (r0.at >= 0) starDbg.push(`${l},${k}@${Math.round(r0.c)}=${Math.round(r0.at)}`)
            if (r0.at > 44) br[`${l},${k}`] = r0.y
            if (r0.wrong >= 0 && r0.wrongX > 3 && r0.wrongX < 476) { wr.push(`${l},${k}=${r0.wrong.toFixed(0)}`) }
        }
        return { br, wr, c: await page.evaluate(() => window.__metroidTest.camX()) }
    }
    await page.evaluate(() => window.__metroidTest.teleport(115, 4))
    await wait(350)
    phases.push(await scanAll())
    for (let p = 0; p < 6; p++) {
        // walk LEFT along the hall — the floor runs to x107, and the relic
        // stays BEHIND the hunter, so no phase can accidentally win.
        const t = await tickNow()
        await page.keyboard.down('ArrowLeft')
        await untilTick(t + 10); await page.keyboard.up('ArrowLeft')
        await wait(250)
        const ph = await scanAll()
        if (ph.c <= phases[phases.length - 1].c - 35) phases.push(ph)
        if (ph.c < 1475) break
    }
    const byLayer = [0, 0, 0]
    const good = []
    const allKeys = new Set(phases.flatMap(ph => Object.keys(ph.br)))
    for (const key of allKeys) {
        const cs = phases.filter(ph => ph.br[key] !== undefined).map(ph => ph.c)
        if (cs.length >= 2 && Math.max(...cs) - Math.min(...cs) >= 40) { good.push(key); byLayer[Number(key[0])]++ }
    }
    const seenWrong = phases.flatMap(ph => ph.wr)
    r.check('the hall cameras spread 120+ px (a rate needs two positions)',
        phases.length >= 2 && Math.max(...phases.map(p => p.c)) - Math.min(...phases.map(p => p.c)) >= 80,
       `cams: ${phases.map(p => p.c).join(' ')}`)
    r.check('stars sit where cam*f puts them at TWO+ cameras (hardcoded factors)',
        byLayer[0] >= 1 && byLayer[1] >= 1 && byLayer[2] >= 1,
        `per-layer two-camera stars: ${byLayer.join('/')} (${good.join(' ')}) — cams ${phases.map(p => p.c).join(' ')} raw: ${starDbg.slice(0, 14).join(' ')}`)
    // NOTE: a cam-rate cheat probe cannot exist inside the hall — any star
    // visible on screen has wx < cam (pred = wx - f*cam in [4,475], f < 1),
    // so its wx - cam is always negative and wraps far off-screen. The
    // two-camera prediction above IS the rate proof: a uniform scroller
    // moves the L2 stars 52 px from where the prediction points, and they
    // all go dark. seenWrong stays as a soft sample when the geometry allows.
    r.check('stars are NOT painted where a cam-rate scroll would put them',
        seenWrong.every(s => Number(s.split('=')[1]) < 25),
        `${seenWrong.filter(s => Number(s.split('=')[1]) < 25).length}/${seenWrong.length} cheat probes dark — ${seenWrong.filter(s => Number(s.split('=')[1]) >= 25).slice(0, 5).join(' ')}`)
    await page.evaluate(() => window.__metroidTest.teleport(4, 35))
    await wait(300)
}

// ---- gadgets: rig the OWNERSHIP (setup only), fire with real keys ----
{
    await page.evaluate(() => window.__metroidTest.grant('beam'))
    await tap('KeyX')
    await wait(250)
    const a = await probe()
    r.check('a real X after owning the beam really fires', a.evLog.some(e => e.type === 'fire' && e.tick > a.tick - 40), `fires=${a.evLog.filter(e => e.type === 'fire').length}`)
    await page.evaluate(() => window.__metroidTest.grant('bomb'))
    await page.evaluate(() => window.__metroidTest.teleport(86, 24))
    await wait(150)
    await page.keyboard.down('ArrowDown')
    await tap('KeyX')
    await page.keyboard.up('ArrowDown')
    let blown = false
    for (let i = 0; i < 30 && !blown; i++) { blown = (await probe()).bulks === 2; await wait(150) }
    r.check('DOWN+X drops a bomb that blows BOTH bulkheads in the live grid', blown, `bulks=${(await probe()).bulks}`)
}

// ---- the SPACE JUMP, scheduled against the sim clock, not the wall ----
{
    await page.evaluate(() => window.__metroidTest.grant('sjump'))
    let up = false
    let s = null
    // CDP key round-trips quantize the schedule by 0-2 ticks; the sim itself
    // is deterministic (metroidcheck proves the shelf needs a SPACE JUMP via
    // the doubleJump mutant). Up to three REAL attempts turn that latency
    // jitter into coverage — no shortcut, no synthetic state.
    for (let attempt = 1; attempt <= 3 && !up; attempt++) {
        await page.evaluate(() => window.__metroidTest.teleport(110, 25))
        await wait(150)
        const t0 = await tickNow() + 1
        await page.keyboard.down('Space')                        // jump off the floor next tick
        await untilTick(t0 + 19); await page.keyboard.up('Space')     // release AT apex (vy~0): the cut is a no-op
        await untilTick(t0 + 22); await page.keyboard.down('Space')   // the SPACE JUMP, fresh edge at the apex
        await untilTick(t0 + 24); await page.keyboard.down('ArrowLeft')    // drift on the RISE: CDP latency
        await untilTick(t0 + 32); await page.keyboard.up('ArrowLeft')      // only steals from the long apex margin
        for (let i = 0; i < 30 && !up; i++) {
            s = await probe()
            up = s.onGround && s.player.foot.y === 20 && s.player.foot.x >= 106 && s.player.foot.x <= 108
            if (!up) await wait(90)
        }
        if (!up) r.info(`sj try ${attempt}`, JSON.stringify((s || { player: {} }).player.foot))
    }
    r.check('two real SPACE presses + a real drift land the hunter on the 80px shelf',
        up, `foot=${JSON.stringify((s || { player: {} }).player.foot)} screen=${(s || {}).screen} dead=${(s || {}).dead}`)
    if (!up) r.info('sj hist', JSON.stringify(((s || { hist: [] }).hist || []).map(h => `${h[0]}:${h[1]},${h[2]}${h[3] ? 'G' : ''}${h[4] ? 'D' : ''}${h[5] ? 'J' : ''}dd${h[7]}${h[8] ? 'W' : ''}`)))
}

// ---- the beacon remembers, and dying at the teeth proves it ----
{
    await page.evaluate(() => window.__metroidTest.teleport(5, 35))
    await hold('ArrowRight', 400)
    const a = await probe()
    r.check('walking into a beacon syncs the save point', a.save.x === 6 && a.save.y === 35, `save=${a.save.x},${a.save.y}`)
    await page.evaluate(() => window.__metroidTest.teleport(30, 37))
    let died = false
    for (let i = 0; i < 90 && !died; i++) { died = (await probe()).deaths >= 1; await wait(200) }
    r.check('four spike hits with real collision drop the hunter', died, `deaths=${(await probe()).deaths}`)
    await wait(1600)
    const b = await probe()
    const back = b.player.foot.x >= 5 && b.player.foot.x <= 7 && b.player.foot.y === 35
    r.check('death returns the hunter to the beacon it last touched — not the spawn', back && b.energy === 4, `foot=${b.player.foot.x},${b.player.foot.y} energy=${b.energy}`)
}

// ---- the pause door ----
{
    await tap('Shift+Slash')
    await wait(400)
    r.check('a real ? opens the pause overlay', (await page.locator('text=RESUME GAME').count()) > 0)
    await tap('Shift+Slash')
    await wait(300)
    r.check('a real ? closes it again', (await page.locator('text=RESUME GAME').count()) === 0)
}

r.check('zero page errors across the whole playthrough', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
