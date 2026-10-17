# AGENTS.md — RetroGames Arcade

Guidance for working in this repo (and, by extension, shipping to jalfern.com).
The arcade (React + Vite) is one half of the site: `jalfern.com/retrogames/...` proxies
here via `jalfern/vercel.json` — keep Vite `base` and router `basename` both at `/retrogames`.

## Rules for unattended runs (read first)

**The game is the product; the harness serves it.** Spend most of every session on the
game itself: faithful mechanics, art, sound, feel (`docs/ART.md` is the bar). The harness
lessons below keep games from shipping broken; they are not the goal.

1. Read `STATE.md` first. At the end of a session, **rewrite** it (don't append), under 150 lines.
2. Work on the one goal in `STATE.md`. If there is none, ask; don't invent one.
3. Only the CI `static` job blocks merges. Browser suites (`heistplay`, `verify`, …) are
   advisory: never spend more than one PR fixing a harness timing problem.
4. If 3 PRs in a row don't change game code (`src/games/**`), stop and report to Jon.
5. Never merge a PR whose own description says it is red or WIP. From the PR's branch, merge
   **only** with this command, never any other way:
   `gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch`
6. Don't grow the harness past the code it tests. Prefer a new small check to a longer script.
7. Every ~4 hours, stop with: what's playable now, what changed, three questions for Jon.

History: `docs/qwen-run-2026-09-postmortem.md` explains why these rules exist.

### Jon's decisions (2026-10-11, answers to STATE questions)

- **Worktrees only.** Every lane (forge, QA) works in its own `git worktree`. The main
  checkout `~/Dev/retrogames` stays on a detached HEAD at `origin/main`
  (`git fetch && git checkout --detach origin/main`); nobody edits or checks out `main` in it.
  That keeps `main` free, so the rule-5 merge command works. Don't use the API merge form.
- **Shell template = plumbing only.** `docs/GAME-SHELL.md` may hold the loop, scaling, attract,
  pause, VirtualControls and harness wiring. Never game design.
- **Fidelity beats provability.** A classic game's rules are the spec. If a rule is hard to
  prove, prove it anyway; don't change the rule (LODE RUNNER shipped permanent holes and a jump).
- **Multiplayer titles:** a CPU opponent is the default (works on phones, gives the harness an
  autopilot). Two players is a desktop keyboard option. No second on-screen touchpad.

## Stack
React 19 + Vite 7 + React Router 7 + Tailwind CSS 4. `js-dos` + `ifvms` for DOS/IF titles
(Ultima, King's Quest, Zork…). All game audio is synthesized at runtime via
`src/utils/AudioController.js` (`audioController.playTone / playSweep / playNoise`) — no assets.

## Commands
```bash
npm run dev / build / preview          # dev server at localhost:5173/retrogames/
npm run lint:mario / lint:fps / lint:ai   # the three scoped lint gates (repo-wide lint is ~740
npm run aicheck / zorkcheck          #   pre-existing DOS/IF errors on purpose — not a gate)
npm run verify [-- --full]           # browser suite (needs `npm run dev`; advisory)
npm run shot -- --out x.png --eval "..."  # visual capture via system Chrome
gh pr checks --watch                 # the merge gate = CI `static`; `verify` job is manual:
                                     #   gh workflow run ci.yml --ref <branch>
```
Per-game `*check` / `*play` aliases: `package.json` + each game's README.

## How the app is structured
- `src/App.jsx` generates every route by mapping `src/config/games.js` — **the registry**,
  single source of truth for what exists.
- `src/games/<Name>/index.jsx` — one self-contained component per game (bigger engines may
  grow sibling modules — see `IronKeep/{index,art,levels}.js`).
- `src/components/` — shared UI (`GamesList`, `PauseOverlay`, `VirtualControls`, …).
- `public/games/` + `public/js-dos/` — committed emulator + game bundles (see Gotchas).
- `src/ai/` + `src/games/<Game>/{sensors,agent}/` — the sensor/brain spine: **docs/AI.md**.
- `src/utils/{dosKeys,dosCanvas,jsdos}.js` — the only DOS keyboard/pixel/loader paths.

## Adding a game
1. Create `src/games/<Name>/index.jsx` (default export); register in `src/config/games.js`
   with `{ path, component, label, theme, description, controls }` — route + Arcade Menu follow.
2. Reuse the plumbing, never the look. Shared: one `useEffect` loop with a fixed timestep
   (`FIXED_DT = 1000/60`), scaling to fit, attract first (any key or tap starts), `'?'`
   toggles `PauseOverlay` (entry via `GAMES.find(g => g.label === '<LABEL>')`), the pad,
   DEV test hooks. Never copy another game's art, HUD, palette, fonts or drawing code:
   design the look from the original. Pixel titles draw at the original's resolution with
   `imageSmoothingEnabled = false`; 3D and vector titles render at screen resolution.
3. Render `<VirtualControls />` for mobile — it dispatches `Arrow{Left,Right,Up,Down}` +
   `Space` (the "A" button); pass `secondAction={{ label, code }}` for "B",
   `visible={false}` on menus/death. Handle those `e.code` values.
4. Call `exposeGame({ id, buttons, reset, tick, state, canvas })` + `unexposeGame()` in cleanup
   (DEV-only, spec in `docs/GAME-SHELL.md`) so QA bots/replays/RL drive it; add it to
   `contractcheck`'s `GAMES`. `snapshot`/`restore` are optional — omit them if the sim's state
   holds functions that JSON can't copy (#391).
5. Engine notes go in the game's own `README.md` — **never in AGENTS.md** (law, not a log).

## Git & merge
Feature branch → PR → squash-merge to `main`; never push to `main`. From the PR's branch,
merge **only** with the rule-5 command above. Only `static` blocks merges.
**Never stack a PR on an unmerged branch** — squash-merge deletes the base, GitHub closes
the child and refuses to reopen it. Recovery: `git rebase --onto origin/main <old-base-tip>
<branch>`, `git push --force-with-lease`, re-file `--base main`. Pass `--body-file` to
`gh pr create|comment` (the shell eats backticks). Pushing `.github/workflows/*` needs the
`workflow` scope: `gh auth refresh -s workflow`. `gh` is authenticated as `jalfern`; if a
push prompts for credentials, run `gh auth setup-git` once.

## Deployment
Vercel Git integration: merge to `main` deploys production automatically; branches/PRs get
previews. Build `npm run build` → `dist/`; `vercel.json` carries the SPA rewrites + wasm header.
After merging, `gh pr checks --watch` for Vercel, then open `https://jalfern.com/retrogames/<game>`.

## Gotchas that still bite (each once)
- **js-dos is injected, never in `index.html`.** `src/utils/jsdos.js` loads
  `/retrogames/js-dos/js-dos.js` on demand: Vite prepends base to absolute script srcs, so a
  hard tag requests `/retrogames/retrogames/...`, the SPA fallback answers HTML@200, and
  dev silently breaks while prod works. Re-adding a script tag breaks dev.
- **js-dos draws WebGL without `preserveDrawingBuffer`** — `drawImage`/`getImageData`/
  `toDataURL` all return solid black. `jsdos.js` forces the flag before the emulator asks, or
  the entire pixel/OCR sensor arm senses nothing.
- **js-dos 8 binds keys on `window`**, not the canvas, and drops them while blurred.
  `dosKeys.installDosKeys()` patches `addEventListener` before the emulator loads;
  `focusEmulator()` focuses before injecting.
- **An unmoving frame is not a broken actuator.** King's Quest sits on the AGI copy-protection
  box ("Weiter mit ESC") where arrows do nothing *by design* — `doscheck` presses ESC first.
- **Anything that moves must ask `blocked()`**, and buried-depth is **signed**: guards once
  walked through lampposts because only the chase branch asked, and `near()` once blamed a
  raccoon's own forearm (rig meshes now carry `userData.rig`). See
  `docs/archive/qwen-run-2026-09/FEEDBACK.md`.
- **One driver per loop.** A component `while (running) await tick()` *plus* a loop timer
  races two chains over one pending prompt (the Zork double-driver): the loop owns its clock;
  components watch via `onStatus`.
- **A fixed timestep has a frame-rate floor.** The catch-up cap is real-time down to ~4 fps;
  a smaller cap runs the world at half speed on slow boxes. Harness waits/budgets are WORLD
  seconds (`__simSleep` / `__gameTime`), never `setTimeout`. CI Chrome is software-rendered:
  use `?lite=1` at 640x426; `harness.mjs` disables background throttling. Diagnose with
  `npm run heistclock -- --throttle 1,8,32,64`.
- **ifvms postinstall patch:** `patches/fix-ifvms.cjs` (via `npm install`) fixes a CJS→ESM
  `this` bug in `ifvms` zvm opcodes. Bypass `npm install` and Zork breaks.
- **WASM needs its MIME** (`application/wasm` in `vercel.json`) or DOS titles fail to boot.
- **Audio autoplay:** the AudioContext unlocks on first click/keydown/touch (App.jsx); never
  play before that.
- **npm >= 11 (node >= 22.9):** js-dos pins a React-18 peer against this React-19 app; npm 10
  dies on the lockfile (`Missing: react-dom@18.3.1`). Diagnose: `npx npm@10 ci --dry-run`.
- **package-lock churn:** commit lockfile updates with the change that needs them; re-check
  `npm ci --dry-run` after any dependency bump.

## Where the rest lives
- **docs/AI.md** — the `src/ai` spine, the no-remote-AI-backend history, the Zork brain.
- **docs/HARNESS.md** — the self-verifying suite script by script, the mutant essays, CI detail,
  and the forge loop + warden.
- **Per-game deep notes** — each game's own README (RaccoonHeist, Galaga, IronKeep, SuperMario,
  Minesweeper, SpyHunter, Joust, QBert).
- **Playbooks** — `scripts/FORGE.md` (builder), `scripts/FORGE-QA.md` (QA), `scripts/warden.sh`.
- Live board: `https://jalfern.com/retrogames/forge`.
