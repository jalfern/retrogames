# FOUR HALLS — first-person

The first-person dungeon crawl this arcade shipped first (as GAUNTLET, #237).
Atari's 1985 cabinet is top-down, so issue #276 renamed this one: FOUR HALLS
keeps every rule, maze and the autopilot, and the GAUNTLET name now belongs to
the overhead build at `/gauntlet`. Route `/four-halls`.

## What is where

The engine is shared with GAUNTLET and lives in `../Gauntlet/`
(`sim.js`, `levels.js`, `planner.js`, `art.js`, `sound.js` — all
camera-agnostic). This directory holds only the first-person shell:
`index.jsx` — DDA raycaster (224×200 view + 96px side panel + narrator
strip), hero select, attract replaying `plan(2)`'s deathless first-person run.

## Fixes shipped with the rename (issue #276 item 1)

- `KEYS` and `LVL` no longer print on top of each other in the narrator strip
  (spread apart, no overlap at any key count).
- The level name is centered over the full strip instead of running off the
  right edge of the panel ("LEVEL 1 · THE FIRE WOR…" no longer clips).
- The side panel's GOLD/KEYS lines sit inside the panel again (they were
  bleeding into the narrator strip below it).
- The hero-select screen paints an opaque backdrop, so the attract HUD no
  longer ghosts through the hero cards.
- The health drain is the arcade's ~1 hp/s (was ~2.5 hp/s — too fast to
  learn the game). This is a shared-engine change; GAUNTLET shares it.

## Controls

Arrow Left/Right: turn · Up/Down: walk along the facing · Space / A: sword ·
X / F / B: arrow or spell · C on the hero screen: CPU partner · ?: pause.

## Verify

Covered by the shared harness: `npm run gauntletcheck` (and `-- --mutate`).
