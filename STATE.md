# STATE — forge board snapshot (slot a, 2026-11-28 — attract parachutes shipped `ceab206`)

## This session (slot a) — the never-dry rung, taken and shipped
- Normal ladder dry, verified honest: no halt/steer; `next` #1712 carries
  waiting-jon → skipped; game-queue empty; feedback #2971/#3244 both
  waiting-jon; QA MASTER live → no borrow; flagship rung spent.
- Never-dry: `idle-kick` answers `KICK LEMMINGS-LITE 0 weak` — same target the
  warden's slot note carried; three Lemmings stages in a row because each ships
  and re-proves the title cheaper than any other shelf option.
- Filed POLISH #3853 and shipped PR #3855 → squash `ceab206`: **attract demo
  deploys its own parachutes** (README gap "the demo shows four skills while
  the game offers five"). `attract.js` exports a pure `demoFloatPick`: an
  unsripted airborne lemming gets the canopy first (THE DOOR opens one mid-air
  at the step-off); else after a 5 s grace the first unsripted walker wears one
  and the sim's own auto-open law deploys it on that walker's next fall. Cap 2
  per cycle, never over the pond (floaters drown — mockery, not rescue), never
  a script target (proven lines never re-timed), player supply untouched
  (`startPlay` rebuilds the level).
- Proof: lemcheck 177/177 + `--mutate` 199/199 (20 new pins); red-proof ×3 by
  hand (target exclusion ×2 / grace / water-skip — exactly the matching pins go
  red, restore green). Chrome drive 8/8: deploy at tick 311, canopy PAINTED
  (16 cream + 8 red px native rect), SPIRE still clears at tick 1984 ≪ timeout,
  both charges spent, zero page/console errors.

## BOARD facts at close
- main tip `ceab206`. building: #3854 FROGGER difficulty ramp (other lane).
  building-qa: #3856 ICE CLIMBER CO-OP. game-queue: empty. halt/steer: 0.
- jonq: #3791 AWAITING (deadline 11-29), #3516 AWAITING (default `done` fires
  at its sweep ~11-28 12:35Z — leave the Arkanoid texture line; do not re-file).
- Lemmings' 4 unowned gaps: BUILDER (oldest — sized this session, see below),
  blocker-wake (needs a re-solve), float-while-dig, static water. Rule-4
  streak: reset (game code merged).

## PLAYABLE on main right now
- LEMMINGS-LITE with demo parachutes: https://jalfern.com/retrogames/lemmings
  (attract: striped canopies catch the crowd; FLOATER is now visible on screen;
  every corpse still wails OH NO!; ponds drown; fatal falls at 3 tiles).
- Momentum Runner docked HUD chrome (#3852); FireCrew inset; DK fire oil;
  MINESWEEPER marquee; THE BARD'S TALE; PINBALL; SMASH-TV; KOI demo.

## Open questions (links only — #605)
- #3791 (dry shelf: which new flagship title — AWAITING, deadline 11-29),
  #3516 (Arkanoid texture rung — AWAITING, defaults done at the sweep).

## Next claims (for whoever is free)
1. BUILDER sizing (done, posted on #3853): placed-cell planks mean grid-state
   in `solve()`'s search space + re-proving all four levels' win/load-bearing/
   slack + redesign. Est. 1–2 days — the first title that legitimately needs a
   multi-session WIP branch (push a draft PR per playbook, keep `building`).
   Cheaper one-stage alternates: static water #2-ponds (level work, solver
   adapts by itself) or blocker-wake (medium, hard re-solve).
2. #3440 closable by the platform lane (evidence posted; zero comments since).
3. #3516/#3791: let the sweeps take their defaults; do not re-file.

## Slot state at handoff
- :5173 stopped via `scripts/devstop.sh`; other lanes' ports untouched.
- My worktree was pruned by mergeclean; STATE commits to main because the
  forge game merged this session (step-9 allowance).
- Harness facts worth keeping: (1) prod verification by bundle hash is
  unreliable — CI hashes differ from local; verify game-visible behaviour
  instead (this stage: canopy-red pixel count in the SPIRE attract window,
  which is zero pre-fix because the demo carried no bombs there). (2) In the
  shell, `gs.end` and `loadLevel` land in the same frame, so browser probes
  can never observe `end`/final-exit — discriminate quota-clears by the tick
  clock (clear fires far before the time-out) or cumulative maxes.
