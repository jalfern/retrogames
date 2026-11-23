// mergecheck — #3013 proof, no network, no real repo.
// Builds sandbox git repos (bare origin + plumbing clone + lane worktree on a
// forge/* branch + a worktree squatting on `main`) and replays the trap that
// ate two merges' cleanup (#2975, #3012): gh merges server-side, its local
// bookkeeping dies on `'main' is already used by worktree`, the remote branch
// delete never runs. A fake `gh` on PATH does exactly that. Then runs the
// real scripts/forge-merge.sh against the sandbox and asserts the fix:
//   A clean squat    — exit 0, remote branch deleted, lane detached at
//                    origin/main holding the squash commit, local branch gone,
//                    squat reaped; preflight warns via main-ok.sh and the lib.
//   B dirty squat    — squat is NOT destroyed (named DIRTY), merge cleanup
//                    still completes.
//   C nothing merged — exit non-zero and NOTHING is touched (no deletes).
//npm run mergecheck
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
function ok(cond, name) {
    if (cond) { pass++; say(`  ok   ${name}`); }
    else { fail++; say(`  FAIL ${name}`); }
}
function run(cmd, args, cwd, env) {
    return spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' });
}
const git = (args, cwd, env) => run('git', args, cwd, env);

const GITCFG = {
    GIT_AUTHOR_NAME: 'mc', GIT_AUTHOR_EMAIL: 'mc@localhost',
    GIT_COMMITTER_NAME: 'mc', GIT_COMMITTER_EMAIL: 'mc@localhost',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    REPO: 'fake/repo', FAKE_BRANCH: 'forge/testfix',
};

const FAKE_GH = `#!/bin/zsh
# fake gh for the #3013 sandbox: static passes; merge lands server-side then
# dies like real gh does against a main-squatting worktree (exit 1, no remote
# delete). FAKE_MERGE=none fails the merge outright.
jqexpr=""
args=("$@")
for ((i=1; i<=$#args; i++)); do [[ "\${args[$i]}" == "--jq" ]] && jqexpr="\${args[$((i+1))]}"
done
emit() { if [[ -n "$jqexpr" ]]; then print -r -- "$1" | jq -r "$jqexpr"; else print -r -- "$1"; fi }
case "$1" in
  run) emit '[]' ;;
  pr)
    case "$2" in
      checks) emit '[{"name":"static","state":"SUCCESS"}]' ;;
      view)
        head=$(git -C "$FAKE_BARE" rev-parse --verify --quiet refs/heads/main)
        state=OPEN
        [[ -n "$head" && "$head" != "$FAKE_BASE" ]] && state=MERGED
        emit "{\\"state\\":\\"$state\\",\\"headRefName\\":\\"$FAKE_BRANCH\\"}" ;;
      merge)
        if [[ "$FAKE_MERGE" == "none" ]]; then
            echo "pull request is not mergeable (simulated)" >&2; exit 1
        fi
        git -C "$FAKE_SERVER" fetch -q origin
        git -C "$FAKE_SERVER" checkout -q -B main origin/main
        git -C "$FAKE_SERVER" merge -q --squash "origin/$FAKE_BRANCH"
        git -C "$FAKE_SERVER" commit -q -m "Squash commit of $FAKE_BRANCH"
        git -C "$FAKE_SERVER" push -q origin main
        echo "fatal: 'main' is already used by worktree at '$FAKE_SQUAT'" >&2
        exit 1 ;;
      *) echo "fake gh: unhandled pr sub $2" >&2; exit 1 ;;
    esac ;;
  *) echo "fake gh: unhandled: $*" >&2; exit 1 ;;
esac
`;

