# STATE — forge board snapshot (slot b, 2026-11-28 — FROGGER ease shipped from a rescued corpse)

## This session (slot b) — step-1b resume, not a fresh claim
- Found a **dying-lane trap on my slot's own issue**: #3854 (FROGGER difficulty
  ease) was claimed by a slot-b session that crashed mid-`--mutate` (~04:42Z).
  Its orphan `froggercheck --mutate` kept planting mutants under the service
  daemon with `tail` piped to a dead session, `.mutant-running` stamped and
  `attract.js` rewritten. Killed orphans (mutate + wrappers + zombie tail),
  reverted the planted mutant to HEAD, cleared the stamp, verified mutateguard.
  Posted the takeover comment on #3854 first thing after cleanup.
- A parallel lane (slot a) ran the same resume concurrently — honest collision,
  productive outcome: its tee'd board `/tmp/frogger-mutate-b.log` finished
  **139/139 with all 27 mutants die** (incl. "the level-6 ease is removed"),
  restored the tree, and the squash merge landed: PR #3858 → `1c05b24`
  (05:25:05Z). My lane's contribution: orphan-plant cleanup (otherwise #2047
  risk), merge-readiness proof (static SUCCESS at head `d3c497a`, MERGEABLE,
  no hold, main-ok green), and prod verification + issue closure.
- **Prod verified by behaviour, not hash**: pre-deploy index carried the old
  monotonic `min(1+n*.12,1.8)`; live index `index-D-xfUy7u.js` contains the
  `level>5` ease branch. https://jalfern.com/retrogames/frogger
- #3854: `building`→`shipped`, closed (GitHub auto-closed at merge; labels
  corrected + shipped comment with the recovery record).

## BOARD facts at close
- main tip `26e5bbb` (slot a's STATE; its game squash `1c9488f` #3859 ponds +
  docs `fe88741` precede it). Rule-4 streak: reset (game code merged).
- building: none. building-qa: **#3860 QA — DEFENDER** (never touch).
  game-queue: empty. halt/steer: 0. #3841 (lemplay flake) platform lane's.
- jonq: #3791 AWAITING (deadline 11-29), #3516 AWAITING (default `done` at
  its sweep ~11-28 12:35Z). Let the sweeps take them; do not re-file.

## PLAYABLE on main right now
- FROGGER with the arcade breath: levels 1–5 byte-equal, level 6 steps back
  1.48→1.36 and re-climbs +12%/lvl, 1.8× cap at level 10:
  https://jalfern.com/retrogames/frogger
- LEMMINGS-LITE ponds everywhere (all four boards have water, 3-tile fatal
  falls, demo parachutes); MINESWEEPER marquee; BARD'S TALE; PINBALL; KOI demo.

## Open questions (links only — #605)
- #3791 (dry shelf: which new flagship title — AWAITING, deadline 11-29),
  #3516 (Arkanoid texture rung — AWAITING, defaults done at its sweep).

## Next claims (for whoever is free)
1. Lemmings **BUILDER** — oldest real gap, first legitimate multi-session WIP
   branch (placed-cell planks + solver search space + re-solve all four levels;
   sized on #3853 at 1–2 days). Alternates: blocker-wake (medium, re-solve),
   float-while-dig (design question first). idle-kick will keep naming
   LEMMINGS-LITE while those gaps stand.
2. Two lanes crashed this window mid-work (slot-b pre-merge, and both new slot
   kicks came from one tick the board was empty — the never-dry warden kicked
   slot-a AND slot-b at 04:44 while a half-built corpse sat unclaimed). The
   resume rung works but cost a collision; whoever picks the next claim, check
   `pgrep -fl froggercheck|mutate` style residue BEFORE touching a worktree.

## Slot state at handoff
- :5178 stopped via `scripts/devstop.sh`; no other lane's port touched.
- Worktree `retrogames-forge-frogger-ease` left detached at `origin/main`
  (merge cleanup detached it after squash); remote branch deleted; tree clean;
  no `.mutant-running` anywhere in slot paths. mergeclean will prune it.
- STATE committed to main (step-9 allowance: the forge game merged this
  session) and parked slot-scoped via `statepark.mjs park b`.

## Harness facts worth keeping
- (a) A crashed lane's background commands survive under the opencode service
  daemon (pid 3073) — `pgrep` for the *check*, not the session; dead lanes
  leave live mutant plants ticking. Kill pattern: match `scripts/<name>check`,
  never `npm run dev` (kills lanes).
- (b) jalfern.com assets are behind apex→www 308 + CDN HTML cache: poll for a
  *changed index hash* with a cache-buster query, then grep the new index —
  FROGGER is bundled in the index (not lazy); LEMMINGS is its own chunk.
- (c) The frogger mutator's board is 27 mutants / ~30 min serial; B1's promised
  "merge on green" was satisfiable by tee'd log evidence — keep boards tee'd.
