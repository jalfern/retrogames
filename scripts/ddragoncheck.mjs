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
// erase the weapons wall — the S3 pair: casters whose steel ignores the belt,
// and a Marian who can never be cut free (a run with no ending) — and the S4
// pair: a crowd that only sees Billy (co-op collapses to solo-with-a-statue)
// and a game over that fires on one drained seat (the partner's run, ended).
// --mutant replants them and demands the harm is NAMED (#2142 direction).
// The browser leg drives real key events through the shell: attract -> seat ->
// walk/kick -> die -> restart, zero page errors; S4 adds the default blue
// seat and the WASD drop-in through real keystrokes.

import { writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { makeGame, step, autopilot, stateHash, W, CFG, ENEMY_DEF, WAVES_S2, enterStage2, rescueReady, dragonBrain } from '../src/games/DoubleDragon/sim.js'
import { p2Merge, p2Seat } from '../src/games/DoubleDragon/p2pad.js'
import { pressSlot, releaseSlot, slotPad, slotActive, clearAllSlots } from '../src/utils/onePad.js'
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

{ // #2825 item 4: the duel announces itself — name cue, intro clock, held pose
    const gs = makeGame(63)
    enterStage2(gs)
    gs.waveIdx = 2; gs.camX = 340; gs.billy.x = 620; gs.billy.inv = CFG.respawnIFrames
    gs.events.length = 0
    step(gs, {})
    const sawDuel = gs.events.includes('duel') && gs.duelIntro > 0
    let frozen = false
    for (let i = 0; i < 200 && gs.duelIntro > 0; i++) {
        step(gs, {}); gs.events.length = 0
        const d = gs.enemies.find((e) => e.kind === 'duel')
        if (d && d.state === 'walk') { const x0 = d.x; step(gs, {}); gs.events.length = 0; frozen = d.x === x0; break }
    }
    r.check('S3 #2825: the boss wave announces itself — WILLIAMS cue, intro clock, held pose at the frame edge', sawDuel && frozen, `cue=${sawDuel} frozen=${frozen}`)
    for (let i = 0; i < 200 && gs.duelIntro > 0; i++) { step(gs, {}); gs.events.length = 0 }
    const d2 = gs.enemies.find((e) => e.kind === 'duel')
    r.check('S3 #2825: the lieutenant answers when the announce ends — the duel is on', !!d2 && gs.duelIntro === 0, `intro=${gs.duelIntro}`)
}

{ // #2825 item 3: throwers keep thrower's distance — back-pedal, don't brawl
    const gs = makeGame(64)
    gs.billy.inv = CFG.respawnIFrames
    gs.billy.x = 100
    gs.enemies.push({ id: 930, kind: 'duel', x: 120, y: gs.billy.y, face: -1, hp: CFG.duelHp, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: true, castCooldown: 99999, attackCooldown: 99999, inv: 0, spinHit: false })
    for (let i = 0; i < 30; i++) { step(gs, {}); gs.events.length = 0 }
    const e = gs.enemies[0]
    r.check('S3 #2825: an armed thrower at punching range back-pedals to a fresh angle instead of trading fists', e && e.x > 130 && gs.billy.lives === 3, `x 120->${e ? e.x.toFixed(0) : 'gone'} lives=${gs.billy.lives}`)
}

{ // #2825 item 7: the yard reports in pine — crates own their sounds
    const hits1 = []
    const gs = makeGame(61)
    gs.billy.inv = CFG.respawnIFrames
    const bar = gs.barrels.find((q) => q.x === 250)
    gs.billy.x = bar.x - 12; gs.billy.y = bar.y
    for (let i = 0; i < 60; i++) { step(gs, { punch: i % 10 === 0 }); hits1.push(...gs.events); gs.events.length = 0 }
    r.check('the street still reports oak — barrels keep barrel_hit/break', hits1.includes('barrel_hit') && !hits1.includes('crate_hit') && !gs.barrels.includes(bar), `hits=${[...new Set(hits1)].join(',')}`)
    const hits2 = []
    const g2 = makeGame(62)
    enterStage2(g2)
    const crate = g2.barrels.find((q) => q.kind === 'crate')
    g2.billy.inv = CFG.respawnIFrames
    g2.billy.x = crate.x - 12; g2.billy.y = crate.y
    for (let i = 0; i < 80 && g2.barrels.includes(crate); i++) { step(g2, { punch: i % 10 === 0 }); hits2.push(...g2.events); g2.events.length = 0 }
    r.check('S3 #2825: crates speak their own heavier tongue — crate_hit/crate_break, never barrel_*', hits2.includes('crate_hit') && hits2.includes('crate_break') && !hits2.includes('barrel_hit') && !hits2.includes('barrel_break'), `hits=${[...new Set(hits2)].join(',')}`)
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

// ------------------------------------------------------------------ S4 co-op ---
// Issue #2807 stage 4: the second dragon. Jimmy Lee fights beside Billy by
// default (CPU seat), the crowd splits by nearest, both pools must drain for
// game over, and a fallen dragon rides the second wind at the next stage.
{
    const solo = makeGame(5)
    r.check('S4: the sim default is one dragon — S1..S3 law fixtures stay honest', !solo.jimmy && !solo.coop)
    const gs0 = makeGame(5, { coop: true })
    r.check('S4: the blue seat stands ready — Jimmy, own bank of three, CPU by default',
        !!gs0.jimmy && gs0.jimmy.tag === 'jimmy' && gs0.jimmy.lives === CFG.lives && gs0.jimmy.human === false && gs0.coop)

    // nearest-dragon commitment
    const gs = makeGame(21, { coop: true })
    gs.waveIdx = 9; gs.camLock = true; gs.camX = 200
    gs.billy.x = gs.camX + 40; gs.billy.y = 140; gs.billy.inv = 999
    gs.jimmy.x = gs.camX + 240; gs.jimmy.y = 190; gs.jimmy.inv = 999
    gs.enemies.push(mk('williams', gs.camX + 260, 190))
    for (let i = 0; i < 30; i++) { step(gs, {}, {}); gs.events.length = 0 }
    r.check('S4: the crowd splits by NEAREST dragon — a thug on Jimmy\'s tail works Jimmy, not the name Billy',
        gs.enemies[0].tgt === 'jimmy' && Math.abs(gs.enemies[0].x - gs.jimmy.x) <= 40,
        // #2851: proxy moved from camX+260 to Jimmy's tail distance — the
        // blue seat's jab cadence (#2851) staggers the thug off the spawn
        // edge, which the old camera proxy misread. The law is "works Jimmy",
        // not "stands where he spawned".
        `tgt=${gs.enemies[0].tgt} dx=${(gs.enemies[0].x - gs.jimmy.x).toFixed(0)}`)

    // mid-action commitment: a windup already thrown at Jimmy does not
    // teleport to Billy when Billy struts close
    const gs2 = makeGame(22, { coop: true })
    gs2.waveIdx = 9; gs2.camLock = true; gs2.camX = 200
    gs2.jimmy.x = gs2.camX + 240; gs2.jimmy.y = 190; gs2.jimmy.inv = 0; gs2.jimmy.human = true
    gs2.billy.x = gs2.camX + 40; gs2.billy.y = 140; gs2.billy.inv = 999
    gs2.enemies.push(mk('williams', gs2.camX + 250, 190, { state: 'windup', stateT: 1 }))
    gs2.enemies[0].tgt = 'jimmy'
    for (let i = 0; i < 25; i++) { step(gs2, {}, {}); gs2.events.length = 0 }
    r.check('S4: the commitment holds mid-swing — a blade cocked at Jimmy lands on Jimmy even with Billy walking up',
        gs2.jimmy.lives === CFG.lives - 1 && gs2.billy.lives === CFG.lives, `jimmy ${gs2.jimmy.lives} billy ${gs2.billy.lives}`)

    // arcade lethal wears on BOTH seats, and one seat falling is not the end
    const gs3 = makeGame(23, { coop: true })
    gs3.waveIdx = 9; gs3.camLock = true; gs3.camX = 200
    gs3.jimmy.x = gs3.camX + 240; gs3.jimmy.y = 190; gs3.jimmy.inv = 0; gs3.jimmy.human = true
    gs3.billy.x = gs3.camX + 40; gs3.billy.y = 140; gs3.billy.inv = 999
    gs3.enemies.push(mk('williams', gs3.camX + 248, 190, { state: 'attack', stateT: 2 }))
    gs3.enemies[0].tgt = 'jimmy'
    for (let i = 0; i < 40; i++) { step(gs3, {}, {}); gs3.events.length = 0 }
    r.check('S4: one clean hit takes the seat it finds — Jimmy pays, Billy keeps his bank, the run lives',
        gs3.jimmy.lives === CFG.lives - 1 && gs3.jimmy.inv > 0 && gs3.billy.lives === CFG.lives && gs3.mode === 'play',
        `jimmy ${gs3.jimmy.lives}/${gs3.jimmy.inv}f billy ${gs3.billy.lives} mode=${gs3.mode}`)

    // game over only when BOTH banks are empty
    const gs4 = makeGame(24, { coop: true })
    gs4.jimmy.lives = 0; gs4.jimmy.out = true; gs4.jimmy.state = 'idle'; gs4.jimmy.stateT = 0
    gs4.waveIdx = 9; gs4.camLock = true; gs4.camX = 200
    gs4.billy.x = gs4.camX + 40; gs4.billy.y = 170; gs4.billy.inv = 0; gs4.billy.lives = 1
    gs4.enemies.push(mk('williams', gs4.camX + 48, 170, { state: 'attack', stateT: 2 }))
    for (let i = 0; i < 40; i++) { step(gs4, {}, {}); gs4.events.length = 0 }
    r.check('S4: the run ends only when both banks run dry — seat down, last Billy life out, GAME OVER',
        gs4.mode === 'gameover', `mode=${gs4.mode}`)
    const gs4b = makeGame(24, { coop: true })
    gs4b.jimmy.lives = 0; gs4b.jimmy.out = true; gs4b.jimmy.state = 'idle'; gs4b.jimmy.stateT = 0
    for (let i = 0; i < 200; i++) { step(gs4b, {}, {}); gs4b.events.length = 0 }
    r.check('S4: an empty bank is not game over — the partner carries the street alone',
        gs4b.mode === 'play', `mode=${gs4b.mode}`)

    // second wind: a drained seat returns with one life when a new stage opens
    const gs5 = makeGame(25, { coop: true })
    gs5.jimmy.lives = 0; gs5.jimmy.out = true; gs5.jimmy.state = 'dying'; gs5.jimmy.stateT = 30
    enterStage2(gs5)
    r.check('S4: second wind — the hideout opens with both dragons standing, the fallen one on its last life',
        !gs5.jimmy.out && gs5.jimmy.lives === 1 && gs5.stage === 2, `out=${gs5.jimmy.out} lives=${gs5.jimmy.lives}`)

    // Marian's ropes answer EITHER dragon's fists
    const gs6 = makeGame(26, { coop: true })
    enterStage2(gs6)
    gs6.waveIdx = WAVES_S2.length; gs6.enemies = []; gs6.camLock = false; gs6.camX = 640
    gs6.billy.x = 700; gs6.billy.y = 140; gs6.billy.inv = 999          // Billy stays down the yard
    gs6.jimmy.x = gs6.marian.x - 12; gs6.jimmy.y = gs6.marian.y; gs6.jimmy.human = true
    for (let i = 0; i < 60 && !gs6.marian.freed; i++) {
        step(gs6, {}, { punch: gs6.tick % 14 === 0 })
        gs6.events.length = 0
    }
    r.check('S4: Jimmy alone cuts Marian loose — the rescue is a two-man job, either seat\'s fists count',
        gs6.marian.freed && gs6.score >= CFG.rescueBonus && gs6.billy.x < gs6.marian.x - 100,
        `freed=${gs6.marian.freed} score=${gs6.score} billy@${gs6.billy.x}`)

    // thrown steel hits whichever dragon owns the lane
    const gs7 = makeGame(27, { coop: true })
    gs7.waveIdx = 9; gs7.camLock = true; gs7.camX = 200
    gs7.billy.x = gs7.camX + 100; gs7.billy.y = 140; gs7.billy.inv = 999
    gs7.jimmy.x = gs7.camX + 120; gs7.jimmy.y = 190; gs7.jimmy.inv = 0; gs7.jimmy.human = true
    gs7.projectiles.push({ id: 999, x: gs7.camX + 40, y: 190, vx: 3, spin: 0, side: 'goon' })
    for (let i = 0; i < 60; i++) { step(gs7, {}, {}); gs7.events.length = 0 }
    r.check('S4: a cast blade takes the dragon on its lane — Jimmy\'s lane, Jimmy\'s life; Billy off-lane is safe',
        gs7.jimmy.lives === CFG.lives - 1 && gs7.billy.lives === CFG.lives, `jimmy ${gs7.jimmy.lives} billy ${gs7.billy.lives}`)

    // no friendly fire: dragons share a lane and swing without costing each other
    const gs8 = makeGame(28, { coop: true })
    gs8.waveIdx = 9; gs8.camLock = true; gs8.camX = 200
    gs8.billy.x = gs8.camX + 100; gs8.billy.y = 170
    gs8.jimmy.x = gs8.camX + 110; gs8.jimmy.y = 170
    for (let i = 0; i < 40; i++) { step(gs8, { b: gs8.tick % 8 === 0 }, {}); gs8.events.length = 0 }
    r.check('S4: strikes pass beside your own dragon — Billy\'s roundhouse next to Jimmy costs nobody a life',
        gs8.jimmy.lives === CFG.lives && gs8.billy.lives === CFG.lives, `jimmy ${gs8.jimmy.lives} billy ${gs8.billy.lives}`)

    // crowd law grows: three deep with two dragons, still never four; solo stays two
    const crowdProbe = (coop) => {
        const g = makeGame(31, { coop })
        g.waveIdx = 9; g.camLock = true; g.camX = 200
        g.billy.x = g.camX + 100; g.billy.y = 170; g.billy.lives = 9; g.billy.inv = 999
        if (g.jimmy) { g.jimmy.x = g.camX + 108; g.jimmy.y = 176; g.jimmy.lives = 9; g.jimmy.inv = 999 }
        for (let k = 0; k < 4; k++) g.enemies.push(mk('williams', g.camX + 114 + k, 168 + k * 4, { attackCooldown: 0 }))
        let maxAtk = 0
        for (let i = 0; i < 30; i++) {
            step(g, {}, {})
            maxAtk = Math.max(maxAtk, g.enemies.filter((e) => e.state === 'windup' || e.state === 'attack').length)
            g.events.length = 0
        }
        return maxAtk
    }
    const deep3 = crowdProbe(true), deep2 = crowdProbe(false)
    r.check('S4: the crowd law grows with the street — three attackers with two dragons, two with one, never four',
        deep3 === 3 && deep2 === 2, `coop max=${deep3} solo max=${deep2}`)

    // the co-op winnable proof: Billy's proven autopilot + Jimmy's own brain
    const runFullCoop = (seed, max = 60000) => {
        const g = makeGame(seed, { coop: true })
        while (g.tick < max) {
            step(g, autopilot(g), {})
            g.events.length = 0
            if (g.mode === 'gameover') break
            if (g.cleared && g.stage === 1 && g.mode === 'play') break
        }
        return g
    }
    let wins = 0
    for (let seed = 1; seed <= 6; seed++) {
        const g = runFullCoop(seed)
        if (g.cleared && g.stage === 1 && g.mode === 'play') wins += 1
    }
    r.check(`S4 winnable: Billy's autopilot + Jimmy's own brain clear the FULL run on seeds 1..6`, wins === 6, `${wins}/6`)

    // determinism rides the co-op path too
    const coopHash = () => { const g = makeGame(9, { coop: true }); for (let i = 0; i < 400; i++) { step(g, autopilot(g), {}); g.events.length = 0 } return stateHash(g) }
    r.check('S4: the co-op timeline is deterministic — seed + inputs replay to the same hash', coopHash() === coopHash())
}

// --------------------------------------------------- #2833 co-op feel pass ---
{ // the blue seat's personality, ear, rescue manners, drop-in edges, and the
  // second-wind return stamp — every polish law the feel pass shipped.
    const gs = makeGame(31, { coop: true })
    gs.enemies.length = 0; gs.barrels.length = 0; gs.pickups.length = 0; gs.projectiles.length = 0
    // the blue seat sounds blue: Jimmy's swings bite with a `_b`, Billy's plain
    gs.jimmy.human = true
    gs.jimmy.inv = 999; gs.jimmy.x = 140; gs.jimmy.y = 180
    gs.billy.inv = 999; gs.billy.x = 60; gs.billy.y = 180
    gs.enemies.push(mk('williams', 152, 180, { hp: 30, attackCooldown: 999 }))
    let ev = []
    step(gs, {}, { punch: true }); ev.push(...gs.events); gs.events.length = 0
    for (let i = 0; i < 8; i++) { step(gs, {}, {}); ev.push(...gs.events); gs.events.length = 0 }
    r.check('#2833 audio: the blue seat sounds blue — Jimmy\'s whoosh and bite carry _b',
        ev.includes('whoosh_b') && ev.includes('hit_b'), ev.join(','))
    gs.enemies.push(mk('williams', 72, 180, { hp: 30, attackCooldown: 999 }))
    ev = []
    step(gs, { punch: true }, {}); ev.push(...gs.events); gs.events.length = 0
    for (let i = 0; i < 8; i++) { step(gs, {}, {}); ev.push(...gs.events); gs.events.length = 0 }
    r.check('#2833 audio: Billy stays red at an ear — the same swing lands unsuffixed',
        ev.includes('whoosh') && ev.includes('hit'), ev.join(','))

    // hang-back: with Billy already locked on, Jimmy circles in at his
    // shoulder instead of piling onto the same goon
    const gs2 = makeGame(32, { coop: true })
    gs2.enemies.length = 0; gs2.barrels.length = 0; gs2.pickups.length = 0
    gs2.enemies.push(mk('williams', 200, 180, { hp: 30, attackCooldown: 999 }))
    gs2.billy.x = 185; gs2.billy.y = 180; gs2.billy.inv = 999
    gs2.jimmy.x = 175; gs2.jimmy.y = 180; gs2.jimmy.inv = 999
    const pAlly = dragonBrain(gs2, gs2.jimmy, gs2.billy)
    const pSolo = dragonBrain(gs2, gs2.jimmy)
    r.check('#2833 hang-back: half a beat behind the first dragon — Jimmy holds outside a scrap Billy is already in',
        pAlly.left && !pAlly.right && pSolo.right && !pSolo.left,
        `ally L=${pAlly.left}/R=${pAlly.right} solo R=${pSolo.right}/L=${pSolo.left}`)

    // calm drift: no goons on the block — the blue seat falls in beside his
    // brother instead of marching alone
    const gs3 = makeGame(33, { coop: true })
    gs3.enemies.length = 0; gs3.barrels.length = 0; gs3.pickups.length = 0
    gs3.billy.x = 100; gs3.billy.y = 150; gs3.billy.inv = 999
    gs3.jimmy.x = 90; gs3.jimmy.y = 190; gs3.jimmy.inv = 999
    const dAlly = dragonBrain(gs3, gs3.jimmy, gs3.billy)
    const dSolo = dragonBrain(gs3, gs3.jimmy)
    r.check('#2833 drift: on the quiet street Jimmy matches his brother\'s depth and holds a shoulder gap',
        dAlly.up && !dAlly.right && dSolo.right, `drift U=${dAlly.up}/R=${dAlly.right} solo R=${dSolo.right}`)

    // rescue steel: the duel's last knives outrun their throwers — a cutter
    // walking the ropes still slips the lane before it walks into steel
    const gs4 = makeGame(34, { coop: true })
    enterStage2(gs4)
    gs4.waveIdx = WAVES_S2.length
    gs4.enemies.length = 0
    gs4.billy.x = 880; gs4.billy.y = 170; gs4.billy.inv = 999
    gs4.jimmy.x = 820; gs4.jimmy.y = 170; gs4.jimmy.inv = 999
    gs4.projectiles.push({ id: 1, x: 850, y: 176, vx: -4, spin: 0, side: 'goon' })
    const rPad = dragonBrain(gs4, gs4.jimmy, gs4.billy)
    r.check('#2833 rescue steel: the cutter answers flying blades before walking the ropes (live goons can\'t gate this — rescueReady means the field is empty)',
        (rPad.up || rPad.down) && !rPad.right, `U=${rPad.up}/D=${rPad.down}/R=${rPad.right}`)

    // second wind with a visible stamp: the drained seat returns beside its
    // brother, ghosted, and backAt marks the tick the cabinet blinks it home
    const gs5 = makeGame(35, { coop: true })
    gs5.jimmy.lives = 0; gs5.jimmy.out = true; gs5.jimmy.state = 'dying'; gs5.jimmy.stateT = 0
    enterStage2(gs5)
    r.check('#2833 second wind: the drained seat lands beside its brother, ghosted and stamped (backAt)',
        gs5.jimmy.out === false && gs5.jimmy.lives === 1 && gs5.jimmy.inv > 60 &&
        Math.abs(gs5.jimmy.x - gs5.billy.x) <= 20 && gs5.jimmy.backAt === gs5.tick && gs5.billy.backAt === -9999,
        `out=${gs5.jimmy.out} lives=${gs5.jimmy.lives} inv=${gs5.jimmy.inv} dx=${(gs5.jimmy.x - gs5.billy.x).toFixed(0)} backAt=${gs5.jimmy.backAt}`)

    // drop-in edge: a falling seat takes no input — buttons must not
    // resurrect a drained dragon mid-tumble
    const gs6 = makeGame(36, { coop: true })
    gs6.jimmy.lives = 0; gs6.jimmy.out = true; gs6.jimmy.state = 'dying'; gs6.jimmy.stateT = 0; gs6.jimmy.human = true
    let ev6 = []
    for (let i = 0; i < 12; i++) { step(gs6, {}, { punch: true, b: true, jump: true, right: true, up: true }); ev6.push(...gs6.events); gs6.events.length = 0 }
    r.check('#2833 drop-in edge: no button resurrects a drained dragon mid-tumble',
        gs6.jimmy.out && gs6.jimmy.state === 'dying' && gs6.jimmy.lives === 0 && !ev6.some((e) => e.endsWith('_b')),
        `state=${gs6.jimmy.state} out=${gs6.jimmy.out} blue=${ev6.filter((e) => e.endsWith('_b')).join('|') || 'none'}`)
}

// ------------------------------------------- #2851 partner personality pass ---
{ // the blue seat stops being a mirror: the guardian law, the release law,
  // and the technician's cadence — the personality layer on the ally seat.
    const gs = makeGame(51, { coop: true })
    gs.enemies.length = 0; gs.barrels.length = 0; gs.pickups.length = 0; gs.projectiles.length = 0
    // Billy is in a thug's grip across the block; a stray sits BEHIND Jimmy.
    const holder = mk('amon', 300, 180, { state: 'grab', attackCooldown: 9999 })
    holder.id = 1400; holder.tgt = 'billy' // mk spreads only over.rest — the grip needs its target
    gs.enemies.push(holder)
    gs.enemies.push(mk('williams', 112, 180, { hp: 30, attackCooldown: 9999 }))
    gs.billy.state = 'grabbed'; gs.billy.grabFrom = holder.id; gs.billy.stateT = 0
    gs.billy.x = 292; gs.billy.y = 180; gs.billy.inv = 999
    gs.jimmy.x = 140; gs.jimmy.y = 180; gs.jimmy.inv = 999
    const gAlly = dragonBrain(gs, gs.jimmy, gs.billy)
    const gSolo = dragonBrain(gs, gs.jimmy)
    r.check('#2851 guardian: a brother in grips outranks my nearest mark — sprint the holder, not the stray',
        gAlly.right && !gAlly.left && gSolo.left && !gSolo.right,
        `guardian L=${gAlly.left}/R=${gAlly.right} mirror L=${gSolo.left}/R=${gSolo.right}`)

    // release law: a partner's fist on the grabber frees the seat — the arcade
    // freed you when the grabber took a hit. The seat is pinned human with an
    // empty pad so mash-escape cannot fake the rescue.
    const gs3 = makeGame(53, { coop: true })
    gs3.enemies.length = 0; gs3.barrels.length = 0; gs3.pickups.length = 0; gs3.projectiles.length = 0
    const holder3 = mk('amon', 200, 180, { state: 'grab', attackCooldown: 99999 })
    holder3.id = 1503; holder3.tgt = 'jimmy' // grip identity lives on tgt, not the reused x-id
    gs3.enemies.push(holder3)
    gs3.jimmy.state = 'grabbed'; gs3.jimmy.grabFrom = holder3.id; gs3.jimmy.stateT = 0
    gs3.jimmy.x = 192; gs3.jimmy.y = 180; gs3.jimmy.inv = 999; gs3.jimmy.human = true
    gs3.billy.x = 188; gs3.billy.y = 180; gs3.billy.inv = 999
    const ev3 = []
    for (let i = 0; i < 12; i++) { step(gs3, { punch: true }, {}); ev3.push(...gs3.events); gs3.events.length = 0 }
    r.check('#2851 release: the holder takes a red fist and drops his prize — idle, unstuck, iframed, blue sweep',
        gs3.jimmy.state === 'idle' && gs3.jimmy.grabFrom === null && gs3.jimmy.inv >= 24 &&
        ev3.includes('hit') && ev3.includes('escape_b'),
        `state=${gs3.jimmy.state} grab=${gs3.jimmy.grabFrom} inv=${gs3.jimmy.inv} ev=${ev3.join(',')}`)

    // cadence split: Billy's hammer is a 9-beat kick; the blue seat jabs-jabs-
    // crosses on a 13-beat (13 ⊥ 9) — at the top of the bar the dragons answer
    // different bars, the tell that the mirror is gone.
    const gs4 = makeGame(54, { coop: true })
    gs4.enemies.length = 0; gs4.barrels.length = 0; gs4.pickups.length = 0; gs4.projectiles.length = 0
    gs4.enemies.push(mk('williams', 150, 180, { hp: 30, attackCooldown: 9999 }))
    gs4.jimmy.x = 140; gs4.jimmy.y = 180; gs4.jimmy.inv = 999
    gs4.billy.x = 60; gs4.billy.y = 150; gs4.billy.inv = 999
    let allyAsks = ''; let soloAsks = ''
    for (let t = 0; t < 13; t++) {
        gs4.tick = t
        const pa = dragonBrain(gs4, gs4.jimmy, gs4.billy)
        const ps = dragonBrain(gs4, gs4.jimmy)
        allyAsks += pa.punch ? 'J' : pa.b ? 'K' : '.'
        soloAsks += ps.b ? 'K' : ps.punch ? 'J' : '.'
    }
    r.check('#2851 cadence: the blue seat jabs-jabs-crosses on 13 while the hammer kicks on 9 — the lockstep mirror is broken',
        allyAsks === 'JJ.JJ.KK.....' && soloAsks === 'KK.......KK..' &&
        allyAsks[0] === 'J' && soloAsks[0] === 'K',
        `blue=${allyAsks} red=${soloAsks}`)
}

// ------------------------------------------------------- p2 pad seat (#2860) ---
// Two humans at one keyboard are always cramped — this seat lifts a friend's
// own pad (or linked phone) onto the blue dragon with no keyboard at all.
// The law: slot 2 merges with the keyboard's P2 keys (either drives, both
// together union); A jumps, B kicks, the third channel (`boost` — square /
// triangle / LB on a pad, Y on a phone) punches; any live input takes the
// seat for the run exactly like the WASD drop-in. And the slotcheck law:
// same stream, kb or pad, ⇒ same state hash — translation lives in p2Merge
// alone.

console.log('p2 pad seat (#2860)')
{
    const kbIdle = { l: false, r: false, u: false, d: false, j: false, k: false, p: false }

    const kbOnly = p2Merge({ l: true, r: false, u: false, d: true, j: true, k: true, p: true }, null)
    r.check('#2860 kb-only stream is byte-identical to the pre-pad shell (V jump / G kick / F punch)',
        kbOnly.left && kbOnly.down && kbOnly.a && kbOnly.b && kbOnly.punch && !kbOnly.right && !kbOnly.up,
        JSON.stringify(kbOnly))

    clearAllSlots()
    for (const f of ['right', 'up', 'a', 'boost']) pressSlot(2, f)
    const padOnly = p2Merge(kbIdle, slotPad(2, 'dpad'))
    r.check('#2860 pad-only stream drives walk + A jump + third-action punch through the slot layer',
        padOnly.right && padOnly.up && padOnly.a && padOnly.punch && !padOnly.b && !padOnly.left,
        JSON.stringify(padOnly))
    clearAllSlots()

    pressSlot(2, 'left')
    const union = p2Merge({ ...kbIdle, r: true }, slotPad(2, 'dpad'))
    clearAllSlots()
    r.check('#2860 keyboard and pad union — two friends on one machine never silence each other',
        union.left && union.right, JSON.stringify(union))

    pressSlot(2, 'b')
    const kick = p2Merge(kbIdle, slotPad(2, 'dpad'))
    clearAllSlots()
    r.check('#2860 B is the kick — the pad reaches the sim shape complete', kick.b === true, JSON.stringify(kick))

    pressSlot(2, 'boost')
    const activeBoost = slotActive(2)
    clearAllSlots()
    r.check('#2860 the punch key counts as live input — a boost-only press wakes slot 2 (seats the friend)',
        activeBoost === true)

    const gsSeat = makeGame(77, { coop: true })
    const took1 = p2Seat(gsSeat, true)
    const took2 = p2Seat(gsSeat, true)
    r.check('#2860 seat law: the first live input seats the human, the chime pays once',
        took1 === true && took2 === false && gsSeat.jimmy.human === true)
    const gsSolo = makeGame(78, { coop: false })
    const soloHit = p2Seat(gsSolo, true)
    const gsOut = makeGame(79, { coop: true })
    gsOut.jimmy.out = true
    const outHit = p2Seat(gsOut, true)
    const idleHit = p2Seat(makeGame(80, { coop: true }), false)
    r.check('#2860 seat law: solo declines, a fallen dragon is not resurrected by a wiggle, idle seats nobody',
        soloHit === false && gsSolo.jimmy === null && outHit === false && gsOut.jimmy.human === false && idleHit === false)

    // equivalence: 240 ticks of scripted directions and verbs run twice on
    // seed 91 — once through the keyboard's P2 booleans, once written into
    // slot 2 the way the bridge/phone writes them (jump→a, kick→b, punch→
    // boost). Same seat, same world, hash after hash.
    const STREAM = Array.from({ length: 240 }, (_, i) => ({
        l: i % 53 < 12, r: i % 53 >= 18 && i % 53 < 34,
        u: i % 71 < 15, d: i % 71 >= 22 && i % 71 < 30,
        j: i % 37 < 3, k: i % 23 < 2, p: i % 41 < 2,
    }))
    const runSeat = (viaSlot) => {
        const gs = makeGame(91, { coop: true })
        gs.enemies.length = 0; gs.barrels.length = 0; gs.pickups.length = 0; gs.projectiles.length = 0
        gs.jimmy.human = true
        clearAllSlots()
        const hashes = []
        let jumped = false, kicked = false, punched = false
        const x0 = gs.jimmy.x
        for (let i = 0; i < STREAM.length; i++) {
            const s = STREAM[i]
            if (viaSlot) {
                const map = { left: s.l, right: s.r, up: s.u, down: s.d, a: s.j, b: s.k, boost: s.p }
                for (const [f, v] of Object.entries(map)) { if (v) pressSlot(2, f); else releaseSlot(2, f) }
            }
            const merged = viaSlot ? p2Merge(kbIdle, slotPad(2, 'dpad')) : p2Merge(s, null)
            step(gs, {}, merged)
            gs.events.length = 0
            if (gs.jimmy.z > 0) jumped = true
            if (gs.jimmy.state === 'kick') kicked = true
            if (gs.jimmy.state === 'punch') punched = true
            hashes.push(stateHash(gs))
        }
        clearAllSlots()
        return { hashes, moved: gs.jimmy.x - x0, jumped, kicked, punched }
    }
    const viaKb = runSeat(false)
    const viaPad = runSeat(true)
    const same = viaKb.hashes.length === viaPad.hashes.length && viaKb.hashes.every((h, i) => h === viaPad.hashes[i])
    r.check('#2860 same stream, kb or slot 2, lands on the same world (240-tick hash equivalence)',
        same, `first divergence tick ${viaKb.hashes.findIndex((h, i) => h !== viaPad.hashes[i])}`)
    r.check('#2860 the pad stream is alive in the sim — walk, hop, kick and punch off pad fields alone',
        viaPad.jumped && viaPad.kicked && viaPad.punched && viaPad.moved > 0,
        `moved ${viaPad.moved.toFixed(0)}px jump=${viaPad.jumped} kick=${viaPad.kicked} punch=${viaPad.punched}`)
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
            anchor: 'if (p.inv <= 0 && p.z <= 6 && Math.abs(pr.x - p.x) <= 10 && Math.abs(pr.y - p.y) <= 7)',
            plant: 'if (p.inv <= 0 && p.z <= 6 && Math.abs(pr.x - p.x) <= 10 && Math.abs(pr.y - p.y) <= 400 /* MUTANT(blade-blind): thrown steel ignores the belt */)',
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
        {
            name: 'ally-blind',
            anchor: '    const cands = activeFighters(gs)\n    if (cands.length === 0) return gs.billy',
            plant: '    return gs.billy /* MUTANT(ally-blind): the crowd only ever sees Billy */',
            harm: async (mod) => {
                const gs = mod.makeGame(21, { coop: true })
                gs.waveIdx = 9; gs.camLock = true; gs.camX = 200
                gs.billy.x = gs.camX + 40; gs.billy.y = 140; gs.billy.inv = 999
                gs.jimmy.x = gs.camX + 240; gs.jimmy.y = 190; gs.jimmy.inv = 999
                gs.jimmy.human = true   // seated idle — the test is what the CROWD does
                gs.enemies.push({ id: 911, kind: 'williams', x: gs.camX + 260, y: 190, face: -1, hp: 4, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 0, inv: 0, spinHit: false })
                let minX = Infinity
                let sawBillyTgt = false
                for (let i = 0; i < 150; i++) {
                    mod.step(gs, {}, {})
                    const q = gs.enemies[0]
                    if (q) { minX = Math.min(minX, q.x); if (q.tgt === 'billy') sawBillyTgt = true }
                    gs.events.length = 0
                }
                return (sawBillyTgt || minX < gs.camX + 200)
                    ? `HARM NAMED: a thug 20px off Jimmy's shoulder marched over 60 pixels across the screen to work Billy instead (closest x=${minX.toFixed(0)}, tgt=${sawBillyTgt ? 'billy' : 'never set'}) — if the crowd only sees the first dragon, co-op collapses into solo-with-a-statue and the second player is scenery`
                    : null
            },
        },
        {
            name: 'seat-blind',
            anchor: "        if (activeFighters(gs).length === 0) { gs.mode = 'gameover'; return }",
            plant: "        if (true) { gs.mode = 'gameover'; return } /* MUTANT(seat-blind): one drained seat ends the run */",
            harm: async (mod) => {
                const gs = mod.makeGame(23, { coop: true })
                gs.waveIdx = 9; gs.camLock = true; gs.camX = 200
                gs.jimmy.x = gs.camX + 240; gs.jimmy.y = 190; gs.jimmy.inv = 0; gs.jimmy.lives = 1; gs.jimmy.human = true
                gs.billy.x = gs.camX + 40; gs.billy.y = 140; gs.billy.inv = 999
                gs.enemies.push({ id: 912, kind: 'williams', x: gs.camX + 248, y: 190, face: -1, hp: 4, state: 'attack', stateT: 2, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 0, inv: 0, spinHit: false, tgt: 'jimmy' })
                for (let i = 0; i < 40; i++) { mod.step(gs, {}, {}); gs.events.length = 0 }
                return gs.mode === 'gameover' && gs.billy.lives === CFG.lives
                    ? `HARM NAMED: Jimmy's last life fell and the whole run ended while Billy stood there with all 3 lives (mode=${gs.mode}, billy=${gs.billy.lives}) — the arcade co-op promise is that the partner carries you; one bank empty is a seat down, not a game over`
                    : null
            },
        },
        {
            name: 'one-voice',
            anchor: "const blue = (seat, ev) => (seat === 'jimmy' ? ev + '_b' : ev)",
            plant: 'const blue = (seat, ev) => ev /* MUTANT(one-voice): both dragons share one voice */',
            harm: async (mod) => {
                const gs = mod.makeGame(31, { coop: true })
                gs.enemies.length = 0; gs.barrels.length = 0; gs.pickups.length = 0
                gs.jimmy.human = true
                gs.jimmy.inv = 999; gs.jimmy.x = 140; gs.jimmy.y = 180
                gs.billy.inv = 999
                gs.enemies.push({ id: 913, kind: 'williams', x: 152, y: 180, face: -1, hp: 30, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 999, inv: 0, spinHit: false })
                const ev = []
                mod.step(gs, {}, { punch: true }); ev.push(...gs.events); gs.events.length = 0
                for (let i = 0; i < 8; i++) { mod.step(gs, {}, {}); ev.push(...gs.events); gs.events.length = 0 }
                return !ev.some((e) => e.endsWith('_b'))
                    ? `HARM NAMED: the blue seat swung and nothing carried a _b tag (${ev.join('|') || 'silence'}) — one shared voice for two dragons means the ear cannot tell who is fighting; the seats blur`
                    : null
            },
        },
        {
            name: 'guardian-deaf',
            anchor: '        if (holder) target = holder',
            plant: '        if (false && holder) target = holder /* MUTANT(guardian-deaf): the seat stops seeing its brother in grips */',
            harm: async (mod) => {
                const gs = mod.makeGame(51, { coop: true })
                gs.enemies.length = 0; gs.barrels.length = 0; gs.pickups.length = 0; gs.projectiles.length = 0
                const holder = mk('amon', 300, 180, { state: 'grab', attackCooldown: 9999 })
                holder.id = 1400; holder.tgt = 'billy'
                gs.enemies.push(holder)
                gs.enemies.push(mk('williams', 112, 180, { hp: 30, attackCooldown: 9999 }))
                gs.billy.state = 'grabbed'; gs.billy.grabFrom = holder.id; gs.billy.stateT = 0
                gs.billy.x = 292; gs.billy.y = 180; gs.billy.inv = 999
                gs.jimmy.x = 140; gs.jimmy.y = 180; gs.jimmy.inv = 999
                const gAlly = mod.dragonBrain(gs, gs.jimmy, gs.billy)
                return gAlly.left && !gAlly.right
                    ? 'HARM NAMED: Billy dangles in a grip across the block and the blue seat strolls after its own nearest stray — a partner that cannot see you caught is furniture, and the phone seat loses the one rescue the co-op was promised'
                    : null
            },
        },
        {
            name: 'grip-permanent',
            anchor: '        if (!holder) {',
            plant: '        if (false && !holder) { /* MUTANT(grip-permanent): staggered holders stop dropping their prize */',
            harm: async (mod) => {
                const gs = mod.makeGame(53, { coop: true })
                gs.enemies.length = 0; gs.barrels.length = 0; gs.pickups.length = 0; gs.projectiles.length = 0
                const holder = mk('amon', 200, 180, { state: 'grab', attackCooldown: 99999 })
                holder.id = 1503; holder.tgt = 'jimmy'
                gs.enemies.push(holder)
                gs.jimmy.state = 'grabbed'; gs.jimmy.grabFrom = holder.id; gs.jimmy.stateT = 0
                gs.jimmy.x = 192; gs.jimmy.y = 180; gs.jimmy.inv = 999; gs.jimmy.human = true
                gs.billy.x = 188; gs.billy.y = 180; gs.billy.inv = 999
                for (let i = 0; i < 12; i++) { mod.step(gs, { punch: true }, {}); gs.events.length = 0 }
                return gs.jimmy.state === 'grabbed'
                    ? 'HARM NAMED: the holder went down and the seat stayed in his arms — a grip that survives its owner is a rubber band, and every caught run still pays the knee'
                    : null
            },
        },
        {
            name: 'cadence-mirror',
            anchor: '        if (!surrounded && ally) {',
            plant: '        if (false && !surrounded && ally) { /* MUTANT(cadence-mirror): the blue seat snaps back onto the red hammer beat */',
            harm: async (mod) => {
                const gs = mod.makeGame(54, { coop: true })
                gs.enemies.length = 0; gs.barrels.length = 0; gs.pickups.length = 0; gs.projectiles.length = 0
                gs.enemies.push(mk('williams', 150, 180, { hp: 30, attackCooldown: 9999 }))
                gs.jimmy.x = 140; gs.jimmy.y = 180; gs.jimmy.inv = 999
                gs.billy.x = 60; gs.billy.y = 150; gs.billy.inv = 999
                let allyAsks = ''
                for (let t = 0; t < 13; t++) {
                    gs.tick = t
                    const pa = mod.dragonBrain(gs, gs.jimmy, gs.billy)
                    allyAsks += pa.punch ? 'J' : pa.b ? 'K' : '.'
                }
                return allyAsks === 'KK.......KK..'
                    ? 'HARM NAMED: the two dragons swing the same bar again (blue=' + allyAsks + ') — a mirror in a second sprite is one player wearing a costume; the duo read as one until the seats answer different beats'
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
    {
        // the seat's own translator: swap A onto B and the friend's jump goes
        // dead under the thumb; the p2Merge pins must name it.
        const PP = join(ROOT, 'src/games/DoubleDragon/p2pad.js')
        const psrc = readFileSync(PP, 'utf8')
        const panchor = 'a: !!kb.j || !!p.a,           // jump'
        const pplant = 'a: !!kb.j || !!p.b,           // MUTANT(seat-swap): the friend\'s jump migrates onto B'
        if (!psrc.includes(panchor)) { console.error('MUTANT anchor (seat-swap) missing — p2pad moved; the plant must be re-anchored'); process.exit(2) }
        writeFileSync(PP, psrc.replace(panchor, pplant))
        let bad
        try {
            bad = 'dynamic-import'
            bad = await (async () => {
                const mod = await import(`../src/games/DoubleDragon/p2pad.js?mutant=seat-swap${Date.now()}`)
                const m = mod.p2Merge({ l: false, r: false, u: false, d: false, j: false, k: false, p: false }, { left: false, right: false, up: false, down: false, a: true, b: false, boost: false })
                return !m.a && !m.b
                    ? 'HARM NAMED: the friend pressed A — the button every cabinet puts jump on — and the dragon answered nothing; the seat\'s translation is the friend\'s only contract with the game, and a broken one teaches them to drop the pad'
                    : null
            })()
        } finally {
            writeFileSync(PP, psrc)
        }
        r.check('mutant(seat-swap) goes RED: harm named', bad !== null, bad || 'harm NOT named — mutant survived')
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

    // #1712: DD now asks the S2 consent question before seed-birth (autoRecord
    // gate, fixed inset-0 z-9990 — it swallows scripted starts until clicked).
    // Answer it the way gauntletplay/touchselectcheck do: its own NO THANKS
    // button — a real decline, never a grant (#2091). Where the store is
    // silent the gate never rises and this is a no-op.
    const defuseGate = async () => {
        const declined = await page.evaluate(() => {
            const gate = document.querySelector('[data-auto-record-gate]')
            if (!gate) return false
            const btn = [...gate.querySelectorAll('button')].find((el) => /NO THANKS/i.test(el.textContent || ''))
            if (btn) btn.click()
            return true
        })
        if (declined) await page.waitForTimeout(400)
        return declined
    }

    const attract1 = await page.evaluate(() => window.__ddTest.probe())
    await page.waitForTimeout(700)
    const attract2 = await page.evaluate(() => window.__ddTest.probe())
    r.check('attract: the demo runs itself before any key', attract1.screen === 'attract' && attract2.tick > attract1.tick, `tick ${attract1.tick} -> ${attract2.tick}`)

    await page.keyboard.press('Space')
    await defuseGate()
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

    // S4 leg: the blue dragon is on the street by default (Jon's rule), and a
    // real WASD press takes the seat drop-in — the Contra S4 law, browser-proved.
    await page.evaluate(() => window.__game.reset(17))
    await page.waitForTimeout(120)
    const seat0 = await page.evaluate(() => window.__ddTest.probe())
    r.check('S4: co-op is the default seat — Jimmy fights beside Billy on a fresh cabinet',
        seat0.coop === 1 && /CPU/.test(seat0.jimmy) && seat0.jimmy.split(':')[2] === '3', `jimmy=${seat0.jimmy}`)
    const jimmyBefore = Number(String(seat0.jimmy).split(':')[0])
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(300)
    await page.keyboard.up('KeyW')
    await page.keyboard.down('KeyD')
    await page.waitForTimeout(300)
    await page.keyboard.up('KeyD')
    const seated = await page.evaluate(() => window.__ddTest.probe())
    const jimmyAfter = Number(String(seated.jimmy).split(':')[0])
    r.check('S4: a real W press seats the human and WASD drives the blue dragon (depth + walk)',
        /HUMAN/.test(seated.jimmy) && jimmyAfter > jimmyBefore, `jimmy ${seat0.jimmy} -> ${seated.jimmy}`)

    // #2860: the friend's own pad. navigator.getGamepads is stubbed — pad 1
    // idle, pad 2 live — and GamepadBridge's rAF poll, onePad slot 2, the
    // p2Merge seat and the sim run for real off the fake. No keyboard key is
    // pressed in this leg; the WASD seat above proves the keyboard path.
    await page.evaluate(() => window.__game.reset(31))
    await page.waitForTimeout(150)
    await page.evaluate(() => {
        const mkButtons = () => Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }))
        const mkPad = (id) => ({ connected: true, id, index: 0, mapping: 'standard', buttons: mkButtons(), axes: [0, 0, 0, 0], timestamp: 0 })
        window.__fakePads = [mkPad('fake-one'), mkPad('fake-two')]
        Object.defineProperty(navigator, 'getGamepads', { value: () => window.__fakePads, configurable: true })
    })
    const pad0 = await page.evaluate(() => ({ ...window.__ddTest.probe(), s: window.__game.state() }))
    r.check('#2860 a fresh cabinet hands Jimmy to the CPU — the seat is open, not pre-taken',
        /CPU/.test(pad0.jimmy) && pad0.s.jimmyHuman === 0, `jimmy=${pad0.jimmy}`)

    const held = (pad, btn, v) => page.evaluate(({ pad, btn, v }) => { window.__fakePads[pad].buttons[btn].pressed = v }, { pad, btn, v })
    await held(1, 15, true) // d-pad right on the friend's pad
    let padErr = null
    try {
        await page.waitForFunction(() => window.__game.state().jimmyHuman === 1, { timeout: 4000 })
    } catch { padErr = 'seat never taken' }
    await page.waitForTimeout(450) // keep the thumb on d-pad right and let the walk accrue
    const padWalk = await page.evaluate(() => ({ ...window.__ddTest.probe(), s: window.__game.state() }))
    r.check('#2860 a live second pad seats the human through the real bridge — no keyboard touched',
        padErr === null && padWalk.s.jimmyHuman === 1, padErr || `jimmy=${padWalk.jimmy}`)
    r.check('#2860 d-pad right walks the blue dragon and Billy stays planted (slot 2 does not leak to P1)',
        padWalk.s.jimmyX > pad0.s.jimmyX + 8 && Math.abs(padWalk.x - pad0.x) < 2, `jimmyX ${pad0.s.jimmyX} -> ${padWalk.s.jimmyX}, billy x ${pad0.x} -> ${padWalk.x}`)

    await held(1, 15, false)
    await held(1, 0, true) // A — the hop
    let jumpSeen = false
    try { await page.waitForFunction(() => window.__ddTest.probe().jimmyZ > 0 || /:jump/.test(window.__ddTest.probe().jimmy), { timeout: 3000 }); jumpSeen = true } catch {}
    await held(1, 0, false)
    await held(1, 1, true) // B — the kick
    let kickSeen = false
    try { await page.waitForFunction(() => /:kick/.test(window.__ddTest.probe().jimmy), { timeout: 3000 }); kickSeen = true } catch {}
    await held(1, 1, false)
    await held(1, 2, true) // square — the third action (slot boost)
    let punchSeen = false
    try { await page.waitForFunction(() => /:punch/.test(window.__ddTest.probe().jimmy), { timeout: 3000 }); punchSeen = true } catch {}
    r.check('#2860 A hops, B kicks, square punches — all three verbs answer the friend\'s pad through the bridge',
        jumpSeen && kickSeen && punchSeen, `jump=${jumpSeen} kick=${kickSeen} punch=${punchSeen}`)

    await held(1, 2, false)
    await page.waitForTimeout(300)
    const seatKept = await page.evaluate(() => window.__game.state())
    r.check('#2860 releasing the pad keeps the seat — drop-in is for the run, the same law as the keys',
        seatKept.jimmyHuman === 1, `jimmyHuman=${seatKept.jimmyHuman}`)

    // S4: one seat falling is NOT the end — the partner carries on. Game over
    // is both banks drained; the browser leg kills both dragons through the
    // real key path and proves the cabinet still finds its game over.
    await page.evaluate(() => window.__ddTest.setup({ killBilly: true, lives: 1, killAlly: true, allyLives: 1 }))
    await page.waitForTimeout(700)
    const dead = await page.evaluate(() => window.__ddTest.probe())
    r.check('dying is real: both banks drained ends the run', dead.screen === 'over' || dead.mode === 'gameover', `screen=${dead.screen} mode=${dead.mode}`)
    await page.waitForTimeout(1100)
    await page.keyboard.press('Space')
    await page.waitForTimeout(300)
    const backHome = await page.evaluate(() => window.__ddTest.probe())
    r.check('game over returns to attract on any key', backHome.screen === 'attract', `screen=${backHome.screen}`)

    r.check('zero page errors across the whole leg', errs.length === 0, errs.join(' | ') || 'clean')
}
await browser.close()

r.exit()
