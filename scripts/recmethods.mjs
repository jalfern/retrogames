// REMETHODS (#527 item 3) — every input method gets a reference replay.
//
// The format's reference file (public/replays/gauntlet-2p.json, owned by
// replaycheck) is a `stick` run. This check adds the other two methods of
// THE one pad so each has a file a reviewer (or a trainee) can point at:
//
//   public/replays/bubble-bobble-2p.json  method `dpad`   — 2P co-op: seat 1
//       a human slot fed by the device writers, seat 2 the CPU partner Bob
//       (the game's own decide() emitter, exactly as index.jsx wires it).
//   public/replays/lemmings-pointer.json  method `pointer` — THE SPIRE played
//       with the shared press-preview-release gesture: the solver's winning
//       script expressed as finger taps (press on a lemming, release assigns
//       the selected skill), plus one slide that re-targets mid-press and one
//       tap on empty air that commits nothing.
//
// Each file is (re)recorded here, written to disk, read back, and replayed
// through verifyRecording with the game's own contract fold — the sim must
// hit the recorded state.hash at every checkpoint. Coverage gate: the
// rec/v1 files in public/replays must span dpad + stick + pointer.
//
//   node scripts/recmethods.mjs             # green, (re)writes both files
//   node scripts/recmethods.mjs --mutate    # mutant detection for both files
//                                           # (a dropped press / pad must be
//                                           # caught at the next checkpoint)
//   node scripts/recmethods.mjs --rebuild   # force the fresh build stamp onto the
//                                           # files even when bytes are unchanged —
//                                           # run from a detached main tip to
//                                           # regenerate with a stamp that survives
//                                           # the merge

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRecorder, validate, verifyRecording, REC_FORMAT } from '../src/utils/recording.js'
import { makeSlot, padFor } from '../src/utils/slotSources.js'
import { press, release, rawPad, clearAllSlots, setPointer, currentPad, pointerGesture } from '../src/utils/onePad.js'

import { makeGame as makeBob, step as bobStep, stateHash as bobHash } from '../src/games/BubbleBobble/sim.js'
import { decide } from '../src/games/BubbleBobble/planner.js'
import { LEVELS, buildLevel } from '../src/games/Lemmings/levels.js'
import { makeGame as makeLem, step as lemStep, stateHash as lemHash, assign as lemAssign, solve, SKILLS, W as LW, H as LH } from '../src/games/Lemmings/sim.js'

const here = dirname(fileURLToPath(import.meta.url))
const REPLAYS = join(here, '..', 'public', 'replays')
const MUTATE = process.argv.includes('--mutate')

let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`FAIL   ${name}${info ? ` — ${info}` : ''}`) }
}

// #527 item 5 — the stamp must name a commit that survives the squash-merge. On a
// feature branch the capture's own commit dies with the PR, so those runs stamp
// `unknown` (honest); a regeneration from a detached main tip stamps the main
// commit. `--rebuild` forces the fresh stamp even when the bytes are unchanged.
const gitOut = (cmd) => {
    try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null }
    catch { return null }
}
const onMainLine = (() => {
    try { execSync('git merge-base --is-ancestor HEAD origin/main', { stdio: 'ignore' }); return true }
    catch {
        try { execSync('git merge-base --is-ancestor HEAD main', { stdio: 'ignore' }); return true }
        catch { return false }
    }
})()
const REBUILD = process.argv.includes('--rebuild')
const build = onMainLine ? (gitOut('git rev-parse --short HEAD') || 'unknown') : 'unknown'

