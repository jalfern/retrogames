# STATE — forge board snapshot (slot a, 2026-11-23 — shipped)

## This session shipped
- **#3041 CONTRA — the cabinet's score extend → PR #3043 → main `1e6bc19`,
  prod-verified.** Never-dry stage (`KICK CONTRA -1 weak`, second pass on the
  #2971 waiting-jon artifact; flagship spent; README gaps all CLOSED) — gap
  scoped live from the cabinet: the run could score forever and never earned a
  life. Crossing `gs.nextExt` pays **+1 to the shared pool**: first mark
  **30,000** (Konami-manual extend), then every +50,000 (repeat rung recorded
  as era-typical per the #237 fidelity rule — not documented in the repo).
  Referee-clean: check sits at the HEAD of `step` (before the death-freeze
  return — a kill that crosses while frozen still pays its life), zero `gs.r`
  (paid/unpaid twins advance the seed identically — pinned), `nextExt` rides
  `stateHash`, arcadeLoop **carries the mark with the score** (a paid rung is
  never re-sold at the boundary). Cap 99: at the cap the mark advances and no
  salute is owed. Byte stability pinned: honest loop-1 clears top out at 19,900
  < 30,000, so every pre-extend seed/twin/pin/dataset byte stands. Feel: gold
  `EXTRA LIFE!` plate on the salute band (y 58..76, shares the Konami band,
  guards it), #2902 heads-row gold flash re-used, three-note sting, attract
  teach line both copy sets, DebugKit `ARM EXTEND`. Proof: contracheck
  **303/303** (8 sim + 3 live legs), mutants **196/196** — `extend-deaf` &
  `carry-blind` die by name; 3 scoped lints + build + contract + dataset green.

## LAW / seam notes the next hand must know
- **The extend check must stay at the head of `step`** — parking it after the
  death-freeze return delays a crossed life by one freeze and breaks twin
  determinism at that boundary.
- **Extends are unconditional +1 up to 99** (no bank) — unlike the loop
  courtesy (banks to 5, pools >5 carry whole, #3037). Any future pool
  assertion must know three ways a life lands: courtesy, Konami-at-attract,
  extend-mid-run.
- **`setup({ score })`** is now a DEV seam (#3041) — plus probe fields
  `nextExt`/`extFx`. Live kill-cross leg runs on `reset(99)` + held
  ArrowRight+KeyX: the first kill lands well inside 20 s — deterministic.
- Loop-2 via chained `arcadeLoop` can stall on some seeds while
  `makeGame(seed, 2)` sweeps 12/12 — pre-existing on main, NOT a gap this
  stage touched; sweep at `makeGame(seed, n)` like #2894 does.

## PLAYABLE on main right now
- `/retrogames/contra` (+ score extend #3041, Konami 30-lives #3037, duck
  #3038, somersault #3035, voice #3000, radio teach #3016),
  `/retrogames/minesweeper`, `/retrogames/double-dragon`,
  `/retrogames/floor-boss`, `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close
- `game-queue`/`steer`/`next`/`building`/`building-qa`: all EMPTY. `feedback`:
  only #2971 (waiting-jon — needs a real phone take). No jonq open, no halt.
- `idle-kick` will STILL answer `CONTRA -1 weak`: the score is #2971 naming
  Contra — a waiting-jon artifact, unchanged by this merge. Do NOT re-file
  shipped work (extend #3041, Konami #3037, duck #3038, somersault #3035,
  MG/carrier/gate layers…). The big honest next rung for Contra is content
  (stage 2 — the cliff/base), which is a new-stage question, not a gap.
  Unlabeled **#3014** (attract teaches the voice orders) still waits for a
  ladder label — unlabeled = no lane may adopt it.

## Harness notes (carry-overs + new)
- forge-merge.sh #3030 read-fail shape THIRD session running: merge succeeded,
  wrapper `gh pr view` lost its arg. Exit criterion stays = PR's own state
  (MERGED, confirmed via `gh pr view 3043 --json state`); remote branch was
  already deleted by the script; the wrapper left the lane worktree checked out
  on `main` — re-detached by hand (`git checkout --detach origin/main`).
- Prod-verify path that works: index.html → `index-*.js` entry →
  `grep -o 'Contra-[A-Za-z0-9_-]*\.js'` inside the entry → fetch that chunk →
  grep `EXTRA LIFE`. The route HTML never names the lazy chunk itself.
- Headless paint ~12 fps law: poll frames (any-frame + max), never single
  shots. Live golden path (kill-cross + gold plate pixels) passed 1/1 run.

## Slots / ops
- Slot a port 5173: dev server stopped via `scripts/devstop.sh` at close ✓
  (never pattern-kill). Plumbing `~/Dev/retrogames` detached at origin/main ✓.
  Lane worktree `retrogames-forge-contra-extend` detached at origin/main
  (clean; node_modules is a symlink to plumbing's — purge takes the symlink
  before any dir).
- STATE.md committed to main this session (#3043 merged game code).

## Open questions
- None (no jonq filed this session). Live board:
  https://jalfern.com/retrogames/forge
