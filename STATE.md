# STATE — forge board snapshot (slot a, 2026-11-26 — PINBALL HOLDS ITS PACK)

## This session — one ship, landed
- Ladder at claim: TARGET #3407 (feedback-no-vanish) REFUSED — held by slot b
  (live claim 3 min old, their design comment already posted). No steer; `next`
  #1712 is waiting-jon; game-queue empty; every feedback item building-qa or
  waiting-jon ⇒ flagship stage → `idle-kick.mjs` answered `KICK PINBALL 0 weak`
  (score 3, unowned README gaps; gap 0 awaits Jon's open #3335 so the stage
  took gap 1 verbatim). Filed **POLISH #3422**, claimed, shipped in
  **PR #3425 (merge 55b32f1)**; prod verified (`Pinball-pKptsc_j.js` carries
  `magHoldT`, absent before).
- **The pack magnet (sim)**: coil stays energised through a hold episode — every
  ball hitting the post face while one is pinned pins too, each on its own
  `hold`-tick clock, each snapping with its own payout. `gs.magHold` is now
  derived (max live holdT) so art/hum/stateOf/hash read one truth; single-ball
  flow bit-identical (all 279 pre-existing pins green untouched). Spent marker
  `magHoldT −1`: a snapped ball never rides the same drive twice; a drain that
  re-arms the coil re-arms its balls (proof pin watches the mid-field re-catch).
- **Ball search per-ball**: stall exemption is `p.magHeld`, not game-wide.
- **Orbit half of the gap was stale** — arm/curl/done flags were already
  per-puck; now PINNED so it can't regress (two balls: arms×2, scores×2, bank×2).

## Proof
- pinballcheck **288/288** + **19/19 mutants die** — 5 new (packmagnet,
  magspent, magclock, magstall, magrearm). eslint + lint:mario/fps/ai + build green.
- pinballplay 63–64/64 over three runs: a *different* timing leg flaked each
  run, all legs passed at least once, zero page errors — pre-existing Mac-only
  browser flake (not in CI; single-ball flow bit-identical).

## Harness lessons (one line each)
- A mutant that survives the first run was often MY pin, not the sim: rule-8
  applies to toothless pins too — state a line of what the last run ruled out.
  Two of my pins were vacuously true (measured a post-hold window / a
  re-dealt table); teeth = sample inside the hot window, watch a named survivor.
- The strongest re-arm proof isn't a flag read, it's behavior: the spent
  survivor getting re-caught mid-field requires coil AND ball re-armed at once.
- mutateguard refused a mutant run on a dirty tree — checkpoint-commit first,
  always, before any `--mutate` (its #2047 law, it earned its keep again).

## PLAYABLE on main right now
- `/retrogames/pinball` — + pack magnet (multiball holds every ball it can
  catch, per-ball snaps), per-ball ball search, orbit per-ball law pinned;
  everything prior (two cabinets, TABLE SMITH + garage, kits, kickback,
  orbit set, DMD, solo bed mid-voice, tilt lean).
- skyward (post-#3410/#3408), grind-city thinking bot, tidal-rush notch tail,
  pinball SOLO bed + smith, ssx, comet-drift pair, marble pair, galaga bee,
  mario-kart, ice-climber, pacman, mario, minesweeper/garden-guard/homebody,
  TIDY BOT, STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST,
  spy-hunter, iron keep, missile, pucks, mines, zork, ultima, king's quest,
  Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` empty at close; `building` empty (mine merged) — slot b is
  mid-#3407 (feedback outbox/draft; their PR will land over my sim.js lines?
  no overlap: they touch feedback utils, not Pinball).
- `building-qa`: #3411 (SKYWARD black polygon), #3419 (idle-detect vs mutant
  sweeps — my session was never on that list; warden kicked slot a once at
  23:49Z while I was pre-claim, harmless).
- Pinball's remaining honest gaps after #3425: curl-rail shaping + same-line
  chain pin (in README); no left ramp/spinner side; third original cabinet.

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, qa lane).
- #3054 — native TestFlight ports have no recorder/upload (AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev :5173 stopped via scripts/devstop.sh; worktree
  `retrogames-forge-pinball-pack` pruned clean after merge; main checkout
  detached at origin/main (55b32f1 at write time).
- Game merged this session ⇒ STATE ships via its own docs/state PR; parked at
  /tmp/forge/STATE.a.parked.md via statepark.
- Time-box: shipped well inside 3 h (target #3407 loss cost ~15 min of ladder
  derivation — cheaper than any idle spin).
