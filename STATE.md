# STATE — session 44 (2026-10-28/29)

## Shipped this session
**FILM STRIPS** (#1132, PR #1216, squash 9ed2d4c) — visual PRs now judge themselves.
`npm run filmstrip -- --game tetris --attach <pr>` runs one seeded replay
(`reset(seed)` + that game's fixed `contractGames` pattern) against `origin/main` and the
branch on two vite dev servers, photographs the canvas at shared checkpoints through
`window.__game.frame()`, and composes a two-row strip: per-column `state.hash` equality
+ native pixel diff + one verdict line — identical / draw-jitter / **visual-only (N%
pixels)** / **SIM DIVERGED @ tick t**. `--attach` publishes the PNG to
forge-telemetry `strips/` and comments it inline on the PR (issue fallback). Shift
notes carry `strips:[{text,href}]` (validated to exactly the telemetry strips
origin+dir+.png) and `/retrogames/forge/report` renders the section — live in prod
(bundle index-BWC749jw verified).

## Hard-won facts
- **A double-slash route mounts the wrong game**: `/retrogames//tetris` fell through to
  something else with a __game — symptom was a hex string hash where tetris says decimal.
  Capture now asserts `meta.id` equals the requested game and refuses the strip otherwise.
- **vite dev binds IPv6-only and 404s the bare base**: probe `http://localhost:PORT/retrogames/`
  (slashed) for readiness, never `127.0.0.1`; join game paths onto the *unslashed* base.
- **Capturing inside one evaluate never repaints**: the locked loop's rAF can't run while JS
  blocks — step to a mark, then `setTimeout(50)` + one `requestAnimationFrame` before `frame()`.
- **verdict must print the tick, not the array index** (first draft said "tick 0" for column 1).
- Hashes are the sim-alignment proof; pixels are for eyes (WebGL draw jitter is real,
  jitter threshold 0.5% of pixels).

## Harness
`npm run filmstripcheck` = 16 gates: offline truth tables + pinned geometry, browser loop
on tetris (same-seed two pages → hash-equal + pixel-aligned ≤0.5%), and a BUILT-IN mutant
(seed+1 capture must come back SIM DIVERGED — tool proven able to fail).
shiftreportcheck 126/126 (+6 strip gates incl. offsite/traversal/non-png rejection).
Shared capture/compose lives in `scripts/lib/filmstrip.mjs` so the check tests the shipped
path. Proof strip: PR #1216 comment (tetris seed 7, identical — a plumbing PR must be).

## Next goal
`game-queue` holds #1204 PHYSICS WALK (demos lane), #1201 forge runway, #1140 shared 3D
model index — #1140 still unclogs RobotLab stage 2 (#1141 stays OPEN, building). No
lane:games game queued; QA lane owns its feedback. Next builder session: run FORGE step 2
— if #1140/#1201 are still unclaimed platform items it's the same cross-lane borrow
pattern this session used; flagship README gaps are ALL closed (that's why idle-stage
didn't fire — board truth, not memory).

## Environment notes
- Worktree `~/Dev/retrogames-forge-film-strips` on deleted branch's commits — reuse after
  `fetch + detach origin/main`. Ports this lane used: 5187/5188 (filmstrip defaults).
- filmstrip reuses any dev server already listening on its ports — good for lanes, but
  the server must serve the BASE ref when it isn't the one it spawned (auto-prep handles
  /tmp/forge/filmstrip-base on its own).
- `qa-1138` worktree STILL holds local `main` (blocks gh's post-merge branch switch):
  delete remote branch + detach manually (done again this session). Ask the QA lane,
  someday, to detach it for real.
- Left no dev servers running (filmstrip kills its own; manual 5187 was killed before exit).

## Open questions for Jon
(none filed this session)

## Carry-over
- Rule 4: #1216 is harness/tooling, not game code — streak now 2 non-game merges since
  RobotLab (STATE 43 + filmstrip). **Next session must ship game code** (src/games/** or
  public/demos/**) or flag STALLED per rule 4.
- QA lane owns #1179/#1168/#1135/#1190/#1195 + #1202 (needs-approval); builder stays out
  (Jon 2026-10-19).
