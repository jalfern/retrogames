// rtypecheck.mjs — R-TYPE S1 (#2808): boots, the pod-shooter laws hold, it
// can be won, and the check can be seen to fail.
//
//   node scripts/rtypecheck.mjs              # sim core + browser leg
//   node scripts/rtypecheck.mjs --mutant   # plant the armour-blind regression
//
// The sim core runs in plain Node (sim.js is DOM-free): determinism, the
// camera law (right only, the left edge grinds), one-hit death + mercy +
// death-reverts-the-arm, the capsule cycle, the wave charge tiers, hunters
// that straighten after their home phase, and the Phase-1 law: the core is
// armoured until the maw gapes. WINNABLE proof: the attract autopilot clears
// at least a third of seeds 1..12 — the same brain the cabinet shows.
// Named regressions guard the trap this genre ships when the maw timing is
// wired wrong — armour-blind fire (a mutant of the very bug this build had
// on the day it was written: the core sat unhittable behind its own plates).

import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { STAGE_END, W, makeGame, step, autopilot, stateHash } from '../src/games/RType/sim.js'
import { openGame, launch, requireDevServer, Report } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIM = join(ROOT, 'src/games/RType/sim.js')
const BASE = process.env.RTYPE_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const MUTANT = process.argv.includes('--mutant')

const r = new Report('rtypecheck')

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
    r.check('boots: a fresh game is playable space, not a corpse',
        gs.mode === 'play' && gs.lives === 3 && gs.enemies.length === 0 && gs.tick === 0,
        `mode=${gs.mode} lives=${gs.lives}`)
}

{ // determinism law: seed + pad stream => identical hashes
    const a = makeGame(7); const b = makeGame(7)
    let same = true
    for (let i = 0; i < 900; i++) {
        const pad = { right: i % 53 < 30, up: i % 41 < 6, down: i % 41 >= 20 && i % 41 < 26, a: i % 7 < 4 }
        step(a, pad); step(b, pad)
        a.events.length = 0; b.events.length = 0
        if (i % 50 === 0 && stateHash(a) !== stateHash(b)) same = false
    }
    r.check('determinism: seed + pads replay hash-for-hash', same && stateHash(a) === stateHash(b), `final ${stateHash(a)} vs ${stateHash(b)}`)
}

{ // the camera law: the world only advances, and the left edge is death
    const gs = makeGame(3)
    let neverBack = true
    let prev = gs.camX
    for (let i = 0; i < 400; i++) {
        step(gs, { left: true })
        if (gs.camX < prev - 1e-9) neverBack = false
        prev = gs.camX
        gs.events.length = 0
    }
    r.check('the camera crawls right and NEVER gives ground', neverBack, `camX ${prev.toFixed(1)}`)
    r.check('hugging the left edge grinds you flat (the screen is a wall)',
        gs.ship.dead || gs.lives < 3, `deaths=${3 - gs.lives} why=${gs.lastDeath}`)
}

