// MOMENTUM RUNNER — the gate audit. No browser, no dev server.
//
//   npm run runnercheck              # every velocity-reachability claim the run makes
//   npm run runnercheck -- --mutate  # silence one physics rule, watch a NAMED check red
//
// This game's whole contract is that SPEED, not a button, opens the level. So
// the audit does not ask "is it fun" — it asks, per muscle the issue named,
// "can the sim be driven THROUGH this without the physics the level assumes?"
//
//   WORLD     segments march forward, the loop sits on a real floor, the apex
//             rings are ON the loop arc and NOWHERE a grounded runner can reach.
//   SLOPES    a body released on a downhill beats the flat-run cap with NO
//             input (gravity, not the key, is the engine); landings project
//             the velocity vector onto the new tangent (down adds, up eats).
//   JETS      the jump is variable — an early release clips the apex, monotonic.
//             a spring pad really throws a real body over a declared pit.
//   LOOP      the centripetal floor is v^2 >= 5*g*r: just below it the body
//             peels off the apex, just above it completes. The far spike's
//             ONLY rings live on the arc, so skipping the loop = a ringless death.
//   HAZARD    a hazard with rings staggers and strips them; without, it kills;
//             a pit kills; a totem moves where death puts you back.
//   CHAIN     the autopilot wins with ZERO deaths, every pit lands with real
//             margin measured on the REPLAY (not the planner's hope), the loop
//             entry is >=1.25x the need, every spike is passed holding rings,
//             replays are bit-identical, and a dropped tick is noticed.

import { spawnSync } from 'node:child_process'
import * as s from '../src/games/MomentumRunner/sim.js'

const args = process.argv.slice(2)
const MUT = args.includes('--mutate')
const MAP = args.includes('--map')
const MUT_NAME = process.env.RUNNER_MUT || null

const { ZONES, CFG, G, RUN_TOP, FIXED_DT, BODY_R, RING_R } = s

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

// Every load-bearing rule, one each. A MUT that survives is a check that has
// quietly stopped touching the line it mutates.
const MUTANTS = {
    slopeDrive: 'downhill stops driving speed — flat-run becomes the only engine, the loop is unreachable',
    loopContact: 'the loop stops needing centripetal force — slow entries magically stick to the apex',
    springLaunch: 'spring pads stop firing — two pits become unsurvivable',
    ringsProtect: 'rings stop protecting — a hazard that should stagger now kills',
    checkpointSaves: 'checkpoints stop saving — death forgets the totem you passed',
    landProject: 'landings stop projecting onto the slope — downhill impact speed is thrown away',
    jumpCut: 'the jump stops being variable — tap and hold become the same height',
    pitDeath: 'pits stop killing — the whole level becomes a safe walk',
}
if (MUT_NAME) {
    if (!(MUT_NAME in MUTANTS)) { console.error(`unknown mutant ${MUT_NAME}`); process.exit(2) }
    CFG[MUT_NAME] = false
    console.log(`\x1b[33mMUTANT ACTIVE: ${MUT_NAME} = false\x1b[0m  (${MUTANTS[MUT_NAME]})`)
}

// per-zone pit spans derived from the SAME segment lists the sim walks
const pitsOf = (z) => {
    const out = []
    for (let i = 0; i < z.segs.length - 1; i++) {
        const a = z.segs[i][2], b = z.segs[i + 1][0]
        if (b > a + 30) {
            const spring = z.springs.some(sp => sp[0] >= a - 30 && sp[0] <= b + 4)
            out.push({ near: a, far: b, spring })
        }
    }
    return out
}

if (MAP) {
    for (let z = 0; z < ZONES.length; z++) {
        const zz = ZONES[z]
        const W = 60
        const lines = []
        for (let i = 0; i < 3; i++) lines.push('')
        for (let x = zz.segs[0][0]; x < zz.segs[zz.segs.length - 1][2]; x += 8) {
            const gy = s.groundY(zz, x)
            let col = '·'
            if (gy !== null) col = '#'
            if (zz.spikes.some(sp => x >= sp[0] && x <= sp[1])) col = '^'
            if (zz.springs.some(sp => Math.abs(sp[0] - x) < 8)) col = '='
            if (zz.rings.some(r => Math.abs(r[0] - x) < 6)) col = 'o'
            if (zz.loop && Math.abs(zz.loop.cx - x) < 6) col = 'O'
            if (x >= zz.ck - 4 && x <= zz.ck + 4) col = 'T'
            if (x >= zz.goal - 4 && x <= zz.goal + 4) col = 'G'
            lines[1] += col
        }
        console.log(`\nZONE ${z} ${zz.name}`)
        console.log(lines.join('\n'))
    }
    process.exit(0)
}

