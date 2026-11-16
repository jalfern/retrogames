// BOULDER DASH — Chrome plays a cave with NOTHING but real key/tap events.
//
//   npm run dashplay     (needs `npm run dev`)
//
// The caves and their engine rules are proven in Node (dashcheck); this is the
// other half: the INPUT path and the render loop. The driver READS state
// through the DEV probe (read-only) and only ever ACTS through page.keyboard /
// page.mouse — the same events a thumb on the virtual pad dispatches. The
// `hint()` probe says which arrow the proven planner would press next; the
// driver still has to send a real arrow key for it to move. It then proves the
// win, the crush-death (the CA, not a scripted flag), and the restart.
import { launch, requireDevServer, Report, relayNoise } from './lib/harness.mjs'

const URL = process.env.DASH_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/boulder-dash`
await requireDevServer(URL)

const r = new Report('dashplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(90000)
const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))
page.on('console', m => { if (m.type() === 'error' && !relayNoise(m.text(), m.location())) errors.push(`[console.error] ${m.text()}`) })

const probe = () => page.evaluate(() => window.__dashTest.probe())
const hint = () => page.evaluate(() => window.__dashTest.hint())
const crush = () => page.evaluate(() => window.__dashTest.crush())
const px = () => page.evaluate(() => {
    const c = document.querySelector('canvas[data-dash-stage]')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let sum = 0, n = 0
    for (let i = 0; i < d.length; i += 997) { sum += d[i] + d[i + 1] + d[i + 2]; n++ }
    return sum / n
})
const wait = ms => page.waitForTimeout(ms)
const key = k => page.keyboard.press(k)

await page.goto(URL, { waitUntil: 'load' })
try {
    await page.waitForFunction(() => !!window.__dashTest, null, { timeout: 25000 })
} catch {
    r.check('DEV hook exists', false, 'window.__dashTest never appeared (dev server? /boulder-dash route?)')
    r.exit(browser)
}
r.check('DEV hook exists', true)
await wait(1200)

// ---- attract: the proven route is already playing itself ----
{
    const a = await probe()
    r.check('opens in attract mode', a.screen === 'attract', `screen=${a.screen}`)
    const gemsUpfront = a.gems
    const p = await px()
    r.check('the cave is painted, not black', p > 25, `mean=${p.toFixed(1)}`)
    const t0 = a.t
    await wait(700)
    const b = await probe()
    r.check('the attract sim is live (clock + gems moving)', b.t > t0 || b.have > a.have, `t ${t0.toFixed(1)} -> ${b.t.toFixed(1)} have ${a.have}->${b.have}`)
    r.info('attract cave', `${a.name}: ${gemsUpfront} gems on the board`)
}

// ---- a real key leaves attract and starts a clean run ----
await key('KeyX')
await wait(300)
{
    const a = await probe()
    r.check('a real key starts the run fresh (score + gems reset)', a.screen === 'play' && a.score === 0 && a.have === 0, `screen=${a.screen} score=${a.score} have=${a.have}`)
}

// ---- real arrows dig and move the digger; the painted frame follows ----
{
    const before = await probe()
    const p0 = await px()
    const dir = await hint()
    await key(dir || 'ArrowRight')
    await wait(160)
    const after = await probe()
    const moved = after.player.x !== before.player.x || after.player.y !== before.player.y
    r.check('a real arrow moves the digger one cell', moved, `(${before.player.x},${before.player.y}) -> (${after.player.x},${after.player.y}) [${dir}]`)
    const p1 = await px()
    r.check('the frame changes with the move', Math.abs(p1 - p0) > 0.05, `${p0.toFixed(1)} -> ${p1.toFixed(1)}`)
}

// ---- collect the quota: the driver presses the planner's arrows; gems drop off the board ----
const gems0 = (await probe()).gems
const need0 = (await probe()).need
r.info('digging for the quota', `need ${need0} gems, ${gems0} on the board`)
let assignedTries = 0
for (let i = 0; i < 1600; i++) {
    const s = await probe()
    if (s.screen !== 'play') break
    if (s.have >= s.need) break
    const d = await hint()
    if (!d) { await wait(120); continue }
    await key(d)
    assignedTries++
    await wait(55)
}
{
    const s = await probe()
    r.check('real arrows gathered the gem quota', s.have >= s.need, `have ${s.have}/${s.need} over ${assignedTries} arrow presses`)
    r.check('the board visibly lost the gems it collected', s.gems < gems0, `gems ${gems0} -> ${s.gems}`)
    r.check('score tracked the gems (score > 0)', s.score > 0, `score=${s.score}`)
}

// ---- reach the exit, still with real arrows only ----
let reached = null
for (let i = 0; i < 1200; i++) {
    const s = await probe()
    if (s.screen !== 'play') { reached = s; break }
    const d = await hint()
    if (d) await key(d)
    await wait(55)
}
reached = reached || await probe()
r.check('the run ENDS on the ledger (exit reached, quota met)', reached.screen === 'over' && reached.win, `screen=${reached.screen} win=${reached.win} have=${reached.have}/${reached.need}`)
{
    const s = await probe()
    const dom = await page.evaluate(() => document.body.textContent.includes('DEEP DIGGERS'))
    r.check('the scoreboard rendered the finished run', dom, `board=${(s.board || []).length}`)
    const domGems = await page.evaluate(() => {
        const el = [...document.querySelectorAll('span')].find(x => /\/\d+$/.test(x.textContent.trim()) && x.className.includes('text-cyan-300'))
        return el ? el.textContent.trim() : null
    })
    r.check('HUD GEM counter matches the sim at the end', domGems === `${s.have}/${s.need}`, `dom=${domGems} sim=${s.have}/${s.need}`)
}

// ---- restart, then get crushed for real and restart again ----
await wait(1200)
await key('KeyJ')
await wait(400)
r.check('a key returns to attract', (await probe()).screen === 'attract')
await key('KeyK')
await wait(300)
r.check('another key starts a fresh play (clock reset)', (await probe()).screen === 'play' && (await probe()).tick < 400)
{
    const cr = await crush()
    r.check('the crush rig loosened a boulder (setup only)', cr === true, `crush()=${cr}`)
    let dead = null
    for (let i = 0; i < 40; i++) {
        const s = await probe()
        if (s.screen === 'over' || !s.player.alive) { dead = s; break }
        await wait(120)
    }
    r.check('a falling boulder crushed the digger (real CA death -> over screen)', dead && dead.screen === 'over', `screen=${dead && dead.screen} alive=${dead && dead.player.alive}`)
    await wait(1100)
    await key('KeyL')
    await wait(300)
    r.check('a real key restarts after death', (await probe()).screen === 'attract')
}

// ---- #2374 FLY PIT juice: the comet trail and the corridor chirp are live ----
{
    await page.evaluate(() => window.__game && window.__game.reset && window.__game.reset(3))
    await wait(1500)                                     // ~18 CA ticks; escape ~tick 6
    const s = await probe()
    r.check('the contract reset loaded FLY PIT', s.name === 'FLY PIT', `name=${s.name} screen=${s.screen}`)
    r.check('the fly drags a fading comet trail', s.trail > 3, `trail=${s.trail} — corridor lane is not being painted`)
    r.check('the corridor-entry chirp fired once the fly escaped', s.alarmed === true, `alarmed=${s.alarmed} fly=${JSON.stringify(s.flies[0])}`)
    // the trail follows the fly: a tick later it has shifted along the shuttle
    const flyX = s.flies[0] && s.flies[0].x
    await wait(500)
    const s2 = await probe()
    r.check('the trail stays glued to the patrol (still painting)', s2.trail > 3 && s2.flies[0].x !== undefined,
        `trail=${s2.trail} fly ${flyX}->${s2.flies[0] && s2.flies[0].x}`)
}

// ---- #2411 SLIME VAULT live: bolts shoved and wave grown with real keys ----
{
    await page.evaluate(() => window.__game && window.__game.reset && window.__game.reset(4))
    await wait(700)
    const s = await probe()
    r.check('the contract reset loaded SLIME VAULT', s.name === 'SLIME VAULT' && s.screen === 'play', `name=${s.name} screen=${s.screen}`)
    r.check('the vault starts bolted: 2 push walls and the choke boulder', s.bolts === 2 && s.boulders === 1, `bolts=${s.bolts} boulders=${s.boulders}`)
    let slimePeak = 0, boltShoved = false, crushSeen = false
    for (let i = 0; i < 1600; i++) {
        const q = await probe()
        if (q.screen !== 'play') break
        slimePeak = Math.max(slimePeak, q.slime)
        if (q.boltAt.some(([bx]) => bx > 22)) boltShoved = true
        if (q.boulders === 0) crushSeen = true
        const d = await hint()
        if (d) await key(d)
        // pace shoves at WORLD ticks: gravity only gets to see a bolt while it
        // stands over its pit, and a 55 ms key loop can shove it past between
        // two ticks — the hop makes the vault a coin-flip under load. Wait for
        // the tick to actually advance (world seconds, never a blind sleep —
        // the AGENTS.md clock rule) so every pit cell is evaluated.
        let advanced = false
        for (let k = 0; k < 15 && !advanced; k++) { advanced = (await probe()).tick > q.tick; if (!advanced) await wait(20) }
    }
    const fin = await probe()
    r.check('real arrows crack the vault — SLIME VAULT won end-to-end', fin.screen === 'over' && fin.win === true, `screen=${fin.screen} win=${fin.win} have=${fin.have}/${fin.need}`)
    r.check('the slime wave visibly grew…', slimePeak > 4, `peak slime=${slimePeak}`)
    r.check('a bolt was shoved off its mark (real push through a real key)', boltShoved, `boltAt=${JSON.stringify(fin.boltAt)}`)
    r.check('the choke boulder got crushed under a wall (board lost it)', crushSeen, `boulders=${fin.boulders}`)
    await wait(1200)
    await key('KeyM')
    await wait(300)
    r.check('the vault run restarts back to attract', (await probe()).screen === 'attract')
    // the wave's full life-cycle on its own clock (taps outrun world ticks, so
    // expiry is watched in a fresh cave with no input — the wave never idles):
    await page.evaluate(() => window.__game && window.__game.reset && window.__game.reset(4))
    let peak2 = 0, expired = false
    for (let i = 0; i < 140 && !expired; i++) {
        const q = await probe()
        peak2 = Math.max(peak2, q.slime)
        if (peak2 > 4 && q.slime === 0) expired = true
        await wait(80)
    }
    r.check('…and dissolved entirely on its own clock (generations expire)', peak2 > 4 && expired, `peak=${peak2} end=${(await probe()).slime}`)
}

// ---- #2428 GOO GALLERY live: all three variants drive under real keys ----
{
    await page.evaluate(() => window.__game && window.__game.reset && window.__game.reset(5))
    await wait(700)
    const s = await probe()
    r.check('the contract reset loaded GOO GALLERY', s.name === 'GOO GALLERY' && s.screen === 'play', `name=${s.name} screen=${s.screen}`)
    let gooPeak = 0, drove = 0
    for (let i = 0; i < 1600; i++) {
        const q = await probe()
        if (q.screen !== 'play') break
        gooPeak = Math.max(gooPeak, q.slime)
        drove++
        const d = await hint()
        if (d) await key(d)
        await wait(55)
    }
    const fin = await probe()
    r.check('the planner route drives GOO GALLERY home with real keys', fin.screen === 'over' && fin.win === true && fin.have >= fin.need,
        `screen=${fin.screen} win=${fin.win} have=${fin.have}/${fin.need}`)
    r.check('the family is visibly alive — slime grew while the digger ran', gooPeak > 6, `peak slime=${gooPeak} over ${drove} presses`)
    await wait(1200)
    await key('KeyM')
    await wait(300)
    r.check('the gallery run restarts back to attract', (await probe()).screen === 'attract')
    // waves expire on their own clock in a fresh cave with no input (the tails
    // must never leave the pockets full)
    await page.evaluate(() => window.__game && window.__game.reset && window.__game.reset(5))
    let peak3 = 0, gone3 = false
    for (let i = 0; i < 220 && !gone3; i++) {
        const q = await probe()
        peak3 = Math.max(peak3, q.slime)
        if (peak3 > 6 && q.slime === 0) gone3 = true
        await wait(80)
    }
    r.check('all three variant waves expire on their own clocks', peak3 > 6 && gone3, `peak=${peak3} end=${(await probe()).slime}`)
}

// ---- #2444 FORK BASIN live: the multi-head blob grows under real keys ----
{
    await page.evaluate(() => window.__game && window.__game.reset && window.__game.reset(6))
    await wait(700)
    const s = await probe()
    r.check('the contract reset loaded FORK BASIN', s.name === 'FORK BASIN' && s.screen === 'play', `name=${s.name} screen=${s.screen}`)
    let forkPeak = 0, maxHeads = 0, maxDirs = 0, drove = 0
    for (let i = 0; i < 1600; i++) {
        const q = await probe()
        if (q.screen !== 'play') break
        forkPeak = Math.max(forkPeak, q.slime)
        maxHeads = Math.max(maxHeads, q.heads || 0)
        maxDirs = Math.max(maxDirs, (q.headDirs || []).length)
        drove++
        const d = await hint()
        if (d) await key(d)
        await wait(55)
    }
    const fin = await probe()
    r.check('the planner route drives FORK BASIN home with real keys', fin.screen === 'over' && fin.win === true && fin.have >= fin.need,
        `screen=${fin.screen} win=${fin.win} have=${fin.have}/${fin.need}`)
    r.check('the fork blob is visibly alive — slime grew while the digger ran', forkPeak > 6, `peak slime=${forkPeak} over ${drove} presses`)
    r.check('…and it is MULTI-HEADED — several fronts grew at once in more than one direction', maxHeads >= 2 && maxDirs >= 2, `peak fronts=${maxHeads}, distinct headings=${maxDirs}`)
    await wait(1200)
    await key('KeyM')
    await wait(300)
    r.check('the basin run restarts back to attract', (await probe()).screen === 'attract')
    // the blob dissolves on its own clock in a fresh cave with no input
    await page.evaluate(() => window.__game && window.__game.reset && window.__game.reset(6))
    let peak4 = 0, gone4 = false
    for (let i = 0; i < 260 && !gone4; i++) {
        const q = await probe()
        peak4 = Math.max(peak4, q.slime)
        if (peak4 > 6 && q.slime === 0) gone4 = true
        await wait(80)
    }
    r.check('the fork wave dissolves on its own clock (generations expire)', peak4 > 6 && gone4, `peak=${peak4} end=${(await probe()).slime}`)
}

// ---- #2453 GOSSAMER HOLLOW live: the butterfly weaves and dips the tube ----
{
    await page.evaluate(() => window.__game && window.__game.reset && window.__game.reset(7))
    await wait(700)
    const s = await probe()
    r.check('the contract reset loaded GOSSAMER HOLLOW', s.name === 'GOSSAMER HOLLOW' && s.screen === 'play', `name=${s.name} screen=${s.screen}`)
    r.check('the cave ships a butterfly — drift on, boring and ignition off', s.butterfly === true, `butterfly=${s.butterfly}`)
    // phase A: no input — the player is safe at the spawn while the critter
    // proves itself: flaps at real pace, dips into the tube, and can never
    // pass the sealed lane under the tube mouth (dust is wall to a butterfly).
    let flapsSeen = 0, dipped = false, breach = false
    for (let i = 0; i < 480; i++) {
        const q = await probe()
        if (q.screen !== 'play') break
        flapsSeen = Math.max(flapsSeen, q.flaps || 0)
        const f = (q.flies || [])[0]
        if (f) {
            if (f.y >= 12) dipped = true
            if (f.y >= 18) breach = true
        }
        await wait(60)
    }
    r.check('the butterfly flaps at real pace in the live game', flapsSeen >= 10, `flaps=${flapsSeen}`)
    r.check('the butterfly dips into the tube toward the dig lanes', dipped, 'no tube visit in 480 ticks')
    r.check('…and cannot breach the sealed lane — dust is wall to a butterfly', !breach, 'the fly reached the harvest row while it was still rock')
    // phase B: restart fresh, drive the planner route home with real keys
    await page.evaluate(() => window.__game && window.__game.reset && window.__game.reset(7))
    await wait(500)
    for (let i = 0; i < 1600; i++) {
        const q = await probe()
        if (q.screen !== 'play') break
        const d = await hint()
        if (d) await key(d)
        await wait(55)
    }
    const fin = await probe()
    r.check('the planner route drives GOSSAMER HOLLOW home with real keys', fin.screen === 'over' && fin.win === true && fin.have >= fin.need,
        `screen=${fin.screen} win=${fin.win} have=${fin.have}/${fin.need}`)
    await wait(1200)
    await key('KeyM')
    await wait(300)
    r.check('the hollow run restarts back to attract', (await probe()).screen === 'attract')
}

// ---- #2438 AMOEBA POLISH live: the family tells, the vise drone, the cool comet ----
{
    // GOO GALLERY with NO input: the sealed pockets do their thing, and the
    // juice the sim cannot see must prove itself through the probe — corner
    // blips from the two-phase gait, pour thunks from the dropper, and the
    // vise lane shade + drone the moment the mirrored fronts close.
    await page.evaluate(() => window.__game && window.__game.reset && window.__game.reset(5))
    await wait(700)
    const g0 = await probe()
    r.check('the gallery loaded with its polish data live', g0.name === 'GOO GALLERY' && g0.screen === 'play', `name=${g0.name}`)
    let turnPeak = 0, dropPeak = 0, dronePeak = 0, hot = false, lanes = 0, kindsPeak = [0, 0, 0, 0]
    for (let i = 0; i < 260; i++) {
        const q = await probe()
        if (q.screen !== 'play') break
        turnPeak = Math.max(turnPeak, q.turnBlips || 0)
        dropPeak = Math.max(dropPeak, q.dropThunks || 0)
        dronePeak = Math.max(dronePeak, q.drones || 0)
        lanes = Math.max(lanes, q.viseLanes || 0)
        hot = hot || !!q.viseHot
        ;(q.amoKinds || []).forEach((n, k) => { kindsPeak[k] = Math.max(kindsPeak[k], n || 0) })
        await wait(80)
    }
    r.check('the two-phase gait is SEEN cornering — turn flashes + shift tones fired', turnPeak >= 1, `turnBlips=${turnPeak}`)
    r.check('the dropper is HEARD pouring — its first shaft thunk fired', dropPeak >= 1, `dropThunks=${dropPeak}`)
    r.check('variant head counts are live — classic, two-phase and dropper all grew heads',
        kindsPeak[0] >= 1 && kindsPeak[1] >= 1 && kindsPeak[2] >= 1, `kinds=${JSON.stringify(kindsPeak)}`)
    r.check('the vise shades its closing lane and drones once shut to 4 cells',
        hot && lanes >= 1 && dronePeak >= 1, `viseHot=${hot} lanes=${lanes} drones=${dronePeak}`)
    // FORK BASIN: every fork the planner's run provokes blips and flashes.
    await page.evaluate(() => window.__game && window.__game.reset && window.__game.reset(6))
    await wait(500)
    let forkPeak = 0, pillarSees = 0
    for (let i = 0; i < 1600; i++) {
        const q = await probe()
        if (q.screen !== 'play') break
        forkPeak = Math.max(forkPeak, q.forkBlips || 0)
        pillarSees = Math.max(pillarSees, q.pillar || 0)
        const d = await hint()
        if (d) await key(d)
        await wait(55)
    }
    r.check('fork fingers being BORN get their blip + flash in the live cave', forkPeak >= 1, `forkBlips=${forkPeak}`)
    r.check('the wrap pillar is marked on the basin painter', pillarSees === 6, `pillar=${pillarSees}`)
    // GOSSAMER: the butterfly reads apart — cool comet trails, wings beat.
    await page.evaluate(() => window.__game && window.__game.reset && window.__game.reset(7))
    await wait(500)
    let coolPeak = 0, wingFlip = false, wingWas = -1, tubesSee = 0, flapP = 0
    for (let i = 0; i < 480; i++) {
        const q = await probe()
        if (q.screen !== 'play') break
        coolPeak = Math.max(coolPeak, q.coolTrail || 0)
        if (wingWas >= 0 && q.wingPhase !== wingWas) wingFlip = true
        wingWas = q.wingPhase
        tubesSee = Math.max(tubesSee, q.tubes || 0)
        flapP = Math.max(flapP, q.flapToots || 0)
        await wait(60)
    }
    r.check('the butterfly drags a COOLER comet of its own (not the amber one)', coolPeak >= 3, `coolTrail=${coolPeak}`)
    r.check('its wing pair beats on a 2-frame phase', wingFlip, `phase stuck at ${wingWas}`)
    r.check('flaps are HEARD — the quiet flutter cue fired', flapP >= 3, `flapToots=${flapP}`)
    r.check('the tube mouth is marked on the hollow painter', tubesSee === 1, `tubes=${tubesSee}`)
}

r.check('zero page errors across the whole playthrough', errors.length === 0, errors.slice(0, 4).join(' | '))
r.exit(browser)
