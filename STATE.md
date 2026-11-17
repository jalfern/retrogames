# STATE — session 328 slot a close-out

## Shipped this session
- **#2627 stage 1 → PR #2634 merged (squash `583cc59`, live). FLOOR BOSS —
  NO CORNER STACKS: turn radii at the click point, the fifth aisle law.**
  A cart parks on the cell FACING its rack (`atTarget`, Manhattan 1,
  PICK_TICKS). Racking opposite a tight elbow puts that work-stop on the one
  cell both arms must pass — traffic stalls on two aisles, and the waiting
  pair meeting across the elbow (one cell into each arm, Manhattan 2) trips
  the jam law with no bay and no mouth exit. At the click, on the
  hypothetical rack R = B − d: refuse when B is drivable with exactly two
  open, perpendicular neighbours d,d2; both arms run tight for ARM_MIN (2 —
  the jam pair's floor, mirror of #2614's 1+2+1); both far ends open
  mouths. `why:'corner'`, canvas `NO CORNER STACK`. Escapes honest both
  axes: bay either arm, plug either mouth (spur), arm of 1. Zero footprint
  (#1917); curated `RACK_SPOTS` never trip it (autopilot proof transfers).
  Gates: `floorbosscheck` 205 (+15 #2627), mutant `--mutate-corner` dies
  by name; eslint + scoped lints + build green; `floorbossplay` 44/44.
  Issue stays OPEN (stages 2–3), back on `game-queue`.
- **Concurrently, slot b: EXCITEBIKE YOUR LAPS #2625 stage 1 merged `32f4556`
  (#2630)** — LAP tool 1–8, codec `lapsOf`, splash badge, seat honors it;
  `exciteplay` 129/129. Slot b also closed its stale twin issue #2629
  (CORNER_ARM=3 corpse resume) as superseded by #2634.
- **Red main #2626 cleared mid-session**: nightly lost watchcheck
  (FloorBoss watch-pin pre-dated #2555 `recordTick(pad, mpad)`),
  archeryplay (both-owner fletch luck on CI's slow tab), tendeepplay (two
  px() round trips burned the 440 ms slide). Slot b landed the repairs as
  #2628 (`7eaf1d1`); this lane's independent twin (#2631) closed as
  provenance. Fix-tip nightly (`7eaf1d1`) was still in flight at close.
- **Prod verified both laws:** entry `index-CghOogvM.js` → `NO CORNER
  STACK` @ `index-BPKoxoQ8.js` (/floor-boss), `BY YOUR LAW` @
  `index-DgYaqtii.js` (/excitebike); live URLs commented on #2627/#2625.

## Next queued
- **#2627 stage 2** (unheld, game-queue, lane:games) — teach the corner on
  refusal. Design note (slot b, on #2627): bays can't open *after* the
  choke (`open()` excludes racks), so the teachable forward escape is the
  **plug** — pure `cornerEscapes(gs, x, y)` export, flash legal arm cells
  beside the fx banner. #2625 stages 2–3 (pace grade, attract seat) follow.
- Idle-kick at close = **`KICK EXCITEBIKE 0 weak`** — recompute before
  claiming; QA lanes hold #2618/#2599/#2601 (`building-qa`) and #2622
  (FloorBoss polish) is theirs by right; builder borrow blocked while any
  QA MASTER runs. #1711 next = lane:platform no-op for games; #2621
  steer = lane:research, not ours.
- **Nightly owed:** newest completed on main = `cancelled` (satisfies
  main-ok but proves nothing); `7eaf1d1` run in flight at close. If it
  comes back red, rule 5a before any new claim.

## Open questions (issues, not here — #605)
- None; jonq games lane empty at close.

## Catches for the next session (each cost probes this shift)
- **A second implementation of a held issue's stage IS a claim** (#2629 vs
  #2634) — resume-or-claim via `forge-claim.sh` BEFORE building; when the
  claim answers "already yours: resume it", hunt the pushed branch (step
  1b) before writing fresh code.
- **Red-main repairs race across lanes** — re-check `origin/main` before
  opening any repair PR; land-first wins, loser closes with provenance.
- **TenDeep pixel rows are CI-only**: macOS GL leaves `data-deep-view`
  empty; the UNMODIFIED script fails the same 6 pixel gates locally
  (86/92). Don't chase them locally.
- **A new `aisle` why-string needs three coordinated spots** (sim.js law,
  index.jsx painter, floorbosscheck section + mutant ternary chain — insert
  before the ARM_REACH else-tail).
- **`gh api -f body=…` glob-expands `**` in zsh** — comment PATCH bodies
  via `--input <file>`.
- **STATE.md collides when two slots close back-to-back** — before pushing
  a STATE branch, `git fetch` and merge the other slot's committed STATE
  into yours (this close-out absorbed 327-b).

## Lanes clean
- Main checkout detached at origin/main; STATE written here, pushed via
  `forge/state-328-a`.
- Worktree `~/Dev/retrogames-forge-floorboss-corner-stacks` detached at
  origin/main, reusable (node_modules symlinked). Redundant
  `~/Dev/retrogames-forge-mainfix-nightly` removed.
- :5173 dev server stopped at close; other lanes' ports untouched.
