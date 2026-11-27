// plumbingcheck — #3735 proof, no network, no real repo. Replays the shape of
// the 2026-11-27 incident (#3730 ASTEROIDS edits found uncommitted in the
// plumbing checkout ~/Dev/retrogames — a worktree-only breach that froze slot a
// at step 1 and would have made every later merge cleanup ambiguous, #2047's
// shape). Reuses mergecheck's sandbox (bare origin + plumb clone detached at
// origin/main + lane worktree on forge/testfix + fake gh) and proves the
// plumbguard response:
//   A clean      — check exits 0; park is a no-op; plumbingRoot resolves from
//                 the lane worktree to the plumbing clone, not the lane.
//   B STATE.md   — the one allowance: a dirty STATE.md reads clean, parks clean,
//                 and its content survives untouched (step 9's report rides here).
//   C #3730 replay — tracked edit + untracked file(s): check names them and
//                 exits 1; park moves the flight verbatim into CORPSE_DIR
//                 (path-intact copies + status-at-discovery.txt +
//                 foreign-dirt.patch), restores the tree to HEAD truth, and
//                 leaves STATE.md alone.
//   D merge survives it — forge-merge.sh against a dirty plumbing clone: dirt
//                 parks first, the merge still completes (server truth), and the
//                 parked diff holds exactly what was in flight.
//   E park fails — parking cannot complete (CORPSE_DIR under a regular file):
//                 forge-merge REFUSES, `gh pr merge` never fires, and the dirt
//                 stays put untouched (nothing destroyed, nothing guessed).
//npm run plumbingcheck
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { GITCFG, buildSandbox } from './mergecheck.mjs';
import { check, park, plumbingRoot } from './lib/plumbguard.mjs';

let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
function ok(cond, name) {
    if (cond) { pass++; say(`  ok   ${name}`); }
    else { fail++; say(`  FAIL ${name}`); }
}
const run = (cmd, args, cwd, env) => spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' });
const git = (args, cwd, env) => run('git', args, cwd, env);

// Sandbox plus the #3735 knobs: parks stay inside the sandbox, and the plumbing
// clone carries the incident's dirt shape on demand.
function setup(tag, { dirt = false, untracked = false, state = false, brokenPark = false } = {}) {
    const s = buildSandbox(tag, { withSquat: false });
    s.env.CORPSE_DIR = brokenPark
        ? (() => { fs.writeFileSync(path.join(s.root, 'afile'), 'not a dir\n'); return path.join(s.root, 'afile', 'corpses'); })()
        : path.join(s.root, 'corpses');
    if (state) fs.writeFileSync(path.join(s.plumb, 'STATE.md'), 'report: lane b mid-shift\n'); // ALLOWED dirt
    if (dirt) fs.appendFileSync(path.join(s.plumb, 'README.md'), '\n// #3730 bounty popups (in flight)\n');
    if (untracked) {
        fs.mkdirSync(path.join(s.plumb, 'src', 'games', 'Asteroids'), { recursive: true });
        fs.writeFileSync(path.join(s.plumb, 'src', 'games', 'Asteroids', 'index.jsx'), '// saucer-ping tell (in flight)\n');
    }
    return s;
}
const parkedDirs = s => fs.existsSync(s.env.CORPSE_DIR) ? fs.readdirSync(s.env.CORPSE_DIR) : [];

say('A — clean plumbing: check passes, park is a no-op, plumbingRoot resolves past the lane');
{
    const s = setup('clean');
    ok(plumbingRoot(path.join(s.lane, 'scripts', 'lib')) === fs.realpathSync(s.plumb),
        'plumbingRoot from the lane worktree resolves to the plumbing clone');
    const c = run('node', [path.join(s.lane, 'scripts', 'lib', 'plumbguard.mjs'), 'check'], s.lane, s.env);
    ok(c.status === 0 && c.stdout.includes('clean'), `check exits 0 (got ${c.status})`);
    const p = run('node', [path.join(s.lane, 'scripts', 'lib', 'plumbguard.mjs'), 'park'], s.lane, s.env);
    ok(p.status === 0 && p.stdout.includes('nothing to park'), 'park reports no-op');
    ok(parkedDirs(s).length === 0, 'nothing parked for a clean tree');
    fs.rmSync(s.root, { recursive: true, force: true });
}

say('B — STATE.md is the allowance: reads clean, parks clean, content survives');
{
    const s = setup('state', { state: true });
    const c = run('node', [path.join(s.lane, 'scripts', 'lib', 'plumbguard.mjs'), 'check'], s.lane, s.env);
    ok(c.status === 0 && c.stdout.includes('clean'), 'STATE.md dirt does not read as foreign');
    const p = run('node', [path.join(s.lane, 'scripts', 'lib', 'plumbguard.mjs'), 'park'], s.lane, s.env);
    ok(p.status === 0, 'park passes over STATE.md');
    ok(fs.readFileSync(path.join(s.plumb, 'STATE.md'), 'utf8') === 'report: lane b mid-shift\n', 'STATE.md untouched (#605 report rides here)');
    fs.rmSync(s.root, { recursive: true, force: true });
}

