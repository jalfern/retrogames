// FIRE CREW drive — real Chrome, real key events (#1254 step 6). Starts the
// game, plays with actual keydown/keyup, proves start→play→restart works with
// zero page errors, and that the drawn frame changes when the logical state
// changes (and stays put when it doesn't).
import { launch, opt, throttleCPU } from './lib/harness.mjs'

const PORT = process.env.DEV_PORT || 5173
const BASE = `http://localhost:${PORT}/retrogames/fire-crew`
// `--throttle 8` reproduces a GitHub runner on a laptop (#1744 pattern); the
// gates here are tick-pinned, so throttling tests patience, never semantics.
const THROTTLE = +opt(process.argv, '--throttle', 0)
let fails = 0
const ok = (c, name, d = '') => { if (c) console.log(`  ok   ${name}`); else { fails++; console.log(`  FAIL ${name}${d ? ` — ${d}` : ''}`) } }

const browser = await launch()
const page = await browser.newPage()
if (THROTTLE) await throttleCPU(page, THROTTLE)
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__game && window.__game.meta.id === 'fire-crew', { timeout: 25000 })
ok(true, 'boot: __game exposed, no wait timeout')

const press = async (code, ms = 120) => { await page.keyboard.down(code); await new Promise((r) => setTimeout(r, ms)); await page.keyboard.up(code) }
const screen = () => page.evaluate(() => window.__firecrewTest.screen())

ok(await screen() === 'attract', 'starts in attract')

// tap to select crew, then SPACE to go
await page.mouse.click(400, 300)
await new Promise((r) => setTimeout(r, 150))
ok(await screen() === 'select', 'tap moves attract -> select')
await press('Space', 150)
// #1712: the start now runs through the auto-record consent gate: it goes up
// at first START (nothing cached on this box), NO THANKS declines honestly
// and the shift launches anyway — the game never waits on the recorder.
let fcGate = false
try { await page.waitForSelector('[data-consent-gate]', { timeout: 5000 }); fcGate = true } catch { /* cached consent */ }
if (fcGate) await page.click('#consent-no')
ok(fcGate, 'the auto-record consent gate goes up at START (nothing checked by default, #1712)')
const started = await page.waitForFunction(() => window.__firecrewTest.screen() === 'play', { timeout: 8000 }).then(() => true).catch(() => false)
ok(started, 'SPACE launches the shift past the gate — declining still plays (honest degrade, #1712)')

// real keys move the hose: hold ArrowRight, watch x increase via the hook
const before = await page.evaluate(() => window.__firecrewTest.state().tick)
await page.keyboard.down('ArrowRight')
await new Promise((r) => setTimeout(r, 600))
await page.keyboard.up('ArrowRight')
const afterMove = await page.evaluate(() => window.__firecrewTest.state().tick)
ok(afterMove > before, 'real keys advance the sim through the rAF loop', `${before} -> ${afterMove}`)

// drawn pixels respond: canvas digest changes while playing, freezes when paused
const digest = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, c.height).data
    let h = 0
    for (let i = 0; i < d.length; i += 401) h = (h + d[i] * (i % 31 + 1)) | 0
    return h >>> 0
})
const d1 = await digest()
await new Promise((r) => setTimeout(r, 500))
const d2 = await digest()
ok(d1 !== d2, 'the scene animates while playing (fire/torch motion)')

// '?' pauses; the frame freezes across the same window
await press('Backquote')
await new Promise((r) => setTimeout(r, 120))
const p1 = await digest()
await new Promise((r) => setTimeout(r, 450))
const p2 = await digest()
ok(p1 === p2, 'pause freezes the drawn world')
await press('Backquote')

