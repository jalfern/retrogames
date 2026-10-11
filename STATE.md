# STATE.md — 2026-10-10 (MISSILE BATTLE session end)

## Where things stand
**#73 GAME 09 — MISSILE BATTLE IS LIVE at jalfern.com/retrogames/missile-battle**
(PR #128, squash 3064083, `shipped`, issue closed). Arcade is 26 titles.
**Next session: claim the oldest `game-queue`** — head is #74 SimCity-Min
(then #77 Lode Runner; #118 Minesweeper and #82 BensMagicBugLife are also queued).

| since last STATE | what |
|---|---|
| #73 / `forge-missile` | Four-module shooter again: `waves.js` (49 scripted launches, 81 warheads, 18 splitters — no random exists there), `sim.js` (pure `step(state,input)`, batteries-with-arcs, chain blasts, wave rebuild), `planner.js` (greedy intercept autopilot; its proven run IS the attract demo), shell with lead-aimed reticle. Core contract: every wave re-solvable with ONE FEWER interceptor per battery (slack rule). |
| harnesses | `missilecheck` 355 Node checks + 6 mutants (`--mutate`), `missileplay` 25 Chrome checks real-keys-only. Gates: `lint:missile` + `missilecheck` in static; `missileplay` added to `smoke` (ran green on the runner, 3m6s). |

## What is playable right now
- jalfern.com/retrogames/missile-battle — prod verified: route 200, live
  bundle `index-BQ8r7CFu.js` contains the game, zero page errors in the
  browser suite.
- Attract plays the autopilot's proven run (60 fired / 57 kills / 0 cities
  lost) tick-for-tick; slack@9 wins all three waves.

## What changed this session (the parts that matter next time)
- **I never touched the main checkout.** It was dirty on entry (live QA
  session #106 editing `fpscheck.mjs`, pid alive 3h52m past its 60-min box)
  — the whole build ran in `git worktree` `retrogames-missile` on dev :5175,
  removed after merge. `stash@{0}` (QA's parked IronKeep work) is STILL
  PARKED and QA is STILL ALIVE — do not pop it as a drive-by; as of this
  writing the main checkout shows two dirty files (`fpscheck.mjs`,
  `IronKeep/index.jsx`), both the QA session's.
- **A blast born at r=0 dies before it breathes.** Chain kills had NEVER
  fired in any run, proven ones included — the harness pin that kills a
  neighbour 8px OUTSIDE the main blast's reach is the only reason we know.
  Same family: `>` comparisons are false for NaN and `JSON.stringify`
  prints NaN as `null` (a bomber entry without `spd` poisoned its wave
  silently — spawn guards are finite-checks now).
- **Ids belong to the game (`g.nextId`), not the module.** A global `eid`
  made two identical fresh states hash differently.
- **In browser drivers: arrows must be HELD** (a `press()` fits inside one
  60Hz frame gap — keepplay, repriced), **the driver must LEAD its shots**
  (aiming at the present tense is a legitimate miss: blast cannot chase a
  receder), and **sections must run on quiet reloaded stages** (`setup({wave,
  quiet})`) or the live script races the probe. Also: a `waitEv` that
  returns the probe STATE instead of the matched event makes every
  field-level assertion vacuous until a real one catches it.
- Static job now has 14 lint gates + missilecheck; smoke has missileplay
  (MB_URL env override exists for worktree servers, like POLAR_URL).

## Gates (all green at merge)
15 scoped lints · `missilecheck` 355/355 + 6/6 mutants · `missileplay`
25/25 local AND on the smoke runner · `aicheck`/`zorkcheck`/`galactcheck`/
`forgecheck`/`polarcheck` all green · build ✓ · prod HTTP 200 + bundle clean.

## Next (for the next session — do NOT re-debug these here)
1. Claim #74 SimCity-Min (queue head). Fresh worktree if the main checkout
   is dirty again; `pgrep -fl FORGE-QA` first.
2. Missile Battle is shipped — do not polish it. Its gates: `lint:missile`
   + `missilecheck` (static), `missileplay` (smoke job).
3. Before touching anything: `git status` in the main checkout — if it shows
   `fpscheck.mjs`/`IronKeep/index.jsx` dirty and QA is dead (`pgrep -fl
   FORGE-QA`), settle that tree deliberately; the worktree-lane dance works
   but it is not free.

## Three questions for Jon
1. Same one as last session, now with more evidence: worktree-per-session in
   the plists (this session ran 100% in one and cost nothing but a slower
   disk), or a hard kill for QA sessions that blow their 60-min box (this
   one ran 4h+ and was still writing files as I merged)?
2. `smoke` finished before `static` on this PR too (3m6s vs 1m46s) —
   intentional parallelism, or should the merge wait on both explicitly?
3. Two Missile Commands now ship (`/missilecommand` the initial-commit
   stub, `/missile-battle` the harnessable one). Hide the old one like
   SuperMarioClassic, or keep both listed?

## Lineage
AGENTS.md honored: read STATE first, claimed queue head #73 with claim +
design comments, one game, 5 checkpoint pushes with one-line FORGE comments,
harness proven able-to-fail (6/6 mutants + a manual chainR break), merge
only via `gh pr checks --watch --fail-fast && gh pr merge --squash
--delete-branch`, prod verified, STATE rewritten on main after merge.
Rule 4: five straight sessions of `src/games/**` game code. Ran ~3h05m —
inside the box.
