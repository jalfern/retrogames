// GALAGA — the harness. No browser, a few seconds. This is the gate for
// the issue's muscle ("scripted enemy behaviour trees with verifiable dive
// paths"): every path is sampled tick-by-tick offline, every LIVE move in
// a real run is measured, the behavior tree's rule order is pinned, the
// capture -> escort -> rescue -> double chain is run end to end, and the
// autopilot that IS the attract demo must clear all three stages — once
// with the real life count and once with ONE FEWER (the slack rule).
//
//   npm run galactcheck
//   npm run galactcheck -- --mutate   # re-break the load-bearing rules;
//                                     # a surviving mutant means a check
//                                     # stopped touching the code
import { makeGame, step, decide, CFG, stateHash } from '../src/games/Galaga/sim.js'
import { REGISTRY, resolvePath, MAX_STEP, W, H } from '../src/games/Galaga/paths.js'
import { plan } from '../src/games/Galaga/planner.js'

const MUT = process.argv.includes('--mutate')
let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

// ---------------------------------------------------------------- path audit ----
section('PATH AUDIT (every path, every tick — offline)')
{
    const ctxs = [
        { x: 112, y: 56, px: 60, py: 258, dir: 1, slot: { x: 112, y: 56 } },
        { x: 47, y: 116, px: 200, py: 258, dir: -1, slot: { x: 47, y: 116 } },
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
            if (p.end === 'anchor') ok(Math.hypot(end[0] - ctx.x, end[1] - ctx.y) < 1.5, `${name}: loop does not return to its anchor`)
            if (p.end === 'exit') ok(end[1] >= H + 16, `${name}: one-way does not exit through the bottom (ends y=${end[1].toFixed(1)})`)
            if (p.end === 'top') ok(end[1] <= -14, `${name}: does not leave through the top (ends y=${end[1].toFixed(1)})`)
        }
    }
    ok(REGISTRY.beam.band && REGISTRY.beam.band[1] > REGISTRY.beam.band[0], 'beam has no open-band window')
    let threw = false
    try { resolvePath('teleport-warp', ctxs[0]) } catch { threw = true }
    ok(threw, 'resolvePath accepted an unknown path name — the rejected-skill rule is dead')
}

// ------------------------------------------- the live run + trajectory audit ----
section('THE RUN (autopilot = attract demo) + LIVE trajectory audit')
const t0 = Date.now()
const live = { maxStep: 0, teleports: 0, diveKinds: new Set(), kills: 0, deaths: 0, clears: 0, prev: new Map() }
const gs = makeGame(0)
let seen = 0
const r = plan(gs, {
    onFrame: () => {
        for (const e of gs.enemies) {
            const b = live.prev.get(e.id)
            live.prev.set(e.id, { x: e.x, y: e.y, state: e.state, path: e.path })
            if (!b || b.state === 'wait' || b.state === 'dead' || e.state === 'wait' || e.state === 'dead') continue
            live.maxStep = Math.max(live.maxStep, Math.hypot(e.x - b.x, e.y - b.y))
            if (e.path !== b.path && b.state !== 'hold' && b.state !== 'entry') {
                const off = (x, y) => x < -8 || x > W + 8 || y < -8 || y > H + 8
                const anchor = b.state === 'dive' && e.state === 'hold' && b.path.end === 'anchor'
                if (!off(b.x, b.y) && !off(e.x, e.y) && !anchor) {
                    live.teleports++
                    console.log(`  ..    on-screen handoff: ${b.state}(${b.x.toFixed(0)},${b.y.toFixed(0)}) -> ${e.state}(${e.x.toFixed(0)},${e.y.toFixed(0)})`)
                }
            }
        }
        for (const ev of gs.events.slice(seen)) {
            seen++
            if (ev.type === 'dive') live.diveKinds.add(ev.path)
            if (ev.type === 'kill') live.kills++
            if (ev.type === 'death') live.deaths++
            if (ev.type === 'clear') live.clears++
        }
    },
})
const solveMs = Date.now() - t0
ok(r.ok, `the autopilot did not clear the hive: end=${r.end} wave=${gs.wave}`)
ok(solveMs < 30000, `solve took ${solveMs}ms — the gate must stay seconds`)
ok(live.maxStep <= MAX_STEP, `live per-tick move ${live.maxStep.toFixed(2)} > ${MAX_STEP} — the audit budget is a contract`)
ok(live.teleports === 0, `${live.teleports} on-screen path handoffs — a bee blinking across the screen can dodge no one`)
ok(live.diveKinds.has('zig') && live.diveKinds.has('swoop') && live.diveKinds.has('loop'),
    `dive kinds used: ${[...live.diveKinds].join(',')} — every script in the library must see play`)
ok(live.kills >= 40, `only ${live.kills} kills — the hive did not really empty`)
ok(live.clears === 2 || r.ok, `cleared ${live.clears} stages`)

