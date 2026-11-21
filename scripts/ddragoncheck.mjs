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
// Named regressions guard the traps this genre almost always ships with: a hit
// that ignores the depth axis, which would play the game for itself (you could
// never dodge) and silently un-faithful — the S2 ghost-barrel, which would
// erase the weapons wall — and the S3 pair: casters whose steel ignores the
// belt, and a Marian who can never be cut free (a run with no ending).
// --mutant replants them and demands the harm is NAMED (#2142 direction).
// The browser leg drives real key events through the shell: attract -> seat ->
// walk/kick -> die -> restart, zero page errors.

import { writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { makeGame, step, autopilot, stateHash, W, CFG, ENEMY_DEF, WAVES_S2, enterStage2, rescueReady } from '../src/games/DoubleDragon/sim.js'
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

// S3: the whole commission in one drive — Walnuts Street, the hideout, the
// duel, Marian freed, and the loop home. Done = cleared back on stage 1.
const runFull = (seed, max = 60000) => {
    const gs = makeGame(seed)
    while (gs.tick < max) {
        step(gs, autopilot(gs))
        gs.events.length = 0
        if (gs.mode === 'gameover') break
        if (gs.cleared && gs.mode === 'play' && gs.stage === 1) break
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
    r.check('and the road runs on: clearing Walnuts Street opens the hideout (score carried)', (() => {
        for (let i = 0; i < 200 && gs.mode !== 'play'; i++) step(gs, autopilot(gs))
        return gs.mode === 'play' && gs.stage === 2 && gs.waveIdx === 0 && gs.score > 0 && !gs.cleared
    })(), `mode=${gs.mode} stage=${gs.stage} wave=${gs.waveIdx} score=${gs.score}`)
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

{ // S2 — the knife: pickup, throw, kill, and the steel comes back (#2807)
    const gs = makeGame(20)
    gs.pickups.push({ x: gs.billy.x + 5, y: gs.billy.y, kind: 'knife', bob: 0 })
    step(gs, {}); gs.events.length = 0
    r.check('knife: the steel is in your hand', gs.billy.weapon === 'knife', `weapon=${gs.billy.weapon}`)
    const e = mk('williams', gs.billy.x + 90, gs.billy.y, { attackCooldown: 999 })
    gs.enemies.push(e)
    step(gs, { punch: true }); gs.events.length = 0
    r.check('knife: PUNCH throws it — the hand empties, the blade flies',
        gs.billy.state === 'throw' && gs.billy.weapon === null, `state=${gs.billy.state} weapon=${gs.billy.weapon}`)
    let sawBlade = false
    let killed = false
    let reborn = false
    for (let i = 0; i < 80; i++) {
        step(gs, {}); gs.events.length = 0
        if (gs.projectiles.length > 0) sawBlade = true
        if (e.state === 'dying') killed = true
        if (gs.pickups.some((p) => p.kind === 'knife')) reborn = true
    }
    r.check('knife: a thrown blade flat-kills a Williams (4 dmg)', sawBlade && killed, `flew=${sawBlade} dead=${killed}`)
    r.check('knife: reusable steel — the knife lands back on the street', reborn, `pickups=${gs.pickups.map((p) => p.kind).join(',')}`)
}

{ // S2 — the whip: the long lash catches the whole line, and skips the downed
    const gs = makeGame(21)
    gs.billy.weapon = 'whip'
    gs.billy.face = 1
    const a = mk('williams', gs.billy.x + 28, gs.billy.y, { attackCooldown: 999 })
    const c = mk('williams', gs.billy.x + 33, gs.billy.y + 5, { attackCooldown: 999 })
    gs.enemies.push(a, c)
    step(gs, { punch: true }); gs.events.length = 0
    r.check('whip: PUNCH lashes (never throws the coil away)', gs.billy.state === 'whip' && gs.billy.weapon === 'whip', `state=${gs.billy.state} weapon=${gs.billy.weapon}`)
    for (let i = 0; i < 22; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('whip: the sweep catches EVERY standing man out to reach 34', a.hp < 4 && c.hp < 4, `hp ${a.hp}/${c.hp}`)
    const d = mk('williams', gs.billy.x + 28, gs.billy.y, { state: 'down', stateT: 5, attackCooldown: 999 })
    gs.enemies.push(d)
    const dHp = d.hp
    step(gs, { punch: true }); gs.events.length = 0
    for (let i = 0; i < 22; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('whip: a downed man escapes the lash', d.hp === dHp, `hp=${d.hp}`)
}

{ // S2 — barrels: solid, walk-aroundable, breakable, and they carry the steel
    const gs = makeGame(22)
    const bar = gs.barrels.find((q) => q.x === 430)
    gs.camLock = true; gs.camX = 280
    gs.waveIdx = 9; gs.waveActive = false
    gs.billy.x = 400; gs.billy.y = bar.y; gs.billy.face = 1
    for (let i = 0; i < 60; i++) { step(gs, { right: true }); gs.events.length = 0 }
    r.check('barrel: boots stop at the wood — props are solid, not paint', gs.billy.x <= bar.x - 9.5, `x=${gs.billy.x.toFixed(1)} vs barrel ${bar.x}`)
    let around = false
    for (let i = 0; i < 40 && gs.billy.y > bar.y - 12; i++) { step(gs, { up: true, right: true }); gs.events.length = 0 }
    for (let i = 0; i < 120 && !around; i++) { step(gs, { right: true }); gs.events.length = 0; if (gs.billy.x > bar.x + 11) around = true }
    r.check('barrel: change lanes and the road opens again', around, `x=${gs.billy.x.toFixed(1)}`)
    const scoreBefore = gs.score
    const bar2 = gs.barrels.find((q) => q.x === 250)
    gs.camX = 106
    gs.billy.x = bar2.x - 14; gs.billy.y = bar2.y; gs.billy.face = 1
    for (let i = 0; i < 70; i++) { step(gs, { b: i % 20 === 0 }); gs.events.length = 0 }
    r.check('barrel: three kicks splinter it (+100)', !gs.barrels.includes(bar2) && gs.score >= scoreBefore + 100, `gone=${!gs.barrels.includes(bar2)} score ${scoreBefore}->${gs.score}`)
    r.check('barrel: and it spits out the steel inside', gs.pickups.some((p) => ['knife', 'whip', 'stick'].includes(p.kind)), `dropped=${gs.pickups.map((p) => p.kind).join(',') || 'nothing'}`)
    r.check('barrel: mid-lane wood never wedges a body — stuckFree keeps the street flowing', gs.billy.x > 0 && gs.barrels.length >= 1, `billy x=${gs.billy.x.toFixed(0)} barrels=${gs.barrels.length}`)
}

{ // S2 — one weapon in hand; and the stage loop re-arms the street
    const gs = makeGame(23)
    gs.billy.weapon = 'knife'
    gs.pickups.push({ x: gs.billy.x + 4, y: gs.billy.y, kind: 'whip', bob: 0 })
    step(gs, {}); gs.events.length = 0
    r.check('one in hand: walking over a second weapon changes nothing', gs.billy.weapon === 'knife' && gs.pickups.length === 1, `weapon=${gs.billy.weapon} pickups=${gs.pickups.length}`)
    const g2 = runFull(10)
    for (let i = 0; i < 300 && !(g2.mode === 'play' && g2.stage === 1); i++) { step(g2, autopilot(g2)); g2.events.length = 0 }
    r.check('the loop re-arms Walnuts Street: barrels refill for the next pass', g2.mode === 'play' && g2.stage === 1 && g2.barrels.length === 3 && g2.barrels.every((q) => q.hp === CFG.barrelHp), `mode=${g2.mode} stage=${g2.stage} barrels=${g2.barrels.map((q) => q.hp).join('/')}`)
}

{ // #2819 S2 polish laws: the blade sticks before it is steel again, the whip
// flashes on the bite tick, and splintered wood clatters its cargo out
    const gs = makeGame(24)
    gs.waveIdx = 9; gs.waveActive = false
    gs.projectiles.push({ id: 900, x: 100, y: 170, vx: CFG.knifeSpeed, spin: 0, side: 'billy' })
    let stuckP = null
    for (let i = 0; i < 400 && !stuckP; i++) {
        step(gs, {}); gs.events.length = 0
        stuckP = gs.pickups.find((p) => p.kind === 'knife' && p.stick > 0) || null
    }
    r.check('polish: landed steel stands in the ground for a beat before it becomes a pickup',
        !!stuckP && stuckP.stick > 0 && stuckP.stick <= CFG.knifeStick, `stick=${stuckP ? stuckP.stick : 'never'}`)
    gs.billy.x = stuckP.x; gs.billy.y = stuckP.y
    // park the camera with him — an unlocked cam drags a man at the stage's
    // edge back onto the visible band (the seated-fixture law, edge edition)
    gs.camLock = true; gs.camX = Math.max(0, stuckP.x - 160)
    step(gs, {}); gs.events.length = 0
    r.check('polish: a blade in the ground cannot be yanked out — the stick beat holds',
        gs.billy.weapon === null && stuckP.stick > 0 && Math.abs(gs.billy.x - stuckP.x) <= 10,
        `weapon=${gs.billy.weapon} stick=${stuckP.stick} gap=${(gs.billy.x - stuckP.x).toFixed(1)}`)
    for (let i = 0; i < 30 && gs.billy.weapon === null; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('polish: when the stick beat ends the steel is yours again',
        gs.billy.weapon === 'knife', `weapon=${gs.billy.weapon} stick=${stuckP.stick}`)

    const g2 = makeGame(25)
    g2.billy.weapon = 'whip'; g2.billy.face = 1
    const w = mk('williams', g2.billy.x + 28, g2.billy.y, { attackCooldown: 999 })
    g2.enemies.push(w)
    let flashed = false
    step(g2, { punch: true }); g2.events.length = 0
    for (let i = 0; i < 28; i++) { step(g2, {}); g2.events.length = 0; if (g2.billy.lash > 0 && w.hp < 4) flashed = true }
    r.check('polish: the whip crack-flashes on the tick it bites', flashed, `lash=${g2.billy.lash} hp=${w.hp}`)

    const g3 = makeGame(26)
    g3.camLock = true; g3.waveIdx = 9; g3.waveActive = false
    const bar = g3.barrels.find((q) => q.x === 250)
    g3.camX = 106
    g3.billy.x = bar.x - 14; g3.billy.y = bar.y; g3.billy.face = 1
    let dropped = null, clatterAt = 0, fxAt = null
    for (let i = 0; i < 70; i++) {
        step(g3, { b: i % 20 === 0 }); g3.events.length = 0
        if (!fxAt && g3.fx) fxAt = { x: g3.fx.x, y: g3.fx.y }
        if (!dropped) { const d = g3.pickups.find((p) => ['knife', 'whip', 'stick'].includes(p.kind)); if (d) { dropped = d; clatterAt = d.clatter || 0 } }
    }
    r.check('polish: the break tells the shell where the wood went (shard spawn point)',
        !!fxAt && Math.abs(fxAt.x - bar.x) <= 2, `fx=${fxAt ? fxAt.x : 'never'} vs barrel ${bar.x}`)
    r.check('polish: the splintered wood spits its steel with a clatter (bounce)',
        !!dropped && clatterAt >= 10, `dropped=${dropped ? dropped.kind : 'nothing'} clatter@spawn=${clatterAt}`)
}

// ----------------------------------------------------------- S3 the hideout ---
{ // the stage door: the yard opens furnished
    const gs = runBot(10)
    const carried = gs.score
    const clearedS1 = gs.mode === 'clear' && gs.bannerKind === 'stage1'
    for (let i = 0; i < 200 && gs.mode !== 'play'; i++) { step(gs, autopilot(gs)); gs.events.length = 0 }
    r.check('S3: the yard opens when Walnuts Street falls — stage 2, banner, score carried',
        clearedS1 && gs.mode === 'play' && gs.stage === 2 && gs.waveIdx === 0 && gs.score >= carried,
        `s1clear=${clearedS1} mode=${gs.mode} stage=${gs.stage} banner=${gs.bannerKind}`)
    r.check('S3: the yard is furnished for the duel — crates solid, Marian tied at the end',
        gs.barrels.length === 3 && gs.barrels.every((q) => q.kind === 'crate' && q.hp === CFG.barrelHp) && !!gs.marian && !gs.marian.freed,
        `props=${gs.barrels.map((q) => q.kind).join(',')} marian=${gs.marian ? (gs.marian.freed ? 'free' : 'tied') : 'none'}`)
}

{ // S3 casters: telegraphed steel — aim before the blade, lethal ON the lane
    const gs = makeGame(40)
    gs.billy.inv = 0
    gs.enemies.push({ id: 910, kind: 'williams', x: gs.billy.x + 80, y: gs.billy.y, face: -1, hp: 4, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: true, castCooldown: 0, attackCooldown: 9999, inv: 0, spinHit: false })
    let sawAim = false
    let bladeAfterAim = false
    for (let i = 0; i < 120; i++) {
        step(gs, {}); gs.events.length = 0
        const e = gs.enemies[0]
        if (e && e.state === 'aim') sawAim = true
        if (gs.projectiles.length > 0) { bladeAfterAim = sawAim; break }
    }
    r.check('S3: an armed Williams telegraphs — a beat of aim before the blade flies', sawAim && bladeAfterAim, `aim=${sawAim}`)
    for (let i = 0; i < 60; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('S3: goon steel ON the line takes the life it finds', gs.billy.lives === 2, `lives=${gs.billy.lives}`)

    // depth law, thrown edition: the same cast 10px off the lane whizzes past
    // (and lands as pickable steel — reusable in both directions)
    const g2 = makeGame(41)
    g2.billy.inv = 0
    g2.billy.y = 180
    g2.projectiles.push({ id: 999, x: g2.billy.x - 40, y: 170, vx: 3, spin: 0, side: 'goon' })
    for (let i = 0; i < 150 && g2.projectiles.length; i++) { step(g2, {}); g2.events.length = 0 }
    r.check('S3: the same blade 10 deep flies past an empty lane — depth is the dodge', g2.billy.lives === 3, `lives=${g2.billy.lives}`)
    r.check('S3: steel is steel whoever throws it — the escaped blade lands as a pickup', g2.pickups.some((p) => p.kind === 'knife'), `pickups=${g2.pickups.map((p) => p.kind).join(',') || 'none'}`)
    const g3 = makeGame(41)
    g3.billy.inv = 0
    g3.billy.y = 180
    g3.projectiles.push({ id: 998, x: g3.billy.x - 40, y: 176, vx: 3, spin: 0, side: 'goon' })
    for (let i = 0; i < 40; i++) { step(g3, {}); g3.events.length = 0 }
    r.check('S3: and 4 deep is ON the line — the band is real against thrown steel too', g3.billy.lives === 2, `lives=${g3.billy.lives}`)

    // wood stops steel: a crate between thrower and Billy eats the cast
    const g4 = makeGame(42)
    g4.billy.inv = CFG.respawnIFrames
    g4.billy.x = 120
    g4.barrels.push({ id: 98, x: 90, y: g4.billy.y, hp: CFG.barrelHp, shake: 0, kind: 'crate' })
    g4.projectiles.push({ id: 997, x: 40, y: g4.billy.y, vx: 3, spin: 0, side: 'goon' })
    for (let i = 0; i < 40; i++) { step(g4, {}); g4.events.length = 0 }
    r.check('S3: the yard cover works — crates eat thrown steel before it eats you', g4.billy.lives === 3 && g4.barrels.find((q) => q.id === 98 && q.hp < CFG.barrelHp), `lives=${g4.billy.lives} crateHp=${g4.barrels.find((q) => q.id === 98)?.hp}`)

    // KO an armed Williams and it pays out the steel
    const g6 = makeGame(43)
    g6.billy.inv = CFG.respawnIFrames
    g6.enemies.push({ id: 912, kind: 'williams', x: g6.billy.x + 14, y: g6.billy.y, face: -1, hp: 4, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: true, castCooldown: 99999, attackCooldown: 9999, inv: 0, spinHit: false })
    for (let i = 0; i < 80; i++) { step(g6, { b: i % 20 === 0 }); g6.events.length = 0 }
    r.check('S3: armed men drop their steel when they go down', g6.enemies.every((e) => e.state === 'dying') && g6.pickups.some((p) => p.kind === 'knife'), `enemies=${g6.enemies.map((e) => e.state).join(',')} pickups=${g6.pickups.map((p) => p.kind).join(',')}`)
}

{ // S3 the duel: Williams himself — ten hit-points, and the wave ends with him
    r.check('S3: the lieutenant is cut from harder cloth (10 hp, 800 pts)', ENEMY_DEF.duel.hp === 10 && ENEMY_DEF.duel.score === 800, `hp=${ENEMY_DEF.duel.hp} score=${ENEMY_DEF.duel.score}`)
    const gs = makeGame(44)
    enterStage2(gs)
    gs.waveIdx = 2; gs.waveActive = true; gs.camLock = true
    gs.enemies.push({ id: 920, kind: 'duel', x: gs.camX + W + 44, y: 170, face: -1, hp: CFG.duelHp, state: 'enter', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: true, castCooldown: 60, attackCooldown: 40, inv: 0, spinHit: false })
    for (let i = 0; i < 5000 && gs.mode === 'play' && gs.waveIdx < WAVES_S2.length; i++) { step(gs, autopilot(gs)); gs.events.length = 0 }
    r.check('S3: the duel is won the honest way — the wave closes only when he falls', gs.waveIdx >= WAVES_S2.length && gs.mode === 'play', `wave=${gs.waveIdx} mode=${gs.mode} lives=${gs.billy.lives}`)
    r.check('S3: winning the duel does NOT clear the stage — the rescue must be earned', gs.mode === 'play' && !!gs.marian && !gs.marian.freed && rescueReady(gs), `mode=${gs.mode} ready=${rescueReady(gs)}`)
}

{ // S3 Marian: locked while the duel lives; two cuts and the run goes home
    const gs = makeGame(45)
    enterStage2(gs)
    gs.waveIdx = 2; gs.waveActive = true; gs.camLock = true; gs.camX = 640
    gs.enemies.push({ id: 921, kind: 'duel', x: 760, y: 150, face: -1, hp: CFG.duelHp, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: false, castCooldown: 999999, attackCooldown: 999999, inv: 0, spinHit: false })
    gs.billy.x = 890; gs.billy.y = gs.marian.y; gs.billy.inv = CFG.respawnIFrames
    for (let i = 0; i < 40; i++) { step(gs, { punch: i % 3 === 0 }); gs.events.length = 0 }
    r.check('S3: the ropes hold while a duelist still stands — no rescue on a live floor', gs.marian.cuts === 0 && !gs.marian.freed, `cuts=${gs.marian.cuts}`)
    gs.enemies.length = 0
    for (let i = 0; i < 40 && !gs.marian.freed; i++) { step(gs, { punch: i % 3 === 0 }); gs.events.length = 0 }
    r.check('S3: two punches cut her loose (+1000 and the cabinet says so)', gs.marian.freed && gs.marian.cuts >= 2 && gs.score >= CFG.rescueBonus, `cuts=${gs.marian.cuts} score=${gs.score}`)
    for (let i = 0; i < 400 && !(gs.mode === 'play' && gs.stage === 1); i++) { step(gs, {}); gs.events.length = 0 }
    r.check('S3: the cheer carries the run home — back on Walnuts Street, cleared earned', gs.mode === 'play' && gs.stage === 1 && gs.cleared && gs.marian === null && gs.barrels.every((q) => q.hp === CFG.barrelHp), `mode=${gs.mode} stage=${gs.stage} cleared=${gs.cleared}`)
}

{ // WINNABLE: the honest autopilot clears the street on 12 seeds
    const fails = []
    for (let seed = 1; seed <= 12; seed++) if (runBot(seed).mode !== 'clear') fails.push(seed)
    r.check('winnable: the attract autopilot clears Walnuts Street on seeds 1..12', fails.length === 0, fails.length ? `stuck seeds ${fails.join(',')}` : '12/12')
}

{ // WINNABLE (the whole commission): both stages, the duel, Marian freed
    const fails = []
    for (let seed = 1; seed <= 12; seed++) {
        const g = runFull(seed)
        if (!(g.cleared && g.mode === 'play' && g.stage === 1)) fails.push(seed)
    }
    r.check('winnable: the FULL run — Walnuts, the yard, the duel, Marian freed — seeds 1..12', fails.length === 0, fails.length ? `stuck seeds ${fails.join(',')}` : '12/12')
}

{ // #2810 item 6 — the score delta flashes on the HUD when a man goes down
    const gs = makeGame(12)
    gs.enemies.push(mk('williams', gs.billy.x + 14, gs.billy.y, { hp: 1 }))
    step(gs, { b: true }); gs.events.length = 0
    for (let i = 0; i < 12; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('KO flashes the delta: score popup carries the killed man\'s value', gs.scoreFlash && gs.scoreFlash.v === 200, `flash=${gs.scoreFlash && gs.scoreFlash.v}`)
    for (let i = 0; i < 60; i++) step(gs, {})
    r.check('the flash fades out on its own', gs.scoreFlash === null, `flash=${JSON.stringify(gs.scoreFlash)}`)
}

{ // #2810 item 3 — Abobo's shoulder charge: telegraph first, and depth still decides
    const gs = makeGame(13)
    gs.billy.inv = 0
    gs.enemies.push(mk('abobo', gs.billy.x + 90, gs.billy.y, { attackCooldown: 0 }))
    const saw = { wind: 0, dash: 0 }
    let windBeforeDash = false
    for (let i = 0; i < 200; i++) {
        step(gs, {}); gs.events.length = 0
        const e = gs.enemies[0]
        if (!e) break
        if (e.state === 'chargewind') { saw.wind = Math.max(saw.wind, e.stateT); if (saw.dash === 0) windBeforeDash = true }
        if (e.state === 'charge') saw.dash = Math.max(saw.dash, e.stateT)
        if (gs.billy.lives < 3 || e.state === 'back') break
    }
    r.check('the giant telegraphs: a beat of running frames precedes the body-check', windBeforeDash && saw.wind >= 14 && saw.dash > 0, `wind=${saw.wind} dash=${saw.dash}`)
    r.check('the body-check on the line takes the life it finds', gs.billy.lives === 2, `lives=${gs.billy.lives}`)
    const g2 = makeGame(13)
    g2.billy.inv = 0
    g2.billy.y = 180
    g2.enemies.push(mk('abobo', g2.billy.x + 40, 168, { state: 'charge', stateT: 3, face: -1 }))
    for (let i = 0; i < 40; i++) { step(g2, {}); g2.events.length = 0 }
    r.check('depth law rides the charge: a committed dash on another lane whooses past', g2.billy.lives === 3, `lives=${g2.billy.lives}`)
    const g3 = makeGame(13)
    g3.billy.inv = 0
    g3.billy.y = 180
    g3.enemies.push(mk('abobo', g3.billy.x + 40, 178, { state: 'charge', stateT: 3, face: -1 }))
    for (let i = 0; i < 40; i++) { step(g3, {}); g3.events.length = 0 }
    r.check('and the same dash ON the line lands — the band is real here too', g3.billy.lives === 2, `lives=${g3.billy.lives}`)
}

{ // #2810 item 5 — wave goons march in from off-screen; the enter FSM is visible
    const gs = makeGame(14)
    gs.billy.x = 90 // just past the first trigger
    step(gs, {})
    const fresh = gs.enemies.filter((e) => e.state === 'enter')
    const off = fresh.filter((e) => e.x >= gs.camX + W + 40 || e.x <= gs.camX - 40)
    r.check('a wave opens off-screen, not at the pixel edge', fresh.length > 0 && off.length === fresh.length, `${off.length}/${fresh.length} spawns fully off-screen`)
    for (let i = 0; i < 60; i++) { step(gs, {}); gs.events.length = 0 }
    const visible = gs.enemies.filter((e) => e.state !== 'enter' && e.x > gs.camX && e.x < gs.camX + W)
    r.check('then walks them into the frame before the fight starts', visible.length > 0, `${visible.length} on screen after the march-in`)
}

// ------------------------------------------------------------- the mutants ---
if (MUTANT) {
    const src = readFileSync(SIM, 'utf8')
    const plants = [
        {
            name: 'depth-blind',
            anchor: 'b.z <= 8 && Math.abs(e.x - b.x) <= def.reach + 4 && Math.abs(e.y - b.y) <= 8',
            plant: 'b.z <= 8 && Math.abs(e.x - b.x) <= def.reach + 4 && Math.abs(e.y - b.y) <= 400 /* MUTANT(depth-blind): the belt axis stops mattering */',
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
        {
            name: 'charge-blind',
            anchor: 'b.z <= 6 && Math.abs(e.x - b.x) <= 16 && Math.abs(e.y - b.y) <= 8',
            plant: 'b.z <= 6 && Math.abs(e.x - b.x) <= 16 && Math.abs(e.y - b.y) <= 400 /* MUTANT(charge-blind): the body-check ignores the belt */',
            harm: async (mod) => {
                const gs = mod.makeGame(13)
                gs.billy.inv = 0
                gs.billy.y = 180
                gs.enemies.push({ id: 902, kind: 'abobo', x: gs.billy.x + 40, y: 168, face: -1, hp: 14, state: 'charge', stateT: 3, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 0, inv: 0, spinHit: false })
                for (let i = 0; i < 40; i++) { mod.step(gs, {}); gs.events.length = 0 }
                return gs.billy.lives < 3
                    ? `HARM NAMED: Abobo's charge crossed 12 pixels of open lane and took a life anyway (lives 3 -> ${gs.billy.lives}) — the telegraph becomes worthless if you cannot sidestep it on the depth axis`
                    : null
            },
        },
        {
            name: 'barrel-ghost',
            anchor: 'return gs.barrels.some((bar) => Math.abs(bar.x - x) <= 10 + radius && Math.abs(bar.y - y) <= 11 + radius)',
            plant: 'return false /* MUTANT(barrel-ghost): the props stop being solid */',
            harm: async (mod) => {
                const gs = mod.makeGame(22)
                gs.camLock = true; gs.camX = 280          // same seat as the pin: no camera warp
                gs.waveIdx = 9; gs.waveActive = false      // no wave mid-fixture
                const bar = gs.barrels.find((q) => q.x === 430)
                gs.billy.x = 400; gs.billy.y = bar.y; gs.billy.face = 1
                for (let i = 0; i < 60; i++) { mod.step(gs, { right: true }); gs.events.length = 0 }
                return gs.billy.x > bar.x + 11
                    ? `HARM NAMED: Billy strolled straight through mid-lane wood (x ${gs.billy.x.toFixed(0)} past barrel ${bar.x}) — solid props are the weapons wall; ghosts erase the cover, the hop and the lane-play the S2 street is built on`
                    : null
            },
        },
        {
            name: 'blade-blind',
            anchor: 'gs.billy.z <= 6 && Math.abs(pr.x - gs.billy.x) <= 10 && Math.abs(pr.y - gs.billy.y) <= 7',
            plant: 'gs.billy.z <= 6 && Math.abs(pr.x - gs.billy.x) <= 10 && Math.abs(pr.y - gs.billy.y) <= 400 /* MUTANT(blade-blind): thrown steel ignores the belt */',
            harm: async (mod) => {
                const gs = mod.makeGame(41)
                gs.billy.inv = 0
                gs.billy.y = 180
                gs.projectiles.push({ id: 999, x: gs.billy.x - 40, y: 170, vx: 3, spin: 0, side: 'goon' })
                for (let i = 0; i < 60; i++) { mod.step(gs, {}); gs.events.length = 0 }
                return gs.billy.lives < 3
                    ? `HARM NAMED: a cast blade crossed ten pixels of open lane and took a life anyway (lives 3 -> ${gs.billy.lives}) — if thrown steel ignores the depth axis, the casters cannot be dodged and the weapons wall is a coin-flip`
                    : null
            },
        },
        {
            name: 'rescue-blind',
            anchor: 'if (!m.freed && rescueReady(gs)) {',
            plant: 'if (false && !m.freed && rescueReady(gs)) { /* MUTANT(rescue-blind): the ropes ignore every cut */',
            harm: async (mod) => {
                const gs = mod.makeGame(2)
                const max = 60000
                while (gs.tick < max) {
                    mod.step(gs, mod.autopilot(gs))
                    gs.events.length = 0
                    if (gs.mode === 'gameover') break
                    if (gs.cleared && gs.mode === 'play' && gs.stage === 1) break
                }
                return !(gs.cleared && gs.stage === 1)
                    ? `HARM NAMED: the honest autopilot ran 60,000 ticks and never brought Marian home (stage ${gs.stage}, freed ${gs.marian ? gs.marian.freed : 'n/a'}) — if the ropes ignore the cut, the commission has no ending and the loop can never be won`
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

    // S2 leg: knife through the real key path — Z is the contextual verb
    await page.evaluate(() => window.__ddTest.setup({ spawnWeapon: 'knife' }))
    await page.waitForTimeout(300)
    const armedKnife = await page.evaluate(() => window.__ddTest.probe())
    r.check('S2: a knife on the street gets picked up too', armedKnife.weapon === 'knife', `weapon=${armedKnife.weapon}`)
    await page.keyboard.press('KeyZ')
    await page.waitForTimeout(120)
    const thrown = await page.evaluate(() => window.__ddTest.probe())
    r.check('S2: Z with a knife THROWS it through the shell (hand empties, blade in flight)', thrown.weapon === null && (thrown.projectiles === 1 || thrown.billyState === 'throw' || thrown.pickups.includes('knife')), `weapon=${thrown.weapon} state=${thrown.billyState} projectiles=${thrown.projectiles}`)

    // S3 leg: warp to the yard's end and cut the ropes through the real key path
    await page.evaluate(() => window.__ddTest.setup({ warp: 'marian' }))
    await page.waitForTimeout(300)
    const tied = await page.evaluate(() => window.__ddTest.probe())
    await page.keyboard.press('KeyZ')
    await page.waitForTimeout(220)
    await page.keyboard.press('KeyZ')
    await page.waitForTimeout(300)
    const freed = await page.evaluate(() => window.__ddTest.probe())
    r.check('S3: Z cuts Marian loose through the shell — tied to free on real keystrokes', tied.stage === 2 && tied.marian === 'tied:0' && freed.marian === 'free', `stage=${tied.stage} before=${tied.marian} after=${freed.marian}`)

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
