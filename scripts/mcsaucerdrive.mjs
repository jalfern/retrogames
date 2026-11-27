// mcsaucerdrive (#3629) — real Chrome, real mouse and keys: the wave-6 ferry
// on the live page. centipede-drive convention: centipedecheck owns the rule
// tables; this proves the browser half. The gate gets a live negative (no hull
// pixels at wave 1), then a cheat-hook lift to wave 6 (DebugKit offers the
// same jump to humans): the ferry enters, its pixels sit where the probe says,
// and a real mouse aim + Space kill pays 125 on the live board.
// #3638 adds the polish half: the attract screen shows a painted ferry (the
// ad), the ferry's cruise launches draw ORANGE trail pixels (distinct from
// ICBM red), and the kill pops juice (flash/debris) on the live board.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/missilecommand`
const rep = new Report('mcsaucerdrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: `${BASE}?seed=4242`, hook: '__mcTest', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const probe = () => page.evaluate(() => window.__mcTest.probe())

// map a game (x, y) to page client coordinates through the draw transform
const clientOf = (gx, gy) => page.evaluate(({ gx, gy }) => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvas.width / dpr / 800
    const scaleY = canvas.height / dpr / 600
    const scale = Math.min(scaleX, scaleY) * 0.95
    const transX = (canvas.width / dpr - 800 * scale) / 2
    const transY = (canvas.height / dpr - 600 * scale) / 2
    const rect = canvas.getBoundingClientRect()
    return { x: rect.left + transX + gx * scale, y: rect.top + transY + gy * scale }
}, { gx, gy })

// scan the canvas for saucer hull/dome paint around a game position
const hullAt = (gx, gy) => page.evaluate(({ gx, gy }) => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvas.width / dpr / 800
    const scaleY = canvas.height / dpr / 600
    const scale = Math.min(scaleX, scaleY) * 0.95
    const transX = (canvas.width / dpr - 800 * scale) / 2
    const transY = (canvas.height / dpr - 600 * scale) / 2
    const px = Math.round((transX + gx * scale) * dpr)
    const py = Math.round((transY + gy * scale) * dpr)
    const R = Math.round(26 * scale * dpr)
    const ctx = canvas.getContext('2d')
    const img = ctx.getImageData(px - R, py - R, R * 2, R * 2).data
    const seen = { hull: 0, dome: 0 }
    for (let i = 0; i < img.length; i += 4) {
        const r = img[i], g = img[i + 1], b = img[i + 2]
        if (r > 190 && g > 200 && b > 210 && b < 245) seen.hull++ // #d8dee8 family
        if (b > 200 && g > 170 && r < 120) seen.dome++ // #39d0ff family
    }
    return seen
}, { gx, gy })

// #3638: scan a box at a game point for cruise-trail orange (#ff9d00 —
// r>200/g~157/b~0). ICBM red has g<80, so this family can only be the
// cruise trail; the box rides mid-fall, far from the hull's warm tail flicker.
const orangeAt = (gx, gy) => page.evaluate(({ gx, gy }) => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvas.width / dpr / 800
    const scaleY = canvas.height / dpr / 600
    const scale = Math.min(scaleX, scaleY) * 0.95
    const transX = (canvas.width / dpr - 800 * scale) / 2
    const transY = (canvas.height / dpr - 600 * scale) / 2
    const px = Math.round((transX + gx * scale) * dpr)
    const py = Math.round((transY + gy * scale) * dpr)
    const R = Math.round(9 * scale * dpr)
    const ctx = canvas.getContext('2d')
    const img = ctx.getImageData(px - R, py - R, R * 2, R * 2).data
    let orange = 0
    for (let i = 0; i < img.length; i += 4) {
        const r = img[i], g = img[i + 1], b = img[i + 2]
        // orange family incl. anti-aliased composites over black (coverage can
        // dip the core to ~0.7 brightness at letterbox scale); ICBM red and
        // blast white both fail the g/b gates
        if (r > 170 && g > 95 && g < 215 && b < 90) orange++
    }
    return orange
}, { gx, gy })

// ---- #3638 attract ad: the scripted ferry crosses the attract screen ----
// ---- #3638 attract ad: the scripted ferry crosses the attract screen ----
// The attract world draws the ferry UNDER attractFrame's DIM (0.55 black), so
// the paint signature is the dim-shifted family: hull (216,222,232→~97,100,104)
// and shade (143,152,168→~64,68,76) are warm-plus-blue greys above the black
// floor; the dome (57,208,255→~26,94,115) is a cool blue with a mid green.
// The live full-brightness hullAt cannot see any of it — that is the whole
// point of a dim, and why this scan is its own helper.
const attractAt = (gx, gy) => page.evaluate(({ gx, gy }) => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvas.width / dpr / 800
    const scaleY = canvas.height / dpr / 600
    const scale = Math.min(scaleX, scaleY) * 0.95
    const transX = (canvas.width / dpr - 800 * scale) / 2
    const transY = (canvas.height / dpr - 600 * scale) / 2
    const px = Math.round((transX + gx * scale) * dpr)
    const py = Math.round((transY + gy * scale) * dpr)
    const R = Math.round(24 * scale * dpr)
    const ctx = canvas.getContext('2d')
    const img = ctx.getImageData(px - R, py - R, R * 2, R * 2).data
    const seen = { shade: 0, dome: 0 }
    for (let i = 0; i < img.length; i += 4) {
        const r = img[i], g = img[i + 1], b = img[i + 2]
        if (r > 40 && b > r + 4 && b > 45) seen.shade++ // dimmed hull/shade greys
        if (r < 40 && g > 60 && b > 90) seen.dome++ // dimmed dome cyan
    }
    return seen
}, { gx, gy })