// sprite matches logic: drive via the contract; the drawn frame must change
// with the sim even though the rAF loop is locked while the contract holds it
// (#1415-era nightly fix): the baseline tick must be read in the SAME JS task
// as the locking step()s. A separate page.evaluate left the rAF loop open for
// the screenshot digest between them, and CI's software renderer slipped one
// extra tickSim frame in (the 100 -> 131 nightly fail). The lock persists
// until release(), so reading tickAfter after the batch stays clean.
const dA = await digest()
const tickBefore = await page.evaluate(() => {
    const t0 = window.__game.state().tick
    for (let i = 0; i < 30; i++) window.__game.step({ right: true })
    return t0
})
await new Promise((r) => setTimeout(r, 150)) // let the rAF draw land after the contract steps
const dB = await digest()
const tickAfter = await page.evaluate(() => window.__game.state().tick)
ok(tickAfter === tickBefore + 30, 'contract step advances exactly one per call', `${tickBefore} -> ${tickAfter}`)
ok(dA !== dB, 'drawn frame follows the logical step')
await page.evaluate(() => window.__game.release())

// autopilot finishes a whole shift, then a real key restarts
const end = await page.evaluate(async () => {
    const r = window.__firecrewTest.resolveAll()
    return r
})
ok(end && end.done === true, 'a full seeded shift reaches its end', `rescued ${end && end.rescued}/6 tick ${end && end.tick}`)
await new Promise((r) => setTimeout(r, 900))
ok(await screen() === 'over', 'the over card shows')
await press('KeyX', 120)
await new Promise((r) => setTimeout(r, 250))
ok(await screen() === 'attract', 'any key returns to attract')
await press('Space', 120)
await new Promise((r) => setTimeout(r, 150))
await press('Space', 120)
await new Promise((r) => setTimeout(r, 250))
ok(await screen() === 'play', 'restart works — the shift runs again')

// #1744 — wind audio cues on real rAF ticks: a forced breeze lays the bed,
// a gale on an extended ladder adds the load-creak, calm silences both.
const nap = (ms) => new Promise((r) => setTimeout(r, ms))
let spy = await page.evaluate(() => window.__firecrewTest.windForce(1, 0))
ok(spy && spy.gust === 1 && !spy.done, 'windForce lays a breeze on a live shift', JSON.stringify(spy))
await nap(1300)
spy = await page.evaluate(() => window.__firecrewTest.windSpy())
ok(spy.bed && spy.bed.vol > 0 && !spy.done, 'a breeze fires the low bed inside a second', JSON.stringify(spy.bed))
await page.evaluate(() => window.__firecrewTest.windForce(2, 0.95))
await nap(1300)
spy = await page.evaluate(() => window.__firecrewTest.windSpy())
ok(spy.bed && spy.creak && spy.creakFired && spy.creakFired.vol >= spy.creak.vol * 0.99,
    'a gale on an extended ladder howls and creaks', JSON.stringify(spy))
await page.evaluate(() => window.__firecrewTest.windForce(0, 0.95))
await nap(1300)
spy = await page.evaluate(() => window.__firecrewTest.windSpy())
ok(spy.bed === null && spy.creakFired === null && !spy.done,
    'calm silences the bed and the creak', JSON.stringify(spy))

// #1749 — the compass leans the bed on real ticks: a cross-wind gale fires
// the octave shadow, an east gale lifts the bed without the shadow
await page.evaluate(() => window.__firecrewTest.windForce(2, 0, 1))
await nap(1300)
spy = await page.evaluate(() => window.__firecrewTest.windSpy())
ok(spy.bed && spy.bed.second && spy.bed.second.freq === spy.bed.freq / 2 && spy.voice.freq === spy.bed.freq,
    'a cross-wind gale fires the octave-low shadow burst', JSON.stringify(spy.bed))
await page.evaluate(() => window.__firecrewTest.windForce(2, 0, 0))
await nap(1300)
spy = await page.evaluate(() => window.__firecrewTest.windSpy())
ok(spy.bed && !spy.bed.second && spy.voice.freq > 380 && spy.dir === 0,
    'an east gale lifts the bed, no shadow', JSON.stringify(spy.bed))
// the vane pre-whistle: set the shift 60 ticks out on a calm live shift; the
// rising figure must fire and land high-urgency before the wind turns
await page.evaluate(() => window.__firecrewTest.windForce(0, 0, -1))
await page.evaluate(() => window.__firecrewTest.windNext(60))
await nap(2000)
spy = await page.evaluate(() => window.__firecrewTest.windSpy())
ok(spy.whistleFired && spy.whistleFired.f0 === 240 && spy.whistleFired.f1 >= 500 && spy.whistleFired.f1 <= 760,
    'the pre-whistle fires and climbs before the shift lands', JSON.stringify(spy.whistleFired))

