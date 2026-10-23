# STATE — 2026-10-23 forge session (#839 GARDEN GUARD shipped)

## Shipped this session
- **#853 → main (squash, static SUCCESS)** — **#839: GARDEN GUARD**, an
  original lane-defense game in the lineage of a 2009 lawn classic, its own IP
  (autumn orchard vs goblin GRUNCH, acorns currency, all art/audio in code).
  Whole issue in one PR:
  - 5-lane lawn, cottage + one-shot scarecrow-mowers, drifting-acorn economy +
    Daisy producers, tap-a-card-tap-a-tile planting + trowel.
  - 6 defenders that counter (Daisy/Squirrel/Hedgerow/Chili/Frost/Pumpkin) vs
    Grunt/Sprinter/Pup-swarm/Brute/**Warlord**; waves build to a flagged
    FINAL WAVE; 5 levels, each wiping the lawn + giving a sunlight cache and
    unlocking the next defender.
  - Pointer/touch-first; pad (dpad+A/↻) and keyboard funnel through the SAME
    sim actions. `visibility:'private'` (#379).
  - Harness: `gardencheck` (pure Node over sim.js) **32/32** — boot + 14
    core-rule gates + winnable by the depth-first autopilot on **5 seeds** +
    determinism; proof-of-fail = chili `radius:0` turns the splash gate red.
    `contractcheck` (CONTRACT_ONLY=garden-guard) **15/15**, zero page errors.
    lint:mario/fps/ai + build green. Live: prod entry chunk
    `index-B65rwM80.js` carries `garden-guard`; route `#/garden-guard`.
- **#839 closed**; **#854 filed** (feedback): QA polish pass for Garden Guard.
- Shift report pushed ("Garden Guard: an original lane-defense orchard siege").

## Lessons
- **Worktree has no `node_modules`** — symlink from the main checkout
  (`ln -s ~/Dev/retrogames/node_modules <wt>/node_modules`) to run eslint/gates/
  build; it's gitignored, so it never stages. Reuse, don't reinstall.
- **Prod verify: `jalfern.com` 308-redirects to `www.jalfern.com`.** Polling the
  apex returns a 15-byte "Redirecting…" body, not the SPA — a false "not yet".
  Use `curl -L https://www.jalfern.com/retrogames/`.
- **Verify a lazy game by the route string in the referenced ENTRY chunk**, not by
  a sprite word: sprite text lives in the lazy chunk that index.html never
  references. `grep garden-guard` on the entry chunk flips green at deploy.
- **Board wipes between levels** ⇒ give a per-level sunlight cache
  (`acorns += 120+40*level`), else a cleared lawn + waves-at-5s can't rebuild a
  wall before the gate.
- **Mower must sweep the whole lane on trigger** (kill all lane enemies at once):
  firing the flag but leaving the trip-bearer walks it into the now-spent mower
  next tick → instant lose. Same shape for a bomb: exclude lit bombs from the
  enemy eat-scan or grunts nibble it before it detonates.
- **A green harness that never fails is a green harness that lies** — broke
  chili radius to 0, watched the gate go red, restored.
- **Bot ordering**: seed economy (2 daisies) → LINE every naked lane with a
  shooter before more economy → deepen/react. A half-finished wall is what loses;
  this reordered bot took the winnable seeds from "die at L2" to "clear L5".

## Next goal
- Oldest `game-queue` now **#840**: head-to-head falling-block battler (online 2P
  via the relay). Per Jon's decision, CPU opponent is the default (CPU seat works
  on phones + gives the harness an autopilot); two-player is a desktop option.
  Then #841 (builder-never-idles polish), #845 (SSX online).

## Board / harness status
- main green (nightly ok, no freeze); rule 4 satisfied (game code shipped).
- jonq lane:games: nothing AWAITING, nothing filed this session (no
  taste/priority question arose).
- QA lane owns: **#854** (new, Garden Guard polish), #851 (Selenitic), #831
  STORM, #834 MOUNTAINS (merged #852), #833 audio, #832 OCEAN, #752 EMBERWOOD,
  #680/#702 SHORE.
- Other builder lanes active this window: MOUNTAINS #852, MomentumRunner #849.

## Open questions
- none this session (lane:games). `#843`/`#825` are lane:qa (AWAITING), not ours.

## Housekeeping owed (not this lane's blocker)
- This lane's worktree `~/Dev/retrogames-forge-garden-839` is now a detached
  HEAD at origin/main with a node_modules symlink — safe to prune after review.
- Pre-existing stale worktrees (comet-drift/lander/qa-5xx families) for Jon's sweep.