function buildSandbox(tag, { dirtySquat = false, merge = 'trap' } = {}) {
    // realpath the root: macOS /var -> /private/var, and git prints the resolved
    // worktree paths; HOME is sandboxed so zsh's ~/.zshenv cannot prepend
    // homebrew and shadow the fake gh (real gh answering "fake/repo" = silence).
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `mergecheck-${tag}-`)));
    const env = { ...GITCFG, HOME: root };
    const origin = path.join(root, 'origin.git');
    fs.mkdirSync(origin);
    if (git(['init', '-q', '--bare', '-b', 'main', origin], root, env).status !== 0) throw new Error('bare init failed');
    const plumb = path.join(root, 'plumb');
    if (git(['clone', '-q', origin, 'plumb'], root, env).status !== 0) throw new Error('clone failed');
    fs.writeFileSync(path.join(plumb, 'README.md'), '# mini arcade\n');
    fs.mkdirSync(path.join(plumb, 'scripts', 'lib'), { recursive: true });
    fs.copyFileSync(path.join(SRC, 'scripts', 'main-ok.sh'), path.join(plumb, 'scripts', 'main-ok.sh'));
    fs.copyFileSync(path.join(SRC, 'scripts', 'forge-merge.sh'), path.join(plumb, 'scripts', 'forge-merge.sh'));
    fs.copyFileSync(path.join(SRC, 'scripts', 'lib', 'mergeclean.mjs'), path.join(plumb, 'scripts', 'lib', 'mergeclean.mjs'));
    git(['add', '-A'], plumb, env); git(['commit', '-qm', 'seed'], plumb, env);
    git(['push', '-q', 'origin', 'main'], plumb, env);
    const base = git(['rev-parse', 'HEAD'], plumb, env).stdout.trim();
    fs.writeFileSync(path.join(plumb, 'game.js'), 'const fix = 1; // squash-me\n');
    git(['checkout', '-q', '-b', 'forge/testfix'], plumb, env);
    git(['add', '-A'], plumb, env); git(['commit', '-qm', 'the fix'], plumb, env);
    git(['push', '-q', '-u', 'origin', 'forge/testfix'], plumb, env);
    git(['checkout', '-q', '--detach', 'origin/main'], plumb, env); // plumbing detached (the law)
    const lane = path.join(root, 'lane');
    const squat = path.join(root, 'squat');
    if (git(['worktree', 'add', '-q', lane, 'forge/testfix'], plumb, env).status !== 0) throw new Error('lane worktree failed');
    git(['worktree', 'add', '-q', squat, 'main'], plumb, env);
    if (dirtySquat) fs.writeFileSync(path.join(squat, 'wip.txt'), 'another lane\'s live work\n');
    fs.mkdirSync(path.join(root, 'bin'));
    fs.writeFileSync(path.join(root, 'bin', 'gh'), FAKE_GH);
    fs.chmodSync(path.join(root, 'bin', 'gh'), 0o755);
    git(['clone', '-q', origin, 'server'], root, env);
    env.FAKE_BARE = origin; env.FAKE_SERVER = path.join(root, 'server');
    env.FAKE_BASE = base; env.FAKE_SQUAT = squat; env.FAKE_MERGE = merge;
    env.PATH = `${path.join(root, 'bin')}:${process.env.PATH}`;
    return { root, env, origin, plumb, lane, squat, base };
}

const remoteHeads = s => git(['ls-remote', '--heads', 'origin'], s.plumb, s.env).stdout;