// ---------------------------------------------------------------- world ----
section('WORLD (segments march forward; the loop sits on a real floor)')
{
    for (const z of ZONES) {
        ok(z.segs.every(sg => sg[2] - sg[0] > 20), `${z.name}: a near-vertical/zero-width segment`)
        ok(z.segs.every((sg, i) => i === 0 || sg[0] >= z.segs[i - 1][2]), `${z.name}: segments overlap out of order`)
        for (const sp of z.spikes) ok(s.groundY(z, (sp[0] + sp[1]) / 2) !== null, `${z.name}: a spike floats over a pit`)
        if (z.loop) {
            const gy = s.groundY(z, z.loop.cx)
            ok(gy !== null && Math.abs(gy - (z.loop.cy + z.loop.r)) < 1.5, `${z.name}: the loop mouth is not on a floor`)
            // apex rings must lie ON the loop's inner arc (recomputed, not trusted)
            const arcR = (rx, ry) => Math.hypot(rx - z.loop.cx, ry - (z.loop.cy - BODY_R))
            for (const [rx, ry] of z.rings) {
                const d = arcR(rx, ry)
                ok(Math.abs(d - z.loop.r) < 3, `${z.name}: apex ring (${rx},${ry}) is ${d.toFixed(1)} from the loop centre, arc r=${z.loop.r}`)
                const gyR = s.groundY(z, rx)
                ok(gyR === null || (gyR - ry) > (RING_R + BODY_R), `${z.name}: a loop ring is close enough to the ground to grab while rolling`)
            }
        }
    }
}

// --------------------------------------------------------------- slopes ----
section('SLOPES (gravity, not the key, is the engine — angle-based collision)')
{
    // a body released (NO input) on a long downhill must beat the flat-run cap
    const z = ZONES[2]                                  // [150,40,950,413] long downhill, no pit
    const g = s.makeGame(); g.zone = 2; g.p.x = 170; g.p.y = s.groundY(z, 170); g.p.mode = 'track'; g.p.s = 0
    let peak = 0
    for (let t = 0; t < 130; t++) { s.step(g, {}); if (g.p.mode === 'track') peak = Math.max(peak, g.p.s) }
    ok(peak > RUN_TOP + 50, `no-input downhill only peaked at ${peak.toFixed(0)} — flat-run cap ${RUN_TOP}: slopeDrive is the engine, this must exceed it`)

    // landing projection: the SAME falling velocity onto a DOWNHILL lands
    // FASTER than onto flat (the vertical speed is added by projecting onto
    // the tangent), and slower onto an UPHILL. Drives the real step() landing.
    const dropOn = (x0, y0) => {
        const g = s.makeGame()
        g.p.x = x0; g.p.y = y0; g.p.mode = 'air'; g.p.vx = 300; g.p.vy = 300; g.p.s = 0
        for (let t = 0; t < 40; t++) { s.step(g, { right: false }); if (g.p.mode === 'track') return g.p.s }
        return null
    }
    const z1 = ZONES[0]
    const downLand = dropOn(440, s.groundY(z1, 440) - 30)     // downhill [340,180,540,234]
    const flatLand = dropOn(120, s.groundY(z1, 120) - 30)     // flat     [0,180,340,180]
    const upLand = dropOn(880, s.groundY(z1, 880) - 30)       // uphill   [860,272,1160,240]
    ok(downLand !== null && flatLand !== null && downLand > flatLand + 20,
        `downhill landing (${downLand}) did not gain over flat (${flatLand}) — landProject is dead`)
    ok(flatLand !== null && upLand !== null && upLand < flatLand - 20,
        `uphill landing (${upLand}) did not eat speed vs flat (${flatLand}) — landProject is dead`)
}

// ----------------------------------------------------------------- jets ----
section('JETS (variable jump + spring pads throw real bodies)')
{
    const apex = (cutTick) => {
        const g = s.makeGame(); g.p.s = 150
        let y0 = null, minY = 1e9
        for (let t = 0; t < 90; t++) {
            s.step(g, { right: false, jumpEdge: t === 0, jumpCut: cutTick != null && t === cutTick })
            if (g.p.mode === 'air') { if (y0 === null) y0 = g.p.y; if (g.p.y < minY) minY = g.p.y }
        }
        return y0 - minY
    }
    const hold = apex(null), c2 = apex(2), c6 = apex(6), c12 = apex(12)
    ok(hold > 90, `a held jump barely rose ${hold.toFixed(0)}px — the jump is dead`)
    ok(c2 < c6 - 6 && c6 < c12 - 6 && c12 < hold - 6,
        `jump not variable (monotonic): cut2 ${c2.toFixed(0)} < cut6 ${c6.toFixed(0)} < cut12 ${c12.toFixed(0)} < hold ${hold.toFixed(0)}`)

    // spring pad launches over its declared pit
    const z = ZONES[0]
    const g = s.makeGame(); g.p.x = 1230; g.p.y = s.groundY(z, 1230); g.p.mode = 'track'; g.p.s = 300
    let fired = false, pitDeath = false, landX = 0
    for (let t = 0; t < 160; t++) {
        s.step(g, { right: true }); s.maybeEnterLoop(g)
        if (g.ev.some(e => e.type === 'spring')) fired = true
        if (g.ev.some(e => e.type === 'land')) landX = g.p.x
        if (g.ev.some(e => e.type === 'die' && e.why === 'pit')) pitDeath = true
    }
    ok(fired, 'touching a spring pad produced no launch')
    ok(!pitDeath && landX > 1540, `the spring did not clear the pit (land ${Math.round(landX)}, pit far lip 1540)`)
}

