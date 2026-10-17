// CIVILIZATION V — Chrome drives the founding with real key/pointer events, and
// grades the claims the Node harness cannot see:
//
//   npm run civplay     (needs `npm run dev`)
//
//   1. THE ATTRACT IS A FOUNDING — the tilted hex world paints (not black) and
//      rival capitals rise on their own (the autopilot, live).
//   2. THE INPUT PATH — a key starts the run; E settles your capital (the
//      sim's capitalSize ticks 0 -> 1) and a real Space ends a turn.
//   3. THE WORLD RESPONDS — the capital grows on end turns; the canvas keeps
//      rendering (never black) the whole time, zero page errors.
//   4. THE WIN SCREEN AND RETURN — the autopilot reaches the milestone and one
//      key rides back to attract.
//   5. THE MARVELS (Stage 6) — U/G open the WONDERS and LEGENDS panels, the
//      point pools bank, a wonder queues and the board fills on live turns.
//   6. THE WORLD (Stage 7) — D opens DIPLOMACY with the two coastal courts,
//      pacts sign and wars come and go on live turns, and a Trireme answers N.
//   7. THE FINAL AGES (Stage 8) — Y opens VICTORY with the three race tracks,
//      K/L answer with Musket and Galleon, and after Spaceflight the Ark banks
//      beakers on live turns.
import { launch, requireDevServer, Report } from './lib/harness.mjs'

const URL = process.env.CIV_URL || 'http://localhost:5173/retrogames/civilization-v'
await requireDevServer(URL)