say('C — #3730 replay: tracked edit + untracked file park verbatim and the tree returns to HEAD');
{
    const s = setup('replay', { dirt: true, untracked: true, state: true });
    const c = run('node', [path.join(s.lane, 'scripts', 'lib', 'plumbguard.mjs'), 'check'], s.lane, s.env);
    ok(c.status === 1 && c.stdout.includes('README.md') && c.stdout.includes('src/games/Asteroids/index.jsx'),
        'check names both foreign entries and exits 1');
    const p = run('node', [path.join(s.lane, 'scripts', 'lib', 'plumbguard.mjs'), 'park'], s.lane, s.env);
    ok(p.status === 0, `park exits 0 (got ${p.status})`);
    const dirs = parkedDirs(s);
    ok(dirs.length === 1, 'exactly one park dir');
    const parkDir = path.join(s.env.CORPSE_DIR, dirs[0] || '');
    ok(fs.readFileSync(path.join(parkDir, 'README.md'), 'utf8').includes('#3730 bounty popups'),
        'tracked flight preserved verbatim at its path');
    ok(fs.readFileSync(path.join(parkDir, 'src', 'games', 'Asteroids', 'index.jsx'), 'utf8').includes('saucer-ping tell'),
        'untracked flight preserved verbatim at its path');
    ok(fs.readFileSync(path.join(parkDir, 'status-at-discovery.txt'), 'utf8').includes('README.md'),
        'status-at-discovery.txt captured');
    ok(fs.readFileSync(path.join(parkDir, 'foreign-dirt.patch'), 'utf8').includes('bounty popups'),
        'foreign-dirt.patch captures the tracked diff');
    ok(git(['status', '--porcelain'], s.plumb, s.env).stdout.replace(/^\s*(?:M|\?\?)\s+STATE\.md\s*$/gm, '').trim() === '',
        'plumbing tree restored to HEAD truth (STATE.md exempt)');
    ok(!fs.existsSync(path.join(s.plumb, 'src', 'games', 'Asteroids', 'index.jsx')), 'untracked dirt removed from the tree');
    ok(fs.readFileSync(path.join(s.plumb, 'STATE.md'), 'utf8') === 'report: lane b mid-shift\n', 'STATE.md untouched by the park');
    fs.rmSync(s.root, { recursive: true, force: true });
}

say('D — forge-merge over a dirty plumbing clone: park first, merge completes anyway');
{
    if (spawnSync('/bin/zsh', ['--version'], { encoding: 'utf8' }).status !== 0) {
        say('  SKIP — /bin/zsh missing (GitHub runners): forge-merge replay rides the Studio nightly (#2278 pattern)');
    } else {
        const s = setup('mergemark', { dirt: true, untracked: true, state: true });
        const r = run('/bin/zsh', [path.join(s.lane, 'scripts', 'forge-merge.sh')], s.lane, s.env);
        const log = fs.existsSync(s.env.FAKE_LOG) ? fs.readFileSync(s.env.FAKE_LOG, 'utf8') : '';
        ok(r.stdout.includes('parked'), 'preflight parked the plumbing dirt');
        ok(r.status === 0 && log.includes('merge'), `merge still completed (exit ${r.status})`);
        ok(r.stdout.includes('MERGED (server truth)'), 'post-merge cleanup ran');
        const dirs = parkedDirs(s);
        ok(dirs.length === 1 && fs.readFileSync(path.join(s.env.CORPSE_DIR, dirs[0], 'src', 'games', 'Asteroids', 'index.jsx'), 'utf8').includes('saucer-ping'),
            'the flight is recoverable from the park dir');
        ok(git(['ls-tree', '--name-only', 'origin/main'], s.plumb, s.env).stdout.includes('game.js'), 'origin/main carries the squash commit');
        ok(git(['status', '--porcelain'], s.plumb, s.env).stdout.replace(/^\s*(?:M|\?\?)\s+STATE\.md\s*$/gm, '').trim() === '', 'plumbing left clean by the whole merge path');
        fs.rmSync(s.root, { recursive: true, force: true });
    }
}

say('E — parking cannot complete: forge-merge refuses, gh pr merge never fires, dirt untouched');
{
    if (spawnSync('/bin/zsh', ['--version'], { encoding: 'utf8' }).status !== 0) {
        say('  SKIP — /bin/zsh missing (GitHub runners): forge-merge replay rides the Studio nightly (#2278 pattern)');
    } else {
        const s = setup('parkfail', { dirt: true, brokenPark: true });
        const r = run('/bin/zsh', [path.join(s.lane, 'scripts', 'forge-merge.sh')], s.lane, s.env);
        const log = fs.existsSync(s.env.FAKE_LOG) ? fs.readFileSync(s.env.FAKE_LOG, 'utf8') : '';
        ok(r.status !== 0, `wrapper exits non-zero (got ${r.status})`);
        ok((r.stdout + r.stderr).includes('could not be parked'), 'says why: parking failed');
        ok(!log.includes('merge'), 'gh pr merge never fired');
        ok(git(['status', '--porcelain'], s.plumb, s.env).stdout.includes('README.md'), 'dirt stays put — nothing destroyed, nothing guessed');
        fs.rmSync(s.root, { recursive: true, force: true });
    }
}

say(`plumbingcheck: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
