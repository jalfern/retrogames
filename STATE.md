# STATE — session 298 (2026-11-15, slot b)

## Playable now / what shipped
- **MAGIC CARPET: campaign to 27 worlds (#2419 → PR #2424, merge `fcc1d65`).**
  Live at jalfern.com/retrogames/magic-carpet (marker `THE FARTHEST SKY`
  verified in `index-DBV27Bnp.js`, Vercel success). Never-dry pick
  (`weakestStage` score 2 — oldest-unowned README gap, tie by registry order).
  Growth one of the campaign gap: LEVELS 18→27, arcs seven–nine keep the
  three-atmosphere cycle (27 ≡ 0 mod 3) and the +15 quota/hoard/wizHp ramp;
  **pearls ride +5/world from world 19** — at +4 the tail would demand 93% of
  realistic yield where mid-campaign asks 89% (the #1740 stall policy, now a
  machine pin `quota <= floor(pearls*3.5)` on every world). Nine names closing
  the SKY trio: IRONWOOD, EMBER GULCH, HOARFROST / MOSSVALE, MAGMA WAKE,
  WHITEWALL / HOLLOW GREEN, LAST CINDER, THE FARTHEST SKY. Select/cursor/HUD
  already rode `LEVELS.length` — zero law changes needed; attract tagline only.
- Caps ride the campaign: carpetcheck sweep + DebugKit PROGNOSIS become
  `LEVELS.length * 26000` ticks (old fixed 300k was ~88% eaten by seed 7 at
  eighteen; measured slowest full win at 27 worlds: **508,702 ticks**).
- Gates: carpetcheck **394→395 green** (seed-7 I→XXVII, seed-88, live name
  order seed 3, 60/60 sweep all 27, yield-cap pin, arc-ramp/SKY-trio pin,
  cursor wrap proven GENERICALLY — old ±18 literals would have passed WRONG at
  any other n) + eslint + mario/fps/ai + build green. Mutation proof: drop
  last LEVELS entry → world-table check red, seed clears stay green (mutant
  wins early, #1740 precedent); restored.
- Also shipped here: recalibrated the stale #1746 pan opt-in pin in carpetcheck
  to #2166's NaN-widened `_panner` guard (harness-only, law unchanged; it was
  red on main's suite — nightly doesn't run carpetcheck, static doesn't either,
  so nobody saw it). Regenerated MagicCarpet verification shots (same pattern
  as the #1925 eighteen-worlds PR #2026).

## Ladder (this session's path)
- Warden target **#2411 REFUSED** at claim (slot a live, push 15 min old — it
  shipped mid-session #2416). No steer, no `next`, game-queue empty; feedback
  borrow blocked (3 QA MASTER sessions live: mini, mini2, studio) → flagship
  stage: idle.mjs honest parse shows ALL flagship gaps CLOSED → never-dry
  `weakestStage` fresh → MAGIC CARPET. Filed #2419 (POLISH, game-queue) then
  claimed normally.

## BOARD at exit
- game-queue: **#2427** (MAGIC CARPET toward 45 worlds — filed this session,
  with the honest margin warning + projected sweep cost; grows what the 3.5x
  yield law allows, re-files the rest).
- building: #2420 (EXCITEBIKE pack contact), #1711 (PLAICRAFT S1 — re-derive
  branch liveness fresh at claim). building-qa: #2385. `next`/`steer`: empty.
- jonq open: #2305 (lane:platform, AWAITING until 11-17) — not ours to wait on.
- textfitcheck 269/270 on main: the red is `demo fox` phone-portrait HUD
  overflow — fox untouched by any recent forge PR as far as I can see;
  somebody's inherited advisory, not fixed here.

## Next (slot a or b, in order)
1. #2427 is the natural next claim (same game, laws and pins already warm).
2. Ladder as usual; never-dry → `weakestStage`/`idle.mjs` FRESH, verify the
   picked gap is gameplay before building (#2391 lesson stands).
3. If jonq #2305 answers → execute the #2093 relabel chain.

## The session's catches
- **A stale source-pin lies quietly off-CI.** carpetcheck's #1746 pin demanded
  `if (pan === null) return null`; #2166 had already widened it with
  `|| !isFin(pan)` — red on main's local suite for days because neither
  static nor nightly runs carpetcheck. Pin a LAW, not a literal, when you can
  (the new yield/ramp pins check algebra, not text).
- **SIGKILL eats the stdout buffer.** The mutation-run kill at 80 s flushed
  only the first FAIL line; the rest of the red list died with the process.
  Judge a killed run by what flushed, and make README claims match what you
  actually saw (report what happened, not what should have).
- **`git diff <commit>` is diff-to-WORKTREE, not to HEAD.** My "commit
  contains PNGs" scare was that — `git show --stat HEAD` proved the commit
  clean; the PNGs were carpetcheck regenerating verification shots after the
  commit. Browser passes rewrite tracked shots: commit them after the run,
  never stage while one is live (#2047 class).
- **+4 pearls couldn't reach 27 honestly.** Tails are where economy laws bite:
  margin shrinks ~1 pt/world, so the yield law decided the table, and the
  README now says so.

## Hygiene at exit
- Dev server 5178 stopped (own pid only); foreign ports (5173/5174/5176/5179)
  untouched.
- Worktree retrogames-forge-carpet-27worlds removed; branch gone via squash;
  main checkout detached at origin/main. #2419 commented+shipped+closed.
- STATE.md committed to main (game merged this session, rule 9) + parked slot b.

## Open questions
- None new. jonq #2305 (lane:platform) AWAITING until 11-17 — not ours.
