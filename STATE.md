# STATE — forge board snapshot (slot a, 2026-11-28 — the autopilot builds its own roads)

## This session (slot a) — claimed, shipped, closed

**LEMMINGS-LITE stage 2: the solver learns BUILDER (#3866, PR #3874, merged `0550747`)**
- **What shipped:** `candidates()` offers BUILDER at exactly the cells `walker()`
  lays wood (one-tile descent + solid shelf) — pond rims and 2-tile holes are
  mirrored out of the search space, pinned at **proposal** level via exported
  `candidates()` (commit-level pins went vacuously green before; don't re-learn
  this lesson). `scoreState` counts standing planks +2/wood; the unspent-supply
  +25 end-bonus still dominates, so scenery burn loses the ledger.
- **THE MASSIF became the proves board:** four-tile trench (row-23 gap over the
  steel floor) at cols 37–40, steel west lip, exit plinth raised to (43,21),
  bomb 1→0 (a bomber could blast the plinth into a staircase and wood would be
  optional). `proves: ['dig','build']`; removing the offer reddens 9 pins.
- **Re-solve ledger:** SPIRE 4/3 → **4/0** (full 12-plank east-face road — the
  tutorial retires every death it used to take); MASSIF 5/1 → **5/0** (4-plank
  trench road); DOOR 6/1, LEDGE 5/3 win unchanged. Slack +1 everywhere.
- **Gates:** lemcheck 249/249 · `--mutate` 270/270 · recmethods PASS 37 (pointer
  rec regenerated, SPIRE script changed) · lemplay 55/55 ×2 · lint mario/fps/ai
  clean · `static` green · prod verified (`Lemmings-dVhwKWBq.js` carries
  `proves:["dig","build"]`, pointer rec sha `8c899eb0…` byte-identical).
- **Learned:** the attract restart wipes the board a beat after the win — road
  pixel sampling lives inside the drive loop (keep-max during the laying window),
  never after replay; a late BUILD self-corrects (position-triggered), so
  determinism tamper probes must shift BLOCK commands, not build ones.

## Slot board

| Slot | Lane | Doing | Since | Heartbeat |
|---|---|---|---|---|
| a | games | idle at `origin/main` (`0550747`) after shipping #3866 — **no open `building` issue, next claim needs Jon/the ladder** | 2026-11-28 ~15:40 | fresh |
| b | games | idle at `origin/main` after shipping #3863 | 2026-11-28 ~12:00 | stale |
| building-qa | qa | **#3860** DEFENDER — still unowned | — | stale |

Open question issues: **#3791 AWAITING JON** (dry-shelf flagship title),
**#3516** (Arkanoid art rung), **#3244/#2971/#1712** (QA/ladder, waiting-jon).
None blocks a claim; none re-filed this session (sweep owns them).

## What is playable right now

- **LEMMINGS-LITE** at https://jalfern.com/retrogames/lemmings — attract shows
  the autopilot's own roads: SPIRE's climber lays a 12-plank road down the east
  face and lands **all four** lemmings; MASSIF's builder bridges the trench with
  4 planks after the digger tunnels the massif. Slot `6` remains the player's
  BUILDER (12-plank cargo, free assign, spends per laying).
- **DEFENDER** at https://jalfern.com/retrogames/defender — merged #3852; QA pass
  #3860 still never ran.
- **ARCADE** at https://jalfern.com/retrogames/ — 17-tile grid, marquee default
  skill, sixth slot BUILDER.

## Next actions by priority

1. **No open `building` issue** (checked 2026-11-28 ~15:40). Ladder candidates
   when a next/claim appears: **#3823** LEMMINGS SCRIPTED re-solve digest (the
   pointer rec legitimately changed again this PR — expect a fresh digest pass);
   **#3857** DEFENDER stage 2 retarget, then **#3856** stage 3; **#3790** ARCADE;
   **MACGIVER #3786** at 0.
2. **#3860** — `building-qa` DEFENDER, still unowned; warden re-queues on staleness.
3. Planner tuning noted in the Lemmings README gaps: DOOR/LEDGE carry optimistic
   BUILDER commits that never lay wood, and DOOR's replay world loses 2 walkers
   to a pre-existing one-tick stamp offset (verified identical on main pre-#3866,
   need 6 holds). Worth an issue if anyone opens the planner again.

## Open risks

1. **`building-qa` is still unowned** — #3860 has sat in place all week.
2. **The stamp offset is real but harmless** — solve/replay death counts can
   differ on DOOR (6/1 vs 6/3, both win). Determinism = replay-vs-replay is bit
   -identical; the product contract (attract delivers the quota) holds. Any new
   pin must compare replay outcomes, not solve outcomes, or it will flake.
3. **Stale claims look like abandoned work** — the #3856 wrong-game header is
   still the standing example; a claim should re-state the body.
4. **`statepark` cannot prove its own currency (#1214)** — with two idle lanes,
   `current` shows whichever slot wrote last.
5. **Games at 0 lack sensor/agent files** (#3821, #3784) — a claim that assumes
   them fails at step 4 of Adding a game.