// #2029 — watch-seat polish, live in Chrome.
// (a) phone viewports: the WATCH pill must not crowd the canvas/HUD column;
// (b) seated B: releases AND flares the same press (the pinned ruling);
// (c) #2178 canary: seed 1 seated WINS 6/6 (resumed autopilot);
// (c2) the ember edges light live at 6601 on the unmanned idle route;
// (d) 2P select + a real pill tap: only seat 1 seats, partners stay human;
// (e) the seated radio hint is on screen while the sheet is flipped.
const pillAndHud = async () => page.evaluate(() => {
    const pill = document.querySelector('[data-watch-toggle]')
    const cvs = document.querySelector('canvas')
    if (!pill || !cvs) return null
    const p = pill.getBoundingClientRect()
    const c = cvs.getBoundingClientRect()
    const hud = { x: c.left, y: c.top, w: c.width, h: c.height * 0.2 } // HUD column = top fifth of the scene
    const hit = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0
    return { overlap: hit(p, hud), pills: p, canvas: c }
})
for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(vp)
    await new Promise((r) => setTimeout(r, 250))
    const m = await pillAndHud()
    ok(m && !m.overlap, `phone ${vp.width}x${vp.height}: the WATCH pill clears the HUD column`, m ? JSON.stringify({ pill: m.pills, canvas: m.canvas }) : 'no pill/canvas')
}
await page.setViewportSize({ width: 1280, height: 800 })

// (b) + (e): seat on a fresh shift, check the radio hint, then take the hose
// back with B — one press, released AND flaring.
await page.evaluate(() => window.__firecrewTest.start(77, 1))
await new Promise((r) => setTimeout(r, 200))
await press('KeyY', 120)
await new Promise((r) => setTimeout(r, 300))
const seated = await page.evaluate(() => window.__firecrewTest.probe())
ok(seated && seated.cpuSeat === true, 'B-leg: Y seats the watcher', JSON.stringify(seated))
const radioHintShown = await page.evaluate(() => document.body.innerText.includes('V RADIO — SHOUTS STILL STEER THE CREW'))
ok(radioHintShown, 'the seated radio hint is on screen (#2029)')
const beforeB = await page.evaluate(() => { const p = window.__firecrewTest.probe(); return { flares: p.flares, battery: p.battery } })
await press('KeyB', 120)
await new Promise((r) => setTimeout(r, 250))
const afterB = await page.evaluate(() => window.__firecrewTest.probe())
ok(afterB && afterB.cpuSeat === false, 'seated B releases the seat (takeover rule intact)')
ok(afterB && afterB.flares > beforeB.flares && afterB.battery <= beforeB.battery - 30,
    'the same press flares — B releases AND flares (#2029 ruling)', JSON.stringify({ beforeB, afterB }))

// (c) #2178 regression canary: seed 1 (the pillar seed) WINS seated. This
// route used to be pinned as a proven loser "riding to the clock" — but that
// was bug #2178 (the autopilot froze at a sealed loft pillar 3 victims short).
// #2181 fixed the freeze, so the seat now finishes 6/6 at ~tick 2175. Pin the
// RULE, not the bug's symptom: a seated seat that completes the rescue proves
// the autopilot resumes.
await page.evaluate(() => window.__firecrewTest.start(1, 1))
await new Promise((r) => setTimeout(r, 200))
await press('KeyY', 120) // WATCH seats the autopilot on the pillar seed
const seated1 = await page.evaluate(() => window.__firecrewTest.probe())
ok(seated1 && seated1.cpuSeat === true, 'canary-leg: Y seats the watcher on seed 1', JSON.stringify(seated1))
const canary = await page.evaluate(() => {
    let n = 0
    while (n++ < 6650 && !window.__firecrewTest.probe().done) window.__game.step({})
    return window.__firecrewTest.probe()
})
ok(canary && canary.done === true && canary.rescued === 6 && canary.tick < 6601,
    'seed 1 WINS seated — the autopilot resumes, 6/6 clear of the tell (#2178 canary)', JSON.stringify(canary))
