// carpetcheck.mjs — MAGIC CARPET proof: boots, rules hold, three worlds reach equilibrium.
//
// Node-first (sim is pure), then a short real-browser pass via the game contract.
// Run: npm run dev in another terminal, then `npm run carpetcheck`.
//
// Mutation guide (prove it can fail): change the win check `gs.bank >= gs.quota`
// to `gs.bank >= gs.quota * 100` in src/games/MagicCarpet/sim.js and watch
// 'equilibrium' go red; restore.

import { launch, openGame, requireDevServer, Report } from './lib/harness.mjs'
import {
    LEVELS, QUOTA, SPILLS, BOUNTY, MAP, spellById, sampleH,
    makeGame, step, autopilot, stateHash,
} from '../src/games/MagicCarpet/sim.js'

const wrap = (v, m) => ((v % m) + m) % m
const wrapD = (v) => wrap(v + MAP / 2, MAP) - MAP / 2

const r = new Report('carpetcheck')
const run = (seed, maxTicks, scriptFn = autopilot) => {
    const gs = makeGame(seed)
    let i = 0
    while (!gs.end && i < maxTicks) { step(gs, scriptFn(gs)); i++ }
    return gs
}

// ---- boot
const fresh = makeGame(7)
r.check('world 1 built: 56 pearls, wizard hoards 80, 6 books, one known spell, empty vault',
    fresh.pearls.length === 56 && fresh.wizard.mana === LEVELS[0].hoard && fresh.books.length === 6 &&
    fresh.learned.length === 1 && fresh.bank === 0 && fresh.level === 0,
    `pearls=${fresh.pearls.length} hoard=${fresh.wizard.mana} books=${fresh.books.length} bank=${fresh.bank}`)
const g0 = run(7, 600, () => ({}))
r.check('boots and steps 600 ticks idle', g0.tick === 600 && !g0.end, `tick=${g0.tick}`)

// ---- determinism
const d1 = run(7, 600), d2 = run(7, 600), d3 = run(8, 600)
r.check('seed 7 twice → identical hash', stateHash(d1) === stateHash(d2), `${stateHash(d1)} vs ${stateHash(d2)}`)
r.check('seed 8 → different hash', stateHash(d1) !== stateHash(d3))

// ---- three worlds: level progression and equilibrium
{
    const gs = run(7, 120000)
    r.check('three worlds: seed 7 levels 1→2→3 and wins at the final quota',
        gs.end === 'win' && gs.level === 2 && gs.levelClears === 2 && gs.bank >= gs.quota,
        `end=${gs.end} level=${gs.level + 1} bank=${Math.floor(gs.bank)}/${gs.quota} tick=${gs.tick}`)
    r.check('banked vault (not carried mana) is what reaches the quota', gs.bank >= QUOTA, `bank=${Math.floor(gs.bank)} quota=${QUOTA}`)
    const gs2 = run(88, 120000)
    r.check('seed 88 also restores all three worlds', gs2.end === 'win' && gs2.level === 2, `end=${gs2.end} level=${gs2.level + 1}`)
}

// ---- carrying an over-quota load does NOT win; only delivery does
{
    const gs = makeGame(7)
    gs.mana = QUOTA + 50
    gs.x = wrap(gs.castle.x + 120, MAP); gs.y = gs.castle.y
    for (let i = 0; i < 30; i++) step(gs, {})
    r.check('carrying more than the quota away from the castle does not win',
        !gs.end && gs.bank === 0, `end=${gs.end} bank=${gs.bank}`)
}

// ---- bank-by-delivery over the castle
{
    const gs = makeGame(7)
    gs.mana = 24
    gs.x = gs.castle.x; gs.y = gs.castle.y; gs.alt = Math.max(gs.alt, sampleH(gs, gs.x, gs.y) + 4)
    for (let i = 0; i < 20; i++) step(gs, {})
    r.check('hovering the castle banks the carried load into the vault',
        gs.bank === 24 && gs.mana === 0, `bank=${gs.bank} carry=${gs.mana}`)
}

