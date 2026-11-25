# STATE — forge board snapshot (slot a, 2026-11-25 — THE BELT PARKS)

## This session — one ship, landed
- Warden TARGET **#3319** (SKYWARD plane landing) REFUSED at my first claim —
  slot b held it live and shipped it mid-my-session (PR #3327, 13:51). Normal
  ladder: no halt, no steer, `next` #1712 waiting-jon, `game-queue` empty,
  QA MASTER live ×2 (no feedback borrow), flagship stage spent → **NEVER-DRY
  `KICK SKYWARD 0 weak`** (score 9: open tails #3300/#3310 + unowned gap).
  Gap 0's actionable half after #3319: **the belt couldn't land.**
- Filed + claimed **#3332**, shipped **`a2fd5f3`** (PR #3341): the **PARK
  LAW**. `beltTouch` (pure, sim.js): on-strip, sink < 2 m/s, cross < 4 m/s,
  not climbing → zone score by the #3302 table (150→700), crab law scuffs 60.
  A scored arrival PARKS — locked on the deck against wind/gusts, rain still
  heard, throttle alone lets go (`liftoff`); a second arrival pays again,
  best kept. Banked best = ✺ **HOVER** chip + completion-card line (answers
  the plane's ✈ WHEELS); licence math core-three, hash inputs unchanged.
  Crash (`vy<−5.2`/`speed>10`) and silent settle (firm/off-strip/mid-event)
  byte-identical. Hints teach quiet-over-firm; `padfinal` F1 cheat.
- Proof: skywardcheck **178/178** (+16 pins: zones/bands/scuff, park lock,
  liftoff-and-re-land, firm-vs-crash precedence, once-per-crossing arming,
  5-seed autopilot honesty, determinism, stateOf) + mutants **43/43** (+7);
  skywardplay **PASSED** live (`RUNWAY LONG +450 — PARKED`, OFF THE PAD, ✺
  kept, zero console errors); contractcheck 857/857; eslint + 3 scoped gates
  + build green. Prod verified: served `Skyward-7fjj9nHI.js` carries the law.
- QA tail filed: **#3344** (banner width at 390, touch phrasing A/SPACE,
  parked mesh read, hop-spam banner noise, ✺ glyph, attract taste).

## Harness lessons (worth one line each)
- **Judge arrival laws at the crossing tick**: the belt's plain settle zeroes
  `vy`, which sneaked a park one tick after every firm arrival — `g._air`
  arms the catch once per deck crossing and re-arms on *leaving* (airborne
  or climbing > 0.05 m/s; gravity-only deck jitter never re-arms).
- **A mutant must move what a pin can see**: zeroing a parked hull's `vel`
  is decoration (the lock is structural) — the chock mutant only died once
  it advected the hull downwind.
- **Live-teleport heights are band arithmetic**: deck+1.0 m free-falls to
  −2.04 m/s at the crossing line (deck+0.8) — one hair outside a 2.0 band.
  Place drive legs INSIDE the catch window, like the plane leg does.
- `crashes` is the session counter — a live leg must not assert `crashes==0`
  after earlier legs; fresh-game Node pins own the crash-free claim.
- jalfern.com 308s `/retrogames/` — prod asset probes need `curl -L` (slot b
  learned it this afternoon; I re-learned it tonight).

## PLAYABLE on main right now
- `/retrogames/skyward` belt PARK law (#3341) + plane wheels-down (#3327) +
  second strip + engine bed + living storm; `/retrogames/tidal-rush` FOAM V
  wake (#3340) + beating squall (#3328) + rooms; `/retrogames/pinball` SOLO
  bed (+ tail items 1–2 #3334) + TABLE SMITH + tilt-nudge + tidal rooms;
  `/retrogames/grind-city` rail grabs + coping stalls + manuals chip;
  mario-kart (tilt), ice-climber, marble-rush (tilt, trick hop), comet-drift
  pair (tilt), ssx (tilt), marble-madness, pacman, mario,
  minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS,
  DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, galaga, missile,
  pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY; `next` #1712 waiting-jon (not a work item).
- **Next builder claim: run idle-kick LIVE.** It currently answers `KICK
  SKYWARD 0 weak`, but SKYWARD gap 0 is now the bullet's ONLINE half ("no
  online") — a big build (TidalRush #3220 shows one rooms PR CAN fit); the
  next lane should decide honestly between a first hosted-rooms stage and the
  next scoring title. Skyward is UNheld (its QA tails #3300/#3310/#3344 are
  `feedback`, not building-qa).
- Holds: building-qa #3329 (TidalRush, item 1 shipped via #3346), #3325
  (GrindCity). Open QA tails: pinball #3290 (items 5–7) + #3313 (3–4 left
  after #3334), tidal #3342 (FOAM V), #3344 (belt park), skyward #3300/#3310.
- Merges today incl. #3306–#3350 pair-lanes; main-ok green at claim and at
  merge; Production contains the belt (chunk Skyward-7fjj9nHI.js).

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev :5173 stopped via scripts/devstop.sh at session end; worktree
  `~/Dev/retrogames-forge-skyward-belt` detached clean at origin/main by
  mergeclean — remove when convenient.
- Game merged this session ⇒ this STATE.md ships via its own docs/state PR;
  parked at /tmp/forge/STATE.a.parked.md via statepark (slot b's 13:28 park
  and its 15:0x handoff #3343 were consumed — facts folded above).
- Time-box: ~1 h 55 m of 3 h.
