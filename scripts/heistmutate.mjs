// RACCOON HEIST — mutation harness.
//
//   npm run heistmutate                 (needs `npm run dev` on :5173; ~2 min per mutant)
//   npm run heistmutate -- lock chain    (only mutants whose name matches)
//
// Every check in this repo was green with bugs in it at first, so the house rule is:
// revert the fix, watch the check go red, then believe it. Doing that by hand is how a
// session gets lost (see raccoon_next.md: `git checkout <path>` once destroyed a day of
// uncommitted engine.js), so it is scripted: each mutant is one anchored text swap, run
// through the real `heistplay`, and restored from a /tmp copy — the working tree is never
// reverted, only patched and un-patched.
//
// A mutant that SURVIVES is usually a report about the test, not the code, and this file
// has already caught four of those:
//
//   * "hide the padlock" written as `lock.visible = false` survives and means nothing:
//     `reset()` re-hangs every bit of hardware on each retry, so the flag is repaired
//     before the player ever moves. The honest mutant removes the lock from the cage
//     group, which is the bug the playtest actually reported.
//   * a check that measured the vault plate by its *object origin* survived a door that
//     never opened, because a merged mesh's origin sits on the hinge. Measure geometry.
//   * "chewing does not shake the lock" survived while the driver measured *any* movement
//     of the padlock — a lock that had just been chewed off and fallen 0.32 m "shook"
//     beautifully. A rattle is lateral, measured while still hanging, and must reverse.
//   * "a chew that frees one leaves the cage open" survived because the pound had one
//     prisoner, so the branch needed two and the loop over `rescue.log` never reached it.
//     Every one of these survivals was the same sentence: the test never got near the code.
//
// ONE MUTANT WAS DELETED FOR BEING UNDEAD, and its post-mortem belongs here.
//
// "The sight cone is sampled once per frame, at the end of the arc" was written to prove an
// engine fix for the CI-only reds (a torch sweeping over the raccoon between frames at 7 fps).
// It survived at 60 fps, at 32x and at 64x. What I wrote down at the time, in the mutant's own
// comment, was that *this laptop cannot reproduce the CI runner* — the most comfortable kind
// of wrong, because it makes an untested change look disciplined.
//
// `grep -n yawFrom` ended it: the mutated line read `w.yawFrom` and nothing anywhere
// assigned `yawFrom`, so `?? yawEnd` made the arc zero, `slices` was always 1, and the mutant
// was comparing an expression with itself. The engine fix it "proved" is reverted (see
// `git log` and AGENTS.md), and the CI reds it claimed to explain turned out to be four
// driver bugs wearing one hat — polling `det` after the alert wipes it, polling one belonging
// to a raccoon in a sack, parking the courier inside the guard's grabbing range, and
// "emptying a yard" by teleport when a patrol is a route and routes walk home.
//
// So: before a surviving mutant gets blamed on the machine, ask what makes the mutated line
// RUN. A test on dead code is worse than no test — it ships with a causal story.
//
// Some mutants are only alive at low frame rates, so a mutant may carry `throttle: N` and
// the driver runs `--throttle N` for it. The camera-floor mutant is the example: at 60 fps
// the retreat loop never reaches the bottom of the clamp, so the overshoot it exists to
// catch only happens on a slow box — which is exactly how it shipped.
//
// Exit code is non-zero if any mutant survives, so this can become a gate once it is
// cheap enough to want that.
//
// DO NOT EDIT THE GAME WHILE THIS RUNS. Each mutant restores its file from a snapshot
// taken when that mutant started, so an edit made mid-run is silently reverted — which
// happened once, and left `afford()` calling a helper that the restore had just removed.
// The `--dry` anchor check and the hash check at the end both exist to say so out loud
// instead of leaving a broken tree for the next person.

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ART = 'src/games/RaccoonHeist/art.js'
const ENG = 'src/games/RaccoonHeist/engine.js'
const IDX = 'src/games/RaccoonHeist/index.jsx'

/**
 * Each mutant: a name, the file, an anchor that must appear EXACTLY once (a mutation that
 * matches twice is skipped, not guessed), the replacement, and the check that must go red.
 */
