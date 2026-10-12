// WWI DOGFIGHT — the Node audit. No browser: this imports the SAME sim.js
// and levels.js the tab mounts and proves the issue's muscles before a
// pixel is painted:
//
//   - the flight model: trim converges to the closed terminal-speed form,
//     the stall contract drops the nose, a zoom climb pays for its metres,
//     and gliding NEVER gains energy (drag must always have teeth);
//   - ballistics: the sim's bullet integrator is held tick-for-tick against
//     an independent harness integration of the same equations, drop included;
//   - the rounds ledger: belt + flying + hit + missed == total, per plane,
//     EVERY tick — a NaN belt once quietly disarmed the whole patrol, and
//     only an exact ledger every tick catches that as a failure, not a calm sky.
//
// Plus: the real autopilot WINS both patrols (all bandits by the gun, never
// by an AI crash — a win over scenery proves nothing), determinism three
// ways, and the SLACK rule: every patrol re-flown with rounds out of the
// belt AND metres off the deck must still be won.
//
//   npm run dogfightcheck              the audit (~1 s)
//   npm run dogfightcheck -- --mutate  + seven mutants that MUST die
import { MISSION_COUNT, buildMission } from '../src/games/Dogfight/levels.js'
import {
    CFG, FIXED_DT, G, newGame, step, pilotInput, replay, stateHash, predictHit,
} from '../src/games/Dogfight/sim.js'

const args = process.argv.slice(2)
const MUT = args.includes('--mutate')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

// exact per-plane ledger: a consumed round lives in exactly one of four places
const ledgerOk = (g) => [g.p, ...g.foes].every((q) =>
    q.belt + q.hits + q.missed + g.bullets.filter((b) => b.owner === q.id).length === q.total)
const finiteOk = (g) => [g.p, ...g.foes].every((q) =>
    [q.x, q.y, q.z, q.v, q.yaw, q.pitch, q.roll, q.belt].every(Number.isFinite))

// --------------------------------------------------------------- construction ----
section('CONSTRUCTION — patrols carve honestly')
for (let i = 0; i < MISSION_COUNT; i++) {
    let threw = null, m = null
    try { m = buildMission(i) } catch (e) { threw = e }
    ok(!threw, `mission ${i}: buildMission threw — ${threw && threw.message}`)
    if (!m) continue
    ok(m.enemies.length >= 2, `${m.name}: ${m.enemies.length} bandits — a patrol needs a formation`)
    ok(m.enemies.every((e) => e.y > m.player.y), `${m.name}: the opening zoom climb IS the game — every bandit must spawn above the scout`)
    ok(m.enemies.every((e) => Math.hypot(e.x - m.arena.cx, e.z - m.arena.cz) < m.arena.r) &&
        Math.hypot(m.player.x - m.arena.cx, m.player.z - m.arena.cz) < m.arena.r, `${m.name}: a spawn outside the patrol box`)
    ok(m.clock >= 120 && m.clock <= 240, `${m.name}: clock ${m.clock}s is not a dogfight duration`)
}

// ----------------------------------------------------------------- flight model ----
function scratch(idx = 0) {
    const g = newGame(idx)
    // the physics lab needs an EMPTY sky but a LIVE patrol: clearing the
    // foes entirely would trip the win condition on tick one and freeze
    // the whole sim — a harness that grades a frozen world is green theatre.
    g.foes.forEach((f, k) => { f.x = 6000 + k * 50; f.z = 6000; f.belt = 0 })
    return g
}

