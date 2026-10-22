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

for (const p of ['stand', 'crouch', 'tuck']) {
    const { boot } = await poseProbe(p)
    const welded = ['l', 'r'].every((s) => boot[s] <= 0.06 && boot[s] >= -0.3)
    r.check(`boots stay welded to the deck in ${p}`, welded, JSON.stringify(boot))
}
const gp = await poseProbe('grab')
const reachOk = gp.grab.l && gp.grab.r && gp.grab.l.d <= 0.3 && gp.grab.r.d <= 0.3
r.check('grab pose reaches the nose-edge band (both hands)', reachOk,
    `l ${gp.grab.l?.d} r ${gp.grab.r?.d}`)
const grabWeld = ['l', 'r'].every((s) => gp.boot[s] <= 0.06)
r.check('grab pose keeps boots welded (no float)', grabWeld, JSON.stringify(gp.boot))

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

r.check('zero page errors', pageErrors === 0, String(pageErrors))
await browser.close()
r.exit()