// ---- death spills the carried load, the vault endures
{
    const gs = makeGame(7)
    gs.bank = 40; gs.mana = 30; gs.shield = 0; gs.hp = 6
    const wolf = gs.monsters.find((m) => m.kind === 'wolf')
    let i = 0
    while (gs.deaths === 0 && i < 400) {
        step(gs, {})
        if (gs.monsters.includes(wolf)) { wolf.x = gs.x + 3; wolf.y = gs.y; wolf.grabbed = false; wolf.cool = 0; gs.alt = Math.min(gs.alt, sampleH(gs, wolf.x, wolf.y) + 4) }
        i++
    }
    r.check('death spills the carried load but the vault (and respawn) survives',
        gs.deaths === 1 && !gs.end && gs.bank === 40 && gs.mana === 0 && gs.spilled === 30,
        `deaths=${gs.deaths} bank=${gs.bank} carry=${gs.mana} spilled=${gs.spilled}`)
    const gs2 = makeGame(7)
    gs2.bank = 0; gs2.mana = 5; gs2.shield = 0; gs2.hp = 6
    const w2 = gs2.monsters.find((m) => m.kind === 'wolf')
    let j = 0
    while (!gs2.end && j < 400) {
        step(gs2, {})
        if (gs2.monsters.includes(w2)) { w2.x = gs2.x + 3; w2.y = gs2.y; w2.grabbed = false; w2.cool = 0; gs2.alt = Math.min(gs2.alt, sampleH(gs2, w2.x, w2.y) + 4) }
        j++
    }
    r.check('dying with an empty vault ends the flight (load lost with it)',
        gs2.end === 'dead' && gs2.spilled === 5, `end=${gs2.end} spilled=${gs2.spilled}`)
}

// ---- terrain reshaping: fireballs and lightning crater the land itself
{
    const gs = makeGame(7)
    gs.monsters.length = 0
    gs.wizard.alive = false
    gs.mana = 15; gs.coolL = 0
    const snap = { heights: gs.heights.slice() }
    let impact = null
    let i = 0
    while (i < 80 && !impact) {
        step(gs, i === 0 ? { castL: true } : {})
        for (const e of gs.events) if (e.type === 'boom') impact = e
        gs.events.length = 0
        i++
    }
    const hB = impact ? sampleH(snap, impact.x, impact.y) : 0
    const hA = impact ? sampleH(gs, impact.x, impact.y) : 0
    r.check('fireball impact craters the terrain (heightmap actually deforms)',
        impact && hB - hA >= 3, `impact=${!!impact} ${hB.toFixed(1)} → ${hA.toFixed(1)}`)

    const gs2 = makeGame(7)
    gs2.monsters.length = 0
    gs2.wizard.alive = false
    gs2.mana = 25; gs2.coolR = 0
    gs2.learned.push('lightning'); gs2.hands.R = 'lightning'
    const snap2 = { heights: gs2.heights.slice() }
    let zapAt = null
    let j = 0
    while (j < 10 && !zapAt) { step(gs2, j === 0 ? { castR: true } : {}); for (const e of gs2.events) if (e.type === 'zap') zapAt = e; gs2.events.length = 0; j++ }
    const hL0 = zapAt ? sampleH(snap2, zapAt.x, zapAt.y) : 0
    const hL1 = zapAt ? sampleH(gs2, zapAt.x, zapAt.y) : 0
    r.check('lightning craters the ground where it strikes',
        zapAt && hL0 - hL1 >= 2, `zap=${!!zapAt} ${hL0.toFixed(1)} → ${hL1.toFixed(1)}`)
}

// ---- villages burn: fire that touches a hut ignites it, and it falls
{
    const gs = makeGame(7)
    gs.monsters.length = 0
    gs.wizard.alive = false
    gs.mana = 15; gs.coolL = 0
    const scout = JSON.parse(JSON.stringify(gs))
    let boomSpot = null
    let k = 0
    while (k < 80 && !boomSpot) {
        step(scout, k === 0 ? { castL: true } : {})
        for (const e of scout.events) if (e.type === 'boom') boomSpot = e
        scout.events.length = 0
        k++
    }
    const hs = gs.huts[0]
    hs.x = boomSpot.x; hs.y = boomSpot.y
    hs.burn = 0; hs.dead = false
    let ignited = false, i = 0
    while (i < 80 && !ignited) {
        step(gs, i === 0 ? { castL: true } : {})
        for (const e of gs.events) if (e.type === 'ignite') ignited = true
        gs.events.length = 0
        i++
    }
    let j = 0
    while (j < 260 && !hs.dead) { step(gs, {}); gs.events.length = 0; j++ }
    r.check('a hut in the blast ignites and burns to rubble', ignited && hs.dead, `ignited=${ignited} dead=${hs.dead}`)
}

