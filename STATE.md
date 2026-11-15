# STATE — session 281 (2026-11-15, slot a)

## Playable now / what shipped
- **WWI DOGFIGHT has burst discipline (#2310 → PR #2311, merge `4c468c6`,
  LIVE at /retrogames/dogfight).** The sky finally answers a spray. Air-cooled
  Vickers physics as one rule with three consequences: heat +0.077/round (~13
  to redline, ~1.7 s trigger), −0.006/tick cooling (~5.5 s back to cold), and
  past a soft band (0.25) each round leaves on a **deterministic golden-angle
  cone** `0.045·(heat−0.25)` rad (~7 m across at 250 m — wider than the
  biplane). `predictHit` folds in the SAME deviation + SAME azimuth as the
  spawn, so receipts stay bit-exact: hot barrels stop earning long-range
  approvals. Spray now costs hits, belts and tracers the player can see walk.
  - Determinism intact: deviation = f(own fired counter, heat), never Math.random;
    both patrol wins, slack (−20r/−40m), per-tick ledger and replay hashes are
    **bit-unchanged** — the pilot's ≤2-round bursts never leave the cold band
    (verified `maxHeat 0.077`), so `missed ≤ 3` still means what it always did.
  - Cockpit: `GUNS` heat tape (yellow→orange→red) + overheat toast/tone.
  - Gates: dogfightcheck 83/83 (+HEAT section: cold-straight, spray-reddens,
    cone==sideways-velocity, cone-walks, silence-cools, receipts-dry-hot, pilot
    max-heat pin) with **9 mutants dead** (new: cold-for-ever, stiff-barrel).
    Manual red: no-op the heat-gain line → 4 named fails, restored. dogfightplay
    23/23 (tape 99% red→cooled 0%, ledger exact, zero page errors). lint
    mario/fps/ai + eslint + build green. Prod bundle-verified by signature
    (`index-zrR402Kj.js` carries `BARRELS RED HOT` + `dog-gunheat`, 75 chunks).
- Rule 4: game code shipped. Slot-b also shipped #2307 ArenaArchery during this
  session (`shipped`) — board is clear of `building`.

## Ladder (this session's path)
- Warden target **#2307 claimed-first → REFUSED** (b held it, live checkpoint
  34 min; b then shipped it and it closed `shipped` — correct).
- Normal ladder: no steer; `next` #1711 = PLAICRAFT S1, but its remaining lines
  are **Jon-side** (clap test at /retrogames/claptest, jonq #2305 write key).
  No new human take landed since 2026-11-14T17:36 (store lists the same 7) →
  nothing builder-actionable to grade; left #1711 unclaimed. game-queue EMPTY;
  feedback had nothing claimable; `QA MASTER` live (3 procs) → no borrow.
  Flagship stage spent (SSX/Emberwood/COMET/Myst README gaps all owned) →
  **never-dry rung**: `weakestStage` → WWI DOGFIGHT score 3 (3 unowned README
  gaps, oldest registry among the score-3 tie; ArenaArchery/MissileBattle/
  Homebody skipped as held). Took gap 0, filed #2310, claimed, shipped.

## BOARD at exit
- game-queue EMPTY. building: none. building-qa: none open. feedback: **#2313**
  (QA — WWI DOGFIGHT polish pass, filed this session — the QA lane's next job).
- jonq open: **#2305** (lane:platform, AWAITING — not mine to wait on).
- #1711 `next` — Jon-side remainder unchanged. No halt, no steer.

## Next (slot a or b, in order)
1. Ladder as above; expect never-dry again. DOGFIGHT held no longer (#2310
   closed). Next weakest candidates, score 3, oldest registry first, minus
   whatever lanes claim meanwhile: TEN-DEEP, PRINCE OF PERSIA, GARDEN GUARD,
   VIPER PIT, BRITANNIA, FLOOR BOSS, SHORT ORDER SHOUT, GRAVEL YARD, TALK ME
   DOWN, BOMB DEFUSE.
2. If a jonq answer lands for #2305 (write key), execute the #2093 relabel
   one-off (slot-b's lane). A clap-test take on the store means grade it + post
   to #1711/#2156 (that closes #2156 evidence).

## The session's catches
- **A manual mutant + `git checkout` on an UNCOMMITTED file erases the work.**
  The #2047 lesson, new hat: checkpoint-push every working increment BEFORE
  hand-breaking code, or restore-from-git wipes the very thing you're testing.
  (Caught it the hard way mid-build; recovered by re-applying, then committed.)
- **Deviation must be measured relative to the bore, not a world axis.** A
  red-herring first dogfightcheck red (`perp − sp·dev`) came from comparing the
  sideways velocity against +z while the spawn bore had a non-zero yaw; the
  honest pin removes the axial component along the plane's own `f`.
- **`weakestStage` breaks ties toward the OLDEST registry title**, not highest
  score-then-name; several titles tie at 3 and DOGFIGHT wins on age.

## Hygiene at exit
- Dev server :5173 stopped (mine only; never touched :5178).
- Lane worktree retrogames-forge-dogfight-gun-heat removed after merge (branch
  gone via squash); main checkout re-detached at origin/main `4c468c6`.
- STATE.md committed to main (game code merged — rule 9) + statepark slot a.
