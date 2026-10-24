# STATE — 2026-10-24 forge session 2 (SSX glade/shelf stage shipped; ssxcheck 334)

## Shipped this session
- **#975 → main (PR #977 squash 3abb90c)** — **SSX: day glade + obstacles are
  shelf models**, live at `https://www.jalfern.com/retrogames/ssx`.
  - Flagship idle stage (#841): queue was empty, QA lane live (borrow forbidden);
    `idle.mjs` picked SSX honest-gaps #1 honestly. Issue filed first.
  - `gladeDefs()` + fold into `sceneryPlan()`: 18 big conifers per day course,
    deterministic, gap-aware. TIMBER `treeD` 0.52→0.58 keeps the forest ~1.9x
    denser than the glades (#911 gate green).
  - `buildScenery()` derives `ph` primitives FROM the plan (id/pos/scale parity,
    tagged by plan index) — old parallel loops painted slots the shelf never had.
  - **Real bug**: `attachShelf` removed `ph` children one level deep; the
    scenery group nests inside world → every primitive double-drew under its GLB
    since #638 (live probe read ph=360 post-attach). `swapPlaceholders()` walks
    descendants; swap is per-model (`primitivesToKeep`): placeholder survives
    exactly when its own GLB failed.
  - Proof: `ssxcheck` 334 (+10 gates); two mutants dead (glade fold removed;
    keep-set neutered); `ssxmodelcheck` +3 browser gates green live
    (models=428, gladeN=18, ph=0); lint:ssx + build green; prod verified by
    marker strings in `assets/index-O887Ri1Z.js`.

## Next goal
- `game-queue` is EMPTY → #841 stages apply again: QA borrow (if QA idle) else
  flagship polish. Honest next pick via `idle.mjs`: SSX honest gaps #2 (blob
  contact shadow → real shadow casting), unless a `steer`/`next` lands first.
- Never touch QA-held issues; QA holds #928, #891, #939, #947, #956, #973.

## Board / harness status
- main = 3abb90c (this ship). QA merged 66d2db4 (#971 Method grab) mid-session —
  rebased clean onto it. `main-ok` green at claim + merge; `static` SUCCESS;
  Vercel pass; prod verified.
- `lint:mario`/`lint:fps`/`lint:ai`, `lint:ssx`, `npm run build` green.
- `jonq`: nothing AWAITING/ANSWERED/DEFAULTED in lane:games; nothing filed.
- Advisory only: ssxmodelcheck "paused scene stable" reads 20 vs 4 on pre-fix
  main — the old double-draw froze identical pixels; the honest swap moves them
  between pose-loop captures. One fix landed (wait-for-shelf before capture,
  36→20). Per rule 3: one PR attempt, moved on. Gate stays advisory-red until
  someone re-baselines the threshold honestly.

## New harness lessons (this session)
- **A pixel gate sees what a unit gate can't.** "ph count == 0 after attach" in
  a real browser found a 50-line-old nesting bug (children-only scan vs nested
  group) that every Node parity gate passed — Node never assembled the real
  world. When art promises a swap, probe the scene graph live.
- **Mutant restore: copy aside, never `git checkout <file>`.** A checkout of a
  mutated file restored HEAD and vaporized the whole uncommitted stage; redo
  cost 10 min. `cp file /tmp/x.keep.js` before the plant, restore from the copy.
- **Prod verify for polish stages via minifier-surviving literals** (theme
  strings, numeric constants like `40.7`) — exported names are renamed, and
  local vs Vercel content hashes can both be legitimate; match markers, not
  your dist filename.

## Housekeeping owed
- Prune when idle: this session's `retrogames-forge-ssx-shelf-glade` (main
  checkout already detached at origin/main; /tmp/ssxmain probe worktree removed);
  standing list (momentum-courses, iphone-controller, ssx-*, emberwood-*,
  qa-863*, people-sim, campfire-670, forge-model-library, coral-reef).
- STATE.md ships via its own PR (#920 convention) — this session merged a game
  (polish stage, still game code), so this file goes out via its own PR + merge.

## Open questions
- None (#605: nothing filed this session).
