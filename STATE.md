# STATE — 2026-10-23 forge session (#838 MYST stage 2: Selenitic walkable)

## Shipped this session
- **#850 → main (squash, static SUCCESS)** — #838 stage 2. **MYST's Selenitic
  Age is now walkable**: 18 → 22 views (`selSound`, `selThrone`, `selGate`,
  `selTop`) with the original's Moon-age chain:
  - **Sounding path**: six stones sized by pitch (biggest = lowest, as in
    Cyan 1993). Correct ascending route rings out and grinds the cliff gate
    open; any wrong stone buzzes and resets the field.
  - **Sun-and-moon throne**: swivel the chair through eight notches; only the
    detent framing BOTH moon and low sun in the arch opens the mountain door
    (the plaque tells you; the arch shows it).
  - **Summit gear**: switchback terraces up to a ledge under a huge cratered
    moon; the brass SELENITIC GEAR lifts from its slot (one of Mechanical's
    five — carried flag `gearSelenitic`, not yet wired into the tower).
  - All machinery state-driven (`updateMech`): stones stay depressed when rung,
    slab sinks, throne swivels notch-by-notch, sun disc exists only at the
    alignment, door slides, gear vanishes when taken.
  - Harness: mystcheck **151→198 gates**; **21 mutants** (7 new Selenitic:
    any-order stones, stuck gate, align-everywhere, door ignoring alignment,
    gear slot that keeps giving, one-pitch stones, silent buzz) — all die.
    `mystviewcheck` 67/67 (22 views framed), `mystplay` 10/10 full win.
    lint:myst/mario/fps/ai + build green.
  - Prod verified live (lazy chunk `index-MmxszVLS.js` carries `selThrone`).
- **#838 stays open** (`building` released) — stages 3+ per the issue.
- **#851 filed** (`feedback`): QA polish pass for the Selenitic views.

## Lessons
- **`updateMech` must read the field it mutates from the right shelf**: the
  throne vanished because the code read `F.selChair` (flags) while the state
  keeps `selStone`/`selChair` top-level → `undefined` → NaN rotation ate the
  whole subtree invisibly while the scene graph looked healthy. A mesh that is
  `visible:true, scale:[1,1,1]` but absent from the render is NaN, not missing.
- **Views face +z at yaw 0** (confirmed again): landmarks/moon go at GREATER z
  than the camera. Two separate shots lost the moon to corridor walls, a gate
  lintel, a buttress and finally the FOV (elevation >36° is out of frame;
  azimuth >~54° is out of frame at 16:9). Screenshot every new view.
- Occluders check: a decorative disc needs its ray clear from camera z to the
  disc — lower the massif, not just aim higher.
- `gh pr merge --delete-branch` fast-forwarded the worktree onto `main`; the
  re-detach after merging is not optional.
- Prod verify: MYST is code-split — poll the LAZY chunk for the marker; the
  index.html hash at the edge can lag while assets are already new.

## Next goal
- #838 stage 3: **Channelwood walkable** (star-wheel river lifts, the train of
  boats, the star symbols) or Selenitic depth (moving-cage-style gear ride,
  rendered Spectator). Oldest queue items after: #839 lane-defense (own IP),
  #840 falling-block battler, #841 builder-never-idles polish stage.

## Board / harness status
- main green (nightly ok, no freeze). Rule 4 satisfied (game code shipped).
- jonq lane:games: nothing AWAITING, nothing filed this session.
- QA lane owns: #851 (new, MYST/Selenitic polish), #831 STORM (claimed),
  #834 MOUNTAINS, #833 audio, #832 OCEAN, #752 EMBERWOOD, #680/#702 SHORE.
- Other builder lanes active: SSX #844/#848 merged during this session.

## Housekeeping owed (not this lane's blocker)
- Stale worktrees on disk (comet-drift family, qa-5xx/6xx/7xx, lander family);
  remote branches for closed issues deletable by Jon's sweep.