// ---- mana conservation through a real campaign (vault + pouch + pearls + hoard)
{
    const gs = makeGame(7)
    const pearlMana = (s) => s.pearls.reduce((a, p) => a + (p.alive ? p.m : 0), 0)
    const total = (s) => Math.floor(s.bank) + Math.floor(s.mana) + pearlMana(s) + (s.wizard.alive ? s.wizard.mana : 0)
    let t0 = total(gs)
    let spent = 0, bounty = 0
    let i = 0
    while (!gs.end && i < 120000) {
        step(gs, autopilot(gs))
        for (const e of gs.events) {
            if (e.type === 'cast') spent += spellById(e.id).cost
            if (e.type === 'kill') bounty += BOUNTY[e.kind]
            if (e.type === 'spill') spent += e.m
            if (e.type === 'level') {
                t0 -= e.reset.bank + e.reset.pearls + e.reset.hoard
                t0 += pearlMana(gs) + LEVELS[e.n].hoard
            }
        }
        gs.events.length = 0
        i++
    }
    const t1 = total(gs)
    r.check('mana conserved: vault+pouch+pearls+hoard == start + bounty − spent − spilled (world resets rebased)',
        t1 === t0 + bounty - spent, `${t0} +${bounty} -${spent} = ${t0 + bounty - spent}, saw ${t1} (end=${gs.end})`)
}

// ---- acquisition risk: the book both grants and eludes, across seeds
{
    let learns = 0, fizzles = 0
    for (let seed = 1; seed <= 40; seed++) {
        const gs = makeGame(seed)
        let i = 0
        while (!gs.end && i < 6000) {
            step(gs, autopilot(gs))
            for (const e of gs.events) {
                if (e.type === 'learn') learns++
                if (e.type === 'fizzle') fizzles++
            }
            gs.events.length = 0
            i++
        }
    }
    r.check('grimoire acquisition risk: both learn and fizzle happen', learns > 0 && fizzles > 0, `learns=${learns} fizzles=${fizzles}`)
}

// ---- spells cost carried mana and refuse without it
{
    const gs = makeGame(7)
    gs.mana = 0
    gs.coolL = 0
    step(gs, { castL: true })
    const denied = gs.events.some((e) => e.type === 'nomana' || e.type === 'deny')
    r.check('casting without mana is denied (no fireball, no debt)', denied && gs.projs.length === 0 && gs.mana === 0)
    gs.mana = 15
    step(gs, { castL: true })
    const castOk = gs.events.some((e) => e.type === 'cast') && gs.mana === 0 && gs.projs.some((p) => p.kind === 'fireball')
    r.check('fireball fires for exactly its cost from the pouch', castOk, `mana=${gs.mana}`)
}

// ---- carpet rules: cannot crash, auto-rises
{
    const gs = makeGame(7)
    let minClear = 1e9
    for (let i = 0; i < 2000 && !gs.end; i++) {
        step(gs, { up: false, down: true })
        minClear = Math.min(minClear, gs.alt)
    }
    r.check('holding down never buries the carpet', minClear > 14, `min alt ${minClear.toFixed(1)}`)
}

