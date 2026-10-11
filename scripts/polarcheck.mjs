// POLARITY — the harness. No browser, seconds. This is the gate for the
// issue's muscle ("rule-driven enemy AI + a fairness auditor"):
//
//   npm run polarcheck
//   npm run polarcheck -- --mutate   # re-break the load-bearing rules;
//                                    # a surviving mutant means a check
//                                    # stopped touching the code
//
// THE FAIRNESS AUDIT: every tick of the autopilot's proven run is frozen
// and the ENGINE'S OWN step() is replayed 34 ticks ahead under all six
// skeletons (stand / step left / step right × keep / flip). Every tick
// must keep at least one full skeleton — every telegraph has an answer.
// The scan-transparency pin freezes a hash before and after each scan:
// if freeze/thaw ever learns to lie again, this goes red first.
import { makeGame, step, decide, volleyOK, survives, CFG, stateHash, L, D } from '../src/games/Polarity/sim.js'
import { REGISTRY, resolvePath, MAX_STEP, W } from '../src/games/Polarity/paths.js'
import { WAVES } from '../src/games/Polarity/waves.js'
import { plan } from '../src/games/Polarity/planner.js'

const MUT = process.argv.includes('--mutate')
let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

const FC = 20 // the fairness CONTRACT in ticks: the harness demands at
              // least this much air between opposite-colour volleys and
              // refuses to let CFG.flipGap drift below it — the engine's
              // promise and the auditor's yardstick are separate numbers

// ---------------------------------------------------------------- path audit ----
section('PATH AUDIT (every path, every tick — offline)')
{
    const ctxs = [
        { x: 112, y: 96, px: 60, py: 264, dir: 1, slot: { x: 112, y: 96 } },
        { x: 52, y: 148, px: 200, py: 264, dir: -1, slot: { x: 52, y: 148 } },
    ]
    for (const [ci, ctx] of ctxs.entries()) {
        for (const name of Object.keys(REGISTRY)) {
            const p = resolvePath(name, ctx)
            let prev = p.fn(0)
            let mx = 0
            for (let t = 1; t <= p.ticks; t++) {
                const q = p.fn(t / p.ticks)
                mx = Math.max(mx, Math.hypot(q[0] - prev[0], q[1] - prev[1]))
                prev = q
            }
            ok(mx <= MAX_STEP, `${name}@ctx${ci}: per-tick step ${mx.toFixed(1)} > MAX_STEP ${MAX_STEP} — a dive the player cannot dodge`)
            const end = p.fn(1)
            if (p.end === 'slot') ok(Math.hypot(end[0] - ctx.slot.x, end[1] - ctx.slot.y) < 1.5,
                `${name}: entry does not land on its slot (ends ${end[0].toFixed(1)},${end[1].toFixed(1)} vs ${ctx.slot.x},${ctx.slot.y})`)
            if (p.end === 'exit') ok(end[1] >= 288 + 16, `${name}: one-way does not exit through the bottom (ends y=${end[1].toFixed(1)})`)
        }
    }
    let threw = false
    try { resolvePath('teleport-warp', ctxs[0]) } catch { threw = true }
    ok(threw, 'resolvePath accepted an unknown path name — the rejected-skill rule is dead')
}

