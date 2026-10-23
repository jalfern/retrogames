# STATE — 2026-10-23 forge session (#838 MYST stage 1: Mechanical walkable)

## Shipped this session
- **#847 → main (squash, static SUCCESS)** — #838 stage 1. **MYST's Mechanical
  Age is now walkable**: 14 → 18 nodes (`mechWalk`, `mechCar`, `mechTop`,
  `mechRoom`) with the original's tower puzzle chain:
  - call lever → cage down → ride to gantry → **cage at the landing jams the
    control-room door** → send-down → release → inside the door **bangs shut**;
    floor plates hold door/cage **only while pressed** unless the **latch lever**
    freezes a pressed plate; latch both → walk out → ride down to your book.
  - **SPECTATOR** sphere in the control room shows the other Ages (panel +
    three-note hum). 5-lever gear chain relocated to the tower base (still
    unseals the red page, now on the gantry).
  - **State-driven machinery**: `updateMech` reflects `state.flags` every frame
    (cage rides rails, door swings/jams, plates depress, latch bites, gear seal
    spins aside) — drawn picture always matches the rules.
  - Harness: mystcheck **99→151 gates**; **14 mutants die** (3 new: un-jam,
    un-shut, un-latched-holds). `mystviewcheck` 55/55 (18 views framed),
    `mystplay` 10/10 full win. lint:myst/mario/fps/ai + build green.
  - Prod verified live (chunk `index-D19uwDmB.js` carries `SPECTATOR`).
- **#838 stays open** (`game-queue` removed, `building` released) — stages 2+
  per the issue (next: Selenitic). Stage-1 polish handoff posted on the issue.

## Lessons
- **This codebase's node views face world +z at `yaw 0`** (`rotation.y = π +
  yaw`): first-pass art placed on −z sat behind the camera. Spot yaws are
  bearings from +z; auto-placed pages/covers already use it — copy that.
- `views()` landmark check rays at mesh centers ignoring the frustum — a
  landmark *behind* the camera still "passes". Screenshot new views before
  trusting viewcheck green.
- Worktree needs `ln -s ~/Dev/retrogames/node_modules node_modules` (eslint/vite
  absent otherwise) — package-lock identical to main so the symlink is safe.
- Jon's #698 answer supersedes #635: builder takes the oldest `game-queue`
  item **in any lane** (demos included).

## Next goal
- #838 stage 2: **Selenitic walkable** (or Mechanical depth: moving cage shot,
  rendered Spectator visions). Oldest queue item again after: #839 lane-defense
  (own IP), #840 falling-block battler, #841 builder-never-idles polish stage.

## Board / harness status
- main green (nightly ok, no freeze). Rule 4 satisfied (game code shipped).
- jonq lane:games: nothing AWAITING, nothing filed this session.
- QA lane owns: #831 STORM (claimed), #834 MOUNTAINS, #833 audio, #832 OCEAN,
  #752 EMBERWOOD, #680/#702 SHORE, plus MYST polish note on #838.
- QA lanes (studio+mini) live this session; forge did NOT borrow feedback work.

## Housekeeping owed (not this lane's blocker)
- Stale worktrees on disk (comet-drift family, qa-5xx/6xx/7xx, lander family);
  remote branches for closed issues deletable by Jon's sweep.
