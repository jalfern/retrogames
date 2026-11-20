# STATE.md — The Forge (rewritten at close of session 367, slot b — 2026-11-20;
# committed to main because game code merged: R-TYPE S2 "the force" shipped via
# PR #2821 (squash d92be0e), stage 2 of 4 on #2808.)

## PLAYABLE
- /retrogames/r-type — **S2 the force LIVE tonight**: S.E.E.D. pod (blue
  capsule capture, plugs bullets AND hunters, rams soft Bydo, B deploy/park/
  recall, armour refuses it, wall grinds a parked one, death burns an
  attached one) + LASER charge arm (VULCAN→LASER→WAVE cycle, tiered
  piercing lance). S1 + the #2820 polish live since earlier today.
- /retrogames/double-dragon — S1 + S2 weapons wall live (#2816). Contra
  S1..S4 live. Rest of the shelf unchanged.

## WHAT THIS SESSION DID (slot b, warden target #2808)
- Claimed #2808 (claim passed first try; "already yours: resume it").
- Shipped stage S2 per the issue: pod states attached/fly/park/return, the
  plug, the ram (soft Bydo only — hull-plates clamp the shell, never a
  crossing), the grind, death-drop; laser charge-and-release (the issue's
  wording — arcade-hold belonged to Wave, disagreement noted in the design
  comment, issue wins).
- Mid-build main moved under me: slot a shipped QA #2818 (R-TYPE S1 polish,
  PR #2820). README-only conflict; rebased, both law sets green: rtypecheck
  61/61 (my 51 + their 10 polish), contractcheck 769/769, mutants
  `armour-blind p1 core` + `pod-blind` named RED. Rule-5 merge; prod
  verified by content marker (POD/B + S.E.E.D. text in index-DFatbHxE.js)
  + live headless drive (canvas paints, tap starts, zero errors).
- #2808 released to `next` (S3 bits+Phase-2 next). QA polish for S2 filed:
  #2823. Rule 4: game code merged today by this lane: #2821. Loop turning.

## BOARD
- #2808 next — R-TYPE S3: bits + shield formation, Phase-2 twin-core boss.
- #2807 next — DOUBLE DRAGON S3: hideout + Marian.
- QA lane's: #2823 (R-TYPE S2 polish — NEW), #2819 (DD S2 polish) — never
  builder. #2818 shipped (#2820).
- #1712 building (research lane) — open question #2799 AWAITING.
- #2800 CLOSED — nightly green all session (main-ok passed at merge).

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2799 (AWAITING, lane:games, deadline 2026-11-22T16:09Z) — PLAICRAFT human
  takes; default: stage open, never narrow.

## HARNESS NOTES FOR THE NEXT LANE
- PRESS-VERBS NEED A SHELL LATCH (this session's law): a bot's
  keyboard.press completes inside one 16ms sim tick — a level-read pad misses
  it entirely. R-TYPE pods `podQ` in index.jsx (Double Dragon's kick-queue
  pattern); edge detection lives in the sim (gs.bHeld). Any new B-button game
  copies BOTH halves or its pad works for humans only.
- `Date.now() >> n` OVERFLOWS: >2^31 ms shifts to negative int32 →
  SPR[frame] undefined → drawImage throws every single frame (the pod-ball
  crash). Use Math.floor(Date.now()/ms) % frames.
- Charge arms starve dead-held keys: with LASER/WAVE in hand, a browser test
  that holds Space forever never fires. The Phase-1 shell leg now PULSES
  (down 250ms / up 120ms). Any future charge weapon must pulse there too.
- Multi-stage issues: stage ships KEEP the issue open — swap `building`→`next`
  at ship time and name the next stage in the shipped comment (done for #2808).
- #2820-vs-#2821 was the benign collision shape: QA lane polished S1 while
  builder built S2 in the same files; different regions merged clean, only
  README conflicted. Keep polish issues stage-named so overlap is predictable.
- Liveness law unchanged: holder = newest `^(QA|FORGE) \(slot\): claimed|
  checkpoint` <90 min; every pushed commit gets its issue line.

## WORKTREES
- Main checkout: detached origin/main; STATE.md committed per rule 9 (ship).
- `~/Dev/retrogames-forge-r-type-s2` — re-detached at origin/main at close;
  branch `forge/r-type-s2` deleted at merge.
- `~/Dev/retrogames-forge-double-dragon-s2` — re-detached (slot a's lineage);
  not this lane's to reap. Legacy horse/carpet/viper/qa-* trees — untouched.
- Slot b dev server (5178) stopped at close; never touched other ports.
