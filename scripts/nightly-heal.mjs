// #888: a green nightly on main closes any open "nightly is red" issue.
//
// nightly.yml's `report` job raises a fresh red issue when a full-suite night
// fails; nothing ever cleared it once main recovered, so a stale red thread
// read as an active freeze and the next failure got appended to an old issue
// instead of raising a fresh alarm (#687 sat open after main went green).
//
// The selection decision is pure and unit-tested here (`--selftest`); live mode
// shells out to `gh` and is exercised only by the nightly `heal` job on main.
// Branch-dispatched runs must neither open nor close the tracker, so the ref is
// checked twice (workflow `if` + here) — dropping either alone reddens a case.

import { execFileSync } from 'node:child_process';

const RED_TITLE = /nightly is red/i

// refName e.g. "refs/heads/main"; green = the nightly passed; openIssues = [{number,title}].
// Returns the numbers to close.
export function planCloses(refName, green, openIssues) {
  if (!green) return [];
  if (refName !== 'refs/heads/main') return [];
  return openIssues.filter((i) => RED_TITLE.test(i.title || '')).map((i) => i.number);
}

function selftest() {
  const MAIN = 'refs/heads/main';
  let pass = 0, fail = 0;
  const eq = (got, want, msg) => {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { pass++; console.log(`ok   ${msg}`); }
    else { fail++; console.log(`FAIL ${msg}: got ${g} want ${w}`); }
  };
  eq(planCloses(MAIN, true, [{ number: 687, title: 'nightly is red (2026-10-21)' }]), [687],
    'green main closes the open red tracker');
  eq(planCloses('refs/heads/qa/blob-rejoin-863', true, [{ number: 687, title: 'nightly is red (2026-10-21)' }]), [],
    'green branch run leaves it alone');
  eq(planCloses(MAIN, false, [{ number: 687, title: 'nightly is red (2026-10-21)' }]), [],
    'red run closes nothing');
  eq(planCloses(MAIN, true, [
    { number: 687, title: 'nightly is red (2026-10-21)' },
    { number: 690, title: 'nightly is red (2026-10-22)' },
  ]), [687, 690], 'a red streak of several trackers all close');
  eq(planCloses(MAIN, true, [{ number: 906, title: 'Touch buttons: say what they do' }]), [],
    'unrelated open issue untouched');
  eq(planCloses('refs/heads/forge/ssx-889', true, [{ number: 687, title: 'nightly is red (2026-10-21)' }]), [],
    'forge branch run leaves it alone');
  console.log(`\n${fail ? 'FAILED' : 'PASSED'} ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' });
}

function live() {
  const refName = process.env.GITHUB_REF || '';
  const repo = process.env.GITHUB_REPOSITORY || 'jalfern/retrogames';
  const url = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const open = JSON.parse(run('gh', ['issue', 'list', '--repo', repo, '--state', 'open',
    '--search', 'nightly is red in:title', '--json', 'number,title']));
  for (const n of planCloses(refName, true, open)) {
    run('gh', ['issue', 'comment', String(n), '--repo', repo,
      '--body', `Nightly green on main — merges unfrozen, closing. Run: ${url}`]);
    run('gh', ['issue', 'close', String(n), '--repo', repo, '--reason', 'completed']);
    console.log(`closed #${n}`);
  }
  if (!planCloses(refName, true, open).length) console.log(`nothing to close (ref=${refName || '?'}, open=${open.length})`);
}

if (process.argv.includes('--selftest')) selftest();
else live();