section('FLIGHT — trim, stall, zoom, and the energy ledger (drag must have teeth)')
{
    // TRIM: full throttle, level: v converges to sqrt((T−d0)/dK), altitude held
    const g = scratch()
    g.p.y = 400; g.p.pitch = 0
    const vTerm = Math.sqrt((CFG.thrust - CFG.drag0) / CFG.dragK)
    for (let t = 0; t < 900; t++) step(g, { roll: 0, pitch: 0, throttle: 1, fire: false })
    ok(Math.abs(g.p.v - vTerm) < 1, `trim: v settled ${g.p.v.toFixed(2)} m/s, the closed form says ${vTerm.toFixed(2)}`)
    ok(Math.abs(g.p.y - 400) < 0.6, `trim: level flight drifted ${(g.p.y - 400).toFixed(2)} m — trim is not level`)

    // STALL: a wing at 24 m/s MUST warn and MUST drop its own nose
    const gs = scratch()
    gs.p.y = 420; gs.p.v = 24; gs.p.pitch = 0
    const y0 = gs.p.y
    let sawStall = false
    for (let t = 0; t < 90; t++) {
        step(gs, { roll: 0, pitch: 0, throttle: 0, fire: false })
        sawStall = sawStall || gs.events.some((e) => e.type === 'stall')
        gs.events.length = 0
    }
    ok(sawStall, 'stall: a wing at 24 m/s never printed the stall warning')
    ok(gs.p.pitch < -0.05, `stall: the nose stayed at ${gs.p.pitch.toFixed(3)} rad — a stalled wing must drop the nose`)
    ok(gs.p.y < y0 - 5, `stall: the scout held ${gs.p.y.toFixed(1)} m while "stalled" — it must come down`)

    // ZOOM: speed is altitude in disguise — the metres gained are PAID in m/s
    const gz = scratch()
    gz.p.y = 300; gz.p.v = 90
    const h0 = gz.p.y, v0 = gz.p.v, H0 = gz.p.y + (v0 * v0) / (2 * G)
    for (let t = 0; t < 60; t++) step(gz, { roll: 0, pitch: 0.9, throttle: 0, fire: false })
    const H1 = gz.p.y + (gz.p.v * gz.p.v) / (2 * G)
    ok(gz.p.y > h0 + 20, `zoom: the pull bought only ${(gz.p.y - h0).toFixed(1)} m from 90 m/s — that is not a wing`)
    ok(gz.p.v < v0 - 8, `zoom: altitude rose and the speed stayed at ${gz.p.v.toFixed(1)} m/s — that is a lift fan, not a biplane`)
    ok(H1 < H0, `zoom: total energy GAINED ${(H1 - H0).toFixed(1)} m with the throttle shut — free energy`)

    // GLIDE: cut the engine and the energy ledger must only ever go down
    const gg = scratch()
    gg.p.y = 500; gg.p.v = 80
    let prevH = gg.p.y + (gg.p.v * gg.p.v) / (2 * G)
    const Hstart = prevH
    let gained = 0
    for (let t = 0; t < 300; t++) {
        step(gg, { roll: 0, pitch: 0, throttle: 0, fire: false })
        const H = gg.p.y + (gg.p.v * gg.p.v) / (2 * G)
        if (H > prevH + 1e-9) gained++
        prevH = H
    }
    ok(gained === 0, `glide: the energy ledger ROSE on ${gained} ticks with zero throttle — drag is not paying its toll`)
    ok(prevH < Hstart - 40, `glide: 10 s of gliding lost only ${(Hstart - prevH).toFixed(1)} m of energy — drag is decorative`)
}

