// padtypeplay — #3108 browser legs: the five controller types live. Real
// touch only (Playwright taps + CDP touch), iPhone-sized viewport:
//   SSX          FULL default: d-pad + fixedstick + diamond verbs + shoulder
//                firing its declared code; pause CONTROLLER row switches to
//                STICK, the choice persists across reload, and clearing the
//                store restores the declared default.
//   MARBLE MADNESS TILT: ENABLE pill → RE-CENTER pill; a deviceorientation
//                sample steers and re-centre zeroes it (synthetic sensor events
//                — listeners don't check isTrusted).
//   MARBLE RUSH  #3129 tilt grant live: pause row offers STICK/TILT/D-PAD;
//                the pill flow works AND a held lean really drives the sim —
//                same-seed hash divergence through the padState holder the
//                game's readPad() consumes (deterministic, no wall-clock race).
//   COMET DRIFT HD  #3129 tilt grant live: pause row offers the three types,
//                tilt pill flow works, and the DRIFT chip stays (actzone
//                keeps its declared verb — tilt orphans nothing).
//   MARIO KART   #3131 tilt grant live: pause row offers STICK/TILT/FULL PAD,
//                the pill flow works, ITEM + DRIFT chips stay, and held leans
//                drive the sim for real — same-seed hash divergence plus the
//                sign proofs (lean forward throttles, roll right steers right)
//                through the onePad holder steerPedals consumes.
//   SSX TILT     #3129 chrome audit live: pause row offers TILT, the game-side
//                #894 stick yields to the lean (its trick row stays — the tilt
//                pad draws no diamond), and a held lean ramps the #791 edge
//                press in a real race through the padState rail.
//   PAC-MAN      dpad default (gate); pause row switches to STICK (floating
//                half); a horizontal drag pushes the knob (the digital read
//                rides the holder, so no arrows on the wire — padtypecheck
//                pins the 4-way quantizer this path uses).
//   GALAGA       an untouched game keeps its exact pre-#3108 pad.
//   MINESWEEPER  #3129 pointer grant live: pause row offers POINTER, the
//                directional pad drops away, and canvas taps drive the game
//                (quick tap digs, press-and-hold flags).
// Needs `npm run dev` (DEV_PORT, default 5173). Screenshots land in qa-art/.
import { launch } from './lib/harness.mjs'
import { Report } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || '5178'}/retrogames`
const r = new Report('padtypeplay')
const browser = await launch()

async function mkPage(path) {
    const page = await browser.newPage({
        viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    })
    page.setDefaultTimeout(30000)
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)))
    // Known app-wide warning (React registers touch* passively; #606 fixed it
    // with CSS touch-action laws, asserted by touchselectcheck) — same
    // convention as vpadboot: console noise is info, page errors are failures.
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Unable to preventDefault')) errors.push('console: ' + m.text().slice(0, 160)) })
    await page.addInitScript(() => {
        try { localStorage.setItem('retrogames-consent-v1', JSON.stringify({ anon: { motion: false, voice: false, at: Date.now() } })) } catch { /* */ }
    })
    await page.goto(BASE + path, { waitUntil: 'load' })
    await page.waitForSelector('canvas', { timeout: 20000 })
    await page.waitForTimeout(700)
    // generic start ladder
    for (let i = 0; i < 4; i++) {
        await page.touchscreen.tap(215, 320)
        await page.waitForTimeout(500)
        const vcs = await page.evaluate(() => [...document.querySelectorAll('[data-vc]')].map((d) => d.getAttribute('data-vc')))
        if (vcs.length > 1) break
    }
    return { page, errors }
}
const vcs = (page) => page.evaluate(() => [...document.querySelectorAll('[data-vc]')].map((d) => d.getAttribute('data-vc')))
const tapEl = async (page, sel) => {
    const box = await page.evaluate((s) => {
        const els = [...document.querySelectorAll(s)]
        for (const el of els) {
            const r = el.getBoundingClientRect()
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            if (r.width > 0 && r.height > 0 && el.contains(top)) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        }
        return null
    }, sel)
    if (!box) return false
    await page.touchscreen.tap(box.x, box.y)
    return true
}
// click the LAST match — PauseOverlay keeps an invisible measurement mirror
// (first copy) and the live page (last copies) of every block.
const clickLast = async (page, sel) => page.evaluate((s) => {
    const els = [...document.querySelectorAll(s)]
    if (!els.length) return false
    els[els.length - 1].click()
    return true
}, sel)

// --- SSX: full pad by default ---
{
    const { page, errors } = await mkPage('/ssx')
    const v = await vcs(page)
    r.check('ssx: full-pad cluster renders', v.includes('fixedstick') && v.includes('dpad') && v.includes('facediamond'), v.join(','))
    r.check('ssx: shoulders + diamond labels', v.filter((x) => x === 'sh').length === 2 && await page.evaluate(() => [...document.querySelectorAll('[data-vc="sh"]')].map((e) => e.textContent.trim()).join('|')) === 'FLIP|FLIP', v.join(','))
    r.check('ssx: diamond carries JUMP/BST/GRAB/INVERT', await page.evaluate(() => {
        const t = [...document.querySelectorAll('[data-vc="a"],[data-vc="b"],[data-vc="fx"]')].map((e) => e.textContent.trim()).sort().join(',')
        return t === 'BST,GRAB,INVERT,JUMP'
    }))
    // shoulder press fires KeyZ
    await page.evaluate(() => {
        window.__kz = 0
        window.addEventListener('keydown', (e) => { if (e.code === 'KeyZ') window.__kz++ })
        window.__ts = 0
        window.addEventListener('touchstart', () => { window.__ts++ }, true)
    })
    const shBox = await tapEl(page, '[data-vc="sh"][data-key="KeyZ"]')
    r.info('shoulder tap box found', String(shBox))
    r.check('ssx: L1 shoulder fires KeyZ', await page.evaluate(() => window.__kz) >= 1, 'kz=' + await page.evaluate(() => window.__kz) + ' ts=' + await page.evaluate(() => window.__ts))
    // pause -> CONTROLLER row -> switch to STICK -> persists
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Question', key: '?', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Question', bubbles: true })) })
    await page.waitForTimeout(400)
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-padtype]')].map((e) => e.getAttribute('data-padtype')))
    r.check('ssx: pause CONTROLLER row (STICK/TILT/FULL PAD)', [...new Set(chips)].join(',') === 'full,stick,tilt', 'chips=' + chips.join(','))
    await clickLast(page, '[data-padtype="stick"]')
    await page.waitForTimeout(200)
    r.check('ssx: choice persisted', await page.evaluate(() => localStorage.getItem('retrogames:padtype:/ssx')) === 'stick')
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Question', key: '?', bubbles: true })) })
    await page.waitForTimeout(400)
    const v2 = await vcs(page)
    r.check('ssx: switch to STICK swaps shape', v2.includes('stick') && !v2.includes('facediamond'), v2.join(','))
    r.check('ssx: zero page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
    await page.screenshot({ path: 'qa-art/padtype-ssx-stick.png' })
    await page.evaluate(() => localStorage.removeItem('retrogames:padtype:/ssx'))
    await page.close()
}

// --- reload persistence for SSX full default ---
{
    const { page } = await mkPage('/ssx')
    const v = await vcs(page)
    r.check('ssx: default restored after clear', v.includes('facediamond'))
    await page.screenshot({ path: 'qa-art/padtype-ssx-full.png' })
    await page.close()
}

// --- SSX: tilt (#3129 chrome audit — the game-side stick yields, lean drives) ---
{
    const { page, errors } = await mkPage('/ssx?padtype=tilt')
    const v = await vcs(page)
    r.check('ssx-tilt: pill renders (no VC stick)', v.includes('tilt-enable') && !v.includes('fixedstick'), v.join(','))
    const c0 = await page.evaluate(() => ({
        stick: !!document.querySelector('[data-ssx-stick]'),
        tricks: document.querySelectorAll('[data-ssx-trick]').length,
    }))
    r.check('ssx-tilt: game-side stick yields, trick row stays', !c0.stick && c0.tricks === 3, JSON.stringify(c0))
    await tapEl(page, '[data-vc="tilt-enable"]')
    await page.waitForTimeout(250)
    const v1 = await vcs(page)
    r.check('ssx-tilt: enable -> RE-CENTER pill', v1.includes('tilt-recenter'), v1.join(','))
    await page.evaluate(() => {
        window.__dirs = []
        window.addEventListener('keydown', (e) => { if (e.code.startsWith('Arrow')) window.__dirs.push(e.code) })
    })
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0, gamma: 10 })))
    await page.waitForTimeout(150)
    r.check('ssx-tilt: right lean steers ArrowRight', (await page.evaluate(() => window.__dirs)).includes('ArrowRight'), ((await page.evaluate(() => window.__dirs)) || []).join(',') || 'no arrows')
    // reach, not just codes: hold the lean in a live race and watch the #791
    // edge press ramp — the steer line that moves it is padState, which is
    // only reachable through the tilt rail once the game stick has yielded.
    const P = () => page.evaluate(() => (window.__ssxTest ? window.__ssxTest.probe() : null))
    let inRun = false
    for (let i = 0; i < 120; i++) { const s = await P(); if (s && s.phase === 'run') { inRun = true; break } await page.waitForTimeout(100) }
    r.check('ssx-tilt: race is running for the reach proof', inRun, inRun ? 'run' : `phase=${(await P()) ? (await P()).phase : '?'}`)
    let ramp = null
    const t0 = Date.now()
    while (Date.now() - t0 < 3000) {
        await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0, gamma: 10 })))
        const s = await P()
        if (s && s.p.press >= 0.35) { ramp = s.p.press; break }
        await page.waitForTimeout(50)
    }
    r.check('ssx-tilt: held lean ramps the analog edge press (real race)', ramp !== null, `press=${ramp === null ? '?' : ramp.toFixed(2)}`)
    // re-centre on the leaned pose zeroes the output (same law as the marble leg)
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0, gamma: 10 })))
    await tapEl(page, '[data-vc="tilt-recenter"]')
    await page.evaluate(() => { window.__dirs = [] })
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0, gamma: 10 })))
    await page.waitForTimeout(150)
    r.check('ssx-tilt: re-centre zeroes the leaned pose', (await page.evaluate(() => window.__dirs)).length === 0, ((await page.evaluate(() => window.__dirs)) || []).join(',') || 'ok')
    r.check('ssx-tilt: zero page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
    await page.screenshot({ path: 'qa-art/padtype-ssx-tilt.png' })
    await page.evaluate(() => localStorage.removeItem('retrogames:padtype:/ssx'))
    await page.close()
}

// --- MARBLE MADNESS: tilt ---
{
    const { page, errors } = await mkPage('/marble-madness?padtype=tilt')
    const v = await vcs(page)
    r.check('marble: tilt pill renders (no stick zone)', v.includes('tilt-enable') && !v.includes('stick'), v.join(','))
    await tapEl(page, '[data-vc="tilt-enable"]')
    await page.waitForTimeout(300)
    const v2 = await vcs(page)
    r.check('marble: enable -> RE-CENTER pill', v2.includes('tilt-recenter'), v2.join(','))
    await page.evaluate(() => { window.__dirs = []; window.addEventListener('keydown', (e) => { if (e.code.startsWith('Arrow')) window.__dirs.push(e.code) }) })
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0, gamma: 10 })))
    await page.waitForTimeout(250)
    r.check('marble: right tilt steers ArrowRight', (await page.evaluate(() => window.__dirs)).includes('ArrowRight'), (await page.evaluate(() => window.__dirs.join(','))) || 'no arrows')
    // recenter, then the same pose must be neutral
    await tapEl(page, '[data-vc="tilt-recenter"]')
    await page.evaluate(() => { window.__dirs = [] })
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0, gamma: 10 })))
    await page.waitForTimeout(250)
    r.check('marble: re-centre zeroes the pose', (await page.evaluate(() => window.__dirs)).length === 0, (await page.evaluate(() => window.__dirs.join(','))) || 'ok')
    r.check('marble: zero page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
    await page.screenshot({ path: 'qa-art/padtype-marble-tilt.png' })
    await page.close()
}

// --- MARBLE RUSH: tilt (#3129 — the #3107 roller takes the tail grant) ---
{
    const { page, errors } = await mkPage('/marble-rush?padtype=tilt')
    const v = await vcs(page)
    r.check('rush: tilt pill renders (no stick zone)', v.includes('tilt-enable') && !v.includes('fixedstick'), v.join(','))
    await tapEl(page, '[data-vc="tilt-enable"]')
    await page.waitForTimeout(300)
    r.check('rush: enable -> RE-CENTER pill', (await vcs(page)).includes('tilt-recenter'), (await vcs(page)).join(','))
    // Honest input-reach proof, wall-clock-free: one synchronous block (the
    // live loop cannot interleave) resets the deterministic sim to the same
    // seed and steps 90 ticks neutral, then 90 with a held right-tilt pose
    // (synthetic deviceorientation, same convention as the marble leg). A
    // diverging hash means the lean reached padState through the tilt rail
    // and readPad() consumed it — exactly the holder path this method-stick
    // game reads, not just the arrow codes the legacy titles hear.
    const res = await page.evaluate(() => {
        const T = window.__marbleRushTest
        T.setMode('play')
        window.__game.reset(4242)
        const neutral = T.step(90).hash
        window.__game.reset(4242)
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0, gamma: 10 }))
        const leaned = T.step(90).hash
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0, gamma: 0 }))
        return { neutral, leaned }
    })
    r.check('rush: held right-tilt drives the marble (hash diverges, same seed/ticks)', res.neutral !== res.leaned, `neutral=${res.neutral} leaned=${res.leaned}`)
    // RE-CENTER zeroes the held pose: after re-centring, the same gamma=10
    // pose must replay the neutral trajectory byte-for-byte. (Re-dispatch the
    // pose FIRST — tiltSeen only updates on events, and re-centre pins the
    // LAST SEEN pose; re-centering on a stale gamma=0 would freeze a fake
    // −10° baseline instead of nulling this 10° lean.)
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0, gamma: 10 })))
    await tapEl(page, '[data-vc="tilt-recenter"]')
    await page.waitForTimeout(150)
    const after = await page.evaluate(() => {
        const T = window.__marbleRushTest
        window.__game.reset(4242)
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0, gamma: 10 }))
        return T.step(90).hash
    })
    r.check('rush: RE-CENTER makes the held pose neutral', after === res.neutral, `after=${after} neutral=${res.neutral}`)
    // pause -> CONTROLLER row offers all three granted types. (Marble Rush
    // binds pause to Escape/Slash — a real '?' IS Shift+Slash, so the
    // synthetic event must carry code 'Slash', not 'Question'.)
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Slash', key: '?', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Slash', bubbles: true })) })
    await page.waitForTimeout(400)
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-padtype]')].map((e) => e.getAttribute('data-padtype')))
    r.check('rush: pause CONTROLLER row (STICK/TILT/D-PAD)', [...new Set(chips)].join(',') === 'stick,tilt,dpad', 'chips=' + chips.join(','))
    r.check('rush: zero page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
    await page.screenshot({ path: 'qa-art/padtype-marble-rush-tilt.png' })
    await page.evaluate(() => localStorage.removeItem('retrogames:padtype:/marble-rush'))
    await page.close()
}

// --- COMET DRIFT HD: tilt affordances (#3129 kart grant; DRIFT keeps a chip) ---
{
    const { page, errors } = await mkPage('/comet-drift-hd?padtype=tilt&gl=webgl2')
    const v = await vcs(page)
    r.check('comet-hd: tilt pill renders (no stick zone)', v.includes('tilt-enable') && !v.includes('fixedstick'), v.join(','))
    await tapEl(page, '[data-vc="tilt-enable"]')
    await page.waitForTimeout(300)
    const v2 = await vcs(page)
    r.check('comet-hd: enable -> RE-CENTER pill', v2.includes('tilt-recenter'), v2.join(','))
    r.check('comet-hd: DRIFT chip stays in tilt (verb not orphaned)', v2.includes('a'), v2.join(','))
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Question', key: '?', bubbles: true })) })
    await page.waitForTimeout(400)
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-padtype]')].map((e) => e.getAttribute('data-padtype')))
    r.check('comet-hd: pause CONTROLLER row (STICK/TILT/FULL PAD)', [...new Set(chips)].join(',') === 'stick,tilt,full', 'chips=' + chips.join(','))
    r.check('comet-hd: zero page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
    await page.screenshot({ path: 'qa-art/padtype-comet-hd-tilt.png' })
    await page.evaluate(() => localStorage.removeItem('retrogames:padtype:/comet-drift-hd'))
    await page.close()
}

// --- MARIO KART: tilt (#3131 — the ladder's racer takes the lean) ---
{
    const { page, errors } = await mkPage('/mario-kart?padtype=tilt')
    // the pad mounts with the race; the generic ladder taps may need a beat
    let v = await vcs(page)
    for (let i = 0; i < 10 && !v.includes('tilt-enable'); i++) { await page.touchscreen.tap(215, 320); await page.waitForTimeout(400); v = await vcs(page) }
    r.check('kart: tilt pill renders (no stick zone)', v.includes('tilt-enable') && !v.includes('stick'), v.join(','))
    await tapEl(page, '[data-vc="tilt-enable"]')
    await page.waitForTimeout(300)
    const v2 = await vcs(page)
    r.check('kart: enable -> RE-CENTER pill', v2.includes('tilt-recenter'), v2.join(','))
    r.check('kart: ITEM + DRIFT chips stay in tilt (verbs not orphaned)', v2.includes('a') && v2.includes('b'), v2.join(','))
    // Honest reach proof, wall-clock-free (the marble-rush convention): one
    // synchronous block resets the deterministic sim and steps 360 ticks
    // (190 countdown + 170 race) with the pad as it holds. N = neutral coast;
    // F = lean forward (portrait beta −10 → −y → steerPedals throttle);
    // R/L = the same lean rolled right/left on gamma. Diverging hashes mean
    // the lean reached the sim through the onePad holder steerPedals reads;
    // the v and steer signs pin the LAW, not just a difference.
    const pose = (beta, gamma) => `window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: ${beta}, gamma: ${gamma} }))`
    const run = async (beta, gamma) => page.evaluate(`(() => {
        ${pose(beta, gamma)}
        const T = window.__kartTest
        T.resetSim()
        const out = T.stepTicks(360)
        ${pose(0, 0)}
        return out
    })()`)
    const N = await run(0, 0)
    const F = await run(-10, 0)
    const R = await run(-8, 8)
    const L = await run(-8, -8)
    r.check('kart: forward lean throttles (v grows where neutral coasts)', F.v > N.v + 2, `neutral v=${N.v}, forward v=${F.v}`)
    r.check('kart: forward lean diverges the sim hash (same replay, same ticks)', F.hash !== N.hash, `N=${N.hash} F=${F.hash}`)
    // G = STEER_GAIN 0.6 with the soft curve: steerResponse(8/14) ≈ 0.18, so
    // the honest band is ±0.15 — full stick lock is 0.6 by design (#431).
    r.check('kart: roll right steers right, roll left steers left (sign law)', R.steer > 0.15 && L.steer < -0.15 && R.hash !== L.hash, `R=${R.steer} L=${L.steer}`)
    // RE-CENTER zeroes the held pose: after re-centring on the leaned pose,
    // the same pose must replay the neutral trajectory hash byte-for-byte.
    await page.evaluate(pose(-8, 8))
    await tapEl(page, '[data-vc="tilt-recenter"]')
    await page.waitForTimeout(150)
    const Z = await run(-8, 8)
    r.check('kart: RE-CENTER makes the held pose neutral', Z.hash === N.hash, `Z=${Z.hash} N=${N.hash}`)
    // pause -> CONTROLLER row offers the three granted types, derived default leads
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Question', key: '?', bubbles: true })) })
    await page.waitForTimeout(400)
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-padtype]')].map((e) => e.getAttribute('data-padtype')))
    r.check('kart: pause CONTROLLER row (STICK/TILT/FULL PAD)', [...new Set(chips)].join(',') === 'stick,tilt,full', 'chips=' + chips.join(','))
    r.check('kart: zero page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
    await page.screenshot({ path: 'qa-art/padtype-mario-kart-tilt.png' })
    await page.evaluate(() => localStorage.removeItem('retrogames:padtype:/mario-kart'))
    await page.close()
}

// --- PAC-MAN: dpad default, stick switch ---
{
    const { page, errors } = await mkPage('/pacman')
    const v = await vcs(page)
    r.check('pacman: default is the gate', v.includes('dpadgate'), v.join(','))
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Question', key: '?', bubbles: true })) })
    await page.waitForTimeout(400)
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-padtype]')].map((e) => e.getAttribute('data-padtype')))
    r.check('pacman: pause row (DPAD/STICK)', [...new Set(chips)].join(',') === 'dpad,stick', 'chips=' + chips.join(','))
    await clickLast(page, '[data-padtype="stick"]')
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Question', key: '?', bubbles: true })) })
    await page.waitForTimeout(500)
    const v2 = await vcs(page)
    r.check('pacman: stick mode swaps gate for floating stick', v2.includes('stick') && !v2.includes('dpadgate'), v2.join(','))
    // horizontal drag drives the floating stick; the digital read rides the
    // one-pad holder (currentPad('dpad')) so no arrows on the wire — the knob
    // transform proves registration and direction, and padtypecheck pins the
    // dpadDirs 4-way quantizer this path uses.
    await page.evaluate(() => {
        const r = document.querySelector('[data-vc="stick"]').getBoundingClientRect()
        window.__sx = r.left + 40; window.__sy = r.top + r.height - 230
    })
    const sx = await page.evaluate(() => window.__sx), sy = await page.evaluate(() => window.__sy)
    const cdp = await page.context().newCDPSession(page)
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
    await touch('touchStart', [{ x: sx, y: sy }])
    await touch('touchMove', [{ x: sx + 45, y: sy + 3 }])
    await touch('touchMove', [{ x: sx + 88, y: sy + 6 }])
    const knob = await page.evaluate(() => {
        const el = document.querySelector('[data-vc="stick"] > div > div:last-child')
        if (!el) return null
        const m = /translate\((-?[\d.]+)px/.exec(el.style.transform || '')
        return m ? parseFloat(m[1]) : NaN
    })
    await touch('touchEnd', [])
    r.check('pacman: right drag pushes the stick right (holder path)', typeof knob === 'number' && knob > 0, 'knob=' + knob)
    r.check('pacman: zero page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
    await page.screenshot({ path: 'qa-art/padtype-pacman-stick.png' })
    await page.close()
}

// --- #3118 rollout: a granted game renders the Sony cluster when switched ---
{
    const { page, errors } = await mkPage('/double-dragon?padtype=full')
    const v = await vcs(page)
    r.check('dd: FULL grants dpad+stick+diamond', v.includes('dpad') && v.includes('fixedstick') && v.includes('facediamond'), v.join(','))
    r.check('dd: diamond carries JUMP/KICK/PUNCH codes', await page.evaluate(() => [...document.querySelectorAll('[data-vc="a"],[data-vc="b"],[data-vc="fx"]')].map((e) => e.getAttribute('data-key')).sort().join(',') === 'KeyX,KeyZ,Space'))
    await page.screenshot({ path: 'qa-art/padtype-dd-full.png' })
    r.check('dd: zero page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
    await page.close()
}
{
    const { page, errors } = await mkPage('/r-type?padtype=full')
    const v = await vcs(page)
    r.check('rtype: FULL renders dpad+stick+diamond', v.includes('dpad') && v.includes('fixedstick') && v.includes('facediamond'), v.join(','))
    r.check('rtype: diamond keeps FIRE/POD/THROW (no orphaned third verb)', await page.evaluate(() => [...document.querySelectorAll('[data-vc="a"],[data-vc="b"],[data-vc="fx"]')].map((e) => e.getAttribute('data-key')).sort().join(',') === 'KeyB,KeyN,Space'))
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Question', key: '?', bubbles: true })) })
    await page.waitForTimeout(400)
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-padtype]')].map((e) => e.getAttribute('data-padtype')))
    r.check('rtype: pause offers D-PAD+FULL (default derived)', [...new Set(chips)].sort().join(',') === 'dpad,full', 'chips=' + chips.join(','))
    r.check('rtype: zero page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
    await page.close()
}

// --- an untouched game keeps its exact pad ---
{
    const { page } = await mkPage('/galaga')
    const v = await vcs(page)
    r.check('galaga: untouched floating stick default', v.includes('stick') && !v.includes('facediamond'), v.join(','))
    await page.close()
}

// --- #3129 tail: a POINTER grant drives the game — Minesweeper's pause row
// offers POINTER, the directional pad drops away, and the canvas IS the
// surface: a quick tap digs (first dig safe, #438), press-and-hold plants a
// flag (LONGPRESS_MS=450, the original mouse law in touch, #1353). ---
{
    const { page, errors } = await mkPage('/minesweeper')
    const v = await vcs(page)
    r.check('mines: cross d-pad default', v.includes('dpad'), v.join(','))
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Question', key: '?', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Question', bubbles: true })) })
    await page.waitForTimeout(400)
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-padtype]')].map((e) => e.getAttribute('data-padtype')))
    r.check('mines: pause row offers D-PAD + POINTER', [...new Set(chips)].sort().join(',') === 'dpad,pointer', 'chips=' + chips.join(','))
    await clickLast(page, '[data-padtype="pointer"]')
    r.check('mines: POINTER choice persisted', await page.evaluate(() => localStorage.getItem('retrogames:padtype:/minesweeper')) === 'pointer')
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Question', key: '?', bubbles: true })) })
    await page.waitForTimeout(500)
    const v2 = await vcs(page)
    r.check('mines: POINTER drops the pad, keeps the verbs', !v2.includes('dpad') && !v2.includes('stick') && v2.includes('a') && v2.includes('b'), v2.join(','))
    const dims = await page.evaluate(() => window.__sweepTest.probe())
    // the board is the LARGEST canvas — the HUD strips are canvases too, and
    // the shell only lets a dig land on the board (`e.target !== canvas`)
    const cell = (cx, cy) => page.evaluate(([x, y]) => {
        const g = window.__sweepTest.probe()
        const c = [...document.querySelectorAll('canvas')].sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height))[0]
        const r = c.getBoundingClientRect()
        return { x: r.left + (x + 0.5) * r.width / g.w, y: r.top + (y + 0.5) * r.height / g.h }
    }, [cx, cy])
    const opened0 = await page.evaluate(() => window.__sweepTest.probe().opened)
    const mid = await cell(Math.floor(dims.w / 2), Math.floor(dims.h / 2))
    await page.touchscreen.tap(mid.x, mid.y)
    await page.waitForTimeout(300)
    r.check('mines: quick canvas tap digs', await page.evaluate(() => window.__sweepTest.probe().opened) > opened0)
    // hold-to-flag — walk corners until one is still covered (a big centre
    // cascade can open one)
    const flags0 = await page.evaluate(() => window.__sweepTest.probe().flags)
    const cdp2 = await page.context().newCDPSession(page)
    for (const [cx, cy] of [[0, 0], [dims.w - 1, 0], [0, dims.h - 1], [dims.w - 1, dims.h - 1]]) {
        const p = await cell(cx, cy)
        await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] })
        await page.waitForTimeout(650)
        await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await page.waitForTimeout(200)
        if (await page.evaluate(() => window.__sweepTest.probe().flags) > flags0) break
    }
    await cdp2.detach()
    r.check('mines: press-and-hold plants a flag on the canvas', await page.evaluate(() => window.__sweepTest.probe().flags) > flags0)
    r.check('mines: zero page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
    await page.screenshot({ path: 'qa-art/padtype-mines-pointer.png' })
    await page.evaluate(() => localStorage.removeItem('retrogames:padtype:/minesweeper'))
    await page.close()
}

const ok = r.finish ? r.finish() : null
await browser.close()
if (r.failed) process.exitCode = 1
console.log(`padverify: ${r.rows.length - r.failed}/${r.rows.length} checks, ${r.failed} failed`)
