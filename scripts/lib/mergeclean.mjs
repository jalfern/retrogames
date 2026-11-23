// #3013 — gh pr merge --delete-branch cleanup dies when a stale worktree
// squats on `main`: the merge lands server-side, gh exits 1 on its local
// bookkeeping ("fatal: 'main' is already used by worktree at …"), and the
// remote branch delete never runs (2nd bite: #3012; 1st: #2975's note).
// This lib is the shared logic for the fix:
//   warn-squats — list worktrees with `refs/heads/main` checked out (advisory)
//   reap        — `git worktree remove` the CLEAN ones (never --force: a dirty
//                 squat belongs to a live lane; name it and leave it)
//   post <br>   — after a merge attempt: trust PR *state* from GitHub, not gh's
//                 exit code, and complete the cleanup gh skipped.
// CLI: node scripts/lib/mergeclean.mjs warn-squats | reap | post <branch>
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

const REPO = process.env.REPO || 'jalfern/retrogames';

function git(args, opt = {}) {
    return execFileSync('git', args, { encoding: 'utf8', ...opt }).trim();
}
function gitOk(args, opt = {}) {
    try { git(args, opt); return true; } catch { return false; }
}
function gh(args) {
    return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

// Worktrees holding the `main` branch (a detached HEAD AT main is legal —
// plumbing checkouts work that way; only a checked-out branch squats on it).
export function mainSquats() {
    let out;
    try { out = git(['worktree', 'list', '--porcelain']); } catch { return []; }
    const squats = [];
    let path = null, branch = null;
    const flush = () => {
        if (path && branch === 'refs/heads/main') {
            let dirty = false;
            try { dirty = git(['status', '--porcelain'], { cwd: path }) !== ''; } catch { dirty = true; }
            squats.push({ path, dirty });
        }
        path = null; branch = null;
    };
    for (const line of out.split('\n')) {
        if (line.startsWith('worktree ')) { flush(); path = line.slice('worktree '.length).trim(); }
        else if (line.startsWith('branch ')) branch = line.slice('branch '.length).trim();
    }
    flush();
    return squats;
}

function warnSquats(squats) {
    if (!squats.length) return false;
    console.log(`WARN: \`main\` is checked out in ${squats.length} stale worktree(s) — this kills gh's post-merge cleanup (#3013):`);
    for (const s of squats) {
        console.log(s.dirty
            ? `  ${s.path} (DIRTY — belongs to a live lane; reap by hand once it commits/stashes: git worktree remove '${s.path}')`
            : s.reaped === undefined
                ? `  ${s.path} (clean — forge-merge.sh removes it; or: git worktree remove '${s.path}')`
                : s.reaped
                    ? `  ${s.path} (clean — reaped)`
                    : `  ${s.path} (clean but removal failed — reap by hand: git worktree remove '${s.path}')`);
    }
    return true;
}

// Remove clean squatters; report, never fail the caller over a dirty one.
export function reapSquats() {
    const squats = mainSquats();
    for (const s of squats) {
        if (s.dirty) continue;
        try { git(['worktree', 'remove', s.path]); s.reaped = true; } catch { s.reaped = false; }
    }
    warnSquats(squats);
    return squats;
}

// Runs in the lane worktree after `gh pr merge --squash --delete-branch`.
// Server state is the only truth that matters (#2975: gh can exit 1 AFTER a
// successful merge). Completes every cleanup step gh may have skipped.
export function postMerge(branch) {
    let state = '';
    try {
        const info = JSON.parse(gh(['pr', 'view', '--repo', REPO, '--json', 'state,headRefName']));
        state = info.state;
    } catch (e) {
        console.error(`mergeclean: cannot read PR state for ${branch}: ${e.message.split('\n')[0]}`);
        return 2;
    }
    if (state !== 'MERGED') {
        console.error(`mergeclean: PR for ${branch} is ${state} — nothing merged, leaving every ref untouched.`);
        return 2;
    }
    console.log(`mergeclean: PR for ${branch} is MERGED (server truth) — completing cleanup gh may have skipped`);
    git(['fetch', '--prune', 'origin']);
    // (a) remote branch delete gh never ran
    let remoteGone;
    try {
        execFileSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', branch], { stdio: 'pipe' });
        try { git(['push', 'origin', '--delete', branch]); remoteGone = true; }
        catch { remoteGone = false; }
    } catch { remoteGone = true; } // ls-remote exit 1 = no such ref = already gone
    // (b) re-detach this lane at origin/main (gh auto-switches onto main when its
    // cleanup gets that far; when it dies earlier we still must not leave main's
    // law "main checked out nowhere" violated by our own branch)
    git(['checkout', '--detach', 'origin/main']);
    // (c) local branch delete
    let localGone;
    if (git(['branch', '--list', branch])) {
        try { git(['branch', '-D', branch]); localGone = true; }
        catch { console.warn(`mergeclean: local branch ${branch} still held elsewhere — delete by hand: git branch -D ${branch}`); localGone = false; }
    } else localGone = true;
    // (d) reap any main-squatter that killed gh's cleanup in the first place
    reapSquats();
    console.log(`mergeclean: done (remote branch ${remoteGone ? 'gone' : 'STILL PRESENT'}, lane detached at origin/main${localGone ? ', local branch deleted' : ''})`);
    return 0;
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
    const cmd = process.argv[2];
    if (cmd === 'warn-squats') { warnSquats(mainSquats()); process.exit(0); }
    else if (cmd === 'reap') { reapSquats(); process.exit(0); }
    else if (cmd === 'post') {
        const branch = process.argv[3];
        if (!branch) { console.error('usage: mergeclean.mjs post <branch>'); process.exit(2); }
        process.exit(postMerge(branch));
    } else {
        console.error('usage: mergeclean.mjs warn-squats | reap | post <branch>');
        process.exit(2);
    }
}