// ------------------------------------------------------------------- ballistics ----
section('BALLISTICS — the sim integrator held to an independent integration, drop included')
{
    const g = scratch()
    g.p.x = 0; g.p.y = 300; g.p.z = 0; g.p.yaw = 0; g.p.pitch = 0; g.p.v = 60; g.p.belt = 5; g.p.total = 5
    step(g, { roll: 0, pitch: 0, throttle: 0.85, fire: true })
    const bullet = g.bullets[g.bullets.length - 1]
    ok(!!bullet, 'script: the gun fired nothing')
    let hx = bullet.x, hy = bullet.y, hz = bullet.z
    const hvx = bullet.vx, hvz = bullet.vz
    let hvy = bullet.vy
    let maxDelta = 0, ticks = 0
    for (let t = 0; t < 24 && g.bullets.includes(bullet); t++) {
        hvy -= G * FIXED_DT
        const sp = Math.hypot(hvx, hvy, hvz)
        const steps = Math.max(1, Math.ceil((sp * FIXED_DT) / 3))
        for (let s = 0; s < steps; s++) {
            hx += (hvx * FIXED_DT) / steps
            hy += (hvy * FIXED_DT) / steps
            hz += (hvz * FIXED_DT) / steps
        }
        step(g, { roll: 0, pitch: 0, throttle: 0.85, fire: false })
        ticks++
        if (g.bullets.includes(bullet)) {
            maxDelta = Math.max(maxDelta, Math.abs(hx - bullet.x), Math.abs(hy - bullet.y), Math.abs(hz - bullet.z))
        }
    }
    ok(maxDelta < 1e-9, `ballistics: the sim bullet diverged from the harness integrator by ${maxDelta} m after ${ticks} ticks`)
    const tSec = ticks * FIXED_DT
    ok(300 - hy > 0.5 * G * tSec * tSec * 0.9, `ballistics: the tracer dropped only ${(300 - hy).toFixed(2)} m in ${tSec.toFixed(2)} s — a flat tracer is the archery flat-shot bug at 400 m/s`)

    // predictHit honesty: approves the bore-line shot, refuses the vertical
    const gp = newGame(0)
    gp.p.x = 0; gp.p.y = 300; gp.p.z = 0; gp.p.yaw = 0; gp.p.pitch = 0; gp.p.v = 60
    const foe = gp.foes[0]
    foe.x = 0; foe.y = 300; foe.z = 250; foe.yaw = 0; foe.pitch = 0; foe.v = 0
    const t1 = predictHit(gp, gp.p, foe)
    ok(t1 >= 0, `predictHit: a dead-level shot at a foe ON the bore line was refused (t=${t1})`)
    foe.y = 450
    ok(predictHit(gp, gp.p, foe) < 0, 'predictHit: a level shot approved a foe 150 m overhead — the receipt approves anything')
}

// ------------------------------------------------------------------ the ledger ----
section('LEDGER — belt + flying + hit + missed == total, every tick, every plane')
{
    const g = newGame(0)
    let breaks = 0, nans = 0
    g.p.belt = g.p.total = 2
    for (let t = 0; t < 300 && !g.end; t++) {
        step(g, pilotInput(g))
        if (!ledgerOk(g)) breaks++
        if (!finiteOk(g)) nans++
        g.events.length = 0
    }
    ok(breaks === 0, `ledger: broke on ${breaks} ticks — rounds went for a walk uncounted`)
    ok(nans === 0, `ledger: ${nans} ticks with NaN in a plane — a NaN belt feeds the gun NOTHING and looks like a peaceful sky (it did, once)`)

    const gd = newGame(0)
    gd.p.belt = 0; gd.p.total = 0
    const n0 = gd.bullets.length
    let dryHeard = false
    for (let t = 0; t < 30; t++) {
        step(gd, { roll: 0, pitch: 0, throttle: 0.8, fire: true })
        if (gd.events.some((e) => e.type === 'dry')) dryHeard = true
        gd.events.length = 0
    }
    ok(dryHeard, 'dry: an empty belt never clicked — the pilot must HEAR an empty gun')
    ok(gd.bullets.length === n0, 'script: a dry scout fired bullets from nothing')
    ok(gd.p.belt === 0, 'script: the dry shot went negative-ammo')
}

// ------------------------------------------------------- every patrol, won ----
function drivePatrol(i, opts = {}) {
    const g = newGame(i)
    if (opts.belt) g.p.belt = g.p.total = opts.belt
    if (opts.alt) g.p.y = opts.alt
    let ledBreaks = 0, nans = 0
    const cap = g.clock * 30 + 60
    while (!g.end && g.tick < cap) {
        const inp = pilotInput(g)
        g.cmds.push({ tick: g.tick, in: inp })
        step(g, inp)
        if (!ledgerOk(g)) ledBreaks++
        if (!finiteOk(g)) nans++
        g.events.length = 0
    }
    return { g, ledBreaks, nans }
}