await page.evaluate(() => window.__game.release())

// (c2) the ember tell, honestly — the UNMANNED route (the #2029 tell still
// has to be proven). Fresh shift, no seat press: human sources with empty pads
// idle the crew (the b28 seat law), nobody is rescued, and the red-zone tell
// crosses live at tick 6601 — the same litAt the Node gate pins. Sampling the
// edge just below and just above the threshold makes the red gain a transition,
// not a constant.
const edge = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(1, Math.floor(c.height / 2), 1, 1).data
    return { r: d[0], g: d[1], b: d[2] }
})
await page.evaluate(() => window.__firecrewTest.start(1, 1))
await new Promise((r) => setTimeout(r, 200))
const idle0 = await page.evaluate(() => window.__firecrewTest.unmanned())
ok(idle0 && JSON.stringify(idle0.sources) === JSON.stringify(['human', 'human', 'human']),
    'ember-leg: every seat unmanned — human sources with empty pads idle the crew', JSON.stringify(idle0))
const calmTick = await page.evaluate(() => { let n = 0; while (n++ < 7000 && window.__firecrewTest.probe().tick < 6590) window.__game.step({}); return window.__firecrewTest.probe().tick })
await new Promise((r) => setTimeout(r, 200))
const calmEdge = await edge()
const lateTick = await page.evaluate(() => { let n = 0; while (n++ < 200 && window.__firecrewTest.probe().tick <= 6610) window.__game.step({}); return window.__firecrewTest.probe().tick })
await new Promise((r) => setTimeout(r, 200))
const lateEdge = await edge()
ok(calmTick < 6601 && lateTick > 6601, 'the unmanned shift crosses the tell threshold live', JSON.stringify({ calmTick, lateTick }))
ok(lateEdge.r - lateEdge.b > calmEdge.r - calmEdge.b + 20,
    'the ember edge lights when the tell crosses 6601 (red gain at the screen edge)', JSON.stringify({ calmEdge, lateEdge }))
await page.evaluate(() => window.__game.release())

// (d) 2P on the picker + a real pill tap: seat 1 seats, the partner stays.
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__game && window.__game.meta.id === 'fire-crew', { timeout: 25000 })
await press('Space', 120)
await new Promise((r) => setTimeout(r, 200))
ok(await screen() === 'select', '2P-leg: Space reaches the picker')
const pickerCopy = await page.evaluate(() => document.body.innerText)
ok(/WATCH \(Y OR PILL\) STEPS ASIDE/.test(pickerCopy) && /PARTNERS STAY HUMAN/.test(pickerCopy),
    'picker copy names the HOSE seat for the watcher and partners as staying human')
await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('2P'))
    b.click()
})
await press('Space', 150)
const started2 = await page.waitForFunction(() => window.__firecrewTest.screen() === 'play', { timeout: 8000 }).then(() => true).catch(() => false)
ok(started2, '2P-leg: SPACE launches the two-crew shift (past the consent gate)')
await page.click('[data-watch-toggle]') // a real tap on the pill
await new Promise((r) => setTimeout(r, 250))
const twoP = await page.evaluate(() => window.__firecrewTest.probe())
ok(twoP && JSON.stringify(twoP.sources) === JSON.stringify(['cpu', 'human', 'cpu']),
    'the pill seats only seat 1 — the human partner stays human (#2029)', JSON.stringify(twoP && twoP.sources))

// #1712 S2 capture-wiring legs: honest-degrade (no consent stored on this box
// ⇒ nothing banks) and the watch span that a take must carry to be replayable.
const recIdle = await page.evaluate(() => window.__firecrewTest.rec())
ok(recIdle && recIdle.recording === false,
    'no consent on this box ⇒ nothing banks (the arm is honest-degrade, #1712)', JSON.stringify(recIdle && { r: recIdle.recording, v: recIdle.autoVoice }))
