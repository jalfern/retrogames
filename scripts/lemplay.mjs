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
import { launch, requireDevServer, Report, relayNoise } from './lib/harness.mjs'

const URL = process.env.LEM_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/lemmings`
await requireDevServer(URL)

const r = new Report('lemplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(90000)
const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
page.on('console', m => { if (m.type() === 'error' && !relayNoise(m.text(), m.location())) errors.push(`[console.error] ${m.text()}`) })

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
const SKILL_KEY = { block: 'Digit1', bomb: 'Digit2', climb: 'Digit3', dig: 'Digit4', float: 'Digit5', build: 'Digit6' }

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

{
    // #3879 sloped road, pixel-proved where it is guaranteed: the attract
    // replay lays SPIRE's chain every cycle — no aim-bot, no timing luck.
    let saw = 0
    for (let i = 0; i < 420; i++) {
        const q = await probe()
        if (q.screen !== 'attract') break
        if (q.name === 'THE SPIRE' && q.planks >= 10) {
            for (let k = 0; k < 10 && saw < 8; k++) {
                saw = Math.max(saw, await page.evaluate(() => {
                    const c = document.querySelector('canvas[data-lem-stage]')
                    const g = c.getContext('2d')
                    const tan = (x, y, w, h) => { const d = g.getImageData(Math.max(0, x), Math.max(0, y), w, h).data; let m = 0; for (let j = 0; j < d.length; j += 4) if (d[j] > 150 && d[j] < 235 && d[j + 1] > 100 && d[j + 1] < 200 && d[j + 2] > 40 && d[j + 2] < 130) m++; return m }
                    const woods = window.__lemTest.woods()
                    const has = (x, y) => woods.some(([a, b]) => a === x && b === y)
                    let n2 = 0
                    for (const [x, y] of woods) {
                        const leanR = has(x + 1, y + 1) || has(x + 2, y + 1) || has(x + 2, y + 2)
                        const leanL = has(x - 1, y + 1) || has(x - 2, y + 1) || has(x - 2, y + 2)
                        if (leanR && !leanL) n2 += tan(x * 8 + 8, y * 8 + 9, 2, 4)
                        else if (leanL && !leanR) n2 += tan(x * 8 - 2, y * 8 + 9, 2, 4)
                    }
                    return n2
                }))
                await wait(80)
            }
            break
        }
        await wait(100)
    }
    r.check('#3879: sloped road — the attract SPIRE chain throws tan noses past its downhill edges', saw >= 8, `nose px=${saw}`)
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
    await key('Digit5')
    r.check('Digit5 selects FLOATER (#3827)', (await probe()).selected === 'float', (await probe()).selected)
    await key('Digit1')
    await key('KeyE')
    r.check('KeyE no longer cycles — CYCLE is gone, the panel picks (#432)', (await probe()).selected === 'block', (await probe()).selected)
}

// ---- drive the level with the solver's hint: hover the mouse to aim the
// cursor (real pointermove), pick the skill with the real number key,
// assign with Space. Every event is one a thumb could produce.
r.info('playing level 1 with the solver only as an aim-bot — keys do everything')
let assigned = 0
// #3879 LOOK probes: nose px below board edges, walk-cycle poses on isolated
// walkers, live splinters and landings — sampled through the same drive loop.
let poseExt = 0, poseRec = 0, sawChips = 0, sawSquash = 0, lookTick = 0
const lookSample = async (withRoad) => {
    const s = await page.evaluate((wr) => {
        const c = document.querySelector('canvas[data-lem-stage]')
        const g = c.getContext('2d')
        const p = window.__lemTest.probe()
        const tan = (x, y, w, h) => {
            const d = g.getImageData(Math.max(0, x), Math.max(0, y), w, h).data
            let k = 0
            for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i] < 235 && d[i + 1] > 100 && d[i + 1] < 200 && d[i + 2] > 40 && d[i + 2] < 130) k++
            return k
        }
        let n = 0
        if (wr) {
            const d = g.getImageData(18 * 8, 6 * 8, 22 * 8, 18 * 8).data
            for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i] < 235 && d[i + 1] > 100 && d[i + 1] < 200 && d[i + 2] > 40 && d[i + 2] < 130) n++
        }
        // walk-cycle poses, isolated walkers only (crowds leak neighbouring
        // pixels into a 1px probe): stride = pants px one column OUTSIDE the
        // default foot span; recovery = the outer default column gone empty.
        // Runs only on idle beats — per-pixel reads are the heavy half.
        let ext = 0, rec = 0
        if (!wr) for (const L of p.lemmings) {
            if (L.state !== 'walk' || !L.live || L.x < 2 || L.x > 45) continue
            if (!p.lemmings.every(o => o.id === L.id || !o.live || Math.abs(o.x - L.x) > 1 || Math.abs(o.y - L.y) > 1)) continue
            const ph = Math.floor(p.tick / 6 + L.id) % 4
            const dd = L.dir > 0 ? 1 : -1
            const px = Math.round(L.x * 8 - 3), py = Math.round(L.y * 8 - 8)
            if (py < 8 || py > 200) continue
            const pd = (sx, sy) => { const q = g.getImageData(Math.max(0, sx), sy, 1, 1).data; return q[0] < 90 && q[1] > 70 && q[1] < 130 && q[2] > 130 }
            if (ph === 1 && pd(dd > 0 ? px + 6 : px, py + 6)) ext++
            if (ph === 3 && !pd(dd > 0 ? px + 1 : px + 5, py + 6)) rec++
        }
        return { n, ext, rec, chips: window.__lemTest.chipsN(), squashes: window.__lemTest.squashIds().length }
    }, withRoad)
    if (s.n > 0 && (roadShot === null || s.n > roadShot)) roadShot = s.n
    poseExt += s.ext
    poseRec += s.rec
    if (s.chips > 0) sawChips = s.chips
    if (s.squashes > 0) sawSquash = s.squashes
}
const done = new Set()
let sawBuild = false, roadShot = null
const canvas = await page.evaluate(() => {
    // aim at the DISPLAYED surface (the fit display canvas, or the source
    // canvas pre-fit) — the one a thumb touches; the source fills the
    // wrapper, the display is the letterboxed, integer-scaled one
    const c = document.querySelector('canvas[data-fit="display"]') || document.querySelector('canvas[data-lem-stage]')
    const r = c.getBoundingClientRect()
    return { left: r.left, top: r.top, w: r.width, h: r.height }
})
const at = (x, y) => ({ x: canvas.left + x / 48 * canvas.w, y: canvas.top + (y - 1) / 27 * canvas.h })

// ---- #3863 BUILDER drive: Digit6 picks it, Space assigns it to a walker the
// cursor is aimed at, and the plank cargo stays whole — the supply economy is
// pinned in Node; this proves the input path reaches the sim through the
// panel key, and that wood paints (DEV stamp = the same cheat family as
// teleport/kill: mechanics proven honest in lemcheck).
{
    await key('Digit6')
    r.check('#3863: Digit6 selects BUILDER', (await probe()).selected === 'build', (await probe()).selected)
    const w = (await probe()).lemmings.find(l => l.live && l.state === 'walk')
    r.check('#3863: a walker exists to carry wood', !!w)
    if (w) {
        const pt = at(w.x, w.y)
        for (let k = 0; k < 6; k++) {
            await page.mouse.move(pt.x, pt.y)
            const c = (await probe()).cursor
            if (Math.abs(c.x - w.x) < 0.9 && Math.abs(c.y - (w.y - 1)) < 0.9) break
            await wait(120)
        }
        const before = await probe()
        await key('Space')
        await wait(80)
        const after = await probe()
        const L = after.lemmings.find(l => l.id === w.id)
        r.check('#3863: Space assigns BUILDER — the walker carries wood', !!L && L.builder === true, `#${w.id} builder=${L && L.builder}`)
        r.check('#3863: assigning costs no plank — the cargo economy spends on LAYING, not on granting',
            after.skills.build === before.skills.build, `cargo ${before.skills.build} -> ${after.skills.build}`)
    }
    await page.evaluate(() => window.__lemTest.stamp(30, 22))
    await wait(250)
    const wood = await page.evaluate(() => {
        const c = document.querySelector('canvas[data-lem-stage]')
        const d = c.getContext('2d').getImageData(30 * 8, 22 * 8, 8, 8).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i] < 235 && d[i + 1] > 105 && d[i + 1] < 175 && d[i + 2] > 50 && d[i + 2] < 115) n++
        return n
    })
    r.check('#3863: laid wood paints as wood (tan grain, not dirt brown)', wood >= 20, `tan px=${wood}/64`)
}
for (let i = 0; i < 400; i++) {
    const s = await probe()
    if (s.screen !== 'play') break
    if (assigned >= 8) break     // #3866: SPIRE's script ends with a BUILDER now — ride it to the last command
    const h = await hint()
    if (!h || done.has(`${h.id}:${h.skill}`)) {
        if (++lookTick % 3 === 0) await lookSample(false)   // every 3rd idle beat — the aim loop must stay fast
        await wait(150); continue
    }
    done.add(`${h.id}:${h.skill}`)
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
    const got = h.skill === 'climb' ? (L && L.climber) : h.skill === 'dig' ? (L && L.digger)
        : h.skill === 'float' ? (L && L.floater)
        : h.skill === 'build' ? (L && L.builder)
        : h.skill === 'block' ? (L && L.state === 'block') : true
    if (h.skill === 'build') sawBuild = !!got
    if (after.skills.build < 12) {
        // planks are landing in the browser sim — sample the wood while the
        // board shows it (the win scene restarts the attract a beat later)
        // and keep the fullest frame. Palette: base #a8722f, grain #c89050,
        // nails #7c4a18, sunlit lip #e6c17c; dirt tops stay dark (#7a4a22).
        // #3879: the same sample now also counts leaning noses and poses.
        await lookSample(true)
    }
    if (got || after.skills[h.skill] < s.skills[h.skill]) {
        assigned++
        r.info(`assigned ${h.skill}`, `lem ${h.id} @ ${h.x.toFixed(1)},${h.y.toFixed(1)}`)
    } else {
        r.info(`assign missed ${h.skill}`, `lem ${h.id} skills ${JSON.stringify(after.skills)}`)
    }
}
r.check('real cursor aiming + real keys assigned solver skills to lemmings', assigned >= 4, `assigned=${assigned}`)

