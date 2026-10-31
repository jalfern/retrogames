# The harness — essays, suites, CI, and the forge loop

Moved verbatim from `AGENTS.md` on 2026-10-14. Per-game suite details live in each game's README.

### The harness must be able to fail — and a mutant that survives everywhere is a report about the code

Before blaming an unreproducible machine for a surviving mutant, ask what makes the mutated
line **run**. A cone-sampling mutant here stayed green at 60 fps, 32x and 64x, and was
written up as "the CI runner is the only box that sees this" — until `grep` showed the line
read `w.yawFrom` and nothing assigned `yawFrom`, so `slices` was always 1 and the mutant
compared an expression with itself. The fix it "proved" is reverted. Dead code carrying a
green test is worse than no code: it ships a causal story with it. (The real cause of the CI
red turned out to be four driver bugs: polling a suspicion meter the alert wipes, polling one
belonging to a raccoon in a sack, parking the courier inside the guard's grabbing range, and
"emptying a yard" by teleport when a patrol is a route and routes walk home.)

### The harness must be able to fail

Every suite here was green with bugs in it at first, so two mutations are tried by
hand before a Zork change is believed:

```bash
# 1. drop `|| inert` from the refusal rule          -> infinite re-open, Kitchen unreached
# 2. make darkness sticky (`this.dark = true`)       -> "a LIT lamp outranks the word dark"
# 3. hardcode `turnOn('lamp')` (the deleted WANT sin) -> "the game never said lamp"
# 4. fire needLight without a dark exit              -> "the goal formed from a hint"
npm run zorkcheck
# 5. make describeAfter match the heading by LINE instead of substring
npm run zorkuicheck   # MUST fail: 1 room mapped in the browser, 13 in Node
```

Three of those four **survived their first attempt**, and every survival was the same
diagnosis — the mutated line was unreachable, so the test never touched it: darkness
that the brain never walks into; a fixture that never entered the branch; an
experiment rule that could not run because the agent did not know what it was
carrying. **A surviving mutant is usually a report about the test, not the code.**

Fixing mutation 3's survival exposed the real bug: `p.inventory` only refreshes when
the game prints a carry list, which is only in reply to `inventory`, which this brain
never types — so it had no idea what was in its hands. It now tracks its own
`Taken.` replies (`held`), and the experiment it has always wanted to run finally
runs, and the game answers it:

