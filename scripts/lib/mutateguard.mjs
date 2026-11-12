// #1359: the mutant graveyard ends here. A *check.mjs that plants source
// mutants on disk and spawnSyncs a child is a kill target — shell timeouts,
// ctrl-C, warden sweeps. The default SIGTERM disposition ends the process
// INSIDE spawnSync, before the restore line runs, and the mutant stays in
// the tree: a corpse that reports itself as a real rules failure on every
// later run (Sonar's attract.js, 2026-10-31). plant() remembers what it
// overwrote and arms signal + exit handlers once per process, so a kill
// rewinds every still-planted file before the process stops.
//
// Usage in a mutate loop (same position the two writeFileSync calls had):
//   import { plant, pull } from './lib/mutateguard.mjs'
//   plant(file, orig.replace(from, to))   // mutate
//   ...spawnSync the child...
//   pull(file)                          // restore
//
// SIGKILL stays uncapturable (nothing is), but `timeout` and the warden
// send TERM, and the exit hook also covers process.exit paths.
//
// #2049: the corpse's twin is CONCURRENCY. plant() rewrites TRACKED files in
// place, so a `git add` racing a --mutate run commits the mutant text — that
// is how `score: seed % 97` reached main in PR #2047 while every gate result
// the session trusted had been measured on the clean tree 20 minutes earlier.
// A mutant run freezes the tree:
//   - plant() refuses when any tracked file is already modified at run start;
//   - pull() refuses to continue when another tracked file changed while a
//     mutant was down (loud restore, exit 1 — a green tally after that point
//     is fiction);
//   - .mutant-running sits at the worktree root for the whole run: the tree
//     is frozen; commit nothing while it exists.
// Checks run from the repo root; when cwd is not a git root, stamp and scans
// are skipped — the guard must never break a check that passes (muteguardcheck
// itself fixtures under the ignored .muteguard-tmp/, outside any git root).

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..', '..') // repo root (scripts/lib/ -> repo)

// #1679: checks build their module paths as `new URL(...)` (that is what
// dynamic import() wants), and fs calls accept URL — but path.resolve() and
// Map keys do not. Cometcheck crashed its whole --mutate pass the moment it
// handed a URL to plant/pull. The guard takes what fs takes, and normalizes
// so plant(URL)/pull(string-path) provably hit the same remembered key.
const key = (file) => resolve(file instanceof URL ? fileURLToPath(file) : file)

const originals = new Map() // resolved path -> pre-mutation contents (ABSENT for planted new files)
const relPath = new Map() // resolved path -> git-root-relative path (for pollution scans)
const ABSENT = Symbol('absent')
let armed = false
let gitRoot // nearest git root of the planted files; false = not a repo (skips checks)
const STAMP = '.mutant-running'

const git = (root, args) => {
    try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
    catch { return null } // no git binary / not a repo — degrade to unguarded, never break a passing check
}

// One rev-parse: --show-toplevel is the worktree root (covers linked
// worktrees); empty = bare repo / not a repo / no git binary.
function rootFor(p) {
    if (gitRoot !== undefined) return gitRoot
    const out = git(dirname(p), ['rev-parse', '--show-toplevel'])
    gitRoot = out ? resolve(out) : false
    return gitRoot
}

// Tracked files differing from HEAD (staged or not — #2047's add staged the
// mutant). diff never reports untracked files; --untracked-files is not a
// diff flag (129 usage error, once silently caught here — the guard then
// believed every tree clean). null = git failed = unknown.
const dirtyTracked = (root) => {
    const out = git(root, ['diff', 'HEAD', '--name-only', '--no-ext-diff'])
    return out === null ? null : out.split('\n').filter(Boolean)
}

function writeStamp(p) {
    const root = (rootFor(p) && join(gitRoot, STAMP)) || null // null when cwd is not a git root
    if (root) writeFileSync(root, `# #2049: a --mutate run is live in this worktree (pid ${process.pid}, ${new Date().toISOString()}).\n# The tree is frozen — plant() rewrites tracked files in place. Commit NOTHING while this exists.\n`)
}

function removeStamp() {
    if (gitRoot) rmSync(join(gitRoot, STAMP), { force: true })
}

