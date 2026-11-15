// #2279 — proof for the worktree purge sweep (scripts/worktreepurge.mjs).
//
// Three layers (+ one regression mutant):
//   A. Unit table — every rule of the pure core `purgeVerdict`, facts
//      injected (the PR-state rules are GitHub-only, pinned here so CI
//      covers them hermetically).
//   B. Sandbox integration — a real git repo on a file:// origin with six
//      worktrees in the states the board actually piles up: detached at
//      main (merged & re-detached), fully merged branch, dirty, pushed-
//      unmerged, detached off main, a fresh lane worktree at the tip
//      (#2293 — must KEEP), plus the cap. The tool runs with
//      --run; removals and keeps are asserted on the filesystem, and the
//      rerun must be idempotent.
//   C. Mutant self-proof — the dirty-guard regexed out of a copy: the
//      mutant must ATTEMPT the dirty worktree (git itself refuses — the
//      named KEEP of layer B is gone). Restored copy must name it again.
//      Load-bearing rule proven; no --force exists in the tool, so the
//      mutant can only prove the attempt, which is the honest extent.
//   D. #2293 regression mutant — the detached-gate reverted: the fresh
//      lane worktree purges (git does not refuse a clean tree), proving
//      the `&& !wt.branch` gate load-bearing by loss.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { purgeVerdict } from './worktreepurge.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const RUNNER = resolve(HERE, 'worktreepurge.mjs')