// ------------------------------------------------------------------ slack rule ----
section('SLACK RULE (one fewer life: still winnable)')
{
    const slack = makeGame(0)
    slack.lives = CFG.life - 1
    const rs = plan(slack)
    ok(rs.ok, `ZERO SLACK — with ${CFG.life - 1} lives the solver itself cannot win; one human mistake would lose the game`)
}

// ------------------------------------------------------------- behavior tree pins ----
section('BEHAVIOR TREE (rule order is the law)')
{
    // a captive exists => nobody else dives; the captive takes the sky
    const g2 = makeGame(1)
    for (let t = 0; t < 400 && g2.phase !== 'play'; t++) step(g2, {})
    g2.enemies.push({ id: 'x-cap', kind: 'captive', col: 3, row: 3, aboard: true, hp: 1, state: 'hold', x: 91, y: 146, uT: 0, path: resolvePath('entryBeeL', { x: 91, y: 146, dir: 1 }), fired: false })
    g2.enemies.push({ id: 'x-bee', kind: 'bee', col: 1, row: 2, hp: 1, state: 'hold', x: 47, y: 116, uT: 0, path: resolvePath('entryBeeL', { x: 47, y: 116, dir: 1 }), fired: false })
    const captiveDive = (() => {
        for (let k = 1; k <= CFG.escortPeriod * 2; k++) {
            const act = decide(g2, g2.enemies[g2.enemies.length - 2])
            if (act) return act
            g2.pt++
        }
        return null
    })()
    ok(captiveDive && captiveDive.type === 'dive', 'the captive never committed to a dive — rescue window never opens')
    const beeLocked = g2.enemies[g2.enemies.length - 1]
    let anyBeeDived = false
    for (let k = 0; k < CFG.escortPeriod * 4 && CFG.diveMin < 1e8; k++) { g2.pt++; if (decide(g2, beeLocked)) { anyBeeDived = true; break } }
    ok(!anyBeeDived, 'a formation bee dove while a captive held the stage — Rule 1 priority is dead')

    // at most two divers share the sky
    const g3 = makeGame(1)
    let peak = 0
    for (let t = 0; t < 3000 && !g3.end && g3.phase !== 'banner'; t++) step(g3, {})
    g3.pt = 0
    for (let t = 0; t < 6000; t++) {
        step(g3, {})
        peak = Math.max(peak, g3.enemies.filter((e) => e.state === 'dive').length)
        if (g3.end) break
    }
    ok(peak <= 2, `peak ${peak} simultaneous divers — the hive overcommitted (cap is 2)`)

    // the tractor beam: fires, carries, and never a second time per stage
    const g4 = makeGame(1)
    let beams = 0, captured = false
    g4.player.y = 250
    for (let t = 0; t < 2600 && !captured && !g4.end; t++) {
        g4.player.invuln = 30 // the dummy stands still; the swarm WILL shoot at it
        const bl = g4.enemies.find((e) => e.state === 'beam')
        if (bl && bl.bandX) g4.player.x = bl.bandX
        if (bl && !bl.bandX) g4.player.x = 112
        step(g4, {})
        beams = g4.events.filter((e) => e.type === 'beam').length
        captured = g4.events.some((e) => e.type === 'captured')
    }
    ok(captured, 'standing inside the band for a whole stage never got the player captured')
    ok(beams === 1, `the beam fired ${beams} times in one stage — once per stage is the rule`)
    const g4b = makeGame(1)
    g4b.player.y = 250
    let captured2 = false
    for (let t = 0; t < 2600 && !captured2 && !g4b.end; t++) {
        g4b.player.invuln = 30
        const bl = g4b.enemies.find((e) => e.state === 'beam')
        if (bl && bl.bandX) g4b.player.x = bl.bandX
        step(g4b, {})
        captured2 = g4b.events.some((e) => e.type === 'captured')
        if (captured2) {
            g4b.events.length = 0
            for (let u = 0; u < 900; u++) {
                if (g4b.pending) break // the stage ended — a NEW stage may beam, that is not "a second beam"
                step(g4b, {})
                const again = g4b.enemies.some((e) => e.state === 'beam' && e.bandX)
                if (again) { ok(false, 'a second tractor beam ran inside the capture stage'); break }
            }
            ok(true, 'no second tractor beam inside the capture stage (once per stage holds)')
        }
    }
    ok(captured2, 'second capture run never fired (setup)')
}

