// popplay — advisory browser driver (step 6): boot, real-key start, real-key
// play, a death, the level restarting under a running clock, and a restart —
// with zero page errors and the drawn state tracking the sim after every
// input. Needs `npm run dev` (or POP_URL).
import { launch, openGame, Report, opt } from './lib/harness.mjs'
import { DUEL_DUCK } from '../src/games/PrinceOfPersia/music.js'

const URL = process.env.POP_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/prince-of-persia`
const r = new Report('popplay')
const browser = await launch({ headless: opt(process.argv, '--headful', true) === false })
const page = await openGame(browser, { url: URL, hook: '__popTest', start: false, viewport: { width: 820, height: 680 } })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const probe = () => page.evaluate(() => window.__popTest.probe())
const hash = () => page.evaluate(() => window.__popTest.hash())
const mus = () => page.evaluate(() => window.__popTest.musicState())

let p = await probe()
r.check('boots into attract', p.attract === true && p.status === 'play', `${p.attract} ${p.status}`)
r.check('the prince starts unarmed', p.sword === false)
const h1 = await hash()

// the analyser taps the MUSIC bus only — footsteps and ambience go straight to
// the speakers — so this baseline really measures the attract silence.
let silencePeak = 0
for (let i = 0; i < 10; i++) {
    silencePeak = Math.max(silencePeak, (await mus()).peak)
    await page.waitForTimeout(50)
}
r.check('the attract screen sits in silence, like the original', silencePeak <= 6, `peak ${silencePeak}`)

await hash()
await page.waitForTimeout(700)
const h2 = await hash()
r.check('attract demo is alive (autopilot in the dungeon)', h1 !== h2)

await page.keyboard.press('Space')
await page.waitForTimeout(200)
p = await probe()
r.check('press any key starts the hour', p.attract === false && p.level === 0, `${p.attract} L${p.level}`)
const c0 = p.clock
await page.waitForTimeout(300)
r.check('clock is running', (await probe()).clock < c0, 'ticks spent')

// run right (real key): the drawn prince tracks the sim
const x0 = (await probe()).x
await page.keyboard.down('ArrowRight')
await page.waitForTimeout(500)
const x1 = (await probe()).x
await page.keyboard.up('ArrowRight')
r.check('ArrowRight runs the prince', x1 - x0 > 25, `${x0.toFixed(0)} -> ${x1.toFixed(0)}`)

// jump (real key)
await page.keyboard.down('ArrowRight')
await page.keyboard.down('Space')
await page.waitForTimeout(120)
const pj = await probe()
const airborne = pj.y < 8 * 32 - 4 || pj.vy < 0
await page.keyboard.up('Space')
await page.waitForTimeout(120)
await page.keyboard.up('ArrowRight')
r.check('SPACE leaves the ground', airborne, `y ${pj.y.toFixed(0)} vy ${pj.vy.toFixed(1)}`)

// sword pickup: run right through level 1's first room until it is drawn
let swordSeen = false
for (let i = 0; i < 60 && !swordSeen; i++) {
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(120)
    swordSeen = (await probe()).sword
}
await page.keyboard.up('ArrowRight')
r.check('the sword is found in level 1', swordSeen)

// hazard proof: race the gate, then hop onto the chomper's column right when
// its jaws are down — the sim's schedule is the same clock the probe reads.
// The level must restart and the hour must keep running through the death.
let died = false
let clockAtDeath = 0
let restarted = false
const PERIOD = 150, WAIT = 96, DROP = 30, REST = 8, PHASE = (26 % 3) * 22
await page.keyboard.down('ArrowRight')
for (let i = 0; i < 400 && !(died && restarted); i++) {
    p = await probe()
    if (p.status === 'dying' && !died) { died = true; clockAtDeath = p.clock }
    if (died && p.status === 'play' && p.clock < clockAtDeath) restarted = true
    if (!died) {
        if (p.level === 0 && p.gate < 0.7 && p.x > 12.9 * 32 && p.x < 13.7 * 32) {
            await page.keyboard.up('ArrowRight')      // linger on the button, let it lift
            await page.waitForTimeout(1000)
            await page.keyboard.down('ArrowRight')
        }
        if (p.level === 0 && p.x >= 27 * 32) {        // lived past the jaws — retreat and try the timing again
            await page.keyboard.up('ArrowRight')
            await page.keyboard.down('ArrowLeft')
            await page.waitForTimeout(1400)
            await page.keyboard.up('ArrowLeft')
            await page.keyboard.down('ArrowRight')
        }
        const tick = 216000 - p.clock
        const ph = ((tick + PHASE) % PERIOD + PERIOD) % PERIOD
        if (p.level === 0 && p.x > 20 * 32 && p.x < 27 * 32 && ph > 58 && ph < 92) {
            await page.keyboard.press('Space')          // hop the blade as it snaps down
        }
    }
    await page.waitForTimeout(90)
}
await page.keyboard.up('ArrowRight')
r.check('the chomper claims the careless (scheduled jaws)', died, `status=${p.status}`)
r.check('death restarts with the clock still running', restarted, `clock ${clockAtDeath.toFixed(0)} -> ${p.clock.toFixed(0)}`)

// restart path after game over (DEV cheat to the end screen, then real R key)
await page.evaluate(() => window.__dbg && window.__dbg.act('win'))
await page.waitForTimeout(1200)
p = await probe()
r.check('the princess door opens at the end of the hour', p.status === 'win', `${p.status} L${p.level}`)
await page.keyboard.press('KeyR')
await page.waitForTimeout(300)
p = await probe()
r.check('R restarts the hour', p.status === 'play' && p.level === 0 && p.clock > 200000, `${p.status} L${p.level} clock=${p.clock.toFixed(0)}`)

// ---- the sound pass: the hour rides a music bed, and the twelve levels flip -
// it with their stone (dungeon drip under the dark, the throne bed in the
// palace). Skips ride the DEV panel; the tracks are read back from the live
// engine, not recomputed.
await page.waitForTimeout(1500)
const m1 = await mus()
let peak = 0
for (let i = 0; i < 24; i++) {
    peak = Math.max(peak, (await mus()).peak)
    await page.waitForTimeout(60)
}
r.check('the hour rides a music bed (engine stepping, analyser over the attract silence)',
    m1.playing && m1.track === 'pop' && m1.step > 0 && peak > silencePeak + 3, `track ${m1.track} step ${m1.step} peak ${peak} vs ${silencePeak}`)

const PALACE = new Set([2, 7, 9, 10, 11])
const expectTrack = (i) => (PALACE.has(i) ? 'popThrone' : 'pop')
let bedOk = true, bedDetail = ''
for (let lvl = 1; lvl < 12; lvl++) {
    await page.evaluate(() => window.__dbg && window.__dbg.act('skip level'))
    let seen = null
    for (let i = 0; i < 60; i++) {
        seen = await probe()
        if (seen.level === lvl && !seen.attract) break
        await page.waitForTimeout(80)
    }
    const mm = await mus()
    const want = expectTrack(lvl)
    if (seen.level !== lvl || mm.track !== want) {
        bedOk = false
        bedDetail = `L${lvl}: probe L${seen.level} track ${mm.track} (want ${want})`
        break
    }
}
r.check('all twelve levels carry the right bed (dungeon pop / palace throne)', bedOk, bedDetail || 'twelve beds, twelve levels')
await page.evaluate(() => window.__dbg && window.__dbg.act('win'))
await page.waitForTimeout(1200)
const mEnd = await mus()
r.check('the rescued hour drops the bed at the princess door', mEnd.track !== 'pop' || !mEnd.playing, `track ${mEnd.track} playing ${mEnd.playing}`)

// ---- #2667 held duel duck: the measured bed at the live analyser ----------
// The old per-hit duel duck left nothing long enough to measure (350 ms dip,
// recover, pump). The held layback keeps the bus at DUEL_DUCK across the whole
// exchange, so the duck-over-bed relationship can finally be proven at the
// analyser tap: real arrows walk the prince into a real guard's wind-up on
// L1 room 0 (drive validated tick-exact against the sim: engage tick 31,
// release 129, two cues, unharmed with the block held), the bed audibly
// lays back, and comes back up when the steel goes quiet.
// Dismiss the end card AND confirm the reset actually ran before seating the
// duel at L1. Two traps, both measured this session: an R-restart leaves the
// end-seen latch set (the next arrow re-kicks a fresh L0 — no guards); and a
// quick press() can fall entirely between polled input frames on a loaded box
// (presses must be held long enough to be seen). Fresh-L0 signature: play +
// level 0 + zero guards (only L0 has none).
const arrowTap = async () => {
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(150)
    await page.keyboard.up('ArrowRight')
    await page.waitForTimeout(150)
}
for (let i = 0; i < 20; i++) {
    const pD = await probe()
    if (pD.status === 'play' && pD.level === 0 && (!pD.guards || pD.guards.length === 0)) break
    await arrowTap()
}
// Seat L1 and PROVE it sticks (guards present) — a late end-card kick can
// land right after goto(1) and silently drop the drive back to L0.
for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.__popTest.goto(1))
    await page.waitForTimeout(160)
    const pS = await probe()
    if (pS.level === 1 && pS.guards && pS.guards.length > 0) break
}
await page.evaluate(() => window.__dbg && window.__dbg.act('give sword'))
await page.waitForFunction(() => window.__popTest.musicState().playing, null, { timeout: 4000 })
// Base bed: only samples taken while the bus is at full level (the guard
// closes into range within ~1 s of seating, and on a starved box wind-up can
// land mid-sampling). The recovered window below also feeds the baseline, so
// an early engage can't contaminate the ratio.
let baseMax = 0
for (let i = 0; i < 16; i++) {
    const mB = await mus()
    if (mB.level !== 1) break
    baseMax = Math.max(baseMax, mB.peak)
    await page.waitForTimeout(50)
}
await page.keyboard.down('ArrowRight')
await page.keyboard.down('ArrowUp')
let engaged = false
const engTrace = []
for (let i = 0; i < 100 && !engaged; i++) {
    const mE = await mus()
    engaged = mE.level === DUEL_DUCK
    if (!engaged && i % 10 === 0) {
        const p2 = await probe()
        engTrace.push(`x${p2.x.toFixed(0)} st=${p2.status} L${p2.level}R${p2.room} hp${p2.hp} g0=${JSON.stringify(p2.guards && p2.guards[0])} lvl=${mE.level}`)
    }
    if (!engaged) await page.waitForTimeout(40)
}
r.check('stepping into a guard wind-up engages the held layback (#2667)',
    engaged, engaged ? 'bus held at DUEL_DUCK' : `never engaged — ${engTrace.join(' | ')}`)
let duckMax = 0
for (let i = 0; i < 8; i++) { duckMax = Math.max(duckMax, (await mus()).peak); await page.waitForTimeout(50) }
await page.keyboard.up('ArrowRight')
await page.keyboard.down('ArrowLeft')
let freed = false
for (let i = 0; i < 120 && !freed; i++) {
    freed = (await mus()).level === 1
    if (!freed) await page.waitForTimeout(40)
}
await page.keyboard.up('ArrowLeft')
await page.keyboard.up('ArrowUp')
let recMax = 0
for (let i = 0; i < 10; i++) { recMax = Math.max(recMax, (await mus()).peak); await page.waitForTimeout(50) }
const mDuel = await mus()
baseMax = Math.max(baseMax, recMax)
r.check('duck-over-bed MEASURED on the live analyser: bed peak falls while the exchange lays back (#2667)',
    engaged && duckMax > 0 && duckMax < baseMax * 0.85, `base ${baseMax} -> laid back ${duckMax}`)
r.check('the bed returns when the steel goes quiet — never silent, never stuck (#2667)',
    freed && recMax > duckMax * 1.15 && mDuel.playing, `ducked ${duckMax} -> back ${recMax}, playing ${mDuel.playing}`)

// --- the phone page (#2324): ✋ GRAB = Shift by thumb, end to end -------------
// A fresh touch page (keyboard untouched — trusted keys hide the pad by law).
// Real CDP touch on [data-vc="c"] must reach the sim's Shift law: held, the
// prince is capped to a walk (CFG.walk 1.45 vs run 2.6); released, he builds
// back to a run. That single discriminator proves the whole chain — button →
// synthesized keydown/keyup → the game's listener → the sim's walk cap — the
// exact chain the hang/climb grammar stands on (the grab LAW is popcheck's).
const phone = await openGame(browser, { url: URL, hook: '__popTest', viewport: { width: 390, height: 780 }, touch: true })
const pErrors = []
phone.on('pageerror', (e) => pErrors.push(String(e)))
await phone.evaluate(() => {
    window.__shiftLog = []
    window.addEventListener('keydown', (e) => { if (e.code === 'ShiftLeft') window.__shiftLog.push('down') })
    window.addEventListener('keyup', (e) => { if (e.code === 'ShiftLeft') window.__shiftLog.push('up') })
})
const pProbe = () => phone.evaluate(() => window.__popTest.probe())
// tap-to-start on the canvas (no keys): the pad must survive its first tap
const pcdp = await phone.context().newCDPSession(phone)
const tapCanvas = async () => {
    const r = await phone.evaluate(() => {
        const b = document.querySelector('canvas').getBoundingClientRect()
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    })
    await pcdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] })
    await phone.waitForTimeout(60)
    await pcdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
await tapCanvas()
r.check('the phone page starts by TAP (attract gone, pad shown)',
    (await pProbe()).attract === false && !!(await phone.$('[data-vc="c"]')))
const cRect = await phone.evaluate(() => {
    const b = document.querySelector('[data-vc="c"]')
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, key: b.dataset.key }
})
r.check('the pad carries a third held button, key ShiftLeft',
    !!cRect && cRect.key === 'ShiftLeft', cRect ? `data-key ${cRect.key}` : 'no [data-vc="c"]')

// stick anchor (left half) + the C button, both live at once
const sAnchor = { x: 90, y: 600 }
const pushRight = (pts) => pcdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts })
const stickMove = (pts) => pcdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts })
const touchEndBoth = (pts) => pcdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts })

// baseline: thumb right, no grab — he must build to a run
await pushRight([{ x: sAnchor.x, y: sAnchor.y, id: 1 }])
await stickMove([{ x: sAnchor.x + 70, y: sAnchor.y, id: 1 }])
await phone.waitForTimeout(620)
const vxRun = Math.abs((await pProbe()).vx)
r.check('thumb-right alone builds to a run', vxRun > 1.8, `vx ${vxRun.toFixed(2)}`)

// hold ✋ while still pushed — Shift must cap him to a walk (both points live)
await pushRight([{ x: sAnchor.x + 70, y: sAnchor.y, id: 1 }, { x: cRect.x, y: cRect.y, id: 2 }])
const shiftsAfterDown = await phone.evaluate(() => window.__shiftLog.filter((k) => k === 'down').length)
await phone.waitForTimeout(700)
const vxGrab = Math.abs((await pProbe()).vx)
r.check('holding ✋ caps him to a walk (Shift reaches the sim)', vxGrab <= 1.7, `vx ${vxGrab.toFixed(2)}`)
r.check('one held press dispatches exactly one ShiftLeft keydown', shiftsAfterDown === 1, `downs ${shiftsAfterDown}`)

// release ✋ but keep the thumb on the stick — the run must return (keyup law)
await pcdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: sAnchor.x + 70, y: sAnchor.y, id: 1 }] })
await touchEndBoth([{ x: cRect.x, y: cRect.y, id: 2 }])
await pushRight([{ x: sAnchor.x, y: sAnchor.y, id: 1 }])
await stickMove([{ x: sAnchor.x + 70, y: sAnchor.y, id: 1 }])
await phone.waitForTimeout(700)
const vxAFTER = Math.abs((await pProbe()).vx)
const shiftsUp = await phone.evaluate(() => window.__shiftLog.filter((k) => k === 'up').length)
r.check('lifting ✋ hands the run back (keyup reaches the sim)', vxAFTER > 1.8 && shiftsUp === 1, `vx ${vxAFTER.toFixed(2)}, ups ${shiftsUp}`)
await touchEndBoth([])

r.check('the phone page ran clean', pErrors.length === 0, pErrors.join(' | '))

// ---- #2461 living night sky on the live palace ----
await page.evaluate(() => window.__popTest.goto(2))
await page.waitForTimeout(400)
const sky = await page.evaluate(() => window.__popTest.sky())
r.check('#2461 THE CHECKPOINT opens under moonlit panes', sky.theme === 'palace' && sky.shades.length >= 1,
    `theme ${sky.theme} panes ${sky.shades.length}`)
r.check('#2461 overcast-then-clear is on the live forecast for every pane',
    sky.forecast.length >= 1 && sky.forecast.every((f) => f.min <= 0.8 && f.max >= 0.999), JSON.stringify(sky.forecast))
const panePix = () => page.evaluate((d) => {
    const g2 = document.querySelector('canvas').getContext('2d')
    const px = g2.getImageData(d.x, d.y, d.w, d.h).data
    let lum = 0
    for (let i = 0; i < px.length; i += 4) lum += px[i] + px[i + 2]
    return lum
}, sky.pane.dev)
const pix0 = await panePix()
await page.waitForTimeout(2500)
const pix1 = await panePix()
r.check('#2461 the glass lives on screen: cloud and star motion shift the pane', pix0 !== pix1, `lum ${pix0} -> ${pix1}`)
const sky2 = await page.evaluate(() => window.__popTest.sky())
r.check('#2461 the live shade channel rides the tick (sim-safe presentation)', sky2.tick > sky.tick && typeof sky2.pane.shade === 'number',
    `tick ${sky.tick} -> ${sky2.tick}, shade ${sky2.pane.shade}`)

r.check('zero page errors', errors.length === 0, errors.join(' | '))
r.exit(browser)