// A recorded file must round-trip through disk byte-identically. The build stamp
// is preserved from disk when the bytes are unchanged (#527 item 5): a branch or
// CI run must never re-stamp the sample with a commit that won't survive the
// merge, and a committed stamp that names a dead commit is caught by stampGate.
const commitSample = (file, path) => {
    if (!MUTATE) {
        if (!REBUILD && existsSync(path)) {
            const prev = JSON.parse(readFileSync(path, 'utf8'))
            if (prev && JSON.stringify({ ...prev, build: file.build }) === JSON.stringify(file)) file.build = prev.build
        }
        writeFileSync(path, JSON.stringify(file) + '\n')
    }
    return JSON.parse(readFileSync(path, 'utf8'))
}
const roundTrip = (onDisk, fresh, label) => {
    ok(JSON.stringify({ ...onDisk, build: fresh.build }) === JSON.stringify(fresh),
        `${label}: on-disk file is byte-identical to a fresh record (build stamp aside)`,
        `disk=${onDisk.build} fresh=${fresh.build}`)
}
// #527 item 5: the committed stamp is `unknown` or a commit this clone still has.
const stampGate = (onDisk, label) => {
    ok(onDisk.build === 'unknown' || gitOut(`git rev-parse --verify '${onDisk.build}^{commit}'`) !== null,
        `${label}: build stamp ${onDisk.build} is unknown or names a commit this clone has`,
        'regenerate from a detached main tip: node scripts/recmethods.mjs --rebuild')
}

// =================================================================== BOBBLE ==
// Co-op dpad: seat 1 is a human slot on the device writers, seat 2 is CPU Bob
// through the game's own emitter. The contract fold (index.jsx tick) edge-
// fires seat 1's bubble (a && !prevA) and level-fires seat 2's (a) — the
// replay driver mirrors that exactly, so a recorded run and its replay are
// the same run.

const BOB_FILE = join(REPLAYS, 'bubble-bobble-2p.json')
const BOB_SEED = 7
const BOB_TICKS = 900
const padToBob = (pad) => ({ left: !!pad.left, right: !!pad.right, up: !!pad.up, down: !!pad.down, fire: !!pad.a })

// seat 1's scripted hand: wander the cave in direction bands with jumps, and
// pulse the bubble button every 13th tick (the edge fold fires once per pulse)
const BOB_DIRS = ['right', 'right', 'up', 'right', 'down', 'left', 'left', 'up', 'left']
const bobDeviceAt = (i) => ({ dir: BOB_DIRS[Math.floor(i / 10) % BOB_DIRS.length], a: i % 13 < 2 })

const bobFold = (p1, p2, prev) => {
    const fire = !!p1.a && !prev.a
    prev.a = !!p1.a
    return [
        { left: !!p1.left, right: !!p1.right, up: !!p1.up, down: !!p1.down, fire },
        padToBob(p2),
    ]
}

const recordBob = () => {
    clearAllSlots()
    const gs = makeBob(BOB_SEED, { players: 2 })
    const s1 = makeSlot('human', { padIndex: 1 })
    const s2 = makeSlot('cpu', { emit: () => { const d = decide(gs, 1); return { left: d.left, right: d.right, up: d.up, down: d.down, a: d.fire } } })
    const rec = createRecorder({
        gameId: 'bubble-bobble', method: 'dpad', seed: BOB_SEED, players: 2, build,
        hashEvery: 30, sources: [{ kind: 'human' }, { kind: 'cpu' }],
    })
    const prev = { a: false }
    const home1 = { x: gs.players[0].x, y: gs.players[0].y }
    const home2 = { x: gs.players[1].x, y: gs.players[1].y }
    let blows = 0, traps = 0, pops = 0
    for (let i = 0; i < BOB_TICKS && !gs.end; i++) {
        const dev = bobDeviceAt(i)
        for (const f of ['left', 'right', 'up', 'down', 'a']) release(f)
        press(dev.dir)
        if (dev.a) press('a')
        const p1 = padFor(s1, { method: 'dpad' })
        const p2 = padFor(s2, { method: 'dpad', tick: i })
        for (const e of bobStep(gs, bobFold(p1, p2, prev)).events) {
            if (e.type === 'blow') blows++
            else if (e.type === 'trap') traps++
            else if (e.type === 'pop') pops++
        }
        gs.events.length = 0
        rec.addTick([p1, p2], [rawPad(1), rawPad(2)], bobHash(gs))
    }
    clearAllSlots()
    return { file: rec.finish(bobHash(gs)), gs, home1, home2, blows, traps, pops }
}

