# STATE.md — 2026-10-12 (LODE RUNNER session end)

## Where things stand
**#77 GAME 13 — LODE RUNNER-LITE IS LIVE at jalfern.com/retrogames/lode-runner**
(PR #153, squash `6fea7de`, `shipped`, issue closed; prod bundle
`index-CAlti0Qf.js` verified by driving the live page in Chrome, no dev
hooks). Arcade lists 33 titles.
**Next session: claim #78 Arena Archery (TowerFall-like)** — the oldest
`game-queue` entry (`gh issue list --label game-queue` sorted by createdAt;
head was #78 at 2026-10-09T22:50:34Z, then #79 WWI Dogfight, #82
BensMagicBugLife, #118 Minesweeper, #143 Paperboy, #152 Wizardry). No `next`
label exists right now. No unlabeled `GAME —` issue predates #78.
The queue move from #76 happened in a parallel session; this session
resumed the #77 corpse on `forge/lode-runner` per playbook 1b — that
mattered: two sim commits + three vaults were already hash-proven.

| since last STATE | what |
|---|---|
| #77 / `forge/lode-runner` | Resumed corpse (sim + levels existed, harness/shell did not). Shell: `index.jsx` 15 Hz fixed-step ASCII, attract = solver's witness through the real `applyAction+step`, ghost of your lost run (second sim fed your `{tick,act}` stream, ghost tick == live tick), R-retry, 19 lint scopes green. |
| harnesses | `lodecheck` 92 checks + **6 mutants, wired into CI with `--mutate`** (dig/jump/guardChase/trapCollapse/ropeCatch/quota — all die); `lodeplay` 23 Chrome real-key checks, 23/23 twice locally AND green on the CI smoke runner. Gates: `lint:lode` + `lodecheck --mutate` in static, `lodeplay` in smoke. |

## What is playable right now
- jalfern.com/retrogames/lode-runner — prod verified 200 + canvas lit +
  tap-to-start on the live bundle; attract self-walks the proven witness.
- All three vaults solvable by the real solver with guards live; witnesses
  never share a cell with a live guard; slack = half the clock AND -1 life.

## What changed this session (the parts that matter next time)
- **`step()` clears `g.events` at the top of the tick.** Anything that acts
  OUTSIDE step (this game's shell and harness both apply then step) must
  splice events BEFORE the step or its action-stage events (dig/jump/swing)
  are silently swallowed — first browser run painted traps only at
  collapse. Any future game whose input applies outside `step` inherits this.
- **Replaying a FINISHED run needs the tail tick**: the winning command fires
  `checkExit` at tick T and `step` refuses to advance past `end`, so a replay
  stopped at `maxTicks = T` compares an un-cleared vault to a cleared one and
  "diverges" while the engine is innocent. Both harness and `__lodeTest.replayCheck`
  use `maxTicks = tick + (last cmd at >= tick ? 1 : 0)`.
- **Contract as literally phrased can lie about its own level**: "nothing
  supports a rope" — but nuggets HANG from the line, so GOLD under rope is
  carved-in and legal. Contract now says EMPTY|LADDER|GOLD.
- **A harness that walks east on a guard's clock is a race, not a test**:
  lodeplay's walk-east check once flaked because the chase legitimately
  captured mid-assert and the honest respawn reset `x`. Narrowed the window;
  dying belongs to its own section.
- **Poll prod with -L** (jalfern 308→www) and never trust a manual loop that
  silently matched nothing — the env name `LODE_URL` vs a typo'd `LOADE_URL`
  also burned ten silent minutes polling 5173 for a game it didn't have.
  `lodeplay` now dumps `location.href` into the hook-failure line on purpose.
- `gh pr merge --squash` STILL fails while main is checked out elsewhere; the
  documented API form (`gh api PUT pulls/N/merge merge_method=squash
  delete_branch=true`) merged it after `--watch --fail-fast` was green, then
  delete the remote branch by hand (the API did not).
- QA MASTER (pid 73040) ran alongside in the main checkout all session;
  session lived in worktree `retrogames-runner` (removed after merge).

## Gates (all green at merge, PR #153)
19 scoped lints · `lodecheck` 92/92 + 6/6 mutants (CI runs `--mutate`) ·
`lodeplay` 23/23 ×2 local AND green on the smoke runner · static ✓ 2m ·
smoke ✓ 5m19s · build ✓ · prod 200 + game chunk driving on the live page.

## Next (for the next session — do NOT re-debug these here)
1. Claim #78 Arena Archery (TowerFall-like). Its muscle: local multiplayer
   aim/duel physics — the natural sibling of lode's one-input-per-tick
   discipline: two players, one keyboard, determinism needs an ordered
   input-stamp per tick, which is the harness lodecheck just proved works.
2. LODE RUNNER is shipped — do not polish. Honest gaps live in
   `src/games/LodeRunnerLite/README.md` (vault-2 `drop` pinned by scenario
   not witness; guard cell-pinning in the burial scenario; no pad vault
   select). If a harness flakes on CI, widen the WINDOW (lodeplay), never
   the assertion.
3. `lodecheck --mutate` runs IN CI's static job (cheap, ~6 solves) — keep
   new gates paid-for like this rather than opt-in.

## Three questions for Jon
1. Main checkout: QA MASTER keeps it busy, and `gh pr merge` refuses while
   it holds `main`. Should forge sessions standardize on the API merge form
   (documented twice now), or should the loop detach main (`worktree` on a
   pinned ref) so the normal command works?
2. Three sessions now shipped vault/portrait 2D canvas games with the same
   shell skeleton (canvas+HUD+attract+harness). Worth a `docs/GAME-SHELL.md`
   template so the next forge session starts from a proven skeleton instead
   of re-deriving the loop from Outpost's source?
3. The queue head #78 (Arena Archery) is local-multiplayer — phones can't
   share one touchpad. Prefer VirtualControls second-pad support first, or
   re-order the queue for a solo-friendly title (#118 Minesweeper)?

## Lineage
AGENTS.md honored: read STATE first, resumed the corpse before claiming
(1b), one game, checkpoint pushes with one-line issue comments per push,
harness proven able-to-fail (6/6 mutants IN CI), merge only via
checks-watch-then-squash (API form, worktree lock), prod verified, STATE via
PR to main. Rule 4: eight straight sessions touching `src/games/**`.
Ran ~2h45m — inside the box.
