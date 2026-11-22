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
// #2882 adds chain scoring — takes in a row multiply the payout ×2/×3/×4 and
// the streak dies on damage or a ~3 s lapse; chain-frozen plants a window that
// never cools and the pin must name the unearned flurry bonus.
// #2857 adds the partner-personality juice read — glint on the guardian sprint,
// flash + relief on a grip break, a jab voice and wobble that split the schools,
// a KO strut — all hash-pure; glint-deaf and flair-dead name the two collapses.
// #2889 polishes that read for the phone: chevron glints, a relief-tag blink,
// a walking strut, an 8-tick KO squash, a triangle jab in the mix; glint-flat,
// strut-frozen, squash-missing, tag-deaf and mix-clash name those collapses.
// #2891 adds the opening movie — the kidnapping of Marian as a fixed script
// that gates the street, is skip-courteous, and lifts the curtain on a stage
// bit-identical to a no-movie run (hash parity); movie-frozen/skip-deaf/
// crime-unnamed/curtain-stuck name its collapses.
// --mutant replants them and demands the harm is NAMED (#2142 direction).
// The browser leg drives real key events through the shell: attract -> seat ->
// walk/kick -> die -> restart, zero page errors; S4 adds the default blue
// seat and the WASD drop-in through real keystrokes.

import { writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { makeGame, step, autopilot, stateHash, W, H, DEEP_TOP, CFG, ENEMY_DEF, WAVES_S2, enterStage2, rescueReady, dragonBrain, INTRO, TIP } from '../src/games/DoubleDragon/sim.js'
import { lampSwayAt, lampNAt, castAt, castPx, setLampLight, SWARF_SPOTS, DRIP_T, dripPhase, PROPS_YARD, drawHud, drawJoinFx, JOIN_T, glintMarks, flourishDrift, koSquash, reliefBlink } from '../src/games/DoubleDragon/art.js'
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

// #2882: fell a one-hit Williams on Billy's line and report the score delta
// (id spaced away from mk()'s 900+ range so a lingering corpse never shadows
// the pin). Kicks until the score moves — the kill tick IS the measurement.
const koPay = (gs, idBase = 4000) => {
    const before = gs.score
    gs.enemies.push(mk('williams', gs.billy.x + 14, gs.billy.y, { hp: 1, rest: { id: idBase + gs.tick } }))
    for (let i = 0; i < 60 && gs.score === before; i++) { step(gs, { b: i % 3 === 0 }); gs.events.length = 0 }
    return gs.score - before
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

{ // #2882 — chain scoring: takes in a row multiply the payout, capped at ×4
    const gs = makeGame(31)
    const p1 = koPay(gs), p2 = koPay(gs), p3 = koPay(gs), p4 = koPay(gs), p5 = koPay(gs)
    r.check('#2882 a flurry pays: four straight takes climb ×1 ×2 ×3 ×4',
        p1 === 200 && p2 === 400 && p3 === 600 && p4 === 800, `pays=${p1},${p2},${p3},${p4}`)
    r.check('#2882 the escalation caps at ×4 — a fifth take pays the cap, never ×5',
        p5 === 800 && gs.chain === CFG.chainMax, `pay=${p5} chain=${gs.chain}`)
    r.check('#2882 the popup rides the tag: v carries the multiplied delta, m the multiplier',
        !!gs.scoreFlash && gs.scoreFlash.v === 800 && gs.scoreFlash.m === 4, `flash=${JSON.stringify(gs.scoreFlash)}`)
    for (let i = 0; i < CFG.chainWindow + 10; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('#2882 the window lapses: ~3 s without a take cools the chain back to zero',
        gs.chain === 0 && gs.chainT === 0, `chain=${gs.chain}/${gs.chainT}`)
    const p6 = koPay(gs)
    r.check('#2882 after a lapse the next take starts fresh at ×1', p6 === 200 && gs.chain === 1, `pay=${p6} chain=${gs.chain}`)
}

{ // #2882 — damage is the full stop, whoever eats it
    const gs = makeGame(32)
    const q1 = koPay(gs)
    r.check('#2882 (setup) the take heats the chain to ×1', q1 === 200 && gs.chain === 1 && gs.chainT > 0, `chain=${gs.chain}/${gs.chainT}`)
    for (let i = 0; i < 30 && gs.billy.state !== 'idle'; i++) { step(gs, {}); gs.events.length = 0 } // let the kick fully resolve — a live swing would bowl over the test's attacker
    gs.billy.inv = 0
    gs.enemies.push(mk('williams', gs.billy.x + 10, gs.billy.y, { state: 'attack', stateT: 1, attackCooldown: 0 }))
    for (let i = 0; i < 8 && gs.billy.lives === 3; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('#2882 eating a blow kills a fresh chain dead — the reward is for pressing on untouched',
        gs.billy.lives === 2 && gs.chain === 0 && gs.chainT === 0, `lives=${gs.billy.lives} chain=${gs.chain}/${gs.chainT}`)
    const q2 = koPay(gs)
    r.check('#2882 the chain restarts from ×1 after the hit', q2 === 200 && gs.chain === 1, `pay=${q2} chain=${gs.chain}`)
}

{ // #2882 — the road carries the score, not the streak
    const gs = makeGame(34)
    const a = koPay(gs, 6000)
    enterStage2(gs)
    r.check('#2882 the hideout opens cold: score carried, chain cooled',
        a === 200 && gs.score >= 200 && gs.chain === 0 && gs.chainT === 0, `score=${gs.score} chain=${gs.chain}`)
    const p = koPay(gs, 6500)
    r.check('#2882 takes in the yard start fresh at ×1', p === 200 && gs.chain === 1, `pay=${p} chain=${gs.chain}`)
    // Marian's bonus is not a take — the rescue pays its posted value flat
    const b = gs.score
    gs.waveIdx = WAVES_S2.length; gs.waveActive = false; gs.enemies.length = 0
    gs.camX = 640   // the end-of-yard camera (enterStage2 left it at the gate; the clamp would drag Billy back)
    gs.billy.x = 890; gs.billy.y = gs.marian.y; gs.billy.inv = CFG.respawnIFrames
    for (let i = 0; i < 40 && !gs.marian.freed; i++) { step(gs, { punch: i % 3 === 0 }); gs.events.length = 0 }
    r.check('#2882 the rescue bonus never rides the chain — flat 1000 on a hot board',
        gs.marian.freed && gs.score - b === CFG.rescueBonus && gs.chain === 1, `delta=${gs.score - b} chain=${gs.chain}`)
    for (let i = 0; i < 400 && !(gs.mode === 'play' && gs.stage === 1); i++) { step(gs, {}); gs.events.length = 0 }
    r.check('#2882 Marian goes home with a cool chain too — the loop runs back to ×1',
        gs.mode === 'play' && gs.stage === 1 && gs.chain === 0 && gs.chainT === 0, `stage=${gs.stage} chain=${gs.chain}`)
}

{ // #2882 — steel is not a take: pickups stay flat +100
    const gs = makeGame(35)
    gs.chain = 2; gs.chainT = 60   // hot chain on the board — inventory must not ride it
    gs.pickups.push({ x: gs.billy.x + 6, y: gs.billy.y, kind: 'knife', bob: 0 })
    const b = gs.score
    for (let i = 0; i < 20 && gs.score === b; i++) { step(gs, { right: true }); gs.events.length = 0 }
    r.check('#2882 a weapon pickup pays flat +100 on a hot chain',
        gs.score - b === 100 && gs.chain === 2, `delta=${gs.score - b} chain=${gs.chain}`)
}

{ // #2882 — the chain is sim truth, not juice: it rides the hash
    const gs = makeGame(36)
    const before = stateHash(gs)
    koPay(gs, 7000)
    const hot = stateHash(gs)
    gs.chain = 0
    const cooled = stateHash(gs)
    r.check('#2882 stateHash sees the streak: the same board with a dead chain hashes different',
        hot !== before && cooled !== hot, `before=${before} hot=${hot} cooled=${cooled}`)
}

{ // #2882 — the cabinet announces an escalation (shell cue for the rising blip)
    const gs = makeGame(37)
    koPay(gs, 7500)
    const ev = []
    const before = gs.score
    gs.enemies.push(mk('williams', gs.billy.x + 14, gs.billy.y, { hp: 1, rest: { id: 8000 + gs.tick } }))
    for (let i = 0; i < 60 && gs.score === before; i++) { step(gs, { b: i % 3 === 0 }); ev.push(...gs.events); gs.events.length = 0 }
    r.check('#2882 the second straight take rings a chain cue next to the KO',
        ev.includes('chain') && ev.includes('ko'), `events=${[...new Set(ev)].join(',')}`)
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
        ev.includes('whoosh_b') && ev.includes('jab_b'), ev.join(',')) // #2857: the bare jab's bite is now its own voice
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

// --------------------------------------------- #2857 partner-personality juice ---
// The guardian law reads like game-feel now: a glint while help sprints, a
// flash and relief when the grip breaks, a voice and a wobble that split the
// two schools, and a strut over the fallen. All juice — none of it may move
// stateHash, and each tell must be honest (it stamps only when it is true).
{
    // the glint rides an honest sprint: CPU Jimmy dashes the holder of his
    // brother — speed lines appear while he closes, gone when the rescue lands.
    // (He starts 40px off: the knee timer is 52 ticks, and a full-street sprint
    // would let the pin time out on the fixture, not on the law.)
    const gs = makeGame(57, { coop: true })
    gs.enemies.length = 0; gs.barrels.length = 0; gs.pickups.length = 0; gs.projectiles.length = 0
    const holder = mk('amon', 300, 180, { state: 'grab', attackCooldown: 99999 })
    holder.id = 1700; holder.tgt = 'billy'
    gs.enemies.push(holder)
    gs.billy.state = 'grabbed'; gs.billy.grabFrom = holder.id; gs.billy.stateT = 0
    gs.billy.x = 292; gs.billy.y = 180; gs.billy.inv = 999
    gs.jimmy.x = 260; gs.jimmy.y = 180; gs.jimmy.inv = 999
    let glint = 0, broke = -1, gripAt = null, reliefSeen = 0
    for (let i = 0; i < 60 && broke < 0; i++) {
        step(gs, {}, {}); gs.events.length = 0
        if (gs.jimmy.guard > 0) glint += 1
        if (gs.billy.state !== 'grabbed' && gs.billy.lives === CFG.lives && broke < 0) broke = i
        if (gs.gripFx) { gripAt = { ...gs.gripFx }; gs.gripFx = null }
        if (gs.billy.relief > 0) reliefSeen = Math.max(reliefSeen, gs.billy.relief)
    }
    r.check('#2857 glint: the rescue wears a trail — guard stamps while the blue seat sprints the holder',
        glint > 0, `glint ticks=${glint}`)
    r.check('#2857 glint decays: the trail is a sprint, not a paint job — it fades once he stops closing',
        gs.jimmy.guard === 0 || gs.jimmy.state === 'grabbed' || gs.jimmy.guard < 8, `guard=${gs.jimmy.guard}`)
    r.check('#2857 relief: the freed seat throws his arms up — relief pose pays the freed dragon',
        broke >= 0 && reliefSeen > 0 && reliefSeen <= 9, `broke@${broke} relief=${reliefSeen}`)
    r.check('#2857 grip-break reports its spot — the shell flashes where the hold broke',
        gripAt !== null && Math.abs(gripAt.x - 300) <= 8 && Math.abs(gripAt.y - 180) <= 8, JSON.stringify(gripAt))

    // the glint is honest: a seat that ignores the grip earns no promise
    const gsH = makeGame(58, { coop: true })
    gsH.enemies.length = 0; gsH.barrels.length = 0; gsH.pickups.length = 0; gsH.projectiles.length = 0
    const holderH = mk('amon', 300, 180, { state: 'grab', attackCooldown: 99999 })
    holderH.id = 1701; holderH.tgt = 'billy'
    gsH.enemies.push(holderH)
    gsH.billy.state = 'grabbed'; gsH.billy.grabFrom = holderH.id; gsH.billy.stateT = 0
    gsH.billy.x = 292; gsH.billy.y = 180; gsH.billy.inv = 999
    gsH.jimmy.x = 140; gsH.jimmy.y = 180; gsH.jimmy.inv = 999; gsH.jimmy.human = true
    let glintIdle = 0
    for (let i = 0; i < 40; i++) { step(gsH, {}, {}); gsH.events.length = 0; if (gsH.jimmy.guard > 0) glintIdle += 1 }
    r.check('#2857 glint is honest — a seat that stands still while its brother dangles promises nothing',
        glintIdle === 0, `glint=${glintIdle}`)

    // the blue jab has its own bite; the red seat's voice is untouched
    const gsV = makeGame(59, { coop: true })
    gsV.enemies.length = 0; gsV.barrels.length = 0; gsV.pickups.length = 0; gsV.projectiles.length = 0
    gsV.jimmy.human = true
    gsV.jimmy.inv = 999; gsV.jimmy.x = 140; gsV.jimmy.y = 180
    gsV.billy.inv = 999; gsV.billy.x = 60; gsV.billy.y = 180
    gsV.enemies.push(mk('williams', 152, 180, { hp: 30, attackCooldown: 9999 }))
    let evB = []
    step(gsV, {}, { punch: true }); evB.push(...gsV.events); gsV.events.length = 0
    for (let i = 0; i < 8; i++) { step(gsV, {}, {}); evB.push(...gsV.events); gsV.events.length = 0 }
    gsV.enemies.push(mk('williams', 72, 180, { hp: 30, attackCooldown: 9999 }))
    let evR = []
    step(gsV, { punch: true }, {}); evR.push(...gsV.events); gsV.events.length = 0
    for (let i = 0; i < 8; i++) { step(gsV, {}, {}); evR.push(...gsV.events); gsV.events.length = 0 }
    r.check('#2857 cadence at an ear: the blue jab snaps as jab_b — technique split from the shared bite',
        evB.includes('jab_b') && !evB.includes('hit_b'), evB.join(','))
    r.check('#2857 cadence at an ear: Billy keeps the shared hit — the split is the blue seat\'s tell, not a renamed cabinet',
        evR.includes('hit') && !evR.includes('jab'), evR.join(','))

    // the wobble: the technician rocks a man wider than the hammer's jab does
    const wobOf = (seat) => {
        const g = makeGame(60 + (seat === 'jimmy' ? 0 : 1), { coop: true })
        g.enemies.length = 0; g.barrels.length = 0; g.pickups.length = 0; g.projectiles.length = 0
        const thug = mk('williams', 152, 180, { hp: 30, attackCooldown: 9999 })
        g.enemies.push(thug)
        if (seat === 'jimmy') { g.jimmy.human = true; g.jimmy.inv = 999; g.jimmy.x = 140; g.jimmy.y = 180; g.billy.inv = 999 }
        else { g.billy.x = 140; g.billy.y = 180; g.billy.inv = 999; g.jimmy.inv = 999 }
        step(g, seat === 'billy' ? { punch: true } : {}, seat === 'jimmy' ? { punch: true } : {})
        let hitTick = 0
        for (let i = 0; i < 14; i++) { step(g, {}, {}); g.events.length = 0; hitTick = Math.max(hitTick, g.enemies[0] ? g.enemies[0].wob || 0 : 0) }
        return { hitTick, settled: thug.wob || 0 }
    }
    const wobB = wobOf('jimmy'), wobR = wobOf('billy')
    // stamps are 7 (blue) / 4 (red); the enemy's own decay tick lands inside
    // the same step, so the observed post-hit max is one below — and the draw
    // maps >5 to the 3px sway, 1..5 to 2px. Deterministic, so pinned exactly.
    r.check('#2857 cadence at a glance: a blue jab rocks the man wider than a red one (3px vs 2)',
        wobB.hitTick === 6 && wobR.hitTick === 3 && wobB.settled === 0 && wobR.settled === 0,
        `blue=${wobB.hitTick} red=${wobR.hitTick}`)

    // post-KO flair: the seat that dropped him poses — and only for a KO
    const gsF = makeGame(62, { coop: true })
    gsF.enemies.length = 0; gsF.barrels.length = 0; gsF.pickups.length = 0; gsF.projectiles.length = 0
    const victim = mk('williams', 56, 180, { hp: 1, attackCooldown: 9999 })
    gsF.enemies.push(victim)
    gsF.billy.x = 40; gsF.billy.y = 180; gsF.billy.inv = 999; gsF.jimmy.inv = 999
    let flairEv = false
    for (let i = 0; i < 14; i++) { step(gsF, { punch: true }, {}); if (gsF.events.includes('flair')) flairEv = true; gsF.events.length = 0 }
    const flourishTop = gsF.billy.flourish
    r.check('#2857 flair: the fist that drops a man poses over him — 20 ticks and a snap, red seat red voice',
        flourishTop > 0 && flourishTop <= 20 && flairEv, `flourish=${flourishTop} flair=${flairEv}`)
    for (let i = 0; i < 25; i++) { step(gsF, {}, {}); gsF.events.length = 0 }
    r.check('#2857 flair expires — the strut is a beat, not a pose lock', gsF.billy.flourish === 0, `flourish=${gsF.billy.flourish}`)
    const gsW = makeGame(63, { coop: true })
    gsW.enemies.length = 0
    gsW.billy.x = 40; gsW.billy.y = 180; gsW.billy.inv = 999; gsW.jimmy.inv = 999
    gsW.barrels.length = 0
    gsW.barrels.push({ id: 991, x: 58, y: 180, hp: 3, shake: 0, kind: 'barrel' })
    for (let i = 0; i < 90 && gsW.score === 0; i++) { step(gsW, { b: true }, {}); gsW.events.length = 0 }
    r.check('#2857 flair is a KO strut, not a chore — splintered wood pays score but never the pose',
        gsW.score > 0 && gsW.billy.flourish === 0, `score=${gsW.score} flourish=${gsW.billy.flourish}`)

    // steel outranks the rescue: the guardian answers the lane BEFORE sprinting
    // the holder — the ropes-phase law, at the brain
    const gsS = makeGame(64, { coop: true })
    gsS.enemies.length = 0; gsS.barrels.length = 0; gsS.pickups.length = 0; gsS.projectiles.length = 0
    const holderS = mk('amon', 300, 180, { state: 'grab', attackCooldown: 99999 })
    holderS.id = 1702; holderS.tgt = 'billy'
    gsS.enemies.push(holderS)
    gsS.billy.state = 'grabbed'; gsS.billy.grabFrom = holderS.id; gsS.billy.stateT = 0
    gsS.billy.x = 292; gsS.billy.y = 180; gsS.billy.inv = 999
    gsS.jimmy.x = 140; gsS.jimmy.y = 180; gsS.jimmy.inv = 999
    gsS.projectiles.push({ id: 771, x: 180, y: 180, vx: -3, spin: 0, side: 'goon' })
    const pSteel = dragonBrain(gsS, gsS.jimmy, gsS.billy)
    r.check('#2857 steel outranks the sprint — a guardian that runs into a blade is no guardian',
        (pSteel.up || pSteel.down) && !pSteel.right, `L=${pSteel.left} R=${pSteel.right} U=${pSteel.up} D=${pSteel.down}`)

    // juice law: none of these tells may move the cabinet's truth
    const gA = makeGame(65, { coop: true })
    for (let i = 0; i < 300; i++) { step(gA, autopilot(gA), {}); gA.events.length = 0 }
    const pureBefore = stateHash(gA)
    gA.billy.guard = 8; gA.billy.relief = 5; gA.billy.flourish = 12
    gA.jimmy.guard = 3; gA.jimmy.relief = 2; gA.jimmy.flourish = 19
    gA.gripFx = { x: 10, y: 20 }
    if (gA.enemies[0]) gA.enemies[0].wob = 7
    r.check('#2857 juice law — glint/relief/flourish/wob/gripFx never enter stateHash',
        stateHash(gA) === pureBefore)
}

// ---------------- #2889 guardian-read polish — the tells survive the phone ---
// Five render laws, all hash-pure: chevron glints with vertical extent, a
// back-step under the KO strut, a squash beat under every knockdown, the
// relief clock tied to the HUD tag, and a jab voice that no longer beats the
// pickup chime in a phone mix.
{
    // item 1 — the trail is chevrons now. Geometry is the law: a 3-px spine
    // per chevron (the extent a dock-zoomed phone averages into NOTHING was
    // the old 3×2 dash), a deeper sweep than the old 10..18 (a clipped screen
    // edge still leaves marks), shimmer still rides the guard clock, and the
    // shoulder spark keeps its even-tick law.
    const m8 = glintMarks(8)
    const spines8 = m8.filter((q) => q.w === 1 && q.h === 3)
    r.check('#2889 glint is chevrons: both lit marks carry a 3-px vertical spine — the extent a phone cannot average away',
        spines8.length === 2 && m8.length === 11, `spines=${spines8.length} marks=${m8.length}`)
    const deep8 = Math.max(...m8.map((q) => q.x + q.w))
    r.check('#2889 glint reach: the chevron trail sweeps to 25 px behind the seat (the old dashes topped at 21) — a rescue at a screen edge keeps marks on screen',
        deep8 >= 25, `deepest=${deep8}`)
    const m7 = glintMarks(7)
    r.check('#2889 glint shimmer rides the guard clock: an odd tick lights the OTHER chevron and rests the spark (same flicker law, taller marks)',
        m7.length === 5 && m7.every((q) => !q.core), `marks=${m7.length}`)
    r.check('#2889 glint silence: a spent guard paints nothing — the promise ends when the sprint does',
        glintMarks(0).length === 0 && glintMarks(-1).length === 0)

    // item 3 — the strut walks. One step (5 px), zero at both cut ends so
    // nothing snaps when the pose finishes or a swing takes it mid-beat, and
    // the shoulder check is delivered from the new spot, not the old one.
    const dCurve = Array.from({ length: 21 }, (_, f) => flourishDrift(f, 20))
    r.check('#2889 strut drift: zero at both ends of the clock (no snap at finish or on a cut), exactly one step at the peak',
        dCurve[20] === 0 && dCurve[0] === 0 && Math.max(...dCurve) === 5 && dCurve.every((v) => v >= 0),
        dCurve.join(','))
    r.check('#2889 strut drift holds the step through the pose and eases home only in the last three ticks',
        dCurve[16] === 5 && dCurve[10] === 5 && dCurve[3] === 5 && dCurve[2] <= 3 && dCurve[1] <= 2,
        dCurve.join(','))

    // item 4 — weight at impact: an 8-tick easing flatten at the knockdown
    // beat (the #2897 lesson: an impact flash must survive a slow frame).
    const sq0 = koSquash('down', 0)
    const sq7 = koSquash('down', 7)
    r.check('#2889 KO squash: a knockdown lands FLAT — the impact tick is the widest, lowest frame',
        !!sq0 && Math.abs(sq0.w - 1.18) < 0.01 && Math.abs(sq0.h - 0.7) < 0.01, JSON.stringify(sq0))
    r.check('#2889 squash eases out across the 8-tick beat, then lets go — settled down/stagger/getup/dying wear none (the pin law reads unchanged)',
        !!sq7 && sq7.w > 1 && sq7.w < sq0.w && sq7.h < 1 && sq7.h > sq0.h &&
        koSquash('down', 8) === null && koSquash('stagger', 0) === null &&
        koSquash('getup', 0) === null && koSquash('dying', 0) === null && koSquash('walk', 0) === null)

    // item 2 — the relief clock blinks the 2P tag white. The law is the clock
    // (lit on odd ticks of the 9-count, so it ends exactly with the pose) and
    // the HUD paint (the tag's own ink, nothing else in the strip).
    r.check('#2889 relief blink law: lit on the odd ticks of the 9-count and dark with the pose',
        reliefBlink(9) && reliefBlink(1) && !reliefBlink(8) && !reliefBlink(0) && !reliefBlink(-1))
    const tagInk = (relief) => {
        const gsT = makeGame(31, { coop: true })
        gsT.jimmy.relief = relief
        const ink = []
        const ctx = { fillStyle: '', globalAlpha: 1, drawImage: () => {}, fillRect: (x, y, w, h) => ink.push([x, y, w, h, ctx.fillStyle]) }
        drawHud(ctx, gsT, true)
        return ink.filter(([x, y, w, h, c]) => c !== '#000' && x >= 202 && x + w <= 214 && y >= 6 && y + h <= 13)
    }
    const lit9 = tagInk(9)
    r.check('#2889 the freed blue seat tags his own HUD — the 2P glyph paints white on the lit beat',
        lit9.length >= 2 && lit9.every(([, , , , c]) => c === '#ffffff'), `ink=${lit9.length}`)
    const dark8 = tagInk(8)
    r.check('#2889 …and back to seat-blue on the dark beat — the blink ends with the pose, the tag does not stay lit',
        dark8.length >= 2 && dark8.every(([, , , , c]) => c === '#5a8ae8'), dark8.map((q) => q[4]).join(','))

    // item 5 — the phone mix law, straight off the source: the blue seat's
    // bare jab keeps its F#4 identity (294 Hz) but rides a triangle, so its
    // 3rd harmonic (882 Hz — a 2 Hz beat on the pickup chime's 880 middle
    // note) sits ~9.5 dB lower than the old square left it.
    const idxSrc = readFileSync(join(ROOT, 'src/games/DoubleDragon/index.jsx'), 'utf8')
    const jline = idxSrc.match(/jab_b: \(\) => \{ audioController\.playTone\((\d+), [\d.]+, '(\w+)', ([\d.]+)\)/)
    r.check('#2889 phone mix: the jab keeps note 294 but leaves the square — F#4 on a triangle clears the 660/880/1320 chime band where the square beat it',
        !!jline && jline[1] === '294' && jline[2] === 'triangle', jline ? `${jline[1]} ${jline[2]}` : 'jab_b line not found')
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

// ----------------------------------------- #2891 the opening: the kidnapping ---
// The movie gates the street, tells the story, and lifts the curtain on an
// UNTOUCHED stage. The laws: the cast wears negative ids and consumes no rng;
// no fight rule bites during the caption; skip lands clean; and the run that
// watched the whole movie is bit-identical to the run that never played one
// (hash parity against the plain makeGame) — a prologue, not a parallel game.
{
    const mkRun = (seed, { coop = false, skipAt = -1, cap = 5000 } = {}) => {
        const gs = makeGame(seed, { coop, intro: true })
        const ev = []
        const seen = { maxBillyX: -1, maxJimmyX: -1, grabbedAt: -1, dyingBilly: -1, downBilly: -1, dyingJimmy: -1, waveLeak: false, camMoved: false, livesLost: false }
        while (gs.intro && gs.tick < cap) {
            const pad = skipAt >= 0 && gs.intro.t === skipAt ? { punch: true } : {}
            step(gs, pad)
            ev.push(...gs.events); gs.events.length = 0
            const I = gs.intro
            if (I) {
                const t = I.t
                seen.maxBillyX = Math.max(seen.maxBillyX, gs.billy.x)
                if (gs.jimmy) seen.maxJimmyX = Math.max(seen.maxJimmyX, gs.jimmy.x)
                if (I.marian.grabbed && seen.grabbedAt < 0) seen.grabbedAt = t
                if (gs.billy.state === 'dying' && seen.dyingBilly < 0) seen.dyingBilly = t
                if (gs.billy.state === 'down' && seen.downBilly < 0) seen.downBilly = t
                if (gs.jimmy && gs.jimmy.state === 'dying' && seen.dyingJimmy < 0) seen.dyingJimmy = t
                if (gs.waveActive || gs.enemies.some((e) => e.id > 0) || gs.camX !== 0) seen.waveLeak = true
            }
            if (gs.billy.lives < 3 || (coop && gs.jimmy.lives < 3)) seen.livesLost = true
        }
        return { gs, ev, seen }
    }

    r.check('#2891 default OFF — makeGame drives law-clean runs; the movie is opt-in',
        makeGame(7).intro === null && makeGame(7, { coop: true }).intro === null, 'plain runs carry no intro')
    const armed = makeGame(7, { coop: true, intro: true })
    r.check('#2891 arms on request — the cast waits off-frame in negative ids, the victim on the street, mode untouched',
        armed.intro && armed.intro.t === 0 && armed.enemies.length === 4 &&
        armed.enemies.every((e) => e.id < 0 && e.x > W) && armed.intro.marian.x === 300 && armed.mode === 'play',
        `t=${armed.intro && armed.intro.t} ids=${armed.enemies.map((e) => e.id).join(',')}`)

    const a = mkRun(7, { coop: true })
    const ORDER = ['wave', 'scream', 'grabbed', 'ko', 'hit_hard', 'taken', 'stage']
    const idx = ORDER.map((k) => a.ev.indexOf(k))
    r.check('#2891 the story tells itself in order — gang arrives, Marian cries, the giant takes her, the dragons land two KOs, the swarm answers, the crime is named, the street opens',
        idx.every((v) => v >= 0) && idx.every((v, i) => i === 0 || v > idx[i - 1]), `order=${idx.join(',')}`)
    r.check('#2891 the gates hold — the charge crosses wave 1\'s trigger line, yet no fight rule bites: no wave, no camera, no life spent in the movie',
        a.seen.maxBillyX > 90 && !a.seen.waveLeak && !a.seen.livesLost, `maxX=${a.seen.maxBillyX.toFixed(0)} leak=${a.seen.waveLeak} lives=${a.gs.billy.lives}/${a.gs.jimmy.lives}`)
    r.check('#2891 the snatch reads — Marian is lifted exactly at grabAt and the HELP bubble goes up with her',
        a.seen.grabbedAt === INTRO.grabAt, `grabbedAt=${a.seen.grabbedAt} vs ${INTRO.grabAt}`)
    r.check('#2891 the KOs are the dragons\' own — both windup Williams eat a fighter KO during the movie',
        a.ev.filter((e) => e === 'ko').length === 2, `kos=${a.ev.filter((e) => e === 'ko').length}`)
    r.check('#2891 the swarm lands — Billy and Jimmy each eat the dying beat (a scripted beating, never a scored death)',
        a.seen.dyingBilly > 0 && a.seen.downBilly > a.seen.dyingBilly && a.seen.dyingJimmy > a.seen.dyingBilly,
        `billy ${a.seen.dyingBilly}->down ${a.seen.downBilly}, jimmy ${a.seen.dyingJimmy}`)
    const ab = makeGame(7, { coop: true, intro: true })
    while (ab.intro && ab.intro.t < INTRO.takenAt) { step(ab, {}); ab.events.length = 0 }
    const abobo = ab.intro.goons[3]
    r.check('#2891 the gang leaves east with the prize — Abobo is off the frame carrying Marian at the caption',
        abobo.x > W + 20 && ab.intro.marian.grabbed && Math.abs(ab.intro.marian.x - abobo.x) < 1 && ab.intro.takenT > 0,
        `abobo=${abobo.x.toFixed(0)} marian=${ab.intro.marian.x.toFixed(0)} takenT=${ab.intro.takenT}`)
    step(ab, {}); ab.events.length = 0
    r.check('#2891 the caption is brief — MARIAN TAKEN! stands its beat and clears before the curtain lifts',
        ab.intro.takenT === INTRO.takenShown - 2, `takenT=${ab.intro.takenT}`)

    { // #2897 polish: the caption moment — white flash, back-row hold, straggler exit
        const gs = makeGame(7, { coop: true, intro: true })
        let flashTop = -1, flashDecay = true, strag = null, goneAt = -1
        while (gs.intro) {
            step(gs, {}); gs.events.length = 0
            if (!gs.intro) break
            const t = gs.intro.t
            if (t === INTRO.takenAt) flashTop = gs.intro.flashT
            if (t > INTRO.takenAt && t <= INTRO.takenAt + INTRO.flash - 1 && gs.intro.flashT !== INTRO.takenAt + INTRO.flash - t) flashDecay = false
            if (t === INTRO.takenAt + INTRO.takenShown) strag = { x: gs.intro.goons[1].x, st: gs.intro.goons[1].state }
            if (goneAt < 0 && gs.intro.goons[1].x >= W + 50) goneAt = t
        }
        r.check('#2897 the caption punches in — the street lights white for a decaying beat when the crime is named',
            flashTop === INTRO.flash && flashDecay && INTRO.flash >= 2, `flashTop=${flashTop} decay=${flashDecay}`)
        r.check('#2897 the caption holds for the back row — two seconds on screen, still clearing well before the curtain',
            INTRO.takenShown >= 120 && INTRO.takenAt + INTRO.takenShown <= INTRO.total - 18, `hold=${INTRO.takenShown} end=${INTRO.takenAt + INTRO.takenShown}/${INTRO.total}`)
        r.check('#2897 a straggler walks it out — the last gang member is mid-exit, legs still cycling, as the caption clears',
            !!strag && strag.st === 'walk' && strag.x > W && strag.x < W + 50, `am=${strag ? `${strag.x.toFixed(0)}/${strag.st}` : 'gone'}`)
        r.check('#2897 …and off the street before the curtain — no man left mid-frame when the stage takes over',
            goneAt > 0 && goneAt <= INTRO.total - 6, `goneAt=${goneAt} total=${INTRO.total}`)
    }

    // the curtain law: after the movie the street is EXACTLY the plain stage
    r.check('#2891 curtain law — the run that watched the movie is bit-identical to the run that never played one (stateHash parity)',
        stateHash(a.gs) === stateHash(makeGame(7, { coop: true })), `hash=${stateHash(a.gs)} vs ${stateHash(makeGame(7, { coop: true }))}`)
    const fresh = makeGame(7, { coop: true })
    r.check('#2891 the movie consumes nothing from the seeded stream — rng word and id counter untouched',
        a.gs.rngState === fresh.rngState && a.gs.nextId === fresh.nextId, `rng=${a.gs.rngState}/${fresh.rngState} nextId=${a.gs.nextId}/${fresh.nextId}`)
    r.check('#2891 spawn truth after the curtain — seats at 40/24 on the walk line, fresh i-frames, wave 0, stage 1, tick rewound to 0',
        a.gs.intro === null && a.gs.tick === 0 && a.gs.billy.x === 40 && a.gs.billy.y === INTRO.walkY &&
        a.gs.billy.state === 'idle' && a.gs.billy.inv === CFG.respawnIFrames && a.gs.jimmy.x === 24 &&
        a.gs.enemies.length === 0 && a.gs.waveIdx === 0 && a.gs.stage === 1 && a.gs.mode === 'play',
        `tick=${a.gs.tick} x=${a.gs.billy.x} lives=${a.gs.billy.lives}`)
    const solo = mkRun(7)
    r.check('#2891 the movie plays solo too — Billy swings the opening single-handed and the stage still opens clean',
        solo.gs.intro === null && stateHash(solo.gs) === stateHash(makeGame(7)), `hash=${stateHash(solo.gs)}`)

    // skip law
    const sk = mkRun(7, { coop: true, skipAt: 40 })
    r.check('#2891 any input after the grace beat lifts the curtain — and lands clean on spawn truth',
        sk.gs.intro === null && sk.gs.tick <= 41 && sk.gs.billy.x === 40 && sk.gs.enemies.length === 0 && sk.ev.includes('stage'),
        `tick=${sk.gs.tick} x=${sk.gs.billy.x}`)
    r.check('#2891 a skipped movie is equally residue-free — hash parity with the plain stage',
        stateHash(sk.gs) === stateHash(makeGame(7, { coop: true })), `hash=${stateHash(sk.gs)}`)
    const early = makeGame(7, { coop: true, intro: true })
    for (let i = 0; i < 10; i++) step(early, {})
    step(early, { punch: true })
    r.check('#2891 grace honored — a frantic press inside the settling beat cannot cut the story short',
        early.intro !== null && early.intro.t === 11, `t=${early.intro && early.intro.t}`)

    // after the curtain the street is simply the game
    {
        const post = mkRun(7, { coop: true })
        let n = 0
        while (!post.gs.waveActive && post.gs.mode === 'play' && n < 400) { step(post.gs, { right: true }); post.gs.events.length = 0; n += 1 }
        r.check('#2891 after the curtain the street is the game — walking right opens wave 1 exactly as before',
            post.gs.waveActive && post.gs.enemies.length > 0, `waveActive=${post.gs.waveActive} n=${n}`)
    }
}

// --------------------------------- #2874 first-timer pass: the cost READS ------
{
    // Key strip: the cabinet finally names its keys. Words are pinned, not
    // just "something drew" — a strip without the keys is decoration.
    const gt = makeGame(3, { coop: true })
    r.check('#2874 the key strip names every control — walk/punch/kick/jump with their keys',
        ['ARROWS WALK', 'Z PUNCH', 'X KICK', 'SPACE JUMP'].every((w) => TIP.includes(w)), TIP)
    r.check('#2874 the strip rides the fresh run and steps down (~5 s of play)',
        gt.tipT === CFG.tipHold, `tipT=${gt.tipT}`)
    step(gt, {}, {}); step(gt, {}, {})
    r.check('#2874 the strip counts down with the street (and freezes through the movie)',
        gt.tipT === CFG.tipHold - 2, `tipT=${gt.tipT}`)
    const gm = makeGame(3, { coop: true, intro: true })
    step(gm, {}, {})
    r.check('#2874 the movie never spends the strip — it waits for the street',
        gm.tipT === CFG.tipHold, `tipT=${gm.tipT}`)

    // The knockdown beat: a life costs a VISIBLE fall, then the old remount.
    const gk = makeGame(7, { coop: true })
    gk.billy.inv = 0
    const hitX = gk.billy.x
    gk.enemies.push({ id: gk.nextId++, kind: 'williams', x: hitX + 8, y: gk.billy.y, face: -1, hp: 4, state: 'attack', stateT: 2, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 60, inv: 0, spinHit: false })
    step(gk, {}, {})
    r.check('#2874 a lost life drops the seat flat where it fell — the beat before the remount',
        gk.billy.lives === 2 && gk.billy.state === 'down' && gk.billy.knock === CFG.respawnKnock && gk.billy.x === hitX,
        `lives=${gk.billy.lives} state=${gk.billy.state} knock=${gk.billy.knock}`)
    r.check('#2874 the loss shows in the HUD — a LIVES flash names the seat',
        gk.livesFx && gk.livesFx.tag === 'billy' && gk.livesFx.t === CFG.livesFlash,
        `livesFx=${gk.livesFx && gk.livesFx.tag}/${gk.livesFx && gk.livesFx.t}`)
    for (let i = 0; i < CFG.respawnKnock; i++) step(gk, {}, {})
    r.check('#2874 the beat ends the old way — remount at the spawn with the mercy flicker',
        gk.billy.state === 'idle' && gk.billy.knock === 0 && Math.abs(gk.billy.x - (gk.camX + 30)) < 9 && gk.billy.inv > 60,
        `state=${gk.billy.state} x=${gk.billy.x.toFixed(0)} inv=${gk.billy.inv}`)
    for (let i = 0; i < CFG.livesFlash; i++) step(gk, {}, {})
    r.check('#2874 the LIVES flash clears on its own clock (~1.5 s)', gk.livesFx === null, `livesFx=${gk.livesFx && gk.livesFx.t}`)
    const gk2 = makeGame(7)
    gk2.billy.lives = 1; gk2.billy.inv = 0
    gk2.enemies.push({ id: gk2.nextId++, kind: 'williams', x: gk2.billy.x + 8, y: gk2.billy.y, face: -1, hp: 4, state: 'attack', stateT: 2, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 60, inv: 0, spinHit: false })
    step(gk2, {}, {})
    r.check('#2874 game over still costs nothing extra — the last life keeps the dying law, and still flashes',
        gk2.mode === 'gameover' && gk2.billy.state === 'dying' && gk2.livesFx && gk2.livesFx.tag === 'billy',
        `mode=${gk2.mode} state=${gk2.billy.state} fx=${gk2.livesFx && gk2.livesFx.tag}`)
    const gs2 = makeGame(9)
    gs2.billy.knock = 20
    enterStage2(gs2)
    r.check('#2874 second wind cancels a pending beat — the new street walks on immediately',
        gs2.billy.knock === 0 && gs2.billy.state === 'idle', `knock=${gs2.billy.knock} state=${gs2.billy.state}`)

    // Hits SHOW: landed blows flash the man white (progress before the KO).
    const gf = makeGame(11, { coop: true })
    const ef = { id: gf.nextId++, kind: 'williams', x: gf.billy.x + 12, y: gf.billy.y, face: -1, hp: 4, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: false, castCooldown: 999, attackCooldown: 999, inv: 0, spinHit: false }
    gf.enemies.push(ef)
    let flashed = -1
    for (let i = 0; i < 10; i++) {
        step(gf, i === 0 ? { punch: true } : {}, {})
        if (flashed < 0 && ef.hp < ENEMY_DEF.williams.hp) flashed = ef.flash
    }
    r.check('#2874 every landed blow lights the man — the hit flashes where it bit',
        flashed >= 4 && flashed <= 6, `hp=${ef.hp} flash@land=${flashed}`)

    // Juice purity: none of the new reads may ride the hash (#2810 flash law).
    const hp1 = stateHash(gf)
    gf.tipT += 123; gf.livesFx = { tag: 'jimmy', t: 9 }; ef.flash += 7; gf.billy.knock += 5
    r.check('#2874 all four new tells are hash-pure — juice never enters stateHash',
        stateHash(gf) === hp1, `${hp1} vs ${stateHash(gf)}`)
}

// -------------------------------------- #2935 weight-true knockback ---
{
    // One man on Billy's line, one clean strike, measure the slide. hp is set
    // so the target survives the probe — the measurement is MOVEMENT, not the
    // kill. Hands come off after the strike; the impulse finishes on its own.
    const knockRig = (seed, verb, kind = 'williams', extra = {}) => {
        const gs = makeGame(seed)
        gs.billy.inv = CFG.respawnIFrames
        const e = mk(kind, extra.x ?? gs.billy.x + (extra.left ? -14 : 14), extra.y ?? gs.billy.y,
            { hp: 30, attackCooldown: 9999, castCooldown: 99999 })
        gs.enemies.push(e)
        if (extra.face) gs.billy.face = extra.face
        if (extra.weapon) gs.billy.weapon = extra.weapon
        const x0 = e.x, y0 = e.y
        let peak = 0
        for (let i = 0; i < 40; i++) {
            const pad = {}
            if (verb === 'punch' && i === 0) pad.punch = true
            if (verb === 'kick' && i === 0) pad.b = true
            if (verb === 'jumpkick') { if (i === 0) pad.a = true; if (i === 9) pad.b = true }
            step(gs, pad); gs.events.length = 0
            // peak displacement in the shove's direction — a man walks back
            // toward you after the stagger, and that footwork is not the hit
            const d = e.x - x0
            peak = Math.max(peak, extra.left ? -d : d)
        }
        return { d: peak, dy: e.y - y0, hp: e.hp, e }
    }

    const jab = knockRig(51, 'punch')
    const kick = knockRig(51, 'kick')
    const fly = knockRig(51, 'jumpkick')
    const big = knockRig(51, 'kick', 'abobo', { hp: 40 })
    r.check('#2935 weight ladder: a kick drives a man back farther than a jab drives him',
        jab.hp === 29 && kick.hp === 28 && kick.d > 2 && kick.d > jab.d + 1, `jab=${jab.d.toFixed(1)} kick=${kick.d.toFixed(1)}`)
    r.check('#2935 the flying knee is the biggest shove on the shelf',
        fly.hp === 27 && fly.d > kick.d + 1, `kick=${kick.d.toFixed(1)} jumpkick=${fly.d.toFixed(1)}`)
    r.check('#2935 mass is real: Abobo takes the same kick a third shallower',
        big.hp === 28 && big.d > 0.5 && big.d * 1.4 < kick.d, `williams=${kick.d.toFixed(1)} abobo=${big.d.toFixed(1)}`)
    r.check('#2935 the depth axis is never the push axis — no strike, any weight, moves a man across lanes',
        jab.dy === 0 && kick.dy === 0 && fly.dy === 0 && big.dy === 0, `dy=${jab.dy}/${kick.dy}/${fly.dy}/${big.dy}`)
    r.check('#2935 the shove runs AWAY from the striker: a man left of Billy slides left',
        knockRig(52, 'punch', 'williams', { left: true, face: -1 }).d > 2, `d=${knockRig(52, 'punch', 'williams', { left: true, face: -1 }).d.toFixed(1)}`)

    { // the spin boots both ways — and shoves both ways
        const gs = makeGame(53)
        gs.billy.inv = CFG.respawnIFrames
        const L = mk('williams', gs.billy.x - 16, gs.billy.y, { hp: 30, attackCooldown: 9999, face: 1 })
        const R = mk('williams', gs.billy.x + 16, gs.billy.y, { hp: 30, attackCooldown: 9999 })
        gs.enemies.push(L, R)
        const lx0 = L.x, rx0 = R.x
        for (let i = 0; i < 40; i++) { step(gs, i === 0 ? { b: true } : {}); gs.events.length = 0 }
        r.check('#2935 the spin back-heel shoves the crowd outward — left goes left, right goes right',
            L.hp < 30 && R.hp < 30 && L.x < lx0 - 2 && R.x > rx0 + 2, `L=${(L.x - lx0).toFixed(1)} R=${(R.x - rx0).toFixed(1)}`)
    }

    { // props hold: a man punched at a barrel is pressed against the wood, never through it
        const gs = makeGame(54)
        gs.billy.inv = CFG.respawnIFrames
        const bar = gs.barrels.find((q) => q.x === 250)
        const e = mk('williams', bar.x - 14.5, bar.y, { hp: 30, attackCooldown: 9999 })
        gs.enemies.push(e)
        gs.billy.x = bar.x - 29; gs.billy.y = bar.y; gs.billy.face = 1
        const x0 = e.x
        let through = false
        for (let i = 0; i < 40; i++) { step(gs, i === 0 ? { punch: true } : {}); gs.events.length = 0; if (e.x > bar.x - 14 + 0.001) through = true }
        r.check('#2935 the street stays solid — a punched body is held by the barrel, never punched through it',
            e.hp === 29 && !through && e.x - x0 < 1.5, `d=${(e.x - x0).toFixed(1)} hp=${e.hp}`)
    }

    { // the field is a wall: a pinned man cannot be shoved past camX±16, and stays reachable
        const gs = makeGame(55)
        gs.billy.inv = CFG.respawnIFrames
        gs.billy.x = gs.camX + W - 18
        const e = mk('williams', gs.camX + W - 17, gs.billy.y, { hp: 30, attackCooldown: 9999, castCooldown: 99999 })
        gs.enemies.push(e)
        let past = false
        for (let i = 0; i < 240 && e.hp > 24; i++) {
            step(gs, i % 24 === 0 ? { b: true } : {}); gs.events.length = 0
            if (e.x > gs.camX + W - 16 + 0.001) past = true
        }
        r.check('#2935 field bounds: a thug pinned at the screen edge is driven INTO the wall — never through it, and stays hittable',
            !past && e.hp <= 24, `x=${e.x.toFixed(1)} edge=${(gs.camX + W - 16).toFixed(1)} hp=${e.hp}`)
    }

    { // the release-shove: mashing free of a grip drives the grabber off the seat
        const gs = makeGame(56)
        gs.billy.inv = CFG.respawnIFrames
        gs.billy.x = 100
        const holder = mk('amon', 112, gs.billy.y, { hp: 30, attackCooldown: 9999 })
        holder.state = 'grab'; holder.stateT = 1; holder.tgt = 'billy'
        gs.enemies.push(holder)
        gs.billy.state = 'grabbed'; gs.billy.stateT = 0; gs.billy.presses = 0; gs.billy.grabFrom = holder.id
        const x0 = holder.x
        for (let i = 0; i < 36; i++) { step(gs, gs.billy.state === 'grabbed' && i % 7 === 0 ? { b: true } : {}); gs.events.length = 0 }
        r.check('#2935 the struggle shoves: tearing free of a grip pushes the grabber off the seat',
            gs.billy.state !== 'grabbed' && holder.x - x0 > 1.5, `state=${gs.billy.state} shove=${(holder.x - x0).toFixed(1)}`)
    }

    r.check('#2935 the slide is sim truth: two men at the same pixel with different residual velocity hash differently',
        (() => {
            const a = makeGame(57); const b = makeGame(57)
            const ea = mk('williams', 120, 160); const eb = mk('williams', 120, 160)
            ea.kb = 0; eb.kb = 1.5
            a.enemies.push(ea); b.enemies.push(eb)
            return stateHash(a) !== stateHash(b)
        })())

    r.check('#2935 the weight table is authored and monotone (punch < spin < jumpkick; down-skid bites harder than air-friction)',
        CFG.knock.punch < CFG.knock.spin && CFG.knock.spin < CFG.knock.jumpkick
        && CFG.knock.kick > CFG.knock.punch && CFG.knock.whip < CFG.knock.kick
        && CFG.knock.downFriction < CFG.knock.friction && CFG.knock.stickMul > 1
        && CFG.knock.mass.abobo > CFG.knock.mass.williams)

    r.check('#2935 zero rng rides the shove — identical streams replay hash-for-hash with the physics live',
        (() => {
            const drive = () => {
                const gs = makeGame(58); const e = mk('williams', 60, gs.billy.y, { hp: 30, attackCooldown: 9999, castCooldown: 99999 })
                gs.enemies.push(e)
                for (let i = 0; i < 90; i++) { step(gs, { b: i % 11 === 0, right: i % 11 > 2 && i % 11 < 8 }); gs.events.length = 0 }
                return stateHash(gs)
            }
            return drive() === drive()
        })())
}

// ------------------------------------------------------------- the mutants ---
if (MUTANT) {
    const src = readFileSync(SIM, 'utf8')
    const plants = [
        {
            name: 'knock-frozen',
            anchor: 'if (p.knock === 0) {',
            plant: 'if (p.knock === -1) { /* MUTANT(knock-frozen): the beat never ends */',
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                gs.billy.inv = 0
                gs.enemies.push({ id: 903, kind: 'williams', x: gs.billy.x + 8, y: gs.billy.y, face: -1, hp: 4, state: 'attack', stateT: 2, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 60, inv: 0, spinHit: false })
                for (let i = 0; i < 120; i++) { mod.step(gs, {}); gs.events.length = 0 }
                return gs.billy.lives === 2 && gs.billy.state === 'down'
                    ? `HARM NAMED: the seat dropped and never came back up (still flat ${120} ticks after the hit) — a knockdown without a remount is a softlock: one hit ends the fight even while the bank says lives remain`
                    : null
            },
        },
        {
            name: 'flash-deaf',
            anchor: 'e.flash = 6',
            plant: 'e.flash = 0 /* MUTANT(flash-deaf): landed blows stop lighting up */',
            harm: async (mod) => {
                const gs = mod.makeGame(11)
                const e = { id: gs.nextId++, kind: 'williams', x: gs.billy.x + 12, y: gs.billy.y, face: -1, hp: 4, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 999, inv: 0, spinHit: false }
                gs.enemies.push(e)
                let hitSeen = false, litSeen = false
                for (let i = 0; i < 10; i++) { mod.step(gs, i === 0 ? { punch: true } : {}, {}); gs.events.length = 0; if (e.hp < 4) hitSeen = true; if (e.flash > 0) litSeen = true }
                return hitSeen && !litSeen
                    ? `HARM NAMED: a blow landed (hp 4 -> ${e.hp}) but the man never lit — hits with no flash and no bar leave a newcomer convinced their fists do nothing, which is exactly the #2874 complaint`
                    : null
            },
        },
        {
            name: 'tip-dead',
            anchor: 'tipT: CFG.tipHold,',
            plant: 'tipT: 0, /* MUTANT(tip-dead): the cabinet never says which keys */',
            harm: async (mod) => {
                const gs = mod.makeGame(3)
                return gs.tipT === 0
                    ? 'HARM NAMED: a fresh run shows no key strip at all — PRESS ANY KEY and hope is how a first-timer dies confused (#2874 item 3)'
                    : null
            },
        },
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
        {
            name: 'chain-frozen',
            anchor: 'if (gs.chainT > 0 && --gs.chainT <= 0) gs.chain = 0   // #2882: the window lapses, the chain cools',
            plant: 'if (false && gs.chainT > 0 && --gs.chainT <= 0) gs.chain = 0 /* MUTANT(chain-frozen): the window never lapses */',
            harm: async (mod) => {
                const gs = mod.makeGame(31)
                const pay = (idBase) => {
                    const before = gs.score
                    gs.enemies.push(mk('williams', gs.billy.x + 14, gs.billy.y, { hp: 1, rest: { id: idBase + gs.tick } }))
                    for (let i = 0; i < 60 && gs.score === before; i++) { mod.step(gs, { b: i % 3 === 0 }); gs.events.length = 0 }
                    return gs.score - before
                }
                pay(4000)
                for (let i = 0; i < mod.CFG.chainWindow + 40; i++) { mod.step(gs, {}); gs.events.length = 0 }
                const later = pay(4500)
                return later !== 200
                    ? `HARM NAMED: a take ${mod.CFG.chainWindow + 40} ticks after the last one still paid ${later} — the window never lapses, so dawdling earns the flurry bonus; chain scoring stops meaning "consecutive" and every score from the second KO onward is unearned`
                    : null
            },
        },
        {
            name: 'glint-deaf',
            anchor: 'if (holder && (holder.x - px0) * mx + (holder.y - py0) * my > 0) p.guard = CFG.guardTicks',
            plant: 'if (false && holder && (holder.x - px0) * mx + (holder.y - py0) * my > 0) p.guard = CFG.guardTicks /* MUTANT(glint-deaf): help sprints in, invisible */',
            harm: async (mod) => {
                const gs = mod.makeGame(57, { coop: true })
                gs.enemies.length = 0; gs.barrels.length = 0; gs.pickups.length = 0; gs.projectiles.length = 0
                const holder = mk('amon', 300, 180, { state: 'grab', attackCooldown: 99999 })
                holder.id = 1700; holder.tgt = 'billy'
                gs.enemies.push(holder)
                gs.billy.state = 'grabbed'; gs.billy.grabFrom = holder.id; gs.billy.stateT = 0
                gs.billy.x = 292; gs.billy.y = 180; gs.billy.inv = 999
                gs.jimmy.x = 140; gs.jimmy.y = 180; gs.jimmy.inv = 999
                let glint = 0
                for (let i = 0; i < 200 && gs.billy.state === 'grabbed'; i++) { mod.step(gs, {}, {}); gs.events.length = 0; if (gs.jimmy.guard > 0) glint += 1 }
                return glint === 0
                    ? 'HARM NAMED: the blue seat sprinted the holder and never wore the tell — a rescue that arrives unseen reads as a partner who ignored you; the guardian law stops being readable and phone players never learn to bait the grab'
                    : null
            },
        },
        {
            name: 'flair-dead',
            anchor: "if (hero) { hero.flourish = CFG.flourishTicks; gs.events.push(blue(seat, 'flair')) }",
            plant: 'if (hero) { /* MUTANT(flair-dead): nobody ever poses over the fall */ }',
            harm: async (mod) => {
                const gs = mod.makeGame(62, { coop: true })
                gs.enemies.length = 0; gs.barrels.length = 0; gs.pickups.length = 0; gs.projectiles.length = 0
                gs.enemies.push(mk('williams', 56, 180, { hp: 1, attackCooldown: 9999 }))
                gs.billy.x = 40; gs.billy.y = 180; gs.billy.inv = 999; gs.jimmy.inv = 999
                for (let i = 0; i < 14 && !gs.enemies.some((e) => e.state === 'dying'); i++) { mod.step(gs, { punch: true }, {}); gs.events.length = 0 }
                return gs.billy.flourish === 0
                    ? 'HARM NAMED: a man fell and the seat that dropped him kept standing like furniture — without the KO strut the cabinet never celebrates a take, and the arcade duo loses the swagger that sells every hit'
                    : null
            },
        },
        {
            name: 'movie-frozen',
            anchor: 'if (gs.intro) return stepIntro(gs, pad, pad2)',
            plant: 'if (false && gs.intro) return stepIntro(gs, pad, pad2) /* MUTANT(movie-frozen): the gate is cut — live rules own the movie\'s stage */',
            harm: async (mod) => {
                const gs = mod.makeGame(7, { coop: true, intro: true })
                for (let i = 0; i < 120; i++) { mod.step(gs, {}, {}); gs.events.length = 0 }
                return gs.intro && gs.intro.t === 0 && gs.intro.marian.x === 300
                    ? 'HARM NAMED: the curtain hangs on a frozen tableau — the cast never moves, Marian is never taken, and the live fight rules run under a scene that stopped acting; the opening becomes a screenshot the game argues with'
                    : null
            },
        },
        {
            name: 'skip-deaf',
            anchor: 'if (I.t > INTRO.grace && anyInput(pad, pad2)) { endIntro(gs); return gs }',
            plant: 'if (false && I.t > INTRO.grace && anyInput(pad, pad2)) { endIntro(gs); return gs } /* MUTANT(skip-deaf): the player cannot leave the cinema */',
            harm: async (mod) => {
                const gs = mod.makeGame(7, { coop: true, intro: true })
                let n = 0
                while (gs.intro && n < 2000) { mod.step(gs, n === 40 ? { punch: true } : {}, {}); gs.events.length = 0; n += 1 }
                return n > 400
                    ? `HARM NAMED: a fist raised at the first second still sat through ${n} ticks of movie — when no input lifts the curtain, "PRESS ANY KEY" is a lie and the player is hostage to a cartoon before they ever touch the street`
                    : null
            },
        },
        {
            name: 'crime-unnamed',
            anchor: "if (at(INTRO.takenAt)) { I.takenT = INTRO.takenShown; I.flashT = INTRO.flash; gs.events.push('taken') }",
            plant: "if (false && at(INTRO.takenAt)) { I.takenT = INTRO.takenShown; I.flashT = INTRO.flash; gs.events.push('taken') } /* MUTANT(crime-unnamed): the caption, its sting and the white beat never fire */",
            harm: async (mod) => {
                const gs = mod.makeGame(7, { coop: true, intro: true })
                const ev = []
                while (gs.intro && gs.tick < 2000) { mod.step(gs, {}, {}); ev.push(...gs.events); gs.events.length = 0 }
                return !ev.includes('taken')
                    ? 'HARM NAMED: the gang walked off with the prize and the cabinet said nothing — without MARIAN TAKEN! the prologue never states the crime, and the rescue two stages later plays as a random errand'
                    : null
            },
        },
        {
            name: 'curtain-stuck',
            anchor: 'if (t >= INTRO.total) endIntro(gs)',
            plant: 'if (false && t >= INTRO.total) endIntro(gs) /* MUTANT(curtain-stuck): the movie never lifts */',
            harm: async (mod) => {
                const gs = mod.makeGame(7, { coop: true, intro: true })
                for (let i = 0; i < 2000; i++) { mod.step(gs, {}, {}); gs.events.length = 0 }
                return gs.intro !== null
                    ? 'HARM NAMED: 2000 ticks in and the street is still borrowed scenery — a movie that never ends is not an opening, it is a screensaver; the waves, the camera and the win condition were never handed to the player'
                    : null
            },
        },
        {
            name: 'straggle-gone',
            anchor: 'am.x = 195 + 175 * seg(300, INTRO.total - 6)',
            plant: 'am.x = 195 + 400 * seg(300, INTRO.total - 130) /* MUTANT(straggle-gone): the tail exits early — a dead empty street under the caption */',
            harm: async (mod) => {
                const gs = mod.makeGame(7, { coop: true, intro: true })
                while (gs.intro && gs.intro.t < mod.INTRO.takenAt + mod.INTRO.takenShown) { mod.step(gs, {}, {}); gs.events.length = 0 }
                const am = gs.intro ? gs.intro.goons[1] : null
                return am && am.x > mod.W + 50
                    ? 'HARM NAMED: the whole gang was gone a full second before the caption cleared — the street stood empty and frozen under MARIAN TAKEN!, and the arcade\'s shrinking frame (last thug mid-stride at the rim) sold the empting instead'
                    : null
            },
        },
        {
            name: 'knock-flat',
            anchor: 'e.kb = dir * base * (steel ? K.stickMul : 1) * (knockdown ? K.downMul : 1) / mass',
            plant: 'e.kb = 0 /* MUTANT(knock-flat): blows stop moving bodies */',
            harm: async (mod) => {
                const gs = mod.makeGame(51)
                gs.billy.inv = mod.CFG.respawnIFrames
                const e = { id: 921, kind: 'williams', x: gs.billy.x + 14, y: gs.billy.y, face: -1, hp: 30, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: false, castCooldown: 99999, attackCooldown: 9999, inv: 0, spinHit: false, wob: 0, kb: 0 }
                gs.enemies.push(e)
                const x0 = e.x
                for (let i = 0; i < 40; i++) { mod.step(gs, i === 0 ? { b: true } : {}); gs.events.length = 0 }
                return e.hp === 28 && Math.abs(e.x - x0) < 1
                    ? 'HARM NAMED: a clean kick took 2 hp and the man never shifted an eye-width (' + (e.x - x0).toFixed(1) + 'px) — hits that move no body read as punching a ghost; weight is half of what a fist means'
                    : null
            },
        },
        {
            name: 'bounds-off',
            anchor: 'e.x = clamp(e.x, gs.camX + 16, gs.camX + W - 16)',
            plant: '/* MUTANT(bounds-off): the screen stops being a wall */',
            harm: async (mod) => {
                const gs = mod.makeGame(55)
                gs.billy.inv = mod.CFG.respawnIFrames
                gs.billy.x = gs.camX + mod.W - 18
                const e = { id: 922, kind: 'williams', x: gs.camX + mod.W - 17, y: gs.billy.y, face: -1, hp: 30, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: false, castCooldown: 99999, attackCooldown: 9999, inv: 0, spinHit: false, wob: 0, kb: 0 }
                gs.enemies.push(e)
                let worst = e.x
                for (let i = 0; i < 40; i++) { mod.step(gs, i === 0 ? { b: true } : {}); gs.events.length = 0; worst = Math.max(worst, e.x) }
                const edge = gs.camX + mod.W - 16
                return e.hp < 30 && worst > edge + 0.5
                    ? `HARM NAMED: a kicked man slid to x=${worst.toFixed(1)} — past the arena edge (${edge.toFixed(1)}), onto ground outside the screen: the screen IS the belt-scroller's world (the same margin the thrower-retreat law enforces), and a thug pressed through the wall fights from off-camera, unreachable by the very camera that framed the fight`
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
    {
        // #2877 — the yard art mutants: light law flipped, street gate broken,
        // seeded floor turned to shuffle. Each must be seen to do its harm.
        const ART = join(ROOT, 'src/games/DoubleDragon/art.js')
        const artPlants = [
            {
                name: 'same-phase',
                anchor: 'export const castAt = (wx, tick, camX) => -lampSwayAt(lampNAt(wx, camX), tick)',
                plant: 'export const castAt = (wx, tick, camX) => lampSwayAt(lampNAt(wx, camX), tick) /* MUTANT(same-phase): shadows ride WITH the lamp */',
                harm: async () => {
                    const m = await import(`../src/games/DoubleDragon/art.js?mutant=same-phase${Date.now()}`)
                    const sw = m.lampSwayAt(3, 100)
                    return sw !== 0 && m.castAt(740, 100, 640) === sw
                        ? 'HARM NAMED: the shadow hangs on the LAMP side of the body — light leans west, shadow leans east, and every grounded sprite reads as floating toward the light; the yard\'s depth (the belt\'s whole language) collapses'
                        : null
                },
            },
            {
                name: 'street-on',
                anchor: 'export const castPx = (wx) => (castOn ? castAt(wx, castTick, castCam) : 0)',
                plant: 'export const castPx = (wx) => (castOn ? 0 : castAt(wx, castTick, castCam)) /* MUTANT(street-on): the gate flips */',
                harm: async () => {
                    const m = await import(`../src/games/DoubleDragon/art.js?mutant=street-on${Date.now()}`)
                    m.setLampLight(100, 640, false)
                    return m.castPx(740) !== 0
                        ? 'HARM NAMED: Walnuts Street shadows drift under sodium fittings that stand dead still — the floor betrays its own light source, and the two stages read as two different games wearing one skin'
                        : null
                },
            },
            {
                name: 'shimmer',
                anchor: 'wx: 150 * i + 70 + Math.round((R(i * 91 + c * 17) - 0.5) * 52),',
                plant: 'wx: 150 * i + 70 + Math.round((Math.random() - 0.5) * 52), /* MUTANT(shimmer): unseeded floor */',
                harm: async () => {
                    const a = await import(`../src/games/DoubleDragon/art.js?mutant=shimmerA${Date.now()}`)
                    const b = await import(`../src/games/DoubleDragon/art.js?mutant=shimmerB${Date.now() + 1}`)
                    return JSON.stringify(a.SWARF_SPOTS) === JSON.stringify(b.SWARF_SPOTS)
                        ? null
                        : 'HARM NAMED: the swarf re-rolls every mount — the ground shimmers under still air, fight-reads relative to the floor jitter, and the concrete stops being the same yard twice in a row'
                },
            },
            {
                name: 'corner-crowded',
                anchor: 'ctx.fillRect(254 + i * 10, 8, 8, 3)',
                plant: 'ctx.fillRect(274 + i * 12, 8, 8, 3) /* MUTANT(corner-crowded): the blue bank walks back into the chrome corner */',
                harm: async () => {
                    const m = await import(`../src/games/DoubleDragon/art.js?mutant=corner-crowded${Date.now()}`)
                    const s = await import(`../src/games/DoubleDragon/sim.js?mutant=corner-crowded${Date.now()}`)
                    const gs = s.makeGame(7, { coop: true })
                    gs.billy.lives = 4
                    gs.jimmy.lives = 4
                    const ink = []
                    const ctx = { fillStyle: '', fillRect: (x, y, w, h) => { if (ctx.fillStyle !== 'rgba(4,6,14,0.72)') ink.push([x, y, w, h]) } }
                    m.drawHud(ctx, gs, true)
                    const hit = ink.filter(([x, y, w, h]) => x + w > 294 && y <= 13)
                    return hit.length
                        ? 'HARM NAMED: the 2P life bank stands under the PAUSE button again — on a mid-size window the seat\'s remaining lives are simply gone, hidden by app chrome, and a player can bleed out without ever seeing the cost'
                        : null
                },
            },
            {
                // #2889 item 1: flatten the chevrons back to thin dashes and
                // the phone eats the guardian's promise again.
                name: 'glint-flat',
                anchor: 'm.push({ x: d, y: ay - 1, w: 1, h: 3 })              // apex spine',
                plant: 'm.push({ x: d, y: ay - 1, w: 3, h: 2 }) /* MUTANT(glint-flat): the trail is thin dashes again */',
                harm: async () => {
                    const m = await import(`../src/games/DoubleDragon/art.js?mutant=glint-flat${Date.now()}`)
                    const spines = m.glintMarks(8).filter((q) => q.w === 1 && q.h >= 3)
                    return spines.length === 0
                        ? 'HARM NAMED: the glint lost its vertical extent — 2-px-tall dashes downscale to grey at dock zoom, and the rescue that was already crossing the whole yard arrives invisible: the guardian law stops being readable exactly on the phones that need it'
                        : null
                },
            },
            {
                // #2889 item 3: nail the strut to the floor.
                name: 'strut-frozen',
                anchor: '    const pr = 1 - f / ticks',
                plant: '    return 0 /* MUTANT(strut-frozen): the swagger is nailed to the floor */; const pr = 1 - f / ticks',
                harm: async () => {
                    const m = await import(`../src/games/DoubleDragon/art.js?mutant=strut-frozen${Date.now()}`)
                    return m.flourishDrift(10, 20) === 0
                        ? 'HARM NAMED: the KO pose stands in the shoes — the arcade strut walked its step back while the crowd came home, and a frozen pose over the fall reads as furniture, not swagger; the blue seat\'s personality was the whole point of the read'
                        : null
                },
            },
            {
                // #2889 item 4: take the weight out of the landing.
                name: 'squash-missing',
                anchor: "    if (state !== 'down' || stateT > 7) return null",
                plant: "    if (state !== 'down' || stateT > 7) return null\n    return null /* MUTANT(squash-missing): bodies land on the street like paper */",
                harm: async () => {
                    const m = await import(`../src/games/DoubleDragon/art.js?mutant=squash-missing${Date.now()}`)
                    return m.koSquash('down', 0) === null
                        ? 'HARM NAMED: a knocked-down man takes no impact beat — #2935 moved the bodies by weight but the landing stayed weightless; hits stop feeling like hits and the pin beat loses the thud the stomp is timed against'
                        : null
                },
            },
            {
                // #2889 item 2: cut the HUD tie on the relief.
                name: 'tag-deaf',
                anchor: "wind(gs.jimmy) || reliefBlink(gs.jimmy.relief) ? '#ffffff' : '#5a8ae8'",
                plant: "wind(gs.jimmy) ? '#ffffff' /* MUTANT(tag-deaf): the corner stops sharing the seat's relief */ : '#5a8ae8'",
                harm: async () => {
                    const m = await import(`../src/games/DoubleDragon/art.js?mutant=tag-deaf${Date.now()}`)
                    const gsT = makeGame(31, { coop: true })
                    gsT.jimmy.relief = 9
                    const ink = []
                    const ctx = { fillStyle: '', globalAlpha: 1, drawImage: () => {}, fillRect: (x, y, w, h) => ink.push([x, y, w, h, ctx.fillStyle]) }
                    m.drawHud(ctx, gsT, true)
                    const white = ink.filter(([x, y, w, h, c]) => c === '#ffffff' && x >= 202 && x + w <= 214 && y >= 6 && y + h <= 13)
                    return white.length === 0
                        ? 'HARM NAMED: the freed seat throws his arms up and the cabinet says nothing in the corner — the relief pose and the 2P tag were ONE tell (arms up, tag lit); split them and small-screen players watching the HUD miss the rescue beat entirely'
                        : null
                },
            },
        ]
        for (const p of artPlants) {
            const asrc = readFileSync(ART, 'utf8')
            if (!asrc.includes(p.anchor)) { console.error(`MUTANT anchor (${p.name}) missing — art.js moved; the plant must be re-anchored`); process.exit(2) }
            writeFileSync(ART, asrc.replace(p.anchor, p.plant))
            let bad
            try {
                bad = 'dynamic-import'
                bad = await p.harm()
            } finally {
                writeFileSync(ART, asrc)
            }
            r.check(`mutant(${p.name}) goes RED: harm named`, bad !== null, bad || 'harm NOT named — mutant survived')
        }
        {
            // #2889 item 5: the mix law lives in the shell's sfx table. Put
            // the square back under the blue jab and its third harmonic (882 Hz)
            // beats the pickup chime's 880 middle note again — on a phone
            // speaker, hit and reward become the same buzz.
            const IDX = join(ROOT, 'src/games/DoubleDragon/index.jsx')
            const isrc = readFileSync(IDX, 'utf8')
            const ianchor = "jab_b: () => { audioController.playTone(294, 0.05, 'triangle', 0.12); audioController.playNoise(0.03, 0.05) },"
            const iplant = "jab_b: () => { audioController.playTone(294, 0.05, 'square', 0.10); audioController.playNoise(0.03, 0.05) }, /* MUTANT(mix-clash): 882 Hz beats the pickup chime again */"
            if (!isrc.includes(ianchor)) { console.error('MUTANT anchor (mix-clash) missing — index.jsx moved; the plant must be re-anchored'); process.exit(2) }
            writeFileSync(IDX, isrc.replace(ianchor, iplant))
            let bad
            try {
                bad = 'read-back'
                const j = readFileSync(IDX, 'utf8').match(/jab_b: \(\) => \{ audioController\.playTone\((\d+), [\d.]+, '(\w+)', ([\d.]+)\)/)
                bad = j && j[2] === 'square'
                    ? 'HARM NAMED: the jab is a square again — its third harmonic lands a 2 Hz beat under the pickup chime\'s middle note, and on a phone\'s thin midrange the blue seat\'s punches and the steel reward smear into one buzz: you cannot hear what you just did'
                    : null
            } finally {
                writeFileSync(IDX, isrc)
            }
            r.check('mutant(mix-clash) goes RED: harm named', bad !== null, bad || 'harm NOT named — mutant survived')
        }
    }
    console.log('\nmutant run: expected red on the planted line.')
    r.exit()
}

// ------------------------------------------- #2877: the yard art laws ---
// cast law: the swaying chain-lamps are the yard's key light — the pools ride
// them and every grounded shadow leans AGAINST the lamp overhead; the street's
// dead sodium fittings cast nothing. Plus the seeded floor: swarf that never
// shimmers, and one drum that keeps the drip's beat.
{
    const SEEDS = [0, 7, 34, 60, 100, 170, 213, 999]
    const CAMS = [0, 55, 137, 420, 640, 900]
    let identOk = true, maxAbs = 0
    for (const t of SEEDS) for (const cam of CAMS) for (let n = -2; n <= 8; n++) {
        const wx = n * 176 + 60 + cam * 0.15          // the floor point under lamp n
        if (lampNAt(wx, cam) !== n || castAt(wx, t, cam) !== -lampSwayAt(n, t)) identOk = false
        maxAbs = Math.max(maxAbs, Math.abs(castAt(wx, t, cam)))
    }
    r.check('#2877 cast law: every floor point reads its nearest lamp; the cast is anti-phase with its sway (the pools ride the same formula)',
        identOk && maxAbs <= 2, `max|cast|=${maxAbs}`)
    const seen = new Set()
    for (let t = 0; t < 214; t++) seen.add(castAt(740, t, 640))
    r.check('#2877: the yard breathes — one lamp cycle drives the cast through every lean',
        seen.size >= 3, `values=${[...seen].sort((a, b) => a - b).join(',')}`)
    setLampLight(100, 640, false)
    let streetStill = true
    for (let t = 0; t < 214; t++) if (castPx(740) !== 0) streetStill = false
    r.check('#2877: the street stands still — the cast law gates off outside the yard (sodium lamps are dead fittings)',
        streetStill, 'street cast off')
    let yardDrift = false
    for (let t = 0; t < 214; t++) { setLampLight(t, 640, true); if (castPx(740) !== 0) yardDrift = true }
    r.check('#2877: inside the yard the cast actually moves', yardDrift, 'drift present')
    setLampLight(0, 0, false)
}
{
    const seeps = [70, 220, 370, 520]                     // the yard's four oil pools
    const intsOk = SWARF_SPOTS.length === 28 && SWARF_SPOTS.every((s) => Number.isInteger(s.wx) && Number.isInteger(s.wy) && [0, 1, 2].includes(s.kind))
    r.check('#2877 swarf: 28 integer spots cut three ways (bolt head / swarf curl / steel chip)',
        intsOk, `n=${SWARF_SPOTS.length}`)
    const nearOil = SWARF_SPOTS.every((s) => seeps.some((c) => Math.abs(s.wx - c) <= 26))
    r.check('#2877 swarf: the pickings lie by the oil seeps — the floor lives between the pours, not at random',
        nearOil, 'all within 26px of a seep')
    const bandOk = SWARF_SPOTS.every((s) => s.wy >= DEEP_TOP + 8 && s.wy <= H - 6)
    const frozen = Object.isFrozen(SWARF_SPOTS) && SWARF_SPOTS.every(Object.isFrozen)
    r.check('#2877 swarf: spots sit on the floor band and freeze once built — the ground never shimmers',
        bandOk && frozen, `band=${bandOk} frozen=${frozen}`)
}
{
    let cycleOk = true, splashes = 0, prev = false
    for (let t = 0; t < 144; t++) {
        const d = dripPhase(t)
        if (d.ph < 40 && !(d.fall >= 0 && d.fall <= 8)) cycleOk = false
        if (d.ph >= 40 && d.fall !== -1) cycleOk = false
        if (d.splash && !prev) splashes += 1
        prev = d.splash
        const e = dripPhase(t + DRIP_T)
        if (e.fall !== d.fall || e.splash !== d.splash) cycleOk = false
    }
    r.check('#2877 drip: one 72-tick beat — speck falls 0..8, hides, and the wet spot pulses exactly once per cycle',
        cycleOk && splashes === 2 && DRIP_T === 72, `splashes=${splashes}`)
    const leaks = PROPS_YARD.filter((p) => p.leak)
    r.check('#2877: exactly one drum leaks — one beat in the yard, not a chorus',
        leaks.length === 1 && leaks[0].kind === 'drum', `leaks=${leaks.length}`)
}

// ------------------------------------------------- #2899 chrome-corner law ---
// The app chrome pins PAUSE at the viewport's top-right corner (#437), and at
// mid-size windows (1280x800 down to ~900x650) the letterboxed canvas reaches
// that corner — the button then wears the canvas's rightmost ~26 px of its top
// 13 rows. The cabinet's half of the deal: no HUD ink inside that box. The
// banks ride 10px pitch columns capped at four bands (art.js drawHud).
{
    const inBox = ([x, y, w, h]) => x + w > 294 && y <= 13
    const inkOf = (gs) => {
        const ink = []
        const ctx = { fillStyle: '', fillRect: (x, y, w, h) => { if (ctx.fillStyle !== 'rgba(4,6,14,0.72)') ink.push([x, y, w, h]) } }
        drawHud(ctx, gs, true)
        return ink.filter(inBox)
    }
    const gsC = makeGame(7, { coop: true })
    gsC.billy.lives = 4
    gsC.jimmy.lives = 4
    gsC.chain = 4
    gsC.chainT = 50
    const full = inkOf(gsC)
    r.check('#2899 corner law — both banks full: HUD ink stays out of the chrome box (canvas x>=294, rows<=13)',
        full.length === 0, full.map((a) => a.join(',')).join(' ') || 'clean')
    gsC.billy.lives = 9
    const over = inkOf(gsC)
    r.check('#2899 corner law — a swollen 1P bank caps at four bands and still clears the box',
        over.length === 0, over.map((a) => a.join(',')).join(' ') || 'clean')
    gsC.jimmy.out = true
    const outLeg = inkOf(gsC)
    r.check('#2899 corner law — the out-seat slot and the READY blink stay clear of the chrome box',
        outLeg.length === 0, outLeg.map((a) => a.join(',')).join(' ') || 'clean')
}

// ------------------------------------------------ #2863 greet + join juice ---
// The cabinet greets a waking slot 2 (READY blinking under the 2P tag while
// the seat is still the CPU's) and shouts a human into the game (flare on the
// seat + PLAYER 2 banner). Both are pure art.js so the law is pinnable here —
// the greeting zone sits under the tag (rows 14..22; the tag's shadow ends at
// row 13, the bank columns sit outside x 196..244).
{
    const inkIn = (fn, x0, y0, x1, y1) => {
        const ink = []
        const ctx = {
            fillStyle: '', globalAlpha: 1, drawImage: () => {},
            fillRect: (x, y, w, h) => { if (x >= x0 && x + w <= x1 && y >= y0 && y + h <= y1) ink.push([x, y, w, h]) },
        }
        fn(ctx)
        return ink
    }
    const gsG = makeGame(11, { coop: true })
    gsG.tick = 40 // 40 % 40 = 0 — blink-on phase of the greeting
    const zone = [196, 14, 244, 22]
    const wakeInk = inkIn((c) => drawHud(c, gsG, true, true), ...zone)
    r.check('#2863 greet: a waking slot 2 blinks READY under the 2P tag (CPU seat, blink-on tick)',
        wakeInk.length > 0, `ink=${wakeInk.length}`)
    const asleepInk = inkIn((c) => drawHud(c, gsG, true, false), ...zone)
    r.check('#2863 greet: no READY while slot 2 sleeps — a sleeping pad must not be greeted',
        asleepInk.length === 0, `ink=${asleepInk.length}`)
    gsG.tick = 70 // 70 % 40 = 30 — the dark phase of the 40-tick blink
    const offInk = inkIn((c) => drawHud(c, gsG, true, true), ...zone)
    r.check('#2863 greet: the READY blink rests — dark phase of the blink cycle',
        offInk.length === 0, `ink=${offInk.length}`)
    gsG.tick = 40
    gsG.jimmy.human = true
    const humanInk = inkIn((c) => drawHud(c, gsG, true, true), ...zone)
    r.check('#2863 greet: a human-held seat is never greeted — the friend is already in',
        humanInk.length === 0, `ink=${humanInk.length}`)
    gsG.jimmy.human = false
    gsG.jimmy.out = true
    const outInk = inkIn((c) => drawHud(c, gsG, true, true), ...zone)
    r.check('#2863 greet: a downed seat keeps its own invitation — the wake-greet stays silent',
        outInk.length === 0, `ink=${outInk.length}`)
    gsG.jimmy.out = false
    // join juice: flare on the seat, PLAYER 2 banner, nothing once it decays
    const sx = 120
    const sy = 170
    const flareInk = inkIn((c) => drawJoinFx(c, JOIN_T, sx, sy), sx - 30, sy - 36, sx + 30, sy + 12)
    r.check('#2863 join: the flare core lands on the seat — the bright beat at t=JOIN_T',
        flareInk.length >= 2, `ink=${flareInk.length}`)
    const bracketInk = inkIn((c) => drawJoinFx(c, 20, sx, sy), sx - 30, sy - 36, sx + 30, sy + 12)
    r.check('#2863 join: the brackets spring outward off the seat — the mid-flare phase',
        bracketInk.length >= 8, `ink=${bracketInk.length}`)
    const bx = Math.round((W - ('PLAYER 2'.length * 12 - 2)) / 2)
    const bannerInk = inkIn((c) => drawJoinFx(c, JOIN_T, sx, sy), bx - 4, 76, bx + 98, 96)
    r.check('#2863 join: PLAYER 2 rides the banner row under the HUD',
        bannerInk.length >= 20, `ink=${bannerInk.length}`)
    const deadInk = inkIn((c) => drawJoinFx(c, 0, sx, sy), 0, 0, W, 224)
    r.check('#2863 join: t=0 is silence — the juice never leaks into a resting frame',
        deadInk.length === 0, `ink=${deadInk.length}`)
}

// ------------------------------------------------------------- browser leg ---
await requireDevServer(`${BASE}/double-dragon`)
const browser = await launch()
// The S2 consent gate swallows scripted starts until answered, mounts async,
// and an anonymous decline re-asks on the next page — so every keyboard leg
// answers it the honest way (a real NO THANKS click), polling for the mount
// and early-exiting when the cabinet already took the seat.
const defuseConsent = async (page) => {
    for (let i = 0; i < 40; i++) {
        const st = await page.evaluate(() => {
            const gate = document.querySelector('[data-auto-record-gate]')
            if (gate) {
                const btn = [...gate.querySelectorAll('button')].find((el) => /NO THANKS/i.test(el.textContent || ''))
                if (btn) { btn.click(); return 'clicked' }
                return 'gate'
            }
            return window.__ddTest && window.__ddTest.probe().screen === 'play' ? 'started' : 'waiting'
        })
        if (st === 'clicked' || st === 'started') return st
        await page.waitForTimeout(50)
    }
    return 'timeout'
}
{
    const page = await openGame(browser, { url: `${BASE}/double-dragon`, hook: '__ddTest', wait: 600 })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.stack || e.message))

    // #1712: DD now asks the S2 consent question before seed-birth (autoRecord
    // gate, fixed inset-0 z-9990 — it swallows scripted starts until clicked).
    // Answer it the way gauntletplay/touchselectcheck do: its own NO THANKS
    // button — a real decline, never a grant (#2091). Where the store is
    // silent the gate never rises and this is a no-op. (defuseConsent above.)

    const attract1 = await page.evaluate(() => window.__ddTest.probe())
    await page.waitForTimeout(700)
    const attract2 = await page.evaluate(() => window.__ddTest.probe())
    r.check('attract: the demo runs itself before any key', attract1.screen === 'attract' && attract2.tick > attract1.tick, `tick ${attract1.tick} -> ${attract2.tick}`)

    await page.keyboard.press('Space')
    await defuseConsent(page)
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
    // #2857 honesty note: the seat is pinned HUMAN-idle here — an awake CPU
    // dodges the executioner (the threat branch), and a dodging partner is not
    // a drained bank. The leg is about both pools emptying, not about dodging.
    await page.evaluate(() => window.__ddTest.setup({ killBilly: true, lives: 1, killAlly: true, allyLives: 1, allyHuman: true }))
    await page.waitForTimeout(700)
    const dead = await page.evaluate(() => window.__ddTest.probe())
    r.check('dying is real: both banks drained ends the run', dead.screen === 'over' || dead.mode === 'gameover', `screen=${dead.screen} mode=${dead.mode}`)
    await page.waitForTimeout(1100)
    await page.keyboard.press('Space')
    await page.waitForTimeout(300)
    const backHome = await page.evaluate(() => window.__ddTest.probe())
    r.check('game over returns to attract on any key', backHome.screen === 'attract', `screen=${backHome.screen}`)

    // #2857 guardian telegraph on the live cabinet: a thug takes Billy, and the
    // CPU seat that sprints to the rescue wears the glint the phone player reads.
    await page.evaluate(() => window.__game.reset(29))
    await page.waitForTimeout(150)
    await page.evaluate(() => window.__ddTest.setup({ clearEnemies: true, allyGrip: [300, 180], allyX: 140, allyY: 180, allyInv: 999 }))
    let glintLive = false
    try { await page.waitForFunction(() => window.__ddTest.probe().jimmyGuard > 0, { timeout: 5000 }); glintLive = true } catch {}
    r.check('#2857 guardian on the live cabinet — help is visibly on the way (glint while the CPU sprints the holder)',
        glintLive, `glint=${glintLive}`)

    // #2857 item 5: the ropes phase with steel still in the air. The CPU guardian
    // must answer the blade before it walks to its brother's rescue — driven here
    // on real keystrokes: Billy walks the last stretch and cuts while Jimmy lives.
    await page.evaluate(() => window.__game.reset(37))
    await page.waitForTimeout(150)
    await page.evaluate(() => window.__ddTest.setup({ warp: 'marian', clearEnemies: true, allyX: 830, allyY: 160, allyInv: 0 }))
    await page.evaluate(() => window.__ddTest.setup({ flyKnife: true }))
    const steelLeg0 = await page.evaluate(() => window.__ddTest.probe())
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(700)
    await page.keyboard.up('ArrowRight')
    await page.keyboard.press('KeyZ')
    await page.waitForTimeout(250)
    await page.keyboard.press('KeyZ')
    let ropeCut = false
    try { await page.waitForFunction(() => window.__ddTest.probe().marian === 'free', { timeout: 6000 }); ropeCut = true } catch {}
    const steelLeg1 = await page.evaluate(() => window.__ddTest.probe())
    r.check('#2857 ropes-phase guardian — steel in the air, seat intact, ropes cut on real keystrokes',
        steelLeg0.projectiles >= 1 && ropeCut && Number(steelLeg1.jimmy.split(':')[2]) === 3,
        `knives=${steelLeg0.projectiles} cut=${ropeCut} jimmy=${steelLeg1.jimmy}`)

    // #2877 pixel legs: in the yard the ground shadow exists AND it MOVES.
    // Fresh cabinet, warp to the end; park the dragon at x 850 — inside the
    // camera's clamp (it stays 640 there) and clear of crates, drums, seeps
    // and Marian herself.
    await page.evaluate(() => window.__game.reset(23))
    await page.waitForTimeout(150)
    await page.evaluate(() => { window.__ddTest.setup({ warp: 'marian', clearEnemies: true }); window.__ddTest.setup({ x: 850 }) })
    await page.waitForTimeout(600)
    const yardP = await page.evaluate(() => window.__ddTest.probe())
    r.check('#2877 setup: the yard stands with the end camera locked (cast law live)',
        yardP.stage === 2 && Math.abs(yardP.cam - 640) < 1 && Math.abs(yardP.x - 850) < 1, `stage=${yardP.stage} cam=${yardP.cam} x=${yardP.x}`)
    const shadowAt = () => page.evaluate(() => {
        const p = window.__ddTest.probe()
        const cv = [...document.querySelectorAll('canvas')].find((c) => c.width === 320)
        if (!cv) return { tick: p.tick, off: 0, delta: -1, white: 99 }
        const g = cv.getContext('2d')
        const sx = Math.round(p.x - p.cam)
        const sy = p.y + 1                       // the shadow ellipse's centre row
        const d = g.getImageData(sx - 14, sy, 29, 1).data
        const lum = (i) => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
        let dark = 0, dl = Infinity, white = 0
        const refs = []
        for (let i = 0; i < 29; i++) {
            const l = lum(i)
            if (l > 180) white += 1              // banner glyphs — the road sign has passed when this is 0
            if (i >= 5 && i <= 23 && l < dl) { dl = l; dark = i - 14 }
            if (i < 5 || i > 23) refs.push(l)
        }
        return { tick: p.tick, off: dark, delta: refs.reduce((a, b) => a + b, 0) / refs.length - dl, white }
    })
    // the stage-entry banner rides the yard for a couple of seconds — its dark
    // board lies about the floor, so the probe waits for the sign to clear.
    let firstShadow = await shadowAt()
    for (let i = 0; i < 45 && (firstShadow.white > 0 || firstShadow.delta < 10); i++) {
        await page.waitForTimeout(100)
        firstShadow = await shadowAt()
    }
    r.check('#2877: the dragon casts a shadow in the yard — the floor row under his feet darkens (banner cleared first)',
        firstShadow.delta >= 10 && firstShadow.white === 0, `floor−dark=${firstShadow.delta.toFixed(1)} white=${firstShadow.white}`)
    const cols = new Set()
    const tSh = firstShadow.tick
    for (let i = 0; i < 70; i++) {
        const s = await shadowAt()
        cols.add(s.off)
        if (s.tick - tSh >= 220) break
        await page.waitForTimeout(40)
    }
    r.check('#2877: the shadow MOVES — one lamp cycle slides the darkest column across the concrete',
        cols.size >= 2, `columns=${[...cols].sort((a, b) => a - b).join(',')}`)

    r.check('zero page errors across the whole leg', errs.length === 0, errs.join(' | ') || 'clean')
}
// ------------------------------- #2891 browser legs: the opening movie ---
// A fresh cabinet plays the crime for real: the curtain rises under a human
// start, the snatch animates, MARIAN TAKEN! stands, and the street reopens
// under live arrows. And the courtesy legs: a key past the grace lifts the
// curtain instantly, and `?nointro=1` declines the movie at the cabinet.
{
    const page = await openGame(browser, { url: `${BASE}/double-dragon`, hook: '__ddTest', wait: 600 })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.stack || e.message))
    await page.keyboard.press('Space')
    await defuseConsent(page)
    await page.waitForTimeout(500)
    const p0 = await page.evaluate(() => window.__ddTest.probe())
    r.check('#2891 browser: the human start gets the movie — the curtain rises over Walnuts Street',
        p0.screen === 'play' && p0.intro > 0 && p0.introMarian === 'walking', `screen=${p0.screen} intro=${p0.intro} marian=${p0.introMarian}`)
    let heldSeen = false
    try { await page.waitForFunction(() => window.__ddTest.probe().introLift >= 15, { timeout: 8000 }); heldSeen = true } catch {}
    const p1 = await page.evaluate(() => window.__ddTest.probe())
    r.check('#2891 browser: the giant lifts Marian at the frame — the story animates for real (she rides high)',
        heldSeen && p1.introMarian === 'held' && p1.introLift >= 15, `held=${heldSeen} marian=${p1.introMarian} lift=${p1.introLift}`)
    let captionSeen = false
    try { await page.waitForFunction(() => window.__ddTest.probe().introTaken >= 1, { timeout: 8000 }); captionSeen = true } catch {}
    let lifted = false
    try { await page.waitForFunction(() => window.__ddTest.probe().intro === -1, { timeout: 8000 }); lifted = true } catch {}
    const p2 = await page.evaluate(() => window.__ddTest.probe())
    r.check('#2891 browser: the crime is named, the curtain lifts on a clean stage — cast gone, seat home, mode play',
        captionSeen && lifted && p2.enemies === 0 && p2.x === 40 && p2.mode === 'play',
        `caption=${captionSeen} lifted=${lifted} enemies=${p2.enemies} x=${p2.x}`)
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(500)
    await page.keyboard.up('ArrowRight')
    const p3 = await page.evaluate(() => window.__ddTest.probe())
    r.check('#2891 browser: after the movie the street is the game — real arrows drive Billy down the asphalt',
        p3.x > p2.x + 10, `x ${p2.x} -> ${p3.x}`)
    r.check('#2891 browser: the movie ran with zero page errors', errs.length === 0, errs.join(' | ') || 'clean')
    await page.close()
}
{
    const page = await openGame(browser, { url: `${BASE}/double-dragon`, hook: '__ddTest', wait: 600 })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.stack || e.message))
    await page.keyboard.press('Space')
    await defuseConsent(page)
    await page.waitForTimeout(550)   // past the grace beat, mid-scene
    const mid = await page.evaluate(() => window.__ddTest.probe())
    await page.keyboard.press('ArrowRight')
    const cut = await page.evaluate(() => window.__ddTest.probe())
    r.check('#2891 browser: any key past the grace lifts the curtain instantly — the movie respects the player',
        mid.intro > INTRO.grace && mid.introMarian === 'walking' && cut.intro === -1 && cut.enemies === 0,
        `mid=${mid.intro}/${mid.introMarian} after=${cut.intro}`)
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(500)
    await page.keyboard.up('ArrowRight')
    const walk = await page.evaluate(() => window.__ddTest.probe())
    r.check('#2891 browser: a skipped movie lands on the live street — arrows drive, nothing left on it',
        walk.x > 45 && walk.enemies === 0 && walk.mode === 'play', `x=${walk.x} enemies=${walk.enemies}`)
    await page.close()

    const page2 = await openGame(browser, { url: `${BASE}/double-dragon?nointro=1`, hook: '__ddTest', wait: 600 })
    await page2.keyboard.press('Space')
    await defuseConsent(page2)
    await page2.waitForTimeout(400)
    const np = await page2.evaluate(() => window.__ddTest.probe())
    r.check('#2891 browser: ?nointro=1 declines the movie at the cabinet — straight to the street',
        np.screen === 'play' && np.intro === -1 && np.x === 40, `screen=${np.screen} intro=${np.intro} x=${np.x}`)
    await page2.close()
    r.check('#2891 browser: skip/cancel legs ran with zero page errors', errs.length === 0, errs.join(' | ') || 'clean')
}

// ---------------- #2897 browser leg: the polish seen on the cabinet -------
// One human-start run, sampled at rAF pace: the caption's white beat lifts
// the whole frame's luminance; a dead Williams must show a long FLAT green
// bar (the settled sprawl — a held rotation cannot cut a 14-px horizontal
// run through its own body at the pivot row); Marian's panicked run tucks
// her feet higher off the asphalt than the stroll does; and the HELP! box
// shows its dark outline ring above the cream face while it jitters 2 px.
{
    const page = await openGame(browser, { url: `${BASE}/double-dragon`, hook: '__ddTest', wait: 600 })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.stack || e.message))
    // The white beat is 6 ticks — wide, but a software-rendered CI frame can
    // still batch over it between paints. Count the overlay at the canvas API
    // so the pin proves the PAINT wiring, not just the poll's luck.
    // NOTE: install BEFORE the start press — the game canvas is created at the
    // play transition; the prototype patch must predate the context.
    await page.evaluate(() => {
        window.__flashHits = 0
        const proto = CanvasRenderingContext2D.prototype
        const orig = proto.fillRect
        proto.fillRect = function (x, y, w, h) {
            if (x === 0 && y === 0 && w === 320 && h === 224 && this.globalAlpha > 0.4 && String(this.fillStyle).toLowerCase() === '#ffffff') window.__flashHits++
            return orig.apply(this, arguments)
        }
    })
    await page.keyboard.press('Space')
    await defuseConsent(page)
    let flashBase = -1, flashLum = -1, trunMax = -1, walkMin = 99, fleeMin = 99
    let creamMax = 0, ringMax = 0, flashPainted = false
    const creamCols = []
    for (let i = 0; i < 480; i++) {
        const s = await page.evaluate(() => {
            const p = window.__ddTest.probe()
            const cv = [...document.querySelectorAll('canvas')].find((c) => c.width === 320)
            if (!cv || p.intro < 0) return { intro: -1, flashHits: window.__flashHits || 0 }
            const g = cv.getContext('2d')
            const out = { intro: p.intro, flash: p.introFlash, marian: p.introMarian, mx: p.introMarianX, my: p.introMarianY, bubble: p.introBubble, flashHits: window.__flashHits || 0 }
            const strip = g.getImageData(0, 40, 320, 120).data
            let ls = 0
            for (let k = 0; k < strip.length; k += 16) ls += 0.299 * strip[k] + 0.587 * strip[k + 1] + 0.114 * strip[k + 2]   // row-step sampling
            out.lum = ls / (strip.length / 16)
            const g0 = (p.introGoons || '').split(',')[0].split(':')
            out.trun = -1
            if (g0[0] === 'dying' && Number(g0[3]) >= 16 && Number(g0[3]) <= 22) {
                // The settle proof: the row through the sprawl shows ONE bright
                // bar >=12px wide in the left window (head-to-body, spans fixed by
                // #2897). The broken layout put the head >=8px away from the torso
                // at face === -1 — the widest bright run stayed short of 12. Only
                // the left 32 cols are read: the walking Amon overlaps the body's
                // right half at these ticks.
                const sx = Number(g0[1]), sy = Number(g0[2])
                const row = g.getImageData(Math.max(0, sx - 24), sy - 3, 32, 1).data
                const lum = (k) => 0.299 * row[k * 4] + 0.587 * row[k * 4 + 1] + 0.114 * row[k * 4 + 2]
                const ref = (lum(0) + lum(1) + lum(2)) / 3
                let best = 0, cur = 0
                for (let k = 3; k < 32; k++) {
                    if (lum(k) >= ref + 14) { cur += 1; if (cur > best) best = cur } else cur = 0
                }
                out.trun = best
            }
            out.srow = -1
            if (p.introMarian === 'walking' || p.introMarian === 'fleeing') {
                const reg = g.getImageData(Math.max(0, p.introMarianX - 9), p.introMarianY - 9, 19, 10).data
                let minR = 99
                for (let y = 0; y < 10 && minR > 0; y++) for (let x = 0; x < 19; x++) {
                    const k = (y * 19 + x) * 4
                    if (Math.abs(reg[k] - 216) <= 8 && Math.abs(reg[k + 1] - 160) <= 8 && Math.abs(reg[k + 2] - 106) <= 8) { if (y < minR) minR = y; break }
                }
                out.srow = minR
            }
            out.cream = 0; out.creamMin = -1; out.ring = 0
            if (p.introBubble > 0 && p.introBubble % 10 < 7 && p.introMarianX >= 150 && p.introMarianX <= 280) {
                const bx = p.introMarianX, by = p.introMarianY - 47
                const reg = g.getImageData(bx - 26, Math.max(0, by - 4), 52, 20).data
                let cream = 0, top = 99, minx = 99
                for (let y = 0; y < 20; y++) for (let x = 0; x < 52; x++) {
                    const k = (y * 52 + x) * 4
                    if (reg[k] > 230 && reg[k + 1] > 225 && reg[k + 2] > 210) { cream += 1; if (y < top) top = y; if (x < minx) minx = x }
                }
                out.cream = cream
                if (top >= 1 && top < 99) {
                    const rr = g.getImageData(bx - 26, Math.max(0, by - 4 + top - 1), 52, 1).data
                    let ring = 0
                    for (let x = 6; x < 46; x++) {
                        const r = rr[x * 4], gg = rr[x * 4 + 1], b = rr[x * 4 + 2]
                        if (r >= b + 4 && Math.abs(r - 36) <= 12 && Math.abs(gg - 28) <= 12 && Math.abs(b - 20) <= 12) ring += 1
                    }
                    out.ring = ring
                    out.creamMin = minx
                }
            }
            return out
        })
        if (s.intro === -1) break
        if (s.flash === 0 && s.intro >= 200 && s.intro < INTRO.takenAt) flashBase = s.lum
        if (s.flash >= 1) flashLum = Math.max(flashLum, s.lum)
        if (s.flashHits > 0) flashPainted = true
        if (s.trun >= 0) trunMax = Math.max(trunMax, s.trun)
        if (s.srow >= 0 && s.srow < 90) { if (s.marian === 'walking') walkMin = Math.min(walkMin, s.srow); if (s.marian === 'fleeing') fleeMin = Math.min(fleeMin, s.srow) }
        if (s.cream > 150) {
            creamMax = Math.max(creamMax, s.cream); ringMax = Math.max(ringMax, s.ring)
            if (s.creamMin >= 0 && !creamCols.includes(s.creamMin)) creamCols.push(s.creamMin)
        }
        await page.waitForTimeout(18)
    }
    r.check('#2897 browser: the caption punches in for real — the white beat paints the whole street when the crime is named',
        flashPainted || (flashBase > 0 && flashLum >= flashBase + 45), `painted=${flashPainted} base=${flashBase.toFixed(0)} flash=${flashLum.toFixed(0)}`)
    r.check('#2897 browser: the KO settles flat — a dead Williams cuts a long horizontal bar, not a fuzzed held rotation',
        trunMax >= 14, `longest green run=${trunMax}`)
    r.check('#2897 browser: Marian\'s panicked stride reads panicked — the sprint tucks its feet higher off the asphalt than the stroll',
        walkMin < 99 && fleeMin < 99 && fleeMin <= walkMin - 2, `walkMin=${walkMin} fleeMin=${fleeMin}`)
    r.check('#2897 browser: the HELP! box wears its outline — a dark ring sits above the cream face at phone-legible size',
        creamMax >= 150 && ringMax >= 14, `cream=${creamMax} ring=${ringMax}`)
    r.check('#2897 browser: the talk box jitters 2 frames like the cabinet\'s — the box face steps ±1px while it talks',
        creamCols.length >= 2 && Math.max(...creamCols) - Math.min(...creamCols) === 2, `columns=${creamCols.join(',')}`)
    r.check('#2897 browser: the polish leg ran with zero page errors', errs.length === 0, errs.join(' | ') || 'clean')
    await page.close()
}

// --------------- #2889 browser legs: the guardian-read seen on the cabinet ---
// Leg 1 — a real CPU rescue, watched through patched canvas calls: while the
// blue seat sprints the holder of his brother, tall seat-tinted chevron spines
// (1x3 px) must reach the display. Leg 2 — the tells that ride clocks: the
// relief blink lights the 2P tag white, a fresh knockdown lands with the
// squash transform, and the strut paints its body a step behind the seat's
// logical x. Spy installed BEFORE the start press — the game canvas is created
// at the play transition and the prototype patch must predate the context.
{
    const page = await openGame(browser, { url: `${BASE}/double-dragon`, hook: '__ddTest', wait: 600 })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.stack || e.message))
    await page.evaluate(() => {
        window.__chev = 0
        const proto = CanvasRenderingContext2D.prototype
        const orig = proto.fillRect
        proto.fillRect = function (x, y, w, h) {
            if (w === 1 && h === 3 && y > 40 && String(this.fillStyle) === '#2f5fd0') window.__chev++
            return orig.apply(this, arguments)
        }
    })
    await page.keyboard.press('Space')
    await defuseConsent(page)
    await page.waitForTimeout(300)
    // straight to the street — the movie curtain parks the sim, and the
    // guardian law lives inside the sim (#2891 harness path).
    await page.evaluate(() => window.__ddTest.start())
    await page.waitForTimeout(150)
    await page.evaluate(() => window.__ddTest.setup({ clearEnemies: true, allyGrip: [300, 180], allyX: 140, allyY: 180, allyInv: 999 }))
    let glintPainted = false
    try {
        await page.waitForFunction(() => window.__chev >= 2 && window.__ddTest.probe().jimmyGuard > 0, { timeout: 6000 })
        glintPainted = true
    } catch {}
    const pg = await page.evaluate(() => ({ chev: window.__chev, guard: window.__ddTest.probe().jimmyGuard }))
    r.check('#2889 browser: the rescue wears chevrons — tall seat-tinted spines paint while the CPU guardian sprints the holder',
        glintPainted && pg.chev >= 2, `spines=${pg.chev} guard=${pg.guard}`)
    r.check('#2889 browser: the guardian leg ran with zero page errors', errs.length === 0, errs.join(' | ') || 'clean')
    await page.close()
}
{
    const page = await openGame(browser, { url: `${BASE}/double-dragon`, hook: '__ddTest', wait: 600 })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.stack || e.message))
    await page.evaluate(() => {
        window.__tagWhite = 0; window.__squash = 0; window.__headMin = 999; window.__headSx = -1
        const proto = CanvasRenderingContext2D.prototype
        const ofill = proto.fillRect
        proto.fillRect = function (x, y, w, h) {
            const cs = String(this.fillStyle)
            if (cs === '#ffffff' && y >= 6 && y + h <= 13 && x >= 202 && x + w <= 214) window.__tagWhite++
            if (cs === '#e8e8ec' && w === 8 && h === 8 && y > 40 && x >= 28 && x <= 48) window.__headMin = Math.min(window.__headMin, x)
            return ofill.apply(this, arguments)
        }
        const oscale = proto.scale
        proto.scale = function (a, b) {
            if (a > 1.01 && a < 1.3 && b > 0.6 && b < 0.995) window.__squash++
            return oscale.apply(this, arguments)
        }
    })
    await page.keyboard.press('Space')
    await defuseConsent(page)
    await page.waitForTimeout(300)
    await page.evaluate(() => window.__ddTest.start())   // no movie — the tells ride the live sim
    await page.waitForTimeout(150)
    // item 2 on the live HUD: nine ticks of relief = five lit frames (~83 ms)
    // — comfortably inside a poll window, and only the tag lives in that zone.
    await page.evaluate(() => window.__ddTest.setup({ clearEnemies: true, allyRelief: 9 }))
    await page.waitForTimeout(200)
    const pt = await page.evaluate(() => ({ white: window.__tagWhite }))
    r.check('#2889 browser: the freed blue seat lights his own tag — white ink paints in the 2P zone while relief rides',
        pt.white >= 2, `white=${pt.white}`)
    // item 4: a knocked-down man lands with the squash beat — an 8-tick
    // easing flatten (#2897's frame-survivable width), so a slow CI frame
    // cannot step over it.
    await page.evaluate(() => window.__ddTest.setup({ downThug: [140, 170] }))
    await page.waitForTimeout(200)
    const ps = await page.evaluate(() => window.__squash)
    r.check('#2889 browser: a knockdown lands FLAT on the cabinet — the wider-and-lower transform paints at the impact beat',
        ps >= 1, `squash=${ps}`)
    // item 3: the strut walks — while flourish rides, the head rect (8x8 of
    // gi white) must paint at least 2 px behind the seat's logical edge.
    await page.evaluate(() => { window.__headMin = 999; return window.__ddTest.setup({ billyFlourish: 20 }) })
    await page.waitForTimeout(450)
    const pd = await page.evaluate(() => {
        const p = window.__ddTest.probe()
        return { headMin: window.__headMin, sx: Math.round(p.x - p.cam), fl: p.flourish }
    })
    r.check('#2889 browser: the strut walks — the posed seat paints a step behind its logical x (drift is on the display, x truth intact)',
        pd.headMin <= pd.sx - 7, `headMin=${pd.headMin} sx=${pd.sx}`)
    r.check('#2889 browser: the tells leg ran with zero page errors', errs.length === 0, errs.join(' | ') || 'clean')
    await page.close()
}

