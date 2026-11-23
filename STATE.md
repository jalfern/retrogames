# STATE — forge board snapshot (slot b, 2026-11-23 — the gorge answers back)

## This session — SHIPPED
- **#3064 CONTRA — the gorge's rappellers** (PR #3065, squash-merged
  `8994a18`): falls-only rope law. Three stations (x 44/196/340) on a
  seed-keyed wheel, one man on the wire at a time (courier/sortie law
  verbatim), `slide→hang→cut|retire` state machine on the soldier. He IS a
  `hold:true` falls gunner (fairness by identity — hop/duck/ring all answer
  him with zero new rules), never fires straight down (`rapGate` 24), fixed
  rearm 110/lk, 3 rounds a ride, 120 empty-band ticks and he retires. The cut
  pays the turret tier (+300) at the single `killSoldier` chokepoint and drops
  him ALIVE — drown at the torrent line or rifle-gunner recruit on a ledge his
  fall crosses (`rapLandMin` 28). Zero `gs.r` (jitter `(seed·37+rapN·61)%110`,
  gap by the #2917 `sortieK` half-ramp); schedule + rider ride `stateHash`.
  13 new sim legs + 2 live legs; mutants `rap-cheap`/`rappel-blind` RED by
  name; 12/12 autopilot sweep with the wires live, twins hash-identical.
  Full suite 421/421, mutant run 216/216.
- **Never-dry honesty note**: this was the SIXTH same-source rung on the
  current kick; slot a's STATE had called a sixth a STOP shape. The session
  directive explicitly ordered the never-dry stage (weakest = CONTRA, score 1)
  and the gap was real (no rappel anywhere in code, README or registry), so it
  shipped — but the override is recorded here, not precedent: the next
  -1-weak/-1-gap rung on this source should pick a different stage or stop
  (#1571, #2488).
- PROD verified: `assets/Contra-BcXcQj6M.js` carries the rope schedule, the
  `rapdrop` whistle and the attract line; https://jalfern.com/retrogames/contra
  live. #3064 closed shipped.

## PLAYABLE on main right now
- `/retrogames/contra` (**rappellers #3064**, BARRIER #3060, TOP SOLDIERS
  #3061, popups #3057, seat carry #3056, bed #3047/#3052, CONTINUE #3042,
  extend #3041, Konami #3037, duck #3038, somersault #3035, voice #3000,
  sorties #2917, loop #2894), `/retrogames/minesweeper`,
  `/retrogames/double-dragon`, `/retrogames/floor-boss`,
  `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close
- steer/next/game-queue/building empty; #3064 closed shipped (#3065 merged).
- #2971 stays waiting-jon (only Jon closes). Unlabeled #3014/#838/#2827 wait
  for Jon's labels. QA MASTER sessions live; borrow off.
- Dry-shelf call stands six deep tonight (#3056/#3057/#3061/#3060/#3064 +
  slot a's count). `flagshipStage` null, `weakestStage` score 1 via #2971
  only, `gap: null` — next kick: different stage or stop.

## Notes for the next hand
- **Live-leg honesty (new harness seam, `opts.auto`)**: a hero standing in the
  falls DROWNS (the torrent ratchet ignores i-frames — the game's own law, and
  correct), and Contra fires on the keydown edge, so held-key live legs are
  fiction. Contracheck's cut leg now hands the seat to the honest autopilot
  (`setup({auto:true})`) and proves the kill by identity (watched `rap:3` +
  purse). Reuse this shape for any falls-phase live leg.
- **Plant anchor drift**: #3064's `rapGate` split the gunner fire-condition
  across two lines and silently broke the pre-existing `lob-hall` mutant anchor
  (surfaced only at mutant-run time). When you widen a condition a plant sits
  on, run the anchor scan before the full mutant suite.
- **forge-merge.sh gap (#3013 family)**: after the squash-merge it deleted the
  remote branch, then `mergeclean` died on `gh pr view --repo` without a PR
  number, leaving the lane worktree checked out on local `main`. Manual finish
  worked: detach lane at `origin/main`, `git branch -d main`, verify the
  plumbing checkout detaches clean. Worth a one-line fix in mergeclean's PR
  lookup.
- Mac flake list unchanged: #3035-somersault-live + #3018-bannerGold under
  lane load; both green on tonight's runs, CI never reddened them.

## Slots / ops
- Slot b :5178 stopped via devstop at close. Lane worktree
  `retrogames-forge-contra-rappellers` pruned after merge (node_modules
  symlink removed, plumbing checkout untouched); plumbing `~/Dev/retrogames`
  detached at `origin/main` (`8994a18`).
- STATE.md committed to main — a forge game merged this session (#3065).
  Shift report pushed for #3064.

## Open questions
- #3053 (never-dry kick dedupe — double-kick evidence posted; awaiting Jon),
  #3054 (QA recorder, lane:qa), #2971 (waiting-jon phone take), #1712
  (PLAICRAFT S2). Live board: https://jalfern.com/retrogames/forge
