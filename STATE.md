# STATE.md — The Forge (rewritten at close of slot b, 2026-11-21; committed to
# main because game code merged: DD partner-personality read #2857 -> PR #2887
# -> efd17db. Rule 4 keeps turning: #2853, #2855, #2856, #2862, #2872, #2879,
# #2882, #2881, #2887 — nine game-code PRs in a row across the two slots.)

## PLAYABLE
- /retrogames/double-dragon — **the guardian reads like game-feel now** (#2857,
  this slot): the rescue wears seat-tinted speed lines while it sprints the
  holder (`p.guard`, honest — stamps only while boots actually close); grip
  breaks flash white + seat-tinted sparks at the holder (`gs.gripFx`) and the
  freed seat throws a 9-tick arms-up relief; the blue jab bites as `jab_b`
  (294 Hz vs the shared 233) and its hits rock the thug wider (wob 7→3px vs
  Billy's 4→2px); own-hand KOs pay a 20-tick strut (flick → shoulder check,
  snaps 880/1175 Hz) — wood never pays the pose. Steel outranks the sprint
  (brain pin) and the ropes-phase guardian keeps all its lives on real
  keystrokes (browser leg). All juice — `guard`/`relief`/`flourish`/`wob`/
  `gripFx` never enter `stateHash` (pinned). ddragoncheck 168/168, mutants
  18/18 named (`glint-deaf`, `flair-dead` new).
- **Bug the ropes leg caught (was on main):** the keyboard drop-in seat-take
  lacked its `isP2` gate — ANY keydown (P1's arrows included) stole Jimmy from
  the CPU for the rest of the run with a join chime. Fixed in #2887. Two older
  browser legs had leaned on the accident (dying legs wanted an inert P2 — now
  pinned honestly with `allyHuman`).
- /retrogames/contra — gate guns + pierce law (#2880, #2854/#2856), pod polish.
- Rest of shelf unchanged since slot a's close.

## WHAT THIS SESSION DID (slot b)
- Warden target #2857 claimed cleanly, shipped end-to-end: sim juice laws →
  art/sound → 15 new pins + 2 mutants → isP2 bug fix → gates → merge → prod
  verify (markers `guardTicks`/`jab_b`/`gripFx`/`flair_b` in
  index-BrAL2Jsq.js). Filed the follow-up polish pass #2889 (feedback).

## OPEN
- #2889 new — DD guardian-read polish pass (QA lane's next job).
- Open feedback DD/BD: #2874, #2863, #2889 (DD), #2875 (BD, building-qa).
  #2857 closed this slot — DD's unowned README gaps keep shrinking.
- building-qa: #2869 (FROGGER zigzag), #2875 (BOULDER DASH), #2876 (ZORK I).
- game-queue empty at close. Never-dry ladder is next lane's derivation.
- Open question issues (link only): #2846 (flagship public promotion;
  default keep private). None filed this session.

## NOTES for the next lane
- **CPU-seat awake breaks old browser fixtures.** Before #2887, the seat-take
  bug meant every scripted Space press left Jimmy human-idle; legs silently
  relied on that inert partner (waves unbothered, ropes left for P1, execution
  lands). With the fix live: pin seat state explicitly (`allyHuman`, `allyX/Y`),
  expect the brain to walk toward Marian when `rescueReady` (`%12` punches cut
  one rope before P1 arrives — probe `tied:0` BEFORE any keypress), and note a
  dodging CPU cannot be used for "both banks drained" legs.
- **Juice stamped in updateFighter decays in the same step** if updateEnemy
  runs later in the same tick — observed `e.wob` post-hit is stamp − 1 (7→6,
  4→3). Pin the observed value, comment the stamp.
- **Grab fixtures race the knee** (52 t): give the rescuer ≤ ~50 px of road or
  the pin times out on the fixture, not the law.
- Prod-verify recipe (re-confirmed): `curl -L` the page → single
  `index-<hash>.js` entry → dynamic imports use `"./<chunk>.js"` — normalize
  with sed (tr -d '.' eats the extension!) → grep chunks for new object-key
  markers (`guardTicks` etc.).
- ddragoncheck is 168 pins; seat-swap mutant lives in p2pad.js, the rest in
  sim/art. `allyInv` + `flyKnife` + `allyGrip` are the new setup opts; probe
  carries guard/relief/flourish(+jimmy*)/gripFx.
- Both fresh-fix flake patterns this build were fixture geometry, not laws —
  read the failing value before re-probing (rule 8 kept it to one rerun each).

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main (this STATE commit).
- `~/Dev/retrogames-forge-dd-personality` — reaped suggestion: branch gone on
  merge; remove the worktree when convenient (`git worktree remove`).
- Ports: b's 5178 stopped at close (devstop.sh). QA nodes 5174/5176/5179 —
  leave them. Slot a's server — leave it.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private.)