const replayBob = (rec2) => {
    let gs = null
    const prev = { a: false }
    return verifyRecording(rec2, {
        reset: (seed, players) => {
            gs = makeBob(seed >>> 0, { players: players > 1 ? 2 : 1 })
            prev.a = false
        },
        step: (pads) => {
            if (gs.end) { gs.tick += 1; return }
            bobStep(gs, bobFold(pads[0] || {}, pads[1] || {}, prev))
            gs.events.length = 0
        },
        state: () => ({ tick: gs.tick, hash: bobHash(gs) }),
    })
}

console.log('bubble-bobble 2P co-op (dpad)')
{
    const { file, gs, home1, home2, blows, traps, pops } = recordBob()
    ok(validate(file) === null, 'recorded file validates', validate(file) || '')
    ok(file.game === 'bubble-bobble' && file.method === 'dpad' && file.players === 2, 'header: game/method/players')
    ok(file.ticks > 120, `the run played ${file.ticks} ticks`)
    ok(file.slots[0].source.kind === 'human' && file.slots[1].source.kind === 'cpu', 'source labels: human + cpu')
    ok(blows > 10, `seat 1 blew ${blows} bubbles under its dpad + A pulses`)
    ok(traps > 0, `${traps} enemies got trapped (the co-op hunt did something)`)
    ok(pops > 0, `${pops} trapped bubbles got popped`)
    const travel1 = Math.hypot(gs.players[0].x - home1.x, gs.players[0].y - home1.y)
    const travel2 = Math.hypot(gs.players[1].x - home2.x, gs.players[1].y - home2.y)
    ok(travel1 > 0.5, `seat 1 traveled ${travel1.toFixed(2)} under its dpad`)
    ok(travel2 > 0.4, `cpu seat 2 traveled ${travel2.toFixed(2)} under decide()`)
    const onDisk = commitSample(file, BOB_FILE)
    roundTrip(onDisk, file, 'bubble-bobble')
    stampGate(onDisk, 'bubble-bobble')
    const res = replayBob(onDisk)
    ok(res.ok && !res.mismatch, `replay matches every checkpoint (${res.ticks} ticks)`,
        res.mismatch ? `diverged at tick ${res.mismatch.tick}: want ${res.mismatch.want} got ${res.mismatch.got}` : (res.error || ''))
    ok(res.state.hash === onDisk.hashes[onDisk.hashes.length - 1].h, 'final state.hash identical')
    if (MUTATE) {
        const cand = onDisk.slots[0].pads.findIndex((p, i) => i > 60 && (p.left || p.right || p.up || p.down))
        ok(cand > 60, 'found a live seat-1 pad to drop')
        if (cand > 60) {
            const tampered = JSON.parse(JSON.stringify(onDisk))
            tampered.slots[0].pads[cand] = {}
            const r2 = replayBob(tampered)
            ok(!r2.ok && r2.mismatch && r2.mismatch.tick >= cand + 1, `dropped dpad at tick ${cand + 1} is caught`,
                r2.mismatch ? `diverged at ${r2.mismatch.tick}` : 'never diverged')
        }
    }
}

// ================================================================= LEMMINGS ==
// Pointer: THE SPIRE (level 0, climb-only stock). The solver's winning script
// is re-expressed as the shared pointer gesture: a tap (down one tick, up the
// next) presses on a lemming's body and the release assigns the selected
// skill — the exact contract path (stepGesture before step). SCALE is pinned:
// record and replay run the gesture at the same stage scale, and every press
// lands on a lemming's body (distance 0), far inside the thumb reach, so the
// pick is stable at any sane display scale.
//
// The demo gestures (one slide re-target, one empty-air tap) are scheduled in
// the first 200 ticks — pure walking, no lemming has reached the spire wall
// yet — and their press points come from an assign-free dry run, so before the
// first solver tap the live world is exactly the dry world.

