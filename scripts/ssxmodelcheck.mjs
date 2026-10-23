// ssxmodelcheck — proves the CC0 hero rider ships and poses as designed
// (#548): the GLB loads, every sim state maps to a distinct pose at
// chase-cam distance, real keys drive poses through the sim, and the game
// stays winnable with the hero rig in. Run with `npm run dev` up:
//   npm run ssxmodelcheck   (DEV_PORT overrides the port)

import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.SSX_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/ssx?lite=1`
const POSES = ['stand', 'tuck', 'crouch', 'air', 'grab', 'tumble',
    'grabFlat', 'grabIndy', 'grabMethod', 'grabSalis', 'grabNose', 'grabTail']
const NEIGHBOURS = [
    ['stand', 'crouch'], ['crouch', 'tuck'], ['tuck', 'air'],
    ['air', 'grab'], ['grab', 'tumble'], ['stand', 'air'],
    // #791 slice 6: the six named grabs read as six bodies, not one pose
    ['grabFlat', 'grabIndy'], ['grabIndy', 'grabMethod'], ['grabSalis', 'grabFlat'], ['grabNose', 'grabTail'],
]
const DIFF_MIN = 40
const SETTLE = 900

const chanDiff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0)

const r = new Report('ssxmodelcheck')
await requireDevServer(URL)
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 640 } })
let pageErrors = 0
page.on('pageerror', () => { pageErrors++ })
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__ssxTest, null, { timeout: 15000 })

const sig = () => page.evaluate(() => {
    const c = document.querySelector('canvas[data-ssx-stage]')
    const t = document.createElement('canvas')
    t.width = 40; t.height = 40
    const x = t.getContext('2d')
    // tight crop on the hero — the pack crowd (#620) must not enter the
    // pose-diff window, or rider colour noise masquerades as pose motion
    x.drawImage(c, c.width * 0.44, c.height * 0.54, c.width * 0.12, c.height * 0.26, 0, 0, 40, 40)
    const d = x.getImageData(0, 0, 40, 40).data
    const rows = new Array(40).fill(0); const cols = new Array(40).fill(0)
    for (let py = 0; py < 40; py++) {
        for (let px = 0; px < 40; px++) {
            const i = (py * 40 + px) * 4
            const g = d[i] * 0.34 + d[i + 1] * 0.5 + d[i + 2] * 0.16
            if (g < 150) { rows[py]++; cols[px]++ }
        }
    }
    return [...rows, ...cols]
})

await page.keyboard.press('ArrowRight')
// #780: the heat now opens on a summit-vista countdown — capture poses only
// once the run phase has started and the swoop has landed, or the hero sits
// 30 m away on the vista and pose diffs measure snow, not the rig.
await page.waitForFunction(() => window.__ssxTest.cam().phase === 'run', null, { timeout: 8000 }).catch(() => {})
await page.waitForTimeout(1600)

r.check('hero GLB loads (>=40 bones)', await page.waitForFunction(() => window.__ssxTest.hero().ready, null, { timeout: 15000 }).then(() => page.evaluate(() => window.__ssxTest.hero().bones)).then((n) => n >= 40).catch(() => false))

const pressQuestion = async () => {
    await page.keyboard.down('Shift')
    await page.keyboard.press('Slash')
    await page.keyboard.up('Shift')
}

await pressQuestion()
await page.waitForTimeout(400)

// On software GL the six rigs can take seconds to converge (blend lerp is
// per RENDER frame); wait-until-still beats a fixed settle at any box speed.
const settle = async () => {
    let prev = await sig()
    for (let i = 0; i < 24; i++) {
        await page.waitForTimeout(250)
        const s = await sig()
        if (chanDiff(prev, s) < 6) return s
        prev = s
    }
    return prev
}

const poseNames = {}
const pauseTick = await page.evaluate(() => window.__ssxTest.probe().tick)
const sigs = {}
for (const p of POSES) {
    await page.evaluate((n) => window.__ssxTest.setPose(n), p)
    sigs[p] = await settle()
    poseNames[p] = await page.evaluate(() => window.__ssxTest.hero().pose)
}
await page.evaluate(() => window.__ssxTest.setPose('stand'))
const standB = await settle()
for (const p of POSES) r.check(`pose override "${p}" reaches hero`, poseNames[p] === p, poseNames[p])

const same = chanDiff(sigs.stand, standB)
r.check('paused during pose capture (tick frozen)', (await page.evaluate(() => window.__ssxTest.probe().tick)) === pauseTick)
r.check('paused scene is stable (same-pose diff small)', same < 8, same.toFixed(2))

for (const [a, b] of NEIGHBOURS) {
    const d = chanDiff(sigs[a], sigs[b])
    r.check(`poses ${a} vs ${b} distinct`, d > DIFF_MIN, `diff ${d.toFixed(1)}`)
}

await pressQuestion()
await page.evaluate(() => window.__ssxTest.setPose(null))
await page.waitForFunction(() => window.__ssxTest.probe().tick > 300, null, { timeout: 15000 })
await page.waitForTimeout(200)

await page.keyboard.down('ArrowUp')
await page.waitForTimeout(600)
const tk = await page.evaluate(() => ({ p: window.__ssxTest.probe().p.tuck, h: window.__ssxTest.hero().pose }))
r.check('real ArrowUp -> sim tuck -> hero tuck', tk.p === true && tk.h === 'tuck', JSON.stringify(tk))
await page.keyboard.up('ArrowUp')

await page.keyboard.down('Space')
await page.waitForTimeout(350)
const cr = await page.evaluate(() => ({ h: window.__ssxTest.hero().pose }))
r.check('real Space charge -> hero crouch', cr.h === 'crouch', JSON.stringify(cr))
await page.keyboard.up('Space')

const t0 = await page.evaluate(() => window.__ssxTest.probe().tick)
await page.waitForTimeout(500)
const t1 = await page.evaluate(() => window.__ssxTest.probe().tick)
r.check('sim still runs with hero rig', t1 > t0, `${t0} -> ${t1}`)

// #620: the CPU field — five more rigged bodies, posed by the same pipeline.
const packOk = await page.waitForFunction(
    () => window.__ssxTest.riders().every((x) => x.hero === 1), null, { timeout: 20000 },
).then(() => true).catch(() => false)
const pack = await page.evaluate(() => window.__ssxTest.riders())
r.check('all six riders load real rigs', packOk, JSON.stringify(pack.map((x) => x.hero)))
r.check('every pack rig carries the full skeleton', pack.every((x) => x.bones >= 40), JSON.stringify(pack.map((x) => x.bones)))
await page.evaluate(() => window.__ssxTest.setPose('tuck'))
await page.waitForTimeout(SETTLE)
const posed = await page.evaluate(() => window.__ssxTest.riders())
r.check('pose override reaches all six riders', posed.every((x) => x.pose === 'tuck'), JSON.stringify(posed.map((x) => x.pose)))
await page.evaluate(() => window.__ssxTest.setPose(null))
const fps = await page.evaluate(() => window.__ssxTest.fps())
r.check('six skinned riders hold a renderable frame rate (>= 8 fps under software GL)', fps >= 8, `${fps} fps`)

const prog = await page.evaluate(() => window.__ssxTest.prognose())
r.check('race still winnable with hero rider', String(prog).startsWith('WINNABLE'), String(prog))

// #615 rider polish: grab depth, boot weld, Idle breath, per-rider liveries,
// per-theme contact shadow. Bone keys must be the GLTF-sanitised runtime names
// ("foot.l" -> "footl"): dotted keys were silently no-op offsets once.
const dotted = await page.evaluate(() => window.__ssxTest.boneNames().filter((k) => k.includes('.')))
r.check('hero bone keys carry no dots (GLTF sanitised)', dotted.length === 0, JSON.stringify(dotted))

await pressQuestion()
await page.waitForTimeout(300)

const poseProbe = async (p) => {
    await page.evaluate((n) => window.__ssxTest.setPose(n), p)
    let prev = null
    for (let i = 0; i < 28; i++) {
        await page.waitForTimeout(250)
        const g = await page.evaluate(() => JSON.stringify(window.__ssxTest.grabReach()))
        if (prev === g) break
        prev = g
    }
    return {
        grab: await page.evaluate(() => window.__ssxTest.grabReach()),
        boot: await page.evaluate(() => window.__ssxTest.bootClear()),
    }
}

// #883: the ankle IK solves the weld per frame, so every hero pose must keep
// the boots on the deck — not just the four the old gate measured. Tumble is
// exempt: a crash peeling the feet off the board is the point.
for (const p of POSES.filter((x) => x !== 'tumble')) {
    const { boot } = await poseProbe(p)
    const welded = ['l', 'r'].every((s) => boot[s] <= 0.02 && boot[s] >= -0.06)
    r.check(`boots stay welded to the deck in ${p}`, welded, JSON.stringify(boot))
}
const gp = await poseProbe('grab')
const reachOk = gp.grab.l && gp.grab.r && gp.grab.l.d <= 0.3 && gp.grab.r.d <= 0.3
r.check('grab pose reaches the nose-edge band (both hands)', reachOk,
    `l ${gp.grab.l?.d} r ${gp.grab.r?.d}`)

const breath = await page.evaluate(() => window.__ssxTest.standBreath())
r.check('stand pose breathes (Idle ring moves the rig)', breath !== null && breath >= 0.015, String(breath))

const boards = await page.evaluate(() => window.__ssxTest.boardInfo())
r.check('all six boards carry a livery decal', boards.every((b) => b.decal === true), JSON.stringify(boards.map((b) => b.decal)))
r.check('board bib numbers are unique per rider', new Set(boards.map((b) => b.num)).size === 6, JSON.stringify(boards.map((b) => b.num)))

const shadowBy = {}
for (const t of ['day', 'night', 'dusk']) {
    await page.evaluate((th) => window.__ssxTest.setTheme(th), t)
    await page.waitForTimeout(400)
    shadowBy[t] = await page.evaluate(() => window.__ssxTest.shadowInfo())
}
await page.evaluate(() => window.__ssxTest.setTheme('day'))
r.check('contact shadow colour is per-theme', new Set(['day', 'night', 'dusk'].map((t) => shadowBy[t].color)).size === 3,
    JSON.stringify(shadowBy))
r.check('night contact shadow is darker than day', shadowBy.night.base > shadowBy.day.base,
    `night ${shadowBy.night.base} vs day ${shadowBy.day.base}`)

// ---- #844: touch trick-pad + wipeout scene (fresh page, pad forced on) ----
const page2 = await browser.newPage({ viewport: { width: 480, height: 800 } })
page2.on('pageerror', () => { pageErrors++ })
await page2.goto(`${URL}&touchpad=1`, { waitUntil: 'load' })
await page2.waitForFunction(() => !!window.__ssxTest, null, { timeout: 15000 })
r.check('touch trick-pad layer mounts (?touchpad=1)', await page2.evaluate(() => window.__ssxTest.touchpad()))
await page2.keyboard.press('ArrowRight')
await page2.waitForFunction(() => window.__ssxTest.cam().phase === 'run', null, { timeout: 10000 }).catch(() => {})
await page2.waitForTimeout(1200)
const trBtns = await page2.evaluate(() => Array.from(document.querySelectorAll('[data-ssx-trick]')).map((b) => b.dataset.ssxTrick))
r.check('pad carries GRAB/FLIP/FRNT/INV trick buttons', trBtns.join(',') === 'KeyX,KeyZ,KeyC,KeyV', trBtns.join(','))

const btnBox = async (code) => page2.evaluate((c) => {
    const b = document.querySelector(`[data-ssx-trick="${c}"]`)
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}, code)

const grabBtn = await btnBox('KeyX')
const flipBtn = await btnBox('KeyZ')
const frontBtn = await btnBox('KeyC')
const invBtn = await btnBox('KeyV')
r.check('trick buttons are on-screen', !!(grabBtn && flipBtn && frontBtn && invBtn),
    JSON.stringify({ grabBtn, flipBtn, frontBtn, invBtn }))

if (grabBtn) {
    await page2.mouse.move(grabBtn.x, grabBtn.y)
    await page2.mouse.down()
    const held = await page2.evaluate(() => window.__ssxTest.keys.has('KeyX'))
    await page2.mouse.up()
    const rel = await page2.evaluate(() => window.__ssxTest.keys.has('KeyX'))
    r.check('GRAB button press reaches the held-key set', held && !rel, `${held}/${rel}`)
}
if (flipBtn) {
    await page2.mouse.move(flipBtn.x, flipBtn.y)
    await page2.mouse.down()
    const held = await page2.evaluate(() => window.__ssxTest.keys.has('KeyZ'))
    await page2.mouse.up()
    const rel = await page2.evaluate(() => window.__ssxTest.keys.has('KeyZ'))
    r.check('FLIP button press reaches the held-key set', held && !rel, `${held}/${rel}`)
}
if (frontBtn) {
    await page2.mouse.move(frontBtn.x, frontBtn.y)
    await page2.mouse.down()
    const held = await page2.evaluate(() => window.__ssxTest.keys.has('KeyC'))
    await page2.mouse.up()
    const rel = await page2.evaluate(() => window.__ssxTest.keys.has('KeyC'))
    r.check('FRNT (front-flip) button press reaches the held-key set', held && !rel, `${held}/${rel}`)
}

// mid-air: GRAB button latches a real grab in the sim; INV then rolls the
// board (the grab stays latched after the button lifts, exactly as on keys).
// NOTE the probe's grab field swap: p.grabKind carries the latch (r.grab),
// p.grab carries the kind — read grabKind/grabName for "grabbed".
const airTrick = async () => {
    await page2.evaluate(() => { window.__ssxTest.keys.delete('KeyX'); window.__ssxTest.keys.delete('KeyV') })
    await page2.keyboard.down('Space')
    await page2.waitForTimeout(600)
    await page2.keyboard.up('Space')
    if (!grabBtn || !invBtn) return null
    await page2.mouse.move(grabBtn.x, grabBtn.y)
    await page2.mouse.down()
    await page2.waitForTimeout(100)
    const g1 = await page2.evaluate(() => window.__ssxTest.probe().p)
    await page2.mouse.up()
    await page2.mouse.move(invBtn.x, invBtn.y)
    await page2.mouse.down()
    await page2.waitForTimeout(150)
    const g2 = await page2.evaluate(() => window.__ssxTest.probe().p)
    await page2.mouse.up()
    return { g1, g2 }
}
let air = null
for (let i = 0; i < 3 && !(air && air.g1.air && air.g1.grabKind === 1 && Math.abs(air.g2.invert) > 1); i++) {
    air = await airTrick()
    if (!air) break
    await page2.waitForTimeout(300)
}
r.check('mid-air GRAB button banks a grab in the sim', !!(air && air.g1.air && air.g1.grabKind === 1 && air.g1.grabName),
    JSON.stringify(air && { air: air.g1.air, grabKind: air.g1.grabKind, grabName: air.g1.grabName }))
r.check('INV button rolls the board (invert) after the grab', !!(air && Math.abs(air.g2.invert) > 1),
    air ? String(air.g2.invert.toFixed(1)) : 'no air')

// #871: the FRNT touch button must drive a real FRONT-flip — the held-key set
// is only half the proof; mid-air it must rotate the flip ledger NEGATIVE (the
// sim's front direction, sim.js flip=2), where the backflip button gives positive.
const frontFlip = async () => {
    await page2.evaluate(() => { window.__ssxTest.keys.delete('KeyC'); window.__ssxTest.keys.delete('KeyZ') })
    await page2.keyboard.down('Space')
    await page2.waitForTimeout(500)
    await page2.keyboard.up('Space')
    if (!frontBtn) return null
    await page2.mouse.move(frontBtn.x, frontBtn.y)
    await page2.mouse.down()
    await page2.waitForTimeout(120)
    const f = await page2.evaluate(() => window.__ssxTest.probe().p)
    await page2.mouse.up()
    return f
}
let front = null
for (let i = 0; i < 3 && !(front && front.air && front.flip < -20); i++) {
    front = await frontFlip()
    if (!front) break
    await page2.waitForTimeout(250)
}
r.check('FRNT button mid-air banks a FRONT-flip (flip ledger goes negative)',
    !!(front && front.air && front.flip < -20),
    front ? `air ${front.air} flip ${front.flip.toFixed(0)}` : 'no air')

// wipeout: shove the rider past the valley-wall line — the crash must throw a
// spray blast and tear the board off (debris), not just freeze the rider.
const crashes0 = await page2.evaluate(() => window.__ssxTest.probe().p.crashes)
await page2.evaluate(() => window.__ssxTest.nudgeWall())
let wDebris = 0; let wSpray = 0; let wCrashes = crashes0
for (let i = 0; i < 12 && !(wDebris >= 1 && wCrashes > crashes0); i++) {
    await page2.waitForTimeout(300)
    const w = await page2.evaluate(() => ({ w: window.__ssxTest.wipeout(), c: window.__ssxTest.probe().p.crashes }))
    wDebris = Math.max(wDebris, w.w.debris)
    wSpray = Math.max(wSpray, w.w.spray)
    wCrashes = Math.max(wCrashes, w.c)
}
r.check('wall crash bumps the crash ledger', wCrashes > crashes0, `${crashes0} -> ${wCrashes}`)
r.check('wipeout tears the board off (debris flies)', wDebris >= 1, String(wDebris))
r.check('wipeout throws a snow blast (live spray particles)', wSpray >= 12, String(wSpray))

r.check('zero page errors', pageErrors === 0, String(pageErrors))
await page.close()
await page2.close()
await browser.close()
r.exit()
