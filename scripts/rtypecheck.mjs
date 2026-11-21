// rtypecheck.mjs — R-TYPE S1+S2 (#2808): boots, the pod-shooter laws hold
// (S1 camera/arm/hunter/Phase-1 + S2 the FORCE: capture, plug, ram, deploy,
// park, recall, grind, death-drop; laser charge-and-release), it can be won,
// and the check can be seen to fail.
//
//   node scripts/rtypecheck.mjs              # sim core + browser leg
//   node scripts/rtypecheck.mjs --mutant   # plant the armour-blind / pod-blind regressions
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
import { STAGE_END, STAGE_END2, CORE_Y, W, POD, WAVES2, makeGame, step, autopilot, stateHash, enableCoop } from '../src/games/RType/sim.js'
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

{ // capsule cycle VULCAN -> LASER -> WAVE -> VULCAN (laser joins the arm rack in S2)
    const gs = makeGame(5)
    gs.caps.push({ id: 1, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'weapon' })
    step(gs, {}); gs.events.length = 0
    r.check('capsule 1: the arm becomes the LASER', gs.ship.weapon === 'laser', `weapon=${gs.ship.weapon}`)
    gs.caps.push({ id: 2, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'weapon' })
    step(gs, {}); gs.events.length = 0
    r.check('capsule 2: the cycle steps to the wave cannon', gs.ship.weapon === 'wave', `weapon=${gs.ship.weapon}`)
    gs.caps.push({ id: 3, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'weapon' })
    step(gs, {}); gs.events.length = 0
    r.check('capsule 3: the cycle wraps back to Vulcan', gs.ship.weapon === 'vulcan', `weapon=${gs.ship.weapon}`)
}

{ // THE FORCE — capture: the blue capsule seeds the S.E.E.D. pod
    const gs = makeGame(11)
    r.check('no pod at the start of the stage', gs.pod === null)
    gs.caps.push({ id: 1, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'force' })
    step(gs, {}); gs.events.length = 0
    r.check('the blue capsule snaps the pod to the nose', !!gs.pod && gs.pod.state === 'attached', `pod=${gs.pod ? gs.pod.state : 'none'}`)
    const s0 = gs.score
    gs.caps.push({ id: 2, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'force' })
    step(gs, {}); gs.events.length = 0
    r.check('a spare S.E.E.D. chains a BIT — never a second shell', !!gs.pod && gs.bits.length === 1 && gs.score === s0 + 500, `pod=${gs.pod ? gs.pod.state : 'gone'} bits=${gs.bits.length} score +${gs.score - s0}`)
}

{ // THE FORCE — the ram plugs fire: shells eat bullets and hunters alike
    const gs = makeGame(12)
    gs.caps.push({ id: 1, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'force' })
    step(gs, {}); gs.events.length = 0 // attach
    gs.ship.inv = 0
    gs.bullets.push({ id: 1, x: gs.pod.x - 2, y: gs.pod.y, vx: -1.3, vy: 0 })
    step(gs, {}); gs.events.length = 0
    r.check('the shell plugs a round aimed at the pilot', gs.lives === 3 && gs.bullets.length === 0 && !gs.ship.dead, `lives=${gs.lives} why=${gs.lastDeath || 'alive'}`)
    gs.missiles.push({ id: 2, x: gs.pod.x, y: gs.pod.y, a: Math.PI, spd: 0.9, t: 300 })
    step(gs, {}); gs.events.length = 0
    r.check('…and swallows a hunter whole', gs.missiles.length === 0 && !gs.ship.dead, `missiles=${gs.missiles.length}`)
}

{ // THE FORCE — the ram bites: the shell crushes soft Bydo, armour stays king
    const gs = makeGame(13)
    gs.caps.push({ id: 1, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'force' })
    step(gs, {}); gs.events.length = 0
    const s0 = gs.score
    gs.enemies.push({ id: 9, kind: 'larva', x: gs.pod.x, y: gs.pod.y, baseY: gs.pod.y, sine: 0, dive: false, state: 'sine', stateT: 0, vx: 0, vy: 0, hp: 1, anim: 0, inv: 0 })
    step(gs, {}); gs.events.length = 0
    r.check('a larva that meets the shell is a larva that died', gs.score >= s0 + 100 && !gs.ship.dead, `score +${gs.score - s0} lives=${gs.lives}`)
    // a hull-segment pushes the pod back — the force is not a cheat code
    const gs2 = makeGame(13)
    gs2.caps.push({ id: 1, x: gs2.ship.x + 4, y: gs2.ship.y, baseY: gs2.ship.y, bob: 0, type: 'force' })
    step(gs2, {}); gs.events.length = 0
    gs2.ship.inv = 999999
    const wallX = gs2.ship.x + 40
    gs2.enemies.push({ id: 8, kind: 'hullseg', x: wallX, y0: 26, y1: 214, len: 60, vx: 0, hp: Infinity, inv: Infinity })
    step(gs2, { b: true }); gs.events.length = 0 // deploy toward the plate
    let stayedOut = true
    for (let i = 0; i < 40; i++) {
        step(gs2, {})
        gs2.events.length = 0
        if (gs2.pod && gs2.pod.x + 6 > wallX + 0.5) stayedOut = false
    }
    r.check('armour refuses the pod — the shell never crosses a hull-plate', stayedOut, `pod=${gs2.pod ? `x${Math.round(gs2.pod.x)} vs wall ${wallX}` : 'grinded/lost'}`)
}

{ // THE FORCE — deploy, park, retrieve, and the wall grinds a parked shell
    const gs = makeGame(14)
    gs.caps.push({ id: 1, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'force' })
    step(gs, {}); gs.events.length = 0
    step(gs, { b: true }); gs.events.length = 0 // press: deploy
    step(gs, {}); gs.events.length = 0
    r.check('POD launches the shell off the nose', gs.pod.state === 'fly', `state=${gs.pod.state}`)
    let parked = false
    for (let i = 0; i < 90 && !parked; i++) { step(gs, {}); gs.events.length = 0; if (gs.pod.state === 'park') parked = true }
    r.check('the parked shell holds at the right screen edge', parked && gs.pod.x >= gs.camX + W - 15, `x-cam ${Math.round(gs.pod.x - gs.camX)}`)
    step(gs, { b: true }); gs.events.length = 0 // press: recall
    step(gs, {}); gs.events.length = 0
    r.check('POD again calls the shell home', gs.pod.state === 'return', `state=${gs.pod.state}`)
    let docked = false
    for (let i = 0; i < 90 && !docked; i++) { step(gs, {}); gs.events.length = 0; if (gs.pod.state === 'attached') docked = true }
    r.check('the pilot catches the shell at the nose', docked, `state=${gs.pod.state}`)
    // grind: deploy and let the camera walk the parked shell into the wall
    gs.ship.inv = 999999
    step(gs, { b: true }); gs.events.length = 0
    let ground = false
    for (let i = 0; i < 900 && !ground; i++) { step(gs, {}); gs.events.length = 0; if (gs.pod === null) ground = true }
    r.check('a shell left behind is ground by the wall — nothing parks forever', ground, `pod=${gs.pod ? gs.pod.state : 'grinded'}`)
}

{ // #2823 polish laws — deploy has air (dock grace), and armour grinding the
  // shell makes itself heard (the strain event the shell turns into friction)
    const gs = makeGame(17)
    gs.caps.push({ id: 1, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'force' })
    step(gs, {}); gs.events.length = 0
    step(gs, { b: true }); gs.events.length = 0 // deploy: the grace window opens
    // park the shell just ahead of the nose and nudge: proximity must NOT
    // snap it home inside the grace window (the pre-fix dock radius caught it)
    gs.pod.state = 'park'
    gs.pod.x = gs.ship.x + 17
    gs.pod.y = gs.ship.y
    let snappedAt = -1
    for (let i = 0; i < 24 && snappedAt < 0; i++) {
        step(gs, { right: true }); gs.events.length = 0
        if (gs.pod.state === 'attached') snappedAt = i
    }
    r.check('deploy has air — a nudge never snaps a fresh shell straight home', snappedAt === -1 || snappedAt >= 6, `attached at nudge tick ${snappedAt}`)
    r.check('once the grace window passes, a nudge still catches the shell', snappedAt >= 0, `state=${gs.pod.state}`)
    // the refusal grunts: drive the shell at a hull-plate and listen
    const g3 = makeGame(18)
    g3.caps.push({ id: 1, x: g3.ship.x + 4, y: g3.ship.y, baseY: g3.ship.y, bob: 0, type: 'force' })
    step(g3, {}); g3.events.length = 0
    g3.ship.inv = 999999
    const wallX = g3.ship.x + 40
    g3.enemies.push({ id: 8, kind: 'hullseg', x: wallX, y0: 26, y1: 214, len: 60, vx: 0, hp: Infinity, inv: Infinity })
    step(g3, { b: true }); g3.events.length = 0
    let heard = false
    for (let i = 0; i < 24; i++) { step(g3, {}); if (g3.events.includes('strain')) heard = true; g3.events.length = 0 }
    r.check('refusal grunts — armour clamping the shell cries out (strain)', heard)
}