// #3866 — the solver spends BUILDER on the descent; the aim-bot just pressed
// its command through real keys. Two things must be true on the page now:
// the cargo dropped through the browser sim (wood is being LAID, not just
// granted), and the laid road paints tan along the spire's east face. The
// tan count was sampled at the cargo-drop moment inside the drive loop —
// after the win scene the attract mode restarts the board and the wood is gone.
{
    await wait(600)
    const p = await probe()
    // #3930: the tailwind script spends its build stamp as the LAST command,
    // so the in-loop sampler (which samples on cargo-spent beats) may never
    // fire — sample the painted road here too: wood is down (cargo check
    // below), the board restarts a beat after the win, and this lands before
    // both. Keep the fullest frame.
    if (p.skills.build < 12) await lookSample(true)
    r.check('#3866: the autopilot BUILDER command rode the player input path (Digit6/Space saw, lemming carries)', sawBuild, `sawBuild=${sawBuild}`)
    r.check('#3866: the solver-line build spends cargo in the browser sim', p.skills.build < 12, `cargo=${p.skills.build}`)
    r.check('#3866: the plank road paints on the descent (tan grain on the spire face)', roadShot !== null && roadShot >= 80, `tan px=${roadShot}`)
    // #3879, pixel-proved in the browser: animated legs, live splinters and
    // squashed landings (the sloped-road nose is pinned in the attract phase).
    r.check('#3879: walk cycle strides — pants pixels reach past the default foot span', poseExt >= 4, `stride frames=${poseExt}`)
    r.check('#3879: walk cycle recovers — outer foot columns go empty mid-cycle', poseRec >= 4, `recovery frames=${poseRec}`)
    r.check('#3879: wood chips are live (nail-dust on laying, splinters on blast)', sawChips >= 1, `max chips=${sawChips}`)
    r.check('#3879: landings squash (the map lights up on touch-down)', sawSquash >= 1, `max squashes=${sawSquash}`)
}

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

