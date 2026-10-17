# GAME-SHELL — the plumbing every game shares

Shell code only: the loop, scaling, attract, pause, the pad and the harness
hooks. Game design never lives here — each game's rules and look live in its
own `src/games/<Name>/` and are designed from the original.

## The frame

- One `useEffect` owns one `requestAnimationFrame` loop with a fixed timestep
  (`FIXED_DT = SIM_MS = 1000/60`) and a catch-up cap; the loop owns its clock
  (one driver per loop — see AGENTS.md gotchas).
- The canvas renders at the title's native resolution, CSS-scaled to fit,
  `imageSmoothingEnabled = false` for pixel titles.
- Attract first: any keydown or `pointerdown` starts the game. `'?'`
  (Esc / backquote too) toggles `PauseOverlay` with the registry entry from
  `GAMES.find(g => g.label === '<LABEL>')`.
- `<VirtualControls />` covers phones: it dispatches `Arrow{Left,Right,Up,Down}`
  + `Space` ("A"); pass `secondAction` for "B", `visible={false}` on menus.
- Audio: everything synthesized via `audioController`; nothing plays before
  the first user gesture unlocks the AudioContext (App.jsx).

## DEV test hooks

Each game exposes `window.__<game>Test` (state, hash, step, press/release,
probe, …) inside `if (import.meta.env.DEV)`. `scripts/lib/harness.mjs` waits
for the hook before driving — a production build makes the checks fail loudly.

## The game contract — `window.__game` (issue #377, DEV-only)

`src/utils/gameContract.js` gives every title ONE machine-readable driving API
so QA bots, replays and an RL wrapper drive any game the same way. It sits
BESIDE the `__<game>Test` hooks, never replaces them.

A game wires it by passing primitives to `exposeGame(spec)` (DEV only — prod
builds no-op) and calling `unexposeGame()` in the effect cleanup:

| field | contract |
|---|---|
| `spec.id` | kebab-case game id → `__game.meta.id` |
| `spec.buttons` | pad fields the game reads → `__game.meta.buttons` |
| `spec.reset(seed)` | rebuild the sim from that seed ALONE; all sim randomness derives from it |
| `spec.tick(pad)` | advance the sim exactly one tick with this pad held |
| `spec.state()` | plain JSON, must include `tick`, `score`, `done` |
| `spec.canvas()` | the game canvas element (for `frame()`) |
| `spec.snapshot` / `spec.restore(s)` | optional JSON deep-copy of sim state |

Resulting `window.__game` API:

- `meta` → `{ id, buttons }`
- `reset(seed)` → `state()` — fresh seeded game; puts the shell in play.
- `step(pad, n = 1)` → `state()` — `pad = { up, down, left, right, a, b, start,
  x, y }` (x/y analog, −1..1) held for n ticks. THE FIRST `step` closes the
  loop lock: the real-time loop stops simulating (it keeps drawing) until
  `release()`. While locked the caller owns the clock — that is what makes
  scripted 600-tick runs reproducible next to a running rAF loop.
- `release()` — hands the clock back to the rAF loop.
- `state()` → JSON `{ tick, score, done, ... }` (games add their own hash).
- `frame()` → PNG data URL of the game canvas.
- `snapshot()` / `restore(s)` → optional; present when the game wires them.
  `restore` deep-copies `s` before the game sees it (#381), so a caller may
  stash one snapshot and restore it any number of times.

Determinism law: every random the SIM consumes comes from the seed (rng.js,
mulberry32). `Math.random()` may drive juice only — particles, shake, star
twinkle — nothing that reaches `state()`.

Wired games (rollout #391, `npm run contractcheck`): Lunar Lander, Tempest (pilots)
+ Arkanoid, Galaga, Dig Dug, Missile Battle, Spy Hunter, Paperboy. New games must wire
it too (AGENTS.md, "Adding a game" step 4). Galaga omits `snapshot`/`restore` — its
enemies carry functional Catmull paths that JSON can't copy.
`CONTRACT_ONLY=<id> npm run contractcheck` runs a single game.
