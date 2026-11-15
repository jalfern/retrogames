# STATE — session 297 (2026-11-15, slot b)

## Playable now / what shipped
- **COMET DRIFT GP canyon polish (#2395 → PR #2412, merge `77e0115`).** All six
  items of the #2388 follow-up, live at jalfern.com/retrogames/comet-drift
  (marker `e8ac68` verified in `art-DVVrYLQ3.js`, Vercel success). Renderer-only
  except item 6: (1) near segments break stride 1 (`WALL_STRIDE_NEAR` 520u) —
  faceted crest silhouette gone; (2) pure `wallSun(i,side)` sun-dot law vs
  `SUN_AZ` — warm `pal.sun` wash down-sun, cool `pal.skyTop` up-sun, capped by
  `SUN_TINT`; (3) new named `crest` role in all 4 palettes (ember/white-hot/
  sandy-dune/bleached) driving the rim cap; (4) coal edge (`rgbaS(P.outline,.5)`)
  one step under the crest cap — parallax mesas can't read through wall haze;
  (5) `wallCrack(i,side)` per-index hash pick (~1 in 3) replaces the per-frame
  stride carry that cracked EVERY face (near-face strobe); (6) `GRIT` (sim):
  pinned grind > v 3.6 sheds 2 crack-depth cells at the foot every 4 ticks —
  the pile GROWS between bounces, #1702 flow heals it, pose+tick hash keeps
  banked replays byte-identical, physics-neutral (markCell never touches v).
- Gates: cometcheck **489→502** normal GREEN (pile-growth rig + determinism +
  silent crawl, sun-dot symmetry + lit/shaded lap spread, crack-cadence band,
  crest roles per course, source pins ×6) + 4 new `--mutate` mutants — all die,
  delta vs main baseline exactly +4 expected kill-fails. eslint + mario/fps/ai +
  build green. Polished visual deltas verified with before/after shots at 800×450.
- Parallel lane shipped same evening (not this session): golden traces #2402
  (#2408/#2410, slot a — their report parked 21:58Z), BombDefuse #2363 (#2401),
  Archery play fix #2381 (#2403), Talk-Me-Down README audit #2356 (#2413),
  PLAICRAFT #1711 audit-1 (#2406).

## Ladder (this session's path)
- Warden target **#2402 REFUSED** at claim — slot a held it with a 50-min-old
  live FORGE(a) claim (it shipped mid-evening). Clean ladder: no steer; no
  `next` (after #2402/#1711 churn); game-queue empty; feedback borrow OPEN
  (no live QA MASTER) → **#2395** was the only *actionable* feedback item
  (#2354/#2355 self-declare their gaps owned; #2356 closed by #2413). Ran
  FORGE-QA steps 2–5 as the builder borrow: qa-claim `building-qa`, qa/
  comet-canyon-polish-2395 worktree, reproduced by shots, fixed, gated, shipped
  with Closes.

## BOARD at exit
- building: #1711 (audit chain — stage 1 shipped #2406; re-derive its branch
  liveness fresh at next claim). building-qa: #2387, #2385 (re-derive; they sat
  live at 21:10Z).
- game-queue: empty. `next`: empty.
- feedback open: #2355, #2354 (audit notes, owned — nothing shippable by their
  own text), plus building-qa pairs above.
- jonq open: #2305 (lane:platform, AWAITING until 11-17) — not ours to wait on.

## Next (slot a or b, in order)
1. Ladder as usual. Never-dry → `weakestStage`/`idle.mjs` FRESH; verify the
   picked gap is gameplay before building (#2391 lesson stands; Emberwood &
   Joust are trace-gated now but still gap-list candidates).
2. If jonq #2305 answers → execute the #2093 relabel chain.
3. CometDrift polish pass #2 filed? No — #2395 WAS this game's polish pass; the
   next Comet asks are its README honest-gaps only (edit-track economy etc).

## The session's catches
- **cometcheck `--mutate` is RED on MAIN (99 fails, +1 pre-existing SURVIVED
  #478):** expected-failure assertions during plants accumulate into R.fail with
  no restore — that's house pattern, not a regression. Judge a branch by the
  DIFF vs a base `--mutate` run in a scratch worktree (`worktree add /tmp/…`,
  symlink node_modules), never by its raw tally. My delta: exactly 4 kills.
- **A mutant must isolate ITS law.** First grit mutant (`cracks >= 6` after a
  grind) SURVIVED: chip dashes are also depth 3.5 and 89 bumps wrote plenty.
  Fix: grit = crack-depth deposits on PINNED ticks (wpress≥2) — chips can only
  fire at wpress===1, SAND has no other 3.5 writer (ring 1, crater 3, chip 4.5).
- **GRIT.v sits just above SAND.chipV (3.6 > 3.5)** so the #1718 slow-bump law
  gate stays pristine by the same rock-speed physics (plain-sand hover caps
  ~3.40); measured before shipping, not assumed.
- **Lazy chunks hide prod markers:** CometDrift art lives in `art-*.js`, not the
  entry bundle — BFS entry→dynamic-import refs, or wait `gh pr checks` Vercel
  SUCCESS first. zsh `\S` grep mangles chunk bodies; Node fetch + JS regex.
- mutateguard earns its keep twice: refused --mutate on a dirty tree mid-session
  (commit-first, rerun clean).

## Hygiene at exit
- Dev server 5178 stopped (own pid only); foreign ports untouched.
- qa-2395 + scratch mm-base worktrees removed; branch gone via squash; main
  checkout detached at origin/main. #2395 commented+shipped+closed.
- STATE.md committed to main (game merged this session, rule 9) + parked slot b.

## Open questions
- None new. jonq #2305 (lane:platform) AWAITING until 11-17 — not ours.
