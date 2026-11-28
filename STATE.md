# STATE — forge board snapshot (slot b, 2026-11-28 — BUILDER: lemmings build their own way)

## This session (slot b) — never-dry rung, taken and shipped

**LEMMINGS-LITE gained its second skill: BUILDER (#3863, PR #3867, merged `8dce7d6`)**
The `idle-kick` at 11:15 answered `KICK LEMMINGS-LITE 0 weak`, so the rung was taken.
- **What shipped:** press `6` (or tap the panel's sixth slot) to arm BUILDER; the next
  walker lays a 4-matter plank at a one-tile descent, stays standing, keeps walking.
  Planks are solid: they bridge ledges, give landings, splinter under miners and
  excavators, and climbers refuse them — the original's "the trap is the tool" rule,
  12 per level with free assignment (the #422 economy). SPIRE's spawn lemming now
  defaults to `climb` (slot a's #3865 `defaultSkill`, both lines re-proved together
  after the cross-rebase). Player-side only by design, in the FLOATER precedent's
  shape (#3827): the solver never builds, so every existing script and slack number
  holds exactly — stage 2 (#3866, filed) teaches `candidates()` to build, re-solves,
  and only then releases `b` into `skills_available`.
- **Game-code proof, all on CI:** `lemcheck` 240/240 (17 new BUILDER pins — the
  shelf rule, pond refusal, cargo decrement, wood blocks the digger, splintering,
  the original-trap scenario, and a solver stays exact with B armed); `lemplay`
  52/52 with new real-browser drives (Digit6 + Space lays wood — the pixel was
  first proven `stamp()`-only, then a real panel-tap path was found and driven;
  assigning B is proven to never touch the solver, which picks `climb` instead);
  hand-drift kills: mutate the shelf rule → 3 reds, mutate the cargo decrement →
  3 reds, and two vacuous pins that never assigned B were found and fixed.
- Prod content check: `jalfern.com/retrogames/assets/Lemmings-rb-y5gUi.js` contains
  `BUILDER`/`plank`; `static` green; the advisory suite failed only on the #3864
  timing family and was parked by its owner in slot a (#3869).

## Slot board

| Slot | Lane | Doing | Since | Heartbeat |
|---|---|---|---|---|
| a | games | idle at `origin/main` after shipping #3865 | 2026-11-28 ~11:50 | fresh |
| b | games | idle at `origin/main` after shipping #3863; re-claim before the next run | 2026-11-28 ~12:00 | fresh |
| building-qa | qa | **#3860 DEFENDER** — in place, unowned; if it goes stale a warden sweep re-queues it | — | stale |

Open question issues: **#3791 AWAITING JON** (Minesweeper flag long-press) and
**#3516** (Arcade layout, default = keep the grid with no answer by 11:30 Nov 27).
Neither blocks a claim.

## What is playable right now

- **LEMMINGS-LITE** at https://jalfern.com/retrogames/lemmings — now **with the BUILDER
  skill live**: arm slot `6`, and a walker at a one-tile step puts down a plank and walks
  across it. Watch the digger in LEVEL 1 try the same spot — wood is ground to a walker
  and rock to a drill.
- **DEFENDER** at https://jalfern.com/retrogames/defender — merged #3852; the stage-2
  QA pass (#3860) never ran.
- **ARCADE** at https://jalfern.com/retrogames/ — the menu is now one 17-tile grid
  (merged #3862); the marquee carries the level's default skill when every slot is used
  (merged #3865), and the panel's sixth slot is BUILDER.
- **STAGE Ladder** at https://jalfern.com/retrogames/forge — 17 rows, 5 at **SOLVER**,
  2 at **SCRIPTED**; the two newest titles still sit at 0.

## Next actions by priority

1. **#3860** — `building-qa` DEFENDER, **unowned**. If it goes stale, re-queue it.
2. **#3866** — LEMMINGS-LITE solver-side build search (stage 2): search over
   "build now" at descents, keep `script`/`skills_available` untouched until all four
   levels re-solve, then release `b` and re-prove slack.
3. **LEMMINGS-LITE #3823** SCRIPTED — re-solve since #3858/#3865/#3863 changed the
   skills and defaults; a new digest is legitimate.
4. **DEFENDER #3857** — stage 1 is **done and merged** (#3852); retarget the issue to
   stage 2 or close and re-queue. Then **#3856** stage 3.
5. **ARCADE #3790** — never claimed; **MACGIVER #3786** at 0 is next after #3785.

## Open risks

1. **`building-qa` is still unowned** — #3860 has sat in place all week.
2. **`main-ok` is red and stays red** — every nightly since #3851 has failed, now on
   the #3864 timing family alone; parked to its owner (#3869). No quarantine.
3. **Stale claims look like abandoned work** — #3857 says `building` with the work
   already merged; **and a claim header that names the wrong game (#3856) is the same
   failure mode, and this time the issue was wrong.** A claim should re-state the body.
4. **`statepark` cannot prove its own currency.** With two lanes parked, `current`
   points at whichever lane wrote last (right now: slot b), so reading the board
   through it shows a merged row and a stale one. #1214 still owns it.
5. **Both games at 0 have no sensor or agent files** despite having issues (#3821,
   #3784) — a claim that assumes they exist would fail at step 4 of Adding a game.
