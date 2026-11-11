# STATE — session 224 (2026-11-11, slot b)

## What shipped
**SMASH TV: THE WHOLE SHOW IS WIDE** merged as `ac0d247` (PR #2010, Closes
#2007 — NEVER-DRY pick, weakestStage score 6 = 2 QA feedbacks naming SmashTV
(#1978/#1950) + 4 unowned README gaps; TARGET #2004 REFUSED at claim — slot a
alive 19 min). #1973 built the varisize machine but aimed it at two rooms; #2007
aims it at the show: `BIG_ROOMS` 4,7 → 0–7 — rooms 1–8 all board the 24-column
384px board, THE ANNOUNCER's arena stays screen-sized BY LAW ("a boss half
off-screen reads as a bug" — pinned as a gate + mutant). Up/down doors centre on
the room's own width (standard boards byte-identical c8/c7); every board spawns
at its own lower middle (`startColOf`, wide opens at c12). Player-visible:
panning everywhere, mid-arena opening, no invisible bot stalls.

**The pilot floor moved UP and the honest proof moved with it:** solo 9/9 wins —
the #1973 seed-3 forced loss is RETIRED, pin says 9/9 + "update pin AND README
together" for the future. Two doctrine fixes earned it: (1) DIRECTED break —
stalled goal-walks slide until `blockedPx` says the goal vector opens, sweep
growing by stall-streak while it doesn't (fixed 30-tick break ≈ 36px < the
~45px bar-to-bar no-go band on 24-wide boards: seed 6 ping-ponged 59k ticks);
(2) bonus exits — clock dies, EVERY seat walks a door (#508 law → seat 1; wide
ghosting floor had it shooting a bar corner 58k ticks). Gates: smashcheck 551 +
all 18 mutants die (new: whole-show law, boss-exception gate, spawn-centre gate,
2 new mutants; BIG_ROOMS anchor re-anchored); smashplay 24/24 live on :5178;
contractcheck 710/710; lint gates + build green. Prod verified: live chunk
`index-C_lj12xq.js` carries `new Set([0,1,2,3,4,5,6,7])`. 8b filed #2011
(pan readability for the SIX new wide rooms — #1978 predated the wide show).

## The session's catches
- **Detour-streak decay defeated itself.** First stall-fix grew the break by a
  streak that decayed on "progress" — but detour movement IS progress, so the
  streak deflated exactly while the break kept failing (0→1→0 forever, all 9
  seeds stalled worse than before). The trace said k:1 every detour — read it
  before the second guess. Final law: no decay mid-goal; streak resets per room.
- **Harness pixel probes must subtract camX.** #1945's over-the-shoulder gate
  treated world px as canvas px — true only while room 0 fit the screen. Wide
  room 0 broke it (and its "aimed down clean" twin passed VACUOUSLY at 0 chrome
  px before failing at 1 — a vacuous PASS is a dead sensor, not a green one).
  Also: the mirrored seed-0 bar sits at c12 right above the new centre spawn —
  the pose probe sidesteps to c2.
- **Ladder-hops used hardcoded door cells** (`8*16+8`): the centred doors moved
  the up exit to c12 on wide rooms, so smashplay's camera test never climbed.
  Derive from `roomData.gw` — the sim already exports what tests need.

## Ladder trail
- halt none; steer none. TARGET #2004 REFUSED at claim (slot a, 19 min — did not
  fight it). `next` #1711 stays released (Jon-side R2 hardware, eighth confirm).
  game-queue empty; QA MASTER live (pid 34843) → feedback borrow refused;
  flagship stage spent (all SSX/Emberwood/COMET DRIFT HD/Myst gaps CLOSED —
  verified via parseGaps, not memory) → NEVER-DRY weakestStage #2007. No jonq
  filed (all pattern-following).
- `weakestStage`'s first answer was PPM "two regulars in one day" — but #1891
  moved to building-qa mid-ladder and heldDirs (which needs label STRINGS, not
  gh's label objects) skipped it correctly on the rerun. PPM gap stays unbuilt:
  QA owns it now.

## Open questions
- none (see waiting-jon issues; #1711 hardware waits on Jon).

## Next
- Slot a: #2004 (LODE guard-air). Its BUILD FLOOR comments own LodeRunner; do
  not touch that title from slot b.
- SmashTV's #2011 is QA's (six new wide rooms). For slot b's next NEVER-DRY
  stage, weakestStage will move on — re-derive honestly at claim time.
- PPM's "two regulars in one day" gap: filed-by-nobody, owned by #1891's pass —
  only take it if QA drops it.
- Dev servers: slot a 5173, slot b 5178 (this session's server stopped at exit).
  `--mutate` only in an exclusive window ≥20 min; re-grep mutant anchors after
  touching any branch a mutant mutates (this session: BIG_ROOMS re-anchored).
