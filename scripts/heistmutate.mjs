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
// has already caught two of those:
//
//   * "hide the padlock" written as `lock.visible = false` survives and means nothing:
//     `reset()` re-hangs every bit of hardware on each retry, so the flag is repaired
//     before the player ever moves. The honest mutant removes the lock from the cage
//     group, which is the bug the playtest actually reported.
//   * a check that measured the vault plate by its *object origin* survived a door that
//     never opened, because a merged mesh's origin sits on the hinge. Measure geometry.
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
const run = () => {
    const p = spawnSync('npm', ['run', 'heistplay'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
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
        ({ fails } = run())
    } finally {
        copyFileSync(bak, abs)
    }
    const dead = fails.some(f => f.includes(m.mustFail))
    results.push({ name: m.name, ok: dead, fails: fails.length })
    console.log(`\n=== MUTANT ${dead ? 'DIED' : 'SURVIVED'}: ${m.name}`)
    console.log(`    expected red: "${m.mustFail}" — ${m.note}`)
    console.log(`    ${fails.length} red: ${fails.map(f => f.replace(/^FAIL\s+/, '').slice(0, 60)).join(' | ') || 'nothing'}`)
    if (!dead) console.log('    !! The test never got near this line. Fix the test first.')
}

// A mutant restores its file from a snapshot, so if a file does not match what it was
// when this run started, something edited it mid-run and the restore ate that edit.
for (const [f, h] of Object.entries(START)) {
    if (hash(f) !== h) {
        console.log(`  !! ${f} changed during the run and was restored over an edit — re-apply your changes and re-run`)
        survived.push({ name: `dirty tree: ${f}` })
    }
}
const failed = results.filter(x => !x.ok)
console.log(`\n${results.length - failed.length}/${results.length} mutants died`)
for (const s of failed) console.log(`  SURVIVED: ${s.name}${s.why ? ' (' + s.why + ')' : ''}`)
process.exit(survived.length || failed.length ? 1 : 0)
