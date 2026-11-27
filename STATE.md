# STATE — forge board snapshot (slot b, 2026-11-27 — MC P2 battery buttons SHIPPED `4dc509c`)

## This session (slot b) — never-dry rung: #3760 seat 2's three buttons
- TARGET #3754 REFUSED at claim (slot a held it live — they shipped `fca8127`
  mid-session). Ladder: steer none; `next` #1712 waiting-jon; game-queue empty;
  feedback all QA-held/waiting-jon + live QA session owns the borrow → NEVER-DRY.
  `idle-kick` → `KICK MISSILE COMMAND 0 weak` (score 3: three unowned gaps).
- Gap triage: gunner-deep-proof = concluded measurement (#3711; tail is
  human-vs-harness provability, not game code); FOA arcs = unsourced
  (Wikipedia §Gameplay has only the three-button law; inventing sector angles
  violates the fidelity law / #3695 BLOCKED precedent); hot-seat P2 battery
  buttons = oldest SHIPABLE gameplay gap → filed POLISH #3760 (why-weakest
  inside), claimed, shipped.
- GAME: Z/X/C name LEFT/CENTER/RIGHT for seat 2 (arcade three-button law,
  Wikipedia §Gameplay). Edge latch `p2Batt` (reset beside `p2Fire`) fires
  through `fireBattery` → dead/empty duds ride free, sim stays seat-agnostic;
  duty guard mirrors P1's 1/2/3-vs-Space guard (off-duty joins, shot swallowed,
  never queued). Any Z/X/C press joins a human into the CPU seat. Batteries
  wear `1/2/3`/`Z/X/C` per seat on duty; join card teaches the triangle;
  registry line updated. Desktop keyboard only (Jon's multiplayer ruling); pad
  untouched; no dice → seeded rollouts byte-stable.
- Proof: missilecmdcheck 170→182 (§p2-batteries sim pins + 8 wiring pins),
  mutants 47→53 all die (6 named), NEW `mcp2battdrive` 16/16 ×2 real Chrome
  (real Z joins + cyan teach pixels, off-duty sleep, origins 40/400/760 own
  magazines, one-seed byte-equal, zero errors). parseGaps MC open gaps 3→0
  (gunner ceiling + FOA arcs BLOCKED with evidence, P2 CLOSED). PR #3765 →
  `4dc509c`, prod bundle `index-BSXjF196.js`. #3760 shipped+closed.

## Red main, found mid-merge (#2176)
- Nightly 46034576636 (`152579a`) failed `full-static`: dvhcheck 5/7 (5 demo
  pages sized `100vh` without the `100dvh` sibling) + nightlybot roster pin
  50/51 (strict `{ id, path }` regex silently dropped `asteroids` — carries
  `syncPixel:` since #3586 — phantom family of #3672). Both reproduced+fixed
  locally; lost the race by minutes: identical fix landed first as #3772
  (`da3457a`), my twin #3775 closed superseded. Main now `da3457a`.
- Nightly dispatched on `da3457a` (run 46050066256, ~2.5 h) — freeze lifts
  when it goes green. **STATE PR #3770 merges the moment it does** (static
  already green): `git worktree add ~/Dev/retrogames-state-b -B docs/state-slot-b origin/docs/state-slot-b && cd && scripts/forge-merge.sh`.
- Filed #3777 (unclaimed, informational): boredomcheck order-sensitive roster
  pin + boredom.json 56/58 drift — not in the nightly gate table, CI-invisible.

## Harness facts paid this session (kept so lanes stop re-paying)
- CDP round-trips (press→evaluate) can close INSIDE one frame gap: pixel
  asserts one-shot after a UI moment see nothing; settle ≥1 frame (~200 ms).
- Under box load the rAF tick chain lags fixed sleeps by up to a second —
  browser drives POLL to the landing condition (ammo/origins), never pace with
  fixed sleeps (actuator half of #3753's break-swallower lesson).
- A pushed-and-clean lane worktree CAN be pruned by worktreepurge at any
  moment (mine vanished mid-session; nothing lost — push first, always).
- README verify-block edits: anchor oldStrings on non-indented substrings —
  hand-counted column alignment misfires the exact match.

## BOARD facts at close
- main `da3457a` (fix included; awaiting green nightly 46050066256). Shipped
  this window: #3760 MC P2 battery buttons (4dc509c), #3754 DK walk-past
  (fca8127), CENTIPEDE authored kill-pop (da3457a's parents), LANTERN RIVER
  far bank, red-main repair #3772. Open PRs: pinball (#3776/#3766), DK popups
  (#3767), orrery QA (#3769), bonsai demo (#3771), STATE (#3770).
  game-queue empty. `next`: #1712 (waiting-jon). halt: 0.
- Rule 4 satisfied: game code merged this window (4dc509c, src/games/**).

## PLAYABLE on main right now
- MISSILE COMMAND hot-seat — seat 2 calls batteries with Z/X/C:
  https://jalfern.com/retrogames/missilecommand
- DONKEY KONG walk-past 50 (#3754), CENTIPEDE authored kill-pop (#3749),
  TIDEPOOL field guide, PITFALL grain, ASTEROIDS bounty popup.

## Open questions (links only — #605)
- #3335, #3516, #3244, #2971, #1712 (all AWAITING; none mine this session).

## Next claims (for whoever is free)
1. Merge #3770 once nightly 46050066256 is green (command above).
2. game-queue empty → never-dry again; re-derive with `idle-kick.mjs` — MC
   scores 0 now, the kick names the true weakest title.
3. Red-main duplicates #3774 (superseded, other lane) may want closing by its owner.

## Slot state at handoff
- Dev server :5178 stopped via scripts/devstop.sh.
- Branches pushed: docs/state-slot-b (#3770). Worktree was purge-pruned after
  its last push — recreate per the command above.
- STATE.md lives in PR #3770 (static green, mergeable at nightly green);
  parked for slot b via statepark.mjs park b.
