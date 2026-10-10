// ICE CLIMBER CO-OP — the co-op autopilot: the same closed-loop macro driver
// behind the attract demo, the DebugKit PROGNOSIS and `scripts/icecheck.mjs`.
// It speaks ONLY like a player: per-tick input vectors for BOTH climbers,
// chosen from what the climber can feel (position, grounded, flank, bird
// position) — never a scripted walk-through, never a peek at solutions. If a
// mountain cannot be won this way with its hazards live, the audit fails the
// build, and a --mutate that silences dig/shoulder must make IT lose.
//
// The route per mountain: walk the corridor, punch the massif while drifting
// against the far wall (the punched column opens straight through the shelf),
// snap onto the shelf at the flank-death, and collect. Condor Pass launches
// its climb on a SIMULATED phase — it clones the live state and dry-runs the
// climb until the landing happens with the condor far right, because a climb
// is ~700 ticks and the bird's patrol is a fixed triangle wave: timing is
// a property of the mountain, not of luck. The Stack stands one climber on
// the other's head and jumps twice — 1.5 + 2.1 ≥ 3, the only height in the
// game that reaches the carrot shelf.

import { CFG, step, makeGame, cloneGame } from './sim.js'
import { buildLevel } from './levels.js'

const idle = () => ({ a: {}, b: {} })
const mk = (o = {}) => ({ l: 0, r: 0, j: 0, u: 0, ...o })

class Fail extends Error {}

// One macro tick engine: `drive` issues who's inputs each tick, idles the
// other climber, records every tick, and stops when `until` or `land` says
// stop. `abort` may rewrite inputs mid-flight (the condor release).
function drive(g, out, who, inputsFor, until, max) {
    for (let t = 0; t < max; t++) {
        const c = g.climbers[who]
        if (g.end === 'dead') throw new Fail(`dead at tick ${g.tick} (${who})`)
        if (until && until(g, c, t)) return t
        const inp = inputsFor(g, c, t)
        out.push({ a: who === 0 ? inp : {}, b: who === 1 ? inp : {} })
        step(g, out[out.length - 1])
        if (g.end === 'clear') return t
    }
    throw new Fail(`timeout after ${max} ticks`)
}

function waitTicks(g, out, n) {
    for (let i = 0; i < n; i++) { out.push(idle()); step(g, out[out.length - 1]); if (g.end) return }
}

function stuckCheck(seen, c) {
    const last = seen[seen.length - 1]
    if (last && Math.abs(c.x - last.x) < 0.002 && Math.abs(c.y - last.y) < 0.002) return seen.length >= 60
    return false
}

function walkTo(g, out, who, tx) {
    const seen = []
    drive(g, out, who,
        (gg, c) => mk(c.x < tx ? { r: 1 } : { l: 1 }),
        (gg, c) => {
            if (Math.abs(c.x - tx) < 0.12) return true
            seen.push({ x: c.x, y: c.y })
            if (seen.length > 30) seen.shift()
            if (stuckCheck(seen, c)) throw new Fail(`walkTo stuck at ${c.x.toFixed(2)},${c.y.toFixed(2)}`)
            return false
        }, 900)
}

// Bore the massif: hold UP and drift against the far wall ONLY while the
// body is inside the ice band (below the corridor ceiling, above the shelf) —
// outside the band there is no wall to park against and drifting is how you
// miss the shelf. Ends with a snap onto the summit shelf.
function climbToShelf(g, out, who) {
    drive(g, out, who,
        (gg, c) => mk({ u: 1, r: c.y < 31 && c.y > 8.499 ? 1 : 0 }),
        (gg, c) => c.grounded && c.y <= 6.3,
        1500)
    if (g.end) return
    const c = g.climbers[who]
    if (!c.grounded || Math.abs(c.y - 6) > 0.4) throw new Fail(`climb ended at y=${c.y.toFixed(2)} not the shelf`)
}

// Condor Pass: dry-run the climb on clones, launch on the first phase whose
// landing moment finds the bird past x=10.2. Pure sim, so a trial is exact.
function launchPhased(g, out, who) {
    for (let delay = 0; delay < 520; delay += 4) {
        const t = cloneGame(g)
        let ok = false
        try {
            for (let i = 0; i < delay; i++) step(t, idle())
            const o2 = []
            drive(t, o2, who,
                (gg, c) => mk({ u: 1, r: c.y < 31 && c.y > 8.499 ? 1 : 0 }),
                (gg, c) => c.grounded && c.y <= 6.3, 1500)
            ok = t.climbers[who].grounded && t.birds[0].x > 10.2
        } catch { ok = false }
        if (ok) {
            waitTicks(g, out, delay)
            climbToShelf(g, out, who)
            return delay
        }
    }
    throw new Fail('no safe condor phase found')
}

function dashToCarrot(g, out, who) {
    const carrot = g.carrot
    const tx = carrot[0] + 0.35
    drive(g, out, who, () => mk(), (gg) => !gg.birds.length || gg.birds[0].x >= 12.5, 700)
    walkTo(g, out, who, tx)
}