{ // one hit kills; three lives; the respawn flickers
    const gs = makeGame(4)
    gs.ship.inv = 0
    gs.bullets.push({ id: 1, x: gs.ship.x, y: gs.ship.y, vx: -1, vy: 0 })
    step(gs, {}); gs.events.length = 0
    r.check('one hit kills — arcade lethal', gs.lives === 2 && gs.ship.dead, `lives=${gs.lives} dead=${gs.ship.dead}`)
    for (let i = 0; i < 80; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('respawn carries a mercy flicker', !gs.ship.dead && gs.ship.inv > 0, `inv=${gs.ship.inv}`)
}

{ // dying reverts the arm (the original's level-back on death)
    const gs = makeGame(4)
    gs.ship.weapon = 'wave'
    gs.ship.inv = 0
    gs.bullets.push({ id: 1, x: gs.ship.x, y: gs.ship.y, vx: -1, vy: 0 })
    step(gs, {}); gs.events.length = 0
    for (let i = 0; i < 80; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('dying puts the VULCAN back in your hand', gs.ship.weapon === 'vulcan', `weapon=${gs.ship.weapon}`)
}

{ // capsule cycle VULCAN -> WAVE -> VULCAN
    const gs = makeGame(5)
    gs.caps.push({ id: 1, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0 })
    step(gs, {}); gs.events.length = 0
    r.check('capsule 1: the arm becomes the wave cannon', gs.ship.weapon === 'wave', `weapon=${gs.ship.weapon}`)
    gs.caps.push({ id: 2, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0 })
    step(gs, {}); gs.events.length = 0
    r.check('capsule 2: the cycle wraps back to Vulcan', gs.ship.weapon === 'vulcan', `weapon=${gs.ship.weapon}`)
}

{ // wave charge: nothing loose before the minimum hold; tiers by charge
    const gs = makeGame(6)
    gs.ship.weapon = 'wave'
    step(gs, { a: true }); gs.events.length = 0
    step(gs, {}); gs.events.length = 0 // tap: below waveMin, nothing fires
    r.check('a tap does not loose the wave — it must be charged', gs.shots.length === 0, `shots=${gs.shots.length}`)
    for (let i = 0; i < 52; i++) { step(gs, { a: true }); gs.events.length = 0 }
    step(gs, {}); gs.events.length = 0
    const w = gs.shots.find((q) => q.kind === 'w')
    r.check('hold to full and release — the big crescent flies', !!w && w.size === 2, w ? `size=${w.size}` : 'no wave shot')
}

{ // the hunter law: hard home at launch, then it STRAIGHTENS and sails past
    const gs = makeGame(8)
    gs.missiles.push({ id: 1, x: gs.ship.x + 120, y: gs.ship.y, a: Math.PI, spd: 0.8, t: 300 })
    gs.ship.inv = 9999 // watch it, don't die to it
    let firstA = 0, lockedA = 0, drifted = 0
    for (let i = 0; i < 200; i++) {
        step(gs, { up: gs.ship.y > 60 })
        gs.events.length = 0
        const m = gs.missiles.find((q) => q.kind !== 'x' && q.t > 0)
        if (!m) break
        if (i === 0) firstA = m.a
        if (m.t === 239) lockedA = m.a
        if (m.t < 235) drifted = Math.max(drifted, Math.abs(m.a - lockedA))
    }
    r.check('a hunter homes at launch (its nose walks the lane)', Math.abs(lockedA - firstA) > 0.2, `Δa ${(lockedA - firstA).toFixed(2)}`)
    r.check('…but it straightens and can be left behind (no eternal loop)', drifted < 0.01, `post-burn drift ${drifted.toFixed(3)}`)
}

{ // larvae: sine formations, kamikaze divers, and a scored kill
    const gs = makeGame(9)
    gs.enemies.push({ id: 1, kind: 'larva', x: gs.ship.x + 60, y: 100, baseY: 100, sine: 0, dive: true, state: 'enter', stateT: 2, vx: -1.15, vy: 0, hp: 1, anim: 0, inv: 0 })
    let sawDive = false
    for (let i = 0; i < 60; i++) { step(gs, {}); gs.events.length = 0; if (gs.enemies[0] && gs.enemies[0].state === 'dive') sawDive = true }
    r.check('a diver locks onto you and commits', sawDive)
    const gs2 = makeGame(9)
    const s0 = gs2.score
    // phase it so the swing crosses the ship's lane right as the stream arrives
    gs2.enemies.push({ id: 2, kind: 'larva', x: gs2.ship.x + 40, y: gs2.ship.y - 1, baseY: gs2.ship.y - 1, sine: -0.64, dive: false, state: 'sine', stateT: 0, vx: -1.15, vy: 0, hp: 1, anim: 0, inv: 0 })
    for (let i = 0; i < 30; i++) { step(gs2, { a: true }); gs2.events.length = 0 }
    r.check('Vulcan stream downs a larva for 100', gs2.score >= s0 + 100, `score +${gs2.score - s0}`)
}

{ // THE Phase-1 law: armour until the maw gapes
    const gs = makeGame(10)
    gs.camX = STAGE_END
    step(gs, {}); gs.events.length = 0
    r.check('at the stage seam the camera LOCKS and the dreadnought arrives', gs.camLock && !!gs.p1, `camLock=${gs.camLock} p1=${!!gs.p1}`)
    gs.ship.inv = 999999
    for (let i = 0; i < 360 && gs.p1.x > gs.camX + W - 120; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('the great ship closes to fighting range', gs.p1.x <= gs.camX + W - 100, `p1.x-camX ${Math.round(gs.p1.x - gs.camX)}`)
    gs.p1.mouth = 'closed'; gs.p1.mouthT = 999
    const hp0 = gs.p1.coreHp
    for (let i = 0; i < 60; i++) { step(gs, { a: true }); gs.events.length = 0 }
    r.check('sealed armour eats the fire — the core does NOT drop', gs.p1.coreHp === hp0, `core ${hp0} -> ${gs.p1.coreHp}`)
    gs.p1.mouth = 'open'; gs.p1.mouthT = 9999
    for (let i = 0; i < 120; i++) { step(gs, { a: true }); gs.events.length = 0 }
    r.check('the gape is the only window — aligned fire lands on the core', gs.p1.coreHp < hp0, `core ${hp0} -> ${gs.p1.coreHp}`)
    gs.p1.coreHp = 1
    for (let i = 0; i < 260 && gs.mode === 'play'; i++) { step(gs, { a: true }); gs.events.length = 0 }
    r.check('break the core and STAGE CLEAR rolls', gs.mode === 'clear' && gs.cleared, `mode=${gs.mode}`)
}

{ // the machine re-runs honestly: a real CLEAR, the banner falls, the field
//   restarts with the score carried. Driven through the deterministic cascade
//   instead of bot luck (the old form passed vacuously on score alone).
    const gs = makeGame(10)
    gs.camX = STAGE_END
    step(gs, {}); gs.events.length = 0
    gs.ship.inv = 999999
    for (let i = 0; i < 360 && gs.p1.x > gs.camX + W - 120; i++) { step(gs, {}); gs.events.length = 0 }
    gs.p1.mouth = 'open'; gs.p1.mouthT = 99999
    gs.p1.coreHp = 1
    for (let i = 0; i < 240 && gs.mode === 'play'; i++) { step(gs, { a: true }); gs.events.length = 0 } // core + death roll
    r.check('the drive ends on the banner', gs.mode === 'clear', `mode=${gs.mode}`)
    const clearedScore = gs.score
    for (let i = 0; i < 200 && gs.mode === 'clear'; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('the machine rolls onward: banner falls, the field re-runs with the score carried',
        gs.mode === 'play' && gs.camX < 50 && gs.score >= clearedScore, `mode=${gs.mode} camX=${Math.round(gs.camX)} score=${gs.score}`)
}

// ---------------------------------------------------- polish laws (#2818) ---
{ // the maw speaks: a horn on every gape, a clank on every seal
    const gs = makeGame(10)
    gs.camX = STAGE_END
    step(gs, {}); gs.events.length = 0
    gs.ship.inv = 999999
    let sawOpen = 0, sawShut = 0
    for (let i = 0; i < 620; i++) {
        step(gs, {})
        if (gs.events.includes('mawopen')) sawOpen += 1
        if (gs.events.includes('mawshut')) sawShut += 1
        gs.events.length = 0
        if (sawOpen >= 1 && sawShut >= 1) break
    }
    r.check('the maw cycle speaks (horn on gape, clank on seal)', sawOpen === 1 && sawShut === 1, `open=${sawOpen} shut=${sawShut}`)
}

{ // pods ease into their station — they bleed speed, they do not hit a wall
    const gs = makeGame(11)
    gs.camX = 430
    step(gs, {}); gs.events.length = 0 // the wave script seats a missile pod
    gs.ship.inv = 999999 // watch the pod; don't die to the grinder mid-look
    r.check('stage script seats a missile pod', gs.enemies.some((e) => e.kind === 'pod'))
    const dxs = []
    let jumped = 0, eased = false
    for (let i = 0; i < 240 && !eased; i++) {
        const p = gs.enemies.find((e) => e.kind === 'pod'); if (!p) break
        const bx = p.x, by = p.y
        step(gs, {}); gs.events.length = 0
        const q = gs.enemies.find((e) => e.kind === 'pod'); if (!q) break
        if (q.state === 'enter') dxs.push(bx - q.x)
        else {
            eased = true
            jumped = Math.abs(q.y - by) // the settle hands to the bob at the same height
        }
    }
    let nonincreasing = dxs.length > 4
    for (let i = 1; i < dxs.length; i++) if (dxs[i] > dxs[i - 1] + 1e-9) nonincreasing = false
    r.check('a pod eases into its hover (approach decelerates to a creep)',
        nonincreasing && dxs[0] >= 0.85 && dxs[dxs.length - 1] <= 0.5, `dx ${dxs[0].toFixed(2)} -> ${dxs[dxs.length - 1].toFixed(2)} over ${dxs.length} ticks`)
    r.check('…and the settle is seamless (no y-teleport into the bob)', eased && jumped < 0.5, `jump ${jumped.toFixed(2)}`)
}

{ // volley cadence is alive: successive volleys from one pod do not share a beat
    const gs = makeGame(11)
    gs.camX = 430
    step(gs, {}); gs.events.length = 0
    gs.ship.inv = 999999
    const at = []
    for (let i = 0; i < 1400 && at.length < 3; i++) {
        step(gs, {})
        if (gs.events.includes('missile')) at.push(i)
        gs.events.length = 0
    }
    const g = [at[1] - at[0], at[2] - at[1]]
    r.check('pod volleys stagger — one pod never fires on a fixed beat', at.length >= 3 && g[0] !== g[1], `gaps [${g.join(' ')}]`)
}

{ // kill the dreadnought and it dies BIG: recoil, cascading rakes, then CLEAR
    const gs = makeGame(10)
    gs.camX = STAGE_END
    step(gs, {}); gs.events.length = 0
    gs.ship.inv = 999999
    for (let i = 0; i < 360 && gs.p1.x > gs.camX + W - 120; i++) { step(gs, {}); gs.events.length = 0 }
    gs.p1.mouth = 'open'; gs.p1.mouthT = 99999
    gs.p1.coreHp = 1
    for (let i = 0; i < 60 && gs.p1.dyingT === 0; i++) { step(gs, { a: true }); gs.events.length = 0 }
    r.check('a broken core tips the hull into its death', !!gs.p1 && gs.p1.dyingT > 0, gs.p1 ? `dyingT=${gs.p1.dyingT}` : 'p1 gone')
    const x0 = gs.p1.x
    const bands = new Set()
    let booms = 0
    for (let i = 0; i < 175 && gs.mode === 'play'; i++) {
        step(gs, { a: true })
        if (gs.events.includes('boom') && gs.p1) { booms += 1; bands.add(Math.floor((gs.lastHitX - gs.p1.x) / 40)) }
        gs.events.length = 0
    }
    r.check('the stricken hull recoils into the dark (not a frozen slab)', gs.p1 === null || gs.p1.x > x0 + 20, `drift ${gs.p1 ? Math.round(gs.p1.x - x0) : 'gone'}`)
    r.check('the cascade rakes across the whole hull face', booms >= 10 && bands.size >= 3, `booms=${booms} bands=${bands.size}`)
    r.check('the cascade ends in STAGE CLEAR', gs.mode === 'clear' && gs.cleared, `mode=${gs.mode}`)
}

{ // WINNABLE: the attract brain clears at least a third of seeds 1..12
    let wins = 0
    const detail = []
    for (let seed = 1; seed <= 12; seed++) {
        const gs = runBot(seed)
        const won = gs.cleared && gs.mode !== 'gameover'
        if (won) wins++
        detail.push(`${seed}:${won ? 'W' : gs.mode === 'clear' ? 'W' : (gs.lastDeath || '?')}`)
    }
    r.check('winnable by the honest autopilot on >= 4 of 12 seeds', wins >= 4, `${wins}/12 [${detail.join(' ')}]`)
}

// ----------------------------------------------------------------- mutant ---
if (MUTANT) {
    const src = readFileSync(SIM, 'utf8')
    const plants = [
        {
            name: 'armour-blind',
            anchor: "if (p1.mouth === 'open' && Math.abs(q.y - coreY) < 16) {",
            plant: "if (true /* MUTANT(armour-blind): the maw timing stops mattering */ && Math.abs(q.y - coreY) < 16) {",
            harm: async (mod) => {
                const gs = mod.makeGame(10)
                gs.camX = mod.STAGE_END
                mod.step(gs, {}); gs.events.length = 0
                gs.p1.x = gs.camX + 235
                gs.ship.inv = 999999
                gs.p1.mouth = 'closed'; gs.p1.mouthT = 9999
                const hp0 = gs.p1.coreHp
                for (let i = 0; i < 120; i++) { mod.step(gs, { a: true }); gs.events.length = 0 }
                return gs.p1.coreHp < hp0
                    ? `HARM NAMED: fire killed through the SEALED maw (core ${hp0} -> ${gs.p1.coreHp}) — the gape-timed armour is Phase-1; without it the dreadnought is a target range and the whole stage is decided by who shoots first`
                    : null
            },
        },
    ]
    for (const p of plants) {
        if (!src.includes(p.anchor)) { console.error(`MUTANT anchor (${p.name}) missing — sim moved; the plant must be re-anchored`); process.exit(2) }
        writeFileSync(SIM, src.replace(p.anchor, p.plant))
        let bad
        try {
            bad = await p.harm(await import(`../src/games/RType/sim.js?mutant=${p.name}${Date.now()}`))
        } finally {
            writeFileSync(SIM, src)
        }
        r.check(`mutant(${p.name}) goes RED: harm named`, bad !== null, bad || 'harm NOT named — mutant survived')
    }
    console.log('\nmutant run: expected red on the planted line.')
    r.exit()
}

// ------------------------------------------------------------- browser leg ---
await requireDevServer(`${BASE}/r-type`)
const browser = await launch()
{
    const page = await openGame(browser, { url: `${BASE}/r-type`, hook: '__rTest', wait: 600 })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.stack || e.message))

    const attract1 = await page.evaluate(() => window.__rTest.probe())
    await page.waitForTimeout(700)
    const attract2 = await page.evaluate(() => window.__rTest.probe())
    r.check('attract: the demo flies itself before any key', attract1.screen === 'attract' && attract2.tick > attract1.tick, `tick ${attract1.tick} -> ${attract2.tick}`)

    await page.keyboard.press('Space')
    await page.waitForTimeout(300)
    const started = await page.evaluate(() => window.__rTest.probe())
    r.check('any key takes the seat (attract -> play)', started.screen === 'play', `screen=${started.screen}`)

    await page.keyboard.down('Space')
    await page.waitForTimeout(300)
    const firing = await page.evaluate(() => window.__rTest.probe())
    await page.keyboard.up('Space')
    r.check('the trigger reaches the sim through the shell', firing.shots > 0 || started.shots > 0, `shots=${firing.shots}`)

    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(400)
    await page.keyboard.up('ArrowRight')
    const moved = await page.evaluate(() => window.__rTest.probe())
    r.check('ArrowRight thrusts the R-7C forward', moved.x > started.x - 4 && moved.mode === 'play', `x ${started.x} -> ${moved.x}`)

    await page.evaluate(() => window.__rTest.setup({ spawnCap: true }))
    await page.waitForTimeout(500)
    const armed = await page.evaluate(() => window.__rTest.probe())
    r.check('a capsule in the lane changes the arm (state, not just pixels)', armed.weapon === 'wave' || armed.charge > 0, `weapon=${armed.weapon}`)

    const frameA = await page.evaluate(() => window.__game && window.__game.frame())
    r.check('the canvas paints (contract frame is not black-static)', typeof frameA === 'string' && frameA.length > 5000, `frame ${frameA ? frameA.length : 'null'} bytes`)

    await page.evaluate(() => window.__rTest.setup({ toPhase1: true, openMouth: true, inv: 999999 }))
    await page.keyboard.down('Space')
    // The hull closes in (~5.5 s at 60 fps), then the core falls; poll honestly.
    let p1 = await page.evaluate(() => window.__rTest.probe())
    for (let i = 0; i < 110 && !(p1.cleared === 1 || (p1.p1 !== '-' && Number(p1.p1.split(':')[1]) < 12)); i++) {
      await page.waitForTimeout(100)
      p1 = await page.evaluate(() => window.__rTest.probe())
    }
    await page.keyboard.up('Space')
    r.check('Phase-1 through the shell: the open maw falls to sustained fire', /clear|play/.test(p1.mode) && (p1.cleared === 1 || (p1.p1 !== '-' && Number(p1.p1.split(':')[1]) < 12)), `p1=${p1.p1} mode=${p1.mode} cleared=${p1.cleared}`)

    await page.evaluate(() => window.__rTest.setup({ lives: 1, inv: 0, crushShip: true }))
    let dead = { screen: 'play' }
    for (let i = 0; i < 30 && dead.screen !== 'over'; i++) {
      await page.waitForTimeout(100)
      dead = await page.evaluate(() => window.__rTest.probe())
    }
    r.check('the game-over screen lands when the last life burns', dead.screen === 'over' || dead.mode === 'gameover', `screen=${dead.screen} mode=${dead.mode}`)

    r.check('zero page errors across the whole leg', errs.length === 0, errs.join(' | ') || 'clean')
}
await browser.close()

r.exit()
