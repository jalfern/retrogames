# STATE — 2026-10-15 (forge session, SMASH TV shipped)

## Shipped this session
**SMASH TV** (#239) — PR #279, squash-merged at `2255733`, live at
https://jalfern.com/retrogames/smash-tv (prod bundle verified).
Williams 1990 twin-stick arena, top-down: Arrows move / IJKL fires its own
8-way stick / Space fires facing / B firebombs (34 POWER). Nine rooms,
**one-hit lethality** (the cabinet rule, harness-pinned), exits sealed until
the room dies, weapon crates (SPREAD/LASER/MACHINE GUN) + POWER economy,
two Blood-Bonus rooms (combo +50/kill), THE ANNOUNCER as room-9 boss.
Attract replays the autopilot's proven run (seed 0). All art/audio synthesized.

Gates: `lint:smash` + `smashcheck` (186 checks) + `--mutate` (5/5 die) wired
into CI `static`. Pilot wins **all 9 seeds**, 2 deathless; slack re-win
(one fewer crate/room, zero energy cells). Advisory `smashplay` 13/13 in
headless Chrome (start→twin-stick→die→restart, zero page errors).
QA polish filed as **#280**.

## GOAL — next session
Claim the oldest `game-queue` issue — **#241 Out Run** — unless Jon labels
**#276** (`next`). #276 is Jon's own directive answering the Gauntlet
fidelity ruling: build GAUNTLET top-down and rename the first-person one to
FOUR HALLS. It outranks #241 in Jon's intent but carries no `next` label —
see question 1. Before starting, read `#280` — if unclaimed and no QA lane
is live, a quick polish PR on SMASH TV is also valid work.

## Board
- Open QA: **#280** (SmashTV), #275 (Gauntlet), #270 (SimCity), #269/#220
  (Kart), #265 (Marble), #263/#258 (Bubble Bobble).
- Queue: **#276 (Gauntlet top-down + FOUR HALLS rename)**, #241 Out Run,
  #245 Lunar Lander, #246 Tempest.
- Other lanes: check `gh pr list` before touching arcade/QA areas.

## Housekeeping done
Worktree `retrogames-forge-smashtv` (branch merged+deleted) removed this
session. Main checkout parked detached at `origin/main`. Accumulated stale
worktrees worth pruning when idle: forge-arkanoid, forge-bobubble,
forge-gauntlet, qa-mkart, qa-qbert, qa-jaoust-adjacent ones — verify each is
merged before removing.

## How Smash TV is built (pointer, not a tutorial)
`src/games/SmashTV/`: `levels.js` (seeded room generator: 4 wall patterns,
exit ring, crate ladder, rosters), `sim.js` (pure `step`, seeded LCG, q8
8-way, `blockedPx` asked by every walker; rules pinned by harness header
comment), `planner.js` (engage-nearest + bullet-dodge + jink-under-boss;
boss kill needs tight lane-tracking under the ANNOUNCER), `art.js`,
`index.jsx` (256x248 canvas, HUD strip, announce barks). README has the
fidelity notes + honest gaps.

## Three questions for Jon
1. **#276**: you asked for a top-down GAUNTLET + FOUR HALLS rename a day
   after Gauntlet shipped. Should the next forge lane build #276 first (I'd
   label it `next` when you're ready), before Out Run #241?
2. **Attract demo style:** Smash TV's demo replays seed 0 which takes 2 hits
   before winning; Gauntlet's was deathless; Marble showed hits for drama.
   House rule: showcase deathless, or drama allowed?
3. Still open from last session: **Gauntlet L4 generator cap** (keep 5-alive
   cap for a provable win, or raise it) and **CPU partner default ON** for
   phones (#275 items 6–8 assume ON) — ruling needed before the Gauntlet
   QA lane executes those items.
