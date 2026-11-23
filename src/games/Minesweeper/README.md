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

`sweepcheck` (Node, in the CI `static` gate) has five anchored mutants, each a
previously-fixed bug put back. All five die, and **two are caught by an
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

## The chord that ate its own flags (#3009)

`chord()` used to open **all** covered neighbours of a satisfied clue — flags
included — so a *correctly* flagged mine detonated under the click. It claimed
fidelity ("flags are a claim, not a shield") while contradicting both the
original and this module's own solver, whose chord rule reads `!s.flag[c]`.
The original's chord clicks covered **unflagged** cells only: correct flags are
never fatal; wrong flags kill the original's way — they satisfy the clue while
the real mine sits unflagged, and the chord opens *that*. `sweepplay` caught it
at `end=dead opened=71/71` (every flag on a mine, board swept, bot dead — #3008;
repro 2/10 locally), and the engine now skips flagged cells. sweepcheck anchors
both original cases (correct flags shield, wrong flags still kill through the
unflagged mine) plus the post-win lock (#3008's ready-made assertion: a fully
swept board is WON the instant `opened` hits the safe total, and every verb is
refused after it). Lesson: when the engine and the referee disagree about a
rule, the referee was written first for a reason — but the ORIGINAL decides
which one was wrong.

## The rejection that teaches (#3011 — QA polish on the chord shield)

The shield shipped (#3009); this pass made players *understand* it.

- **The tap path was deaf to its own no.** `actDig` re-computed chord
  satisfaction before calling `chord()` — and when the ring was short, it
  fell through to `dig()`, whose generic dry-dig blip was the only sound a
  phone player ever got. The engine's distinct nope (with its deficit) was
  unreachable from real input. Now every tap on a live clue goes to
  `chord()`; the engine owns the verdict, the shell owns the sound.
- **Rejection says WHY.** The chord's nope event carries `deficit` (missing
  flags), and the shell paints it as amber pips under the clue for ~0.8 s,
  blinking with the cursor's beat. The nope tone moved from 0.03 (the
  quietest sound on the board — under phone volume it read as silence) to
  dig level. `sweepcheck` pins the event (exactly one nope, correct deficit,
  nothing opens); the `mute-deficit` mutant — a bare nope — dies in
  `probeMutant`'s chord fixture.
- **One burst per strum.** A chord freeing several zero-regions stacked one
  flood sweep per region in the same tick — a machine-gun stutter on phone
  speakers. `handleEvents` now collapses a drain's floods into a single sweep
  (sum of dug still rides the pitch; single floods keep their exact old voice).
- **`?` is a note, not a claim.** The three-state park (#1883) painted
  `#9fb0e8` — as bright as a flag — and phone players counted it into
  chords, which the engine has never read (`s.flag` decides). Now `#77819f`,
  darker and grayer than the flag red.
- **Post-win silence is pinned refused-but-quiet**: refused verbs push *no
  events*, so no dry-dig blip can stack over the fanfare while the flag
  march owns the screen (`sweepcheck` g6 block).
- The first-dig toast wording (`FLAGS PROTECT YOUR CHORDS`) is a taste call —
  proposed on #3011, not shipped blind.

## The counter that counts negative (#3021)

The original's VFD mine counter keeps counting **into the negatives** when the
player over-flags (−05 = five flags wrong somewhere) — a game-wide warning the
original never hid. Our HUD painted `Math.max(0, totalMines - flags)`, so the
warning silently vanished at 000 while the engine (`s.flags`) had counted
honestly all along. `mineCounter(s)` now lives in `minefield.js` next to the
counts it derives from — signed, floor −99 (the 3-glyph display's leftmost
representable value, like the original's hardware readout), pure read: no
events, `stateHash` untouched. `drawNum7` gained a minus glyph in the same
7-segment stock (positive renders byte-identical). `sweepcheck` pins the sign,
the −1 signature, the floor and the purity; the named mutant `counter-clamp`
(the old clamp back in the rule) dies in `probeMutant`. `sweepplay` over-flags
through the shell's own flag verb and reads both the value (probe) and the
pixels (the minus must light the leading glyph slot). Over-flagging stays legal
— it always was; now the counter says so.

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

## Minesweeper

**MINESWEEPER** (`/minesweeper`) is the arcade's logic-only title: three
difficulties (COLT/SAPPER/GENERAL), every board **guess-free by construction** —
the generator ships a board only after a solver playing *just the rules the
player learns* (single-square + subset-pair, chord as a strippable shortcut)
proves it closes with zero forced guesses, then re-proves it with chord
**forbidden** (the slack gate). Cursor + tap play, attract autopilot.

The one contract that keeps it honest: **the solver is the gate, so the solver
must not be its own referee.** Two solver lies found and killed; the browser
harness then found a third the Node battery structurally could not see (a first
click gated behind `screen:'play'` that `dig()` itself was refusing to set —
planting was unreachable in the app, while `plantAt` called directly passed every
Node check). Full notes — the stale-scratch bug, the oracle that had to stop
trusting the solver's ledger to become able to fail, and the two green-tested-nothing
oracle versions — are in **[`src/games/Minesweeper/README.md`](src/games/Minesweeper/README.md)**.
Verify with `npm run sweepcheck` (`-- --mutate` = 5/5 mutants die, incl.
`flag-devour` — the #3009 chord bug put back; in the `static` gate) and
`npm run sweepplay` (Chrome, real keys only; in `verify`).

## WATCH (#1637 batch 16) — the referee sweeps its own field

Y / the ▶ WATCH pill seats the fairness gate's OWN autopilot: `nextDigs` is fed
into the real dig path (`actDig`, auto-chord intact) every sim tick, cursor
first, one dig per 6 ticks. The first action digs the center — the original's
guaranteed-safe click and the spot `plantAt` certifies the board around — so the
route is honest from tick one: the gate proves every board closes zero-guess
under exactly this solver's rules (subset-core, chord-forbidden), and
`sweepcheck`'s seq-play witness says the same rules win for real. A mine under
the seat is therefore impossible unless the referee lied; the watchcheck pilot
asserts it (`end !== 'dead'` while seated, FIELD SWEPT by the ceiling). Any
driving key or canvas tap hands back with the shared blips (the player's own
dig lands too); the win releases the seat silently (racer rule). The seat never
flags — flags are the player's claims, and the win condition never needed them.

Verify: `npm run watchcheck -- --only minesweeper` (207 gates incl. 9 source
pins; mutant: cut the seat feed -> exactly 6 red).
