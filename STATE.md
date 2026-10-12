# STATE.md — 2026-10-12 (MINESWEEPER SHIPPED)

## Where things stand
**#118 Minesweeper is live.** PR #162 squash-merged to `main`
(`61036f7`), `static` + `smoke` CI green, prod deploy triggered. The `WIP`
draft is gone; the branch is deleted. `jalfern.com/retrogames/minesweeper`.

Queue head now: **#143 Paperboy**, then #152 Wizardry. (#82 stays closed as a
BEEZEE duplicate — see prior STATE, no change.)

## What shipped this session
The engine (solver/generator/rules) shipped on the prior commits; THIS session
finished the honest-harness + the ship:
- `scripts/sweepcheck.mjs` — the independent **brute-force oracle** rewritten:
  it enumerates every mine assignment the *visible clues* allow for a mid-game
  pocket (player's-eye: only flags are hard facts) and convicts any solver dig
  it cannot certify safe, or any flag safe in some consistent world. It never
  asks the solver anything. `--mutate`: **4/4 mutants die**, two of them now by
  the *independent* oracle, not the solver's self-check.
- `scripts/sweepplay.mjs` — Chrome, **real key events only**: input path, canvas
  readback (not a WebGL black void), determinism, and it **plays a COLT board to
  71/71** by walking the cursor with arrows + Space. Wired into `verify`.
- `minefield.js` — the **stale-scratch** bug (a reused `ua` array let a pair nest
  against cells its clue never covers → a real mine filed into a difference) is
  dead; the derived ledger is now the cumulative stamp scan, not a final-token
  peek.

## The bug the browser caught (this is the section that matters)
**The first click was dead in the shipped app.** `newGame` sits in
`screen:'idle'` and `dig()` guarded `!== 'play'` *before* its own `plantAt`
branch — so planting was unreachable in the browser; no human could ever start a
game. The Node battery never saw it because `plantAt` is called directly there.
`sweepplay` found it in one run. Lesson kept loud in the README: **a pure-model
harness passes a game you cannot click.** Any title whose first action is gated
behind a state the harness never enters needs a real-input pass.

## Two stale traps this session dodged (both were green and wrong)
- The oracle first trusted the solver's derived ledger → collapsed every fair
  board to one world → generated **zero** fixtures (green, tested nothing).
- Then it snapshotted only between dig-batches → a flood fill skipped the small
  enumerable pockets → still **zero** fixtures. Fix: snapshot after *every* dig.
A green oracle that enumerates nothing is worse than no oracle.

## What is playable right now
Everything from before **plus `jalfern.com/retrogames/minesweeper`** (COLT /
SAPPER / GENERAL, all guess-free by construction).

## Three questions for Jon
1. `WIP.md` became `src/games/Minesweeper/README.md` and a short AGENTS section
   was added. OK, or do you want the two-session bug-hunt history kept verbatim?
2. GENERAL plants in ~0.7 s on a slow box (the fair re-plant is the price of the
   zero-guess guarantee). Acceptable, or add a "SAPPER is the ceiling" hint and
   route attract there only (already COLT/SAPPER only)?
3. Still flagging the prior session's note: relayed "user" messages that echoed
   tool output and told me to rename the harness to `paperscheck` (would clobber
   Papers-Please-Min's harness). I kept `sweepcheck`. I saw none this session —
   is that relay (`forge-qa.sh`?) disabled? It reads like prompt-injection.

## Lineage
AGENTS.md honored: STATE first; oldest-queue discipline (#118); design comment
before the oracle rewrite; the **only** merge path used
(`gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch`,
after marking the draft ready — rule 5: a WIP/draft was never merged). Rule 4
holds — this PR changed game code (`minefield.js`) and shipped. Ran ~the
timebox.