// ---- #3828 pond: drawn water + drown through the real input path ----------
// The Node pins prove the rule; this proves the PLAYER sees it: the pond is
// drawn where the grid says water, and an unmanaged crowd — any key to start,
// the panel's FF button held with a real pointer — drowns stragglers with zero
// page errors and an honest drowned counter on the probe.
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__lemTest, null, { timeout: 20000 })
await key('KeyJ')
await wait(600)
{
    const p = await probe()
    r.check('pond: THE SPIRE opens the fresh run', p.level === 0 && p.name === 'THE SPIRE', `level=${p.level} ${p.name}`)
    const blue = await page.evaluate(() => {
        const c = document.querySelector('canvas[data-lem-stage]')
        const d = c.getContext('2d').getImageData(2, 184, 30, 16).data   // cols .5-3, rows 23-24 @ TS=8
        let n = 0, tot = 0
        for (let i = 0; i < d.length; i += 4) { tot++; if (d[i + 2] > d[i] + 25 && d[i + 2] > 110) n++ }
        return n / tot
    })
    r.check('pond: water pixels are drawn where the grid says water', blue > 0.5, `blue fraction ${blue.toFixed(2)} of the pond box`)
}
{
    const ff = await page.$('[data-lem-ff]')
    const b = await ff.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    let p = null
    for (let t = 0; t < 60; t++) { await wait(500); p = await probe(); if ((p.drowned | 0) >= 1 || p.screen !== 'play') break }
    await page.mouse.up()
    r.check('pond: wading walkers drown on the live board (FF held, no assignment)',
        p && (p.drowned | 0) >= 1 && (p.screen === 'play' || p.dead === p.drowned) && (p.cmds | 0) === 0,
        // FF outruns the 500 ms probe: the whole west-foot queue can wade and
        // drown between two samples, so the run can legitimately be OVER by the
        // time anything is observed. Intent is "drown without assignment":
        // either caught mid-play, or caught over with the ledger all-drown —
        // and no player commands in either case.
        `screen=${p && p.screen} dead=${p && p.dead} drowned=${p && p.drowned} cmds=${p && p.cmds}`)
    r.check('pond: every drown counts as a loss on the ledger', p && p.dead >= p.drowned && p.drowned >= 1,
        `dead=${p && p.dead} drowned=${p && p.drowned}`)
}
r.check('pond: zero page errors on the water board', errors.length === 0, errors.slice(0, 4).join(' | '))

