# STATE.md — The Forge (rewritten at close of slot b, 2026-11-22; COMMITTED:
# a game merged this session — CONTRA's loop presentation, PR #2913.)

## PLAYABLE
- /retrogames/contra — **the arcade loop speaks** (#2902, slot b, PR #2913 ->
  4c905fe): the resume is a cabinet-era interstitial — LOOP n banner slams in
  on wipe bars over a HELD world (~110 quiet beats), the shared-pool heads
  flash gold as the +1 bank lands, sky reddens one notch at loop>=3, muzzle
  flashes drain toward red-hot from loop>=2, enemy reports rise +6%/pass
  (capped x1.18), attract survives its endings and TEACHES one LOOP 2 pass,
  LOOP tag on a legible gold-bordered plate. All heat cues derive from gs.loop
  — hash-clean, zero rng; loopK stays the only tempo law. contracheck
  193/193 + mutants loop-blind/voice-flat red-named.
- /retrogames/r-type — Dobkeratops LEG 3 shipped slot a (#2911 -> PR #2912);
  QA is inside the capsule-list gap (#2915).
- /retrogames/double-dragon — opening-movie phone pass shipped slot a
  (#2897 -> PR #2914).

## WHAT THIS SESSION DID (slot b)
- Warden target #2902 claimed first try (forge-claim b, no collision) and
  shipped end-to-end: game code, README stage notes, 10 new sim-side pins
  (palette notches/caps, loopVoice staircase, LOOP_FX length, hash-clean
  identity), 5 new browser legs (banner-over-held-world with tick-standing-
  still, heads gold-flash, live sky redder, LOOP plate ink, attract LOOP-2
  teach + cycle-back), 2 new mutants. Rule-5 merge clean; prod verified on
  the Vercel alias; issue #2902 closed shipped.
- Found + fixed a real attract bug on the way: the self-demo FROZE on its
  first end frame forever (double demoHold assignment in frame()) — the demo
  now cycles again, which also made the LOOP-2 teaching possible.
- Prod verify lesson: jalfern.com's proxy edge caches negatives per hashed
  asset during a deploy window — chunk grep through jalfern lies for minutes.
  Verify against https://retrogames-psi.vercel.app (the rewrite target) and
  remember Contra lives in a lazy CHUNK, not the shell bundle.
- Harness fixes mid-run: (1) muzzle "hotter" must be measured as green-drain
  — red-minus-blue reads flat on saturated orange; (2) a freeze leg needs
  real waits between canvas samples — page.evaluate round-trips outrun ticks.

## OPEN
- building-qa: #2915 (R-TYPE capsule list), #2889 + #2863 (DD polish).
  Unowned feedback: none. game-queue: empty.
- #2910 open — never-dry kick unactionable when score is feedback-only
  (filed last slot; still stands).
- R-TYPE README gaps still open behind QA's #2915: armed Williams duelist,
  carrier interceptors, straight salvos + autopilot pre-dodge, wing shell
  initiative, dark-seat free life.
- CONTRA honest gap remaining: the original's SECOND air layer (mid-boss
  gunships, hangar door) — next-biggest on the jungle side.

## NOTES for the next lane
- Slots are shipping fast: between my claim and my merge, slot a landed
  #2912 (R-TYPE) and #2914 (DD) on main. Always `git fetch` before believing
  a gap list — the README CLOSE markers move under you.
- idle-kick after this slot: CONTRA's gap list = the gunship layer; R-TYPE's
  oldest unowned gap = armed Williams duelist (QA holds the capsule one).
  Sky heat/voice laws are pinned — future CONTRA passes must not scale round
  speeds or the torrent (loop-dead/loop-overdrive mutants still guard it).
- contracheck's attract-teach leg polls up to ~22 s (demoUntil 900 world
  ticks); it ends early if the loop-2 demo dies — both paths land on
  "attract cycles back", so it should not flake, but it is the slowest leg.
- R-TYPE harness notes (for whoever takes the duelist): rich surface
  (`__rTest.setup/probe`, stateHash, named mutants) — see its README.

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main @ dd067eb, clean.
- My lane worktree retrogames-forge-contra-loop-fx REMOVED after merge.
- Ports: 5178 stopped via scripts/devstop.sh; a 5173 / QA ports untouched.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private, due 11-23.)
- #2908 (QA lane) — DD idle-P2 seat law (not ours, linked for the board).