const receipts = {}
for (let i = 0; i < MISSION_COUNT; i++) {
    section(`PATROL ${i} — ${buildMission(i).name}: the autopilot IS the attract demo, and it wins`)
    const t0 = Date.now()
    const { g, ledBreaks, nans } = drivePatrol(i)
    ok(g.end === 'win', `patrol ${i}: the autopilot did not WIN: end=${g.end} why="${g.why}" at tick ${g.tick}`)
    ok(g.tick < g.clock * 30, `patrol ${i}: the fuel died first (${g.tick} ticks) — a timed-out demo is a tie nobody asked for`)
    ok(g.foes.every((f) => !f.alive && f.hp <= 0), `patrol ${i}: a bandit survived the witness`)
    ok(g.p.hp > 0, `patrol ${i}: the pilot won by dying too`)
    ok(g.p.hits >= 2 * g.foes.length, `patrol ${i}: only ${g.p.hits} pilot hits for ${g.foes.length} bandits — kills must come from the PILOT's gun, not scenery accidents`)
    ok(g.p.fired > 0 && g.p.fired < 40, `patrol ${i}: the pilot spent ${g.p.fired} rounds — the receipt gate must shoot like a duellist, not spray`)
    ok(g.p.missed <= 3, `patrol ${i}: ${g.p.missed} rounds missed — predictHit is a receipt, not a suggestion`)
    ok(ledBreaks === 0, `patrol ${i}: the rounds ledger broke on ${ledBreaks} ticks`)
    ok(nans === 0, `patrol ${i}: ${nans} NaN ticks`)
    const foeShots = g.foes.reduce((s, f) => s + f.fired, 0)
    ok(foeShots > 0, `patrol ${i}: the bandits never fired once — a sky with no return fire is a shooting gallery (a NaN belt once made exactly this, quietly)`)

    // determinism, three ways
    const g2 = replay(i, g.cmds.map((c) => ({ ...c })), { maxTicks: g.tick + 2 })
    ok(stateHash(g2) === stateHash(g), `patrol ${i}: replay of the recorded stream diverged`)
    const again = drivePatrol(i)
    ok(stateHash(again.g) === stateHash(g), `patrol ${i}: re-solving produced a different patrol — the pilot is not pure`)
    const mid = g.cmds.filter((c) => c.tick > 30 && c.tick < g.tick - 30 && c.in && Math.abs(c.in.roll) > 0.3)
    ok(mid.length > 0, `patrol ${i}: the witness never banked hard — the pilot stream is suspiciously still`)
    if (mid.length) {
        const drop = mid[Math.floor(mid.length / 2)].tick
        const g3 = replay(i, g.cmds.filter((c) => c.tick !== drop).map((c) => ({ ...c })), { maxTicks: g.tick + 150 })
        ok(stateHash(g3) !== stateHash(g), `patrol ${i}: dropping the stick at tick ${drop} changed NOTHING — a hash-blind referee`)
    }

    // SLACK: rounds out of the belt AND metres off the deck
    const base = g.p.total
    const sl = drivePatrol(i, { belt: base - 20, alt: buildMission(i).player.y - 40 })
    ok(sl.g.end === 'win', `patrol ${i}: SLACK FAILED — belt ${base - 20}, alt −40 m ends ${sl.g.end} "${sl.g.why}" (used ${sl.g.p.fired}, hp ${sl.g.p.hp}); a perfect-solver win is not a human-winning design`)
    ok(sl.g.p.hp > 0, `patrol ${i}: the slack pilot won by dying too`)
    for (const cut of [30, 45]) {
        const slB = drivePatrol(i, { belt: base - cut })
        ok(slB.g.end === 'win', `patrol ${i}: belt ${base - cut} ended ${slB.g.end} "${slB.g.why}"`)
    }
    ok(Date.now() - t0 < 5000, `patrol ${i}: ${Date.now() - t0} ms — this audit must stay a second, not a minute`)
    receipts[i] = { ticks: g.tick, rounds: g.p.fired, missed: g.p.missed, hp: g.p.hp, foeShots, slackTicks: sl.g.tick, slackHp: sl.g.p.hp, ms: Date.now() - t0 }
}