const LEM_FILE = join(REPLAYS, 'lemmings-pointer.json')
const LEM_SEED = 0
const LEM_TICKS = 4000              // the pointer run clears at ~1900; 4000 keeps slack
const SCALE = 16                 // screen px per world tile at record time
const MISS_PT = { x: 2.5, y: 5.5 }        // sky over the spawn: no lemming comes near
const REACH = 24 / SCALE

const acceptedCmds = (cmds, selected) => {
    const out = []
    for (const c of cmds) {
        if (c.tick < 3 || c.tick > LEM_TICKS - 2) continue
        if (c.skill !== selected) continue
        if (out.length && c.tick - out[out.length - 1].tick < 3) continue
        out.push(c)
    }
    return out
}

// press on the intended body; if another body shares the pixel the nearest
// candidate may be a different id — nudge deterministically until the pick is
// the intended one (or give up on the point)
const pickPoint = (target, cands) => {
    const tries = [[target.x, target.y], [target.x + 0.12, target.y], [target.x - 0.12, target.y], [target.x, target.y + 0.12], [target.x, target.y - 0.12]]
    for (const [x, y] of tries) {
        let best = null, bd = REACH + 1e-9
        for (const c of cands) {
            const d = Math.hypot(c.x - x, c.y - y)
            if (d < bd) { bd = d; best = c }
        }
        if (best && best.id === target.id) return { x, y }
    }
    return null
}