// Concurrent-edit check: any tracked file modified that WE did not plant?
// (our own planted file sits modified in the same window; it is not pollution.)
function polluter(root) {
    const ours = new Set(relPath.values())
    const dirty = dirtyTracked(root)
    if (dirty === null) return null // unknown — never abort on a git failure
    return dirty.find((r) => !ours.has(r)) || null
}

// Arm once. plant() calls this; scripts that mutate without plant() (none
// should after #1359) can call it directly.
export function guardExit() {
    if (armed) return
    armed = true
    for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
        process.on(sig, () => { restoreAll(); process.exit(1) })
    }
    process.on('exit', restoreAll)
}

// Write `mutated` to `file`, remembering the bytes underneath it.
// #2049: a mutant run is the only writer the tree may have — refuse to start
// (or continue) while other tracked files are modified, and freeze the tree
// with .mutant-running while any mutant is down.
export function plant(file, mutated) {
    guardExit()
    const p = key(file)
    if (!originals.has(p)) {
        const root = rootFor(p)
        if (root && originals.size === 0) {
            const dirty = dirtyTracked(root)
            if (dirty === null) console.warn('mutateguard: git diff failed at mutant-run start — the #2049 freeze check is offline for this run')
            else if (dirty.length) {
                console.error(`mutateguard: refusing to start a mutant run — ${dirty.length} tracked file(s) modified in this worktree (${dirty.slice(0, 8).join(', ')}${dirty.length > 8 ? ', …' : ''}). A commit racing plant() commits the mutant (#2047). Commit or stash first; the tree is frozen while .mutant-running exists.`)
                process.exit(1)
            }
        }
        originals.set(p, existsSync(p) ? readFileSync(p, 'utf8') : ABSENT)
        if (root) { relPath.set(p, relative(root, p).split('\\').join('/')); writeStamp(p) }
    }
    writeFileSync(p, mutated)
}

// The dotfile mutators (ironring, viperpit) plant a NEW mutant beside the
// real module instead of editing it — same corpse risk (a stale mutant sits
// in src/), so the same guard covers it: restore means unlink.
export function plantNew(file, mutated) {
    return plant(file, mutated)
}

// Put the remembered bytes back — or unlink when the file did not exist
// before the plant (no-op if nothing was planted here). After restoring, any
// OTHER tracked file differing from HEAD means someone edited or staged during
// the run (#2047): the tally from here on measures a tree we do not control.
// Rewind what WE still have planted, leave the foreign edit in place (it is
// its author's work), and die rather than report greens from fiction.
export function pull(file) {
    const p = key(file)
    if (!originals.has(p)) return
    if (originals.get(p) === ABSENT) rmSync(p, { force: true })
    else writeFileSync(p, originals.get(p))
    originals.delete(p)
    relPath.delete(p)
    if (originals.size === 0) removeStamp()
    const root = gitRoot
    if (root) {
        const bad = polluter(root) // any tracked change that is not one of ours
        if (bad) abort(root, [bad])
    }
}

function abort(root, dirty) {
    restoreAll()
    console.error(`mutateguard: concurrent edit detected during a mutant run — ${dirty.join(' ')} differ(s) from HEAD but this process never planted them (#2049). The tree was edited while mutants were down; those gate results are untrustworthy. Commit nothing from this run; find the other writer.`)
    process.exit(1)
}

// Rewind everything still planted. Runs on every exit path the process can see.
export function restoreAll() {
    for (const [p, orig] of originals) {
        if (orig === ABSENT) rmSync(p, { force: true })
        else writeFileSync(p, orig)
    }
    originals.clear()
    relPath.clear()
    removeStamp()
}

// #2049 CLI: `node scripts/lib/mutateguard.mjs --check` exits 1 (and names
// the pid) while a mutant run is live — scripts and wrappers that stage or
// commit can ask the tree before touching the index.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)) && process.argv[2] === '--check') {
    const s = join(ROOT, STAMP)
    if (existsSync(s)) {
        const pid = (readFileSync(s, 'utf8').match(/pid (\d+)/) || [])[1] || '?'
        console.error(`mutateguard: ${STAMP} exists${pid !== '?' ? ` (pid ${pid})` : ''} — a --mutate run is live, the worktree is frozen (#2049). Wait for its tally before staging or committing.`)
        process.exit(1)
    }
    console.log(`mutateguard: no ${STAMP} — safe to stage`)
}
