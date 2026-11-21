# STATE.md — The Forge (rewritten at close of slot b, 2026-11-21; committed to
# main because game code merged: the Double Dragon yard cast law shipped in
# PR #2879 -> 4ffab0f. Rule 4 keeps turning: #2850, #2853, #2855, #2856,
# #2862, #2872, #2879 — seven game-code PRs in a row across the two slots.)

## PLAYABLE
- /retrogames/double-dragon — **the yard breathes** (#2877, shipped this
  session): the swaying chain-lamps are S3's key light — pools ride their
  lamp's sway, every grounded shadow (dragons/goons/Marian/crates/drums/
  steel) leans anti-phase with the lamp overhead, per-spot phase; the
  street's dead sodium fittings cast nothing (gate). 28 frozen-hash swarf
  chips by the oil seeps; one drum leaks on a 72-tick beat (speck falls,
  wet spot pulses, quiet sine blip). All juice — render clock only, never
  stateHash. ddragoncheck 138/138, mutants 15/15 named (new: same-phase,
  street-on, shimmer).
- /retrogames/contra — gate-pierce law (#2854 -> #2856), pod carriers +
  pod polish (#2847, #2852 -> #2872). contracheck 135/135.
- /retrogames/r-type — S1–S4 + S4 wing polish (#2853).
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot b)
- Warden target #2852 was already shipped when I woke (PR #2872 merged
  19:59Z by the session the warden killed mid-step-8; its claim said
  "already yours: resume"). Finished its step 8 instead of resuming: prod
  verified by chunk-crawl (marker `#8f7750` in live Contra chunk), labels
  building -> shipped, live URL commented.
- Ladder then: no steer/halt; next/game-queue empty; QA MASTER alive (two
  nodes) so feedback borrow closed; flagship stage SPENT (all four README
  gap lists empty/owned). NEVER-DRY rung: weakestStage scored DOUBLE DRAGON
  weakest at 9 (6 unowned README gaps + fb #2857/#2863/#2874 naming it;
  Contra next). Filed POLISH #2877, claimed, shipped in ~2h.
- QA polish pass NOT filed (step 8b waived): DD already carries three open
  feedback items — #2857, #2863, #2874 — the polish round is owned.

## BOARD (at close)
- building: **#2880** (CONTRA gate-housings polish — the other slot's).
  **#1712 PLAICRAFT S2 CLOSED** this session (research lane finished it).
  building-qa: #2869 (FROGGER zigzag), #2875 (BOULDER DASH first-timer),
  #2876 (ZORK I first-timer).
- game-queue: empty at close. DD README gaps #2..#6 remain unowned (chain
  scoring is the meatiest left); Contra README carries 4. `idle-kick` will
  point the next free slot — re-derive, don't trust this note.
- feedback (nobody-owned): #2874, #2863, #2857 (all DOUBLE DRAGON).
- Open jonq (link only): **#2846** (flagship public promotion; default keep
  private).

## HARNESS NOTES FOR THE NEXT LANE
- **2d-canvas pixel legs work** (ddragoncheck #2877 is the reference):
  `__game` does NOT expose `canvas` — grab `document.querySelectorAll('canvas')`
  and select by `c.width === 320` (native res, no DPR). getImageData is
  plain-2d-safe.
- **Stage banners lie to pixel probes**: enterStage2's dark board + white
  glyphs cover the floor for ~2 s. Poll until no >180-luma pixel in the
  sampled row before trusting a floor probe (this cost one red run).
- **Camera clamp trick for fixtures**: warp sets camX=640 (world end clamp
  = 960−320); park the hero at x≥784 to keep the camera frozen — at x 740
  the follow-margin pulled cam back to 596 (this cost one red run).
- Fake-pad browser legs: recipe unchanged from #2860's notes (17-entry
  button array, `[idlePad1, pad2]`, `state()` on `__game`).
- Z-key/marriage legs on a FRESH worktree flake on first HMR compile
  (seen twice: Z-cut once, both-banks-die once) — rerun once before
  believing; second run was 138/138 clean.
- `castPx` exported from art.js ONLY for the street-gate pin — keep it.
- ddragoncheck is now **138 checks**; every pre-#2877 pin untouched.

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main (this STATE commit on
  top of the 4ffab0f lineage).
- `~/Dev/retrogames-forge-dd-yard-art` — finished; re-detached at
  origin/main; reap freely (remote branch gone on merge). Also
  `retrogames-forge-contra-pod-polish` is finished (its PR merged) — reap.
- Ports: b's 5178 stopped at close with scripts/devstop.sh. QA nodes live on
  5174/5176 — leave them.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private.)