const recordLem = () => {
    const { meta, grid } = buildLevel(LEM_SEED % LEVELS.length)
    const g = makeLem(meta, grid)
    const selected = SKILLS.find((s) => meta.skills[s] > 0) || 'climb'
    const cursor = { x: meta.spawn.x, y: meta.spawn.y - 1 }
    const sol = solve(makeLem(meta, grid))
    const cmds = acceptedCmds(sol.cmds, selected)

    // dry walk for scheduling: per-tick live positions, assign-free
    const dry = makeLem(meta, grid)
    const snap = []
    for (let t = 0; t < 200; t++) {
        snap.push(dry.lemmings.filter((L) => L.live).map((L) => ({ id: L.id, x: L.x, y: L.y - 0.5, walk: L.state === 'walk' && !L.climber })))
        lemStep(dry, { x: cursor.x, y: cursor.y })
        dry.events.length = 0
    }

    const busy = new Set()
    for (const c of cmds) { busy.add(c.tick - 1); busy.add(c.tick) }
    let slideT = null, missT = null
    let slideA = null, slideB = null
    for (let t = 20; t < 190 && slideT === null; t++) {
        if (busy.has(t) || busy.has(t + 1) || busy.has(t + 2)) continue
        const walkers = snap[t].filter((c) => c.walk)
        const a = walkers[0]
        const b = a && walkers.find((w) => Math.hypot(w.x - a.x, w.y - a.y) > 0.9)
        if (a && b) { slideT = t; slideA = a; slideB = b }
    }
    for (let t = 20; t < 190 && missT === null; t++) {
        if (t <= (slideT || 0) + 2) continue
        if (busy.has(t) || busy.has(t + 1)) continue
        missT = t
    }
    ok(slideT !== null, 'scheduled a slide re-target gesture', 'no free window found')
    ok(missT !== null, 'scheduled an empty-air tap', 'no free window found')
    const slidePts = slideT !== null
        ? new Map([[slideT, pickPoint(slideA, snap[slideT])], [slideT + 1, pickPoint(slideB, snap[slideT + 1])]])
        : new Map()
    ok(slidePts.get(slideT || 0) && slidePts.get((slideT || 0) + 1), 'both slide press points land on their intended lemming')

    // the solver taps, scheduled: press at T-1 on the lemming's body, release
    // at T — the release commits on the stamp tick, exactly where solve()
    // applied the assign. The press point is picked LIVE at press time (the
    // world may have deviated from the solver's by then — the slide gesture
    // spends one climb early — so the tap chases the lemming's actual body;
    // an assign that no longer applies is simply lost, deterministically).
    const pressAt = new Map()   // tick -> lemming id
    const relTicks = new Set()
    for (const c of cmds) {
        pressAt.set(c.tick - 1, c.id)
        relTicks.add(c.tick)
    }

    const gest = { pd: false, aim: null }
    let lastCommitted = null
    let assigned = 0
    let slideRetarget = false
    let missNoop = true
    const cands = () => g.lemmings.filter((L) => L.live).map((L) => ({ x: L.x, y: L.y - 0.5, id: L.id }))
    const commit = (a) => {
        lastCommitted = a ? a.id : null
        if (a && lemAssign(g, a.id, selected)) assigned++
    }

    const rec = createRecorder({
        gameId: 'lemmings', method: 'pointer', seed: LEM_SEED, players: 1, build,
        hashEvery: 30, sources: [{ kind: 'human' }],
    })
    let lastX = 0, lastY = 0
    let missBefore = 0
    for (let t = 0; t < LEM_TICKS && !g.end; t++) {
        let x = lastX, y = lastY, down = false
        const pa = pressAt.get(t)
        const sa = slidePts.get(t)
        if (t === missT) {
            x = MISS_PT.x / LW; y = MISS_PT.y / LH; down = true
            missBefore = assigned
        } else if (t === missT + 1) {
            x = MISS_PT.x / LW; y = MISS_PT.y / LH; down = false
        } else if (pa !== undefined) {
            const L = g.lemmings[pa]
            const pt = L && L.live ? pickPoint({ id: L.id, x: L.x, y: L.y - 0.5 }, cands()) : null
            if (pt) { x = pt.x / LW; y = pt.y / LH; down = true }
        } else if (sa) {
            x = sa.x / LW; y = sa.y / LH; down = true
        } else if (t === slideT + 2 || relTicks.has(t)) {
            down = false
        }
        lastX = x; lastY = y
        setPointer(x, y, down)
        const p = currentPad('pointer')
        pointerGesture(gest, p.pointer, cands(), p.pointer.x * LW, p.pointer.y * LH, SCALE, commit)
        if (t === slideT + 2) {
            if (lastCommitted === slideB.id && slideB.id !== slideA.id && g.lemmings[slideB.id].climber) slideRetarget = true
            lastCommitted = null
        }
        if (t === missT + 1) missNoop = assigned === missBefore
        lemStep(g, { x: cursor.x, y: cursor.y })
        g.events.length = 0
        rec.addTick([p], [rawPad(1)], lemHash(g))
    }
    clearAllSlots()
    return { file: rec.finish(lemHash(g)), g, selected, assigned, slideRetarget, missNoop, cmds: cmds.length }
}

const replayLem = (rec2) => {
    let g = null, gest = null
    const cursor = { x: 0, y: 0 }
    const selected = { v: 'climb' }
    const counts = { assigned: 0 }
    const res = verifyRecording(rec2, {
        reset: (seed) => {
            const { meta, grid } = buildLevel((seed >>> 0) % LEVELS.length)
            g = makeLem(meta, grid)
            gest = { pd: false, aim: null }
            cursor.x = meta.spawn.x
            cursor.y = meta.spawn.y - 1
            selected.v = SKILLS.find((s) => meta.skills[s] > 0) || 'climb'
            counts.assigned = 0
        },
        step: (pads) => {
            if (g.end) { g.tick += 1; return }
            const p = (pads[0] || {}).pointer || {}
            pointerGesture(gest, p, g.lemmings.filter((L) => L.live).map((L) => ({ x: L.x, y: L.y - 0.5, id: L.id })),
                (p.x || 0) * LW, (p.y || 0) * LH, SCALE,
                (a) => { if (a && lemAssign(g, a.id, selected.v)) counts.assigned++ })
            lemStep(g, { x: cursor.x, y: cursor.y })
            g.events.length = 0
        },
        state: () => ({ tick: g.tick, hash: lemHash(g) }),
    })
    return { ...res, assigned: counts.assigned }
}

