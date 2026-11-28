# STATE — forge board snapshot (slot b, 2026-11-28 — autopilot and player share one clock)

## This session (slot b) — claimed, shipped, closed

**LEMMINGS-LITE replay phase (#3892, PR #3896, merged `c4ca306`)** —
never-dry rung: `idle-kick` answered `KICK LEMMINGS-LITE 1 weak` (score 3 =
#3879 feedback + 2 unowned gaps; index 1 = the stamp offset).
- **What shipped:** `replay()` fetched `byTick.get(g.tick + 1)` — every script
  command fired one tick BEFORE the phase `solve()` verified (stamp T applies
  between the steps; the step advancing to T+1 moves the body — the phase a
  human keypress has too). The attract loop, WATCH and the lemcheck mirror
  carried the same `+1` on screen. All four now apply at `g.tick === T`:
  THE DOOR replays **6/1, identical to its proof** (was 6/3 — two phantom
  drownings gone); SPIRE 4/0, MASSIF 5/0, LEDGE 5/3 unchanged; replay-vs-
  replay stays bit-identical. Side effect handled honestly: the honest world
  holds its crowds, so the desync-manufactured falls that fed #3853's mid-air
  canopy vanished — demo floats are now CERTIFIED (`certifyDemoFloat`: grant
  accepted only when replay keeps win/exited/dead identical). Today SPIRE
  deploys TWO parachutes mid-descent and DOOR catches its post-bomb drop
  mid-air — more deploy than the desync-era demo ever showed; MASSIF/LEDGE
  carry proof-neutral walker stripes.
- **Gates:** lemcheck 282 → **314** (REPLAY PHASE section: per-board
  replay==solve, DOOR direct probe silent-at-stamp/live-at-stamp+1, shell
  source audit; parachute drive rewritten; #3876 plant-probe re-phased to
  plantT+1). Hand mutation: restore `+ 1` → 5 pins red, restore → green.
  lemplay 66/66 ×2 (one advisory 64/66 under concurrent load, unnamed pins,
  green on rerun — rule 3). recmethods PASS 37, goldentracecheck 89/89,
  lint mario/fps/ai + eslint + build green. Prod: `Lemmings-Cq3bQvxi.js`
  verified (zero `tick+1` applies, `air` grants present).

## Slot board

| Slot | Lane | Doing | Since | Heartbeat |
|---|---|---|---|---|
| a | games | **#3879** Lemmings LOOK & animation slice (claimed via warden TARGET; design comment posted) | 2026-11-28 ~17:00 | fresh |
| b | games | idle at `origin/main` (`ac3ad22`) after shipping #3892 | 2026-11-28 ~18:20 | fresh |
| building-qa | qa | **#3888** SIMCITY-MIN idle-water-motion; QA-mini live this session | — | fresh |

Open question issues: **#3791 AWAITING JON** (dry-shelf flagship title),
**#3516** (Arkanoid texture rung — deadline passed today, sweep takes its
`done` default). Neither blocks a claim.

## What is playable right now

- **LEMMINGS-LITE** at https://jalfern.com/retrogames/lemmings — THE DOOR's
  attract demo loses 6/1, exactly what the oracle proves, and SPIRE's two
  parachutes now visibly deploy mid-descent. Attract, WATCH and human input
  obey one stamp law.
- **ARCADE** at https://jalfern.com/retrogames/ — marble-madness and
  ten-deep art landed mid-session (#3897/#3894, other lanes).

## Next actions by priority

1. `idle-kick` now answers **NONE** (Lemmings held by slot a's #3879; the
   rest of the shelf is owned) — STOP is legal for a fresh lane; never-dry
   only re-arms if #3879 closes while gaps stay unowned.
2. **Lemmings float-while-digging** is the game's one big unowned gap left
   (needs a vertical-dig mode or a dig-model rethink). If a future kick names
   it, budget it as an engine task, not a one-liner stage.
3. **DEFENDER stage 2** — still no open builder issue; verify numbers live
   (#3860's history) before filing a fresh one.
4. **#3889** SIMCITY-MIN stroke-language — unowned QA feedback (QA lane's).

## Open risks

1. **Issue-number drift in STATE handoffs** — re-check numbers before
   writing; this session's refs (#3879/#3888/#3892/#3896, ac3ad22/c4ca306)
   were verified live.
2. **`statepark` cannot prove its own currency (#1214)** — unchanged.
3. **Games at 0 lack sensor/agent files (#3821, #3784)** — a claim that
   assumes them fails at step 4 of Adding a game.
4. **lemplay double-fail under concurrent load** (unnamed, rerun-green) — if
   it recurs, name the pins before it hides a real phase regression.
5. ~~Stamp offset~~ CLOSED by #3892: pins may compare solve outcomes again —
   replay runs the oracle's world (README carries the law).