const MUTANTS = [
    {
        name: 'no lock on the pound',
        file: ART,
        anchor: '    lock.position.set(0, 0.62, -0.68)\n    g.add(lock)',
        swap: '    lock.position.set(0, 0.62, -0.68)\n    // MUTANT: the pound has no lock on it — the original playtest bug.',
        mustFail: 'the padlock is there to chew',
        note: 'the affordance check that exists for exactly this',
    },
    {
        name: 'the chew verb points at the back of the cage',
        file: ENG,
        anchor: 'const at = f.kind === \'free\' ? cagePoint(0, 0.62, -FACE)',
        swap: 'const at = f.kind === \'free\' ? cagePoint(0, 0.62, FACE)',
        mustFail: 'a locked cage shows a locked door',
        note: 'the verb points where the door is; rotating the cage must not break it',
    },
    {
        name: 'chewing does not shake the lock',
        file: ENG,
        anchor: 'padlock.userData.shake = 0.01 + p * 0.055',
        swap: 'padlock.userData.shake = 0',
        mustFail: 'the lock shakes while it is being chewed',
        note: 'the lock is the progress bar',
    },
    {
        name: 'a chew that frees one leaves the cage open',
        file: ENG,
        anchor: 'if (stillInside) { sparkAt(',
        swap: 'if (false && stillInside) { sparkAt(',
        mustFail: 'the door stays locked while somebody is still in there',
        note: 'the second rescue was chewing air',
    },
    {
        name: 'the gate chain stays hung',
        file: ENG,
        anchor: '        drop(gateChain, { rest: 0.09, lie: true })\n        drop(gateLock, { rest: 0.07 })',
        swap: '        // MUTANT: no chain snap',
        mustFail: 'the gate chain comes off',
        note: 'the way out must announce itself',
    },
    {
        name: 'the vault plate is absorbed by the frame bake',
        file: ART,
        anchor: '    bakeMeshes(door)\n    // Hang the plate',
        swap: '    door.userData.keep = true\n    bakeMeshes(door)\n    // Hang the plate',
        mustFail: 'the vault door is an assembly',
        note: 'keep on the node disables baking OF that node too',
    },
    {
        name: 'the vault plate is offset before baking',
        file: ART,
        anchor: '    const door = new THREE.Group()\n    g.add(door)',
        swap: '    const door = new THREE.Group()\n    door.position.x = r\n    g.add(door)',
        mustFail: 'the vault plate sits in its own cell',
        note: 'the offset lands twice: 0.86 m outside the cell',
    },
    {
        // Only visible on a slow box: at 60 fps the retreat loop never reaches the bottom of
        // the clamp, so the overshoot needs the throttle to happen at all.
        name: 'the camera retreat tests its floor before stepping on it',
        file: ENG,
        anchor: 'for (let i = 0; i < 12 && allowed > 0.6 && embedded(allowed); i++) allowed = Math.max(0.6, allowed - 0.35)',
        swap: 'for (let i = 0; i < 12 && allowed > 0.55 && embedded(allowed); i++) allowed -= 0.35',
        mustFail: 'the rig never jams against the raccoon',
        note: 'the last step overshoots the floor it just tested: 0.70 became 0.35 m of raccoon fur',
        throttle: 32,
        // Subsumed by the escape hatch added later in the same round: with the retreat
        // overshooting into a fur close-up, `tightGap` fires and the rig takes the nearest
        // legal cell anyway, so no check reddens. That is not a hole in the suite — it is
        // redundancy, and it is written down rather than deleted, because the day this
        // mutant goes red again means the escape hatch stopped covering for the retreat.
        covered: 'the sideways escape hatch catches it (mutant #11 is the one that owns this now)',
        coveredBy: 'no sideways escape when the bearing is all brick',
    },
    {
        // The escape hatch in the pinch corner. Without it the rig has no legal cell to
        // fall back to when the actor itself is pressed into the mesh, and it renders brick.
        // Needs the throttle: at 60 fps the actor never ends up inside the geometry, so the
        // escape is never reached and the mutant would be equivalent by luck.
        name: 'no sideways escape when the bearing is all brick',
        file: ENG,
        anchor: 'if (solid(px, pz) || tightGap) {',
        swap: 'if (false && (solid(px, pz) || tightGap)) {',
        mustFail: 'the camera stops burying itself in geometry',
        note: 'a rig inside a wall reads as a broken game; this is the last thing between it and brick',
        throttle: 64,
    },
    {
        name: 'a verb ships with no body',
        file: ENG,
        anchor: "        if (a.held && near(cartW, 1.9)) return { kind: 'deliver', label: 'LOAD THE CART' }",
        swap: "        if (cat && near(cat, 1.4)) return { kind: 'pet', label: 'PET THE CAT', t: cat }\n"
            + "        if (a.held && near(cartW, 1.9)) return { kind: 'deliver', label: 'LOAD THE CART' }",
        mustFail: 'every verb the sim can offer was body-checked',
        note: 'the coverage gate: a new verb without a mesh cannot hide',
    },
    {
        name: 'an invisible mesh still counts as seen',
        file: IDX,
        anchor: 'if (!o.isMesh || !drawn(o) || !o.geometry) return',
        swap: 'if (!o.isMesh || !o.visible || !o.geometry) return',
        mustFail: 'a lock nobody can see is not an affordance',
        note: 'visibility belongs to the whole chain; the route checks cannot see this one',
    },
    {
        // The body-depth instrument's own mutant. Guards whose waypoint branch steps
        // straight at the next cell centre ignore everything standing ON a cell, so the
        // watchman clips through every lamppost and bin in the yard while the raccoon
        // cannot touch one. Direct chase already went through `move()`; that is why six
        // rounds of arrest checks never saw it.
        name: 'a guard steps straight at his waypoint again',
        file: ENG,
        anchor: '                    if (!move(w, step(nx - w.x), step(nz - w.z))) sp = 0',
        swap: '                    w.x += step(nx - w.x)\n                    w.z += step(nz - w.z)',
        mustFail: 'a guard stops at the furniture instead of clipping it',
        note: 'the grid is not the whole collision model, and this is the one body that did not ask',
    },
    {
        // The other half of the instrument: a raccoon thin enough to stand inside a lamppost.
        // Every camera check stays green, and so does the depth check that measures the
        // *collider*, because a smaller collider is still stopped at the surface — which is
        // how this mutant survived its first attempt, and why `wall` (centre to brick) and
        // the 0.32 m waist are pinned separately.
        name: 'the raccoon is two centimetres wide',
        file: ENG,
        anchor: 'const RADIUS = 0.32',
        swap: 'const RADIUS = 0.02',
        mustFail: 'a raccoon is 0.64 m wide',
        note: 'RADIUS is the animal: shrink it and you stand in the mesh while the collider reads clean',
    },
    {
        // The movement bug the pinch corner was accused of: a step that never asks the
        // world. The raccoon walks into the north wall, its centre ends up inside brick,
        // and every legal camera position behind it disappears with it.
        name: 'the raccoon stops asking the world before it steps',
        file: ENG,
        anchor: '        if (dx && !blocked(o.x + dx, o.z, o)) { o.x += dx; moved = true }',
        swap: '        if (dx) { o.x += dx; moved = true }',
        mustFail: 'the raccoon is never inside the level',
        note: 'blocked() is the only thing between a body and the map; centre-to-brick is how you see it go',
    },
]