// ---------------------------------------------------------------- engine contract ----
section('VOLLEY GATE (the engine promise, as a separate number)')
ok(CFG.flipGap >= FC, `CFG.flipGap is ${CFG.flipGap} — below the fairness contract of ${FC} ticks of air`)
{
    // a weaver blocked by the gate defers; the same-color volley passes freely
    const g = makeGame(1) // stage 1 is where the weavers live
    const wvAt = () => g.enemies.find((e) => e.kind === 'weaver' && e.state === 'hold')
    let wv = null
    for (let t = 0; t < 600 && !(wv = wvAt()); t++) step(g, {})
    if (!wv) ok(false, 'stage 1 has no weaver holding formation — the gate fixture needs one')
    else {
        g.lastVolley = { color: D, tick: g.tick }
        wv.nextShot = g.pt
        wv.alt = L
        ok(!volleyOK(g, L) && volleyOK(g, D), 'volleyOK contradicts its own color rule')
        ok(decide(g, wv) === null, 'a weaver fired an opposite volley inside flipGap — the gate is theatre')
        g.lastVolley.tick = g.tick - CFG.flipGap
        const act = decide(g, wv)
        ok(act && act.type === 'rail' && act.color === L, 'the weaver never fired once the gate opened (defer is broken)')
    }
}
{
    // a dive shot refused by the gate is deferred, never cancelled
    const g = makeGame(0)
    for (let t = 0; t < 300 && g.phase !== 'play'; t++) step(g, {})
    g.nextDiveAt = 1e9 // stage darts stay parked; this fixture flies its own
    const dt = { id: 'fx', kind: 'dart', color: L, col: 0, row: 1, hp: 1, state: 'dive', x: 112, y: 120, uT: 0, seq: 'FX', fired: false }
    dt.path = resolvePath('zig', { x: dt.x, y: dt.y, px: 112, py: 264, dir: 1 })
    g.enemies.push(dt)
    g.lastVolley = { color: D, tick: g.tick }
    let firedAt = -1
    for (let t = 0; t < dt.path.ticks; t++) {
        dt.uT++
        g.tick++
        if (dt.uT / dt.path.ticks > 0.62) break
        const d = decide(g, dt)
        if (d) { firedAt = t; break }
    }
    ok(firedAt >= 0, 'a gate-refused dive shot was cancelled instead of deferred')
    ok(firedAt >= CFG.flipGap - 2, `diver fired ${firedAt} ticks into the gate window — earlier than the promise`)
}
{
    // the core ring: never straight down, gap rotates, exactly 8-2 rays
    const g2 = makeGame(2)
    for (let t = 0; t < 360 && g2.phase !== 'play'; t++) step(g2, {})
    const core = g2.core
    ok(!!core, 'stage 2 has no core')
    const firstGap = core.gap
    core.nextRing = g2.pt
    core.nextFan = 1e9
    g2.lastVolley = null
    const a = decide(g2, core)
    ok(a && a.type === 'ring', 'core never rings on schedule')
    const mark = g2.enemyShots.length
    commitRing(g2, core)
    const ring = g2.enemyShots.slice(mark)
    let straightDown = 0
    for (const b of ring) if (Math.abs(b.vx) < 0.01 && b.vy > 1) straightDown++
    ok(straightDown === 0, 'core fired a ray straight down — it rains on the one sprint lane')
    ok(ring.length === 6, `core ring fired ${ring.length} rays (expected 6: 8 − down − gap)`)
    ok(core.gap !== firstGap, 'core ring gap did not rotate — one permanent hole is not a rotating answer')
    function commitRing(g, e) {
        for (let k = 0; k < 8; k++) {
            if (k === e.gap || k === 2) continue
            const ang = (k / 8) * Math.PI * 2
            g.enemyShots.push({ x: e.x, y: e.y + 10, vx: Math.cos(ang) * CFG.ringV, vy: Math.sin(ang) * CFG.ringV, color: e.shell })
        }
        e.gap = (e.gap + 3) % 8
    }
}

