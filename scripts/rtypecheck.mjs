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
import { STAGE_END, STAGE_END2, STAGE_END3, CORE_Y, W, POD, OPT, DUEL, STING, WAVES, WAVES2, WAVES3, HEAT_AT, DOBK, FIELD_TOP, FIELD_BOT, CFG, makeGame, step, autopilot, wingBrain, stateHash, enableCoop } from '../src/games/RType/sim.js'
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

{ // the machine re-runs honestly: BOTH dreads fall, the gate WALKS (#2911),
//   the banner rolls, and the field restarts with the score carried. Driven
//   through the deterministic cascades instead of bot luck (the old form passed
//   vacuously on score alone).
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
    for (let i = 0; i < 700 && gs.leg === 2; i++) { step(gs, { a: true }); gs.events.length = 0 } // second heart + the #2835 double walk
    r.check('both hearts stopped at last — and STILL it is not over: LEG 3 opens (#2911)',
        gs.leg === 3 && gs.mode === 'play' && !gs.cleared, `leg=${gs.leg} mode=${gs.mode}`)
    for (let i = 0; i < 1600 && !gs.dobk; i++) { step(gs, autopilot(gs)); gs.events.length = 0 }
    r.check('LEG 3 ends at the walking gate: the tank plants, the camera holds', !!gs.dobk && gs.camLock, `dobk=${!!gs.dobk} camLock=${gs.camLock}`)
    for (let i = 0; i < 900 && gs.mode === 'play'; i++) { step(gs, autopilot(gs)); gs.events.length = 0 }
    r.check('the gate falls: STAGE CLEAR finally rolls', gs.mode === 'clear' && gs.cleared, `mode=${gs.mode}`)
    const clearedScore = gs.score
    for (let i = 0; i < 200 && gs.mode === 'clear'; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('the machine rolls onward: banner falls, the field re-runs with the score carried',
        gs.mode === 'play' && gs.camX < 50 && gs.score >= clearedScore && gs.dobk === null, `mode=${gs.mode} camX=${Math.round(gs.camX)} score=${gs.score}`)
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
    for (let i = 0; i < 700 && gs.leg === 2; i++) { step(gs, { a: true }); gs.events.length = 0 }
    r.check('both hearts down: the fortress falls — and the road to the walking gate opens (#2911)',
        gs.leg === 3 && gs.mode === 'play' && !gs.cleared, `leg=${gs.leg} mode=${gs.mode}`)
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
    for (let t = 0; t < 640 && gs.leg === 2; t++) { gs.ship.inv = 999999; step(gs, {}); if (gs.events.includes('boom') && gs.p2) booms.push({ x: gs.lastHitX, y: gs.lastHitY }); gs.events.length = 0 }
    const third = Math.ceil(booms.length / 3)
    const upper = booms.filter((b) => b.y < 120).length
    const lower = booms.filter((b) => b.y >= 120).length
    const firstL = booms.slice(0, third).filter((b) => b.y >= 120).length
    r.check('death walks port-to-port — and CLEAR waits behind the whole walk AND the gate (#2911)',
        gs.leg === 3 && gs.mode === 'play' && !gs.cleared && upper > 5 && lower > 5 && firstL >= third * 0.9 && booms[booms.length - 1].x > booms[0].x + 40,
        `leg=${gs.leg} mode=${gs.mode} up=${upper} lo=${lower} firstL=${firstL}/${third}`)
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

// ---------------------------------------------------- #2901 law set -------
{ // desperation phase — the core speeds up past 1000
    const quiet = (g) => { g.enemies.length = 0; g.bullets.length = 0; g.missiles.length = 0; g.ship.inv = 999999 }
    // a fresh hull meets the seat cold, timer zero
    const gs = makeGame(7)
    gs.camX = STAGE_END
    quiet(gs)
    step(gs, {})
    r.check('#2901: the dreadnought meets the seat cold, timer zero',
        !!gs.p1 && gs.p1.hot === false && gs.tick - gs.p1.lockAt === 0,
        `p1=${!!gs.p1} heat=${gs.p1 ? gs.tick - gs.p1.lockAt : 'n/a'}`)
    // the mark: exactly lock+1000, exactly once, announcing itself
    const gs2 = makeGame(7)
    gs2.camX = STAGE_END
    quiet(gs2)
    step(gs2, {})
    const lock0 = gs2.p1.lockAt
    let hotAt = -1, speedEvents = 0, early = false
    for (let t = 1; t <= HEAT_AT + 2; t++) {
        quiet(gs2)
        step(gs2, {})
        if (!gs2.p1) { early = true; break }
        if (gs2.events.includes('hotspeed')) speedEvents++
        if (gs2.p1.hot && hotAt < 0) hotAt = gs2.tick - lock0
        gs2.events.length = 0
    }
    r.check('#2901: the panic latches exactly at lock+1000, once, and announces itself',
        !early && hotAt === HEAT_AT && speedEvents === 1, `hotAt=${hotAt} events=${speedEvents}`)
    // cadence: same seed, same rng — ONLY the tick multiplier differs
    const cadence = (ignite) => {
        const g = makeGame(7)
        g.camX = STAGE_END
        quiet(g)
        step(g, {})
        if (ignite) g.p1.lockAt = g.tick - HEAT_AT
        const opens = []
        for (let t = 0; t < 1400; t++) {
            quiet(g)
            step(g, {})
            if (g.events.includes('mawopen')) opens.push(g.tick)
            g.events.length = 0
        }
        return opens.slice(1).map((v, i) => v - opens[i])
    }
    const coldGaps = cadence(false)
    const hotGaps = cadence(true)
    const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
    r.check('#2901: the hot maw runs double tick-rate — gape-to-gape gaps halve',
        coldGaps.length >= 3 && hotGaps.length >= 5 && avg(hotGaps) < avg(coldGaps) * 0.72,
        `cold ${coldGaps.slice(0, 3).join(',')} hot ${hotGaps.slice(0, 4).join(',')}`)
    // sim truth: hot rides stateHash (identical runs, flag differs)
    const hA = makeGame(7); hA.camX = STAGE_END; quiet(hA); step(hA, {})
    const hB = makeGame(7); hB.camX = STAGE_END; quiet(hB); step(hB, {})
    hB.p1.hot = true
    r.check('#2901: the panic is sim truth — stateHash covers hot', stateHash(hA) !== stateHash(hB),
        `${stateHash(hA)} vs ${stateHash(hB)}`)
    // leg honesty: burn through a REAL clear — loopStage must hand back a cold hull
    const gl = makeGame(7)
    gl.ship.inv = 999999
    gl.lives = 5
    gl.camX = STAGE_END
    step(gl, {})
    gl.p1.hot = true
    gl.p1 = null
    gl.camLock = false
    gl.leg = 2
    gl.camX = STAGE_END2
    gl.legAt = gl.tick
    step(gl, {})                       // the fortress arrives
    gl.p2.cores.forEach((c) => { c.hp = 0 })
    gl.p2.dyingT = 1                 // the walk finishes — LEG 3 opens (#2911)
    quiet(gl); step(gl, {})
    gl.camX = STAGE_END3
    quiet(gl); step(gl, {})          // the camera locks and the tank walks on
    gl.dobk.hp = 1
    gl.dobk.dyingT = 1             // its stagger finishes — STAGE CLEAR fires
    quiet(gl); step(gl, {})
    for (let t = 0; t < 220 && gl.mode === 'clear'; t++) { quiet(gl); step(gl, {}); gl.events.length = 0 }
    const looping = gl.mode === 'play' && gl.p1 === null && gl.leg === 1
    for (let t = 0; t < 2100 && !gl.p1; t++) { quiet(gl); step(gl, {}); gl.events.length = 0 }
    r.check('#2901: the loop hands back its own dread — cold, with a fresh 1000 ticks',
        looping && !!gl.p1 && gl.p1.hot === false && gl.tick - gl.p1.lockAt < HEAT_AT,
        `looping=${looping} p1=${!!gl.p1} hot=${gl.p1 ? gl.p1.hot : 'n/a'}`)
}

// ---------------------------------------------------- #2906 law set -------
{ // desperation polish — telegraph marks, HUD ember voice, hot guns, juice honesty
    const quiet = (g) => { g.enemies.length = 0; g.bullets.length = 0; g.missiles.length = 0; g.ship.inv = 999999 }
    // telegraph: three hull spasms walk the last 60 ticks of the cold clock,
    // none at the mark itself and none after the latch.
    const gs = makeGame(7)
    gs.camX = STAGE_END
    quiet(gs)
    step(gs, {})
    const lock0 = gs.p1.lockAt
    const marks = []
    let spasmLive = true
    for (let t = 1; t <= HEAT_AT + 3; t++) {
        quiet(gs)
        step(gs, {})
        if (gs.events.includes('p1spasm')) marks.push(gs.tick - lock0)
        if (gs.p1.spasm > 0 && gs.tick - lock0 > HEAT_AT - 20 + 8) spasmLive = false
        gs.events.length = 0
    }
    r.check('#2906 telegraph: three hull spasms at lock+940/960/980, none after the latch',
        marks.join(',') === `${HEAT_AT - 60},${HEAT_AT - 40},${HEAT_AT - 20}` && spasmLive,
        `marks=${marks.join(',')} live=${spasmLive}`)
    // HUD ember voice: ignition stamps hotAnn at 60, ticks down to silence
    // while the panic itself stays lit.
    const gb = makeGame(7)
    gb.camX = STAGE_END
    quiet(gb)
    step(gb, {})
    gb.p1.lockAt = gb.tick - HEAT_AT
    step(gb, {})
    const ann0 = gb.p1.hotAnn
    for (let t = 0; t < 60; t++) { quiet(gb); step(gb, {}); gb.events.length = 0 }
    r.check('#2906 HUD ember voice: hotAnn stamps 60 at ignition, falls to silence while the hull stays hot',
        ann0 === 60 && gb.p1.hotAnn === 0 && gb.p1.hot === true,
        `ann@latch=${ann0} ann+60=${gb.p1.hotAnn} hot=${gb.p1.hot}`)
    // hot guns: while the core panics, ITS OWN turrets and pod reload ~25%
    // faster — tempo (gaps), never round speed. Same seed, cold vs ignited.
    const gunGaps = (ignite) => {
        const g = makeGame(7)
        g.camX = STAGE_END
        g.ship.inv = 999999
        step(g, {})                                  // the dread arrives, guns aboard
        if (ignite) g.p1.lockAt = g.tick - HEAT_AT
        const ts = [], ms = []
        for (let t = 0; t < 900; t++) {
            g.bullets.length = 0; g.missiles.length = 0; g.ship.inv = 999999
            step(g, {})
            if (g.events.includes('tsfire')) ts.push(g.tick)
            if (g.events.includes('missile')) ms.push(g.tick)
            g.events.length = 0
        }
        const gaps = (a) => a.slice(1).map((v, i) => v - a[i])
        return { ts: gaps(ts), ms: gaps(ms) }
    }
    const coldG = gunGaps(false), hotG = gunGaps(true)
    const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
    const ratio = (c, h) => avg(h) / Math.max(1, avg(c))
    r.check('#2906 hot guns: the panic tightens turret gaps ~25% (tempo, not speed)',
        coldG.ts.length >= 4 && hotG.ts.length >= 4 && ratio(coldG.ts, hotG.ts) < 0.88 && ratio(coldG.ts, hotG.ts) > 0.45,
        `cold ${coldG.ts.slice(0, 4).join(',')} hot ${hotG.ts.slice(0, 4).join(',')} ratio=${ratio(coldG.ts, hotG.ts).toFixed(2)}`)
    r.check('#2906 hot guns: the missile pod joins the panic (~25% tighter volley)',
        coldG.ms.length >= 3 && hotG.ms.length >= 3 && ratio(coldG.ms, hotG.ms) < 0.88 && ratio(coldG.ms, hotG.ms) > 0.45,
        `cold ${coldG.ms.join(',')} hot ${hotG.ms.join(',')} ratio=${ratio(coldG.ms, hotG.ms).toFixed(2)}`)
    // juice honesty: hotAnn/spasm are presentation, never sim truth
    const jA = makeGame(7); jA.camX = STAGE_END; quiet(jA); step(jA, {})
    const jB = makeGame(7); jB.camX = STAGE_END; quiet(jB); step(jB, {})
    jB.p1.hotAnn = 42; jB.p1.spasm = 7
    r.check('#2906 juice stays juice: hotAnn/spasm never ride stateHash',
        stateHash(jA) === stateHash(jB), `${stateHash(jA)} vs ${stateHash(jB)}`)
}

// ---------------------------------------------------- #2911 law set -------
{ // DOBKERATOPS — the gate that walks: entrance, stomp, telegraphed
  // ricochet fan, flesh-armour across slab and legs, the alley under the
  // belly, the hash. The stage's third gate earns its own laws.
    const tank = (seed = 5) => {
        const gs = makeGame(seed)
        gs.p1 = null; gs.p2 = null
        gs.leg = 3; gs.camX = STAGE_END3; gs.legAt = gs.tick
        step(gs, {}); gs.events.length = 0
        gs.ship.inv = 999999
        return gs
    }
    const gs = tank()
    r.check('#2911: LEG 3 locks the screen onto a walking gate', !!gs.dobk && !!gs.camLock, `dobk=${!!gs.dobk} camLock=${gs.camLock}`)
    const x0 = gs.dobk.x - gs.camX
    let feet = 0, walkTicks = 0
    while (walkTicks < 400 && gs.dobk.x > gs.dobk.targetX) { step(gs, {}); if (gs.events.includes('dobkstep')) feet++; gs.events.length = 0; walkTicks++ }
    const heldX = gs.dobk.x
    for (let i = 0; i < 20; i++) { step(gs, {}); gs.events.length = 0 }
    r.check('#2911: the tank walks in off the right edge, plants at its station, and holds',
        x0 > W + 100 && Math.abs(gs.dobk.x - gs.camX - DOBK.station) <= 1 && gs.dobk.x === heldX && feet >= 10,
        `entry ${Math.round(x0)} ft, ${feet} footfalls, station ${Math.round(gs.dobk.x - gs.camX)}`)
    // the gape reads before it speaks: horn, then 30 ticks, then the fan
    let sawOpen = -1, sawFire = -1, fan = null
    for (let t = 0; t < 400 && sawFire < 0; t++) {
        step(gs, {})
        if (gs.events.includes('dobkopen') && sawOpen < 0) sawOpen = gs.tick
        if (gs.events.includes('dobkfire')) { sawFire = gs.tick; fan = gs.bullets.filter((b) => b.bounce) }
        gs.events.length = 0
    }
    const vys = fan ? fan.map((b) => b.vy) : []
    const aimedFan = !!fan && fan.length === 3 && fan.every((b) => b.bounce && b.vx < 0 && Math.abs(b.vy) <= 0.55)
        && fan.some((b) => b.vy > 0) // the tank aims BELOW its own maw — at the pinned pilot
        && Math.max(...vys) - Math.min(...vys) > 0.4 // a real fan, not three parallel rounds
    r.check('#2911: the maw is telegraphed — open horn lands exactly 30 ticks before a 3-round fan aimed down the hull',
        sawOpen >= 0 && sawFire === sawOpen + 30 && aimedFan, `open@${sawOpen} fire@${sawFire} fan=${fan ? fan.length : 'none'}`)
    // ricochet: a round driven at the ceiling must come back down, still live
    gs.bullets.push({ id: gs.nextId++, x: gs.ship.x + 40, y: FIELD_TOP + 3, vx: -1.2, vy: -0.9, bounce: true })
    const rb = gs.bullets[gs.bullets.length - 1]
    let bounced = false
    for (let t = 0; t < 60 && !bounced; t++) { step(gs, {}); bounced = rb.vy > 0 && rb.y >= FIELD_TOP; gs.events.length = 0 }
    r.check('#2911: fireballs ricochet off the ceiling rail and stay in play', bounced, `vy ${rb.vy.toFixed(2)} at y ${Math.round(rb.y)}`)
    // flesh-armour: the slab spends the pool; a leg in the alley spends it too
    const g2 = tank()
    while (g2.dobk.x > g2.dobk.targetX) { step(g2, {}); g2.events.length = 0 }
    const hp0 = g2.dobk.hp
    g2.ship.x = g2.camX + 60; g2.ship.y = 100
    for (let t = 0; t < 40; t++) { step(g2, { a: true }); g2.events.length = 0 }
    const hpSlab = g2.dobk.hp
    g2.ship.y = FIELD_BOT - 10 // the belly alley — the leading leg still walks through it
    for (let t = 0; t < 40; t++) { step(g2, { a: true }); g2.events.length = 0 }
    r.check('#2911: flesh-armour — the slab AND the legs spend the one pool',
        hpSlab < hp0 && g2.dobk.hp < hpSlab, `hp ${hp0}->${hpSlab}->${g2.dobk.hp}`)
    // the wall law: the slab face grinds; the alley under the belly flies free
    const g3 = tank()
    while (g3.dobk.x > g3.dobk.targetX) { step(g3, {}); g3.events.length = 0 }
    g3.ship.inv = 0; g3.ship.y = 120; g3.ship.x = g3.dobk.x + 1
    step(g3, {}); const slabDeath = g3.ship.dead && g3.lastDeath === 'dobk'
    const g4 = tank()
    while (g4.dobk.x > g4.dobk.targetX) { step(g4, {}); g4.events.length = 0 }
    g4.ship.inv = 0; g4.ship.y = FIELD_BOT - 8; g4.ship.x = g4.dobk.x + 1
    step(g4, {})
    r.check('#2911: the slab face grinds the pilot flat — the leg alley under the belly is open sky',
        slabDeath && !g4.ship.dead, `slab why=${g3.lastDeath} alley dead=${g4.ship.dead ? 1 : 0}`)
    // sim truth: the pool rides the hash (the walk does too — walkT mixes)
    const hA = tank(7), hB = tank(7)
    hB.dobk.hp -= 1
    r.check('#2911: the gate is sim truth — stateHash covers the tank',
        stateHash(hA) !== stateHash(hB), `${stateHash(hA)} vs ${stateHash(hB)}`)
}

// ------------- #2915 special pods: DOUBLE and SPEED UP (capsule list) ------
{
    const pad0 = { left: false, right: false, up: false, down: false, a: false, b: false }
    const atNose = (gs, type) => gs.caps.push({ id: gs.nextId++, x: gs.ship.x + 6, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type })
    const gs = makeGame(4)
    atNose(gs, 'double')
    step(gs, pad0)
    r.check('#2915 the D pod arms the twin vulcan (dcap speaks)',
        gs.ship.weapon === 'double' && gs.events.includes('dcap'), `weapon=${gs.ship.weapon}`)
    gs.enemies.length = 0
    gs.shots.length = 0
    for (let t = 0; t < 6; t++) { step(gs, { ...pad0, a: true }); gs.events.length = 0 } // press, then sit inside the one cooldown window
    const volley = gs.shots.filter((q) => q.kind === 'v')
    r.check('#2915 one press, two rounds stacked 6 px — the twin stream never fires single',
        volley.length === 2 && Math.abs((volley[1].y - volley[0].y) - 6) < 0.01,
        `volley ${volley.length} dy ${volley.length === 2 ? (volley[1].y - volley[0].y).toFixed(1) : '-'}`)
    atNose(gs, 'weapon')
    step(gs, pad0)
    r.check('#2915 a standard capsule after D hands over to the lance (the arcade list: V, D, L, W)',
        gs.ship.weapon === 'laser', `weapon=${gs.ship.weapon}`)

    const g2 = makeGame(5)
    atNose(g2, 'speed'); step(g2, pad0)
    const lv1 = g2.ship.spd
    atNose(g2, 'speed'); step(g2, pad0)
    const lv2 = g2.ship.spd
    const spare0 = g2.score
    atNose(g2, 'speed'); step(g2, pad0)
    r.check('#2915 Speed Up stacks to two levels; spares after the cap pay points (spare law)',
        lv1 === 1 && lv2 === 2 && g2.ship.spd === 2 && g2.score > spare0 && g2.events.includes('capsule'),
        `spd ${lv1}/${lv2}/${g2.ship.spd}`)
    const x0 = g2.ship.x
    for (let t = 0; t < 10; t++) { step(g2, { ...pad0, right: true }); g2.events.length = 0 }
    const dx = g2.ship.x - x0
    r.check('#2915 the lift is on the stick: level 2 covers 34 px in 10 ticks where the cold hull covers 21',
        Math.abs(dx - (CFG.shipSpeed + 2 * CFG.speedStep) * 10) < 0.51 && dx > CFG.shipSpeed * 10 + 10,
        `dx ${dx.toFixed(2)}`)

    const g3 = makeGame(6)
    atNose(g3, 'double'); step(g3, pad0)
    atNose(g3, 'speed'); step(g3, pad0)
    const geared = g3.ship.weapon === 'double' && g3.ship.spd === 1
    g3.ship.inv = 0; g3.ship.x = g3.camX
    step(g3, pad0) // the grinding left edge takes the hull
    for (let t = 0; t < CFG.dying + 5 && g3.ship.dead; t++) { step(g3, pad0); g3.events.length = 0 }
    r.check('#2915 the wreck strips the specials — arm and speed reset with the pilot (power armour law)',
        geared && g3.ship.weapon === 'vulcan' && g3.ship.spd === 0,
        `dead=${g3.ship.dead} weapon=${g3.ship.weapon} spd=${g3.ship.spd}`)

    const hA = makeGame(8); const hB = makeGame(8); const hC = makeGame(8)
    hB.ship.spd = 1
    hC.ship.weapon = 'double'
    r.check('#2915 the specials are sim truth — stateHash covers the lift AND the twin arm',
        stateHash(hA) !== stateHash(hB) && stateHash(hA) !== stateHash(hC),
        `${stateHash(hA)} vs spd ${stateHash(hB)} vs D ${stateHash(hC)}`)

    const g5 = makeGame(9)
    g5.ship.inv = 1e9 // the schedule leg is about what the world places, not about dying
    let sawD = false, sawS = false
    while (g5.camX < 661 && g5.mode === 'play' && !g5.camLock) {
        step(g5, pad0); g5.events.length = 0
        if (g5.caps.some((c) => c.type === 'double')) sawD = true
        if (g5.caps.some((c) => c.type === 'speed')) sawS = true
    }
    r.check('#2915 the authored pods ride leg 1 at fixed spots (schedule, zero rng)', sawD && sawS,
        `D ${sawD ? 'seen' : 'missing'} S ${sawS ? 'seen' : 'missing'}`)
}

// --------- #2919 OPTIONS pods: the O capsule's mirrored shield-guns --------
{
    const pad0 = { left: false, right: false, up: false, down: false, a: false, b: false }
    const calm = (g) => { g.enemies.length = 0; g.bullets.length = 0; g.missiles.length = 0; g.ship.inv = 999 }
    const atNose = (gs, type) => gs.caps.push({ id: gs.nextId++, x: gs.ship.x + 6, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type })
    const gs = makeGame(4)
    atNose(gs, 'options')
    step(gs, pad0)
    r.check('#2919 the O pod summons its orbs (ocap speaks, the HUD names it)',
        gs.ship.opts && gs.ship.opts.length === 2 && gs.events.includes('ocap') && gs.optAnn > 0,
        `opts ${gs.ship.opts ? gs.ship.opts.length : 0} events ${gs.events.includes('ocap')}`)
    // a press while the orbs are still inbound buys the hull round only
    calm(gs); gs.shots.length = 0
    step(gs, { ...pad0, a: true })
    const pre = gs.shots.filter((q) => q.kind === 'v').length
    // the fly-in is a ceremony, not a teleport: some ticks of air, then both
    // orbs latch on diagonal mounts and each answers with a ding
    let dockTick = -1
    for (let t = 1; t <= 300; t++) {
        calm(gs); step(gs, pad0)
        if (gs.ship.opts && gs.ship.opts.every((o) => o.docked)) { dockTick = t; break }
    }
    const dinged = gs.events.includes('optdock')
    const sy = gs.ship.y
    const mountsOk = gs.ship.opts.every((o) => Math.abs((o.px - gs.ship.x) + OPT.back) <= 2
        && Math.abs(Math.abs(o.py - sy) - OPT.gap) <= 2)
    r.check('#2919 the orbs fly in and dock at the mounts (never a teleport)',
        dockTick > 8 && dockTick < 220 && dinged && mountsOk,
        `dock@${dockTick} ding=${dinged} pre=${pre} mounts ${gs.ship.opts.map((o) => `${Math.round(o.px - gs.ship.x)}/${Math.round(o.py - sy)}`).join(' ')}`)
    r.check('#2919 an inbound orb never fires — the wall forms only at the mounts', pre === 1, `pre-dock volley ${pre}`)
    // vulcan mirrors: one press = the hull round plus one from each orb, symmetric
    gs.shots.length = 0
    for (let t = 0; t < CFG.vulcanCd + 2; t++) { calm(gs); step(gs, pad0); gs.shots.length = 0 }
    step(gs, { ...pad0, a: true })
    const v = gs.shots.filter((q) => q.kind === 'v').map((q) => q.y).sort((a, b) => a - b)
    r.check('#2919 every press answers three — hull + mirrored orbs, symmetric ∓11',
        v.length === 3 && Math.abs(v[1] - v[0]) === OPT.gap && Math.abs(v[2] - v[1]) === OPT.gap,
        `volley ${v.length} ys ${v.map((y) => Math.round(y - sy)).join(',')}`)
    // double mirrors double: the arcade's full shield-gun wall is six rounds
    gs.ship.weapon = 'double'
    for (let t = 0; t < CFG.vulcanCd + 2; t++) { calm(gs); step(gs, pad0) }
    gs.shots.length = 0
    step(gs, { ...pad0, a: true })
    const dv = gs.shots.filter((q) => q.kind === 'v')
    const stack = dv.map((q) => Math.round((q.y - sy) * 10) / 10).sort((a, b) => a - b)
    r.check('#2919 double mirrors double — six rounds, three twin stacks, never five',
        dv.length === 6 && Math.abs(stack[1] - stack[0] - 6) < 0.01 && Math.abs(stack[3] - stack[2] - 6) < 0.01,
        `volley ${dv.length} ys ${stack.join(',')}`)
    // spare law: one pair per hull — a second O pays points, the orbs stay
    const sc0 = gs.score
    calm(gs); atNose(gs, 'options'); calm(gs); step(gs, pad0)
    r.check('#2919 a spare O pays 1000 and the orbs already aboard stay mounted',
        gs.score - sc0 === 1000 && gs.events.includes('capsule') && gs.ship.opts.length === 2,
        `drew ${gs.score - sc0} opts ${gs.ship.opts.length}`)
    // power armour: the wreck strips orbs with the arm (seat one)
    gs.ship.weapon = 'double'; gs.ship.spd = 1
    const geared = gs.ship.opts.length === 2
    gs.ship.inv = 0; gs.ship.x = gs.camX
    step(gs, pad0)
    const lostEv = gs.events.includes('optslost')
    for (let t = 0; t < CFG.dying + 5 && gs.ship.dead; t++) { calm(gs); step(gs, pad0); gs.events.length = 0 }
    r.check('#2919 the wreck strips the orbs with the arm — power armour law (seat one)',
        geared && lostEv && gs.ship.opts === null,
        `geared=${geared} lost=${lostEv} after=${gs.ship.opts === null ? 'bare' : 'holds'}`)

    // S4 symmetry: seat two gets its own pair, mirrors its own press, and its
    // wreck strips them too
    const g4 = makeGame(5); enableCoop(g4)
    g4.wing.human = true // seat two holds its own stick — no CPU stream noise
    g4.wing.opts = [-1, 1].map((side, i) => ({ id: 900 + i, side, px: g4.wing.x - OPT.back, py: g4.wing.y + side * OPT.gap, docked: true }))
    for (let t = 0; t < CFG.vulcanCd + 2; t++) { calm(g4); g4.ship.opts = null; step(g4, pad0, { left: false, right: false, up: false, down: false, a: false, b: false }) }
    g4.shots.length = 0
    step(g4, pad0, { left: false, right: false, up: false, down: false, a: true, b: false })
    const wv = g4.shots.filter((q) => q.kind === 'v').length
    r.check('#2919 seat two mirrors too (S4 symmetry) — its press answers three', wv === 3, `wing volley ${wv}`)
    g4.wing.inv = 0; g4.wing.x = g4.camX; calm(g4)
    step(g4, pad0, { left: false, right: false, up: false, down: false, a: false, b: false })
    r.check("#2919 the wing's wreck strips its orbs too", g4.wing.opts === null && g4.events.includes('woptslost'),
        `after=${g4.wing.opts === null ? 'bare' : 'holds'} lost=${g4.events.includes('woptslost')}`)

    // authored placement, zero rng: the O pod rides leg 1 at its fixed spot,
    // and streams past it stay byte-identical (1400 shared ticks, hash-for-hash)
    const g5 = makeGame(9)
    g5.ship.inv = 1e9
    let sawO = false
    while (g5.camX < 501 && g5.mode === 'play' && !g5.camLock) {
        step(g5, pad0); g5.events.length = 0
        if (g5.caps.some((c) => c.type === 'options')) sawO = true
    }
    r.check('#2919 the O pod rides leg 1 at its authored spot (schedule, zero rng)', sawO, `O ${sawO ? 'seen' : 'missing'}`)
    let same = true
    const dA = makeGame(11), dB = makeGame(11)
    for (let i = 0; i < 1400; i++) {
        const pad = { right: i % 53 < 30, up: i % 41 < 6, down: i % 41 >= 20 && i % 41 < 26, a: i % 7 < 4 }
        step(dA, pad); step(dB, pad)
        dA.events.length = 0; dB.events.length = 0
        if (i % 100 === 0 && stateHash(dA) !== stateHash(dB)) same = false
    }
    r.check('#2919 the stream is untouched — 1400 shared ticks past the O pod, hash-for-hash',
        same && stateHash(dA) === stateHash(dB), `final ${stateHash(dA)} vs ${stateHash(dB)}`)

    // sim truth: orbs aboard, mounted and in the run all move the hash
    const hA = makeGame(8), hB = makeGame(8), hC = makeGame(8)
    hB.ship.opts = [{ id: 1, side: -1, px: 46, py: 109, docked: true }, { id: 2, side: 1, px: 46, py: 131, docked: true }]
    hC.ship.opts = [{ id: 1, side: -1, px: 300, py: 90, docked: false }, { id: 2, side: 1, px: 308, py: 160, docked: false }]
    r.check('#2919 the shield-guns are sim truth — hash covers the pair AND their run',
        stateHash(hA) !== stateHash(hB) && stateHash(hA) !== stateHash(hC) && stateHash(hB) !== stateHash(hC),
        `${stateHash(hA)} vs docked ${stateHash(hB)} vs flying ${stateHash(hC)}`)
}

// --------- #2922 HALF-CAPSULE: the H pod steps the arm down (list Part 3) ---
{
    const pad0 = { left: false, right: false, up: false, down: false, a: false, b: false }
    const atNose = (gs, type) => gs.caps.push({ id: gs.nextId++, x: gs.ship.x + 6, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type })

    // the lineage law: every arm falls exactly one step, and the lance charge
    // dies with the lance; first claim pays like any pod in the house
    const fall = (from, to) => {
        const g = makeGame(4)
        g.ship.weapon = from; g.ship.charge = 30
        const s0 = g.score
        atNose(g, 'half'); step(g, pad0)
        return g.ship.weapon === to && g.ship.charge === 0 && g.score - s0 === 500 && g.events.includes('hcap')
    }
    r.check('#2922 H steps the arm DOWN one level (W→L, L→V, D→V) and kills the lance charge',
        fall('wave', 'laser') && fall('laser', 'vulcan') && fall('double', 'vulcan'),
        `W→L ${fall('wave', 'laser')} L→V ${fall('laser', 'vulcan')} D→V ${fall('double', 'vulcan')}`)

    // the floor law: at the vulcan there is nothing to halve — it pays like
    // every spare in the house, and the arm stays put
    const g2 = makeGame(5)
    const s2 = g2.score
    atNose(g2, 'half'); step(g2, pad0)
    r.check('#2922 at the floor H pays points instead of halving (spare law, no hcap)',
        g2.ship.weapon === 'vulcan' && g2.score - s2 === 1000 && g2.events.includes('capsule') && !g2.events.includes('hcap'),
        `arm=${g2.ship.weapon} drew ${g2.score - s2}`)

    // spare after a downgrade: H falls to vulcan, and a second H is a spare
    const g3 = makeGame(6)
    g3.ship.weapon = 'laser'
    atNose(g3, 'half'); step(g3, pad0); g3.events.length = 0
    const s3 = g3.score
    atNose(g3, 'half'); step(g3, pad0)
    r.check('#2922 a second H at the vulcan is a spare — points, never a second fall',
        g3.ship.weapon === 'vulcan' && g3.score - s3 === 1000 && g3.events.includes('capsule'),
        `arm=${g3.ship.weapon} drew ${g3.score - s3}`)

    // fidelity (#237): H is a WEAPON pod — the shield-guns are not a weapon
    // level, so the orbs ride through a downgrade untouched (only wrecks strip)
    const g4 = makeGame(7)
    g4.ship.weapon = 'laser'
    g4.ship.opts = [-1, 1].map((side, i) => ({ id: 900 + i, side, px: g4.ship.x - OPT.back, py: g4.ship.y + side * OPT.gap, docked: true }))
    atNose(g4, 'half'); step(g4, pad0); step(g4, pad0)
    r.check('#2922 H never casts the orbs off — the shield-guns outlive a downgrade (fidelity law)',
        g4.ship.weapon === 'vulcan' && g4.ship.opts && g4.ship.opts.length === 2 && g4.ship.opts.every((o) => o.docked),
        `arm=${g4.ship.weapon} opts=${g4.ship.opts ? g4.ship.opts.filter((o) => o.docked).length : 0}`)

    // S4 symmetry: seat two takes the fall too (tie at the cap goes seat one,
    // so the pod is placed at the wing's nose, out of the hull's reach)
    const g5 = coopGame(2)
    g5.wing.human = true
    g5.wing.weapon = 'wave'
    g5.caps.push({ id: g5.nextId++, x: g5.wing.x + 6, y: g5.wing.y, baseY: g5.wing.y, bob: 0, type: 'half' })
    for (let t = 0; t < 3 && g5.wing.weapon === 'wave'; t++) { step(g5, pad0, { left: false, right: false, up: false, down: false, a: false, b: false }) }
    r.check('#2922 seat two takes the fall too — H steps the wing arm down (S4 symmetry)',
        g5.wing.weapon === 'laser', `wing arm=${g5.wing.weapon}`)

    // authored placement, zero rng: the H pod rides leg 1 at its fixed spot
    // under every seed, at its authored height
    const ride = (seed) => {
        const g = makeGame(seed)
        g.ship.inv = 1e9
        let baseY = null
        while (g.camX < 621 && g.mode === 'play' && !g.camLock) {
            step(g, pad0); g.events.length = 0
            const hc = g.caps.find((c) => c.type === 'half')
            if (hc && baseY === null) baseY = hc.baseY
        }
        return baseY
    }
    const y9 = ride(9), y3 = ride(3)
    r.check('#2922 the H pod rides leg 1 at its authored fixed spot, same height every seed (zero rng)',
        y9 === 44 && y3 === 44, `seed9 ${y9} seed3 ${y3}`)

    // the downgrade is sim truth: the arm word and the pod on screen both move
    // the panic hash (the capsule cycle already mixes the arm — this pins the
    // post-downgrade state against its pre-downgrade twin)
    const hA = makeGame(8), hB = makeGame(8)
    hB.ship.weapon = 'laser'
    atNose(hB, 'half'); step(hB, pad0)
    r.check('#2922 the fall is sim truth — stateHash covers the downgraded arm',
        stateHash(hA) !== stateHash(hB), `${stateHash(hA)} vs ${stateHash(hB)}`)
}

// --------- #2925 OPTIONS-LAUNCH: throw the orbs as one-shot drones ---------
{
    const pad0 = { left: false, right: false, up: false, down: false, a: false, b: false }
    const calm = (g) => { g.enemies.length = 0; g.bullets.length = 0; g.missiles.length = 0; g.ship.inv = 999 }
    const pair = (g) => (g.ship.opts = [-1, 1].map((side, i) => ({ id: 10 + i, side, px: g.ship.x - OPT.back, py: g.ship.y + side * OPT.gap, docked: true })))

    // the throw: press L and the docked pair leaves the mounts
    const gs = makeGame(4)
    pair(gs)
    step(gs, { ...pad0, l: true })
    r.check('#2925 L throws the docked pair — both orbs leave the mounts, the launch speaks',
        gs.ship.opts && gs.ship.opts.length === 2 && gs.ship.opts.every((o) => o.fly && !o.docked) && gs.events.includes('optlaunch'),
        gs.ship ? gs.ship.opts.map((o) => `${o.fly ? 'fly' : 'hold'}${o.docked ? '+docked' : ''}`).join(' ') : 'gone')
    // straight fire: forward at launch speed, lane held
    const px0 = gs.ship.opts[0].px, py0 = gs.ship.opts[0].py
    calm(gs); step(gs, pad0)
    r.check('#2925 a drone runs straight out at throw speed — the lane is the aim',
        Math.abs(gs.ship.opts[0].px - px0 - OPT.launch) < 0.01 && gs.ship.opts[0].py === py0,
        `dx ${Math.round((gs.ship.opts[0].px - px0) * 100) / 100} dy ${gs.ship.opts[0].py - py0}`)
    // an inbound orb cannot be thrown — only mounted orbs answer the verb
    const g2 = makeGame(5); pair(g2)
    g2.ship.opts.forEach((o) => { o.docked = false; o.px = g2.ship.x + 90 }) // still homing in from the field
    calm(g2); step(g2, { ...pad0, l: true })
    r.check('#2925 an inbound orb is not yet gear to throw — the verb answers only the mounts',
        g2.ship.opts.every((o) => !o.fly) && !g2.events.includes('optlaunch'),
        g2.ship.opts.map((o) => `fly=${!!o.fly}`).join(' '))
    // a bare hull shrugs: press with nothing aboard is nothing
    const g3 = makeGame(6); calm(g3); step(g3, { ...pad0, l: true })
    r.check('#2925 pressing the throw with no orbs aboard is silence, not a crash',
        !g3.events.includes('optlaunch') && g3.ship.opts === null, `opts=${g3.ship.opts}`)

    // disposable law, seat: soft Bydo eat one hit AND the orb (one bite only)
    const g4 = makeGame(7); pair(g4); g4.ship.opts.pop() // one orb, one lane
    step(g4, { ...pad0, l: true }); g4.events.length = 0
    const o4 = g4.ship.opts[0]
    g4.enemies.push({ id: 900, kind: 'larva', x: o4.px + 6, y: o4.py, hp: 3, state: 'cruise', sine: 0, vx: -0.5, baseY: o4.py, inv: 0, anim: 0 })
    g4.enemies.push({ id: 901, kind: 'larva', x: o4.px + 40, y: o4.py, hp: 3, state: 'cruise', sine: 0, vx: -0.5, baseY: o4.py, inv: 0, anim: 0 })
    const sc4 = g4.score
    step(g4, pad0)
    r.check('#2925 a drone pays for its kill with its life — soft body dies, orb spends, one bite',
        g4.enemies.length === 1 && g4.enemies[0].id === 901 && g4.ship.opts === null &&
        g4.events.includes('ram') && g4.events.includes('boom') && g4.events.includes('optspent') && g4.score - sc4 === 100,
        `enemies ${g4.enemies.map((e) => e.id).join(',')} opts=${g4.ship === null ? 'x' : g4.ship.opts} drew ${g4.score - sc4}`)
    // the second larva lives because the first kill SPENT the drone
    let survivor = true
    for (let t = 0; t < 80 && survivor; t++) { g4.bullets.length = 0; g4.missiles.length = 0; g4.ship.inv = 999; survivor = g4.enemies.some((e) => e.id === 901); step(g4, pad0) }
    r.check('#2925 the throw is disposable — the lane behind the kill is safe (no pierce)',
        survivor, `larva 901 ${survivor ? 'lives (spent)' : 'died (pierce!)'}`)

    // armour refuses and burns: the slab eats the drone, stays itself
    const g5 = makeGame(8); pair(g5); g5.ship.opts.pop()
    step(g5, { ...pad0, l: true }); g5.events.length = 0
    const oy = g5.ship.opts[0].py
    g5.enemies.push({ id: 902, kind: 'hullseg', x: g5.ship.x + 80, y0: oy - 25, y1: oy + 25, len: 120, hp: Infinity, inv: Infinity })
    let burned = false, slabOk = true
    for (let t = 0; t < 40; t++) { g5.ship.inv = 999; step(g5, pad0); if (g5.events.includes('strain') && g5.events.includes('optspent')) burned = true }
    slabOk = !g5.enemies.some((e) => e.id === 902 && e.hp !== Infinity)
    r.check('#2925 armour shrugs the throw and the orb burns on the face (the pod refuses the same way)',
        burned && g5.ship.opts === null && slabOk, `burned=${burned} opts=${g5.ship.opts}`)
    // the dread refuses too — the throw cannot core-punch the maw's flank
    const g6 = makeGame(9); pair(g6); g6.ship.opts.pop()
    g6.p1 = { x: g6.ship.x + 90, coreHp: 100, dyingT: 0, mouth: 'closed' }
    step(g6, { ...pad0, l: true }); g6.events.length = 0
    let dreadBurn = false
    for (let t = 0; t < 40; t++) { g6.ship.inv = 999; step(g6, pad0); if (g6.events.includes('strain') && g6.events.includes('optspent')) dreadBurn = true }
    r.check('#2925 the dreadnought burns the drone on its hull — the throw is not a core-breaker',
        dreadBurn && g6.p1.coreHp === 100, `burn=${dreadBurn} core=${g6.p1.coreHp}`)

    // the horizon takes what nothing else did
    const g7 = makeGame(10); pair(g7); g7.ship.opts.pop()
    step(g7, { ...pad0, l: true }); g7.events.length = 0
    let edgeT = -1
    for (let t = 1; t <= 300 && edgeT < 0; t++) { calm(g7); if (g7.events.includes('optspent')) edgeT = t; step(g7, pad0) }
    r.check('#2925 an orb that reaches nothing flies off the horizon and is spent there too',
        edgeT > 0 && g7.ship.opts === null, `spend@${edgeT}`)

    // bare armour re-arms: a fresh O pod after a full throw is NOT a spare
    const sc8 = g7.score
    g7.caps.push({ id: g7.nextId++, x: g7.ship.x + 6, y: g7.ship.y, baseY: g7.ship.y, bob: 0, type: 'options' })
    calm(g7); step(g7, pad0)
    r.check('#2925 spend the pair and a fresh O pod re-arms it — the throw is a trade, not a tax',
        g7.ship.opts && g7.ship.opts.length === 2 && g7.events.includes('ocap') && g7.score - sc8 === 500,
        `opts ${g7.ship.opts ? g7.ship.opts.length : 0} drew ${g7.score - sc8} ocap=${g7.events.includes('ocap')}`)

    // while away the wall is down: flying orbs fire no rounds; docked, they do
    const g9 = makeGame(11); pair(g9)
    step(g9, { ...pad0, l: true }); g9.events.length = 0
    for (let t = 0; t < CFG.vulcanCd + 2; t++) { calm(g9); step(g9, pad0); g9.events.length = 0 }
    g9.shots.length = 0
    step(g9, { ...pad0, a: true })
    const away = g9.shots.filter((q) => q.kind === 'v').length
    r.check('#2925 the wall travels with the orbs — flying drones fire nothing, the hull is naked',
        away === 1, `volley ${away}`)

    // a wreck strips the throw too — mid-flight drones die with their pilot
    const g10 = makeGame(12); pair(g10)
    step(g10, { ...pad0, l: true }); g10.events.length = 0
    g10.ship.inv = 0; g10.ship.x = g10.camX
    step(g10, pad0)
    r.check('#2925 the wreck strips airborne orbs with the arm — power armour owns the throw too',
        g10.ship.opts === null && g10.events.includes('optslost'),
        `after=${g10.ship.opts === null ? 'bare' : 'holds'} lost=${g10.events.includes('optslost')}`)

    // S4 symmetry: seat two throws, kills and spends with its own verb
    const g11 = coopGame(13)
    g11.wing.human = true
    g11.wing.opts = [{ id: 950, side: -1, px: g11.wing.x - OPT.back, py: g11.wing.y - OPT.gap, docked: true }]
    calm(g11); g11.wing.inv = 999
    step(g11, pad0, { ...pad0, l: true })
    r.check('#2925 seat two answers its own throw (S4 symmetry) — the wing looses its orb',
        g11.wing.opts[0].fly === true && g11.events.includes('woptlaunch'), `fly=${!!g11.wing.opts[0].fly}`)
    const ow = g11.wing.opts[0]
    g11.enemies.push({ id: 903, kind: 'larva', x: ow.px + 6, y: ow.py, hp: 3, state: 'cruise', sine: 0, vx: -0.5, baseY: ow.py, inv: 0, anim: 0 })
    g11.bullets.length = 0; g11.missiles.length = 0; g11.ship.inv = 999; g11.wing.inv = 999
    step(g11, pad0, pad0)
    r.check('#2925 the wing drone kills and spends too — woptspent, per-hull armour',
        g11.enemies.length === 0 && g11.wing.opts === null && g11.events.includes('woptspent'),
        `enemies ${g11.enemies.length} opts=${g11.wing.opts === null ? 'bare' : 'holds'}`)

    // sim truth + determinism: the fly bit moves the hash, and streams that
    // press l stay byte-identical seed-for-seed
    const hA = makeGame(14), hB = makeGame(14)
    hA.ship.opts = [{ id: 1, side: -1, px: hA.ship.x - OPT.back, py: hA.ship.y - OPT.gap, docked: true }]
    hB.ship.opts = [{ id: 1, side: -1, px: hA.ship.x - OPT.back, py: hA.ship.y - OPT.gap, docked: false, fly: true }]
    r.check('#2925 the throw is sim truth — the fly state rides the hash',
        stateHash(hA) !== stateHash(hB), `${stateHash(hA)} vs ${stateHash(hB)}`)
    const dA = makeGame(21), dB = makeGame(21)
    pair(dA); pair(dB)
    let same = true
    for (let i = 0; i < 1200; i++) {
        const pad = { right: i % 53 < 30, up: i % 41 < 6, down: i % 41 >= 20 && i % 41 < 26, a: i % 7 < 4, l: i === 400 || i === 900 }
        dA.ship.inv = 999; dB.ship.inv = 999
        step(dA, pad); step(dB, pad)
        dA.events.length = 0; dB.events.length = 0
        if (stateHash(dA) !== stateHash(dB)) same = false
    }
    r.check('#2925 the throw is deterministic — a pressed stream replays hash-for-hash',
        same && stateHash(dA) === stateHash(dB), `final ${stateHash(dA)} vs ${stateHash(dB)}`)
}

// ---------------------------------------------- the duelist (#2934, #2808-S5) ---
// The shelf's first REACTIVE enemy (the Williams/Defender pursuit law): the
// duelist hunts the nearer hull across lanes, guns it on a telegraphed clock,
// and commits to one straight pass when its duel-clock expires. Authored
// entries, zero rng — these laws pin every phase, every kill path and the
// brain reactions that make the duel fair.
{ // authored on the scripts: leg 1 sends two duelists, leg 2 one, leg 3 one
    // (#2938 books the stage with the duel) — authored y, no rng
    const dl = WAVES.filter((w) => w.dlc)
    const dl2 = WAVES2.filter((w) => w.dlc)
    const dl3 = WAVES3.filter((w) => w.dlc)
    r.check('#2934/#2938 the duel is scripted, not rolled: two entries on leg 1, one on leg 2, one on leg 3, authored y',
        dl.length === 2 && dl2.length === 1 && dl3.length === 1 && [...dl, ...dl2, ...dl3].every((w) => Number.isInteger(w.dlc.y)),
        `leg1 ${dl.map((w) => w.at + '@' + w.dlc.y).join(',')} leg2 ${dl2.map((w) => w.at + '@' + w.dlc.y).join(',')} leg3 ${dl3.map((w) => w.at + '@' + w.dlc.y).join(',')}`)
}

{ // zero rng: two seeds with the same pads raise the same duelist at the same tick
    // (inv pinned: the run is watching the schedule, not surviving the grinder)
    const a = makeGame(7), b = makeGame(23)
    let firstA = null, firstB = null
    for (let i = 0; i < 700; i++) {
        step(a, {}); step(b, {})
        a.ship.inv = 999999; b.ship.inv = 999999
        a.events.length = 0; b.events.length = 0
        const ea = a.enemies.find((e) => e.kind === 'duelist')
        const eb = b.enemies.find((e) => e.kind === 'duelist')
        if (ea && !firstA) firstA = { t: a.tick, x: ea.x, y: ea.y, id: ea.id }
        if (eb && !firstB) firstB = { t: b.tick, x: eb.x, y: eb.y, id: eb.id }
    }
    r.check('#2934 the entry is seed-blind — same tick, same place (zero rng)',
        firstA && firstB && firstA.t === firstB.t && firstA.x === firstB.x && firstA.y === firstB.y,
        `A=${JSON.stringify(firstA)} B=${JSON.stringify(firstB)} (ids may differ: seeded capsules before the mark collect at different rates)`)
}

{ // pursuit law: it tracks the hull across lanes — the lane-flat world is over
    const gs = makeGame(1)
    gs.ship.inv = 999999
    gs.enemies.push({ id: 801, kind: 'duelist', x: gs.ship.x + 140, y: 60, baseY: 60, hp: DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    gs.ship.y = 160
    for (let i = 0; i < 100; i++) { step(gs, {}); gs.events.length = 0 }
    const e = gs.enemies.find((x) => x.kind === 'duelist')
    r.check('#2934 pursuit: the duelist crosses lanes to the hull (60 -> 160)',
        e && Math.abs(e.y - 160) < 3, `y=${e ? e.y.toFixed(1) : 'dead'}`)
}

{ // stand-off law: hunting is pressure, not a cheap body-check
    const gs = makeGame(2)
    gs.ship.inv = 999999
    gs.enemies.push({ id: 802, kind: 'duelist', x: gs.ship.x + 140, y: 120, baseY: 120, hp: DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    let minGap = 999, maxGap = 0, alive = true
    for (let i = 0; i < 100; i++) {
        step(gs, {})
        gs.ship.inv = 999999
        const e = gs.enemies.find((x) => x.kind === 'duelist')
        if (!e) { alive = false; break }
        const gap = e.x - gs.ship.x
        if (gap < minGap) minGap = gap
        if (gap > maxGap) maxGap = gap
        gs.events.length = 0
    }
    r.check('#2934 stand-off: it holds ~110 px — closes to pressure, never leans on the hull',
        alive && !gs.ship.dead && minGap >= 90 && maxGap <= 140, `gap ${minGap.toFixed(0)}..${maxGap.toFixed(0)} dead=${gs.ship.dead}`)
}

{ // the gun is telegraphed: the eye cools, then an aimed round — and the clock resets
    const gs = makeGame(3)
    gs.ship.inv = 999999
    gs.enemies.push({ id: 803, kind: 'duelist', x: gs.ship.x + 110, y: 120, baseY: 120, hp: DUEL.hp, t: 0, cd: 60, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    let firedAt = -1, bullet = null
    for (let i = 0; i < 80; i++) {
        step(gs, {})
        if (firedAt < 0 && gs.events.includes('duelfire')) { firedAt = i; bullet = gs.bullets[gs.bullets.length - 1] }
        gs.events.length = 0
        gs.ship.inv = 999999
    }
    r.check('#2934 the aimed round: duelfire looses exactly one lead, and it travels AT the hull',
        firedAt >= 55 && firedAt <= 62 && bullet && bullet.vx < -1 && Math.abs(bullet.vy) < 0.5,
        `fired at +${firedAt} bullet=${bullet ? `vx ${bullet.vx.toFixed(2)} vy ${bullet.vy.toFixed(2)}` : 'none'}`)
}

{ // soft body: two vulcan rounds pay for the duel — pod money on the ground
    const gs = makeGame(4)
    gs.ship.inv = 999999
    gs.enemies.push({ id: 804, kind: 'duelist', x: gs.ship.x + 110, y: 120, baseY: 120, hp: DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    let hits = 0, boomAt = -1
    const sc0 = gs.score
    for (let i = 0; i < 60 && boomAt < 0; i++) {
        gs.shots.push({ id: 1000 + i, x: gs.ship.x + 12, y: gs.ship.y, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 })
        step(gs, {})
        if (gs.events.includes('hit')) hits += 1
        if (gs.events.includes('boom')) boomAt = i
        gs.events.length = 0
        gs.ship.inv = 999999
        gs.bullets.length = 0
    }
    r.check('#2934 soft airframe: exactly two vulcan rounds fold it (hp 2), for 300',
        boomAt > 0 && hits === 2 && gs.score - sc0 === DUEL.score, `hits=${hits} boom@${boomAt} score+${gs.score - sc0}`)
}

{ // the shell crushes it too — the ram law reaches the new soft body
    const gs = makeGame(5)
    gs.ship.inv = 999999
    gs.pod = { id: 1, state: 'fly', x: gs.ship.x + 50, y: gs.ship.y, grace: 0 }
    gs.enemies.push({ id: 805, kind: 'duelist', x: gs.ship.x + 58, y: gs.ship.y, baseY: gs.ship.y, hp: DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    let ram = false
    for (let i = 0; i < 12; i++) { step(gs, {}); if (gs.events.includes('ram')) ram = true; gs.events.length = 0; gs.ship.inv = 999999 }
    r.check('#2934 the S.E.E.D. shell rams the duelist down (soft Bydo law holds)',
        ram && !gs.enemies.some((e) => e.kind === 'duelist') && gs.score >= DUEL.score, `ram=${ram}`)
}

{ // the orbit grinds it — four bits turn the duel into mince (soft, never armour)
    const gs = makeGame(6)
    gs.ship.inv = 999999
    while (gs.bits.length < 4) gs.bits.unshift({ id: 60 + gs.bits.length })
    const by = gs.ship.y + 15 // the shield reach
    gs.enemies.push({ id: 806, kind: 'duelist', x: gs.ship.x, y: by, baseY: by, hp: DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    let grind = false
    for (let i = 0; i < 40; i++) { step(gs, {}); if (gs.events.includes('ram')) grind = true; gs.events.length = 0; gs.ship.inv = 999999 }
    r.check('#2934 the four-bit orbit grinds the duelist (the fist is wider than chaff)',
        grind && !gs.enemies.some((e) => e.kind === 'duelist') && gs.score >= DUEL.score, `grind=${grind}`)
}

{ // the pass hurts: at zero range the duel is a wall
    const gs = makeGame(7)
    gs.ship.inv = 0
    gs.enemies.push({ id: 807, kind: 'duelist', x: gs.ship.x + 4, y: gs.ship.y, baseY: gs.ship.y, hp: DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    step(gs, {})
    r.check('#2934 contact kills: standing where the duelist stands is dying (body:duelist)',
        gs.ship.dead && gs.lastDeath === 'body:duelist', `dead=${gs.ship.dead} why=${gs.lastDeath}`)
}

{ // the commit law: hunt, crouch, ONE straight pass — the duel always ends
    const gs = makeGame(8)
    gs.ship.inv = 999999
    gs.enemies.push({ id: 808, kind: 'duelist', x: gs.ship.x + 110, y: 120, baseY: 120, hp: DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    const ladder = []
    let dashV = null, straight = true, windAt = -1
    for (let i = 0; i < 420; i++) {
        step(gs, {})
        gs.ship.inv = 999999
        gs.bullets.length = 0
        const e = gs.enemies.find((x) => x.kind === 'duelist')
        if (!e) break
        if (!ladder.includes(e.state)) ladder.push(e.state)
        if (e.state === 'windup' && windAt < 0) windAt = i
        if (e.state === 'dash') {
            if (dashV === null) dashV = { vx: e.vx, vy: e.vy }
            else if (Math.abs(e.vx - dashV.vx) > 1e-9 || Math.abs(e.vy - dashV.vy) > 1e-9) straight = false
        }
        gs.events.length = 0
    }
    r.check('#2934 the commit: hunt -> windup -> dash, and the pass flies straight to its end',
        ladder.join('>') === 'hunt>windup>dash' && straight && windAt >= DUEL.commitAt - 5,
        `${ladder.join('>')} wind@${windAt} straight=${straight}`)
}

{ // seat two is fair game: Bydo guns (and duels) take the NEARER hull
    const gs = coopGame(9)
    gs.ship.inv = 999999
    if (gs.wing) { gs.wing.inv = 999999; gs.wing.human = true; gs.wing.y = 50; gs.wing.x = gs.ship.x - 10 }
    // the hunter starts low, but the WING is the nearer hull — pursuit is
    // nearest-hull law, not seat-one law: it must climb toward the wing.
    // (seat two is pinned as a human on an idle pad so its CPU brain keeps off.)
    gs.enemies.push({ id: 809, kind: 'duelist', x: gs.ship.x + 120, y: 60, baseY: 60, hp: DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    for (let i = 0; i < 120; i++) { step(gs, {}, {}); gs.ship.inv = 999999; if (gs.wing) gs.wing.inv = 999999; gs.events.length = 0 }
    const e = gs.enemies.find((x) => x.kind === 'duelist')
    r.check('#2934 the duel takes the nearer hull (S4 decoy law generalises to the hunter)',
        e && Math.abs(e.y - gs.wing.y) < Math.abs(e.y - gs.ship.y),
        `duelist y=${e ? e.y.toFixed(1) : 'gone'} wing y=${gs.wing.y.toFixed(0)} seat1 y=${gs.ship.y.toFixed(0)}`)
}

{ // hash: the duel is sim truth — presence moves the hash, replay matches it
    const a = makeGame(10), b = makeGame(10)
    for (let i = 0; i < 30; i++) { step(a, {}); step(b, {}); a.events.length = 0; b.events.length = 0 }
    a.enemies.push({ id: 810, kind: 'duelist', x: a.ship.x + 110, y: 120, baseY: 120, hp: DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    const hClean = stateHash(a)
    step(a, {}); step(b, {})
    const hDuel = stateHash(a)
    r.check('#2934 hash: a hunter on the field is sim truth (the hash moves, both clocks still match shape)',
        hClean !== hDuel && typeof hDuel === 'number' && hDuel >>> 0 === hDuel,
        `${hClean} -> ${hDuel}`)
}

{ // the autopilot fights its duel: it walks the lane while a hunter holds the
    // field (standing still in front of a tracker is a self-aiming gift)
    const gs = makeGame(11)
    gs.ship.inv = 999999
    gs.enemies.length = 0
    gs.ship.y = 120
    gs.enemies.push({ id: 811, kind: 'duelist', x: gs.ship.x + 110, y: 120, baseY: 120, hp: DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    const p = autopilot(gs)
    r.check('#2934 the autopilot walks the duel: a hunter in the lane buys a moving pilot',
        (p.up || p.down) === true, `up=${p.up} down=${p.down}`)
}

// --------------------------------------- the duel on steel (#2938, #2808-S5) ---
{ // armour reads: the slab refuses the duel too — the hunter is shoved clear of
    // the plate it reaches over and cries on the steel; it never ghost-rides a
    // slab with its wings through the armour (the #2934 read that looked a bug)
    const gs = makeGame(7)
    gs.ship.inv = 999999
    gs.ship.y = 140
    gs.enemies.length = 0
    const s = { id: 901, kind: 'hullseg', x: gs.ship.x + 60, y0: FIELD_TOP, y1: 110, len: 160 }
    gs.enemies.push(s)
    gs.enemies.push({ id: 902, kind: 'duelist', x: gs.ship.x + 120, y: 60, baseY: 60, hp: DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    let ghosts = 0, cried = 0
    for (let i = 0; i < 120; i++) {
        step(gs, {})
        if (gs.events.includes('duelgrind')) cried++
        gs.events.length = 0
        const e = gs.enemies.find((x) => x.kind === 'duelist')
        if (!e) break
        if (e.x + 7 > s.x && e.x - 7 < s.x + s.len && e.y > s.y0 - 5 && e.y < s.y1 + 5) ghosts++
    }
    const alv = gs.enemies.find((x) => x.kind === 'duelist')
    r.check('#2938 armour reads: the slab refuses the duel — shoved to the lip, a cry on the steel, never a ghost through the plate',
        cried >= 1 && ghosts === 0 && !!alv && (alv.y <= s.y0 - 5 || alv.y >= s.y1 + 5), `cried=${cried} ghosts=${ghosts}`)
}

{ // grind, edge, or grave — and here it is the edge: a committed pass that meets
    // armour is SPENT on the face, and the plate becomes cover (not being behind
    // it is the dodge the duel teaches, made physical)
    const gs = makeGame(5)
    gs.ship.inv = 999999
    gs.ship.y = 140
    gs.enemies.length = 0
    const s = { id: 903, kind: 'hullseg', x: gs.ship.x + 30, y0: FIELD_TOP, y1: 130, len: 24 }
    gs.enemies.push(s)
    gs.enemies.push({ id: 904, kind: 'duelist', x: gs.ship.x + 140, y: 60, baseY: 60, hp: DUEL.hp, t: DUEL.commitAt, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    let cried = false, spent = false, passed = false, lives0 = gs.lives
    for (let i = 0; i < 220; i++) {
        step(gs, {})
        if (gs.events.includes('duelgrind')) cried = true
        gs.events.length = 0
        const e = gs.enemies.find((x) => x.kind === 'duelist')
        if (!e) { spent = true; break }
        if (e.x < gs.ship.x + 24) { passed = true; break } // it reached the pilot — the plate was not cover
    }
    r.check('#2938 the pass burns: a dash into armour dies on the face and never reaches the hull behind it — the plate is cover',
        cried && spent && !passed && gs.lives === lives0, `cried=${cried} spent=${spent} passed=${passed}`)
}

{ // its own round: the duelist's aimed shot is a dart of its own (sim marker —
    // the art draws it crimson hull-red, but the identity is sim truth)
    const gs = makeGame(6)
    gs.ship.inv = 999999
    gs.enemies.length = 0
    gs.enemies.push({ id: 905, kind: 'duelist', x: gs.ship.x + 110, y: 120, baseY: 120, hp: DUEL.hp, t: 0, cd: 4, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    let atFire = -1
    for (let i = 0; i < 40; i++) {
        step(gs, {})
        if (gs.events.includes('duelfire')) atFire = gs.bullets.filter((b) => b.dart).length
        gs.events.length = 0
    }
    r.check('#2938 the duel fires its own round: every duelfire looses a dart-marked bullet (the eye reads the gun)',
        atFire === 1, `darts-at-fire=${atFire}`)
}

{ // the release announces itself: the crouch ends in light, not a whisper —
    // flashT burns at the commit so the art can flash the nose at the release
    const gs = makeGame(8)
    gs.ship.inv = 999999
    gs.enemies.length = 0
    gs.enemies.push({ id: 906, kind: 'duelist', x: gs.ship.x + 110, y: 120, baseY: 120, hp: DUEL.hp, t: DUEL.commitAt, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    let peak = 0
    for (let i = 0; i < DUEL.windup + 12; i++) {
        step(gs, {})
        const e = gs.enemies.find((x) => x.kind === 'duelist')
        if (e && e.state === 'dash') peak = Math.max(peak, e.flashT || 0)
        gs.events.length = 0
    }
    r.check('#2938 the release flash: the dash is born in light (flashT > 0 at the commit, burning brief)',
        peak >= 5, `flashT peak=${peak}`)
}

{ // the bridgehead fields its duel: the leg-3 script fires at camX 200 — mid-run,
    // before the tank's lock at 340, so the stage closes the way it opened
    const gs = makeGame(9)
    gs.ship.inv = 999999
    gs.leg = 3
    gs.schedule = WAVES3.map((w, i) => ({ ...w, idx: 70 + i, fired: false }))
    gs.camX = 190
    let firedAt = -1
    for (let i = 0; i < 40 && firedAt < 0; i++) {
        step(gs, {})
        if (gs.enemies.some((e) => e.kind === 'duelist')) firedAt = Math.round(gs.camX)
        gs.events.length = 0
    }
    r.check('#2938 the bridgehead duels: leg 3 fields its hunter at camX 200 — authored, before the tank lock',
        firedAt >= 200 && firedAt <= 210, `fired at camX ${firedAt}`)
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

// ------------------------------------------------------- #2937 carrier bay ---
// THE STING — carriers answer back. A live hit on the bit ferry looses one
// committed interceptor at the hull that made it: no swarm (the bay cycles),
// no tracking (the dodge is movement), no launch from the grave (the wreck
// only spills cargo), zero rng, and both brains read the line before it arrives.
{ // the answer law: the hit that leaves it alive spits exactly one dart, aimed
    const gs = makeGame(1)
    gs.ship.inv = 999999
    gs.enemies.push({ id: 901, kind: 'bitpod', x: gs.ship.x + 120, y: 120, baseY: 120, bob: 0,
        hp: 7, n: 2, vx: 0, inv: 0, anim: 0, holdT: 999, stingCd: 0, anchorX: gs.ship.x + 120, state: 'hold' })
    let launchAt = -1, st = null, aim = null
    for (let i = 0; i < 40 && launchAt < 0; i++) {
        gs.shots.push({ id: 1000 + i, x: gs.ship.x + 12, y: 120, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 })
        step(gs, {})
        if (launchAt < 0 && gs.events.includes('sting')) {
            launchAt = i
            st = gs.enemies.find((e) => e.kind === 'sting')
            // the honest aim read: the velocity is parallel to the muzzle→hull
            // vector THIS tick (the carrier bobs, so the line is rarely flat)
            const ddx = gs.ship.x - st.x, ddy = gs.ship.y - st.y
            aim = st.vx * ddy - st.vy * ddx // cross product: 0 = aimed true
        }
        gs.events.length = 0
        gs.ship.inv = 999999
    }
    const car = gs.enemies.find((e) => e.kind === 'bitpod')
    r.check('#2937 answer law: a live hit on the carrier looses exactly one sting, aimed at the pilot, and the bay starts its cycle',
        launchAt >= 0 && st && gs.enemies.filter((e) => e.kind === 'sting').length === 1 &&
        Math.abs(Math.hypot(st.vx, st.vy) - STING.speed) < 1e-6 && st.vx < 0 && Math.abs(aim) < 1e-6 &&
        car && car.stingCd === STING.cd,
        `launched@+${launchAt} cross=${aim === null ? 'n/a' : aim.toExponential(2)} cd=${car ? car.stingCd : 'gone'}`)
}

{ // the bay cycles: two hits inside the cooldown still answer once; the cooldown
    // expiring lets the next hit through. A vulcan stream gets darts, not a swarm.
    const gs = makeGame(2)
    gs.ship.inv = 999999
    gs.enemies.push({ id: 902, kind: 'bitpod', x: gs.ship.x + 100, y: 100, baseY: 100, bob: 0,
        hp: 7, n: 2, vx: 0, inv: 0, anim: 0, holdT: 999, stingCd: 0, anchorX: gs.ship.x + 100, state: 'hold' })
    let launched = 0, shots = 0
    for (let i = 0; i < 130; i++) {
        if (i === 0 || i === 8 || i === STING.cd + 20) gs.shots.push({ id: 2000 + (shots++), x: gs.ship.x + 12, y: 100, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 })
        step(gs, {})
        if (gs.events.includes('sting')) launched++
        gs.events.length = 0
        gs.ship.inv = 999999
    }
    r.check('#2937 cycle law: hits inside the bay cooldown answer once, and the cooled bay answers again (hp 7 — three hits, two darts)',
        launched === 2 && gs.enemies.some((e) => e.kind === 'bitpod'),
        `sting events=${launched} (want 2) carrier alive=${gs.enemies.some((e) => e.kind === 'bitpod')}`)
}

{ // the kill shot looses nothing but cargo — the wreck law (#2835) stands untouched
    const gs = makeGame(3)
    gs.ship.inv = 999999
    gs.enemies.push({ id: 903, kind: 'bitpod', x: gs.ship.x + 100, y: 140, baseY: 140, bob: 0,
        hp: 1, n: 2, vx: 0, inv: 0, anim: 0, holdT: 999, stingCd: 0, anchorX: gs.ship.x + 100, state: 'hold' })
    let launched = 0, free = false
    for (let i = 0; i < 40 && !(launched === 0 && free); i++) {
        if (i === 0) gs.shots.push({ id: 3000, x: gs.ship.x + 12, y: 140, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 })
        step(gs, {})
        if (gs.events.includes('sting')) launched++
        if (gs.events.includes('bitfree')) free = true
        gs.events.length = 0
        gs.ship.inv = 999999
    }
    r.check('#2937 the kill shot spills cargo only: a dying carrier looses no interceptor (wreck law stands)',
        launched === 0 && free && !gs.enemies.some((e) => e.kind === 'bitpod') && gs.caps.filter((c) => c.type === 'bit').length === 2,
        `launched=${launched} bitfree=${free} cargo=${gs.caps.filter((c) => c.type === 'bit').length}`)
}

{ // committed line: aimed at launch, never retargeted — leave the lane and it misses
    const gs = makeGame(4)
    gs.ship.inv = 999999
    gs.enemies.push({ id: 904, kind: 'sting', x: gs.ship.x + 90, y: gs.ship.y, vx: -STING.speed, vy: 0, hp: STING.hp, t: 0, inv: 0, anim: 0 })
    for (let i = 0; i < 40; i++) { step(gs, { down: true }); gs.events.length = 0; gs.ship.inv = 999999 }
    const st = gs.enemies.find((e) => e.kind === 'sting')
    const gap = st ? Math.abs(st.y - gs.ship.y) : 999
    r.check('#2937 committed line: the dart never turns to follow — step off the aim line and it sails past',
        st && st.vy === 0 && gap > 30, `vy=${st ? st.vy : 'gone'} lane-gap=${gap.toFixed(0)}`)
}

{ // soft airframe: one vulcan pays for the answer — turret money
    const gs = makeGame(5)
    gs.ship.inv = 999999
    gs.enemies.push({ id: 905, kind: 'sting', x: gs.ship.x + 110, y: 120, vx: -STING.speed, vy: 0, hp: STING.hp, t: 0, inv: 0, anim: 0 })
    let boom = false
    const sc0 = gs.score
    for (let i = 0; i < 40 && !boom; i++) {
        gs.shots.push({ id: 4000 + i, x: gs.ship.x + 12, y: 120, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 })
        step(gs, {})
        if (gs.events.includes('boom')) boom = true
        gs.events.length = 0
        gs.ship.inv = 999999
    }
    r.check('#2937 soft airframe: exactly one vulcan round folds the sting, for turret money',
        boom && gs.score - sc0 === STING.score && !gs.enemies.some((e) => e.kind === 'sting'),
        `boom=${boom} score+${gs.score - sc0} (want ${STING.score})`)
}

{ // the answer hurts: a dart riding its line kills the hull that stands in it
    const gs = makeGame(6)
    const lives0 = gs.lives
    gs.ship.inv = 0 // no i-frames: the law is that the body hurts
    gs.enemies.push({ id: 906, kind: 'sting', x: gs.ship.x + 30, y: gs.ship.y, vx: -STING.speed, vy: 0, hp: STING.hp, t: 0, inv: 0, anim: 0 })
    let died = false
    for (let i = 0; i < 30 && !died; i++) { step(gs, {}); died = gs.ship.dead || gs.dyingT > 0; gs.events.length = 0 }
    r.check('#2937 the answer hurtS: a sting down its line kills the hull that never moved off it',
        died && gs.lives === lives0 - 1, `died=${died} lives ${lives0}->${gs.lives}`)
}

{ // the pilot's brain knows the answer: the autopilot steps off the aimed line —
    // and the same world WITHOUT the dart keeps the stick home, so the dodge is
    // the sting's doing, not lane bookkeeping.
    const mk = (withSting) => {
        const gs = makeGame(7)
        gs.ship.inv = 999999
        if (withSting) gs.enemies.push({ id: 907, kind: 'sting', x: gs.ship.x + 40, y: gs.ship.y, vx: -STING.speed, vy: 0, hp: STING.hp, t: 0, inv: 0, anim: 0 })
        return autopilot(gs)
    }
    const a = mk(true), b = mk(false)
    r.check('#2937 the autopilot reads the committed line and leaves its lane — same world, no dart, stick home (docs/AI.md)',
        a.up === true && a.down === false && b.up === false && b.down === false,
        `with sting: up=${a.up} down=${a.down}; without: up=${b.up} down=${b.down}`)
}

{ // zero rng: the answer is arithmetic — same pads, different seeds, same launch
    const mk = (seed) => {
        const gs = makeGame(seed)
        gs.ship.inv = 999999
        gs.enemies.push({ id: 908, kind: 'bitpod', x: gs.ship.x + 120, y: 120, baseY: 120, bob: 0,
            hp: 7, n: 2, vx: 0, inv: 0, anim: 0, holdT: 999, stingCd: 0, anchorX: gs.ship.x + 120, state: 'hold' })
        let at = null, v = null
        for (let i = 0; i < 40 && !at; i++) {
            gs.shots.push({ id: 5000 + i, x: gs.ship.x + 12, y: 120, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 })
            step(gs, {})
            if (gs.events.includes('sting')) {
                at = gs.tick
                const st = gs.enemies.find((e) => e.kind === 'sting')
                v = { x: st.x, y: st.y, vx: st.vx, vy: st.vy }
            }
            gs.events.length = 0
            gs.ship.inv = 999999
        }
        return { at, v }
    }
    const a = mk(7), b = mk(23)
    r.check('#2937 zero rng: seed 7 and seed 23 are answered at the same tick, same place, same velocity',
        a.at !== null && a.at === b.at && JSON.stringify(a.v) === JSON.stringify(b.v),
        `A=${JSON.stringify(a)} B=${JSON.stringify(b)}`)
}

{ // sim truth: the dart rides the hash — a field with a sting in flight is not
    // the same state as one without (replays, RL and the autopilot all see it)
    const gs = makeGame(8)
    gs.enemies.push({ id: 909, kind: 'sting', x: gs.ship.x + 70, y: gs.ship.y, vx: -STING.speed, vy: 0, hp: STING.hp, t: 0, inv: 0, anim: 0 })
    const h1 = stateHash(gs)
    gs.enemies.pop()
    const h2 = stateHash(gs)
    r.check('#2937 sim truth: a sting in the field changes stateHash (the answer is world truth, not paint)',
        h1 !== h2, `${h1} vs ${h2}`)
}

// ------------------------------------------- #2951 volley pre-dodge & the sign ---
{ // The fortress fan flies straight once loosed. Three laws, one per layer:
    // the rounds carry the mark; the lane field reads straight fire at all
    // (it never did — the crossing numerator was inverted since S1, so every
    // consider(t>0) saw a negative time and the brain was blind to bullets);
    // and the fan slip steps off the aim line without quitting the vent.
    const p2Stub = (gs) => ({
        x: gs.ship.x + 120, dyingT: 0, port: 0, swayOff: 0, flashT: 0,
        cores: [{ hp: 60, max: 8, mouth: 'closed', mouthT: 999, enraged: false },
            { hp: 60, max: 8, mouth: 'closed', mouthT: 999, enraged: false }],
        at: gs.tick,
    })

    // 1. the tag: a live salvo leaves the face marked, three rounds. (The
    // cycle starts at spawn, so wait for the dock — an off-screen fan's rounds
    // die at the screen cull; the marked fan is the one that reaches the yard.)
    const gs = makeGame(7)
    gs.ship.inv = 999999
    gs.leg = 2; gs.camX = STAGE_END2; gs.legAt = gs.tick
    step(gs, {}); gs.events.length = 0 // the fortress arrives
    for (let t = 0; t < 400 && gs.p2.x > gs.p2.targetX + 0.5; t++) { step(gs, {}); gs.events.length = 0 } // dock
    let marked = -1
    for (let t = 0; t < 900 && marked < 0; t++) {
        step(gs, {})
        if (gs.events.includes('p2salvo')) marked = gs.bullets.filter((b) => b.volley).length
        gs.events.length = 0
    }
    r.check('#2951 the fan carries its mark: the volley leaves the face tagged, three rounds',
        marked === 3, `tagged=${marked}`)

    // 2. ROOT FIX — the lane field reads straight fire: a round dead ahead
    // buys a lane change; the same world with no round buys none. (Pre-fix
    // the inverted sign made t negative for every round ahead — the scan
    // considered nothing and the pilot survived only on strafe luck.)
    const sens = (withRound) => {
        const g = makeGame(3)
        g.enemies.length = 0; g.bullets.length = 0
        if (withRound) g.bullets.push({ id: 1, x: g.ship.x + 30, y: 120, vx: -1.35, vy: 0 })
        const p = autopilot(g)
        return p.up !== p.down
    }
    r.check('#2951 the lane field reads straight fire — a round dead ahead buys a lane change, the same world bare buys none',
        sens(true) && !sens(false), `with=${sens(true)} without=${sens(false)}`)

    // 3. the slip reads the volley beyond the plain window: a volley crossing
    // the pilot's station at ~67 ticks is invisible to the 40-tick field —
    // yet the pilot must already be leaving the line. Untagged, same world,
    // the pilot holds: the tag is what the slip trusts.
    const slipFix = (tag) => {
        const g = makeGame(3)
        g.enemies.length = 0; g.bullets.length = 0
        g.p2 = p2Stub(g)
        const b = { id: 2, x: g.ship.x + 120, y: g.ship.y + 2, vx: -1.35, vy: 0 }
        if (tag) b.volley = 1
        g.bullets.push(b)
        return autopilot(g)
    }
    const sT = slipFix(true), sU = slipFix(false)
    r.check('#2951 the slip senses the fan through the plain window — a volley 67 ticks out moves the pilot, an untagged round does not',
        (sT.up || sT.down) && !(sU.up || sU.down), `tagged up=${sT.up} dn=${sT.down} / bare up=${sU.up} dn=${sU.down}`)

    // 4. the slip is a drift, not a duck: the trigger stays down — the
    // stream keeps working the face while the hull leaves the aim line.
    r.check('#2951 the slip keeps the stream — the trigger stays down through the dodge',
        sT.a === true, `a=${sT.a}`)

    // 5. the slip self-limits: a hand's width off the line is already the
    // gap between the fan's rounds — 12 px buys clearance from all three.
    const g5 = makeGame(3)
    g5.enemies.length = 0; g5.bullets.length = 0
    g5.p2 = p2Stub(g5)
    g5.ship.y = 132 // the volley will cross at 120: twelve clear already — the gap
    g5.bullets.push({ id: 3, x: g5.ship.x + 120, y: 120, vx: -1.35, vy: 0, volley: 1 })
    const p5 = autopilot(g5)
    r.check('#2951 the slip self-limits — twelve pixels off the line is the gap, and the pilot holds there',
        !(p5.up || p5.down), `up=${p5.up} dn=${p5.down}`)

    // 6. direction: slip AWAY from the crossing point, both ways.
    const dirFix = (below) => {
        const g = makeGame(3)
        g.enemies.length = 0; g.bullets.length = 0
        g.p2 = p2Stub(g)
        g.ship.y = 120
        g.bullets.push({ id: 4, x: g.ship.x + 120, y: below ? 126 : 114, vx: -1.35, vy: 0, volley: 1 })
        const p = autopilot(g)
        return { up: p.up, down: p.down }
    }
    const dBelow = dirFix(true), dAbove = dirFix(false)
    r.check('#2951 the slip leaves the line the round crosses — below buys up, above buys down',
        dBelow.up && !dBelow.down && dAbove.down && !dAbove.up,
        `below ${JSON.stringify(dBelow)} above ${JSON.stringify(dAbove)}`)

    // 7. end to end: a pilot who sits on the throat while the port cycles
    // survives its fan at bare knuckles — the round crosses an empty line.
    const g7 = makeGame(7)
    g7.leg = 2; g7.camX = STAGE_END2; g7.legAt = g7.tick
    g7.ship.inv = 999999 // grace through the teleport and the walk-in
    step(g7, {}); g7.events.length = 0
    g7.p2.cores.forEach((c) => { c.hp = 60 }) // hearts that outlive the test
    for (let t = 0; t < 800 && (g7.p2.x > g7.p2.targetX + 0.5 || g7.ship.x - g7.camX < 40); t++) { g7.enemies.length = 0; g7.ship.inv = 999999; step(g7, autopilot(g7)); g7.events.length = 0 } // dock, grace on, pilot flies to station
    g7.enemies.length = 0; g7.bullets.length = 0; g7.missiles.length = 0; g7.ship.inv = 0 // no guns but the heart, bare knuckles from here
    let fireTick = -1, fireY = -1
    for (let t = 0; t < 900 && fireTick < 0; t++) {
        g7.enemies.length = 0; g7.missiles.length = 0
        step(g7, autopilot(g7))
        if (g7.events.includes('p2salvo')) { fireTick = g7.tick; fireY = g7.ship.y }
        g7.events.length = 0
    }
    let grazed = false
    for (let t = 0; t < 110 && fireTick >= 0; t++) {
        const lv = g7.lives
        const s = g7.ship
        g7.enemies.length = 0; g7.missiles.length = 0
        step(g7, autopilot(g7))
        if (g7.lives < lv) grazed = true
        for (const b of g7.bullets) if (b.volley && Math.abs(b.x - s.x) < 5 && Math.abs(b.y - s.y) < 4) grazed = true
        g7.events.length = 0
    }
    r.check('#2951 the fan crosses an empty line — a pilot at bare knuckles sits the throat and lives',
        fireTick >= 0 && !grazed && g7.lives === 3, `fire@${fireTick} fireY=${Math.round(fireY)} grazed=${grazed} lives=${g7.lives}`)

    // 8. seat two reads it too (docs/AI.md: a lane a brain must dodge has to
    // be sensed by that brain).
    const g8 = makeGame(11)
    enableCoop(g8)
    g8.enemies.length = 0; g8.bullets.length = 0
    if (g8.wing) g8.wing.out = false
    g8.p2 = p2Stub(g8)
    const wRound = (tag) => {
        g8.bullets.length = 0
        const b = { id: 5, x: g8.wing.x + 120, y: g8.wing.y + 2, vx: -1.35, vy: 0 }
        if (tag) b.volley = 1
        g8.bullets.push(b)
        const p = wingBrain(g8)
        return p.up !== p.down
    }
    r.check('#2951 seat two slips the fan too — the wing leaves the volley line, and holds when the round carries no mark',
        wRound(true) && !wRound(false), `tagged=${wRound(true)} bare=${wRound(false)}`)
}

// ------------------------- #2952 the dodge pays & the wingman's cover-fire ---
// Two wants left over from #2938: a slipped duelist pass pays nothing, and
// wingBrain ignores a hunter committed at its partner. The dodge pays the
// near-miss (defender-era: score the pass you beat, keyed to closest
// approach — paid only when the pass dies off-screen untouched; steel- and
// hull-spent passes stay unpaid); cover-fire lays a hot lane at the hunter
// the moment it commits at seat one. Zero rng on both.
{ // the dodge pays: walk off the line through the graze band and the pass banks the bonus at its death
    const gs = makeGame(1)
    gs.enemies.length = 0; gs.bullets.length = 0; gs.missiles.length = 0; gs.schedule.length = 0
    gs.ship.inv = 0 // a naked hull — the ledger only counts passes dodged with skin in the game
    gs.ship.y = 120
    gs.enemies.push({ id: 951, kind: 'duelist', x: gs.ship.x + 110, y: 120, baseY: 120, hp: DUEL.hp, t: DUEL.commitAt - 1, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    const s0 = gs.score
    let sawWarn = false, sinceWarn = -1, grazed = false, ann = false, died = false
    for (let i = 0; i < 500 && !(grazed && !gs.enemies.some((e) => e.kind === 'duelist')); i++) {
        step(gs, { up: sinceWarn >= 0 && sinceWarn < 6, down: false, left: false, right: gs.ship.x - gs.camX < 52, a: false, b: false }) // hold station; a hand's width off the line, then hold
        if (gs.events.includes('warn')) { sawWarn = true; sinceWarn = 0 } else if (sinceWarn >= 0) sinceWarn++
        if (gs.events.includes('duelgraze')) { grazed = true; ann = gs.grazeAnn > 0 }
        if (gs.ship.dead) { died = true; break }
        gs.events.length = 0
    }
    r.check('#2952 the dodge pays: a pass beaten through the graze band banks its bonus as it dies off-screen (event + wink, no death)',
        sawWarn && grazed && ann && !died && gs.score - s0 === DUEL.grazeScore,
        `warn=${sawWarn} grazed=${grazed} ann=${ann} died=${died} d=${gs.score - s0}`)
}
{ // the band is honest: a wide escape is not a graze, and a hit is never one
    const wide = makeGame(2)
    wide.enemies.length = 0; wide.bullets.length = 0; wide.missiles.length = 0; wide.schedule.length = 0
    wide.ship.y = 120
    wide.enemies.push({ id: 952, kind: 'duelist', x: wide.ship.x + 110, y: 120, baseY: 120, hp: DUEL.hp, t: DUEL.commitAt - 1, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    const w0 = wide.score
    let wGrazed = false, wSince = -1
    for (let i = 0; i < 500; i++) {
        step(wide, { up: wSince >= 0, down: false, left: false, right: wide.ship.x - wide.camX < 52, a: false, b: false }) // hold station and run for the rail — no near miss in it
        if (wide.events.includes('warn')) { wSince = 0 } else if (wSince >= 0) wSince++
        if (wide.events.includes('duelgraze')) wGrazed = true
        if (wide.ship.dead) break
        wide.events.length = 0
        if (!wide.enemies.some((e) => e.kind === 'duelist')) break
    }
    const hit = makeGame(3)
    hit.enemies.length = 0; hit.bullets.length = 0; hit.missiles.length = 0
    hit.ship.y = 120
    hit.enemies.push({ id: 953, kind: 'duelist', x: hit.ship.x + 110, y: 120, baseY: 120, hp: DUEL.hp, t: DUEL.commitAt - 1, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    const h0 = hit.score
    let hGrazed = false
    for (let i = 0; i < 500; i++) {
        step(hit, {}) // stand in the solution — this one you do not walk away from
        if (hit.events.includes('duelgraze')) hGrazed = true
        hit.events.length = 0
        if (hit.ship.dead && !hit.enemies.some((e) => e.kind === 'duelist')) break
    }
    r.check('#2952 the band is honest: a wide escape pays nothing (over the graze), a connected pass pays nothing (the spend is the pass)',
        !wGrazed && wide.score === w0 && !wide.ship.dead && !hGrazed && hit.ship.dead && hit.score === h0,
        `wide=${wGrazed}/${wide.score - w0} hit=${hGrazed}/${hit.score - h0} died=${hit.ship.dead}`)
}
{ // steel stays unpaid (#2938 law untouched): the burn-off that cries on the plate must not hand out dodge money
    const gs = makeGame(5)
    gs.ship.inv = 999999
    gs.ship.y = 140
    gs.enemies.length = 0; gs.bullets.length = 0; gs.missiles.length = 0
    gs.enemies.push({ id: 903, kind: 'hullseg', x: gs.ship.x + 30, y0: FIELD_TOP, y1: 130, len: 24 })
    gs.enemies.push({ id: 904, kind: 'duelist', x: gs.ship.x + 140, y: 60, baseY: 60, hp: DUEL.hp, t: DUEL.commitAt, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
    const s0 = gs.score
    let cried = false, grazed = false
    for (let i = 0; i < 300; i++) {
        step(gs, {})
        if (gs.events.includes('duelgrind')) cried = true
        if (gs.events.includes('duelgraze')) grazed = true
        gs.events.length = 0
        if (!gs.enemies.some((e) => e.kind === 'duelist')) break
    }
    r.check('#2952 steel stays unpaid: a pass burned on a plate cries on the steel but banks no dodge bonus',
        cried && !grazed && gs.score === s0, `cried=${cried} grazed=${grazed} d=${gs.score - s0}`)
}
{ // cover-fire: a hunter committed at seat one buys fire from seat two even
    // when seat two's own lane is too hot to shoot into — and only seat one
    // buys it (partner down, the wing keeps its discipline)
    const gs = makeGame(4)
    enableCoop(gs)
    gs.enemies.length = 0; gs.bullets.length = 0; gs.missiles.length = 0; gs.caps.length = 0
    if (!gs.wing) throw new Error('coop seat missing')
    gs.wing.weapon = 'wave' // a charged gun only fires when its lane breathes — the gate cover-fire must beat
    gs.bullets.push({ id: 3, x: gs.wing.x + 25, y: gs.wing.y + 2, vx: -1.35, vy: 0 }) // the wing's lane is hot
    const bare = wingBrain(gs).a
    gs.enemies.push({ id: 955, kind: 'duelist', x: gs.ship.x + 110, y: 100, baseY: 100, hp: DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'windup', stateT: 40, inv: 0, anim: 0 })
    const covering = wingBrain(gs).a
    const leaning = wingBrain(gs).up !== wingBrain(gs).down // the stream edges toward the threat's line
    gs.ship.dead = 1 // seat one down: there is no partner left to cover
    const alone = wingBrain(gs).a
    gs.ship.dead = 0
    gs.enemies.length = 0
    const quiet = wingBrain(gs).a // no commitment: the hot-lane discipline stands again
    r.check('#2952 cover-fire: a duelist committed within reach of seat one buys the wing its shot on a hot lane — the wing fires, leans toward the hunter, and stays disciplined when no one is threatened',
        !bare && covering && leaning && !alone && !quiet, `bare=${bare} covering=${covering} lean=${leaning} alone=${alone} quiet=${quiet}`)
}
{ // covering fire never parks the wing in the pass it answers: the risk field
    // keeps its authority through the lean — the pair survives the coverage
    let allLived = true
    for (const seed of [1, 2, 3, 4]) {
        const gs = makeGame(seed)
        enableCoop(gs)
        gs.enemies.length = 0; gs.bullets.length = 0; gs.missiles.length = 0; gs.schedule.length = 0
        if (gs.wing) gs.wing.out = false
        gs.enemies.push({ id: 950 + seed, kind: 'duelist', x: gs.ship.x + 110, y: 120, baseY: 120, hp: DUEL.hp, t: DUEL.commitAt - 1, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
        for (let i = 0; i < 700; i++) {
            step(gs, autopilot(gs)) // both seats on their brains, as the attract shows them
            gs.events.length = 0
            if (gs.mode !== 'play') break
        }
        if (gs.ship.dead || gs.ship.out || (gs.wing && (gs.wing.dead || gs.wing.out))) allLived = false
    }
    r.check('#2952 the lean never trades places with the threat: with cover-fire on, both brains still walk the duel alive on seeds 1..4',
        allLived, `allLived=${allLived}`)
}

// ----------------------------------------------------------------- mutant ---
if (MUTANT) {
    const src = readFileSync(SIM, 'utf8')
    const plants = [
        {
            name: 'answer-deaf', // #2937: the ferry goes back to being a sitting duck
            anchor: "if (e.kind === 'bitpod' && e.hp > 0 && !frozen && e.stingCd <= 0) {",
            plant: "if (false /* MUTANT(answer-deaf): the bay stays silent */ && e.hp > 0 && !frozen && e.stingCd <= 0) {",
            harm: async (mod) => {
                const gs = mod.makeGame(11)
                gs.ship.inv = 999999
                gs.enemies.push({ id: 911, kind: 'bitpod', x: gs.ship.x + 120, y: 120, baseY: 120, bob: 0,
                    hp: 7, n: 2, vx: 0, inv: 0, anim: 0, holdT: 999, stingCd: 0, anchorX: gs.ship.x + 120, state: 'hold' })
                let sting = false
                for (let i = 0; i < 40 && !sting; i++) {
                    gs.shots.push({ id: 7000 + i, x: gs.ship.x + 12, y: 120, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 })
                    mod.step(gs, {})
                    if (gs.events.includes('sting')) sting = true
                    gs.events.length = 0
                    gs.ship.inv = 999999
                }
                return sting ? null
                    : 'HARM NAMED: a hit carrier loosed no interceptor — the ferry is a payout box again, and leg 2 lost the arcade beat where the pod fights back'
            },
        },
        {
            name: 'cycle-deaf', // #2937: the bay forgets its cycle — every round answers
            anchor: "!frozen && e.stingCd <= 0) {\n                    launchSting(gs, e); e.stingCd = STING.cd",
            plant: "!frozen) {\n                    launchSting(gs, e); e.stingCd = STING.cd /* MUTANT(cycle-deaf): the bay never cycles */",
            harm: async (mod) => {
                const gs = mod.makeGame(13)
                gs.ship.inv = 999999
                gs.enemies.push({ id: 913, kind: 'bitpod', x: gs.ship.x + 100, y: 100, baseY: 100, bob: 0,
                    hp: 7, n: 2, vx: 0, inv: 0, anim: 0, holdT: 999, stingCd: 0, anchorX: gs.ship.x + 100, state: 'hold' })
                let launched = 0, shots = 0
                for (let i = 0; i < 60; i++) {
                    if (i === 0 || i === 8 || i === 16) gs.shots.push({ id: 7100 + (shots++), x: gs.ship.x + 12, y: 100, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 })
                    mod.step(gs, {})
                    if (gs.events.includes('sting')) launched++
                    gs.events.length = 0
                    gs.ship.inv = 999999
                }
                return launched > 1
                    ? `HARM NAMED: three quick hits loosed ${launched} darts — with no cycle time the ferry is a machine-gun nest, and a vulcan stream is punished with a swarm the cabinet never sent`
                    : null
            },
        },
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
        {
            name: 'panic-deaf',
            anchor: "if (!p1.hot && gs.tick - p1.lockAt >= HEAT_AT) {",
            plant: "if (false && !p1.hot && gs.tick - p1.lockAt >= HEAT_AT) { /* MUTANT(panic-deaf): the dread never learns to panic */",
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                gs.camX = mod.STAGE_END
                gs.enemies.length = 0; gs.bullets.length = 0; gs.missiles.length = 0; gs.ship.inv = 999999
                mod.step(gs, {})
                let events = 0
                for (let t = 0; t < mod.HEAT_AT + 10; t++) {
                    gs.enemies.length = 0; gs.bullets.length = 0; gs.missiles.length = 0; gs.ship.inv = 999999
                    mod.step(gs, {})
                    if (gs.events.includes('hotspeed')) events++
                    gs.events.length = 0
                }
                return gs.p1 && !gs.p1.hot && events === 0
                    ? 'HARM NAMED: the desperation timer never bites — a stalled duel stays stalled forever, and the arcade pressure that punishes dithering at the maw is gone (no hotspeed at lock+1000)'
                    : null
            },
        },
        {
            name: 'tempo-deaf',
            anchor: "p1.mouthT -= p1.hot ? 2 : 1",
            plant: "p1.mouthT -= 1 /* MUTANT(tempo-deaf): the panic latch does nothing to the clock */",
            harm: async (mod) => {
                const mk = (ignite) => {
                    const g = mod.makeGame(7)
                    g.camX = mod.STAGE_END
                    g.enemies.length = 0; g.bullets.length = 0; g.missiles.length = 0; g.ship.inv = 999999
                    mod.step(g, {})
                    if (ignite) g.p1.lockAt = g.tick - mod.HEAT_AT
                    const opens = []
                    for (let t = 0; t < 1400; t++) {
                        g.enemies.length = 0; g.bullets.length = 0; g.missiles.length = 0; g.ship.inv = 999999
                        mod.step(g, {})
                        if (g.events.includes('mawopen')) opens.push(g.tick)
                        g.events.length = 0
                    }
                    return opens.slice(1).map((v, i) => v - opens[i])
                }
                const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
                const cold = mk(false)
                const hot = mk(true)
                return avg(hot) > avg(cold) * 0.72
                    ? `HARM NAMED: the hot core cycles at cold tempo (cold ${avg(cold).toFixed(0)} vs hot ${avg(hot).toFixed(0)} gaps) — the panic became a flag the world ignores`
                    : null
            },
        },
        {
            name: 'hot-leaks',
            anchor: "hot: false, lockAt: gs.tick,",
            plant: "hot: !!gs.cleared, lockAt: gs.tick,",
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                gs.cleared = true // any hull summoned after a clear: the looped dread
                gs.camX = mod.STAGE_END
                gs.enemies.length = 0; gs.bullets.length = 0; gs.missiles.length = 0; gs.ship.inv = 999999
                mod.step(gs, {})
                return gs.p1 && gs.p1.hot === true
                    ? 'HARM NAMED: a rebuilt dreadnought arrives already panicking — desperation is per-hull; leak hot across the loop and loop 2 opens in frenzy, which makes the panic meaningless and the difficulty ramp a lie'
                    : null
            },
        },
        {
            name: 'cold-guns',
            anchor: "return !!(gs.p1 && gs.p1.hot && e.on === 'p1')",
            plant: "return false /* MUTANT(cold-guns): the panic stays in the maw — the ship's own guns never join */",
            harm: async (mod) => {
                const gaps = (ignite) => {
                    const g = mod.makeGame(7)
                    g.camX = mod.STAGE_END
                    g.ship.inv = 999999
                    mod.step(g, {})
                    if (ignite) g.p1.lockAt = g.tick - mod.HEAT_AT
                    const ts = []
                    for (let t = 0; t < 900; t++) {
                        g.bullets.length = 0; g.missiles.length = 0; g.ship.inv = 999999
                        mod.step(g, {})
                        if (g.events.includes('tsfire')) ts.push(g.tick)
                        g.events.length = 0
                    }
                    return ts.slice(1).map((v, i) => v - ts[i])
                }
                const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
                const c = gaps(false), h = gaps(true)
                return avg(h) / Math.max(1, avg(c)) > 0.88
                    ? `HARM NAMED: the hull panics alone — cold ${avg(c).toFixed(0)} vs hot ${avg(h).toFixed(0)} turret gaps — the cabinet's desperation reads as the WHOLE ship getting urgent, and a panic the guns ignore is a flag, not a fight`
                    : null
            },
        },
        {
            name: 'spasm-deaf',
            anchor: "if (heat === HEAT_AT - 60 || heat === HEAT_AT - 40 || heat === HEAT_AT - 20) {",
            plant: "if (false && heat === HEAT_AT - 60) { /* MUTANT(spasm-deaf): the dread never tests its chains before it burns */",
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                gs.camX = mod.STAGE_END
                gs.enemies.length = 0; gs.bullets.length = 0; gs.missiles.length = 0; gs.ship.inv = 999999
                mod.step(gs, {})
                let spasms = 0, latched = false
                for (let t = 1; t <= mod.HEAT_AT + 3; t++) {
                    gs.enemies.length = 0; gs.bullets.length = 0; gs.missiles.length = 0; gs.ship.inv = 999999
                    mod.step(gs, {})
                    if (gs.events.includes('p1spasm')) spasms++
                    if (gs.events.includes('hotspeed')) latched = true
                    gs.events.length = 0
                }
                return latched && spasms === 0
                    ? 'HARM NAMED: the panic arrives with no warning — the dread still latches, but the 940/960/980 hull twitches that tell a watching pilot "it is waking up" are gone; the pressure trick becomes a jump-scare the player can neither read nor anticipate'
                    : null
            },
        },
        {
            name: 'ember-mute',
            anchor: "p1.hotAnn = 60   // #2906: the HUD names the panic for ~1 s",
            plant: "p1.hotAnn = 0   /* MUTANT(ember-mute): the HUD keeps the desperation a dev-panel secret */",
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                gs.camX = mod.STAGE_END
                gs.enemies.length = 0; gs.bullets.length = 0; gs.missiles.length = 0; gs.ship.inv = 999999
                mod.step(gs, {})
                gs.p1.lockAt = gs.tick - mod.HEAT_AT
                mod.step(gs, {})
                return gs.p1.hot && gs.p1.hotAnn === 0
                    ? 'HARM NAMED: the core panics in silence — the rules changed mid-fight and nothing on the player-visible HUD says so; first-timers only learn the maw doubled its tempo by dying to it'
                    : null
            },
        },
        {
            name: 'dobk-blind',
            anchor: "if (!dead && dk && dk.dyingT === 0 && q.x + lance(q) >= dk.x) {",
            plant: "if (false && !dead && dk && dk.dyingT === 0 && q.x + lance(q) >= dk.x) { /* MUTANT(dobk-blind): the tank's hide eats every round */",
            harm: async (mod) => {
                const gs = mod.makeGame(5)
                gs.p1 = null; gs.p2 = null; gs.leg = 3; gs.camX = mod.STAGE_END3; gs.legAt = gs.tick
                mod.step(gs, {}); gs.events.length = 0
                while (gs.dobk.x > gs.dobk.targetX) { mod.step(gs, {}); gs.events.length = 0 }
                gs.ship.inv = 999999; gs.ship.x = gs.camX + 60; gs.ship.y = 100
                for (let t = 0; t < 60; t++) { mod.step(gs, { a: true }); gs.events.length = 0 }
                return gs.dobk.hp === mod.DOBK.hp
                    ? 'HARM NAMED: sixty ticks of vulcan into the slab and the pool never moves — a gate that cannot be hurt is not a gate, it is a wall the stage dies against'
                    : null
            },
        },
        {
            name: 'twin-collapse',
            anchor: "gs.shots.push({ id: gs.nextId++, x: s.x + 12, y: s.y + 2, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 })",
            plant: "gs.shots.push({ id: gs.nextId++, x: s.x + 12, y: s.y - 4, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 }) /* MUTANT(twin-collapse): the pair folds onto one lane */",
            harm: async (mod) => {
                const gs = mod.makeGame(4)
                gs.caps.push({ id: 999, x: gs.ship.x + 6, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'double' })
                mod.step(gs, {}); gs.events.length = 0
                gs.enemies.length = 0; gs.shots.length = 0
                for (let t = 0; t < 6; t++) { mod.step(gs, { a: true }); gs.events.length = 0 }
                const v = gs.shots.filter((q) => q.kind === 'v')
                return v.length === 2 && Math.abs(v[1].y - v[0].y) < 1
                    ? 'HARM NAMED: the D pod arms but the pair collapses onto one lane — the twin stream is a lie, one lane does all the work and Double buys nothing'
                    : null
            },
        },
        {
            name: 'speed-deaf',
            anchor: 'const ms = CFG.shipSpeed + s.spd * CFG.speedStep',
            plant: 'const ms = CFG.shipSpeed + 0 * CFG.speedStep /* MUTANT(speed-deaf): the lift stops reaching the stick */',
            harm: async (mod) => {
                const gs = mod.makeGame(5)
                gs.caps.push({ id: 999, x: gs.ship.x + 6, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'speed' })
                mod.step(gs, {}); gs.events.length = 0
                const x0 = gs.ship.x
                for (let t = 0; t < 10; t++) { mod.step(gs, { right: true }); gs.events.length = 0 }
                return Math.abs((gs.ship.x - x0) - mod.CFG.shipSpeed * 10) < 0.51
                    ? 'HARM NAMED: the S pod sets the flag but the hull never speeds up — a speed-up that never moves the ship is HUD theatre'
                    : null
            },
        },
        {
            name: 'mirror-deaf',
            anchor: "if (o.docked) gs.shots.push({ id: gs.nextId++, x: o.px + 12, y: o.py - 1, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 })",
            plant: "if (false && o.docked) gs.shots.push({ id: gs.nextId++, x: o.px + 12, y: o.py - 1, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 }) /* MUTANT(mirror-deaf): the orbs watch the fight and never answer */",
            harm: async (mod) => {
                const gs = mod.makeGame(4)
                gs.ship.opts = [-1, 1].map((side, i) => ({ id: 10 + i, side, px: gs.ship.x - mod.OPT.back, py: gs.ship.y + side * mod.OPT.gap, docked: true }))
                gs.enemies.length = 0; gs.shots.length = 0
                for (let t = 0; t < 6; t++) { mod.step(gs, { a: true }); gs.events.length = 0 }
                const v = gs.shots.filter((q) => q.kind === 'v').length
                return v <= 1
                    ? 'HARM NAMED: the orbs ride along but never mirror a press — the shield-guns are painted on, and every wall the O pod promised is one round wide'
                    : null
            },
        },
        {
            name: 'opts-leak',
            anchor: "if (s.opts) { s.opts = null; gs.events.push(wing ? 'woptslost' : 'optslost') }",
            plant: "if (false && s.opts) { s.opts = null; gs.events.push(wing ? 'woptslost' : 'optslost') } /* MUTANT(opts-leak): the shield-guns outlive their pilot */",
            harm: async (mod) => {
                const gs = mod.makeGame(6)
                gs.ship.opts = [-1, 1].map((side, i) => ({ id: 10 + i, side, px: gs.ship.x - mod.OPT.back, py: gs.ship.y + side * mod.OPT.gap, docked: true }))
                gs.ship.inv = 0; gs.ship.x = gs.camX
                mod.step(gs, {})
                return gs.ship.opts !== null
                    ? 'HARM NAMED: the hull burned and the orbs stayed — gear that death cannot strip is a discount code on dying, and the power-armour law is uniform in this house'
                    : null
            },
        },
        {
            name: 'half-blind',
            anchor: "if (c.type === 'half') {",
            plant: "if (false && c.type === 'half') { /* MUTANT(half-blind): the H pod forgets how to step down */",
            harm: async (mod) => {
                const gs = mod.makeGame(4)
                gs.ship.weapon = 'laser'
                gs.caps.push({ id: 999, x: gs.ship.x + 6, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'half' })
                mod.step(gs, {})
                return gs.ship.weapon !== 'vulcan'
                    ? 'HARM NAMED: the H pod arms instead of disarming — the capsule that should cool your guns fires them up, and the arcade\u2019s one downgrade trap has become just another prize'
                    : null
            },
        },
        {
            name: 'launch-deaf',
            anchor: 'if (!frozen && sAlive && lPress && s.opts) {',
            plant: 'if (false && !frozen && sAlive && lPress && s.opts) { /* MUTANT(launch-deaf): the throw verb is wired to nothing */',
            harm: async (mod) => {
                const gs = mod.makeGame(4)
                gs.ship.opts = [-1, 1].map((side, i) => ({ id: 10 + i, side, px: gs.ship.x - mod.OPT.back, py: gs.ship.y + side * mod.OPT.gap, docked: true }))
                mod.step(gs, { l: true })
                return gs.ship.opts.every((o) => o.docked && !o.fly)
                    ? 'HARM NAMED: the throw button is dead — a player mashing N at the maw never learns the orb exists as a weapon; the shield is furniture and the arcade\u2019s aggressive option play is gone'
                    : null
            },
        },
        {
            name: 'rearm-deaf',
            anchor: 'if (!os.length) ent.opts = null // the armour is gone; a fresh O pod can arm again',
            plant: 'if (false && !os.length) ent.opts = null // MUTANT(rearm-deaf): spent armour never lets go',
            harm: async (mod) => {
                const gs = mod.makeGame(10)
                gs.ship.opts = [{ id: 1, side: -1, px: gs.ship.x - mod.OPT.back, py: gs.ship.y - mod.OPT.gap, docked: true }]
                mod.step(gs, { l: true }); gs.events.length = 0
                let gone = false
                for (let t = 0; t < 300 && !gone; t++) { gs.bullets.length = 0; gs.missiles.length = 0; gs.ship.inv = 999; gone = gs.ship.opts && gs.ship.opts.length === 0; mod.step(gs, {}) }
                gs.caps.push({ id: 999, x: gs.ship.x + 6, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'options' })
                gs.bullets.length = 0; gs.missiles.length = 0; gs.ship.inv = 999
                mod.step(gs, {})
                return gs.ship.opts && gs.ship.opts.length === 0
                    ? 'HARM NAMED: an emptied mount rack never lets go — the hull haunts the stage with an empty armour slot, and every later O pod pays spare-points instead of re-arming; the throw becomes a permanent self-disarm'
                    : null
            },
        },
        {
            name: 'pursuit-deaf',
            anchor: 'e.y += clamp(tp.y - e.y, -DUEL.track, DUEL.track) // it answers the stick — just slower',
            plant: 'e.y += 0 * clamp(tp.y - e.y, -DUEL.track, DUEL.track) /* MUTANT(pursuit-deaf): the hunter forgets how to hunt */',
            harm: async (mod) => {
                const gs = mod.makeGame(1)
                gs.ship.inv = 999999
                gs.enemies.push({ id: 801, kind: 'duelist', x: gs.ship.x + 140, y: 60, baseY: 60, hp: mod.DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
                gs.ship.y = 160
                for (let i = 0; i < 100; i++) { mod.step(gs, {}); gs.events.length = 0 }
                const e = gs.enemies.find((x) => x.kind === 'duelist')
                return !e || Math.abs(e.y - 60) < 3
                    ? 'HARM NAMED: the hunter holds its lane while the pilot climbs away — the shelf\u2019s one reactive enemy is back to being another scripted drift, and every lane-dodge law taught by the duel goes unlearned'
                    : null
            },
        },
        {
            name: 'commit-deaf',
            anchor: 'if (e.t >= DUEL.commitAt) { e.state = \'windup\'; e.stateT = DUEL.windup; gs.events.push(\'duelwind\') }',
            plant: 'if (false && e.t >= DUEL.commitAt) { e.state = \'windup\'; e.stateT = DUEL.windup; gs.events.push(\'duelwind\') } /* MUTANT(commit-deaf): the duel never ends */',
            harm: async (mod) => {
                const gs = mod.makeGame(8)
                gs.ship.inv = 999999
                gs.enemies.push({ id: 808, kind: 'duelist', x: gs.ship.x + 110, y: 120, baseY: 120, hp: mod.DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
                let saw = ''
                for (let i = 0; i < 420; i++) {
                    mod.step(gs, {})
                    gs.ship.inv = 999999
                    gs.bullets.length = 0
                    const e = gs.enemies.find((x) => x.kind === 'duelist')
                    if (!e) break
                    if (!saw.includes(e.state)) saw += '>' + e.state
                    gs.events.length = 0
                }
                return !saw.includes('>windup')
                    ? 'HARM NAMED: the duel never commits — a hunter that only circles and plinks turns a set-piece into wallpaper; the crouch-and-pass, the moment the pilot must leave the line, is gone'
                    : null
            },
        },
        {
            name: 'duel-ghost', // #2938: the hunter back to riding slabs
            anchor: "if (!(e.x + 7 > s.x && e.x - 7 < s.x + s.len && e.y > s.y0 - 5 && e.y < s.y1 + 5)) continue",
            plant: "if (true /* MUTANT(duel-ghost): the plate means nothing */) continue",
            harm: async (mod) => {
                const gs = mod.makeGame(7)
                gs.ship.inv = 999999
                gs.ship.y = 140
                gs.enemies.length = 0
                const s = { id: 901, kind: 'hullseg', x: gs.ship.x + 60, y0: mod.FIELD_TOP, y1: 110, len: 160 }
                gs.enemies.push(s)
                gs.enemies.push({ id: 902, kind: 'duelist', x: gs.ship.x + 120, y: 60, baseY: 60, hp: mod.DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
                let ghosts = 0
                for (let i = 0; i < 120; i++) {
                    mod.step(gs, {})
                    gs.events.length = 0
                    const e = gs.enemies.find((x) => x.kind === 'duelist')
                    if (!e) break
                    if (e.x + 7 > s.x && e.x - 7 < s.x + s.len && e.y > s.y0 - 5 && e.y < s.y1 + 5) ghosts++
                }
                return ghosts > 0
                    ? `HARM NAMED: the duelist ghosted through armour on ${ghosts} ticks — a hunter parked in a plate with its wings through the steel reads as a rendering bug, and the slab stops being the shared rule it is for shell, orb and hull alike`
                    : null
            },
        },
        {
            name: 'coast-through', // #2938: the committed pass rides through steel
            anchor: "if (e.state === 'dash') {\n                    gs.events.push('duelgrind')",
            plant: "if (false /* MUTANT(coast-through): the pass ignores the plate */ && e.state === 'dash') {\n                    gs.events.push('duelgrind')",
            harm: async (mod) => {
                const gs = mod.makeGame(5)
                gs.ship.inv = 999999
                gs.ship.y = 140
                gs.enemies.length = 0
                gs.enemies.push({ id: 903, kind: 'hullseg', x: gs.ship.x + 30, y0: mod.FIELD_TOP, y1: 130, len: 24 })
                gs.enemies.push({ id: 904, kind: 'duelist', x: gs.ship.x + 140, y: 60, baseY: 60, hp: mod.DUEL.hp, t: mod.DUEL.commitAt, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
                let spentOnPlate = false, passed = false
                for (let i = 0; i < 220; i++) {
                    mod.step(gs, {})
                    const e = gs.enemies.find((x) => x.kind === 'duelist')
                    if (!e) { spentOnPlate = gs.lastHitX > gs.ship.x + 24; break }
                    if (e.x < gs.ship.x + 24) { passed = true; break }
                    gs.events.length = 0
                }
                return passed || !spentOnPlate
                    ? 'HARM NAMED: the committed pass sailed past the plate that should have burned it — armour stops being cover from a hunter, and the dodge the duel teaches (be behind steel) stops paying'
                    : null
            },
        },
        {
            name: 'dart-plain', // #2934's hunter back to spending the turret's ammo
            anchor: "vy: (dyy / m) * 1.3, dart: 1 }) // #2938 its own dart-round",
            plant: "vy: (dyy / m) * 1.3 }) /* MUTANT(dart-plain): the round is generic again */",
            harm: async (mod) => {
                const gs = mod.makeGame(6)
                gs.ship.inv = 999999
                gs.enemies.length = 0
                gs.enemies.push({ id: 905, kind: 'duelist', x: gs.ship.x + 110, y: 120, baseY: 120, hp: mod.DUEL.hp, t: 0, cd: 4, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
                let darts = 0
                for (let i = 0; i < 40; i++) {
                    mod.step(gs, {})
                    if (gs.events.includes('duelfire')) darts = gs.bullets.filter((b) => b.dart).length
                    gs.events.length = 0
                }
                return darts === 0
                    ? 'HARM NAMED: the duelist loosed the generic grey round — the eye cannot read which gun fired without finding the shooter, and the duel telegraph loses the colour-language that separates its lead from the turret chaff'
                    : null
            },
        },
        {
            name: 'flash-deaf', // #2938: the crouch ends in a whisper again
            anchor: "e.flashT = DUEL.flash // #2938 the release flash — the pass announces itself",
            plant: "/* MUTANT(flash-deaf): the release stays dark */",
            harm: async (mod) => {
                const gs = mod.makeGame(8)
                gs.ship.inv = 999999
                gs.enemies.length = 0
                gs.enemies.push({ id: 906, kind: 'duelist', x: gs.ship.x + 110, y: 120, baseY: 120, hp: mod.DUEL.hp, t: mod.DUEL.commitAt, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
                let peak = 0
                for (let i = 0; i < mod.DUEL.windup + 12; i++) {
                    mod.step(gs, {})
                    const e = gs.enemies.find((x) => x.kind === 'duelist')
                    if (e && e.state === 'dash') peak = Math.max(peak, e.flashT || 0)
                    gs.events.length = 0
                }
                return peak < 5
                    ? 'HARM NAMED: the pass launched silent and dark — a 1.75 px/tick commitment with no release flash is invisible at phone scale, and the windup crouch promised a tell it no longer delivers'
                    : null
            },
        },
        {
            name: 'pre-dodge-deaf', // #2951: the fan walks the parked pilot
            anchor: "const slip = p2 && p2.dyingT === 0 ? fanSlip(gs, px, py) : 0",
            plant: "const slip = 0 /* MUTANT(pre-dodge-deaf): the slip is gone, the line is an execution line */",
            harm: async (mod) => {
                const g = mod.makeGame(3)
                g.enemies.length = 0; g.bullets.length = 0
                g.p2 = { x: g.ship.x + 120, dyingT: 0, port: 0, swayOff: 0, flashT: 0,
                    cores: [{ hp: 8, max: 8, mouth: 'closed', mouthT: 999, enraged: false },
                        { hp: 8, max: 8, mouth: 'closed', mouthT: 999, enraged: false }], at: g.tick }
                g.bullets.push({ id: 2, x: g.ship.x + 120, y: g.ship.y + 2, vx: -1.35, vy: 0, volley: 1 })
                const p = mod.autopilot(g)
                return (p.up || p.down) ? null
                    : 'HARM NAMED: the fortress fan walks a parked pilot — with no slip the aim line is the execution line again, and Phase-2 eats what a cabinet pilot side-steps'
            },
        },
        {
            name: 'cross-blind', // #2951: the S1 sign inversion returns — the field goes blind
            anchor: "const t = (b.x - px) / (-b.vx + 0.45)",
            plant: "const t = (px - b.x) / (-b.vx + 0.45) /* MUTANT(cross-blind): the inverted sign returns */",
            harm: async (mod) => {
                const g = mod.makeGame(3)
                g.enemies.length = 0; g.bullets.length = 0
                g.bullets.push({ id: 1, x: g.ship.x + 30, y: 120, vx: -1.35, vy: 0 })
                const p = mod.autopilot(g)
                return (p.up || p.down) ? null
                    : 'HARM NAMED: the crossing sign flips back and the lane field goes blind to straight fire — turret rounds, ricochets and horn all read safe, and every dodge the field owns dies with the sign'
            },
        },
        {
            name: 'graze-blind', // #2952: the near-miss ledger is cut — dodges stop paying
            anchor: "if (e.state === 'dash' && !e.spent && e.near <= DUEL.graze) {",
            plant: "if (false && e.state === 'dash' && !e.spent && e.near <= DUEL.graze) { /* MUTANT(graze-blind): the ledger is cut */",
            harm: async (mod) => {
                const g = mod.makeGame(1)
                g.enemies.length = 0; g.bullets.length = 0; g.missiles.length = 0
                g.ship.y = 120
                g.enemies.push({ id: 951, kind: 'duelist', x: g.ship.x + 110, y: 120, baseY: 120, hp: mod.DUEL.hp, t: mod.DUEL.commitAt - 1, cd: 999999, vx: 0, vy: 0, state: 'hunt', stateT: 0, inv: 0, anim: 0 })
                const s0 = g.score
                let grazed = false, since = -1
                for (let i = 0; i < 500; i++) {
                    mod.step(g, { up: since >= 0 && since < 6, down: false, left: false, right: false, a: false, b: false })
                    if (g.events.includes('warn')) { since = 0 } else if (since >= 0) since++
                    if (g.events.includes('duelgraze')) grazed = true
                    g.events.length = 0
                    if (!g.enemies.some((e) => e.kind === 'duelist') || g.ship.dead) break
                }
                return (!grazed || g.score - s0 !== mod.DUEL.grazeScore)
                    ? 'HARM NAMED: the beaten pass dies unpaid — the defender-era near-miss disappears, and walking off a committed line pays exactly what standing still paid: nothing'
                    : null
            },
        },
        {
            name: 'cover-deaf', // #2952: seat two goes quiet on its partner's duel
            anchor: "if (cover) pad.a = true // #2952 cover-fire: the wing answers a commitment at its partner, lane or no lane",
            plant: "/* MUTANT(cover-deaf): the wing ignores the commitment at its partner */",
            harm: async (mod) => {
                const g = mod.makeGame(4)
                mod.enableCoop(g)
                g.enemies.length = 0; g.bullets.length = 0; g.missiles.length = 0; g.caps.length = 0
                g.wing.weapon = 'wave'
                g.bullets.push({ id: 3, x: g.wing.x + 25, y: g.wing.y + 2, vx: -1.35, vy: 0 })
                g.enemies.push({ id: 955, kind: 'duelist', x: g.ship.x + 110, y: 100, baseY: 100, hp: mod.DUEL.hp, t: 0, cd: 999999, vx: 0, vy: 0, state: 'windup', stateT: 40, inv: 0, anim: 0 })
                return mod.wingBrain(g).a ? null
                    : 'HARM NAMED: the hunter crouches at seat one and seat two holds its fire — the wingman is deaf to its partner\'s duel, and the co-op read the pair was built on goes quiet at the one moment it matters'
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

    // #2925 Options-launch through the shell: a real N press throws the orbs,
    // and the horizon takes them — the rack reports bare
    await page.evaluate(() => window.__game.reset(3))
    await page.waitForTimeout(150)
    await page.evaluate(() => window.__rTest.setup({ giveOptions: true, inv: 999999 }))
    await page.keyboard.press('KeyN')
    await page.waitForTimeout(120)
    const thr = await page.evaluate(() => window.__rTest.probe())
    r.check('#2925 THROW (N) reaches the sim through the shell — the pair leaves the mounts',
        thr.optsFly === 2 && thr.optsDocked === 0, `fly=${thr.optsFly} docked=${thr.optsDocked}`)
    let spentP = thr
    for (let i = 0; i < 40 && spentP.optsFly > 0; i++) {
        await page.waitForTimeout(100)
        spentP = await page.evaluate(() => window.__rTest.probe())
    }
    r.check('#2925 the throw spends itself at the horizon — the mounts report bare',
        spentP.optsFly === 0 && spentP.opts === 0, `fly=${spentP.optsFly} opts=${spentP.opts}`)

    // #2931 the thumb's turn: the phone pad carries THROW as its third action,
    // and a tap on the button itself reaches the sim — the throw is no longer
    // keyboard-only. The pad is the md:hidden query's guest, so the probe sits
    // at phone width (the pad also hides at trusted keyboard input: touch first;
    // the tap is a real pointer sequence on the button element).
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => window.__game.reset(3))
    await page.waitForTimeout(150)
    await page.evaluate(() => window.dispatchEvent(new Event('touchstart')))
    const padHasThrow = await page.evaluate(() =>
        [...document.querySelectorAll('button, div, span')].some((el) => el.textContent?.trim() === 'THROW' && el.getClientRects().length > 0))
    r.check('#2931 the phone pad grows THROW — the throw has a home for thumbs', padHasThrow, `THROW on pad=${padHasThrow}`)
    await page.evaluate(() => window.__rTest.setup({ giveOptions: true, inv: 999999 }))
    const tapped = await page.evaluate(() => {
        const el = [...document.querySelectorAll('button, div, span')].find((e) => e.textContent?.trim() === 'THROW' && e.getClientRects().length > 0)
        if (!el) return 'no-element'
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        return 'tapped'
    })
    await page.waitForTimeout(180)
    const padThr = await page.evaluate(() => window.__rTest.probe())
    r.check('#2931 a THROW tap hurls the pair from the pad — thumbs own the drone now',
        tapped === 'tapped' && padThr.optsFly === 2 && padThr.optsDocked === 0,
        `tap=${tapped} fly=${padThr.optsFly} docked=${padThr.optsDocked}`)
    await page.setViewportSize({ width: 900, height: 760 })

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

    // #2906 ember voice through the shell: at ignition the HUD spells HOT by
    // the score field, and it self-mutes when hotAnn runs out. The leg above
    // ended on game-over and setup early-returns off 'play' — reset first
    // (the #2901 leg reseeds for itself too, so ordering stays safe).
    await page.evaluate(() => window.__game.reset(5))
    await page.waitForTimeout(200)
    await page.evaluate(() => { window.__rTest.setup({ toPhase1: true, inv: 999999 }) })
    await page.evaluate(() => { window.__rTest.setup({ heat: 0 }) })
    let emberPx = 0
    try {
        await page.waitForFunction(() => {
            if (window.__rTest.probe().p1hot !== 1) return false
            window.__emberPx = 0
            const cv = [...document.querySelectorAll('canvas')].find((c) => c.width === 320)
            if (!cv) return false
            const d = cv.getContext('2d').getImageData(120, 8, 18, 7).data
            let n = 0
            for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] > 60 && d[i + 1] < 190 && d[i + 2] < 90) n++
            window.__emberPx = n
            return n >= 10
        }, { timeout: 4000 })
        emberPx = await page.evaluate(() => window.__emberPx)
    } catch {}
    r.check('#2906 the ember voice burns on canvas: HOT appears by the score at ignition', emberPx >= 10, `ember px=${emberPx}`)
    let muted = false
    try {
        await page.waitForFunction(() => {
            if (window.__rTest.probe().p1ann > 0) return false
            const cv = [...document.querySelectorAll('canvas')].find((c) => c.width === 320)
            if (!cv) return false
            const d = cv.getContext('2d').getImageData(120, 8, 18, 7).data
            for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] > 60 && d[i + 1] < 190 && d[i + 2] < 90) return false
            return true
        }, { timeout: 8000 })
        muted = true
    } catch {}
    r.check('#2906 the ember voice self-mutes: HOT is gone once hotAnn runs out', muted, `muted=${muted}`)

    // #2901 desperation through the shell (last — it reseeds): fresh run, set
    // the hull, watch the timer cold, wind it to the mark, see the panic latch.
    await page.evaluate(() => window.__game.reset(4))
    await page.evaluate(() => window.__rTest.setup({ toPhase1: true, inv: 999999 }))
    const coldH = await page.evaluate(() => window.__rTest.probe())
    r.check('#2901 through the shell: the second dreadnought meets the seat cold', coldH.p1hot === 0 && coldH.heat >= 0 && coldH.heat < 60, `hot=${coldH.p1hot} heat=${coldH.heat}`)
    await page.evaluate(() => {
        window.__rTest.setup({ heat: 40 })
        window.__game.step({}, 60)
    })
    const hotH = await page.evaluate(() => window.__rTest.probe())
    r.check('#2901 through the shell: past the mark the hull runs hot, and the hash moves with it',
        hotH.p1hot === 1 && hotH.heat >= 40, `hot=${hotH.p1hot} heat=${hotH.heat}`)

    // #2934 the duel through the shell: the hunter reports through the probe
    // (fixture -> hunt state + loaded gun), and a sustained vulcan stream
    // answers it — the kill is observable, not just a sim number.
    await page.evaluate(() => window.__game.reset(3))
    await page.waitForTimeout(150)
    const dLive = await page.evaluate(() => {
        window.__rTest.setup({ inv: 999999, wingInv: 999999, spawnDuelist: { y: 150 } })
        return window.__rTest.probe()
    })
    r.check('#2934 a duelist enters the fight through the shell — hunt state, loaded gun',
        dLive.duel === 1 && dLive.duelState === 'hunt' && dLive.duelCd > 0,
        `duel=${dLive.duel} state=${dLive.duelState} cd=${dLive.duelCd}`)
    // The kill is driven by contract steps, not wall-clock waits: on software
    // Chrome the rAF chain throttles late in a long leg (the #2906 ember law
    // flakes the same way) — 320 deterministic ticks with the trigger held
    // proves the duel dies the same for the bot and the thumb.
    const dDead = await page.evaluate(() => {
        for (let i = 0; i < 11; i++) window.__game.step({ a: true }, 30)
        window.__rTest.setup({ inv: 999999, wingInv: 999999 })
        return window.__rTest.probe()
    })
    r.check('#2934 sustained fire through the shell folds the hunter — the duel can be won on screen',
        dDead.duel === 0, `duel=${dDead.duel}`)

    // #2938 the duel reads at phone scale, through the shell. All three laws
    // measure the CANVAS at the hunter's own screen coords (duelX/duelY) —
    // sim truth decides the pose, the pixels prove the light.
    await page.evaluate(() => window.__game.reset(3))
    await page.waitForTimeout(150)
    // (a) the warn halo widens ahead of the nose: sample the strip IN FRONT of
    // the cannon while the gun is hot, then cold — the plate of light must be
    // new when cd <= warn, and it must sit where the old 8px halo never reached
    const haloWin = (mode) => page.evaluate((m) => new Promise((res) => {
        const cv = [...document.querySelectorAll('canvas')].find((c) => c.width === 320)
        if (!cv) return res(-1)
        const p = window.__rTest.probe()
        if (p.duel !== 1) return res(-2)
        const d = cv.getContext('2d').getImageData(Math.max(0, p.duelX - 17), Math.max(0, p.duelY - 6), 8, 12).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] >= 150) n++
        res(n)
    }), mode)
    await page.evaluate(() => window.__rTest.setup({ inv: 999999, clearEnemies: true, spawnDuelist: { y: 120, cd: 99 } }))
    let coldPx = 0
    for (let i = 0; i < 20 && coldPx === 0; i++) { coldPx = await haloWin('cold'); if (coldPx === 0) await page.waitForTimeout(60) }
    await page.evaluate(() => window.__rTest.setup({ inv: 999999, clearEnemies: true, spawnDuelist: { y: 120, cd: 2 } }))
    let hotPx = 0
    try {
        await page.waitForFunction(() => {
            const cv = [...document.querySelectorAll('canvas')].find((c) => c.width === 320)
            if (!cv) return false
            const p = window.__rTest.probe()
            if (p.duel !== 1) return false
            const d = cv.getContext('2d').getImageData(Math.max(0, p.duelX - 17), Math.max(0, p.duelY - 6), 8, 12).data
            let n = 0
            for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] >= 150) n++
            window.__haloPx = n
            return n >= 25
        }, { timeout: 4000 })
        hotPx = await page.evaluate(() => window.__haloPx)
    } catch {}
    r.check('#2938 the warn halo spills ahead of the nose while the round loads — a phone-scale eye sees the shot coming',
        hotPx >= 25 && hotPx >= coldPx + 25, `hot=${hotPx} cold=${coldPx}`)

    // (b) the dash drags a thick streak: spawn the pass at a fixed spot and
    // measure rows of heat in the column just behind the hull — two rows was
    // the hairline, three is the streak
    await page.evaluate(() => window.__rTest.setup({ inv: 999999, clearEnemies: true, spawnDuelist: { y: 120, state: 'dash' } }))
    let trailRows = 0
    try {
        await page.waitForFunction(() => {
            const cv = [...document.querySelectorAll('canvas')].find((c) => c.width === 320)
            if (!cv) return false
            const p = window.__rTest.probe()
            if (p.duel !== 1 || p.duelState !== 'dash') return false
            const d = cv.getContext('2d').getImageData(p.duelX + 10, Math.max(0, p.duelY - 4), 3, 9).data
            let rows = 0
            for (let ry = 0; ry < 9; ry++) {
                for (let rx = 0; rx < 3; rx++) {
                    const i = (ry * 3 + rx) * 4
                    if (d[i] > 90 && d[i] > d[i + 1] + 10) { rows++; break }
                }
            }
            window.__rows = rows
            return rows >= 3
        }, { timeout: 3000 })
        trailRows = await page.evaluate(() => window.__rows)
    } catch {}
    r.check('#2938 the dash trail is three rows of heat, not two — the pass is visible mid-streak',
        trailRows >= 3, `rows=${trailRows}`)

    // (c) its own round on screen: at the muzzle there is crimson where the
    // shared grey bullet used to be — the gun reads by colour before position.
    // Deterministic: contract-steps put the dart into the window before the
    // pixel poll registers, so the law never races the rAF chain.
    await page.evaluate(() => {
        window.__rTest.setup({ inv: 999999, clearEnemies: true, spawnDuelist: { y: 120, cd: 1 } })
        window.__game.step({}, 8)
    })
    let crimsonPx = 0
    try {
        await page.waitForFunction(() => {
            const cv = [...document.querySelectorAll('canvas')].find((c) => c.width === 320)
            if (!cv) return false
            const p = window.__rTest.probe()
            if (p.duel !== 1) return false
            const d = cv.getContext('2d').getImageData(Math.max(0, p.duelX - 42), Math.max(0, p.duelY - 5), 36, 10).data
            let n = 0
            for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 90 && d[i + 2] < 110) n++
            window.__crimPx = n
            return n >= 4
        }, { timeout: 4000 })
        crimsonPx = await page.evaluate(() => window.__crimPx)
    } catch {}
    r.check('#2938 the duel\'s round is crimson on canvas — the eye reads the gun without finding the shooter',
        crimsonPx >= 4, `crimson px=${crimsonPx}`)
    // #2951 the marked fan is visible on screen too: the probe reports volleys
    // in the air, and the mark rides the rounds as they cross the yard — the
    // tag is sim truth the shell and QA can both see, not a harness artefact.
    await page.evaluate(() => window.__game.reset(3))
    await page.waitForTimeout(150)
    await page.evaluate(() => window.__rTest.setup({ toPhase2: true, spawnVolley: true, inv: 999999 }))
    await page.waitForTimeout(120)
    const vA = await page.evaluate(() => window.__rTest.probe())
    await page.evaluate(() => window.__game.step({}, 40)) // deterministic: rAF throttles late in a long leg
    const vB = await page.evaluate(() => window.__rTest.probe())
    r.check('#2951 the marked fan reports on screen — three rounds in the air, and the mark rides them across the yard',
        vA.volleys === 3 && vA.volleyX > 80 &&
        ((vB.volleys === 3 && vA.volleyX - vB.volleyX >= 25) || vB.volleys === 0),
        `air=${vA.volleys}@${vA.volleyX} later=${vB.volleys}@${vB.volleyX}`)

    r.check('zero page errors across the whole leg', errs.length === 0, errs.join(' | ') || 'clean')
}
await browser.close()

r.exit()