{
    let ad = null
    for (let i = 0; i < 140 && !ad; i++) { // ≈21 s — covers two scripted sightings
        const p = await probe()
        if (p.saucers > 0 && p.saucerAt[0].x > 40 && p.saucerAt[0].x < 740) {
            const seen = await attractAt(p.saucerAt[0].x, p.saucerAt[0].y)
            if (seen.shade >= 12 || seen.dome >= 5) ad = JSON.stringify(seen)
        }
        await sleep(150)
    }
    rep.check('the attract screen advertises a ferry — painted (dimmed) and on-position (#3638)', !!ad, ad || 'none sighted')
}

// ---- attract → live ----
await page.keyboard.press('Space')
await sleep(400)
{
    const a = await probe()
    rep.check('raid is live at wave 1', a.wave === 1 && a.cities === 6 && !a.done, `w${a.wave} c${a.cities}`)
    rep.check('the sky carries no ferry below the gate (live, wave 1)', a.saucers === 0)
}
// byte-visible gate negative: nothing saucer-painted in wave 1's mid-sky
{
    const seen = await hullAt(400, 160)
    rep.check('no ferry paint on a wave-1 sky', seen.hull < 10 && seen.dome < 5, JSON.stringify(seen))
}

// ---- lift to wave 6 and wait for the ferry ----
await page.evaluate(() => window.__mcTest.toWave6())
let saucer = null
for (let i = 0; i < 80 && !saucer; i++) {
    await sleep(150)
    const p = await probe()
    if (p.saucers > 0) saucer = p.saucerAt[0]
}
rep.check('the ferry enters at wave 6 (live)', !!saucer, saucer ? `(${saucer.x},${saucer.y})` : 'never entered')
if (!saucer) { rep.exit(browser) }

// sprite matches logical state: paint sits where the probe says
await sleep(120)
{
    const p = await probe()
    const at = p.saucerAt[0]
    const seen = await hullAt(at.x, at.y)
    rep.check('the drawn hull matches the logical position (probe ↔ pixels)',
        seen.hull >= 10 || seen.dome >= 5, `at (${at.x},${at.y}) → ${JSON.stringify(seen)}`)
}

// ---- #3638 cruise launches read distinct: orange trail ≠ ICBM red ----
{
    let cr = null
    // wait for a cruise well clear of the hull (its orange tail flicker is the
    // same colour family; a mid-fall trail midpoint cannot be confused)
    for (let i = 0; i < 90 && !cr; i++) {
        const p = await probe()
        cr = (p.cruiseAt || []).find((c) => c.y - c.sy > 40) || null
        if (!cr) await sleep(150)
    }
    let orange = 0
    if (cr) {
        const tx = cr.sx + (cr.x - cr.sx) * 0.6
        const ty = cr.sy + (cr.y - cr.sy) * 0.6
        orange = await orangeAt(tx, ty)
    }
    rep.check('cruise launches draw an orange trail distinct from ICBM red (pixels, #3638)',
        orange >= 3, `${cr ? `cruise at (${cr.x},${cr.y})` : 'never launched'} orange=${orange}`)
}

// ---- real mouse aim + Space kills it for 125 ----
let killDelta = null
let juiceSeen = false
for (let i = 0; i < 12; i++) {
    const before = await probe()
    if (before.saucers === 0) break
    const s0 = before.saucerAt[0]
    // lead the ferry: ABM flight ≈ distance/15 ticks from the near silo edge
    const siloX = s0.x < 400 ? 40 : 760
    const k = Math.max(2, Math.round(Math.hypot(s0.x - siloX, s0.y - 530) / 15))
    const aimX = Math.min(780, Math.max(20, s0.x + s0.dir * s0.speed * k))
    const pt = await clientOf(aimX, s0.y)
    await page.mouse.move(pt.x, pt.y)
    await page.keyboard.press('Space')
    const t0 = Date.now()
    while (Date.now() - t0 < 1600) {
        await sleep(100)
        const now = await probe()
        if (now.juice > 0) juiceSeen = true // #3638 flash/debris ticks after the burn
        if (now.saucers === 0) { killDelta = now.score - before.score; break }
        if (now.score - before.score >= 125) { killDelta = now.score - before.score; break }
    }
    if (killDelta !== null && killDelta >= 125) break
}
rep.check('a real mouse aim + Space burns the ferry for ≥125 on the live board',
    killDelta !== null && killDelta >= 125, `delta ${killDelta}`)
rep.check('the burn pops kill juice — flash/debris on the live board (#3638)', juiceSeen)

// the raid survives the ferry wave (browser half only — not the sweep's promise)
{
    await sleep(1200)
    const p = await probe()
    rep.check('the raid continues alive after the ferry wave', !p.done && p.wave >= 6, `w${p.wave} c${p.cities} done=${p.done}`)
}
rep.check('zero page errors across the drive', errors === 0, `${errors}`)

rep.exit(browser)