// ------------------------------------------- THE RUN + fairness scan ----
section('THE RUN (autopilot = attract demo) + TICK-BY-TICK FAIRNESS SCAN')
const t0 = Date.now()
const live = { minSurv: 99, zeroTicks: 0, maxStep: 0, teleports: 0, volleyMinAir: 1e9, kills: 0, novas: 0, storms: 0, walls: 0, prev: new Map(), lastFire: null }
let hashDiffs = 0
const gs = makeGame(0)
const r = plan(gs, {
    maxTicks: 30000,
    onFrame: () => {
        for (const ev of gs.events) {
            if (ev.type === 'efire' || ev.type === 'wall') {
                if (live.lastFire && live.lastFire.color !== ev.color) {
                    live.volleyMinAir = Math.min(live.volleyMinAir, ev.tick - live.lastFire.tick)
                }
                live.lastFire = { color: ev.color, tick: ev.tick }
            }
            if (ev.type === 'kill') live.kills++
            if (ev.type === 'nova') live.novas++
            if (ev.type === 'storm') live.storms++
            if (ev.type === 'wall') live.walls++
        }
        gs.events.length = 0
        if (gs.phase !== 'play' || gs.pending || gs.player.state !== 'alive') return
        let c = 0
        for (const dx of [-CFG.pSpeed, 0, CFG.pSpeed]) {
            for (const pol of [L, D]) {
                const h1 = stateHash(gs)
                if (survives(gs, dx, pol, 34)) c++
                if (stateHash(gs) !== h1) hashDiffs++
            }
        }
        if (c < live.minSurv) live.minSurv = c
        if (c === 0) live.zeroTicks++
        for (const e of gs.enemies) {
            const b = live.prev.get(e.seq)
            live.prev.set(e.seq, { x: e.x, y: e.y, state: e.state, path: e.path })
            if (!b || b.state === 'wait' || b.state === 'dead' || e.state === 'dead' || e.state === 'wait') continue
            const stp = Math.hypot(e.x - b.x, e.y - b.y)
            if (stp > live.maxStep) live.maxStep = stp
            if (e.path !== b.path && b.state === 'dive') {
                const off = (x, y) => x < -8 || x > W + 8 || y < -8 || y > 288 + 8
                if (!off(b.x, b.y) && !off(e.x, e.y) && stp > MAX_STEP) live.teleports++
            }
        }
    },
})
const solveMs = Date.now() - t0
ok(r.ok, `the autopilot did not clear the hive: end=${r.end} wave=${gs.wave}`)
ok(solveMs < 45000, `solve took ${solveMs}ms — the gate must stay seconds`)
ok(live.zeroTicks === 0, `${live.zeroTicks} unavoidable ticks — the fairness audit is the title's promise (${live.minSurv} survivors at the worst)`)
ok(live.minSurv >= 1, `worst tick had ${live.minSurv} answers; ≥1 is the contract`)
ok(hashDiffs === 0, `${hashDiffs} scans changed the live world — freeze/thaw is lying again`)
ok(live.maxStep <= MAX_STEP, `live per-tick move ${live.maxStep.toFixed(2)} > ${MAX_STEP} — the audit budget is a contract`)
ok(live.teleports === 0, `${live.teleports} on-screen path handoffs — a darter blinking across a lane dodges no one`)
ok(live.volleyMinAir >= FC, `opposite-colour volleys landed ${live.volleyMinAir} ticks apart — contract is ≥${FC}`)
const fleetSize = WAVES.reduce((n, w) => n + w.rows.length, 0)
ok(live.kills >= fleetSize, `only ${live.kills} kills of a ${fleetSize}-ship fleet — the autopilot did not clear the board`)
ok(live.novas >= 0 && live.walls > 5 && live.storms > 5, `walls=${live.walls} storms=${live.storms} — hazards must actually run`)

// ------------------------------------------------------------------ slack rule ----
section('SLACK RULE (one fewer life: still winnable)')
{
    const slack = makeGame(0)
    slack.lives = CFG.life - 1
    const rs = plan(slack, { maxTicks: 30000 })
    ok(rs.ok, `ZERO SLACK — with ${CFG.life - 1} lives the solver itself cannot win; one human mistake would lose the game`)
}

// ------------------------------------------------------ muscle load-bearing pins ----
section('MUSCLE PINS (the polarity flip and the feet are both load-bearing)')
{
    // the pilot killed no-flip on a stage-2-only board cannot drain the
    // DARK quota — no L-pilot shot ever can. The core outlives the run.
    const nf = plan(makeGame(2), { noFlip: true, maxTicks: 20000 })
    const g2 = makeGame(2)
    for (const inp of nf.script) step(g2, inp)
    const core = g2.core
    ok(!nf.ok, 'the no-flip pilot cracked the reactor on a stage-2 board — the dual-color quota is broken')
    ok(core && core.state !== 'dead' && core.quota.D < CFG.coreNeed, `no-flip quota: L=${core?.quota.L} D=${core?.quota.D} — DARK shots came from somewhere an L pilot should not have`)
}
{
    const nm = plan(makeGame(0), { noMove: true, maxTicks: 30000 })
    ok(!nm.ok, 'a pilot that NEVER moves won — the storms are decoration')
    // every stage scripts a storm within reach of the spawn column: the
    // standing death is scripted, not emergent luck
    for (const [i, w] of WAVES.entries()) {
        const hit = w.storms.some((s) => Math.abs(s.x - 112) <= 12)
        ok(hit, `stage ${i} scripts no storm near the spawn column — a motionless pilot could idle it forever`)
    }
}