Mutation 2 survived **twice**, and both reasons are the lesson: first the brain
never enters the dark, so a sensor lying about global darkness is behaviourally
invisible; then the probe said *"It is too dark"* while the detector matched only
*`it's dark`* — the fixture never entered the branch it was testing (and that regex
is why Zork's actual phrasing had been sailing past the sensor all along). **A
mutant that survives is usually telling you the test never got near the code.**

```
> turn on elongated brown sack
  If you wish to burn the brown sack, you should say so.
```

## Self-verifying (vendored test harness)
The visual + audio verification loop lives **in the repo** under `scripts/` so any
model/machine can reproduce it (it is not an external tool):

| Script | What it does |
|--------|--------------|
| `scripts/shot.mjs` | Drives **system Chrome** (via `playwright-core`) to screenshot the dev server and drive the game through `window.__marioTest`. |
| `scripts/audcheck.mjs` | Starts the game and asserts the chiptune engine steps + produces an `AnalyserNode` signal; exits **non-zero** on failure (CI-friendly). |
| `scripts/verify.mjs` | Runs the browser suite and summarises; non-zero exit on any failure (`npm run verify [-- --full]`). |
| `scripts/mariocheck.mjs` | Title/menu/touch regression: lone Shift must not start, `?`/OPTIONS open the menu, keys 1–4, BACK/ESC, gamepad hidden on menus. |
| `scripts/autopilotcheck.mjs` | Mario option 3 must clear 1-1 twice: as it plays (must reach Fire Mario) and with fire taken away (must jump the plants). |
| `scripts/plantcheck.mjs` | Piranha plants: cycle, hitbox == emerged part, hurts only when out, safe when retracted, never stompable. |
| `scripts/levelcheck.mjs` | Geometry audit of every world in `LEVELS`: no pit wider than a running jump, a landing chain that actually reaches the flagpole, every firebar clear of the tilemap, lava over real holes. Catches the one level bug a screenshot cannot — a jump that is simply impossible. |
| `scripts/evocheck.mjs` | Mario option 4 must learn (clean cold-start fitness after 60 gens, and ≥1.5x its own gen-1 — the ratio is the real gate, the GA is stochastic; post-#107 `evoTrain` goes through `startEpisode` so fitness is per-episode, not cumulative coins) and its HUD must actually render. |
| `scripts/evoprobe.mjs` | Per-genome scalpel: one episode with a named/random/evolved controller → `maxCol`, jumps, trace. |
| `scripts/lib/harness.mjs` | Shared plumbing: dev-server preflight, Chrome launch (`SHOT_CHANNEL`), DEV-hook wait (`openMario`, or `openGame(browser, { hook })` for other titles), pass/fail `Report`. |
| `scripts/fpscheck.mjs` | IronKeep (the FPS): key-gated reachability audit of all three halls, then a driven play-through — collision, doors and keys, hitscan, pathfinding without line of sight, lives, the Warden, reaching `win`, and a frame-time budget. |
| `scripts/keepplay.mjs` | IronKeep feel probe: real key events only (no frozen-frame shortcuts), so input-path bugs that deterministic stepping cannot see — a quick tap swallowed between two 60Hz samples — still show up. |
| `scripts/heistcheck.mjs` | Raccoon Heist **in Node** (no browser): every job's carved grid audited for reachability of the cart, the gate, every marker and every coin; that each locked door is *load-bearing* (run the reachability twice, once with doors shut — the difference is the proof); patrol routes that actually walk; torch beams that cross floor; cover within two cells of every loot pile; and the stealth model itself. `--map N` dumps a job as ASCII, `--mutate` seals the vault and requires the audit to complain. |
| `scripts/heistplay.mjs` | Chrome **plays** job 1: walks with an actual thumbstick vector, steals, delivers, chews a vault, stands in a torch beam until bagged, chews a friend loose, empties the cart, escapes. Asserts the cast is a visible mesh in the scene graph (the cast once passed every numeric check while never being added to the scene), that the verb shown is the verb that fires, that every verb has a *mesh* where it points, and that a rescue takes under 4 s. **Every wait is `window.__simSleep(worldSeconds)` and every budget is `window.__gameTime()`** — the driver waits in *world* seconds, because `setTimeout` measures the runner: ten CI reds came from waiting a wall second and asserting a game second. `--throttle N` runs the whole suite on a deliberately slow CPU, and on CI it drives the
  documented `?lite=1` pipeline at 640x426 because the runner rasterises in software and drew
  **1 fps** at 1100x700 with shadows. It counts the *pound*, never `probe().caged` (being caught hands you the next raccoon, so the one you are watching is free again a frame after a good arrest), and it fills the pound to two itself rather than letting the rescue section loop over an empty list. |
| `scripts/heistclock.mjs` | One line per CDP CPU throttle: `1.00x loop 1.00x job @ 60 fps`. This is the instrument that turns "CI is red, local is green" into a number — with the old five-tick catch-up cap it read **0.59x @ 7 fps**, i.e. the heist literally ran at half speed and every check in seconds became a measurement of the machine. Measures loop time (`st.t`, which advances even on menus) *and* the job clock separately, and refuses to assert a ratio below 4 fps rather than reporting a slow box as a broken game. |
| `scripts/heistmutate.mjs` | The mutation harness for the above: fourteen mutants (a mutant may carry `throttle: N`, because the camera-floor overshoot literally does not exist at 60 fps), each one a previously fixed bug put back by an anchored text swap, each run through the real `heistplay`, each restored from a `/tmp` copy (never `git checkout` on a dirty tree). Exits non-zero if any mutant survives, i.e. if a check has quietly stopped touching the code; an anchor that does not match is a **failure**, not a skip, because a silently skipped mutant is a green suite that tested nothing. `--dry` re-checks the anchors. One mutant is *equivalent* and documented in its header (the camera-floor overshoot — unreachable at any frame rate `heistplay` runs, covered by the escape check); an earlier one (hiding a lock with `visible = false`) was a lie about being equivalent and is now a real gate. |
| `scripts/cornerprobe.mjs` | Answers "is the player inside the level?" with numbers instead of an opinion. Walks a raccoon into the worst corner in job 1 under a CDP CPU throttle, sampling every mesh in range each frame with a **signed depth** (metres past the collider edge, positive = outside), so "the mesh is too big" and "the simulation fell behind" become different, checkable claims instead of vibes. Reports the walk in **world** seconds, never wall (`frames=`). |
| `scripts/zorkpulse.mjs` | The Zork equivalent, and the instrument that found the double-driver bug: one line per second of wall time from the loop's own counters — exchanges closed, seconds since the last one, whether the interpreter is at the prompt, ticks, failures, idle, the command→prompt median. `en=Y` with `frz` climbing means the actuator is waiting on nothing (a bug); a large `med` with `frz=0` is simply a slow box behaving correctly. Not a gate — `zorkuicheck` is. |
| `scripts/aicheck.mjs` | The **spine's own contract**, in Node, ~1 s. No brain exists yet, so `AgentLoop` is driven by fake brains that reproduce the failures this repo has already lived: an unknown skill must be **rejected and counted** (not thrown, not ignored), a brain that stops advancing must trip the watchdog and then stop *with a reason*, a throwing skill must not kill the loop, a brain with no move must stop rather than spin, every `Percept` field must ship a confidence defaulting to 0 (never a hole), and a title that declares no sensors must get no arm to advertise. |
| `scripts/zorkcheck.mjs` | Zork **in Node** (no Chrome, no dev server), two phases. **Seams:** every command the scripted walk sent was legal, `open window` proved **by prose** (`nailed and boarded` before, absent after — a score bump is not proof, that move is worth 0 points here), a complaint does not invent a room, reading the leaflet does not invent a room, darkness detected, a refused move classified `blocked` not `moved`, no Glk/VM error. **Brain:** mounts the real `ZorkExplorer` in the real `AgentLoop` and asserts its invariants — never re-entered a dark room unlit, never died, never said a word the parser rejected, every merged room noticed (`splits`) and reported, ≥10 rooms mapped, and it stopped **with a reason it states**. `--map` prints the map the agent believes; `--trace` prints `verdict > command > first line of reply`. **Prose phase (2a):** grades the **first sight** of a room — Zork prints a long description once and never repeats it, so knowledge must be caught or re-`look`ed — and asserts the game's own exit labels were read: `west, up, down, east out, dark: up, down`, with west **not** dark, which is per-clause attribution (per-sentence would teach the agent to fear the lit way out). Also pinned: darkness **clears** when the light does, and a **lit lamp outranks the word "dark"**.
| `scripts/zorkuicheck.mjs` | The AI behind a **real button**, in a real browser, driven only by one mouse click and one keypress. Budgets are in the agent's **turns**, not the wall (`untilRooms` keeps waiting while turns keep arriving, and the wall is only a stall detector), arbitration is sampled N times with the loop demonstrably driving instead of glimpsed once, `--throttle N` reproduces a busy CI runner, and a stalled loop dumps its own diagnostics into the failure line instead of just `1 rooms`. Asserts the affordance exists (a badge with no control is a brain nobody can start), that it plays **by itself** after the click (a check that watched the key turn instead of the car move passed while the map sat still), that the input field is disabled while it drives so no keystroke lands inside a half-typed word, that **one key takes the keyboard back and it never creeps back**, and that it prints what happened. This is also the only gate whose transport matches production: the Node harness hands the sensor newline-separated replies, the browser hands it Glk **chunks glued together**, and a parser that assumes its transport's shape (see `describeAfter`) maps 13 rooms in Node and 1 in the page. |
| `scripts/prodsmoke.mjs` || The same titles against the **production build** (`vite preview`, port 4173). Every other browser check runs against `npm run dev`, where Vite resolves `/retrogames/...` for you and `import.meta.env.DEV` grants the `__*Test` hooks — so the shipping bundle had never been driven. This one has no hooks: it proves the emulator is fetched exactly once under `/retrogames/` (never `retrogames/retrogames`), that non-DOS titles never download js-dos at all, that the canvas survives readback outside dev, and that **real** keyboard input moves Graham and types into the Z-machine. Asserts contracts, not chosen futures: `north` may legally be answered "The way is blocked", so the check requires an echo + a reply + a `LOOK` description. |
| `scripts/doscheck.mjs` | The seams every DOS/IF title depends on: js-dos boots under the dev server (it did not — see Gotchas), the keyboard handler is captured off `window`, the framebuffer is *readable* (not composited-and-cleared), ESC gets past the AGI copy-protection box, injected arrows move Graham, and Mario still renders **without** downloading js-dos. Retries frames because AGI legitimately fades through black. |
| `scripts/slotcheck.mjs` | The #494 player-slot law, in Node: **same seed + same per-player pad streams ⇒ same state hash, whatever produced the pads.** Gauntlet seeds run 600 ticks with the cpu seat (`partnerPad`) while a scripted model drives seat 1; the recorded seat-2 pads are then replayed through model seats and the hash is compared every tick. Bubble Bobble runs both seats cpu (planner Bob wrapped as pad emitters) for 900 ticks and replays them through model seats. Also pins the layer itself: off idles, unknown kinds throw, human reads its #492 slot pad, model drains its pushed queue and idles dry, remote is reserved (transport answers, unwired it idles). `--mutate` drops one **live** pad mid-replay and must see divergence; breaking `padFor`'s model queue turns the suite red (4 fails) — the checks have teeth. |

```bash
npm install                 # installs playwright-core (no browser download)
npm run dev                 # in another terminal
npm run shot -- --out scripts/.shots/fire.png --eval "window.__marioTest.setPower('fire');window.__marioTest.teleport(6)"
npm run audcheck            # PASS/FAIL on the audio engine
npm run verify              # the whole browser suite
npm run evoprobe -- --preset pitwide-run --trace
npm run fpscheck            # IronKeep audit + play-through
npm run zorkcheck           # Zork agent in Node (no browser) — also a CI merge gate
npm run doscheck -- --quick # Zork + King's Quest seams in Chrome (--quick skips Ultima/Mario)
```

- **Prereqs:** Google Chrome installed (harness uses `channel:'chrome'`, no download).
  Override with `--channel chromium` after `npx playwright install chromium`, or set
  `SHOT_CHANNEL`.
- **`scripts/.shots/` is for captured images ONLY — never a script.** It used to be
  gitignored wholesale, which silently swallowed ten driver scripts written during
  iterations 11–13. The ignore now covers `*.png`/`*.jpg` only, so a stray `.mjs` shows up
  as untracked instead of vanishing. Harness code is tracked code: put it in `scripts/`
  and give it an npm alias.
- **DEV-only:** `window.__marioTest` exists only under `import.meta.env.DEV`, so the harness
  must target the **dev server**, not the production build.
- Options: `--url --out --eval --steps --w --h --settle --prewait --channel --no-start`.
  `--steps` is a JSON array of `{down|up, wait}` for real keyboard input.
  `--no-start` skips the initial keypress, so attract/menu shots are possible.

### CI
`.github/workflows/ci.yml` scopes work per changed file (#601); `nightly.yml` runs
everything. The scope table lives in `scripts/checks.mjs` (one source of truth:
`ci.yml` gates on it, `scripts/ciscope.mjs` turns a diff into gate keys,
`scripts/run-checks.mjs` replays the whole table with mutants nightly —
`node scripts/ciscope.mjs --selftest` fails if the table references a dead alias).

| Job | Trigger | What it does |
|-----|---------|--------------|
| `scope` | every PR | diff vs base → `docs` flag + gate-key list (shared code or an unknown `src/games/<Dir>` fans out to everything). |
| `static` | every PR | required check (branch protection). Scoped lints/checks per the table, **no `--mutate`**; shared code runs the full set; docs/scripts-only PRs run only `ciscope --selftest` (< 1 min). |
| `smoke` | every PR | the per-game real-key smokes for the touched games (+ `vpadboot`/`tapstartcheck` on shared changes). Advisory: a flake means `gh run rerun <id> --failed` once, then move on — never fix-in-a-new-PR, never wait on it. |
| `verify` | **manual** (`workflow_dispatch`) | boots `npm run dev`, runs `npm run verify -- --full` (audcheck + mariocheck + autopilotcheck + plantcheck + levelcheck + aicheck + zorkcheck + fpscheck + evocheck + doscheck), then builds and `npm run prodsmoke` against the production bundle; uploads `scripts/.shots/`, dumps the vite/preview logs on failure. |
| Nightly `full-static`/`full-smoke` | schedule + manual | every lint, every check with `--mutate`, `build`, then the whole smoke set on main. A red night files/refreshes one issue and **freezes merges** until green. |

Pushes to `main` no longer re-run CI — the merge commit is the tree the PR just
proved; main's full proof is the nightly. Before ANY merge a lane runs
`scripts/main-ok.sh` (red nightly = freeze; the flaky heist nightly only warns).

```bash
scripts/main-ok.sh                        # merge-freeze check (rule 5)
node scripts/watchcheck.mjs               # watch.sh pane self-heal proof (#1259; skips where no zsh)
node scripts/ciscope.mjs --selftest     # proof the scope table is honest
gh pr checks --watch                      # all checks on your PR
gh workflow run ci.yml --ref <branch>     # opt into the browser suite
gh run download <run-id> -n mario-frames  # grab the captured frames
```

The browser suite is manual on purpose: headless audio on a shared runner is the flaky
part. Promote it to `pull_request` once it has been green a handful of times.

Repo-wide `npm run lint` is deliberately *not* a gate: ~740 pre-existing errors in the
DOS/IF adapters would make it permanently red. Widen `lint:mario` as those get fixed.
`lint:ai` exists so the AI spine and its harness are covered *now* rather than whenever
that tail is cleaned up.

> **New machine / CI bot:** pushing `.github/workflows/*` needs the `workflow` OAuth
> scope, which GitHub hard-blocks otherwise. Check with `gh auth status`; add it with
> `gh auth refresh -s workflow` (gh ≥2.40 — it was renamed from `auth refresh-scopes`),
> then enter the device code at github.com/login/device. Additive and reversible via
> `--remove-scopes`.

### Film strips (#1132): judge a visual PR in five seconds
`npm run filmstrip -- --game tetris --attach <pr>` runs one seeded replay
(`reset(seed)` + the game's fixed `contractGames` pattern, `scripts/lib/filmstrip.mjs`)
against base (`origin/main`) and head, each on its own vite dev server, photographs the
canvas at shared checkpoints through `frame()`, and composes a two-row strip: per-column
`state.hash` equality plus a native-resolution pixel diff. The verdict line is one of
*identical* / *identical up to draw jitter* / *visual-only change (hashes equal, N%
pixels)* / *SIM DIVERGED @ tick t* — the hashes, not the pixels, prove sim alignment
(WebGL draw jitter is real). `--attach` publishes the PNG under `strips/` in
jalfern/forge-telemetry (the same anonymous CDN pipe as report.json) and comments it
inline on the PR (issue fallback); shift notes may carry `strips:[{text,href}]`, which
`shiftreportcheck` pins to exactly that origin+dir and `/retrogames/forge/report`
renders as a section. The pure core (`checkpoints`/`verdict`/`telemetryPath`/`layout`)
is offline-testable; `npm run filmstripcheck` (16 gates) re-runs the browser loop on
tetris and embeds its own mutant — a capture at seed+1 must come back SIM DIVERGED.
Capture runs on dev servers because `__game` is DEV-only; a game with no PATTERNS
entry cannot join a strip; `--strict` exits non-zero on divergence for CI wiring.

### WebGPU shaders: in-place workgroup butterflies need read → barrier → write
An FFT stage that reads `a`/`b` out of `var<workgroup>` memory and writes **both** butterfly
slots is racing unless a `workgroupBarrier()` sits **between the reads and the writes** —
the stage-end barrier only orders writes before the *next* stage's reads. Butterfly partners
occupy each other's write slots, and a lane in another SIMD group can land its write before
its partner's read. The tell is **one-frame whole-surface corruption** in everything derived
from the transform (ocean.html shipped exactly this: spikes for one frame, gone the next —
never reproduce a deterministic way, which is why no CPU replica check could catch it).
Pattern for every stage loop:
```wgsl
let a = sm[idx];
let b = sm[other];
workgroupBarrier();   // all stage reads complete before any stage write
sm[idx]   = a + b;
sm[other] = twiddle * (a - b);
workgroupBarrier();   // all stage writes complete before next stage reads
```
`oceanfold` structurally pins the mid-stage barrier for both `cs_row` and `cs_col`; any new
WebGPU shader with an in-place butterfly (COMET DRIFT HD included, if it ever adds one)
should carry the same pattern — visual review alone will not see the race.

## The Forge (autonomous game production)
`/forge` (route `ForgeBoard.jsx`) is the live progress board + request box: it reads the
`game-queue/building/shipped` GitHub labels, and "＋ PROPOSE A GAME" is a prefilled
new-issue link — anything Jon files joins the queue. The loop: **launchd**
(`scripts/com.jalfern.forge.plist` → `scripts/forge.sh`) runs `opencode run` at
09/13/17/21 with one instruction — execute `scripts/FORGE.md` (the playbook: claim oldest
issue → build per conventions + a harness that can fail → the only allowed merge path →
verify prod → rewrite STATE.md). One game per session, 3-hour cap, stalled-loop exits.
**Idle has an order (#841):** claim miss → borrow ONE QA `feedback` fix (only with no live
QA session) → flagship polish stage (`scripts/lib/idle.mjs`: first unowned "Honest gaps"
item of SSX/Emberwood/COMET DRIFT HD/Myst, skipping games QA holds `building-qa`, filed as
its own `game-queue` issue then claimed normally) → only then STOP. The pick logic is
pure Node; `jonqcheck` pins the order and skips.
**The warden** (`scripts/warden.sh`, launchd every 10 min) is a plain shell script, not an
agent: pulse line, trust gate + triage, kick the builder / QA when idle, `stalled` after 3
kicks with no progress. An empty queue no longer means sleep (#869): when the builder is idle
and TARGET is empty, step 4b asks `scripts/idle-kick.mjs` — the same pure `flagshipStage`
pick over the README honest-gaps — and kicks only on `KICK`; `NONE` (every gap owned) leaves
STOP legal. It never calls a model, so it never slows the builder or hangs on oMLX.
Test any change with `WARDEN_DRY=1 zsh scripts/warden.sh` (reads everything, changes nothing).
**The daily log** (#516): `scripts/dailylog.mjs` cuts the day at 07:00 Pacific (DST-safe)
and pushes `log.json` to forge-telemetry with every telemetry tick — shipped (with
`docs/shots/issue-<n>/` screenshots), stalled, regressed (only `static` failures count),
waiting on Jon, private titles gated. `/forge/log` renders 14 days newest-first; the board
shows the live headline. Rules pinned by `npm run dailylogcheck`.
**The runway** (#1201): `scripts/lib/runway.mjs` estimates each lane's queue in build-days
(S/M/L keyword classes) over the trailing 14-day ship rate read from label lineage (closes
carrying `building` = Builder, `feedback` = QA — title-guessing is noise at ~45 merges/day);
under a day reads amber, zero queue reads `polish-only — self-directed`, zero rate reads `?`.
`scripts/runway.mjs` pushes it inside `board.json` (telemetry.sh materialises script+lib from
origin/main into /tmp — a stdin `node -` cannot resolve relative imports), the board shows it
at the top, and `jonq digest` prints the questions-digest body with the same line. Rules
pinned by `npm run runwaycheck`.
```bash
launchctl load ~/Library/LaunchAgents/com.jalfern.forge.plist   # install (after cp)
scripts/forge.sh                                                # force a session now
tail -f /tmp/forge/last.log                                     # watch a session
```

**Two builders + whole queue (#1258, Jon's steer 2026-10-31, 48 h trial):** the Studio runs
builder slots **a** and **b** (`forge.sh <a|b>`; identity "THE FORGE on slot a|b." in the
prompt — the QA-node trick, so locks/watch/status distinguish slots; ports 5173/5178; job
`com.jalfern.forge-b`, self-bootstrapped by the warden from origin/main — merging is the
install). One planner decides everything claimable: `scripts/lib/lanes.mjs` (pure) ranks the
builders' ladder games-first (corpse → steer → next → oldest game-queue → oldest feedback)
and gates the studio QA's queue-fallthrough (feedback first; then queue items only when they
outnumber free builder slots; flagship polish last). The warden evals the planner's output
(`/tmp/forge/target-<slot>` hands each slot its issue) and keeps per-slot stall counters.
One lane per issue is enforced at claim time by a UNIFIED liveness namespace —
`forge-claim.sh` (new) and `qa-claim.sh` both honour `FORGE (<slot>):` and `QA (<node>):`
claimed/checkpoint, 90 min, newest wins, loser yields — so QA building a queued title can
never collide with a builder (#878). The builder-slot QA spill (`forge-qa.sh builder`) is
parked while slot b is loaded (superseded; reverting the trial restores it). The 48 h trial
is self-enforcing: `scripts/studiotrial.mjs tick` (warden step 5b) starts the clock on first
run, at 48 h posts items/day before-vs-after on #1258 and writes keep|revert to
`/tmp/forge/studio-lanes.verdict`; `revert` makes step 4 stop kicking slot b. Tokens/s
streams live in watch.sh but nothing persisted it pre-trial, so the report ships items/day
and says so. Visibility: `forge status` names builder-a/b + trial state, watch.sh has a
BUILDER·B pane, the pulse line carries `builders=N/2`, board.json gains `slots` and
`/forge` renders the ⚙ SLOTS row (`floor.js slotsLine`, pinned pure). Gate:
`npm run lanecheck` (45 gates: planner order, slot assignment, QA-queue matrix, slotsLine,
trial verdict + wiring tripwires; flip `queueFree > freeSlots` to `>=` and the QA-steal
fixtures go red). Honest gaps: orphan-Chrome sweep only runs when slot a restarts idle
(shared per-script profiles), watch has no live-tap pane for slot b, the shift report counts
merges per lane (branch `forge/*` = builder regardless of slot) — filed for QA follow-up.

**Aggregate throughput measured (#1299):** the trial report can now answer "tokens/hr with
N streams" honestly. `tps.mjs` sums `tokens_per_second` over EVERY generating stream (was
`generating[0]`), reports `gen`/`p` (tokens in flight across streams), `n` (active streams)
and `tot` = the server's cumulative `total_tokens_served`; `telemetry.sh` appends
`ts/tps/slots` (slots now incl. qaStudio/qaMini) to `/tmp/forge/tokens.jsonl` at ~7-day
retention (telemetry.jsonl keeps only 24 h — too short for a 48 h trial). At report time
`studiotrial.mjs` pulls each box's `/admin/api/usage?range=7d` — hourly token buckets with
400-day retention, so the BEFORE window is measured from real counters, not extrapolated —
and adds per-box tokens/hr (every stream counted, Jon's RETRO chat included, with mean/peak
active streams from the ledger), sessions that hit their time box without shipping (span
= session-log name→mtime; unmarked builder logs before fleet-start were slot a, after it
are dropped not guessed; ships attributed by last claim lineage), and an hourly sparkline
chart with `|` marking fleet-on. Gates: `tpscheck` 17 (§3 all-stream math) + `lanecheck`
§B4 (usageWindow tz/fraction/coverage math, streamStats, boxMisses, spark, report faces,
old pre-#1290 report shape pinned word-for-word).

**The nightly bot (#1040):** contractcheck proves a game *boots 600 ticks*; nothing proved a
game can be *finished* unattended. `scripts/nightlybot.mjs` plays every contract game to
completion each night — seeded, stepped, headless, via `window.__game` — with a mulberry32 pad
policy pure in (seed, tick), so a failure line is reproducible with one command
(`NIGHTLY_ONLY=<id> NIGHTLY_SEED=<seed> npm run nightlybot`). Hard gates: zero page errors,
tick advances every step, `reset(seed)` lands at tick 0 with that seed, and the run must reach
`done` before the cap. A cap-reached run is a softlock only when the sim also *froze*
(state hash invariant over the last 30 steps); still moving = endurance (the bot never
failed — a warning, not a defect). Seed echo and score drops are warnings, not verdicts
(engines legitimately fold seeds — Lemmings picks levels by seed, Gauntlet mods by 97).
Results push `nightly.json` to forge-telemetry (`/forge` shows a ✓/✗ row per game with
fail-streaks); each NEW failure shape files one `feedback` + `lane:qa` issue, deduped
against open ones. `npm run nightlybotcheck` (pure
selftest, 24 checks: policy purity, verdicts incl. endurance-vs-stuck, filing dedup, streaks, roster pinned against
contractcheck's GAMES) runs in `static`; `NIGHTLY_MUTATE=stuck` proves the softlock gate is
load-bearing (it goes silent and a frozen run flips red→green). launchd
`com.jalfern.nightly-bot` (03:30 local) starts its own dev server on :5199 so lane servers
never collide, then pushes + files. The soak closes itself: `nightly.json` carries a
`greenStreak` (mutated runs never count) and the third consecutive fully-green night closes
#1040 automatically — no human remembers the soak ended. Honest gaps: seeded exploration, not skilled play — most
runs fail on their own; runs that survive the cap keep moving and are flagged endurance, so
endless designs stay distinguishable from trapped states, and winning is never gated.

**The juice audit (#1130):** "every player action should get a reaction back" is the
game-feel rule; `scripts/juiceaudit.mjs` makes it a number. For every contract game it seeds
through `window.__game.reset(seed)` — deliberately NOT `step()`: the loop lock bypasses the
live input→events→audio path, which is exactly where juice lives (proved on Lunar Lander:
locked ticks burn fuel but hum nothing) — then holds each declared button ~150 ms with real
KeyboardEvents (VirtualControls' own codes; `B` reads its code off `[data-vc=b][data-key]`,
pointer titles get a canvas-centre tap), sampling every animation frame against an equal idle
window at the same seed and phase. Channels: **sound** (AudioController counts scheduled
one-shots, exposed DEV-only as `window.__audioSfx`; the music bed never counts), **motion**
(state keys the idle window never moved — deterministic sims make this a clean paired test,
which pixels cannot be because starfields twinkle by design), **score pop**, and a high-bar
**fx** burst (≥2% of the canvas at once, 1.6× idle: explosions, flashes, shake). PREP takes
the shortest pre-roll out of wait phases (Missile Command ignores fire for 150 ticks — the
banner is law, not a bug). Output `public/forge/juice.json` (worst-first bars on `/forge`).
`npm run juicecheck` (21 gates: pure math on every threshold + one live Lunar Lander probe)
is the load-bearing part; `--mutate` strips the SFX counter and the sound gate goes red.
The audit itself is a measurement, not a CI gate — a 0% game files QA, it does not block a
build.

**The boredom map (#1131):** "where does a run go flat, dead or spiky?" `scripts/boredomaudit.mjs`
replays the nightly bot's own pad policy (`padFor` seed math, `nightlybot.mjs`) over three seeds
per contract game through **locked** contract steps — the opposite clock choice from the juice
audit, and right for the same reason: boredom lives in the WORLD (score, enemies, damage), not in
audio/particles, and locked steps are deterministic, seedable and ~1000× real time. Each tick
diffs `__game.state()` into **reward** (score up), **damage** (lives/cities/ammo/health-style
keys down) and **distance-weighted motion** (position keys by how far they moved; bare
key-counting keeps a coasting runner "live" forever; `tick/hash/seed/done` are noise).
Summed into 1-second strips, combined by mean over seeds still alive at that second, each second
classified against the run median: **dead** (0), **flat** (≤35%), **live**, **spike** (≥250%);
`boredom = (dead + flat/2)/seconds`, plus the longest dead/flat stretch named with its start.
Trailing partial seconds are dropped — a run cut off by `done` must not fake dead air.
`public/forge/boredom.json` renders worst-first heat strips on `/forge`; `BOREDOM_FILE=1` files
the breaching games as QA issues (nightlybot-style shape dedupe). The founding catch: Momentum
Runner read 81% bored with 90 s of dead air — a false positive: its contract state hid the runner
(a #1184 blind state, hash moving while every visible key sat still). The map now flags blind
states (`∅`, never files on them) and Momentum exposes `pos`, its honest reading 0%.
`npm run boredomcheck` (47 gates: pure math on every threshold + live Lunar Lander probe +
committed-json validation + roster parity) is the load-bearing part; `BOREDOM_MUTATE=dead`
blinds dead-detection and seven gates go red. Measurement, not a CI gate — the map reports courses, it does not block builds.