const spansBefore = recIdle && Array.isArray(recIdle.watch) ? recIdle.watch.length : 0
// the pill tap above seated the sheet: one span is OPEN (not closed) — and a
// second Y releases it (the flip law), closing exactly one span at the flip
// tick, which the take must carry so the adapter can re-seat the autopilot.
const recSeat = await page.evaluate(() => window.__firecrewTest.rec())
ok(recSeat && recSeat.open >= 1 && recSeat.watch.length === spansBefore,
    'seating keeps exactly one open span, uncounted until release (#1712)', JSON.stringify(recSeat && { open: recSeat.open, watch: recSeat.watch }))
await press('KeyY') // seated -> Y releases the sheet
await new Promise((r) => setTimeout(r, 200))
const recRel = await page.evaluate(() => window.__firecrewTest.rec())
ok(recRel && recRel.watch.length === spansBefore + 1 && /^\d+-\d+$/.test(recRel.watch[recRel.watch.length - 1]) && recRel.open === -1,
    'releasing closes the span into the take\'s rules string (t0-t1) (#1712)', JSON.stringify(recRel && recRel.watch))

// #2985: the span cap is NAMED — a heavily-watched take banks exactly
// WATCH_SPAN_CAP spans, and the 65th release STOPS banking and stamps the
// overflow instead of silently dropping early spans. One synchronous flip
// storm: rAF can't tick mid-evaluate, so the run can't die under the loop.
const capInfo = await page.evaluate(() => {
    const T = window.__firecrewTest
    const flip = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyY' }))
    let n = 0
    while (!T.rec().overflow && n < 200) { flip(); flip(); n++ } // seat + release per loop
    const r = T.rec()
    return { overflow: r.overflow, spans: r.watch.length, screen: T.screen() }
})
ok(capInfo.overflow === true && capInfo.spans === 64,
    '#2985 span-cap law: 64 spans bank exactly, the overflow-past-cap is named (never a silent cut)',
    JSON.stringify(capInfo))

// #2989 — the tank speaks on real ticks. Fresh shift (watch never lingers,
// startPlay seats the hand): force the arc's crossings and prove the human
// seat sees and hears each fall, the seated ear stays shut, and a hand asking
// for water that isn't there gets the dry-valve clunk.
await page.evaluate(() => window.__firecrewTest.start(77, 1))
await page.waitForFunction(() => window.__firecrewTest.screen() === 'play', { timeout: 8000 })
await nap(400) // let the loop's ref stream start before forcing (prevRef fills on tick 1)
let tspy = await page.evaluate(() => window.__firecrewTest.tankForce(20))
ok(tspy && tspy.tank === 20 && tspy.human, 'tankForce puts the arc under TANK_LOW on a live shift', JSON.stringify(tspy))
await nap(500)
tspy = await page.evaluate(() => window.__firecrewTest.tankSpy())
ok(tspy.stage === 1 && tspy.fired && tspy.fired.kind === 'low' && /TANK LOW/.test(tspy.msg)
    && tspy.alarm.kind === 'low' && tspy.lowAt === 30,
    'the LOW crossing fires the caution chirp and names the cure on the card', JSON.stringify(tspy))
await page.evaluate(() => window.__firecrewTest.tankForce(0))
await nap(500)
tspy = await page.evaluate(() => window.__firecrewTest.tankSpy())
ok(tspy.stage === 2 && tspy.fired && tspy.fired.kind === 'dry' && /TANK EMPTY/.test(tspy.msg)
    && tspy.alarm.kind === 'dry',
    'the DRY crossing clunks the dry valve and says NO REACH', JSON.stringify(tspy))
await page.keyboard.down('Space')
await nap(420)
await page.keyboard.up('Space')
tspy = await page.evaluate(() => window.__firecrewTest.tankSpy())
ok(tspy.fired && tspy.fired.held === true && tspy.fired.kind === 'dry',
    'a hand holding SOAK over an empty line gets the held dry-valve clunk — not silence', JSON.stringify(tspy.fired))
// seated: the ear shuts. WATCH takes the pump; a forced drain names nothing.
await press('KeyY')
await nap(250)
await page.waitForFunction(() => window.__firecrewTest.tankSpy().msgT === 0, { timeout: 4000 }) // let the pre-seat card expire first
await page.evaluate(() => window.__firecrewTest.tankForce(25))
await nap(600)
tspy = await page.evaluate(() => window.__firecrewTest.tankSpy())
ok(tspy.human === false && tspy.fired === null && tspy.msgT === 0,
    'seated WATCH forces silent — an idle hand is never scolded', JSON.stringify(tspy))