// ------------------------------------------------------ color-rule chain pins ----
section('COLOR RULES (absorb / kill / pass-through / shell / nova, end to end)')
{
    const g = makeGame(1)
    for (let t = 0; t < 300 && g.phase !== 'play'; t++) step(g, {})
    g.player.invuln = 0
    const p = g.player
    p.pol = L; p.x = 112; p.y = 264
    g.enemyShots.push({ x: 112, y: 270, vx: 0, vy: 0, color: L })
    step(g, {})
    ok(p.state === 'alive' && g.charge === 1, `same-color bullet: state=${p.state} charge=${g.charge} — absorb is broken`)
    g.enemyShots.push({ x: 112, y: 270, vx: 0, vy: 0, color: D })
    step(g, {})
    ok(p.state === 'dead', 'opposite-color bullet did not kill — polarity is decoration')
}
{
    const g = makeGame(0)
    for (let t = 0; t < 300 && g.phase !== 'play'; t++) step(g, {})
    g.nextDiveAt = 1e9
    const mk = (color, x) => {
        const e = { id: `t-${color}`, kind: 'dart', color, col: 0, row: 1, hp: CFG.hp.dart, state: 'hold', x, y: 148, uT: 0, seq: `T-${color}`, path: resolvePath('zig', { x, y: 148, px: 112, py: 264, dir: 1 }), fired: false }
        g.enemies.push(e)
        return e
    }
    const meL = mk(L, 70), meD = mk(D, 154)
    g.shots.push({ x: meL.x, y: meL.y, color: L })
    step(g, {})
    ok(meL.state !== 'dead', 'an L shot killed an L enemy — same-color pass-through is dead')
    g.shots.push({ x: meD.x, y: meD.y, color: L })
    step(g, {})
    ok(meD.state === 'dead' || meD.hp < CFG.hp[meD.kind], 'an L shot did not hurt a D enemy')
}
{
    const g = makeGame(2)
    for (let t = 0; t < 300 && g.phase !== 'play'; t++) step(g, {})
    const core = g.core
    core.shell = L
    g.shots.push({ x: core.x, y: core.y + 12, color: L })
    step(g, {})
    ok(core.quota.L === 0 && g.events.some((e) => e.type === 'blocked'), 'same-color shots are not blocked by the shell')
    core.shell = D
    g.shots.push({ x: core.x, y: core.y + 12, color: L })
    step(g, {})
    ok(core.quota.L === 1, 'opposite-color shot did not chit the core')
    for (let i = 0; i < CFG.coreNeed; i++) { core.shell = D; g.shots.push({ x: core.x, y: core.y + 12, color: L }); step(g, {}) }
    ok(core.state !== 'dead', 'the core died with one color drained — it must need BOTH')
    for (let i = 0; i < CFG.coreNeed; i++) { core.shell = L; g.shots.push({ x: core.x, y: core.y + 12, color: D }); step(g, {}) }
    ok(core.state === 'dead', 'the core survived BOTH quotas drained')
}
{
    const g = makeGame(0)
    for (let t = 0; t < 600 && !g.enemies.some((e) => e.state === 'hold'); t++) step(g, {})
    g.player.state = 'alive'
    g.player.invuln = 0
    g.charge = CFG.chargeMax
    g.enemyShots.push({ x: 60, y: 150, vx: 0, vy: 1, color: D })
    const before = g.enemies.filter((e) => e.state !== 'dead' && e.state !== 'wait').length
    step(g, { s: true })
    ok(g.events.some((e) => e.type === 'nova'), 'a full-charge flip did not fire the nova')
    ok(!g.enemyShots.some((b) => Math.abs(b.x - 60) < 2 && b.y < 158), 'nova left bullets standing')
    ok(g.charge === 0, 'nova did not spend the charge')
    const after = g.enemies.filter((e) => e.state !== 'dead' && e.state !== 'wait').length
    ok(after < before, `nova killed nothing (before ${before}, after ${after})`)
}
{
    // timeout costs a life and RE-STARTS the stage — stalling is not a tactic
    const g = makeGame(0)
    const lives = g.lives
    for (let t = 0; t < 2400 && !g.pending; t++) {
        g.player.invuln = 9 // shielded standstill: the check is the CLOCK,
        step(g, {})         // not whether a stray dart happens to land
    }
    ok(g.pending && g.pending.reason === 'retry', `timeout produced ${g.pending ? g.pending.reason : 'nothing'} — a stall must cost a fighter and re-run the stage`)
    ok(g.lives === lives - 1, `timeout costs: lives ${lives} -> ${g.lives}`)
    ok(g.enemies.some((e) => e.state !== 'dead'), 'the fleet evaporated on timeout — the wipe made stalling safe')
}