const only = process.argv.slice(2).filter(a => !a.startsWith('--'))
const DRY = process.argv.includes('--dry')
const hash = (f) => createHash('sha1').update(readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 10)
const START = Object.fromEntries(MUTANTS.map(m => [m.file, hash(m.file)]))
/**
 * `--dry` checks that every anchor still exists exactly once and exits. An anchor that
 * matches twice mutates the wrong line, and one that matches zero times means the mutant
 * silently stopped being a mutant — both are worse than no harness at all.
 */
if (DRY) {
    let bad = 0
    for (const m of MUTANTS) {
        const txt = readFileSync(path.join(ROOT, m.file), 'utf8')
        const hits = txt.split(m.anchor).length - 1
        if (hits !== 1) bad++
        console.log(`${hits === 1 ? 'ok  ' : 'BAD '} ${hits}x  ${m.name}  [${m.file}]`)
    }
    console.log(bad ? `${bad} broken mutant anchor(s)` : `${MUTANTS.length} mutants, all anchors unique`)
    process.exit(bad ? 1 : 0)
}
const run = (throttle) => {
    const args = ['run', 'heistplay', ...(throttle ? ['--', '--throttle', String(throttle)] : [])]
    const p = spawnSync('npm', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    const out = (p.stdout || '') + (p.stderr || '')
    const fails = out.split('\n').filter(l => l.trim().startsWith('FAIL')).map(l => l.trim())
    const tally = (out.match(/heistplay: [^\n]*/) || ['NO RESULT'])[0]
    if (!/checks passed|OK/.test(out)) console.log('    !! heistplay did not run (dev server up?)')
    return { fails, tally }
}

const results = []
for (const m of MUTANTS) {
    if (only.length && !only.some(o => m.name.includes(o))) continue
    const abs = path.join(ROOT, m.file)
    const bak = path.join('/tmp', `heistmutate-${path.basename(m.file)}.bak`)
    const src = readFileSync(abs, 'utf8')
    const hits = src.split(m.anchor).length - 1
    if (hits !== 1) {
        console.log(`\n=== SKIP ${m.name}: anchor matched ${hits} times in ${m.file}`)
        results.push({ name: m.name, ok: false, why: 'anchor not unique' })
        continue
    }
    copyFileSync(abs, bak)
    writeFileSync(abs, src.replace(m.anchor, m.swap))
    let fails = []
    try {
        ({ fails } = run(m.throttle))
    } finally {
        copyFileSync(bak, abs)
    }
    const dead = fails.some(f => f.includes(m.mustFail))
    if (m.covered) {
        // An inverted expectation: this mutant is *supposed* to survive, because a later fix
        // catches the same failure somewhere else. Survival is the redundant design working;
        // its going red would mean the safety net developed a hole. Recorded so the suite
        // says that out loud instead of filing it as "the test never got near the code".
        const ok = !dead
        results.push({ name: m.name, ok, fails: fails.length, covered: true })
        console.log(`\n=== MUTANT ${ok ? 'SURVIVED AS DESIGNED' : 'DIED, AND THAT IS THE BUG'}: ${m.name}`)
        console.log(`    covered by: ${m.covered}`)
        console.log(`    ${fails.length} red: ${fails.map(f => f.replace(/^FAIL\s+/, '').slice(0, 60)).join(' | ') || 'nothing'}`)
        if (!ok) console.log(`    !! ${m.coveredBy} was supposed to catch this. Check the escape hatch.`)
        continue
    }
    results.push({ name: m.name, ok: dead, fails: fails.length })
    console.log(`\n=== MUTANT ${dead ? 'DIED' : 'SURVIVED'}: ${m.name}`)
    console.log(`    expected red: "${m.mustFail}" — ${m.note}`)
    console.log(`    ${fails.length} red: ${fails.map(f => f.replace(/^FAIL\s+/, '').slice(0, 60)).join(' | ') || 'nothing'}`)
    if (!dead) console.log('    !! The test never got near this line. Fix the test first.')
}

const failed = results.filter(x => !x.ok)
// A mutant restores its file from a snapshot, so if a file does not match what it was
// when this run started, something edited it mid-run and the restore ate that edit.
for (const [f, h] of Object.entries(START)) {
    if (hash(f) !== h) {
        console.log(`  !! ${f} changed during the run and was restored over an edit — re-apply your changes and re-run`)
        failed.push({ name: `dirty tree: ${f}`, why: 'file changed mid-run' })
    }
}
const cov = results.filter(x => x.covered)
console.log(`\n${results.length - failed.length - cov.length}/${results.length - cov.length} mutants died (${cov.length} covered by design)`)
for (const s of failed) console.log(`  ${s.covered ? 'COVER-BROKEN' : 'SURVIVED'}: ${s.name}${s.why ? ' (' + s.why + ')' : ''}`)
process.exit(failed.length ? 1 : 0)