{ // THE FORCE — die attached and the shell burns with you
    const gs = makeGame(15)
    gs.caps.push({ id: 1, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'force' })
    step(gs, {}); gs.events.length = 0
    gs.ship.inv = 0
    gs.bullets.push({ id: 1, x: gs.ship.x, y: gs.ship.y + 30, vx: 0, vy: -1.4 }) // from the side, past the nose plug
    for (let i = 0; i < 40 && gs.lives === 3; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('death with the pod attached costs the pilot AND the shell', gs.lives === 2 && gs.pod === null, `lives=${gs.lives} pod=${gs.pod ? gs.pod.state : 'gone'}`)
}

{ // LASER — charge and release: a tap looses nothing, a full hold spits the big lance
    const gs = makeGame(16)
    gs.ship.weapon = 'laser'
    step(gs, { a: true }); gs.events.length = 0
    step(gs, {}); gs.events.length = 0 // tap: below laserMin
    r.check('a tap does not loose the lance — it must be charged', gs.shots.length === 0, `shots=${gs.shots.length}`)
    for (let i = 0; i < 52; i++) { step(gs, { a: true }); gs.events.length = 0 }
    step(gs, {}); gs.events.length = 0
    const l = gs.shots.find((q) => q.kind === 'l')
    r.check('hold to full and release — the long lance flies', !!l && l.size === 2, l ? `size=${l.size}` : 'no lance')
    // piercing: one lance rakes TWO turrets lined up on its lane
    const gs2 = makeGame(16)
    gs2.ship.weapon = 'laser'
    gs2.ship.inv = 999999
    gs2.enemies.push({ id: 31, kind: 'turret', x: gs2.ship.x + 30, y: gs2.ship.y, face: -1, hp: 3, cd: 9999, anim: 0, inv: 0, edgeUp: true })
    gs2.enemies.push({ id: 32, kind: 'turret', x: gs2.ship.x + 70, y: gs2.ship.y, face: -1, hp: 3, cd: 9999, anim: 0, inv: 0, edgeUp: true })
    for (let i = 0; i < 52; i++) { step(gs2, { a: true }); gs2.events.length = 0 }
    step(gs2, {}); gs2.events.length = 0
    let sawTwo = false
    for (let i = 0; i < 30; i++) {
        step(gs2, {})
        gs2.events.length = 0
        const left = gs2.enemies.filter((e) => e.kind === 'turret')
        if (left.length <= 1) sawTwo = true
    }
    r.check('the lance pierces — one beam rakes a line of turrets', sawTwo, `turrets left ${gs2.enemies.filter((e) => e.kind === 'turret').length}`)
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
    for (let i = 0; i < 260 && gs.p1 && gs.leg === 1; i++) { step(gs, { a: true }); gs.events.length = 0 }
    r.check('break the core and the convoy presses on — LEG 2 opens, the stage is NOT over', gs.leg === 2 && gs.mode === 'play' && !gs.cleared, `leg=${gs.leg} mode=${gs.mode} cleared=${gs.cleared ? 1 : 0}`)
}

{ // the machine re-runs honestly: BOTH dreads fall, the banner rolls, and the
//   field restarts with the score carried. Driven through the deterministic
//   cascades instead of bot luck (the old form passed vacuously on score alone).
    const gs = makeGame(10)
    gs.camX = STAGE_END
    step(gs, {}); gs.events.length = 0
    gs.ship.inv = 999999
    for (let i = 0; i < 360 && gs.p1.x > gs.camX + W - 120; i++) { step(gs, {}); gs.events.length = 0 }
    gs.p1.mouth = 'open'; gs.p1.mouthT = 99999
    gs.p1.coreHp = 1
    for (let i = 0; i < 400 && gs.leg === 1; i++) { step(gs, { a: true }); gs.events.length = 0 } // core + death roll + handoff
    r.check('the Phase-1 wreck hands over: LEG 2 scrolls on', gs.leg === 2 && gs.mode === 'play' && !gs.cleared, `leg=${gs.leg} mode=${gs.mode}`)
    for (let i = 0; i < 2200 && !gs.p2; i++) { step(gs, autopilot(gs)); gs.events.length = 0 }
    r.check('LEG 2 ends at the twin-core fortress', !!gs.p2 && gs.camLock, `p2=${!!gs.p2} camLock=${gs.camLock}`)
    gs.ship.inv = 999999
    for (const c of gs.p2.cores) { c.mouth = 'open'; c.mouthT = 99999; c.hp = 1 }
    gs.ship.y = CORE_Y[0]
    for (let i = 0; i < 120 && gs.p2.cores[0].hp > 0; i++) { step(gs, { a: true }); gs.events.length = 0 } // first heart, upper vent
    gs.ship.y = CORE_Y[1]
    for (let i = 0; i < 700 && gs.mode === 'play'; i++) { step(gs, { a: true }); gs.events.length = 0 } // second heart + the #2835 double walk
    r.check('both hearts stopped at last: STAGE CLEAR rolls', gs.mode === 'clear' && gs.cleared, `mode=${gs.mode}`)
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
    for (let i = 0; i < 60 && gs.leg === 1; i++) { step(gs, { a: true }); gs.events.length = 0 }
    r.check('the cascade hands the convoy onward — LEG 2, no premature clear', gs.leg === 2 && gs.mode === 'play' && !gs.cleared, `leg=${gs.leg} mode=${gs.mode}`)
}

// --------------------------------------------------------------- S3 laws ---
{ // BITS — the chain: newest at the nose, the older shoved down the line
    const gs = makeGame(21)
    for (let n = 0; n < 2; n++) gs.caps.push({ id: 9 + n, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'bit' })
    step(gs, {}); gs.events.length = 0
    r.check('green capsules chain bits: two aboard, newest at the nose', gs.bits.length === 2 &&
        gs.bits[0].px > gs.ship.x + 10 && gs.bits[1].px < gs.ship.x - 10, `bits=${gs.bits.length} nose ${Math.round(gs.bits[0].px - gs.ship.x)} tail ${Math.round(gs.bits[1].px - gs.ship.x)}`)
    // a chained hull outguns: every bit draws a stream
    gs.shots.length = 0; gs.ship.weapon = 'vulcan'; gs.ship.cd = 0
    step(gs, { a: true }); gs.events.length = 0
    r.check('a chained vulcan draws extra streams from the bits', gs.shots.length === 3, `streams=${gs.shots.length}`)
    // the fourth completes the shield — the orbit throws the outermost bit wide
    gs.bits.push({ id: 87 }); gs.bits.push({ id: 88 })
    step(gs, {}); gs.events.length = 0
    r.check('the fourth bit swings the shield', gs.bits.length === 4 && Math.hypot(gs.bits[3].px - gs.ship.x, gs.bits[3].py - gs.ship.y) > 10, `bit3 orbit r=${Math.round(Math.hypot(gs.bits[3].px - gs.ship.x, gs.bits[3].py - gs.ship.y))}`)
    // three bits is a chain, not yet a wall
    gs.bits.length = 3
    gs.ship.inv = 0
    gs.bullets.push({ id: 77, x: gs.ship.x + 26, y: gs.ship.y, vx: -1.3, vy: 0 })
    for (let i = 0; i < 40 && gs.lives === 3; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('THREE bits are a chain, not a wall — lead still reaches the pilot', gs.lives < 3 || gs.ship.dead, `lives=${gs.lives}`)
}

{ // THE SHIELD — a rotating wall against lead and flesh, never against armour
    const gs = makeGame(22)
    for (let n = 0; n < 4; n++) gs.bits.unshift({ id: n + 1 })
    gs.ship.inv = 0
    step(gs, {}); gs.events.length = 0 // write px/py before aiming at the bits
    let plugged = 0
    for (let round = 0; round < 6 && plugged < 2; round++) {
        const bt = gs.bits[round % 4]
        gs.bullets.push({ id: 100 + round, x: bt.px, y: bt.py, vx: -1.3, vy: 0 })
        for (let i = 0; i < 20; i++) {
            step(gs, {})
            if (gs.events.includes('deflect')) plugged += 1
            gs.events.length = 0
            if (!gs.bullets.some((b) => b.id === 100 + round)) break
        }
    }
    r.check('the orbit shield swallows rounds aimed at the pilot', plugged >= 2 && gs.lives === 3, `deflected=${plugged} lives=${gs.lives}`)
    // hunters too
    const bt = gs.bits[0]
    gs.missiles.push({ id: 55, x: bt.px, y: bt.py, a: Math.PI, spd: 0.9, t: 300 })
    let hunterDown = false
    for (let i = 0; i < 30 && !hunterDown; i++) { step(gs, {}); hunterDown = gs.events.includes('deflect'); gs.events.length = 0 }
    r.check('…and wipes a hunter off the orbit', hunterDown && gs.lives === 3, `lives=${gs.lives}`)
    // soft bodies break on the fist
    const s0 = gs.score
    gs.enemies.push({ id: 66, kind: 'larva', x: gs.bits[1].px, y: gs.bits[1].py, baseY: gs.bits[1].py, sine: 0, dive: false, state: 'sine', stateT: 0, vx: 0, vy: 0, hp: 1, anim: 0, inv: 0 })
    let ground = false
    for (let i = 0; i < 30 && !ground; i++) { step(gs, {}); ground = gs.score >= s0 + 100; gs.events.length = 0 }
    r.check('soft Bydo grind on the rotating fist', ground, `score +${gs.score - s0}`)
    // armour is still king: a hull-plate sitting on the orbit takes nothing
    const gs2 = makeGame(22)
    for (let n = 0; n < 4; n++) gs2.bits.unshift({ id: n + 1 })
    gs2.ship.inv = 999999
    const wallX = gs2.ship.x + 20
    gs2.enemies.push({ id: 8, kind: 'hullseg', x: wallX, y0: 26, y1: 214, len: 60, vx: 0, hp: Infinity, inv: Infinity })
    let hurt = false
    for (let i = 0; i < 60; i++) { step(gs2, {}); gs2.events.length = 0 }
    r.check('the shield never bites armour — plates ride untouched', !hurt && gs2.enemies.some((e) => e.id === 8), `plate=${gs2.enemies.some((e) => e.id === 8)}`)
    // death strips the chain: a round already INSIDE the orbit reaches the pilot
    gs.ship.inv = 0
    gs.bullets.push({ id: 99, x: gs.ship.x + 3, y: gs.ship.y + 6, vx: 0, vy: -1.4 })
    for (let i = 0; i < 40 && gs.lives === 3; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('death strips the chain — bits are power armour', gs.lives === 2 && gs.bits.length === 0, `lives=${gs.lives} bits=${gs.bits.length}`)
}

{ // #2831 POLISH — the bit×arm matrix: the gun reshapes around the chain
    const gs = makeGame(5)
    gs.enemies.length = 0
    gs.bullets.length = 0
    for (let n = 0; n < 3; n++) gs.bits.unshift({ id: n + 1 }) // nose, tail, top
    gs.ship.inv = 999999
    step(gs, {}); gs.events.length = 0 // write px/py before reading the fan
    gs.shots.length = 0
    step(gs, { a: true })
    const fan = gs.shots.filter((q) => q.kind === 'v')
    const up = fan.find((q) => q.vy < -0.3)
    r.check('FIRE × bits: a chained vulcan FANS — the flank bit shoots outward, the nose stays true',
        fan.length === 4 && !!up && fan[0].vy === 0, `streams=${fan.length} upvy=${up ? up.vy.toFixed(2) : 'flat'}`)
    // the orbit throws the fan both wings over one full spin
    gs.bits.unshift({ id: 4 })
    let wingUp = 0, wingDown = 0
    for (let t = 0; t < 76; t++) {
        gs.ship.inv = 999999
        gs.shots.length = 0
        step(gs, { a: true })
        for (const q of gs.shots) {
            if (q.kind !== 'v' || q.vy === 0) continue
            if (q.vy < -0.3) wingUp += 1
            else if (q.vy > 0.3) wingDown += 1
        }
        gs.events.length = 0
    }
    r.check('the SHIELD spread sweeps the whole lane — both wings catch fire', wingUp > 0 && wingDown > 0, `up=${wingUp} down=${wingDown}`)
}

{ // #2831 — LASER × bits: the lance rides wider with the chain (and the bare lance misses there)
    const gs = makeGame(12)
    gs.enemies.length = 0; gs.bullets.length = 0
    gs.ship.weapon = 'laser'
    gs.ship.inv = 999999
    const offY = (id) => gs.enemies.push({ id, kind: 'larva', x: gs.ship.x + 60, y: gs.ship.y + 9, baseY: gs.ship.y + 9, sine: 0, dive: false, state: 'dive', stateT: 0, vx: 0, vy: 0, hp: 1, anim: 0, inv: 0 })
    const release = () => {
        for (let t = 0; t < 10; t++) { step(gs, { a: true }); gs.events.length = 0 }
        step(gs, {}); gs.events.length = 0 // release the lance
        let hit = false
        for (let t = 0; t < 16; t++) { step(gs, {}); hit = hit || gs.events.includes('hit'); gs.events.length = 0 }
        return hit
    }
    offY(77)
    const bare = release()
    for (let n = 0; n < 3; n++) gs.bits.unshift({ id: n + 1 })
    offY(78)
    const wide = release()
    r.check('LASER × bits: the lance widens with the chain — a 9-px offset is clean bare, dead with three bits',
        !bare && wide, `bare=${bare} three-bit=${wide}`)
}

{ // #2831 — WAVE × bits: the crescent broadens its sweep
    const gs = makeGame(13)
    gs.enemies.length = 0; gs.bullets.length = 0
    gs.ship.weapon = 'wave'
    gs.ship.inv = 999999
    const release = () => {
        for (let t = 0; t < 12; t++) { step(gs, { a: true }); gs.events.length = 0 }
        step(gs, {}); gs.events.length = 0
        let hit = false
        for (let t = 0; t < 40; t++) { step(gs, {}); hit = hit || gs.events.includes('hit'); gs.events.length = 0 }
        return hit
    }
    gs.enemies.push({ id: 79, kind: 'larva', x: gs.ship.x + 70, y: gs.ship.y + 18, baseY: gs.ship.y + 18, sine: 0, dive: false, state: 'dive', stateT: 0, vx: 0, vy: 0, hp: 1, anim: 0, inv: 0 })
    const bare = release()
    for (let n = 0; n < 4; n++) gs.bits.unshift({ id: n + 1 })
    gs.enemies.push({ id: 80, kind: 'larva', x: gs.ship.x + 70, y: gs.ship.y + 18, baseY: gs.ship.y + 18, sine: 0, dive: false, state: 'dive', stateT: 0, vx: 0, vy: 0, hp: 1, anim: 0, inv: 0 })
    const broad = release()
    r.check('WAVE × bits: the crescent broadens with the chain — 18 px off the line needs four bits',
        !bare && broad, `bare=${bare} four-bit=${broad}`)
}

{ // #2831 — deflect feedback: the bit that ate the round SHOWS it
    const gs = makeGame(14)
    for (let n = 0; n < 4; n++) gs.bits.unshift({ id: n + 1 })
    gs.ship.inv = 999999
    gs.enemies.length = 0
    step(gs, {}); gs.events.length = 0 // write px/py
    const bt = gs.bits.find((q) => q.px > gs.ship.x) || gs.bits[0]
    gs.bullets.push({ id: 91, x: bt.px, y: bt.py, vx: -1.3, vy: 0 })
    step(gs, {})
    const flashed = bt.flash > 0 && gs.events.includes('deflect') && !gs.events.includes('hunterring')
    gs.events.length = 0
    let decayed = bt.flash === 0
    for (let t = 0; t < 9 && !decayed; t++) { step(gs, {}); decayed = bt.flash === 0; gs.events.length = 0 }
    r.check('deflected lead FLASHES the bit white, and the strain fades', flashed && decayed, `flash@hit=${flashed} faded=${decayed}`)
    // a hunter popped by the orbit bursts AT THE BIT — ring event, mark at the bit
    const bt2 = gs.bits[0]
    gs.missiles.push({ id: 92, x: bt2.px, y: bt2.py, a: Math.PI, spd: 0.9, t: 300 })
    let ringAt = null
    for (let t = 0; t < 8 && !ringAt; t++) {
        step(gs, {})
        if (gs.events.includes('hunterring')) ringAt = { x: gs.lastHitX, y: gs.lastHitY, flash: bt2.flash }
        gs.events.length = 0
    }
    r.check('a hunter swatted off the orbit bursts at the BIT — cyan ring, strained shell',
        !!ringAt && Math.abs(ringAt.x - bt2.px) < 3 && Math.abs(ringAt.y - bt2.py) < 3 && ringAt.flash > 0,
        ringAt ? `ring@(${Math.round(ringAt.x)},${Math.round(ringAt.y)}) bit@(${Math.round(bt2.px)},${Math.round(bt2.py)}) flash=${ringAt.flash}` : 'no ring event')
}

{ // PHASE 2 — twin cores: plating eats fire, each vent gapes on its own clock
    const gs = makeGame(23)
    gs.leg = 2; gs.camX = STAGE_END2; gs.legAt = gs.tick
    step(gs, {}); gs.events.length = 0
    r.check('LEG 2 locks at the twin-core fortress', gs.camLock && !!gs.p2 && gs.p2.cores.length === 2, `p2=${!!gs.p2}`)
    gs.ship.inv = 999999
    for (let i = 0; i < 400 && gs.p2.x > gs.camX + W - 120; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('the fortress closes to fighting range', gs.p2.x <= gs.camX + W - 100, `x-cam ${Math.round(gs.p2.x - gs.camX)}`)
    for (const c of gs.p2.cores) { c.mouth = 'closed'; c.mouthT = 9999 }
    const hp0 = [gs.p2.cores[0].hp, gs.p2.cores[1].hp]
    for (let i = 0; i < 60; i++) { step(gs, { a: true }); gs.events.length = 0 }
    r.check('sealed plating eats the stream — no core drops', hp0.every((h, i) => gs.p2.cores[i].hp === h), `cores ${gs.p2.cores.map((c) => c.hp).join('/')}`)
    // only the gaped core takes fire: open the UPPER vent, shoot the lanes
    gs.p2.cores[0].mouth = 'open'; gs.p2.cores[0].mouthT = 9999
    gs.ship.y = 92
    for (let i = 0; i < 80; i++) { step(gs, { a: true }); gs.events.length = 0 }
    r.check('a gaped vent falls to aimed fire — the sealed twin does not', gs.p2.cores[0].hp < hp0[0] && gs.p2.cores[1].hp === hp0[1], `cores ${gs.p2.cores.map((c) => c.hp).join('/')}`)
    // break one heart: the survivor enrages, the stage is NOT over
    gs.p2.cores[1].mouth = 'open'; gs.p2.cores[1].mouthT = 9999
    gs.p2.cores[0].hp = 1; gs.p2.cores[1].hp = 1
    gs.ship.y = 148
    let sawDown = false
    for (let i = 0; i < 120 && !sawDown; i++) { step(gs, { a: true }); sawDown = gs.events.includes('coredown'); gs.events.length = 0 }
    const alive = gs.p2.cores.find((c) => c.hp > 0)
    r.check('a broken core enrages the survivor — and the fortress still stands', sawDown && gs.mode === 'play' && !!alive && alive.enraged && gs.p2.dyingT === 0, `cores ${gs.p2.cores.map((c) => `${c.hp}${c.enraged ? '!' : ''}`).join('/')} mode=${gs.mode}`)
    // the enrage is real: the survivor's closed wait runs at double speed
    alive.mouth = 'closed'; alive.mouthT = 160
    let enragedToOpen = 0
    for (let i = 0; i < 120 && alive.mouth !== 'open'; i++) { step(gs, {}); enragedToOpen += 1; gs.events.length = 0 }
    r.check('the enraged vent cycles at double time', enragedToOpen > 0 && enragedToOpen < 120, `${enragedToOpen} ticks closed→open (190 base unhasted)`)
    // both hearts stop together
    alive.hp = 1
    gs.ship.y = CORE_Y[gs.p2.cores.indexOf(alive)]
    for (let i = 0; i < 700 && gs.mode === 'play'; i++) { step(gs, { a: true }); gs.events.length = 0 }
    r.check('both hearts down: the fortress falls and CLEAR finally rolls', gs.mode === 'clear' && gs.cleared, `mode=${gs.mode}`)
}

// ---------------------------------------------------- #2835 law set ------
{ // bit carriers — the stage-2 set-piece joins LEG 2
    const gs = makeGame(7)
    gs.leg = 2
    gs.schedule = WAVES2.map((w, i) => ({ ...w, idx: 50 + i, fired: false }))
    let seen = null
    for (let t = 0; t < 1400 && !seen; t++) { gs.ship.inv = 999999; step(gs, {}); seen = gs.enemies.find((e) => e.kind === 'bitpod') || null; gs.events.length = 0 }
    r.check('#2835: LEG 2 fields an airborne bit carrier', !!seen, seen ? `n=${seen.n} hp=${seen.hp}` : 'no carrier')
    // kill it: cargo must spill as chainable bit capsules
    const gs2 = makeGame(3)
    gs2.ship.inv = 999999
    gs2.enemies.length = 0
    gs2.enemies.push({ id: 900, kind: 'bitpod', x: gs2.ship.x + 60, y: gs2.ship.y, baseY: gs2.ship.y, bob: 0.5, hp: 7, n: 3, vx: -0.7, inv: 0, anim: 0, holdT: 40, anchorX: gs2.camX, state: 'hold' })
    let free = false
    for (let t = 0; t < 80 && !free; t++) { step(gs2, { a: true }); free = gs2.events.includes('bitfree'); gs2.events.length = 0 }
    const bits0 = gs2.caps.filter((c) => c.type === 'bit').length
    r.check('a downed carrier spills its bits as capsules', free && bits0 >= 3, `caps ${bits0}`)
    let chained = 0
    for (let t = 0; t < 400 && chained < 3; t++) {
        const near = gs2.caps.filter((c) => c.type === 'bit').sort((a, b) => Math.abs(a.y - gs2.ship.y) - Math.abs(b.y - gs2.ship.y))[0]
        step(gs2, near ? { up: near.y < gs2.ship.y - 2, down: near.y > gs2.ship.y + 2 } : {}); chained = gs2.bits.length; gs2.events.length = 0
    }
    r.check('the freed cargo chains like any bit', chained >= 3, `bits ${chained}`)
    // armour law: the rotating fist grinds larvae, NOT an armoured ferry
    const gs3 = makeGame(4)
    for (let n = 0; n < 4; n++) gs3.bits.unshift({ id: n + 1 })
    gs3.ship.inv = 999999
    gs3.enemies.length = 0
    gs3.enemies.push({ id: 901, kind: 'bitpod', x: gs3.ship.x + 16, y: gs3.ship.y, baseY: gs3.ship.y, bob: 0, hp: 7, n: 2, vx: 0, inv: 0, anim: 0, holdT: 40, anchorX: gs3.camX, state: 'hold' })
    let grindDead = false
    for (let t = 0; t < 60; t++) { step(gs3, {}); grindDead = grindDead || !gs3.enemies.some((e) => e.id === 901); gs3.events.length = 0 }
    r.check('the orbit grinds larvae, not armour — the carrier shrugs the shield', !grindDead, `carrier alive=${!grindDead}`)
    // the S.E.E.D. shell CAN down one, cargo included
    const gs4 = makeGame(4)
    gs4.ship.inv = 999999
    gs4.enemies.length = 0
    gs4.pod = { id: 5, state: 'fly', x: gs4.ship.x + 60, y: gs4.ship.y, grace: 0 }
    gs4.enemies.push({ id: 902, kind: 'bitpod', x: gs4.ship.x + 66, y: gs4.ship.y, baseY: gs4.ship.y, bob: 0, hp: 7, n: 2, vx: 0, inv: 0, anim: 0, holdT: 40, anchorX: gs4.camX, state: 'hold' })
    let rammed = false
    for (let t = 0; t < 80 && !rammed; t++) { step(gs4, {}); rammed = gs4.events.includes('bitfree'); gs4.events.length = 0 }
    r.check('the shell rams carriers down too — and takes the cargo with it', rammed, `bitfree=${rammed}`)
}

{ // Phase-2 offense — telegraphed, alternating port salvos, and a swaying mass
    const gs = makeGame(5)
    gs.ship.inv = 999999
    gs.leg = 2; gs.camX = STAGE_END2; gs.legAt = gs.tick
    step(gs, {})
    r.check('the fortress carries its salvo clock', gs.p2 && gs.p2.port === 0 && gs.p2.cascade === 380, `port ${gs.p2 && gs.p2.port}`)
    let minS = 9, maxS = -9
    const salvos = []
    const horns = { 0: [], 1: [] }
    const prev = ['closed', 'closed']
    for (let t = 0; t < 1600 && salvos.length < 4; t++) {
        gs.ship.inv = 999999
        step(gs, {})
        minS = Math.min(minS, gs.p2.swayOff); maxS = Math.max(maxS, gs.p2.swayOff)
        gs.p2.cores.forEach((c, ci) => { if (prev[ci] === 'closed' && c.mouth === 'opening') horns[ci].push(gs.tick); prev[ci] = c.mouth })
        if (gs.events.includes('p2salvo')) salvos.push({ tick: gs.tick, y: gs.bullets[gs.bullets.length - 1] ? gs.bullets[gs.bullets.length - 1].y : -1 })
        gs.events.length = 0
    }
    const lanes = salvos.map((s) => (s.y < 120 ? 0 : 1))
    let alt = lanes.length >= 4
    for (let i = 1; i < lanes.length; i++) alt = alt && lanes[i] !== lanes[i - 1]
    r.check('ports alternate volleys — one gapes, the OTHER speaks', alt, `lanes ${lanes.join('>')}`)
    r.check('every salvo is telegraphed: 30 ticks after its port horn',
        salvos.length >= 4 && salvos.every((s) => horns[s.y < 120 ? 0 : 1].some((h) => s.tick - h === 30)),
        `salvos ${salvos.map((s) => s.tick).join(' ')}`)
    r.check('the whole mass sways ±6 px on pure tick arithmetic', minS < -3.5 && maxS > 3.5, `${minS.toFixed(1)}..${maxS.toFixed(1)}`)
    // aim law rides the sway: centring on the OPEN port's swaying lane kills it
    gs.p2.cores[0].mouth = 'open'; gs.p2.cores[0].mouthT = 10000
    const h0 = gs.p2.cores[0].hp
    for (let t = 0; t < 120 && gs.p2.cores[0].hp === h0; t++) {
        gs.ship.inv = 999999
        gs.ship.y = CORE_Y[0] + gs.p2.swayOff
        step(gs, { a: true }); gs.events.length = 0
    }
    r.check('aiming follows the sway — the tracked lane still kills the core', gs.p2.cores[0].hp < h0, `hp ${h0}->${gs.p2.cores[0].hp}`)
}

{ // walking death — the fire starts at the port that fell LAST, runs ~2×
    const gs = makeGame(11)
    gs.ship.inv = 999999
    gs.leg = 2; gs.camX = STAGE_END2; gs.legAt = gs.tick
    step(gs, {})
    gs.p2.cores[0].mouth = 'open'; gs.p2.cores[0].mouthT = 10000
    gs.p2.cores[1].mouth = 'open'; gs.p2.cores[1].mouthT = 10000
    gs.p2.cores[0].hp = 1; gs.p2.cores[1].hp = 2
    for (let t = 0; t < 300 && gs.p2.cores[0].hp > 0; t++) { gs.ship.inv = 999999; gs.ship.y = CORE_Y[0] + gs.p2.swayOff; step(gs, { a: true }); gs.events.length = 0 }
    r.check('the first heart falls and the face still fights', gs.p2.dyingT === 0 && gs.p2.cores[0].hp === 0)
    for (let t = 0; t < 300 && gs.p2.dyingT === 0; t++) { gs.ship.inv = 999999; gs.ship.y = CORE_Y[1] + gs.p2.swayOff; step(gs, { a: true }); gs.events.length = 0 }
    r.check('the wreck walk starts at the last-fallen port, double-length', gs.p2.lastCore === 1 && gs.p2.dyingT > 300, `last ${gs.p2.lastCore} dyingT ${gs.p2.dyingT}`)
    const booms = []
    for (let t = 0; t < 640 && gs.mode === 'play'; t++) { gs.ship.inv = 999999; step(gs, {}); if (gs.events.includes('boom') && gs.p2) booms.push({ x: gs.lastHitX, y: gs.lastHitY }); gs.events.length = 0 }
    const third = Math.ceil(booms.length / 3)
    const upper = booms.filter((b) => b.y < 120).length
    const lower = booms.filter((b) => b.y >= 120).length
    const firstL = booms.slice(0, third).filter((b) => b.y >= 120).length
    r.check('death walks port-to-port and CLEAR waits for the whole walk',
        gs.mode === 'clear' && upper > 5 && lower > 5 && firstL >= third * 0.9 && booms[booms.length - 1].x > booms[0].x + 40,
        `mode=${gs.mode} up=${upper} lo=${lower} firstL=${firstL}/${third}`)
}

// --------------------------------------------------------------- S4 laws ---
const coopGame = (seed) => { const gs = makeGame(seed); enableCoop(gs); return gs }

{ // co-op default AND the solo shape preserved
    const gs = coopGame(1)
    r.check('S4: the wing joins the run — CPU pilot, own ticket, station behind',
        !!gs.wing && gs.wing.lives === 3 && !gs.wing.human && gs.wing.x < gs.ship.x,
        `wing x ${Math.round(gs.wing.x)} vs ship ${Math.round(gs.ship.x)} lives ${gs.wing.lives}`)
    r.check('without enableCoop the field is still the lone S1–S3 R-7', makeGame(1).wing === null)
}

{ // stations: behind the leader, opposite lane, never across the nose —
  // measured ONLY while the leader leads (a downed leader sends the wing to
  // its own station by design; that hand-off is its own law below)
    const gs = coopGame(3)
    gs.ship.inv = 999999
    let crossed = false, opposite = 0, sightings = 0
    for (let i = 0; i < 400; i++) {
        step(gs, { right: gs.ship.x - gs.camX < 52, up: i % 160 < 80, down: i % 160 >= 80, a: true })
        gs.events.length = 0
        if (!gs.ship.dead && !gs.wing.dead && !gs.wing.out && gs.tick > 30) {
            sightings++
            if (gs.wing.x > gs.ship.x + 6) crossed = true
            if ((gs.ship.y < 120 && gs.wing.y > gs.ship.y) || (gs.ship.y >= 120 && gs.wing.y < gs.ship.y)) opposite++
        }
    }
    r.check('the wing holds station: behind the leader, opposite lane, nose never crossed',
        !crossed && sightings > 300 && opposite > sightings * 0.5, `opposite ${opposite}/${sightings} crossed=${crossed}`)
}

{ // one hit kills ONE hull: dual pools, independent mercy
    const gs = coopGame(9)
    gs.ship.inv = 999999
    gs.wing.inv = 0
    gs.bullets.push({ id: 1, x: gs.wing.x, y: gs.wing.y, vx: -1, vy: 0 })
    step(gs, {}); gs.events.length = 0
    r.check('a round through seat two hangs ITS wreck only', gs.wing.dead && gs.wing.lives === 2 && gs.lives === 3, `wing ${gs.wing.lives} p1 ${gs.lives}`)
    for (let i = 0; i < 80; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('seat two returns under mercy while seat one never blinked', !gs.wing.dead && gs.wing.inv > 0 && gs.lives === 3, `inv ${gs.wing.inv} p1 ${gs.lives}`)
}

{ // GAME OVER only when BOTH pools burn — and one dark seat is not the end
    const gs = coopGame(9)
    gs.wing.out = true
    gs.lives = 1
    gs.ship.inv = 0
    gs.bullets.push({ id: 1, x: gs.ship.x, y: gs.ship.y, vx: -1, vy: 0 })
    step(gs, {}); gs.events.length = 0
    for (let i = 0; i < 90 && gs.mode === 'play'; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('seat one burns out with seat two dark: the curtain falls', gs.mode === 'gameover' && gs.ship.out, `mode=${gs.mode} out=${gs.ship.out}`)
    const gs2 = coopGame(9)
    gs2.lives = 0
    gs2.ship.dead = true
    gs2.dyingT = 1
    for (let i = 0; i < 90 && gs2.mode === 'play'; i++) { step(gs2, {}); gs2.events.length = 0 }
    r.check('a dark seat while the wing flies: the run lives on', gs2.mode === 'play' && gs2.ship.out && !gs2.wing.out, `mode=${gs2.mode}`)
}

{ // the wing outguns the convoy on its own account
    const gs = coopGame(4)
    gs.ship.inv = 999999
    gs.wing.inv = 999999
    const s0 = gs.score
    gs.enemies.push({ id: 71, kind: 'larva', x: gs.wing.x + 30, y: gs.wing.y, baseY: gs.wing.y, sine: 0, dive: false, state: 'sine', stateT: 0, vx: 0, vy: 0, hp: 1, anim: 0, inv: 0 })
    let down = false
    for (let i = 0; i < 60 && !down; i++) { step(gs, {}); down = gs.score >= s0 + 100; gs.events.length = 0 }
    r.check('the wing downs Bydo on its own account (vulcan, seat one idle)', down, `score +${gs.score - s0}`)
}

{ // capsule courtesy: the tie goes to seat one
    const gs = coopGame(4)
    gs.ship.inv = 999999
    gs.wing.inv = 999999
    gs.wing.x = gs.ship.x
    gs.wing.y = gs.ship.y + 3
    gs.caps.push({ id: 1, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'weapon' })
    step(gs, {}); gs.events.length = 0
    r.check('a capsule held over BOTH hulls goes to seat one', gs.ship.weapon === 'laser' && gs.wing.weapon === 'vulcan', `p1=${gs.ship.weapon} wing=${gs.wing.weapon}`)
}

{ // gear is PER HULL: the wing hosts its own S.E.E.D., bit law included
    const gs = coopGame(12)
    gs.ship.inv = 999999
    gs.wing.inv = 999999
    gs.caps.push({ id: 1, x: gs.wing.x + 4, y: gs.wing.y, baseY: gs.wing.y, bob: 0, type: 'force' })
    step(gs, {}); gs.events.length = 0
    r.check('the wing hosts its own S.E.E.D. (seat one stays bare)', !!gs.wing.pod && !gs.pod, `wing pod=${gs.wing.pod ? gs.wing.pod.state : 'none'}`)
    gs.bullets.push({ id: 2, x: gs.wing.pod.x - 2, y: gs.wing.pod.y, vx: -1.3, vy: 0 })
    step(gs, {}); gs.events.length = 0
    r.check('…and its shell plugs fire aimed at IT', gs.bullets.length === 0 && !gs.wing.dead, `wing dead=${gs.wing.dead}`)
    const ws = gs.score
    gs.caps.push({ id: 3, x: gs.wing.x + 4, y: gs.wing.y, baseY: gs.wing.y, bob: 0, type: 'force' })
    step(gs, {}); gs.events.length = 0
    r.check('spare-S.E.E.D. becomes a BIT on the wing too — never a second shell',
        gs.wing.bits.length === 1 && gs.wing.pod && gs.score === ws + 500, `wing bits ${gs.wing.bits.length}`)
    gs.wing.inv = 0
    gs.bullets.push({ id: 4, x: gs.wing.x + 3, y: gs.wing.y + 5, vx: 0, vy: -1.4 })
    for (let i = 0; i < 40 && !gs.wing.dead; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('a dying wing loses ITS shell and chain — seat one keeps theirs', gs.wing.bits.length === 0 && !gs.wing.pod && gs.lives === 3, `wing bits ${gs.wing.bits.length}`)
}

{ // the decoy law: Bydo guns take the nearer hull
    const gs = coopGame(4)
    gs.enemies.length = 0
    const t = { id: 51, kind: 'turret', x: 160, y: 174, face: -1, hp: 999, cd: 4, anim: 0, inv: 0, edgeUp: true }
    gs.enemies.push(t)
    gs.ship.inv = 999999
    gs.wing.inv = 999999
    let first = null
    for (let i = 0; i < 120 && !first; i++) {
        gs.ship.x = 100; gs.ship.y = 40
        gs.wing.x = 100; gs.wing.y = 178
        step(gs, {})
        gs.events.length = 0
        if (gs.bullets.length) first = gs.bullets[gs.bullets.length - 1]
    }
    r.check('turrets aim the NEARER hull — seat two reads as bait', !!first && first.vy > -0.3 && first.vx < 0, first ? `vx ${first.vx.toFixed(2)} vy ${first.vy.toFixed(2)}` : 'no shot')
}

{ // seats are borrowed, not owned: pad2 steers a human wing; V hands it back
    const gs = coopGame(4)
    gs.ship.inv = 999999
    gs.wing.inv = 999999
    gs.wing.human = true
    const y0 = gs.wing.y
    for (let i = 0; i < 30; i++) { step(gs, {}, { up: true }); gs.events.length = 0 }
    r.check('with the seat taken, pad2 flies it (W walks the wing up)', gs.wing.y < y0 - 20, `y ${Math.round(y0)} -> ${Math.round(gs.wing.y)}`)
    const xAbs = gs.wing.x
    for (let i = 0; i < 20; i++) { step(gs, {}, {}); gs.events.length = 0 }
    r.check('dead-stick: a human holding nothing holds the line (no autopilot drift)', Math.abs(gs.wing.x - xAbs) < 1, `drift ${(gs.wing.x - xAbs).toFixed(2)}`)
    gs.wing.human = false
    const sc0 = gs.wing.x - gs.camX
    for (let i = 0; i < 40; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('relieved (V), the wingman brain resumes station-keeping', gs.wing.x - gs.camX > sc0 + 4, `screen x ${Math.round(sc0)} -> ${Math.round(gs.wing.x - gs.camX)}`)
}

// ---------------------------------------------------- #2841 S4 polish laws ---
{ // cargo law: the wing FETCHES what it reaches first — spillage is no longer
  // seat one's exclusive chase when seat one is nowhere near it
    const gs = coopGame(6)
    gs.ship.inv = 999999
    gs.wing.inv = 999999
    for (let i = 0; i < 30; i++) { step(gs, {}); gs.events.length = 0 }
    gs.enemies.length = 0; gs.bullets.length = 0; gs.missiles.length = 0
    gs.ship.y = 170 // seat one rides low; the pod spills in the high lane
    gs.wing.y = 118
    const capY = 58
    gs.caps.push({ id: 901, x: gs.wing.x + 55, y: capY, baseY: capY, bob: 0, type: 'force' })
    const y0 = gs.wing.y
    let fetched = false
    for (let i = 0; i < 120 && !fetched; i++) { step(gs, {}); gs.events.length = 0; fetched = !!gs.wing.pod }
    r.check('#2841 the wing fetches the capsule it reaches first (cargo law)',
        fetched && gs.wing.pod && gs.wing.pod.state === 'attached' && gs.wing.y < y0 - 30,
        `pod=${gs.wing.pod ? gs.wing.pod.state : 'none'} wingY ${Math.round(y0)} -> ${Math.round(gs.wing.y)}`)
}

{ // courtesy survives the fetch law: seat one nearer => seat one's, wing holds lane
    const gs = coopGame(6)
    gs.ship.inv = 999999
    gs.wing.inv = 999999
    for (let i = 0; i < 30; i++) { step(gs, {}); gs.events.length = 0 }
    gs.enemies.length = 0; gs.bullets.length = 0; gs.missiles.length = 0
    gs.ship.y = 170 // seat one holds the loot lane; the capsule is its cargo
    gs.wing.y = 126
    const ly = gs.wing.y
    gs.caps.push({ id: 902, x: gs.ship.x + 46, y: 170, baseY: 170, bob: 0, type: 'weapon' })
    let dived = false, taken = false
    for (let i = 0; i < 120 && !taken; i++) {
        step(gs, {}); gs.events.length = 0
        taken = gs.ship.weapon !== 'vulcan'
        if (gs.wing.y > ly + 12) dived = true
    }
    r.check('#2841 courtesy kept: a capsule seat one can reach stays seat one\'s — the wing holds its lane',
        taken && !dived, `p1 arm=${gs.ship.weapon} dived=${dived}`)
}

{ // vent-hunt: a gaped core pulls the wingman's whole stream into the throat
    const gs = coopGame(7)
    gs.ship.inv = 999999
    gs.wing.inv = 999999
    gs.p1 = null; gs.enemies = gs.enemies.filter((e) => e.on !== 'p1')
    gs.bullets.length = 0; gs.missiles.length = 0; gs.caps.length = 0
    gs.leg = 2; gs.camX = STAGE_END2; gs.legAt = gs.tick
    step(gs, {}); gs.events.length = 0
    gs.p2.cores[0].mouth = 'open'; gs.p2.cores[0].mouthT = 10000
    gs.ship.y = 180 // seat one idles out of the fight; only seat two hunts
    gs.wing.y = 180
    gs.wing.inv = 999999
    const hp0 = gs.p2.cores[0].hp
    let snapped = false
    for (let i = 0; i < 240; i++) {
        step(gs, {}); gs.events.length = 0
        gs.ship.y = 180
        if (Math.abs(gs.wing.y - (CORE_Y[0] + gs.p2.swayOff)) <= 8) snapped = true
    }
    r.check('#2841 the wing hunts the gaped vent — lane snaps, stream bites (armour law intact)',
        snapped && gs.p2.cores[0].hp < hp0,
        `snapped=${snapped} core0 ${hp0}->${gs.p2.cores[0].hp}`)
}

{ // pods pass between pilots (R-Type II courtesy): seat one CALLS a spare shell
  // with its own POD button while bare — and the wing keeps its gear unasked
    const gs = coopGame(5)
    gs.ship.inv = 999999
    gs.wing.inv = 999999
    gs.wing.pod = { id: 77, state: 'attached', x: gs.wing.x + POD.noseX, y: gs.wing.y, grace: 0 }
    gs.bullets.length = 0
    let kept = true
    for (let i = 0; i < 60; i++) { step(gs, {}); gs.events.length = 0; if (gs.pod || !gs.wing.pod) kept = false }
    r.check('#2841 gear stays per-hull unasked (no free gift)', kept && gs.wing.pod && !gs.pod, `kept=${kept}`)
    let got = false
    for (let i = 0; i < 90 && !got; i++) { step(gs, { b: i === 0 }); gs.events.length = 0; got = !!gs.pod }
    r.check('#2841 the call lands: bare seat one presses POD, the wing flies its spare over',
        got && gs.pod.state === 'attached' && !gs.wing.pod,
        `pod=${gs.pod ? gs.pod.state : 'none'} wing=${gs.wing.pod ? gs.wing.pod.state : 'bare'}`)
}

// ---------------------------------------------------- WINNABILITY (S3 bar) ---
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

{ // WINNABLE alongside the wingman (S4): two hulls must carry MORE of the field
    let wins = 0
    const detail = []
    for (let seed = 1; seed <= 12; seed++) {
        const gs = coopGame(seed)
        while (gs.tick < 20000) { step(gs, autopilot(gs)); gs.events.length = 0; if (gs.mode !== 'play') break }
        const won = gs.cleared && gs.mode !== 'gameover'
        if (won) wins++
        detail.push(`${seed}:${won ? 'W' : (gs.lastDeath || '?')}`)
    }
    r.check('co-op clears strictly more of the seeded field than the solo floor', wins >= 6, `${wins}/12 [${detail.join(' ')}]`)
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
        {
            name: 'pod-blind',
            anchor: "if (!frozen && gs.pod && Math.abs(b.x - gs.pod.x) < 8 && Math.abs(b.y - gs.pod.y) < 7) {",
            plant: "if (false && gs.pod && Math.abs(b.x - gs.pod.x) < 8 && Math.abs(b.y - gs.pod.y) < 7) { /* MUTANT(pod-blind): the shell stops plugging fire */",
            harm: async (mod) => {
                const gs = mod.makeGame(12)
                gs.caps.push({ id: 1, x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'force' })
                mod.step(gs, {}); gs.events.length = 0 // capture
                gs.ship.inv = 0
                gs.bullets.push({ id: 1, x: gs.pod.x - 2, y: gs.pod.y, vx: -1.3, vy: 0 })
                for (let i = 0; i < 40 && gs.lives === 3; i++) { mod.step(gs, {}); gs.events.length = 0 }
                return gs.lives < 3
                    ? `HARM NAMED: a round walked straight through the S.E.E.D. shell and killed the pilot (lives ${gs.lives}) — the plug IS the force pod; blind, the blue capsule is a lie and S2's whole identity is gone`
                    : null
            },
        },
        {
            name: 'shield-blind',
            anchor: "if (!frozen && shieldOn(gs)) {\n            let deflected = false\n            for (const bt of gs.bits) {\n                if (Math.abs(b.x - bt.px) < BIT.rad",
            plant: "if (false && shieldOn(gs)) { /* MUTANT(shield-blind): the orbit stops reading bullets */\n            let deflected = false\n            for (const bt of gs.bits) {\n                if (Math.abs(b.x - bt.px) < BIT.rad",
            harm: async (mod) => {
                const gs = mod.makeGame(22)
                for (let n = 0; n < 4; n++) gs.bits.unshift({ id: n + 1 })
                mod.step(gs, {}); gs.events.length = 0 // write px/py
                gs.ship.inv = 0
                const bt = gs.bits.find((q) => Math.abs(q.px - gs.ship.x - 15) < 4 && q.py < gs.ship.y) || gs.bits[0]
                gs.bullets.push({ id: 1, x: bt.px, y: bt.py, vx: -1.3, vy: 0 })
                for (let i = 0; i < 40 && gs.lives === 3; i++) { mod.step(gs, {}); gs.events.length = 0 }
                return gs.lives < 3
                    ? `HARM NAMED: a round walked through the SHIELD and killed a chained pilot (lives ${gs.lives}) — the orbit wall is S3's whole promise; blind, four green bits are decoration and the twin-core leg is a lie of design`
                    : null
            },
        },
        {
            name: 'pool-blind',
            anchor: "const killWing = (gs, s, why) => killShip(gs, s, s, why)",
            plant: "const killWing = (gs, s, why) => false /* MUTANT(pool-blind): seat two cannot be hit */",
            harm: async (mod) => {
                const gs = mod.makeGame(9)
                mod.enableCoop(gs)
                gs.ship.inv = 999999
                gs.wing.inv = 0
                gs.bullets.push({ id: 1, x: gs.wing.x, y: gs.wing.y, vx: -1, vy: 0 })
                for (let i = 0; i < 20 && !gs.wing.dead; i++) { mod.step(gs, {}); gs.events.length = 0 }
                return !gs.wing.dead
                    ? 'HARM NAMED: seat two ate a point-blank round and walked away — dual pools ARE the co-op contract; a pool that cannot burn turns GAME OVER into a single-seat fiction and the wingman into an untouchable ghost'
                    : null
            },
        },
        {
            name: 'cargo-blind',
            anchor: "if (e.kind === 'bitpod') releaseBits(gs, e) // #2835: the cargo breaks loose",
            plant: "if (false && e.kind === 'bitpod') releaseBits(gs, e) /* MUTANT(cargo-blind): carriers die empty */",
            harm: async (mod) => {
                const gs = mod.makeGame(3)
                gs.ship.inv = 999999
                gs.enemies.length = 0
                gs.enemies.push({ id: 900, kind: 'bitpod', x: gs.ship.x + 60, y: gs.ship.y, baseY: gs.ship.y, bob: 0.5, hp: 7, n: 3, vx: -0.7, inv: 0, anim: 0, holdT: 40, anchorX: gs.camX, state: 'hold' })
                let free = false
                for (let t = 0; t < 80 && !free; t++) { mod.step(gs, { a: true }); free = gs.events.includes('bitfree'); gs.events.length = 0 }
                return !free
                    ? 'HARM NAMED: the carrier died WITHOUT spilling its bits — the cargo IS the stage-2 set-piece; empty hulls turn the carrier hunt into pointless volume and cut the bit chain off from its signature supply'
                    : null
            },
        },
        {
            name: 'salvo-blind',
            anchor: "if (gs.p2.port === ci) { fireSalvo(gs, ci); gs.p2.port = 1 - ci }",
            plant: "if (false && gs.p2.port === ci) { fireSalvo(gs, ci); gs.p2.port = 1 - ci } /* MUTANT(salvo-blind): the fortress stops trading */",
            harm: async (mod) => {
                const gs = mod.makeGame(5)
                gs.ship.inv = 999999
                gs.leg = 2; gs.camX = mod.STAGE_END2; gs.legAt = gs.tick
                mod.step(gs, {})
                let salvos = 0
                for (let t = 0; t < 1600 && salvos < 2; t++) { gs.ship.inv = 999999; mod.step(gs, {}); if (gs.events.includes('p2salvo')) salvos++; gs.events.length = 0 }
                return salvos < 2
                    ? `HARM NAMED: the fortress sat 1600 ticks and answered with ${salvos} salvos — the traded salvo is the twin cores' menace; mute, the face is a free shooting gallery and Phase-2 loses its whole argument`
                    : null
            },
        },
        {
            name: 'vent-blind',
            anchor: "if (ventY >= 0) ty0 = clamp(ventY, FIELD_TOP + 8, FIELD_BOT - 8)",
            plant: "if (false && ventY >= 0) ty0 = clamp(ventY, FIELD_TOP + 8, FIELD_BOT - 8) /* MUTANT(vent-blind): the wingman stops hunting the gaped vent */",
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                mod.enableCoop(gs)
                gs.ship.inv = 999999
                gs.wing.inv = 999999
                gs.p1 = null; gs.enemies = gs.enemies.filter((e) => e.on !== 'p1')
                gs.bullets.length = 0; gs.missiles.length = 0; gs.caps.length = 0
                gs.leg = 2; gs.camX = mod.STAGE_END2; gs.legAt = gs.tick
                mod.step(gs, {}); gs.events.length = 0
                gs.p2.cores[0].mouth = 'open'; gs.p2.cores[0].mouthT = 10000
                gs.ship.y = 180
                gs.wing.y = 180
                const hp0 = gs.p2.cores[0].hp
                for (let i = 0; i < 240; i++) { mod.step(gs, {}); gs.events.length = 0; gs.ship.y = 180 }
                return gs.p2.cores[0].hp === hp0
                    ? `HARM NAMED: the near core gaped 240 ticks while the wingman sat its lane (core ${hp0} -> ${gs.p2.cores[0].hp}) — vent-hunting is how the second pilot fights the boss; blind, seat two is decoy law decoration and the co-op fortress fight is seat one alone`
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
    r.check('a capsule in the lane changes the arm (state, not just pixels)', armed.weapon === 'laser' || armed.weapon === 'wave' || armed.charge > 0, `weapon=${armed.weapon}`)

    await page.evaluate(() => window.__rTest.setup({ spawnFCap: true }))
    await page.waitForTimeout(500)
    const podA = await page.evaluate(() => window.__rTest.probe())
    r.check('the BLUE capsule takes the seat: the S.E.E.D. pod rides the nose', podA.pod === 'attached', `pod=${podA.pod}`)
    await page.keyboard.press('KeyB')
    await page.waitForTimeout(150)
    const podB = await page.evaluate(() => window.__rTest.probe())
    r.check('POD (B) reaches the sim through the shell — the shell flies', podB.pod === 'fly' || podB.pod === 'park', `pod=${podB.pod}`)
    await page.keyboard.press('KeyB')
    let homed = podB
    for (let i = 0; i < 30 && homed.pod !== 'attached'; i++) {
        await page.waitForTimeout(100)
        homed = await page.evaluate(() => window.__rTest.probe())
    }
    r.check('POD again calls the shell home to the nose', homed.pod === 'attached', `pod=${homed.pod}`)

    const frameA = await page.evaluate(() => window.__game && window.__game.frame())
    r.check('the canvas paints (contract frame is not black-static)', typeof frameA === 'string' && frameA.length > 5000, `frame ${frameA ? frameA.length : 'null'} bytes`)

    await page.evaluate(() => window.__rTest.setup({ toPhase1: true, openMouth: true, inv: 999999 }))
    // The hull closes in (~5.5 s at 60 fps), then the core falls; poll honestly.
    // Pulse the trigger: with a charge arm in hand (the capsule cycle can hand
    // you LASER now) a dead-held key charges forever — a player releases.
    let p1 = await page.evaluate(() => window.__rTest.probe())
    for (let i = 0; i < 110 && !(p1.cleared === 1 || p1.leg === 2 || (p1.p1 !== '-' && Number(p1.p1.split(':')[1]) < 12)); i++) {
      await page.keyboard.down('Space')
      await page.waitForTimeout(250)
      await page.keyboard.up('Space')
      await page.waitForTimeout(120)
      p1 = await page.evaluate(() => window.__rTest.probe())
    }
    r.check('Phase-1 through the shell: the open maw falls to sustained fire', /clear|play/.test(p1.mode) && (p1.cleared === 1 || p1.leg === 2 || (p1.p1 !== '-' && Number(p1.p1.split(':')[1]) < 12)), `p1=${p1.p1} leg=${p1.leg} mode=${p1.mode} cleared=${p1.cleared}`)

    // S3 through the shell: the chain, the shield, and the twin-core fortress
    await page.evaluate(() => window.__rTest.setup({ giveBits: true, inv: 999999 }))
    const sh = await page.evaluate(() => window.__rTest.probe())
    r.check('four bits put the SHIELD up through the shell', sh.bits === 4 && sh.shield === 1, `bits=${sh.bits} shield=${sh.shield}`)
    await page.evaluate(() => window.__rTest.setup({ toPhase2: true, openVents: true, inv: 999999 }))
    let p2p = await page.evaluate(() => window.__rTest.probe())
    let p2wounded = p2p.p2 !== '-' && p2p.p2.split('/').some((h) => Number(h) < 8)
    for (let i = 0; i < 110 && !(p2p.cleared === 1 || p2wounded); i++) {
      // sweep the twin lanes: the cores sit above and below the mid-line
      await page.evaluate((yy) => window.__rTest.setup({ y: yy, openVents: true }), i % 2 ? 148 : 92)
      await page.keyboard.down('Space')
      await page.waitForTimeout(250)
      await page.keyboard.up('Space')
      await page.waitForTimeout(120)
      p2p = await page.evaluate(() => window.__rTest.probe())
      p2wounded = p2p.p2 !== '-' && p2p.p2.split('/').some((h) => Number(h) < 8)
    }
    r.check('Phase-2 through the shell: the gaped vents fall to sustained fire', p2wounded || p2p.cleared === 1, `p2=${p2p.p2} cleared=${p2p.cleared}`)

    // S4 through the shell: seat two answers to ITS keys, V relieves, G pods
    const liveWing = async () => {
        let p = await page.evaluate(() => window.__rTest.probe())
        for (let i = 0; i < 40 && p.wing !== 'live'; i++) { await page.waitForTimeout(100); p = await page.evaluate(() => window.__rTest.probe()) }
        return p
    }
    await page.evaluate(() => window.__rTest.setup({ wingInv: 999999 }))
    let wA = await liveWing()
    let wB = wA
    for (let i = 0; i < 6 && !(wB.wingHuman === 1 && wB.wingY < wA.wingY - 4); i++) {
        await liveWing()
        wA = await page.evaluate(() => window.__rTest.probe())
        await page.keyboard.down('KeyW')
        await page.waitForTimeout(400)
        await page.keyboard.up('KeyW')
        wB = await page.evaluate(() => window.__rTest.probe())
    }
    r.check('WASD takes seat two mid-flight (drop-in) and W walks the wing up', wB.wingHuman === 1 && wB.wingY < wA.wingY - 4, `human=${wB.wingHuman} wingY ${wA.wingY} -> ${wB.wingY}`)
    await page.keyboard.press('KeyV')
    await page.waitForTimeout(200)
    const wC = await page.evaluate(() => window.__rTest.probe())
    r.check('V relieves the human — the wingman brain resumes the seat', wC.wingHuman === 0, `human=${wC.wingHuman}`)
    await liveWing()
    await page.evaluate(() => window.__rTest.setup({ giveWingPod: true, wingInv: 999999 }))
    // press-and-hold-its-seat: the same G press takes the seat AND lances the
    // shell; re-press until the press lands (transient wrecks eat a lone tap)
    let wD = await page.evaluate(() => window.__rTest.probe())
    for (let i = 0; i < 8 && wD.wingPod !== 'fly' && wD.wingPod !== 'park' && wD.wingPod !== 'return'; i++) {
        await liveWing()
        await page.evaluate(() => window.__rTest.setup({ giveWingPod: true, wingInv: 999999 }))
        await page.keyboard.press('KeyG')
        await page.waitForTimeout(150)
        wD = await page.evaluate(() => window.__rTest.probe())
    }
    r.check('G sends the wing shell out through the shell', wD.wingPod === 'fly' || wD.wingPod === 'park' || wD.wingPod === 'return', `wing pod=${wD.wingPod}`)
    await page.evaluate(() => window.__rTest.setup({ giveWingBits: true }))
    const wE = await page.evaluate(() => window.__rTest.probe())
    r.check('the wing raises its own four-bit shield', wE.wingBits === 4 && wE.wingShield === 1, `wing bits=${wE.wingBits} shield=${wE.wingShield}`)
    await page.evaluate(() => window.__rTest.setup({ wingOut: true }))
    const wF = await page.evaluate(() => window.__rTest.probe())
    r.check('a burned seat reports dark while the game still plays on', wF.wing === 'out' && wF.screen === 'play' && wF.mode === 'play', `wing=${wF.wing} screen=${wF.screen}`)

    await page.evaluate(() => window.__rTest.setup({ lives: 1, inv: 0, crushShip: true }))
    let dead = { screen: 'play' }
    for (let i = 0; i < 30 && dead.screen !== 'over'; i++) {
      await page.waitForTimeout(100)
      dead = await page.evaluate(() => window.__rTest.probe())
    }
    r.check('the game-over screen lands when the LAST pool burns (seat two already dark)', dead.screen === 'over' || dead.mode === 'gameover', `screen=${dead.screen} mode=${dead.mode}`)

    r.check('zero page errors across the whole leg', errs.length === 0, errs.join(' | ') || 'clean')
}
await browser.close()

r.exit()