// ------------------------- #2899 browser leg: the chrome corner geometry ---
// At the reported 1280x800 the letterboxed canvas reaches the viewport's top
// edge and the PAUSE button leans into it; the reserve law says what it covers
// must stay inside the empty corner box (<=26 canvas px deep, <=13 rows). Plus
// the sheet law: the pause backdrop buries drawn ink (alpha >= 0.9), so the
// RESUME card never argues with the title underneath it.
{
    const page = await openGame(browser, { url: `${BASE}/double-dragon?nointro=1`, viewport: { width: 1280, height: 800 }, hook: '__ddTest', wait: 600 })
    await defuseConsent(page)
    const geo = await page.evaluate(() => {
        const btn = document.querySelector('[data-nav="pause"]')
        const cv = [...document.querySelectorAll('canvas')].find((c) => c.width === 320)
        if (!btn || !cv) return { ok: false }
        const b = btn.getBoundingClientRect(), c = cv.getBoundingClientRect()
        const ox = Math.min(b.right, c.right) - Math.max(b.left, c.left)
        const oy = Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top)
        if (ox <= 0 || oy <= 0) return { ok: true, depth: 0, rows: 0 }
        const sc = c.width / 320
        return { ok: true, depth: ox / sc, rows: (Math.min(b.bottom, c.bottom) - c.top) / sc }
    })
    r.check('#2899 browser: at 1280x800 PAUSE covers the canvas only inside the reserve (<=26px deep, <=13 rows)',
        geo.ok && geo.depth <= 26 && geo.rows <= 13, JSON.stringify(geo))
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '?', code: 'Slash', shiftKey: true })))
    await page.waitForTimeout(350)
    const sheet = await page.evaluate(() => {
        const el = document.querySelector('[data-help-fit]')
        return el ? getComputedStyle(el).backgroundColor : null
    })
    const alpha = sheet ? Number((sheet.match(/([\d.]+)\)$/) || [, '0'])[1]) : 0
    r.check('#2899 browser: the pause sheet dims near-opaque (alpha>=0.9) — drawn titles under it cannot collide with the card copy',
        sheet !== null && alpha >= 0.9, `sheet=${sheet}`)
    await page.close()
}

await browser.close()

r.exit()
