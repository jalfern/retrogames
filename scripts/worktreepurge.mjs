// #2279 — a lane's worktree goes away once its work has landed.
//
// The forge/QA lanes open a worktree per issue and re-detach it at
// origin/main after the squash-merge; nothing ever closed them, and 295
// piled up in ~/Dev (the 2026-11-14 hand sweep: 238 clean, every commit
// already on main or pushed). This tool is the automated sweep, in the
// lanebusy shape (#2121): pure decision + thin OS collector + a runner.
//
// A worktree is LANDED (purgeable) when one of these PROVES it:
//   - a DETACHED HEAD that is an ancestor of origin/main — the re-detached
//     post-merge state the law prescribes (`git checkout --detach
//     origin/main`). Branch worktrees never land on ancestry alone: a fresh
//     `worktree add -b forge/<slug> origin/main` is clean, branch-bound and
//     at the tip (#2293 ate a live builder workspace this way minutes after
//     #2279 merged); its proof must be a PR state or a pushed ref;
//   - its branch's GitHub PR is MERGED    (squash-merge rewrites history,
//     so ancestry alone misses these);
//   - its PR was CLOSED unmerged and the branch is pushed (dead decision-
//     work; the hand sweep removed these too).
// Every other state is KEPT, including the ones the law says must never
// be removed — uncommitted work, commits GitHub has never seen, an OPEN
// PR, a detached HEAD somewhere main does not carry, the main checkout
// itself, and a tree with `.mutant-running` at its root (#2047). A lane
// still sitting in the directory (a young opencode/vite process with its
// cwd inside) also keeps it: the sweep must never pull a workspace out
// from under a live session.
//
// Removal is `git worktree remove` WITHOUT --force, so git itself has
// the last word on dirt; ignored cruft (node_modules, .vite) does not
// block it, and `--max` caps one run so a single wrong classification can
// never wipe the factory. Default is dry; the warden passes --run.
//
// usage: node scripts/worktreepurge.mjs [--repo <dir>] [--run] [--max N]
//        [--nogh] [--nofetch]
//   --nogh  skip GitHub PR lookups (ancestor/CLOSED-branch rules only —
//           for hermetic runs; unmerged branches then keep conservatively)
//
// Output: `PURGE <path> <why>` / `KEEP <path> <why>` lines, then a
// summary `DONE purged=N kept=M cap=N dry=0|1`. Exit 0 always (hygiene
// must never fail a tick); usage errors exit 2.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

// --- pure core ---------------------------------------------------------------
// Facts per worktree (all injected, all deterministic):
// { isMain, mutant, dirty, driven, ancestor, branch, prState, pushed }
// prState: 'MERGED' | 'OPEN' | 'CLOSED' | null (null = GitHub never heard
// of it, or lookups skipped). Returns { action: 'purge'|'keep', why }.
export function purgeVerdict(wt) {
    if (wt.isMain) return { action: 'keep', why: 'main checkout' }
    if (wt.mutant) return { action: 'keep', why: 'mutant run live (#2047)' }
    if (wt.dirty) return { action: 'keep', why: 'uncommitted work' }
    if (wt.driven) return { action: 'keep', why: 'lane process inside' }
    if (wt.branch && wt.prState === 'OPEN') return { action: 'keep', why: 'PR open' }
    // Ancestry proves landing only for a DETACHED worktree (#2293): a fresh
    // `add -b <slug> origin/main` lane worktree is clean, at the tip, and has
    // no PR yet — mid-build, not landed. A branch worktree must prove landing
    // through GitHub (MERGED / CLOSED+pushed) or its pushed ref below.
    if (wt.ancestor && !wt.branch) return { action: 'purge', why: 'detached HEAD on origin/main' }
    if (wt.branch && wt.prState === 'MERGED') return { action: 'purge', why: `PR merged (${wt.branch})` }
    if (wt.branch && wt.prState === 'CLOSED' && wt.pushed) {
        return { action: 'purge', why: `PR closed unmerged, pushed (${wt.branch})` }
    }
    if (wt.branch && !wt.pushed) return { action: 'keep', why: 'unpushed commits' }
    if (wt.branch) return { action: 'keep', why: 'pushed, unmerged' }
    return { action: 'keep', why: 'detached off main' }
}

// --- collector (thin, OS-shaped) ---------------------------------------------
// Cap for the live-lane witness: a session runs at most 4 h; add slack.
// Older witnesses are leftovers, not lanes.
const DRIVEN_CAP_SEC = 5.5 * 3600

