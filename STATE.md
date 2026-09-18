# STATE — read this first

Rules for this file: **rewrite it, don't append to it. Keep it under 150 lines.**
Old state lives in git history and in `docs/archive/`.

_Last rewritten: 2026-09-18, after the Qwen run was cleaned up._

## Current goal

None assigned. Wait for Jon to set one. (The last run's goal was open-ended, and that
is what went wrong: see `docs/qwen-run-2026-09-postmortem.md`.)

## Raccoon Heist: where it stands

- Live: https://www.jalfern.com/retrogames/raccoon-heist (touch pad auto-enables on phones)
- Code: `src/games/RaccoonHeist/` (engine, world, levels, stealth, art, audio). Its own
  README explains the design.
- Job 1 (the alley) is playable start to finish and has been playtested by Jon.
- Jobs 2 (museum) and 3 (manor) pass the map audit but **have never been played** by a
  human or by the driver.
- Known gaps: guards never speak; the cat has no purpose; lasers are only timing gates;
  no save or score card; the fur is too bright under lamps.

## Gates

Blocking (CI `static` job, deterministic, Node):
`lint:mario`, `lint:fps`, `lint:ai`, `lint:heist`, `aicheck`, `zorkcheck`, `heistcheck`, `build`.

Advisory (run locally, never a reason to stop product work):
`heistplay`, `verify`, `zorkuicheck`, `doscheck`. These run in real Chrome and are
timing-sensitive on slow machines.

## Self-play AI

- Mario: autopilot and neuroevolution modes work (options 3 and 4).
- Zork: the brain maps the world by walking (Node). The in-browser ▶ AI button exists.
- King's Quest: sensors only, no brain.
- Heist: no player AI. `heistplay` is a test driver, not a player.

## Open questions for Jon

- What should the next run's single goal be?
- Should browser playthroughs ever block merges?
