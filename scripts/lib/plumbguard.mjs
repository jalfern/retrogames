// #3735 — the plumbing checkout (`~/Dev/retrogames`) is law'd read-only: "nobody
// edits or checks out `main` in it" (AGENTS.md, Jon 2026-10-11). A live lane's
// ASTEROIDS edits landed there anyway (#3730 corpse, found 2026-11-27): slot a
// correctly STOPPED at step 1, but every other lane would have merged over a tree
// that lied about its state (#2047's shape). Root cause was never pinned to a
// script, so this lib enforces the invariant instead:
//   check — name foreign dirt: anything `git status --porcelain` reports except
//           STATE.md (the one file each lane owns there, step 9 leaves it as an
//           uncommitted report; gitignored files never appear in porcelain).
//   park  — preserve the flight verbatim under /tmp/forge/corpse-<stamp>/
//           (file copies with paths intact, status-at-discovery.txt,
//           foreign-dirt.patch), then restore the tree to HEAD truth:
//           `git checkout --` for tracked paths, move for untracked. Nothing is
//           destroyed; the accident stops being ambiguous for anyone merging after.
// CLI: node scripts/lib/plumbguard.mjs check|park [path]   (default: the repo
// containing this script). Exit 0 = clean (or parked clean), non-zero = dirt
// remains / parking failed. `park` on a clean tree is a silent no-op.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = path.dirname(fileURLToPath(import.meta.url));

function git(args, cwd) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

// Porcelain entries except STATE.md. Returns [{ xy, paths }]; rename/copy entries
// keep both sides so restoring either side still names the real files.
function foreignDirt(cwd) {
    let out;
    try { out = git(['status', '--porcelain'], cwd); }
    catch { return null; } // not a checkout — caller decides
    const dirt = [];
    for (const line of out.split('\n')) {
        if (!line.trim()) continue;
        const xy = line.slice(0, 2);
        let rest = line.slice(3);
        const paths = [];
        const arrow = rest.indexOf(' -> ');
        if (arrow >= 0 && /^[R C]/.test(xy)) { paths.push(rest.slice(0, arrow)); rest = rest.slice(arrow + 4); }
        paths.push(rest.replace(/^"|"$/g, ''));
        if (paths.some(p => p === 'STATE.md' || p.endsWith('/STATE.md'))) continue;
        dirt.push({ xy, paths });
    }
    return dirt;
}

// Resolve the plumbing checkout from anywhere in the repo (lane worktrees
// included): the common git-dir lives inside the main checkout.
export function plumbingRoot(from = SELF) {
    let common;
    try {
        common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], from).trim();
    } catch { return null; }
    const guess = path.basename(common) === '.git' ? path.dirname(common) : null;
    if (!guess) return null;
    try {
        const own = git(['rev-parse', '--absolute-git-dir'], guess).trim();
        if (own === common || fs.existsSync(path.join(guess, '.git'))) return guess;
    } catch { /* not a checkout */ }
    return null;
}

export function check(root) {
    const dirt = foreignDirt(root);
    if (dirt === null) { console.error(`plumbguard: ${root} is not a git checkout`); return 2; }
    if (!dirt.length) { console.log(`plumbguard: ${root} clean (only STATE.md / ignored files permitted here)`); return 0; }
    console.log(`plumbguard: ${root} carries ${dirt.length} foreign entr(ies) — the plumbing checkout is read-only except STATE.md (#3735):`);
    for (const d of dirt) console.log(`  ${d.xy} ${d.paths.join(' -> ')}`);
    return 1;
}

export function park(root) {
    const dirt = foreignDirt(root);
    if (dirt === null) { console.error(`plumbguard: ${root} is not a git checkout`); return 2; }
    if (!dirt.length) { console.log(`plumbguard: ${root} clean — nothing to park`); return 0; }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const dest = path.join(process.env.CORPSE_DIR || '/tmp/forge', `corpse-${stamp}-${process.pid}`);
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'status-at-discovery.txt'), git(['status', '--porcelain'], root));
    try { fs.writeFileSync(path.join(dest, 'foreign-dirt.patch'), git(['diff'], root)); } catch { /* nothing tracked-diffable */ }
    let restored = true;
    const tracked = [];
    for (const d of dirt) {
        for (const p of d.paths) {
            const src = path.join(root, p);
            const dst = path.join(dest, p);
            try {
                if (fs.existsSync(src)) {
                    fs.mkdirSync(path.dirname(dst), { recursive: true });
                    fs.renameSync(src, dst); // move: preserved AND removed at once
                } // deleted tracked files: nothing to copy; the diff records the loss
            } catch (e) {
                restored = false;
                console.error(`plumbguard: could not park ${p}: ${e.message.split('\n')[0]}`);
            }
            if (!/^\?\?/.test(d.xy)) tracked.push(p);
        }
    }
    if (tracked.length) {
        try { git(['checkout', '--', ...tracked], root); }
        catch (e) { restored = false; console.error(`plumbguard: restore failed: ${e.message.split('\n')[0]}`); }
    }
    const left = foreignDirt(root) || [];
    if (!restored || left.length) {
        console.error(`plumbguard: PARK INCOMPLETE — ${left.length} entr(ies) still in ${root}; flight preserved at ${dest}`);
        for (const d of left) console.error(`  ${d.xy} ${d.paths.join(' -> ')}`);
        return 1;
    }
    console.log(`plumbguard: parked ${dirt.length} foreign entr(ies) to ${dest} (copies + status + diff) and restored ${root} to HEAD — STATE.md untouched`);
    console.log(`plumbguard: read the parked diff; if it matches an open issue's plan, note the park path on that issue (#3735)`);
    return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
    const cmd = process.argv[2];
    const rootArg = process.argv[3];
    const root = rootArg ? path.resolve(rootArg) : plumbingRoot();
    if (!root) { console.error('plumbguard: cannot locate the plumbing checkout — pass its path'); process.exit(2); }
    if (cmd === 'check') process.exit(check(root));
    if (cmd === 'park') process.exit(park(root));
    console.error('usage: plumbguard.mjs check|park [path]');
    process.exit(2);
}
