# MINESWEEPER — WIP session notes (2026-10-12)

## What exists here
`minefield.js` — the pure board module: generator + rules + zero-guess solver.
`index.jsx` NOT started; nothing registered in games.js; no harness aliases yet.

## What was proven
- Three-rule fairness model (single-square / subset-pair / chord-as-shortcut)
  generates boards at ALL three difficulties with zero forced guesses and
  passing the SLACK gate (boards must close with CHORD forbidden). bad=0 on
  a 24-seed battery after the hill-climb repair replaced rejection-resample
  (which needed ~500 reshuffles/board, 8s+).
- Two referee bugs found and fixed; the second is the lesson:
  **the fairness gate and the generator run the SAME solver — when the
  subset rule was unsound (it subtracted mines from a set that had already
  filtered mines out, making every dm the raw clue delta), the gate
  certified boards the autopilot then lost on.** The referee corroborated
  its own lie. Fix: the solver now THROWS when it derives a mine as safe
  or a safe cell as mine — the referee can no longer lie quietly.

## Open bug (why this is WIP, two symptoms, likely one root)
1. Autopilot soft-locks one safe cell short on ~1/3 of boards:
   seed class `(4242 + 9*104729, COLT)`: fresh solve says zero-guess win;
   after digging the derived plan one cell at a time, the state with
   strictly MORE open cells refuses the derivation and a true 50/50 pair
   (clues (1,0)+(1,1) over {(0,0),(0,1)}) remains. Divergent verdicts on
   states that should be monotonically easier mean an unsound step lived
   in the fresh chain that the (now-throwing) safe-check didn't catch
   because the derived cell happened to be safe — the throw fires only on
   the wrong-verdict lands ON a mine.
2. Seed class `(4242 + 38*104729, GENERAL)`: single-mines fires on
   clue (11,4)=1 with exactly ONE covered neighbor (12,4), and mines[]
   says (12,4) is safe. On a consistent board that rule is infallible,
   so clue[] and mines[] were desynced at that moment — either the
   generator left clue[] stale after a mutation, or the solver's GUESS
   path (which opens cells without the mine guard) desynced its own
   view: the guess branch sets `open[pick]=1` on a possible MINE and
   keeps solving, and every later cov/clue count through that opened
   mine is then wrong.

## The fix I believe in (next session, ~30 min)
Guesses are forbidden by definition — the solver must RETURN the stuck
state, not push through it. Delete the guess branch's "dig and continue":
when derivation stalls, stop, report `guesses` and `stuck`, never open a
cell. That kills both symptoms if the root is the guess path (and it
removes the only place open[] diverges from mines[]). Re-run the 60-seed
battery script (kept at scripts/.shots/NOTE: was in /tmp/ms-battery —
recreate from the loop in this note) after the change; the expectation is
stuck=0 AND thrown=0 AND plant ms avg < 300 per difficulty.

## Repro
```
node -e "import('./src/games/Minesweeper/minefield.js').then(({newGame,plantAt,solve})=>{
  const g=newGame(2,4242+38*104729); plantAt(g,g.w>>1,g.h>>1);
  try{ solve(g,{subset:true,chord:false}); console.log('no throw?!') }catch(e){console.log(e.message)}
})"
```

## Also learned (worth a line in the eventual README)
- board sizes/densities: COLT 9x9/10, SAPPER 16x12/18, GENERAL 22x13/26
  (~12% density; the 20% classic expert density does not close
  zero-guess under the slack rule at any generation budget we tried).
- mulberry32 state is serializable in `s.rngState`; determinism of
  (seed, firstClick) is the contract the harness will lean on.