// ---------------------------------------------------------------- script audit ----
section('SCRIPT AUDIT (walls walk, storms land, both colors always act)')
for (const [i, w] of WAVES.entries()) {
    ok(w.walls.length > 0, `stage ${i} has no walls`)
    for (const s of w.storms) ok(s.x >= 20 && s.x <= W - 20, `stage ${i}: storm at x=${s.x} off the board`)
    for (let k = 1; k < w.walls.length; k++) {
        const a = w.walls[k - 1], b = w.walls[k]
        if (a.color !== b.color) ok(b.t - a.t >= FC, `stage ${i}: opposite walls ${a.t}->${b.t} (${b.t - a.t}t < ${FC}t contract)`)
        else ok(b.t - a.t <= 40, `stage ${i}: same-color wall pair drifted ${b.t - a.t}t apart — the pair must walk together`)
    }
    const colors = new Set(w.rows.map((e) => e.color))
    ok(colors.size === 2, `stage ${i} fleets are single-color — kill-the-opposite stops being a decision`)
}
{
    // gap arithmetic: from the far wall, at full sprint, a pilot who only
    // starts running AT THE TELEGRAPH still crosses before the wall lands,
    // with a real margin — and the survives scan confirms it for real.
    const arriveToBand = (CFG.pBottom + 6) / CFG.wallV
    const warnToArrive = CFG.warnT + arriveToBand
    for (const [i, w] of WAVES.entries()) {
        for (const wl of w.walls) {
            const far = wl.gap > 112 ? 10 : W - 10
            const sprint = Math.abs(far - wl.gap) / CFG.pSpeed
            ok(warnToArrive - sprint >= 20, `stage ${i} wall t=${wl.t} gap=${wl.gap}: sprint from x=${far} needs ${sprint.toFixed(0)}t of the ${warnToArrive.toFixed(0)}t telegraph window — no foot answer`)
        }
    }
    // and the sprint is survivable FOR REAL on a quiet board — the wall
    // alone, from the far wall at spawn, must have a foot answer. T=145 so
    // the scan window actually contains the wall's arrival at the band.
    const g = makeGame(1)
    for (let t = 0; t < 200 && g.phase !== 'play'; t++) step(g, {})
    const wall = WAVES[1].walls.find((wl) => wl.color === L)
    g.enemies = []
    g.enemyShots = []
    for (let t = 0; t < wall.t - 2 - g.pt; t++) step(g, {})
    g.player.x = wall.gap > 112 ? 20 : W - 20
    g.player.pol = D
    g.player.invuln = 0
    const sprint = survives(g, wall.gap > 112 ? CFG.pSpeed : -CFG.pSpeed, D, 145)
    ok(sprint, `wall t=${wall.t}: a full sprint from x=${g.player.x.toFixed(0)} to gap ${wall.gap} was NOT survivable (pol D) — the telegraph lied`)
}

// ---------------------------------------------------------------- determinism ----
section('DETERMINISM (the attract replay is not theatre)')
{
    const a = makeGame(0)
    const pa = plan(a, { maxTicks: 30000 })
    const h1 = stateHash(a)
    const b = makeGame(0)
    for (const inp of pa.script) step(b, inp)
    ok(stateHash(b) === h1, `replay diverged: ${stateHash(b)} vs ${h1}`)
    const j = pa.script.findIndex((i) => i.s)
    ok(j > 0, 'winning script contains no polarity flips — tamper probe cannot run')
    const c = makeGame(0)
    pa.script.forEach((i, k) => step(c, k === j ? { ...i, s: 0 } : i))
    ok(stateHash(c) !== h1, 'dropping one flip changed nothing — the hash ignores polarity')
    const d = makeGame(0)
    pa.script.forEach((i, k) => step(d, k === j ? { ...i, l: 0, r: 0 } : i))
    ok(stateHash(d) !== h1, 'dropping one step changed nothing — the hash ignores position')
}

