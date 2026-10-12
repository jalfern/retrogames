# Minesweeper

`/minesweeper` — the arcade's logic-only title. Three difficulties
(COLT 9×9/10, SAPPER 16×12/18, GENERAL 22×13/26, ~12% density), every board
**guess-free by construction**: the generator only ships a board after a solver
playing *only the rules the player learns* proves it closes with zero forced
guesses — and re-proves it with the shortcut (chording) **forbidden**, the
slack gate. Cursor-play (arrows/WASD + Space to dig/auto-chord, `B` to flag),
tap-to-dig on the canvas, attract autopilot, `?` pause, mobile pad.

## The contract that keeps it honest

The solver is the gate, so **the solver must not be its own referee.** That
line is the whole design, and every bug this title has had is the game crossing
it.

- `minefield.js` is pure `(state, input)`: generator, rules (`dig`/`flag`/
  `chord`/`step`), the zero-guess solver (`solve`), the attract autopilot
  (`nextDigs`), and `stateHash` for the determinism check.
- **Every derived cell carries a witness.** `plan` entries are `{x, y, rule}` —
  `single-mines` / `single-safe` / `subset-mines` / `subset-safe` / `chord`. A
  dig with no rule is a bug the witness audit catches.
- **The solver throws when it derives a lie** (a mine proven safe, or a safe
  cell proven mine). An earlier version certified boards the autopilot then
  lost on, because the fairness gate and the generator ran the *same* unsound
  subset rule and corroborated each other. The throw is the fix: the referee
  can no longer lie quietly.
- **Guesses are forbidden by definition, not by cheating.** When derivation
  stalls, `solve` returns the stuck state and counts a guess; it never opens a
  cell it did not derive. An earlier guess branch opened a *possible mine* and
  kept solving, which desynced `open[]` from `clue[]` and poisoned every later
  derivation — the exact `single-mines fired on a safe cell` bug. Stopping is
  the fix, and the generator repairs toward solvable rather than guessing.

## Stale-scratch is a class of bug (the second referee bug)

The subset rule reused one scratch array (`ua`) across every clue in a pass, so
cells from the *previous* clue kept a fresh membership mark: a pair "nested"
against cells its own clue never covered and filed a real mine into the
difference. The brute-force oracle caught it (`dm=1` vs a two-cell diff). The
lesson is general: **a scratch array wants one owner per iteration**, and a
"reuse to avoid allocation" micro-optimisation is a correctness cliff unless the
reset is on the same line as the loop header.

## The harness can fail — and one that can't is a lie

`sweepcheck` (Node, in the CI `static` gate) has four anchored mutants, each a
previously-fixed bug put back. All four die, and **two are now caught by an
independent oracle, not the solver's own assertion:**

The oracle enumerates every mine assignment the *visible clues* allow for a
mid-game pocket (player's-eye — only the flags are hard facts) and convicts any
solver dig it cannot certify safe, or any flag safe in some consistent world.
It never asks the solver anything. Two earlier versions generated **zero**
fixtures: the first trusted the solver's derived ledger (collapsed every fair
board to one world); the second snapshotted only between dig-batches, and a
flood fill opened whole regions and skipped the small enumerable pockets. A
green oracle that tests nothing is worse than none.

`sweepplay` (Chrome, **real key events only**, in the `verify` suite) grades
what Node cannot see: the real input path, canvas readback (not a WebGL black
void), determinism, and it **plays a COLT board to 71/71 by walking the cursor
with arrows and pressing Space**. This is the harness that caught the shipped
**first-click-was-dead** bug: `newGame` sits in `screen:'idle'` and `dig()`
guarded `!== 'play'` *before* its own `plantAt` branch, so the browser could
never plant its first click — a game no human could start, that a pure-model
battery passed because it calls `plantAt` directly.

## Conventions / gotchas

- The solver is fast but not free: GENERAL can plant in ~0.7 s on a slow box
  (the fair re-plant is the price of the guarantee). Attract mode stays on
  COLT/SAPPER so the marquee never stalls mid-shuffle.
- `(seed, firstClick)` determinism is the contract both harnesses lean on; the
  first-click 3×3 is guaranteed mine-free.
- `nextDigs` (attract + the harness driver) uses the CORE rule set only —
  single-square + subset, no chord — so the demo can never show a shortcut the
  gate did not certify.

Verify: `npm run sweepcheck` (and `-- --mutate`) for the engine,
`npm run sweepplay` for the browser.
