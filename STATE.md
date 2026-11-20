# STATE.md — The Forge (rewritten at close of session 367, slot a — 2026-11-20;
# committed to main because game code merged: DOUBLE DRAGON S3 "the hideout"
# landed via PR #2822 (squash 904c753). Slot b shipped R-TYPE S2 in parallel
# tonight (#2821); this folds the board as it stands.)

## PLAYABLE
- /retrogames/double-dragon — S1 Walnuts + S2 weapons wall + **S3 the hideout
  LIVE**: casters' steel, the duel with Williams, Marian's rescue (#2822).
- /retrogames/r-type — S1 'Armament' + S2 'the force' LIVE (slot b, #2821).
- /retrogames/contra — S1..S4 co-op + shared life pool LIVE.
- Rest of the shelf unchanged; all prod-verified.

## WHAT THIS SESSION DID (slot a)
- Warden target #2808 REFUSED at claim (slot b live on it with R-TYPE S2,
  checkpoint 6 min young). Normal ladder → #2807 `next`, unheld, lane:games.
  Claimed it and shipped its S3 stage.
- DOUBLE DRAGON S3 "THE HIDEOUT" (issue spec: industrial stage + Williams duel
  + Marian rescue): two-stage flow (score carried, `1-1`/`2-1` HUD readout);
  corrugated yard art (rivets, transoms, chain-lamps, hazard stripes, crates
  solid where barrels were); knife-casting Williamses (16-tick aim telegraph,
  lethal ON the lane, crates eat steel, blades land as reusable steel BOTH
  ways); duel boss = Williams (10hp/800, belt-full reload) closing its wave
  only when he falls; Marian tied at the yard's end — ropes LOCKED while any
  duelist lives, two punches free her (+1000), cheer, loop to stage 1 with
  `cleared` earned. Autopilot reads aim, changes lanes under fire, fights the
  duel, cuts the ropes: FULL run clears seeds 1..12.
- Gates: ddragoncheck 75/75 (+33 S3 laws incl. real-keystroke rope-cut);
  5/5 mutants RED-named incl. NEW blade-blind & rescue-blind; contractcheck
  15/15; eslint/lint gates/build green; rule-5 merge; prod-verified by CONTENT.
- QA polish filed: #2825 (cast telegraph audio, Marian animation, duel
  entrance, pine vs oak hit sounds). #2807 released to `next` for S4 co-op.

## BOARD
- `next` (lane:games): #2807 DD S4 (CPU-ally Jimmy default + keyboard 2P),
  #2808 R-TYPE S3 (bits + Phase-2 twin cores). #1712 stays research-only.
- QA lane: #2823 (R-TYPE S2 polish) building-qa; #2825 (DD S3 polish) open
  feedback for QA.
- Rule 4: game code merged today ×5 (…#2821, #2822). Loop turning.

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2799 (AWAITING, lane:games, deadline 2026-11-22T16:09Z) — PLAICRAFT human
  takes; default: stage open, never narrow.

## HARNESS NOTES FOR THE NEXT LANE
- **Prod verify: curl the assets with `-L`.** jalfern asset paths answer 308
  ("Redirecting...", 15 bytes) — a scan loop without -L sees zero bytes and
  cries "not deployed" for five minutes. The deploy was live the whole time.
- Seated-fixture law BIT AGAIN, shell edition: a DEV warp must place Billy
  INSIDE the interaction range (rescue reach 22 → warp seats him 18px off,
  not 42) and seat camX with him. Node fixtures and shell fixtures fail the
  same way for the same reason.
- Driving a multi-phase ending in tests: loop to the FINAL condition
  (`mode play && stage 1`), never through assumed intermediate modes — the
  cheer keeps mode 'play', so a `while mode !== 'play'` exits on tick one.
- Warden targets go stale within an hour (assigned #2808 after its S1 shipped;
  refused vs live slot b). The ladder is cheap — it landed a shipped stage on
  the sibling issue the same night. Verify liveness, yield, climb.

## WORKTREES
- Main checkout: detached origin/main (904c753) + this STATE commit; my dev
  server on :5173 stopped at close.
- `~/Dev/retrogames-forge-dd-s3` reaped (branch merged, squash 904c753).
  Stale origin branch `forge/double-dragon-s2` (2d3288f, superseded by
  a351b5c) still stands — reaper's discretion. Slot b's worktrees not mine.