say('A — clean main-squat, trap merge: cleanup completes');
{
    const s = buildSandbox('clean');
    let r = run('node', [path.join(s.lane, 'scripts', 'lib', 'mergeclean.mjs'), 'warn-squats'], s.lane, s.env);
    ok(r.status === 0 && r.stdout.includes(s.squat) && r.stdout.includes('clean'), 'lib names the clean squat (exit 0, advisory)');
    r = run('/bin/zsh', [path.join(s.lane, 'scripts', 'main-ok.sh')], s.lane, s.env);
    ok(r.status === 0 && r.stdout.includes('WARN') && r.stdout.includes(s.squat), 'main-ok.sh preflight warns about the squat');
    r = run('/bin/zsh', [path.join(s.lane, 'scripts', 'forge-merge.sh')], s.lane, s.env);
    ok(r.status === 0, `wrapper exits 0 despite gh's trap exit (got ${r.status})`);
    ok(r.stdout.includes('MERGED (server truth)'), 'wrapper trusts PR state, not gh exit');
    ok(!remoteHeads(s).includes('forge/testfix'), 'remote branch deleted (step gh skipped)');
    ok(!git(['worktree', 'list'], s.plumb, s.env).stdout.includes('[main]'), 'main checked out nowhere (law holds after reap)');
    const laneHead = git(['rev-parse', 'HEAD'], s.lane, s.env).stdout.trim();
    const originMain = git(['rev-parse', 'origin/main'], s.plumb, s.env).stdout.trim();
    const laneDetach = git(['symbolic-ref', '-q', 'HEAD'], s.lane, s.env).status !== 0;
    ok(laneDetach, 'lane left detached (no branch to hold after merge)');
    ok(laneHead === originMain && originMain !== s.base, `lane detached AT origin/main (${originMain.slice(0, 7)}) and main moved (was ${s.base.slice(0, 7)})`);
    ok(git(['ls-tree', '--name-only', 'origin/main'], s.plumb, s.env).stdout.includes('game.js'), 'origin/main carries the squash commit content');
    ok(!git(['rev-parse', '--verify', '--quiet', 'refs/heads/forge/testfix'], s.plumb, s.env).stdout.trim(), 'local branch deleted');
    ok(!fs.existsSync(s.squat), 'clean squat reaped');
    ok(!git(['worktree', 'list', '--porcelain'], s.plumb, s.env).stdout.includes(s.squat), 'worktree list no longer shows the squat');
    fs.rmSync(s.root, { recursive: true, force: true });
}

say('B — dirty main-squat: never destroyed, merge cleanup still completes');
{
    const s = buildSandbox('dirty', { dirtySquat: true });
    const r = run('/bin/zsh', [path.join(s.lane, 'scripts', 'forge-merge.sh')], s.lane, s.env);
    ok(r.status === 0, `wrapper exits 0 (got ${r.status})`);
    ok(r.stdout.includes('DIRTY'), 'dirty squat named DIRTY');
    ok(fs.existsSync(path.join(s.squat, 'wip.txt')), "dirty squat's work untouched");
    ok(fs.existsSync(s.squat), 'dirty squat left in place (no --force)');
    ok(!remoteHeads(s).includes('forge/testfix'), 'remote branch still deleted');
    ok(git(['symbolic-ref', '-q', 'HEAD'], s.lane, s.env).status !== 0, 'lane detached anyway');
    fs.rmSync(s.root, { recursive: true, force: true });
}

say('C — nothing merged: fail loudly, touch nothing');
{
    const s = buildSandbox('nope', { merge: 'none', dirtySquat: true });
    const r = run('/bin/zsh', [path.join(s.lane, 'scripts', 'forge-merge.sh')], s.lane, s.env);
    ok(r.status !== 0, `wrapper exits non-zero (got ${r.status})`);
    ok(r.stderr.includes('nothing merged') || r.stdout.includes('nothing merged'), 'says why: PR state OPEN');
    ok(remoteHeads(s).includes('forge/testfix'), 'remote branch untouched');
    ok(git(['branch', '--list', 'forge/testfix'], s.plumb, s.env).stdout.includes('forge/testfix'), 'local branch untouched');
    ok(git(['symbolic-ref', '--short', 'HEAD'], s.lane, s.env).stdout.trim() === 'forge/testfix', 'lane still on its branch');
    ok(fs.existsSync(path.join(s.squat, 'wip.txt')), 'dirty squat untouched (no un-merge, no destroy)');
    fs.rmSync(s.root, { recursive: true, force: true });
}

say(`mergecheck: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