await press('ArrowRight') // driving key takes the seat back
await nap(250)
await page.evaluate(() => window.__firecrewTest.tankForce(20))
await nap(500)
tspy = await page.evaluate(() => window.__firecrewTest.tankSpy())
ok(tspy.human && tspy.fired && tspy.fired.kind === 'low',
    'back in hand, the next fall names itself again — every crossing spoken once', JSON.stringify(tspy.fired))

// #2994 — voices in the smoke on real ticks. The doorway band is lit (lightAt
// is 1 on the street), so the hose must walk IN first; then a parked hidden
// voice cries on the cadence and the arrival names it, out of the carry nothing
// sounds, and a seated WATCH keeps its ears shut until the wheel comes back.
await page.evaluate(() => window.__firecrewTest.start(77, 1))
await page.waitForFunction(() => window.__firecrewTest.screen() === 'play', { timeout: 8000 })
await nap(400)
await page.keyboard.down('ArrowUp')
const walkedIn = await page.waitForFunction(() => {
    const p = window.__firecrewTest.probe()
    return p && p.cy <= 12
}, { timeout: 8000 }).then(() => true).catch(() => false)
await page.keyboard.up('ArrowUp')
ok(walkedIn, 'cry-leg: the hose walks in from the lit doorway — the audible band lives in the dark')
await nap(150)
let cspy = await page.evaluate(() => window.__firecrewTest.cryForce(4))
ok(cspy && cspy.dist !== null && cspy.dist <= 5 && cspy.human && cspy.voice,
    'cryForce parks a still-hidden voice inside one carried call on a live shift', JSON.stringify(cspy))
await nap(800)
cspy = await page.evaluate(() => window.__firecrewTest.crySpy())
ok(cspy.fired && cspy.fired.dist >= 1 && cspy.fired.dist <= 5 && cspy.fired.vol > 0,
    'a hidden voice within reach cries on the cadence — heard though unseen', JSON.stringify(cspy.fired))
ok(/SOMEONE'S IN THERE - LISTEN/.test(cspy.msg) && cspy.cried >= 1,
    'the arrival names the new voice once on the card', JSON.stringify({ msg: cspy.msg, cried: cspy.cried }))
await page.evaluate(() => window.__firecrewTest.cryForce(9))
await nap(800)
cspy = await page.evaluate(() => window.__firecrewTest.crySpy())
ok(cspy.nearest === null && cspy.fired === null,
    'out of the carry, silence — the cry never telegraphs across the house', JSON.stringify(cspy))
await press('KeyY') // seat the watcher: hands off, ears off (#2989 law)
await nap(250)
await page.waitForFunction(() => window.__firecrewTest.crySpy().msgT === 0, { timeout: 4000 }) // stale card must decay first
await page.evaluate(() => window.__firecrewTest.cryForce(4))
await nap(800)
cspy = await page.evaluate(() => window.__firecrewTest.crySpy())
ok(cspy.nearest === null && cspy.fired === null && cspy.cried === 0,
    'seated WATCH hears nothing — a parked voice stays unnamed while the autopilot has the wheel', JSON.stringify(cspy))
await press('ArrowRight') // driving key takes the seat back
await nap(250)
await page.evaluate(() => window.__firecrewTest.cryForce(4))
await nap(800)
cspy = await page.evaluate(() => window.__firecrewTest.crySpy())
ok(cspy.nearest && cspy.fired && cspy.fired.dist <= 5,
    'back in hand, the ear reopens — the released seat hears the lost again', JSON.stringify({ fired: cspy.fired, nearest: cspy.nearest }))

ok(errors.length === 0, 'zero page errors across the whole drive', errors.slice(0, 3).join(' | '))
console.log(`\n${fails ? 'FAILED' : 'DRIVE GREEN'} — ${fails ? fails + ' failures' : 'start, play, pause, contract, die, restart'}`)
await browser.close()
process.exit(fails ? 1 : 0)