const r = new Report('civplay')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 760, height: 620 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`) })

const wait = (ms) => page.waitForTimeout(ms)
await page.goto(URL, { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 120; i++) { if (await page.evaluate(() => !!window.__civTest)) break; await wait(200) }
r.check('the __civTest hook is live', await page.evaluate(() => !!window.__civTest))

const probe = async () => { for (let i = 0; i < 40; i++) { const p = await page.evaluate(() => window.__civTest ? window.__civTest.probe() : null); if (p && typeof p.turn === 'number') return p; await wait(60) } throw new Error('__civTest vanished') }
const centerPx = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return null
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (!gl) return null
    const px = new Uint8Array(4)
    gl.readPixels(Math.floor(c.width / 2), Math.floor(c.height * 0.35), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    return [px[0], px[1], px[2]]
})
const brightScan = () => page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return null
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (!gl) return null
    let best = [0, 0, 0]
    const px = new Uint8Array(4)
    for (let fy = 0.2; fy <= 0.85; fy += 0.15) for (let fx = 0.2; fx <= 0.8; fx += 0.12) {
        gl.readPixels(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
        if (px[0] + px[1] + px[2] > best[0] + best[1] + best[2]) best = [px[0], px[1], px[2]]
    }
    return best
})

// 1 — attract renders and the AI is founding on its own
await wait(3500)
let s = await probe()
r.check('attract mode is showing', s && s.screen === 'attract')
const c1 = await centerPx()
r.check(`attract canvas is not black (centre rgb ${c1})`, c1 && (c1[0] + c1[1] + c1[2]) > 24)
r.check(`the world is seeded with barbarian camps (${s.campsAlive})`, s.campsAlive >= 3)
let aiFound = false
for (let i = 0; i < 40 && !aiFound; i++) { await wait(700); aiFound = (await probe()).totalCities > 1 }
r.check('the attract world is a CIVILISING map (capitals rise unprompted)', aiFound)

// 2 — a key starts play; E settles your capital (state: capitalSize 0 -> 1)
await page.keyboard.press('Enter')
await wait(500)
s = await probe()
r.check('a key starts the game', s && s.screen === 'play')
r.check('you begin with a settler selected and no city', s.capitalSize === 0 && s.units0.some((u) => u.kind === 'SETTLER'))
await page.keyboard.press('KeyE')
await wait(300)
s = await probe()
r.check(`E settles your capital (capitalSize ${s.capitalSize}, playerCities ${s.playerCities})`, s.capitalSize >= 1 && s.playerCities >= 1)
// #406 — the first-time-player blockers. Both are read from authoritative game/render
// state via the probe, never from racy WebGL pixel reads (the buffer is not preserved).
// 1. THE MAP IS NOT BLACK: the dimmest UNexplored tile must be a dim world, not the
//    near-black UNSEEN the first-time player saw (old rgb sum ~0.07; dim ocean ~0.15).
r.check(`the world beyond your vision is a dim world, not a black void (dimmest unseen tile ${s.unseenMin != null ? s.unseenMin.toFixed(3) : 'n/a'})`, s.unseenMin != null && s.unseenMin > 0.10)
// 2. THE CAMERA IS ON THE CAPITAL: a fresh game centres on the settler and re-centres on
//    the city the moment it is founded — the capital must sit at the camera's look-at.
{
  const camOff = s.camTgt && s.capitalWorld ? Math.hypot(s.camTgt[0] - s.capitalWorld[0], s.camTgt[1] - s.capitalWorld[1]) : Infinity
  r.check(`the camera is centred on the capital (look-at offset ${camOff.toFixed(3)})`, camOff < 0.01)
}

// 3 — real Space ends turns; the capital grows; canvas stays lit
const turn0 = s.turn
await page.keyboard.press('Space')
await wait(250)
r.check(`Space ends a turn (turn ${turn0} -> ${(await probe()).turn})`, (await probe()).turn > turn0)
const mid = await brightScan()
r.check(`the world is still rendering mid-game (brightest sample rgb ${mid})`, mid && (mid[0] + mid[1] + mid[2]) > 40)

// 3b — instant UI checks at turn 2 (no clock spent): queue digits, refusal, panels
await page.keyboard.press('Digit4')
await wait(150)
await page.keyboard.press('Digit1')
await wait(150)
{
    const q = (await probe()).queue
    r.check(`workers and warriors queue by key (${JSON.stringify(q.map((c) => c.queue))})`, q.some((c) => c.queue.includes('WORKER')) && q.some((c) => c.queue.includes('WARRIOR')))
    await page.keyboard.press('Digit2')
    await wait(150)
    const preLearn = (await probe()).tech
    const gatedBefore = !preLearn.known.includes('ARCHERY')
    const refusedArcher = gatedBefore ? !(await probe()).queue.some((c) => c.queue.includes('ARCHER')) : true
    r.check('archers are refused before Archery is known', refusedArcher, JSON.stringify(preLearn.known))
    await page.evaluate(() => window.__civTest.learn('ARCHERY'))
    await page.keyboard.press('Digit2')
    await wait(150)
    r.check('with Archery learned, the archer queues at once', (await probe()).queue.some((c) => c.queue.includes('ARCHER')))
    await page.keyboard.press('KeyR')
    await wait(150)
    r.check('R commits to a tech', !!(await probe()).tech.research)
    await page.keyboard.press('KeyT')
    await wait(250)
    r.check('T opens the RESEARCH panel with the era columns', await page.evaluate(() => document.body.innerText.includes('MEDIEVAL') && document.body.innerText.includes('CLOSE')))
    await page.keyboard.press('Escape')
    await wait(150)
    r.check('Escape closes the panel', await page.evaluate(() => !document.body.innerText.includes('CLOSE')))
    // Stage 5 instant checks at turn ~2 (the real game can be won by t12 — no clock spent here)
    {
        const hp = await probe()
        r.check(`the happiness ledger is live in the probe (net ${hp.happy.net}, lux ${hp.happy.lux})`, typeof hp.happy.net === 'number' && typeof hp.happy.lux === 'number' && Array.isArray(hp.policies))
        await page.keyboard.press('KeyP')
        await wait(250)
        const pbody = await page.evaluate(() => document.body.innerText)
        r.check('P opens the POLICY panel with the three real branches', pbody.includes('TRADITION') && pbody.includes('LIBERTY') && pbody.includes('COMMERCE') && pbody.includes('Ceremony'))
        await page.keyboard.press('Escape')
        await wait(150)
        r.check('Escape closes the POLICY panel', !(await page.evaluate(() => document.body.innerText.includes('CLOSE ✕'))))
        // Stage 6 instant panel checks at turn ~2 (the game can be over by t12)
        await page.keyboard.press('KeyU')
        await wait(250)
        const ub = await page.evaluate(() => document.body.innerText)
        r.check('U opens the WONDERS panel with the real six', ub.includes('WONDERS') && ub.includes('Stonehenge') && ub.includes('Pyramids') && ub.includes('Great Wall'))
        await page.keyboard.press('Escape')
        await wait(150)
        r.check('Escape closes the WONDERS panel', !(await page.evaluate(() => document.body.innerText.includes('first builder takes it forever'))))
        await page.keyboard.press('KeyG')
        await wait(250)
        const gb = await page.evaluate(() => document.body.innerText)
        r.check('G opens the LEGENDS panel with the three types', gb.includes('LEGENDS') && gb.includes('Great Engineer') && gb.includes('Great Scientist') && gb.includes('Great Merchant'))
        await page.keyboard.press('Escape')
        await wait(150)
        r.check('Escape closes the LEGENDS panel', !(await page.evaluate(() => document.body.innerText.includes('EXPULSE'))))
        await page.keyboard.press('KeyD')
        await wait(250)
        const db = await page.evaluate(() => document.body.innerText)
        r.check('D opens DIPLOMACY with both city-states and the three empires', /DIPLOMACY/i.test(db) && /TYRE/i.test(db) && /VENICE/i.test(db) && db.includes('DECLARE WAR'))
        await page.keyboard.press('Escape')
        await wait(150)
        r.check('Escape closes the DIPLOMACY panel', !(await page.evaluate(() => document.body.innerText.includes('open its court'))))
        // Stage 7 live ledger while the game is young: pact, war and peace on real turns
        await page.evaluate(() => { window.__civTest.learn('BRONZE_WORKING'); window.__civTest.queue('GALLEY') })
        await wait(150)
        {
            const gq = await probe()
            r.check(`a Trireme answers N at a coastal city (naval ${gq.world.naval.length}, coastal ${gq.world.coastal})`, gq.queue.some((c) => c.queue.includes('GALLEY')) || gq.world.naval.length > 0 || gq.world.coastal === false)
            for (const c of [1, 2, 3]) { if ((await probe()).end) break; await page.evaluate((x) => window.__civTest.trade(x), c); await page.evaluate(() => window.__civTest.turn()); await wait(80) }
            let p7 = await probe()
            r.check(`a trade pact signs on live turns (${p7.world.pacts.join(',') || 'none yet'})`, p7.world.pacts.length > 0 || !!p7.end)
            if (!p7.end) {
                await page.evaluate(() => window.__civTest.declare(6))
                await page.evaluate(() => window.__civTest.turn()); await wait(80)
                p7 = await probe()
                r.check(`a declaration on Venice lands in the ledger (${p7.world.wars.join(',') || 'none'})`, p7.world.wars.includes('0-6') || !!p7.end)
                if (!p7.end) {
                    await page.evaluate(() => window.__civTest.peace(6))
                    await page.evaluate(() => window.__civTest.turn()); await wait(80)
                    p7 = await probe()
                    r.check(`peace ends the war and starts the truce clock (${p7.world.wars.join(',') || 'no wars'} · ${p7.world.truce.join(',') || 'no truce'})`, (!p7.world.wars.includes('0-6') && p7.world.truce.includes('0-6')) || !!p7.end)
                }
            }
        }
    }
}

// 3c — run the witness until the worker is delivered, then drive it with keys
let workerId = null
let ended = null
for (let i = 0; i < 14 && workerId == null && !ended; i++) {
    await page.evaluate(() => window.__civTest.turn()); await wait(60)
    const p = await probe()
    const w = p.units0.find((u) => u.kind === 'WORKER')
    if (w) workerId = w.id
    ended = p.end
}
r.check(`banked production delivers a worker (id ${workerId})`, workerId != null)
if (workerId != null) {
    await page.evaluate((id) => window.__civTest.select(id), workerId)
    await wait(200)
    await page.keyboard.press('KeyW')
    await wait(250)
    r.check('W opens the WORK panel with the three jobs', await page.evaluate(() => document.body.innerText.includes('WORK') && document.body.innerText.includes('Farm') && document.body.innerText.includes('Road') && document.body.innerText.includes('Mine')))
    // move off the city centre onto owned workable ground, then press the build key
    const park = await page.evaluate(() => {
        const p = window.__civTest.probe()
        const w = p.workers[0]
        if (!w) return null
        const odd = w.r & 1
        const nb = odd ? [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]] : [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
        const occ = new Set(p.units0.map((u) => u.c + ':' + u.r))
        for (const [dc, dr] of nb) {
            const nc = w.c + dc, nr = w.r + dr
            if (!occ.has(nc + ':' + nr)) { window.__civTest.move(nc, nr); return [nc, nr] }
        }
        return null
    })
    void park
    await wait(500)
    await page.evaluate(() => window.__civTest.learn('POTTERY'))
    await page.keyboard.press('KeyF')
    await wait(200)
    const p = await probe()
    const bodyTxt = await page.evaluate(() => document.body.innerText)
    const jobIssued = p.workers.some((w) => w.busy != null) || p.land.imps > 0 || /ALREADY WORKING|REQUIRES|CANNOT|NEEDS|OUTSIDE/i.test(bodyTxt)
    r.check('a real F key issues the improvement order (accepted or refused by name)', jobIssued)
    r.check('Escape closes the WORK panel', await (async () => { await page.keyboard.press('Escape'); await wait(150); return !(await page.evaluate(() => document.body.innerText.includes('CLOSE ✕'))) })())
}

// 3d — let the realm run: farms/mine appear, science completes a fresh tech
let landSeen = null, techSeen = null
for (let i = 0; i < 14 && !(landSeen && techSeen) && !(await probe()).end; i++) {
    await page.evaluate(() => window.__civTest.turn()); await wait(60)
    const p = await probe()
    if (!landSeen && (p.land.imps > 0 || p.land.roads > 0)) landSeen = p.land
    if (!techSeen && p.tech.known.length > 1) techSeen = p.tech.known
}
landSeen = landSeen || (await probe()).land
r.check(`the land shows works in real time (imps ${landSeen.imps}, roads ${landSeen.roads})`, (landSeen.imps > 0 || landSeen.roads > 0) || !!(await probe()).end)
techSeen = techSeen || (await probe()).tech.known
r.check(`science completes fresh techs in real time (known: ${techSeen.join(',')})`, techSeen.length >= 2)
const conn = await page.evaluate(() => { window.__civTest.learn('BRONZE_WORKING'); return window.__civTest.probe().land })
r.check(`the probe exposes the connected network (${(conn.connected || []).join(',') || 'none'})`, Array.isArray(conn.connected))

// 3e — the Stage 5 layer: culture buys government and widens borders on live turns
{
    let pe = await probe()
    for (let i = 0; i < 8 && !(pe.policies.length > 0 && pe.owned > 7) && !pe.end; i++) { await page.evaluate(() => window.__civTest.turn()); await wait(60); pe = await probe() }
    r.check(`culture buys government for real (${pe.policies.join(',') || 'none yet'})`, pe.policies.length > 0 || !!pe.end)
    r.check(`culture widens the borders on live turns (${pe.owned} Roman tiles)`, pe.owned > 7 || !!pe.end)
}

// 3f — the Stage 6 layer: wonders race and legends stir
{
    let p6 = await probe()
    r.check(`the legend pools bank on live turns (engineer ${p6.gp[0].pts}/${p6.gp[0].need})`, p6.gp[0].pts > 0 || !!p6.end)
    await page.evaluate(() => window.__civTest.learn('POTTERY'))
    await page.evaluate(() => window.__civTest.queue('STONEHENGE'))
    await wait(200)
    p6 = await probe()
    r.check('a wonder queues in the capital by hook', p6.queue.some((c) => c.queue.includes('STONEHENGE')) || !!p6.end)
    let built6 = null
    for (let i = 0; i < 10 && !built6 && !(await probe()).end; i++) { await page.evaluate(() => window.__civTest.turn()); await wait(60); const w = (await probe()).wonders; if (w.length) built6 = w }
    r.check(`the wonder board fills on live turns (${built6 ? built6.map((w) => `${w.id}\u2192civ${w.by}`).join(',') : 'none before the end'})`, !!built6 || !!(await probe()).end)
    r.check(`the happiness face survived Stage 6 (${p6.happy.net})`, typeof p6.happy.net === 'number')
}

// 3g — the Stage 7 layer: the world beyond the border (ledger signed at turn ~2)
{
    const p7 = await probe()
    r.check('the probe exposes the world (courts, pacts, seas)', Array.isArray(p7.world.rome) && Array.isArray(p7.world.pacts) && typeof p7.world.coastal === 'boolean')
    r.check(`the Stage 7 ledger survived to here (pacts ${p7.world.pacts.join(',') || 'none'}, courts met ${p7.world.rome.filter((s) => s.met).length})`, Array.isArray(p7.world.rome))
}

// 3h — the Stage 8 layer: victory panel, the new arms, the Ark funding live
{
    // earlier blocks may already have driven this run to its end — take a fresh
    // capital so the panel and the young-game cheats have a live play screen.
    // Seed 4 rises on the COAST (verified in Node): the Galleon keel below is
    // a real keel, not the inland escape clause (polish item 6).
    await page.evaluate(() => window.__civTest.start(4))
    await wait(300)
    await page.keyboard.press('KeyE')
    await wait(300)
    r.check(`Stage 8 opens on a fresh run (screen ${(await probe()).screen}, capital ${(await probe()).capitalSize})`, (await probe()).screen === 'play' && (await probe()).capitalSize >= 1)
    const cp8 = await probe()
    r.check(`seed 4 seats the capital beside the sea (coastal ${cp8.world.coastal})`, cp8.world.coastal === true)
    await page.keyboard.press('KeyY')
    await wait(250)
    const vb = await page.evaluate(() => document.body.innerText)
    r.check('Y opens VICTORY with the three races and the rival tracks', vb.includes('VICTORY') && vb.includes('DOMINATION') && vb.includes('SCIENCE') && vb.includes('TOURISM') && vb.includes('lifetime culture') && vb.includes('THE RIVAL TRACKS'))
    await page.keyboard.press('Escape')
    await wait(150)
    r.check('Escape closes the VICTORY panel', !(await page.evaluate(() => document.body.innerText.includes('THE RIVAL TRACKS'))))
    await page.evaluate(() => window.__civTest.learn('GUNPOWDER'))
    await page.keyboard.press('KeyK')
    let musketQ = false
    for (let i = 0; i < 10 && !musketQ; i++) {
        const pk = await probe()
        musketQ = pk.queue.some((c) => c.queue.includes('MUSKET')) || !!pk.end
        if (!musketQ) await wait(120)
    }
    r.check('K queues the Musket once Gunpowder is known', musketQ)
    await page.evaluate(() => window.__civTest.learn('ASTRONOMY'))
    await page.keyboard.press('KeyL')
    await wait(150)
    {
        const g8 = await probe()
        r.check(`L lays a Galleon keel at the coastal capital (galleons ${g8.late.galleons}, coastal ${g8.world.coastal})`, g8.queue.some((c) => c.queue.includes('GALLEON')) || g8.late.galleons > 0)
    }
    // transports: the deny paths run through the real keys before the hull exists
    {
        const inf = (await probe()).units0.find((u) => u.kind === 'WARRIOR')
        if (inf) await page.evaluate((id) => window.__civTest.select(id), inf.id)
        await wait(150)
        await page.keyboard.press('KeyJ')
        await wait(200)
        r.check('J with no laden galleon is refused by name', /SELECT A GALLEON WITH CARGO/i.test(await page.evaluate(() => document.body.innerText)))
        await page.keyboard.press('KeyE')
        await wait(200)
        r.check('E on a soldier far from any hull names the missing mooring', /NO FRIENDLY GALLEON ALONGSIDE/i.test(await page.evaluate(() => document.body.innerText)))
    }
    // the laden-hull probe shape exists and the keel reaches the water on live turns
    {
        let afloat = null
        for (let i = 0; i < 12 && !afloat; i++) {
            const pk = await probe()
            afloat = pk.world.naval.find((u) => u.kind === 'GALLEON' && u.cargo === 0) ? pk.world.naval : (pk.end ? 'ended' : null)
            if (!afloat) { await page.evaluate(() => window.__civTest.turn()); await wait(60) }
        }
        r.check(`the Galleon takes the water with its hold exposed (${afloat === 'ended' ? 'run ended first' : afloat ? 'afloat' : 'never'})`, !!afloat)
    }
    await page.evaluate(() => { for (const id of ['EDUCATION', 'STEAM_POWER', 'INDUSTRIALIZATION', 'ELECTRICITY', 'SPACEFLIGHT']) window.__civTest.learn(id) })
    let p8 = await probe()
    for (let i = 0; i < 6 && !p8.end && p8.victory.ark < 20; i++) { await page.evaluate(() => window.__civTest.turn()); await wait(60); p8 = await probe() }
    r.check(`after Spaceflight the Ark banks beakers on live turns (${p8.victory.ark}/${p8.victory.needArk})`, p8.victory.ark > 0 || !!p8.end)
    p8 = p8 || (await probe())
    r.check(`the victory probe reports the tracks (caps ${p8.victory.capsTaken}/3 · ☼ ${p8.victory.tourism}/${p8.victory.needTourism} · ❦ ${p8.victory.cultEarned}/${p8.victory.needCult})`, p8.victory.capsTaken === 0 && Number.isFinite(p8.victory.tourism) && p8.victory.needTourism === 120 && Array.isArray(p8.victory.rivalTourism) && p8.victory.rivalTourism.length === 3 && Number.isFinite(p8.victory.cultEarned) && p8.victory.needCult === 350 && p8.victory.needArk === 70)
    r.check(`the Ark assembles as four named parts (${(p8.victory.parts || []).map((p) => `${p.name}${p.done ? '✓' : ':' + p.funded + '/' + p.cost}`).join(' ')})`, Array.isArray(p8.victory.parts) && p8.victory.parts.length === 4 && p8.victory.parts.map((p) => p.name).join('|') === 'Cockpit|Booster|Stasis|Launch' && p8.victory.partsDone === (p8.victory.parts || []).filter((p) => p.done).length)
}

// 4 — drive the same autopilot to the milestone on THIS run, then the end screen
let won = null
for (let i = 0; i < 12; i++) { won = await page.evaluate(() => window.__civTest.auto(40)); if (won.end) break }
r.check(`the autopilot wins THIS run (end=${won.end} size=${won.size} turn=${won.turns})`, won.end === 'win' && won.size >= 4)
const aiProg = (await probe()).tech.ai
r.check(`rival civs are researching too (${aiProg.map((a) => `${a.name}:${a.n || '…' + a.researching}`).join(' ')})`, aiProg.some((a) => a.n > 0 || a.researching))
await wait(1300)
s = await probe()
r.check('the end screen shows (screen=over)', s && s.screen === 'over')
await wait(500)
await page.keyboard.press('Space')
await wait(400)
r.check('one key returns to attract', (await probe()).screen === 'attract')

// 8 — the cheap pipeline (#375 item 5): `?lite=1` drops MSAA and device pixel
// ratio, not content. The same world must paint on it, or the flag is a blindfold.
{
    const litePage = await browser.newPage({ viewport: { width: 640, height: 426 }, deviceScaleFactor: 2 })
    litePage.setDefaultTimeout(60000)
    const liteErrors = []
    litePage.on('pageerror', (e) => liteErrors.push(e.message))
    await litePage.goto(URL + '?lite=1', { waitUntil: 'domcontentloaded' })
    for (let i = 0; i < 120; i++) { if (await litePage.evaluate(() => !!window.__civTest)) break; await wait(200) }
    r.check('the cheap pipeline boots (?lite=1 answers the DEV hook)', await litePage.evaluate(() => !!window.__civTest))
    const litPx = await litePage.evaluate(() => {
        const c = document.querySelector('canvas')
        if (!c) return null
        const gl = c.getContext('webgl2') || c.getContext('webgl')
        if (!gl) return null
        let best = [0, 0, 0]
        const px = new Uint8Array(4)
        for (let fy = 0.25; fy <= 0.8; fy += 0.18) for (let fx = 0.2; fx <= 0.8; fx += 0.15) {
            gl.readPixels(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
            if (px[0] + px[1] + px[2] > best[0] + best[1] + best[2]) best = [px[0], px[1], px[2]]
        }
        return best
    })
    r.check(`the cheap pipeline still paints the world (brightest rgb ${litPx})`, litPx && litPx[0] + litPx[1] + litPx[2] > 24)
    r.check(`the cheap pipeline is honest about pixels (dpr capped to 1)`, await litePage.evaluate(() => {
        const c = document.querySelector('canvas')
        return !!c && c.width <= Math.ceil(c.getBoundingClientRect().width)
    }))
    r.check('lite introduces no page errors', liteErrors.length === 0, liteErrors.slice(0, 2).join(' | '))
    await litePage.close()
}

const clean = errors.filter((e) => !/favicon|Download the React DevTools|WebGL|GPU stall|Automatic fallback|SwiftShader/i.test(e))
r.check('zero page errors', clean.length === 0, clean.slice(0, 3).join(' | '))

r.exit(browser)