let pass = 0
let fail = 0
const ok = (cond, name, extra = '') => {
    if (cond) { pass += 1; console.log(`PASS ${name}`) }
    else { fail += 1; console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`) }
}

// ---- A. unit table ----------------------------------------------------------
const base = {
    isMain: false, mutant: false, dirty: false, driven: false,
    ancestor: false, branch: null, prState: null, pushed: false,
}
const U = [
    ['main checkout never dies', { ...base, isMain: true, ancestor: true }, 'keep', 'main checkout'],
    ['mutant marker freezes (#2047)', { ...base, mutant: true, ancestor: true }, 'keep', 'mutant run live'],
    ['dirty is never removed', { ...base, dirty: true, ancestor: true }, 'keep', 'uncommitted work'],
    ['live lane keeps it', { ...base, driven: true, ancestor: true }, 'keep', 'lane process inside'],
    ['open PR keeps it', { ...base, branch: 'forge/x', pushed: true, prState: 'OPEN' }, 'keep', 'PR open'],
    ['detached at main lands', { ...base, ancestor: true }, 'purge', 'HEAD on origin/main'],
    ['squash-merged branch lands (PR MERGED, rewritten)', { ...base, branch: 'forge/y', pushed: true, prState: 'MERGED' }, 'purge', 'PR merged'],
    ['closed-unmerged pushed lands', { ...base, branch: 'forge/z', pushed: true, prState: 'CLOSED' }, 'purge', 'PR closed unmerged'],
    ['closed-unmerged NOT pushed keeps', { ...base, branch: 'forge/w', prState: 'CLOSED' }, 'keep', 'unpushed commits'],
    ['unpushed branch keeps', { ...base, branch: 'forge/v' }, 'keep', 'unpushed commits'],
    ['pushed unmerged, PR unknown, keeps', { ...base, branch: 'forge/u', pushed: true }, 'keep', 'pushed, unmerged'],
    ['detached off main keeps', { ...base }, 'keep', 'detached off main'],
    ['OPEN outranks landed-proof (live PR reopened)', { ...base, ancestor: true, branch: 'forge/t', pushed: true, prState: 'OPEN' }, 'keep', 'PR open'],
    // #2293 — ancestry alone never lands a BRANCH worktree: the exact shape of
    // a fresh `worktree add -b forge/<slug> origin/main` ate a live workspace.
    ['fresh lane worktree at tip keeps (#2293)', { ...base, ancestor: true, branch: 'forge/new' }, 'keep', 'unpushed commits'],
    ['branch at tip, pushed, no PR keeps (#2293)', { ...base, ancestor: true, branch: 'forge/new', pushed: true }, 'keep', 'pushed, unmerged'],
    ['detached@tip still lands (#2293 keeps the sweep working)', { ...base, ancestor: true, branch: null }, 'purge', 'detached HEAD on origin/main'],
]
for (const [name, facts, action, why] of U) {
    const v = purgeVerdict(facts)
    ok(v.action === action && v.why.includes(why), `unit: ${name}`, `got ${v.action} "${v.why}"`)
}

// ---- B + C. sandbox ----------------------------------------------------------
const sh = (dir, args, opt = {}) =>
    execFileSync('git', args[0] === '-C' ? args : ['-C', dir, ...args],
        { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'], ...opt })
const commit = (dir, msg) => {
    sh(dir, ['add', '-A']) // --all alone skips untracked; the first commit needs add
    sh(dir, ['-c', 'user.name=wtcheck', '-c', 'user.email=wtcheck@local', 'commit', '-qm', msg])
}

function sandbox(root) {
    sh(root, ['init', '--bare', '-b', 'main', 'origin.git'])
    sh(root, ['clone', '-q', 'origin.git', 'main'])
    const main = join(root, 'main')
    writeFileSync(join(main, 'a.txt'), 'one\n')
    commit(main, 'init')
    sh(main, ['push', '-q', '-u', 'origin', 'main'])

    // landed: re-detached at origin/main (the after-merge state)
    sh(main, ['worktree', 'add', '--detach', '-q', join(root, 'landed'), 'origin/main'])
    // merged branch (merged into main with history, pushed)
    sh(main, ['worktree', 'add', '-q', '-b', 'feat-done', join(root, 'merged'), 'main'])
    const merged = join(root, 'merged')
    writeFileSync(join(merged, 'b.txt'), 'feat\n')
    commit(merged, 'feat work')
    sh(merged, ['push', '-q', '-u', 'origin', 'feat-done'])
    sh(main, ['-c', 'user.name=wtcheck', '-c', 'user.email=wtcheck@local', 'merge', '-q', '--no-ff', 'feat-done', '-m', 'merge feat'])
    sh(main, ['push', '-q', 'origin', 'main'])
    // the law's after-merge state: re-detached at origin/main (#2293 — the
    // sweep's ancestry rule is for DETACHED trees; a branch still bound to a
    // hermetically-unknown ref keeps, exactly as GitHub-less lanes keep)
    sh(merged, ['checkout', '--detach', '-q', 'origin/main'])
    // dirty at old main: modified tracked file (detached — main is checked out "here")
    sh(main, ['worktree', 'add', '--detach', '-q', join(root, 'dirty'), 'main'])
    writeFileSync(join(root, 'dirty', 'a.txt'), 'local edit\n')
    // pushed-unmerged branch (ahead of main on origin, main never moved)
    sh(main, ['worktree', 'add', '-q', '-b', 'feat-open', join(root, 'ahead'), 'main'])
    const ahead = join(root, 'ahead')
    writeFileSync(join(ahead, 'c.txt'), 'open\n')
    commit(ahead, 'open work')
    sh(ahead, ['push', '-q', '-u', 'origin', 'feat-open'])
    // detached at a commit main does not carry
    sh(main, ['worktree', 'add', '--detach', '-q', join(root, 'weird'), 'feat-open'])
    // #2293: fresh lane worktree — clean, branch-bound, HEAD == origin/main.
    // The exact state `worktree add -b forge/<slug> origin/main` creates; must KEEP.
    sh(main, ['worktree', 'add', '-q', '-b', 'forge-live', join(root, 'fresh'), 'origin/main'])
    return main
}

function runTool(repoPath, extra = []) {
    return execFileSync('node', [RUNNER, '--repo', repoPath, '--nogh', '--nofetch', ...extra],
        { encoding: 'utf8', timeout: 60000 })
}

try {
    const root = mkdtempSync(join(tmpdir(), 'wtcheck-'))
    try {
        const main = sandbox(root)
        const out = runTool(main, ['--run'])
        ok(out.includes('PURGE') && out.includes(`${join(root, 'landed')}`), 'sandbox: detached-at-main purged', out)
        ok(out.includes('PURGE') && out.includes(`${join(root, 'merged')}`), 'sandbox: merged-branch purged')
        ok(out.includes('KEEP') && out.includes('dirty') && out.includes('uncommitted'), 'sandbox: dirty kept')
        ok(out.includes('KEEP') && out.includes('ahead') && out.includes('pushed, unmerged'), 'sandbox: pushed-unmerged kept')
        ok(out.includes('KEEP') && out.includes('weird') && out.includes('detached off main'), 'sandbox: detached-off-main kept')
        ok(out.includes('KEEP') && out.includes('fresh') && out.includes('unpushed commits'), 'sandbox: fresh lane worktree kept (#2293)', out)
        ok(out.includes('DONE purged=2 kept=5'), 'sandbox: tally 2/5', out.split('\n').filter((l) => l.startsWith('DONE'))[0])
        ok(!existsSync(join(root, 'landed')) && !existsSync(join(root, 'merged')), 'sandbox: landed dirs gone from disk')
        ok(existsSync(join(root, 'dirty')) && existsSync(join(root, 'ahead')) && existsSync(join(root, 'weird')), 'sandbox: keeper dirs still on disk')
        ok(existsSync(join(root, 'fresh')), 'sandbox: fresh worktree still on disk (#2293)')
        ok(existsSync(join(main, 'b.txt')), 'sandbox: merged content still on main')

        const again = runTool(main, ['--run'])
        ok(again.includes('DONE purged=0'), 'sandbox: rerun idempotent', again.split('\n').filter((l) => l.startsWith('DONE'))[0])

        // cap: two purge candidates, max 1 → exactly one removed
        sh(main, ['worktree', 'add', '--detach', '-q', join(root, 'landed2'), 'origin/main'])
        sh(main, ['worktree', 'add', '--detach', '-q', join(root, 'landed3'), 'origin/main'])
        const capped = runTool(main, ['--run', '--max', '1'])
        ok(capped.includes('DONE purged=1'), 'sandbox: cap honored (1 of 2)', capped.split('\n').filter((l) => l.startsWith('DONE'))[0])
        ok(capped.includes('over cap'), 'sandbox: capped candidate reported')

        // dry default: a fresh landed worktree must survive without --run
        sh(main, ['worktree', 'add', '--detach', '-q', join(root, 'landed4'), 'origin/main'])
        const dry = runTool(main)
        ok(dry.includes('DRY PURGE') && dry.includes('dry=1') &&
            existsSync(join(root, 'landed3')) && existsSync(join(root, 'landed4')), 'sandbox: dry run deletes nothing', dry)

        // ---- C. mutant: strip the dirty guard -----------------------------
        const src = readFileSync(RUNNER, 'utf8')
        const mut = src.replace(/dirty: \(\(\) => \{[^{}]*\}\)\(\)/, 'dirty: false')
        ok(mut !== src, 'mutant: dirty guard was findable')
        const mutRunner = join(root, 'mut', 'worktreepurge.mjs') // endsWith guard must fire
        mkdirSync(join(root, 'mut'), { recursive: true })
        writeFileSync(mutRunner, mut)
        const out2 = execFileSync('node', [mutRunner, '--repo', main, '--nogh', '--nofetch', '--run'],
            { encoding: 'utf8', timeout: 60000 })
        ok(out2.includes('DONE'), 'mutant: mutant runner actually ran', out2)
        ok(!/dirty .*uncommitted work/.test(out2), 'mutant: named dirty-KEEP gone', out2)
        ok(out2.includes('git refused') && out2.includes('dirty'), 'mutant: dirty tree was attempted (only git stopped it)', out2)

        // ---- D. mutant: revert the #2293 detached-gate ----------------------
        // With `&& !wt.branch` removed (the pre-fix rule), the fresh lane
        // worktree — clean, branch-bound, at the tip — purges: the real bug,
        // replayed. Here git does NOT refuse (the tree is genuinely clean), so
        // this mutant proves the gate load-bearing by loss.
        const mut2 = src.replace(/wt\.ancestor && !wt\.branch/, 'wt.ancestor')
        ok(mut2 !== src, 'mutant: #2293 detached-gate was findable')
        const mut2Runner = join(root, 'mut2', 'worktreepurge.mjs')
        mkdirSync(join(root, 'mut2'), { recursive: true })
        writeFileSync(mut2Runner, mut2)
        ok(existsSync(join(root, 'fresh')), 'mutant: fresh worktree still protected pre-mutant')
        const out3 = execFileSync('node', [mut2Runner, '--repo', main, '--nogh', '--nofetch', '--run'],
            { encoding: 'utf8', timeout: 60000 })
        ok(out3.includes('PURGE') && out3.includes(join(root, 'fresh')), 'mutant: pre-fix rule eats the fresh worktree (#2293 reproduced)', out3)
        ok(!existsSync(join(root, 'fresh')), 'mutant: fresh worktree really gone under the mutant')
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
} catch (e) {
    fail += 1
    console.log(`FAIL sandbox crashed — ${String(e).split('\n')[0]}`)
}

console.log(`\nworktreepurgecheck: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
