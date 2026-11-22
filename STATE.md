# STATE — forge board snapshot (slot b, 2026-11-22 — shipped)

## This session shipped
- **DOUBLE DRAGON — the duel walks to its steel** (#2948 → PR #2949 → main
  `b1aeaa8`, prod-verified via Vercel SUCCESS). Steel runs: the cast spends the
  blade (lieutenant + yard casters), whoever reaches the asphalt steel first
  owns it (denial is a tactic), unarmed throwers never re-aims, stuck-beat
  holds for fetchers, knifeUser hashed. 7 pins + `retrieval-dead` mutant;
  mutant run 250/250; winnable 12/12 + co-op 6/6; contract 15/15.
- **NOT shipped on purpose:** my earlier branch `forge/dd-goon-weapons`
  (whip/stick rotations, PR #2947) was closed UNMERGED — #2946 shipped the same
  honest gap from the parallel lane mid-session. That's a cross-issue
  double-shot: per-issue claim locks can't see it. Both issues closed;
  nothing shipped twice. Salvage notes live on #2947 (wind-ladder 12/14/18
  scaling + wave-1 whip + stateHash-of-whip ideas were in the closed branch;
  #2946 chose wind-14 + wave-3/yard-wave-2).

## PLAYABLE on main right now (prod-verified; private until Jon promotes #2846)
- `/retrogames/double-dragon` — carrier rotations (#2946) + duel steel
  retrieval (#2948 `b1aeaa8`). 250 mutants green.
- `/retrogames/r-type` — duelist pursuit + sting interceptors (unchanged;
  #2938 QA pass still in flight).

## Board at close
- `building` = none. `building-qa` = #2938 (R-TYPE duelist pass, studio).
- `game-queue` empty after my #2945→#2948 pivot. DD's README honest gaps are
  now ALL closed except the DISCLAIMER (open craft by design). Next dry kick
  will look at R-TYPE once QA releases it, or ask "which new flagship?"
  (dry-shelf jonq unlocks ~11-27 per #2795 cap).
- 3 jonq AWAITING, unchanged: #2846 (promote flagships, due 11-23),
  #2908/#2930 (DD seat laws, due 11-24).

## Open questions for Jon (links only, #605)
- #2846 — promote CONTRA / R-TYPE / DOUBLE DRAGON to public? (default keep
  private, due 11-23).
- #2908, #2930 (QA lane) — DD idle-seat / CPU-handback laws (due 11-24).

## Harness notes (carry-overs)
- **Advisory browser flakes on pre-existing DD legs**: #2891 skip-vs-grace
  boundary (mid=29), #2942-era settle-bar, #2889 tag-ink/strut flip PASS/FAIL
  across runs of identical code (load-related). Required gate `static` green
  all day. Per rule 3: rerun once, move on; do NOT fix lane:platform from a
  builder slot while main is green.
- 2-tick white flashes are stepping-over width on loaded boxes (#2942 lesson,
  confirmed again): the goon-whip tip-burn inside #2946 rides a 2-tick window
  in `art.js` and its browser-detect margin is thin — if a future leg hunts
  "tip never paints", widen to the 4-tick whipFlash law (that's what #2946's
  self-test chose for the same reason).
- `CFG` in `DoubleDragon/art.js` is the LOCAL `{punchOn,kickOn}` — the sim
  config is `SIMCFG`. Writing `CFG.whipFlash` there silently NaNs a comparison.
- Aim trigger requires `b.inv <= 0`: test fixtures that make Billy immortal
  (`inv=999999`) also silence the casters. Offset the lane (+11) instead.
- dd browser rigs measure **peak** displacement (`maxx`), not final — carry.
- Vite may re-optimize deps mid-first-load after fresh `npm ci` and drop
  `__ddTest` between checks — retry once before believing a hook-missing error.

## Slots / ops
- Slot b port 5178: dev server STOPPED with `scripts/devstop.sh` at close;
  other lanes' ports untouched.
- Worktrees left: `~/Dev/retrogames-forge-dd-goon-weapons` (name kept, now on
  `forge/dd-duel-retrieve`, merged → re-detached to origin/main; removable).
- Main checkout: detached `origin/main` @ `b1aeaa8`; STATE.md committed this
  session (game merged) and parked via `statepark.mjs park b`.

## Next lane starting here
- Ladder first. Expect dry unless QA ships #2938 (then R-TYPE feedback
  resurfaces — read its qa/* branch before assuming what's left).
- If both ladder and live `idle-kick.mjs` are dry: the shelf is verified dry
  (DD's gaps closed); STOP is legal; the only dry jonq allowed is
  "which new flagship title?" after the #2795 cap unlocks (~11-27).
