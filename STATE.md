# STATE.md — The Forge (rewritten at close of session 364, slot a — 2026-11-20;
# committed: DOUBLE DRAGON S1 merged this session — PR #2809, squash efd79e1,
# game code `src/games/DoubleDragon/**` + demos-of-one's-honesty in ddragoncheck.)

## PLAYABLE
- /retrogames/contra — S1..S4 co-op LIVE (unchanged).
- /retrogames/double-dragon — NEW this session: S1 Walnuts Street LIVE on prod
  (verified bundle index-BibHc76X.js, route 200; visibility private until Jon
  promotes, #379). Full belt engine: depth-dodge (|dy| gates every hit),
  punch/kick/jump-kick/stomp, spin back-heel when surrounded, grabs w/
  mash-out, stick pickup, 3 waves + Abobo mini-boss, stage-clear loop.
  ddragoncheck 34/34 + mutant(depth-blind) RED-with-name.
- Studio-side: plaicraft S2 dataset pipeline (#1712); slot b inside S2 polish (#2805).

## WHAT THIS SESSION DID
- Warden target #1712 REFUSED (held by b, live 12 min) -> normal ladder:
  halt ∅ steer ∅ next ∅ game-queue ∅; feedback #2805 held by b; jonq: #2799
  AWAITING (never wait). #2795 CLOSED ANSWERED by Jon: "both flagships starting
  with double dragon" -> executed: filed #2807 (DOUBLE DRAGON) + #2808 (R-TYPE,
  queued behind), claimed #2807, built + shipped S1 (PR #2809, squash efd79e1).
- Red main: nightly 44762398189 failure (nightlybotcheck soak roster missed
  contra) was already fixed on main (#2804) at session start; the re-proving
  nightly 44778290100 was cancelled mid-run (main-ok.sh accepts cancelled),
  and the #2809 merge kicked a fresh nightly that now re-proves the roster fix
  AND double-dragon's new soak entry — glance at it in the morning.
- Shipped game code: sim.js/art.js/index.jsx/README + registry + ddragoncheck
  (+package alias, MANUAL_CHECKS park, contractGames+PATTERNS, nightlybot soak
  — both rosters at once, #1525 law).
- QA polish pass filed: #2810 (feedback) — walk bob, death tumble, Abobo
  charge, ambience, wave legibility, HUD wave tick.

## BOARD
- #2807 stays OPEN (multi-stage — PR says Part of): S2 weapons wall (knives/
  whip/barrels/grab refinements), S3 hideout + Marian, S4 co-op (CPU Jimmy).
- #2808 R-TYPE sits `game-queue` — next free lane takes it (Jon's second
  flagship, queued behind Double Dragon by his own words).
- #1712/#2805 — slot b's. #2798/#2789/#2793 — QA's.
- Rule 4: game-code merges this week #2788/#2791/#2796/#2809 — loop turning.

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2799 (lane:games, AWAITING, deadline 2026-11-22T16:09Z) — friends' takes
  for #1712 human coverage; default = stage stays open, never narrow.
- #2751 (lane:qa) — QA's.

## HARNESS NOTES FOR THE NEXT LANE
- double-dragon is in the nightly soak now: change the pad/contract and change
  BOTH rosters (scripts/lib/contractGames.mjs + scripts/nightlybot.mjs) in the
  same commit (#1525 law — this exact miss reddened main with the Contra merge).
- Pad semantics: A(Space)=JUMP -> sim pad.a; B(KeyX)=KICK -> pad.b;
  C(KeyZ)=PUNCH -> pad.punch (thirdAction held contract #2324). UP/DOWN are
  the DEPTH axis only; sim jumps on pad.a||pad.jump. The autopilot never
  jumps, so bot pad.a is safe.
- Contract `done` = gameover only; the stage-clear loop keeps done=false on
  purpose (600-tick determinism samples ride mid-run).
- ciscope #1575: new aliased checks must be scoped or MANUAL_CHECKS-parked in
  the same commit (ddragoncheck parked — its browser leg needs the dev server).
- main-ok.sh treats a CANCELLED latest-nightly as not-red; if the fresh nightly
  after efd79e1 fails, rule 5a applies (fix, or quarantine naming an open issue).

## WORKTREES
- Main checkout ~/Dev/retrogames: detached at origin/main (this STATE commit's
  parent +1); STATE.md committed here (game merged, so the step-9 exception).
- ~/Dev/retrogames-forge-double-dragon — was reaped by merge bookkeeping
  mid-close (uncommitted STATE vaporized once; recreated). The next lane's
  --delete-branch cleanup may reap it again at any time: keep STATE.md's
  lifetime OUTSIDE the lane dir (park + commit early).
- Port 5173 dev server (slot a) killed at close. Never touch 5176 (QA) or
  5178 (slot b).
