# STATE — forge board snapshot (slot a, 2026-11-23 — the wheel closes)

## This session — SHIPPED
- **#3060 CONTRA — BARRIER capsule** (PR #3063, squash-merged): the wheel's
  fifth letter, rare cyan capsule granting a 6 s per-seat shield that eats
  enemy rounds (0 `gs.r` on the new entity lane; hazard-over-shield kept;
  shield dies with the seat, the falls, and the loop boundary). Sweep: 12/12
  autopilot clears; vs pre-barrier `origin/main` all 12 seeds clear, 11 win on
  the identical tick with score exactly +1000×captures, `gs.r` frozen — seed 2
  runs ~80 ticks earlier because the ring ate a live grenade whose blast would
  have spared something alive (the law's real cost, disclosed in README+PR).
  Rebased over slot b's #3062 (union resolutions in index.jsx imports, README
  lists, section order). The never-dry fifth rung this week on the same kick —
  the dry-shelf call in slot b's hand now stands five deep; read it hard.
- **Two side fixes the sweep found** (shipped inside the same PR):
  1. #2814 downed-seat vine softlock — a hero who goes DOWN mid-vine is now
     released by the vine, the torrent stops drowning a corpse every tick
     (`!p.out`), and camera+arena gate hand off to whoever still stands
     (mutants `down-hangs`, `corpse-key`).
  2. The capsule-lane seed jitter `(seed^const)>>>21` was constant across
     the harness's low-bit seed set → high-bit harvest after multiply; the
     lane is genuinely seed-keyed now (pinned by leg).
- Honest disclosure shipped in README+PR: seed 2 runs ~80 ticks earlier with
  the shield live — the ring ate a live grenade whose blast would have spared
  something alive. That is the law's real cost, stated not hidden (the
  byte-equality claim is 11/12 seeds + score-exactness, not 12/12 ticks).

## PLAYABLE on main right now
- `/retrogames/contra` (**BARRIER #3060**, TOP SOLDIERS board #3061, popups
  #3057, seat carry #3056, stage bed #3047/#3052, CONTINUE #3042, extend
  #3041, Konami #3037, duck #3038, somersault #3035, voice #3000, sorties
  #2917, loop #2894), `/retrogames/minesweeper`, `/retrogames/double-dragon`,
  `/retrogames/floor-boss`, `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close
- steer/next/game-queue/building empty; #3060 closed shipped. #2971 stays
  waiting-jon (phone take — only Jon closes). Unlabeled #3014/#838/#2827
  wait for Jon's labels.
- QA MASTER sessions live; QA borrow off.

## Notes for the next hand
- The dry-shelf call from slot b's hand has now fired five times on the same
  kick (#3056, #3057, #3061, this #3060, plus the #3061 hall). The letter
  argument was "the README spec says four guns" — the wheel says five. A
  SIXTH rung on that source is the STOP shape: pick a different stage or
  file a jonq question instead of shipping another -1 rung.
- BARRIER opened a lane of its own for future rare capsules: the mark-not-
  erase law (absorbed rounds stay in `gs.eb` marked `eatP/eatQ` so the
  autopilot's stream cannot move) is the pattern; a new pickup that deletes
  entities from the tables WILL re-time seeds and break the sweep.
- #3035 live somersault leg flaked once again under lane load (passed on the
  rerun; same Mac class as before — CI never reddened it).
- A latent #2814 softlock (downed-seat vine / camera-anchor hostage) shipped
  fixed; its two mutants are the shelf's first stage-handoff proofs — worth
  recalling when any seat-down law changes.

## Slots / ops
- Slot a dev server 5173 stopped via `scripts/devstop.sh` at close; plumbing
  `~/Dev/retrogames` detached at origin/main; lane worktree
  `retrogames-forge-contra-barrier` pruned post-merge (branch gone).
- STATE.md committed to main — slot a merged PR #3063 this session.
- Two-lane merge dance worked again: rebase-over-the-sibling by union (never
  --theirs/--ours wholesale when both features add list items).

## Open questions
- #3053 (never-dry kick dedupe across slots — default: yield to main),
  #3054 (QA recorder question, lane:qa), #2971 (waiting-jon phone take).
  Live board: https://jalfern.com/retrogames/forge
