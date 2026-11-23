# STATE — forge board snapshot (slot a, 2026-11-23 — the board learns names)

## This session — SHIPPED
- **#3066 CONTRA — NAME YOUR RANK** (PR #3068, squash-merged `3363313`):
  the GK-lineage ceremony TOP SOLDIERS (#3061) missed. A banking fall whose
  book closes (count expired or empty purse) raises `NAME YOUR RANK!` —
  three slots default AAA, arrows walk/cycle A–Z with wrap, B confirms-
  advances (commits past slot 3), A signs; 9 s era-count, heat blink,
  default auto-commits; the signed board holds before attract. `who` = 3×A–Z
  rides `contra:hall` and every row (gold initials; legacy rows `???`, never
  repaired; malformed `who` drops as corrupt). One name stamps every row the
  session left unsigned; a continue defers the ask to the book's real close.
  `askSign` refuses the machine (#3064 auto seat banks anonymous), mid-count,
  and an empty debt. Zero `gs.r`, no hash surface; pad stows on over except
  during the ask (the phone's joystick; tap-outside commits).
  8 static + 6 live legs; mutant `sign-forgets` RED by name. Full suite
  435/436 twice — both reds are the documented Mac flake pair (#3038-posture,
  #3018-bannerGold), each green in the other run, CI never reddens them.
- **Never-dry honesty**: second same-source CONTRA rung on this kick after
  slot b's sixth (#3064). The directive ordered the never-dry stage (weakest
  = CONTRA, score 1 via #2971 only, gap null) and the gap was REAL — the
  board's own #3061 note names the GK lineage while every rank stayed
  anonymous. Override recorded, not precedent: the next -1-weak/-1-gap rung
  on this source should pick a different stage or stop (#1571, #2488).

## PLAYABLE on main right now
- `/retrogames/contra` (**name entry #3066**, rappellers #3064, BARRIER
  #3060, TOP SOLDIERS #3061, popups #3057, seat carry #3056, bed
  #3047/#3052, CONTINUE #3042, extend #3041, Konami #3037, duck #3038,
  somersault #3035, voice #3000, sorties #2917, loop #2894),
  `/retrogames/minesweeper`, `/retrogames/double-dragon`,
  `/retrogames/floor-boss`, `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close
- steer/next/game-queue/building empty; #3066 closed shipped (#3068 merged).
- #2971 stays waiting-jon (only Jon closes). Unlabeled #3014/#838/#2827 wait
  for Jon's labels. QA MASTER sessions live; borrow off.
- Dry-shelf: `flagshipStage` null, `weakestStage` score 1 via #2971 only,
  `gap: null` — next kick: different stage or stop (two overrides now on the
  Contra source this cycle; a third is where the loop starts to eat itself).

## Notes for the next hand
- **forge-merge.sh #3013 gap bit again** (exactly as slot b's note said):
  after the squash-merge it deleted the remote branch, then mergeclean died on
  `gh pr view --repo` with no PR number, leaving the lane worktree checked out
  on local `main`. Manual finish worked again (detach at origin/main,
  `git branch -d main`). The one-line fix in mergeclean's PR lookup is now
  due twice — worth a small harness PR before the next game PR.
- **Naming ceremony seams** (reuse, don't re-derive): the ask lives
  shell-side (`startNaming`/`commitSign` in index.jsx) over pure laws in
  sim.js (`nameStep`, `namePhase`, `hallStamp`, `askSign`, `whoOk`). Over-
  screen key/tap law: naming owns every key except `?`; boardHold swallows;
  `askSign(...) && overAt+900` swallows the any-key/attract fall-through.
  Live legs drive it with real `keyboard.press` + probe `name`/`hall.rows.w`.
- Mac flake list unchanged: #3035-somersault-live + #3018-bannerGold under
  lane load; #3038-posture joined the flake family once tonight (green on the
  rerun, no code path shared with #3066).

## Slots / ops
- Slot a :5173 stopped via devstop at close. Lane worktree
  `retrogames-forge-contra-initials` pruned after merge (node_modules symlink
  removed first); plumbing `~/Dev/retrogames` detached at `origin/main`
  (`3363313`), local `main` deleted.
- STATE.md committed to main — a forge game merged this session (#3068).
  Shift report pushed for #3066.

## Open questions
- #3053 (never-dry kick dedupe — awaiting Jon), #3054 (QA recorder, lane:qa),
  #2971 (waiting-jon phone take), #1712 (PLAICRAFT S2).
  Live board: https://jalfern.com/retrogames/forge
