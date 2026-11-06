# STATE — session 151 (2026-11-05, slot a)

## What shipped
**WATCH ROLLOUT BATCH 4 (#1637) — PR #1661 squash-merged `0e5c314`, LIVE on prod.**
Five titles get the Y-key WATCH mode, each seated on its proven driver:
- **Zork I** — `ZorkExplorer`+`AgentLoop` (zorkcheck-proven). Y only when the story
  input is EMPTY (mid-word 'y' stays a letter); answers Q/N prompts. ZORK II/III
  deliberately NO button (`canWatch` gates on route `/zork`) — honesty over coverage.
- **RobotLab** — kit `createAutopilot(sim)` seats only at a CLEAN-BENCH junction
  (nothing held, goal unbanked); otherwise amber `no guide yet` toast. Fixed real bug:
  `startRun` rebound `sim` but not `autopilot` → driver bound to dead sim.
- **FloorBoss** — sim.js `createAutopilot()` anywhere (closed-loop); `recordTick(pad)`
  keeps the input recording honest about who pressed.
- **IronRing** — seat-1 CPU at the fighter's own tier (`def.cpu = BY_ID[p1Char].cpu`),
  cpu-ladder mode only, survives ladder auto-advance. Fixed REAL BUG since #1104:
  `atAttract()` ended attract immediately → offline players PINNED on the title,
  select unreachable; ironringcheck's "fight starts from select" passed VACUOUSLY.
  Fix: `atAttract(toSelect)` — key/tap callers advance, champion-return doesn't.
  ironringcheck +2 regression gates (attract→select, pick walks into fight).
- **Rally Co-Driver** — pacebrain via existing `modelPad` in the DRIVER seat (offline
  only; co seat stays cpuCoDriverPad; net excluded from watch).
Per-title: Y toggle, any takeover key/tap releases, start/stop blips (`playWatchStart/
Stop`), WatchToast + WatchButton pills, watch resets at run/phase transitions. Registry
WATCH_HELP: 33/80 routes now watched (was 28).
Harness: watchcheck +5 pilots (batch-4 factory map; zork custom) + batch-4 source gates
(blip imports, zork route gate, robot clean-bench, floor episode-honesty, rally net
exclusion, registry presence/absence) — source gates pass standalone.

## Watchcheck is NOT in CI — new gap found
`watchcheck` (and `ironringcheck`/`floorbosscheck`) appear in NO workflow — batch 2's
node soaks (`watchsoakcheck`) were the workaround. So the 5 new pilots (44 total) have
never executed anywhere. One-line fix for the next harness PR: add
`npm run watchcheck` to ci.yml (core scope) or verify.mjs suite — BEFORE batch 5.
Documented on #1637 (2026-11-05 ship comment). QA polish pass filed: **#1663**.

## #1622 ROOT-CAUSED (posted on the issue, full evidence)
Local SPA mount failure = **duplicated React in the Vite dev optimizer**: fresh cold
cache, `deps/react.js` imports `require_react` from chunk-FCVBRA66 while
`react-dom_client.js` uses chunk-KFUBF4C3 — two react instances, dispatcher null →
`Cannot read properties of null (reading 'useEffect')` at renderWithHooks → #root empty
→ every "DEV hook present" check dies. Deterministic across restarts, reproduced on
qa-1655's server (machine-wide). `optimizeDeps.include` pin did NOT fix it. Proposed
fix on #1622: pin `optimizeDeps.entries` properly — harness infra, one lane, not
batch work. Nuance vs session 150's note: Chrome JS *does* run on this box (shell+sp,
pageerrors observed) — it is the dev-server graph, not the engine.

## Gates as run this session
eslint clean on touched files · lint:mario/fps/ai ✓ · build ✓ · zorkcheck 58/58 ·
robokitcheck OK · floorbosscheck all green · rallycheck 169/0. Browser suites CI-side
only (advisory): prsmokes/scope green, static SUCCESS (merge gate), smoke still running
at merge — rule 3 respected, #1622 evidence posted instead of chasing.

## Next (priority order)
1. **Wire watchcheck into CI** (see gap above) — one-liner PR, clears 44 pilots.
2. #1637 batch 5 claim (`forge-claim.sh 1637 a`): remaining solver titles —
   MagicCarpet (#1645 default DISSOLVE stands), Lode Runner-Lite, Arena Archery,
   WWI Dogfight, DOS/IF remainder (Ultima/KQ via dosKeys path).
3. #1653 parts 1+3 (mobile pill + soak) — QA lane; #1654/#1655/#1663 polish passes
   belong to QA too (Jon's 2026-10-19 decision).
4. #1612 remainder stands.

## Notes for the next slot-a session
- Dev server on 5173 STOPPED at end of session (was mine). Reuse 5173 (slot-a port).
- Worktree `~/Dev/retrogames-forge-watch-rollout-b4` re-detached at origin/main
  (`0e5c314`), node_modules in place — reusable; branch deleted both ends.
- Prod verified by bundle marker (`index-DIKLken_.js` carries batch-4 IronRing copy);
  jalfern.com apex 308-redirects to www — `curl -L` or hit www directly.
- gh-shim again confirmed: `gh pr checks --json` state:"completed"+lowercase
  conclusion; merge loop matched `SUCCESS || completed,success` (merged fine).
- ironringcheck is now 1 extra section heavier (attract gates); don't delete them when
  touching IronRing — the vacuous-pass class of bug is exactly what they catch.
- `. /tmp/forge/netenv.sh` before gh/jonq/curl-to-prod. Park STATE right after write:
  `node scripts/statepark.mjs park a`.

## Open questions
Carried: #1645 (MagicCarpet 11th spell, unlabeled, recorded default DISSOLVE — take
as decided when MagicCarpet is next built). None new this session.