// ----------------------------------------------------------------- loop ----
section('LOOP (the centripetal floor is v^2 >= 5*g*r — entry speed is load-bearing)')
{
    const r = ZONES[2].loop.r
    const need = s.loopRequire(r)
    ok(need === 5 * G * r, `loopRequire(${r}) = ${need}, expected ${5 * G * r}`)
    const vNeed = Math.sqrt(need)
    const trial = (v) => {
        const g = s.makeGame(); g.zone = 2
        g.p.x = 1080; g.p.y = s.groundY(ZONES[2], 1080); g.p.mode = 'track'; g.p.s = v; g.p.lastTheta = 0
        s.maybeEnterLoop(g)
        let crash = false, done = false
        for (let t = 0; t < 260; t++) {
            s.step(g, { right: true }); s.maybeEnterLoop(g)
            if (g.ev.some(e => e.type === 'crash')) crash = true
            if (g.ev.some(e => e.type === 'loop')) done = true
        }
        return { crash, done }
    }
    const slow = trial(vNeed - 20), fast = trial(vNeed + 160)
    ok(slow.crash && !slow.done, `entry at ${Math.round(vNeed - 20)} (< v=${vNeed.toFixed(0)}) did NOT peel off the apex (crash=${slow.crash} done=${slow.done})`)
    ok(fast.done && !fast.crash, `entry at ${Math.round(vNeed + 160)} did not complete the loop`)

    // SKIPPING the loop is fatal: the far spike's only rings live on the arc,
    // so a runner deposited at the loop exit with no rings dies there.
    const skip = s.makeGame(); skip.zone = 2
    skip.p.x = ZONES[2].loop.cx; skip.p.y = s.groundY(ZONES[2], ZONES[2].loop.cx); skip.p.mode = 'track'; skip.p.s = 400; skip.p.lastTheta = 0; skip.loopTaken = true
    let skipDie = false, skipHit = false
    for (let t = 0; t < 400; t++) {
        s.step(skip, { right: true }); s.maybeEnterLoop(skip)
        if (skip.ev.some(e => e.type === 'hit')) skipHit = true
        if (skip.ev.some(e => e.type === 'die')) skipDie = true
    }
    ok(skipDie && !skipHit, `skipping the loop survived the far spike (die=${skipDie} hit=${skipHit}) — the apex rings are not load-bearing`)
}

// --------------------------------------------------------------- hazard ----
section('HAZARD (rings stagger; no rings kill; pits kill; the totem remembers)')
{
    const z = ZONES[0]
    // spike WITH rings
    {
        const g = s.makeGame(); g.p.x = 1000; g.p.y = s.groundY(z, 1000); g.p.mode = 'track'; g.p.s = 300; g.rings = 3
        let hit = false, die = false
        for (let t = 0; t < 130; t++) { s.step(g, { right: true }); s.maybeEnterLoop(g); if (g.ev.some(e => e.type === 'hit')) hit = true; if (g.ev.some(e => e.type === 'die')) die = true }
        ok(hit && !die, `a spike WITH rings did not stagger-survive (hit=${hit} die=${die})`)
    }
    // spike WITHOUT rings
    {
        const g = s.makeGame(); g.p.x = 1010; g.p.y = s.groundY(z, 1010); g.p.mode = 'track'; g.p.s = 200; g.rings = 0
        let die = false
        for (let t = 0; t < 130; t++) { s.step(g, { right: true }); s.maybeEnterLoop(g); if (g.ev.some(e => e.type === 'die')) die = true }
        ok(die, 'a spike with NO rings let the runner through — ringsProtect has inverted')
    }
    // pit kills even with rings
    {
        const g = s.makeGame(); g.p.x = 600; g.p.y = 400; g.p.mode = 'air'; g.p.vx = 0; g.p.vy = 0; g.rings = 5
        let die = false
        for (let t = 0; t < 200; t++) { s.step(g, {}); if (g.ev.some(e => e.type === 'die')) die = true }
        ok(die, 'falling into a pit did not kill — pitDeath is dead')
    }
    // checkpoint moves the respawn
    {
        const g = s.makeGame(); g.p.x = 1860; g.p.y = s.groundY(z, 1860); g.p.mode = 'track'; g.p.s = 200
        for (let t = 0; t < 60; t++) s.step(g, { right: true })        // roll onto the totem
        const saved = g.save.x === z.ck
        g.p.x = 600; g.p.y = 400; g.p.mode = 'air'; g.p.vx = 0; g.p.vy = 0; g.rings = 0
        for (let t = 0; t < 200; t++) s.step(g, {})                    // fall in the pit
        ok(saved && g.deaths === 1 && Math.round(g.p.x) === z.ck, `death returned to ${Math.round(g.p.x)}, checkpoint said ${z.ck}`)
    }
}

