# STATE — session 299 (2026-11-15, slot a)

## Playable now / what shipped
- **EXCITEBIKE: the pack turns solid (#2420 → PR #2433, merge `4b1ac41`).**
  Live at jalfern.com/retrogames/excitebike (markers `PILES IN` + `packK`
  verified in served chunk `index-B9ZtlZvx.js`, Vercel success). Never-dry
  pick (`weakestStage` score 2 — the pack was ghost plastic; #2391 proved
  player-vs-rival contact, nobody had made rivals touch *each other*).
  Engine law in `sim.js`, all constants mirrored from #2391's proven law —
  no invented numbers: rival-vs-rival 8px push, >5px/tick closes wreck
  (struck rider falls **forward**), chain wrecks off downed bodies, rivals
  read the ground (KATO/SONJA hop gates+ramps+oil, IVAN eats oil/stomps
  mud), staggered 14px start grid kills the gate stampede, `held=3` brake
  latch means a blocked rival never creeps through a body, 5×5 pair cooldown
  keeps one drama per pass. Presentation: PILES IN! toast, bump sparks+shake,
  hop dust. Campaign still wins both tracks at rank 1; the pack law costs
  IVAN ~1000 px/race (measured) — that IS the skill gradient.
- Gates: excitecheck **105→127 green** (22 PACK/rival-haz/grid checks) +
  **171/171 mutants** (4 new: packK, haz-reads-off, contactSwap, wreckV) +
  exciteplay PACK browser section (films IVAN's chain + KATO's clean hop) +
  lint:mario/fps/ai + build green.
- Step 8b filed: **#2434** (feedback, lane:qa) — pack *feel*: PILES IN toast
  density, FX count per contact, does the held queue read as patience or a
  stuck AI.

## Ladder (this session's path)
- Warden target **#2419 REFUSED** at claim (slot b live, push fresh — it
  shipped #2424 mid-afternoon). No steer, no `next`, game-queue empty, QA
  borrow blocked (3 QA MASTER sessions live) → flagship gaps all closed →
  never-dry `weakestStage` FRESH → EXCITEBIKE. Filed #2420 then claimed.

## BOARD at exit
- building: **#2428** (BOULDER DASH amoeba variants), **#2427** (MAGIC
  CARPET toward 45 worlds), #1711 (PLAICRAFT S1 — re-derive branch liveness
  fresh at claim). game-queue: empty. `next`/`steer`: empty.
- building-qa: #2430, #2354. QA-polish fresh: **#2434** (EXCITEBIKE pack
  feel). waiting-jon: empty — #2305 answered/closed since slot b's exit.

## Next (slot a or b, in order)
1. #2427 or #2428 are the natural claims (laws warm: yield-law / boulder
   cadence). Verify the pick is still unowned before claiming.
2. Ladder as usual; never-dry → `weakestStage`/`idle.mjs` FRESH, verify the
   picked gap is gameplay before building (#2391 lesson stands).
3. EXCITEBIKE's remaining README gaps need a lane axis the NES never had
   (matched-speed ghost passes, rank reversals) — do NOT re-file as forge
   work without Jon; they're honesty-kept, not forgotten.

## The session's catches
- **A tool-failure streak can make steps *report* success falsely.** This
  session's commit/PR/merge steps each came back green while silently
  unwritten (worktree files reverted to origin/main; `gh pr view` knew of no
  PR). Recovery rule: after every external mutation, verify from the *other
  side* — `git ls-remote` for pushes, `gh pr view` for PRs, prod-chunk
  grep for ships. A contradiction between two green reports is the alarm.
- **Prod hashes ≠ local hashes** (CI build environment differs). Verify a
  live ship by pulling the entry the LIVE html references, extracting its
  chunk list, and grepping chunks for a content marker — never by mapping
  local dist filenames onto prod.
- **A staggered grid re-phases every receipt.** CRASH LEAGUE times, flyby
  counts, bump tallies all shifted when the start spread 14px — re-measure
  and re-pin honestly (corrected a wrong "rank churn" claim mid-session:
  pace lines are monotonic; pack contact costs distance, never positions).

## Hygiene at exit
- Dev server 5173 stopped (own pid only); foreign ports untouched.
- Worktree retrogames-forge-excite-pack removed; branch gone via squash;
  main checkout detached at origin/main. #2420 commented+shipped+closed.
- STATE.md committed to main (game merged this session) + parked slot a.
