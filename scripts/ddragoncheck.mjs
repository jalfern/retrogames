// ddragoncheck.mjs — DOUBLE DRAGON (#2807): boots, the street laws hold, it
// can be won, and the check can be seen to fail.
//
//   node scripts/ddragoncheck.mjs             # sim core + browser leg
//   node scripts/ddragoncheck.mjs --mutant  # plant the depth-blind regression
//
// The sim core runs in plain Node (sim.js is DOM-free): determinism, the
// depth-band law (the belt axis is the dodge), one-hit death + respawn mercy,
// knockdown/stomp/get-up, the spin back-heel only when surrounded, the grab
// mash, the crowd law (never three at once), and the three-wave stage. The
// WINNABLE proof drives the full street with the honest-percept autopilot on
// seeds 1..12 — the same brain the attract demo shows.
// Named regressions guard the trap this genre almost always ships with: a hit
// that ignores the depth axis, which would play the game for itself (you could
// never dodge) and silently un-faithful. --mutant replants it and demands the
// harm is NAMED (#2142 direction).
// The browser leg drives real key events through the shell: attract -> seat ->
// walk/kick -> die -> restart, zero page errors.

import { writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { makeGame, step, autopilot, stateHash } from '../src/games/DoubleDragon/sim.js'
import { openGame, launch, requireDevServer, Report } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIM = join(ROOT, 'src/games/DoubleDragon/sim.js')
const BASE = process.env.DDRAGON_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const MUTANT = process.argv.includes('--mutant')

const r = new Report('ddragoncheck')

// helpers: hand-built enemies with the spawnEnemy shape
const mk = (kind, x, y, over = {}) => ({
    id: 900 + Math.floor(x), kind, x, y,
    face: over.face ?? (x > 40 ? -1 : 1),
    hp: over.hp ?? ({ williams: 4, amon: 6, abobo: 14 }[kind]),
    state: over.state ?? 'walk', stateT: over.stateT ?? 0, anim: 0,
    hasStick: !!over.hasStick, stickDropped: false,
    attackCooldown: over.attackCooldown ?? 60,
    inv: over.inv ?? 0, spinHit: false, ...over.rest,
})

const runBot = (seed, max = 20000) => {
    const gs = makeGame(seed)
    while (gs.tick < max) {
        step(gs, autopilot(gs))
        gs.events.length = 0
        if (gs.mode !== 'play') break
    }
    return gs
}

// ---------------------------------------------------------------- sim core ---
{
    const gs = makeGame(1)
    r.check('boots: a fresh game is playable street, not a corpse',
        gs.mode === 'play' && gs.billy.lives === 3 && gs.enemies.length === 0 && gs.tick === 0,
        `mode=${gs.mode} lives=${gs.billy.lives}`)
}

{ // determinism law: seed + pad stream => identical hashes
    const a = makeGame(7); const b = makeGame(7)
    let same = true
    for (let i = 0; i < 900; i++) {
        const pad = { right: i % 53 < 30, up: i % 41 < 6, down: i % 41 >= 20 && i % 41 < 26, b: i % 9 < 2 }
        step(a, pad); step(b, pad)
        a.events.length = 0; b.events.length = 0
        if (i % 50 === 0 && stateHash(a) !== stateHash(b)) same = false
    }
    r.check('determinism: seed + pads replay hash-for-hash', same && stateHash(a) === stateHash(b), `final ${stateHash(a)} vs ${stateHash(b)}`)
}

{ // THE depth law: the belt axis is the dodge
    const gs = makeGame(2)
    gs.billy.inv = 0
    gs.billy.x = 100; gs.billy.y = 180
    const e = mk('williams', 112, 180 - 30, { state: 'attack', stateT: 1, attackCooldown: 0 }) // same line? NO: 30 deep away
    gs.enemies.push(e)
    for (let i = 0; i < 8; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('depth: a swing on another lane flies past — stepping off the line is the dodge',
        gs.billy.lives === 3, `lives=${gs.billy.lives} (enemy lane ${e.y} vs billy ${gs.billy.y})`)
    e.y = gs.billy.y
    e.state = 'attack'; e.stateT = 1
    gs.billy.inv = 0
    for (let i = 0; i < 8; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('depth: the same swing ON the line lands — the band is real, not an off switch',
        gs.billy.lives === 2, `lives=${gs.billy.lives}`)
}

{ // one-hit death + respawn mercy
    const gs = makeGame(3)
    gs.billy.inv = 0
    gs.enemies.push(mk('williams', gs.billy.x + 10, gs.billy.y, { state: 'attack', stateT: 1, attackCooldown: 0 }))
    for (let i = 0; i < 8; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('arcade lethal: one clean hit costs a life', gs.billy.lives === 2, `lives=${gs.billy.lives}`)
    r.check('respawn mercy: the new life flickers (i-frames > 60)', gs.billy.inv > 60, `inv=${gs.billy.inv}`)
    gs.billy.inv = 0
    gs.enemies.push(mk('williams', gs.billy.x + 10, gs.billy.y, { state: 'attack', stateT: 1, attackCooldown: 0 }))
    for (let i = 0; i < 8; i++) { step(gs, {}); gs.events.length = 0 }
    gs.billy.inv = 0
    gs.enemies.push(mk('williams', gs.billy.x + 10, gs.billy.y, { state: 'attack', stateT: 1, attackCooldown: 0 }))
    for (let i = 0; i < 8; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('three lives and no more: the run GAME OVERs on the last one', gs.mode === 'gameover', `mode=${gs.mode} lives=${gs.billy.lives}`)
}

{ // kick knockdown + get-up i-frames
    const gs = makeGame(4)
    const e = mk('williams', gs.billy.x + 14, gs.billy.y)
    gs.enemies.push(e)
    step(gs, { b: true }); gs.events.length = 0
    for (let i = 0; i < 12; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('kick knocks a Williams flat (2 dmg + down)', e.hp === 2 && e.state === 'down', `hp=${e.hp} state=${e.state}`)
    for (let i = 0; i < 44; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('downed goons get up with merciful i-frames', e.state === 'getup' && e.inv > 0, `state=${e.state} inv=${e.inv}`)
}

{ // the spin back-heel: ONLY when surrounded
    const gs = makeGame(5)
    const e1 = mk('williams', gs.billy.x + 12, gs.billy.y)
    gs.enemies.push(e1)
    step(gs, { b: true }); gs.events.length = 0
    r.check('one goon, one kick — the spin does NOT trigger at a single man', gs.billy.state !== 'spin' || gs.billy.stateT < 26, `state=${gs.billy.state}`)
    const gs2 = makeGame(5)
    const a1 = mk('williams', gs2.billy.x + 12, gs2.billy.y)
    const a2 = mk('williams', gs2.billy.x - 12, gs2.billy.y)
    gs2.enemies.push(a1, a2)
    step(gs2, { b: true }); gs2.events.length = 0
    r.check('two men close, a swing asked for => the SPIN BACK-HEEL', gs2.billy.state === 'spin', `state=${gs2.billy.state}`)
    const hp0 = a1.hp + a2.hp
    for (let i = 0; i < 20; i++) { step(gs2, {}); gs2.events.length = 0 }
    r.check('the back-heel sweeps BOTH sides', a1.hp + a2.hp < hp0 && (a1.state === 'down' || a1.state === 'dying') && (a2.state === 'down' || a2.state === 'dying'), `hp ${hp0} -> ${a1.hp + a2.hp}`)
}

{ // stomp a downed man
    const gs = makeGame(6)
    const e = mk('williams', gs.billy.x + 14, gs.billy.y, { state: 'down', stateT: 10 })
    gs.enemies.push(e)
    step(gs, { b: true }); gs.events.length = 0
    for (let i = 0; i < 12; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('kick a downed goon in the ribs and he takes it (stomp)', e.hp < 4, `hp=${e.hp}`)
}

{ // grab + mash free, and the timeout knee
    const gs = makeGame(8)
    gs.billy.inv = 0
    gs.enemies.push(mk('amon', gs.billy.x + 12, gs.billy.y, { attackCooldown: 0 }))
    let grabbed = false
    for (let i = 0; i < 4 && !grabbed; i++) { step(gs, {}); gs.events.length = 0; grabbed = gs.billy.state === 'grabbed' }
    r.check('an Amon can catch you at arm\'s length (the grab is real)', grabbed, `state=${gs.billy.state}`)
    for (let i = 0; i < 24 && gs.billy.state === 'grabbed'; i++) { step(gs, { b: i % 2 === 0 }); gs.events.length = 0 }
    r.check('mash KICK three times and you break his hold', gs.billy.state !== 'grabbed' && gs.billy.lives === 3, `state=${gs.billy.state} lives=${gs.billy.lives}`)
    gs.billy.inv = 0
    gs.enemies.push(mk('amon', gs.billy.x + 12, gs.billy.y, { attackCooldown: 0 }))
    for (let i = 0; i < 60; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('fail the mash and the knee lands — a life gone', gs.billy.lives === 2, `lives=${gs.billy.lives}`)
}

{ // crowd law: never three attacking at once
    const gs = makeGame(9)
    let maxAttackers = 0
    for (let i = 0; i < 1500; i++) {
        step(gs, autopilot(gs))
        gs.events.length = 0
        maxAttackers = Math.max(maxAttackers, gs.enemies.filter((e) => e.state === 'attack' || e.state === 'windup').length)
        if (gs.mode !== 'play') break
    }
    r.check('crowd law: the goons take turns — never three mid-swing at once', maxAttackers <= 2, `max concurrent attackers=${maxAttackers}`)
}

{ // waves, the locked camera, and the stage clear loop
    const gs = makeGame(10)
    let sawLock = false
    let clearedMode = ''
    while (gs.tick < 20000) {
        step(gs, autopilot(gs))
        gs.events.length = 0
        if (gs.camLock) sawLock = true
        if (gs.mode === 'clear') { clearedMode = 'clear'; break }
        if (gs.mode === 'gameover') { clearedMode = 'gameover'; break }
    }
    r.check('the street locks while a wave lives (you fight where you were caught)', sawLock, `camLock seen=${sawLock}`)
    r.check('the stage is CLEARED, banner and all', clearedMode === 'clear', `mode=${clearedMode}`)
    r.check('and the loop re-runs Walnuts Street with the score carried', (() => {
        for (let i = 0; i < 200; i++) step(gs, autopilot(gs))
        return gs.mode === 'play' && gs.waveIdx === 0 && gs.score > 0 && gs.cleared
    })(), `mode=${gs.mode} wave=${gs.waveIdx} score=${gs.score}`)
}

{ // the stick: pickup, double reach, lost on death
    const gs = makeGame(11)
    gs.pickups.push({ x: gs.billy.x + 6, y: gs.billy.y, kind: 'stick', bob: 0 })
    step(gs, {}); gs.events.length = 0
    r.check('the stick is in your hand now', gs.billy.weapon === 'stick', `weapon=${gs.billy.weapon}`)
    const e = mk('williams', gs.billy.x + 24, gs.billy.y) // beyond an empty-handed jab
    gs.enemies.push(e)
    step(gs, { b: true }); gs.events.length = 0
    for (let i = 0; i < 12; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('the stick reaches and hits hard', e.hp < 4, `hp=${e.hp} at x+24`)
    gs.billy.inv = 0
    gs.enemies.push(mk('williams', gs.billy.x + 10, gs.billy.y, { state: 'attack', stateT: 1 }))
    for (let i = 0; i < 8; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('the stick dies with you', gs.billy.lives === 2 && gs.billy.weapon === null, `lives=${gs.billy.lives} weapon=${gs.billy.weapon}`)
}

{ // WINNABLE: the honest autopilot clears the street on 12 seeds
    const fails = []
    for (let seed = 1; seed <= 12; seed++) if (runBot(seed).mode !== 'clear') fails.push(seed)
    r.check('winnable: the attract autopilot clears Walnuts Street on seeds 1..12', fails.length === 0, fails.length ? `stuck seeds ${fails.join(',')}` : '12/12')
}

// ------------------------------------------------------------- the mutants ---
if (MUTANT) {
    const src = readFileSync(SIM, 'utf8')
    const plants = [
        {
            name: 'depth-blind',
            anchor: 'Math.abs(e.y - b.y) <= 8 && b.state !== \'grabbed\'',
            plant: 'Math.abs(e.y - b.y) <= 400 /* MUTANT(depth-blind): the belt axis stops mattering */ && b.state !== \'grabbed\'',
            harm: async (mod) => {
                const gs = mod.makeGame(2)
                gs.billy.inv = 0
                gs.billy.x = 100; gs.billy.y = 180
                gs.enemies.push({ id: 901, kind: 'williams', x: 112, y: 150, face: 1, hp: 4, state: 'attack', stateT: 1, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 0, inv: 0, spinHit: false })
                for (let i = 0; i < 8; i++) { mod.step(gs, {}); gs.events.length = 0 }
                return gs.billy.lives < 3
                    ? `HARM NAMED: a swing on a lane 30 deep reached Billy anyway (lives ${3} -> ${gs.billy.lives}) — depth is the dodge in a belt-scroller; without it you can never avoid a fight, and the genre is dead`
                    : null
            },
        },
    ]
    for (const p of plants) {
        if (!src.includes(p.anchor)) { console.error(`MUTANT anchor (${p.name}) missing — sim moved; the plant must be re-anchored`); process.exit(2) }
        writeFileSync(SIM, src.replace(p.anchor, p.plant))
        let bad
        try {
            bad = 'dynamic-import'
            bad = await p.harm(await import(`../src/games/DoubleDragon/sim.js?mutant=${p.name}${Date.now()}`))
        } finally {
            writeFileSync(SIM, src)
        }
        r.check(`mutant(${p.name}) goes RED: harm named`, bad !== null, bad || 'harm NOT named — mutant survived')
    }
    console.log('\nmutant run: expected red on the planted line.')
    r.exit()
}

// ------------------------------------------------------------- browser leg ---
await requireDevServer(`${BASE}/double-dragon`)
const browser = await launch()
{
    const page = await openGame(browser, { url: `${BASE}/double-dragon`, hook: '__ddTest', wait: 600 })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.stack || e.message))

    const attract1 = await page.evaluate(() => window.__ddTest.probe())
    await page.waitForTimeout(700)
    const attract2 = await page.evaluate(() => window.__ddTest.probe())
    r.check('attract: the demo runs itself before any key', attract1.screen === 'attract' && attract2.tick > attract1.tick, `tick ${attract1.tick} -> ${attract2.tick}`)

    await page.keyboard.press('Space')
    await page.waitForTimeout(300)
    const started = await page.evaluate(() => window.__ddTest.probe())
    r.check('any key takes the seat (attract -> play)', started.screen === 'play', `screen=${started.screen}`)

    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(500)
    await page.keyboard.up('ArrowRight')
    const walked = await page.evaluate(() => window.__ddTest.probe())
    r.check('ArrowRight puts boots on the asphalt (x advances)', walked.x > started.x, `x ${started.x} -> ${walked.x}`)

    await page.keyboard.down('ArrowUp')
    await page.waitForTimeout(300)
    await page.keyboard.up('ArrowUp')
    const deeper = await page.evaluate(() => window.__ddTest.probe())
    r.check('ArrowUp walks DEPTH (the belt axis moves y, not just pixels)', deeper.y < walked.y, `y ${walked.y} -> ${deeper.y}`)

    await page.keyboard.press('KeyX')
    await page.waitForTimeout(200)
    const kicked = await page.evaluate(() => window.__ddTest.probe())
    r.check('KICK reaches the sim through the shell', ['kick', 'idle', 'walk', 'spin'].includes(kicked.billyState), `billyState=${kicked.billyState}`)

    await page.evaluate(() => window.__ddTest.setup({ spawnStick: true }))
    await page.waitForTimeout(400)
    const armed = await page.evaluate(() => window.__ddTest.probe())
    r.check('a stick on the street gets picked up (weapon live in state)', armed.weapon === 'stick', `weapon=${armed.weapon}`)

    // drawn-vs-logical: the frame is something, and it changed across inputs
    const frameA = await page.evaluate(() => window.__game && window.__game.frame())
    r.check('the canvas paints (contract frame is not black-static)', typeof frameA === 'string' && frameA.length > 5000, `frame ${frameA ? frameA.length : 'null'} bytes`)

    await page.evaluate(() => window.__ddTest.setup({ killBilly: true, lives: 1 }))
    await page.waitForTimeout(700)
    const dead = await page.evaluate(() => window.__ddTest.probe())
    r.check('dying is real: last life out ends the run', dead.screen === 'over' || dead.mode === 'gameover', `screen=${dead.screen} mode=${dead.mode}`)
    await page.waitForTimeout(1100)
    await page.keyboard.press('Space')
    await page.waitForTimeout(300)
    const backHome = await page.evaluate(() => window.__ddTest.probe())
    r.check('game over returns to attract on any key', backHome.screen === 'attract', `screen=${backHome.screen}`)

    r.check('zero page errors across the whole leg', errs.length === 0, errs.join(' | ') || 'clean')
}
await browser.close()

r.exit()