const git = (repo, ...args) => {
    try {
        return execFileSync('git', ['-C', repo, ...args],
            { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
        return null
    }
}

// Young opencode/vite processes → [{ cwd, age }]. Any failure is simply an
// empty witness list: a probe that cannot see adds no keeps, but deletion
// still requires the positive landed proof from the git/gh facts.
function liveCwds() {
    const out = []
    let pids = []
    for (const pat of ['opencode', 'vite']) {
        try {
            const o = execFileSync('pgrep', ['-f', pat], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
            pids.push(...o.split('\n').map((s) => Number(s.trim())).filter((p) => p > 0))
        } catch { /* none */ }
    }
    for (const pid of [...new Set(pids)].slice(0, 40)) {
        let cwd = null
        let started = NaN
        try {
            const f = execFileSync('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'],
                { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
            cwd = f.split('\n').filter((l) => l.startsWith('n')).map((l) => l.slice(1))[0] || null
            const st = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)],
                { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
            started = Date.parse(st)
        } catch { continue }
        if (cwd) out.push({ pid, cwd, age: Number.isFinite(started) ? Date.now() / 1000 - started / 1000 : 0 })
    }
    return out.filter((w) => w.age <= DRIVEN_CAP_SEC)
}

// recent PRs: Map<headRef, 'MERGED'|'OPEN'|'CLOSED'>, ours only.
function prStates(repoSlug) {
    const m = new Map()
    try {
        const o = execFileSync('gh', ['api',
            `repos/${repoSlug}/pulls?state=all&per_page=100&sort=updated&direction=desc`,
            '--jq', '[.[] | {ref: .head.ref, st: (if .merged then "MERGED" else .state end), repo: .head.repo.full_name}]'],
            { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'] })
        for (const p of JSON.parse(o)) {
            if (p.repo === repoSlug && !m.has(p.ref)) m.set(p.ref, p.st)
        }
    } catch { /* offline or gh missing: everything keeps (null) */ }
    return m
}

export function collectWorktrees(opts) {
    const { repo, nogh, nofetch } = opts
    const mainPath = git(repo, 'rev-parse', '--show-toplevel')
    if (!mainPath) throw new Error(`not a git repo: ${repo}`)
    git(repo, 'worktree', 'prune')
    if (!nofetch) git(repo, 'fetch', '--prune', 'origin')
    const originSha = git(repo, 'rev-parse', 'origin/main')
    const porcelain = git(repo, 'worktree', 'list', '--porcelain') || ''
    const prs = nogh ? new Map() : prStates(repoSlugOf(repo))
    const cwds = liveCwds()
    const wts = []
    let cur = null
    for (const line of porcelain.split('\n')) {
        if (line.startsWith('worktree ')) {
            if (cur) wts.push(cur)
            cur = { path: line.slice(9), head: null, branch: null, bare: false, detached: false }
        } else if (cur && line.startsWith('HEAD ')) cur.head = line.slice(5)
        else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '')
        else if (cur && line === 'detached') cur.detached = true
        else if (cur && line === 'bare') cur.bare = true
    }
    if (cur) wts.push(cur)
    return wts.filter((w) => !w.bare && w.head).map((w) => {
        const ancestor = originSha
            ? git(repo, 'merge-base', '--is-ancestor', w.head, 'origin/main') !== null
            : false
        const pushed = w.branch
            ? git(repo, 'rev-parse', `origin/${w.branch}`) === w.head
            : false
        return {
            ...w,
            isMain: w.path === mainPath,
            mutant: existsSync(`${w.path}/.mutant-running`),
            // null = git refused to answer (bad path): keep conservatively.
            // Empty string = CLEAN; a falsy check here reads every clean
            // tree as dirty (caught by the first live dry run, #2279).
            dirty: (() => { const st = git(w.path, 'status', '--porcelain'); return st === null || st !== '' })(),
            driven: cwds.some((c) => c.cwd === w.path || c.cwd.startsWith(w.path + '/')),
            ancestor,
            pushed,
            prState: w.branch ? prs.get(w.branch) ?? null : null,
        }
    })
}

function repoSlugOf(repo) {
    try {
        const url = execFileSync('git', ['-C', repo, 'remote', 'get-url', 'origin'],
            { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
        const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/)
        return m ? m[1] : 'jalfern/retrogames'
    } catch {
        return 'jalfern/retrogames'
    }
}

// --- runner ------------------------------------------------------------------
export function run(argv = []) {
    const has = (f) => argv.includes(f)
    const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
    const repo = val('--repo', process.cwd())
    const dry = !has('--run')
    const max = Math.max(0, Number(val('--max', 6)) || 0)
    let wts
    try {
        wts = collectWorktrees({ repo, nogh: has('--nogh'), nofetch: has('--nofetch') })
    } catch (e) {
        console.log(`ABORT ${e.message}`)
        return { purged: 0, kept: 0, aborted: true }
    }
    let purged = 0
    let kept = 0
    for (const w of wts) {
        if (w.path === process.cwd()) w.driven = true // never saw off the branch you sit on
        const v = purgeVerdict(w)
        if (v.action === 'purge' && purged >= max) {
            console.log(`KEEP ${w.path} over cap`)
            kept += 1
            continue
        }
        if (v.action !== 'purge') {
            console.log(`KEEP ${w.path} ${v.why}`)
            kept += 1
            continue
        }
        if (dry) {
            console.log(`DRY PURGE ${w.path} ${v.why}`)
            purged += 1
            continue
        }
        try {
            execFileSync('git', ['-C', repo, 'worktree', 'remove', w.path],
                { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] })
            console.log(`PURGE ${w.path} ${v.why}`)
            purged += 1
        } catch (e) {
            const hint = String((e && e.stderr) || e).split('\n').filter(Boolean).pop() || ''
            console.log(`KEEP ${w.path} git refused: ${hint.slice(0, 120)}`)
            kept += 1
        }
    }
    console.log(`DONE purged=${purged} kept=${kept} cap=${max} dry=${dry ? 1 : 0}`)
    return { purged, kept }
}

if (process.argv[1] && process.argv[1].endsWith('worktreepurge.mjs')) {
    const a = process.argv.slice(2)
    if (a.includes('--help')) {
        console.log('usage: node scripts/worktreepurge.mjs [--repo <dir>] [--run] [--max N] [--nogh] [--nofetch]')
        process.exit(0)
    }
    run(a)
}
