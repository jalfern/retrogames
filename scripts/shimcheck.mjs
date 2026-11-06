// SHIMCHECK (#1676) — offline proof that scripts/gh-shim.sh closes the three
// merge-safety holes that fired on 2026-11-06 (#1666/#1671: a detached worktree
// merged another lane's PR; a zombie merge loop raced a second one; rule-5's
// static-wait spun blind on state=completed). The shim talks to a stub GitHub
// API on loopback (GH_SHIM_API short-circuits the proxy) and throwaway git
// repos, so every guard is exercised without touching GitHub.
//
//   node scripts/shimcheck.mjs           # must go green
//   node scripts/shimcheck.mjs --mutate # must also go green THROUGH red:
//                                       # guards punched out of a shim copy must
//                                       # each make the suite fail (a suite that
//                                       # stays green on the mutant is BLIND)

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHIM = join(HERE, 'gh-shim.sh');
const MUTATE = process.argv.includes('--mutate');

const root = mkdtempSync(join(tmpdir(), 'shimcheck-'));

// ------------------------------------------------------------- stub API ----
// PR 55 rides forge/other (the wrong-branch trap); PR 56 rides qa/mine.
const PRS = {
  55: { number: 55, head: { ref: 'forge/other', sha: 'sha55', repo: { full_name: 'jalfern/retrogames' } }, mergeable_state: 'clean' },
  56: { number: 56, head: { ref: 'qa/mine', sha: 'sha56', repo: { full_name: 'jalfern/retrogames' } }, mergeable_state: 'clean' },
};
// sha56's check-runs: green static, an in-progress smoke, a failed advisory.
const CHECKRUNS = {
  sha56: [
    { name: 'static', status: 'completed', conclusion: 'success', html_url: 'https://example.test/1' },
    { name: 'smoke', status: 'in_progress', conclusion: null, html_url: 'https://example.test/2' },
    { name: 'verify', status: 'completed', conclusion: 'failure', html_url: 'https://example.test/3' },
  ],
};
let hits = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;
  hits.push(`${req.method} ${p}`);
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  let m;
  if ((m = p.match(/^\/repos\/[^/]+\/[^/]+\/pulls$/)) && req.method === 'GET') {
    const head = url.searchParams.get('head') || '';
    const br = head.split(':')[1] || '';
    // GitHub ignores a filter whose value is empty ("owner:") — the exact
    // detached-HEAD shape that made the old shim merge the newest open PR.
    const list = br === '' ? Object.values(PRS) : Object.values(PRS).filter((pr) => pr.head.ref === br);
    return json(200, list);
  }
  if ((m = p.match(/^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)$/))) return json(PRS[m[1]] ? 200 : 404, PRS[m[1]] || { message: 'Not Found' });
  if ((m = p.match(/^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)\/merge$/)) && req.method === 'PUT') {
    hits.push('MERGED');
    return json(200, { merged: true, sha: 'squashed' });
  }
  if (/^\/repos\/[^/]+\/[^/]+\/git\/refs\/heads\//.test(p) && req.method === 'DELETE') return json(204, {});
  if ((m = p.match(/^\/repos\/[^/]+\/[^/]+\/commits\/([^/]+)\/check-runs$/)) && req.method === 'GET') {
    return json(200, { check_runs: CHECKRUNS[m[1]] || [] });
  }
  if (p.match(/^\/repos\/[^/]+\/[^/]+\/actions\/runs$/) && req.method === 'GET') {
    return json(200, { workflow_runs: [{ name: 'CI', head_branch: 'main', status: 'completed', conclusion: 'failure', html_url: 'https://example.test/run' }] });
  }
  return json(404, { message: 'stub: no route ' + p });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${server.address().port}`;

// ----------------------------------------------------------- temp repos ----
const mkRepo = (name, branch, detach = false) => {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: 'pipe' });
  g('init', '-q', '-b', branch);
  g('config', 'user.email', 'qa@jalfern.com');
  g('config', 'user.name', 'qa');
  writeFileSync(join(dir, 'f'), 'x');
  g('add', '.');
  g('commit', '-qm', 'seed');
  if (detach) g('checkout', '-q', '--detach', 'HEAD');
  return dir;
};
const mine = mkRepo('mine', 'qa/mine');          // matches PR 56
const other = mkRepo('other', 'qa/fake');       // head-filter finds PR 55 on forge/other
const detached = mkRepo('detached', 'qa/gone', true);
const emptyBr = mkRepo('empty', 'qa/nobody');    // branch with no PR at all

// ----------------------------------------------------------------- suite ----
async function suite(shimPath, tag) {
  let pass = 0, fail = 0;
  const ok = (cond, name, info = '') => {
    if (cond) { pass++; if (!MUTATE) console.log(`  ok   ${name}`); }
    else { fail++; console.log(`FAIL   ${tag ? tag + ': ' : ''}${name}${info ? ` — ${info}` : ''}`); }
  };
  const LOCKD = join(root, `locks-${tag}`);
  // async on purpose: the stub API lives in THIS process — a synchronous spawn
  // would freeze the event loop and curl would wait out its 60 s timeout.
  const run = (args, cwd) => new Promise((resolve) => {
    const p = spawn('bash', [shimPath, ...args], {
      cwd,
      env: { ...process.env, GH_SHIM_API: API, GH_SHIM_TOKEN: 'stub', GH_SHIM_PROXY: '', GH_SHIM_LOCKDIR: LOCKD },
    });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (status) => resolve({ status, stdout, stderr }));
  });

  console.log(`${tag ? `[${tag}] ` : ''}#1676 hole 1 — PR resolution never falls through`);
  {
    const r = await run(['pr', 'checks', '--json', 'name,state'], detached);
    ok(r.status !== 0 && /detached/.test(r.stderr), 'checks refuses on detached HEAD', `exit=${r.status} ${r.stderr.trim()}`);
  }
  {
    const r = await run(['pr', 'merge', '--squash', '--delete-branch'], detached);
    ok(r.status !== 0 && /detached/.test(r.stderr) && !hits.includes('MERGED'), 'merge refuses on detached HEAD', `exit=${r.status} ${r.stderr.trim()}`);
  }
  {
    const r = await run(['pr', 'view', '--json', 'number'], detached);
    ok(r.status !== 0 && !/"number"/.test(r.stdout), 'view refuses on detached HEAD (no newest-open PR)', `exit=${r.status}`);
  }
  {
    const r = await run(['pr', 'checks', '--json', 'name,state'], emptyBr);
    ok(r.status !== 0 && /no open PR/.test(r.stderr), 'branch with no PR: explicit error, no list fallthrough', r.stderr.trim());
  }
  hits = hits.filter((h) => h !== 'MERGED');
  {
    const r = await run(['pr', 'merge', '55', '--squash'], other);
    ok(r.status !== 0 && /forge\/other/.test(r.stderr) && !hits.includes('MERGED'),
      'merge refuses cross-branch PR (branch qa/fake vs PR 55 on forge/other)', r.stderr.trim());
  }

  console.log(`${tag ? `[${tag}] ` : ''}rule-5 vocabulary — state speaks SUCCESS/FAILURE/IN_PROGRESS`);
  {
    const r = await run(['pr', 'checks', '--json', 'name,state,link', '--jq',
      'map(select(.name=="static"))[0].state'], mine);
    ok(r.stdout.trim() === 'SUCCESS', 'green static reads SUCCESS (rule-5 loop breaks)', `got: ${r.stdout.trim()}`);
  }
  {
    const r = await run(['pr', 'checks', '--json', 'name,state', '--jq',
      'map(select(.name=="smoke"))[0].state'], mine);
    ok(r.stdout.trim() === 'IN_PROGRESS', 'in-progress smoke reads IN_PROGRESS (loop keeps waiting)', `got: ${r.stdout.trim()}`);
  }
  {
    const r = await run(['pr', 'checks', '--json', 'name,state', '--jq',
      'map(select(.name=="verify"))[0].state'], mine);
    ok(r.stdout.trim() === 'FAILURE', 'failed advisory reads FAILURE (triageable red)', `got: ${r.stdout.trim()}`);
  }
  {
    const r = await run(['pr', 'checks', '--json', 'link', '--jq', '[.[].link] | join(",")'], mine);
    ok(r.stdout.includes('example.test'), 'checks expose link (was null through the shim)');
  }

  console.log(`${tag ? `[${tag}] ` : ''}#1676 hole 3 — one merge loop per PR`);
  {
    mkdirSync(join(LOCKD, 'merge-56.lock'), { recursive: true });
    writeFileSync(join(LOCKD, 'merge-56.lock', 'pid'), '4242');
    hits = hits.filter((h) => h !== 'MERGED');
    const r = await run(['pr', 'merge', '--squash'], mine);
    ok(r.status !== 0 && /merge loop/.test(r.stderr) && !hits.includes('MERGED'),
      'second loop defers while the lock is fresh', r.stderr.trim());
    rmSync(join(LOCKD, 'merge-56.lock'), { recursive: true, force: true });
  }
  {
    hits = hits.filter((h) => h !== 'MERGED');
    const r = await run(['pr', 'merge', '--squash'], mine);
    ok(r.status === 0 && hits.includes('MERGED'), 'happy path still merges (guard is a seatbelt, not a padlock)', `exit=${r.status}`);
    ok(!existsSync(join(LOCKD, 'merge-56.lock')), 'lock released after the merge');
  }

  console.log(`${tag ? `[${tag}] ` : ''}run list without --workflow (#1676: red advisories untriageable)`);
  {
    const r = await run(['run', 'list', '--branch', 'main', '--status', 'completed', '--limit', '3',
      '--json', 'conclusion,url', '--jq', '.[0].conclusion'], mine);
    ok(r.status === 0 && r.stdout.trim() === 'failure', 'workflow-less run list resolves via /actions/runs', `exit=${r.status} out=${r.stdout.trim()}`);
  }

  return { pass, fail };
}

