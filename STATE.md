# STATE — forge board snapshot (slot a, 2026-11-25 — THE MOMENTS)

## This session — one ship, landed
- Warden TARGET **#3300** REFUSED at claim — slot b held it live (checkpoint
  77f1f2a at claim time; it later shipped as #3353). Normal ladder: no
  halt/steer, `next` #1712 waiting-jon (not work), `game-queue` empty, QA
  MASTER live ×1 (no feedback borrow), flagship stage spent → **NEVER-DRY
  `KICK TIDAL RUSH 0 weak`** (weakestStage score 5: open tails #3349/#3348/
  #3342 + unowned gaps). Gap 0 (sky-lags-sea) owned by #3348/#3329 → took
  the next unowned bullet: rider jump/land poses (#3218 tail).
- Filed + claimed **#3351**, shipped **`c7d870f`** (PR #3356): the **MOMENTS**.
  `pop` — at launch, the CREST KICK `(vy−surfVy)/2.5`: how much faster than
  the falling face the hull springs (vy alone is usually NEGATIVE at launch —
  launch means the water dropped faster still; the first vy/4.5 read zeroed
  most honest crests until an every-launch-pops pin caught it). `absorb` —
  the sink captured in the tick `vy` is wiped (the #3280 lastLand reason):
  `clamp(−vy/6)`; 6 m/s drops absorb full, kisses barely bend. Rider: legs
  extend + body springs + head lags on pop; knees take the slap, torso +
  scale compress, head dips on absorb; windows die on the tick (0.4 s/0.36 s).
  Trick poses/grabs/jolt/spray all still read on top. Cosmetic sim state —
  pads/wire/hash/tables/rng untouched, pinned by hand-set-and-rehash.
- Proof: tidalcheck **214/214** (+8 pins: hash purity, absorb saturate/order/
  formula, both windows monotone-while-alive & zero-in-window, EVERY launch
  pops + max≥0.5 seeded bay, absorb happens, stateOf), mutants `popdead`/
  `absorbblind`/`popfrozen` caught (1 red each). tidaldrive GREEN :5173 (win
  P1, zero page errors); runtime probe maxPop=1 maxAbs=1 NaN=0, 46 pops/43
  absorbs per 40 s. contractcheck 857/857; eslint + 3 scoped gates + build.
- Prod verified: served chunk `TidalRush-C7CwjdpQ.js` carries the init, the
  decay lines, the pre-wipe capture. #3351 shipped+closed.
  **QA tail filed: #3357** (pop legibility at chase cam/390px, absorb vs
  head-jolt double-dip, pop-vs-tuck overlap on barrels, storm extremes,
  attract-flip pop).

## Harness lessons (worth one line each)
- A monotone-window pin must stop comparing when the window dies: `0 < 0` is
  false, so strict decrease into the zero steady-state fails a correct law.
- `=== 0` on repeated FP decay hits the remainder trap (~1e-17); this codebase
  already rounds to ~2 decimals on hash/state paths — do the same in pins.
- Launch vy is often negative off a falling face: “pop” = vy − surfVy, the
  speed of departure RELATIVE to the water, not vy absolute.
- GitHub GraphQL flaked all session (502s): REST (`gh api -X POST`) ships
  issues/comments when `gh issue create|comment` dies; an empty-body reply can
  still mean success — verify by listing before retrying (avoided doubles).

## PLAYABLE on main right now
- `/retrogames/tidal-rush` rider MOMENTS (#3356) + FOAM V wake (#3340/#3350)
  + beating squall + rain gameplay + 5 airborne verbs + rooms/spectate/
  rejoin; `/retrogames/skyward` engine voice + wind bed + crash cut + exhaust
  tell + plane runway landings + belt park (#3353/#3327/#3341); pinball
  SOLO bed + REDESIGN truth (#3354) + TABLE SMITH; grind-city rail grabs;
  shaped flapping GALAGA bees (#3355); mario-kart, ice-climber, marble-rush,
  comet-drift pair, ssx, marble-madness, pacman, mario, minesweeper/garden-
  guard/homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON,
  RACCOON HEIST, spy-hunter, iron keep, missile, pucks, mines, zork, ultima,
  king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY at my close; `next` #1712 waiting-jon (not work).
- **Next builder claim: run `idle-kick` LIVE** — do NOT trust this file for
  the pick. Tidal Rush's rider-pose gap is struck; its remaining README gaps
  are BLOCKED (#3280 rule-8 items) or QA-owned.
- Holds: **#3348 building-qa** (QA inside Tidal Rush tail 2). No `building`
  issues open at my close. QA tails: #3359 (pinball garage), #3358 (galaga
  art), #3357 (new, mine), #3349, #3344, #3336, #3331, #3310, #3290, #3244
  (waiting-jon), #2971 (waiting-jon).
- Merges today incl. #3353 (Skyward bed, slot b), #3354/#3355, my #3356;
  main-ok green at claim and merge.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- #3335 — qa: music-bus low-pass approval (lane:qa, AWAITING, default keep level-only).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev :5173 stopped via scripts/devstop.sh; worktree
  `~/Dev/retrogames-forge-tidal-rider-poses` detached clean at origin/main by
  mergeclean after the STATE PR — remove when convenient.
- Game merged this session ⇒ this STATE.md ships via its own docs/state PR;
  parked at /tmp/forge/STATE.a.parked.md via statepark.
- Time-box: ~1 h 5 m of 3 h at ship.
