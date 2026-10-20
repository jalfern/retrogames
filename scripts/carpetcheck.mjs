// carpetcheck.mjs — MAGIC CARPET proof: boots, rules hold, world reaches equilibrium.
//
// Node-first (sim is pure), then a short real-browser pass via the game contract.
// Run: npm run dev in another terminal, then `npm run carpetcheck`.
//
// Mutation guide (prove it can fail): change the win check `gs.mana >= QUOTA`
// to `gs.mana >= QUOTA * 100` in src/games/MagicCarpet/sim.js and watch
// 'equilibrium' go red; restore.

import { launch, openGame, requireDevServer, Report } from './lib/harness.mjs'
import {
    QUOTA, SPILLS, BOUNTY, MAP, spellById,
    makeGame, step, autopilot, stateHash,
} from '../src/games/MagicCarpet/sim.js'

const r = new Report('carpetcheck')
const run = (seed, maxTicks, scriptFn = autopilot) => {
    const gs = makeGame(seed)
    let i = 0
    while (!gs.end && i < maxTicks) { step(gs, scriptFn(gs)); i++ }
    return gs
}

// ---- boot
const fresh = makeGame(7)
r.check('world built: 56 pearls, wizard hoards 90, 6 books, one known spell',
    fresh.pearls.length === 56 && fresh.wizard.mana === 90 && fresh.books.length === 6 && fresh.learned.length === 1,
    `pearls=${fresh.pearls.length} hoard=${fresh.wizard.mana} books=${fresh.books.length}`)
const g0 = run(7, 600, () => ({}))
r.check('boots and steps 600 ticks idle', g0.tick === 600 && !g0.end, `tick=${g0.tick}`)

// ---- determinism
const d1 = run(7, 600), d2 = run(7, 600), d3 = run(8, 600)
r.check('seed 7 twice → identical hash', stateHash(d1) === stateHash(d2), `${stateHash(d1)} vs ${stateHash(d2)}`)
r.check('seed 8 → different hash', stateHash(d1) !== stateHash(d3))

// ---- mana conservation through a real campaign
{
    const gs = makeGame(7)
    const pearlMana = (s) => s.pearls.reduce((a, p) => a + (p.alive ? p.m : 0), 0)
    const total = (s) => Math.floor(s.mana) + pearlMana(s) + (s.wizard.alive ? s.wizard.mana : 0)
    const t0 = total(gs)
    let spent = 0, bounty = 0
    let i = 0
    while (!gs.end && i < 60000) {
        step(gs, autopilot(gs))
        for (const e of gs.events) {
            if (e.type === 'cast') spent += spellById(e.id).cost
            if (e.type === 'kill') bounty += BOUNTY[e.kind]
        }
        gs.events.length = 0
        i++
    }
    const t1 = total(gs)
    r.check('mana conserved: pool+pearls+hoard == start + monster bounty − spell cost',
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

// ---- spells cost mana and refuse without it
{
    const gs = makeGame(7)
    gs.mana = 0
    gs.coolL = 0
    step(gs, { castL: true })
    const denied = gs.events.some((e) => e.type === 'nomana' || e.type === 'deny')
    r.check('casting without mana is denied (no fireball, no debt)', denied && gs.projs.length === 0 && gs.mana === 0)
    gs.mana = 15
    step(gs, { castL: true })
    const castOk = gs.events.some((e) => e.type === 'cast') && gs.mana === 0 &&
        (gs.projs.some((p) => p.kind === 'fireball') || gs.events.some((e) => e.type === 'boom'))
    r.check('fireball fires for exactly its cost', castOk, `mana=${gs.mana}`)
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
    const wrapD = (v) => ((v + MAP / 2) % MAP + MAP) % MAP - MAP / 2
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

// ---- death and the castle's mercy
{
    const gs = makeGame(7)
    gs.mana = 0
    gs.shield = 0
    gs.hp = 6
    const wolf = gs.monsters.find((m) => m.kind === 'wolf')
    wolf.x = gs.x + 3; wolf.y = gs.y; wolf.grabbed = false
    let i = 0
    while (!gs.end && i < 400) {
        step(gs, {})
        if (gs.monsters.includes(wolf)) { wolf.x = gs.x + 3; wolf.y = gs.y; wolf.grabbed = false; wolf.cool = 0 }
        i++
    }
    r.check('dying with an empty castle ends the flight', gs.end === 'dead', `end=${gs.end} hp=${gs.hp}`)
    const gs2 = makeGame(7)
    gs2.mana = 40
    gs2.shield = 0
    gs2.hp = 6
    const w2 = gs2.monsters.find((m) => m.kind === 'wolf')
    w2.x = gs2.x + 3; w2.y = gs2.y
    let j = 0
    while (gs2.deaths === 0 && j < 400) {
        step(gs2, {})
        if (gs2.monsters.includes(w2)) { w2.x = gs2.x + 3; w2.y = gs2.y; w2.grabbed = false; w2.cool = 0 }
        j++
    }
    r.check('dying while the castle stands respawns you', gs2.deaths === 1 && !gs2.end && gs2.hp === 100, `deaths=${gs2.deaths} hp=${gs2.hp}`)
}

// ---- wizard hoard scatters when he falls
{
    const gs = makeGame(7)
    const hoard = gs.wizard.mana
    gs.mana = 160
    gs.wizard.hp = 14
    const before = gs.pearls.filter((p) => p.alive).reduce((a, p) => a + p.m, 0)
    let i = 0
    while (gs.wizard.alive && i < 2000) { step(gs, autopilot(gs)); i++ }
    const after = gs.pearls.filter((p) => p.alive).reduce((a, p) => a + p.m, 0)
    r.check('slaying the wizard scatters his hoard as pearls', !gs.wizard.alive && after >= before + hoard - 15,
        `pearl mana ${before} → ${after} (hoard ${hoard})`)
}

// ---- equilibrium: the campaign is winnable
{
    const gs = run(7, 60000)
    r.check('equilibrium reached: seed 7 autopilot wins with the quota banked',
        gs.end === 'win' && gs.mana >= QUOTA, `end=${gs.end} mana=${Math.floor(gs.mana)}/${QUOTA} tick=${gs.tick}`)
    const gs2 = run(88, 60000)
    r.check('seed 88 also reaches equilibrium', gs2.end === 'win', `end=${gs2.end}`)
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
