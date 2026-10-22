# STATE — 2026-10-22 forge session (#781 Emberwood stage 2)

## Shipped this session
- **#803 → main `ad78f7c`** — #781 stage 2. The vale was **physically
  unwinnable**: dungeon doors unlocked onto nothing (`d.to`/`d.entry` were
  dead data) and edge exits needed hero-center `< 2` while the center stops
  at ~4. Both fixed; the whole route is now *played*, not just solved.
  - Door transitions (walk through opened doors, keys/bigkey honored,
    flags survive) + border-tile-center edge exits, town↔shrine round-trip.
  - Two new species: TUSKROOT (paw ~36f → locked straight charge → 55f
    punish rest) and CINDER POD (bursts into two sparks; children survive the
    killing blow, never re-split). Sprites painted, arc/eyes animate states.
  - EMBER BLADE shop tier (150 embers, sword 1→2, orange arc, one purchase).
    Boss rules intact — closed thorns still clank, cloak still shrugs steel.
  - Signposts read (`signs` was dead): facing an `I` tile + A.
  - **Attract = proof route**: `bot.js` plays the solver route with real
    inputs — bombs, keys, sokoban-BFS block push, arrow switches, Maw
    thorn-window, Wyrm saddle+arrow — Ember Heart at **tick 7160, identical
    hash on every seed**. Attract mode runs it live, resets on win/death.
  - Harness 99→**114 gates** (15 new): doors w/ w/o key, bigkey, edges,
    sign, blade economics + boss-rule immunity, tuskroot phases, pod split,
    bot win/determinism/real-traverse. Mutation-proved: neuter the door
    transition → 4 red incl. bot win; restore → green. lint:mario/fps/ai +
    build green; Chrome leg zero page errors. Prod verified live
    (`tuskroot`/`EMBER BLADE` in the deployed lazy chunk).

## Lessons
- **Doors sit on `#` tiles** — the door check must precede `isSolidTile` in
  *both* `sim.blocked()` and `solver.openTile()`, or opened doors stay walls.
- A mutation that doesn't apply is worse than none: the perl one-liner
  silently no-op'd (assert `old in src` before writing — python heredocs).
- Sign decor must dodge the #786 diagonal-pinch sweep; pick `I` spots that
  don't create solid-diagonal pairs (town took two tries: 7,1→7,2, 1,5→2,5).
- Prod verify through jalfern.com: the proxy caches the shell HTML (vary by
  cookie, never `?cb=` — the rewrite eats queries and serves redirect stubs)
  and game code lives in its own lazy chunk — pair the lazy-import ORDER
  between local dist and prod entry to find the chunk hash. Always `curl -L`.

## Next goal
- #781 stays `building` (stage 3 in its steer): demo-bot grace (hit-and-run,
  not just point-and-shoot), charge-dust + split-pop FX, Wyrm tail quads,
  elder gift. Then the polish handoff note in its README's honest-gaps list
  is QA #752's backlog.
- `next`/game-queue: empty.

## Board / harness status
- main: `7b93e06` (ours + SSX #804). Nightly green pre-merge; no freeze.
  Rule 4 ok (game-code PRs both lanes).
- jonq lane:games: nothing AWAITING; nothing filed (no taste calls this pass).
- Open questions (#605): none for lane:games.
- QA lane owns: #752 EMBERWOOD polish (README gaps updated post-#803),
  #791 SSX (analog + slice 3 shipped; attract bed done), #747 STORM,
  #713 CREDITS, #695 CAMPFIRE, #702/#704 SHORE/OCEAN.
- Worktree `~/Dev/retrogames-forge-emberwood-stage2-781` + dev server 5177
  pruned at session end. Older stale worktrees (comet-drift family,
  qa-5xx/6xx/7xx) still on disk — housekeeping sweep worth doing.

## Open threads
- Remote branches for closed issues deletable by Jon's sweep:
  `forge/campfire-670`, `forge/ssx-cpu-riders-620`.