// ----------------------------------------------------------------- chain ----
section('CHAIN (the autopilot wins; margins measured on the REAL replay)')
{
    let plan = null
    {
        const t0 = Date.now()
        plan = s.planRun()
        ok(plan.ok && plan.end === 'win', `planRun did not win (${plan.end}) — the attract demo has no proof to replay`)
        ok(Date.now() - t0 < 5000, 'the autopilot got too slow to gate merges')
    }
    const rec = plan.receipt
    ok(rec.deaths === 0, `the proven route is no longer zero-death (${rec.deaths} deaths)`)
    ok(rec.loop && rec.loop.entryV2 >= 1.25 * rec.loop.need,
        `loop entry v^2 ${rec.loop ? rec.loop.entryV2.toFixed(0) : '-'} is under 1.25x the need ${rec.loop?.need} — no headroom`)
    ok(rec.ringsAtHit.every(n => n > 0) && rec.hits >= 3, `a spike was passed ringless: ${JSON.stringify(rec.ringsAtHit)}`)

    // independent margin re-measurement on the REPLAY (not the planner's hope):
    // for each jump pit, the real body must land >=12px past the far lip.
    const replayPits = new Map()
    ZONES.forEach((z, zi) => pitsOf(z).filter(p => !p.spring).forEach(p => replayPits.set(`${zi}:${p.far}`, { ...p, cleared: false })))
    let airborne = null
    const g2 = s.replayScript(plan.script, {
        onTick: (g) => {
            const gy = s.groundY(ZONES[g.zone], g.p.x)
            if (gy === null && !airborne) {
                const far = (pitsOf(ZONES[g.zone]).find(p => g.p.x >= p.near - 4 && g.p.x <= p.far) || {}).far
                airborne = { zone: g.zone, far }
            } else if (g.p.mode === 'track' && airborne) {
                const key = `${airborne.zone}:${airborne.far}`
                const p = replayPits.get(key)
                if (p && airborne.far) { p.margin = g.p.x - airborne.far; p.cleared = p.margin >= 12 }
                airborne = null
            }
            for (const e of g.ev) if (e.type === 'respawn' || e.type === 'die') { ok(false, 'a death occurred on the replayed proof route') }
        },
    })
    const jumpPits = [...replayPits.values()]
    ok(jumpPits.length >= 3, `expected >=3 jump pits, replay saw ${jumpPits.length}`)
    for (const p of jumpPits) ok(p.cleared, `a jump pit (far ${p.far}) was not cleared with >=12px margin (margin ${p.margin?.toFixed?.(1)})`)
    ok(g2.end === 'win' && g2.deaths === 0, 'the recorded script no longer wins cleanly')

    // determinism
    const a = s.replayScript(plan.script), b = s.replayScript(plan.script)
    ok(s.stateHash(a) === s.stateHash(b), 'two replays of one script disagree — the sim grew an RNG')
    const cut = plan.script.slice(0, 500).concat(plan.script.slice(501))
    ok(s.stateHash(s.replayScript(cut)) !== s.stateHash(a), 'the hash ignores a dropped command — a desync could hide')
}

// -------------------------------------------------------------- mutants ----
if (MUT) {
    section('MUTATIONS — each silenced rule MUST turn a named check red')
    for (const name of Object.keys(MUTANTS)) {
        const child = spawnSync(process.execPath, [process.argv[1]], {
            env: { ...process.env, RUNNER_MUT: name }, encoding: 'utf8',
        })
        const caught = child.status !== 0
        console.log(`  mut ${name}: ${caught ? 'caught' : 'SURVIVED (BAD)'}`)
        ok(caught, `mutant '${name}' SURVIVED — a check stopped touching this rule`)
    }
}

console.log(`\nrunnercheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach(f => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
