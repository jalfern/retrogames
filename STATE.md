# STATE — forge board snapshot (slot b, 2026-11-28 — FLOATER shipped; red main #3837 cleared; shelf dry again)

## This session (slot b)
- **SHIPPED: LEMMINGS-LITE FLOATER** (#3827 → PR #3833, main `f5f3a5f`) — never-dry
  stage from the warden kick (`KICK LEMMINGS-LITE -1 weak`). Parachute: descent capped
  2.6 vs 8.5, no fatal landings, flag-for-life + #422 re-grant guard, striped canopy
  drawn while walking (original), Digit5/L1/panel, deploy swoosh + soft-landing blip,
  2 floaters/level as player-side slack (solver never offered float → all proofs/slack
  ride the four original mechanics). lemcheck 151/151 + mutation 171/171 (new
  floatSp pin, caught; immunity clause hand-killed → red → restored). lemplay green
  runs + canopy pixel proof. Live: https://jalfern.com/retrogames/lemmings
- **Red main cleared (#5a):** `static` was failing at main — #3826/#3830 parked
  Polarity + MissileBattle WATCH pills at 7.4rem below the 6.75rem toast default →
  #1653 pill/toast law violated ×8. Filed #3837, fixed (toasts → 10.75rem riding
  --sat, Emberwood precedent), watchpillcheck 229/229, **merged #3838** before mine.
- **Never-dry kick traced as phantom** and evidence posted on #3440: the kick's score
  came from #3825's body saying "per the Lemmings/LodeRunner convention" — a whole-word
  *style reference* in another game's issue (#3788 family, title-only naming proposed).
- **Lemmings README written** (was missing), merged with slot a's water notes; honest
  gaps now: BUILDER, waking blockers, tight maxFall, float-dig vs tunnel-digger,
  attract never parachutes, static ponds, oh-no cry.
- **lemplay water-aware hardening** (one timing PR, per AGENTS #3): pond check
  tolerates FF outrunning the probe (caught-over iff dead===drowned && cmds===0);
  pickPair bounds to eastbound open-plain walkers; press/slide freshness-poll.
  **Residual live-target nearest-flip filed as #3841** (lane:platform) with repro.

## BOARD facts at close
- main tip `f5f3a5f` (FLOATER). Merges this slot: #3833 (game), #3838 (chrome fix) —
  rule-4 streak still 0 (game code shipped).
- building/building-qa: NONE. game-queue: empty. halt/steer: 0. idle-kick: NONE.
- feedback open: #3244 (TIDAL RUSH), #2971 (CONTRA) — both waiting-jon.
- Fresh bugs filed by me: #3837 (closed via #3838), #3841 (open, advisory flake).

## PLAYABLE on main right now
- LEMMINGS-LITE — five skills, ponds drown, floaters don't: https://jalfern.com/retrogames/lemmings
- BUBBLE BOBBLE attract hint; DONKEY KONG fire oil; MINESWEEPER marquee;
  POLARITY + MISSILE BATTLE with clean toast/pill chrome.

## Open questions (links only — #605)
- #3791 (dry shelf: which new flagship title? — AWAITING, deadline 11-29;
  default = hold shelf, shipping only what Jon or QA files).
- #3516 (Arkanoid art rung, AWAITING, deadline 11-28 ~12:35Z; default = done).

## Next claims (for whoever is free)
1. Re-run the ladder fresh; idle-kick both views + `pgrep -f "QA MASTER"` at open.
   If NONE: STOP is legal — the shelf is honestly dry (my stage consumed the last
   kick, and that kick itself was phantom). Do NOT re-file #3791 (open, weekly cap).
2. #3516 default fires tomorrow ~12:35Z; #3791 11-29. Expect dry-but-legal closes
   until Jon names a flagship.
3. #3841 is advisory (static never touched it); platform lane's timing work.

## Slot state at handoff
- Dev server :5178 stopped via `scripts/devstop.sh`; no other lane's port touched.
- Lane worktree pruned by mergeclean; main checkout detached at `origin/main`.
- STATE commit to main: this session merged a game → STATE published via its own PR
  (per #3834 precedent), parked slot-scoped via `statepark.mjs park b` right after writing.
