# STATE.md — 2026-10-12 (ARENA ARCHERY session end)

## Where things stand
**#78 GAME 14 — ARENA ARCHERY IS LIVE at jalfern.com/retrogames/arena-archery**
(PR #158, squash `d409794`, `shipped`, issue closed; prod lazy chunk
`index-BZWZTe5E.js` fetched from jalfern.com and grepped for the engine's
own arena names — CROSSGLOVE/KNOCKBACK/nock. Arcade lists 34 titles.)
**Next session: claim #79 WWI Dogfight 3D** — oldest `game-queue` entry
(`gh issue list --label game-queue` by createdAt; then #82 BensMagicBugLife,
#118 Minesweeper, #143 Paperboy, #152 Wizardry). No `next` label exists.

| this session | what |
|---|---|
| #78 / `forge-archery` | Built from zero: `sim.js` pure 30 Hz `step` (zero random, **P1-then-P2 stamp every tick**), two-angle ballistic solver (45° closed form + flat-drop + exact `predictHit` forward-sim); `levels.js` two box arenas, jump apex pinned to 2 cells (= jump²/2g); `index.jsx` attract = `recordMatch` witness through the real `step`, 1P/2P, second touch pad. |
| harnesses | `archerycheck` 93 checks + **6 mutants, wired into CI `--mutate`** (stick/knockout/pull/arrowGravity/float/shortClock — all die); `archeryplay` 18 Chrome real-key checks, green locally AND on the CI smoke runner. Gates: `lint:archery` + `archerycheck --mutate` static, `archeryplay` smoke. |

## What is playable right now
- jalfern.com/retrogames/arena-archery — arrows stick as terrain, pull-back
  economy, 45° lobs; autopilot wins both arenas (~22–53 s) in the attract
  loop; slack (quiver−1 AND foe gifted first point) still wins 3-1.
- Arrow ledger exact EVERY tick in sim and browser:
  `quivers+fly+stuck+hit+lost == total+resupply`.

## What changed this session (the parts that matter next time)
- **A jump must not eat the nock.** Jump-and-release share a tick: the
  release branch originally skipped the loose, which (a) ate the player's
  arrow and (b) silently dropped the fire from the recorded cmd stream —
  the browser replay then "diverged" while the engine was deterministic.
  The draw is now ONE state machine and `firing` is cleared exactly when
  the loose happens. Any game with hold-then-release inputs: if the release
  can share a tick with another verb, the loose lives at the top of the tick.
- **Replay parity means tick parity**: live applied commands stamped
  `< tick` and stepped once per tick, so the twin stops AT `tick` — an
  off-by-one tail over-ticks and the hash (which includes tick) differs.
  (Lode needed a `+1` tail; archery needs `+0`. Derive it from how the
  game stamps its end, don't cargo-cult the previous title.)
- **Sky censuses are not receipts.** `archeryplay` asserts "your arrow
  loosed" by arrow **id** (`owner===0 && !seen.has(id)`), not by counting
  flying arrows — the bot has arrows up there too. Same lesson as lode's
  pound: count the thing the actor owns.
- **LOS lies for arcs** (first sim pass): a straight sight-check passed
  while the 45° bulged into a ledge underside and the bot shot its own
  cover. `predictHit` (real integrator + terrain + stuck arrows) replaced
  it. Any aiming bot must forward-sim, never raycast straight.
- **A knockout probe needs a mid-air crossing**: arrows resting in one
  cell replace each other under any rule, so the no-knockout mutant is
  equivalent unless the test arc crosses a stuck arrow mid-air.
- Slack reached parity only after respawn resupply (+2, capped by
  `quiverMax`, tracked in `supplied`) — an empty-quiver corner was
  otherwise un-winnable and the clock, not the autopilot, decided.

## Gates (all green at merge, PR #158)
lint:mario/fps/ai/archery ✓ · `archerycheck` 93/93 + 6/6 mutants (CI runs
`--mutate`) · `archeryplay` 18/18 local AND smoke ✓ 4m28s · static ✓ 1m26s
· build ✓ · prod 200 + engine strings found in the live chunk.

## Next (for the next session — do NOT re-debug these here)
1. Claim #79 WWI Dogfight 3D (three.js — see RaccoonHeist for the 3D
   conventions, CELL-scale thinking, `?lite=1` CI path). Its harness needs
   a 3D analogue of "pixels vs the sim": projected screen-space position vs
   world position, and biplane ballistics get the same
   solve-then-forward-sim treatment as archery's `predictHit`.
2. Arena Archery is shipped — do not polish. Honest gaps in
   `src/games/ArenaArchery/README.md` (2P has no driven harness; bot doesn't
   climb ledges deliberately). If `archeryplay` flakes on CI, widen the
   WINDOW, never the assertion.
3. Queue keeps growing (#143 Paperboy, #152 Wizardry filed since). Same
   drill: claim oldest, design comment first, one game, harness that can
   fail, merge only via `--watch --fail-fast` then squash.

## Three questions for Jon
1. `archeryplay` passed CI smoke first try — promote the smoke job to
   automatic on PRs for games whose drivers ran green twice locally, or
   keep it manual until headless audio is sorted (the old reason)?
2. Two browser drivers now hunt "pixels vs state" differently (lodepaint
   region census, archery id-tracking). Worth a `scripts/lib/pixels.mjs`
   shared helper before WWI Dogfight starts drawing on a 3D canvas?
3. #79 WWI Dogfight is three.js and three-axes aim — the virtual-pad
   contract bends there (pitch+roll on one stick). Descope to pitch+yaw
   with roll cosmetic, or extend VirtualControls with a twin-stick mode
   first?

## Lineage
AGENTS.md honored: read STATE first, one game (#78, oldest queue head),
design comment posted before code, checkpoint pushes with issue comments,
harness proven able-to-fail (6/6 mutants IN CI), merge only via
`gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch`
(clean this time — main was not locked), prod verified from the live
bundle, STATE via PR. Rule 4: nine straight sessions touching
`src/games/**`. Ran ~3h — at the box edge, shipping beat polishing.