// ------------------------------------------------ capture -> rescue -> DOUBLE chain ----
section('CAPTURE / RESCUE CHAIN (the bonus, end to end)')
{
    const g5 = makeGame(1)
    g5.lives = 3
    let cap = false
    for (let t = 0; t < 3000 && !cap; t++) {
        g5.player.invuln = 30
        const bl = g5.enemies.find((e) => e.state === 'beam')
        if (bl && bl.bandX) g5.player.x = bl.bandX
        step(g5, {})
        cap = g5.events.some((e) => e.type === 'captured')
    }
    ok(cap && g5.lives === 2, `captured: lives=${g5.lives} (a capture costs exactly one fighter)`)
    // next stage carries a captive (carry ride + pending + banner first)
    for (let t = 0; t < 500; t++) { g5.player.invuln = 30; step(g5, {}) }
    const captive = g5.enemies.find((e) => e.kind === 'captive')
    ok(!!captive && captive.aboard, 'the stage after a capture has no captive aboard — the fighter was not taken')
    // put the captive straight into its dive, shoot it down, catch the fighter
    captive.state = 'hold'
    let loose = false, rescued = false
    for (let t = 0; t < 3000 && !rescued; t++) {
        g5.player.invuln = 30
        if (captive.state === 'hold' && captive.kind === 'captive') {
            captive.state = 'dive'
            captive.path = resolvePath('zig', { x: captive.x, y: captive.y, px: 112, py: 258, dir: 1 })
            captive.uT = 0
            captive.fired = true
        }
        const targetX = g5.fallers.length ? g5.fallers[0].x : captive.x
        g5.player.x = targetX
        const wantFire = !g5.fallers.length && captive.state === 'dive' && Math.abs(targetX - captive.x) < 6
        step(g5, { f: wantFire && g5.shots.length < 2 ? 1 : 0 })
        loose = loose || g5.events.some((e) => e.type === 'fighterloose')
        rescued = g5.events.some((e) => e.type === 'rescued')
    }
    ok(loose, 'the captive never died to gunfire in its dive (setup or hitboxes broken)')
    ok(rescued, 'the falling fighter was never caught')
    ok(g5.double, 'a rescued fighter did not DOUBLE the player — the bonus is theatre')
    ok(g5.lives === 3, `lives after rescue ${g5.lives} (capture costs one, rescue pays one back)`)
    // friendly fire: your own bullet flying UP past it kills your own fighter
    const g6 = makeGame(1)
    g6.fallers.push({ x: 112, y: 150, vy: 1.3 })
    g6.shots.push({ x: 112, y: 168 })
    step(g6, {})
    ok(g6.events.some((e) => e.type === 'lostfighter'), 'a bullet passed through the falling fighter without killing it — friendly fire is off')
}

// ------------------------------------------------------------ determinism ----
section('DETERMINISM (the attract replay is not theatre)')
{
    const a = makeGame(0)
    const pa = plan(a)
    const h1 = stateHash(a)
    const b = makeGame(0)
    for (const inp of pa.script) step(b, inp)
    ok(stateHash(b) === h1, `replay diverged: ${stateHash(b)} vs ${h1}`)
    const j = pa.script.findIndex((i) => i.f)
    ok(j > 0, 'winning script contains no fire — tamper probe cannot run')
    const c = makeGame(0)
    pa.script.forEach((i, k) => step(c, k === j ? { ...i, f: 0 } : i))
    ok(stateHash(c) !== h1, 'dropping one fire changed nothing — the hash ignores bullets')
}

// ------------------------------------------------------------------ mutations ----
if (MUT) {
    section('MUTATIONS — each MUST turn an honest check red')
    const capture = () => {
        const g = makeGame(1)
        g.player.y = 250
        for (let t = 0; t < 2600; t++) {
            const bl = g.enemies.find((e) => e.state === 'beam')
            if (bl && bl.bandX) g.player.x = bl.bandX
            step(g, {})
            if (g.events.some((e) => e.type === 'captured')) return true
            if (g.end) return false
        }
        return false
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
    tryMut('beamOff (tractor beam disabled)', { beamOff: true }, capture)
    tryMut('escortPeriod=inf (captive never dives)', { escortPeriod: 1e9 }, () => {
        const g = makeGame(1)
        g.pt = 0
        let d = false
        for (let t = 0; t < 4000; t++) {
            step(g, {})
            if (g.enemies.some((e) => e.kind === 'captive' && e.state === 'dive')) { d = true; break }
            if (t === 1500 && !g.enemies.some((e) => e.kind === 'captive')) g.enemies.push({ id: 'm', kind: 'captive', col: 3, row: 3, aboard: true, hp: 1, state: 'hold', x: 91, y: 146, uT: 0, path: resolvePath('entryBeeL', { x: 91, y: 146, dir: 1 }), fired: false })
        }
        return d
    })
    tryMut('diveMin=inf (no dives ever)', { diveMin: 1e9, diveBase: 1e9 }, () => {
        const g = makeGame(0)
        let any = false
        for (let t = 0; t < 4000 && !g.end; t++) { step(g, {}); if (g.enemies.some((e) => e.state === 'dive')) any = true }
        return any
    })
    tryMut('rescueDouble=false (rescue grants no double)', { rescueDouble: false }, () => {
        const g = makeGame(1)
        g.fallers.push({ x: 112, y: 250, vy: 1.3 })
        step(g, {})
        return g.double
    })
}

console.log(`\ngalactcheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
