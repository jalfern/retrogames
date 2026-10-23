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
- Tap-to-start is wired in the shared shell, not per game (`#430`): a registry
  entry may carry `tapStart: true`, and `App.jsx` then synthesizes the start
  key (Space) on any tap outside the on-screen controls (`data-vc`) and UI
  chrome — a tap behaves exactly like a keyboard keydown, so it starts the
  game and restarts it after game over. Declare it only for games that own NO
  touch/click input of their own: a title that already starts on its own
  `touchstart`/`mousedown` (IronKeep, Missile Command) or a pointer-method
  title opts out, or the shell's Space double-fires its actions.
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
| `spec.reset(seed[, players])` | rebuild the sim from that seed ALONE; all sim randomness derives from it. `players` (#494) opens extra seats in multiplayer games; single-player titles ignore it |
| `spec.tick(pad)` | advance the sim exactly one tick with this pad held |
| `spec.state()` | plain JSON, must include `tick`, `score`, `done` |
| `spec.canvas()` | the game canvas element (for `frame()`) |
| `spec.snapshot` / `spec.restore(s)` | optional JSON deep-copy of sim state |

Resulting `window.__game` API:

- `meta` → `{ id, buttons }`
- `reset(seed[, players])` → `state()` — fresh seeded game; puts the shell in
  play. `players` (#494) fills seats 1..players where the game supports them.
- `step(pad, n = 1)` → `state()` — `pad = { up, down, left, right, a, b, start,
  x, y }` (x/y analog, −1..1) held for n ticks. `pad` may also be an ARRAY —
  one pad per player (#494): `step([p1, p2])` steps ONE tick with `p1` in
  seat 1 and `p2` in seat 2; the game's `spec.tick(pad, pads)` gets seat 1's
  normalized pad plus the full per-player array. THE FIRST `step` closes the
  loop lock: the real-time loop stops simulating (it keeps drawing) until
  `release()`. While locked the caller owns the clock — that is what makes
  scripted 600-tick runs reproducible next to a running rAF loop.
- `release()` — hands the clock back to the rAF loop.
- `state()` → JSON `{ tick, score, done, players, ... }` (`players` is the seat
  count the last `reset` opened, #495; games add their own hash and may override
  `players` with their live count).
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

## Recording format — `retrogames-rec/v1` (issue #495)

ONE JSON file for a recorded multiplayer run — replayable exactly, trainable on
(Plaicraft). Pure module: `src/utils/recording.js` (Node + browser).

```json
{
  "format": "retrogames-rec/v1", "build": "c80a6bb",
  "game": "gauntlet", "method": "stick", "seed": 42, "players": 2,
  "ticks": 900, "hashEvery": 30,
  "slots": [
    { "source": { "kind": "human" }, "pads": [ {"right":true,"x":0.886} ], "raw": [ {"x":0.9} ] },
    { "source": { "kind": "cpu" },   "pads": [ {"up":true} ],               "raw": [ {} ] }
  ],
  "hashes": [ { "t": 30, "h": 1234567890 }, { "t": 900, "h": 987654321 } ]
}
```

- **Header** — `build` is the commit that generated the capture: a main commit
  when the sample is regenerated from a detached main tip (`replaycheck` /
  `recmethods` with `--rebuild`), or `unknown` when the capture ran on a commit
  that will not survive its merge (feature branch / CI). The check scripts
  refuse a committed stamp that names a commit no longer in the clone — a dead
  stamp means the sample is stale, regenerate it. `game` the registry id;
  `method` the input method (#420); `seed` the one integer the sim resets from.
- **`slots[]`** — one entry per seat. `source.kind` is the #494 slot kind
  (`human`/`cpu`/`model`+`modelId`/`remote`/`off`) as it stood at capture time.
  `pads` holds THE one pad per tick (#420), compact: false/zero fields are
  omitted, decoding runs the pad through `normalizePad` — whose idempotence makes
  `decode(encode(p)) === normalizePad(p)` exact. `pads.length === ticks` always.
- **`raw[]`** — the device input BEFORE the shared dead zone / quantizer / clamp:
  pre-zone stick `x/y` and aim `ax/ay`, pre-clamp pointer `px/py` (zeros omitted).
  Written by the onePad writers into per-slot holders (`rawPad(n)`, #495). A 0.08
  thumb nudge lives here while the pad idles — the analog nothing else keeps.
  Keys/buttons are already verbatim in `pads`, so they need no raw mirror; the
  physical scancode behind a digital bit is a v2 candidate, deliberately not in
  v1 (#527 item 4).
  A seat driven through the contract has no live device: its raw mirrors the
  analog its stream asked for (pre-clamp x/y, aim, pointer); idle seats stay zeros.
- **`hashes[]`** — the game's `state.hash` every `hashEvery` ticks (default 30)
  plus the final tick. A bad file must name its divergence tick, never silently
  diverge.

Replay: `verifyRecording(rec, driver)` with a contract-shaped driver
(`reset(seed, players)`, `step(pads)` = exactly one tick with one pad per slot,
`state()` carrying `{ tick, hash }`) re-runs seed + streams and compares hashes
at every checkpoint. On `__game` (DEV): `recordStart(hashEvery)` (needs
`state().seed`; seat kinds come from the optional `spec.sources()`),
`recordStop()` → the file object (also `window.__lastRecording`), and
`replay(rec)` → `{ ok, ticks, mismatch }`.

Reference file: `public/replays/gauntlet-2p.json` — a real 900-tick GAUNTLET 2P
run (human seat 1 driven through the device writers, cpu seat 2), replayed
hash-equal through plain model seats by `npm run replaycheck` (`--mutate` drops
one live pad mid-file and must be caught). The determinism law is the same one
#494 states: seed + per-player pad streams ⇒ identical hashes, whatever
produced the pads.