const main = await suite(SHIM, null);
let mutantDied = null;
if (MUTATE) {
  // Punch all four guards out of a copy; the suite must fail on every hole.
  const dead = join(root, 'dead-shim.sh');
  let src = readFileSync(SHIM, 'utf8');
  const edits = [
    ['if [ -z "$br" ]; then\n    echo "gh: $what', 'if false; then\n    echo "gh: $what'],                        // detached guard
    ['if [ -n "$br" ] && [ "$ref" != "$br" ]; then\n      fail "refusing', 'if false; then\n      fail "refusing'], // ref assert
    ['if ! mkdir "$lock" 2>/dev/null; then', 'if false; then'],                                                       // lock
    ['state: (if .status == "completed" then ((.conclusion // "unknown") | ascii_upcase) else (.status | ascii_upcase) end)',
      'state: (.status | ascii_upcase)'],                                                                              // vocab
  ];
  for (const [from, to] of edits) {
    if (!src.includes(from)) { console.error(`BLIND: mutant target not found: ${from.slice(0, 40)}…`); process.exit(1); }
    src = src.replace(from, to);
  }
  writeFileSync(dead, src);
  mutantDied = await suite(dead, 'mutant');
}

server.close();

console.log(`\nshimcheck ${MUTATE ? '+mutants ' : ''}${main.fail === 0 ? 'PASSED' : 'FAILED'} — ${main.pass} pass, ${main.fail} fail`);
if (MUTATE) {
  if (main.fail > 0) { console.error('shimcheck: the REAL shim fails — nothing to prove'); process.exit(1); }
  if (mutantDied.fail === 0) { console.error('BLIND: mutant survived — these guards are not proven'); process.exit(1); }
  console.log(`mutants: died with ${mutantDied.fail} failure(s) — guards have teeth`);
}
process.exit(main.fail === 0 ? 0 : 1);
