// contracheck.mjs — CONTRA S1 (the jungle, #2779): boots, rules hold, it can
// be won, and the check can be seen to fail.
//
//   node scripts/contracheck.mjs               # sim core + browser leg
//   node scripts/contracheck.mjs --mutant    # plant the spawn-shield regression
//
// The sim core runs in plain Node (sim.js is DOM-free): determinism, the 8-way
// run-and-gun law, one-hit death + respawn mercy, the SPREAD capsule, barrel
// chains, and a WINNABLE proof — the autopilot must clear the stage on every
// seed it is given (1..12). The named regression guards the trap this game
// almost shipped with: soldiers woken past the bullet-despawn edge were an
// unshootable shield and the whole stage played itself (measured 2026-11-19:
// autopilot won 8/8 with ZERO enemy bullets fired). `--mutant` replants that
// exact line and demands red, naming the harm (#2142 direction).
// The browser leg drives real key events through the shell: attract → seat →
// run/jump/fire → die → restart, with zero page errors.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { makeGame, step, autopilot, stateHash, CFG, PLATFORMS } from '../src/games/Contra/sim.js'
import { openGame, launch, requireDevServer, Report } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIM = join(ROOT, 'src/games/Contra/sim.js')
const BASE = process.env.CONTRA_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
const MUTANT = process.argv.includes('--mutant')

const r = new Report('contracheck')

// ---------------------------------------------------------------- sim core ---
const runSeed = (seed, policy = autopilot, max = 15000) => {
    const gs = makeGame(seed)
    const seen = { efire: 0, wakesOut: 0, booms: 0 }
    for (const s of gs.soldiers) s._woken = false
    while (!gs.end && gs.tick < max) {
        step(gs, policy(gs))
        for (const s of gs.soldiers) if (s.awake && !s._woken) { s._woken = true; if (s.x >= gs.cam + WVIEW - 2) seen.wakesOut++ }
        for (const e of gs.ev) { if (e.type === 'efire') seen.efire++; if (e.type === 'boom') seen.booms++ }
        gs.ev.length = 0
    }
    return { gs, ...seen }
}
const WVIEW = 384 // W re-exported below; kept literal here so the wake audit is independent of sim internals

r.check('boots: makeGame/step/stateHash are wired', typeof makeGame === 'function' && typeof step === 'function' && typeof stateHash === 'function')

// determinism: seed + pads twice -> identical hashes; another seed -> different
{
    const drive = (seed) => {
        const gs = makeGame(seed)
        const hs = []
        for (let i = 0; i < 600; i++) {
            step(gs, { right: i % 9 < 6, b: i % 4 < 2, a: i % 17 < 2, up: i % 53 < 7, down: false, left: false })
            if (i % 150 === 149) hs.push(stateHash(gs))
        }
        return { hs, final: stateHash(gs) }
    }
    const a = drive(7), b = drive(7), c = drive(8)
    r.check('determinism: seed+pads twice hashes identical', JSON.stringify(a) === JSON.stringify(b), `samples ${a.hs.join(',')}`)
    r.check('determinism: another seed differs', c.final !== a.final)
}

// the 8-way law
{
    const gs = makeGame(1)
    step(gs, { right: true, up: true, b: false, a: false, down: false, left: false })
    const d = Math.hypot(gs.p.ax, gs.p.ay)
    r.check('8-way: up+right aims the diagonal', gs.p.ax > 0.5 && gs.p.ay < -0.5 && Math.abs(d - 1) < 0.01, `aim=(${gs.p.ax.toFixed(2)},${gs.p.ay.toFixed(2)})`)
    step(gs, { right: false, up: true, b: false, a: false, down: false, left: false })
    r.check('8-way: up alone aims straight up', gs.p.ax === 0 && gs.p.ay === -1)
    step(gs, { right: true, up: false, down: true, b: false, a: false, left: false }) // on ground: down ignored
    r.check('8-way: down on the ground stays level', gs.p.ay === 0)
}

// run + jump + gravity
{
    const gs = makeGame(3)
    const x0 = gs.p.x
    for (let i = 0; i < 10; i++) step(gs, { right: true, b: false, a: false, down: false, left: false, up: false })
    r.check('run: right moves the hero', gs.p.x - x0 >= 18, `dx=${(gs.p.x - x0).toFixed(1)}`)
    step(gs, { a: true, right: true })
    step(gs, { a: false, right: true })
    let peak = gs.p.y
    while (!gs.p.onGround) { step(gs, { right: true }); peak = Math.min(peak, gs.p.y) }
    r.check('jump: leaves the ground and gravity brings it back', CFG.ground - peak > 30 && gs.p.onGround, `apex rise ${(CFG.ground - peak).toFixed(0)}px`)
}