// The co-op bill: P2 waits on the shelf, P1 lands on the head, jumps again,
// takes the carrot shelf. Every number here is the sim's own: head at +1.5,
// rise 2.1, shelf at +3.
function theStack(g, out) {
    const [a, b] = g.climbers
    walkTo(g, out, 1, 9.4)
    walkTo(g, out, 0, 9.32)
    const pulse = () => {
        for (const j of [1, 0]) {
            out.push({ a: { j }, b: {} })
            step(g, out[out.length - 1])
            if (g.end) return
        }
    }
    // ride each jump to a landing
    const ride = (cond, max) => drive(g, out, 0, () => mk(), cond, max)
    pulse()
    ride(() => a.grounded && a.onPartner && Math.abs(a.y - (b.y - CFG.h)) < 0.3, 140)
    if (g.end) return
    if (!a.onPartner) throw new Fail('first hop missed the head')
    pulse()
    ride(() => a.grounded && !a.onPartner && a.y <= 3.35, 160)
    if (g.end) return
    if (!a.grounded || a.y > 3.4) throw new Fail(`stack jump ended at y=${a.y.toFixed(2)}`)
    g.receipts.stack = (g.receipts.stack || 0) + 1
    walkTo(g, out, 0, 10.2)
}

function recover(g, out) {
    // A climber went down. The other one is on the shelf (the only place a
    // condor can reach); walk to the body and touch it.
    for (let k = 0; k < 4 && g.climbers.some(c => c.down); k++) {
        const dn = g.climbers.find(c => c.down)
        const sv = g.climbers.find(c => !c.down)
        if (!sv) throw new Fail('nobody left to send')
        walkTo(g, out, sv.id, dn.x + (sv.x < dn.x ? -0.3 : 0.3))
        for (let i = 0; i < 60 && dn.down; i++) { out.push(idle()); step(g, out[out.length - 1]) }
        if (!dn.down) g.receipts.revives++
    }
    if (g.climbers.some(c => c.down)) throw new Fail('revive failed')
}

function nextMountain(g) {
    const meta = buildLevel(g.level + 1)
    g.level = g.level + 1
    if (g.level >= 3) { g.end = 'win'; return }
    g.grid.set(meta.grid)
    g.carrot = [...meta.carrot]
    g.carrotTaken = false
    g.birds = (meta.birds || []).map((b, i) => ({ id: i, ...b, dir: b.dir || 1 }))
    g.climbers.forEach(c => Object.assign(c, {
        x: meta.spawn.x, y: meta.spawn.y, vy: 0, grounded: false, climbing: false,
        punchT: 0, down: false, invuln: 0, onPartner: false, jumps: 0, prevJ: false,
    }))
    g.end = null
}

// Drive the whole three-mountain game from `g`. Mutates g; returns the
// recorded two-player script + honest receipts. Resumable: every macro is
// closed-loop on absolute targets, so PROGNOSIS can re-run it from any live
// (mutated) state.
export function plan(g) {
    const out = []
    const advanceAt = []
    g.receipts = { digs: 0, stack: 0, revives: 0, dodges: 0 }
    const run = (fn, retries = 1) => {
        for (let k = 0; k <= retries; k++) {
            try { fn(); return } catch (e) {
                if (e instanceof Fail && g.climbers.some(c => c.down) && g.end !== 'dead' && k < retries) {
                    recover(g, out)
                    continue
                }
                throw e
            }
        }
    }
    try {
        while (g.level < 3 && g.tick < 60000) {
            const lv = g.level
            if (lv === 0) {
                run(() => walkTo(g, out, 0, 8.5))
                run(() => climbToShelf(g, out, 0))
                run(() => walkTo(g, out, 1, 8.5))
                run(() => climbToShelf(g, out, 1))
                run(() => walkTo(g, out, 0, 10.35))
            } else if (lv === 1) {
                run(() => walkTo(g, out, 0, 8.5))
                run(() => launchPhased(g, out, 0))
                g.receipts.dodges++
                run(() => walkTo(g, out, 0, 7.3), 2)      // retreat to the pocket
                run(() => dashToCarrot(g, out, 0), 2)
                run(() => walkTo(g, out, 1, 8.5))
                run(() => climbToShelf(g, out, 1))
            } else {
                run(() => walkTo(g, out, 0, 8.5))
                run(() => climbToShelf(g, out, 0))
                run(() => walkTo(g, out, 1, 8.5))
                run(() => climbToShelf(g, out, 1))
                run(() => theStack(g, out), 2)
            }
            if (g.end === 'clear') { advanceAt.push(out.length); g.score += 500; nextMountain(g) }
            else break
        }
    } catch (e) {
        g.receipts.digs = g.climbers.reduce((n, c) => n + c.digs, 0)
        return { script: out, advanceAt, ok: g.end === 'win', end: g.end || 'stuck', reason: e.message, receipts: g.receipts }
    }
    g.receipts.digs = g.climbers.reduce((n, c) => n + c.digs, 0)
    return { script: out, advanceAt, ok: g.end === 'win', end: g.end, reason: null, receipts: g.receipts }
}

export function planRun() {
    return plan(makeGame(buildLevel(0)))
}

// Replay a recorded script on a fresh mountain. Level advances happen HERE
// (nextMountain is a planner concern, not a sim one), so a replayed script
// must reproduce the solve tick-for-tick — that is the determinism contract.
export function replay(meta0, script, advanceAt = []) {
    const g = makeGame(meta0)
    const at = new Set(advanceAt)
    for (let i = 0; i < script.length; i++) {
        if (at.has(i)) { g.score += 500; nextMountain(g); if (g.end === 'win') break }
        step(g, script[i])
        if (g.end === 'dead') break
    }
    if (g.end === 'clear') { g.score += 500; nextMountain(g) }
    return g
}