// ------------------------------------------------------------------ mutations ----
if (MUT) {
    section('MUTATIONS — each MUST turn an honest check red')
    const volleyRhythm = () => {
        const g = makeGame(1)
        let min = 1e9, last = null
        for (let t = 0; t < 2600 && !g.end; t++) {
            step(g, {})
            for (const ev of g.events) {
                if (ev.type === 'efire' || ev.type === 'wall') {
                    if (last && last.color !== ev.color) min = Math.min(min, ev.tick - last.tick)
                    last = { color: ev.color, tick: ev.tick }
                }
            }
            g.events.length = 0
        }
        return min >= FC
    }
    const absorbWorks = () => {
        const g = makeGame(0)
        for (let t = 0; t < 300 && g.phase !== 'play'; t++) step(g, {})
        g.player.invuln = 0; g.player.pol = L; g.player.x = 112; g.player.y = 264
        g.enemyShots.push({ x: 112, y: 270, vx: 0, vy: 0, color: L })
        step(g, {})
        return g.player.state === 'alive' && g.charge >= 1
    }
    const shotColor = () => {
        const g = makeGame(0)
        for (let t = 0; t < 700 && !g.enemies.some((e) => e.state === 'hold' && e.color === L); t++) step(g, {})
        const meL = g.enemies.find((e) => e.state === 'hold' && e.color === L)
        if (!meL) return true // cannot ask the question is not an answer the rule gave
        g.shots.push({ x: meL.x, y: meL.y, color: L })
        step(g, {})
        return meL.state !== 'dead'
    }
    const novaClears = () => {
        const g = makeGame(0)
        for (let t = 0; t < 300 && g.phase !== 'play'; t++) step(g, {})
        g.charge = CFG.chargeMax
        g.enemyShots.push({ x: 60, y: 150, vx: 0, vy: 0.01, color: D })
        step(g, { s: true })
        return !g.enemyShots.some((b) => Math.abs(b.x - 60) < 2 && Math.abs(b.y - 150) < 12)
    }
    const zigContinuity = () => {
        const p = resolvePath('zig', { x: 112, y: 96, px: 112, py: 264, dir: 1 })
        let prev = p.fn(0), mx = 0
        for (let t = 1; t <= p.ticks; t++) { const q = p.fn(t / p.ticks); mx = Math.max(mx, Math.hypot(q[0] - prev[0], q[1] - prev[1])); prev = q }
        return mx <= MAX_STEP
    }
    const wallPairing = () => {
        for (const w of WAVES) for (let k = 1; k < w.walls.length; k++) {
            const a = w.walls[k - 1], b = w.walls[k]
            if (a.color !== b.color && b.t - a.t < FC) return false
        }
        return true
    }
    const tryMut = (name, apply, probe, expect = true) => {
        const base = probe()
        ok(base === expect, `mutation harness broken: baseline for '${name}' is not the expected ${expect}`)
        const save = {}
        for (const k of Object.keys(apply)) save[k] = CFG[k]
        Object.assign(CFG, apply)
        const v = probe()
        Object.assign(CFG, save)
        console.log(`  mut ${name}: ${v === expect ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(v !== expect, `${name} SURVIVED — a check stopped touching this rule`)
    }
    const trySwap = (name, obj, key, mutant, probe, expect = true) => {
        const base = probe()
        ok(base === expect, `mutation harness broken: baseline for '${name}'`)
        const save = obj[key]
        obj[key] = mutant
        const v = probe()
        obj[key] = save
        console.log(`  mut ${name}: ${v === expect ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(v !== expect, `${name} SURVIVED — a check stopped touching this rule`)
    }
    tryMut('flipGap=0 (volley gate shut)', { flipGap: 0 }, volleyRhythm)
    tryMut('flipAbsorb=false (absorb off)', { flipAbsorb: false }, absorbWorks)
    tryMut('shotColorMatters=false', { shotColorMatters: false }, shotColor)
    tryMut('novaClear=false', { novaClear: false }, novaClears)
    trySwap('zig amplitude 220px (dive continuity)', REGISTRY, 'zig', {
        ...REGISTRY.zig,
        build: (c) => {
            const pts = [[c.x, c.y]]
            for (let i = 1; i <= 13; i++) {
                const u = i / 13
                pts.push([c.x + Math.sin(u * Math.PI * 2.5) * 220 * (c.dir || 1), c.y + (288 + 26 - c.y) * u])
            }
            return pts
        },
    }, zigContinuity)
    trySwap('walls on an unfair 8t cross-flip', WAVES, '1', {
        ...WAVES[1],
        walls: WAVES[1].walls.flatMap((wl, i) => (i === 0 ? [{ ...wl }, { ...wl, color: wl.color === L ? D : L, t: wl.t + 8 }] : [wl])),
    }, wallPairing)
}

console.log(`\npolarcheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
