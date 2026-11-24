# STATE — forge slots

## Slot a — Jon's morning run, Nov 24 (#3105 SKYWARD)

**Shipped (pending deploy):** SKYWARD — flight school on Gullwing Isle, rung 1 of #3105.
PR #3134, squash-merge in progress via `scripts/forge-merge.sh`.
- `src/games/Skyward/` — `world.js` (seeded island, Gerstner table shared CPU↔shader via
  `waterGLSL()`, thermals, storm), `sim.js` (3 craft, 3 events, STUDENT/WINGS/ACE licence,
  max 2999, phase machine incl. `free`/`respawn`), `renderer.js` (three.js: sky, Gerstner
  sea, vertex-coloured terrain, cumuli over thermals, rain-shaft storm, rings, craft,
  beacons, chase-cam), `planner.js` (autopilot graduates seeds 1/7/42/99/123),
  `attract.js`, `index.jsx` (fixed-step loop, HUD, audio, contract + DebugKit hooks).
- `scripts/skywardcheck.mjs` — 30/30 Node checks; `--mutate` kills 6/6 mutants (37/37).
- `scripts/skywardplay.mjs` — browser drive: all green (`?lite=1`, software GL ~20 fps).
- Registry entry private; pad `{layout:'stick', analog:true, supports:['stick','dpad'],
  aLabel:'GO', DROP:KeyB}` — no `full` until the #3118 z-60 audit.
- `skyward` added to `contractGames.mjs` GAMES + analog PATTERNS; checks.mjs `skyward` scope.

**Bugs this run (all fixed on the branch):**
- `vec4[NW](…)` GLSL array constructors — SwiftShader (CI Chrome) rejected the sea
  shader; macOS GL accepted it. Now emitted as per-wave `const vec4 WAVEi` + an
  unrolled `waveSum()` helper (ES 1.00 portable).
- Splash read the sea floor instead of the sea surface (`ter < 0.4` after the ter refactor).
- `createSkywardGL` was missing its `world` arg — the whole app crashed in a browser
  only (Node checks pass because sim/world never touch the renderer).

**Open issue #3105 stays** ("Part of"): storm island, online leaderboard, more rings.

**QA polish pass filed:** #3138 (blob shadows, thermal audio cue, near-miss ring line,
HUD fuel/altitude tape for the belt, degenerate no-flare landing line, phone stick test).

**Questions for Jon:** none open for this lane this run.

## Lane hygiene
- Slot b merged TIDAL RUSH #3104 (#3117 family) while this run was in flight;
  SKYWARD rebased onto it (registry + contract coexist, verified additive-only diff).
- `scripts/devstop.sh` after every run; QA masters on 5174/5176 untouched.
- Post-merge: verify `https://jalfern.com/retrogames/skyward` once Vercel deploys,
  then park slot a.

## Read first
1. AGENTS.md rules (esp. 1–7, 5a).
2. `docs/GAME-SHELL.md` (plumbing only), `docs/ART.md` (the bar), `docs/HARNESS.md`.
3. `src/games/Skyward/README.md` — engine notes, verify commands, honest gaps.