// ---- charge-glide: the speed button (Shift / hold ▲ in the shell → inp.boost)
// Mutation guide: set CFG.boost to 1 in sim.js and the speed check goes red;
// set CFG.boostTurn to 1 and the wide-turn check goes red.
{
    const glide = (inp) => {
        const gs = makeGame(7)
        const x0 = gs.x, y0 = gs.y
        let prevM = gs.mana, spent = 0
        for (let i = 0; i < 60 && !gs.end; i++) {
            step(gs, inp)
            if (gs.mana < prevM) spent += prevM - gs.mana
            prevM = gs.mana
        }
        return { d: Math.hypot(wrapD(gs.x - x0), wrapD(gs.y - y0)), yaw: Math.abs(gs.yaw), spent }
    }
    const sN = glide({}), sB = glide({ boost: true })
    const tN = glide({ left: true }), tB = glide({ left: true, boost: true })
    const speed = sB.d / sN.d
    const turn = tB.yaw / tN.yaw
    r.check('charge-glide: 60 boosted ticks cover ~1.6× the cruise distance',
        speed > 1.5 && speed < 1.7, `ratio ${speed.toFixed(2)} (${sN.d.toFixed(0)} → ${sB.d.toFixed(0)} u)`)
    r.check('charge-glide turns wider: heading gain ~0.55× at speed',
        turn > 0.5 && turn < 0.6, `yaw ratio ${turn.toFixed(2)} (radius ×${(speed / turn).toFixed(1)})`)
    r.check('charge-glide is mana-free (nothing spent while gliding)',
        sB.spent === 0 && tB.spent === 0, `spent ${sB.spent}/${tB.spent}`)
}

// ---- wizard hoard scatters (as pearls) when tower and wizard fall
{
    const gs = makeGame(7)
    const hoard = gs.wizard.mana
    const tx = gs.wizard.tx, ty = gs.wizard.ty
    gs.quota = 9999
    const hBefore = sampleH(gs, tx, ty)
    gs.mana = 160
    gs.wizard.hp = 14
    const before = gs.pearls.filter((p) => p.alive).reduce((a, p) => a + p.m, 0)
    let i = 0
    while (gs.wizard.alive && i < 4000) { step(gs, autopilot(gs)); i++ }
    const after = gs.pearls.filter((p) => p.alive).reduce((a, p) => a + p.m, 0) + Math.floor(gs.mana)
    const hAfter = sampleH(gs, tx, ty)
    r.check('slaying the wizard scatters his hoard as pearls and craters his tower',
        !gs.wizard.alive && after >= before + hoard - 15 && hBefore - hAfter >= 3,
        `pearl mana ${before} → ${after} (hoard ${hoard}), tower ground ${hBefore.toFixed(0)} → ${hAfter.toFixed(0)}`)
}

// ---- the roster is all castable and learnable
r.check('six signature spells with costs', SPILLS.length === 6 &&
    ['fireball', 'lightning', 'heal', 'protect', 'slow', 'telekinesis'].every((id) => spellById(id)?.cost > 0))

// ---- browser pass: boots in Chrome, starts, drives through the contract, zero errors
await requireDevServer(`http://localhost:${process.env.DEV_PORT || 5173}/retrogames/magic-carpet`)
const browser = await launch()
const page = await openGame(browser, { url: `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/magic-carpet`, hook: '__game', start: false })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

const meta = await page.evaluate(() => window.__game.meta)
r.check('contract meta magic-carpet with A+B', meta?.id === 'magic-carpet' && meta.buttons.includes('a') && meta.buttons.includes('b'))
const png = await page.evaluate(() => window.__game.frame())
r.check('frame() paints the world', typeof png === 'string' && png.startsWith('data:image/png') && png.length > 2000, `${png?.length}b`)
const det = await page.evaluate(() => {
    const g = window.__game
    const runIt = () => {
        g.reset(7)
        for (let i = 0; i < 200; i++) g.step({ up: i % 4 < 2, a: i % 13 < 2 }, 1)
        return g.state()
    }
    const a = runIt(); const b = runIt()
    g.release()
    return { same: a.hash === b.hash, tick: a.tick, done: a.done }
})
r.check('browser determinism: reset(7)+200 twice → same hash', det.same && det.tick === 200, JSON.stringify(det))
const hooked = await page.evaluate(() => {
    const t = window.__carpetTest
    t.start()
    return t.probe().screen
})
r.check('__carpetTest starts play mode', hooked === 'play', hooked)
await page.waitForTimeout(700)
const live = await page.evaluate(() => window.__carpetTest.probe())
r.check('play mode ticks with no stuck loop', live.tick > 20, `tick=${live.tick}`)
r.check('zero page errors', errs.length === 0, errs.join(' | '))
await browser.close()

r.exit()