console.log('lemmings pointer (THE SPIRE, solver script as finger taps)')
{
    const { file, g, selected, assigned, slideRetarget, missNoop, cmds } = recordLem()
    ok(validate(file) === null, 'recorded file validates', validate(file) || '')
    ok(file.game === 'lemmings' && file.method === 'pointer' && file.players === 1, 'header: game/method/players')
    ok(selected === 'climb', `the selected skill is the level's default (${selected})`)
    ok(cmds >= 4, `the solver script contributed ${cmds} accepted taps`)
    ok(assigned >= 4, `${assigned} assignments landed through the pointer gesture`)
    ok(slideRetarget, 'the slide re-targeted: the release assigned the slid-to lemming')
    ok(missNoop, 'the empty-air tap committed nothing')
    ok(g.end === 'clear' && g.win, `the pointer-only run clears THE SPIRE (${g.exited}/${g.level.need} out, ${g.dead} dead)`)
    ok(file.slots[0].raw.some((r) => r.px || r.py), 'the raw channel carries the pre-clamp pointer (px/py)')
    const onDisk = commitSample(file, LEM_FILE)
    roundTrip(onDisk, file, 'lemmings')
    stampGate(onDisk, 'lemmings')
    const res = replayLem(onDisk)
    ok(res.ok && !res.mismatch, `replay matches every checkpoint (${res.ticks} ticks)`,
        res.mismatch ? `diverged at tick ${res.mismatch.tick}: want ${res.mismatch.want} got ${res.mismatch.got}` : (res.error || ''))
    ok(res.state.hash === onDisk.hashes[onDisk.hashes.length - 1].h, 'final state.hash identical')
    ok(res.assigned === assigned, `the replay produced the same ${assigned} pointer assignments`)
    if (MUTATE) {
        // drop the down of one press: the release without its press commits
        // nothing, the world forks, and the next checkpoint names the tick.
        // A press whose release was already a no-op in the original run (the
        // assign no longer applied to the lemming — the script says such
        // assignments are simply lost, deterministically) cannot be detected;
        // the gate is that at least one LIVE press drop forks the run.
        const pressTicks = onDisk.slots[0].pads.map((p, i) => (i > 30 && p.pointer && p.pointer.down ? i : -1)).filter((i) => i >= 0)
        ok(pressTicks.length >= 3, `found press ticks to drop (${pressTicks.length})`)
        let caught = 0
        const caughtAt = []
        for (const cand of pressTicks) {
            const tampered = JSON.parse(JSON.stringify(onDisk))
            delete tampered.slots[0].pads[cand].pointer.down
            const r2 = replayLem(tampered)
            if (!r2.ok && r2.mismatch && r2.mismatch.tick >= cand + 1) { caught++; caughtAt.push(cand + 1) }
        }
        ok(caught >= 1, `a dropped live press forks the run (${caught}/${pressTicks.length} drops caught, first at ${caughtAt[0] ?? '-'})`)
    }
}

// =============================================================== COVERAGE ==
// The issue's done-when: every method has a reference file. The rec/v1 files
// in public/replays (the lander training dumps carry a different format and
// are out of scope) must span all three methods, and each must validate.
console.log('method coverage')
{
    const recs = readdirSync(REPLAYS)
        .map((f) => JSON.parse(readFileSync(join(REPLAYS, f), 'utf8')))
        .filter((r) => r && r.format === REC_FORMAT)
    const methods = new Set(recs.map((r) => r.method))
    for (const m of ['dpad', 'stick', 'pointer']) {
        ok(methods.has(m), `a rec/v1 reference file exists for method \`${m}\``)
    }
    for (const r of recs) {
        ok(validate(r) === null, `${r.game} (${r.method}) validates on disk`, validate(r) || '')
    }
    ok(recs.length >= 3, `${recs.length} rec/v1 reference files shipped`)
}

console.log(`${fail ? 'FAIL ' + fail : 'PASS'} ${pass}`)
process.exit(fail ? 1 : 0)
