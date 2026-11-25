# STATE — forge board snapshot (slot a, 2026-11-25 — TIDAL RUSH GRABS BACK)

## This session — one ship, landed
- Warden TARGET **#3276** was already CLOSED when I went to claim (slot b
  shipped flips/handstands via #3278 mid-boot) → normal ladder: no steer,
  `next` #1712 waiting-jon, game-queue empty, feedback ladder → #3233 BUT
  live QA sessions (mini+studio) own the board → #841 idle-kick:
  `idle-kick a` answered `KICK TIDAL RUSH 0 weak`.
- Rule 8: the kick's gaps 0/1 are NOT honestly buildable — gap 0 needs the
  shared pad-shape change #3244 item 6 forbids (and #3244 is waiting-jon),
  gap 1 is a phones-on-QR relay run = QA's job. Both now carry **BLOCKED**
  markers in the README so the phantom kick stops; built the OLDEST real gap
  (#3276's own honest tail) as **POLISH #3280** → PR **#3285** merged
  `aeb15d6`; prod marker `landFlip` verified in `TidalRush-CfUHDw6I.js`.
- **GRAB POSES** — `r.grab` hangs off the brake commit bit the wire already
  carries: brake alone takes the rail (flip), brake+gas reaches the bow
  (handstand), released on the water; CPU grabs ride the same bits. Visual
  state only — pads/hash/scores byte-untouched (#3244 item 6 law).
- **LANDINGS READ BY TRICK** — `r.lastLand` records what the air paid: flip =
  corkscrew bursts off both rails + deep thunk; handstand = narrow column +
  expanding ring; flat keeps the wide sheet. Cloth-creak on the grab catch.
- **Two bugs the stage's own legs caught (fixed in #3285):**
  1. rivalPad held gas ≥0.94 in the air → armed-2 was ALWAYS a handstand
     commit under the #3276 law (68 pays, zero flips / six seeds). Flip-arm
     now lifts throttle ≤0.4 — CPU flips are real flips.
  2. brake 10 > THRUST 7.5 → holding the commit across a landing dead-stopped
     the hull at 0 km/h. Under throttle the anchor caps just BELOW the thrust
     line (~11 km/h crawl); coasting brake keeps its full anchor.
- Proof: tidalcheck **165/165** (+10 pins) + **ALL MUTANTS CAUGHT 19/19**
  (new graboff/landkind; wirefeed RE-ARMED — see lessons); tidaldrive GREEN
  end-to-end; contractcheck 857/857; eslint + 3 gates + build green.

## Harness lessons (worth one line each)
- A "by design" sentence inside an honest-gap still SCORES for idle-kick
  unless marked **BLOCKED**/**DISCLAIMER** — same phantom-kick family as the
  stale CLOSED entries; when a lane declines a kick, mark the README.
- A mutant anchor that matches several identical call sites silently weakens:
  `src.replace()` hits the FIRST only — wirefeed had been blind on main since
  #3257/#3265 copied the wire-law text. tidalcheck gained `all: true`
  (global-plant); think about call-site drift when planting anchors.
- Equilibrium algebra: crawl = cap brake slightly BELOW the thrust line
  (v_eq = √(margin/DRAG)); capping "just past" it still dead-stops. Trust
  the pin's number, not the comment's intention.
- Unsteered-hull pins crawl into the boundary clamp and read speed≈0 —
  physics pins steer with `{...autoPad(gs), overrides}`, never raw idle.

## PLAYABLE on main right now
- `/retrogames/tidal-rush` grab poses + trick-specific splashes + crawl law
  + real CPU flips (#3285), flips/handstands (#3278), online rooms/podium/
  rematch/spectate (#3227/#3253/#3265), squall front + storm re-rolls;
  `/retrogames/pinball` driven attract + kits (#3275), KICKBACK (#3255);
  `/retrogames/skyward` living storm cell (#3271), mario-kart TILT (#3260),
  grind-city roof line + gems (#3251/#3270 + #3279 callouts), marble-rush
  tilt + trick-hop (#3243), comet-drift pair (tilt), ssx (tilt), r-type,
  marble-madness, pacman, mario, minesweeper/garden-guard/homebody, TIDY
  BOT, STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter,
  iron keep, galaga, missile, pucks, mines, zork, ultima, king's quest,
  Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` empty (my #3280 claim cleared the derived stage); feedback:
  #3272 skyward `building-qa` (QA live), #3233 grind-city tail 2 `lane:qa`,
  #3244/#2971 `waiting-jon`. Next builder claim = idle-kick derivation LIVE
  at claim time (don't trust memory or this line).
- Merges today incl. #3270 #3271 #3273 #3274 #3275 #3278 #3279 #3285;
  nightly main-ok green at my merge.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev server stopped via `scripts/devstop.sh` (:5173 free). Worktree
  `~/Dev/retrogames-forge-tidal-grabs` removed clean after merge.
- Main checkout detached at origin/main; this STATE.md ships via its own
  docs/state PR — game code merged this session, commit path earned.
- Time-box: ~2h50m of 3 h.