// --------------------------------------------------------------------- danger ----
section('DANGER — a motionless pilot gets shot at (fake danger is the NaN-belt failure mode with extra steps)')
{
    const g = newGame(0)
    for (let t = 0; t < 600 && !g.end; t++) { step(g, { roll: 0, pitch: 0, throttle: 0.85, fire: false }); g.events.length = 0 }
    const fired = g.foes.reduce((s, f) => s + f.fired, 0)
    ok(fired > 0, 'the patrol let a motionless scout fly 20 s without a single round past the canopy')
}

// ------------------------------------------------------------------- mutants ----
if (MUT) {
    section('MUTATIONS — each one MUST turn an honest check red')
    const tryMut = (name, patch, probe) => {
        const base = probe()
        ok(base, `mutation harness broken: baseline for '${name}' is already false`)
        const save = { ...CFG }
        if (patch) Object.assign(CFG, patch)
        let verdict = true
        try { verdict = probe() } finally { Object.assign(CFG, save) }
        console.log(`  mut ${name}: ${verdict ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(!verdict, `${name} SURVIVED — a check stopped touching this rule`)
    }
    tryMut('no-stall (24 m/s flies level — the ASI white arc is a lie)', { stallOn: false }, () => {
        const g = scratch()
        g.p.y = 420; g.p.v = 24
        let ev = false
        for (let t = 0; t < 60; t++) { step(g, { roll: 0, pitch: 0, throttle: 0, fire: false }); ev = ev || g.events.some((e) => e.type === 'stall'); g.events.length = 0 }
        return ev && g.p.pitch < -0.05 && g.p.y < 410
    })
    tryMut('flat-tracers (no bullet gravity at 400 m/s)', { bulletGravity: false }, () => {
        const g = scratch()
        g.p.y = 300; g.p.pitch = 0; g.p.v = 60
        step(g, { roll: 0, pitch: 0, throttle: 0.85, fire: true })
        const b = g.bullets[g.bullets.length - 1]
        for (let t = 0; t < 12; t++) step(g, null)
        return g.bullets.includes(b) ? 300 - b.y > 0.5 * G * (12 / 30) ** 2 * 0.9 : false
    })
    tryMut('frictionless (no drag — energy from nowhere, no terminal speed)', { dragOn: false }, () => {
        const g = scratch()
        g.p.y = 400
        const vTerm = Math.sqrt((CFG.thrust - CFG.drag0) / CFG.dragK)
        for (let t = 0; t < 900; t++) step(g, { roll: 0, pitch: 0, throttle: 1, fire: false })
        return Math.abs(g.p.v - vTerm) < 1
    })
    tryMut('eternal-belt (the gun feeds itself)', { consume: false }, () => {
        const g = newGame(0)
        g.p.belt = 2; g.p.total = 2
        let broke = false
        for (let t = 0; t < 200 && !g.end; t++) {
            step(g, { roll: 0, pitch: 0, throttle: 0.8, fire: true })
            if (!ledgerOk(g)) broke = true
            g.events.length = 0
        }
        // baseline honesty: the belt MUST run out (to exactly zero, ledger
        // intact). The mutant leaves extra rounds in flight AND keeps the
        // belt warm — either way this predicate must go false.
        return !broke && g.p.belt === 0
    })
    tryMut('BB-gun aim (hit radius /5 — receipts stop becoming hits)', { hitScale: 0.2 }, () => {
        // predictHit is NOT scaled by hitScale — under this mutant the
        // receipt approves ±5 m hits the bullets cannot collect, so the
        // pilot's ledger of misses is what proves the mismatch.
        const { g } = drivePatrol(0)
        return g.end === 'win' && g.p.hits >= 2 * g.foes.length && g.p.missed <= 3
    })
    tryMut('no-elevator (pitchRate /45 — nothing aims or recovers)', { pitchRate: 0.02 }, () => {
        const g = scratch()
        for (let t = 0; t < 30; t++) step(g, { roll: 0, pitch: 1, throttle: 0.8, fire: false })
        return g.p.pitch > 0.1
    })
    tryMut('anaemic-bank (turn /12 — the bank flies nowhere)', { turn: 0.15 }, () => {
        const { g } = drivePatrol(0)
        return g.end === 'win'
    })
}

console.log(`\ndogfightcheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
console.log(`receipts: ${JSON.stringify(receipts)}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