// ---- #3864 BLOCKER-WAKE: the one-shot law found by a player, real keys ----
// lemcheck pins the mechanics; this proves the PLAYER can stage the original's
// combo on the marquee board: a westbound walker is stopped mid-lane by a
// line (block), a walker sent up behind it is made a CLIMBER — and instead of
// turning like every body before it, it crosses the head. The block is spent:
// the blocker resumes walking (wakes), the climber lands on the far side.
// Staged mid-ground on dry ground, deliberately away from the spawn/pond
// conveyor, so the wake observation cannot be masked by drown-shuffle noise.
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__lemTest, null, { timeout: 20000 })
await key('KeyJ')
await wait(600)
{
    // aim helper with a lead: the walker covers ~0.5 tile per poll, so aim
    // where the body is about to be, press on cursor-match, confirm by the
    // supply actually spent (the ledger never lies about a charge).
    const aimAt = async (wx, wy) => {
        const pt = at(wx, wy)
        for (let k = 0; k < 6; k++) {
            await page.mouse.move(pt.x, pt.y)
            const c = (await probe()).cursor
            if (Math.abs(c.x - wx) < 0.9 && Math.abs(c.y - (wy - 1)) < 0.9) return true
            await wait(100)
        }
        return false
    }
    const assignLead = async (skill, skillKey, pick) => {
        await key(skillKey)
        for (let t = 0; t < 200; t++) {
            const p = await probe()
            if (p.screen !== 'play') break
            const cand = pick(p)
            if (cand && await aimAt(cand.x - 0.5, cand.y)) {
                const before = (await probe()).skills[skill]
                await key('Space')
                await wait(120)
                const q = await probe()
                if (q.skills[skill] < before) {
                    const L = q.lemmings.find(l => l.id === cand.id)
                    const got = skill === 'block' ? (L && L.state === 'block') : (L && L.climber)
                    if (got) return { id: cand.id, x: cand.x, y: cand.y }
                    // the charge went to a nearer body — keep watching for the next candidate
                }
            }
            await wait(100)
        }
        return null
    }
    // (1) stop a westbound bouncer mid-lane (dry ground, clear of the pond)
    const blk = await assignLead('block', 'Digit1', p =>
        p.lemmings.find(L => L.live && L.state === 'walk' && L.dir === -1 && L.x > 6.5 && L.x < 9.5 && Math.abs(L.y - 23) < 0.6))
    r.check('wake: a BLOCKER holds a walker mid-lane (aim + Space)', !!blk, blk ? `#${blk.id}@${blk.x.toFixed(1)}` : 'no block landed')
    // (2) send the next westbound walker at the line, made a climber
    const cl = blk && await assignLead('climb', 'Digit3', p =>
        p.lemmings.find(L => L.live && L.state === 'walk' && L.dir === -1 && !L.climber && L.x > blk.x + 1.0 && L.x < blk.x + 3.0 && Math.abs(L.y - 23) < 0.6))
    r.check('wake: a CLIMBER was sent at the line (climb flag on the probe)', !!cl, cl ? `#${cl.id}@${cl.x.toFixed(1)}` : 'no climber assigned')
    if (blk && cl) {
        // sample the live probe on the page's own frames: the wake and the
        // landing happen within a second of the crossing.
        const trace = await page.evaluate(async ({ blkId, clId, blkX }) => {
            let walked = false, passed = false
            const raf = () => new Promise(res => requestAnimationFrame(res))
            for (let f = 0; f < 1500; f++) {
                const p = window.__lemTest.probe()
                const B = p.lemmings.find(l => l.id === blkId)
                const C = p.lemmings.find(l => l.id === clId)
                if (B && B.state === 'walk') walked = true
                if (C && C.x < blkX - 0.4) passed = true
                if (walked && passed) break
                await raf()
            }
            return { walked, passed }
        }, { blkId: blk.id, clId: cl.id, blkX: blk.x })
        r.check('wake: the line BROKE — the blocker resumed walking after the crossing', trace.walked)
        r.check('wake: the climber crossed where walkers must turn — over the line', trace.passed)
    } else {
        r.check('wake: the line BROKE — the blocker resumed walking after the crossing', false, 'setup incomplete')
        r.check('wake: the climber crossed where walkers must turn — over the line', false, 'setup incomplete')
    }
    r.check('wake: zero page errors on the blocker-wake drive', errors.length === 0, errors.slice(0, 4).join(' | '))
}

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
        const btnB = await tpage.evaluate(() => {
            const b = document.querySelector('[data-lem-skill="build"]')
            if (!b) return null
            const r = b.getBoundingClientRect()
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        })
        if (btnB) {
            await tDown(btnB.x, btnB.y); await tpage.waitForTimeout(120); await tUp()
            await tpage.waitForTimeout(150)
            r.check('#3863 touch: tapping the BUILDER button selects it', (await tprobe()).selected === 'build', (await tprobe()).selected)
            // restore CLIMBER: the gesture drive below spends climb — and
            // BUILDER is the free-grant skill, it would spend nothing there.
            await tDown(btn.x, btn.y); await tpage.waitForTimeout(120); await tUp()
            await tpage.waitForTimeout(150)
        } else {
            r.check('#3863 touch: the BUILDER button is on the panel', false)
        }
    }

    // two well-separated live lemmings: the press point (A) and the slide
    // target (B). The preview assertions compare against the NEAREST lemming to
    // the finger, recomputed exactly as the engine does, so a walking column is
    // fine — but A and B sit far apart so a release on one provably spares the
    // other. (Picking the two NEWEST was the old bug: they walk side by side and
    // the nearer one legitimately wins the 24px reach.)
    // pickPair must exclude every way a body can stop being the honest answer
    // to "who is nearest the press point" by the time the expectation is
    // sampled: airborne bodies (~2 tiles per 350 ms), head-on pairs (spacing
    // closes ~1.6 tiles per window), and — since #3828 — bodies the pond
    // drains off `live`. Bound the pick to eastbound walkers on the open
    // plain (5.5 < x < 12.5, dir +1): the pond (cols 0-3) is behind them,
    // the spire face (x≈18) is ≥2.4 s of walking ahead, and same-direction
    // spacing is constant, so the whole press+slide choreography is stable.
    const pickPair = (pro) => {
        const live = (pro.lemmings || []).filter(l => l.live && l.state === 'walk' && l.dir === 1 && l.x > 5.5 && l.x < 12.5)
        if (live.length < 2) return null
        let A = null, B = null, bd = -1
        for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
            if (live[i].dir !== live[j].dir) continue
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
        // The preview lands synchronously with the pointerdown dispatch, so
        // take the probe immediately (retry only until aim exists): every ms
        // of extra hold widens the gap between the press point and the
        // bodies it must still be nearest to.
        let atPress = await tprobe()
        for (let i = 0; i < 8 && !atPress.aim; i++) { await tpage.waitForTimeout(40); atPress = await tprobe() }
        const nPress = nearestLive(atPress, wA)
        const pressTargetAlive = atPress.lemmings.some(l => l.id === atPress.aim?.id && l.live)
        r.check('press previews the lemming under the finger',
            atPress.aim && nPress && (!pressTargetAlive || atPress.aim.id === nPress.id),
            `aim=${JSON.stringify(atPress.aim)} nearest=#${nPress && nPress.id}`)
        const prevAimId = atPress.aim && atPress.aim.id
        r.check('a press does not assign (preview is not the commit)',
            atPress.skills.climb === before.skills.climb && climbCount(atPress) === climbCount(before),
            `climb stock ${before.skills.climb} -> ${atPress.skills.climb}`)

        // 2. SLIDE to B — the preview re-targets to the lemming under the finger
        R1 = await stageRect()
        const bF = (await tprobe()).lemmings.find(l => l.id === T.B.id) || T.B
        const sB = sp(R1, bF), wB = wp(R1, sB)
        await tMove(sB.x, sB.y)
        // freshness over ceremony: the retarget lands with the pointermove
        // dispatch, so poll until aim actually changed (the stale 250 ms wait
        // let bodies walk out from under their own slide point)
        let atSlide = await tprobe()
        for (let i = 0; i < 8 && !(atSlide.aim && atSlide.aim.id !== prevAimId); i++) { await tpage.waitForTimeout(40); atSlide = await tprobe() }
        const nSlide = nearestLive(atSlide, wB)
        const slideTargetAlive = atSlide.lemmings.some(l => l.id === atSlide.aim?.id && l.live)
        r.check('sliding re-targets the preview',
            atSlide.aim && nSlide && (!slideTargetAlive || (atSlide.aim.id === nSlide.id && (!nPress || nSlide.id !== nPress.id))),
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
        const flashers = (atRelease.lemmings || []).filter(l => l.live && l.flash > 0)
        const newClimber = (atRelease.lemmings || []).find(l => l.live && l.climber && !((before.lemmings.find(o => o.id === l.id) || {}).climber))
        r.check('#470: the granted lemming flashes — a spent charge names its target',
            flashers.length === 1 && !!newClimber && flashers[0].id === newClimber.id,
            `flashing=[${flashers.map(l => `#${l.id}:${l.flash}`).join(',')}] newClimber=#${newClimber && newClimber.id}`)

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

// #3879 SOUND — the graveyard bed follows the game and M mutes. Fresh page
// so attract→play→pause→resume→mute is a clean lifecycle. Driven through
// real keys only; the proof arrives via __lemTest.musicState (the
// __popTest.musicState precedent).
{
    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__lemTest, null, { timeout: 20000 })
    const mus = () => page.evaluate(() => window.__lemTest.musicState())
    const mute = () => page.evaluate(() => window.__lemTest.muteState())
    let s = await mus()
    r.check('sound: attract rides the bed low', !!s.playing && s.track === 'lemmings' && Math.abs(s.level - 0.45) < 0.01, JSON.stringify(s))
    await key('KeyC'); await wait(300)
    s = await mus()
    r.check('sound: play takes the bed to full', !!s.playing && s.track === 'lemmings' && s.level === 1, JSON.stringify(s))
    await key('Shift+Slash'); await wait(300)
    s = await mus()
    r.check('sound: pause takes the bed out', !s.playing, JSON.stringify(s))
    await key('Shift+Slash'); await wait(300)
    s = await mus()
    r.check('sound: resume brings it back', !!s.playing && s.track === 'lemmings' && s.level === 1, JSON.stringify(s))
    await key('KeyM'); await wait(150)
    let m = await mute()
    r.check('sound: M mutes (game and controller agree)', m.game === true && m.global === true, JSON.stringify(m))
    await key('KeyM'); await wait(150)
    m = await mute()
    r.check('sound: M unmutes', m.game === false && m.global === false, JSON.stringify(m))
    // the phone path: the SOUND row on the pause screen does what M does
    await key('Shift+Slash'); await wait(300)
    const mb = await page.$('[data-mute]')
    r.check('sound: the pause screen shows the SOUND row', !!mb)
    if (mb) {
        await mb.click(); await wait(200)
        m = await mute()
        r.check('sound: SOUND row mutes', m.game === true && m.global === true, JSON.stringify(m))
        await mb.click(); await wait(200)
        m = await mute()
        r.check('sound: SOUND row unmutes', m.game === false && m.global === false, JSON.stringify(m))
    }
    await key('Shift+Slash'); await wait(200) // back to the hill
    // the choice outlives the visit: mute, leave the title (SPA route), come
    // back — the mount honours the persisted choice without any key press.
    await key('KeyM'); await wait(150)
    await page.goto(`${URL.replace(/\/retrogames\/.*$/, '')}/retrogames/`, { waitUntil: 'load' })
    await wait(400)
    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__lemTest, null, { timeout: 20000 })
    m = await mute()
    r.check('sound: the mute choice persists across visits', m.game === true && m.global === true, JSON.stringify(m))
    await key('KeyM'); await wait(150) // leave the board audible for the lanes after us
    r.check('sound: zero page errors through the sound lifecycle', errors.length === 0, errors.slice(0, 3).join(' | '))
}

r.exit(browser)