// rifle vs SPREAD
{
    const g1 = makeGame(5)
    step(g1, { b: true })
    r.check('rifle fires one round', g1.pb.length === 1, `pb=${g1.pb.length}`)
    const g2 = makeGame(5)
    g2.p.weapon = 'spread'
    step(g2, { b: true })
    r.check('SPREAD fires five rounds, fanned', g2.pb.length === 5 && new Set(g2.pb.map((b) => Math.round(b.vy * 10))).size >= 4, `pb=${g2.pb.length}`)
}

// capsule -> spread; death reverts the gun
{
    const gs = makeGame(9)
    gs.capsule = { x: gs.p.x + 8, y: gs.p.y - 14, vx: 0 }
    step(gs, {})
    r.check('capsule grants SPREAD', gs.p.weapon === 'spread')
    gs.p.inv = 0
    gs.eb.push({ x: gs.p.x - 100, y: gs.p.y - 14, vx: 2.2, vy: 0 })
    let guard = 0
    while (gs.p.dead === 0 && guard++ < 300) step(gs, {})
    for (let i = 0; i < CFG.respawnFreeze + 2 && gs.p.dead >= 0 && gs.p.inv <= 0; i++) step(gs, {})
    r.check('death reverts to rifle and grants respawn mercy frames', gs.p.weapon === 'rifle' && gs.p.inv > 0, `inv=${gs.p.inv}`)
}

// one-hit death, lives, respawn
{
    const gs = makeGame(11)
    gs.p.inv = 0
    const l0 = gs.lives
    gs.eb.push({ x: gs.p.x, y: gs.p.y - 14, vx: 0.1, vy: 0 })
    step(gs, {})
    r.check('one hit kills: lives 3 -> 2, hero freezes', gs.lives === l0 - 1 && gs.p.dead > 0 && gs.end === null)
    let guard = 0
    while (gs.p.dead > 0 && guard++ < 200) step(gs, {})
    r.check('respawn: back on the ground, flashing, stage still live', gs.p.onGround && gs.p.inv > 0 && gs.end === null)
}

// barrels chain: shot barrel kills a nearby soldier and the barrel goes
{
    const gs = makeGame(13)
    const br = gs.barrels[0]           // x 640
    const near = { x: br.x + 20, y: CFG.ground }
    gs.soldiers.push({ x: near.x, y: near.y, hold: false, hp: 1, awake: true, t: 9999, walk: 0, walkDir: -1, dead: false })
    gs.p.x = 560; gs.prevA = false
    let booms = 0
    for (let i = 0; i < 60; i++) { step(gs, { right: false, b: true }); booms += gs.ev.filter((e) => e.type === 'boom').length; gs.ev.length = 0 }
    r.check('TNT barrel: a round sets it off and the blast clears the soldier beside it', br.gone && gs.soldiers[gs.soldiers.length - 1].dead && booms >= 2, `booms=${booms}`)
}

// soldiers fight back (the named regression): enemies must open fire and shots
// must be dodgeable-but-real on every autopilot seed tested for the win
{
    let minFire = Infinity, allInside = true
    for (const s of [1, 7, 13, 42, 99]) {
        const { efire, wakesOut } = runSeed(s)
        minFire = Math.min(minFire, efire)
        if (wakesOut > 0) allInside = false
    }
    r.check('the stage fights back: every autopilot seed takes enemy fire', minFire >= 1, `min efire across seeds = ${minFire}`)
    r.check("no spawn shield: every soldier wakes inside the view (inside the bullets' reach)", allInside)
}

// winnable: the autopilot must clear every seed 1..12 (not cherry-picked)
{
    const fails = []
    for (let s = 1; s <= 12; s++) {
        const { gs } = runSeed(s)
        if (gs.end !== 'win') fails.push(`${s}:${gs.end}@${gs.tick}`)
    }
    r.check('can be won: autopilot clears seeds 1..12', fails.length === 0, fails.join(' ') || '12/12')
}

// the gate at the end really ends the run; the loss path really closes it
{
    const g1 = makeGame(21); g1.p.x = CFG.endX - 1
    step(g1, { right: true })
    r.check('reaching the base gate clears the stage', g1.end === 'win')
    const g2 = makeGame(22)
    let guard = 0
    while (!g2.end && guard++ < 9000) { g2.p.inv = 0; g2.eb.push({ x: g2.p.x, y: g2.p.y - 14, vx: 0.1, vy: 0 }); step(g2, {}) }
    r.check('three hits and the run is over (GAME OVER path)', g2.end === 'dead' && g2.lives === 0)
}

// platforms: land above, walk through from below
{
    const gs = makeGame(31)
    const pl = PLATFORMS[0]
    gs.p.x = pl.x + pl.w / 2; gs.p.y = CFG.ground
    let landed = false
    for (let i = 0; i < 80 && !landed; i++) {
        if (gs.p.onGround) { step(gs, { a: true }); continue }
        step(gs, {})
        if (gs.p.onGround && Math.abs(gs.p.y - pl.y) < 2) landed = true
    }
    r.check('walkway: a jump from the floor lands on top of the platform', landed, `y=${gs.p.y}`)
    const gs2 = makeGame(32)
    gs2.p.x = PLATFORMS[1].x + 10; gs2.p.y = PLATFORMS[1].y + 20; gs2.p.onGround = false; gs2.p.vy = -1
    step(gs2, {})
    r.check('walkway is one-way: rising passes through from below', !gs2.p.onGround)
}

