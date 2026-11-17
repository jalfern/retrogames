# STATE — session 325 slot a close-out

## Shipped this session
- **#2614 → PR #2616 merged (squash `f14d205`, live). FLOOR BOSS — NO-PASS
  LANES (#2614): two-way width becomes a build law.** The #2546 aisle tail
  ("true turn radii / two-way lane widths stay future work") — width half,
  never-dry pick adjusted from `KICK PRINCE OF PERSIA 0 weak` (PoP gap 0 is
  check-only, CivV's a Stage-1 scope-cut list, PickRush's self-labels "not a
  feel task"; FloorBoss's gap was the oldest unowned player-visible rule).
  `laneRuns` (sim.js) scans rows then columns for maximal TIGHT runs (open
  cells, both perpendicular neighbours blocked); completing a straight run of
  `LANE_LONG` (5) cells with BOTH mouths open is refused — money not spent,
  `why:'lane'`, `NO PASSING LANE` on canvas. 5 = trap's physical floor: the
  jam law (distance 2) first fits fully inside a lane at 1+2+1. Escapes gated
  honest: bay notch (open side-cell splits the run), plugged mouth (dead-end
  spur — one-way by choice, legal per #2546), runs 1..4 legal everywhere.
  Zero footprint (#1917): click-point only — refusal charges nothing, lands no
  rack, changes no hash, refusal-deterministic; curated `RACK_SPOTS` never
  trip it so the autopilot win proof transfers untouched.
  Gates: `floorbosscheck` **190/190** (was 178; +12 gates #2614 section:
  4-legal/5-refused both axes, bay + spur exemptions both axes, no-charge/
  no-state/determinism, autopilot invariant, painter name pin). Mutant
  `--mutate-lane` dies by name; tree restores green, guard clean. eslint +
  three scoped gates + build green. `floorbossplay` 44/44 on :5173 (first
  run flaked 4 gates cold-transform, one rerun green per rule). Prod
  verified: chunk `index-Bx5QgomK.js` carries `NO PASSING LANE`.
- **#2579 executed + closed (no build, ruling). ARENA ARCHERY #2585 was
  answered B** while this session ran: single-row hangs DECLINED, thick-stone
  hangs (`a3efd02`) stand as shipped law; honest duels never hear the heat
  bell for a one-row lift. Recorded in the game README as a **DISCLAIMER**
  gap (PR #2623, squash `ae2b9d4`) — idle.mjs decided-state class — so a
  ruling Jon closed cannot score for weakestStage and re-kick lanes onto
  declined work (#961/#2488 law; ArenaArchery now 0 scoring gaps). Declined
  shape archived `origin/pull/2583/head` (`a002199`).

## Next queued
- Board clean at close: **no `building`, jonq `games` lane empty, game-queue
  empty**. `next` = #1711 (lane:platform — games-lane no-op, precedent
  314–322+). Unclaimed `feedback`: **#2573** (EXCITEBIKE polish — QA lane
  shipped `b97ff16`/item-slice and released it) and **#2622** (this slot's
  FLOOR BOSS polish pass: drive the lane-refusal with real taps, teach the
  bay on refusal, readable two-way aisles, duel-path banner check).
- Idle-kick at close = **`KICK EXCITEBIKE 0 weak`** (gap 0 of its README).
  Recompute before claiming — QA lanes (mini/mini2/studio were all live at
  close) may claim #2573/#2622 first, and the builder's feedback-borrow is
  blocked while any QA MASTER runs → flagship stage → never-dry.
- Warden note: slot b was re-kicked with TARGET #2579 AFTER this session
  closed it — claim will find it CLOSED; the ladder is the fallback.

## Open questions (issues, not here — #605)
- None filed this lane; jonq reports none open for games at close.

## Catches for the next session (each cost probes this shift)
- **`gh issue create --labels` does not exist on this gh** — repeat `-l`
  per label.
- **Playbook shorthand `forge-<slug>` vs the real branch `forge/<slug>`** —
  `git push -u origin forge-<slug>` dies "src refspec"; push the slash form
  (ls-remote is the truth).
- **FloorBoss rigs must clear seeded racks first** (`gs.racks.length = 0`) —
  seeds stand racks at (14,3)+(16,5) and naive rig cells collide. Side
  find, out of scope: tool=rack click on an OCCUPIED cell stacks a duplicate
  rack for $60 (strandsFloor returns false on occupied; clickCell never
  checks occupancy) — candidate QA/fix item.
- **Prod verify: Vercel chunk hashes ≠ local build hashes** (different
  env) — locate the prod chunk by ROLE marker (grep old law strings, e.g.
  `DEAD-END AISLE` finds FloorBoss's chunk) instead of the local file name;
  zsh grep needs `export LC_ALL=C` or minified JS errors "character not in
  range" and the loop silently misses.
- **Never-dry step-down is legal and should be written down**: weakestStage
  can name a game whose only gap can't ship gameplay (#1571: check-only
  "does not count"); this session filed its why-weakest line with the
  explicit disqualification list so the step is auditable.

## Lanes clean
- Main checkout detached at origin/main (`ae2b9d4`); STATE.md written here
  and committed to main via `forge/state-325-a` (game merged this session).
- Worktree `~/Dev/retrogames-forge-floorboss-no-pass-lanes` re-detached at
  origin/main, reusable (node_modules symlinked from main checkout).
- :5173 dev server stopped at close; other lanes' ports untouched
  (:5174, :5176, :5178, :5179, :5199).
