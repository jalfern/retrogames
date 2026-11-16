// cottage-drive (#2494): integration proof with real keys — the panel's village
// matches the Node plot byte for byte, a real-Arrow wander never lets the
// pilgrim stand on a cottage tile, and when a cottage stands open across an
// empty approach the barred door is knocked and named. Refusal mechanics
// themselves are pinned by britanniacheck (wiring + flood mutants) — this drive
// proves the LIVE build carries them.
import { readFileSync } from 'fs'
import { launchChrome } from './lib/chromeboot.mjs'
import { Report } from './lib/harness.mjs'
import { zipRead, makeWorld, findStars, isSea } from '../src/games/Britannia/britmap.js'
import { plotShrines } from '../src/games/Britannia/shrines.js'
import { plotVillage, villageTriples } from '../src/games/Britannia/village.js'

const URL = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/britannia`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await launchChrome({ channel: process.env.SHOT_CHANNEL || 'chrome', extraArgs: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
const r = new Report('cottage-drive')
const errs = []
page.on('pageerror', (e) => { if (!/AudioContext encountered an error from the audio device/i.test(String(e))) errs.push(String(e)) })

await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction('!!window.__britanniaTest', null, { timeout: 30000 })
await page.keyboard.press('ArrowUp')
await sleep(400)
r.check('walk starts', await page.evaluate(() => !!window.__britanniaTest.state().ready))

// Node-side truth
const buf = readFileSync('public/games/ultima4.jsdos')
const zip = zipRead(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const world = makeWorld(zip['WORLD.MAP'])
const terrain = (x, y) => world.get(x, y)
const { gates } = findStars(world)
const shrines = plotShrines(gates, terrain)
const village = plotVillage(gates, terrain, shrines)
const cotSet = new Set(village.map((c) => c.x + ',' + c.y))
const panel = await page.evaluate(() => window.__britanniaTest.state())
r.check('panel village byte-parity with the Node plot', JSON.stringify(panel.village) === JSON.stringify(villageTriples(village)),
    `panel ${panel.village ? panel.village.length : '-'} vs node ${village.length}`)

// real-key wander: sweep arrows around the spawn town for a beat; the pilgrim
// must never occupy a cottage tile, never board accidently (gold stays whole).
const gold0 = (await page.evaluate(() => window.__britanniaTest.state().gold))
const KEYS = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowRight']
let walkedOnCottage = null
for (const k of KEYS) {
    await page.keyboard.down(k)
    await sleep(700)
    await page.keyboard.up(k)
    await sleep(150)
    const s = await page.evaluate(() => { const t = window.__britanniaTest.state(); return { x: t.x, y: t.y, ship: t.ship } })
    if (!s.ship && cotSet.has(s.x + ',' + s.y)) { walkedOnCottage = `${s.x},${s.y}`; break }
}
r.check('a real-Arrow wander never stands on a cottage', walkedOnCottage === null, walkedOnCottage || '')
const gold1 = (await page.evaluate(() => window.__britanniaTest.state().gold))
r.check('refusals cost no gold (only the boat captain takes coin)', gold1 === gold0, `${gold0} -> ${gold1}`)

// deterministic named knock: a cottage two tiles from its gate across a free
// in-between tile (the skirt d=2 row). Teleport onto the gate, then hold the
// real key toward the door until the refusal lands. Two harness lessons ride
// here: the 3×3 gate zone re-whirls the menu on the FIRST step after a
// teleport (index.jsx finds gi within a tile), and while the menu is open the
// branch returns early — cd freezes and arrows pick rows. So Z mid-hold the
// moment the wheel is up (that sets dismissed and resumes walking), and keep
// holding until the barred door names itself.
const sanctSet = new Set(shrines.filter(Boolean).map((s) => s.x + ',' + s.y))
const st = () => page.evaluate(() => { const t = window.__britanniaTest.state(); return { x: t.x, y: t.y, gate: t.gate, knocked: t.knocked, toast: t.toastMsg } })
let knockProof = 'no d=2 axis cottage with free approach on this map'
let knockOk = false
knock: for (const c of village) {
    const g = gates[c.gi]
    const dx = Math.sign(c.x - g.x), dy = Math.sign(c.y - g.y)
    if (Math.abs(c.x - g.x) + Math.abs(c.y - g.y) !== 2 || (dx && dy)) continue
    const mx = g.x + dx, my = g.y + dy
    if (isSea(terrain(mx, my)) || cotSet.has(mx + ',' + my) || sanctSet.has(mx + ',' + my)) continue
    await page.evaluate((i) => window.__britanniaTest.teleport(i), c.gi)
    await sleep(140)
    const knocked0 = (await st()).knocked
    const k = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft' : dy === 1 ? 'ArrowDown' : 'ArrowUp'
    await page.keyboard.down(k)
    const t0 = Date.now()
    let s1 = await st()
    while (Date.now() - t0 < 5000) {
        if (s1.gate >= 0) await page.keyboard.press('KeyZ')
        if ((s1.knocked > knocked0 && s1.x === mx && s1.y === my) || (s1.x === c.x && s1.y === c.y)) break
        await sleep(60); s1 = await st()
    }
    await page.keyboard.up(k)
    if (s1.x === c.x && s1.y === c.y) { knockOk = false; knockProof = `stepped through cottage ${c.x},${c.y}!`; break knock }
    if (s1.knocked > knocked0 && s1.x === mx && s1.y === my && /barred with iron/.test(s1.toast)) {
        knockOk = true; knockProof = `gate ${g.x},${g.y} -> cottage ${c.x},${c.y}: "${s1.toast}"`; break knock
    }
    knockProof = `cottage ${c.x},${c.y}: knocked ${s1.knocked - knocked0}, toast "${s1.toast}", stood ${s1.x},${s1.y}, gate ${s1.gate}`
}
r.check('walking into a cottage draws the barred-door refusal, named', knockOk, knockProof)
r.check('zero page errors across the drive', errs.length === 0, errs.join(' | '))
await browser.close()
process.exit(r.exit())
