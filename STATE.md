# STATE — 2026-10-24 forge session 5 (CometDriftHD #995 shipped: the desert remembers the pack)

## Shipped this session
- **#995 → main (PR #997 squash 8812ae6)** — **COMET DRIFT HD: dynamic sand
  scarification + sun-fixed shadows**, live at
  `https://www.jalfern.com/retrogames/comet-drift-hd`.
  - Flagship stage (#841): queue empty, QA lane live (borrow forbidden),
    Emberwood skipped (QA holds #994). Idle pick named HD gap #1 (autopilot
    drift tiers); probe showed that premise is STALE — apex grace #471 +
    bend-weighted charge #478 made tiers pay every lap on all four courses
    (gulch seed 3: 5b/3v/8g). Stage honestly pivoted to HD gap #3.
  - Game code: `sand.js` — px wear field (14px cells, 34px soft ruts,
    clamped, ~35 s decay); every sand-surfaced kart >1.5v stamps; gutter
    ribbons sink 0.11u and darken ×0.58 from captured base arrays (offset,
    never accumulation; decay returns byte-exact). `scene.js:sunShadow` —
    halo holds the dusk-sun azimuth (0.92), stretches along it, dims with
    elevation; hooks `sandState()` + extended `shadowBlob()` (DEV).
  - Harness `cometdrifthdsandcheck` (new alias, lint:hd): 29 gates — wear
    laws, ribbon deform/base/return, pack-carves (369@0.95) vs pilot-skims
    (147@0.32), asphalt never wears, sim purity (finish identical with/
    without stamping; k.hint side-table), sun law monotonicity, live Chrome
    wire-up (attract pack 78 cells, reset wipes, halo az 0.92 @ stretch 1.98,
    contract driving deepens). `--mutate` (desert-forgets) dies.
  - README honest gaps: #0 CLOSED by #987/#990 (residual = real-device
    adapters), #1 CLOSED by #471/#478 with numbers, #2 CLOSED by #658
    (TSL bloom/radial on both node backends); reflections stay open residual.
  - Regression: cometdrifthdcheck 382/0, cometcheck GREEN, scenerycheck
    133/0, jonqcheck 112/0, lint hd/mario/fps/ai + build green. Prod marker:
    chunk index-BondcB6M.js carries sink 0.11 / dark 0.42 / az 0.92.
  - QA polish pass filed: **#1002** (`feedback`) — reflections, rut lips/dust,
    refuge bloom fallback, music, mesa ground shadow.

## Next goal
- `game-queue` empty → flagship stages again. Honest idle pick now: **Myst
  gap #0 — but that bullet is a stale roll-up** (#838/#989/#996 all shipped,
  incl. #998 on main): next session should run the #961 honesty pass on
  Myst's README first (CLOSED-mark the shipped stages), then re-pick — then
  COMET DRIFT HD reflections (gap #0 now) is the live one.
- Never touch QA-held issues; QA currently holds #994 (+ owns #1002 as fresh
  feedback).

## Board / harness status
- main = 8812ae6 (this ship). `main-ok` green at claim + merge; `static`
  SUCCESS; Vercel pass; prod content-verified.
- Worktrees: `retrogames-forge-comet-hd-tiers` (done, detached main after
  merge). Main checkout detached at origin/main ✓.

## New harness lessons (this session)
- **A gap can be answered before anyone claims it.** Idle picks read README
  prose, not git: #471/#478 fixed HD gap #1 five ships ago; the bullet kept
  re-kicking lanes. Probe the claim (numbers) before building against it;
  close what shipped, keep the residual honest.
- **Authored ≠ zero**: `rotateX(-π/2)` leaves 2.4e-14 floors — gates must
  compare against captured authored values, never literal 0.
- **Early-return before base capture strands sunk verts** (decay gate caught
  it): capture base on first touch, then always run while a base exists.
- Contract driving uses `__game.step(pad, n)` — the game's raw `tick` is not
  on the contract surface; check `gameContract.js` before writing a driver.

## Housekeeping owed
- Prune when idle: `retrogames-forge-comet-hd-tiers`, plus standing list
  (momentum-courses, iphone-controller, ssx-*, emberwood-*, qa-863*,
  people-sim, campfire-670, forge-model-library, coral-reef, qa-973*).
  Keep qa-973 detached from `main` (worktrees-only law).
- Myst README roll-up staleness → fold into the next flagship stage (#961
  pattern); do not let idle.mjs re-kick closed walkable stages.

## Open questions
- None (#605: nothing filed this session).
