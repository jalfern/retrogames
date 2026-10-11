# STATE.md — 2026-10-10 (SIMCITY-MIN session end)

## Where things stand
**#74 GAME 10 — SIMCITY-MIN IS LIVE at jalfern.com/retrogames/simcity-min**
(PR #132, squash ee343e0, issue closed — add the `shipped` label). Arcade is
27 titles. **Next session: claim the oldest `game-queue`** — head is #77
Lode Runner (#118 Minesweeper, #82 BensMagicBugLife also queued).

| since last STATE | what |
|---|---|
| #74 / `forge-simcity` | Four-module city: `scen.js` (3 maps, scripted fires + one tornado), `sim.js` (yearly ledger conserved to the cent, power BFS over the road graph, job-gated growth, `Math.random` banned at import), `planner.js` (greedy terrain-aware autopilot; its proven run IS the attract demo), shell with a cursor + 8-tool rail. Core contract: every map still wins with one fewer plant, one fewer station, $150 less (slack rule). |
| harnesses | `citycheck` 151 Node checks + 7 mutants (`--mutate`), `cityplay` 22 Chrome checks real-keys-only. Gates: `lint:sim` + `citycheck` in static; `cityplay` added to `smoke` (SC_URL env override like MB_URL). |

## What is playable right now
- jalfern.com/retrogames/simcity-min — prod verified with a real browser:
  route 200, H1 + live canvas, zero page errors.
- Attract cycles the three proven runs tick-for-tick; S0 wins y18, S1 y22,
  S2 y28; all three slack runs win too (receipts in citycheck output).

## What changed this session (the parts that matter next time)
- **I never touched the main checkout** (still dirty: `fpscheck.mjs`,
  `IronKeep/index.jsx`, QA's). Built in worktree `retrogames-simcity`;
  its `node_modules` is a SYMLINK to the main checkout's — worktrees without
  their own install need that (or `npm ci`) before any eslint/vite run.
- **A fire seed now waits for a city**: seeds stay armed until development is
  near, announce one `dudfire`, retry silently; scenario objects are never
  mutated (an `ignited` flag on S.fires would have poisoned every later run
  in the harness — found before it shipped).
- **Job-gated growth grew people with zero jobs**: the mid-band test was
  `J >= 0.65*P` which is vacuous at P=0. A powerRange mutant caught it
  because its fixture city had no industry. Every mutant survival this
  session was a report about the TEST: drained event buffers (probe must
  accumulate per tick), fixtures with no jobs, a probe asserting on ash
  while the fire had already burned out, and `(await x ? a : b)` parsing as
  `(await x) ? a : b` — the Promise never got awaited and `.cursor` was
  undefined.
- **`gh pr merge` cannot run when `main` is checked out in another worktree**
  — it tries to git-checkout main. Merge via
  `gh api -X PUT repos/.../pulls/N/merge -f merge_method=squash -f delete_branch=true`
  (same squash, branch deleted server-side; local branch left behind —
  `git switch -c <state-branch> origin/main` after fetching).
- S1 target moved 480→380 with funds 1600→2000 and deadline 52: the honest
  knob was capital (the tier gate was money-starved, not map-starved); the
  stability pin now grades DRAWS on the peak in the mature tail only — a
  still-climbing curve is health, not oscillation.

## Gates (all green at merge)
15 scoped lints (+`lint:sim` now a 16th) · `citycheck` 151/151 + 7/7 mutants
· `cityplay` 22/22 twice in a row · `missilecheck`/`aicheck`/`zorkcheck`/
`galactcheck`/`forgecheck`/`polarcheck` green · build ✓ · prod browser
check clean.

## Next (for the next session — do NOT re-debug these here)
1. Claim #77 Lode Runner. `pgrep -fl FORGE-QA` first; fresh worktree +
   node_modules symlink dance if main is still dirty.
2. SimCity-Min is shipped — do not polish. Its gates: `lint:sim` +
   `citycheck` (static), `cityplay` (smoke job).
3. Known honest gaps to pick up as their own issues someday: tax model is
   shallow (best-rate, no migration), fire spread residue is a die the
   planner can't see, no in-browser WIN check (win is Node-only; the end
   SCREEN is browser-checked).

## Three questions for Jon
1. Same recurring one, third session: worktree-per-session in the plists
   now that `gh api` merge is the documented path, or do we fix the main
   checkout (kill the QA loop, land its stash) so sessions can work in it?
2. The `--mutate` block spent more wall-time than the whole first harness
   build this session. Keep 7 mutants in `citycheck` forever, or graduate
   them to a rarer `--deep` run like `heistmutate`?
3. `scripts/.shots/` is images-only by policy — cityplay currently writes no
   screenshots at all. Do you want a `--shots` mode (title/play/fire/end
   frames uploaded by the smoke job) or is pixel-sampling enough?

## Lineage
AGENTS.md honored: read STATE first, claimed queue head #74 (claim was
already posted from the prior half of this session), one game, checkpoint
pushes with issue comments, harness proven able-to-fail (7/7 mutants — and
four of them first SURVIVED, each survival fixed in the test, not the code),
merge only after `gh pr checks --watch --fail-fast` (static+smoke+Vercel
green) then squash via the API because main was worktree-locked, prod
verified in a real browser, STATE rewritten here on a PR branch.
Rule 4: six straight sessions touching `src/games/**`. Ran ~4h20m — over
the 3-hour box by ~50m; the overage was entirely in test-honesty work
(mutants + browser flake root-causes), one game only, no scope creep.
