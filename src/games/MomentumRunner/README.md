# MOMENTUM RUNNER

A Sonic-like momentum runner: gravity is the engine. Pure sim in `sim.js`,
rendered 2x (960×540, `ctx.scale(2,2)`) in `index.jsx` for the neon look.

## Architecture
- `sim.js` — the pure, tick-deterministic world (no DOM, no RNG, no clock).
  Angle-based physics: scalar speed along the ground tangent, gravity projected
  onto it; the loop is a real circle integrated by energy (`v² ≥ G·r·cosφ` or
  you peel off). `planRun()` is the autopilot that proves every zone winnable.
- `index.jsx` — the renderer + shell. Its ONLY spatial contract is
  `screen = world - cam` with no vertical flip; the hero is painted at exactly
  the pixel the physics reports, which `runnerplay` samples to prove.

## Sound
All synthesized at runtime (no assets) through the shared chiptune engine
(`src/utils/AudioController.js`):
- **One original bed per sector** — `MUSIC.runnerCity` (A-minor synthwave
  sprint, 0.105s steps), `runnerForge` (D-Phrygian industrial drive),
  `runnerOrbit` (slow F-lydian float). The tempo is the map: fast→heavy→sparse
  across the three zones.
- **Bed lifecycle** (in the frame loop): plays only during a live run — attract
  has no gesture yet so it stays silent (autoplay policy). It switches track on
  zone change, stops on pause and on goal (`playFanfare`), and restarts on
  respawn after a death (`playDeath` drops the bed first).
- **Speed whoosh** — one looping band-passed noise source whose gain and
  centre frequency track velocity past `RUN_TOP` (0 below the cap, full at
  `VMAX`); it is the engine note that tells you the slope is doing your work.
  Built lazily after the first gesture, muted-aware, stopped on unmount.
- One-shot cues (ring, spring, loop, hit, save, goal…) in `handleEvents`.

## Gates
- `npm run runnercheck` — pure Node: every rule pinned + mutants + the autopilot
  wins all three zones incl. the loop. The sim must not change under a look pass.
- `npm run runnerplay` — real Chrome, real keys: input path, paint-follows-
  physics at the exact reported pixel, variable jump, pit death→totem, and the
  sector bed actually playing (music-engine state via the probe).