// ------------------------------------------------------------- the mutant ---
if (MUTANT) {
    const src = readFileSync(SIM, 'utf8')
    const ANCHOR = 'if (s.x < gs.cam + W - 4) { s.awake = true'
    if (!src.includes(ANCHOR)) { console.error('MUTANT anchor missing — sim moved; the plant must be re-anchored'); process.exit(2) }
    const planted = src.replace(ANCHOR, 'if (s.x < gs.cam + W + 40) { /* MUTANT(spawn-shield): soldiers wake past the bullet-despawn edge */ s.awake = true')
    writeFileSync(SIM, planted)
    let bad
    try {
        bad = 'dynamic-import'
        const mod = await import(`../src/games/Contra/sim.js?mutant=${Date.now()}`)
        const gs = mod.makeGame(13)
        let wakesOut = 0
        const seen = []
        for (const s of gs.soldiers) s._w = false
        while (!gs.end && gs.tick < 15000) {
            mod.step(gs, mod.autopilot(gs))
            for (const s of gs.soldiers) if (s.awake && !s._w) { s._w = true; if (s.x >= 384 + gs.cam - 2) wakesOut++ }
            gs.ev.length = 0
        }
        bad = wakesOut > 0 ? `HARM NAMED: ${wakesOut} soldiers woke beyond the bullet-despawn edge - an unshootable shield; the stage plays itself` : null
    } finally {
        writeFileSync(SIM, src)
    }
    r.check('mutant(spawn-shield) goes RED: unshootable spawns named', bad !== null, bad || 'harm NOT named — mutant survived')
    console.log('\nmutant run: expected red on the spawn-shield line.')
    r.exit()
}

// ------------------------------------------------------------- browser leg ---
await requireDevServer(`${BASE}/contra`)
const browser = await launch()
{
    const page = await openGame(browser, { url: `${BASE}/contra`, hook: '__contraTest', wait: 600 })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.message))

    const attract1 = await page.evaluate(() => window.__contraTest.probe())
    await page.waitForTimeout(700)
    const attract2 = await page.evaluate(() => window.__contraTest.probe())
    r.check('attract: the demo runs itself before any key', attract1.screen === 'attract' && attract2.tick > attract1.tick, `tick ${attract1.tick} -> ${attract2.tick}`)

    await page.keyboard.press('Space')
    await page.waitForTimeout(300)
    const started = await page.evaluate(() => window.__contraTest.probe())
    r.check('any key takes the seat (attract -> play)', started.screen === 'play', `screen=${started.screen}`)

    const x0 = started.x
    await page.keyboard.down('ArrowRight')
    await page.keyboard.down('KeyX')
    await page.waitForTimeout(450)
    const ran = await page.evaluate(() => window.__contraTest.probe())
    await page.keyboard.up('KeyX')
    r.check('real keys: ArrowRight runs and KeyX fires', ran.x - x0 > 40 && ran.pb > 0, `dx=${(ran.x - x0).toFixed(0)} pb=${ran.pb}`)
    await page.keyboard.press('Space')
    await page.waitForTimeout(120)
    const jumped = await page.evaluate(() => window.__contraTest.probe())
    r.check('Space jumps (the A button leaves the ground)', !jumped.onGround || jumped.y < 196, `y=${jumped.y}`)
    await page.keyboard.up('ArrowRight')

    // force the death path through the DEV setup hook, then restart with keys
    await page.evaluate(() => window.__contraTest.setup({ lives: 1 }))
    let over = null
    for (let guard = 0; guard < 40; guard++) {
        await page.evaluate(() => window.__contraTest.setup({ lives: 0, kill: true }))
        await page.waitForTimeout(200)
        over = await page.evaluate(() => window.__contraTest.probe())
        if (over.screen === 'over') break
    }
    r.check('dying with no lives left reaches GAME OVER', over.screen === 'over' && over.end === 'dead', `screen=${over.screen} end=${over.end}`)
    await page.waitForTimeout(1000)
    await page.keyboard.press('Space')
    await page.waitForTimeout(250)
    await page.keyboard.press('Space')
    await page.waitForTimeout(250)
    const restarted = await page.evaluate(() => window.__contraTest.probe())
    r.check('restart loop: GAME OVER -> attract -> play by real keys', restarted.screen === 'play', `screen=${restarted.screen}`)

    // the drawn frame follows the sim: a pixel-bearing canvas after a run start
    const png = await page.evaluate(() => {
        const c = window.__game ? window.__game.frame() : null
        return c && c.length > 2000
    })
    r.check('the canvas paints real pixels', png)

    r.check('zero page errors', errs.length === 0, errs.join(' | '))
    await page.close()
}

r.exit(browser)
